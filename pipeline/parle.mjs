#!/usr/bin/env node
/**
 * parle.mjs — fabriquer la prise au lieu de l'enregistrer.
 *
 * QUAND ON S'EN SERT.
 *
 * Une vidéo commence normalement par une prise : quelqu'un parle, on dépose le
 * fichier. Sur une chaîne à avatar, personne ne parle — le texte existe, la
 * voix se fabrique. Cette commande comble exactement ce trou, et rien d'autre.
 *
 * LE RÉSULTAT EST UNE PRISE COMME UNE AUTRE.
 *
 * Il se dépose dans `02-tournage/`, à l'endroit exact où l'on aurait posé un
 * enregistrement. Tout ce qui suit — transcription mot à mot, sous-titres calés,
 * couverture en plans de coupe (§3) — fonctionne sans savoir d'où vient le son.
 * Une branche « pipeline TTS » aurait dupliqué six étapes pour une seule
 * différence.
 *
 * UN ESSAI N'EST PAS UNE PRISE.
 *
 * `--essai` écrit dans `03-audio/essais/` et ne touche pas au tournage. On
 * compare deux réglages, on écoute, et rien n'est engagé tant qu'on n'a pas
 * décidé. Sans cette séparation, chaque écoute écraserait la prise en cours et
 * invaliderait la transcription déjà calculée.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, dossierVideo, litJson, ecritJson, assureDossier } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, drapeau, nombre, aide, principal } from './lib/args.mjs'
import { sonde } from './lib/ffmpeg.mjs'
import {
  voix, voixPubliques, parle, credit, devis, dirige,
  MARQUEURS, MARQUEURS_SONS, MARQUEURS_TON, MODELE_DEFAUT, INTONATION, DEBIT,
} from './lib/fish.mjs'
import { travailFal } from './lib/fal.mjs'
import { modelesEntraines, convertitAvecModele } from './lib/voix-locale.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
parle.mjs — fabriquer la voix d'une vidéo à partir de son texte

  npm run parle -- --voix=?                 les voix du compte Fish
  npm run parle -- <slug> --texte="…"       fabrique la prise et la dépose
  npm run parle -- <slug> --fichier=t.txt   le texte vient d'un fichier
  npm run parle -- <slug> --texte=-         le texte vient de l'entrée standard
  npm run parle -- <slug> --essai           10 s, pour écouter, sans rien engager
  npm run parle -- <slug> --dirige          pose les marqueurs, et s'arrête là
  npm run parle -- <slug> --devis           ce que ça coûterait

  --voix=<id>          la voix Fish (défaut : celle de la chaîne)
  --modele-local=<id>  après lecture, ton modèle entraîné plaque son timbre
  --transpose=0        demi-tons — 0 entre deux voix féminines
  --modele=<id>        ${MODELE_DEFAUT} par défaut
  --temperature=0.92   ouvre la dynamique — 0,5 est régulier et mort
  --top-p=0.85         borne le vocabulaire prosodique
  --debit=1.12         le format court pardonne mal la lenteur
  --refais             remplace une prise déjà déposée

DIRIGER AVANT DE FAIRE LIRE

  --dirige lit le script, comprend ce que chaque phrase doit faire ressentir, et
  y pose les indications de jeu. Il REND le texte marqué sans rien fabriquer :
  on le relit, on le corrige, puis on le repasse en --texte=.

  Les mots ne bougent pas — seuls les marqueurs et la ponctuation. C'est vérifié
  mot à mot, et un écart annule la direction.

LE TEXTE PORTE L'INTONATION, PLUS QUE LES RÉGLAGES

  Fish lit les marqueurs entre parenthèses comme des indications de jeu, pas
  comme des mots : ${MARQUEURS.slice(0, 5).join(' ')}…

  Mesuré le 4 septembre 2026 : à réglages égaux, c'est le texte marqué qui rend
  la lecture la plus vivante, devant la seule montée de température. Une phrase
  plate reste plate quel que soit le réglage.

TON MODÈLE ENTRAÎNÉ NE SAIT PAS LIRE, ET C'EST STRUCTUREL

  RVC convertit un timbre, il ne fabrique pas de parole. --modele-local le
  branche APRÈS Fish : Fish lit avec du relief, ton modèle plaque ton timbre
  par-dessus. On garde l'intonation de l'un et la voix de l'autre.

  --transpose reste à 0 par défaut ici, et c'est différent du montage : le
  +12 de la chaîne est calibré pour TA prise à 125 Hz. Entre la voix Fish et
  myriam, toutes deux féminines, il n'y a rien à transposer.

LA PRISE FABRIQUÉE EST UNE PRISE

  Elle se dépose dans 02-tournage/, et la suite du pipeline ne fait aucune
  différence : un audio seul veut dire couverture intégrale en plans de coupe.
`
)

/** La voix retenue : la ligne de commande, puis la vidéo, puis la chaîne. */
function voixRetenue(slug) {
  if (options.voix) return { id: String(options.voix), origine: '--voix=' }
  if (slug) {
    const c = litJson(dossierVideo(slug).voixChoisie, null)
    if (c?.fish_voice_id) return { id: c.fish_voice_id, origine: '03-audio/voix-choisie.json' }
  }
  const chaine = litJson(CHEMINS.chaine, {})
  if (chaine.voix?.fish_voice_id) {
    return { id: chaine.voix.fish_voice_id, origine: 'config/chaine.json' }
  }
  return { id: null, origine: null }
}

/**
 * LE TEXTE ARRIVE PAR L'ENTRÉE STANDARD, PAS PAR UN ARGUMENT.
 *
 * `--texte=-` est le même idiome que `--valeur=-` du trousseau, et pour une
 * raison voisine : un script est du texte libre — sauts de ligne, guillemets,
 * apostrophes. Passé en argument, il se heurte au garde de l'atelier, qui refuse
 * les caractères de contrôle (à raison), et au plafond de longueur d'une ligne
 * de commande sous Windows. Un script de dix minutes fait dix mille signes.
 */
function litEntreeStandard() {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    throw new Error(`Rien à lire sur l'entrée standard.`)
  }
}

function texteDemande(slug) {
  if (options.texte === '-') return litEntreeStandard()
  if (options.fichier) {
    const f = path.resolve(String(options.fichier))
    if (!fs.existsSync(f)) throw new Error(`Fichier introuvable : ${f}`)
    return fs.readFileSync(f, 'utf8')
  }
  if (options.texte) return String(options.texte)

  // LE SCRIPT EST LE DERNIER RECOURS, PAS LE PREMIER.
  //
  // `01-script.md` porte des titres, des indications de plateau et des notes de
  // montage : les faire lire à voix haute donnerait une prise inutilisable. On
  // ne s'en sert que si rien d'autre n'est donné, et on le dit.
  const s = dossierVideo(slug).script
  if (slug && fs.existsSync(s)) {
    journal.attention(`Aucun --texte= : je lis ${path.relative(CHEMINS.racine, s)} tel quel.`)
    journal.detail(`Retire-en les titres et les didascalies si la prise sonne bizarrement.`)
    return fs.readFileSync(s, 'utf8')
  }
  throw new Error(`Donne le texte : --texte="…" ou --fichier=<chemin>.`)
}

principal(async () => {
  // ------------------------------------------------------ la liste des voix --
  if (options.voix === '?' || drapeau(options, 'voix-liste')) {
    const miennes = await voix()
    // La bibliothèque publique n'est pas indispensable : si elle échoue, on
    // rend quand même les voix du compte plutôt que de tout faire tomber.
    let publiques = []
    try {
      publiques = await voixPubliques({
        langue: options.langue ? String(options.langue) : 'fr',
        recherche: options.cherche ? String(options.cherche) : null,
      })
    } catch { /* la bibliothèque est un bonus */ }
    // Un modèle local n'est PAS une voix Fish : il ne lit pas, il convertit.
    // Il figure dans la même liste parce que c'est le même choix pour la
    // personne — « quelle voix je veux entendre » — mais le champ le distingue.
    const locaux = modelesEntraines().map((m) => ({ id: m.id, entraine_le: m.entraineLe }))

    if (drapeau(options, 'json')) {
      // LA LISTE DES MARQUEURS PART AVEC, ET C'EST UNE CORRECTION.
      //
      // L'écran en gardait une copie codée en dur. Elle a divergé au premier
      // ajout : `(excité)` existait dans la bibliothèque et pas dans l'écran,
      // qui comptait donc trois marqueurs là où le texte en portait quatre.
      // Une seule source, servie.
      console.log(JSON.stringify({
        ok: true, fish: miennes, bibliotheque: publiques, locaux,
        marqueurs: MARQUEURS, sons: MARQUEURS_SONS, tons: MARQUEURS_TON,
        credit: await credit(),
      }, null, 2))
      return
    }
    journal.titre(`Voix du compte Fish`)
    if (!miennes.length) journal.attention(`Aucune voix sur ton compte.`)
    for (const x of miennes) {
      journal.info(`${x.nom} · ${x.id}${x.langues.length ? ` · ${x.langues.join(', ')}` : ''}`)
    }
    if (publiques.length) {
      journal.titre(`Bibliothèque publique — les plus employées`)
      for (const x of publiques.slice(0, 15)) {
        journal.detail(`${x.nom} · ${x.id}${x.usages ? ` · ${x.usages} usages` : ''}`)
      }
    }
    if (locaux.length) {
      journal.titre(`Modèles entraînés — timbre plaqué APRÈS la lecture`)
      for (const m of locaux) journal.detail(`${m.id}   --modele-local=${m.id}`)
    }
    const reste = await credit()
    if (reste !== null) journal.detail(`crédit Fish : ${reste.toFixed(2)} $`)
    return
  }

  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug : npm run parle -- <slug> --texte="…"`)
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.base)) throw new Error(`Aucune vidéo « ${slug} ».`)

  const texte = texteDemande(slug).trim()
  const essai = drapeau(options, 'essai')

  // Un essai ne lit pas tout le script : dix secondes suffisent pour juger une
  // intonation, et payer la lecture complète pour l'écarter serait absurde.
  const aLire = essai ? texte.slice(0, 400) : texte

  const { id: voixId, origine } = voixRetenue(slug)
  if (!voixId) {
    throw new Error(
      `Aucune voix retenue.\n` +
        `  npm run parle -- --voix=?            pour les voir\n` +
        `  npm run parle -- ${slug} --voix=<id>  pour en choisir une`
    )
  }

  // --------------------------------------------------------- la direction --
  //
  // Elle s'arrête là, volontairement : le texte marqué revient sur la sortie
  // standard et rien n'est fabriqué. Enchaîner sur la lecture ferait payer une
  // génération avant d'avoir pu relire ce que la machine a compris — et une
  // direction d'acteur qu'on ne voit pas est une direction qu'on ne peut pas
  // juger (§2).
  if (drapeau(options, 'dirige')) {
    const chaine = litJson(CHEMINS.chaine, {})
    const marque = await dirige(texte, {
      registre: chaine.avatars?.registre ?? null,
      travailFal,
    })
    if (!marque) throw new Error(`La direction n'a rien rendu.`)
    const poses = MARQUEURS.reduce(
      (n, m) => n + (marque.split(m).length - 1), 0
    )
    if (drapeau(options, 'json')) {
      console.log(JSON.stringify({ ok: true, texte: marque, marqueurs: poses }, null, 2))
      return
    }
    journal.ok(`${poses} marqueur(s) posé(s).`)
    console.log()
    console.log(marque)
    return
  }

  const cout = devis(aLire)
  journal.info(`${aLire.length} caractères · environ ${cout.toFixed(4)} $ chez Fish`)
  if (drapeau(options, 'devis')) {
    journal.detail(`Retire --devis pour lancer.`)
    return
  }

  const modele = options.modele ? String(options.modele) : MODELE_DEFAUT
  const temperature = nombre(options, 'temperature', INTONATION.temperature)
  const topP = nombre(options, 'top-p', INTONATION.top_p)
  const debit = nombre(options, 'debit', DEBIT)
  journal.detail(`voix ${voixId}${origine ? ` (${origine})` : ''} · ${modele} · t=${temperature} · top_p=${topP} · débit=${debit}`)

  const marques = MARQUEURS.filter((m) => aLire.includes(m)).length
  if (!marques) {
    journal.attention(
      `Aucun marqueur d'intonation dans le texte — la lecture sera régulière.`
    )
    journal.detail(`Fish lit ${MARQUEURS.slice(0, 4).join(' ')} comme des indications de jeu.`)
  }

  // LE MODÈLE LOCAL SE BRANCHE APRÈS LA LECTURE, JAMAIS À LA PLACE.
  //
  // RVC convertit un timbre ; il ne fabrique pas de parole. Fish lit d'abord —
  // c'est lui qui porte l'intonation — puis le modèle plaque le timbre sur cette
  // lecture. On garde le relief de l'un et la voix de l'autre.
  // `convertitAvecModele` attend l'OBJET modèle — celui qui porte les chemins
  // du `.pth` et de l'index — pas son identifiant.
  const idLocal = options['modele-local'] ? String(options['modele-local']) : null
  const modeleLocal = idLocal ? (modelesEntraines().find((m) => m.id === idLocal) ?? null) : null
  if (idLocal && !modeleLocal) {
    const dispo = modelesEntraines().map((m) => m.id).join(', ') || 'aucun'
    throw new Error(`Aucun modèle entraîné « ${idLocal} ». Disponibles : ${dispo}.`)
  }
  // Le +12 de la chaîne est calibré pour la prise de l'auteur, à 125 Hz. La
  // source est ici une voix Fish déjà féminine : transposer la déformerait.
  const transpose = nombre(options, 'transpose', 0)

  /** Lit le texte, puis convertit si un modèle local est demandé. */
  async function fabrique(texteALire, sortie) {
    const r = await parle(texteALire, sortie, { voixId, modele, temperature, topP, debit })
    // ON ANNONCE CE QU'ON A RETIRÉ. Un nettoyage silencieux se découvre à
    // l'oreille trois essais plus tard, et on cherche ailleurs.
    if (r.sautsRetires) {
      journal.detail(
        `${r.sautsRetires} saut(s) de ligne retiré(s) — chacun insérait 0,3 s de blanc.`
      )
    }
    if (!modeleLocal) return
    journal.info(`Conversion vers « ${modeleLocal.id} »${transpose ? ` · ${transpose > 0 ? '+' : ''}${transpose} demi-tons` : ''}…`)
    const avant = await sonde(sortie)
    const converti = sortie.replace(/\.wav$/i, '-converti.wav')
    await convertitAvecModele(sortie, converti, modeleLocal, { transpose })
    const apres = await sonde(converti)
    // LA DURÉE EST VÉRIFIÉE, ET C'EST LA SEULE CHOSE QUI COMPTE VRAIMENT.
    //
    // Les sous-titres seront calés mot à mot sur ce fichier. Si la conversion
    // dérivait, rien d'autre ne le signalerait : on le découvrirait au rendu,
    // sur des sous-titres qui glissent, et on chercherait ailleurs.
    const ecart = Math.abs(apres.dureeS - avant.dureeS)
    if (ecart > 0.1) {
      journal.attention(`La conversion a changé la durée de ${ecart.toFixed(2)} s — les sous-titres glisseraient.`)
    }
    fs.rmSync(sortie, { force: true })
    fs.renameSync(converti, sortie)
  }

  // ---------------------------------------------------------------- l'essai --
  if (essai) {
    const dossier = path.join(v.audio, 'essais')
    assureDossier(dossier)
    // Le nom porte les réglages : deux essais de la même voix se comparent au
    // lieu de s'écraser. C'est la règle déjà retenue pour `choix-voix`.
    const nom = `essai-${modele}-t${String(temperature).replace('.', '')}${modeleLocal ? `-${modeleLocal.id}` : ''}.wav`
    const sortie = path.join(dossier, nom)
    await fabrique(aLire, sortie)
    const info = await sonde(sortie)
    journal.ok(`${duree(info.dureeS)} · ${path.relative(CHEMINS.racine, sortie)}`)
    journal.detail(`Rien n'est engagé : la prise n'a pas bougé.`)
    return
  }

  // --------------------------------------------------------------- la prise --
  assureDossier(v.tournage)
  const existantes = fs
    .readdirSync(v.tournage)
    .filter((n) => /\.(mp3|m4a|wav|mp4|mov)$/i.test(n))
  if (existantes.length && !drapeau(options, 'refais')) {
    throw new Error(
      `Une prise existe déjà : ${existantes.join(', ')}\n` +
        `  --refais pour la remplacer. Ce qui en découle (transcription, montage)\n` +
        `  devra être refait.`
    )
  }
  for (const n of existantes) fs.rmSync(path.join(v.tournage, n), { force: true })

  const sortie = path.join(v.tournage, 'voix.wav')
  await fabrique(texte, sortie)
  const info = await sonde(sortie)

  // On garde ce qui a produit ce fichier : sans ça, on ne sait plus six mois
  // plus tard avec quelle voix ni quels réglages la prise a été faite.
  ecritJson(v.voixChoisie, {
    ...litJson(v.voixChoisie, {}),
    fish_voice_id: voixId,
    fish_modele: modele,
    fish_temperature: temperature,
    fish_top_p: topP,
    fish_debit: debit,
    modele_local: modeleLocal?.id ?? null,
    transpose: modeleLocal ? transpose : null,
    fabriquee_le: new Date().toISOString(),
    caracteres: texte.length,
  })
  // Le texte lu est conservé à côté : c'est lui qui fait foi, pas le script.
  fs.writeFileSync(path.join(v.audio, 'texte-lu.txt'), texte, 'utf8')

  journal.ok(`${duree(info.dureeS)} · ${path.relative(CHEMINS.racine, sortie)}`)
  const reste = await credit()
  if (reste !== null) journal.detail(`crédit Fish restant : ${reste.toFixed(2)} $`)
  journal.info(`La prise est déposée. La suite est le montage habituel.`)

  if (drapeau(options, 'json')) {
    console.log(JSON.stringify({
      ok: true, slug, fichier: path.relative(CHEMINS.racine, sortie),
      secondes: Number(info.dureeS.toFixed(2)), voix: voixId, modele,
    }, null, 2))
  }
})
