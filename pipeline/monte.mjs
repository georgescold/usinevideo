#!/usr/bin/env node
/**
 * monte.mjs — des rushes au plan de montage.
 *
 * Six étapes, chacune rejouable seule. Si une seule change, on ne refait pas
 * les cinq autres : la transcription et le remplacement de voix coûtent du
 * temps et de l'argent.
 *
 *   1. rushes        inventaire et sondage
 *   2. coupe         détection des silences, audio recollé
 *   3. voix          remplacement du timbre (ElevenLabs) ou normalisation seule
 *   4. transcris     alignement mot à mot sur la voix FINALE
 *   5. cale          les événements visuels tombent sur leur mot
 *   6. plan          écriture de 05-montage/plan.json
 *
 *   npm run monte -- mon-slug
 *   npm run monte -- mon-slug --depuis=voix
 *   npm run monte -- mon-slug --voix=brute
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CHEMINS,
  dossierVideo,
  assureDossier,
  assureDossierVideo,
  litJson,
  ecritJson,
  litChaine,
} from './lib/chemins.mjs'
import { journal, duree, compact } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import * as M from './lib/montage.mjs'
import { resoudBroll } from './lib/medias.mjs'
import { sonde, normalise } from './lib/ffmpeg.mjs'
import { aligne } from './lib/whisper.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run monte -- <slug> [options]

  --voix=sts|brute        remplacer le timbre, ou garder ta voix (défaut : config)
  --depuis=<étape>        refait à partir de là : coupe | voix | transcris | cale
  --refais                refait tout, y compris transcription et voix
  --seuil-db=-34          seuil de détection du silence
  --silence-min=0.35      durée minimale d'un silence coupé, en secondes
  --sans-coupe            garde tout, ne retire aucun silence
  --oui                   passe les seuils de confirmation

Sortie : videos/<slug>/05-montage/plan.json
Ensuite : npm run rends -- <slug>
`
)

const ETAPES = ['rushes', 'coupe', 'voix', 'transcris', 'cale', 'plan']

await principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug de la vidéo à monter.`)

  const v = assureDossierVideo(slug)
  const script = litJson(v.scriptJson, null)
  if (!script) {
    throw new Error(
      `Aucun script pour « ${slug} ».\n` +
        `Attendu : ${path.relative(CHEMINS.racine, v.scriptJson)}\n` +
        `Lance /script ${slug} d'abord.`
    )
  }
  verifieScript(script, slug)

  const chaine = litChaine()

  // Par défaut on ne refait QUE ce qui manque : la transcription et le
  // remplacement de voix coûtent du temps et de l'argent, les rejouer sans
  // raison est le meilleur moyen de brûler un quota pour rien.
  // `--depuis=<étape>` force la reprise à partir de là ; `--refais` reprend tout.
  const depuis = drapeau(options, 'refais')
    ? 0
    : options.depuis
      ? ETAPES.indexOf(options.depuis)
      : ETAPES.length // rien n'est forcé
  if (depuis === -1) throw new Error(`Étape inconnue. Choisis parmi : ${ETAPES.join(', ')}`)
  const force = (etape) => ETAPES.indexOf(etape) >= depuis

  journal.titre(`Montage · ${slug} · ${script.format}`)

  // -- 1. rushes ------------------------------------------------------------
  const rushes = M.prendsLesRushes(v.tournage)
  const prises = rushes.filter((r) => !M.estPlanDeCoupe(r))
  if (prises.length === 0) {
    throw new Error(
      `Aucun rush dans ${path.relative(CHEMINS.racine, v.tournage)}.\n` +
        `Dépose tes fichiers (prise-01.mp4, prise-02.mp4…) puis relance.`
    )
  }
  journal.etape(1, 6, `${prises.length} prise(s), ${rushes.length - prises.length} plan(s) de coupe`)

  // -- 2. coupe -------------------------------------------------------------
  const cheminCoupe = path.join(v.montage, 'coupe.json')
  let coupe = litJson(cheminCoupe, null)

  if (force('coupe') || !coupe) {
    journal.etape(2, 6, 'détection des silences')
    if (drapeau(options, 'sans-coupe')) {
      const aGarder = []
      let curseur = 0
      for (const rush of prises) {
        const info = await sonde(rush)
        const dureeMs = Math.round(info.dureeS * 1000)
        aGarder.push({ src: rush, depuisS: 0, jusquaS: info.dureeS, debutMs: curseur, dureeMs })
        curseur += dureeMs
      }
      coupe = { aGarder, dureeMs: curseur, retireMs: 0, brutMs: curseur }
    } else {
      coupe = await M.decoupeParole(prises, {
        seuilDb: options['seuil-db'] ? Number(options['seuil-db']) : undefined,
        silenceMin: options['silence-min'] ? Number(options['silence-min']) : undefined,
      })
    }
    ecritJson(cheminCoupe, coupe)

    const gain = coupe.brutMs ? Math.round((coupe.retireMs / coupe.brutMs) * 100) : 0
    journal.ok(
      `${duree(coupe.brutMs / 1000)} → ${duree(coupe.dureeMs / 1000)} ` +
        `(${gain} % retiré, ${coupe.aGarder.length} plans)`
    )
    if (gain > 45) {
      journal.attention(
        `Plus de 45 % de retiré : soit la prise a beaucoup d'hésitations, soit le seuil ` +
          `est trop haut. Écoute l'audio coupé avant d'aller plus loin (--seuil-db=-40 pour couper moins).`
      )
    }
  } else {
    journal.etape(2, 6, `coupe déjà calculée : ${coupe.aGarder.length} plans (--depuis=coupe pour la refaire)`)
  }

  // -- 3. voix --------------------------------------------------------------
  const audioCoupe = path.join(v.audio, 'voix-coupee.wav')
  const audioFinal = path.join(v.audio, 'voix-finale.wav')
  const modeVoix = options.voix || chaine?.voix?.mode || 'sts'

  if (force('voix') || !fs.existsSync(audioFinal)) {
    journal.etape(3, 6, `voix (mode ${modeVoix})`)
    assureDossier(v.audio)
    await M.fabriqueAudioCoupe(coupe.aGarder, audioCoupe)

    if (modeVoix === 'sts') {
      const { changeDeVoix } = await import('./lib/elevenlabs.mjs')
      const minutes = coupe.dureeMs / 60000
      if (minutes > 5 && !drapeau(options, 'oui')) {
        throw new Error(
          `${duree(coupe.dureeMs / 1000)} de voix à convertir ` +
            `(environ ${Math.round(minutes * 1000)} crédits, ${(minutes * 0.12).toFixed(2)} $). ` +
            `Relance avec --oui, ou --voix=brute pour garder ta voix.`
        )
      }
      const brut = path.join(v.audio, '.sts.wav')
      await changeDeVoix(audioCoupe, brut, {
        voiceId: chaine?.voix?.elevenlabs_voice_id ?? null,
      })
      await normalise(brut, audioFinal, { lufs: -14 })
      fs.rmSync(brut, { force: true })
    } else {
      await normalise(audioCoupe, audioFinal, { lufs: -14 })
      journal.ok(`Voix conservée telle quelle, normalisée à −14 LUFS.`)
    }
  } else {
    journal.etape(3, 6, `voix finale déjà là (--depuis=voix pour la refaire)`)
  }

  const infoVoix = await sonde(audioFinal)
  const derive = Math.abs(infoVoix.dureeS * 1000 - coupe.dureeMs)
  if (derive > 500) {
    journal.attention(
      `La voix finale fait ${duree(infoVoix.dureeS)} pour ${duree(coupe.dureeMs / 1000)} d'image : ` +
        `${(derive / 1000).toFixed(2)} s d'écart. L'image se décalera en fin de vidéo.`
    )
  }

  // -- 4. transcription -----------------------------------------------------
  let transcript = litJson(v.transcript, null)
  if (force('transcris') || !transcript) {
    journal.etape(4, 6, 'alignement mot à mot sur la voix finale')
    const texte = script.blocs.map((b) => b.texte).join(' ')
    const r = await aligne(audioFinal, texte)
    transcript = {
      fichier: path.relative(CHEMINS.racine, audioFinal),
      mode: 'calé sur le script',
      langue: r.langue,
      modele: r.modele,
      genereLe: new Date().toISOString(),
      mots: r.mots,
      texte,
    }
    ecritJson(v.transcript, transcript)
    journal.ok(`${transcript.mots.length} mots calés`)
  } else {
    journal.etape(4, 6, `transcription déjà là : ${transcript.mots.length} mots (--depuis=transcris pour la refaire)`)
  }

  // -- 5. calage des événements --------------------------------------------
  journal.etape(5, 6, 'calage des événements visuels')
  const evenements = M.caleEvenements(script, transcript.mots)

  // Les plans de coupe demandés par le script sont cherchés et rapatriés ici :
  // ils doivent être sur le disque avant que Remotion ne les lise.
  const pubBroll = path.join(v.montage, 'public', 'broll')
  const { largeur: L, hauteur: H } = M.dimensionsDe(script.format)
  const broll = await resoudBroll(evenements, { largeur: L, hauteur: H, dossier: pubBroll })
  const retenus = evenements.filter((e) => !e._aRetirer)
  if (broll.resolus || broll.abandonnes) {
    journal.detail(`plans de coupe : ${broll.resolus} rapatriés, ${broll.abandonnes} abandonnés`)
  }
  journal.ok(`${retenus.length} événements placés`)

  // -- 6. plan --------------------------------------------------------------
  journal.etape(6, 6, 'piste image et plan')
  const pub = M.dossierPublic(v.montage)
  const { largeur, hauteur } = M.dimensionsDe(script.format)

  const cheminImage = path.join(pub, 'image.mp4')
  if (force('plan') || !fs.existsSync(cheminImage) || force('coupe')) {
    const img = await M.fabriqueImage(coupe.aGarder, cheminImage, { largeur, hauteur })
    journal.detail(
      `piste image ${largeur}×${hauteur} · ${duree(img.dureeMs / 1000)} · ` +
        `${img.nvenc ? 'encodée sur GPU' : 'encodée sur processeur'}`
    )
  }
  const infoImage = await sonde(cheminImage)
  M.deposeDansPublic(audioFinal, pub, 'voix.wav')

  const { plan, creux } = M.construisPlan({
    script,
    chaine,
    mots: transcript.mots,
    aGarder: coupe.aGarder,
    dureeMs: coupe.dureeMs,
    evenements: retenus,
    piste: { src: 'image.mp4', dureeMs: Math.round(infoImage.dureeS * 1000) },
    voixSrc: 'voix.wav',
    musique: null,
    dossierPublic: pub,
  })
  ecritJson(v.plan, plan)

  if (broll.attributions.length) {
    // Les licences CC-BY exigent l'attribution : elle doit se retrouver dans la
    // description de la vidéo, pas seulement à côté du fichier.
    ecritJson(path.join(v.montage, 'attributions.json'), broll.attributions)
    journal.detail(`${broll.attributions.length} attributions à reporter en description`)
  }

  // ------------------------------------------------------------- rapport ---
  journal.titre('Plan de montage')
  const secondes = plan.dureeFrames / plan.fps
  journal.info(
    `${duree(secondes)} · ${plan.largeur}×${plan.hauteur} · ${plan.coupes.length} plans · ` +
      `${plan.evenements.length} événements · ${plan.mots.length} mots`
  )

  const cible = script.duree_cible_s
  if (cible) {
    const ecart = Math.round(((secondes - cible) / cible) * 100)
    if (Math.abs(ecart) > 25) {
      journal.attention(
        `${Math.abs(ecart)} % ${ecart > 0 ? 'plus longue' : 'plus courte'} que la cible ` +
          `(${duree(cible)}). Ce n'est pas bloquant, mais le format en souffre.`
      )
    }
  }

  const parType = {}
  for (const e of plan.evenements) parType[e.type] = (parType[e.type] ?? 0) + 1
  journal.detail(
    Object.entries(parType)
      .map(([t, n]) => `${t} ×${n}`)
      .join(' · ') || 'aucun événement visuel'
  )

  const densite = plan.evenements.length / Math.max(secondes, 1)
  if (densite < 0.2) {
    journal.attention(
      `Un événement toutes les ${Math.round(1 / densite)} s en moyenne. ` +
        `La doctrine vise un toutes les 2 à 4 s : l'image va sembler figée.`
    )
  }

  if (creux.length) {
    journal.attention(`${creux.length} passage(s) où rien ne bouge plus de 4 s :`)
    for (const c of creux.slice(0, 6)) {
      journal.detail(`  à ${duree(c.debutMs / 1000)} — ${(c.ecartMs / 1000).toFixed(1)} s sans rien`)
    }
    journal.detail(`Ajoute des événements visuels dans le script à ces endroits, puis --depuis=cale.`)
  }

  console.log('')
  journal.detail(`Aperçu : npm run studio -- ${slug}`)
  journal.detail(`Rendu  : npm run rends -- ${slug}`)
})

/** Contrôles de conformité du script. Un message qui dit quoi corriger. */
function verifieScript(script, slug) {
  const erreurs = []
  if (script.slug !== slug) erreurs.push(`"slug" vaut "${script.slug}" au lieu de "${slug}"`)
  if (!Array.isArray(script.blocs) || script.blocs.length === 0) erreurs.push(`aucun bloc`)

  const ids = new Set()
  for (const b of script.blocs ?? []) {
    if (!b.id) erreurs.push(`un bloc n'a pas d'identifiant`)
    else if (ids.has(b.id)) erreurs.push(`identifiant de bloc en double : "${b.id}"`)
    ids.add(b.id)
    if (!b.texte?.trim()) erreurs.push(`le bloc "${b.id}" n'a pas de texte`)

    for (const visuel of b.visuel ?? []) {
      if (visuel.ancre && !b.texte.includes(visuel.ancre)) {
        erreurs.push(
          `l'ancre « ${visuel.ancre} » du bloc "${b.id}" n'apparaît pas dans son texte`
        )
      }
    }
  }
  const hooks = (script.blocs ?? []).filter((b) => b.role === 'hook').length
  if (hooks !== 1) erreurs.push(`${hooks} bloc(s) de rôle "hook" — il en faut exactement un`)

  if (erreurs.length) {
    throw new Error(
      `Le script n'est pas conforme :\n  - ` +
        erreurs.join('\n  - ') +
        `\n\nFormat attendu : .claude/skills/ecriture-script/references/format-script.md`
    )
  }
}
