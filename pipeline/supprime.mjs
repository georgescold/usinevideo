#!/usr/bin/env node
/**
 * supprime.mjs — retirer une vidéo, sans la perdre.
 *
 * SUPPRIMER, ICI, VEUT DIRE METTRE DE CÔTÉ.
 *
 * Un dossier de vidéo contient un tournage. Un tournage ne se refait pas : la
 * prise a été enregistrée un jour précis, dans une pièce précise, avec une voix
 * qui n'était pas tout à fait la même. Le rendu se refabrique en huit minutes,
 * la prise jamais.
 *
 * La commande déplace donc le dossier dans `videos/.corbeille/`, horodaté. Ça
 * coûte le même geste, ça libère la liste, et ça laisse une semaine pour changer
 * d'avis. La suppression définitive existe, mais elle se demande explicitement.
 *
 *   npm run supprime -- <slug>              met de côté
 *   npm run supprime -- <slug> --definitif  supprime pour de bon
 *   npm run supprime -- --corbeille         ce qui est de côté, et son poids
 *   npm run supprime -- --restaure=<nom>    la remet dans videos/
 *   npm run supprime -- --vide-corbeille    supprime tout ce qui est de côté
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHEMINS, dossierVideo, litJson } from './lib/chemins.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'

export const CORBEILLE = path.join(CHEMINS.videos, '.corbeille')

/** Le poids d'une arborescence, en octets. */
function poids(dossier) {
  let n = 0
  let entrees
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entrees) {
    const c = path.join(dossier, e.name)
    if (e.isDirectory()) n += poids(c)
    else {
      try {
        n += fs.statSync(c).size
      } catch { /* fichier disparu entre le listage et le stat */ }
    }
  }
  return n
}

const mo = (octets) => `${(octets / 1e6).toFixed(1)} Mo`

/** Ce que contient la corbeille, du plus récent au plus ancien. */
export function corbeille() {
  if (!fs.existsSync(CORBEILLE)) return []
  return fs
    .readdirSync(CORBEILLE, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const c = path.join(CORBEILLE, e.name)
      let date = null
      try {
        date = new Date(fs.statSync(c).mtimeMs).toISOString()
      } catch { /* dossier disparu */ }
      return { nom: e.name, octets: poids(c), mis_de_cote_le: date }
    })
    .sort((a, b) => String(b.mis_de_cote_le).localeCompare(String(a.mis_de_cote_le)))
}

/**
 * Met une vidéo de côté, ou la supprime pour de bon.
 *
 * Rend ce qui a été fait et ce que ça pesait — pour qu'on sache ce qu'on vient
 * de perdre, au lieu de le découvrir plus tard.
 */
export function supprime(slug, { definitif = false } = {}) {
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.base)) throw new Error(`Pas de vidéo « ${slug} » dans videos/.`)

  const script = litJson(v.scriptJson, {}) ?? {}
  const taille = poids(v.base)
  const aUnRush = fs.existsSync(v.tournage) && fs.readdirSync(v.tournage).length > 0

  if (definitif) {
    fs.rmSync(v.base, { recursive: true, force: true })
    return { slug, definitif: true, octets: taille, avaitUnRush: aUnRush, vers: null }
  }

  fs.mkdirSync(CORBEILLE, { recursive: true })
  // L'horodatage évite d'écraser une mise de côté précédente du même slug, et
  // dit quand on l'a retirée — la seule information dont on aura besoin pour
  // décider de vider la corbeille.
  const marque = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  let nom = `${slug}--${marque}`
  let n = 2
  while (fs.existsSync(path.join(CORBEILLE, nom))) nom = `${slug}--${marque}-${n++}`
  const vers = path.join(CORBEILLE, nom)
  fs.renameSync(v.base, vers)

  return { slug, definitif: false, octets: taille, avaitUnRush: aUnRush, vers: nom, titre: script.titre_travail ?? null }
}

/** Remet une vidéo mise de côté dans `videos/`. */
export function restaure(nom) {
  const de = path.join(CORBEILLE, nom)
  if (!fs.existsSync(de)) throw new Error(`« ${nom} » n'est pas dans la corbeille.`)
  // Le slug est ce qui précède le double tiret de l'horodatage.
  const slug = nom.split('--')[0]
  const vers = dossierVideo(slug).base
  if (fs.existsSync(vers)) {
    throw new Error(`« ${slug} » existe déjà dans videos/. Renomme ou supprime l'autre d'abord.`)
  }
  fs.renameSync(de, vers)
  return { slug, depuis: nom }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { options, positionnels } = litArgs()

  aide(
    options,
    `
npm run supprime -- <slug> [options]

  --definitif           supprime au lieu de mettre de côté
  --corbeille           ce qui est de côté, et depuis quand
  --restaure=<nom>      remet une vidéo dans videos/
  --vide-corbeille      supprime définitivement tout ce qui est de côté
  --json                sortie machine, pour l'atelier

Par défaut, la vidéo est DÉPLACÉE dans videos/.corbeille/. Un rendu se refait en
huit minutes ; un tournage, jamais.
`
  )

  await principal(async () => {
    const enJson = drapeau(options, 'json')

    if (drapeau(options, 'corbeille')) {
      const liste = corbeille()
      if (enJson) return void console.log(JSON.stringify({ ok: true, corbeille: liste }, null, 2))
      journal.titre('Corbeille')
      if (!liste.length) return void journal.info(`Vide.`)
      for (const c of liste) {
        console.log(`  ${c.nom.padEnd(46)} ${mo(c.octets).padStart(10)}`)
      }
      console.log('')
      journal.detail(`Total : ${mo(liste.reduce((n, c) => n + c.octets, 0))}`)
      journal.detail(`Restaurer : npm run supprime -- --restaure=<nom>`)
      return
    }

    if (options.restaure && options.restaure !== true) {
      const r = restaure(String(options.restaure))
      if (enJson) return void console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      journal.ok(`« ${r.slug} » est revenue dans videos/.`)
      return
    }

    if (drapeau(options, 'vide-corbeille')) {
      const liste = corbeille()
      const total = liste.reduce((n, c) => n + c.octets, 0)
      fs.rmSync(CORBEILLE, { recursive: true, force: true })
      if (enJson) return void console.log(JSON.stringify({ ok: true, videes: liste.length, octets: total }, null, 2))
      journal.ok(`${liste.length} vidéo(s) supprimée(s) définitivement — ${mo(total)} libérés.`)
      return
    }

    const slug = positionnels[0]
    if (!slug) throw new Error(`Donne le slug de la vidéo à retirer.`)

    const definitif = drapeau(options, 'definitif')
    const r = supprime(slug, { definitif })

    if (enJson) return void console.log(JSON.stringify({ ok: true, ...r }, null, 2))
    if (definitif) {
      journal.ok(`« ${slug} » supprimée définitivement — ${mo(r.octets)}.`)
      if (r.avaitUnRush) journal.attention(`Elle contenait un tournage. Il n'existe plus.`)
    } else {
      journal.ok(`« ${slug} » mise de côté — ${mo(r.octets)}.`)
      journal.detail(`videos/.corbeille/${r.vers}`)
      journal.detail(`La remettre : npm run supprime -- --restaure=${r.vers}`)
    }
  })
}
