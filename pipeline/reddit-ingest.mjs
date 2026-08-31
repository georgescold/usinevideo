#!/usr/bin/env node
/**
 * reddit-ingest.mjs — ce que les créateurs racontent, pas ce qu'on suppose.
 *
 * POURQUOI PASSER PAR APIFY PLUTÔT QUE DE LIRE REDDIT.
 *
 * Reddit refuse les crawlers d'agents : requête directe en 403, moteurs de
 * recherche sans index du domaine, miroirs derrière un contrôle anti-robot. Un
 * agent qui « analyse Reddit » sans y accéder rend en réalité sa mémoire
 * d'entraînement — du plausible non daté, exactement ce qu'on cherche à éviter
 * sur un sujet où l'algorithme change tous les six mois.
 *
 * Apify passe par un vrai navigateur avec proxy résidentiel. On obtient les
 * posts ET leurs commentaires, horodatés et avec leurs votes, donc datables et
 * pondérables.
 *
 * CE QUE ÇA COÛTE, ET POURQUOI ON L'ANNONCE.
 *
 * Chaque post et chaque commentaire compte pour un résultat facturé. Un balayage
 * de trois subreddits se chiffre en dollars, pas en centimes : la commande
 * annonce l'estimation et attend `--oui` au-delà du seuil, comme la veille.
 *
 *   npm run reddit -- r/youtubers r/TikTokMarketing --posts=60 --commentaires=8
 *   npm run reddit -- r/youtubers --fenetre=year --oui
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, assureDossier, ecritJson, litJson } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { ACTEURS, lanceActeur } from './lib/apify.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run reddit -- <r/subreddit> [<r/subreddit>…] [options]

  --posts=60            posts remontés par subreddit
  --commentaires=8      commentaires gardés par post
  --fenetre=month       month | year | all — la fenêtre de tri « top »
  --mois=6              ne garde que les posts de moins de N mois
  --cherche="a,b,c"     cherche ces termes DANS le subreddit au lieu de prendre
                        le haut du classement (plus ciblé, et les votes sont
                        alors renseignés — ils manquent en mode classement)
  --oui                 passe le seuil de confirmation

Sortie : veille/plateformes/<subreddit>/index.json et posts.json

Un post et un commentaire coûtent autant l'un que l'autre. Le nombre de
commentaires par post pèse donc plus lourd que le nombre de posts.
`
)

/** Au-delà de ce coût, on demande confirmation. Même esprit que la veille. */
const SEUIL_SANS_ACCORD_USD = 3

const FENETRES = new Set(['hour', 'day', 'week', 'month', 'year', 'all'])

/** `r/nom`, `/r/nom`, une URL complète — on veut le nom seul. */
function nomDuSub(brut) {
  const m = String(brut).match(/(?:^|\/)r\/([A-Za-z0-9_]+)/) ?? String(brut).match(/^([A-Za-z0-9_]+)$/)
  if (!m) throw new Error(`« ${brut} » n'est pas un subreddit. Attendu : r/nom`)
  return m[1]
}

/**
 * Un post ou un commentaire, réduit à ce qui sert à juger.
 *
 * On garde le score et la date parce que ce sont les deux seules choses qui
 * permettent de pondérer un avis : un commentaire à 200 votes de mars 2026 ne
 * vaut pas une affirmation isolée de 2023.
 */
function normalise(brut, sub) {
  const type = brut.dataType === 'comment' ? 'commentaire' : 'post'
  return {
    type,
    sub,
    id: brut.id ?? brut.parsedId ?? null,
    url: brut.url ?? null,
    titre: brut.title ?? null,
    texte: (brut.body ?? brut.description ?? '').trim(),
    votes: brut.upVotes ?? brut.score ?? null,
    commentaires: brut.numberOfComments ?? null,
    auteur: brut.username ?? brut.author ?? null,
    date: brut.createdAt ?? brut.created ?? null,
    parent: brut.postId ?? brut.parentId ?? null,
  }
}

await principal(async () => {
  const subs = positionnels.map(nomDuSub)
  if (!subs.length) throw new Error(`Donne au moins un subreddit : r/youtubers`)

  const posts = nombre(options, 'posts', 60)
  const commentaires = nombre(options, 'commentaires', 8)
  const fenetre = String(options.fenetre ?? 'month')
  if (!FENETRES.has(fenetre)) {
    throw new Error(`Fenêtre inconnue : ${fenetre}. Choisis parmi ${[...FENETRES].join(', ')}.`)
  }
  const mois = nombre(options, 'mois', 6)
  const termes =
    options.cherche && options.cherche !== true
      ? String(options.cherche).split(',').map((t) => t.trim()).filter(Boolean)
      : []

  // Un post ET chacun de ses commentaires sont facturés. La fiche du subreddit
  // compte aussi pour un.
  const parSub = posts * (1 + commentaires) + 1
  const attendu = parSub * subs.length
  const cout = attendu * ACTEURS.reddit.prixParVideo

  journal.titre(`Veille plateformes · ${subs.length} subreddit${subs.length > 1 ? 's' : ''}`)
  journal.info(
    `${subs.map((s) => 'r/' + s).join(', ')} · ` +
      `${termes.length ? `recherche « ${termes.join(' / ')} »` : `top ${fenetre}`} · ` +
      `${posts} posts × ${commentaires} commentaires`
  )
  journal.info(`≈ ${attendu} résultats facturés, soit ${cout.toFixed(2)} $`)

  if (cout > SEUIL_SANS_ACCORD_USD && !drapeau(options, 'oui')) {
    throw new Error(
      `${cout.toFixed(2)} $ dépasse le seuil de ${SEUIL_SANS_ACCORD_USD} $.\n` +
        `Relance avec --oui, ou réduis --posts / --commentaires.`
    )
  }

  const limiteDate = new Date(Date.now() - mois * 30 * 24 * 3600 * 1000)
  const base = path.join(CHEMINS.racine, 'veille', 'plateformes')
  assureDossier(base)

  const bilan = []
  for (const [i, sub] of subs.entries()) {
    journal.etape(i + 1, subs.length, `r/${sub}`)
    const debut = Date.now()

    // DEUX FAÇONS DE VISER, ET ELLES NE RENDENT PAS LA MÊME CHOSE.
    //
    // Le classement (`/top/`) donne ce qui a le mieux marché, mais l'acteur y
    // laisse les compteurs de votes vides et remonte beaucoup de hors-sujet.
    // La recherche vise les questions qu'on se pose, et renseigne les votes —
    // au prix d'un biais : on ne trouve que ce qu'on a pensé à chercher.
    const commun = {
      skipComments: false,
      skipUserPosts: true,
      includeMediaLinks: false,
      maxItems: parSub,
      maxPostCount: posts,
      maxComments: commentaires,
      postDateLimit: limiteDate.toISOString(),
      proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    }
    const entree = termes.length
      ? {
          ...commun,
          searches: termes,
          searchCommunityName: sub,
          searchPosts: true,
          searchComments: false,
          searchCommunities: false,
          searchUsers: false,
          sort: 'top',
          time: fenetre,
          skipCommunity: true,
        }
      : {
          ...commun,
          startUrls: [{ url: `https://www.reddit.com/r/${sub}/top/?t=${fenetre}` }],
          skipCommunity: false,
        }

    let items = []
    try {
      const r = await lanceActeur(ACTEURS.reddit, entree, { attenduItems: parSub })
      items = r.items ?? []
      journal.detail(`${items.length} résultats · clé ${r.cle} · ${duree((Date.now() - debut) / 1000)}`)
    } catch (e) {
      journal.attention(`r/${sub} : ${e.message.split('\n')[0]}`)
      continue
    }

    const tout = items.filter((x) => x.dataType !== 'community').map((x) => normalise(x, sub))
    // Le filtre de date est refait ici : `postDateLimit` borne les posts, pas
    // les commentaires, et une vieille discussion remontée par un commentaire
    // récent fausserait la lecture.
    const gardes = tout.filter((x) => !x.date || new Date(x.date) >= limiteDate)
    const horsFenetre = tout.length - gardes.length

    // Deux recoltes du meme subreddit ne s'ecrasent pas : le classement et la
    // recherche repondent a des questions differentes, on garde les deux.
    const dossier = path.join(base, sub + (termes.length ? '-recherche' : ''))
    assureDossier(dossier)
    ecritJson(path.join(dossier, 'posts.json'), gardes)
    ecritJson(path.join(dossier, 'index.json'), {
      sub,
      recolte_le: new Date().toISOString(),
      fenetre,
      mois,
      termes,
      posts: gardes.filter((x) => x.type === 'post').length,
      commentaires: gardes.filter((x) => x.type === 'commentaire').length,
      hors_fenetre: horsFenetre,
      // Sans ces deux dates, impossible de dire si la récolte couvre vraiment
      // la période annoncée ou seulement les trois dernières semaines.
      plus_ancien: gardes.map((x) => x.date).filter(Boolean).sort()[0] ?? null,
      plus_recent: gardes.map((x) => x.date).filter(Boolean).sort().slice(-1)[0] ?? null,
    })

    bilan.push({
      sub,
      posts: gardes.filter((x) => x.type === 'post').length,
      commentaires: gardes.filter((x) => x.type === 'commentaire').length,
      horsFenetre,
    })
  }

  journal.titre('Récolte')
  for (const b of bilan) {
    journal.detail(
      `r/${b.sub.padEnd(20)} ${String(b.posts).padStart(3)} posts · ` +
        `${String(b.commentaires).padStart(4)} commentaires` +
        (b.horsFenetre ? ` · ${b.horsFenetre} écartés (hors fenêtre)` : '')
    )
  }
  const total = bilan.reduce((a, b) => a + b.posts + b.commentaires, 0)
  journal.ok(`${total} éléments dans veille/plateformes/`)
  if (!bilan.length) process.exitCode = 1
})
