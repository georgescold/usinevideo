/**
 * tiktok.mjs — ce qui se cache derrière un lien TikTok.
 *
 * On essaie d'abord `yt-dlp`, en local et gratuitement : il couvre les cinq
 * statistiques qui comptent, **sauvegardes comprises**, ce qu'aucun acteur
 * payant ne fait mieux. Apify ne sert que de repli quand TikTok bloque.
 *
 * Le transcript ne vient jamais de la plateforme : on télécharge l'audio et on
 * transcrit en local. Les sous-titres TikTok sont souvent absents, tronqués, ou
 * réécrits par l'auteur — ils ne disent pas ce qui a été dit.
 */

import fs from 'node:fs'
import path from 'node:path'
import { lance } from './ffmpeg.mjs'
import { CHEMINS, CACHE_PARTAGE, assureDossier, env } from './chemins.mjs'
import { journal } from './journal.mjs'

/**
 * Emplacements où chercher yt-dlp, du plus probable au moins probable.
 *
 * LE PLUS RÉCENT D'ABORD, ET CE N'EST PAS UN DÉTAIL DE CONFORT.
 *
 * yt-dlp se périme vite : YouTube change sa signature d'URL toutes les quelques
 * semaines, et une version de trois mois se fait renvoyer un
 * « HTTP Error 403: Forbidden » sur le téléchargement — après avoir listé les
 * formats sans broncher, ce qui rend le diagnostic trompeur. C'est arrivé le
 * 1er septembre 2026 avec la version du 9 juin, trouvée dans le PATH ; celle du
 * 19 août téléchargeait la même vidéo sans rien changer d'autre.
 *
 * Le cache partagé vient donc EN PREMIER, parce que c'est le seul yt-dlp que
 * cette stack sait mettre à jour. Ceux du PATH appartiennent à d'autres
 * applications : on s'en sert s'il n'y a rien de mieux, on ne les touche jamais.
 */
const CANDIDATS_YTDLP = [
  env('YTDLP_PATH', null),
  path.join(CACHE_PARTAGE, 'venv-ytdlp', 'Scripts', 'yt-dlp.exe'),
  path.join(CACHE_PARTAGE, 'venv-ytdlp', 'bin', 'yt-dlp'),
  // UN REPLI DANS LE DOSSIER DE LA CHAÎNE, QUAND LE CACHE N'EST PAS ACCESSIBLE.
  //
  // Le cache partagé reste le bon endroit — un seul yt-dlp pour toutes les
  // chaînes, hors du dossier qu'on copie. Mais il n'est pas toujours
  // atteignable : un poste où `AppData` est virtualisé (application empaquetée,
  // profil géré, dossier redirigé) écrit ailleurs que là où le pipeline lit,
  // et l'installation semble réussir sans que rien ne change.
  //
  // Ce chemin-ci est dans le dossier de la chaîne, donc toujours accessible à
  // qui peut lancer le pipeline. Il passe APRÈS le cache : dès que
  // `--installe-ytdlp` a fait son travail au bon endroit, c'est celui-là qui
  // sert, et ce repli redevient ce qu'il doit être — un filet.
  path.join(CHEMINS.racine, '.outils-ytdlp', 'Scripts', 'yt-dlp.exe'),
  path.join(CHEMINS.racine, '.outils-ytdlp', 'bin', 'yt-dlp'),
  'yt-dlp',
  path.join(
    process.env.LOCALAPPDATA || '',
    'com.debpalash.omnivoice-studio',
    'project',
    '.venv',
    'Scripts',
    'yt-dlp.exe'
  ),
].filter(Boolean)

let cheminYtdlp = null

export async function trouveYtdlp() {
  if (cheminYtdlp) return cheminYtdlp
  for (const candidat of CANDIDATS_YTDLP) {
    // UN CANDIDAT ABSENT EST UN NON, PAS UNE PANNE.
    //
    // `lance` REJETTE quand le binaire n'existe pas — c'est juste pour ffmpeg,
    // dont l'absence est une vraie panne. Ici c'est l'inverse : cette boucle est
    // une liste d'endroits où REGARDER, et le premier qui manque doit laisser
    // sa place au suivant. Sans ce `catch`, le premier chemin inexistant faisait
    // échouer toute la recherche — et l'utilisateur recevait « yt-dlp
    // introuvable » en désignant un chemin précis, alors qu'un yt-dlp
    // parfaitement fonctionnel attendait deux lignes plus bas dans le PATH.
    //
    // Le défaut ne s'est vu qu'en mettant un nouveau chemin en tête de liste :
    // tant que le premier candidat existait, la boucle ne s'exerçait jamais.
    try {
      const { code } = await lance(candidat, ['--version'])
      if (code === 0) {
        cheminYtdlp = candidat
        return candidat
      }
    } catch {
      // absent, ou pas exécutable : on essaie le suivant.
    }
  }
  return null
}

/** Le venv que CETTE stack maintient, seul yt-dlp qu'elle sait mettre à jour. */
const VENV_YTDLP = path.join(CACHE_PARTAGE, 'venv-ytdlp')

/** La version de yt-dlp employée, ou `null` s'il n'y en a aucun. */
export async function versionYtdlp() {
  const bin = await trouveYtdlp()
  if (!bin) return null
  try {
    const { code, stdout } = await lance(bin, ['--version'])
    return code === 0 ? stdout.trim() : null
  } catch {
    return null
  }
}

/**
 * yt-dlp est-il assez récent pour YouTube ?
 *
 * YOUTUBE REFUSE LES VIEUX yt-dlp, ET IL LE FAIT DE LA PIRE FAÇON.
 *
 * Il change la signature de ses URL toutes les quelques semaines. Une version
 * dépassée liste les formats sans broncher, puis se fait renvoyer un
 * « HTTP Error 403: Forbidden » au moment de télécharger — un message qui
 * ressemble à une restriction de droits ou à un blocage régional, et qui envoie
 * chercher des cookies, un VPN, une autre vidéo. Le 1er septembre 2026, ça a
 * coûté une demi-journée : la version du 9 juin échouait, celle du 19 août
 * téléchargeait la même vidéo sans rien changer d'autre.
 *
 * Deux mois est large : yt-dlp publie toutes les deux à trois semaines, et on
 * ne veut pas crier au loup sur une version encore bonne.
 */
export function ytdlpEstVieux(version, moisMax = 2) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(String(version ?? ''))
  if (!m) return false
  const sortie = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const jours = (Date.now() - sortie.getTime()) / 86_400_000
  return jours > moisMax * 30
}

/**
 * Pose ou met à jour yt-dlp dans le cache partagé.
 *
 * POURQUOI UN VENV À NOUS PLUTÔT QUE CELUI DU POSTE.
 *
 * Le yt-dlp trouvé dans le PATH appartient souvent à une autre application —
 * ici, à un studio de voix installé à côté. Le mettre à jour, c'est toucher aux
 * dépendances de quelqu'un d'autre pour régler notre problème. On installe donc
 * le nôtre, dans le cache partagé entre chaînes, et `CANDIDATS_YTDLP` le prend
 * en premier. Celui du poste reste le filet de sécurité, intact.
 */
export async function installeYtdlp({ silencieux = false } = {}) {
  const pythons = [env('PYTHON_PATH', null), 'py', 'python3', 'python'].filter(Boolean)
  let python = null
  for (const candidat of pythons) {
    try {
      const args = candidat === 'py' ? ['-3', '--version'] : ['--version']
      const { code } = await lance(candidat, args)
      if (code === 0) { python = candidat; break }
    } catch { /* absent : au suivant */ }
  }
  if (!python) {
    throw new Error(
      `Python est introuvable. Installe Python 3.10 ou plus récent, ` +
        `ou renseigne PYTHON_PATH dans .env.`
    )
  }
  const prefixe = python === 'py' ? ['-3'] : []

  if (!silencieux) {
    journal.info(`Installation de yt-dlp dans le cache partagé (quelques mégaoctets).`)
    journal.detail(VENV_YTDLP)
  }

  assureDossier(path.dirname(VENV_YTDLP))
  const venv = await lance(python, [...prefixe, '-m', 'venv', VENV_YTDLP])
  if (venv.code !== 0) {
    throw new Error(`La création de l'environnement a échoué :\n${venv.stderr.trim().slice(0, 400)}`)
  }

  const pythonDuVenv = path.join(
    VENV_YTDLP,
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python'
  )
  const pip = await lance(pythonDuVenv, ['-m', 'pip', 'install', '--upgrade', '--quiet', 'yt-dlp'])
  if (pip.code !== 0) {
    throw new Error(`L'installation de yt-dlp a échoué :\n${pip.stderr.trim().slice(0, 400)}`)
  }

  // Le chemin mémorisé pointe peut-être sur l'ancien : on oblige la relecture.
  cheminYtdlp = null
  const version = await versionYtdlp()
  if (!silencieux) journal.ok(`yt-dlp ${version ?? '?'} — prêt.`)
  return { dossier: VENV_YTDLP, version }
}

/**
 * Les cookies, pour les plateformes qui ne servent plus rien sans session.
 *
 * INSTAGRAM NE RÉPOND PLUS À UN VISITEUR ANONYME, ET ÇA NE SE CONTOURNE PAS.
 *
 *   ERROR: [Instagram] …: Requested content is not available, rate-limit
 *   reached or login required. Use --cookies-from-browser or --cookies
 *
 * C'est le mécanisme documenté de yt-dlp, et le seul. Facebook et X sont dans
 * le même cas ; YouTube y bascule par intermittence sur les vidéos avec
 * restriction d'âge.
 *
 * IL N'Y A PAS DE DÉFAUT, ET C'EST DÉLIBÉRÉ. Lire les cookies d'un navigateur,
 * c'est lire une session ouverte — celle d'un compte réel. Le faire d'office
 * parce qu'un téléchargement a échoué serait prendre cette décision à la place
 * de son propriétaire. On le demande donc explicitement, à chaque fois ou une
 * fois pour toutes dans `.env`, et on le dit dans le message d'erreur plutôt
 * que de le faire dans son dos.
 *
 * Les cookies ne traversent jamais ce processus : yt-dlp les lit lui-même et
 * les envoie à la plateforme. Rien n'en est journalisé — le nom du navigateur
 * n'est pas un secret, son contenu ne passe pas par ici.
 *
 * SOUS WINDOWS, `--cookies-from-browser` NE MARCHE PLUS SUR CHROME NI EDGE.
 *
 * Depuis Chrome 127, la clé qui déchiffre les cookies est liée au processus du
 * navigateur lui-même — c'est l'« App-Bound Encryption », posée exprès contre
 * les voleurs de session. Aucun programme extérieur ne peut plus les lire, et
 * yt-dlp échoue sur « failed to decrypt with DPAPI ». Edge partage le moteur,
 * donc le même verrou. Firefox, lui, reste lisible.
 *
 * La voie fiable sur ce poste est donc le FICHIER : on exporte ses cookies
 * depuis le navigateur, et on donne le fichier. C'est ce que dit le message
 * d'erreur, plutôt que de proposer une commande qui ne peut pas fonctionner.
 */
const NAVIGATEURS = new Set([
  'brave', 'chrome', 'chromium', 'edge', 'firefox', 'opera', 'safari', 'vivaldi', 'whale',
])

/**
 * L'EN-TÊTE D'UN NAVIGATEUR, PARCE QUE TIKTOK NE SERT PLUS PERSONNE D'AUTRE.
 *
 * Relevé le 4 septembre 2026 : toute vidéo TikTok — y compris une déjà rapatriée
 * par ce dossier en janvier — échouait sur « Unexpected response from webpage
 * request ». Ni la version (le stable 2026.08.19 et le nightly 2026.08.30
 * échouent pareil), ni l'accès n'étaient en cause.
 *
 * La mesure est nette. La même page demandée avec un en-tête de Chrome rend
 * 403 ko et son bloc `__UNIVERSAL_DATA_FOR_REHYDRATION__` complet —
 * `statusCode: 0`, l'auteur, la durée. Demandée avec l'en-tête par défaut de
 * yt-dlp, elle rend une page que l'extracteur ne reconnaît pas. TikTok ne
 * bloque pas : il sert autre chose.
 *
 * C'est donc un en-tête, pas une session. La différence compte, parce que les
 * deux gestes n'ont rien à voir : un en-tête ne porte l'identité de personne,
 * là où un fichier de cookies porte une session vivante et appartient à son
 * propriétaire (voir §8 du CLAUDE.md). Celui-ci est posé par défaut ; les
 * cookies, jamais.
 *
 * `YTDLP_UA=` dans `.env` le remplace, le jour où c'est cette chaîne-là qui
 * sera reconnue et écartée.
 */
export const UA_NAVIGATEUR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Les arguments d'en-tête, à poser sur CHAQUE appel de yt-dlp. */
export const argumentsDEnTete = () => ['--user-agent', env('YTDLP_UA', UA_NAVIGATEUR)]

export function argumentsDeCookies({ navigateur = null, fichier = null } = {}) {
  const nav = navigateur ?? env('YTDLP_COOKIES_NAVIGATEUR', null)
  const fic = fichier ?? env('YTDLP_COOKIES_FICHIER', null)

  if (fic) {
    if (!fs.existsSync(fic)) throw new Error(`Fichier de cookies introuvable : ${fic}`)
    return ['--cookies', fic]
  }
  if (!nav) return []

  // `chrome`, ou `chrome:Profile 2` pour un second profil. La forme part en
  // argument d'un programme : on la borne au lieu de la recopier telle quelle.
  const [base, ...reste] = String(nav).split(':')
  if (!NAVIGATEURS.has(base.toLowerCase())) {
    throw new Error(
      `Navigateur « ${base} » inconnu de yt-dlp.\n` +
        `  Attendu : ${[...NAVIGATEURS].join(', ')}`
    )
  }
  const profil = reste.join(':')
  if (profil && !/^[\w .:+-]{1,80}$/.test(profil)) {
    throw new Error(`Profil de navigateur refusé : « ${profil} ».`)
  }
  return ['--cookies-from-browser', profil ? `${base.toLowerCase()}:${profil}` : base.toLowerCase()]
}

/** Le refus vient-il d'un manque de session, plutôt que d'une vraie panne ? */
export const demandeUneSession = (texte) =>
  /login required|rate-limit reached|requested content is not available|sign in to confirm|private (video|account)|only available for registered/i.test(
    String(texte ?? '')
  )

const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function normalise(brut) {
  return {
    id: brut.id ?? null,
    url: brut.webpage_url ?? null,
    texte: brut.description ?? brut.title ?? null,
    vues: nombre(brut.view_count),
    likes: nombre(brut.like_count),
    commentaires: nombre(brut.comment_count),
    partages: nombre(brut.repost_count),
    sauvegardes: nombre(brut.save_count),
    dureeS: nombre(brut.duration),
    auteur: brut.uploader ?? brut.channel ?? null,
    auteurUrl: brut.uploader_url ?? brut.channel_url ?? null,
    auteurAbonnes: nombre(brut.channel_follower_count),
    date: brut.upload_date
      ? `${brut.upload_date.slice(0, 4)}-${brut.upload_date.slice(4, 6)}-${brut.upload_date.slice(6, 8)}`
      : null,
    son: brut.track ?? null,
    sonAuteur: Array.isArray(brut.artists) ? brut.artists.join(', ') : (brut.artist ?? null),
    hashtags: [...String(brut.description ?? '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]),
    couverture: brut.thumbnail ?? null,
    source: 'yt-dlp',
  }
}

/**
 * Métadonnées d'un post, sans rien télécharger.
 *
 * @returns null si yt-dlp échoue — l'appelant bascule alors sur Apify.
 */
export async function metadonnees(url, cookies = {}, { silencieux = false } = {}) {
  const bin = await trouveYtdlp()
  if (!bin) return null

  const { code, stdout, stderr } = await lance(bin, [
    '-J', '--no-warnings', '--no-playlist',
    ...argumentsDEnTete(), ...argumentsDeCookies(cookies), url,
  ])
  if (code !== 0) {
    // `silencieux` sert à l'appelant qui va de toute façon tenter le
    // téléchargement juste après : sur un lot de quarante liens protégés, cette
    // ligne doublait chaque échec et l'on croyait à deux pannes distinctes.
    // C'est le téléchargement qui porte le message utile.
    if (!silencieux) {
      journal.detail(`yt-dlp a échoué sur ${url} : ${stderr.trim().split('\n').slice(-1)[0]}`)
    }
    return null
  }
  try {
    return normalise(JSON.parse(stdout))
  } catch {
    return null
  }
}

/** Télécharge l'audio d'un post, pour le transcrire ensuite. */
export async function telechargeAudio(url, destinationSansExtension, cookies = {}) {
  const bin = await trouveYtdlp()
  if (!bin) throw new Error(`yt-dlp est introuvable. Renseigne YTDLP_PATH dans .env.`)

  assureDossier(path.dirname(destinationSansExtension))
  const { code, stderr } = await lance(bin, [
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'wav',
    '--audio-quality', '0',
    '--no-warnings',
    '--no-playlist',
    ...argumentsDEnTete(),
    ...argumentsDeCookies(cookies),
    '-o', `${destinationSansExtension}.%(ext)s`,
    url,
  ])
  const attendu = `${destinationSansExtension}.wav`
  if (code !== 0 || !fs.existsSync(attendu)) {
    // ON NOMME LA CAUSE QUAND ON LA CONNAÎT.
    //
    // « Téléchargement impossible » suivi de trois lignes d'anglais laissait
    // chercher une panne de réseau là où il ne manquait qu'une session. Sur un
    // lot de quarante liens, l'explication utile est celle qui dit quoi taper.
    const aBesoinDeSession = demandeUneSession(stderr)
    const dejaFournis = argumentsDeCookies(cookies).length > 0
    throw new Error(
      `Téléchargement de l'audio impossible.\n` +
        (aBesoinDeSession
          ? dejaFournis
            ? `  La plateforme refuse malgré les cookies fournis : la session est\n` +
              `  peut-être expirée, ou le compte n'a pas accès à ce contenu.\n`
            : `  Cette plateforme ne sert plus rien sans session ouverte.\n` +
              `  Exporte tes cookies dans un fichier, puis :\n` +
              `    npm run empreinte -- <url> --cookies-fichier=cookies.txt\n` +
              `  Sous Windows, Chrome et Edge chiffrent leurs cookies depuis la\n` +
              `  version 127 : --cookies=chrome ne peut plus les lire. Le fichier,\n` +
              `  si — une extension « Get cookies.txt » l'exporte au bon format.\n` +
              `  Firefox reste lisible directement : --cookies=firefox.\n`
          : '') +
        stderr.trim().split('\n').slice(-3).join('\n')
    )
  }
  return attendu
}

/**
 * Télécharge la VIDÉO, pas seulement son audio.
 *
 * POURQUOI ON LA RAPATRIE AU LIEU DE L'AFFICHER EN LIGNE.
 *
 * Un lecteur embarqué de TikTok ou de YouTube demanderait d'ouvrir la politique
 * de sécurité de l'atelier aux domaines de ces plateformes — donc d'y laisser
 * entrer leurs scripts et leurs traceurs, dans une page qui affiche par
 * ailleurs le contenu de la chaîne. Le fichier local évite ça, se relit hors
 * connexion, et ne disparaît pas le jour où l'auteur retire sa vidéo. C'est ce
 * dernier point qui tranche : une inspiration qu'on ne peut plus revoir n'est
 * plus une inspiration.
 *
 * `hauteurMax` borne le poids. Une vidéo de référence se juge sur son montage
 * et ses accroches, pas sur sa définition : 720 pixels suffisent, et au-delà de
 * dix minutes on descend d'un cran parce que le fichier, lui, ne se borne pas.
 */
export async function telechargeVideo(url, destinationSansExtension, { hauteurMax = 720 } = {}) {
  const bin = await trouveYtdlp()
  if (!bin) throw new Error(`yt-dlp est introuvable. Renseigne YTDLP_PATH dans .env.`)

  assureDossier(path.dirname(destinationSansExtension))
  const h = Math.max(144, Math.min(1080, Number(hauteurMax) || 720))
  const dossier = path.dirname(destinationSansExtension)
  const base = path.basename(destinationSansExtension)

  const trouveLeFichier = () => {
    const f = fs
      .readdirSync(dossier)
      .filter((x) => x.startsWith(`${base}.`) && /\.(mp4|webm|mkv|mov)$/i.test(x))
      .sort((a, b) => (a.endsWith('.mp4') ? -1 : 0) - (b.endsWith('.mp4') ? -1 : 0))
    return f.length ? path.join(dossier, f[0]) : null
  }

  // DEUX TENTATIVES, ET LA SECONDE N'EST PAS UNE PRÉCAUTION DE PRINCIPE.
  //
  // Le premier sélecteur demande les flux séparés — image et son téléchargés à
  // part, puis assemblés — ce qui donne la meilleure définition disponible.
  // YouTube y répond aujourd'hui « 403 Forbidden » : ses flux adaptatifs sont
  // protégés, et la parade change au fil des versions de yt-dlp. Mesuré le
  // 29 août 2026 : `bestvideo+bestaudio` échoue, `best` passe.
  //
  // Le second sélecteur demande un flux progressif — image et son déjà réunis
  // dans un seul fichier. YouTube le sert sans discuter, plafonné plus bas.
  //
  // On garde donc les deux dans cet ordre : la qualité quand elle est
  // accessible, l'image quand elle ne l'est pas. Figer le second seul
  // dégraderait TikTok, qui n'a jamais eu ce problème ; figer le premier laisse
  // YouTube au bord de la route.
  const tentatives = [
    `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio`,
    `best[height<=${h}][ext=mp4]/best[height<=${h}]/best`,
  ]

  let dernierStderr = ''
  for (const format of tentatives) {
    const { code, stderr } = await lance(bin, [
      // On vise le MP4 : c'est le seul conteneur que tous les navigateurs lisent
      // sans extension. Un WebM VP9 passerait sur Chrome et pas ailleurs, et
      // l'aperçu resterait noir sans rien expliquer.
      '-f', format,
      '--merge-output-format', 'mp4',
      '--no-warnings',
      '--no-playlist',
      ...argumentsDEnTete(),
      '-o', `${destinationSansExtension}.%(ext)s`,
      url,
    ])
    dernierStderr = stderr
    const fichier = trouveLeFichier()
    if (code === 0 && fichier) return fichier
    // Un essai raté peut laisser un fragment derrière lui : le suivant écrirait
    // à côté, et on servirait un fichier tronqué en croyant l'avoir rapatrié.
    //
    // Le ménage ne vise QUE les conteneurs vidéo et les fragments. La couverture
    // `<id>.jpg` porte le même préfixe et n'a rien à voir avec cet échec : la
    // balayer ferait perdre, sur un simple `--refais`, une vignette que rien ne
    // redemanderait.
    const aJeter = /\.(mp4|webm|mkv|mov|part|ytdl|f\d+)$/i
    for (const reste of fs.readdirSync(dossier)) {
      if (reste.startsWith(`${base}.`) && aJeter.test(reste)) {
        try { fs.rmSync(path.join(dossier, reste), { force: true }) } catch { /* rien à nettoyer */ }
      }
    }
  }

  throw new Error(
    `Téléchargement de la vidéo impossible.\n${dernierStderr.trim().split('\n').slice(-3).join('\n')}`
  )
}

/** Télécharge la couverture, utile pour comparer les premières images. */
export async function telechargeCouverture(url, destination) {
  const bin = await trouveYtdlp()
  if (!bin) return null
  assureDossier(path.dirname(destination))
  const base = destination.replace(/\.[^.]+$/, '')
  const { code } = await lance(bin, [
    '--write-thumbnail',
    '--skip-download',
    '--convert-thumbnails', 'jpg',
    '--no-warnings',
    '-o', `${base}.%(ext)s`,
    url,
  ])
  const attendu = `${base}.jpg`
  return code === 0 && fs.existsSync(attendu) ? attendu : null
}

/**
 * Taux d'engagement, en pourcentage des vues.
 *
 * Ce sont ces rapports qui expliquent une performance, pas les valeurs brutes.
 * Une vidéo à 40 000 vues avec 8 % de sauvegardes dit quelque chose qu'une
 * vidéo à 2 millions de vues avec 0,1 % de likes ne dit pas.
 */
export function engagement(post) {
  const v = post.vues || 0
  if (!v) return null
  const pc = (n) => (n === null ? null : Number(((n / v) * 100).toFixed(2)))
  return {
    likes: pc(post.likes),
    commentaires: pc(post.commentaires),
    partages: pc(post.partages),
    // Le plus révélateur des quatre : on sauvegarde ce qu'on compte revoir ou
    // appliquer. C'est le signal d'utilité, pas de divertissement.
    sauvegardes: pc(post.sauvegardes),
    // Sur TikTok, dépasser le nombre d'abonnés de l'auteur signe une sortie de
    // l'audience acquise : la vidéo a marché toute seule.
    ratioAbonnes: post.auteurAbonnes
      ? Number((v / Math.max(post.auteurAbonnes, 1)).toFixed(2))
      : null,
  }
}

/** Où ranger la matière d'un post. */
export function dossiers(id) {
  return {
    meta: path.join(CHEMINS.veilleTiktokRaw, `${id}.json`),
    audio: path.join(CHEMINS.veilleTiktokMedia, id),
    couverture: path.join(CHEMINS.veilleTiktokMedia, `${id}.jpg`),
    transcript: path.join(CHEMINS.veilleTiktokTranscripts, `${id}.json`),
  }
}
