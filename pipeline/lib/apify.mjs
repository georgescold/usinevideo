/**
 * apify.mjs — scraping YouTube et TikTok, avec rotation du pool de clés.
 *
 * Ce qui a été vérifié par des runs réels, et qu'il ne faut pas « corriger » :
 *
 *  - `subtitlesLanguage` DOIT valoir `"any"`. Avec `"fr"` ou `"en"`, une vidéo
 *    sans piste dans cette langue revient avec `subtitles: []` — silencieusement,
 *    et elle est facturée quand même.
 *  - Une URL morte ne fait PAS échouer le run : l'item porte une clé `error` et
 *    déclenche quand même la facturation. On filtre avant d'enregistrer.
 *  - La description est dans `text`, pas `description`. `duration` est une
 *    chaîne « HH:MM:SS ». `likes`, pas `likeCount`.
 *  - `usageTotalUsd` n'est pas à jour quand le run passe en SUCCEEDED : on
 *    compte nous-mêmes, en temps réel.
 *  - Les données ne sont conservées que 7 jours au palier gratuit : on persiste
 *    immédiatement.
 */

import { avecCle, clefGrillee, pool } from './trousseau.mjs'
import { demande, getJson, postJson, ErreurHttp } from './http.mjs'
import { journal, compact } from './journal.mjs'

const API = 'https://api.apify.com/v2'

/** Acteurs retenus, avec leur prix unitaire constaté. */
export const ACTEURS = {
  youtube: { id: 'streamers~youtube-scraper', prixParVideo: 0.004 },
  transcriptSeul: { id: 'scrape-creators~best-youtube-transcripts-scraper', prixParVideo: 0.001 },
  tagsReels: { id: 'apidojo~youtube-scraper', prixParVideo: 0.0005 },
  tiktok: { id: 'clockworks~tiktok-scraper', prixParVideo: 0.004 },
  // Reddit : posts ET commentaires comptent chacun pour un resultat facture.
  reddit: { id: 'trudax~reddit-scraper-lite', prixParVideo: 0.004 },
}

/** En dessous de ce reste, on considère la clé épuisée et on passe à la suivante. */
const RESERVE_USD = 0.05

/** Traduit une réponse HTTP Apify en décision : changer de clé, ou échouer. */
function interprete(e) {
  const statut = e?.statut
  if (statut === 401 || statut === 402 || statut === 403) {
    throw clefGrillee(`clé refusée (HTTP ${statut})`, { definitif: statut === 401 })
  }
  if (statut === 429) {
    throw clefGrillee('limite de débit atteinte')
  }
  // 400 et 404 sont des bugs de notre côté : changer de clé n'y changerait rien
  // et brûlerait les dix-sept.
  throw e
}

/** Crédit restant sur une clé, en dollars. Un seul appel suffit. */
export async function creditRestant(cle) {
  const r = await getJson(`${API}/users/me/limits`, {
    headers: { authorization: `Bearer ${cle}` },
  })
  const max = r?.data?.limits?.maxMonthlyUsageUsd
  const consomme = r?.data?.current?.monthlyUsageUsd
  if (typeof max !== 'number' || typeof consomme !== 'number') return null
  return Math.max(0, max - consomme)
}

/**
 * Lance un acteur et rend les items du dataset.
 *
 * En dessous de 35 résultats on reste en synchrone (le mode synchrone d'Apify
 * coupe à 300 s, et l'acteur YouTube met environ 7 s par vidéo). Au-delà, on
 * passe en asynchrone avec relevé d'avancement.
 */
export async function lanceActeur(acteur, entree, { attenduItems = 20, surAvancement = null } = {}) {
  const prix = acteur.prixParVideo ?? 0
  const plafond = Math.max(0.1, attenduItems * prix * 1.15)

  return avecCle('apify', async (cle, entreeCle) => {
    const reste = await creditRestant(cle).catch((e) => interprete(e))
    if (reste !== null && reste < Math.max(RESERVE_USD, plafond)) {
      throw clefGrillee(`crédit insuffisant (${reste.toFixed(3)} $ restants)`)
    }

    const synchrone = attenduItems <= 35
    try {
      if (synchrone) {
        const url =
          `${API}/acts/${acteur.id}/run-sync-get-dataset-items` +
          `?token=${cle}&maxTotalChargeUsd=${plafond.toFixed(4)}&timeout=280`
        const r = await demande(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entree),
          tempsMortMs: 300_000,
          essais: 1,
        })
        const items = await r.json()
        return { items, cle: entreeCle.label, coutEstime: items.length * prix }
      }

      const run = await postJson(
        `${API}/acts/${acteur.id}/runs?token=${cle}&maxTotalChargeUsd=${plafond.toFixed(4)}`,
        entree
      )
      const idRun = run?.data?.id
      const idDataset = run?.data?.defaultDatasetId
      if (!idRun) throw new Error(`Apify n'a pas rendu d'identifiant de run.`)

      const items = await attends(cle, idRun, idDataset, { surAvancement })
      return { items, cle: entreeCle.label, coutEstime: items.length * prix }
    } catch (e) {
      if (e instanceof ErreurHttp) interprete(e)
      throw e
    }
  })
}

async function attends(cle, idRun, idDataset, { surAvancement, pasMs = 5000, plafondMs = 1_800_000 }) {
  const debut = Date.now()
  for (;;) {
    const etat = await getJson(`${API}/actor-runs/${idRun}?token=${cle}`)
    const statut = etat?.data?.status
    if (statut === 'SUCCEEDED') break
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(statut)) {
      throw new Error(
        `Le run Apify s'est terminé en ${statut}. ` +
          `Détail : https://console.apify.com/actors/runs/${idRun}`
      )
    }
    if (Date.now() - debut > plafondMs) {
      throw new Error(`Le run Apify dépasse 30 minutes. Abandon (il continue de son côté).`)
    }
    surAvancement?.(Math.round((Date.now() - debut) / 1000))
    await new Promise((r) => setTimeout(r, pasMs))
  }
  return getJson(`${API}/datasets/${idDataset}/items?clean=true&format=json&token=${cle}`)
}

// ---------------------------------------------------------------------------
//  YouTube
// ---------------------------------------------------------------------------

/** « 00:12:34 » → 754. Le champ arrive en chaîne, jamais en nombre. */
export function dureeEnSecondes(chaine) {
  if (typeof chaine !== 'string') return null
  const parts = chaine.split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return null
  return parts.reduce((total, n) => total * 60 + n, 0)
}

/**
 * Score de performance.
 *
 * Le nombre de vues seul ne dit rien : 300 000 vues sur une chaîne d'un million
 * d'abonnés est un échec, 30 000 sur une chaîne de 800 est une explosion. On
 * regarde donc le rapport aux abonnés, tempéré par l'ordre de grandeur (pour ne
 * pas faire remonter une vidéo à 900 vues sur une chaîne de 3 abonnés) et par
 * l'âge (ce qui marche aujourd'hui compte plus que ce qui marchait en 2019).
 */
export function score({ vues, abonnes, ageJours }) {
  // Sans les deux chiffres, il n'y a pas de signal — et une donnée absente ne
  // doit surtout pas se transformer en score élevé. C'est ce qui faisait
  // remonter en tête des vidéos à zéro vue.
  if (!Number.isFinite(vues) || !Number.isFinite(abonnes) || vues <= 0 || abonnes <= 0) return 0

  const ratio = vues / abonnes
  // Le logarithme empêche une chaîne de 30 abonnés avec 400 vues de dominer une
  // chaîne de 50 000 abonnés avec 800 000 vues : le ratio dit « ça a débordé »,
  // l'ordre de grandeur dit « et ça a débordé loin ».
  return Math.log10(vues) * ratio * Math.exp(-(ageJours || 0) / 90)
}

/** Normalise un item brut de `streamers~youtube-scraper`. */
export function normaliseVideo(brut) {
  const dureeS = dureeEnSecondes(brut.duration)
  const date = brut.date ? new Date(brut.date) : null
  const ageJours = date ? Math.max(0, (Date.now() - date.getTime()) / 86_400_000) : null
  const soustitres = Array.isArray(brut.subtitles) ? brut.subtitles : []
  const meilleur =
    soustitres.find((s) => s.type === 'user_generated') || soustitres[0] || null

  return {
    id: brut.id,
    url: brut.url,
    titre: brut.title,
    // Piège : la description est dans `text`.
    description: brut.text ?? null,
    miniature: brut.thumbnailUrl ?? null,
    vues: brut.viewCount ?? null,
    likes: brut.likes ?? null,
    commentaires: brut.commentsCount ?? null,
    date: brut.date ?? null,
    ageJours: ageJours === null ? null : Math.round(ageJours),
    dureeS,
    duree: brut.duration ?? null,
    chaine: brut.channelName ?? null,
    chaineUrl: brut.channelUrl ?? null,
    chaineId: brut.channelId ?? null,
    abonnes: brut.numberOfSubscribers ?? null,
    hashtags: brut.hashtags ?? [],
    monetisee: brut.isMonetized ?? null,
    transcript: meilleur?.plaintext ?? null,
    transcriptAuto: meilleur ? meilleur.type === 'auto_generated' : null,
    transcriptLangue: meilleur?.language ?? null,
    score: score({ vues: brut.viewCount, abonnes: brut.numberOfSubscribers, ageJours }),
    ratioVuesAbonnes:
      brut.viewCount && brut.numberOfSubscribers
        ? Number((brut.viewCount / Math.max(brut.numberOfSubscribers, 1)).toFixed(2))
        : null,
  }
}

/**
 * Cherche des vidéos dans une niche.
 *
 * @param requetes   Les recherches à lancer, en langue de la chaîne.
 * @param parRequete Nombre de vidéos par recherche.
 */
export async function chercheYoutube(
  requetes,
  { parRequete = 20, fraicheur = 'year', duree = null, tri = 'relevance', shorts = false } = {}
) {
  const entree = {
    searchQueries: requetes,
    maxResults: parRequete,
    maxResultsShorts: shorts ? parRequete : 0,
    maxResultStreams: 0,
    downloadSubtitles: true,
    subtitlesFormat: 'plaintext',
    // Impératif : voir l'en-tête de fichier.
    subtitlesLanguage: 'any',
    preferAutoGeneratedSubtitles: false,
    sortingOrder: tri,
    dateFilter: fraicheur,
    ...(duree ? { lengthFilter: duree } : {}),
  }

  const attendu = requetes.length * parRequete
  const { items, coutEstime, cle } = await lanceActeur(ACTEURS.youtube, entree, {
    attenduItems: attendu,
    surAvancement: (s) => process.stdout.write(`\r  scraping… ${s} s   `),
  })
  process.stdout.write('\r' + ' '.repeat(28) + '\r')

  return trie(items, coutEstime, cle)
}

/** Récupère des vidéos précises à partir de leurs URLs. */
export async function detailleYoutube(urls) {
  const entree = {
    startUrls: urls.map((url) => ({ url, method: 'GET' })),
    downloadSubtitles: true,
    subtitlesFormat: 'plaintext',
    subtitlesLanguage: 'any',
    preferAutoGeneratedSubtitles: false,
  }
  const { items, coutEstime, cle } = await lanceActeur(ACTEURS.youtube, entree, {
    attenduItems: urls.length,
  })
  return trie(items, coutEstime, cle)
}

function trie(items, coutEstime, cle) {
  const brutes = Array.isArray(items) ? items : []
  // Une URL morte revient avec une clé `error`, en SUCCEEDED, et facturée.
  const cassees = brutes.filter((i) => i && i.error)
  const bonnes = brutes.filter((i) => i && !i.error && i.id)

  const videos = bonnes.map(normaliseVideo).sort((a, b) => b.score - a.score)
  const sansTranscript = videos.filter((v) => !v.transcript).length

  journal.detail(
    `${videos.length} vidéos · ${cassees.length} indisponibles · ` +
      `${sansTranscript} sans transcript · ${coutEstime.toFixed(3)} $ · clé ${cle}`
  )

  return { videos, cassees, coutEstime, cle }
}

/** Repêche les transcripts manquants avec un acteur dédié, dix fois moins cher. */
export async function repecheTranscripts(videos) {
  const manquants = videos.filter((v) => !v.transcript)
  if (manquants.length === 0) return { repeches: 0, coutEstime: 0 }

  const { items, coutEstime } = await lanceActeur(
    ACTEURS.transcriptSeul,
    { videoUrls: manquants.map((v) => v.url) },
    { attenduItems: manquants.length }
  )

  let repeches = 0
  for (const item of Array.isArray(items) ? items : []) {
    const cible = manquants.find((v) => v.id === item.id || v.url === item.url)
    const texte = item.transcript_only_text || item.transcriptText || null
    if (cible && texte) {
      cible.transcript = texte
      cible.transcriptLangue = item.language ?? null
      repeches++
    }
  }
  return { repeches, coutEstime }
}

// ---------------------------------------------------------------------------
//  TikTok
// ---------------------------------------------------------------------------

/**
 * Détaille des posts TikTok.
 *
 * On n'appelle Apify qu'en second : `yt-dlp` couvre déjà les cinq statistiques
 * qui comptent, en local et gratuitement (voir `tiktok.mjs`). Apify sert de
 * repli quand yt-dlp est bloqué.
 */
export async function detailleTiktok(urls) {
  const entree = {
    postURLs: urls,
    shouldDownloadVideos: false,
    shouldDownloadCovers: true,
    shouldDownloadSubtitles: true,
    shouldDownloadSlideshowImages: false,
    resultsPerPage: urls.length,
  }
  const { items, coutEstime, cle } = await lanceActeur(ACTEURS.tiktok, entree, {
    attenduItems: urls.length,
  })

  const posts = (Array.isArray(items) ? items : [])
    .filter((i) => i && !i.error)
    .map((brut) => ({
      id: brut.id ?? null,
      url: brut.webVideoUrl ?? brut.postPage ?? null,
      texte: brut.text ?? null,
      vues: brut.playCount ?? null,
      likes: brut.diggCount ?? null,
      commentaires: brut.commentCount ?? null,
      partages: brut.shareCount ?? null,
      sauvegardes: brut.collectCount ?? null,
      dureeS: brut.videoMeta?.duration ?? null,
      couverture: brut.videoMeta?.coverUrl ?? brut.covers?.[0] ?? null,
      auteur: brut.authorMeta?.name ?? null,
      auteurAbonnes: brut.authorMeta?.fans ?? null,
      son: brut.musicMeta?.musicName ?? null,
      sonAuteur: brut.musicMeta?.musicAuthor ?? null,
      hashtags: (brut.hashtags || []).map((h) => h.name ?? h),
      date: brut.createTimeISO ?? null,
      soustitres: brut.videoMeta?.subtitleLinks ?? [],
    }))

  journal.detail(`${posts.length} posts TikTok · ${coutEstime.toFixed(3)} $ · clé ${cle}`)
  return { posts, coutEstime, cle }
}

// ---------------------------------------------------------------------------
//  État du pool
// ---------------------------------------------------------------------------

/** Crédit total du pool. Interroge toutes les clés en parallèle. */
export async function etatPool() {
  const cles = pool('apify')
  const resultats = await Promise.all(
    cles.map(async (e) => {
      try {
        const reste = await creditRestant(e.key)
        return { label: e.label, reste, vivante: reste !== null }
      } catch (err) {
        return { label: e.label, reste: null, vivante: false, raison: err.statut ?? err.message }
      }
    })
  )
  const total = resultats.reduce((a, r) => a + (r.reste ?? 0), 0)
  return {
    cles: resultats,
    total,
    vivantes: resultats.filter((r) => r.vivante).length,
    videosPossibles: Math.floor(total / ACTEURS.youtube.prixParVideo),
  }
}

/** Affiche le budget avant de dépenser. Sert aux garde-fous des skills. */
export function annonceCout(nbVideos, acteur = ACTEURS.youtube) {
  const cout = nbVideos * acteur.prixParVideo
  return `${nbVideos} vidéos ≈ ${cout.toFixed(2)} $ (${compact(nbVideos)} × ${acteur.prixParVideo} $)`
}
