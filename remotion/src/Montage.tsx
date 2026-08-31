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
  random,
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
  // Jamais plus du tiers de la vidéo : sur un fichier court, un fondu plus long
  // que la moitié de la durée rend l'inputRange non croissant et fait planter
  // interpolate() — donc tout le rendu.
  const fondu = Math.max(1, Math.min(msVersImages(fondueMs, fps), Math.floor(durationInFrames / 3)))
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

/**
 * Un fondu depuis le noir en ouverture — RÉSERVÉ AU FORMAT LONG.
 *
 * Sur un format court, c'est un contresens complet. La première image est deux
 * choses à la fois : la vignette que la plateforme propose dans le fil, et le
 * quart de seconde où la rétention se décide. Ouvrir sur du noir, c'est proposer
 * un carré vide dans le fil et perdre l'ouverture — pour éviter un défaut, la
 * première image figée, qui n'existe plus depuis que la piste image est un
 * fichier continu.
 *
 * Sur un format long, où le spectateur a déjà cliqué, le fondu garde son sens.
 */
const OuvertureAuNoir: React.FC<{ fond: string; format: string }> = ({ fond, format }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (String(format).startsWith('short')) return null
  const opacite = interpolate(image, [0, Math.round(fps * 0.25)], [1, 0], {
    extrapolateRight: 'clamp',
  })
  if (opacite <= 0) return null
  return <AbsoluteFill style={{ backgroundColor: fond, opacity: opacite }} />
}

/**
 * L'étage image entier, avec les zooms d'appui.
 *
 * Le punch s'applique ICI, au conteneur qui porte la piste ET les plans de
 * coupe — pas à la piste seule. Sur un format sans caméra, la piste est un fond
 * uni invisible sous les plans : un zoom dessus ne zoomait littéralement rien,
 * et les dix punch-ins de la première vidéo n'ont jamais existé à l'écran.
 *
 * Le geste : une montée franche sur le mot (un tiers de seconde), une tenue
 * courte, un retour doux. C'est le mouvement d'un zoom d'appui — il souligne,
 * il ne décore pas. Les sous-titres restent hors de l'étage : eux ne bougent
 * jamais.
 */
const EtageImage: React.FC<{
  punchs: { debutMs: number; amplitude: number }[]
  children: React.ReactNode
}> = ({ punchs, children }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const ms = (image / fps) * 1000

  let zoom = 1
  for (const p of punchs) {
    const t = ms - p.debutMs
    if (t < 0 || t > 2400) continue
    const entree = interpolate(t, [0, 320], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: (x) => 1 - Math.pow(1 - x, 3),
    })
    const sortie = interpolate(t, [1100, 2400], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: (x) => x * x,
    })
    zoom = Math.max(zoom, 1 + p.amplitude * entree * sortie)
  }

  return (
    <AbsoluteFill style={{ transform: `scale(${zoom.toFixed(4)})`, willChange: 'transform' }}>
      {children}
    </AbsoluteFill>
  )
}

/**
 * L'étalonnage d'ensemble : un contraste léger, et un partage de teintes —
 * ombres froides en haut, chaleur d'accent en bas, fondues en lumière douce.
 * C'est le geste qui distingue une image étalonnée d'une image filtrée : le
 * filtre décale tout uniformément, le partage de teintes donne une direction à
 * la lumière.
 *
 * Il n'enveloppe QUE la couche image (piste + plans de coupe). La première
 * version enveloppait aussi l'habillage, et le rouge d'accent des infographies
 * en ressortait terni — l'étalonnage abîmait précisément ce qu'il promettait
 * d'épargner. Le graphisme se monte au-dessus, hors du filtre.
 */
/** Une couleur hexadécimale du thème, en rgba à l'opacité voulue. */
const teinte = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

const Etalonnage: React.FC<{ accent: string; children: React.ReactNode }> = ({
  accent,
  children,
}) => (
  <>
    <AbsoluteFill style={{ filter: 'contrast(1.06) saturate(1.05)' }}>{children}</AbsoluteFill>
    {/* La chaleur du bas vient de la COULEUR D'ACCENT DE LA CHAÎNE, pas d'une
        valeur en dur : une chaîne bleue aura des bas de cadre bleus. C'est ce
        qui rend l'étalonnage réplicable — le template porte le geste, la config
        porte la teinte. Le froid du haut reste neutre : des ombres froides sont
        des ombres froides sur n'importe quelle chaîne. */}
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'soft-light',
        background: `linear-gradient(180deg, rgba(36,52,78,0.55) 0%, rgba(0,0,0,0) 42%, ${teinte(accent, 0.38)} 100%)`,
      }}
    />
  </>
)

/**
 * Le voile d'ambiance : vignette et grain, sur toute la vidéo.
 *
 * C'est la couche qui unifie. Les plans viennent de trois mondes — banque
 * étalonnée, génération, aplats — et c'est le même grain et la même retombée de
 * lumière dans les angles qui les font appartenir à une seule vidéo. Le grain
 * DÉRIVE d'image en image : figé, il se lit comme de la poussière sur l'écran.
 */
const Ambiance: React.FC<{ reglage?: string }> = ({ reglage = 'neutre' }) => {
  const image = useCurrentFrame()
  const { width, height } = useVideoConfig()

  // Une chaîne qui réconforte ne peut pas avoir l'atmosphère d'une chaîne qui
  // alarme. La vignette et le grain suivent donc l'ambiance déclarée : douce
  // laisse respirer les bords et pose un grain à peine perceptible, dure ferme
  // le cadre et charge la matière.
  const force =
    reglage === 'douce' ? { vignette: 0.2, grain: 0.26 }
    : reglage === 'dure' ? { vignette: 0.5, grain: 0.55 }
    : { vignette: 0.34, grain: 0.4 }

  const grains = React.useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i < 700; i++) {
      const x = random(`ax${i}`) * 100
      const y = random(`ay${i}`) * 100
      const o = 0.025 + random(`ao${i}`) * 0.045
      pts.push(
        `radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%, rgba(255,255,255,${o.toFixed(3)}) 0 1px, transparent 1px)`
      )
    }
    return pts.join(',')
  }, [])

  // Trois positions qui tournent : assez pour que le grain vive, assez peu pour
  // ne pas recalculer un fond à chaque image.
  const derive = image % 3
  return (
    <>
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            `radial-gradient(130% 100% at 50% 42%, transparent 55%, rgba(0,0,0,${force.vignette}) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          opacity: force.grain,
          backgroundImage: grains,
          backgroundSize: `${width}px ${height}px`,
          backgroundPosition: `${derive * 7}px ${derive * -11}px`,
          mixBlendMode: 'overlay',
        }}
      />
    </>
  )
}

export const Montage: React.FC<{ plan: Plan }> = ({ plan }) => {
  const { theme } = plan

  return (
    <AbsoluteFill style={{ backgroundColor: theme.fond }}>
      <Polices polices={theme.polices} />

      <EtageImage punchs={plan.punchs ?? []}>
        {/* La couche image passe sous l'étalonnage, l'habillage au-dessus :
            les deux zooment ensemble avec le punch, mais seuls les plans
            reçoivent le partage de teintes. */}
        <Etalonnage accent={theme.accent}>
          {plan.piste ? (
            <PisteVideo src={plan.piste.src} coupes={plan.coupes} fond={theme.fond} />
          ) : null}
          <Evenements evenements={plan.evenements} theme={theme} couche="fond" />
        </Etalonnage>

        <Evenements evenements={plan.evenements} theme={theme} couche="habillage" />
      </EtageImage>

      <Ambiance reglage={theme.ambiance} />

      <SousTitres mots={plan.mots} theme={theme} punchs={plan.punchs} />

      {plan.logo ? <Filigrane src={plan.logo} /> : null}

      <OuvertureAuNoir fond={theme.fond} format={plan.format} />

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
