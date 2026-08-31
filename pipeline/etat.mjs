#!/usr/bin/env node
/**
 * etat.mjs — où en est chaque vidéo, et ce qui est encore bon.
 *
 * Commande en LECTURE SEULE : elle n'écrit rien, ne sonde rien de payant, et ne
 * lance aucune étape. Elle est appelée en boucle par l'atelier, donc elle doit
 * rester rapide et incapable de casser quoi que ce soit.
 *
 * CE QUI DISTINGUE CE FICHIER D'UNE LISTE DE CASES COCHÉES.
 *
 * Un artefact n'est pas « présent » : il est « présent ET plus récent que ses
 * entrées ». La différence n'est pas théorique. On change de voix, on relance
 * la conversion : le transcript, le plan et le rendu qui existent encore
 * décrivent la voix d'avant. Une interface qui les affiche « faits » propose un
 * téléchargement du mauvais fichier, et personne ne s'en aperçoit avant d'avoir
 * regardé la vidéo. D'où trois verdicts, jamais deux :
 *
 *   absent  le fichier n'est pas là
 *   perime  il est là, mais une de ses entrées a bougé après lui
 *   fait    il est là et à jour
 *
 *   node pipeline/etat.mjs                 toutes les vidéos
 *   node pipeline/etat.mjs <slug>          une seule, en détail
 *   node pipeline/etat.mjs [<slug>] --json pour l'atelier
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { CHEMINS, dossierVideo, litJson, litChaine, env } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { estVertical, prendsLesRushes, estPlanDeCoupe, ECART_MAX_MS, QUEUE_S } from './lib/montage.mjs'
import { reglagesDe } from './lib/soustitres.mjs'
import { voixPour } from './lib/choix-voix.mjs'

// ---------------------------------------------------------------------------
//  Les dates de modification, et la raison de ne pas leur faire aveuglément
//  confiance
// ---------------------------------------------------------------------------

/**
 * Écart en deçà duquel deux dates sont considérées identiques.
 *
 * Deux postes qui produisent la même chaîne (CLAUDE.md §4) n'ont pas la même
 * horloge à la seconde près, et un système de fichiers réseau arrondit. Sans
 * marge, un décalage d'horloge de trois secondes suffisait à déclarer périmé un
 * plan écrit juste après son transcript.
 */
const MARGE_MS = 5000

/**
 * LE PIÈGE DU DOSSIER SYNCHRONISÉ, ET LA PARADE RETENUE.
 *
 * Une synchro (copie sur disque partagé, OneDrive, robocopy sans /DCOPY) réécrit
 * les dates de modification à l'instant de la copie. Après elle, tous les
 * fichiers d'une vidéo portent presque la même date, dans un ordre qui ne doit
 * plus rien à la production : un rush recopié après son plan ferait passer le
 * plan, le rendu et le transcript pour périmés, et l'atelier proposerait de tout
 * refaire — dont la conversion ElevenLabs, qui est payante.
 *
 * La parade : quand TOUTES les dates d'une vidéo tiennent dans une même fenêtre
 * de quelques dizaines de secondes, on considère qu'elles ne portent plus
 * d'information de chronologie, et on renonce à déclarer quoi que ce soit
 * périmé. Le champ `mtimes_fiables` le dit au lieu de le cacher.
 *
 * Ce que cette parade ne couvre PAS, et il faut le savoir :
 *
 *   - une synchro PARTIELLE (quelques fichiers recopiés, les autres intacts)
 *     laisse un écart large, la détection ne se déclenche pas, et un « périmé »
 *     à tort reste possible ;
 *   - à l'inverse, un montage très court dont toutes les étapes s'écrivent en
 *     moins de FENETRE_COPIE_MS fait taire la détection de péremption. Le
 *     verdict est alors « fait » — c'est le côté conservateur de l'erreur, et
 *     c'est délibéré : mieux vaut ne pas signaler une péremption que d'en
 *     inventer une qui déclenche un appel payant.
 *
 * La vraie solution est ailleurs et n'appartient pas à ce fichier : que chaque
 * producteur inscrive dans son artefact l'empreinte (taille + hachage) des
 * entrées dont il est issu. `04-transcript.json` en est à mi-chemin, il porte
 * déjà `genereLe` et le chemin de son audio. Le jour où `plan.json` et
 * `voix-finale.wav` porteront la même chose, ce fichier pourra comparer des
 * contenus au lieu de comparer des horloges, et le problème disparaîtra.
 */
const FENETRE_COPIE_MS = 30000

/** Date de modification en millisecondes, ou `null` si le fichier n'est pas là. */
function dateDe(chemin) {
  try {
    return fs.statSync(chemin).mtimeMs
  } catch {
    return null
  }
}

/** Poids en octets, ou `null`. */
function poidsDe(chemin) {
  try {
    return fs.statSync(chemin).size
  } catch {
    return null
  }
}

/** La date la plus récente d'une arborescence. Sert à trier par activité. */
function derniereActivite(dossier) {
  let plusRecent = dateDe(dossier) ?? 0
  let entrees
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true })
  } catch {
    return plusRecent
  }
  for (const e of entrees) {
    const chemin = path.join(dossier, e.name)
    if (e.isDirectory()) plusRecent = Math.max(plusRecent, derniereActivite(chemin))
    else plusRecent = Math.max(plusRecent, dateDe(chemin) ?? 0)
  }
  return plusRecent
}

// ---------------------------------------------------------------------------
//  La durée d'un média, sans lancer de processus quand on peut l'éviter
// ---------------------------------------------------------------------------

/**
 * `sonde()` de ffmpeg.mjs est asynchrone et lance ffprobe à chaque appel.
 *
 * Ni l'un ni l'autre ne convient ici : `etatDe()` doit rester synchrone pour que
 * l'atelier l'appelle en direct, et une liste de trente vidéos interrogée à
 * chaque rafraîchissement ne peut pas se permettre soixante processus. Les deux
 * conteneurs qu'on rencontre en pratique — WAV pour les voix, MP4/MOV/M4A pour
 * les rushes et les rendus — portent leur durée dans un en-tête qu'on lit en
 * quelques dizaines d'octets. ffprobe ne sert plus que de dernier recours, pour
 * le MP3 notamment, et son résultat est mémorisé.
 */
const dureesConnues = new Map()

export function dureeMediaS(chemin) {
  const stat = (() => {
    try {
      return fs.statSync(chemin)
    } catch {
      return null
    }
  })()
  if (!stat || !stat.isFile()) return null

  const empreinte = `${chemin}|${stat.mtimeMs}|${stat.size}`
  if (dureesConnues.has(empreinte)) return dureesConnues.get(empreinte)

  let secondes = null
  try {
    const ext = path.extname(chemin).toLowerCase()
    if (ext === '.wav') secondes = dureeWavS(chemin)
    else if (['.mp4', '.mov', '.m4a', '.m4v'].includes(ext)) secondes = dureeMp4S(chemin)
    if (secondes === null) secondes = dureeParFfprobe(chemin)
  } catch {
    // Une commande de lecture ne tombe jamais pour une durée manquante : on
    // rend `null`, l'interface affiche « — », et le reste de l'état tient.
    secondes = null
  }

  // On mémorise aussi les échecs : sans ffprobe dans le PATH, une liste de
  // trente vidéos tenterait trente lancements voués au même échec.
  dureesConnues.set(empreinte, secondes)
  return secondes
}

/** Durée d'un WAV : octets de données ÷ débit annoncé dans `fmt `. */
function dureeWavS(chemin) {
  const fd = fs.openSync(chemin, 'r')
  try {
    const taille = fs.fstatSync(fd).size
    const tete = Buffer.alloc(12)
    if (fs.readSync(fd, tete, 0, 12, 0) < 12) return null
    if (tete.toString('latin1', 0, 4) !== 'RIFF' || tete.toString('latin1', 8, 12) !== 'WAVE') return null

    let position = 12
    let octetsParSeconde = 0
    const entete = Buffer.alloc(8)
    while (position + 8 <= taille) {
      if (fs.readSync(fd, entete, 0, 8, position) < 8) return null
      const nom = entete.toString('latin1', 0, 4)
      const longueur = entete.readUInt32LE(4)
      if (nom === 'fmt ' && longueur >= 16) {
        const bloc = Buffer.alloc(16)
        fs.readSync(fd, bloc, 0, 16, position + 8)
        octetsParSeconde = bloc.readUInt32LE(8)
      } else if (nom === 'data') {
        // Un WAV écrit en flux laisse parfois une longueur nulle ou saturée :
        // ce qui reste du fichier est alors la seule mesure fiable.
        const restant = taille - (position + 8)
        const octets = longueur === 0 || longueur > restant ? restant : longueur
        return octetsParSeconde > 0 ? octets / octetsParSeconde : null
      }
      if (longueur <= 0 || longueur > taille) return null
      position += 8 + longueur + (longueur % 2) // les blocs RIFF sont alignés sur 2 octets
    }
    return null
  } finally {
    fs.closeSync(fd)
  }
}

/** Durée d'un MP4/MOV : `moov` → `mvhd` → durée ÷ échelle de temps. */
function dureeMp4S(chemin) {
  const fd = fs.openSync(chemin, 'r')
  try {
    const taille = fs.fstatSync(fd).size
    const moov = trouveBoite(fd, 0, taille, 'moov')
    if (!moov) return null
    const mvhd = trouveBoite(fd, moov.debut, moov.fin, 'mvhd')
    if (!mvhd) return null

    const bloc = Buffer.alloc(32)
    if (fs.readSync(fd, bloc, 0, 32, mvhd.debut) < 20) return null
    const version = bloc[0]
    const echelle = version === 1 ? bloc.readUInt32BE(20) : bloc.readUInt32BE(12)
    const duree = version === 1 ? Number(bloc.readBigUInt64BE(24)) : bloc.readUInt32BE(16)
    return echelle > 0 ? duree / echelle : null
  } finally {
    fs.closeSync(fd)
  }
}

/** Parcourt les boîtes MP4 d'un intervalle et rend le contenu de la première du type demandé. */
function trouveBoite(fd, debut, fin, type) {
  let position = debut
  const entete = Buffer.alloc(16)
  while (position + 8 <= fin) {
    if (fs.readSync(fd, entete, 0, 16, position) < 8) return null
    let longueur = entete.readUInt32BE(0)
    const nom = entete.toString('latin1', 4, 8)
    let tailleEntete = 8
    if (longueur === 1) {
      longueur = Number(entete.readBigUInt64BE(8))
      tailleEntete = 16
    } else if (longueur === 0) {
      longueur = fin - position // la dernière boîte peut s'étendre jusqu'à la fin
    }
    if (longueur < tailleEntete) return null
    if (nom === type) return { debut: position + tailleEntete, fin: position + longueur }
    position += longueur
  }
  return null
}

/** Dernier recours, pour les conteneurs qu'on ne sait pas lire nous-mêmes (MP3…). */
function dureeParFfprobe(chemin) {
  const binaire = env('FFPROBE_PATH', 'ffprobe')
  const sortie = execFileSync(
    binaire,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', chemin],
    { encoding: 'utf8', timeout: 8000, windowsHide: true }
  )
  const n = Number(String(sortie).trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

// ---------------------------------------------------------------------------
//  L'état d'une vidéo
// ---------------------------------------------------------------------------

const EXTENSIONS_AUDIO = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus'])

/** L'ordre est celui de la production : `etape_courante` est la première non faite. */
export const ETAPES = [
  'script',
  'rush',
  'voixChoisie',
  'audio',
  'transcript',
  'soustitres',
  'plan',
  'rendu',
]

const relatif = (p) => path.relative(CHEMINS.racine, p).split(path.sep).join('/')

/**
 * `litJson` est volontairement bruyant : un JSON malformé doit se voir.
 *
 * Ici, non. Un `01-script.json` à moitié écrit — la conversation interrompue au
 * mauvais moment — ferait tomber la liste ENTIÈRE de l'atelier, et l'interface
 * n'afficherait plus aucune vidéo au lieu d'en signaler une. Une commande d'état
 * dit ce qu'elle peut lire ; le fichier illisible ressort simplement « absent »,
 * et la commande qui en a besoin, elle, protestera comme il faut.
 */
function litOuRien(chemin) {
  try {
    return litJson(chemin, null)
  } catch {
    return null
  }
}

/**
 * L'état complet d'une vidéo. Synchrone, sans effet de bord, sans exception :
 * un slug inconnu rend un état où tout est absent, ce qui est la vérité.
 */
export function etatDe(slug) {
  const v = dossierVideo(slug)
  const script = litOuRien(v.scriptJson)

  const format = script?.format ?? null
  const vertical = format ? estVertical(format) : null
  const destination =
    script?.destination ?? (vertical === null ? null : vertical ? 'tiktok-insta' : 'youtube')

  const rushes = prendsLesRushes(v.tournage)
  const prises = rushes.filter((r) => !estPlanDeCoupe(r))
  const coupeJson = path.join(v.montage, 'coupe.json')
  const soustitresJson = path.join(v.montage, 'soustitres.json')
  const audioFinal = path.join(v.audio, 'voix-finale.wav')
  const master = path.join(v.rendu, `${slug}.mp4`)

  // Les dates qui portent la chronologie de production. C'est sur elles, et
  // elles seules, qu'on décide si le faisceau est exploitable (voir
  // FENETRE_COPIE_MS) : les fichiers annexes du dossier `public/` bougent pour
  // des raisons qui ne disent rien de l'avancement.
  const datesUtiles = [
    v.scriptJson,
    ...prises,
    v.voixChoisie,
    audioFinal,
    v.transcript,
    soustitresJson,
    coupeJson,
    v.plan,
    master,
  ]
    .map(dateDe)
    .filter((d) => d !== null)

  const etendue = datesUtiles.length ? Math.max(...datesUtiles) - Math.min(...datesUtiles) : 0
  const mtimesFiables = !(datesUtiles.length >= 3 && etendue < FENETRE_COPIE_MS)

  /**
   * Le cœur : présent, postérieur à ses entrées, ET dérivé d'entrées elles-mêmes
   * à jour.
   *
   * LA PÉREMPTION SE PROPAGE, et l'oublier rendait le verdict faux dans le cas
   * le plus courant. On regénère la voix, puis on relance `--depuis=cale` : le
   * plan est bien plus récent que tout, mais il a été recalé sur un transcript
   * qui, lui, décrit la voix d'avant. Comparer les seules dates de fichiers
   * l'aurait déclaré « fait ». On regarde donc aussi le verdict des étapes
   * amont, d'où le calcul dans l'ordre de production.
   */
  const verdict = (artefact, entrees = [], amont = []) => {
    const dateArtefact = dateDe(artefact)
    if (dateArtefact === null) return 'absent'
    // UNE ENTRÉE ABSENTE PÉRIME AUTANT QU'UNE ENTRÉE PLUS RÉCENTE.
    //
    // Ce cas manquait, et il ouvrait une facture. Sur un second poste,
    // CLAUDE.md §4 prescrit de ne transporter que `01-script.json`,
    // `04-transcript.json` et `05-montage/` — pas l'audio. Le transcript était
    // alors déclaré « fait » alors que le `voix-finale.wav` qu'il décrit
    // n'existe pas : `'absent' !== 'perime'` laissait passer l'amont, et la
    // date nulle de l'entrée faisait sauter la boucle ci-dessous.
    //
    // L'atelier en concluait que le montage était jouable et lançait
    // `monte --depuis=cale`, qui refabrique l'audio manquant — c'est-à-dire une
    // conversion ElevenLabs payante, présentée comme gratuite.
    if (amont.includes('perime') || amont.includes('absent')) return 'perime'
    if (!mtimesFiables) return 'fait'
    for (const entree of entrees) {
      const dateEntree = dateDe(entree)
      if (dateEntree !== null && dateEntree > dateArtefact + MARGE_MS) return 'perime'
    }
    return 'fait'
  }

  // -- script ---------------------------------------------------------------
  // Racine de la chaîne : rien ne le périme, il n'est dérivé de rien. Le
  // `01-script.md` d'à côté est la version lisible, pas la source du pipeline.
  const mots = script?.blocs
    ? script.blocs
        .map((b) => String(b.texte ?? ''))
        .join(' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0

  // -- rush -----------------------------------------------------------------
  // LE MODE SE LIT SUR LE FICHIER, JAMAIS SUR LE SCRIPT (CLAUDE.md §3).
  //
  // On tranche ici sur l'extension, parce qu'une commande d'état ne doit pas
  // ouvrir chaque rush. `monte.mjs` tranche, lui, sur les flux réellement
  // présents (`sonde().aDeLaVideo`) : un `.mp4` sans piste image existe, et
  // c'est lui qui aura le dernier mot. L'écart est assumé, il ne touche qu'à
  // l'affichage.
  const modeRush = prises.length
    ? prises.every((p) => EXTENSIONS_AUDIO.has(path.extname(p).toLowerCase()))
      ? 'voix-off'
      : 'camera'
    : null

  const modeAttendu = format ? (String(format).includes('faceless') ? 'voix-off' : 'camera') : null
  const divergence =
    modeRush && modeAttendu && modeRush !== modeAttendu
      ? `le script annonce « ${format} » mais le rush est ${
          modeRush === 'voix-off' ? 'un audio seul' : 'une vidéo'
        } — c'est le fichier qui décide`
      : null

  const dureesPrises = prises.map((p) => dureeMediaS(p)).filter((d) => d !== null)

  // -- voix ------------------------------------------------------------------
  let voix = { voice_id: null, nom: null, origine: null }
  let voixSansObjet = false
  try {
    const chaine = litChaine()
    // En mode `brute` la prise part telle quelle : aucune voix ElevenLabs n'est
    // attendue, et réclamer un choix bloquerait l'étape suivante pour rien.
    voixSansObjet = (chaine?.voix?.mode ?? 'sts') === 'brute'
    voix = voixPour(slug)
  } catch {
    // Pas de config/chaine.json : la chaîne n'est pas initialisée. L'état reste
    // lisible, il dit simplement qu'aucune voix n'est retenue.
  }

  // -- transcript ------------------------------------------------------------
  const transcript = litOuRien(v.transcript)

  // -- sous-titres -----------------------------------------------------------
  // « Fait » veut dire VALIDÉ À L'ÉCRAN, pas « un fichier existe ». Des réglages
  // enregistrés sans passage devant l'aperçu ne sont qu'un brouillon, et la
  // cascade de `lib/soustitres.mjs` donne de toute façon des valeurs utilisables
  // sans eux. Cette étape n'a pas d'entrée : c'est une décision, pas un dérivé,
  // donc elle ne périme pas.
  let reglages = null
  try {
    reglages = reglagesDe(slug)
  } catch {
    /* réglages illisibles : l'étape reste « absent », l'atelier les redemandera */
  }

  // -- plan ------------------------------------------------------------------
  const plan = litOuRien(v.plan)

  const poidsMaster = poidsDe(master)

  // Les verdicts se calculent DANS L'ORDRE DE PRODUCTION : chacun peut avoir
  // besoin de celui d'avant (voir la propagation dans `verdict`).
  const vAudio = verdict(audioFinal, [...prises, v.voixChoisie])
  const vTranscript = verdict(v.transcript, [audioFinal], [vAudio])
  const vPlan = verdict(
    v.plan,
    [v.transcript, v.scriptJson, soustitresJson, coupeJson, audioFinal],
    [vTranscript]
  )
  const vRendu = verdict(master, [v.plan], [vPlan])

  const etapes = {
    script: {
      verdict: script ? 'fait' : 'absent',
      chemin: script ? relatif(v.scriptJson) : null,
      mots,
    },
    rush: {
      verdict: prises.length ? 'fait' : 'absent',
      chemin: prises.length ? relatif(prises[0]) : null,
      fichiers: rushes.map(relatif),
      mode: modeRush,
      dureeS: dureesPrises.length ? dureesPrises.reduce((a, b) => a + b, 0) : null,
      divergence,
    },
    voixChoisie: {
      verdict: voix.voice_id || voixSansObjet ? 'fait' : 'absent',
      voiceId: voix.voice_id,
      nom: voix.nom,
      origine: voixSansObjet && !voix.voice_id ? 'sans objet (voix brute)' : voix.origine,
      // Les réglages de conversion sont rendus BRUTS, `null` compris : c'est
      // ainsi que l'écran distingue « réglé à zéro » — un choix très expressif,
      // parfaitement légitime — de « pas encore réglé ». Les confondre ferait
      // repartir les curseurs sur un défaut alors qu'une valeur existe.
      stabilite: voix.stabilite ?? null,
      similarite: voix.similarite ?? null,
    },
    audio: {
      verdict: vAudio,
      chemin: dateDe(audioFinal) === null ? null : relatif(audioFinal),
      dureeS: dureeMediaS(audioFinal),
    },
    transcript: {
      verdict: vTranscript,
      mots: transcript?.mots?.length ?? 0,
    },
    soustitres: {
      verdict: reglages?.valide_le ? 'fait' : 'absent',
      valide_le: reglages?.valide_le ?? null,
      modele: reglages?.modele ?? null,
    },
    plan: {
      verdict: vPlan,
      evenements: plan?.evenements?.length ?? 0,
      creux: compteLesCreux(plan),
      dureeS: plan?.dureeFrames && plan?.fps ? plan.dureeFrames / plan.fps : null,
    },
    rendu: {
      verdict: vRendu,
      chemin: poidsMaster === null ? null : relatif(master),
      poidsMo: poidsMaster === null ? null : Number((poidsMaster / 1e6).toFixed(1)),
      dureeS: dureeMediaS(master),
    },
  }

  return {
    slug,
    titre: script?.titre_travail ?? null,
    format,
    vertical,
    destination,
    etapes,
    // La première étape qui n'est pas « fait » : c'est elle que l'atelier
    // débloque, et un artefact périmé la rouvre au même titre qu'un absent.
    etape_courante: ETAPES.find((cle) => etapes[cle].verdict !== 'fait') ?? null,
    mtimes_fiables: mtimesFiables,
    modifie_le: fs.existsSync(v.base) ? new Date(derniereActivite(v.base)).toISOString() : null,
  }
}

/**
 * Les passages où l'écran ne bouge plus assez longtemps, recomptés depuis le plan.
 *
 * `appliqueRythme` les calcule au montage mais ne les écrit pas : seul le
 * journal les mentionne, et il disparaît avec le terminal. On refait donc le
 * même compte à partir de ce que le plan conserve — repères = surcouches,
 * jointures de coupe et punch-ins — pour que l'atelier puisse dire « ton plan
 * tient » ou « il reste quatre trous » sans relancer le montage.
 */
function compteLesCreux(plan) {
  if (!plan) return 0
  const reperes = [
    ...(plan.evenements ?? []).map((e) => e.debutMs),
    ...(plan.coupes ?? []).map((c) => c.debutMs),
    ...(plan.punchs ?? []).map((p) => p.debutMs),
  ]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (!reperes.length) return 0

  // Le plan compte la queue de respiration dans sa durée ; les creux, non.
  const dureeMs = ((plan.dureeFrames ?? 0) / (plan.fps || 30) - QUEUE_S) * 1000

  let creux = 0
  for (let i = 0; i < reperes.length - 1; i++) {
    if (reperes[i + 1] - reperes[i] > ECART_MAX_MS) creux++
  }
  if (dureeMs - reperes[reperes.length - 1] > ECART_MAX_MS) creux++
  return creux
}

/** Les slugs présents dans `videos/`, sans les fichiers parasites. */
export function slugsConnus() {
  if (!fs.existsSync(CHEMINS.videos)) return []
  return fs
    .readdirSync(CHEMINS.videos, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
}

/** Toutes les vidéos, la dernière touchée en tête. */
export function etats() {
  return slugsConnus()
    .map((slug) => etatDe(slug))
    .sort((a, b) => String(b.modifie_le ?? '').localeCompare(String(a.modifie_le ?? '')))
}

// ---------------------------------------------------------------------------
//  Affichage
// ---------------------------------------------------------------------------

const SYMBOLES = { fait: '●', perime: '◐', absent: '○' }

const LIBELLES = {
  script: 'script',
  rush: 'rush',
  voixChoisie: 'voix',
  audio: 'audio',
  transcript: 'transcript',
  soustitres: 'sous-titres',
  plan: 'plan',
  rendu: 'rendu',
}

const secondes = (s) => (s === null || s === undefined ? '—' : duree(s))

function detail(etat) {
  const e = etat.etapes
  return {
    script: e.script.verdict === 'absent' ? 'à écrire — /script' : `${e.script.mots} mots`,
    rush:
      e.rush.verdict === 'absent'
        ? 'aucune prise déposée'
        : `${path.basename(e.rush.chemin)} · ${e.rush.mode === 'voix-off' ? 'voix off' : 'caméra'} · ${secondes(e.rush.dureeS)}`,
    voixChoisie: e.voixChoisie.verdict === 'absent'
      ? 'aucune voix retenue'
      : `${e.voixChoisie.nom ? `« ${e.voixChoisie.nom} » · ` : ''}${e.voixChoisie.origine ?? ''}`.trim(),
    audio: e.audio.verdict === 'absent' ? 'pas encore générée' : secondes(e.audio.dureeS),
    transcript: e.transcript.verdict === 'absent' ? 'pas encore transcrit' : `${e.transcript.mots} mots calés`,
    soustitres: e.soustitres.verdict === 'absent'
      ? 'pas encore validés à l’écran'
      : `${e.soustitres.modele ? `${e.soustitres.modele} · ` : ''}validés le ${String(e.soustitres.valide_le).slice(0, 10)}`,
    plan: e.plan.verdict === 'absent'
      ? 'pas encore monté'
      : `${e.plan.evenements} événements · ${e.plan.creux} creux · ${secondes(e.plan.dureeS)}`,
    rendu: e.rendu.verdict === 'absent'
      ? 'pas encore rendu'
      : `${secondes(e.rendu.dureeS)} · ${e.rendu.poidsMo} Mo`,
  }
}

function afficheUne(etat) {
  const entete = [etat.format, etat.destination].filter(Boolean).join(' · ')
  journal.titre(`${etat.slug}${entete ? `  —  ${entete}` : ''}`)
  if (etat.titre) journal.detail(etat.titre)

  const textes = detail(etat)
  for (const cle of ETAPES) {
    const v = etat.etapes[cle].verdict
    const suffixe = v === 'perime' ? '  (périmé : une entrée a bougé après lui)' : ''
    console.log(`  ${SYMBOLES[v]} ${LIBELLES[cle].padEnd(12)} ${textes[cle]}${suffixe}`)
  }

  console.log('')
  if (etat.etapes.rush.divergence) journal.attention(etat.etapes.rush.divergence)
  if (!etat.mtimes_fiables) {
    journal.attention(
      `Toutes les dates de ce dossier tiennent dans la même minute : la fraîcheur des ` +
        `artefacts n'est pas jugeable (dossier probablement recopié ou synchronisé).`
    )
  }
  if (etat.etape_courante) journal.info(`Prochaine étape : ${LIBELLES[etat.etape_courante]}`)
  else journal.ok(`Rien à faire : la vidéo est prête.`)
}

function afficheToutes(liste) {
  journal.titre(`${liste.length} vidéo(s)`)
  if (!liste.length) {
    journal.detail(`Aucun dossier dans ${relatif(CHEMINS.videos)}.`)
    return
  }
  for (const etat of liste) {
    const jauge = ETAPES.map((c) => SYMBOLES[etat.etapes[c].verdict]).join('')
    const reste = etat.etape_courante ? LIBELLES[etat.etape_courante] : 'prête'
    console.log(`  ${jauge}  ${etat.slug.padEnd(34)} ${String(etat.format ?? '—').padEnd(18)} ${reste}`)
  }
  console.log('')
  journal.detail(`${SYMBOLES.fait} fait   ${SYMBOLES.perime} périmé   ${SYMBOLES.absent} absent`)
  journal.detail(`Le détail d'une vidéo : node pipeline/etat.mjs <slug>`)
}

// ---------------------------------------------------------------------------
//  Ligne de commande
// ---------------------------------------------------------------------------

/**
 * Ce fichier est AUSSI un module : l'atelier importe `etatDe`.
 *
 * D'où le garde ci-dessous, et le fait que `litArgs`/`aide` ne soient lus qu'à
 * l'intérieur. Sans lui, `node outils/atelier.mjs --aide` affichait l'aide de
 * CETTE commande puis sortait du processus : `aide()` lit process.argv du
 * processus entier, pas celui du module qui l'appelle.
 */
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { options, positionnels } = litArgs()

  aide(
    options,
    `
node pipeline/etat.mjs [<slug>] [--json]

  Où en est chaque vidéo, et ce qui est encore à jour.

  Sans slug : toutes les vidéos de videos/, la dernière touchée en tête.
  Avec slug : le détail étape par étape.

  --json    l'état brut, pour l'atelier

  Trois verdicts par étape :
    ${SYMBOLES.fait} fait     le fichier est là et postérieur à ses entrées
    ${SYMBOLES.perime} périmé   il est là, mais une de ses entrées a bougé après lui
    ${SYMBOLES.absent} absent   il n'est pas là

  Cette commande ne modifie rien et ne lance aucune étape.
`
  )

  await principal(async () => {
    const slug = positionnels[0]
    const json = drapeau(options, 'json')

    if (slug) {
      if (!fs.existsSync(dossierVideo(slug).base)) {
        throw new Error(
          `Aucune vidéo « ${slug} » dans ${relatif(CHEMINS.videos)}.
` +
            `Les vidéos connues : ${slugsConnus().join(', ') || '(aucune)'}`
        )
      }
      const etat = etatDe(slug)
      if (json) console.log(JSON.stringify(etat, null, 2))
      else afficheUne(etat)
      return
    }

    const liste = etats()
    if (json) console.log(JSON.stringify(liste, null, 2))
    else afficheToutes(liste)
  })
}
