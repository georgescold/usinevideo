/**
 * sources.mjs — d'où l'on accepte de tirer de la voix.
 *
 * POURQUOI CETTE LISTE N'EST PAS CELLE DU CARNET D'INSPIRATIONS.
 *
 * `inspirations.mjs` garde volontairement quatre plateformes : le carnet sert à
 * revoir des vidéos courtes de la niche, et une liste étroite y est une
 * qualité. Récolter une voix est un autre métier — la matière est là où la
 * personne parle, et elle parle sur une interview YouTube, un live Twitch, un
 * podcast SoundCloud ou une story Instagram indifféremment. Restreindre à
 * quatre hôtes ici, ce serait refuser les trois quarts du corpus.
 *
 * On ne passe pas pour autant à la liste ouverte de yt-dlp, qui couvre plus de
 * mille sites : l'adresse arrive d'un champ de saisie exposé sur le réseau
 * local et part en argument d'un programme externe. On énumère donc, et ce qui
 * n'est pas dans la liste passe par un FICHIER LOCAL — l'échappatoire du bas de
 * ce fichier, qui n'ouvre aucune surface réseau.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Les hôtes acceptés pour une récolte de voix. */
const HOTES = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)youtube-nocookie\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.watch$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)dailymotion\.com$/i,
  /(^|\.)dai\.ly$/i,
  /(^|\.)twitch\.tv$/i,
  /(^|\.)soundcloud\.com$/i,
]

export const PLATEFORMES_ACCEPTEES =
  'youtube, tiktok, instagram, facebook, x/twitter, vimeo, dailymotion, twitch, soundcloud'

/** Les extensions qu'on accepte de lire depuis le disque. */
const EXTENSIONS_LOCALES = new Set([
  '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.wma',
  '.mp4', '.mov', '.mkv', '.webm', '.avi',
])

/**
 * Valide une adresse avant de la passer à yt-dlp.
 *
 * ON REFUSE TOUT CE QUI N'EST PAS `https://`, ET CE N'EST PAS DU ZÈLE.
 *
 * L'adresse part en argument d'un programme. Une chaîne commençant par un tiret
 * y serait lue comme une option — `--exec` en fait exécuter une autre. Exiger le
 * schéma ferme la question sans avoir à énumérer les options dangereuses.
 */
export function verifieSource(brut) {
  const texte = String(brut ?? '').trim()
  let u
  try {
    u = new URL(texte)
  } catch {
    throw new Error(`« ${texte.slice(0, 80)} » n'est pas une adresse.`)
  }
  if (u.protocol !== 'https:') {
    throw new Error(`Seules les adresses https:// sont acceptées (reçu ${u.protocol}).`)
  }
  if (!HOTES.some((h) => h.test(u.hostname))) {
    throw new Error(
      `${u.hostname} n'est pas une plateforme acceptée.\n` +
        `  Acceptées : ${PLATEFORMES_ACCEPTEES}.\n` +
        `  Pour tout le reste : télécharge le fichier et donne son chemin.`
    )
  }
  return u.href
}

/** L'adresse ressemble-t-elle à une adresse, plutôt qu'à un chemin ? */
export const estUneAdresse = (brut) => /^[a-z][a-z0-9+.-]*:\/\//i.test(String(brut ?? '').trim())

/**
 * Valide un fichier local.
 *
 * L'ÉCHAPPATOIRE QUI ÉVITE D'OUVRIR LA LISTE DES HÔTES.
 *
 * Un podcast se sert depuis n'importe quel domaine, une interview arrive par
 * message, un enregistrement de conférence vit sur un disque. Énumérer ces
 * hôtes serait sans fin ; les télécharger soi-même et pointer le fichier ne
 * coûte rien et n'ouvre aucune surface réseau.
 */
export function verifieFichier(brut) {
  const chemin = path.resolve(String(brut ?? '').trim())
  if (!fs.existsSync(chemin)) {
    throw new Error(`« ${brut} » n'est ni une adresse acceptée ni un fichier qui existe.`)
  }
  if (!fs.statSync(chemin).isFile()) throw new Error(`« ${brut} » est un dossier, pas un fichier.`)
  const ext = path.extname(chemin).toLowerCase()
  if (!EXTENSIONS_LOCALES.has(ext)) {
    throw new Error(
      `« ${ext || 'sans extension'} » ne se lit pas comme du son.\n` +
        `  Attendu : ${[...EXTENSIONS_LOCALES].join(' ')}`
    )
  }
  return chemin
}

/** Une source, résolue : soit une adresse à télécharger, soit un fichier à lire. */
export function resoudLaSource(brut) {
  return estUneAdresse(brut)
    ? { type: 'adresse', valeur: verifieSource(brut) }
    : { type: 'fichier', valeur: verifieFichier(brut) }
}

/** D'où vient la source, pour l'afficher et pour trier. */
export function plateforme(url) {
  let h = ''
  try {
    h = new URL(url).hostname
  } catch {
    return 'fichier'
  }
  if (/tiktok/i.test(h)) return 'tiktok'
  if (/youtube|youtu\.be/i.test(h)) return 'youtube'
  if (/instagram/i.test(h)) return 'instagram'
  if (/facebook|fb\.watch/i.test(h)) return 'facebook'
  if (/twitter|x\.com/i.test(h)) return 'x'
  if (/vimeo/i.test(h)) return 'vimeo'
  if (/dailymotion|dai\.ly/i.test(h)) return 'dailymotion'
  if (/twitch/i.test(h)) return 'twitch'
  if (/soundcloud/i.test(h)) return 'soundcloud'
  return 'autre'
}

/**
 * Lit une liste d'adresses dans un fichier texte.
 *
 * UNE RÉCOLTE SÉRIEUSE SE COMPTE EN DIZAINES DE LIENS.
 *
 * Un entraînement demande quinze à trente minutes de voix propre, et une source
 * en rend rarement plus d'une ou deux. Coller quarante adresses une par une
 * dans un champ n'est pas un travail : on les rassemble dans un fichier, une
 * par ligne, et on donne le fichier. Le `#` ouvre un commentaire, pour pouvoir
 * écarter une source sans perdre son adresse.
 */
export function litLaListe(chemin) {
  const brut = fs.readFileSync(path.resolve(chemin), 'utf8')
  return brut
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
}
