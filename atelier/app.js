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

const VOILES = ['voileCout', 'voileConfirme', 'voileNouvelle', 'voileNouvChaine', 'voileChaines', 'voileVideos']
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

    audio: et.voixChoisie?.verdict === 'absent'
      ? vers(`Retiens d'abord une voix.`, 'voixChoisie')
      : et.rush?.verdict === 'absent'
        ? vers(`Dépose d'abord la prise.`, 'rush')
        : null,

    soustitres: et.transcript?.verdict === 'absent'
      ? vers(`Génère d'abord l'audio.`, 'audio')
      : null,

    plan: !scriptEcrit
      ? { texte: `Le script n'est pas écrit.`, copie: `/script ${e.slug}` }
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

function montre(cle) {
  // LE SENS DU DÉPLACEMENT EST LA SEULE CHOSE QUE L'ANIMATION TRANSPORTE.
  //
  // Sept écrans se remplaçaient d'un coup, sans qu'on sache si l'on avançait
  // dans la séquence ou si l'on revenait en arrière. Douze pixels dans le bon
  // sens suffisent à le dire, et c'est tout ce qu'on lui demande.
  const avant = ETAPES.findIndex((x) => x.cle === appli.etapeCourante)
  const apres = ETAPES.findIndex((x) => x.cle === cle)
  $('scene').dataset.sens = avant >= 0 && apres < avant ? 'arriere' : 'avant'

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
  for (const zone of section.querySelectorAll('.commandes, .bouton.grand, .depot, .filtres, .reglage-essai, .liste-voix, .studio, .cartes, .case, .doctrine')) {
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

async function rafraichitEtat() {
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

  if (appli.etapeCourante) montre(appli.etapeCourante)
  else dessineLeRail()
}

$('selVideo').addEventListener('change', async () => {
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
  if (!document.hidden) rafraichitEtat().catch(() => { /* le serveur dira le reste */ })
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
function demandeUneNouvelleVideo() {
  $('nouvErreur').hidden = true
  $('nouvSlug').value = ''
  ouvreVoile('voileNouvelle', 'nouvSlug')
  $('nouvSlug').focus()
}

$('btnNouvelle').addEventListener('click', demandeUneNouvelleVideo)
$('btnNouvelleDepuisMenu').addEventListener('click', demandeUneNouvelleVideo)
$('nouvNon').addEventListener('click', () => fermeVoile('voileNouvelle'))
$('nouvSlug').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('nouvOui').click() })

$('nouvOui').addEventListener('click', async () => {
  const slug = $('nouvSlug').value.trim()
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
//  Étape 1 — la destination
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
    if (!appli.etat?.destination) avanceApres('destination')
  })
}

// ---------------------------------------------------------------------------
//  Étape 2 — le dépôt de la prise
// ---------------------------------------------------------------------------

function dessineRush() {
  const rush = appli.etat?.etapes?.rush
  const fiche = $('ficheRush')
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
  ligne('Fichier', (rush.fichiers ?? [rush.chemin]).join(' · '))
  ligne('Durée', rush.dureeS ? `${chrono(rush.dureeS * 1000)} (${rush.dureeS} s)` : null)
  ligne('Format', appli.etat.format)
  fiche.append(titre, dl)

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

function dessineVoix() {
  const choisie = appli.etat?.etapes?.voixChoisie
  const fiche = $('ficheVoix')

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
    p.textContent = `Voix retenue : ${choisie.nom ?? choisie.voiceId}`
    const q = creer('p', 'note')
    q.textContent = choisie.origine
    fiche.append(p, q)
    fiche.hidden = false
  }
  if (appli.catalogue) dessineLeCatalogue()
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
  $('audioEssai').src = urlMedia(appli.slug, fichier)
  $('ecouteEssai').hidden = false
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

function dessineLesEmpreintes() {
  const zone = $('listeEmpreintes')
  zone.replaceChildren()
  const tout = appli.empreintes ?? []

  if (!tout.length) {
    const vide = creer('p', 'vide')
    vide.textContent = `Aucune empreinte récoltée.`
    zone.append(vide)
    return
  }

  for (const e of tout) {
    const carte = creer('div', 'empreinte')

    const titre = creer('div', 'empreinte-nom')
    titre.textContent = e.id
    carte.append(titre)

    // LA DURÉE SE DIT AVEC CE QU'ELLE PERMET, PAS TOUTE SEULE.
    //
    // « 4 min 20 » ne dit rien à qui ne connaît pas les deux seuils : quinze
    // secondes suffisent au zero-shot, un entraînement en réclame cent fois
    // plus. Le nombre nu ferait chercher ailleurs la réponse à « est-ce que
    // c'est assez ? ».
    const total = e.totalS ?? 0
    const modele = modeleDe(e.id)

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

    const note = creer('div', 'empreinte-note')
    note.textContent =
      `${chrono(total * 1000)} de voix seule · ${e.extraits?.length ?? 0} extraits · ` +
      `${e.sources?.length ?? 0} source(s) · ` +
      (total >= 900
        ? `assez pour un entraînement`
        : total >= 120
          ? `entraînable, mais court — vise 15 min`
          : total >= 15
            ? `assez pour du zero-shot, pas pour entraîner`
            : `trop court, il en faut 15 s`)
    carte.append(note)

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

    carte.append(actions)
    zone.append(carte)
  }
}

function ecouteUneEmpreinte(e) {
  $('nomEmpreinte').textContent = `${e.id} — ${chrono((e.referenceS ?? 0) * 1000)} des meilleurs extraits`
  const audio = $('audioEmpreinte')
  audio.src = `/empreinte/${encodeURIComponent(e.id)}/reference.wav`
  $('ecouteEmpreinte').hidden = false
  audio.play().catch(() => {})
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
        nom: $('empreinteNom').value.trim(),
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
      annonce(
        `Rien de retenu : la voix n'est jamais seule dans cette vidéo. ` +
          `Passe l'exigence à « tolérante », ou essaie une autre source.`,
        'erreur'
      )
      return
    }
    annonce(
      `« ${m.id} » — ${chrono((m.totalS ?? 0) * 1000)} de voix seule sur ` +
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
  lecteur.src = urlMedia(appli.slug, audio.chemin)
  lecteur.style.width = '100%'
  const note = creer('p', 'note')
  note.textContent = chrono((audio.dureeS ?? 0) * 1000)
  fiche.append(p, lecteur, note)
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
async function majLeMoteur() {
  const moteur = $('moteurVoix').value
  const local = moteur === 'local'
  for (const el of document.querySelectorAll('.local-seul')) el.hidden = !local

  if (local && !appli.modeles) await chargeLesModeles()

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
    if (retenu) sel.value = retenu
  }

  const note = $('noteMoteur')
  if (moteur === 'sts') {
    note.textContent = `Le coût sera annoncé avant de lancer.`
  } else if (moteur === 'brute') {
    note.textContent = `Ta prise part telle quelle : aucune conversion, aucun traitement.`
  } else if (!appli.modeles?.length) {
    // On ne cache pas l'entrée : la cacher laisserait croire que la
    // fonctionnalité n'existe pas. On dit ce qu'il manque et par où passer.
    note.textContent =
      `Aucun modèle entraîné. Récolte une voix à l'étape 3, puis entraîne-la — ` +
      `il faut 15 à 30 min de voix propre.`
  } else {
    note.textContent = `Gratuit et hors ligne. Compte une à deux minutes par minute de prise.`
  }
  $('btnAudio').disabled = local && !appli.modeles?.length
}

$('moteurVoix').addEventListener('change', majLeMoteur)

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

function dessinePlan() {
  const plan = appli.etat?.etapes?.plan
  const fiche = $('fichePlan')
  // Même raison qu'au-dessus : le libellé survivait au changement de vidéo.
  $('btnPlans').textContent = !plan || plan.verdict === 'absent'
    ? 'Construire le montage' : 'Reconstruire le montage'
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
      () => apiPayante(`/api/videos/${encodeURIComponent(appli.slug)}/plans`, {}),
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
    fiche.hidden = true; lecteur.hidden = true; lien.hidden = true
    return
  }
  const url = urlMedia(appli.slug, rendu.chemin)

  fiche.replaceChildren()
  const p = creer('p', 'titre-fiche')
  p.textContent = rendu.verdict === 'perime'
    ? `Master plus ancien que le plan — relance le rendu.`
    : `Master à jour.`
  const note = creer('p', 'note')
  note.textContent = `${rendu.poidsMo} Mo · ${chrono((rendu.dureeS ?? 0) * 1000)}`
  fiche.append(p, note)
  fiche.hidden = false

  lecteur.src = url
  lecteur.hidden = false
  lien.href = url
  lien.hidden = false
}

$('btnRendu').addEventListener('click', () => pendant($('btnRendu'), 'Rendu…', async () => {
  // TROIS SECONDES AVANT HUIT MINUTES.
  //
  // La route acceptait déjà un extrait et aucun bouton ne le demandait, alors
  // que CLAUDE.md §12 prescrit de rendre trois secondes d'essai avant tout
  // rendu complet. Quatre-vingt-dix images à partir de la dixième seconde :
  // assez pour juger le style, le calage et l'étalonnage.
  const extrait = $('estExtrait').checked ? '300-389' : null
  const vue = await mene(() =>
    api(`/api/videos/${encodeURIComponent(appli.slug)}/rendu`, {
      methode: 'POST',
      corps: { brouillon: $('estBrouillon').checked, ...(extrait ? { extrait } : {}) },
    })
  )
  if (vue?.etat === 'fini') {
    annonce(extrait ? `Extrait rendu — le master n'a pas bougé.` : `Rendu terminé.`, 'ok')
  }
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
  if (appli.st?.slug === appli.slug) { studio.hidden = false; relanceLApercu(); return }

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
    if (['motsParPage', 'ponctuation'].includes(champ)) relanceLApercu({ sansTexte: true })
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
  relanceLApercu()
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
}

function relanceLApercu({ sansTexte = false } = {}) {
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
  apercu.horlogeMs = 0
  apercu.derniereImage = null

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

  if (apercu.enLecture) {
    // Un onglet en arrière-plan rend des écarts de plusieurs secondes : on les
    // plafonne pour que l'aperçu reprenne où il était plutôt que de sauter.
    if (apercu.derniereImage !== null) apercu.horlogeMs += Math.min(120, instant - apercu.derniereImage)
    apercu.derniereImage = instant
    if (apercu.horlogeMs > apercu.dureeMs) apercu.horlogeMs = 0
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
}

// On clique SUR l'image, comme dans n'importe quel lecteur. Le bouton d'à côté
// obligeait à quitter des yeux ce qu'on est en train de juger.
$('cadre').addEventListener('click', () => poseLaLecture(!apercu.enLecture))

$('curseurTemps').addEventListener('input', () => {
  if (!appli.st) return
  apercu.horlogeMs = (Number($('curseurTemps').value) / 1000) * apercu.dureeMs
  apercu.index = -1
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

/** Les lignes récrites, par index de première ligne : `de` → texte. */
const corrections = new Map()

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
  zone.replaceChildren()
  if (!appli.st?.mots?.length) return

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
    champ.dataset.origine = l.texte
    champ.value = corrections.has(l.de) ? corrections.get(l.de) : l.texte
    // Whisper marque lui-même ses hésitations : les signaler dit où relire en
    // premier, ce qui vaut mieux que de tout relire.
    if (l.doute) champ.classList.add('doute')
    if (corrections.has(l.de)) champ.classList.add('modifie')

    champ.addEventListener('focus', () => sauteDansLApercu(l.debutMs))
    champ.addEventListener('input', () => {
      hauteurAuContenu(champ)
      if (champ.value === champ.dataset.origine) corrections.delete(l.de)
      else corrections.set(l.de, champ.value)
      champ.classList.toggle('modifie', corrections.has(l.de))
      majPiedDeTexte()
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

  // La hauteur se règle après insertion : `scrollHeight` vaut zéro hors du DOM.
  for (const c of zone.querySelectorAll('.texte-st')) hauteurAuContenu(c)
  filtreLeTexte()
  majPiedDeTexte()
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

function majPiedDeTexte() {
  const n = corrections.size
  $('btnCorrige').disabled = n === 0
  $('noteCorrections').textContent = n ? `${n} ligne${n > 1 ? 's' : ''} récrite${n > 1 ? 's' : ''}` : ''
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

$('btnCorrige').addEventListener('click', () => pendant($('btnCorrige'), 'Enregistrement…', async () => {
  if (!corrections.size) return
  const zone = $('listeSt')
  const patch = []
  for (const champ of zone.querySelectorAll('.texte-st')) {
    const de = Number(champ.dataset.de)
    if (!corrections.has(de)) continue
    patch.push({ de, a: Number(champ.dataset.a), texte: corrections.get(de) })
  }
  const r = await mene(() =>
    api(`/api/videos/${encodeURIComponent(appli.slug)}/texte`, { methode: 'PUT', corps: { corrections: patch } })
  )
  if (!r) return
  corrections.clear()
  // La transcription a changé de longueur : on la relit plutôt que de la
  // rafistoler côté navigateur. Une ligne récrite décale tous les index
  // suivants, et deviner ce décalage ici serait une deuxième vérité.
  await rechargeLeStudio()

  const repartis = (r.resultat?.changements ?? []).filter((c) => c.instantsRepartis).length
  annonce(
    repartis
      ? `Corrections enregistrées — ${repartis} ligne(s) recalées.`
      : `Corrections enregistrées.`,
    'ok'
  )
}))

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
      const ici = creer('span', 'chaine-ici')
      ici.textContent = 'ouverte'
      const reprend = creer('button', 'bouton minuscule primaire')
      reprend.type = 'button'
      reprend.textContent = 'Travailler dessus'
      reprend.addEventListener('click', () => fermeVoile('voileVideos'))
      actions.append(ici, reprend)
    } else {
      const ouvre = creer('button', 'bouton minuscule primaire')
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
      const ici = creer('span', 'chaine-ici')
      ici.textContent = 'tu es ici'
      const entre = creer('button', 'bouton minuscule primaire')
      entre.type = 'button'
      entre.textContent = 'Travailler dessus'
      entre.addEventListener('click', () => fermeVoile('voileChaines'))
      actions.append(ici, entre)
    } else if (c.lisible === false) {
      // Un `config/chaine.json` illisible : rien à proposer, la chaîne ne
      // démarrerait nulle part. On dit où regarder.
      carte.classList.add('bloquee')
      const p = creer('span', 'chaine-manque')
      p.textContent = `config/chaine.json illisible — à réparer à la main`
      actions.append(p)
    } else if (c.atelier === false) {
      // Le dossier date d'avant l'atelier. C'est le seul cas qui se répare
      // depuis ici, et il se répare en une commande.
      const p = creer('span', 'chaine-manque')
      p.textContent = `son code date d'avant l'atelier`
      const maj = creer('button', 'bouton minuscule primaire')
      maj.type = 'button'
      maj.textContent = 'Mettre à jour'
      maj.title = `Remplace pipeline, outils, atelier et skills. Ne touche ni au socle marque, ni à la veille, ni aux vidéos, ni aux clés.`
      maj.addEventListener('click', () => metAJourLaChaine(c, maj))
      actions.append(p, maj)
    } else if (!c.initialise) {
      // L'INITIALISATION NE PEUT PAS SE FAIRE ICI, ET CE N'EST PAS UN OUBLI.
      //
      // `/init-chaine` est un entretien : produit, avatar, marketeur, direction
      // artistique. Ce sont des décisions qui se discutent, pas un formulaire à
      // remplir — CLAUDE.md §2. On donne donc le chemin à copier, et on s'arrête
      // là.
      carte.classList.add('bloquee')
      const p = creer('span', 'chaine-manque')
      p.textContent = `pas encore initialisée`
      const copie = creer('button', 'bouton minuscule')
      copie.type = 'button'
      copie.textContent = 'Copier le chemin'
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
      actions.append(p, copie)
    } else {
      const ouvre = creer('button', 'bouton minuscule primaire')
      ouvre.type = 'button'
      ouvre.textContent = 'Ouvrir'
      ouvre.addEventListener('click', () => changeDeChaine(c))
      actions.append(ouvre)
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
  try {
    await api('/api/chaines/ouvre', { methode: 'POST', corps: { dossier: c.dossier } })
  } catch (e) {
    note.textContent = e.message
    return
  }

  note.textContent = `Relance sur « ${c.nom} »…`
  for (let essai = 0; essai < 40; essai++) {
    await pause(500)
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
  $('nchCles').checked = false
  $('nchErreur').hidden = true
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
  await pendant($('nchOui'), 'Copie…', async () => {
    try {
      const r = await api('/api/chaines', {
        methode: 'POST',
        corps: { nom, avecCles: $('nchCles').checked },
      })
      fermeVoile('voileNouvChaine')
      await ouvreLeMenuDesChaines()
      proposeLInstallation(r.dossier, nom)
    } catch (e) {
      $('nchErreur').textContent = e.message
      $('nchErreur').hidden = false
    }
  })
})

/**
 * Propose d'installer les dépendances de la chaîne qu'on vient de créer.
 *
 * Sans elles, rien n'y tourne — ni le montage, ni le rendu, ni son atelier. Ça
 * prend plusieurs minutes et ça demande le réseau : c'est un choix, pas un
 * automatisme, et le journal montre où ça en est.
 */
function proposeLInstallation(dossier, nom) {
  const note = $('noteChaines')
  note.replaceChildren()
  note.append(document.createTextNode(`« ${nom} » est créée. `))

  const installe = creer('button', 'bouton minuscule primaire')
  installe.type = 'button'
  installe.textContent = 'Installer ses dépendances'
  installe.addEventListener('click', async () => {
    installe.disabled = true
    try {
      const t = await api('/api/chaines/installe', { methode: 'POST', corps: { dossier } })
      await suisLeTravail(t.travail)
      note.textContent = `« ${nom} » est prête côté code. Reste /init-chaine, en conversation.`
      await ouvreLeMenuDesChaines()
    } catch (e) {
      note.textContent = e.message
      installe.disabled = false
    }
  })
  note.append(installe)
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

async function demarre() {
  suisLaHauteurDeLEntete()
  try {
    const c = await api('/api/chaine')
    appli.chaine = c.chaine
    appli.polices = c.polices ?? []
    declareLesPolices(c.fichiersPolices ?? [])
    const nom = c.chaine?.identite?.nom ?? null
    $('nomChaine').textContent = nom ?? ''
  } catch (e) {
    annonce(e.message, 'erreur')
    return
  }

  // La vidéo sur laquelle on travaillait dans cet onglet. Un slug disparu — la
  // vidéo a été supprimée, ou la chaîne a changé — est ignoré sans bruit :
  // `rafraichitEtat` retombe alors sur la première de la liste.
  appli.slug = videoRetenue()
  await rafraichitEtat()

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

function montreLEspace(espace) {
  const carnet = espace === 'inspirations'
  document.querySelector('.atelier').hidden = carnet
  $('espaceInspirations').hidden = !carnet
  document.querySelector('.choix-video').hidden = carnet
  for (const o of document.querySelectorAll('.onglet')) {
    const sien = o.dataset.espace === espace
    o.classList.toggle('actif', sien)
    o.setAttribute('aria-selected', String(sien))
  }
  // Le carnet ne se charge qu'à la première visite : relire le disque à chaque
  // aller-retour entre les onglets ne changerait rien à ce qu'il affiche.
  if (carnet && appli.carnet === undefined) chargeLeCarnet()
}

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
