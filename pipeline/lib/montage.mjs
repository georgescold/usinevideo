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

/** Les fichiers exploitables d'un dossier de tournage, dans l'ordre. */
export function prendsLesRushes(dossier) {
  if (!fs.existsSync(dossier)) return []
  return fs
    .readdirSync(dossier)
    .filter((f) => /\.(mp4|mov|mkv|webm|avi)$/i.test(f))
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
export async function fabriqueImage(aGarder, destination, { largeur, hauteur, fps = FPS }) {
  assureDossier(path.dirname(destination))

  const sources = [...new Set(aGarder.map((m) => m.src))]
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
  const cible = nu(ancre).split(' ').filter(Boolean)
  if (cible.length === 0) return null

  const [debut, fin] = plage
  for (let i = debut; i <= fin - cible.length; i++) {
    let correspond = true
    for (let j = 0; j < cible.length; j++) {
      if (nu(mots[i + j]?.texte) !== cible[j]) {
        correspond = false
        break
      }
    }
    if (correspond) {
      return {
        debutMs: mots[i].debutMs,
        finMs: mots[i + cible.length - 1].finMs,
        index: i,
      }
    }
  }
  return null
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
export function caleEvenements(script, mots) {
  const evenements = []
  const nonCalees = []
  let curseur = 0

  for (const bloc of script.blocs) {
    const nbMots = String(bloc.texte).split(/\s+/).filter(Boolean).length
    const plage = [curseur, Math.min(curseur + nbMots, mots.length)]
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

      evenements.push({
        ...convertis(v),
        debutMs: Math.round(debutMs),
        dureeMs: Math.round(Math.min(dureeMs, Math.max(800, blocFinMs + 1500 - debutMs))),
      })
    }
    curseur = plage[1]
  }

  if (nonCalees.length) {
    journal.attention(
      `${nonCalees.length} ancre(s) introuvables dans la transcription — ` +
        `réparties dans leur bloc :\n  ${nonCalees.slice(0, 5).join('\n  ')}` +
        (nonCalees.length > 5 ? `\n  …` : '')
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
    case 'carton':
      return { ...commun, type: 'carton', texte: v.texte, sousTexte: v.sous_texte ?? v.sousTexte }
    case 'infographie':
      return { ...commun, type: 'infographie', modele: v.modele, donnees: v.donnees }
    case 'broll':
      return { ...commun, type: 'broll', src: v.src ?? null, requete: v.requete, source: v.source ?? 'pexels', ken: true }
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

  for (const p of punchs) {
    const cible = coupes.find((c) => p.debutMs >= c.debutMs && p.debutMs < c.debutMs + c.dureeMs)
    if (cible) cible.punchIn = p.amplitude
  }

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
  const reperes = [
    ...surcouches.map((e) => e.debutMs),
    ...coupes.map((c) => c.debutMs),
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
export function construisTheme(chaine, { vertical, dossierPublic: pub }) {
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
    polices,
    policeTitres: iv.police_titres || texte,
    policeSousTitres: iv.police_soustitres || affiche,
    policeChiffres: iv.police_chiffres || texte,
    sousTitres: {
      style: iv.style_soustitres || 'mot-a-mot-pastille',
      motsParPage: vertical ? 3 : 5,
      casse: iv.casse_soustitres || 'majuscules',
      taille: vertical ? 86 : 64,
      // En vertical, on reste au-dessus de l'interface de TikTok et des Shorts.
      positionBas: vertical ? 22 : 10,
      contour: true,
    },
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
      theme: construisTheme(chaine, { vertical, dossierPublic: pub }),
      voix: { src: voixSrc, volume: 1 },
      musique: musique ?? undefined,
      piste: piste ?? undefined,
      coupes,
      mots,
      evenements: surcouches,
      titre: script.titre_travail,
      logo: undefined,
    },
    creux,
  }
}
