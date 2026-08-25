#!/usr/bin/env node
/**
 * nouvelle-chaine.mjs — copie le template pour lancer une nouvelle chaîne.
 *
 * Ne recopie que ce qui est le template : le code, les skills, la structure,
 * les polices. Pas les vidéos, pas la veille, pas la marque, pas les secrets.
 * Un dossier de chaîne ne doit jamais hériter du contenu d'une autre.
 *
 *   node outils/nouvelle-chaine.mjs "C:\Users\moi\Desktop\Ma nouvelle chaine"
 *   node outils/nouvelle-chaine.mjs ../ma-chaine --avec-cles
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, assureDossier, litJson, ecritJson } from '../pipeline/lib/chemins.mjs'
import { journal } from '../pipeline/lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from '../pipeline/lib/args.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
node outils/nouvelle-chaine.mjs <destination> [options]

  --avec-cles     copie aussi config/keys.json (mêmes comptes API)
  --force         accepte d'écrire dans un dossier non vide

Copie le code, les skills, la structure et les polices. Ne copie jamais les
vidéos, la veille, le socle marque ni les rendus : une chaîne ne doit rien
hériter d'une autre.
`
)

/** Ce qui fait partie du template. Tout le reste est propre à une chaîne. */
const A_COPIER = [
  'CLAUDE.md',
  'AGENTS.md',
  'LISEZ-MOI.md',
  'package.json',
  'tsconfig.json',
  'remotion.config.ts',
  '.gitignore',
  '.env.example',
  '.claude',
  'pipeline',
  'remotion/src',
  'outils',
  'assets/fonts',
  'config/keys.example.json',
  'config/chaine.json',
]

/** Les dossiers à créer vides : ils accueilleront le travail de la chaîne. */
const A_CREER = [
  'marque',
  'veille/youtube/raw',
  'veille/youtube/miniatures',
  'veille/youtube/transcripts',
  'veille/tiktok/raw',
  'veille/tiktok/transcripts',
  'veille/tiktok/media',
  'strategie',
  'videos',
  'perf',
  'assets/luts',
  'assets/musique',
  'assets/broll',
  'assets/logos',
  'assets/sfx',
  'remotion/public',
]

/** Les gabarits du socle marque : la structure, pas le contenu. */
const GABARITS_MARQUE = ['LISEZ-MOI.md', 'identite-visuelle.md', 'ligne-editoriale.md']

await principal(async () => {
  const brut = positionnels[0]
  if (!brut) throw new Error(`Donne le dossier de destination.`)

  const destination = path.resolve(brut)
  if (destination === CHEMINS.racine) {
    throw new Error(`La destination est le dossier courant. Choisis-en un autre.`)
  }

  if (fs.existsSync(destination)) {
    const contenu = fs.readdirSync(destination).filter((f) => !f.startsWith('.'))
    if (contenu.length > 0 && !drapeau(options, 'force')) {
      throw new Error(
        `${destination} n'est pas vide (${contenu.length} éléments).\n` +
          `Choisis un dossier vide, ou relance avec --force.`
      )
    }
  }

  journal.titre('Nouvelle chaîne')
  journal.info(`Depuis : ${CHEMINS.racine}`)
  journal.info(`Vers   : ${destination}`)

  assureDossier(destination)

  let fichiers = 0
  for (const relatif of A_COPIER) {
    const source = path.join(CHEMINS.racine, relatif)
    if (!fs.existsSync(source)) continue
    const cible = path.join(destination, relatif)
    assureDossier(path.dirname(cible))
    if (fs.statSync(source).isDirectory()) {
      fs.cpSync(source, cible, { recursive: true })
      fichiers += compte(cible)
    } else {
      fs.copyFileSync(source, cible)
      fichiers++
    }
  }
  journal.ok(`${fichiers} fichiers copiés`)

  for (const d of A_CREER) assureDossier(path.join(destination, d))
  journal.ok(`${A_CREER.length} dossiers de travail créés`)

  // Les gabarits du socle repartent vierges : le contenu marketing d'une chaîne
  // n'a rien à faire dans une autre.
  for (const g of GABARITS_MARQUE) {
    const source = path.join(CHEMINS.marque, g)
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destination, 'marque', g))
  }

  // La carte d'identité repart à zéro, quoi qu'il arrive.
  const chaine = litJson(path.join(destination, 'config', 'chaine.json'), null)
  if (chaine) {
    const vierge = JSON.parse(JSON.stringify(chaine))
    vierge.initialise = false
    vierge.date_init = null
    for (const bloc of ['identite', 'produit', 'avatar', 'marketeur']) {
      for (const cle of Object.keys(vierge[bloc] ?? {})) {
        if (cle.startsWith('_') || cle === 'fiche' || cle === 'hooks') continue
        vierge[bloc][cle] = cle === 'langue' ? 'fr' : null
      }
    }
    for (const f of Object.keys(vierge.formats ?? {})) {
      if (!f.startsWith('_')) vierge.formats[f].actif = false
    }
    vierge.seo = { mot_cle_pilier: null, piliers: [], playlists: [] }
    vierge.cadence = { long_par_semaine: 0, short_par_semaine: 0 }
    ecritJson(path.join(destination, 'config', 'chaine.json'), vierge)
  }

  // Le trousseau ne suit que si on le demande explicitement.
  if (drapeau(options, 'avec-cles') && fs.existsSync(CHEMINS.trousseau)) {
    fs.copyFileSync(CHEMINS.trousseau, path.join(destination, 'config', 'keys.json'))
    journal.attention(
      `Trousseau copié : les deux chaînes partageront les mêmes comptes et les mêmes quotas.`
    )
  } else {
    journal.detail(`Trousseau non copié — copie config/keys.example.json et remplis-le.`)
  }

  if (fs.existsSync(CHEMINS.env)) {
    fs.copyFileSync(CHEMINS.env, path.join(destination, '.env'))
    journal.detail(`.env copié — pense à changer CHAINE_ID et ELEVENLABS_VOICE_ID.`)
  }

  journal.titre('À faire maintenant')
  console.log(`  1. cd "${destination}"`)
  console.log(`  2. npm install`)
  console.log(`  3. ${drapeau(options, 'avec-cles') ? 'npm run verifie' : 'renseigne config/keys.json, puis npm run verifie'}`)
  console.log(`  4. ouvre Claude Code dans ce dossier et lance  /init-chaine`)
  console.log('')
  journal.detail(
    `Les binaires et les modèles restent partagés dans ${CHEMINS.cachePartage} — ` +
      `rien à retélécharger.`
  )
})

function compte(dossier) {
  let n = 0
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    n += e.isDirectory() ? compte(path.join(dossier, e.name)) : 1
  }
  return n
}
