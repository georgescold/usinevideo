#!/usr/bin/env node
/**
 * rends.mjs — du plan au fichier.
 *
 * Deux passes, et c'est volontaire :
 *
 *   1. **Remotion** produit un master plat, en qualité maximale. Pas
 *      d'étalonnage, aucun traitement sonore : uniquement le montage.
 *   2. **ffmpeg** applique la LUT et encode. Le son passe sans etre touche.
 *
 * Pourquoi séparer : Remotion n'a pas de filtre LUT, et son ffmpeg embarqué est
 * volontairement minimal — ni `lut3d`, ni encodage matériel. Le ffmpeg du
 * système fait les deux, et l'accélération NVIDIA divise le temps par cinq.
 *
 * On passe par l'API de Remotion plutôt que par sa ligne de commande : la
 * progression est exploitable telle quelle, et il n'y a pas de sortie texte à
 * analyser pour savoir si ça s'est bien passé.
 *
 *   npm run rends -- mon-slug
 *   npm run rends -- mon-slug --extrait=0-150 --brouillon
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash as creeHachage } from 'node:crypto'
import { bundle } from '@remotion/bundler'
import { selectComposition, renderMedia } from '@remotion/renderer'
import {
  CHEMINS,
  dossierVideo,
  dossierDeTravail,
  litJson,
  litChaine,
  assureDossier,
  env,
  envNombre,
} from './lib/chemins.mjs'
import { journal, duree, progression } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { ffmpeg, sonde, accelerationNvidia, mesureSonie, verdictSonie } from './lib/ffmpeg.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run rends -- <slug> [options]

  --extrait=0-150     ne rend que ces images (contrôle rapide)
  --brouillon         moitié de définition, sans finition — pour vérifier vite
  --sans-finition     garde le master plat, sans LUT ni réencodage
  --lut=nom.cube      surcharge la LUT de la chaîne
  --debit=12M         débit vidéo de la passe finale
  --threads=4         fils de rendu (0 ou absent = automatique)
  --troncons          rend par morceaux d'une minute, repris un par un si un
                      onglet tombe. ATTENTION : le son dérive d'environ 50 ms
                      par raccord — à n'employer que pour un contrôle, pas
                      pour un master
  --sortie=<chemin>   écrit ailleurs que dans le master de la vidéo
                      (obligatoire pour un essai : sinon il écrase le rendu)

Sortie : videos/<slug>/06-rendu/<slug>.mp4
`
)

/** Les chemins relatifs de tous les fichiers d'une arborescence. */
function fichiersDe(racine) {
  if (!fs.existsSync(racine)) return []
  const trouves = []
  const aVoir = ['']
  while (aVoir.length > 0) {
    const rel = aVoir.pop()
    for (const e of fs.readdirSync(path.join(racine, rel), {
      withFileTypes: true,
    })) {
      const chemin = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) aVoir.push(chemin)
      else trouves.push(chemin)
    }
  }
  return trouves
}

/**
 * CE QUI N'EST PAS ARRIVÉ DANS LE BUNDLE NE SE VOIT PAS PENDANT LE RENDU.
 *
 * Remotion recopie `05-montage/public/` dans le bundle, et sert la copie. Un
 * fichier qui manque à la copie ne fait échouer personne : le navigateur rend
 * 404, la page continue, et le défaut sort dans le master — une police en
 * repli, un plan de coupe en noir. On l'a payé une fois, trente minutes de
 * calcul pour une typographie fausse d'un bout à l'autre.
 *
 * La comparaison coûte une lecture de deux arborescences, soit quelques
 * millisecondes pour deux cents fichiers. Elle a lieu AVANT le rendu, ce qui
 * est tout l'intérêt : après, il n'y a plus qu'à recommencer.
 */
function manquantsDeLaCopie(source, copie) {
  const attendus = fichiersDe(source)
  if (attendus.length === 0) return { attendus, manquants: [] }
  const arrives = new Set(fichiersDe(copie))
  return { attendus, manquants: attendus.filter((f) => !arrives.has(f)) }
}

function verifieLaCopiePublique(source, copie) {
  const { attendus, manquants } = manquantsDeLaCopie(source, copie)
  if (attendus.length === 0) return
  if (manquants.length === 0) {
    journal.detail(`${attendus.length} fichiers publics recopiés dans le bundle.`)
    return
  }
  const apercu = manquants.slice(0, 8).join(', ')
  throw new Error(
    `Le bundle de rendu est incomplet : ${manquants.length} fichier(s) sur ` +
      `${attendus.length} ne sont pas arrivés dans la copie du dossier public.` +
      String.fromCharCode(10) +
      `  Manquent : ${apercu}${manquants.length > 8 ? ', …' : ''}` +
      String.fromCharCode(10) +
      `  Rien ne le signalerait pendant le rendu : une police absente sort en ` +
      `police de repli, un plan absent sort en noir. On s'arrête avant les ` +
      `trente minutes de calcul.` +
      String.fromCharCode(10) +
      `  Relance : le bundle est reconstruit de zéro à chaque rendu.`
  )
}

/**
 * ON REVÉRIFIE LE BUNDLE AVANT CHAQUE REPRISE, ET ON LE RÉPARE.
 *
 * Le bundle est vérifié une fois, juste après sa construction. Or l'incident du
 * 9 septembre s'est produit EN COURS DE RENDU : les fichiers étaient là au
 * départ et n'y étaient plus à la vingt-huitième minute. Une reprise après
 * onglet tombé rouvre des onglets neufs, qui redemandent tout — c'est
 * exactement le moment où le trou se voit, et c'était exactement le moment où
 * personne ne regardait.
 *
 * On répare plutôt que de refuser : la source est intacte, la copie coûte
 * quelques millisecondes, et le rendu d'une traite repart de zéro de toute
 * façon. Refuser ferait perdre une demi-heure pour un fichier qui est là, à
 * trois centimètres. Ce qui reste introuvable À LA SOURCE, en revanche, arrête
 * tout : on ne sait plus quoi mettre à la place.
 */
function repareLaCopiePublique(source, copie) {
  const { manquants } = manquantsDeLaCopie(source, copie)
  if (manquants.length === 0) return []
  const remis = []
  for (const rel of manquants) {
    const de = path.join(source, rel)
    if (!fs.existsSync(de)) continue
    const vers = path.join(copie, rel)
    assureDossier(path.dirname(vers))
    fs.copyFileSync(de, vers)
    remis.push(rel)
  }
  const perdus = manquants.filter((f) => !remis.includes(f))
  if (perdus.length > 0) {
    throw new Error(
      `${perdus.length} fichier(s) ont disparu du bundle ET de la source ` +
        `pendant le rendu : ${perdus.slice(0, 6).join(', ')}` +
        (perdus.length > 6 ? ', …' : '') +
        String.fromCharCode(10) +
        `  Relance le montage pour les reconstruire : npm run monte`
    )
  }
  return remis
}

/**
 * LE PLAN RÉFÉRENCE DES FICHIERS. AUCUN N'ÉTAIT VÉRIFIÉ.
 *
 * `plan.json` nomme la piste image, la voix, chaque plan de coupe et chaque
 * police — vingt-cinq fichiers sur une vidéo courte, deux cents sur une VSL.
 * Il est écrit par le montage, qui a pu tourner il y a trois semaines : depuis,
 * un clip a pu être effacé, un dossier déplacé, une piste régénérée ailleurs.
 *
 * Rien ne le disait. Un `src` qui ne pointe nulle part sort en NOIR dans la
 * vidéo, une voix absente sort en SILENCE — et le rendu se termine avec un
 * verdict de sonie parfaitement calme sur un fichier muet. C'est le même défaut
 * que les polices, sur des fichiers qu'on remarque encore moins.
 *
 * On lit le plan en entier plutôt que ses champs connus : les types
 * d'événements changent, et une liste de champs se périme au premier ajout.
 */
function verifieLesFichiersDuPlan(plan, source) {
  const references = new Set()
  const parcours = (n) => {
    if (Array.isArray(n)) return n.forEach(parcours)
    if (!n || typeof n !== 'object') return
    for (const [nom, valeur] of Object.entries(n)) {
      if (typeof valeur === 'string') {
        // `src` seul. On ne retient que ce qui désigne un fichier du dossier
        // public : un chemin relatif, sans protocole. Une requête de banque
        // d'images ou une ancre de script n'ont rien à faire ici.
        if (
          nom === 'src' &&
          valeur.length > 0 &&
          !/^[a-z]+:/i.test(valeur) &&
          !path.isAbsolute(valeur)
        ) {
          references.add(valeur)
        }
      } else parcours(valeur)
    }
  }
  parcours(plan)

  // Les polices se nomment à part : leur champ s'appelle `fichier`, et ce mot
  // est trop courant pour être reconnu au nom dans tout le plan.
  for (const p of plan?.theme?.polices ?? []) {
    if (typeof p?.fichier === 'string' && p.fichier) {
      references.add(`fonts/${p.fichier}`)
    }
  }

  const absents = [...references].filter(
    (rel) => !fs.existsSync(path.join(source, rel))
  )
  if (absents.length === 0) {
    journal.detail(
      `${references.size} fichiers référencés par le plan, tous présents.`
    )
    return
  }
  throw new Error(
    `${absents.length} fichier(s) sur ${references.size} que le plan référence ` +
      `sont absents de 05-montage/public/ :` +
      String.fromCharCode(10) +
      `  ${absents.slice(0, 8).join(', ')}${absents.length > 8 ? ', …' : ''}` +
      String.fromCharCode(10) +
      `  Ils sortiraient en noir, en silence ou en police de repli, sans que ` +
      `rien ne le signale.` +
      String.fromCharCode(10) +
      `  Relance le montage pour les reconstruire : npm run monte`
  )
}

await principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug de la vidéo à rendre.`)

  // CHAQUE RENDU A SON PROPRE DOSSIER DE TRAVAIL, ET IL N'EST PAS DANS `%TEMP%`.
  //
  // Deux rendus lancés en parallèle se marchaient dessus dans le temporaire
  // système : le premier à finir nettoyait des fichiers que le second était en
  // train d'écrire, et celui-ci mourait au mixage audio — « Error opening
  // output … remotion-audio-mixing ». L'échec passait inaperçu, et on jugeait
  // ensuite une planche issue du rendu précédent. D'où l'isolement par
  // processus, qui rend le parallélisme non seulement sûr mais souhaitable.
  //
  // LE 9 SEPTEMBRE 2026, LE MÊME SYMPTÔME EST REVENU PAR UNE AUTRE PORTE. Un
  // rendu de 9 372 images est sorti en police de repli : le `public/fonts` du
  // bundle avait disparu en cours de route. Mesuré — les cinq bundles Remotion
  // de %TEMP%, dont quatre abandonnés la veille au soir, ont perdu ce dossier
  // dans la même fenêtre de 88 ms, dans l'ordre de parcours du dossier.
  // Personne n'ajoute rien à un bundle abandonné : c'est un balayage, pas notre
  // code — ni `pipeline/`, ni `atelier/`, ni `@remotion/*` ne suppriment ce
  // dossier, et un `bundle()` relancé à la main recopie les neuf .ttf sans
  // faute. L'Assistant de stockage Windows est actif sur ce poste, nettoyage
  // des fichiers temporaires compris.
  //
  // On ne cherche donc plus le coupable : `%TEMP%` est un dossier que le
  // système s'autorise à vider, et un rendu l'occupe une demi-heure. Le
  // dossier de mixage ET le bundle vivent dans le cache partagé — voir
  // `dossierDeTravail`. C'est le mixage qui compte le plus ici : c'est lui qui
  // avait produit le message trompeur de l'incident précédent.
  const tempPropre = dossierDeTravail(`rendu-${slug}`)
  fs.mkdirSync(tempPropre, { recursive: true })
  for (const v of ['TMPDIR', 'TMP', 'TEMP']) process.env[v] = tempPropre

  const dossierBundle = dossierDeTravail(`bundle-${slug}`)

  // LE NETTOYAGE NE DOIT JAMAIS MASQUER L'ERREUR QU'IL SUIT.
  //
  // Il tournait sans garde dans le gestionnaire de sortie. Sous Windows,
  // Chromium garde parfois un descripteur ouvert sur un fichier d'actif une
  // fraction de seconde apres la fin du rendu : `rmSync` levait alors EBUSY,
  // et cette exception-la remplacait a l'ecran la vraie cause de l'echec.
  // On nettoie au mieux, on ne se plaint pas : un dossier temporaire oublie
  // coute quelques megaoctets, un message d'erreur perdu coute une heure.
  const nettoieTemp = () => {
    for (const d of [tempPropre, dossierBundle]) {
      try {
        fs.rmSync(d, { recursive: true, force: true })
      } catch {
        /* le systeme le reprendra ; ce n'est pas une raison d'echouer */
      }
    }
  }
  process.on('exit', nettoieTemp)

  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  if (!plan) {
    throw new Error(
      `Aucun plan de montage pour « ${slug} ».\nLance d'abord : npm run monte -- ${slug}`
    )
  }

  assureDossier(v.rendu)
  const brouillon = drapeau(options, 'brouillon')

  // UN ESSAI NE DOIT JAMAIS ÉCRASER LE MASTER.
  //
  // Sans `--sortie`, un rendu d'extrait écrivait dans le fichier final de la
  // vidéo : quatre variantes d'identité rendues à la suite, et le master d'une
  // heure de travail était remplacé par cinq secondes de brouillon. Seule la
  // copie de sauvegarde l'avait rattrapé — par chance, pas par conception.
  const sortie = options.sortie
    ? path.isAbsolute(options.sortie)
      ? options.sortie
      : path.join(CHEMINS.racine, options.sortie)
    : null
  const master = sortie
    ? sortie.replace(/\.mp4$/i, '.master.mp4')
    : path.join(v.rendu, `${slug}.master.mp4`)
  const final = sortie ?? path.join(v.rendu, `${slug}.mp4`)
  if (sortie) assureDossier(path.dirname(sortie))

  journal.titre(`Rendu · ${slug}`)
  journal.info(
    `${duree(plan.dureeFrames / plan.fps)} · ${plan.largeur}×${plan.hauteur} · ` +
      `${plan.dureeFrames} images à ${plan.fps} i/s`
  )

  // ----------------------------------------------------- passe 1 : Remotion --
  const debut = Date.now()

  journal.info(`Préparation du projet…`)
  // Le dossier public est propre à cette vidéo : il ne contient que la piste
  // image, la voix, les polices et le B-roll de ce rendu-là. Remotion recopie
  // le dossier public à chaque construction — y laisser les rushes d'origine
  // reviendrait à recopier des gigaoctets pour rien.
  const publicSource = path.join(v.montage, 'public')
  // Ce que le plan réclame doit exister AVANT qu'on recopie sept cents
  // mégaoctets : le refus arrive en une seconde au lieu d'une minute.
  verifieLesFichiersDuPlan(plan, publicSource)
  // Un dossier de bundle porte le pid : il est neuf à chaque rendu. On le vide
  // quand même — un processus tué net (`taskkill /F`) ne passe pas par
  // `nettoieTemp`, et un pid se recycle.
  fs.rmSync(dossierBundle, { recursive: true, force: true })
  const paquet = await bundle({
    entryPoint: CHEMINS.remotionEntree,
    publicDir: publicSource,
    outDir: dossierBundle,
    onProgress: (p) => progression(p, 100, 'préparation'),
  })
  verifieLaCopiePublique(publicSource, path.join(paquet, 'public'))

  const inputProps = { plan }
  const composition = await selectComposition({
    serveUrl: paquet,
    id: 'Montage',
    inputProps,
  })

  const extrait = options.extrait
    ? String(options.extrait).split('-').map(Number)
    : null
  const concurrence = nombre(options, 'threads', envNombre('RENDU_CONCURRENCE', 0))

/**
 * UN ONGLET DE RENDU FINIT PAR TOMBER. CE QUI NE DOIT PLUS TOMBER AVEC, C'EST
 * LA DEMI-HEURE DE CALCUL.
 *
 * Le 8 septembre 2026, un rendu de 9 372 images est mort à 94 % après
 * vingt-huit minutes. Ce que l'écran a montré : trente lignes de ffmpeg sur un
 * dossier de mixage introuvable — donc on cherche un problème de disque, et il
 * n'y en a pas. La vraie cause était deux lignes plus haut, noyée dans le flot :
 *
 *   ProtocolError (Page.bringToFront): Target closed
 *
 * L'onglet est tombé ; Remotion a nettoyé son temporaire en refermant le
 * navigateur, et l'étape de mixage, qui vient après, a trouvé la place vide. Le
 * message de ffmpeg est exact et ne sert à rien : il décrit la conséquence.
 *
 * CE N'EST NI LE DISQUE NI UN PLAN PRÉCIS, ET C'EST MESURÉ. 29 Go libres,
 * 32 Go de mémoire, les 101 clips et la piste image passent tous `ffprobe`. Et
 * les 872 dernières images — exactement là où il est tombé — se rendent en
 * pleine définition sans un accroc, master fini et sonie mesurée. Ce qui use,
 * c'est la DURÉE : vingt-huit minutes d'un même navigateur sur quatre-vingt-cinq
 * vidéos.
 *
 * On ne peut pas promettre qu'un onglet ne tombera jamais — c'est un processus
 * Chromium, il peut mourir de mémoire, d'un pilote graphique ou d'un défaut qui
 * ne nous appartient pas. On peut promettre que ça ne coûte plus la vidéo :
 *
 *   1. le rendu part en TRONÇONS d'une minute, recollés sans réencodage ;
 *   2. un tronçon qui tombe est REPRIS, avec moins de fils à chaque essai ;
 *   3. les tronçons SURVIVENT au processus : relancer reprend où l'on en était.
 *
 * `forSeamlessAacConcatenation` est ce que Remotion expose exactement pour ça :
 * il aligne les trames audio pour que le recollage ne laisse pas de trou.
 */
const ONGLET_MORT = /target closed|protocol error|session closed|browser has closed|websocket|frame [0-9]+ timed out/i
const MIXAGE_ORPHELIN = /remotion-audio-mixing|remotion-assets-dir/i

// Une minute à 30 i/s. Assez court pour qu'un onglet la tienne, assez long pour
// que le démarrage du navigateur — cinq secondes — reste du bruit.
const IMAGES_PAR_TRONCON = 1800
// Deux reprises, en divisant les fils par deux à chaque fois : si c'est la
// mémoire, moins d'onglets simultanés la rendent ; si c'est autre chose, on ne
// s'acharne pas.
const RETENTES = 2

  const bornes = extrait
    ? [extrait[0], extrait[1] ?? plan.dureeFrames - 1]
    : [0, plan.dureeFrames - 1]
  const totalImages = bornes[1] - bornes[0] + 1

  // ON NE TRONÇONNE PAS CE QUI TIENT D'UNE TRAITE. Un extrait de contrôle et un
  // format court se rendent en quelques minutes : les découper ajouterait un
  // recollage et des démarrages de navigateur pour rien.
  // LA DÉCOUPE NE SE FAIT PAS PAR DÉFAUT, ET LA MESURE DIT POURQUOI.
  //
  // Elle évite de reperdre trente minutes quand un onglet tombe. Mais le son
  // rendu tronçon par tronçon DÉRIVE : chaque morceau sort ~96 ms de son de
  // plus que d'image, et le recollage empile ces excédents. Mesuré par
  // corrélation croisée contre la voix, sur six tronçons et cinq raccords :
  //
  //   recollage naïf   40 ms → 420 → 680
  //   après recoupe    60 ms → 160 → 240
  //
  // La recoupe à la durée exacte de l'image divise par trois et ne supprime
  // pas : 48 ms résiduels par raccord. `forSeamlessAacConcatenation`, l'option
  // que Remotion expose exactement pour ça, ne l'empêche pas non plus. Un
  // sous-titre qui glisse d'un quart de seconde à la fin est précisément ce
  // que le §9 refuse — on ne l'échange pas contre du temps de calcul.
  //
  // La voie juste est un son rendu d'une seule traite, à côté des tronçons
  // muets : sans raccord, rien ne peut dériver. `renderMedia` en `codec: wav`
  // butait sur les 33 s de délai de montage — c'est un réglage, pas un mur —
  // mais ça reste à mesurer. `--troncons` l'ouvre en attendant ; le défaut
  // rend d'une traite, et une reprise coûte le rendu entier.
  const troncons = []
  if (drapeau(options, 'troncons') && !extrait && totalImages > IMAGES_PAR_TRONCON * 2) {
    for (let d = bornes[0]; d <= bornes[1]; d += IMAGES_PAR_TRONCON) {
      troncons.push([d, Math.min(d + IMAGES_PAR_TRONCON - 1, bornes[1])])
    }
  } else {
    troncons.push(bornes)
  }
  const enUnSeulMorceau = troncons.length === 1

  // L'EMPREINTE DIT SI LES TRONÇONS D'AVANT DÉCRIVENT ENCORE CETTE VIDÉO.
  //
  // Reprendre où l'on en était n'a de sens que si le plan n'a pas bougé. Un
  // plan remonté, une taille de sous-titres changée, un passage en brouillon —
  // et les tronçons gardés montreraient l'ancienne version, à cheval avec la
  // nouvelle, sans que rien ne le dise. On en change de dossier, et les autres
  // sont effacés.
  const infosPlan = fs.statSync(v.plan)
  const empreinte = creeHachage('sha1')
    .update(`${infosPlan.mtimeMs}|${infosPlan.size}|${brouillon}|${bornes.join('-')}`)
    .digest('hex')
    .slice(0, 10)
  const dossierTroncons = path.join(v.rendu, `.troncons-${empreinte}`)
  if (!enUnSeulMorceau) {
    for (const nom of fs.existsSync(v.rendu) ? fs.readdirSync(v.rendu) : []) {
      if (nom.startsWith('.troncons-') && nom !== path.basename(dossierTroncons)) {
        fs.rmSync(path.join(v.rendu, nom), { recursive: true, force: true })
      }
    }
    assureDossier(dossierTroncons)
  }

  /** Rend un intervalle d'images dans un fichier, et rien d'autre. */
  const rendUnTroncon = async (de, a, cible, fils, avance) =>
    renderMedia({
      composition,
      serveUrl: paquet,
      codec: 'h264',
      outputLocation: cible,
      inputProps,
      // Qualité maximale en sortie de Remotion : c'est un intermédiaire, il sera
      // réencodé. Économiser ici ne se rattrape plus après.
      crf: brouillon ? 28 : 16,
      jpegQuality: brouillon ? 70 : 95,
      scale: brouillon ? 0.5 : 1,
      colorSpace: 'bt709',
      frameRange: [de, a],
      concurrency: fils > 0 ? fils : null,
      chromiumOptions: { gl: 'angle' },
      logLevel: 'error',
      // LE SON NE SE DÉCOUPE PAS. IL SE REND D'UNE TRAITE, À CÔTÉ.
      //
      // Premier essai : tronçons sonores recollés avec
      // `forSeamlessAacConcatenation`, l'option que Remotion expose
      // exactement pour ça. Le fichier obtenu se décodait sans un défaut, aux
      // bons codecs, avec ses 9 372 images — et le son DÉRIVAIT.
      //
      // Mesuré par corrélation croisée contre la voix d'origine : 40 ms à
      // 0–20 s, 180 à 60–80, 300 à 150–170, 560 à 250–270, **680 ms** à
      // 290–310. Environ 110 ms gagnés à chaque raccord — chaque tronçon sort
      // 60,096 s puis 60,117 puis 60,139 pour 60,000 s de vidéo. À la fin, les
      // sous-titres tombent deux tiers de seconde avant la voix, ce que le §9
      // refuse nommément.
      //
      // Aligner la longueur d'un tronçon sur un nombre entier de trames AAC
      // aurait été l'autre voie — 16 images à 30 i/s et 48 kHz. C'est de
      // l'arithmétique qui dépend de la cadence, du taux d'échantillonnage et
      // du codec, et elle n'explique que 21 ms des 110 mesurés. Un son rendu
      // sans aucun raccord n'a rien à aligner : c'est juste par construction.
      muted: !enUnSeulMorceau,
      onProgress: ({ progress }) => avance(progress),
    })

  /** Le son de toute la vidéo, en une seule passe. */
  const rendLeSon = async (cible, fils, avance) =>
    renderMedia({
      composition,
      serveUrl: paquet,
      codec: 'wav',
      outputLocation: cible,
      inputProps,
      frameRange: bornes,
      concurrency: fils > 0 ? fils : null,
      chromiumOptions: { gl: 'angle' },
      logLevel: 'error',
      onProgress: ({ progress }) => avance(progress),
    })

  let dernier = -1
  const dis = (fraction) => {
    const pc = Math.round(fraction * 100)
    if (pc !== dernier) {
      dernier = pc
      progression(pc, 100, 'rendu')
    }
  }

  const morceaux = []
  let imagesFaites = 0
  for (const [i, [de, a]] of troncons.entries()) {
    const combien = a - de + 1
    const cible = enUnSeulMorceau
      ? master
      : path.join(dossierTroncons, `${String(i).padStart(3, '0')}.mp4`)

    // DÉJÀ LÀ ET LISIBLE : ON NE LE REFAIT PAS. C'est tout l'intérêt de garder
    // les tronçons — une reprise après un onglet tombé ne recalcule que ce qui
    // manque. Un fichier tronqué, lui, ne compte pas : on le vérifie.
    if (!enUnSeulMorceau && fs.existsSync(cible)) {
      const bon = await sonde(cible).then((x) => x.dureeS > 0).catch(() => false)
      if (bon) {
        morceaux.push(cible)
        imagesFaites += combien
        dis(imagesFaites / totalImages)
        continue
      }
      fs.rmSync(cible, { force: true })
    }

    let reste = RETENTES
    let fils = concurrence
    for (;;) {
      try {
        await rendUnTroncon(de, a, cible, fils, (p) =>
          dis((imagesFaites + p * combien) / totalImages)
        )
        break
      } catch (e) {
        const texte = String(e?.message ?? e)
        const recuperable = ONGLET_MORT.test(texte) || MIXAGE_ORPHELIN.test(texte)
        fs.rmSync(cible, { force: true })
        if (!recuperable || reste <= 0) {
          if (!recuperable) throw e
          throw new Error(
            `L'onglet de rendu est tombé ${RETENTES + 1} fois de suite sur les images ` +
              `${de} à ${a}.` +
              String.fromCharCode(10) +
              `  Ce n'est pas un problème de disque : Remotion nettoie son dossier ` +
              `temporaire quand le navigateur tombe, et ffmpeg le dit à sa façon juste après.` +
              String.fromCharCode(10) +
              (enUnSeulMorceau
                ? `  Reprends avec moins de fils : npm run rends -- ${slug} --threads=2`
                : `  Ce qui est déjà rendu est gardé : relancer reprendra ici.`) +
              String.fromCharCode(10) +
              `  Le détail : ${texte.split(String.fromCharCode(10))[0]}`
          )
        }
        reste--
        // Moins d'onglets à la fois : si la mémoire était en cause, c'est le
        // seul levier qui la rende. `concurrence` vaut 0 quand elle est
        // automatique — on part alors du nombre de cœurs pour pouvoir diviser.
        const avant = fils > 0 ? fils : Math.max(2, os.cpus().length)
        fils = Math.max(1, Math.floor(avant / 2))
        // ON REPREND TOUT SEUL. Un onglet qui tombe ne doit pas demander à
        // quelqu'un de relancer le lendemain matin : c'est du calcul, pas une
        // décision.
        journal.attention(
          `Onglet tombé — on reprend ${enUnSeulMorceau ? 'le rendu' : `les images ${de}–${a}`} ` +
            `avec ${fils} fil(s) au lieu de ${avant}.`
        )
        // Et on revérifie le bundle avant de rouvrir des onglets : c'est ici
        // que le trou du 9 septembre se serait vu. Voir `repareLaCopiePublique`.
        const remis = repareLaCopiePublique(publicSource, path.join(paquet, 'public'))
        if (remis.length > 0) {
          journal.attention(
            `${remis.length} fichier(s) avaient disparu du bundle depuis sa ` +
              `construction — remis : ${remis.slice(0, 5).join(', ')}` +
              (remis.length > 5 ? ', …' : '')
          )
        }
      }
    }
    morceaux.push(cible)
    imagesFaites += combien
  }

  // ------------------------------------------------------- le recollage ------
  //
  // `-c copy` : aucun réencodage, donc aucune perte et quelques secondes au
  // lieu de quelques minutes. C'est ce que `forSeamlessAacConcatenation` rend
  // possible sur l'audio.
  if (!enUnSeulMorceau) {
    const liste = path.join(dossierTroncons, 'liste.txt')
    fs.writeFileSync(
      liste,
      morceaux.map((m) => `file '${m.split('\\').join('/')}'`).join(String.fromCharCode(10)) +
        String.fromCharCode(10),
      'utf8'
    )
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', master])
    journal.detail(`${morceaux.length} tronçons recollés sans réencodage.`)
    fs.rmSync(dossierTroncons, { recursive: true, force: true })
  }

  const tempsRendu = (Date.now() - debut) / 1000
  journal.ok(`Master rendu en ${duree(tempsRendu)}`)

  // ------------------------------------------------------ passe 2 : finition -
  if (brouillon || drapeau(options, 'sans-finition')) {
    if (fs.existsSync(final)) fs.rmSync(final)
    fs.renameSync(master, final)
    journal.ok(`${path.relative(CHEMINS.racine, final)} (sans finition)`)
    return
  }

  const chaine = litChaine()
  const nomLut = options.lut || chaine?.identite_visuelle?.lut || null
  const lut = nomLut ? path.join(CHEMINS.luts, nomLut) : null
  if (lut && !fs.existsSync(lut)) {
    journal.attention(`LUT introuvable : ${path.relative(CHEMINS.racine, lut)} — passe ignorée.`)
  }

  const nvenc = env('RENDU_ACCEL', 'auto') !== 'off' && (await accelerationNvidia())
  journal.info(
    `Finition : ${lut && fs.existsSync(lut) ? 'étalonnage · ' : ''}` +
      `${nvenc ? 'encodage matériel' : 'encodage processeur'} · son inchangé`
  )

  const filtres = [
    lut && fs.existsSync(lut)
      ? `lut3d=file='${lut.replace(/\\/g, '/').replace(/:/g, '\\:')}':interp=tetrahedral`
      : null,
    'format=yuv420p',
  ]
    .filter(Boolean)
    .join(',')

  const debit = options.debit || '12M'
  const encodage = nvenc
    ? [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'hq',
        '-rc', 'vbr',
        // NVENC parle en `-cq`, jamais en `-crf`.
        '-cq', '20',
        '-b:v', debit,
        '-maxrate', '16M',
        '-bufsize', '24M',
      ]
    : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18']

  // LA VERSION PRÉCÉDENTE SURVIT À CELLE-CI.
  //
  // Écraser le master à chaque rendu rend toute comparaison impossible : on ne
  // peut plus vérifier qu'un changement a bien amélioré les choses, ni revenir
  // sur une version qui convenait. Une génération conservée suffit, et ne coûte
  // qu'un fichier.
  if (!sortie && fs.existsSync(final)) {
    const precedent = path.join(v.rendu, `${slug}.precedent.mp4`)
    fs.rmSync(precedent, { force: true })
    fs.renameSync(final, precedent)
  }

  const debutFinition = Date.now()
  await ffmpeg([
    '-i', master,
    '-vf', filtres,
    ...encodage,
    '-profile:v', 'high',
    '-bf', '3',
    '-g', String(plan.fps * 2),
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    // AUCUN FILTRE AUDIO ICI. Le son sort du montage tel qu'il y est entre.
    //
    // Il y avait une normalisation a -14 LUFS, la cible commune de YouTube,
    // Instagram et TikTok. Elle est retiree : les plateformes ramenent de toute
    // facon chaque video a leur propre cible, et normaliser en amont ne fait
    // qu'ajouter une compression de dynamique dont personne n'a besoin. La
    // sonie reste MESUREE plus bas, et annoncee — mesurer n'est pas modifier.
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    final,
  ])

  const info = await sonde(final)
  const poids = fs.statSync(final).size / 1e6

  // UNE PLANCHE DE HUIT IMAGES, À CHAQUE RENDU.
  //
  // On ne rend jamais à l'aveugle. Un défaut visuel — un texte qui déborde, un
  // plan figé, une infographie recouverte — ne se voit pas dans les journaux : il
  // se voit à l'image. Huit vignettes réparties sur la durée coûtent deux
  // secondes et attrapent la plupart des accidents avant qu'on ne regarde la
  // vidéo entière.
  const planche = path.join(v.rendu, sortie ? `.essai-planche.jpg` : `${slug}-planche.jpg`)
  const pas = info.dureeS / 9
  await ffmpeg([
    '-i', final,
    '-vf', `select='not(mod(n\\,${Math.max(1, Math.round(pas * plan.fps))}))',scale=270:-1,tile=4x2`,
    '-frames:v', '1',
    '-q:v', '3',
    planche,
  ])

  // ON NE REND JAMAIS SANS MESURER LE FICHIER PRODUIT.
  //
  // Le son n'est plus normalisé : la mesure ne verifie donc plus qu'une cible
  // a ete atteinte, elle dit ce qui sort. C'est la seule mesure qui compte,
  // puisque c'est ce fichier-la que la plateforme lira — et elle annonce de
  // combien la plateforme le remontera.
  const verdict = verdictSonie(await mesureSonie(final))

  journal.titre('Terminé')
  journal.ok(
    `${path.relative(CHEMINS.racine, final)} · ${duree(info.dureeS)} · ` +
      `${poids.toFixed(1)} Mo · ${info.largeur}×${info.hauteur}`
  )
  journal.detail(
    `Rendu ${duree(tempsRendu)} + finition ${duree((Date.now() - debutFinition) / 1000)}`
  )
  for (const ligne of verdict.lignes) journal.detail(ligne)
  if (!verdict.ok) journal.attention('Vrai pic trop haut : risque de distorsion à la publication.')
  console.log('')
  journal.detail(`Prépare la mise en ligne : /publie ${slug}`)
})
