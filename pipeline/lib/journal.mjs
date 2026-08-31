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

/**
 * Masque une clé : `apify_api_vimy…7Xqm`.
 *
 * Les quatorze premiers caractères servent à RECONNAÎTRE le service — c'est la
 * longueur d'un préfixe comme `apify_api_` ou `sk_`. Sur une clé qui n'en a
 * pas, ils ne reconnaissent rien et laissent voir un quart du secret pour
 * rien : Pexels, par exemple, envoie cinquante-six caractères sans préfixe.
 * On n'en montre alors que quatre, de quoi distinguer deux clés du même
 * service sans en révéler la substance.
 */
const PREFIXES_CONNUS = /^(apify_api_|sk[-_]|hf_|fal[-_]|xi[-_])/i

export function masque(cle) {
  if (typeof cle !== 'string' || cle.length < 12) return '…'
  const tete = PREFIXES_CONNUS.test(cle) ? 14 : 4
  return `${cle.slice(0, tete)}…${cle.slice(-4)}`
}

/**
 * Nettoie une chaîne ou un objet de toute clé reconnaissable avant affichage.
 *
 * C'est la dernière barrière avant qu'un secret ne sorte du processus : elle
 * est posée une fois, au bord, pour qu'une route ou un journal ajouté demain en
 * hérite sans y penser. Elle doit donc couvrir TOUS les services du trousseau,
 * pas seulement ceux dont on se souvient.
 *
 * TROIS FUITES POSSIBLES ÉTAIENT DÉCOUVERTES :
 *
 *  - `apify.mjs` met son jeton DANS L'URL, et `http.mjs` recopie l'URL entière
 *    dans le message d'une `ErreurHttp`. Une clé Apify d'un format autre que
 *    `apify_api_…` passait donc entière dans une erreur remontée au client.
 *  - fal s'authentifie en `Authorization: Key <clé>`, alors qu'on n'attrapait
 *    que `Bearer`.
 *  - Pexels envoie une clé de 56 caractères sans aucun préfixe.
 *
 * D'où le filet ci-dessous : les préfixes connus d'abord, puis le paramètre
 * `token=`/`api_key=` d'une adresse, puis les en-têtes d'autorisation quel que
 * soit leur schéma.
 */
export function nettoie(valeur) {
  if (typeof valeur === 'string') {
    return valeur
      .replace(/apify_api_[A-Za-z0-9]{20,}/g, (m) => masque(m))
      .replace(/\bsk[-_][A-Za-z0-9_-]{20,}/g, (m) => masque(m))
      .replace(/\bhf_[A-Za-z0-9]{20,}/g, (m) => masque(m))
      .replace(/\bfal[-_][A-Za-z0-9:_-]{20,}/gi, (m) => masque(m))
      // Un secret passé en paramètre d'adresse : `?token=…`, `&api_key=…`.
      .replace(
        /([?&](?:token|api[-_]?key|key|access[-_]?token|secret)=)[^&\s#"']{12,}/gi,
        (_, p) => `${p}…`
      )
      // N'importe quel schéma d'autorisation : Bearer, Key, Token, Basic.
      .replace(/((?:Bearer|Key|Token|Basic)\s+)[A-Za-z0-9._:+/=-]{20,}/g, (_, p) => `${p}…`)
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
