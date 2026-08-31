#!/usr/bin/env node
/**
 * choix-voix.mjs — choisir la voix d'une vidéo, avant de la monter.
 *
 * Le catalogue ElevenLabs se lit ici, et le choix s'enregistre par vidéo. C'est
 * la commande que l'onglet « voix » de l'interface appelle : le navigateur ne
 * parle jamais à ElevenLabs directement, il n'a pas les clés et n'en aura pas.
 *
 * POURQUOI PAR VIDÉO, ET AU MOMENT DE DÉPOSER LA PRISE.
 *
 * Une voix ne se juge pas sur son nom ni sur un extrait de démonstration : elle
 * se juge contre la prise qu'on vient d'enregistrer. Fixer le timbre une fois
 * pour toute la chaîne oblige à re-convertir — donc à repayer — dès qu'il ne
 * tient pas. Choisir au dépôt du rush coûte dix secondes et se corrige.
 *
 *   node outils/choix-voix.mjs --catalogue
 *   node outils/choix-voix.mjs --catalogue --genre=female --json
 *   node outils/choix-voix.mjs mon-slug
 *   node outils/choix-voix.mjs mon-slug --voix=EXAVITQu4vr4xnSDxMaL
 *   node outils/choix-voix.mjs mon-slug --oublie
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, dossierVideo, ecritJson, litJson, assureDossier } from '../pipeline/lib/chemins.mjs'
import { journal } from '../pipeline/lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from '../pipeline/lib/args.mjs'
import { avecCle } from '../pipeline/lib/trousseau.mjs'
import {
  voix as listeVoix,
  voixPartagees,
  ajouteUneVoixPartagee,
  changeDeVoix,
  retireUneVoix,
  AGES,
  TONS,
  USAGES,
} from '../pipeline/lib/elevenlabs.mjs'
import { choixDe, enregistreChoix, oublieChoix, voixPour, reglagesDeVoix } from '../pipeline/lib/choix-voix.mjs'
import { decoupe, sonde } from '../pipeline/lib/ffmpeg.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
node outils/choix-voix.mjs [slug] [options]

  --catalogue           les voix du COMPTE (26 : 21 d'origine + les ajoutées)
  --partagees           la BIBLIOTHÈQUE d'ElevenLabs — des milliers de voix
    --page=0              la bibliothèque se lit par pages de 100
    --genre=female        male · female · neutral
    --age=young           young · middle_aged · old
    --ton=calm            le ton de la voix — --ton=? pour la liste
    --usage=<u>           narrative_story · conversational · social_media ·
                          informative_educational · advertisement ·
                          entertainment_tv · characters_animation
    --langue=fr           ne garde que cette langue
    --categorie=<c>       professional · generated · high_quality · famous
    --tri=<t>             trending · cloned_by_count · usage_character_count_1y
                          · created_date
    --cherche=<mot>       filtre sur le nom

  --genre, --age, --langue et --cherche valent aussi pour --catalogue, où le
  filtrage se fait localement — le compte tient en une seule requête.
  --voix=<identifiant>  enregistre cette voix pour la vidéo
    --stabilite= / --similarite=   gardés avec la voix, et employés par le
                          montage — sans eux : 0.5 et 0.8
    --proprietaire=<id>   pour une voix de la bibliothèque : elle est d'abord
                          ajoutée au compte, sans quoi la conversion la refuse
  --defaut              enregistre --voix comme défaut de la CHAÎNE
  --essai               convertit 5 s de la prise avec --voix, pour écouter
    --secondes=5          longueur de l'essai
    --depuis=0            où le prendre dans la prise, en secondes
    --stabilite=0.5       0 = très expressif et instable, 1 = très plat
    --similarite=0.8      fidélité au timbre cible
    --proprietaire=<id>   pour une voix de la bibliothèque : elle est empruntée
                          au compte le temps de l'essai, puis rendue
  --oublie              efface le choix : la vidéo repart sur le défaut
  --json                sortie machine, pour l'interface

Sans option, affiche la voix retenue pour la vidéo et d'où elle vient.
`
)

const enJson = drapeau(options, 'json')

/**
 * Le catalogue, filtré, avec l'extrait d'écoute que rend ElevenLabs.
 *
 * Chaque lecture réussie est mise en cache. Sans lui, un identifiant de voix
 * reste un identifiant : `O31r762Gb3WFygrEOGh0` ne dit rien, « Victoire » dit
 * tout — et on ne va pas interroger ElevenLabs à chaque affichage d'une page
 * pour retrouver un nom qui ne change jamais.
 */
/** Une option de ligne de commande, en minuscules, ou `null` si absente. */
function texte(nom) {
  const v = options[nom]
  return v && v !== true ? String(v).toLowerCase().trim() || null : null
}

async function catalogue() {
  const brut = await avecCle('elevenlabs', (cle) => listeVoix(cle))
  try {
    ecritJson(path.join(CHEMINS.config, '.voix-catalogue.json'), {
      lu_le: new Date().toISOString(),
      voix: brut,
    })
  } catch {
    // Un cache qui ne s'écrit pas ne doit jamais empêcher de choisir une voix.
  }

  const genre = texte('genre')
  const langue = texte('langue')
  const cherche = texte('cherche')
  // Le même vocabulaire des deux côtés : les voix du compte portent parfois
  // « middle aged » avec une espace là où la bibliothèque écrit « middle_aged ».
  // Sans cette normalisation, le même filtre rendrait deux résultats différents
  // selon le fonds interrogé, ce qui se lit comme une panne.
  const age = texte('age')?.replace(/[\s-]+/g, '_') ?? null
  if (age && !AGES.includes(age)) {
    throw new Error(`Âge « ${options.age} » inconnu. Attendu : ${AGES.join(', ')}.`)
  }

  const filtrees = brut.filter((v) => {
    if (genre && String(v.genre ?? '').toLowerCase() !== genre) return false
    if (age && String(v.age ?? '').toLowerCase().replace(/[\s-]+/g, '_') !== age) return false
    if (langue && String(v.langue ?? '').toLowerCase() !== langue) return false
    if (cherche && !String(v.nom ?? '').toLowerCase().includes(cherche)) return false
    return true
  })

  // Les voix du compte d'abord, les « premade » ensuite : une voix clonée ou
  // achetée est presque toujours celle qu'on cherche, et se noierait au milieu
  // des cent voix par défaut.
  const rang = (c) => (c === 'cloned' ? 0 : c === 'generated' ? 1 : c === 'professional' ? 2 : 3)
  return filtrees.sort((a, b) => rang(a.categorie) - rang(b.categorie) || String(a.nom).localeCompare(String(b.nom)))
}

await principal(async () => {
  // ------------------------------------------------------------ catalogue --
  if (drapeau(options, 'catalogue')) {
    const v = await catalogue()
    if (enJson) {
      console.log(JSON.stringify({ voix: v }, null, 2))
      return
    }
    journal.titre(`${v.length} voix accessibles`)
    for (const x of v) {
      console.log(
        `  ${x.id}  ${(x.nom ?? '').padEnd(22)} ${(x.genre ?? '').padEnd(8)} ` +
          `${(x.age ?? '').padEnd(12)} ${(x.langue ?? '').padEnd(6)} ${x.categorie ?? ''}`
      )
    }
    console.log('')
    journal.detail(`Retiens-en une : node outils/choix-voix.mjs <slug> --voix=<identifiant>`)
    return
  }

  // ------------------------------------------- la bibliothèque partagée ----
  //
  // POURQUOI CE N'EST PAS DANS `--catalogue`.
  //
  // `--catalogue` interroge `/v1/voices`, qui ne rend que ce que le COMPTE
  // possède : les vingt-et-une voix livrées avec ElevenLabs plus celles qu'on a
  // ajoutées. Vingt-six en tout, et la sélection paraît vite étroite quand on
  // cherche un timbre précis.
  //
  // Le reste vit dans `/v1/shared-voices` — des milliers de voix publiées par
  // d'autres comptes. Elles ne s'emploient pas telles quelles : il faut d'abord
  // les ajouter à sa bibliothèque, ce que fait `--voix= --proprietaire=`.
  // La liste des tons n'est documentée nulle part chez ElevenLabs, et une
  // valeur inconnue rend zéro voix sans dire pourquoi. On la donne donc.
  if (options.ton === '?' || options.usage === '?') {
    if (options.ton === '?') {
      journal.titre('Les tons de voix')
      console.log('  ' + TONS.join('  '))
    }
    if (options.usage === '?') {
      journal.titre('Les usages')
      console.log('  ' + USAGES.join('  '))
    }
    return
  }

  if (drapeau(options, 'partagees')) {
    const d = await avecCle('elevenlabs', (cle) =>
      voixPartagees(cle, {
        langue: texte('langue'),
        genre: texte('genre'),
        ton: texte('ton'),
        usage: texte('usage'),
        // « middle aged » et « middle-aged » sont les deux fautes naturelles.
        // L'API, elle, répond 200 avec zéro voix sur un âge qu'elle ne connaît
        // pas : sans normalisation ni contrôle, la faute passerait pour un
        // catalogue vide.
        age: texte('age')?.replace(/[\s-]+/g, '_') ?? null,
        categorie: texte('categorie'),
        tri: texte('tri'),
        cherche: texte('cherche'),
        page: Math.max(0, Number(options.page) || 0),
      })
    )
    if (enJson) {
      console.log(JSON.stringify(d, null, 2))
      return
    }
    journal.titre(`${d.voix.length} voix de la bibliothèque${d.encore ? " (il y en a d'autres : --page=1)" : ''}`)
    for (const x of d.voix) {
      console.log(
        `  ${x.id}  ${(x.nom ?? '').slice(0, 26).padEnd(27)} ${(x.genre ?? '').padEnd(7)} ` +
          `${(x.age ?? '').padEnd(12)} ${(x.descriptif ?? '').padEnd(12)} ${(x.langue ?? '').padEnd(4)} ` +
          `${String(x.reprises).padStart(5)} reprises${x.aMoi ? '  · déjà à toi' : ''}`
      )
    }
    console.log('')
    journal.detail(
      `Pour en retenir une : node outils/choix-voix.mjs <slug> --voix=<id> --proprietaire=<id du propriétaire>`
    )
    journal.detail(`Le propriétaire est dans la sortie --json ; l'ajout au compte est gratuit.`)
    return
  }

  // ------------------------------------------------ défaut de la chaîne ----
  // Fixer un défaut n'annule pas le choix par vidéo : il le précède. Les quatre
  // niveaux de §8 restent dans leur ordre, ceci ne touche que le troisième.
  if (drapeau(options, 'defaut')) {
    if (!options.voix || options.voix === true) {
      throw new Error(`Donne la voix à retenir : --defaut --voix=<identifiant>`)
    }
    const id = String(options.voix)
    const connue = (await catalogue().catch(() => [])).find((x) => x.id === id) ?? null
    if (!connue && !drapeau(options, 'force')) {
      throw new Error(`Aucune voix « ${id} » sur ce compte. --catalogue pour voir, --force pour passer outre.`)
    }
    const cheminChaine = path.join(CHEMINS.config, 'chaine.json')
    const chaine = litJson(cheminChaine, {})
    chaine.voix = { ...(chaine.voix ?? {}), elevenlabs_voice_id: id, elevenlabs_voice_nom: connue?.nom ?? null }
    ecritJson(cheminChaine, chaine)
    if (enJson) {
      console.log(JSON.stringify({ ok: true, defaut: chaine.voix }, null, 2))
      return
    }
    journal.ok(`Défaut de la chaîne : ${connue?.nom ? `« ${connue.nom} »` : id}.`)
    journal.detail(`Les prochaines vidéos partiront dessus, sauf choix contraire.`)
    return
  }

  // ------------------------------------------------------- choix par vidéo --
  const slug = positionnels[0]
  if (!slug) {
    throw new Error(
      `Donne le slug de la vidéo, ou --catalogue pour lister les voix disponibles.`
    )
  }
  const v = dossierVideo(slug)
  if (!fs.existsSync(v.base)) {
    throw new Error(`Aucune vidéo « ${slug} » dans ${path.relative(CHEMINS.racine, CHEMINS.videos)}.`)
  }

  // ---------------------------------------------------------------- essai --
  //
  // POURQUOI SUR LA VRAIE PRISE, ET PAS SUR L'EXTRAIT DU CATALOGUE.
  //
  // L'extrait que rend ElevenLabs est une phrase lue par un comédien : il dit
  // le timbre, pas le résultat. Le speech-to-speech ne fabrique pas une voix,
  // il en transporte une — le débit, les respirations et les hésitations de la
  // prise passent entiers. Deux voix qui se ressemblent au catalogue peuvent
  // rendre très différemment sur la même prise, et c'est exactement ce qu'on
  // cherche à entendre avant de payer la conversion entière.
  //
  // Cinq secondes coûtent environ 85 crédits, contre 2 000 pour deux minutes.
  if (drapeau(options, 'essai')) {
    if (!options.voix || options.voix === true) {
      throw new Error(`Donne la voix à essayer : --essai --voix=<identifiant>`)
    }
    const id = String(options.voix)
    const secondes = Math.min(30, Math.max(2, Number(options.secondes ?? 5)))
    const depuis = Math.max(0, Number(options.depuis ?? 0))
    // L'ESSAI PART DU RÉGLAGE DÉJÀ RETENU, PAS D'UN DÉFAUT.
    //
    // Sans ça, revenir écouter une voix qu'on avait réglée à 0,3 la rejouerait
    // à 0,5 : on comparerait deux choses différentes en croyant comparer les
    // voix. Ce qui est passé en ligne de commande prime, évidemment.
    const dejaRegle = reglagesDeVoix(choixDe(slug))
    const reglages = {
      stabilite: options.stabilite !== undefined ? Number(options.stabilite) : dejaRegle.stabilite,
      similarite: options.similarite !== undefined ? Number(options.similarite) : dejaRegle.similarite,
    }

    // On part de la prise DÉJÀ COUPÉE quand elle existe : c'est ce que le
    // montage convertira réellement. À défaut, le rush brut.
    const rushs = fs.existsSync(v.tournage)
      ? fs.readdirSync(v.tournage).filter((f) => /\.(mp3|m4a|wav|mp4|mov)$/i.test(f)).sort()
      : []
    const source = fs.existsSync(path.join(v.audio, 'voix-coupee.wav'))
      ? path.join(v.audio, 'voix-coupee.wav')
      : rushs.length
        ? path.join(v.tournage, rushs[0])
        : null
    if (!source) {
      throw new Error(`Aucune prise dans ${path.relative(CHEMINS.racine, v.tournage)} : dépose l'audio d'abord.`)
    }

    const { dureeS } = await sonde(source)
    const debut = Math.min(depuis, Math.max(0, dureeS - secondes))
    const fin = Math.min(dureeS, debut + secondes)

    const connue = (await catalogue().catch(() => [])).find((x) => x.id === id) ?? null
    const nom = connue?.nom ?? (options.nom && options.nom !== true ? String(options.nom) : id)
    const essais = path.join(v.audio, 'essais')
    assureDossier(essais)
    const morceau = path.join(essais, `.source-${Math.round(debut)}-${Math.round(fin)}.wav`)
    // LE RÉGLAGE ENTRE DANS LE NOM DU FICHIER, ET C'EST NÉCESSAIRE.
    //
    // Deux essais de la même voix à deux stabilités différentes écrivaient le
    // même fichier : le second écrasait le premier, et l'on ne pouvait donc
    // jamais les comparer — ce qui est pourtant la seule raison d'en faire deux.
    const empreinte = `s${String(reglages.stabilite).replace('.', '')}-f${String(reglages.similarite).replace('.', '')}`
    const sortie = path.join(
      essais,
      `${String(nom).replace(/[^\p{L}\p{N}-]+/gu, '-')}-${id.slice(0, 6)}-${empreinte}.wav`
    )

    journal.titre(`Essai · ${nom}`)
    journal.info(`${(fin - debut).toFixed(1)} s prélevées à ${debut.toFixed(1)} s dans ${path.basename(source)}`)
    journal.detail(`Stabilité ${reglages.stabilite} · similarité ${reglages.similarite}`)

    // ON EMPRUNTE LA VOIX, ON NE L'ACHÈTE PAS.
    //
    // La conversion ne sait employer que ce que le compte possède : essayer une
    // voix de la bibliothèque sans l'ajouter répond 403, et depuis que la
    // bibliothèque est le fonds par défaut de l'atelier, c'est le cas courant.
    //
    // Mais le compte est rationné — trente emplacements, et un compteur d'ajouts
    // par période. Garder chaque voix écoutée le remplirait de timbres écartés,
    // et l'échec tomberait plus tard, sur celle qu'on voulait. On la rend donc
    // aussitôt l'essai fait, et seulement si c'est nous qui l'avons ajoutée.
    //
    // La même clé sert à l'ajout et au retrait : une voix ajoutée sur un compte
    // n'existe pas sur un autre.
    let emprunt = null
    const proprietaire =
      options.proprietaire && options.proprietaire !== true ? String(options.proprietaire) : null
    if (proprietaire && !connue) {
      emprunt = await avecCle('elevenlabs', async (cle) => {
        const r = await ajouteUneVoixPartagee(cle, { proprietaire, id, nom })
        return { cle, id: r.id, deja: r.deja }
      })
      if (!enJson) {
        journal.detail(
          emprunt.deja
            ? `Cette voix était déjà dans ton compte.`
            : `Voix empruntée au compte le temps de l'essai — elle en ressortira après.`
        )
      }
    }
    const idConversion = emprunt?.id ?? id

    await decoupe(source, morceau, debut, fin)
    try {
      await changeDeVoix(morceau, sortie, { voiceId: idConversion, ...reglages })
    } finally {
      try { fs.unlinkSync(morceau) } catch { /* le temporaire n'est pas critique */ }
      // Rendue même si la conversion a échoué : sinon un essai raté laisserait
      // un emplacement occupé, et c'est précisément ce qu'on cherchait à éviter.
      if (emprunt && !emprunt.deja) {
        const rendue = await retireUneVoix(emprunt.cle, emprunt.id).catch(() => false)
        if (!enJson && !rendue) {
          journal.attention(
            `La voix empruntée n'a pas pu être retirée du compte. ` +
              `Elle occupe un emplacement — retire-la depuis ElevenLabs si besoin.`
          )
        }
      }
    }

    const rel = path.relative(CHEMINS.racine, sortie)
    if (enJson) {
      console.log(JSON.stringify(
        { ok: true, voix: { id, nom }, fichier: rel, secondes: fin - debut, ...reglages },
        null, 2
      ))
      return
    }
    journal.ok(rel)
    journal.detail(`Si elle te va : node outils/choix-voix.mjs ${slug} --voix=${id}`)
    return
  }

  if (drapeau(options, 'oublie')) {
    oublieChoix(slug)
    const suite = voixPour(slug)
    if (enJson) {
      console.log(JSON.stringify({ ok: true, choix: null, effective: suite }, null, 2))
      return
    }
    journal.ok(`Choix effacé. « ${slug} » repart sur ${suite.origine ?? 'aucune voix'}.`)
    return
  }

  if (options.voix && options.voix !== true) {
    let id = String(options.voix)

    // UNE VOIX DE LA BIBLIOTHÈQUE S'AJOUTE AU COMPTE AVANT DE SERVIR.
    //
    // `/v1/shared-voices` publie des milliers de voix, mais la conversion ne
    // sait employer que celles que le compte possède : sur un identifiant
    // partagé non ajouté, elle répond 400 — après la coupe et la transcription,
    // c'est-à-dire au pire moment. L'ajout est gratuit et instantané, et
    // ré-ajouter une voix déjà présente ne coûte rien non plus.
    if (options.proprietaire && options.proprietaire !== true) {
      const ajout = await avecCle('elevenlabs', (cle) =>
        ajouteUneVoixPartagee(cle, {
          proprietaire: String(options.proprietaire),
          id,
          nom: options.nom && options.nom !== true ? String(options.nom) : `Reprise ${id.slice(0, 6)}`,
        })
      )
      id = ajout.id
      if (!enJson) {
        journal.detail(ajout.deja ? `Cette voix était déjà dans ton compte.` : `Voix ajoutée à ton compte.`)
      }
    }

    // ON VÉRIFIE QUE LA VOIX EXISTE AVANT DE L'ENREGISTRER.
    //
    // Un identifiant mal recopié ne se voit pas dans un fichier JSON : il se
    // voit au montage, après la coupe et la transcription, quand ElevenLabs
    // répond 403 — c'est-à-dire au pire moment.
    let connue = null
    try {
      connue = (await catalogue()).find((x) => x.id === id) ?? null
    } catch (e) {
      journal.attention(`Catalogue injoignable (${e.message.split('\n')[0]}) — choix enregistré sans vérification.`)
    }
    if (connue === null && !drapeau(options, 'force')) {
      const dispo = await catalogue().catch(() => [])
      if (dispo.length) {
        throw new Error(
          `Aucune voix « ${id} » sur ce compte.\n` +
            `Vérifie avec --catalogue, ou passe --force pour l'enregistrer quand même.`
        )
      }
    }

    const choix = enregistreChoix(slug, {
      voice_id: id,
      nom: connue?.nom ?? null,
      apercu: connue?.apercu ?? null,
      // Absents de la ligne de commande, on garde ce qui était déjà réglé :
      // retenir une voix ne doit pas effacer en silence un réglage trouvé à
      // l'oreille juste avant.
      stabilite: options.stabilite !== undefined ? Number(options.stabilite) : (choixDe(slug)?.stabilite ?? null),
      similarite: options.similarite !== undefined ? Number(options.similarite) : (choixDe(slug)?.similarite ?? null),
    })
    if (enJson) {
      console.log(JSON.stringify({ ok: true, choix }, null, 2))
      return
    }
    journal.ok(
      `« ${slug} » sera converti avec ${choix.nom ? `« ${choix.nom} »` : id}.`
    )
    const r = reglagesDeVoix(choix)
    journal.detail(`Stabilité ${r.stabilite} · similarité ${r.similarite}`)
    journal.detail(`Le montage l'utilisera : npm run monte -- ${slug} --depuis=voix`)
    return
  }

  // ------------------------------------------------------------- affichage --
  const effective = voixPour(slug)
  if (enJson) {
    console.log(JSON.stringify({ choix: choixDe(slug), effective }, null, 2))
    return
  }
  journal.titre(`Voix · ${slug}`)
  if (!effective.voice_id) {
    journal.attention(
      `Aucune voix retenue, à aucun niveau. Le montage échouera en mode « sts ».\n` +
        `  Choisis-en une : node outils/choix-voix.mjs ${slug} --catalogue`
    )
    return
  }
  journal.info(
    `${effective.nom ? `« ${effective.nom} » · ` : ''}${effective.voice_id}`
  )
  journal.detail(`Provenance : ${effective.origine}`)
})
