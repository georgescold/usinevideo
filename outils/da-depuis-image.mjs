/**
 * Dérive une direction artistique depuis l'image de marque d'une chaîne.
 *
 *   node outils/da-depuis-image.mjs <image> [--applique]
 *
 * POURQUOI CET OUTIL EXISTE.
 *
 * Une chaîne se reconnaît avant d'être lue. Si sa vidéo n'a pas les couleurs de
 * son avatar, le spectateur qui la croise dans un fil ne fait pas le lien — et
 * il ne le fera jamais consciemment, c'est justement pour ça que ça compte.
 * L'image de profil est le seul élément visuel qu'il voit à coup sûr, partout :
 * c'est donc elle qui doit commander la palette, et non l'inverse.
 *
 * Choisir une palette « au goût » à chaque nouvelle chaîne, c'est aussi la
 * meilleure façon de refaire trois fois la même. Ici la palette est CONSTATÉE.
 *
 * ---
 *
 * MÉTHODE. On ne prend pas les couleurs dominantes brutes : sur une image de
 * marque, le dominant est presque toujours un fond neutre ou une peau, et une
 * charte bâtie dessus est terne. On classe les couleurs par RÔLE :
 *
 *   fond    — la plus sombre et la moins saturée, assombrie pour porter du texte
 *   accent  — la plus SATURÉE, même minoritaire : c'est ce qui se remarque
 *   second  — la plus saturée d'une autre famille de teinte que l'accent
 *   texte   — la plus claire, réchauffée vers l'accent pour ne pas être un blanc mort
 *
 * Puis on vérifie les contrastes. Une palette jolie mais illisible sur un
 * téléphone au soleil n'est pas une palette, c'est une humeur.
 */

import fs from 'node:fs'
import path from 'node:path'
import { lanceOuEchoue } from '../pipeline/lib/ffmpeg.mjs'
import { journal } from '../pipeline/lib/journal.mjs'
import { CHEMINS, litJson } from '../pipeline/lib/chemins.mjs'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'

// ---------------------------------------------------------------------------
//  Couleur
// ---------------------------------------------------------------------------

const hex = (r, g, b) =>
  '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')

function versHsl(r, g, b) {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6
  else if (max === G) h = ((B - R) / d + 2) / 6
  else h = ((R - G) / d + 4) / 6
  return { h: h * 360, s, l }
}

function depuisHsl(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Luminance relative — la base de tout calcul de contraste. */
function luminance(hexa) {
  const n = parseInt(hexa.replace('#', ''), 16)
  const canaux = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2]
}

/** Le rapport de contraste entre deux couleurs, de 1 (identiques) à 21. */
export function contraste(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---------------------------------------------------------------------------
//  Lecture de l'image
// ---------------------------------------------------------------------------

/**
 * Les couleurs de l'image, regroupées.
 *
 * On réduit à 64×64 : assez pour que chaque zone de l'image pèse, assez peu
 * pour que le regroupement soit instantané. Puis on quantifie sur une grille
 * grossière et on compte — un vrai k-moyennes n'apporterait rien ici, les
 * images de marque ont peu de familles de couleurs.
 */
async function couleursDe(fichier) {
  const brut = path.join(
    process.env.TEMP || '/tmp',
    `da-${process.pid}.rgb`
  )
  await lanceOuEchoue(FFMPEG, [
    '-hide_banner', '-y', '-nostdin',
    '-i', fichier,
    '-vf', 'scale=64:64:flags=lanczos',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24',
    brut,
  ])
  const donnees = fs.readFileSync(brut)
  fs.rmSync(brut, { force: true })

  const paniers = new Map()
  for (let i = 0; i + 2 < donnees.length; i += 3) {
    const r = donnees[i]
    const g = donnees[i + 1]
    const b = donnees[i + 2]
    // Grille de 24 niveaux par canal : deux nuances proches se comptent ensemble.
    const cle = `${r >> 5}-${g >> 5}-${b >> 5}`
    const p = paniers.get(cle) ?? { r: 0, g: 0, b: 0, n: 0 }
    p.r += r
    p.g += g
    p.b += b
    p.n++
    paniers.set(cle, p)
  }

  return [...paniers.values()]
    .map((p) => {
      const r = p.r / p.n
      const g = p.g / p.n
      const b = p.b / p.n
      return { hex: hex(r, g, b), part: p.n / (64 * 64), ...versHsl(r, g, b) }
    })
    .sort((a, b) => b.part - a.part)
}

// ---------------------------------------------------------------------------
//  Attribution des rôles
// ---------------------------------------------------------------------------

/**
 * Attribue un rôle à chaque couleur, puis corrige jusqu'à ce que ce soit lisible.
 *
 * L'étape de correction est la plus importante : une image de marque n'a AUCUNE
 * raison de contenir un fond assez sombre et un texte assez clair pour que l'un
 * porte l'autre. On part donc de ses teintes — qui font l'identité — et on
 * ajuste les luminosités — qui font la lisibilité. La teinte est constatée, la
 * clarté est calculée.
 */
export function attribueLesRoles(couleurs) {
  const notables = couleurs.filter((c) => c.part > 0.004)

  // L'accent : la plus saturée, à condition d'être assez claire pour se voir.
  // On ignore les quasi-noirs saturés, qui ne ressortent sur rien.
  const candidats = notables.filter((c) => c.l > 0.18 && c.l < 0.88)
  const accentBrut = [...(candidats.length ? candidats : notables)].sort(
    (a, b) => b.s * (0.35 + b.part) - a.s * (0.35 + a.part)
  )[0]

  // Le fond : le plus sombre, désaturé et assombri jusqu'à porter du texte.
  const sombre = [...notables].sort((a, b) => a.l - b.l)[0]
  // Le fond garde la TEINTE de l'image (c'est elle qui fait l'identité) mais
  // descend à une clarté qui laisse respirer le texte. Un fond à 0,12 de clarté
  // et 0,22 de saturation lit comme une couleur, pas comme du noir.
  const fond = depuisHsl(sombre.h, Math.min(sombre.s, 0.28), 0.075)

  // Le texte : la plus claire, réchauffée vers l'accent. Un blanc pur sur une
  // charte chaude fait tache ; deux points de teinte suffisent à l'accorder.
  const claire = [...notables].sort((a, b) => b.l - a.l)[0]
  const texte = depuisHsl(accentBrut.h, 0.14, 0.955)

  // L'accent doit satisfaire DEUX contraintes qui tirent en sens inverse :
  // il sert de texte sur le fond (donc il doit être clair) et de pastille sous
  // le texte (donc il doit être sombre). Monter la clarté jusqu'à satisfaire la
  // première casse systématiquement la seconde.
  //
  // On balaie donc toute la plage de clarté et on garde celle qui maximise le
  // PIRE des deux contrastes. C'est le meilleur compromis possible pour cette
  // teinte — et s'il reste insuffisant, c'est que la teinte elle-même ne peut
  // pas tenir les deux rôles, ce que le rapport dira.
  const teinteAccent = accentBrut.h
  const satAccent = Math.max(accentBrut.s, 0.62)
  let accent = depuisHsl(teinteAccent, satAccent, 0.5)
  let meilleur = -1
  for (let l = 0.28; l <= 0.78; l += 0.01) {
    const essai = depuisHsl(teinteAccent, satAccent, l)
    const note = Math.min(contraste(essai, fond) / 4.5, contraste(essai, texte) / 4.5)
    if (note > meilleur) {
      meilleur = note
      accent = essai
    }
  }

  // Le second : la couleur notable dont la teinte est la plus éloignée de
  // l'accent. C'est lui qui évite le monochrome sans casser la charte.
  const ecart = (a, b) => {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
  }
  const secondBrut =
    [...notables]
      .filter((c) => c.s > 0.12 && ecart(c.h, accentBrut.h) > 40)
      .sort((a, b) => ecart(b.h, accentBrut.h) * b.s - ecart(a.h, accentBrut.h) * a.s)[0] ?? accentBrut
  // Le second sert surtout de texte secondaire et de filets : il n'a qu'une
  // contrainte, se détacher du fond. On l'éclaircit jusqu'à ce qu'il la tienne.
  let second = depuisHsl(secondBrut.h, Math.max(secondBrut.s, 0.45), 0.42)
  for (let l = 0.42; l <= 0.8 && contraste(second, fond) < 3.5; l += 0.02) {
    second = depuisHsl(secondBrut.h, Math.max(secondBrut.s, 0.45), l)
  }

  // LA PASTILLE A SA PROPRE COULEUR, ET C'EST NÉCESSAIRE.
  //
  // L'accent est optimisé pour se lire SUR le fond — il est donc au milieu de la
  // plage de clarté, et à cet endroit précis ni un texte clair ni un texte foncé
  // ne contraste bien avec lui. Un seul ton ne peut pas tenir les deux emplois.
  //
  // On dérive donc une variante ASSOMBRIE DE LA MÊME TEINTE pour le fond du mot
  // actif : l'identité est intacte — c'est la même couleur — et le texte redevient
  // lisible. C'est le compromis que la charte doit faire, plutôt que de désaturer
  // l'accent jusqu'à ce que le chiffre passe.
  let pastille = accent
  for (let l = 0.5; l >= 0.2; l -= 0.02) {
    const essai = depuisHsl(teinteAccent, satAccent, l)
    if (contraste(texte, essai) >= 4.5) {
      pastille = essai
      break
    }
  }

  return {
    fond,
    accent,
    second,
    texte,
    pastille,
    source: { accent: accentBrut.hex, fond: sombre.hex, claire: claire.hex },
  }
}

const hexVersRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ---------------------------------------------------------------------------
//  Le caractère de l'image → la police
// ---------------------------------------------------------------------------

/**
 * Ce que l'image dit du caractère de la chaîne, et donc de sa typographie.
 *
 * Trois familles suffisent, et elles se lisent sur deux mesures objectives :
 * la saturation moyenne (une charte vive ne parle pas comme une charte sourde)
 * et le contraste interne (une image douce n'appelle pas une typo brutale).
 *
 * Ce n'est pas une science — mais une règle explicite vaut mieux qu'un choix
 * arbitraire refait à chaque chaîne, et elle se discute.
 */
export function caractereDe(couleurs) {
  const notables = couleurs.filter((c) => c.part > 0.004)
  const satMoy = notables.reduce((a, c) => a + c.s * c.part, 0) / notables.reduce((a, c) => a + c.part, 0)
  const clarte = notables.map((c) => c.l)
  const etendue = Math.max(...clarte) - Math.min(...clarte)

  // ON NE PROPOSE QUE DES POLICES DE SOUS-TITRAGE.
  //
  // La première version de cet outil proposait Fraunces, une serif de caractère.
  // Superbe en titre, illisible en sous-titre : à 86 px sur une image qui bouge,
  // ses déliés disparaissent dès que le plan est clair. Titrer et sous-titrer
  // sont deux métiers, et c'est le second qui commande ici — la police de
  // sous-titre est à l'écran 100 % du temps.
  //
  // Le répertoire complet, avec les réserves de chacune, est dans
  // `references/polices-sous-titrage.md`. Toutes celles proposées ici en sortent.
  if (satMoy < 0.22 && etendue > 0.6) {
    return {
      famille: 'brutale',
      pourquoi: 'palette sourde et contraste franc : une image qui affirme',
      affiche: 'ArchivoBlack',
      lecture: 'Inter',
      telechargement: 'ofl/archivoblack/ArchivoBlack-Regular.ttf',
    }
  }
  if (satMoy > 0.34 || etendue < 0.45) {
    return {
      famille: 'chaleureuse',
      pourquoi: 'palette saturée ou contraste doux : une image qui accueille',
      // Géométrique et ronde, mais assez grasse pour tenir sur une image. La
      // chaleur vient de sa rondeur, pas d'un dessin de caractère.
      affiche: 'Poppins',
      lecture: 'Inter',
      telechargement: 'ofl/poppins/Poppins-Bold.ttf',
    }
  }
  return {
    famille: 'sobre',
    pourquoi: 'palette et contraste médians : une image qui explique',
    // Le compromis que le sous-titrage social a fini par adopter : élégante
    // sans être froide, difficile à prendre en défaut.
    affiche: 'Montserrat',
    lecture: 'Inter',
    telechargement: 'ofl/montserrat/Montserrat%5Bwght%5D.ttf',
  }
}

// ---------------------------------------------------------------------------
//  Programme
// ---------------------------------------------------------------------------

const image = process.argv[2]
if (!image || process.argv.includes('--aide')) {
  console.log(`
node outils/da-depuis-image.mjs <image> [--applique]

  Dérive une palette et une typographie depuis l'image de marque d'une chaîne,
  vérifie les contrastes, et propose le bloc identite_visuelle correspondant.

  --applique   écrit directement dans config/chaine.json
`)
  process.exit(image ? 0 : 1)
}
if (!fs.existsSync(image)) {
  console.error(`Image introuvable : ${image}`)
  process.exit(1)
}

const couleurs = await couleursDe(image)
const roles = attribueLesRoles(couleurs)
const caractere = caractereDe(couleurs)

journal.titre(`Direction artistique · ${path.basename(image)}`)

console.log('  Couleurs relevées, par importance :')
for (const c of couleurs.filter((c) => c.part > 0.02).slice(0, 7)) {
  console.log(
    `    ${c.hex}  ${(c.part * 100).toFixed(0).padStart(3)} %  ` +
      `teinte ${Math.round(c.h).toString().padStart(3)}°  saturation ${(c.s * 100).toFixed(0).padStart(3)} %`
  )
}

console.log('\n  Rôles attribués :')
console.log(`    fond              ${roles.fond}   (teinte reprise de ${roles.source.fond})`)
console.log(`    accent            ${roles.accent}   (teinte reprise de ${roles.source.accent})`)
console.log(`    accent secondaire ${roles.second}`)
console.log(`    texte             ${roles.texte}`)

console.log('\n  Contrastes :')
const controles = [
  ['texte sur fond', roles.texte, roles.fond, 4.5],
  ['accent sur fond', roles.accent, roles.fond, 3],
  ['texte sur pastille', roles.texte, roles.pastille, 4.5],
  ['second sur fond', roles.second, roles.fond, 3],
]
let ok = true
for (const [nom, a, b, seuil] of controles) {
  const r = contraste(a, b)
  const passe = r >= seuil
  if (!passe) ok = false
  console.log(`    ${passe ? '✓' : '✗'} ${nom.padEnd(18)} ${r.toFixed(1)} : 1   (minimum ${seuil})`)
}

console.log(`\n  Caractère : ${caractere.famille} — ${caractere.pourquoi}`)
console.log(`    police d'affiche  ${caractere.affiche}`)
console.log(`    police de lecture ${caractere.lecture}`)

if (process.argv.includes('--applique')) {
  const chemin = path.join(CHEMINS.racine, 'config', 'chaine.json')
  const c = litJson(chemin, null)
  if (!c) throw new Error('config/chaine.json introuvable')
  c.identite_visuelle = {
    ...c.identite_visuelle,
    couleur_fond: roles.fond,
    couleur_accent: roles.accent,
    couleur_accent_secondaire: roles.second,
    couleur_pastille: roles.pastille,
    couleur_texte: roles.texte,
    police_soustitres: caractere.affiche,
    police_titres: caractere.lecture,
    police_chiffres: caractere.affiche,
    derivee_de: path.relative(CHEMINS.racine, image).replace(/\\/g, '/'),
  }
  fs.writeFileSync(chemin, JSON.stringify(c, null, 2))
  journal.ok('config/chaine.json mis à jour.')
  if (!ok) {
    journal.attention(
      "Un contraste est sous le seuil : la charte est jolie mais une partie sera dure à lire sur un téléphone au soleil. Ajuste à la main avant de produire."
    )
  }
} else {
  console.log('\n  Ajoute --applique pour écrire dans config/chaine.json.')
}
