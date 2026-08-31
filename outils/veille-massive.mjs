/**
 * Veille massive : 200 requetes, FR et EN, sur les trois hubs et les quatre intentions.
 * Lance le pipeline par lots pour eviter les limites de longueur de ligne de commande
 * et pour garder de la visibilite sur l avancement.
 *
 *   node outils/veille-massive.mjs [--lot=N] [--taille=10] [--depart=0]
 *
 * Tri par pertinence volontairement : le tri par vues ramene des films et des dramas
 * de deux heures sur les requetes larges, ce qui pollue la base.
 */
import { spawnSync } from 'node:child_process'

const REQUETES = {
  // ─────────────────────────────────────────────────────────────────────
  'FR · H1 pourquoi ca n a jamais marche': [
    'pourquoi mes relations ne durent pas',
    "pourquoi je n'arrive pas à trouver l'amour",
    "relation qui s'arrête au bout de 3 mois",
    'pourquoi ça ne marche jamais en amour',
    'je tombe toujours sur les mêmes personnes',
    'pourquoi je reproduis les mêmes schémas amoureux',
    "s'aimer ne suffit pas",
    "on s'aimait mais ça n'a pas marché",
    'rupture sans raison apparente',
    "pourquoi une relation s'essouffle",
    "signes d'incompatibilité en couple",
    'incompatibilité de caractère couple',
    'comprendre ses échecs amoureux',
    "je n'ai jamais eu de relation longue",
    'pourquoi mes histoires ne durent pas',
    'schéma répétitif amour',
    "on m'a dit que j'étais trop exigeant",
    'suis-je le problème dans mes relations',
    'pourquoi je fais fuir les gens',
    "relation qui s'éteint doucement",
    'rupture sans coupable',
    'différence de valeurs couple',
    'pourquoi on se sépare après plusieurs années',
    "style d'attachement évitant",
    "style d'attachement anxieux",
    "théorie de l'attachement critique",
    "blessure d'abandon relation",
    "peur de l'engagement explication",
    "je n'y crois plus en amour",
    "j'ai abandonné l'idée de trouver quelqu'un",
  ],
  // ─────────────────────────────────────────────────────────────────────
  'FR · H2 compatibilite mesuree': [
    'compatibilité amoureuse',
    'test de compatibilité couple',
    'comment savoir si on est compatible',
    'compatibilité de personnalité',
    'big five personnalité',
    'modèle ocean personnalité',
    'test de personnalité fiable',
    'mbti fiabilité scientifique',
    'mbti vs big five',
    'les 5 traits de personnalité',
    'attirance ou compatibilité',
    'différence attirance amour',
    "les opposés s'attirent vrai ou faux",
    'faut-il chercher quelqu un qui nous ressemble',
    'valeurs communes couple importance',
    "qu'est-ce qui fait durer un couple",
    'ce qui fait tenir un couple sur la durée',
    "prédire la réussite d'un couple",
    "science de l'amour couple",
    'psychologie de la compatibilité',
    'algorithme de compatibilité amoureuse',
    'site de rencontre par affinités',
    'rencontre par personnalité',
    'test de personnalité amour',
    'connaître sa personnalité amoureuse',
    'empathie ou hypersensibilité',
    'différence empathie sensibilité',
    'extraversion introversion couple',
    'couple introverti extraverti',
    'conscienciosité couple',
  ],
  // ─────────────────────────────────────────────────────────────────────
  'FR · H3 applis et usure': [
    'applications de rencontre problème',
    'pourquoi les applications de rencontre ne marchent pas',
    "j'ai supprimé les applications de rencontre",
    'arrêter les applications de rencontre',
    'tinder ne marche pas pour moi',
    'fatigue des applications de rencontre',
    'prix applications de rencontre',
    'combien coûte tinder',
    'abonnement application de rencontre vaut le coup',
    'comparatif applications de rencontre',
    'meilleure application de rencontre relation sérieuse',
    'application de rencontre sérieuse',
    'alternative aux applications de rencontre',
    'rencontrer quelqu un sans application',
    'rencontrer quelqu un dans la vraie vie',
    'où rencontrer quelqu un quand on travaille',
    'rencontrer quelqu un quand on est timide',
    'rencontrer quelqu un quand on ne sort pas',
    'je déteste les applications de rencontre',
    'ghosting explication',
    'pourquoi on se fait ghoster',
    'conversations qui s éteignent application',
    'paradoxe du choix amour',
    'swipe fatigue',
    'burn out amoureux',
  ],
  // ─────────────────────────────────────────────────────────────────────
  'FR · viral et emotionnel': [
    'célibataire depuis longtemps',
    'célibat subi',
    'solitude affective',
    "j'ai peur de finir seul",
    'amour génération',
    "l'amour n'existe plus",
    'les relations modernes',
    'pourquoi les couples ne durent plus aujourd hui',
    'génération célibataire',
    'dating moderne critique',
    'relations amoureuses 2026',
    'difficile de trouver quelqu un de sérieux',
    'les gens ne s engagent plus',
    'amour et réseaux sociaux',
    "pourquoi c'est si dur de trouver l'amour",
  ],
  // ─────────────────────────────────────────────────────────────────────
  'EN · H1 why it never worked': [
    'why my relationships never last',
    'why do i keep failing in relationships',
    'why relationships end after 3 months',
    'why do i attract the wrong partners',
    'repeating patterns in relationships',
    'love is not enough relationship',
    'we loved each other but it didnt work',
    'relationship slowly fading',
    'breakup with no reason',
    'why couples drift apart',
    'signs of incompatibility',
    'incompatible personalities relationship',
    'understanding past relationship failures',
    'never had a long relationship',
    'am i the problem in my relationships',
    'why do i push people away',
    'relationship ended without a fight',
    'mismatched values relationship',
    'avoidant attachment style',
    'anxious attachment style',
    'attachment theory criticism',
    'fear of commitment explained',
    'i gave up on love',
    'i stopped believing in love',
    'chronically single reasons',
    'why is dating so hard now',
    'dating fatigue',
    'emotionally unavailable partners',
    'why nice people stay single',
    'relationship red flags you miss early',
  ],
  // ─────────────────────────────────────────────────────────────────────
  'EN · H2 measured compatibility': [
    'relationship compatibility test',
    'how to know if you are compatible',
    'personality compatibility',
    'big five personality traits',
    'ocean model personality',
    'most accurate personality test',
    'mbti is not scientific',
    'mbti vs big five',
    'big five relationships research',
    'attraction vs compatibility',
    'do opposites attract science',
    'similarity vs complementarity relationships',
    'what makes relationships last',
    'gottman predicting divorce',
    'science of lasting love',
    'psychology of compatibility',
    'matching algorithm dating',
    'personality based dating app',
    'how dating algorithms work',
    'conscientiousness relationships',
    'neuroticism relationship satisfaction',
    'agreeableness in relationships',
    'introvert extrovert couple',
    'empathy vs sensitivity difference',
    'highly sensitive person relationships',
    'shared values relationship importance',
    'personality test for love',
    'know your personality type love',
    'relationship science research',
    'what predicts relationship success',
  ],
  // ─────────────────────────────────────────────────────────────────────
  'EN · H3 apps and attrition': [
    'why dating apps dont work',
    'dating apps are broken',
    'deleting dating apps',
    'quitting dating apps',
    'dating app burnout',
    'dating apps business model',
    'dating apps designed to keep you single',
    'tinder cost worth it',
    'dating app subscription worth it',
    'best dating app for serious relationship',
    'dating app comparison',
    'alternative to dating apps',
    'how to meet someone without apps',
    'meeting people in real life',
    'how to meet someone when you work a lot',
    'how to meet someone as an introvert',
    'i hate dating apps',
    'ghosting explained psychology',
    'why do people ghost',
    'paradox of choice dating',
    'swipe fatigue',
    'online dating statistics',
    'modern dating is broken',
    'dating apps ruined romance',
    'dating app addiction',
  ],
  // ─────────────────────────────────────────────────────────────────────
  'EN · viral and emotional': [
    'chronically single',
    'loneliness in your 30s',
    'afraid of ending up alone',
    'modern relationships are different',
    'why nobody commits anymore',
    'situationship explained',
    'dating in 2026',
    'why finding love is so hard now',
    'hookup culture damage',
    'social media ruined dating',
    'men and women dating divide',
    'single and tired of dating',
    'dating advice that actually works',
    'relationship experts wrong',
    'love in the age of apps',
  ],
}

const toutes = Object.values(REQUETES).flat()
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)

const TAILLE_LOT = 25
const parRequete = Number(args.taille ?? 10)
const depart = Number(args.depart ?? 0)

const lots = []
for (let i = depart; i < toutes.length; i += TAILLE_LOT) {
  lots.push(toutes.slice(i, i + TAILLE_LOT))
}

const lotsAFaire = args.lot != null ? [lots[Number(args.lot)]] : lots

console.log(`${toutes.length} requetes au total, ${lots.length} lot(s) de ${TAILLE_LOT}.`)
console.log(`${parRequete} videos par requete, soit ~${toutes.length * parRequete} videos.`)
console.log(`Cout estime : ~${(toutes.length * parRequete * 0.004).toFixed(2)} $\n`)

let n = 0
for (const lot of lotsAFaire) {
  if (!lot) continue
  n += 1
  console.log(`\n═══ LOT ${n}/${lotsAFaire.length} · ${lot.length} requetes ═══`)
  const r = spawnSync(
    process.execPath,
    ['pipeline/veille-youtube.mjs', ...lot, `--par-requete=${parRequete}`, '--oui'],
    { stdio: 'inherit', encoding: 'utf8' }
  )
  if (r.status !== 0) console.log(`  ! lot ${n} termine avec le code ${r.status}, on continue`)
}

console.log('\nVeille massive terminee.')
