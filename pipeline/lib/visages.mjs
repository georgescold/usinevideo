/**
 * visages.mjs — un visage dans le plan, et sa taille.
 *
 * POURQUOI CE SIGNAL EST À PART DES TROIS AUTRES.
 *
 * Mouvement, contraste et couleur disent ce qu'il y a dans l'image. Le visage
 * dit ce qu'on y CHERCHE : c'est la forme que le regard humain repère avant de
 * comprendre ce qu'il voit, et le seul support d'émotion qui se lise en une
 * demi-seconde. Sur un plan d'ouverture, il prime sur les trois autres.
 *
 * La démonstration est dans le montage de « video-2ap ». Le plan 24 sort
 * mouvement 1,2 · contraste 13,6 · couleur 0,3 — terne sur les trois relevés,
 * donc condamné par la règle précédente. C'est un portrait en gros plan, en
 * clair-obscur, noir et blanc : le plan le plus chargé du lot. Trois nombres
 * disaient le contraire de ce qu'un œil voit en un dixième de seconde.
 *
 * CE SIGNAL EST UN BONUS, JAMAIS UNE EXCLUSION.
 *
 * Le détecteur rate des visages — profils marqués, contre-jours, trois-quarts
 * dans le noir. « Aucun visage trouvé » veut donc dire « pas trouvé », jamais
 * « il n'y en a pas ». Un plan avec visage passe devant ; un plan sans visage
 * reste candidat.
 *
 * ET IL NE LIT PAS L'ÉMOTION. Il repère le véhicule, pas ce qu'il transporte.
 * Un visage vide rend le même chiffre qu'un visage bouleversé — l'émotion, elle,
 * se juge à l'œil, sur l'écran de revue.
 *
 * OpenCV est facultatif : sans lui, le pipeline retombe sur les trois relevés
 * et le dit une fois. Un montage ne s'arrête pas parce qu'une bibliothèque
 * Python manque.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS } from './chemins.mjs'
import { journal } from './journal.mjs'
import { lance } from './ffmpeg.mjs'

const SCRIPT = () => path.join(CHEMINS.outils, 'python', 'visages.py')

/**
 * L'interpréteur à employer, cherché une fois.
 *
 * `null` = cherché et introuvable ; `undefined` = pas encore cherché. La
 * distinction évite de relancer trois processus par candidat sur un poste qui
 * n'a pas OpenCV.
 */
let python

async function trouvePython() {
  if (python !== undefined) return python

  const candidats = [process.env.PYTHON_PATH, 'python', 'py'].filter(Boolean)
  for (const binaire of candidats) {
    try {
      const r = await lance(binaire, ['-c', 'import cv2'])
      if (r.code === 0) {
        python = binaire
        return python
      }
    } catch {
      // Binaire absent : on essaie le suivant.
    }
  }

  python = null
  journal.detail(
    `OpenCV n'est pas installé (pip install opencv-python-headless) : ` +
      `les plans sont choisis sans le repérage des visages.`
  )
  return python
}

/**
 * Cherche un visage dans chaque fichier.
 *
 * Un seul processus Python pour tout le lot : le démarrage de l'interpréteur et
 * le chargement d'OpenCV coûtent plus cher que l'analyse elle-même.
 *
 * @returns {Promise<Map<string, {present: boolean, taille: number, vues: number, trouve: number}>>}
 */
export async function chercheDesVisages(fichiers) {
  const vide = new Map()
  const liste = (fichiers ?? []).filter((f) => f && fs.existsSync(f))
  if (!liste.length) return vide

  const binaire = await trouvePython()
  if (!binaire) return vide

  const script = SCRIPT()
  if (!fs.existsSync(script)) return vide

  let r
  try {
    r = await lance(binaire, [script, ...liste])
  } catch {
    return vide
  }
  if (r.code !== 0) return vide

  const parFichier = new Map()
  for (const ligne of r.stdout.split('\n')) {
    const brut = ligne.trim()
    if (!brut.startsWith('{')) continue
    try {
      const o = JSON.parse(brut)
      if (o.fichier) parFichier.set(o.fichier, { present: Boolean(o.present), taille: o.taille ?? 0, vues: o.vues ?? 0, trouve: o.trouve ?? 0 })
    } catch {
      // Une ligne illisible n'invalide pas les autres.
    }
  }
  return parFichier
}

/** Le même, pour un seul fichier. Rend `null` quand on n'a pas pu regarder. */
export async function chercheUnVisage(fichier) {
  const m = await chercheDesVisages([fichier])
  return m.get(fichier) ?? null
}
