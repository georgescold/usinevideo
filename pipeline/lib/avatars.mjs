/**
 * avatars.mjs — les visages de la chaîne, en lecture.
 *
 * UN AVATAR EST UN JEU DE PHOTOS, PAS UNE IMAGE.
 *
 * Un seul portrait suffit tant que la scène reste proche du cadrage d'origine.
 * Dès qu'on s'en éloigne — elle marche dehors, elle est de trois quarts, elle
 * est dans le noir — le modèle perd le visage et rend quelqu'un d'autre. C'est
 * arrivé sur un plan de marche : une brune de vingt-cinq ans à la place d'une
 * blonde de quarante-deux.
 *
 * Deux à quatre photos sous des angles différents suffisent à le tenir. Elles
 * partent ensemble à chaque génération, et le prompt nomme le SIGNE qui
 * identifie la personne — une mèche colorée, une monture, un tatouage.
 *
 * L'AVATAR APPARTIENT À LA CHAÎNE, comme la voix et la direction artistique :
 * il vit dans `marque/avatars/`, il suit le dossier, et `nouvelle-chaine` ne le
 * copie pas — un visage est ce qu'une marque a de plus spécifique.
 *
 * CE FICHIER NE FAIT RIEN AU CHARGEMENT. La commande vit dans
 * `pipeline/avatars.mjs` ; l'importer exécutait son point d'entrée, et
 * `npm run copie -- --aide` affichait l'aide des avatars.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, litJson } from './chemins.mjs'

export const DOSSIER = path.join(CHEMINS.marque, 'avatars')
export const IMAGES = /\.(png|jpe?g|webp)$/i

/** Tous les avatars de la chaîne, lus sur le disque. */
export function avatars() {
  if (!fs.existsSync(DOSSIER)) return []
  return fs
    .readdirSync(DOSSIER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => lis(e.name))
    .filter(Boolean)
    .sort((a, b) => String(a.cree_le ?? '').localeCompare(String(b.cree_le ?? '')))
}

export function lis(id) {
  const f = path.join(DOSSIER, id, 'avatar.json')
  if (!fs.existsSync(f)) return null
  const a = litJson(f, null)
  if (!a) return null
  const dossierPhotos = path.join(DOSSIER, id, 'photos')
  const photos = fs.existsSync(dossierPhotos)
    ? fs.readdirSync(dossierPhotos).filter((n) => IMAGES.test(n))
    : []
  return { ...a, id, photos, dossier: path.join(DOSSIER, id) }
}

/** Les chemins absolus des photos d'un avatar, prêts à être téléversés. */
export function fichiersDe(id) {
  const a = lis(id)
  if (!a) return []
  return a.photos.map((n) => path.join(a.dossier, 'photos', n))
}
