/**
 * chemins.mjs — où se trouve quoi.
 *
 * Tout est résolu à partir de l'emplacement réel de ce fichier, jamais du
 * répertoire courant ni d'un chemin absolu écrit en dur. C'est ce qui permet de
 * copier le dossier n'importe où et de le lancer depuis n'importe où.
 */

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/** Racine du projet : deux niveaux au-dessus de pipeline/lib/. */
export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const d = (...parts) => path.join(RACINE, ...parts)

/**
 * Cache partagé entre toutes les chaînes : binaires whisper, modèles, B-roll
 * déjà téléchargé. Surchargeable par STACK_CACHE si le disque système est petit.
 */
export const CACHE_PARTAGE =
  process.env.STACK_CACHE ||
  (os.platform() === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'stack-content')
    : path.join(os.homedir(), '.cache', 'stack-content'))

export const CHEMINS = {
  racine: RACINE,

  config: d('config'),
  chaine: d('config', 'chaine.json'),
  trousseau: d('config', 'keys.json'),
  env: d('.env'),

  // Le socle marketing est produit par la skill `avatars-et-produit` et garde
  // ses noms de fichiers, pour rester lisible par les autres agents.
  marque: d('marque'),
  ficheProduit: d('marque', 'Fiche-Produit.md'),
  ficheAvatars: d('marque', 'Fiche-Avatars.md'),
  hookBank: d('marque', 'Hook-Bank.md'),
  marketeur: d('marque', 'Le-Marketeur.md'),
  identiteVisuelle: d('marque', 'identite-visuelle.md'),
  ligneEditoriale: d('marque', 'ligne-editoriale.md'),

  veille: d('veille'),
  veilleYoutube: d('veille', 'youtube'),
  veilleYoutubeRaw: d('veille', 'youtube', 'raw'),
  veilleYoutubeMiniatures: d('veille', 'youtube', 'miniatures'),
  veilleYoutubeTranscripts: d('veille', 'youtube', 'transcripts'),
  veilleTiktok: d('veille', 'tiktok'),
  veilleTiktokRaw: d('veille', 'tiktok', 'raw'),
  veilleTiktokTranscripts: d('veille', 'tiktok', 'transcripts'),
  veilleTiktokMedia: d('veille', 'tiktok', 'media'),

  strategie: d('strategie'),
  videos: d('videos'),
  perf: d('perf'),

  assets: d('assets'),
  polices: d('assets', 'fonts'),
  luts: d('assets', 'luts'),
  musique: d('assets', 'musique'),
  broll: d('assets', 'broll'),
  logos: d('assets', 'logos'),
  sfx: d('assets', 'sfx'),

  remotion: d('remotion'),
  remotionEntree: d('remotion', 'src', 'index.ts'),
  remotionSortie: d('remotion', 'out'),

  // Les binaires et les modèles pèsent jusqu'à 3 Go. Ils vivent HORS du dossier
  // de chaîne, partagés entre toutes les chaînes : sans ça, chaque copie du
  // template dupliquerait des gigaoctets qui ne lui appartiennent pas.
  outils: d('outils'),
  outilsBin: path.join(CACHE_PARTAGE, 'bin'),
  outilsModeles: path.join(CACHE_PARTAGE, 'modeles'),
  cachePartage: CACHE_PARTAGE,
}

/** Dossier d'une vidéo, avec ses sous-dossiers numérotés. */
export function dossierVideo(slug) {
  const base = path.join(CHEMINS.videos, slug)
  return {
    base,
    brief: path.join(base, '00-brief.md'),
    script: path.join(base, '01-script.md'),
    scriptJson: path.join(base, '01-script.json'),
    tournage: path.join(base, '02-tournage'),
    audio: path.join(base, '03-audio'),
    transcript: path.join(base, '04-transcript.json'),
    montage: path.join(base, '05-montage'),
    plan: path.join(base, '05-montage', 'plan.json'),
    rendu: path.join(base, '06-rendu'),
    publication: path.join(base, '07-publication.md'),
  }
}

/** Crée un dossier s'il manque, et le rend. */
export function assureDossier(p) {
  fs.mkdirSync(p, { recursive: true })
  return p
}

/** Crée l'arborescence complète d'une vidéo. */
export function assureDossierVideo(slug) {
  const v = dossierVideo(slug)
  for (const p of [v.base, v.tournage, v.audio, v.montage, v.rendu]) assureDossier(p)
  return v
}

/** Lit un JSON, ou rend `defaut` si le fichier n'existe pas. */
export function litJson(chemin, defaut = null) {
  try {
    return JSON.parse(fs.readFileSync(chemin, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return defaut
    throw new Error(`JSON illisible : ${chemin}\n${e.message}`)
  }
}

/** Écrit un JSON indenté, en créant le dossier au besoin. */
export function ecritJson(chemin, valeur) {
  assureDossier(path.dirname(chemin))
  fs.writeFileSync(chemin, JSON.stringify(valeur, null, 2) + '\n', 'utf8')
  return chemin
}

/** Écrit un fichier texte, en créant le dossier au besoin. */
export function ecritTexte(chemin, contenu) {
  assureDossier(path.dirname(chemin))
  fs.writeFileSync(chemin, contenu, 'utf8')
  return chemin
}

/** Charge .env dans process.env sans écraser ce qui est déjà défini. */
export function chargeEnv() {
  if (!fs.existsSync(CHEMINS.env)) return
  const texte = fs.readFileSync(CHEMINS.env, 'utf8')
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, cle, brut] = m
    if (process.env[cle] !== undefined) continue
    process.env[cle] = brut.trim().replace(/^["'](.*)["']$/, '$1')
  }
}

/** Lit une variable d'environnement avec valeur de repli. */
export function env(cle, defaut = null) {
  chargeEnv()
  const v = process.env[cle]
  return v === undefined || v === '' ? defaut : v
}

/** Idem, en nombre. */
export function envNombre(cle, defaut) {
  const v = env(cle, null)
  if (v === null) return defaut
  const n = Number(v)
  return Number.isFinite(n) ? n : defaut
}

/** La carte d'identité de la chaîne. Lance une erreur parlante si absente. */
export function litChaine({ exigeInitialisee = false } = {}) {
  const c = litJson(CHEMINS.chaine, null)
  if (!c) throw new Error(`config/chaine.json est introuvable. Lance /init-chaine.`)
  if (exigeInitialisee && !c.initialise) {
    throw new Error(
      `La chaîne n'est pas initialisée. Lance /init-chaine avant de produire quoi que ce soit.`
    )
  }
  return c
}

/** Transforme un titre en slug utilisable comme nom de dossier. */
export function slugifie(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}
