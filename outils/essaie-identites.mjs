/**
 * Rend le même extrait de vidéo sous plusieurs identités visuelles, pour les
 * comparer côte à côte.
 *
 *   node outils/essaie-identites.mjs <slug> [--images=760-900] [--variantes=fichier.json]
 *
 * POURQUOI.
 *
 * Une charte ne se juge pas sur des codes hexadécimaux ni sur un nom de police.
 * Elle se juge en mouvement, sur du vrai texte, à côté de la vraie image — parce
 * que c'est là qu'on voit qu'une serif délicate se noie sur un plan clair, ou
 * qu'un rose qui semblait juste vire au fuchsia une fois posé sur du bleu.
 *
 * Décrire trois options en prose oblige à les imaginer. Les rendre permet de les
 * REGARDER, et de trancher en dix secondes plutôt qu'en trois allers-retours.
 *
 * Chaque variante ne change que le THÈME : le montage, les plans et la voix sont
 * identiques. La comparaison est donc honnête — on ne compare que ce qui change.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { CHEMINS, litJson, ecritJson, dossierVideo } from '../pipeline/lib/chemins.mjs'
import { journal, duree } from '../pipeline/lib/journal.mjs'
import { ffmpeg } from '../pipeline/lib/ffmpeg.mjs'

const slug = process.argv[2]
if (!slug || process.argv.includes('--aide')) {
  console.log(`
node outils/essaie-identites.mjs <slug> [options]

  --images=760-900        les images à rendre pour chaque variante (~5 s)
  --variantes=<fichier>   liste de variantes en JSON (défaut : marque/identite/variantes.json)
  --garde                 conserve la dernière variante dans config/chaine.json

  Rend le même extrait sous chaque identité, puis assemble une comparaison
  côte à côte dans videos/<slug>/06-rendu/essais/.
`)
  process.exit(slug ? 0 : 1)
}

const arg = (nom, defaut) => {
  const t = process.argv.find((a) => a.startsWith(`--${nom}=`))
  return t ? t.slice(nom.length + 3) : defaut
}

const images = arg('images', '760-900')
const cheminVariantes = path.join(
  CHEMINS.racine,
  arg('variantes', 'marque/identite/variantes.json')
)

const variantes = litJson(cheminVariantes, null)
if (!variantes?.length) {
  console.error(
    `Aucune variante dans ${path.relative(CHEMINS.racine, cheminVariantes)}.\n` +
      `Format attendu : [{ "nom": "rose-fonce", "identite_visuelle": { … } }, …]`
  )
  process.exit(1)
}

const cheminConfig = path.join(CHEMINS.racine, 'config', 'chaine.json')
const configOrigine = JSON.parse(fs.readFileSync(cheminConfig, 'utf8'))
const v = dossierVideo(slug)
const sortie = path.join(v.rendu, 'essais')
fs.mkdirSync(sortie, { recursive: true })

// On restaure TOUJOURS la configuration d'origine, même sur interruption : une
// charte d'essai laissée en place se retrouverait dans la prochaine production.
const restaure = () => {
  if (!process.argv.includes('--garde')) {
    fs.writeFileSync(cheminConfig, JSON.stringify(configOrigine, null, 2))
  }
}
process.on('exit', restaure)
process.on('SIGINT', () => process.exit(130))

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const lance = (args) =>
  spawnSync(npm, args, { cwd: CHEMINS.racine, encoding: 'utf8', shell: process.platform === 'win32' })

journal.titre(`Essai d'identités · ${slug} · ${variantes.length} variantes`)

const rendus = []
for (const [i, variante] of variantes.entries()) {
  const nom = variante.nom ?? `variante-${i + 1}`
  journal.etape(i + 1, variantes.length, nom)

  // On n'écrase que les clés fournies : une variante qui ne change que la
  // police garde toute la palette dérivée de l'avatar.
  const config = JSON.parse(JSON.stringify(configOrigine))
  config.identite_visuelle = { ...config.identite_visuelle, ...variante.identite_visuelle }
  fs.writeFileSync(cheminConfig, JSON.stringify(config, null, 2))

  // `--depuis=plan` ne refait QUE le thème et le plan : ni transcription, ni
  // voix, ni recherche de plans. Quelques secondes au lieu de plusieurs minutes.
  const m = lance(['run', 'monte', '--', slug, '--depuis=plan'])
  if (m.status !== 0) {
    journal.attention(`montage échoué pour « ${nom} » : ${(m.stderr || m.stdout || '').slice(-200)}`)
    continue
  }

  // On écrit DIRECTEMENT dans le dossier des essais. Sans `--sortie`, le rendu
  // écrivait dans le master de la vidéo : quatre variantes à la suite, et le
  // vrai rendu était remplacé par cinq secondes de brouillon.
  const garde = path.join(sortie, `${nom}.mp4`)
  const r = lance([
    'run', 'rends', '--', slug,
    `--extrait=${images}`,
    '--brouillon',
    `--sortie=${path.relative(CHEMINS.racine, garde)}`,
  ])
  if (r.status !== 0) {
    journal.attention(`rendu échoué pour « ${nom} » : ${(r.stderr || r.stdout || '').slice(-200)}`)
    continue
  }
  rendus.push({ nom, fichier: garde })
  journal.ok(path.relative(CHEMINS.racine, garde))
}

if (rendus.length < 2) {
  journal.attention("Moins de deux variantes rendues : pas de comparaison à assembler.")
  process.exit(0)
}

// La planche de comparaison : les variantes côte à côte, avec leur nom incrusté.
// Les regarder séparément demande de se souvenir de la précédente ; côte à côte,
// la différence saute aux yeux — c'est tout l'intérêt.
journal.info('Assemblage de la comparaison…')

// EN GRILLE, PAS EN BANDE. Quatre vidéos verticales alignées côte à côte font
// 270 px de large chacune : on distingue les couleurs, jamais le dessin d'une
// lettre — or c'est précisément ce qu'on cherche à comparer. Une grille de deux
// colonnes double la largeur utile.
const colonnes = rendus.length <= 2 ? rendus.length : 2
const lignes = Math.ceil(rendus.length / colonnes)
const cote = Math.floor(1200 / colonnes)

// Le nom incrusté : sans lui, on distingue les variantes mais on ne sait plus
// laquelle est laquelle — et le choix devient impossible à formuler.
const echelles = rendus
  .map(
    (r, i) =>
      `[${i}:v]scale=${cote}:-2,setsar=1,` +
      `drawtext=text='${r.nom.replace(/'/g, '')}':fontcolor=white:fontsize=26:` +
      `box=1:boxcolor=black@0.75:boxborderw=10:x=(w-tw)/2:y=24[v${i}]`
  )
  .join(';')

// On complète la dernière ligne avec du noir si le compte ne tombe pas juste :
// `xstack` refuse une grille incomplète.
const manquants = colonnes * lignes - rendus.length
const noirs = Array.from(
  { length: manquants },
  (_, k) => `color=c=black:s=${cote}x${Math.round((cote * 16) / 9)}:d=1[n${k}]`
)
const tuiles = [
  ...rendus.map((_, i) => `[v${i}]`),
  ...Array.from({ length: manquants }, (_, k) => `[n${k}]`),
].join('')
const disposition = Array.from({ length: colonnes * lignes }, (_, i) => {
  const c = i % colonnes
  const l = Math.floor(i / colonnes)
  return `${c === 0 ? '0' : `w0*${c}`}_${l === 0 ? '0' : `h0*${l}`}`
}).join('|')

const comparaison = path.join(sortie, 'comparaison.mp4')
await ffmpeg([
  ...rendus.flatMap((r) => ['-i', r.fichier]),
  '-filter_complex',
  [echelles, ...noirs, `${tuiles}xstack=inputs=${colonnes * lignes}:layout=${disposition}[out]`]
    .filter(Boolean)
    .join(';'),
  '-map', '[out]',
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '23',
  '-an',
  comparaison,
])

journal.titre('Terminé')
for (const r of rendus) journal.detail(`${r.nom.padEnd(20)} ${path.relative(CHEMINS.racine, r.fichier)}`)
journal.ok(`Comparaison : ${path.relative(CHEMINS.racine, comparaison)}`)
console.log('')
journal.detail(
  "Regarde la comparaison, choisis, puis applique la variante retenue avec --garde, " +
    "ou reporte ses valeurs dans config/chaine.json."
)
