#!/usr/bin/env node
/**
 * avatars.mjs — les visages de la chaîne.
 *
 * UN AVATAR EST UN JEU DE PHOTOS, PAS UNE IMAGE.
 *
 * Un seul portrait suffit tant que la scène reste proche du cadrage d'origine.
 * Dès qu'on s'en éloigne — elle marche dehors, elle est de trois quarts, elle
 * est dans le noir — le modèle perd le visage et rend quelqu'un d'autre. C'est
 * arrivé sur un plan de marche : une brune de vingt-cinq ans à la place d'une
 * blonde de quarante-deux.
 *
 * Deux à quatre photos sous des angles différents suffisent à le tenir. Elles
 * partent ensemble à chaque génération, et le prompt nomme le détail qui
 * identifie la personne — une mèche colorée, une cicatrice, une monture.
 *
 * L'AVATAR APPARTIENT À LA CHAÎNE, comme la voix et la direction artistique :
 * il vit dans `marque/avatars/`, il suit le dossier, et `nouvelle-chaine` ne le
 * copie pas — un visage est ce qu'une marque a de plus spécifique.
 *
 * LES ADRESSES fal SONT MISES EN CACHE. Téléverser quatre photos à chaque plan
 * coûterait une seconde et un aller-retour pour rien : elles sont posées une
 * fois, leur adresse est retenue dans `avatar.json`, et on la réemploie.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, litJson, ecritJson, assureDossier } from './lib/chemins.mjs'
import { DOSSIER, IMAGES, avatars, lis } from './lib/avatars.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, drapeau, aide, principal } from './lib/args.mjs'
import { identiteDe, deduisLIdentite } from './lib/persona.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
avatars.mjs — les visages de la chaîne

  npm run avatars                         la liste, avec leurs photos
  npm run avatars -- <id>                 le détail d'un avatar
  npm run avatars -- --ajoute=<id> --nom="Valérie" <photo…>
                                          crée un avatar à partir de photos
  npm run avatars -- --ajoute=<id> --signe="mèche orange sur le devant"
                                          le détail qui identifie la personne
  npm run avatars -- --photos=<id> <photo…>   en ajoute à un avatar existant
  npm run avatars -- --identite=<id> --texte="…"   sa façon de jouer, à la main
  npm run avatars -- --identite=<id> --deduis      la déduit de ses photos
  npm run avatars -- --retire=<id>        le retire, photos comprises
  npm run avatars -- --json               sortie machine, pour l'atelier

DEUX À QUATRE PHOTOS, SOUS DES ANGLES DIFFÉRENTS

  Un seul portrait tient tant que la scène reste proche du cadrage d'origine.
  Dès qu'on s'en éloigne, le modèle rend quelqu'un d'autre. Un visage de face,
  un de trois quarts, un en pied : ça suffit.

  Le « signe » est le détail que le prompt nommera à chaque génération — une
  mèche colorée, des lunettes, un tatouage. C'est lui qui ancre l'identité
  quand le cadrage change.

LE SIGNE TIENT LE VISAGE, L'IDENTITÉ TIENT LA PERSONNE

  Le signe suffit à ce qu'on reconnaisse un visage. Il ne dit rien de la
  gestuelle, de la façon de regarder l'objectif, de ce que le visage fait quand
  elle doute. Sans ça, chaque génération invente un tempérament : une vidéo la
  montre expansive, la suivante réservée, et l'abonné ne construit jamais de
  personnage.

  Elle se déduit toute seule à la première génération, et ne bouge plus ensuite.
  Une identité régénérée à chaque vidéo n'en est pas une.
`
)

function copiePhotos(id, sources) {
  const cible = path.join(DOSSIER, id, 'photos')
  assureDossier(cible)
  const posees = []
  for (const s of sources) {
    const abs = path.resolve(s)
    if (!fs.existsSync(abs)) { journal.attention(`Photo introuvable : ${s}`); continue }
    if (!IMAGES.test(abs)) { journal.attention(`Pas une image : ${s}`); continue }
    const nom = `${String(posees.length + 1).padStart(2, '0')}-${path.basename(abs).replace(/[^\w.-]/g, '-')}`
    fs.copyFileSync(abs, path.join(cible, nom))
    posees.push(nom)
  }
  return posees
}

principal(async () => {
  // ----------------------------------------------------------- l'identité --
  //
  // À la main avec --texte=, déduite avec --deduis. Deux gestes, pas un seul :
  // écraser une identité écrite à la main par une déduction serait la pire des
  // surprises — on perdrait un travail de personnage sans l'avoir demandé.
  if (options.identite !== undefined) {
    const id = String(options.identite)
    const a = lis(id)
    if (!a) throw new Error(`Aucun avatar « ${id} ».`)
    const f = path.join(a.dossier, 'avatar.json')

    if (options.texte !== undefined) {
      const texte = String(options.texte).trim()
      if (!texte) throw new Error(`--texte= est vide.`)
      // On n'écrit QUE le français : l'anglais se redéduira de lui-même à la
      // prochaine génération, puisque `identite_source` ne correspondra plus.
      ecritJson(f, { ...litJson(f, {}), identite: texte })
      journal.ok(`Identité de « ${a.nom} » écrite.`)
      journal.detail(texte)
      journal.detail(`Sa traduction se refera à la prochaine génération.`)
      return
    }

    if (drapeau(options, 'deduis')) {
      if (a.identite) {
        journal.attention(`« ${a.nom} » a déjà une identité — elle va être remplacée.`)
        journal.detail(a.identite)
      }
      const d = await deduisLIdentite(a)
      if (!d) throw new Error(`L'identité n'a pas pu être déduite. Il faut au moins une photo.`)
      ecritJson(f, { ...litJson(f, {}), identite: d.fr, identite_en: d.en, identite_source: d.fr })
      journal.ok(`Identité de « ${a.nom} » déduite.`)
      journal.detail(d.fr)
      return
    }

    // Ni l'un ni l'autre : on la montre, et on la déduit si elle manque.
    if (a.identite) {
      journal.titre(`Identité de ${a.nom}`)
      journal.info(a.identite)
      return
    }
    const en = await identiteDe(a)
    if (!en) throw new Error(`Aucune identité, et la déduction a échoué.`)
    return
  }

  // ------------------------------------------------------------ retirer ----
  if (options.retire !== undefined) {
    const id = String(options.retire)
    const a = lis(id)
    if (!a) throw new Error(`Aucun avatar « ${id} ».`)
    fs.rmSync(a.dossier, { recursive: true, force: true })
    journal.ok(`Avatar « ${a.nom ?? id} » retiré, photos comprises.`)
    return
  }

  // ------------------------------------------------------------ ajouter ----
  if (options.ajoute !== undefined || options.photos !== undefined) {
    const id = String(options.ajoute ?? options.photos).trim()
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) {
      throw new Error(`Identifiant invalide : « ${id} ». Minuscules, chiffres et tirets.`)
    }
    if (!positionnels.length) throw new Error(`Donne au moins une photo.`)

    const existant = lis(id)
    if (options.ajoute !== undefined && existant) {
      throw new Error(`« ${id} » existe déjà. --photos=${id} pour lui en ajouter.`)
    }
    if (options.photos !== undefined && !existant) {
      throw new Error(`Aucun avatar « ${id} ». --ajoute=${id} pour le créer.`)
    }

    assureDossier(path.join(DOSSIER, id))
    const posees = copiePhotos(id, positionnels)
    if (!posees.length) throw new Error(`Aucune photo exploitable.`)

    const f = path.join(DOSSIER, id, 'avatar.json')
    const avant = litJson(f, null)
    ecritJson(f, {
      _lecture:
        `Un avatar de la chaîne. Les photos partent ENSEMBLE à chaque génération : ` +
        `deux à quatre angles tiennent le visage quand le cadrage s'éloigne. ` +
        `Le « signe » est le détail nommé dans chaque prompt pour ancrer l'identité.`,
      nom: options.nom ?? avant?.nom ?? id,
      signe: options.signe ?? avant?.signe ?? null,
      cree_le: avant?.cree_le ?? new Date().toISOString(),
      // Les adresses fal se remettent à zéro dès que les photos changent : une
      // adresse qui pointe sur un jeu périmé donnerait un autre visage.
      fal: null,
    })

    const a = lis(id)
    journal.ok(`Avatar « ${a.nom} » — ${a.photos.length} photo(s).`)
    if (!a.signe) {
      journal.detail(
        `Ajoute son signe distinctif, c'est lui qui tient l'identité :\n` +
          `  npm run avatars -- --ajoute=${id} --signe="mèche orange sur le devant"`
      )
    }
    if (a.photos.length < 2) {
      journal.attention(
        `Une seule photo : le visage dérivera dès qu'un plan s'éloignera de ce cadrage. ` +
          `Ajoutes-en une de trois quarts et une en pied.`
      )
    }
    return
  }

  // ------------------------------------------------------------- le détail --
  const id = positionnels[0]
  if (id) {
    const a = lis(id)
    if (!a) throw new Error(`Aucun avatar « ${id} ».`)
    journal.titre(`${a.nom} · ${a.id}`)
    if (a.signe) journal.info(`signe : ${a.signe}`)
    if (a.identite) journal.info(`identité : ${a.identite}`)
    else journal.attention(`aucune identité de jeu — npm run avatars -- --identite=${a.id} --deduis`)
    journal.info(`${a.photos.length} photo(s)`)
    for (const p of a.photos) journal.detail(`  ${p}`)
    journal.detail(a.dossier)
    return
  }

  // -------------------------------------------------------------- la liste --
  const tous = avatars()
  if (drapeau(options, 'json')) {
    console.log(JSON.stringify({ ok: true, avatars: tous.map((a) => ({
      id: a.id,
      nom: a.nom,
      signe: a.signe ?? null,
      identite: a.identite ?? null,
      photos: a.photos.length,
      // LES NOMS DE FICHIERS PARTENT AVEC : sans eux l'atelier ne peut pas
      // afficher les vignettes, et un avatar qu'on ne voit pas ne se juge pas.
      fichiers: a.photos,
      cree_le: a.cree_le ?? null,
    })) }, null, 2))
    return
  }

  journal.titre(`Avatars de la chaîne`)
  if (!tous.length) {
    journal.attention(`Aucun avatar.`)
    journal.detail(`npm run avatars -- --ajoute=valerie --nom="Valérie" photo1.png photo2.png`)
    return
  }
  for (const a of tous) {
    journal.info(`${a.nom} · ${a.id} — ${a.photos.length} photo(s)${a.signe ? ` · ${a.signe}` : ''}`)
  }
})
