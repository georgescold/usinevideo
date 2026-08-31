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
import { CHEMINS, assureDossier, litJson, ecritJson } from './chemins.mjs'
import { journal } from './journal.mjs'
import { getJson, telecharge } from './http.mjs'
import { avecCle, pool, clefGrillee } from './trousseau.mjs'
import { sonde } from './ffmpeg.mjs'
import { attribue as attribuePerso, DOSSIER as DOSSIER_PERSO } from './broll-perso.mjs'

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

/** Y a-t-il de quoi chercher du B-roll ? */
export const brollDisponible = () => {
  try {
    return pool('pexels').length > 0
  } catch {
    return false
  }
}

/**
 * Résout les événements de type `broll` d'un plan : cherche, télécharge, et
 * renseigne leur `src`. Les événements non résolus sont retirés plutôt que de
 * laisser un trou noir dans la vidéo.
 */
export async function resoudBroll(evenements, { largeur, hauteur, dossier, direction = null }) {
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

  if (!brollDisponible()) {
    journal.attention(
      `${aResoudre.length} plan(s) de coupe demandés, mais aucune clé Pexels dans le trousseau. ` +
        `Ils sont ignorés — ajoute une clé dans config/keys.json, ou filme-les toi-même.`
    )
    for (const e of aResoudre) e._aRetirer = true
    return { resolus, abandonnes: aResoudre.length, attributions }
  }

  let abandonnes = 0

  // Ce qui a déjà été pris dans cette vidéo. Un même plan qui revient se lit comme
  // une redite, y compris quand deux recherches différentes tombent dessus.
  const dejaPris = new Set()

  for (const [i, e] of aResoudre.entries()) {
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
    const liste = (candidats.length ? candidats : secours).filter((m) => !dejaPris.has(m.id ?? m.url))

    let pris = null
    for (const media of liste) {
      const nom = `broll-${String(i + 1).padStart(2, '0')}.${media.type === 'image' ? 'jpg' : 'mp4'}`
      const chemin = await rapatrie(media, path.join(dossier, nom))
      if (chemin) {
        pris = { media, nom }
        break
      }
    }

    if (pris) {
      dejaPris.add(pris.media.id ?? pris.media.url)
      e.src = `broll/${pris.nom}`
      // Une photo a besoin d'un mouvement : sans lui, l'image se fige et
      // l'attention part.
      e.ken = pris.media.type === 'image'
      attributions.push(noteAttribution(pris.media, path.join(dossier, pris.nom)))
      resolus++
    } else {
      journal.detail(`Rien trouvé pour « ${e.requete} » — plan de coupe retiré.`)
      e._aRetirer = true
      abandonnes++
    }
  }

  return { resolus, abandonnes, attributions }
}
