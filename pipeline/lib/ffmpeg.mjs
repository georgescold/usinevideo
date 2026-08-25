/**
 * ffmpeg.mjs — sonder, extraire, découper, normaliser.
 *
 * Aucune décision éditoriale ici : ce module ne fait que manipuler des fichiers.
 * Ce qui se coupe et pourquoi se décide dans `montage.mjs`.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { assureDossier } from './chemins.mjs'
import { journal } from './journal.mjs'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

/** Lance un binaire et rend { code, stdout, stderr }. N'échoue pas de lui-même. */
export function lance(binaire, args, { silencieux = true } = {}) {
  return new Promise((resoud, rejette) => {
    // Depuis Node 18.20, lancer un .cmd ou un .bat sans shell echoue en EINVAL.
    const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binaire)
    const p = spawn(binaire, args, { windowsHide: true, shell: viaShell })
    let sortie = ''
    let erreur = ''
    p.stdout.on('data', (d) => (sortie += d.toString()))
    p.stderr.on('data', (d) => {
      const t = d.toString()
      erreur += t
      if (!silencieux) process.stderr.write(t)
    })
    p.on('error', (e) =>
      rejette(
        new Error(
          `${binaire} introuvable ou impossible à lancer (${e.message}). ` +
            `Vérifie qu'il est dans le PATH, ou renseigne FFMPEG_PATH dans .env.`
        )
      )
    )
    p.on('close', (code) => resoud({ code, stdout: sortie, stderr: erreur }))
  })
}

/** Idem, mais échoue si le code de retour n'est pas 0. */
export async function lanceOuEchoue(binaire, args, opts) {
  const r = await lance(binaire, args, opts)
  if (r.code !== 0) {
    const fin = r.stderr.trim().split('\n').slice(-6).join('\n')
    throw new Error(`${path.basename(binaire)} a échoué (code ${r.code}) :\n${fin}`)
  }
  return r
}

export const ffmpeg = (args, opts) => lanceOuEchoue(FFMPEG, ['-hide_banner', '-y', ...args], opts)

/** Métadonnées d'un fichier média. */
export async function sonde(fichier) {
  if (!fs.existsSync(fichier)) throw new Error(`Fichier introuvable : ${fichier}`)
  const { stdout } = await lanceOuEchoue(FFPROBE, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    fichier,
  ])
  const brut = JSON.parse(stdout)
  const video = brut.streams.find((s) => s.codec_type === 'video')
  const audio = brut.streams.find((s) => s.codec_type === 'audio')
  const [num, den] = (video?.r_frame_rate || '0/1').split('/').map(Number)

  return {
    fichier,
    dureeS: Number(brut.format?.duration) || 0,
    aDeLaVideo: Boolean(video),
    aDuSon: Boolean(audio),
    largeur: video?.width ?? null,
    hauteur: video?.height ?? null,
    fps: den ? Number((num / den).toFixed(3)) : null,
    codecVideo: video?.codec_name ?? null,
    codecAudio: audio?.codec_name ?? null,
    canaux: audio?.channels ?? null,
    echantillonnage: audio ? Number(audio.sample_rate) : null,
  }
}

/**
 * Extrait la piste audio en WAV 16 kHz mono — le seul format que whisper.cpp
 * accepte. Toute autre cadence le fait échouer sans message clair.
 */
export async function extraitAudio(source, destination) {
  assureDossier(path.dirname(destination))
  await ffmpeg([
    '-i', source,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    destination,
  ])
  return destination
}

/**
 * Repère les silences.
 *
 * @param seuilDb   Niveau en dessous duquel c'est du silence. −34 dBFS convient
 *                  à un micro proche dans une pièce mate ; descendre à −40 pour
 *                  une pièce vivante, remonter à −28 pour un micro lointain.
 * @param dureeMin  Un blanc plus court que ça est une respiration, pas un vide.
 * @returns         Les intervalles de silence, en secondes.
 */
export async function detecteSilences(fichier, { seuilDb = -34, dureeMin = 0.35 } = {}) {
  const { stderr } = await lance(FFMPEG, [
    '-hide_banner',
    '-i', fichier,
    '-af', `silencedetect=noise=${seuilDb}dB:d=${dureeMin}`,
    '-f', 'null',
    '-',
  ])

  const silences = []
  let debut = null
  for (const ligne of stderr.split('\n')) {
    const d = ligne.match(/silence_start:\s*(-?[\d.]+)/)
    if (d) {
      debut = Math.max(0, Number(d[1]))
      continue
    }
    const f = ligne.match(/silence_end:\s*([\d.]+)/)
    if (f && debut !== null) {
      silences.push({ debutS: debut, finS: Number(f[1]) })
      debut = null
    }
  }
  // Un silence ouvert en fin de fichier n'est jamais refermé par ffmpeg.
  if (debut !== null) {
    const { dureeS } = await sonde(fichier)
    if (dureeS > debut) silences.push({ debutS: debut, finS: dureeS })
  }
  return silences
}

/**
 * Le complément des silences : les moments où l'on parle.
 *
 * `marge` rend un peu d'air de chaque côté — sans elle, les attaques de mots
 * sont rognées et la voix devient hachée.
 */
export function intervallesDeParole(silences, dureeTotaleS, { marge = 0.08 } = {}) {
  const parole = []
  let curseur = 0
  for (const s of silences) {
    const debut = Math.max(curseur, 0)
    const fin = Math.min(s.debutS + marge, dureeTotaleS)
    if (fin - debut > 0.05) parole.push({ debutS: debut, finS: fin })
    curseur = Math.max(0, s.finS - marge)
  }
  if (dureeTotaleS - curseur > 0.05) parole.push({ debutS: curseur, finS: dureeTotaleS })

  // Deux morceaux séparés par moins de 120 ms se recollent : la coupe
  // s'entendrait plus qu'elle ne gagnerait de temps.
  const fusionnes = []
  for (const p of parole) {
    const precedent = fusionnes[fusionnes.length - 1]
    if (precedent && p.debutS - precedent.finS < 0.12) precedent.finS = p.finS
    else fusionnes.push({ ...p })
  }
  return fusionnes
}

/** Découpe un morceau, sans réencoder la vidéo quand c'est possible. */
export async function decoupe(source, destination, debutS, finS, { reencode = true } = {}) {
  assureDossier(path.dirname(destination))
  const args = ['-ss', String(debutS), '-to', String(finS), '-i', source]
  if (reencode) args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac')
  else args.push('-c', 'copy')
  args.push(destination)
  await ffmpeg(args)
  return destination
}

/** Recolle des morceaux audio en un seul fichier, sans clic aux jointures. */
export async function recolleAudio(morceaux, destination) {
  assureDossier(path.dirname(destination))
  const liste = path.join(path.dirname(destination), `.concat-${Date.now()}.txt`)
  fs.writeFileSync(
    liste,
    morceaux.map((m) => `file '${m.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8'
  )
  try {
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', destination])
  } finally {
    fs.rmSync(liste, { force: true })
  }
  return destination
}

/**
 * Extrait les moments de parole d'un audio et les recolle, avec un fondu de
 * 8 ms de chaque côté de chaque morceau. C'est ce qui évite le claquement
 * caractéristique du montage automatique.
 */
export async function coupeEtRecolleAudio(source, intervalles, destination) {
  assureDossier(path.dirname(destination))
  const filtres = intervalles
    .map(
      (p, i) =>
        `[0:a]atrim=start=${p.debutS}:end=${p.finS},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=0.008,afade=t=out:st=${Math.max(0, p.finS - p.debutS - 0.008)}:d=0.008[a${i}]`
    )
    .join(';')
  const entrees = intervalles.map((_, i) => `[a${i}]`).join('')
  const filtre = `${filtres};${entrees}concat=n=${intervalles.length}:v=0:a=1[sortie]`

  await ffmpeg([
    '-i', source,
    '-filter_complex', filtre,
    '-map', '[sortie]',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    destination,
  ])
  return destination
}

/**
 * Normalise la voix. −16 LUFS pour un long format, −14 pour un vertical :
 * les plateformes normalisent de leur côté, mais partir trop bas fait perdre
 * en présence.
 */
export async function normalise(source, destination, { lufs = -16 } = {}) {
  assureDossier(path.dirname(destination))
  await ffmpeg([
    '-i', source,
    '-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11`,
    '-ar', '48000',
    destination,
  ])
  return destination
}

/** Applique une LUT .cube. Se fait en post, pas dans Remotion : c'est plus rapide et plus fidèle. */
export async function appliqueLut(source, destination, cube, { force = 1 } = {}) {
  assureDossier(path.dirname(destination))
  const chemin = cube.replace(/\\/g, '/').replace(/:/g, '\\:')
  const filtre =
    force >= 1
      ? `lut3d='${chemin}'`
      : `[0:v]split[a][b];[b]lut3d='${chemin}'[c];[a][c]blend=all_mode=normal:all_opacity=${force}`
  await ffmpeg([
    '-i', source,
    '-filter_complex', filtre,
    '-c:a', 'copy',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    destination,
  ])
  return destination
}

/** L'accélération NVIDIA est-elle utilisable ? Testé, pas supposé. */
export async function accelerationNvidia() {
  const { stdout, stderr } = await lance(FFMPEG, ['-hide_banner', '-encoders'])
  return /h264_nvenc/.test(stdout + stderr)
}

/** Rend une vignette, pour montrer un rush ou vérifier un cadre. */
export async function vignette(source, destination, secondes = 1) {
  assureDossier(path.dirname(destination))
  await ffmpeg(['-ss', String(secondes), '-i', source, '-frames:v', '1', '-q:v', '3', destination])
  return destination
}

/** Vérifie que ffmpeg et ffprobe répondent. */
export async function verifieFfmpeg() {
  try {
    const { stdout } = await lanceOuEchoue(FFMPEG, ['-version'])
    const version = stdout.split('\n')[0].replace('ffmpeg version ', '').split(' ')[0]
    await lanceOuEchoue(FFPROBE, ['-version'])
    return { present: true, version }
  } catch (e) {
    journal.detail(e.message)
    return { present: false, version: null }
  }
}
