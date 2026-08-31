/**
 * chiffres.mjs — les nombres s'écrivent en chiffres dans les sous-titres.
 *
 * POURQUOI CE N'EST PAS UN SIMPLE REMPLACEMENT.
 *
 * Whisper transcrit ce qui est dit, donc « deux personnes », « vingt euros »,
 * « mille neuf cent cinquante ». À l'écran, un nombre écrit en lettres se lit
 * moins vite qu'un chiffre, et sur un sous-titre qui défile mot à mot, la
 * vitesse de lecture est tout.
 *
 * Deux pièges rendent la conversion naïve dangereuse.
 *
 * 1. **« un » et « une » sont presque toujours des articles.** « une chose »,
 *    « un mécanisme », « une impression » : les convertir donnerait « 1 chose ».
 *    Sur un transcript réel de cette chaîne, sept occurrences sur huit étaient
 *    des articles. On ne les convertit JAMAIS — le gain est nul, le risque
 *    permanent.
 *
 * 2. **Un nombre s'étale sur plusieurs mots.** « mille neuf cent cinquante »
 *    occupe quatre entrées du transcript, chacune avec ses bornes temporelles.
 *    Les fondre en une seule impose de reprendre le début de la première et la
 *    fin de la dernière, sinon le calage des événements visuels se décale de
 *    tout ce qu'on a supprimé.
 */

/** Les unités, sans « un » ni « une » : voir le piège n° 1. */
const UNITES = {
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
}
const DIZAINES = {
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  'quatre-vingt': 80, 'quatre-vingts': 80,
}
const MULTIPLICATEURS = { cent: 100, cents: 100, mille: 1000, milles: 1000 }

/** « un » n'est un numéral que dans une suite : « vingt et un », « cent un ». */
const LIAISONS = new Set(['et', 'un', 'une'])

const nu = (m) =>
  String(m).toLowerCase().replace(/[.,!?;:»«"']/g, '').trim()

/**
 * Un mot du transcript peut porter un nombre entier : Whisper rend souvent
 * « vingt-six » ou « quatre-vingt-dix » d'un seul tenant. On travaille donc sur
 * les morceaux, pas sur le mot.
 */
const morceaux = (m) => nu(m).split('-').filter(Boolean)

/** Un mot peut-il ouvrir un nombre ? */
const ouvre = (m) => {
  const p = morceaux(m)
  if (!p.length) return false
  const x = p[0]
  return x in UNITES || x in DIZAINES || x in MULTIPLICATEURS
}

/** Un mot peut-il continuer un nombre déjà commencé ? */
const continue_ = (m) => ouvre(m) || LIAISONS.has(nu(m))

/**
 * Additionne une suite de mots-nombres français.
 *
 * Rend `null` quand la suite ne compose pas un nombre cohérent — on préfère
 * laisser le texte tel quel plutôt que d'inventer un chiffre faux.
 */
function valeur(mots) {
  let total = 0
  let courant = 0
  let vu = false

  const plats = mots.flatMap((x) => morceaux(x))
  for (let k = 0; k < plats.length; k++) {
    const m = plats[k]
    // « quatre-vingt » vaut 80, pas 4 puis 20. Le cas se traite ici parce que
    // c'est le seul endroit ou l'on voit les deux morceaux cote a cote.
    if (m === 'quatre' && (plats[k + 1] === 'vingt' || plats[k + 1] === 'vingts')) {
      courant += 80
      vu = true
      k++
      continue
    }
    // « pour cent » n'est pas un multiplicateur : c'est une unite. On arrete la
    // suite plutot que de rendre « 75 pour 100 ».
    if (m === 'pour' && (plats[k + 1] === 'cent' || plats[k + 1] === 'cents')) return null
    if (m === 'et') continue
    if (m === 'un' || m === 'une') {
      // Seulement en position de liaison : « vingt et un », jamais seul.
      if (!vu) return null
      courant += 1
      continue
    }
    if (m in UNITES) {
      courant += UNITES[m]
      vu = true
      continue
    }
    if (m in DIZAINES) {
      courant += DIZAINES[m]
      vu = true
      continue
    }
    if (m in MULTIPLICATEURS) {
      const f = MULTIPLICATEURS[m]
      if (f === 100) courant = (courant || 1) * 100
      else {
        total += (courant || 1) * f
        courant = 0
      }
      vu = true
      continue
    }
    return null
  }
  if (!vu) return null
  return total + courant
}

/**
 * Réécrit les nombres d'une liste de mots horodatés.
 *
 * Rend une NOUVELLE liste ; l'entrée n'est pas modifiée. Chaque nombre fondu
 * garde le début du premier mot et la fin du dernier.
 */
export function chiffreLesNombres(mots) {
  const sortie = []
  let converties = 0

  for (let i = 0; i < mots.length; i++) {
    // « cent » precede de « pour » est une unite, pas un nombre : « 75 pour 100 »
    // serait un contresens. On le laisse en lettres.
    if (i > 0 && nu(mots[i - 1].texte) === 'pour' && morceaux(mots[i].texte)[0]?.startsWith('cent')) {
      sortie.push(mots[i])
      continue
    }
    if (!ouvre(mots[i].texte)) {
      sortie.push(mots[i])
      continue
    }

    // On prend la plus longue suite possible, puis on raccourcit jusqu'à ce
    // qu'elle compose un nombre valide. « deux personnes » s'arrête à « deux ».
    let fin = i
    while (fin + 1 < mots.length && continue_(mots[fin + 1].texte)) fin++
    // Une suite ne se termine jamais sur une liaison.
    while (fin > i && nu(mots[fin].texte) === 'et') fin--

    let n = null
    let j = fin
    for (; j >= i; j--) {
      n = valeur(mots.slice(i, j + 1).map((m) => m.texte))
      if (n !== null) break
    }

    if (n === null) {
      sortie.push(mots[i])
      continue
    }

    // La ponctuation du dernier mot survit : « en 2026, » garde sa virgule.
    const ponctuation = String(mots[j].texte).match(/[.,!?;:]+$/)?.[0] ?? ''
    sortie.push({
      ...mots[i],
      texte: `${n}${ponctuation}`,
      finMs: mots[j].finMs,
    })
    if (j > i) converties++
    else if (String(mots[i].texte) !== `${n}${ponctuation}`) converties++
    i = j
  }

  return { mots: sortie, converties }
}
