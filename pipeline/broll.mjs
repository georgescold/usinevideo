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
 *   npm run broll -- <slug> --estime               combien de plans de coupe aura ce montage
 *
 * Le placement se vérifie AVANT de monter : `npm run broll -- <slug>` dit quel
 * plan se poserait sur quel passage, et sur quel mot-clé. Un placement qu'on ne peut
 * pas expliquer est un placement qu'on ne peut pas corriger.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHEMINS, dossierVideo, litJson, ecritJson, assureDossier } from './lib/chemins.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { DOSSIER, EXTENSIONS, bibliotheque, enregistre, attribue } from './lib/broll-perso.mjs'
import {
  plansDe, remplaceUnPlan, styleDesSousTitres, assureLaMesureDOuverture,
} from './lib/plan-broll.mjs'
import { accrocheFaible } from './lib/ffmpeg.mjs'
import { litChaine } from './lib/chemins.mjs'

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
  --plans               les plans de coupe du montage, un par un (avec un slug)
  --remplace=<n>        échange le plan n° n contre un autre candidat de la
                        banque. Refuser un plan doit en appeler un autre :
                        le retirer laisserait le précédent s'étirer, et c'est
                        le temps mort que la doctrine interdit.
  --source=ia           le fait GÉNÉRER au lieu de le chercher en banque.
                        ~0,18 $ le plan, sur ton solde fal. Pour les scènes
                        qu aucune banque ne tient.
  --json                sortie machine, pour l'atelier

Avec un slug : montre où ces plans tomberaient dans CETTE vidéo, et sur quel
mot-clé — sans rien monter.

Les mots-clés sont cherchés dans la requête du plan (anglais) ET dans le mot du
script auquel il est ancré (français) : « guide » accroche sur « mon guide »
comme sur « writing notebook ». Un plan qui n'accroche rien laisse la place à
Pexels ; il n'est jamais posé au hasard.
`
  )

  /**
 * Mesure, plan par plan, si les sous-titres vont se lire dessus.
 *
 * LE HORS-SUJET NE SE MESURE PAS ; LA LISIBILITÉ, SI — et c'est toute la
 * différence. « Est-ce que cette image parle du bon sujet » n'a aucun signal.
 * « Du texte blanc va-t-il se voir là-dessus » en a un seul, et il suffit : la
 * clarté du fond à l'endroit exact où le texte se pose.
 *
 * ON ÉCRIT LE RELEVÉ DANS LE PLAN. Mesurer quatre-vingts clips prend deux à
 * trois minutes : le refaire à chaque ouverture de l'écran serait insupportable.
 * On le fait une fois, à la demande, et le résultat reste avec le montage.
 */
async function mesureLaLisibilite(slug) {
  const { luminanceDeLaBande, BANDE_CLAIRE } = await import('./lib/ffmpeg.mjs')
  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  if (!plan) throw new Error(`Aucun plan de montage pour « ${slug} ». Monte-la d'abord.`)

  // La position vient du THÈME du plan, pas des réglages : c'est ce qui sera
  // rendu. Les deux peuvent diverger, et mesurer la mauvaise bande ne dirait
  // rien de la vidéo qu'on va produire.
  const positionBas = plan.theme?.sousTitres?.positionBas ?? 22
  const couleurTexte = String(plan.theme?.sousTitres?.couleurTexte ?? '#ffffff')
  const pub = path.join(v.montage, 'public')

  let mesures = 0
  const clairs = []
  for (const e of plan.evenements ?? []) {
    if (e.type !== 'broll' || !e.src) continue
    const fichier = path.join(pub, e.src)
    const r = await luminanceDeLaBande(fichier, { positionBas })
    if (!r) continue
    e._bandeY = r.moyenne
    mesures++
    if (r.moyenne >= BANDE_CLAIRE) clairs.push({ src: e.src, y: r.moyenne, requete: e.requete })
  }
  ecritJson(v.plan, plan)
  return { slug, mesures, clairs, seuil: BANDE_CLAIRE, positionBas, couleurTexte }
}

/**
 * Efface la piste image d'un montage, et RIEN d'autre.
 *
 * CE QU'ON DÉTRUIT, ET CE QU'ON GARDE — la liste est le cœur de la fonction.
 *
 * Détruit : `plan.json`, `attributions.json`, et les clips de `public/broll/`.
 * Ce sont des dérivés : le plan se reconstruit à partir du script et du
 * transcript, les clips se retéléchargent depuis la banque. Rien là-dedans ne
 * représente du travail humain.
 *
 * Gardé : `soustitres.json` — c'est une DÉCISION, réglée à l'œil devant
 * l'aperçu, et elle vit dans le même dossier que le plan. La perdre en effaçant
 * la piste image serait le pire des échanges. Gardés aussi `coupe.json`,
 * `public/image.mp4` et `public/voix.wav` : la coupe et la voix convertie ne
 * dépendent pas des plans de coupe, et les refaire coûterait une conversion
 * payante pour rien.
 *
 * ON DÉTRUIT VRAIMENT. Le §6 protège les rushes et les rendus ; une piste image
 * n'est ni l'un ni l'autre. Cinq cents mégaoctets de clips de banque mis « de
 * côté » sont cinq cents mégaoctets qu'on ne rouvrira jamais.
 */
function effaceLesPlans(slug) {
  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  const combien = (plan?.evenements ?? []).filter((e) => e.type === 'broll').length

  const broll = path.join(v.montage, 'public', 'broll')
  let fichiers = 0
  let octets = 0
  if (fs.existsSync(broll)) {
    for (const f of fs.readdirSync(broll)) {
      try {
        octets += fs.statSync(path.join(broll, f)).size
        fichiers++
      } catch { /* un fichier qui disparaît entre le listage et le stat */ }
    }
    fs.rmSync(broll, { recursive: true, force: true })
  }
  for (const f of [v.plan, path.join(v.montage, 'attributions.json')]) {
    fs.rmSync(f, { force: true })
  }

  const garde = ['soustitres.json', 'coupe.json']
    .filter((f) => fs.existsSync(path.join(v.montage, f)))
  return { slug, plans: combien, fichiers, mo: Math.round(octets / 1e6), garde }
}

await principal(async () => {
  // COMBIEN DE PLANS DE COUPE AURA CE MONTAGE — AVANT DE MONTER.
  //
  // Le curseur « plans générés par IA » de l'atelier a besoin d'une borne : sur
  // une vidéo de deux minutes, offrir un budget de trente plans quand il n'y en
  // a que douze est un chiffre qui ne veut rien dire. La commande n'appelle
  // rien : elle compte les visuels du SCRIPT, et le plan de montage quand il
  // existe — celui-ci est plus juste, la découpe sur les fins de phrase pouvant
  // multiplier un visuel en plusieurs plans.
  if (drapeau(options, 'estime')) {
    const slugVise = positionnels[0]
    if (!slugVise) throw new Error(`Donne le slug : npm run broll -- <slug> --estime`)
    const slug = String(slugVise)
    const liste = plansDe(slug)
    const duScript = evenementsDe(slug)
    const r = liste?.length
      ? { plans: liste.length, source: 'plan' }
      : { plans: duScript?.length ?? 0, source: duScript ? 'script' : 'rien' }
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, slug, ...r }, null, 2))
      return
    }
    journal.titre(`Plans de coupe attendus · ${slug}`)
    if (r.source === 'rien') {
      journal.attention(`Pas de script : rien à compter. Écris-le d'abord.`)
      return
    }
    journal.ok(
      `${r.plans} plan(s) de coupe — ` +
        (r.source === 'plan'
          ? `comptés dans le plan de montage.`
          : `comptés dans le script ; le montage peut en découper davantage.`)
    )
    return
  }

  // Effacer la piste image : les dérivés partent, les décisions restent.
  if (drapeau(options, 'efface-plans')) {
    const slugVise = positionnels[0]
    if (!slugVise) throw new Error(`Donne le slug : npm run broll -- <slug> --efface-plans`)
    const r = effaceLesPlans(String(slugVise))
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      return
    }
    journal.titre(`Piste image effacée · ${r.slug}`)
    journal.ok(`${r.plans} plan(s) et ${r.fichiers} fichier(s) supprimés — ${r.mo} Mo libérés.`)
    if (r.garde.length) journal.detail(`Gardés : ${r.garde.join(', ')} — ce sont des décisions.`)
    journal.detail(`La voix et la coupe restent : rien de payant n'est à refaire.`)
    journal.detail(`Relance le montage pour reconstruire : npm run monte -- ${r.slug} --depuis=cale`)
    return
  }

  // La lisibilité se mesure sur demande : deux à trois minutes pour un montage
  // complet, et le relevé reste dans le plan.
  if (drapeau(options, 'lisibilite')) {
    const slugVise = positionnels[0]
    if (!slugVise) throw new Error(`Donne le slug : npm run broll -- <slug> --lisibilite`)
    const r = await mesureLaLisibilite(String(slugVise))
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      return
    }
    journal.titre(`Lisibilité des sous-titres · ${r.slug}`)
    journal.info(
      `${r.mesures} plan(s) mesurés — bande à ${r.positionBas} % du bas, texte ${r.couleurTexte}.`
    )
    if (!r.clairs.length) {
      journal.ok(`Aucun plan au-dessus de ${r.seuil} : le texte se détachera partout.`)
      return
    }
    journal.attention(
      `${r.clairs.length} plan(s) trop clairs pour un texte blanc (seuil ${r.seuil}) :`
    )
    for (const c of r.clairs) journal.detail(`  Y ${c.y} · ${c.src} · « ${c.requete ?? '—'} »`)
    journal.detail(`Échange-les, ou épaissis le contour à l'étape 5.`)
    return
  }

    // ------------------------------------------- les plans d'UN montage -----
    const slugVise = positionnels[0] ?? null

    if (slugVise && (drapeau(options, 'plans') || options.remplace !== undefined)) {
      const enJson = drapeau(options, 'json')

      if (options.remplace !== undefined) {
        const numero = Number(options.remplace)
        if (!Number.isInteger(numero) || numero < 1) {
          throw new Error(`Donne le numéro du plan : --remplace=3 (voir --plans).`)
        }
        const chaine = litChaine({ exigeInitialisee: false })
        const r = await remplaceUnPlan(slugVise, numero, {
          direction: chaine?.identite_visuelle?.direction_plans ?? null,
          source: options.source === 'ia' ? 'ia' : 'pexels',
        })
        if (enJson) { console.log(JSON.stringify({ ok: true, ...r, plans: plansDe(slugVise) }, null, 2)); return }
        journal.titre(`Plan de coupe n° ${r.numero} · ${slugVise}`)
        journal.ok(`${r.avant ?? '(rien)'} → ${r.apres}`)
        journal.detail(
          `${r.essais}e proposition · ${r.restants} candidat(s) pour cette requête` +
            (r.media.auteur ? ` · ${r.media.auteur}` : '')
        )
        journal.info(`Le plan est réécrit. Relance le rendu pour le voir.`)
        return
      }

      const liste = plansDe(slugVise)
      if (!liste) throw new Error(`Aucun plan de montage pour « ${slugVise} ». Monte-la d'abord.`)
      await assureLaMesureDOuverture(slugVise, liste)
      if (enJson) {
        // Le style part avec les plans : l'écran de revue s'en sert pour
        // dessiner les sous-titres du rendu par-dessus l'image.
        const paquet = { ok: true, slug: slugVise, soustitres: styleDesSousTitres(slugVise), plans: liste }
        console.log(JSON.stringify(paquet, null, 2)); return
      }

      const t = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
      journal.titre(`Plans de coupe · ${slugVise}`)
      for (const p of liste) {
        journal.detail(
          `${String(p.numero).padStart(3)}. ${t(p.debutMs)}→${p.finMs != null ? t(p.finMs) : '  ?  '} ` +
            `${String(p.source).padEnd(7)} ${String(p.src ?? '—').padEnd(26)}` +
            (p.insert ? ` +insert` : '') +
            (p.essais ? ` (${p.essais} refus)` : '')
        )
        if (p.ouverture) {
          // Le plan d'ouverture porte ses trois relevés. Pas une note : trois
          // nombres qu'on lit, parce que ce qui arrête l'œil ne se résume pas.
          const a = p.accroche
          journal.detail(
            `      ouverture` +
              (a?.visage?.present ? ` · VISAGE sur ${a.visage.taille} % du cadre` : '') +
              (a ? ` · mouvement ${a.mouvement} · contraste ${a.contraste} · couleur ${a.couleur}` : '') +
              (a && accrocheFaible(a) ? ` — terne, et c'est LE plan qui décide` : '')
          )
        }
        if (p.ancre || p.requete) journal.detail(`      « ${String(p.ancre ?? p.requete).slice(0, 68)} »`)
      }
      console.log()
      journal.info(`${liste.length} plans. En changer un : npm run broll -- ${slugVise} --remplace=<n>`)
      return
    }

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
