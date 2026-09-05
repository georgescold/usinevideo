#!/usr/bin/env node
/**
 * voix.mjs — remplacer le timbre, garder le jeu.
 *
 * Tu enregistres, tu joues, tu poses les silences. ElevenLabs ne change que la
 * couleur de la voix. Rien d'autre ne bouge : ni le rythme, ni les intentions,
 * ni les respirations.
 *
 *   npm run voix -- mon-slug
 *   npm run voix -- mon-slug --voix=<identifiant> --essai
 *   npm run voix -- chemin/vers/prise.wav --sortie=voix-finale.wav
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, dossierVideo, assureDossier } from './lib/chemins.mjs'
import { journal, duree } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import { changeDeVoix, etatPool, voix as listeVoix } from './lib/elevenlabs.mjs'
import { voixPour } from './lib/choix-voix.mjs'
import { sonde, ffmpeg } from './lib/ffmpeg.mjs'
import { avecCle } from './lib/trousseau.mjs'
import { modelePour, convertitAvecModele } from './lib/voix-locale.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run voix -- <slug | fichier> [options]

  --voix=<id>        identifiant de voix ElevenLabs
                     (défaut : le choix de la vidéo, sinon celui de la chaîne)
  --stabilite=0.5    0 = très expressif, 1 = très plat
  --similarite=0.8   fidélité à la voix cible
  --essai=10         ne convertit qu'un extrait (30 s si on ne dit rien)
  --depart=45        où commence l'extrait, en secondes
  --catalogue        liste les voix disponibles et s'arrête
  --quota            affiche le quota du pool et s'arrête
  --sortie=nom.wav   nom du fichier produit
  --brute            saute la conversion : garde l'enregistrement tel quel

Convertir en local, avec un modèle entraîné

  --local            emploie un modèle de marque/voix/ au lieu d'ElevenLabs
  --modele=<id>      lequel (défaut : le choix de la vidéo, sinon le seul)
  --transpose=0      demi-tons, de -24 à 24 — indispensable si les tessitures
                     diffèrent (homme vers femme : +12, l'inverse : -12)
  --index=0.3        influence de l'index : plus haut colle au timbre appris,
                     plus bas garde ta prononciation
  --protege=0.33     protège consonnes et respirations (0 à 0.5)
  --enveloppe=1      1 garde la dynamique du modèle, 0 suit celle de TA prise

Le local est gratuit et hors ligne : ni quota, ni seuil, ni confirmation.
Pour ElevenLabs, le seuil sans confirmation est de 5 min. Au-delà, ajoute --oui.
`
)

const LIMITE_MINUTES_SANS_ACCORD = 5

await principal(async () => {
  if (drapeau(options, 'quota')) {
    const p = await etatPool()
    journal.titre('Quota ElevenLabs')
    for (const c of p.cles) {
      journal.detail(
        `${(c.label ?? '?').padEnd(14)} ${
          c.vivante
            ? `${c.palier.padEnd(9)} ${String(c.restant).padStart(7)} crédits · ` +
              `${c.minutesSts.toFixed(1)} min` +
              (c.commercial ? '' : ' · SANS licence commerciale')
            : `hors service (${c.raison})`
        }`
      )
    }
    journal.info(
      `${p.minutesTotales.toFixed(1)} min disponibles, ` +
        `dont ${p.minutesCommerciales.toFixed(1)} min utilisables commercialement`
    )
    return
  }

  if (drapeau(options, 'catalogue')) {
    const v = await avecCle('elevenlabs', (cle) => listeVoix(cle))
    journal.titre(`${v.length} voix disponibles`)
    for (const x of v) {
      console.log(
        `  ${x.id}  ${(x.nom ?? '').padEnd(22)} ${(x.genre ?? '').padEnd(8)} ` +
          `${(x.langue ?? '').padEnd(6)} ${x.categorie ?? ''}`
      )
    }
    journal.detail(`Renseigne l'identifiant retenu dans ELEVENLABS_VOICE_ID (.env).`)
    return
  }

  const cible = positionnels[0]
  if (!cible) throw new Error(`Donne un slug de vidéo ou un chemin de fichier.`)

  // ------------------------------------------------------- où est la prise --
  const dossierPossible = path.join(CHEMINS.videos, cible.replace(/^videos[\\/]/, ''))
  let source
  let destination

  if (fs.existsSync(dossierPossible)) {
    const slug = path.basename(dossierPossible)
    const v = dossierVideo(slug)
    assureDossier(v.audio)

    const candidats = [
      path.join(v.audio, 'voix.wav'),
      ...(fs.existsSync(v.tournage)
        ? fs
            .readdirSync(v.tournage)
            .filter((f) => /\.(wav|mp3|m4a|mp4|mov|mkv)$/i.test(f))
            .sort()
            .map((f) => path.join(v.tournage, f))
        : []),
    ]
    source = candidats.find((c) => fs.existsSync(c))
    if (!source) {
      throw new Error(
        `Aucun enregistrement pour « ${slug} ».\n` +
          `Dépose ta prise dans ${path.relative(CHEMINS.racine, v.tournage)}.`
      )
    }
    destination = path.join(v.audio, options.sortie || 'voix-finale.wav')
  } else {
    if (!fs.existsSync(cible)) throw new Error(`Fichier introuvable : ${cible}`)
    source = cible
    destination = options.sortie
      ? path.resolve(path.dirname(cible), options.sortie)
      : cible.replace(/\.[^.]+$/, '') + '-voix.wav'
  }

  // ------------------------------------------- extraction de la piste seule --
  const info = await sonde(source)
  let entree = source
  if (info.aDeLaVideo) {
    entree = path.join(path.dirname(destination), '.prise.wav')
    await ffmpeg(['-i', source, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', entree])
    journal.detail(`Piste audio extraite de la vidéo.`)
  }

  // L'ESSAI SE RÈGLE, PARCE QU'UN RÉGLAGE SE JUGE SUR UN PASSAGE PRÉCIS.
  //
  // Il ne prenait que les trente premières secondes. C'est souvent le pire
  // endroit d'une prise : on s'installe, on cherche son ton, et la transposition
  // qu'on essaie justement de régler ne s'y entend pas comme dans le corps du
  // texte. Sur une prise de deux minutes, ça revient à juger sur le quart le
  // moins représentatif.
  //
  // `--essai` seul garde son comportement ; `--essai=8 --depart=45` vise.
  if (options.essai !== undefined) {
    const secondes = Math.max(2, Math.min(60, nombre(options, 'essai', 30)))
    const depart = Math.max(0, nombre(options, 'depart', 0))
    const court = path.join(path.dirname(destination), '.essai.wav')
    // On décode au lieu de recopier les octets : `-c copy` coupe aux frontières
    // de trame et le départ demandé se décale de quelques dixièmes. Sur dix
    // secondes, c'est visible.
    await ffmpeg([
      '-i', entree, '-ss', String(depart), '-t', String(secondes),
      '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', court,
    ])
    entree = court
    journal.detail(
      `Mode essai : ${secondes} s` + (depart ? `, à partir de ${depart} s.` : ` depuis le début.`)
    )
  }

  const { dureeS } = await sonde(entree)

  // Le slug n'existe que si on a visé un dossier de vidéo : sur un fichier
  // isolé, il n'y a pas de choix par vidéo à consulter, seulement le défaut de
  // la chaîne. Il est résolu ICI parce que les deux moteurs en ont besoin.
  const slugVise = fs.existsSync(dossierPossible) ? path.basename(dossierPossible) : null

  // ------------------------------------------------------- voix brute seule --
  if (drapeau(options, 'brute')) {
    // Aucun traitement : l'audio fourni est recopie tel quel.
    fs.copyFileSync(entree, destination)
    journal.ok(`Voix conservée telle quelle, sans traitement : ${path.basename(destination)}`)
    return
  }

  // ---------------------------------------------------- le moteur local ----
  //
  // GRATUIT ET HORS LIGNE : NI QUOTA, NI SEUIL, NI CONFIRMATION.
  //
  // Tout ce qui suit — la limite des cinq minutes, le calcul en crédits, le
  // trousseau — n'a de sens que pour un appel payant. Une conversion locale ne
  // coûte que du temps de carte graphique, et le §7 ne demande d'annoncer que
  // ce qui se paie. La branche sort donc AVANT le seuil, pas après.
  if (drapeau(options, 'local') || options.modele) {
    const modele = modelePour(slugVise, options.modele)

    journal.titre('Remplacement du timbre — modèle local')
    journal.detail(
      `Modèle : « ${modele.id} » (${modele.origine}) · ` +
        `${modele.epoques} époques sur ${duree(modele.corpusS ?? 0)} de voix`
    )
    if (!modele.index) {
      journal.attention(
        `Ce modèle n'a pas d'index : la prononciation sera moins fidèle. ` +
          `Un réentraînement en produit un.`
      )
    }

    const transpose = nombre(options, 'transpose', 0)
    if (transpose === 0) {
      // LE PIÈGE LE PLUS COURANT DE RVC, ET IL EST SILENCIEUX.
      //
      // Le modèle ne transpose pas de lui-même : il plaque un timbre sur TA
      // hauteur. Convertir une voix d'homme vers un modèle de femme sans
      // transposer donne une voix de femme qui parle une octave trop bas —
      // le résultat sonne « robotique » et on accuse le modèle, alors qu'il
      // manque un réglage. On le dit ici plutôt que dans un fichier d'aide.
      journal.detail(
        `Sans transposition. Si les tessitures diffèrent, essaie --transpose=12 ou -12.`
      )
    }

    await convertitAvecModele(entree, destination, modele, {
      transpose,
      index: nombre(options, 'index', 0.3),
      protege: nombre(options, 'protege', 0.33),
      enveloppe: nombre(options, 'enveloppe', 1),
    })

    for (const temporaire of ['.prise.wav', '.essai.wav']) {
      fs.rmSync(path.join(path.dirname(destination), temporaire), { force: true })
    }

    // LA DURÉE EST LE SEUL CONTRÔLE QUI COMPTE VRAIMENT ICI.
    //
    // Les sous-titres sont calés MOT À MOT sur ce fichier. La conversion est
    // censée être synchrone à la trame — même longueur, échantillon pour
    // échantillon — mais si elle dérivait, rien d'autre ne le signalerait : on
    // le découvrirait au rendu, sur des sous-titres qui glissent, et on
    // chercherait ailleurs. On mesure, et on le dit.
    const fin = await sonde(destination)
    const derive = Math.abs(fin.dureeS - dureeS)
    journal.ok(`${path.basename(destination)} · ${duree(fin.dureeS)}`)
    if (derive > 0.05) {
      journal.attention(
        `La durée a bougé de ${derive.toFixed(2)} s (${duree(dureeS)} → ${duree(fin.dureeS)}). ` +
          `Les sous-titres se caleront sur le fichier converti, pas sur ta prise : ` +
          `retranscris avant de monter.`
      )
    } else {
      journal.detail(`Durée conservée à ${derive.toFixed(3)} s près — le calage tient.`)
    }
    console.log('')
    journal.detail(
      `Les sous-titres se calent sur CE fichier : ` +
        `lance « npm run transcris -- ${slugVise ?? path.basename(path.dirname(path.dirname(destination)))} ».`
    )
    return
  }

  const minutes = dureeS / 60
  if (minutes > LIMITE_MINUTES_SANS_ACCORD && !drapeau(options, 'oui')) {
    throw new Error(
      `${duree(dureeS)} dépasse le seuil de ${LIMITE_MINUTES_SANS_ACCORD} min ` +
        `(environ ${Math.round(minutes * 1000)} crédits, ${(minutes * 0.12).toFixed(2)} $). ` +
        `Relance avec --oui, ou teste d'abord avec --essai.`
    )
  }

  const choisie = voixPour(slugVise, options.voix)
  const voixId = choisie.voice_id

  journal.titre('Remplacement du timbre')
  if (voixId) {
    journal.detail(
      `Voix : ${choisie.nom ? `« ${choisie.nom} » · ` : ''}${voixId} (${choisie.origine})`
    )
  }
  // La conversion ecrit directement le livrable : plus de normalisation entre
  // les deux. Le niveau qui sort d'ElevenLabs est celui qu'on garde.
  await changeDeVoix(entree, destination, {
    voiceId: voixId,
    stabilite: nombre(options, 'stabilite', 0.5),
    similarite: nombre(options, 'similarite', 0.8),
  })
  for (const temporaire of ['.prise.wav', '.essai.wav']) {
    fs.rmSync(path.join(path.dirname(destination), temporaire), { force: true })
  }

  const fin = await sonde(destination)
  journal.ok(`${path.basename(destination)} · ${duree(fin.dureeS)} · normalisé à −14 LUFS`)
  console.log('')
  journal.detail(
    `Les sous-titres se calent sur CE fichier, pas sur ta prise : ` +
      `lance « npm run transcris -- ${path.basename(path.dirname(path.dirname(destination)))} ».`
  )
})
