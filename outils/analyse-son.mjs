/**
 * Analyse la presence de musique et d effets sonores dans les videos de la veille.
 *
 *   node outils/analyse-son.mjs [--ratio=1.5] [--vues=20000]
 *
 * Methode : les transcriptions automatiques de YouTube inserent des marqueurs
 * [Musique], [Applaudissements], [Rires] quand le systeme detecte autre chose que
 * de la parole. C est un proxy imparfait mais reel, et il porte sur tout le corpus
 * sans rien retelecharger.
 *
 * LIMITE ASYMETRIQUE, a garder en tete : la PRESENCE d un marqueur est fiable,
 * l ABSENCE ne l est pas. Une nappe discrete sous une voix continue n est jamais
 * marquee, parce que le systeme entend de la parole. Une densite nulle ne signifie
 * donc pas "pas de musique", elle signifie "pas de passage musical sans parole".
 */
import { readFileSync, readdirSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('='))
)
const SEUIL_RATIO = Number(args.ratio ?? 1.5)
const SEUIL_VUES = Number(args.vues ?? 20000)

const MARQUEURS = {
  musique: /\[\s*(musique|music|música|musik)\s*\]/gi,
  applaudissements: /\[\s*(applaudissements|applause)\s*\]/gi,
  rires: /\[\s*(rires|laughter|laughs)\s*\]/gi,
}

// Filtre de bruit elargi apres une premiere passe qui laissait passer des dramas
// asiatiques, des films, du contenu religieux et des quiz.
const BRUIT = new RegExp(
  [
    'nollywood', 'nigerian movie', 'full movie', 'full episode', 'episode \\d',
    'drama', 'cdrama', 'kdrama', 'chinese drama', 'korean',
    'ceo', 'mafia', 'billionaire', 'arranged marriage', 'contract love',
    'tarot', 'tirage', 'voyance', 'astrolog', 'numerolog', 'horoscope',
    'roblox', 'brookhaven', 'zee magic', 'minecraft',
    'adoration', 'louange', 'priere', 'prière', 'sermon', 'gospel', 'worship', 'bible',
    'asmr', 'sleep', 'fall asleep', 'lofi', 'relaxing',
    'street interview', 'face-off', 'quiz will expose', 'personality test 👀',
    'wizzy gang', 'polyamory',
  ].join('|'),
  'i'
)

const dir = 'veille/youtube/raw'
const toutes = []

for (const f of readdirSync(dir)) {
  const j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
  if (!j.transcript) continue
  const titre = j.titre ?? ''
  if (BRUIT.test(titre)) continue
  // On garde le francais et l anglais : ce sont nos marches.
  if (!['fr', 'en'].includes(j.transcriptLangue)) continue
  // Au-dela de 90 minutes, c est un film ou un livre audio, pas notre format.
  const minutes = (j.dureeS ?? 0) / 60
  if (minutes > 90 || minutes < 2) continue

  const t = j.transcript
  const compte = {}
  for (const [nom, re] of Object.entries(MARQUEURS)) compte[nom] = (t.match(re) ?? []).length

  toutes.push({
    id: j.id,
    titre: titre.slice(0, 58),
    vues: j.vues ?? 0,
    ratio: j.ratioVuesAbonnes ?? 0,
    minutes: Math.round(minutes),
    langue: j.transcriptLangue,
    ...compte,
    densite: +(compte.musique / minutes).toFixed(2),
  })
}

const surperf = toutes.filter((l) => l.ratio >= SEUIL_RATIO && l.vues >= SEUIL_VUES)
const reste = toutes.filter((l) => !(l.ratio >= SEUIL_RATIO && l.vues >= SEUIL_VUES))

const pct = (arr, champ) =>
  arr.length ? `${Math.round((arr.filter((l) => l[champ] > 0).length / arr.length) * 100)} %` : '0 %'
const medDens = (arr) => {
  const s = arr.map((l) => l.densite).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

console.log(`Corpus retenu : ${toutes.length} videos (fr et en, 2 a 90 min, hors bruit).`)
console.log(`Surperformantes : ratio >= ${SEUIL_RATIO} et vues >= ${SEUIL_VUES} → ${surperf.length}\n`)

console.log('                        SURPERF.   LE RESTE')
for (const c of ['musique', 'applaudissements', 'rires']) {
  console.log(`  ${c.padEnd(20)} ${pct(surperf, c).padStart(7)}   ${pct(reste, c).padStart(7)}`)
}
console.log(`  densite musique/min ${String(medDens(surperf)).padStart(7)}   ${String(medDens(reste)).padStart(7)}  (medianes)`)

// La distinction qui compte : le format court emotionnel et le format long explicatif
// n ont pas du tout le meme rapport a la musique.
console.log('\n─── Par tranche de duree, chez les surperformantes ───')
console.log('tranche        n    % avec musique   densite mediane')
const TRANCHES = [
  ['2 a 8 min', 2, 8],
  ['8 a 16 min', 8, 16],
  ['16 a 30 min', 16, 30],
  ['30 a 90 min', 30, 90],
]
for (const [nom, min, max] of TRANCHES) {
  const g = surperf.filter((l) => l.minutes >= min && l.minutes < max)
  console.log(`${nom.padEnd(14)} ${String(g.length).padStart(3)}    ${pct(g, 'musique').padStart(9)}        ${medDens(g)}`)
}

console.log('\n─── Surperformantes francaises, triees par ratio ───')
console.log('ratio    vues  min  musq  dens  titre')
for (const l of surperf.filter((x) => x.langue === 'fr').sort((a, b) => b.ratio - a.ratio).slice(0, 20)) {
  const k = l.vues >= 1e6 ? (l.vues / 1e6).toFixed(1) + 'M' : Math.round(l.vues / 1000) + 'k'
  console.log(
    `${l.ratio.toFixed(1).padStart(6)} ${k.padStart(6)} ${String(l.minutes).padStart(4)} ${String(l.musique).padStart(5)} ${String(l.densite).padStart(5)}  ${l.titre}`
  )
}
