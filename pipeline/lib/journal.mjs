/**
 * journal.mjs — sortie console lisible, et masquage systématique des secrets.
 *
 * Toute clé qui traverse ce module ressort masquée. C'est la dernière barrière
 * avant qu'un secret ne finisse dans un log, un fichier de sortie ou un
 * transcript de conversation.
 */

const C = {
  gris: '[90m',
  rouge: '[31m',
  vert: '[32m',
  jaune: '[33m',
  bleu: '[36m',
  gras: '[1m',
  fin: '[0m',
}

const sansCouleur = process.env.NO_COLOR !== undefined || !process.stdout.isTTY
const c = (couleur, texte) => (sansCouleur ? texte : `${C[couleur]}${texte}${C.fin}`)

/** Masque une clé : `apify_api_vimy…7Xqm`. */
export function masque(cle) {
  if (typeof cle !== 'string' || cle.length < 12) return '…'
  return `${cle.slice(0, 14)}…${cle.slice(-4)}`
}

/**
 * Nettoie une chaîne ou un objet de toute clé reconnaissable avant affichage.
 * Couvre les préfixes connus (apify_api_, sk_, hf_) et les jetons longs.
 */
export function nettoie(valeur) {
  if (typeof valeur === 'string') {
    return valeur
      .replace(/apify_api_[A-Za-z0-9]{20,}/g, (m) => masque(m))
      .replace(/\bsk[-_][A-Za-z0-9_-]{20,}/g, (m) => masque(m))
      .replace(/\bhf_[A-Za-z0-9]{20,}/g, (m) => masque(m))
      .replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/g, (_, p) => `${p}…`)
  }
  if (Array.isArray(valeur)) return valeur.map(nettoie)
  if (valeur && typeof valeur === 'object') {
    const sortie = {}
    for (const [k, v] of Object.entries(valeur)) {
      sortie[k] = /token|key|cle|secret|password|authorization/i.test(k) && typeof v === 'string'
        ? masque(v)
        : nettoie(v)
    }
    return sortie
  }
  return valeur
}

const dis = (prefixe, args) => console.log(prefixe, ...args.map((a) => nettoie(a)))

export const journal = {
  info: (...a) => dis(c('bleu', '·'), a),
  ok: (...a) => dis(c('vert', '✓'), a),
  attention: (...a) => dis(c('jaune', '!'), a),
  erreur: (...a) => dis(c('rouge', '✗'), a),
  detail: (...a) => dis(c('gris', ' '), a),
  titre: (t) => console.log('\n' + c('gras', t) + '\n' + c('gris', '─'.repeat(Math.min(t.length, 60)))),
  etape: (n, total, t) => console.log(c('gris', `[${n}/${total}]`), t),
}

/** Formate une durée en secondes façon `2 min 14 s`. */
export function duree(secondes) {
  const s = Math.round(secondes)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Formate un nombre de vues façon `1,2 M`. */
export function compact(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 1000) return String(n)
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace('.', ',')} k`
  return `${(n / 1e6).toFixed(1).replace('.', ',')} M`
}

/** Barre de progression sur une seule ligne, réécrite en place. */
export function progression(fait, total, etiquette = '') {
  if (sansCouleur) return
  const largeur = 24
  const part = total ? fait / total : 0
  const plein = Math.round(part * largeur)
  const barre = '█'.repeat(plein) + '░'.repeat(largeur - plein)
  process.stdout.write(`\r  ${barre} ${Math.round(part * 100)}%  ${etiquette}   `)
  if (fait >= total) process.stdout.write('\n')
}
