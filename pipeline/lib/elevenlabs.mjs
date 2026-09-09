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
import { avecCle, clefGrillee, pool } from './trousseau.mjs'
import { demande, ErreurHttp } from './http.mjs'
import { journal, duree } from './journal.mjs'
import { assureDossier, dossierDeTravail, env } from './chemins.mjs'
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

/**
 * CE QUE L'API ADMET, MOT POUR MOT.
 *
 * Relevé sur `/v1/shared-voices` le 29 août 2026, pas deviné. Chaque liste a
 * été obtenue en envoyant une valeur absurde : l'API répond alors 400 et
 * énumère ce qu'elle accepte.
 *
 * LE PIÈGE EST L'ÂGE. `gender`, `category` et `sort` refusent une valeur
 * inconnue avec un 400 explicite ; `age`, LUI, répond 200 avec zéro voix. Un
 * « middle aged » écrit avec une espace au lieu du tiret bas ne se lit donc pas
 * comme une faute de frappe mais comme « aucune voix de cet âge », et on cherche
 * le défaut du mauvais côté. D'où la validation locale ci-dessous : on préfère
 * une erreur franche à un catalogue vide qui a l'air normal.
 */
export const GENRES = ['male', 'female', 'neutral']
export const AGES = ['young', 'middle_aged', 'old']
export const CATEGORIES_PARTAGEES = ['professional', 'generated', 'high_quality', 'famous']
export const TRIS = ['trending', 'cloned_by_count', 'usage_character_count_1y', 'created_date']

/**
 * Le ton d'une voix — ce qu'ElevenLabs appelle `descriptive`.
 *
 * La liste n'est documentée nulle part : elle a été relevée en parcourant les
 * 1 200 voix de la bibliothèque le 29 août 2026, et elle est ordonnée par
 * fréquence réelle. « calm » couvre trois cents voix, « sassy » une seule —
 * l'ordre n'est donc pas cosmétique, il met devant ce qui donne des résultats.
 *
 * ATTENTION AU PARAMÈTRE : c'est `descriptives`, au pluriel. Le singulier est
 * accepté par l'API, ignoré en silence, et rend le catalogue entier — on croit
 * filtrer alors qu'on ne filtre rien.
 */
export const TONS = [
  'calm', 'casual', 'confident', 'deep', 'professional', 'pleasant', 'classy',
  'gentle', 'upbeat', 'cute', 'excited', 'chill', 'crisp', 'modulated',
  'neutral', 'formal', 'mature', 'intense', 'relaxed', 'serious', 'soft',
  'wise', 'raspy', 'anxious', 'hyped', 'rough', 'grumpy', 'sad', 'meditative',
  'whispery', 'sassy',
]

/** Ce à quoi une voix est destinée — `use_case` chez ElevenLabs. */
export const USAGES = [
  'narrative_story', 'conversational', 'social_media', 'informative_educational',
  'advertisement', 'entertainment_tv', 'characters_animation',
]

function valide(valeur, admises, quoi) {
  if (valeur === null || valeur === undefined || valeur === '') return null
  const v = String(valeur).toLowerCase().trim()
  if (!admises.includes(v)) {
    throw new Error(`${quoi} « ${valeur} » inconnu. Attendu : ${admises.join(', ')}.`)
  }
  return v
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
    // Les voix du compte portent leur âge dans `labels`, là où la bibliothèque
    // le met à la racine. Même information, deux emplacements : on l'aplatit
    // ici pour que les deux fonds se filtrent avec le même code.
    age: v.labels?.age ?? null,
    accent: v.labels?.accent ?? null,
    usage: v.labels?.use_case ?? null,
    description: v.labels?.description ?? null,
    apercu: v.preview_url ?? null,
    aMoi: true,
  }))
}

/**
 * La bibliothèque partagée — celle où vivent les milliers de voix.
 *
 * `\/v1\/voices` ne rend que ce que le COMPTE possède : vingt-et-une voix par
 * défaut d'ElevenLabs plus les cinq ajoutées, vingt-six en tout. C'est très peu,
 * et ça se voit tout de suite quand on cherche un timbre précis. Le reste est
 * dans `\/v1\/shared-voices`, publié par d'autres comptes, et il faut le demander
 * explicitement.
 *
 * UNE VOIX PARTAGÉE NE S'EMPLOIE PAS DIRECTEMENT : il faut d'abord l'ajouter à
 * sa propre bibliothèque (`ajouteUneVoixPartagee`). C'est gratuit, instantané,
 * et sans ça la conversion répond 400 sur un identifiant qu'elle ne connaît pas.
 */
export async function voixPartagees(
  cle,
  {
    langue = null, genre = null, age = null, ton = null, usage = null,
    categorie = null, tri = null, cherche = null, page = 0, parPage = 100,
  } = {}
) {
  // 100 est le plafond dur de l'API : au-delà elle répond 400. On demande donc
  // le maximum — une page de plus, c'est un aller-retour réseau de plus pour
  // quelqu'un qui fait défiler une liste en cherchant un timbre.
  const p = new URLSearchParams({ page_size: String(Math.max(1, Math.min(100, parPage))), page: String(page) })
  if (langue) p.set('language', String(langue).toLowerCase())
  const g = valide(genre, GENRES, 'Genre')
  if (g) p.set('gender', g)
  const a = valide(age, AGES, 'Âge')
  if (a) p.set('age', a)
  // `descriptives` et `use_cases` partagent le défaut d'`age` : une valeur
  // inconnue ne provoque pas d'erreur, elle rend zéro voix. On valide donc en
  // local, sinon une faute de frappe se lit comme « aucune voix de ce ton ».
  const t2 = valide(ton, TONS, 'Ton')
  if (t2) p.set('descriptives', t2)
  const u = valide(usage, USAGES, 'Usage')
  if (u) p.set('use_cases', u)
  const c = valide(categorie, CATEGORIES_PARTAGEES, 'Catégorie')
  if (c) p.set('category', c)
  const t = valide(tri, TRIS, 'Tri')
  if (t) p.set('sort', t)
  if (cherche) p.set('search', cherche)

  const r = await demande(`${API}/shared-voices?${p}`, { headers: entetes(cle) })
  const d = await r.json()
  return {
    encore: d.has_more === true,
    voix: (d.voices || []).map((v) => ({
      id: v.voice_id,
      nom: v.name,
      categorie: 'partagee',
      langue: v.language ?? null,
      genre: v.gender ?? null,
      age: v.age ?? null,
      accent: v.accent ?? null,
      usage: v.use_case ?? null,
      descriptif: v.descriptive ?? null,
      description: v.description ?? null,
      apercu: v.preview_url ?? null,
      proprietaire: v.public_owner_id ?? null,
      // Le nombre de comptes qui l'ont reprise est le seul indice de qualité
      // que l'API donne : une voix reprise sept cents fois a été jugée par
      // sept cents personnes avant nous.
      reprises: v.cloned_by_count ?? 0,
      aMoi: v.is_added_by_user === true,
    })),
  }
}

/** Ajoute une voix partagée à la bibliothèque du compte. Gratuit. */
export async function ajouteUneVoixPartagee(cle, { proprietaire, id, nom }) {
  const r = await demande(`${API}/voices/add/${encodeURIComponent(proprietaire)}/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { ...entetes(cle), 'content-type': 'application/json' },
    body: JSON.stringify({ new_name: nom }),
    // Un 400 sur une voix déjà ajoutée n'est pas un échec : on veut l'identifiant.
    accepte: [400],
  })
  const d = await r.json().catch(() => ({}))
  if (r.ok) return { id: d.voice_id ?? id, deja: false }
  const message = JSON.stringify(d)
  if (/already|exist/i.test(message)) return { id, deja: true }
  throw new Error(`ElevenLabs refuse d'ajouter cette voix : ${message.slice(0, 200)}`)
}

/**
 * Retire une voix du compte.
 *
 * NE SERT QU'À RENDRE CE QU'ON VIENT D'EMPRUNTER.
 *
 * Écouter une voix de la bibliothèque sur sa propre prise oblige à l'ajouter au
 * compte : l'API ne convertit que ce que le compte possède. Or le compte est
 * rationné — trente voix au maximum, et `max_voice_add_edits` ajouts par
 * période, relevé à 95. Une séance d'écoute de vingt voix remplirait donc les
 * deux tiers des emplacements avec des voix qu'on a écartées, et l'échec
 * arriverait plus tard, sur une voix qu'on voulait vraiment.
 *
 * On ne retire QUE ce que l'ajout venait de créer (`deja === false`) : une voix
 * que le compte possédait déjà avant l'essai ne nous appartient pas.
 */
export async function retireUneVoix(cle, id) {
  const r = await demande(`${API}/voices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: entetes(cle),
    // Rendre l'emprunt est une politesse, pas une étape : si ça échoue, l'essai
    // est fait et le fichier est écrit. On ne casse pas l'un pour l'autre.
    accepte: [400, 404],
  })
  return r.ok
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

/**
 * Formats de sortie, du meilleur au plus modeste.
 *
 * `pcm_44100` est reserve au palier Pro et au-dessus. Le demander en dur faisait
 * echouer la conversion sur tout plan inferieur — et le trousseau, voyant un 403,
 * concluait a une cle morte : il les ecartait une par une puis annoncait qu aucune
 * n etait disponible. Le diagnostic affiche etait donc faux, et l utilisateur
 * cherchait un probleme de cle qui n existait pas.
 *
 * On negocie donc le format une fois par execution, et on dit lequel a ete retenu.
 */
const FORMATS_SORTIE = [
  { nom: 'pcm_44100', hz: 44100 },
  { nom: 'pcm_24000', hz: 24000 },
  { nom: 'pcm_22050', hz: 22050 },
  { nom: 'pcm_16000', hz: 16000 },
]
let formatRetenu = null

/** Un 403 qui parle de palier est un refus de FORMAT, pas un refus de CLE. */
const estRefusDePalier = (e) =>
  e instanceof ErreurHttp && e.statut === 403 && /tier|palier|only available/i.test(String(e.corps))

async function convertitMorceau(cle, fichier, voiceId, options) {
  const octets = fs.readFileSync(fichier)

  // LE CORPS SE RECONSTRUIT À CHAQUE ESSAI, ET CE N'EST PAS UNE PRÉCAUTION.
  //
  // Il était monté une seule fois, avant la boucle de repli. La première
  // tentative (`pcm_44100`) consommait le flux, se faisait refuser par le
  // palier, et la seconde repartait avec un corps déjà lu : l'API recevait
  // quelques kilo-octets au lieu du fichier et rendait un tiers de seconde de
  // son pour cinq secondes envoyées.
  //
  // Le défaut ne se voyait pas, pour deux raisons. `formatRetenu` est mis en
  // cache au niveau du module : seul le PREMIER morceau du PREMIER appel d'un
  // processus fait deux tentatives, les suivants partent droit sur le bon format et
  // sortent intacts. Et sur une conversion longue, un premier morceau amputé se
  // lit comme un début un peu sec, pas comme une erreur.
  const corps = () => {
    const d = new FormData()
    d.append('audio', new Blob([octets]), path.basename(fichier))
    d.append('model_id', options.modele)
    // `voice_settings` doit être une CHAÎNE JSON, pas un objet.
    d.append(
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
    d.append('seed', String(options.graine))
    d.append('remove_background_noise', options.reduitBruit ? 'true' : 'false')
    return d
  }

  const depart = formatRetenu ? FORMATS_SORTIE.findIndex((f) => f.nom === formatRetenu.nom) : 0
  let dernier
  for (let i = depart; i < FORMATS_SORTIE.length; i++) {
    const fmt = FORMATS_SORTIE[i]
    try {
      const r = await demande(
        `${API}/speech-to-speech/${voiceId}?output_format=${fmt.nom}&enable_logging=false`,
        {
          method: 'POST',
          headers: entetes(cle),
          body: corps(),
          tempsMortMs: 600_000,
          essais: 2,
        }
      )
      if (!formatRetenu) {
        formatRetenu = fmt
        if (i > 0) {
          journal.detail(
            `Sortie en ${fmt.nom} : le plan ne donne pas accès à ${FORMATS_SORTIE[0].nom}.`
          )
        }
      }
      return { pcm: Buffer.from(await r.arrayBuffer()), hz: fmt.hz }
    } catch (e) {
      // Un refus de palier se règle en demandant moins. Tout le reste remonte,
      // pour que le trousseau puisse faire son travail sur une vraie erreur de clé.
      if (!estRefusDePalier(e)) throw e
      dernier = e
    }
  }
  throw dernier
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
    // `remove_background_noise` est un debruiteur applique par ElevenLabs AVANT
    // la conversion. Il etait actif par defaut ; il ne l'est plus. C'est un
    // traitement de plus sur une prise qu'on veut garder telle quelle, et il
    // s'applique en amont du timbre, donc sur le signal qui sert de reference.
    reduitBruit: reduitBruit === null ? env('ELEVENLABS_REMOVE_NOISE', 'false') === 'true' : reduitBruit,
    graine,
  }

  const { dureeS } = await sonde(source)
  const morceaux = await planDeDecoupe(source)
  const cout = (dureeS / 60) * 1000

  journal.info(
    `Conversion de ${duree(dureeS)} en ${morceaux.length} morceau${morceaux.length > 1 ? 'x' : ''} ` +
      `— environ ${Math.round(cout)} crédits (${(dureeS / 60 * 0.12).toFixed(2)} $).`
  )

  // Hors de `%TEMP%` : ce dossier porte des morceaux de conversion DÉJÀ PAYÉS.
  // Un balayage en cours de route les ferait repayer sans rien dire.
  const travail = dossierDeTravail('sts')
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
          '-ar', '48000',
          '-c:a', 'pcm_s16le',
          entreeMorceau,
        ])

        process.stdout.write(`\r  morceau ${i + 1}/${morceaux.length}…   `)
        const { pcm, hz } = await convertitMorceau(cle, entreeMorceau, voix, options)

        // La réponse est du PCM brut : on lui remet un en-tête WAV pour que
        // ffmpeg sache quoi en faire. La fréquence est celle que l'API a
        // réellement rendue, pas celle qu'on espérait : la supposer fait jouer
        // la voix trop vite ou trop lentement, sans aucun message d'erreur.
        // TOUTE LA CHAINE TRAVAILLE EN 48 kHz, ET CE N'EST PAS UN GOUT.
        //
        // La sortie etait ecrite en 44,1 kHz alors que la coupe, la piste image
        // et l'encodage final sont en 48. Remotion devait donc reechantillonner
        // au moment du mixage — et son etage de mixage tombait, faute de creer
        // son dossier temporaire. Le rendu echouait apres la preparation, sans
        // que le message parle de frequence.
        //
        // 48 kHz a un second merite ici : ElevenLabs rend du 24 kHz, dont 48 est
        // le double exact. La conversion est un simple doublement d'echantillons,
        // la ou 44,1 imposait un rapport non entier et un filtre d'interpolation.
        const brut = path.join(travail, `raw-${i}.pcm`)
        fs.writeFileSync(brut, pcm)
        await ffmpeg([
          '-f', 's16le', '-ar', String(hz), '-ac', '1', '-i', brut,
          '-ar', '48000', '-c:a', 'pcm_s16le', sortieMorceau,
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
/**
 * Remet dans la liste alignée les mots que l'alignement a laissés tomber.
 *
 * On parcourt en parallèle le texte soumis et ce que l'API a rendu (plus longue
 * sous-séquence commune, qui encaisse les omissions). Chaque mot soumis retrouvé
 * garde son horodatage exact ; chaque mot manquant est réparti entre le dernier
 * mot placé et le prochain, ce qui le rend légèrement approximatif mais jamais
 * absent. Un sous-titre incomplet est bien pire qu'un sous-titre imprécis.
 */
function reconcilie(texte, alignes) {
  const nu = (s) =>
    String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

  const attendus = texte.split(/\s+/).filter(Boolean)
  const A = attendus.map(nu)
  const B = alignes.map((m) => nu(m.texte))
  if (A.length === B.length && A.every((x, i) => x === B[i])) return alignes

  const n = A.length
  const p = B.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(p + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = p - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const sortie = attendus.map((t) => ({ texte: t, debutMs: null, finMs: null }))
  let i = 0
  let j = 0
  while (i < n && j < p) {
    if (A[i] === B[j]) {
      sortie[i].debutMs = alignes[j].debutMs
      sortie[i].finMs = alignes[j].finMs
      sortie[i].confiance = alignes[j].confiance
      sortie[i].incertain = alignes[j].incertain
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }

  // Les trous : on répartit uniformément entre les deux ancres qui les encadrent.
  const finTotale = alignes.length ? alignes[alignes.length - 1].finMs : 0
  for (let k = 0; k < sortie.length; k++) {
    if (sortie[k].debutMs !== null) continue
    let a = k - 1
    while (a >= 0 && sortie[a].finMs === null) a--
    let b = k + 1
    while (b < sortie.length && sortie[b].debutMs === null) b++
    const depart = a >= 0 ? sortie[a].finMs : 0
    const arrivee = b < sortie.length ? sortie[b].debutMs : finTotale
    const combien = (b < sortie.length ? b : sortie.length) - (a >= 0 ? a + 1 : 0)
    const pas = combien > 0 ? Math.max(1, (arrivee - depart) / combien) : 1
    const rang = k - (a >= 0 ? a + 1 : 0)
    sortie[k].debutMs = Math.round(depart + pas * rang)
    sortie[k].finMs = Math.round(depart + pas * (rang + 1))
    sortie[k].incertain = true
  }
  return sortie
}

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
      // L'API renvoie AUSSI les espaces comme entrées à part entière : sans ce
      // filtre, on récupère deux fois trop de « mots », un sur deux étant vide,
      // et tout ce qui compte les mots en aval devient faux.
      const mots = (d.words || [])
        .filter((m) => String(m.text ?? '').trim().length > 0)
        .map((m) => ({
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

      // L'ALIGNEMENT NE DOIT JAMAIS PERDRE UN MOT.
      //
      // L'API en supprime silencieusement certains qu'elle n'arrive pas à placer.
      // Le texte rendu est alors amputé sans le moindre avertissement, et le mot
      // disparaît du sous-titre alors qu'on l'entend distinctement dans l'audio :
      // le spectateur lit une phrase à trous.
      //
      // On repart donc du texte SOUMIS, qui fait foi, et on lui applique les
      // horodatages retrouvés. Un mot que l'alignement n'a pas placé reçoit un
      // temps interpolé entre ses voisins — un peu moins précis, mais présent.
      const complet = reconcilie(texte, mots)
      const rendus = complet.length - mots.length
      if (rendus > 0) {
        journal.detail(`${rendus} mot(s) omis par l'alignement, replacés entre leurs voisins.`)
      }
      return { mots: complet, perte: d.loss }
    })
  } catch (e) {
    if (e instanceof ErreurHttp) interprete(e)
    throw e
  }
}
