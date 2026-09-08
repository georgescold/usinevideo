/**
 * medias.mjs — B-roll et musique.
 *
 * Le B-roll n'est pas du papier peint : il tombe sur un mot précis, il montre
 * ce dont on parle, et il repart. Un plan de coupe qui reste trois secondes de
 * trop devient une pause dans le raisonnement.
 *
 * Deux règles de cache héritées de l'expérience :
 *   - on ne met **jamais** en cache un résultat vide (sinon une panne réseau
 *     d'une minute condamne un terme de recherche pour vingt-quatre heures) ;
 *   - on valide après téléchargement (durée > 0), et on supprime le fichier
 *     s'il est vide — un mp4 de 0 octet fait échouer le rendu bien plus tard,
 *     à un endroit où personne ne pensera à regarder.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { CHEMINS, assureDossier, litJson, ecritJson, litChaine } from './chemins.mjs'
import { journal } from './journal.mjs'
import { getJson, telecharge } from './http.mjs'
import { avecCle, pool, clefGrillee } from './trousseau.mjs'
import { sonde, mesureLAccroche, accrocheFaible } from './ffmpeg.mjs'
import { attribue as attribuePerso, DOSSIER as DOSSIER_PERSO } from './broll-perso.mjs'
import { chercheDesVisages } from './visages.mjs'
// Le prompt d'un plan généré, son modèle, son prix et sa durée : tout vient de
// `fal.mjs`, qui est le seul endroit où ces choix sont écrits. Voir le commentaire
// qui y accompagne `promptDePlan` — deux doctrines de prompt divergeraient.
import { promptDePlan, coutDUnPlan, modeleDePlan, dureeDePlan } from './fal.mjs'

const CACHE = path.join(CHEMINS.cachePartage, 'medias')
const CACHE_MS = 24 * 60 * 60 * 1000

const empreinte = (...parts) =>
  crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)

function litCache(cle) {
  const f = path.join(CACHE, `${cle}.json`)
  const c = litJson(f, null)
  if (!c) return null
  if (Date.now() - c.date > CACHE_MS) return null
  // Un cache vide n'est pas un cache : c'était peut-être une panne réseau.
  if (!c.resultats?.length) return null
  return c.resultats
}

const ecritCache = (cle, resultats) => {
  if (!resultats?.length) return
  ecritJson(path.join(CACHE, `${cle}.json`), { date: Date.now(), resultats })
}

// ---------------------------------------------------------------------------
//  Pexels
// ---------------------------------------------------------------------------

/**
 * Cherche des vidéos.
 *
 * On prend la définition **juste suffisante** : décoder un original en 4 000 px
 * pour l'afficher en 1 080 coûte du temps de rendu à chaque image, sans rien
 * apporter.
 */
export async function chercheVideos(requete, { largeur, hauteur, combien = 5 } = {}) {
  const vertical = hauteur > largeur
  // LE NOMBRE DEMANDE FAIT PARTIE DE LA CLE.
  //
  // Sans lui, une requete servie une premiere fois avec trois candidats restait
  // figee a trois pendant vingt-quatre heures, meme quand on en redemandait
  // huit. Combine a la regle « jamais deux fois le meme clip », le vivier
  // s epuisait des la deuxieme decoupe et les plans etaient abandonnes.
  const cle = empreinte('pexels-video', requete, vertical, combien)
  const cache = litCache(cle)
  if (cache) return cache

  const resultats = await avecCle('pexels', async (apiKey) => {
    const r = await getJson(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(requete)}` +
        `&per_page=${combien * 2}&orientation=${vertical ? 'portrait' : 'landscape'}`,
      { headers: { authorization: apiKey } }
    ).catch((e) => {
      if ([401, 403, 429].includes(e.statut)) throw clefGrillee(`Pexels HTTP ${e.statut}`)
      throw e
    })

    return (r.videos || [])
      .map((v) => {
        const fichiers = (v.video_files || [])
          .filter((f) => f.file_type === 'video/mp4' && f.width >= largeur * 0.9)
          .sort((a, b) => a.width - b.width)
        const choisi = fichiers[0] ?? (v.video_files || []).sort((a, b) => b.width - a.width)[0]
        if (!choisi) return null
        return {
          source: 'pexels',
          type: 'video',
          url: choisi.link,
          largeur: choisi.width,
          hauteur: choisi.height,
          dureeS: v.duration,
          auteur: v.user?.name ?? null,
          page: v.url,
        }
      })
      .filter(Boolean)
      .slice(0, combien)
  })

  ecritCache(cle, resultats)
  return resultats
}

/** Cherche des photos. Le recadrage est demandé au serveur, pas fait ici. */
export async function cherchePhotos(requete, { largeur, hauteur, combien = 5 } = {}) {
  const vertical = hauteur > largeur
  const cle = empreinte('pexels-photo', requete, vertical, largeur, hauteur, combien)
  const cache = litCache(cle)
  if (cache) return cache

  const resultats = await avecCle('pexels', async (apiKey) => {
    const r = await getJson(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(requete)}` +
        `&per_page=${combien}&orientation=${vertical ? 'portrait' : 'landscape'}`,
      { headers: { authorization: apiKey } }
    ).catch((e) => {
      if ([401, 403, 429].includes(e.statut)) throw clefGrillee(`Pexels HTTP ${e.statut}`)
      throw e
    })

    return (r.photos || []).map((p) => ({
      source: 'pexels',
      type: 'image',
      // Recadrage à la volée par le serveur : on ne décode pas un 5 000 px.
      url: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=${largeur}&h=${hauteur}`,
      largeur,
      hauteur,
      auteur: p.photographer,
      page: p.url,
    }))
  })

  ecritCache(cle, resultats)
  return resultats
}

// ---------------------------------------------------------------------------
//  Musique
// ---------------------------------------------------------------------------

/**
 * Cherche de la musique libre sur Openverse — sans clé d'API.
 *
 * Seules les licences CC0 et CC-BY sont retenues : « pas d'usage commercial »
 * et « pas de modification » sont incompatibles avec une chaîne monétisée, et
 * le découvrir après cent vidéos coûte cher.
 */
export async function chercheMusique(ambiance, { combien = 12 } = {}) {
  const cle = empreinte('openverse', ambiance)
  const cache = litCache(cle)
  if (cache) return cache

  const r = await getJson(
    `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(ambiance)}` +
      `&license=cc0,by&page_size=${combien}&format=json`
  ).catch(() => null)
  if (!r) return []

  const resultats = (r.results || [])
    .filter((a) => a.url && (a.duration ?? 0) > 20_000)
    .map((a) => ({
      source: 'openverse',
      url: a.url,
      titre: a.title,
      auteur: a.creator,
      licence: a.license,
      lienLicence: a.license_url,
      dureeS: Math.round((a.duration ?? 0) / 1000),
      page: a.foreign_landing_url,
    }))

  ecritCache(cle, resultats)
  return resultats
}

// ---------------------------------------------------------------------------
//  Téléchargement
// ---------------------------------------------------------------------------

/**
 * Télécharge un média et vérifie qu'il est exploitable.
 *
 * Un fichier tronqué ou vide passerait inaperçu jusqu'au rendu, où il ferait
 * échouer la vidéo entière sans dire pourquoi.
 */
export async function rapatrie(media, destination) {
  assureDossier(path.dirname(destination))
  if (fs.existsSync(destination) && fs.statSync(destination).size > 1024) return destination

  const ok = await telecharge(media.url, destination, { tempsMortMs: 300_000 })
  if (!ok) return null

  try {
    const info = await sonde(destination)
    const valide = media.type === 'image' ? info.largeur > 0 : info.dureeS > 0.5
    if (!valide) throw new Error('média vide')
  } catch (e) {
    fs.rmSync(destination, { force: true })
    journal.detail(`Média écarté (${e.message}) : ${media.url.slice(0, 60)}`)
    return null
  }
  return destination
}

/** Écrit l'attribution à côté du fichier. CC-BY l'exige, CC0 la rend polie. */
export function noteAttribution(media, fichier) {
  const texte = [
    media.titre ?? path.basename(fichier),
    media.auteur ? `par ${media.auteur}` : null,
    media.licence ? `licence ${String(media.licence).toUpperCase()}` : null,
    media.page ?? media.url,
  ]
    .filter(Boolean)
    .join(' — ')
  fs.writeFileSync(fichier.replace(/\.[^.]+$/, '') + '.attribution.txt', texte + '\n', 'utf8')
  return texte
}

/**
 * Les plans de coupe employés par les DIX derniers montages de la chaîne.
 *
 * UN PLAN QUI REVIENT D'UNE VIDÉO À L'AUTRE SE VOIT, ET IL SIGNE LE STOCK.
 *
 * La déduplication existait DANS une vidéo. Entre deux vidéos, rien : la même
 * requête ramenait le même premier candidat, et l'abonné qui regarde trois
 * vidéos de suite voyait trois fois la même main sur le même téléphone. C'est
 * exactement ce qui fait reconnaître une chaîne « à plans de banque ».
 *
 * AUCUN REGISTRE À TENIR : LES PLANS SONT LE REGISTRE.
 *
 * Chaque `plan.json` porte l'identifiant de chacun de ses médias. On lit ceux
 * des dix montages les plus récents — hors la vidéo courante — et on écarte ce
 * qu'ils emploient. Une vidéo supprimée sort d'elle-même de la fenêtre ; un
 * fichier d'état séparé, lui, aurait fini par mentir.
 *
 * Dix, parce qu'à deux vidéos par semaine c'est cinq semaines : au-delà, un
 * plan de banque a le droit de resservir sans que personne s'en souvienne.
 */
export const FENETRE_REEMPLOI = 10

/**
 * La clé d'un média, la même partout.
 *
 * Pexels donne à un clip un numéro, et ce numéro est dans l'adresse du fichier
 * (`…/video-files/7986754/…`) comme dans celle de sa page
 * (`…/video/…-7986754/`). Les anciens montages n'ont pas d'identifiant sur
 * leurs événements, mais ils ont `attributions.json`, qui porte la page. En
 * ramenant tout au numéro, la fenêtre de réemploi voit les montages faits AVANT
 * la règle — sinon elle aurait été vide pendant dix vidéos.
 */
export function cleDeMedia(x) {
  const t = String(x ?? '')
  const n = t.match(/(?:video-files\/|videos\/|photos\/|-)(\d{5,})(?:[/\-]|$)/)
  return n ? `pexels:${n[1]}` : t
}

export function plansEmployesRecemment(slugCourant, { fenetre = FENETRE_REEMPLOI } = {}) {
  const dossierVideos = CHEMINS.videos
  if (!dossierVideos || !fs.existsSync(dossierVideos)) return { ids: new Set(), videos: [] }

  const montages = fs
    .readdirSync(dossierVideos, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== slugCourant)
    .map((d) => ({ slug: d.name, plan: path.join(dossierVideos, d.name, '05-montage', 'plan.json') }))
    .filter((m) => fs.existsSync(m.plan))
    .map((m) => ({ ...m, quand: fs.statSync(m.plan).mtimeMs }))
    .sort((a, b) => b.quand - a.quand)
    .slice(0, fenetre)

  const ids = new Set()
  for (const m of montages) {
    const plan = litJson(m.plan, null)
    for (const e of plan?.evenements ?? []) {
      if (e.type === 'broll' && e._mediaId) ids.add(cleDeMedia(e._mediaId))
    }
    // Les montages d'avant la règle : leurs attributions portent la page Pexels.
    const attributions = litJson(path.join(path.dirname(m.plan), 'attributions.json'), [])
    for (const ligne of Array.isArray(attributions) ? attributions : []) {
      const page = String(ligne).match(/https?:\/\/\S+/)?.[0]
      if (page) ids.add(cleDeMedia(page))
    }
  }
  return { ids, videos: montages.map((m) => m.slug) }
}

/** Y a-t-il de quoi chercher du B-roll ? */
export const brollDisponible = () => {
  try {
    return pool('pexels').length > 0
  } catch {
    return false
  }
}

/**
 * LE PREMIER PLAN N'EST PAS UN PLAN COMME LES AUTRES.
 *
 * C'est le seul qui décide si les trente suivants seront vus. Un spectateur qui
 * ne s'arrête pas dans les deux premières secondes ne verra ni le hook, ni
 * l'argument, ni l'appel à l'action : tout le montage se joue là.
 *
 * CE QU'ON LUI DEMANDE N'EST PAS DE BOUGER, C'EST D'ARRÊTER L'ŒIL.
 *
 * Le mouvement est une façon d'y arriver, pas la seule ni la meilleure : un
 * visage qui fixe l'objectif sans bouger d'un cil arrête davantage qu'une foule
 * agitée. Faire du mouvement le critère reviendrait à écarter les meilleurs
 * plans d'ouverture qui existent.
 *
 * CE QUI ARRÊTE LE MIEUX, C'EST UN VISAGE.
 *
 * C'est la forme que le regard humain repère avant de comprendre ce qu'il voit,
 * et le seul support d'émotion qui se lise en une demi-seconde. Un visage passe
 * donc devant tout le reste, et le plus grand l'emporte : une émotion se lit sur
 * un gros plan, pas sur une silhouette au fond du cadre.
 *
 * Le reste ne se mesure pas — « remarquable » n'est pas une grandeur, et le
 * maquiller en chiffre serait pire que ne rien mesurer. Ce qui se mesure, c'est
 * l'ABSENCE : un plan où rien ne se passe, où rien ne tranche et où rien n'a de
 * couleur ne peut arrêter personne. C'est le second critère, employé quand
 * aucun candidat ne montre de visage.
 *
 * Les candidats non retenus sont effacés dans la foulée : la banque est
 * gratuite, le disque non. Le vrai verdict, lui, se donne à l'œil sur l'écran
 * de revue — ni le visage ni les trois relevés ne disent si l'émotion est là.
 */
const OUVERTURE_CANDIDATS = 5

/**
 * Résout les événements de type `broll` d'un plan : cherche, télécharge, et
 * renseigne leur `src`. Les événements non résolus sont retirés plutôt que de
 * laisser un trou noir dans la vidéo.
 */
export async function resoudBroll(
  evenements,
  {
    largeur,
    hauteur,
    dossier,
    direction = null,
    comble = null,
    combleMax = 0,
    aGenerer = new Map(),
    blocs = [],
    exclus = [],
    // LE MODÈLE ARRIVE PAR L'APPELANT, IL NE SE RELIT PLUS SUR LE DISQUE.
    //
    // `modeleDePlan(litChaine())` relisait `config/chaine.json` à chaque plan
    // généré. Or `--modele-video=` — l'option qui existe précisément pour
    // essayer un modèle sur UNE vidéo sans basculer la chaîne — est posée par
    // `monte.mjs` dans sa carte EN MÉMOIRE. Le disque, lui, n'avait pas bougé.
    //
    // Conséquence exacte : choisir Seedance à l'étape 6 affichait le prix de
    // Seedance, envoyait `--modele-video=…seedance…`, le journal de `monte.mjs`
    // l'annonçait — et la génération partait quand même sur le modèle du
    // fichier, LTX par défaut. On payait le bon prix affiché pour le mauvais
    // modèle, sans qu'aucune ligne ne le contredise.
    //
    // Le repli reste la chaîne du disque : `broll --remplace` et les appels
    // directs n'ont pas d'option à passer.
    modele = null,
    // LA FENÊTRE DE RÉEMPLOI SE RÈGLE, ELLE NE SE SUBIT PLUS.
    //
    // Écarter ce que les dix derniers montages ont montré évite la signature
    // « chaîne à plans de banque » (§10). Mais la règle a un prix : sur une
    // niche étroite, la banque rend toujours les mêmes candidats, et écarter
    // les bons laisse les suivants — moins justes, moins nets. On se prive
    // alors d'un plan qui allait bien pour éviter une répétition que personne
    // n'aurait remarquée.
    //
    // C'est un arbitrage, donc un choix : 10 par défaut, 0 pour ne rien
    // écarter. Ce que cette vidéo emploie déjà (`exclus`) n'en dépend pas —
    // c'est « reprendre des plans différents », une autre demande.
    fenetreReemploi = FENETRE_REEMPLOI,
  }
) {
  // TES PROPRES PLANS SE POSENT EN INSERT, PAS EN PLEIN ÉCRAN.
  //
  // Pexels ne connaîtra jamais ton produit, ton visage, ni la capture d'écran de
  // ton tableau de bord. Mais un logo ou une photo qui prend tout le cadre
  // arrête le montage : on passe d'une vidéo à une diapositive, et le plan
  // suivant repart de zéro.
  //
  // L'insert résout les deux : le plan de banque continue derrière, et TON
  // image se pose dessus, en carte, le temps qu'on la lise. C'est la langue de
  // l'incrustation — celle des chaînes qui montrent une preuve sans casser leur
  // rythme.
  //
  // Concrètement : on ne pose PAS `src`, on pose `insert`. L'événement reste
  // donc dans la file de Pexels et recevra son fond comme les autres.
  assureDossier(dossier)
  const attributions = []
  let resolus = 0
  const perso = attribuePerso(evenements)
  for (const c of perso) {
    const e = evenements[c.i]
    const nom = `perso-${String(c.i + 1).padStart(2, '0')}${path.extname(c.asset.fichier)}`
    try {
      fs.copyFileSync(path.join(DOSSIER_PERSO, c.asset.fichier), path.join(dossier, nom))
    } catch (err) {
      journal.attention(`Ton plan « ${c.asset.fichier} » n'a pas pu être copié : ${err.message}`)
      continue
    }
    e.insert = {
      src: `broll/${nom}`,
      image: c.asset.image,
      // Le côté vient de l'ordre d'apparition : deux inserts de suite du même
      // côté se lisent comme une bannière, pas comme deux preuves.
      cote: perso.indexOf(c) % 2 === 0 ? 'droite' : 'gauche',
    }
    e._perso = { fichier: c.asset.fichier, motscles: c.trouves }
  }
  if (perso.length) {
    journal.detail(
      `${perso.length} insert(s) pris dans ta bibliothèque : ` +
        perso.map((c) => `${c.asset.fichier} sur « ${evenements[c.i].ancre ?? evenements[c.i].requete} »`).join(', ')
    )
  }

  const aResoudre = evenements.filter((e) => e.type === 'broll' && !e.src && e.requete)
  if (aResoudre.length === 0) return { resolus, abandonnes: 0, attributions }

  // L'ouverture est le plan de coupe le PLUS TÔT de la vidéo, pas le premier de
  // cette file. Sur un remontage, les plans déjà rapatriés n'y sont plus : le
  // premier à résoudre pourrait être celui de la trentième seconde, et on
  // dépenserait le soin de l'ouverture au milieu de la vidéo.
  const ouverture = evenements
    .filter((e) => e.type === 'broll')
    .reduce((a, e) => (a === null || (e.debutMs ?? 0) < (a.debutMs ?? 0) ? e : a), null)

  // SANS BANQUE, IL RESTE LA GÉNÉRATION — quand elle est autorisée.
  //
  // La sortie était sèche : tous les plans retirés, budget IA intact, et rien
  // qui dise pourquoi une « création assistée » n'avait produit aucun plan. Sur
  // une chaîne qui a une clé fal et pas de clé Pexels, c'est un cul-de-sac
  // silencieux. La boucle sait déjà faire : `chercheVideos` rend une liste vide,
  // et le comblage prend le relais dans la limite du budget.
  if (!brollDisponible()) {
    if (comble !== 'ia') {
      journal.attention(
        `${aResoudre.length} plan(s) de coupe demandés, mais aucune clé Pexels dans le trousseau. ` +
          `Ils sont ignorés — ajoute une clé dans config/keys.json, ou filme-les toi-même.`
      )
      for (const e of aResoudre) e._aRetirer = true
      return { resolus, abandonnes: aResoudre.length, attributions }
    }
    journal.attention(
      `Aucune clé Pexels : les ${aResoudre.length} plan(s) de coupe ne peuvent venir que de la ` +
        `génération, dans la limite du budget. Ajoute une clé Pexels pour la banque d'images.`
    )
  }

  let abandonnes = 0
  // Ce qu'on a fabriqué faute de banque. Compté à part de `resolus` : la
  // différence est ce que ça a coûté, et elle doit se lire dans le rapport.
  let combles = 0

  // DEUX RAISONS DE GÉNÉRER, UN SEUL BUDGET, ET IL FAUT LE RÉSERVER.
  //
  // `aGenerer` porte les plans que la lecture du script a désignés comme ceux
  // où la banque ne peut rien (voir `choix-ia.mjs`). Ils sont répartis sur toute
  // la durée ; les trous, eux, tombent où ils tombent. Sans réservation, trois
  // trous au début épuisaient le budget et le plan choisi de la centième seconde
  // — le seul qu'on avait explicitement demandé — passait à la trappe.
  //
  // On compte donc ce qui reste À VENIR de choisi, et un trou ne se comble que
  // s'il reste de la place APRÈS ça.
  let choisisAVenir = aResoudre.filter((e) => aGenerer.has(e)).length

  /**
   * Fabrique le plan `e`. Rend `true` s'il est en place.
   *
   * UN SEUL CHEMIN VERS FAL, POUR LES DEUX RAISONS DE GÉNÉRER. Deux copies
   * auraient divergé à la première correction du prompt ou du nom de fichier, et
   * rien à l'écran n'aurait dit laquelle avait servi.
   */
  const genereLePlan = async (e, i, { requete = null, pourquoi = null }) => {
    const ton = (blocs ?? []).find((b) => e.ancre && String(b.texte ?? '').includes(e.ancre))
    const prompt = promptDePlan({
      // LA REQUÊTE RÉÉCRITE PREND LE PAS, quand il y en a une.
      //
      // Celle du script vise une banque d'images : quatre mots-clés en anglais.
      // Un modèle vidéo veut une scène — un sujet, une action, un cadre, une
      // lumière. Envoyer les quatre mots-clés rendrait un plan générique, c'est-
      // à-dire exactement ce qu'on paie pour éviter.
      requete: requete ?? e.requete,
      intention: ton?.intention ?? null,
      direction,
      ouverture: e === ouverture,
    })
    const nom = `broll-${String(i + 1).padStart(2, '0')}-ia.mp4`
    const secondesPlan = dureeDePlan(e.dureeMs)
    const modeleEmploye = modele ?? modeleDePlan(litChaine())
    journal.info(
      `Plan ${i + 1} généré avec ${modeleEmploye} ` +
        `(${coutDUnPlan(modeleEmploye, secondesPlan).toFixed(2)} $, 1 à 3 min)` +
        `${pourquoi ? ` — ${pourquoi}` : ''}.`
    )
    journal.detail(`prompt : ${prompt}`)
    try {
      const { genereVideo } = await import('../../outils/fal-video.mjs')
      await genereVideo(prompt, {
        modele: modeleEmploye,
        dureeS: secondesPlan,
        format: hauteur > largeur ? '9:16' : '16:9',
        sortie: path.join(dossier, nom),
        surEtape: (m) => journal.detail(`fal · ${m}`),
      })
      e.src = `broll/${nom}`
      e.ken = false
      e.source = 'fal'
      // QUEL MODÈLE A FAIT CE PLAN. Sans ça, on regarde une vignette générée
      // sans pouvoir dire si elle vient de LTX à 0,04 $ ou de Seedance à
      // 2,36 $ — donc sans pouvoir juger si le prix valait le résultat.
      e._modele = modeleEmploye
      e._mediaId = `fal:${nom}`
      e._auteur = null
      // POURQUOI CE PLAN-LÀ A ÉTÉ PAYÉ. Sans la raison, la revue montre un plan
      // généré au milieu de trente plans de banque sans qu'on puisse dire si le
      // choix était juste — donc sans pouvoir le corriger au montage suivant.
      if (pourquoi) e._iaPourquoi = pourquoi
      if (requete) e._iaRequete = requete
      combles++
      resolus++
      journal.ok(`Plan ${i + 1} en place.`)
      return true
    } catch (err) {
      // UNE GÉNÉRATION RATÉE REDEVIENT UN TROU, elle ne bloque pas le montage.
      // Le reste de la vidéo n'a pas à s'arrêter parce que fal a refusé une
      // demande — et le trou, lui, se voit et se dit.
      journal.attention(`Génération refusée pour « ${requete ?? e.requete} » : ${err.message}`)
      return false
    }
  }

  // Ce qui a déjà été pris dans cette vidéo. Un même plan qui revient se lit comme
  // une redite, y compris quand deux recherches différentes tombent dessus.
  const dejaPris = new Set()

  // Et ce que les DIX derniers montages de la chaîne ont déjà montré — voir
  // `plansEmployesRecemment`. Le slug courant n'est pas dans le dossier des
  // événements : on le lit sur le premier plan à résoudre.
  const slugCourant = path.basename(path.resolve(dossier, '..', '..', '..'))
  const recents = plansEmployesRecemment(slugCourant, { fenetre: fenetreReemploi })
  // CE QUE CETTE VIDÉO A DÉJÀ EMPLOYÉ, quand on demande expressément d'autres
  // plans.
  //
  // `plansEmployesRecemment` exclut le slug COURANT — à raison : un remontage
  // pour changer une taille de sous-titres ne doit pas faire valser toute la
  // piste image. Mais du coup, « régénérer les plans » redonnait exactement les
  // mêmes : la banque rend ses candidats dans le même ordre, et rien ne les
  // écartait. On ne pouvait pas refuser une piste entière.
  for (const id of exclus) recents.ids.add(cleDeMedia(id))
  if (!fenetreReemploi) {
    // Le dire dans les deux sens : un écart qu'on a choisi reste un écart, et
    // c'est la seule ligne qui expliquera un plan revu d'une vidéo à l'autre.
    journal.detail(`Fenêtre de réemploi coupée : les plans des autres vidéos sont autorisés.`)
  } else if (recents.ids.size) {
    journal.detail(
      `${recents.ids.size} plan(s) écarté(s) : déjà employés dans ${recents.videos.length} vidéo(s) récente(s).`
    )
  }

  // ET LE MÊME AUTEUR AUSSI, PARCE QUE LE DOUBLON N'EST PAS DANS LE FICHIER.
  //
  // Relevé sur un montage réel : 34 plans, 34 fichiers DIFFÉRENTS — et dix
  // d'entre eux du même auteur. À l'écran, ce sont dix fois la même silhouette
  // sur le même fond bleu, parce qu'un auteur publie un tournage entier en
  // clips séparés et que la banque les remonte tous ensemble. La déduplication
  // par identifiant ne voyait rien : les fichiers sont bien distincts.
  //
  // Ce qui se répète n'est donc pas le fichier, c'est le REGARD. On plafonne à
  // deux plans par auteur : deux passent pour une cohérence, dix pour une
  // panne.
  const parAuteur = new Map()
  const PAR_AUTEUR_MAX = 2

  for (const [i, e] of aResoudre.entries()) {
    // LE PLAN CHOISI SE GÉNÈRE AVANT D'INTERROGER LA BANQUE.
    //
    // La lecture du script a dit que la banque ne pouvait rien pour celui-ci.
    // L'interroger quand même coûterait dix requêtes et cinq téléchargements
    // pour un fichier qu'on jetterait — et, pire, le candidat rapatrié
    // entrerait dans la fenêtre de réemploi des dix montages suivants, où il
    // écarterait un plan qu'on n'a jamais montré.
    const choisi = aGenerer.get(e)
    if (choisi) {
      choisisAVenir--
      if (combles < combleMax) {
        e._iaChoisi = true
        if (await genereLePlan(e, i, choisi)) continue
        // Refusée par fal : le plan retombe sur la banque plutôt que de
        // disparaître. Un trou coûte plus cher à l'image qu'un plan générique.
        journal.detail(`On repasse par la banque pour le plan ${i + 1}.`)
      }
    }

    // `variante` vient du découpage sur les fins de phrase : plusieurs morceaux
    // partagent la même recherche et doivent recevoir des plans DIFFÉRENTS.
    // Assez de candidats pour que la deduplication ait de la marge. Une meme
    // requete alimente souvent trois ou quatre plans apres la decoupe sur les
    // fins de phrase, et chacun doit recevoir un clip DIFFERENT.
    const combien = 10 + (e.variante ?? 0) * 3
    // La direction des plans de la chaîne s'ajoute à CHAQUE requête.
    //
    // Sans elle, une chaîne douce reçoit des plans durs et une chaîne dure des
    // plans mièvres — et on corrige alors requête par requête, indéfiniment.
    // Le réglage vit dans `identite_visuelle.direction_plans` : il traite le
    // problème à la source, et il change avec la chaîne sans toucher au code.
    const requete = direction ? `${e.requete} ${direction}` : e.requete
    const candidats = await chercheVideos(requete, { largeur, hauteur, combien }).catch(() => [])
    const secours =
      candidats.length === 0
        ? await cherchePhotos(requete, { largeur, hauteur, combien }).catch(() => [])
        : []
    const liste = (candidats.length ? candidats : secours).filter(
      (m) => !dejaPris.has(m.id ?? m.url) && !recents.ids.has(cleDeMedia(m.page ?? m.url ?? m.id))
    )

    // Deux passes : d'abord les auteurs pas encore employés, puis les autres.
    // On ne REFUSE jamais un plan faute d'auteur neuf — un trou à l'image coûte
    // plus cher qu'une ressemblance — mais on ne le prend qu'en dernier recours.
    const neufs = liste.filter((m) => (parAuteur.get(m.auteur ?? '?') ?? 0) < PAR_AUTEUR_MAX)
    const ordre = [...neufs, ...liste.filter((m) => !neufs.includes(m))]

    const estOuverture = e === ouverture

    let pris = null
    if (estOuverture) {
      const essais = []
      for (const media of ordre) {
        if (essais.length >= OUVERTURE_CANDIDATS) break
        const ext = media.type === 'image' ? 'jpg' : 'mp4'
        const nom = `broll-${String(i + 1).padStart(2, '0')}-essai${essais.length + 1}.${ext}`
        const chemin = await rapatrie(media, path.join(dossier, nom))
        if (!chemin) continue
        essais.push({ media, chemin, ext, accroche: await mesureLAccroche(chemin) })
      }

      // Un seul processus Python pour tout le lot : démarrer l'interpréteur et
      // charger OpenCV coûte plus cher que d'analyser les cinq clips.
      const visages = await chercheDesVisages(essais.map((c) => c.chemin))
      for (const c of essais) {
        if (c.accroche) c.accroche.visage = visages.get(c.chemin) ?? null
      }

      if (essais.length) {
        // LE VISAGE PASSE DEVANT, ET LE PLUS GRAND L'EMPORTE.
        //
        // Une émotion se lit sur un gros plan ; sur une silhouette au fond du
        // cadre, il n'y a rien à lire. Entre deux visages, la taille tranche —
        // c'est la seule chose de l'émotion qu'on sache mesurer.
        const avecVisage = essais
          .filter((c) => c.accroche?.visage?.present)
          .sort((a, b) => b.accroche.visage.taille - a.accroche.visage.taille)

        // ON CLASSE SUR TROIS AXES, ON N'EN INVENTE PAS UN QUATRIÈME.
        //
        // Additionner mouvement, contraste et couleur reviendrait à décréter en
        // secret que trois points de contraste valent un point de mouvement.
        // Ils ne se comparent pas : ce sont trois unités différentes, et le
        // total qu'on en tirerait aurait l'air d'une note alors qu'il ne serait
        // qu'un mélange arbitraire.
        //
        // On classe donc les candidats SUR CHAQUE AXE et on additionne les
        // RANGS. C'est un scrutin, pas une note : le plan qui se tient partout
        // l'emporte, celui qui n'excelle nulle part perd, et aucun chiffre ne
        // prétend dire de combien.
        const points = new Map(essais.map((c) => [c, 0]))
        for (const axe of ['mouvement', 'contraste', 'couleur']) {
          const classe = [...essais].sort((a, b) => (b.accroche?.[axe] ?? 0) - (a.accroche?.[axe] ?? 0))
          classe.forEach((c, k) => points.set(c, points.get(c) + k))
        }
        const gagnant =
          avecVisage[0] ?? essais.reduce((a, c) => (points.get(c) < points.get(a) ? c : a), essais[0])

        const nom = `broll-${String(i + 1).padStart(2, '0')}.${gagnant.ext}`
        const cible = path.join(dossier, nom)
        fs.rmSync(cible, { force: true })
        fs.renameSync(gagnant.chemin, cible)
        for (const recale of essais) if (recale !== gagnant) fs.rmSync(recale.chemin, { force: true })

        // Le journal garde l'ordre d'arrivée : trié, on lirait des nombres
        // décroissants dont on ne tirerait rien. Dans l'ordre, on lit ce que la
        // règle a changé — ce qu'on aurait pris sans elle, ce qu'on prend avec.
        const dit = (a) =>
          a
            ? `${a.mouvement} · ${a.contraste} · ${a.couleur}` +
              (a.visage?.present ? ` · VISAGE ${a.visage.taille} %` : '')
            : '?'
        journal.detail(
          `ouverture (mouvement · contraste · couleur) — ` +
            essais.map((c, k) => `${k + 1}) ${dit(c.accroche)}${c === gagnant ? ' ←' : ''}`).join('   ')
        )
        if (avecVisage.length) {
          journal.detail(
            `Retenu pour son visage (${gagnant.accroche.visage.taille} % du cadre) — ` +
              `c'est ce qui arrête l'œil le plus vite. Reste à voir si l'émotion y est.`
          )
        }
        pris = { media: gagnant.media, nom, accroche: gagnant.accroche }
      }
    } else {
      for (const media of ordre) {
        const nom = `broll-${String(i + 1).padStart(2, '0')}.${media.type === 'image' ? 'jpg' : 'mp4'}`
        const chemin = await rapatrie(media, path.join(dossier, nom))
        if (chemin) {
          pris = { media, nom }
          break
        }
      }
    }

    if (pris) {
      dejaPris.add(pris.media.id ?? pris.media.url)
      const auteur = pris.media.auteur ?? '?'
      parAuteur.set(auteur, (parAuteur.get(auteur) ?? 0) + 1)
      e.src = `broll/${pris.nom}`
      // L'identifiant du média est ce qui permet aux dix montages SUIVANTS de
      // ne pas le reprendre : sans lui, la fenêtre de réemploi ne voit rien.
      e._mediaId = cleDeMedia(pris.media.page ?? pris.media.url ?? pris.media.id)
      e._auteur = pris.media.auteur ?? null
      // Une photo a besoin d'un mouvement : sans lui, l'image se fige et
      // l'attention part.
      e.ken = pris.media.type === 'image'

      if (estOuverture) {
        e._accroche = pris.accroche ?? null
        if (accrocheFaible(e._accroche)) {
          // LE SEUL VERDICT QU'ON SE PERMET, ET IL EST NÉGATIF.
          //
          // On ne sait pas dire qu'un plan accroche. On sait dire qu'il ne le
          // peut pas : rien ne s'y passe, rien n'y tranche, rien n'y a de
          // couleur. Le travelling évite alors le pire sans faire un bon plan
          // d'ouverture — seul un autre plan le ferait.
          e.ken = true
          const a = e._accroche
          journal.attention(
            `Plan d'ouverture terne : aucun visage, ni mouvement (${a.mouvement}), ` +
              `ni contraste (${a.contraste}), ni couleur (${a.couleur}). C'est le plan qui décide ` +
              `si les autres seront vus — regarde-le, et échange-le s'il ne t'arrête pas : ` +
              `npm run broll -- <slug> --plans`
          )
        }
      }
      attributions.push(noteAttribution(pris.media, path.join(dossier, pris.nom)))
      resolus++
    } else if (comble === 'ia' && combles + choisisAVenir < combleMax) {
      // ON COMBLE LE VIDE, ET C'EST LE SEUL DÉCLENCHEUR MESURABLE.
      //
      // « Aucun plan ne correspond à la scène » ne se mesure pas : la banque
      // rend presque toujours QUELQUE CHOSE, et rien ICI ne sait dire si cette
      // chose parle du bon sujet — c'est le script entier qui le sait, et c'est
      // pourquoi ce jugement-là est remonté dans `choix-ia.mjs`, avant la
      // boucle.
      //
      // Ce qui se mesure d'un plan seul, c'est le VIDE : après la déduplication
      // interne, après la fenêtre de réemploi des dix derniers montages, après
      // les téléchargements ratés, il ne reste aucun candidat. Sans ça le plan
      // est retiré et le précédent s'étire pour couvrir le trou — le temps mort
      // que le §10 interdit en premier.
      //
      // `choisisAVenir` réserve le budget des plans que le script a désignés :
      // trois trous au début ne doivent pas manger la génération demandée à la
      // centième seconde.
      journal.detail(`Rien en banque pour « ${e.requete} ».`)
      if (!(await genereLePlan(e, i, { pourquoi: 'la banque n’a rien rendu' }))) {
        e._aRetirer = true
        abandonnes++
      }
    } else {
      if (comble === 'ia' && combles + choisisAVenir >= combleMax) {
        journal.attention(
          `Rien en banque pour « ${e.requete} », et le budget de ${combleMax} génération(s) ` +
            `est engagé — plan retiré. Relève-le avec --plans-ia= si tu veux en payer plus.`
        )
      } else {
        journal.detail(`Rien trouvé pour « ${e.requete} » — plan de coupe retiré.`)
      }
      e._aRetirer = true
      abandonnes++
    }
  }

  // Si malgré tout un auteur revient trop, on le dit : c'est visible à l'écran
  // et invisible dans les compteurs.
  for (const [auteur, combien] of parAuteur) {
    if (combien > PAR_AUTEUR_MAX) {
      journal.attention(
        `${combien} plans du même auteur (${auteur}) — la banque n'avait pas mieux ` +
          `pour ces requêtes. À l'écran, ça se lit comme le même plan qui revient.`
      )
    }
  }

  return { resolus, abandonnes, attributions, combles }
}
