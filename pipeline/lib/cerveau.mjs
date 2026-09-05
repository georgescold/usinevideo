/**
 * cerveau.mjs — poser une question à Claude depuis le pipeline.
 *
 * CE QUE CE MODULE A LE DROIT DE FAIRE, ET CE QU'IL N'A PAS.
 *
 * Le CLAUDE.md §2 sépare JUGER et EXÉCUTER : ce qui se discute reste dans la
 * conversation, ce qui se voit passe par l'atelier. Ce module ne déplace pas
 * cette ligne — il sert les tâches où le jugement est DÉJÀ FAIT et où il ne
 * reste qu'une traduction mécanique que seule la langue sait faire.
 *
 * L'exemple qui l'a motivé : une prise est enregistrée, les mots sont dits, le
 * découpage est déterminé par les silences. Il ne reste qu'à écrire, pour
 * chaque passage, une requête d'images en anglais. Ce n'est pas un choix
 * éditorial — l'éditorial a eu lieu quand la personne a parlé — c'est une
 * traduction. La demander dans le fil obligeait à taper une commande pour
 * quelque chose qui n'appelle aucune décision.
 *
 * Écrire un script depuis rien, choisir un angle, juger une performance :
 * ça reste dans la conversation, et ça doit y rester.
 */

import { avecCle, clefGrillee } from './trousseau.mjs'

const SERVICE = 'claude'
const MODELE = 'claude-sonnet-4-5'
const URL = 'https://api.anthropic.com/v1/messages'

/**
 * Pose une question et rend la réponse en texte.
 *
 * Le trousseau tourne entre les clés si l'une est épuisée ; une erreur de quota
 * ou d'authentification bascule sur la suivante, une erreur de forme remonte
 * telle quelle — un mauvais prompt ne doit pas consommer toutes les clés.
 */
export async function demande(consigne, question, { max = 4000, modele = MODELE } = {}) {
  return avecCle(SERVICE, async (cle) => {
    const r = await fetch(URL, {
      method: 'POST',
      headers: {
        'x-api-key': cle,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modele,
        max_tokens: max,
        system: consigne,
        messages: [{ role: 'user', content: question }],
      }),
    })

    if (r.status === 401 || r.status === 403) {
      throw clefGrillee(`clé Claude refusée (${r.status})`, { definitif: true })
    }
    if (r.status === 429 || r.status >= 500) {
      throw clefGrillee(`Claude indisponible (${r.status})`)
    }
    const j = await r.json()
    if (!r.ok) {
      throw new Error(`Claude a refusé la demande (${r.status}) : ${j.error?.message ?? '—'}`)
    }

    const texte = (j.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    return { texte, jetons: j.usage ?? null }
  })
}

/**
 * Idem, mais la réponse DOIT être du JSON.
 *
 * Un modèle qui répond « Voici le JSON demandé : ```json … ``` » est un modèle
 * qui a bien travaillé et mal obéi. On enlève l'emballage plutôt que d'échouer
 * dessus — et on échoue seulement si ce qui reste n'est pas lisible.
 */
export async function demandeJson(consigne, question, options = {}) {
  const { texte, jetons } = await demande(consigne, question, options)
  const nu = texte
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return { valeur: JSON.parse(nu), jetons }
  } catch {
    const de = nu.indexOf('[') >= 0 ? Math.min(...[nu.indexOf('['), nu.indexOf('{')].filter((i) => i >= 0)) : nu.indexOf('{')
    const a = Math.max(nu.lastIndexOf(']'), nu.lastIndexOf('}'))
    if (de >= 0 && a > de) {
      try {
        return { valeur: JSON.parse(nu.slice(de, a + 1)), jetons }
      } catch { /* on tombe dans l'erreur ci-dessous */ }
    }
    throw new Error(`Claude n'a pas rendu de JSON lisible :\n${nu.slice(0, 300)}`)
  }
}

/** Le coût d'un échange, en dollars. Sonnet 4.5 : 3 $ / 15 $ le million. */
export function cout(jetons) {
  if (!jetons) return null
  const entree = (jetons.input_tokens ?? 0) * 3e-6
  const sortie = (jetons.output_tokens ?? 0) * 15e-6
  return entree + sortie
}

/** Y a-t-il de quoi interroger Claude ? */
export function cerveauDisponible() {
  try {
    // `pool` lève si le trousseau est absent ; ici on veut juste un booléen.
    return import('./trousseau.mjs').then(({ pool }) => pool(SERVICE).length > 0).catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}
