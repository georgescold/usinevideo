/**
 * Sous-titres calés mot à mot.
 *
 * Les temps viennent de la transcription réelle de l'audio final : rien n'est
 * estimé ici. La pagination est déterministe — même plan, mêmes pages — pour
 * qu'un nouveau rendu ne fasse pas bouger le texte d'une image.
 */

import React from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import type { AnimationSousTitres, Mot, Theme } from '../types'
import { imagesVersMs, msVersImages } from '../lib/temps'

type Page = { mots: Mot[]; debutMs: number; finMs: number }

/** Un blanc plus long que ça referme la page en cours : on ne fait pas tenir
 *  deux respirations sur la même ligne. */
// Seuil repris de Scriptshort, qui coupe a 350 ms. Le notre etait a 420 : une
// respiration courte passait inapercue et la page s allongeait.
const SILENCE_QUI_COUPE_MS = 350

// DEUX BORNES QUE NOTRE PAGINATION N AVAIT PAS.
//
// Elle savait ou couper — jamais sur un mot outil, jamais juste avant la chute
// d une phrase — mais rien ne bornait la DUREE ni la LARGEUR d une page. Un
// groupe de quatre mots lents pouvait tenir cinq secondes a l ecran, et une
// suite de mots longs deborder sur trois lignes.
const DUREE_MAX_PAGE_MS = 3500

/**
 * LA LARGEUR D'UNE PAGE SE CALCULE, ELLE N'EST PLUS UNE CONSTANTE.
 *
 * Elle valait 42 caractères, en dur. C'était calibré pour la VERTICALE — 1080
 * de large, un corps de 78 à 86 — et faux partout ailleurs :
 *
 *   vertical 1080, corps 86  →  33 caractères tiennent sur deux lignes.
 *                               La constante en autorisait 42 : les pages
 *                               débordaient sur une TROISIÈME ligne.
 *   16:9 1920, corps 59      →  86 caractères tiennent sur deux lignes.
 *                               La constante en autorisait 42 : on coupait à
 *                               la moitié de la place disponible, d'où « des
 *                               retours à la ligne tout le temps » sur une
 *                               vidéo YouTube.
 *
 * LA CHASSE EST MESURÉE, PAS ESTIMÉE. Relevé le 8 septembre 2026 sur le bloc
 * réel de l'atelier — police, graisse, remplissage des mots et gouttière
 * compris — en majuscules, sur trois longueurs de phrase : **0,614 à 0,624 em
 * par caractère** en Montserrat, la plus large des polices courantes. Les
 * autres descendent à 0,53 (Roboto) et 0,40 (Anton, condensé).
 *
 * On retient 0,65 : au-dessus de la plus large, donc une ligne n'est jamais
 * calculée plus étroite qu'elle ne l'est. Le prix est quelques caractères
 * perdus sur une police étroite ; l'inverse ferait déborder, et un sous-titre
 * qui déborde se voit sur toute la vidéo.
 */
const CHASSE_EM = 0.65

/** Deux lignes : au-delà, un sous-titre cesse d'être lu et devient un pavé. */
const LIGNES_PAR_PAGE = 2

/** Ce que `maxWidth: '86%'` laisse au texte. */
const PART_UTILE = 0.86

export function caracteresParPage(largeurPx: number, corpsPx: number) {
  const utile = largeurPx * PART_UTILE
  const parLigne = utile / (CHASSE_EM * Math.max(1, corpsPx))
  return Math.max(12, Math.round(parLigne * LIGNES_PAR_PAGE))
}

/**
 * Au-delà de ce délai après le dernier mot, la page disparaît au lieu d'attendre
 * la suivante. Sans cette borne, un silence volontaire laisse une phrase morte à
 * l'écran ; avec une borne trop courte, les respirations font clignoter le texte.
 */
const TENUE_MAX_MS = 2000

const FIN_DE_PHRASE = /[.!?…:]$/
const VIRGULE = /,$/

/**
 * Les mots-outils : ceux sur lesquels une page n'a PAS le droit de se fermer.
 *
 * C'est la correction qui change le plus la lecture. Une pagination au compteur
 * produit des pages comme « TOUT ALORS QU'IL » ou « UNE INFORMATION QUE » — des
 * groupes qui ne veulent rien dire, parce qu'ils se terminent au milieu d'un
 * lien grammatical. L'œil les lit quand même, bute, et c'est cette friction,
 * page après page, qui fait « sous-titres générés » au lieu de « sous-titres
 * écrits ». La règle : une page se ferme sur un mot plein, une ponctuation, ou
 * un silence — jamais sur un article, une préposition ou une conjonction.
 */
const MOTS_OUTILS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'au', 'aux', 'et',
  'ou', 'que', 'qui', 'dont', 'ne', 'se', 'ce', 'ces', 'cet', 'cette', 'en',
  'y', 'sur', 'dans', 'pour', 'par', 'sans', 'sous', 'si', 'mais', 'donc',
  'alors', 'quand', 'comme', 'avec', 'entre', 'vers', 'chez', 'est', 'sont',
  'ont', 'leur', 'leurs', 'son', 'sa', 'ses', 'notre', 'nos', 'plus', 'tres',
  'il', 'elle', 'on', 'ils', 'elles', 'nous', 'vous', 'je', 'tu', 'lui',
  'meme', 'quelque', 'tout', 'toute', 'tous', 'toutes', 'chaque', 'autre',
])

const estMotOutil = (texte: string) => {
  const nu = texte
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z']/g, '')
  if (MOTS_OUTILS.has(nu.replace(/'/g, ''))) return true
  // Les élisions courtes — « qu'il », « n'y », « l'on », « d'un » — sont des
  // grappes de mots-outils. « l'amour » ou « l'incompatibilité », non.
  return /^(qu|l|d|n|s|c|j|t|m)'/.test(nu) && nu.length <= 5
}

export function pagine(
  mots: Mot[],
  motsParPage: number,
  // Par défaut, la valeur d'avant le calcul : un appel qui ne la passe pas
  // garde exactement le découpage qu'il avait.
  caracteresMaxPage: number = 42
): Page[] {
  const pages: Page[] = []
  let courante: Mot[] = []

  const ferme = () => {
    if (courante.length === 0) return
    pages.push({
      mots: courante,
      debutMs: courante[0].debutMs,
      finMs: courante[courante.length - 1].finMs,
    })
    courante = []
  }

  for (let i = 0; i < mots.length; i++) {
    const mot = mots[i]
    const precedent = courante[courante.length - 1]
    if (precedent && mot.debutMs - precedent.finMs > SILENCE_QUI_COUPE_MS) ferme()

    courante.push(mot)

    // Le mot suivant termine-t-il la phrase ? Alors on ne ferme PAS ici : on
    // l'absorbe. Sans cette anticipation, la page se remplit une syllabe avant
    // la fin et le dernier mot se retrouve SEUL sur sa page — « ENDROIT »,
    // « MOIS » — ce qui hache la lecture exactement là où elle devait retomber.
    const suivant = mots[i + 1]
    const suivantClot =
      suivant &&
      (FIN_DE_PHRASE.test(suivant.texte) || VIRGULE.test(suivant.texte)) &&
      suivant.debutMs - mot.finMs <= SILENCE_QUI_COUPE_MS

    // La ponctuation ferme toujours : c'est la respiration écrite.
    const dureePage = mot.finMs - courante[0].debutMs
    const largeurPage = courante.reduce((n, m) => n + m.texte.length + 1, -1)

    if (FIN_DE_PHRASE.test(mot.texte) || VIRGULE.test(mot.texte)) ferme()
    // Les deux bornes dures passent avant la regle grammaticale : une page trop
    // longue ou trop large est illisible, quel que soit l endroit de la coupe.
    else if (dureePage >= DUREE_MAX_PAGE_MS) ferme()
    else if (largeurPage >= caracteresMaxPage) ferme()
    // La taille cible ne ferme que sur un mot plein, et jamais juste avant la
    // chute de la phrase…
    else if (courante.length >= motsParPage && !estMotOutil(mot.texte) && !suivantClot) ferme()
    // …et un garde-fou absolu ferme quoi qu'il arrive : une page de plus de
    // cinq mots ne tient plus sur deux lignes en 86 px. Une seule dérogation,
    // d'un seul mot : quand le suivant clôt la phrase — sinon le garde-fou
    // recrée exactement l'orphelin que l'absorption vient d'empêcher.
    else if (courante.length >= motsParPage + 2 && !suivantClot) ferme()
    else if (courante.length >= motsParPage + 3) ferme()
  }
  ferme()
  return pages
}

const casse = (t: string, mode: Theme['sousTitres']['casse']) =>
  mode === 'majuscules' ? t.toLocaleUpperCase('fr-FR') : t

/** La ponctuation reste dans le texte lu, pas à l'écran — sauf ? et ! */
const nettoie = (t: string) => t.replace(/[.,;:…]+$/g, '')

/**
 * Le contour du texte, en huit ombres portées.
 *
 * Une seule ombre floue ne détache pas un sous-titre d'un plan clair : sur la
 * fenêtre blanche ou le couloir d'hôtel, le texte se noyait. Huit ombres dures
 * en croix dessinent un vrai contour — le procédé des sous-titres broadcast —
 * et une neuvième, large et floue, assoit le tout. Le mot actif n'en a pas
 * besoin : sa pastille est son contour.
 */
/**
 * Le contour, en VRAI TRACE — et non plus en huit ombres decalees.
 *
 * CE QUI N ALLAIT PAS.
 *
 * Huit `text-shadow` en croix approximent un contour : chaque copie est un
 * decalage rigide, donc les angles des lettres restent decouverts et les
 * courbes se crenelent. A 2,5 px ca passait ; des qu on epaissit, ca devient un
 * halo irregulier au lieu d une bordure.
 *
 * `-webkit-text-stroke` trace une vraie bordure suivant le contour du glyphe.
 * Seul, il mord sur le remplissage — le trace est CENTRE sur le chemin, donc la
 * moitie de son epaisseur ronge la lettre. `paint-order: stroke fill` remet le
 * remplissage par-dessus : la lettre garde son dessin exact, la bordure ne
 * deborde qu au dehors.
 *
 * L EPAISSEUR VIENT DE SCRIPTSHORT, CONVERTIE.
 *
 * Leur sortie ASS pose `Outline = max(2, round(base * 0.009))`, soit 10 px sur
 * une base de 1080. Un contour ASS est une bordure EXTERIEURE ; un trace CSS
 * etant centre, il en faut le double pour le meme rendu visible. D ou 0,23 fois
 * la taille de police, qui redonne ces 10 px exterieurs sur leur corps de 78 px
 * et suit la police si on la change.
 */
const EPAISSEUR_CONTOUR = 0.23
const OMBRE_PORTEE = '0 3px 10px rgba(0,0,0,0.55)'

/**
 * L'INTERLIGNE EST ÉCRIT, IL N'EST PLUS `normal`.
 *
 * Sans valeur explicite, chaque police impose la sienne : Roboto retombe sur
 * 1,17, Montserrat sur 1,22, Anton sur 1,50. Deux pages de deux lignes n'ont
 * alors pas le même écart selon la police choisie — et l'aperçu de l'atelier,
 * qui héritait le 1,6 du corps de page, n'avait celui d'AUCUNE d'entre elles :
 * 1,94 fois le corps entre deux lignes contre 1,51 au rendu, gouttière
 * comprise. Un écran de réglage qui montre un écart de moitié en trop sur la
 * seule chose qu'on vient y régler.
 *
 * 1,15 parce que la séparation des lignes est déjà payée par la gouttière de
 * 0,22 : pas de trou au milieu d'une page de deux lignes, et un accent
 * capital — Ô, É — passe encore sous le jambage de la ligne du dessus.
 *
 * COMME `EPAISSEUR_CONTOUR`, LA VALEUR EST DOUBLE : atelier/app.js porte la
 * même. Si l'une bouge, l'autre bouge dans le même geste.
 */
const INTERLIGNE = 1.15

/**
 * L'ÉCHELLE SE PREND SUR LE PETIT CÔTÉ, ET C'ÉTAIT LA LARGEUR.
 *
 * `taille` est un corps de police exprimé pour une composition de référence de
 * 1080 — la verticale 1080 × 1920, où le petit côté EST la largeur. En prenant
 * la largeur, un format horizontal 1920 × 1080 recevait donc une échelle de
 * 1,78 : le 94 px réglé dans l'atelier sortait à 167 px au rendu, la page
 * passait de deux lignes à quatre, et rien à l'écran ne l'annonçait — l'aperçu,
 * lui, dessine bien 94 px sur un plateau de 1920. Mesuré sur la VSL d'Héritage
 * le 8 septembre 2026.
 *
 * Le petit côté rend 1 dans les deux orientations, donc ne change RIEN aux
 * rendus verticaux déjà faits, et garde l'indépendance à la définition : la
 * même vidéo rendue en 2160 × 3840 double son corps de police.
 */
const echelleDe = (largeur: number, hauteur: number) => Math.min(largeur, hauteur) / 1080

// LE MÊME CALCUL EXISTE DANS L'APERÇU DE L'ATELIER (atelier/app.js).
//
// L'aperçu ne rend pas la vidéo : il maquette la même scène en HTML/CSS pour
// qu'un curseur se juge instantanément et gratuitement. Il ne vaut que s'il ne
// ment pas. Les deux implémentations doivent donc rester alignées : même
// facteur 0,23, même `paint-order`, même multiplication par `epaisseurContour`.
// Si l'une des deux change, changer l'autre dans le même geste.
const contourDe = (taille: number, couleur = 'rgb(0,0,0)', facteur = 1) => ({
  WebkitTextStroke: `${(taille * EPAISSEUR_CONTOUR * facteur).toFixed(1)}px ${couleur}`,
  paintOrder: 'stroke fill' as const,
  textShadow: OMBRE_PORTEE,
})

/**
 * L'apparition d'une page, reprise de Scriptshort et convertie.
 *
 * D'OÙ VIENNENT LES CHIFFRES.
 *
 * `src/subtitles.js`, fonction `entrance()` (vers la ligne 249), qui émet des
 * balises ASS. Traduites :
 *
 *   fade   → \fad(120,0)
 *              opacité 0→1 en 120 ms
 *   pop    → \fscx70\fscy70 \t(0,140,\fscx100\fscy100) \fad(60,0)
 *              échelle 0,70→1 en 140 ms, fondu 60 ms
 *   bounce → \fscx45\fscy45 \t(0,95,…100) \t(95,155,…91) \t(155,215,…100) \fad(45,0)
 *              échelle 0,45→1 en 95 ms, puis 1→0,91 en 60 ms, puis 0,91→1 en
 *              60 ms, fondu 45 ms
 *
 * CE QUI CHANGE À LA CONVERSION, ET POURQUOI.
 *
 * Un `\t()` d'ASS interpole LINÉAIREMENT. À 30 images/s, une montée d'échelle
 * linéaire de 95 ms tient en trois images et se voit comme un saut. La montée
 * passe donc par un ressort Remotion amorti (`damping` 200 : aucun dépassement,
 * juste une décélération), qui occupe la même durée. Les deux retombées du
 * rebond restent linéaires : elles sont déjà le dépassement, l'amortir une
 * seconde fois l'effacerait. Le fondu reste linéaire, comme `\fad`.
 */
const RESSORT = { damping: 200, stiffness: 220, mass: 0.5 }

const ressort = (image: number, fps: number, dureeMs: number) =>
  spring({
    frame: image,
    fps,
    config: RESSORT,
    durationInFrames: Math.max(1, Math.round((dureeMs / 1000) * fps)),
  })

/** Fondu d'entrée linéaire, à l'image de `\fad(d,0)`. */
const fondu = (ms: number, dureeMs: number) =>
  dureeMs <= 0 ? 1 : Math.min(1, Math.max(0, ms / dureeMs))

/**
 * Les modèles de `pipeline/lib/soustitres.mjs` portent encore les noms anglais
 * de Scriptshort. Le plan les recopie tels quels : le rendu les accepte plutôt
 * que de retomber en silence sur « pas d'animation ».
 */
const ALIAS_ANIMATION: Record<string, AnimationSousTitres> = {
  fade: 'fondu',
  bounce: 'rebond',
}

function apparitionDe(
  animation: AnimationSousTitres,
  image: number,
  fps: number
): { echelle: number; opacite: number } {
  const ms = imagesVersMs(image, fps)
  switch (animation) {
    case 'fondu':
      return { echelle: 1, opacite: fondu(ms, 120) }
    case 'pop':
      return {
        echelle: interpolate(ressort(image, fps, 140), [0, 1], [0.7, 1]),
        opacite: fondu(ms, 60),
      }
    case 'rebond': {
      const monte = interpolate(ressort(image, fps, 95), [0, 1], [0.45, 1])
      const retombe = interpolate(ms, [95, 155, 215], [1, 0.91, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
      return { echelle: ms < 95 ? monte : retombe, opacite: fondu(ms, 45) }
    }
    default:
      return { echelle: 1, opacite: 1 }
  }
}


const UnePage: React.FC<{
  page: Page
  theme: Theme
  echelle: number
  /**
   * Les instants des zooms d'appui, en millisecondes.
   *
   * Le mot qui porte un punch est, par construction, le mot le plus fort de sa
   * phrase — c'est l'auteur du script qui l'a désigné en y ancrant un zoom. On
   * le colore donc en accent dans le sous-titre : l'image appuie ET le texte
   * appuie, au même instant, sur le même mot. C'est cette convergence des
   * couches qui fait un montage dirigé plutôt qu'une accumulation d'effets —
   * et elle est entièrement automatique, dérivée des ancres du script.
   */
  punchs?: { debutMs: number }[]
}> = ({ page, theme, echelle, punchs }) => {
  // `image` est locale à la séquence de la page : la petite animation
  // d'apparition rejoue donc à chaque page, et non une seule fois au début.
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const msCourant = page.debutMs + imagesVersMs(image, fps)
  const st = theme.sousTitres

  const taille = st.taille * echelle

  // La police, les couleurs et le trait, résolus une fois : chaque branche de
  // style s'en sert, et le repli doit être le même partout.
  const famille = st.police ?? theme.policeSousTitres
  const couleurTexte = st.couleurTexte ?? theme.texte
  const trait = (t: number) => contourDe(t, st.couleurContour, st.epaisseurContour)

  // L'ANCIENNE APPARITION EST LE DÉFAUT, ET LE RESTE.
  //
  // Elle a été réglée à l'image : 0,94→1 en 0,18 s, sans fondu. Un plan écrit
  // avant que `animation` existe ne dit rien, et doit continuer à rendre ça —
  // d'où le test sur `undefined` et non sur une valeur. Choisir « aucune »,
  // c'est au contraire demander explicitement une page qui ne bouge pas.
  const anim = st.animation === undefined ? null : ALIAS_ANIMATION[st.animation] ?? st.animation
  const entree =
    anim === null
      ? {
          echelle: interpolate(ressort(image, fps, 180), [0, 1], [0.94, 1]),
          opacite: undefined as number | undefined,
        }
      : apparitionDe(anim, image, fps)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: `${0.22 * taille}px`,
        lineHeight: INTERLIGNE,
        maxWidth: '86%',
        transform: `scale(${entree.echelle})`,
        opacity: entree.opacite,
      }}
    >
      {page.mots.map((mot, i) => {
        const actif = msCourant >= mot.debutMs && msCourant < mot.finMs
        const dejaDit = msCourant >= mot.finMs
        // Le mot fort : celui sur lequel le script a ancré un zoom d'appui.
        // Appartenance stricte, pas une fenêtre : une tolérance symétrique
        // colorait aussi le mot-outil collé juste avant l'ancre — « DE » rouge
        // devant « DEVENIR » — parce que sa fin touche le début du mot visé.
        const fort = (punchs ?? []).some(
          (p) => p.debutMs >= mot.debutMs - 30 && p.debutMs < mot.finMs - 30
        )
        const texte = casse(st.ponctuation ? mot.texte : nettoie(mot.texte), st.casse)

        if (st.style === 'ligne-karaoke') {
          // LE SURLIGNAGE, C'EST LA COULEUR DU MOT DIT — PAS UN CHAMP DU THÈME.
          //
          // Chaque style marquait le mot en cours avec sa propre couleur du
          // thème : `pastille` pour le mot à mot, `accent` pour le karaoké et le
          // bloc. `couleurSurligne` remplace celle des deux qui joue ce rôle
          // dans le style courant. Prendre la consigne au pied de la lettre —
          // « couleurSurligne remplace theme.pastille » — laisserait le karaoké
          // sourd au sélecteur de couleur, ce qui se lit comme une panne.
          const surligne = st.couleurSurligne ?? theme.accent
          return (
            <span
              key={i}
              style={{
                fontFamily: famille,
                fontWeight: 800,
                fontVariationSettings: theme.variationsAffiche ?? undefined,
                fontSize: taille,
                letterSpacing: '-0.02em',
                color: actif || dejaDit ? surligne : couleurTexte,
                ...(st.contour ? trait(taille) : {}),
                opacity: dejaDit ? 0.9 : 1,
              }}
            >
              {texte}
            </span>
          )
        }

        // MOT À MOT SANS BLOC : le mot prononcé change de COULEUR, rien d'autre.
        //
        // La pastille pleine encadre le mot actif d'un rectangle de couleur. Ça
        // se voit de loin, mais ça pose un objet graphique par-dessus le texte,
        // et la ligne devient une suite de blocs plutôt qu'une phrase. Le
        // surlignage par la couleur seule garde la phrase lisible comme phrase.
        //
        // Le contour reste : sans lui, du texte clair sur un plan clair devient
        // illisible, et une banque d'images rend surtout des plans clairs. Ce
        // n'est pas un effet, c'est ce qui rend le texte lisible partout.
        if (st.style === 'mot-a-mot-couleur') {
          return (
            <span
              key={i}
              style={{
                fontFamily: famille,
                fontWeight: 800,
                fontVariationSettings: theme.variationsAffiche ?? undefined,
                fontSize: taille,
                letterSpacing: '-0.02em',
                // `fort` reste en `accent` : ce n'est pas le surlignage, c'est
                // la trace du zoom ancré par le script. Deux rôles distincts.
                color: actif
                  ? st.couleurSurligne ?? theme.pastille
                  : fort
                    ? theme.accent
                    : couleurTexte,
                // Remplissage constant, comme pour la pastille : une largeur qui
                // change à chaque mot recentre la ligne et se lit comme un
                // tremblement permanent.
                padding: `${0.06 * taille}px ${0.1 * taille}px`,
                ...(st.contour ? trait(taille) : {}),
                opacity: actif ? 1 : 0.9,
                transform: actif ? 'scale(1.06)' : 'none',
                transition: 'none',
              }}
            >
              {texte}
            </span>
          )
        }

        if (st.style === 'mot-a-mot-pastille') {
          return (
            <span
              key={i}
              style={{
                fontFamily: famille,
                fontWeight: 800,
                fontVariationSettings: theme.variationsAffiche ?? undefined,
                fontSize: taille,
                letterSpacing: '-0.02em',
                // Le mot fort reste en accent même quand il n'est plus dit :
                // c'est la trace écrite du zoom qui vient de l'appuyer.
                color: fort && !actif ? theme.accent : couleurTexte,
                backgroundColor: actif ? st.couleurSurligne ?? theme.pastille : 'transparent',
                // LE REMPLISSAGE NE CHANGE JAMAIS.
                //
                // Il valait 0 sur les mots inactifs et 0,16 em sur le mot actif :
                // dans une ligne centrée, chaque mot qui s'allumait élargissait la
                // ligne et repoussait tous les autres. La ligne se recentrait à
                // chaque mot, ce qui se lit comme un tremblement permanent.
                // Seule la COULEUR change désormais ; la mise en page est figée.
                padding: `${0.06 * taille}px ${0.16 * taille}px`,
                borderRadius: theme.rayon * echelle,
                ...(st.contour ? trait(taille) : {}),
                opacity: actif ? 1 : 0.92,
                // Le grossissement passe par `transform`, qui ne provoque pas de
                // recalcul de mise en page : les voisins ne bougent pas.
                transform: actif ? 'scale(1.04)' : 'none',
                transition: 'none',
              }}
            >
              {texte}
            </span>
          )
        }

        // bloc-2-lignes : tout le bloc est lisible, le mot dit se colore.
        return (
          <span
            key={i}
            style={{
              fontFamily: famille,
              fontWeight: 700,
              fontSize: taille * 0.82,
              color: actif ? st.couleurSurligne ?? theme.accent : couleurTexte,
              // Le trait suit `taille`, pas `taille * 0,82` : c'était déjà le
              // cas, et le corriger changerait le rendu d'un plan existant.
              ...(st.contour ? trait(taille) : {}),
              opacity: dejaDit ? 0.78 : 1,
            }}
          >
            {texte}
          </span>
        )
      })}
    </div>
  )
}

export const SousTitres: React.FC<{
  mots: Mot[]
  theme: Theme
  punchs?: { debutMs: number }[]
}> = ({ mots, theme, punchs }) => {
  const { fps, width, height } = useVideoConfig()

  // La largeur d'une page dépend du format ET du corps de police : les deux
  // sont connus ici, et nulle part dans `pagine`.
  const corps = theme.sousTitres.taille * echelleDe(width, height)
  const pages = React.useMemo(
    () => pagine(mots, theme.sousTitres.motsParPage, caracteresParPage(width, corps)),
    [mots, theme.sousTitres.motsParPage, width, corps]
  )

  return (
    <AbsoluteFill>
      {pages.map((page, i) => {
        // Une page tient jusqu'à la suivante : sans ça le sous-titre
        // clignote à chaque respiration. La dernière s'attarde un peu.
        const suivante = pages[i + 1]
        const finMs = Math.min(
          suivante ? suivante.debutMs : page.finMs + 400,
          page.finMs + TENUE_MAX_MS
        )
        const debut = msVersImages(page.debutMs, fps)
        return (
          <Sequence
            key={`${page.debutMs}-${i}`}
            from={debut}
            durationInFrames={Math.max(1, msVersImages(finMs, fps) - debut)}
            layout="none"
            name={`st ${i + 1}`}
          >
            <AbsoluteFill
              style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: (theme.sousTitres.positionBas / 100) * height,
              }}
            >
              <UnePage
                page={page}
                theme={theme}
                echelle={echelleDe(width, height)}
                punchs={punchs}
              />
            </AbsoluteFill>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
