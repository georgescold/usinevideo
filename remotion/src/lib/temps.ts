/**
 * Conversions temps ↔ images, et petits utilitaires d'animation.
 *
 * Toutes les durées du plan sont en millisecondes. Remotion raisonne en images.
 * Ce fichier est le seul endroit où l'on convertit, pour qu'un arrondi ne se
 * fasse pas à deux endroits avec deux règles différentes.
 */

import { interpolate, Easing } from 'remotion'

/** Millisecondes → numéro d'image. Arrondi au plus proche, pas au plancher. */
export const msVersImages = (ms: number, fps: number) => Math.round((ms / 1000) * fps)

export const imagesVersMs = (images: number, fps: number) => (images / fps) * 1000

/**
 * Durée en images, jamais nulle : une séquence de zéro image ne s'affiche
 * pas et le contenu disparaît en silence.
 */
export const dureeEnImages = (ms: number, fps: number) => Math.max(1, msVersImages(ms, fps))

/** Sortie douce, pour tout ce qui apparaît. */
export const SORTIE_DOUCE = Easing.bezier(0.16, 1, 0.3, 1)

/**
 * Opacité d'un élément qui apparaît puis disparaît, avec des fondus courts
 * proportionnés à sa durée. Un élément qui reste 0,4 s ne peut pas avoir
 * 0,3 s de fondu à l'entrée.
 */
export function fonduEntreeSortie(
  imageLocale: number,
  dureeImages: number,
  fps: number,
  fonduMsMax = 220
) {
  // Une séquence de trois images ou moins n'a pas la place d'un fondu : forcer
  // fondu ≥ 1 y produit un inputRange non strictement croissant — [0,1,1,2] à
  // deux images — et interpolate() jette, ce qui fait échouer le rendu ENTIER
  // pour un seul événement trop court. On affiche plein, simplement.
  if (dureeImages <= 3) return 1
  const fondu = Math.max(1, Math.min(msVersImages(fonduMsMax, fps), Math.floor(dureeImages / 3)))
  return interpolate(
    imageLocale,
    [0, fondu, dureeImages - fondu, dureeImages],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )
}

/** Décalage d'entrée en pixels, qui se résorbe. */
export function glisseEntree(imageLocale: number, fps: number, distance = 28, dureeMs = 320) {
  const d = Math.max(1, msVersImages(dureeMs, fps))
  return interpolate(imageLocale, [0, d], [distance, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: SORTIE_DOUCE,
  })
}

/** Apparition en cascade : le n-ième élément démarre `pasMs` après le premier. */
export const cascade = (index: number, fps: number, pasMs = 90) => msVersImages(index * pasMs, fps)
