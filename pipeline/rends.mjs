#!/usr/bin/env node
/**
 * rends.mjs — du plan au fichier.
 *
 * Deux passes, et c'est volontaire :
 *
 *   1. **Remotion** produit un master plat, en qualité maximale. Pas
 *      d'étalonnage, pas de normalisation sonore : uniquement le montage.
 *   2. **ffmpeg** applique la LUT, normalise le son à −14 LUFS et encode.
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
import { ffmpeg, sonde, accelerationNvidia } from './lib/ffmpeg.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run rends -- <slug> [options]

  --extrait=0-150     ne rend que ces images (contrôle rapide)
  --brouillon         moitié de définition, sans finition — pour vérifier vite
  --sans-finition     garde le master plat, sans LUT ni normalisation
  --lut=nom.cube      surcharge la LUT de la chaîne
  --debit=12M         débit vidéo de la passe finale
  --threads=4         fils de rendu (0 ou absent = automatique)

Sortie : videos/<slug>/06-rendu/<slug>.mp4
`
)

await principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug de la vidéo à rendre.`)

  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  if (!plan) {
    throw new Error(
      `Aucun plan de montage pour « ${slug} ».\nLance d'abord : npm run monte -- ${slug}`
    )
  }

  assureDossier(v.rendu)
  const master = path.join(v.rendu, `${slug}.master.mp4`)
  const final = path.join(v.rendu, `${slug}.mp4`)
  const brouillon = drapeau(options, 'brouillon')

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
    `Finition : ${lut && fs.existsSync(lut) ? 'étalonnage + ' : ''}normalisation −14 LUFS · ` +
      `${nvenc ? 'encodage matériel' : 'encodage processeur'}`
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
    // Cible commune à YouTube, Instagram et TikTok. Les plateformes normalisent
    // de toute façon ; autant livrer déjà au bon niveau.
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    final,
  ])

  const info = await sonde(final)
  const poids = fs.statSync(final).size / 1e6

  journal.titre('Terminé')
  journal.ok(
    `${path.relative(CHEMINS.racine, final)} · ${duree(info.dureeS)} · ` +
      `${poids.toFixed(1)} Mo · ${info.largeur}×${info.hauteur}`
  )
  journal.detail(
    `Rendu ${duree(tempsRendu)} + finition ${duree((Date.now() - debutFinition) / 1000)}`
  )
  console.log('')
  journal.detail(`Prépare la mise en ligne : /publie ${slug}`)
})
