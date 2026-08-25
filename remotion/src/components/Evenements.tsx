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
} from 'remotion'
import type { Evenement, Theme } from '../types'
import { dureeEnImages, msVersImages, fonduEntreeSortie, glisseEntree, SORTIE_DOUCE } from '../lib/temps'
import { Infographies } from './Infographies'

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
const Broll: React.FC<{ src: string; ken?: boolean; dureeImages: number }> = ({
  src,
  ken,
  dureeImages,
}) => {
  const image = useCurrentFrame()
  const estVideo = /\.(mp4|mov|webm|mkv)$/i.test(src)
  const zoom = ken
    ? interpolate(image, [0, dureeImages], [1.0, 1.08], { extrapolateRight: 'clamp' })
    : 1
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${zoom})`,
  }
  return estVideo ? (
    <OffthreadVideo src={staticFile(src)} muted style={style} />
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
  const { fps, width } = useVideoConfig()
  const e = width / 1080
  const opacite = fonduEntreeSortie(image, dureeImages, fps)
  const monte = glisseEntree(image, fps)

  switch (ev.type) {
    case 'broll':
      return (
        <AbsoluteFill style={{ opacity: opacite }}>
          <Broll src={ev.src} ken={ev.ken} dureeImages={dureeImages} />
        </AbsoluteFill>
      )

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

    case 'carton':
      return (
        <AbsoluteFill
          style={{
            backgroundColor: theme.fond,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: opacite,
            padding: '8%',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: theme.policeTitres,
              fontWeight: 800,
              fontSize: 92 * e,
              color: theme.texte,
              letterSpacing: '-0.03em',
              lineHeight: 1.08,
              transform: `translateY(${monte}px)`,
            }}
          >
            {ev.texte}
          </div>
          {ev.sousTexte ? (
            <div
              style={{
                fontFamily: theme.policeTitres,
                fontSize: 40 * e,
                color: theme.accent,
                marginTop: 22 * e,
              }}
            >
              {ev.sousTexte}
            </div>
          ) : null}
        </AbsoluteFill>
      )

    case 'infographie':
      return (
        <AbsoluteFill style={{ ...ancrage(ev.position ?? 'plein'), opacity: opacite }}>
          <Infographies info={ev} theme={theme} echelle={e} />
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

export const Evenements: React.FC<{ evenements: Evenement[]; theme: Theme }> = ({
  evenements,
  theme,
}) => {
  const { fps } = useVideoConfig()
  return (
    <AbsoluteFill>
      {evenements.map((ev, i) => {
        const duree = dureeEnImages(ev.dureeMs, fps)
        return (
          <Sequence
            key={`${ev.type}-${ev.debutMs}-${i}`}
            from={msVersImages(ev.debutMs, fps)}
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
