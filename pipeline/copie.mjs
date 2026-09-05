#!/usr/bin/env node
/**
 * copie.mjs — refaire une vidéo qu'on admire, avec l'avatar de la chaîne.
 *
 * CE QUE ÇA FAIT, ET CE QUE ÇA NE FAIT PAS.
 *
 * On donne un lien. La vidéo est rapatriée, découpée en segments, et chaque
 * segment sert de RÉFÉRENCE DE MOUVEMENT à `hailuo-03/reference-to-video` :
 * le modèle en tire le cadrage, l'énergie, le rythme, et rejoue tout ça avec
 * les photos de l'avatar.
 *
 * Ce n'est pas une copie image par image, et c'est délibéré. Le modèle
 * s'inspire ; il ne décalque pas. On récupère « le même genre de plan avec
 * elle », pas la vidéo de quelqu'un d'autre avec un visage collé dessus.
 *
 * LE REMPLACEMENT DE VISAGE N'EST PAS PROPOSÉ ICI. Coller un visage sur le
 * corps et la performance d'une personne réelle qui n'a rien demandé est une
 * autre chose, et cette commande ne la fait pas.
 *
 * QUINZE SECONDES DE RÉFÉRENCE AU MAXIMUM — c'est la limite du modèle. Une
 * vidéo plus longue est donc découpée, et chaque tronçon devient un plan.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, dossierVideo, litJson, ecritJson, assureDossier } from './lib/chemins.mjs'
import { journal, duree, progression } from './lib/journal.mjs'
import { litArgs, drapeau, nombre, aide, principal } from './lib/args.mjs'
import {
  televerse, essaie, travailFal, vision, resumeFal,
  AUCUN_TEXTE_A_L_ECRAN, IGNORE_LE_TEXTE_INCRUSTE,
} from './lib/fal.mjs'
import { identiteDe } from './lib/persona.mjs'
import { ffmpeg, sonde } from './lib/ffmpeg.mjs'
import { telechargeVideo } from './lib/tiktok.mjs'
import { lis as litAvatar, fichiersDe, avatars } from './lib/avatars.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
copie.mjs — refaire une vidéo de référence avec l'avatar de la chaîne

  npm run copie -- <slug> --lien=<url> --avatar=<id>
  npm run copie -- <slug> --fichier=<chemin> --avatar=<id>
  npm run copie -- <slug> --lien=<url> --avatar=<id> --plans=3
                                        combien de plans tirer de la référence
  npm run copie -- <slug> --devis        ce que ça coûterait, sans rien lancer

COMMENT ÇA MARCHE

  La vidéo est rapatriée, découpée en tronçons de dix secondes au plus, et
  chaque tronçon sert de référence de mouvement. Le modèle en tire le cadrage
  et l'énergie, et les rejoue avec les photos de l'avatar.

  Il s'INSPIRE, il ne décalque pas. C'est ce qu'on veut : le même genre de plan
  avec ton personnage, pas la vidéo de quelqu'un d'autre avec un visage dessus.

  L'avatar se crée avec : npm run avatars -- --ajoute=<id> --nom="…" <photos…>
`
)

const MODELE = 'fal-ai/minimax/hailuo-03/reference-to-video'
/** La référence de mouvement plafonne à 15 s ; on garde de la marge. */
const REF_MAX_S = 10

/**
 * ET UN TRONÇON TROP COURT NE RÉFÉRENCE RIEN.
 *
 * Le nombre de plans est demandé à l'écran, la durée de la référence n'est
 * connue qu'après le rapatriement : rien n'empêchait de découper 5,8 s en trois
 * morceaux de 1,9 s, puis de demander au modèle six secondes de mouvement à
 * partir de chacun. Il produit quand même — et il produit trois fois presque
 * rien, pour le prix de trois plans.
 *
 * On plafonne donc au nombre que la référence peut réellement porter, et on le
 * dit. Le plafond ne peut que faire baisser la note, jamais la monter : il
 * n'invalide pas l'accord donné avant de lancer.
 */
const TRONCON_MIN_S = 5
const PRIX_PAR_PLAN = 0.04

/**
 * Poste un plan chez fal et rend l'adresse de la vidéo.
 *
 * Le transport — téléversement, file d'attente, reprise après un hoquet — vit
 * dans `lib/fal.mjs` : il était recopié ici, et deux copies d'un même code
 * divergent à la première retouche.
 */
async function job(corps, etiquette) {
  const t = await travailFal(MODELE, corps, { etiquette })
  const url = (t.match(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/) || [])[1]
  // UN ÉCHEC QUI NE DIT PAS POURQUOI EST UN CUL-DE-SAC.
  //
  // fal répond en 200 avec un travail « terminé » aussi bien pour un refus de
  // modération que pour un changement de format : c'est le corps qui porte la
  // différence, et il coûte deux lignes à montrer.
  if (!url) throw new Error(`${etiquette} sans vidéo : ${resumeFal(t)}`)
  return url
}

/**
 * CE QUE LE MODÈLE NE VOYAIT PAS, ET QUI DÉCIDAIT DE TOUT.
 *
 * Le prompt disait « reprends le cadrage et l'énergie de la vidéo 1 » sans
 * jamais dire ce qu'il y avait dedans. Le modèle prend alors la référence de
 * loin — la pose, à peu près le cadrage — et invente le reste à partir des
 * seules images qu'il a vraiment : les photos de l'avatar. Il en tire leur
 * éclairage et leur humeur.
 *
 * Relevé le 4 septembre 2026 sur une référence en plein jour sous les palmiers,
 * avec une expression blasée qui portait toute la blague : la sortie était de
 * nuit, en intérieur, avec un sourire chaleureux. Le registre exactement
 * inversé, et un décor sans rapport.
 *
 * On fait donc REGARDER la référence avant de la rejouer. Un aller-retour à un
 * dixième de centime, et le décor, la lumière, la tenue, la pose, l'angle et
 * surtout l'expression entrent dans le prompt au lieu d'être devinés.
 *
 * Le visage, lui, est explicitement exclu de la description : c'est l'avatar
 * qui le porte, et décrire celui de la référence reviendrait à demander au
 * modèle de refaire quelqu'un d'autre.
 */
async function decrisLaScene(urlImage) {
  // CE QU'ON DEMANDE, ET CE QU'ON REFUSE D'ENTENDRE.
  //
  // La première version demandait aussi la tenue. Résultat mesuré le
  // 4 septembre 2026 : le décor et l'expression revenaient — et la créatrice
  // d'origine avec. Une tenue décrite au détail près (« draped bikini top,
  // sunglasses perched on head ») est un signalement d'identité aussi fort
  // qu'un visage : le texte confirmait la vidéo de référence, et le modèle a
  // reconstruit la personne au lieu de l'avatar.
  //
  // On ne garde donc que ce qui appartient au LIEU — le décor, la lumière, le
  // cadrage. Une couleur de haut qui diffère est un prix dérisoire à côté d'un
  // plan qui rend quelqu'un d'autre.
  //
  // L'EXPRESSION EN A ÉTÉ RETIRÉE ENSUITE, ET POUR UNE AUTRE RAISON.
  //
  // Décrite en mots — « wistful contentment » — elle ressortait en sourire
  // large : le modèle amplifie tout adjectif d'humeur qu'on lui donne. Or
  // l'expression n'a pas besoin d'être dite : elle est DANS la vidéo de
  // référence, image par image, avec son minutage. La lui faire suivre vaut
  // mieux que la lui raconter.
  const question =
    'Describe ONLY the setting of this video frame, for a video-generation prompt. ' +
    'Ignore any burned-in caption, subtitle, emoji or watermark — they are overlays, ' +
    'not part of the scene. ' +
    'You must NOT describe the person at all: not their face, expression, hair, age, ' +
    'body, skin, or clothing. Never write anything that would help identify or ' +
    'recognise them. ' +
    'In two sentences, in English, cover only: (1) the location and background, ' +
    '(2) the time of day and the quality of the light, (3) the camera framing, ' +
    'angle and distance.'

  return await vision(urlImage, question)
}

/**
 * Les adresses fal des photos de l'avatar, posées une fois et retenues.
 *
 * Téléverser quatre photos à chaque plan coûterait un aller-retour pour rien.
 */
async function referencesDeLAvatar(id) {
  const a = litAvatar(id)
  if (!a) {
    const dispo = avatars().map((x) => x.id).join(', ') || 'aucun'
    throw new Error(`Aucun avatar « ${id} ». Disponibles : ${dispo}.`)
  }
  if (!a.photos.length) throw new Error(`L'avatar « ${id} » n'a aucune photo.`)

  const f = path.join(a.dossier, 'avatar.json')
  const brut = litJson(f, {})
  if (brut.fal?.urls?.length === a.photos.length) return { avatar: a, urls: brut.fal.urls }

  journal.info(`Mise en ligne des ${a.photos.length} photos de « ${a.nom} »…`)
  const urls = []
  for (const chemin of fichiersDe(id)) {
    urls.push(await televerse(chemin, 'image/png', path.basename(chemin)))
  }
  ecritJson(f, { ...brut, fal: { urls, posees_le: new Date().toISOString() } })
  return { avatar: a, urls }
}

principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug : npm run copie -- <slug> --lien=<url> --avatar=<id>`)

  const lien = options.lien ?? null
  const fichier = options.fichier ? path.resolve(String(options.fichier)) : null
  if (!lien && !fichier) throw new Error(`Donne --lien=<url> ou --fichier=<chemin>.`)
  const idAvatar = options.avatar
  if (!idAvatar) {
    const dispo = avatars().map((x) => `${x.id} (${x.nom})`).join(', ') || 'aucun — npm run avatars -- --aide'
    throw new Error(`Donne --avatar=<id>. Disponibles : ${dispo}.`)
  }

  const v = dossierVideo(slug)
  const travail = path.join(v.montage, 'copie')
  assureDossier(travail)

  // ------------------------------------------------------ la référence ----
  let source = fichier
  if (!source) {
    journal.info(`Rapatriement de la référence…`)
    const sans = path.join(travail, 'reference')
    source = await telechargeVideo(lien, sans, { hauteurMax: 1080 })
    if (!source) throw new Error(`La vidéo n'a pas pu être rapatriée.\n  ${lien}`)
  }
  const info = await sonde(source)
  journal.ok(`Référence : ${duree(info.dureeS)} · ${info.largeur}×${info.hauteur}`)

  // Combien de plans ? Un par tronçon de dix secondes, sauf demande contraire.
  const demandes = Math.max(1, nombre(options, 'plans', Math.ceil(info.dureeS / REF_MAX_S)))
  const tenables = Math.max(1, Math.floor(info.dureeS / TRONCON_MIN_S))
  const plans = Math.min(demandes, tenables)
  if (plans < demandes) {
    journal.attention(
      `${demandes} plans demandés, ${plans === 1 ? 'un seul tenable' : `${plans} tenables`} : ` +
        `${duree(info.dureeS)} de référence ne donnent pas ${demandes} tronçons ` +
        `d'au moins ${TRONCON_MIN_S} s.`
    )
    journal.detail(`Pour en avoir plus, prends une référence plus longue.`)
  }
  const parPlan = Math.min(REF_MAX_S, info.dureeS / plans)

  if (drapeau(options, 'devis')) {
    journal.titre(`Devis`)
    journal.info(`${plans} plan(s) × ${PRIX_PAR_PLAN.toFixed(2)} $ ≈ ${(plans * PRIX_PAR_PLAN).toFixed(2)} $`)
    journal.detail(`Retire --devis pour lancer.`)
    return
  }

  const { avatar, urls } = await referencesDeLAvatar(String(idAvatar))

  // --------------------------------------------------------- les tronçons --
  journal.info(`${plans} plan(s) de ${parPlan.toFixed(1)} s`)
  const troncons = []
  for (let i = 0; i < plans; i++) {
    const rang = String(i + 1).padStart(2, '0')
    const debut = (i * info.dureeS) / plans
    const cible = path.join(travail, `ref-${rang}.mp4`)
    await ffmpeg([
      '-ss', String(debut), '-i', source, '-t', String(parPlan),
      '-an', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', cible,
    ])

    // Une image prise au MILIEU du tronçon, pas au début : un raccord tombe
    // souvent sur un flou de mouvement, et on décrirait une image ratée.
    const vue = path.join(travail, `vue-${rang}.png`)
    await ffmpeg(['-ss', String(debut + parPlan / 2), '-i', source, '-frames:v', '1', '-y', vue])

    troncons.push({
      video: await televerse(cible, 'video/mp4', path.basename(cible)),
      vue: await televerse(vue, 'image/png', path.basename(vue)),
    })
    progression(i + 1, plans, 'tronçons')
  }

  // ------------------------------------------------------ la génération ----
  const chaine = litJson(CHEMINS.chaine, {})
  const direction = chaine.identite_visuelle?.direction_plans ?? null
  const signe = avatar.signe ? ` ${avatar.signe}.` : ''

  // L'IDENTITÉ SE LIT UNE FOIS, PAS UNE FOIS PAR PLAN.
  //
  // C'est ce qui la rend constante : les trois plans d'une vidéo, et les trente
  // d'une chaîne, reçoivent le même tempérament. La déduire par plan reviendrait
  // à tirer un caractère au sort à chaque génération.
  const jeu = await identiteDe(avatar)

  const faits = []
  for (const [i, ref] of troncons.entries()) {
    journal.info(`Plan ${i + 1}/${plans}…`)

    const scene = await decrisLaScene(ref.vue)
    // ON MONTRE CE QUE LA MACHINE A COMPRIS.
    //
    // Sans ça, un plan qui rate ne dit pas s'il a mal vu la référence ou mal
    // rejoué ce qu'il avait vu — deux pannes qui n'appellent pas le même geste.
    if (scene) journal.detail(`vu : ${scene}`)
    else journal.attention(`la scène n'a pas pu être décrite — le décor sera deviné.`)

    const url = await job({
      prompt:
        // CHAQUE RÉFÉRENCE RÉPOND D'UNE SEULE CHOSE, ET LE PROMPT LE DIT.
        //
        // Video 1 porte le mouvement et l'expression ; les images portent
        // l'identité ; le texte ne porte que le lieu. Tant qu'on demandait à
        // deux sources la même chose, elles se contredisaient — et la version
        // précédente allait plus loin : elle disait de se méfier de Video 1
        // pour la personne, ce qui a fait décrocher le mouvement avec.
        `Video 1 is the motion reference. Follow it closely: the same body and head ` +
        `movement, the same gestures, the same changes of facial expression, at the ` +
        `same timing, with the same camera motion and the same energy. ` +
        (scene ? `The setting: ${scene} ` : '') +
        `${IGNORE_LE_TEXTE_INCRUSTE} ` +
        `Filmed on her own phone, vertical video, natural and amateur, no colour grading, ` +
        `${AUCUN_TEXTE_A_L_ECRAN}. ` +
        // L'IDENTITÉ EN DERNIER — LA POSITION QUI PÈSE LE PLUS.
        //
        // Formulée comme une SUBSTITUTION, pas comme une exclusion : on remplace
        // l'interprète et on garde l'interprétation. « Sa protagoniste ne doit
        // pas apparaître » opposait l'identité au mouvement ; « joue le même
        // rôle avec elle » demande les deux à la fois.
        `The woman performing is the person in the reference images: keep her exact ` +
        `face, hair and age.${signe} She replaces the performer of Video 1 and plays ` +
        `the same beats — the same actions, at the same moments. ` +
        // LA VIDÉO DONNE LES ACTIONS, L'IDENTITÉ DONNE LA MANIÈRE.
        //
        // Les deux ne se disputent pas : Video 1 dit ce qu'elle fait et quand,
        // l'identité dit comment elle le fait. Sans la seconde, chaque plan
        // invente un tempérament, et l'abonné voit une inconnue qui a le même
        // visage d'une vidéo à l'autre.
        //
        // IL Y AVAIT ICI L'INTERDICTION INVERSE, et elle se retournait contre
        // nous : « n'ajoute ni sourire ni chaleur qui ne soit dans Video 1 »
        // corrigeait bien le sourire par défaut, mais imposait une neutralité
        // par défaut à sa place. Une seule mine tenue sur tous les plans reste
        // une seule mine, souriante ou impassible. Ce qu'on refuse, c'est
        // l'expression FIGÉE — pas l'expression.
        (jeu ? `She plays them in her own manner: ${jeu} ` : '') +
        `Her face must stay mobile throughout the shot and react to what happens ` +
        `in it — never one held expression from start to finish.` +
        (direction ? ` ${direction}` : ''),
      reference_image_urls: urls,
      reference_video_urls: [ref.video],
      // La durée demandée SUIT le tronçon, elle ne l'arrondit plus vers le haut.
      // Réclamer six secondes à partir de cinq oblige le modèle à inventer la
      // sixième — et ce qu'il invente ne suit plus rien. Le modèle accepte 5 à 15.
      duration: Math.max(5, Math.min(15, Math.round(parPlan))),
    }, `plan ${i + 1}`)

    const cible = path.join(travail, `plan-${String(i + 1).padStart(2, '0')}.mp4`)
    const r = await essaie(url, {})
    fs.writeFileSync(cible, Buffer.from(await r.arrayBuffer()))
    faits.push(cible)
    journal.ok(`Plan ${i + 1} rendu.`)
  }

  // --------------------------------------------------------- l'assemblage --
  const nets = []
  for (const [i, f] of faits.entries()) {
    const net = path.join(travail, `net-${i}.mp4`)
    await ffmpeg([
      '-i', f, '-an',
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=25',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', net,
    ])
    nets.push(net)
  }
  const liste = path.join(travail, 'liste.txt')
  fs.writeFileSync(liste, nets.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'))
  const sortie = path.join(v.montage, 'copie.mp4')
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', sortie])

  const fin = await sonde(sortie)
  journal.ok(`${duree(fin.dureeS)} · ${fin.largeur}×${fin.hauteur}`)
  journal.detail(path.relative(CHEMINS.racine, sortie))
  journal.info(`Pose la voix ensuite : la piste est muette, comme la référence.`)

  if (drapeau(options, 'json')) {
    console.log(JSON.stringify({
      ok: true, slug, avatar: avatar.id, plans, fichier: path.relative(CHEMINS.racine, sortie),
      secondes: Number(fin.dureeS.toFixed(2)),
    }, null, 2))
  }
})
