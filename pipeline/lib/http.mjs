/**
 * http.mjs — appels réseau avec relances, temps mort et erreurs parlantes.
 *
 * Une erreur HTTP porte toujours son statut (`e.statut`) et le début du corps
 * de la réponse, pour que le trousseau sache s'il faut changer de clé et pour
 * que l'utilisateur comprenne ce qui s'est passé sans lire un log.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pipeline as flux } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { assureDossier } from './chemins.mjs'
import { journal } from './journal.mjs'

export class ErreurHttp extends Error {
  constructor(statut, url, corps) {
    super(`HTTP ${statut} sur ${url}\n${String(corps).slice(0, 500)}`)
    this.name = 'ErreurHttp'
    this.statut = statut
    this.url = url
    this.corps = corps
  }
}

const dors = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * fetch avec relances exponentielles sur 429/5xx et coupure au bout de
 * `tempsMortMs`. Les 4xx autres que 429 ne sont pas relancés : ce sont des
 * erreurs de notre côté, insister ne sert à rien.
 */
export async function demande(url, options = {}) {
  const {
    essais = 3,
    tempsMortMs = 120_000,
    attenteBaseMs = 800,
    accepte = [],
    ...init
  } = options

  let derniere
  for (let n = 1; n <= essais; n++) {
    const stop = new AbortController()
    const minuteur = setTimeout(() => stop.abort(), tempsMortMs)
    try {
      const r = await fetch(url, { ...init, signal: stop.signal })
      clearTimeout(minuteur)

      if (r.ok || accepte.includes(r.status)) return r

      const corps = await r.text().catch(() => '')
      const erreur = new ErreurHttp(r.status, url, corps)

      const relancable = r.status === 429 || r.status >= 500
      if (!relancable || n === essais) throw erreur

      const entete = Number(r.headers.get('retry-after'))
      const attente = Number.isFinite(entete) && entete > 0 ? entete * 1000 : attenteBaseMs * 2 ** (n - 1)
      journal.detail(`HTTP ${r.status}, nouvel essai dans ${Math.round(attente / 1000)} s (${n}/${essais})`)
      await dors(attente)
      derniere = erreur
    } catch (e) {
      clearTimeout(minuteur)
      if (e instanceof ErreurHttp) throw e
      if (e.name === 'AbortError') {
        derniere = new Error(`Temps mort dépassé (${Math.round(tempsMortMs / 1000)} s) sur ${url}`)
      } else {
        derniere = e
      }
      if (n === essais) throw derniere
      await dors(attenteBaseMs * 2 ** (n - 1))
    }
  }
  throw derniere
}

/** GET qui rend du JSON. */
export async function getJson(url, options = {}) {
  const r = await demande(url, { ...options, method: 'GET' })
  return r.json()
}

/** POST JSON qui rend du JSON. */
export async function postJson(url, corps, options = {}) {
  const r = await demande(url, {
    ...options,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(corps),
  })
  const texte = await r.text()
  return texte ? JSON.parse(texte) : null
}

/** Télécharge une URL vers un fichier. Rend le chemin, ou null si l'URL casse. */
export async function telecharge(url, destination, { obligatoire = false, ...options } = {}) {
  try {
    const r = await demande(url, options)
    assureDossier(path.dirname(destination))
    await flux(Readable.fromWeb(r.body), fs.createWriteStream(destination))
    return destination
  } catch (e) {
    if (obligatoire) throw e
    journal.detail(`Téléchargement ignoré : ${url} (${e.message.split('\n')[0]})`)
    return null
  }
}

/** Exécute `travail` sur chaque élément, `n` en parallèle, dans l'ordre. */
export async function enParallele(elements, n, travail) {
  const resultats = new Array(elements.length)
  let curseur = 0
  const ouvriers = Array.from({ length: Math.min(n, elements.length) }, async () => {
    while (curseur < elements.length) {
      const i = curseur++
      resultats[i] = await travail(elements[i], i)
    }
  })
  await Promise.all(ouvriers)
  return resultats
}
