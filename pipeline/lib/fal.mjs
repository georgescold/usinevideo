/**
 * fal.mjs — la plomberie commune à tout ce qui passe par fal.
 *
 * POURQUOI CE FICHIER EXISTE.
 *
 * Téléverser un fichier et attendre une file d'attente, ce n'est pas du métier :
 * c'est de la tuyauterie, et elle était recopiée dans `copie.mjs`. Deux copies
 * d'un même code divergent à la première retouche — celle qu'on corrige et
 * celle qu'on oublie. Le troisième appelant a rendu la chose évidente.
 *
 * `outils/fal-video.mjs` garde ce qui lui est propre : la génération de plans,
 * son devis, ses seuils. Ici, seulement le transport.
 */

import fs from 'node:fs'
import path from 'node:path'

import { pool } from './trousseau.mjs'

const dors = (ms) => new Promise((r) => setTimeout(r, ms))

export const cleFal = () => {
  const entrees = pool('fal')
  if (!entrees.length) throw new Error(`Aucune clé fal active dans config/keys.json`)
  return entrees[0].key
}

/**
 * Un appel réseau qui ne renonce pas au premier hoquet.
 *
 * Une génération dure des minutes : perdre le travail déjà payé parce qu'une
 * requête d'état a échoué serait absurde. On réessaie, sans se presser.
 */
export async function essaie(url, opts, n = 6) {
  for (let i = 0; i < n; i++) {
    try {
      return await fetch(url, opts ?? { headers: { authorization: 'Key ' + cleFal() } })
    } catch {
      await dors(4000)
    }
  }
  return null
}

/** Pose un fichier sur le stockage de fal et rend son adresse. */
export async function televerse(fichier, type, nom = null) {
  const cle = cleFal()
  const i = await essaie(
    'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3',
    {
      method: 'POST',
      headers: { authorization: 'Key ' + cle, 'content-type': 'application/json' },
      body: JSON.stringify({ content_type: type, file_name: nom ?? path.basename(fichier) }),
    }
  )
  const j = await i.json()
  await essaie(j.upload_url, {
    method: 'PUT',
    headers: { 'content-type': type },
    body: fs.readFileSync(fichier),
  })
  return j.file_url
}

/**
 * Ce qu'une réponse de fal dit vraiment, en une ligne lisible.
 *
 * Les refus de modération arrivent parfois en 200, avec une adresse de
 * documentation glissée là où on attend un résultat. Un échec qui ne dit pas
 * pourquoi est un cul-de-sac : on ne sait pas s'il faut réessayer, reformuler
 * ou changer de modèle.
 */
export function resumeFal(texte) {
  const t = String(texte ?? '')
  if (/content_policy|nsfw|safety/i.test(t)) {
    return `refus de modération (content_policy_violation) — le prompt ou la référence a été jugé non conforme`
  }
  return t.replace(/\s+/g, ' ').slice(0, 300) || 'réponse vide'
}

/**
 * Poste un travail dans la file de fal et attend sa réponse, en texte brut.
 *
 * Le texte brut plutôt que le JSON : l'appelant sait ce qu'il cherche dedans,
 * et une réponse mal formée doit pouvoir être montrée telle quelle plutôt que
 * de faire échouer un `JSON.parse` sans rien dire.
 */
export async function travailFal(modele, corps, { etiquette = modele, tours = 300, pas = 6000 } = {}) {
  const cle = cleFal()
  const r = await essaie('https://queue.fal.run/' + modele, {
    method: 'POST',
    headers: { authorization: 'Key ' + cle, 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const j = await r.json()
  if (!j.request_id) throw new Error(`${etiquette} refusé : ${resumeFal(JSON.stringify(j))}`)

  const u = j.status_url.replace('/status', '')
  for (let i = 0; i < tours; i++) {
    await dors(pas)
    const s = await essaie(u + '/status')
    if (!s) continue
    const e = await s.json()
    if (e.status === 'COMPLETED') return await (await essaie(u)).text()
    if (e.status === 'FAILED') {
      const t = await (await essaie(u))?.text().catch(() => '')
      throw new Error(`${etiquette} échoué : ${resumeFal(t)}`)
    }
  }
  throw new Error(`${etiquette} : délai dépassé`)
}

/** Le modèle de TEXTE, sans image. Même passerelle que la vision. */
export const MODELE_TEXTE = 'fal-ai/any-llm'

/**
 * Pose une question de texte, et rend la réponse.
 *
 * POURQUOI CE CHEMIN EXISTE, ALORS QUE `cerveau.mjs` EXISTE DÉJÀ.
 *
 * Le seul appel de langage du pipeline — traduire un passage en requête
 * d'images — passait par l'API Anthropic, et par elle seule. Sans clé
 * `sk-ant-api…`, la déduction de script s'arrêtait net sur un 401 : le
 * transcript était là, le découpage se calculait, et il manquait quatre mots
 * d'anglais par bloc.
 *
 * Or fal expose la même famille de modèles derrière une clé qu'on a déjà pour
 * les plans générés. Ce n'est pas un second cerveau : c'est le même travail,
 * par une autre porte, quand la première est fermée.
 *
 * Lève au lieu de rendre `null` : contrairement à la vision, cet appel n'est pas
 * un bonus — sans réponse, il n'y a pas de requête d'images, donc pas de plan.
 */
export async function texte(consigne, question, { modele = 'google/gemini-flash-1.5' } = {}) {
  const t = await travailFal(
    MODELE_TEXTE,
    { prompt: question, system_prompt: consigne, model: modele },
    { etiquette: 'texte', tours: 60, pas: 2500 }
  )
  const sortie = String(JSON.parse(t).output ?? '').trim()
  if (!sortie) throw new Error(`fal n'a rien répondu.`)
  return sortie
}

/** Le modèle qui REGARDE une image et répond en texte. */
export const MODELE_VISION = 'fal-ai/any-llm/vision'

/**
 * Pose une question sur une image, et rend la réponse en une ligne.
 *
 * Rend `null` plutôt que de lever : un appel de vision est toujours un BONUS —
 * il précise un prompt, il ne le conditionne pas. Faire échouer une génération
 * déjà payée parce qu'un modèle de texte n'a pas répondu serait un mauvais
 * échange.
 */
export async function vision(urlImage, question, { modele = 'google/gemini-flash-1.5' } = {}) {
  try {
    const t = await travailFal(
      MODELE_VISION,
      { prompt: question, image_url: urlImage, model: modele },
      { etiquette: 'vision', tours: 40, pas: 2500 }
    )
    const texte = String(JSON.parse(t).output ?? '').replace(/\s+/g, ' ').trim()
    return texte || null
  } catch {
    return null
  }
}

/**
 * CE QU'UN PLAN GÉNÉRÉ NE DOIT JAMAIS CONTENIR.
 *
 * Les modèles vidéo écrivent — des enseignes, des sous-titres, des filigranes,
 * des lettres qui ne veulent rien dire. Sur une chaîne dont les sous-titres sont
 * calés mot à mot, un plan qui porte son propre texte crée deux écritures à
 * l'écran, dont une illisible. C'est le même défaut que les cartons et les
 * infographies, bannis le 28 août pour cette raison exacte.
 *
 * On le demande donc explicitement : un modèle ne devine pas ce qu'on ne veut
 * pas.
 */
export const SANS_TEXTE =
  'text, letters, words, captions, subtitles, watermark, logo, signage, ' +
  'typography, numbers, handwriting, poster, banner'

/**
 * LA MÊME CHOSE, DITE À L'ENDROIT.
 *
 * `SANS_TEXTE` est un prompt NÉGATIF : une liste de ce qu'on refuse, que le
 * modèle reçoit dans un champ à part. Tous les modèles n'ont pas ce champ —
 * `hailuo-03/reference-to-video`, celui de la copie, n'en a pas. Sur ceux-là il
 * faut le demander dans le prompt, et une liste de mots recopiée telle quelle y
 * ferait exactement l'inverse : « text, letters, words » dans un prompt positif
 * DEMANDE du texte.
 *
 * D'où deux formulations pour une seule règle, et le nom dit laquelle est
 * laquelle.
 */
export const AUCUN_TEXTE_A_L_ECRAN =
  'absolutely no text, no captions, no subtitles, no watermark, no logo, ' +
  'no letters or writing of any kind anywhere in the frame'

/**
 * ET LE TEXTE DE LA RÉFÉRENCE N'EST PAS LA SCÈNE.
 *
 * Une vidéo rapatriée de TikTok ou d'Instagram arrive presque toujours avec son
 * accroche incrustée, ses sous-titres automatiques et le filigrane de la
 * plateforme. Le modèle regarde cette image et la prend pour ce qu'il doit
 * reproduire : il rejoue les bandeaux en même temps que le mouvement, en
 * charabia. Il faut donc lui dire que ces couches ont été ajoutées après coup —
 * ce qu'on lui emprunte, c'est le cadrage et l'énergie, pas l'habillage.
 */
export const IGNORE_LE_TEXTE_INCRUSTE =
  'The reference video may show burned-in captions, hook text, emoji, ' +
  'interface elements or a platform watermark: these are overlays added ' +
  'afterwards, not part of the filmed scene. Ignore them completely and ' +
  'reproduce only the action filmed behind them.'

// ---------------------------------------------------------------------------
//  Fabriquer un plan de coupe
// ---------------------------------------------------------------------------
//
// LE PROMPT D'UN PLAN GÉNÉRÉ VIT ICI, ET NULLE PART AILLEURS.
//
// Il existait dans `plan-broll.mjs`, où l'on échange un plan à la main. Le
// comblage automatique en avait besoin aussi — et le recopier aurait créé deux
// doctrines de prompt qui divergeraient à la première correction : on corrige
// l'émotion d'un côté, l'autre continue de rendre des plans froids, et rien ne
// dit lequel des deux a servi.
//
// `medias.mjs` ne peut pas importer `plan-broll.mjs` — celui-ci importe déjà
// `medias.mjs`, et le cycle casse l'import. D'où ce module, que les deux voient.

/** L'intention du script, traduite en direction d'image. */
const TONS = {
  'posé': 'calm, restrained, contemplative mood',
  'vif': 'energetic, alive, dynamic mood',
  'grave': 'sombre, heavy, serious mood',
  'curieux': 'intrigued, questioning, searching mood',
  'complice': 'warm, intimate, knowing mood',
  'tranchant': 'stark, decisive, high contrast mood',
  'intime': 'intimate, close, tender mood',
}

/**
 * Le prompt d'un plan de coupe généré.
 *
 * UN PLAN NE MONTRE PAS LE PROPOS, IL EN PORTE L'ÉMOTION. « hands typing
 * message smartphone » décrit une scène et ne dit rien de ce qu'on doit
 * ressentir en la voyant ; le même geste filmé froid ou filmé intime ne raconte
 * pas la même chose. L'intention est déjà écrite dans le script, bloc par bloc —
 * on la traduit plutôt que de la deviner.
 *
 * L'OUVERTURE DEMANDE UN VISAGE, LES AUTRES NON. C'est le seul plan dont dépend
 * le fait que les autres soient vus. Sur les suivants, imposer un visage ferait
 * trente portraits d'affilée, c'est-à-dire un diaporama.
 */
export function promptDePlan({ requete, intention = null, direction = null, ouverture = false }) {
  const ton = TONS[intention] ?? 'emotionally expressive mood'
  let emotion = `${ton}, conveys the feeling of the moment, ${AUCUN_TEXTE_A_L_ECRAN}`
  if (ouverture) emotion += `, close-up on a human face, the emotion clearly readable in the eyes`
  return [requete, emotion, direction].filter(Boolean).join(', ')
}

/**
 * LE CATALOGUE DES MODÈLES VIDÉO, AVEC LEUR PRIX ET LEUR FORMULAIRE.
 *
 * Le modèle était une constante, et le prix un nombre écrit à côté. Les deux
 * étaient faux dès qu'on changeait de modèle — et ils ne se changeaient qu'en
 * éditant le code, ce que la règle du §2 interdit désormais.
 *
 * TROIS CHOSES VARIENT D'UN MODÈLE À L'AUTRE, et les ignorer casse en silence :
 *
 * 1. LA FORME DU CORPS. LTX veut `num_frames` ; Seedance et MiniMax veulent
 *    `duration` en secondes. Envoyer l'un à l'autre ne lève pas toujours : le
 *    champ inconnu est ignoré et on paie une vidéo de la durée par défaut.
 * 2. LE PROMPT NÉGATIF. Seedance 2.5 et MiniMax H3 Max n'en ont PAS. La consigne
 *    « aucun texte à l'image » doit alors passer dans le prompt POSITIF —
 *    `AUCUN_TEXTE_A_L_ECRAN`, qui existe exactement pour ça. Recopier
 *    `SANS_TEXTE` dans un prompt positif retournerait la consigne : elle se lit
 *    « text, letters, words, captions », elle en DEMANDE.
 * 3. L'AUDIO. Seedance en génère par défaut. Sur un plan de coupe, la bande son
 *    est la voix off : un plan qui apporte la sienne se superpose à elle.
 *
 * Les prix viennent des pages tarifaires de fal, relevées le 7 septembre 2026.
 * Ils changent : c'est une estimation pour le devis, pas une facture.
 */
export const MODELES_PLAN = {
  'fal-ai/ltx-video-13b-distilled': {
    nom: 'LTX Video 13B distilled',
    resume: 'rapide et le moins cher — le défaut',
    prix: { mode: 'video', usd: 0.04 },
    corps: ({ prompt, secondes, format, sansTexte }) => ({
      prompt,
      negative_prompt: sansTexte,
      num_frames: Math.round(secondes * 24),
      aspect_ratio: format,
      resolution: '720p',
    }),
  },
  'bytedance/seedance-2.5/text-to-video': {
    nom: 'Seedance 2.5',
    resume: 'le plus abouti — et de loin le plus cher',
    prix: { mode: 'seconde', usd: 0.473 },
    sansNegatif: true,
    corps: ({ prompt, secondes, format }) => ({
      prompt,
      duration: String(Math.round(secondes)),
      resolution: '720p',
      aspect_ratio: format,
      // La voix off est la nôtre. Un plan qui apporte sa propre bande son se
      // superpose à elle, et rien en aval ne la retire.
      generate_audio: false,
    }),
  },
  'minimax/h3-max/text-to-video': {
    nom: 'MiniMax H3 Max',
    resume: 'bon compromis qualité/prix',
    prix: { mode: 'seconde', usd: 0.02 },
    sansNegatif: true,
    corps: ({ prompt, secondes, format }) => ({
      prompt,
      duration: Math.round(secondes),
      resolution: '768P',
      aspect_ratio: format,
      prompt_expansion_mode: 'balanced',
    }),
  },
  'alibaba/wan-3.0-prime/text-to-video': {
    nom: 'Wan 3.0 Prime',
    resume: 'cinématique, cher à la seconde',
    prix: { mode: 'seconde', usd: 0.14 },
    sansNegatif: true,
    corps: ({ prompt, secondes, format }) => ({
      prompt,
      duration: Math.round(secondes),
      resolution: '720p',
      aspect_ratio: format,
    }),
  },
}

/** Le modèle employé quand la chaîne n'en choisit pas. */
export const MODELE_PLAN_DEFAUT = 'fal-ai/ltx-video-13b-distilled'

/** Le modèle retenu par la chaîne, ou le défaut. */
export function modeleDePlan(chaine = null) {
  const voulu = chaine?.identite_visuelle?.modele_video
  return voulu && MODELES_PLAN[voulu] ? voulu : MODELE_PLAN_DEFAUT
}

/**
 * Ce que coûte UN plan avec ce modèle, en dollars. Le §7 impose de l'annoncer.
 *
 * Un modèle facturé à la seconde coûte donc plus cher sur un plan long : le
 * devis doit voir la durée, pas un forfait.
 */
export function coutDUnPlan(modele = MODELE_PLAN_DEFAUT, secondes = 5) {
  const m = MODELES_PLAN[modele] ?? MODELES_PLAN[MODELE_PLAN_DEFAUT]
  return m.prix.mode === 'seconde' ? m.prix.usd * secondes : m.prix.usd
}

/** Le corps de requête que CE modèle attend. Voir le commentaire du catalogue. */
export function corpsDeGeneration(modele, { prompt, secondes, format, sansTexte }) {
  const m = MODELES_PLAN[modele] ?? MODELES_PLAN[MODELE_PLAN_DEFAUT]
  return m.corps({ prompt, secondes, format, sansTexte })
}

/** Ce modèle sait-il refuser ? Sinon la consigne passe dans le prompt positif. */
export const accepteUnNegatif = (modele) =>
  !(MODELES_PLAN[modele] ?? MODELES_PLAN[MODELE_PLAN_DEFAUT]).sansNegatif

// Gardés pour ce qui les importe encore : le défaut, et son prix.
export const COUT_PLAN_USD = 0.04
export const MODELE_PLAN = MODELE_PLAN_DEFAUT

/** La durée d'un plan généré, bornée par ce que le modèle sait rendre. */
export const dureeDePlan = (dureeMs) =>
  Math.max(2, Math.min(8, Math.round(((dureeMs ?? 4000) / 1000) * 10) / 10))
