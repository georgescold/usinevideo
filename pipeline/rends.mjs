#!/usr/bin/env node
/**
 * rends.mjs — du plan au fichier.
 *
 * Deux passes, et c'est volontaire :
 *
 *   1. **Remotion** produit un master plat, en qualité maximale. Pas
 *      d'étalonnage, aucun traitement sonore : uniquement le montage.
 *   2. **ffmpeg** applique la LUT et encode. Le son passe sans etre touche.
 *
 * Pourquoi séparer : Remotion n'a pas de filtre LUT, et son ffmpeg embarqué est
 * volontairement minimal — ni `lut3d`, ni encodage matériel. Le ffmpeg du
 * système fait les deux, et l'accélération NVIDIA divise le temps par cinq.
 *
 * On passe par l'API de Remotion plutôt que par sa ligne de commande : la
 * progression est exploitable telle quelle, et il n'y a pas de sortie texte à
 * analyser pour savoir si ça s'est bien passé.
 *
 *   npm run rends -- mon-slug
 *   npm run rends -- mon-slug --extrait=0-150 --brouillon
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { bundle } from '@remotion/bundler'
import { selectComposition, renderMedia } from '@remotion/renderer'
import {
  CHEMINS,
  dossierVideo,
  litJson,
  litChaine,
  assureDossier,
  env,
  envNombre,
} from './lib/chemins.mjs'
import { journal, duree, progression } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { ffmpeg, sonde, accelerationNvidia, mesureSonie, verdictSonie } from './lib/ffmpeg.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run rends -- <slug> [options]

  --extrait=0-150     ne rend que ces images (contrôle rapide)
  --brouillon         moitié de définition, sans finition — pour vérifier vite
  --sans-finition     garde le master plat, sans LUT ni réencodage
  --lut=nom.cube      surcharge la LUT de la chaîne
  --debit=12M         débit vidéo de la passe finale
  --threads=4         fils de rendu (0 ou absent = automatique)
  --sortie=<chemin>   écrit ailleurs que dans le master de la vidéo
                      (obligatoire pour un essai : sinon il écrase le rendu)

Sortie : videos/<slug>/06-rendu/<slug>.mp4
`
)

await principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug de la vidéo à rendre.`)

  // CHAQUE RENDU A SON PROPRE DOSSIER TEMPORAIRE.
  //
  // Deux rendus lancés en parallèle se marchaient dessus dans le temporaire
  // système : le premier à finir nettoyait des fichiers que le second était en
  // train d'écrire, et celui-ci mourait au mixage audio — « Error opening
  // output … remotion-audio-mixing ». L'échec passait inaperçu, et on jugeait
  // ensuite une planche issue du rendu précédent.
  //
  // Isoler le temporaire par processus règle le problème à la racine, et rend
  // le parallélisme non seulement sûr mais souhaitable : deux vidéos, deux
  // variantes d'identité, deux formats — tout peut tourner en même temps.
  const tempPropre = path.join(os.tmpdir(), `rendu-${slug}-${process.pid}`)
  fs.mkdirSync(tempPropre, { recursive: true })
  for (const v of ['TMPDIR', 'TMP', 'TEMP']) process.env[v] = tempPropre
  // LE NETTOYAGE NE DOIT JAMAIS MASQUER L'ERREUR QU'IL SUIT.
  //
  // Il tournait sans garde dans le gestionnaire de sortie. Sous Windows,
  // Chromium garde parfois un descripteur ouvert sur un fichier d'actif une
  // fraction de seconde apres la fin du rendu : `rmSync` levait alors EBUSY,
  // et cette exception-la remplacait a l'ecran la vraie cause de l'echec.
  // On nettoie au mieux, on ne se plaint pas : un dossier temporaire oublie
  // coute quelques megaoctets, un message d'erreur perdu coute une heure.
  const nettoieTemp = () => {
    try {
      fs.rmSync(tempPropre, { recursive: true, force: true })
    } catch {
      /* le systeme le reprendra ; ce n'est pas une raison d'echouer */
    }
  }
  process.on('exit', nettoieTemp)

  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  if (!plan) {
    throw new Error(
      `Aucun plan de montage pour « ${slug} ».\nLance d'abord : npm run monte -- ${slug}`
    )
  }

  assureDossier(v.rendu)
  const brouillon = drapeau(options, 'brouillon')

  // UN ESSAI NE DOIT JAMAIS ÉCRASER LE MASTER.
  //
  // Sans `--sortie`, un rendu d'extrait écrivait dans le fichier final de la
  // vidéo : quatre variantes d'identité rendues à la suite, et le master d'une
  // heure de travail était remplacé par cinq secondes de brouillon. Seule la
  // copie de sauvegarde l'avait rattrapé — par chance, pas par conception.
  const sortie = options.sortie
    ? path.isAbsolute(options.sortie)
      ? options.sortie
      : path.join(CHEMINS.racine, options.sortie)
    : null
  const master = sortie
    ? sortie.replace(/\.mp4$/i, '.master.mp4')
    : path.join(v.rendu, `${slug}.master.mp4`)
  const final = sortie ?? path.join(v.rendu, `${slug}.mp4`)
  if (sortie) assureDossier(path.dirname(sortie))

  journal.titre(`Rendu · ${slug}`)
  journal.info(
    `${duree(plan.dureeFrames / plan.fps)} · ${plan.largeur}×${plan.hauteur} · ` +
      `${plan.dureeFrames} images à ${plan.fps} i/s`
  )

  // ----------------------------------------------------- passe 1 : Remotion --
  const debut = Date.now()

  journal.info(`Préparation du projet…`)
  // Le dossier public est propre à cette vidéo : il ne contient que la piste
  // image, la voix, les polices et le B-roll de ce rendu-là. Remotion recopie
  // le dossier public à chaque construction — y laisser les rushes d'origine
  // reviendrait à recopier des gigaoctets pour rien.
  const paquet = await bundle({
    entryPoint: CHEMINS.remotionEntree,
    publicDir: path.join(v.montage, 'public'),
    onProgress: (p) => progression(p, 100, 'préparation'),
  })

  const inputProps = { plan }
  const composition = await selectComposition({
    serveUrl: paquet,
    id: 'Montage',
    inputProps,
  })

  const extrait = options.extrait
    ? String(options.extrait).split('-').map(Number)
    : null
  const concurrence = nombre(options, 'threads', envNombre('RENDU_CONCURRENCE', 0))

  let dernier = -1
  await renderMedia({
    composition,
    serveUrl: paquet,
    codec: 'h264',
    outputLocation: master,
    inputProps,
    // Qualité maximale en sortie de Remotion : c'est un intermédiaire, il sera
    // réencodé. Économiser ici ne se rattrape plus après.
    crf: brouillon ? 28 : 16,
    jpegQuality: brouillon ? 70 : 95,
    scale: brouillon ? 0.5 : 1,
    colorSpace: 'bt709',
    frameRange: extrait ? [extrait[0], extrait[1] ?? plan.dureeFrames - 1] : null,
    concurrency: concurrence > 0 ? concurrence : null,
    chromiumOptions: { gl: 'angle' },
    logLevel: 'error',
    onProgress: ({ progress }) => {
      const pc = Math.round(progress * 100)
      if (pc !== dernier) {
        dernier = pc
        progression(pc, 100, 'rendu')
      }
    },
  })

  const tempsRendu = (Date.now() - debut) / 1000
  journal.ok(`Master rendu en ${duree(tempsRendu)}`)

  // ------------------------------------------------------ passe 2 : finition -
  if (brouillon || drapeau(options, 'sans-finition')) {
    if (fs.existsSync(final)) fs.rmSync(final)
    fs.renameSync(master, final)
    journal.ok(`${path.relative(CHEMINS.racine, final)} (sans finition)`)
    return
  }

  const chaine = litChaine()
  const nomLut = options.lut || chaine?.identite_visuelle?.lut || null
  const lut = nomLut ? path.join(CHEMINS.luts, nomLut) : null
  if (lut && !fs.existsSync(lut)) {
    journal.attention(`LUT introuvable : ${path.relative(CHEMINS.racine, lut)} — passe ignorée.`)
  }

  const nvenc = env('RENDU_ACCEL', 'auto') !== 'off' && (await accelerationNvidia())
  journal.info(
    `Finition : ${lut && fs.existsSync(lut) ? 'étalonnage · ' : ''}` +
      `${nvenc ? 'encodage matériel' : 'encodage processeur'} · son inchangé`
  )

  const filtres = [
    lut && fs.existsSync(lut)
      ? `lut3d=file='${lut.replace(/\\/g, '/').replace(/:/g, '\\:')}':interp=tetrahedral`
      : null,
    'format=yuv420p',
  ]
    .filter(Boolean)
    .join(',')

  const debit = options.debit || '12M'
  const encodage = nvenc
    ? [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'hq',
        '-rc', 'vbr',
        // NVENC parle en `-cq`, jamais en `-crf`.
        '-cq', '20',
        '-b:v', debit,
        '-maxrate', '16M',
        '-bufsize', '24M',
      ]
    : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18']

  // LA VERSION PRÉCÉDENTE SURVIT À CELLE-CI.
  //
  // Écraser le master à chaque rendu rend toute comparaison impossible : on ne
  // peut plus vérifier qu'un changement a bien amélioré les choses, ni revenir
  // sur une version qui convenait. Une génération conservée suffit, et ne coûte
  // qu'un fichier.
  if (!sortie && fs.existsSync(final)) {
    const precedent = path.join(v.rendu, `${slug}.precedent.mp4`)
    fs.rmSync(precedent, { force: true })
    fs.renameSync(final, precedent)
  }

  const debutFinition = Date.now()
  await ffmpeg([
    '-i', master,
    '-vf', filtres,
    ...encodage,
    '-profile:v', 'high',
    '-bf', '3',
    '-g', String(plan.fps * 2),
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    // AUCUN FILTRE AUDIO ICI. Le son sort du montage tel qu'il y est entre.
    //
    // Il y avait une normalisation a -14 LUFS, la cible commune de YouTube,
    // Instagram et TikTok. Elle est retiree : les plateformes ramenent de toute
    // facon chaque video a leur propre cible, et normaliser en amont ne fait
    // qu'ajouter une compression de dynamique dont personne n'a besoin. La
    // sonie reste MESUREE plus bas, et annoncee — mesurer n'est pas modifier.
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    final,
  ])

  const info = await sonde(final)
  const poids = fs.statSync(final).size / 1e6

  // UNE PLANCHE DE HUIT IMAGES, À CHAQUE RENDU.
  //
  // On ne rend jamais à l'aveugle. Un défaut visuel — un texte qui déborde, un
  // plan figé, une infographie recouverte — ne se voit pas dans les journaux : il
  // se voit à l'image. Huit vignettes réparties sur la durée coûtent deux
  // secondes et attrapent la plupart des accidents avant qu'on ne regarde la
  // vidéo entière.
  const planche = path.join(v.rendu, sortie ? `.essai-planche.jpg` : `${slug}-planche.jpg`)
  const pas = info.dureeS / 9
  await ffmpeg([
    '-i', final,
    '-vf', `select='not(mod(n\\,${Math.max(1, Math.round(pas * plan.fps))}))',scale=270:-1,tile=4x2`,
    '-frames:v', '1',
    '-q:v', '3',
    planche,
  ])

  // ON NE REND JAMAIS SANS MESURER LE FICHIER PRODUIT.
  //
  // Le son n'est plus normalisé : la mesure ne verifie donc plus qu'une cible
  // a ete atteinte, elle dit ce qui sort. C'est la seule mesure qui compte,
  // puisque c'est ce fichier-la que la plateforme lira — et elle annonce de
  // combien la plateforme le remontera.
  const verdict = verdictSonie(await mesureSonie(final))

  journal.titre('Terminé')
  journal.ok(
    `${path.relative(CHEMINS.racine, final)} · ${duree(info.dureeS)} · ` +
      `${poids.toFixed(1)} Mo · ${info.largeur}×${info.hauteur}`
  )
  journal.detail(
    `Rendu ${duree(tempsRendu)} + finition ${duree((Date.now() - debutFinition) / 1000)}`
  )
  for (const ligne of verdict.lignes) journal.detail(ligne)
  if (!verdict.ok) journal.attention('Vrai pic trop haut : risque de distorsion à la publication.')
  console.log('')
  journal.detail(`Prépare la mise en ligne : /publie ${slug}`)
})
