#!/usr/bin/env node
/**
 * monte.mjs — des rushes au plan de montage.
 *
 * Six étapes, chacune rejouable seule. Si une seule change, on ne refait pas
 * les cinq autres : la transcription et le remplacement de voix coûtent du
 * temps et de l'argent.
 *
 *   1. rushes        inventaire et sondage
 *   2. coupe         détection des silences, audio recollé
 *   3. voix          remplacement du timbre (ElevenLabs) ou normalisation seule
 *   4. transcris     transcription mot à mot de la voix FINALE
 *   5. cale          les événements visuels tombent sur leur mot
 *   6. plan          écriture de 05-montage/plan.json
 *
 *   npm run monte -- mon-slug
 *   npm run monte -- mon-slug --depuis=voix
 *   npm run monte -- mon-slug --voix=brute
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CHEMINS,
  dossierVideo,
  assureDossier,
  assureDossierVideo,
  litJson,
  ecritJson,
  litChaine,
} from './lib/chemins.mjs'
import { journal, duree, compact } from './lib/journal.mjs'
import { litArgs, aide, drapeau, nombre, principal } from './lib/args.mjs'
import * as M from './lib/montage.mjs'
import { resoudBroll, FENETRE_REEMPLOI, cleDeMedia } from './lib/medias.mjs'
import { remplaceUnPlan } from './lib/plan-broll.mjs'
import { sonde } from './lib/ffmpeg.mjs'
import { transcris, corrigeParLeScript } from './lib/whisper.mjs'
import { voixPour, reglagesDeVoix, enregistreEmploi } from './lib/choix-voix.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
npm run monte -- <slug> [options]

  --voix=sts|local|brute  remplacer le timbre chez ElevenLabs, avec un modèle
                          entraîné en local, ou garder ta voix (défaut : config)
  --modele-voix=<id>      quel modèle local (défaut : le seul, ou celui de la vidéo)
  --transpose=0           demi-tons, si les tessitures diffèrent (local seulement)
  --voix-id=<identifiant> forcer une voix ElevenLabs pour ce montage
                          (défaut : le choix de la vidéo, sinon celui de la chaîne)
  --depuis=<étape>        refait à partir de là : coupe | voix | transcris | cale
  --refais                refait tout, y compris transcription et voix
  --seuil-db=-34          seuil de détection du silence
  --silence-min=0.35      durée minimale d'un silence coupé, en secondes
  --coupe-silences        retire les silences (DESACTIVE par defaut : le son
                          depose n'est pas modifie)
  --coupe-hesitations     retire aussi « euh », bafouillages et faux départs
                          (découpe dans la voix : à écouter après)
  --modele-transcription=large-v3-turbo   modèle de transcription
                          (défaut : config de la chaîne)
  --modele=<id>           raccourci : on reconnaît si c'est un modèle de
                          voix entraîné ou un modèle whisper, et on le dit
  --ouverture=ia          le PREMIER plan généré par IA, les autres en banque
  --comble=ia             génère un plan là où la banque n'a RIEN rendu, au lieu
                          de laisser un trou — le prix dépend du modèle
                          (0,04 $ à 2,36 $ le plan de 5 s), et il est annoncé
  --comble-max=3          plafond de plans comblés — au-delà, le trou reste
  --plans-ia=5            budget de plans générés pour CE montage, placés là où
                          ils servent le plus : le script est lu en entier, et
                          la génération va aux passages qu'une banque d'images
                          ne peut pas servir. Ce qui reste du budget comble les
                          trous. Implique --comble=ia
  --modele-video=<id>     quel modèle génère les plans, pour CE montage
                          (défaut : celui de la chaîne — voir « Identité »)
  --refais-plans          écarte les plans que CETTE vidéo emploie déjà, pour
                          en obtenir d'autres. Sans lui, un remontage redonne
                          les mêmes : la banque rend ses candidats dans le
                          même ordre
  --fenetre-reemploi=<n>  combien de montages récents de la CHAÎNE écartent
                          leurs plans (défaut 10, 0 pour n'écarter personne).
                          Sur une niche étroite, la banque rend toujours les
                          mêmes candidats : écarter les bons laisse les moins
                          justes
  --oui                   passe les seuils de confirmation

Sortie : videos/<slug>/05-montage/plan.json
Ensuite : npm run rends -- <slug>
`
)

const ETAPES = ['rushes', 'coupe', 'voix', 'transcris', 'cale', 'plan']

await principal(async () => {
  const slug = positionnels[0]
  if (!slug) throw new Error(`Donne le slug de la vidéo à monter.`)

  const v = assureDossierVideo(slug)
  const script = litJson(v.scriptJson, null)
  if (!script) {
    throw new Error(
      `Aucun script pour « ${slug} ».\n` +
        `Attendu : ${path.relative(CHEMINS.racine, v.scriptJson)}\n` +
        `Lance /script ${slug} d'abord.`
    )
  }
  // ON VA AUSSI LOIN QU'ON PEUT, ET ON S'ARRÊTE OÙ IL FAUT VRAIMENT S'ARRÊTER.
  //
  // Cette ligne était `verifieScript(script, slug)` sans condition, et elle
  // refusait la commande entière sur une vidéo sans script. C'était trop
  // large : sur les six étapes, seules les deux dernières — le calage des
  // événements et le plan — ont besoin des blocs. Convertir la voix et
  // transcrire n'en demandent aucun, et ce sont précisément les deux choses
  // qu'on veut obtenir dès qu'un audio est déposé.
  //
  // Le résultat était une impasse : on déposait une prise, la voix était
  // convertible à la main (`npm run voix`) mais pas ici, et l'atelier affichait
  // « le script n'est pas écrit » au-dessus d'un audio déjà converti.
  //
  // Un script PRÉSENT MAIS INVALIDE reste refusé tout de suite : là, il y a une
  // faute à corriger, et la découvrir après deux minutes de conversion ne rend
  // service à personne. Un script ABSENT n'est pas une faute, c'est un moment de
  // la production — on fait ce qui se fait, et on dit où l'on s'arrête.
  const scriptEcrit = Array.isArray(script.blocs) && script.blocs.length > 0
  if (scriptEcrit) verifieScript(script, slug)

  // DEUX RÉGLAGES PORTAIENT LE MÊME NOM, ET ILS N'ONT RIEN À VOIR.
  //
  // `--modele=` désignait le modèle de TRANSCRIPTION (whisper) à un endroit et
  // le modèle de VOIX (le timbre entraîné) à un autre — les deux étaient même
  // documentés dans l'aide, six lignes l'un sous l'autre. Résultat :
  //
  //     npm run monte -- video-2 --voix=local --modele=myriam
  //     ✗ Invalid whisper model myriam. Available: tiny, base, small…
  //
  // La voix se convertissait correctement, puis la transcription allait
  // télécharger un modèle whisper appelé « myriam ». Douze minutes de travail
  // pour une erreur en fin de course, sur un mot qu'on avait bien écrit.
  //
  // Chaque réglage a désormais son nom. `--modele=` reste accepté parce que
  // c'est ce qu'on tape naturellement, et parce qu'il n'y a aucune ambiguïté à
  // lever : les deux familles de noms sont connues et disjointes. On tranche, et
  // surtout ON LE DIT — deviner en silence serait le défaut suivant.
  const MODELES_WHISPER = new Set([
    'tiny', 'tiny.en', 'base', 'base.en', 'small', 'small.en',
    'medium', 'medium.en', 'large-v1', 'large-v2', 'large-v3', 'large-v3-turbo',
  ])

  let modeleVoix = options['modele-voix'] ?? null
  let modeleTranscription = options['modele-transcription'] ?? null

  if (typeof options.modele === 'string') {
    const brut = options.modele
    if (MODELES_WHISPER.has(brut)) {
      if (!modeleTranscription) modeleTranscription = brut
    } else {
      // Pas un nom whisper : c'est donc un modèle de voix. `modelePour` dira
      // lui-même s'il n'existe pas, avec la liste des modèles entraînés.
      if (!modeleVoix) modeleVoix = brut
      journal.detail(`--modele=${brut} : compris comme un modèle de VOIX.`)
    }
  }

  const chaine = litChaine()

  // Par défaut on ne refait QUE ce qui manque : la transcription et le
  // remplacement de voix coûtent du temps et de l'argent, les rejouer sans
  // raison est le meilleur moyen de brûler un quota pour rien.
  // `--depuis=<étape>` force la reprise à partir de là ; `--refais` reprend tout.
  const depuis = drapeau(options, 'refais')
    ? 0
    : options.depuis
      ? ETAPES.indexOf(options.depuis)
      : ETAPES.length // rien n'est forcé
  if (depuis === -1) throw new Error(`Étape inconnue. Choisis parmi : ${ETAPES.join(', ')}`)
  const force = (etape) => ETAPES.indexOf(etape) >= depuis

  journal.titre(`Montage · ${slug} · ${script.format}`)

  // -- 1. rushes ------------------------------------------------------------
  const rushes = M.prendsLesRushes(v.tournage)
  const prises = rushes.filter((r) => !M.estPlanDeCoupe(r))
  if (prises.length === 0) {
    throw new Error(
      `Aucun rush dans ${path.relative(CHEMINS.racine, v.tournage)}.\n` +
        `Dépose tes fichiers (prise-01.mp4, prise-02.mp4…) puis relance.`
    )
  }
  journal.etape(1, 6, `${prises.length} prise(s), ${rushes.length - prises.length} plan(s) de coupe`)

  // -- 2. coupe -------------------------------------------------------------
  const cheminCoupe = path.join(v.montage, 'coupe.json')
  let coupe = litJson(cheminCoupe, null)

  if (force('coupe') || !coupe) {
    // LA COUPE DES SILENCES EST DESACTIVEE PAR DEFAUT. CONSIGNE DU 28 AOUT 2026.
    //
    // Elle etait active, et c'est la doctrine du §10 : « aucun temps mort ».
    // Mais elle DECOUPE DANS LA PISTE — elle retire des morceaux d'audio et
    // recolle le reste — et la consigne du proprietaire est qu'aucune
    // modification ne touche le son depose. Une coupe reste une modification,
    // meme quand elle ne touche a aucun echantillon conserve.
    //
    // La contrepartie est reelle et il faut la connaitre : les silences de la
    // prise restent dans la video, et le rythme est celui de l'enregistrement.
    // Sur une prise ou l'on cherche ses mots, ca s'entend.
    //
    // On la rallume pour une video donnee avec `--coupe-silences`.
    const coupeDemandee = drapeau(options, 'coupe-silences')
    journal.etape(2, 6, coupeDemandee ? 'détection des silences' : 'piste intégrale, aucun silence coupé')
    if (!coupeDemandee) {
      const aGarder = []
      let curseur = 0
      for (const rush of prises) {
        const info = await sonde(rush)
        const dureeMs = Math.round(info.dureeS * 1000)
        aGarder.push({ src: rush, depuisS: 0, jusquaS: info.dureeS, debutMs: curseur, dureeMs })
        curseur += dureeMs
      }
      coupe = { aGarder, dureeMs: curseur, retireMs: 0, brutMs: curseur }
    } else {
      coupe = await M.decoupeParole(prises, {
        seuilDb: options['seuil-db'] ? Number(options['seuil-db']) : undefined,
        silenceMin: options['silence-min'] ? Number(options['silence-min']) : undefined,
      })
    }
    // COUPE INTELLIGENTE : hors service par défaut, sur demande explicite.
    //
    // Elle lit la transcription et retire hésitations, bafouillages et faux
    // départs — ce que la détection de niveau ne peut pas voir, puisqu'un « euh »
    // est un son comme un autre.
    //
    // Mais elle DÉCOUPE DANS LA VOIX, et une coupe posée deux dixièmes trop tôt
    // ampute le mot d'à côté. Sur une prise propre, elle enlève une seconde ou
    // deux et risque une phrase ; le rapport est mauvais. Elle ne se justifie que
    // sur une prise réellement hésitante, et après écoute.
    //
    //   npm run monte -- <slug> --coupe-hesitations
    if (drapeau(options, 'coupe-hesitations')) {
      const brouillon = path.join(v.audio, '.brouillon.wav')
      assureDossier(v.audio)
      await M.fabriqueAudioCoupe(coupe.aGarder, brouillon)
      const t = await transcris(brouillon, {
        langue: chaine?.langue ?? 'fr',
        modele: modeleTranscription || chaine?.transcription?.modele || 'large-v3-turbo',
        silencieux: true,
      })
      const affine = M.retireLesHesitations(coupe.aGarder, t.mots)
      fs.rmSync(brouillon, { force: true })
      if (affine.retires > 0) {
        coupe = {
          ...coupe,
          aGarder: affine.aGarder,
          dureeMs: affine.dureeMs,
          retireMs: coupe.retireMs + affine.retireMs,
        }
        journal.detail(
          `${affine.retires} hésitation(s) ou bafouillage(s) retirés — ` +
            `${(affine.retireMs / 1000).toFixed(1)} s de plus.`
        )
      }
    }

    ecritJson(cheminCoupe, coupe)

    const gain = coupe.brutMs ? Math.round((coupe.retireMs / coupe.brutMs) * 100) : 0
    journal.ok(
      `${duree(coupe.brutMs / 1000)} → ${duree(coupe.dureeMs / 1000)} ` +
        `(${gain} % retiré, ${coupe.aGarder.length} plans)`
    )
    if (gain > 45) {
      journal.attention(
        `Plus de 45 % de retiré : soit la prise a beaucoup d'hésitations, soit le seuil ` +
          `est trop haut. Écoute l'audio coupé avant d'aller plus loin (--seuil-db=-40 pour couper moins).`
      )
    }
  } else {
    journal.etape(2, 6, `coupe déjà calculée : ${coupe.aGarder.length} plans (--depuis=coupe pour la refaire)`)
  }

  // -- 3. voix --------------------------------------------------------------
  const audioCoupe = path.join(v.audio, 'voix-coupee.wav')
  const audioFinal = path.join(v.audio, 'voix-finale.wav')
  const modeVoix = options.voix || chaine?.voix?.mode || 'sts'

  if (force('voix') || !fs.existsSync(audioFinal)) {
    journal.etape(3, 6, `voix (mode ${modeVoix})`)
    assureDossier(v.audio)
    await M.fabriqueAudioCoupe(coupe.aGarder, audioCoupe)

    // LE NETTOYAGE EST DÉSACTIVÉ PAR DÉFAUT, ET CE N'EST PAS UN OUBLI.
    //
    // Deux versions ont été essayées, une agressive puis une douce. Les deux
    // **déformaient la voix** : consonnes rabotées, syllabes de fin tronquées,
    // et surtout une transcription qui n'entendait plus les mêmes mots — donc
    // des sous-titres faux, en plus d'un son abîmé.
    //
    // La leçon vaut au-delà de ce réglage : sur une prise déjà correcte, un
    // traitement de restauration a beaucoup plus à détruire qu'à réparer. Le
    // souffle d'une pièce ne gêne personne ; une consonne mangée s'entend
    // immédiatement, et un sous-titre qui ne correspond plus à la voix se voit.
    //
    // Le code reste disponible pour une prise réellement bruitée : mettre
    // `audio.nettoyage` au-dessus de 0 dans config/chaine.json le réactive.
    // Sur une prise normale, on n'y touche pas.
    // AUCUN TRAITEMENT SUR LA PRISE. C'EST UNE REGLE, PAS UN REGLAGE.
    //
    // Il y avait ici un nettoyage optionnel (passe-haut, expandeur, compresseur)
    // et, plus bas, une normalisation a -14 LUFS. Les deux ont ete retires : la
    // consigne est de conserver l'audio fourni tel qu'il a ete enregistre.
    //
    // Ce n'est pas une precaution de principe. Sur cette chaine, deux essais de
    // restauration ont ete rejetes a l'ecoute — la voix se deformait — et un
    // troisieme effet de bord s'est ajoute : la transcription mot a mot se
    // faisait sur un signal different de celui qu'on entend, donc les
    // sous-titres se decalaient. Un son un peu brut s'accepte ; un sous-titre
    // qui ne suit plus la voix, non.
    //
    // Ce qui reste sur la piste : le remplacement du timbre quand il est
    // demande, et rien d'autre. La coupe des silences elle-meme est desactivee
    // par defaut depuis le 28 aout 2026 — voir l'etape 2.
    const propre = audioCoupe

    // CE QUI SERT VRAIMENT SE NOTE PENDANT QU'ON LE FAIT.
    //
    // Reconstituer après coup « avec quoi cet audio a-t-il été converti » est
    // impossible : le mode de la chaîne a pu changer depuis, et le timbre
    // ElevenLabs mis de côté peut n'avoir jamais servi. Chaque branche remplit
    // donc ce qu'elle sait, et le tout est écrit à la fin — voir
    // `enregistreEmploi` dans lib/choix-voix.mjs.
    const emploi = { mode: modeVoix }

    if (modeVoix === 'sts') {
      const { changeDeVoix } = await import('./lib/elevenlabs.mjs')
      const minutes = coupe.dureeMs / 60000
      if (minutes > 5 && !drapeau(options, 'oui')) {
        throw new Error(
          `${duree(coupe.dureeMs / 1000)} de voix à convertir ` +
            `(environ ${Math.round(minutes * 1000)} crédits, ${(minutes * 0.12).toFixed(2)} $). ` +
            `Relance avec --oui, ou --voix=brute pour garder ta voix.`
        )
      }
      // La voix se choisit par vidéo, et on dit LAQUELLE et D'OÙ elle vient :
      // quand un montage sort avec le mauvais timbre, c'est la seule question.
      const choisie = voixPour(slug, options['voix-id'])
      if (!choisie.voice_id) {
        throw new Error(
          `Aucune voix ElevenLabs retenue pour « ${slug} ».\n` +
            `Choisis-en une : node outils/choix-voix.mjs ${slug} --catalogue\n` +
            `Ou garde ta voix telle quelle : npm run monte -- ${slug} --voix=brute`
        )
      }
      // LE MONTAGE EMPLOIE LE RÉGLAGE ESSAYÉ, PAS UN DÉFAUT EN DUR.
      //
      // Il passait `{ voiceId }` seul : la stabilité retombait donc à 0,5 quoi
      // qu'on ait écouté sur un extrait. On réglait à l'oreille pour rien.
      const reglages = reglagesDeVoix(choisie)
      journal.detail(
        `Voix : ${choisie.nom ? `« ${choisie.nom} » · ` : ''}${choisie.voice_id} (${choisie.origine})`
      )
      journal.detail(
        `Stabilité ${reglages.stabilite} · similarité ${reglages.similarite}` +
          (choisie.stabilite === null || choisie.stabilite === undefined ? ' (défauts)' : ' (réglés sur cette vidéo)')
      )

      // La sortie du remplacement de timbre part telle quelle : aucun gain,
      // aucune normalisation. Les plateformes ramenent de toute facon tout le
      // monde a leur cible, et le faire ici ne ferait qu'ecraser la dynamique
      // deux fois.
      await changeDeVoix(propre, audioFinal, { voiceId: choisie.voice_id, ...reglages })
      Object.assign(emploi, {
        voice_id: choisie.voice_id,
        nom: choisie.nom ?? null,
        origine: choisie.origine ?? null,
        ...reglages,
      })
    } else if (modeVoix === 'local') {
      // LE MÊME GESTE QU'EN `sts`, MAIS SANS RIEN QUI SE PAIE.
      //
      // Pas de seuil, pas de crédits, pas de trousseau : le modèle vit dans
      // `marque/voix/` et le calcul se fait sur la carte du poste. Le §7 ne
      // demande d'annoncer que ce qui coûte, donc rien à annoncer ici.
      //
      // Ce qui reste identique, et c'est l'essentiel : la conversion est
      // synchrone à la trame. La prise garde sa durée, donc les mots gardent
      // leurs instants, donc les sous-titres restent calés. C'est la seule
      // propriété qui rendait le speech-to-speech compatible avec ce pipeline,
      // et le modèle local la tient aussi.
      const { modelePour, convertitAvecModele } = await import('./lib/voix-locale.mjs')
      const modele = modelePour(slug, modeleVoix)
      journal.detail(
        `Modèle local : « ${modele.id} » (${modele.origine}) · ` +
          `${modele.epoques} époques sur ${duree(modele.corpusS ?? 0)}`
      )
      const transpose = nombre(options, 'transpose', chaine?.voix?.transpose ?? 0)
      if (transpose) journal.detail(`Transposition : ${transpose > 0 ? '+' : ''}${transpose} demi-tons`)
      Object.assign(emploi, {
        modele_local: modele.id,
        origine: modele.origine ?? null,
        transpose,
      })

      await convertitAvecModele(propre, audioFinal, modele, {
        transpose,
        index: nombre(options, 'index', chaine?.voix?.index ?? 0.3),
        protege: nombre(options, 'protege', chaine?.voix?.protege ?? 0.33),
        enveloppe: nombre(options, 'enveloppe', chaine?.voix?.enveloppe ?? 1),
      })

      // La durée est le seul contrôle qui compte : les sous-titres se calent
      // mot à mot sur ce fichier. Si elle bougeait, rien d'autre ne le dirait —
      // on le découvrirait au rendu, sur des sous-titres qui glissent.
      const { sonde: sondeFin } = await import('./lib/ffmpeg.mjs')
      const apres = await sondeFin(audioFinal)
      const derive = Math.abs(apres.dureeS - coupe.dureeMs / 1000)
      if (derive > 0.05) {
        journal.attention(
          `La conversion a changé la durée de ${derive.toFixed(2)} s. ` +
            `Le calage des sous-titres va s'en ressentir.`
        )
      } else {
        journal.detail(`Durée conservée à ${derive.toFixed(3)} s près.`)
      }
    } else {
      fs.copyFileSync(propre, audioFinal)
      journal.ok(`Voix conservée telle quelle, sans aucun traitement.`)
    }

    // La musique se pose en dernier, sur la voix définitive, et elle s'efface
    // automatiquement sous elle. Elle est optionnelle : sans fichier déclaré, la
    // vidéo sort en voix seule.
    const musique = chaine?.audio?.musique
      ? path.join(CHEMINS.racine, chaine.audio.musique)
      : null
    if (musique && fs.existsSync(musique)) {
      const { poseMusique } = await import('./lib/ffmpeg.mjs')
      const avecMusique = path.join(v.audio, '.musique.wav')
      await poseMusique(audioFinal, musique, avecMusique, {
        gainDb: chaine?.audio?.musique_gain_db ?? -16,
      })
      fs.renameSync(avecMusique, audioFinal)
      emploi.musique = path.basename(musique)
      journal.ok(`Musique posée sous la voix (${path.basename(musique)}), en atténuation automatique.`)
    } else if (chaine?.audio?.musique) {
      journal.attention(`Musique déclarée mais introuvable : ${chaine.audio.musique}`)
    }

    enregistreEmploi(slug, emploi)
  } else {
    journal.etape(3, 6, `voix finale déjà là (--depuis=voix pour la refaire)`)
  }

  const infoVoix = await sonde(audioFinal)
  const derive = Math.abs(infoVoix.dureeS * 1000 - coupe.dureeMs)
  if (derive > 500) {
    journal.attention(
      `La voix finale fait ${duree(infoVoix.dureeS)} pour ${duree(coupe.dureeMs / 1000)} d'image : ` +
        `${(derive / 1000).toFixed(2)} s d'écart. L'image se décalera en fin de vidéo.`
    )
  }

  // -- 4. transcription -----------------------------------------------------
  let transcript = litJson(v.transcript, null)
  if (force('transcris') || !transcript) {
    journal.etape(4, 6, 'transcription mot à mot de la voix finale')

    // ON TRANSCRIT CE QUI A ÉTÉ DIT, PAS CE QUI AVAIT ÉTÉ ÉCRIT.
    //
    // Forcer le texte du script sur l'audio ne marche que si la personne l'a
    // récité mot pour mot. Dès qu'elle s'en écarte — et il vaut mieux qu'elle
    // s'en écarte, ça sonne parlé — les mots divergents n'ont plus d'horodatage
    // propre : ils sont interpolés entre leurs voisins, et le sous-titre glisse
    // sur toute la suite. Le spectateur lit alors autre chose que ce qu'il entend.
    //
    // Le script garde son rôle : il structure les blocs et porte les événements
    // visuels. Mais le sous-titre dit ce que dit la voix.
    // LE MODÈLE DE TRANSCRIPTION SE CHOISIT DANS LA CONFIG DE LA CHAÎNE.
    //
    // Le défaut d'environnement était `medium`, et il PERD des mots : sur cette
    // vidéo il en a laissé quatre de côté, dont un groupe entier que la voix
    // prononce distinctement. Le sous-titre affichait alors une phrase à trous.
    // `large-v3-turbo` les récupère, et il est plus rapide que `medium` — il n'y
    // a donc aucun arbitrage à faire entre qualité et temps.
    const r = await transcris(audioFinal, {
      langue: chaine?.langue ?? 'fr',
      modele: modeleTranscription || chaine?.transcription?.modele || 'large-v3-turbo',
    })


    // DEUX OUTILS, DEUX RÔLES.
    //
    // La transcription libre donne les bons MOTS, mais ses horodatages sont
    // approximatifs : whisper date des segments, puis répartit les mots dedans.
    // À l'échelle d'un sous-titre mot à mot, ça se voit — le mot s'allume un peu
    // avant ou un peu après la voix.
    //
    // L'alignement forcé, lui, date chaque mot d'un texte CONNU à la milliseconde.
    // On lui donne donc le texte que whisper vient d'entendre, et on obtient les
    // bons mots ET les bons temps. Si l'alignement échoue, on garde whisper
    // plutôt que de perdre la vidéo.
    // La transcription confond régulièrement deux graphies qui sonnent pareil
    // — « la voir » entendu « l'avoir ». Le script porte la bonne, et on la lui
    // reprend UNIQUEMENT quand les deux versions ont le même squelette sonore.
    // Une divergence qui s'entend est une improvisation et reste intacte.
    const { mots: corriges, corrections } = corrigeParLeScript(
      r.mots,
      script.blocs.map((b) => b.texte).join(' ')
    )
    if (corrections.length) {
      journal.detail(
        `${corrections.length} homophone(s) corrigé(s) : ` +
          corrections.slice(0, 4).map((c) => `« ${c.entendu} » → « ${c.corrige} »`).join(', ') +
          (corrections.length > 4 ? '…' : '')
      )
    }

    let mots = corriges
    let mode = 'dit'
    try {
      const { aligneForce } = await import('./lib/elevenlabs.mjs')
      // On aligne le texte CORRIGÉ, pas celui sorti de whisper : sinon
      // l'alignement réintroduit les homophones qu'on vient d'écarter, puisque
      // c'est lui qui a le dernier mot sur la liste finale.
      const a = await aligneForce(audioFinal, corriges.map((m) => m.texte).join(' '))
      if (a.mots?.length) {
        mots = a.mots
        mode = 'dit, aligné à la milliseconde'
      }
    } catch (e) {
      journal.attention(
        `Alignement fin indisponible (${e.message.split('\n')[0]}). ` +
          `Les sous-titres gardent les temps de la transcription, un peu moins précis.`
      )
    }

    transcript = {
      fichier: path.relative(CHEMINS.racine, audioFinal),
      mode,
      langue: r.langue,
      modele: r.modele,
      genereLe: new Date().toISOString(),
      mots,
      texte: mots.map((m) => m.texte).join(' '),
    }
    ecritJson(v.transcript, transcript)
    journal.ok(`${transcript.mots.length} mots calés`)
  } else {
    journal.etape(4, 6, `transcription déjà là : ${transcript.mots.length} mots (--depuis=transcris pour la refaire)`)
  }

  // SANS SCRIPT, LA CHAÎNE S'ARRÊTE ICI — ET ELLE LE DIT.
  //
  // Les deux étapes qui suivent lisent les blocs : le calage place les
  // événements visuels sur les mots du script, le plan les assemble. Il n'y a
  // rien à en tirer sans texte écrit, et rien d'utile à inventer.
  //
  // Ce qui précède, en revanche, est fait et gardé : la voix est convertie, le
  // transcript est écrit. On sort en succès parce que le travail possible a été
  // fait ; `npm run etat` reste l'arbitre et montrera le plan manquant.
  if (!scriptEcrit) {
    journal.titre(`Voix et transcript · ${slug}`)
    journal.ok(`${transcript.mots.length} mots transcrits, calés sur l'audio final.`)
    journal.info(`Le montage attend le script — c'est la seule chose qui manque.`)
    journal.detail(`Il s'écrit en conversation : /script ${slug}`)
    console.log()
    return
  }

  // -- 5. calage des événements --------------------------------------------
  journal.etape(5, 6, 'calage des événements visuels')
  // LE MODE DE PRODUCTION SE LIT SUR LE RUSH, PAS SUR LE SCRIPT.
  //
  // Un fichier audio seul ne peut être qu'une voix off : la piste image se
  // construit alors entièrement en plans de coupe. Un fichier vidéo — capture
  // d'écran, face caméra — porte déjà son image, et la recouvrir de plans de
  // coupe reviendrait à cacher ce qu'on est venu montrer.
  //
  // Le script déclare un format avant le tournage : il peut se tromper. Le
  // fichier déposé, non. On le dit quand les deux divergent.
  const sondes = await Promise.all(prises.map((p) => sonde(p)))
  const sansCamera = !sondes.some((s) => s.aDeLaVideo)
  const formatDitFaceless = String(script.format ?? '').includes('faceless')
  if (sansCamera !== formatDitFaceless) {
    journal.attention(
      sansCamera
        ? `Le script annonce « ${script.format} » mais le rush n'a pas d'image : monté en voix off.`
        : `Le script annonce « ${script.format} » mais le rush porte une image : ` +
            `elle est conservée, aucun plan de coupe ne la recouvrira.`
    )
  }

  const evenements = M.caleEvenements(script, transcript.mots, { sansCamera })

  // Les plans de coupe demandés par le script sont cherchés et rapatriés ici :
  // ils doivent être sur le disque avant que Remotion ne les lise.
  const pubBroll = path.join(v.montage, 'public', 'broll')
  const { largeur: L, hauteur: H } = M.dimensionsDe(script.format)
  // COMBLER LES TROUS PAR L'IA — ET LE PLAFOND EST LE VRAI SUJET.
  //
  // Le nombre de trous n'est connu qu'APRÈS avoir interrogé la banque, plan par
  // plan : on ne peut donc pas chiffrer le devis avant de partir. Ce qu'on peut
  // borner, c'est le pire cas — et c'est ce qu'on approuve. Sans plafond, une
  // vidéo dont la banque rate vingt requêtes coûterait 3,60 $ sans qu'on l'ait
  // dit une seule fois, ce que le §7 interdit.
  // LE MODÈLE SE CHOISIT AU MOMENT DE GÉNÉRER, PAS SEULEMENT DANS L'IDENTITÉ.
  //
  // Celui de la chaîne est un défaut ; l'essai, lui, se fait sur UNE vidéo. On
  // veut pouvoir refaire un plan d'ouverture avec un modèle plus cher sans
  // basculer toute la chaîne dessus — et voir le prix avant, puisqu'il va de
  // 0,04 $ à 2,36 $ le plan.
  if (options['modele-video'] && options['modele-video'] !== true) {
    const { MODELES_PLAN } = await import('./lib/fal.mjs')
    const id = String(options['modele-video'])
    if (!MODELES_PLAN[id]) {
      throw new Error(
        `Modèle vidéo inconnu : « ${id} ».
  Connus : ${Object.keys(MODELES_PLAN).join(', ')}`
      )
    }
    // On le pose dans la carte lue par le reste du montage : `modeleDePlan()`
    // regarde `identite_visuelle.modele_video`, et c'est le seul chemin.
    chaine.identite_visuelle = { ...(chaine.identite_visuelle ?? {}), modele_video: id }
    journal.detail(`modèle vidéo pour ce montage : ${id}`)
  }

  // UN BUDGET, DEUX FAÇONS DE LE DÉPENSER.
  //
  // `--comble=ia` RÉAGIT : il ne se déclenche que sur le vide laissé par la
  // banque. `--plans-ia=<n>` CHOISIT : le script est lu en entier, et le budget
  // va d'abord aux passages qu'une banque d'images ne peut pas servir — un
  // mécanisme abstrait, un chiffre précis, une émotion nommée. Ce qui reste
  // comble les trous, comme avant.
  //
  // Les deux partagent le même plafond, parce que c'est le même argent : deux
  // budgets séparés auraient fait approuver un devis et en payer un autre.
  const plansIa = Math.max(0, Math.min(30, nombre(options, 'plans-ia', 0)))
  const comble = options.comble === 'ia' || plansIa > 0 ? 'ia' : null
  const combleMax = plansIa > 0
    ? plansIa
    : comble ? Math.max(0, Math.min(30, nombre(options, 'comble-max', 3))) : 0
  // LE PRIX D'UN PLAN GÉNÉRÉ N'EST PAS UN NOMBRE, C'EST UNE FONCTION DU MODÈLE.
  //
  // Il était écrit 0,18 $ en dur, ici et vingt lignes plus bas. C'était le tarif
  // d'un modèle qui n'est plus au catalogue, et il est faux des quatre qui y
  // sont : le plan de cinq secondes va de 0,04 $ (LTX) à 2,36 $ (Seedance 2.5).
  // Un devis figé annonce donc jusqu'à soixante fois trop peu, ce que le §7
  // interdit. L'option --modele-video est déjà appliquée à `chaine` au-dessus.
  const { modeleDePlan, coutDUnPlan, MODELES_PLAN: CATALOGUE } = await import('./lib/fal.mjs')
  const modelePlan = modeleDePlan(chaine)
  const prixDUnPlan = coutDUnPlan(modelePlan, 5)
  if (comble) {
    journal.attention(
      `Plans générés : jusqu'à ${combleMax}, soit ${(combleMax * prixDUnPlan).toFixed(2)} $ au ` +
        `maximum avec ${CATALOGUE[modelePlan]?.nom ?? modelePlan}. ` +
        (plansIa > 0
          ? `Ils iront là où le script dit que la banque ne peut rien.`
          : `Ils ne serviront que là où la banque ne rend rien.`) +
        ` Le journal dira combien ont servi.`
    )
  }
  // LES PLANS DU MONTAGE PRÉCÉDENT, lus AVANT que le plan soit réécrit :
  // après, ils n'existent plus. Ils servent à deux choses — les écarter quand
  // on demande à en changer, et DIRE ensuite ce qui a bougé.
  const evenementsDAvant = (litJson(v.plan, null)?.evenements ?? []).filter(
    (e) => e.type === 'broll' && e._mediaId
  )
  const plansDAvant = evenementsDAvant.map((e) => e._mediaId)
  const dejaEmployes = drapeau(options, 'refais-plans') ? plansDAvant : []

  // UN PLAN CHOISI À LA MAIN EST DU TRAVAIL HUMAIN. UN REMONTAGE NE L'EFFACE PAS.
  //
  // Le 8 septembre 2026, un remontage a écrasé sept plans échangés un par un
  // dans l'écran — le travail d'une soirée, refait par la banque en deux
  // minutes. Le §6 protège les rushes et les rendus ; un plan qu'on a regardé,
  // refusé, remplacé et validé n'est pas moins du travail.
  //
  // `_essais` les désigne sans ambiguïté : il n'est posé que par
  // `remplaceUnPlan`, jamais par la banque. On les garde par défaut, et
  // `--refais-plans` — « reprendre des plans différents », qui demande
  // explicitement que tout change — est le seul moyen de les lâcher.
  //
  // ILS SONT ÉCARTÉS DE LA RECHERCHE AVANT D'ÊTRE REMIS : sans ça, la banque
  // pourrait reposer le même média ailleurs, et le rendre en doublon.
  const aGarder = drapeau(options, 'refais-plans')
    ? []
    : evenementsDAvant.filter(
        (e) => e._essais && e.src && fs.existsSync(path.join(v.montage, 'public', e.src))
      )
  // LA REQUÊTE RÉÉCRITE SURVIT MÊME À « REPRENDRE DES PLANS DIFFÉRENTS ».
  //
  // Les deux demandes ne sont pas la même : « un autre plan » veut une autre
  // image POUR CETTE RECHERCHE-LÀ ; oublier la recherche renverrait chercher
  // la scène qu'on venait justement de corriger. La requête est du travail
  // d'écriture, le plan est un choix d'image — on peut lâcher l'un sans
  // l'autre.
  const requetesAMoi = evenementsDAvant.filter((e) => e._requeteAMoi && e.requete)
  if (requetesAMoi.length && drapeau(options, 'refais-plans')) {
    journal.info(`${requetesAMoi.length} requête(s) réécrite(s) à la main sont conservées.`)
  }

  if (aGarder.length) {
    journal.info(
      `${aGarder.length} plan(s) choisis à la main seront conservés ` +
        `(--refais-plans pour les reprendre aussi).`
    )
  }

  // COMBIEN DE MONTAGES RÉCENTS ÉCARTENT LEURS PLANS.
  //
  // Dix par défaut (§10). Zéro les autorise tous : c'est le bon réglage quand
  // la niche est étroite et que la banque rend toujours les mêmes candidats —
  // écarter les meilleurs laisse les suivants, moins justes, et on se prive
  // d'un plan qui allait bien pour éviter une répétition qui ne se verrait
  // pas. C'est un arbitrage : il se décide, il ne se subit pas.
  const fenetreVoulue = options['fenetre-reemploi']
  let fenetreReemploi = FENETRE_REEMPLOI
  if (fenetreVoulue !== undefined) {
    const n = Number(fenetreVoulue)
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw new Error(`--fenetre-reemploi attend un entier de 0 à 100, pas « ${fenetreVoulue} ».`)
    }
    fenetreReemploi = n
  }
  if (dejaEmployes.length) {
    journal.info(`${dejaEmployes.length} plan(s) déjà employés par cette vidéo seront écartés.`)
  }

  // OÙ LA GÉNÉRATION SERT LE PLUS — LU DANS LE SCRIPT, AVANT DE DÉPENSER.
  //
  // Un plan seul ne dit pas s'il est hors sujet ; le script entier dit quels
  // passages une banque d'images ne peut pas servir. La lecture coûte moins
  // d'un centime et ne génère rien : elle rend une liste de plans et une
  // requête réécrite pour chacun. Sans cerveau joignable, on retombe sur le
  // comblage — et on le dit.
  let choixIa = new Map()
  if (plansIa > 0) {
    journal.info(`Lecture du script pour placer les ${plansIa} plan(s) générés…`)
    const { choisitLesPlansAGenerer } = await import('./lib/choix-ia.mjs')
    const r = await choisitLesPlansAGenerer(evenements, {
      budget: plansIa,
      script,
      mots: transcript.mots,
    })
    choixIa = r.choix
  }

  // LES REQUÊTES RÉÉCRITES SE POSENT AVANT LA RECHERCHE, PAS APRÈS.
  //
  // Posées après, l'image serait venue de la requête du script et le plan
  // porterait la nôtre : deux choses qui ne se correspondent plus, et un
  // champ qui décrit autre chose que ce qu'on regarde.
  for (const ancien of requetesAMoi) {
    const cible = evenements.find((e) => e.type === 'broll' && e.debutMs === ancien.debutMs)
    if (!cible) continue
    cible.requete = ancien.requete
    cible._requeteAMoi = true
  }

  const broll = await resoudBroll(evenements, {
    largeur: L,
    hauteur: H,
    dossier: pubBroll,
    direction: chaine?.identite_visuelle?.direction_plans ?? null,
    comble,
    combleMax,
    aGenerer: choixIa,
    blocs: script?.blocs ?? [],
    exclus: [...dejaEmployes, ...aGarder.map((e) => e._mediaId)],
    fenetreReemploi,
    // CELUI QU'ON VIENT D'ANNONCER, PAS CELUI DU FICHIER. `--modele-video=` est
    // posé dans `chaine` en mémoire vingt lignes plus haut ; sans ce passage,
    // la génération relisait `config/chaine.json` et employait le modèle de la
    // chaîne — on payait le prix affiché pour un autre modèle.
    modele: modelePlan,
  })
  if (broll.combles) {
    journal.ok(
      `${broll.combles} plan(s) générés sur ${combleMax} autorisé(s) — ` +
        `${(broll.combles * prixDUnPlan).toFixed(2)} $ dépensés. ` +
        `Le budget non employé n'est pas facturé.`
    )
  }

  // « C'EST EXACTEMENT LES MÊMES QU'AVANT » : ON LE DIT, ET ON DIT QUOI FAIRE.
  //
  // `plansEmployesRecemment` exclut le slug COURANT — à raison : remonter pour
  // changer une taille de sous-titres ne doit pas faire valser la piste image.
  // Conséquence : à requêtes identiques, la banque rend ses candidats dans le
  // même ordre, et un remontage redonne le même plan. C'est correct, et c'est
  // illisible : rien ne distinguait « ça n'a pas changé » de « le bouton n'a
  // rien fait », ni de « l'aperçu ne se met pas à jour ».
  //
  // Le compte tranche, et il ne coûte rien : les identifiants d'avant sont
  // déjà lus.
  // ON REND LEURS PLANS AUX RANGS CHOISIS À LA MAIN.
  //
  // Par l'INSTANT, pas par le rang : le découpage est le même tant que le
  // transcript et le script ne bougent pas, mais s'il changeait, un rang
  // poserait le plan sur un autre passage — silencieusement.
  if (aGarder.length) {
    let rendus = 0
    for (const ancien of aGarder) {
      const cible = evenements.find((e) => e.type === 'broll' && e.debutMs === ancien.debutMs)
      if (!cible) continue
      // LE CRÉDIT SUIT LE FICHIER. `resoudBroll` a écrit celui de SON candidat
      // pour ce rang ; le garder afficherait l'auteur d'un plan qu'on ne montre
      // pas, et une licence CC-BY n'est pas une formalité (§10).
      const remplace = cible.src
      const numero = String(ancien._mediaId).match(/\/(\d{5,})\//)?.[1]
      const credit = [
        ancien.src.replace(/^broll\//, ''),
        ancien._auteur ? `par ${ancien._auteur}` : null,
        numero ? `https://www.pexels.com/video/${numero}/` : ancien._mediaId,
      ].filter(Boolean).join(' — ')
      const rang = broll.attributions.findIndex((l) =>
        String(l).startsWith(String(remplace ?? '').replace(/^broll\//, '') + ' ')
      )
      if (rang >= 0) broll.attributions[rang] = credit
      else broll.attributions.push(credit)
      cible.src = ancien.src
      cible._mediaId = ancien._mediaId
      cible._auteur = ancien._auteur ?? null
      cible._essais = ancien._essais
      cible.source = ancien.source ?? 'pexels'
      cible.ken = ancien.ken ?? false
      // LA REQUÊTE RÉÉCRITE À LA MAIN EST DU TRAVAIL, ELLE AUSSI.
      // Sans elle, la reconstruction depuis le script remettrait celle du
      // modèle, et le prochain « un autre » repartirait chercher la mauvaise
      // scène — celle qu'on venait justement de corriger.
      if (ancien._requeteAMoi) {
        cible.requete = ancien.requete
        cible._requeteAMoi = true
      }
      rendus++
    }
    journal.ok(`${rendus} plan(s) choisis à la main conservés.`)
    if (rendus < aGarder.length) {
      journal.attention(
        `${aGarder.length - rendus} n'ont pas retrouvé leur passage : le découpage a changé.`
      )
    }
  }

  // DEUX FOIS LE MÊME PLAN DANS UNE VIDÉO : ON LE COMPTE, ET ON LE DIT.
  //
  // La déduplication existe à trois endroits — dans la vidéo, entre vidéos, et
  // à l'échange à la main. Elle a été muette pendant qu'un défaut de clé la
  // rendait inopérante à l'échange : le plan sortait avec des doublons et rien
  // ne l'annonçait. Une ligne qui affirme le contraire quand tout va bien
  // aurait montré le défaut le premier jour.
  {
    const cles = evenements
      .filter((e) => e.type === 'broll' && e._mediaId)
      .map((e) => cleDeMedia(e._mediaId))
    const compte = new Map()
    for (const k of cles) compte.set(k, (compte.get(k) ?? 0) + 1)
    const doublons = [...compte.values()].filter((n) => n > 1).length
    if (doublons) {
      journal.attention(
        `${doublons} média(s) employé(s) plusieurs fois dans cette vidéo — ` +
          `un plan qui revient se lit comme une redite.`
      )
    } else if (cles.length) {
      journal.detail(`${cles.length} plans, ${compte.size} médias distincts : aucun doublon.`)
    }
  }

  if (plansDAvant.length) {
    const apres = evenements.filter((e) => e.type === 'broll' && e._mediaId).map((e) => e._mediaId)
    const avant = new Set(plansDAvant)
    const nouveaux = apres.filter((id) => !avant.has(id)).length
    if (nouveaux) {
      journal.ok(`${nouveaux} plan(s) sur ${apres.length} diffèrent du montage précédent.`)
    } else {
      journal.attention(`Aucun plan ne change : la banque a rendu les mêmes candidats.`)
      journal.detail(
        drapeau(options, 'refais-plans')
          ? `Ils étaient pourtant écartés : la banque n'a rien d'autre à proposer sur ces requêtes.`
          : `« Reprendre des plans différents » les écarte — ` +
            `au terminal, --refais-plans.`
      )
    }
  }
  // UN PLAN DE COUPE SANS FICHIER N'ENTRE PAS DANS LE PLAN.
  //
  // La resolution ne traite que les evenements qui portent une requete. Un
  // evenement dont le fichier est fourni a la main, puis duplique par une
  // decoupe de phrase, produit des copies sans `src` ET sans requete : elles
  // traversaient tout le pipeline pour faire echouer le rendu a la premiere
  // image concernee, apres plusieurs minutes de calcul.
  const sansFichier = evenements.filter((e) => e.type === 'broll' && !e._aRetirer && !e.src)
  if (sansFichier.length) {
    journal.attention(
      `${sansFichier.length} plan(s) de coupe sans fichier retire(s) du plan — ` +
        `duplication d'un plan fourni a la main, sans requete pour le remplacer.`
    )
    for (const e of sansFichier) e._aRetirer = true
  }

  const retenus = evenements.filter((e) => !e._aRetirer)

  // LA COUVERTURE SE REVÉRIFIE APRÈS LE RAPATRIEMENT, pas seulement avant.
  //
  // Le garde-fou « l'écran n'est jamais nu » tourne dans caleEvenements — mais
  // resoudBroll passe APRÈS lui, et peut retirer un plan dont la banque n'a
  // rien rendu. Le trou qu'il laisse échappait alors à toute vérification. On
  // rétend donc chaque plan jusqu'à l'entrée du suivant une fois la liste
  // définitive connue : c'est le même geste, au seul moment où il est fiable.
  if (sansCamera) {
    const brolls = retenus.filter((e) => e.type === 'broll').sort((a, b) => a.debutMs - b.debutMs)
    for (const [i, e] of brolls.entries()) {
      const suivant = brolls[i + 1]
      if (suivant && e.debutMs + e.dureeMs < suivant.debutMs) {
        e.dureeMs = suivant.debutMs - e.debutMs
      }
    }
  }

  // La durée réelle de chaque plan animé, mesurée sur le fichier. Sans elle, le
  // rendu ne peut pas savoir qu'un clip est plus court que son créneau, et il le
  // fige sur sa dernière image au lieu de le ralentir.
  for (const e of retenus) {
    if (e.type !== 'broll' || !e.src || !/\.(mp4|mov|webm|mkv)$/i.test(e.src)) continue
    const chemin = path.join(v.montage, 'public', e.src)
    if (!fs.existsSync(chemin)) continue
    const info = await sonde(chemin)
    e.dureeSourceMs = Math.round(info.dureeS * 1000)
  }
  const etires = retenus.filter((e) => e.dureeSourceMs && e.dureeSourceMs < e.dureeMs)
  if (etires.length) {
    journal.detail(
      `${etires.length} plan(s) animés ralentis pour tenir leur créneau sans se figer.`
    )
  }
  if (broll.resolus || broll.abandonnes) {
    journal.detail(`plans de coupe : ${broll.resolus} rapatriés, ${broll.abandonnes} abandonnés`)
  }
  journal.ok(`${retenus.length} événements placés`)

  // -- 6. plan --------------------------------------------------------------
  journal.etape(6, 6, 'piste image et plan')
  const pub = M.dossierPublic(v.montage)
  const { largeur, hauteur } = M.dimensionsDe(script.format)

  const cheminImage = path.join(pub, 'image.mp4')
  if (force('plan') || !fs.existsSync(cheminImage) || force('coupe')) {
    const img = await M.fabriqueImage(coupe.aGarder, cheminImage, {
      largeur,
      hauteur,
      fond: chaine?.identite_visuelle?.couleur_fond ?? '#000000',
    })
    journal.detail(
      `piste image ${largeur}×${hauteur} · ${duree(img.dureeMs / 1000)} · ` +
        `${img.nvenc ? 'encodée sur GPU' : 'encodée sur processeur'}`
    )
  }
  const infoImage = await sonde(cheminImage)
  M.deposeDansPublic(audioFinal, pub, 'voix.wav')

  const { plan, creux } = M.construisPlan({
    script,
    chaine,
    mots: transcript.mots,
    aGarder: coupe.aGarder,
    dureeMs: coupe.dureeMs,
    evenements: retenus,
    piste: { src: 'image.mp4', dureeMs: Math.round(infoImage.dureeS * 1000) },
    voixSrc: 'voix.wav',
    musique: null,
    dossierPublic: pub,
  })
  ecritJson(v.plan, plan)

  // L'OUVERTURE GÉNÉRÉE, QUAND ON LE DEMANDE — ET SEULEMENT ELLE.
  //
  // La banque rate souvent l'émotion précise qu'un premier plan réclame (§10) :
  // le détecteur trouve un visage, pas ce qu'il porte. La génération, elle,
  // reçoit l'intention du bloc et demande un gros plan de visage avec l'émotion
  // lisible. Ça se paie — un plan, au tarif du modèle retenu — donc ça se
  // demande : `--ouverture=ia` au terminal, une case dans l'atelier, et le prix
  // avant de partir. Les trente plans suivants restent en banque : trente
  // portraits générés d'affilée sont un diaporama, et trente plans une facture.
  if (options.ouverture === 'ia') {
    journal.info(
      `Ouverture générée par IA — ${prixDUnPlan.toFixed(2)} $ avec ` +
        `${CATALOGUE[modelePlan]?.nom ?? modelePlan}…`
    )
    const r = await remplaceUnPlan(slug, 1, {
      source: 'ia',
      direction: chaine?.identite_visuelle?.direction_plans ?? null,
      // Celui qu'on vient d'annoncer sur la ligne du dessus.
      modele: modelePlan,
    })
    journal.ok(`Plan d'ouverture : ${r.apres}`)
  }

  if (broll.attributions.length) {
    // Les licences CC-BY exigent l'attribution : elle doit se retrouver dans la
    // description de la vidéo, pas seulement à côté du fichier.
    ecritJson(path.join(v.montage, 'attributions.json'), broll.attributions)
    journal.detail(`${broll.attributions.length} attributions à reporter en description`)
  }

  // ------------------------------------------------------------- rapport ---
  journal.titre('Plan de montage')
  const secondes = plan.dureeFrames / plan.fps
  journal.info(
    `${duree(secondes)} · ${plan.largeur}×${plan.hauteur} · ${plan.coupes.length} plans · ` +
      `${plan.evenements.length} événements · ${plan.mots.length} mots`
  )

  const cible = script.duree_cible_s
  if (cible) {
    const ecart = Math.round(((secondes - cible) / cible) * 100)
    if (Math.abs(ecart) > 25) {
      journal.attention(
        `${Math.abs(ecart)} % ${ecart > 0 ? 'plus longue' : 'plus courte'} que la cible ` +
          `(${duree(cible)}). Ce n'est pas bloquant, mais le format en souffre.`
      )
    }
  }

  const parType = {}
  for (const e of plan.evenements) parType[e.type] = (parType[e.type] ?? 0) + 1
  journal.detail(
    Object.entries(parType)
      .map(([t, n]) => `${t} ×${n}`)
      .join(' · ') || 'aucun événement visuel'
  )

  const densite = plan.evenements.length / Math.max(secondes, 1)
  if (densite < 0.2) {
    journal.attention(
      `Un événement toutes les ${Math.round(1 / densite)} s en moyenne. ` +
        `La doctrine vise un toutes les 2 à 4 s : l'image va sembler figée.`
    )
  }

  if (creux.length) {
    journal.attention(`${creux.length} passage(s) où rien ne bouge plus de 4 s :`)
    for (const c of creux.slice(0, 6)) {
      journal.detail(`  à ${duree(c.debutMs / 1000)} — ${(c.ecartMs / 1000).toFixed(1)} s sans rien`)
    }
    journal.detail(`Ajoute des événements visuels dans le script à ces endroits, puis --depuis=cale.`)
  }

  console.log('')
  journal.detail(`Aperçu : npm run studio -- ${slug}`)
  journal.detail(`Rendu  : npm run rends -- ${slug}`)
})

/** Contrôles de conformité du script. Un message qui dit quoi corriger. */
function verifieScript(script, slug) {
  const erreurs = []
  if (script.slug !== slug) erreurs.push(`"slug" vaut "${script.slug}" au lieu de "${slug}"`)
  if (!Array.isArray(script.blocs) || script.blocs.length === 0) erreurs.push(`aucun bloc`)

  const ids = new Set()
  for (const b of script.blocs ?? []) {
    if (!b.id) erreurs.push(`un bloc n'a pas d'identifiant`)
    else if (ids.has(b.id)) erreurs.push(`identifiant de bloc en double : "${b.id}"`)
    ids.add(b.id)
    if (!b.texte?.trim()) erreurs.push(`le bloc "${b.id}" n'a pas de texte`)

    for (const visuel of b.visuel ?? []) {
      if (visuel.ancre && !b.texte.includes(visuel.ancre)) {
        erreurs.push(
          `l'ancre « ${visuel.ancre} » du bloc "${b.id}" n'apparaît pas dans son texte`
        )
      }
    }
  }
  const hooks = (script.blocs ?? []).filter((b) => b.role === 'hook').length
  if (hooks !== 1) erreurs.push(`${hooks} bloc(s) de rôle "hook" — il en faut exactement un`)

  if (erreurs.length) {
    throw new Error(
      `Le script n'est pas conforme :\n  - ` +
        erreurs.join('\n  - ') +
        `\n\nFormat attendu : .claude/skills/ecriture-script/references/format-script.md`
    )
  }
}
