/**
 * broll-perso.mjs — tes propres plans, et comment ils trouvent leur place.
 *
 * POURQUOI UNE BIBLIOTHÈQUE À PART.
 *
 * Les plans de coupe viennent de Pexels : c'est gratuit, immédiat, et ça donne
 * une femme qui regarde son téléphone quand on en demande une. Mais Pexels ne
 * connaîtra jamais TON produit, TON visage, la capture d'écran de TON tableau de
 * bord. Ces plans-là, tu les as, et il n'y a aucune raison de les redéposer à
 * chaque vidéo : ils appartiennent à la chaîne, pas à un montage.
 *
 * D'où `assets/broll/` : un fichier, des mots-clés, et le montage s'en sert tout
 * seul quand un plan les appelle.
 *
 * COMMENT UN PLAN TROUVE SA PLACE, ET POURQUOI CE N'EST PAS DE LA DEVINETTE.
 *
 * Chaque événement de plan de coupe porte deux textes :
 *
 *   `requete`  ce qu'on demanderait à Pexels, en anglais
 *   `ancre`    le mot du script sur lequel le plan doit tomber, en français
 *
 * On cherche les mots-clés de l'asset dans ces deux textes réunis. Un mot-clé
 * trouvé vaut un point ; un mot-clé de plusieurs mots trouvé en entier en vaut
 * deux, parce qu'une coïncidence sur « guide relationnel » est bien moins
 * probable que sur « guide ».
 *
 * LE SEUIL EST À UN POINT, ET IL COMPTE. Sans seuil, l'asset le moins mal noté
 * gagnerait toujours, y compris sur un passage qui n'a rien à voir : un plan de
 * ton produit tomberait au milieu d'une phrase sur la météo. Un asset qui ne
 * marque aucun point n'est simplement pas employé, et Pexels reprend la main.
 *
 * LA RÉPÉTITION EST BORNÉE. Le même plan qui revient six fois se lit comme un
 * manque de matière. `emplois_max` vaut 1 par défaut : un asset sert une fois
 * par vidéo, sauf mention contraire.
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, litJson, ecritJson, assureDossier } from './chemins.mjs'

/** Le dossier des plans personnels, et son manifeste. */
export const DOSSIER = path.join(CHEMINS.assets, 'broll')
const MANIFESTE = path.join(DOSSIER, 'plans.json')

export const EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.avif'])

const estImage = (f) => /\.(jpe?g|png|webp|avif)$/i.test(f)

/** Sans accent, sans ponctuation, en minuscules : la forme sur laquelle on compare. */
export const nu = (t) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * La bibliothèque, telle qu'elle est sur le disque.
 *
 * Le manifeste ne fait pas autorité sur l'EXISTENCE des fichiers : c'est le
 * dossier qui la fait. Un fichier posé à la main sans être déclaré apparaît
 * quand même, sans mots-clés — visible, donc corrigeable, plutôt qu'ignoré en
 * silence. Une entrée de manifeste sans fichier disparaît de la liste.
 */
export function bibliotheque() {
  if (!fs.existsSync(DOSSIER)) return []
  const manifeste = litJson(MANIFESTE, {}) ?? {}
  const sortie = []
  for (const fichier of fs.readdirSync(DOSSIER).sort()) {
    if (!EXTENSIONS.has(path.extname(fichier).toLowerCase())) continue
    const d = manifeste[fichier] ?? {}
    let poids = null
    try {
      poids = fs.statSync(path.join(DOSSIER, fichier)).size
    } catch { /* un fichier qui disparaît entre le listage et le stat */ }
    sortie.push({
      fichier,
      motscles: Array.isArray(d.motscles) ? d.motscles.filter(Boolean).map(String) : [],
      note: d.note ?? null,
      emploisMax: Number.isInteger(d.emplois_max) ? d.emplois_max : 1,
      image: estImage(fichier),
      poids,
    })
  }
  return sortie
}

/** Réécrit le manifeste à partir d'une liste complète. */
export function enregistre(entrees) {
  assureDossier(DOSSIER)
  const manifeste = {}
  for (const e of entrees) {
    manifeste[e.fichier] = {
      motscles: e.motscles ?? [],
      ...(e.note ? { note: e.note } : {}),
      ...(e.emploisMax !== 1 ? { emplois_max: e.emploisMax } : {}),
    }
  }
  ecritJson(MANIFESTE, manifeste)
  return manifeste
}

/**
 * Note un asset contre un événement de plan de coupe.
 *
 * Rend `{ score, trouves }` — `trouves` dit QUELS mots-clés ont accroché, parce
 * qu'un placement qu'on ne peut pas expliquer est un placement qu'on ne peut pas
 * corriger.
 */
export function note(asset, evenement) {
  // Les deux textes sont réunis : la requête dit ce que le plan doit MONTRER,
  // l'ancre dit ce que la voix DIT à cet instant. Un mot-clé peut légitimement
  // accrocher sur l'un ou sur l'autre.
  const botte = `${nu(evenement.requete)} ${nu(evenement.ancre)} ${nu(evenement.texte)}`.trim()
  if (!botte) return { score: 0, trouves: [] }

  let score = 0
  const trouves = []
  for (const brut of asset.motscles) {
    const cle = nu(brut)
    if (!cle) continue
    const mots = cle.split(' ')
    // Frontières de mot explicites : sans elles, « or » accrocherait sur
    // « corps » et le placement deviendrait incompréhensible.
    const motif = new RegExp(`(?:^| )${mots.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ')}(?: |$)`)
    if (!motif.test(` ${botte} `)) continue
    score += mots.length > 1 ? 2 : 1
    trouves.push(brut)
  }
  return { score, trouves }
}

/**
 * Attribue les plans personnels aux événements, avant tout appel à Pexels.
 *
 * Ne modifie rien : rend la liste des attributions retenues. C'est l'appelant
 * qui décide d'y donner suite — la fonction sert aussi à MONTRER ce qui se
 * passerait, sans rien faire.
 */
export function attribue(evenements, { assets = null } = {}) {
  const liste = assets ?? bibliotheque()
  if (!liste.length) return []

  // On classe les candidatures par score décroissant et on sert les meilleures
  // d'abord : un asset très pertinent quelque part ne doit pas être consommé
  // par un passage où il n'accroche qu'à moitié.
  const candidatures = []
  for (const [i, e] of evenements.entries()) {
    if (e.type !== 'broll' || e.src) continue
    for (const asset of liste) {
      const { score, trouves } = note(asset, e)
      if (score > 0) candidatures.push({ i, asset, score, trouves })
    }
  }
  candidatures.sort((a, b) => b.score - a.score || a.i - b.i)

  const emplois = new Map()
  const pris = new Set()
  const retenues = []
  for (const c of candidatures) {
    if (pris.has(c.i)) continue
    const dejaVu = emplois.get(c.asset.fichier) ?? 0
    if (dejaVu >= c.asset.emploisMax) continue
    emplois.set(c.asset.fichier, dejaVu + 1)
    pris.add(c.i)
    retenues.push(c)
  }
  return retenues.sort((a, b) => a.i - b.i)
}
