#!/usr/bin/env node
/**
 * importe-cles.mjs — récupère les clés d'un ancien projet et les range ici.
 *
 * Lit un trousseau au format de l'ancien projet (`.keys.json`) et/ou un `.env`,
 * vérifie chaque clé auprès du service, détermine son palier, puis l'ajoute à
 * `config/keys.json` sans doublon.
 *
 * Les clés ne sont jamais affichées en clair, ni ici, ni dans les logs.
 *
 *   node outils/importe-cles.mjs "C:\chemin\vers\ancien-projet"
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, litJson, ecritJson } from '../pipeline/lib/chemins.mjs'
import { journal, masque } from '../pipeline/lib/journal.mjs'
import { quota } from '../pipeline/lib/elevenlabs.mjs'

const source = process.argv[2]
if (!source) {
  console.log(`Usage : node outils/importe-cles.mjs <dossier de l'ancien projet>`)
  process.exit(1)
}

/** Toutes les clés reconnaissables d'un dossier, dédoublonnées. */
function recolte(dossier) {
  const trouvees = new Map()

  const ajoute = (cle, provenance) => {
    if (!cle || trouvees.has(cle)) return
    trouvees.set(cle, provenance)
  }

  const trousseau = litJson(path.join(dossier, '.keys.json'), null)
  if (trousseau?.elevenlabs) {
    for (const e of trousseau.elevenlabs) ajoute(e.key || e.apiKey || e.value, e.label || 'ancien trousseau')
  }

  for (const nom of ['.env', '.env.local']) {
    const p = path.join(dossier, nom)
    if (!fs.existsSync(p)) continue
    const texte = fs.readFileSync(p, 'utf8')
    for (const m of texte.matchAll(/\bsk_[A-Za-z0-9]{24,}/g)) ajoute(m[0], nom)
  }

  return [...trouvees.entries()].map(([key, provenance]) => ({ key, provenance }))
}

const candidates = recolte(source)
if (candidates.length === 0) {
  journal.attention(`Aucune clé ElevenLabs trouvée dans ${source}.`)
  process.exit(0)
}

journal.titre(`${candidates.length} clés trouvées — vérification auprès d'ElevenLabs`)

const trousseau = litJson(CHEMINS.trousseau, {})
trousseau.elevenlabs = trousseau.elevenlabs || []
const dejaLa = new Set(trousseau.elevenlabs.map((e) => e.key))

let ajoutees = 0
let mortes = 0
let doublons = 0

for (const [i, c] of candidates.entries()) {
  if (dejaLa.has(c.key)) {
    doublons++
    journal.detail(`${masque(c.key)} — déjà dans le trousseau`)
    continue
  }
  try {
    const q = await quota(c.key)
    trousseau.elevenlabs.push({
      key: c.key,
      label: `eleven-${String(trousseau.elevenlabs.length + 1).padStart(2, '0')}`,
      tier: q.commercial ? 'paid' : 'free',
      enabled: true,
    })
    dejaLa.add(c.key)
    ajoutees++
    journal.ok(
      `${masque(c.key)} — palier ${q.palier}, ${q.restant} crédits ` +
        `(${q.minutesSts.toFixed(1)} min de conversion)` +
        (q.commercial ? '' : ' — SANS licence commerciale')
    )
  } catch (e) {
    mortes++
    journal.erreur(`${masque(c.key)} — refusée (${e.message.split('\n')[0]})`)
  }
  if (i < candidates.length - 1) await new Promise((r) => setTimeout(r, 250))
}

// Les clés payantes d'abord : le trousseau les prendra en priorité.
trousseau.elevenlabs.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'paid' ? -1 : 1))
ecritJson(CHEMINS.trousseau, trousseau)

journal.titre('Bilan')
journal.info(`${ajoutees} ajoutées · ${doublons} déjà présentes · ${mortes} refusées`)
const payantes = trousseau.elevenlabs.filter((e) => e.tier === 'paid').length
if (payantes === 0 && ajoutees > 0) {
  journal.attention(
    `Aucune clé payante. Le palier gratuit d'ElevenLabs n'accorde pas de licence ` +
      `commerciale : garde ces clés pour les essais, pas pour une chaîne monétisée.`
  )
}
