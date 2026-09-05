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

/**
 * L'avancement d'un travail long, et le temps qu'il reste.
 *
 * DEUX SORTIES, PARCE QU'IL Y A DEUX LECTEURS.
 *
 * Au terminal, une barre réécrite en place : elle occupe une ligne quoi qu'il
 * arrive et se lit d'un coup d'œil. Dans l'atelier, c'est impossible — le
 * journal y défile ligne à ligne, et le retour chariot n'y efface rien.
 *
 * Le code sortait alors immédiatement dès que la couleur était coupée, ce qui
 * est le cas dans l'atelier (`NO_COLOR`). Résultat : un rendu de huit minutes,
 * un entraînement de trois heures et une séparation de dix minutes n'affichaient
 * RIEN entre leur première et leur dernière ligne. Un travail sans horizon est
 * indiscernable d'un travail bloqué, et on le tue au bout de deux minutes.
 *
 * On écrit donc des lignes, mais rarement : au plus une par tranche de cinq
 * pour cent ou par trois secondes. Assez pour voir que ça avance, assez peu
 * pour que le journal reste lisible.
 *
 * LE TEMPS RESTANT EST MESURÉ, PAS ESTIMÉ D'AVANCE. On chronomètre ce qui a
 * déjà été fait et on l'extrapole : une machine chargée, un GPU qui throttle ou
 * un plan plus lourd que les autres se voient tout de suite, là où une durée
 * annoncée au départ resterait fausse jusqu'à la fin.
 */
const suivis = new Map()

export function progression(fait, total, etiquette = '') {
  const part = total ? Math.min(1, fait / total) : 0
  const pc = Math.round(part * 100)

  if (!sansCouleur) {
    const largeur = 24
    const plein = Math.round(part * largeur)
    const barre = '█'.repeat(plein) + '░'.repeat(largeur - plein)
    process.stdout.write(`\r  ${barre} ${pc}%  ${etiquette}   `)
    if (fait >= total) process.stdout.write('\n')
    return
  }

  // L'ÉTIQUETTE EST LA CLÉ DE SUIVI, ET C'EST UN PIÈGE SI ON L'IGNORE.
  //
  // C'est elle qui relie deux appels au même travail : le début, le dernier
  // pourcentage, la dernière ligne écrite. Une étiquette qui CHANGE à chaque
  // appel — parce qu'on y a mis le pourcentage ou le temps restant — fait
  // croire à un travail neuf à chaque fois : le temps écoulé repart de zéro, la
  // prévision annonce « reste 0 s », et la limitation de débit ne freine plus
  // rien. Passe un libellé fixe ; les chiffres, c'est le travail d'ici.
  const cle = etiquette || '—'
  const maintenant = Date.now()
  let suivi = suivis.get(cle)
  // Un nouveau travail, ou le même qui repart de zéro après avoir fini.
  if (!suivi || pc < suivi.pc) {
    suivi = { debut: maintenant, dernierPc: -1, derniereLigne: 0 }
    suivis.set(cle, suivi)
  }

  const fini = fait >= total
  const assezAvance = pc - suivi.dernierPc >= 5
  const assezAttendu = maintenant - suivi.derniereLigne >= 3000
  if (!fini && !(assezAvance && assezAttendu)) return

  suivi.dernierPc = pc
  suivi.derniereLigne = maintenant

  const ecoule = (maintenant - suivi.debut) / 1000
  // Sous cinq pour cent, l'extrapolation dit n'importe quoi : on se tait plutôt
  // que d'annoncer deux heures pour un rendu de huit minutes.
  const reste = part > 0.05 && !fini ? (ecoule / part) * (1 - part) : null
  const bout = reste !== null ? ` · reste ${duree(Math.round(reste))}` : ''
  console.log(`  ${etiquette || 'avancement'} ${pc} %${bout}`)
  if (fini) suivis.delete(cle)
}
