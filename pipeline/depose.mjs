#!/usr/bin/env node
/**
 * depose.mjs — poser un rush dans une vidéo, et laisser le fichier dire ce qu'il est.
 *
 * C'est la première étape qui touche à la matière : avant elle il n'y a qu'un
 * script, après elle il y a quelque chose à monter. Elle ne transforme rien —
 * ni conversion, ni ré-encodage, ni normalisation. Elle range, elle sonde, et
 * elle dit ce qu'elle a compris.
 *
 * DEUX CHOSES SE DÉCIDENT ICI, ET AUCUNE N'EST COSMÉTIQUE.
 *
 * 1. **Le nom.** Le montage prend les rushes dans l'ordre alphabétique
 *    (`prendsLesRushes` dans lib/montage.mjs). `prise-2` se classe APRÈS
 *    `prise-10` : deux prises numérotées à la main dans le désordre suffisent à
 *    inverser deux paragraphes du montage final, sans qu'aucune étape ne s'en
 *    plaigne. D'où la numérotation sur deux chiffres, posée par la commande et
 *    jamais par la personne.
 *
 * 2. **Le mode de production.** Il se lit sur le fichier, jamais sur le script
 *    (CLAUDE.md §3). Le script déclare un format avant le tournage, donc il peut
 *    se tromper ; le fichier déposé, non. On suit le fichier ET on signale la
 *    divergence, comme le fait déjà `monte.mjs` au moment du calage.
 *
 *   npm run depose -- mon-slug ~/Bureau/prise.mp3
 *   npm run depose -- mon-slug ~/Bureau/plan-ville.mp4 --coupe
 *   npm run depose -- mon-slug prise.wav --destination=youtube --json
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CHEMINS,
  assureDossierVideo,
  dossierVideo,
  litJson,
  ecritJson,
  litChaine,
} from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { sonde } from './lib/ffmpeg.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run depose -- <slug> <fichier> [options]

  --coupe                 range le fichier comme plan de coupe (coupe-NN)
                          au lieu d'une prise (prise-NN)
  --retire                met de côté TOUTES les prises ET tout ce qui en
                          découle, pour pouvoir en déposer une autre
  --retire=<prise>        n'en retire qu'UNE : « prise-02.mp3 », « prise-02 »
                          ou « 2 ». Les autres restent, et ce qui découlait de
                          la piste entière part aussi — elle a changé
  --destination=<où>      youtube | tiktok-insta — ne sert qu'à écrire le
                          squelette de script quand il n'y en a pas encore
  --json                  sortie machine, pour l'atelier

Extensions acceptées : .mp3 .m4a .wav .mp4 .mov

Le fichier est copié sous videos/<slug>/02-tournage/, numéroté sur deux chiffres
pour que l'ordre alphabétique du montage soit l'ordre du tournage.

Ensuite : npm run monte -- <slug>
`
)

/**
 * Ce qu'on accepte comme rush.
 *
 * Volontairement plus étroit que ce que `prendsLesRushes` sait lire : ce qui
 * entre dans le dossier passe par ici, et une liste courte se vérifie à l'œil.
 * Un conteneur exotique se convertit avant d'être déposé — mieux vaut échouer
 * au dépôt qu'au bout de huit minutes de rendu.
 */
const EXTENSIONS = ['.mp3', '.m4a', '.wav', '.mp4', '.mov']

/**
 * Ce que le MONTAGE sait lire, pour le retrait.
 *
 * Plus large que `EXTENSIONS`, qui borne ce qu'on accepte de déposer : une
 * prise arrivée autrement — copiée à la main dans le dossier — doit pouvoir
 * être retirée aussi, sinon elle resterait à remonter le montage sans qu'aucun
 * bouton ne puisse l'enlever. La liste suit `prendsLesRushes`.
 */
const EXTENSIONS_LUES = /\.(mp4|mov|mkv|webm|avi|m4a|wav|mp3|aac|flac|ogg|opus)$/i

const DESTINATIONS = ['youtube', 'tiktok-insta']

/**
 * Les noms que Windows refuse d'attribuer à un dossier, quelle que soit
 * l'extension. `videos/con/` n'est pas créable, et l'erreur système ne dit pas
 * pourquoi.
 */
const RESERVES_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Un slug n'est pas une chaîne de caractères comme une autre : il devient un
 * NOM DE DOSSIER, donc un chemin.
 *
 * Ce dépôt a déjà fabriqué un dossier `....evasion` sur le Bureau à cause d'une
 * entrée non filtrée — les points de tête ont été lus comme « le dossier
 * au-dessus », et l'arborescence de la vidéo est partie ailleurs. On refuse donc
 * tout ce qui n'est pas strictement `kebab-case-sans-accent`, plutôt que de
 * nettoyer : un slug corrigé en silence ne pointe plus sur la même vidéo que
 * celui que la personne a tapé, et les étapes suivantes ne se retrouvent plus.
 */
function verifieSlug(brut, { dejaLa = false } = {}) {
  const slug = String(brut ?? '')
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length > 80) {
    throw new Error(
      `Slug refusé : « ${slug} ».\n` +
        `Attendu : minuscules, chiffres et traits d'union, commençant et finissant par ` +
        `une lettre ou un chiffre, 80 caractères au plus.\n` +
        `Ni point, ni espace, ni accent : ce nom devient un dossier.`
    )
  }
  if (RESERVES_WINDOWS.test(slug)) {
    throw new Error(
      `Slug refusé : « ${slug} » est un nom réservé par Windows (CON, PRN, AUX, NUL, ` +
        `COM1-9, LPT1-9). Aucun dossier ne peut porter ce nom.`
    )
  }
  // DEUX MOTS AU PLUS, ET C'EST UNE RÈGLE DE LA CHAÎNE.
  //
  // `court-difficile-a-obtenir` décrit la vidéo ; `difficile-obtenir` la
  // DÉSIGNE. La différence compte dès qu'on en a trente : un slug long se
  // retape mal, se lit mal dans une liste, et déborde partout — chemins,
  // journaux, noms de rendus. Le titre, lui, n'a aucune limite : il vit dans le
  // script et dans la publication, là où il sert vraiment.
  // La règle ne vaut qu'à la CRÉATION : une vidéo déjà sur le disque garde son
  // nom, sans quoi la renommer deviendrait obligatoire pour y déposer un rush
  // de plus — et renommer un dossier casse tout ce qui pointe dessus.
  const mots = slug.split('-').filter(Boolean)
  if (!dejaLa && mots.length > 2) {
    throw new Error(
      `Slug refusé : « ${slug} » fait ${mots.length} mots.
` +
        `Deux au plus — c'est un identifiant, pas un titre. Par exemple : ` +
        `« ${mots.slice(0, 2).join('-')} ».
` +
        `Le vrai titre s'écrit dans le script, où il n'a aucune limite.`
    )
  }
  return slug
}

/**
 * Le prochain numéro libre pour un préfixe donné.
 *
 * On lit les numéros déjà posés au lieu de compter les fichiers : un rush
 * supprimé à la main laisserait sinon deux fichiers avec le même numéro, et le
 * second écraserait le premier.
 */
function prochainNumero(dossier, prefixe) {
  if (!fs.existsSync(dossier)) return 1
  const motif = new RegExp(`^${prefixe}-(\\d+)`, 'i')
  let dernier = 0
  for (const fichier of fs.readdirSync(dossier)) {
    const m = motif.exec(fichier)
    if (m) dernier = Math.max(dernier, Number(m[1]))
  }
  return dernier + 1
}

/**
 * Le format à viser, déduit de la destination et de ce que porte le rush.
 *
 * On va chercher la clé dans `config/chaine.json → formats` plutôt que d'en
 * inventer une : c'est elle qui porte la durée cible et les réglages de
 * sous-titres du format, et un format absent de la config retombe silencieusement
 * sur les défauts de la chaîne. On préfère un format ACTIF — les inactifs ont été
 * écartés par la veille, les proposer par défaut irait contre cette décision.
 */
function formatVise(chaine, { destination, mode }) {
  const longueur = destination === 'youtube' ? 'long' : 'short'
  const candidats =
    mode === 'camera'
      ? [`${longueur}_screencast`, `${longueur}_face_camera`, `${longueur}_faceless`]
      : [`${longueur}_faceless`]

  const formats = chaine?.formats ?? {}
  return (
    candidats.find((c) => formats[c]?.actif) ??
    candidats.find((c) => formats[c]) ??
    candidats[candidats.length - 1]
  )
}

/**
 * Le squelette de script, écrit UNIQUEMENT quand il n'y en a pas.
 *
 * Il ne contient aucun bloc, donc il ne se monte pas : c'est voulu. Le script
 * réel s'écrit en conversation (`/script`), parce que le choix d'un angle et
 * d'une forme est un travail éditorial et pas un formulaire. Ce fichier n'existe
 * que pour que les étapes suivantes sachent quel format viser — dimensions,
 * durée cible, verticalité — avant qu'une ligne de texte ne soit écrite.
 */
function squelette(slug, { destination, mode }) {
  const chaine = litChaine()
  const format = formatVise(chaine, { destination, mode })

  // La durée cible d'un format est donnée en fourchette : on retient le milieu,
  // qui est ce que le contrôle de longueur de `monte.mjs` comparera.
  const fourchette = chaine?.formats?.[format]?.duree_cible_s
  const cible = Array.isArray(fourchette)
    ? Math.round((Number(fourchette[0]) + Number(fourchette[1])) / 2)
    : Number(fourchette)

  // Le niveau de conscience se lit sur l'avatar de la chaîne : le coder en dur
  // ici rendrait le dossier non réplicable (CLAUDE.md §6).
  const niveau = parseInt(String(chaine?.avatar?.niveau_de_conscience ?? ''), 10)

  return {
    _lecture:
      "Squelette pose par `npm run depose` : il n'a AUCUN bloc, donc il ne se monte pas. " +
      "Le script reel s'ecrit en conversation avec /script — c'est un travail editorial, " +
      "pas un formulaire. Ce fichier n'existe que pour que le montage sache quel format " +
      'viser (dimensions, duree cible, verticalite) des le depot du rush.',
    slug,
    format,
    destination,
    duree_cible_s: Number.isFinite(cible) ? cible : 90,
    niveau_conscience: Number.isFinite(niveau) ? niveau : 2,
    blocs: [],
  }
}

// ---------------------------------------------------------------------------
//  Retirer la prise en place
// ---------------------------------------------------------------------------

/**
 * Met de côté la prise, et TOUT CE QUI EN DÉCOULE.
 *
 * ON NE RETIRE PAS QUE LE FICHIER DÉPOSÉ, ET C'EST LE POINT IMPORTANT.
 *
 * `voix-finale.wav`, `04-transcript.json` et `05-montage/` ont été fabriqués à
 * partir de la prise qu'on retire. Les laisser en place produirait le pire
 * défaut possible de cette chaîne : un montage qui remonte l'ancienne voix, ou
 * des sous-titres calés sur un enregistrement qui n'est plus celui qu'on
 * entend. C'est exactement ce que §9 interdit — un sous-titre qui ne suit plus
 * la voix. Ils partent donc avec.
 *
 * ON MET DE CÔTÉ, ON NE DÉTRUIT PAS.
 *
 * §6 : « Tu ne supprimes ni rush ni rendu ». Un rendu se refait en huit
 * minutes, un tournage jamais. Tout atterrit horodaté dans
 * `.prises-precedentes/`, d'où rien n'empêche de le ressortir à la main.
 *
 * `voix-choisie.json` RESTE. Le timbre retenu est une décision éditoriale sur
 * la vidéo, pas une propriété de la prise : le refaire choisir à chaque
 * remplacement serait une corvée sans raison.
 */
function retireLaPrise(slug, cible = null) {
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.base)) throw new Error(`Aucune vidéo « ${slug} » dans videos/.`)

  const toutes = fs.existsSync(v.tournage)
    ? fs.readdirSync(v.tournage).filter((f) => EXTENSIONS_LUES.test(f))
    : []

  // RETIRER UNE PRISE PARMI PLUSIEURS.
  //
  // Deposer trois fois le meme fichier ne remplace pas : ca EMPILE, et le
  // montage colle les prises bout a bout dans l'ordre alphabetique. On se
  // retrouve avec quinze minutes la ou on en voulait cinq, et le seul recours
  // etait de tout retirer pour tout redeposer.
  //
  // On accepte trois ecritures de la meme chose — « prise-02.mp3 », « prise-02 »
  // et « 2 » — parce qu'on designe ce qu'on lit a l'ecran, et que ce qu'on y lit
  // n'est pas toujours le nom complet.
  let rushes = toutes
  if (cible !== null) {
    const voulu = String(cible).trim()
    const parNumero = /^\d{1,3}$/.test(voulu)
      ? new RegExp(`-0*${Number(voulu)}\\.[a-z0-9]+$`, 'i')
      : null
    const trouve = toutes.find(
      (f) =>
        f.toLowerCase() === voulu.toLowerCase() ||
        f.replace(/\.[^.]+$/, '').toLowerCase() === voulu.toLowerCase() ||
        (parNumero && parNumero.test(f))
    )
    if (!trouve) {
      throw new Error(
        `Aucune prise « ${voulu} » dans ${slug}.\n` +
          `  Présentes : ${toutes.join(', ') || '(aucune)'}`
      )
    }
    rushes = [trouve]
  }

  const marque = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const asile = path.join(v.base, '.prises-precedentes', marque)

  const deplace = (source, nom) => {
    if (!fs.existsSync(source)) return null
    fs.mkdirSync(asile, { recursive: true })
    const cible = path.join(asile, nom)
    try {
      fs.renameSync(source, cible)
    } catch {
      // `rename` échoue entre volumes. La copie puis l'effacement font la même
      // chose, plus lentement, et ne perdent rien en chemin.
      fs.cpSync(source, cible, { recursive: true })
      fs.rmSync(source, { recursive: true, force: true })
    }
    return nom
  }

  const misDeCote = []
  for (const f of rushes) {
    if (deplace(path.join(v.tournage, f), f)) misDeCote.push(`02-tournage/${f}`)
  }
  // CE QUI DECOULE PART AUSSI, MEME QU'ON N'EN RETIRE QU'UNE.
  //
  // La piste est la concatenation des prises : en retirer une la raccourcit, et
  // tout ce qui etait cale dessus devient faux. Garder le transcript serait le
  // pire cas — des sous-titres qui suivent une voix qui n'existe plus, ce que le
  // §9 interdit nommement.
  for (const [source, nom] of [
    [path.join(v.audio, 'voix-finale.wav'), 'voix-finale.wav'],
    [path.join(v.audio, 'voix-coupee.wav'), 'voix-coupee.wav'],
    [path.join(v.audio, 'essais'), 'essais'],
    [v.transcript, '04-transcript.json'],
    [v.montage, '05-montage'],
    [v.rendu, '06-rendu'],
  ]) {
    if (deplace(source, nom)) misDeCote.push(nom)
  }

  return { slug, misDeCote, vers: misDeCote.length ? path.relative(CHEMINS.racine, asile) : null }
}

await principal(async () => {
  const enJson = drapeau(options, 'json')

  if (options.retire !== undefined) {
    const slugRetire = positionnels[0]
    if (!slugRetire) throw new Error(`Donne le slug : npm run depose -- <slug> --retire`)
    // `--retire` seul vide tout ; `--retire=<prise>` n'en enlève qu'une.
    const cible = options.retire === true ? null : String(options.retire)
    const r = retireLaPrise(String(slugRetire), cible)
    if (enJson) return void console.log(JSON.stringify({ ok: true, ...r }, null, 2))
    if (!r.misDeCote.length) {
      journal.info(`Rien à retirer : aucune prise déposée pour « ${r.slug} ».`)
      return
    }
    journal.ok(`${r.misDeCote.length} élément(s) mis de côté.`)
    for (const m of r.misDeCote) journal.detail(m)
    journal.detail(`Dans ${r.vers} — rien n'est détruit.`)
    journal.detail(`Dépose la nouvelle prise : npm run depose -- ${r.slug} <fichier>`)
    return
  }

  // Les avertissements sont mis de côté au lieu d'être criés au moment où ils
  // surviennent. Deux raisons : en sortie machine ils partiraient sur la même
  // sortie standard que le JSON et le rendraient illisible ; en sortie humaine
  // ils tomberaient AVANT le compte rendu, donc avant qu'on sache de quel
  // fichier ils parlent.
  const avertissements = []
  const alerte = (message) => avertissements.push(message)

  const [slugBrut, fichierBrut] = positionnels
  if (!slugBrut || !fichierBrut) {
    throw new Error(`Usage : npm run depose -- <slug> <fichier>   (--aide pour le détail)`)
  }
  // Une vidéo déjà sur le disque échappe à la règle des deux mots : elle a été
  // nommée sous un autre régime, et la renommer casserait tout ce qui pointe
  // dessus.
  const dejaLa = fs.existsSync(dossierVideo(String(slugBrut ?? '')).base)
  const slug = verifieSlug(slugBrut, { dejaLa })

  const source = path.resolve(fichierBrut)
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Fichier introuvable : ${source}`)
  }
  const extension = path.extname(source).toLowerCase()
  if (!EXTENSIONS.includes(extension)) {
    throw new Error(
      `Extension refusée : « ${extension || 'aucune'} ».\n` +
        `Un rush est une prise, audio ou vidéo : ${EXTENSIONS.join(' ')}.\n` +
        `Convertis le fichier avant de le déposer.`
    )
  }

  const v = assureDossierVideo(slug)

  // Redéposer un fichier déjà rangé le dupliquerait sous un nouveau numéro, et
  // le montage lirait deux fois la même prise.
  if (path.resolve(source).startsWith(path.resolve(v.tournage) + path.sep)) {
    throw new Error(
      `Ce fichier est déjà dans le dossier de tournage de « ${slug} ». ` +
        `Le redéposer le compterait deux fois.`
    )
  }

  // LE MODE SE LIT SUR LE FICHIER, PAS SUR SON EXTENSION.
  //
  // L'extension a servi de filtre au-dessus, rien de plus : un `.mp4` sorti de
  // certains enregistreurs ne porte qu'une piste son, et c'est alors une voix
  // off. `monte.mjs` tranche sur `aDeLaVideo` au moment du calage — on tranche
  // pareil ici, sinon le dépôt annoncerait un mode et le montage en ferait un
  // autre.
  const info = await sonde(source)
  const mode = info.aDeLaVideo ? 'camera' : 'voix-off'

  const estCoupe = drapeau(options, 'coupe')
  const prefixe = estCoupe ? 'coupe' : 'prise'

  const destinationDemandee =
    options.destination && options.destination !== true ? String(options.destination) : null
  if (destinationDemandee && !DESTINATIONS.includes(destinationDemandee)) {
    throw new Error(
      `Destination inconnue : « ${destinationDemandee} ». Attendu : ${DESTINATIONS.join(' | ')}.`
    )
  }

  // ---------------------------------------------------------------- script --
  let script = litJson(v.scriptJson, null)
  let scriptCree = false

  if (!script) {
    // Sans destination donnée, la DURÉE tranche : au-delà de trois minutes, ce
    // n'est pas un short. C'est grossier, mais ça se corrige en réécrivant le
    // squelette, alors qu'un format vertical posé sur une vidéo longue se paie
    // au rendu.
    const destination = destinationDemandee ?? (info.dureeS > 180 ? 'youtube' : 'tiktok-insta')
    script = squelette(slug, { destination, mode })
    ecritJson(v.scriptJson, script)
    scriptCree = true
    if (!destinationDemandee) {
      alerte(
        `Destination déduite de la durée du rush (${duree(info.dureeS)}) : ${destination}. ` +
          `Précise --destination=youtube|tiktok-insta si ce n'est pas ça.`
      )
    }
  } else if (destinationDemandee && script.destination && script.destination !== destinationDemandee) {
    // On ne réécrit JAMAIS un script existant : il porte le travail éditorial,
    // et une commande de rangement n'a pas à y toucher.
    alerte(
      `Le script déclare « ${script.destination} » et --destination dit « ${destinationDemandee} » : ` +
        `le script fait foi, il n'a pas été modifié.`
    )
  }

  const format = script.format ?? null

  // ------------------------------------------------------------- la copie --
  const numero = prochainNumero(v.tournage, prefixe)
  const nom = `${prefixe}-${String(numero).padStart(2, '0')}${extension}`
  const cible = path.join(v.tournage, nom)
  fs.copyFileSync(source, cible)

  if (numero > 99) {
    alerte(
      `${nom} : au-delà de 99, le numéro passe à trois chiffres et l'ordre alphabétique ` +
        `ne suit plus l'ordre de tournage. Renomme les rushes sur trois chiffres.`
    )
  }

  // --------------------------------------------------------- ce qu'on voit --
  // La divergence ne se juge que sur une PRISE. Un plan de coupe est un insert :
  // qu'il porte une image ou non ne dit rien du mode de production de la vidéo.
  let divergence = null
  if (!estCoupe && format) {
    const scriptDitFaceless = String(format).includes('faceless')
    const sansCamera = mode === 'voix-off'
    if (sansCamera !== scriptDitFaceless) {
      divergence = sansCamera
        ? `Le script annonce « ${format} » mais le rush n'a pas d'image : il sera monté en ` +
          `voix off, la piste image entièrement construite en plans de coupe.`
        : `Le script annonce « ${format} » mais le rush porte une image : elle sera conservée, ` +
          `aucun plan de coupe ne la recouvrira.`
      alerte(divergence)
    }
  }

  if (!estCoupe && !info.aDuSon) {
    alerte(
      `${nom} n'a aucune piste son : le montage l'ignorera comme prise. ` +
        `Si c'est un plan d'illustration, dépose-le avec --coupe.`
    )
  }

  // Le chemin part en séparateurs POSIX : il est relu par l'atelier, où un
  // antislash de Windows n'a pas de sens.
  const relatif = path.relative(CHEMINS.racine, cible).split(path.sep).join('/')

  if (enJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          slug,
          fichier: relatif,
          role: estCoupe ? 'coupe' : 'prise',
          mode,
          dureeS: Number(info.dureeS.toFixed(3)),
          format,
          destination: script.destination ?? null,
          scriptCree,
          divergence,
          avertissements,
        },
        null,
        2
      )
    )
    return
  }

  journal.titre(`Dépôt · ${slug}`)
  journal.ok(
    `${relatif} · ${duree(info.dureeS)} · ` +
      `${(fs.statSync(cible).size / 1e6).toFixed(1)} Mo · ` +
      `${mode === 'camera' ? `image ${info.largeur}×${info.hauteur}` : 'audio seul'}`
  )
  journal.detail(
    estCoupe
      ? `Plan de coupe : il viendra couvrir un passage, il ne porte pas la parole.`
      : mode === 'camera'
        ? `Mode caméra : l'image tournée est conservée, seuls des inserts ponctuels s'y ajoutent.`
        : `Mode voix off : la piste image sera construite entièrement en plans de coupe.`
  )
  if (scriptCree) {
    journal.info(
      `Squelette de script écrit (format ${format}) — il n'a aucun bloc, donc il ne se monte pas.`
    )
    journal.detail(`Écris le vrai script en conversation : /script ${slug}`)
  }
  for (const message of avertissements) journal.attention(message)

  console.log('')
  journal.detail(`Voix   : node outils/choix-voix.mjs ${slug} --catalogue`)
  journal.detail(`Montage: npm run monte -- ${slug}`)
})
