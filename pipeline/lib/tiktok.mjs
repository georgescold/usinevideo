/**
 * tiktok.mjs — ce qui se cache derrière un lien TikTok.
 *
 * On essaie d'abord `yt-dlp`, en local et gratuitement : il couvre les cinq
 * statistiques qui comptent, **sauvegardes comprises**, ce qu'aucun acteur
 * payant ne fait mieux. Apify ne sert que de repli quand TikTok bloque.
 *
 * Le transcript ne vient jamais de la plateforme : on télécharge l'audio et on
 * transcrit en local. Les sous-titres TikTok sont souvent absents, tronqués, ou
 * réécrits par l'auteur — ils ne disent pas ce qui a été dit.
 */

import fs from 'node:fs'
import path from 'node:path'
import { lance } from './ffmpeg.mjs'
import { CHEMINS, assureDossier, env } from './chemins.mjs'
import { journal } from './journal.mjs'

/** Emplacements où chercher yt-dlp, du plus probable au moins probable. */
const CANDIDATS_YTDLP = [
  env('YTDLP_PATH', null),
  'yt-dlp',
  path.join(
    process.env.LOCALAPPDATA || '',
    'com.debpalash.omnivoice-studio',
    'project',
    '.venv',
    'Scripts',
    'yt-dlp.exe'
  ),
].filter(Boolean)

let cheminYtdlp = null

export async function trouveYtdlp() {
  if (cheminYtdlp) return cheminYtdlp
  for (const candidat of CANDIDATS_YTDLP) {
    const { code } = await lance(candidat, ['--version'])
    if (code === 0) {
      cheminYtdlp = candidat
      return candidat
    }
  }
  return null
}

const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function normalise(brut) {
  return {
    id: brut.id ?? null,
    url: brut.webpage_url ?? null,
    texte: brut.description ?? brut.title ?? null,
    vues: nombre(brut.view_count),
    likes: nombre(brut.like_count),
    commentaires: nombre(brut.comment_count),
    partages: nombre(brut.repost_count),
    sauvegardes: nombre(brut.save_count),
    dureeS: nombre(brut.duration),
    auteur: brut.uploader ?? brut.channel ?? null,
    auteurUrl: brut.uploader_url ?? brut.channel_url ?? null,
    auteurAbonnes: nombre(brut.channel_follower_count),
    date: brut.upload_date
      ? `${brut.upload_date.slice(0, 4)}-${brut.upload_date.slice(4, 6)}-${brut.upload_date.slice(6, 8)}`
      : null,
    son: brut.track ?? null,
    sonAuteur: Array.isArray(brut.artists) ? brut.artists.join(', ') : (brut.artist ?? null),
    hashtags: [...String(brut.description ?? '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]),
    couverture: brut.thumbnail ?? null,
    source: 'yt-dlp',
  }
}

/**
 * Métadonnées d'un post, sans rien télécharger.
 *
 * @returns null si yt-dlp échoue — l'appelant bascule alors sur Apify.
 */
export async function metadonnees(url) {
  const bin = await trouveYtdlp()
  if (!bin) return null

  const { code, stdout, stderr } = await lance(bin, ['-J', '--no-warnings', '--no-playlist', url])
  if (code !== 0) {
    journal.detail(`yt-dlp a échoué sur ${url} : ${stderr.trim().split('\n').slice(-1)[0]}`)
    return null
  }
  try {
    return normalise(JSON.parse(stdout))
  } catch {
    return null
  }
}

/** Télécharge l'audio d'un post, pour le transcrire ensuite. */
export async function telechargeAudio(url, destinationSansExtension) {
  const bin = await trouveYtdlp()
  if (!bin) throw new Error(`yt-dlp est introuvable. Renseigne YTDLP_PATH dans .env.`)

  assureDossier(path.dirname(destinationSansExtension))
  const { code, stderr } = await lance(bin, [
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'wav',
    '--audio-quality', '0',
    '--no-warnings',
    '--no-playlist',
    '-o', `${destinationSansExtension}.%(ext)s`,
    url,
  ])
  const attendu = `${destinationSansExtension}.wav`
  if (code !== 0 || !fs.existsSync(attendu)) {
    throw new Error(
      `Téléchargement de l'audio impossible.\n${stderr.trim().split('\n').slice(-3).join('\n')}`
    )
  }
  return attendu
}

/**
 * Télécharge la VIDÉO, pas seulement son audio.
 *
 * POURQUOI ON LA RAPATRIE AU LIEU DE L'AFFICHER EN LIGNE.
 *
 * Un lecteur embarqué de TikTok ou de YouTube demanderait d'ouvrir la politique
 * de sécurité de l'atelier aux domaines de ces plateformes — donc d'y laisser
 * entrer leurs scripts et leurs traceurs, dans une page qui affiche par
 * ailleurs le contenu de la chaîne. Le fichier local évite ça, se relit hors
 * connexion, et ne disparaît pas le jour où l'auteur retire sa vidéo. C'est ce
 * dernier point qui tranche : une inspiration qu'on ne peut plus revoir n'est
 * plus une inspiration.
 *
 * `hauteurMax` borne le poids. Une vidéo de référence se juge sur son montage
 * et ses accroches, pas sur sa définition : 720 pixels suffisent, et au-delà de
 * dix minutes on descend d'un cran parce que le fichier, lui, ne se borne pas.
 */
export async function telechargeVideo(url, destinationSansExtension, { hauteurMax = 720 } = {}) {
  const bin = await trouveYtdlp()
  if (!bin) throw new Error(`yt-dlp est introuvable. Renseigne YTDLP_PATH dans .env.`)

  assureDossier(path.dirname(destinationSansExtension))
  const h = Math.max(144, Math.min(1080, Number(hauteurMax) || 720))
  const dossier = path.dirname(destinationSansExtension)
  const base = path.basename(destinationSansExtension)

  const trouveLeFichier = () => {
    const f = fs
      .readdirSync(dossier)
      .filter((x) => x.startsWith(`${base}.`) && /\.(mp4|webm|mkv|mov)$/i.test(x))
      .sort((a, b) => (a.endsWith('.mp4') ? -1 : 0) - (b.endsWith('.mp4') ? -1 : 0))
    return f.length ? path.join(dossier, f[0]) : null
  }

  // DEUX TENTATIVES, ET LA SECONDE N'EST PAS UNE PRÉCAUTION DE PRINCIPE.
  //
  // Le premier sélecteur demande les flux séparés — image et son téléchargés à
  // part, puis assemblés — ce qui donne la meilleure définition disponible.
  // YouTube y répond aujourd'hui « 403 Forbidden » : ses flux adaptatifs sont
  // protégés, et la parade change au fil des versions de yt-dlp. Mesuré le
  // 29 août 2026 : `bestvideo+bestaudio` échoue, `best` passe.
  //
  // Le second sélecteur demande un flux progressif — image et son déjà réunis
  // dans un seul fichier. YouTube le sert sans discuter, plafonné plus bas.
  //
  // On garde donc les deux dans cet ordre : la qualité quand elle est
  // accessible, l'image quand elle ne l'est pas. Figer le second seul
  // dégraderait TikTok, qui n'a jamais eu ce problème ; figer le premier laisse
  // YouTube au bord de la route.
  const tentatives = [
    `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio`,
    `best[height<=${h}][ext=mp4]/best[height<=${h}]/best`,
  ]

  let dernierStderr = ''
  for (const format of tentatives) {
    const { code, stderr } = await lance(bin, [
      // On vise le MP4 : c'est le seul conteneur que tous les navigateurs lisent
      // sans extension. Un WebM VP9 passerait sur Chrome et pas ailleurs, et
      // l'aperçu resterait noir sans rien expliquer.
      '-f', format,
      '--merge-output-format', 'mp4',
      '--no-warnings',
      '--no-playlist',
      '-o', `${destinationSansExtension}.%(ext)s`,
      url,
    ])
    dernierStderr = stderr
    const fichier = trouveLeFichier()
    if (code === 0 && fichier) return fichier
    // Un essai raté peut laisser un fragment derrière lui : le suivant écrirait
    // à côté, et on servirait un fichier tronqué en croyant l'avoir rapatrié.
    //
    // Le ménage ne vise QUE les conteneurs vidéo et les fragments. La couverture
    // `<id>.jpg` porte le même préfixe et n'a rien à voir avec cet échec : la
    // balayer ferait perdre, sur un simple `--refais`, une vignette que rien ne
    // redemanderait.
    const aJeter = /\.(mp4|webm|mkv|mov|part|ytdl|f\d+)$/i
    for (const reste of fs.readdirSync(dossier)) {
      if (reste.startsWith(`${base}.`) && aJeter.test(reste)) {
        try { fs.rmSync(path.join(dossier, reste), { force: true }) } catch { /* rien à nettoyer */ }
      }
    }
  }

  throw new Error(
    `Téléchargement de la vidéo impossible.\n${dernierStderr.trim().split('\n').slice(-3).join('\n')}`
  )
}

/** Télécharge la couverture, utile pour comparer les premières images. */
export async function telechargeCouverture(url, destination) {
  const bin = await trouveYtdlp()
  if (!bin) return null
  assureDossier(path.dirname(destination))
  const base = destination.replace(/\.[^.]+$/, '')
  const { code } = await lance(bin, [
    '--write-thumbnail',
    '--skip-download',
    '--convert-thumbnails', 'jpg',
    '--no-warnings',
    '-o', `${base}.%(ext)s`,
    url,
  ])
  const attendu = `${base}.jpg`
  return code === 0 && fs.existsSync(attendu) ? attendu : null
}

/**
 * Taux d'engagement, en pourcentage des vues.
 *
 * Ce sont ces rapports qui expliquent une performance, pas les valeurs brutes.
 * Une vidéo à 40 000 vues avec 8 % de sauvegardes dit quelque chose qu'une
 * vidéo à 2 millions de vues avec 0,1 % de likes ne dit pas.
 */
export function engagement(post) {
  const v = post.vues || 0
  if (!v) return null
  const pc = (n) => (n === null ? null : Number(((n / v) * 100).toFixed(2)))
  return {
    likes: pc(post.likes),
    commentaires: pc(post.commentaires),
    partages: pc(post.partages),
    // Le plus révélateur des quatre : on sauvegarde ce qu'on compte revoir ou
    // appliquer. C'est le signal d'utilité, pas de divertissement.
    sauvegardes: pc(post.sauvegardes),
    // Sur TikTok, dépasser le nombre d'abonnés de l'auteur signe une sortie de
    // l'audience acquise : la vidéo a marché toute seule.
    ratioAbonnes: post.auteurAbonnes
      ? Number((v / Math.max(post.auteurAbonnes, 1)).toFixed(2))
      : null,
  }
}

/** Où ranger la matière d'un post. */
export function dossiers(id) {
  return {
    meta: path.join(CHEMINS.veilleTiktokRaw, `${id}.json`),
    audio: path.join(CHEMINS.veilleTiktokMedia, id),
    couverture: path.join(CHEMINS.veilleTiktokMedia, `${id}.jpg`),
    transcript: path.join(CHEMINS.veilleTiktokTranscripts, `${id}.json`),
  }
}
