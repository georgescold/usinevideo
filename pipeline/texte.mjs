#!/usr/bin/env node
/**
 * texte.mjs — corriger ce que la transcription a mal entendu.
 *
 * POURQUOI CETTE COMMANDE EXISTE.
 *
 * Whisper se trompe, et toujours de la même façon : il rend un mot qui sonne
 * pareil. « devine quoi » devient « de quoi », « être attirée » perd son accord.
 * Ces fautes ne s'entendent pas — la voix, elle, a dit le bon mot — mais elles
 * s'affichent, en gros, au milieu de l'écran. C'est le seul endroit du pipeline
 * où un défaut invisible à l'oreille devient une faute d'orthographe à l'image.
 *
 * CE QU'ON GARANTIT, ET CE QU'ON APPROXIME.
 *
 * Les horodatages calent les sous-titres, les punchs et les plans de coupe :
 * les bousculer déplace tout le montage. La règle est donc simple, et elle a
 * deux régimes.
 *
 *   Le nombre de mots ne change pas  →  AUCUN instant ne bouge. C'est le cas
 *   d'une faute d'accord ou d'un mot mal entendu, c'est-à-dire presque tout, et
 *   la correction est exacte au millième.
 *
 *   Le nombre de mots change  →  les instants sont répartis DANS LA LIGNE, au
 *   prorata des lettres, et les deux bornes de la ligne sont conservées. Rien
 *   ne déborde sur les mots voisins ; seul le surlignage à l'intérieur de la
 *   ligne devient approximatif.
 *
 * LE PLAN EST CORRIGÉ AVEC LE TRANSCRIPT, ET SANS REMONTER.
 *
 * `plan.json` porte sa propre copie des mots — c'est elle que Remotion lit. Ne
 * corriger que le transcript laisserait le rendu afficher l'ancienne faute, et
 * il faudrait rejouer un calage complet pour rien. Le repérage s'y fait par la
 * FENÊTRE DE TEMPS, pas par l'index : les deux listes n'ont pas forcément la
 * même longueur, mais les bornes d'une ligne, elles, sont les mêmes des deux
 * côtés.
 *
 *   node pipeline/texte.mjs <slug>                  les mots, avec leurs temps
 *   node pipeline/texte.mjs <slug> --json           pour l'atelier
 *   node pipeline/texte.mjs <slug> --corrige=-      lit un patch JSON sur l'entrée
 *   node pipeline/texte.mjs <slug> --cherche=devine
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHEMINS, dossierVideo, litJson, ecritJson } from './lib/chemins.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { reperesDesNombres } from './lib/nombres.mjs'

/** `1 min 04,3 s` → lisible dans une liste de deux cents lignes. */
const horodate = (ms) => {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')},${Math.floor((s % 1) * 10)}`
}

/** Les mots du transcript, avec leur index — la clé du patch. */
export function motsDe(slug) {
  const v = dossierVideo(slug)
  const t = litJson(v.transcript, null)
  if (!t) return null
  return (t.mots ?? []).map((m, i) => ({
    i,
    texte: m.texte,
    debutMs: m.debutMs,
    finMs: m.finMs,
    incertain: m.incertain === true,
    // La confiance de Whisper sert à trier ce qu'il faut relire en premier :
    // une correction se cherche là où la machine hésitait déjà.
    confiance: typeof m.confiance === 'number' ? m.confiance : null,
  }))
}

/**
 * Répartit les instants d'une plage sur un nouveau nombre de mots.
 *
 * PROCÉDÉ REPRIS DE SCRIPTSHORT (`spreadByLength`, `subtitles.js` l.261-270).
 *
 * On ne peut pas garder les horodatages quand le nombre de mots change : trois
 * mots deviennent cinq, il faut bien inventer quatre instants. La répartition au
 * prorata du NOMBRE DE LETTRES est la moins fausse — un mot long se prononce
 * plus longtemps qu'un mot court — et elle conserve exactement les deux BORNES
 * de la ligne, qui sont les seules à compter pour le reste du montage : le plan
 * de coupe et le punch d'à côté ne bougent pas d'une image.
 *
 * À l'intérieur de la ligne, le surlignage devient approximatif. C'est le prix,
 * et il ne se paie que sur les lignes dont on change le nombre de mots.
 */
function repartis(debutMs, finMs, textes) {
  const total = textes.reduce((n, t) => n + Math.max(1, t.length), 0)
  const span = Math.max(1, finMs - debutMs)
  const sortie = []
  let curseur = debutMs
  for (const [k, texte] of textes.entries()) {
    const part = Math.round((Math.max(1, texte.length) / total) * span)
    const fin = k === textes.length - 1 ? finMs : Math.min(finMs - 1, curseur + Math.max(40, part))
    sortie.push({ texte, debutMs: curseur, finMs: Math.max(curseur + 1, fin) })
    curseur = sortie[sortie.length - 1].finMs
  }
  return sortie
}

/**
 * Applique un patch et rend ce qui a changé.
 *
 * DEUX FORMES DE CORRECTION, ET ELLES NE COÛTENT PAS LA MÊME CHOSE.
 *
 *   { i, texte }        remplace UN mot. Ses instants sont conservés à
 *                       l'identique : la correction est exacte.
 *   { de, a, texte }    remplace une PLAGE de mots par un texte libre. Tant que
 *                       le nombre de mots ne change pas, chacun garde ses
 *                       instants ; s'il change, ils sont répartis dans la plage
 *                       au prorata des lettres, bornes conservées.
 *
 * Un texte vide retire les mots visés. Les plages sont appliquées de la FIN vers
 * le début : autrement, la première remplacée décalerait les index des suivantes.
 */
export function corrige(slug, patch) {
  const v = dossierVideo(slug)
  const transcript = litJson(v.transcript, null)
  if (!transcript) throw new Error(`Pas de transcription pour « ${slug} ». Lance d'abord le montage.`)

  let mots = transcript.mots ?? []

  // On normalise tout en plages : un mot seul est la plage [i, i].
  const plages = patch.map((p) => {
    const seul = p?.i !== undefined && p?.de === undefined
    const de = Number(seul ? p.i : p.de)
    const a = Number(seul ? p.i : p.a)
    if (!Number.isInteger(de) || !Number.isInteger(a) || de < 0 || a < de || a >= mots.length) {
      throw new Error(
        `Plage de mots hors bornes : ${JSON.stringify(seul ? p.i : [p.de, p.a])} ` +
          `(la transcription en a ${mots.length}).`
      )
    }
    const texte = p.texte === null || p.texte === undefined ? '' : String(p.texte)
    if (/[\r\n\t]/.test(texte)) throw new Error(`Ni saut de ligne ni tabulation dans un sous-titre : « ${texte} ».`)
    if (seul && /\s/.test(texte.trim())) {
      throw new Error(
        `« ${texte} » contient une espace alors que la correction vise un seul mot. ` +
          `Pour récrire toute une ligne, envoie { de, a, texte }.`
      )
    }
    return { de, a, texte: texte.trim() }
  })

  // Aucune plage ne doit en chevaucher une autre : deux corrections sur le même
  // mot donneraient un résultat qui dépend de l'ordre d'application.
  const triees = [...plages].sort((x, y) => x.de - y.de)
  for (let k = 1; k < triees.length; k++) {
    if (triees[k].de <= triees[k - 1].a) {
      throw new Error(`Deux corrections se chevauchent sur le mot ${triees[k].de}.`)
    }
  }

  const changements = []

  for (const plage of [...triees].reverse()) {
    const anciens = mots.slice(plage.de, plage.a + 1)
    const avant = anciens.map((m) => m.texte).join(' ')
    if (plage.texte === avant) continue

    const bornes = { debutMs: anciens[0].debutMs, finMs: anciens[anciens.length - 1].finMs }
    const textes = plage.texte.split(/\s+/).filter(Boolean)

    let remplacement
    if (textes.length === anciens.length) {
      // MÊME NOMBRE DE MOTS : on ne touche à aucun instant. C'est le cas le plus
      // courant — une faute d'accord, un mot mal entendu — et il doit rester
      // exact au millième.
      remplacement = anciens.map((m, k) => ({ ...m, texte: textes[k], corrige: true }))
    } else {
      remplacement = repartis(bornes.debutMs, bornes.finMs, textes).map((m) => ({
        ...m,
        corrige: true,
        // La confiance de Whisper ne veut plus rien dire sur un mot qu'on a
        // écrit soi-même : on la retire plutôt que de la laisser mentir.
        confiance: null,
        incertain: false,
      }))
    }

    changements.push({
      de: plage.de,
      a: plage.a,
      avant,
      apres: plage.texte,
      ...bornes,
      // Ce que le plan devra poser à la place, et sur quelle fenêtre.
      _remplacement: remplacement,
      instantsRepartis: textes.length !== anciens.length && textes.length > 0,
    })
    mots = [...mots.slice(0, plage.de), ...remplacement, ...mots.slice(plage.a + 1)]
  }

  if (!changements.length) return { changements: [], planPatche: false }

  transcript.mots = mots
  transcript.corrige_le = new Date().toISOString()
  ecritJson(v.transcript, transcript)

  // ---------------------------------------------------------------- le plan --
  //
  // `plan.json` porte sa PROPRE copie des mots — c'est elle que Remotion lit.
  // Ne corriger que le transcript laisserait le rendu afficher l'ancienne faute,
  // et il faudrait rejouer un calage complet pour rien.
  //
  // Le repérage se fait par la FENÊTRE DE TEMPS, pas par l'index : la coupe des
  // silences peut avoir retiré des mots entre les deux listes, et une plage
  // récrite ne compte plus le même nombre de mots. Comme les bornes de chaque
  // plage sont conservées, la fenêtre désigne exactement les mêmes mots des deux
  // côtés, et rien ne déborde sur les voisins.
  let planPatche = false
  if (fs.existsSync(v.plan)) {
    const plan = litJson(v.plan, null)
    if (plan && Array.isArray(plan.mots)) {
      // De la fin vers le début, là encore : chaque remplacement change la
      // longueur de la liste après lui.
      for (const c of [...changements].sort((x, y) => y.debutMs - x.debutMs)) {
        const dans = (m) => m.debutMs >= c.debutMs && m.debutMs <= c.finMs
        const debut = plan.mots.findIndex(dans)
        if (debut < 0) continue
        let fin = debut
        while (fin < plan.mots.length && dans(plan.mots[fin])) fin++
        plan.mots = [...plan.mots.slice(0, debut), ...c._remplacement, ...plan.mots.slice(fin)]
      }
      // Écriture par fichier temporaire puis renommage : un plan à moitié écrit
      // fait échouer le rendu bien plus tard, sans dire pourquoi.
      const temporaire = `${v.plan}.temporaire`
      ecritJson(temporaire, plan)
      fs.renameSync(temporaire, v.plan)
      planPatche = true
    }
  }

  // `_remplacement` ne sort pas : c'est un détail d'application, pas un résultat.
  return { changements: changements.map(({ _remplacement, ...c }) => c), planPatche }
}

// ---------------------------------------------------------------------------
//  Ligne de commande
// ---------------------------------------------------------------------------

// Le garde évite que `--aide` d'une AUTRE commande, qui importerait ce module,
// n'affiche cette aide-ci puis ne quitte le processus.
if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { options, positionnels } = litArgs()

  aide(
    options,
    `
npm run texte -- <slug> [options]

  --cherche=<mot>     ne montre que les mots qui contiennent ça
  --incertains        ne montre que ceux dont Whisper doutait
  --corrige=-         lit un patch JSON sur l'entrée standard :
                        [{ "i": 42, "texte": "devine" }]          un mot
                        [{ "de": 40, "a": 42, "texte": "et devine quoi" }]
                                                                 toute une ligne
                      un texte vide retire les mots visés
  --chiffres          réécrit en chiffres les nombres dits en lettres :
                      « voici trois signes » devient « voici 3 signes ».
                      --chiffres=voir montre ce qui changerait, sans rien écrire
  --json              sortie machine, pour l'atelier

À nombre de mots constant, aucun instant ne bouge. Quand il change, les instants
sont répartis dans la ligne au prorata des lettres, ses deux bornes conservées :
rien ne déborde sur les mots voisins.

Le plan de montage est corrigé en même temps : pas besoin de remonter.
`
  )

  await principal(async () => {
    const slug = positionnels[0]
    if (!slug) throw new Error(`Donne le slug de la vidéo.`)
    const enJson = drapeau(options, 'json')

    // ------------------------------------------------- nombres en chiffres --
    //
    // UN CHIFFRE SE SAISIT D'UN COUP D'ŒIL, UN NOMBRE ÉCRIT SE LIT.
    //
    // Sur un sous-titre qui tient trois mots et passe en huit dixièmes de
    // seconde, la différence n'est pas cosmétique : « 3 » est perçu, « trois »
    // est lu. Whisper, lui, transcrit ce qui est PRONONCÉ — il ne peut pas
    // faire autrement, et c'est très bien ainsi : le transcript dit ce qui a
    // été dit. La mise en chiffres est une décision d'affichage, elle vient
    // après, et elle se voit avant de s'appliquer.
    //
    // On passe par le même patch que `--corrige` : c'est lui qui sait répartir
    // les instants quand deux mots deviennent un, et qui corrige le plan dans
    // la foulée. Réécrire le transcript ici aurait dupliqué cette mécanique —
    // celle, précisément, dont dépend le calage des sous-titres.
    if (options.chiffres !== undefined) {
      const mots = motsDe(slug)
      const trouves = reperesDesNombres(mots)
      const seulementVoir = String(options.chiffres) === 'voir'

      if (enJson && seulementVoir) {
        console.log(JSON.stringify({ ok: true, slug, trouves }, null, 2))
        return
      }
      if (!trouves.length) {
        if (enJson) { console.log(JSON.stringify({ ok: true, slug, changements: [] }, null, 2)); return }
        journal.titre(`Texte · ${slug}`)
        journal.info(`Aucun nombre écrit en lettres.`)
        return
      }
      if (seulementVoir) {
        journal.titre(`Nombres à mettre en chiffres · ${slug}`)
        for (const t of trouves) journal.detail(`${t.avant.padEnd(28)} → ${t.texte}`)
        console.log()
        journal.info(`${trouves.length} à convertir. Relance sans « =voir » pour les écrire.`)
        return
      }

      const patch = trouves.map((t) => ({ de: t.de, a: t.a, texte: t.texte }))
      const { changements, planPatche } = corrige(slug, patch)
      if (enJson) {
        console.log(JSON.stringify({ ok: true, slug, changements, plan_patche: planPatche }, null, 2))
        return
      }
      journal.titre(`Texte · ${slug}`)
      for (const t of trouves) journal.ok(`${t.avant} → ${t.texte}`)
      console.log()
      journal.info(`${changements.length} mot(s) réécrit(s).`)
      journal.detail(planPatche ? `Plan de montage corrigé.` : `Pas de plan à corriger.`)
      return
    }

    // ------------------------------------------------------------ correction --
    if (options.corrige !== undefined) {
      const source = String(options.corrige)
      const brut =
        source === '-' || source === 'true'
          ? fs.readFileSync(0, 'utf8')
          : fs.readFileSync(path.isAbsolute(source) ? source : path.join(CHEMINS.racine, source), 'utf8')

      let patch
      try {
        patch = JSON.parse(brut)
      } catch (e) {
        throw new Error(`Patch illisible : ${e.message}`)
      }
      if (!Array.isArray(patch)) patch = patch?.corrections ?? patch?.mots ?? null
      if (!Array.isArray(patch)) throw new Error(`Le patch doit être une liste [{ i, texte }].`)

      const { changements, planPatche } = corrige(slug, patch)
      if (enJson) {
        console.log(JSON.stringify({ ok: true, slug, changements, plan_patche: planPatche }, null, 2))
        return
      }
      journal.titre(`Texte · ${slug}`)
      if (!changements.length) {
        journal.info(`Rien à changer : le patch dit la même chose que la transcription.`)
        return
      }
      for (const c of changements) {
        journal.detail(
          `${horodate(c.debutMs)}  « ${c.avant} » → ${c.apres ? `« ${c.apres} »` : '(retiré)'}` +
            (c.instantsRepartis ? '   · instants répartis dans la ligne' : '')
        )
      }
      journal.ok(`${changements.length} correction(s) écrite(s).`)
      journal.detail(
        planPatche
          ? `Le plan de montage est à jour : npm run rends -- ${slug}`
          : `Pas de plan de montage à corriger : npm run monte -- ${slug} --depuis=cale`
      )
      return
    }

    // -------------------------------------------------------------- affichage --
    const mots = motsDe(slug)
    if (!mots) throw new Error(`Pas de transcription pour « ${slug} ». Lance d'abord le montage.`)

    const cherche = options.cherche && options.cherche !== true ? String(options.cherche).toLowerCase() : null
    const filtres = mots.filter((m) => {
      if (drapeau(options, 'incertains') && !m.incertain) return false
      if (cherche && !String(m.texte).toLowerCase().includes(cherche)) return false
      return true
    })

    if (enJson) {
      console.log(JSON.stringify({ ok: true, slug, total: mots.length, mots: filtres }, null, 2))
      return
    }

    journal.titre(`Texte · ${slug}`)
    journal.info(`${mots.length} mots${filtres.length !== mots.length ? ` · ${filtres.length} affiché(s)` : ''}`)
    console.log('')
    for (const m of filtres) {
      console.log(
        `  ${String(m.i).padStart(4)}  ${horodate(m.debutMs).padStart(8)}  ${m.texte}` +
          (m.incertain ? '   ← Whisper hésitait' : '')
      )
    }
    console.log('')
    journal.detail(`Corriger : echo '[{"i":42,"texte":"devine"}]' | npm run texte -- ${slug} --corrige=-`)
  })
}
