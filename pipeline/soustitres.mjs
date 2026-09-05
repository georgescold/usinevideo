#!/usr/bin/env node
/**
 * soustitres.mjs — régler le sous-titrage d'une vidéo, sans rejouer le montage.
 *
 * Toute la matière est dans `lib/soustitres.mjs` : les onze modèles, les bornes,
 * la cascade à quatre niveaux, la traduction vers le thème du plan. Ce fichier
 * n'est qu'une porte d'entrée : il lit la ligne de commande, montre D'OÙ VIENT
 * chaque valeur, écrit `05-montage/soustitres.json`, et patche le plan.
 *
 * POURQUOI LE PATCH DU PLAN EST LE CŒUR DE CETTE COMMANDE.
 *
 * Un plan de montage coûte cher à fabriquer : coupe des silences, conversion du
 * timbre, transcription mot à mot, calage des événements. Le style des
 * sous-titres, lui, n'entre nulle part dans ce calcul — c'est une feuille de
 * style posée par-dessus des instants déjà connus. Refaire le montage pour
 * changer une couleur reviendrait à repayer une transcription pour un jaune.
 *
 * On réécrit donc `plan.theme.sousTitres` sur place, et il ne reste qu'à rendre.
 * Le plan est le seul état durable du montage : on ne l'écrit jamais en direct
 * mais dans un temporaire, renommé ensuite — un plan à moitié écrit, c'est un
 * montage à refaire.
 *
 *   npm run soustitres -- mon-slug
 *   npm run soustitres -- mon-slug --modele=hormozi
 *   npm run soustitres -- mon-slug --couleurSurligne=#FFE000 --taille=84
 *   npm run soustitres -- mon-slug --valide
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, dossierVideo, litJson } from './lib/chemins.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { estVertical } from './lib/montage.mjs'
import {
  MODELES,
  BORNES,
  ANIMATIONS,
  STYLES,
  policesDisponibles,
  reglagesPour,
  enregistreReglages,
  oublieReglages,
  enregistreDefautDeChaine,
  versTheme,
  verifie,
} from './lib/soustitres.mjs'

const { options, positionnels } = litArgs()

/**
 * Les champs réglables, dans l'ordre où l'atelier les présente.
 *
 * La même liste existe dans `lib/soustitres.mjs` (`CHAMPS`) sans être exportée.
 * Les deux doivent rester alignées : un champ ajouté là-bas et oublié ici serait
 * réglable par la cascade mais pas par la commande.
 */
const CHAMPS = [
  'style', 'police', 'motsParPage', 'casse', 'taille', 'positionBas',
  'epaisseurContour', 'couleurTexte', 'couleurSurligne', 'couleurContour',
  'contour', 'ponctuation', 'animation',
]

/**
 * Les noms d'animation de Scriptshort, traduits à l'entrée.
 *
 * Sept des onze modèles de `lib/soustitres.mjs` portent encore `fade` ou
 * `bounce`, alors que `ANIMATIONS` ne connaît que le français : appliqués tels
 * quels, ils sont refusés par `verifie()` et aucun ne s'enregistre. On traduit
 * ici plutôt que d'écrire dans un fichier une valeur que le rendu ne sait pas
 * lire. Quand la bibliothèque aura été corrigée, cette table ne servira plus
 * qu'à tolérer l'anglais sur la ligne de commande.
 */
const ANIMATIONS_TRADUITES = { none: 'aucune', fade: 'fondu', pop: 'pop', bounce: 'rebond' }

const NUMERIQUES = new Set(['motsParPage', 'taille', 'positionBas', 'epaisseurContour'])
const BOOLEENS = new Set(['contour', 'ponctuation'])
const COULEURS = new Set(['couleurTexte', 'couleurSurligne', 'couleurContour'])

/** Les drapeaux qui ne sont pas des champs de réglage. */
const DRAPEAUX = ['aide', 'help', 'json', 'valide', 'oublie', 'applique', 'modele', 'modeles', 'defaut']

aide(
  options,
  `
npm run soustitres -- <slug> [options]

Sans option : affiche les réglages effectifs et l'origine de chaque champ.

  --modele=<clé>          applique un modèle entier (--modeles pour les voir)
  --style=<...>           ${STYLES.join(' · ')}
  --police=<famille>      une des familles présentes dans assets/fonts
  --motsParPage=3         ${BORNES.motsParPage.min} à ${BORNES.motsParPage.max}
  --casse=majuscules      majuscules · normale
  --taille=78             ${BORNES.taille.min} à ${BORNES.taille.max}
  --positionBas=30        ${BORNES.positionBas.min} à ${BORNES.positionBas.max}, en % de hauteur depuis le bas
  --epaisseurContour=1    ${BORNES.epaisseurContour.min} à ${BORNES.epaisseurContour.max}
  --couleurTexte=#FFFFFF
  --couleurSurligne=#FFE000
  --couleurContour=#000000
  --contour[=false]       le trait autour des lettres
  --ponctuation[=true]    garde la ponctuation finale des mots
  --animation=pop         ${ANIMATIONS.join(' · ')}

  --valide                marque les réglages comme validés à l'image
  --oublie                efface les réglages de CETTE vidéo : retour aux défauts
  --oublie=taille,hauteur rend CES champs-là à la cascade, et eux seuls
  --defaut                écrit les réglages courants comme défaut de la
                          CHAÎNE : toutes les vidéos sans réglage propre suivent
  --applique              réécrit le plan avec les réglages effectifs, sans rien changer d'autre
  --modeles               liste les onze modèles et s'arrête
  --json                  sortie machine, pour l'atelier

Les noms de champs s'écrivent aussi en tirets : --mots-par-page, --couleur-texte.
Toute écriture patche 05-montage/plan.json quand il existe : le style change sans
rejouer le montage, il ne reste plus qu'à relancer le rendu.
`
)

const enJson = drapeau(options, 'json')

// ---------------------------------------------------------------------------
//  Lecture des champs sur la ligne de commande
// ---------------------------------------------------------------------------

const sansTirets = (nom) => nom.toLowerCase().replace(/[-_]/g, '')
const PAR_NOM = new Map(CHAMPS.map((c) => [sansTirets(c), c]))

function versBooleen(champ, brut) {
  if (brut === true) return true
  const v = String(brut).toLowerCase()
  if (['true', '1', 'oui', 'vrai'].includes(v)) return true
  if (['false', '0', 'non', 'faux'].includes(v)) return false
  throw new Error(`--${champ} attend oui ou non, pas « ${brut} ».`)
}

function versNombre(champ, brut) {
  if (brut === true) throw new Error(`--${champ} attend une valeur : --${champ}=<nombre>.`)
  const n = Number(String(brut).replace(',', '.'))
  if (!Number.isFinite(n)) throw new Error(`--${champ} attend un nombre, pas « ${brut} ».`)
  return n
}

/** Tolère `FFE000` et `#FFF` : la couleur se recopie souvent sans son dièse. */
function versCouleur(champ, brut) {
  if (brut === true) throw new Error(`--${champ} attend une couleur : --${champ}=#RRGGBB.`)
  let v = String(brut).trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('')
  return `#${v}`
}

/**
 * Ce que la ligne de commande demande de changer.
 *
 * Une option inconnue arrête tout plutôt que d'être ignorée : `--taile=90` qui
 * ne fait rien en silence, on le découvre au rendu, une fois payé le temps de
 * machine.
 */
function champsDemandes() {
  const demandes = {}
  for (const [nom, brut] of Object.entries(options)) {
    if (DRAPEAUX.includes(nom)) continue
    const champ = PAR_NOM.get(sansTirets(nom))
    if (!champ) {
      throw new Error(
        `Option inconnue « --${nom} ».\n` +
          `  Champs réglables : ${CHAMPS.join(', ')}\n` +
          `  Voir npm run soustitres -- --aide`
      )
    }
    if (BOOLEENS.has(champ)) demandes[champ] = versBooleen(champ, brut)
    else if (NUMERIQUES.has(champ)) demandes[champ] = versNombre(champ, brut)
    else if (COULEURS.has(champ)) demandes[champ] = versCouleur(champ, brut)
    else {
      if (brut === true) throw new Error(`--${champ} attend une valeur : --${champ}=<...>.`)
      demandes[champ] = String(brut)
    }
  }
  return demandes
}

// ---------------------------------------------------------------------------
//  Le patch du plan
// ---------------------------------------------------------------------------

/**
 * Le bloc à poser dans `plan.theme.sousTitres`.
 *
 * `versTheme()` n'emporte pas la police : elle vivait jusqu'ici dans
 * `theme.policeSousTitres`, réglée pour la chaîne entière. Le rendu sait
 * désormais lire `sousTitres.police` et retombe sur l'ancienne quand elle
 * manque, donc on la joint ici — sans quoi le choix de police serait le seul
 * réglage de l'écran « Sous-titres » à ne rien changer à l'image. Le jour où
 * `versTheme()` l'emportera lui-même, cette ligne devient inerte.
 */
function blocPourLePlan(reglages) {
  const bloc = versTheme(reglages)
  if (bloc.police === undefined && reglages.police) bloc.police = reglages.police
  return bloc
}

const memeBloc = (a, b) => {
  const rangé = (o) =>
    JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).sort(([x], [y]) => x.localeCompare(y))))
  return rangé(a) === rangé(b)
}

/**
 * Remplace le bloc de sous-titres d'un plan existant, et rien d'autre.
 *
 * On vérifie la forme avant d'écrire : un fichier qui n'a ni thème ni mots n'est
 * pas un plan, et le réparer à l'aveugle ferait plus de dégâts que de le laisser
 * tel quel. L'écriture passe par un temporaire renommé, parce qu'un plan tronqué
 * par une coupure oblige à refaire tout le montage.
 */
function patcheLePlan(cheminPlan, bloc) {
  if (!fs.existsSync(cheminPlan)) return { patche: false, raison: 'aucun plan à mettre à jour' }

  let plan
  try {
    plan = JSON.parse(fs.readFileSync(cheminPlan, 'utf8'))
  } catch (e) {
    return { patche: false, raison: `plan illisible (${e.message.split('\n')[0]})` }
  }
  if (
    !plan || typeof plan !== 'object' || Array.isArray(plan) ||
    !plan.theme || typeof plan.theme !== 'object' || Array.isArray(plan.theme) ||
    !Array.isArray(plan.mots)
  ) {
    return { patche: false, raison: 'le plan n\'a pas la forme attendue — refait le montage' }
  }
  if (memeBloc(plan.theme.sousTitres, bloc)) return { patche: false, raison: 'plan déjà à jour' }

  plan.theme.sousTitres = bloc
  const temporaire = `${cheminPlan}.tmp-${process.pid}`
  try {
    fs.writeFileSync(temporaire, JSON.stringify(plan, null, 2) + '\n', 'utf8')
    fs.renameSync(temporaire, cheminPlan)
  } catch (e) {
    fs.rmSync(temporaire, { force: true })
    throw new Error(`Le plan n'a pas pu être réécrit : ${e.message}`)
  }
  return { patche: true, raison: null }
}

// ---------------------------------------------------------------------------

await principal(async () => {
  // ------------------------------------------------------------- modèles ----
  if (drapeau(options, 'modeles')) {
    if (enJson) {
      console.log(JSON.stringify({ modeles: MODELES, bornes: BORNES, animations: ANIMATIONS, styles: STYLES }, null, 2))
      return
    }
    journal.titre(`${Object.keys(MODELES).length} modèles de sous-titres`)
    for (const [cle, m] of Object.entries(MODELES)) {
      console.log(`  ${cle.padEnd(11)} ${String(m.libelle).padEnd(11)} ${m.note}`)
    }
    console.log('')
    journal.detail(`Applique-en un : npm run soustitres -- <slug> --modele=hormozi`)
    return
  }

  const slug = positionnels[0]
  if (!slug) {
    throw new Error(`Donne le slug de la vidéo, ou --modeles pour voir les modèles disponibles.`)
  }
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.base)) {
    throw new Error(`Aucune vidéo « ${slug} » dans ${path.relative(CHEMINS.racine, CHEMINS.videos)}.`)
  }

  const chaine = litJson(CHEMINS.chaine, {})
  const script = litJson(v.scriptJson, null)
  const plan = litJson(v.plan, null)

  // Le format décide de la taille et de la position par défaut. Il se lit sur le
  // script ; à défaut sur le plan déjà construit, qui le porte aussi.
  const format = script?.format ?? plan?.format ?? 'long_faceless'
  const vertical = estVertical(format)

  const demandes = champsDemandes()
  const modele = options.modele && options.modele !== true ? String(options.modele) : null
  if (modele && !MODELES[modele]) {
    throw new Error(
      `Modèle inconnu « ${modele} ».\n  Disponibles : ${Object.keys(MODELES).join(', ')}`
    )
  }

  // Un modèle s'applique EN ENTIER : sinon on hérite de la moitié d'un réglage
  // précédent et le résultat ne ressemble à aucune des deux vignettes. On n'en
  // retient que les champs réglables — `libelle` et `note` décrivent la vignette,
  // ils n'ont rien à faire dans les réglages d'une vidéo. Les champs donnés
  // explicitement passent quand même devant.
  const duModele = modele
    ? Object.fromEntries(CHAMPS.filter((c) => MODELES[modele][c] !== undefined).map((c) => [c, MODELES[modele][c]]))
    : {}
  const surcharge = { ...duModele, ...demandes }
  if (surcharge.animation && ANIMATIONS_TRADUITES[surcharge.animation]) {
    surcharge.animation = ANIMATIONS_TRADUITES[surcharge.animation]
  }
  const ecrit = drapeau(options, 'valide') || options.oublie !== undefined || Object.keys(surcharge).length > 0

  // -------------------------------------------------------------- oublie ----
  if (options.oublie !== undefined) {
    // `--oublie` seul efface tout ; `--oublie=taille,hauteur` ne rend que
    // ces champs-là à la cascade. C'est ce que fait la flèche de l'atelier,
    // à côté de chaque réglage.
    const nommes =
      typeof options.oublie === 'string'
        ? options.oublie.split(',').map((c) => sansTirets(c.trim())).filter(Boolean)
        : []
    const inconnus = nommes.filter((c) => !PAR_NOM.has(c))
    if (inconnus.length) {
      throw new Error(
        `Champ inconnu : ${inconnus.join(', ')}\n` +
          `  Champs réglables : ${CHAMPS.join(', ')}`
      )
    }
    oublieReglages(slug, nommes.map((c) => PAR_NOM.get(c)))
  }

  // ------------------------------------------------------------- écriture ----
  if (Object.keys(surcharge).length || drapeau(options, 'valide')) {
    const essai = reglagesPour(slug, { chaine, format, vertical, surcharge })
    const reproches = verifie(essai.reglages)
    if (reproches.length) {
      throw new Error(
        `Ces réglages ne sont pas rendables, rien n'a été enregistré :\n` +
          reproches.map((r) => `  · ${r}`).join('\n')
      )
    }
    const aEcrire = { ...surcharge }
    // On garde le nom du modèle : il n'entre dans aucun calcul, mais il dit à
    // l'atelier quelle vignette allumer, et à l'utilisateur d'où il est parti.
    if (modele) aEcrire.modele = modele
    enregistreReglages(slug, aEcrire, { valide: drapeau(options, 'valide') })
  }

  // ------------------------------------------------ réglages effectifs ------
  const { reglages, origine, valide_le, modele: modeleRetenu } = reglagesPour(slug, { chaine, format, vertical })
  const reproches = verifie(reglages)
  const bloc = blocPourLePlan(reglages)

  // ------------------------------------------------- défaut de la chaîne ----
  //
  // ON FIGE CE QU'ON VOIT, PAS CE QU'ON VIENT DE TAPER.
  //
  // Les réglages effectifs sont le résultat de la cascade entière — un champ
  // qu'on n'a jamais touché sur cette vidéo y figure avec la valeur qui la sert
  // réellement. C'est bien celle-là qu'on veut promouvoir en défaut : promouvoir
  // la seule surcharge de la ligne de commande donnerait un défaut de chaîne
  // partiel, et le reste continuerait de se reconstruire depuis les couleurs
  // éparses.
  let defautEcrit = null
  if (drapeau(options, 'defaut')) {
    const reprochesDefaut = verifie(reglages)
    if (reprochesDefaut.length) {
      throw new Error(
        `Ces réglages ne sont pas rendables, le défaut de la chaîne n'a pas bougé :\n` +
          reprochesDefaut.map((r) => `  · ${r}`).join('\n')
      )
    }
    defautEcrit = enregistreDefautDeChaine(reglages)
  }

  const patch = ecrit || drapeau(options, 'applique')
    ? patcheLePlan(v.plan, bloc)
    : { patche: false, raison: plan && !memeBloc(plan.theme?.sousTitres, bloc) ? 'plan désynchronisé' : null }

  // ------------------------------------------------------------ affichage ----
  if (enJson) {
    // Tout ce dont l'atelier a besoin pour dessiner l'écran d'un coup : les
    // valeurs, leur origine, et les listes dans lesquelles piocher.
    console.log(JSON.stringify({
      ok: true,
      slug,
      format,
      vertical,
      reglages,
      origine,
      valide_le,
      modele: modeleRetenu,
      defaut_de_chaine: defautEcrit,
      reproches,
      plan: { existe: Boolean(plan), patche: patch.patche, raison: patch.raison },
      modeles: MODELES,
      bornes: BORNES,
      animations: ANIMATIONS,
      styles: STYLES,
      polices: policesDisponibles(),
    }, null, 2))
    return
  }

  journal.titre(`Sous-titres · ${slug}`)
  if (defautEcrit) {
    journal.ok(`Défaut de la chaîne mis à jour — config/chaine.json`)
    journal.detail(`Toutes les vidéos sans réglage propre suivront ces valeurs.`)
  }
  journal.info(`${format} · ${vertical ? '1080×1920' : '1920×1080'}${modeleRetenu ? ` · modèle ${modeleRetenu}` : ''}`)
  console.log('')
  for (const champ of CHAMPS) {
    const valeur = reglages[champ]
    console.log(
      `  ${champ.padEnd(18)} ${String(valeur).padEnd(20)} ${origine[champ] ?? ''}`
    )
  }
  console.log('')

  if (reproches.length) {
    journal.attention(`Ces réglages ne se rendront pas tels quels :`)
    for (const r of reproches) journal.detail(`· ${r}`)
  }

  if (valide_le) journal.ok(`Validé à l'image le ${valide_le.slice(0, 10)}.`)
  else journal.detail(`Pas encore validé à l'image : --valide quand le rendu te convient.`)

  if (patch.patche) {
    journal.ok(`Plan de montage mis à jour — pas besoin de remonter.`)
    journal.detail(`Il ne reste qu'à rendre : npm run rends -- ${slug}`)
  } else if (patch.raison === 'plan désynchronisé') {
    journal.attention(`Le plan porte d'autres sous-titres que ceux-ci.`)
    journal.detail(`Réaligne-le sans rien remonter : npm run soustitres -- ${slug} --applique`)
  } else if (patch.raison && (ecrit || drapeau(options, 'applique'))) {
    journal.detail(patch.raison)
  }
})
