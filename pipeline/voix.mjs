#!/usr/bin/env node
/**
 * voix.mjs — remplacer le timbre, garder le jeu.
 *
 * Tu enregistres, tu joues, tu poses les silences. ElevenLabs ne change que la
 * couleur de la voix. Rien d'autre ne bouge : ni le rythme, ni les intentions,
 * ni les respirations.
 *
 *   npm run voix -- mon-slug
 *   npm run voix -- mon-slug --voix=<identifiant> --essai
 *   npm run voix -- chemin/vers/prise.wav --sortie=voix-finale.wav
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CHEMINS,
  dossierVideo,
  assureDossier,
  litChaine,
  env,
} from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { changeDeVoix, etatPool, voix as listeVoix } from './lib/elevenlabs.mjs'
import { sonde, ffmpeg, normalise } from './lib/ffmpeg.mjs'
import { avecCle } from './lib/trousseau.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run voix -- <slug | fichier> [options]

  --voix=<id>        identifiant de voix ElevenLabs (défaut : celui de .env)
  --stabilite=0.5    0 = très expressif, 1 = très plat
  --similarite=0.8   fidélité à la voix cible
  --essai            ne convertit que les 30 premières secondes
  --catalogue        liste les voix disponibles et s'arrête
  --quota            affiche le quota du pool et s'arrête
  --sortie=nom.wav   nom du fichier produit
  --brute            saute ElevenLabs : normalise seulement l'enregistrement

Le seuil sans confirmation est de 5 minutes d'audio. Au-delà, ajoute --oui.
`
)

const LIMITE_MINUTES_SANS_ACCORD = 5

await principal(async () => {
  if (drapeau(options, 'quota')) {
    const p = await etatPool()
    journal.titre('Quota ElevenLabs')
    for (const c of p.cles) {
      journal.detail(
        `${(c.label ?? '?').padEnd(14)} ${
          c.vivante
            ? `${c.palier.padEnd(9)} ${String(c.restant).padStart(7)} crédits · ` +
              `${c.minutesSts.toFixed(1)} min` +
              (c.commercial ? '' : ' · SANS licence commerciale')
            : `hors service (${c.raison})`
        }`
      )
    }
    journal.info(
      `${p.minutesTotales.toFixed(1)} min disponibles, ` +
        `dont ${p.minutesCommerciales.toFixed(1)} min utilisables commercialement`
    )
    return
  }

  if (drapeau(options, 'catalogue')) {
    const v = await avecCle('elevenlabs', (cle) => listeVoix(cle))
    journal.titre(`${v.length} voix disponibles`)
    for (const x of v) {
      console.log(
        `  ${x.id}  ${(x.nom ?? '').padEnd(22)} ${(x.genre ?? '').padEnd(8)} ` +
          `${(x.langue ?? '').padEnd(6)} ${x.categorie ?? ''}`
      )
    }
    journal.detail(`Renseigne l'identifiant retenu dans ELEVENLABS_VOICE_ID (.env).`)
    return
  }

  const cible = positionnels[0]
  if (!cible) throw new Error(`Donne un slug de vidéo ou un chemin de fichier.`)

  // ------------------------------------------------------- où est la prise --
  const dossierPossible = path.join(CHEMINS.videos, cible.replace(/^videos[\\/]/, ''))
  let source
  let destination

  if (fs.existsSync(dossierPossible)) {
    const slug = path.basename(dossierPossible)
    const v = dossierVideo(slug)
    assureDossier(v.audio)

    const candidats = [
      path.join(v.audio, 'voix.wav'),
      ...(fs.existsSync(v.tournage)
        ? fs
            .readdirSync(v.tournage)
            .filter((f) => /\.(wav|mp3|m4a|mp4|mov|mkv)$/i.test(f))
            .sort()
            .map((f) => path.join(v.tournage, f))
        : []),
    ]
    source = candidats.find((c) => fs.existsSync(c))
    if (!source) {
      throw new Error(
        `Aucun enregistrement pour « ${slug} ».\n` +
          `Dépose ta prise dans ${path.relative(CHEMINS.racine, v.tournage)}.`
      )
    }
    destination = path.join(v.audio, options.sortie || 'voix-finale.wav')
  } else {
    if (!fs.existsSync(cible)) throw new Error(`Fichier introuvable : ${cible}`)
    source = cible
    destination = options.sortie
      ? path.resolve(path.dirname(cible), options.sortie)
      : cible.replace(/\.[^.]+$/, '') + '-voix.wav'
  }

  // ------------------------------------------- extraction de la piste seule --
  const info = await sonde(source)
  let entree = source
  if (info.aDeLaVideo) {
    entree = path.join(path.dirname(destination), '.prise.wav')
    await ffmpeg(['-i', source, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', entree])
    journal.detail(`Piste audio extraite de la vidéo.`)
  }

  if (drapeau(options, 'essai')) {
    const court = path.join(path.dirname(destination), '.essai.wav')
    await ffmpeg(['-i', entree, '-t', '30', '-c', 'copy', court])
    entree = court
    journal.detail(`Mode essai : 30 secondes seulement.`)
  }

  const { dureeS } = await sonde(entree)

  // ------------------------------------------------------- voix brute seule --
  if (drapeau(options, 'brute')) {
    await normalise(entree, destination, { lufs: -14 })
    journal.ok(`Voix conservée telle quelle, normalisée : ${path.basename(destination)}`)
    return
  }

  const minutes = dureeS / 60
  if (minutes > LIMITE_MINUTES_SANS_ACCORD && !drapeau(options, 'oui')) {
    throw new Error(
      `${duree(dureeS)} dépasse le seuil de ${LIMITE_MINUTES_SANS_ACCORD} min ` +
        `(environ ${Math.round(minutes * 1000)} crédits, ${(minutes * 0.12).toFixed(2)} $). ` +
        `Relance avec --oui, ou teste d'abord avec --essai.`
    )
  }

  const chaine = litChaine()
  const voixId = options.voix || chaine?.voix?.elevenlabs_voice_id || env('ELEVENLABS_VOICE_ID', null)

  journal.titre('Remplacement du timbre')
  const brut = path.join(path.dirname(destination), '.converti.wav')

  await changeDeVoix(entree, brut, {
    voiceId: voixId,
    stabilite: nombre(options, 'stabilite', 0.5),
    similarite: nombre(options, 'similarite', 0.8),
  })

  // Normalisation en dernier : les plateformes ramènent tout à −14 LUFS, autant
  // livrer à la bonne cible plutôt que de les laisser écraser la dynamique.
  await normalise(brut, destination, { lufs: -14 })
  fs.rmSync(brut, { force: true })
  for (const temporaire of ['.prise.wav', '.essai.wav']) {
    fs.rmSync(path.join(path.dirname(destination), temporaire), { force: true })
  }

  const fin = await sonde(destination)
  journal.ok(`${path.basename(destination)} · ${duree(fin.dureeS)} · normalisé à −14 LUFS`)
  console.log('')
  journal.detail(
    `Les sous-titres se calent sur CE fichier, pas sur ta prise : ` +
      `lance « npm run transcris -- ${path.basename(path.dirname(path.dirname(destination)))} ».`
  )
})
