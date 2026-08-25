/**
 * elevenlabs.mjs — remplacer le timbre de la voix sans toucher à l'intonation.
 *
 * Le principe de la stack : tu enregistres, tu joues le texte, tu poses les
 * silences. ElevenLabs ne change que la couleur de la voix. Le timing et le jeu
 * sont les tiens.
 *
 * Trois contraintes vérifiées qu'il ne faut pas contourner :
 *
 *  1. **300 secondes et 50 Mo par requête**, sur tous les plans. Au-delà on
 *     découpe — mais on découpe *au milieu d'un silence*, jamais au milieu d'un
 *     mot, et on demande du PCM et non du MP3 : le MP3 ajoute ~26 ms de
 *     remplissage à chaque jonction, ce qui décale les sous-titres un peu plus à
 *     chaque morceau.
 *  2. Le modèle par défaut de l'API est anglophone. On passe donc
 *     `eleven_multilingual_sts_v2` explicitement, à chaque appel.
 *  3. **On aligne sur la sortie, jamais sur la source.** Le fichier rendu par
 *     le convertisseur n'est pas identique à l'échantillon près à l'entrée :
 *     aligner sur l'enregistrement d'origine donne des sous-titres qui glissent.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { avecCle, clefGrillee, pool } from './trousseau.mjs'
import { demande, ErreurHttp } from './http.mjs'
import { journal, duree } from './journal.mjs'
import { assureDossier, env } from './chemins.mjs'
import { sonde, detecteSilences, ffmpeg, recolleAudio } from './ffmpeg.mjs'

const API = 'https://api.elevenlabs.io/v1'

/** Plafonds imposés par l'API. */
export const LIMITE_S = 300
export const LIMITE_OCTETS = 50 * 1024 * 1024

/** Cibles de découpage : on vise 210 s, on ne dépasse jamais 270 s. */
const CIBLE_MORCEAU_S = 210
const PLAFOND_MORCEAU_S = 270
const PLANCHER_MORCEAU_S = 20

const entetes = (cle) => ({ 'xi-api-key': cle })

function interprete(e) {
  const statut = e?.statut
  if (statut === 401) throw clefGrillee('clé invalide', { definitif: true })
  if (statut === 429 || statut === 402) throw clefGrillee(`quota épuisé (HTTP ${statut})`)
  if (statut === 403 && /voice/i.test(e.corps || '')) {
    // La voix n'est pas accessible à ce compte : changer de clé ne sert à rien.
    throw new Error(
      `Cette voix n'est pas accessible depuis ce compte ElevenLabs. ` +
        `Ajoute-la à ta bibliothèque, ou choisis une voix « premade ».`
    )
  }
  throw e
}

// ---------------------------------------------------------------------------
//  Quota
// ---------------------------------------------------------------------------

export async function quota(cle) {
  try {
    const r = await demande(`${API}/user/subscription`, { headers: entetes(cle) })
    const s = await r.json()
    const restant = Math.max(0, (s.character_limit ?? 0) - (s.character_count ?? 0))
    return {
      restant,
      limite: s.character_limit ?? 0,
      utilise: s.character_count ?? 0,
      palier: s.tier ?? 'inconnu',
      // Le palier gratuit n'accorde aucune licence commerciale : une vidéo
      // monétisée ne peut pas en sortir.
      commercial: (s.tier ?? 'free') !== 'free',
      reset: s.next_character_count_reset_unix
        ? new Date(s.next_character_count_reset_unix * 1000)
        : null,
      minutesSts: restant / 1000,
    }
  } catch (e) {
    if (e instanceof ErreurHttp) interprete(e)
    throw e
  }
}

/** État du pool, avec le total de minutes de conversion disponibles. */
export async function etatPool() {
  const cles = pool('elevenlabs')
  const resultats = await Promise.all(
    cles.map(async (e) => {
      try {
        const q = await quota(e.key)
        return { label: e.label, tier: e.tier, ...q, vivante: true }
      } catch (err) {
        return { label: e.label, tier: e.tier, vivante: false, raison: err.message.split('\n')[0] }
      }
    })
  )
  const vivantes = resultats.filter((r) => r.vivante)
  const commerciales = vivantes.filter((r) => r.commercial)
  return {
    cles: resultats,
    minutesTotales: vivantes.reduce((a, r) => a + (r.minutesSts ?? 0), 0),
    minutesCommerciales: commerciales.reduce((a, r) => a + (r.minutesSts ?? 0), 0),
    aDuCommercial: commerciales.length > 0,
  }
}

/** Les modèles capables de conversion de voix, sans les coder en dur. */
export async function modelesSts(cle) {
  const r = await demande(`${API}/models`, { headers: entetes(cle) })
  const modeles = await r.json()
  return modeles.filter((m) => m.can_do_voice_conversion === true).map((m) => m.model_id)
}

/** Les voix accessibles au compte. */
export async function voix(cle) {
  const r = await demande(`${API}/voices`, { headers: entetes(cle) })
  const d = await r.json()
  return (d.voices || []).map((v) => ({
    id: v.voice_id,
    nom: v.name,
    categorie: v.category,
    langue: v.labels?.language ?? null,
    genre: v.labels?.gender ?? null,
    description: v.labels?.description ?? null,
    apercu: v.preview_url ?? null,
  }))
}

// ---------------------------------------------------------------------------
//  Découpage
// ---------------------------------------------------------------------------

/**
 * Découpe un audio long en morceaux acceptables par l'API, **au milieu des
 * silences**. Une coupe en plein mot s'entend au recollage ; une coupe au
 * milieu d'un blanc ne s'entend pas.
 */
export async function planDeDecoupe(fichier, { seuilDb = -34 } = {}) {
  const { dureeS } = await sonde(fichier)
  if (dureeS <= PLAFOND_MORCEAU_S) return [{ debutS: 0, finS: dureeS }]

  const silences = await detecteSilences(fichier, { seuilDb, dureeMin: 0.3 })
  const respirations = silences.map((s) => (s.debutS + s.finS) / 2)

  const morceaux = []
  let debut = 0
  while (debut < dureeS) {
    const restant = dureeS - debut
    if (restant <= PLAFOND_MORCEAU_S) {
      morceaux.push({ debutS: debut, finS: dureeS })
      break
    }
    const ideal = debut + CIBLE_MORCEAU_S
    const plafond = debut + PLAFOND_MORCEAU_S
    const plancher = debut + PLANCHER_MORCEAU_S

    const candidats = respirations.filter((t) => t > plancher && t <= plafond)
    const coupe = candidats.length
      ? candidats.reduce((meilleur, t) =>
          Math.abs(t - ideal) < Math.abs(meilleur - ideal) ? t : meilleur
        )
      : plafond // aucun silence exploitable : on coupe au plafond, tant pis

    morceaux.push({ debutS: debut, finS: coupe })
    debut = coupe
  }

  if (!candidatsSuffisants(morceaux, respirations)) {
    journal.attention(
      `Aucun silence exploitable pour découper : une jointure risque de s'entendre. ` +
        `Enregistre avec des respirations marquées, ou baisse COUPE_SEUIL_DB.`
    )
  }
  return morceaux
}

const candidatsSuffisants = (morceaux, respirations) =>
  morceaux.length <= 1 || respirations.length >= morceaux.length - 1

// ---------------------------------------------------------------------------
//  Conversion de voix
// ---------------------------------------------------------------------------

async function convertitMorceau(cle, fichier, voiceId, options) {
  const donnees = new FormData()
  donnees.append('audio', new Blob([fs.readFileSync(fichier)]), path.basename(fichier))
  donnees.append('model_id', options.modele)
  // `voice_settings` doit être une CHAÎNE JSON, pas un objet.
  donnees.append(
    'voice_settings',
    JSON.stringify({
      stability: options.stabilite,
      similarity_boost: options.similarite,
      // Le style vient de la performance enregistrée. L'exagérer détruit
      // exactement ce qu'on cherche à conserver.
      style: 0,
      use_speaker_boost: true,
    })
  )
  // Même graine sur tous les morceaux : sans ça, le timbre bouge d'un morceau
  // à l'autre et le recollage s'entend.
  donnees.append('seed', String(options.graine))
  donnees.append('remove_background_noise', options.reduitBruit ? 'true' : 'false')

  const r = await demande(
    `${API}/speech-to-speech/${voiceId}?output_format=pcm_44100&enable_logging=false`,
    {
      method: 'POST',
      headers: entetes(cle),
      body: donnees,
      tempsMortMs: 600_000,
      essais: 2,
    }
  )
  return Buffer.from(await r.arrayBuffer())
}

/**
 * Remplace le timbre d'un enregistrement.
 *
 * @returns { fichier, morceaux, secondes, cle }
 */
export async function changeDeVoix(
  source,
  destination,
  { voiceId = null, modele = null, stabilite = 0.5, similarite = 0.8, reduitBruit = null, graine = 1234 } = {}
) {
  const voix = voiceId || env('ELEVENLABS_VOICE_ID', null)
  if (!voix) {
    throw new Error(
      `Aucune voix ElevenLabs choisie. Renseigne ELEVENLABS_VOICE_ID dans .env, ` +
        `ou passe --voix=<identifiant>.`
    )
  }
  const options = {
    modele: modele || env('ELEVENLABS_STS_MODEL_ID', 'eleven_multilingual_sts_v2'),
    stabilite,
    similarite,
    reduitBruit: reduitBruit === null ? env('ELEVENLABS_REMOVE_NOISE', 'true') === 'true' : reduitBruit,
    graine,
  }

  const { dureeS } = await sonde(source)
  const morceaux = await planDeDecoupe(source)
  const cout = (dureeS / 60) * 1000

  journal.info(
    `Conversion de ${duree(dureeS)} en ${morceaux.length} morceau${morceaux.length > 1 ? 'x' : ''} ` +
      `— environ ${Math.round(cout)} crédits (${(dureeS / 60 * 0.12).toFixed(2)} $).`
  )

  const travail = path.join(os.tmpdir(), `sts-${process.pid}`)
  assureDossier(travail)
  const rendus = []

  try {
    const cleUtilisee = await avecCle('elevenlabs', async (cle, entree) => {
      const q = await quota(cle)
      if (q.restant < cout) {
        throw clefGrillee(
          `${q.restant} crédits restants pour ${Math.round(cout)} nécessaires`
        )
      }
      if (!q.commercial) {
        journal.attention(
          `Clé ${entree.label} au palier gratuit : la sortie n'a AUCUNE licence commerciale. ` +
            `À réserver aux essais.`
        )
      }

      for (const [i, m] of morceaux.entries()) {
        const entreeMorceau = path.join(travail, `in-${i}.wav`)
        const sortieMorceau = path.join(travail, `out-${i}.wav`)
        await ffmpeg([
          '-ss', String(m.debutS),
          '-to', String(m.finS),
          '-i', source,
          '-ac', '1',
          '-ar', '44100',
          '-c:a', 'pcm_s16le',
          entreeMorceau,
        ])

        process.stdout.write(`\r  morceau ${i + 1}/${morceaux.length}…   `)
        const pcm = await convertitMorceau(cle, entreeMorceau, voix, options)

        // La réponse est du PCM brut : on lui remet un en-tête WAV pour que
        // ffmpeg sache quoi en faire.
        const brut = path.join(travail, `raw-${i}.pcm`)
        fs.writeFileSync(brut, pcm)
        await ffmpeg([
          '-f', 's16le', '-ar', '44100', '-ac', '1', '-i', brut,
          '-c:a', 'pcm_s16le', sortieMorceau,
        ])
        rendus.push(sortieMorceau)
      }
      process.stdout.write('\r' + ' '.repeat(30) + '\r')
      return entree.label
    })

    assureDossier(path.dirname(destination))
    if (rendus.length === 1) {
      fs.copyFileSync(rendus[0], destination)
    } else {
      await recolleAudio(rendus, destination)
    }

    const apres = await sonde(destination)
    const derive = Math.abs(apres.dureeS - dureeS)
    if (derive > 0.5) {
      journal.attention(
        `La sortie fait ${duree(apres.dureeS)} contre ${duree(dureeS)} à l'entrée ` +
          `(${derive.toFixed(2)} s d'écart). Les sous-titres seront recalés sur la sortie, ` +
          `donc rien n'est cassé — mais un écart supérieur à une seconde mérite une écoute.`
      )
    }

    journal.ok(`Voix remplacée : ${path.basename(destination)} (clé ${cleUtilisee})`)
    return { fichier: destination, morceaux: morceaux.length, secondes: apres.dureeS, cle: cleUtilisee }
  } catch (e) {
    if (e instanceof ErreurHttp) interprete(e)
    throw e
  } finally {
    fs.rmSync(travail, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
//  Alignement forcé (voie payante, plus précise que le local sur prise difficile)
// ---------------------------------------------------------------------------

/**
 * Aligne un texte connu sur un audio, côté ElevenLabs.
 *
 * Le champ `loss` par mot est une mesure de confiance : au-dessus de 0,35, le
 * mot du script ne correspond probablement pas à ce qui a été dit. C'est un
 * détecteur d'écart script/prise, pas seulement un indicateur technique.
 */
export async function aligneForce(fichier, texte) {
  const donnees = new FormData()
  donnees.append('file', new Blob([fs.readFileSync(fichier)]), path.basename(fichier))
  // Texte nu : surtout pas encapsulé dans du JSON.
  donnees.append('text', texte)

  try {
    return await avecCle('elevenlabs', async (cle) => {
      const r = await demande(`${API}/forced-alignment`, {
        method: 'POST',
        headers: entetes(cle),
        body: donnees,
        tempsMortMs: 600_000,
      })
      const d = await r.json()
      const mots = (d.words || []).map((m) => ({
        texte: m.text,
        debutMs: Math.round(m.start * 1000),
        finMs: Math.round(m.end * 1000),
        confiance: m.loss,
        incertain: m.loss > 0.35,
      }))
      const douteux = mots.filter((m) => m.incertain).length
      if (douteux > 0) {
        journal.attention(
          `${douteux} mots sur ${mots.length} s'alignent mal. ` +
            `Le texte lu diffère probablement du script à ces endroits.`
        )
      }
      return { mots, perte: d.loss }
    })
  } catch (e) {
    if (e instanceof ErreurHttp) interprete(e)
    throw e
  }
}
