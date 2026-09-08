#!/usr/bin/env node
/**
 * cles.mjs — le trousseau, en ligne de commande.
 *
 * Lister, ajouter, retirer, activer, dégeler, et lire les quotas réels. Tout ce
 * que l'onglet Paramètres de l'interface propose passe par ici : l'interface
 * n'écrit jamais `config/keys.json` elle-même, elle appelle cette commande.
 *
 * DEUX RÈGLES QUI NE BOUGENT PAS.
 *
 * 1. **Une clé ne s'affiche jamais en entier.** Ni ici, ni dans un journal, ni
 *    dans une réponse d'API. On montre `sk_abcdef…7Xqm`, ce qui suffit largement
 *    à reconnaître laquelle on manipule.
 * 2. **On désigne une clé par son étiquette**, jamais par sa valeur. Retirer une
 *    clé en la recopiant sur la ligne de commande la ferait entrer dans
 *    l'historique du terminal — c'est exactement ce qu'on cherche à éviter.
 *
 *   node outils/cles.mjs
 *   node outils/cles.mjs --quotas
 *   node outils/cles.mjs --ajoute=elevenlabs --valeur=sk_… --label=eleven-02 --tier=paid
 *   node outils/cles.mjs --retire=elevenlabs --label=eleven-02
 *   node outils/cles.mjs --desactive=apify --label=apify-01
 *   node outils/cles.mjs --degele
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, litJson, ecritJson } from '../pipeline/lib/chemins.mjs'
import { journal, masque } from '../pipeline/lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from '../pipeline/lib/args.mjs'
import { etatLisible, degele } from '../pipeline/lib/trousseau.mjs'

const { options } = litArgs()

aide(
  options,
  `
node outils/cles.mjs [options]

  (sans option)              liste les clés, masquées, avec leur état
  --quotas                   interroge les quotas réels (appels réseau)
  --json                     sortie machine, pour l'interface

  --ajoute=<service>         ajoute une clé
    --valeur=<clé>             sa valeur ; « - » pour la lire sur l'entrée
                               standard, et la tenir hors de l'historique
    --label=<nom>              son étiquette (défaut : <service>-<n>)
    --tier=paid|free           priorité (défaut : paid)

  --retire=<service> --label=<nom>      retire une clé
  --active=<service> --label=<nom>      la remet en service
  --desactive=<service> --label=<nom>   la met de côté sans la supprimer
  --degele[=<service>]                  vide le frigo des clés écartées

  --donne-a=<dossier>        copie CE trousseau dans une autre chaîne
                             (mêmes comptes, mêmes quotas, un seul solde)

Services connus : apify, elevenlabs, pexels, pixabay, heygen.
Une clé n'est jamais affichée en entier, et se désigne par son étiquette.
`
)

/** Les services que la stack sait utiliser, avec ce à quoi ils servent. */
const SERVICES = {
  apify: { role: 'veille YouTube et TikTok', prefixe: 'apify_api_' },
  elevenlabs: { role: 'remplacement du timbre de voix', prefixe: 'sk_' },
  pexels: { role: 'banque de plans de coupe', prefixe: '' },
  pixabay: { role: 'banque de plans de coupe (secours)', prefixe: '' },
  heygen: { role: 'avatar de synthèse', prefixe: '' },
  fal: { role: 'génération de plans', prefixe: '' },
  fish: { role: 'voix off — clonage et synthèse', prefixe: 'sk-fish-' },
  // Le jeton OAuth de Claude Code, pour que le logiciel puisse faire réfléchir
  // le cerveau sans passer par une conversation. Ce n'est pas une clé d'API :
  // c'est la session du forfait, obtenue par « claude setup-token ».
  claude: { role: 'le cerveau — scripts, stratégie, publication', prefixe: 'sk-ant-oat' },
}

const litTrousseau = () => (fs.existsSync(CHEMINS.trousseau) ? litJson(CHEMINS.trousseau, {}) : {})

/**
 * Écrit le trousseau en préservant le fichier précédent.
 *
 * Une écriture ratée à mi-chemin laisserait l'utilisateur sans aucune clé, donc
 * sans production possible. La copie de sauvegarde coûte deux kilo-octets.
 */
function ecritTrousseau(brut) {
  if (fs.existsSync(CHEMINS.trousseau)) {
    fs.copyFileSync(CHEMINS.trousseau, `${CHEMINS.trousseau}.precedent`)
  }
  ecritJson(CHEMINS.trousseau, brut)
}

function verifieService(service) {
  if (!service || service === true) throw new Error(`Donne un service : --ajoute=elevenlabs`)
  if (!SERVICES[service]) {
    throw new Error(
      `Service inconnu : « ${service} ».\nConnus : ${Object.keys(SERVICES).join(', ')}`
    )
  }
  return service
}

function verifieLabel(label) {
  if (!label || label === true) throw new Error(`Donne l'étiquette de la clé : --label=eleven-02`)
  return String(label)
}

/** Retrouve une clé par son étiquette, avec un message utile si elle manque. */
function trouve(brut, service, label) {
  const entrees = Array.isArray(brut[service]) ? brut[service] : []
  const i = entrees.findIndex((e) => (e.label || masque(e.key)) === label)
  if (i === -1) {
    const connues = entrees.map((e) => e.label || masque(e.key))
    throw new Error(
      `Aucune clé « ${label} » chez ${service}.` +
        (connues.length ? `\nÉtiquettes existantes : ${connues.join(', ')}` : '')
    )
  }
  return { entrees, i }
}

// ---------------------------------------------------------------------------
//  Lecture
// ---------------------------------------------------------------------------

/** L'état du trousseau, masqué, prêt à être affiché ou sérialisé. */
function etat() {
  const brut = litTrousseau()
  const parService = Object.fromEntries(etatLisible().map((s) => [s.service, s]))

  return Object.keys(SERVICES).map((service) => {
    const declarees = Array.isArray(brut[service]) ? brut[service] : []
    const vues = parService[service]
    return {
      service,
      role: SERVICES[service].role,
      // `pool()` écarte les clés désactivées et les gabarits `xxxxx` : les
      // compter ensemble ferait croire à une clé perdue.
      total: declarees.length,
      utilisables: vues?.total ?? 0,
      disponibles: vues?.disponibles ?? 0,
      cles: declarees.map((e) => {
        const label = e.label || masque(e.key)
        const vue = vues?.cles.find((c) => c.label === label)
        return {
          label,
          masque: masque(e.key),
          tier: e.tier || 'paid',
          active: e.enabled !== false,
          gabarit: String(e.key || '').includes('xxxxx'),
          frigo: vue?.frigo ?? false,
        }
      }),
    }
  })
}

/**
 * Les quotas réels : un appel réseau par service qui sait en rendre compte.
 *
 * LES QUATRE SERVICES SE LISENT EN MÊME TEMPS, PAS L'UN APRÈS L'AUTRE.
 *
 * Quatre `await` à la file mettaient 4,6 s — mesuré le 8 septembre 2026 — pour
 * quatre lectures qui ne dépendent en rien les unes des autres. Et ce n'était
 * pas seulement un en-tête un peu lent : l'atelier relit les soldes à chaque
 * retour dans la fenêtre, et rouvrir le menu des chaînes EST un retour dans la
 * fenêtre. Le garde « travail en cours » de `/api/chaines/ouvre` attendait donc
 * la fin de CETTE lecture avant de basculer — 5,03 s mesurées sur le clic, dont
 * 4,89 s de quotas. La latence à l'ouverture d'une chaîne était intégralement
 * là, et elle n'avait rien à voir avec la chaîne visée.
 *
 * `Promise.all` ramène le total au plus lent des quatre. Chaque branche garde
 * son propre `try` : un service qui tombe ne doit pas emporter les trois autres.
 */
async function quotas() {
  const sortie = {}

  const apify = (async () => {
  try {
    const { etatPool } = await import('../pipeline/lib/apify.mjs')
    const p = await etatPool()
    sortie.apify = {
      resume: `${p.total.toFixed(2)} $ sur ${p.vivantes} clé${p.vivantes > 1 ? 's' : ''}`,
      detail: `≈ ${p.videosPossibles} vidéos avec transcript`,
      cles: p.cles.map((c) => ({
        label: c.label,
        vivante: c.vivante,
        valeur: c.reste === null ? 'hors service' : `${c.reste.toFixed(3)} $`,
        note: c.raison ? String(c.raison) : null,
      })),
    }
  } catch (e) {
    sortie.apify = { erreur: e.message.split('\n')[0] }
  }
  })()

  const elevenlabs = (async () => {
  try {
    const el = await import('../pipeline/lib/elevenlabs.mjs')
    const p = await el.etatPool()
    sortie.elevenlabs = {
      resume: `${p.minutesTotales.toFixed(1)} min de conversion`,
      detail: p.aDuCommercial
        ? `dont ${p.minutesCommerciales.toFixed(1)} min sous licence commerciale`
        : `aucune clé payante — le palier gratuit interdit l'usage commercial`,
      alerte: !p.aDuCommercial,
      cles: p.cles.map((c) => ({
        label: c.label,
        vivante: c.vivante,
        plan: c.palier ?? null,
        valeur: c.vivante
          ? `${c.restant} crédits · ${c.minutesSts.toFixed(1)} min`
          : 'hors service',
        commercial: c.commercial ?? false,
        reset: c.reset ? c.reset.toISOString() : null,
        note: c.raison ?? null,
      })),
    }
  } catch (e) {
    sortie.elevenlabs = { erreur: e.message.split('\n')[0] }
  }
  })()

  // FAL SE COMPTE EN DOLLARS, PAS EN CRÉDITS NI EN MINUTES.
  //
  // Chaque service a son unité, et les traduire en une seule les rendrait tous
  // faux. On rend donc ce que le service dit, avec son unité.
  const fal = (async () => {
  try {
    const { soldeFal } = await import('./fal-video.mjs')
    const reste = await soldeFal()
    sortie.fal =
      reste === null
        ? { erreur: `solde indisponible` }
        : {
            resume: `${reste.toFixed(2)} $`,
            detail: `génération de plans`,
            alerte: reste < 1,
            cles: [],
          }
  } catch (e) {
    sortie.fal = { erreur: e.message.split('\n')[0] }
  }
  })()

  // FISH SE COMPTE EN DOLLARS LUI AUSSI, ET C'EST UN AUTRE PORTE-MONNAIE.
  //
  // Il manquait, alors que c'est le service qui se depense le plus vite : une
  // voix off de dix minutes coute quinze centimes, et on en refait cinq avant
  // d'etre content. Son solde ne se lisait qu'en tapant
  // `npm run parle -- --voix=?` — donc jamais, et c'est exactement le defaut que
  // l'en-tete de l'atelier a ete fait pour corriger.
  //
  // « AUCUNE CLE » N'EST PAS « SOLDE INDISPONIBLE ». Le premier se repare en
  // posant une cle, le second veut dire que Fish n'a pas repondu. `credit()`
  // rend `null` dans les deux cas — il avale l'absence de cle avec le reste —
  // donc on interroge le trousseau avant d'appeler.
  const fish = (async () => {
  try {
    const { disponibles } = await import('../pipeline/lib/trousseau.mjs')
    if (!disponibles('fish').length) {
      sortie.fish = { erreur: `aucune cle fish` }
    } else {
      const { credit } = await import('../pipeline/lib/fish.mjs')
      const reste = await credit()
      sortie.fish =
        reste === null
          ? { erreur: `solde indisponible` }
          : {
              resume: `${reste.toFixed(2)} $`,
              detail: `voix off — lecture du texte`,
              // Une voix off de dix minutes coute environ 0,15 $ : sous un
              // dollar, il reste moins de sept prises.
              alerte: reste < 1,
              cles: [],
            }
    }
  } catch (e) {
    sortie.fish = { erreur: e.message.split('\n')[0] }
  }
  })()

  await Promise.all([apify, elevenlabs, fal, fish])
  return sortie
}

// ---------------------------------------------------------------------------
//  Écriture
// ---------------------------------------------------------------------------

/**
 * Lit une clé sur l'entrée standard.
 *
 * `--valeur=-` existe pour que la clé ne passe JAMAIS par les arguments du
 * processus : sur Windows comme ailleurs, une ligne de commande se lit dans la
 * liste des processus et se retrouve dans l'historique du terminal. C'est par
 * là que l'interface transmet les clés qu'on lui saisit.
 */
function litEntreeStandard() {
  try {
    return fs.readFileSync(0, 'utf8').trim()
  } catch {
    throw new Error(`Rien à lire sur l'entrée standard.`)
  }
}

function ajoute() {
  const service = verifieService(options.ajoute)
  const valeur = options.valeur === '-' ? litEntreeStandard() : options.valeur
  if (!valeur || valeur === true) throw new Error(`Donne la clé : --valeur=sk_… (ou --valeur=- pour l'entrée standard)`)
  if (String(valeur).includes('xxxxx')) {
    throw new Error(`Cette valeur est le gabarit d'exemple, pas une vraie clé.`)
  }

  const brut = litTrousseau()
  const entrees = Array.isArray(brut[service]) ? brut[service] : []

  // Une même clé deux fois, c'est un pool qui ment : il annonce deux réserves
  // là où il n'y en a qu'une, et bascule de l'une à l'autre sans rien gagner.
  if (entrees.some((e) => e.key === valeur)) {
    throw new Error(`Cette clé est déjà déclarée chez ${service}.`)
  }

  const label = options.label && options.label !== true
    ? String(options.label)
    : `${service}-${String(entrees.length + 1).padStart(2, '0')}`
  if (entrees.some((e) => (e.label || '') === label)) {
    throw new Error(`L'étiquette « ${label} » est déjà prise chez ${service}.`)
  }

  const tier = options.tier === 'free' ? 'free' : 'paid'
  entrees.push({ key: String(valeur), label, tier, enabled: true })
  brut[service] = entrees
  ecritTrousseau(brut)

  journal.ok(`${service} · ${label} ajoutée (${masque(String(valeur))}, ${tier})`)
  return { service, label }
}

function retire() {
  const service = verifieService(options.retire)
  const label = verifieLabel(options.label)
  const brut = litTrousseau()
  const { entrees, i } = trouve(brut, service, label)

  const partie = entrees[i]
  entrees.splice(i, 1)
  // Un service vidé disparaît du trousseau plutôt que d'y rester en liste vide :
  // une liste vide se signale ensuite comme « 0 disponible sur 0 » à chaque
  // `npm run verifie`, c'est-à-dire comme un manque, alors qu'on vient de
  // décider de ne pas utiliser ce service.
  if (entrees.length === 0) delete brut[service]
  else brut[service] = entrees
  ecritTrousseau(brut)

  journal.ok(`${service} · ${label} retirée (${masque(partie.key)})`)
  if (entrees.length === 0) {
    journal.attention(`Plus aucune clé ${service} : ${SERVICES[service].role} devient indisponible.`)
  }
  return { service, label }
}

function bascule(actif) {
  const service = verifieService(actif ? options.active : options.desactive)
  const label = verifieLabel(options.label)
  const brut = litTrousseau()
  const { entrees, i } = trouve(brut, service, label)

  entrees[i].enabled = actif
  brut[service] = entrees
  ecritTrousseau(brut)

  journal.ok(`${service} · ${label} ${actif ? 'remise en service' : 'mise de côté'}`)
  return { service, label }
}

// ---------------------------------------------------------------------------
//  Affichage
// ---------------------------------------------------------------------------

function affiche(services) {
  for (const s of services) {
    if (s.total === 0) {
      journal.detail(`${s.service.padEnd(12)} aucune clé — ${s.role}`)
      continue
    }
    journal.info(
      `${s.service} · ${s.disponibles}/${s.total} disponible${s.disponibles > 1 ? 's' : ''} — ${s.role}`
    )
    for (const c of s.cles) {
      const marques = [
        c.gabarit ? 'gabarit' : null,
        !c.active ? 'désactivée' : null,
        c.frigo ? 'au frigo' : null,
        c.tier === 'free' ? 'palier gratuit' : null,
      ].filter(Boolean)
      journal.detail(
        `  ${c.label.padEnd(16)} ${c.masque.padEnd(22)}${marques.length ? '· ' + marques.join(', ') : ''}`
      )
    }
  }
}

/**
 * Donne ce trousseau à une autre chaîne.
 *
 * POURQUOI CE CHEMIN EXISTE, ET POURQUOI IL N'EXISTAIT PAS.
 *
 * `nouvelle-chaine --avec-cles` copie le trousseau AU MOMENT de la création.
 * Une chaîne créée sans la case cochée n'avait ensuite aucun moyen d'en
 * recevoir un : ni commande, ni écran. On le découvrait plus tard, devant une
 * liste de voix vide qui annonçait « aucune voix disponible » — alors qu'il
 * manquait une clé, pas des voix.
 *
 * CE QUE ÇA VEUT DIRE, ET QUI DOIT LE SAVOIR. Les deux chaînes partagent alors
 * les mêmes comptes : un quota Apify consommé ici manque là-bas, et le solde
 * fal est un seul solde. C'est un choix légitime — c'est le mien de compte —
 * mais il se dit, parce qu'on ne le devine pas en regardant deux dossiers.
 *
 * AUCUNE CLÉ NE PASSE PAR LA SORTIE : on copie un fichier d'un dossier à
 * l'autre, on n'en lit pas le contenu et on n'en affiche rien.
 */
async function donneLeTrousseau(destination) {
  const cible = path.resolve(destination)
  if (cible === path.resolve(CHEMINS.racine)) {
    throw new Error(`C'est la chaîne courante. Elle a déjà son trousseau.`)
  }
  if (!fs.existsSync(path.join(cible, 'config', 'chaine.json'))) {
    throw new Error(`${cible} n'est pas une chaîne : pas de config/chaine.json. On ne touche à rien.`)
  }
  if (!fs.existsSync(CHEMINS.trousseau)) {
    throw new Error(`Cette chaîne-ci n'a pas de config/keys.json : il n'y a rien à donner.`)
  }
  const vers = path.join(cible, 'config', 'keys.json')
  // ON N'ÉCRASE PAS UN TROUSSEAU EXISTANT. Il peut porter des clés que celui-ci
  // n'a pas — un autre compte, un palier payant posé là-bas seulement — et les
  // remplacer en silence perdrait des secrets qu'on ne sait pas retrouver.
  if (fs.existsSync(vers)) {
    throw new Error(
      `« ${path.basename(cible)} » a déjà un trousseau. Il n'est pas écrasé : ` +
        `il peut porter des clés que celui-ci n'a pas.`
    )
  }
  fs.mkdirSync(path.dirname(vers), { recursive: true })
  fs.copyFileSync(CHEMINS.trousseau, vers)
  return { dossier: cible, nom: path.basename(cible) }
}

await principal(async () => {
  // Donner le trousseau se traite avant tout le reste : ça ne lit ni n'écrit
  // le trousseau local, ça le copie.
  if (options['donne-a'] && options['donne-a'] !== true) {
    const r = await donneLeTrousseau(String(options['donne-a']))
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      return
    }
    journal.ok(`Trousseau copié vers « ${r.nom} ».`)
    journal.detail(
      `Les deux chaînes emploient maintenant les mêmes comptes — c'est le but : ` +
        `un trousseau sert toutes les chaînes.`
    )
    return
  }

  const enJson = drapeau(options, 'json')

  // Une seule action par appel : deux écritures dans la même commande rendent
  // le journal illisible et la reprise sur erreur impossible.
  if (options.ajoute) {
    ajoute()
  } else if (options.retire) {
    retire()
  } else if (options.active) {
    bascule(true)
  } else if (options.desactive) {
    bascule(false)
  } else if (options.degele !== undefined) {
    const service = options.degele === true ? null : verifieService(options.degele)
    degele(service)
    journal.ok(`Frigo vidé${service ? ` pour ${service}` : ''} : les clés écartées seront retentées.`)
  }

  const services = etat()
  const q = drapeau(options, 'quotas') ? await quotas() : null

  if (enJson) {
    console.log(JSON.stringify({ services, quotas: q }, null, 2))
    return
  }

  journal.titre('Trousseau')
  if (!fs.existsSync(CHEMINS.trousseau)) {
    journal.attention(`config/keys.json est absent. Copie config/keys.example.json et remplis-le.`)
    return
  }
  affiche(services)

  if (q) {
    journal.titre('Quotas réels')
    for (const [service, d] of Object.entries(q)) {
      if (d.erreur) {
        journal.attention(`${service} injoignable : ${d.erreur}`)
        continue
      }
      journal[d.alerte ? 'attention' : 'info'](`${service} : ${d.resume} — ${d.detail}`)
      for (const c of d.cles) {
        journal.detail(
          `  ${(c.label ?? '?').padEnd(16)} ${(c.plan ? c.plan.padEnd(10) : '')}${c.valeur}` +
            (c.commercial === false && c.vivante ? ' · SANS licence commerciale' : '')
        )
      }
    }
  } else {
    console.log('')
    journal.detail(`Ajoute --quotas pour interroger les quotas réels.`)
  }
})
