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
  // L'INTERFACE FAIT PARTIE DU MODÈLE, AU MÊME TITRE QUE LE PIPELINE.
  //
  // Elle manquait : une chaîne fraîchement copiée avait toutes les commandes et
  // aucun atelier. `outils/atelier.mjs` était bien là, mais il servait un
  // dossier `atelier/` inexistant — le serveur démarrait et rendait une page
  // vide. Le défaut se voyait au premier lancement, c'est-à-dire trop tard.
  'atelier',
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

/**
 * Ce qui ne doit jamais voyager, même en vivant dans un dossier copié.
 * `settings.local.json` porte les permissions approuvées sur CE poste : les
 * transporter reviendrait à pré-approuver des actions dans un dossier où
 * l'utilisateur ne les a jamais validées.
 */
const A_RETIRER_APRES_COPIE = ['.claude/settings.local.json']

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
      fichiers += copieDossier(source, cible)
    } else {
      fs.copyFileSync(source, cible)
      fichiers++
    }
  }
  for (const relatif of A_RETIRER_APRES_COPIE) {
    const indesirable = path.join(destination, relatif)
    if (fs.existsSync(indesirable)) {
      fs.rmSync(indesirable, { force: true })
      fichiers--
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
    for (const bloc of ['identite', 'produit', 'avatar', 'avatars', 'marketeur']) {
      for (const cle of Object.keys(vierge[bloc] ?? {})) {
        if (cle.startsWith('_') || cle === 'fiche' || cle === 'hooks') continue
        vierge[bloc][cle] = cle === 'langue' ? 'fr' : null
      }
    }
    for (const f of Object.keys(vierge.formats ?? {})) {
      if (!f.startsWith('_')) vierge.formats[f].actif = false
    }
    // LA VOIX NE SE COPIE PAS NON PLUS, ET L'OUBLI SE VOYAIT MAL.
    //
    // Le bloc restait entier : la nouvelle chaine heritait de l'identifiant
    // d'une voix ElevenLabs, de celui d'une voix Fish qui vit sur le COMPTE de
    // quelqu'un d'autre, d'un `modele_local` qui n'existe pas chez elle, et
    // d'un `transpose` calibre pour une paire de voix precise (+12 entre une
    // prise a 125 Hz et un modele a 216). Rien de tout ca n'a de sens ailleurs,
    // et le premier montage sonnait faux sans qu'on sache pourquoi.
    //
    // `mode` survit : c'est un defaut de fabrication, pas une identite.
    for (const cle of Object.keys(vierge.voix ?? {})) {
      if (cle.startsWith('_') || cle === 'mode') continue
      vierge.voix[cle] = cle === 'transpose' ? 0 : null
    }
    vierge.seo = { mot_cle_pilier: null, piliers: [], playlists: [] }
    vierge.cadence = { long_par_semaine: 0, short_par_semaine: 0 }
    // LE DOSSIER DRIVE NE SE COPIE PAS, ET C'EST LA MEME REGLE QUE LE RESTE.
    //
    // Un dossier = une chaine = un produit. Herite, l'identifiant ferait
    // deverser deux marques dans le meme dossier Drive — un melange qu'on ne
    // remarque qu'au bout d'un mois, quand on cherche un master parmi ceux
    // d'une autre chaine. La nouvelle chaine pose le sien :
    //   npm run drive -- --dossier
    delete vierge.drive
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

/**
 * Copie un dossier, récursivement.
 *
 * `fs.cpSync` FAIT TOMBER NODE QUAND LE CHEMIN PORTE UN ACCENT.
 *
 * Sur Node 22.19 / Windows, `fs.cpSync(source, cible, { recursive: true })` où
 * `source` contient un caractère non-ASCII tue le processus sur le coup —
 * `STATUS_STACK_BUFFER_OVERRUN` (0xC0000409), sans exception à attraper, sans
 * message, sans rien à consigner. Le dossier de cette chaîne s'appelle
 * « Usine à vidéo » : la commande mourait donc systématiquement après avoir
 * copié quatre fichiers, en laissant une chaîne à moitié faite.
 *
 * `readdirSync` + `copyFileSync` ne souffrent pas du défaut. On les emploie, et
 * on gagne au passage de pouvoir compter au fil de la copie plutôt qu'après.
 */
function copieDossier(source, cible) {
  fs.mkdirSync(cible, { recursive: true })
  let n = 0
  for (const e of fs.readdirSync(source, { withFileTypes: true })) {
    const de = path.join(source, e.name)
    const vers = path.join(cible, e.name)
    if (e.isDirectory()) n += copieDossier(de, vers)
    else if (e.isFile()) {
      fs.copyFileSync(de, vers)
      n++
    }
    // Les liens ne sont pas suivis : une chaîne doit être un dossier autonome,
    // et recopier un lien vers ailleurs la rendrait dépendante de cet ailleurs.
  }
  return n
}

function compte(dossier) {
  let n = 0
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    n += e.isDirectory() ? compte(path.join(dossier, e.name)) : 1
  }
  return n
}
