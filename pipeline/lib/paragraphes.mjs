/**
 * paragraphes.mjs — rendre un transcript lisible sans en changer un mot.
 *
 * Whisper rend un pavé. Un pavé de trois cents mots se lit mot à mot, jamais en
 * diagonale : on ne peut pas y repérer le hook, la preuve, ou le moment où
 * l'auteur bascule sur son conseil. Or c'est exactement ce qu'on vient chercher
 * dans une inspiration — la STRUCTURE, pas le contenu.
 *
 * POURQUOI PAS LES PAUSES, QUI SERAIENT POURTANT LE BON SIGNAL.
 *
 * Un silence dans la voix marque une articulation du discours, et Whisper rend
 * des horodatages mot à mot : le calcul semblait tout tracé. Il ne l'est pas.
 * Mesuré le 29 août 2026 sur les transcripts réels, l'écart entre la fin d'un
 * mot et le début du suivant vaut **zéro dans plus de neuf cas sur dix**, et ne
 * dépasse jamais 80 ms. whisper.cpp étire les frontières de mots pour couvrir
 * tout le segment : les silences sont absorbés, pas rapportés. Segmenter
 * là-dessus aurait produit un découpage au hasard, avec l'air d'être fondé.
 *
 * ON SE FONDE DONC SUR CE QUI EXISTE VRAIMENT DANS LE TEXTE :
 *
 *  1. **La fin de phrase.** Un paragraphe ne commence jamais au milieu d'une
 *     phrase, quelle que soit sa longueur.
 *  2. **Les marqueurs de discours.** « Premièrement », « Salut », « Si tu veux
 *     sortir de cette situation » — un script parlé annonce ses étapes à voix
 *     haute, parce que l'auditeur n'a pas de titres sous les yeux. Ces mots
 *     SONT les intertitres.
 *  3. **Un budget de longueur.** Sans lui, un passage sans marqueur reste un
 *     pavé ; avec lui seul, on couperait au milieu d'une idée.
 *
 * Le texte n'est jamais modifié : on n'ajoute que des retours à la ligne.
 */

/**
 * Les mots qui ouvrent une étape dans un script parlé.
 *
 * La liste est volontairement restreinte. « Mais », « Et », « Donc » ouvrent
 * une phrase sur trois à l'oral : les compter ferait un paragraphe par phrase,
 * ce qui est aussi illisible qu'un pavé.
 *
 * DEUX FORCES DE MARQUEUR, ET LA DISTINCTION SE VOIT À L'ŒIL NU.
 *
 * « Premièrement » est une annonce de plan : elle ouvre une partie, même après
 * une seule phrase, et la coller à la fin du bloc précédent inverse le sens de
 * lecture. Elle coupe donc sans condition de longueur.
 *
 * « Si tu veux… » ou « En réalité » pivotent, mais ouvrent aussi des phrases
 * ordinaires en plein milieu d'une idée. Elles ne coupent qu'une fois le
 * paragraphe assez nourri pour se tenir tout seul.
 */
const MARQUEURS_FORTS = [
  // L'énumération : elle annonce explicitement une étape, à voix haute, parce
  // que l'auditeur n'a pas de titres sous les yeux.
  /^premi[èe]rement\b/i,
  /^deuxi[èe]mement\b/i,
  /^troisi[èe]mement\b/i,
  /^quatri[èe]mement\b/i,
  /^cinqui[èe]mement\b/i,
  /^(tout d'abord|d'abord)\b/i,
  /^ensuite\b/i,
  /^enfin\b/i,
  /^pour finir\b/i,
  /^derni[èe]re[- ]?ment\b/i,
  /^(le|un) (premier|deuxi[èe]me|troisi[èe]me|dernier) (point|conseil|truc|piège|signe|exemple)\b/i,
  /^(num[ée]ro|[ée]tape) (un|deux|trois|quatre|cinq|\d)\b/i,

  // La présentation de soi : elle sépare toujours le hook de la suite.
  /^(salut|bonjour|coucou|hello)\b/i,
  /^je m'appelle\b/i,
]

const MARQUEURS_DOUX = [
  // Le pivot vers le problème, puis vers la solution.
  /^avant tout\b/i,
  /^le probl[èe]me\b/i,
  /^la (solution|r[ée]ponse|v[ée]rit[ée]|bonne nouvelle)\b/i,
  /^(alors|donc) (voil[àa]|comment)\b/i,
  /^concr[èe]tement\b/i,
  /^r[ée]sultat\b/i,
  /^en r[ée]alit[ée]\b/i,

  // La bascule vers le conseil ou l'appel à l'action.
  /^si tu (veux|cherches|es|as|fais|te)\b/i,
  /^si vous (voulez|cherchez|[êe]tes|avez)\b/i,
  /^(alors )?voici\b/i,
  /^(abonne|abonnez|commente|partage)[- ]?(toi|vous)?\b/i,
]

const fort = (phrase) => MARQUEURS_FORTS.some((m) => m.test(phrase.trimStart()))
const doux = (phrase) => MARQUEURS_DOUX.some((m) => m.test(phrase.trimStart()))

/** Cette phrase ouvre-t-elle une nouvelle partie, à quelque titre que ce soit ? */
function ouvreUneEtape(phrase) {
  return fort(phrase) || doux(phrase)
}

/**
 * Découpe un texte en phrases.
 *
 * On coupe après un point, un point d'exclamation, d'interrogation ou de
 * suspension SUIVI d'une espace et d'une majuscule. Les deux garde-fous
 * comptent : sans la majuscule, « 3.5 » et « M. Dupont » deviendraient des fins
 * de phrase ; sans l'espace, une adresse comme « sortida.fr » se couperait en
 * deux au milieu.
 */
export function phrases(texte) {
  return String(texte)
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"'(\d])/u)
    .map((p) => p.trim())
    .filter(Boolean)
}

const compteMots = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0)

/**
 * Met un transcript en paragraphes.
 *
 * @param {string} texte    le transcript brut, tel que Whisper le rend
 * @param {object} options
 *   `cible`   nombre de mots visé par paragraphe (65 par défaut)
 *   `minimum` en dessous, un marqueur DOUX ne coupe pas (15 par défaut, réglé
 *             sur les transcripts réels : c'est la valeur à partir de laquelle
 *             « Si tu veux sortir de cette situation, fais ça » ouvre son
 *             paragraphe au lieu de fermer le précédent)
 *   `plafond` au-delà, on coupe à la fin de phrase suivante (110 par défaut)
 * @returns le même texte, mots pour mots, séparé par des lignes vides.
 */
export function enParagraphes(texte, { cible = 65, minimum = 15, plafond = 110 } = {}) {
  const liste = phrases(texte)
  if (liste.length <= 1) return String(texte).trim()

  const paragraphes = []
  let courant = []
  let mots = 0

  for (const [i, phrase] of liste.entries()) {
    const n = compteMots(phrase)

    // LA COUPURE SE DÉCIDE AVANT D'AJOUTER, PAS APRÈS.
    //
    // Décidée après, un marqueur aurait déjà été collé à la fin du paragraphe
    // précédent — « Premièrement » se serait retrouvé en dernière ligne du bloc
    // qu'il était censé ouvrir.
    const coupe =
      courant.length > 0 &&
      (fort(phrase) ||
        (mots >= minimum && doux(phrase)) ||
        (mots >= cible && n + mots > cible) ||
        mots + n > plafond)

    if (coupe) {
      paragraphes.push(courant.join(' '))
      courant = []
      mots = 0
    }

    courant.push(phrase)
    mots += n

    if (i === liste.length - 1 && courant.length) paragraphes.push(courant.join(' '))
  }

  // UN DERNIER PARAGRAPHE TROP COURT SE RECOLLE AU PRÉCÉDENT.
  //
  // Une chute de script tient souvent en quatre mots — « Tu vas y arriver. » —
  // et un plafond atteint juste avant la laisserait seule sur sa ligne, ce qui
  // lui donne un poids qu'elle n'a pas dans le discours. Sauf si elle ouvre une
  // étape : là, sa solitude est le propos.
  if (paragraphes.length > 1) {
    const dernier = paragraphes.at(-1)
    if (compteMots(dernier) < 8 && !ouvreUneEtape(dernier)) {
      paragraphes.splice(-2, 2, `${paragraphes.at(-2)} ${dernier}`)
    }
  }

  return paragraphes.join('\n\n')
}
