#!/usr/bin/env node
/**
 * entraine.mjs — apprendre un timbre à partir d'une empreinte récoltée.
 *
 *   npm run entraine -- <id>
 *   npm run entraine -- <id> --epoques=300 --lot=8
 *   npm run entraine -- --liste
 *   npm run entraine -- --installe
 *
 * CE QU'UN MODÈLE ENTRAÎNÉ APPREND, ET CE QU'IL N'APPREND PAS.
 *
 * Il apprend un TIMBRE : la signature du conduit vocal, les formants, la
 * texture. Il n'apprend PAS une façon de parler. En conversion voix-à-voix, la
 * mélodie de la phrase vient de la prise SOURCE — le modèle suit ton contour de
 * hauteur, transposé dans la tessiture de la cible, et n'y substitue que la
 * couleur.
 *
 * C'est une bonne nouvelle et il faut la dire clairement, parce qu'on attend
 * souvent l'inverse : multiplier les sources de récolte améliore la ROBUSTESSE
 * du timbre — plus de phonèmes vus, plus de registres, moins d'artefacts sur un
 * chuchotement ou un aigu — et ne change rien au phrasé. Ton intonation reste la
 * tienne, ce qui est exactement ce que demande le §9 : la prise sort telle
 * qu'elle a été jouée, seule sa couleur change.
 *
 * POURQUOI L'ENTRAÎNEMENT EST UNE COMMANDE À PART.
 *
 * Il dure de trente minutes à deux heures et sature la carte graphique. Le
 * mettre dans `empreinte` ferait d'une récolte de trois minutes un engagement
 * d'une soirée. On récolte, on écoute, on décide, et alors seulement on
 * entraîne.
 *
 * CE QUI TOURNE DESSOUS.
 *
 * Applio (fork MIT et maintenu de RVC), dans son propre environnement Python
 * avec un torch CUDA. Cette commande ne fait qu'orchestrer ses quatre étapes —
 * préparation, extraction des traits, entraînement, index — et ranger le
 * résultat là où le reste de la chaîne saura le trouver.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { CHEMINS, assureDossier, litJson, ecritJson } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import {
  DOSSIER_APPLIO,
  applio,
  installeApplio,
  prerequisitesApplio,
  cudaDisponible,
} from './lib/voix-locale.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
entraine — apprendre un timbre à une empreinte récoltée

  npm run entraine -- <id>              entraîne sur marque/voix/<id>/extraits/
  npm run entraine -- --liste           les modèles entraînés
  npm run entraine -- --installe        pose Applio sans rien entraîner
  npm run entraine -- --retire=<id>     retire le modèle, garde l'empreinte

Réglages

  --epoques=300     nombre de passages sur le corpus
  --lot=8           taille du lot ; baisse à 4 si la carte manque de mémoire
  --frequence=48000 32000, 40000 ou 48000
  --f0=rmvpe        extracteur de hauteur : rmvpe, crepe, fcpe
  --garde=50        enregistre un point de reprise toutes N époques
  --gpu=0           quelle carte employer
  --economie-memoire  moins de VRAM, un peu plus lent — si le lot ne passe pas
  --recommence      repart de zéro au lieu de reprendre — après ajout de sources

Ce que ça demande

  15 à 30 min de voix propre dans l'empreinte — vois npm run empreinte -- --liste
  Une carte NVIDIA. Sur processeur, l'entraînement est hors de portée.
  Environ 45 min sur une RTX 3060 pour 300 époques et 20 min de voix.

Ce que ça produit

  marque/voix/<id>/modele/<id>.pth     le modèle
  marque/voix/<id>/modele/<id>.index   l'index de recherche
  marque/voix/<id>/modele/modele.json  ce qui a servi à l'entraîner

Le modèle apprend un TIMBRE, pas un phrasé : l'intonation restera la tienne.
`
)

const DOSSIER = path.join(CHEMINS.marque, 'voix')

const EPOQUES = nombre(options, 'epoques', 300)
const LOT = nombre(options, 'lot', 8)
const FREQUENCE = String(nombre(options, 'frequence', 48000))
const GARDE = nombre(options, 'garde', 50)
const GPU = String(nombre(options, 'gpu', 0))
const F0 = typeof options.f0 === 'string' ? options.f0 : 'rmvpe'

/**
 * En dessous, l'entraînement produit un modèle qui plaque le timbre sans savoir
 * le porter : il tient sur les voyelles vues et bave partout ailleurs. Une
 * heure de calcul pour un résultat inutilisable, ça se refuse.
 */
const PLANCHER_S = 120
const CONFORTABLE_S = 900

// ---------------------------------------------------------------------------

function empreinteDe(id) {
  const dossier = path.join(DOSSIER, id)
  if (path.dirname(dossier) !== DOSSIER) throw new Error(`Nom d'empreinte refusé : « ${id} ».`)
  const m = litJson(path.join(dossier, 'empreinte.json'), null)
  if (!m) {
    throw new Error(
      `Aucune empreinte « ${id} ».\n` +
        `  Ce qui existe : npm run empreinte -- --liste`
    )
  }
  return { dossier, manifeste: m }
}

/**
 * Le corpus est-il assez fourni ? On le dit AVANT de lancer une heure de calcul.
 *
 * Le seuil haut n'est pas un caprice : sous quinze minutes, le modèle n'a pas
 * vu assez de contextes phonétiques pour tenir un mot qu'il n'a jamais entendu,
 * et ça s'entend précisément là où on regarde — sur les consonnes sourdes et
 * les fins de phrase.
 */
function jugeLeCorpus(m) {
  const total = m.totalS ?? 0
  if (total < PLANCHER_S) {
    throw new Error(
      `« ${m.id} » ne porte que ${duree(total)} de voix.\n` +
        `  Un entraînement en demande 15 à 30 min ; sous ${duree(PLANCHER_S)} le résultat\n` +
        `  serait inutilisable et coûterait une heure de calcul.\n` +
        `  Récolte d'autres sources : npm run empreinte -- --depuis=liens.txt --nom="${m.id}"`
    )
  }
  if (total < CONFORTABLE_S) {
    journal.attention(
      `${duree(total)} seulement — l'entraînement va tourner, mais 15 min donnent ` +
        `nettement mieux. Il en manque ${duree(CONFORTABLE_S - total)}.`
    )
  } else {
    journal.ok(`${duree(total)} de voix propre en ${m.extraits.length} extraits.`)
  }
}

// ---------------------------------------------------------------------------
//  L'entraînement
// ---------------------------------------------------------------------------

async function entraine(id) {
  const { dossier, manifeste } = empreinteDe(id)

  journal.titre(`Entraînement de « ${id} »`)
  jugeLeCorpus(manifeste)

  await installeApplio()

  const carte = await cudaDisponible()
  if (!carte?.cuda) {
    throw new Error(
      `Aucune carte NVIDIA vue par torch (${carte?.torch ?? 'torch introuvable'}).\n` +
        `  Un entraînement RVC sur processeur demanderait plusieurs jours : on ne le lance pas.\n` +
        `  Réinstalle l'outillage : npm run entraine -- --installe`
    )
  }
  journal.ok(`${carte.carte} · torch ${carte.torch}`)

  const extraits = path.join(dossier, 'extraits')
  if (!fs.existsSync(extraits)) throw new Error(`Aucun extrait dans ${extraits}.`)

  const coeurs = Math.max(1, Math.min(16, (os.cpus()?.length ?? 4) - 2))
  const debut = Date.now()

  // Les modèles de base, s'ils manquent. Idempotent, et c'est ce qui permet de
  // relancer un entraînement sur une machine où Applio a été réinstallé sans
  // avoir à se souvenir de cette étape.
  await prerequisitesApplio({ silencieux: true })

  // -- 1. préparation -------------------------------------------------------
  //
  // DEUX DRAPEAUX SONT VOLONTAIREMENT ABSENTS DE CETTE LISTE.
  //
  // `--process-effects` et `--noise-reduction` sont des drapeaux : les écrire
  // les ACTIVE, il n'existe pas de « false » pour les éteindre. Or ce sont
  // exactement les deux traitements que le §9 interdit. Applio les propose
  // parce que la plupart des gens entraînent sur de la matière sale ; la nôtre
  // est déjà triée par mesure, et la débruiter maintenant apprendrait au modèle
  // la signature du débruiteur en même temps que le timbre.
  //
  // Ne pas les écrire est donc le geste, et cette note est là pour qu'on ne
  // « répare » pas leur absence un jour en croyant à un oubli.
  //
  // `--normalization-mode none` s'écrit, lui, parce que c'est une option à
  // valeur et que son défaut pourrait changer.
  journal.etape(1, 4, `Préparation du corpus`)
  await applio(
    [
      'preprocess',
      '--model-name', id,
      '--dataset-path', extraits,
      '--sample-rate', FREQUENCE,
      '--cpu-cores', String(coeurs),
      '--cut-preprocess', 'Automatic',
      '--normalization-mode', 'none',
    ],
    { etape: 'La préparation' }
  )

  // -- 2. traits ------------------------------------------------------------
  //
  // `rmvpe` est l'extracteur de hauteur recommandé : il tient sur une voix
  // parlée là où `crepe` décroche sur les attaques. `contentvec` est l'embedder
  // de référence — c'est lui qui encode CE QUI EST DIT, séparément de QUI le
  // dit, et c'est cette séparation qui permet de garder ta prise sous le timbre
  // d'un autre.
  journal.etape(2, 4, `Extraction des traits (${F0} + contentvec)`)
  await applio(
    [
      'extract',
      '--model-name', id,
      '--f0-method', F0,
      '--sample-rate', FREQUENCE,
      '--cpu-cores', String(coeurs),
      '--gpu', GPU,
      '--embedder-model', 'contentvec',
    ],
    { etape: `L'extraction` }
  )

  // -- 3. entraînement ------------------------------------------------------
  //
  // L'INDEX DE LA FOIS D'AVANT DOIT PARTIR, SINON IL SURVIT AU RÉENTRAÎNEMENT.
  //
  // `extract_index.py` commence par « si le fichier existe, on ne fait rien »
  // (ligne 25). Applio lance bien la génération après chaque entraînement,
  // mais elle ne produit alors plus rien : l'index reste celui du corpus
  // précédent. Constaté ici — modèle daté de 10:36, index de 10:19.
  //
  // Ce n'est pas cosmétique. L'index porte les vecteurs de traits du corpus
  // d'entraînement, et c'est lui qu'on interroge à la conversion pour retrouver
  // la prononciation la plus proche. Périmé, il fait chercher dans une matière
  // que le modèle ne connaît plus — on entend un timbre qui hésite, sans
  // qu'aucune étape n'ait signalé quoi que ce soit.
  const indexPrecedent = path.join(DOSSIER_APPLIO, 'logs', id, `${id}.index`)
  if (fs.existsSync(indexPrecedent)) fs.rmSync(indexPrecedent, { force: true })

  journal.etape(3, 4, `Entraînement — ${EPOQUES} époques, lot ${LOT}`)
  journal.detail(`C'est le poste long. Compte 30 min à 2 h selon la matière.`)
  // `--pretrained` est un couple `--pretrained/--no-pretrained` dont le défaut
  // est déjà « oui » ; on l'écrit quand même, parce que partir des poids
  // pré-entraînés est CE QUI REND l'entraînement possible en une heure au lieu
  // de plusieurs jours, et qu'un défaut qui bascule serait invisible ici.
  //
  // `--save-only-latest` est un drapeau : l'écrire l'active. Sans lui, un point
  // de reprise de 800 Mo s'empile toutes les cinquante époques, et un
  // entraînement de mille époques laisse vingt gigaoctets dans le cache.
  const argsTrain = [
    'train',
    '--model-name', id,
    '--save-every-epoch', String(Math.min(100, GARDE)),
    '--total-epoch', String(EPOQUES),
    '--sample-rate', FREQUENCE,
    '--batch-size', String(LOT),
    '--gpu', GPU,
    '--vocoder', 'HiFi-GAN',
    '--index-algorithm', 'Auto',
    '--pretrained',
    '--save-only-latest',
  ]
  // La carte manque de mémoire avant de manquer de temps : ce drapeau échange
  // de la vitesse contre de la VRAM, et c'est le bon échange sur une 3060 dès
  // qu'on monte le lot.
  if (drapeau(options, 'economie-memoire')) argsTrain.push('--checkpointing')

  // REPRENDRE EST LE DÉFAUT, ET C'EST BIEN — SAUF QUAND LE CORPUS A CHANGÉ.
  //
  // Applio repart du dernier point de reprise s'il en trouve un : c'est ce qui
  // permet de relancer après une coupure sans tout refaire. Mais si l'empreinte
  // a reçu de nouvelles sources depuis, reprendre continuerait d'affiner un
  // modèle bâti sur l'ancien corpus, et les extraits ajoutés ne pèseraient
  // presque rien. `--recommence` repart de zéro.
  if (drapeau(options, 'recommence')) argsTrain.push('--cleanup')
  await applio(argsTrain, { etape: `L'entraînement` })

  // -- 4. rangement ---------------------------------------------------------
  journal.etape(4, 4, `Rangement du modèle`)
  const range = rangeLeModele(id, dossier)

  const minutes = (Date.now() - debut) / 60000
  journal.titre(`Modèle « ${id} »`)
  journal.ok(`${path.basename(range.pth)} — ${(range.octets / 1e6).toFixed(0)} Mo`)
  if (range.index) journal.ok(`${path.basename(range.index)}`)
  journal.detail(`${EPOQUES} époques sur ${duree(manifeste.totalS)} de voix, en ${duree(minutes * 60)}`)
  journal.detail(path.relative(CHEMINS.racine, range.dossier))
  console.log()
  journal.info(`Rappel : le modèle porte le timbre. Le phrasé restera celui de ta prise.`)
  return range
}

/**
 * Applio écrit dans SON dossier de journaux. On rapatrie.
 *
 * Un modèle qui reste dans `logs/<nom>/` du cache partagé serait invisible pour
 * la chaîne, perdu à la première réinstallation d'Applio, et absent du dossier
 * qu'on déplace d'une machine à l'autre. Il appartient à l'empreinte : il vit
 * avec elle.
 */
function rangeLeModele(id, dossierEmpreinte) {
  const journaux = path.join(DOSSIER_APPLIO, 'logs', id)
  if (!fs.existsSync(journaux)) {
    throw new Error(`L'entraînement n'a rien laissé dans ${journaux}.`)
  }

  const fichiers = fs.readdirSync(journaux)
  // Le poids final porte le nom du modèle ; les points de reprise portent en
  // plus leur numéro d'époque. On prend le plus récent des `.pth` qui ne sont
  // ni `G_` ni `D_` — ceux-là sont les états de l'optimiseur, pas le modèle.
  const poids = fichiers
    .filter((f) => f.endsWith('.pth') && !/^[GD]_/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(journaux, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  if (!poids.length) {
    // LE CAS CONNU, ET IL EST SILENCIEUX CÔTÉ APPLIO.
    //
    // Applio enveloppe l'extraction du modèle final dans un `try` qui avale son
    // erreur, puis annonce « trained successfully » et sort en code 0. On se
    // retrouve avec les états de l'optimiseur — 1,3 Go inutilisables — et rien
    // d'autre. La cause de loin la plus fréquente est `assets/config.json`,
    // absent d'un clone à la main. On le nomme plutôt que de laisser chercher.
    const optimiseur = fichiers.some((f) => /^[GD]_/.test(f))
    throw new Error(
      `L'entraînement a tourné mais n'a pas produit de modèle.\n` +
        (optimiseur
          ? `  Les états de l'optimiseur sont là (G_/D_), le modèle final non :\n` +
            `  Applio a échoué à l'extraire et n'a rien dit. Cherche « error occurred\n` +
            `  extracting the model » dans le journal ci-dessus.\n`
          : '') +
        `  Trouvé dans ${journaux} :\n  ${fichiers.join(', ').slice(0, 300) || '(rien)'}`
    )
  }
  const index = fichiers.filter((f) => f.endsWith('.index')).sort()

  const cible = path.join(dossierEmpreinte, 'modele')
  assureDossier(cible)
  const pth = path.join(cible, `${id}.pth`)
  fs.copyFileSync(path.join(journaux, poids[0].f), pth)
  let indexCible = null
  if (index.length) {
    indexCible = path.join(cible, `${id}.index`)
    fs.copyFileSync(path.join(journaux, index.at(-1)), indexCible)
  }

  const manifeste = litJson(path.join(dossierEmpreinte, 'empreinte.json'), {})
  ecritJson(path.join(cible, 'modele.json'), {
    id,
    entraineLe: new Date().toISOString(),
    epoques: EPOQUES,
    lot: LOT,
    frequence: Number(FREQUENCE),
    f0: F0,
    embedder: 'contentvec',
    vocoder: 'HiFi-GAN',
    corpusS: manifeste.totalS ?? null,
    extraits: manifeste.extraits?.length ?? null,
    sources: manifeste.sources?.length ?? null,
    moteur: 'applio',
    pth: `modele/${id}.pth`,
    index: indexCible ? `modele/${id}.index` : null,
  })

  return { dossier: cible, pth, index: indexCible, octets: fs.statSync(pth).size }
}

// ---------------------------------------------------------------------------

function modeles() {
  if (!fs.existsSync(DOSSIER)) return []
  return fs
    .readdirSync(DOSSIER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => litJson(path.join(DOSSIER, e.name, 'modele', 'modele.json'), null))
    .filter(Boolean)
    .sort((a, b) => (b.entraineLe ?? '').localeCompare(a.entraineLe ?? ''))
}

function liste() {
  const tout = modeles()
  if (!tout.length) {
    journal.info(`Aucun modèle entraîné. Récolte puis entraîne :`)
    journal.detail(`npm run empreinte -- --depuis=liens.txt --nom="Untel"`)
    journal.detail(`npm run entraine -- untel`)
    return
  }
  journal.titre(`Modèles entraînés`)
  for (const m of tout) {
    journal.ok(
      `${m.id} — ${m.epoques} époques sur ${duree(m.corpusS ?? 0)}, ` +
        `${m.frequence / 1000} kHz, ${m.f0}`
    )
  }
  console.log()
}

function retire(id) {
  const cible = path.join(DOSSIER, id, 'modele')
  if (path.dirname(path.dirname(cible)) !== DOSSIER) throw new Error(`Nom refusé : « ${id} ».`)
  if (!fs.existsSync(cible)) throw new Error(`Aucun modèle pour « ${id} ».`)
  fs.rmSync(cible, { recursive: true, force: true })
  // L'empreinte reste : elle a coûté des téléchargements, le modèle se refait.
  journal.ok(`Modèle « ${id} » retiré. L'empreinte et ses extraits restent.`)
}

// ---------------------------------------------------------------------------

principal(async () => {
  const enJson = drapeau(options, 'json')
  const rends = (o) => void console.log(JSON.stringify({ ok: true, ...o }, null, 2))

  if (drapeau(options, 'installe')) {
    await installeApplio()
    const carte = await cudaDisponible()
    if (enJson) return rends({ installe: true, carte })
    if (carte?.cuda) journal.ok(`${carte.carte} · torch ${carte.torch}`)
    else journal.attention(`Aucune carte NVIDIA vue par torch — l'entraînement sera hors de portée.`)
    return
  }

  if (drapeau(options, 'liste')) {
    if (enJson) return rends({ modeles: modeles() })
    return liste()
  }

  if (typeof options.retire === 'string') {
    retire(options.retire)
    if (enJson) return rends({ retire: options.retire })
    return
  }

  const id = positionnels[0]
  if (!id) {
    throw new Error(
      `Donne l'identifiant d'une empreinte.\n` +
        `  npm run entraine -- untel\n` +
        `  npm run empreinte -- --liste     pour voir ce qui est récolté`
    )
  }
  const r = await entraine(id)
  if (enJson) rends({ modele: path.relative(CHEMINS.racine, r.pth) })
})
