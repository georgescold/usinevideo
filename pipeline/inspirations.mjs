#!/usr/bin/env node
/**
 * inspirations.mjs — garder sous la main les vidéos dont on veut s'inspirer.
 *
 * CE QUE ÇA N'EST PAS.
 *
 * Ce n'est pas de la veille. `veille-youtube.mjs` ratisse une niche entière et
 * trie après coup ; `tiktok-ingest.mjs` fait l'autopsie d'une performance. Ici
 * on ne mesure rien et on ne classe rien : on a vu passer une vidéo, on veut
 * pouvoir la revoir et relire ce qu'elle dit, des mois plus tard, à côté de son
 * image. C'est un carnet, pas une base de données.
 *
 * TROIS DÉCISIONS QUI ONT UNE RAISON.
 *
 * 1. **La vidéo est rapatriée, pas embarquée.** Un lecteur TikTok ou YouTube
 *    dans la page obligerait à ouvrir la politique de sécurité de l'atelier aux
 *    scripts de ces plateformes. Et surtout : une vidéo que son auteur retire
 *    n'est plus consultable, alors qu'on l'avait gardée précisément pour y
 *    revenir. Le fichier local règle les deux.
 * 2. **Le transcript vient de Whisper, jamais de la plateforme.** Les
 *    sous-titres publics sont souvent absents, tronqués, ou réécrits par
 *    l'auteur : ils ne disent pas ce qui a été dit. La transcription locale est
 *    gratuite, tourne sur la carte graphique, et donne le même texte pour toutes
 *    les sources.
 * 3. **Aucun appel payant.** yt-dlp et Whisper sont locaux. Cette commande ne
 *    consomme ni crédit ni quota — c'est ce qui permet d'en déposer trente sans
 *    y réfléchir.
 *
 *   npm run inspire                          ce qui est au carnet
 *   npm run inspire -- <url> [<url>…]        ajoute, télécharge, transcrit
 *   npm run inspire -- <url> --sans-video    le transcript seul, sans l'image
 *   npm run inspire -- <url> --hauteur=480   borne la définition rapatriée
 *   npm run inspire -- --texte=<id>          le transcript, sur la sortie
 *   npm run inspire -- --retire=<id>         retire une inspiration du carnet
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHEMINS, assureDossier, ecritJson, ecritTexte, litJson } from './lib/chemins.mjs'
import { journal, duree, compact } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'
import { metadonnees, telechargeVideo, telechargeAudio, telechargeCouverture, engagement } from './lib/tiktok.mjs'
import { transcris } from './lib/whisper.mjs'
import { enParagraphes } from './lib/paragraphes.mjs'

/**
 * Les plateformes acceptées.
 *
 * yt-dlp en gère plus de mille, mais la liste ouverte serait un piège : cette
 * commande passe l'adresse à un programme externe, et l'atelier l'expose sur le
 * réseau local. On s'en tient donc à ce que la chaîne regarde vraiment.
 */
const HOTES = [
  /(^|\.)tiktok\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)instagram\.com$/i,
]

/** D'où vient la vidéo, pour l'afficher et pour trier. */
export function plateforme(url) {
  const h = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  if (/tiktok/i.test(h)) return 'tiktok'
  if (/youtube|youtu\.be/i.test(h)) return 'youtube'
  if (/instagram/i.test(h)) return 'instagram'
  return 'autre'
}

/**
 * Valide une adresse avant de la passer à yt-dlp.
 *
 * ON REFUSE TOUT CE QUI N'EST PAS `https://`, ET CE N'EST PAS DU ZÈLE.
 *
 * L'adresse arrive d'un champ de saisie, donc de l'extérieur, et part en
 * argument d'un programme. Une chaîne commençant par un tiret y serait lue comme
 * une option — `--exec` en fait exécuter une autre. Exiger le schéma ferme la
 * question sans avoir à énumérer les options dangereuses.
 */
export function verifieUrl(brut) {
  const texte = String(brut ?? '').trim()
  let u
  try {
    u = new URL(texte)
  } catch {
    throw new Error(`« ${texte.slice(0, 80)} » n'est pas une adresse.`)
  }
  if (u.protocol !== 'https:') {
    throw new Error(`Seules les adresses https:// sont acceptées (reçu ${u.protocol}).`)
  }
  if (!HOTES.some((h) => h.test(u.hostname))) {
    throw new Error(
      `${u.hostname} n'est pas une plateforme suivie. ` +
        `Attendu : tiktok.com, youtube.com, youtu.be ou instagram.com.`
    )
  }
  return u.href
}

/**
 * Un identifiant de fichier tiré de l'identifiant de la plateforme.
 *
 * Celui de yt-dlp peut porter des tirets bas et des tirets — jamais de barre
 * oblique ni de point, mais on ne s'en remet pas à ça pour un nom de fichier
 * qu'on écrira sur le disque et qu'on servira ensuite sur HTTP.
 */
function identifiant(meta, url) {
  const brut = meta?.id ?? new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? String(Date.now())
  const propre = String(brut).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  return propre || String(Date.now())
}

const mo = (octets) => `${(octets / 1e6).toFixed(1)} Mo`

function poids(chemin) {
  try {
    return fs.statSync(chemin).size
  } catch {
    return 0
  }
}

/** Le carnet, du plus récemment déposé au plus ancien. */
export function carnet() {
  const index = litJson(CHEMINS.inspirationsIndex, { inspirations: [] }) ?? { inspirations: [] }
  const liste = Array.isArray(index.inspirations) ? index.inspirations : []
  return liste
    .map((i) => {
      // LE DISQUE FAIT FOI, PAS L'INDEX.
      //
      // Les fichiers peuvent partir sans passer par ici — une synchronisation,
      // un ménage à la main. Un carnet qui promet une vidéo absente est pire
      // qu'un carnet qui dit qu'elle manque.
      const video = i.video ? path.join(CHEMINS.inspirations, i.video) : null
      const couverture = i.couverture ? path.join(CHEMINS.inspirations, i.couverture) : null
      const transcript = i.transcript ? path.join(CHEMINS.inspirations, i.transcript) : null
      return {
        ...i,
        aLaVideo: Boolean(video && fs.existsSync(video)),
        aLaCouverture: Boolean(couverture && fs.existsSync(couverture)),
        aLeTranscript: Boolean(transcript && fs.existsSync(transcript)),
        octets: video ? poids(video) : 0,
      }
    })
    .sort((a, b) => String(b.depose_le ?? '').localeCompare(String(a.depose_le ?? '')))
}

/** Le texte transcrit d'une inspiration, ou `null`. */
export function texteDe(id) {
  const entree = carnet().find((i) => i.id === id)
  if (!entree) throw new Error(`Aucune inspiration « ${id} » au carnet.`)
  if (!entree.transcript) return null
  const chemin = path.join(CHEMINS.inspirations, entree.transcript)
  return fs.existsSync(chemin) ? fs.readFileSync(chemin, 'utf8') : null
}

function ecritLeCarnet(liste) {
  assureDossier(CHEMINS.inspirations)
  ecritJson(CHEMINS.inspirationsIndex, {
    mis_a_jour_le: new Date().toISOString(),
    inspirations: liste.map(({ aLaVideo, aLaCouverture, aLeTranscript, octets, ...reste }) => reste),
  })
}

/** Retire une inspiration : l'entrée et ses fichiers. */
export function retire(id) {
  const liste = carnet()
  const entree = liste.find((i) => i.id === id)
  if (!entree) throw new Error(`Aucune inspiration « ${id} » au carnet.`)

  let libere = 0
  for (const relatif of [entree.video, entree.couverture, entree.transcript, entree.mots, entree.brut]) {
    if (!relatif) continue
    const chemin = path.join(CHEMINS.inspirations, relatif)
    libere += poids(chemin)
    try {
      fs.rmSync(chemin, { force: true })
    } catch { /* déjà parti : c'est le résultat qu'on voulait */ }
  }
  ecritLeCarnet(liste.filter((i) => i.id !== id))
  return { id, titre: entree.titre ?? null, octets: libere }
}

/**
 * Dépose une vidéo au carnet.
 *
 * `surProgres` reçoit une phrase à chaque étape : l'atelier l'affiche en direct,
 * et au terminal c'est le journal. Une commande qui télécharge deux cents
 * mégaoctets puis transcrit trois minutes ne peut pas rester muette.
 */
export async function depose(url, { avecVideo = true, hauteurMax = null, refais = false, surProgres = null } = {}) {
  const adresse = verifieUrl(url)
  const dis = (m) => (surProgres ? surProgres(m) : journal.info(m))

  dis(`Lecture de la page…`)
  const meta = await metadonnees(adresse)
  if (!meta) {
    throw new Error(
      `yt-dlp n'a rien pu lire sur cette adresse.\n` +
        `Vérifie que la vidéo est publique, ou mets yt-dlp à jour.`
    )
  }

  const id = identifiant(meta, adresse)
  const liste = carnet()
  const existante = liste.find((i) => i.id === id)
  if (existante && !refais) {
    return { ...existante, dejaLa: true }
  }

  assureDossier(CHEMINS.inspirationsMedia)
  assureDossier(CHEMINS.inspirationsTranscripts)
  assureDossier(CHEMINS.inspirationsRaw)

  const rel = (absolu) => path.relative(CHEMINS.inspirations, absolu).split(path.sep).join('/')
  ecritJson(path.join(CHEMINS.inspirationsRaw, `${id}.json`), meta)

  // UNE VIDÉO LONGUE DESCEND D'UN CRAN, ET C'EST UN ARBITRAGE.
  //
  // 720 p sur trois minutes pèse une trentaine de mégaoctets ; sur quarante
  // minutes, plusieurs centaines. Ce qu'on vient chercher dans une référence —
  // le rythme des coupes, la place du texte, la tenue du cadre — se lit aussi
  // bien en 480 p. Ce qui ne se lit pas, c'est un carnet qu'on n'ose plus
  // alimenter parce qu'il pèse dix gigaoctets.
  const longue = (meta.dureeS ?? 0) > 600
  const hauteur = hauteurMax ?? (longue ? 480 : 720)

  let video = null
  if (avecVideo) {
    dis(`Téléchargement de la vidéo (${hauteur} p max)…`)
    video = await telechargeVideo(adresse, path.join(CHEMINS.inspirationsMedia, id), { hauteurMax: hauteur })
    dis(`Vidéo rapatriée — ${mo(poids(video))}.`)
  }

  let couverture = null
  try {
    couverture = await telechargeCouverture(adresse, path.join(CHEMINS.inspirationsMedia, `${id}.jpg`))
  } catch { /* une vignette absente n'empêche pas de garder la vidéo */ }

  // ON TRANSCRIT DEPUIS LA VIDÉO QUAND ON L'A.
  //
  // Whisper extrait lui-même la piste ; retélécharger l'audio séparément ferait
  // un second aller-retour réseau pour le même son. Sans vidéo, on ne prend que
  // l'audio, ce qui est aussi le cas le plus rapide quand seul le texte compte.
  let source = video
  let audioTemporaire = null
  if (!source) {
    dis(`Téléchargement de l'audio…`)
    audioTemporaire = await telechargeAudio(adresse, path.join(CHEMINS.inspirationsMedia, `.${id}-audio`))
    source = audioTemporaire
  }

  dis(`Transcription locale${meta.dureeS ? ` de ${duree(meta.dureeS)}` : ''}…`)
  let transcript = null
  let mots = null
  try {
    const t = await transcris(source, { silencieux: Boolean(surProgres) })
    // WHISPER REND UN PAVÉ. ON LE MET EN PARAGRAPHES AVANT DE L'ÉCRIRE.
    //
    // C'est le fichier lui-même qu'on aère, pas seulement son affichage : le
    // texte se copie, se relit au terminal, et repart dans une conversation.
    // Aérer à l'affichage seul aurait rendu la moitié de ces usages au pavé.
    // Aucun mot n'est touché — on n'ajoute que des lignes vides.
    const texte = enParagraphes(String(t.texte ?? '').trim())
    if (texte) {
      const cheminTexte = path.join(CHEMINS.inspirationsTranscripts, `${id}.txt`)
      ecritTexte(cheminTexte, texte)
      transcript = rel(cheminTexte)
      const cheminMots = path.join(CHEMINS.inspirationsTranscripts, `${id}.json`)
      ecritJson(cheminMots, { id, langue: t.langue ?? null, mots: t.mots ?? [] })
      mots = rel(cheminMots)
    }
  } catch (e) {
    // Une transcription ratée ne doit pas perdre la vidéo qu'on vient de
    // rapatrier : on garde l'entrée, on dit ce qui manque, et elle se relance.
    journal.attention(`Transcription impossible : ${e.message.split('\n')[0]}`)
  } finally {
    if (audioTemporaire) {
      try { fs.rmSync(audioTemporaire, { force: true }) } catch { /* temporaire */ }
    }
  }

  const entree = {
    id,
    url: meta.url ?? adresse,
    plateforme: plateforme(adresse),
    titre: meta.texte ? String(meta.texte).split('\n')[0].slice(0, 200) : null,
    description: meta.texte ?? null,
    auteur: meta.auteur ?? null,
    auteurUrl: meta.auteurUrl ?? null,
    auteurAbonnes: meta.auteurAbonnes ?? null,
    date: meta.date ?? null,
    dureeS: meta.dureeS ?? null,
    vues: meta.vues ?? null,
    likes: meta.likes ?? null,
    commentaires: meta.commentaires ?? null,
    partages: meta.partages ?? null,
    engagement: engagement(meta),
    hashtags: meta.hashtags ?? [],
    video: video ? rel(video) : null,
    couverture: couverture ? rel(couverture) : null,
    transcript,
    mots,
    brut: `raw/${id}.json`,
    depose_le: existante?.depose_le ?? new Date().toISOString(),
  }

  ecritLeCarnet([entree, ...liste.filter((i) => i.id !== id)])
  return { ...entree, dejaLa: false }
}

// ---------------------------------------------------------------------------
//  En ligne de commande
// ---------------------------------------------------------------------------

// `process.argv[1]` est absent sous `node -e` et sous certains lanceurs. Ce
// module est désormais IMPORTÉ par l'atelier, qui a besoin de `verifieUrl` :
// sans cette garde, l'import ferait tomber le serveur au démarrage sur une
// erreur qui ne parle de rien.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { options, positionnels } = litArgs()

  aide(
    options,
    `
npm run inspire [-- <url>…] [options]

  (sans rien)           ce qui est au carnet
  <url>                 dépose une vidéo TikTok, YouTube ou Instagram
    --sans-video          le transcript seul — ne rapatrie pas l'image
    --hauteur=480         borne la définition (720 par défaut, 480 au-delà
                          de dix minutes)
    --refais              retraite une vidéo déjà au carnet
  --texte=<id>          écrit le transcript sur la sortie standard
  --repagine            refait les paragraphes de tous les transcripts, hors
                        ligne — ne retélécharge rien
  --retire=<id>         retire une inspiration et ses fichiers
  --json                sortie machine, pour l'atelier

Tout est local : yt-dlp télécharge, Whisper transcrit. Aucun crédit, aucun quota.
`
  )

  await principal(async () => {
    const enJson = drapeau(options, 'json')

    // ------------------------------------------------------------- retirer --
    if (options.retire && options.retire !== true) {
      const r = retire(String(options.retire))
      if (enJson) return void console.log(JSON.stringify({ ok: true, ...r }, null, 2))
      journal.ok(`« ${r.titre ?? r.id} » retirée du carnet — ${mo(r.octets)} libérés.`)
      return
    }

    // ------------------------------------------------------- le transcript --
    if (options.texte && options.texte !== true) {
      const texte = texteDe(String(options.texte))
      if (enJson) return void console.log(JSON.stringify({ ok: true, id: String(options.texte), texte }, null, 2))
      if (!texte) {
        journal.attention(`Pas de transcript pour « ${options.texte} ».`)
        return
      }
      // Sans décoration : la sortie est faite pour être redirigée dans un
      // fichier ou copiée telle quelle.
      console.log(texte)
      return
    }

    // ------------------------------------------------------- la remise en page
    //
    // POURQUOI CE N'EST PAS `--refais`.
    //
    // `--refais` retélécharge la vidéo et relance la transcription : plusieurs
    // minutes et des dizaines de mégaoctets pour ne changer que des retours à
    // la ligne. Les mots sont déjà sur le disque ; la mise en page se refait à
    // partir d'eux, hors ligne, en un instant. C'est aussi ce qui permet de
    // faire évoluer le découpage plus tard sans rien re-télécharger.
    if (drapeau(options, 'repagine')) {
      const liste = carnet().filter((i) => i.aLeTranscript)
      const faits = []
      for (const i of liste) {
        const chemin = path.join(CHEMINS.inspirations, i.transcript)
        const avant = fs.readFileSync(chemin, 'utf8')
        const apres = enParagraphes(avant)
        if (apres !== avant) {
          ecritTexte(chemin, apres)
          faits.push({ id: i.id, paragraphes: apres.split('\n\n').length })
        }
      }
      if (enJson) return void console.log(JSON.stringify({ ok: true, remis: faits }, null, 2))
      journal.titre(`Remise en page`)
      if (!faits.length) return void journal.info(`Rien à changer.`)
      for (const f of faits) journal.ok(`${f.id} — ${f.paragraphes} paragraphes`)
      return
    }

    // --------------------------------------------------------- le dépôt ----
    const urls = positionnels.filter(Boolean)
    if (urls.length) {
      const faites = []
      for (const [i, url] of urls.entries()) {
        journal.titre(urls.length > 1 ? `${i + 1}/${urls.length} · ${url}` : `Dépôt`)
        const r = await depose(url, {
          avecVideo: !drapeau(options, 'sans-video'),
          hauteurMax: options.hauteur && options.hauteur !== true ? Number(options.hauteur) : null,
          refais: drapeau(options, 'refais'),
        })
        faites.push(r)
        if (enJson) continue
        if (r.dejaLa) {
          journal.info(`Déjà au carnet — --refais pour la retraiter.`)
        } else {
          journal.ok(`${r.titre ?? r.id}`)
          journal.detail(
            [
              r.auteur ? `par ${r.auteur}` : null,
              r.dureeS ? duree(r.dureeS) : null,
              r.vues ? `${compact(r.vues)} vues` : null,
              r.video ? `vidéo` : `sans vidéo`,
              r.transcript ? `transcript` : `SANS transcript`,
            ]
              .filter(Boolean)
              .join(' · ')
          )
        }
      }
      if (enJson) console.log(JSON.stringify({ ok: true, inspirations: faites }, null, 2))
      return
    }

    // ------------------------------------------------------------ le carnet -
    const liste = carnet()
    if (enJson) return void console.log(JSON.stringify({ ok: true, inspirations: liste }, null, 2))

    journal.titre(`${liste.length} inspiration${liste.length > 1 ? 's' : ''}`)
    if (!liste.length) {
      journal.detail(`Dépose la première : npm run inspire -- <url>`)
      return
    }
    for (const i of liste) {
      console.log(
        `  ${i.id.padEnd(20)} ${String(i.plateforme).padEnd(10)} ` +
          `${String(i.titre ?? '').slice(0, 42).padEnd(43)} ` +
          `${i.aLaVideo ? 'vidéo' : '  —  '}  ${i.aLeTranscript ? 'texte' : '  —  '}`
      )
    }
    console.log('')
    journal.detail(`Total : ${mo(liste.reduce((n, i) => n + i.octets, 0))}`)
    journal.detail(`Le texte de l'une : npm run inspire -- --texte=<id>`)
  })
}
