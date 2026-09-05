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
    // On force le chargement : `document.fonts.ready` seul ne déclenche pas
    // le téléchargement d'une police qu'aucun nœud n'utilise encore.
    Promise.all(
      polices.flatMap((p) => {
        // Une police variable se déclare sur une plage ('100 900') mais se
        // charge à une graisse précise : on demande celles qu'on utilise.
        const poids =
          typeof p.graisse === 'string' ? [400, 700, 800] : [p.graisse ?? 400]
        return poids.map((g) =>
          document.fonts.load(`${g} 100px '${p.famille}'`).catch(() => null)
        )
      })
    )
      .then(() => document.fonts.ready)
      .then(() => continueRender(attente))
      .catch((e) => cancelRender(e))
  }, [polices, attente])

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
