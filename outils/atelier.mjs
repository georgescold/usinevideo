#!/usr/bin/env node
/**
 * atelier.mjs — le serveur local de l'atelier.
 *
 * CE QUE CE FICHIER N'A PAS LE DROIT DE DEVENIR.
 *
 * Il ne monte rien, ne convertit rien, ne décide rien. Chaque capacité de
 * l'atelier existe d'abord comme commande Node utilisable seule au terminal
 * (`depose.mjs`, `soustitres.mjs`, `monte.mjs`, `rends.mjs`, `choix-voix.mjs`) ;
 * ce serveur ne fait que les lancer, relayer leur journal ligne à ligne, et
 * servir des fichiers. Si ce fichier disparaît, la chaîne se produit encore —
 * c'est le test qui dit si une ligne a sa place ici. Une règle de montage, un
 * calcul de durée, un format de fichier écrits ici seraient perdus pour le
 * terminal et dupliqués tôt ou tard.
 *
 * Corollaire, qui vaut règle : **le navigateur n'a jamais de clé d'API**. Les
 * clés ne sortent pas de `config/keys.json`, lu par les commandes filles dans
 * leur propre processus. Aucune route ne les expose, même masquées.
 *
 * POURQUOI UN SONDAGE, ET PAS UN WEBSOCKET.
 *
 * Le journal d'un travail se lit par `GET /api/travaux/:id?depuis=<curseur>`.
 * Un WebSocket obligerait à gérer la reconnexion, la reprise et l'ordre des
 * messages pour un gain nul : un rendu dure huit minutes et écrit trente
 * lignes. Avec un curseur, rafraîchir la page ne perd rien — on redemande
 * depuis zéro et on retrouve tout le journal.
 *
 * CE QUI OUVRE UN PORT SUR LA MACHINE DU PROPRIÉTAIRE DOIT ÊTRE PARANOÏAQUE.
 *
 * 1. `listen(port, '127.0.0.1')` — jamais sur toutes les interfaces.
 * 2. Tout slug venant d'une URL passe par `verifieSlug` AVANT de servir à
 *    construire un chemin. Ce dépôt a déjà créé un dossier parasite sur le
 *    Bureau à cause d'une entrée non filtrée : la règle n'est pas théorique.
 * 3. Un fichier servi est vérifié APRÈS `path.resolve`, pas avant : c'est la
 *    seule vérification qui résiste à `..`, aux liens et aux encodages.
 * 4. Les en-têtes `Host` et `Origin` sont contrôlés. Sans ça, n'importe quelle
 *    page web visitée par le propriétaire pourrait poster sur ce port et
 *    déclencher un appel payant à son insu (réattachement DNS, CSRF).
 * 5. Un appel payant annonce son coût et n'part que sur confirmation explicite.
 *
 *   node outils/atelier.mjs
 *   node outils/atelier.mjs --port=4321 --ouvre
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'

import { CHEMINS, dossierVideo, litJson, assureDossierVideo, litChaine } from '../pipeline/lib/chemins.mjs'
import { ffmpeg } from '../pipeline/lib/ffmpeg.mjs'
import { journal, nettoie } from '../pipeline/lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from '../pipeline/lib/args.mjs'
import { policesDisponibles, fichiersDePolice } from '../pipeline/lib/soustitres.mjs'
import { DOSSIER as DOSSIER_BROLL, EXTENSIONS as EXTENSIONS_BROLL } from '../pipeline/lib/broll-perso.mjs'
import { etatDe, etats } from '../pipeline/etat.mjs'
import { chaines, estUneChaine, metALaCorbeille } from '../pipeline/lib/chaines.mjs'
import { verifieUrl as verifieUrlInspiration } from '../pipeline/inspirations.mjs'
// La récolte de voix accepte plus de plateformes que le carnet : elle cherche
// la matière là où la personne parle, pas seulement dans la niche. Voir
// l'en-tête de `sources.mjs`.
import { verifieSource } from '../pipeline/lib/sources.mjs'

const { options } = litArgs()

aide(
  options,
  `
node outils/atelier.mjs [options]

  --port=4321             le port d'écoute, sur 127.0.0.1 uniquement
  --ouvre                 ouvre le navigateur sur l'atelier
  --taille-max-mo=2048    plafond d'un rush envoyé par le navigateur

Le serveur ne fait que lancer les commandes du pipeline et servir des fichiers.
Tout ce qu'il propose s'obtient aussi au terminal :

  npm run depose -- <slug> <fichier>
  npm run soustitres -- <slug> --modele=hormozi
  npm run monte -- <slug> --depuis=voix
  npm run rends -- <slug>

Aucune clé d'API n'est écrite dans le journal, ni passée en argument : les
commandes filles lisent le trousseau dans leur propre processus. La seule qui
traverse la mémoire de ce serveur est celle qu'on SAISIT à l'écran, et elle part
aussitôt sur l'entrée standard du processus qui l'enregistre.
`
)

// ---------------------------------------------------------------------------
//  Réglages
// ---------------------------------------------------------------------------

const PORT = nombre(options, 'port', 4321)
const TAILLE_MAX = Math.round(nombre(options, 'taille-max-mo', 2048) * 1e6)

const DOSSIER_ATELIER = path.join(CHEMINS.racine, 'atelier')

/** Le temporaire des envois. Isolé par processus : deux ateliers ne se marchent pas dessus. */
const TEMPORAIRE = path.join(os.tmpdir(), `atelier-${process.pid}`)

/** Le barème d'ElevenLabs, repris tel quel de `pipeline/lib/elevenlabs.mjs`. */
const CREDITS_PAR_MINUTE = 1000
const DOLLARS_PAR_MINUTE = 0.12

/**
 * Ce qu'on accepte de servir depuis `videos/`. Une liste courte se vérifie à l'œil.
 *
 * LE SVG N'Y EST PAS, ET C'EST DÉLIBÉRÉ.
 *
 * Un SVG est un document, pas une image : il peut porter un `<script>`. Servi
 * depuis `/media/`, il est en MÊME ORIGINE que l'atelier, et la politique de
 * sécurité de la page autorise le script en ligne — le script s'exécuterait
 * donc avec les droits de l'interface, y compris celui de lancer un appel
 * payant. Et le contenu de `videos/` n'est pas de confiance : `medias.mjs`
 * y télécharge du B-roll depuis Pexels et Openverse.
 *
 * Le pipeline ne produit que du raster. Rien ne demande le SVG.
 */
const EXTENSIONS_SERVIES = new Set([
  '.wav', '.mp3', '.m4a', '.aac', '.mp4', '.mov', '.webm',
  '.json', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp',
])

/**
 * Les seuls hôtes dont l'atelier accepte de relayer un extrait de voix.
 *
 * Relevés sur `/v1/shared-voices` le 29 août 2026. Le chemin compte autant que
 * l'hôte : `storage.googleapis.com` sert les seaux de la terre entière, et
 * l'ouvrir en entier reviendrait à ne rien filtrer du tout.
 */
const EXTRAITS_AUTORISES = [
  { hote: 'api.us.elevenlabs.io', prefixe: '/v1/voices/' },
  { hote: 'api.elevenlabs.io', prefixe: '/v1/voices/' },
  { hote: 'storage.googleapis.com', prefixe: '/eleven-public-prod/' },
]

/**
 * Un réglage de conversion venu du client, borné.
 *
 * `undefined` veut dire « ne touche pas », ce qui n'est pas la même chose que
 * zéro : stabilité 0 est un réglage légitime, très expressif, et le confondre
 * avec l'absence de réglage le rendrait impossible à poser depuis l'écran.
 */
function reglageBorne(v) {
  if (v === undefined || v === null || v === '') return undefined
  const x = Number(v)
  if (!Number.isFinite(x)) return undefined
  return Math.max(0, Math.min(1, x))
}

/** Ce qu'on sert depuis `assets/fonts/`, et rien d'autre. */
const EXTENSIONS_POLICES = new Set(['.ttf', '.otf', '.woff', '.woff2'])

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
}

const typeDe = (p) => TYPES[path.extname(p).toLowerCase()] ?? 'application/octet-stream'

// ---------------------------------------------------------------------------
//  Erreurs, réponses
// ---------------------------------------------------------------------------

class ErreurHttp extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}

/**
 * Les en-têtes posés sur TOUTES les réponses.
 *
 * La CSP n'est pas un ornement : elle interdit à la page servie d'aller
 * chercher quoi que ce soit ailleurs que sur ce serveur. C'est la traduction en
 * en-tête de la règle « pas de CDN, pas de dépendance externe » du contrat, et
 * accessoirement ce qui empêcherait un fragment de contenu injecté d'exfiltrer
 * quelque chose vers un hôte distant. `'unsafe-inline'` reste toléré parce que
 * l'interface est écrite en un seul fichier par type, styles et scripts en
 * ligne compris.
 */
const ENTETES_COMMUNS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'none'; " +
    // `default-src` ne couvre PAS `frame-ancestors` : sans cette directive,
    // n'importe quelle page peut mettre l'atelier en cadre et faire cliquer
    // les boutons de confirmation à l'aveugle.
    "frame-ancestors 'none'; " +
    "form-action 'none'",
  'X-Frame-Options': 'DENY',
}

function repondJson(res, code, valeur) {
  // `nettoie` masque tout ce qui ressemble à une clé. C'est la dernière barrière
  // avant qu'un secret ne sorte du processus, et elle est posée ici plutôt qu'à
  // chaque appel : une route ajoutée demain en hérite sans y penser.
  const corps = Buffer.from(JSON.stringify(nettoie(valeur), null, 2) + '\n', 'utf8')
  res.writeHead(code, {
    ...ENTETES_COMMUNS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': corps.length,
    'Cache-Control': 'no-store',
  })
  res.end(corps)
}

function repondTexte(res, code, texte, type = 'text/plain; charset=utf-8') {
  const corps = Buffer.from(texte, 'utf8')
  res.writeHead(code, {
    ...ENTETES_COMMUNS,
    'Content-Type': type,
    'Content-Length': corps.length,
    'Cache-Control': 'no-store',
  })
  res.end(corps)
}

// ---------------------------------------------------------------------------
//  Le slug, et pourquoi il ne se corrige jamais en silence
// ---------------------------------------------------------------------------

const SLUG_ACCEPTE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/**
 * Les noms que Windows refuse comme dossier, quelle que soit l'extension.
 * Reprise de la même liste que `pipeline/depose.mjs` : un slug refusé au dépôt
 * ne doit pas pouvoir entrer par l'atelier.
 */
const RESERVES_WINDOWS = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

/**
 * Le seul point d'entrée d'un slug dans un chemin.
 *
 * On refuse net, sans nettoyer : un slug corrigé en silence ne désigne plus la
 * même vidéo que celui qu'on a tapé, et l'utilisateur cherche ensuite un
 * dossier qui n'existe pas. La forme acceptée interdit d'office le point,
 * l'espace, la barre et l'antislash — donc `..`, donc la traversée.
 */
function verifieSlug(brut) {
  const slug = String(brut ?? '')
  if (!slug) throw new ErreurHttp(400, `Il manque le slug de la vidéo.`)
  if (slug.length > 80) throw new ErreurHttp(400, `Slug trop long (80 caractères au plus).`)
  if (!SLUG_ACCEPTE.test(slug)) {
    throw new ErreurHttp(
      400,
      `Slug « ${slug} » refusé : minuscules, chiffres et traits d'union, ` +
        `sans commencer ni finir par un trait d'union.`
    )
  }
  if (RESERVES_WINDOWS.has(slug)) {
    throw new ErreurHttp(400, `Slug « ${slug} » réservé par Windows : choisis-en un autre.`)
  }
  return slug
}

// ---------------------------------------------------------------------------
//  Le registre des travaux
// ---------------------------------------------------------------------------

/**
 * Un travail = une commande lancée, son journal, son verdict.
 *
 * `{ id, commande, etat: 'encours'|'fini'|'echec', lignes[], code }`
 *
 * Les lignes de stdout et de stderr sont fusionnées dans un seul tableau, dans
 * l'ordre d'arrivée. Les séparer donnerait deux journaux entrelacés qu'il
 * faudrait recoudre à l'affichage, alors que ce qui compte — la commande a-t-elle
 * échoué — se lit sur `etat` et `code`, pas sur le flux d'origine.
 */
const travaux = new Map()

/** Au-delà, on ne garde que la fin du journal. Un rendu bavard ne doit pas manger la mémoire. */
const LIGNES_MAX = 4000
const LONGUEUR_LIGNE_MAX = 4000
const TRAVAUX_GARDES = 60

function purgeLesTravaux() {
  if (travaux.size <= TRAVAUX_GARDES) return
  // On ne jette jamais un travail en cours : son enfant écrit encore dedans.
  for (const [id, t] of travaux) {
    if (travaux.size <= TRAVAUX_GARDES) break
    if (t.etat !== 'encours') travaux.delete(id)
  }
}

/**
 * `NO_COLOR` ne suffit pas : `principal()` écrit sa croix rouge en dur, sans
 * consulter l'environnement. Une séquence d'échappement laissée dans le journal
 * s'affiche telle quelle dans le navigateur — et empêche accessoirement de
 * reconnaître la ligne d'erreur à son `✗`.
 */
const SANS_COULEUR = /\u001b\[[0-9;]*m/g

function ajouteLigne(t, texte) {
  const propre = nettoie(String(texte).replace(SANS_COULEUR, '')).slice(0, LONGUEUR_LIGNE_MAX)
  t.lignes.push(propre)
  if (t.lignes.length > LIGNES_MAX) {
    // Le curseur du client est un index ABSOLU : on décale l'origine plutôt que
    // de renuméroter, sinon un client qui sonde pendant la purge relirait des
    // lignes déjà vues sans jamais s'en apercevoir.
    const jetees = t.lignes.length - LIGNES_MAX
    t.lignes.splice(0, jetees)
    t.premiereLigne += jetees
  }
}

/**
 * Lance une commande du pipeline et rend son travail.
 *
 * `NO_COLOR` coupe les séquences d'échappement du journal : elles n'ont aucun
 * sens dans un navigateur et rendraient les lignes illisibles.
 */
/**
 * Les caractères qu'aucun argument de commande ne peut porter.
 *
 * L'octet NUL fait échouer `spawn` ; le retour chariot et le saut de ligne
 * casseraient le journal en deux et permettraient d'y écrire une fausse ligne.
 * On refuse en amont plutôt que de laisser Node produire une erreur interne
 * que le client recevrait en 500.
 */
const CARACTERES_INTERDITS = /[\u0000-\u001f\u007f]/

function verifieArguments(args) {
  for (const a of args) {
    if (CARACTERES_INTERDITS.test(String(a))) {
      throw new ErreurHttp(400, `Un argument contient un caractère de contrôle interdit.`)
    }
  }
  return args
}

function lanceTravail(args, { etiquette = null, entree = null, cwd = null, pourLEcran = false } = {}) {
  verifieArguments(args)
  purgeLesTravaux()

  const id = randomUUID()
  const relatif = args.map((a) => (a.startsWith(CHEMINS.racine) ? path.relative(CHEMINS.racine, a).split(path.sep).join('/') : a))
  const t = {
    id,
    commande: etiquette ?? `node ${relatif.join(' ')}`,
    etat: 'encours',
    lignes: [],
    premiereLigne: 0,
    code: null,
    resultat: null,
    debut: new Date().toISOString(),
    fin: null,
    // CE QUE L'ÉCRAN LANCE POUR LUI-MÊME NE BLOQUE PAS CELUI QUI REGARDE.
    //
    // Les soldes se relisent tout seuls à chaque retour dans la fenêtre. Ce
    // sont des lectures : elles n'écrivent rien, et leur résultat concerne la
    // chaîne qu'on est en train de QUITTER. Les compter dans le garde de
    // bascule enfermait dans la chaîne courante — vu le 8 septembre 2026,
    // « 1 travail(aux) écrivent encore » sur un `cles.mjs --quotas` de 36 s.
    pourLEcran,
    _enfant: null,
    _attentes: [],
  }
  // L'ENREGISTREMENT VIENT APRÈS `spawn`, ET L'ORDRE COMPTE.
  //
  // Il venait avant. Quand `spawn` échouait de façon synchrone — c'est ce que
  // fait Node dès qu'un argument contient un octet NUL — le travail restait
  // « encours » pour toujours : `purgeLesTravaux` refuse par principe de jeter
  // un travail en cours, donc chacun amputait définitivement le quota, et le
  // message de fermeture annonçait des travaux interrompus qui n'avaient
  // jamais démarré.
  //
  // Trois requêtes suffisaient à le déclencher : un `voiceId`, un filtre de
  // catalogue ou une valeur de réglage portant un octet NUL.
  let enfant
  try {
    enfant = spawn(process.execPath, args, {
      // `cwd` sort de la chaîne courante pour une seule chose : installer les
      // dépendances d'une chaîne qu'on vient de créer. Partout ailleurs, une
      // commande travaille dans SA chaîne.
      cwd: cwd ?? CHEMINS.racine,
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
    })
  } catch (e) {
    // Un argument que Node refuse est une erreur de la requête, pas une panne
    // du serveur : 400, et rien n'est enregistré.
    throw new ErreurHttp(400, `Argument refusé par le système : ${e.message}`)
  }
  travaux.set(id, t)
  t._enfant = enfant

  // L'ENTRÉE STANDARD, POUR CE QU'UNE LIGNE DE COMMANDE NE PEUT PAS PORTER.
  //
  // Un mot corrigé est du texte libre : accents, apostrophes, guillemets,
  // n'importe quoi. Le passer en argument obligerait à l'échapper pour un
  // shell qu'on n'emploie même pas, et le plafond de longueur d'une ligne de
  // commande sous Windows est vite atteint sur deux cents corrections.
  if (entree !== null) {
    enfant.stdin.end(entree, 'utf8')
  } else {
    enfant.stdin.end()
  }

  // La sortie arrive par paquets qui ne respectent pas les fins de ligne : on
  // garde le reliquat jusqu'au prochain saut, sinon une ligne sur trois arrive
  // coupée en deux dans l'interface.
  // La sortie standard est aussi gardée telle quelle, en un seul morceau : c'est
  // elle qu'on relit pour retrouver l'objet d'une commande `--json`. Plafonnée,
  // parce qu'un montage bavard n'a aucune raison de tenir en mémoire.
  const sortieBrute = []
  let poidsSortie = 0
  for (const [flux, garde] of [[enfant.stdout, true], [enfant.stderr, false]]) {
    let reste = ''
    flux.setEncoding('utf8')
    flux.on('data', (morceau) => {
      if (garde && poidsSortie < 4_000_000) {
        sortieBrute.push(morceau)
        poidsSortie += morceau.length
      }
      const lignes = (reste + morceau).split(/\r?\n/)
      reste = lignes.pop() ?? ''
      for (const l of lignes) ajouteLigne(t, l)
    })
    flux.on('end', () => {
      if (reste) ajouteLigne(t, reste)
      reste = ''
    })
  }

  const termine = (code, erreur) => {
    if (t.etat !== 'encours') return
    if (erreur) ajouteLigne(t, `✗ ${erreur.message}`)
    t.code = code
    t.etat = code === 0 ? 'fini' : 'echec'
    t.fin = new Date().toISOString()
    t.resultat = code === 0 ? extraisJson(sortieBrute.join('')) : null
    t._enfant = null
    for (const resoud of t._attentes.splice(0)) resoud(t)
  }

  enfant.on('error', (e) => termine(-1, e))
  enfant.on('close', (code) => termine(code ?? -1))

  return t
}

/**
 * Récupère l'objet rendu par une commande lancée avec `--json`.
 *
 * Les commandes du dépôt promettent une sortie JSON pure en mode `--json`, mais
 * une ligne d'avertissement égarée suffirait à faire échouer un `JSON.parse`
 * strict et à priver l'interface d'un résultat parfaitement valide. On repart
 * donc du premier `{` ou `[` — et on rend `null` plutôt que de lancer : une
 * sortie non lisible n'est pas une raison de déclarer la commande en échec.
 */
function extraisJson(texte) {
  const brut = texte.trim()
  if (!brut) return null
  try {
    return JSON.parse(brut)
  } catch {
    /* du texte est mêlé au JSON : on cherche où il commence vraiment */
  }

  // ON REPART DE LA FIN, ET C'EST TOUT LE CORRECTIF.
  //
  // La version d'avant cherchait le PREMIER `[` ou `{` de la sortie. Ça marche
  // tant que le journal n'en contient aucun — et `journal.etape` écrit
  // « [1/4] ». Le crochet du compteur d'étape était donc pris pour le début du
  // résultat, l'analyse échouait, et `resultat` valait `null` sur une commande
  // parfaitement réussie. L'écran annonçait « rien de récolté » devant un
  // journal qui affichait quatre extraits gardés.
  //
  // Les commandes impriment leur journal PUIS leur JSON : la fin est le bon
  // bout par lequel prendre. On essaie chaque début de bloc en remontant, et on
  // garde le premier qui s'analyse — celui du vrai résultat.
  const lignes = brut.split(/\r?\n/)
  for (let i = lignes.length - 1; i >= 0; i--) {
    if (!/^[[{]/.test(lignes[i])) continue
    try {
      return JSON.parse(lignes.slice(i).join('\n'))
    } catch {
      /* pas ce début-là : on continue de remonter */
    }
  }
  return null
}

/** Attend la fin d'un travail, ou rend la main au bout de `msMax`. */
function attendTravail(t, msMax) {
  if (t.etat !== 'encours') return Promise.resolve(t)
  return new Promise((resoud) => {
    const minuteur = setTimeout(() => resoud(t), msMax)
    t._attentes.push((fini) => {
      clearTimeout(minuteur)
      resoud(fini)
    })
  })
}

/** La vue publique d'un travail, à partir d'un curseur de lecture. */
function vueTravail(t, depuis = 0) {
  const debut = Math.max(0, Math.floor(Number(depuis) || 0))
  const decalage = Math.max(0, debut - t.premiereLigne)
  return {
    id: t.id,
    commande: t.commande,
    etat: t.etat,
    code: t.code,
    debut_le: t.debut,
    fin_le: t.fin,
    lignes: t.lignes.slice(decalage),
    // Index absolu de la prochaine ligne à demander.
    curseur: t.premiereLigne + t.lignes.length,
    // Vrai quand la purge a mangé des lignes que ce client n'avait pas encore lues.
    tronque: debut < t.premiereLigne,
    resultat: t.resultat,
  }
}

/** Lance, attend, et refuse d'aller plus loin si la commande a échoué. */
async function lanceEtAttends(args, { msMax = 120_000, etiquette = null, entree = null, cwd = null, pourLEcran = false } = {}) {
  const t = lanceTravail(args, { etiquette, entree, cwd, pourLEcran })
  await attendTravail(t, msMax)
  // UNE ATTENTE DÉPASSÉE TUE L'ENFANT — MAIS SEULEMENT CELUI DE L'ÉCRAN.
  //
  // `attendTravail` rendait la main sans rien arrêter : un appel réseau qui
  // ne répond jamais laissait le travail « encours » POUR TOUJOURS. On ne
  // peut pas généraliser — un montage passe par le même chemin avec trois
  // minutes d'attente, et le tuer parce que la requête a renoncé serait
  // détruire du travail. Une lecture de soldes, elle, ne perd rien.
  if (pourLEcran && t.etat === 'encours') {
    try { t._enfant?.kill() } catch { /* déjà parti */ }
  }
  return t
}

const scriptPipeline = (nom) => path.join(CHEMINS.racine, 'pipeline', nom)
const scriptOutil = (nom) => path.join(CHEMINS.racine, 'outils', nom)

// ---------------------------------------------------------------------------
//  Les appels payants : coût annoncé, puis confirmation
// ---------------------------------------------------------------------------

/**
 * Un jeton = un coût annoncé à un moment donné, et l'accord qui s'y rapporte.
 *
 * Demander « confirme: true » suffirait à respecter la lettre du contrat, mais
 * pas son intention : un client pourrait confirmer un coût qu'il n'a jamais
 * affiché. Le jeton lie l'accord au chiffre montré. Il reste possible d'envoyer
 * `confirme: true` seul — c'est un accord explicite, et refuser un client qui
 * s'annonce franchement pour une question de protocole serait du zèle.
 */
const jetons = new Map()
const VALIDITE_JETON_MS = 10 * 60 * 1000

function coutElevenlabs(secondes) {
  const minutes = Math.max(0, secondes) / 60
  return {
    service: 'elevenlabs',
    secondes: Number(secondes.toFixed(1)),
    credits: Math.round(minutes * CREDITS_PAR_MINUTE),
    dollars: Number((minutes * DOLLARS_PAR_MINUTE).toFixed(2)),
    bareme: `${CREDITS_PAR_MINUTE} crédits et ${DOLLARS_PAR_MINUTE} $ la minute`,
  }
}

/**
 * Barre la route à un appel payant tant que le client n'a pas dit oui.
 *
 * La réponse 402 porte le coût ET le jeton : le client affiche l'un, renvoie
 * l'autre. Rien n'est lancé dans cet appel-ci.
 */
function exigeConfirmation(corps, cle, cout) {
  for (const [j, entree] of jetons) if (entree.expire < Date.now()) jetons.delete(j)

  const propose = corps?.jeton ? jetons.get(String(corps.jeton)) : null
  if (propose && propose.cle === cle) {
    jetons.delete(String(corps.jeton))
    return
  }
  // IL Y AVAIT ICI UNE PORTE DÉROBÉE : `if (corps?.confirme === true) return`.
  //
  // Elle laissait lancer un appel payant sans jeton, donc sans que le coût ait
  // jamais été affiché à qui que ce soit. L'interface ne s'en servait pas — le
  // jeton est le seul chemin qu'elle emprunte — mais elle annulait tout
  // l'intérêt du mécanisme pour quiconque atteignait le port, et notamment
  // pour un script qui se serait retrouvé sur cette origine.
  //
  // Un accord ne vaut que s'il porte sur un chiffre montré. C'est ce que le
  // jeton garantit : sa clé intègre la durée, donc un rush redéposé entre le
  // devis et l'accord force un nouveau devis.

  const jeton = randomBytes(18).toString('hex')
  jetons.set(jeton, { cle, cout, expire: Date.now() + VALIDITE_JETON_MS })
  throw new ErreurHttp(402, `Cet appel est payant : il faut le confirmer.`, {
    confirmation_requise: true,
    cout,
    jeton,
    expire_dans_s: VALIDITE_JETON_MS / 1000,
    rappel: `Renvoie la même requête avec { "jeton": "…" } pour lancer.`,
  })
}

/**
 * Ce que la conversion de voix va réellement traiter.
 *
 * `monte.mjs` convertit la piste telle qu'elle entre — la coupe des silences
 * est désactivée par défaut. `coupe.json` reste la source la plus juste quand il
 * existe, parce qu'il porte la durée réellement retenue :
 * annoncer la durée du rush surestimerait la facture de vingt pour cent sur une
 * prise normale. On lit donc `coupe.json` quand il existe, et on retombe sur le
 * rush sinon — en le disant, parce qu'une estimation haute qu'on croit juste
 * vaut moins qu'une estimation haute qu'on sait haute.
 */
function dureeAConvertir(slug) {
  const v = dossierVideo(slug)
  const coupe = litJson(path.join(v.montage, 'coupe.json'), null)
  if (coupe?.dureeMs) return { secondes: coupe.dureeMs / 1000, source: 'audio coupé' }

  const rush = etatDe(slug).etapes.rush
  if (rush?.dureeS) return { secondes: rush.dureeS, source: 'rush brut' }
  return { secondes: 0, source: 'inconnue' }
}

// ---------------------------------------------------------------------------
//  Lecture du corps des requêtes
// ---------------------------------------------------------------------------

async function litCorpsJson(req, max = 1_000_000) {
  const morceaux = []
  let taille = 0
  for await (const m of req) {
    taille += m.length
    if (taille > max) throw new ErreurHttp(413, `Corps de requête trop gros.`)
    morceaux.push(m)
  }
  if (!taille) return {}
  const texte = Buffer.concat(morceaux).toString('utf8')
  if (!texte.trim()) return {}
  try {
    const v = JSON.parse(texte)
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new ErreurHttp(400, `Le corps attendu est un objet JSON.`)
    }
    return v
  } catch (e) {
    if (e instanceof ErreurHttp) throw e
    throw new ErreurHttp(400, `Corps JSON illisible.`)
  }
}

/**
 * Décodeur multipart, écrit sur mesure. CE QU'IL SAIT FAIRE, ET RIEN DE PLUS.
 *
 * Il lit ce que `FormData` d'un navigateur envoie, et uniquement ça :
 *
 *   - une seule partie fichier, écrite au fil de l'eau dans un temporaire ;
 *   - des champs texte courts, en UTF-8, plafonnés ;
 *   - `Content-Disposition: form-data; name="…"; filename="…"` avec des
 *     guillemets simples, sans échappement.
 *
 * Ce qu'il ne fait PAS, et ne doit pas faire semblant de faire :
 *
 *   - `Content-Transfer-Encoding` (base64, quoted-printable) : aucun navigateur
 *     n'en envoie pour un `FormData`, et le supporter à moitié serait pire ;
 *   - `filename*=UTF-8''…` (RFC 5987) et les continuations RFC 2231 : le nom
 *     d'origine ne sert de toute façon qu'à lire l'extension, jamais à
 *     construire un chemin ;
 *   - le multipart imbriqué (`multipart/mixed`), disparu des navigateurs ;
 *   - un préambule ou un épilogue autres que vides, qui sont simplement jetés.
 *
 * Le corps du fichier part sur disque par `writeSync`. Un flux et sa
 * contre-pression seraient plus élégants, mais l'écriture d'un morceau de 64 ko
 * sur un disque local se compte en fractions de milliseconde, et le serveur
 * n'a qu'un utilisateur : la complexité ne s'amortirait jamais.
 */
async function litMultipart(req, { tailleMax }) {
  const typeBrut = String(req.headers['content-type'] ?? '')
  const m = typeBrut.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
  if (!m) throw new ErreurHttp(400, `Envoi multipart sans frontière déclarée.`)
  const delim = Buffer.from(`\r\n--${m[1] ?? m[2]}`, 'latin1')

  const champs = {}
  let fichier = null
  let partie = null
  let etat = 'frontiere'
  let fini = false
  let recu = 0
  // Le corps commence par `--frontière`, sans le `\r\n` qui la précède partout
  // ailleurs : on l'ajoute pour n'avoir qu'un seul motif à chercher.
  let tampon = Buffer.from('\r\n', 'latin1')

  const ferme = () => {
    if (partie?.fd !== undefined) {
      try { fs.closeSync(partie.fd) } catch { /* le temporaire n'est pas critique */ }
      partie.fd = undefined
    }
  }

  const ouvrePartie = (entetes) => {
    const disposition = entetes.split(/\r\n/).find((l) => /^content-disposition:/i.test(l)) ?? ''
    const nom = (disposition.match(/;\s*name="([^"]*)"/i) ?? [])[1] ?? ''
    const nomFichier = (disposition.match(/;\s*filename="([^"]*)"/i) ?? [])[1]

    if (nomFichier === undefined) return { champ: nom, texte: [], taille: 0 }

    if (fichier) throw new ErreurHttp(400, `Un seul fichier par envoi.`)

    // Le nom donné par le client ne sert QU'À lire l'extension, et n'entre
    // jamais dans un chemin : le fichier temporaire est nommé par le serveur.
    const ext = String((nomFichier.match(/\.([A-Za-z0-9]{1,5})$/) ?? [])[1] ?? '').toLowerCase()
    if (!ext) throw new ErreurHttp(415, `« ${nomFichier} » n'a pas d'extension exploitable.`)

    // Le temporaire peut avoir été balayé par un nettoyeur de disque entre le
    // démarrage et le dépôt : on le recrée plutôt que d'échouer là-dessus.
    fs.mkdirSync(TEMPORAIRE, { recursive: true })
    const chemin = path.join(TEMPORAIRE, `depot-${randomBytes(8).toString('hex')}.${ext}`)
    return {
      champ: nom,
      nomOrigine: nomFichier,
      chemin,
      octets: 0,
      fd: fs.openSync(chemin, 'w'),
    }
  }

  const ecris = (bloc) => {
    if (!bloc.length || !partie) return
    if (partie.fd !== undefined) {
      partie.octets += bloc.length
      fs.writeSync(partie.fd, bloc)
      return
    }
    partie.taille += bloc.length
    if (partie.taille > 64 * 1024) throw new ErreurHttp(413, `Champ « ${partie.champ} » trop long.`)
    partie.texte.push(bloc)
  }

  const fermePartie = () => {
    if (!partie) return
    if (partie.fd !== undefined) {
      ferme()
      fichier = { chemin: partie.chemin, nom: partie.nomOrigine, octets: partie.octets }
    } else {
      champs[partie.champ] = Buffer.concat(partie.texte).toString('utf8')
    }
    partie = null
  }

  const avance = () => {
    while (!fini) {
      if (etat === 'frontiere') {
        const i = tampon.indexOf(delim)
        if (i < 0) {
          if (tampon.length > delim.length) tampon = tampon.subarray(tampon.length - delim.length)
          return
        }
        tampon = tampon.subarray(i + delim.length)
        etat = 'apres'
      }
      if (etat === 'apres') {
        if (tampon.length < 2) return
        const deux = tampon.subarray(0, 2).toString('latin1')
        if (deux === '--') { fini = true; return }
        if (deux !== '\r\n') throw new ErreurHttp(400, `Envoi multipart malformé.`)
        tampon = tampon.subarray(2)
        etat = 'entetes'
      }
      if (etat === 'entetes') {
        const i = tampon.indexOf('\r\n\r\n')
        if (i < 0) {
          if (tampon.length > 16 * 1024) throw new ErreurHttp(400, `En-têtes de partie démesurés.`)
          return
        }
        partie = ouvrePartie(tampon.subarray(0, i).toString('utf8'))
        tampon = tampon.subarray(i + 4)
        etat = 'corps'
      }
      if (etat === 'corps') {
        const i = tampon.indexOf(delim)
        if (i < 0) {
          // On retient de quoi reconstituer une frontière coupée entre deux
          // paquets : sans cette garde, un `\r\n--front` à cheval passerait
          // dans le fichier et la partie ne se fermerait jamais.
          const garde = delim.length - 1
          if (tampon.length > garde) {
            ecris(tampon.subarray(0, tampon.length - garde))
            tampon = tampon.subarray(tampon.length - garde)
          }
          return
        }
        ecris(tampon.subarray(0, i))
        fermePartie()
        tampon = tampon.subarray(i + delim.length)
        etat = 'apres'
      }
    }
  }

  try {
    for await (const morceau of req) {
      recu += morceau.length
      if (recu > tailleMax) {
        throw new ErreurHttp(413, `Envoi au-delà de ${Math.round(tailleMax / 1e6)} Mo (--taille-max-mo).`)
      }
      tampon = tampon.length ? Buffer.concat([tampon, morceau]) : morceau
      avance()
      if (fini) break
    }
  } catch (e) {
    ferme()
    if (fichier) supprime(fichier.chemin)
    if (partie?.chemin) supprime(partie.chemin)
    throw e
  }
  ferme()

  if (!fichier) throw new ErreurHttp(400, `Aucun fichier dans l'envoi.`)
  return { champs, fichier }
}

function supprime(chemin) {
  try { fs.rmSync(chemin, { force: true }) } catch { /* le temporaire n'est pas critique */ }
}

// ---------------------------------------------------------------------------
//  Service de fichiers : la vérification vient APRÈS `resolve`
// ---------------------------------------------------------------------------

/**
 * Résout `relatif` sous `racine` et refuse tout ce qui en sort.
 *
 * La vérification se fait sur le chemin RÉSOLU, jamais sur celui qu'on a reçu :
 * `..%2f`, `.\\..\\`, un séparateur exotique et dix autres écritures désignent
 * le même parent, et les énumérer est une course perdue d'avance.
 *
 * `path.resolve` NE SUFFIT PAS, ET L'EN-TÊTE PRÉTENDAIT LE CONTRAIRE.
 *
 * Il est purement lexical : il réduit les `..` dans la chaîne, et ne regarde
 * jamais le disque. Un lien symbolique ou une jonction NTFS posé dans
 * `videos/<slug>/` et pointant vers `config/keys.json` passait donc la
 * vérification — l'extension `.json` étant servie. `realpath` est la seule
 * fonction qui suive les liens, et c'est elle qui rend la promesse vraie.
 *
 * On l'applique à la racine AUSSI, parce que la racine peut elle-même vivre
 * derrière un lien : comparer un chemin réel à un chemin lexical refuserait
 * alors tout. Et un fichier absent n'a aucun lien à suivre, donc on retombe
 * sans bruit sur la résolution lexicale.
 */
function sousDossier(racine, relatif) {
  if (relatif.includes('\0')) throw new ErreurHttp(400, `Chemin invalide.`)
  // Sur Windows, les commandes rendent parfois leurs chemins en antislashs :
  // on les accepte. Ailleurs, un antislash est un caractère de nom de fichier
  // ordinaire et le traduire casserait des noms légitimes.
  const normalise = path.sep === '\\' ? relatif.replace(/\\/g, '/') : relatif
  const reel = (p) => {
    try {
      return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p)
    } catch {
      return path.resolve(p)
    }
  }
  const lexicale = path.resolve(racine)
  const base = reel(lexicale)
  const vise = reel(path.resolve(lexicale, normalise))
  if (vise !== base && !vise.startsWith(base + path.sep)) {
    throw new ErreurHttp(403, `Chemin hors du dossier autorisé.`)
  }
  return vise
}

/** Sert un fichier, avec les requêtes partielles dont dépend la lecture d'un média. */
function sertFichier(req, res, chemin, { cache = 'no-cache' } = {}) {
  let infos
  try {
    infos = fs.statSync(chemin)
  } catch {
    throw new ErreurHttp(404, `Fichier absent.`)
  }
  if (!infos.isFile()) throw new ErreurHttp(404, `Ce n'est pas un fichier.`)

  const entetes = {
    ...ENTETES_COMMUNS,
    'Content-Type': typeDe(chemin),
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    'Last-Modified': infos.mtime.toUTCString(),
  }

  // Sans les requêtes partielles, un `<audio>` ou un `<video>` télécharge tout
  // avant de jouer et ne sait pas se déplacer dans la piste : un master de
  // quatre-vingts mégaoctets deviendrait inécoutable dans l'atelier.
  const plage = String(req.headers.range ?? '').match(/^bytes=(\d*)-(\d*)$/)
  if (plage && infos.size > 0) {
    const [, d, f] = plage
    let debut = d === '' ? infos.size - Number(f) : Number(d)
    let fin = d === '' || f === '' ? infos.size - 1 : Number(f)
    debut = Math.max(0, Math.min(debut, infos.size - 1))
    fin = Math.max(debut, Math.min(fin, infos.size - 1))
    res.writeHead(206, {
      ...entetes,
      'Content-Range': `bytes ${debut}-${fin}/${infos.size}`,
      'Content-Length': fin - debut + 1,
    })
    if (req.method === 'HEAD') return res.end()
    return fs.createReadStream(chemin, { start: debut, end: fin }).pipe(res)
  }

  res.writeHead(200, { ...entetes, 'Content-Length': infos.size })
  if (req.method === 'HEAD') return res.end()
  return fs.createReadStream(chemin).pipe(res)
}

/**
 * La page servie tant que `atelier/` n'existe pas.
 *
 * Un 404 laisserait croire à une panne du serveur. Il vaut mieux dire ce qui
 * manque et rappeler que tout se fait aussi au terminal.
 */
const PAGE_SANS_INTERFACE = `<!doctype html>
<html lang="fr"><meta charset="utf-8"><title>Atelier</title>
<style>body{background:#12141a;color:#e7e9ee;font:16px/1.6 system-ui,sans-serif;margin:0;
display:grid;place-items:center;min-height:100vh}main{max-width:44rem;padding:2rem}
code{background:#1e222b;padding:.15em .4em;border-radius:.3em}</style>
<main><h1>Le serveur tourne, l'interface n'est pas là.</h1>
<p>Le dossier <code>atelier/</code> ne contient pas encore <code>index.html</code>.
Le serveur, lui, répond : <code>/api/etat</code> liste les vidéos.</p>
<p>Rien de tout ça n'est bloquant — l'atelier n'a jamais été qu'un raccourci :</p>
<pre><code>npm run etat
npm run depose -- &lt;slug&gt; &lt;fichier&gt;
npm run monte -- &lt;slug&gt;
npm run rends -- &lt;slug&gt;</code></pre></main>
`

// ---------------------------------------------------------------------------
//  Provenance des requêtes
// ---------------------------------------------------------------------------

const ORIGINES_ACCEPTEES = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  `http://[::1]:${PORT}`,
])

/**
 * Refuse ce qui ne vient pas de l'atelier lui-même.
 *
 * Écouter sur 127.0.0.1 met à l'abri du réseau, pas du navigateur : une page
 * quelconque visitée par le propriétaire peut poster sur ce port, et un
 * `POST /api/videos/x/audio/generer` brûlerait des crédits sans qu'il voie
 * rien. Deux contrôles suffisent, et ils sont gratuits :
 *
 *   - `Host` : un nom de domaine qui pointe sur 127.0.0.1 (réattachement DNS)
 *     ne passe pas, parce qu'il ne s'appelle ni localhost ni 127.0.0.1 ;
 *   - `Origin` : un navigateur l'envoie sur toute requête d'origine croisée,
 *     y compris les POST de formulaire.
 */
function verifieProvenance(req) {
  const hote = String(req.headers.host ?? '')
  const nu = hote.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (!['127.0.0.1', 'localhost', '::1'].includes(nu)) {
    throw new ErreurHttp(403, `Hôte « ${hote} » refusé : l'atelier ne répond qu'en local.`)
  }
  const origine = req.headers.origin
  if (origine && origine !== 'null' && !ORIGINES_ACCEPTEES.has(origine)) {
    throw new ErreurHttp(403, `Requête d'origine « ${origine} » refusée.`)
  }
  const site = req.headers['sec-fetch-site']
  if (site && !['same-origin', 'none'].includes(String(site))) {
    throw new ErreurHttp(403, `Requête d'origine croisée refusée.`)
  }
}

// ---------------------------------------------------------------------------
//  Les routes
// ---------------------------------------------------------------------------

/**
 * Le slug d'une route `/api/videos/:slug/…`, lu à un seul endroit.
 *
 * Cet index s'est déjà trompé une fois, et le résultat était exactement ce que
 * le contrat redoute : compté à la main sur `/api/videos/essai/audio`, il
 * désignait `audio` au lieu de `essai`, et le premier dépôt a créé un dossier
 * `videos/audio/`. Une fonction, un endroit où se tromper, un endroit à
 * corriger.
 */
const slugDeLaVideo = (segments) => verifieSlug(segments[2])

/**
 * Un slug dont le dossier n'existe pas n'est pas une erreur d'écriture : c'est
 * une vidéo qui n'a pas commencé. On le dit avec un 404 parlant plutôt que de
 * laisser la commande fille échouer sur un chemin absent.
 */
function exigeVideo(slug) {
  if (!fs.existsSync(dossierVideo(slug).base)) {
    throw new ErreurHttp(404, `Aucune vidéo « ${slug} ». Crée-la d'abord (POST /api/videos).`)
  }
  return slug
}

/** Un travail lancé en fond : le client suivra son journal par `/api/travaux/:id`. */
const travailLance = (t) => ({ ok: true, travail: vueTravail(t) })

/**
 * Un travail court, attendu sur place : le client a le résultat tout de suite.
 *
 * En cas d'échec, on remonte la DERNIÈRE ligne du journal plutôt qu'un « code
 * 1 » : les commandes du dépôt terminent toutes sur un `✗ <raison>` écrit par
 * `principal()`, et c'est exactement la phrase que l'utilisateur doit lire.
 * L'interface n'a pas à savoir dérouler un journal pour dire ce qui cloche.
 */
function travailFini(t) {
  if (t.etat === 'echec') {
    // Le message d'erreur tient souvent sur plusieurs lignes (« attendu … »,
    // « lance … d'abord ») : on repart du dernier `✗` et on garde la suite,
    // sinon on n'affiche que la dernière phrase, qui est rarement la principale.
    const debut = t.lignes.findLastIndex((l) => l.trimStart().startsWith('✗'))
    const message = debut < 0
      ? (t.lignes.filter((l) => l.trim()).at(-1) ?? `code ${t.code}`)
      : t.lignes.slice(debut).join('\n').replace(/^\s*✗\s*/, '')
    throw new ErreurHttp(502, message.trim(), { travail: vueTravail(t) })
  }
  const vue = vueTravail(t)
  // Quand la commande a rendu du JSON, son journal EST ce JSON, à l'octet près :
  // le renvoyer deux fois doublait le poids du catalogue de voix pour rien. Le
  // journal complet reste consultable par `/api/travaux/:id`.
  if (t.resultat) vue.lignes = []
  return { ok: true, travail: vue, resultat: t.resultat }
}

async function routeApi(req, res, url, segments) {
  const methode = req.method
  const est = (m, ...motif) =>
    methode === m &&
    segments.length === motif.length &&
    motif.every((p, i) => (p === '*' ? true : p === segments[i]))

  // ------------------------------------------------------------- la chaîne --
  // LE BUDGET RESTANT, EN PERMANENCE SOUS LES YEUX.
  //
  // Trois services se paient : fal à la génération, ElevenLabs à la minute
  // convertie, Apify au scraping. Leur solde ne se consultait qu'en tapant
  // `npm run cles -- --quotas` — c'est-à-dire jamais, et on le découvrait quand
  // une génération s'arrêtait au milieu. Un chiffre qu'on ne voit pas n'existe
  // pas.
  //
  // AUCUNE CLÉ NE TRAVERSE CETTE ROUTE : la commande fille interroge les
  // services dans son propre processus et ne rend que des soldes.
  // ------------------------------------------------------------ le trousseau --
  //
  // AJOUTER UNE CLE ETAIT LE DERNIER GESTE QUI OBLIGEAIT LE TERMINAL.
  //
  // Le message d'echec disait « Ajoute ou reactive une cle dans
  // config/keys.json » — un fichier a editer a la main, alors qu'une cle morte
  // bloque net la deduction de script. C'est exactement ce que la regle du §2
  // interdit desormais.
  //
  // LA VALEUR PASSE PAR L'ENTREE STANDARD, JAMAIS PAR LES ARGUMENTS. Une ligne
  // de commande se lit dans la liste des processus, et elle finit dans
  // `t.commande`, donc dans le journal affiche a l'ecran. `cles.mjs --valeur=-`
  // existe pour ca : le commentaire qui l'accompagne dit meme que c'est par la
  // que l'interface transmet les cles. Elle traverse donc la memoire de ce
  // serveur — local, sur 127.0.0.1 — et rien d'autre : ni journal, ni argument,
  // ni disque hors du trousseau.
  if (est('GET', 'api', 'cles')) {
    const t = await lanceEtAttends([scriptOutil('cles.mjs'), '--json'], { msMax: 15_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'cles')) {
    const corps = await litCorpsJson(req)
    const service = String(corps?.service ?? '')
    if (!/^[a-z]{2,20}$/.test(service)) throw new ErreurHttp(400, `Service invalide.`)
    const valeur = String(corps?.valeur ?? '').trim()
    if (valeur.length < 8 || valeur.length > 400) throw new ErreurHttp(400, `Clé invalide.`)
    const args = [scriptOutil('cles.mjs'), `--ajoute=${service}`, '--valeur=-', '--json']
    if (corps?.label) {
      const l = String(corps.label)
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(l)) throw new ErreurHttp(400, `Étiquette refusée.`)
      args.push(`--label=${l}`)
    }
    if (corps?.tier === 'free' || corps?.tier === 'paid') args.push(`--tier=${corps.tier}`)
    // `entree` : la valeur part sur stdin du processus fils. Elle n'apparaît
    // donc ni dans `t.commande`, ni dans le journal, ni dans la liste des
    // processus du système.
    const t = await lanceEtAttends(args, { msMax: 60_000, entree: valeur })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('DELETE', 'api', 'cles')) {
    const corps = await litCorpsJson(req)
    const service = String(corps?.service ?? '')
    const label = String(corps?.label ?? '')
    if (!/^[a-z]{2,20}$/.test(service)) throw new ErreurHttp(400, `Service invalide.`)
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(label)) throw new ErreurHttp(400, `Étiquette refusée.`)
    const t = await lanceEtAttends(
      [scriptOutil('cles.mjs'), `--retire=${service}`, `--label=${label}`, '--json'],
      { msMax: 15_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // DEGELER : une clé au frigo a échoué une fois. Elle peut avoir été rechargée,
  // ou l'échec peut avoir été passager. On la remet en service sans la ressaisir.
  if (est('POST', 'api', 'cles', 'degele')) {
    const corps = await litCorpsJson(req).catch(() => ({}))
    const service = String(corps?.service ?? '')
    const args = [scriptOutil('cles.mjs'), '--json']
    args.push(service && /^[a-z]{2,20}$/.test(service) ? `--degele=${service}` : '--degele')
    const t = await lanceEtAttends(args, { msMax: 15_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('GET', 'api', 'quotas')) {
    const t = await lanceEtAttends([scriptOutil('cles.mjs'), '--quotas', '--json'], {
      msMax: 30_000,
      pourLEcran: true,
    })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('GET', 'api', 'chaine')) {
    const chaine = litChaine()
    // `config/chaine.json` ne porte pas de secret aujourd'hui. On retire quand
    // même tout ce qui en aurait l'air : la carte d'identité d'une chaîne
    // s'édite à la main, et rien ne garantit que personne n'y collera un jeton.
    const sansSecret = {}
    for (const [k, v] of Object.entries(chaine)) {
      if (/key|token|secret|password|trousseau|api_?cle/i.test(k)) continue
      sansSecret[k] = v
    }
    // `fichiersPolices` porte le nom du fichier : c'est ce que l'aperçu charge
    // pour dessiner avec la VRAIE police plutôt qu'avec un substitut.
    return repondJson(res, 200, {
      chaine: sansSecret,
      // Le dossier de la chaîne ouverte. L'écran en a besoin pour une seule
      // chose : dire OÙ ouvrir Claude Code quand la chaîne n'est pas encore
      // initialisée. « Lance /init-chaine » sans le dossier envoie chercher.
      racine: CHEMINS.racine,
      polices: policesDisponibles(),
      fichiersPolices: fichiersDePolice(),
    })
  }

  // L'IDENTITÉ DE LA CHAÎNE, DEPUIS L'ÉCRAN.
  //
  // `/init-chaine` était le seul chemin, et il sort du logiciel : il faut
  // fermer l'atelier, ouvrir Claude Code, et mener un entretien d'une heure
  // pour poser un nom et deux couleurs. Une chaîne neuve restait donc sans
  // identité, sans format actif et sans palette, et l'écran ne pouvait que le
  // constater.
  //
  // Ces deux routes appellent `pipeline/initialise.mjs`, qui existe seule au
  // terminal : §2, contrainte 1 — aucune logique métier ici. Elle DÉCLARE ce
  // qu'on lui donne, elle n'invente rien, et elle n'écrase aucune fiche
  // existante de `marque/`. L'entretien reste disponible et reste meilleur pour
  // le socle marketing ; il n'est simplement plus obligatoire pour démarrer.
  // LE CATALOGUE DES MODÈLES VIDÉO, POUR L'ÉTAPE 6.
  //
  // L'écran d'identité le recevait déjà par `--etat` ; l'étape 6 en a besoin
  // aussi, et elle ne va pas relire toute la carte d'identité pour ça. Une
  // seule source — `MODELES_PLAN` — servie par deux routes.
  if (est('GET', 'api', 'modeles-video')) {
    const { MODELES_PLAN, MODELE_PLAN_DEFAUT, coutDUnPlan, modeleDePlan } =
      await import('../pipeline/lib/fal.mjs')
    return repondJson(res, 200, {
      modeles: Object.entries(MODELES_PLAN).map(([format, m]) => ({
        format,
        nom: m.nom,
        resume: m.resume,
        usd5s: coutDUnPlan(format, 5),
      })),
      defaut: MODELE_PLAN_DEFAUT,
      retenu: modeleDePlan(litChaine()),
    })
  }

  if (est('GET', 'api', 'chaine', 'init')) {
    const t = await lanceEtAttends([scriptPipeline('initialise.mjs'), '--etat', '--json'], {
      msMax: 20_000,
    })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'chaine', 'init')) {
    const corps = await litCorpsJson(req)
    if (!corps || typeof corps !== 'object') throw new ErreurHttp(400, `Corps attendu : un objet.`)
    // Le formulaire voyage par l'ENTRÉE STANDARD, pas par la ligne de commande.
    // Une promesse de chaîne porte des accents, des apostrophes et des
    // guillemets ; le plafond de longueur d'une ligne de commande Windows est
    // vite atteint, et l'échappement pour un shell qu'on n'emploie même pas
    // serait du travail inventé.
    const t = await lanceEtAttends([scriptPipeline('initialise.mjs'), '--json'], {
      msMax: 30_000,
      entree: JSON.stringify(corps),
    })
    return repondJson(res, 200, travailFini(t))
  }

  // ------------------------------------------------------- les chaînes ------
  //
  // UNE CHAÎNE EST UN DOSSIER, ET ON EN CHANGE EN RELANÇANT LE SERVEUR.
  //
  // `CHEMINS.racine` est figé à l'import : tout le pipeline en dépend, et le
  // rebrancher à chaud voudrait dire recharger chaque module — avec le risque
  // qu'un travail en cours écrive dans l'ancienne chaîne pendant que le reste
  // lit la nouvelle. Relancer le processus est plus long d'une seconde et ne
  // laisse aucun état à moitié déplacé.
  //
  // `STACK_RACINE` est la seule façon documentée de déplacer la racine
  // (`chemins.mjs`) : on s'en sert plutôt que d'inventer un mécanisme.
  if (est('GET', 'api', 'chaines')) {
    return repondJson(res, 200, { chaines: chaines(), courante: CHEMINS.racine })
  }

  // METTRE À JOUR LE CODE D'UNE AUTRE CHAÎNE, DEPUIS CELLE-CI.
  //
  // Une chaîne porte sa propre copie du pipeline : celles d'avant l'atelier ne
  // peuvent pas s'ouvrir, et le menu ne proposait alors rien du tout — trois
  // cartes, aucune cliquable. Cette route est la sortie : elle remplace le CODE
  // et ne touche jamais au travail.
  if (est('POST', 'api', 'chaines', 'maj')) {
    const corps = await litCorpsJson(req)
    const cible = path.resolve(String(corps?.dossier ?? ''))
    if (!corps?.dossier || !estUneChaine(cible)) {
      throw new ErreurHttp(400, `« ${corps?.dossier ?? ''} » n'est pas une chaîne : pas de config/chaine.json.`)
    }
    const t = await lanceEtAttends(
      [scriptOutil('maj-chaine.mjs'), cible, '--json'],
      { msMax: 180_000 }
    )
    return repondJson(res, 200, { ...travailFini(t), chaines: chaines() })
  }

  // Créer une chaîne : un dossier voisin, copié depuis celle-ci.
  if (est('POST', 'api', 'chaines')) {
    const corps = await litCorpsJson(req)
    const nom = String(corps?.nom ?? '').trim()
    // LE NOM DEVIENT UN DOSSIER : on refuse tout ce qui n'en est pas un.
    //
    // Ni séparateur, ni `..`, ni caractère interdit par Windows, ni nom
    // réservé. On laisse en revanche les espaces et les accents : c'est un nom
    // qu'on lit, pas un slug.
    if (!nom || nom.length > 60) throw new ErreurHttp(400, `Donne un nom, de soixante caractères au plus.`)
    if (/[\/:*?"<>|]/.test(nom) || nom.startsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(nom)) {
      throw new ErreurHttp(400, `Ce nom ne peut pas être un dossier : ${nom}`)
    }
    const cible = path.join(path.dirname(CHEMINS.racine), nom)
    if (fs.existsSync(cible)) throw new ErreurHttp(409, `« ${nom} » existe déjà à côté.`)

    const t = await lanceEtAttends(
      [scriptOutil('nouvelle-chaine.mjs'), cible, ...(corps?.avecCles ? ['--avec-cles'] : [])],
      { msMax: 180_000 }
    )
    return repondJson(res, 200, { ...travailFini(t), dossier: cible, chaines: chaines() })
  }

  // `npm install` dans une chaîne neuve. C'est long et ça demande le réseau :
  // on rend la main tout de suite et le journal montre la suite.
  if (est('POST', 'api', 'chaines', 'installe')) {
    const corps = await litCorpsJson(req)
    const cible = path.resolve(String(corps?.dossier ?? ''))
    if (!estUneChaine(cible)) throw new ErreurHttp(400, `${cible} n'est pas une chaîne.`)
    // On appelle npm par son script Node plutôt que par `npm.cmd` : pas de
    // shell, pas de `.cmd` à retrouver, et le même chemin sur tous les postes.
    const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (!fs.existsSync(npm)) {
      throw new ErreurHttp(500, `npm est introuvable à côté de Node. Installe à la main : cd "${cible}" && npm install`)
    }
    return repondJson(res, 202, travailLance(
      lanceTravail([npm, 'install', '--no-audit', '--no-fund'], {
        cwd: cible,
        etiquette: `npm install  (dans ${path.basename(cible)})`,
      })
    ))
  }

  // DONNER SON TROUSSEAU A UNE AUTRE CHAINE.
  //
  // Une chaine creee sans la case « copier les cles » n'avait aucun moyen d'en
  // recevoir un ensuite. AUCUNE CLE NE TRAVERSE CETTE ROUTE : la commande fille
  // copie un fichier d'un dossier a l'autre, dans son propre processus.
  if (est('POST', 'api', 'chaines', 'cles')) {
    const corps = await litCorpsJson(req)
    const cible = path.resolve(String(corps?.dossier ?? ''))
    if (!corps?.dossier || !estUneChaine(cible)) {
      throw new ErreurHttp(400, `« ${corps?.dossier ?? ''} » n'est pas une chaîne.`)
    }
    const t = await lanceEtAttends(
      [scriptOutil('cles.mjs'), `--donne-a=${cible}`, '--json'],
      { msMax: 20_000 }
    )
    return repondJson(res, 200, { ...travailFini(t), chaines: chaines() })
  }

  // Une chaîne va à la CORBEILLE de Windows, jamais au broyeur : elle contient
  // un socle écrit à la main, une veille payée en crédits, des tournages.
  if (est('DELETE', 'api', 'chaines')) {
    const corps = await litCorpsJson(req)
    const r = metALaCorbeille(String(corps?.dossier ?? ''))
    return repondJson(res, 200, { ...r, chaines: chaines() })
  }

  if (est('POST', 'api', 'chaines', 'ouvre')) {
    const corps = await litCorpsJson(req)
    const cible = path.resolve(String(corps?.dossier ?? ''))
    if (!corps?.dossier || !estUneChaine(cible)) {
      throw new ErreurHttp(400, `« ${corps?.dossier ?? ''} » n'est pas une chaîne : pas de config/chaine.json.`)
    }
    if (cible === path.resolve(CHEMINS.racine)) {
      return repondJson(res, 200, { relance: false, dossier: cible, message: `C'est déjà la chaîne ouverte.` })
    }
    // TOUT CE QUI EMPÊCHERAIT LA CHAÎNE VISÉE DE DÉMARRER SE VÉRIFIE ICI.
    //
    // Relancer, c'est fermer ce serveur PUIS en démarrer un autre. Si le second
    // refuse de partir, le premier est déjà mort et il ne reste rien à l'écran —
    // pas même un message, puisque le processus qui aurait pu l'écrire n'existe
    // plus. Il ne reste qu'une cause de refus, et elle se constate sans rien
    // lancer : le dossier date d'avant l'atelier (`outils/atelier.mjs` absent).
    //
    // « PAS ENCORE INITIALISÉE » N'EN EST PLUS UNE — 7 septembre 2026.
    //
    // C'était la seconde, et elle fermait la porte à toutes les chaînes neuves
    // sans exception : une chaîne qu'on vient de copier n'est jamais
    // initialisée. Le bouton « Nouvelle chaîne » de cet écran fabriquait donc, à
    // tous les coups, une ligne que le même écran refusait ensuite d'ouvrir — il
    // ne restait qu'un chemin à copier. Un bouton qui produit une chose que
    // l'écran ne sait pas afficher est un bouton qui ment.
    //
    // Le refus venait du démarrage (`exigeInitialisee: true`), pas du pipeline :
    // AUCUNE commande de `pipeline/` n'exige l'initialisation. L'atelier était
    // plus strict que ce qu'il pilote. Il s'ouvre maintenant et annonce ce qui
    // manque — `/init-chaine` reste en conversation, c'est un entretien et pas
    // un formulaire (CLAUDE.md §2).
    if (!fs.existsSync(path.join(cible, 'outils', 'atelier.mjs'))) {
      throw new ErreurHttp(
        409,
        `« ${path.basename(cible)} » n'a pas encore l'atelier : son dossier date d'avant. ` +
          `Mets-la à jour depuis cette chaîne-ci, ou ouvre-la au terminal — ` +
          `tout le pipeline y fonctionne déjà en ligne de commande.`
      )
    }

    // ON ATTEND CINQ SECONDES AVANT DE REFUSER, ET ON DIT QUOI.
    //
    // Un travail en cours écrirait dans l'ancienne chaîne pendant qu'on regarde
    // la nouvelle : c'est la raison du garde, et elle tient. Ce qui ne tenait
    // pas, c'est de refuser au premier travail venu.
    //
    // L'ATELIER LANCE DES COMMANDES TOUT SEUL. Le solde des services payants se
    // relit à chaque retour dans la fenêtre — et rouvrir le menu des chaînes
    // est un retour dans la fenêtre. `cles.mjs --quotas` met quatre secondes.
    // Cliquer « Ouvrir » pendant ces quatre secondes se soldait donc par un
    // refus, sur un travail qui ne fait que LIRE des soldes chez Apify et
    // ElevenLabs. Relevé le 7 septembre 2026 : six lancements en trois minutes,
    // rien qu'en cliquant dans l'écran. Le refus paraissait aléatoire parce que
    // sa cause était invisible.
    //
    // Classer les commandes en « lit » et « écrit » aurait demandé d'auditer
    // quarante appels et de rejuger chaque nouveau. Le temps suffit à trancher :
    // ce que l'atelier lance de lui-même dure des secondes, ce qui écrit
    // vraiment — un montage, un rendu, un entraînement — dure des minutes. On
    // attend donc la fin des premiers, et on ne refuse que devant les seconds.
    //
    // Et le refus NOMME le travail. « 1 travail(aux) en cours » n'apprenait
    // rien : ni quoi, ni depuis quand, ni s'il fallait attendre ou aller le
    // tuer.
    // ET ON NE COMPTE PAS CE QUE L'ÉCRAN A LANCÉ POUR LUI-MÊME.
    //
    // L'attente de cinq secondes reposait sur une hypothèse : « ce que
    // l'atelier lance de lui-même dure des secondes ». Elle est fausse dès
    // qu'un service ne répond pas — `cles.mjs --quotas` n'avait AUCUNE
    // échéance, et un solde qui pend laissait le travail « encours » sans
    // fin. Le 8 septembre 2026, il bloquait la bascule depuis 36 s, et il
    // l'aurait bloquée indéfiniment : on ne pouvait plus changer de chaîne.
    //
    // Ce n'est pas le classement en « lit » et « écrit » qui avait été
    // refusé — celui-là demandait d'auditer quarante appels. Ici l'écran sait
    // exactement ce qu'il a lancé de son propre chef, à un seul endroit, et
    // ce résultat concerne la chaîne qu'on QUITTE : il n'a rien à protéger.
    for (const t of travaux.values()) {
      if (t.pourLEcran && t.etat === 'encours') {
        try { t._enfant?.kill() } catch { /* déjà parti */ }
      }
    }
    const restants = () => [...travaux.values()].filter((t) => t.etat === 'encours' && !t.pourLEcran)
    const limite = Date.now() + 5000
    let enCours = restants()
    while (enCours.length && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 150))
      enCours = restants()
    }
    if (enCours.length) {
      const noms = enCours
        .map((t) => {
          const s = Math.round((Date.now() - new Date(t.debut).getTime()) / 1000)
          return `  · ${t.commande}  (depuis ${s} s)`
        })
        .join(String.fromCharCode(10))
      throw new ErreurHttp(
        409,
        `On reste ici : ${enCours.length} travail(aux) écrivent encore dans cette chaîne.
${noms}`
      )
    }
    // ON ESSAIE LA CHAÎNE VISÉE À BLANC AVANT DE FERMER CELLE-CI.
    //
    // Les gardes ci-dessus ne peuvent pas tout prévoir, et c'est structurel :
    // chaque chaîne porte SA PROPRE copie du pipeline. Une chaîne copiée il y a
    // un mois tourne avec le code d'il y a un mois — un défaut corrigé ici ne
    // l'est pas là-bas. Deux essais l'ont montré, chacun pour une raison que
    // rien ne laissait deviner de ce côté-ci.
    //
    // Le seul juge fiable, c'est donc le démarrage lui-même. On lance l'atelier
    // cible sur un port de passage, on attend qu'il réponde, on l'arrête. S'il
    // ne répond pas, on rend SON message d'erreur et on ne touche à rien : le
    // serveur courant est toujours là, ce qui est tout l'intérêt.
    const essai = await essaieLaChaine(cible)
    if (!essai.ok) {
      throw new ErreurHttp(
        409,
        `« ${path.basename(cible)} » n'a pas démarré, on reste ici.
${essai.raison}`
      )
    }

    relanceVers(cible)
    return repondJson(res, 202, { relance: true, dossier: cible, port: PORT })
  }

  // --------------------------------------------------------------- l'état ---
  if (est('GET', 'api', 'etat')) return repondJson(res, 200, etats())
  if (est('GET', 'api', 'etat', '*')) {
    return repondJson(res, 200, etatDe(verifieSlug(segments[2])))
  }

  // ------------------------------------------------------- créer une vidéo --
  if (est('POST', 'api', 'videos')) {
    const corps = await litCorpsJson(req)
    const slug = verifieSlug(corps.slug)
    const destination = corps.destination ?? null
    if (destination && !['youtube', 'tiktok-insta'].includes(destination)) {
      throw new ErreurHttp(400, `destination : youtube ou tiktok-insta.`)
    }
    assureDossierVideo(slug)

    // NI LA DESTINATION NI LE TITRE NE SONT ÉCRITS ICI, ET C'EST VOULU.
    //
    // Le squelette de `01-script.json` appartient à `depose.mjs` : lui seul sait
    // traduire une destination en clé de format réellement présente dans
    // `config/chaine.json`. L'écrire aussi ici ferait deux vérités qui
    // divergeraient à la première correction. La destination est donc rendue au
    // client, qui la repassera au dépôt de l'audio.
    //
    // Le titre de travail, lui, s'écrit avec `/script` en conversation : c'est
    // une décision éditoriale, et CLAUDE.md §2 dit où elles se prennent.
    const avertissements = []
    if (corps.titre) {
      avertissements.push(
        `Le titre de travail ne s'écrit pas ici : il vient de /script, en conversation. ` +
          `La vidéo s'appelle « ${slug} » en attendant.`
      )
    }
    return repondJson(res, 201, {
      ok: true,
      slug,
      destination,
      a_repasser_au_depot: destination ? `--destination=${destination}` : null,
      avertissements,
      etat: etatDe(slug),
    })
  }

  // ------------------------------------------------------- dépôt de l'audio --
  // RETIRER LA PRISE POUR EN DÉPOSER UNE AUTRE.
  //
  // La commande ne retire pas que le fichier : `voix-finale.wav`, le transcript
  // et le montage ont été fabriqués à partir de la prise qu'on enlève, et les
  // laisser produirait des sous-titres calés sur une voix qu'on n'entend plus.
  // Rien n'est détruit — tout part horodaté dans `.prises-precedentes/`.
  if (est('DELETE', 'api', 'videos', '*', 'audio')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    // UNE PRISE, OU TOUTES. Deposer trois fois le meme fichier EMPILE — le
    // montage colle les prises bout a bout — et il n'existait qu'un geste : tout
    // retirer pour tout redeposer. `?fichier=` en enleve une seule.
    const cible = String(url.searchParams.get('fichier') ?? '').trim()
    if (cible && !/^[A-Za-z0-9._-]{1,80}$/.test(cible)) {
      throw new ErreurHttp(400, `Nom de prise refusé.`)
    }
    const t = await lanceEtAttends(
      [scriptPipeline('depose.mjs'), slug, cible ? `--retire=${cible}` : '--retire', '--json'],
      { msMax: 120_000 }
    )
    return repondJson(res, 200, { ...travailFini(t), etat: etatDe(slug) })
  }

  if (est('POST', 'api', 'videos', '*', 'audio')) {
    const slug = slugDeLaVideo(segments)
    const { champs, fichier } = await litMultipart(req, { tailleMax: TAILLE_MAX })
    let aEffacer = true
    try {
      const args = [scriptPipeline('depose.mjs'), slug, fichier.chemin]
      if (['1', 'true', 'oui'].includes(String(champs.coupe ?? '').toLowerCase())) args.push('--coupe')
      if (champs.destination) {
        if (!['youtube', 'tiktok-insta'].includes(champs.destination)) {
          throw new ErreurHttp(400, `destination : youtube ou tiktok-insta.`)
        }
        args.push(`--destination=${champs.destination}`)
      }
      args.push('--json')
      // La copie d'un rush d'un gigaoctet peut prendre un moment ; au-delà, on
      // rend la main et le client suit le travail comme un autre.
      const t = await lanceEtAttends(args, { msMax: 300_000 })
      if (t.etat === 'encours') {
        // ON NE SUPPRIME PAS LE TEMPORAIRE ICI : L'ENFANT LE LIT ENCORE.
        //
        // `lanceEtAttends` rend la main au bout de cinq minutes, mais
        // `depose.mjs` termine par un `copyFileSync` — copier un rush de
        // plusieurs gigaoctets vers un dossier réseau dépasse ce délai sans
        // difficulté. Le `finally` s'exécutant sur le `return`, on effaçait la
        // source pendant la copie : sous Windows la suppression échoue et le
        // temporaire fuit, ailleurs elle réussit et la copie ne survit que par
        // les sémantiques POSIX. Correct par accident dans aucun des deux cas.
        //
        // On attend donc la vraie fin, en arrière-plan, pour effacer.
        attendTravail(t, 3_600_000).then(() => supprime(fichier.chemin), () => {})
        aEffacer = false
        return repondJson(res, 202, travailLance(t))
      }
      return repondJson(res, 200, { ...travailFini(t), etat: etatDe(slug) })
    } finally {
      if (aEffacer) supprime(fichier.chemin)
    }
  }

  // ---------------------------------------------------------------- la voix --
  if (est('GET', 'api', 'voix')) {
    // DEUX FONDS, ET LE SECOND EST CELUI QU'ON CHERCHAIT.
    //
    // `--catalogue` ne rend que les voix du COMPTE : vingt-six, dont vingt-et-une
    // livrées par ElevenLabs. `--partagees` ouvre la bibliothèque publique, des
    // milliers de voix, servie par pages.
    const partagee = ['1', 'true', 'oui'].includes(String(url.searchParams.get('bibliotheque') ?? ''))
    const args = [scriptOutil('choix-voix.mjs'), partagee ? '--partagees' : '--catalogue']
    // `genre`, `age`, `langue` et `cherche` valent des deux côtés : la commande
    // filtre le compte localement et délègue la bibliothèque à l'API. `categorie`
    // et `tri` n'existent que sur la bibliothèque — les passer au catalogue
    // n'aurait rien cassé, mais aurait laissé croire qu'ils y font quelque chose.
    const filtres = partagee
      ? ['genre', 'age', 'ton', 'usage', 'langue', 'cherche', 'categorie', 'tri']
      : ['genre', 'age', 'langue', 'cherche']
    for (const filtre of filtres) {
      const v = url.searchParams.get(filtre)
      if (v) args.push(`--${filtre}=${v}`)
    }
    if (partagee) {
      const page = Math.max(0, Math.min(200, Number(url.searchParams.get('page')) || 0))
      args.push(`--page=${page}`)
    }
    args.push('--json')
    // Le catalogue passe par ElevenLabs : gratuit, mais tributaire du réseau.
    const t = await lanceEtAttends(args, { msMax: 60_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // ------------------------------------------- l'extrait d'écoute, relayé ---
  //
  // POURQUOI ON LE FAIT PASSER PAR ICI PLUTÔT QUE DE POINTER DESSUS.
  //
  // L'extrait vit chez ElevenLabs. Un `<audio>` qui pointerait droit dessus est
  // bloqué net par la politique de sécurité de l'atelier (`media-src 'self'`) —
  // et l'assouplir pour un confort d'écoute reviendrait à ouvrir la page aux
  // domaines d'un tiers pour toujours. Le repli employé jusqu'ici, un lien qui
  // ouvre un onglet, ne joue pas l'extrait : le navigateur le TÉLÉCHARGE, ce qui
  // sort du logiciel pour comparer deux timbres.
  //
  // Le serveur va donc chercher le fichier et le renvoie sous sa propre adresse.
  // La politique est satisfaite sans être touchée, et rien ne quitte le poste.
  //
  // L'ADRESSE VIENT DE L'EXTÉRIEUR : ELLE EST ENFERMÉE DANS UNE LISTE BLANCHE.
  //
  // Relayer une adresse arbitraire ferait de l'atelier un tremplin vers tout ce
  // que cette machine peut joindre — y compris le réseau local et les services
  // internes. On n'accepte donc que les deux hôtes qu'ElevenLabs emploie
  // réellement, chemin compris, relevés le 29 août 2026.
  if (est('GET', 'api', 'voix', 'extrait')) {
    const brut = url.searchParams.get('url') ?? ''
    let cible
    try {
      cible = new URL(brut)
    } catch {
      throw new ErreurHttp(400, `Adresse d'extrait illisible.`)
    }
    const autorise = (u) =>
      u.protocol === 'https:' &&
      EXTRAITS_AUTORISES.some((a) => u.hostname === a.hote && u.pathname.startsWith(a.prefixe))
    if (!autorise(cible)) {
      throw new ErreurHttp(403, `Cette adresse n'est pas un extrait ElevenLabs.`)
    }

    // Les redirections sont suivies à la main, une seule fois, et la
    // destination repasse par la même liste : `redirect: 'follow'` aurait
    // laissé le serveur d'en face choisir où l'on va.
    let reponse = await fetch(cible.href, { redirect: 'manual' })
    if ([301, 302, 303, 307, 308].includes(reponse.status)) {
      let saut
      try {
        saut = new URL(reponse.headers.get('location') ?? '', cible)
      } catch {
        throw new ErreurHttp(502, `Redirection illisible.`)
      }
      if (!autorise(saut)) throw new ErreurHttp(403, `Redirection hors de la liste.`)
      reponse = await fetch(saut.href, { redirect: 'error' })
    }
    if (!reponse.ok || !reponse.body) {
      throw new ErreurHttp(502, `ElevenLabs n'a pas rendu cet extrait (HTTP ${reponse.status}).`)
    }

    const type = reponse.headers.get('content-type') ?? ''
    res.writeHead(200, {
      ...ENTETES_COMMUNS,
      // On ne recopie pas le type tel quel : un `text/html` renvoyé par erreur
      // deviendrait une page servie sous notre origine.
      'Content-Type': type.startsWith('audio/') ? type : 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    })
    if (req.method === 'HEAD') return res.end()
    return Readable.fromWeb(reponse.body).pipe(res)
  }

  // ---------------------------------------------------- les voix favorites ---
  //
  // Elles appartiennent à la CHAÎNE et vivent dans `config/chaine.json` : la
  // lecture passe donc par la commande, comme tout le reste, et l'écran n'écrit
  // jamais dans ce fichier lui-même (§2, contrainte 1).
  if (est('GET', 'api', 'voix', 'favoris')) {
    const t = await lanceEtAttends(
      [scriptOutil('choix-voix.mjs'), '--favoris', '--json'],
      { msMax: 15_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'voix', 'favoris')) {
    const corps = await litCorpsJson(req)
    if (!corps?.id) throw new ErreurHttp(400, `Donne la voix : { "id": "…" }.`)
    const moteur = corps.moteur === 'fish' ? 'fish' : 'elevenlabs'
    const args = [scriptOutil('choix-voix.mjs')]
    // `retire: true` sur la même route plutôt qu'un DELETE : l'écran bascule une
    // étoile, et une bascule est un seul geste. Deux routes pour un bouton
    // auraient fait deux chemins à tenir d'accord.
    args.push(corps.retire === true ? '--oublie-favori' : '--favori')
    args.push(`--voix=${corps.id}`)
    if (moteur === 'fish') args.push('--fish')
    if (corps.nom) args.push(`--nom=${String(corps.nom).slice(0, 120)}`)
    if (corps.proprietaire) args.push(`--proprietaire=${corps.proprietaire}`)
    if (corps.apercu) args.push(`--apercu=${String(corps.apercu).slice(0, 500)}`)
    args.push('--json')
    const t = await lanceEtAttends(args, { msMax: 15_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'voix', 'defaut')) {
    const corps = await litCorpsJson(req)
    if (!corps.voiceId) throw new ErreurHttp(400, `Donne la voix : { "voiceId": "…" }.`)
    const t = await lanceEtAttends([
      scriptOutil('choix-voix.mjs'), '--defaut', `--voix=${corps.voiceId}`, '--json',
    ], { msMax: 60_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // UN ESSAI COURT AVANT DE REFAIRE TOUT L'AUDIO.
  //
  // La transposition ne se calcule pas, elle s'entend : le nombre juste — celui
  // qui met la prise sur la hauteur du modèle — n'est pas toujours celui qu'on
  // préfère. On l'ajuste donc par essais, et chaque essai coûtait jusqu'ici une
  // conversion complète de toute la prise, plus la transcription qui suit.
  //
  // Rien n'est payant : le local tourne sur la carte. Le seul coût est le temps,
  // et c'est précisément ce qu'on économise. La sortie porte son propre nom :
  // un essai ne doit jamais écraser le master qu'on est en train de juger.
  if (est('POST', 'api', 'videos', '*', 'audio', 'essai')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    if (!corps?.modele || !/^[a-z0-9][a-z0-9-]{0,60}$/i.test(String(corps.modele))) {
      throw new ErreurHttp(400, `Identifiant de modèle refusé.`)
    }
    // LA BORNE SUIT L'ÉCRAN, SINON ELLE TRONQUE EN SILENCE.
    //
    // L'écran demande vingt secondes et en accepte soixante ; une borne serveur
    // restée à trente aurait rendu trente secondes sans le dire à qui en
    // demandait quarante-cinq — le pire cas, parce qu'on juge alors un extrait
    // qui n'est pas celui qu'on a réglé.
    const secondes = Math.max(2, Math.min(60, Math.round(Number(corps.secondes) || 20)))
    const depart = Math.max(0, Math.min(36_000, Math.round(Number(corps.depart) || 0)))
    const transpose = Math.max(-24, Math.min(24, Math.round(Number(corps.transpose) || 0)))

    const t = await lanceEtAttends(
      [
        scriptPipeline('voix.mjs'), slug, '--local',
        `--modele=${corps.modele}`,
        `--transpose=${transpose}`,
        `--essai=${secondes}`,
        `--depart=${depart}`,
        '--sortie=essai-local.wav',
      ],
      { msMax: 180_000 }
    )
    return repondJson(res, 200, {
      ...travailFini(t),
      fichier: `videos/${slug}/03-audio/essai-local.wav`,
    })
  }

  if (est('POST', 'api', 'videos', '*', 'voix', 'essai')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    if (!corps.voiceId) throw new ErreurHttp(400, `Donne la voix : { "voiceId": "…" }.`)
    const secondes = Math.min(60, Math.max(2, Number(corps.secondes ?? 20)))

    exigeConfirmation(corps, `essai:${slug}:${corps.voiceId}:${secondes}`, {
      ...coutElevenlabs(secondes),
      quoi: `Essai de ${secondes} s de la voix ${corps.voiceId} sur la prise de « ${slug} ».`,
    })

    const args = [
      scriptOutil('choix-voix.mjs'), slug, '--essai',
      `--voix=${corps.voiceId}`, `--secondes=${secondes}`,
    ]
    if (corps.depuis !== undefined) args.push(`--depuis=${Math.max(0, Number(corps.depuis) || 0)}`)
    // Le réglage de l'essai : c'est lui qu'on vient écouter.
    const stabEssai = reglageBorne(corps.stabilite)
    if (stabEssai !== undefined) args.push(`--stabilite=${stabEssai}`)
    const simEssai = reglageBorne(corps.similarite)
    if (simEssai !== undefined) args.push(`--similarite=${simEssai}`)
    // Une voix de la bibliothèque n'est pas convertible tant qu'elle n'est pas
    // dans le compte. La commande l'emprunte le temps de l'essai puis la rend —
    // les emplacements du compte sont rationnés, et les remplir de timbres
    // écartés ferait échouer plus tard celui qu'on voulait garder.
    if (corps.proprietaire) {
      args.push(`--proprietaire=${corps.proprietaire}`)
      if (corps.nom) args.push(`--nom=${String(corps.nom).slice(0, 60)}`)
    }
    args.push('--json')
    return repondJson(res, 202, travailLance(lanceTravail(args)))
  }

  if (est('POST', 'api', 'videos', '*', 'voix')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    if (!corps.voiceId) throw new ErreurHttp(400, `Donne la voix : { "voiceId": "…" }.`)
    const args = [scriptOutil('choix-voix.mjs'), slug, `--voix=${corps.voiceId}`]
    // Une voix de la bibliothèque n'est pas utilisable telle quelle : la commande
    // l'ajoute d'abord au compte, ce qui est gratuit et instantané. Sans ça, la
    // conversion la refuserait — après la coupe et la transcription.
    if (corps.proprietaire) {
      args.push(`--proprietaire=${corps.proprietaire}`)
      if (corps.nom) args.push(`--nom=${String(corps.nom).slice(0, 60)}`)
    }
    // LE RÉGLAGE PART AVEC LA VOIX, SINON L'ESSAI N'AURA SERVI À RIEN.
    //
    // C'est le seul moyen que le montage emploie ce qu'on vient d'écouter :
    // sans lui, la conversion complète retomberait sur 0,5 quoi qu'on ait
    // choisi à l'oreille.
    const stab = reglageBorne(corps.stabilite)
    if (stab !== undefined) args.push(`--stabilite=${stab}`)
    const sim = reglageBorne(corps.similarite)
    if (sim !== undefined) args.push(`--similarite=${sim}`)
    args.push('--json')
    const t = await lanceEtAttends(args, { msMax: 60_000 })
    return repondJson(res, 200, { ...travailFini(t), etat: etatDe(slug) })
  }

  // ------------------------------------------------------- l'audio complet --
  if (est('POST', 'api', 'videos', '*', 'audio', 'generer')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const { secondes, source } = dureeAConvertir(slug)

    // LE MOTEUR DÉCIDE S'IL Y A UN DEVIS À PRÉSENTER, ET C'EST TOUT.
    //
    // `sts` part chez ElevenLabs et se paie : le §7 impose d'annoncer le coût
    // avant. `local` tourne sur la carte du poste et `brute` ne convertit rien
    // — les deux sont gratuits, et leur poser une fenêtre de devis à zéro euro
    // apprendrait à cliquer « oui » sans lire, ce qui viderait la question de
    // son sens le jour où elle porte un vrai montant.
    const moteur = String(corps?.moteur ?? 'sts')
    if (!['sts', 'local', 'brute'].includes(moteur)) {
      throw new ErreurHttp(400, `moteur : sts, local ou brute.`)
    }

    if (moteur === 'sts') {
      // SANS TIMBRE RETENU, ON REFUSE AVANT DE FAIRE PAYER.
      //
      // `--voix=sts` ne porte pas d'identifiant : il dit quel MOTEUR employer,
      // le timbre vient de la cascade (§8). Sur une chaîne neuve, aucun des
      // quatre niveaux n'est rempli — `nouvelle-chaine` vide
      // `elevenlabs_voice_id`, et la vidéo n'a rien choisi. La conversion
      // partait quand même : devis accepté, coupe faite, transcription faite,
      // et l'échec tombait à la conversion. On vérifie donc AVANT le devis, et
      // on renvoie à l'étape où le timbre se choisit.
      const retenue = etatDe(slug).etapes.voixChoisie
      if (!retenue?.voiceId) {
        throw new ErreurHttp(
          409,
          `Aucun timbre ElevenLabs retenu pour « ${slug} » — la conversion n'aurait rien à plaquer. ` +
            `Va à l'étape 3, cherche une voix dans le catalogue et retiens-la ; ` +
            `ou choisis un autre moteur ici.`
        )
      }
      exigeConfirmation(corps, `audio:${slug}:${Math.round(secondes)}`, {
        ...coutElevenlabs(secondes),
        estimee_sur: source,
        quoi: `Conversion de toute la prise de « ${slug} » chez ElevenLabs.`,
      })
    }

    if (moteur === 'local') {
      // MEME GARDE, AUTRE MOTEUR : on refuse AVANT, pas apres douze minutes.
      //
      // Sans modele entraine, la conversion locale echoue — mais elle echoue a
      // la fin, apres la coupe et la transcription. Le message etait juste et
      // arrivait trop tard, et il renvoyait au terminal alors que la recolte et
      // l'entrainement ont leur ecran a l'etape 3.
      const { modelesEntraines } = await import('../pipeline/lib/voix-locale.mjs')
      const entraines = modelesEntraines()
      if (!entraines.length) {
        throw new ErreurHttp(
          409,
          `Aucun modèle entraîné dans cette chaîne — la conversion locale n'aurait rien à plaquer. ` +
            `Va à l'étape 3, déroule « Empreintes locales » : récolte une voix, puis entraîne-la. ` +
            `Ou choisis « Ma voix telle quelle », qui ne convertit rien.`
        )
      }
    }

    if (moteur !== 'sts') {
      const args = [scriptPipeline('monte.mjs'), slug, '--depuis=voix', `--voix=${moteur}`]
      if (moteur === 'local' && corps?.modele) {
        if (!/^[a-z0-9][a-z0-9-]{0,60}$/i.test(String(corps.modele))) {
          throw new ErreurHttp(400, `Identifiant de modèle refusé.`)
        }
        // `--modele-voix=`, jamais `--modele=` : dans `monte`, ce dernier a
        // longtemps désigné aussi le modèle de transcription. Un nom de voix
        // partait alors à whisper, qui répondait « Invalid whisper model » —
        // après avoir converti la voix, donc douze minutes trop tard. La
        // commande sait maintenant reconnaître les deux, mais l'écran n'a
        // aucune raison de compter là-dessus : il nomme ce qu'il veut.
        args.push(`--modele-voix=${corps.modele}`)
      }
      if (moteur === 'local' && corps?.transpose !== undefined) {
        args.push(`--transpose=${Math.max(-24, Math.min(24, Number(corps.transpose) || 0))}`)
      }
      return repondJson(res, 202, travailLance(lanceTravail(args)))
    }

    // `--oui` court-circuite le garde-fou de `monte.mjs` (au-delà de cinq
    // minutes, il refuse de partir sans confirmation). C'est légitime ICI et
    // seulement ici : la confirmation vient d'être donnée par le client, sur un
    // coût calculé avec le même barème. Sans le drapeau, l'atelier resterait
    // bloqué sur une question posée à un terminal que personne ne regarde.
    // `--voix=sts` MANQUAIT, ET C'EST TOUT LE DEFAUT.
    //
    // Les branches `local` et `brute` passaient leur moteur ; celle-ci, non.
    // `monte.mjs` retombait donc sur le mode par defaut de la chaine — `local`
    // dans `config/chaine.json`. On choisissait « ElevenLabs » a l'ecran, le
    // journal repondait « voix (mode local) », et sur une chaine sans modele
    // entraine ca finissait par « Aucun modele entraine » : un message qui n'a
    // aucun rapport avec ce qu'on avait demande, apres la coupe et la
    // transcription. L'ecran disait une chose, la commande en faisait une autre.
    return repondJson(res, 202, travailLance(
      lanceTravail([scriptPipeline('monte.mjs'), slug, '--depuis=voix', '--voix=sts', '--oui'])
    ))
  }

  // ----------------------------------------------------------- sous-titres --
  if (est('GET', 'api', 'videos', '*', 'soustitres')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const t = await lanceEtAttends([scriptPipeline('soustitres.mjs'), slug, '--json'], { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('PUT', 'api', 'videos', '*', 'soustitres')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const champs = corps.champs && typeof corps.champs === 'object' ? corps.champs : corps
    const args = [scriptPipeline('soustitres.mjs'), slug, ...argumentsDeReglage(champs), '--json']
    if (args.length === 3) throw new ErreurHttp(400, `Aucun réglage à enregistrer.`)
    const t = await lanceEtAttends(args, { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // RENDRE UN CHAMP À LA CASCADE, PAS LUI RÉÉCRIRE SA VALEUR D'ORIGINE.
  //
  // La flèche à côté d'un curseur annule une modification. La tentation est de
  // réécrire l'ancienne valeur : ce serait la FIGER sur cette vidéo, et le jour
  // où la chaîne change sa taille de sous-titres, celle-ci garderait l'ancienne
  // sans que rien ne l'explique. On retire le champ, il redevient hérité.
  if (est('POST', 'api', 'videos', '*', 'soustitres', 'oublie')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const champs = Array.isArray(corps?.champs) ? corps.champs : []
    if (!champs.length) throw new ErreurHttp(400, `Dis quels champs oublier.`)
    if (champs.some((c) => !/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(String(c)))) {
      throw new ErreurHttp(400, `Nom de champ refusé.`)
    }
    const t = await lanceEtAttends(
      [scriptPipeline('soustitres.mjs'), slug, `--oublie=${champs.join(',')}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // Promouvoir les réglages de cette vidéo en défaut de la CHAÎNE. Ça touche
  // `config/chaine.json`, donc toutes les vidéos à venir : la commande écrit ce
  // qui est EFFECTIF à l'écran, et l'interface demande confirmation avant.
  if (est('POST', 'api', 'videos', '*', 'soustitres', 'defaut')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const t = await lanceEtAttends(
      [scriptPipeline('soustitres.mjs'), slug, '--defaut', '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'videos', '*', 'soustitres', 'valide')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const champs = corps.champs && typeof corps.champs === 'object' ? corps.champs : {}
    const t = await lanceEtAttends([
      scriptPipeline('soustitres.mjs'), slug, ...argumentsDeReglage(champs), '--valide', '--json',
    ], { msMax: 30_000 })
    return repondJson(res, 200, { ...travailFini(t), etat: etatDe(slug) })
  }

  // ----------------------------------------------------------- transcript ---
  if (est('GET', 'api', 'videos', '*', 'transcript')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    return sertFichier(req, res, dossierVideo(slug).transcript)
  }

  // ------------------------------------------------ correction du texte -----
  //
  // Whisper rend un mot qui SONNE juste : « devine quoi » devient « de quoi »,
  // et l'accord de « attirée » saute. Ça ne s'entend pas — la voix a dit le bon
  // mot — mais ça s'affiche en gros au milieu de l'écran.
  //
  // Le patch passe par la commande, qui refuse tout ce qui toucherait aux
  // horodatages : c'est eux qui calent les sous-titres, les punchs et les plans.
  // LE MOTEUR DE VOIX DE LA CHAÎNE, ET SON RÉGLAGE.
  //
  // Écrire dans `config/chaine.json` touche toutes les vidéos à venir : c'est
  // une décision de chaîne, et l'écran demande confirmation avant. Le modèle et
  // la transposition partent ensemble — retenir l'un sans l'autre donnerait un
  // timbre plaqué une octave trop bas, qu'on mettrait sur le dos du modèle.
  // LA VOIX FISH PAR DÉFAUT DE LA CHAÎNE.
  //
  // Elle n'avait aucun chemin : ni écran, ni commande. `voix.fish_voice_id` ne
  // se posait qu'en éditant `config/chaine.json` à la main, ce que le §5
  // interdit de faire sans prévenir. On pouvait choisir une voix Fish pour UNE
  // génération, jamais pour la chaîne — c'est le trou qu'on a lu comme « je ne
  // peux pas sélectionner les voix Fish ».
  if (est('POST', 'api', 'chaine', 'voix', 'defaut-fish')) {
    const corps = await litCorpsJson(req)
    const id = String(corps?.voiceId ?? '')
    if (!/^[a-z0-9]{8,64}$/i.test(id)) throw new ErreurHttp(400, `Identifiant de voix invalide.`)
    const t = await lanceEtAttends(
      [scriptOutil('choix-voix.mjs'), '--defaut', '--fish', `--voix=${id}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'chaine', 'voix', 'defaut')) {
    const corps = await litCorpsJson(req)
    if (!corps?.modele || !/^[a-z0-9][a-z0-9-]{0,60}$/i.test(String(corps.modele))) {
      throw new ErreurHttp(400, `Identifiant de modèle refusé.`)
    }
    const transpose = Math.max(-24, Math.min(24, Math.round(Number(corps.transpose) || 0)))
    const t = await lanceEtAttends(
      [
        scriptOutil('choix-voix.mjs'), '--defaut', '--local',
        `--modele=${corps.modele}`,
        `--transpose=${transpose}`,
        '--json',
      ],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // LES PLANS DE COUPE, UN PAR UN.
  //
  // Le montage en pose une trentaine sur deux minutes, choisis par une requête
  // en anglais dans une banque d'images. La plupart tombent juste ; deux ou
  // trois ne veulent rien dire, et ce sont ceux-là qu'on voit. Les compter ne
  // sert à rien — il faut les REGARDER.
  if (est('GET', 'api', 'videos', '*', 'plans')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const t = await lanceEtAttends(
      [scriptPipeline('broll.mjs'), slug, '--plans', '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // COMBIEN DE PLANS DE COUPE AURA CE MONTAGE.
  //
  // Le curseur « plans générés » a besoin d'une borne : proposer un budget de
  // trente sur une vidéo qui n'en compte que douze est un chiffre qui ne veut
  // rien dire, et le coût affiché à côté serait faux d'autant. La commande
  // n'appelle rien — elle compte les visuels du script, et du plan quand il
  // existe.
  if (est('GET', 'api', 'videos', '*', 'estimation')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const t = await lanceEtAttends(
      [scriptPipeline('broll.mjs'), slug, '--estime', '--json'],
      { msMax: 15_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // Refuser un plan en appelle un autre — on ne laisse jamais un trou, le
  // précédent s'étirerait et on fabriquerait le temps mort qu'on évitait.
  // Gratuit : la banque d'images ne se facture pas.
  // LA LISIBILITÉ SE MESURE À LA DEMANDE : deux à trois minutes pour un montage
  // complet, donc un travail de fond avec son journal, pas un appel bloquant.
  // EFFACER LA PISTE IMAGE : les dérivés partent, les décisions restent.
  //
  // `soustitres.json` vit dans le même dossier que `plan.json` — c'est une
  // décision réglée à l'œil devant l'aperçu, et l'emporter en effaçant les plans
  // serait le pire des échanges. La commande le garde ; cette route ne fait que
  // l'appeler.
  if (est('DELETE', 'api', 'videos', '*', 'plans')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const t = await lanceEtAttends(
      [scriptPipeline('broll.mjs'), slug, '--efface-plans', '--json'],
      { msMax: 120_000 }
    )
    return repondJson(res, 200, { ...travailFini(t), etat: etatDe(slug) })
  }

  if (est('POST', 'api', 'videos', '*', 'lisibilite')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    return repondJson(res, 202, travailLance(
      lanceTravail([scriptPipeline('broll.mjs'), slug, '--lisibilite', '--json'], {
        etiquette: `lisibilité des sous-titres — ${slug}`,
      })
    ))
  }

  if (est('POST', 'api', 'videos', '*', 'plans', '*', 'remplace')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const numero = Number(segments[4])
    if (!Number.isInteger(numero) || numero < 1 || numero > 999) {
      throw new ErreurHttp(400, `Numéro de plan invalide.`)
    }
    // LA SOURCE SE DEMANDE, ELLE NE SE DEVINE PAS — L UNE EST GRATUITE, L AUTRE
    // SE PAIE.
    //
    // Pexels ne coûte rien ; une génération fal coûte de 0,04 $ à 2,36 $ selon le
    // modèle retenu. Le §2 du CLAUDE.md interdit de lancer un appel payant sans
    // annoncer son prix, donc l écran le demande avant d appeler cette route. Ici
    // on se contente de refuser une source inconnue.
    const corps = await litCorpsJson(req).catch(() => ({}))
    const source = corps?.source === 'ia' ? 'ia' : 'pexels'
    const args = [scriptPipeline('broll.mjs'), slug, `--remplace=${numero}`, '--json']
    if (source === 'ia') args.push('--source=ia')

    // UNE GÉNÉRATION DURE TROIS MINUTES : ELLE NE PEUT PAS ATTENDRE EN SILENCE.
    //
    // La recherche en banque rend la main en quelques secondes — l attendre est
    // sans conséquence. La génération, non : le bouton restait figé deux à trois
    // minutes sans une ligne, ce qui est indiscernable d un plantage. Elle part
    // donc en travail de fond, comme l entraînement et la récolte, et son
    // journal défile pendant qu elle tourne.
    if (source === 'ia') {
      return repondJson(res, 202, travailLance(lanceTravail(args)))
    }
    const t = await lanceEtAttends(args, { msMax: 120_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // Les nombres dits en lettres, réécrits en chiffres. `voir` ne touche à rien
  // et rend la liste de ce qui changerait : sur quatre cents mots, appliquer
  // sans montrer serait impossible à relire.
  if (est('POST', 'api', 'videos', '*', 'texte', 'chiffres')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const args = [scriptPipeline('texte.mjs'), slug]
    args.push(corps?.applique === true ? '--chiffres' : '--chiffres=voir')
    args.push('--json')
    const t = await lanceEtAttends(args, { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('PUT', 'api', 'videos', '*', 'texte')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const patch = Array.isArray(corps) ? corps : corps?.corrections
    if (!Array.isArray(patch) || !patch.length) {
      throw new ErreurHttp(400, `Donne les corrections : { "corrections": [{ "i": 42, "texte": "devine" }] }.`)
    }
    if (patch.length > 500) throw new ErreurHttp(400, `Trop de corrections d'un coup (${patch.length}).`)

    // Le patch part sur l'ENTRÉE STANDARD, pas en argument : un mot corrigé
    // peut contenir n'importe quel caractère, et une ligne de commande n'est pas
    // un canal pour du texte libre.
    const t = await lanceEtAttends(
      [scriptPipeline('texte.mjs'), slug, '--corrige=-', '--json'],
      { msMax: 60_000, entree: JSON.stringify(patch) }
    )
    return repondJson(res, 200, { ...travailFini(t), etat: etatDe(slug) })
  }

  // Une vidéo est DÉPLACÉE dans videos/.corbeille/, pas supprimée : un rendu se
  // refait en huit minutes, un tournage jamais.
  if (est('DELETE', 'api', 'videos', '*')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const definitif = ['1', 'true', 'oui'].includes(String(url.searchParams.get('definitif') ?? ''))
    const args = [scriptPipeline('supprime.mjs'), slug]
    if (definitif) args.push('--definitif')
    args.push('--json')
    const t = await lanceEtAttends(args, { msMax: 60_000 })
    return repondJson(res, 200, { ...travailFini(t), videos: etats() })
  }

  if (est('GET', 'api', 'corbeille')) {
    const t = await lanceEtAttends([scriptPipeline('supprime.mjs'), '--corbeille', '--json'], { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // VIDER LA CORBEILLE PASSE PAR SA PROPRE ROUTE.
  //
  // La tentation était d'appeler `DELETE /api/videos/:slug?definitif=1` pour
  // chaque entrée, en retrouvant le slug avant l'horodatage. Ç'aurait supprimé
  // la vidéo VIVANTE portant ce slug — celle qu'on est peut-être en train de
  // monter — et pas l'entrée mise de côté, qui vit dans `videos/.corbeille/`.
  // `supprime.mjs --vide-corbeille` sait, lui, de quoi il parle.
  if (est('DELETE', 'api', 'corbeille')) {
    const t = await lanceEtAttends(
      [scriptPipeline('supprime.mjs'), '--vide-corbeille', '--json'],
      { msMax: 60_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'corbeille', 'restaure')) {
    const corps = await litCorpsJson(req)
    if (!corps?.nom) throw new ErreurHttp(400, `Donne le nom à restaurer.`)
    const t = await lanceEtAttends(
      [scriptPipeline('supprime.mjs'), `--restaure=${corps.nom}`, '--json'],
      { msMax: 60_000 }
    )
    return repondJson(res, 200, { ...travailFini(t), videos: etats() })
  }

  // ---------------------------------------------- tes propres plans de coupe --
  //
  // La bibliothèque appartient à la CHAÎNE, pas à une vidéo : ces routes ne
  // portent donc pas de slug, sauf celle qui demande où les plans tomberaient.
  if (est('GET', 'api', 'broll')) {
    const t = await lanceEtAttends([scriptPipeline('broll.mjs'), '--json'], { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'broll')) {
    const { champs, fichier } = await litMultipart(req, { tailleMax: TAILLE_MAX })
    let aEffacer = true
    try {
      const mots = String(champs.mots ?? '').trim()
      if (!mots) throw new ErreurHttp(400, `Donne au moins un mot-clé : sans eux ce plan ne serait jamais choisi.`)
      const args = [scriptPipeline('broll.mjs'), `--ajoute=${fichier.chemin}`, `--mots=${mots}`]
      // Le nom d'origine est perdu par le dépôt temporaire : on le repasse pour
      // que la bibliothèque garde un nom lisible plutôt qu'un identifiant.
      if (champs.nom) args.push(`--nom=${String(champs.nom).slice(0, 80)}`)
      if (champs.note) args.push(`--note=${String(champs.note).slice(0, 200)}`)
      if (champs.emplois) args.push(`--emplois=${Math.max(1, Math.min(20, Number(champs.emplois) || 1))}`)
      args.push('--json')
      const t = await lanceEtAttends(args, { msMax: 120_000 })
      return repondJson(res, 200, travailFini(t))
    } finally {
      if (aEffacer) supprime(fichier.chemin)
    }
  }

  if (est('PUT', 'api', 'broll', '*')) {
    const corps = await litCorpsJson(req)
    const mots = String(corps?.mots ?? '').trim()
    if (!mots) throw new ErreurHttp(400, `Donne les mots-clés.`)
    const t = await lanceEtAttends(
      [scriptPipeline('broll.mjs'), `--mots-de=${segments[2]}`, `--mots=${mots}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('DELETE', 'api', 'broll', '*')) {
    const t = await lanceEtAttends(
      [scriptPipeline('broll.mjs'), `--retire=${segments[2]}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // ------------------------------------------------------- les inspirations --
  //
  // LE CARNET APPARTIENT À LA CHAÎNE, PAS À UNE VIDÉO.
  //
  // Une référence n'est liée à aucun montage : on la garde parce qu'elle dit
  // quelque chose sur la manière de faire, et elle resservira sur la dixième
  // vidéo comme sur la première. Ces routes ne portent donc pas de slug.
  //
  // Rien ici n'est payant : yt-dlp télécharge, Whisper transcrit, tout en local.
  // C'est pourquoi le dépôt ne passe pas par `exigeConfirmation`.
  if (est('GET', 'api', 'inspirations')) {
    const t = await lanceEtAttends([scriptPipeline('inspirations.mjs'), '--json'], { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'inspirations')) {
    const corps = await litCorpsJson(req)
    const url = String(corps?.url ?? '').trim()
    if (!url) throw new ErreurHttp(400, `Colle l'adresse de la vidéo : { "url": "https://…" }.`)
    if (url.length > 2048) throw new ErreurHttp(400, `Adresse trop longue.`)

    // L'ADRESSE EST VALIDÉE ICI AUSSI, ET AVEC LE MÊME CODE QUE LA COMMANDE.
    //
    // Elle part en argument d'un programme externe : une chaîne commençant par
    // un tiret serait lue par yt-dlp comme une option. La commande la refuserait
    // de toute façon — mais son refus arrive APRÈS le lancement du travail,
    // donc au fond d'un journal, alors qu'ici il revient dans le champ de
    // saisie. On importe sa fonction plutôt que de recopier la liste des
    // plateformes : deux listes finissent toujours par diverger.
    let adresse
    try {
      adresse = verifieUrlInspiration(url)
    } catch (e) {
      throw new ErreurHttp(400, e.message)
    }

    const args = [scriptPipeline('inspirations.mjs'), adresse]
    if (corps.sansVideo) args.push('--sans-video')
    if (corps.hauteur) args.push(`--hauteur=${Math.max(144, Math.min(1080, Number(corps.hauteur) || 720))}`)
    if (corps.refais) args.push('--refais')
    args.push('--json')
    // Le téléchargement puis la transcription prennent de quelques secondes à
    // plusieurs minutes : c'est un travail de fond, avec son journal en direct.
    return repondJson(res, 202, travailLance(lanceTravail(args)))
  }

  if (est('DELETE', 'api', 'inspirations', '*')) {
    const t = await lanceEtAttends(
      [scriptPipeline('inspirations.mjs'), `--retire=${segments[2]}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('GET', 'api', 'inspirations', '*', 'texte')) {
    const t = await lanceEtAttends(
      [scriptPipeline('inspirations.mjs'), `--texte=${segments[2]}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // --------------------------------------------------------- les empreintes --
  //
  // UNE EMPREINTE DE VOIX APPARTIENT À LA CHAÎNE, COMME LE CARNET.
  //
  // Elle ne dépend d'aucun slug : la voix récoltée servira sur toutes les
  // vidéos. Ces routes n'en portent donc pas — elles vivent à côté de celles
  // des inspirations, pour la même raison qu'elles.
  //
  // Rien n'est payant : yt-dlp télécharge, les modèles UVR séparent, tout en
  // local. Le dépôt ne passe donc pas par `exigeConfirmation`.
  if (est('GET', 'api', 'empreintes')) {
    const t = await lanceEtAttends([scriptPipeline('empreinte.mjs'), '--liste', '--json'], {
      msMax: 30_000,
    })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'empreintes')) {
    const corps = await litCorpsJson(req)

    // UNE RÉCOLTE SÉRIEUSE ARRIVE PAR PAQUETS, PAS UNE ADRESSE À LA FOIS.
    //
    // Un entraînement demande quinze à trente minutes de voix propre, et une
    // source en rend rarement plus d'une ou deux : c'est trente liens, pas un.
    // `url` reste accepté au singulier pour ne rien casser.
    const brutes = Array.isArray(corps?.urls)
      ? corps.urls
      : String(corps?.url ?? '').split(/\r?\n/)
    const liste = brutes.map((u) => String(u ?? '').trim()).filter(Boolean)

    if (!liste.length) throw new ErreurHttp(400, `Colle au moins une adresse.`)
    if (liste.length > 200) throw new ErreurHttp(400, `${liste.length} adresses d'un coup, c'est trop.`)
    if (liste.some((u) => u.length > 2048)) throw new ErreurHttp(400, `Adresse trop longue.`)

    // Même validation, même code que la commande — deux listes de plateformes
    // finiraient par diverger. On valide TOUT avant de lancer : une faute au
    // dix-septième lien doit revenir dans le champ de saisie, pas au fond d'un
    // journal une demi-heure plus tard.
    let adresses
    try {
      adresses = liste.map((u) => verifieSource(u))
    } catch (e) {
      throw new ErreurHttp(400, e.message)
    }

    const args = [scriptPipeline('empreinte.mjs'), ...adresses]
    // Le nom range plusieurs vidéos du même locuteur au même endroit. Il finit
    // en nom de dossier : on le borne ici, la commande le passant au tamis de
    // `slugifie` derrière.
    const nom = String(corps?.nom ?? '').trim().slice(0, 60)
    if (nom) args.push(`--nom=${nom}`)
    if (corps?.marge !== undefined) {
      args.push(`--marge=${Math.max(0, Math.min(60, Number(corps.marge) || 20))}`)
    }
    args.push('--json')

    // Téléchargement puis séparation : de quelques dizaines de secondes à
    // plusieurs minutes selon la durée. C'est un travail de fond, avec journal.
    return repondJson(res, 202, travailLance(lanceTravail(args)))
  }

  // ---- déposer un fichier plutôt que de donner une adresse ----------------
  //
  // POURQUOI UN FICHIER À LA FOIS, ET PAS UN LOT.
  //
  // `litMultipart` refuse par principe plus d'un fichier par envoi, et c'est
  // une brique de sécurité qu'on n'élargit pas pour un confort d'écran. Le
  // client boucle donc, un envoi par fichier — ce qui n'enlève rien : le
  // manifeste cumule et se réécrit après CHAQUE source, donc déposer cinq
  // fichiers l'un après l'autre dans le même `--nom=` donne exactement la même
  // empreinte qu'un lot, et une interruption au troisième garde les deux
  // premiers.
  //
  // C'est aussi la sortie de secours des plateformes qui exigent une session :
  // on télécharge la vidéo à la main, on la dépose ici, aucun cookie en jeu.
  if (est('POST', 'api', 'empreintes', 'fichier')) {
    const { champs, fichier } = await litMultipart(req, { tailleMax: TAILLE_MAX })
    let aEffacer = true
    try {
      if (!fichier) throw new ErreurHttp(400, `Aucun fichier reçu.`)

      const args = [scriptPipeline('empreinte.mjs'), fichier.chemin]
      const nom = String(champs?.nom ?? '').trim().slice(0, 60)
      if (nom) args.push(`--nom=${nom}`)
      // Le nom d'origine, pour que le manifeste garde autre chose que le nom
      // temporaire. Il vient du client : on le borne et on lui retire tout ce
      // qui pourrait passer pour autre chose qu'un titre.
      const titre = String(fichier.nom ?? '').replace(/[\r\n"]/g, '').trim().slice(0, 120)
      if (titre) args.push(`--titre=${titre}`)
      if (champs?.marge !== undefined) {
        args.push(`--marge=${Math.max(0, Math.min(60, Number(champs.marge) || 20))}`)
      }
      args.push('--json')

      const t = lanceTravail(args)
      // LE TEMPORAIRE NE S'EFFACE PAS ICI : L'ENFANT LE LIT ENCORE.
      //
      // Même piège que le dépôt d'un rush. `empreinte.mjs` sépare, mesure et
      // découpe — plusieurs minutes pendant lesquelles le fichier doit rester.
      // On attend donc la vraie fin, en arrière-plan, pour le retirer.
      attendTravail(t, 3_600_000).then(() => supprime(fichier.chemin), () => {})
      aEffacer = false
      return repondJson(res, 202, travailLance(t))
    } finally {
      if (aEffacer && fichier) supprime(fichier.chemin)
    }
  }

  if (est('DELETE', 'api', 'empreintes', '*')) {
    const t = await lanceEtAttends(
      [scriptPipeline('empreinte.mjs'), `--retire=${segments[2]}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // RETIRER UNE SOURCE, PAS L'EMPREINTE ENTIÈRE.
  //
  // ON DÉSIGNE PAR LE TITRE, ET SÛREMENT PAS PAR LE RANG.
  //
  // Le rang était le premier choix, parce que c'est ce qu'affiche `--detail`.
  // C'était un piège : retirer une source RENUMÉROTE toutes les suivantes. Entre
  // le clic et la fin de la commande, la liste à l'écran porte encore les
  // anciens numéros — et un second clic pendant ce temps désigne une autre
  // source que celle qu'on regarde. La confirmation, elle, affiche le bon titre.
  // On supprime donc autre chose que ce qu'on vient de lire et d'approuver, en
  // silence, sans retour possible : les extraits sont effacés et le fichier
  // d'origine d'un dépôt n'existe plus.
  //
  // Le titre ne bouge pas quand la liste change. La commande refuse s'il en
  // désigne deux, ce qui est le bon comportement : mieux vaut demander le rang
  // que retirer au hasard.
  if (est('DELETE', 'api', 'empreintes', '*', 'sources')) {
    const corps = await litCorpsJson(req)
    const titre = String(corps?.titre ?? '').trim()
    if (!titre) throw new ErreurHttp(400, `Donne le titre de la source à retirer.`)
    const t = await lanceEtAttends(
      [
        scriptPipeline('empreinte.mjs'),
        `--retire-source=${titre}`,
        `--de=${segments[2]}`,
        '--json',
      ],
      { msMax: 60_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // ------------------------------------------------------------ les modèles --
  //
  // L'ENTRAÎNEMENT EST LE SEUL TRAVAIL DE L'ATELIER QUI SE COMPTE EN HEURES.
  //
  // Tout le reste rend la main en secondes ou en minutes. Celui-ci tourne de
  // trente minutes à deux heures et sature la carte graphique. Il passe par le
  // même mécanisme de travail de fond que les autres — il n'a pas de délai
  // maximum, et son journal défile — mais l'écran doit le dire avant de lancer,
  // sinon on le prend pour un bouton qui a planté.
  //
  // Rien n'est payant ici non plus : c'est du calcul local.
  if (est('GET', 'api', 'modeles')) {
    const t = await lanceEtAttends([scriptPipeline('entraine.mjs'), '--liste', '--json'], {
      msMax: 30_000,
    })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'modeles')) {
    const corps = await litCorpsJson(req)
    const id = String(corps?.id ?? '').trim()
    // L'identifiant devient un nom de dossier et un nom de modèle : on le borne
    // ici, la commande refusant de son côté tout ce qui sortirait de marque/voix/.
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/i.test(id)) {
      throw new ErreurHttp(400, `Identifiant d'empreinte refusé : « ${id.slice(0, 40)} ».`)
    }
    const args = [scriptPipeline('entraine.mjs'), id]
    for (const [cle, min, max] of [['epoques', 10, 5000], ['lot', 1, 64]]) {
      if (corps?.[cle] !== undefined) {
        args.push(`--${cle}=${Math.max(min, Math.min(max, Number(corps[cle]) || 0))}`)
      }
    }
    args.push('--json')
    return repondJson(res, 202, travailLance(lanceTravail(args)))
  }

  if (est('DELETE', 'api', 'modeles', '*')) {
    const t = await lanceEtAttends(
      [scriptPipeline('entraine.mjs'), `--retire=${segments[2]}`, '--json'],
      { msMax: 30_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('GET', 'api', 'videos', '*', 'broll')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const t = await lanceEtAttends([scriptPipeline('broll.mjs'), slug, '--json'], { msMax: 30_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // ---------------------------------------------------------- plans, rendu --
  if (est('POST', 'api', 'videos', '*', 'plans')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)

    // « `--depuis=cale`, C'EST GRATUIT » : C'ÉTAIT FAUX, ET DE FAÇON ATTEIGNABLE.
    //
    // `monte.mjs:190` teste `force('voix') || !fs.existsSync(audioFinal)`. Le
    // drapeau met bien le premier terme à faux — mais le SECOND suffit : quand
    // `03-audio/voix-finale.wav` manque, l'étape 3 tourne quand même et lance
    // la conversion ElevenLabs entière.
    //
    // Le cas n'est pas théorique, c'est celui que CLAUDE.md §4 prescrit : on
    // produit depuis deux postes, et seuls `01-script.json`, `04-transcript.json`
    // et `05-montage/` voyagent. Sur le second poste, le plan et le transcript
    // sont là, l'audio non. Le bouton « construire le montage » facturait donc
    // une conversion sans qu'aucun devis n'apparaisse.
    //
    // Pire : `--oui` n'étant pas passé, `monte.mjs` refuse au-dessus de cinq
    // minutes. Le garde-fou arrêtait les grosses factures et laissait passer
    // les petites, en silence.
    //
    // On ne suppose donc plus la gratuité : on la VÉRIFIE, et si l'audio
    // manque, on passe par le même devis que les autres routes payantes.
    const audioFinal = path.join(dossierVideo(slug).audio, 'voix-finale.wav')
    if (!fs.existsSync(audioFinal)) {
      const { secondes, source } = dureeAConvertir(slug)
      exigeConfirmation(corps, `plans:${slug}:${Math.round(secondes)}`, {
        ...coutElevenlabs(secondes),
        quoi:
          `« ${slug} » n'a pas d'audio converti : construire le montage lancera ` +
          `d'abord la conversion de voix. Estimée sur : ${source}.`,
      })
      // La conversion est assumée : on passe `--oui` pour que `monte.mjs` ne
      // refuse pas au-delà de cinq minutes après qu'on a déjà donné l'accord.
      return repondJson(res, 202, travailLance(
        lanceTravail([scriptPipeline('monte.mjs'), slug, '--depuis=cale', '--oui'])
      ))
    }

    // LES DEUX OPTIONS PAYANTES DU MONTAGE, ET UN SEUL DEVIS.
    //
    // L'ouverture générée coûte un plan. Les plans générés en coûtent autant
    // chacun, et leur NOMBRE est maintenant décidé par la personne : c'est le
    // curseur de l'étape 6. Ce qu'on approuve reste le PIRE CAS — le budget
    // entier — et le journal dit ensuite combien ont réellement servi, parce
    // qu'un budget non employé n'est pas facturé. Deux devis successifs pour un
    // seul clic feraient deux dialogues à la file, ce qu'on ne lit plus.
    //
    // `combleIa` reste accepté : un onglet ouvert avant la mise à jour porte
    // encore l'ancien `app.js`, et un booléen silencieusement ignoré aurait
    // lancé un montage sans le comblage qu'on venait de cocher.
    const PLANS_IA_MAX = 30
    const plansIa = Number.isFinite(Number(corps?.plansIa))
      ? Math.max(0, Math.min(PLANS_IA_MAX, Math.round(Number(corps.plansIa))))
      : corps?.combleIa === true ? 3 : 0
    // LE PRIX SUIT LE MODÈLE, IL N'EST PLUS UN NOMBRE ÉCRIT ICI.
    //
    // Il valait 0,18 $ en dur. Les tarifs relevés le 7 septembre 2026 vont de
    // 0,04 $ (LTX, par vidéo) à 2,37 $ (Seedance 2.5, 5 s à 0,473 $/s) : un
    // facteur soixante. Un devis figé aurait donc annoncé six fois trop peu sur
    // le modèle le plus cher — c'est-à-dire fait accepter une dépense qu'on n'a
    // pas montrée, ce que le §7 interdit.
    const { modeleDePlan, coutDUnPlan, MODELES_PLAN } = await import('../pipeline/lib/fal.mjs')
    // LE MODÈLE PEUT ÊTRE CHOISI POUR CE MONTAGE-CI.
    //
    // Celui de la chaîne reste le défaut ; l'écran de l'étape 6 peut en imposer
    // un autre — c'est là que la dépense se décide, et refaire une ouverture
    // avec un modèle plus cher ne doit pas obliger à basculer toute la chaîne.
    const voulu = String(corps?.modeleVideo ?? '')
    if (voulu && !MODELES_PLAN[voulu]) throw new ErreurHttp(400, `Modèle vidéo inconnu.`)
    const modeleVideo = voulu || modeleDePlan(litChaine())
    // Cinq secondes : la durée d'un plan de coupe ordinaire. Le vrai calcul se
    // fait plan par plan au montage ; ici on borne le PIRE CAS.
    const PRIX_PLAN = coutDUnPlan(modeleVideo, 5)
    const args = [scriptPipeline('monte.mjs'), slug, '--depuis=cale']
    if (voulu) args.push(`--modele-video=${voulu}`)
    // « Reprendre des plans différents » : sans ça, un remontage redonne
    // exactement les mêmes — la banque rend ses candidats dans le même ordre et
    // la vidéo courante est exclue de la fenêtre de réemploi.
    if (corps?.refaisPlans === true) args.push('--refais-plans')
    let dollars = 0
    const quoi = []
    if (corps.ouvertureIa === true) {
      args.push('--ouverture=ia')
      dollars += PRIX_PLAN
      quoi.push(
        `le plan d'ouverture sera généré par IA — un gros plan de visage avec ` +
          `l'émotion du passage — au lieu d'être pris en banque`
      )
    }
    if (plansIa > 0) {
      args.push(`--plans-ia=${plansIa}`)
      dollars += PRIX_PLAN * plansIa
      quoi.push(
        `jusqu'à ${plansIa} plan(s) seront générés — le script est lu en entier et ` +
          `la génération va aux passages qu'une banque d'images ne peut pas servir, ` +
          `le reste du budget comblant les trous`
      )
    }
    if (dollars > 0) {
      exigeConfirmation(corps, `plans-ia:${slug}:${args.join(' ')}`, {
        service: 'fal',
        // Arrondi au centime : une somme de virgules flottantes donne
        // « 9.459999999999999 », et un devis qui affiche ça n'inspire rien.
        dollars: Math.round(dollars * 100) / 100,
        bareme:
          `${PRIX_PLAN.toFixed(2)} $ par plan de 5 s avec ` +
          `${MODELES_PLAN[modeleVideo]?.nom ?? modeleVideo}`,
        quoi: `Sur « ${slug} » : ${quoi.join(' ; ')}. Plafond annoncé, pas montant certain.`,
      })
    }
    return repondJson(res, 202, travailLance(lanceTravail(args)))
  }

  if (est('POST', 'api', 'videos', '*', 'rendu')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const args = [scriptPipeline('rends.mjs'), slug]
    if (corps.brouillon === true) {
      // Un brouillon qui écrirait sur `06-rendu/<slug>.mp4` remplacerait le
      // master par une moitié de définition, et personne ne s'en apercevrait
      // avant la mise en ligne. Il a son propre fichier.
      args.push('--brouillon', `--sortie=videos/${slug}/06-rendu/${slug}-brouillon.mp4`)
    }
    // L'EXTRAIT DE CONTRÔLE ÉCRIT AILLEURS, LUI AUSSI.
    //
    // Sans `--sortie`, trois secondes de rendu remplaceraient le master complet
    // — même piège que le brouillon, en pire : le fichier ferait la bonne
    // définition et la mauvaise durée, ce qui ne se voit pas dans une liste.
    if (corps.extrait && /^\d+-\d+$/.test(String(corps.extrait))) {
      args.push(`--extrait=${corps.extrait}`, `--sortie=videos/${slug}/06-rendu/${slug}-extrait.mp4`)
    }
    // ON REND LE CHEMIN DE CE QU'ON PRODUIT, PAS SEULEMENT LE TRAVAIL.
    //
    // Un brouillon et un extrait n'écrivent pas sur le master — c'est voulu,
    // sinon trois secondes remplaceraient la vidéo entière. Mais l'écran ne
    // savait pas non plus où ils atterrissaient : il annonçait « rendu
    // terminé » et continuait de montrer le master absent. Le fichier existait,
    // sur le disque, et nulle part ailleurs.
    const fichier =
      corps.extrait && /^\d+-\d+$/.test(String(corps.extrait))
        ? `videos/${slug}/06-rendu/${slug}-extrait.mp4`
        : corps.brouillon === true
          ? `videos/${slug}/06-rendu/${slug}-brouillon.mp4`
          : null
    return repondJson(res, 202, { ...travailLance(lanceTravail(args)), fichier })
  }

  // ------------------------------------------------------ fabriquer la voix --
  //
  // Le texte devient une prise. Payant chez Fish, mais à un dixième de centime
  // la minute : le devis est annoncé à l'écran, et la route le borne.
  // TES MOTS, POUR ESSAYER UNE VOIX SUR TON PROPRE TEXTE.
  //
  // Fish ne convertit pas un enregistrement — il lit. La question « comment
  // sonnerait ma prise avec cette voix » a pourtant une reponse : lui faire dire
  // CE QU'ON A DIT. Memes mots, meme longueur, meme sujet. Une phrase de
  // demonstration ne repond pas a ca : on juge alors le texte autant que la voix.
  if (est('GET', 'api', 'videos', '*', 'mots-essai')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const secondes = Math.max(2, Math.min(120, Number(url.searchParams.get('secondes')) || 20))
    const t = await lanceEtAttends(
      [scriptPipeline('parle.mjs'), `--mots-de-la-prise=${slug}`, `--secondes=${secondes}`, '--json'],
      { msMax: 15_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('GET', 'api', 'voix-fish')) {
    // LA RECHERCHE ET LA PAGE PARTENT AU SERVEUR, PAS AU FILTRE LOCAL.
    //
    // L'écran chargeait cent voix et filtrait dedans : taper un nom qui existe
    // à la trois-centième position ne rendait rien, et on en concluait que la
    // voix n'existait pas. La bibliothèque Fish se compte en milliers ; elle se
    // parcourt, elle ne se télécharge pas.
    const args = [scriptPipeline('parle.mjs'), '--voix=?', '--json']
    const cherche = String(url.searchParams.get('cherche') ?? '').trim()
    if (cherche) {
      if (cherche.length > 60) throw new ErreurHttp(400, `Recherche trop longue.`)
      args.push(`--cherche=${cherche}`)
    }
    const langue = String(url.searchParams.get('langue') ?? '').trim()
    if (langue) {
      if (!/^[a-z]{2}$|^toutes$/.test(langue)) throw new ErreurHttp(400, `Langue invalide.`)
      args.push(`--langue=${langue}`)
    }
    const page = Number(url.searchParams.get('page') ?? 1)
    if (Number.isFinite(page) && page > 1) {
      args.push(`--page=${Math.min(50, Math.round(page))}`)
      // Paginer ne change que la bibliothèque : les voix du compte et le solde
      // n'ont pas bougé, et l'écran les garde. Deux tiers de seconde gagnés sur
      // chaque « charger 100 de plus ».
      args.push('--bibliotheque-seule')
    }
    const t = await lanceEtAttends(args, { msMax: 20_000 })
    return repondJson(res, 200, travailFini(t))
  }

  // DIRIGER LE TEXTE — la passe qui comprend l'émotion avant qu'on fabrique.
  //
  // Synchrone, parce qu'elle rend du TEXTE qu'on repose dans le champ de saisie.
  // Un travail asynchrone aurait obligé l'écran à retrouver la phrase dans un
  // journal, ce qui casse au premier message reformulé.
  if (est('POST', 'api', 'videos', '*', 'dirige')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const texte = String(corps?.texte ?? '').trim()
    if (!texte) throw new ErreurHttp(400, `Le texte à diriger est vide.`)
    if (texte.length > 20_000) throw new ErreurHttp(400, `Texte trop long (${texte.length} caractères).`)
    const t = await lanceEtAttends(
      [scriptPipeline('parle.mjs'), slug, '--dirige', '--json', '--texte=-'],
      { msMax: 180_000, entree: texte }
    )
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'videos', '*', 'parle')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const texte = String(corps?.texte ?? '').trim()
    if (!texte) throw new ErreurHttp(400, `Le texte à lire est vide.`)
    // Un script de dix minutes fait environ dix mille caractères ; au-delà de
    // vingt mille, c'est une erreur de collage, pas une intention.
    if (texte.length > 20_000) throw new ErreurHttp(400, `Texte trop long (${texte.length} caractères).`)

    // Le texte passe par l'entrée standard : un script porte des sauts de ligne,
    // et le garde des arguments les refuse — à raison.
    // `--json` DÈS LE DÉPART, PAS SEULEMENT POUR LA PRISE.
    //
    // Il manquait, et l'écran n'a jamais pu retrouver le fichier d'un essai : la
    // commande fabriquait bien le wav, l'écrivait dans `03-audio/essais/`, et
    // journalisait son chemin — mais `travailFini` ne lit que la sortie JSON.
    // Le lecteur restait donc vide en annonçant que « l'essai n'a rien rendu »,
    // sur un essai qui avait parfaitement réussi et qui était payé.
    const args = [scriptPipeline('parle.mjs'), slug, '--texte=-', '--json']
    if (corps?.voix) {
      const v = String(corps.voix)
      if (!/^[a-z0-9]{8,64}$/i.test(v)) throw new ErreurHttp(400, `Voix invalide.`)
      args.push(`--voix=${v}`)
    }
    if (corps?.modele) {
      const m = String(corps.modele)
      if (!['s1', 's2.1-pro', 'speech-1.6'].includes(m)) throw new ErreurHttp(400, `Modèle inconnu.`)
      args.push(`--modele=${m}`)
    }
    const t = Number(corps?.temperature)
    if (Number.isFinite(t)) args.push(`--temperature=${Math.max(0.1, Math.min(1.5, t))}`)
    const d = Number(corps?.debit)
    if (Number.isFinite(d)) args.push(`--debit=${Math.max(0.5, Math.min(2, d))}`)
    if (corps?.modeleLocal) {
      const m = String(corps.modeleLocal)
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(m)) throw new ErreurHttp(400, `Modèle local invalide.`)
      args.push(`--modele-local=${m}`)
    }
    if (corps?.essai === true) args.push('--essai')
    else if (corps?.refais === true) args.push('--refais')

    return repondJson(res, 202, travailLance(lanceTravail(args, { entree: texte })))
  }

  // -------------------------------------------------------------- la copie --
  //
  // Reproduire une vidéo de référence avec un avatar. Payant, donc annoncé :
  // l'écran donne son devis avant, et la route le répète (§2, §7).
  if (est('POST', 'api', 'videos', '*', 'copie')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const lien = String(corps?.lien ?? '').trim()
    const avatar = String(corps?.avatar ?? '').trim()
    if (!/^https?:\/\//i.test(lien)) throw new ErreurHttp(400, `Donne un lien http(s) valide.`)
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(avatar)) throw new ErreurHttp(400, `Avatar invalide.`)
    const plans = Math.max(1, Math.min(12, Number(corps?.plans) || 3))
    return repondJson(res, 202, travailLance(lanceTravail([
      scriptPipeline('copie.mjs'), slug, `--lien=${lien}`, `--avatar=${avatar}`, `--plans=${plans}`,
    ])))
  }

  // ------------------------------------------------------------ les avatars --
  //
  // UN AVATAR APPARTIENT À LA CHAÎNE, PAS À UNE VIDÉO.
  //
  // Comme la voix et la direction artistique, il vit dans `marque/` et sert à
  // toutes les vidéos. D'où un espace à lui dans l'atelier plutôt qu'une étape
  // de production : on n'ajoute pas un visage à chaque tournage.
  if (est('GET', 'api', 'avatars')) {
    const t = await lanceEtAttends([scriptPipeline('avatars.mjs'), '--json'], { msMax: 15_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('POST', 'api', 'avatars')) {
    const { champs, fichier } = await litMultipart(req, { tailleMax: TAILLE_MAX })
    try {
      const id = String(champs.id ?? '').trim()
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) {
        throw new ErreurHttp(400, `Identifiant invalide : minuscules, chiffres et tirets.`)
      }
      // `--ajoute` crée, `--photos` complète : c'est l'écran qui sait lequel des
      // deux, puisque lui seul connaît la liste déjà affichée.
      const drapeau = champs.existe === 'oui' ? '--photos' : '--ajoute'
      const args = [scriptPipeline('avatars.mjs'), `${drapeau}=${id}`]
      if (champs.nom) args.push(`--nom=${String(champs.nom).slice(0, 60)}`)
      if (champs.signe) args.push(`--signe=${String(champs.signe).slice(0, 200)}`)
      args.push(fichier.chemin)
      const t = await lanceEtAttends(args, { msMax: 60_000 })
      return repondJson(res, 200, travailFini(t))
    } finally {
      supprime(fichier.chemin)
    }
  }

  // L'IDENTITÉ DE JEU — ce qui fait qu'on reconnaît quelqu'un d'une vidéo à
  // l'autre. Se corrige à la main, ou se déduit de ses photos et de la marque.
  if (est('POST', 'api', 'avatars', '*', 'identite')) {
    const id = segments[2]
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) throw new ErreurHttp(400, `Avatar invalide.`)
    const corps = await litCorpsJson(req)
    const args = [scriptPipeline('avatars.mjs'), `--identite=${id}`]
    if (corps?.deduis === true) args.push('--deduis')
    else {
      const texte = String(corps?.texte ?? '').trim()
      if (!texte) throw new ErreurHttp(400, `L'identité est vide.`)
      args.push(`--texte=${texte.slice(0, 2000)}`)
    }
    // La déduction interroge un modèle : une minute au pire, pas quinze secondes.
    const t = await lanceEtAttends(args, { msMax: 120_000 })
    return repondJson(res, 200, travailFini(t))
  }

  if (est('DELETE', 'api', 'avatars', '*')) {
    const t = await lanceEtAttends(
      [scriptPipeline('avatars.mjs'), `--retire=${segments[2]}`],
      { msMax: 15_000 }
    )
    return repondJson(res, 200, travailFini(t))
  }

  // ------------------------------------------- déduire le script d'une prise --
  //
  // CE N'EST PAS ÉCRIRE UN SCRIPT, ET C'EST POUR ÇA QUE ÇA A UN BOUTON.
  //
  // Écrire un script — choisir un angle, un hook, une chute — reste dans la
  // conversation (§2). Mais quand la prise est DÉJÀ enregistrée, l'éditorial a
  // eu lieu : il ne reste qu'à découper et à traduire chaque passage en requête
  // d'images. Aucune décision, donc aucune raison de renvoyer vers le fil.
  if (est('POST', 'api', 'videos', '*', 'script')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    return repondJson(
      res,
      202,
      travailLance(lanceTravail([scriptPipeline('script.mjs'), slug, '--force']))
    )
  }

  // ------------------------------------------------------------- le drive ---
  //
  // L'ENVOI EST UN GESTE, PAS UNE DÉCISION — DONC IL A SA PLACE ICI (§2).
  //
  // Déposer un master dans un dossier ne s'argumente pas : on le fait, on voit
  // la barre avancer, on récupère un lien. La commande existe seule au terminal
  // (`npm run drive`), l'atelier ne fait que l'appeler et montrer son journal.
  //
  // Ce qui NE passe pas par ici : la connexion. Elle ouvre le navigateur sur un
  // écran de consentement Google et écrit un jeton dans le trousseau — un poste
  // s'autorise au terminal, une fois, en connaissance de cause.
  if (est('GET', 'api', 'drive')) {
    const t = await lanceEtAttends([scriptPipeline('drive.mjs'), '--etat', '--json'], { msMax: 15_000 })
    return repondJson(res, 200, travailFini(t))
  }
  if (est('POST', 'api', 'videos', '*', 'drive')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    return repondJson(res, 202, travailLance(lanceTravail([scriptPipeline('drive.mjs'), slug, '--json'])))
  }

  // CREER LE DOSSIER DRIVE DE LA CHAINE : un geste, pas une decision.
  //
  // L'ecran disait « Pas de dossier pour cette chaine — npm run drive --dossier ».
  // Or il n'y a rien a juger : la portee `drive.file` ne permet PAS d'ecrire
  // dans un dossier cree a la main dont on collerait l'identifiant, donc c'est
  // la commande qui doit le creer, une fois. La CONNEXION, elle, reste au
  // terminal — elle ouvre un ecran de consentement Google.
  if (est('POST', 'api', 'drive', 'dossier')) {
    return repondJson(res, 202, travailLance(
      lanceTravail([scriptPipeline('drive.mjs'), '--dossier', '--json'], {
        etiquette: `drive — création du dossier de la chaîne`,
      })
    ))
  }

  // TRANSCRIRE : local, gratuit, et sans la moindre decision.
  //
  // L'ecran donnait `npm run transcris -- <slug>` a copier. Rien la-dedans ne
  // s'argumente : whisper lit l'audio et rend des mots avec leurs instants. Une
  // marche sans bouton la ou aucun jugement n'est demande, c'est exactement le
  // defaut que le §2 nomme.
  if (est('POST', 'api', 'videos', '*', 'transcris')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req).catch(() => ({}))
    const args = [scriptPipeline('transcris.mjs'), slug]
    if (corps?.refais === true) args.push('--refais')
    if (corps?.modele) {
      if (!/^[a-z0-9.-]{2,20}$/i.test(String(corps.modele))) {
        throw new ErreurHttp(400, `Modèle de transcription refusé.`)
      }
      args.push(`--modele=${corps.modele}`)
    }
    return repondJson(res, 202, travailLance(
      lanceTravail(args, { etiquette: `transcription — ${slug}` })
    ))
  }

  // TOUT RÉANALYSER : on repart de l'audio, on oublie les corrections.
  //
  // C'est la sortie de secours de l'étape 5 — celle qu'on cherche quand on
  // s'est perdu dans les corrections, qu'on a supprimé la mauvaise ligne, ou
  // qu'on veut simplement repartir de ce que la machine entend.
  //
  // ON NE REFAIT PAS LE MONTAGE, ON REMET LE TEXTE.
  //
  // `monte --depuis=transcris` aurait été le geste évident, et il en fait
  // beaucoup trop : il reconstruit la piste image, donc trente recherches
  // d'images et autant de clips retéléchargés — pour un texte à corriger. Pire,
  // la fenêtre de réemploi des dix derniers montages ferait valser des plans
  // qu'on avait validés.
  //
  // `transcris --refais` suffit : il réécrit le transcript ET remet les mots du
  // plan d'accord avec lui, sans toucher aux plans de coupe, aux coupes ni au
  // thème. L'audio n'a pas changé — leurs instants sont toujours justes.
  //
  // CE QUI NE BOUGE PAS : la voix (aucune conversion payante ne repart) et les
  // réglages de style, qui vivent dans `soustitres.json`.
  if (est('POST', 'api', 'videos', '*', 'reanalyse')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req).catch(() => ({}))
    const modele = corps?.modele ? String(corps.modele) : null
    if (modele && !/^[a-z0-9.-]{2,20}$/i.test(modele)) {
      throw new ErreurHttp(400, `Modèle de transcription refusé.`)
    }
    // Le modèle demandé devient celui de la CHAÎNE avant de partir : `monte`
    // n'a pas d'option pour le passer, et le poser ici évite d'en ajouter une
    // qui ne servirait qu'à ce bouton.
    if (modele) {
      await lanceEtAttends(
        [scriptPipeline('transcris.mjs'), `--defaut=${modele}`, '--json'],
        { msMax: 15_000 }
      )
    }
    // LE TEXTE RÉELLEMENT DIT : LE SEUL CHEMIN VERS ZÉRO FAUTE.
  //
  // Mesuré sur une VSL de 907 mots : en écoute libre, whisper rend 93 à 97 % —
  // des homophones (« les doigts s'élèvent » pour « les droits »), et parfois
  // un passage entier sauté. Avec le texte de référence, l'alignement rend
  // 907 mots sur 907, IDENTIQUES.
  //
  // Le texte part sur l'ENTRÉE STANDARD : une VSL fait plusieurs milliers de
  // caractères, et une ligne de commande n'est pas un canal pour ça.
  if (est('POST', 'api', 'videos', '*', 'texte-dit')) {
    const slug = exigeVideo(slugDeLaVideo(segments))
    const corps = await litCorpsJson(req)
    const texte = String(corps?.texte ?? '').trim()
    if (texte.split(/\s+/).filter(Boolean).length < 5) {
      throw new ErreurHttp(400, `Le texte de référence est trop court pour servir d'ancrage.`)
    }
    return repondJson(res, 202, travailLance(
      lanceTravail(
        [scriptPipeline('transcris.mjs'), slug, '--texte=-', '--refais'],
        { etiquette: `calage sur ton texte — ${slug}`, entree: texte }
      )
    ))
  }

  // RECALER N'EST PAS RÉANALYSER, et c'est toute la différence.
    //
    // Réanalyser jette le texte et réécoute tout : les corrections partent.
    // Recaler GARDE le texte — corrections, ajouts, suppressions compris — et
    // ne recalcule que les instants, depuis l'audio. C'est ce qu'il faut après
    // avoir ajouté des mots à la main, dont la position n'était que devinée.
    const args = corps?.recale === true
      ? [scriptPipeline('transcris.mjs'), slug, '--recale']
      : [scriptPipeline('transcris.mjs'), slug, '--refais']
    if (modele) args.push(`--modele=${modele}`)
    return repondJson(res, 202, travailLance(
      lanceTravail(args, {
        etiquette: `${corps?.recale === true ? 'recalage' : 'réanalyse'} — ${slug}`,
      })
    ))
  }

  // -------------------------------------------------------------- travaux ---
  if (est('GET', 'api', 'travaux')) {
    return repondJson(res, 200, [...travaux.values()].map((t) => ({
      id: t.id, commande: t.commande, etat: t.etat, code: t.code, debut_le: t.debut, fin_le: t.fin,
    })))
  }
  if (est('GET', 'api', 'travaux', '*')) {
    const t = travaux.get(segments[2])
    if (!t) throw new ErreurHttp(404, `Travail inconnu ou déjà purgé.`)
    return repondJson(res, 200, vueTravail(t, url.searchParams.get('depuis') ?? 0))
  }

  throw new ErreurHttp(404, `Route inconnue : ${methode} ${url.pathname}`)
}

/**
 * Traduit `{taille: 86}` en `--taille=86`.
 *
 * On ne tient PAS la liste des champs réglables ici : c'est
 * `pipeline/soustitres.mjs` qui l'a, et qui refuse déjà toute option inconnue
 * (« --taile=90 qui ne fait rien se paierait au rendu »). Dupliquer la liste
 * dans le serveur, c'est se condamner à la mettre à jour deux fois. On ne
 * vérifie donc que la FORME du nom, et on interdit les drapeaux de pilotage :
 * un `--oublie` glissé dans un PUT effacerait les réglages de la vidéo.
 */
const DRAPEAUX_INTERDITS = new Set(['aide', 'help', 'json', 'valide', 'oublie', 'applique', 'modeles'])

function argumentsDeReglage(champs) {
  const args = []
  for (const [nom, valeur] of Object.entries(champs ?? {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(nom)) {
      throw new ErreurHttp(400, `Nom de réglage refusé : « ${nom} ».`)
    }
    if (DRAPEAUX_INTERDITS.has(nom.toLowerCase())) {
      throw new ErreurHttp(400, `« ${nom} » n'est pas un réglage.`)
    }
    if (valeur === null || valeur === undefined) continue
    if (!['string', 'number', 'boolean'].includes(typeof valeur)) {
      throw new ErreurHttp(400, `Valeur de « ${nom} » inexploitable.`)
    }
    const texte = typeof valeur === 'boolean' ? (valeur ? 'oui' : 'non') : String(valeur)
    if (texte.length > 64 || /[\r\n]/.test(texte)) {
      throw new ErreurHttp(400, `Valeur de « ${nom} » refusée.`)
    }
    args.push(`--${nom}=${texte}`)
  }
  return args
}

// ---------------------------------------------------------------------------
//  Le serveur
// ---------------------------------------------------------------------------

async function traite(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  let segments
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    throw new ErreurHttp(400, `URL mal encodée.`)
  }

  if (segments[0] === 'api') return routeApi(req, res, url, segments)

  // ---------------------------------------------------------------- média ---
  if (segments[0] === 'media') {
    if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
    const slug = verifieSlug(segments[1])
    const reste = segments.slice(2).join('/')
    if (!reste) throw new ErreurHttp(400, `Précise le fichier à servir.`)
    const chemin = sousDossier(dossierVideo(slug).base, reste)
    if (!EXTENSIONS_SERVIES.has(path.extname(chemin).toLowerCase())) {
      throw new ErreurHttp(403, `Ce type de fichier ne se sert pas depuis l'atelier.`)
    }
    return sertFichier(req, res, chemin)
  }

  // ------------------------------------------------ vignettes de tes plans ---
  //
  // Les photos des avatars, en lecture seule — l'écran ne peut pas les montrer
  // autrement : elles vivent dans `marque/`, hors de `/media` qui exige un slug.
  //
  // ET IL LES SERT EN VIGNETTE, PAS EN ORIGINAL.
  //
  // Une photo de référence pèse deux à trois mégaoctets ; la carte l'affiche
  // dans un carré de cinquante-quatre pixels. Servir l'original, c'est dix
  // mégaoctets pour quatre timbres-poste — l'écran restait vide plusieurs
  // secondes. La vignette est fabriquée une fois, puis relue.
  if (segments[0] === 'avatar') {
    if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
    const reste = segments.slice(1).join('/')
    if (!reste) throw new ErreurHttp(400, `Précise le fichier.`)
    const racineAvatars = path.join(CHEMINS.marque, 'avatars')
    const chemin = sousDossier(racineAvatars, reste)
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(chemin).toLowerCase())) {
      throw new ErreurHttp(403, `Ce type de fichier ne se sert pas depuis ici.`)
    }
    if (!fs.existsSync(chemin)) throw new ErreurHttp(404, `Photo introuvable.`)

    if (url.searchParams.has('vignette')) {
      const cache = path.join(path.dirname(chemin), '.vignettes')
      const petite = path.join(cache, path.basename(chemin, path.extname(chemin)) + '.jpg')
      if (!fs.existsSync(petite) || fs.statSync(petite).mtimeMs < fs.statSync(chemin).mtimeMs) {
        fs.mkdirSync(cache, { recursive: true })
        await ffmpeg(['-i', chemin, '-vf', 'scale=180:-2', '-q:v', '4', petite])
      }
      return sertFichier(req, res, petite)
    }
    return sertFichier(req, res, chemin)
  }

  // Servir `assets/broll/` en lecture seule, pour que la bibliothèque se voie.
  // Le dossier n'appartient pas à une vidéo : il ne passe donc pas par `/media`,
  // qui exige un slug — et cette route-ci n'accepte que le dossier des plans.
  if (segments[0] === 'broll') {
    if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
    const reste = segments.slice(1).join('/')
    if (!reste) throw new ErreurHttp(400, `Précise le fichier.`)
    const chemin = sousDossier(DOSSIER_BROLL, reste)
    if (!EXTENSIONS_BROLL.has(path.extname(chemin).toLowerCase())) {
      throw new ErreurHttp(403, `Ce type de fichier ne se sert pas depuis ici.`)
    }
    return sertFichier(req, res, chemin)
  }

  // ------------------------------------------- les médias des inspirations ---
  //
  // Les vidéos rapatriées se servent comme les rendus : en lecture seule, avec
  // les requêtes partielles que `sertFichier` gère déjà — sans elles, un
  // navigateur téléchargerait la vidéo entière avant de l'afficher et ne
  // saurait pas s'y déplacer.
  if (segments[0] === 'inspiration') {
    if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
    const reste = segments.slice(1).join('/')
    if (!reste) throw new ErreurHttp(400, `Précise le fichier.`)
    const chemin = sousDossier(CHEMINS.inspirations, reste)
    if (!EXTENSIONS_SERVIES.has(path.extname(chemin).toLowerCase())) {
      throw new ErreurHttp(403, `Ce type de fichier ne se sert pas depuis ici.`)
    }
    return sertFichier(req, res, chemin)
  }

  // ------------------------------------------------ les extraits récoltés ----
  //
  // UNE EMPREINTE SE JUGE À L'OREILLE, PAS SUR UN NOMBRE DE DÉCIBELS.
  //
  // La commande annonce « écart médian 34 dB » et c'est la bonne mesure — mais
  // elle ne dit pas si le locuteur postillonne, si la pièce résonne, ni si le
  // timbre est celui qu'on cherchait. `reference.wav` et chaque extrait se
  // servent donc comme les rushes, avec les requêtes partielles que
  // `sertFichier` gère déjà.
  if (segments[0] === 'empreinte') {
    if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
    const reste = segments.slice(1).join('/')
    if (!reste) throw new ErreurHttp(400, `Précise le fichier.`)
    const chemin = sousDossier(path.join(CHEMINS.marque, 'voix'), reste)
    if (!EXTENSIONS_SERVIES.has(path.extname(chemin).toLowerCase())) {
      throw new ErreurHttp(403, `Ce type de fichier ne se sert pas depuis ici.`)
    }
    return sertFichier(req, res, chemin)
  }

  // -------------------------------------------------------------- polices ---
  //
  // L'APERÇU DOIT MONTRER LA VRAIE POLICE, SINON IL NE SERT PAS À JUGER.
  //
  // Il s'en excusait : « cette famille n'est pas installée sur ce poste, et le
  // serveur ne sert pas assets/fonts ». C'était honnête et c'était un manque.
  // Tout l'intérêt de cet écran est de décider d'un dessin de lettres avant de
  // payer un rendu ; le faire sur un substitut de chasse voisine, c'est décider
  // sur autre chose que ce qu'on aura.
  //
  // Les fichiers sont là, dans `assets/fonts/`, et c'est exactement ce que fait
  // Scriptshort de son côté (`-vf ass=…:fontsdir=fonts`). On les sert.
  if (segments[0] === 'polices') {
    if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
    const reste = segments.slice(1).join('/')
    if (!reste) throw new ErreurHttp(400, `Précise la police à servir.`)
    const chemin = sousDossier(CHEMINS.polices, reste)
    if (!EXTENSIONS_POLICES.has(path.extname(chemin).toLowerCase())) {
      throw new ErreurHttp(403, `Seules les polices se servent depuis ici.`)
    }
    // Une police ne change jamais sous le même nom : on la laisse en cache.
    return sertFichier(req, res, chemin, { cache: 'public, max-age=604800, immutable' })
  }

  // -------------------------------------------------------------- statique --
  if (!['GET', 'HEAD'].includes(req.method)) throw new ErreurHttp(405, `Méthode refusée.`)
  const demande = segments.length ? segments.join('/') : 'index.html'
  const chemin = sousDossier(DOSSIER_ATELIER, demande)
  if (!fs.existsSync(chemin)) {
    if (segments.length === 0) return repondTexte(res, 200, PAGE_SANS_INTERFACE, TYPES['.html'])
    throw new ErreurHttp(404, `Fichier absent de atelier/.`)
  }
  return sertFichier(req, res, chemin, { cache: 'no-store' })
}

const serveur = http.createServer((req, res) => {
  Promise.resolve()
    .then(() => {
      verifieProvenance(req)
      return traite(req, res)
    })
    .catch((e) => {
      if (res.headersSent) return res.destroy()
      const code = e instanceof ErreurHttp ? e.code : 500
      const details = e instanceof ErreurHttp ? e.details : {}
      if (code >= 500) journal.erreur(`${req.method} ${req.url} — ${e.message}`)
      repondJson(res, code, { ok: false, erreur: e.message, ...details })
    })
})

/** Ouvre le navigateur sans bloquer le serveur ni salir sa sortie. */
function ouvreLeNavigateur(adresse) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', adresse]]
      : process.platform === 'darwin' ? ['open', [adresse]]
        : ['xdg-open', [adresse]]
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {
    journal.detail(`Ouvre l'atelier toi-même : ${adresse}`)
  }
}

/**
 * Balaie les temporaires laissés par des ateliers qui ne se sont pas fermés
 * proprement.
 *
 * Le nettoyage de fin ne s'exécute que sur `SIGINT` et `SIGTERM`. La croix de
 * la console Windows, un `taskkill /F` ou un plantage le sautent — et il reste
 * alors sur le disque jusqu'à la taille d'un rush entier. Trois dossiers
 * orphelins traînaient déjà au moment où on a regardé.
 *
 * On ne touche qu'aux dossiers dont le processus n'existe plus : deux ateliers
 * peuvent tourner en même temps, et effacer le temporaire du voisin ferait
 * échouer son dépôt en cours.
 */
function balaieLesTemporairesOrphelins() {
  const base = os.tmpdir()
  let jetes = 0
  try {
    for (const nom of fs.readdirSync(base)) {
      const m = /^atelier-(\d+)$/.exec(nom)
      if (!m || Number(m[1]) === process.pid) continue
      try {
        // `kill(pid, 0)` ne tue rien : il demande si le processus existe.
        process.kill(Number(m[1]), 0)
        continue
      } catch (e) {
        // EPERM veut dire « il existe mais il n'est pas à moi » : on le laisse.
        if (e.code === 'EPERM') continue
      }
      try {
        fs.rmSync(path.join(base, nom), { recursive: true, force: true })
        jetes++
      } catch { /* un temporaire verrouillé attendra le prochain démarrage */ }
    }
  } catch { /* pas de temporaire lisible : rien à balayer */ }
  return jetes
}

/**
 * Démarre l'atelier d'une autre chaîne sur un port de passage, juste pour voir.
 *
 * C'est le seul contrôle qui vaille : chaque chaîne porte sa propre copie du
 * pipeline, et rien de ce qu'on lit d'ici ne dit si SON code démarrera. On lui
 * pose donc la question, et on garde sa réponse — sa sortie d'erreur dit
 * exactement ce qui manque, bien mieux qu'une supposition.
 */
const SAUT = String.fromCharCode(10)
const SAUTS = new RegExp(String.fromCharCode(13) + "?" + SAUT)

async function essaieLaChaine(dossier) {
  // Un port libre : on en réserve un, on le relâche, on le passe. La fenêtre de
  // course est théorique, et le pire cas est un essai qui échoue pour cause de
  // port pris — donc un refus de bascule, jamais une bascule ratée.
  const portDEssai = await new Promise((resoud) => {
    const s = http.createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => resoud(p))
    })
  })

  const enfant = spawn(
    process.execPath,
    [path.join(dossier, 'outils', 'atelier.mjs'), `--port=${portDEssai}`],
    { cwd: dossier, env: { ...process.env, STACK_RACINE: dossier, NO_COLOR: '1' }, windowsHide: true }
  )
  let sortie = ''
  enfant.stdout.on('data', (d) => { sortie += d })
  enfant.stderr.on('data', (d) => { sortie += d })

  let mort = null
  enfant.on('exit', (code) => { mort = code ?? 1 })
  enfant.on('error', (e) => { mort = 1; sortie += e.message })

  try {
    const limite = Date.now() + 20_000
    while (Date.now() < limite) {
      if (mort !== null) {
        // La dernière ligne non vide porte le message utile : le journal du
        // dépôt écrit l'erreur en dernier.
        const lignes = sortie.split(SAUTS).map((l) => l.trim()).filter(Boolean)
        return {
          ok: false,
          raison: lignes.slice(-3).join(SAUT) || `Le processus s’est arrêté (code ${mort}).`,
        }
      }
      try {
        const r = await fetch(`http://127.0.0.1:${portDEssai}/api/chaines`, {
          headers: { Host: `127.0.0.1:${portDEssai}` },
        })
        if (r.ok) return { ok: true }
      } catch { /* pas encore en ligne */ }
      // Un atelier démarre en 240 ms (mesuré) : sonder toutes les 300 ms
      // ajoutait jusqu'à 300 ms d'attente pure sur un essai qui, lui, est déjà
      // fini. La granularité de la sonde ne doit pas coûter plus que ce qu'elle
      // mesure.
      await new Promise((r) => setTimeout(r, 40))
    }
    return { ok: false, raison: `Elle n'a pas répondu en vingt secondes.` }
  } finally {
    try { enfant.kill() } catch { /* déjà parti */ }
  }
}

/**
 * Relance l'atelier sur une autre chaîne, sur le même port.
 *
 * L'ORDRE COMPTE, ET IL N'Y EN A QU'UN QUI MARCHE.
 *
 *   1. la réponse HTTP part (l'appelant l'attend déjà) ;
 *   2. le serveur LIBÈRE le port — sans ça le nouveau processus le trouve
 *      occupé et s'arrête sur « EADDRINUSE » ;
 *   3. le nouveau processus démarre, détaché, sur la nouvelle racine ;
 *   4. celui-ci s'efface.
 *
 * Détaché et `unref` : autrement le nouvel atelier meurt avec l'ancien, et on
 * se retrouve sans rien. Le navigateur, lui, interroge le port jusqu'à ce qu'il
 * réponde — c'est à lui de dire ce qui se passe pendant les deux secondes où
 * personne n'écoute.
 */
function relanceVers(dossier) {
  const script = path.join(dossier, 'outils', 'atelier.mjs')
  const args = [script, `--port=${PORT}`, `--taille-max-mo=${Math.round(TAILLE_MAX / 1e6)}`]
  journal.attention(`Changement de chaîne : ${dossier}`)

  const partir = () => {
    try {
      spawn(process.execPath, args, {
        cwd: dossier,
        // La racine se déplace par l'environnement : c'est la seule façon
        // documentée de le faire, et elle vaut pour tout ce que le nouvel
        // atelier lancera ensuite.
        env: { ...process.env, STACK_RACINE: dossier },
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref()
    } catch (e) {
      journal.attention(`La relance a échoué : ${e.message}`)
    }
    try { fs.rmSync(TEMPORAIRE, { recursive: true, force: true }) } catch { /* rien de critique */ }
    process.exit(0)
  }

  // Un délai court laisse la réponse atteindre le navigateur avant qu'on ferme.
  //
  // ET ON COUPE LES CONNEXIONS PLUTÔT QUE DE LES ATTENDRE. `close()` attend la
  // fin de toutes les connexions ouvertes ; un navigateur en garde une vivante
  // en permanence (keep-alive). Sans `closeAllConnections`, la fermeture
  // n'aboutissait pas et c'est le filet de trois secondes qui partait — trois
  // secondes de port muet, à chaque changement de chaîne, pour rien.
  setTimeout(() => {
    serveur.close(partir)
    try { serveur.closeAllConnections() } catch { /* Node < 18.2 : le filet joue */ }
  }, 150).unref()
  // Filet : si quelque chose retient quand même la fermeture, on part.
  setTimeout(partir, 3000).unref()
}

await principal(async () => {
  const orphelins = balaieLesTemporairesOrphelins()
  if (orphelins) journal.detail(`${orphelins} temporaire(s) d'atelier abandonné(s) effacé(s).`)
  fs.mkdirSync(TEMPORAIRE, { recursive: true })

  // La chaîne se lit au démarrage plutôt qu'à la première requête : son absence
  // dit qu'on n'est pas dans une chaîne du tout, et mieux vaut l'apprendre
  // maintenant qu'après avoir déposé un rush.
  //
  // ELLE SE LIT, ELLE NE SE FILTRE PLUS.
  //
  // `exigeInitialisee: true` arrêtait l'atelier net sur une chaîne neuve. C'est
  // la moitié du défaut corrigé plus haut, dans `/api/chaines/ouvre` : l'autre
  // moitié refusait la bascule, celle-ci refusait le démarrage. Le dépôt, la
  // transcription, le carnet et les avatars n'ont jamais eu besoin de
  // l'initialisation ; seul le montage attend la direction artistique, et il le
  // dira lui-même le moment venu.
  const carte = litChaine()
  if (carte.initialise !== true) {
    journal.attention(
      `Chaîne non initialisée. Elle produit quand même — la cascade des sous-titres ` +
        `et les polices embarquées donnent des réglages complets. Ce qui manque est ` +
        `éditorial : ouvre Claude Code dans ce dossier et lance /init-chaine.`
    )
  }

  await new Promise((resoud, rejette) => {
    serveur.once('error', (e) => {
      rejette(
        e.code === 'EADDRINUSE'
          ? new Error(`Le port ${PORT} est déjà pris. Essaie --port=${PORT + 1}.`)
          : e
      )
    })
    // 127.0.0.1 ET RIEN D'AUTRE. Sur 0.0.0.0, l'atelier serait joignable depuis
    // le réseau local — donc depuis n'importe quel appareil du même wifi — avec
    // le droit de déclencher des appels payants.
    serveur.listen(PORT, '127.0.0.1', resoud)
  })

  const adresse = `http://127.0.0.1:${PORT}`
  journal.titre(`Atelier`)
  journal.ok(adresse)
  journal.detail(`${etats().length} vidéo(s) dans videos/`)
  journal.detail(`Aucune clé d'API n'est journalisée ni passée en argument.`)
  journal.detail(`Ctrl+C pour arrêter.`)

  if (drapeau(options, 'ouvre')) ouvreLeNavigateur(adresse)

  // Un rendu tué à moitié laisse un MP4 tronqué que rien ne distingue d'un
  // rendu complet. On coupe les enfants explicitement, et on le dit.
  let ferme = false
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (ferme) process.exit(1)
      ferme = true
      const encours = [...travaux.values()].filter((t) => t.etat === 'encours')
      if (encours.length) {
        journal.attention(`${encours.length} travail(aux) interrompu(s) — leurs fichiers sont incomplets.`)
        for (const t of encours) { try { t._enfant?.kill() } catch { /* déjà mort */ } }
      }
      try { fs.rmSync(TEMPORAIRE, { recursive: true, force: true }) } catch { /* rien de critique */ }
      serveur.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 2000).unref()
    })
  }
})
