/**
 * Le contrat entre le pipeline et le rendu.
 *
 * `pipeline/monte.mjs` écrit un `plan.json` conforme à `Plan`. Remotion ne fait
 * que le rendre : il ne décide de rien, ne devine rien, ne recalcule aucun
 * timing. Toutes les positions sont en **millisecondes sur la timeline finale**,
 * après coupe des silences — jamais dans le référentiel du rush d'origine.
 *
 * Conséquence utile : les sous-titres et les événements visuels sont calés une
 * fois pour toutes côté pipeline, à partir de la transcription réelle. Le rendu
 * ne peut pas les désynchroniser.
 */

export type Format =
  | 'long-face'
  | 'long-faceless'
  | 'long-screencast'
  | 'long-avatar'
  | 'short-face'
  | 'short-faceless'
  | 'short-avatar'

export type StyleSousTitres = 'mot-a-mot-pastille' | 'mot-a-mot-couleur' | 'ligne-karaoke' | 'bloc-2-lignes'

/**
 * L'apparition d'une page de sous-titres.
 *
 * Les quatre valeurs et leurs chiffres viennent de Scriptshort ; la conversion
 * en ressort Remotion est documentée dans `components/SousTitres.tsx`.
 */
export type AnimationSousTitres = 'aucune' | 'fondu' | 'pop' | 'rebond'

/** Une police embarquée. Le fichier vit dans remotion/public/fonts/. */
export type Police = {
  famille: string
  fichier: string
  /** Une graisse fixe (700), ou une plage pour une police variable ('100 900'). */
  graisse?: number | string
  style?: 'normal' | 'italic'
}

export type Theme = {
  fond: string
  texte: string
  accent: string
  accentSecondaire: string
  /** Fond du mot actif : accent assombri, pour que le texte y reste lisible. */
  pastille: string
  /** douce | neutre | dure — règle vignette, grain et contraste. */
  ambiance: string
  /** Axes CSS d une police variable, ex. '"wght" 900'. */
  variationsAffiche?: string | null
  alerte: string
  /**
   * Polices à embarquer. Sans elles, le texte retombe sur une police système
   * et le rendu change d'une machine à l'autre sans prévenir.
   */
  polices: Police[]
  policeTitres: string
  policeSousTitres: string
  policeChiffres: string
  rayon: number
  sousTitres: {
    style: StyleSousTitres
    motsParPage: number
    casse: 'majuscules' | 'normale'
    /** Hauteur de casse en pixels, pour une composition de 1080 de large. */
    taille: number
    /** Distance au bas du cadre, en pourcentage de la hauteur. */
    positionBas: number
    contour: boolean

    // LES CHAMPS CI-DESSOUS SONT TOUS OPTIONNELS, ET CE N'EST PAS UNE COMMODITÉ.
    //
    // La direction artistique des sous-titres a été validée à l'image avant
    // qu'ils existent. Un `plan.json` écrit avant eux doit rendre au pixel près
    // comme il rendait alors : chacun de ces champs, ABSENT, laisse le rendu
    // exactement où il était. `null` ne fait pas la même chose que `undefined`
    // ici — n'écrire la clé que lorsqu'on veut vraiment dévier du défaut.

    /** Multiplie l'épaisseur du tracé de contour. 1 = le trait de référence. */
    epaisseurContour?: number
    /** Remplace `Theme.texte` pour les mots pas encore dits. #RRGGBB. */
    couleurTexte?: string
    /** Couleur du mot en cours de prononciation, quel que soit le style. */
    couleurSurligne?: string
    /** Remplace le noir du contour. #RRGGBB. */
    couleurContour?: string
    animation?: AnimationSousTitres
    /** `true` garde la ponctuation finale à l'écran ; par défaut on la retire. */
    ponctuation?: boolean
    /** Remplace `Theme.policeSousTitres` pour les seuls sous-titres. */
    police?: string
  }
}

/**
 * Une coupe sur la piste image.
 *
 * Les rushes ont déjà été découpés et recollés par ffmpeg en une seule piste :
 * ici on ne décrit plus *quoi* montrer, seulement *ce qui se passe* à chaque
 * jointure. C'est ce qui évite à Remotion de repositionner un décodeur à chaque
 * jump cut — la cause classique des images noires dans ce type de montage.
 */
export type Coupe = {
  /** Position de la jointure sur la timeline finale, en millisecondes. */
  debutMs: number
  dureeMs: number
  /** Resserrement progressif appliqué sur toute la coupe, de 0 à 0,08. */
  punchIn?: number
  /** Effet marquant la jointure. Réservé aux changements de sujet. */
  entree?: Transition
}

export type Transition = {
  effet: 'fondu' | 'glissement' | 'flash' | 'volet' | 'aucun'
  dureeMs: number
  /** Pour `glissement` et `volet`. */
  sens?: 'gauche' | 'droite' | 'haut' | 'bas'
}

/** Un mot, tel que la transcription l'a entendu, sur la timeline finale. */
export type Mot = {
  texte: string
  debutMs: number
  finMs: number
}

export type Infographie =
  | { modele: 'liste'; donnees: { items: string[] } }
  | { modele: 'comparaison'; donnees: { gauche: BlocComparaison; droite: BlocComparaison } }
  | { modele: 'avant-apres'; donnees: { avant: string; apres: string } }
  | { modele: 'chronologie'; donnees: { etapes: { date: string; texte: string }[] } }
  | { modele: 'barres'; donnees: { series: { libelle: string; valeur: number }[]; unite?: string } }
  | { modele: 'citation'; donnees: { texte: string; source: string } }
  // Un seul mot, plein écran, qui claque. Pour le pivot émotionnel d'une vidéo,
  // une fois par tiers au maximum : c'est l'effet le plus fort du catalogue et
  // il s'use immédiatement si on le répète.
  | { modele: 'takeover'; donnees: { mot: string; apres?: string; ton?: 'accent' | 'texte' } }
  // Des pastilles qui poppent en cascade par-dessus l'image. Pour une
  // énumération rapide qu'on n'a pas le temps de lire ligne à ligne.
  | { modele: 'pastilles'; donnees: { items: string[] } }

export type BlocComparaison = { titre: string; points: string[] }

type Base = {
  debutMs: number
  dureeMs: number
  position?: 'plein' | 'haut' | 'bas' | 'gauche' | 'droite' | 'coin'
}

export type Evenement =
  | (Base & { type: 'mot-cle'; texte: string })
  | (Base & { type: 'chiffre'; de: number; a: number; prefixe?: string; suffixe?: string })
  | (Base & { type: 'infographie' } & Infographie)
  | (Base & {
      type: 'broll'
      src: string
      ken?: boolean
      dureeSourceMs?: number
      entreeSection?: boolean
      /**
       * UN PLAN À TOI, POSÉ SUR CELUI-CI — pas à sa place.
       *
       * Une image de la bibliothèque personnelle (`assets/broll/`) qui vient se
       * poser en carte par-dessus le plan de coupe. Le fond continue de vivre
       * derrière : c'est ce qui distingue une incrustation d'une diapositive.
       */
      insert?: { src: string; image?: boolean; cote?: 'gauche' | 'droite' }
    })
  | (Base & { type: 'capture'; src: string })
  | (Base & { type: 'carton'; texte: string; sousTexte?: string })
  | (Base & { type: 'souligne'; texte: string })
  | (Base & { type: 'flou'; zone: { x: number; y: number; l: number; h: number } })

export type Plan = {
  slug: string
  format: Format
  largeur: number
  hauteur: number
  fps: number
  dureeFrames: number
  theme: Theme
  /** Zooms d'appui, appliqués à l'étage image entier, au mot exact. */
  punchs?: { debutMs: number; amplitude: number }[]
  /** Voix off finale, déjà recollée après coupe. Chemin relatif à public/. */
  voix: { src: string; volume?: number }
  musique?: { src: string; volume: number; fondueMs?: number }
  /**
   * La piste image, déjà montée par ffmpeg : silences retirés, mise à la
   * définition finale, sans son. Absente pour un format sans tournage.
   */
  piste?: { src: string; dureeMs: number }
  coupes: Coupe[]
  mots: Mot[]
  evenements: Evenement[]
  /** Titre à l'écran, si le format en prévoit un. */
  titre?: string
  /** Filigrane discret, chemin relatif à public/. */
  logo?: string
}

/** Ce que Remotion reçoit réellement en props. */
export type ProprietesMontage = { plan: Plan }

export const THEME_PAR_DEFAUT: Theme = {
  fond: '#0B0B0D',
  texte: '#FBF9F7',
  accent: '#E8503A',
  accentSecondaire: '#2E9E8F',
  pastille: '#B03A28',
  ambiance: 'neutre',
  variationsAffiche: null,
  alerte: '#D93F3F',
  polices: [],
  policeTitres: 'Inter',
  policeSousTitres: 'Inter',
  policeChiffres: 'Inter',
  rayon: 14,
  sousTitres: {
    style: 'mot-a-mot-pastille',
    motsParPage: 3,
    casse: 'majuscules',
    taille: 86,
    positionBas: 18,
    contour: true,
  },
}
