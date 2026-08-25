/**
 * Le montage.
 *
 * L'ordre des couches n'est pas négociable : image → B-roll et habillage →
 * sous-titres → filigrane. Un sous-titre passe toujours au-dessus d'un plan de
 * coupe, sinon la phrase disparaît au moment où elle compte.
 *
 * Aucun calcul de timing ici : tout vient de `plan.json`.
 */

import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  staticFile,
  useVideoConfig,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import type { Plan } from './types'
import { PisteVideo } from './components/PisteVideo'
import { SousTitres } from './components/SousTitres'
import { Evenements } from './components/Evenements'
import { Polices } from './lib/polices'
import { msVersImages } from './lib/temps'

const Musique: React.FC<{ src: string; volume: number; fondueMs: number }> = ({
  src,
  volume,
  fondueMs,
}) => {
  const { fps, durationInFrames } = useVideoConfig()
  const fondu = Math.max(1, msVersImages(fondueMs, fps))
  return (
    <Audio
      src={staticFile(src)}
      volume={(f) =>
        interpolate(
          f,
          [0, fondu, durationInFrames - fondu, durationInFrames],
          [0, volume, volume, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )
      }
    />
  )
}

const Filigrane: React.FC<{ src: string }> = ({ src }) => {
  const { width } = useVideoConfig()
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: '3%' }}>
      <Img src={staticFile(src)} style={{ width: width * 0.09, opacity: 0.5 }} />
    </AbsoluteFill>
  )
}

/** Un noir d'une demi-seconde en ouverture évite la première image figée. */
const OuvertureAuNoir: React.FC<{ fond: string }> = ({ fond }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const opacite = interpolate(image, [0, Math.round(fps * 0.25)], [1, 0], {
    extrapolateRight: 'clamp',
  })
  if (opacite <= 0) return null
  return <AbsoluteFill style={{ backgroundColor: fond, opacity: opacite }} />
}

export const Montage: React.FC<{ plan: Plan }> = ({ plan }) => {
  const { theme } = plan

  return (
    <AbsoluteFill style={{ backgroundColor: theme.fond }}>
      <Polices polices={theme.polices} />

      {plan.piste ? (
        <PisteVideo src={plan.piste.src} coupes={plan.coupes} fond={theme.fond} />
      ) : null}

      <Evenements evenements={plan.evenements} theme={theme} />

      <SousTitres mots={plan.mots} theme={theme} />

      {plan.logo ? <Filigrane src={plan.logo} /> : null}

      <OuvertureAuNoir fond={theme.fond} />

      {/* Sans voix (aperçu, muet volontaire), on ne monte pas de piste audio :
          un <Audio> vers un fichier absent fait échouer le rendu entier. */}
      {plan.voix?.src ? (
        <Audio src={staticFile(plan.voix.src)} volume={plan.voix.volume ?? 1} />
      ) : null}
      {plan.musique ? (
        <Musique
          src={plan.musique.src}
          volume={plan.musique.volume}
          fondueMs={plan.musique.fondueMs ?? 1200}
        />
      ) : null}
    </AbsoluteFill>
  )
}
