#!/usr/bin/env node
/**
 * maj-chaine.mjs — remettre le CODE d'une autre chaîne à jour depuis celle-ci.
 *
 * POURQUOI CETTE COMMANDE EXISTE.
 *
 * Une chaîne est un dossier autonome : elle porte sa propre copie du pipeline,
 * des skills et de l'atelier. C'est ce qui la rend déplaçable et réplicable, et
 * c'est aussi ce qui la fige — une chaîne copiée il y a un mois tourne avec le
 * code d'il y a un mois. Un défaut corrigé ici ne l'est pas là-bas, et une
 * capacité ajoutée ici n'y existe pas.
 *
 * Le cas se voit tout de suite dans le menu des chaînes de l'atelier : un
 * dossier antérieur à l'atelier ne peut pas s'ouvrir, et rien ne permettait d'y
 * remédier autrement qu'à la main, fichier par fichier.
 *
 * CE QU'ELLE NE TOUCHE JAMAIS, ET C'EST TOUT L'ENJEU.
 *
 * Le code se remplace ; le TRAVAIL, jamais. Ni `marque/`, ni `veille/`, ni
 * `strategie/`, ni `videos/`, ni `perf/`, ni `config/chaine.json`, ni
 * `config/keys.json`. Une chaîne mise à jour reste exactement la même chaîne :
 * même identité, même socle marketing, mêmes vidéos, mêmes clés.
 *
 * Deux chaînes ne doivent RIEN hériter l'une de l'autre côté contenu. Cette
 * commande ne déplace que ce qui est commun par construction.
 *
 *   node outils/maj-chaine.mjs <dossier> [--liste] [--json]
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHEMINS, litJson } from '../pipeline/lib/chemins.mjs'
import { journal } from '../pipeline/lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from '../pipeline/lib/args.mjs'

/**
 * Ce qui est commun à toutes les chaînes, et donc remplaçable.
 *
 * `config/chaine.json` n'y est PAS : c'est la carte d'identité, elle appartient
 * à la chaîne. `config/keys.json` non plus : chaque poste a le sien.
 */
export const A_METTRE_A_JOUR = [
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
  'atelier',
  'assets/fonts',
  'config/keys.example.json',
]

/**
 * Les fichiers qu'on met de côté avant de les remplacer.
 *
 * Ce sont ceux qu'on écrit à la main : la doctrine de la chaîne. Le reste est
 * du code, qui n'a aucune raison d'avoir divergé d'un côté seulement.
 */
const SAUVEGARDES = new Set(['CLAUDE.md', 'AGENTS.md'])

/**
 * Copie un dossier, récursivement.
 *
 * `fs.cpSync` fait tomber Node quand le chemin source porte un accent — voir la
 * note dans `nouvelle-chaine.mjs`, qui a payé le défaut. On recopie donc à la
 * main, ce qui ne coûte rien sur des dossiers de cette taille.
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
  }
  return n
}

/** Met à jour le code d'une chaîne. Rend ce qui a été touché. */
export function metAJour(destination) {
  const cible = path.resolve(destination)
  if (cible === path.resolve(CHEMINS.racine)) {
    throw new Error(`C'est la chaîne courante. Choisis-en une autre.`)
  }
  if (!fs.existsSync(path.join(cible, 'config', 'chaine.json'))) {
    throw new Error(
      `${cible} n'est pas une chaîne : pas de config/chaine.json.\n` +
        `Pour en créer une : npm run nouvelle-chaine -- "${destination}"`
    )
  }

  const touches = []
  const sauvegardes = []
  let fichiers = 0
  for (const relatif of A_METTRE_A_JOUR) {
    const source = path.join(CHEMINS.racine, relatif)
    if (!fs.existsSync(source)) continue
    const vers = path.join(cible, relatif)
    fs.mkdirSync(path.dirname(vers), { recursive: true })
    if (fs.statSync(source).isDirectory()) {
      // ON REMPLACE LE DOSSIER, ON NE FUSIONNE PAS.
      //
      // Une fusion laisse en place les fichiers supprimés depuis : un module
      // retiré ici resterait là-bas et continuerait d'être importé par du code
      // qui, lui, aurait été remplacé. C'est le genre d'état intermédiaire qui
      // ne se diagnostique jamais.
      fs.rmSync(vers, { recursive: true, force: true })
      fichiers += copieDossier(source, vers)
    } else {
      // UN FICHIER DE DOCTRINE MODIFIÉ EST MIS DE CÔTÉ AVANT D'ÊTRE REMPLACÉ.
      //
      // `CLAUDE.md` est le cerveau de la chaîne : il se personnalise, c'est
      // même son rôle. Le remplacer fait partie du travail — c'est ainsi qu'une
      // correction de doctrine se propage — mais l'écraser en silence ferait
      // perdre des décisions écrites à la main, sans rien pour le signaler.
      // On garde donc l'ancien à côté quand il diffère.
      if (SAUVEGARDES.has(relatif) && fs.existsSync(vers)) {
        const avant = fs.readFileSync(vers, 'utf8')
        if (avant !== fs.readFileSync(source, 'utf8')) {
          const copie = `${vers}.avant-maj`
          fs.writeFileSync(copie, avant, 'utf8')
          sauvegardes.push(`${relatif}.avant-maj`)
        }
      }
      fs.copyFileSync(source, vers)
      fichiers++
    }
    touches.push(relatif)
  }

  const identite = litJson(path.join(cible, 'config', 'chaine.json'), {}) ?? {}
  return {
    dossier: cible,
    nom: identite?.identite?.nom ?? path.basename(cible),
    initialise: identite?.initialise === true,
    fichiers,
    touches,
    sauvegardes,
    // `npm install` reste à faire quand les dépendances ont bougé : on ne le
    // lance pas d'ici, ça peut prendre plusieurs minutes et demander le réseau.
    nodeModules: fs.existsSync(path.join(cible, 'node_modules', 'remotion')),
  }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { options, positionnels } = litArgs()

  aide(
    options,
    `
npm run maj-chaine -- <dossier> [options]

  --liste     montre ce qui serait remplacé, sans rien toucher
  --json      sortie machine, pour l'atelier

Remplace le CODE d'une autre chaîne par celui d'ici : pipeline, outils, atelier,
skills, polices. Ne touche jamais au travail — ni marque/, ni veille/, ni
strategie/, ni videos/, ni perf/, ni config/chaine.json, ni config/keys.json.

Une chaîne mise à jour reste la même chaîne : même identité, mêmes vidéos,
mêmes clés.
`
  )

  await principal(async () => {
    if (drapeau(options, 'liste')) {
      if (drapeau(options, 'json')) {
        console.log(JSON.stringify({ ok: true, remplace: A_METTRE_A_JOUR }, null, 2))
        return
      }
      journal.titre('Ce qui serait remplacé')
      for (const r of A_METTRE_A_JOUR) console.log(`  ${r}`)
      console.log('')
      journal.detail(`Jamais touchés : marque/ · veille/ · strategie/ · videos/ · perf/ · config/chaine.json · config/keys.json`)
      return
    }

    const destination = positionnels[0]
    if (!destination) throw new Error(`Donne le dossier de la chaîne à mettre à jour.`)

    const r = metAJour(destination)
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      return
    }

    journal.titre(`Chaîne mise à jour`)
    journal.ok(`${r.nom} — ${r.fichiers} fichiers`)
    journal.detail(r.dossier)
    console.log('')
    journal.detail(`Intacts : marque/ · veille/ · strategie/ · videos/ · perf/ · l'identité · les clés`)
    if (r.sauvegardes.length) {
      journal.attention(
        `${r.sauvegardes.length} fichier(s) de doctrine avaient été modifiés là-bas. ` +
          `L'ancien est gardé à côté : ${r.sauvegardes.join(', ')}`
      )
    }
    if (!r.nodeModules) {
      journal.attention(`Les dépendances n'y sont pas installées : cd "${r.dossier}" && npm install`)
    }
    if (!r.initialise) {
      journal.attention(
        `Cette chaîne n'est pas encore initialisée : ouvre Claude Code dans son dossier et lance /init-chaine.`
      )
    }
  })
}
