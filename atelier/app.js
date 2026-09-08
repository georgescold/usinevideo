/**
 * app.js — l'atelier, côté navigateur.
 *
 * CE QUE CE FICHIER N'A PAS LE DROIT DE FAIRE.
 *
 * Décider. Aucune règle de montage, aucun barème, aucune conversion de format
 * ne vit ici : le navigateur affiche l'état que `pipeline/etat.mjs` calcule,
 * lance des commandes par le serveur, et montre leur journal. La seule chose
 * qu'il calcule lui-même est l'APERÇU des sous-titres — et cet aperçu ne produit
 * aucun fichier, ne coûte rien, et se jette à chaque image.
 *
 * L'aperçu est donc le seul endroit du dépôt où une règle est écrite deux fois.
 * C'est un choix, pas un oubli : voir le commentaire de `dessineLaPage()`.
 */

// ---------------------------------------------------------------------------
//  Petits outils
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id)
const creer = (balise, classe) => {
  const e = document.createElement(balise)
  if (classe) e.className = classe
  return e
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const chrono = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Dévoile un lecteur ET l'amène sous les yeux.
 *
 * LE SON PARTAIT TOUT SEUL, DEPUIS UN LECTEUR HORS DU CHAMP.
 *
 * Les essais s'ouvrent en bas de leur étape et se lancent d'eux-mêmes. Sur un
 * écran déroulé — le cas courant, l'étape 3 fait deux hauteurs d'écran — on
 * entend une voix sans voir d'où elle vient, et on cherche le bouton de pause
 * en faisant défiler pendant que ça parle. La commande existait, elle n'était
 * simplement pas là où l'on regardait.
 *
 * `block: 'center'` plutôt que `'nearest'` : le lecteur mesure quarante pixels,
 * amené au ras du bord il reste à moitié caché par l'en-tête collant.
 */
function montreLeLecteur(zoneId) {
  const zone = $(zoneId)
  if (!zone) return
  zone.hidden = false
  zone.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/**
 * Un chemin rendu par une commande (`videos/<slug>/03-audio/…`) vers l'URL qui
 * le sert. Les commandes rendent leurs chemins en antislashs sous Windows :
 * les laisser passer donnerait un 404 incompréhensible.
 */
function urlMedia(slug, cheminRelatif) {
  const p = String(cheminRelatif ?? '').replace(/\\/g, '/')
  const prefixe = `videos/${slug}/`
  const reste = p.startsWith(prefixe) ? p.slice(prefixe.length) : p
  return `/media/${encodeURIComponent(slug)}/${reste.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`
}

// ---------------------------------------------------------------------------
//  L'état de la page
// ---------------------------------------------------------------------------

const appli = {
  chaine: null,
  polices: [],
  videos: [],
  slug: null,
  etat: null,
  etapeCourante: null,
  catalogue: null,
  travail: null,
  st: null, // le studio des sous-titres, chargé à la demande
  // `null` tant que le repli n'a pas été ouvert : c'est ce qui distingue
  // « pas encore lu » de « lu, et il n'y en a aucune ».
  empreintes: null,
}

const ETAPES = [
  { cle: 'destination', nom: 'Destination' },
  { cle: 'rush', nom: 'Dépôt de la prise' },
  { cle: 'voixChoisie', nom: 'Voix' },
  { cle: 'audio', nom: 'Audio complet' },
  { cle: 'soustitres', nom: 'Sous-titres' },
  { cle: 'plan', nom: 'Plans' },
  { cle: 'rendu', nom: 'Téléchargement' },
]

// ---------------------------------------------------------------------------
//  L'API
// ---------------------------------------------------------------------------

/** Une 402 n'est pas une panne : c'est un devis. Elle a donc son propre type. */
class BesoinAccord extends Error {
  constructor(details) {
    super(details.erreur ?? 'Confirmation requise.')
    this.details = details
  }
}

async function api(chemin, { methode = 'GET', corps = null, brut = false } = {}) {
  const init = { method: methode, headers: {} }
  if (corps instanceof FormData) init.body = corps
  else if (corps !== null) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(corps)
  }

  let r
  try {
    r = await fetch(chemin, init)
  } catch {
    throw new Error(
      `Le serveur de l'atelier ne répond plus. Vérifie que la fenêtre où tourne ` +
        `« npm run atelier » est toujours ouverte.`
    )
  }
  if (brut && r.ok) return r.json()

  const d = await r.json().catch(() => ({}))
  if (r.status === 402 && d.confirmation_requise) throw new BesoinAccord(d)
  if (!r.ok) {
    const e = new Error(d.erreur ?? `Le serveur a répondu ${r.status}.`)
    e.statut = r.status
    e.details = d
    throw e
  }
  return d
}

/**
 * Un appel payant : on tente, on reçoit le devis, on le montre, on renvoie
 * le jeton. Rend `null` quand l'utilisateur refuse — un refus n'est pas une
 * erreur et ne doit pas remonter comme telle.
 */
async function apiPayante(chemin, corps) {
  try {
    return await api(chemin, { methode: 'POST', corps })
  } catch (e) {
    if (!(e instanceof BesoinAccord)) throw e
    const accord = await demandeAccord(e.details)
    if (!accord) return null
    return api(chemin, { methode: 'POST', corps: { ...corps, jeton: e.details.jeton } })
  }
}

// ---------------------------------------------------------------------------
//  Le bandeau et le journal
// ---------------------------------------------------------------------------

let minuteurBandeau = null

/**
 * Le seul canal de retour de l'atelier — trente-trois messages y passent.
 *
 * UN MESSAGE DE RÉUSSITE S'EFFACE, UNE ERREUR RESTE.
 *
 * Ils restaient tous, indéfiniment : au bout de dix minutes, le bandeau
 * affichait encore « Prise déposée » et on ne savait plus s'il parlait du geste
 * qu'on venait de faire ou d'un autre. Quatre secondes suffisent à lire une
 * confirmation ; une erreur, elle, demande une action, et disparaître la ferait
 * manquer.
 *
 * Le bandeau est aussi devenu collant (voir la feuille de style) : il vivait en
 * tête du document, donc hors champ dès qu'on avait déroulé l'écran — c'est-à-
 * dire au moment précis où une commande échouait.
 */
function annonce(texte, genre = '') {
  const b = $('bandeau')
  clearTimeout(minuteurBandeau)
  b.textContent = texte
  b.className = `bandeau${genre ? ' ' + genre : ''}`
  b.hidden = !texte

  // UN ÉCHEC DE CLÉ MÈNE AU TROUSSEAU, IL NE DÉCRIT PAS UN FICHIER.
  //
  // Les commandes disent « Ajoute ou réactive une clé dans config/keys.json » —
  // c'est juste au terminal, où il n'y a rien d'autre à proposer. À l'écran,
  // c'est un fichier à éditer à la main pour un geste qui a maintenant son
  // panneau. On ne réécrit pas le message de la commande : on lui accroche la
  // porte qui va avec.
  if (texte && /aucune clé|clé .* refusée|keys\.json|401/i.test(texte)) {
    const aller = creer('button', 'bouton minuscule')
    aller.type = 'button'
    aller.textContent = `Ouvrir le trousseau`
    aller.style.marginLeft = '12px'
    aller.addEventListener('click', ouvreLeTrousseau)
    b.append(aller)
  }
  if (texte && genre === 'ok') {
    minuteurBandeau = setTimeout(() => {
      // On ne l'efface que s'il dit toujours la même chose : un message arrivé
      // entre-temps a ses propres quatre secondes.
      if (b.textContent === texte) { b.hidden = true; b.textContent = '' }
    }, 4500)
  }
}

/**
 * Le journal fermé ne se rouvrait JAMAIS.
 *
 * On le fermait d'un clic, et plus rien à l'écran ne disait qu'une commande
 * tournait — pendant les huit minutes d'un rendu, l'atelier avait l'air au
 * repos. La pastille de l'en-tête reste tant qu'un travail est en cours, et le
 * ramène.
 */
function majPastilleTravail(enCours) {
  const b = $('btnTravail')
  b.hidden = !enCours
  b.classList.toggle('travaille-doux', enCours)
}

$('btnTravail').addEventListener('click', () => { $('journal').hidden = false })

function ouvreLeJournal(travail) {
  $('journal').hidden = false
  $('journalCommande').textContent = travail.commande
  $('journalLignes').textContent = ''
  majPastilleJournal('encours')
}

function majPastilleJournal(etat) {
  $('journalEtat').className = `pastille-etat ${etat}`
}

/**
 * Suit un travail jusqu'à sa fin, journal en direct.
 *
 * Le curseur est un index ABSOLU dans le journal du serveur : on redemande
 * toujours « à partir de », jamais « les N dernières ». Rafraîchir la page ne
 * perd donc rien, et une purge côté serveur se signale au lieu de sauter des
 * lignes en silence.
 */
async function suisLeTravail(travail) {
  appli.travail = travail
  majPastilleTravail(true)
  $('journal').classList.add('encours')
  ouvreLeJournal(travail)
  const zone = $('journalLignes')
  let curseur = 0

  for (;;) {
    let vue
    try {
      vue = await api(`/api/travaux/${encodeURIComponent(travail.id)}?depuis=${curseur}`)
    } catch (e) {
      majPastilleJournal('echec')
      throw e
    }
    if (vue.tronque) zone.textContent += `… (début du journal purgé)\n`
    if (vue.lignes.length) {
      zone.textContent += vue.lignes.join('\n') + '\n'
      zone.scrollTop = zone.scrollHeight
    }
    curseur = vue.curseur
    if (vue.etat !== 'encours') {
      majPastilleJournal(vue.etat)
      appli.travail = null
      majPastilleTravail(false)
      $('journal').classList.remove('encours')
      return vue
    }
    await pause(700)
  }
}

/**
 * Un envoi dont on voit l'avancée.
 *
 * `fetch` ne rend aucune progression d'envoi — c'est une limite de l'API, pas
 * un oubli. `XMLHttpRequest` reste le seul moyen d'obtenir `upload.onprogress`,
 * et sur un fichier de deux gigaoctets la différence n'est pas cosmétique :
 * sans elle, l'écran est identique à un écran figé pendant plusieurs minutes.
 */
function envoieAvecProgression(chemin, donnees, cadre) {
  return new Promise((resoud, rejette) => {
    const x = new XMLHttpRequest()
    x.open('POST', chemin)
    x.responseType = 'json'

    x.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable || !cadre) return
      cadre.style.setProperty('--avance', String(e.loaded / e.total))
    })
    const fini = () => { if (cadre) cadre.style.removeProperty('--avance') }

    x.addEventListener('load', () => {
      fini()
      const d = x.response ?? {}
      if (x.status >= 200 && x.status < 300) return resoud(d)
      // Le devis d'un appel payant voyage en 402 : on garde la forme que
      // `apiPayante` sait lire, au cas où cette route le deviendrait.
      if (x.status === 402 && d.confirmation_requise) return rejette(new BesoinAccord(d))
      const e = new Error(d.erreur ?? `Le serveur a répondu ${x.status}.`)
      e.statut = x.status
      rejette(e)
    })
    x.addEventListener('error', () => {
      fini()
      rejette(new Error(
        `Le serveur de l'atelier ne répond plus. Vérifie que la fenêtre où tourne ` +
          `« npm run atelier » est toujours ouverte.`
      ))
    })
    x.addEventListener('abort', () => { fini(); rejette(new Error(`Envoi interrompu.`)) })
    x.send(donnees)
  })
}

/** Lance, suit, rafraîchit l'état. Rend la vue finale du travail, ou `null`. */
async function mene(lancement, { refus = 'Annulé.' } = {}) {
  try {
    annonce('')
    const reponse = await lancement()
    if (reponse === null) { annonce(refus); return null }

    // Une commande courte est déjà finie quand le serveur répond : son résultat
    // est dans la réponse, il n'y a rien à suivre.
    const t = reponse.travail
    const vue = t && t.etat === 'encours' ? await suisLeTravail(t) : t
    if (vue && vue.etat === 'echec') {
      annonce(derniereErreur(vue), 'erreur')
      await rafraichitEtat()
      return vue
    }
    await rafraichitEtat()
    return vue ?? reponse
  } catch (e) {
    annonce(e.message, 'erreur')
    return null
  }
}

/** La phrase qui explique l'échec : celle qui suit la croix, pas la dernière. */
function derniereErreur(vue) {
  const lignes = vue.lignes ?? []
  const i = lignes.map((l) => l.trimStart().startsWith('✗')).lastIndexOf(true)
  if (i >= 0) return lignes.slice(i).join('\n').replace(/^\s*✗\s*/, '').trim()
  return lignes.filter((l) => l.trim()).at(-1) ?? `La commande s'est arrêtée (code ${vue.code}).`
}

$('btnJournalFerme').addEventListener('click', () => { $('journal').hidden = true })

/**
 * Un bouton qui travaille le montre, et ne se laisse pas cliquer deux fois.
 *
 * SEPT COMMANDES TRAVAILLAIENT SANS RIEN CHANGER À L'ÉCRAN, de trente secondes
 * à huit minutes. Deux d'entre elles appelaient un service payant : cliquer une
 * seconde fois demandait un second devis ET laissait la première promesse
 * suspendue pour toujours, parce que le créneau d'accord est unique et que le
 * second appel l'écrasait sans le résoudre.
 *
 * Le libellé d'attente vaut mieux qu'un simple grisage : il dit CE QUI se
 * passe. Et le bouton retrouve son état quoi qu'il arrive — c'est le `finally`
 * qui compte, pas le chemin heureux.
 */
async function pendant(bouton, libelle, action) {
  // `ev.currentTarget` VAUT `null` APRÈS UN `await`, ET ÇA NE SE VOIT PAS.
  //
  // Le navigateur remet `currentTarget` à zéro dès que l'événement a fini
  // d'être distribué. Un gestionnaire qui attend une confirmation avant
  // d'appeler `pendant(ev.currentTarget, …)` lui passe donc `null` — et la
  // ligne suivante levait un TypeError qu'aucun `catch` n'attrapait. Le clic
  // n'avait plus aucun effet, sans le moindre message : la fenêtre se fermait,
  // on revenait à la liste, et rien ne s'était lancé.
  //
  // On fait le travail quand même : perdre l'animation d'un bouton est sans
  // conséquence, perdre l'action ne l'est pas.
  if (!bouton) return await action()
  if (bouton.disabled) return null
  const avant = bouton.textContent
  bouton.disabled = true
  bouton.textContent = libelle
  bouton.classList.add('travaille')
  try {
    return await action()
  } finally {
    bouton.disabled = false
    bouton.textContent = avant
    bouton.classList.remove('travaille')
  }
}

// ---------------------------------------------------------------------------
//  Le devis d'un appel payant
// ---------------------------------------------------------------------------

let accordEnCours = null

function demandeAccord(details) {
  const c = details.cout ?? {}
  $('coutQuoi').textContent = c.quoi ?? details.erreur ?? ''

  const dl = $('coutDetail')
  dl.replaceChildren()
  const ligne = (terme, valeur) => {
    if (valeur === undefined || valeur === null) return
    const dt = creer('dt'); dt.textContent = terme
    const dd = creer('dd'); dd.textContent = valeur
    dl.append(dt, dd)
  }
  ligne('Durée traitée', c.secondes != null ? `${c.secondes} s` : null)
  ligne('Crédits', c.credits != null ? c.credits.toLocaleString('fr-FR') : null)
  ligne('Coût', c.dollars != null ? `${c.dollars.toFixed(2)} $` : null)

  const notes = []
  if (c.bareme) notes.push(`Barème : ${c.bareme}.`)
  if (c.estimee_sur) notes.push(`Estimation calculée sur : ${c.estimee_sur}.`)
  $('coutNote').textContent = notes.join(' ')

  ouvreVoile('voileCout', 'coutOui')
  return new Promise((resoud) => { accordEnCours = resoud })
}

function fermeAccord(reponse) {
  fermeVoile('voileCout')
  const r = accordEnCours
  accordEnCours = null
  if (r) r(reponse)
}

/**
 * Demande confirmation, dans la page.
 *
 * `confirm()` du navigateur ouvre une boîte système : elle sort du décor, elle
 * ne se met pas en français, et sur un geste qui supprime, elle se clique sans
 * la lire parce qu'elle ressemble à toutes les autres. Le dialogue de la page,
 * lui, nomme précisément ce qui part et ce qu'on peut récupérer.
 */
let confirmationEnCours = null

function demandeConfirmation({ titre, quoi, action = 'Supprimer' }) {
  $('confTitre').textContent = titre
  $('confQuoi').textContent = quoi
  $('confOui').textContent = action
  ouvreVoile('voileConfirme', 'confNon')
  return new Promise((resoud) => { confirmationEnCours = resoud })
}

function fermeConfirmation(reponse) {
  fermeVoile('voileConfirme')
  const r = confirmationEnCours
  confirmationEnCours = null
  if (r) r(reponse)
}

$('confOui').addEventListener('click', () => fermeConfirmation(true))
$('confNon').addEventListener('click', () => fermeConfirmation(false))

$('coutOui').addEventListener('click', () => fermeAccord(true))
$('coutNon').addEventListener('click', () => fermeAccord(false))

// ---------------------------------------------------------------------------
//  Les panneaux : six voiles, UN seul comportement
// ---------------------------------------------------------------------------
//
// Ils s'étaient accumulés un par un, et chacun avait fini par fermer à sa
// façon : deux répondaient à Échap, un seul au clic dehors, un ne répondait à
// rien. Sur des panneaux qui se ressemblent trait pour trait, cette loterie est
// pire qu'une absence de raccourci — on apprend un geste qui marche une fois
// sur trois.
//
// LE FOCUS SE REND À CELUI QUI L'AVAIT. Ouvrir un panneau vole le focus au
// bouton qui l'a ouvert ; sans restitution, la tabulation repart du début du
// document à chaque fermeture.

const VOILES = ['voileCout', 'voileConfirme', 'voileNouvelle', 'voileNouvChaine', 'voilePlan', 'voileChaines', 'voileVideos', 'voileIdentite', 'voileCles']
const focusAvantVoile = new Map()

function ouvreVoile(id, aFocaliser = null) {
  focusAvantVoile.set(id, document.activeElement)
  $(id).hidden = false
  if (aFocaliser) $(aFocaliser).focus()
}

function fermeVoile(id) {
  // FERMER UN MENU D'ENTRÉE, C'EST AVOIR CHOISI.
  //
  // Le marquage est ici et pas sur les boutons, parce qu'il y a quatre façons de
  // refermer un panneau : son bouton d'action, « Fermer », Échap, et le clic
  // hors du panneau. Trois d'entre elles auraient laissé le menu revenir au
  // rafraîchissement suivant, ce qui l'aurait fait passer pour cassé.
  //
  // Refermer le menu des chaînes ne fait avancer l'entrée que si l'on était en
  // train d'entrer : le rouvrir au milieu d'un montage, puis le refermer, ne
  // doit pas redemander quelle vidéo on travaillait — elle est à l'écran.
  // Changer de chaîne est l'autre cas, et il ne passe pas par ici : il recharge
  // la page en posant lui-même la marque.
  if (id === 'voileChaines' && etatDEntree() !== 'video') marqueLEntree('chaine')
  if (id === 'voileVideos') marqueLEntree('video')
  // FERMER, C'EST AUSSI SE TAIRE. Il y a quatre façons de refermer un panneau,
  // et trois d'entre elles laissaient la voix off continuer derrière l'écran.
  if (id === 'voilePlan') arretePlanOuvert()
  $(id).hidden = true
  const avant = focusAvantVoile.get(id)
  focusAvantVoile.delete(id)
  // On ne rend le focus qu'à un élément toujours dans le document : une carte
  // de chaîne supprimée entre-temps n'existe plus, et `focus()` sur un noeud
  // détaché ne fait rien de bon.
  if (avant && document.contains(avant)) avant.focus()

  // LA SECONDE MARCHE S'OUVRE APRÈS QUE LA PREMIÈRE S'EST REFERMÉE.
  //
  // Superposer les deux panneaux aurait laissé croire qu'on choisit une vidéo
  // DANS le menu des chaînes, alors que ce sont deux questions successives. La
  // suite se consomme : elle ne vaut que pour cette entrée-ci.
  if (id === 'voileChaines' && apresLesChaines) {
    const suite = apresLesChaines
    apresLesChaines = null
    suite()
  }
}

/** Le panneau du dessus, dans l'ordre où ils se recouvrent. */
function voileOuvert() {
  return VOILES.find((v) => !$(v).hidden) ?? null
}

function fermeLeVoileDuDessus() {
  const v = voileOuvert()
  if (!v) return false
  if (v === 'voileCout') fermeAccord(false)
  else if (v === 'voileConfirme') fermeConfirmation(false)
  else fermeVoile(v)
  return true
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fermeLeVoileDuDessus()
})

for (const v of VOILES) {
  // Le clic ne ferme que s'il tombe SUR le voile, pas dans le panneau : sinon
  // un clic dans un champ de texte refermerait tout.
  $(v).addEventListener('click', (e) => {
    if (e.target !== $(v)) return
    if (v === 'voileCout') fermeAccord(false)
    else if (v === 'voileConfirme') fermeConfirmation(false)
    else fermeVoile(v)
  })
}

// ---------------------------------------------------------------------------
//  Le séquencement : ce qui est fait, ce qui bloque, et POURQUOI
// ---------------------------------------------------------------------------

// La pastille affiche déjà une coche quand c'est fait, et un numéro sinon :
// « à jour » et « pas encore » ne faisaient que le répéter en mots. Seul
// « à refaire » porte une information que la pastille ne donne pas.
const VERDICTS = { fait: '', perime: 'à refaire', absent: '' }

/** Les catégories d'ElevenLabs, qui arrivent en anglais. */
const CATEGORIES = { premade: 'livrée', cloned: 'clonée', professional: 'pro', generated: 'générée' }
// ElevenLabs rend son vocabulaire en anglais. Une fiche de voix qui dit
// « female · middle_aged » se lit deux fois : une fois pour traduire, une fois
// pour juger. On traduit ici, une bonne fois.
const GENRES = { female: 'féminine', male: 'masculine', neutral: 'neutre' }
const AGES = { young: 'jeune', middle_aged: 'adulte', old: 'âgée' }
const TONS = {
  calm: 'posée', casual: 'décontractée', confident: 'assurée', deep: 'grave',
  professional: 'professionnelle', pleasant: 'agréable', classy: 'distinguée',
  gentle: 'douce', upbeat: 'enjouée', cute: 'mignonne', excited: 'enthousiaste',
  chill: 'tranquille', crisp: 'nette', modulated: 'modulée', neutral: 'neutre',
  formal: 'formelle', mature: 'mûre', intense: 'intense', relaxed: 'détendue',
  serious: 'sérieuse', soft: 'feutrée', wise: 'sage', raspy: 'éraillée',
  anxious: 'anxieuse', hyped: 'survoltée', rough: 'rugueuse', grumpy: 'bougonne',
  sad: 'triste', meditative: 'méditative', whispery: 'chuchotée', sassy: 'insolente',
}

/**
 * Pour chaque étape : son verdict, et la phrase qui dit ce qui l'empêche.
 *
 * UNE ÉTAPE BLOQUÉE DOIT DIRE POURQUOI, ET QUOI FAIRE.
 *
 * C'est la marche sur laquelle la version précédente s'est cassée : un bouton
 * « Écrire le script » qui produisait un brief puis s'arrêtait, sans que rien
 * n'explique qu'il fallait revenir dans la conversation pour valider. Une étape
 * qui ne peut pas se faire ici n'affiche donc pas un bouton grisé : elle affiche
 * la phrase qui débloque, avec la commande à taper.
 */
function lisLeSequencement() {
  const e = appli.etat
  if (!e) return ETAPES.map((x) => ({ ...x, verdict: 'absent', blocage: null }))

  const et = e.etapes
  const script = et.script ?? { verdict: 'absent', mots: 0 }
  // Un script « présent » mais vide est le squelette écrit par `depose.mjs` pour
  // que le montage connaisse le format. Il ne dit rien du contenu : le traiter
  // comme un script écrit ferait construire un montage sur du vide.
  const scriptEcrit = script.verdict !== 'absent' && (script.mots ?? 0) > 0
  const destination = e.destination ?? destinationRetenue(e.slug)

  // UN BLOCAGE EST UNE PHRASE ET UN BOUTON, PLUS UN PARAGRAPHE.
  //
  // Ils expliquaient POURQUOI — jusqu'à deux cent quatorze caractères sur la
  // cadence inventée qui ne vaudrait rien. Le raisonnement était juste et il
  // n'avait rien à faire là : quand l'outil dit non, la seule chose qu'on veut
  // savoir est où aller. C'est exactement l'endroit où « compréhensible en un
  // clic » se joue, puisque c'est le seul écran qui arrête.
  //
  // `vers` mène à l'étape qui débloque ; `copie` sert au seul cas qui ne se
  // règle pas ici — le script s'écrit en conversation, et la commande à taper
  // est la seule sortie.
  const vers = (texte, cle) => ({ texte, vers: cle })
  const blocages = {
    destination: null,

    rush: destination ? null : vers(`Choisis d'abord la destination.`, 'destination'),

    voixChoisie: et.rush?.verdict === 'absent'
      ? vers(`Dépose d'abord la prise.`, 'rush')
      : null,

    // L'AUDIO NE DEMANDE PAS DE SCRIPT, ET IL A EU TORT DE LE DEMANDER.
    //
    // Ce blocage a existé une demi-journée, parce que le bouton lance `monte`,
    // qui refusait la commande entière faute de script. La bonne correction
    // n'était pas de l'annoncer plus tôt : c'était que `monte` aille aussi loin
    // qu'il peut. Convertir la voix et transcrire ne lisent aucun bloc — et ce
    // sont justement les deux choses qu'on veut dès qu'une prise est déposée.
    // La commande s'arrête maintenant proprement avant le calage, qui est la
    // première étape à avoir vraiment besoin du texte écrit.
    audio: et.rush?.verdict === 'absent'
      ? vers(`Dépose d'abord la prise.`, 'rush')
      : et.voixChoisie?.verdict === 'absent'
        ? vers(`Retiens d'abord une voix.`, 'voixChoisie')
        : null,

    // L'AUDIO ET LE TRANSCRIPT NE SONT PAS LA MÊME CHOSE, ET ILS PEUVENT SE
    // SÉPARER.
    //
    // Cette ligne disait « Génère d'abord l'audio » dès que le transcript
    // manquait, parce que le bouton de l'étape 4 produit les deux d'un coup.
    // Mais `npm run voix` convertit SANS transcrire : après lui, l'audio est là,
    // le transcript non — et l'écran réclamait un audio qu'on venait d'écouter
    // juste au-dessus. On nomme donc ce qui manque vraiment.
    soustitres: et.transcript?.verdict !== 'absent'
      ? null
      : et.audio?.verdict === 'absent'
        ? vers(`Génère d'abord l'audio.`, 'audio')
        // RIEN A DECIDER, DONC UN BOUTON — pas une commande a recopier.
        : { texte: `L'audio est là, mais pas encore transcrit.`, action: 'transcris' },

    // LA PRISE EST LÀ : IL N'Y A PLUS RIEN À DÉCIDER, DONC RIEN À TAPER.
    //
    // Cet écran renvoyait vers « /script », une commande à copier dans le fil,
    // pour une vidéo DÉJÀ TOURNÉE. C'était le défaut de la première interface
    // revenu par une autre porte : une marche sans bouton là où aucun jugement
    // n'est demandé. Le découpage se calcule, les requêtes d'images se
    // traduisent — ni l'un ni l'autre ne s'argumente.
    plan: !scriptEcrit
      ? et.transcript?.verdict === 'absent'
        ? { texte: `Le script n'est pas écrit, et la prise n'est pas transcrite.`, copie: `/script ${e.slug}` }
        : { texte: `Le script n'est pas encore déduit de la prise.`, action: 'script' }
      : et.transcript?.verdict === 'absent'
        ? vers(`Génère d'abord l'audio.`, 'audio')
        : null,

    rendu: et.plan?.verdict === 'absent'
      ? vers(`Construis d'abord le montage.`, 'plan')
      : null,
  }

  return ETAPES.map((etape) => {
    let verdict
    if (etape.cle === 'destination') verdict = destination ? 'fait' : 'absent'
    else verdict = et[etape.cle]?.verdict ?? 'absent'
    return { ...etape, verdict, blocage: blocages[etape.cle] ?? null }
  })
}

/**
 * Le rail : construit UNE fois, mis à jour ensuite.
 *
 * IL ÉTAIT DÉTRUIT ET RECONSTRUIT À CHAQUE RESPIRATION.
 *
 * `replaceChildren()` puis sept boutons neufs, à chaque action et à chaque
 * retour dans la fenêtre. Des nœuds neufs n'ont pas d'état antérieur : AUCUNE
 * transition CSS ne peut se déclencher sur un changement de verdict, quoi qu'on
 * écrive dans la feuille de style. C'était le verrou — pas un réglage de durée.
 *
 * On garde donc les sept boutons et on n'écrit plus que ce qui change. La
 * pastille ne saute qu'au moment PRÉCIS où l'étape devient faite ; posée à
 * chaque redessin, elle sauterait aussi au simple retour dans la fenêtre, et
 * une animation qui se déclenche sans raison est pire que pas d'animation.
 */
const marches = new Map()
const verdictsVus = new Map()

function batisLeRail() {
  const rail = $('rail')
  rail.replaceChildren()
  marches.clear()

  for (const [i, etape] of ETAPES.entries()) {
    const b = creer('button', 'marche')
    b.type = 'button'
    b.dataset.cle = etape.cle

    const num = creer('span', 'marche-num')
    num.textContent = String(i + 1)

    const bloc = creer('span')
    const nom = creer('span', 'marche-nom')
    nom.textContent = etape.nom
    const etat = creer('span', 'marche-etat')
    bloc.append(nom, etat)

    b.append(num, bloc)
    b.addEventListener('click', () => montre(etape.cle))
    rail.append(b)
    marches.set(etape.cle, { b, num, etat, rang: i + 1 })
  }
}

function dessineLeRail() {
  if (!marches.size) batisLeRail()
  for (const etape of lisLeSequencement()) {
    const m = marches.get(etape.cle)
    if (!m) continue
    const verdict = etape.blocage ? 'bloque' : etape.verdict
    const fait = etape.verdict === 'fait' && !etape.blocage

    m.b.dataset.verdict = verdict
    m.b.classList.toggle('courante', etape.cle === appli.etapeCourante)
    m.num.textContent = fait ? '✓' : String(m.rang)
    m.etat.textContent = etape.blocage ? 'en attente' : VERDICTS[etape.verdict]

    // Le saut de la pastille marque le PASSAGE à « fait », pas l'état « fait ».
    if (fait && verdictsVus.get(etape.cle) !== 'fait') {
      m.num.classList.remove('vient-de-finir')
      // Deux images de battement : sans elles, le navigateur ne voit pas la
      // classe partir puis revenir, et l'animation ne rejoue pas.
      requestAnimationFrame(() => requestAnimationFrame(() => m.num.classList.add('vient-de-finir')))
    }
    verdictsVus.set(etape.cle, fait ? 'fait' : verdict)
  }
}

/**
 * Passe à l'étape suivante, après une validation qui a réussi.
 *
 * SEPT ÉCRANS, SEPT FAÇONS DE NE PAS AVANCER.
 *
 * Chaque étape avait son bouton de validation, et aucun ne menait nulle part :
 * on cliquait, la marche passait au vert, la suivante continuait de dire « en
 * attente », et il fallait deviner qu'on avait fini en allant la chercher dans
 * le rail. Sept fois par vidéo.
 *
 * La règle est la même partout : **valider avance**. Le rail reste là pour
 * revenir, et revenir n'annule rien — avancer n'engage donc à rien non plus.
 *
 * Le rendu est le terminus : c'est là que le fichier se télécharge, il n'y a
 * pas d'après.
 */
function avanceApres(cle) {
  const i = ETAPES.findIndex((e) => e.cle === cle)
  if (i < 0 || i >= ETAPES.length - 1) return
  montre(ETAPES[i + 1].cle)
}

function montre(cle, { relis = true } = {}) {
  // LE SENS DU DÉPLACEMENT EST LA SEULE CHOSE QUE L'ANIMATION TRANSPORTE.
  //
  // Sept écrans se remplaçaient d'un coup, sans qu'on sache si l'on avançait
  // dans la séquence ou si l'on revenait en arrière. Douze pixels dans le bon
  // sens suffisent à le dire, et c'est tout ce qu'on lui demande.
  //
  // ON NE REJOUE RIEN QUAND ON NE SE DÉPLACE PAS, ET C'ÉTAIT « L'ÉCRAN QUI
  // BOUGE TOUT SEUL ».
  //
  // Cette fonction se rappelle elle-même sur la MÊME étape dès que l'état a
  // bougé sur le disque — ce qui arrive après chaque correction de sous-titre,
  // puisque le plan est retouché. `data-sens` repassait alors à « avant », le
  // nom de l'animation CSS changeait, et l'étape rejouait son entrée : un
  // glissement de six pixels et un fondu, sans que rien n'ait été demandé. En
  // venant de l'étape 6, donc en « arrière », c'était systématique.
  const surPlace = cle === appli.etapeCourante
  const avant = ETAPES.findIndex((x) => x.cle === appli.etapeCourante)
  const apres = ETAPES.findIndex((x) => x.cle === cle)
  if (!surPlace) $('scene').dataset.sens = avant >= 0 && apres < avant ? 'arriere' : 'avant'

  // ON N'ABANDONNE PAS UNE CORRECTION EN QUITTANT L'ÉCRAN.
  //
  // Les corrections en attente vivaient en mémoire jusqu'au prochain
  // `focusout` hors de la colonne. Changer d'étape ne comptait pas : on
  // corrigeait cinq lignes, on passait aux plans, et rien n'était parti.
  if (!surPlace && corrections.size) {
    enregistreLesCorrections().catch(() => { /* `mene` a déjà annoncé */ })
  }

  // L'APERÇU NE S'ARRÊTAIT JAMAIS.
  //
  // Sa boucle tournait pendant les huit minutes d'un rendu, à réécrire le
  // curseur et le chronomètre soixante fois par seconde sur un écran que
  // personne ne regardait.
  if (cle !== 'soustitres') arreteLApercu()

  appli.etapeCourante = cle
  for (const section of document.querySelectorAll('.etape')) {
    section.hidden = section.dataset.cle !== cle
  }
  dessineLeRail()
  // Sur une fenêtre étroite, le rail défile à l'horizontale : la marche qu'on
  // vient de choisir peut se trouver hors du champ visible.
  $('rail').querySelector('.marche.courante')
    ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })

  const etape = lisLeSequencement().find((x) => x.cle === cle)
  const section = document.querySelector(`.etape[data-cle="${cle}"]`)
  const blocage = section.querySelector('.blocage')
  blocage.replaceChildren()
  if (etape.blocage) {
    const p = creer('p')
    p.textContent = etape.blocage.texte
    blocage.append(p)
    if (etape.blocage.vers) {
      const b = creer('button', 'bouton minuscule')
      b.type = 'button'
      b.textContent = `Aller à l'étape ${ETAPES.findIndex((x) => x.cle === etape.blocage.vers) + 1}`
      b.addEventListener('click', () => montre(etape.blocage.vers))
      blocage.append(b)
    } else if (etape.blocage.action === 'transcris') {
      const b = creer('button', 'bouton minuscule primaire')
      b.type = 'button'
      b.textContent = `Transcrire la voix`
      b.title = `whisper, en local : gratuit, hors ligne. Compte une à deux minutes par minute d'audio.`
      b.addEventListener('click', (ev) =>
        pendant(ev.currentTarget, 'Transcription…', async () => {
          const vue = await mene(() =>
            api(`/api/videos/${encodeURIComponent(appli.slug)}/transcris`, { methode: 'POST' })
          )
          if (vue?.etat === 'fini') annonce(`Transcrit — les sous-titres peuvent se régler.`, 'ok')
        })
      )
      blocage.append(b)
    } else if (etape.blocage.action === 'script') {
      const b = creer('button', 'bouton minuscule primaire')
      b.type = 'button'
      b.textContent = `Déduire le script de la prise`
      b.title =
        `Découpe la prise en passages et écrit, pour chacun, une requête d'images. ` +
        `Le montage a besoin de ça et de rien d'autre.`
      b.addEventListener('click', (ev) =>
        pendant(ev.currentTarget, 'Lecture de la prise…', async () => {
          const vue = await mene(() =>
            api(`/api/videos/${encodeURIComponent(appli.slug)}/script`, { methode: 'POST' })
          )
          if (vue?.etat === 'fini') annonce(`Script déduit — tu peux générer les plans.`, 'ok')
        })
      )
      blocage.append(b)
    } else if (etape.blocage.copie) {
      // Le script s'écrit en conversation : on ne peut pas y aller d'ici, on
      // peut seulement donner la commande — et éviter d'avoir à la retaper.
      const b = creer('button', 'bouton minuscule')
      b.type = 'button'
      b.textContent = `Copier « ${etape.blocage.copie} »`
      b.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(etape.blocage.copie)
          b.textContent = 'Copié'
          setTimeout(() => { b.textContent = `Copier « ${etape.blocage.copie} »` }, 1500)
        } catch {
          annonce(`Tape ceci dans Claude Code : ${etape.blocage.copie}`)
        }
      })
      blocage.append(b)
    }
  }
  blocage.hidden = !etape.blocage

  // UNE ÉTAPE BLOQUÉE N'AFFICHE PAS SES COMMANDES.
  //
  // Montrer la raison ET le bouton juste en dessous envoie deux messages
  // contradictoires : on clique, ça échoue, et la raison affichée passe pour
  // décorative. On retire donc ce qui agit, et il ne reste que la phrase qui dit
  // quoi faire — c'est exactement ce qui manquait à la version précédente.
  const bloque = Boolean(etape.blocage)
  for (const zone of section.querySelectorAll('.commandes, .bouton.grand, .depot, .filtres, .reglage-essai, .liste-voix, .studio, .cartes, .case, .doctrine, .parle')) {
    zone.hidden = bloque
  }

  // ON REDESSINE MÊME QUAND C'EST BLOQUÉ, ET C'EST LA CORRECTION LA PLUS CHÈRE.
  //
  // Le masquage ci-dessus ne couvre ni `.fiche`, ni `.master`, ni le lien de
  // téléchargement : sur une étape bloquée, ils gardaient le contenu de la
  // vidéo PRÉCÉDENTE. On montait A jusqu'au master, on passait à B, et
  // « Télécharger le master » donnait le fichier de A — sans qu'aucun signal ne
  // l'annonce. Chaque `dessineXxx` gère déjà son cas « absent » ; les appeler
  // toujours efface donc ce qui n'a plus lieu d'être.
  dessineEtape(cle)

  // ENTRER DANS UNE ÉTAPE LA RELIT SUR LE DISQUE.
  //
  // Les sept écrans dessinaient depuis `appli.etat`, une copie en mémoire que
  // seules quelques actions prenaient la peine de rafraîchir. Échanger un plan
  // de coupe n'en faisait pas partie : on passait à l'étape 7, et elle
  // annonçait « Master à jour » alors que le plan venait de changer sous elle.
  // Pire qu'un écran vide — un écran qui affirme le contraire de la vérité.
  //
  // On dessine donc tout de suite avec ce qu'on a (la navigation reste
  // instantanée), puis on relit, et on ne redessine QUE si quelque chose a
  // bougé. Le cas courant — rien n'a changé — ne coûte qu'une lecture.
  if (relis) {
    const avant = signatureDeLEtat()
    relisLEtat()
      .then(() => {
        if (appli.etapeCourante !== cle) return
        if (signatureDeLEtat() === avant) return
        montre(cle, { relis: false })
      })
      .catch(() => { /* le serveur dira le reste ; l'écran garde ce qu'il a */ })
  }
}

function dessineEtape(cle) {
  if (cle === 'destination') dessineDestination()
  if (cle === 'rush') dessineRush()
  if (cle === 'voixChoisie') dessineVoix()
  if (cle === 'audio') dessineAudio()
  if (cle === 'soustitres') chargeLeStudio()
  if (cle === 'plan') dessinePlan()
  if (cle === 'rendu') dessineRendu()
}

// ---------------------------------------------------------------------------
//  La vidéo courante
// ---------------------------------------------------------------------------

/**
 * La vidéo ouverte, retenue par onglet.
 *
 * SANS ÇA, CHOISIR NE SERVAIT QUE JUSQU'AU RAFRAÎCHISSEMENT SUIVANT.
 *
 * `appli.slug` ne vivait qu'en mémoire : après F5 — ou après une commande qui
 * recharge la page — on retombait sur `videos[0]`, c'est-à-dire sur la vidéo la
 * plus récemment modifiée, qui n'est pas celle qu'on venait d'ouvrir. On
 * repartait donc travailler dans une autre vidéo sans qu'aucun signal ne le
 * dise. Le menu d'entrée rendait le défaut criant : on choisit, et le choix se
 * perd.
 */
const CLE_VIDEO = 'atelier.video'
const videoRetenue = () => {
  try { return sessionStorage.getItem(CLE_VIDEO) } catch { return null }
}
const retiensLaVideo = (slug) => {
  try {
    if (slug) sessionStorage.setItem(CLE_VIDEO, slug)
    else sessionStorage.removeItem(CLE_VIDEO)
  } catch { /* mode privé */ }
}

/**
 * Une empreinte de l'état, pour savoir s'il a bougé.
 *
 * Redessiner une étape coûte : celle des plans relance une commande et
 * reconstruit trente vignettes. On ne le fait donc que si quelque chose a
 * réellement changé sur le disque — sinon on relit, on compare, et on s'arrête
 * là.
 */
const signatureDeLEtat = () => JSON.stringify(appli.etat?.etapes ?? null)

/**
 * Relit l'état du disque. NE REDESSINE RIEN.
 *
 * La séparation existe pour que `montre()` puisse relire sans se rappeler
 * lui-même : `rafraichitEtat` se termine par `montre()`, et les deux
 * s'appelaient en boucle.
 */
async function relisLEtat() {
  appli.videos = await api('/api/etat')
  if (!appli.videos.length) { appli.slug = null; appli.etat = null }
  else if (!appli.videos.some((v) => v.slug === appli.slug)) appli.slug = appli.videos[0].slug
  appli.etat = appli.videos.find((v) => v.slug === appli.slug) ?? null
  // Un seul point d'écriture : cette fonction tourne après CHAQUE changement de
  // vidéo — le sélecteur, le menu, une création, une suppression — et elle est
  // la seule à connaître le slug définitivement retenu. Le noter dans chaque
  // appelant aurait laissé le prochain chemin l'oublier.
  retiensLaVideo(appli.slug)

  const sel = $('selVideo')
  sel.replaceChildren()
  for (const v of appli.videos) {
    const o = creer('option')
    o.value = v.slug
    o.textContent = v.titre && v.titre !== v.slug ? `${v.slug} — ${v.titre}` : v.slug
    sel.append(o)
  }
  sel.value = appli.slug ?? ''
  sel.disabled = !appli.videos.length
}

async function rafraichitEtat() {
  await relisLEtat()
  // L'état vient d'être lu : inutile que `montre` le relise dans la foulée.
  if (appli.etapeCourante) montre(appli.etapeCourante, { relis: false })
  else dessineLeRail()
}

$('selVideo').addEventListener('change', async () => {
  // CHANGER DE VIDÉO AVEC UNE CORRECTION EN ATTENTE ÉTAIT LE PIRE DES CAS.
  //
  // Les corrections sont désignées par la ligne d'UNE vidéo. Les laisser en
  // mémoire après un changement de slug les aurait envoyées à la SUIVANTE, sur
  // des lignes qui n'ont rien à voir. On écrit donc avant de partir, et on
  // attend : c'est la seule fois où l'attente est justifiée, parce que ce qui
  // suit détruit le contexte dont ces corrections ont besoin.
  if (corrections.size) {
    await enregistreLesCorrections().catch(() => { /* `mene` a déjà annoncé */ })
    corrections.clear()
  }
  appli.slug = $('selVideo').value
  appli.st = null
  appli.catalogue = null
  arreteLApercu()
  appli.etat = appli.videos.find((v) => v.slug === appli.slug) ?? null
  await rafraichitEtat()
  montre(premiereEtapeUtile())
})

// L'ÉTAT SE RELIT AU RETOUR DANS LA FENÊTRE, PAS SUR UN BOUTON.
//
// Il y avait un bouton « Relire l'état ». Il faisait son travail, mais sans
// rien afficher quand rien n'avait changé — c'est-à-dire presque toujours, vu
// que l'interface relit l'état après chaque action. Un bouton qui ne montre
// jamais d'effet passe pour cassé, et celui-ci l'a fait.
//
// Le seul moment où l'état a VRAIMENT pu changer dans le dos de l'interface,
// c'est quand on est allé travailler ailleurs : un rendu lancé au terminal, un
// fichier déplacé à la main. On relit donc au retour dans la fenêtre, ce qui
// couvre exactement ce cas et ne demande rien à personne.
window.addEventListener('focus', () => {
  if (document.hidden) return
  rafraichitEtat().catch(() => { /* le serveur dira le reste */ })
  // Le budget a pu bouger pendant qu on etait ailleurs — une conversion lancee
  // au terminal, une generation dans une autre fenetre.
  //
  // MAIS PAS À CHAQUE FOIS, ET LE PRIX ÉTAIT AILLEURS QUE DANS L'EN-TÊTE.
  //
  // Lire les quatre soldes prend deux secondes, et le garde « travail en cours »
  // de `/api/chaines/ouvre` attend la fin de tout travail avant de basculer.
  // Revenir du terminal, cliquer sur la chaîne, cliquer « Ouvrir » : les trois
  // gestes tiennent dans ces deux secondes, et la bascule les attendait. Un
  // solde vieux d'une minute n'a jamais fait prendre une mauvaise décision ;
  // deux secondes d'attente sur un clic, si.
  majLeBudget().catch(() => {})
})

function premiereEtapeUtile() {
  const seq = lisLeSequencement()
  return (seq.find((x) => x.verdict !== 'fait') ?? seq[0]).cle
}

// ---------------------------------------------------------------------------
//  Nouvelle vidéo
// ---------------------------------------------------------------------------

/**
 * Deux boutons ouvrent cette demande : celui de l'en-tête, et celui du menu des
 * vidéos — qui est l'écran d'accueil d'une chaîne, donc l'endroit où l'on décide
 * entre reprendre une vidéo et en commencer une.
 */
/**
 * « vidéo 2 » DOIT DONNER « video-2 », PAS UN REFUS.
 *
 * Le champ demandait un slug déjà propre et rejetait tout le reste. Or on tape
 * ce qu'on a en tête, dans la langue du dossier — accents compris — et la
 * chaîne travaille en français : exiger la forme machine avant de l'avoir
 * montrée, c'est faire faire à la main un travail de trois lignes.
 *
 * Même transformation que `slugifie()` de `chemins.mjs`, qui nomme déjà les
 * dossiers partout ailleurs : décomposer, retirer les diacritiques, minuscules,
 * tout le reste en trait d'union. Le serveur, lui, continue de refuser net —
 * c'est le seul point d'entrée d'un slug dans un chemin, et sa sévérité est ce
 * qui interdit la traversée. On ne l'assouplit pas : on lui donne ce qu'il
 * attend.
 */
const slugifie = (texte) =>
  String(texte)
    .normalize('NFD')
    // Les diacritiques que `NFD` vient de détacher — la plage U+0300 à U+036F.
    // Ce sont des caractères combinants : dans un éditeur, ils s'accrochent au
    // crochet qui les précède et la ligne paraît vide entre les crochets.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

/** Ce qui sera créé, dit avant de cliquer. */
function montreLApercuDuSlug() {
  const brut = $('nouvSlug').value
  const slug = slugifie(brut)
  const apercu = $('nouvApercu')
  const mots = slug.split('-').filter(Boolean)

  if (!brut.trim()) { apercu.hidden = true; return }

  if (!slug) {
    apercu.textContent = `Rien d'utilisable là-dedans : il faut au moins une lettre ou un chiffre.`
    apercu.classList.add('erreur')
  } else if (mots.length > 2) {
    // La règle des deux mots appartient à `depose.mjs`, qui la refuse à la
    // création. La redire ici évite d'aller au bout pour se faire jeter — et on
    // propose la coupe plutôt que de laisser chercher.
    apercu.textContent =
      `« ${slug} » fait ${mots.length} mots. Deux au plus — par exemple « ${mots.slice(0, 2).join('-')} ».`
    apercu.classList.add('erreur')
  } else {
    apercu.textContent = `Dossier créé : videos/${slug}/`
    apercu.classList.remove('erreur')
  }
  apercu.hidden = false
}

function demandeUneNouvelleVideo() {
  $('nouvErreur').hidden = true
  $('nouvApercu').hidden = true
  $('nouvSlug').value = ''
  ouvreVoile('voileNouvelle', 'nouvSlug')
  $('nouvSlug').focus()
}

$('nouvSlug').addEventListener('input', montreLApercuDuSlug)

$('btnNouvelle').addEventListener('click', demandeUneNouvelleVideo)
$('btnNouvelleDepuisMenu').addEventListener('click', demandeUneNouvelleVideo)
$('nouvNon').addEventListener('click', () => fermeVoile('voileNouvelle'))
$('nouvSlug').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('nouvOui').click() })

$('nouvOui').addEventListener('click', async () => {
  const slug = slugifie($('nouvSlug').value)
  if (!slug) {
    $('nouvErreur').textContent = `Donne un nom : au moins une lettre ou un chiffre.`
    $('nouvErreur').hidden = false
    return
  }
  try {
    const r = await api('/api/videos', { methode: 'POST', corps: { slug } })
    fermeVoile('voileNouvelle')
    // La vidéo est créée : la question « laquelle » est tranchée, et le menu qui
    // la posait n'a plus lieu d'être ouvert derrière.
    if (!$('voileVideos').hidden) fermeVoile('voileVideos')
    appli.slug = r.slug
    appli.st = null
    await rafraichitEtat()
    montre('destination')
    annonce(`Dossier videos/${r.slug}/ créé. Choisis sa destination.`, 'ok')
  } catch (e) {
    $('nouvErreur').textContent = e.message
    $('nouvErreur').hidden = false
  }
})
// ---------------------------------------------------------------------------

/**
 * La destination choisie AVANT le dépôt n'a nulle part où s'écrire.
 *
 * `POST /api/videos` ne l'écrit pas : le squelette de `01-script.json`
 * appartient à `depose.mjs`, seul à savoir traduire une destination en clé de
 * format réellement présente dans `chaine.json`. Elle voyage donc avec le
 * fichier, au dépôt. En attendant, on la garde ici — un rafraîchissement de page
 * entre le choix et le dépôt ne doit pas obliger à refaire le choix.
 */
const cleDestination = (slug) => `atelier.destination.${slug}`
const destinationRetenue = (slug) => {
  try { return localStorage.getItem(cleDestination(slug)) } catch { return null }
}
const retiensDestination = (slug, valeur) => {
  try { localStorage.setItem(cleDestination(slug), valeur) } catch { /* mode privé */ }
}

// LE MODE SE RETIENT COMME LA DESTINATION : localement, par vidéo.
//
// Il ne décide de rien sur le disque tant qu'on n'a rien lancé — c'est une
// intention, pas un état. L'écrire dans le dossier de la vidéo avant d'avoir
// produit quoi que ce soit ferait mentir `npm run etat`.
//
// IL SE CHOISIT À L'ÉTAPE 6, LÀ OÙ IL SERT ET OÙ IL SE PAIE.
//
// Il vivait à l'étape 1, sous le format. Rien ne l'y obligeait : le dépôt, la
// transcription et la voix l'ignorent complètement, et on le choisissait donc
// cinq écrans avant qu'il ne change quoi que ce soit — pour ne plus s'en
// souvenir en arrivant devant le bouton qu'il commande.
const cleMode = (slug) => `atelier.mode.${slug}`
const modeRetenu = (slug) => {
  try { return localStorage.getItem(cleMode(slug)) } catch { return null }
}
const retiensMode = (slug, valeur) => {
  try { localStorage.setItem(cleMode(slug), valeur) } catch { /* mode privé */ }
}

function dessineLesModes() {
  const zone = $('zoneModes')
  zone.hidden = !appli.slug
  if (zone.hidden) return

  const mode = modeDeLaVideo()
  for (const carte of document.querySelectorAll('#cartesMode .carte')) {
    carte.classList.toggle('retenue', carte.dataset.mode === mode)
  }
  $('panneauCopie').hidden = mode !== 'copie'
  if (mode === 'copie') remplitLesAvatars()
  // LE MODE EST LE RÉGLAGE, IL NE PRÉ-COCHE PLUS UNE CASE.
  //
  // « Création assistée » cochait « Combler les trous par IA » deux écrans plus
  // loin, et la recochait à chaque redessin de l'étape 1 : la même décision
  // s'écrivait à deux endroits, dont l'un écrasait l'autre sans le dire. La case
  // a disparu ; ce qui se paie apparaît avec le mode, et se coupe en repassant
  // en création simple.
  $('zoneAssistee').hidden = mode !== 'mixte'
  majLeModeleVideo().catch(() => {})
}

/** Le mode de fabrication retenu pour cette vidéo — « simple » par défaut. */
const modeDeLaVideo = () => modeRetenu(appli.slug) ?? 'simple'

/** Le sélecteur d'avatars, alimenté par la bibliothèque de la chaîne. */
async function remplitLesAvatars() {
  const sel = $('copieAvatar')
  if (appli.avatars === undefined) {
    try {
      const r = await api('/api/avatars')
      appli.avatars = r.resultat?.avatars ?? []
    } catch { appli.avatars = [] }
  }
  const avant = sel.value
  sel.replaceChildren()
  const bouton = $('btnNouvelAvatar')
  if (!appli.avatars.length) {
    const o = creer('option')
    o.value = ''
    o.textContent = 'aucun avatar pour l’instant'
    sel.append(o)
    sel.disabled = true
    // Rien à choisir : c'est le bouton qui porte l'action, et il le montre.
    bouton.classList.add('primaire')
    return
  }
  bouton.classList.remove('primaire')
  sel.disabled = false
  for (const a of appli.avatars) {
    const o = creer('option')
    o.value = a.id
    o.textContent = `${a.nom} — ${a.photos} photo${a.photos > 1 ? 's' : ''}`
    sel.append(o)
  }
  if (avant && appli.avatars.some((a) => a.id === avant)) sel.value = avant
  majLeDevisCopie()
}

/** Le prix AVANT de cliquer — §7 du CLAUDE.md. */
function majLeDevisCopie() {
  const plans = Math.max(1, Math.min(12, Number($('copiePlans').value) || 3))
  $('copieDevis').textContent = `${plans} plan(s) — environ ${(plans * 0.04).toFixed(2)} $ chez fal.`
}

$('copiePlans').addEventListener('input', majLeDevisCopie)

// UN AVATAR APPARTIENT À LA CHAÎNE : ON NE LE CRÉE PAS DANS UNE VIDÉO.
//
// Le bouton n'ouvre donc pas un formulaire ici — il emmène là où les avatars
// vivent, avec le panneau d'ajout déjà déplié. Dupliquer le formulaire aurait
// donné deux endroits pour créer la même chose, et deux endroits qui divergent.
$('btnNouvelAvatar').addEventListener('click', () => montreLEspace('avatars', { ajoute: true }))

$('btnCopie').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Copie…', async () => {
    const lien = $('copieLien').value.trim()
    const avatar = $('copieAvatar').value
    const plans = Math.max(1, Math.min(12, Number($('copiePlans').value) || 3))
    if (!lien) return annonce(`Colle le lien de la vidéo à reproduire.`, 'erreur')
    if (!avatar) return annonce(`Crée un avatar dans l’onglet Avatars.`, 'erreur')

    const ok = await demandeConfirmation({
      titre: `Reproduire cette vidéo ?`,
      quoi:
        `${plans} plan(s), environ ${(plans * 0.04).toFixed(2)} $ chez fal.\n\n` +
        `La référence est rapatriée puis découpée ; chaque tronçon donne le cadrage ` +
        `et l’énergie d’un plan, rejoué avec les photos de l’avatar.`,
      action: 'Générer',
    })
    if (!ok) return

    const vue = await mene(() =>
      api(`/api/videos/${encodeURIComponent(appli.slug)}/copie`, {
        methode: 'POST',
        corps: { lien, avatar, plans },
      })
    )
    if (vue?.etat !== 'fini') return
    const lecteur = $('lecteurCopie')
    lecteur.src = `${urlMedia(appli.slug, `videos/${appli.slug}/05-montage/copie.mp4`)}?v=${Date.now()}`
    lecteur.hidden = false
    annonce(`Plans générés. La piste est muette : pose la voix ensuite.`, 'ok')
  })
)

for (const carte of document.querySelectorAll('#cartesMode .carte')) {
  carte.addEventListener('click', () => {
    if (!appli.slug) return annonce(`Crée d'abord une vidéo.`, 'erreur')
    retiensMode(appli.slug, carte.dataset.mode)
    dessineLesModes()
  })
}

// ---------------------------------------------------------------------------
//  Étape 1 — la destination

// ---------------------------------------------------------------------------
//  Fabriquer la voix — l'étape 2, quand personne n'a enregistré
// ---------------------------------------------------------------------------
//
// LA QUESTION SE POSE AVANT LE DÉPÔT, PAS APRÈS.
//
// Sur une chaîne à avatar, il n'y a pas de prise à déposer : le texte existe et
// la voix se fabrique. Le résultat atterrit dans `02-tournage/` comme un
// enregistrement, et rien en aval ne fait la différence (§3).

const clePrise = (slug) => `atelier.prise.${slug}`
const priseRetenue = (slug) => {
  try { return localStorage.getItem(clePrise(slug)) } catch { return null }
}
const retiensPrise = (slug, v) => {
  try { localStorage.setItem(clePrise(slug), v) } catch { /* mode privé */ }
}

function dessineLesPrises() {
  // UNE ÉTAPE BLOQUÉE NE MONTRE NI L'UN NI L'AUTRE CHEMIN.
  //
  // Cette fonction tourne APRÈS le masquage général : sans ce garde, elle
  // ré-affichait le dépôt sur une étape que le blocage venait de vider, et la
  // raison affichée passait pour décorative — le défaut que ce masquage existe
  // précisément pour corriger.
  if (appli.etat?.etapes?.rush?.blocage) {
    $('panneauParle').hidden = true
    $('depot').hidden = true
    return
  }
  const mode = priseRetenue(appli.slug) ?? 'depot'
  for (const c of document.querySelectorAll('#cartesPrise .carte')) {
    c.classList.toggle('retenue', c.dataset.prise === mode)
  }
  const parle = mode === 'parle'
  $('panneauParle').hidden = !parle
  $('depot').hidden = parle
  // La case « plan de coupe » n'a de sens que pour un fichier qu'on dépose.
  const casePlan = document.querySelector('.case')
  if (casePlan) casePlan.hidden = parle
  if (parle) remplitLesVoixFish()
}

for (const c of document.querySelectorAll('#cartesPrise .carte')) {
  c.addEventListener('click', () => {
    if (!appli.slug) return annonce(`Crée d'abord une vidéo.`, 'erreur')
    retiensPrise(appli.slug, c.dataset.prise)
    dessineLesPrises()
  })
}

async function remplitLesVoixFish() {
  const sel = $('parleVoix')
  if (appli.voixFish === undefined) {
    try {
      const r = await api('/api/voix-fish')
      appli.voixFish = r.resultat ?? {}
      appli.creditFish = r.resultat?.credit ?? null
    } catch { appli.voixFish = {} }
  }
  const d = appli.voixFish ?? {}
  if (sel.childElementCount) return

  sel.replaceChildren()
  const groupe = (titre) => {
    const g = creer('optgroup')
    g.label = titre
    sel.append(g)
    return g
  }
  const pose = (g, valeur, texte) => {
    const o = creer('option')
    o.value = valeur
    o.textContent = texte
    g.append(o)
  }

  if (d.fish?.length) {
    const g = groupe('Mes voix Fish')
    for (const v of d.fish) pose(g, `fish:${v.id}`, `${v.nom}${v.langues?.length ? ` — ${v.langues.join(', ')}` : ''}`)
  }

  // LES MODÈLES ENTRAÎNÉS SONT DANS LA MÊME LISTE, ET LE GROUPE DIT POURQUOI.
  //
  // Ce n'est pas une voix Fish : RVC ne sait pas lire. Fish lit d'abord, le
  // modèle plaque le timbre ensuite. Pour la personne c'est pourtant le même
  // choix — « quelle voix je veux entendre » — donc la même liste. Les séparer
  // en deux menus aurait demandé de comprendre la mécanique avant de choisir.
  if (d.locaux?.length) {
    const g = groupe('Mes modèles entraînés — Fish lit, ton modèle plaque le timbre')
    for (const m of d.locaux) pose(g, `local:${m.id}`, m.id)
  }

  if (d.bibliotheque?.length) {
    const g = groupe('Bibliothèque publique Fish — les plus employées')
    for (const v of d.bibliotheque) {
      pose(g, `fish:${v.id}`, `${v.nom}${v.usages ? ` — ${(v.usages / 1000).toFixed(0)}k usages` : ''}`)
    }
  }

  if (!sel.childElementCount) {
    pose(groupe('—'), '', 'aucune voix disponible')
    sel.disabled = true
    return
  }
  sel.disabled = false
  dessineLesMarqueurs()
  majLeDevisParle()
}

$('parleVoix').addEventListener('change', majLeDevisParle)

// LES MARQUEURS À UN CLIC, PARCE QUE C'EST LE PREMIER LEVIER.
//
// À réglages égaux, c'est le texte marqué qui rend la lecture la plus vivante —
// devant la seule montée de température. Les laisser à taper de mémoire, c'est
// s'assurer qu'ils ne serviront pas.
// La liste vient du serveur, qui la tient de `lib/fish.mjs`. En attendant sa
// réponse, un repli minimal — sinon la zone serait vide au premier affichage.
let MARQUEURS_FISH = ['(soupir)', '(rires)', '(agacé)', '(surpris)']

function dessineLesMarqueurs() {
  const zone = $('marqueurs')
  const d = appli.voixFish ?? {}
  if (d.marqueurs?.length) MARQUEURS_FISH = d.marqueurs
  const signature = (d.marqueurs ?? MARQUEURS_FISH).join('')
  if (zone.dataset.pour === signature) return
  zone.dataset.pour = signature
  for (const vieux of [...zone.querySelectorAll('.marqueur:not(.diriger), .marqueur-titre')]) {
    vieux.remove()
  }

  const puce = (m, sonore) => {
    const b = creer('button', `marqueur${sonore ? ' sonore' : ''}`)
    b.type = 'button'
    b.textContent = m
    b.title = sonore
      ? `${m} — événement AUDIBLE : elle le joue, ça s'entend. À employer rarement.`
      : `${m} — teinte la suite. Insère à l'endroit du curseur.`
    b.addEventListener('click', () => {
      const t = $('parleTexte')
      const i = t.selectionStart ?? t.value.length
      const avant = t.value.slice(0, i).replace(/\s+$/, '')
      const apres = t.value.slice(t.selectionEnd ?? i)
      t.value = `${avant} ${m}${apres.startsWith(' ') ? '' : ' '}${apres}`
      const pos = avant.length + m.length + 1
      t.focus()
      t.setSelectionRange(pos, pos)
      majLeDevisParle()
    })
    zone.append(b)
  }

  // UN MARQUEUR EST UN ÉVÉNEMENT, PAS UNE COULEUR — ET L'ÉCRAN DOIT LE DIRE.
  //
  // Mesuré : « (sourire dans la voix) » allonge la phrase d'une demi-seconde
  // sans aucun silence en tête. Fish JOUE le marqueur puis récite la suite à
  // plat. Les mélanger dans une même rangée laissait croire à neuf nuances
  // équivalentes, alors que deux d'entre elles font du bruit.
  for (const m of d.tons ?? MARQUEURS_FISH) puce(m, false)
  if (d.sons?.length) {
    const t = creer('span', 'marqueur-titre')
    t.textContent = 'sons audibles :'
    zone.append(t)
    for (const m of d.sons) puce(m, true)
  }
}

/** Le prix AVANT de cliquer — §7, même pour un dixième de centime. */
function majLeDevisParle() {
  const n = $('parleTexte').value.trim().length
  const usd = n * 15 / 1_000_000
  const marques = MARQUEURS_FISH.filter((m) => $('parleTexte').value.includes(m)).length
  const credit = appli.creditFish
  // Un modèle local ajoute une conversion locale APRÈS la lecture : gratuite,
  // mais elle prend une minute et il vaut mieux le savoir avant de cliquer.
  const choix = $('parleVoix').value
  const local = choix.startsWith('local:') ? choix.slice(6) : null
  $('parleDevis').textContent =
    `${n} caractères — environ ${usd.toFixed(4)} $ chez Fish` +
    (credit !== null && credit !== undefined ? ` · crédit ${credit.toFixed(2)} $` : '') +
    (marques ? ` · ${marques} marqueur(s)` : ` · aucun marqueur : la lecture sera régulière`) +
    (local ? ` · puis timbre « ${local} » plaqué en local, gratuit mais plus long` : '')
}

$('parleTexte').addEventListener('input', majLeDevisParle)

$('btnDirige').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Lecture du script…', async () => {
    const texte = $('parleTexte').value.trim()
    if (!texte) return annonce(`Colle d'abord le texte.`, 'erreur')
    try {
      const r = await api(`/api/videos/${encodeURIComponent(appli.slug)}/dirige`, {
        methode: 'POST', corps: { texte },
      })
      const marque = r.resultat?.texte
      if (!marque) return annonce(`La direction n'a rien rendu.`, 'erreur')
      $('parleTexte').value = marque
      majLeDevisParle()
      annonce(
        `${r.resultat.marqueurs} marqueur(s) posé(s) — relis avant de fabriquer.`,
        'ok'
      )
    } catch (e) {
      annonce(e.message, 'erreur')
    }
  })
)

async function lanceLaVoix({ essai }) {
  const texte = $('parleTexte').value.trim()
  if (!texte) return annonce(`Colle le texte à lire.`, 'erreur')
  const choix = $('parleVoix').value
  const corps = {
    texte,
    modele: $('parleModele').value,
    temperature: Number($('parleTemp').value),
    debit: Number($('parleDebit').value),
    essai,
  }
  // « local: » ne remplace pas la voix, il s'ajoute derrière : la lecture reste
  // celle de Fish, avec la voix par défaut de la chaîne.
  if (choix.startsWith('local:')) corps.modeleLocal = choix.slice(6)
  else if (choix.startsWith('fish:')) corps.voix = choix.slice(5)

  // Fabriquer la prise ÉCRASE ce qui suit : la transcription et le montage
  // portent sur l'ancien son. Un essai, lui, n'engage rien.
  if (!essai) {
    const dejaLa = Boolean(appli.etat?.prise?.presente ?? appli.etat?.rush)
    const ok = await demandeConfirmation({
      titre: dejaLa ? `Remplacer la prise ?` : `Fabriquer la prise ?`,
      quoi: dejaLa
        ? `La prise actuelle est effacée, et tout ce qui en découle — transcription, ` +
          `sous-titres, montage — devra être refait.`
        : `${texte.length} caractères lus par Fish, environ ` +
          `${(texte.length * 15 / 1_000_000).toFixed(4)} $.`,
      action: dejaLa ? 'Remplacer' : 'Fabriquer',
    })
    if (!ok) return
    corps.refais = true
  }

  const vue = await mene(() =>
    api(`/api/videos/${encodeURIComponent(appli.slug)}/parle`, { methode: 'POST', corps })
  )
  if (vue?.etat !== 'fini') return

  // LE CHEMIN SE DÉDUIT DE LA CONVENTION, PAS DU JOURNAL.
  //
  // Gratter une ligne de log pour retrouver le fichier casse au premier mot
  // changé dans un message. La commande nomme l'essai d'après ses réglages —
  // pour que deux essais se comparent au lieu de s'écraser — et la prise
  // « voix.wav ». Si cette règle bouge côté commande, elle bouge ici aussi.
  const lecteur = $('lecteurParle')
  const t = String(corps.temperature).replace('.', '')
  const suffixe = corps.modeleLocal ? `-${corps.modeleLocal}` : ''
  const chemin = essai
    ? `videos/${appli.slug}/03-audio/essais/essai-${corps.modele}-t${t}${suffixe}.wav`
    : `videos/${appli.slug}/02-tournage/voix.wav`
  lecteur.src = `${urlMedia(appli.slug, chemin)}?v=${Date.now()}`
  lecteur.hidden = false
  appli.voixFish = undefined
  annonce(essai ? `Essai prêt — écoute avant d'engager.` : `Prise fabriquée et déposée.`, 'ok')
  if (!essai) rafraichitEtat()
}

$('btnParleEssai').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Lecture…', () => lanceLaVoix({ essai: true }))
)
$('btnParle').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Fabrication…', () => lanceLaVoix({ essai: false }))
)

function dessineDestination() {
  const actuelle = appli.etat?.destination ?? destinationRetenue(appli.slug)
  for (const carte of document.querySelectorAll('#cartesDestination .carte')) {
    carte.classList.toggle('retenue', carte.dataset.destination === actuelle)
  }
  const fige = Boolean(appli.etat?.destination)
  $('noteDestination').textContent = fige
    ? `Format figé : ${appli.etat.vertical ? '1080 × 1920' : '1920 × 1080'}. Se change avec /script.`
    : ''
}

for (const carte of document.querySelectorAll('#cartesDestination .carte')) {
  carte.addEventListener('click', () => {
    if (!appli.slug) return annonce(`Crée d'abord une vidéo.`, 'erreur')
    retiensDestination(appli.slug, carte.dataset.destination)
    dessineDestination()
    dessineLeRail()

    // CHOISIR LA DESTINATION EST TOUTE L'ÉTAPE 1 : ON ENCHAÎNE.
    //
    // L'écran ne demandait rien d'autre, et restait pourtant en place après le
    // clic — la marche 1 passait au vert, la 2 continuait de dire « en attente »,
    // et il fallait deviner qu'on avait fini. Le rail reste là pour revenir en
    // arrière quand on veut : avancer n'engage à rien.
    //
    // Sauf si le format est déjà FIGÉ par un rush déposé : on est alors revenu
    // ici pour relire, pas pour choisir, et repartir de force serait un
    // enlèvement.
    //
    // L'enchaînement avait été coupé le temps que le mode de fabrication vive
    // ici : partir à l'étape 2 sans l'avoir montré revenait à décider pour la
    // personne. Le mode est parti à l'étape 6, l'étape 1 ne demande plus rien
    // d'autre, et elle enchaîne de nouveau.
    if (!appli.etat?.destination) avanceApres('destination')
  })
}

// ---------------------------------------------------------------------------
//  Étape 2 — le dépôt de la prise
// ---------------------------------------------------------------------------

function dessineRush() {
  const rush = appli.etat?.etapes?.rush
  const fiche = $('ficheRush')
  // Les deux chemins vers une prise se redessinent avec l'étape : le choix est
  // par vidéo, et il doit survivre à un changement de slug.
  dessineLesMarqueurs()
  dessineLesPrises()
  // Rien à retirer tant que rien n'est déposé : le bouton n'existe alors pas.
  $('btnRetirePrise').hidden = !rush || rush.verdict === 'absent'
  if (!rush || rush.verdict === 'absent') { fiche.hidden = true; return }

  fiche.replaceChildren()
  const titre = creer('p', 'titre-fiche')
  titre.textContent = rush.mode === 'camera'
    ? `Image tournée — gardée telle quelle.`
    : `Voix off — image en plans de coupe.`
  const dl = creer('dl')
  const ligne = (t, v) => {
    if (v === undefined || v === null) return
    const dt = creer('dt'); dt.textContent = t
    const dd = creer('dd'); dd.textContent = v
    dl.append(dt, dd)
  }
  ligne('Durée', rush.dureeS ? `${chrono(rush.dureeS * 1000)} (${rush.dureeS} s)` : null)
  ligne('Format', appli.etat.format)
  fiche.append(titre, dl)

  // CHAQUE PRISE A SA LIGNE, ET SON BOUTON.
  //
  // Elles etaient jointes par des points — « prise-01.mp3 · prise-02.mp3 » — et
  // le seul geste possible etait de TOUT retirer. Or deposer deux fois EMPILE :
  // le montage colle les prises bout a bout, et on se retrouve avec quinze
  // minutes la ou on en voulait cinq. Le doublon se voyait dans la duree, jamais
  // dans une action.
  const prises = (rush.fichiers ?? []).map((f) => String(f).split('/').pop())
  if (prises.length) {
    const liste = creer('div', 'liste-prises')
    for (const f of prises) {
      const l = creer('div', 'prise-ligne')
      const nom = creer('span', 'prise-nom')
      nom.textContent = f
      l.append(nom)
      // Une prise seule ne se retire pas ligne par ligne : « Retirer la prise »
      // en dessous fait deja exactement ca, et deux boutons pour un seul geste
      // font hesiter sur ce qui les distingue.
      if (prises.length > 1) {
        const jette = creer('button', 'bouton minuscule discret')
        jette.type = 'button'
        jette.textContent = 'Retirer'
        jette.title = `Met cette prise de côté. Les autres restent — mais la piste change, donc la voix, le transcript et le montage repartent avec.`
        jette.addEventListener('click', () => retireUnePrise(f, jette))
        l.append(jette)
      }
      liste.append(l)
    }
    if (prises.length > 1) {
      const avis = creer('p', 'note')
      avis.textContent =
        `${prises.length} prises : le montage les colle bout à bout, dans cet ordre. ` +
        `Si tu as déposé deux fois le même fichier, retire les copies ici.`
      fiche.append(avis)
    }
    fiche.append(liste)
  }

  if (rush.divergence) {
    const d = creer('p', 'divergence')
    d.textContent = `${rush.divergence} — on suit le fichier.`
    fiche.append(d)
  }
  fiche.hidden = false
}

const depot = $('depot')
depot.addEventListener('click', () => $('fichierPrise').click())
depot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fichierPrise').click() } })
$('fichierPrise').addEventListener('change', () => {
  const f = $('fichierPrise').files[0]
  if (f) depose(f)
})
for (const ev of ['dragenter', 'dragover']) {
  depot.addEventListener(ev, (e) => { e.preventDefault(); depot.classList.add('survol') })
}
for (const ev of ['dragleave', 'drop']) {
  depot.addEventListener(ev, (e) => { e.preventDefault(); depot.classList.remove('survol') })
}
depot.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0]
  if (f) depose(f)
})

async function depose(fichier) {
  const destination = appli.etat?.destination ?? destinationRetenue(appli.slug)
  const donnees = new FormData()
  donnees.append('fichier', fichier)
  if (destination) donnees.append('destination', destination)
  // LA CASE SE DÉCOCHE APRÈS L'ENVOI, ET LE MESSAGE DIT CE QUI A ÉTÉ FAIT.
  //
  // Elle restait cochée : le rush suivant partait en plan de coupe sans qu'on
  // l'ait demandé, et le message annonçait « Prise déposée » dans les deux cas.
  // Deux occasions de se tromper pour un seul geste.
  const coupe = $('estCoupe').checked
  if (coupe) donnees.append('coupe', 'oui')

  $('estCoupe').checked = false
  $('fichierPrise').value = ''

  // L'ENVOI SE VOIT, ET C'EST `fetch` QUI L'EMPÊCHAIT.
  //
  // Un rush peut peser deux gigaoctets. Il ne se passait rien à l'écran pendant
  // la copie — pas même le message d'attente : `mene` commence par effacer le
  // bandeau, dans le même tour de boucle. Et `fetch` n'expose AUCUNE progression
  // d'envoi ; `XMLHttpRequest` est la seule API qui donne `upload.onprogress`.
  //
  // La barre est peinte en `transform` sur le cadre de dépôt lui-même : aucune
  // mise en page refaite, et elle est là où l'on regarde déjà.
  const vue = await mene(() =>
    envoieAvecProgression(
      `/api/videos/${encodeURIComponent(appli.slug)}/audio`,
      donnees,
      $('depot')
    )
  )
  if (!vue) return
  if (vue.resultat?.divergence) {
    annonce(`Déposé. ${vue.resultat.divergence}`, '')
  } else {
    annonce(coupe ? `Plan de coupe ajouté.` : `Prise déposée.`, 'ok')
  }

  // UN PLAN DE COUPE N'AVANCE PAS, ET C'EST LA SEULE EXCEPTION DE L'ÉTAPE.
  //
  // On en dépose souvent plusieurs à la suite : être expédié à l'étape 3 au
  // premier obligerait à revenir pour chacun des suivants. La prise, elle, est
  // unique — une fois posée, il n'y a plus rien à faire ici.
  if (!coupe) avanceApres('rush')
}

// ---------------------------------------------------------------------------
//  Retirer la prise, pour en déposer une autre
// ---------------------------------------------------------------------------
//
// LE RETRAIT EMPORTE TOUT CE QUI DÉCOULAIT DE LA PRISE.
//
// `voix-finale.wav`, le transcript et le montage ont été fabriqués à partir
// d'elle. Les laisser en place donnerait des sous-titres calés sur une voix
// qu'on n'entend plus — le défaut que CLAUDE.md §9 interdit nommément. La
// commande les met de côté avec elle, horodatés : rien n'est détruit.

/**
 * Retire UNE prise, en gardant les autres.
 *
 * CE QUI DECOULE PART AVEC, ET IL FAUT LE DIRE AVANT. La piste est la
 * concatenation des prises : en enlever une la raccourcit, et tout ce qui etait
 * cale dessus devient faux. Garder le transcript donnerait des sous-titres qui
 * suivent une voix qui n'existe plus — ce que le §9 interdit nommement.
 */
async function retireUnePrise(fichier, bouton) {
  const ok = await demandeConfirmation({
    titre: `Retirer « ${fichier} » ?`,
    quoi:
      `Les autres prises restent. Mais la piste change de longueur, donc la voix ` +
      `générée, le transcript et le montage repartent de côté avec elle — ils ne ` +
      `correspondraient plus. Rien n'est détruit : tout va dans .prises-precedentes/.`,
    action: 'Retirer',
  })
  if (!ok) return
  await pendant(bouton, 'Retrait…', async () => {
    const vue = await mene(() =>
      api(
        `/api/videos/${encodeURIComponent(appli.slug)}/audio?fichier=${encodeURIComponent(fichier)}`,
        { methode: 'DELETE' }
      )
    )
    if (!vue) return
    annonce(`« ${fichier} » est de côté. Il en reste ${(vue.etat?.etapes?.rush?.fichiers ?? []).length}.`, 'ok')
  })
}

$('btnRetirePrise').addEventListener('click', async (e) => {
  // `e.currentTarget` est remis à `null` dès le premier `await` : on le capture
  // avant la boîte de dialogue, pas après.
  const bouton = e.currentTarget
  const rush = appli.etat?.etapes?.rush
  const ok = await demandeConfirmation({
    titre: `Retirer la prise ?`,
    quoi:
      `${(rush?.fichiers ?? []).join(' · ') || 'La prise en place'} part de côté, ` +
      `avec la voix générée, le transcript et le montage qui en venaient — ils ne ` +
      `correspondraient plus. Rien n'est détruit : tout reste dans ` +
      `.prises-precedentes/, et la voix retenue ne bouge pas.`,
    action: 'Retirer',
  })
  if (!ok) return

  await pendant(bouton, 'Retrait…', async () => {
    const vue = await mene(() =>
      api(`/api/videos/${encodeURIComponent(appli.slug)}/audio`, { methode: 'DELETE' })
    )
    if (!vue) return
    const n = vue.resultat?.misDeCote?.length ?? 0
    annonce(n ? `Prise retirée — ${n} élément(s) mis de côté. Dépose la nouvelle.` : `Rien à retirer.`, 'ok')
  })
})

// ---------------------------------------------------------------------------
//  Étape 3 — la voix
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Les voix Fish — celles qui LISENT
// ---------------------------------------------------------------------------
//
// DEUX MOTEURS VIVENT SOUS LE MOT « VOIX », ET ILS NE FONT PAS LE MÊME MÉTIER.
//
// Fish LIT un texte : c'est lui qui parle quand la prise se fabrique au lieu de
// s'enregistrer (§3). ElevenLabs et les modèles entraînés CONVERTISSENT un
// enregistrement : ils plaquent un timbre sur une prise existante.
//
// Cette étape ne montrait que le second, et s'appelait « Voix ». On y cherchait
// donc les voix Fish, qui n'y étaient pas — et le chemin pour en retenir une
// pour la CHAÎNE n'existait nulle part, ni ici ni au terminal. On pouvait en
// choisir une pour UNE génération, jamais durablement.
//
// UNE VOIX NE SE JUGE PAS SUR SON NOM. C'est la règle déjà appliquée au
// catalogue ElevenLabs, et elle vaut ici : « Clémence » ne dit rien de ce qu'on
// va entendre. On écoute une phrase, dite par elle, avant de la retenir.

async function chargeLesVoixFish({ page = 1, ajoute = false } = {}) {
  const liste = $('listeVoixFish')
  const q = new URLSearchParams()
  const cherche = ($('fishRecherche')?.value ?? '').trim()
  if (cherche) q.set('cherche', cherche)
  q.set('langue', $('fishLangue')?.value ?? 'fr')
  if (page > 1) q.set('page', String(page))

  try {
    const r = await api(`/api/voix-fish?${q}`)
    const d = r.resultat ?? {}
    appli.voixFishErreur = null
    appli.voixFishPage = page
    if (ajoute && appli.voixFish) {
      // On EMPILE, on ne remplace pas : « charger 100 de plus » qui repartirait
      // de zero ferait defiler jusqu'en bas pour retrouver ou on en etait.
      const vus = new Set((appli.voixFish.bibliotheque ?? []).map((v) => v.id))
      appli.voixFish.bibliotheque = [
        ...(appli.voixFish.bibliotheque ?? []),
        ...(d.bibliotheque ?? []).filter((v) => !vus.has(v.id)),
      ]
    } else {
      appli.voixFish = d
    }
    appli.voixFishFin = (d.bibliotheque ?? []).length < 100
  } catch (e) {
    // ON NE MET PAS L'ECHEC EN CACHE.
    //
    // Il l'etait : `appli.voixFish = {}`. Le premier affichage disait la vraie
    // cause, tous les suivants lisaient un objet vide et concluaient « aucune
    // voix Fish disponible » — un diagnostic faux, sur une chaine a qui il
    // manquait seulement sa cle. On garde donc le message, et la prochaine
    // ouverture reessaie.
    appli.voixFish = undefined
    appli.voixFishErreur = e.message
  }
  dessineLesVoixFish()
  if (liste && !ajoute) liste.scrollTop = 0
}

function dessineLesVoixFish() {
  const liste = $('listeVoixFish')
  if (!liste) return

  // Premier passage : on va chercher, et on le dit au lieu de laisser un vide.
  if (appli.voixFish === undefined && !appli.voixFishErreur) {
    liste.replaceChildren()
    const p = creer('p', 'vide')
    p.textContent = `Chargement des voix du compte…`
    liste.append(p)
    chargeLesVoixFish()
    // Les mots de la prise arrivent en meme temps que les voix : c'est le meme
    // ecran, et les demander au clic ferait attendre une seconde de plus juste
    // avant de payer une generation.
    reprendsMesMots({ remplace: false })
    return
  }

  const d = appli.voixFish ?? {}
  const retenue = appli.chaine?.voix?.fish_voice_id ?? null
  liste.replaceChildren()

  // « AUCUNE VOIX » ET « AUCUNE CLE » N'APPELLENT PAS LE MEME GESTE.
  //
  // L'ecran disait « Aucune voix Fish disponible » a une chaine qui n'avait
  // simplement pas de `config/keys.json` — recreee sans ses cles. On cherche
  // alors une voix qui manquerait chez Fish, alors qu'il manque une cle chez
  // soi. Le message dit lequel des deux.
  if (appli.voixFishErreur) {
    const p = creer('p', 'vide')
    p.textContent = /cl\u00e9 fish|keys\.json/i.test(appli.voixFishErreur)
      ? `Cette chaîne n'a pas de clé Fish — ce n'est pas la bibliothèque qui est vide.`
      : `Voix Fish injoignables.`
    liste.append(p)
    const detail = creer('p', 'note')
    detail.textContent = appli.voixFishErreur
    liste.append(detail)
    $('btnPlusFish').hidden = true
    return
  }

  const rangees = [
    ...(d.fish ?? []).map((v) => ({ ...v, groupe: 'Mes voix' })),
    ...(d.bibliotheque ?? []).map((v) => ({ ...v, groupe: 'Bibliothèque publique Fish' })),
  ]

  if (!rangees.length) {
    const p = creer('p', 'vide')
    p.textContent = `Aucune voix ne correspond. Élargis la langue, ou vide la recherche.`
    liste.append(p)
    $('btnPlusFish').hidden = true
    return
  }

  let groupeCourant = null
  for (const v of rangees) {
    if (v.groupe !== groupeCourant) {
      groupeCourant = v.groupe
      const t = creer('p', 'groupe-voix')
      t.textContent = v.groupe
      liste.append(t)
    }
    // La meme classe que les voix ElevenLabs : ce sont deux moteurs, mais une
    // seule question — « quelle voix je veux entendre ». Deux dessins de ligne
    // pour la meme question feraient croire a deux natures d'objet.
    const ligne = creer('div', 'voix')
    if (v.id === retenue) ligne.classList.add('retenue')

    const texte = creer('div', 'voix-texte')
    const nom = creer('span', 'voix-nom')
    nom.textContent = v.nom ?? v.id
    const meta = creer('span', 'voix-meta')
    meta.textContent = [
      v.id === retenue ? 'voix de la chaîne' : null,
      v.langues?.length ? v.langues.join(', ') : null,
      v.usages ? `${(v.usages / 1000).toFixed(0)}k usages` : null,
    ].filter(Boolean).join(' · ')
    texte.append(nom, meta)

    const actions = creer('div', 'voix-actions')
    const ecoute = creer('button', 'bouton minuscule')
    ecoute.type = 'button'
    ecoute.textContent = 'Écouter'
    ecoute.addEventListener('click', () => ecouteUneVoixFish(v, ecoute))
    const prend = creer('button', 'bouton minuscule')
    prend.type = 'button'
    prend.textContent = v.id === retenue ? 'Retenue' : 'Choisir'
    prend.disabled = v.id === retenue
    prend.addEventListener('click', () => retiensLaVoixFish(v, prend))
    actions.append(ecoute, prend, etoileFavorite('fish', v))

    ligne.append(texte, actions)
    liste.append(ligne)
  }

  // Le bouton disparait quand la derniere page est incomplete : c'est le seul
  // signal que Fish donne pour dire qu'il n'y a plus rien derriere.
  $('btnPlusFish').hidden = Boolean(appli.voixFishFin)
}

/**
 * Dix secondes, dites par cette voix-la.
 *
 * L'ESSAI A BESOIN D'UNE VIDEO, ET CE N'EST PAS UN CAPRICE : `parle --essai`
 * ecrit dans `videos/<slug>/03-audio/essais/`, ou le fichier se garde et se
 * recompare. Sans video ouverte, on le dit plutot que d'echouer sur un chemin.
 */
async function ecouteUneVoixFish(v, bouton) {
  if (!appli.slug) {
    $('noteFish').textContent = `Ouvre ou crée une vidéo : l'essai s'écrit dans son dossier.`
    return
  }
  const phrase = ($('fishPhrase')?.value ?? '').trim()
  if (!phrase) {
    $('noteFish').textContent = `Donne une phrase à faire lire.`
    return
  }
  await pendant(bouton, '…', async () => {
    try {
      const t = await api(`/api/videos/${encodeURIComponent(appli.slug)}/parle`, {
        methode: 'POST',
        corps: { texte: phrase, voix: v.id, essai: true },
      })
      const vue = await suisLeTravail(t.travail)
      const fichier = vue?.resultat?.fichier
      if (!fichier) {
        $('noteFish').textContent = `L'essai n'a rien rendu — le journal dit pourquoi.`
        return
      }
      $('nomEssaiFish').textContent = `${v.nom ?? v.id} — « ${phrase.slice(0, 80)} »`
      // Deux essais de la meme voix ecrivent le meme fichier : sans la date, on
      // reecoute le precedent en croyant juger le nouveau.
      $('audioFish').src = `${urlMedia(appli.slug, fichier)}?v=${Date.now()}`
      montreLeLecteur('ecouteFish')
      $('audioFish').play().catch(() => { /* la lecture automatique peut etre refusee */ })
      $('noteFish').textContent = ''
    } catch (e) {
      $('noteFish').textContent = e.message
    }
  })
}

/** Retient cette voix pour la CHAINE — pas pour cette video seulement. */
async function retiensLaVoixFish(v, bouton) {
  await pendant(bouton, '…', async () => {
    try {
      await api('/api/chaine/voix/defaut-fish', { methode: 'POST', corps: { voiceId: v.id } })
      // La carte d'identite en memoire porte l'ancienne valeur : sans ca, la
      // ligne resterait marquee « Choisir » alors que le disque dit l'inverse.
      appli.chaine = appli.chaine ?? {}
      appli.chaine.voix = { ...(appli.chaine.voix ?? {}), fish_voice_id: v.id }
      dessineLesVoixFish()
      // Le bloc des favorites marque la voix retenue : sans ça, la même voix
      // s'affichait « Choisir » en haut et « Retenue » en bas.
      dessineLesVoixFavorites()
      annonce(`« ${v.nom ?? v.id} » est la voix Fish de la chaîne.`, 'ok')
    } catch (e) {
      $('noteFish').textContent = e.message
    }
  })
}

/**
 * Remplit la phrase d'essai avec TES mots, ceux de la prise deposee.
 *
 * `remplace` distingue les deux appels : au premier affichage on ne touche au
 * champ que s'il porte encore la phrase de demonstration — ecraser un texte
 * qu'on vient de taper serait insupportable. Sur le bouton, on remplace.
 */
async function reprendsMesMots({ remplace = true } = {}) {
  const champ = $('fishPhrase')
  const note = $('noteMesMots')
  if (!appli.slug) {
    if (remplace) note.textContent = `Ouvre une vidéo : ce sont SES mots qu'on reprend.`
    return
  }
  const secondes = Math.max(2, Number($('essaiSecondes')?.value) || 20)
  try {
    const r = await api(
      `/api/videos/${encodeURIComponent(appli.slug)}/mots-essai?secondes=${secondes}`
    )
    const d = r.resultat ?? {}
    if (!d.texte) {
      note.textContent = remplace
        ? `Rien à reprendre : « ${appli.slug} » n'a ni transcript ni script. Transcris la prise à l'étape 4, ou tape ta phrase.`
        : ''
      return
    }
    if (!remplace && champ.value.trim() && champ.value !== champ.defaultValue) return
    champ.value = d.texte
    // « Repris de le transcript » : on compose une phrase avec un fragment qui
    // porte deja son article. On juxtapose plutot que de bricoler la grammaire.
    const source = d.origine.charAt(0).toUpperCase() + d.origine.slice(1)
    note.textContent = `${source} — ${d.secondes} s de ta prise, mot pour mot. Tu peux le corriger.`
  } catch (e) {
    if (remplace) note.textContent = e.message
  }
}

$('btnMesMots').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, '…', () => reprendsMesMots({ remplace: true }))
)

$('btnChercheFish').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Recherche…', () => chargeLesVoixFish())
)
$('fishLangue').addEventListener('change', () => chargeLesVoixFish())
$('fishRecherche').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); chargeLesVoixFish() }
})
// UN BOUTON QUI NE BOUGE PAS PENDANT DEUX SECONDES EST UN BOUTON CASSE.
//
// Charger la page suivante coute une seconde et demie — Fish met 0,8 s a rendre
// cent voix, et rien ne va plus vite. Ce qui etait insupportable n'etait pas le
// delai, c'etait le SILENCE : le bouton restait intact, cliquable, identique.
// On recliquait, ce qui lancait une deuxieme requete, ce qui allongeait
// l'attente. `pendant` desactive, affiche l'etat, et rend la main a la fin.
$('btnPlusFish').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Chargement…', () =>
    chargeLesVoixFish({ page: (appli.voixFishPage ?? 1) + 1, ajoute: true })
  )
)

function dessineVoix() {
  const choisie = appli.etat?.etapes?.voixChoisie
  const fiche = $('ficheVoix')
  dessineLesVoixFish()
  // Les favorites appartiennent à la CHAÎNE : une seule lecture par ouverture
  // d'atelier suffit, et le reste du temps on redessine ce qu'on a déjà.
  if (appli.favoris === undefined) chargeLesFavorites().catch(() => {})

  // LES CURSEURS REPARTENT DE CE QUI EST DÉJÀ RETENU.
  //
  // Laissés sur leur défaut, ils auraient menti : on serait revenu sur une
  // vidéo réglée à 0,20 en lisant 0,50 à l'écran, et le premier essai lancé
  // l'aurait silencieusement ramenée là.
  const pose = (curseur, sortie, valeur, defaut) => {
    const x = Number.isFinite(Number(valeur)) && valeur !== null ? Number(valeur) : defaut
    $(curseur).value = String(x)
    $(sortie).textContent = x.toFixed(2)
  }
  pose('essaiStabilite', 'valStabilite', choisie?.stabilite, 0.5)
  pose('essaiSimilarite', 'valSimilarite', choisie?.similarite, 0.8)

  if (!choisie || choisie.verdict === 'absent') fiche.hidden = true
  else {
    fiche.replaceChildren()
    const p = creer('p', 'titre-fiche')
    const q = creer('p', 'note')

    // CET ÉCRAN ANNONÇAIT UNE VOIX QUI NE SERA PAS EMPLOYÉE.
    //
    // Il lisait la cascade ElevenLabs et ignorait `voix.mode`. Sur une chaîne
    // réglée en local — le cas de celle-ci — il affichait donc un identifiant
    // ElevenLabs sous le titre « Voix retenue », alors que le montage convertit
    // avec le modèle entraîné. C'est plus grave qu'un écran vide : on croit
    // qu'un service payant est en jeu, et on va chercher pourquoi.
    //
    // Le moteur de la chaîne décide ; l'identifiant ElevenLabs reste affiché,
    // mais pour ce qu'il est — un choix en réserve.
    const moteur = appli.chaine?.voix?.mode ?? 'sts'
    if (moteur === 'local') {
      const modele = appli.chaine?.voix?.modele_local
      const transpose = appli.chaine?.voix?.transpose
      p.textContent = `Voix retenue : modèle local${modele ? ` « ${modele} »` : ''}`
      q.textContent =
        `moteur de la chaîne · gratuit, hors ligne` +
        (transpose ? ` · transposition ${transpose > 0 ? '+' : ''}${transpose}` : '') +
        ` — la voix ElevenLabs ci-dessous (${choisie.nom ?? choisie.voiceId}) ne sert que si tu ` +
        `bascules le moteur à l'étape 4.`
    } else if (moteur === 'brute') {
      p.textContent = `Voix retenue : ta voix telle quelle`
      q.textContent = `moteur de la chaîne · aucune conversion`
    } else {
      p.textContent = `Voix retenue : ${choisie.nom ?? choisie.voiceId}`
      q.textContent = choisie.origine
    }
    fiche.append(p, q)
    // CE QUI EST RETENU N'EST PAS CE QUI A SERVI, ET LES DEUX SE LISENT ICI.
    //
    // « Voix retenue » décrit une intention ; l'audio du dossier, lui, a été
    // fabriqué un jour donné avec un moteur donné. Tant que les deux ne
    // s'affichaient pas côte à côte, on croyait que changer le premier changeait
    // le second — alors qu'il faut refaire la voix à l'étape 4.
    if (appli.etat?.etapes?.audio?.verdict !== 'absent') {
      fiche.append(ligneVoixEmployee(appli.etat?.etapes?.audio?.voix))
    }
    fiche.hidden = false
  }
  if (appli.catalogue) dessineLeCatalogue()
  dessineLesVoixFavorites()
}

// ---------------------------------------------------------------------------
//  Les voix favorites — l'écoute ne se refait pas à chaque vidéo
// ---------------------------------------------------------------------------
//
// LE TRAVAIL QU'ON REFAISAIT.
//
// La bibliothèque ElevenLabs se compte en milliers, celle de Fish en centaines.
// On en écoute vingt, on en trouve trois bonnes, on en retient une — et les
// deux autres sont perdues : rien ne les gardait. La vidéo suivante
// recommençait la même recherche, avec les mêmes filtres tapés de mémoire.
//
// Une favorite ne DÉCIDE rien : ni le défaut de la chaîne, ni la voix d'une
// vidéo. C'est une liste courte de ce qu'on a déjà jugé, posée en tête d'écran.
// Les deux gestes de sélection — « Retenir » et « Choisir » — restent exactement
// où ils étaient, et se retrouvent aussi sur les cartes de la liste favorite :
// une favorite qu'il faudrait aller rechercher plus bas pour l'employer ne
// servirait à rien.

const cleFavori = (moteur, id) => `${moteur}:${id}`

/** Les favorites de la chaîne, indexées, ou une carte vide tant qu'on ne sait pas. */
function indexFavoris() {
  const index = new Map()
  for (const f of appli.favoris ?? []) index.set(cleFavori(f.moteur, f.id), f)
  return index
}

async function chargeLesFavorites({ redessine = true } = {}) {
  try {
    const r = await api('/api/voix/favoris')
    appli.favoris = r.resultat?.favoris ?? []
  } catch {
    // Une chaîne sans `config/chaine.json` n'a pas de favorites, et ce n'est pas
    // une panne : on part sur une liste vide plutôt que d'afficher une erreur
    // au-dessus d'un écran qui marche.
    appli.favoris = []
  }
  if (redessine) dessineLesVoixFavorites()
}

/**
 * L'étoile, la même sur toutes les cartes de voix des deux moteurs.
 *
 * ELLE BASCULE, ET L'ÉCRAN SUIT AVANT LE SERVEUR. Attendre la réponse pour
 * changer l'étoile ferait un aller-retour visible sur un geste qui doit être
 * instantané ; en cas d'échec on la remet et on le dit.
 */
function etoileFavorite(moteur, v) {
  const b = creer('button', 'etoile')
  b.type = 'button'
  const peint = () => {
    const active = indexFavoris().has(cleFavori(moteur, v.id))
    b.classList.toggle('active', active)
    b.textContent = active ? '★' : '☆'
    b.title = active ? 'Retirer des favorites' : 'Garder dans les favorites'
    b.setAttribute('aria-pressed', String(active))
  }
  peint()
  b.addEventListener('click', async (ev) => {
    ev.stopPropagation()
    const cle = cleFavori(moteur, v.id)
    const etait = indexFavoris().has(cle)
    // On peint tout de suite, dans les deux listes.
    appli.favoris = etait
      ? (appli.favoris ?? []).filter((f) => cleFavori(f.moteur, f.id) !== cle)
      : [
          ...(appli.favoris ?? []),
          { moteur, id: v.id, nom: v.nom ?? null, proprietaire: v.proprietaire ?? null, apercu: v.apercu ?? null },
        ]
    peint()
    dessineLesVoixFavorites()
    try {
      await api('/api/voix/favoris', {
        methode: 'POST',
        corps: {
          moteur,
          id: v.id,
          nom: v.nom ?? null,
          proprietaire: v.proprietaire ?? null,
          apercu: moteur === 'elevenlabs' ? v.apercu ?? null : null,
          retire: etait,
        },
      })
    } catch (e) {
      await chargeLesFavorites()
      peint()
      annonce(e.message, 'erreur')
    }
  })
  return b
}

/**
 * Le bloc en tête de l'étape 3.
 *
 * Il porte les mêmes actions que les cartes du dessous, moteur par moteur :
 * une favorite ElevenLabs s'essaie sur la prise et se retient, une favorite
 * Fish s'écoute et se choisit. Rien de nouveau à apprendre — c'est la même
 * carte, dans une liste plus courte.
 */
function dessineLesVoixFavorites() {
  const bloc = $('blocVoixFavorites')
  const liste = $('listeVoixFavorites')
  if (!bloc || !liste) return
  const favorites = appli.favoris ?? []
  // Un cadre vide en tête d'écran occupe la place de ce qu'on est venu faire.
  bloc.hidden = favorites.length === 0
  if (!favorites.length) return

  liste.replaceChildren()
  const retenueEleven = appli.etat?.etapes?.voixChoisie?.voiceId ?? null
  const retenueFish = appli.chaine?.voix?.fish_voice_id ?? null

  for (const f of favorites) {
    const carte = creer('div', 'voix')
    const estRetenue = f.moteur === 'fish' ? f.id === retenueFish : f.id === retenueEleven
    if (estRetenue) carte.classList.add('retenue')

    const texte = creer('div', 'voix-texte')
    const nom = creer('span', 'voix-nom')
    nom.textContent = f.nom ?? f.id
    const meta = creer('span', 'voix-meta')
    meta.textContent = [
      f.moteur === 'fish' ? 'Fish — elle LIT' : 'ElevenLabs — elle CONVERTIT',
      estRetenue ? 'retenue' : null,
      f.note,
    ].filter(Boolean).join(' · ')
    meta.title = f.id
    texte.append(nom, meta)

    const actions = creer('div', 'voix-actions')
    if (f.moteur === 'fish') {
      const ecoute = creer('button', 'bouton minuscule')
      ecoute.type = 'button'
      ecoute.textContent = 'Écouter'
      ecoute.addEventListener('click', () => ecouteUneVoixFish(f, ecoute))
      const prend = creer('button', 'bouton minuscule primaire')
      prend.type = 'button'
      prend.textContent = estRetenue ? 'Retenue' : 'Choisir'
      prend.disabled = estRetenue
      prend.addEventListener('click', () => retiensLaVoixFish(f, prend))
      actions.append(ecoute, prend)
    } else {
      if (f.apercu) {
        const ecoute = creer('button', 'bouton minuscule')
        ecoute.type = 'button'
        ecoute.textContent = '▶ Écouter'
        ecoute.addEventListener('click', () => ecouteLExtrait(f, f.apercu))
        actions.append(ecoute)
      }
      const essai = creer('button', 'bouton minuscule')
      essai.type = 'button'
      essai.textContent = 'Essai sur ma prise'
      essai.addEventListener('click', () => pendant(essai, 'Conversion…', () => lanceUnEssai(f)))
      const retiens = creer('button', 'bouton minuscule primaire')
      retiens.type = 'button'
      retiens.textContent = estRetenue ? 'Retenue' : 'Retenir'
      retiens.disabled = estRetenue
      retiens.addEventListener('click', () => pendant(retiens, 'Ajout…', () => retiensLaVoix(f)))
      actions.append(essai, retiens)
    }
    actions.append(etoileFavorite(f.moteur, f))

    carte.append(texte, actions)
    liste.append(carte)
  }
}

/**
 * DEUX FONDS DE VOIX, ET ILS N'ONT PAS DU TOUT LA MÊME TAILLE.
 *
 * `mes voix` interroge `/v1/voices` : ce que le COMPTE possède, soit les
 * vingt-et-une livrées par ElevenLabs plus les cinq ajoutées. Vingt-six en tout,
 * et la sélection paraît vite étroite quand on cherche un timbre précis.
 *
 * `la bibliothèque` interroge `/v1/shared-voices` : le fonds publié par les
 * autres comptes, des milliers de voix, servi par pages de soixante. Une voix
 * qu'on y retient est d'abord AJOUTÉE au compte — gratuitement, mais
 * obligatoirement : la conversion refuse un identifiant qu'elle ne possède pas.
 */
let pageBibliotheque = 0

async function chargeLeCatalogue({ suite = false } = {}) {
  const partagee = $('ouChercher').value === 'bibliotheque'
  pageBibliotheque = suite && partagee ? pageBibliotheque + 1 : 0

  $('btnCatalogue').disabled = true
  $('btnPageSuivante').disabled = true
  try {
    const p = new URLSearchParams()
    if ($('filtreGenre').value) p.set('genre', $('filtreGenre').value)
    if ($('filtreAge').value) p.set('age', $('filtreAge').value)
    // Le ton et l'usage n'existent que sur la bibliothèque : les voix du compte
    // ne portent pas ces étiquettes, et les envoyer là-bas ne filtrerait rien.
    if (partagee && $('filtreTon').value) p.set('ton', $('filtreTon').value)
    if (partagee && $('filtreUsage').value) p.set('usage', $('filtreUsage').value)
    if ($('filtreLangue').value) p.set('langue', $('filtreLangue').value)
    if ($('filtreNom').value.trim()) p.set('cherche', $('filtreNom').value.trim())
    if (partagee) {
      p.set('bibliotheque', '1')
      p.set('page', String(pageBibliotheque))
      // Le tri ne vaut que sur la bibliothèque : le compte tient en une requête
      // et se range par catégorie, ce qui est plus utile que par popularité.
      if ($('filtreTri').value) p.set('tri', $('filtreTri').value)
    }

    const r = await api(`/api/voix${p.toString() ? '?' + p : ''}`)
    const voix = r.resultat?.voix ?? []
    appli.catalogue = suite && partagee ? [...(appli.catalogue ?? []), ...voix] : voix
    dessineLeCatalogue()

    $('btnPageSuivante').hidden = !(partagee && r.resultat?.encore)
    annonce(
      partagee
        ? `${appli.catalogue.length} voix de la bibliothèque${r.resultat?.encore ? " — il y en a d'autres" : ''}.`
        : `${appli.catalogue.length} voix dans ton compte.`,
      'ok'
    )
    // La liste qui vient de grandir doit rester lisible là où on en était :
    // une page de plus qui ramènerait en haut ferait reperdre le fil.
    if (!suite) $('listeVoix').scrollTop = 0
  } catch (e) {
    annonce(e.message, 'erreur')
  } finally {
    $('btnCatalogue').disabled = false
    $('btnPageSuivante').disabled = false
  }
}

$('btnCatalogue').addEventListener('click', () => chargeLeCatalogue())
$('btnPageSuivante').addEventListener('click', () => chargeLeCatalogue({ suite: true }))

// LES FILTRES N'ÉTAIENT LUS QU'AU CLIC SUR « CHARGER ».
//
// Taper un nom puis Entrée ne faisait rien, et changer le genre non plus : on
// croyait avoir cherché. Partout ailleurs dans l'atelier, Entrée valide.
$('filtreNom').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); chargeLeCatalogue() }
})

// CHANGER UN FILTRE CHERCHE. CHANGER DE FONDS AUSSI.
//
// Basculer sur la bibliothèque vidait la liste et affichait « clique pour
// charger » : on venait de dire ce qu'on voulait, et l'écran répondait en
// redemandant de le confirmer. Chaque fonds coûte un aller-retour à ElevenLabs,
// gratuit, et le geste suivant était de toute façon ce clic.
for (const id of ['ouChercher', 'filtreGenre', 'filtreAge', 'filtreTon', 'filtreUsage', 'filtreLangue', 'filtreTri']) {
  $(id).addEventListener('change', () => {
    if (id === 'ouChercher') montreLesFiltresDuFonds()
    chargeLeCatalogue()
  })
}

/** Le tri ne s'applique qu'à la bibliothèque : ailleurs il ment. */
function montreLesFiltresDuFonds() {
  const partagee = $('ouChercher').value === 'bibliotheque'
  for (const el of document.querySelectorAll('.bib-seul')) el.hidden = !partagee
}
montreLesFiltresDuFonds()

function dessineLeCatalogue() {
  const liste = $('listeVoix')
  liste.replaceChildren()
  const retenue = appli.etat?.etapes?.voixChoisie?.voiceId ?? null

  // PAS ENCORE CHERCHÉ N'EST PAS PAREIL QUE RIEN TROUVÉ.
  //
  // Un seul message couvrait les deux : à l'ouverture de l'étape, l'écran
  // annonçait « aucune voix ne correspond à ces filtres » avant qu'aucun filtre
  // n'ait servi — ce qui se lit comme une panne.
  if (!appli.catalogue) {
    const p = creer('p', 'vide')
    // Le message nommait « Charger », un bouton qui n'a jamais porté ce nom.
    // On lit donc l'étiquette réelle plutôt que de la recopier à la main : elle
    // ne pourra plus diverger.
    p.textContent = `Clique « ${$('btnCatalogue').textContent.trim()} ».`
    liste.append(p)
    return
  }
  if (!appli.catalogue.length) {
    const p = creer('p', 'vide')
    p.textContent =
      $('ouChercher').value === 'bibliotheque'
        ? `Rien pour ces filtres. Élargis l'âge, le genre ou la langue.`
        : `Rien dans tes voix. Passe sur la bibliothèque ElevenLabs : elle en a des milliers.`
    liste.append(p)
    return
  }

  for (const v of appli.catalogue) {
    const carte = creer('div', 'voix')
    if (v.id === retenue) carte.classList.add('retenue')

    const gauche = creer('div')
    const nom = creer('p', 'voix-nom')
    nom.textContent = v.nom ?? v.id
    const meta = creer('p', 'voix-meta')
    meta.textContent = [
      GENRES[v.genre] ?? v.genre,
      AGES[v.age] ?? v.age,
      TONS[v.descriptif] ?? v.descriptif,
      v.langue,
      v.accent,
      v.usage ? String(v.usage).replace(/_/g, ' ') : null,
      // Le nombre de comptes qui l'ont reprise est le seul indice de qualité que
      // l'API donne : une voix reprise sept cents fois a été jugée avant nous.
      v.reprises ? `reprise ${v.reprises} fois` : null,
      v.categorie === 'partagee' ? (v.aMoi ? 'déjà à toi' : 'bibliothèque') : CATEGORIES[v.categorie] ?? v.categorie,
    ].filter(Boolean).join(' · ')
    gauche.append(nom, meta)

    // LA DESCRIPTION EST UN PARAGRAPHE, PAS UNE ÉTIQUETTE.
    //
    // Les voix du compte n'en ont pas ; celles de la bibliothèque en ont une
    // rédigée par leur auteur, souvent dix lignes avec ses cas d'usage et ses
    // mots-clés. Concaténée aux faits structurés, elle faisait une fiche haute
    // d'un écran par voix : cent voix devenaient illisibles. Elle descend donc
    // sur sa propre ligne, bornée à deux, et le survol donne le texte entier.
    if (v.description) {
      const desc = creer('p', 'voix-desc')
      desc.textContent = String(v.description).replace(/\s+/g, ' ').trim()
      desc.title = desc.textContent
      gauche.append(desc)
    }

    const actions = creer('div', 'voix-actions')

    // L'EXTRAIT S'ÉCOUTE ICI, IL NE S'OUVRE PLUS AILLEURS.
    //
    // C'était un lien vers ElevenLabs, ouvert dans un onglet : le navigateur le
    // TÉLÉCHARGEAIT, ce qui obligeait à sortir du logiciel pour comparer deux
    // timbres, et laissait un fichier de plus dans les téléchargements à chaque
    // essai. Le serveur relaie maintenant l'extrait sous sa propre adresse
    // (`/api/voix/extrait`), ce qui satisfait `media-src 'self'` sans avoir à
    // toucher à la politique de sécurité.
    //
    // L'adresse est quand même vérifiée avant d'être posée : elle vient d'un
    // tiers, et le serveur la revalide de son côté contre une liste blanche.
    let adresseApercu = null
    try {
      const u = new URL(v.apercu)
      if (u.protocol === 'https:') adresseApercu = u.href
    } catch { /* adresse illisible : on n'affiche simplement pas le bouton */ }

    if (adresseApercu) {
      const b = creer('button', 'bouton minuscule')
      b.type = 'button'
      b.textContent = '▶ Écouter'
      b.addEventListener('click', () => ecouteLExtrait(v, adresseApercu))
      actions.append(b)
    }

    const essai = creer('button', 'bouton minuscule')
    essai.type = 'button'
    essai.textContent = 'Essai sur ma prise'
    essai.addEventListener('click', () => pendant(essai, 'Conversion…', () => lanceUnEssai(v)))
    actions.append(essai)

    const retiens = creer('button', 'bouton minuscule primaire')
    retiens.type = 'button'
    retiens.textContent = v.id === retenue ? 'Retenue' : 'Retenir'
    retiens.disabled = v.id === retenue
    retiens.addEventListener('click', () => pendant(retiens, 'Ajout…', () => retiensLaVoix(v)))
    actions.append(retiens)

    // L'étoile part avec l'adresse de l'extrait : sans elle, une favorite ne
    // pourrait plus se réécouter sans refaire la recherche qui l'a trouvée.
    actions.append(etoileFavorite('elevenlabs', { ...v, apercu: adresseApercu }))

    carte.append(gauche, actions)
    liste.append(carte)
  }
}

/**
 * Joue l'extrait de catalogue d'une voix, dans la page.
 *
 * UN SEUL LECTEUR POUR TOUTE LA LISTE, ET C'EST VOULU.
 *
 * Un lecteur par carte donnerait cent lecteurs sur une page, dont plusieurs
 * pourraient jouer en même temps — on comparerait alors deux timbres
 * superposés, ce qui ne compare rien. Le lecteur unique interrompt le
 * précédent par construction.
 */
function ecouteLExtrait(v, adresse) {
  const audio = $('audioExtrait')
  // L'essai sur la vraie prise et l'extrait de catalogue ne doivent pas se
  // parler dessus : celui qui commence arrête l'autre.
  $('audioEssai').pause()
  $('nomExtrait').textContent = `${v.nom ?? v.id} — extrait du catalogue`
  $('ecouteExtrait').hidden = false
  audio.src = `/api/voix/extrait?url=${encodeURIComponent(adresse)}`
  audio.play().catch(() => { /* la lecture automatique peut être refusée */ })
}

/** Les deux curseurs, tels qu'ils sont posés à l'instant. */
const reglagesEssai = () => ({
  stabilite: Number($('essaiStabilite').value),
  similarite: Number($('essaiSimilarite').value),
})

for (const [curseur, sortie] of [['essaiStabilite', 'valStabilite'], ['essaiSimilarite', 'valSimilarite']]) {
  // La valeur suit le curseur en direct : un réglage qu'on compare à l'oreille
  // se change vingt fois, et un chiffre qui ne bouge qu'au relâchement ne dit
  // pas où l'on en est pendant qu'on cherche.
  $(curseur).addEventListener('input', () => {
    $(sortie).textContent = Number($(curseur).value).toFixed(2)
  })
}

async function lanceUnEssai(v) {
  const secondes = Number($('essaiSecondes').value) || 5
  const depuis = Number($('essaiDepuis').value) || 0
  const vue = await mene(
    () => apiPayante(`/api/videos/${encodeURIComponent(appli.slug)}/voix/essai`,
      // `proprietaire` n'accompagne que les voix de la bibliothèque : la
      // commande les emprunte au compte le temps de l'essai, puis les rend.
      // Sans lui, ElevenLabs refuse un identifiant que le compte ne possède pas.
      {
        voiceId: v.id, secondes, depuis,
        proprietaire: v.proprietaire ?? null, nom: v.nom ?? null,
        ...reglagesEssai(),
      }),
    { refus: `Essai annulé — rien n'a été facturé.` }
  )
  const fichier = vue?.resultat?.fichier
  if (!fichier) return
  $('audioExtrait').pause()
  // Deux essais du même réglage écrivent le même fichier : sans la date, on
  // réécoute le précédent en croyant juger le nouveau.
  $('audioEssai').src = `${urlMedia(appli.slug, fichier)}?v=${Date.now()}`
  montreLeLecteur('ecouteEssai')
  $('audioEssai').play().catch(() => { /* la lecture automatique peut être refusée */ })
  const r = reglagesEssai()
  annonce(`Essai prêt : ${v.nom ?? v.id} — stabilité ${r.stabilite.toFixed(2)}.`, 'ok')
}

async function retiensLaVoix(v) {
  const fait = await mene(() =>
    api(`/api/videos/${encodeURIComponent(appli.slug)}/voix`, {
      methode: 'POST',
      // `proprietaire` déclenche l'ajout au compte : sans lui, une voix de la
      // bibliothèque serait enregistrée puis refusée à la conversion.
      // Les curseurs partent avec la voix : c'est ce qui fait que le montage
      // emploiera exactement ce qu'on vient d'écouter.
      corps: {
        voiceId: v.id, proprietaire: v.proprietaire ?? null, nom: v.nom ?? null,
        ...reglagesEssai(),
      },
    })
  )
  if (!fait) return
  if ($('voixParDefaut').checked) {
    await mene(() => api('/api/voix/defaut', { methode: 'POST', corps: { voiceId: v.id } }))
    annonce(`${v.nom ?? v.id} retenue — et défaut de la chaîne.`, 'ok')
  } else {
    annonce(`${v.nom ?? v.id} retenue pour cette vidéo.`, 'ok')
  }
  avanceApres('voixChoisie')
}

// ---------------------------------------------------------------------------
//  Étape 3 bis — les empreintes, une voix récoltée au lieu d'une voix louée
// ---------------------------------------------------------------------------
//
// TOUT CE QUI PRÉCÈDE INTERROGE UN CATALOGUE. CE QUI SUIT FABRIQUE DE LA MATIÈRE.
//
// Les filtres du dessus cherchent parmi des voix qui existent déjà chez
// ElevenLabs, et chaque conversion se paie. Une empreinte est l'inverse : on
// part d'une vidéo, `npm run empreinte` en découpe les passages où la voix est
// seule, et le résultat est un dossier de fichiers sur ce disque.
//
// Aucune logique de récolte ne vit ici — pas un seuil, pas une mesure. L'écran
// lance la commande, montre son journal, et liste ce qu'elle a écrit. C'est la
// première contrainte du §2 de CLAUDE.md, et c'est ce qui permet de récolter
// depuis un terminal sur un poste sans interface.

async function chargeLesEmpreintes() {
  try {
    const r = await api('/api/empreintes')
    appli.empreintes = r.resultat?.empreintes ?? []
  } catch {
    // Une empreinte absente n'empêche pas de choisir une voix ElevenLabs :
    // l'échec se range dans la liste, il ne prend pas le bandeau.
    appli.empreintes = []
  }
  dessineLesEmpreintes()
}

/**
 * La durée telle qu'on la dit : « 45 s », « 9 min 12 s », « 1 h 04 min ».
 *
 * `chrono` rendait « 9:12 », qui est une durée de piste, pas une quantité de
 * matière. Or c'est bien une quantité qu'on lit ici, et qu'on la compare à un
 * seuil de quinze minutes : « 9 min 12 s » se compare à l'œil, « 9:12 » demande
 * une traduction silencieuse à chaque lecture.
 */
function dureeLongue(secondes) {
  const s = Math.max(0, Math.round(secondes))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${m} min`
  return m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${Math.floor(m / 60)} h`
}

// Les deux seuils du §8 de CLAUDE.md, en secondes. Ils ne se décident pas ici :
// on les affiche, la commande les applique.
const ASSEZ_ZEROSHOT = 15
const ASSEZ_ENTRAINEMENT = 900

/** Ce que la durée récoltée permet, en une phrase. */
function verdictDeDuree(total) {
  if (total >= ASSEZ_ENTRAINEMENT) return `de quoi entraîner`
  if (total >= ASSEZ_ZEROSHOT) return `il manque ${dureeLongue(ASSEZ_ENTRAINEMENT - total)} pour entraîner`
  return `trop court — il en faut ${ASSEZ_ZEROSHOT} s au minimum`
}

function dessineLesEmpreintes() {
  const zone = $('listeEmpreintes')
  zone.replaceChildren()
  const tout = appli.empreintes ?? []
  remplitLeRangement()

  if (!tout.length) {
    const vide = creer('p', 'vide')
    vide.textContent = `Aucune voix récoltée. Colle des adresses ou dépose des fichiers.`
    zone.append(vide)
    return
  }

  for (const e of tout) {
    const total = e.totalS ?? 0
    const modele = modeleDe(e.id)
    const carte = creer('div', 'empreinte')

    // --- la tête : le nom, ce qu'il porte, et les gestes ---------------------
    const tete = creer('div', 'empreinte-tete')
    const titre = creer('div', 'empreinte-nom')
    titre.textContent = e.id

    // LE MODÈLE PASSE AVANT LA DURÉE, PARCE QU'IL LA REND CADUQUE.
    //
    // Tant qu'il n'y a pas de modèle, la durée est LA question : en a-t-on
    // assez pour entraîner ? Une fois le modèle là, elle devient une note de
    // bas de page, et ce qu'on veut lire c'est sur quoi il a été entraîné.
    if (modele) {
      const badge = creer('span', 'empreinte-badge')
      badge.textContent = `modèle · ${modele.epoques} époques`
      titre.append(' ', badge)
    }
    // Plusieurs modèles entraînés, un seul servi quand on ne précise rien : le
    // dire ici évite d'aller ouvrir `config/chaine.json` pour savoir lequel.
    if (modele && appli.chaine?.voix?.modele_local === e.id) {
      const defaut = creer('span', 'empreinte-badge doux')
      defaut.textContent = `défaut de la chaîne`
      titre.append(' ', defaut)
    }
    tete.append(titre)

    const actions = creer('div', 'empreinte-actions')

    const ecouter = creer('button', 'bouton minuscule')
    ecouter.type = 'button'
    ecouter.textContent = 'Écouter'
    ecouter.addEventListener('click', () => ecouteUneEmpreinte(e))
    actions.append(ecouter)

    // Le bouton n'apparaît qu'à partir du plancher de la commande. En dessous,
    // il ne mènerait qu'à un refus : le proposer serait un piège.
    if (total >= 120) {
      const entrainer = creer('button', 'bouton minuscule')
      entrainer.type = 'button'
      entrainer.textContent = modele ? 'Réentraîner' : 'Entraîner'
      entrainer.addEventListener('click', (ev) =>
        pendant(ev.currentTarget, 'Entraînement…', () => entraineUneEmpreinte(e))
      )
      actions.append(entrainer)
    }

    if (modele) {
      const oter = creer('button', 'bouton minuscule discret')
      oter.type = 'button'
      oter.textContent = 'Ôter le modèle'
      oter.addEventListener('click', () => retireUnModele(e))
      actions.append(oter)
    }

    const retirer = creer('button', 'bouton minuscule discret')
    retirer.type = 'button'
    retirer.textContent = 'Retirer'
    retirer.addEventListener('click', () => retireUneEmpreinte(e))
    actions.append(retirer)

    tete.append(actions)
    carte.append(tete)

    // --- OÙ C'EST SUR LE DISQUE ---------------------------------------------
    //
    // Une voix EST un dossier, comme une chaîne. Le montrer transforme une
    // liste d'écran en quelque chose qu'on retrouve au terminal, qu'on
    // sauvegarde, et qu'on copie d'un poste à l'autre.
    const chemin = creer('div', 'empreinte-chemin')
    chemin.textContent = `marque/voix/${e.id}/`
    carte.append(chemin)

    // --- LA JAUGE : OÙ ON EN EST, ET CE QU'IL MANQUE -------------------------
    //
    // « 9 min 12 s » ne dit rien à qui ne connaît pas les deux seuils : quinze
    // secondes suffisent au zero-shot, un entraînement en réclame soixante fois
    // plus. La barre montre la distance qui reste, le texte la nomme.
    const part = Math.min(1, total / ASSEZ_ENTRAINEMENT)
    const jauge = creer('div', 'jauge')
    if (total >= ASSEZ_ENTRAINEMENT) jauge.classList.add('pleine')
    const barre = creer('span')
    barre.style.width = `${(part * 100).toFixed(1)}%`
    jauge.append(barre)
    carte.append(jauge)

    const chiffres = creer('div', 'empreinte-chiffres')
    const gros = creer('b')
    gros.textContent = dureeLongue(total)
    chiffres.append(gros, ` de voix seule sur les 15 min visées — ${verdictDeDuree(total)}`)
    carte.append(chiffres)

    const meta = creer('div', 'empreinte-note')
    const telecharge = (e.sources ?? []).reduce((t, s) => t + (s.secondes ?? 0), 0)
    meta.textContent =
      `${e.extraits?.length ?? 0} extraits · seuil ${e.marge ?? 20} dB · ` +
      `${dureeLongue(telecharge)} écoutées pour ${dureeLongue(total)} retenues`
    carte.append(meta)

    // --- LES FICHIERS, UN PAR UN --------------------------------------------
    //
    // Le compte « 8 source(s) » ne disait pas LESQUELLES, et c'est pourtant ce
    // qui permet de décider quoi récolter ensuite : une source qui rend 99 % de
    // sa durée et une qui en rend 9 % ne se ressemblent pas, et la seconde dit
    // « ne cherche plus de vidéos comme celle-là ».
    if (e.sources?.length) {
      const repli = creer('details', 'empreinte-sources')
      const somm = creer('summary')
      somm.textContent = `Les ${e.sources.length} fichiers récoltés`
      repli.append(somm)

      for (const [i, s] of e.sources.entries()) {
        const rendu = s.secondes ? (s.retenuS ?? 0) / s.secondes : 0
        const ligne = creer('div', 'source-ligne')
        if (rendu < 0.25) ligne.classList.add('faible')

        // ÉCOUTER UNE SOURCE, C'EST ÉCOUTER SES EXTRAITS À LA SUITE.
        //
        // Les mesures disent si la voix est seule et si le spectre siffle. Elles
        // ne disent pas si le locuteur postillonne, si la pièce résonne, ni si
        // c'est bien la bonne personne qui parle — et c'est ce qu'on veut savoir
        // avant de laisser une source entrer dans un timbre.
        const extraits = (e.extraits ?? [])
          .filter((x) => x.source === s.url)
          .map((x) => `/empreinte/${encodeURIComponent(e.id)}/${x.fichier.split('/').map(encodeURIComponent).join('/')}`)

        const jouer = creer('button', 'bouton minuscule discret source-jouer')
        jouer.type = 'button'
        jouer.textContent = '▶'
        jouer.title = `Écouter les ${extraits.length} extraits de cette source, à la suite`
        jouer.disabled = !extraits.length
        jouer.addEventListener('click', () => enchaineLesExtraits(e, s, extraits))

        const nom = creer('span', 'source-titre')
        nom.textContent = `${i + 1}. ${s.titre ?? '(sans titre)'}`
        nom.title = s.plateforme === 'fichier' ? `fichier déposé` : String(s.url ?? '')

        const compte = creer('span', 'source-chiffres')
        compte.textContent =
          `${dureeLongue(s.secondes ?? 0)} → ${dureeLongue(s.retenuS ?? 0)} ` +
          `(${Math.round(rendu * 100)} %)`

        // L'ÉCART DES EXTRAITS, PAS CELUI DU FICHIER.
        //
        // `reperes.ecartMedian` porte sur tout le téléchargement, morceaux jetés
        // compris. Une vidéo sur musique avec trente secondes de voix nue y
        // affiche un mauvais chiffre alors que ce qu'on garde est impeccable —
        // et une vidéo globalement propre peut avoir laissé passer ses seuls
        // passages douteux. On a lu cette colonne comme un verdict sur le
        // corpus, et elle contredisait l'oreille : elle ne parlait pas de la
        // même chose. Ce qui entre dans le timbre, ce sont les extraits.
        const notes = (e.extraits ?? [])
          .filter((x) => x.source === s.url)
          .map((x) => x.note)
          .sort((a, b) => a - b)
        const ecartExtraits = notes.length ? notes[Math.floor(notes.length / 2)] : null

        const ecart = creer('span', 'source-ecart')
        ecart.textContent = `${ecartExtraits ?? '?'} dB`
        ecart.title =
          `Écart médian des extraits gardés, entre la voix et ce qu'il y a ` +
          `derrière. C'est ce qui entrera dans le timbre. ` +
          `(Sur tout le fichier téléchargé : ${s.reperes?.ecartMedian ?? '?'} dB.)`

        ligne.append(jouer, nom, compte, ecart)

        // LE SIFFLEMENT SE DIT SUR LA LIGNE DE SA SOURCE, PAS AILLEURS.
        //
        // Une raie tonale dans l'audio d'origine s'apprend comme une partie du
        // timbre et ressort sur chaque conversion. Elle ne s'entend pas dans la
        // vidéo d'où elle vient : sans cette ligne, on ne la découvre que dans
        // le modèle fini, deux heures et demie plus tard.
        if (s.raie && s.raie.ecartDb >= 10) {
          ligne.classList.add('faible')
          const raie = creer('span', 'source-raie')
          raie.textContent = `⚠ ${s.raie.hz} Hz +${s.raie.ecartDb} dB`
          raie.title =
            `Sifflement fixe dans cette source. Le modèle l'apprendra comme une ` +
            `partie du timbre. Retire-la avant d'entraîner.`
          ligne.append(raie)
        }

        // On ne propose pas de retirer la dernière : l'empreinte se retire alors
        // en entier, et la commande refuserait de laisser un dossier vide.
        if (e.sources.length > 1) {
          const oter = creer('button', 'bouton minuscule discret source-oter')
          oter.type = 'button'
          oter.textContent = '✕'
          oter.title = `Retirer cette source et ses ${extraits.length} extraits`
          oter.addEventListener('click', () => retireUneSourceDeLEmpreinte(e, s))
          ligne.append(oter)
        }
        repli.append(ligne)
      }
      carte.append(repli)
    }

    zone.append(carte)
  }
}

// ---------------------------------------------------------------------------
//  Où va la récolte : une voix existante, ou une nouvelle
// ---------------------------------------------------------------------------
//
// LE CHAMP LIBRE FABRIQUAIT DES DOSSIERS SANS QU'ON LE VEUILLE.
//
// Laissé vide, il ne rangeait pas « quelque part par défaut » : la commande
// nomme alors l'empreinte d'après le titre de la source, donc huit fichiers du
// même locuteur pouvaient donner huit dossiers de deux minutes — dont aucun
// n'atteint le plancher d'entraînement, sans que rien ne l'annonce. Le choix
// est maintenant une liste de ce qui existe, et créer est un acte explicite.

const NOUVELLE_VOIX = '__nouvelle'

function remplitLeRangement() {
  const sel = $('empreinteCible')
  const avant = sel.value
  const tout = appli.empreintes ?? []
  sel.replaceChildren()

  for (const e of tout) {
    const o = creer('option')
    o.value = e.id
    o.textContent = `${e.id} — ${dureeLongue(e.totalS ?? 0)}`
    sel.append(o)
  }
  const neuve = creer('option')
  neuve.value = NOUVELLE_VOIX
  neuve.textContent = tout.length ? `＋ une autre voix…` : `＋ une voix`
  sel.append(neuve)

  // On garde le choix précédent tant qu'il existe encore. Sinon la voix la plus
  // récemment récoltée : c'est celle qu'on est en train de compléter.
  sel.value = tout.some((e) => e.id === avant) ? avant : (tout[0]?.id ?? NOUVELLE_VOIX)
  montreLeChampDuNom()
}

function montreLeChampDuNom() {
  $('labelNomEmpreinte').hidden = $('empreinteCible').value !== NOUVELLE_VOIX
}

$('empreinteCible').addEventListener('change', montreLeChampDuNom)

/** Le dossier où ranger ce qu'on récolte : une voix existante, ou celle qu'on nomme. */
function nomDeRangement() {
  const cible = $('empreinteCible').value
  return cible === NOUVELLE_VOIX ? $('empreinteNom').value.trim() : cible
}

/** Après une récolte, on se place sur la voix qu'elle vient de nourrir. */
function viseLaVoix(id) {
  if (!id) return
  const sel = $('empreinteCible')
  if ([...sel.options].some((o) => o.value === id)) {
    sel.value = id
    $('empreinteNom').value = ''
    montreLeChampDuNom()
  }
}

function ecouteUneEmpreinte(e) {
  arreteLEnchainement()
  $('nomEmpreinte').textContent = `${e.id} — ${chrono((e.referenceS ?? 0) * 1000)} des meilleurs extraits`
  const audio = $('audioEmpreinte')
  // La référence est REFAITE quand on retire une source : c'est même la raison
  // pour laquelle on vient l'écouter. Sans la date, on entendait la référence
  // d'avant le retrait, donc la source qu'on venait d'écarter.
  audio.src = `/empreinte/${encodeURIComponent(e.id)}/reference.wav?v=${Date.now()}`
  $('ecouteEmpreinte').hidden = false
  audio.play().catch(() => {})
}

// ---------------------------------------------------------------------------
//  Écouter une source, extrait par extrait
// ---------------------------------------------------------------------------
//
// `reference.wav` est un montage des MEILLEURS extraits, tous confondus : c'est
// ce qu'on donne à un moteur, et c'est exactement ce qu'il ne faut pas écouter
// pour juger UNE source. Une source sifflante y est noyée sous dix autres.
//
// On enchaîne donc ses extraits à elle, dans l'ordre, dans le même lecteur. Pas
// de montage à fabriquer, pas de fichier de plus sur le disque : on change la
// source du lecteur à la fin de chaque piste.

let enchainement = null

function arreteLEnchainement() {
  if (!enchainement) return
  const audio = $('audioEmpreinte')
  audio.removeEventListener('ended', enchainement.suite)
  enchainement = null
}

function enchaineLesExtraits(empreinte, source, urls) {
  arreteLEnchainement()
  if (!urls.length) return

  const audio = $('audioEmpreinte')
  let rang = 0

  const annonceLeRang = () => {
    $('nomEmpreinte').textContent =
      `${empreinte.id} · ${String(source.titre ?? '').slice(0, 46)} — ` +
      `extrait ${rang + 1} sur ${urls.length}`
  }
  const suite = () => {
    rang += 1
    if (rang >= urls.length) { arreteLEnchainement(); return }
    annonceLeRang()
    audio.src = urls[rang]
    audio.play().catch(() => {})
  }

  enchainement = { suite }
  audio.addEventListener('ended', suite)
  annonceLeRang()
  audio.src = urls[0]
  $('ecouteEmpreinte').hidden = false
  audio.play().catch(() => {})
}

/**
 * Retire UNE source d'une empreinte, et les extraits qui en viennent.
 *
 * On confirme, comme pour un rush : la récolte se refait, mais elle coûte un
 * téléchargement et plusieurs minutes de séparation — et sur un fichier déposé,
 * l'original n'est plus là du tout.
 */
async function retireUneSourceDeLEmpreinte(empreinte, source) {
  const combien = (empreinte.extraits ?? []).filter((x) => x.source === source.url).length
  const ok = await demandeConfirmation({
    titre: `Retirer cette source de « ${empreinte.id} » ?`,
    quoi:
      `${String(source.titre ?? '').slice(0, 60)}\n\n` +
      `${combien} extrait(s) et ${dureeLongue(source.retenuS ?? 0)} de voix partiront avec elle. ` +
      `Il restera ${dureeLongue((empreinte.totalS ?? 0) - (source.retenuS ?? 0))}. ` +
      `La référence se refait aussitôt.`,
    action: 'Retirer',
  })
  if (!ok) return

  arreteLEnchainement()
  $('ecouteEmpreinte').hidden = true

  // AUCUN AUTRE RETRAIT PENDANT CELUI-CI.
  //
  // Une suppression prend une à trois secondes — la commande recoupe les
  // totaux et refait la référence. Pendant ce temps, la liste affichée décrit un
  // corpus qui n'existe déjà plus. Cliquer une seconde croix sur cette liste-là,
  // c'est agir sur une photo périmée. On les éteint toutes, et la liste se
  // redessine avant qu'on puisse recommencer.
  const croix = [...document.querySelectorAll('.source-oter')]
  for (const c of croix) c.disabled = true
  try {
    await mene(() =>
      api(`/api/empreintes/${encodeURIComponent(empreinte.id)}/sources`, {
        methode: 'DELETE',
        corps: { titre: source.titre },
      })
    )
  } finally {
    await chargeLesEmpreintes()
  }
}

async function retireUneEmpreinte(e) {
  // Une récolte se refait, mais elle coûte un téléchargement et plusieurs
  // minutes de séparation : on demande, comme pour un rush.
  const ok = await demandeConfirmation({
    titre: `Retirer l'empreinte « ${e.id} » ?`,
    quoi:
      `Ses ${e.extraits?.length ?? 0} extraits et sa référence partent du disque. ` +
      `Il faudra retélécharger les ${e.sources?.length ?? 0} source(s) pour les refaire.`,
    action: 'Retirer',
  })
  if (!ok) return
  await mene(() => api(`/api/empreintes/${encodeURIComponent(e.id)}`, { methode: 'DELETE' }))
  $('ecouteEmpreinte').hidden = true
  await chargeLesEmpreintes()
  annonce(`« ${e.id} » retirée.`, 'ok')
}

async function recolteUneEmpreinte() {
  const champ = $('empreinteUrl')
  const urls = champ.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!urls.length) { annonce(`Colle d'abord au moins une adresse.`, 'erreur'); return }

  try {
    annonce('')
    const reponse = await api('/api/empreintes', {
      methode: 'POST',
      corps: {
        urls,
        nom: nomDeRangement(),
        marge: Number($('empreinteMarge').value),
      },
    })
    // Téléchargement puis séparation : de trente secondes à plusieurs minutes.
    // Le journal en direct dit où ça en est — sans lui, on regarde un bouton
    // grisé sans savoir si ça travaille ou si c'est bloqué.
    const vue = reponse.travail?.etat === 'encours'
      ? await suisLeTravail(reponse.travail)
      : reponse.travail
    if (vue?.etat === 'echec') { annonce(derniereErreur(vue), 'erreur'); return }

    champ.value = ''
    const m = vue?.resultat?.empreinte
    await chargeLesEmpreintes()

    // UNE RÉCOLTE VIDE N'EST PAS UN ÉCHEC, ET NE DOIT PAS SE LIRE COMME UN.
    //
    // La commande sort en succès quand elle n'a rien retenu — c'est le bon
    // comportement : elle a fait son travail, la vidéo n'avait simplement pas
    // de passage sans musique. Sans ce message, l'écran afficherait « terminé »
    // devant une liste inchangée.
    if (!m) {
      // ON N'INVENTE PLUS LA CAUSE.
      //
      // Ce message affirmait « la voix n'est jamais seule dans cette vidéo » —
      // un verdict de mesure — devant un journal qui disait « HTTP Error 403 :
      // téléchargement impossible ». Aucun réglage d'exigence n'a jamais réglé
      // un 403, et on a cherché du côté du seuil pendant que le vrai problème
      // était un yt-dlp périmé. La commande sort maintenant en échec avec la
      // raison de chaque source ; ce cas-ci ne devrait plus se produire, et s'il
      // se produit il ne prétend rien.
      annonce(`Rien de retenu. Regarde le journal : il dit ce qui a échoué.`, 'erreur')
      return
    }
    // On reste sur la voix qu'on vient de nourrir : la récolte suivante ira
    // dans le même dossier sans qu'on ait à le rechoisir — c'est ce qui fait la
    // différence entre huit dossiers de deux minutes et une voix entraînable.
    viseLaVoix(m.id)
    annonce(
      `« ${m.id} » — ${dureeLongue(m.totalS ?? 0)} de voix seule sur ` +
        `${m.sources?.length ?? 0} source(s).`,
      'ok'
    )
  } catch (e) {
    annonce(e.message, 'erreur')
  }
}

$('btnRecolte').addEventListener('click', (e) =>
  pendant(e.currentTarget, 'Récolte…', recolteUneEmpreinte)
)

// --- déposer des fichiers plutôt que des adresses --------------------------
//
// UN ENVOI PAR FICHIER, ET C'EST SANS CONSÉQUENCE.
//
// Le lecteur multipart du serveur refuse plus d'un fichier par envoi — c'est
// une brique de sécurité qu'on n'élargit pas pour un confort d'écran. On boucle
// donc ici. Ça ne change rien au résultat : le manifeste cumule et se réécrit
// après chaque source, donc cinq fichiers déposés l'un après l'autre sous le
// même nom donnent la même empreinte qu'un lot — et si le troisième casse, les
// deux premiers sont déjà gardés.

const depotEmpreinte = () => $('depotEmpreinte')

depotEmpreinte().addEventListener('click', () => $('fichiersEmpreinte').click())
depotEmpreinte().addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  $('fichiersEmpreinte').click()
})
depotEmpreinte().addEventListener('dragover', (e) => {
  e.preventDefault()
  depotEmpreinte().classList.add('survol')
})
depotEmpreinte().addEventListener('dragleave', () => depotEmpreinte().classList.remove('survol'))
depotEmpreinte().addEventListener('drop', (e) => {
  e.preventDefault()
  depotEmpreinte().classList.remove('survol')
  deposeDesFichiers([...(e.dataTransfer?.files ?? [])])
})
$('fichiersEmpreinte').addEventListener('change', (e) => {
  deposeDesFichiers([...e.currentTarget.files])
  e.currentTarget.value = ''
})

async function deposeDesFichiers(fichiers) {
  if (!fichiers.length) return

  const nom = nomDeRangement()
  const marge = Number($('empreinteMarge').value)
  let gardees = 0
  let derniere = null
  const rates = []

  for (const [i, f] of fichiers.entries()) {
    annonce(`${i + 1}/${fichiers.length} · ${f.name} — séparation en cours…`)
    const corps = new FormData()
    corps.append('nom', nom)
    corps.append('marge', String(marge))
    corps.append('fichier', f, f.name)

    try {
      const reponse = await api('/api/empreintes/fichier', { methode: 'POST', corps })
      const vue = reponse.travail?.etat === 'encours'
        ? await suisLeTravail(reponse.travail)
        : reponse.travail
      if (vue?.etat === 'echec') { rates.push(`${f.name} — ${derniereErreur(vue)}`); continue }
      // Une récolte qui ne retient rien sort en succès : c'est le bon
      // comportement — le fichier n'avait simplement pas de passage sans
      // musique. Il faut quand même le compter comme raté, sinon l'écran
      // annonce « déposé » devant une liste inchangée.
      if (vue?.resultat?.empreinte) {
        gardees += 1
        derniere = vue.resultat.empreinte.id
      } else rates.push(`${f.name} — rien de retenu, voir le journal`)
    } catch (err) {
      rates.push(`${f.name} — ${err.message}`)
    }
  }

  await chargeLesModeles()
  await chargeLesEmpreintes()
  // Même raison qu'après une récolte par adresse : le prochain dépôt doit
  // tomber dans le dossier qu'on vient de remplir, pas en ouvrir un autre.
  viseLaVoix(derniere)

  if (gardees && !rates.length) annonce(`${gardees} fichier(s) récolté(s).`, 'ok')
  else if (gardees) annonce(`${gardees} récolté(s). Écartés : ${rates.join(' · ')}`, 'erreur')
  else annonce(`Rien de récolté. ${rates.join(' · ')}`, 'erreur')
}
// PAS DE RACCOURCI « ENTRÉE » SUR CE CHAMP, CONTRAIREMENT AUX AUTRES.
//
// Il porte plusieurs lignes, et « Entrée » y sert à passer à l'adresse
// suivante. Le détourner pour lancer aurait déclenché la récolte au moment
// précis où l'on colle son deuxième lien.

// ---------------------------------------------------------------------------
//  Étape 3 ter — entraîner un timbre sur l'empreinte récoltée
// ---------------------------------------------------------------------------
//
// LE SEUL TRAVAIL DE L'ATELIER QUI SE COMPTE EN HEURES.
//
// Tout le reste rend la main en secondes ou en minutes. Celui-ci sature la
// carte graphique pendant trente minutes à deux heures. L'écran le dit avant de
// lancer et redemande confirmation : un bouton qui ne répond plus pendant une
// heure sans avoir prévenu se lit comme un plantage, et on le reclique.

async function chargeLesModeles() {
  try {
    const r = await api('/api/modeles')
    appli.modeles = r.resultat?.modeles ?? []
  } catch {
    appli.modeles = []
  }
}

/** Le modèle entraîné sur cette empreinte, s'il existe. */
const modeleDe = (id) => (appli.modeles ?? []).find((m) => m.id === id) ?? null

async function entraineUneEmpreinte(e) {
  const total = e.totalS ?? 0
  const deja = modeleDe(e.id)

  // Le corpus court n'est pas refusé ici — la commande a le dernier mot et
  // connaît son plancher. Mais le dire AVANT évite de découvrir au bout d'une
  // heure qu'on a entraîné sur trop peu.
  const reserve =
    total < 900
      ? `\n\nAttention : ${chrono(total * 1000)} seulement. Un bon modèle en demande 15 à 30 min ; ` +
        `en dessous, le timbre bave sur les mots que le modèle n'a jamais entendus.`
      : ''

  const ok = await demandeConfirmation({
    titre: deja ? `Réentraîner « ${e.id} » ?` : `Entraîner « ${e.id} » ?`,
    quoi:
      `L'entraînement va occuper la carte graphique pendant 30 min à 2 h, sur ` +
      `${chrono(total * 1000)} de voix. Rien n'est payant : c'est du calcul local. ` +
      `Tu peux fermer cette page, le travail continue.` +
      (deja ? `\n\nLe modèle actuel sera remplacé.` : '') +
      reserve,
    action: 'Entraîner',
  })
  if (!ok) return

  try {
    annonce('')
    const reponse = await api('/api/modeles', { methode: 'POST', corps: { id: e.id } })
    const vue = reponse.travail?.etat === 'encours'
      ? await suisLeTravail(reponse.travail)
      : reponse.travail
    if (vue?.etat === 'echec') { annonce(derniereErreur(vue), 'erreur'); return }
    await chargeLesModeles()
    dessineLesEmpreintes()
    annonce(`Modèle « ${e.id} » entraîné.`, 'ok')
  } catch (err) {
    annonce(err.message, 'erreur')
  }
}

async function retireUnModele(e) {
  const ok = await demandeConfirmation({
    titre: `Retirer le modèle « ${e.id} » ?`,
    quoi: `L'empreinte et ses extraits restent : seul le modèle entraîné part. Il se refait.`,
    action: 'Retirer',
  })
  if (!ok) return
  await mene(() => api(`/api/modeles/${encodeURIComponent(e.id)}`, { methode: 'DELETE' }))
  await chargeLesModeles()
  dessineLesEmpreintes()
  annonce(`Modèle « ${e.id} » retiré.`, 'ok')
}
// La liste ne se charge qu'à l'ouverture du repli : c'est un geste rare, et
// interroger le disque à chaque affichage de l'étape Voix ne servirait personne.
$('repliEmpreintes').addEventListener('toggle', async (e) => {
  if (!e.currentTarget.open || appli.empreintes) return
  // Les modèles AVANT les empreintes : `dessineLesEmpreintes` lit
  // `appli.modeles` pour poser le badge et les boutons d'entraînement. Dans
  // l'autre ordre, la première peinture ignorait un modèle déjà entraîné, et
  // l'écran proposait « Entraîner » sur une empreinte qui l'était déjà.
  await chargeLesModeles()
  await chargeLesEmpreintes()
})

// ---------------------------------------------------------------------------
//  Étape 4 — l'audio complet
// ---------------------------------------------------------------------------

/** Les trois moteurs, tels qu'ils se disent à l'écran. */
const NOM_MOTEUR = {
  sts: 'ElevenLabs',
  local: 'modèle local',
  brute: 'aucune conversion',
}

/**
 * « Fabriqué avec … » — une ligne, écrite par la conversion elle-même.
 *
 * `null` veut dire QU'ON NE SAIT PAS : l'audio est antérieur au fichier qui
 * note l'emploi. On le dit ainsi. Deviner à partir du mode actuel de la chaîne
 * serait pire que se taire — c'est justement ce qui a pu changer depuis.
 */
function ligneVoixEmployee(emploi) {
  const ligne = creer('p', 'note voix-employee')
  if (!emploi) {
    ligne.textContent =
      `Voix employée : inconnue — cet audio est antérieur au suivi. ` +
      `La prochaine conversion l'inscrira.`
    return ligne
  }
  const morceaux = [`Fabriqué avec ${NOM_MOTEUR[emploi.mode] ?? emploi.mode}`]
  if (emploi.mode === 'sts') {
    morceaux.push(emploi.nom ? `« ${emploi.nom} »` : emploi.voice_id)
    if (emploi.stabilite !== null && emploi.stabilite !== undefined) {
      morceaux.push(
        `stabilité ${Number(emploi.stabilite).toFixed(2)} · similarité ${Number(emploi.similarite).toFixed(2)}`
      )
    }
  } else if (emploi.mode === 'local') {
    if (emploi.modele_local) morceaux.push(`« ${emploi.modele_local} »`)
    if (emploi.transpose) {
      morceaux.push(`transposition ${emploi.transpose > 0 ? '+' : ''}${emploi.transpose}`)
    }
  }
  if (emploi.musique) morceaux.push(`musique ${emploi.musique}`)
  if (emploi.fait_le) morceaux.push(dateCourte(emploi.fait_le))
  ligne.textContent = morceaux.join(' · ')
  // L'identifiant complet au survol : il ne mérite pas une ligne, et il est la
  // seule chose qu'on recopie quand on veut retrouver la voix ailleurs.
  if (emploi.voice_id) ligne.title = emploi.voice_id
  return ligne
}

/** « 7 sept. à 20:18 » — assez pour situer, jamais sur deux lignes. */
function dateCourte(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function dessineAudio() {
  const audio = appli.etat?.etapes?.audio
  const fiche = $('ficheAudio')
  // LE LIBELLÉ SE POSE AVANT LE RETOUR ANTICIPÉ.
  //
  // Il était écrit à la fin de la fonction, après le `return` du cas « absent » :
  // sur une vidéo sans audio, il gardait donc celui de la vidéo précédente et
  // proposait de « refaire » une voix qui n'existait pas.
  $('btnAudio').textContent = !audio || audio.verdict === 'absent'
    ? 'Générer la voix' : 'Refaire la voix'
  // Le moteur de la CHAÎNE avant tout le reste : c'est lui qui décide quels
  // réglages s'affichent, et il doit être posé avant qu'on les remplisse.
  poseLeMoteurParDefaut()
  // Sans attendre : la liste des modèles vient du disque et l'étape doit
  // s'afficher tout de suite. La note et les réglages se remplissent après.
  majLeMoteur().catch(() => {})
  if (!audio || audio.verdict === 'absent') { fiche.hidden = true; return }
  fiche.replaceChildren()
  const p = creer('p', 'titre-fiche')
  p.textContent = audio.verdict === 'perime'
    ? `À refaire : la prise a changé.`
    : `Audio converti et à jour.`
  const lecteur = creer('audio')
  lecteur.controls = true
  lecteur.preload = 'metadata'
  // LE FICHIER REFAIT GARDE SON CHEMIN, DONC LE NAVIGATEUR REJOUE L'ANCIEN.
  //
  // `voix-finale.wav` est réécrit à chaque conversion. Sans la date, ce lecteur
  // rejouait la version précédente — et quand les deux n'avaient pas la même
  // durée, on entendait la nouvelle voix se poursuivre dans l'ancienne. C'est
  // le défaut qui avait coûté une demi-heure à comprendre, et il vivait encore
  // ici.
  lecteur.src = `${urlMedia(appli.slug, audio.chemin)}?v=${encodeURIComponent(audio.modifie_le ?? '')}`
  lecteur.style.width = '100%'
  const note = creer('p', 'note')
  note.textContent = chrono((audio.dureeS ?? 0) * 1000)
  fiche.append(p, lecteur, note)

  // AVEC QUOI CET AUDIO A-T-IL ÉTÉ FAIT.
  //
  // L'écran ne disait que « converti et à jour ». Un mois plus tard, devant une
  // vidéo qu'on ne refait pas, la seule question est celle-là — et la réponse
  // n'était nulle part : le sélecteur juste en dessous montre le défaut de la
  // CHAÎNE, qui a pu changer depuis, et l'étape 3 montre un timbre ElevenLabs
  // qui n'a peut-être jamais servi. On lisait donc trois choses différentes de
  // trois endroits, dont aucune ne décrivait le fichier qu'on écoute.
  fiche.append(ligneVoixEmployee(audio.voix))

  // LE SYMPTOME EST ICI, LE REMEDE ETAIT DEUX ETAPES PLUS HAUT.
  //
  // C'est a cette etape qu'on decouvre la duree — « 15:22 » sur une prise de
  // cinq minutes — parce que c'est la qu'on ecoute. Les prises, elles, se
  // retirent a l'etape 2. On regardait donc le probleme sans voir ce qui le
  // repare, et il n'y avait rien pour faire le lien.
  const prises = appli.etat?.etapes?.rush?.fichiers ?? []
  if (prises.length > 1) {
    const avis = creer('p', 'note')
    avis.textContent =
      `Cette durée vient de ${prises.length} prises collées bout à bout. ` +
      `Si tu as déposé deux fois le même fichier, retire les copies :`
    const aller = creer('button', 'bouton minuscule')
    aller.type = 'button'
    aller.textContent = `Aller aux prises`
    aller.addEventListener('click', () => montre('rush'))
    const ligne = creer('p', 'ligne-action')
    ligne.append(aller)
    fiche.append(avis, ligne)
  }

  fiche.hidden = false
}

/**
 * Le choix du moteur, et ce qu'il change à l'écran.
 *
 * Deux réglages ne concernent que le local — le modèle et la transposition —
 * et les laisser visibles en mode ElevenLabs ferait croire qu'ils s'y
 * appliquent. La note dit ce que le geste va coûter, parce que c'est la seule
 * différence qui compte entre les trois entrées.
 */
/**
 * Pose le moteur et la transposition de la CHAÎNE, à l'ouverture d'une vidéo.
 *
 * LES MENUS ÉTAIENT EN DUR, ET ELEVENLABS ÉTAIT EN TÊTE.
 *
 * `config/chaine.json` porte pourtant `voix.mode` depuis le premier jour — le
 * montage le lit, l'écran non. Ouvrir une vidéo proposait donc ElevenLabs quoi
 * qu'on ait décidé pour la chaîne, et un clic de trop lançait une conversion
 * payante sur un timbre qu'on ne voulait plus. L'écran doit proposer ce que la
 * chaîne a choisi ; le reste du menu ne disparaît pas pour autant.
 *
 * On ne le fait qu'une fois par vidéo : sinon un aller-retour entre deux étapes
 * effacerait le choix qu'on vient de faire à la main.
 */
/**
 * CE QUI A SERVI PASSE AVANT LE DÉFAUT DE LA CHAÎNE.
 *
 * L'écran repartait toujours du défaut de `config/chaine.json`. Sur une vidéo
 * dont l'audio existe déjà, il proposait donc autre chose que ce qu'on entend
 * — c'est ce qu'on lit comme « tout est remis à zéro quand je reviens ». Pire,
 * un clic sur « Refaire la voix » aurait alors changé de moteur sans qu'on l'ait
 * demandé.
 *
 * L'ordre est celui du §8 appliqué à l'écran : ce que CET audio a employé, puis
 * le défaut de la chaîne, puis le premier de la liste.
 */
function poseLeMoteurParDefaut() {
  if (appli.moteurPose === appli.slug) return
  appli.moteurPose = appli.slug

  const v = appli.chaine?.voix ?? {}
  const emploi = appli.etat?.etapes?.audio?.voix ?? null
  const moteur = $('moteurVoix')
  const voulu = emploi?.mode ?? v.mode
  if (voulu && [...moteur.options].some((o) => o.value === voulu)) moteur.value = voulu

  const transpose = $('transposeVoix')
  const demiTons = String(emploi?.transpose ?? v.transpose ?? 0)
  if ([...transpose.options].some((o) => o.value === demiTons)) transpose.value = demiTons

  // Le modèle est posé ici mais choisi plus tard : la liste vient du disque et
  // n'est peuplée qu'après `chargeLesModeles()`. On note l'intention, et
  // `majLeMoteur` l'applique dès qu'il a de quoi.
  appli.modeleVoulu = emploi?.modele_local ?? v.modele_local ?? null
}

async function majLeMoteur() {
  const moteur = $('moteurVoix').value
  const local = moteur === 'local'
  for (const el of document.querySelectorAll('.local-seul')) el.hidden = !local

  // Les EMPREINTES autant que les modèles : sans elles, l'écran ne peut pas
  // distinguer « tu n'as rien récolté » de « ta récolte est trop courte pour
  // entraîner », qui appellent des gestes différents.
  if (local && !appli.modeles) await chargeLesModeles()
  if (local && !appli.empreintes) await chargeLesEmpreintes()

  if (local) {
    const sel = $('modeleVoix')
    const retenu = sel.value
    sel.replaceChildren()
    for (const m of appli.modeles ?? []) {
      const o = creer('option')
      o.value = m.id
      o.textContent = `${m.id} — ${m.epoques} époques sur ${chrono((m.corpusS ?? 0) * 1000)}`
      sel.append(o)
    }
    // L'ordre : ce qui était déjà sélectionné à l'écran (on ne défait pas un
    // geste en cours), puis ce que cet audio a employé, puis le défaut.
    const voulu = retenu || appli.modeleVoulu
    if (voulu && [...sel.options].some((o) => o.value === voulu)) sel.value = voulu
  }

  const note = $('noteMoteur')
  if (moteur === 'sts') {
    note.textContent = `Le coût sera annoncé avant de lancer.`
  } else if (moteur === 'brute') {
    note.textContent = `Ta prise part telle quelle : aucune conversion, aucun traitement.`
  } else if (!appli.modeles?.length) {
    // ON NE DIT PAS « RÉCOLTE UNE VOIX » À QUELQU'UN QUI EN A UNE.
    //
    // Le message était le même dans les trois situations : aucune empreinte,
    // une empreinte trop courte, une empreinte prête à entraîner. Il envoyait
    // donc récolter quelqu'un qui avait déjà 1 min 42 s en magasin, et taisait
    // le seul geste qui restait à faire. Trois états, trois phrases.
    //
    // Et dans tous les cas : DIRE CE QUI EST POSSIBLE MAINTENANT. Un bouton
    // grisé sans issue est une impasse ; les deux autres moteurs, eux, marchent.
    const meilleure = [...(appli.empreintes ?? [])].sort((a, b) => (b.totalS ?? 0) - (a.totalS ?? 0))[0]
    const secours = ` En attendant, « ElevenLabs » ou « Ma voix telle quelle » restent disponibles.`

    if (!meilleure) {
      note.textContent =
        `Aucune empreinte récoltée. Va en chercher une à l'étape 3 — il faut 15 à 30 min` +
        ` de voix propre pour entraîner un modèle.` + secours
    } else if ((meilleure.totalS ?? 0) < 120) {
      note.textContent =
        `« ${meilleure.id} » ne porte que ${chrono((meilleure.totalS ?? 0) * 1000)} :` +
        ` trop court pour entraîner, il en faut 15 à 30 min. Dépose d'autres sources` +
        ` à l'étape 3, sous le même nom — elles se cumulent.` + secours
    } else {
      note.textContent =
        `« ${meilleure.id} » porte ${chrono((meilleure.totalS ?? 0) * 1000)} et n'est pas` +
        ` encore entraînée : lance l'entraînement à l'étape 3.` + secours
    }
  } else {
    note.textContent = `Gratuit et hors ligne. Compte une à deux minutes par minute de prise.`
  }
  $('btnAudio').disabled = local && !appli.modeles?.length
}

$('moteurVoix').addEventListener('change', majLeMoteur)

/**
 * Retient le modèle et la transposition affichés comme défaut de la CHAÎNE.
 *
 * LES DEUX ENSEMBLE, JAMAIS L'UN SANS L'AUTRE.
 *
 * Retenir le modèle seul laisserait la transposition à zéro sur chaque nouvelle
 * vidéo : le timbre se plaquerait sur la hauteur de la prise, une octave trop
 * bas entre un homme et une femme. On entendrait « robotique », on accuserait
 * le modèle, et on chercherait du mauvais côté — c'est exactement ce qui est
 * arrivé la première fois.
 */
$('btnDefautVoix').addEventListener('click', async (ev) => {
  // Le bouton se retient AVANT la confirmation : après l'await, `currentTarget`
  // ne désigne plus rien.
  const bouton = ev.currentTarget
  const modele = $('modeleVoix').value
  if (!modele) { annonce(`Choisis d'abord un modèle.`, 'erreur'); return }
  const transpose = Number($('transposeVoix').value) || 0

  const ok = await demandeConfirmation({
    titre: `En faire le défaut de la chaîne ?`,
    quoi:
      `Modèle « ${modele} », transposition ${transpose >= 0 ? '+' : ''}${transpose} demi-tons.\n\n` +
      `Toutes les vidéos qui ne choisissent rien partiront dessus. ` +
      `ElevenLabs reste disponible, vidéo par vidéo.`,
    action: 'Enregistrer',
  })
  if (!ok) return

  await pendant(bouton, 'Enregistrement…', async () => {
    try {
      await api('/api/chaine/voix/defaut', { methode: 'POST', corps: { modele, transpose } })
      // La carte d'identité vient de changer : la relire évite que l'écran
      // continue de proposer l'ancien défaut à la vidéo suivante.
      const c = await api('/api/chaine')
      appli.chaine = c.chaine
      annonce(`Défaut de la chaîne : « ${modele} », ${transpose >= 0 ? '+' : ''}${transpose}.`, 'ok')
    } catch (e) {
      annonce(e.message, 'erreur')
    }
  })
})

/**
 * Convertit quelques secondes, pour juger la transposition avant de tout refaire.
 *
 * LE RÉGLAGE JUSTE ET LE RÉGLAGE PRÉFÉRÉ NE SONT PAS LE MÊME NOMBRE.
 *
 * Mettre la prise exactement sur la hauteur médiane du modèle est calculable ;
 * ce qu'on veut entendre ne l'est pas. Sur myriam, le calcul donnait +9,5 et
 * l'oreille a choisi +12. Il faut donc pouvoir essayer — et un essai ne vaut que
 * s'il coûte quelques secondes, pas une conversion complète suivie d'une
 * transcription.
 *
 * L'essai écrit dans son propre fichier : on compare au master, on ne l'écrase
 * pas avant d'avoir tranché.
 */
$('btnEssaiLocal').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Conversion…', async () => {
    const modele = $('modeleVoix').value
    if (!modele) { annonce(`Choisis d'abord un modèle.`, 'erreur'); return }
    const secondes = Number($('essaiLocalDuree').value) || 8
    const depart = Number($('essaiLocalDepart').value) || 0
    const transpose = Number($('transposeVoix').value) || 0

    try {
      annonce('')
      const r = await api(`/api/videos/${encodeURIComponent(appli.slug)}/audio/essai`, {
        methode: 'POST',
        corps: { modele, transpose, secondes, depart },
      })
      const vue = r.travail?.etat === 'encours' ? await suisLeTravail(r.travail) : r.travail
      if (vue?.etat === 'echec') { annonce(derniereErreur(vue), 'erreur'); return }

      $('nomEssaiLocal').textContent =
        `${modele} · transposition ${transpose >= 0 ? '+' : ''}${transpose} · ` +
        `${secondes} s à partir de ${depart} s`
      const lecteur = $('audioEssaiLocal')
      // L'horodatage force le navigateur à relire : sans lui, deux essais de
      // suite sur la même adresse rejouent le premier, et on croit que le
      // réglage n'a rien changé.
      lecteur.src = `${urlMedia(appli.slug, r.fichier)}?t=${Date.now()}`
      montreLeLecteur('ecouteEssaiLocal')
      lecteur.play().catch(() => {})
    } catch (e) {
      annonce(e.message, 'erreur')
    }
  })
)

$('btnAudio').addEventListener('click', async () => {
  $('btnAudio').disabled = true
  try {
    const moteur = $('moteurVoix').value
    const corps = { moteur }
    if (moteur === 'local') {
      corps.modele = $('modeleVoix').value
      corps.transpose = Number($('transposeVoix').value)
    }

    // LE DEVIS NE S'OUVRE QUE POUR CE QUI SE PAIE.
    //
    // `apiPayante` présente le coût et attend un accord. Le local et le brut ne
    // coûtent rien : leur poser la même fenêtre à zéro euro apprendrait à
    // cliquer « oui » sans lire, ce qui viderait la question de son sens le jour
    // où elle porte un vrai montant.
    const vue = await mene(
      () =>
        moteur === 'sts'
          ? apiPayante(`/api/videos/${encodeURIComponent(appli.slug)}/audio/generer`, corps)
          : api(`/api/videos/${encodeURIComponent(appli.slug)}/audio/generer`, {
              methode: 'POST',
              corps,
            }),
      { refus: `Conversion annulée — rien n'a été facturé.` }
    )
    if (vue?.etat === 'fini') {
      annonce(`Voix et transcription à jour.`, 'ok')
      avanceApres('audio')
    }
  } finally {
    $('btnAudio').disabled = false
  }
})

// ---------------------------------------------------------------------------
//  Étape 6 — les plans
// ---------------------------------------------------------------------------

/**
 * Le modèle vidéo de l'étape 6, et ce qu'il va coûter.
 *
 * IL N'EXISTE QU'EN « CRÉATION ASSISTÉE ».
 *
 * Sur un montage entièrement en banque d'images, il n'y a rien à payer et rien
 * à choisir : un sélecteur visible en permanence laisserait croire qu'on paie
 * à chaque montage. C'est le mode qui l'ouvre, et qui le referme.
 *
 * TOUS LES PRIX DE CETTE ÉTAPE SONT CALCULÉS ICI, AUCUN N'EST ÉCRIT AILLEURS.
 *
 * Les libellés annonçaient « 0,18 $ » pour l'ouverture et « jusqu'à 0,54 $ »
 * pour le comblage. Les deux étaient vrais pour LTX et faux pour les trois
 * autres modèles — le plan de cinq secondes va de 0,04 $ à 2,36 $, un facteur
 * soixante — et on les lisait juste au-dessus du sélecteur qui les dément.
 */
/**
 * COMBIEN DE PLANS DE COUPE CE MONTAGE VA POSER.
 *
 * Le curseur du budget en a besoin comme borne : proposer trente générations à
 * une vidéo qui compte douze plans est un chiffre qui ne veut rien dire, et le
 * coût affiché à côté serait faux d'autant. La commande ne dépense rien — elle
 * compte les visuels du script, et du plan de montage quand il existe.
 *
 * Zéro veut dire « pas encore de script » et non « pas de plans » : on ouvre
 * alors le curseur sur une plage raisonnable au lieu de le bloquer.
 */
const BUDGET_SANS_ESTIMATION = 10

async function estimeLesPlans() {
  if (appli.estimation?.slug === appli.slug) return appli.estimation
  try {
    const r = await api(`/api/videos/${encodeURIComponent(appli.slug)}/estimation`)
    appli.estimation = { slug: appli.slug, plans: Number(r.resultat?.plans) || 0 }
  } catch {
    appli.estimation = { slug: appli.slug, plans: 0 }
  }
  return appli.estimation
}

// LE BUDGET SE RETIENT PAR VIDÉO, comme la destination et le mode.
//
// C'est une décision de dépense, et elle se prend une fois : la reperdre à
// chaque rafraîchissement de l'état ferait remonter le curseur à trois sans
// qu'on l'ait touché — et on paierait trois générations qu'on avait refusées.
const cleBudgetIa = (slug) => `atelier.plansIa.${slug}`
const budgetIaRetenu = (slug) => {
  try {
    // `Number(null)` vaut ZÉRO, et zéro est un budget valide.
    //
    // Sans ce test, une vidéo dont on n'avait jamais touché le curseur passait
    // pour une vidéo où l'on avait refusé toute génération : le curseur
    // s'ouvrait sur 0, et « création assistée » ne générait rien.
    const brut = localStorage.getItem(cleBudgetIa(slug))
    if (brut === null || brut === '') return null
    const v = Number(brut)
    return Number.isFinite(v) && v >= 0 ? v : null
  } catch { return null }
}
const retiensBudgetIa = (slug, v) => {
  try { localStorage.setItem(cleBudgetIa(slug), String(v)) } catch { /* mode privé */ }
}

/** Le budget affiché par le curseur, borné par ce que le montage peut employer. */
const budgetIa = () => Math.max(0, Number($('planBudgetIa').value) || 0)

async function majLeModeleVideo() {
  const note = $('notePlanModele')
  const prixOuverture = $('prixOuvertureIa')
  if (modeDeLaVideo() !== 'mixte') return

  // Le curseur d'abord : son maximum vient de la vidéo, sa valeur de la
  // dernière décision prise dessus.
  const curseur = $('planBudgetIa')
  const { plans: attendus } = await estimeLesPlans()
  const plafond = attendus > 0 ? attendus : BUDGET_SANS_ESTIMATION
  curseur.max = String(plafond)
  const retenu = budgetIaRetenu(appli.slug)
  const valeur = Math.min(plafond, retenu ?? Math.min(3, plafond))
  curseur.value = String(valeur)
  $('planBudgetIaValeur').textContent = String(valeur)
  $('notePlanChoix').textContent = attendus > 0
    ? `${attendus} plan(s) de coupe dans ce montage. Le curseur est un PLAFOND : ` +
      `le script décide lesquels méritent une génération, et ce qui n'est pas employé ` +
      `n'est pas facturé.`
    : `Le nombre de plans de coupe sera connu quand le script sera déduit. ` +
      `Le curseur reste un plafond : rien n'est facturé tant que rien n'est généré.`

  if (appli.modelesVideo === undefined) {
    try {
      appli.modelesVideo = await api('/api/modeles-video')
    } catch {
      appli.modelesVideo = null
    }
  }
  const d = appli.modelesVideo
  if (!d) {
    // Sans catalogue, on n'invente pas de chiffre : on dit qu'on ne l'a pas.
    note.textContent = `Tarifs indisponibles — le devis les redonnera avant de lancer.`
    prixOuverture.textContent = ''
    return
  }

  const sel = $('planModeleVideo')
  if (!sel.childElementCount) {
    for (const m of d.modeles) {
      const o = creer('option')
      o.value = m.format
      o.textContent = `${m.nom} — ${m.usd5s.toFixed(2)} $ / plan de 5 s — ${m.resume}`
      sel.append(o)
    }
    // On part sur le modèle de la CHAÎNE : c'est le défaut, et le changer ici
    // ne vaut que pour ce montage.
    sel.value = d.retenu ?? d.defaut
  }

  // LE TOTAL SE CALCULE DEVANT, PAS DANS LA FENÊTRE DE DEVIS.
  //
  // Le devis arrive après le clic ; à ce moment-là on a déjà décidé. Le chiffre
  // doit être lisible AVANT — c'est ce qui rend le choix du modèle un choix.
  const m = d.modeles.find((x) => x.format === sel.value)
  const unPlan = m?.usd5s ?? 0
  // Le libellé de la case porte le prix du modèle retenu, pas un nombre gravé.
  prixOuverture.textContent = ` — ${unPlan.toFixed(2)} $`
  const plans = ($('estOuvertureIa').checked ? 1 : 0) + valeur
  note.textContent = plans === 0
    ? `Aucune génération : ce montage sera entièrement pris en banque d'images, ` +
      `et ne coûtera rien.`
    : `Au pire ${plans} plan(s) générés avec ${m?.nom ?? '?'} — ` +
      `${(unPlan * plans).toFixed(2)} $ au total.`
}

$('planModeleVideo').addEventListener('change', () => majLeModeleVideo())
$('estOuvertureIa').addEventListener('change', () => majLeModeleVideo())
$('planBudgetIa').addEventListener('input', () => {
  // La valeur s'affiche à la trame, le prix se refait avec : un curseur dont le
  // chiffre arrive après le doigt ne se règle pas, il se devine.
  $('planBudgetIaValeur').textContent = $('planBudgetIa').value
  retiensBudgetIa(appli.slug, budgetIa())
  majLeModeleVideo().catch(() => {})
})

function dessinePlan() {
  // Le mode de fabrication ouvre l'étape : c'est lui qui décide de ce que le
  // bouton va faire, et de ce qui se paie. `dessineLesModes` rafraîchit le
  // sélecteur de modèle dans la foulée.
  dessineLesModes()
  // LA REVUE SE REDESSINE DANS TOUS LES CAS, Y COMPRIS QUAND IL N'Y A PAS DE PLAN.
  //
  // Elle était appelée en toute fin de fonction, après un `return` qui se
  // déclenche dès que le plan est absent. Conséquence : en passant d'une vidéo
  // montée à une vidéo qui ne l'est pas, l'étape 6 continuait d'afficher les
  // trente-quatre plans de l'AUTRE vidéo — avec leur voix off, leurs
  // sous-titres, et le bouton « Un autre » qui aurait échangé un plan chez la
  // voisine. On croyait sa piste image déjà faite.
  dessineLaRevueDesPlans()
  const plan = appli.etat?.etapes?.plan
  const fiche = $('fichePlan')
  // Même raison qu'au-dessus : le libellé survivait au changement de vidéo.
  $('btnPlans').textContent = !plan || plan.verdict === 'absent'
    ? 'Générer les plans' : 'Régénérer les plans'
  if (!plan || plan.verdict === 'absent') { fiche.hidden = true; return }
  fiche.replaceChildren()
  const p = creer('p', 'titre-fiche')
  p.textContent = plan.verdict === 'perime'
    ? `Un plan existe, mais une de ses entrées a bougé : il est à reconstruire.`
    : `Plan de montage à jour.`
  const dl = creer('dl')
  for (const [t, v] of [
    ['Événements visuels', plan.evenements],
    ['Creux sans événement', plan.creux],
    ['Durée', plan.dureeS ? chrono(plan.dureeS * 1000) : null],
  ]) {
    if (v === undefined || v === null) continue
    const dt = creer('dt'); dt.textContent = t
    const dd = creer('dd'); dd.textContent = v
    dl.append(dt, dd)
  }
  fiche.append(p, dl)
  if (plan.creux > 0) {
    const c = creer('p', 'divergence')
    c.textContent = `${plan.creux} passage(s) de plus de 4 s sans rien à l'image.`
    fiche.append(c)
  }
  fiche.hidden = false
}

// ---------------------------------------------------------------------------
//  La revue des plans de coupe
// ---------------------------------------------------------------------------
//
// TROIS COMPTEURS NE DISENT PAS SI LE MONTAGE EST BON.
//
// « 34 événements visuels, 2 creux » — c'est vrai, et ça n'apprend rien. Les
// plans viennent d'une requête en anglais lancée dans une banque d'images : la
// plupart tombent juste, deux ou trois ne veulent rien dire, et ce sont
// exactement ceux-là qu'un spectateur voit. Il faut les regarder.
//
// REFUSER UN PLAN EN APPELLE UN AUTRE, ET C'EST TOUTE LA DIFFÉRENCE.
//
// Un bouton « jeter » aurait été plus simple à écrire. Il aurait laissé un trou
// que le plan précédent comble en s'étirant — donc un plan long et fixe, donc
// le temps mort que le §10 interdit en premier. On échange, on ne retire pas.

// ---------------------------------------------------------------------------
//  Les sous-titres du rendu, posés sur une image de contrôle
// ---------------------------------------------------------------------------
//
// UN PLAN MUET NE SE JUGE PAS.
//
// La question devant un plan de coupe n'est jamais « est-ce une belle image » :
// c'est « est-ce que ça va avec ce qui est dit À CET INSTANT ». Une vignette
// muette ne peut pas y répondre, et une phrase écrite en dessous non plus — on
// la lit trois fois plus vite qu'elle n'est prononcée, donc on ne perçoit pas
// le passage, on le résume.
//
// Il faut donc les trois ensemble et à la même horloge : l'image qui tourne, la
// voix off du passage, et les mots qui apparaissent comme ils apparaîtront à
// l'écran. Le style vient du plan lui-même — c'est l'objet que Remotion lit.

/** Un nombre à une décimale, à la française. */
const nombreFr = (n) => String(Math.round(n * 10) / 10).replace('.', ',')

const SOUSTITRES_DEFAUT = {
  motsParPage: 2, casse: 'majuscules', taille: 86, positionBas: 38,
  contour: true, epaisseurContour: 0.7, ponctuation: false, police: null,
  couleurTexte: '#f5f3f2', couleurSurligne: '#CA5377', couleurContour: '#000000',
  largeur: 1080, hauteur: 1920,
}

/**
 * Découpe les mots en pages.
 *
 * LE RENDU EST PLUS SUBTIL, ET C'EST ASSUMÉ. `pagine()` de Remotion retient
 * les mots outils avec le mot suivant et ferme sur la ponctuation ; ici on
 * coupe tous les `motsParPage`. Le groupe peut donc différer d'un mot — les
 * INSTANTS, eux, sont exactement ceux du rendu, et c'est la seule chose qu'on
 * vient vérifier sur cet écran.
 */
function pagineLesMots(mots, parPage) {
  const pages = []
  for (let i = 0; i < mots.length; i += parPage) pages.push(mots.slice(i, i + parPage))
  return pages
}

/**
 * Pose une couche de sous-titres sur un cadre, et rend la fonction qui la fait
 * suivre une horloge (en millisecondes, dans le temps de la VIDÉO).
 */
function poseLesSousTitres(cadre, mots, style) {
  const st = { ...SOUSTITRES_DEFAUT, ...(style ?? {}) }

  // Le cadre prend le format du rendu. Sans ça, une image verticale posée dans
  // une boîte large reçoit ses sous-titres sur la boîte : trop grands, et
  // débordant l'image des deux côtés.
  if (st.largeur && st.hauteur) {
    cadre.style.aspectRatio = `${st.largeur} / ${st.hauteur}`
    cadre.style.setProperty('--cadre-ratio', String(st.largeur / st.hauteur))
  }

  const couche = creer('div', 'st-couche')

  // La taille est celle du rendu, ramenée à la largeur du cadre : 86 px sur
  // 1080 font 8 % de la largeur, quelle que soit la taille de l'aperçu.
  //
  // LA DIVISION SE FAIT PAR LA LARGEUR DU FORMAT, PAS PAR 1080. Le rendu pose
  // `taille × min(L, H) / 1080` pixels sur un cadre de L de large (voir
  // `echelleDe` dans SousTitres.tsx) : sur un montage horizontal, diviser par
  // 1080 annonçait un corps 78 % trop gros sur chaque vignette de plan.
  const L = Number(st.largeur) || 1080
  const H = Number(st.hauteur) || 1920
  const corps = ((Number(st.taille) || 86) * Math.min(L, H)) / 1080
  couche.style.setProperty('--st-taille', `${(corps / L) * 100}`)
  couche.style.setProperty('--st-texte', st.couleurTexte)
  couche.style.setProperty('--st-surligne', st.couleurSurligne)
  couche.style.setProperty('--st-contour', st.couleurContour)
  couche.style.setProperty('--st-epaisseur', `${(Number(st.epaisseurContour) || 0.7) * 0.08}`)
  couche.style.bottom = `${Math.max(2, Math.min(85, Number(st.positionBas) || 38))}%`
  if (st.police) couche.style.fontFamily = `'${st.police}', var(--police, sans-serif)`
  if (!st.contour) couche.classList.add('sans-contour')
  cadre.append(couche)

  const propre = (mot) => {
    const t = String(mot ?? '')
    const sans = st.ponctuation === false ? t.replace(/[.,;:!?…]+$/u, '') : t
    return st.casse === 'majuscules' ? sans.toLocaleUpperCase('fr') : sans
  }

  const pages = pagineLesMots(mots ?? [], Math.max(1, Number(st.motsParPage) || 2))
  let affichee = -1

  return function suis(tMs) {
    const i = pages.findIndex((pg) => tMs >= pg[0].debutMs && tMs < pg[pg.length - 1].finMs)
    if (i === -1) {
      if (affichee !== -1) { couche.replaceChildren(); affichee = -1 }
      return
    }
    if (i !== affichee) {
      affichee = i
      couche.replaceChildren(
        ...pages[i].map((m) => {
          const e = creer('span')
          e.textContent = propre(m.texte)
          return e
        })
      )
    }
    const spans = couche.children
    pages[i].forEach((m, k) => {
      spans[k]?.classList.toggle('actif', tMs >= m.debutMs && tMs < m.finMs)
    })
  }
}

/**
 * L'adresse de la voix off, versionnée.
 *
 * Sans le `?v=`, une conversion refaite ressort du cache du navigateur : on
 * réécoute l'ancienne voix en croyant écouter la nouvelle. C'est arrivé, et
 * ça avait pris une demi-heure à comprendre.
 */
function urlDeLaVoix() {
  const a = appli.etat?.etapes?.audio
  if (!a?.chemin) return null
  return `${urlMedia(appli.slug, a.chemin)}?v=${encodeURIComponent(a.modifie_le ?? '')}`
}

// UN SEUL LECTEUR POUR TRENTE VIGNETTES.
//
// Trente `<audio>` sur le même fichier de onze mégaoctets, c'est trente
// requêtes de plage et une page qui colle. Un seul lecteur qu'on déplace suffit
// : on n'écoute jamais deux plans à la fois.
let voixDeLaRevue = null
let planQuiJoue = null

function lecteurDeLaRevue() {
  if (!voixDeLaRevue) {
    voixDeLaRevue = new Audio()
    voixDeLaRevue.preload = 'metadata'
  }
  const url = urlDeLaVoix()
  if (url && voixDeLaRevue.dataset.url !== url) {
    voixDeLaRevue.dataset.url = url
    voixDeLaRevue.src = url
  }
  return url ? voixDeLaRevue : null
}

function arreteLaRevue() {
  if (planQuiJoue) { planQuiJoue.arrete(); planQuiJoue = null }
}

async function dessineLaRevueDesPlans() {
  const zone = $('revuePlans')
  arreteLaRevue()
  zone.replaceChildren()
  zone.hidden = true
  if (!appli.slug) return

  let plans
  try {
    const r = await api(`/api/videos/${encodeURIComponent(appli.slug)}/plans`)
    plans = r.resultat?.plans ?? []
    // Le style vient du plan, donc du rendu : l'aperçu ne peut pas en inventer
    // un autre.
    appli.styleSousTitres = r.resultat?.soustitres ?? null
  } catch {
    plans = []
  }
  appli.plansRevue = plans
  // L'ABSENCE SE DIT, ELLE NE SE DEVINE PAS.
  //
  // La zone se refermait sans un mot tant qu'aucun plan n'existait : l'étape 6
  // n'affichait alors que des cases et un bouton, et rien ne disait que c'est
  // ICI qu'on regarde les plans une fois générés. On croyait la revue absente
  // du logiciel, et on la cherchait ailleurs.
  if (!plans.length) {
    const rien = creer('p', 'note')
    rien.textContent =
      `Aucun plan de coupe pour l'instant. Une fois le montage construit, ils ` +
      `s'affichent ici un par un : la flèche joue le passage avec sa voix et ses ` +
      `sous-titres, et « Agrandir » l'ouvre en grand pour le juger.`
    zone.append(rien)
    zone.hidden = false
    return
  }

  const tete = creer('p', 'note')
  tete.textContent =
    `${plans.length} plans de coupe. La flèche joue le passage avec sa voix et ` +
    `ses sous-titres ; « Agrandir » l'ouvre en grand — les flèches ‹ › du clavier ` +
    `passent au plan suivant sans refermer, et c'est là qu'on l'échange. ` +
    `Le premier plan est celui qui décide si les autres seront vus : ce qui arrête ` +
    `le mieux, c'est un visage qui porte une émotion.`
  zone.append(tete)

  for (const p of plans) {
    const carte = creer('div', 'plan-vignette')
    // LE PREMIER PLAN NE SE RANGE PAS DANS LA GRILLE COMME LES AUTRES.
    //
    // C'est le seul qui décide si les trente suivants seront vus. Le noyer dans
    // une grille de vignettes identiques, c'était le laisser passer inaperçu à
    // la relecture — et c'est justement celui qu'il faut regarder deux fois.
    if (p.ouverture) carte.classList.add('ouverture')

    // L'IMAGE, SES SOUS-TITRES ET SA VOIX SOUS UN SEUL BOUTON.
    //
    // La vignette portait les commandes natives de la vidéo : une flèche qui
    // lançait une image MUETTE, sans un mot à l'écran. On voyait donc défiler
    // une scène sans savoir ce qu'elle accompagnait — exactement la question
    // qu'on était venu se poser. Le bouton lance maintenant les trois ensemble.
    const cadre = creer('div', 'plan-cadre')
    const media = creer(/\.(mp4|mov|webm)$/i.test(p.src ?? '') ? 'video' : 'img')
    media.src = urlMedia(appli.slug, `videos/${appli.slug}/05-montage/public/${p.src}`)
    if (media.tagName === 'VIDEO') {
      media.muted = true
      media.loop = true
      media.playsInline = true
      media.preload = 'metadata'
    }
    cadre.append(media)
    const suisLesMots = poseLesSousTitres(cadre, p.mots, appli.styleSousTitres)
    // AU REPOS, LA VIGNETTE PORTE SES PREMIERS MOTS.
    //
    // C est ce qui rend la grille lisible d un coup d oeil : trente images et,
    // sur chacune, ce qu on entend quand elle arrive. Le premier instant du
    // plan ne suffisait pas — un plan qui demarre sur un silence restait muet.
    const auRepos = p.mots?.[0]?.debutMs ?? p.debutMs
    suisLesMots(auRepos)

    const jouer = creer('button', 'plan-jouer')
    jouer.type = 'button'
    jouer.title = `Écouter ce passage`
    jouer.setAttribute('aria-label', `Écouter le passage du plan ${p.numero}`)
    cadre.append(jouer)

    // Le lecteur est partagé : lancer un plan arrête le précédent, et le
    // passage s'arrête à la fin du plan. Sans cette borne on écoute la suite de
    // la vidéo devant une image qui ne la concerne plus.
    const commande = {
      arrete() {
        const son = voixDeLaRevue
        if (son) { son.pause(); son.ontimeupdate = null }
        media.pause()
        cadre.classList.remove('joue')
        suisLesMots(auRepos)
      },
    }

    jouer.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (planQuiJoue === commande) { arreteLaRevue(); return }
      arreteLaRevue()
      const son = lecteurDeLaRevue()
      if (media.tagName === 'VIDEO') { media.currentTime = 0; media.play().catch(() => {}) }
      cadre.classList.add('joue')
      planQuiJoue = commande
      if (!son) { suisLesMots(auRepos); return }
      son.currentTime = p.debutMs / 1000
      son.ontimeupdate = () => {
        const t = son.currentTime * 1000
        if (p.finMs != null && t > p.finMs) { arreteLaRevue(); return }
        suisLesMots(t)
      }
      son.play().catch(() => {})
    })

    carte.append(cadre)

    const texte = creer('div', 'plan-texte')
    const quand = creer('span', 'plan-quand')
    quand.textContent = `${chrono(p.debutMs)}${p.finMs != null ? ` → ${chrono(p.finMs)}` : ''}`
    const sur = creer('span', 'plan-sur')
    sur.textContent = p.ancre ? `« ${p.ancre} »` : (p.requete ?? '')
    sur.title = p.requete ?? ''
    texte.append(quand, sur)
    if (p.essais) {
      const refus = creer('span', 'plan-refus')
      refus.textContent = `${p.essais} refus`
      texte.append(refus)
    }
    // UN FOND TROP CLAIR SE DIT SUR LA VIGNETTE.
    //
    // C'est la seule chose qu'on sache mesurer d'un plan : du texte blanc sur un
    // fond clair disparaît, et ça ne se voit qu'au rendu. `clair === null` veut
    // dire « pas encore mesuré » — on ne dit alors rien, plutôt que de laisser
    // croire que le plan est validé.
    // UN PLAN GÉNÉRÉ SE DIT, ET IL DIT PAR QUOI.
    //
    // Rien ne distinguait un plan généré d'un plan de banque sur la vignette :
    // on relançait une génération en croyant que rien n'avait changé, alors que
    // l'ouverture venait d'être refaite. Et sans le modèle, on ne peut pas
    // juger si le prix payé valait ce qu'on regarde.
    if (p.source === 'fal') {
      const g = creer('span', 'plan-genere')
      g.textContent = p.modele ? `généré · ${p.modele.split('/').pop()}` : `généré par IA`
      // POURQUOI CE PLAN-LÀ A COÛTÉ DE L'ARGENT.
      //
      // « généré » dit qu'il est différent, pas si le choix était juste. Or
      // c'est la seule chose qu'on puisse corriger au montage suivant : si le
      // script a désigné un passage qui n'en valait pas la peine, on le voit
      // ici et pas ailleurs.
      g.title = [
        p.modele ? `Modèle : ${p.modele}` : `Le modèle n'a pas été enregistré.`,
        p.iaPourquoi
          ? `${p.iaChoisi ? 'Choisi d’après le script' : 'Comblage'} : ${p.iaPourquoi}`
          : null,
      ].filter(Boolean).join('\n')
      if (p.iaChoisi) g.classList.add('choisi')
      texte.append(g)
    }
    if (p.clair === true) {
      const alerte = creer('span', 'plan-clair')
      alerte.textContent = `fond clair (${p.bandeY}) — texte blanc peu lisible`
      alerte.title =
        `Luminance moyenne de la bande des sous-titres : ${p.bandeY} sur 255.\n` +
        `Au-delà de 170, un texte blanc ne se détache plus, même avec son contour.\n` +
        `Échange le plan, génère-le, ou épaissis le contour à l'étape 5.`
      texte.append(alerte)
    }
    if (p.ouverture) {
      // AUCUNE NOTE SUR LA VIGNETTE, ET C'EST DÉLIBÉRÉ.
      //
      // Un chiffre affiché là aurait l'air d'un verdict : « 7,2 », donc bon.
      // Or ce qui fait qu'un plan arrête l'œil ne se met pas en un nombre — un
      // visage immobile peut arrêter net, une foule agitée peut glisser. La
      // vignette dit donc seulement CE QUE CE PLAN EST : celui qui décide si
      // les autres seront vus. Les relevés sont là, au survol, pour qui veut
      // les regarder.
      const marque = creer('span', 'plan-ouverture')
      const visage = p.accroche?.visage
      marque.textContent = p.terne
        ? `ouverture — terne, à échanger`
        : visage?.present
          ? `ouverture — un visage, à toi de voir l'émotion`
          : `ouverture — c'est lui qui décide`
      if (p.terne) marque.classList.add('faible')
      marque.title = p.accroche
        ? (visage?.present
            ? `Visage sur ${nombreFr(visage.taille)} % du cadre.\n`
            : `Aucun visage trouvé — le détecteur en rate, ça ne prouve rien.\n`) +
          `mouvement ${nombreFr(p.accroche.mouvement)} · contraste ${nombreFr(p.accroche.contraste)} · ` +
          `couleur ${nombreFr(p.accroche.couleur)}\n` +
          (p.terne
            ? `Ni visage ni aucun des trois : ce plan ne peut pas arrêter l'œil.`
            : `Des relevés, pas une note — l'émotion, elle, se juge à l'œil.`)
        : `Pas encore mesuré.`
      texte.append(marque)
    }
    carte.append(texte)

    // ON OUVRE EN GRAND AU LIEU DE REMPLACER TOUT DE SUITE.
    //
    // « Un autre » lançait la recherche au clic, sans rien demander. Deux
    // sources existent maintenant — la banque, gratuite, et l IA, payante — et
    // le choix ne se devine pas. Le bouton ouvre donc le plan en grand, avec sa
    // voix et son texte : on juge d abord, on choisit ensuite.
    media.style.cursor = 'zoom-in'
    cadre.addEventListener('click', (ev) => { ev.preventDefault(); arreteLaRevue(); ouvreLePlan(p) })
    // LE BOUTON DIT CE QU'IL FAIT, PAS CE QU'IL PERMET ENSUITE.
    //
    // Il disait « Un autre » et n'échangeait rien : il ouvrait le plan en grand,
    // d'où l'échange devient possible. On cherchait donc ailleurs le moyen
    // d'agrandir un plan, et on ne cliquait pas sur celui qui le faisait.
    const autre = creer('button', 'bouton minuscule discret')
    autre.type = 'button'
    autre.textContent = 'Agrandir'
    autre.title = p.requete
      ? `Voir le plan en grand, avec sa voix — et l'échanger si besoin`
      : `Voir le plan en grand, avec sa voix`
    autre.addEventListener('click', () => ouvreLePlan(p))
    carte.append(autre)

    zone.append(carte)
  }
  zone.hidden = false
}

async function remplaceUnPlanDeCoupe(numero, source = 'pexels') {
  try {
    const r = await api(`/api/videos/${encodeURIComponent(appli.slug)}/plans/${numero}/remplace`, {
      methode: 'POST', corps: { source },
    })

    // UNE GÉNÉRATION PART EN TRAVAIL DE FOND, ET SON JOURNAL DOIT SE VOIR.
    //
    // Elle dure une à trois minutes. Sans le journal, l'écran refermait le plan
    // et revenait à la liste : rien n'avait visiblement changé, et on croyait
    // que le clic n'avait pas pris. `suisLeTravail` ouvre le journal et fait
    // défiler les étapes de fal — mise en file, exécution, téléchargement.
    const vue = r.travail?.etat === 'encours' ? await suisLeTravail(r.travail) : r.travail
    if (vue?.etat === 'echec') { annonce(derniereErreur(vue), 'erreur'); return }

    await dessineLaRevueDesPlans()
    // LE RAIL DOIT LE DIRE AVANT QU'ON ARRIVE À L'ÉTAPE 7.
    //
    // Le plan vient de changer : le master est périmé à la seconde même. Sans
    // cette relecture, la marche 7 continuait d'afficher son ancien verdict
    // jusqu'à ce qu'on aille cliquer dessus — et on ne clique que quand on croit
    // que c'est prêt.
    await rafraichitEtat()
    annonce(
      source === 'ia'
        ? `Plan n° ${numero} généré. Relance le rendu pour le voir dans la vidéo.`
        : `Plan n° ${numero} remplacé. Relance le rendu pour le voir.`,
      'ok'
    )
  } catch (e) {
    annonce(e.message, 'erreur')
  }
}

// ---------------------------------------------------------------------------
//  Un plan en grand, avec sa voix et son texte
// ---------------------------------------------------------------------------
//
// UNE VIGNETTE DIT SI L'IMAGE EST JOLIE. ELLE NE DIT PAS SI ELLE VA AVEC.
//
// La question qu'on se pose devant un plan de coupe n'est jamais « est-ce une
// belle image » : c'est « est-ce que ça va avec ce qui est dit à cet instant ».
// Y répondre demande les trois ensemble — l'image en grand, la voix off au bon
// endroit, et les mots prononcés. Séparés, ils ne servent à rien : on a passé
// une demi-heure à juger des vignettes muettes sans pouvoir trancher.

let planOuvert = null
let arretePlanOuvert = () => {}

/** Écrit le prix du modèle retenu sur le bouton de génération. */
async function ecrisLePrixDeGeneration() {
  const b = $('btnAutreIa')
  if (!b) return
  if (appli.modelesVideo === undefined) {
    try { appli.modelesVideo = await api('/api/modeles-video') } catch { appli.modelesVideo = null }
  }
  const cat = appli.modelesVideo
  const m = cat?.modeles?.find((x) => x.format === cat.retenu) ?? null
  b.textContent = m ? `Générer par IA — ${m.usd5s.toFixed(2)} $` : `Générer par IA`
  b.title = m ? `${m.nom}. Le modèle se change dans « Identité ».` : ''
}

function ouvreLePlan(p) {
  // LE PRIX S'ÉCRIT SUR LE BOUTON, AU MOMENT OÙ ON L'OUVRE.
  //
  // Il était dans le HTML — « Générer par IA — 0,18 $ » — donc faux dès qu'on
  // change de modèle, et faux de treize fois sur Seedance. On le remplit ici,
  // depuis le catalogue servi par le serveur.
  ecrisLePrixDeGeneration()
  arretePlanOuvert()
  planOuvert = p
  $('titrePlan').textContent = `Plan ${p.numero} · ${chrono(p.debutMs)} → ${p.finMs != null ? chrono(p.finMs) : '?'}`

  const grand = $('planGrand')
  grand.replaceChildren()

  // UNE SEULE HORLOGE POUR LES TROIS.
  //
  // L'image avait ses propres commandes, la voix les siennes : deux flèches de
  // lecture pour un seul passage, et celle qu'on presse d'instinct — celle de
  // l'image — était justement la muette. On lançait donc une vidéo silencieuse
  // sans un mot à l'écran, devant une barre de son qu'on ne reliait pas à elle.
  //
  // La voix mène désormais, parce qu'elle seule porte le temps de la vidéo :
  // l'image la suit, les sous-titres aussi.
  const cadre = creer('div', 'plan-cadre')
  const media = creer(/\.(mp4|mov|webm)$/i.test(p.src ?? '') ? 'video' : 'img')
  media.src = urlMedia(appli.slug, `videos/${appli.slug}/05-montage/public/${p.src}`)
  if (media.tagName === 'VIDEO') {
    media.loop = true
    media.muted = true
    media.playsInline = true
  }
  cadre.append(media)
  const suisLesMots = poseLesSousTitres(cadre, p.mots, appli.styleSousTitres)
  suisLesMots(p.mots?.[0]?.debutMs ?? p.debutMs)
  grand.append(cadre)

  // LA VOIX OFF DU BON PASSAGE, PAS DEPUIS LE DÉBUT.
  //
  // On veut entendre ce qui se dit PENDANT ce plan. Le lecteur démarre donc au
  // début du plan, et s'arrête à sa fin : sans la borne, on écoute la suite de
  // la vidéo devant une image qui ne la concerne plus. La barre reste, pour
  // pouvoir revenir en arrière dans le passage.
  const son = creer('audio')
  son.controls = true
  son.preload = 'metadata'
  const urlVoix = urlDeLaVoix()
  if (urlVoix) {
    son.src = `${urlVoix}#t=${(p.debutMs / 1000).toFixed(2)}`
    son.addEventListener('timeupdate', () => {
      const t = son.currentTime * 1000
      if (p.finMs != null && t > p.finMs) { son.pause(); return }
      suisLesMots(t)
    })
    son.addEventListener('play', () => {
      if (son.currentTime * 1000 < p.debutMs || (p.finMs != null && son.currentTime * 1000 > p.finMs)) {
        son.currentTime = p.debutMs / 1000
      }
      cadre.classList.add('joue')
      if (media.tagName === 'VIDEO') media.play().catch(() => {})
    })
    son.addEventListener('pause', () => {
      cadre.classList.remove('joue')
      if (media.tagName === 'VIDEO') media.pause()
    })
    grand.append(son)

    // Le geste naturel devant une image est de cliquer dessus. Il lance donc
    // le passage entier — image, voix, sous-titres — et l'arrête.
    const jouer = creer('button', 'plan-jouer grand')
    jouer.type = 'button'
    jouer.setAttribute('aria-label', `Écouter ce passage`)
    cadre.append(jouer)
    const bascule = (ev) => {
      ev.preventDefault()
      if (son.paused) son.play().catch(() => {})
      else son.pause()
    }
    jouer.addEventListener('click', bascule)
    media.addEventListener('click', bascule)
    media.style.cursor = 'pointer'
    arretePlanOuvert = () => { son.pause() }
  } else {
    // Sans voix off, l'image reprend ses propres commandes : c'est tout ce
    // qu'il y a à regarder.
    if (media.tagName === 'VIDEO') media.controls = true
    arretePlanOuvert = () => { if (media.tagName === 'VIDEO') media.pause() }
  }

  $('planDit').textContent = p.texte ? `« ${p.texte} »` : '(rien de dit pendant ce plan)'
  $('planMeta').textContent =
    [
      p.ouverture
        ? `ouverture${
            p.accroche?.visage?.present
              ? ` · visage sur ${nombreFr(p.accroche.visage.taille)} % du cadre`
              : ''
          }${
            p.accroche
              ? ` · mouvement ${nombreFr(p.accroche.mouvement)}` +
                ` · contraste ${nombreFr(p.accroche.contraste)}` +
                ` · couleur ${nombreFr(p.accroche.couleur)}`
              : ''
          }`
        : null,
      p.source === 'fal' ? 'généré par IA' : 'banque d’images',
      p.requete ? `requête : ${p.requete}` : null,
      p.essais ? `${p.essais} refus` : null,
      p.insert ? 'porte un insert à toi' : null,
    ].filter(Boolean).join(' · ')
  $('planMeta').classList.toggle('alerte-ouverture', Boolean(p.ouverture && p.terne))

  // Un plan posé à la main n'a pas de requête : ni la banque ni l'IA n'ont de
  // quoi en proposer un autre.
  $('btnAutrePexels').hidden = !p.requete
  $('btnAutreIa').hidden = !p.requete

  // ON PASSE AU SUIVANT SANS REFERMER.
  //
  // Revoir une piste image, c'est regarder trente plans à la file. Il fallait
  // fermer, retrouver la bonne vignette dans la grille, la rouvrir : trois
  // gestes entre deux plans, donc on n'en regardait jamais que deux ou trois —
  // et la revue ne servait à rien.
  const liste = appli.plansRevue ?? []
  const ici = liste.findIndex((x) => x.numero === p.numero)
  $('btnPlanPrecedent').disabled = ici <= 0
  $('btnPlanSuivant').disabled = ici < 0 || ici >= liste.length - 1

  ouvreVoile('voilePlan', 'btnFermePlan')
}

/** Le plan d'à côté, quand il existe. */
function voisinDuPlan(pas) {
  const liste = appli.plansRevue ?? []
  const ici = liste.findIndex((x) => x.numero === planOuvert?.numero)
  return ici < 0 ? null : (liste[ici + pas] ?? null)
}

function vaAuPlan(pas) {
  const v = voisinDuPlan(pas)
  if (v) ouvreLePlan(v)
}

$('btnPlanPrecedent').addEventListener('click', () => vaAuPlan(-1))
$('btnPlanSuivant').addEventListener('click', () => vaAuPlan(1))

// LES FLÈCHES DU CLAVIER FONT LE MÊME TRAVAIL.
//
// C'est le geste de qui regarde une série d'images, et il ne s'apprend pas : on
// l'essaie. Ne rien faire aurait laissé croire que le panneau ne sait pas
// enchaîner. On ne le prend que quand le panneau est ouvert et qu'on ne tape pas
// dans un champ.
document.addEventListener('keydown', (ev) => {
  if ($('voilePlan').hidden) return
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
  const cible = ev.target
  if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return
  ev.preventDefault()
  vaAuPlan(ev.key === 'ArrowRight' ? 1 : -1)
})

$('btnFermePlan').addEventListener('click', () => fermeVoile('voilePlan'))

$('btnAutrePexels').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Recherche…', async () => {
    const n = planOuvert?.numero
    fermeVoile('voilePlan')
    if (n) await remplaceUnPlanDeCoupe(n, 'pexels')
  })
)

$('btnAutreIa').addEventListener('click', async (ev) => {
  // Retenu avant la confirmation : `currentTarget` sera nul après l'await.
  const bouton = ev.currentTarget
  const p = planOuvert
  if (!p) return
  // UN APPEL PAYANT S'ANNONCE AVANT DE PARTIR — §2 du CLAUDE.md.
  // LE PRIX VIENT DU MODELE RETENU, il n'est plus ecrit en dur.
  //
  // Il disait 0,18 $ quel que soit le modele. Les tarifs vont de 0,04 $ a
  // 2,36 $ le plan de cinq secondes : sur Seedance, on aurait fait accepter
  // treize fois la somme annoncee.
  if (appli.modelesVideo === undefined) {
    try { appli.modelesVideo = await api('/api/modeles-video') } catch { appli.modelesVideo = null }
  }
  const cat = appli.modelesVideo
  const mv = cat?.modeles?.find((x) => x.format === cat.retenu) ?? null
  const ok = await demandeConfirmation({
    titre: `Générer ce plan par IA ?`,
    quoi:
      (mv
        ? `${mv.nom} — environ ${mv.usd5s.toFixed(2)} $ sur ton solde fal, `
        : `Un plan payant sur ton solde fal, `) +
      `et une à trois minutes d'attente.\n\n` +
      `Prompt : « ${p.requete} »\n\n` +
      `La banque d'images est gratuite et instantanée — l'IA sert quand aucune ` +
      `banque ne tient la scène.`,
    action: 'Générer',
  })
  if (!ok) return
  fermeVoile('voilePlan')
  await pendant(bouton, 'Génération…', () => remplaceUnPlanDeCoupe(p.numero, 'ia'))
})

$('btnEffacePlans').addEventListener('click', async (ev) => {
  const bouton = ev.currentTarget
  const ok = await demandeConfirmation({
    titre: `Effacer tous les plans de coupe ?`,
    quoi:
      `Le plan de montage et les clips téléchargés sont SUPPRIMÉS — pas mis de côté.

` +
      `Gardés : tes réglages de sous-titres, la coupe, et la voix convertie. ` +
      `Rien de payant n'est à refaire.

` +
      `Tu repars à l'étape 6 sur une piste image vide.`,
    action: 'Effacer',
  })
  if (!ok) return
  await pendant(bouton, 'Effacement…', async () => {
    const vue = await mene(() =>
      api(`/api/videos/${encodeURIComponent(appli.slug)}/plans`, { methode: 'DELETE' })
    )
    if (!vue) return
    const r = vue.resultat ?? {}
    await rafraichitEtat()
    annonce(`${r.plans ?? 0} plans effacés — ${r.mo ?? 0} Mo libérés. Les sous-titres sont gardés.`, 'ok')
  })
})

$('btnLisibilite').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Mesure…', async () => {
    const vue = await mene(() =>
      api(`/api/videos/${encodeURIComponent(appli.slug)}/lisibilite`, { methode: 'POST' })
    )
    if (vue?.etat !== 'fini') return
    const r = vue.resultat ?? {}
    await rafraichitEtat()
    annonce(
      r.clairs?.length
        ? `${r.clairs.length} plan(s) trop clairs pour un texte blanc — ils sont marqués ci-dessous.`
        : `${r.mesures ?? 0} plans mesurés : le texte se détachera partout.`,
      r.clairs?.length ? 'erreur' : 'ok'
    )
  })
)

$('btnPlans').addEventListener('click', async () => {
  $('btnPlans').disabled = true
  try {
    // CETTE ROUTE PEUT ÊTRE PAYANTE, ET `api` NE SAIT PAS L'ENTENDRE.
    //
    // `--depuis=cale` est gratuit tant que `voix-finale.wav` existe. Quand il
    // manque — le cas exact du second poste décrit dans CLAUDE.md §4 — le
    // serveur répond 402 avec un devis. `api` lève alors `BesoinAccord`, que le
    // `catch` de `mene` attrapait comme une erreur ordinaire : le bandeau
    // affichait « il faut le confirmer » et le dialogue ne s'ouvrait jamais.
    // Le bouton ne pouvait pas aboutir.
    const vue = await mene(
      () => apiPayante(`/api/videos/${encodeURIComponent(appli.slug)}/plans`, {
        ouvertureIa: modeDeLaVideo() === 'mixte' && $('estOuvertureIa').checked,
        // LE BUDGET EST LE RÉGLAGE, ET IL VAUT ZÉRO HORS CRÉATION ASSISTÉE.
        //
        // « Création assistée » veut dire : le script est lu, la génération va
        // aux passages qu'une banque d'images ne peut pas servir, et ce qui
        // reste du budget comble les trous. Le couper, c'est repasser en
        // création simple — et ça se lit sur la carte retenue.
        plansIa: modeDeLaVideo() === 'mixte' ? budgetIa() : 0,
        modeleVideo: $('planModeleVideo').value || undefined,
        refaisPlans: $('estRefaisPlans').checked,
      }),
      { refus: `Montage annulé — rien n'a été facturé.` }
    )
    if (vue?.etat === 'fini') {
      annonce(`Montage construit.`, 'ok')
      avanceApres('plan')
    }
  } finally {
    $('btnPlans').disabled = false
  }
})

// ---------------------------------------------------------------------------
//  Étape 7 — le rendu
// ---------------------------------------------------------------------------

function dessineRendu() {
  const rendu = appli.etat?.etapes?.rendu
  const fiche = $('ficheRendu')
  const lecteur = $('lecteurMaster')
  const lien = $('lienMaster')

  if (!rendu || rendu.verdict === 'absent') {
    fiche.hidden = true; lecteur.hidden = true; $('sortiesMaster').hidden = true
    return
  }
  // Le master garde son chemin d'un rendu à l'autre : sans le `?v=`, le lecteur
  // rejoue l'ancien fichier tiré du cache, et on croit que le rendu n'a rien
  // changé.
  const url = `${urlMedia(appli.slug, rendu.chemin)}?v=${encodeURIComponent(rendu.modifie_le ?? '')}`

  fiche.replaceChildren()
  const p = creer('p', 'titre-fiche')
  p.textContent = rendu.verdict === 'perime'
    ? `Master plus ancien que le plan — relance le rendu.`
    : `Master à jour.`
  const note = creer('p', 'note')
  note.textContent = `${rendu.poidsMo} Mo · ${chrono((rendu.dureeS ?? 0) * 1000)}`
  fiche.append(p, note)
  fiche.hidden = false

  // On ne repose la source que si elle a changé : cette fonction est appelée à
  // chaque entrée dans l'étape, et réécrire `src` rembobinerait le master qu'on
  // était en train de regarder.
  if (lecteur.getAttribute('src') !== url) {
    lecteur.src = url
    lecteur.load()
  }
  lecteur.hidden = false
  lien.href = url
  $('sortiesMaster').hidden = false
  majLeDrive().catch(() => { /* le bouton reste caché, c'est tout */ })
}

// ---------------------------------------------------------------------------
//  Le Drive de la chaîne
// ---------------------------------------------------------------------------
//
// LE BOUTON N'APPARAÎT QUE QUAND IL PEUT MARCHER.
//
// Trois choses doivent être en place : les identifiants OAuth, l'autorisation
// de ce poste, et le dossier de la chaîne. Un bouton qui échoue en annonçant
// « pas connecté » aurait été un bouton qui ment sur ce qu'il fait ; on affiche
// à la place la commande exacte qui débloque, parce qu'elle se tape une fois et
// qu'elle ouvre un écran de consentement — ça ne se pilote pas depuis une page.

async function majLeDrive() {
  const bouton = $('btnDrive')
  const note = $('noteDrive')
  bouton.hidden = true
  note.textContent = ''
  try {
    const r = await api('/api/drive')
    const d = r.resultat
    if (!d) return
    if (d.pret) {
      bouton.hidden = false
      bouton.title = `Dépose le master dans « ${d.dossier.nom} »`
      note.textContent = `→ ${d.dossier.nom}`
      return
    }
    // Un jeton PÉRIMÉ n'est pas la même chose qu'un poste jamais autorisé, et le
    // dire évite de chercher au mauvais endroit : l'application OAuth est en
    // mode Test, ses jetons durent sept jours, et la seule réponse est de
    // relancer la même commande.
    note.textContent = !d.configure
      ? `Drive non configuré — npm run drive -- --aide`
      : d.jeton_perime
        ? `Jeton expiré (7 jours en mode Test) — npm run drive -- --connecte`
        : !d.connecte
          ? `Ce poste n'est pas autorisé — npm run drive -- --connecte`
          : `Pas de dossier Drive pour cette chaîne.`

    // CREER LE DOSSIER EST UN GESTE, PAS UNE DECISION — donc un bouton.
    //
    // La portee `drive.file` ne permet pas d'ecrire dans un dossier cree a la
    // main dont on collerait l'identifiant : c'est la commande qui doit le
    // creer, une fois. Rien a juger, rien a nommer. La CONNEXION reste au
    // terminal, elle : elle ouvre un ecran de consentement Google, et un
    // navigateur qu'on pilote depuis un bouton n'est pas un consentement.
    if (d.connecte && !d.jeton_perime && !d.dossier) {
      const b = creer('button', 'bouton minuscule primaire')
      b.type = 'button'
      b.textContent = `Créer le dossier`
      b.addEventListener('click', (ev) =>
        pendant(ev.currentTarget, 'Création…', async () => {
          const vue = await mene(() => api('/api/drive/dossier', { methode: 'POST' }))
          if (vue?.etat === 'fini') {
            annonce(`Dossier Drive créé pour cette chaîne.`, 'ok')
            majLeDrive().catch(() => {})
          }
        })
      )
      note.append(' ', b)
    }
  } catch {
    // Le Drive est facultatif : son absence ne doit rien casser ici.
  }
}

$('btnDrive').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Envoi…', async () => {
    const vue = await mene(() =>
      api(`/api/videos/${encodeURIComponent(appli.slug)}/drive`, { methode: 'POST' })
    )
    if (!vue || vue.etat === 'echec') return
    // Le lien du fichier déposé est dans le journal de la commande : on le
    // remonte, sinon il faut aller le chercher dans Drive à la main.
    const lien = (derniereSortie(vue) ?? '').match(/https:\/\/drive\.google\.com\/\S+/)?.[0]
    if (lien) {
      const a = creer('a')
      a.href = lien
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = 'ouvrir dans Drive'
      $('noteDrive').replaceChildren(document.createTextNode('Déposé — '), a)
    }
    annonce(`Master déposé dans le Drive de la chaîne.`, 'ok')
  })
)

/** Tout ce que la commande a écrit, pour y repêcher un lien. */
function derniereSortie(vue) {
  return (vue?.lignes ?? []).map((l) => (typeof l === 'string' ? l : l?.texte ?? '')).join('\n')
}

$('btnRendu').addEventListener('click', () => pendant($('btnRendu'), 'Rendu…', async () => {
  // TROIS SECONDES AVANT HUIT MINUTES.
  //
  // La route acceptait déjà un extrait et aucun bouton ne le demandait, alors
  // que CLAUDE.md §12 prescrit de rendre trois secondes d'essai avant tout
  // rendu complet. Quatre-vingt-dix images à partir de la dixième seconde :
  // assez pour juger le style, le calage et l'étalonnage.
  const extrait = $('estExtrait').checked ? '300-389' : null
  const brouillon = $('estBrouillon').checked

  // On garde le chemin annoncé par le serveur : un extrait et un brouillon
  // n'écrivent pas sur le master, et sans lui l'écran n'a rien à montrer.
  let fichier = null
  const vue = await mene(() =>
    api(`/api/videos/${encodeURIComponent(appli.slug)}/rendu`, {
      methode: 'POST',
      corps: { brouillon, ...(extrait ? { extrait } : {}) },
    }).then((r) => { fichier = r?.fichier ?? null; return r })
  )
  if (vue?.etat !== 'fini') return

  if (!fichier) {
    // Le master vient d'être réécrit : sa fiche, son poids et sa date changent,
    // et le lecteur doit repartir sur le nouveau fichier plutôt que sur celui
    // que le navigateur garde en cache.
    await rafraichitEtat()
    annonce(`Rendu terminé.`, 'ok')
    return
  }
  // UN ESSAI QU'ON NE VOIT PAS N'A PAS ÉTÉ FAIT.
  //
  // On lisait « Extrait rendu — le master n'a pas bougé », l'écran restait vide
  // et on cherchait la vidéo. Elle était sur le disque, sous un autre nom, et
  // rien ne la montrait. Elle se joue maintenant sous le bouton.
  $('nomEssaiRendu').textContent = extrait
    ? `Extrait de contrôle — 3 s. Le master complet n'a pas été produit.`
    : `Brouillon — moitié de définition, sans étalonnage. Le master n'a pas bougé.`
  const lecteur = $('lecteurEssai')
  lecteur.src = `${urlMedia(appli.slug, fichier)}?v=${Date.now()}`
  $('essaiRendu').hidden = false
  annonce(extrait ? `Extrait rendu — le master n'a pas bougé.` : `Brouillon rendu.`, 'ok')
}))

// ===========================================================================
//  ÉTAPE 5 — LE STUDIO DES SOUS-TITRES
// ===========================================================================

/*
 * L'APERÇU EST UNE MAQUETTE, ET SA VALEUR TIENT ENTIÈREMENT À SA FIDÉLITÉ.
 *
 * Il ne rend pas la vidéo : il rejoue la même scène en HTML/CSS, aux dimensions
 * réelles, sur les VRAIS horodatages mot à mot de `04-transcript.json`. C'est ce
 * qui le rend gratuit et instantané — un curseur se juge à l'œil, sans attendre
 * huit minutes de rendu et sans rien dépenser.
 *
 * Le prix de ce choix est une duplication : la pagination et le style existent
 * ici ET dans `remotion/src/components/SousTitres.tsx`. Elle est assumée, mais
 * elle n'est tenable qu'à une condition, écrite des deux côtés : QUAND L'UN
 * CHANGE, L'AUTRE CHANGE DANS LE MÊME GESTE. Un aperçu qui ment est pire que pas
 * d'aperçu du tout, parce qu'on lui fait confiance.
 */

// --- Portage littéral de `pagine()` et de ses constantes -------------------
const SILENCE_QUI_COUPE_MS = 350
const DUREE_MAX_PAGE_MS = 3500
const CARACTERES_MAX_PAGE = 42
const TENUE_MAX_MS = 2000
const FIN_DE_PHRASE = /[.!?…:]$/
const VIRGULE = /,$/

const MOTS_OUTILS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'au', 'aux', 'et',
  'ou', 'que', 'qui', 'dont', 'ne', 'se', 'ce', 'ces', 'cet', 'cette', 'en',
  'y', 'sur', 'dans', 'pour', 'par', 'sans', 'sous', 'si', 'mais', 'donc',
  'alors', 'quand', 'comme', 'avec', 'entre', 'vers', 'chez', 'est', 'sont',
  'ont', 'leur', 'leurs', 'son', 'sa', 'ses', 'notre', 'nos', 'plus', 'tres',
  'il', 'elle', 'on', 'ils', 'elles', 'nous', 'vous', 'je', 'tu', 'lui',
  'meme', 'quelque', 'tout', 'toute', 'tous', 'toutes', 'chaque', 'autre',
])

function estMotOutil(texte) {
  const nu = texte
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z']/g, '')
  if (MOTS_OUTILS.has(nu.replace(/'/g, ''))) return true
  return /^(qu|l|d|n|s|c|j|t|m)'/.test(nu) && nu.length <= 5
}

function pagine(mots, motsParPage) {
  const pages = []
  let courante = []
  const ferme = () => {
    if (!courante.length) return
    pages.push({ mots: courante, debutMs: courante[0].debutMs, finMs: courante.at(-1).finMs })
    courante = []
  }

  for (let i = 0; i < mots.length; i++) {
    const mot = mots[i]
    const precedent = courante.at(-1)
    if (precedent && mot.debutMs - precedent.finMs > SILENCE_QUI_COUPE_MS) ferme()
    courante.push(mot)

    const suivant = mots[i + 1]
    const suivantClot =
      suivant &&
      (FIN_DE_PHRASE.test(suivant.texte) || VIRGULE.test(suivant.texte)) &&
      suivant.debutMs - mot.finMs <= SILENCE_QUI_COUPE_MS

    const dureePage = mot.finMs - courante[0].debutMs
    const largeurPage = courante.reduce((n, m) => n + m.texte.length + 1, -1)

    if (FIN_DE_PHRASE.test(mot.texte) || VIRGULE.test(mot.texte)) ferme()
    else if (dureePage >= DUREE_MAX_PAGE_MS) ferme()
    else if (largeurPage >= CARACTERES_MAX_PAGE) ferme()
    else if (courante.length >= motsParPage && !estMotOutil(mot.texte) && !suivantClot) ferme()
    else if (courante.length >= motsParPage + 2 && !suivantClot) ferme()
    else if (courante.length >= motsParPage + 3) ferme()
  }
  ferme()
  return pages
}

const nettoieMot = (t) => t.replace(/[.,;:…]+$/g, '')
const casseMot = (t, mode) => (mode === 'majuscules' ? t.toLocaleUpperCase('fr-FR') : t)

/**
 * LE CONTOUR : LE MÊME CALCUL EXISTE DANS remotion/src/components/SousTitres.tsx.
 *
 * `-webkit-text-stroke` trace une vraie bordure suivant le glyphe, et
 * `paint-order: stroke fill` remet le remplissage par-dessus pour qu'elle ne
 * morde pas la lettre. Le facteur 0,23 vient de la sortie ASS de Scriptshort
 * (contour extérieur de 10 px sur un corps de 78), doublé parce qu'un tracé CSS
 * est centré sur le chemin.
 *
 * Les deux implémentations doivent rester alignées : même facteur, même
 * `paint-order`, même multiplication par `epaisseurContour`. Si l'une des deux
 * change, changer l'autre dans le même geste — sinon l'aperçu ment sur la seule
 * chose qu'on lui demande de montrer.
 */
const EPAISSEUR_CONTOUR = 0.23
const OMBRE_PORTEE = '0 3px 10px rgba(0,0,0,0.55)'

/**
 * L'INTERLIGNE, ÉCRIT DES DEUX CÔTÉS — VALEUR JUMELLE DE `SousTitres.tsx`.
 *
 * Le bloc n'en déclarait aucun : il héritait le 1,6 du corps de la page, quand
 * le rendu laissait la police décider (1,17 pour Roboto). Sur une page de deux
 * lignes, l'aperçu écartait donc les lignes de 1,94 corps contre 1,51 au
 * rendu — gouttière comprise. Le seul écran dont le métier est de montrer le
 * formatage se trompait de moitié dessus.
 */
const INTERLIGNE = 1.15

/**
 * `theme.rayon` du plan n'est pas exposé par l'API des réglages : la pastille de
 * l'aperçu utilise donc la valeur par défaut de la chaîne. Un écart de deux ou
 * trois pixels sur un arrondi ne change aucune décision de style.
 */
const RAYON_PASTILLE = 14

/** Les substituts, quand la famille n'est pas installée sur le poste. */
const REPLI_POLICE = {
  Anton: `'Anton', Impact, Haettenschweiler, 'Arial Narrow', sans-serif`,
  ArchivoBlack: `'ArchivoBlack', 'Arial Black', Impact, sans-serif`,
  Fraunces: `'Fraunces', Georgia, 'Times New Roman', serif`,
  Inter: `'Inter', 'Segoe UI', system-ui, sans-serif`,
  Montserrat: `'Montserrat', 'Segoe UI', system-ui, sans-serif`,
  Nunito: `'Nunito', 'Segoe UI', system-ui, sans-serif`,
  OpenSans: `'OpenSans', 'Segoe UI', system-ui, sans-serif`,
  Poppins: `'Poppins', 'Segoe UI', system-ui, sans-serif`,
  Roboto: `'Roboto', 'Segoe UI', system-ui, sans-serif`,
}
const familleCss = (nom) => REPLI_POLICE[nom] ?? `'${nom}', 'Segoe UI', system-ui, sans-serif`

/*
 * IL Y AVAIT ICI `policeDisponible`, QUI MESURAIT UNE LARGEUR AU CANVAS.
 *
 * Elle comparait un échantillon dessiné avec et sans la famille : une largeur
 * qui bouge prouvait que la police avait servi. C'était le seul test possible
 * tant que les polices venaient du POSTE, `document.fonts.check()` répondant
 * « oui » pour une famille inconnue dès qu'un repli sait dessiner.
 *
 * Depuis que l'atelier sert `assets/fonts/`, la question a une réponse
 * autrement plus simple et jamais fausse : la liste des fichiers du dossier.
 * Voir `majAlertePolice`.
 */

// --- Chargement du studio --------------------------------------------------

/** Relit tout depuis le serveur, meme si le studio est deja charge. */
async function rechargeLeStudio() {
  appli.st = null
  await chargeLeStudio()
}

async function chargeLeStudio() {
  const studio = $('studio')

  // PAS DE TRANSCRIPT N'EST PAS UNE ERREUR, C'EST UN MOMENT DE LA PRODUCTION.
  //
  // On redessine chaque étape même bloquée, pour ne pas laisser le contenu de la
  // vidéo précédente à l'écran. Le studio en profitait pour aller chercher un
  // transcript qui ne peut pas exister avant la transcription, recevait un 404,
  // et affichait « Fichier absent. » en rouge tout en haut — un message qui ne
  // dit ni quel fichier, ni quoi faire, et qui donne l'impression que quelque
  // chose s'est cassé alors que rien n'a même commencé. Le blocage de l'étape
  // dit déjà ce qu'il manque : on se contente de ne rien charger.
  if (appli.etat?.etapes?.transcript?.verdict === 'absent') {
    appli.st = null
    studio.hidden = true
    return
  }

  // ON NE REPREND L'ÉTAT EN MÉMOIRE QUE S'IL PORTE ENCORE QUELQUE CHOSE.
  //
  // Le raccourci « même slug, on réaffiche » supposait qu'un studio déjà chargé
  // reste valide. Il peut ne plus l'être : un chargement interrompu à mi-course
  // laisse `appli.st` posé avec zéro mot, et on revient alors sur un écran vide
  // que plus rien ne recharge — le raccourci se déclenche à chaque retour et
  // court-circuite la relecture. On vérifie donc qu'il y a de la matière.
  // LE STUDIO SE PÉRIME AVEC L'AUDIO DONT IL VIENT.
  //
  // Refaire la voix réécrit `voix-finale.wav` ET retranscrit : les mots, leurs
  // instants, tout change. Le studio gardait pourtant en mémoire ceux d'avant
  // et se contentait de se réafficher — on réglait donc des sous-titres calés
  // sur un audio qui n'existait plus. On compare la version de l'audio, et on
  // relit tout dès qu'elle bouge.
  const versionAudio = appli.etat?.etapes?.audio?.modifie_le ?? null
  if (appli.st?.slug === appli.slug && appli.st.mots?.length && appli.st.versionAudio === versionAudio) {
    studio.hidden = false
    // SI LA BOUCLE TOURNE DÉJÀ, ON NE TOUCHE À RIEN.
    //
    // Cette fonction est rappelée à chaque redessin de l'étape — et l'étape se
    // redessine toute seule dès que l'état bouge sur le disque, donc après
    // chaque correction de sous-titre. Relancer l'aperçu coupait alors le son
    // pour le reprendre aussitôt : un hoquet à chaque enregistrement, pendant
    // qu'on écoute précisément pour juger le calage.
    //
    // `apercu.raf` dit tout : il est mis à `null` par `arreteLApercu()`, que
    // `montre()` appelle en quittant l'étape. Non nul = on n'est jamais parti.
    if (apercu.raf) return
    // On revient sur une etape deja chargee : la lecture reprend ou elle en
    // etait, pas au premier sous-titre.
    relanceLApercu({ gardeLaPosition: true })
    return
  }
  if (appli.st?.slug === appli.slug) appli.st = null

  studio.hidden = true
  annonce(`Chargement…`)
  try {
    const [reponse, transcript] = await Promise.all([
      api(`/api/videos/${encodeURIComponent(appli.slug)}/soustitres`),
      api(`/api/videos/${encodeURIComponent(appli.slug)}/transcript`, { brut: true }),
    ])
    const r = reponse.resultat
    appli.st = {
      slug: appli.slug,
      // La version de l'audio dont ces mots viennent : elle décide si ce
      // studio est encore valable la prochaine fois qu'on revient dessus.
      versionAudio: appli.etat?.etapes?.audio?.modifie_le ?? null,
      reglages: { ...r.reglages },
      origine: r.origine,
      modeles: r.modeles,
      bornes: r.bornes,
      polices: r.polices?.length ? r.polices : appli.polices,
      modeleRetenu: r.modele ?? null,
      mots: (transcript.mots ?? []).filter((m) => m && m.texte && Number.isFinite(m.debutMs)),
      attente: null,
      enVol: false,
    }
    annonce('')
  } catch (e) {
    annonce(e.message, 'erreur')
    return
  }

  batisLesModeles()
  batisLesPolices()
  poseLesBornes()
  versLesControles()
  poseLesRetours()
  dessineLesFavoris()
  studio.hidden = false
  relanceLApercu()
  dessineLeTexte()
}

/**
 * Les onze modèles, dans une liste déroulante.
 *
 * Ils étaient onze pavés en grille. Ils occupaient la moitié de la colonne pour
 * un choix qu'on fait UNE FOIS puis qu'on affine au curseur — et ils
 * repoussaient les couleurs et les tailles hors de l'écran, sur la seule page
 * où l'on veut tout voir d'un coup.
 *
 * Ce que les vignettes apportaient — la description, et la couleur de
 * surlignage lisible avant le nom — n'est pas perdu : la description passe sous
 * la liste, et le nom de chaque entrée la porte déjà.
 */
function batisLesModeles() {
  const sel = $('stModele')
  sel.replaceChildren()
  const aucun = creer('option')
  aucun.value = ''
  aucun.textContent = 'Réglages personnalisés'
  sel.append(aucun)
  for (const [cle, m] of Object.entries(appli.st.modeles)) {
    const o = creer('option')
    o.value = cle
    o.textContent = m.libelle
    sel.append(o)
  }
  // L'ÉCOUTEUR NE SE POSE PLUS ICI : IL S'EMPILAIT.
  //
  // `batisLesModeles` est rappelée à chaque rechargement du studio, et
  // `replaceChildren` ne remplace que les options — les écouteurs du `select`
  // survivaient. Après deux corrections de texte, choisir un modèle relançait
  // l'aperçu trois fois. Il est posé une seule fois, plus bas.
  marqueLeModele()
}

function marqueLeModele() {
  const sel = $('stModele')
  sel.value = appli.st.modeleRetenu ?? ''
  const m = appli.st.modeles[appli.st.modeleRetenu]
  $('noteModele').textContent = m ? m.note : ''
}

/**
 * Chaque famille écrite DANS sa propre police.
 *
 * Un nom de police en Segoe UI ne dit rien du dessin qu'on choisit : on ouvrait
 * la liste, on lisait neuf mots identiques, et on décidait à l'aveugle. C'est
 * aussi le seul autotest honnête de cet écran — si les neuf entrées s'affichent
 * toutes pareil, les fichiers d'`assets/fonts/` ne sont pas arrivés, et
 * l'aperçu ment quoi qu'on choisisse.
 */
function batisLesPolices() {
  const sel = $('stPolice')
  sel.replaceChildren()
  for (const p of appli.st.polices) {
    const o = creer('option')
    o.value = p
    o.textContent = p
    o.style.fontFamily = familleCss(p)
    sel.append(o)
  }
}

function poseLesBornes() {
  for (const [champ, id] of [
    ['motsParPage', 'stMotsParPage'], ['taille', 'stTaille'],
    ['positionBas', 'stPositionBas'], ['epaisseurContour', 'stEpaisseurContour'],
  ]) {
    const b = appli.st.bornes[champ]
    if (!b) continue
    const e = $(id)
    e.min = b.min; e.max = b.max; e.step = b.pas
  }
}

/** Les réglages → les contrôles. */
function versLesControles() {
  const r = appli.st.reglages
  $('stStyle').value = r.style
  $('stPolice').value = r.police
  $('stAnimation').value = r.animation
  $('stMotsParPage').value = r.motsParPage
  $('stTaille').value = r.taille
  $('stPositionBas').value = r.positionBas
  $('stEpaisseurContour').value = r.epaisseurContour
  $('stCouleurTexte').value = r.couleurTexte
  $('stCouleurSurligne').value = r.couleurSurligne
  $('stCouleurContour').value = r.couleurContour
  $('stCouleurTexteHex').value = String(r.couleurTexte).toUpperCase()
  $('stCouleurSurligneHex').value = String(r.couleurSurligne).toUpperCase()
  $('stCouleurContourHex').value = String(r.couleurContour).toUpperCase()
  $('stCasse').checked = r.casse === 'majuscules'
  $('stPonctuation').checked = Boolean(r.ponctuation)
  $('stContour').checked = Boolean(r.contour)
  majLesValeurs()
  majAlertePolice()
}

function majLesValeurs() {
  const r = appli.st.reglages
  $('valMotsParPage').textContent = r.motsParPage
  $('valTaille').textContent = r.taille
  $('valPositionBas').textContent = r.positionBas
  $('valEpaisseurContour').textContent = Number(r.epaisseurContour).toFixed(2).replace(/\.?0+$/, '')
}

/**
 * La famille choisie est-elle réellement embarquée par la chaîne ?
 *
 * LA MESURE AU CANVAS NE POUVAIT PAS RÉPONDRE, ET ELLE MENTAIT.
 *
 * Elle comparait la largeur d'un échantillon avec et sans la famille : une
 * différence prouvait que la police dessinait. C'était le seul test possible
 * tant que les polices venaient du POSTE. Depuis que l'atelier sert
 * `assets/fonts/`, elles arrivent par le réseau, et `font-display: block`
 * retarde leur premier tracé — la mesure tombait donc pendant le chargement et
 * concluait « absente » sur une police parfaitement présente. L'écran
 * affichait un avertissement faux sur Montserrat, la police de la chaîne.
 *
 * La bonne réponse ne se mesure pas, elle se lit : `policesDisponibles()` liste
 * les fichiers d'`assets/fonts/`, et c'est exactement ce que le rendu embarque.
 */
function majAlertePolice() {
  const famille = appli.st.reglages.police
  const dispo = (appli.st.polices ?? []).includes(famille)
  const zone = $('alertePolice')
  zone.hidden = dispo
  if (dispo) return
  // L'atelier sert désormais `assets/fonts/` : une famille indisponible ici est
  // donc une famille que la CHAÎNE n'embarque pas, et le rendu aura le même
  // problème. L'avertissement ne parle plus d'un défaut d'aperçu — il parle
  // d'un fichier manquant, ce qui appelle une action différente.
  zone.textContent =
    `« ${famille} » n'est pas dans assets/fonts/ : ni l'aperçu ni le rendu ne ` +
    `pourront la dessiner, et le texte sortira dans une police de repli. ` +
    `Choisis-en une autre, ou dépose le fichier .ttf dans assets/fonts/.`
}

// --- Les contrôles ---------------------------------------------------------

/**
 * Deux vitesses, et c'est tout le principe.
 *
 * `input` redessine l'aperçu à chaque pixel du curseur — gratuit, local,
 * immédiat. `change` seul déclenche l'enregistrement, donc au relâchement, et
 * encore débouncé : traîner un curseur ne doit pas lancer quarante commandes.
 */
const CONTROLES = [
  ['stStyle', 'style', (e) => e.value],
  ['stPolice', 'police', (e) => e.value],
  ['stAnimation', 'animation', (e) => e.value],
  ['stMotsParPage', 'motsParPage', (e) => Number(e.value)],
  ['stTaille', 'taille', (e) => Number(e.value)],
  ['stPositionBas', 'positionBas', (e) => Number(e.value)],
  ['stEpaisseurContour', 'epaisseurContour', (e) => Number(e.value)],
  ['stCasse', 'casse', (e) => (e.checked ? 'majuscules' : 'normale')],
  ['stPonctuation', 'ponctuation', (e) => e.checked],
  ['stContour', 'contour', (e) => e.checked],
]

for (const [id, champ, lis] of CONTROLES) {
  const e = $(id)
  e.addEventListener('input', () => {
    if (!appli.st) return
    appli.st.reglages[champ] = lis(e)
    majLesValeurs()
    if (champ === 'police') majAlertePolice()
    // Changer la pagination ou le texte affiché refait les pages ; le reste ne
    // touche qu'au style, qui se réapplique sans rebâtir la timeline.
    // LA LISTE DE TEXTE NE SE RECONSTRUIT PLUS À CHAQUE PIXEL.
    //
    // Traîner « mots par ligne » rebâtissait les deux cents zones de texte
    // soixante fois par seconde, chacune avec une lecture de `scrollHeight`
    // après écriture de `height` — deux cents recalculs de mise en page forcés
    // par image. Le seul écran qu'on règle à l'œil était le seul qui collait.
    //
    // L'aperçu, lui, suit chaque pixel : c'est lui qu'on regarde en traînant.
    // La liste se refait au relâchement, où l'attente ne se voit pas.
    // ET SANS BOUGER DE PLACE. Regler la pagination a 2:16 ramenait l apercu au
    // tout premier sous-titre, a chaque pixel du curseur : on reglait en
    // regardant le debut de la video, pas le passage qu on etait venu corriger.
    if (['motsParPage', 'ponctuation'].includes(champ)) relanceLApercu({ sansTexte: true, gardeLaPosition: true })
    // L'animation ne joue qu'à l'apparition d'une page : sans ce rejeu, choisir
    // « rebond » ne montre rien avant la page suivante — jusqu'à deux secondes
    // d'attente, qui se lisent comme un réglage qui ne marche pas.
    else if (champ === 'animation') { appliqueLeStyle(); rejoueLaPage() }
    else { appliqueLeStyle(); redessineMaintenant() }
  })
  e.addEventListener('change', () => {
    enregistre({ [champ]: appli.st.reglages[champ] })
    // Le découpage a bougé pendant la traînée : la liste se remet à jour ici,
    // une fois, plutôt qu'à chaque pixel.
    if (['motsParPage', 'ponctuation'].includes(champ) && $('listeSt').children.length) dessineLeTexte()
  })
}

// Le choix de modèle, posé UNE fois avec les autres contrôles — voir la note
// dans `batisLesModeles`.
$('stModele').addEventListener('change', () => {
  if (appli.st && $('stModele').value) appliqueLeModele($('stModele').value)
})

// --- Les couleurs et leurs favorites ---------------------------------------

const CHAMPS_COULEUR = [
  { champ: 'couleurTexte', pioche: 'stCouleurTexte', hexa: 'stCouleurTexteHex' },
  { champ: 'couleurSurligne', pioche: 'stCouleurSurligne', hexa: 'stCouleurSurligneHex' },
  { champ: 'couleurContour', pioche: 'stCouleurContour', hexa: 'stCouleurContourHex' },
]
let champCouleurActif = 'couleurSurligne'

function normeHexa(v) {
  let t = String(v ?? '').trim()
  if (t[0] !== '#') t = '#' + t
  if (/^#[0-9a-f]{3}$/i.test(t)) t = '#' + t.slice(1).split('').map((c) => c + c).join('')
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toUpperCase() : null
}

function activeLaCouleur(champ) {
  champCouleurActif = champ
  for (const g of document.querySelectorAll('.groupe.couleur')) {
    g.classList.toggle('active', g.dataset.champ === champ)
  }
}

function poseUneCouleur(champ, valeur, { enregistreAussi }) {
  const c = CHAMPS_COULEUR.find((x) => x.champ === champ)
  appli.st.reglages[champ] = valeur
  $(c.pioche).value = valeur
  $(c.hexa).value = valeur.toUpperCase()
  appliqueLeStyle()
  redessineMaintenant()
  if (enregistreAussi) enregistre({ [champ]: valeur })
}

for (const { champ, pioche, hexa } of CHAMPS_COULEUR) {
  $(pioche).addEventListener('focus', () => activeLaCouleur(champ))
  $(hexa).addEventListener('focus', () => activeLaCouleur(champ))
  $(pioche).addEventListener('input', () => {
    if (!appli.st) return
    activeLaCouleur(champ)
    poseUneCouleur(champ, $(pioche).value.toUpperCase(), { enregistreAussi: false })
  })
  $(pioche).addEventListener('change', () => enregistre({ [champ]: appli.st.reglages[champ] }))
  $(hexa).addEventListener('input', () => {
    if (!appli.st) return
    const n = normeHexa($(hexa).value)
    if (!n) return
    activeLaCouleur(champ)
    poseUneCouleur(champ, n, { enregistreAussi: true })
  })
  // Un champ laissé sur une saisie incomplète (« #ff ») doit revenir à la
  // valeur réelle, sinon on croit avoir posé une couleur qu'on n'a pas posée.
  $(hexa).addEventListener('blur', () => {
    if (appli.st) $(hexa).value = String(appli.st.reglages[champ]).toUpperCase()
  })
}
activeLaCouleur('couleurSurligne')

const CLE_FAVORIS = 'atelier.couleurs.favorites'
const FAVORIS_MAX = 24
const litFavoris = () => {
  try { return JSON.parse(localStorage.getItem(CLE_FAVORIS) ?? '[]') } catch { return [] }
}
const ecritFavoris = (a) => {
  try { localStorage.setItem(CLE_FAVORIS, JSON.stringify(a.slice(0, FAVORIS_MAX))) } catch { /* mode privé */ }
}

function dessineLesFavoris() {
  const zone = $('favoris')
  zone.replaceChildren()
  const favoris = litFavoris()
  if (!favoris.length) {
    const p = creer('span', 'vide')
    p.textContent = ''
    zone.append(p)
    return
  }
  favoris.forEach((couleur, i) => {
    const b = creer('button', 'favori')
    b.type = 'button'
    b.style.background = couleur
    b.title = couleur
    const x = creer('span', 'croix')
    x.textContent = '×'
    b.append(x)
    b.addEventListener('click', (e) => {
      if (e.target === x) {
        const a = litFavoris(); a.splice(i, 1); ecritFavoris(a); dessineLesFavoris()
        return
      }
      poseUneCouleur(champCouleurActif, couleur, { enregistreAussi: true })
    })
    zone.append(b)
  })
}

$('btnFavoriPlus').addEventListener('click', () => {
  if (!appli.st) return
  const couleur = String(appli.st.reglages[champCouleurActif]).toUpperCase()
  const a = litFavoris()
  if (!a.includes(couleur)) { a.unshift(couleur); ecritFavoris(a); dessineLesFavoris() }
})

// --- L'enregistrement, débouncé -------------------------------------------

let minuteurEnregistrement = null

function enregistre(champs) {
  if (!appli.st) return
  appli.st.attente = { ...(appli.st.attente ?? {}), ...champs }
  clearTimeout(minuteurEnregistrement)
  minuteurEnregistrement = setTimeout(envoieLesReglages, 400)
}

// ---------------------------------------------------------------------------
//  Revenir en arrière sur UN réglage
// ---------------------------------------------------------------------------
//
// UNE FLÈCHE N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À ANNULER.
//
// Elle ne s'affiche que sur les champs dont l'origine est « cette vidéo » —
// c'est-à-dire ceux qu'on a effectivement touchés. Les autres héritent déjà de
// la chaîne : leur mettre une flèche promettrait un retour en arrière qui ne
// changerait rien, et on cliquerait pour vérifier.
//
// Et elle OUBLIE le champ au lieu de lui réécrire sa valeur d'origine. La
// nuance décide de l'avenir : un champ réécrit est figé sur cette vidéo, un
// champ oublié suivra la chaîne le jour où elle changera d'avis.

function poseLesRetours() {
  if (!appli.st) return
  for (const groupe of document.querySelectorAll('.studio .groupe[data-champ]')) {
    const champ = groupe.dataset.champ
    let flèche = groupe.querySelector('.retour')
    if (!flèche) {
      flèche = creer('button', 'retour')
      flèche.type = 'button'
      flèche.textContent = '↺'
      flèche.title = `Rendre ce réglage au défaut de la chaîne`
      flèche.addEventListener('click', () => rendLeChamp(champ))
      ;(groupe.querySelector('.etiquette') ?? groupe).append(flèche)
    }
    flèche.hidden = appli.st.origine?.[champ] !== 'cette vidéo'
  }
}

async function rendLeChamp(champ) {
  if (!appli.st) return
  try {
    const r = await api(`/api/videos/${encodeURIComponent(appli.st.slug)}/soustitres/oublie`, {
      methode: 'POST', corps: { champs: [champ] },
    })
    const resultat = r.resultat
    if (!resultat) return
    appli.st.reglages = { ...resultat.reglages }
    appli.st.origine = resultat.origine
    // Les curseurs portent encore l'ancienne valeur : on les redessine depuis
    // les réglages effectifs, sinon l'écran montre autre chose que le disque.
    versLesControles()
    poseLesRetours()
    relanceLApercu({ gardeLaPosition: true })
    annonce('')
  } catch (e) {
    annonce(e.message, 'erreur')
  }
}

$('btnDefautChaine').addEventListener('click', async (ev) => {
  // Idem : on garde le bouton avant d'attendre quoi que ce soit.
  const bouton = ev.currentTarget
  if (!appli.st) return
  const ok = await demandeConfirmation({
    titre: `En faire le défaut de la chaîne ?`,
    quoi:
      `Les réglages affichés seront écrits dans config/chaine.json.\n\n` +
      `Toutes les vidéos qui n'ont pas de réglage propre les suivront — ` +
      `y compris celles déjà montées, au prochain rendu.`,
    action: 'Enregistrer',
  })
  if (!ok) return
  await pendant(bouton, 'Enregistrement…', async () => {
    try {
      await api(`/api/videos/${encodeURIComponent(appli.st.slug)}/soustitres/defaut`, {
        methode: 'POST',
      })
      annonce(`Défaut de la chaîne mis à jour.`, 'ok')
    } catch (e) {
      annonce(e.message, 'erreur')
    }
  })
})

async function envoieLesReglages() {
  if (!appli.st || appli.st.enVol) return
  const champs = appli.st.attente
  if (!champs || !Object.keys(champs).length) return
  appli.st.attente = null
  appli.st.enVol = true
  try {
    const r = await api(`/api/videos/${encodeURIComponent(appli.st.slug)}/soustitres`, {
      methode: 'PUT', corps: { champs },
    })
    const resultat = r.resultat
    if (resultat) {
      appli.st.origine = resultat.origine
      appli.st.modeleRetenu = resultat.modele ?? appli.st.modeleRetenu
          marqueLeModele()
      poseLesRetours()
      if (resultat.reproches?.length) annonce(resultat.reproches.join('\n'), 'erreur')
      else annonce('')
    }
  } catch (e) {
    annonce(e.message, 'erreur')
  } finally {
    appli.st.enVol = false
    // Une modification arrivée pendant l'envoi ne doit pas se perdre.
    if (appli.st.attente) envoieLesReglages()
  }
}

async function appliqueLeModele(cle) {
  const m = appli.st.modeles[cle]
  if (!m) return
  for (const champ of [
    'style', 'police', 'motsParPage', 'casse', 'taille', 'positionBas',
    'contour', 'epaisseurContour', 'couleurTexte', 'couleurSurligne',
    'couleurContour', 'animation', 'ponctuation',
  ]) {
    if (m[champ] !== undefined) appli.st.reglages[champ] = m[champ]
  }
  appli.st.modeleRetenu = cle
  versLesControles()
  marqueLeModele()
  relanceLApercu({ gardeLaPosition: true })
  // Un seul argument part : `--modele=` applique le modèle entier côté commande.
  // Envoyer aussi les treize champs ferait deux vérités pour un même geste.
  enregistre({ modele: cle })
}

$('btnValideStyle').addEventListener('click', () =>
  pendant($('btnValideStyle'), 'Enregistrement…', async () => {
    clearTimeout(minuteurEnregistrement)
    await envoieLesReglages()
    const r = await mene(() =>
      api(`/api/videos/${encodeURIComponent(appli.slug)}/soustitres/valide`, {
        methode: 'POST', corps: { champs: {} },
      })
    )
    if (r) {
      annonce(`Style appliqué au montage.`, 'ok')
      avanceApres('soustitres')
    }
  })
)

// --- L'aperçu --------------------------------------------------------------

const apercu = {
  fenetres: [],
  dureeMs: 0,
  index: -1,
  horlogeMs: 0,
  enLecture: true,
  derniereImage: null,
  raf: null,
  motActif: -1,
}

function dimensions() {
  return appli.etat?.vertical === false
    ? { largeur: 1920, hauteur: 1080 }
    : { largeur: 1080, hauteur: 1920 }
}

function arreteLApercu() {
  if (apercu.raf) cancelAnimationFrame(apercu.raf)
  apercu.raf = null
  // Un aperçu arrêté qui continue de parler derrière un autre écran est le
  // genre de détail qu'on met dix minutes à attribuer.
  const son = $('audioApercu')
  if (son.src) son.pause()
}

/**
 * Branche la voix convertie sur l'aperçu.
 *
 * Le fichier vient de l'état, pas d'un chemin deviné : selon le moteur employé,
 * ce n'est pas toujours le même, et une adresse en dur donnerait un lecteur
 * silencieux sans le moindre message.
 */
function brancheLeSon() {
  const son = $('audioApercu')
  const audio = appli.etat?.etapes?.audio
  const chemin = audio?.chemin
  // LA VERSION DU FICHIER FAIT PARTIE DE SON ADRESSE.
  //
  // `voix-finale.wav` garde son nom quand on refait la voix. Sans marqueur de
  // version, le navigateur croit tenir la même ressource : il rejoue ce qu'il a
  // en cache, ou pire, recolle le début qu'il avait gardé avec la suite du
  // nouveau fichier. On entend alors les premières secondes dans l'ancienne
  // voix et le reste dans la nouvelle — un mélange qui n'existe nulle part sur
  // le disque, et qu'on cherche donc du mauvais côté.
  const version = audio?.modifie_le ?? audio?.dureeS ?? ''
  const voulue = chemin
    ? `${urlMedia(appli.slug, chemin)}?v=${encodeURIComponent(version)}`
    : ''
  if (!voulue) { son.removeAttribute('src'); son.load(); return }
  // On ne recharge que si ça change : reposer le même `src` remet la lecture à
  // zéro, et cette fonction passe à chaque changement de réglage.
  if (son.getAttribute('src') === voulue) return
  son.src = voulue
  son.load()

  // ON OUVRE EN PAUSE DÈS QU'IL Y A DU SON, ET C'EST UNE QUESTION D'ÉTAT.
  //
  // L'aperçu partait en lecture tout seul — c'était juste tant qu'il était muet.
  // Avec une voix, le navigateur refuse de la jouer sans un geste : l'image
  // défilerait en silence en s'annonçant « en lecture », et le premier clic
  // METTRAIT EN PAUSE au lieu de lancer. On ouvre donc à l'arrêt : le premier
  // clic démarre les deux ensemble, ce qui est aussi le geste qui autorise le
  // son.
  poseLaLecture(false)
}

// La boucle de l'aperçu, côté son : l'image repart à zéro en fin de prise, le
// son doit repartir avec elle plutôt que de laisser l'écran muet au second tour.
$('audioApercu').addEventListener('ended', () => {
  if (!apercu.enLecture) return
  apercu.horlogeMs = 0
  apercu.index = -1
  $('audioApercu').currentTime = 0
  $('audioApercu').play().catch(() => {})
})

/**
 * Reconstruit l'aperçu depuis les mots et les réglages courants.
 *
 * `gardeLaPosition` EXISTE POUR LA CORRECTION DE TEXTE, ET C'EST TOUT LE SUJET.
 *
 * Corriger une ligne à 2:16 rejouait l'aperçu depuis le premier sous-titre :
 * la page qu'on venait de corriger disparaissait de l'écran, et on en concluait
 * que la correction n'avait pas pris. C'est exactement l'inverse — elle avait
 * pris, on ne la regardait plus. Le seul remède est de ne pas bouger : même
 * instant, même état de lecture, avant et après.
 */
function relanceLApercu({ sansTexte = false, gardeLaPosition = false } = {}) {
  const horlogeAvant = apercu.horlogeMs
  const sonAvant = $('audioApercu')
  const jouaitAvant = Boolean(sonAvant.src) && !sonAvant.paused && !sonAvant.ended
  arreteLApercu()
  if (!appli.st) return

  const pages = pagine(appli.st.mots, appli.st.reglages.motsParPage)
  // La fenêtre d'affichage d'une page, exactement comme le rendu : elle tient
  // jusqu'à la suivante, sans dépasser deux secondes après son dernier mot.
  apercu.fenetres = pages.map((p, i) => {
    const suivante = pages[i + 1]
    const fin = Math.min(suivante ? suivante.debutMs : p.finMs + 400, p.finMs + TENUE_MAX_MS)
    return { page: p, debutMs: p.debutMs, finMs: Math.max(fin, p.debutMs + 1) }
  })
  apercu.dureeMs = (apercu.fenetres.at(-1)?.finMs ?? 0) + 500
  apercu.index = -1
  apercu.motActif = -1
  // AU REPOS, L'APERCU MONTRE LE PREMIER SOUS-TITRE.
  //
  // A zero, aucune page n'est ouverte — la voix ne commence qu'apres un quart
  // de seconde — et l'ecran dont le seul metier est de montrer le style
  // affichait un damier vide avec un bouton « lire ». Or une police, une
  // couleur et une graisse se jugent sur une image FIXE : il fallait lancer la
  // lecture pour voir ce qu'on etait venu regler, et la relancer apres chaque
  // changement de curseur.
  apercu.horlogeMs = gardeLaPosition ? horlogeAvant : (apercu.fenetres[0]?.debutMs ?? 0)
  apercu.derniereImage = null

  brancheLeSon()
  // LA LECTURE REPREND OÙ ELLE ÉTAIT, PARCE QUE `arreteLApercu` L'A COUPÉE.
  //
  // Sans ça, corriger une ligne pendant que l'aperçu tourne le laissait en
  // pause silencieuse : l'image continuait sur son compteur interne, le son
  // non, et on cherchait pourquoi « le son s'est arrêté tout seul ».
  if (gardeLaPosition && sonAvant.src) {
    try { sonAvant.currentTime = Math.max(0, horlogeAvant) / 1000 } catch { /* pas encore chargé */ }
    if (jouaitAvant) sonAvant.play().catch(() => { /* refusée : l'image suffit */ })
  }
  poseLeCadre()
  appliqueLeStyle()
  // Deux nombres, pas une phrase : c'est tout ce qu'on vient vérifier ici.
  $('noteApercu').textContent = apercu.fenetres.length
    ? `${apercu.fenetres.length} sous-titres · ${appli.st.mots.length} mots`
    : `Aucun mot exploitable.`

  apercu.raf = requestAnimationFrame(boucleApercu)
  // La liste montre les pages du RENDU : elle se redessine quand elles bougent.
  if (!sansTexte && $("listeSt").children.length) dessineLeTexte()
}

function poseLeCadre() {
  const { largeur, hauteur } = dimensions()
  const cadre = $('cadre')
  cadre.style.setProperty('--ratio', String(largeur / hauteur))
  const plateau = $('plateau')
  plateau.style.width = `${largeur}px`
  plateau.style.height = `${hauteur}px`
  metALEchelle()
}

function metALEchelle() {
  const { largeur } = dimensions()
  const k = ($('cadre').clientWidth || largeur) / largeur
  $('plateau').style.transform = `scale(${k})`
}
new ResizeObserver(() => { if (appli.st) metALEchelle() }).observe($('cadre'))

/** Le style commun à tous les mots : police, corps, contour, position. */
function appliqueLeStyle() {
  if (!appli.st) return
  const r = appli.st.reglages
  const { hauteur } = dimensions()
  const bloc = $('blocSt')

  const taille = r.style === 'bloc-2-lignes' ? r.taille * 0.82 : r.taille
  bloc.style.fontFamily = familleCss(r.police)
  bloc.style.fontWeight = r.style === 'bloc-2-lignes' ? '700' : '800'
  bloc.style.fontVariationSettings = appli.chaine?.identite_visuelle?.variations_affiche ?? ''
  bloc.style.fontSize = `${taille}px`
  bloc.style.letterSpacing = r.style === 'bloc-2-lignes' ? 'normal' : '-0.02em'
  bloc.style.gap = `${0.22 * r.taille}px`
  bloc.style.lineHeight = String(INTERLIGNE)

  // Le trait suit `taille` — la taille pleine — même pour le bloc, dont le corps
  // est réduit à 0,82 : c'est ce que fait le rendu, et s'en écarter ferait
  // mentir l'aperçu sur le seul réglage qu'on regarde ici.
  if (r.contour) {
    bloc.style.webkitTextStroke = `${(r.taille * EPAISSEUR_CONTOUR * r.epaisseurContour).toFixed(1)}px ${r.couleurContour}`
    bloc.style.paintOrder = 'stroke fill'
    bloc.style.textShadow = OMBRE_PORTEE
  } else {
    bloc.style.webkitTextStroke = ''
    bloc.style.paintOrder = ''
    bloc.style.textShadow = ''
  }

  $('ligneSt').style.bottom = `${(r.positionBas / 100) * hauteur}px`

  for (const el of bloc.children) styleUnMot(el, el.classList.contains('actif'), el.classList.contains('dit'))
}

/** L'état d'un mot : c'est la seule chose qui change d'une image à l'autre. */
function styleUnMot(el, actif, dejaDit) {
  const r = appli.st.reglages
  const taille = r.taille
  el.style.transition = 'none'
  el.style.borderRadius = ''
  el.style.backgroundColor = ''

  if (r.style === 'ligne-karaoke') {
    el.style.color = actif || dejaDit ? r.couleurSurligne : r.couleurTexte
    el.style.padding = '0'
    el.style.opacity = dejaDit ? '0.9' : '1'
    el.style.transform = 'none'
    return
  }
  if (r.style === 'mot-a-mot-couleur') {
    el.style.color = actif ? r.couleurSurligne : r.couleurTexte
    el.style.padding = `${0.06 * taille}px ${0.1 * taille}px`
    el.style.opacity = actif ? '1' : '0.9'
    el.style.transform = actif ? 'scale(1.06)' : 'none'
    return
  }
  if (r.style === 'mot-a-mot-pastille') {
    el.style.color = r.couleurTexte
    el.style.backgroundColor = actif ? r.couleurSurligne : 'transparent'
    // Le remplissage ne change JAMAIS : une largeur qui bouge à chaque mot
    // recentre la ligne et se lit comme un tremblement permanent.
    el.style.padding = `${0.06 * taille}px ${0.16 * taille}px`
    el.style.borderRadius = `${RAYON_PASTILLE}px`
    el.style.opacity = actif ? '1' : '0.92'
    el.style.transform = actif ? 'scale(1.04)' : 'none'
    return
  }
  // bloc-2-lignes
  el.style.color = actif ? r.couleurSurligne : r.couleurTexte
  el.style.padding = '0'
  el.style.opacity = dejaDit ? '0.78' : '1'
  el.style.transform = 'none'
}

const ANIMATION_CSS = {
  aucune: 'none',
  // Durées et proportions converties depuis `entrance()` de Scriptshort, comme
  // le fait `apparitionDe()` dans SousTitres.tsx. Le rendu passe par un ressort
  // Remotion là où le CSS emploie une courbe : la durée est la même, la montée
  // diffère de quelques millisecondes — invisible à l'œil, et sans effet sur une
  // décision de style.
  fondu: 'stFondu 120ms linear both',
  pop: 'stPop 140ms cubic-bezier(.2,.8,.2,1) both',
  rebond: 'stRebond 215ms cubic-bezier(.2,.8,.2,1) both',
}

function dessineLaPage(indice) {
  const bloc = $('blocSt')
  bloc.replaceChildren()
  const r = appli.st.reglages
  for (const mot of apercu.fenetres[indice].page.mots) {
    const span = creer('span', 'mot-st')
    span.textContent = casseMot(r.ponctuation ? mot.texte : nettoieMot(mot.texte), r.casse)
    span.dataset.debut = mot.debutMs
    span.dataset.fin = mot.finMs
    styleUnMot(span, false, false)
    bloc.append(span)
  }
  bloc.style.animation = 'none'
  void bloc.offsetWidth
  bloc.style.animation = ANIMATION_CSS[r.animation] ?? 'none'
}

/** Rejoue l'apparition de la page en cours, pour voir l'animation tout de suite. */
function rejoueLaPage() {
  if (!appli.st || apercu.index < 0) return
  dessineLaPage(apercu.index)
  apercu.motActif = -1
  majLeMotActif(apercu.horlogeMs)
}

function redessineMaintenant() {
  if (!appli.st || apercu.index < 0) return
  const bloc = $('blocSt')
  for (const el of bloc.children) styleUnMot(el, el.classList.contains('actif'), el.classList.contains('dit'))
}

function boucleApercu(instant) {
  apercu.raf = requestAnimationFrame(boucleApercu)
  if (!appli.st) return

  // QUAND LE SON JOUE, C'EST LUI L'HORLOGE.
  //
  // On pourrait faire avancer les deux en parallèle — un compteur pour l'image,
  // le lecteur pour le son — et ils dériveraient. Pas beaucoup : quelques
  // dizaines de millisecondes sur deux minutes. Assez pour qu'on règle un calage
  // mot à mot contre une référence fausse, ce qui est exactement l'inverse du
  // service rendu par cet écran.
  //
  // Le compteur interne reste pour le cas sans son : pas encore de voix
  // convertie, ou lecture refusée par le navigateur tant qu'on n'a rien cliqué.
  const son = $('audioApercu')
  if (son.src && !son.paused && !son.ended) {
    apercu.horlogeMs = son.currentTime * 1000
    apercu.derniereImage = instant
  } else if (apercu.enLecture) {
    // Un onglet en arrière-plan rend des écarts de plusieurs secondes : on les
    // plafonne pour que l'aperçu reprenne où il était plutôt que de sauter.
    if (apercu.derniereImage !== null) apercu.horlogeMs += Math.min(120, instant - apercu.derniereImage)
    apercu.derniereImage = instant
    // En fin de boucle on revient au premier sous-titre, pas au vide qui le
    // precede : sinon l'apercu se termine sur un damier nu.
    if (apercu.horlogeMs > apercu.dureeMs) apercu.horlogeMs = apercu.fenetres[0]?.debutMs ?? 0
  } else {
    apercu.derniereImage = instant
  }
  dessineLInstant(apercu.horlogeMs)
}

function dessineLInstant(ms) {
  const ligne = $('ligneSt')
  let i = trouveLaFenetre(ms)

  if (i < 0) {
    if (apercu.index !== -1) { apercu.index = -1; ligne.style.visibility = 'hidden' }
  } else {
    if (i !== apercu.index) {
      apercu.index = i
      apercu.motActif = -1
      ligne.style.visibility = 'visible'
      dessineLaPage(i)
      suitLeTexte(i)
    }
    majLeMotActif(ms)
  }

  $('curseurTemps').value = apercu.dureeMs ? Math.round((ms / apercu.dureeMs) * 1000) : 0
  $('chrono').textContent = `${chrono(ms)} / ${chrono(apercu.dureeMs)}`
}

function trouveLaFenetre(ms) {
  // Recherche dichotomique : une prise de deux minutes fait deux cents pages, et
  // parcourir la liste soixante fois par seconde ne se justifie pas.
  const f = apercu.fenetres
  let bas = 0, haut = f.length - 1
  while (bas <= haut) {
    const milieu = (bas + haut) >> 1
    if (ms < f[milieu].debutMs) haut = milieu - 1
    else if (ms >= f[milieu].finMs) bas = milieu + 1
    else return milieu
  }
  return -1
}

function majLeMotActif(ms) {
  const enfants = $('blocSt').children
  let actif = -1
  for (let i = 0; i < enfants.length; i++) {
    const el = enfants[i]
    if (ms >= Number(el.dataset.debut) && ms < Number(el.dataset.fin)) { actif = i; break }
  }
  const karaoke = appli.st.reglages.style === 'ligne-karaoke'
  // Le karaoké colore aussi les mots déjà dits : son état change à chaque mot,
  // pas seulement au passage de l'actif.
  if (actif === apercu.motActif && !karaoke) return
  apercu.motActif = actif
  for (let i = 0; i < enfants.length; i++) {
    const el = enfants[i]
    const dejaDit = ms >= Number(el.dataset.fin)
    el.classList.toggle('actif', i === actif)
    el.classList.toggle('dit', dejaDit)
    styleUnMot(el, i === actif, dejaDit)
  }
}

/** L'état de lecture, à un seul endroit — le cadre le porte, la flèche le montre. */
function poseLaLecture(enLecture) {
  apercu.enLecture = enLecture
  $('cadre').classList.toggle('en-pause', !enLecture)
  // Sans ça, un lecteur d'écran annonce toujours le même état : le seul retour
  // de ce bouton est une flèche, et une flèche ne se lit pas à voix haute.
  $('cadre').setAttribute('aria-pressed', String(enLecture))

  // Le son suit le même bouton que l'image : deux commandes séparées pour un
  // seul geste, c'est déjà une de trop.
  const son = $('audioApercu')
  if (!son.src) return
  if (enLecture) {
    // Le clic sur le cadre EST le geste qui autorise le son : les navigateurs
    // refusent la lecture automatique, et c'est cette permission-là qu'on
    // récupère ici. Si elle est refusée quand même, l'image continue seule.
    son.currentTime = apercu.horlogeMs / 1000
    son.play().catch(() => {})
  } else {
    son.pause()
  }
}

// On clique SUR l'image, comme dans n'importe quel lecteur. Le bouton d'à côté
// obligeait à quitter des yeux ce qu'on est en train de juger.
$('cadre').addEventListener('click', () => poseLaLecture(!apercu.enLecture))

$('curseurTemps').addEventListener('input', () => {
  if (!appli.st) return
  apercu.horlogeMs = (Number($('curseurTemps').value) / 1000) * apercu.dureeMs
  apercu.index = -1
  // On déplace le son avec l'image : le curseur cherche un passage précis, et
  // l'entendre est la moitié de ce qu'on cherche.
  const son = $('audioApercu')
  if (son.src && Number.isFinite(son.duration)) {
    son.currentTime = Math.min(son.duration, apercu.horlogeMs / 1000)
  }
  dessineLInstant(apercu.horlogeMs)
})

/**
 * Amène l'aperçu à un instant précis, et met la lecture en pause.
 *
 * On met en pause parce que le geste vient d'un clic sur un mot : on veut le
 * VOIR, et une lecture qui continue l'aurait dépassé avant qu'on ait fini de
 * lire. Reprendre la lecture reste à un clic.
 */
function sauteDansLApercu(ms) {
  if (!appli.st) return
  poseLaLecture(false)
  apercu.horlogeMs = Math.max(0, Math.min(ms, apercu.dureeMs))
  apercu.index = -1
  dessineLInstant(apercu.horlogeMs)
}

// ---------------------------------------------------------------------------
//  Le texte, seconde par seconde — et sa correction
// ---------------------------------------------------------------------------
//
// CE QUE CETTE COLONNE RÉPARE.
//
// Whisper rend un mot qui SONNE juste : « devine quoi » devient « de quoi »,
// l'accord de « attirée » saute. Ça ne s'entend pas — la voix a dit le bon mot —
// mais ça s'affiche en gros au milieu de l'écran.
//
// UNE LIGNE, UN CHAMP DE TEXTE. Comme Scriptshort, et pour la même raison : on
// corrige en lisant, et lire mot par mot n'est pas lire. La première version
// découpait la ligne en autant de petits champs qu'elle avait de mots, pour ne
// jamais toucher aux horodatages. C'était sûr et c'était pénible.
//
// Ce que ça coûte, et il faut le savoir : tant que le nombre de mots ne change
// pas, aucun instant ne bouge — c'est le cas d'une faute d'accord, donc de
// presque toutes les corrections. Quand il change, `pipeline/texte.mjs`
// répartit les instants DANS la ligne au prorata des lettres et conserve ses
// deux bornes : le surlignage devient approximatif à l'intérieur de la ligne,
// et rien ne bouge autour.
//
// Le découpage en lignes est celui du rendu — `pagine()` plus haut dans ce
// fichier, portage littéral de `SousTitres.tsx`. On corrige donc les
// sous-titres tels qu'ils s'afficheront, pas une approximation.

/**
 * Les lignes récrites, en attente d'écriture.
 *
 * LA CLÉ EST L'INSTANT, PLUS L'INDEX — ET C'EST CE QUI PERDAIT DES CORRECTIONS.
 *
 * Elle valait `de`, l'index du premier mot de la ligne. Or une correction qui
 * change le NOMBRE de mots décale tous les index qui suivent : après
 * l'enregistrement de la ligne 10, la correction en attente sur la ligne 20 ne
 * désignait plus rien — dans le meilleur des cas elle disparaissait sans un
 * mot, dans le pire elle serait allée s'appliquer ailleurs.
 *
 * `debutMs` ne bouge pas. `pipeline/texte.mjs` conserve explicitement les
 * bornes de chaque plage récrite, donc le premier mot garde son instant, et les
 * lignes voisines ne sont pas touchées. Ce qui peut encore changer, c'est le
 * DÉCOUPAGE en pages : une ligne de six mots au lieu de cinq déplace les
 * frontières suivantes. Une correction dont la ligne a disparu est alors
 * abandonnée — et on le DIT, plutôt que de la poser sur la ligne d'à côté.
 *
 * `origine` sert exactement à ça : on ne réapplique une correction en attente
 * que sur une ligne dont le texte de départ est encore le même.
 *
 * clé = `debutMs` de la ligne · valeur = `{ origine, texte }`
 */
const corrections = new Map()

/** Vrai le temps de RENDRE le focus après un redessin — voir `dessineLeTexte`. */
let focusRendu = false

/** Au dixième de seconde : sur deux cents lignes, deux voisines tombent souvent
 *  dans la même seconde, et `chrono` ne les distinguerait pas. */
const auDixieme = (ms) => {
  const s = Math.max(0, ms) / 1000
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')},${Math.floor((s % 1) * 10)}`
}

/** Les lignes du rendu, avec la plage d'index de mots que chacune couvre. */
function lignesDuTexte() {
  const pages = pagine(appli.st.mots, appli.st.reglages.motsParPage)
  const lignes = []
  let i = 0
  for (const page of pages) {
    const de = i
    i += page.mots.length
    lignes.push({
      de,
      a: i - 1,
      debutMs: page.debutMs,
      texte: page.mots.map((m) => m.texte).join(' '),
      doute: page.mots.some((m) => m.incertain),
    })
  }
  return lignes
}

function dessineLeTexte() {
  const zone = $('listeSt')

  // ON REDESSINE UNE COLONNE, ON NE REMET PAS L'ÉCRAN À ZÉRO.
  //
  // Cette fonction est appelée après chaque enregistrement de correction, et
  // après un changement de « mots par ligne » : à chaque fois, la liste
  // repartait en haut. Sur deux cents lignes, corriger la cent-trentième
  // renvoyait donc au début — et le champ qu'on venait de quitter perdait le
  // curseur. On lisait ça comme un rechargement de page, à raison : c'en était
  // un, à l'échelle de la colonne.
  const defilement = zone.scrollTop
  const actif = document.activeElement
  const reprendre =
    actif?.classList?.contains('texte-st') && zone.contains(actif)
      ? { de: actif.dataset.de, debut: actif.selectionStart, fin: actif.selectionEnd }
      : null

  zone.replaceChildren()
  if (!appli.st?.mots?.length) return

  // Les corrections en attente qu'on aura effectivement retrouvées. Ce qui
  // reste en dehors a perdu sa ligne — voir la purge en fin de fonction.
  const vues = new Set()

  for (const [numero, l] of lignesDuTexte().entries()) {
    const ligne = creer('div', 'page-st')
    ligne.dataset.page = String(numero)

    const heure = creer('button', 'page-heure')
    heure.type = 'button'
    heure.textContent = auDixieme(l.debutMs)
    heure.addEventListener('click', () => sauteDansLApercu(l.debutMs))
    ligne.append(heure)

    const champ = creer('textarea', 'texte-st')
    champ.rows = 1
    champ.spellcheck = false
    champ.dataset.de = String(l.de)
    champ.dataset.a = String(l.a)
    champ.dataset.cle = String(l.debutMs)
    champ.dataset.origine = l.texte
    // Une correction en attente ne se repose que si la ligne n'a pas bougé
    // sous elle : même instant ET même texte de départ.
    const attente = corrections.get(l.debutMs)
    const reprise = attente && attente.origine === l.texte ? attente : null
    if (attente) vues.add(l.debutMs)
    champ.value = reprise ? reprise.texte : l.texte
    // Whisper marque lui-même ses hésitations : les signaler dit où relire en
    // premier, ce qui vaut mieux que de tout relire.
    if (l.doute) champ.classList.add('doute')
    if (reprise) champ.classList.add('modifie')

    champ.addEventListener('focus', () => { if (!focusRendu) sauteDansLApercu(l.debutMs) })
    champ.addEventListener('input', () => {
      hauteurAuContenu(champ)
      if (champ.value === champ.dataset.origine) corrections.delete(l.debutMs)
      else corrections.set(l.debutMs, { origine: champ.dataset.origine, texte: champ.value })
      champ.classList.toggle('modifie', corrections.has(l.debutMs))
      majPiedDeTexte()
      // La frappe repousse l'écriture : dix lignes corrigées à la file font une
      // seule requête, et une correction tapée pendant qu'une autre part n'a
      // plus l'occasion d'arriver à contretemps.
      programmeLEnregistrement()
    })
    // Entrée valide la ligne et passe à la suivante : un sous-titre n'a jamais
    // de retour à la ligne, et le champ ne doit pas en accepter un.
    champ.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const tous = [...zone.querySelectorAll('.texte-st')]
      const suivant = tous[tous.indexOf(champ) + 1]
      if (suivant) suivant.focus()
      else $('btnCorrige').focus()
    })
    ligne.append(champ)
    zone.append(ligne)
  }

  // UNE CORRECTION ORPHELINE SE JETTE, ET ÇA SE DIT.
  //
  // Elle n'a plus de ligne : le découpage a bougé sous elle pendant qu'une
  // autre correction s'écrivait. La garder en mémoire laisserait « 1 ligne
  // récrite » affiché pour toujours au-dessus d'un bouton qui n'aurait plus
  // rien à envoyer — un bouton actif qui ne fait rien, deux fois pire qu'un
  // avertissement.
  const perdues = [...corrections.keys()].filter((k) => !vues.has(k))
  for (const k of perdues) corrections.delete(k)
  if (perdues.length) {
    annonce(
      `${perdues.length} correction(s) abandonnée(s) : leur ligne a été redécoupée ` +
        `entre-temps. Récris-les, elles sont visibles telles qu'elles étaient.`,
      'attention'
    )
  }

  // La hauteur se règle après insertion : `scrollHeight` vaut zéro hors du DOM.
  for (const c of zone.querySelectorAll('.texte-st')) hauteurAuContenu(c)
  filtreLeTexte()
  majPiedDeTexte()

  // On rend la place exacte où l'on était. Le champ peut avoir disparu — une
  // ligne récrite en deux mots au lieu de trois déplace les frontières —, et
  // dans ce cas on garde au moins le défilement plutôt que de sauter en haut.
  if (reprendre) {
    const champ = zone.querySelector(`.texte-st[data-de="${reprendre.de}"]`)
    if (champ) {
      // RENDRE LE FOCUS N'EST PAS LE PRENDRE. Le champ saute dans l'aperçu
      // quand on le vise ; le lui faire faire ici déplacerait la lecture à
      // chaque enregistrement, c'est-à-dire exactement ce qu'on répare.
      focusRendu = true
      champ.focus({ preventScroll: true })
      focusRendu = false
      try { champ.setSelectionRange(reprendre.debut, reprendre.fin) } catch { /* champ plus court */ }
    }
  }
  zone.scrollTop = defilement
}

/** Un `textarea` ne grandit pas tout seul : on le remet à la hauteur du texte. */
function hauteurAuContenu(champ) {
  champ.style.height = 'auto'
  // `scrollHeight` EXCLUT LA BORDURE, `height` L'INCLUT (box-sizing: border-box).
  // Sans les deux pixels, le bas des jambages était coupé sur chaque ligne.
  champ.style.height = `${champ.scrollHeight + 2}px`
}

/** Le filtre de recherche : on cache les lignes, on ne redessine pas. */
function filtreLeTexte() {
  const q = ($('chercheTexte').value ?? '').trim().toLowerCase()
  for (const ligne of $('listeSt').children) {
    if (!q) { ligne.classList.remove('filtree'); continue }
    const texte = ligne.querySelector('.texte-st')?.value.toLowerCase() ?? ''
    ligne.classList.toggle('filtree', !texte.includes(q))
  }
}

/**
 * L'ÉTAT DE L'ÉCRITURE SE VOIT, SINON ON NE PEUT PAS LUI FAIRE CONFIANCE.
 *
 * Le pied de colonne disait « 2 lignes récrites », puis se vidait. Rien ne
 * distinguait « pas encore parti », « en train de partir » et « c'est écrit » —
 * or c'est exactement la question qu'on se pose avant de fermer l'onglet ou de
 * changer de vidéo. Un enregistrement automatique qu'on ne voit pas ne rassure
 * personne : on continue de chercher le bouton.
 *
 * `enregistre` reste affiché : il n'a pas de raison de s'effacer, et une note
 * qui disparaît toute seule laisse à nouveau devant un écran muet.
 */
let etatEcriture = 'repos'

function majPiedDeTexte() {
  const n = corrections.size
  $('btnCorrige').disabled = n === 0
  const note = $('noteCorrections')
  note.classList.toggle('ecrit', etatEcriture === 'enregistre' && n === 0)
  if (n && etatEcriture === 'envoi') {
    note.textContent = `${n} ligne${n > 1 ? 's' : ''} — enregistrement…`
  } else if (n) {
    note.textContent = `${n} ligne${n > 1 ? 's' : ''} récrite${n > 1 ? 's' : ''} — enregistrement dans un instant`
  } else if (etatEcriture === 'enregistre') {
    note.textContent = `✓ Enregistré`
  } else {
    note.textContent = ''
  }
}

/** Suit la lecture : la ligne en cours se surligne et se garde à l'écran. */
function suitLeTexte(indice) {
  const zone = $('listeSt')
  const avant = zone.querySelector('.page-st.en-cours')
  if (avant) avant.classList.remove('en-cours')
  const ligne = zone.children[indice]
  if (!ligne) return
  ligne.classList.add('en-cours')
  // On ne fait défiler que si la ligne est sortie du cadre : un défilement
  // permanent empêche de lire tranquillement pendant que l'aperçu tourne. Et
  // jamais pendant qu'on écrit dedans.
  if (ligne.contains(document.activeElement)) return
  const r = ligne.getBoundingClientRect()
  const c = zone.getBoundingClientRect()
  if (r.top < c.top || r.bottom > c.bottom) ligne.scrollIntoView({ block: 'nearest' })
}

$('chercheTexte').addEventListener('input', filtreLeTexte)

/**
 * Les nombres dits en lettres, réécrits en chiffres.
 *
 * ON MONTRE AVANT D'ÉCRIRE, ET CE N'EST PAS DE LA POLITESSE.
 *
 * La conversion touche le transcript, donc les sous-titres, donc le plan. Sur
 * quatre cents mots, l'appliquer d'un clic sans rien montrer rendrait la
 * relecture impossible : on ne saurait ni combien de mots ont bougé, ni si
 * « un » a été pris pour un article. La liste tient en trois lignes et se lit
 * en trois secondes.
 */
$('btnChiffres').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, '…', async () => {
    if (!appli.st) return
    try {
      const vu = await api(`/api/videos/${encodeURIComponent(appli.st.slug)}/texte/chiffres`, {
        methode: 'POST', corps: { applique: false },
      })
      const trouves = vu.resultat?.trouves ?? []
      if (!trouves.length) { annonce(`Aucun nombre écrit en lettres.`, 'ok'); return }

      const apercu = trouves.slice(0, 12).map((t) => `  ${t.avant} → ${t.texte}`).join('\n')
      const ok = await demandeConfirmation({
        titre: `Mettre ${trouves.length} nombre(s) en chiffres ?`,
        quoi:
          `${apercu}${trouves.length > 12 ? `\n  … et ${trouves.length - 12} autres` : ''}\n\n` +
          `Le transcript et le plan de montage sont corrigés ensemble. ` +
          `Les instants ne bougent pas.`,
        action: 'Convertir',
      })
      if (!ok) return

      await api(`/api/videos/${encodeURIComponent(appli.st.slug)}/texte/chiffres`, {
        methode: 'POST', corps: { applique: true },
      })
      // Le studio garde les mots en mémoire : sans relecture, la liste et
      // l'aperçu montreraient encore « trois » alors que le disque dit « 3 ».
      appli.st = null
      await chargeLeStudio()
      // La conversion réécrit le transcript ET le plan : le master est périmé à
      // la seconde même. Sans cette relecture, la marche 7 gardait son ancien
      // verdict — le défaut corrigé sur l'échange de plans vivait aussi ici.
      await rafraichitEtat()
      annonce(`${trouves.length} nombre(s) en chiffres.`, 'ok')
    } catch (e) {
      annonce(e.message, 'erreur')
    }
  })
)

/**
 * Enregistre les corrections en attente. Appelé par le bouton, ET à la sortie
 * du champ — voir plus bas pourquoi.
 */
/**
 * UNE CORRECTION FAITE PENDANT L'ENREGISTREMENT ÉTAIT PERDUE, EN SILENCE.
 *
 * Deux lignes suffisaient à l'expliquer, et c'est le « parfois le sous-titre ne
 * se modifie pas » : le garde `if (enregistrementEnCours) return` abandonnait la
 * seconde correction, et `corrections.clear()` effaçait ensuite TOUT — y compris
 * ce qui n'était jamais parti. Rien à l'écran ne le disait ; la ligne redessinée
 * revenait simplement à sa version d'avant.
 *
 * Deux corrections, donc : on ne vide que ce qui a été envoyé, et une demande
 * arrivée pendant le vol relance un tour au lieu d'être jetée.
 */
/**
 * L'ÉCRITURE ATTEND QUE LA FRAPPE S'ARRÊTE.
 *
 * Elle partait au `focusout`, c'est-à-dire au moment exact où l'on va cliquer
 * ailleurs — sur la flèche de lecture, sur la ligne suivante. Deux corrections
 * rapprochées faisaient donc deux allers-retours qui se croisaient, et la
 * seconde arrivait sur un découpage que la première venait de changer.
 *
 * Un demi-battement suffit à les regrouper : dix lignes corrigées à la file
 * font une seule requête. Le bouton « Enregistrer », lui, reste immédiat — on
 * clique dessus précisément pour ne pas attendre.
 */
const DELAI_ECRITURE_MS = 450
let minuterieEcriture = null

function programmeLEnregistrement() {
  clearTimeout(minuterieEcriture)
  // Une nouvelle frappe efface le « ✓ Enregistré » de la précédente : le laisser
  // au-dessus d'une ligne qu'on est en train de récrire serait un mensonge.
  if (etatEcriture === 'enregistre') { etatEcriture = 'repos'; majPiedDeTexte() }
  minuterieEcriture = setTimeout(() => {
    minuterieEcriture = null
    enregistreLesCorrections().catch(() => { /* `mene` a déjà annoncé */ })
  }, DELAI_ECRITURE_MS)
}

let enregistrementEnCours = false
let redemande = false
async function enregistreLesCorrections() {
  clearTimeout(minuterieEcriture)
  minuterieEcriture = null
  return enregistreMaintenant()
}

async function enregistreMaintenant() {
  if (!corrections.size) return
  if (enregistrementEnCours) { redemande = true; return }
  enregistrementEnCours = true
  etatEcriture = 'envoi'
  majPiedDeTexte()
  try {
    await pendant($('btnCorrige'), 'Enregistrement…', corrigeVraiment)
    etatEcriture = 'enregistre'
  } catch (e) {
    etatEcriture = 'repos'
    throw e
  } finally {
    enregistrementEnCours = false
    // `pendant` réactive le bouton dans son `finally`, quoi qu'il arrive. Sans
    // ce rappel, « Enregistrer » redevenait cliquable alors qu'il ne restait
    // rien à enregistrer — un bouton actif qui ne fait rien se lit comme un
    // bouton cassé.
    majPiedDeTexte()
  }
  if (redemande) {
    redemande = false
    if (corrections.size) await enregistreMaintenant()
  }
}

$('btnCorrige').addEventListener('click', enregistreLesCorrections)

// LE DERNIER FILET : FERMER L'ONGLET PENDANT LE DEMI-BATTEMENT.
//
// L'écriture part 450 ms après la dernière frappe. Fermer, recharger ou quitter
// dans cet intervalle emporterait la correction sans un mot. Le navigateur pose
// alors sa propre confirmation — la seule chose qu'une page ait le droit de
// faire à ce moment-là — et uniquement s'il reste vraiment quelque chose.
window.addEventListener('beforeunload', (ev) => {
  if (!corrections.size) return
  ev.preventDefault()
  // Chrome ignore le texte depuis longtemps ; la valeur de retour reste ce qui
  // déclenche la boîte.
  ev.returnValue = ''
  return ''
})

// UNE CORRECTION SE SAUVE QUAND ON QUITTE LE CHAMP, PAS QUAND ON Y PENSE.
//
// Les corrections restaient en attente jusqu'au bouton « Enregistrer ». On
// corrigeait une ligne, on pressait « lire » pour vérifier — et l'aperçu jouait
// l'ancien texte, puisque rien n'était encore écrit. Tout semblait ignoré.
//
// Quitter le champ pour ALLER AILLEURS — le lecteur, un curseur, le rail —
// enregistre. Passer au champ SUIVANT n'enregistre pas : corriger dix lignes
// d'affilée avec Entrée doit rester fluide, et une seule écriture à la fin
// suffit. `relatedTarget` dit où part le focus ; c'est tout ce qu'il faut.
//
// IL PASSE PAR LA MINUTERIE, LUI AUSSI. Quitter le champ pour cliquer sur la
// flèche déclenchait l'écriture À L'INSTANT du clic : la requête partait pendant
// que la lecture démarrait, et une seconde frappe juste après tombait au pire
// moment. Le demi-battement les regroupe et ne se sent pas — l'écriture arrive
// toujours bien avant qu'on ait fini de regarder le résultat.
$('listeSt').addEventListener('focusout', (ev) => {
  if (!ev.target.classList?.contains('texte-st')) return
  if (ev.relatedTarget?.classList?.contains('texte-st')) return
  if (!corrections.size) return
  programmeLEnregistrement()
})

async function corrigeVraiment() {
  if (!corrections.size) return
  const zone = $('listeSt')
  const patch = []
  const envoyees = []
  for (const champ of zone.querySelectorAll('.texte-st')) {
    const cle = Number(champ.dataset.cle)
    const enAttente = corrections.get(cle)
    if (!enAttente) continue
    patch.push({ de: Number(champ.dataset.de), a: Number(champ.dataset.a), texte: enAttente.texte })
    // Le TEXTE EXACT qui part, pas seulement sa clé : si la frappe continue
    // pendant l'aller-retour, la ligne a changé et ne doit pas être oubliée.
    envoyees.push([cle, enAttente.texte])
  }
  if (!patch.length) return
  const r = await mene(() =>
    api(`/api/videos/${encodeURIComponent(appli.slug)}/texte`, { methode: 'PUT', corps: { corrections: patch } })
  )
  if (!r) return
  for (const [cle, texte] of envoyees) {
    if (corrections.get(cle)?.texte === texte) corrections.delete(cle)
  }
  // La transcription a changé de longueur : on la relit plutôt que de la
  // rafistoler côté navigateur. Une ligne récrite décale tous les index
  // suivants, et deviner ce décalage ici serait une deuxième vérité.
  //
  // MAIS ON NE RELIT QUE LES MOTS, PAS TOUT LE STUDIO. `rechargeLeStudio()`
  // vidait `appli.st`, masquait le panneau, refaisait deux requêtes, remettait
  // les curseurs, redessinait le catalogue de polices et relançait l'aperçu au
  // premier sous-titre. Sur un geste de correction, c'est un rechargement de
  // page — et c'est ce qu'on voyait.
  await relisLesMots()
  // L'état renvoyé par la route décrit le dossier APRÈS la correction : le plan
  // vient d'être retouché, donc le rendu peut avoir vieilli. L'ignorer laissait
  // les verdicts du rail décrire l'instant d'avant, jusqu'au prochain aller-
  // retour entre deux étapes. On ne prend que `etapes` — c'est tout ce que le
  // rail lit, et recopier l'objet entier risquerait d'écraser des champs que
  // cette route ne connaît pas.
  const apres = r.etat ?? r.resultat?.etat ?? null
  if (apres?.etapes && appli.etat) {
    appli.etat.etapes = apres.etapes
    dessineLeRail()
  }

  const repartis = (r.resultat?.changements ?? []).filter((c) => c.instantsRepartis).length
  annonce(
    repartis
      ? `Corrections enregistrées — ${repartis} ligne(s) recalées.`
      : `Corrections enregistrées.`,
    'ok'
  )
}

/**
 * Relit les mots, et RIEN D'AUTRE.
 *
 * C'est la moitié de `chargeLeStudio()` qui dépend du transcript. Les réglages,
 * les polices, les modèles et les bornes ne bougent pas quand un mot change :
 * les refaire coûtait une requête de plus, un panneau masqué le temps du
 * chargement, et la perte de tout ce qui était à l'écran.
 */
async function relisLesMots() {
  if (!appli.st) return
  let mots
  try {
    const t = await api(`/api/videos/${encodeURIComponent(appli.slug)}/transcript`, { brut: true })
    mots = (t.mots ?? []).filter((m) => m && m.texte && Number.isFinite(m.debutMs))
  } catch (e) {
    annonce(e.message, 'erreur')
    return
  }
  if (!mots.length) return
  appli.st.mots = mots
  relanceLApercu({ sansTexte: true, gardeLaPosition: true })
  dessineLeTexte()
}

// ---------------------------------------------------------------------------
//  Étape 6 bis — tes propres plans de coupe
// ---------------------------------------------------------------------------
//
// Pexels ne connaîtra jamais ton produit, ton visage, ni la capture d'écran de
// ton tableau de bord. Ces plans-là t'appartiennent, et ils appartiennent à la
// CHAÎNE, pas à un montage : déposés une fois avec des mots-clés, ils reviennent
// tout seuls dans les vidéos qui les appellent.
//
// LE PLACEMENT SE MONTRE AVANT DE MONTER. « Où tomberaient-ils » dit quel plan
// prendrait quelle place et sur quel mot-clé. Un placement qu'on ne peut pas
// expliquer est un placement qu'on ne peut pas corriger — et un plan de ton
// produit posé au milieu d'une phrase sur la météo se remarque tout de suite.

let brollEnAttente = null

async function chargeLaBibliotheque() {
  try {
    const r = await api('/api/broll')
    dessineLaBibliotheque(r.resultat?.plans ?? [])
  } catch (e) {
    annonce(e.message, 'erreur')
  }
}

function dessineLaBibliotheque(plans) {
  const liste = $('listeBroll')
  liste.replaceChildren()
  $('compteBroll').textContent = plans.length ? `— ${plans.length}` : '— aucun'

  if (!plans.length) {
    const p = creer('p', 'vide')
    p.textContent = `Rien encore.`
    liste.append(p)
    return
  }

  for (const plan of plans) {
    const carte = creer('div', 'broll')

    const vignette = creer('div', 'broll-vignette')
    if (plan.image) {
      const img = creer('img')
      img.src = `/broll/${encodeURIComponent(plan.fichier)}`
      img.alt = ''
      img.loading = 'lazy'
      vignette.append(img)
    } else {
      vignette.textContent = '▶'
      vignette.classList.add('broll-video')
    }

    const corps = creer('div', 'broll-corps')
    const nom = creer('p', 'broll-nom')
    nom.textContent = plan.fichier
    const mots = creer('input', 'broll-mots')
    mots.type = 'text'
    mots.value = plan.motscles.join(', ')
    mots.spellcheck = false
    mots.placeholder = 'aucun mot-clé — il ne sera jamais choisi'
    if (!plan.motscles.length) mots.classList.add('vide')
    // On enregistre à la sortie du champ, pas à chaque frappe : une requête par
    // lettre pour un champ qu'on remplit rarement n'a aucun intérêt.
    mots.addEventListener('change', async () => {
      const valeur = mots.value.trim()
      if (!valeur) { mots.value = plan.motscles.join(', '); return }
      await mene(() =>
        api(`/api/broll/${encodeURIComponent(plan.fichier)}`, { methode: 'PUT', corps: { mots: valeur } })
      )
      await chargeLaBibliotheque()
    })
    corps.append(nom, mots)
    if (plan.note) {
      const note = creer('p', 'note')
      note.textContent = plan.note
      corps.append(note)
    }

    const retire = creer('button', 'bouton minuscule discret')
    retire.type = 'button'
    retire.textContent = 'Retirer'
    retire.addEventListener('click', async () => {
      const ok = await demandeConfirmation({
        titre: `Retirer « ${plan.fichier} » ?`,
        quoi: `Le fichier est supprimé d'assets/broll/.`,
        action: 'Retirer',
      })
      if (!ok) return
      await mene(() => api(`/api/broll/${encodeURIComponent(plan.fichier)}`, { methode: 'DELETE' }))
      await chargeLaBibliotheque()
    })

    carte.append(vignette, corps, retire)
    liste.append(carte)
  }
}

// ------------------------------------------------------------------ dépôt ---

$('depotBroll').addEventListener('click', () => $('fichierBroll').click())
// Son jumeau de l'étape 2 accepte le clavier depuis toujours ; celui-ci non.
$('depotBroll').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  $('fichierBroll').click()
})
$('depotBroll').addEventListener('dragover', (e) => {
  e.preventDefault()
  $('depotBroll').classList.add('survol')
})
$('depotBroll').addEventListener('dragleave', () => $('depotBroll').classList.remove('survol'))
$('depotBroll').addEventListener('drop', (e) => {
  e.preventDefault()
  $('depotBroll').classList.remove('survol')
  if (e.dataTransfer.files[0]) prepareLAjout(e.dataTransfer.files[0])
})
$('fichierBroll').addEventListener('change', () => {
  if ($('fichierBroll').files[0]) prepareLAjout($('fichierBroll').files[0])
})

/**
 * Le fichier est retenu, mais rien ne part tant que les mots-clés manquent.
 *
 * C'est la seule contrainte du dépôt, et elle est délibérée : un plan sans
 * mots-clés ne serait jamais choisi, donc il occuperait le disque en attendant
 * un jour qui ne viendrait pas — et l'oubli ne se verrait même pas, puisque le
 * montage continuerait d'aller chercher chez Pexels.
 */
function prepareLAjout(fichier) {
  brollEnAttente = fichier
  $('ajoutNom').textContent = `${fichier.name} — ${(fichier.size / 1e6).toFixed(1)} Mo`
  $('ajoutBroll').hidden = false
  $('motsBroll').value = ''
  $('motsBroll').focus()
}

$('btnAnnuleBroll').addEventListener('click', () => {
  brollEnAttente = null
  $('ajoutBroll').hidden = true
  $('fichierBroll').value = ''
})

$('motsBroll').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('btnAjouteBroll').click() }
})

$('btnAjouteBroll').addEventListener('click', async () => {
  if (!brollEnAttente) return
  const mots = $('motsBroll').value.trim()
  if (!mots) { annonce(`Donne au moins un mot-clé : sans eux, ce plan ne serait jamais choisi.`, 'erreur'); return }

  const formulaire = new FormData()
  formulaire.append('fichier', brollEnAttente, brollEnAttente.name)
  formulaire.append('nom', brollEnAttente.name)
  formulaire.append('mots', mots)

  $('btnAjouteBroll').disabled = true
  try {
    const r = await api('/api/broll', { methode: 'POST', corps: formulaire })
    brollEnAttente = null
    $('ajoutBroll').hidden = true
    $('fichierBroll').value = ''
    await chargeLaBibliotheque()
    annonce(`« ${r.resultat?.fichier ?? 'plan'} » ajouté à ta bibliothèque.`, 'ok')
  } catch (e) {
    annonce(e.message, 'erreur')
  } finally {
    $('btnAjouteBroll').disabled = false
  }
})

// ------------------------------------------------------------- placement ---

$('btnPlacementBroll').addEventListener('click', () => pendant($('btnPlacementBroll'), 'Calcul…', async () => {
  const zone = $('placementBroll')
  zone.replaceChildren()
  try {
    const r = await api(`/api/videos/${encodeURIComponent(appli.slug)}/broll`)
    const d = r.resultat ?? {}
    const attributions = d.attributions ?? []

    if (!attributions.length) {
      const p = creer('p', 'note')
      p.textContent = `Aucun de tes plans ne correspond — les ${d.plans ?? 0} viendront de Pexels.`
      zone.append(p)
      return
    }

    const ul = creer('ul', 'placements')
    for (const a of attributions) {
      const li = creer('li')
      const fort = creer('b')
      fort.textContent = a.fichier
      li.append(fort, document.createTextNode(` sur « ${a.ancre ?? a.requete} »`))
      const pourquoi = creer('span', 'placement-pourquoi')
      pourquoi.textContent = ` — accroche : ${a.motscles.join(', ')}`
      li.append(pourquoi)
      ul.append(li)
    }
    zone.append(ul)
    const reste = creer('p', 'note')
    reste.textContent = `Les ${(d.plans ?? 0) - attributions.length} autres viendront de Pexels.`
    zone.append(reste)
  } catch (e) {
    annonce(e.message, 'erreur')
  }
}))

// La bibliothèque se charge à l'ouverture du repli, pas au chargement de la
// page : c'est une requête inutile tant qu'on ne l'a pas dépliée.
$('replBroll').addEventListener('toggle', () => {
  if ($('replBroll').open && !$('listeBroll').children.length) chargeLaBibliotheque()
})

// ---------------------------------------------------------------------------
//  Le menu des vidéos — l'historique, et de quoi en retirer une
// ---------------------------------------------------------------------------
//
// RETIRER UNE VIDÉO, C'EST LA METTRE DE CÔTÉ.
//
// Un dossier de vidéo contient un tournage, et un tournage ne se refait pas :
// la prise a été enregistrée un jour précis, dans une pièce précise, avec une
// voix qui n'était pas tout à fait la même. Le rendu se refabrique en huit
// minutes ; la prise, jamais. Le bouton déplace donc dans
// `videos/.corbeille/` — même geste, même résultat à l'écran, et une chance de
// revenir en arrière.

const ETIQUETTES = {
  script: 'script', rush: 'prise', voixChoisie: 'voix', audio: 'audio',
  transcript: 'transcript', soustitres: 'sous-titres', plan: 'plan', rendu: 'rendu',
}

const jour = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function ouvreLeMenuDesVideos() {
  ouvreVoile('voileVideos', 'btnFermeVideos')
  $('noteVideos').textContent = ''
  dessineLesVideos()
  chargeLaCorbeille()
}

function dessineLesVideos() {
  const liste = $('listeVideos')
  liste.replaceChildren()

  if (!appli.videos?.length) {
    const p = creer('p', 'vide')
    p.textContent = `Aucune vidéo.`
    liste.append(p)
    return
  }

  for (const v of appli.videos) {
    const ligne = creer('div', 'video-ligne')
    if (v.slug === appli.slug) ligne.classList.add('courante')

    const texte = creer('div', 'video-texte')
    const nom = creer('span', 'video-nom')
    nom.textContent = v.slug
    const meta = creer('span', 'video-meta')
    const rendu = v.etapes?.rendu
    meta.textContent = [
      jour(v.modifie_le),
      rendu?.verdict === 'fait' ? `rendu · ${rendu.poidsMo?.toFixed?.(0) ?? '?'} Mo` : ETIQUETTES[v.etape_courante] ?? v.etape_courante,
      v.format,
    ]
      .filter(Boolean)
      .join(' · ')
    texte.append(nom, meta)

    const actions = creer('div', 'video-actions')
    if (v.slug === appli.slug) {
      // La vidéo déjà ouverte a un bouton elle aussi : ce menu n'est plus
      // seulement l'historique de la chaîne, c'est l'écran par lequel on entre.
      // Sans lui, la ligne la plus souvent choisie était la seule qu'on ne
      // pouvait pas choisir.
      // La pastille devant le nom dit qu'on y est ; le mot à côté du bouton le
      // répétait.
      const reprend = creer('button', 'bouton minuscule primaire')
      reprend.type = 'button'
      reprend.textContent = 'Continuer'
      reprend.addEventListener('click', () => fermeVoile('voileVideos'))
      actions.append(reprend)
    } else {
      const ouvre = creer('button', 'bouton minuscule')
      ouvre.type = 'button'
      ouvre.textContent = 'Ouvrir'
      ouvre.addEventListener('click', () => {
        appli.slug = v.slug
        $('selVideo').value = v.slug
        fermeVoile('voileVideos')
        rafraichitEtat().then(() => montre(premiereEtapeUtile()))
      })
      actions.append(ouvre)
    }

    const retire = creer('button', 'bouton minuscule discret')
    retire.type = 'button'
    // « SUPPRIMER », PARCE QUE C'EST LE GESTE QU'ON CHERCHE.
    //
    // Le bouton disait « Retirer » pour rester exact : la vidéo part à la
    // corbeille, elle n'est pas détruite. Mais on ne cherche pas un bouton
    // d'après ce qu'il fait en coulisse — on le cherche d'après son intention,
    // et l'intention ici est de supprimer. La nuance a sa place dans la
    // confirmation, qui dit où la vidéo part et comment la reprendre.
    retire.textContent = 'Supprimer'
    retire.title = `Déplace le dossier dans videos/.corbeille/`
    retire.addEventListener('click', () => retireLaVideo(v, retire))
    actions.append(retire)

    ligne.append(texte, actions)
    liste.append(ligne)
  }
}

async function retireLaVideo(v, bouton) {
  const ok = await demandeConfirmation({
    titre: `Supprimer « ${v.slug} » ?`,
    quoi: `Elle part à la corbeille, et le bouton « Remettre » l'en sort. ` +
      `Un tournage ne se refait pas : c'est pour ça qu'elle n'est pas détruite.`,
    action: 'Supprimer',
  })
  if (!ok) return
  bouton.disabled = true
  try {
    const r = await api(`/api/videos/${encodeURIComponent(v.slug)}`, { methode: 'DELETE' })
    appli.videos = r.videos ?? appli.videos
    if (appli.slug === v.slug) appli.slug = appli.videos[0]?.slug ?? null
    await rafraichitEtat()
    dessineLesVideos()
    chargeLaCorbeille()
    $('noteVideos').textContent = `« ${v.slug} » est dans la corbeille — récupérable.`
  } catch (e) {
    $('noteVideos').textContent = e.message
    bouton.disabled = false
  }
}

async function chargeLaCorbeille() {
  const zone = $('listeCorbeille')
  zone.replaceChildren()
  let liste = []
  try {
    liste = (await api('/api/corbeille')).resultat?.corbeille ?? []
  } catch {
    return
  }
  $('compteCorbeille').textContent = liste.length ? `— ${liste.length}` : ''
  $('replCorbeille').hidden = liste.length === 0
  $('btnVideCorbeille').hidden = liste.length === 0

  for (const c of liste) {
    const ligne = creer('div', 'video-ligne')
    const texte = creer('div', 'video-texte')
    const nom = creer('span', 'video-nom')
    nom.textContent = c.nom
    const meta = creer('span', 'video-meta')
    meta.textContent = `${(c.octets / 1e6).toFixed(0)} Mo`
    texte.append(nom, meta)

    const remets = creer('button', 'bouton minuscule')
    remets.type = 'button'
    remets.textContent = 'Remettre'
    remets.addEventListener('click', async () => {
      remets.disabled = true
      try {
        const r = await api('/api/corbeille/restaure', { methode: 'POST', corps: { nom: c.nom } })
        appli.videos = r.videos ?? appli.videos
        await rafraichitEtat()
        dessineLesVideos()
        chargeLaCorbeille()
      } catch (e) {
        $('noteVideos').textContent = e.message
        remets.disabled = false
      }
    })

    const actions = creer('div', 'video-actions')
    actions.append(remets)
    ligne.append(texte, actions)
    zone.append(ligne)
  }
}

// LA CORBEILLE NE POUVAIT PAS SE VIDER, et son contenu ne s'efface jamais tout
// seul : au bout de quelques essais, plusieurs gigaoctets attendaient sans que
// rien ne le dise.
$('btnVideCorbeille').addEventListener('click', async () => {
  const liste = [...$('listeCorbeille').children]
  const ok = await demandeConfirmation({
    titre: `Vider la corbeille ?`,
    quoi: `${liste.length} vidéo${liste.length > 1 ? 's' : ''} supprimée${liste.length > 1 ? 's' : ''} définitivement. Les tournages qu'elles contiennent n'existeront plus.`,
    action: 'Vider',
  })
  if (!ok) return
  await pendant($('btnVideCorbeille'), 'Suppression…', async () => {
    try {
      // UNE SEULE ROUTE, ET SÛREMENT PAS UNE BOUCLE SUR LES SLUGS.
      //
      // Retrouver le slug avant l'horodatage pour appeler la suppression
      // définitive d'une vidéo aurait supprimé la vidéo VIVANTE de ce nom —
      // celle qu'on est peut-être en train de monter — au lieu de l'entrée mise
      // de côté. Les deux vivent dans des dossiers différents.
      await api('/api/corbeille', { methode: 'DELETE' })
    } catch (e) {
      $('noteVideos').textContent = e.message
    }
    await chargeLaCorbeille()
  })
})

$('btnVideos').addEventListener('click', ouvreLeMenuDesVideos)
$('btnFermeVideos').addEventListener('click', () => fermeVoile('voileVideos'))


// ---------------------------------------------------------------------------
//  Le menu des chaînes
// ---------------------------------------------------------------------------
//
// UNE CHAÎNE EST UN DOSSIER, ET RIEN D'AUTRE (CLAUDE.md §1). Ce menu ne tient
// donc aucun registre : le serveur liste les dossiers voisins qui portent un
// `config/chaine.json`. Un dossier copié à la main, restauré d'une sauvegarde ou
// synchronisé depuis un autre poste y apparaît sans qu'on ait rien déclaré, et
// un dossier supprimé en disparaît sans laisser d'entrée fantôme.
//
// EN CHANGER RELANCE LE SERVEUR, et l'interface doit le dire. `CHEMINS.racine`
// est figé à l'import du côté serveur : le rebrancher à chaud laisserait un
// travail en cours écrire dans l'ancienne chaîne pendant qu'on regarde la
// nouvelle. Une relance coûte deux secondes et ne laisse rien à moitié déplacé.

/**
 * ON ENTRE EN DEUX MARCHES : UNE CHAÎNE, PUIS UNE VIDÉO.
 *
 * LE DÉFAUT QU'ON CORRIGE : `Start.bat` déposait droit dans la première étape
 * utile de la première vidéo venue — une prise à moitié montée, dont on ne se
 * souvenait pas, dans une chaîne qu'on n'avait pas choisie. Les deux menus
 * existaient pourtant déjà, mais derrière le titre « Atelier » et derrière
 * « Gérer » : personne n'ouvre un menu pour choisir ce qu'on lui a déjà donné.
 *
 * Les deux marches sont bien deux questions distinctes, et l'ordre n'est pas
 * décoratif : la seconde n'a de sens qu'une fois la première tranchée, puisque
 * changer de chaîne relance le serveur et remplace la liste des vidéos.
 *
 * L'ENTRÉE SE RETIENT PAR ONGLET, ET C'EST TOUT CE QU'IL FAUT.
 *
 * `sessionStorage` meurt avec l'onglet : la fenêtre ouverte par `Start.bat` est
 * neuve, donc on repart des deux menus. Une fois dans une vidéo, F5 ou un retour
 * dans la fenêtre ne les fait pas revenir — reposer la question à chaque
 * rafraîchissement serait le défaut inverse. Entre les deux, la marque vaut
 * « la chaîne est choisie, la vidéo non » : c'est exactement l'état dans lequel
 * une bascule de chaîne recharge la page.
 */
const CLE_ENTREE = 'atelier.entree'

/** `null` — rien de choisi · `'chaine'` — reste la vidéo · `'video'` — au travail. */
function etatDEntree() {
  // Si le stockage est refusé, on répond « rien de choisi » : les menus
  // reviennent à chaque rafraîchissement, ce qui est pénible mais visible.
  // Répondre l'inverse aurait rétabli l'ancien défaut en silence, sur les seuls
  // postes où il ne se serait jamais reproduit chez nous.
  try { return sessionStorage.getItem(CLE_ENTREE) } catch { return null }
}

function marqueLEntree(etape) {
  try { sessionStorage.setItem(CLE_ENTREE, etape) } catch { /* mode privé */ }
}

/**
 * Ce qu'on fait en refermant le menu des chaînes, quand on est en train
 * d'entrer. Vide le reste du temps : refermer ce menu au milieu d'un montage
 * doit rendre la main au montage, pas ouvrir une seconde question.
 */
let apresLesChaines = null

/**
 * Ce qui manque à une chaîne s'écrit SOUS SON NOM, pas dans sa rangée de boutons.
 *
 * Il y vivait, et la rangée porte jusqu'à trois boutons : la colonne des actions
 * gonflait, celle du texte se retrouvait à cent pixels, et « 0 vidéo » se
 * coupait en « 0 » d'un côté et « vidéo » de l'autre, de part et d'autre des
 * boutons. Un manque n'est pas une action — c'est un ÉTAT, il appartient à la
 * ligne qui décrit la chaîne.
 */
function manque(mot) {
  const e = creer('span', 'chaine-manque')
  e.textContent = mot
  return e
}

async function ouvreLeMenuDesChaines() {
  ouvreVoile('voileChaines', 'btnFermeChaines')
  const liste = $('listeChaines')
  liste.replaceChildren()
  $('noteChaines').textContent = 'Lecture des dossiers voisins…'

  let d
  try {
    d = await api('/api/chaines')
  } catch (e) {
    $('noteChaines').textContent = e.message
    return
  }

  for (const c of d.chaines) {
    // CHAQUE CHAÎNE EST UNE LIGNE, PAS UN BOUTON — ET C'EST LA CORRECTION.
    //
    // Tout était un bouton, désactivé dès que la chaîne ne pouvait pas s'ouvrir.
    // Résultat : trois cartes identiques, aucune cliquable, et rien pour dire
    // quoi faire. Une chaîne qui ne peut pas s'ouvrir n'est pas un cul-de-sac —
    // elle a un manque précis, et ce manque a une réponse précise.
    const carte = creer('div', 'chaine')
    if (c.courante) carte.classList.add('courante')

    const texte = creer('div', 'chaine-texte')
    const nom = creer('span', 'chaine-nom')
    nom.textContent = c.nom
    const meta = creer('span', 'chaine-meta')
    meta.textContent = [
      c.courante ? 'ouverte' : null,
      `${c.videos} vidéo${c.videos > 1 ? 's' : ''}`,
      c.avatar,
    ]
      .filter(Boolean)
      .join(' · ')
    texte.append(nom, meta)

    const actions = creer('div', 'chaine-actions')

    if (c.courante) {
      // LA CHAÎNE OUVERTE A UN BOUTON, ELLE AUSSI.
      //
      // Elle n'avait qu'une mention — « tu es ici » — parce que ce menu ne
      // servait qu'à en CHANGER. Il sert maintenant d'accueil : la ligne où l'on
      // se trouve est la plus souvent choisie, et rien ne permettait de la
      // choisir. Il ne restait que « Fermer », qui ne dit pas ce qu'il ouvre.
      //
      // MAIS « TU ES ICI » NE S'ÉCRIT PAS TROIS FOIS.
      //
      // La ligne le disait par sa bordure d'accent, par « ouverte » dans sa
      // deuxième ligne, ET par une mention collée au bouton. Trois signaux pour
      // un seul fait, dont le plus bruyant — le bouton plein — commandait
      // l'action la moins conséquente de l'écran. Reste la pastille et le mot.
      // L'IDENTITÉ SE CORRIGE APRÈS COUP, DONC ELLE A UNE PORTE PERMANENTE.
      //
      // Le bandeau qui la propose disparaît dès que la chaîne a un nom — c'est
      // son rôle. Sans ce bouton, changer une couleur ou activer un format six
      // mois plus tard renverrait au terminal, et on aurait déplacé le problème
      // au lieu de le régler.
      const identite = creer('button', 'bouton minuscule')
      identite.type = 'button'
      identite.textContent = 'Identité'
      identite.title = `Nom, promesse, produit, formats, cadence, palette`
      identite.addEventListener('click', () => {
        // ALLER À L'IDENTITÉ N'EST PAS AVOIR CHOISI SA VIDÉO.
        //
        // Refermer le menu des chaînes déclenche la seconde marche de l'entrée —
        // le menu des vidéos — et celui-ci venait se poser PAR-DESSUS le
        // panneau d'identité qu'on venait d'ouvrir. On consomme donc la suite
        // avant de fermer : la question « quelle vidéo » se reposera en sortant
        // d'ici, à sa place.
        apresLesChaines = null
        fermeVoile('voileChaines')
        ouvreLIdentite()
      })
      const entre = creer('button', 'bouton minuscule primaire')
      entre.type = 'button'
      entre.textContent = 'Continuer'
      entre.addEventListener('click', () => fermeVoile('voileChaines'))
      actions.append(identite, entre)
    } else if (c.lisible === false) {
      // Un `config/chaine.json` illisible : rien à proposer, la chaîne ne
      // démarrerait nulle part. On dit où regarder.
      carte.classList.add('bloquee')
      texte.append(manque(`config/chaine.json illisible — à réparer à la main`))
    } else if (c.atelier === false) {
      // Le dossier date d'avant l'atelier. C'est le seul cas qui se répare
      // depuis ici, et il se répare en une commande.
      texte.append(manque(`son code date d'avant l'atelier`))
      const maj = creer('button', 'bouton minuscule primaire')
      maj.type = 'button'
      maj.textContent = 'Mettre à jour'
      maj.title = `Remplace pipeline, outils, atelier et skills. Ne touche ni au socle marque, ni à la veille, ni aux vidéos, ni aux clés.`
      maj.addEventListener('click', () => metAJourLaChaine(c, maj))
      actions.append(maj)
    } else if (c.dependances === false) {
      // SANS `node_modules`, LA CHAÎNE NE DÉMARRE PAS — ET CE N'EST PAS RARE.
      //
      // `nouvelle-chaine` ne le copie pas (trois cents mégaoctets), et §4 pose
      // qu'un dossier de chaîne se déplace d'un poste à l'autre : le second n'a
      // rien d'installé. Avant, la ligne proposait « Ouvrir », l'essai à blanc
      // échouait sur un `ERR_MODULE_NOT_FOUND` illisible, et on restait ici sans
      // savoir quoi faire. Le manque a une réponse, elle est ici.
      texte.append(manque(`ses dépendances ne sont pas installées`))
      const pose = creer('button', 'bouton minuscule primaire')
      pose.type = 'button'
      pose.textContent = 'Installer'
      pose.title = `npm install dans ce dossier — plusieurs minutes, et il faut le réseau`
      pose.addEventListener('click', () => installeLesDependances(c, pose))
      actions.append(pose)
    } else if (!c.initialise) {
      // UNE CHAÎNE NEUVE S'OUVRE, ELLE AUSSI — 7 septembre 2026.
      //
      // Elle était marquée « bloquée » et n'offrait qu'un chemin à copier. Or
      // toute chaîne fraîchement créée passe par cet état : le bouton
      // « Nouvelle chaîne », deux lignes plus bas, ne pouvait donc mener qu'ici.
      // On créait une chaîne pour se voir refuser l'entrée.
      //
      // `/init-chaine` reste en conversation — c'est un entretien, pas un
      // formulaire (CLAUDE.md §2) —, et le chemin reste à portée de clic pour y
      // ouvrir Claude Code. Mais le dépôt, la transcription, le carnet et les
      // avatars n'attendent rien de l'initialisation, et l'écran les rend
      // maintenant accessibles. Ce qui manque est écrit sur la ligne, puis
      // rappelé en haut de la chaîne une fois dedans.
      texte.append(manque(`pas encore initialisée`))
      const copie = creer('button', 'bouton minuscule discret')
      copie.type = 'button'
      copie.textContent = 'Copier le chemin'
      copie.title = `Pour y ouvrir Claude Code et lancer /init-chaine`
      copie.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(c.dossier)
          copie.textContent = 'Copié'
          setTimeout(() => { copie.textContent = 'Copier le chemin' }, 1500)
        } catch {
          // Le presse-papiers peut être refusé — dans ce cas on affiche le
          // chemin, qui n'est plus visible ailleurs sur la ligne.
          $('noteChaines').textContent = c.dossier
        }
      })
      const ouvre = creer('button', 'bouton minuscule')
      ouvre.type = 'button'
      ouvre.textContent = 'Ouvrir'
      ouvre.addEventListener('click', () => changeDeChaine(c))
      actions.append(copie, ouvre)
    } else {
      // Une seule dalle pleine par liste : celle de la ligne où l'on est. Sinon
      // trois lignes crient d'égale force et le regard n'a plus de point
      // d'entrée.
      const ouvre = creer('button', 'bouton minuscule')
      ouvre.type = 'button'
      ouvre.textContent = 'Ouvrir'
      ouvre.addEventListener('click', () => changeDeChaine(c))
      actions.append(ouvre)
    }

    // LE TROUSSEAU MANQUANT SE DIT SUR LA LIGNE, ET SE COMBLE DEPUIS ELLE.
    //
    // Il ne bloque rien : la chaîne démarre, monte, transcrit. Il fait rater en
    // silence tout ce qui parle au réseau — les voix Fish ressortent « aucune
    // voix disponible », la banque d'images ne rend rien. On cherche alors la
    // panne du côté du service. Ce n'est donc pas un blocage, c'est une mention,
    // et elle vaut aussi pour une chaîne parfaitement ouvrable.
    if (!c.courante && c.cles === false) {
      texte.append(manque(`pas de clés d'API`))
      const donne = creer('button', 'bouton minuscule')
      donne.type = 'button'
      donne.textContent = 'Copier les clés'
      donne.title = `Copie le trousseau de la chaîne ouverte. Les deux partageront les mêmes comptes et les mêmes quotas.`
      donne.addEventListener('click', () => donneLesCles(c, donne))
      actions.append(donne)
    }

    // La chaîne ouverte n'a pas de bouton de suppression : on ne retire pas le
    // sol sur lequel on se tient, et le serveur le refuserait de toute façon.
    if (!c.courante) {
      const jette = creer('button', 'bouton minuscule discret')
      jette.type = 'button'
      jette.textContent = 'Supprimer'
      jette.title = `Met le dossier à la corbeille de Windows — récupérable`
      jette.addEventListener('click', () => supprimeLaChaine(c, jette))
      actions.append(jette)
    }

    carte.append(texte, actions)
    liste.append(carte)
  }

  // AUCUN PARAGRAPHE D'EXPLICATION ICI.
  //
  // Il y en avait deux : ce qu'est une chaîne, et ce que fait une bascule. Le
  // bouton de chaque ligne dit déjà ce qu'il fait — « Ouvrir », « Mettre à
  // jour », « Copier le chemin » — et `noteChaines` sert au RÉSULTAT d'une
  // action, pas à préparer le lecteur. On lit une interface en agissant.
  $('noteChaines').textContent = ''
}

/**
 * Bascule sur une autre chaîne.
 *
 * Le serveur répond AVANT de se relancer, puis le port se tait pendant une ou
 * deux secondes. On l'interroge jusqu'à ce qu'il réponde, et on recharge la
 * page — recharger tout de suite tomberait sur un port mort et afficherait une
 * erreur de navigateur, ce qui ne dit rien de ce qui se passe.
 */
async function changeDeChaine(c) {
  const note = $('noteChaines')

  // ON PARLE AVANT D'ATTENDRE, PAS APRES.
  //
  // Changer de chaine n'est pas un appel court : le serveur essaie d'abord la
  // chaine visee A BLANC — il demarre son atelier sur un port de passage et
  // attend qu'il reponde — puis il se relance, et le navigateur sonde le port
  // mort jusqu'a ce qu'il revive. Plusieurs secondes, dont aucune n'etait
  // annoncee : le premier mot n'arrivait qu'APRES la reponse du serveur, donc
  // apres la plus longue partie de l'attente. On cliquait sur une ligne, il ne
  // se passait rien, et on recliquait.
  note.textContent = `Vérification de « ${c.nom} »…`
  // La liste entiere se fige : deux bascules lancees en meme temps feraient
  // partir deux serveurs sur le meme port, et le second mourrait sur EADDRINUSE.
  for (const b of $('listeChaines').querySelectorAll('button')) b.disabled = true

  try {
    await api('/api/chaines/ouvre', { methode: 'POST', corps: { dossier: c.dossier } })
  } catch (e) {
    note.textContent = e.message
    for (const b of $('listeChaines').querySelectorAll('button')) b.disabled = false
    return
  }

  note.textContent = `Relance sur « ${c.nom} »…`
  // ON SONDE TOUT DE SUITE, ET SERRÉ.
  //
  // La boucle attendait 500 ms AVANT le premier essai, puis 500 ms entre chaque.
  // L'atelier cible répond en 240 ms : on lui offrait donc une demi-seconde
  // d'attente pure sur un serveur déjà debout. Vingt secondes de patience au
  // total, c'est la même chose en 200 tours de 100 ms.
  for (let essai = 0; essai < 200; essai++) {
    if (essai) await pause(100)
    try {
      const r = await fetch('/api/chaines', { cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        // On attend que ce soit la BONNE chaîne : l'ancien serveur peut encore
        // répondre pendant sa fermeture, et recharger à ce moment-là ramènerait
        // exactement là d'où on vient.
        if (d.courante && d.courante.replace(/\\/g, '/') === c.dossier.replace(/\\/g, '/')) {
          // On vient de choisir la chaîne : la page rechargée ne repose pas la
          // question qu'on vient de trancher, elle passe à la suivante — quelle
          // vidéo, dans cette chaîne-là.
          marqueLEntree('chaine')
          location.reload()
          return
        }
      }
    } catch { /* le port se tait pendant la relance : c'est attendu */ }
  }
  note.textContent =
    `L'atelier n'est pas revenu. Ouvre une fenêtre dans « ${c.dossier} » et lance : npm run atelier`
}

/**
 * Remet le code d'une autre chaîne à jour depuis celle-ci.
 *
 * On ne touche qu'au CODE : pipeline, outils, atelier, skills, polices. Le
 * travail — socle marque, veille, stratégie, vidéos, identité, clés — reste
 * intact. C'est la commande `npm run maj-chaine` qui le garantit, pas cette
 * page : elle ne fait que l'appeler.
 */
async function metAJourLaChaine(c, bouton) {
  const note = $('noteChaines')
  await pendant(bouton, 'Copie…', async () => {
    try {
      await api('/api/chaines/maj', { methode: 'POST', corps: { dossier: c.dossier } })
      note.textContent = `« ${c.nom} » est à jour. Son travail n'a pas bougé.`
      await ouvreLeMenuDesChaines()
    } catch (e) {
      note.textContent = e.message
    }
  })
}

/**
 * Met une chaîne à la corbeille de Windows.
 *
 * À LA CORBEILLE, PAS AU BROYEUR. Un dossier de chaîne contient un socle
 * marketing écrit à la main, une veille payée en crédits, et des tournages. Le
 * rendu se refabrique ; le reste, non. La confirmation demande le NOM plutôt
 * qu'un oui : sur un geste irréversible, un « OK » se clique sans lire.
 */
async function supprimeLaChaine(c, bouton) {
  const ok = await demandeConfirmation({
    titre: `Supprimer « ${c.nom} » ?`,
    quoi:
      `${c.videos} vidéo${c.videos > 1 ? 's' : ''}, son socle marque et sa veille partent à la ` +
      `corbeille de Windows. Récupérable d'un clic droit.`,
  })
  if (!ok) return
  bouton.disabled = true
  try {
    await api('/api/chaines', { methode: 'DELETE', corps: { dossier: c.dossier } })
    await ouvreLeMenuDesChaines()
    $('noteChaines').textContent = `« ${c.nom} » est à la corbeille de Windows.`
  } catch (e) {
    $('noteChaines').textContent = e.message
    bouton.disabled = false
  }
}

// ------------------------------------------------------- créer une chaîne ---
//
// Le dossier se copie ici, en trois secondes. Les DEUX étapes qui restent ne
// peuvent pas se faire derrière un bouton, et il faut le dire une fois :
//
//   `npm install`   long, demande le réseau — on l'enchaîne sur demande ;
//   `/init-chaine`  un entretien sur le produit, l'avatar, le marketeur et la
//                   direction artistique. Ce sont des décisions, pas un
//                   formulaire — CLAUDE.md §2.

$('btnNouvelleChaine').addEventListener('click', () => {
  $('nchNom').value = ''
  // Cochée par défaut : sans clés, une chaîne neuve ne peut ni chercher un plan
  // de coupe, ni fabriquer une voix, ni scraper la niche.
  $('nchCles').checked = true
  $('nchErreur').hidden = true
  $('nchEtat').hidden = true
  ouvreVoile('voileNouvChaine', 'nchNom')
  $('nchNom').focus()
})
$('nchNon').addEventListener('click', () => fermeVoile('voileNouvChaine'))
$('nchNom').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('nchOui').click() }
})

$('nchOui').addEventListener('click', async () => {
  const nom = $('nchNom').value.trim()
  if (!nom) {
    // Un clic sans effet se lit comme un bouton cassé : la zone d'erreur existe
    // déjà pour le refus du serveur, elle sert aussi bien ici.
    $('nchErreur').textContent = `Donne un nom : ce sera celui du dossier voisin.`
    $('nchErreur').hidden = false
    $('nchNom').focus()
    return
  }
  $('nchErreur').hidden = true
  await pendant($('nchOui'), 'Création…', async () => {
    try {
      await creeLaChaineEtLOuvre(nom, $('nchCles').checked)
    } catch (e) {
      $('nchEtat').hidden = true
      $('nchErreur').textContent = e.message
      $('nchErreur').hidden = false
    }
  })
})

/**
 * Créer une chaîne, l'équiper, et entrer dedans. D'un seul geste.
 *
 * TROIS ÉTAPES DONT DEUX ÉTAIENT À LA CHARGE DE L'UTILISATEUR.
 *
 * « Créer » ne faisait que copier le code. Il fallait ensuite cliquer
 * « Installer ses dépendances » dans une note en bas du panneau, puis retrouver
 * la ligne de la chaîne et cliquer « Ouvrir ». Trois gestes séparés par deux
 * écrans, pour une suite qui n'a qu'un ordre possible et aucune décision : on ne
 * crée pas une chaîne pour la laisser sans ses dépendances, et on ne l'installe
 * pas pour ne pas y entrer.
 *
 * C'est du §2 mal appliqué : la règle sépare ce qui se JUGE de ce qui s'exécute,
 * pas les étapes d'une même exécution. Copier, installer, ouvrir sont trois
 * gestes mécaniques — ils s'enchaînent.
 *
 * CE QUI NE S'ENCHAÎNE PAS : `/init-chaine`. C'est un entretien — produit,
 * avatar, marketeur, direction artistique —, il se mène en conversation, et la
 * première interface de ce dossier est morte d'avoir voulu le mettre sur un
 * bouton. La chaîne est utilisable sans lui : la cascade des sous-titres et les
 * polices embarquées donnent des réglages complets. Ce qu'il apporte, c'est
 * l'éditorial, pas la mécanique.
 */
async function creeLaChaineEtLOuvre(nom, avecCles) {
  const etat = $('nchEtat')
  const dis = (mot) => { etat.textContent = mot; etat.hidden = false }

  dis(`Copie du code…`)
  const r = await api('/api/chaines', { methode: 'POST', corps: { nom, avecCles } })

  // `npm install` prend plusieurs minutes et demande le réseau. Le journal
  // s'ouvre : un écran muet pendant trois minutes se lit comme un plantage.
  dis(`Installation des dépendances — plusieurs minutes. Le journal s'ouvre.`)
  const t = await api('/api/chaines/installe', { methode: 'POST', corps: { dossier: r.dossier } })
  const fini = await suisLeTravail(t.travail)
  if (fini && fini.etat === 'echec') {
    throw new Error(
      `Les dépendances n'ont pas pu s'installer — « ${nom} » est créée mais vide de code exécutable. ` +
        `Le journal dit pourquoi. Tu peux réessayer depuis sa ligne dans le menu des chaînes.`
    )
  }

  dis(`Ouverture de « ${nom} »…`)
  fermeVoile('voileNouvChaine')
  await changeDeChaine({ nom, dossier: r.dossier })
}

/**
 * Installe les dépendances d'une chaîne, depuis sa ligne.
 *
 * C'était une note en bas du panneau, écrite après une création. Elle ne servait
 * donc qu'une fois, et jamais pour le cas le plus courant : une chaîne arrivée
 * d'un autre poste, dont `node_modules` n'a pas voyagé (§4). Le manque appartient
 * à la CHAÎNE, pas au moment où on l'a créée — il vit sur sa ligne.
 */
/**
 * Donne le trousseau de la chaîne ouverte à une autre.
 *
 * ON LE DIT AVANT DE LE FAIRE : les deux chaînes partageront alors les mêmes
 * comptes. Un crédit fal dépensé ici manque là-bas, et un quota Apify est un
 * seul quota. C'est un choix légitime — ce sont les mêmes comptes que les tiens
 * — mais il ne se devine pas en regardant deux dossiers.
 */
async function donneLesCles(c, bouton) {
  const note = $('noteChaines')
  // PAS DE CONFIRMATION : LE PARTAGE EST L'INTENTION, PAS UN RISQUE.
  //
  // Une fenêtre demandait d'accepter que les deux chaînes partagent les mêmes
  // comptes. C'était traiter comme un danger ce qui est le fonctionnement
  // voulu : ce sont les mêmes comptes, ils servent à toutes les chaînes, et
  // `nouvelle-chaine` les copie déjà par défaut. Une question dont la réponse
  // est toujours oui apprend à cliquer sans lire, et vide de son sens celle qui
  // porte un vrai montant.
  bouton.disabled = true
  try {
    await api('/api/chaines/cles', { methode: 'POST', corps: { dossier: c.dossier } })
    await ouvreLeMenuDesChaines()
    note.textContent = `« ${c.nom} » a maintenant les mêmes clés que cette chaîne-ci.`
  } catch (e) {
    note.textContent = e.message
    bouton.disabled = false
  }
}

async function installeLesDependances(c, bouton) {
  const note = $('noteChaines')
  bouton.disabled = true
  try {
    const t = await api('/api/chaines/installe', { methode: 'POST', corps: { dossier: c.dossier } })
    const fini = await suisLeTravail(t.travail)
    await ouvreLeMenuDesChaines()
    note.textContent =
      fini && fini.etat === 'echec'
        ? `L'installation a échoué. Le journal dit pourquoi.`
        : `« ${c.nom} » a ses dépendances.`
  } catch (e) {
    note.textContent = e.message
    bouton.disabled = false
  }
}

$('btnChaines').addEventListener('click', ouvreLeMenuDesChaines)
$('btnFermeChaines').addEventListener('click', () => fermeVoile('voileChaines'))


// ---------------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------------

/**
 * Charge les polices d'`assets/fonts/` pour que l'aperçu dessine avec la VRAIE
 * famille, et pas avec un substitut de chasse voisine.
 *
 * Sans ça, cet écran demandait de choisir un dessin de lettres en en montrant
 * un autre — sur le seul écran dont c'est le rôle. Les fichiers sont servis par
 * l'atelier sous `/polices/`, et ce sont exactement ceux que le rendu embarque :
 * ce qu'on voit ici est ce qu'on aura.
 *
 * Une police VARIABLE se déclare sur toute la plage `100 900`. Restreindre la
 * plage force le navigateur à synthétiser le gras, qui sort baveux — c'est la
 * même règle que `construisTheme` applique côté rendu.
 */
function declareLesPolices(fichiers) {
  const style = document.createElement('style')
  style.textContent = fichiers
    .map((p) => {
      const url = `/polices/${encodeURIComponent(p.fichier)}`
      const graisse = p.variable ? '100 900' : (/black|extrabold/i.test(p.fichier) ? '800' : /bold/i.test(p.fichier) ? '700' : '400')
      return (
        `@font-face{font-family:'${p.famille}';src:url('${url}');` +
        `font-weight:${graisse};font-style:${p.italique ? 'italic' : 'normal'};font-display:block}`
      )
    })
    .join('\n')
  document.head.append(style)
  precharge(fichiers.map((p) => p.famille))
}

/**
 * ON NE DÉCLARE PAS UNE POLICE, ON LA CHARGE.
 *
 * Une `@font-face` seule ne télécharge rien : le navigateur attend qu'un nœud
 * réclame la famille. Au moment où l'on choisit « Montserrat » dans la liste,
 * le fichier part alors sur le réseau — et `font-display: block` rend le texte
 * INVISIBLE tant qu'il n'est pas arrivé, jusqu'à trois secondes.
 *
 * Sur cet écran, l'aperçu tourne en boucle et change de page toutes les deux
 * secondes : la page choisie disparaît, la suivante revient dans la nouvelle
 * police, et l'œil ne raccroche jamais les deux. Le seul réglage dont le
 * résultat n'était pas immédiat était donc aussi le seul qui se lisait comme
 * un bouton mort — « je change la police et rien ne se passe ».
 *
 * Les neuf fichiers pèsent quelques mégaoctets, servis en local, une fois par
 * ouverture de l'atelier. On les charge tous au démarrage : le changement de
 * police devient instantané, comme les couleurs et les curseurs.
 */
function precharge(familles) {
  if (!document.fonts?.load) return
  // La graisse demandée doit être celle que l'aperçu dessine (800), sinon le
  // navigateur charge une instance et en affiche une autre.
  for (const f of familles) document.fonts.load(`800 100px '${f}'`).catch(() => {})
}

/**
 * La hauteur réelle de l'en-tête, tenue à jour.
 *
 * Trois éléments collants s'y accrochent. Elle était écrite en dur à 86 px —
 * juste tant que la fenêtre est large. Dès qu'elle se replie en deux rangs, la
 * première marche du rail passe dessous et devient inatteignable.
 */
function suisLaHauteurDeLEntete() {
  const entete = document.querySelector('.entete')
  if (!entete) return
  const poser = () =>
    document.documentElement.style.setProperty('--h-entete', `${Math.round(entete.offsetHeight)}px`)
  poser()
  new ResizeObserver(poser).observe(entete)
}

// ---------------------------------------------------------------------------
//  Le budget des services payants
// ---------------------------------------------------------------------------
//
// UN CHIFFRE QU'ON NE VOIT PAS N'EXISTE PAS.
//
// fal se paie à la génération, ElevenLabs à la minute convertie. Les deux
// soldes ne se consultaient qu'en tapant une commande — donc jamais, et on les
// découvrait quand une génération s'arrêtait au milieu. Ils sont maintenant
// dans l'en-tête, à côté du nom de la chaîne.
//
// ON NE LES RELIT PAS À CHAQUE SECONDE, ET C'EST VOLONTAIRE : chaque lecture
// est un aller-retour réseau vers trois services. On relit à l'ouverture, au
// retour dans la fenêtre, et après chaque travail qui a pu dépenser.

// ---------------------------------------------------------------------------
//  Le trousseau
// ---------------------------------------------------------------------------
//
// AJOUTER UNE CLE ETAIT LE DERNIER GESTE QUI OBLIGEAIT LE TERMINAL.
//
// Le message d'echec disait « Ajoute ou reactive une cle dans config/keys.json »
// — un fichier a editer a la main. Or une cle morte bloque net : la deduction de
// script s'arrete sur un 401, et il n'y a rien a cliquer.
//
// LA VALEUR NE S'AFFICHE JAMAIS, ET NE SE JOURNALISE PAS. Le champ est un
// `password`, la valeur part sur l'entree standard du processus qui l'enregistre
// (voir la route), et l'ecran ne la relit nulle part : apres l'envoi, on le vide.

async function ouvreLeTrousseau() {
  ouvreVoile('voileCles', 'cleValeur')
  $('noteCles').textContent = ''
  await dessineLeTrousseau()
}

async function dessineLeTrousseau() {
  const liste = $('listeCles')
  liste.replaceChildren()
  let d
  try {
    const r = await api('/api/cles')
    d = r.resultat ?? {}
  } catch (e) {
    $('noteCles').textContent = e.message
    return
  }

  const services = d.services ?? []
  // Le selecteur vient du trousseau, pas d'une liste ecrite ici : une liste en
  // dur divergerait au premier service ajoute, et l'ecran proposerait un service
  // que la commande refuse.
  const sel = $('cleService')
  const avant = sel.value
  sel.replaceChildren()
  for (const x of services) {
    const o = creer('option')
    o.value = x.service
    o.textContent = `${x.service} — ${x.role}`
    sel.append(o)
  }
  if (avant) sel.value = avant

  for (const x of services) {
    const bloc = creer('div', 'service-cles')
    const h = creer('h4')
    h.textContent = `${x.service} — ${x.disponibles} disponible${x.disponibles > 1 ? 's' : ''} sur ${x.total}`
    const role = creer('p', 'role')
    role.textContent = x.role
    bloc.append(h, role)

    for (const c of x.cles ?? []) {
      const l = creer('div', 'cle-ligne')
      if (c.frigo) l.classList.add('frigo')
      const g = creer('div')
      const m = creer('span', 'cle-masque')
      m.textContent = `${c.label}  ${c.masque}`
      g.append(m)
      const etat = creer('div', 'cle-etat')
      etat.textContent = [
        c.frigo ? 'au frigo — a échoué' : null,
        !c.active ? 'désactivée' : null,
        c.tier === 'free' ? 'palier gratuit' : null,
      ].filter(Boolean).join(' · ')
      g.append(etat)

      const actions = creer('div', 'voix-actions')
      if (c.frigo) {
        const d = creer('button', 'bouton minuscule')
        d.type = 'button'
        d.textContent = 'Dégeler'
        d.title = `La remet en service. Si elle échoue encore, elle repart au frigo.`
        d.addEventListener('click', (ev) =>
          pendant(ev.currentTarget, '…', async () => {
            await api('/api/cles/degele', { methode: 'POST', corps: { service: x.service } })
            await dessineLeTrousseau()
          })
        )
        actions.append(d)
      }
      const jette = creer('button', 'bouton minuscule discret')
      jette.type = 'button'
      jette.textContent = 'Retirer'
      jette.addEventListener('click', () => retireUneCle(x.service, c.label))
      actions.append(jette)

      l.append(g, actions)
      bloc.append(l)
    }
    if (!(x.cles ?? []).length) {
      const vide = creer('p', 'note')
      vide.textContent = `Aucune clé.`
      bloc.append(vide)
    }
    liste.append(bloc)
  }
}

async function retireUneCle(service, label) {
  const ok = await demandeConfirmation({
    titre: `Retirer « ${label} » de ${service} ?`,
    quoi: `La clé est effacée du trousseau. Elle n'est pas révoquée chez le service — ça, ça se fait dans leur console.`,
    action: 'Retirer',
  })
  if (!ok) return
  try {
    await api('/api/cles', { methode: 'DELETE', corps: { service, label } })
    await dessineLeTrousseau()
    $('noteCles').textContent = `« ${label} » retirée.`
  } catch (e) {
    $('noteCles').textContent = e.message
  }
}

$('btnAjouteCle').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, 'Vérification…', async () => {
    const valeur = $('cleValeur').value.trim()
    if (!valeur) {
      $('noteCles').textContent = `Colle la clé dans le champ.`
      return
    }
    try {
      await api('/api/cles', {
        methode: 'POST',
        corps: {
          service: $('cleService').value,
          valeur,
          label: $('cleLabel').value.trim() || undefined,
          tier: $('cleTier').value,
        },
      })
      // On vide le champ AVANT de redessiner : une clé qui reste affichée dans
      // un formulaire est une clé qu'on oublie a l'ecran.
      $('cleValeur').value = ''
      $('cleLabel').value = ''
      await dessineLeTrousseau()
      // Une clé qu'on vient de poser change le solde : on le relit pour de bon.
      majLeBudget({ force: true }).catch(() => {})
      // ON NE DIT PAS « VÉRIFIÉE » : `cles.mjs --ajoute` NE VÉRIFIE PAS.
      //
      // Il refuse un doublon et le gabarit d'exemple, rien de plus — aucun appel
      // au service. Annoncer une vérification qui n'a pas eu lieu ferait chercher
      // ailleurs le jour où la clé est fausse : on croirait le trousseau bon et
      // on suspecterait le réseau, le quota, la commande.
      $('noteCles').textContent =
        `Clé ajoutée. Elle sera essayée au premier appel — refusée, elle partira au frigo.`
    } catch (e) {
      $('noteCles').textContent = e.message
    }
  })
)

$('btnDegele').addEventListener('click', (ev) =>
  pendant(ev.currentTarget, '…', async () => {
    await api('/api/cles/degele', { methode: 'POST', corps: {} })
    await dessineLeTrousseau()
    $('noteCles').textContent = `Frigo vidé — les clés écartées repartent en service.`
  })
)

$('btnFermeCles').addEventListener('click', () => fermeVoile('voileCles'))

// LE BUDGET OUVRE LE TROUSSEAU : c'est le meme sujet, et c'est la qu'on regarde
// quand un service ne repond plus.
$('budget').addEventListener('click', ouvreLeTrousseau)
$('budget').style.cursor = 'pointer'
$('budget').setAttribute('role', 'button')
$('budget').setAttribute('tabindex', '0')

// Un solde relu il y a moins d'une minute est un solde à jour : les services
// facturent à la génération, pas à la seconde. Les moments où l'on veut le
// chiffre FRAIS — l'ouverture de l'atelier, une clé qu'on vient de poser — le
// demandent explicitement.
const SOLDES_FRAIS_MS = 60_000
let soldesLusA = 0

async function majLeBudget({ force = false } = {}) {
  const zone = $('budget')
  if (!force && Date.now() - soldesLusA < SOLDES_FRAIS_MS) return
  soldesLusA = Date.now()
  try {
    const r = await api('/api/quotas')
    const q = r.resultat?.quotas ?? {}
    const bouts = []

    // fal en dollars, ElevenLabs en minutes, Fish en dollars : chaque service
    // garde SON unité. Les ramener à une seule les rendrait tous faux.
    //
    // LES DEUX SERVICES DE VOIX SE SUIVENT, ET CE N'EST PAS DE L'ORDRE ALPHA-
    // BÉTIQUE. On choisit entre eux — ElevenLabs convertit une prise, Fish lit
    // un texte —, et un arbitrage se lit mieux quand les deux chiffres sont
    // côte à côte. Fish manquait : c'est pourtant le plus vite dépensé des
    // trois, une voix off de dix minutes coûtant quinze centimes qu'on refait
    // cinq fois avant d'être content.
    if (q.fal?.resume) bouts.push({ nom: 'fal', valeur: q.fal.resume, alerte: q.fal.alerte })
    if (q.elevenlabs?.resume) {
      bouts.push({
        nom: 'ElevenLabs',
        valeur: q.elevenlabs.resume.replace(' de conversion', ''),
        alerte: q.elevenlabs.alerte,
      })
    }
    if (q.fish?.resume) bouts.push({ nom: 'Fish', valeur: q.fish.resume, alerte: q.fish.alerte })
    if (!bouts.length) { zone.hidden = true; return }

    zone.replaceChildren()
    for (const b of bouts) {
      const e = creer('span', b.alerte ? 'budget-poste bas' : 'budget-poste')
      const nom = creer('span', 'budget-nom')
      nom.textContent = b.nom
      const val = creer('b')
      val.textContent = b.valeur
      e.append(nom, val)
      zone.append(e)
    }
    zone.title =
      `Soldes réels, relus à l'ouverture et au retour dans la fenêtre.` +
      (q.apify?.resume ? `\nApify : ${q.apify.resume}` : '')
    zone.hidden = false
  } catch {
    // Un service injoignable ne doit pas colorer tout l'écran en rouge : on
    // n'affiche rien plutôt que d'annoncer une panne qui n'en est pas une.
    zone.hidden = true
  }
}

/**
 * Le rappel d'initialisation, en tête d'écran, tant que la chaîne n'a pas de
 * carte d'identité.
 *
 * L'ATELIER OUVRE UNE CHAÎNE NEUVE, ET DIT CE QU'IL LUI MANQUE.
 *
 * Avant, il la refusait — donc il refusait toute chaîne qu'il venait de créer.
 * Il l'ouvre maintenant, et c'est ici que se paie l'ouverture : sans ce mot, on
 * déposerait un rush et on découvrirait au montage que la chaîne n'a ni police,
 * ni couleur, ni style de sous-titres, sans savoir pourquoi.
 *
 * Il ne propose aucun bouton pour y remédier, et c'est délibéré : `/init-chaine`
 * est un entretien — produit, avatar, marketeur, direction artistique — et ces
 * décisions se discutent (CLAUDE.md §2). Ce qu'on donne est ce qui manque
 * vraiment : le dossier où ouvrir Claude Code.
 */
function montreLeRappelDInit(chaine, racine) {
  const zone = $('rappelInit')
  if (!zone) return
  if (chaine?.initialise === true) {
    zone.hidden = true
    return
  }
  zone.replaceChildren()
  zone.append(
    `Cette chaîne produit déjà : la cascade des sous-titres et les polices
embarquées donnent des réglages complets, et le montage tourne avec. Ce qu'elle
n'a pas encore, c'est un socle — produit, avatar, marketeur — et une direction
artistique qui soit la SIENNE plutôt qu'un défaut neutre.

Ouvre Claude Code dans `
  )
  if (racine) {
    const ou = creer('code')
    ou.textContent = racine
    zone.append(ou, ' et lance ')
  } else {
    zone.append('le dossier de la chaîne et lance ')
  }
  const cmd = creer('code')
  cmd.textContent = '/init-chaine'
  zone.append(cmd, ` — c'est un entretien, et il reste le meilleur outil pour ça.`)

  // MAIS L'ENTRETIEN N'EST PLUS LA SEULE PORTE.
  //
  // Ce bandeau ne faisait que constater, et renvoyait hors du logiciel pour la
  // moindre couleur. Poser un nom, cocher deux formats et choisir une palette
  // n'a jamais demandé une heure d'entretien : c'est de la déclaration, et ça se
  // fait ici. Le bouton dit exactement ce qu'il fait — renseigner —, pas
  // « initialiser », qui laisserait croire qu'il produit le socle marketing.
  const suite = creer('p', 'ligne-action')
  const bouton = creer('button', 'bouton primaire')
  bouton.type = 'button'
  bouton.textContent = `Renseigner l'identité ici`
  bouton.addEventListener('click', ouvreLIdentite)
  suite.append(bouton)
  zone.append(suite)
  zone.hidden = false
}

// ---------------------------------------------------------------------------
//  L'identité de la chaîne
// ---------------------------------------------------------------------------
//
// ELLE SE DÉCLARE, ELLE NE SE DEVINE PAS.
//
// Ce panneau écrit `config/chaine.json` par `pipeline/initialise.mjs`, qui
// existe seule au terminal (§2, contrainte 1). Il ne remplace pas
// `/init-chaine` : il ne fait ni veille, ni fiche produit, ni hook bank. Il
// donne à une chaîne un nom, des formats, une cadence et une palette — les
// quatre choses sans lesquelles elle reste le dossier vierge qu'on vient de
// copier, et pour lesquelles il fallait jusqu'ici quitter le logiciel.

const CHAMPS_IDENTITE = {
  nom: 'idNom',
  promesse: 'idPromesse',
  produit: 'idProduit',
  produit_type: 'idProduitType',
  produit_prix: 'idProduitPrix',
  produit_url: 'idProduitUrl',
  avatar: 'idAvatar',
  segment: 'idSegment',
  marketeur: 'idMarketeur',
  posture: 'idPosture',
  registre: 'idRegistre',
  direction_plans: 'idDirection',
  modele_video: 'idModeleVideo',
}

async function ouvreLIdentite() {
  ouvreVoile('voileIdentite', 'idNom')
  $('idErreur').hidden = true
  $('idEtat').hidden = true

  let d
  try {
    const r = await api('/api/chaine/init')
    d = r.resultat ?? {}
  } catch (e) {
    $('idErreur').textContent = e.message
    $('idErreur').hidden = false
    return
  }

  const v = d.valeurs ?? {}
  for (const [champ, id] of Object.entries(CHAMPS_IDENTITE)) $(id).value = v[champ] ?? ''
  // Une couleur absente ne laisse pas le sélecteur sur un noir arbitraire : il
  // part sur une valeur lisible, et rien n'est écrit tant qu'on n'enregistre pas.
  $('idAccent').value = v.couleur_accent ?? '#c9315e'
  $('idFond').value = v.couleur_fond ?? '#0e1718'

  for (const [id, retenue] of [['idPoliceTitres', v.police_titres], ['idPoliceSous', v.police_soustitres]]) {
    const sel = $(id)
    sel.replaceChildren()
    const vide = creer('option')
    vide.value = ''
    vide.textContent = '— défaut du montage —'
    sel.append(vide)
    for (const famille of d.polices ?? []) {
      const o = creer('option')
      o.value = famille
      o.textContent = famille
      sel.append(o)
    }
    sel.value = retenue ?? ''
  }

  // LES FORMATS VIENNENT DE `chaine.json`, PAS D'UNE LISTE ÉCRITE ICI.
  // Une liste en dur divergerait du fichier à la première addition, et l'écran
  // proposerait un format que rien ne sait rendre.
  const cases = $('idFormats')
  cases.replaceChildren()
  for (const f of d.formats ?? []) {
    const l = creer('label')
    const c = document.createElement('input')
    c.type = 'checkbox'
    c.value = f.format
    c.checked = f.actif
    const t = creer('span')
    const bornes = f.duree_cible_s ? ` (${f.duree_cible_s[0]}–${f.duree_cible_s[1]} s)` : ''
    t.textContent = f.format.replace(/_/g, ' ') + bornes
    l.append(c, t)
    cases.append(l)
  }

  // LE CATALOGUE VIENT DU SERVEUR, AVEC SES PRIX.
  //
  // Ils vont de 0,04 $ à 2,37 $ le plan de cinq secondes — un facteur soixante.
  // Choisir un modèle sans voir ce qu'il coûte, c'est choisir à l'aveugle une
  // dépense qui se répète à chaque trou comblé.
  const selM = $('idModeleVideo')
  selM.replaceChildren()
  for (const m of d.modelesVideo ?? []) {
    const o = creer('option')
    o.value = m.format
    o.textContent = `${m.nom} — ${m.usd5s.toFixed(2)} $ / plan de 5 s — ${m.resume}`
    selM.append(o)
  }
  selM.value = v.modele_video ?? d.modeleVideoDefaut ?? ''
  const disModele = () => {
    const m = (d.modelesVideo ?? []).find((x) => x.format === selM.value)
    $('noteModeleVideo').textContent = m
      ? `${m.format} · ${m.usd5s.toFixed(2)} $ pour un plan de 5 s. ` +
        `Le devis de l'étape 6 suit ce choix.`
      : ''
  }
  disModele()
  selM.onchange = disModele

  $('idLongs').value = d.cadence?.long_par_semaine ?? 0
  $('idShorts').value = d.cadence?.short_par_semaine ?? 0
}

$('btnFermeIdentite').addEventListener('click', () => fermeVoile('voileIdentite'))
$('idNon').addEventListener('click', () => fermeVoile('voileIdentite'))

$('idOui').addEventListener('click', async () => {
  const corps = {}
  for (const [champ, id] of Object.entries(CHAMPS_IDENTITE)) corps[champ] = $(id).value.trim() || null
  corps.couleur_accent = $('idAccent').value
  corps.couleur_fond = $('idFond').value
  corps.police_titres = $('idPoliceTitres').value || null
  corps.police_soustitres = $('idPoliceSous').value || null
  corps.formats = [...$('idFormats').querySelectorAll('input:checked')].map((c) => c.value)
  corps.cadence = {
    long_par_semaine: Number($('idLongs').value) || 0,
    short_par_semaine: Number($('idShorts').value) || 0,
  }

  $('idErreur').hidden = true
  await pendant($('idOui'), 'Écriture…', async () => {
    try {
      await api('/api/chaine/init', { methode: 'POST', corps })
      // ON RECHARGE, ET CE N'EST PAS DE LA PARESSE.
      //
      // Le nom de la chaîne est dans l'en-tête, le bandeau dépend de
      // `initialise`, les formats décident du squelette de script, la palette du
      // rendu. Recoudre tout ça à la main laisserait forcément un morceau en
      // arrière — et c'est le genre d'écart qu'on découvre trois écrans plus loin.
      $('idEtat').textContent = `Écrit. L'écran se recharge…`
      $('idEtat').hidden = false
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      $('idErreur').textContent = e.message
      $('idErreur').hidden = false
    }
  })
})

async function demarre() {
  suisLaHauteurDeLEntete()
  try {
    const c = await api('/api/chaine')
    appli.chaine = c.chaine
    appli.polices = c.polices ?? []
    declareLesPolices(c.fichiersPolices ?? [])
    // LE SÉLECTEUR DE CHAÎNE DOIT TOUJOURS PORTER UN MOT.
    //
    // `identite.nom` est vide tant que `/init-chaine` n'a pas eu lieu — donc sur
    // toute chaîne neuve. Le bouton se réduisait alors à son chevron, trois
    // pixels de large : on ne pouvait plus ni le voir, ni le viser, et on se
    // retrouvait enfermé dans la chaîne qu'on venait d'ouvrir. Le dossier, lui,
    // a toujours un nom, et c'est celui qu'on a tapé en la créant.
    const dossier =
      String(c.racine ?? '')
        // Le chemin vient de Windows : ses séparateurs sont des
        // antislashs. On les ramène au slash avant de découper, plutôt que
        // d'écrire une classe de caractères que la moindre relecture casse.
        .split(String.fromCharCode(92))
        .join('/')
        .split('/')
        .filter(Boolean)
        .pop() ?? 'chaîne'
    const nom = c.chaine?.identite?.nom ?? null
    $('nomChaine').textContent = nom ?? dossier
    montreLeRappelDInit(c.chaine, c.racine ?? null)
  } catch (e) {
    annonce(e.message, 'erreur')
    return
  }

  // La vidéo sur laquelle on travaillait dans cet onglet. Un slug disparu — la
  // vidéo a été supprimée, ou la chaîne a changé — est ignoré sans bruit :
  // `rafraichitEtat` retombe alors sur la première de la liste.
  appli.slug = videoRetenue()
  await rafraichitEtat()
  // Sans attendre : les appels reseau ne doivent pas retarder l ouverture.
  majLeBudget({ force: true }).catch(() => {})

  if (!appli.videos.length) {
    annonce(`Aucune vidéo dans videos/. Crée-en une pour commencer.`)
    montre('destination')
  } else {
    montre(premiereEtapeUtile())
  }

  // ON DRESSE LA PRODUCTION D'ABORD, ON POSE LES MENUS PAR-DESSUS ENSUITE.
  //
  // L'ordre compte : un menu se referme sans rien recharger, donc ce qu'il
  // découvre doit déjà être à sa place. Le faire dans l'autre sens laissait
  // voir le rail se construire derrière le panneau.
  //
  // Deux marches, et on reprend à celle qui reste : rien de choisi, on demande
  // la chaîne puis la vidéo ; la chaîne déjà tranchée — c'est l'état dans lequel
  // une bascule recharge la page —, on ne redemande que la vidéo.
  const entree = etatDEntree()
  if (entree === null) {
    apresLesChaines = () => ouvreLeMenuDesVideos()
    await ouvreLeMenuDesChaines()
  } else if (entree === 'chaine') {
    ouvreLeMenuDesVideos()
  }
}

// ---------------------------------------------------------------------------
//  LES DEUX ESPACES : PRODUCTION ET INSPIRATIONS
// ---------------------------------------------------------------------------
//
// « Production » fabrique une vidéo : tout y est lié au slug ouvert, et l'ordre
// des sept étapes compte. « Inspirations » est un carnet de références qui
// appartient à la CHAÎNE — ni étape, ni ordre, ni slug. Le poser en huitième
// marche du rail aurait menti sur ce qu'il est.
//
// Le sélecteur de vidéo de l'en-tête n'a donc rien à faire du côté carnet : il
// s'efface, sinon il laisse croire que ce qu'on dépose appartient à la vidéo
// ouverte.

function montreLEspace(espace, { ajoute = false } = {}) {
  const carnet = espace === 'inspirations'
  const visages = espace === 'avatars'
  // LE SÉLECTEUR DE VIDÉO N'A DE SENS QUE DANS LA PRODUCTION.
  //
  // Ni le carnet ni les avatars n'appartiennent à une vidéo : les laisser sous
  // un slug affiché ferait croire qu'on modifie celle-là seulement.
  document.querySelector('.atelier').hidden = carnet || visages
  $('espaceInspirations').hidden = !carnet
  $('espaceAvatars').hidden = !visages
  document.querySelector('.choix-video').hidden = carnet || visages
  for (const o of document.querySelectorAll('.onglet')) {
    const sien = o.dataset.espace === espace
    o.classList.toggle('actif', sien)
    o.setAttribute('aria-selected', String(sien))
  }
  // Ni l'un ni l'autre ne se recharge à chaque aller-retour : relire le disque
  // ne changerait rien à ce qui est affiché.
  if (carnet && appli.carnet === undefined) chargeLeCarnet()
  if (visages && appli.avatars === undefined) chargeLesAvatars()

  // On arrive ici pour créer : le panneau est ouvert et le curseur posé, sinon
  // il resterait un repli à trouver après avoir déjà cliqué une fois.
  if (visages && ajoute) {
    $('replAjoutAvatar').open = true
    $('replAjoutAvatar').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    $('avId').focus()
  }
  // AU RETOUR, LE MENU DOIT CONNAÎTRE CE QU'ON VIENT DE CRÉER.
  //
  // Sans ça, on crée un avatar, on revient, et il n'est pas dans la liste : on
  // le croit perdu et on recommence.
  if (espace === 'production') dessineLesModes()
}

// ---------------------------------------------------------------------------
//  Les avatars de la chaîne
// ---------------------------------------------------------------------------
//
// UN AVATAR EST UN JEU DE PHOTOS, PAS UNE IMAGE.
//
// Une seule référence tient tant que la scène reste proche du cadrage d'origine.
// Dès qu'on s'en éloigne — elle marche dehors, elle est de trois quarts, elle
// est dans le noir — le modèle perd le visage et rend quelqu'un d'autre : sur un
// plan de marche, une brune de vingt-cinq ans à la place d'une blonde de
// quarante-deux. L'écran pousse donc à en déposer plusieurs, et le dit quand il
// n'y en a qu'une.

async function chargeLesAvatars() {
  try {
    const r = await api('/api/avatars')
    appli.avatars = r.resultat?.avatars ?? []
  } catch (e) {
    appli.avatars = []
    annonce(e.message, 'erreur')
  }
  dessineLesAvatars()
}

function dessineLesAvatars() {
  const zone = $('listeAvatars')
  zone.replaceChildren()
  const tous = appli.avatars ?? []

  if (!tous.length) {
    const p = creer('p', 'vide')
    p.textContent = `Aucun avatar. Dépose des photos ci-dessous pour en créer un.`
    zone.append(p)
    return
  }

  for (const a of tous) {
    const carte = creer('div', 'avatar')

    const vignettes = creer('div', 'avatar-photos')
    for (const nomFichier of a.fichiers ?? []) {
      const img = creer('img')
      img.src = `/avatar/${encodeURIComponent(a.id)}/photos/${encodeURIComponent(nomFichier)}?vignette=1`
      img.alt = ''
      // PAS DE CHARGEMENT PARESSEUX ICI. Il n'a jamais déclenché : les vignettes
      // n'entrent pas dans le champ de détection du navigateur au moment où on
      // les crée, et les quatre carrés restaient vides indéfiniment. Sur des
      // images de dix kilooctets, il n'y avait rien à économiser.
      vignettes.append(img)
    }

    const texte = creer('div', 'avatar-texte')
    const nom = creer('span', 'avatar-nom')
    nom.textContent = a.nom
    const meta = creer('span', 'avatar-meta')
    meta.textContent = `${a.id} · ${a.photos} photo${a.photos > 1 ? 's' : ''}`
    texte.append(nom, meta)
    if (a.signe) {
      const signe = creer('span', 'avatar-signe')
      signe.textContent = a.signe
      texte.append(signe)
    } else {
      const manque = creer('span', 'avatar-manque')
      manque.textContent = `aucun signe distinctif — l'identité dérivera`
      texte.append(manque)
    }
    if (a.photos < 2) {
      const seule = creer('span', 'avatar-manque')
      seule.textContent = `une seule photo — ajoute un trois-quarts et un plan large`
      texte.append(seule)
    }

    // L'IDENTITÉ DE JEU, SOUS LE NOM ET LE SIGNE.
    //
    // Le signe tient le visage ; l'identité tient la personne — sa gestuelle, sa
    // façon de regarder l'objectif, ce que son visage fait quand elle doute. Sans
    // elle, chaque génération invente un tempérament, et l'abonné voit une
    // inconnue qui a le même visage d'une vidéo à l'autre.
    const repli = creer('details', 'avatar-jeu')
    const somm = creer('summary')
    somm.textContent = a.identite ? `Identité de jeu` : `Identité de jeu — aucune`
    if (!a.identite) somm.classList.add('manquante')
    const champ = creer('textarea')
    champ.rows = 5
    champ.value = a.identite ?? ''
    champ.placeholder =
      `Sa gestuelle, sa façon de regarder l’objectif, ce que son visage fait quand ` +
      `elle doute, son rythme. Laisse vide et clique « Déduire » pour la tirer de ` +
      `ses photos et de la marque.`
    const boutons = creer('div', 'avatar-jeu-actions')

    const garde = creer('button', 'bouton minuscule')
    garde.type = 'button'
    garde.textContent = 'Enregistrer'
    garde.addEventListener('click', () =>
      pendant(garde, 'Enregistrement…', async () => {
        const t = champ.value.trim()
        if (!t) return annonce(`L’identité est vide — utilise « Déduire ».`, 'erreur')
        try {
          await api(`/api/avatars/${encodeURIComponent(a.id)}/identite`, {
            methode: 'POST', corps: { texte: t },
          })
          appli.avatars = undefined
          await chargeLesAvatars()
          annonce(`Identité de « ${a.nom} » enregistrée.`, 'ok')
        } catch (e) { annonce(e.message, 'erreur') }
      })
    )

    const deduit = creer('button', 'bouton minuscule')
    deduit.type = 'button'
    deduit.textContent = a.identite ? 'Redéduire' : 'Déduire'
    if (!a.identite) deduit.classList.add('primaire')
    deduit.addEventListener('click', () =>
      pendant(deduit, 'Déduction…', async () => {
        // Redéduire ÉCRASE un texte écrit à la main : ça se demande.
        if (a.identite) {
          const ok = await demandeConfirmation({
            titre: `Redéduire l’identité de « ${a.nom} » ?`,
            quoi: `Le texte actuel sera remplacé par une nouvelle déduction.`,
            action: 'Redéduire',
          })
          if (!ok) return
        }
        try {
          await api(`/api/avatars/${encodeURIComponent(a.id)}/identite`, {
            methode: 'POST', corps: { deduis: true },
          })
          appli.avatars = undefined
          await chargeLesAvatars()
          annonce(`Identité de « ${a.nom} » déduite.`, 'ok')
        } catch (e) { annonce(e.message, 'erreur') }
      })
    )

    boutons.append(garde, deduit)
    repli.append(somm, champ, boutons)

    const actions = creer('div', 'avatar-actions')
    const ajoute = creer('button', 'bouton minuscule')
    ajoute.type = 'button'
    ajoute.textContent = 'Ajouter une photo'
    ajoute.addEventListener('click', () => {
      $('avId').value = a.id
      $('avNom').value = a.nom ?? ''
      $('avSigne').value = a.signe ?? ''
      $('replAjoutAvatar').open = true
      $('fichierAvatar').click()
    })
    const jette = creer('button', 'bouton minuscule discret')
    jette.type = 'button'
    jette.textContent = 'Supprimer'
    jette.addEventListener('click', () => retireUnAvatar(a, jette))
    actions.append(ajoute, jette)

    // Le repli est posé SOUS la rangée, pas dans la colonne du milieu : six cents
    // caractères dans un tiers de carte ne se relisent pas.
    carte.append(vignettes, texte, actions, repli)
    zone.append(carte)
  }
}

async function retireUnAvatar(a, bouton) {
  const ok = await demandeConfirmation({
    titre: `Supprimer « ${a.nom} » ?`,
    quoi: `Ses ${a.photos} photo(s) sont effacées du disque. Les vidéos déjà produites ne bougent pas.`,
    action: 'Supprimer',
  })
  if (!ok) return
  await pendant(bouton, 'Suppression…', async () => {
    try {
      await api(`/api/avatars/${encodeURIComponent(a.id)}`, { methode: 'DELETE' })
      appli.avatars = undefined
      await chargeLesAvatars()
      annonce(`Avatar « ${a.nom} » retiré.`, 'ok')
    } catch (e) {
      annonce(e.message, 'erreur')
    }
  })
}

/** Le dépôt d'une photo — une par envoi, comme la bibliothèque de plans. */
async function deposeUnePhoto(fichier) {
  const id = $('avId').value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) {
    annonce(`Donne un identifiant : minuscules, chiffres et tirets.`, 'erreur')
    return
  }
  const existe = (appli.avatars ?? []).some((a) => a.id === id)
  const formulaire = new FormData()
  formulaire.append('id', id)
  formulaire.append('existe', existe ? 'oui' : 'non')
  if ($('avNom').value.trim()) formulaire.append('nom', $('avNom').value.trim())
  if ($('avSigne').value.trim()) formulaire.append('signe', $('avSigne').value.trim())
  formulaire.append('fichier', fichier, fichier.name)

  $('noteAvatar').textContent = `Envoi de ${fichier.name}…`
  try {
    await api('/api/avatars', { methode: 'POST', corps: formulaire })
    appli.avatars = undefined
    await chargeLesAvatars()
    $('noteAvatar').textContent = `${fichier.name} ajoutée.`
    annonce(`Photo ajoutée à « ${id} ».`, 'ok')
  } catch (e) {
    $('noteAvatar').textContent = ''
    annonce(e.message, 'erreur')
  }
}

$('depotAvatar').addEventListener('click', () => $('fichierAvatar').click())
$('depotAvatar').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('fichierAvatar').click() }
})
$('depotAvatar').addEventListener('dragover', (ev) => {
  ev.preventDefault()
  $('depotAvatar').classList.add('survol')
})
$('depotAvatar').addEventListener('dragleave', () => $('depotAvatar').classList.remove('survol'))
$('depotAvatar').addEventListener('drop', (ev) => {
  ev.preventDefault()
  $('depotAvatar').classList.remove('survol')
  const f = ev.dataTransfer?.files?.[0]
  if (f) deposeUnePhoto(f)
})
$('fichierAvatar').addEventListener('change', (ev) => {
  const f = ev.target.files?.[0]
  if (f) deposeUnePhoto(f)
  ev.target.value = ''
})

for (const o of document.querySelectorAll('.onglet')) {
  o.addEventListener('click', () => montreLEspace(o.dataset.espace))
}

// ---------------------------------------------------------------------------
//  Le carnet d'inspirations
// ---------------------------------------------------------------------------

const PLATEFORMES = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram', autre: '' }

/** 2 400 000 → « 2,4 M ». Un nombre de vues se compare, il ne se lit pas. */
function compacte(n) {
  if (!Number.isFinite(n)) return null
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '').replace('.', ',')} M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.0', '').replace('.', ',')} k`
  return String(n)
}

/** Un chemin du carnet vers l'URL qui le sert, segment par segment. */
const urlInspiration = (relatif) =>
  `/inspiration/${String(relatif).split('/').map(encodeURIComponent).join('/')}`

async function chargeLeCarnet() {
  try {
    const r = await api('/api/inspirations')
    appli.carnet = r.resultat?.inspirations ?? []
  } catch (e) {
    appli.carnet = []
    annonce(e.message, 'erreur')
  }
  dessineLeCarnet()
}

function dessineLeCarnet() {
  const zone = $('carnet')
  zone.replaceChildren()
  const liste = appli.carnet ?? []

  if (!liste.length) {
    const p = creer('p', 'vide')
    p.textContent = `Colle un lien TikTok ou YouTube pour commencer.`
    zone.append(p)
    $('loupeInspiration').hidden = true
    return
  }

  for (const i of liste) {
    const b = creer('button', 'vignette')
    b.type = 'button'
    if (i.id === appli.inspirationOuverte) b.classList.add('choisie')

    if (i.aLaCouverture && i.couverture) {
      const img = creer('img')
      img.src = urlInspiration(i.couverture)
      img.alt = ''
      img.loading = 'lazy'
      b.append(img)
    } else {
      const vide = creer('div', 'sans-image')
      vide.textContent = 'sans vignette'
      b.append(vide)
    }

    const texte = creer('div', 'vignette-texte')
    const nom = creer('p', 'vignette-nom')
    nom.textContent = i.titre ?? i.id
    const meta = creer('p', 'vignette-meta')
    meta.textContent = [
      PLATEFORMES[i.plateforme] ?? i.plateforme,
      i.vues ? `${compacte(i.vues)} vues` : null,
      i.dureeS ? chrono(i.dureeS * 1000) : null,
    ].filter(Boolean).join(' · ')
    texte.append(nom, meta)

    // Ce qui manque se dit sur la vignette, pas au moment de l'ouvrir : sinon
    // on clique, on trouve un cadre vide, et on croit à une panne.
    const manques = [!i.aLaVideo ? 'sans vidéo' : null, !i.aLeTranscript ? 'sans transcript' : null]
      .filter(Boolean)
    if (manques.length) {
      const m = creer('p', 'vignette-manque')
      m.textContent = manques.join(' · ')
      texte.append(m)
    }

    b.append(texte)
    b.addEventListener('click', () => ouvreLInspiration(i.id))
    zone.append(b)
  }

  // Rien d'ouvert : on ouvre la plus récente. Un écran à moitié vide alors
  // qu'il a de quoi montrer quelque chose se lit comme une panne.
  if (!liste.some((i) => i.id === appli.inspirationOuverte)) ouvreLInspiration(liste[0].id)
}

async function ouvreLInspiration(id) {
  const i = (appli.carnet ?? []).find((x) => x.id === id)
  if (!i) return
  appli.inspirationOuverte = id
  for (const [n, v] of [...document.querySelectorAll('.vignette')].entries()) {
    v.classList.toggle('choisie', (appli.carnet ?? [])[n]?.id === id)
  }

  $('loupeInspiration').hidden = false
  $('titreInspiration').textContent = i.titre ?? i.id
  $('metaInspiration').textContent = [
    PLATEFORMES[i.plateforme] ?? i.plateforme,
    i.auteur,
    i.date,
    i.dureeS ? chrono(i.dureeS * 1000) : null,
    i.vues ? `${compacte(i.vues)} vues` : null,
    i.likes ? `${compacte(i.likes)} likes` : null,
    Number.isFinite(i.engagement) ? `${i.engagement.toFixed(1)} % d'engagement` : null,
  ].filter(Boolean).join(' · ')

  // L'ADRESSE DE LA SOURCE EST VÉRIFIÉE AVANT D'ÊTRE POSÉE DANS UN `href`.
  //
  // Elle vient de la plateforme, relayée par la commande : c'est une donnée
  // externe, et un `href` est un point d'exécution. Un `javascript:…` s'y
  // exécuterait au clic — la CSP ne le bloque pas, et `target="_blank"` est
  // ignoré pour ce schéma.
  const lien = $('lienSource')
  let adresse = null
  try {
    const u = new URL(i.url)
    if (u.protocol === 'https:') adresse = u.href
  } catch { /* adresse illisible : on masque simplement le lien */ }
  lien.hidden = !adresse
  if (adresse) lien.href = adresse

  const video = $('videoInspiration')
  if (i.aLaVideo && i.video) {
    video.hidden = false
    video.src = urlInspiration(i.video)
  } else {
    video.hidden = true
    video.removeAttribute('src')
  }

  const zone = $('transcriptInspiration')
  zone.value = 'Chargement…'
  try {
    const r = await api(`/api/inspirations/${encodeURIComponent(id)}/texte`)
    zone.value = r.resultat?.texte ?? `Pas de transcript pour cette vidéo.`
  } catch (e) {
    zone.value = e.message
  }
}

async function deposeUneInspiration() {
  const champ = $('lienInspiration')
  const url = champ.value.trim()
  if (!url) { annonce(`Colle d'abord une adresse.`, 'erreur'); return }

  try {
    annonce('')
    const reponse = await api('/api/inspirations', { methode: 'POST', corps: { url } })
    // Le téléchargement puis la transcription prennent de quelques secondes à
    // plusieurs minutes : le journal en direct dit où ça en est. Sans lui, on
    // regarde un bouton grisé sans savoir si ça travaille ou si c'est bloqué.
    const vue = reponse.travail?.etat === 'encours' ? await suisLeTravail(reponse.travail) : reponse.travail
    if (vue?.etat === 'echec') { annonce(derniereErreur(vue), 'erreur'); return }
    champ.value = ''
    const posee = vue?.resultat?.inspirations?.[0]
    await chargeLeCarnet()
    // ON OUVRE CE QU'ON VIENT DE DÉPOSER, EXPLICITEMENT.
    //
    // `dessineLeCarnet` n'ouvre d'office que si RIEN n'est ouvert : il suffisait
    // donc qu'une inspiration soit déjà affichée pour que la loupe reste sur
    // elle après un dépôt. On attendait une minute la transcription d'une vidéo
    // qui ne s'affichait pas, et il fallait cliquer sa vignette pour comprendre
    // qu'elle était bien arrivée.
    if (posee) {
      await ouvreLInspiration(posee.id)
      annonce(posee.dejaLa ? `Déjà au carnet.` : `« ${posee.titre ?? posee.id} » est au carnet.`, 'ok')
    }
  } catch (e) {
    annonce(e.message, 'erreur')
  }
}

$('btnDeposeInspiration').addEventListener('click', (e) =>
  pendant(e.currentTarget, 'Dépôt…', deposeUneInspiration)
)
// Entrée valide, comme partout ailleurs dans l'atelier.
$('lienInspiration').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('btnDeposeInspiration').click() }
})

$('btnCopieTranscript').addEventListener('click', async (e) => {
  const zone = $('transcriptInspiration')
  if (!zone.value.trim()) return
  const bouton = e.currentTarget
  try {
    await navigator.clipboard.writeText(zone.value)
  } catch {
    // `navigator.clipboard` demande un contexte sécurisé. En HTTP sur une
    // adresse autre que localhost, il n'existe pas : on sélectionne alors le
    // texte pour que Ctrl+C finisse le geste, plutôt que d'échouer en silence.
    zone.focus()
    zone.select()
    annonce(`Presse-papiers indisponible ici — le texte est sélectionné, fais Ctrl+C.`)
    return
  }
  const avant = bouton.textContent
  bouton.textContent = 'Copié'
  setTimeout(() => { bouton.textContent = avant }, 1400)
})

$('btnRetireInspiration').addEventListener('click', async (e) => {
  // LE BOUTON SE CAPTURE MAINTENANT, PAS APRÈS LA CONFIRMATION.
  //
  // `e.currentTarget` ne vaut quelque chose QUE pendant la distribution de
  // l'événement : dès le premier `await`, le navigateur la termine et le remet à
  // `null`. Le lire après la boîte de dialogue faisait donc échouer `pendant`
  // sur un `null`, et le retrait n'avait jamais lieu — sans rien à l'écran pour
  // le dire, puisque l'exception partait dans une promesse que personne
  // n'attendait.
  const bouton = e.currentTarget
  const id = appli.inspirationOuverte
  const i = (appli.carnet ?? []).find((x) => x.id === id)
  if (!i) return
  const ok = await demandeConfirmation({
    titre: `Retirer cette inspiration ?`,
    quoi: `« ${i.titre ?? i.id} » — la vidéo et son transcript seront supprimés.`,
    action: 'Retirer',
  })
  if (!ok) return
  await pendant(bouton, 'Retrait…', async () => {
    try {
      await api(`/api/inspirations/${encodeURIComponent(id)}`, { methode: 'DELETE' })
      // La vidéo doit lâcher le fichier avant qu'on redessine : sinon le
      // navigateur garde une requête ouverte sur un fichier qui n'existe plus.
      $('videoInspiration').removeAttribute('src')
      appli.inspirationOuverte = null
      await chargeLeCarnet()
      annonce(`Retirée du carnet.`, 'ok')
    } catch (err) {
      annonce(err.message, 'erreur')
    }
  })
})

demarre()
