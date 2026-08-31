/**
 * chaines.mjs — les autres chaînes, et comment on passe de l'une à l'autre.
 *
 * UNE CHAÎNE EST UN DOSSIER, ET RIEN D'AUTRE.
 *
 * C'est la première ligne du CLAUDE.md, et ça vaut aussi pour la découverte :
 * on ne tient pas de registre, on ne demande pas d'enregistrer une chaîne. Un
 * dossier qui porte `config/chaine.json` EST une chaîne — un dossier copié à la
 * main, restauré d'une sauvegarde ou synchronisé depuis un autre poste apparaît
 * donc sans qu'on ait rien à déclarer. Et un dossier supprimé disparaît de la
 * liste sans laisser d'entrée fantôme.
 *
 * OÙ ON CHERCHE, ET POURQUOI PAS PLUS LOIN.
 *
 * Dans le dossier PARENT de la chaîne courante, un seul niveau. C'est là que
 * `npm run nouvelle-chaine` les pose en pratique, et c'est le seul endroit qu'on
 * puisse balayer sans risquer de parcourir un disque entier — un `Desktop` ou un
 * `Documents` contient des milliers d'entrées, et une recherche récursive y
 * prendrait plusieurs secondes à chaque ouverture de l'atelier.
 *
 * `STACK_CHAINES` ajoute d'autres dossiers à balayer, séparés par `;` : c'est la
 * porte de sortie pour qui range ses chaînes ailleurs.
 */

import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { CHEMINS, litJson } from './chemins.mjs'

/** Les dossiers où l'on cherche des chaînes. */
function dossiersBalayes() {
  const liste = [path.dirname(CHEMINS.racine)]
  for (const brut of String(process.env.STACK_CHAINES ?? '').split(';')) {
    const d = brut.trim()
    if (d) liste.push(path.resolve(d))
  }
  return [...new Set(liste)]
}

/** Ce dossier est-il une chaîne ? La question n'a qu'une réponse : son identité. */
export function estUneChaine(dossier) {
  try {
    return fs.statSync(path.join(dossier, 'config', 'chaine.json')).isFile()
  } catch {
    return false
  }
}

/** Le portrait d'une chaîne, lu sans rien lancer. */
export function portrait(dossier) {
  // UNE CHAÎNE ABÎMÉE NE DOIT PAS EMPORTER LA LISTE.
  //
  // `litJson` lève sur un JSON invalide, et cette fonction est appelée pour
  // CHAQUE dossier voisin : un `chaine.json` mal enregistré dans un dossier
  // qu'on ne regarde même pas suffisait à faire échouer tout le menu, avec une
  // erreur 500 qui ne disait pas quel dossier était en cause.
  let chaine = {}
  let lisible = true
  try {
    chaine = litJson(path.join(dossier, 'config', 'chaine.json'), {}) ?? {}
  } catch {
    lisible = false
  }
  const videos = path.join(dossier, 'videos')
  let compte = 0
  let derniere = 0
  try {
    for (const e of fs.readdirSync(videos, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      compte++
      try {
        derniere = Math.max(derniere, fs.statSync(path.join(videos, e.name)).mtimeMs)
      } catch { /* un dossier qui disparaît entre le listage et le stat */ }
    }
  } catch { /* pas encore de dossier videos */ }

  return {
    dossier,
    nom: chaine?.identite?.nom ?? path.basename(dossier),
    avatar: chaine?.identite?.avatar ?? null,
    initialise: chaine?.initialise === true,
    // Un `config/chaine.json` illisible : on le montre au lieu de le taire, mais
    // il ne peut pas s'ouvrir — l'atelier n'y démarrerait pas.
    lisible,
    // Une chaîne copiée avant aujourd'hui n'a pas `outils/atelier.mjs` : on ne
    // peut donc pas y basculer, et il vaut mieux le dire dans la liste que de
    // le découvrir au clic.
    atelier: fs.existsSync(path.join(dossier, 'outils', 'atelier.mjs')),
    videos: compte,
    modifie_le: derniere ? new Date(derniere).toISOString() : null,
    courante: path.resolve(dossier) === path.resolve(CHEMINS.racine),
  }
}

/**
 * Toutes les chaînes visibles, la courante comprise et en tête.
 *
 * La courante y figure toujours, même si elle vit ailleurs que dans les
 * dossiers balayés : c'est celle qu'on est en train d'employer, l'omettre
 * donnerait une liste où l'on ne se reconnaît pas.
 */
export function chaines() {
  const vues = new Map()
  vues.set(path.resolve(CHEMINS.racine), portrait(CHEMINS.racine))

  for (const parent of dossiersBalayes()) {
    let entrees
    try {
      entrees = fs.readdirSync(parent, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entrees) {
      if (!e.isDirectory()) continue
      const d = path.join(parent, e.name)
      if (vues.has(path.resolve(d)) || !estUneChaine(d)) continue
      vues.set(path.resolve(d), portrait(d))
    }
  }

  return [...vues.values()].sort(
    (a, b) =>
      Number(b.courante) - Number(a.courante) ||
      String(b.modifie_le ?? '').localeCompare(String(a.modifie_le ?? '')) ||
      a.nom.localeCompare(b.nom)
  )
}

/**
 * Met une chaîne à la corbeille de Windows.
 *
 * À LA CORBEILLE, PAS AU BROYEUR — ET CE N'EST PAS UNE PRÉCAUTION EXCESSIVE.
 *
 * Un dossier de chaîne contient un socle marketing écrit à la main, une veille
 * qu'on a payée en crédits Apify, et des tournages. Le rendu se refabrique en
 * huit minutes ; le reste, non. Un clic de trop ne doit pas être irréversible.
 *
 * On passe par l'API Windows plutôt que par `fs.rmSync` : c'est la seule façon
 * d'obtenir une suppression que l'explorateur sait annuler. Ailleurs qu'ici, on
 * refuse et on le dit — mieux vaut ne pas savoir faire que faire trop.
 */
export function metALaCorbeille(dossier) {
  const cible = path.resolve(dossier)
  if (cible === path.resolve(CHEMINS.racine)) {
    throw new Error(`C'est la chaîne ouverte. On ne supprime pas le sol sur lequel on est.`)
  }
  if (!estUneChaine(cible)) {
    throw new Error(`${cible} n'est pas une chaîne : pas de config/chaine.json. On ne touche à rien.`)
  }
  if (process.platform !== 'win32') {
    throw new Error(
      `La mise à la corbeille n'est écrite que pour Windows. ` +
        `Supprime le dossier toi-même : ${cible}`
    )
  }

  const avant = portrait(cible)
  // `Microsoft.VisualBasic.FileIO.FileSystem` est l'API que l'explorateur
  // emploie lui-même. Le chemin passe par une variable d'environnement : il
  // contient des espaces et des accents, et l'interpoler dans la ligne de
  // commande PowerShell exposerait à une injection autant qu'à un échec.
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
        '[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(' +
        '$env:CIBLE_CORBEILLE, ' +
        "'OnlyErrorDialogs', 'SendToRecycleBin')",
    ],
    { env: { ...process.env, CIBLE_CORBEILLE: cible }, encoding: 'utf8', windowsHide: true }
  )
  if (r.status !== 0) {
    throw new Error(`La mise à la corbeille a échoué : ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`)
  }
  if (fs.existsSync(cible)) {
    throw new Error(`Le dossier est toujours là. Rien n'a été supprimé.`)
  }
  return { dossier: cible, nom: avant.nom, videos: avant.videos }
}
