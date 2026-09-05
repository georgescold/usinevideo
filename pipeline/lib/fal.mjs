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
