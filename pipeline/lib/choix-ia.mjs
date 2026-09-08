/**
 * choix-ia.mjs — DÉCIDER OÙ UN PLAN GÉNÉRÉ SERT LE PLUS.
 *
 * LE COMBLAGE RÉAGISSAIT ; CELUI-CI CHOISIT.
 *
 * `--comble=ia` ne se déclenche que sur le VIDE : plus aucun candidat après la
 * déduplication, la fenêtre de réemploi et les téléchargements ratés. C'était le
 * seul déclencheur honnête tant qu'on ne regardait qu'un plan à la fois — la
 * banque rend presque toujours quelque chose, et « ça ne parle pas du bon
 * sujet » ne se mesure pas (§10, mesuré : une requête absurde a rendu cinq
 * candidats dont un visage sur 25,8 % du cadre).
 *
 * MAIS ON PEUT LIRE LE SCRIPT ENTIER, ET ÇA CHANGE LA QUESTION.
 *
 * On ne demande plus « ce plan-ci est-il hors sujet » — question sans signal —
 * mais « parmi ces trente-six passages, lesquels une banque d'images ne peut
 * PAS servir ». Cette question-là a une réponse, et elle se lit dans le texte :
 *
 *   · un mécanisme abstrait (un algorithme, une clause, un délai qui court) ;
 *   · un objet ou un chiffre précis que personne n'a filmé ;
 *   · une émotion nommée, à un instant nommé, sur un visage ;
 *   · une image que le script construit lui-même — une métaphore, une scène qui
 *     n'existe que dans la phrase.
 *
 * Et symétriquement, ce qu'une banque sert TRÈS bien — une rue, un bureau, des
 * mains sur un clavier, quelqu'un qui marche — ne doit pas être payé.
 *
 * CE MODULE NE GÉNÈRE RIEN ET NE DÉPENSE RIEN. Il rend une liste de numéros de
 * plan avec, pour chacun, la raison et une requête réécrite. La génération, son
 * plafond et son devis restent où ils étaient.
 *
 * LE BUDGET EST UN PLAFOND, PAS UNE CIBLE. Rendre moins de plans que le budget
 * est un résultat valide et c'est même le résultat souhaitable : dépenser cinq
 * générations sur une vidéo dont la banque couvre tout serait exactement le
 * gaspillage qu'on cherche à éviter.
 */

import { demandeJson, cerveauDisponible, cout } from './cerveau.mjs'
import { journal } from './journal.mjs'

/** Ce qu'on montre du script au modèle, au plus. Un script de dix minutes tient. */
const TEXTE_MAX = 12_000

const CONSIGNE = `Tu es monteur vidéo. On te donne le texte d'une vidéo et la liste de ses
plans de coupe : pour chaque plan, l'instant, la phrase prononcée à ce moment-là, et la requête
en anglais qui sera envoyée à une banque d'images (Pexels).

Tu dois désigner les plans où une VIDÉO GÉNÉRÉE vaudrait mieux qu'un plan de banque.

Une banque d'images sert très bien : les lieux, les gestes ordinaires, les ambiances, les
objets courants, les gens qui marchent, travaillent, se parlent. Ne dépense rien là-dessus.

Une banque d'images ne sert PAS :
- un mécanisme abstrait que le texte explique (un calcul, une règle, un enchaînement de causes) ;
- un objet, un chiffre ou une situation précise que le texte nomme et que personne n'a filmé ;
- une émotion nommée à un instant nommé, quand c'est le visage qui porte le propos ;
- une image que le texte fabrique lui-même : une métaphore, une comparaison, une scène imaginée.

Commence par comprendre DE QUOI PARLE LA VIDÉO dans son ensemble : les plans doivent se
répondre. Évite d'en choisir deux qui se suivent — deux plans générés côte à côte se
remarquent — et répartis-les sur la durée.

Pour chaque plan retenu, écris une requête en ANGLAIS décrivant un plan filmable : le sujet, ce
qu'il fait, le cadre, la lumière. Une seule action — le plan dure cinq secondes, mais N'ÉCRIS PAS
la durée dans la requête, elle est réglée ailleurs. Pas de texte à l'écran, pas de marque, pas de
personnalité réelle, pas de nom de plateforme.

Réponds UNIQUEMENT en JSON :
{"sujet":"de quoi parle la vidéo, une phrase en français",
 "plans":[{"n":3,"pourquoi":"en français, une ligne","requete":"prompt en anglais"}]}

N'en retiens JAMAIS plus que le budget annoncé. En retenir MOINS est un bon résultat : si la
banque peut tout servir, rends une liste vide.`

/**
 * Les plans où la génération sert le plus, dans la limite du budget.
 *
 * @returns {Promise<{sujet: string|null, choix: Map<object, {pourquoi: string, requete: string}>}>}
 *   la clé de la Map est L'ÉVÉNEMENT LUI-MÊME. Un rang aurait obligé les deux
 *   modules à refiltrer la même liste avec les mêmes critères, et une
 *   divergence d'un cran aurait généré un plan payant au mauvais endroit.
 */
export async function choisitLesPlansAGenerer(evenements, { budget, script, mots = [] }) {
  const vide = { sujet: null, choix: new Map() }
  if (!Number.isFinite(budget) || budget < 1) return vide

  // Les plans de coupe encore à résoudre — ceux qui ont une requête et pas de
  // fichier. Un plan posé à la main n'est pas à générer, et un insert non plus.
  const candidats = evenements
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === 'broll' && !e.src && e.requete)
  if (!candidats.length) return vide

  if (!(await cerveauDisponible())) {
    journal.attention(
      `Choix des plans à générer : aucune clé Claude ni fal pour lire le script. ` +
        `On retombe sur le comblage — l'IA ne servira que là où la banque ne rend rien.`
    )
    return vide
  }

  // LE TEXTE ENTIER, PAS SEULEMENT LES ANCRES.
  //
  // « Comprendre de quoi il parle globalement » est la demande, et une liste
  // d'ancres de trois mots ne le permet pas : « le fameux délai », « ce
  // chiffre-là » ne veulent rien dire hors de leur paragraphe.
  const texte = (script?.blocs ?? [])
    .map((b) => String(b.texte ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, TEXTE_MAX)

  // Ce qui est DIT pendant le plan, quand on a les mots calés. À défaut, l'ancre.
  const ditPendant = (e) => {
    const debut = e.debutMs ?? 0
    const fin = e.dureeMs != null ? debut + e.dureeMs : debut + 4000
    const m = mots
      .filter((x) => (x.debutMs ?? 0) < fin && (x.finMs ?? 0) > debut)
      .map((x) => x.texte)
      .join(' ')
      .trim()
    return m || e.ancre || ''
  }

  const liste = candidats.map(({ e }, rang) => ({
    n: rang + 1,
    a: Math.round((e.debutMs ?? 0) / 1000),
    dit: ditPendant(e),
    requete: e.requete,
  }))

  // L'OUVERTURE SE NOMME, SINON DEUX CONSIGNES SE CONTREDISENT.
  //
  // `promptDePlan` ajoute au PREMIER plan de coupe « gros plan de visage, avec
  // l'émotion lisible dans les yeux » — c'est le §10, et c'est ce qui décide si
  // les trente suivants seront vus. Si le modèle propose des rouages pour ce
  // plan-là, la requête finale demande des rouages ET un visage : le générateur
  // en fait ce qu'il veut, et on paie un plan qui n'est ni l'un ni l'autre.
  //
  // L'ouverture est le plan de coupe le plus TÔT de toute la vidéo — pas le
  // premier de cette liste : sur un remontage, les plans déjà rapatriés n'y sont
  // plus.
  const premier = evenements
    .filter((e) => e.type === 'broll')
    .reduce((a, e) => (a === null || (e.debutMs ?? 0) < (a.debutMs ?? 0) ? e : a), null)
  const rangOuverture = candidats.findIndex(({ e }) => e === premier) + 1

  const question =
    `Budget : ${budget} plan(s) générés au maximum.\n\n` +
    (rangOuverture > 0
      ? `Le plan n° ${rangOuverture} est L'OUVERTURE de la vidéo. Si tu le retiens, sa requête ` +
        `DOIT décrire un gros plan de visage humain portant l'émotion du passage : c'est le seul ` +
        `plan dont dépend le fait que les autres soient vus.\n\n`
      : '') +
    `TEXTE DE LA VIDÉO\n${texte || '(non disponible)'}\n\n` +
    `PLANS DE COUPE (n · seconde · ce qui est dit · requête banque)\n` +
    liste
      .map(
        (p) =>
          `${p.n} · ${p.a}s · « ${p.dit} » · ${p.requete}` +
          (p.n === rangOuverture ? ' · OUVERTURE' : '')
      )
      .join('\n')

  let valeur, jetons
  try {
    ;({ valeur, jetons } = await demandeJson(CONSIGNE, question, { max: 2000 }))
  } catch (err) {
    // UN CHOIX QUI RATE NE DOIT PAS ARRÊTER LE MONTAGE.
    //
    // Le reste — banque, comblage, rendu — n'en dépend pas. On perd la
    // sélection, pas la vidéo, et on le dit plutôt que de laisser croire que
    // les plans générés sont ceux qu'on a demandés.
    journal.attention(`Choix des plans à générer impossible : ${err.message.split('\n')[0]}`)
    return vide
  }

  const prix = cout(jetons)
  if (prix != null) journal.detail(`lecture du script : ${(prix * 100).toFixed(2)} centime(s)`)

  const choix = new Map()
  for (const p of Array.isArray(valeur?.plans) ? valeur.plans : []) {
    // UN NUMÉRO INVENTÉ NE DOIT PAS DÉPLACER UN PLAN.
    //
    // Le modèle peut rendre un `n` hors bornes, un doublon, ou une requête vide.
    // Chacun coûterait une génération posée au mauvais endroit — donc payée et
    // fausse. On jette, on ne rattrape pas.
    const n = Number(p?.n)
    const requete = String(p?.requete ?? '').trim()
    if (!Number.isInteger(n) || n < 1 || n > candidats.length) continue
    if (!requete) continue
    const cle = candidats[n - 1].e
    if (choix.has(cle)) continue
    choix.set(cle, {
      rang: n,
      pourquoi: String(p?.pourquoi ?? '').trim() || null,
      requete,
    })
    if (choix.size >= budget) break
  }

  const sujet = String(valeur?.sujet ?? '').trim() || null
  if (sujet) journal.detail(`sujet lu : ${sujet}`)
  if (!choix.size) {
    journal.info(
      `Aucun plan ne réclame de génération : la banque couvre le montage. ` +
        `Rien ne sera dépensé de ce côté.`
    )
  } else {
    journal.ok(
      `${choix.size} plan(s) à générer sur ${budget} autorisé(s) — ` +
        [...choix.values()]
          .map((c) => `n° ${c.rang}${c.pourquoi ? ` (${c.pourquoi})` : ''}`)
          .join(', ')
    )
  }
  return { sujet, choix }
}
