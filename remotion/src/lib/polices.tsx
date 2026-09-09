/**
 * Embarquement des polices.
 *
 * Les fichiers sont déposés par le pipeline dans remotion/public/fonts/ et
 * déclarés dans `theme.polices`. On injecte les @font-face et on retient le
 * rendu tant que les polices ne sont pas prêtes : sans ça, la première image
 * sort avec la police de repli et le texte saute au milieu de la vidéo.
 */

import React from 'react'
import { staticFile, delayRender, continueRender, cancelRender } from 'remotion'
import type { Police } from '../types'

const formatDe = (fichier: string) => {
  const ext = fichier.split('.').pop()?.toLowerCase()
  if (ext === 'woff2') return 'woff2'
  if (ext === 'woff') return 'woff'
  if (ext === 'otf') return 'opentype'
  return 'truetype'
}

export const Polices: React.FC<{ polices: Police[] }> = ({ polices }) => {
  const [attente] = React.useState(() => delayRender('Chargement des polices'))

  const css = React.useMemo(
    () =>
      polices
        .map(
          (p) => `@font-face {
  font-family: '${p.famille}';
  src: url('${staticFile(`fonts/${p.fichier}`)}') format('${formatDe(p.fichier)}');
  font-weight: ${p.graisse ?? 400};
  font-style: ${p.style ?? 'normal'};
  font-display: block;
}`
        )
        .join('\n'),
    [polices]
  )

  React.useEffect(() => {
    if (polices.length === 0) {
      continueRender(attente)
      return
    }
    // UNE POLICE QUI NE CHARGE PAS ARRÊTE LE RENDU. ELLE NE LE LAISSE PLUS
    // CONTINUER EN SILENCE.
    //
    // Le 9 septembre 2026, un rendu de cinq minutes est sorti en linéale
    // générique là où le thème demandait Anton : les neuf .ttf avaient disparu
    // du dossier public du bundle, et les neuf requêtes rendaient 404. Le
    // `.catch(() => null)` qui tenait cette ligne avalait exactement ça —
    // `document.fonts.load` REJETTE quand le fichier ne vient pas, et on
    // enchaînait sur `continueRender` comme si de rien n'était.
    //
    // Le coût de l'échec silencieux est le pire possible : une demi-heure de
    // calcul, un master qui se lit parfaitement partout, et une typographie
    // fausse d'un bout à l'autre. Personne ne s'en aperçoit avant de comparer
    // avec la direction artistique — c'est-à-dire, en pratique, jamais.
    const echecs: string[] = []
    Promise.all(
      polices.flatMap((p) => {
        // Une police variable se déclare sur une plage ('100 900') mais se
        // charge à une graisse précise : on demande celles qu'on utilise.
        const poids =
          typeof p.graisse === 'string' ? [400, 700, 800] : [p.graisse ?? 400]
        return poids.map((g) =>
          document.fonts.load(`${g} 100px '${p.famille}'`).then(
            // Résolu avec un tableau vide : la famille n'est déclarée nulle
            // part. Rejeté : le fichier n'est pas venu. Les deux donnent la
            // police de repli, les deux sont des échecs.
            (faces) => {
              if (faces.length === 0) echecs.push(`${p.famille} (${p.fichier})`)
            },
            () => echecs.push(`${p.famille} (${p.fichier})`)
          )
        )
      })
    )
      .then(() => document.fonts.ready)
      .then(() => {
        if (echecs.length > 0) {
          const uniques = [...new Set(echecs)]
          cancelRender(
            new Error(
              `${uniques.length} police(s) n'ont pas pu être chargées : ` +
                `${uniques.join(', ')}.\n` +
                `Les fichiers sont attendus dans le dossier public du montage ` +
                `(videos/<slug>/05-montage/public/fonts/), d'où le rendu les ` +
                `recopie. Sans eux la vidéo sortirait en police de repli, ` +
                `c'est-à-dire avec une autre typographie que la direction ` +
                `artistique de la chaîne.`
            )
          )
          return
        }
        continueRender(attente)
      })
      .catch((e) => cancelRender(e))
  }, [polices, attente])

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
