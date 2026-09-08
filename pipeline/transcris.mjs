#!/usr/bin/env node
/**
 * transcris.mjs — les mots et leurs temps, en local et gratuitement.
 *
 * Deux modes :
 *   - libre : on ne connaît pas le texte, whisper l'écrit ;
 *   - calé sur le script : on connaît le texte, whisper ne donne que les temps
 *     et l'orthographe reste celle du script. C'est le mode par défaut dès
 *     qu'un `01-script.json` existe, et c'est ce qui évite des sous-titres
 *     approximatifs.
 *
 *   npm run transcris -- videos/mon-slug
 *   npm run transcris -- chemin/vers/fichier.mp4 --libre
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, dossierVideo, ecritJson, litJson, env } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { transcris, aligne, etat } from './lib/whisper.mjs'
import { sonde } from './lib/ffmpeg.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run transcris -- <slug de vidéo | fichier> [options]

  --libre            transcription libre, même si un script existe
  --modele=<m>       tiny | base | small | medium | large-v3-turbo | large-v3
                     Mesuré le 8 septembre 2026 sur 897 mots réels :
                       large-v3-turbo  96,8 %  12,9 s   ← le défaut
                       medium          94,6 %  20,5 s
                       large-v3        77,5 % 482,9 s   ← saute des passages
  --defaut=<m>       retient ce modèle pour la CHAÎNE, sans rien transcrire
  --langue=fr
  --srt              écrit aussi un .srt à côté
  --refais           ignore le résultat déjà en cache

Sortie : videos/<slug>/04-transcript.json
`
)

/** Les modèles que whisper.cpp sait télécharger. */
const MODELES = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3', 'large-v2', 'large-v1']

await principal(async () => {
  // LE MODÈLE DE LA CHAÎNE SE POSE PAR COMMANDE, PAS EN ÉDITANT UN FICHIER.
  //
  // Il vivait dans `.env`, qui ne s'ouvre qu'à la main — c'est-à-dire nulle
  // part, puisque le §2 dit que rien ne se tape. `config/chaine.json` a ses
  // commandes et ses écrans : la qualité de transcription y devient une
  // décision de chaîne, réglable là où l'on travaille.
  if (options.defaut !== undefined) {
    const m = String(options.defaut)
    if (!MODELES.includes(m)) {
      throw new Error(`Modèle inconnu « ${m} ». Connus : ${MODELES.join(', ')}.`)
    }
    const chemin = path.join(CHEMINS.config, 'chaine.json')
    const chaine = litJson(chemin, {})
    chaine.transcription = { ...(chaine.transcription ?? {}), modele: m }
    ecritJson(chemin, chaine)
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, modele: m }, null, 2))
      return
    }
    journal.ok(`Modèle de transcription de la chaîne : « ${m} ».`)
    journal.detail(`Les prochaines transcriptions l'emploieront. Les anciennes ne bougent pas.`)
    return
  }

  const cible = positionnels[0]
  if (!cible) throw new Error(`Donne un slug de vidéo ou un chemin de fichier.`)

  const e = await etat()
  journal.detail(
    `whisper ${e.version} · modèle ${options.modele || e.modele}` +
      (e.gpuActif ? ` · ${e.gpu}` : e.gpu ? ` · processeur (WHISPER_GPU=true pour utiliser ${e.gpu})` : '')
  )

  // Slug de vidéo, ou fichier isolé ?
  const dossierPossible = path.join(CHEMINS.videos, cible.replace(/^videos[\\/]/, ''))
  const estVideoDuProjet = fs.existsSync(dossierPossible)

  let fichier
  let sortie
  let script = null

  if (estVideoDuProjet) {
    const slug = path.basename(dossierPossible)
    const v = dossierVideo(slug)
    sortie = v.transcript
    script = litJson(v.scriptJson, null)

    // La voix finale prime sur les rushes : c'est elle qu'on entendra, donc
    // c'est sur elle qu'il faut caler les sous-titres.
    const candidats = [
      path.join(v.audio, 'voix-finale.wav'),
      path.join(v.audio, 'voix.wav'),
      ...(fs.existsSync(v.tournage)
        ? fs
            .readdirSync(v.tournage)
            .filter((f) => /\.(mp4|mov|mkv|webm|wav|mp3|m4a)$/i.test(f))
            .sort()
            .map((f) => path.join(v.tournage, f))
        : []),
    ]
    fichier = candidats.find((c) => fs.existsSync(c))
    if (!fichier) {
      throw new Error(
        `Aucun média trouvé pour « ${slug} ».\n` +
          `Dépose tes rushes dans ${path.relative(CHEMINS.racine, v.tournage)}.`
      )
    }
  } else {
    if (!fs.existsSync(cible)) throw new Error(`Fichier introuvable : ${cible}`)
    fichier = cible
    sortie = cible.replace(/\.[^.]+$/, '') + '.transcript.json'
  }

  if (fs.existsSync(sortie) && !drapeau(options, 'refais')) {
    const cache = litJson(sortie)
    journal.ok(
      `Déjà transcrit : ${cache.mots?.length ?? 0} mots. ` +
        `Relance avec --refais pour recommencer.`
    )
    return
  }

  const info = await sonde(fichier)
  journal.titre(`Transcription de ${path.basename(fichier)}`)
  journal.detail(`${duree(info.dureeS)} · ${info.codecAudio ?? 'sans piste audio'}`)
  if (!info.aDuSon) throw new Error(`Ce fichier n'a pas de piste audio.`)

  const opts = {
    modele: options.modele || null,
    langue: options.langue || null,
  }

  const texteDuScript =
    script && !drapeau(options, 'libre')
      ? script.blocs.map((b) => b.texte).join(' ')
      : null

  const debut = Date.now()
  const resultat = texteDuScript
    ? await aligne(fichier, texteDuScript, opts)
    : await transcris(fichier, opts)

  const donnees = {
    fichier: path.relative(CHEMINS.racine, fichier),
    mode: texteDuScript ? 'calé sur le script' : 'libre',
    langue: resultat.langue,
    modele: resultat.modele,
    dureeAudioS: info.dureeS,
    genereLe: new Date().toISOString(),
    mots: resultat.mots,
    texte: resultat.texte ?? resultat.mots.map((m) => m.texte).join(' '),
  }
  ecritJson(sortie, donnees)

  journal.ok(
    `${donnees.mots.length} mots · mode ${donnees.mode} · ` +
      `${duree((Date.now() - debut) / 1000)} de calcul`
  )

  // LE PLAN PORTE SA PROPRE COPIE DES MOTS, ET IL FAUT LA REMETTRE D'ACCORD.
  //
  // C'est elle que Remotion lit. Retranscrire sans y toucher laisserait le
  // rendu afficher l'ANCIEN texte, sans que rien ne le dise — le même piège que
  // `texte.mjs` désamorce déjà après chaque correction.
  //
  // ON REMPLACE LES MOTS, ET RIEN D'AUTRE. Les plans de coupe, les coupes, le
  // thème et les événements gardent leurs instants : l'audio n'a pas changé,
  // donc ils sont toujours à leur place. Refaire le montage entier pour mettre
  // un texte à jour ferait repartir trente recherches d'images et retéléchargerait
  // autant de clips — pour un mot corrigé.
  if (estVideoDuProjet) {
    const v = dossierVideo(path.basename(dossierPossible))
    if (fs.existsSync(v.plan)) {
      const plan = litJson(v.plan, null)
      if (plan && Array.isArray(plan.mots)) {
        const avant = plan.mots.length
        plan.mots = donnees.mots
        // Écriture par fichier temporaire puis renommage : un plan à moitié
        // écrit fait échouer le rendu bien plus tard, sans dire pourquoi.
        const temporaire = `${v.plan}.temporaire`
        ecritJson(temporaire, plan)
        fs.renameSync(temporaire, v.plan)
        journal.detail(`Plan de montage remis d'accord : ${avant} → ${plan.mots.length} mots.`)
      }
    }
  }

  if (drapeau(options, 'srt')) {
    const srt = versSrt(donnees.mots)
    fs.writeFileSync(sortie.replace(/\.json$/, '.srt'), srt, 'utf8')
    journal.detail(`SRT écrit à côté — à corriger à la main avant de l'envoyer sur YouTube.`)
  }

  console.log('')
  journal.detail(path.relative(CHEMINS.racine, sortie))
})

/** SRT en pages de 7 mots : lisible par un humain, et indexable par YouTube. */
function versSrt(mots, motsParLigne = 7) {
  const t = (ms) => {
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
    const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0')
    const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
    const c = String(ms % 1000).padStart(3, '0')
    return `${h}:${m}:${s},${c}`
  }
  const lignes = []
  for (let i = 0; i < mots.length; i += motsParLigne) {
    const groupe = mots.slice(i, i + motsParLigne)
    lignes.push(
      `${lignes.length + 1}\n` +
        `${t(groupe[0].debutMs)} --> ${t(groupe[groupe.length - 1].finMs)}\n` +
        groupe.map((m) => m.texte).join(' ') +
        '\n'
    )
  }
  return lignes.join('\n')
}
