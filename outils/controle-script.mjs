/**
 * Controle automatique d un script avant tournage.
 *
 *   node outils/controle-script.mjs <slug>
 *
 * Verifie ce qui se verifie mecaniquement : conformite au format attendu par le
 * pipeline, duree estimee, cadence visuelle, syntaxe, voix, mots interdits.
 * Ne remplace pas la lecture a voix haute, qui reste le seul vrai test.
 */
import { readFileSync, existsSync } from 'node:fs'

const slug = process.argv[2]
if (!slug) {
  console.error('usage : node outils/controle-script.mjs <slug>')
  process.exit(1)
}
const chemin = `videos/${slug}/01-script.json`
if (!existsSync(chemin)) {
  console.error(`introuvable : ${chemin}`)
  process.exit(1)
}

const s = JSON.parse(readFileSync(chemin, 'utf8'))
const court = s.format.startsWith('short')
let erreurs = 0
const ko = (m) => {
  console.log('  ✗ ' + m)
  erreurs++
}

// ── Conformite au contrat du pipeline ───────────────────────────────────────
if (s.slug !== slug) ko(`slug du fichier (${s.slug}) different du dossier (${slug})`)
const hooks = s.blocs.filter((b) => b.role === 'hook')
if (hooks.length !== 1) ko(`${hooks.length} bloc(s) de role hook, il en faut exactement 1`)
const ids = s.blocs.map((b) => b.id)
if (new Set(ids).size !== ids.length) ko('ids de blocs non uniques')
if (!(s.niveau_conscience >= 1 && s.niveau_conscience <= 5)) ko('niveau_conscience hors bornes')

// Un mot-cle qui repete ce que la voix dit AU MEME INSTANT s affiche en double a
// l ecran : une fois dans la surcouche, une fois dans le sous-titre mot a mot qui
// tourne en permanence. Le spectateur lit deux fois la meme chose et l ecran est
// charge pour rien. Un mot-cle doit dire ce que la voix NE DIT PAS : une
// reformulation, une etiquette, un contrepoint.
const sansAccent = (x) =>
  String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

for (const b of s.blocs) {
  for (const v of b.visuel ?? []) {
    if (v.ancre && !b.texte.includes(v.ancre)) ko(`bloc ${b.id} : ancre absente du texte, "${v.ancre}"`)
    if (v.type === 'mot-cle' && v.ancre && v.texte) {
      const t = sansAccent(v.texte)
      const a = sansAccent(v.ancre)
      if (t && (t === a || a.includes(t) || t.includes(a))) {
        ko(`bloc ${b.id} : mot-clé « ${v.texte} » répète la voix, il s'affichera en double avec le sous-titre`)
      }
    }
    if (v.type === 'mot-cle' && (v.position ?? 'bas') === 'bas') {
      ko(`bloc ${b.id} : mot-clé « ${v.texte} » en position basse, il chevauche les sous-titres`)
    }
  }
  if (b.role === 'corps' && (b.visuel ?? []).some((v) => v.type === 'transition')) {
    ko(`bloc ${b.id} : transition dans un bloc corps, le pipeline la refuse`)
  }
}

// ── Forme des infographies ──────────────────────────────────────────────────
// CE CONTROLE MANQUAIT, ET IL A COUTE TROIS RENDUS.
//
// Une infographie mal formee passe tout le pipeline sans un mot : le montage la
// recopie telle quelle, et c'est Remotion qui tombe, apres plusieurs minutes de
// calcul, sur un « Cannot read properties of undefined ». Le contrat est dans
// remotion/src/types.ts ; on le verifie ici, ou il coute une seconde.
const FORMES_INFOGRAPHIE = {
  liste: ['items'],
  pastilles: ['items'],
  takeover: ['mot'],
  citation: ['texte', 'source'],
  'avant-apres': ['avant', 'apres'],
  comparaison: ['gauche', 'droite'],
  chronologie: ['etapes'],
  barres: ['series'],
}

for (const b of s.blocs) {
  for (const v of b.visuel ?? []) {
    if (v.type !== 'infographie') continue
    const attendus = FORMES_INFOGRAPHIE[v.modele]
    if (!attendus) {
      ko(`bloc ${b.id} : modele d'infographie inconnu « ${v.modele} » — attendu ${Object.keys(FORMES_INFOGRAPHIE).join(' · ')}`)
      continue
    }
    if (!v.donnees || typeof v.donnees !== 'object') {
      ko(`bloc ${b.id} : infographie « ${v.modele} » sans bloc "donnees" (champs a plat comme "items" ou "titre" : ils sont ignores)`)
      continue
    }
    for (const champ of attendus) {
      if (v.donnees[champ] === undefined) {
        ko(`bloc ${b.id} : infographie « ${v.modele} » — "donnees.${champ}" manquant`)
      }
    }
  }
}

// ── Duree et cadence ────────────────────────────────────────────────────────
const texte = s.blocs.map((b) => b.texte).join(' ').replace(/\[pause\]/g, ' ')
const mots = texte.split(/\s+/).filter(Boolean).length
const DEBIT = court ? 210 : 155
const pauses = s.blocs.reduce((a, b) => a + (b.pause_apres_ms ?? 0), 0) / 1000
const duree = (mots / DEBIT) * 60 + pauses
const ecart = Math.abs(duree - s.duree_cible_s) / s.duree_cible_s
const evts = s.blocs.flatMap((b) => b.visuel ?? [])
const cadence = duree / evts.length

// ── Syntaxe ─────────────────────────────────────────────────────────────────
// C est elle qui fait la fluidite. Une suite de phrases courtes est du telegramme.
// LE CTA EST INCLUS DANS LA MESURE : la fluidite ne s arrete pas a l appel a
// l action. Un CTA en style administratif casse tout ce que la video a construit.
const phrases = s.blocs
  .map((b) => b.texte)
  .join(' ')
  .replace(/\[pause\]/g, ' ')
  .split(/(?<=[.!?])\s+/)
  .filter((p) => p.trim().split(/\s+/).length > 2)
const lg = phrases.map((p) => p.trim().split(/\s+/).length)
const moy = lg.reduce((a, b) => a + b, 0) / lg.length
const courtes = lg.filter((x) => x < 10).length

// ── Voix ────────────────────────────────────────────────────────────────────
// La direction artistique impose l impersonnel PARTOUT SAUF dans le bloc cta :
// une action se demande a quelqu un, donc l adresse directe y est autorisee.
// Les elisions comptent : « t'est envoye » est une adresse, « j'ai » une premiere personne.
const horsCta = s.blocs.filter((b) => b.id !== 'cta').map((b) => b.texte).join(' ')
// `\b` DE JAVASCRIPT NE CONNAIT QUE L ASCII, ET C EST UN PIEGE EN FRANCAIS.
//
// Dans « memes », le caractere accentue compte comme une frontiere de mot :
// /\bmes\b/ y trouvait donc « mes » et signalait une premiere personne
// inexistante. Meme chose pour « ame », « ta » dans « etat », et tous les mots
// ou une lettre accentuee precede un des pronoms cherches.
//
// Les bornes Unicode explicites regardent la vraie lettre precedente.
const MOT = (liste) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${liste})(?![\\p{L}\\p{N}])`, 'giu')
const ELISION = (lettre) => new RegExp(`(?<![\\p{L}\\p{N}])${lettre}'`, 'giu')

const p1 = [
  ...(horsCta.match(MOT('je|moi|mon|ma|mes')) ?? []),
  ...(horsCta.match(ELISION('j')) ?? []),
]
const p2 = [
  ...(horsCta.match(MOT('tu|toi|ton|ta|tes')) ?? []),
  ...(horsCta.match(ELISION('t')) ?? []),
]
const ctaTexte = s.blocs.find((b) => b.id === 'cta')?.texte ?? ''
const ctaAdresse =
  (ctaTexte.match(MOT('tu|toi|ton|ta|tes')) ?? []).length +
  (ctaTexte.match(ELISION('t')) ?? []).length

// ── Interdits ───────────────────────────────────────────────────────────────
const INTERDITS = ['ton tour viendra', 'il faut y croire', 'lâche prise', 'aime-toi', 'travaille sur toi',
  'sois patient', 'reste positif', 'âme sœur', 'le meilleur est à venir', 'zone de confort',
  'astuce', 'hack', 'révolutionnaire', 'tu dois', 'il faut que tu']
const trouves = INTERDITS.filter((m) => texte.toLowerCase().includes(m))

// ── Sortie ──────────────────────────────────────────────────────────────────
console.log(`\nCONTRÔLE · ${slug} · ${s.format}\n`)
console.log(`  mots                  ${mots}`)
console.log(`  durée estimée         ${duree.toFixed(1)} s à ${DEBIT} mots/min   (cible ${s.duree_cible_s} s, écart ${(ecart * 100).toFixed(0)} %)`)
console.log(`  événements visuels    ${evts.length}, un toutes les ${cadence.toFixed(1)} s`)
console.log('')
console.log(`  phrases (CTA inclus)  ${phrases.length}`)
console.log(`  longueur moyenne      ${moy.toFixed(1)} mots        (cible 18 à 28)`)
console.log(`  plus courte           ${Math.min(...lg)} mots`)
console.log(`  phrases sous 10 mots  ${courtes}              (cible 0)`)
console.log('')
console.log(`  première personne     ${p1.length ? p1.join(', ') : 'aucune'}   (hors CTA)`)
console.log(`  adresse « tu »        ${p2.length ? p2.join(', ') : 'aucune'}   (hors CTA)`)
console.log(`  adresse dans le CTA   ${ctaAdresse} ${ctaAdresse ? '(autorisée, une action se demande à quelqu\'un)' : ''}`)
console.log(`  mots interdits        ${trouves.length ? trouves.join(', ') : 'aucun'}`)

if (ecart > 0.25) ko('durée hors de la tolérance de 25 %')
if (cadence > 4) ko('cadence visuelle trop lente')
if (cadence < 1.5) ko('cadence visuelle trop rapide, ça va clignoter')
if (moy < 18) ko(`phrases trop courtes en moyenne (${moy.toFixed(1)}), le texte sera haché`)
if (moy > 32) ko(`phrases trop longues en moyenne (${moy.toFixed(1)}), impossible à dire d'une traite`)
if (courtes > 0) ko(`${courtes} phrase(s) sous 10 mots, ça casse le flux. Le CTA n'y échappe pas.`)
if (p1.length) ko('première personne détectée hors CTA, la direction artistique impose l\'impersonnel')
if (p2.length) ko('adresse « tu » détectée hors CTA, elle n\'est autorisée que dans le bloc cta')
if (trouves.length) ko('mots interdits du Marketeur détectés')

console.log(`\n${erreurs === 0 ? '✓ Le script passe tous les contrôles.' : `✗ ${erreurs} problème(s) à corriger.`}`)
console.log('\nCe contrôle ne remplace pas la lecture à voix haute : si une phrase bloque en la')
console.log('disant, elle est à réécrire même si elle passe ici.')
process.exit(erreurs === 0 ? 0 : 1)
