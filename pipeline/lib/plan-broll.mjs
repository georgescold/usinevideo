/**
 * plan-broll.mjs — revoir les plans de coupe d'un montage, un par un.
 *
 * POURQUOI JETER NE SUFFIT PAS.
 *
 * Le premier réflexe, devant un plan qui ne va pas, est de le retirer. C'est ce
 * qu'on avait proposé — et c'est faux ici, parce que le trou ne reste pas vide :
 * le plan précédent s'étire pour le combler. On échange donc une image mal
 * choisie contre un plan long et fixe, c'est-à-dire contre le temps mort que le
 * §10 du CLAUDE.md interdit en premier. « Un événement visuel toutes les 2 à
 * 4 secondes » n'est pas une moyenne : c'est une cadence.
 *
 * Refuser un plan doit donc en APPELER UN AUTRE. La banque en avait proposé dix,
 * le montage a pris le premier qui se téléchargeait ; on prend le suivant.
 *
 * CE MODULE NE DÉCIDE RIEN. Il lit le plan, échange une image, réécrit le plan.
 * Ce qui est bon à l'image se juge à l'œil, et l'œil est de l'autre côté.
 */

import fs from 'node:fs'
import path from 'node:path'

import { CHEMINS, dossierVideo, litJson, ecritJson, assureDossier } from './chemins.mjs'
import { journal } from './journal.mjs'
import { chercheVideos, cherchePhotos, rapatrie, plansEmployesRecemment, cleDeMedia } from './medias.mjs'
import { mesureLAccroche, accrocheFaible, BANDE_CLAIRE } from './ffmpeg.mjs'
import { chercheUnVisage } from './visages.mjs'

/** Les plans de coupe d'un montage, dans l'ordre, prêts à être montrés. */
export function plansDe(slug) {
  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  if (!plan) return null

  const evenements = Array.isArray(plan.evenements) ? plan.evenements : []
  const brolls = evenements
    .map((e, rang) => ({ e, rang }))
    .filter(({ e }) => e.type === 'broll')

  // LE TEXTE DIT PENDANT LE PLAN, PAS SEULEMENT L ANCRE QUI L A DECLENCHE.
  //
  // L ancre est le mot ou l evenement se cale ; elle ne dit pas ce qu on entend
  // pendant les trois secondes qui suivent. Or c est exactement la question
  // qu on se pose devant une vignette : est-ce que cette image va avec ce qui
  // est en train d etre dit ?
  //
  // ET AVEC LEURS INSTANTS, PAS SEULEMENT LEUR SUITE.
  //
  // Une phrase posée sous une vignette dit ce qui se dit ; elle ne dit pas
  // QUAND. Or l'écran de revue rejoue le passage et fait courir les sous-titres
  // par-dessus l'image : sans les bornes de chaque mot il ne pourrait que les
  // afficher d'un bloc, ce qui ne ressemble en rien au rendu et n'apprend rien
  // sur le calage.
  const mots = Array.isArray(plan.mots) ? plan.mots : []
  const motsEntre = (debut, fin) =>
    mots
      .filter((m) => (m.debutMs ?? 0) < (fin ?? Infinity) && (m.finMs ?? 0) > debut)
      .map((m) => ({ texte: m.texte, debutMs: m.debutMs ?? 0, finMs: m.finMs ?? 0 }))

  // Le seuil vient de `ffmpeg.mjs` : une seule valeur, pour la commande comme
  // pour l'écran. Deux copies divergeraient à la première recalibration.
  const CLAIR = BANDE_CLAIRE
  return brolls.map(({ e, rang }, i) => {
    const debutMs = e.debutMs ?? 0
    const finMs = e.dureeMs != null ? debutMs + e.dureeMs : null
    const dits = motsEntre(debutMs, finMs)
    return {
      // Le numéro qu'on montre est celui des PLANS DE COUPE, pas celui de
      // l'événement dans le plan : personne ne compte les punchs pour désigner
      // une image.
      numero: i + 1,
      // LA LISIBILITÉ DES SOUS-TITRES, quand elle a été mesurée.
      //
      // `null` veut dire « pas encore mesuré », jamais « bon » : la mesure
      // demande deux à trois minutes et se lance à la demande. Confondre les
      // deux ferait passer un montage non vérifié pour un montage validé.
      bandeY: e._bandeY ?? null,
      modele: e._modele ?? null,
      clair: typeof e._bandeY === 'number' ? e._bandeY >= CLAIR : null,
      rang,
      debutMs,
      dureeMs: e.dureeMs ?? null,
      finMs,
      src: e.src ?? null,
      requete: e.requete ?? null,
      ancre: e.ancre ?? null,
      source: e.source ?? 'pexels',
      // POURQUOI CE PLAN-LÀ A ÉTÉ PAYÉ.
      //
      // Un plan généré au milieu de trente plans de banque ne se juge pas sans
      // sa raison : on voit qu'il est différent, on ne peut pas dire si le choix
      // était bon. `iaChoisi` distingue les deux façons de le décider — le
      // script l'a désigné, ou la banque n'avait rien.
      iaPourquoi: e._iaPourquoi ?? null,
      iaChoisi: e._iaChoisi === true,
      // Un insert est TON plan posé par-dessus : il ne se remplace pas en banque.
      insert: e.insert?.src ?? null,
      essais: e._essais ?? 0,
      // LE PREMIER PLAN SE DÉSIGNE, PARCE QU'IL NE SE JUGE PAS COMME LES AUTRES.
      //
      // C'est le seul qui décide si les trente suivants seront vus. L'écran de
      // revue doit donc le montrer pour ce qu'il est, avec ce qui le qualifie —
      // combien il bouge — au lieu de le noyer dans la grille.
      ouverture: i === 0,
      // Trois relevés, jamais une note : ce qui fait qu'un plan arrête l'œil ne
      // se met pas en un chiffre, et un chiffre unique aurait l'air d'un
      // jugement. On montre les trois, l'œil tranche.
      accroche: e._accroche ?? null,
      // Le seul verdict qu'on se permet, et il vient d'ici : l'interface ne
      // redéfinit pas les seuils, sinon les deux divergent le jour où l'un
      // bouge.
      terne: accrocheFaible(e._accroche),
      mots: dits,
      texte: dits.map((m) => m.texte).join(' '),
    }
  })
}



/**
 * Le style de sous-titres que le rendu appliquera à CE montage.
 *
 * ON LE PREND DANS LE PLAN, PAS DANS LES RÉGLAGES.
 *
 * Les deux existent, et ils peuvent diverger : les réglages sont ce qu'on vient
 * de choisir, le plan est ce qui sera rendu tant qu'on n'a pas remonté. Un
 * aperçu qui lirait les réglages montrerait donc une vidéo qui n'existe pas
 * encore — et le jour où l'on cherche pourquoi le rendu ne ressemble pas à
 * l'aperçu, on chercherait longtemps. C'est l'objet que Remotion lit, tel quel.
 */
export function styleDesSousTitres(slug) {
  const plan = litJson(dossierVideo(slug).plan, null)
  if (!plan) return null
  return {
    ...(plan.theme?.sousTitres ?? {}),
    police: plan.theme?.policeSousTitres ?? null,
    couleurContour: plan.theme?.sousTitres?.couleurContour ?? '#000000',
    // Le format du rendu part avec le style : sans lui, l'aperçu poserait les
    // sous-titres sur la boîte qui contient l'image plutôt que sur l'image.
    largeur: plan.largeur ?? 1080,
    hauteur: plan.hauteur ?? 1920,
  }
}

/**
 * Échange le plan de coupe numéro `numero` contre un autre candidat.
 *
 * ON DESCEND DANS LA LISTE DE CANDIDATS, ON NE RETIRE PAS AU HASARD.
 *
 * Chaque refus incrémente `_essais` et fait prendre le candidat suivant. C'est
 * ce qui rend le geste répétable : deux refus de suite ne peuvent pas ramener
 * la même image, et la troisième proposition n'est pas la première.
 */
/**
 * `modele` : celui que l'APPELANT impose, sinon celui de la chaîne.
 *
 * Même piège que dans `medias.mjs` : le modèle se relisait sur le disque, donc
 * `--modele-video=` — qui vit dans la carte en mémoire de `monte.mjs` — était
 * ignoré. `--ouverture=ia` annonçait le prix de Seedance et générait avec LTX.
 */
export async function remplaceUnPlan(
  slug,
  numero,
  { direction = null, source = 'pexels', modele = null } = {}
) {
  const v = dossierVideo(slug)
  const plan = litJson(v.plan, null)
  if (!plan) throw new Error(`Aucun plan de montage pour « ${slug} ». Monte-la d'abord.`)

  const liste = plansDe(slug)
  const vise = liste.find((p) => p.numero === Number(numero))
  if (!vise) {
    throw new Error(
      `Il n'y a pas de plan de coupe n° ${numero} — ${liste.length} dans ce montage.`
    )
  }
  if (!vise.requete) {
    throw new Error(
      `Le plan n° ${numero} n'a pas de requête : c'est un fichier posé à la main, ` +
        `il ne se remplace pas en banque d'images.`
    )
  }

  const evenement = plan.evenements[vise.rang]
  const essais = (evenement._essais ?? 0) + 1

  // Le plan porte ses dimensions à la racine — c'est Remotion qui les lit.
  const largeur = plan.largeur ?? 1080
  const hauteur = plan.hauteur ?? 1920
  const dossier = path.join(v.montage, 'public', 'broll')
  assureDossier(dossier)

  // ------------------------------------------------------ la voie générée ---
  //
  // QUAND LA BANQUE N'A RIEN, ON FABRIQUE — ET ÇA SE PAIE.
  //
  // Pexels tient les scènes ordinaires : un téléphone, une rue, deux personnes
  // à une table. Il ne tiendra jamais ce qui n'existe pas en stock, et c'est là
  // que la génération sert. Elle coûte environ dix-huit centimes par plan : le
  // §2 du CLAUDE.md interdit de la lancer sans annoncer ce prix, donc l'écran
  // le demande avant d'arriver ici.
  if (source === 'ia') {
    const { genereVideo, soldeFal } = await import('../../outils/fal-video.mjs')
    const { promptDePlan } = await import('./fal.mjs')

    // UN PLAN NE MONTRE PAS LE PROPOS, IL EN PORTE L'ÉMOTION.
    //
    // « hands typing message smartphone » décrit une scène et ne dit rien de ce
    // qu'on doit ressentir en la voyant. Or le même geste filmé froid ou filmé
    // intime ne raconte pas la même chose, et c'est l'émotion qui décide si le
    // plan soutient le propos ou le contredit.
    //
    // L'intention est déjà écrite dans le script, bloc par bloc — c'est elle
    // qu'on traduit, plutôt que de la deviner depuis le texte français.
    const script = litJson(dossierVideo(slug).scriptJson, null)
    const bloc = (script?.blocs ?? []).find(
      (b) => vise.ancre && String(b.texte ?? '').includes(vise.ancre)
    )
    if (vise.ouverture) journal.detail(`plan d'ouverture : le visage est demandé au modèle.`)
    // LE SEUIL SUIT LE MODÈLE : 0,20 $ suffisait pour LTX, pas pour Seedance,
    // dont un plan de 5 s coûte 2,37 $. Un garde figé aurait laissé partir une
    // génération que le solde ne couvre pas, et fal l'aurait refusée après coup.
    const { dureeDePlan, modeleDePlan: quelModele, coutDUnPlan: prixDe, MODELES_PLAN } =
      await import('./fal.mjs')
    // Un identifiant inconnu ne doit pas passer en silence : on retombe alors
    // sur la chaîne plutôt que d'envoyer à fal un modèle qui n'existe pas.
    const MODELES_CONNUS = (id) => Boolean(MODELES_PLAN[id])
    const secondes = dureeDePlan(vise.dureeMs)
    const modelePrevu =
      modele && MODELES_CONNUS(modele)
        ? modele
        : quelModele(litJson(path.join(CHEMINS.config, 'chaine.json'), null))
    const prixPrevu = prixDe(modelePrevu, secondes)
    const reste = await soldeFal()
    if (reste !== null && reste < prixPrevu) {
      throw new Error(
        `Solde fal insuffisant : ${reste.toFixed(2)} $ pour un plan qui en coûte ~${prixPrevu.toFixed(2)}.`
      )
    }
    const nom = `broll-${String(vise.numero).padStart(2, '0')}-ia${essais}.mp4`
    const cible = path.join(dossier, nom)

    // LE PROMPT VIENT DE `fal.mjs`, IL NE S'ÉCRIT PLUS ICI.
    //
    // Le comblage automatique du montage en a besoin du même — et deux copies
    // divergeraient à la première correction de l'émotion. C'est la requête du
    // script en anglais (la langue des modèles ; le français y rend nettement
    // plus pauvre), l'intention du bloc traduite en direction d'image, et la
    // direction de plans de la chaîne.
    const prompt = promptDePlan({
      requete: vise.requete,
      intention: bloc?.intention ?? null,
      direction,
      ouverture: vise.ouverture,
    })
    journal.detail(`prompt : ${prompt}`)
    journal.detail(`modèle : ${modelePrevu} · ~${prixPrevu.toFixed(2)} $`)
    await genereVideo(prompt, {
      modele: modelePrevu,
      dureeS: secondes,
      format: hauteur > largeur ? '9:16' : '16:9',
      sortie: cible,
      surEtape: (m) => journal.detail(`fal · ${m}`),
    })

    const ancienIa = evenement.src
    evenement.src = `broll/${nom}`
    evenement.ken = false
    evenement.source = 'fal'
    // Le modèle qui l'a produit : sans lui, on ne peut pas dire si le prix
    // payé valait ce qu'on regarde.
    evenement._modele = modelePrevu
    evenement._essais = essais
    evenement._mediaId = `fal:${nom}`
    evenement._auteur = null
    await remesureLOuverture(vise, evenement, cible)
    ecritJson(v.plan, plan)

    if (ancienIa && ancienIa !== evenement.src && !plan.evenements.some((e) => e.src === ancienIa)) {
      fs.rmSync(path.join(v.montage, 'public', ancienIa), { force: true })
    }

    return {
      numero: vise.numero,
      avant: ancienIa,
      apres: evenement.src,
      essais,
      source: 'fal',
      media: { type: 'video', auteur: null, url: null },
      restants: null,
    }
  }

  // On demande de quoi descendre : le candidat retenu jusqu'ici, plus tous ceux
  // déjà refusés, plus celui qu'on veut.
  const combien = 10 + essais * 3
  const requete = direction ? `${vise.requete} ${direction}` : vise.requete
  const candidats = await chercheVideos(requete, { largeur, hauteur, combien }).catch(() => [])
  const secours =
    candidats.length === 0
      ? await cherchePhotos(requete, { largeur, hauteur, combien }).catch(() => [])
      : []
  const tous = candidats.length ? candidats : secours

  // Ce que les AUTRES plans emploient déjà : un plan qui revient deux fois dans
  // la même vidéo se lit comme une redite, et c'est précisément ce qu'on est en
  // train de corriger.
  const ailleurs = new Set(
    plan.evenements
      .filter((e, i) => e.type === 'broll' && i !== vise.rang && e._mediaId)
      .map((e) => e._mediaId)
  )
  if (evenement._mediaId) ailleurs.add(evenement._mediaId)

  // LE DOUBLON N'EST PAS DANS LE FICHIER, IL EST DANS LE REGARD.
  //
  // Un auteur publie son tournage en clips séparés, et la banque les remonte
  // ensemble : dix fichiers différents peuvent être dix fois la même silhouette
  // sur le même fond. Quand on demande « un autre », c'est justement ça qu'on
  // veut éviter — sinon le remplacement ne remplace rien.
  const auteursAilleurs = new Map()
  for (const e of plan.evenements) {
    if (e.type !== 'broll' || !e._auteur) continue
    auteursAilleurs.set(e._auteur, (auteursAilleurs.get(e._auteur) ?? 0) + 1)
  }
  // Ni ce que les autres plans de CETTE vidéo emploient, ni ce que les dix
  // derniers montages de la chaîne ont déjà montré.
  const recents = plansEmployesRecemment(slug).ids
  const disponibles = tous.filter(
    (m) => !ailleurs.has(m.id ?? m.url) && !recents.has(cleDeMedia(m.page ?? m.url ?? m.id))
  )
  const neufs = disponibles.filter((m) => (auteursAilleurs.get(m.auteur ?? '?') ?? 0) < 2)
  const restants = neufs.length ? neufs : disponibles
  if (!restants.length) {
    throw new Error(
      `La banque n'a rien d'autre pour « ${vise.requete} ».\n` +
        `  Change la requête dans le script, ou dépose un plan à toi : npm run broll -- --ajoute=…`
    )
  }

  // On saute ceux qu'on a déjà refusés pour CE plan-ci.
  const depart = Math.min(essais - 1, restants.length - 1)
  let pris = null
  for (const media of restants.slice(depart).concat(restants.slice(0, depart))) {
    const nom = `broll-${String(vise.numero).padStart(2, '0')}-v${essais}.${media.type === 'image' ? 'jpg' : 'mp4'}`
    const chemin = await rapatrie(media, path.join(dossier, nom))
    if (chemin) { pris = { media, nom }; break }
  }
  if (!pris) throw new Error(`Aucun candidat n'a pu être téléchargé pour « ${vise.requete} ».`)

  const ancien = evenement.src
  evenement.src = `broll/${pris.nom}`
  // LA PROVENANCE SE RÉÉCRIT AUSSI, ET SON OUBLI SE VOYAIT NULLE PART.
  //
  // Un plan d'abord généré puis remplacé par un plan de banque gardait
  // `source: 'fal'` : le fichier venait de Pexels, le plan disait l'inverse.
  // Une licence CC-BY exige l'attribution de son auteur — un plan de banque
  // catalogué « fal » est un crédit qu'on ne rend pas, et ça ne se remarque
  // qu'en lisant le plan à la main.
  evenement.source = 'pexels'
  // Une photo a besoin d'un mouvement : sans lui l'image se fige, et l'attention
  // part avec elle.
  evenement.ken = pris.media.type === 'image'
  evenement._essais = essais
  evenement._mediaId = pris.media.id ?? pris.media.url
  evenement._auteur = pris.media.auteur ?? null
  await remesureLOuverture(vise, evenement, path.join(dossier, pris.nom))

  ecritJson(v.plan, plan)

  // L'ancien fichier ne sert plus à personne : le garder remplirait `public/`
  // d'images qu'aucun plan ne référence, et qu'on n'oserait plus supprimer.
  if (ancien && ancien !== evenement.src && !plan.evenements.some((e) => e.src === ancien)) {
    fs.rmSync(path.join(v.montage, 'public', ancien.replace(/^broll\//, 'broll/')), { force: true })
  }

  return {
    numero: vise.numero,
    avant: ancien,
    apres: evenement.src,
    essais,
    source: 'pexels',
    media: { type: pris.media.type, auteur: pris.media.auteur ?? null, url: pris.media.url ?? null },
    restants: restants.length,
  }
}

/**
 * Remesure le mouvement quand on vient de remplacer le plan d'ouverture.
 *
 * ON NE REFUSE PAS LE CHOIX DE LA PERSONNE, ON LE MESURE.
 *
 * Le montage, lui, choisit le plus animé de quatre candidats. Ici quelqu'un a
 * regardé et décidé : lui imposer le même tri reviendrait à défaire son geste.
 * On se contente donc de dire ce que le nouveau plan vaut — l'écran l'affiche,
 * et le prochain « Un autre » se prend en connaissance de cause.
 *
 * Silencieux sur tous les autres plans : mesurer trente fichiers à chaque
 * remplacement coûterait une minute pour un chiffre que personne n'a demandé.
 */
async function releve(fichier) {
  const a = await mesureLAccroche(fichier)
  if (!a) return null
  // Le visage prime sur les trois relevés — voir `visages.mjs`. Il doit donc
  // être là AVANT qu'on prononce le moindre verdict.
  a.visage = await chercheUnVisage(fichier)
  return a
}

async function remesureLOuverture(vise, evenement, fichier) {
  if (!vise.ouverture) return
  const a = await releve(fichier)
  if (!a) return
  evenement._accroche = a
  if (accrocheFaible(a)) {
    journal.attention(
      `Ce plan d'ouverture est terne : aucun visage, ni mouvement (${a.mouvement}), ` +
        `ni contraste (${a.contraste}), ni couleur (${a.couleur}). C'est celui qui décide ` +
        `si les autres seront vus.`
    )
  } else {
    journal.info(
      `Ouverture — mouvement ${a.mouvement} · contraste ${a.contraste} · couleur ${a.couleur}` +
        (a.visage?.present ? ` · visage sur ${a.visage.taille} % du cadre` : ` · aucun visage trouvé`) +
        `.`
    )
  }
}

/**
 * Garantit que le plan d'ouverture porte sa mesure, et la retient.
 *
 * POURQUOI ELLE EST CALCULÉE ICI ET PAS SEULEMENT AU MONTAGE.
 *
 * Les montages faits avant cette règle n'ont pas de mesure, et ils sont
 * exactement ceux qu'on a envie de vérifier en premier. Attendre un remontage
 * pour afficher le chiffre reviendrait à ne jamais l'afficher sur les vidéos
 * qui existent déjà.
 *
 * La mesure est écrite dans le plan une fois pour toutes : le fichier ne change
 * pas, donc la refaire à chaque ouverture de l'écran serait une seconde perdue
 * à chaque fois pour le même nombre. Ce n'est pas une décision de montage qu'on
 * enregistre, c'est le relevé d'un fichier.
 *
 * @param {{numero:number, rang:number, src:string|null, mouvement:number|null}[]} liste
 */
export async function assureLaMesureDOuverture(slug, liste) {
  const vise = (liste ?? []).find((p) => p.ouverture)
  if (!vise || vise.accroche || !vise.src) return liste

  const v = dossierVideo(slug)
  const a = await releve(path.join(v.montage, 'public', vise.src))
  if (!a) return liste

  vise.accroche = a
  const plan = litJson(v.plan, null)
  const evenement = plan?.evenements?.[vise.rang]
  if (evenement) {
    evenement._accroche = a
    // La mesure d'avant ne portait qu'un axe : elle ne veut plus rien dire.
    delete evenement._mouvement
    ecritJson(v.plan, plan)
  }
  return liste
}
