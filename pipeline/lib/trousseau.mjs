/**
 * trousseau.mjs — un pool de clés par service, avec bascule automatique.
 *
 * Principe : on ne choisit jamais une clé à la main. On demande au trousseau
 * d'exécuter un appel, il le tente avec la première clé disponible et repart
 * sur la suivante si celle-là est épuisée, révoquée ou limitée. Les clés
 * grillées sont mises au frigo dans config/.trousseau-etat.json pour ne pas
 * les retenter à chaque commande.
 *
 * Priorité : une clé `tier: "paid"` passe toujours avant une clé `tier: "free"`.
 * Cela compte pour ElevenLabs, dont le palier gratuit n'accorde aucune licence
 * commerciale.
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, litJson, ecritJson } from './chemins.mjs'
import { journal, masque } from './journal.mjs'

const FICHIER_ETAT = path.join(CHEMINS.config, '.trousseau-etat.json')

/** Durée du frigo par défaut : une clé épuisée est retentée dans 6 h. */
const FRIGO_MS = 6 * 60 * 60 * 1000
/** Une clé révoquée ou invalide reste au frigo 30 jours. */
const FRIGO_MORT_MS = 30 * 24 * 60 * 60 * 1000

export class TrousseauVide extends Error {
  constructor(service, raison) {
    super(
      `Aucune clé ${service} disponible.\n${raison}\n` +
        `Ajoute ou réactive une clé dans config/keys.json, puis relance.`
    )
    this.name = 'TrousseauVide'
    this.service = service
  }
}

/** Marque une erreur comme « cette clé est morte, passe à la suivante ». */
export function clefGrillee(message, { definitif = false } = {}) {
  const e = new Error(message)
  e.clefGrillee = true
  e.definitif = definitif
  return e
}

function litEtat() {
  return litJson(FICHIER_ETAT, { frigo: {} })
}

function ecritEtat(etat) {
  ecritJson(FICHIER_ETAT, etat)
}

function empreinte(cle) {
  // Identifiant stable et non réversible pour l'état, afin de ne jamais écrire
  // une clé en clair dans un fichier de suivi.
  let h = 0
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) | 0
  return `k${(h >>> 0).toString(36)}`
}

function auFrigo(cle, etat) {
  const e = etat.frigo[empreinte(cle)]
  if (!e) return false
  if (Date.now() > e.jusqua) {
    delete etat.frigo[empreinte(cle)]
    return false
  }
  return true
}

function metAuFrigo(cle, etat, { definitif = false, raison = '' } = {}) {
  etat.frigo[empreinte(cle)] = {
    jusqua: Date.now() + (definitif ? FRIGO_MORT_MS : FRIGO_MS),
    raison: raison.slice(0, 200),
  }
  ecritEtat(etat)
}

/** Toutes les clés déclarées pour un service, triées par priorité. */
export function pool(service) {
  if (!fs.existsSync(CHEMINS.trousseau)) {
    throw new TrousseauVide(service, 'config/keys.json est introuvable.')
  }
  const brut = litJson(CHEMINS.trousseau, {})
  const entrees = Array.isArray(brut[service]) ? brut[service] : []
  return entrees
    .filter((e) => e && e.key && e.enabled !== false && !String(e.key).includes('xxxxx'))
    .map((e, i) => ({ ...e, rang: i, tier: e.tier || 'paid' }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === 'paid' ? -1 : 1
      return a.rang - b.rang
    })
}

/** Combien de clés utilisables, hors frigo. */
export function disponibles(service) {
  const etat = litEtat()
  return pool(service).filter((e) => !auFrigo(e.key, etat))
}

/**
 * Exécute `travail(cle, entree)` avec la première clé qui accepte.
 *
 * `travail` doit lancer une erreur marquée par `clefGrillee()` — ou dont le
 * message ressemble à un problème de quota/authentification — pour déclencher
 * la bascule. Toute autre erreur remonte telle quelle : un bug de code ne doit
 * pas consommer les 17 clés.
 */
export async function avecCle(service, travail, { silencieux = false } = {}) {
  const etat = litEtat()
  const toutes = pool(service)
  if (toutes.length === 0) {
    throw new TrousseauVide(service, `Aucune clé ${service} n'est déclarée.`)
  }

  const utilisables = toutes.filter((e) => !auFrigo(e.key, etat))
  if (utilisables.length === 0) {
    const quand = Math.min(...Object.values(etat.frigo).map((f) => f.jusqua))
    throw new TrousseauVide(
      service,
      `Les ${toutes.length} clés sont au frigo (quota épuisé ou invalides). ` +
        `La première redevient disponible ${new Date(quand).toLocaleString('fr-FR')}.`
    )
  }

  const echecs = []
  for (const entree of utilisables) {
    try {
      const resultat = await travail(entree.key, entree)
      return resultat
    } catch (e) {
      if (!estGrillee(e)) throw e
      const raison = (e.message || '').slice(0, 120)
      echecs.push(`${entree.label || masque(entree.key)} : ${raison}`)
      metAuFrigo(entree.key, etat, { definitif: e.definitif === true, raison })
      if (!silencieux) {
        journal.attention(
          `Clé ${entree.label || masque(entree.key)} écartée (${raison}). Bascule sur la suivante.`
        )
      }
    }
  }

  throw new TrousseauVide(
    service,
    `Les ${utilisables.length} clés essayées ont échoué :\n  - ` + echecs.join('\n  - ')
  )
}

/** Reconnaît une erreur qui justifie de changer de clé. */
function estGrillee(e) {
  if (e && e.clefGrillee) return true
  const m = `${e?.message || ''}`.toLowerCase()
  const code = e?.statut ?? e?.status ?? e?.response?.status
  if ([401, 402, 403, 429].includes(Number(code))) return true
  return /quota|credit|limit exceeded|rate.?limit|unauthorized|forbidden|payment required|insufficient|monthly usage/i.test(
    m
  )
}

/** Sort une clé du frigo (après rechargement d'un compte, par exemple). */
export function degele(service = null) {
  const etat = litEtat()
  if (!service) {
    etat.frigo = {}
  } else {
    for (const e of pool(service)) delete etat.frigo[empreinte(e.key)]
  }
  ecritEtat(etat)
}

/** État lisible du trousseau, pour `npm run verifie`. */
export function etatLisible() {
  const etat = litEtat()
  const brut = litJson(CHEMINS.trousseau, {})
  const services = Object.keys(brut).filter((k) => !k.startsWith('_'))
  return services.map((service) => {
    let entrees = []
    try {
      entrees = pool(service)
    } catch {
      entrees = []
    }
    const libres = entrees.filter((e) => !auFrigo(e.key, etat))
    return {
      service,
      total: entrees.length,
      disponibles: libres.length,
      cles: entrees.map((e) => ({
        label: e.label || masque(e.key),
        masque: masque(e.key),
        tier: e.tier,
        frigo: auFrigo(e.key, etat),
      })),
    }
  })
}
