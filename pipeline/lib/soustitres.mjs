/**
 * soustitres.mjs — les réglages de sous-titrage, et d'où ils viennent.
 *
 * CE QUE CE FICHIER REPREND DE SCRIPTSHORT, ET CE QU'IL N'EN REPREND PAS.
 *
 * Les onze modèles ci-dessous sont traduits un à un depuis `public/app.js` du
 * dépôt georgescold/Scriptshort (objet `TEMPLATES`, lignes 5 à 17). Les
 * conversions sont explicites, parce que les deux moteurs ne comptent pas dans
 * les mêmes unités :
 *
 *   taille        = round(1080 × 0,072 × fontScale)   → leur corps de police
 *                   sur une base de 1080, ramené à nos pixels de composition
 *   positionBas   = 4 + posY × 0,80                   → leur `marginV`, exprimé
 *                   en pourcentage de hauteur depuis le bas
 *   epaisseurContour = outlineScale                    → même sens, notre trait
 *                   CSS étant recalculé dans SousTitres.tsx
 *
 * Ce qu'on ne reprend pas : leur mode `box` de la variante « Boxed » pose une
 * boîte opaque derrière le bloc entier. On a le même effet en mieux avec la
 * pastille, qui ne tient que sous le mot dit.
 *
 * LA CASCADE, IDENTIQUE À CELLE DE LA VOIX.
 *
 * Quatre niveaux, du plus précis au plus général, chacun ne servant que si le
 * précédent est absent :
 *
 *   1. les options de la ligne de commande, pour un essai
 *   2. videos/<slug>/05-montage/soustitres.json, écrit par `npm run soustitres`
 *   3. config/chaine.json → formats.<format>.soustitres, le défaut du format
 *   4. config/chaine.json → identite_visuelle, le défaut de la chaîne
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, dossierVideo, litJson, ecritJson } from './chemins.mjs'

/** Le nom de famille d'un fichier de police, suffixes de graisse retirés. */
const familleDuFichier = (f) =>
  path
    .basename(f, path.extname(f))
    .replace(/[-_](Variable|Regular|Bold|Black|ExtraBold|SemiBold|Medium|Light|Thin|Italic)+$/i, '')

/** Les polices que la chaîne embarque, et qui partiront dans le rendu. */
export function policesDisponibles() {
  return [...new Set(fichiersDePolice().map((p) => p.famille))].sort()
}

/**
 * Les FICHIERS, pas seulement les familles.
 *
 * L'aperçu de l'atelier en a besoin pour poser ses `@font-face` : sans le nom
 * du fichier il ne peut rien charger, et il se rabattait sur un substitut de
 * chasse voisine — c'est-à-dire qu'il faisait juger un dessin de lettres sur un
 * autre dessin de lettres. `variable` compte : une police variable se déclare
 * sur toute la plage `100 900`, faute de quoi le navigateur synthétise le gras
 * et le rendu devient baveux — c'est la même règle que `construisTheme`.
 */
export function fichiersDePolice() {
  if (!fs.existsSync(CHEMINS.polices)) return []
  const sortie = []
  for (const f of fs.readdirSync(CHEMINS.polices).sort()) {
    if (!/\.(ttf|otf|woff2?)$/i.test(f)) continue
    const nu = path.basename(f, path.extname(f))
    sortie.push({
      fichier: f,
      famille: familleDuFichier(f),
      variable: /variable|wght/i.test(nu),
      italique: /italic|oblique/i.test(nu),
    })
  }
  return sortie
}

/**
 * Les onze modèles de Scriptshort, traduits.
 *
 * `surligne` est la couleur du mot en cours de prononciation. Chez eux, le mot
 * actif ne change QUE de couleur — pas de fond, pas d'échelle, pas de contour
 * différent (`subtitles.js` l.388-408, override `\1c` seul). C'est ce que fait
 * notre style `mot-a-mot-couleur`, et c'est pour ça qu'il est le défaut ici.
 */
export const MODELES = {
  hormozi: {
    libelle: 'Hormozi', note: 'Montserrat jaune — le plus courant sur les shorts',
    style: 'mot-a-mot-couleur', police: 'Montserrat', motsParPage: 3, casse: 'majuscules',
    taille: 78, positionBas: 30, contour: true, epaisseurContour: 1,
    couleurTexte: '#FFFFFF', couleurSurligne: '#FFE000', couleurContour: '#000000',
    animation: 'pop', ponctuation: false,
  },
  beast: {
    libelle: 'Beast', note: 'Anton vert',
    style: 'mot-a-mot-couleur', police: 'Anton', motsParPage: 3, casse: 'majuscules',
    taille: 78, positionBas: 30, contour: true, epaisseurContour: 1,
    couleurTexte: '#FFFFFF', couleurSurligne: '#46FF45', couleurContour: '#000000',
    animation: 'pop', ponctuation: false,
  },
  bebas: {
    libelle: 'Bebas', note: 'condensé, posé bas',
    style: 'mot-a-mot-couleur', police: 'Anton', motsParPage: 4, casse: 'majuscules',
    taille: 89, positionBas: 12, contour: true, epaisseurContour: 0.9,
    couleurTexte: '#FFFFFF', couleurSurligne: '#FFD400', couleurContour: '#000000',
    animation: 'fade', ponctuation: false,
  },
  tiktok: {
    libelle: 'TikTok', note: 'Poppins rouge, bas de cadre',
    style: 'mot-a-mot-couleur', police: 'Poppins', motsParPage: 3, casse: 'majuscules',
    taille: 78, positionBas: 12, contour: true, epaisseurContour: 1,
    couleurTexte: '#FFFFFF', couleurSurligne: '#FF3B5C', couleurContour: '#000000',
    animation: 'bounce', ponctuation: false,
  },
  pastille: {
    libelle: 'Pastille', note: 'le mot dit sur un bloc de couleur',
    style: 'mot-a-mot-pastille', police: 'Montserrat', motsParPage: 3, casse: 'majuscules',
    taille: 78, positionBas: 30, contour: true, epaisseurContour: 0.8,
    couleurTexte: '#FFFFFF', couleurSurligne: '#A51D7A', couleurContour: '#000000',
    animation: 'pop', ponctuation: false,
  },
  neon: {
    libelle: 'Neon', note: 'cyan et magenta, contour épais',
    style: 'mot-a-mot-couleur', police: 'ArchivoBlack', motsParPage: 3, casse: 'majuscules',
    taille: 78, positionBas: 30, contour: true, epaisseurContour: 1.6,
    couleurTexte: '#13F0FF', couleurSurligne: '#FF35E0', couleurContour: '#04121A',
    animation: 'bounce', ponctuation: false,
  },
  inter: {
    libelle: 'Inter', note: 'sobre et moderne, surlignage menthe',
    style: 'mot-a-mot-couleur', police: 'Inter', motsParPage: 3, casse: 'majuscules',
    taille: 78, positionBas: 30, contour: true, epaisseurContour: 0.9,
    couleurTexte: '#FFFFFF', couleurSurligne: '#19E3B1', couleurContour: '#000000',
    animation: 'pop', ponctuation: false,
  },
  fraunces: {
    libelle: 'Fraunces', note: 'sérif éditorial, or — sans majuscules',
    style: 'mot-a-mot-couleur', police: 'Fraunces', motsParPage: 4, casse: 'normale',
    taille: 86, positionBas: 14, contour: true, epaisseurContour: 0.8,
    couleurTexte: '#FFFFFF', couleurSurligne: '#E7C873', couleurContour: '#000000',
    animation: 'fade', ponctuation: true,
  },
  clean: {
    libelle: 'Clean', note: 'discret, contour fin, bas de cadre',
    style: 'mot-a-mot-couleur', police: 'Poppins', motsParPage: 4, casse: 'normale',
    taille: 74, positionBas: 10, contour: true, epaisseurContour: 0.6,
    couleurTexte: '#FFFFFF', couleurSurligne: '#FFD400', couleurContour: '#000000',
    animation: 'fade', ponctuation: true,
  },
  karaoke: {
    libelle: 'Karaoké', note: 'la ligne se colore au fur et à mesure',
    style: 'ligne-karaoke', police: 'Montserrat', motsParPage: 4, casse: 'majuscules',
    taille: 76, positionBas: 22, contour: true, epaisseurContour: 1,
    couleurTexte: '#FFFFFF', couleurSurligne: '#FFE000', couleurContour: '#000000',
    animation: 'fade', ponctuation: false,
  },
  classique: {
    libelle: 'Classique', note: 'phrase entière, aucun surlignage — pour du long format',
    style: 'bloc-2-lignes', police: 'Inter', motsParPage: 5, casse: 'normale',
    taille: 54, positionBas: 8, contour: true, epaisseurContour: 0.7,
    couleurTexte: '#FFFFFF', couleurSurligne: '#FFFFFF', couleurContour: '#000000',
    animation: 'fade', ponctuation: true,
  },
}

/** Les bornes des curseurs, reprises de leur `index.html`. */
export const BORNES = {
  motsParPage: { min: 1, max: 5, pas: 1 },
  // Leur curseur « Taille » va de 60 % à 170 % d'un corps de 78 px.
  taille: { min: 47, max: 133, pas: 1 },
  positionBas: { min: 4, max: 84, pas: 1 },
  epaisseurContour: { min: 0, max: 2, pas: 0.05 },
}

export const ANIMATIONS = ['aucune', 'fondu', 'pop', 'rebond']
export const STYLES = ['mot-a-mot-couleur', 'mot-a-mot-pastille', 'ligne-karaoke', 'bloc-2-lignes']

const CHAMPS = [
  'style', 'police', 'motsParPage', 'casse', 'taille', 'positionBas',
  'contour', 'epaisseurContour', 'couleurTexte', 'couleurSurligne',
  'couleurContour', 'animation', 'ponctuation',
]

/**
 * Le niveau 4 : ce que dit l'identité visuelle de la chaîne.
 *
 * On part du modèle nommé dans `identite_visuelle.modele_soustitres` — ou de
 * Hormozi, le plus sûr — puis on écrase avec les couleurs et la police de la
 * chaîne quand elles sont renseignées. Une chaîne a une identité ; un modèle
 * n'est qu'un point de départ.
 */
function depuisIdentite(chaine, { vertical }) {
  const iv = chaine?.identite_visuelle ?? {}
  const base = MODELES[iv.modele_soustitres] ?? MODELES.hormozi
  const r = { ...base }
  if (iv.style_soustitres) r.style = iv.style_soustitres
  if (iv.police_soustitres) r.police = iv.police_soustitres
  if (iv.casse_soustitres) r.casse = iv.casse_soustitres
  if (iv.couleur_texte) r.couleurTexte = iv.couleur_texte
  if (iv.couleur_pastille || iv.couleur_accent) r.couleurSurligne = iv.couleur_pastille || iv.couleur_accent
  // LE BLOC EXPLICITE PASSE AVANT TOUT LE RESTE DE L'IDENTITÉ.
  //
  // Les clés éparses ci-dessus (`couleur_pastille`, `police_soustitres`…)
  // servent à toutes sortes d'usages : une infographie, un titre, une vignette.
  // Les dériver suffit à démarrer une chaîne, pas à figer une direction
  // artistique validée à l'image. `identite_visuelle.soustitres` est là pour
  // ça : ce qu'on y écrit est ce qu'on verra, sans reconstruction.
  if (iv.soustitres && typeof iv.soustitres === 'object') {
    for (const [champ, valeur] of Object.entries(iv.soustitres)) {
      if (valeur !== undefined && valeur !== null) r[champ] = valeur
    }
  }

  // Un format horizontal se regarde de plus loin : le texte y prend moins de
  // place à l'écran, et n'a pas à éviter l'interface de TikTok.
  if (!vertical) {
    r.taille = Math.round(r.taille * 0.75)
    r.positionBas = Math.min(r.positionBas, 12)
    r.motsParPage = Math.max(r.motsParPage, 5)
  }
  return r
}

/**
 * Le niveau 3 : le défaut du format, s'il est déclaré dans chaine.json.
 *
 * DEUX ORTHOGRAPHES COHABITENT DANS CE DÉPÔT, ET IL FAUT LES ACCEPTER TOUTES
 * LES DEUX.
 *
 * `config/chaine.json → formats` nomme ses entrées avec des tirets bas
 * (`short_faceless`), tandis que les scripts écrivent leur format avec des
 * traits d'union (`short-faceless`). Une recherche littérale ne trouvait donc
 * jamais rien : ce niveau de la cascade était mort sans que rien ne le dise,
 * et les réglages tombaient silencieusement au niveau de la chaîne.
 *
 * On normalise des deux côtés plutôt que de trancher pour l'une des deux
 * écritures : renommer les clés de configuration casserait les chaînes déjà
 * initialisées à partir de ce modèle.
 */
const cleFormat = (f) => String(f ?? '').toLowerCase().replace(/[-_\s]+/g, '_')

function depuisFormat(chaine, format) {
  const formats = chaine?.formats
  if (!formats || !format) return null
  const vise = cleFormat(format)
  for (const [nom, valeur] of Object.entries(formats)) {
    if (nom.startsWith('_')) continue
    if (cleFormat(nom) === vise) return valeur?.soustitres ?? null
  }
  return null
}

/** Le niveau 2 : le choix enregistré pour CETTE vidéo. */
export function reglagesDe(slug) {
  return litJson(path.join(dossierVideo(slug).montage, 'soustitres.json'), null)
}

export function enregistreReglages(slug, reglages, { valide = false } = {}) {
  const chemin = path.join(dossierVideo(slug).montage, 'soustitres.json')
  const avant = reglagesDe(slug) ?? {}
  const apres = { ...avant, ...reglages }
  if (valide) apres.valide_le = new Date().toISOString()
  ecritJson(chemin, apres)
  return apres
}

/**
 * Oublie les réglages de cette vidéo — tous, ou seulement ceux qu'on nomme.
 *
 * OUBLIER UN CHAMP N'EST PAS LUI DONNER UNE VALEUR.
 *
 * On pourrait croire qu'annuler une modification revient à réécrire la valeur
 * d'origine. C'est faux, et la différence se voit plus tard : une valeur
 * réécrite est FIGÉE sur cette vidéo. Le jour où la chaîne change sa taille de
 * sous-titres, cette vidéo-là garde l'ancienne, et plus personne ne comprend
 * pourquoi. Retirer le champ le rend à la cascade — il suivra le format, puis
 * l'identité de la chaîne, comme s'il n'avait jamais été touché.
 */
export function oublieReglages(slug, champs = null) {
  const chemin = path.join(dossierVideo(slug).montage, 'soustitres.json')
  if (!fs.existsSync(chemin)) return
  if (!champs || !champs.length) {
    fs.rmSync(chemin)
    return
  }
  const avant = litJson(chemin, null)
  if (!avant) return
  for (const champ of champs) delete avant[champ]
  // Il ne reste que la trace de validation : le fichier ne décrit plus rien.
  const utiles = Object.keys(avant).filter((c) => c !== 'valide_le' && c !== 'modele')
  if (!utiles.length) fs.rmSync(chemin)
  else ecritJson(chemin, avant)
}

/**
 * Écrit les réglages courants comme DÉFAUT DE LA CHAÎNE.
 *
 * Ils vont dans `identite_visuelle.soustitres`, le bloc explicite : ce qu'on y
 * met est ce qu'on verra, sans reconstruction à partir des couleurs éparses.
 * Toutes les vidéos qui n'ont pas de réglage à elles suivront.
 *
 * On ne touche à rien d'autre du fichier d'identité : il est écrit à la main,
 * il porte des commentaires en `_clé`, et une réécriture complète les perdrait.
 */
export function enregistreDefautDeChaine(reglages) {
  const chemin = CHEMINS.chaine
  const chaine = litJson(chemin, null)
  if (!chaine) throw new Error(`config/chaine.json est illisible : on n'y écrit rien.`)

  chaine.identite_visuelle = chaine.identite_visuelle ?? {}
  const bloc = {}
  for (const champ of CHAMPS) if (reglages[champ] !== undefined) bloc[champ] = reglages[champ]
  chaine.identite_visuelle.soustitres = bloc
  chaine.identite_visuelle._soustitres =
    `Direction artistique validée à l'écran le ` +
    `${new Date().toLocaleDateString('fr-FR')}. Ce bloc prime sur les couleurs ` +
    `éparses ci-dessus. Se règle par vidéo avec : npm run soustitres -- <slug>`
  ecritJson(chemin, chaine)
  return bloc
}

/**
 * Résout les quatre niveaux et rend les réglages effectifs, avec leur origine.
 *
 * L'origine n'est pas cosmétique : quand un sous-titre ne ressemble pas à ce
 * qu'on croyait avoir réglé, la première question est toujours « d'où vient
 * cette valeur ». La commande l'affiche, l'atelier aussi.
 */
export function reglagesPour(slug, { chaine, format, vertical, surcharge = {} } = {}) {
  const identite = depuisIdentite(chaine, { vertical })
  const duFormat = depuisFormat(chaine, format)
  const deLaVideo = slug ? reglagesDe(slug) : null

  const origine = {}
  const r = {}
  for (const champ of CHAMPS) {
    if (surcharge[champ] !== undefined) { r[champ] = surcharge[champ]; origine[champ] = 'ligne de commande' }
    else if (deLaVideo && deLaVideo[champ] !== undefined) { r[champ] = deLaVideo[champ]; origine[champ] = 'cette vidéo' }
    else if (duFormat && duFormat[champ] !== undefined) { r[champ] = duFormat[champ]; origine[champ] = `format ${format}` }
    else { r[champ] = identite[champ]; origine[champ] = 'identité de la chaîne' }
  }
  return { reglages: r, origine, valide_le: deLaVideo?.valide_le ?? null, modele: deLaVideo?.modele ?? null }
}

/**
 * Traduit les réglages en bloc `theme.sousTitres` du plan de montage.
 *
 * C'est le seul point de contact avec Remotion : tout le reste du fichier
 * ignore comment le rendu s'y prend.
 */
export function versTheme(reglages) {
  return {
    // LA POLICE FAISAIT EXCEPTION, ET C'EST TOUT LE DÉFAUT.
    //
    // Elle vivait dans `theme.policeSousTitres`, à côté du bloc, et `patcheLePlan`
    // ne réécrit QUE le bloc. On changeait donc la police dans le studio, on la
    // voyait dans l'aperçu — qui lit les réglages, pas le plan — et le rendu
    // sortait avec l'ancienne. Relevé sur une vidéo réelle : réglages « Roboto »,
    // plan « Montserrat », douze minutes de rendu pour s'en apercevoir.
    //
    // Remotion lit déjà `st.police ?? theme.policeSousTitres` : en la mettant
    // dans le bloc, elle emprunte le même chemin que les onze autres réglages,
    // et il n'y a plus d'exception à retenir.
    police: reglages.police,
    style: reglages.style,
    motsParPage: reglages.motsParPage,
    casse: reglages.casse,
    taille: reglages.taille,
    positionBas: reglages.positionBas,
    contour: reglages.contour,
    epaisseurContour: reglages.epaisseurContour,
    couleurTexte: reglages.couleurTexte,
    couleurSurligne: reglages.couleurSurligne,
    couleurContour: reglages.couleurContour,
    animation: reglages.animation,
    ponctuation: reglages.ponctuation,
  }
}

/** Vérifie qu'un jeu de réglages est utilisable. Rend la liste des reproches. */
export function verifie(r) {
  const reproches = []
  if (!STYLES.includes(r.style)) reproches.push(`style inconnu « ${r.style} » — attendu ${STYLES.join(' · ')}`)
  if (!ANIMATIONS.includes(r.animation)) reproches.push(`animation inconnue « ${r.animation} » — attendu ${ANIMATIONS.join(' · ')}`)
  if (!['majuscules', 'normale'].includes(r.casse)) reproches.push(`casse inconnue « ${r.casse} »`)
  for (const [champ, b] of Object.entries(BORNES)) {
    const v = Number(r[champ])
    if (!Number.isFinite(v) || v < b.min || v > b.max) {
      reproches.push(`${champ} = ${r[champ]} hors bornes (${b.min} à ${b.max})`)
    }
  }
  for (const champ of ['couleurTexte', 'couleurSurligne', 'couleurContour']) {
    if (!/^#[0-9a-f]{6}$/i.test(String(r[champ] ?? ''))) {
      reproches.push(`${champ} = « ${r[champ]} » n'est pas un #RRGGBB`)
    }
  }
  const dispo = policesDisponibles()
  if (dispo.length && !dispo.includes(r.police)) {
    reproches.push(`police « ${r.police} » absente d'assets/fonts — disponibles : ${dispo.join(', ')}`)
  }
  return reproches
}
