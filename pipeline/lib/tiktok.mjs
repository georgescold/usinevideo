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
