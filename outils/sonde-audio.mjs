/**
 * Sonde l audio reel des videos qui surperforment, pour repondre a la question que
 * les marqueurs de transcript ne peuvent pas trancher : y a-t-il un FOND SONORE
 * CONTINU sous la voix ?
 *
 *   node outils/sonde-audio.mjs [--n=8] [--duree=90]
 *
 * METHODE. On telecharge un extrait audio au milieu de la video, puis on demande a
 * ffmpeg de detecter les silences sous -45 dB. Un monologue sans musique respire :
 * il produit de nombreux silences courts entre les phrases. Un monologue avec une
 * nappe continue n en produit presque aucun, parce que le plancher sonore ne
 * descend jamais assez bas.
 *
 *   beaucoup de silences  -> voix seule
 *   tres peu de silences  -> fond sonore continu
 *
 * L extrait est efface juste apres la mesure.
 */
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const N = Number(args.n ?? 8)
const DUREE = Number(args.duree ?? 90)

const BRUIT = new RegExp(
  ['lyrics', 'chanson', 'chansons', 'adoration', 'louange', 'gospel', 'worship',
   'tarot', 'astrolog', 'drama', 'ceo', 'movie', 'tortue', 'asmr'].join('|'), 'i')

const dir = 'veille/youtube/raw'
const candidats = readdirSync(dir)
  .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  .filter((j) => j.transcriptLangue === 'fr')
  .filter((j) => !BRUIT.test(j.titre ?? ''))
  .filter((j) => (j.ratioVuesAbonnes ?? 0) >= 2 && (j.vues ?? 0) >= 50000)
  .filter((j) => { const m = (j.dureeS ?? 0) / 60; return m >= 5 && m <= 45 })
  .sort((a, b) => (b.ratioVuesAbonnes ?? 0) - (a.ratioVuesAbonnes ?? 0))
  .slice(0, N)

const tmp = 'veille/youtube/.audio-tmp'
mkdirSync(tmp, { recursive: true })

console.log(`${candidats.length} videos francaises sondees. Extrait de ${DUREE} s pris au milieu.\n`)
console.log('ratio    vues  min   silences  %silence   verdict                titre')

for (const j of candidats) {
  const debut = Math.floor((j.dureeS ?? 600) / 2)
  const out = `${tmp}/${j.id}.wav`

  const dl = spawnSync(
    'yt-dlp',
    ['-f', 'bestaudio', '--quiet', '--no-warnings',
     '--download-sections', `*${debut}-${debut + DUREE}`,
     '-x', '--audio-format', 'wav', '--force-overwrites',
     '-o', `${tmp}/${j.id}.%(ext)s`, `https://www.youtube.com/watch?v=${j.id}`],
    { encoding: 'utf8', timeout: 120000 }
  )
  if (!existsSync(out)) {
    console.log(`  (audio indisponible)  ${(j.titre ?? '').slice(0, 50)}`)
    continue
  }

  // silencedetect : seuil -45 dB, duree minimale 0,35 s (une respiration entre phrases)
  const ff = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', out, '-af', 'silencedetect=noise=-45dB:d=0.35', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 120000 }
  )
  const log = (ff.stderr ?? '') + (ff.stdout ?? '')
  const durees = [...log.matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]))
  const nb = durees.length
  const total = durees.reduce((a, b) => a + b, 0)
  const pct = Math.round((total / DUREE) * 100)

  // Un monologue francais normal respire 15 a 40 fois par 90 secondes.
  const verdict =
    nb === 0 ? 'FOND CONTINU (certain)' :
    nb <= 4 ? 'fond continu probable' :
    nb <= 12 ? 'fond leger ou voix serree' :
    'voix seule, ca respire'

  const k = j.vues >= 1e6 ? (j.vues / 1e6).toFixed(1) + 'M' : Math.round(j.vues / 1000) + 'k'
  console.log(
    `${(j.ratioVuesAbonnes ?? 0).toFixed(1).padStart(6)} ${k.padStart(6)} ${String(Math.round((j.dureeS ?? 0) / 60)).padStart(4)}   ${String(nb).padStart(6)}   ${String(pct).padStart(6)}%   ${verdict.padEnd(24)} ${(j.titre ?? '').slice(0, 46)}`
  )

  rmSync(out, { force: true })
}

rmSync(tmp, { recursive: true, force: true })
console.log('\nExtraits effaces.')
console.log('Lecture : peu de silences = le plancher sonore ne descend jamais, donc fond continu.')
