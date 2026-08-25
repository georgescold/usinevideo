#!/usr/bin/env node
/**
 * tiktok-ingest.mjs — ce que dit vraiment un TikTok qui a marché.
 *
 * On récupère les statistiques, on télécharge l'audio, on le transcrit en
 * local, et on range le tout. L'autopsie éditoriale — pourquoi ça a marché —
 * se fait ensuite en conversation, avec la skill `decodage-tiktok`. Ici on ne
 * fait que rendre la matière lisible.
 *
 *   npm run tiktok -- https://www.tiktok.com/@x/video/123 https://…
 *   npm run tiktok -- --fichier=liens.txt
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, assureDossier, ecritJson, ecritTexte, litJson } from './lib/chemins.mjs'
import { journal, compact, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import * as tiktok from './lib/tiktok.mjs'
import { transcris } from './lib/whisper.mjs'
import { telecharge } from './lib/http.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run tiktok -- <url> [<url>…] [options]

  --fichier=liens.txt   lit les URLs dans un fichier, une par ligne
  --sans-transcript     stats seulement, pas de téléchargement audio
  --refais              retraite même ce qui est déjà en base

Sortie : veille/tiktok/raw/, transcripts/, media/, et index.json
`
)

const LIMITE_SANS_ACCORD = 10

await principal(async () => {
  let urls = [...positionnels]
  if (options.fichier) {
    urls.push(
      ...fs
        .readFileSync(options.fichier, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    )
  }
  urls = [...new Set(urls.filter((u) => /tiktok\.com|instagram\.com/.test(u)))]

  if (urls.length === 0) {
    throw new Error(
      `Aucun lien TikTok ou Instagram valide.\n` +
        `Exemple : npm run tiktok -- https://www.tiktok.com/@compte/video/123456`
    )
  }
  if (urls.length > LIMITE_SANS_ACCORD && !drapeau(options, 'oui')) {
    throw new Error(
      `${urls.length} liens dépasse le seuil de ${LIMITE_SANS_ACCORD}. Relance avec --oui.`
    )
  }

  journal.titre(`Décodage de ${urls.length} vidéo${urls.length > 1 ? 's' : ''}`)

  const bin = await tiktok.trouveYtdlp()
  journal.detail(bin ? `yt-dlp trouvé — extraction locale et gratuite` : `yt-dlp absent — repli sur Apify`)

  assureDossier(CHEMINS.veilleTiktokRaw)
  const index = litJson(path.join(CHEMINS.veilleTiktok, 'index.json'), { posts: [] })
  const parId = new Map(index.posts.map((p) => [p.id, p]))

  const aRepli = []
  const traites = []

  for (const [i, url] of urls.entries()) {
    journal.etape(i + 1, urls.length, url.slice(0, 70))

    let post = bin ? await tiktok.metadonnees(url) : null
    if (!post) {
      aRepli.push(url)
      continue
    }

    const chemins = tiktok.dossiers(post.id)
    if (fs.existsSync(chemins.transcript) && !drapeau(options, 'refais')) {
      journal.detail(`déjà en base, ignoré (--refais pour forcer)`)
      traites.push(litJson(chemins.meta, post))
      continue
    }

    post.engagement = tiktok.engagement(post)

    if (post.couverture) {
      await telecharge(post.couverture, chemins.couverture)
    }

    if (!drapeau(options, 'sans-transcript')) {
      try {
        const audio = await tiktok.telechargeAudio(url, chemins.audio)
        const t = await transcris(audio, { silencieux: true })
        post.transcript = t.texte
        post.mots = t.mots
        ecritJson(chemins.transcript, { id: post.id, url, mots: t.mots, texte: t.texte })
        ecritTexte(
          path.join(CHEMINS.veilleTiktokTranscripts, `${post.id}.txt`),
          entete(post) + '\n' + t.texte + '\n'
        )
        // L'audio brut ne sert plus une fois transcrit, et il pèse.
        fs.rmSync(audio, { force: true })
      } catch (e) {
        journal.attention(`Transcription impossible : ${e.message.split('\n')[0]}`)
      }
    }

    ecritJson(chemins.meta, post)
    traites.push(post)
    resume(post)
  }

  if (aRepli.length > 0) {
    journal.attention(`${aRepli.length} lien(s) inaccessibles en local — bascule sur Apify (payant)`)
    const { detailleTiktok } = await import('./lib/apify.mjs')
    const { posts } = await detailleTiktok(aRepli)
    for (const p of posts) {
      p.engagement = tiktok.engagement(p)
      p.source = 'apify'
      ecritJson(tiktok.dossiers(p.id).meta, p)
      traites.push(p)
      resume(p)
    }
  }

  for (const p of traites) {
    parId.set(p.id, {
      id: p.id,
      url: p.url,
      auteur: p.auteur,
      vues: p.vues,
      likes: p.likes,
      sauvegardes: p.sauvegardes,
      partages: p.partages,
      dureeS: p.dureeS,
      date: p.date,
      engagement: p.engagement,
      aTranscript: Boolean(p.transcript),
    })
  }
  index.posts = [...parId.values()].sort((a, b) => (b.vues ?? 0) - (a.vues ?? 0))
  ecritJson(path.join(CHEMINS.veilleTiktok, 'index.json'), index)

  journal.titre('Bilan')
  journal.info(`${traites.length} vidéos décodées · ${index.posts.length} en base`)
  console.log('')
  journal.detail(`Transcripts dans veille/tiktok/transcripts/`)
  journal.detail(`Lance ensuite /decode pour l'autopsie éditoriale.`)
})

function entete(p) {
  return [
    `# ${p.auteur ?? '?'} · ${compact(p.vues ?? 0)} vues · ${duree(p.dureeS ?? 0)}`,
    `# ${p.url}`,
    `# likes ${p.engagement?.likes ?? '—'} % · commentaires ${p.engagement?.commentaires ?? '—'} % · ` +
      `partages ${p.engagement?.partages ?? '—'} % · sauvegardes ${p.engagement?.sauvegardes ?? '—'} %`,
    `#`,
    `# Description : ${(p.texte ?? '').replace(/\n/g, ' ').slice(0, 200)}`,
    ``,
  ].join('\n')
}

function resume(p) {
  const e = p.engagement ?? {}
  journal.detail(
    `${compact(p.vues ?? 0)} vues · ${duree(p.dureeS ?? 0)} · ` +
      `likes ${e.likes ?? '—'} % · sauv. ${e.sauvegardes ?? '—'} % · ` +
      `×${e.ratioAbonnes ?? '—'} abonnés`
  )
}
