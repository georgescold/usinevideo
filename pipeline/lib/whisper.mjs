/**
 * whisper.mjs — transcription locale, mot à mot, hors ligne et gratuite.
 *
 * Tout le montage automatique repose sur ces temps : les sous-titres, la coupe
 * des silences, et le calage des événements visuels sur le mot exact. Une
 * transcription approximative donne un montage approximatif.
 *
 * Deux versions du moteur :
 *   - processeur : 8 Mo, marche partout, environ 1× le temps réel en `medium` ;
 *   - carte NVIDIA : 270 Mo, cinq à dix fois plus rapide sur une RTX.
 * Le choix se fait par `WHISPER_GPU` dans .env, et se vérifie au premier usage.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { transcribe, downloadWhisperModel, toCaptions } from '@remotion/install-whisper-cpp'
import { CHEMINS, assureDossier, env, litChaine } from './chemins.mjs'
import { journal, duree } from './journal.mjs'
import { telecharge } from './http.mjs'
import { lance, lanceOuEchoue, extraitAudio, sonde } from './ffmpeg.mjs'

/** Version épinglée : c'est elle qui décide de l'emplacement de l'exécutable. */
export const VERSION_WHISPER = '1.9.2'

const DOSSIER_WHISPER = path.join(CHEMINS.outilsBin, 'whisper')
const EXECUTABLE = path.join(DOSSIER_WHISPER, 'build', 'bin', 'whisper-cli.exe')
const EXECUTABLE_UNIX = path.join(DOSSIER_WHISPER, 'build', 'bin', 'whisper-cli')

/**
 * Deux variantes du moteur.
 *
 * On prend le paquet CUDA 12.4 et non le 11.8, plus léger : seul le 12.4
 * embarque `cublas64_12.dll` et `cublasLt64_12.dll`. Le 11.8 les attend du
 * système, et sans le Toolkit installé son backend CUDA ne se charge pas —
 * whisper annonce alors « no GPU found » et retombe sur le processeur sans
 * qu'on s'en aperçoive. Le prix à payer est un téléchargement de 670 Mo, une
 * seule fois, partagé entre toutes les chaînes.
 */
const SOURCES = {
  processeur: `https://github.com/ggml-org/whisper.cpp/releases/download/v${VERSION_WHISPER}/whisper-bin-x64.zip`,
  nvidia: `https://github.com/ggml-org/whisper.cpp/releases/download/v${VERSION_WHISPER}/whisper-cublas-12.4.0-bin-x64.zip`,
}

/** Trace de la variante posée, pour savoir quoi faire si le réglage change. */
const MARQUEUR = path.join(DOSSIER_WHISPER, 'variante.json')

export const cheminExecutable = () => (os.platform() === 'win32' ? EXECUTABLE : EXECUTABLE_UNIX)

export const estInstalle = () => fs.existsSync(cheminExecutable())

/** Quelle variante est effectivement installée ? */
export function varianteInstallee() {
  if (!estInstalle()) return null
  try {
    return JSON.parse(fs.readFileSync(MARQUEUR, 'utf8')).variante
  } catch {
    // Installation antérieure au marqueur : c'était forcément la variante
    // processeur, la seule qui existait alors.
    return 'processeur'
  }
}

/** Une carte NVIDIA est-elle présente ? Constaté, pas supposé. */
export async function carteNvidia() {
  const { code, stdout } = await lance('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'])
  return code === 0 ? stdout.trim().split('\n')[0] || null : null
}

/**
 * Installe le moteur. Idempotent : ne fait rien s'il est déjà là.
 *
 * L'archive de whisper.cpp range tout dans `Release/`, alors que l'outillage
 * attend `build/bin/`. On réorganise à l'installation plutôt que de bricoler
 * le chemin à chaque appel — et les DLL doivent rester à côté de l'exécutable.
 */
export async function installe({ gpu = null, silencieux = false } = {}) {
  const veutGpu = gpu === null ? env('WHISPER_GPU', 'false') === 'true' : gpu
  const voulue = veutGpu ? 'nvidia' : 'processeur'
  const posee = varianteInstallee()

  if (posee === voulue) return { dejaLa: true, variante: posee, chemin: cheminExecutable() }

  if (posee && posee !== voulue) {
    // Le réglage a changé depuis la dernière fois. Sans ça, basculer
    // WHISPER_GPU ne ferait rien du tout et l'utilisateur croirait que sa carte
    // travaille alors que le binaire posé ne sait pas s'en servir.
    if (!silencieux) {
      journal.info(
        `Variante « ${posee} » installée, « ${voulue} » demandée. Remplacement du moteur…`
      )
    }
    fs.rmSync(DOSSIER_WHISPER, { recursive: true, force: true })
  }

  if (os.platform() !== 'win32') {
    throw new Error(
      `L'installation automatique de whisper.cpp n'est prévue que pour Windows dans cette stack. ` +
        `Sur un autre système, compile whisper.cpp à la main et place whisper-cli dans ${path.dirname(cheminExecutable())}.`
    )
  }

  const source = veutGpu ? SOURCES.nvidia : SOURCES.processeur
  const poids = veutGpu ? '670 Mo' : '8 Mo'

  if (!silencieux) {
    journal.info(
      `Installation de whisper.cpp ${VERSION_WHISPER} (${veutGpu ? 'accéléré NVIDIA' : 'processeur'}, ${poids})…`
    )
  }

  assureDossier(DOSSIER_WHISPER)
  const archive = path.join(CHEMINS.outilsBin, `whisper-${VERSION_WHISPER}.zip`)
  await telecharge(source, archive, { obligatoire: true, tempsMortMs: 900_000 })

  await lanceOuEchoue('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Force -LiteralPath '${archive}' -DestinationPath '${DOSSIER_WHISPER}'`,
  ])
  fs.rmSync(archive, { force: true })

  const release = path.join(DOSSIER_WHISPER, 'Release')
  const cible = path.join(DOSSIER_WHISPER, 'build', 'bin')
  if (fs.existsSync(release)) {
    assureDossier(cible)
    for (const nom of fs.readdirSync(release)) {
      fs.renameSync(path.join(release, nom), path.join(cible, nom))
    }
    fs.rmSync(release, { recursive: true, force: true })
  }

  if (!estInstalle()) {
    throw new Error(
      `whisper-cli est introuvable après installation. Contenu de ${DOSSIER_WHISPER} :\n` +
        fs.readdirSync(DOSSIER_WHISPER).join(', ')
    )
  }
  fs.writeFileSync(
    MARQUEUR,
    JSON.stringify({ variante: voulue, version: VERSION_WHISPER, le: new Date().toISOString() }, null, 2),
    'utf8'
  )
  if (!silencieux) journal.ok(`whisper.cpp (${voulue}) installé dans ${DOSSIER_WHISPER}`)
  return { dejaLa: false, variante: voulue, chemin: cheminExecutable() }
}

/**
 * LE MODÈLE PAR DÉFAUT EST `large-v3-turbo`, ET C'EST MESURÉ.
 *
 * Relevé le 8 septembre 2026 sur une VSL réelle de 897 mots, dont le script
 * donne la vérité — exactitude après correction par le script, la seule qui
 * compte puisque c'est ce que le pipeline produit :
 *
 *   medium           94,6 %   20,5 s
 *   large-v3-turbo   96,8 %   12,9 s
 *   large-v3         77,5 %  482,9 s
 *
 * `large-v3` complet est un PIÈGE, et c'est contre-intuitif : il a rendu 756
 * mots pour 897 attendus — il saute des passages entiers — en trente-cinq fois
 * le temps. Le prendre pour « le meilleur parce que le plus gros » aurait dégradé
 * la transcription en la ralentissant. C'est exactement pourquoi on mesure.
 *
 * `turbo` est meilleur ET plus rapide que `medium` : il n'y a pas d'arbitrage à
 * faire, seulement un défaut à corriger.
 *
 * ON REVIENT EN ARRIÈRE SANS TOUCHER AU CODE : `transcription.modele` dans
 * `config/chaine.json`, `WHISPER_MODELE=` dans `.env`, ou `--modele=` sur la
 * commande.
 *
 * CE QUI N'A RIEN CHANGÉ, ET QUI A ÉTÉ RETIRÉ. Un beam search élargi
 * (`-bs 8 -bo 8`) et un seuil d'entropie relevé (`-et 2.8`) rendent EXACTEMENT
 * le même résultat sur ce modèle — 860 mots justes des deux côtés. Le décodeur
 * distillé de `turbo` n'a que deux couches : il n'y a presque rien à explorer.
 * Du code qui prétend améliorer sans rien changer fait perdre du temps à qui le
 * lit ; ne pas le remettre sans une mesure qui le justifie.
 */
export const MODELE_DEFAUT = 'large-v3-turbo'

/**
 * Le modèle à employer, et d'où il vient.
 *
 * LA CHAÎNE PASSE AVANT `.env`, ET C'EST UNE QUESTION D'ACCÈS.
 *
 * `.env` ne s'édite qu'à la main, dans un fichier — c'est-à-dire nulle part,
 * puisque le §2 dit que rien ne se tape. `config/chaine.json` a sa commande et
 * son écran : la qualité de transcription devient donc une décision de chaîne,
 * réglable là où on travaille. `.env` reste pour ce qui appartient à la
 * MACHINE — un poste sans GPU ni patience peut y imposer `medium` pour toutes
 * les chaînes… mais alors le choix de la chaîne primerait. D'où l'ordre : ce
 * qu'on demande explicitement, puis la chaîne, puis la machine, puis le défaut.
 */
export function modeleVoulu(force = null) {
  if (force) return { modele: String(force), origine: 'ligne de commande' }
  let deLaChaine = null
  try {
    deLaChaine = litChaine({ exigeInitialisee: false })?.transcription?.modele ?? null
  } catch { /* pas de chaîne lisible : on descend d'un cran */ }
  if (deLaChaine) return { modele: String(deLaChaine), origine: 'chaîne' }
  const deLEnv = env('WHISPER_MODELE', null)
  if (deLEnv) return { modele: deLEnv, origine: '.env' }
  return { modele: MODELE_DEFAUT, origine: 'défaut' }
}

/** Télécharge un modèle. Les tailles vont de 75 Mo (tiny) à 3 Go (large-v3). */
export async function installeModele(modele = null, { silencieux = false } = {}) {
  const m = modeleVoulu(modele).modele
  assureDossier(CHEMINS.outilsModeles)
  const attendu = path.join(CHEMINS.outilsModeles, `ggml-${m}.bin`)
  if (fs.existsSync(attendu)) return { modele: m, chemin: attendu, dejaLa: true }

  if (!silencieux) journal.info(`Téléchargement du modèle « ${m} »… (une seule fois)`)
  await downloadWhisperModel({
    model: m,
    folder: CHEMINS.outilsModeles,
    printOutput: !silencieux,
  })
  return { modele: m, chemin: attendu, dejaLa: false }
}

/**
 * Transcrit un fichier audio ou vidéo.
 *
 * @returns { mots, texte, langue } où `mots` porte `{ texte, debutMs, finMs }`.
 */
export async function transcris(fichier, { modele = null, langue = null, silencieux = false } = {}) {
  await installe({ silencieux })
  const { modele: m } = await installeModele(modele, { silencieux })
  const lang = (langue || env('WHISPER_LANGUE', 'fr')).toLowerCase()

  // whisper.cpp n'accepte que du WAV 16 kHz mono. On convertit systématiquement
  // plutôt que de sonder : la conversion coûte moins cher qu'un échec obscur.
  const temporaire = path.join(
    os.tmpdir(),
    `whisper-${path.basename(fichier, path.extname(fichier))}-${process.pid}.wav`
  )
  await extraitAudio(fichier, temporaire)

  const debut = Date.now()
  let dernierPourcent = -1
  try {
    const brut = await transcribe({
      inputPath: temporaire,
      whisperPath: DOSSIER_WHISPER,
      whisperCppVersion: VERSION_WHISPER,
      model: m,
      modelFolder: CHEMINS.outilsModeles,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      language: lang,
      printOutput: false,
      // L'ATTENTION RAPIDE DÉSACTIVE LES INSTANTS PRÉCIS, EN SILENCE.
      //
      // `tokenLevelTimestamps` passe déjà `--dtw` à whisper.cpp — l'alignement
      // par déformation temporelle, qui donne l'instant réel de chaque mot au
      // lieu du découpage grossier du segment. Mais depuis la 1.9, l'attention
      // rapide est active PAR DÉFAUT, et les deux sont incompatibles :
      //
      //   whisper_init_with_params_no_state:
      //     dtw_token_timestamps is not supported with flash_attn - disabling
      //
      // La ligne passe dans le journal du sous-processus, que personne ne lit,
      // et `t_dtw` revient à −1 sur TOUS les mots. On payait donc l'option sans
      // jamais recevoir ce qu'elle promet.
      additionalArgs: ['-nfa'],
      onProgress: (p) => {
        if (silencieux) return
        const pc = Math.round(p * 100)
        if (pc !== dernierPourcent && pc % 5 === 0) {
          dernierPourcent = pc
          process.stdout.write(`\r  transcription ${pc} %   `)
        }
      },
    })
    if (!silencieux) process.stdout.write('\r' + ' '.repeat(30) + '\r')

    const { captions } = toCaptions({ whisperCppOutput: brut })

    // LE DÉBUT D'UN MOT VIENT DU DTW, SA DURÉE DES OFFSETS.
    //
    // `startMs` / `endMs` sont les bornes du SEGMENT, un découpage grossier :
    // mesuré sur une VSL de 931 mots, un mot sur cinq (22 %) commençait dans un
    // silence, jusqu'à 880 ms AVANT que la voix ne le prononce. C'est ce qu'on
    // entend comme « les sous-titres ne sont pas synchro », et c'est aussi ce
    // qui fabrique les pages d'un dixième de seconde : deux mots datés trop tôt,
    // une virgule qui ferme la page, et elle clignote.
    //
    // `timestampMs` est l'instant DTW du premier jeton du mot. Sur le même
    // fichier : 3 % de débuts dans le silence au lieu de 22 %, et 2 mots au-delà
    // de 300 ms d'avance au lieu de 32.
    //
    // LA FIN, ELLE, RESTE LA DURÉE D'ORIGINE. Prendre le début du mot suivant
    // collerait les mots bout à bout et supprimerait tous les silences — or
    // `pagine` s'en sert pour couper les pages. Vérifié : 83 coupures de silence
    // conservées contre 84 aujourd'hui, pour 114 silences réels.
    const dtw = captions.some((c) => c.timestampMs !== null)
    const bruts = captions
      .map((c, i) => {
        const debutMs = c.timestampMs ?? c.startMs
        const duree = Math.max(0, c.endMs - c.startMs)
        const suivant = captions[i + 1]
        const plafond = suivant ? (suivant.timestampMs ?? suivant.startMs) : Infinity
        return {
          texte: c.text.trim(),
          debutMs,
          finMs: Math.min(plafond, debutMs + duree),
        }
      })
      .filter((mot) => mot.texte.length > 0)

    // Trois défauts connus du moteur, corrigés avant que quoi que ce soit ne
    // soit construit dessus : le générique halluciné sur le silence de fin, les
    // horodatages qui reculent, et les nombres coupés en deux.
    const { mots, retires } = assainisMots(bruts)

    if (!silencieux) {
      journal.ok(`${mots.length} mots transcrits en ${duree((Date.now() - debut) / 1000)}`)
      // Un repli silencieux sur les bornes de segment était précisément le
      // défaut : on se demanderait ensuite pourquoi les sous-titres avancent.
      if (!dtw) {
        journal.attention(
          `Instants au segment près : whisper n'a pas rendu d'alignement fin ` +
            `pour « ${m} ». Les sous-titres peuvent devancer la voix d'un tiers de seconde.`
        )
      }
      if (retires.hallucinations) {
        journal.detail(`${retires.hallucinations} mot(s) hallucinés en fin de prise, retirés.`)
      }
      if (retires.recolles) journal.detail(`${retires.recolles} nombre(s) recollés.`)
      if (retires.reordonnes) {
        journal.detail(`${retires.reordonnes} horodatage(s) remis dans l'ordre.`)
      }
    }

    return {
      mots,
      texte: mots.map((mot) => mot.texte).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
      langue: brut.result?.language ?? lang,
      modele: m,
    }
  } finally {
    fs.rmSync(temporaire, { force: true })
  }
}

/**
 * Aligne un texte connu sur un audio.
 *
 * whisper.cpp ne sait pas faire d'alignement forcé : on transcrit, puis on
 * recale les mots du script sur ceux entendus. Le script fait foi pour
 * l'orthographe, l'audio fait foi pour le temps.
 */
export async function aligne(fichier, texteAttendu, options = {}) {
  const { mots: entendus, langue, modele } = await transcris(fichier, options)
  // L'ESPACE FINE D'UN NOMBRE N'EST PAS UNE SÉPARATION DE MOTS.
  //
  // `assainisMots` recolle « 480 » et « 000 » en un seul mot, avec une espace
  // fine insécable au milieu : c'est un montant, il s'affiche d'un bloc. Mais
  // `--recale` reconstruit son texte de référence en joignant les mots par des
  // espaces, et `\s+` rattrape aussi l'espace fine : chaque montant repartait en
  // deux. Relevé sur une VSL : 12 nombres cassés — « 480 000 », « 82 194 »,
  // « 13 989 » — par une commande qui promet de ne pas toucher aux mots.
  const SCEAU = ''
  const attendus = texteAttendu
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/(\d) (\d)/g, `$1${SCEAU}$2`)
    .split(/\s+/)
    .map((x) => x.trim().split(SCEAU).join(' '))
    .filter(Boolean)

  const nu = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '')

  const A = attendus.map(nu)
  const B = entendus.map((mot) => nu(mot.texte))
  const { dureeS } = await sonde(fichier)
  const dureeMs = Math.round(dureeS * 1000)

  // Plus longue sous-sequence commune. Contrairement a un balayage glouton,
  // elle encaisse une phrase sautee, un mot repete ou une reprise en cours de
  // prise -- ce qui arrive a tous les tournages.
  const n = A.length
  const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const sortie = attendus.map((texte) => ({ texte, debutMs: null, finMs: null }))
  let i = 0
  let j = 0
  let ancres = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      sortie[i].debutMs = entendus[j].debutMs
      sortie[i].finMs = entendus[j].finMs
      ancres++
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }

  const tauxAncrage = n ? ancres / n : 0

  if (tauxAncrage < 0.5) {
    // Trop peu de reperes pour croire l'alignement. Plutot que d'empiler tous
    // les mots au meme endroit -- ce qui donne des sous-titres qui defilent en
    // deux secondes puis plus rien -- on les repartit sur la duree reelle.
    journal.attention(
      `Seuls ${ancres} mots sur ${n} ont ete reconnus dans l'audio (${Math.round(tauxAncrage * 100)} %). ` +
        `Repartition uniforme sur ${Math.round(dureeS)} s : les sous-titres suivront le rythme moyen, ` +
        `pas le mot exact. Verifie que la prise correspond au script et que le son est net.`
    )
    const pas = dureeMs / Math.max(n, 1)
    return {
      mots: sortie.map((mot, k) => ({
        texte: mot.texte,
        debutMs: Math.round(k * pas),
        finMs: Math.round((k + 0.85) * pas),
        incertain: true,
      })),
      langue,
      modele,
      entendus,
      tauxAncrage,
    }
  }

  // Les mots non ancres se repartissent regulierement entre leurs deux voisins
  // ancres. Leur donner l'horodatage du voisin les ferait tous apparaitre et
  // disparaitre ensemble.
  let precedent = -1
  for (let k = 0; k <= n; k++) {
    const ancre = k < n && sortie[k].debutMs !== null
    if (!ancre && k < n) continue

    const trou = k - precedent - 1
    if (trou > 0) {
      const debutTrou = precedent >= 0 ? sortie[precedent].finMs : 0
      const finTrou = k < n ? sortie[k].debutMs : dureeMs
      const pas = (finTrou - debutTrou) / (trou + 1)
      for (let t = 0; t < trou; t++) {
        const cible = precedent + 1 + t
        sortie[cible].debutMs = Math.round(debutTrou + pas * t)
        sortie[cible].finMs = Math.round(debutTrou + pas * (t + 0.9))
        sortie[cible].incertain = true
      }
    }
    precedent = k
  }

  const incertains = sortie.filter((mot) => mot.incertain).length
  if (incertains > n * 0.15) {
    journal.attention(
      `${incertains} mots sur ${n} n'ont pas ete retrouves tels quels dans l'audio ` +
        `(${Math.round(tauxAncrage * 100)} % d'ancrage). Leur position est interpolee : ` +
        `l'ensemble reste cale, mais ces mots-la peuvent glisser d'une fraction de seconde.`
    )
  }

  return { mots: sortie, langue, modele, entendus, tauxAncrage }
}

/** État de l'installation, pour `npm run verifie`. */
export async function etat() {
  const { modele, origine: origineModele } = modeleVoulu()
  const cheminModele = path.join(CHEMINS.outilsModeles, `ggml-${modele}.bin`)
  const gpu = await carteNvidia()
  let tailleModele = null
  if (fs.existsSync(cheminModele)) {
    tailleModele = Math.round(fs.statSync(cheminModele).size / 1e6)
  }
  return {
    installe: estInstalle(),
    variante: varianteInstallee(),
    version: VERSION_WHISPER,
    chemin: cheminExecutable(),
    modele,
    // D'où vient ce choix : quand une transcription déçoit, la première
    // question est « avec quel modèle », et la seconde « qui l'a décidé ».
    origineModele,
    modelePresent: fs.existsSync(cheminModele),
    tailleModeleMo: tailleModele,
    gpu,
    gpuActif: env('WHISPER_GPU', 'false') === 'true',
  }
}

export { sonde }

// ---------------------------------------------------------------------------
//  Correction par le script : les homophones
// ---------------------------------------------------------------------------

/**
 * Le squelette sonore d'un texte français.
 *
 * On ramène l'orthographe à ce qui s'entend : accents retirés, lettres muettes
 * de fin supprimées, graphies équivalentes réduites à une seule, apostrophes et
 * espaces effacés. « la voir » et « l'avoir » donnent tous deux `lavwar` — ce
 * qui est exactement le problème qu'on cherche à trancher.
 */
export function squeletteSonore(texte) {
  let s = String(texte)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')

  // Lettres muettes en fin de mot, avant d'effacer les espaces. On épargne les
  // mots courts : réduire « ces » à « c » écrase l'essentiel du mot, et deux
  // squelettes trop courts finissent par se ressembler par accident — ce qui
  // ferait corriger des passages qui ne sonnent pas pareil du tout.
  // On répète jusqu'à stabilité : « cest » perd son t, devient « ces », et doit
  // encore perdre son s pour rejoindre « ces » → « ce ». Un seul passage laissait
  // les deux graphies à un caractère l'une de l'autre, donc non reconnues.
  let avant
  do {
    avant = s
    s = s.replace(/([a-z]{2,})(?:ent|es)\b/g, '$1').replace(/([a-z]{2,})[stdxzp]\b/g, '$1')
  } while (s !== avant)

  s = s
    .replace(/\s+/g, '')
    .replace(/qu|q/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/eau|au/g, 'o')
    .replace(/ai|ei|ay/g, 'e')
    .replace(/oi/g, 'wa')
    .replace(/ou/g, 'u')
    .replace(/gn/g, 'n')
    .replace(/c([ei])/g, 's$1')
    .replace(/g([ei])/g, 'j$1')
    .replace(/c/g, 'k')
    .replace(/h/g, '')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1')

  return s
}

/**
 * Corrige la transcription là où elle a mal ENTENDU, sans écraser ce qui a été
 * réellement dit autrement.
 *
 * La transcription se trompe régulièrement entre deux graphies qui sonnent
 * pareil : « la voir » devient « l'avoir », « c'est » devient « ces ». Le script,
 * lui, porte la bonne. Mais on ne peut pas simplement lui redonner la main :
 * quand la personne improvise, c'est la transcription qui a raison.
 *
 * D'où la règle, et elle est stricte : **on ne remplace que si les deux versions
 * ont le même squelette sonore.** Une divergence qui s'entend est une
 * improvisation et reste intacte ; une divergence qui ne s'entend pas est une
 * faute d'écoute et se corrige. Aucun jugement n'est nécessaire, donc aucun
 * risque de réécrire la voix.
 */
export function corrigeParLeScript(mots, texteScript) {
  const nu = (s) =>
    String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

  const attendus = String(texteScript).replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean)
  const A = attendus.map(nu)
  const B = mots.map((m) => nu(m.texte))
  const n = A.length
  const p = B.length
  if (!n || !p) return { mots, corrections: [] }

  const dp = Array.from({ length: n + 1 }, () => new Int32Array(p + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = p - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const sortie = []
  const corrections = []
  let i = 0
  let j = 0

  const videSpan = (i0, i1, j0, j1) => {
    const dits = mots.slice(j0, j1)
    if (i1 > i0 && j1 > j0) {
      const entendu = dits.map((m) => m.texte).join(' ')
      const cible = squeletteSonore(entendu)

      // On cherche le morceau de script qui SONNE comme ce qui a été entendu.
      //
      // Une divergence isolée est rare : autour d'un homophone, il y a souvent un
      // mot que la personne a sauté. « la voir. Et » face à « l'avoir. » ne sonne
      // pas pareil à cause du « Et » non dit, alors que « la voir. » si.
      // On essaie donc tous les sous-ensembles contigus du côté script, du plus
      // long au plus court, et on retient le premier qui correspond exactement.
      let i0b = -1
      let i1b = -1
      for (let taille = i1 - i0; taille >= 1 && i0b === -1; taille--) {
        for (let d = i0; d + taille <= i1; d++) {
          if (squeletteSonore(attendus.slice(d, d + taille).join(' ')) === cible) {
            i0b = d
            i1b = d + taille
            break
          }
        }
      }
      if (i0b !== -1) {
        i0 = i0b
        i1 = i1b
      }
      const attendu = attendus.slice(i0, i1).join(' ')
      if (i0b !== -1 || squeletteSonore(attendu) === cible) {
        // Même son, orthographe différente : le script tranche. Les temps du
        // segment entendu sont répartis sur les mots du script.
        const debut = dits[0].debutMs
        const fin = dits[dits.length - 1].finMs
        const nb = i1 - i0
        const pas = (fin - debut) / nb
        for (let k = 0; k < nb; k++) {
          sortie.push({
            texte: attendus[i0 + k],
            debutMs: Math.round(debut + pas * k),
            finMs: Math.round(debut + pas * (k + 1)),
          })
        }
        corrections.push({ entendu, corrige: attendu })
        return
      }
    }
    sortie.push(...dits)
  }

  let i0 = 0
  let j0 = 0
  while (i < n && j < p) {
    if (A[i] === B[j]) {
      if (i > i0 || j > j0) videSpan(i0, i, j0, j)
      sortie.push(mots[j])
      i++
      j++
      i0 = i
      j0 = j
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  videSpan(i0, n, j0, p)

  return { mots: sortie, corrections }
}

// ---------------------------------------------------------------------------
//  Assainissement de la transcription
// ---------------------------------------------------------------------------

/**
 * Les phrases que whisper invente sur le silence de fin de prise.
 *
 * Le modèle a vu passer des milliers de sous-titres qui finissent par un
 * générique. Quand la prise se termine sur deux secondes de rien, il « entend »
 * donc ce générique. C'est une hallucination reproductible, pas un accident : on
 * la retire d'office plutôt que d'espérer qu'elle ne revienne pas.
 */
const HALLUCINATIONS = [
  'sous-titrage société radio-canada',
  'sous-titrage st',
  'sous-titres réalisés par',
  'sous-titres par',
  'amara.org',
  'merci d\'avoir regardé',
  'merci à tous',
  'abonnez-vous',
  'thanks for watching',
  'subtitles by',
  'thank you for watching',
]

/**
 * Nettoie une liste de mots transcrits.
 *
 * Trois corrections, chacune motivée par un défaut observé :
 *
 *  1. **Les hallucinations de fin** (voir ci-dessus), coupées avec tout ce qui
 *     suit — une fois que le modèle est parti dans le générique, il n'en revient
 *     pas.
 *  2. **Les horodatages non croissants.** whisper date par segments puis répartit
 *     les mots dedans ; il arrive que deux mots partagent le même instant, ou
 *     repartent en arrière. Deux sous-titres se superposent alors à l'écran.
 *     On force un écart minimal strict.
 *  3. **Les nombres éclatés.** « 5 000 » sort en deux mots, et la pagination des
 *     sous-titres peut tomber entre les deux : on lit « 5 » sur une page et
 *     « 000 » sur la suivante. On les recolle en un seul mot insécable.
 */
export function assainisMots(mots, { ecartMinMs = 50 } = {}) {
  const retires = { hallucinations: 0, recolles: 0, reordonnes: 0 }

  // 1. Hallucinations de fin. On ne regarde que le dernier tiers : la même
  //    formule prononcée en plein milieu est un vrai propos.
  let coupe = mots.length
  const depart = Math.floor(mots.length * 0.66)
  for (let i = depart; i < mots.length; i++) {
    const suite = mots.slice(i, i + 8).map((m) => m.texte).join(' ').toLowerCase()
    if (HALLUCINATIONS.some((h) => suite.startsWith(h))) {
      coupe = i
      break
    }
  }
  if (coupe < mots.length) retires.hallucinations = mots.length - coupe
  let sortie = mots.slice(0, coupe)

  // 2. Nombres éclatés : un groupe de trois chiffres qui suit un nombre.
  const recolle = []
  for (const m of sortie) {
    const precedent = recolle[recolle.length - 1]
    if (
      precedent &&
      /^\d+$/.test(precedent.texte.replace(/[^\d]/g, '')) &&
      /^\d{3}[.,]?$/.test(m.texte) &&
      m.debutMs - precedent.finMs < 200
    ) {
      precedent.texte = `${precedent.texte}\u202f${m.texte}` // espace fine insécable
      precedent.finMs = m.finMs
      retires.recolles++
      continue
    }
    recolle.push({ ...m })
  }
  sortie = recolle

  // 3. Monotonie stricte.
  for (let i = 1; i < sortie.length; i++) {
    if (sortie[i].debutMs < sortie[i - 1].debutMs + ecartMinMs) {
      sortie[i].debutMs = sortie[i - 1].debutMs + ecartMinMs
      retires.reordonnes++
    }
    if (sortie[i].finMs <= sortie[i].debutMs) sortie[i].finMs = sortie[i].debutMs + ecartMinMs
  }

  return { mots: sortie, retires }
}
