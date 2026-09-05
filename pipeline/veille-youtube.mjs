#!/usr/bin/env node
/**
 * veille-youtube.mjs — ce qui marche dans la niche, rangé pour être relu.
 *
 * On ne scrape pas pour collectionner : on scrape pour répondre à trois
 * questions — quels sujets sortent, comment ils sont emballés, et où sont les
 * trous. Tout est persisté immédiatement : les données Apify ne vivent que sept
 * jours au palier gratuit.
 *
 *   npm run veille -- "tunnel de vente" "meilleur crm" --par-requete=20
 *   npm run veille -- --urls=https://youtu.be/xxxx,https://youtu.be/yyyy
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CHEMINS,
  assureDossier,
  ecritJson,
  ecritTexte,
  litJson,
  slugifie,
  envNombre,
  env,
} from './lib/chemins.mjs'
import { journal, compact, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { chercheYoutube, detailleYoutube, repecheTranscripts, annonceCout } from './lib/apify.mjs'
import { telecharge, enParallele } from './lib/http.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run veille -- <requête> [<requête>…] [options]

  --par-requete=20        vidéos remontées par recherche
  --fraicheur=year        hour | today | week | month | year
  --tri=relevance         relevance | date | views | rating
  --duree=between420      under4 | between420 | plus20
  --shorts                inclut les formats courts
  --urls=a,b,c            détaille des vidéos précises au lieu de chercher
  --sans-miniatures       ne télécharge pas les images
  --oui                   ne demande pas confirmation au-delà de 100 vidéos

Sortie : veille/youtube/raw/, transcripts/, miniatures/, et index.json
`
)

const LIMITE_SANS_ACCORD = 100

await principal(async () => {
  const parRequete = nombre(options, 'par-requete', envNombre('VEILLE_TAILLE', 20))
  const urls = options.urls ? String(options.urls).split(',').map((u) => u.trim()) : []
  const requetes = positionnels

  if (urls.length === 0 && requetes.length === 0) {
    throw new Error(
      `Rien à chercher. Donne des requêtes, ou --urls=…\n` +
        `Exemple : npm run veille -- "tunnel de vente" "erreur tunnel de vente"`
    )
  }

  const prevu = urls.length || requetes.length * parRequete
  journal.titre('Veille YouTube')
  journal.info(annonceCout(prevu))

  if (prevu > LIMITE_SANS_ACCORD && !drapeau(options, 'oui')) {
    throw new Error(
      `${prevu} vidéos dépasse le seuil de ${LIMITE_SANS_ACCORD} sans accord explicite. ` +
        `Relance avec --oui si c'est voulu.`
    )
  }

  // On ne re-scrape pas ce qu'on a déjà : chaque vidéo re-téléchargée est
  // payée deux fois pour la même information.
  assureDossier(CHEMINS.veilleYoutubeRaw)
  const dejaLa = new Set(
    fs.readdirSync(CHEMINS.veilleYoutubeRaw).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  )
  if (dejaLa.size) journal.detail(`${dejaLa.size} vidéos déjà en base`)

  const debut = Date.now()
  const resultat =
    urls.length > 0
      ? await detailleYoutube(urls)
      : await chercheYoutube(requetes, {
          parRequete,
          fraicheur: options.fraicheur || 'year',
          tri: options.tri || 'relevance',
          duree: options.duree || null,
          shorts: drapeau(options, 'shorts'),
        })

  let { videos } = resultat
  if (videos.length === 0) {
    journal.attention(`Aucune vidéo remontée. Élargis les requêtes ou la fraîcheur.`)
    return
  }

  const repeche = await repecheTranscripts(videos)
  if (repeche.repeches) {
    journal.detail(`${repeche.repeches} transcripts repêchés (${repeche.coutEstime.toFixed(3)} $)`)
  }

  // ------------------------------------------------------------ écriture ---
  assureDossier(CHEMINS.veilleYoutubeTranscripts)
  let nouvelles = 0

  for (const v of videos) {
    if (!dejaLa.has(v.id)) nouvelles++
    ecritJson(path.join(CHEMINS.veilleYoutubeRaw, `${v.id}.json`), v)
    if (v.transcript) {
      ecritTexte(
        path.join(CHEMINS.veilleYoutubeTranscripts, `${v.id}.txt`),
        `# ${v.titre}\n# ${v.chaine} · ${compact(v.vues)} vues · ${v.duree}\n# ${v.url}\n\n${v.transcript}\n`
      )
    }
  }

  if (!drapeau(options, 'sans-miniatures')) {
    assureDossier(CHEMINS.veilleYoutubeMiniatures)
    const aPrendre = videos.filter(
      (v) => v.miniature && !fs.existsSync(path.join(CHEMINS.veilleYoutubeMiniatures, `${v.id}.jpg`))
    )
    let faites = 0
    await enParallele(aPrendre, 6, async (v) => {
      const ok = await telecharge(
        v.miniature,
        path.join(CHEMINS.veilleYoutubeMiniatures, `${v.id}.jpg`)
      )
      if (ok) faites++
    })
    journal.detail(`${faites} miniatures téléchargées (1280×720)`)
  }

  // --------------------------------------------------------------- index ---
  const index = litJson(path.join(CHEMINS.veilleYoutube, 'index.json'), { videos: [], recherches: [] })
  const parId = new Map(index.videos.map((v) => [v.id, v]))
  for (const v of videos) {
    parId.set(v.id, {
      id: v.id,
      titre: v.titre,
      chaine: v.chaine,
      url: v.url,
      vues: v.vues,
      abonnes: v.abonnes,
      ratioVuesAbonnes: v.ratioVuesAbonnes,
      dureeS: v.dureeS,
      date: v.date,
      ageJours: v.ageJours,
      score: Number(v.score.toFixed(3)),
      aTranscript: Boolean(v.transcript),
      aMiniature: fs.existsSync(path.join(CHEMINS.veilleYoutubeMiniatures, `${v.id}.jpg`)),
    })
  }
  index.videos = [...parId.values()].sort((a, b) => b.score - a.score)
  index.recherches.push({
    date: new Date().toISOString(),
    requetes: urls.length ? urls : requetes,
    remontees: videos.length,
    nouvelles,
    coutUsd: Number((resultat.coutEstime + repeche.coutEstime).toFixed(4)),
  })
  ecritJson(path.join(CHEMINS.veilleYoutube, 'index.json'), index)

  // ------------------------------------------------------------- rapport ---
  journal.titre('Ce qui remonte')

  const top = index.videos.slice(0, 12)
  for (const v of top) {
    console.log(
      `  ${String(v.score).padStart(7)}  ${compact(v.vues).padStart(6)} vues  ` +
        `×${String(v.ratioVuesAbonnes ?? '—').padStart(6)} abonnés  ` +
        `${duree(v.dureeS || 0).padStart(9)}  ${(v.titre || '').slice(0, 62)}`
    )
  }

  const avecT = index.videos.filter((v) => v.aTranscript).length
  const mediane = (arr) => {
    const s = arr.filter(Number.isFinite).sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : null
  }

  journal.titre('Bilan')
  journal.info(
    `${index.videos.length} vidéos en base (${nouvelles} nouvelles) · ` +
      `${avecT} transcripts · ${duree((Date.now() - debut) / 1000)} · ` +
      `${(resultat.coutEstime + repeche.coutEstime).toFixed(3)} $`
  )
  journal.detail(`Durée médiane : ${duree(mediane(index.videos.map((v) => v.dureeS)) ?? 0)}`)
  journal.detail(`Vues médianes : ${compact(mediane(index.videos.map((v) => v.vues)) ?? 0)}`)
  journal.detail(
    `Vidéos qui dépassent leur audience (ratio ≥ 1) : ` +
      `${index.videos.filter((v) => (v.ratioVuesAbonnes ?? 0) >= 1).length}`
  )
  console.log('')
  journal.detail(`Transcripts lisibles dans veille/youtube/transcripts/`)
  journal.detail(`Miniatures dans veille/youtube/miniatures/`)
})
