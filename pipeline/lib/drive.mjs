/**
 * drive.mjs — déposer un master dans le Google Drive de la chaîne.
 *
 * POURQUOI CE N'EST PAS UN COMPTE DE SERVICE, ET POURQUOI ÇA COMPTE.
 *
 * Le réflexe, pour une machine qui écrit dans Drive, est le compte de service :
 * un fichier JSON, aucune fenêtre de navigateur, rien qui expire. Il ne marche
 * pas ici, et l'erreur qu'il rend ne dit pas pourquoi.
 *
 * Un compte de service possède son propre Drive, et ce Drive a **zéro octet**
 * de quota. Un fichier qu'il téléverse lui appartient : l'envoi échoue en
 * `storageQuotaExceeded`, y compris dans un dossier que tu lui as partagé —
 * partager donne le droit d'écrire, pas le quota pour stocker. Les deux
 * contournements connus, le Drive partagé et la délégation à l'échelle du
 * domaine, demandent Google Workspace. Sur un compte Gmail personnel, aucun des
 * deux n'existe.
 *
 * On passe donc par **OAuth pour application de bureau** : une autorisation
 * dans le navigateur, une fois, puis un jeton de rafraîchissement conservé dans
 * `config/keys.json`. Les fichiers t'appartiennent, ils comptent sur TON quota,
 * et ils arrivent dans TON Drive.
 *
 * LA PORTÉE EST `drive.file`, ET C'EST LA PLUS ÉTROITE QUI FASSE LE TRAVAIL.
 *
 * Elle ne donne accès qu'aux fichiers que l'application a créés elle-même. Elle
 * ne peut ni lire, ni lister, ni toucher le reste de ton Drive — même par
 * erreur, même sur un bug. C'est aussi la seule portée Drive que Google ne
 * classe pas comme sensible : aucune vérification d'application à demander,
 * aucun écran d'avertissement.
 *
 * Sa contrepartie décide de toute la conception : on ne peut PAS écrire dans un
 * dossier créé à la main dont on collerait l'identifiant — l'application ne le
 * « voit » pas. C'est donc elle qui crée le dossier de la chaîne, une fois, et
 * qui en retient l'identifiant. Tu peux ensuite le déplacer, le renommer, le
 * ranger où tu veux dans Drive : l'identifiant ne bouge pas, les envois
 * suivants continuent d'y arriver.
 */

import fs from 'node:fs'
import http from 'node:http'
import crypto from 'node:crypto'
import path from 'node:path'

import { CHEMINS, litJson, ecritJson } from './chemins.mjs'
import { journal } from './journal.mjs'

const SERVICE = 'google'
export const PORTEE = 'https://www.googleapis.com/auth/drive.file'
const DOSSIER_MIME = 'application/vnd.google-apps.folder'

/** Un morceau d'envoi. Multiple de 256 Ko — Google l'exige. */
const MORCEAU = 8 * 1024 * 1024

// ---------------------------------------------------------------------------
//  Les secrets
// ---------------------------------------------------------------------------
//
// Trois valeurs, pas une : l'identifiant et le secret du client viennent de la
// console Google, le jeton de rafraîchissement de l'autorisation. Le trousseau
// range des pools de clés interchangeables ; celui-ci n'a qu'une entrée et ne
// tourne pas — deux comptes Google ne sont pas deux clés du même service, ce
// sont deux Drive différents.

function entree() {
  // ON LIT LE FICHIER, PAS LE POOL — ET CE N'EST PAS UN RACCOURCI.
  //
  // `pool()` ne rend que les entrées qui portent une `key` utilisable : c'est
  // sa définition, une clé d'API prête à servir. Ici la `key` est le jeton de
  // rafraîchissement, qui n'existe qu'APRÈS l'autorisation. Passer par le pool
  // rendait donc `estConfigure()` faux tant qu'on n'était pas connecté — et
  // l'écran demandait de poser des identifiants qu'on venait de poser.
  const trousseau = litJson(CHEMINS.trousseau, {})
  const liste = Array.isArray(trousseau[SERVICE]) ? trousseau[SERVICE] : []
  const e = liste.find((x) => x && x.enabled !== false)
  return e ?? null
}

export function estConfigure() {
  const e = entree()
  return Boolean(e?.client_id && e?.client_secret)
}

export function estConnecte() {
  return Boolean(entree()?.key)
}

/**
 * Le jeton est-il ENCORE valable ?
 *
 * `estConnecte()` ne regarde que la présence du jeton. Ça ne suffit pas : une
 * application OAuth restée « En test » — le seul régime possible quand on ne
 * veut pas héberger une page d'accueil et une politique de confidentialité —
 * voit ses jetons expirer au bout de SEPT JOURS. Le jeton est toujours là, et
 * il ne vaut plus rien.
 *
 * Sans cette vérification, l'atelier proposait un bouton qui échouait au
 * huitième jour, sur un message de Google que personne ne relie à un délai.
 * Une requête de rafraîchissement coûte trois cents millisecondes ; l'écran dit
 * alors « à reconnecter » AVANT qu'on ait cliqué.
 */
export async function verifieLeJeton() {
  if (!estConfigure()) return { ok: false, motif: 'identifiants absents' }
  if (!estConnecte()) return { ok: false, motif: 'poste non autorisé' }
  try {
    await jetonDAcces()
    return { ok: true, motif: null }
  } catch (e) {
    return { ok: false, motif: 'jeton expiré ou révoqué', detail: e.message }
  }
}

/** Écrit dans `config/keys.json` sans jamais rien afficher en clair. */
function enregistre(champs) {
  const trousseau = litJson(CHEMINS.trousseau, {})
  const liste = Array.isArray(trousseau[SERVICE]) ? trousseau[SERVICE] : []
  const i = liste.length ? 0 : liste.push({ label: 'drive', enabled: true }) - 1
  liste[i] = { ...liste[i], ...champs, enabled: true }
  trousseau[SERVICE] = liste
  ecritJson(CHEMINS.trousseau, trousseau)
}

export function oublieLeJeton() {
  const trousseau = litJson(CHEMINS.trousseau, {})
  const liste = Array.isArray(trousseau[SERVICE]) ? trousseau[SERVICE] : []
  if (!liste.length) return false
  delete liste[0].key
  trousseau[SERVICE] = liste
  ecritJson(CHEMINS.trousseau, trousseau)
  return true
}

export function poseLesIdentifiants({ clientId, clientSecret }) {
  if (!clientId || !clientSecret) {
    throw new Error(`Il faut l'identifiant ET le secret du client OAuth.`)
  }
  // Changer de client invalide le jeton : on ne garde pas un jeton qui ne
  // correspond plus, il échouerait au premier envoi avec un message obscur.
  enregistre({ client_id: String(clientId).trim(), client_secret: String(clientSecret).trim(), key: undefined })
}

// ---------------------------------------------------------------------------
//  L'autorisation
// ---------------------------------------------------------------------------

/**
 * L'autorisation, une fois par poste.
 *
 * BOUCLE LOCALE, PAS DE COPIER-COLLER DE CODE.
 *
 * Google a fermé le flux « copie ce code dans le terminal » (`oob`) en 2022. Le
 * seul flux valable pour une application de bureau est la boucle locale : on
 * ouvre un serveur sur 127.0.0.1, le navigateur y revient avec le code, et le
 * serveur se referme. Rien ne sort de la machine, et aucun code ne traîne dans
 * l'historique du terminal.
 *
 * PKCE en plus du secret : le secret d'une application de bureau n'est pas un
 * secret — il est dans le fichier de la personne qui s'en sert. Le vérificateur
 * PKCE, lui, est tiré au sort à chaque autorisation.
 */
export async function autorise({ surUrl = null } = {}) {
  const e = entree()
  if (!e?.client_id || !e?.client_secret) {
    throw new Error(
      `Identifiants OAuth absents. Pose-les d'abord :\n` +
        `  npm run drive -- --identifiants --client=<id> --secret=-`
    )
  }

  const verificateur = crypto.randomBytes(32).toString('base64url')
  const defi = crypto.createHash('sha256').update(verificateur).digest('base64url')
  const etat = crypto.randomBytes(16).toString('base64url')

  const { code, redirection } = await attendLeRetour({
    clientId: e.client_id,
    defi,
    etat,
    surUrl,
  })

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: e.client_id,
      client_secret: e.client_secret,
      redirect_uri: redirection,
      grant_type: 'authorization_code',
      code_verifier: verificateur,
    }),
  })
  const jeton = await r.json()
  if (!r.ok || !jeton.refresh_token) {
    throw new Error(
      `Google a refusé l'échange (${r.status}) : ${jeton.error_description ?? jeton.error ?? 'sans motif'}.\n` +
        (jeton.refresh_token === undefined && r.ok
          ? `  Aucun jeton de rafraîchissement : révoque l'accès sur ` +
            `https://myaccount.google.com/permissions puis recommence — Google ne le ` +
            `redonne qu'à la PREMIÈRE autorisation.`
          : '')
    )
  }
  enregistre({ key: jeton.refresh_token })
  return true
}

/** Ouvre la boucle locale, rend le code d'autorisation. */
function attendLeRetour({ clientId, defi, etat, surUrl }) {
  return new Promise((resoud, rejette) => {
    const serveur = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1`)
      if (url.pathname !== '/') { res.writeHead(404).end(); return }

      const code = url.searchParams.get('code')
      const erreur = url.searchParams.get('error')
      const recu = url.searchParams.get('state')

      const page = (titre, texte) =>
        `<!doctype html><meta charset="utf-8"><title>${titre}</title>` +
        `<body style="font:16px/1.5 system-ui;background:#0c0f14;color:#eaeff6;` +
        `display:grid;place-items:center;height:100vh;margin:0">` +
        `<div style="text-align:center"><h1 style="font-size:20px">${titre}</h1>` +
        `<p style="color:#9daabd">${texte}</p></div>`

      if (erreur || !code || recu !== etat) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(page('Autorisation refusée', 'Tu peux fermer cette page et réessayer.'))
        serveur.close()
        rejette(new Error(erreur ? `autorisation refusée (${erreur})` : `réponse inattendue de Google`))
        return
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(page('C’est bon.', 'Tu peux fermer cette page et revenir à l’atelier.'))
      serveur.close()
      resoud({ code, redirection })
    })

    let redirection = ''
    // Port libre choisi par le système : Google accepte n'importe quel port sur
    // 127.0.0.1 pour une application de bureau, il n'y a donc rien à déclarer
    // dans la console.
    serveur.listen(0, '127.0.0.1', () => {
      const port = serveur.address().port
      redirection = `http://127.0.0.1:${port}`
      const url =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirection,
          response_type: 'code',
          scope: PORTEE,
          // Sans `offline`, Google ne rend qu'un jeton d'une heure et il faudrait
          // réautoriser à chaque envoi.
          access_type: 'offline',
          // Force l'écran de consentement : c'est le seul moyen de récupérer un
          // jeton de rafraîchissement quand on a déjà autorisé une fois.
          prompt: 'consent',
          state: etat,
          code_challenge: defi,
          code_challenge_method: 'S256',
        })
      if (surUrl) surUrl(url)
      else journal.info(`Ouvre cette adresse dans ton navigateur :\n  ${url}`)
    })

    serveur.on('error', rejette)
    // Une autorisation qui n'aboutit pas ne doit pas laisser un port ouvert et
    // une commande suspendue jusqu'à la fin des temps.
    setTimeout(() => {
      if (serveur.listening) {
        serveur.close()
        rejette(new Error(`Autorisation abandonnée : rien reçu en cinq minutes.`))
      }
    }, 5 * 60_000).unref()
  })
}

/** Un jeton d'accès frais. Il vit une heure ; on ne le range nulle part. */
async function jetonDAcces() {
  const e = entree()
  if (!e?.client_id || !e?.client_secret) {
    throw new Error(`Identifiants OAuth absents — npm run drive -- --aide`)
  }
  if (!e.key) {
    throw new Error(`Pas encore autorisé sur ce poste — npm run drive -- --connecte`)
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: e.client_id,
      client_secret: e.client_secret,
      refresh_token: e.key,
      grant_type: 'refresh_token',
    }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    // `invalid_grant` a trois causes, et la plus fréquente est un piège de la
    // console : une application restée « en test » voit ses jetons expirer au
    // bout de sept jours. On le dit, plutôt que de laisser chercher.
    const motif = j.error === 'invalid_grant'
      ? `Le jeton n'est plus valable. Trois causes :\n` +
        `  · l'application OAuth est restée « En test » dans la console Google —\n` +
        `    ses jetons expirent au bout de 7 jours. Passe-la « En production ».\n` +
        `  · l'accès a été révoqué sur https://myaccount.google.com/permissions\n` +
        `  · le mot de passe du compte a changé\n` +
        `Refais l'autorisation : npm run drive -- --connecte`
      : `${j.error_description ?? j.error ?? r.status}`
    throw new Error(motif)
  }
  return j.access_token
}

// ---------------------------------------------------------------------------
//  Le dossier de la chaîne
// ---------------------------------------------------------------------------

/** Ce que la chaîne a retenu de son Drive. */
export function dossierDeLaChaine() {
  const chaine = litJson(CHEMINS.chaine, {})
  return chaine.drive?.dossier_id ? chaine.drive : null
}

/**
 * Crée le dossier de la chaîne dans Drive et le retient.
 *
 * ON LE CRÉE, ON NE LE CHERCHE PAS.
 *
 * `drive.file` ne permet pas de lister le Drive : on ne peut donc pas vérifier
 * qu'un dossier du même nom existe déjà. C'est voulu — c'est exactement le
 * droit qu'on a refusé de demander. L'identifiant est écrit dans
 * `config/chaine.json` ; tant qu'il y est, on n'en recrée pas.
 */
export async function creeLeDossier(nom, { force = false } = {}) {
  const chaine = litJson(CHEMINS.chaine, {})
  const dejaLa = chaine.drive?.dossier_id
  if (dejaLa && !force) return { ...chaine.drive, nouveau: false }

  const acces = await jetonDAcces()
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { authorization: `Bearer ${acces}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: DOSSIER_MIME }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Création du dossier refusée (${r.status}) : ${j.error?.message ?? '—'}`)

  chaine.drive = { dossier_id: j.id, dossier_nom: j.name, lien: j.webViewLink ?? null }
  ecritJson(CHEMINS.chaine, chaine)
  return { ...chaine.drive, nouveau: true }
}

/**
 * Renomme le dossier de la chaîne.
 *
 * Il existe parce que le premier dossier posé s'est appelé « Chaîne » : le nom
 * était cherché à la racine de `chaine.json` alors qu'il vit dans `identite`.
 * Refaire un dossier aurait laissé le premier traîner, vide, dans le Drive —
 * renommer est le geste juste, et l'identifiant ne bouge pas.
 */
export async function renommeLeDossier(nom) {
  const d = dossierDeLaChaine()
  if (!d) throw new Error(`Cette chaîne n'a pas encore de dossier Drive.`)
  const acces = await jetonDAcces()
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(d.dossier_id)}?fields=id,name,webViewLink`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${acces}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: nom }),
    }
  )
  const j = await r.json()
  if (!r.ok) throw new Error(`Renommage refusé (${r.status}) : ${j.error?.message ?? '—'}`)

  const chaine = litJson(CHEMINS.chaine, {})
  chaine.drive = { ...chaine.drive, dossier_nom: j.name, lien: j.webViewLink ?? chaine.drive?.lien ?? null }
  ecritJson(CHEMINS.chaine, chaine)
  return chaine.drive
}

// ---------------------------------------------------------------------------
//  L'envoi
// ---------------------------------------------------------------------------

/**
 * Envoie un fichier dans le dossier de la chaîne.
 *
 * ENVOI REPRENABLE, PAR MORCEAUX — POUR LA PROGRESSION AUTANT QUE POUR LA
 * ROBUSTESSE.
 *
 * Un master pèse quatre-vingts mégaoctets. En un seul POST, on n'a rien à
 * afficher pendant deux minutes : ni pourcentage, ni temps restant, et une
 * coupure réseau fait tout recommencer. La session reprenable de Google découpe
 * l'envoi ; chaque morceau confirmé nous dit où on en est.
 */
export async function envoie(fichier, { nom = null, surProgres = null } = {}) {
  if (!fs.existsSync(fichier)) throw new Error(`Fichier introuvable : ${fichier}`)
  const dossier = dossierDeLaChaine()
  if (!dossier) {
    throw new Error(
      `Cette chaîne n'a pas encore de dossier Drive — npm run drive -- --dossier`
    )
  }

  const taille = fs.statSync(fichier).size
  const titre = nom ?? path.basename(fichier)
  const acces = await jetonDAcces()

  const ouverture = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,size',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${acces}`,
        'content-type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(taille),
      },
      body: JSON.stringify({ name: titre, parents: [dossier.dossier_id] }),
    }
  )
  if (!ouverture.ok) {
    const j = await ouverture.json().catch(() => ({}))
    // 404 sur le parent veut dire une chose précise : le dossier a été mis à la
    // corbeille, ou il a été créé par une AUTRE application OAuth. Le message
    // brut de Google ne l'explique pas.
    const motif =
      ouverture.status === 404
        ? `le dossier « ${dossier.dossier_nom} » n'est plus accessible — il a été supprimé, ` +
          `ou il vient d'un autre client OAuth. Refais-en un : npm run drive -- --dossier --force`
        : `${j.error?.message ?? ouverture.status}`
    throw new Error(`Envoi refusé : ${motif}`)
  }
  const session = ouverture.headers.get('location')
  if (!session) throw new Error(`Google n'a pas ouvert de session d'envoi.`)

  const debut = Date.now()
  let envoye = 0
  let fin = null

  while (envoye < taille) {
    const jusqua = Math.min(envoye + MORCEAU, taille)
    const morceau = await lisUneTranche(fichier, envoye, jusqua)

    const r = await fetch(session, {
      method: 'PUT',
      headers: {
        'content-length': String(morceau.length),
        'content-range': `bytes ${envoye}-${jusqua - 1}/${taille}`,
      },
      body: morceau,
    })

    if (r.status === 308) {
      // Google confirme jusqu'où il a reçu. On le croit LUI, pas notre compteur :
      // un morceau peut être accepté partiellement.
      const plage = r.headers.get('range')
      envoye = plage ? Number(plage.split('-')[1]) + 1 : jusqua
    } else if (r.ok) {
      fin = await r.json()
      envoye = taille
    } else {
      const j = await r.json().catch(() => ({}))
      throw new Error(`Envoi interrompu à ${Math.round((envoye / taille) * 100)} % : ${j.error?.message ?? r.status}`)
    }

    if (surProgres) {
      const ecouleS = (Date.now() - debut) / 1000
      const reste = envoye > 0 ? (ecouleS / envoye) * (taille - envoye) : null
      surProgres({ envoye, taille, resteS: reste })
    }
  }

  if (!fin) throw new Error(`L'envoi s'est terminé sans confirmation de Google.`)
  return {
    id: fin.id,
    nom: fin.name,
    lien: fin.webViewLink ?? null,
    octets: taille,
    secondes: Math.round((Date.now() - debut) / 1000),
  }
}

/** Une tranche du fichier, sans charger les quatre-vingts mégaoctets. */
function lisUneTranche(fichier, de, a) {
  return new Promise((resoud, rejette) => {
    const morceaux = []
    fs.createReadStream(fichier, { start: de, end: a - 1 })
      .on('data', (d) => morceaux.push(d))
      .on('end', () => resoud(Buffer.concat(morceaux)))
      .on('error', rejette)
  })
}
