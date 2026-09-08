/**
 * choix-voix.mjs — quelle voix pour quelle vidéo.
 *
 * À ne pas confondre avec `pipeline/voix.mjs`, qui fait la conversion. Ici on
 * ne décide que d'un identifiant ; la conversion est ailleurs.
 *
 * La voix se choisit **par vidéo**, pas une fois pour toute la chaîne. Deux
 * raisons : un format court et un long format n'appellent pas forcément le même
 * timbre, et surtout on ne sait qu'au moment de déposer la prise si la voix
 * retenue tient face à ce qui a été enregistré.
 *
 * L'ordre de priorité, du plus précis au plus général :
 *
 *   1. `--voix-id=` sur la ligne de commande — on force, pour un essai
 *   2. `03-audio/voix-choisie.json` — le choix fait pour CETTE vidéo
 *   3. `config/chaine.json` → `voix.elevenlabs_voice_id` — le défaut de la chaîne
 *   4. `ELEVENLABS_VOICE_ID` dans `.env` — le dernier recours
 *
 * Chaque niveau ne sert que si le précédent est absent. C'est ce qui permet de
 * garder un défaut de chaîne tout en le contredisant sur une vidéo précise.
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, dossierVideo, litJson, ecritJson, assureDossier, litChaine, env } from './chemins.mjs'

/** Le choix enregistré pour une vidéo, ou `null` s'il n'y en a pas. */
export function choixDe(slug) {
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.voixChoisie)) return null
  const c = litJson(v.voixChoisie, null)
  return c?.voice_id ? c : null
}

/**
 * Enregistre la voix retenue pour une vidéo.
 *
 * On garde le nom en plus de l'identifiant : six mois plus tard, `EXAVITQu4vr…`
 * ne dit rien, « Victoria » dit tout. L'identifiant reste la seule chose que le
 * pipeline utilise.
 */
export function enregistreChoix(
  slug,
  { voice_id, nom = null, apercu = null, stabilite = null, similarite = null }
) {
  if (!voice_id) throw new Error(`Aucun identifiant de voix à enregistrer.`)
  const v = dossierVideo(slug)
  assureDossier(v.audio)
  const choix = {
    voice_id,
    nom,
    apercu,
    // LE RÉGLAGE VOYAGE AVEC LA VOIX, ET C'EST TOUT L'INTÉRÊT.
    //
    // `stabilite` s'essayait sur dix secondes et retombait à 0,5 au montage :
    // on écoutait donc un extrait qui ne ressemblait pas à ce qui allait sortir.
    // Une valeur qu'on ne peut pas garder ne se règle pas, elle se devine.
    //
    // `null` veut dire « le défaut », pas « zéro ». La distinction compte :
    // stabilité 0 est un réglage très expressif parfaitement légitime, et le
    // confondre avec l'absence de réglage l'aurait rendu impossible à poser.
    stabilite: stabilite === null || stabilite === undefined ? null : Number(stabilite),
    similarite: similarite === null || similarite === undefined ? null : Number(similarite),
    choisi_le: new Date().toISOString(),
  }
  ecritJson(v.voixChoisie, choix)
  return choix
}

/**
 * Les réglages de conversion à employer, avec leurs défauts.
 *
 * Un seul endroit décide, pour que l'essai de dix secondes et la conversion
 * complète emploient exactement la même chose. C'est la seule façon que
 * l'écoute serve à quelque chose.
 */
export const REGLAGES_PAR_DEFAUT = { stabilite: 0.5, similarite: 0.8 }

export function reglagesDeVoix(choisie) {
  const nombre = (v, defaut) =>
    v === null || v === undefined || Number.isNaN(Number(v))
      ? defaut
      : Math.max(0, Math.min(1, Number(v)))
  return {
    stabilite: nombre(choisie?.stabilite, REGLAGES_PAR_DEFAUT.stabilite),
    similarite: nombre(choisie?.similarite, REGLAGES_PAR_DEFAUT.similarite),
  }
}

// ---------------------------------------------------------------------------
//  CE QUI A SERVI, PAS CE QUI ÉTAIT PRÉVU
// ---------------------------------------------------------------------------
//
// `voix-choisie.json` est une INTENTION : un timbre ElevenLabs mis de côté,
// éventuellement jamais employé — la chaîne peut être en mode local, ou la
// conversion avoir été faite avec un autre moteur ce jour-là. Revenir un mois
// plus tard sur une vidéo montée et lire « voix retenue : David » ne dit donc
// rien de ce qu'on entend dans le fichier.
//
// Ce second fichier est écrit par la CONVERSION, à la fin, avec ce qu'elle a
// réellement fait. C'est la seule source qui ne peut pas mentir : elle est
// produite par le geste qu'elle décrit.

/** Ce que la conversion a réellement employé, ou `null` si on ne sait pas. */
export function emploiDe(slug) {
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.voixEmployee)) return null
  return litJson(v.voixEmployee, null)
}

/**
 * Note ce qui vient de servir. Appelé par `monte.mjs`, après la conversion.
 *
 * Les champs absents sont écrits à `null` plutôt qu'omis : lire `{ mode:
 * 'local' }` sans clé `voice_id` laisserait croire à un fichier d'une ancienne
 * version, alors que c'est simplement une conversion qui n'en avait pas.
 */
export function enregistreEmploi(slug, infos = {}) {
  const v = dossierVideo(slug)
  assureDossier(v.audio)
  const emploi = {
    mode: infos.mode ?? null,
    voice_id: infos.voice_id ?? null,
    nom: infos.nom ?? null,
    stabilite: infos.stabilite ?? null,
    similarite: infos.similarite ?? null,
    modele_local: infos.modele_local ?? null,
    transpose: infos.transpose ?? null,
    origine: infos.origine ?? null,
    musique: infos.musique ?? null,
    fait_le: new Date().toISOString(),
  }
  ecritJson(v.voixEmployee, emploi)
  return emploi
}

// ---------------------------------------------------------------------------
//  Les favorites
// ---------------------------------------------------------------------------
//
// UNE FAVORITE APPARTIENT À LA CHAÎNE, PAS À UNE VIDÉO.
//
// C'est la même règle que les avatars et la direction artistique (§1) : on
// écoute quarante timbres une fois, on en garde cinq, et ces cinq-là servent
// sur la dixième vidéo comme sur la première. Les ranger par vidéo obligerait à
// refaire l'écoute à chaque fois, ce qui est exactement le travail qu'on essaie
// de ne plus refaire.
//
// Elles vivent donc dans `config/chaine.json`, et `nouvelle-chaine` les vide :
// un timbre est une décision de marque.
//
// LE MOTEUR FAIT PARTIE DE L'IDENTITÉ. Fish et ElevenLabs ont chacun leurs
// identifiants, et rien n'interdit qu'ils se ressemblent. Une favorite est
// donc une paire (moteur, identifiant), jamais un identifiant seul.

const MOTEURS_FAVORIS = ['elevenlabs', 'fish']

const cheminChaine = () => path.join(CHEMINS.config, 'chaine.json')

/** Les voix mises de côté, toutes moteurs confondus. */
export function favoris() {
  const chaine = litChaine()
  const liste = chaine?.voix?.favoris
  if (!Array.isArray(liste)) return []
  return liste
    .filter((f) => f && f.id && MOTEURS_FAVORIS.includes(f.moteur))
    .map((f) => ({
      moteur: f.moteur,
      id: String(f.id),
      nom: f.nom ?? null,
      proprietaire: f.proprietaire ?? null,
      // L'adresse de l'extrait de catalogue, quand on l'avait sous la main au
      // moment de la mise de côté. Sans elle, réécouter une favorite obligerait
      // à la retrouver dans la bibliothèque — c'est-à-dire à refaire la
      // recherche qu'elle existe pour éviter.
      apercu: f.apercu ?? null,
      note: f.note ?? null,
      ajoute_le: f.ajoute_le ?? null,
    }))
}

export const estFavorite = (moteur, id) =>
  favoris().some((f) => f.moteur === moteur && f.id === String(id))

/** Ajoute, ou met à jour ce qu'on sait d'une favorite déjà là. */
export function ajouteFavori({ moteur, id, nom = null, proprietaire = null, apercu = null, note = null }) {
  if (!MOTEURS_FAVORIS.includes(moteur)) {
    throw new Error(`Moteur inconnu « ${moteur} ». Attendu : ${MOTEURS_FAVORIS.join(' ou ')}.`)
  }
  if (!id) throw new Error(`Donne l'identifiant de la voix à mettre en favori.`)
  const chemin = cheminChaine()
  const chaine = litJson(chemin, {})
  const liste = favoris()
  const dejaLa = liste.find((f) => f.moteur === moteur && f.id === String(id))
  // On ne remplace un nom connu par rien : une deuxième mise en favori depuis
  // un écran qui n'a pas le nom sous la main effacerait celui d'avant.
  const suite = dejaLa
    ? liste.map((f) =>
        f === dejaLa
          ? {
              ...f,
              nom: nom ?? f.nom,
              proprietaire: proprietaire ?? f.proprietaire,
              apercu: apercu ?? f.apercu,
              note: note ?? f.note,
            }
          : f
      )
    : [
        ...liste,
        {
          moteur,
          id: String(id),
          nom,
          proprietaire,
          apercu,
          note,
          ajoute_le: new Date().toISOString(),
        },
      ]
  chaine.voix = { ...(chaine.voix ?? {}), favoris: suite }
  ecritJson(chemin, chaine)
  return { favoris: suite, ajoute: !dejaLa }
}

/** Retire une favorite. Rend `false` si elle n'y était pas. */
export function retireFavori({ moteur, id }) {
  const chemin = cheminChaine()
  const chaine = litJson(chemin, {})
  const liste = favoris()
  const suite = liste.filter((f) => !(f.moteur === moteur && f.id === String(id)))
  if (suite.length === liste.length) return { favoris: liste, retire: false }
  chaine.voix = { ...(chaine.voix ?? {}), favoris: suite }
  ecritJson(chemin, chaine)
  return { favoris: suite, retire: true }
}

/** Oublie le choix : la vidéo repart sur le défaut de la chaîne. */
export function oublieChoix(slug) {
  const v = dossierVideo(slug)
  if (fs.existsSync(v.voixChoisie)) fs.rmSync(v.voixChoisie, { force: true })
}

/**
 * La voix à employer, et d'où elle vient.
 *
 * Rendre la provenance en plus de l'identifiant n'est pas cosmétique : quand
 * une vidéo sort avec le mauvais timbre, la seule question utile est « lequel
 * des quatre niveaux a gagné ? ».
 */
export function voixPour(slug, forcee = null) {
  if (forcee && forcee !== true) {
    return { voice_id: String(forcee), nom: null, origine: 'ligne de commande' }
  }
  const choix = slug ? choixDe(slug) : null
  if (choix) return { ...choix, origine: 'choix de la vidéo' }

  const chaine = litChaine()
  const parChaine = chaine?.voix?.elevenlabs_voice_id
  if (parChaine) return { voice_id: parChaine, nom: chaine?.voix?.nom ?? null, origine: 'défaut de la chaîne' }

  const parEnv = env('ELEVENLABS_VOICE_ID', null)
  if (parEnv) return { voice_id: parEnv, nom: null, origine: '.env' }

  return { voice_id: null, nom: null, origine: null }
}
