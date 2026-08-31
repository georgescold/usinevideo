#!/usr/bin/env node
/**
 * empreinte.mjs — récolter une voix propre, à partir de vidéos en ligne.
 *
 *   npm run empreinte -- <url> [<url>…] --nom="Untel"
 *   npm run empreinte -- --liste
 *   npm run empreinte -- --detail=<id>
 *   npm run empreinte -- --retire=<id>
 *
 * CE QUE CETTE COMMANDE FAIT, ET CE QU'ELLE NE FAIT PAS.
 *
 * Elle rapatrie l'audio d'une adresse, sépare la voix de ce qui l'entoure,
 * repère les passages où la voix est SEULE, et découpe ces passages-là. Elle ne
 * convertit rien : elle prépare la matière. Le moteur qui s'en servira —
 * zero-shot ou entraîné — se branche après, et lira le même dossier.
 *
 * LES EXTRAITS SONT DÉCOUPÉS DANS L'ORIGINAL. C'est la règle centrale.
 *
 * La séparation est un INSTRUMENT DE MESURE, pas un traitement. Une piste
 * vocale extraite porte les artefacts du séparateur — aigus métalliques,
 * transitoires rabotées, souffle reconstruit. La donner en référence à un
 * moteur de conversion, ce serait lui apprendre les défauts du séparateur en
 * même temps que le timbre. On se sert donc de la séparation pour SAVOIR OÙ
 * couper, puis on coupe dans le fichier d'origine, intact.
 *
 * C'est la même discipline qu'au §9 de CLAUDE.md : on mesure le son, on ne le
 * corrige pas.
 *
 * LE CRITÈRE.
 *
 * Une fenêtre est retenue quand deux choses sont vraies ensemble :
 *
 *   1. quelqu'un parle           — le niveau de la voix tient dans les 25 dB
 *                                  sous le niveau haut du fichier ;
 *   2. il n'y a rien derrière    — le résidu est au moins `--marge` décibels
 *                                  sous la voix (20 par défaut).
 *
 * Le seuil de 20 dB n'est pas choisi au jugé. Relevé sur deux vidéos réelles,
 * en fenêtres d'une demi-seconde :
 *
 *     voix seule, face caméra      écart médian 34,6 dB   minimum 17,3
 *     voix sur musique de fond     écart médian 12,4 dB   maximum 23,3
 *
 * Les deux distributions ne se touchent pas, et 20 passe entre les deux.
 *
 * TOUT EST LOCAL ET GRATUIT. yt-dlp télécharge, les modèles UVR séparent,
 * numpy mesure. Aucun crédit, aucun quota, aucune adresse contactée en dehors
 * de celle qu'on donne.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, assureDossier, litJson, ecritJson, slugifie } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { metadonnees, telechargeAudio } from './lib/tiktok.mjs'
import { resoudLaSource, litLaListe, plateforme, PLATEFORMES_ACCEPTEES } from './lib/sources.mjs'
import { sonde, decoupe, recolleAudio } from './lib/ffmpeg.mjs'
import { separe, mesure, installeOutillage, MODELE_DEFAUT } from './lib/voix-locale.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
empreinte — récolter une voix propre, pour l'entraîner ensuite

  npm run empreinte -- <source> [<source>…]  récolte
  npm run empreinte -- --depuis=liens.txt    récolte tout un fichier de liens
  npm run empreinte -- --liste               les empreintes, et leur durée
  npm run empreinte -- --detail=<id>         extrait par extrait, avec sa mesure
  npm run empreinte -- --retire=<id>         la retire, fichiers compris

Une source, c'est une adresse OU un fichier du disque

  Plateformes : ${PLATEFORMES_ACCEPTEES}
  et, pour tout le reste, le chemin d'un mp3/m4a/wav/mp4 déjà téléchargé.

Récolter en lot, c'est le mode normal

  Un entraînement demande 15 à 30 min de voix propre, et une source en rend
  rarement plus d'une ou deux. On rassemble les liens dans un fichier, un par
  ligne (« # » ouvre un commentaire), et on donne le fichier :

    npm run empreinte -- --depuis=liens.txt --nom="Untel"

  Le manifeste s'écrit après CHAQUE source : une récolte interrompue reprend
  où elle en était, et relancer la même liste ne retélécharge rien.

Réglages

  --nom="Untel"     range tout au même endroit, et cumule d'une fois sur l'autre
  --marge=20        de combien de dB le fond doit être sous la voix
  --min=3           durée minimale d'un extrait, en secondes
  --max=30          durée maximale d'un extrait, en secondes
  --plafond=1800    on s'arrête après ce total de voix propre (30 min)
  --reference=30    durée de reference.wav, le montage des meilleurs extraits
  --modele=<nom>    un autre modèle de séparation

Où ça se range

  marque/voix/<id>/reference.wav   les meilleurs extraits bout à bout
  marque/voix/<id>/extraits/       chacun séparément, du plus propre au moins
  marque/voix/<id>/empreinte.json  les sources, les durées, les mesures

Tout est local : yt-dlp télécharge, les modèles UVR séparent. Aucun crédit.
`
)

const DOSSIER = path.join(CHEMINS.marque, 'voix')

const MARGE = nombre(options, 'marge', 20)
const MIN_S = nombre(options, 'min', 3)
const MAX_S = nombre(options, 'max', 30)
const PLAFOND_S = nombre(options, 'plafond', 1800)
const REFERENCE_S = nombre(options, 'reference', 30)

// Sous ce niveau, ce n'est plus de la parole tenue. Compté SOUS le niveau haut
// du fichier, jamais en absolu : voir `analyse-voix.py`.
const SOUS_LE_HAUT = 25

// ---------------------------------------------------------------------------
//  Le découpage
// ---------------------------------------------------------------------------

/**
 * Des fenêtres mesurées aux segments à garder.
 *
 * POURQUOI ON PONTE LES SILENCES, ET POURQUOI PAS N'IMPORTE LESQUELS.
 *
 * Une respiration au milieu d'une phrase fait tomber le niveau de la voix
 * pendant une demi-seconde. Sans pontage, chaque respiration couperait la
 * prise en deux et on récolterait des bouts de trois secondes au lieu de
 * phrases entières — or c'est la phrase entière qui porte le timbre.
 *
 * Mais on ne ponte que du VRAI silence. Une fenêtre où la voix se tait pendant
 * qu'un fond continue n'est pas une respiration, c'est l'endroit précis où la
 * musique se découvre : la franchir recollerait deux prises propres autour du
 * seul passage qu'il fallait jeter. D'où la condition sur le résidu, et pas
 * seulement sur la voix.
 */
function segmente(fenetres, reperes, { fenetreS, marge, minS, maxS }) {
  const seuilParole = reperes.voixHaute - SOUS_LE_HAUT

  const parle = (f) => f.voix >= seuilParole
  const propre = (f) => f.voix - f.accomp >= marge

  // Le plancher du résidu quand la voix est seule : ce que « rien derrière »
  // vaut DANS CE FICHIER. Les six décibels de tolérance absorbent la
  // respiration d'un micro et le bruit de pièce, sans laisser passer une nappe.
  const propres = fenetres.filter((f) => parle(f) && propre(f))
  if (!propres.length) return []
  const accompsTries = propres.map((f) => f.accomp).sort((a, b) => a - b)
  const plancherFond = accompsTries[Math.floor(accompsTries.length / 2)] + 6

  const pontable = (f) => !parle(f) && f.accomp <= plancherFond

  const bruts = []
  let debut = null
  let creux = 0
  const PONT_MAX = Math.max(1, Math.round(1.0 / fenetreS)) // une seconde

  fenetres.forEach((f, i) => {
    const bon = parle(f) && propre(f)
    if (bon) {
      if (debut === null) debut = i
      creux = 0
      return
    }
    if (debut === null) return
    if (pontable(f) && creux < PONT_MAX) {
      creux += 1
      return
    }
    bruts.push([debut, i - creux])
    debut = null
    creux = 0
  })
  if (debut !== null) bruts.push([debut, fenetres.length - creux])

  // Découper ce qui dépasse, jeter ce qui est trop court. La coupe tombe au
  // creux de voix le plus profond du dernier tiers autorisé : couper au milieu
  // d'un mot s'entend, et une référence qui commence par une syllabe tronquée
  // apprend cette syllabe au moteur.
  const decoupes = []
  for (const [a, b] of bruts) {
    let curseur = a
    while (b - curseur > maxS / fenetreS) {
      const plafond = curseur + Math.round(maxS / fenetreS)
      const depuis = curseur + Math.round((maxS / fenetreS) * 0.7)
      let creuxIdx = plafond
      let creuxVal = Infinity
      for (let k = depuis; k < plafond && k < b; k++) {
        if (fenetres[k].voix < creuxVal) { creuxVal = fenetres[k].voix; creuxIdx = k }
      }
      decoupes.push([curseur, creuxIdx])
      curseur = creuxIdx
    }
    decoupes.push([curseur, b])
  }

  return decoupes
    .map(([a, b]) => {
      const tranche = fenetres.slice(a, b)
      const ecarts = tranche.map((f) => f.voix - f.accomp)
      return {
        debutS: +(a * fenetreS).toFixed(2),
        finS: +(b * fenetreS).toFixed(2),
        secondes: +((b - a) * fenetreS).toFixed(2),
        // La note d'un extrait est son écart MINIMAL, pas sa moyenne : un
        // extrait vaut ce que vaut son pire instant. Une moyenne laisserait
        // passer une prise propre gâtée par deux secondes de générique.
        note: ecarts.length ? +Math.min(...ecarts).toFixed(1) : 0,
        ecartMoyen: ecarts.length
          ? +(ecarts.reduce((s, x) => s + x, 0) / ecarts.length).toFixed(1)
          : 0,
      }
    })
    .filter((s) => s.secondes >= minS)
}

// ---------------------------------------------------------------------------
//  La récolte
// ---------------------------------------------------------------------------

async function recolte(urls, nomDemande) {
  await installeOutillage()

  const id = nomDemande ? slugifie(nomDemande) : null
  let dossier = id ? path.join(DOSSIER, id) : null
  let manifeste = dossier ? litJson(path.join(dossier, 'empreinte.json'), null) : null

  const temporaire = path.join(CHEMINS.cachePartage, 'empreinte-travail')
  assureDossier(temporaire)

  // Ce qui a échoué, pour le redire à la fin. SUR QUARANTE SOURCES, UNE
  // ERREUR AU DIX-SEPTIÈME RANG A DÉFILÉ DEPUIS LONGTEMPS quand la récolte se
  // termine : sans ce relevé, on ne saurait pas qu'il faut y revenir.
  const echecs = []

  for (const [i, brut] of urls.entries()) {
    let source
    try {
      source = resoudLaSource(brut)
    } catch (e) {
      journal.etape(i + 1, urls.length, String(brut).slice(0, 80))
      journal.erreur(e.message)
      echecs.push({ source: String(brut).slice(0, 120), raison: e.message.split('\n')[0] })
      continue
    }
    const url = source.valeur
    journal.etape(i + 1, urls.length, source.type === 'fichier' ? path.basename(url) : url)

    // Un fichier local n'a pas de métadonnées à interroger : son nom EST son
    // titre, et aller demander à yt-dlp ce qu'il en pense n'aurait pas de sens.
    const meta = source.type === 'adresse' ? await metadonnees(url).catch(() => null) : null
    const titre = meta?.texte || meta?.auteur || (source.type === 'fichier' ? path.basename(url) : 'source')

    // Le dossier se nomme d'après la PREMIÈRE source quand aucun nom n'est
    // donné. Récolter plusieurs vidéos du même locuteur sans `--nom=` les
    // éparpillerait dans autant de dossiers : la commande le dit.
    if (!dossier) {
      const auto = slugifie(meta?.auteur || titre).slice(0, 40) || 'voix'
      dossier = path.join(DOSSIER, auto)
      manifeste = litJson(path.join(dossier, 'empreinte.json'), null)
      if (urls.length > 1) {
        journal.attention(
          `Aucun --nom= : tout part dans « ${auto} », d'après la première source.`
        )
      }
    }

    manifeste ??= { id: path.basename(dossier), cree: new Date().toISOString(), sources: [], extraits: [] }

    if (manifeste.sources.some((s) => s.url === url)) {
      journal.info(`Déjà récoltée, on passe.`)
      continue
    }

    const dejaS = manifeste.extraits.reduce((s, e) => s + e.secondes, 0)
    if (dejaS >= PLAFOND_S) {
      journal.attention(`Plafond atteint (${duree(dejaS)}). On s'arrête là.`)
      break
    }

    // UN FICHIER LOCAL NE SE TÉLÉCHARGE PAS, ET NE SE SUPPRIME PAS NON PLUS.
    // `estTemporaire` porte cette différence jusqu'au nettoyage, en bas de
    // boucle : effacer la source d'origine de quelqu'un serait impardonnable.
    let audio
    const estTemporaire = source.type === 'adresse'
    try {
      if (estTemporaire) {
        journal.detail(`Téléchargement de l'audio…`)
        audio = await telechargeAudio(url, path.join(temporaire, `src-${Date.now()}`))
      } else {
        audio = url
      }
    } catch (e) {
      journal.erreur(e.message.split('\n')[0])
      echecs.push({ source: url.slice(0, 120), raison: `téléchargement : ${e.message.split('\n')[0]}` })
      continue
    }

    const infos = await sonde(audio)
    journal.detail(`${duree(infos.dureeS)} d'audio. Séparation…`)

    const travail = path.join(temporaire, `sep-${Date.now()}`)
    let m
    try {
      const { voix, accompagnement } = await separe(audio, travail, {
        modele: options.modele || MODELE_DEFAUT,
      })
      m = await mesure(voix, accompagnement)
    } catch (e) {
      // Une source qui casse la séparation ne doit pas emporter les
      // trente-neuf autres : on la note et on continue.
      journal.erreur(e.message.split('\n')[0])
      echecs.push({ source: url.slice(0, 120), raison: `séparation : ${e.message.split('\n')[0]}` })
      fs.rmSync(travail, { recursive: true, force: true })
      if (estTemporaire) fs.rmSync(audio, { force: true })
      continue
    }

    const segments = segmente(m.fenetres, m.reperes, {
      fenetreS: m.fenetreS,
      marge: MARGE,
      minS: MIN_S,
      maxS: MAX_S,
    })

    const propreS = segments.reduce((s, x) => s + x.secondes, 0)
    journal.detail(
      `écart médian ${m.reperes.ecartMedian} dB · ` +
        `${segments.length} extrait${segments.length > 1 ? 's' : ''} · ${duree(propreS)} de voix seule`
    )

    if (!segments.length) {
      journal.attention(
        `Rien de retenu. Le fond est à ${m.reperes.ecartMedian} dB sous la voix, ` +
          `il en faut ${MARGE}. Baisse le seuil avec --marge=15 si tu acceptes un peu de fond.`
      )
    }

    // On découpe DANS L'ORIGINAL, jamais dans la piste séparée. Voir l'en-tête.
    // Le dossier n'apparaît que s'il y a quelque chose à y mettre : une récolte
    // qui ne retient rien ne doit pas laisser une empreinte vide derrière elle,
    // que `--liste` masquerait et qu'on retrouverait six mois plus tard.
    const dossierExtraits = path.join(dossier, 'extraits')
    if (segments.length) assureDossier(dossierExtraits)
    let rang = manifeste.extraits.length
    for (const s of segments) {
      rang += 1
      const nom = `${String(rang).padStart(3, '0')}.wav`
      await decoupe(audio, path.join(dossierExtraits, nom), s.debutS, s.finS)
      manifeste.extraits.push({ ...s, fichier: `extraits/${nom}`, source: url })
    }

    manifeste.sources.push({
      url,
      plateforme: source.type === 'fichier' ? 'fichier' : plateforme(url),
      titre: String(titre).slice(0, 200),
      secondes: infos.dureeS,
      recolteLe: new Date().toISOString(),
      reperes: m.reperes,
      retenus: segments.length,
      retenuS: +propreS.toFixed(1),
    })

    fs.rmSync(travail, { recursive: true, force: true })
    // Le fichier de quelqu'un ne se supprime jamais. Seul le nôtre s'en va.
    if (estTemporaire) fs.rmSync(audio, { force: true })

    // LE MANIFESTE S'ÉCRIT À CHAQUE SOURCE, PAS À LA FIN.
    //
    // Une récolte de quarante liens tourne une heure. Coupée au trente-huitième
    // — fenêtre fermée, machine en veille, câble arraché —, une écriture finale
    // aurait tout perdu. Écrit ici, le prochain passage voit les trente-sept
    // déjà faites dans `sources` et les saute : la récolte reprend où elle en
    // était sans qu'on ait à s'en occuper.
    manifeste.totalS = +manifeste.extraits.reduce((s, e) => s + e.secondes, 0).toFixed(1)
    manifeste.majLe = new Date().toISOString()
    ecritJson(path.join(dossier, 'empreinte.json'), manifeste)

    // Le cumul après chaque source : sur un lot, c'est le seul chiffre qui dit
    // s'il faut continuer à chercher des liens ou si on en a assez.
    if (urls.length > 1) {
      journal.detail(`— cumul : ${duree(manifeste.totalS)} sur ${duree(PLAFOND_S)} visées`)
    }
  }

  if (!manifeste || !manifeste.extraits.length) {
    journal.attention(`Aucun extrait récolté.`)
    if (dossier && fs.existsSync(dossier) && !fs.readdirSync(dossier).length) fs.rmdirSync(dossier)
    if (echecs.length) diLesEchecs(echecs)
    return null
  }

  // La référence : les extraits les plus propres d'abord, bout à bout, jusqu'à
  // la durée demandée. Un moteur zero-shot en lit quinze à trente secondes ; au
  // delà il n'écoute plus, et lui donner du moins bon ne peut que le desservir.
  const meilleurs = [...manifeste.extraits].sort((a, b) => b.note - a.note)
  const retenus = []
  let cumul = 0
  for (const e of meilleurs) {
    if (cumul >= REFERENCE_S) break
    retenus.push(path.join(dossier, e.fichier))
    cumul += e.secondes
  }
  await recolleAudio(retenus, path.join(dossier, 'reference.wav'))

  manifeste.totalS = +manifeste.extraits.reduce((s, e) => s + e.secondes, 0).toFixed(1)
  manifeste.referenceS = +cumul.toFixed(1)
  manifeste.marge = MARGE
  manifeste.majLe = new Date().toISOString()
  ecritJson(path.join(dossier, 'empreinte.json'), manifeste)

  journal.titre(`Empreinte « ${manifeste.id} »`)
  journal.ok(
    `${manifeste.extraits.length} extraits · ${duree(manifeste.totalS)} de voix seule · ` +
      `${manifeste.sources.length} source${manifeste.sources.length > 1 ? 's' : ''}`
  )
  journal.ok(`reference.wav — ${duree(cumul)} des meilleurs`)
  journal.detail(path.relative(CHEMINS.racine, dossier))
  console.log()
  if (echecs.length) diLesEchecs(echecs)
  verdict(manifeste.totalS)
  return manifeste
}

/** Ce qui n'est pas passé, rassemblé à la fin plutôt que noyé dans le défilement. */
function diLesEchecs(echecs) {
  journal.attention(`${echecs.length} source${echecs.length > 1 ? 's' : ''} non récoltée${echecs.length > 1 ? 's' : ''} :`)
  for (const e of echecs) journal.detail(`${e.source} — ${e.raison}`)
  console.log()
}

/**
 * Ce que la récolte permet, et ce qu'il manque encore.
 *
 * Les deux moteurs ne demandent pas la même chose, et de très loin : quinze
 * secondes suffisent au zero-shot, un entraînement en réclame cent fois plus.
 * Annoncer « 4 minutes récoltées » sans dire à quoi ça donne droit laisserait
 * chercher le seuil ailleurs.
 */
function verdict(totalS) {
  if (totalS >= 900) {
    journal.ok(`Assez pour un entraînement (il en faut 15 à 30 min).`)
  } else if (totalS >= 15) {
    journal.ok(`Assez pour du zero-shot, qui lit 15 à 30 s.`)
    journal.detail(`Pour un entraînement, vise 15 min — il manque ${duree(900 - totalS)}.`)
  } else {
    journal.attention(
      `Court. Le zero-shot lit 15 à 30 s, il en manque ${duree(15 - totalS)} : ` +
        `ajoute une source.`
    )
  }
}

// ---------------------------------------------------------------------------
//  Lire ce qui est là
// ---------------------------------------------------------------------------

function empreintes() {
  if (!fs.existsSync(DOSSIER)) return []
  return fs
    .readdirSync(DOSSIER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => litJson(path.join(DOSSIER, e.name, 'empreinte.json'), null))
    .filter(Boolean)
    .sort((a, b) => (b.majLe ?? '').localeCompare(a.majLe ?? ''))
}

function liste() {
  const tout = empreintes()
  if (!tout.length) {
    journal.info(`Aucune empreinte. Récolte-en une : npm run empreinte -- <url>`)
    return
  }
  journal.titre(`Empreintes de voix`)
  for (const e of tout) {
    journal.ok(
      `${e.id} — ${duree(e.totalS ?? 0)} en ${e.extraits.length} extraits, ` +
        `${e.sources.length} source${e.sources.length > 1 ? 's' : ''}`
    )
  }
  console.log()
}

function detail(id) {
  const e = litJson(path.join(DOSSIER, id, 'empreinte.json'), null)
  if (!e) throw new Error(`Aucune empreinte « ${id} ». Vois --liste.`)

  journal.titre(`Empreinte « ${e.id} »`)
  journal.info(`${duree(e.totalS ?? 0)} de voix seule · seuil ${e.marge} dB`)
  console.log()
  for (const s of e.sources) {
    journal.detail(`${s.titre.slice(0, 60)}`)
    journal.detail(
      `  ${duree(s.secondes)} téléchargées → ${duree(s.retenuS)} gardées · ` +
        `écart médian ${s.reperes?.ecartMedian ?? '?'} dB`
    )
  }
  console.log()
  const tries = [...e.extraits].sort((a, b) => b.note - a.note)
  for (const x of tries.slice(0, 15)) {
    journal.detail(
      `${x.fichier}  ${String(x.secondes).padStart(5)} s  ` +
        `pire écart ${String(x.note).padStart(5)} dB  (moyen ${x.ecartMoyen})`
    )
  }
  if (tries.length > 15) journal.detail(`… et ${tries.length - 15} autres`)
  console.log()
}

function retire(id, { silencieux = false } = {}) {
  // Le nom vient d'une route HTTP : il ne doit désigner qu'un dossier DANS
  // marque/voix/. Sans cette borne, un `..` bien placé effacerait ailleurs.
  const cible = path.join(DOSSIER, id)
  if (path.dirname(cible) !== DOSSIER) throw new Error(`Nom d'empreinte refusé : « ${id} ».`)
  if (!fs.existsSync(cible)) throw new Error(`Aucune empreinte « ${id} ».`)
  fs.rmSync(cible, { recursive: true, force: true })
  if (!silencieux) journal.ok(`« ${id} » retirée, fichiers compris.`)
}

// ---------------------------------------------------------------------------

principal(async () => {
  // `--json` : la même commande, mais parlée à l'atelier. Le format suit celui
  // des autres commandes du pipeline — un objet, sur la dernière ligne.
  const enJson = drapeau(options, 'json')
  const rends = (o) => void console.log(JSON.stringify({ ok: true, ...o }, null, 2))

  if (drapeau(options, 'liste')) {
    if (enJson) return rends({ empreintes: empreintes() })
    return liste()
  }

  if (typeof options.detail === 'string') {
    if (enJson) {
      const e = litJson(path.join(DOSSIER, options.detail, 'empreinte.json'), null)
      if (!e) throw new Error(`Aucune empreinte « ${options.detail} ».`)
      return rends({ empreinte: e })
    }
    return detail(options.detail)
  }

  if (typeof options.retire === 'string') {
    retire(options.retire, { silencieux: enJson })
    if (enJson) return rends({ retire: options.retire })
    return
  }

  // `--depuis=` : les liens d'un fichier texte, un par ligne.
  const listeDepuis = typeof options.depuis === 'string' ? litLaListe(options.depuis) : []

  if (!positionnels.length && !listeDepuis.length) {
    throw new Error(
      `Donne au moins une source.\n` +
        `  npm run empreinte -- https://www.youtube.com/watch?v=… --nom="Untel"\n` +
        `  npm run empreinte -- --depuis=liens.txt --nom="Untel"\n` +
        `  npm run empreinte -- --liste`
    )
  }

  const nom = typeof options.nom === 'string' ? options.nom : null

  // `--depuis=` et les positionnels se cumulent : on peut donner une liste ET
  // ajouter deux liens trouvés depuis. Les doublons partent ici plutôt que de
  // se découvrir au téléchargement, où ils auraient déjà coûté une minute.
  const sources = [...new Set([...listeDepuis, ...positionnels])]
  const m = await recolte(sources, nom)
  if (enJson) rends({ empreinte: m })
})
