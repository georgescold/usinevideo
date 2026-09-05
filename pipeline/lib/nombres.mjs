/**
 * nombres.mjs — les nombres dits en toutes lettres, rendus en chiffres.
 *
 * POURQUOI ÇA NE SE FAIT PAS AVEC UNE TABLE DE REMPLACEMENT.
 *
 * Whisper transcrit ce qui est PRONONCÉ : « voici trois signes » s'écrit avec
 * « trois ». À l'écran, un sous-titre lit mieux « 3 » — le chiffre se saisit
 * d'un coup d'œil, le mot se lit. Mais un simple chercher-remplacer sur chaque
 * mot échoue sur les deux tiers des cas :
 *
 *   « vingt-cinq »        un seul mot pour nous, deux pour Whisper
 *   « quatre-vingt-dix »  trois mots, et « quatre » n'y vaut pas 4
 *   « cent quatre »       104, pas « 100 4 »
 *
 * On lit donc des SUITES de mots, et on les évalue.
 *
 * LE PIÈGE QUI DÉCIDE DE TOUT : « UN ».
 *
 * C'est l'article indéfini le plus fréquent du français. « un homme », « une
 * fois », « il y en a un ». Le convertir donnerait « 1 homme », et le défaut
 * serait pire que le manque. On ne le convertit donc JAMAIS seul — seulement
 * quand il termine un nombre plus grand : « vingt et un », « cent un ».
 *
 * Même prudence pour « cent » et « mille » employés seuls : ils passent, parce
 * qu'ils ne sont jamais des articles, mais ils ne remontent pas un nombre voisin
 * qui n'en fait pas partie.
 */

/** Les briques, et ce qu'elles valent. */
const UNITES = {
  zéro: 0, zero: 0,
  un: 1, une: 1,
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50,
  soixante: 60, septante: 70, octante: 80, huitante: 80, nonante: 90,
}

const CENT = new Set(['cent', 'cents'])
const MILLE = new Set(['mille', 'milles'])

/** Les mots qui peuvent entrer dans un nombre, « et » et le trait d'union compris. */
const LIAISONS = new Set(['et'])

const nettoie = (mot) =>
  String(mot ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z-]/g, '')

/** Un mot peut-il faire partie d'un nombre ? */
function estUnMorceau(mot) {
  const m = nettoie(mot)
  if (!m) return false
  // Whisper écrit parfois « vingt-cinq » d'un seul tenant : on éclate.
  return m.split('-').every((p) => UNITES[p] !== undefined || CENT.has(p) || MILLE.has(p) || LIAISONS.has(p))
}

/**
 * Évalue une suite de morceaux. Rend `null` si ça ne fait pas un nombre.
 *
 * L'algorithme est celui qu'on emploie à l'oral : on empile les unités, on
 * multiplie quand on rencontre « cent » ou « mille », et on ajoute au total.
 */
export function valeurDe(morceaux) {
  const mots = morceaux
    .flatMap((m) => nettoie(m).split('-'))
    .filter((m) => m && !LIAISONS.has(m))
  if (!mots.length) return null

  let total = 0
  let courant = 0
  let vu = false

  for (const [rang, mot] of mots.entries()) {
    if (UNITES[mot] !== undefined) {
      // « QUATRE-VINGT » SE MULTIPLIE, IL NE S'ADDITIONNE PAS.
      //
      // C'est la bizarrerie du français, et elle casse l'algorithme naïf :
      // quatre + vingt + dix donnait 34 au lieu de 90. Vingt est la seule unité
      // qui accepte un multiplicateur, et seul « quatre » le porte.
      // « soixante-dix », lui, est bien additif — 60 + 10 — et n'a rien à
      // corriger.
      if ((mot === 'vingt' || mot === 'vingts') && rang > 0 && mots[rang - 1] === 'quatre') {
        courant = courant - 4 + 80
      } else {
        courant += UNITES[mot]
      }
      vu = true
    } else if (CENT.has(mot)) {
      courant = (courant || 1) * 100
      vu = true
    } else if (MILLE.has(mot)) {
      total += (courant || 1) * 1000
      courant = 0
      vu = true
    } else {
      return null
    }
  }
  return vu ? total + courant : null
}

/**
 * Repère les nombres écrits en lettres dans une liste de mots.
 *
 * Rend une liste de `{ de, a, valeur, texte }` — les bornes sont des index dans
 * la liste reçue, `texte` porte la ponctuation finale du dernier mot, qu'on ne
 * jette pas : « trois. » doit rester « 3. ».
 *
 * @param {{texte: string}[]} mots
 */
export function reperesDesNombres(mots) {
  const trouves = []
  let i = 0

  while (i < mots.length) {
    if (!estUnMorceau(mots[i]?.texte)) { i += 1; continue }

    // « ET » NE COMMENCE PAS UN NOMBRE, IL RELIE DEUX PHRASES.
    //
    // Sans ce saut, « … personnes, et vingt et un autres » avalait le « et »
    // dans le nombre et le faisait DISPARAÎTRE du sous-titre. Perdre un mot est
    // pire que ne pas convertir : on ne s'en aperçoit qu'à la lecture, et on
    // accuse la transcription.
    if (LIAISONS.has(nettoie(mots[i].texte))) { i += 1; continue }

    // LE « CENT » DE « POUR CENT » N'EST PAS UN NOMBRE À LUI SEUL.
    //
    // Il appartient au pourcentage qui le précède, et c'est ce dernier qui
    // l'absorbera plus bas. Le laisser démarrer une suite donnerait « pour 100 »,
    // qui ne veut rien dire.
    if (CENT.has(nettoie(mots[i].texte)) && nettoie(mots[i - 1]?.texte) === 'pour') { i += 1; continue }

    // La plus longue suite qui commence ici. On s'arrête au premier mot qui
    // n'est pas un morceau — « et » compris, s'il ne mène à rien.
    let fin = i
    while (fin + 1 < mots.length && estUnMorceau(mots[fin + 1]?.texte)) fin += 1

    // « et » ne peut pas terminer un nombre : « vingt et » n'existe pas, et
    // « deux et trois » est une addition, pas un nombre.
    while (fin > i && LIAISONS.has(nettoie(mots[fin]?.texte))) fin -= 1

    const suite = mots.slice(i, fin + 1).map((m) => m.texte)
    const valeur = valeurDe(suite)

    // LE GARDE-FOU DE « UN ». Seul, c'est un article neuf fois sur dix.
    const seulement = suite.length === 1
    const estUnSeul = seulement && ['un', 'une'].includes(nettoie(suite[0]))

    if (valeur !== null && !estUnSeul) {
      // « QUATRE-VINGT-DIX POUR CENT » S'ÉCRIT « 90% », PAS « 90 POUR CENT ».
      //
      // Trois mots deviennent un signe. C'est la conversion qui gagne le plus de
      // place à l'écran, et sur un sous-titre de trois mots la place est tout ce
      // qu'on a. Les instants des mots absorbés ne sont pas perdus : le patch de
      // `texte.mjs` étale la borne du premier à celle du dernier, donc le
      // symbole reste affiché aussi longtemps que la locution était prononcée.
      let derniere = fin
      let symbole = false
      const apres = (rang) => nettoie(mots[rang]?.texte)
      if (apres(fin + 1) === 'pour' && CENT.has(apres(fin + 2))) {
        derniere = fin + 2
        symbole = true
      } else if (['pourcent', 'pourcents', 'pour-cent'].includes(apres(fin + 1))) {
        derniere = fin + 1
        symbole = true
      }

      // La ponctuation du dernier mot survit au remplacement.
      const queue = /[^\p{L}\p{N}]+$/u.exec(String(mots[derniere].texte ?? ''))
      trouves.push({
        de: i,
        a: derniere,
        valeur,
        texte: `${valeur}${symbole ? '%' : ''}${queue ? queue[0] : ''}`,
        avant: mots.slice(i, derniere + 1).map((m) => m.texte).join(' '),
      })
      i = derniere + 1
      continue
    }
    i = fin + 1
  }
  return trouves
}
