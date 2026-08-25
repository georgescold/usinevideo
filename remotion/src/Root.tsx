/**
 * Les compositions.
 *
 * Une seule composition suffit : les dimensions, la durée et la cadence
 * viennent du `plan.json` passé en props, via `calculateMetadata`. Ajouter une
 * composition par format reviendrait à dupliquer la même chose sept fois.
 *
 * Le plan de démonstration sert à ouvrir le studio sans avoir rien produit —
 * `npm run studio` doit toujours afficher quelque chose.
 */

import React from 'react'
import { Composition } from 'remotion'
import { Montage } from './Montage'
import { planDemo } from './demo'
import type { Plan } from './types'

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Montage"
        component={Montage as React.FC<Record<string, unknown>>}
        defaultProps={{ plan: planDemo } as unknown as Record<string, unknown>}
        // Valeurs de repli : `calculateMetadata` les remplace toujours.
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        calculateMetadata={({ props }) => {
          const plan = (props as { plan: Plan }).plan
          return {
            width: plan.largeur,
            height: plan.hauteur,
            fps: plan.fps,
            durationInFrames: Math.max(1, plan.dureeFrames),
          }
        }}
      />
    </>
  )
}
