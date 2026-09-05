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
  --modele=medium    tiny | base | small | medium | large-v3 | large-v3-turbo
  --langue=fr
  --srt              écrit aussi un .srt à côté
  --refais           ignore le résultat déjà en cache

Sortie : videos/<slug>/04-transcript.json
`
)

await principal(async () => {
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
