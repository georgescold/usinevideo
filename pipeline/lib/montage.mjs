/**
 * montage.mjs — transformer un script, des rushes et une transcription en un
 * plan de montage que Remotion n'a plus qu'à rendre.
 *
 * Toute la décision est ici. Remotion, lui, ne décide de rien : il place ce
 * qu'on lui donne, à la milliseconde près.
 *
 * L'ordre des opérations n'est pas indifférent :
 *
 *   rushes → silences → audio coupé → remplacement du timbre → transcription
 *   de CE fichier-là → calage des événements → plan
 *
 * On transcrit toujours la voix **finale**, jamais la prise d'origine : c'est
 * la seule façon d'avoir des sous-titres qui ne glissent pas.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  CHEMINS,
  assureDossier,
  envNombre,
  env,
} from './chemins.mjs'
import { journal, duree } from './journal.mjs'
import { sonde, detecteSilences, intervallesDeParole, coupeEtRecolleAudio, ffmpeg } from './ffmpeg.mjs'
import { reglagesPour, versTheme } from './soustitres.mjs'

/** Cadence de travail. 30 images/s : le compromis lisibilité / temps de rendu. */
export const FPS = 30

/** Respiration finale, pour que la dernière phrase ne soit pas coupée net. */
export const QUEUE_S = 1.2

/** Un événement visuel toutes les 2 à 4 secondes. Au-delà, l'attention décroche. */
export const ECART_MAX_MS = 4000
export const ECART_MIN_MS = 2000

const DIMENSIONS = {
  vertical: { largeur: 1080, hauteur: 1920 },
  horizontal: { largeur: 1920, hauteur: 1080 },
  carre: { largeur: 1080, hauteur: 1080 },
}

export const estVertical = (format) => format.startsWith('short')

// ---------------------------------------------------------------------------
//  1. Les rushes
// ---------------------------------------------------------------------------

/**
 * Les fichiers exploitables d'un dossier de tournage, dans l'ordre.
 *
 * Les extensions AUDIO comptent autant que les extensions video : un mode de
 * production faceless ou screencast en voix off depose un rush sans image, et
 * c'est un mode declare de la stack. N'accepter que de la video rendait ces
 * modes impossibles a ingerer, alors que tout le reste du pipeline les gere.
 */
export function prendsLesRushes(dossier) {
  if (!fs.existsSync(dossier)) return []
  return fs
    .readdirSync(dossier)
    .filter((f) => /\.(mp4|mov|mkv|webm|avi|m4a|wav|mp3|aac|flac|ogg|opus)$/i.test(f))
    // `prise-01` avant `prise-02` avant `coupe-01` : on trie sur le nom, et on
    // met les prises avant les plans de coupe.
    .sort((a, b) => {
      const rang = (n) => (/^prise/i.test(n) ? 0 : /^coupe/i.test(n) ? 2 : 1)
      return rang(a) - rang(b) || a.localeCompare(b, 'fr', { numeric: true })
    })
    .map((f) => path.join(dossier, f))
}

export const estPlanDeCoupe = (fichier) => /^coupe/i.test(path.basename(fichier))

// ---------------------------------------------------------------------------
//  2. Ce qu'on garde
// ---------------------------------------------------------------------------

/**
 * Repère la parole dans chaque rush et rend la liste des morceaux à garder,
 * déjà positionnés sur la timeline finale.
 *
 * @returns { aGarder, dureeMs, retireMs }
 */
export async function decoupeParole(rushes, { seuilDb, silenceMin, marge } = {}) {
  const options = {
    seuilDb: seuilDb ?? envNombre('COUPE_SEUIL_DB', -34),
    dureeMin: silenceMin ?? envNombre('COUPE_SILENCE_MIN', 0.35),
  }
  const margeS = marge ?? envNombre('COUPE_MARGE', 0.08)

  const aGarder = []
  let curseurMs = 0
  let brutS = 0

  for (const rush of rushes) {
    const info = await sonde(rush)
    if (!info.aDuSon) {
      journal.attention(`${path.basename(rush)} n'a pas de son : ignoré comme prise.`)
      continue
    }
    brutS += info.dureeS

    const silences = await detecteSilences(rush, options)
    const paroles = intervallesDeParole(silences, info.dureeS, { marge: margeS })

    for (const p of paroles) {
      const dureeMs = Math.round((p.finS - p.debutS) * 1000)
      aGarder.push({
        src: rush,
        depuisS: Number(p.debutS.toFixed(3)),
        jusquaS: Number(p.finS.toFixed(3)),
        debutMs: curseurMs,
        dureeMs,
      })
      curseurMs += dureeMs
    }

    journal.detail(
      `${path.basename(rush)} · ${duree(info.dureeS)} → ${paroles.length} morceaux · ` +
        `${silences.length} silences retirés`
    )
  }

  return {
    aGarder,
    dureeMs: curseurMs,
    retireMs: Math.max(0, Math.round(brutS * 1000) - curseurMs),
    brutMs: Math.round(brutS * 1000),
  }
}

/** Produit l'audio de la voix, silences retirés, prêt pour le remplacement de timbre. */
export async function fabriqueAudioCoupe(aGarder, destination) {
  const parRush = new Map()
  for (const m of aGarder) {
    if (!parRush.has(m.src)) parRush.set(m.src, [])
    parRush.get(m.src).push({ debutS: m.depuisS, finS: m.jusquaS })
  }

  const travail = path.join(os.tmpdir(), `coupe-${process.pid}`)
  assureDossier(travail)
  const morceaux = []
  try {
    for (const [rush, intervalles] of parRush) {
      const sortie = path.join(travail, `${path.basename(rush, path.extname(rush))}.wav`)
      await coupeEtRecolleAudio(rush, intervalles, sortie)
      morceaux.push(sortie)
    }
    if (morceaux.length === 1) {
      assureDossier(path.dirname(destination))
      fs.copyFileSync(morceaux[0], destination)
    } else {
      const { recolleAudio } = await import('./ffmpeg.mjs')
      await recolleAudio(morceaux, destination)
    }
    return destination
  } finally {
    fs.rmSync(travail, { recursive: true, force: true })
  }
}

/**
 * Monte la piste image : coupe les rushes, recolle, met à la définition finale.
 *
 * C'est ffmpeg qui fait ce travail, pas Remotion. Remotion recevra un seul
 * fichier continu, qu'il lit d'un trait — plus de décodeur à repositionner à
 * chaque jump cut, donc plus d'image noire, et plus de gigaoctets de rushes à
 * recopier dans le dossier public à chaque rendu.
 *
 * Le graphe de filtres part dans un fichier : au-delà d'une centaine de plans,
 * il dépasse la longueur maximale d'une ligne de commande Windows.
 */
export async function fabriqueImage(
  aGarder,
  destination,
  { largeur, hauteur, fps = FPS, fond = '#000000' }
) {
  assureDossier(path.dirname(destination))

  const sources = [...new Set(aGarder.map((m) => m.src))]

  // Un rush sans image n'est pas une anomalie : c'est un mode de production.
  // Une voix off faceless ou un screencast commenté déposent un fichier audio,
  // et la piste image se construit alors entièrement par-dessus, à partir des
  // plans de coupe et du motion. On pose donc un fond neutre à la bonne durée
  // au lieu de découper une piste vidéo qui n'existe pas — ffmpeg échouait
  // jusqu'ici sur « Stream specifier ':v' matches no streams », un message qui
  // ne dit pas ce qui manque.
  const infos = await Promise.all(sources.map((s) => sonde(s)))
  if (!infos.some((i) => i.aDeLaVideo)) {
    const dureeMs = aGarder.reduce((a, m) => a + m.dureeMs, 0)
    return fabriqueFondUni(destination, { largeur, hauteur, fps, fond, dureeMs })
  }

  const index = new Map(sources.map((s, i) => [s, i]))

  const morceaux = aGarder.map((m, i) => {
    const e = index.get(m.src)
    return (
      `[${e}:v]trim=start=${m.depuisS}:end=${m.jusquaS},setpts=PTS-STARTPTS,` +
      `scale=${largeur}:${hauteur}:force_original_aspect_ratio=increase,` +
      `crop=${largeur}:${hauteur},setsar=1,fps=${fps}[v${i}]`
    )
  })
  const graphe =
    morceaux.join(';') +
    ';' +
    aGarder.map((_, i) => `[v${i}]`).join('') +
    `concat=n=${aGarder.length}:v=1:a=0[sortie]`

  const scenario = destination + '.filtres.txt'
  fs.writeFileSync(scenario, graphe, 'utf8')

  const { accelerationNvidia } = await import('./ffmpeg.mjs')
  const nvenc = env('RENDU_ACCEL', 'auto') !== 'off' && (await accelerationNvidia())

  try {
    await ffmpeg([
      ...sources.flatMap((s) => ['-i', s]),
      '-filter_complex_script', scenario,
      '-map', '[sortie]',
      '-an',
      // Intermédiaire de travail : on ne lésine pas, il sera relu image par
      // image par le rendu et réencodé ensuite.
      ...(nvenc
        ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '18', '-b:v', '20M']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17']),
      '-pix_fmt', 'yuv420p',
      '-g', String(fps),
      destination,
    ])
  } finally {
    fs.rmSync(scenario, { force: true })
  }

  const info = await sonde(destination)
  return { fichier: destination, dureeMs: Math.round(info.dureeS * 1000), nvenc }
}

/**
 * Une piste image d'un seul aplat, à la couleur de fond de la chaîne.
 *
 * C'est le support des productions sans caméra : tout ce qui se voit est ensuite
 * composé par-dessus. La couleur vient de `config/chaine.json`, jamais d'ici —
 * un fond codé en dur ferait se ressembler toutes les chaînes.
 */
async function fabriqueFondUni(destination, { largeur, hauteur, fps, fond, dureeMs }) {
  const { accelerationNvidia } = await import('./ffmpeg.mjs')
  const nvenc = env('RENDU_ACCEL', 'auto') !== 'off' && (await accelerationNvidia())
  const secondes = (dureeMs / 1000).toFixed(3)

  await ffmpeg([
    '-f', 'lavfi',
    '-i', `color=c=${fond}:s=${largeur}x${hauteur}:r=${fps}:d=${secondes}`,
    '-an',
    ...(nvenc
      ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '18', '-b:v', '20M']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17']),
    '-pix_fmt', 'yuv420p',
    '-g', String(fps),
    destination,
  ])

  const info = await sonde(destination)
  journal.detail(`Rush sans image : fond uni ${fond} sur ${duree(info.dureeS)}.`)
  return { fichier: destination, dureeMs: Math.round(info.dureeS * 1000), nvenc }
}

// ---------------------------------------------------------------------------
//  3. Le calage des événements visuels
// ---------------------------------------------------------------------------

const nu = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Retrouve, dans la liste des mots alignés, la position d'une ancre — c'est-à-dire
 * le mot ou l'expression du script sur lequel un événement doit tomber.
 *
 * On cherche à l'intérieur de la plage du bloc, jamais dans toute la vidéo :
 * un mot courant comme « ça » apparaît trente fois, et l'événement doit tomber
 * sur celui de ce bloc-là.
 */
export function trouveAncre(mots, ancre, plage) {
  const cible = nu(ancre)
  if (!cible) return null

  const [debut, fin] = plage

  // On compare sur le TEXTE NORMALISÉ CONTINU, pas mot à mot.
  //
  // La normalisation transforme l'apostrophe et le trait d'union en espace :
  // un seul mot du transcript peut donc valoir plusieurs mots dans l'ancre —
  // « l'incompatibilité » vaut « l incompatibilite », « week-end » vaut
  // « week end ». Une comparaison mot à mot ne peut alors JAMAIS aligner, et
  // l'événement était silencieusement réparti dans le bloc au lieu de tomber
  // sur son mot. En français, avec les élisions, ça touche une ancre sur six.
  const bornes = []
  let foin = ''
  for (let i = debut; i <= fin && i < mots.length; i++) {
    const m = nu(mots[i]?.texte)
    if (!m) continue
    if (foin) foin += ' '
    bornes.push({ i, debut: foin.length, fin: foin.length + m.length })
    foin += m
  }

  // Recherche sur frontière de mot, pour que « ans » n'accroche pas « dans ».
  const bordé = ` ${foin} `
  const pos = bordé.indexOf(` ${cible} `)
  if (pos === -1) return null
  const depart = pos
  const arrivee = depart + cible.length

  const premier = bornes.find((b) => b.fin > depart)
  const dernier = [...bornes].reverse().find((b) => b.debut < arrivee)
  if (!premier || !dernier) return null

  return {
    debutMs: mots[premier.i].debutMs,
    finMs: mots[dernier.i].finMs,
    index: premier.i,
  }
}

/** Le temps de lire un texte à voix haute, plus une seconde pour respirer. */
export function tempsDeLecture(texte, { minimumMs = 1200, maximumMs = 6000 } = {}) {
  const mots = String(texte ?? '').split(/\s+/).filter(Boolean).length
  return Math.min(maximumMs, Math.max(minimumMs, (mots / 2.6) * 1000 + 1000))
}

/**
 * Convertit les événements du script en événements datés.
 *
 * Chaque bloc du script occupe une plage de mots connue — l'alignement s'étant
 * fait sur le texte du script, la correspondance est exacte. On y cherche les
 * ancres, et à défaut on répartit dans le bloc.
 */
/**
 * Où chaque bloc du script commence et finit DANS LA TRANSCRIPTION RÉELLE.
 *
 * On ne peut pas se contenter de compter les mots de chaque bloc et d'avancer un
 * curseur : ça ne vaut que si la personne a dit exactement le script. Dès qu'elle
 * improvise — et c'est souhaitable, ça sonne plus parlé — un mot ajouté au bloc 2
 * décale TOUS les blocs suivants, et chaque événement visuel tombe à côté.
 *
 * On aligne donc les mots du script sur ceux réellement dits (plus longue
 * sous-séquence commune, qui encaisse ajouts, oublis et reformulations), et on
 * lit les frontières de blocs sur cet alignement.
 */
/**
 * Les instants où une phrase se termine, en millisecondes.
 *
 * Deux signaux, parce qu'aucun ne suffit seul : la ponctuation forte, que la
 * transcription pose de façon fiable mais incomplète, et le silence, qui marque
 * les respirations que la ponctuation ignore. C'est sur ces instants-là qu'une
 * coupe se ressent comme voulue plutôt que comme un accident.
 */
export function frontieresDePhrase(mots, { silenceMinMs = 450 } = {}) {
  const f = []
  for (let i = 0; i < mots.length - 1; i++) {
    const m = mots[i]
    const s = mots[i + 1]
    if (/[.!?…]$/.test(String(m.texte).trim()) || s.debutMs - m.finMs > silenceMinMs) {
      f.push(s.debutMs)
    }
  }
  return f
}

export function plagesDeBlocs(script, mots) {
  const clef = (s) =>
    String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

  const source = []
  script.blocs.forEach((b, iBloc) => {
    for (const m of String(b.texte).split(/\s+/).filter(Boolean)) source.push({ iBloc, c: clef(m) })
  })
  const cible = mots.map((m) => clef(m.texte))

  const n = source.length
  const p = cible.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(p + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = p - 1; j >= 0; j--) {
      dp[i][j] = source[i].c === cible[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const vus = new Map()
  let i = 0
  let j = 0
  while (i < n && j < p) {
    if (source[i].c === cible[j]) {
      const e = vus.get(source[i].iBloc) ?? { debut: j, fin: j }
      e.fin = j
      vus.set(source[i].iBloc, e)
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }

  // Un bloc dont aucun mot n'a été retrouvé (entièrement reformulé) reçoit ce
  // qui reste entre son voisin d'avant et son voisin d'après.
  const plages = []
  for (let k = 0; k < script.blocs.length; k++) {
    const e = vus.get(k)
    if (e) plages.push([e.debut, e.fin + 1])
    else plages.push(null)
  }
  for (let k = 0; k < plages.length; k++) {
    if (plages[k]) continue
    const avant = plages.slice(0, k).reverse().find(Boolean)
    const apres = plages.slice(k + 1).find(Boolean)
    plages[k] = [avant ? avant[1] : 0, apres ? apres[0] : mots.length]
    if (plages[k][1] <= plages[k][0]) plages[k] = [plages[k][0], Math.min(plages[k][0] + 1, mots.length)]
  }
  return plages
}

/**
 * @param sansCamera  Le rush ne porte-t-il AUCUNE image ?
 *
 * C'est le rush qui décide, pas le champ `format` du script. Un fichier audio
 * seul ne peut être qu'une voix off : la piste image doit alors être construite
 * de bout en bout par des plans de coupe. Un fichier vidéo — capture d'écran,
 * face caméra — porte déjà son image : la couvrir de plans de coupe reviendrait
 * à cacher ce qu'on est venu montrer.
 *
 * Le script peut se tromper (il est écrit avant le tournage), le fichier non.
 */
export function caleEvenements(script, mots, { sansCamera = null } = {}) {
  const evenements = []
  /** Les visuels que le montage a refusés, par type. Voir plus bas. */
  const bannis = new Map()
  const nonCalees = []
  const plages = plagesDeBlocs(script, mots)

  for (const [iBloc, bloc] of script.blocs.entries()) {
    const plage = plages[iBloc]
    const blocDebutMs = mots[plage[0]]?.debutMs ?? 0
    const blocFinMs = mots[Math.max(plage[0], plage[1] - 1)]?.finMs ?? blocDebutMs

    for (const [i, v] of (bloc.visuel ?? []).entries()) {
      let debutMs = blocDebutMs
      if (v.ancre) {
        const trouve = trouveAncre(mots, v.ancre, plage)
        if (trouve) {
          debutMs = trouve.debutMs
        } else {
          nonCalees.push(`« ${v.ancre} » (bloc ${bloc.id})`)
          // Sans ancre exploitable, on répartit dans le bloc plutôt que de tout
          // empiler sur son premier mot.
          const n = (bloc.visuel ?? []).length
          debutMs = blocDebutMs + ((blocFinMs - blocDebutMs) * i) / Math.max(n, 1)
        }
      }

      const dureeMs =
        (v.duree_s ? v.duree_s * 1000 : null) ??
        tempsDeLecture(v.texte ?? v.sousTexte ?? JSON.stringify(v.donnees ?? ''))

      // `convertis` rend `null` pour un type banni : on ne le pose pas, et on
      // le COMPTE — un visuel retiré en silence est un visuel qu'on réécrira.
      const converti = convertis(v)
      if (!converti) { bannis.set(v.type, (bannis.get(v.type) ?? 0) + 1); continue }

      evenements.push({
        ...converti,
        debutMs: Math.round(debutMs),
        dureeMs: Math.round(Math.min(dureeMs, Math.max(800, blocFinMs + 1500 - debutMs))),
      })
    }
  }

  // SUR UN FORMAT SANS CAMÉRA, LE B-ROLL EST LA PISTE IMAGE.
  //
  // Ailleurs, un plan de coupe est un insert : il vient couvrir un mot puis rend
  // la main au visage. Ici il n'y a pas de visage à qui rendre la main — sous le
  // plan de coupe il n'y a que le fond uni. Des clips de trois secondes espacés
  // laissaient donc les deux tiers de la vidéo sur un aplat vide.
  // Chaque plan tient donc jusqu'au suivant.
  // La couverture continue ne vaut QUE pour une voix off sans image. Sur une
  // capture d'écran ou un face caméra, elle recouvrirait le sujet de la vidéo.
  const voixSeule = sansCamera ?? String(script.format ?? '').includes('faceless')
  if (voixSeule) {
    const finVideo = Math.max(...mots.map((m) => m.finMs), 0)
    let brolls = evenements.filter((e) => e.type === 'broll').sort((a, b) => a.debutMs - b.debutMs)

    // AUCUN PLAN NE DURE MOINS DE DEUX SECONDES.
    //
    // En dessous, l'œil n'a pas le temps de comprendre ce qu'il regarde : le plan
    // passe, il n'apprend rien, et l'enchaînement se lit comme de la nervosité
    // plutôt que comme du rythme. Deux ancres trop rapprochées ne donnent donc pas
    // deux plans — on garde le premier, qui couvre les deux.
    const MINIMUM_MS = 2000
    const gardes = []
    for (const e of brolls) {
      const precedent = gardes[gardes.length - 1]
      if (precedent && e.debutMs - precedent.debutMs < MINIMUM_MS) {
        e._aRetirer = true
        continue
      }
      gardes.push(e)
    }
    const jetes = brolls.length - gardes.length
    if (jetes) journal.detail(`${jetes} plan(s) trop courts fondus dans le précédent (moins de 2 s).`)
    brolls = gardes

    // Le premier plan démarre à zéro AVANT qu'on calcule les durées.
    // L'ordre inverse laissait un trou : le plan recevait sa durée depuis sa
    // position d'origine, puis on le reculait à zéro — il s'arrêtait donc juste
    // avant l'entrée du suivant, et l'écran était nu entre les deux.
    if (brolls.length && brolls[0].debutMs > 0) brolls[0].debutMs = 0

    for (const [i, e] of brolls.entries()) {
      const suivant = brolls[i + 1]
      e.dureeMs = Math.max(e.dureeMs, (suivant ? suivant.debutMs : finVideo + 1500) - e.debutMs)
    }

    // ON CHANGE DE PLAN QUAND ON CHANGE DE PHRASE.
    //
    // Un plan qui tient sur deux phrases donne l'impression que l'image a été
    // oubliée : l'oreille passe à autre chose et l'œil reste sur la même chose.
    // La coupe posée sur la fin de phrase, elle, se ressent comme une avancée —
    // c'est ce qui tient l'attention, et donc la durée de visionnage.
    //
    // On découpe donc chaque plan sur les frontières qu'il traverse, tant que les
    // deux morceaux respectent le plancher de deux secondes.
    const frontieres = frontieresDePhrase(mots)

    // On aimante le début de chaque plan sur la fin de phrase la plus proche.
    //
    // Une ancre tombe sur un mot, pas sur une respiration : le plan démarrait
    // donc souvent une seconde après la vraie rupture, ce qui allongeait le plan
    // précédent et faisait tomber la coupe au milieu d'une idée. Déplacer le
    // départ de moins de deux secondes ne change rien à ce qu'illustre le plan,
    // et met la coupe là où l'oreille l'attend.
    const AIMANT_MS = 1800
    for (const e of brolls.slice(1)) {
      let meilleur = null
      for (const f of frontieres) {
        const ecart = Math.abs(f - e.debutMs)
        if (ecart <= AIMANT_MS && (meilleur === null || ecart < Math.abs(meilleur - e.debutMs))) {
          meilleur = f
        }
      }
      if (meilleur !== null) e.debutMs = meilleur
    }
    brolls.sort((a, b) => a.debutMs - b.debutMs)

    // L'aimantage peut rapprocher deux plans à moins de deux secondes : on refait
    // donc passer le plancher, sinon il fabrique lui-même ce qu'il vient
    // d'interdire quelques lignes plus haut.
    const apresAimant = []
    for (const e of brolls) {
      const precedent = apresAimant[apresAimant.length - 1]
      if (precedent && e.debutMs - precedent.debutMs < MINIMUM_MS) {
        e._aRetirer = true
        continue
      }
      apresAimant.push(e)
    }
    brolls = apresAimant

    for (const [i, e] of brolls.entries()) {
      const suivant = brolls[i + 1]
      e.dureeMs = (suivant ? suivant.debutMs : finVideo + 1500) - e.debutMs
    }

    const morceles = []
    for (const e of brolls) {
      // Le plancher de deux secondes vaut AUSSI entre deux coupes ajoutées :
      // deux fins de phrase rapprochées ne donnent qu'une coupe, sinon on
      // fabrique en découpant les plans trop courts qu'on venait d'interdire.
      const dedans = []
      let dernier = e.debutMs
      for (const f of frontieres) {
        if (f <= e.debutMs + MINIMUM_MS) continue
        if (f >= e.debutMs + e.dureeMs - MINIMUM_MS) break
        if (f - dernier < MINIMUM_MS) continue
        dedans.push(f)
        dernier = f
      }
      // Un plan qui dépasse six secondes se coupe MÊME sans frontière utilisable.
      // Une phrase très longue, ou un appel à l'action d'un seul tenant, n'offre
      // aucune respiration où couper — mais laisser dix secondes sur la même
      // image coûte plus cher en attention qu'une coupe au milieu d'une phrase.
      const MAX_MS = 6000
      const bornes = [e.debutMs, ...dedans, e.debutMs + e.dureeMs]
      for (let k = bornes.length - 1; k > 0; k--) {
        const largeur = bornes[k] - bornes[k - 1]
        if (largeur <= MAX_MS) continue
        const parts = Math.ceil(largeur / MAX_MS)
        const pas = largeur / parts
        const ajouts = []
        for (let q = 1; q < parts; q++) ajouts.push(Math.round(bornes[k - 1] + pas * q))
        bornes.splice(k, 0, ...ajouts)
      }

      // Puis on refait remonter le plancher : une borne qui laisserait un morceau
      // de moins de deux secondes est retirée. Les deux règles se contredisent
      // par construction, et c'est toujours le plancher qui tranche.
      for (let k = bornes.length - 2; k >= 1; k--) {
        if (bornes[k + 1] - bornes[k] < MINIMUM_MS || bornes[k] - bornes[k - 1] < MINIMUM_MS) {
          bornes.splice(k, 1)
        }
      }
      if (bornes.length <= 2) {
        morceles.push(e)
        continue
      }
      for (let i = 0; i < bornes.length - 1; i++) {
        // Le premier morceau garde le plan déjà choisi. Les suivants reprennent
        // la même recherche mais sur un AUTRE résultat : même intention, autre
        // image, donc pas de répétition.
        const part =
          i === 0
            ? e
            : { ...e, src: e.src && /\.(mp4|mov|webm|mkv)$/i.test(e.src) ? null : e.src, variante: i }
        part.debutMs = bornes[i]
        part.dureeMs = bornes[i + 1] - bornes[i]
        if (i > 0 && !part.src) delete part.dureeSourceMs
        morceles.push(part)
      }
    }
    const ajoutes = morceles.length - brolls.length
    if (ajoutes > 0) {
      journal.detail(`${ajoutes} coupe(s) ajoutée(s) sur des fins de phrase.`)
      for (const e of morceles) if (!evenements.includes(e)) evenements.push(e)
    }

    // GARDE-FOU : L'ÉCRAN N'EST JAMAIS NU.
    //
    // Sur un format sans caméra, un trou dans la couverture n'est pas un plan
    // sobre : c'est un aplat de fond, que le spectateur lit comme un bug. Aucune
    // combinaison de règles ne doit pouvoir en produire un, donc on vérifie le
    // résultat plutôt que de faire confiance au calcul — et on le dit quand on
    // en bouche un, parce qu'un trou signale toujours une règle mal posée ailleurs.
    const suite = morceles.sort((a, b) => a.debutMs - b.debutMs)
    let bouches = 0
    for (const [i, e] of suite.entries()) {
      const suivant = suite[i + 1]
      const finAttendue = suivant ? suivant.debutMs : finVideo + 1500
      if (e.debutMs + e.dureeMs < finAttendue - 40) {
        e.dureeMs = finAttendue - e.debutMs
        bouches++
      }
    }
    if (bouches) journal.attention(`${bouches} trou(s) dans la piste image, comblés.`)

    // LA HIÉRARCHIE DES RACCORDS : coupe sèche dans une idée, poussée entre deux.
    //
    // Tous les raccords se ressemblaient — un fondu partout, c'est le langage du
    // diaporama. Un montage professionnel hiérarchise : à l'intérieur d'un bloc
    // du script, la coupe est sèche ; au passage d'un bloc au suivant, le
    // nouveau plan POUSSE l'ancien. Le spectateur sent le changement de chapitre
    // sans qu'on le lui dise. On marque donc le premier plan de chaque bloc
    // (sauf l'ouverture, qui doit être une image parfaite immobile).
    for (let iBloc = 1; iBloc < script.blocs.length; iBloc++) {
      const blocDebutMs = mots[plages[iBloc]?.[0]]?.debutMs
      if (blocDebutMs == null) continue
      let proche = null
      for (const e of suite) {
        if (
          Math.abs(e.debutMs - blocDebutMs) < 700 &&
          (!proche || Math.abs(e.debutMs - blocDebutMs) < Math.abs(proche.debutMs - blocDebutMs))
        ) {
          proche = e
        }
      }
      if (proche && proche.debutMs > 0) proche.entreeSection = true
    }

    // Le plan qui se fait pousser doit SURVIVRE sous la poussée. Les plans sont
    // contigus : sans prolongation, l'ancien se termine à l'instant exact où le
    // nouveau commence à monter, et la poussée se fait par-dessus le fond nu —
    // un battement sombre à chaque changement de section. On prolonge donc le
    // plan précédent d'une demi-seconde ; le nouveau, rendu au-dessus, le
    // recouvre entièrement une fois posé.
    for (const e of suite) {
      if (!e.entreeSection) continue
      const precedent = suite
        .filter((x) => x !== e && x.debutMs < e.debutMs)
        .sort((a, b) => b.debutMs - a.debutMs)[0]
      if (precedent) {
        precedent.dureeMs = Math.max(precedent.dureeMs, e.debutMs - precedent.debutMs + 500)
      }
    }
  }

  if (nonCalees.length) {
    journal.attention(
      `${nonCalees.length} ancre(s) introuvables dans la transcription — ` +
        `réparties dans leur bloc :\n  ${nonCalees.slice(0, 5).join('\n  ')}` +
        (nonCalees.length > 5 ? `\n  …` : '')
    )
  }

  // LE SCRIPT DOIT APPRENDRE CE QUE LE MONTAGE A REFUSÉ.
  //
  // Cartons et infographies sont bannis depuis le 28 août 2026 (§10) et
  // tombaient sans un mot. Le script en déclarait cinq, le plan en gardait
  // deux, et rien ne l'annonçait : on croyait à un défaut de calage, et on
  // réécrivait le même type à la vidéo suivante.
  if (bannis.size) {
    journal.attention(
      `Visuel(s) retiré(s) — ce type n'existe plus (§10) : ` +
        [...bannis].map(([t, n]) => `${n} × ${t}`).join(', ') +
        `. Un mot-clé ou un punch-in fait le même travail sans arrêter le montage.`
    )
  }

  return evenements.sort((a, b) => a.debutMs - b.debutMs)
}

/** Traduit un événement de script en événement de plan. */
function convertis(v) {
  const commun = { position: v.position ?? undefined }
  switch (v.type) {
    case 'mot-cle':
    case 'souligne':
      return { ...commun, type: v.type, texte: v.texte }
    case 'chiffre':
      return { ...commun, type: 'chiffre', de: v.de ?? 0, a: v.a, prefixe: v.prefixe, suffixe: v.suffixe }
    // LE CARTON TOMBE AVEC L INFOGRAPHIE, ET POUR LA MEME RAISON.
    //
    // C est un bloc de texte plein ecran pose sur l image. Il souffrait en plus
    // d un defaut de rendu : un texte plus long que son cadre debordait au lieu
    // de s adapter, et l ecran affichait un rectangle de couleur avec une
    // phrase coupee au milieu, par-dessus le sous-titre qui disait deja la meme
    // chose. Deux fois le meme texte, dont une tronquee.
    case 'carton':
      return null
    // LES INFOGRAPHIES SONT BANNIES. DECISION DU 28 AOUT 2026.
    //
    // Elles produisaient un bloc de couleur plein ecran avec du texte dedans,
    // au milieu d une video par ailleurs filmee. L effet lisait « diapositive
    // collee dans un montage », c est-a-dire exactement le contraire de ce
    // qu on cherche. Un chiffre ou une liste se disent tres bien a la voix, et
    // le sous-titre mot a mot les porte deja a l ecran.
    //
    // On les retire plutot que d echouer : un vieux script qui en contient doit
    // continuer a se monter.
    //
    // MAIS PLUS EN SILENCE. Le script en declarait deux, le montage en gardait
    // zero, et rien ne le disait : l autotest a mis quatre jours a reveler que
    // ses cinq visuels tombaient a deux. Qui ecrit un script doit apprendre que
    // ce type n existe plus, sinon il le reecrira a la video suivante.
    case 'infographie':
      return null
    case 'broll': {
      // Le faux travelling ne vaut que pour une IMAGE FIXE, où il remplace le
      // mouvement absent. Sur un clip qui bouge déjà, il s'ajoute au mouvement
      // du plan et donne une dérive molle qu'on ne sait pas attribuer.
      const src = v.src ?? null
      const ken = v.ken ?? (src ? /\.(jpe?g|png|webp|avif)$/i.test(src) : true)
      // L'ANCRE SUIT JUSQU'AU MONTAGE, ET PAS SEULEMENT POUR LE CALAGE.
      //
      // Elle ne servait qu'à placer l'événement sur le bon mot, puis on la
      // jetait. La bibliothèque de plans personnels en a besoin : ses mots-clés
      // sont écrits en français, et c'est l'ancre qui porte le français — la
      // requête, elle, est en anglais pour Pexels. Sans elle, un plan étiqueté
      // « guide » ne pouvait accrocher sur « un petit guide ».
      return { ...commun, type: 'broll', src, requete: v.requete, ancre: v.ancre ?? null, source: v.source ?? 'pexels', ken }
    }
    case 'capture':
      return { ...commun, type: 'capture', src: v.fichier ?? v.src }
    case 'flou':
      return { ...commun, type: 'flou', zone: v.zone }
    // `punch-in` et `transition` ne sont pas des surcouches : ils modifient
    // l'image elle-même, donc ils sont appliqués aux segments.
    case 'punch-in':
      return { ...commun, type: '_punch', amplitude: v.amplitude ?? 0.06 }
    case 'transition':
      return { ...commun, type: '_transition', effet: v.effet ?? 'fondu', sens: v.sens }
    default:
      return { ...commun, type: v.type }
  }
}

// ---------------------------------------------------------------------------
//  4. Le rythme
// ---------------------------------------------------------------------------

/**
 * Applique aux segments ce qui relève de l'image (resserrements, transitions),
 * et signale les passages où il ne se passe rien assez longtemps.
 *
 * On ne comble pas automatiquement : un événement inventé par le pipeline
 * n'illustre rien. On dit où ça manque, l'écriture s'en occupe.
 */
export function appliqueRythme(coupes, evenements, dureeMs) {
  const surcouches = evenements.filter((e) => !e.type.startsWith('_'))
  const punchs = evenements.filter((e) => e.type === '_punch')
  const transitions = evenements.filter((e) => e.type === '_transition')

  // Les punchs ne s'accrochent PLUS aux coupes. Ils partent en clair dans
  // plan.punchs (construisPlan) et c'est l'étage image entier qui les rend —
  // pour tous les formats. L'ancien accrochage restait actif en parallèle :
  // sur un format avec caméra, PisteVideo appliquait un second zoom étalé sur
  // tout le segment, et les deux transforms se MULTIPLIAIENT — un punch de 6 %
  // devenait 12 % au pic, suivi d'une dérive de zoom pendant vingt secondes.
  // Un effet ne doit avoir qu'un seul point d'application.

  for (const t of transitions) {
    // La transition marque une rupture : elle s'applique au segment qui commence
    // le plus près, jamais au milieu d'un plan.
    const cible = coupes.reduce(
      (meilleur, c) =>
        Math.abs(c.debutMs - t.debutMs) < Math.abs((meilleur?.debutMs ?? Infinity) - t.debutMs)
          ? c
          : meilleur,
      null
    )
    if (cible && cible.debutMs > 0) {
      cible.entree = { effet: t.effet, dureeMs: 420, sens: t.sens }
    }
  }

  // Où l'écran ne bouge-t-il pas assez longtemps ?
  //
  // LES PUNCH-INS COMPTENT, ET LES OUBLIER FAISAIT MENTIR CE CONTRÔLE.
  //
  // Ils ont quitté `surcouches` le jour où le rendu s'est mis à les appliquer à
  // l'étage image entier ; ce calcul, lui, n'a pas suivi. Un passage tenu par
  // trois punchs était donc annoncé « rien ne bouge », et la réponse naturelle —
  // ajouter des plans — chargeait un endroit déjà plein.
  const reperes = [
    ...surcouches.map((e) => e.debutMs),
    ...coupes.map((c) => c.debutMs),
    ...punchs.map((e) => e.debutMs),
  ].sort((a, b) => a - b)

  const creux = []
  for (let i = 0; i < reperes.length - 1; i++) {
    const ecart = reperes[i + 1] - reperes[i]
    if (ecart > ECART_MAX_MS) creux.push({ debutMs: reperes[i], ecartMs: ecart })
  }
  if (reperes.length && dureeMs - reperes[reperes.length - 1] > ECART_MAX_MS) {
    creux.push({ debutMs: reperes[reperes.length - 1], ecartMs: dureeMs - reperes[reperes.length - 1] })
  }

  return { surcouches, creux }
}

// ---------------------------------------------------------------------------
//  5. Le thème
// ---------------------------------------------------------------------------

const THEME_SECOURS = {
  fond: '#0B0B0D',
  texte: '#FBF9F7',
  accent: '#E8503A',
  accentSecondaire: '#2E9E8F',
  alerte: '#D93F3F',
  policeTitres: 'Inter',
  policeSousTitres: 'Inter',
  policeChiffres: 'Inter',
  rayon: 14,
}

/**
 * Le nom de famille d'une police, deviné depuis son nom de fichier.
 *
 * « Inter-Variable.ttf » → Inter · « BebasNeue-Bold.ttf » → BebasNeue.
 * Sans ça, deux graisses de la même police se retrouveraient déclarées comme
 * deux familles différentes, et le navigateur ne saurait pas les associer.
 */
const SUFFIXES =
  /[-_](variable|variablefont|thin|extralight|ultralight|light|regular|book|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique|wght.*|\[.*\]|\d+)$/i

function familleDe(nomFichier) {
  let nom = path.basename(nomFichier, path.extname(nomFichier))
  let avant
  do {
    avant = nom
    nom = nom.replace(SUFFIXES, '')
  } while (nom !== avant && nom.length > 1)
  return nom
}

const GRAISSES = [
  [/thin|100/i, 100],
  [/extralight|ultralight|200/i, 200],
  [/light|300/i, 300],
  [/medium|500/i, 500],
  [/semibold|demibold|600/i, 600],
  [/extrabold|ultrabold|800/i, 800],
  [/black|heavy|900/i, 900],
  [/bold|700/i, 700],
]

/** Construit le thème à partir de config/chaine.json, en embarquant les polices. */
export function construisTheme(chaine, { vertical, dossierPublic: pub, slug = null, format = null }) {
  const iv = chaine?.identite_visuelle ?? {}
  const polices = []

  if (fs.existsSync(CHEMINS.polices)) {
    const cible = path.join(pub, 'fonts')
    assureDossier(cible)
    for (const fichier of fs.readdirSync(CHEMINS.polices)) {
      if (!/\.(ttf|otf|woff2?)$/i.test(fichier)) continue
      fs.copyFileSync(path.join(CHEMINS.polices, fichier), path.join(cible, fichier))

      const nom = path.basename(fichier, path.extname(fichier))
      // Une police variable couvre toute la plage : on la déclare telle quelle,
      // sinon le navigateur synthétise le gras et le rendu devient baveux.
      const variable = /variable|\[.*wght.*\]|wght/i.test(nom)
      const graisse = variable
        ? '100 900'
        : (GRAISSES.find(([r]) => r.test(nom))?.[1] ?? 400)

      polices.push({
        famille: familleDe(fichier),
        fichier,
        graisse,
        style: /italic|oblique/i.test(nom) ? 'italic' : 'normal',
      })
    }
  }

  const familles = [...new Set(polices.map((p) => p.famille))]
  const a = (nom) => familles.find((f) => f.toLowerCase() === nom.toLowerCase())
  // Par défaut : une police de texte lisible pour les titres et les chiffres,
  // une police d'affiche pour les sous-titres, qui doivent tenir au scroll.
  const texte = a('Inter') ?? familles[0] ?? 'sans-serif'
  const affiche = a('Anton') ?? a('BebasNeue') ?? texte

  return {
    ...THEME_SECOURS,
    fond: iv.couleur_fond || THEME_SECOURS.fond,
    texte: iv.couleur_texte || THEME_SECOURS.texte,
    accent: iv.couleur_accent || THEME_SECOURS.accent,
    accentSecondaire: iv.couleur_accent_secondaire || THEME_SECOURS.accentSecondaire,
    // Le fond du mot actif : une variante assombrie de l accent, parce qu un
    // seul ton ne peut pas a la fois se lire SUR le fond et porter du texte.
    pastille: iv.couleur_pastille || iv.couleur_accent || THEME_SECOURS.accent,
    // L ambiance regle la vignette et le grain : une chaine qui reconforte ne
    // peut pas avoir l atmosphere d une chaine qui alarme.
    ambiance: iv.ambiance || 'neutre',
    // Les axes d une police variable. Sans eux, elle sort dans sa graisse par
    // defaut — souvent bien trop legere pour un sous-titre de format court.
    variationsAffiche: iv.variations_affiche || null,
    polices,
    policeTitres: iv.police_titres || texte,
    policeSousTitres: iv.police_soustitres || affiche,
    policeChiffres: iv.police_chiffres || texte,
    // LES SOUS-TITRES NE SE REGLENT PLUS ICI.
    //
    // Ils avaient six valeurs codees en dur a cet endroit, dont trois derivees
    // du seul fait que le format soit vertical. C'etait tenable tant que le
    // style etait un choix de chaine ; ca ne l'est plus des lors qu'on veut le
    // regler par video, avec un apercu, avant de fabriquer les plans.
    //
    // La resolution vit desormais dans `soustitres.mjs`, qui empile quatre
    // niveaux — ligne de commande, cette video, ce format, identite de la
    // chaine — exactement comme le fait deja le choix de la voix.
    sousTitres: versTheme(reglagesPour(slug, { chaine, format, vertical }).reglages),
  }
}

// ---------------------------------------------------------------------------
//  6. Ce que Remotion voit
// ---------------------------------------------------------------------------

/**
 * Le dossier que Remotion prendra pour `public/` au moment du rendu.
 *
 * Un dossier par vidéo, contenant exactement ce que ce rendu-là consomme :
 * la piste image, la voix, les polices, le B-roll. Rien d'autre.
 *
 * Windows ne sait pas suivre un lien symbolique depuis un paquet Remotion, et
 * le dossier public est recopié à chaque construction : y laisser les rushes
 * d'origine reviendrait à recopier plusieurs gigaoctets à chaque rendu.
 */
export function dossierPublic(cheminMontage) {
  return assureDossier(path.join(cheminMontage, 'public'))
}

/** Copie un fichier dans le dossier public, sous un nom donné. */
export function deposeDansPublic(source, dossier, nom) {
  assureDossier(dossier)
  const cible = path.join(dossier, nom)
  fs.copyFileSync(source, cible)
  return nom
}

// ---------------------------------------------------------------------------
//  7. Le plan
// ---------------------------------------------------------------------------

export function dimensionsDe(format) {
  return estVertical(format) ? DIMENSIONS.vertical : DIMENSIONS.horizontal
}

export function construisPlan({
  script,
  chaine,
  mots,
  aGarder,
  dureeMs,
  evenements,
  piste,
  voixSrc,
  musique,
  dossierPublic: pub,
}) {
  const vertical = estVertical(script.format)
  const { largeur, hauteur } = dimensionsDe(script.format)

  // Les coupes ne portent plus de source : la piste est déjà montée. Elles ne
  // servent qu'à savoir où sont les jointures, pour y poser un effet.
  const coupes = aGarder.map((m) => ({ debutMs: m.debutMs, dureeMs: m.dureeMs }))

  const { surcouches, creux } = appliqueRythme(coupes, evenements, dureeMs)

  // LES PUNCH-INS PARTENT AUSSI EN CLAIR DANS LE PLAN, avec leur instant exact.
  //
  // Les accrocher aux coupes (appliqueRythme) ne suffit plus : sur un format
  // sans caméra, la piste est un fond uni caché sous les plans de coupe — un
  // zoom dessus ne zoome rien de visible. Le rendu applique donc le punch à
  // l'ÉTAGE IMAGE ENTIER (piste + plans), au mot précis où il a été ancré, pas
  // au début du segment qui le contient.
  const punchs = evenements
    .filter((e) => e.type === '_punch')
    .map((e) => ({ debutMs: e.debutMs, amplitude: e.amplitude ?? 0.06 }))
    .sort((a, b) => a.debutMs - b.debutMs)

  const finParoleMs = mots.length ? mots[mots.length - 1].finMs : dureeMs
  const totalMs = Math.max(dureeMs, finParoleMs) + QUEUE_S * 1000

  return {
    plan: {
      slug: script.slug,
      format: script.format,
      largeur,
      hauteur,
      fps: FPS,
      dureeFrames: Math.ceil((totalMs / 1000) * FPS),
      theme: construisTheme(chaine, { vertical, dossierPublic: pub, slug: script.slug, format: script.format }),
      voix: { src: voixSrc, volume: 1 },
      musique: musique ?? undefined,
      piste: piste ?? undefined,
      coupes,
      punchs,
      mots,
      evenements: surcouches,
      titre: script.titre_travail,
      logo: undefined,
    },
    creux,
  }
}

// ---------------------------------------------------------------------------
//  La coupe intelligente : hésitations, bafouillages, faux départs
// ---------------------------------------------------------------------------

/**
 * Les mots qui ne portent aucune information.
 *
 * Ils passent inaperçus quand on parle et sautent aux oreilles quand on écoute.
 * On ne retire QUE ceux-là, et jamais un mot qui pourrait porter du sens :
 * « bon » ou « alors » peuvent ouvrir une phrase, donc ils n'y sont pas.
 */
const REMPLISSAGE = new Set([
  'euh', 'euhh', 'euuh', 'heu', 'hum', 'hmm', 'mmh', 'mh',
  'bah', 'beh', 'ben', 'hein', 'quoi',
])

/**
 * Retire d'un plan de coupe les hésitations et les bafouillages.
 *
 * Trois familles, et elles se traitent différemment :
 *
 *  1. **Le remplissage** — « euh », « hum », « bah ». On le retire toujours.
 *  2. **Le bafouillage** — le même mot dit deux fois de suite. On garde la
 *     SECONDE occurrence : c'est celle qui est enchaînée avec la suite, la
 *     première est un départ avorté.
 *  3. **Le faux départ** — un groupe de deux ou trois mots repris à l'identique
 *     un peu plus loin. Même règle : on garde la reprise.
 *
 * Les instants viennent de la transcription de l'audio DÉJÀ recollé, donc dans
 * le temps du montage ; on les reprojette ensuite sur les segments d'origine.
 *
 * @param aGarder segments {src, depuisS, jusquaS, debutMs, dureeMs}
 * @param mots    transcription de l'audio recollé
 */
export function retireLesHesitations(aGarder, mots) {
  const nu = (s) =>
    String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')

  const aOter = []
  const marge = 40 // on mord légèrement autour, sinon on laisse une amorce

  for (let i = 0; i < mots.length; i++) {
    const m = nu(mots[i].texte)
    if (!m) continue

    if (REMPLISSAGE.has(m)) {
      aOter.push([mots[i].debutMs - marge, mots[i].finMs + marge])
      continue
    }
    // Bafouillage : le mot précédent est identique et RECOLLÉ.
    //
    // Le seuil était à une seconde : beaucoup trop large. Un redoublement
    // d'insistance — « très très », « tout tout », « non non » — se dit avec un
    // espacement normal et porte du sens ; le supprimer abîme la phrase. Un vrai
    // bafouillage, lui, est quasiment collé : moins de 250 ms, et sur un mot
    // qui ne se redouble pas naturellement.
    const REDOUBLEMENTS = new Set(['tres', 'tout', 'toute', 'non', 'oui', 'bien', 'plus', 'jamais'])
    if (
      i > 0 &&
      nu(mots[i - 1].texte) === m &&
      !REDOUBLEMENTS.has(m) &&
      mots[i].debutMs - mots[i - 1].finMs < 250
    ) {
      aOter.push([mots[i - 1].debutMs - marge, mots[i - 1].finMs + marge])
      continue
    }
    // Faux départ : un groupe de deux à quatre mots repris à l'identique juste
    // après. On teste du plus long au plus court — « les vrais sujets » repris
    // en entier doit se voir comme un groupe de trois, pas comme deux groupes
    // de deux qui se chevauchent.
    //
    // Le mot de liaison qui précède la reprise ne compte pas dans la comparaison :
    // « pour les vrais sujets, PUIS les vrais sujets » est un faux départ, même
    // si « pour » et « puis » diffèrent.
    let trouve = false
    for (let n = 4; n >= 2 && !trouve; n--) {
      // `saut` = un éventuel mot de liaison glissé entre les deux occurrences.
      // « pour les vrais sujets, PUIS les vrais sujets » est un faux départ, et
      // sans ce décalage on ne le voit pas : les deux groupes ne sont pas collés.
      for (const saut of [0, 1]) {
        if (i < n + saut || i + n > mots.length) continue
        const avant = mots.slice(i - n - saut, i - saut).map((x) => nu(x.texte)).join(' ')
        const apres = mots.slice(i, i + n).map((x) => nu(x.texte)).join(' ')
        if (avant !== apres || avant.length <= 6) continue
        if (mots[i].debutMs - mots[i - 1].finMs > 1500) continue
        // On retire la PREMIÈRE occurrence, et le mot qui l'introduit s'il est
        // court : sinon il reste un « pour » orphelin devant la reprise.
        const debut = i - n - saut
        const amorce = debut > 0 && nu(mots[debut - 1].texte).length <= 5 ? debut - 1 : debut
        aOter.push([mots[amorce].debutMs - marge, mots[i - 1 - saut].finMs + marge])
        trouve = true
        break
      }
    }
  }

  if (!aOter.length) return { aGarder, retires: 0, retireMs: 0 }

  // On fusionne les plages qui se touchent, puis on découpe les segments autour.
  aOter.sort((x, y) => x[0] - y[0])
  const plages = [aOter[0]]
  for (const [d, f] of aOter.slice(1)) {
    const dernier = plages[plages.length - 1]
    if (d <= dernier[1] + 10) dernier[1] = Math.max(dernier[1], f)
    else plages.push([d, f])
  }

  const sortie = []
  let curseur = 0
  let retireMs = 0

  for (const seg of aGarder) {
    // Les morceaux de CE segment qui survivent, en temps de montage.
    let morceaux = [[seg.debutMs, seg.debutMs + seg.dureeMs]]
    for (const [d, f] of plages) {
      const suivants = []
      for (const [a, b] of morceaux) {
        if (f <= a || d >= b) { suivants.push([a, b]); continue }
        if (d > a) suivants.push([a, d])
        if (f < b) suivants.push([f, b])
      }
      morceaux = suivants
    }
    for (const [a, b] of morceaux) {
      const duree = b - a
      if (duree < 60) continue // un résidu de quelques images ne s'entend pas, il craque
      sortie.push({
        src: seg.src,
        depuisS: seg.depuisS + (a - seg.debutMs) / 1000,
        jusquaS: seg.depuisS + (b - seg.debutMs) / 1000,
        debutMs: curseur,
        dureeMs: duree,
      })
      curseur += duree
    }
    retireMs += seg.dureeMs - morceaux.reduce((n, [a, b]) => n + (b - a), 0)
  }

  return { aGarder: sortie, retires: plages.length, retireMs, dureeMs: curseur }
}
