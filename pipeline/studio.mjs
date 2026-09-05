#!/usr/bin/env node
/**
 * studio.mjs — l'aperçu, sur la bonne vidéo.
 *
 * Chaque vidéo a son propre dossier de médias : la piste image, la voix, les
 * polices et le B-roll de ce montage-là. Ouvrir le studio sans le lui dire
 * afficherait une composition sans aucun de ses fichiers.
 *
 *   npm run studio -- mon-slug     ouvre l'aperçu de cette vidéo
 *   npm run studio                 ouvre la composition de démonstration
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { CHEMINS, dossierVideo, litJson } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, principal } from './lib/args.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run studio -- [slug]

Ouvre l'aperçu Remotion. Avec un slug, sur le montage de cette vidéo ; sans
argument, sur la composition de démonstration.

L'aperçu sert à contrôler avant de payer un rendu : calage des sous-titres,
jointures de coupe, placement des événements. Il ne produit aucun fichier.
`
)

await principal(async () => {
  const slug = positionnels[0]
  const args = ['remotion', 'studio', CHEMINS.remotionEntree]

  if (slug) {
    const v = dossierVideo(slug)
    const plan = litJson(v.plan, null)
    if (!plan) {
      throw new Error(
        `Aucun plan de montage pour « ${slug} ».\nLance d'abord : npm run monte -- ${slug}`
      )
    }
    const pub = path.join(v.montage, 'public')
    if (!fs.existsSync(path.join(pub, plan.piste?.src ?? 'image.mp4'))) {
      journal.attention(
        `La piste image est absente de ${path.relative(CHEMINS.racine, pub)}. ` +
          `Relance : npm run monte -- ${slug} --depuis=plan`
      )
    }

    // Le plan passe par un fichier : en ligne de commande, un JSON de plusieurs
    // centaines de kilo-octets dépasserait la longueur maximale sous Windows.
    const props = path.join(v.montage, '.props.json')
    fs.writeFileSync(props, JSON.stringify({ plan }), 'utf8')

    args.push(`--public-dir=${pub}`, `--props=${props}`)

    journal.titre(`Aperçu · ${slug}`)
    journal.info(
      `${duree(plan.dureeFrames / plan.fps)} · ${plan.largeur}×${plan.hauteur} · ` +
        `${plan.coupes.length} plans · ${plan.evenements.length} événements`
    )
    journal.detail(`À vérifier : calage des sous-titres (surtout à la fin), jointures, événements.`)
  } else {
    journal.titre('Aperçu · démonstration')
    journal.detail(`Pour voir une vraie vidéo : npm run studio -- <slug>`)
  }

  // Le studio reste au premier plan jusqu'à ce que l'utilisateur le ferme.
  const enfant = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  enfant.on('exit', (code) => process.exit(code ?? 0))
})
