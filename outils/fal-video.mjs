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
import { pathToFileURL } from 'node:url'

const { options, positionnels } = litArgs()

// IMPORTER UNE COMMANDE NE DOIT RIEN EXÉCUTER.
//
// `principal()` était gardé, `aide()` ne l'était pas : `npm run copie -- --aide`
// affichait l'aide de ce fichier-ci, parce que la copie l'importe. Le garde vaut
// pour tout ce qui parle ou sort, pas seulement pour le point d'entrée.
const EST_LA_COMMANDE =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url

if (EST_LA_COMMANDE) aide(
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

/**
 * Le solde, pour ne pas lancer une génération qui échouera au milieu.
 *
 * Exporté : l'atelier l'affiche en permanence dans son en-tête. Un budget qu'on
 * ne voit qu'en le demandant ne se regarde jamais — on le découvre quand une
 * génération s'arrête au milieu.
 */
export async function soldeFal() {
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
// Les trois formulations de la règle « aucun texte » vivent dans `lib/fal.mjs` :
// elles servent aussi à la copie, et un fichier de commande ne s'importe pas.
export { SANS_TEXTE, AUCUN_TEXTE_A_L_ECRAN, IGNORE_LE_TEXTE_INCRUSTE } from '../pipeline/lib/fal.mjs'
import { SANS_TEXTE } from '../pipeline/lib/fal.mjs'
export async function genereVideo(
  prompt,
  { modele, dureeS, format, sortie, surEtape, sansTexte = SANS_TEXTE }
) {
  const dire = surEtape ?? (() => {})

  // CHAQUE MODÈLE A SON FORMULAIRE, ET LE CORPS VIENT DU CATALOGUE.
  //
  // Le corps était écrit en dur pour LTX : `num_frames`, `negative_prompt`,
  // `resolution: '720p'`. Seedance et MiniMax veulent `duration` en secondes et
  // n'ont pas de prompt négatif ; leur envoyer `num_frames` ne lève pas — le
  // champ inconnu est ignoré, et on paie une vidéo de la durée par DÉFAUT du
  // modèle, pas celle qu'on a demandée. C'est le genre d'écart qu'on découvre
  // au montage, sur un plan qui ne tient pas dans son trou.
  const { corpsDeGeneration } = await import('../pipeline/lib/fal.mjs')
  const r = await fetch(`https://queue.fal.run/${modele}`, {
    method: 'POST',
    headers: AUTH(),
    body: JSON.stringify(
      corpsDeGeneration(modele, { prompt, secondes: dureeS, format, sansTexte })
    ),
  })
  if (!r.ok) throw new Error(`fal a refusé la demande (HTTP ${r.status}) : ${(await r.text()).slice(0, 200)}`)
  const { request_id: id, status_url, response_url } = await r.json()
  dire(`demande ${id} en file`)

  const statut = status_url ?? `https://queue.fal.run/${modele}/requests/${id}/status`
  const resultat = response_url ?? `https://queue.fal.run/${modele}/requests/${id}`

  // On interroge sans se presser : une génération prend une à trois minutes, et
  // marteler l'API ne la fait pas aller plus vite.
  //
  // MAIS ON EN REND COMPTE SOUVENT, ET C'EST DIFFÉRENT.
  //
  // Le compte rendu ne coûte rien — c'est une ligne écrite en local, pas un
  // appel de plus. Il ne parlait qu'une fois toutes les quinze secondes : sur
  // un écran qui attend, quinze secondes de silence passent pour un blocage, et
  // on ferme la fenêtre. On dit donc tout de suite chaque CHANGEMENT d'état, et
  // sinon on bat la mesure toutes les six secondes.
  const debut = Date.now()
  const ETATS = {
    IN_QUEUE: 'en file d’attente chez fal',
    IN_PROGRESS: 'génération en cours',
    COMPLETED: 'terminé',
  }
  dire(`demande envoyée — une génération prend 1 à 3 min`)
  let dernierEtat = null
  let derniereLigne = Date.now()

  for (let essai = 0; essai < 120; essai++) {
    await new Promise((r) => setTimeout(r, 3000))
    const s = await fetch(statut, { headers: AUTH() })
    if (!s.ok) continue
    const e = await s.json()
    if (e.status === 'COMPLETED') break
    if (e.status === 'FAILED') throw new Error(`génération échouée : ${JSON.stringify(e).slice(0, 200)}`)

    const change = e.status !== dernierEtat
    const assezAttendu = Date.now() - derniereLigne >= 6000
    if (change || assezAttendu) {
      dernierEtat = e.status
      derniereLigne = Date.now()
      const ecoule = formateDuree((Date.now() - debut) / 1000)
      const place = Number.isFinite(e.queue_position) ? ` · ${e.queue_position} devant` : ''
      dire(`${ETATS[e.status] ?? e.status ?? '…'}${place} · ${ecoule}`)
    }
  }
  dire(`téléchargement du plan…`)

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

// CE FICHIER EST AUSSI UNE BIBLIOTHÈQUE, DEPUIS QU'ON Y LIT LE SOLDE.
//
// `cles.mjs` importe `soldeFal` pour l'afficher dans l'atelier. Sans ce garde,
// l'import exécutait le programme entier et sortait sur « Donne le prompt » —
// une erreur qui ne parle pas du tout de ce qu'on faisait.
// `process.argv[1]` est absent sous `node -e` et au REPL : sans ce garde,
// importer ce module depuis là plantait avant d'avoir rien exécuté.
if (EST_LA_COMMANDE) {
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

  const reste = await soldeFal()
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
}
