#!/usr/bin/env node
/**
 * empreinte.mjs — récolter une voix propre, à partir de vidéos en ligne.
 *
 *   npm run empreinte -- <url> [<url>…] --nom="Untel"
 *   npm run empreinte -- --liste
 *   npm run empreinte -- --detail=<id>
 *   npm run empreinte -- --retire=<id>
 *
 * CE QUE CETTE COMMANDE FAIT, ET CE QU'ELLE NE FAIT PAS.
 *
 * Elle rapatrie l'audio d'une adresse, sépare la voix de ce qui l'entoure,
 * repère les passages où la voix est SEULE, et découpe ces passages-là. Elle ne
 * convertit rien : elle prépare la matière. Le moteur qui s'en servira —
 * zero-shot ou entraîné — se branche après, et lira le même dossier.
 *
 * LES EXTRAITS SONT DÉCOUPÉS DANS L'ORIGINAL. C'est la règle centrale.
 *
 * La séparation est un INSTRUMENT DE MESURE, pas un traitement. Une piste
 * vocale extraite porte les artefacts du séparateur — aigus métalliques,
 * transitoires rabotées, souffle reconstruit. La donner en référence à un
 * moteur de conversion, ce serait lui apprendre les défauts du séparateur en
 * même temps que le timbre. On se sert donc de la séparation pour SAVOIR OÙ
 * couper, puis on coupe dans le fichier d'origine, intact.
 *
 * C'est la même discipline qu'au §9 de CLAUDE.md : on mesure le son, on ne le
 * corrige pas.
 *
 * LE CRITÈRE.
 *
 * Une fenêtre est retenue quand deux choses sont vraies ensemble :
 *
 *   1. quelqu'un parle           — le niveau de la voix tient dans les 25 dB
 *                                  sous le niveau haut du fichier ;
 *   2. il n'y a rien derrière    — le résidu est au moins `--marge` décibels
 *                                  sous la voix (20 par défaut).
 *
 * Le seuil de 20 dB n'est pas choisi au jugé. Relevé sur deux vidéos réelles,
 * en fenêtres d'une demi-seconde :
 *
 *     voix seule, face caméra      écart médian 34,6 dB   minimum 17,3
 *     voix sur musique de fond     écart médian 12,4 dB   maximum 23,3
 *
 * Les deux distributions ne se touchent pas, et 20 passe entre les deux.
 *
 * TOUT EST LOCAL ET GRATUIT. yt-dlp télécharge, les modèles UVR séparent,
 * numpy mesure. Aucun crédit, aucun quota, aucune adresse contactée en dehors
 * de celle qu'on donne.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, assureDossier, litJson, ecritJson, slugifie } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import {
  metadonnees, telechargeAudio, demandeUneSession, argumentsDeCookies,
  versionYtdlp, ytdlpEstVieux, installeYtdlp,
} from './lib/tiktok.mjs'
import { resoudLaSource, litLaListe, plateforme, PLATEFORMES_ACCEPTEES } from './lib/sources.mjs'
import { sonde, decoupe, recolleAudio } from './lib/ffmpeg.mjs'
import { separe, mesure, raieTonale, installeOutillage, MODELE_DEFAUT } from './lib/voix-locale.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
empreinte — récolter une voix propre, pour l'entraîner ensuite

  npm run empreinte -- <source> [<source>…]  récolte
  npm run empreinte -- --depuis=liens.txt    récolte tout un fichier de liens
  npm run empreinte -- --liste               les empreintes, et leur durée
  npm run empreinte -- --detail=<id>         extrait par extrait, avec sa mesure
  npm run empreinte -- --retire=<id>         la retire, fichiers compris
  npm run empreinte -- --fusionne=<id>,<id> --nom="Untel"
                                             réunit plusieurs empreintes en une
                                             — quand on a oublié --nom= au dépôt

Une source, c'est une adresse OU un fichier du disque

  Plateformes : ${PLATEFORMES_ACCEPTEES}
  et, pour tout le reste, le chemin d'un mp3/m4a/wav/mp4 déjà téléchargé.

Récolter en lot, c'est le mode normal

  Un entraînement demande 15 à 30 min de voix propre, et une source en rend
  rarement plus d'une ou deux. On rassemble les liens dans un fichier, un par
  ligne (« # » ouvre un commentaire), et on donne le fichier :

    npm run empreinte -- --depuis=liens.txt --nom="Untel"

  Le manifeste s'écrit après CHAQUE source : une récolte interrompue reprend
  où elle en était, et relancer la même liste ne retélécharge rien.

Réglages

  --nom="Untel"     range tout au même endroit, et cumule d'une fois sur l'autre
  --cookies-fichier=cookies.txt   la session, depuis un fichier exporté.
                    Instagram, Facebook et X ne servent plus rien sans elle.
  --cookies=firefox lire directement le navigateur. ATTENTION : sous Windows,
                    Chrome et Edge chiffrent leurs cookies depuis la version 127
                    et ne sont plus lisibles. Firefox l'est.
                    Un second profil : --cookies="firefox:default-release"
                    Une fois pour toutes, dans .env :
                      YTDLP_COOKIES_FICHIER=C:\chemin\cookies.txt
  --marge=20        de combien de dB le fond doit être sous la voix
  --min=3           durée minimale d'un extrait, en secondes
  --max=30          durée maximale d'un extrait, en secondes
  --plafond=1800    on s'arrête après ce total de voix propre (30 min)
  --reference=30    durée de reference.wav, le montage des meilleurs extraits
  --modele=<nom>    un autre modèle de séparation

Retirer

  --retire=<id>                    l'empreinte entière, fichiers compris
  --retire-source=<rang|titre> --de=<id>
                    UNE source et les extraits qui en viennent. Le rang est
                    celui qu'affiche --detail. La référence se refait.

Vérifier

  --installe-ytdlp  pose ou met à jour yt-dlp dans le cache partagé. YouTube
                    refuse les versions de plus de deux mois et répond 403.
  --remesure=<id>   cherche un sifflement fixe dans chaque source déjà récoltée.
                    Une raie tonale s'apprend comme une partie du timbre et
                    ressort sur toutes les conversions.
  --raie-seuil=10   à partir de combien de dB on la signale

Où ça se range

  marque/voix/<id>/reference.wav   les meilleurs extraits bout à bout
  marque/voix/<id>/extraits/       chacun séparément, du plus propre au moins
  marque/voix/<id>/empreinte.json  les sources, les durées, les mesures

Tout est local : yt-dlp télécharge, les modèles UVR séparent. Aucun crédit.
`
)

const DOSSIER = path.join(CHEMINS.marque, 'voix')

const MARGE = nombre(options, 'marge', 20)

/**
 * À partir de combien de décibels une raie tonale mérite un avertissement.
 *
 * LE CAS QUI L'A FIXÉ. Un modèle entraîné sur onze sources a rendu un
 * sifflement fin à 14 643 Hz, constant, décrit comme « une espèce d'acouphène ».
 * Il ne venait ni de la conversion ni de la transposition — la même raie sortait
 * à --transpose=0 comme à +12 — mais du corpus : cinq sources sur onze en
 * portaient une. Relevé sur ce corpus, extrait par extrait :
 *
 *     source propre       écart de  4,0 à  7,4 dB
 *     source sifflante    écart de 11,8 à 17,9 dB
 *
 * Dix passe entre les deux, et laisse la marge du côté du silence : une source
 * signalée à tort se vérifie à l'oreille en dix secondes, une source sifflante
 * gardée coûte deux heures et demie d'entraînement.
 */
const RAIE_DB = nombre(options, 'raie-seuil', 10)
const MIN_S = nombre(options, 'min', 3)
const MAX_S = nombre(options, 'max', 30)
const PLAFOND_S = nombre(options, 'plafond', 1800)
const REFERENCE_S = nombre(options, 'reference', 30)

// Sous ce niveau, ce n'est plus de la parole tenue. Compté SOUS le niveau haut
// du fichier, jamais en absolu : voir `analyse-voix.py`.
const SOUS_LE_HAUT = 25

// Les cookies, pour les plateformes qui exigent une session — Instagram en tête.
// Rien par défaut : lire une session ouverte se demande, ça ne se suppose pas.
// Voir `argumentsDeCookies` dans lib/tiktok.mjs.
const COOKIES = {
  navigateur: typeof options.cookies === 'string' ? options.cookies : null,
  fichier: typeof options['cookies-fichier'] === 'string' ? options['cookies-fichier'] : null,
}

// ---------------------------------------------------------------------------
//  Le découpage
// ---------------------------------------------------------------------------

/**
 * Des fenêtres mesurées aux segments à garder.
 *
 * POURQUOI ON PONTE LES SILENCES, ET POURQUOI PAS N'IMPORTE LESQUELS.
 *
 * Une respiration au milieu d'une phrase fait tomber le niveau de la voix
 * pendant une demi-seconde. Sans pontage, chaque respiration couperait la
 * prise en deux et on récolterait des bouts de trois secondes au lieu de
 * phrases entières — or c'est la phrase entière qui porte le timbre.
 *
 * Mais on ne ponte que du VRAI silence. Une fenêtre où la voix se tait pendant
 * qu'un fond continue n'est pas une respiration, c'est l'endroit précis où la
 * musique se découvre : la franchir recollerait deux prises propres autour du
 * seul passage qu'il fallait jeter. D'où la condition sur le résidu, et pas
 * seulement sur la voix.
 */
function segmente(fenetres, reperes, { fenetreS, marge, minS, maxS }) {
  const seuilParole = reperes.voixHaute - SOUS_LE_HAUT

  const parle = (f) => f.voix >= seuilParole
  const propre = (f) => f.voix - f.accomp >= marge

  // Le plancher du résidu quand la voix est seule : ce que « rien derrière »
  // vaut DANS CE FICHIER. Les six décibels de tolérance absorbent la
  // respiration d'un micro et le bruit de pièce, sans laisser passer une nappe.
  const propres = fenetres.filter((f) => parle(f) && propre(f))
  if (!propres.length) return []
  const accompsTries = propres.map((f) => f.accomp).sort((a, b) => a - b)
  const plancherFond = accompsTries[Math.floor(accompsTries.length / 2)] + 6

  const pontable = (f) => !parle(f) && f.accomp <= plancherFond

  const bruts = []
  let debut = null
  let creux = 0
  const PONT_MAX = Math.max(1, Math.round(1.0 / fenetreS)) // une seconde

  fenetres.forEach((f, i) => {
    const bon = parle(f) && propre(f)
    if (bon) {
      if (debut === null) debut = i
      creux = 0
      return
    }
    if (debut === null) return
    if (pontable(f) && creux < PONT_MAX) {
      creux += 1
      return
    }
    bruts.push([debut, i - creux])
    debut = null
    creux = 0
  })
  if (debut !== null) bruts.push([debut, fenetres.length - creux])

  // Découper ce qui dépasse, jeter ce qui est trop court. La coupe tombe au
  // creux de voix le plus profond du dernier tiers autorisé : couper au milieu
  // d'un mot s'entend, et une référence qui commence par une syllabe tronquée
  // apprend cette syllabe au moteur.
  const decoupes = []
  for (const [a, b] of bruts) {
    let curseur = a
    while (b - curseur > maxS / fenetreS) {
      const plafond = curseur + Math.round(maxS / fenetreS)
      const depuis = curseur + Math.round((maxS / fenetreS) * 0.7)
      let creuxIdx = plafond
      let creuxVal = Infinity
      for (let k = depuis; k < plafond && k < b; k++) {
        if (fenetres[k].voix < creuxVal) { creuxVal = fenetres[k].voix; creuxIdx = k }
      }
      decoupes.push([curseur, creuxIdx])
      curseur = creuxIdx
    }
    decoupes.push([curseur, b])
  }

  return decoupes
    .map(([a, b]) => {
      const tranche = fenetres.slice(a, b)
      const ecarts = tranche.map((f) => f.voix - f.accomp)
      return {
        debutS: +(a * fenetreS).toFixed(2),
        finS: +(b * fenetreS).toFixed(2),
        secondes: +((b - a) * fenetreS).toFixed(2),
        // La note d'un extrait est son écart MINIMAL, pas sa moyenne : un
        // extrait vaut ce que vaut son pire instant. Une moyenne laisserait
        // passer une prise propre gâtée par deux secondes de générique.
        note: ecarts.length ? +Math.min(...ecarts).toFixed(1) : 0,
        ecartMoyen: ecarts.length
          ? +(ecarts.reduce((s, x) => s + x, 0) / ecarts.length).toFixed(1)
          : 0,
      }
    })
    .filter((s) => s.secondes >= minS)
}

// ---------------------------------------------------------------------------
//  La récolte
// ---------------------------------------------------------------------------

/**
 * Une récolte qui ne rend rien, avec la raison de chaque source.
 *
 * On lève au lieu de rendre `null` : rendre une valeur vide laisse l'appelant
 * inventer une explication, et l'atelier en a inventé une fausse pendant deux
 * semaines. Une exception porte la cause avec elle.
 */
class ErreurRecolte extends Error {
  constructor(message, echecs) {
    super(message)
    this.echecs = echecs ?? []
  }
}

async function recolte(urls, nomDemande) {
  // Le réglage des cookies se vérifie AVANT la boucle. Un nom de navigateur mal
  // orthographié est une erreur de commande, pas de source : laissé au fil de
  // l'eau, il se répétait quarante fois dans la liste des échecs et se lisait
  // comme un refus des plateformes.
  const avecSession = argumentsDeCookies(COOKIES).length > 0

  // ON DIT SI UNE SESSION EST EN JEU, ET DÈS LE DÉBUT.
  //
  // Sans cette ligne, un journal d'échecs Instagram est indéchiffrable : rien
  // n'y distingue « je n'ai pas fourni de cookies » de « mes cookies n'ont pas
  // marché ». Les deux appellent des gestes opposés — en poser, ou en refaire —
  // et on ne pouvait trancher qu'en se rappelant ce qu'on avait tapé.
  //
  // Le NOM du réglage se dit, jamais son contenu : `journal` masque déjà les
  // secrets qui le traversent, et un fichier de cookies n'a rien à y faire.
  if (avecSession) {
    journal.detail(
      `Session fournie ${COOKIES.fichier ? `par fichier` : `depuis ${COOKIES.navigateur ?? 'le navigateur configuré'}`}.`
    )
  }

  await installeOutillage()

  const id = nomDemande ? slugifie(nomDemande) : null
  let dossier = id ? path.join(DOSSIER, id) : null
  let manifeste = dossier ? litJson(path.join(dossier, 'empreinte.json'), null) : null

  const temporaire = path.join(CHEMINS.cachePartage, 'empreinte-travail')
  assureDossier(temporaire)

  // Ce qui a échoué, pour le redire à la fin. SUR QUARANTE SOURCES, UNE
  // ERREUR AU DIX-SEPTIÈME RANG A DÉFILÉ DEPUIS LONGTEMPS quand la récolte se
  // termine : sans ce relevé, on ne saurait pas qu'il faut y revenir.
  const echecs = []

  for (const [i, brut] of urls.entries()) {
    let source
    try {
      source = resoudLaSource(brut)
    } catch (e) {
      journal.etape(i + 1, urls.length, String(brut).slice(0, 80))
      journal.erreur(e.message)
      echecs.push({ source: String(brut).slice(0, 120), raison: e.message.split('\n')[0] })
      continue
    }
    const url = source.valeur
    journal.etape(i + 1, urls.length, source.type === 'fichier' ? path.basename(url) : url)

    // Un fichier local n'a pas de métadonnées à interroger : son nom EST son
    // titre, et aller demander à yt-dlp ce qu'il en pense n'aurait pas de sens.
    // Muet : le téléchargement suit immédiatement et portera le vrai message.
    const meta =
      source.type === 'adresse'
        ? await metadonnees(url, COOKIES, { silencieux: true }).catch(() => null)
        : null
    // `--titre=` sert au dépôt de fichiers de l'atelier : le fichier reçu porte
    // un nom temporaire, et sans ce relais le manifeste garderait
    // « depot-7b21eacc4a75282f.mp4 » comme unique trace de la source. Six mois
    // plus tard, `--detail` ne dirait plus de quelle vidéo il s'agissait.
    const titre =
      (urls.length === 1 && typeof options.titre === 'string' ? options.titre : null) ||
      meta?.texte ||
      meta?.auteur ||
      (source.type === 'fichier' ? path.basename(url) : 'source')

    // Le dossier se nomme d'après la PREMIÈRE source quand aucun nom n'est
    // donné. Récolter plusieurs vidéos du même locuteur sans `--nom=` les
    // éparpillerait dans autant de dossiers : la commande le dit.
    //
    // ON NE NOMME PAS UNE EMPREINTE « source ».
    //
    // C'est ce qui arrivait quand les métadonnées échouaient — le cas exact
    // d'Instagram sans session : `meta` valait `null`, `titre` retombait sur son
    // dernier recours, et l'écran annonçait « tout part dans source ». Un nom
    // qui ne désigne personne, sur un dossier censé porter une voix.
    //
    // Le nom d'auteur reste le meilleur choix quand on l'a. Sinon la plateforme
    // vaut mieux que rien : « instagram » se reconnaît, se renomme, et surtout
    // se lit comme un défaut de nommage plutôt que comme un choix.
    if (!dossier) {
      // `titre` d'abord : sur un fichier déposé dans l'atelier, il porte le nom
      // d'ORIGINE, alors que le chemin ne porte que le nom temporaire du
      // serveur. Sans cette priorité, une empreinte s'appelait
      // « depot-611f999f22da0323-mp3 » — un nom qui ne désigne personne, sur un
      // dossier censé porter une voix.
      // L'extension part avant de slugifier : sans ça, un fichier déposé donne
      // « video-by-philo-sophia-ig-mp3 », où le « mp3 » final se lit comme un
      // mot du nom.
      const sansExtension = String(meta?.auteur || meta?.texte || titre || '').replace(
        /\.[A-Za-z0-9]{1,5}$/,
        ''
      )
      const depuisMeta = slugifie(sansExtension)
      const auto = (depuisMeta || plateforme(url)).slice(0, 40).replace(/-+$/, '') || 'voix'
      dossier = path.join(DOSSIER, auto)
      manifeste = litJson(path.join(dossier, 'empreinte.json'), null)
      journal.attention(
        `Aucun --nom= : tout part dans « ${auto} »` +
          (depuisMeta ? `, d'après la première source.` : ` — donne --nom= pour un nom qui parle.`)
      )
    }

    manifeste ??= { id: path.basename(dossier), cree: new Date().toISOString(), sources: [], extraits: [] }

    if (manifeste.sources.some((s) => s.url === url)) {
      journal.info(`Déjà récoltée, on passe.`)
      continue
    }

    const dejaS = manifeste.extraits.reduce((s, e) => s + e.secondes, 0)
    if (dejaS >= PLAFOND_S) {
      journal.attention(`Plafond atteint (${duree(dejaS)}). On s'arrête là.`)
      break
    }

    // UN FICHIER LOCAL NE SE TÉLÉCHARGE PAS, ET NE SE SUPPRIME PAS NON PLUS.
    // `estTemporaire` porte cette différence jusqu'au nettoyage, en bas de
    // boucle : effacer la source d'origine de quelqu'un serait impardonnable.
    let audio
    const estTemporaire = source.type === 'adresse'
    try {
      if (estTemporaire) {
        journal.detail(`Téléchargement de l'audio…`)
        audio = await telechargeAudio(url, path.join(temporaire, `src-${Date.now()}`), COOKIES)
      } else {
        audio = url
      }
    } catch (e) {
      journal.erreur(e.message.split('\n')[0])
      // `session` marque les refus qui ne demandent qu'une session ouverte :
      // la marche à suivre est dite une fois en bas, pas sous chaque lien.
      echecs.push({
        source: url.slice(0, 120),
        raison: demandeUneSession(e.message)
          ? `session requise par la plateforme`
          : `téléchargement — ${causeDe(e.message)}`,
        session: demandeUneSession(e.message),
      })
      continue
    }

    const infos = await sonde(audio)
    journal.detail(`${duree(infos.dureeS)} d'audio. Séparation…`)

    const travail = path.join(temporaire, `sep-${Date.now()}`)
    let m
    try {
      const { voix, accompagnement } = await separe(audio, travail, {
        modele: options.modele || MODELE_DEFAUT,
      })
      m = await mesure(voix, accompagnement)
    } catch (e) {
      // Une source qui casse la séparation ne doit pas emporter les
      // trente-neuf autres : on la note et on continue.
      journal.erreur(e.message.split('\n')[0])
      echecs.push({ source: url.slice(0, 120), raison: `séparation — ${causeDe(e.message)}` })
      fs.rmSync(travail, { recursive: true, force: true })
      if (estTemporaire) fs.rmSync(audio, { force: true })
      continue
    }

    const segments = segmente(m.fenetres, m.reperes, {
      fenetreS: m.fenetreS,
      marge: MARGE,
      minS: MIN_S,
      maxS: MAX_S,
    })

    const propreS = segments.reduce((s, x) => s + x.secondes, 0)
    const paroleS = m.fenetres.filter((f) => f.voix >= m.reperes.voixHaute - SOUS_LE_HAUT).length * m.fenetreS
    journal.detail(
      `écart médian ${m.reperes.ecartMedian} dB · ` +
        `${segments.length} extrait${segments.length > 1 ? 's' : ''} · ${duree(propreS)} de voix seule`
    )

    // « IL N'Y A POURTANT QUE LA VOIX DANS CETTE VIDÉO. »
    //
    // C'est souvent vrai, et le seuil n'en refuse pas moins la moitié du
    // fichier. Le résidu que l'on mesure n'est pas seulement de la musique :
    // c'est TOUT ce qui n'est pas la voix reconstruite — la réverbération de la
    // pièce, le souffle du micro, et les artefacts du ré-encodage que la
    // plateforme a appliqué. Une prise studio monte à 35 dB d'écart, une story
    // filmée dans un salon et repassée en mp3 plafonne vers 20, sans qu'aucune
    // musique n'y soit pour rien.
    //
    // Le seuil par défaut a été calibré sur deux fichiers. Plutôt que de le
    // défendre, on montre ce que d'autres donneraient : le réglage se décide
    // alors sur des secondes, pas sur une intuition.
    if (propreS < paroleS * 0.6) {
      journal.attention(
        segments.length
          ? `${duree(propreS)} gardées sur ${duree(paroleS)} de parole — le seuil en écarte beaucoup.`
          : `Rien de retenu, alors qu'il y a ${duree(paroleS)} de parole.`
      )
      journal.detail(
        `Le résidu médian est à ${m.reperes.ecartMedian} dB sous la voix, et il en faut ${MARGE}.`
      )
      journal.detail(`Ce résidu n'est pas que de la musique : réverbération, souffle, ré-encodage.`)
      for (const essai of [25, 20, 18, 15, 12]) {
        if (essai === MARGE) continue
        const s = segmente(m.fenetres, m.reperes, { fenetreS: m.fenetreS, marge: essai, minS: MIN_S, maxS: MAX_S })
        const t = s.reduce((a, x) => a + x.secondes, 0)
        journal.detail(
          `  --marge=${String(essai).padStart(2)} → ${String(duree(t)).padStart(9)} en ${s.length} extraits` +
            (essai < 15 ? `  (à ce niveau, une musique discrète passerait)` : '')
        )
      }
    }

    // On découpe DANS L'ORIGINAL, jamais dans la piste séparée. Voir l'en-tête.
    // Le dossier n'apparaît que s'il y a quelque chose à y mettre : une récolte
    // qui ne retient rien ne doit pas laisser une empreinte vide derrière elle,
    // que `--liste` masquerait et qu'on retrouverait six mois plus tard.
    const dossierExtraits = path.join(dossier, 'extraits')
    if (segments.length) assureDossier(dossierExtraits)
    let rang = manifeste.extraits.length
    for (const s of segments) {
      rang += 1
      const nom = `${String(rang).padStart(3, '0')}.wav`
      await decoupe(audio, path.join(dossierExtraits, nom), s.debutS, s.finS)
      manifeste.extraits.push({ ...s, fichier: `extraits/${nom}`, source: url })
    }

    // LE SIFFLEMENT SE CHERCHE ICI, PENDANT QU'ON PEUT ENCORE REFUSER LA SOURCE.
    //
    // Une raie tonale dans l'audio d'origine — ré-encodage, capture d'écran,
    // bruit d'appareil — s'apprend comme une partie du timbre et ressort sur
    // chaque conversion. Elle ne s'entend pas dans une vidéo au milieu de sa
    // musique, et rien ne la signalait avant le modèle fini : c'est-à-dire deux
    // heures et demie trop tard. On la mesure sur les extraits, qui SONT le
    // corpus, et on la dit tout de suite.
    //
    // Une mesure qui échoue ne fait pas échouer une récolte : elle vaut mieux
    // que rien, elle ne vaut pas la source.
    let raie = null
    if (segments.length) {
      try {
        const r = await raieTonale(
          manifeste.extraits
            .filter((e) => e.source === url)
            .map((e) => path.join(dossier, e.fichier))
        )
        raie = r.raie
      } catch (e) {
        journal.detail(`Raie tonale non mesurée (${causeDe(e.message)}).`)
      }
    }
    if (raie && raie.ecartDb >= RAIE_DB) {
      journal.attention(
        `Sifflement à ${raie.hz} Hz, ${raie.ecartDb} dB au-dessus du reste du spectre.`
      )
      journal.detail(
        `Le modèle l'apprendra comme une partie du timbre et le rendra sur chaque conversion.`
      )
      journal.detail(`Pour l'écarter : npm run empreinte -- --retire-source="${String(titre).slice(0, 40)}" --de=${manifeste.id}`)
    } else if (raie) {
      journal.detail(`Spectre sans raie tonale (${raie.ecartDb} dB à ${raie.hz} Hz).`)
    }

    manifeste.sources.push({
      url,
      plateforme: source.type === 'fichier' ? 'fichier' : plateforme(url),
      titre: String(titre).slice(0, 200),
      secondes: infos.dureeS,
      recolteLe: new Date().toISOString(),
      raie,
      reperes: m.reperes,
      retenus: segments.length,
      retenuS: +propreS.toFixed(1),
    })

    fs.rmSync(travail, { recursive: true, force: true })
    // Le fichier de quelqu'un ne se supprime jamais. Seul le nôtre s'en va.
    if (estTemporaire) fs.rmSync(audio, { force: true })

    // LE MANIFESTE S'ÉCRIT À CHAQUE SOURCE, PAS À LA FIN.
    //
    // Une récolte de quarante liens tourne une heure. Coupée au trente-huitième
    // — fenêtre fermée, machine en veille, câble arraché —, une écriture finale
    // aurait tout perdu. Écrit ici, le prochain passage voit les trente-sept
    // déjà faites dans `sources` et les saute : la récolte reprend où elle en
    // était sans qu'on ait à s'en occuper.
    manifeste.totalS = +manifeste.extraits.reduce((s, e) => s + e.secondes, 0).toFixed(1)
    manifeste.majLe = new Date().toISOString()
    ecritJson(path.join(dossier, 'empreinte.json'), manifeste)

    // Le cumul après chaque source : sur un lot, c'est le seul chiffre qui dit
    // s'il faut continuer à chercher des liens ou si on en a assez.
    if (urls.length > 1) {
      journal.detail(`— cumul : ${duree(manifeste.totalS)} sur ${duree(PLAFOND_S)} visées`)
    }
  }

  if (!manifeste || !manifeste.extraits.length) {
    journal.attention(`Aucun extrait récolté.`)
    if (dossier && fs.existsSync(dossier) && !fs.readdirSync(dossier).length) fs.rmdirSync(dossier)
    if (echecs.length) diLesEchecs(echecs, avecSession)
    await diLeSoupconYtdlp(echecs)
    // LES ÉCHECS REMONTENT AVEC LE RÉSULTAT, ET C'EST TOUTE LA DIFFÉRENCE.
    //
    // Une empreinte nulle avait deux causes possibles, indiscernables pour qui
    // ne lisait pas le journal : la voix n'est jamais seule dans la vidéo, ou
    // la vidéo n'a jamais été téléchargée. L'atelier annonçait la première dans
    // les deux cas — « passe l'exigence à tolérante » — devant un
    // « HTTP Error 403 » qu'aucun seuil ne réglera jamais.
    throw new ErreurRecolte(`Aucun extrait récolté.`, echecs)
  }

  // La référence : les extraits les plus propres d'abord, bout à bout, jusqu'à
  // la durée demandée. Un moteur zero-shot en lit quinze à trente secondes ; au
  // delà il n'écoute plus, et lui donner du moins bon ne peut que le desservir.
  const cumul = await refaisLaReference(dossier, manifeste)

  manifeste.totalS = +manifeste.extraits.reduce((s, e) => s + e.secondes, 0).toFixed(1)
  manifeste.marge = MARGE
  manifeste.majLe = new Date().toISOString()
  ecritJson(path.join(dossier, 'empreinte.json'), manifeste)

  journal.titre(`Empreinte « ${manifeste.id} »`)
  journal.ok(
    `${manifeste.extraits.length} extraits · ${duree(manifeste.totalS)} de voix seule · ` +
      `${manifeste.sources.length} source${manifeste.sources.length > 1 ? 's' : ''}`
  )
  journal.ok(`reference.wav — ${duree(cumul)} des meilleurs`)
  journal.detail(path.relative(CHEMINS.racine, dossier))
  console.log()
  if (echecs.length) diLesEchecs(echecs)
  verdict(manifeste.totalS)
  return manifeste
}

/**
 * La ligne qui explique, pas celle qui annonce.
 *
 * Les messages du pipeline commencent par le résumé — « Téléchargement de
 * l'audio impossible. » — et finissent par la cause, recopiée de l'outil qui a
 * échoué. Garder la PREMIÈRE ligne dans la liste des échecs revenait à écrire
 * quarante fois « impossible » sans jamais dire pourquoi : exactement le défaut
 * qu'on reprochait au message d'origine. On garde la dernière ligne non vide,
 * celle qui porte le « ERROR: … » de yt-dlp.
 */
function causeDe(message) {
  const lignes = String(message ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return (lignes.at(-1) ?? 'cause inconnue').slice(0, 200)
}

/**
 * Ce qui n'est pas passé, rassemblé à la fin plutôt que noyé dans le défilement.
 *
 * LA CONSIGNE NE SE RÉPÈTE PAS QUARANTE FOIS.
 *
 * Quand quarante liens Instagram échouent, ils échouent tous pour la même
 * raison et appellent tous le même geste. Recopier la marche à suivre sous
 * chacun noierait la seule ligne qu'il faut lire. Elle est donc dite une fois,
 * en bas, après la liste.
 */
/**
 * Un 403 sur un téléchargement YouTube accuse rarement YouTube.
 *
 * Il ressemble à une restriction de droits ou à un blocage régional, et il
 * envoie chercher des cookies, un VPN, une autre vidéo. Neuf fois sur dix c'est
 * un yt-dlp périmé : YouTube change la signature de ses URL toutes les quelques
 * semaines, et une version dépassée liste les formats sans broncher avant de se
 * faire refuser les octets. Le 1er septembre 2026, ça a coûté une demi-journée.
 *
 * On ne le devine pas : on lit la version installée et on la date.
 */
async function diLeSoupconYtdlp(echecs) {
  if (!echecs.some((e) => /403|forbidden/i.test(String(e.raison ?? '')))) return
  const version = await versionYtdlp()
  if (!version) return
  if (!ytdlpEstVieux(version)) return
  console.log()
  journal.attention(`yt-dlp date du ${version} — c'est probablement la vraie cause.`)
  journal.detail(`YouTube refuse les versions anciennes, et répond 403 au téléchargement.`)
  journal.detail(`Mets-le à jour : npm run empreinte -- --installe-ytdlp`)
}

function diLesEchecs(echecs, avecSession = false) {
  journal.attention(
    `${echecs.length} source${echecs.length > 1 ? 's' : ''} non récoltée${echecs.length > 1 ? 's' : ''} :`
  )
  for (const e of echecs) journal.detail(`${e.source} — ${e.raison}`)

  if (!echecs.some((e) => e.session)) {
    console.log()
    return
  }

  console.log()

  // DEUX SITUATIONS OPPOSÉES, DEUX CONSEILS DIFFÉRENTS.
  //
  // « Pose des cookies » dit à quelqu'un qui vient d'en poser est le genre de
  // message qui fait douter de l'outil plutôt que de la session. On sait
  // laquelle des deux on est : `avecSession` vient du réglage lu au départ.
  if (avecSession) {
    journal.info(`La session fournie n'a pas suffi.`)
    journal.detail(`Elle a peut-être expiré : réexporte le fichier depuis un navigateur`)
    journal.detail(`où tu es connecté, et vérifie que ce compte voit bien ces contenus.`)
    journal.detail(`Un export fait avant une déconnexion ne vaut plus rien.`)
  } else {
    journal.info(`Ces plateformes ne servent rien sans session ouverte, et aucune n'a été fournie.`)
    journal.detail(`1. Installe une extension « Get cookies.txt » dans ton navigateur.`)
    journal.detail(`2. Ouvre la plateforme, connecte-toi, exporte vers cookies.txt.`)
    journal.detail(`3. Relance :`)
    journal.detail(`     npm run empreinte -- --depuis=liens.txt --nom="…" \\`)
    journal.detail(`       --cookies-fichier=cookies.txt`)
    console.log()
    journal.detail(
      `Sous Windows, --cookies=chrome ne marche plus : depuis Chrome 127, la clé` +
        ` de déchiffrement est liée au navigateur (App-Bound Encryption). Edge a le` +
        ` même verrou. Firefox reste lisible : --cookies=firefox.`
    )
  }

  console.log()
  // LA SORTIE QUI NE DEMANDE AUCUNE SESSION, ET QU'ON OUBLIE.
  //
  // Pour trois reels, exporter des cookies coûte plus cher que de télécharger
  // les vidéos à la main et de pointer les fichiers. La commande accepte les
  // deux depuis le début ; encore faut-il que quelqu'un le rappelle au moment
  // précis où l'on est bloqué.
  journal.info(`Autre voie, sans aucun cookie : télécharge les vidéos toi-même,`)
  journal.detail(`puis donne les fichiers — la commande les accepte comme des adresses.`)
  journal.detail(`  npm run empreinte -- ./reel-1.mp4 ./reel-2.mp4 --nom="Untel"`)
  console.log()
}

/**
 * Ce que la récolte permet, et ce qu'il manque encore.
 *
 * Les deux moteurs ne demandent pas la même chose, et de très loin : quinze
 * secondes suffisent au zero-shot, un entraînement en réclame cent fois plus.
 * Annoncer « 4 minutes récoltées » sans dire à quoi ça donne droit laisserait
 * chercher le seuil ailleurs.
 */
function verdict(totalS) {
  if (totalS >= 900) {
    journal.ok(`Assez pour un entraînement (il en faut 15 à 30 min).`)
  } else if (totalS >= 15) {
    journal.ok(`Assez pour du zero-shot, qui lit 15 à 30 s.`)
    journal.detail(`Pour un entraînement, vise 15 min — il manque ${duree(900 - totalS)}.`)
  } else {
    journal.attention(
      `Court. Le zero-shot lit 15 à 30 s, il en manque ${duree(15 - totalS)} : ` +
        `ajoute une source.`
    )
  }
}

// ---------------------------------------------------------------------------
//  Lire ce qui est là
// ---------------------------------------------------------------------------

function empreintes() {
  if (!fs.existsSync(DOSSIER)) return []
  return fs
    .readdirSync(DOSSIER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => litJson(path.join(DOSSIER, e.name, 'empreinte.json'), null))
    .filter(Boolean)
    .sort((a, b) => (b.majLe ?? '').localeCompare(a.majLe ?? ''))
}

function liste() {
  const tout = empreintes()
  if (!tout.length) {
    journal.info(`Aucune empreinte. Récolte-en une : npm run empreinte -- <url>`)
    return
  }
  journal.titre(`Empreintes de voix`)
  for (const e of tout) {
    journal.ok(
      `${e.id} — ${duree(e.totalS ?? 0)} en ${e.extraits.length} extraits, ` +
        `${e.sources.length} source${e.sources.length > 1 ? 's' : ''}`
    )
  }
  console.log()
}

function detail(id) {
  const e = litJson(path.join(DOSSIER, id, 'empreinte.json'), null)
  if (!e) throw new Error(`Aucune empreinte « ${id} ». Vois --liste.`)

  journal.titre(`Empreinte « ${e.id} »`)
  journal.info(`${duree(e.totalS ?? 0)} de voix seule · seuil ${e.marge} dB`)
  console.log()
  // LE RANG S'AFFICHE PARCE QU'IL SERT À DÉSIGNER.
  //
  // `--retire-source=` prend ce numéro : sans lui, il faudrait recopier un
  // titre de soixante caractères pour retirer un doublon.
  // L'ÉCART QUI COMPTE EST CELUI DES EXTRAITS, PAS CELUI DU FICHIER.
  //
  // `reperes.ecartMedian` est mesuré sur tout le téléchargement, morceaux jetés
  // compris : une vidéo entièrement sur musique avec trente secondes de voix nue
  // affiche donc un chiffre médiocre alors que ce qu'on garde est impeccable —
  // et l'inverse est vrai aussi. On a lu ce chiffre comme un verdict sur le
  // corpus, et il contredisait l'oreille : normal, il ne parle pas de la même
  // chose. Ce qui entre dans le timbre, ce sont les EXTRAITS, et chacun porte sa
  // propre mesure.
  const ecartDesExtraits = (s) => {
    const notes = e.extraits.filter((x) => x.source === s.url).map((x) => x.note)
    if (!notes.length) return null
    return notes.sort((a, b) => a - b)[Math.floor(notes.length / 2)]
  }

  for (const [i, s] of e.sources.entries()) {
    journal.detail(`${String(i + 1).padStart(2)}. ${s.titre.slice(0, 60)}`)
    journal.detail(
      `    ${duree(s.secondes)} téléchargées → ${duree(s.retenuS)} gardées · ` +
        `écart des extraits ${ecartDesExtraits(s) ?? '?'} dB` +
        (s.raie
          ? s.raie.ecartDb >= RAIE_DB
            ? `  ⚠ sifflement ${s.raie.hz} Hz +${s.raie.ecartDb} dB`
            : ``
          : `  (raie non mesurée)`)
    )
  }
  console.log()
  const tries = [...e.extraits].sort((a, b) => b.note - a.note)
  for (const x of tries.slice(0, 15)) {
    journal.detail(
      `${x.fichier}  ${String(x.secondes).padStart(5)} s  ` +
        `pire écart ${String(x.note).padStart(5)} dB  (moyen ${x.ecartMoyen})`
    )
  }
  if (tries.length > 15) journal.detail(`… et ${tries.length - 15} autres`)
  console.log()
}

/**
 * Réunit plusieurs empreintes en une seule.
 *
 * LE PIÈGE QU'ELLE RÉPARE.
 *
 * Déposer cinq fichiers sans remplir « Ranger sous », c'est se retrouver avec
 * cinq empreintes d'une minute là où il en fallait une de cinq. Chacune est
 * trop courte pour entraîner quoi que ce soit, et leur somme aurait suffi. Le
 * geste manquant ne vaut pas de tout recommencer : les extraits sont déjà
 * découpés, propres, mesurés — il n'y a qu'à les rassembler.
 *
 * Les fichiers sont DÉPLACÉS, pas recopiés : une empreinte pèse des dizaines de
 * mégaoctets, et en laisser un double derrière ferait deux vérités pour une
 * seule voix.
 */
function fusionne(ids, nomDemande) {
  const sources = ids.map((id) => {
    const dossier = path.join(DOSSIER, id)
    if (path.dirname(dossier) !== DOSSIER) throw new Error(`Nom d'empreinte refusé : « ${id} ».`)
    const m = litJson(path.join(dossier, 'empreinte.json'), null)
    if (!m) throw new Error(`Aucune empreinte « ${id} ». Vois --liste.`)
    return { id, dossier, manifeste: m }
  })
  if (sources.length < 2) throw new Error(`Donne au moins deux empreintes à réunir.`)

  const cible = slugifie(nomDemande || sources[0].id)
  if (!cible) throw new Error(`--nom= ne donne aucun nom exploitable.`)
  const dossierCible = path.join(DOSSIER, cible)
  assureDossier(path.join(dossierCible, 'extraits'))

  const fondu = litJson(path.join(dossierCible, 'empreinte.json'), null) ?? {
    id: cible,
    cree: new Date().toISOString(),
    sources: [],
    extraits: [],
  }

  // LA MÊME SOURCE DÉPOSÉE DEUX FOIS NE DOIT COMPTER QU'UNE.
  //
  // Un fichier déposé sans `--nom=` crée son propre dossier ; le redéposer plus
  // tard en crée un autre. Tout réunir sans regarder ferait entrer deux fois le
  // même audio dans le corpus — et un entraînement qui voit deux fois le même
  // passage l'apprend deux fois : le modèle sur-ajuste sur ces secondes-là au
  // détriment du reste. Le doublon coûte donc plus cher que la minute qu'il
  // ajoute.
  //
  // Le chemin ne peut pas servir de clé : un fichier déposé porte à chaque fois
  // un nom temporaire différent. On compare ce qui identifie vraiment une
  // source — son titre et sa durée, à la seconde.
  const cleSource = (s) => `${s.titre ?? ''}|${Math.round(s.secondes ?? 0)}`
  const dejaLa = new Set((fondu.sources ?? []).map(cleSource))
  const ecartes = []

  let rang = fondu.extraits.length
  for (const s of sources) {
    if (s.dossier === dossierCible) continue

    // Les sources de CETTE empreinte qui font doublon, et les extraits qui en
    // viennent. Dans un manifeste, `extrait.source` reprend le `url` de sa
    // source : c'est ce lien qui permet d'écarter les bons extraits.
    const doublons = new Set()
    for (const src of s.manifeste.sources ?? []) {
      const cle = cleSource(src)
      if (dejaLa.has(cle)) {
        doublons.add(src.url)
        ecartes.push(src.titre ?? src.url)
      } else {
        dejaLa.add(cle)
        fondu.sources.push(src)
      }
    }

    for (const e of s.manifeste.extraits ?? []) {
      if (doublons.has(e.source)) continue
      const depuis = path.join(s.dossier, e.fichier)
      if (!fs.existsSync(depuis)) continue
      rang += 1
      const nom = `${String(rang).padStart(3, '0')}.wav`
      fs.renameSync(depuis, path.join(dossierCible, 'extraits', nom))
      fondu.extraits.push({ ...e, fichier: `extraits/${nom}` })
    }
    fs.rmSync(s.dossier, { recursive: true, force: true })
  }
  fondu._ecartes = ecartes

  fondu.marge = sources[0].manifeste.marge ?? MARGE
  fondu.totalS = +fondu.extraits.reduce((a, e) => a + e.secondes, 0).toFixed(1)
  fondu.majLe = new Date().toISOString()
  ecritJson(path.join(dossierCible, 'empreinte.json'), fondu)
  return fondu
}

/**
 * Refait `reference.wav` : les meilleurs extraits, bout à bout.
 *
 * ELLE SE REFAIT, ELLE NE SE RECOPIE PAS.
 *
 * La référence est le montage des extraits les mieux notés, tous confondus. Dès
 * que le corpus change — une source ajoutée, une source retirée — celle du
 * disque décrit un corpus qui n'existe plus. Personne ne s'en apercevrait avant
 * d'entendre le résultat, et on chercherait ailleurs.
 *
 * Ce montage était écrit trois fois : à la fin d'une récolte, après une fusion,
 * et il aurait fallu l'écrire une quatrième pour le retrait. Trois copies d'une
 * règle, c'est trois occasions de n'en corriger que deux.
 */
async function refaisLaReference(dossier, manifeste) {
  const meilleurs = [...(manifeste.extraits ?? [])].sort((a, b) => b.note - a.note)
  const retenus = []
  let cumul = 0
  for (const e of meilleurs) {
    if (cumul >= REFERENCE_S) break
    retenus.push(path.join(dossier, e.fichier))
    cumul += e.secondes
  }
  if (retenus.length) await recolleAudio(retenus, path.join(dossier, 'reference.wav'))
  manifeste.referenceS = +cumul.toFixed(1)
  return cumul
}

/**
 * Retire UNE source d'une empreinte, et les extraits qui en viennent.
 *
 * POURQUOI CE GESTE MANQUAIT, ET POURQUOI IL COMPTE.
 *
 * On ne pouvait que tout jeter (`--retire=`) ou tout garder. Or la même vidéo
 * déposée deux fois passe les gardes de `fusionne` : celles-ci comparent le
 * titre ET la durée, et deux téléchargements du même reel arrivent sous deux
 * noms de fichier différents. Le doublon ne se voit qu'après coup, dans le
 * détail, à deux lignes qui portent la même durée et le même écart.
 *
 * Le laisser coûte plus cher que la minute qu'il ajoute : un entraînement qui
 * voit deux fois le même passage l'apprend deux fois, et sur-ajuste sur ces
 * secondes-là au détriment du reste. La durée affichée, elle, ment sur la
 * variété réelle du corpus — c'est-à-dire sur la seule chose qui compte.
 *
 * On désigne la source par son RANG dans `--detail`, ou par un fragment de son
 * titre s'il ne désigne qu'elle. Jamais par son `url` : un fichier déposé porte
 * un nom temporaire, qui ne veut plus rien dire une fois la récolte finie.
 */
async function retireUneSource(id, designation) {
  const dossier = path.join(DOSSIER, id)
  if (path.dirname(dossier) !== DOSSIER) throw new Error(`Nom d'empreinte refusé : « ${id} ».`)
  const m = litJson(path.join(dossier, 'empreinte.json'), null)
  if (!m) throw new Error(`Aucune empreinte « ${id} ». Vois --liste.`)

  const sources = m.sources ?? []
  if (sources.length <= 1) {
    throw new Error(
      `« ${id} » n'a qu'une source : la retirer laisserait une empreinte vide.\n` +
        `Retire l'empreinte entière : npm run empreinte -- --retire=${id}`
    )
  }

  const brut = String(designation).trim()
  const rang = Number(brut)
  let index
  if (brut !== '' && Number.isInteger(rang)) {
    if (rang < 1 || rang > sources.length) {
      throw new Error(`Rang ${rang} hors de « ${id} » : il y a ${sources.length} sources (1 à ${sources.length}).`)
    }
    index = rang - 1
  } else {
    // Un fragment de titre, à condition qu'il ne désigne qu'une source. Deux
    // candidats et on s'arrête : retirer la mauvaise se paierait en récolte.
    const cherche = brut.toLowerCase()
    const trouves = sources
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => String(s.titre ?? '').toLowerCase().includes(cherche))
    if (!trouves.length) throw new Error(`Aucune source de « ${id} » dont le titre contienne « ${brut} ».`)
    if (trouves.length > 1) {
      const liste = trouves.map(({ s, i }) => `  ${i + 1}. ${String(s.titre).slice(0, 60)}`).join('\n')
      throw new Error(`« ${brut} » désigne ${trouves.length} sources. Donne son rang :\n${liste}`)
    }
    index = trouves[0].i
  }

  const partante = sources[index]
  // `extrait.source` reprend le `url` de sa source : c'est ce lien qui dit
  // quels fichiers s'en vont avec elle.
  const extraits = (m.extraits ?? []).filter((e) => e.source === partante.url)
  for (const e of extraits) fs.rmSync(path.join(dossier, e.fichier), { force: true })

  m.sources = sources.filter((_, i) => i !== index)
  m.extraits = (m.extraits ?? []).filter((e) => e.source !== partante.url)
  m.totalS = +m.extraits.reduce((a, e) => a + e.secondes, 0).toFixed(1)
  await refaisLaReference(dossier, m)
  m.majLe = new Date().toISOString()
  ecritJson(path.join(dossier, 'empreinte.json'), m)

  return { empreinte: m, retiree: partante, extraitsRetires: extraits.length }
}

/**
 * Mesure la raie tonale des sources d'une empreinte déjà récoltée.
 *
 * POURQUOI CE RATTRAPAGE EXISTE.
 *
 * La détection est arrivée après les premières récoltes : sans elle, les
 * empreintes d'avant restent muettes sur le seul défaut qui survit à
 * l'entraînement. Et c'est mesurable après coup, parce qu'on mesure les
 * EXTRAITS — ils sont sur le disque, contrairement au fichier téléchargé.
 *
 * Elle ne retire rien et ne recoupe rien : elle écrit une mesure dans le
 * manifeste, et c'est à la lecture qu'on décide.
 */
async function remesure(id) {
  const dossier = path.join(DOSSIER, id)
  if (path.dirname(dossier) !== DOSSIER) throw new Error(`Nom d'empreinte refusé : « ${id} ».`)
  const m = litJson(path.join(dossier, 'empreinte.json'), null)
  if (!m) throw new Error(`Aucune empreinte « ${id} ». Vois --liste.`)

  journal.titre(`Raies tonales · ${id}`)
  for (const s of m.sources ?? []) {
    const fichiers = (m.extraits ?? [])
      .filter((e) => e.source === s.url)
      .map((e) => path.join(dossier, e.fichier))
      .filter((f) => fs.existsSync(f))
    if (!fichiers.length) {
      s.raie = null
      continue
    }
    const r = await raieTonale(fichiers)
    s.raie = r.raie
    const titre = String(s.titre ?? '?').slice(0, 46).padEnd(46)
    if (r.raie && r.raie.ecartDb >= RAIE_DB) {
      journal.attention(`${titre} ${String(r.raie.hz).padStart(6)} Hz  +${r.raie.ecartDb} dB`)
    } else if (r.raie) {
      journal.ok(`${titre} ${String(r.raie.hz).padStart(6)} Hz  +${r.raie.ecartDb} dB`)
    } else {
      journal.detail(`${titre} pas mesurable`)
    }
  }

  m.majLe = new Date().toISOString()
  ecritJson(path.join(dossier, 'empreinte.json'), m)

  const sales = (m.sources ?? []).filter((s) => s.raie && s.raie.ecartDb >= RAIE_DB)
  const secondes = (cible) =>
    (m.sources ?? [])
      .filter((s) => cible.includes(s))
      .reduce((a, s) => a + (s.retenuS ?? 0), 0)
  console.log()
  if (!sales.length) {
    journal.ok(`Aucune source sifflante. Le corpus est propre.`)
  } else {
    const propres = (m.sources ?? []).filter((s) => !sales.includes(s))
    journal.attention(
      `${sales.length} source(s) sifflante(s) sur ${m.sources.length} — ` +
        `${duree(secondes(sales))} de corpus concernées.`
    )
    journal.info(`En les retirant, il resterait ${duree(secondes(propres))} de voix propre.`)
    journal.detail(`Retirer une source : npm run empreinte -- --retire-source=<rang> --de=${id}`)
  }
  console.log()
  return m
}

function retire(id, { silencieux = false } = {}) {
  // Le nom vient d'une route HTTP : il ne doit désigner qu'un dossier DANS
  // marque/voix/. Sans cette borne, un `..` bien placé effacerait ailleurs.
  const cible = path.join(DOSSIER, id)
  if (path.dirname(cible) !== DOSSIER) throw new Error(`Nom d'empreinte refusé : « ${id} ».`)
  if (!fs.existsSync(cible)) throw new Error(`Aucune empreinte « ${id} ».`)
  fs.rmSync(cible, { recursive: true, force: true })
  if (!silencieux) journal.ok(`« ${id} » retirée, fichiers compris.`)
}

// ---------------------------------------------------------------------------

principal(async () => {
  // `--json` : la même commande, mais parlée à l'atelier. Le format suit celui
  // des autres commandes du pipeline — un objet, sur la dernière ligne.
  const enJson = drapeau(options, 'json')
  const rends = (o) => void console.log(JSON.stringify({ ok: true, ...o }, null, 2))

  if (drapeau(options, 'liste')) {
    if (enJson) return rends({ empreintes: empreintes() })
    return liste()
  }

  if (typeof options.detail === 'string') {
    if (enJson) {
      const e = litJson(path.join(DOSSIER, options.detail, 'empreinte.json'), null)
      if (!e) throw new Error(`Aucune empreinte « ${options.detail} ».`)
      return rends({ empreinte: e })
    }
    return detail(options.detail)
  }

  if (typeof options.retire === 'string') {
    retire(options.retire, { silencieux: enJson })
    if (enJson) return rends({ retire: options.retire })
    return
  }

  if (drapeau(options, 'installe-ytdlp')) {
    const r = await installeYtdlp()
    if (enJson) return rends({ ytdlp: r })
    return
  }

  if (typeof options.remesure === 'string') {
    const m = await remesure(options.remesure)
    if (enJson) return rends({ empreinte: m })
    return
  }

  if (typeof options['retire-source'] === 'string') {
    const de = typeof options.de === 'string' ? options.de : null
    if (!de) {
      throw new Error(
        `Dis de quelle empreinte la source part :\n` +
          `  npm run empreinte -- --retire-source=4 --de=<id>\n` +
          `Les rangs s'affichent avec : npm run empreinte -- --detail=<id>`
      )
    }
    const r = await retireUneSource(de, options['retire-source'])
    if (enJson) return rends(r)

    journal.ok(
      `« ${String(r.retiree.titre).slice(0, 60)} » retirée de « ${de} » — ` +
        `${r.extraitsRetires} extrait(s), ${duree(r.retiree.retenuS ?? 0)}.`
    )
    journal.info(
      `Reste ${duree(r.empreinte.totalS)} de voix seule en ${r.empreinte.extraits.length} extraits, ` +
        `sur ${r.empreinte.sources.length} sources.`
    )
    console.log()
    verdict(r.empreinte.totalS)
    return
  }

  if (typeof options.fusionne === 'string') {
    const ids = options.fusionne.split(',').map((s) => s.trim()).filter(Boolean)
    const m = fusionne(ids, typeof options.nom === 'string' ? options.nom : null)

    // LA RÉFÉRENCE SE REFAIT, ELLE NE SE RECOPIE PAS.
    //
    // Elle est le montage des MEILLEURS extraits, tous confondus. Garder celle
    // de la première empreinte donnerait une référence qui ignore tout ce qu'on
    // vient de lui ajouter — et personne ne s'en apercevrait avant d'entendre
    // le résultat.
    const dossier = path.join(DOSSIER, m.id)
    const cumul = await refaisLaReference(dossier, m)

    // `_ecartes` sert à rendre compte, pas à être conservé : il part avant
    // l'écriture. Une clé technique laissée dans le manifeste finirait par être
    // lue comme une donnée de la voix.
    const ecartes = m._ecartes ?? []
    delete m._ecartes
    ecritJson(path.join(dossier, 'empreinte.json'), m)

    if (enJson) return rends({ empreinte: m, ecartes })
    journal.titre(`Empreinte « ${m.id} »`)
    journal.ok(
      `${m.extraits.length} extraits · ${duree(m.totalS)} de voix seule · ${m.sources.length} sources`
    )
    journal.ok(`reference.wav — ${duree(cumul)} des meilleurs`)
    if (ecartes.length) {
      journal.attention(`${ecartes.length} source(s) déjà présente(s), écartée(s) :`)
      for (const t of ecartes) journal.detail(String(t).slice(0, 70))
    }
    console.log()
    verdict(m.totalS)
    return
  }

  // `--depuis=` : les liens d'un fichier texte, un par ligne.
  const listeDepuis = typeof options.depuis === 'string' ? litLaListe(options.depuis) : []

  if (!positionnels.length && !listeDepuis.length) {
    throw new Error(
      `Donne au moins une source.\n` +
        `  npm run empreinte -- https://www.youtube.com/watch?v=… --nom="Untel"\n` +
        `  npm run empreinte -- --depuis=liens.txt --nom="Untel"\n` +
        `  npm run empreinte -- --liste`
    )
  }

  const nom = typeof options.nom === 'string' ? options.nom : null

  // `--depuis=` et les positionnels se cumulent : on peut donner une liste ET
  // ajouter deux liens trouvés depuis. Les doublons partent ici plutôt que de
  // se découvrir au téléchargement, où ils auraient déjà coûté une minute.
  const sources = [...new Set([...listeDepuis, ...positionnels])]
  try {
    const m = await recolte(sources, nom)
    if (enJson) rends({ empreinte: m })
  } catch (e) {
    if (!(e instanceof ErreurRecolte)) throw e
    // UNE RÉCOLTE QUI NE RAMÈNE RIEN N'EST PAS UN SUCCÈS.
    //
    // Elle sortait en code 0 avec `"empreinte": null`, donc la pastille de
    // l'atelier passait au vert au-dessus d'un journal qui disait
    // « téléchargement impossible ». `principal()` met le code de sortie à 1 et
    // affiche le message ; le JSON porte le détail par source.
    if (enJson) {
      console.log(JSON.stringify({ ok: false, empreinte: null, echecs: e.echecs }, null, 2))
    }
    throw new Error(
      e.echecs.length
        ? `${e.echecs.length} source(s) n'ont rien donné :\n` +
          e.echecs.map((x) => `  ${x.raison}`).join('\n')
        : `Aucun extrait récolté : la voix n'est jamais seule dans cette source.`
    )
  }
})
