#!/usr/bin/env node
/**
 * verifie.mjs — la stack est-elle prête à produire ?
 *
 * Rend un état complet, dans l'ordre où les choses bloquent réellement. Ce qui
 * manque est dit en clair, avec la commande exacte pour y remédier. Rien n'est
 * masqué : une clé morte ou un quota vide doit se voir avant le tournage, pas
 * pendant le montage.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CHEMINS, litJson, env } from './lib/chemins.mjs'
import { journal, compact } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { verifieFfmpeg, accelerationNvidia, lance } from './lib/ffmpeg.mjs'
import { etatLisible } from './lib/trousseau.mjs'
import * as whisper from './lib/whisper.mjs'
import { trouveYtdlp } from './lib/tiktok.mjs'

const { options } = litArgs()

aide(
  options,
  `
npm run verifie [-- options]

  --rendu      rend 1 seconde de test pour vérifier toute la chaîne Remotion
  --quotas     interroge Apify et ElevenLabs (appels réseau, quelques secondes)
  --tout       les deux
`
)

const tout = drapeau(options, 'tout')
const veutRendu = tout || drapeau(options, 'rendu')
const veutQuotas = tout || drapeau(options, 'quotas')

const bloquants = []
const avertissements = []

const etat = (ok, quoi, detail, correction = null, bloquant = true) => {
  if (ok) {
    journal.ok(`${quoi}${detail ? ' — ' + detail : ''}`)
  } else if (bloquant) {
    journal.erreur(`${quoi}${detail ? ' — ' + detail : ''}`)
    if (correction) bloquants.push(`${quoi} : ${correction}`)
  } else {
    journal.attention(`${quoi}${detail ? ' — ' + detail : ''}`)
    if (correction) avertissements.push(`${quoi} : ${correction}`)
  }
}

await principal(async () => {
  // ---------------------------------------------------------------- outils --
  journal.titre('Outils')

  const versionNode = Number(process.versions.node.split('.')[0])
  etat(versionNode >= 20, 'Node', `v${process.versions.node}`, 'installe Node 20 ou plus récent')

  const ff = await verifieFfmpeg()
  etat(ff.present, 'ffmpeg', ff.version ?? 'absent', 'winget install Gyan.FFmpeg')

  const nvenc = ff.present ? await accelerationNvidia() : false
  etat(nvenc, 'NVENC', nvenc ? 'encodage matériel disponible' : 'absent, encodage sur processeur', null, false)

  const ytdlp = await trouveYtdlp()
  etat(
    Boolean(ytdlp),
    'yt-dlp',
    ytdlp ? path.basename(ytdlp) : 'absent',
    'pip install yt-dlp — sans lui, le décodage TikTok passe par Apify et devient payant',
    false
  )

  const modules = fs.existsSync(path.join(CHEMINS.racine, 'node_modules', 'remotion'))
  etat(modules, 'Dépendances', modules ? 'installées' : 'absentes', 'npm install')

  // ----------------------------------------------------------- whisper -----
  journal.titre('Transcription')

  const w = await whisper.etat()
  etat(
    w.installe,
    'whisper.cpp',
    w.installe
      ? `v${w.version} · ${w.variante === 'nvidia' ? 'accéléré NVIDIA' : 'processeur'}`
      : 'sera installé au premier usage (8 Mo)',
    null,
    false
  )
  etat(
    w.modelePresent,
    `Modèle « ${w.modele} »`,
    w.modelePresent
      ? `${w.tailleModeleMo} Mo`
      : 'sera téléchargé au premier usage',
    null,
    false
  )
  if (w.gpu) {
    etat(
      w.gpuActif,
      'Carte graphique',
      w.gpuActif && w.variante === 'nvidia'
        ? `${w.gpu}, accélération active`
        : w.gpuActif
          ? `${w.gpu} · WHISPER_GPU=true mais le moteur posé est celui du processeur — il sera remplacé au prochain usage`
          : `${w.gpu} détectée mais inutilisée — WHISPER_GPU=true dans .env accélère la transcription d'environ 20 fois (670 Mo à télécharger)`,
      null,
      false
    )
  }
  journal.detail(`Outils partagés : ${CHEMINS.cachePartage}`)

  // ------------------------------------------------------------- clés ------
  journal.titre('Trousseau')

  if (!fs.existsSync(CHEMINS.trousseau)) {
    etat(false, 'config/keys.json', 'absent', 'copie config/keys.example.json vers config/keys.json')
  } else {
    for (const s of etatLisible()) {
      const ok = s.disponibles > 0
      const bloquant = s.service === 'apify'
      etat(
        ok,
        `Clés ${s.service}`,
        `${s.disponibles} disponibles sur ${s.total}` +
          (s.total - s.disponibles > 0 ? ` (${s.total - s.disponibles} au frigo)` : ''),
        s.total === 0
          ? `ajoute au moins une clé dans config/keys.json`
          : `toutes les clés sont épuisées — attends la remise à zéro ou ajoutes-en`,
        bloquant
      )
    }
  }

  if (veutQuotas) {
    journal.titre('Quotas réels')
    try {
      const { etatPool } = await import('./lib/apify.mjs')
      const p = await etatPool()
      journal.info(
        `Apify : ${p.total.toFixed(2)} $ sur ${p.vivantes} clés ` +
          `≈ ${compact(p.videosPossibles)} vidéos avec transcript`
      )
      for (const c of p.cles) {
        journal.detail(
          `  ${c.label.padEnd(10)} ${c.reste === null ? 'hors service' : c.reste.toFixed(3) + ' $'}`
        )
      }
    } catch (e) {
      journal.attention(`Apify injoignable : ${e.message.split('\n')[0]}`)
    }

    try {
      const el = await import('./lib/elevenlabs.mjs')
      const p = await el.etatPool()
      if (p.cles.length === 0) {
        journal.attention(
          `Aucune clé ElevenLabs. Le remplacement de voix sera indisponible ` +
            `(la voix brute reste utilisable).`
        )
      } else {
        journal.info(
          `ElevenLabs : ${p.minutesTotales.toFixed(1)} min de conversion, ` +
            `dont ${p.minutesCommerciales.toFixed(1)} min sous licence commerciale`
        )
        for (const c of p.cles) {
          journal.detail(
            `  ${(c.label ?? '?').padEnd(14)} ${
              c.vivante
                ? `${c.palier} · ${c.restant} crédits${c.commercial ? '' : ' · SANS licence commerciale'}`
                : `hors service (${c.raison})`
            }`
          )
        }
        if (!p.aDuCommercial) {
          avertissements.push(
            `ElevenLabs : aucune clé payante — le palier gratuit interdit l'usage commercial`
          )
        }
      }
    } catch (e) {
      journal.attention(`ElevenLabs injoignable : ${e.message.split('\n')[0]}`)
    }
  }

  // ------------------------------------------------------------ chaîne -----
  journal.titre('Chaîne')

  const chaine = litJson(CHEMINS.chaine, null)
  if (!chaine) {
    etat(false, 'config/chaine.json', 'absent', 'lance /init-chaine')
  } else if (!chaine.initialise) {
    etat(false, 'Initialisation', 'la chaîne n’est pas initialisée', 'lance /init-chaine')
  } else {
    etat(true, 'Chaîne', `${chaine.identite?.nom ?? '?'} · avatar ${chaine.avatar?.nom ?? '?'}`)
    const formats = Object.entries(chaine.formats ?? {})
      .filter(([k, v]) => !k.startsWith('_') && v?.actif)
      .map(([k]) => k)
    etat(
      formats.length > 0,
      'Formats actifs',
      formats.join(', ') || 'aucun',
      'termine la phase 3 de /init-chaine',
      false
    )
  }

  const socle = [
    ['Fiche produit', CHEMINS.ficheProduit],
    ['Fiche avatars', CHEMINS.ficheAvatars],
    ['Hook bank', CHEMINS.hookBank],
    ['Le marketeur', CHEMINS.marketeur],
  ]
  for (const [nom, chemin] of socle) {
    etat(fs.existsSync(chemin), nom, fs.existsSync(chemin) ? null : 'absent', 'lance /init-chaine', false)
  }

  const veilleFaite =
    fs.existsSync(CHEMINS.veilleYoutubeRaw) &&
    fs.readdirSync(CHEMINS.veilleYoutubeRaw).some((f) => f.endsWith('.json'))
  etat(veilleFaite, 'Veille YouTube', veilleFaite ? null : 'aucune donnée', 'lance /veille', false)

  // ------------------------------------------------------------ rendu ------
  if (veutRendu) {
    journal.titre('Rendu')
    const sortie = path.join(os.tmpdir(), `verifie-${process.pid}.mp4`)
    const debut = Date.now()
    const { code, stderr } = await lance(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['remotion', 'render', CHEMINS.remotionEntree, 'Montage', sortie, '--frames=0-29'],
      { silencieux: true }
    )
    const ok = code === 0 && fs.existsSync(sortie)
    etat(
      ok,
      'Chaîne Remotion',
      ok
        ? `1 seconde rendue en ${((Date.now() - debut) / 1000).toFixed(1)} s`
        : stderr.trim().split('\n').slice(-2).join(' '),
      'vérifie npm install, puis relance'
    )
    fs.rmSync(sortie, { force: true })
  }

  // ----------------------------------------------------------- verdict -----
  journal.titre('Verdict')

  if (bloquants.length === 0) {
    journal.ok('Prêt à produire.')
    if (avertissements.length) {
      console.log('')
      journal.attention(`${avertissements.length} point(s) à surveiller :`)
      for (const a of avertissements) journal.detail(`  · ${a}`)
    }
    if (!veutQuotas) {
      console.log('')
      journal.detail(`Ajoute --quotas pour interroger les quotas réels des API.`)
    }
  } else {
    journal.erreur(`${bloquants.length} point(s) bloquant(s) :`)
    for (const b of bloquants) journal.detail(`  · ${b}`)
    process.exitCode = 1
  }
})
