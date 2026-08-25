/**
 * Les six modèles d'infographie.
 *
 * Règle commune : **une idée par infographie**. Si deux idées doivent tenir à
 * l'écran, ce sont deux infographies. Chaque modèle apparaît en cascade, tient
 * le temps d'être lu, et sort sans effet — la sortie ne doit pas voler
 * l'attention à ce qui suit.
 */

import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import type { Infographie, Theme } from '../types'
import { cascade, SORTIE_DOUCE } from '../lib/temps'

type Props = { info: Infographie; theme: Theme; echelle: number }

const Apparait: React.FC<{ index: number; children: React.ReactNode }> = ({ index, children }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const depart = cascade(index, fps, 90)
  const p = spring({
    frame: image - depart,
    fps,
    config: { damping: 200, stiffness: 180, mass: 0.6 },
    durationInFrames: Math.round(fps * 0.4),
  })
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px)`,
      }}
    >
      {children}
    </div>
  )
}

const carte = (theme: Theme, e: number): React.CSSProperties => ({
  backgroundColor: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: theme.rayon * e,
  padding: `${18 * e}px ${24 * e}px`,
  backdropFilter: 'blur(14px)',
  color: theme.texte,
  fontFamily: theme.policeTitres,
})

export const Infographies: React.FC<Props> = ({ info, theme, echelle: e }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()

  switch (info.modele) {
    case 'liste':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 * e }}>
          {info.donnees.items.slice(0, 5).map((item, i) => (
            <Apparait key={i} index={i}>
              <div style={{ ...carte(theme, e), display: 'flex', alignItems: 'center', gap: 18 * e }}>
                <span
                  style={{
                    fontFamily: theme.policeChiffres,
                    fontSize: 30 * e,
                    fontWeight: 700,
                    color: theme.accent,
                    minWidth: 34 * e,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 36 * e, fontWeight: 600 }}>{item}</span>
              </div>
            </Apparait>
          ))}
        </div>
      )

    case 'comparaison':
      return (
        <div style={{ display: 'flex', gap: 24 * e, alignItems: 'stretch' }}>
          {[info.donnees.gauche, info.donnees.droite].map((col, i) => (
            <Apparait key={i} index={i}>
              <div
                style={{
                  ...carte(theme, e),
                  minWidth: 380 * e,
                  borderColor: i === 1 ? theme.accent : 'rgba(255,255,255,0.14)',
                }}
              >
                <div
                  style={{
                    fontSize: 34 * e,
                    fontWeight: 800,
                    marginBottom: 14 * e,
                    color: i === 1 ? theme.accent : theme.texte,
                  }}
                >
                  {col.titre}
                </div>
                {col.points.map((pt, j) => (
                  <div key={j} style={{ fontSize: 28 * e, opacity: 0.9, marginBottom: 8 * e }}>
                    {pt}
                  </div>
                ))}
              </div>
            </Apparait>
          ))}
        </div>
      )

    case 'avant-apres': {
      const bascule = spring({
        frame: image - Math.round(fps * 0.5),
        fps,
        config: { damping: 200, stiffness: 140 },
        durationInFrames: Math.round(fps * 0.5),
      })
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 * e }}>
          <div style={{ ...carte(theme, e), opacity: interpolate(bascule, [0, 1], [1, 0.45]) }}>
            <div style={{ fontSize: 22 * e, opacity: 0.6, letterSpacing: 2 }}>AVANT</div>
            <div style={{ fontSize: 40 * e, fontWeight: 700 }}>{info.donnees.avant}</div>
          </div>
          <div
            style={{
              fontSize: 44 * e,
              color: theme.accent,
              transform: `translateX(${interpolate(bascule, [0, 1], [-14, 0])}px)`,
              opacity: bascule,
            }}
          >
            →
          </div>
          <div
            style={{
              ...carte(theme, e),
              borderColor: theme.accent,
              opacity: bascule,
              transform: `scale(${interpolate(bascule, [0, 1], [0.94, 1])})`,
            }}
          >
            <div style={{ fontSize: 22 * e, opacity: 0.6, letterSpacing: 2 }}>APRÈS</div>
            <div style={{ fontSize: 40 * e, fontWeight: 700, color: theme.accent }}>
              {info.donnees.apres}
            </div>
          </div>
        </div>
      )
    }

    case 'chronologie':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {info.donnees.etapes.map((etape, i) => (
            <Apparait key={i} index={i}>
              <div style={{ display: 'flex', gap: 20 * e, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 14 * e,
                      height: 14 * e,
                      borderRadius: '50%',
                      backgroundColor: theme.accent,
                      marginTop: 12 * e,
                    }}
                  />
                  {i < info.donnees.etapes.length - 1 ? (
                    <div
                      style={{
                        width: 2 * e,
                        height: 54 * e,
                        backgroundColor: 'rgba(255,255,255,0.22)',
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ paddingBottom: 22 * e, color: theme.texte, fontFamily: theme.policeTitres }}>
                  <div
                    style={{
                      fontFamily: theme.policeChiffres,
                      fontSize: 24 * e,
                      color: theme.accent,
                      fontWeight: 700,
                    }}
                  >
                    {etape.date}
                  </div>
                  <div style={{ fontSize: 32 * e, fontWeight: 600 }}>{etape.texte}</div>
                </div>
              </div>
            </Apparait>
          ))}
        </div>
      )

    case 'barres': {
      const max = Math.max(...info.donnees.series.map((s) => s.valeur), 1)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 * e, minWidth: 460 * e }}>
          {info.donnees.series.slice(0, 4).map((s, i) => {
            const pousse = spring({
              frame: image - cascade(i, fps, 110),
              fps,
              config: { damping: 200, stiffness: 120 },
              durationInFrames: Math.round(fps * 0.6),
            })
            return (
              <div key={i} style={{ color: theme.texte, fontFamily: theme.policeTitres }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 26 * e,
                    marginBottom: 6 * e,
                  }}
                >
                  <span>{s.libelle}</span>
                  <span style={{ fontFamily: theme.policeChiffres, color: theme.accent }}>
                    {Math.round(s.valeur * pousse).toLocaleString('fr-FR')}
                    {info.donnees.unite ?? ''}
                  </span>
                </div>
                <div
                  style={{
                    height: 16 * e,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.10)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(s.valeur / max) * 100 * pousse}%`,
                      backgroundColor: i === 0 ? theme.accent : theme.accentSecondaire,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    case 'citation': {
      const p = interpolate(image, [0, Math.round(fps * 0.35)], [0, 1], {
        extrapolateRight: 'clamp',
        easing: SORTIE_DOUCE,
      })
      return (
        <div
          style={{
            ...carte(theme, e),
            maxWidth: 900 * e,
            borderLeft: `${5 * e}px solid ${theme.accent}`,
            opacity: p,
            transform: `translateX(${interpolate(p, [0, 1], [-18, 0])}px)`,
          }}
        >
          <div style={{ fontSize: 38 * e, fontWeight: 600, lineHeight: 1.3 }}>
            « {info.donnees.texte} »
          </div>
          <div style={{ fontSize: 24 * e, opacity: 0.65, marginTop: 12 * e }}>
            {info.donnees.source}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
