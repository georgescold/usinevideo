#!/usr/bin/env node
/**
 * broll.mjs — la bibliothèque de tes propres plans de coupe.
 *
 * Pexels ne connaîtra jamais ton produit, ton visage, ni la capture d'écran de
 * ton tableau de bord. Ces plans-là t'appartiennent, et ils appartiennent à la
 * CHAÎNE, pas à un montage : on les dépose une fois, avec des mots-clés, et le
 * montage s'en sert tout seul quand un plan les appelle — EN INSERT, posé par
 * dessus le plan de coupe, jamais en plein écran : une image qui prend tout le
 * cadre arrête le montage.
 *
 *   npm run broll                                  la bibliothèque
 *   npm run broll -- --ajoute=chemin --mots="victoire,portrait"
 *   npm run broll -- --mots-de=victoire.jpg --mots="victoire,visage,portrait"
 *   npm run broll -- --retire=victoire.jpg
 *   npm run broll -- <slug>                        où ils tomberaient, et pourquoi
 *
 * Le placement se vérifie AVANT de monter : `npm run broll -- <slug>` dit quel
 * plan se poserait sur quel passage, et sur quel mot-clé. Un placement qu'on ne peut
 * pas expliquer est un placement qu'on ne peut pas corriger.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHEMINS, dossierVideo, litJson, assureDossier } from './lib/chemins.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { DOSSIER, EXTENSIONS, bibliotheque, enregistre, attribue } from './lib/broll-perso.mjs'

const listeDeMots = (v) =>
  String(v ?? '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * Les événements de plan de coupe d'une vidéo, tels que le montage les verra.
 *
 * On les relit du SCRIPT et non du plan de montage : le but est de vérifier un
 * placement avant de monter, donc avant qu'un `plan.json` existe.
 */
function evenementsDe(slug) {
  const script = litJson(dossierVideo(slug).scriptJson, null)
  if (!script) return null
  const sortie = []
  for (const b of script.blocs ?? []) {
    for (const v of b.visuel ?? []) {
      if (v.type !== 'broll') continue
      sortie.push({ type: 'broll', requete: v.requete ?? null, ancre: v.ancre ?? null, bloc: b.id })
    }
  }
  return sortie
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { options, positionnels } = litArgs()

  aide(
    options,
    `
npm run broll -- [<slug>] [options]

  --ajoute=<chemin>     copie ce fichier dans assets/broll/
    --mots="a,b,c"        ses mots-clés — sans eux il ne sera jamais choisi
    --nom="…"             son nom dans la bibliothèque (défaut : celui du fichier)
    --note="…"            à quoi il sert, pour toi
    --emplois=1           combien de fois il peut servir dans une même vidéo
  --mots-de=<fichier>   change les mots-clés d'un plan déjà déposé
    --mots="a,b,c"
  --retire=<fichier>    le sort de la bibliothèque (le fichier est supprimé)
  --json                sortie machine, pour l'atelier

Avec un slug : montre où ces plans tomberaient dans CETTE vidéo, et sur quel
mot-clé — sans rien monter.

Les mots-clés sont cherchés dans la requête du plan (anglais) ET dans le mot du
script auquel il est ancré (français) : « guide » accroche sur « mon guide »
comme sur « writing notebook ». Un plan qui n'accroche rien laisse la place à
Pexels ; il n'est jamais posé au hasard.
`
  )

  await principal(async () => {
    const enJson = drapeau(options, 'json')

    // ------------------------------------------------------------- ajouter --
    if (options.ajoute && options.ajoute !== true) {
      const source = path.isAbsolute(options.ajoute)
        ? options.ajoute
        : path.join(CHEMINS.racine, String(options.ajoute))
      if (!fs.existsSync(source)) throw new Error(`Fichier introuvable : ${source}`)
      const ext = path.extname(source).toLowerCase()
      if (!EXTENSIONS.has(ext)) {
        throw new Error(`Extension refusée : ${ext}. Attendu ${[...EXTENSIONS].join(' ')}`)
      }

      const mots = listeDeMots(options.mots)
      // ON REFUSE UN PLAN SANS MOTS-CLÉS, ET CE N'EST PAS UN CAPRICE.
      //
      // C'est par eux, et par eux seuls, qu'un plan trouve sa place. Déposé
      // sans, il occuperait le disque en attendant un jour qui ne viendrait
      // jamais — et l'oubli ne se verrait pas, puisque le montage continuerait
      // simplement d'aller chercher chez Pexels.
      if (!mots.length) {
        throw new Error(
          `Donne au moins un mot-clé : --mots="victoire,portrait".\n` +
            `Sans eux, ce plan ne serait jamais choisi.`
        )
      }

      assureDossier(DOSSIER)

      // LE NOM VIENT DE `--nom` QUAND L'APPELANT EN DONNE UN.
      //
      // L'atelier envoie le fichier par un dépôt temporaire, dont le nom ne dit
      // rien (`depot-a3f9…`). Il repasse donc le nom d'origine. Au terminal, le
      // nom du fichier source suffit et parle déjà.
      //
      // On assainit sans jamais rendre vide : c'est ce nom qu'on relira dans la
      // bibliothèque, et un identifiant opaque y serait inutilisable.
      const brut = options.nom && options.nom !== true ? String(options.nom) : path.basename(source)
      const nom =
        path
          .basename(brut, path.extname(brut))
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || 'plan'
      let fichier = `${nom}${ext}`
      let n = 2
      while (fs.existsSync(path.join(DOSSIER, fichier))) fichier = `${nom}-${n++}${ext}`

      fs.copyFileSync(source, path.join(DOSSIER, fichier))
      const entrees = bibliotheque().map((e) =>
        e.fichier === fichier
          ? {
              ...e,
              motscles: mots,
              note: options.note && options.note !== true ? String(options.note) : null,
              emploisMax: Math.max(1, Number(options.emplois) || 1),
            }
          : e
      )
      enregistre(entrees)

      if (enJson) {
        console.log(JSON.stringify({ ok: true, fichier, motscles: mots }, null, 2))
        return
      }
      journal.titre('Plan ajouté')
      journal.ok(`assets/broll/${fichier}`)
      journal.detail(`Mots-clés : ${mots.join(' · ')}`)
      journal.detail(`Vérifie où il tomberait : npm run broll -- <slug>`)
      return
    }

    // ------------------------------------------------------- remots-cléser --
    if (options['mots-de'] && options['mots-de'] !== true) {
      const cible = String(options['mots-de'])
      const entrees = bibliotheque()
      const e = entrees.find((x) => x.fichier === cible)
      if (!e) throw new Error(`« ${cible} » n'est pas dans assets/broll/.`)
      const mots = listeDeMots(options.mots)
      if (!mots.length) throw new Error(`Donne les nouveaux mots-clés : --mots="a,b,c"`)
      e.motscles = mots
      if (options.note !== undefined) e.note = options.note === true ? null : String(options.note)
      if (options.emplois !== undefined) e.emploisMax = Math.max(1, Number(options.emplois) || 1)
      enregistre(entrees)
      if (enJson) return void console.log(JSON.stringify({ ok: true, fichier: cible, motscles: mots }, null, 2))
      journal.ok(`${cible} : ${mots.join(' · ')}`)
      return
    }

    // -------------------------------------------------------------- retirer --
    if (options.retire && options.retire !== true) {
      const cible = String(options.retire)
      const chemin = path.join(DOSSIER, cible)
      // On reste DANS le dossier : un `--retire=../../config/keys.json` ne doit
      // pas pouvoir sortir d'ici.
      if (path.dirname(path.resolve(chemin)) !== path.resolve(DOSSIER)) {
        throw new Error(`Nom de fichier refusé : ${cible}`)
      }
      if (!fs.existsSync(chemin)) throw new Error(`« ${cible} » n'est pas dans assets/broll/.`)
      fs.rmSync(chemin)
      enregistre(bibliotheque())
      if (enJson) return void console.log(JSON.stringify({ ok: true, retire: cible }, null, 2))
      journal.ok(`${cible} retiré de la bibliothèque.`)
      return
    }

    const liste = bibliotheque()

    // ---------------------------------------- où tomberaient-ils ici ? ------
    const slug = positionnels[0]
    if (slug) {
      const evenements = evenementsDe(slug)
      if (!evenements) throw new Error(`Pas de script pour « ${slug} ».`)
      const retenues = attribue(evenements, { assets: liste })

      if (enJson) {
        console.log(JSON.stringify({
          ok: true, slug, plans: evenements.length,
          attributions: retenues.map((c) => ({
            evenement: c.i, bloc: evenements[c.i].bloc, ancre: evenements[c.i].ancre,
            requete: evenements[c.i].requete, fichier: c.asset.fichier,
            score: c.score, motscles: c.trouves,
          })),
        }, null, 2))
        return
      }

      journal.titre(`Tes plans dans « ${slug} »`)
      journal.info(`${evenements.length} plans de coupe · ${liste.length} dans ta bibliothèque`)
      console.log('')
      if (!retenues.length) {
        journal.attention(`Aucun de tes plans n'accroche sur cette vidéo — tout viendra de Pexels.`)
        journal.detail(`Les mots-clés se cherchent dans la requête et dans l'ancre du plan.`)
        return
      }
      for (const c of retenues) {
        const e = evenements[c.i]
        console.log(`  ${c.asset.fichier}`)
        console.log(`     sur « ${e.ancre ?? e.requete} »  (bloc ${e.bloc})`)
        console.log(`     accroche : ${c.trouves.join(', ')}  ·  score ${c.score}`)
      }
      console.log('')
      journal.detail(`Les ${evenements.length - retenues.length} autres viendront de Pexels.`)
      return
    }

    // ------------------------------------------------------------- lister ---
    if (enJson) {
      console.log(JSON.stringify({ ok: true, dossier: path.relative(CHEMINS.racine, DOSSIER), plans: liste }, null, 2))
      return
    }
    journal.titre(`Tes plans de coupe`)
    if (!liste.length) {
      journal.info(`assets/broll/ est vide.`)
      journal.detail(`Ajoute-en un : npm run broll -- --ajoute=chemin/vers/image.jpg --mots="produit,guide"`)
      return
    }
    for (const e of liste) {
      const sansMots = e.motscles.length === 0
      console.log(
        `  ${e.fichier.padEnd(34)} ${(e.image ? 'image' : 'vidéo').padEnd(6)} ` +
          `${e.poids ? (e.poids / 1e6).toFixed(1) + ' Mo' : ''}`
      )
      console.log(
        sansMots
          ? `     ⚠ aucun mot-clé — il ne sera jamais choisi. --mots-de=${e.fichier} --mots="…"`
          : `     ${e.motscles.join(' · ')}${e.emploisMax > 1 ? `   (jusqu'à ${e.emploisMax} fois par vidéo)` : ''}`
      )
      if (e.note) console.log(`     ${e.note}`)
    }
    console.log('')
    journal.detail(`Où tomberaient-ils : npm run broll -- <slug>`)
  })
}
