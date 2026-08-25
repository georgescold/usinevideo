#!/usr/bin/env node
/**
 * autotest.mjs — la chaîne complète fonctionne-t-elle sur cette machine ?
 *
 * Fabrique une vidéo de test de toutes pièces, la fait passer par tout le
 * pipeline, vérifie le résultat, puis efface ce qu'elle a créé. Aucun appel
 * payant, aucune clé nécessaire.
 *
 * À lancer après avoir copié le dossier sur une nouvelle machine, ou après
 * avoir touché au pipeline.
 *
 *   node outils/autotest.mjs
 *   node outils/autotest.mjs --garde     (conserve les fichiers produits)
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CHEMINS,
  dossierVideo,
  assureDossierVideo,
  ecritJson,
  litJson,
} from '../pipeline/lib/chemins.mjs'
import { journal, duree } from '../pipeline/lib/journal.mjs'
import { litArgs, drapeau, aide, principal } from '../pipeline/lib/args.mjs'
import { ffmpeg, sonde, lance } from '../pipeline/lib/ffmpeg.mjs'

const { options } = litArgs()
aide(
  options,
  `
node outils/autotest.mjs [--garde]

Fabrique une vidéo de test, la monte, la rend, vérifie le résultat, puis
nettoie. Ne consomme aucun crédit et ne demande aucune clé.
`
)

const SLUG = '_autotest'
const DUREE_S = 16

const BLOCS = [
  {
    id: 'hook',
    role: 'hook',
    texte: 'On te vend un chiffre et tu paies le double.',
    intention: 'tranchant',
    prise: 1,
    visuel: [
      { type: 'mot-cle', texte: 'le double', ancre: 'double' },
      { type: 'punch-in', amplitude: 0.06, ancre: 'paies' },
    ],
  },
  {
    id: 'promesse',
    role: 'promesse',
    texte: 'Je te montre la facture reelle, ligne par ligne.',
    intention: 'posé',
    prise: 1,
    visuel: [{ type: 'chiffre', de: 0, a: 4000, suffixe: ' euros', ancre: 'facture' }],
  },
  {
    id: 'corps-1',
    role: 'corps',
    texte: 'Le devis ne dit jamais ce que coute la maintenance annuelle.',
    intention: 'posé',
    prise: 1,
    visuel: [
      {
        type: 'infographie',
        modele: 'liste',
        donnees: { items: ['Le devis', 'La maintenance', 'Les corrections'] },
        ancre: 'maintenance',
      },
    ],
  },
  {
    id: 'chute',
    role: 'chute',
    texte: 'Demande le cout total avant de signer quoi que ce soit.',
    intention: 'grave',
    prise: 1,
    visuel: [{ type: 'carton', texte: 'Le cout total', sous_texte: 'pas le devis', ancre: 'signer' }],
  },
]

const echecs = []
const verifie = (condition, quoi, detail = '') => {
  if (condition) journal.ok(`${quoi}${detail ? ' — ' + detail : ''}`)
  else {
    journal.erreur(`${quoi}${detail ? ' — ' + detail : ''}`)
    echecs.push(quoi)
  }
}

await principal(async () => {
  const v = assureDossierVideo(SLUG)
  journal.titre('Autotest')

  // -- matière de test ------------------------------------------------------
  // Une mire et un son en salves : de quoi éprouver la détection des silences
  // sans avoir à tourner quoi que ce soit.
  const rush = path.join(v.tournage, 'prise-01.mp4')
  journal.info('Fabrication de la matière de test…')
  await ffmpeg([
    '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=${DUREE_S}`,
    '-f', 'lavfi', '-i', `aevalsrc=0.4*sin(2*PI*220*t)*lt(mod(t\\,4)\\,2.5):d=${DUREE_S}:s=48000`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    rush,
  ])

  ecritJson(v.scriptJson, {
    slug: SLUG,
    format: 'long-face',
    duree_cible_s: 12,
    titre_travail: 'Autotest',
    mot_cle: 'autotest',
    intention: 'informative',
    pilier: 'Autotest',
    angle: 'Vérifier la chaîne de bout en bout',
    avatar: 'Testeur',
    niveau_conscience: 2,
    blocs: BLOCS,
    maillage: { vers: [], depuis: [] },
  })

  // La transcription réelle serait absurde sur un son de synthèse : on fournit
  // directement des mots datés, ce qui teste tout le reste de la chaîne.
  const mots = BLOCS.flatMap((b) => b.texte.split(/\s+/))
  const pas = 11000 / mots.length
  ecritJson(v.transcript, {
    fichier: 'autotest',
    mode: 'fourni par l’autotest',
    langue: 'fr',
    modele: 'aucun',
    mots: mots.map((texte, i) => ({
      texte,
      debutMs: Math.round(i * pas),
      finMs: Math.round((i + 0.85) * pas),
    })),
    texte: mots.join(' '),
  })

  // -- montage --------------------------------------------------------------
  journal.info('Montage…')
  const monte = await lance(process.execPath, [
    path.join(CHEMINS.racine, 'pipeline', 'monte.mjs'),
    SLUG,
    '--voix=brute',
  ])
  if (monte.code !== 0) {
    journal.erreur(monte.stderr.trim().split('\n').slice(-6).join('\n'))
  }
  verifie(monte.code === 0, 'Montage')

  const plan = litJson(v.plan, null)
  verifie(Boolean(plan), 'Plan de montage écrit')

  if (plan) {
    verifie(plan.coupes.length > 1, 'Silences détectés', `${plan.coupes.length} plans`)
    verifie(
      plan.mots.length === mots.length,
      'Mots conservés',
      `${plan.mots.length}/${mots.length}`
    )
    verifie(
      plan.mots.every((m, i) => i === 0 || m.debutMs >= plan.mots[i - 1].debutMs),
      'Mots dans l’ordre'
    )
    verifie(plan.evenements.length >= 4, 'Événements visuels', `${plan.evenements.length}`)
    const etales =
      plan.evenements.length > 1 &&
      plan.evenements[plan.evenements.length - 1].debutMs - plan.evenements[0].debutMs > 3000
    verifie(etales, 'Événements répartis sur la durée')
    verifie(plan.theme.polices.length > 0, 'Polices embarquées', `${plan.theme.polices.length}`)
    verifie(Boolean(plan.piste), 'Piste image montée')
  }

  const image = path.join(v.montage, 'public', 'image.mp4')
  if (fs.existsSync(image)) {
    const info = await sonde(image)
    verifie(info.dureeS > 1 && info.dureeS < DUREE_S, 'Piste image raccourcie', duree(info.dureeS))
  }

  // -- rendu ----------------------------------------------------------------
  journal.info('Rendu (extrait de 2 secondes)…')
  const rendu = await lance(process.execPath, [
    path.join(CHEMINS.racine, 'pipeline', 'rends.mjs'),
    SLUG,
    '--extrait=0-59',
  ])
  if (rendu.code !== 0) {
    journal.erreur(rendu.stderr.trim().split('\n').slice(-6).join('\n'))
  }
  verifie(rendu.code === 0, 'Rendu')

  const final = path.join(v.rendu, `${SLUG}.mp4`)
  if (fs.existsSync(final)) {
    const info = await sonde(final)
    verifie(info.largeur === 1920 && info.hauteur === 1080, 'Définition', `${info.largeur}×${info.hauteur}`)
    verifie(info.aDuSon, 'Piste audio présente')
    verifie(fs.statSync(final).size > 50_000, 'Fichier non vide', `${Math.round(fs.statSync(final).size / 1000)} ko`)
  } else {
    verifie(false, 'Fichier final produit')
  }

  // -- nettoyage ------------------------------------------------------------
  if (!drapeau(options, 'garde')) {
    fs.rmSync(dossierVideo(SLUG).base, { recursive: true, force: true })
    journal.detail('Fichiers de test effacés (--garde pour les conserver).')
  }

  journal.titre('Verdict')
  if (echecs.length === 0) {
    journal.ok('La chaîne complète fonctionne sur cette machine.')
  } else {
    journal.erreur(`${echecs.length} contrôle(s) en échec : ${echecs.join(', ')}`)
    process.exitCode = 1
  }
})
