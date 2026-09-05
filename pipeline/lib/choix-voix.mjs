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
import { dossierVideo, litJson, ecritJson, assureDossier, litChaine, env } from './chemins.mjs'

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
