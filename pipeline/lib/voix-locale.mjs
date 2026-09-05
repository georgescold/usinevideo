/**
 * voix-locale.mjs — l'outillage local de la voix : séparation et mesure.
 *
 * TOUT EST LOCAL, TOUT EST GRATUIT, RIEN N'APPELLE UNE API.
 *
 * La séparation tourne sur `audio-separator` (les modèles UVR, ceux-là mêmes
 * que la communauté RVC emploie pour préparer ses jeux de voix). Elle vit dans
 * un environnement Python isolé, posé dans le CACHE PARTAGÉ à côté de
 * whisper.cpp — jamais dans le dossier de la chaîne : copier une chaîne ne doit
 * pas dupliquer trois cents mégaoctets qui ne lui appartiennent pas (§4).
 *
 * L'environnement hérite des paquets du Python du poste (`--system-site-packages`).
 * Ce n'est pas une économie de place, c'est une économie de TÉLÉCHARGEMENT :
 * `audio-separator` réclame torch, torch pèse deux gigaoctets et demi, et le
 * poste en a déjà un. On ne le retélécharge pas.
 *
 * CE MODULE NE DÉCIDE RIEN. Il sépare, il mesure, il rend des nombres. Ce qu'on
 * garde et ce qu'on jette se tranche dans `empreinte.mjs`, où le seuil se règle.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { CHEMINS, assureDossier, env, litJson, litChaine, dossierVideo } from './chemins.mjs'
import { journal } from './journal.mjs'
import { spawn } from 'node:child_process'

import { lance, lanceOuEchoue } from './ffmpeg.mjs'

/** L'environnement Python de la voix, dans le cache partagé. */
export const DOSSIER_VENV = path.join(CHEMINS.cachePartage, 'venv-voix')

/** Les modèles de séparation, dans le cache partagé eux aussi. */
export const DOSSIER_MODELES = path.join(CHEMINS.cachePartage, 'modeles', 'separation')

const EXE = os.platform() === 'win32'
const binVenv = (nom) =>
  EXE ? path.join(DOSSIER_VENV, 'Scripts', `${nom}.exe`) : path.join(DOSSIER_VENV, 'bin', nom)

export const pythonDuVenv = () => binVenv('python')
export const separateurDuVenv = () => binVenv('audio-separator')

/**
 * LE MODÈLE PAR DÉFAUT SÉPARE L'ACCOMPAGNEMENT, PAS LA VOIX.
 *
 * C'est contre-intuitif et c'est pourtant le bon choix ici. On ne se sert pas
 * de la piste vocale — les extraits sont découpés dans l'original (voir
 * `analyse-voix.py`). Ce qu'on mesure, c'est le RÉSIDU. Le modèle qu'il faut
 * est donc celui qui isole le mieux l'accompagnement, pas celui qui flatte la
 * voix : une voix qui bave dans le résidu ferait passer une prise propre pour
 * une prise sur musique, et on jetterait la bonne matière.
 *
 * `Inst_HQ_4` mène le classement des modèles ONNX sur ce critère (SDR 15,5).
 * ONNX compte : il tourne sur `onnxruntime`, déjà présent, sans réclamer une
 * seconde pile de calcul.
 */
export const MODELE_DEFAUT = 'UVR-MDX-NET-Inst_HQ_4.onnx'

/** L'outillage est-il déjà posé ? */
export function outillagePose() {
  return fs.existsSync(pythonDuVenv()) && fs.existsSync(separateurDuVenv())
}

/**
 * Pose l'environnement Python. Idempotent : ne fait rien s'il est déjà là.
 *
 * Le Python du poste doit exister — on ne va pas l'installer à sa place, et
 * échouer en le disant vaut mieux que de télécharger un interpréteur dans le
 * dos de quelqu'un.
 */
export async function installeOutillage({ silencieux = false } = {}) {
  if (outillagePose()) return { dejaLa: true, dossier: DOSSIER_VENV }

  const python = env('PYTHON_PATH', null) || (EXE ? 'python' : 'python3')
  const { code, stdout } = await lance(python, ['--version'])
  if (code !== 0) {
    throw new Error(
      `Python est introuvable. Installe Python 3.10 ou plus récent, ` +
        `ou renseigne PYTHON_PATH dans .env.`
    )
  }

  if (!silencieux) {
    journal.info(`Python détecté — ${stdout.trim() || 'version inconnue'}`)
    journal.info(
      `Installation de l'outillage de séparation dans le cache partagé (≈ 300 Mo, une seule fois).`
    )
    journal.detail(DOSSIER_VENV)
  }

  assureDossier(path.dirname(DOSSIER_VENV))
  // `--system-site-packages` : on hérite du torch du poste au lieu d'en
  // retélécharger deux gigaoctets et demi. Voir l'en-tête du fichier.
  await lanceOuEchoue(python, ['-m', 'venv', '--system-site-packages', DOSSIER_VENV])
  await lanceOuEchoue(pythonDuVenv(), ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'])
  await lanceOuEchoue(pythonDuVenv(), ['-m', 'pip', 'install', '--quiet', 'audio-separator'])

  if (!outillagePose()) {
    throw new Error(
      `L'installation s'est terminée sans erreur mais ${separateurDuVenv()} est absent. ` +
        `Supprime ${DOSSIER_VENV} et relance.`
    )
  }
  if (!silencieux) journal.ok(`Outillage posé.`)
  return { dejaLa: false, dossier: DOSSIER_VENV }
}

/**
 * Sépare un fichier en deux pistes : la voix, et tout le reste.
 *
 * Rend les deux chemins. Le nom des sorties est imposé par `audio-separator`
 * (« <base>_(Vocals)_<modèle>.wav ») : on les retrouve au motif plutôt que de
 * les deviner, parce que ce motif a déjà changé d'une version à l'autre.
 */
export async function separe(fichier, dossierSortie, { modele = MODELE_DEFAUT } = {}) {
  await installeOutillage({ silencieux: true })
  assureDossier(dossierSortie)
  assureDossier(DOSSIER_MODELES)

  await lanceOuEchoue(separateurDuVenv(), [
    fichier,
    '--model_filename', modele,
    '--model_file_dir', DOSSIER_MODELES,
    '--output_dir', dossierSortie,
    '--output_format', 'WAV',
  ])

  const produits = fs.readdirSync(dossierSortie).filter((f) => f.toLowerCase().endsWith('.wav'))
  const trouve = (motif) => {
    const f = produits.find((p) => motif.test(p))
    return f ? path.join(dossierSortie, f) : null
  }
  const voix = trouve(/\(vocals\)/i)
  const accompagnement = trouve(/\(instrumental\)/i)

  if (!voix || !accompagnement) {
    throw new Error(
      `La séparation n'a pas produit les deux pistes attendues.\n` +
        `Trouvé dans ${dossierSortie} : ${produits.join(', ') || '(rien)'}`
    )
  }
  return { voix, accompagnement }
}

// ---------------------------------------------------------------------------
//  L'entraînement : Applio
// ---------------------------------------------------------------------------
//
// POURQUOI APPLIO ET PAS LE PAQUET `rvc` DE PyPI.
//
// `pip install rvc` existe, et il réclame `fairseq >=0.12.2,<0.13`. fairseq
// 0.12.2 date de 2022, ne fournit pas de roue pour Python 3.11 sous Windows, et
// se compile en réclamant des versions d'omegaconf et de hydra qui entrent en
// conflit avec tout le reste. C'est l'écueil connu de l'installation de RVC.
//
// Applio est le fork maintenu du projet, sous licence MIT, et il a retiré
// fairseq : l'embedder passe par `transformers`. Ses dépendances s'installent
// sans rien compiler. C'est aussi lui qui a repris le CLI, `rvc-cli` n'étant
// plus maintenu.
//
// IL A SON PROPRE ENVIRONNEMENT, ET C'EST VOLONTAIRE.
//
// Le venv de la séparation hérite des paquets du poste pour ne pas retélécharger
// torch. Celui-ci ne le peut pas : le torch du poste est un torch PROCESSEUR, et
// il masquerait le torch CUDA dont l'entraînement a besoin. On aurait alors un
// entraînement qui tourne — sur le processeur, cent fois plus lentement, sans
// rien dire.

export const DOSSIER_APPLIO = path.join(CHEMINS.cachePartage, 'applio')

const binApplio = (nom) =>
  EXE
    ? path.join(DOSSIER_APPLIO, 'venv', 'Scripts', `${nom}.exe`)
    : path.join(DOSSIER_APPLIO, 'venv', 'bin', nom)

export const pythonApplio = () => binApplio('python')
export const coreApplio = () => path.join(DOSSIER_APPLIO, 'core.py')

/** Applio est-il posé, avec son environnement ? */
export function applioPose() {
  return fs.existsSync(coreApplio()) && fs.existsSync(pythonApplio())
}

/**
 * Les index de roues CUDA, du plus récent au plus ancien.
 *
 * LA VERSION DE TORCH QU'APPLIO ÉPINGLE N'EXISTE PAS SUR TOUS LES INDEX.
 *
 * Relevé le 31 août 2026 : `cu129` s'arrête à 2.9.0 pour Windows, alors que
 * `cu128` fournit bien 2.11.0 — la version demandée. Essayer dans l'ordre et
 * garder le premier qui rend un torch qui VOIT la carte est la seule façon
 * fiable de traverser ça sans épingler nous-mêmes une version qui vieillira.
 */
const INDEX_CUDA = ['cu129', 'cu128', 'cu126']

/** La version de torch qu'Applio réclame, lue dans son propre fichier. */
function torchDemande() {
  const req = path.join(DOSSIER_APPLIO, 'requirements.txt')
  const m = fs.existsSync(req) && fs.readFileSync(req, 'utf8').match(/^torch==([\d.]+)/m)
  return m ? m[1] : null
}

/**
 * Pose Applio : le dépôt, son environnement, un torch CUDA, ses dépendances.
 *
 * Idempotent. Trois gigaoctets la première fois, rien ensuite.
 */
export async function installeApplio({ silencieux = false } = {}) {
  if (applioPose()) return { dejaLa: true, dossier: DOSSIER_APPLIO }

  const python = env('PYTHON_PATH', null) || (EXE ? 'python' : 'python3')
  if ((await lance(python, ['--version'])).code !== 0) {
    throw new Error(`Python est introuvable. Renseigne PYTHON_PATH dans .env.`)
  }
  const { code: codeGit } = await lance('git', ['--version'])
  if (codeGit !== 0) throw new Error(`git est introuvable : il sert à récupérer Applio.`)

  if (!silencieux) {
    journal.info(`Installation de l'outillage d'entraînement (Applio, ≈ 3 Go, une seule fois).`)
    journal.detail(DOSSIER_APPLIO)
  }

  if (!fs.existsSync(coreApplio())) {
    assureDossier(path.dirname(DOSSIER_APPLIO))
    await lanceOuEchoue('git', [
      'clone', '--depth', '1', 'https://github.com/IAHispano/Applio.git', DOSSIER_APPLIO,
    ])
  }

  const venv = path.join(DOSSIER_APPLIO, 'venv')
  if (!fs.existsSync(pythonApplio())) {
    // PAS de `--system-site-packages` : voir la note en tête de section. Le
    // torch processeur du poste masquerait le torch CUDA.
    await lanceOuEchoue(python, ['-m', 'venv', venv])
  }
  await lanceOuEchoue(pythonApplio(), ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'])

  const version = torchDemande()
  if (!silencieux) journal.detail(`torch ${version ?? '(non épinglé)'} avec CUDA…`)
  let pose = false
  for (const idx of INDEX_CUDA) {
    const paquets = version ? [`torch==${version}`, `torchaudio==${version}`] : ['torch', 'torchaudio']
    const r = await lance(pythonApplio(), [
      '-m', 'pip', 'install', ...paquets,
      '--index-url', `https://download.pytorch.org/whl/${idx}`,
    ])
    if (r.code !== 0) continue
    const vu = await cudaDisponible()
    if (vu?.cuda) {
      if (!silencieux) journal.ok(`torch ${vu.torch} (${idx}) — ${vu.carte}`)
      pose = true
      break
    }
  }
  if (!pose && !silencieux) {
    journal.attention(
      `Aucun index CUDA n'a donné un torch qui voit la carte. ` +
        `L'entraînement refusera de démarrer.`
    )
  }

  await installeLesDependances({ silencieux })
  await prerequisitesApplio({ silencieux })

  if (!applioPose()) throw new Error(`Applio est incomplet après installation : ${DOSSIER_APPLIO}`)
  if (!silencieux) journal.ok(`Outillage d'entraînement posé.`)
  return { dejaLa: false, dossier: DOSSIER_APPLIO }
}

/**
 * `assets/config.json`, que le clone ne contient pas — et sans lequel
 * l'entraînement tourne pour rien.
 *
 * LE SYMPTÔME ÉTAIT PARTICULIÈREMENT VICIEUX.
 *
 * Le dépôt ne livre que `config_template.json` ; c'est l'installateur officiel
 * qui en fait une copie au premier lancement. En clonant à la main, ce fichier
 * manque. L'entraînement ne s'en plaint pas : il prépare, extrait, tourne ses
 * époques, enregistre ses points de reprise, annonce « trained successfully »
 * et sort en code 0. Seule une ligne perdue au milieu des barres de
 * progression avoue le problème :
 *
 *     An error occurred extracting the model: [Errno 2] No such file or
 *     directory: …\assets\config.json
 *
 * Car l'extraction du modèle final est enveloppée dans un `try` qui avale son
 * erreur. On récolte donc `G_2333333.pth` et `D_2333333.pth` — les états de
 * l'optimiseur, 1,3 Go inutilisables — et pas le modèle. Une heure de carte
 * graphique pour rien, sans un seul message d'échec.
 *
 * `extract_model` n'y lit qu'une chose : `model_author`. Copier le gabarit
 * suffit.
 */
function poseLaConfigApplio() {
  const config = path.join(DOSSIER_APPLIO, 'assets', 'config.json')
  if (fs.existsSync(config)) return
  const gabarit = path.join(DOSSIER_APPLIO, 'assets', 'config_template.json')
  if (!fs.existsSync(gabarit)) return
  fs.copyFileSync(gabarit, config)
}

/**
 * Les modèles qu'Applio a besoin de télécharger avant de pouvoir entraîner.
 *
 * Trois choses : l'embedder (contentvec, qui encode CE QUI EST DIT), le
 * prédicteur de hauteur (rmvpe), et les poids pré-entraînés qui servent de
 * point de départ. Sans ces derniers, l'entraînement partirait de zéro et
 * demanderait des jours au lieu d'une heure — c'est eux qui font tenir la
 * promesse « un bon modèle avec dix minutes de voix ».
 *
 * `--no-exe` : Applio propose de télécharger ffmpeg et ffprobe. La chaîne en a
 * déjà, vérifiés par `npm run verifie`, et en poser une seconde paire dans un
 * coin du cache ne ferait qu'ajouter une version à désynchroniser.
 *
 * Idempotent : les fichiers déjà là ne sont pas retéléchargés.
 */
export async function prerequisitesApplio({ silencieux = false } = {}) {
  poseLaConfigApplio()
  if (!silencieux) journal.detail(`Modèles de base (embedder, rmvpe, pré-entraînés)…`)
  const r = await lanceEnDirect(
    pythonApplio(),
    [coreApplio(), 'prerequisites', '--pretraineds-hifigan', '--models', '--no-exe'],
    { cwd: DOSSIER_APPLIO }
  )
  if (r.code !== 0) {
    throw new Error(
      `Le téléchargement des modèles de base a échoué (code ${r.code}).\n` +
        `${r.fin.trim().split('\n').slice(-10).join('\n')}`
    )
  }
}

/**
 * Les dépendances d'Applio, ajustées à la version de Python du poste.
 *
 * APPLIO ÉPINGLE POUR PYTHON 3.12, ET LE POSTE PEUT ÊTRE EN 3.11.
 *
 * `scipy==1.18.0` n'existe pas pour 3.11 — sa roue exige 3.12. Épingler la
 * version d'en face à la main vieillirait mal : on laisse pip nommer le paquet
 * fautif, on retire SON épingle à lui, et on recommence. Les autres restent
 * fixées, donc on ne dérive que là où la version de Python l'impose.
 *
 * torch et torchaudio sont retirés du fichier : ils viennent d'être posés
 * depuis l'index CUDA, et les laisser ferait repasser pip par PyPI — donc sur
 * la variante processeur, en silence.
 */
async function installeLesDependances({ silencieux = false } = {}) {
  const source = path.join(DOSSIER_APPLIO, 'requirements.txt')
  const ajuste = path.join(DOSSIER_APPLIO, 'requirements-local.txt')
  const lignes = fs
    .readFileSync(source, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^(torch|torchaudio)==/i.test(l.trim()))

  const assouplis = []
  for (let essai = 0; essai < 12; essai++) {
    fs.writeFileSync(ajuste, lignes.join('\n'), 'utf8')
    const r = await lance(pythonApplio(), ['-m', 'pip', 'install', '-r', ajuste])
    if (r.code === 0) {
      if (assouplis.length && !silencieux) {
        journal.detail(`Épingles assouplies pour ce Python : ${assouplis.join(', ')}`)
      }
      return
    }
    const m = (r.stdout + r.stderr).match(
      /No matching distribution found for ([A-Za-z0-9_.-]+)/g
    )
    const fautif = m?.at(-1)?.split(' ').at(-1)?.replace(/[=<>!].*/, '')
    if (!fautif) {
      throw new Error(
        `Les dépendances d'Applio n'ont pas pu s'installer :\n` +
          `${(r.stderr || r.stdout).trim().split('\n').slice(-8).join('\n')}`
      )
    }
    const i = lignes.findIndex((l) => new RegExp(`^${fautif}==`, 'i').test(l.trim()))
    if (i < 0) throw new Error(`pip bute sur « ${fautif} », absent du fichier de dépendances.`)
    lignes[i] = fautif
    assouplis.push(fautif)
  }
  throw new Error(`Trop d'épingles à assouplir dans les dépendances d'Applio : ${assouplis.join(', ')}`)
}

/**
 * Lance un programme en laissant sa sortie défiler.
 *
 * `lance()` de ffmpeg.mjs accumule tout en mémoire et ne rend la main qu'à la
 * fin : c'est ce qu'on veut pour une sonde d'une demi-seconde, et exactement ce
 * qu'il ne faut pas pour un entraînement de quarante-cinq minutes. Ici la
 * sortie passe au fur et à mesure, et on n'en garde que la fin — de quoi
 * expliquer un échec sans retenir cent mille lignes.
 */
export function lanceEnDirect(binaire, args, { cwd = undefined, prefixe = '  ' , surTexte = null } = {}) {
  return new Promise((resoud, rejette) => {
    const p = spawn(binaire, args, { cwd, windowsHide: true })
    const fin = []
    const garde = (t) => {
      fin.push(t)
      if (fin.length > 40) fin.shift()
    }
    const relaie = (flux) => (d) => {
      const t = d.toString()
      garde(t)
      process.stdout.write(t.replace(/^/gm, prefixe))
      // L'appelant peut vouloir LIRE ce qui passe, pas seulement le montrer.
      // Applio annonce son époque et sa vitesse à chaque passage : c'est de là
      // que vient le temps restant, et ça ne s'invente pas depuis l'extérieur.
      if (surTexte) { try { surTexte(t) } catch { /* un lecteur ne casse pas un entraînement */ } }
      void flux
    }
    p.stdout.on('data', relaie('out'))
    p.stderr.on('data', relaie('err'))
    p.on('error', (e) => rejette(new Error(`${path.basename(binaire)} : ${e.message}`)))
    p.on('close', (code) => resoud({ code, fin: fin.join('') }))
  })
}

/** Idem, mais échoue si le code de retour n'est pas 0. */
export async function applio(args, { etape = 'Applio', surTexte = null } = {}) {
  if (!applioPose()) {
    throw new Error(
      `Applio n'est pas installé. Pose-le d'abord :\n  npm run entraine -- --installe`
    )
  }
  const r = await lanceEnDirect(pythonApplio(), [coreApplio(), ...args], { cwd: DOSSIER_APPLIO, surTexte })
  if (r.code !== 0) {
    throw new Error(
      `${etape} a échoué (code ${r.code}).\n${r.fin.trim().split('\n').slice(-12).join('\n')}`
    )
  }
  return r
}

/** La carte NVIDIA est-elle vue par le torch d'Applio ? Constaté, pas supposé. */
export async function cudaDisponible() {
  if (!applioPose()) return null
  const { code, stdout } = await lance(pythonApplio(), [
    '-c',
    'import torch,json;print(json.dumps({"cuda":torch.cuda.is_available(),' +
      '"carte":torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,' +
      '"torch":torch.__version__}))',
  ])
  if (code !== 0) return null
  try {
    return JSON.parse(stdout.trim().split('\n').at(-1))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  La conversion : employer un modèle entraîné
// ---------------------------------------------------------------------------

/** Les modèles entraînés de la chaîne, lus sur le disque. */
export function modelesEntraines() {
  const dossier = path.join(CHEMINS.marque, 'voix')
  if (!fs.existsSync(dossier)) return []
  return fs
    .readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const m = litJson(path.join(dossier, e.name, 'modele', 'modele.json'), null)
      if (!m) return null
      const base = path.join(dossier, e.name)
      const pth = path.join(base, 'modele', `${m.id}.pth`)
      const index = m.index ? path.join(base, 'modele', `${m.id}.index`) : null
      // Le manifeste peut survivre à la suppression des poids : `.gitignore`
      // écarte les `.pth`, donc un dossier synchronisé depuis un dépôt arrive
      // avec la fiche du modèle et sans le modèle. Mieux vaut ne pas le lister
      // que de le proposer et d'échouer au moment de convertir.
      if (!fs.existsSync(pth)) return null
      return { ...m, pth, index: index && fs.existsSync(index) ? index : null }
    })
    .filter(Boolean)
    .sort((a, b) => (b.entraineLe ?? '').localeCompare(a.entraineLe ?? ''))
}

/**
 * Quel modèle pour cette vidéo ? La même cascade que pour la voix ElevenLabs.
 *
 * Quatre niveaux, du plus précis au plus général — voir le §8 de CLAUDE.md.
 * Le dernier n'existe pas pour ElevenLabs et se justifie ici : les voix du
 * catalogue se comptent par milliers, les modèles entraînés sur ce disque se
 * comptent sur les doigts. Quand il n'y en a qu'un, le désigner n'apprend rien
 * à personne.
 */
export function modelePour(slug, forcee = null) {
  const tout = modelesEntraines()
  const parId = (id) => tout.find((m) => m.id === id) ?? null

  if (forcee && forcee !== true) {
    const m = parId(String(forcee))
    if (!m) {
      throw new Error(
        `Aucun modèle « ${forcee} ».\n` +
          `  Entraînés : ${tout.map((x) => x.id).join(', ') || '(aucun)'}\n` +
          `  npm run entraine -- --liste`
      )
    }
    return { ...m, origine: 'ligne de commande' }
  }

  if (slug) {
    const choix = litJson(path.join(dossierVideo(slug).audio, 'voix-choisie.json'), null)
    const m = choix?.modele ? parId(choix.modele) : null
    if (m) return { ...m, origine: 'choix de la vidéo' }
  }

  const chaine = litChaine()
  const parChaine = chaine?.voix?.modele_local
  if (parChaine) {
    const m = parId(parChaine)
    if (m) return { ...m, origine: 'défaut de la chaîne' }
  }

  if (tout.length === 1) return { ...tout[0], origine: 'seul modèle entraîné' }

  if (!tout.length) {
    throw new Error(
      `Aucun modèle entraîné.\n` +
        `  Récolte puis entraîne :\n` +
        `    npm run empreinte -- --depuis=liens.txt --nom="Untel"\n` +
        `    npm run entraine -- untel`
    )
  }
  throw new Error(
    `Plusieurs modèles entraînés : ${tout.map((m) => m.id).join(', ')}.\n` +
      `  Précise lequel avec --modele=<id>.`
  )
}

/**
 * Convertit une prise avec un modèle entraîné. Local, gratuit, hors ligne.
 *
 * CE QUI N'EST PAS PASSÉ À APPLIO, ET C'EST LE CŒUR DE L'AFFAIRE.
 *
 * Sa commande d'inférence propose une réverbération, un limiteur, un
 * transpositeur, un autotune et un débruiteur (`--clean-audio`). Ce sont des
 * drapeaux : ne pas les écrire est la seule façon de les laisser éteints, et
 * c'est ce que le §9 impose. Aucun de ces effets n'apparaît ci-dessous, et leur
 * absence est le geste — pas un oubli à réparer un jour.
 *
 * `--split-audio` non plus. Il découpe la prise aux silences pour économiser la
 * mémoire, puis recolle. Le recollage est la seule étape de toute la chaîne qui
 * pourrait déplacer un échantillon — et les sous-titres sont calés mot à mot
 * sur ce fichier. On convertit d'un seul tenant, et on vérifie la durée après.
 */
export async function convertitAvecModele(entree, sortie, modele, options = {}) {
  // ON ATTEND L'OBJET MODÈLE, PAS SON IDENTIFIANT.
  //
  // Passer la chaîne « myriam » donnait un `--pth-path` vide à Applio, qui
  // chargeait un modèle nul et échouait trente lignes plus bas sur
  // `'NoneType' object has no attribute 'pipeline'`. Le message ne désignait
  // rien de ce qui était réellement faux.
  if (typeof modele === 'string' || !modele?.pth) {
    throw new Error(
      `convertitAvecModele attend l'objet modèle, pas « ${modele?.id ?? modele} ».
` +
        `  modelesEntraines().find((m) => m.id === …) ou modelePour(slug, id)`
    )
  }
  const {
    transpose = 0,
    index = 0.3,
    protege = 0.33,
    enveloppe = 1,
    f0 = 'rmvpe',
  } = options

  if (!applioPose()) {
    throw new Error(
      `L'outillage de conversion locale n'est pas posé.\n  npm run entraine -- --installe`
    )
  }
  assureDossier(path.dirname(sortie))

  const scene = new SceneAscii()
  const args = [
    'infer',
    '--input-path', scene.entrant(entree),
    '--output-path', scene.sortant(sortie),
    '--pth-path', scene.entrant(modele.pth),
    // Applio exige le drapeau même sans index. Une chaîne vide le neutralise.
    '--index-path', modele.index ? scene.entrant(modele.index) : '',
    '--pitch', String(Math.max(-24, Math.min(24, Math.round(transpose)))),
    '--index-rate', String(Math.max(0, Math.min(1, index))),
    '--protect', String(Math.max(0, Math.min(0.5, protege))),
    '--volume-envelope', String(Math.max(0, Math.min(1, enveloppe))),
    '--f0-method', f0,
    // L'EMBEDDER DOIT ÊTRE CELUI DE L'ENTRAÎNEMENT, SANS DISCUSSION.
    // Il encode ce qui est dit ; en changer entre l'entraînement et la
    // conversion revient à parler une autre langue au modèle. On le lit dans
    // le manifeste plutôt que de le supposer.
    '--embedder-model', modele.embedder || 'contentvec',
    '--export-format', 'WAV',
    '--sid', '0',
  ]

  try {
    const r = await lanceEnDirect(pythonApplio(), [coreApplio(), ...args], { cwd: DOSSIER_APPLIO })
    if (r.code !== 0) {
      throw new Error(
        `La conversion a échoué (code ${r.code}).\n${r.fin.trim().split('\n').slice(-12).join('\n')}`
      )
    }
    scene.rapatrie()
  } finally {
    scene.range()
  }

  if (!fs.existsSync(sortie)) {
    throw new Error(`La conversion s'est terminée sans écrire ${sortie}.`)
  }
  return sortie
}

/**
 * Une scène de travail sans accent, pour les outils qui n'en lisent pas.
 *
 * CE DOSSIER S'APPELLE « Usine à vidéo », ET ÇA SUFFIT À CASSER L'INDEX.
 *
 * faiss lit son index par l'API ANSI de Windows. Sur un chemin qui contient un
 * accent, l'ouverture échoue — et Applio, fidèle à lui-même, avale l'erreur :
 *
 *     An error occurred reading the FAISS index: … could not open
 *     C:\…\Usine � vid�o\marque\voix\…\modele\….index
 *
 * La conversion se termine alors « avec succès », sans index. On perd
 * exactement ce que l'index apporte — la fidélité de prononciation — sur une
 * ligne noyée au milieu du journal. torch, lui, ouvre le `.pth` sans broncher :
 * c'est le genre de panne qui ne se voit qu'à l'oreille, six vidéos plus tard.
 *
 * On ne renomme pas le dossier de la chaîne pour autant : il porte le nom que
 * son propriétaire lui a donné, et le §4 veut qu'il soit déplaçable. On fait
 * passer les fichiers par le cache partagé, dont le chemin est sans accent, et
 * on rapatrie la sortie après. Un lien matériel évite de recopier soixante
 * mégaoctets de modèle à chaque conversion ; la copie prend le relais si le
 * lien échoue, par exemple entre deux volumes.
 */
const sansAccent = (p) => !/[^\x20-\x7E]/.test(p)

class SceneAscii {
  constructor() {
    this.dossier = null
    this.aRapatrier = null
    this.jetables = []
  }

  _dossier() {
    if (!this.dossier) {
      this.dossier = path.join(CHEMINS.cachePartage, 'conversion-travail', String(process.pid))
      assureDossier(this.dossier)
    }
    return this.dossier
  }

  /** Un fichier à LIRE, ramené sous un chemin sans accent si besoin. */
  entrant(chemin) {
    if (sansAccent(chemin)) return chemin
    const doublure = path.join(this._dossier(), path.basename(chemin).replace(/[^\x20-\x7E]/g, '_'))
    try {
      fs.linkSync(chemin, doublure)
    } catch {
      fs.copyFileSync(chemin, doublure)
    }
    this.jetables.push(doublure)
    return doublure
  }

  /** Un fichier à ÉCRIRE : on le fait produire ailleurs, puis on le rapatrie. */
  sortant(chemin) {
    if (sansAccent(chemin)) return chemin
    const doublure = path.join(this._dossier(), 'sortie.wav')
    this.aRapatrier = [doublure, chemin]
    this.jetables.push(doublure)
    return doublure
  }

  rapatrie() {
    if (!this.aRapatrier) return
    const [source, cible] = this.aRapatrier
    if (!fs.existsSync(source)) return
    fs.copyFileSync(source, cible)
  }

  range() {
    for (const f of this.jetables) fs.rmSync(f, { force: true })
    if (this.dossier) fs.rmSync(this.dossier, { recursive: true, force: true })
  }
}

/**
 * Mesure, fenêtre par fenêtre, le niveau de la voix et celui du reste.
 *
 * Toute l'analyse du signal vit dans `outils/python/analyse-voix.py` : numpy
 * fait en une ligne ce qui demanderait ici une boucle sur des millions
 * d'échantillons, et le script se relit seul.
 */
export async function mesure(voix, accompagnement) {
  const script = path.join(CHEMINS.outils, 'python', 'analyse-voix.py')
  if (!fs.existsSync(script)) throw new Error(`Script d'analyse introuvable : ${script}`)

  const { stdout } = await lanceOuEchoue(pythonDuVenv(), [script, voix, accompagnement])
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`L'analyse n'a pas rendu de JSON lisible.\n${stdout.slice(0, 400)}`)
  }
}

/**
 * Cherche un sifflement fixe dans des extraits déjà découpés.
 *
 * ON MESURE LE CORPUS, PAS LE TÉLÉCHARGEMENT.
 *
 * Les extraits SONT ce que le moteur verra : une raie qui ne vivrait que dans
 * les passages écartés n'apprendrait rien à personne. C'est aussi ce qui rend
 * la mesure rejouable sur une empreinte déjà récoltée, dont le fichier source a
 * disparu depuis longtemps.
 *
 * Une empreinte peut porter des centaines d'extraits, et une ligne de commande
 * Windows plafonne à 32 000 caractères : on envoie par paquets et on refait la
 * médiane ici.
 */
export async function raieTonale(fichiers) {
  const script = path.join(CHEMINS.outils, 'python', 'raie-tonale.py')
  if (!fs.existsSync(script)) throw new Error(`Script d'analyse introuvable : ${script}`)
  if (!fichiers.length) return { raie: null, parExtrait: [] }

  const PAR_PAQUET = 60
  const parExtrait = []
  for (let i = 0; i < fichiers.length; i += PAR_PAQUET) {
    const { stdout } = await lanceOuEchoue(pythonDuVenv(), [
      script,
      ...fichiers.slice(i, i + PAR_PAQUET),
    ])
    let bloc
    try {
      bloc = JSON.parse(stdout)
    } catch {
      throw new Error(`L'analyse de raie n'a pas rendu de JSON lisible.\n${stdout.slice(0, 400)}`)
    }
    parExtrait.push(...(bloc.parExtrait ?? []))
  }

  const mesurables = parExtrait.filter((m) => typeof m.ecartDb === 'number')
  if (!mesurables.length) return { raie: null, parExtrait }

  const medianeDe = (cle) => {
    const t = mesurables.map((m) => m[cle]).sort((a, b) => a - b)
    return t[Math.floor(t.length / 2)]
  }
  return {
    raie: {
      hz: Math.round(medianeDe('hz')),
      ecartDb: +medianeDe('ecartDb').toFixed(1),
      extraits: mesurables.length,
    },
    parExtrait,
  }
}
