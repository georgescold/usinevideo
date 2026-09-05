/**
 * persona.mjs — l'identité d'un avatar : sa façon de jouer.
 *
 * LE SIGNE TIENT LE VISAGE. IL NE TIENT PAS LA PERSONNE.
 *
 * « mèche orange sur le devant, la quarantaine » suffit à ce qu'on reconnaisse
 * un visage d'un plan à l'autre. Il ne dit rien de ce qui fait qu'on reconnaît
 * quelqu'un : sa gestuelle, sa façon de regarder l'objectif ou de le fuir, ce
 * que son visage fait quand elle doute, son rythme.
 *
 * Sans ça, chaque génération invente un tempérament. Une vidéo la montre
 * expansive, la suivante réservée, et l'abonné ne construit jamais de
 * personnage — il voit une inconnue qui a le même visage. Sur une chaîne dont
 * l'avatar EST la marque, c'est le défaut le plus coûteux : il ne se voit pas
 * sur un plan, il se voit sur dix.
 *
 * ELLE SE DÉDUIT UNE FOIS, PUIS ELLE NE BOUGE PLUS.
 *
 * C'est tout l'intérêt, et c'est aussi le piège à éviter. Une identité
 * régénérée à chaque vidéo n'est pas une identité : c'est un tirage au sort qui
 * se répète. Elle est donc écrite dans `avatar.json` à la première déduction,
 * et relue ensuite — jusqu'à ce qu'on la change à la main, ce qui est le geste
 * qui doit rester possible.
 *
 * DEUX LANGUES, ET CE N'EST PAS UN DOUBLON.
 *
 * Le français est la version qu'on lit et qu'on corrige (c'est la langue de
 * travail du dossier) ; l'anglais est celle qui part dans les prompts, où le
 * français donne des résultats nettement plus pauvres. La seconde se redéduit
 * dès que la première change — `identite_source` retient le texte à partir
 * duquel la traduction a été faite, et un écart la rend périmée.
 */

import path from 'node:path'

import { CHEMINS, litJson, ecritJson } from './chemins.mjs'
import { journal } from './journal.mjs'
import { televerse, vision, travailFal } from './fal.mjs'

/**
 * Les axes qu'une identité doit couvrir — l'ordre est celui du prompt.
 *
 * UNE PERSONNALITÉ EST UNE AMPLITUDE, PAS UNE EXPRESSION.
 *
 * La première version demandait « son expression faciale » au singulier, et
 * rendait un visage figé qu'on aurait collé sur chaque plan. C'est le même
 * défaut que le sourire par défaut, pris par l'autre bout : trente plans d'une
 * même mine sont un diaporama, qu'elle soit souriante ou impassible.
 *
 * On demande donc un tempérament, puis la façon dont il se DÉCLINE selon ce qui
 * arrive — la surprise, le doute, l'agacement, l'enthousiasme. C'est la
 * variation qui fait reconnaître quelqu'un, pas la constance d'une mine.
 */
const AXES = [
  'her temperament in two or three words, as an archetype',
  'the way she carries herself: posture, how much space she takes',
  'her gestures: what her hands do, how wide and how often they move',
  'her gaze: how she takes the lens, when she breaks away, how abruptly',
  'HOW HER FACE VARIES across at least four different states — enthusiasm, ' +
    'surprise, doubt, irritation — each described differently. Not one ' +
    'expression: a range she plays across',
  'her rhythm and energy level, and how it changes within a single shot',
  // L'EXCENTRICITÉ EST UN TIC, PAS UN ADJECTIF.
  //
  // Demander « excentrique » dans le registre rendait « électrique, solaire » —
  // de l'énergie, pas de la singularité. Un modèle ne fabrique pas un travers
  // s'il n'est pas nommé. Ce tic est au JEU ce que le signe distinctif est au
  // visage : le détail auquel on la reconnaît quand tout le reste change.
  'ONE signature quirk that is hers alone — a small, odd, repeatable physical ' +
    'habit a viewer would notice twice and remember. Something specific, not ' +
    '"she is expressive"',
]

/**
 * Ce que la CHAÎNE sait, et qui pèse plus qu'une photo.
 *
 * Une identité déduite d'un seul portrait est le portrait de cette photo, pas
 * un personnage. Mesuré le 5 septembre 2026 : la première déduction pour
 * Valérie a rendu « sourit chaleureusement, joie et confiance » — le sourire
 * posé de sa photo de référence, promu tempérament. Injecté dans chaque prompt,
 * il aurait gravé le biais qu'on passait trois essais à combattre.
 *
 * Le tempérament d'un avatar appartient à la marque : sa promesse, son
 * registre, à qui elle parle. La photo dit comment la personne se tient ; la
 * chaîne dit qui elle est.
 */
function contexteDeLaChaine() {
  const c = litJson(CHEMINS.chaine, {})
  return [
    c.identite?.nom ? `She appears on a channel called "${c.identite.nom}".` : null,
    c.identite?.promesse ? `Its promise: "${c.identite.promesse}".` : null,
    c.identite?.en_une_phrase ? `What it is: ${c.identite.en_une_phrase}` : null,
    // LA POSTURE ÉDITORIALE NE DÉCRIT PAS LE JEU, ET LA CONFONDRE COÛTE CHER.
    //
    // « Vulgarisateur rigoureux, il chiffre et il source » décrit l'ÉCRITURE des
    // scripts. Donnée ici, elle a été lue comme une direction d'acteur : la
    // déduction a rendu « autorité calme, gestes mesurés, silences calculés »,
    // et a raboté le registre solaire qu'on lui demandait par ailleurs. Un
    // script rigoureux et une interprète solaire ne se contredisent pas.
    c.avatar?.segment ? `It speaks to: ${c.avatar.segment}` : null,
  ].filter(Boolean).join(' ')
}

/**
 * Le registre de jeu imposé par la chaîne, s'il y en a un.
 *
 * Il vit dans `config/chaine.json`, pas ici : une autre marque peut vouloir un
 * avatar posé, et coder celui-ci en dur ferait mentir le §6 — rien de spécifique
 * à la chaîne dans `pipeline/`.
 */
const registreDeLaChaine = () =>
  String(litJson(CHEMINS.chaine, {}).avatars?.registre ?? '').trim() || null

/**
 * Déduit une identité de jeu à partir de ce qu'on sait déjà de l'avatar.
 *
 * La photo donne la présence physique — l'âge, la posture, l'énergie. La chaîne
 * donne le registre. Rien n'est inventé sur sa vie : ce qu'on cherche est une
 * manière de se tenir, pas une biographie.
 */
export async function deduisLIdentite(avatar) {
  const urlPhoto = avatar.fal?.urls?.[0]
    ?? (avatar.photos?.length
      ? await televerse(path.join(avatar.dossier, 'photos', avatar.photos[0]), 'image/png')
      : null)

  if (!urlPhoto) return null

  const faits = [
    `Her name is ${avatar.nom ?? avatar.id}.`,
    avatar.signe ? `Distinguishing feature: ${avatar.signe}.` : null,
    contexteDeLaChaine() || null,
  ].filter(Boolean).join(' ')

  const registre = registreDeLaChaine()
  const question =
    `${faits}

` +
    `Define this person's PERFORMANCE IDENTITY — how she behaves on camera, so that ` +
    `every video of her feels like the same person. ` +
    `Cover, in this order: ${AXES.join('; ')}. ` +
    `Be concrete and behavioural: things a camera can film. ` +
    `Do NOT invent biography, job, backstory or opinions. ` +
    `Do NOT describe her clothes or the background.

` +
    // LE SOURIRE D'UNE PHOTO POSÉE N'EST PAS UN CARACTÈRE.
    //
    // Sans cette phrase, le modèle lit l'expression de l'instant et la promeut
    // tempérament : toute personne photographiée en souriant devient « chaleureuse
    // et souriante ». Trente plans d'un avatar qui sourit sont un diaporama, et
    // c'est la signature du faux (§10).
    `The photo is a posed shot: use it for her physical presence and bearing only. ` +
    `Do NOT take the momentary expression in it for her temperament — a posed smile ` +
    `is not a personality, and neither is a neutral face. ` +
    (registre ? '' : `Give her ONE specific temperament that could not be confused with anyone else's. `) +
    // NI SOURIRE PAR DÉFAUT, NI NEUTRALITÉ PAR DÉFAUT.
    //
    // Les deux produisent le même défaut par des chemins opposés : une seule
    // mine tenue sur tous les plans. Ce qu'on veut est une amplitude — grande,
    // lisible, et qui suit ce qui se passe dans le plan.
    `She must never hold one default expression across shots: her face is mobile ` +
    `and her reactions are big and readable, but they follow what is happening ` +
    `in each shot rather than being pasted on.

` +
    // LE REGISTRE EN DERNIER — LA POSITION QUI PÈSE LE PLUS.
    //
    // Placé au milieu, il ressortait raboté : « amplitude modérée », « intensité
    // calculée », et « excentrique » purement disparu. La leçon des prompts
    // vidéo vaut ici aussi — le modèle suit ce qui vient en dernier.
    (registre
      ? `NON-NEGOTIABLE — her personality is: ${registre}. This governs her ` +
        `PERFORMANCE, and it outranks everything above: if the channel's subject ` +
        `matter feels serious, she is still exactly this. Do not soften it, do not ` +
        `hedge it with "measured", "moderate", "controlled" or "restrained". ` +
        `Every one of the six sentences must be recognisably this personality.

`
      : '') +
    `Answer with a JSON object and nothing else: ` +
    `{"fr": "<six sentences, in French>", "en": "<the same, in English, ` +
    `phrased as direction to a video model>"}`

  const brut = await vision(urlPhoto, question)
  if (!brut) return null

  // Le modèle encadre volontiers son JSON de ```json … ``` : on prend l'objet
  // où qu'il soit plutôt que d'exiger une réponse parfaite.
  const bloc = brut.match(/\{[\s\S]*\}/)
  if (!bloc) return null
  try {
    const d = JSON.parse(bloc[0])
    const fr = String(d.fr ?? '').trim()
    const en = String(d.en ?? '').trim()
    return fr && en ? { fr, en } : null
  } catch {
    return null
  }
}

/**
 * L'identité de jeu à envoyer au modèle, en anglais.
 *
 * Elle est déduite et écrite si elle manque, traduite si le français a changé,
 * et relue dans tous les autres cas. Rend `null` quand rien n'a pu être obtenu
 * — un plan sans identité reste un plan, il perd seulement sa constance.
 */
export async function identiteDe(avatar, { deduis = true } = {}) {
  const f = path.join(avatar.dossier, 'avatar.json')
  const brut = litJson(f, {})

  // Écrite à la main et jamais traduite, ou modifiée depuis la traduction :
  // c'est le français qui fait foi, et l'anglais qui doit suivre.
  const aJour = brut.identite && brut.identite === brut.identite_source
  if (aJour && brut.identite_en) return brut.identite_en
  if (!deduis) return brut.identite_en ?? null

  if (brut.identite && !aJour) {
    journal.detail(`identité de « ${avatar.nom ?? avatar.id} » modifiée — traduction…`)
    const t = await traduis(brut.identite)
    if (!t) return brut.identite_en ?? null
    ecritJson(f, { ...brut, identite_en: t, identite_source: brut.identite })
    return t
  }

  journal.info(`« ${avatar.nom ?? avatar.id} » n'a pas d'identité de jeu — déduction…`)
  const d = await deduisLIdentite(avatar)
  if (!d) {
    journal.attention(`identité non déduite : les plans n'auront pas de tempérament constant.`)
    return null
  }
  ecritJson(f, { ...brut, identite: d.fr, identite_en: d.en, identite_source: d.fr })
  journal.ok(`identité écrite dans marque/avatars/${avatar.id}/avatar.json`)
  journal.detail(d.fr)
  return d.en
}

/**
 * Traduit une identité écrite à la main, sans rien y ajouter.
 *
 * Par le point d'entrée TEXTE de fal, pas celui de vision : ce dernier exige
 * une image, et il n'y a rien à regarder ici. Son énumération de modèles ne
 * contient pas gemini — la valeur aurait été refusée.
 */
async function traduis(fr) {
  try {
    const t = await travailFal(
      'fal-ai/any-llm',
      {
        prompt:
          `Translate this acting direction into English, as direction given to a video ` +
          `generation model. Keep every behavioural detail, add nothing, remove nothing. ` +
          `Answer with the translation only.

${fr}`,
        model: 'anthropic/claude-haiku-4.5',
      },
      { etiquette: 'traduction', tours: 40, pas: 2500 }
    )
    return String(JSON.parse(t).output ?? '').replace(/\s+/g, ' ').trim() || null
  } catch {
    return null
  }
}
