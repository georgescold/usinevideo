/**
 * whisper.mjs — transcription locale, mot à mot, hors ligne et gratuite.
 *
 * Tout le montage automatique repose sur ces temps : les sous-titres, la coupe
 * des silences, et le calage des événements visuels sur le mot exact. Une
 * transcription approximative donne un montage approximatif.
 *
 * Deux versions du moteur :
 *   - processeur : 8 Mo, marche partout, environ 1× le temps réel en `medium` ;
 *   - carte NVIDIA : 270 Mo, cinq à dix fois plus rapide sur une RTX.
 * Le choix se fait par `WHISPER_GPU` dans .env, et se vérifie au premier usage.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { transcribe, downloadWhisperModel, toCaptions } from '@remotion/install-whisper-cpp'
import { CHEMINS, assureDossier, env } from './chemins.mjs'
import { journal, duree } from './journal.mjs'
import { telecharge } from './http.mjs'
import { lance, lanceOuEchoue, extraitAudio, sonde } from './ffmpeg.mjs'

/** Version épinglée : c'est elle qui décide de l'emplacement de l'exécutable. */
export const VERSION_WHISPER = '1.9.2'

const DOSSIER_WHISPER = path.join(CHEMINS.outilsBin, 'whisper')
const EXECUTABLE = path.join(DOSSIER_WHISPER, 'build', 'bin', 'whisper-cli.exe')
const EXECUTABLE_UNIX = path.join(DOSSIER_WHISPER, 'build', 'bin', 'whisper-cli')

/**
 * Deux variantes du moteur.
 *
 * On prend le paquet CUDA 12.4 et non le 11.8, plus léger : seul le 12.4
 * embarque `cublas64_12.dll` et `cublasLt64_12.dll`. Le 11.8 les attend du
 * système, et sans le Toolkit installé son backend CUDA ne se charge pas —
 * whisper annonce alors « no GPU found » et retombe sur le processeur sans
 * qu'on s'en aperçoive. Le prix à payer est un téléchargement de 670 Mo, une
 * seule fois, partagé entre toutes les chaînes.
 */
const SOURCES = {
  processeur: `https://github.com/ggml-org/whisper.cpp/releases/download/v${VERSION_WHISPER}/whisper-bin-x64.zip`,
  nvidia: `https://github.com/ggml-org/whisper.cpp/releases/download/v${VERSION_WHISPER}/whisper-cublas-12.4.0-bin-x64.zip`,
}

/** Trace de la variante posée, pour savoir quoi faire si le réglage change. */
const MARQUEUR = path.join(DOSSIER_WHISPER, 'variante.json')

export const cheminExecutable = () => (os.platform() === 'win32' ? EXECUTABLE : EXECUTABLE_UNIX)

export const estInstalle = () => fs.existsSync(cheminExecutable())

/** Quelle variante est effectivement installée ? */
export function varianteInstallee() {
  if (!estInstalle()) return null
  try {
    return JSON.parse(fs.readFileSync(MARQUEUR, 'utf8')).variante
  } catch {
    // Installation antérieure au marqueur : c'était forcément la variante
    // processeur, la seule qui existait alors.
    return 'processeur'
  }
}

/** Une carte NVIDIA est-elle présente ? Constaté, pas supposé. */
export async function carteNvidia() {
  const { code, stdout } = await lance('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'])
  return code === 0 ? stdout.trim().split('\n')[0] || null : null
}

/**
 * Installe le moteur. Idempotent : ne fait rien s'il est déjà là.
 *
 * L'archive de whisper.cpp range tout dans `Release/`, alors que l'outillage
 * attend `build/bin/`. On réorganise à l'installation plutôt que de bricoler
 * le chemin à chaque appel — et les DLL doivent rester à côté de l'exécutable.
 */
export async function installe({ gpu = null, silencieux = false } = {}) {
  const veutGpu = gpu === null ? env('WHISPER_GPU', 'false') === 'true' : gpu
  const voulue = veutGpu ? 'nvidia' : 'processeur'
  const posee = varianteInstallee()

  if (posee === voulue) return { dejaLa: true, variante: posee, chemin: cheminExecutable() }

  if (posee && posee !== voulue) {
    // Le réglage a changé depuis la dernière fois. Sans ça, basculer
    // WHISPER_GPU ne ferait rien du tout et l'utilisateur croirait que sa carte
    // travaille alors que le binaire posé ne sait pas s'en servir.
    if (!silencieux) {
      journal.info(
        `Variante « ${posee} » installée, « ${voulue} » demandée. Remplacement du moteur…`
      )
    }
    fs.rmSync(DOSSIER_WHISPER, { recursive: true, force: true })
  }

  if (os.platform() !== 'win32') {
    throw new Error(
      `L'installation automatique de whisper.cpp n'est prévue que pour Windows dans cette stack. ` +
        `Sur un autre système, compile whisper.cpp à la main et place whisper-cli dans ${path.dirname(cheminExecutable())}.`
    )
  }

  const source = veutGpu ? SOURCES.nvidia : SOURCES.processeur
  const poids = veutGpu ? '670 Mo' : '8 Mo'

  if (!silencieux) {
    journal.info(
      `Installation de whisper.cpp ${VERSION_WHISPER} (${veutGpu ? 'accéléré NVIDIA' : 'processeur'}, ${poids})…`
    )
  }

  assureDossier(DOSSIER_WHISPER)
  const archive = path.join(CHEMINS.outilsBin, `whisper-${VERSION_WHISPER}.zip`)
  await telecharge(source, archive, { obligatoire: true, tempsMortMs: 900_000 })

  await lanceOuEchoue('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Force -LiteralPath '${archive}' -DestinationPath '${DOSSIER_WHISPER}'`,
  ])
  fs.rmSync(archive, { force: true })

  const release = path.join(DOSSIER_WHISPER, 'Release')
  const cible = path.join(DOSSIER_WHISPER, 'build', 'bin')
  if (fs.existsSync(release)) {
    assureDossier(cible)
    for (const nom of fs.readdirSync(release)) {
      fs.renameSync(path.join(release, nom), path.join(cible, nom))
    }
    fs.rmSync(release, { recursive: true, force: true })
  }

  if (!estInstalle()) {
    throw new Error(
      `whisper-cli est introuvable après installation. Contenu de ${DOSSIER_WHISPER} :\n` +
        fs.readdirSync(DOSSIER_WHISPER).join(', ')
    )
  }
  fs.writeFileSync(
    MARQUEUR,
    JSON.stringify({ variante: voulue, version: VERSION_WHISPER, le: new Date().toISOString() }, null, 2),
    'utf8'
  )
  if (!silencieux) journal.ok(`whisper.cpp (${voulue}) installé dans ${DOSSIER_WHISPER}`)
  return { dejaLa: false, variante: voulue, chemin: cheminExecutable() }
}

/** Télécharge un modèle. Les tailles vont de 75 Mo (tiny) à 3 Go (large-v3). */
export async function installeModele(modele = null, { silencieux = false } = {}) {
  const m = modele || env('WHISPER_MODELE', 'medium')
  assureDossier(CHEMINS.outilsModeles)
  const attendu = path.join(CHEMINS.outilsModeles, `ggml-${m}.bin`)
  if (fs.existsSync(attendu)) return { modele: m, chemin: attendu, dejaLa: true }

  if (!silencieux) journal.info(`Téléchargement du modèle « ${m} »… (une seule fois)`)
  await downloadWhisperModel({
    model: m,
    folder: CHEMINS.outilsModeles,
    printOutput: !silencieux,
  })
  return { modele: m, chemin: attendu, dejaLa: false }
}

/**
 * Transcrit un fichier audio ou vidéo.
 *
 * @returns { mots, texte, langue } où `mots` porte `{ texte, debutMs, finMs }`.
 */
export async function transcris(fichier, { modele = null, langue = null, silencieux = false } = {}) {
  await installe({ silencieux })
  const { modele: m } = await installeModele(modele, { silencieux })
  const lang = (langue || env('WHISPER_LANGUE', 'fr')).toLowerCase()

  // whisper.cpp n'accepte que du WAV 16 kHz mono. On convertit systématiquement
  // plutôt que de sonder : la conversion coûte moins cher qu'un échec obscur.
  const temporaire = path.join(
    os.tmpdir(),
    `whisper-${path.basename(fichier, path.extname(fichier))}-${process.pid}.wav`
  )
  await extraitAudio(fichier, temporaire)

  const debut = Date.now()
  let dernierPourcent = -1
  try {
    const brut = await transcribe({
      inputPath: temporaire,
      whisperPath: DOSSIER_WHISPER,
      whisperCppVersion: VERSION_WHISPER,
      model: m,
      modelFolder: CHEMINS.outilsModeles,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      language: lang,
      printOutput: false,
      onProgress: (p) => {
        if (silencieux) return
        const pc = Math.round(p * 100)
        if (pc !== dernierPourcent && pc % 5 === 0) {
          dernierPourcent = pc
          process.stdout.write(`\r  transcription ${pc} %   `)
        }
      },
    })
    if (!silencieux) process.stdout.write('\r' + ' '.repeat(30) + '\r')

    const { captions } = toCaptions({ whisperCppOutput: brut })
    const mots = captions
      .map((c) => ({ texte: c.text.trim(), debutMs: c.startMs, finMs: c.endMs }))
      .filter((mot) => mot.texte.length > 0)

    if (!silencieux) {
      journal.ok(`${mots.length} mots transcrits en ${duree((Date.now() - debut) / 1000)}`)
    }

    return {
      mots,
      texte: mots.map((mot) => mot.texte).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
      langue: brut.result?.language ?? lang,
      modele: m,
    }
  } finally {
    fs.rmSync(temporaire, { force: true })
  }
}

/**
 * Aligne un texte connu sur un audio.
 *
 * whisper.cpp ne sait pas faire d'alignement forcé : on transcrit, puis on
 * recale les mots du script sur ceux entendus. Le script fait foi pour
 * l'orthographe, l'audio fait foi pour le temps.
 */
export async function aligne(fichier, texteAttendu, options = {}) {
  const { mots: entendus, langue, modele } = await transcris(fichier, options)
  const attendus = texteAttendu
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const nu = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')

  const A = attendus.map(nu)
  const B = entendus.map((mot) => nu(mot.texte))
  const { dureeS } = await sonde(fichier)
  const dureeMs = Math.round(dureeS * 1000)

  // Plus longue sous-sequence commune. Contrairement a un balayage glouton,
  // elle encaisse une phrase sautee, un mot repete ou une reprise en cours de
  // prise -- ce qui arrive a tous les tournages.
  const n = A.length
  const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const sortie = attendus.map((texte) => ({ texte, debutMs: null, finMs: null }))
  let i = 0
  let j = 0
  let ancres = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      sortie[i].debutMs = entendus[j].debutMs
      sortie[i].finMs = entendus[j].finMs
      ancres++
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }

  const tauxAncrage = n ? ancres / n : 0

  if (tauxAncrage < 0.5) {
    // Trop peu de reperes pour croire l'alignement. Plutot que d'empiler tous
    // les mots au meme endroit -- ce qui donne des sous-titres qui defilent en
    // deux secondes puis plus rien -- on les repartit sur la duree reelle.
    journal.attention(
      `Seuls ${ancres} mots sur ${n} ont ete reconnus dans l'audio (${Math.round(tauxAncrage * 100)} %). ` +
        `Repartition uniforme sur ${Math.round(dureeS)} s : les sous-titres suivront le rythme moyen, ` +
        `pas le mot exact. Verifie que la prise correspond au script et que le son est net.`
    )
    const pas = dureeMs / Math.max(n, 1)
    return {
      mots: sortie.map((mot, k) => ({
        texte: mot.texte,
        debutMs: Math.round(k * pas),
        finMs: Math.round((k + 0.85) * pas),
        incertain: true,
      })),
      langue,
      modele,
      entendus,
      tauxAncrage,
    }
  }

  // Les mots non ancres se repartissent regulierement entre leurs deux voisins
  // ancres. Leur donner l'horodatage du voisin les ferait tous apparaitre et
  // disparaitre ensemble.
  let precedent = -1
  for (let k = 0; k <= n; k++) {
    const ancre = k < n && sortie[k].debutMs !== null
    if (!ancre && k < n) continue

    const trou = k - precedent - 1
    if (trou > 0) {
      const debutTrou = precedent >= 0 ? sortie[precedent].finMs : 0
      const finTrou = k < n ? sortie[k].debutMs : dureeMs
      const pas = (finTrou - debutTrou) / (trou + 1)
      for (let t = 0; t < trou; t++) {
        const cible = precedent + 1 + t
        sortie[cible].debutMs = Math.round(debutTrou + pas * t)
        sortie[cible].finMs = Math.round(debutTrou + pas * (t + 0.9))
        sortie[cible].incertain = true
      }
    }
    precedent = k
  }

  const incertains = sortie.filter((mot) => mot.incertain).length
  if (incertains > n * 0.15) {
    journal.attention(
      `${incertains} mots sur ${n} n'ont pas ete retrouves tels quels dans l'audio ` +
        `(${Math.round(tauxAncrage * 100)} % d'ancrage). Leur position est interpolee : ` +
        `l'ensemble reste cale, mais ces mots-la peuvent glisser d'une fraction de seconde.`
    )
  }

  return { mots: sortie, langue, modele, entendus, tauxAncrage }
}

/** État de l'installation, pour `npm run verifie`. */
export async function etat() {
  const modele = env('WHISPER_MODELE', 'medium')
  const cheminModele = path.join(CHEMINS.outilsModeles, `ggml-${modele}.bin`)
  const gpu = await carteNvidia()
  let tailleModele = null
  if (fs.existsSync(cheminModele)) {
    tailleModele = Math.round(fs.statSync(cheminModele).size / 1e6)
  }
  return {
    installe: estInstalle(),
    variante: varianteInstallee(),
    version: VERSION_WHISPER,
    chemin: cheminExecutable(),
    modele,
    modelePresent: fs.existsSync(cheminModele),
    tailleModeleMo: tailleModele,
    gpu,
    gpuActif: env('WHISPER_GPU', 'false') === 'true',
  }
}

export { sonde }
