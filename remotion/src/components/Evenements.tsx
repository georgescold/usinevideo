/**
 * Les événements visuels, posés à leur milliseconde exacte sur la timeline.
 *
 * Le pipeline a déjà résolu chaque `ancre` du script en position réelle à
 * partir de la transcription : un mot-clé tombe donc précisément sur le mot
 * prononcé, pas « à peu près au milieu du bloc ».
 */

import React from 'react'
import {
  AbsoluteFill,
  Img,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  OffthreadVideo,
  spring,
} from 'remotion'
import type { Evenement, Theme } from '../types'
import { msVersImages, fonduEntreeSortie, glisseEntree, SORTIE_DOUCE } from '../lib/temps'
import { Infographies } from './Infographies'


/**
 * L'étalonnage des plans de banque, DÉRIVÉ DU THÈME.
 *
 * Il était écrit en dur — désaturation, sépia, rotation de teinte vers l'orange.
 * Ça marchait pour une charte orange et se serait retourné contre une charte
 * bleue : le filtre aurait poussé chaque plan à l'opposé de l'accent. Il se
 * calcule donc à partir de la couleur d'accent réelle.
 *
 * Et il ASSOMBRIT selon l'ambiance. Une banque d'images rend majoritairement des
 * plans clairs et bien exposés ; posés dans une charte nocturne, ils tranchent
 * et cassent l'unité — un calendrier blanc au milieu d'une vidéo bleu pétrole se
 * lit comme une pièce rapportée. On les ramène vers la clarté de la charte
 * plutôt que d'espérer que la banque nous en donne des sombres.
 */
export function etalonnageDe(theme: Theme): string {
  const n = parseInt(theme.accent.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Teinte de l'accent en degrés, pour savoir vers où pousser les plans.
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min || 1
  const teinte =
    max === r ? (((g - b) / d) % 6) * 60
    : max === g ? (((b - r) / d) + 2) * 60
    : (((r - g) / d) + 4) * 60
  // Le sépia amène tout à ~35°; on fait le complément jusqu'à la teinte visée.
  const rotation = Math.round((((teinte - 35) % 360) + 540) % 360 - 180)
  const sombre =
    theme.ambiance === 'douce' ? 0.62 : theme.ambiance === 'dure' ? 0.74 : 0.68
  // PLUS AUCUN VOILE DE COULEUR. DÉCISION DU 28 AOÛT 2026.
  //
  // Le filtre poussait chaque plan vers la teinte d'accent — sépia plus rotation
  // de teinte. Sur une charte terracotta il passait pour une intention ; il a
  // été vu comme ce qu'il était, un calque posé par-dessus. C'est le premier
  // reproche qu'on fait à une vidéo automatisée, et il est mérité : on ne
  // repeint pas une image pour la faire ressembler à une palette.
  //
  // Ce qui reste n'est PAS un filtre, c'est un raccord d'exposition. Une banque
  // d'images rend des plans clairs et bien exposés ; posés dans une charte
  // nocturne, ils tranchent. On les ramène à la clarté de la charte, sans
  // toucher à leurs couleurs.
  void rotation
  return `contrast(1.06) brightness(${sombre})`
}

const ancrage = (position: Evenement['position']): React.CSSProperties => {
  switch (position) {
    case 'haut':
      return { justifyContent: 'flex-start', alignItems: 'center', paddingTop: '10%' }
    case 'gauche':
      return { justifyContent: 'center', alignItems: 'flex-start', paddingLeft: '7%' }
    case 'droite':
      return { justifyContent: 'center', alignItems: 'flex-end', paddingRight: '7%' }
    case 'coin':
      return { justifyContent: 'flex-start', alignItems: 'flex-end', padding: '6%' }
    case 'plein':
      return { justifyContent: 'center', alignItems: 'center' }
    case 'bas':
    default:
      return { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '32%' }
  }
}

/** Le B-roll couvre l'image : c'est un plan de coupe, pas une vignette. */
/**
 * Un plan à toi, posé PAR-DESSUS le plan de coupe.
 *
 * POURQUOI UNE CARTE, ET PAS UN PLEIN ÉCRAN.
 *
 * Un logo ou une photo qui prend tout le cadre arrête le montage : on passe
 * d'une vidéo à une diapositive, et le plan suivant repart de zéro. En carte,
 * le fond continue de vivre derrière — c'est la langue de l'incrustation, celle
 * des chaînes qui montrent une preuve sans casser leur rythme.
 *
 * TROIS GESTES, ET AUCUN N'EST DÉCORATIF.
 *
 *  1. **L'arrivée par le côté**, avec un ressort qui dépasse légèrement sa
 *     position avant de s'y poser. Une carte qui apparaît en fondu se lit comme
 *     un calque ; une carte qui ARRIVE se lit comme un geste.
 *  2. **La dérive pendant la tenue** — un demi-pour-cent de translation et un
 *     pour-cent de zoom sur toute la durée. Invisible consciemment, mais une
 *     carte parfaitement immobile sur un fond qui bouge se lit comme un bug
 *     d'affichage.
 *  3. **Le retrait par l'échelle**, pas par le fondu : elle se retire du même
 *     mouvement dont elle est venue.
 *
 * L'inclinaison est faible — deux degrés — et elle décolle la carte du cadre
 * sans faire « scrapbook ». Elle change de sens avec le côté, sinon deux
 * inserts de suite se lisent comme un seul objet qui saute.
 */
const InsertPerso: React.FC<{
  insert: { src: string; image?: boolean; cote?: 'gauche' | 'droite' }
  dureeImages: number
  rayon: number
}> = ({ insert, dureeImages, rayon }) => {
  const image = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const vertical = height >= width

  const aDroite = insert.cote !== 'gauche'
  const sens = aDroite ? 1 : -1

  // L'ENTRÉE EST UN RESSORT, LA SORTIE UNE COURBE : ce ne sont pas les mêmes
  // gestes. On entre en dépassant un peu (c'est ce qui donne la matière), on
  // sort net (traîner sur une sortie fait attendre).
  const entree = spring({
    frame: image,
    fps,
    config: { damping: 14, stiffness: 130, mass: 0.7 },
    durationInFrames: Math.round(fps * 0.55),
  })
  const imagesSortie = Math.round(fps * 0.28)
  const sortie = interpolate(image, [dureeImages - imagesSortie, dureeImages], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (x) => x * x,
  })
  const presence = Math.min(entree, sortie)

  // La dérive : lente, continue, et de sens opposé au fond. C'est ce décalage
  // qui donne la profondeur — deux plans qui bougent ensemble sont un seul plan.
  const derive = interpolate(image, [0, dureeImages], [0, 1], { extrapolateRight: 'clamp' })

  const echelle = interpolate(presence, [0, 1], [0.86, 1])
  const glisse = interpolate(entree, [0, 1], [26 * sens, 0]) + (derive - 0.5) * 1.6 * sens
  const inclinaison = interpolate(presence, [0, 1], [sens * 5, sens * 1.8])

  // La carte occupe un peu plus de la moitié de la largeur en vertical, un tiers
  // en horizontal : assez pour se lire, jamais assez pour couvrir le fond.
  const largeur = vertical ? 0.58 : 0.34
  // Elle se pose au tiers HAUT : le bas appartient aux sous-titres, et le centre
  // exact est la place la plus morte du cadre.
  const hauteurDuCentre = vertical ? 0.34 : 0.4

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-start',
        alignItems: aDroite ? 'flex-end' : 'flex-start',
        paddingTop: `${(hauteurDuCentre - largeur * 0.5 * (width / height)) * 100}%`,
        paddingLeft: aDroite ? 0 : '7%',
        paddingRight: aDroite ? '7%' : 0,
        opacity: presence,
      }}
    >
      <div
        style={{
          width: `${largeur * 100}%`,
          borderRadius: rayon * 1.6,
          overflow: 'hidden',
          // Le liseré clair et l'ombre franche sont ce qui DÉTACHE la carte : sans
          // eux, une photo claire posée sur un plan clair se fond dedans et on ne
          // sait plus ce qu'on regarde.
          border: `${Math.round(width * 0.004)}px solid rgba(255,255,255,0.92)`,
          boxShadow: `0 ${Math.round(width * 0.02)}px ${Math.round(width * 0.055)}px rgba(0,0,0,0.55)`,
          transform: `translateX(${glisse.toFixed(2)}%) scale(${echelle.toFixed(4)}) rotate(${inclinaison.toFixed(2)}deg)`,
          transformOrigin: aDroite ? 'right center' : 'left center',
          background: '#000',
          lineHeight: 0,
        }}
      >
        {insert.image === false || /\.(mp4|mov|webm|mkv)$/i.test(insert.src) ? (
          <OffthreadVideo
            src={staticFile(insert.src)}
            muted
            style={{ width: '100%', display: 'block', transform: `scale(${(1 + derive * 0.03).toFixed(4)})` }}
          />
        ) : (
          <Img
            src={staticFile(insert.src)}
            style={{ width: '100%', display: 'block', transform: `scale(${(1 + derive * 0.03).toFixed(4)})` }}
          />
        )}
      </div>
    </AbsoluteFill>
  )
}

const Broll: React.FC<{
  src: string
  ken?: boolean
  dureeImages: number
  dureeSourceMs?: number
  /** L'étalonnage à appliquer aux plans de banque, dérivé du thème. */
  etalonnageBanque?: string
}> = ({ src, ken, dureeImages, dureeSourceMs, etalonnageBanque = 'none' }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const estVideo = /\.(mp4|mov|webm|mkv)$/i.test(src)

  // LE FAUX TRAVELLING VARIE D'UN PLAN À L'AUTRE.
  //
  // Toujours le même zoom avant, et l'œil comprend la mécanique au troisième
  // plan — c'est un des signaux « diaporama » les plus rapides à détecter. On
  // tire du nom du fichier une graine stable : un plan avance, le suivant
  // recule, un troisième glisse latéralement. Même durée, même amplitude,
  // jamais le même geste deux fois de suite.
  // UN PLAN SANS FICHIER NE DOIT PAS TUER LE RENDU.
  //
  // Un evenement broll peut arriver ici sans `src` : le plan n'a pas ete
  // rapatrie, ou une decoupe de phrase a duplique l'evenement sans recopier son
  // fichier. On lisait alors `src.split` sur `null`, et huit minutes de rendu
  // partaient sur une exception. Rien a l'ecran vaut mieux qu'aucune video :
  // le fond de la charte reste visible, et le montage continue.
  if (!src) return null

  const graine = src.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const avance = graine % 2 === 0
  // AUCUN PLAN N'EST JAMAIS TOUT À FAIT IMMOBILE, VIDÉO COMPRISE.
  //
  // Le faux travelling ne s'appliquait qu'aux images fixes : les clips vidéo
  // sortaient en `scale(1)`, au motif qu'ils bougent déjà. C'est vrai d'un plan
  // de banque bien choisi ; c'est faux d'un plan de trois secondes où une main
  // repose sur une table. Un tel clip se lit alors comme un arrêt sur image au
  // milieu d'un montage vif.
  //
  // Une poussée de trois pour cent et demi ne se remarque pas consciemment et
  // ne combat jamais le mouvement du clip — elle garantit seulement qu'il y en
  // a un. Elle change de sens avec la graine, comme le reste.
  const zoom = ken
    ? interpolate(image, [0, dureeImages], avance ? [1.04, 1.12] : [1.12, 1.04], {
        extrapolateRight: 'clamp',
      })
    : interpolate(image, [0, dureeImages], avance ? [1.0, 1.035] : [1.035, 1.0], {
        extrapolateRight: 'clamp',
      })
  // LE BALAYAGE VALAIT 1,2 % : sous le seuil de perception. Un mouvement qu'on
  // ne voit pas coûte le même calcul qu'un mouvement qu'on voit, et il ne
  // rapporte rien. À 2,6 % on le lit comme un déplacement de caméra sans jamais
  // voir le bord du cadre — le zoom de 4 % minimum garde la marge nécessaire.
  const pan = ken
    ? interpolate(
        image,
        [0, dureeImages],
        graine % 3 === 0 ? [-2.6, 2.6] : graine % 3 === 1 ? [2.6, -2.6] : [0, 0],
        { extrapolateRight: 'clamp' }
      )
    : 0
  // LES PLANS DE BANQUE SONT ÉTALONNÉS, LES PLANS GÉNÉRÉS NE LE SONT PAS.
  //
  // Les seconds naissent déjà dans la palette de la chaîne. Les premiers arrivent
  // avec les couleurs de n'importe quel stock, et posés à côté ils trahissent
  // immédiatement leur provenance. On les désature et on les pousse vers le rouge
  // pour qu'ils appartiennent à la même vidéo — c'est ce qui fait qu'un plan
  // gratuit cesse de ressembler à un plan gratuit.
  const estGenere = /(?:flux|clip)-\d|(?:^|\/)ia-/.test(src)
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${zoom}) translateX(${pan}%)`,
    filter: estGenere ? 'none' : etalonnageBanque,
  }

  // UN CLIP TROP COURT SE RALENTIT, IL NE SE FIGE PAS ET NE SE RÉPÈTE PAS.
  //
  // Un plan généré dure cinq secondes. Sur un créneau plus long, il gelait sur
  // sa dernière image — le défaut le plus visible d'un montage. Boucler serait
  // pire : le saut de raccord se voit, et l'œil comprend qu'on rejoue la même
  // chose.
  //
  // Le ralenti, lui, ne se voit pas : ces plans portent déjà un mouvement très
  // lent, donc l'étirer reste lisible comme un mouvement d'appareil.
  //
  // SANS PLANCHER. Il y en avait un à 0,5×, et il recréait exactement le gel
  // qu'il croyait éviter : un clip sur un créneau de plus de deux fois sa durée
  // couvrait 2× puis figeait sa dernière image pour le reste. Entre un ralenti
  // extrême et un arrêt sur image, le ralenti gagne toujours — il reste un
  // mouvement. Le vrai remède aux grands écarts est en amont, dans le choix du
  // plan ; ici on garantit seulement que l'image ne s'arrête jamais.
  const source = dureeSourceMs ? (dureeSourceMs / 1000) * fps : null
  const vitesse = source && source < dureeImages ? source / dureeImages : 1

  return estVideo ? (
    <OffthreadVideo src={staticFile(src)} muted playbackRate={vitesse} style={style} />
  ) : (
    <Img src={staticFile(src)} style={style} />
  )
}

const Compteur: React.FC<{
  de: number
  a: number
  prefixe?: string
  suffixe?: string
  dureeImages: number
  theme: Theme
  echelle: number
}> = ({ de, a, prefixe, suffixe, dureeImages, theme, echelle }) => {
  const image = useCurrentFrame()
  // La montée occupe les deux premiers tiers : le chiffre final doit rester
  // lisible un moment, sinon on n'a vu que l'animation.
  const p = interpolate(image, [0, dureeImages * 0.66], [0, 1], {
    extrapolateRight: 'clamp',
    easing: SORTIE_DOUCE,
  })
  const valeur = Math.round(de + (a - de) * p)
  return (
    <span
      style={{
        fontFamily: theme.policeChiffres,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 800,
        fontSize: 150 * echelle,
        color: theme.accent,
        textShadow: '0 6px 40px rgba(0,0,0,0.6)',
        letterSpacing: '-0.03em',
      }}
    >
      {prefixe ?? ''}
      {valeur.toLocaleString('fr-FR')}
      {suffixe ?? ''}
    </span>
  )
}

const UnEvenement: React.FC<{ ev: Evenement; theme: Theme; dureeImages: number }> = ({
  ev,
  theme,
  dureeImages,
}) => {
  const image = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  // Le petit côté, pas la largeur — voir `echelleDe` dans SousTitres.tsx. Tout
  // ce qui est dimensionné ici l'est pour la composition de référence 1080 ×
  // 1920 ; prendre la largeur grossissait de 78 % chaque mot-clé, chaque
  // chiffre et chaque carte d'insert d'un montage horizontal.
  const e = Math.min(width, height) / 1080
  const opacite = fonduEntreeSortie(image, dureeImages, fps)
  const monte = glisseEntree(image, fps)

  switch (ev.type) {
    case 'broll': {
      // PLUS AUCUN FONDU ENTRE DEUX PLANS. Deux raccords, et deux seulement :
      //
      // - **la coupe sèche avec impact** — le plan entre 4 % trop grand et se
      //   pose en un quart de seconde. Sous le seuil où on le remarque,
      //   au-dessus du seuil où on le ressent. Le fondu enchaîné entre deux
      //   plans de banque est le langage du diaporama ; pire, les plans étant
      //   contigus, le fondu d'entrée révélait le FOND pendant un quart de
      //   seconde à chaque raccord — un battement sombre sur toute la vidéo.
      // - **la poussée de section** — au changement de bloc du script, le
      //   nouveau plan monte et pousse l'ancien. C'est la hiérarchie : coupe
      //   dans une idée, poussée entre deux idées.
      //
      // Le premier plan n'a droit à rien : c'est la vignette, il est parfait
      // et immobile dès la première image.
      // LE GESTE D'ARRIVÉE ALTERNE, ET C'EST CE QUI TIENT SUR LA DURÉE.
      //
      // Chaque plan arrivait en se posant depuis un léger sur-cadrage — toujours
      // le même geste, quarante fois de suite. Isolément c'est bon ; répété,
      // l'œil apprend la mécanique en trois plans et cesse de la voir, ce qui
      // est exactement le signal « diaporama » qu'on cherche à éviter.
      //
      // Un plan sur deux se pose SEC — cinq pour cent en huit images — et l'autre
      // ARRIVE LONG : deux pour cent sur seize images. Deux gestes distincts,
      // qui se répondent d'une coupe à l'autre.
      //
      // LE SUR-CADRAGE NE DESCEND JAMAIS SOUS 1, et ce n'est pas une préférence.
      // Un plan à `scale(0.97)` est plus petit que le cadre : ses bords
      // découvrent le fond uni pendant un tiers de seconde, à chaque coupe. Le
      // dépôt a déjà payé ce défaut une fois, avec le fondu d'entrée des plans
      // contigus — c'est écrit trente lignes plus haut.
      const grainePlan = (ev.src ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      const sec = grainePlan % 2 === 0
      const impact =
        ev.debutMs === 0 || ev.entreeSection
          ? 1
          : interpolate(image, [0, sec ? 8 : 16], sec ? [1.05, 1] : [1.02, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: (x) => 1 - Math.pow(1 - x, 3),
            })
      const poussee = ev.entreeSection
        ? interpolate(image, [0, 11], [100, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: (x) => 1 - Math.pow(1 - x, 3),
          })
        : 0
      // Le flou de mouvement de la poussée : maximal quand le plan file, nul
      // quand il se pose. Onze images d'écran qui traverse la hauteur, net du
      // premier au dernier pixel, ça se lit comme un déplacement d'interface ;
      // avec le flou, ça se lit comme un mouvement de caméra. C'est le même
      // trajet — c'est l'œil qui change de catégorie.
      const flou =
        ev.entreeSection && image < 11 ? Math.sin((image / 11) * Math.PI) * 7 : 0
      // LE FOND RECULE QUAND UN INSERT SE POSE, ET C'EST CE QUI LE REND LISIBLE.
      //
      // Deux images de même netteté sur le même plan se disputent le regard :
      // on lit l'une ou l'autre, jamais les deux, et le montage donne l'impression
      // d'être chargé. Un pas en arrière — six pour cent d'échelle, un voile de
      // flou, un assombrissement léger — et la hiérarchie devient évidente sans
      // qu'aucun des deux plans ne disparaisse.
      //
      // Le recul suit l'arrivée de la carte et revient avec son départ : c'est
      // le même mouvement, vu de l'autre côté.
      const recul = ev.insert
        ? interpolate(
            image,
            [0, Math.round(fps * 0.4), Math.max(0, dureeImages - Math.round(fps * 0.3)), dureeImages],
            [0, 1, 1, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )
        : 0

      return (
        <AbsoluteFill>
          <AbsoluteFill
            style={{
              transform: `translateY(${poussee.toFixed(2)}%) scale(${(impact * (1 + recul * 0.06)).toFixed(4)})`,
              filter:
                flou > 0.3 || recul > 0.02
                  ? `blur(${(flou + recul * 3.5).toFixed(1)}px) brightness(${(1 - recul * 0.22).toFixed(3)})`
                  : undefined,
            }}
          >
            <Broll
              src={ev.src}
              ken={ev.ken}
              dureeImages={dureeImages}
              dureeSourceMs={ev.dureeSourceMs}
              etalonnageBanque={etalonnageDe(theme)}
            />
          </AbsoluteFill>
          {ev.insert ? (
            <InsertPerso insert={ev.insert} dureeImages={dureeImages} rayon={theme.rayon * e} />
          ) : null}
        </AbsoluteFill>
      )
    }

    case 'capture':
      return (
        <AbsoluteFill style={{ ...ancrage(ev.position ?? 'plein'), opacity: opacite }}>
          <Img
            src={staticFile(ev.src)}
            style={{
              maxWidth: '84%',
              maxHeight: '72%',
              borderRadius: theme.rayon * e,
              boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
              transform: `translateY(${monte}px)`,
            }}
          />
        </AbsoluteFill>
      )

    case 'mot-cle':
      return (
        <AbsoluteFill style={{ ...ancrage(ev.position ?? 'haut'), opacity: opacite }}>
          <span
            style={{
              fontFamily: theme.policeTitres,
              fontWeight: 800,
              fontSize: 62 * e,
              color: theme.texte,
              backgroundColor: theme.accent,
              padding: `${10 * e}px ${24 * e}px`,
              borderRadius: theme.rayon * e,
              transform: `translateY(${monte}px)`,
              boxShadow: '0 12px 44px rgba(0,0,0,0.45)',
            }}
          >
            {ev.texte}
          </span>
        </AbsoluteFill>
      )

    case 'souligne':
      return (
        <AbsoluteFill style={{ ...ancrage(ev.position ?? 'haut'), opacity: opacite }}>
          <span
            style={{
              fontFamily: theme.policeTitres,
              fontWeight: 700,
              fontSize: 58 * e,
              color: theme.texte,
              backgroundImage: `linear-gradient(${theme.accent}, ${theme.accent})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '0 88%',
              backgroundSize: `${interpolate(image, [0, Math.round(fps * 0.45)], [0, 100], {
                extrapolateRight: 'clamp',
                easing: SORTIE_DOUCE,
              })}% ${0.22 * 58 * e}px`,
            }}
          >
            {ev.texte}
          </span>
        </AbsoluteFill>
      )

    case 'chiffre':
      return (
        <AbsoluteFill style={{ ...ancrage(ev.position ?? 'plein'), opacity: opacite }}>
          <Compteur
            de={ev.de}
            a={ev.a}
            prefixe={ev.prefixe}
            suffixe={ev.suffixe}
            dureeImages={dureeImages}
            theme={theme}
            echelle={e}
          />
        </AbsoluteFill>
      )

    case 'carton': {
      // LE CARTON NE PEINT PLUS UN APLAT SUR TOUTE L'IMAGE.
      //
      // Il le faisait, et le résultat était un écran noir avec un petit mot au
      // milieu — sur un format vertical, la typo occupait moins d'un dixième de
      // la hauteur et le reste était du vide. Or ce carton porte l'appel à
      // l'action : c'est l'élément qui doit être le plus fort de la vidéo.
      //
      // Désormais l'image reste visible sous un voile, et c'est le MOT qui
      // occupe l'écran : un bloc d'accent qui balaie, la typo au maximum de ce
      // que la largeur permet, et une flèche qui pointe vers l'endroit où
      // l'action se passe.
      const balayage = interpolate(image, [0, Math.round(fps * 0.4)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: SORTIE_DOUCE,
      })
      const pose = interpolate(image, [0, Math.round(fps * 0.55)], [0.88, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: SORTIE_DOUCE,
      })
      const battement = 1 + Math.sin((image / fps) * 3.2) * 0.012
      return (
        <AbsoluteFill style={{ opacity: opacite }}>
          <AbsoluteFill
            style={{
              background: `radial-gradient(120% 80% at 50% 45%, ${theme.fond}D9 0%, ${theme.fond}F5 60%, ${theme.fond} 100%)`,
            }}
          />
          <AbsoluteFill
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              padding: `0 ${48 * e}px`,
              textAlign: 'center',
            }}
          >
            {ev.sousTexte ? (
              <div
                style={{
                  fontFamily: theme.policeTitres,
                  fontSize: 30 * e,
                  fontWeight: 700,
                  letterSpacing: 8 * e,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: 26 * e,
                  clipPath: `inset(0 ${(100 - balayage * 100).toFixed(1)}% 0 0)`,
                }}
              >
                {ev.sousTexte}
              </div>
            ) : null}

            <div
              style={{
                position: 'relative',
                padding: `${18 * e}px ${44 * e}px`,
                transform: `scale(${(pose * battement).toFixed(4)})`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: theme.accent,
                  transformOrigin: 'left center',
                  transform: `scaleX(${balayage})`,
                }}
              />
              <span
                style={{
                  position: 'relative',
                  fontFamily: theme.policeSousTitres,
                  fontSize: 190 * e,
                  lineHeight: 1,
                  letterSpacing: -2 * e,
                  color: theme.texte,
                  textTransform: 'uppercase',
                  clipPath: `inset(0 ${(100 - balayage * 100).toFixed(1)}% 0 0)`,
                }}
              >
                {ev.texte}
              </span>
            </div>

            <div
              style={{
                marginTop: 40 * e,
                fontSize: 64 * e,
                lineHeight: 1,
                color: theme.accent,
                opacity: interpolate(image, [fps * 0.5, fps * 0.9], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                transform: `translateY(${Math.round(Math.sin((image / fps) * 4) * 6 * e)}px)`,
              }}
            >
              ↓
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      )
    }

    case 'infographie':
      return (
        <AbsoluteFill style={{ ...ancrage(ev.position ?? 'plein'), opacity: opacite }}>
          <Infographies info={ev} theme={theme} echelle={e} dureeImages={dureeImages} />
        </AbsoluteFill>
      )

    case 'flou':
      return (
        <AbsoluteFill>
          <div
            style={{
              position: 'absolute',
              left: `${ev.zone.x}%`,
              top: `${ev.zone.y}%`,
              width: `${ev.zone.l}%`,
              height: `${ev.zone.h}%`,
              backdropFilter: 'blur(26px)',
              borderRadius: 8 * e,
            }}
          />
        </AbsoluteFill>
      )

    default:
      return null
  }
}

export const Evenements: React.FC<{
  evenements: Evenement[]
  theme: Theme
  /**
   * Quelle moitié du monde ce composant rend.
   *
   * `fond` — les plans de coupe et les flous : de l'IMAGE, qui passe sous
   * l'étalonnage. `habillage` — infographies, cartons, mots : du GRAPHISME, qui
   * garde ses couleurs franches. Monter les deux dans le même conteneur faisait
   * passer l'habillage sous le partage de teintes : le rouge d'accent en
   * ressortait terni, exactement ce que l'étalonnage promettait d'épargner.
   */
  couche?: 'fond' | 'habillage'
}> = ({ evenements, theme, couche }) => {
  const { fps } = useVideoConfig()
  const visibles = couche
    ? evenements.filter((ev) =>
        couche === 'fond' ? ev.type === 'broll' || ev.type === 'flou' : ev.type !== 'broll' && ev.type !== 'flou'
      )
    : evenements
  return (
    <AbsoluteFill>
      {/* LES PLANS DE COUPE PASSENT TOUJOURS DERRIÈRE.
          Ils sont l'image de fond, pas une surcouche. Rendus dans l'ordre du
          tableau, un plan ajouté après une infographie la RECOUVRAIT — et comme
          il occupe tout l'écran, l'infographie devenait purement et simplement
          invisible. On trie donc par calque avant de rendre, en gardant l'ordre
          d'origine à l'intérieur de chaque calque. */}
      {[...visibles]
        .map((ev, i) => ({ ev, i }))
        .sort((a, b) => {
          const calque = (t: string) => (t === 'broll' ? 0 : t === 'flou' ? 1 : 2)
          return calque(a.ev.type) - calque(b.ev.type) || a.i - b.i
        })
        .map(({ ev }, i) => {
        // Début et FIN sont arrondis sur la même grille, et la durée est leur
        // différence. Arrondir début et durée séparément faisait qu'un raccord
        // sur huit perdait une image : round(a) + round(b) vaut parfois
        // round(a+b) − 1, le plan finissait une image avant l'entrée du
        // suivant, et le fond flashait 33 ms — le battement sombre qu'on
        // pourchasse partout ailleurs.
        const de = msVersImages(ev.debutMs, fps)
        const duree = Math.max(1, msVersImages(ev.debutMs + ev.dureeMs, fps) - de)
        return (
          <Sequence
            key={`${ev.type}-${ev.debutMs}-${i}`}
            from={de}
            durationInFrames={duree}
            layout="none"
            name={ev.type}
          >
            <UnEvenement ev={ev} theme={theme} dureeImages={duree} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
