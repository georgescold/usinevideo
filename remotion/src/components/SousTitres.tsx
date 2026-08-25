/**
 * Sous-titres calés mot à mot.
 *
 * Les temps viennent de la transcription réelle de l'audio final : rien n'est
 * estimé ici. La pagination est déterministe — même plan, mêmes pages — pour
 * qu'un nouveau rendu ne fasse pas bouger le texte d'une image.
 */

import React from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import type { Mot, Theme } from '../types'
import { imagesVersMs, msVersImages } from '../lib/temps'

type Page = { mots: Mot[]; debutMs: number; finMs: number }

/** Un blanc plus long que ça referme la page en cours : on ne fait pas tenir
 *  deux respirations sur la même ligne. */
const SILENCE_QUI_COUPE_MS = 420

/**
 * Au-delà de ce délai après le dernier mot, la page disparaît au lieu d'attendre
 * la suivante. Sans cette borne, un silence volontaire laisse une phrase morte à
 * l'écran ; avec une borne trop courte, les respirations font clignoter le texte.
 */
const TENUE_MAX_MS = 2000

const FIN_DE_PHRASE = /[.!?…:]$/

export function pagine(mots: Mot[], motsParPage: number): Page[] {
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

    if (courante.length >= motsParPage) ferme()
    else if (FIN_DE_PHRASE.test(mot.texte)) ferme()
  }
  ferme()
  return pages
}

const casse = (t: string, mode: Theme['sousTitres']['casse']) =>
  mode === 'majuscules' ? t.toLocaleUpperCase('fr-FR') : t

/** La ponctuation reste dans le texte lu, pas à l'écran — sauf ? et ! */
const nettoie = (t: string) => t.replace(/[.,;:…]+$/g, '')

const ombre = (actif: boolean) =>
  actif ? 'none' : '0 2px 12px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.9)'

const UnePage: React.FC<{ page: Page; theme: Theme; largeur: number }> = ({ page, theme, largeur }) => {
  // `image` est locale à la séquence de la page : la petite animation
  // d'apparition rejoue donc à chaque page, et non une seule fois au début.
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const msCourant = page.debutMs + imagesVersMs(image, fps)
  const st = theme.sousTitres

  // Le texte est dimensionné pour une composition de 1080 de large ; on met à
  // l'échelle pour que le même thème marche en 1920 comme en 1080.
  const echelle = largeur / 1080
  const taille = st.taille * echelle

  const apparition = spring({
    frame: image,
    fps,
    config: { damping: 200, stiffness: 220, mass: 0.5 },
    durationInFrames: Math.round(fps * 0.18),
  })

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: `${0.22 * taille}px`,
        maxWidth: '86%',
        transform: `scale(${interpolate(apparition, [0, 1], [0.94, 1])})`,
      }}
    >
      {page.mots.map((mot, i) => {
        const actif = msCourant >= mot.debutMs && msCourant < mot.finMs
        const dejaDit = msCourant >= mot.finMs
        const texte = casse(nettoie(mot.texte), st.casse)

        if (st.style === 'ligne-karaoke') {
          return (
            <span
              key={i}
              style={{
                fontFamily: theme.policeSousTitres,
                fontWeight: 800,
                fontSize: taille,
                letterSpacing: '-0.02em',
                color: actif || dejaDit ? theme.accent : theme.texte,
                textShadow: st.contour ? ombre(false) : 'none',
                opacity: dejaDit ? 0.9 : 1,
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
                fontFamily: theme.policeSousTitres,
                fontWeight: 800,
                fontSize: taille,
                letterSpacing: '-0.02em',
                color: theme.texte,
                backgroundColor: actif ? theme.accent : 'transparent',
                padding: actif ? `${0.06 * taille}px ${0.16 * taille}px` : `${0.06 * taille}px 0`,
                borderRadius: theme.rayon * echelle,
                textShadow: st.contour ? ombre(actif) : 'none',
                opacity: actif ? 1 : 0.92,
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
              fontFamily: theme.policeSousTitres,
              fontWeight: 700,
              fontSize: taille * 0.82,
              color: actif ? theme.accent : theme.texte,
              textShadow: st.contour ? ombre(false) : 'none',
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

export const SousTitres: React.FC<{ mots: Mot[]; theme: Theme }> = ({ mots, theme }) => {
  const { fps, width, height } = useVideoConfig()

  const pages = React.useMemo(
    () => pagine(mots, theme.sousTitres.motsParPage),
    [mots, theme.sousTitres.motsParPage]
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
              <UnePage page={page} theme={theme} largeur={width} />
            </AbsoluteFill>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
