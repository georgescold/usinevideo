/**
 * fish.mjs — fabriquer la parole à partir du texte, chez Fish Audio.
 *
 * CE QUE ÇA CHANGE DANS LA CHAÎNE.
 *
 * Jusqu'ici une vidéo commençait par une PRISE : quelqu'un parlait, on déposait
 * le fichier, et tout le reste en découlait. Ici la prise n'existe pas — elle
 * est fabriquée depuis le script. Le résultat se dépose exactement au même
 * endroit, `02-tournage/`, et rien en aval ne change : la transcription, les
 * sous-titres calés mot à mot, la couverture en plans de coupe (§3) marchent
 * sur ce fichier comme sur un enregistrement.
 *
 * C'est délibéré. Une branche parallèle « pipeline TTS » aurait dupliqué six
 * étapes pour une seule différence : d'où vient le son.
 *
 * POURQUOI FISH ET PAS LE MODÈLE ENTRAÎNÉ.
 *
 * Le modèle de `marque/voix/` est un CONVERTISSEUR de timbre : il transforme
 * une voix en une autre, il ne sait pas lire. Il lui faut une source parlée, et
 * c'est la source qui porte l'intonation — le modèle ne fait que plaquer le
 * timbre par-dessus. La source gratuite d'Applio, edge-tts, est plate ; la
 * consigne de cette chaîne est que l'intonation soit toujours vivante. Fish
 * fait les deux d'un coup : il lit, et il lit avec du relief.
 *
 * L'INTONATION SE JOUE SUR TROIS LEVIERS, ET LE PREMIER EST LE TEXTE.
 *
 * Relevé lors des essais du 4 septembre 2026 : à réglages égaux, c'est le texte
 * porteur de marqueurs écrits qui a rendu la lecture la plus vivante — devant
 * la seule montée de température. Un modèle lit ce qu'on lui écrit ; une phrase
 * plate reste plate quel que soit le réglage.
 */

import fs from 'node:fs'
import path from 'node:path'

import { pool } from './trousseau.mjs'
import { assureDossier } from './chemins.mjs'

const RACINE = 'https://api.fish.audio'

/** Le modèle retenu à l'oreille : plus de relief que `s1`, plus posé que 1.6. */
export const MODELE_DEFAUT = 's2.1-pro'

/**
 * Les réglages d'intonation, et ce que chacun fait vraiment.
 *
 * `temperature` ouvre la dynamique : à 0,5 la lecture est régulière et morte, à
 * 1,0 elle respire, monte et claque. Au-delà de 1,1 elle part en vrille et
 * invente des accents. `top_p` borne le vocabulaire prosodique : le baisser
 * stabilise, le monter ajoute de l'imprévu.
 *
 * Ce sont les valeurs mesurées à l'écoute, pas des défauts d'API.
 *
 * `prosody.volume` EST ÉCARTÉ, et ce n'est pas un oubli. Mesuré le 5 septembre
 * 2026 : à +6 il monte la sonie moyenne de −19,8 à −15,3 dB, mais la crête tape
 * 0,0 dBFS — de l'écrêtage, pas de la puissance. Le §9 refuse un pic au-dessus
 * de −1 dBTP, qui annonce une vraie distorsion. La puissance se gagne dans le
 * TEXTE : le texte punchy monte les crêtes de −3,6 à −2,0 dB sans toucher la
 * moyenne, c'est-à-dire plus d'attaque et plus d'écart — ce qu'on entend comme
 * « elle appuie ».
 */
export const INTONATION = { temperature: 1.0, top_p: 0.85 }

/**
 * ON ENTEND LES SOUDURES, ET C'EST LE DÉCOUPAGE INTERNE.
 *
 * Fish coupe le texte en tronçons, les synthétise séparément et les recolle. Aux
 * joints, le timbre et le fond de pièce sautent — on entend un « cut ». Ce ne
 * sont pas des blancs : relevé le 5 septembre 2026, aucun silence détectable
 * au-dessus de −32 dB sur 0,08 s dans une prise où les cuts s'entendent.
 *
 * `chunk_length` accepte 100 à 300. Au maximum, il y a le moins de joints
 * possible — c'est le seul levier exposé sur ce point.
 */
export const DECOUPAGE_MAX = 300

/**
 * Le débit, un cran au-dessus du naturel.
 *
 * Le format court pardonne mal la lenteur : à 1,12 le même texte passe de 20,5 s
 * à 18,0 s, et la crête redescend à −1,5 dB — sous le seuil de −1 dBTP, donc on
 * gagne aussi de la marge avant distorsion.
 */
export const DEBIT = 1.12

const cle = () => {
  const e = pool('fish')
  if (!e.length) throw new Error(`Aucune clé fish active. npm run cles -- --ajoute=fish`)
  return e[0].key
}

const enVoix = (m) => ({
  id: m._id,
  nom: m.title,
  langues: m.languages ?? [],
  etat: m.state,
  usages: m.task_count ?? null,
})

/** Les voix du compte : celles qu'on a soi-même entraînées ou enregistrées. */
export async function voix() {
  const r = await fetch(`${RACINE}/model?self=true&page_size=50`, {
    headers: { authorization: 'Bearer ' + cle() },
  })
  if (!r.ok) throw new Error(`Fish a refusé la liste des voix (HTTP ${r.status}).`)
  return ((await r.json()).items ?? []).map(enVoix)
}

/**
 * LA BIBLIOTHÈQUE PUBLIQUE, TRIÉE PAR USAGE.
 *
 * Mille voix françaises : les lister toutes serait illisible, et les trier par
 * « score » remonte les mêmes que par usage. On prend donc les plus employées,
 * qui sont aussi les mieux tenues — une voix que personne n'utilise est souvent
 * une voix qui rate un phonème sur dix.
 *
 * Un avertissement s'impose, et il n'est pas juridique : la bibliothèque
 * contient des clones de personnes réelles et connues. Faire porter à une marque
 * la voix de quelqu'un qui n'a rien demandé est une autre chose que choisir un
 * timbre. L'écran affiche la liste, il ne trie pas à ta place.
 */
export async function voixPubliques({ langue = 'fr', combien = 100, recherche = null, page = 1 } = {}) {
  // LA BIBLIOTHÈQUE NE SE CHARGE PAS D'UN COUP, ET « TOUTES » N'EXISTE PAS.
  //
  // Fish plafonne une page à cent entrées. On en demandait quarante — c'était
  // arbitraire, et ça laissait croire que la bibliothèque en contenait
  // quarante. On prend donc le maximum, et on expose la PAGE : l'écran charge
  // la suite quand on la demande, comme il le fait déjà pour ElevenLabs.
  //
  // La RECHERCHE part au serveur plutôt que de filtrer ce qui est déjà chargé.
  // Filtrer en local ne cherche que dans les cent premières : taper un nom qui
  // existe à la trois-centième position ne rendait rien, et on en concluait
  // que la voix n'existait pas.
  const q = new URLSearchParams({
    page_size: String(Math.max(1, Math.min(100, combien))),
    page_number: String(Math.max(1, page)),
    sort_by: 'task_count',
  })
  if (langue) q.set('language', langue)
  if (recherche) q.set('title', String(recherche))
  const r = await fetch(`${RACINE}/model?${q}`, { headers: { authorization: 'Bearer ' + cle() } })
  if (!r.ok) throw new Error(`Fish a refusé la bibliothèque (HTTP ${r.status}).`)
  return ((await r.json()).items ?? []).map(enVoix)
}

/** Ce qu'il reste sur le compte, en dollars, ou `null` si l'appel échoue. */
export async function credit() {
  try {
    const r = await fetch(`${RACINE}/wallet/self/api-credit`, {
      headers: { authorization: 'Bearer ' + cle() },
    })
    if (!r.ok) return null
    return Number((await r.json()).credit)
  } catch {
    return null
  }
}

/**
 * LES MARQUEURS D'ÉMOTION, ÉCRITS DANS LE TEXTE.
 *
 * Fish lit `(rires)`, `(soupir)`, `(surpris)` comme des indications de jeu et
 * non comme des mots à prononcer. C'est le levier le plus fort des trois, et le
 * seul qui se voit : on relit le texte et on sait ce qu'on va entendre.
 *
 * La liste n'est pas exhaustive — elle sert à l'aide et au champ de saisie, pour
 * qu'on n'ait pas à deviner ce que le modèle comprend.
 */
/**
 * UN MARQUEUR EST UN ÉVÉNEMENT, PAS UNE COULEUR. MESURÉ.
 *
 * On les croyait de deux natures — les sons d'un côté, les intentions de
 * l'autre. Relevé le 5 septembre 2026 sur la même phrase, même voix, mêmes
 * réglages :
 *
 *   nue                        2,04 s
 *   (rires) devant             2,14 s   +0,09
 *   (agacé) devant             2,28 s   +0,23
 *   (sourire dans la voix)     2,55 s   +0,51
 *   ponctuation seule          2,60 s   +0,56
 *
 * Aucun silence en tête dans aucun cas : le son démarre immédiatement partout.
 * Le demi-seconde du « sourire » est donc un événement vocal COLLÉ au début —
 * Fish joue le marqueur au lieu d'en teinter la suite. À l'oreille, elle
 * s'arrête et rit, puis récite. C'est le contraire de ce qu'on cherchait.
 *
 * ET LA PONCTUATION FAIT MIEUX, SANS RIEN POUVOIR CASSER.
 *
 * Des points de suspension changent la lecture autant que le marqueur le plus
 * fort, et ils ne peuvent pas produire de bruit parasite : ils ne sont pas
 * joués, ils sont lus. C'est le levier principal, et les marqueurs deviennent
 * l'exception.
 */
export const MARQUEURS_SONS = ['(rires)', '(soupir)']

/** Ceux qui teintent — moins fiables : Fish les joue parfois au lieu de les suivre. */
export const MARQUEURS_TON = [
  '(surpris)', '(excité)', '(chuchote)', '(sérieux)', '(hésitant)', '(agacé)',
  '(sourire dans la voix)',
]

export const MARQUEURS = [...MARQUEURS_SONS, ...MARQUEURS_TON]

/**
 * DIRIGER LE TEXTE AVANT DE LE FAIRE LIRE.
 *
 * C'est le premier levier d'intonation, et jusqu'ici il fallait l'actionner à la
 * main : écrire soi-même `(soupir)` au bon endroit, phrase par phrase. Sur un
 * script de dix minutes, personne ne le fait — et une lecture sans marqueur est
 * une lecture régulière, c'est-à-dire morte.
 *
 * On demande donc à un modèle de LIRE le script, d'y comprendre ce que chaque
 * phrase doit faire ressentir, et d'y poser les indications de jeu. Le résultat
 * revient dans le champ de saisie, pas dans le fichier : on le relit, on le
 * corrige, on le refuse. Une direction d'acteur qu'on ne voit pas est une
 * direction qu'on ne peut pas juger.
 *
 * LES MOTS NE BOUGENT PAS, ET C'EST VÉRIFIÉ.
 *
 * Le modèle a le droit d'ajouter des marqueurs et de retoucher la ponctuation —
 * une virgule, des points de suspension changent une lecture. Il n'a pas le
 * droit de réécrire une phrase : ce serait réécrire le script en croyant le
 * diriger. La suite des mots est comparée avant/après, et un écart annule tout.
 */
const motsDe = (t) =>
  String(t)
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

export async function dirige(texte, { registre = null, travailFal } = {}) {
  const source = String(texte ?? '').trim()
  if (!source) throw new Error(`Rien à diriger.`)
  if (typeof travailFal !== 'function') throw new Error(`dirige() a besoin de travailFal.`)

  const consigne =
    `You are directing a voice actor for a short-form video. Here is the script.

` +
    `Make the read alive and dynamic. Work sentence by sentence: decide what each ` +
    `one must make the listener FEEL, then shape the delivery.

` +
    `THE ENERGY LEVEL IS NOT NEGOTIABLE. She is convinced of what she says and ` +
    `she pushes it into the mic — confident, punchy, almost shouting on the words ` +
    `that matter. Never conversational, never measured, never neutral. If a ` +
    `sentence could be read calmly, you have not directed it.

` +
    `YOUR MAIN TOOL IS PUNCTUATION, NOT MARKERS. This was measured: an ellipsis ` +
    `changes the read as much as the strongest marker, and it cannot produce a ` +
    `parasitic sound. Concretely:
` +
    `- Exclamation marks drive the attack. Use them wherever conviction belongs — ` +
    `this was measured too: they raise the peaks without raising the average, ` +
    `which is exactly what "hitting a word" sounds like.
` +
    `- Put the ONE word that carries a sentence in CAPITALS, at most once or twice ` +
    `per paragraph. It is read as a word, louder.
` +
    `- Isolate the punchline with an ellipsis just before it.
` +
    `- Short sentences accelerate, long ones settle. Alternate deliberately.
` +
    // LE POINT D'EXCLAMATION FAIT MONTER LA FIN DE PHRASE. TOUJOURS.
    //
    // C'est ce qui donne l'attaque, et c'est exactement ce qui ruine une chute
    // grave : « il y a un tableur ! » sonne enthousiaste là où il faut que ça
    // tombe. L'énergie d'une phrase grave n'est pas dans la montée, elle est
    // dans le poids — un point, et rien d'autre.
    `- A question mark lifts the end of a line; a full stop drops it.
` +
    `- NEVER end a grave, damning or final line with an exclamation mark: it lifts ` +
    `the pitch and the line sounds cheerful. A serious punchline ends on a full ` +
    `stop, and gets its weight from an ellipsis BEFORE the last words, not from ` +
    `volume. Exclamation marks belong to the energetic, indignant and enthusiastic ` +
    `lines only.

` +
    `MARKERS ARE THE EXCEPTION, and here is why. The engine PERFORMS a marker ` +
    `rather than colouring what follows it: a "(sourire dans la voix)" makes her ` +
    `stop and laugh, then recite the sentence flat. That reads as a hiccup, not ` +
    `as an intention.

` +
    `RULES, and they are strict:
` +
    `- Sound markers ${MARQUEURS_SONS.join(' ')} are AUDIBLE events. Use one only ` +
    `where an actual sigh or laugh belongs — at most twice in the whole script, ` +
    `and never in the middle of a flowing sentence.
` +
    `- Tone markers ${MARQUEURS_TON.join(' ')} may be used at a real emotional ` +
    `turn, at most once every four or five sentences. Never on consecutive ` +
    `sentences. When in doubt, use punctuation instead and no marker.
` +
    `- Do NOT change, add or remove a single word of the script. Not one.
` +
    `- Place a marker before the passage it applies to, not after.
` +
    // UN SAUT DE LIGNE EST UNE PAUSE PAYANTE, PAS UNE RESPIRATION.
    //
    // Mesuré le 5 septembre 2026 : le même script rendu en un bloc fait 18,79 s ;
    // découpé en phrases séparées par des lignes vides, 21,39 s. Soit 2,6 s de
    // blanc ajouté, 0,3 s à chaque coupure. La lecture devient une suite
    // d'énoncés indépendants — « séquencée », exactement le défaut qu'on
    // cherchait à éviter en aérant.
    `- Return the script as ONE continuous block. Never add a line break, a blank ` +
    `line or a paragraph: the engine inserts a real pause at each one and the read ` +
    `falls apart into separate statements. Rhythm comes from punctuation INSIDE ` +
    `the flow, not from breaking it up.
` +
    // L'EXAGÉRATION EST DEMANDÉE, ET IL FAUT LE DIRE.
    //
    // Un modèle laissé à lui-même dirige sobrement. Sur du format court, la
    // sobriété se lit comme de la platitude : on scrolle avant la deuxième
    // phrase.
    `- Push the contrasts hard. This is short-form video, not audiobook narration: ` +
    `the read must grab in the first two seconds and keep changing register. ` +
    `Where a word carries the point, isolate it with punctuation so it lands.
` +
    (registre ? `- The speaker's register is: ${registre}. Direct her that way.
` : '') +
    `
Answer with the marked-up script and NOTHING else — no preamble, no ` +
    `explanation, no code fence.

---
${source}`

  const brut = await travailFal(
    'fal-ai/any-llm',
    { prompt: consigne, model: 'anthropic/claude-sonnet-4.5' },
    { etiquette: 'direction', tours: 60, pas: 2500 }
  )
  let dirige = String(JSON.parse(brut).output ?? '').trim()
  dirige = dirige.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  // FILET DE SÉCURITÉ : la consigne l'interdit, on le retire quand même.
  //
  // Un modèle aère spontanément un texte long, et chaque ligne vide coûte trois
  // dixièmes de seconde de blanc. Demander poliment ne suffit pas quand la
  // conséquence est mesurable.
  dirige = dirige.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ').replace(/ {2,}/g, ' ')
  if (!dirige) return null

  const avant = motsDe(source)
  const apres = motsDe(dirige)
  if (avant.length !== apres.length || avant.some((m, i) => m !== apres[i])) {
    const ecart = apres.length - avant.length
    throw new Error(
      `La direction a modifié le texte (${ecart >= 0 ? '+' : ''}${ecart} mot(s)) — refusée.
` +
        `  Le script fait foi ; seuls les marqueurs et la ponctuation peuvent bouger.`
    )
  }
  return dirige
}

/**
 * Fabrique la parole et l'écrit sur le disque.
 *
 * Rend la durée obtenue : c'est ce que le montage cale ensuite au mot près, et
 * une durée qu'on n'a pas regardée est une durée qui dérive sans prévenir.
 */
export async function parle(texte, sortie, {
  voixId,
  modele = MODELE_DEFAUT,
  temperature = INTONATION.temperature,
  topP = INTONATION.top_p,
  debit = DEBIT,
  format = 'wav',
} = {}) {
  // UN SAUT DE LIGNE EST UNE PAUSE, PAS UNE MISE EN PAGE.
  //
  // Mesuré le 5 septembre 2026 : le même script en un bloc fait 18,79 s ;
  // découpé en lignes, 21,39 s — 0,3 s de blanc à chaque retour. Or un script
  // collé depuis un traitement de texte en est plein, et souvent AU MILIEU des
  // phrases, là où la ligne s'est simplement enroulée. Le résultat est une
  // lecture hachée qu'aucun réglage ne rattrape.
  //
  // On les retire donc ici, au seul endroit par lequel tout passe — l'essai, la
  // prise, la direction. Les mots ne bougent pas ; ce qui bouge est une mise en
  // page qui n'a pas de sens à l'oral. Une respiration voulue s'écrit avec un
  // point ou des points de suspension, qui sont de vraies marques prosodiques.
  const brut = String(texte ?? '')
  const lignes = brut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const retires = brut.split(/\r?\n/).length - 1
  const t = lignes.join(' ').replace(/ {2,}/g, ' ').trim()
  if (!t) throw new Error(`Le texte à lire est vide.`)
  if (!voixId) throw new Error(`Donne la voix : --voix=<id>. npm run parle -- --voix=?`)

  const r = await fetch(`${RACINE}/v1/tts`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + cle(),
      'content-type': 'application/json',
      model: modele,
    },
    body: JSON.stringify({
      text: t,
      reference_id: voixId,
      format,
      temperature,
      top_p: topP,
      chunk_length: DECOUPAGE_MAX,
      // AUCUN TRAITEMENT DU SON, ICI NON PLUS (§9).
      //
      // `normalize_loudness` écraserait la dynamique qu'on vient de payer pour
      // obtenir, et les plateformes renormalisent de toute façon.
      prosody: { normalize_loudness: false, speed: debit },
    }),
  })
  if (!r.ok) {
    throw new Error(`Fish a refusé (HTTP ${r.status}) : ${(await r.text()).slice(0, 200)}`)
  }

  assureDossier(path.dirname(sortie))
  const octets = Buffer.from(await r.arrayBuffer())
  if (!octets.length) throw new Error(`Fish a rendu un fichier vide.`)
  fs.writeFileSync(sortie, octets)
  return { octets: octets.length, caracteres: t.length, sautsRetires: retires }
}

/**
 * Ce que la lecture va coûter, avant de la lancer (§7).
 *
 * Fish facture au caractère. Le tarif relevé sur ce compte le 5 septembre 2026 :
 * environ 15 $ le million de caractères, soit un dixième de centime pour une
 * minute de parole. On l'annonce quand même — un script long reste un script
 * long, et un devis affiché coûte moins cher qu'une surprise.
 */
export const USD_PAR_CARACTERE = 15 / 1_000_000
export const devis = (texte) => String(texte ?? '').length * USD_PAR_CARACTERE
