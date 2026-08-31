#!/usr/bin/env node
/**
 * fal-video.mjs — générer un plan quand la banque d'images ne peut pas le donner.
 *
 * QUAND S'EN SERVIR, ET QUAND S'EN ABSTENIR.
 *
 * Un plan généré coûte de l'argent et prend une minute ; un plan de banque est
 * gratuit et immédiat. La règle de cette chaîne : on ne génère QUE ce que Pexels
 * ne sait pas donner — un hook qui doit frapper, une image mentale abstraite,
 * une scène trop précise pour exister en banque. Tout le reste vient de Pexels.
 *
 * POURQUOI LA FILE D'ATTENTE ET NON L'APPEL DIRECT.
 *
 * `fal.run` est synchrone : la requête reste ouverte pendant toute la
 * génération, une minute ou plus, et une coupure réseau perd le travail déjà
 * payé. La file rend un identifiant tout de suite ; on interroge ensuite, et
 * une interruption ne coûte rien de plus.
 *
 *   node outils/fal-video.mjs "<prompt>" --sortie=chemin.mp4
 *   node outils/fal-video.mjs "<prompt>" --modele=fal-ai/ltx-video --duree=5
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, assureDossier } from '../pipeline/lib/chemins.mjs'
import { journal, duree as formateDuree } from '../pipeline/lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from '../pipeline/lib/args.mjs'
import { pool } from '../pipeline/lib/trousseau.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
node outils/fal-video.mjs "<prompt>" [options]

  --sortie=<chemin>   où écrire le mp4 (obligatoire)
  --modele=<id>       défaut : fal-ai/ltx-video-13b-distilled
  --duree=5           secondes demandées
  --format=9:16       rapport d'image
  --oui               passe la confirmation de coût

Le prompt s'écrit en ANGLAIS : c'est la langue des modèles, et le français y
donne des résultats nettement plus pauvres.
`
)

/** Ce que coûte un plan, mesuré sur ce compte : ~0,18 $ quel que soit le modèle. */
const COUT_ESTIME_USD = 0.18
const SEUIL_SANS_ACCORD = 1.0

const cle = () => {
  const entrees = pool('fal')
  if (!entrees.length) throw new Error(`Aucune clé fal active dans config/keys.json`)
  return entrees[0].key
}

const AUTH = () => ({ Authorization: `Key ${cle()}`, 'content-type': 'application/json' })

/** Le solde, pour ne pas lancer une génération qui échouera au milieu. */
async function solde() {
  for (const url of [
    'https://rest.alpha.fal.ai/billing/user_balance',
    'https://api.fal.ai/billing/user_balance',
  ]) {
    try {
      const r = await fetch(url, { headers: AUTH() })
      if (r.ok) return Number(await r.text())
    } catch {
      /* on essaie l'adresse suivante */
    }
  }
  return null
}

/**
 * Génère un plan et rend le chemin du fichier écrit.
 *
 * Exportée : le montage pourra l'appeler le jour où `medias.mjs` saura demander
 * un plan généré au lieu de le chercher en banque.
 */
export async function genereVideo(prompt, { modele, dureeS, format, sortie, surEtape }) {
  const dire = surEtape ?? (() => {})

  const r = await fetch(`https://queue.fal.run/${modele}`, {
    method: 'POST',
    headers: AUTH(),
    body: JSON.stringify({
      prompt,
      num_frames: Math.round(dureeS * 24),
      aspect_ratio: format,
      resolution: '720p',
    }),
  })
  if (!r.ok) throw new Error(`fal a refusé la demande (HTTP ${r.status}) : ${(await r.text()).slice(0, 200)}`)
  const { request_id: id, status_url, response_url } = await r.json()
  dire(`demande ${id} en file`)

  const statut = status_url ?? `https://queue.fal.run/${modele}/requests/${id}/status`
  const resultat = response_url ?? `https://queue.fal.run/${modele}/requests/${id}`

  // On interroge sans se presser : une génération prend une à trois minutes, et
  // marteler l'API ne la fait pas aller plus vite.
  const debut = Date.now()
  for (let essai = 0; essai < 120; essai++) {
    await new Promise((r) => setTimeout(r, 3000))
    const s = await fetch(statut, { headers: AUTH() })
    if (!s.ok) continue
    const e = await s.json()
    if (e.status === 'COMPLETED') break
    if (e.status === 'FAILED') throw new Error(`génération échouée : ${JSON.stringify(e).slice(0, 200)}`)
    if (essai % 5 === 0) dire(`${e.status ?? '…'} · ${formateDuree((Date.now() - debut) / 1000)}`)
  }

  const f = await fetch(resultat, { headers: AUTH() })
  if (!f.ok) throw new Error(`résultat illisible (HTTP ${f.status})`)
  const d = await f.json()
  const url = d?.video?.url ?? d?.videos?.[0]?.url ?? d?.output?.url
  if (!url) throw new Error(`aucune vidéo dans la réponse : ${JSON.stringify(d).slice(0, 200)}`)

  const bin = await fetch(url)
  if (!bin.ok) throw new Error(`téléchargement impossible (HTTP ${bin.status})`)
  assureDossier(path.dirname(sortie))
  fs.writeFileSync(sortie, Buffer.from(await bin.arrayBuffer()))
  return sortie
}

await principal(async () => {
  const prompt = positionnels.join(' ').trim()
  if (!prompt) throw new Error(`Donne le prompt, en anglais, entre guillemets.`)
  if (!options.sortie || options.sortie === true) throw new Error(`Donne --sortie=chemin.mp4`)

  // `fal-ai/ltx-video` tout court n'accepte NI format NI resolution : il rend
  // toujours du 768x512 paysage, inutilisable sur une chaine verticale. La
  // variante distillee expose `aspect_ratio` et c'est ce qui la rend employable.
  const modele = String(options.modele ?? 'fal-ai/ltx-video-13b-distilled')
  const dureeS = nombre(options, 'duree', 5)
  const format = String(options.format ?? '9:16')
  const sortie = path.isAbsolute(options.sortie)
    ? options.sortie
    : path.join(CHEMINS.racine, options.sortie)

  journal.titre('Génération de plan')
  journal.info(`${modele} · ${dureeS} s · ${format}`)
  journal.detail(prompt)

  const reste = await solde()
  if (reste !== null) journal.info(`Solde fal : ${reste.toFixed(2)} $ · ce plan ≈ ${COUT_ESTIME_USD} $`)
  if (reste !== null && reste < COUT_ESTIME_USD * 2) {
    throw new Error(`Solde trop bas (${reste.toFixed(2)} $). Recharge avant de générer.`)
  }
  if (COUT_ESTIME_USD > SEUIL_SANS_ACCORD && !drapeau(options, 'oui')) {
    throw new Error(`Coût au-dessus du seuil. Relance avec --oui.`)
  }

  const debut = Date.now()
  await genereVideo(prompt, {
    modele,
    dureeS,
    format,
    sortie,
    surEtape: (m) => journal.detail(m),
  })

  const poids = fs.statSync(sortie).size / 1e6
  journal.ok(
    `${path.relative(CHEMINS.racine, sortie)} · ${poids.toFixed(1)} Mo · ` +
      `${formateDuree((Date.now() - debut) / 1000)}`
  )
})
