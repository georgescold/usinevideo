/**
 * Un plan de démonstration, sans aucun fichier média.
 *
 * Il sert à deux choses : ouvrir `npm run studio` sur un dossier vierge, et
 * vérifier que le rendu fonctionne de bout en bout avant d'avoir tourné quoi
 * que ce soit. `pipeline/verifie.mjs` rend trois secondes de ce plan.
 */

import type { Plan } from './types'
import { THEME_PAR_DEFAUT } from './types'

const mot = (texte: string, debutMs: number, dureeMs: number) => ({
  texte,
  debutMs,
  finMs: debutMs + dureeMs,
})

let t = 300
const phrase = (mots: string[], dureeMoyenne = 280) =>
  mots.map((m) => {
    const sortie = mot(m, t, dureeMoyenne)
    t += dureeMoyenne + 40
    return sortie
  })

export const planDemo: Plan = {
  slug: 'demo',
  format: 'short-faceless',
  largeur: 1080,
  hauteur: 1920,
  fps: 30,
  dureeFrames: 30 * 12,
  theme: THEME_PAR_DEFAUT,
  voix: { src: '' },
  coupes: [],
  mots: [
    ...phrase(['Ceci', 'est', 'un', 'aperçu.']),
    ...phrase(['Aucun', 'fichier', 'média', 'requis.']),
    ...phrase(['Le', 'montage', 'lit', 'un', 'plan.']),
    ...phrase(['Rien', 'de', 'plus.']),
  ],
  evenements: [
    { type: 'mot-cle', texte: 'aperçu', debutMs: 400, dureeMs: 1600, position: 'haut' },
    {
      type: 'chiffre',
      de: 0,
      a: 100,
      suffixe: ' %',
      debutMs: 2400,
      dureeMs: 2600,
      position: 'plein',
    },
    {
      type: 'infographie',
      modele: 'liste',
      donnees: { items: ['Transcription', 'Coupe', 'Habillage'] },
      debutMs: 5400,
      dureeMs: 3400,
      position: 'plein',
    },
    {
      type: 'carton',
      texte: 'Prêt à produire',
      sousTexte: 'lance /init-chaine',
      debutMs: 9200,
      dureeMs: 2600,
    },
  ],
}
