#!/usr/bin/env node
/**
 * script.mjs — déduire le script d'une prise déjà enregistrée.
 *
 * CE N'EST PAS « ÉCRIRE UN SCRIPT », ET LA DISTINCTION DÉCIDE DE TOUT.
 *
 * Écrire un script, c'est choisir un angle, un hook, une chute : du jugement,
 * qui reste dans la conversation (§2). Ici, rien de tout ça n'est à décider —
 * la prise est enregistrée, les mots sont dits, l'éditorial a eu lieu quand la
 * personne a parlé. Il ne reste qu'à donner au montage ce qu'il lui faut :
 * où couper, et quelle image poser sur quel passage.
 *
 * Le montage refusait de tourner sans `01-script.json`, et l'écran renvoyait
 * vers une commande à taper dans le fil pour une vidéo déjà tournée. C'était le
 * défaut de la première interface, revenu par une autre porte : un bouton
 * manquant là où il n'y avait aucune décision à prendre.
 *
 * CE QUI EST MÉCANIQUE RESTE DANS LE CODE, CE QUI DEMANDE LA LANGUE PART AU
 * MODÈLE.
 *
 * Le découpage en blocs se calcule ici : on suit la ponctuation et les silences
 * de la transcription, on vise des blocs de quelques secondes. Les ancres sont
 * découpées dans le texte réel — donc elles se calent toujours, par
 * construction.
 *
 * Ce qu'un programme ne sait pas faire, c'est écrire « femme qui encaisse une
 * nouvelle » en anglais à partir d'un paragraphe français. Le modèle ne reçoit
 * donc que cette question-là, bloc par bloc, et sa réponse ne peut pas casser
 * la structure : il remplit deux champs, il n'en invente aucun.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, dossierVideo, litJson, ecritJson } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, drapeau, aide, principal } from './lib/args.mjs'
import { demandeJson, cout } from './lib/cerveau.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
script.mjs — déduire le script d'une prise déjà enregistrée

  npm run ecris -- <slug>            écrit 01-script.json depuis le transcript
  npm run ecris -- <slug> --json     idem, et rend le compte rendu en JSON
  npm run ecris -- <slug> --force    réécrit un script qui existe déjà

Ce que ça fait : découpe la prise en blocs, et écrit pour chacun une requête
d'images en anglais et l'intention du passage. Ce que ça ne fait PAS : choisir
un angle ou un hook — ça s'écrit AVANT de tourner, en conversation, avec
/script.

Le découpage et les ancres sont calculés ici, donc ils se calent toujours. Seules
la requête et l'intention viennent du modèle.
`
)

/** Les sept intentions que le montage sait traduire en direction de plan. */
const INTENTIONS = ['posé', 'vif', 'grave', 'curieux', 'complice', 'tranchant', 'intime']

/** Un bloc vise cette durée. En dessous, on colle au suivant. */
const BLOC_CIBLE_MS = 7000
const BLOC_MIN_MS = 3500

principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug : npm run ecris -- <slug>`)

  const v = dossierVideo(slug)
  const transcript = litJson(v.transcript, null)
  if (!transcript?.mots?.length) {
    throw new Error(
      `Pas de transcription pour « ${slug} ». Il faut d'abord la prise et l'audio.`
    )
  }

  const existant = litJson(v.scriptJson, null)
  if (existant?.blocs?.length && !drapeau(options, 'force')) {
    journal.info(`« ${slug} » a déjà un script de ${existant.blocs.length} blocs.`)
    journal.detail(`--force pour le réécrire.`)
    return
  }

  // ------------------------------------------------------- le découpage ----
  const blocs = decoupe(transcript.mots)
  journal.titre(`Script déduit de la prise · ${slug}`)
  journal.info(
    `${transcript.mots.length} mots · ${blocs.length} blocs · ${duree(
      (blocs.at(-1)?.finMs ?? 0) / 1000
    )}`
  )

  // ------------------------------------------------ ce que le modèle fait --
  const chaine = litJson(CHEMINS.chaine, {})
  const avatar = chaine.avatar?.nom ?? chaine.avatar?.id ?? null
  const direction = chaine.identite_visuelle?.direction_plans ?? null

  journal.info(`Requêtes d'images…`)
  const { valeur, jetons } = await demandeJson(
    consigne(direction),
    question(blocs, { avatar, promesse: chaine.identite?.promesse ?? null }),
    { max: 400 * blocs.length + 500 }
  )

  const reponses = Array.isArray(valeur) ? valeur : valeur?.blocs ?? []
  if (reponses.length !== blocs.length) {
    throw new Error(
      `Le modèle a rendu ${reponses.length} entrées pour ${blocs.length} blocs. ` +
        `Relance : npm run ecris -- ${slug} --force`
    )
  }

  const prix = cout(jetons)
  if (prix !== null) journal.detail(`coût de l'appel : ${(prix * 100).toFixed(2)} centimes`)

  // ------------------------------------------------------- l'assemblage ----
  const script = {
    _lecture:
      `Déduit de la prise par \`npm run ecris\` : le découpage et les ancres viennent ` +
      `du transcript, les requêtes d'images du modèle. Un script écrit AVANT le tournage ` +
      `se fait en conversation avec /script.`,
    slug,
    format: existant?.format ?? chaine.formats ? existant?.format ?? 'short_faceless' : 'short_faceless',
    destination: existant?.destination ?? null,
    duree_cible_s: Math.round((blocs.at(-1)?.finMs ?? 0) / 1000),
    titre_travail: existant?.titre_travail ?? null,
    avatar,
    deduit_le: new Date().toISOString(),
    blocs: blocs.map((b, i) => {
      const r = reponses[i] ?? {}
      const intention = INTENTIONS.includes(r.intention) ? r.intention : 'posé'
      const requete = String(r.requete ?? '').trim() || 'person alone thinking, quiet room'
      return {
        id: b.role === 'corps' ? `corps-${i}` : b.role,
        role: b.role,
        texte: b.texte,
        intention,
        prise: 1,
        visuel: [
          // L'ANCRE EST DÉCOUPÉE DANS LE TEXTE RÉEL, DONC ELLE SE CALE TOUJOURS.
          //
          // Une ancre inventée par le modèle ne se retrouve pas dans la
          // transcription : le montage la signale « introuvable » et répartit
          // l'événement au hasard dans le bloc. En la prenant sur les premiers
          // mots du bloc, le problème ne peut pas exister.
          { type: 'broll', ancre: b.ancre, requete },
        ],
      }
    }),
    maillage: existant?.maillage ?? { vers: [], depuis: [] },
  }

  // GARDE-FOU : LE SCRIPT DOIT REDIRE EXACTEMENT LA PRISE.
  //
  // Si les textes des blocs, mis bout à bout, ne redonnent pas la transcription,
  // c'est que le découpage a perdu ou dupliqué des mots — et le montage calerait
  // ses sous-titres sur un texte qui n'est pas celui qu'on entend.
  const recolle = script.blocs.map((b) => b.texte).join(' ').replace(/\s+/g, ' ').trim()
  const attendu = transcript.mots.map((m) => m.texte).join(' ').replace(/\s+/g, ' ').trim()
  if (recolle !== attendu) {
    throw new Error(`Le découpage a altéré le texte de la prise — script non écrit.`)
  }

  ecritJson(v.scriptJson, script)
  journal.ok(`Script écrit : ${script.blocs.length} blocs, ${transcript.mots.length} mots.`)
  for (const b of script.blocs.slice(0, 4)) {
    journal.detail(`${b.role.padEnd(9)} ${b.intention.padEnd(10)} « ${b.visuel[0].requete} »`)
  }
  if (script.blocs.length > 4) journal.detail(`… et ${script.blocs.length - 4} autres`)
  journal.info(`Monte-la : npm run monte -- ${slug}`)

  if (drapeau(options, 'json')) {
    console.log(JSON.stringify({ ok: true, slug, blocs: script.blocs.length, cout: prix }, null, 2))
  }
})

/**
 * Découpe la transcription en blocs.
 *
 * On ferme un bloc sur une fin de phrase quand il a atteint sa durée minimale,
 * et de force au-delà de la cible : c'est la respiration de la prise qui décide,
 * pas un compte de mots.
 */
function decoupe(mots) {
  const blocs = []
  let courant = []
  const ferme = () => {
    if (!courant.length) return
    const texte = courant.map((m) => m.texte).join(' ')
    blocs.push({
      texte,
      debutMs: courant[0].debutMs ?? 0,
      finMs: courant.at(-1).finMs ?? 0,
      // Quatre mots suffisent à désigner un instant sans risque d'ambiguïté.
      ancre: courant.slice(0, 4).map((m) => m.texte).join(' '),
    })
    courant = []
  }

  for (const m of mots) {
    courant.push(m)
    const duree = (m.finMs ?? 0) - (courant[0].debutMs ?? 0)
    const finDePhrase = /[.!?…]$/.test(String(m.texte ?? ''))
    if ((finDePhrase && duree >= BLOC_MIN_MS) || duree >= BLOC_CIBLE_MS * 1.6) ferme()
  }
  ferme()

  // Le dernier bloc peut être un fragment : on le recolle au précédent plutôt
  // que de poser un plan de coupe sur deux mots.
  if (blocs.length > 1) {
    const dernier = blocs.at(-1)
    if (dernier.finMs - dernier.debutMs < BLOC_MIN_MS) {
      const avant = blocs[blocs.length - 2]
      avant.texte += ' ' + dernier.texte
      avant.finMs = dernier.finMs
      blocs.pop()
    }
  }

  return blocs.map((b, i) => ({
    ...b,
    role: i === 0 ? 'hook' : i === blocs.length - 1 ? 'chute' : 'corps',
  }))
}

function consigne(direction) {
  return [
    `Tu écris des requêtes pour une banque d'images (Pexels), à partir de passages`,
    `d'une vidéo en français. Une requête par passage.`,
    ``,
    `RÈGLES, dans l'ordre d'importance :`,
    `1. En ANGLAIS, 4 à 8 mots, concrète et filmable. Pas de métaphore, pas d'abstraction :`,
    `   « trust », « relationship » ne rendent aucune image ; « woman looking at phone at night » si.`,
    `2. Un SUJET HUMAIN et une ACTION chaque fois que c'est possible. Un verbe d'action`,
    `   (« walks », « pours », « slams ») rend des plans qui bougent ; un verbe d'état`,
    `   (« thinks », « waits ») rend des images figées.`,
    `3. Le TOUT PREMIER passage décide si les autres seront vus : demande-lui un gros plan`,
    `   de visage portant une émotion lisible. Les suivants, non — trente portraits d'affilée`,
    `   font un diaporama.`,
    `4. VARIE. Deux passages voisins ne doivent pas donner la même scène.`,
    `5. Pas de texte à l'image : ne demande jamais d'écriteau, d'enseigne ou de sous-titre.`,
    direction ? `6. Direction de la chaîne, à respecter : ${direction}` : null,
    ``,
    `Donne aussi l'INTENTION de chaque passage, parmi exactement :`,
    INTENTIONS.join(', '),
    ``,
    `Réponds UNIQUEMENT par un tableau JSON, un objet par passage, dans l'ordre :`,
    `[{"requete": "...", "intention": "..."}]`,
  ]
    .filter(Boolean)
    .join('\n')
}

function question(blocs, { avatar, promesse }) {
  const entete = [
    avatar ? `Avatar de la chaîne : ${avatar}.` : null,
    promesse ? `Promesse de la chaîne : ${promesse}` : null,
    ``,
    `${blocs.length} passages, dans l'ordre :`,
    ``,
  ].filter((l) => l !== null)

  const corps = blocs.map((b, i) => `${i + 1}. [${b.role}] ${b.texte}`)
  return [...entete, ...corps].join('\n')
}
