/**
 * Les six modèles d'infographie.
 *
 * Règle commune : **une idée par infographie**. Si deux idées doivent tenir à
 * l'écran, ce sont deux infographies.
 *
 * ---
 *
 * CE QUI SÉPARE UNE INFOGRAPHIE PROFESSIONNELLE D'UNE INFOGRAPHIE FAITE VITE.
 *
 * Ce n'est ni la couleur ni la police : c'est **la façon dont l'information
 * arrive**. Six principes, appliqués partout dans ce fichier.
 *
 *  1. **On ne fait jamais apparaître du texte en fondu.** Un fondu, c'est
 *     l'absence de choix. Le texte se dévoile derrière un masque qui glisse —
 *     la lettre est nette du premier au dernier pixel, et le mouvement se lit
 *     comme une intention.
 *
 *  2. **Le texte ne bouge pas, son masque bouge.** Un glyphe déplacé d'une
 *     fraction de pixel est redessiné à chaque image et vibre. En animant le
 *     masque et les aplats plutôt que les lettres, on obtient du mouvement sans
 *     le moindre tremblement.
 *
 *  3. **Une hiérarchie à trois niveaux**, toujours : une étiquette discrète qui
 *     annonce, le contenu en grand, un filet qui structure. Sans étiquette, une
 *     liste flotte ; avec elle, elle appartient à quelque chose.
 *
 *  4. **La choreographie s'étale.** Les entrées occupent les deux premiers tiers
 *     du plan, jamais sa première seconde. Une infographie qui se pose en 0,8 s
 *     puis ne bouge plus se regarde comme une capture d'écran.
 *
 *  5. **De la profondeur sous le texte.** Un voile dégradé et un grain très fin
 *     séparent l'information de l'image derrière. C'est ce qui fait qu'un texte
 *     posé sur une vidéo cesse de flotter.
 *
 *  6. **Les filets se tracent.** Une ligne qui apparaît d'un coup est un trait ;
 *     une ligne qui se dessine est un geste.
 */

import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random } from 'remotion'
import { noise2D } from '@remotion/noise'
import type { Infographie, Theme } from '../types'

type Props = { info: Infographie; theme: Theme; echelle: number; dureeImages?: number }

const Cadence = React.createContext<{ total: number; dureeImages: number }>({
  total: 1,
  dureeImages: 150,
})

/**
 * L'avancement d'une entrée, de 0 à 1, amorti à l'arrivée.
 *
 * Sert aussi bien à faire entrer un élément qu'à mesurer combien d'éléments
 * l'ont déjà repoussé : c'est la même grandeur, lue depuis deux endroits.
 */
export const progression = (t: number, fps: number) =>
  interpolate(t, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })

/** Le rythme d'entrée : franc au départ, sans rebond à l'arrivée. */
const ENTREE = Easing.bezier(0.16, 1, 0.3, 1)

// ---------------------------------------------------------------------------
//  Les primitives
// ---------------------------------------------------------------------------

/**
 * Le voile qui sépare l'information de l'image.
 *
 * Un dégradé, pas un aplat : un rectangle sombre uniforme se voit comme un
 * bandeau collé, alors qu'un dégradé se lit comme de la lumière. Le grain par
 * dessus fait le reste — c'est ce qui donne l'impression d'une matière plutôt
 * que d'un calque.
 */
const Voile: React.FC<{ theme: Theme; force?: number }> = ({ theme, force = 1 }) => {
  const image = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const p = interpolate(image, [0, fps * 0.35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ENTREE,
  })
  const grains = React.useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i < 900; i++) {
      const x = random(`gx${i}`) * 100
      const y = random(`gy${i}`) * 100
      const o = 0.03 + random(`go${i}`) * 0.05
      pts.push(`radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%, rgba(255,255,255,${o.toFixed(3)}) 0 1px, transparent 1px)`)
    }
    return pts.join(',')
  }, [])

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: p * force,
          background: `linear-gradient(180deg, ${theme.fond}00 0%, ${theme.fond}CC 22%, ${theme.fond}EE 50%, ${theme.fond}CC 78%, ${theme.fond}00 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: p * 0.5 * force,
          backgroundImage: grains,
          backgroundSize: `${width}px ${height}px`,
          mixBlendMode: 'overlay',
        }}
      />
    </>
  )
}

/**
 * Le dévoilement par masque.
 *
 * `clip-path` sur un conteneur : le contenu reste à sa place exacte, seul le
 * bord du masque se déplace. C'est la différence entre un texte qui apparaît et
 * un texte qui se révèle — et c'est aussi ce qui garantit qu'aucun glyphe ne
 * bouge, donc qu'aucun ne vibre.
 */
const Devoile: React.FC<{
  index?: number
  sens?: 'gauche' | 'bas'
  children: React.ReactNode
}> = ({ index = 0, sens = 'gauche', children }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { total, dureeImages } = React.useContext(Cadence)

  const etale = (dureeImages * 0.6) / Math.max(total, 1)
  const depart = Math.round(index * Math.max(etale, fps * 0.16))
  const t = image - depart

  const p = interpolate(t, [0, fps * 0.55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ENTREE,
  })
  const decoupe =
    sens === 'gauche'
      ? `inset(0 ${(100 - p * 100).toFixed(2)}% 0 0)`
      : `inset(${(100 - p * 100).toFixed(2)}% 0 0 0)`

  return (
    <div style={{ clipPath: decoupe, WebkitClipPath: decoupe, willChange: 'clip-path' }}>
      {children}
    </div>
  )
}

/** Le numéro d'un élément, en chiffres de largeur fixe. */
export const Numero: React.FC<{ n: number; theme: Theme; echelle: number }> = ({ n, theme, echelle: e }) => (
  <span
    style={{
      fontFamily: theme.policeChiffres,
      fontVariantNumeric: 'tabular-nums',
      fontSize: 30 * e,
      fontWeight: 700,
      color: theme.accent,
      opacity: 0.85,
      minWidth: 52 * e,
      paddingTop: 14 * e,
    }}
  >
    {String(n).padStart(2, '0')}
  </span>
)

/**
 * La taille qui tient sur une ligne, pour une longueur donnée.
 *
 * Une police d'affiche CONDENSÉE et une police d'affiche LARGE ne tiennent pas
 * le même nombre de signes à taille égale : la formule calée sur l'une déborde
 * avec l'autre. On part donc de la largeur réellement disponible — la vidéo
 * moins les marges, le numéro et sa gouttière — divisée par la chasse moyenne.
 */
const tailleQuiTient = (signes: number) => {
  const dispo = 1080 - 2 * 72 - 52 - 24 // marges, numéro, gouttière
  const chasse = 0.62 // chasse moyenne d'une grotesque grasse, en cadratins
  return Math.max(30, Math.min(66, dispo / (chasse * Math.max(signes, 8))))
}

/** Le grand texte des modèles. Une seule définition, pour que tout s'accorde. */
const grandTexte = (theme: Theme, e: number, taille = 62): React.CSSProperties => ({
  fontFamily: theme.policeSousTitres,
  fontVariationSettings: theme.variationsAffiche ?? undefined,
  fontSize: taille * e,
  lineHeight: 1.02,
  letterSpacing: -1 * e,
  color: theme.texte,
  textTransform: 'uppercase',
  textShadow: `0 ${3 * e}px ${20 * e}px rgba(0,0,0,0.9)`,
})

/** Le cadre commun : voile, grain, marges, alignement à gauche. */
const Cadre: React.FC<{ theme: Theme; echelle: number; children: React.ReactNode }> = ({
  theme,
  echelle: e,
  children,
}) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
    <Voile theme={theme} />
    <div style={{ position: 'relative', padding: `0 ${72 * e}px`, width: '100%' }}>{children}</div>
  </div>
)

// ---------------------------------------------------------------------------
//  Les modèles
// ---------------------------------------------------------------------------

export const Infographies: React.FC<Props> = (props) => {
  const { info, dureeImages } = props
  const d = info.donnees as Record<string, unknown>
  const compte = (k: string) => (Array.isArray(d?.[k]) ? (d[k] as unknown[]).length : 0)
  const total = (compte('items') || compte('etapes') || compte('series') || 2) + 1
  return (
    <Cadence.Provider value={{ total, dureeImages: dureeImages ?? 150 }}>
      <Contenu {...props} />
    </Cadence.Provider>
  )
}

const Contenu: React.FC<Props> = ({ info, theme, echelle: e, dureeImages = 150 }) => {
  const image = useCurrentFrame()
  const { fps } = useVideoConfig()

  switch (info.modele) {
    // UNE PILE QUI SE CONSTRUIT, PAS UNE LISTE QU'ON DÉVOILE.
    //
    // C'est la différence entre une diapositive et une animation. Une liste
    // révélée ligne à ligne reste une composition figée dont on lève le voile :
    // la mise en page finale existe déjà, on la découvre. Le résultat se regarde
    // comme un PowerPoint, quelle que soit la qualité de la typo.
    //
    // Ici la composition CHANGE. Chaque élément arrive au centre, en grand, à
    // pleine intensité — puis il est repoussé vers le haut par le suivant, en
    // rétrécissant et en s'estompant. À aucun moment l'image n'est celle d'avant.
    // C'est ce mouvement d'ensemble, et non l'entrée de chaque ligne, qui fait
    // qu'on regarde une vidéo.
    case 'liste': {
      const items = info.donnees.items.slice(0, 5)
      const pas = Math.max((dureeImages * 0.66) / items.length, fps * 0.42)

      return (
        <Cadre theme={theme} echelle={e}>
          {/* Une hauteur de ligne FIXE, et jamais de retour à la ligne.
              Sans ça, un élément plus long que les autres passe sur deux lignes,
              l'empilement calculé en hauteur constante ne suit plus, et les
              éléments se chevauchent. La taille de police s'ajuste plutôt que
              la mise en page. */}
          <div style={{ position: 'relative', height: 300 * e }}>
            {items.map((item, i) => {
              const rang = 92 * e
              // Combien d'éléments sont arrivés APRÈS celui-ci : c'est ce qui
              // décide de sa place, de sa taille et de son intensité.
              const arrivee = i * pas
              const pousses = items.reduce(
                (n, _, j) => (j > i ? n + progression(image - j * pas, fps) : n),
                0
              )
              const entree = progression(image - arrivee, fps)
              if (entree <= 0) return null

              const y = Math.round(-pousses * rang)
              const taille = 1 - Math.min(pousses, 3) * 0.17
              const clarte = 1 - Math.min(pousses, 3) * 0.26

              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 24 * e,
                    height: rang,
                    whiteSpace: 'nowrap',
                    opacity: entree * clarte,
                    transform: `translate3d(${Math.round((1 - entree) * 70 * e)}px, ${y}px, 0) scale(${taille.toFixed(3)})`,
                    transformOrigin: 'left bottom',
                    willChange: 'transform, opacity',
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.policeChiffres,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 30 * e,
                      fontWeight: 700,
                      color: theme.accent,
                      minWidth: 52 * e,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={grandTexte(theme, e, tailleQuiTient(item.length))}>{item}</span>
                </div>
              )
            })}
          </div>
        </Cadre>
      )
    }

    case 'chronologie':
      return (
        <Cadre theme={theme} echelle={e}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 * e }}>
            {info.donnees.etapes.map((etape, i) => (
              <Devoile key={i} index={i + 1}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 22 * e,
                    borderLeft: `${5 * e}px solid ${theme.accent}`,
                    paddingLeft: 24 * e,
                    opacity: 1 - i * 0.16,
                  }}
                >
                  <span style={{ ...grandTexte(theme, e, 56), color: theme.accent }}>
                    {etape.date}
                  </span>
                  <span style={grandTexte(theme, e, 50)}>{etape.texte}</span>
                </div>
              </Devoile>
            ))}
          </div>
        </Cadre>
      )

    case 'comparaison':
      return (
        <Cadre theme={theme} echelle={e}>
          <div style={{ display: 'flex', gap: 40 * e }}>
            {[info.donnees.gauche, info.donnees.droite].map((col, i) => (
              <div key={i} style={{ flex: 1 }}>
                <Devoile index={i + 1}>
                  <div
                    style={{
                      ...grandTexte(theme, e, 46),
                      color: i === 1 ? theme.accent : theme.texte,
                      borderBottom: `${4 * e}px solid ${i === 1 ? theme.accent : 'rgba(255,255,255,0.18)'}`,
                      paddingBottom: 14 * e,
                      marginBottom: 18 * e,
                    }}
                  >
                    {col.titre}
                  </div>
                </Devoile>
                {col.points.map((pt, j) => (
                  <Devoile key={j} index={i + j + 2}>
                    <div
                      style={{
                        fontFamily: theme.policeTitres,
                        fontSize: 30 * e,
                        color: theme.texte,
                        opacity: 0.92,
                        marginBottom: 10 * e,
                        textShadow: `0 ${3 * e}px ${16 * e}px rgba(0,0,0,0.9)`,
                      }}
                    >
                      {pt}
                    </div>
                  </Devoile>
                ))}
              </div>
            ))}
          </div>
        </Cadre>
      )

    case 'avant-apres': {
      const bascule = spring({
        frame: image - Math.round(fps * 0.9),
        fps,
        config: { damping: 22, stiffness: 130, mass: 0.7 },
        durationInFrames: Math.round(fps * 0.6),
      })
      return (
        <Cadre theme={theme} echelle={e}>
          <Devoile index={1}>
            <div
              style={{
                ...grandTexte(theme, e, 50),
                opacity: interpolate(bascule, [0, 1], [1, 0.35]),
                textDecoration: bascule > 0.5 ? 'line-through' : 'none',
                textDecorationColor: theme.accent,
                marginBottom: 26 * e,
              }}
            >
              {info.donnees.avant}
            </div>
          </Devoile>
          <div
            style={{
              height: 4 * e,
              backgroundColor: theme.accent,
              transformOrigin: 'left center',
              transform: `scaleX(${bascule})`,
              marginBottom: 26 * e,
            }}
          />
          <Devoile index={2}>
            <div style={{ ...grandTexte(theme, e, 62), color: theme.accent }}>
              {info.donnees.apres}
            </div>
          </Devoile>
        </Cadre>
      )
    }

    case 'barres': {
      const max = Math.max(...info.donnees.series.map((s) => s.valeur), 1)
      return (
        <Cadre theme={theme} echelle={e}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * e }}>
            {info.donnees.series.slice(0, 4).map((s, i) => {
              const depart = Math.round((i + 1) * fps * 0.16)
              const p = interpolate(image - depart, [0, fps * 0.7], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: ENTREE,
              })
              return (
                <div key={i}>
                  <Devoile index={i + 1}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 10 * e,
                      }}
                    >
                      <span style={grandTexte(theme, e, 36)}>{s.libelle}</span>
                      <span
                        style={{
                          fontFamily: theme.policeChiffres,
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: 40 * e,
                          fontWeight: 800,
                          color: theme.accent,
                        }}
                      >
                        {Math.round(s.valeur * p).toLocaleString('fr-FR')}
                        {info.donnees.unite ?? ''}
                      </span>
                    </div>
                  </Devoile>
                  <div style={{ height: 12 * e, backgroundColor: 'rgba(255,255,255,0.10)' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(s.valeur / max) * 100}%`,
                        backgroundColor: theme.accent,
                        transformOrigin: 'left center',
                        transform: `scaleX(${p})`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Cadre>
      )
    }

    case 'citation': {
      // Le guillemet respire très lentement : c'est le seul élément qui bouge en
      // continu, et comme ce n'est pas du texte lu, il peut le faire sans vibrer.
      const souffle = 1 + noise2D('citation', image / 90, 0) * 0.03
      return (
        <Cadre theme={theme} echelle={e}>
          <div
            style={{
              fontFamily: theme.policeSousTitres,
              fontSize: 200 * e,
              lineHeight: 0.7,
              color: theme.accent,
              opacity: 0.9,
              transform: `scale(${souffle})`,
              transformOrigin: 'left top',
              marginBottom: 10 * e,
            }}
          >
            «
          </div>
          <Devoile index={1}>
            <div style={{ ...grandTexte(theme, e, 54), textTransform: 'none', lineHeight: 1.15 }}>
              {info.donnees.texte}
            </div>
          </Devoile>
          <Devoile index={2}>
            <div
              style={{
                fontFamily: theme.policeTitres,
                fontSize: 26 * e,
                letterSpacing: 4 * e,
                textTransform: 'uppercase',
                color: theme.accent,
                marginTop: 26 * e,
              }}
            >
              {info.donnees.source}
            </div>
          </Devoile>
        </Cadre>
      )
    }

    // LE MOT QUI PREND TOUT L'ÉCRAN.
    //
    // L'effet le plus fort du catalogue, et le plus court : l'image disparaît,
    // il ne reste qu'un mot. On le réserve au pivot émotionnel — le moment où la
    // vidéo bascule — et jamais plus d'une fois par tiers de vidéo. Utilisé deux
    // fois de suite il ne veut plus rien dire, comme un point d'exclamation
    // qu'on doublerait.
    //
    // La taille suit la longueur du mot : un mot de quatre lettres doit remplir
    // la largeur autant qu'un mot de douze, sinon l'effet retombe.
    case 'takeover': {
      const mot = info.donnees.mot
      const claque = spring({
        frame: image,
        fps,
        config: { damping: 13, stiffness: 190, mass: 0.55 },
        durationInFrames: Math.round(fps * 0.5),
      })
      // L'atterrissage se ressent : une secousse de quelques images quand le mot
      // se pose, et un éclair d'accent d'un dixième de seconde. C'est ce qui
      // transforme une apparition en impact — après, plus rien ne bouge.
      const apresPose = image - Math.round(fps * 0.28)
      const secousse =
        apresPose > 0 && apresPose < 9
          ? noise2D('tk-secousse', image * 0.9, 0) * 8 * (1 - apresPose / 9)
          : 0
      const eclair =
        apresPose > 0 && apresPose < 5 ? (1 - apresPose / 5) * 0.22 : 0
      // Même calcul que la pile : la largeur réellement disponible divisée par
      // la chasse. Une formule au jugé débordait sur un mot de six lettres.
      const taille = Math.max(90, Math.min(240, (1080 - 96) / (0.62 * Math.max(mot.length, 4))))
      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, backgroundColor: theme.fond, opacity: 0.94 }} />
          {eclair > 0 ? (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: theme.accent, opacity: eclair }} />
          ) : null}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: `0 ${48 * e}px`,
              textAlign: 'center',
              transform: `translate(${(secousse * e).toFixed(1)}px, ${(-secousse * 0.6 * e).toFixed(1)}px)`,
            }}
          >
            <span
              style={{
                fontFamily: theme.policeSousTitres,
                fontSize: taille * e,
                lineHeight: 0.95,
                letterSpacing: -3 * e,
                textTransform: 'uppercase',
                color: info.donnees.ton === 'texte' ? theme.texte : theme.accent,
                transform: `scale(${interpolate(claque, [0, 1], [2.4, 1]).toFixed(3)})`,
                opacity: interpolate(image, [0, fps * 0.12], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              {mot}
            </span>
            {info.donnees.apres ? (
              <div style={{ marginTop: 30 * e }}>
                <Devoile index={1}>
                  <span style={{ ...grandTexte(theme, e, 44), textTransform: 'none' }}>
                    {info.donnees.apres}
                  </span>
                </Devoile>
              </div>
            ) : null}
          </div>
        </div>
      )
    }

    // DES PASTILLES QUI POPPENT.
    //
    // Pour une énumération que la voix débite trop vite pour qu'on la lise ligne
    // à ligne. Elles restent par-dessus l'image, décalées les unes des autres :
    // c'est un nuage qui se remplit, pas un tableau qui s'affiche.
    case 'pastilles': {
      const items = info.donnees.items.slice(0, 6)
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignContent: 'center',
            justifyContent: 'center',
            gap: 18 * e,
            padding: `0 ${64 * e}px`,
          }}
        >
          {items.map((item, i) => {
            const p = spring({
              frame: image - Math.round(i * fps * 0.14),
              fps,
              config: { damping: 12, stiffness: 200, mass: 0.5 },
              durationInFrames: Math.round(fps * 0.45),
            })
            return (
              <span
                key={i}
                style={{
                  fontFamily: theme.policeSousTitres,
                  fontSize: 46 * e,
                  textTransform: 'uppercase',
                  color: i % 3 === 1 ? theme.fond : theme.texte,
                  backgroundColor: i % 3 === 1 ? theme.accent : 'rgba(0,0,0,0.72)',
                  border: `${3 * e}px solid ${i % 3 === 1 ? theme.accent : 'rgba(255,255,255,0.22)'}`,
                  borderRadius: 999,
                  padding: `${12 * e}px ${28 * e}px`,
                  transform: `scale(${p.toFixed(3)}) translateY(${Math.round((1 - p) * 24 * e)}px)`,
                  opacity: p,
                }}
              >
                {item}
              </span>
            )
          })}
        </div>
      )
    }

    default:
      return null
  }
}
