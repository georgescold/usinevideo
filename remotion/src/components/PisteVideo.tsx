/**
 * La piste image.
 *
 * Un seul fichier, deja monte par ffmpeg : les silences retires, les morceaux
 * recolles, la definition finale. Remotion le lit d'un trait.
 *
 * C'est delibere. Empiler une sequence par plan obligerait le decodeur a se
 * repositionner a chaque coupe, ce qui produit une image noire a chaque jump
 * cut et impose de recopier tous les rushes dans le dossier public a chaque
 * rendu. Ici ffmpeg fait ce qu'il fait le mieux (couper, recoller, encoder) et
 * Remotion ce qu'il fait le mieux (animer par-dessus).
 *
 * Ne restent donc ici que les effets qui s'appliquent SUR l'image : le
 * resserrement progressif et les effets de jointure.
 */

import React from 'react'
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  OffthreadVideo,
} from 'remotion'
import type { Coupe, Transition } from '../types'
import { msVersImages, dureeEnImages, SORTIE_DOUCE } from '../lib/temps'

const styleJointure = (
  entree: Transition,
  imageLocale: number,
  fps: number
): React.CSSProperties => {
  const d = Math.max(1, msVersImages(entree.dureeMs, fps))
  const p = interpolate(imageLocale, [0, d], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: SORTIE_DOUCE,
  })

  switch (entree.effet) {
    case 'fondu':
      // Un voile de fond qui s'efface : la piste est continue, il n'y a pas de
      // « plan d'avant » a faire apparaitre par-dessous.
      return { opacity: 1 - p }
    case 'glissement': {
      const signe = entree.sens === 'droite' || entree.sens === 'bas' ? 1 : -1
      const axe = entree.sens === 'haut' || entree.sens === 'bas' ? 'Y' : 'X'
      return { opacity: 1 - p, transform: `translate${axe}(${p * 18 * signe}%)` }
    }
    case 'volet': {
      const cote =
        entree.sens === 'droite'
          ? `inset(0 0 0 ${p * 100}%)`
          : entree.sens === 'haut'
            ? `inset(${p * 100}% 0 0 0)`
            : entree.sens === 'bas'
              ? `inset(0 0 ${p * 100}% 0)`
              : `inset(0 ${p * 100}% 0 0)`
      return { clipPath: cote }
    }
    default:
      return {}
  }
}

/** Un voile pose sur la jointure. Blanc pour un flash, couleur de fond sinon. */
const Jointure: React.FC<{ entree: Transition; fond: string }> = ({ entree, fond }) => {
  const { fps } = useVideoConfig()
  const image = useCurrentFrame()

  if (entree.effet === 'flash') {
    const d = Math.max(1, msVersImages(entree.dureeMs, fps))
    const opacite = interpolate(image, [0, d * 0.3, d], [0, 0.8, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    return <AbsoluteFill style={{ backgroundColor: '#fff', opacity: opacite }} />
  }

  return (
    <AbsoluteFill
      style={{ backgroundColor: fond, ...styleJointure(entree, image, fps) }}
    />
  )
}

export const PisteVideo: React.FC<{ src: string; coupes: Coupe[]; fond: string }> = ({
  src,
  coupes,
  fond,
}) => {
  const { fps } = useVideoConfig()
  const image = useCurrentFrame()

  // Le resserrement porte sur la video elle-meme, pas sur une couche au-dessus :
  // on determine donc la coupe en cours au lieu d'empiler des sequences.
  const msCourant = (image / fps) * 1000
  const active = coupes.find((c) => msCourant >= c.debutMs && msCourant < c.debutMs + c.dureeMs)
  const zoom =
    active && active.punchIn
      ? interpolate(msCourant - active.debutMs, [0, active.dureeMs], [1, 1 + active.punchIn], {
          extrapolateRight: 'clamp',
          easing: SORTIE_DOUCE,
        })
      : 1

  return (
    <AbsoluteFill style={{ backgroundColor: fond }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {/* OffthreadVideo extrait les images avec le ffmpeg de Remotion.
            Le decodeur WebCodecs de @remotion/media est plus rapide en apercu
            mais cale sur certains flux H.264 encodes par le GPU — et un rendu
            qui echoue apres vingt minutes coute plus cher que quelques
            secondes gagnees. */}
        <OffthreadVideo
          src={staticFile(src)}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {coupes
        .filter((c) => c.entree && c.entree.effet !== 'aucun')
        .map((c, i) => (
          <Sequence
            key={`${c.debutMs}-${i}`}
            from={msVersImages(c.debutMs, fps)}
            durationInFrames={dureeEnImages(c.entree!.dureeMs, fps)}
            layout="none"
            name={`jointure ${i + 1}`}
          >
            <Jointure entree={c.entree!} fond={fond} />
          </Sequence>
        ))}
    </AbsoluteFill>
  )
}
