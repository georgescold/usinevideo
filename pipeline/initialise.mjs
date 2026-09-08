#!/usr/bin/env node
/**
 * initialise.mjs — donne son identité à une chaîne, sans passer par la conversation.
 *
 * POURQUOI CETTE COMMANDE EXISTE, ALORS QUE `/init-chaine` EXISTE DÉJÀ.
 *
 * La skill `/init-chaine` est un ENTRETIEN : elle interroge, elle propose, elle
 * fait la veille, elle écrit un socle marketing de plusieurs pages. Elle reste,
 * et elle reste le bon outil quand on veut ce travail-là.
 *
 * Mais elle était le SEUL chemin, et c'est ça qui ne tenait pas. Une chaîne non
 * initialisée n'a ni nom affiché, ni format actif, ni couleur : elle produit —
 * la cascade des sous-titres y pourvoit — mais elle produit sans identité, et
 * rien dans l'atelier ne permettait de lui en donner une. Il fallait sortir du
 * logiciel, ouvrir Claude Code, et mener une heure d'entretien pour poser un
 * nom et deux couleurs.
 *
 * Cette commande est l'autre chemin : on DÉCLARE ce qu'on sait déjà. Aucun
 * appel réseau, aucune clé, aucun modèle. Ce qui est donné est écrit ; ce qui ne
 * l'est pas reste vide et pourra l'être plus tard, ici ou en conversation.
 *
 * CE QU'ELLE N'EST PAS. Elle ne remplace pas l'entretien : elle n'invente pas
 * d'avatar, ne fait pas de veille, n'écrit pas de hook bank. Elle pose une carte
 * d'identité. Les fiches de `marque/` restent des gabarits tant que quelqu'un —
 * la skill `avatars-et-produit`, ou l'utilisateur — ne les a pas remplies.
 *
 *   node pipeline/initialise.mjs --etat --json
 *   node pipeline/initialise.mjs --json < identite.json
 *   node pipeline/initialise.mjs --nom="Sommeil Profond" --promesse="…"
 */

import fs from 'node:fs'
import path from 'node:path'
import { CHEMINS, litJson, ecritJson, ecritTexte, assureDossier } from './lib/chemins.mjs'
import { policesDisponibles } from './lib/soustitres.mjs'
import { MODELES_PLAN, MODELE_PLAN_DEFAUT, coutDUnPlan } from './lib/fal.mjs'
import { journal } from './lib/journal.mjs'
import { litArgs, aide, drapeau, principal } from './lib/args.mjs'

const { options } = litArgs()

aide(
  options,
  `
node pipeline/initialise.mjs [options]

  --etat                 ce que la chaîne porte déjà, et ce qu'on peut régler
  --json                 sortie machine ; lit aussi un objet JSON sur l'entrée
                         standard, qui prime sur les options ci-dessous

  --nom=                 le nom de la chaîne, celui qu'on lit à l'écran
  --promesse=            ce qu'elle promet, en une phrase
  --produit=             le nom du produit qu'elle sert
  --avatar=              l'avatar général : à qui toutes les vidéos parlent
  --segment=             son segment
  --marketeur=           la figure d'autorité qu'on incarne
  --registre=            le registre de jeu commun aux avatars de la chaîne
  --formats=             les formats actifs, séparés par des virgules
  --couleur-accent=      #rrggbb
  --couleur-fond=        #rrggbb
  --police-titres=       une famille présente dans assets/fonts/
  --police-soustitres=   idem

Ce qui n'est pas donné reste vide : cette commande DÉCLARE, elle n'invente pas.
Pour l'entretien complet — socle marketing, veille, ligne éditoriale — c'est
/init-chaine en conversation, et les deux se complètent.
`
)

/** Les champs que cette commande accepte, et où ils atterrissent. */
const CHAMPS = {
  nom: ['identite', 'nom'],
  promesse: ['identite', 'promesse'],
  en_une_phrase: ['identite', 'en_une_phrase'],
  produit: ['produit', 'nom'],
  produit_type: ['produit', 'type'],
  produit_prix: ['produit', 'prix'],
  produit_url: ['produit', 'url'],
  avatar: ['avatar', 'nom'],
  segment: ['avatar', 'segment'],
  niveau_de_conscience: ['avatar', 'niveau_de_conscience'],
  marketeur: ['marketeur', 'nom'],
  posture: ['marketeur', 'posture'],
  registre: ['avatars', 'registre'],
  couleur_accent: ['identite_visuelle', 'couleur_accent'],
  couleur_fond: ['identite_visuelle', 'couleur_fond'],
  couleur_texte: ['identite_visuelle', 'couleur_texte'],
  police_titres: ['identite_visuelle', 'police_titres'],
  police_soustitres: ['identite_visuelle', 'police_soustitres'],
  direction_plans: ['identite_visuelle', 'direction_plans'],
  // Le modèle vidéo employé quand un plan se GÉNÈRE. Il vit avec la direction
  // des plans : les deux décident de ce qu'on obtient d'une requête.
  modele_video: ['identite_visuelle', 'modele_video'],
}

/** Un `#rrggbb`, ou rien. Une couleur invalide casserait le rendu en silence. */
function couleur(v, champ) {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error(`${champ} : « ${s} » n'est pas une couleur #rrggbb.`)
  }
  return s.toLowerCase()
}

/**
 * Le texte d'un champ, borné.
 *
 * Ces valeurs partent dans des prompts et dans le rendu : une promesse de dix
 * mille caractères collée par accident ferait un devis surprenant et un titre
 * illisible, sans que rien ne l'ait signalé.
 */
function texte(v, champ, max = 400) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  if (s.length > max) throw new Error(`${champ} : ${s.length} caractères, ${max} au plus.`)
  return s
}

/** Lit l'objet JSON posé sur l'entrée standard, s'il y en a un. */
async function corpsSurEntree() {
  if (process.stdin.isTTY) return null
  const brut = await new Promise((resoud) => {
    let tampon = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => (tampon += d))
    process.stdin.on('end', () => resoud(tampon.trim()))
  })
  if (!brut) return null
  try {
    return JSON.parse(brut)
  } catch (e) {
    throw new Error(`L'entrée standard n'est pas du JSON : ${e.message}`)
  }
}

/**
 * Le squelette d'une fiche de `marque/`.
 *
 * ON ÉCRIT UN GABARIT, PAS UNE FICHE — et la différence doit se voir au premier
 * coup d'œil. Une fiche produit de trois lignes générée depuis un formulaire
 * ressemble à une fiche produit, et c'est le pire des deux mondes : on croit
 * l'avoir faite, on ne la refait jamais, et chaque script s'écrit sur du vide.
 * L'en-tête dit donc franchement ce qui manque et qui sait le remplir.
 */
function gabarit(titre, chaine, corps) {
  const nom = chaine?.identite?.nom ?? 'cette chaîne'
  return `# ${titre} — ${nom}

> **Ce fichier est un GABARIT.** Il a été posé par l'écran d'initialisation, qui
> ne connaît que ce qu'on lui a tapé. Il ne remplace pas le travail de fond :
> pour l'écrire vraiment, ouvre Claude Code dans ce dossier et lance
> \`/init-chaine\` — la skill \`avatars-et-produit\` mène l'entretien et remplit
> les quatre fiches du socle.
>
> Tant qu'il est dans cet état, un script écrit à partir de lui sera générique.

${corps}
`
}

await principal(async () => {
  const chemin = path.join(CHEMINS.racine, 'config', 'chaine.json')
  const chaine = litJson(chemin, null)
  if (!chaine) throw new Error(`config/chaine.json est introuvable. On n'est pas dans une chaîne.`)

  const enJson = drapeau(options, 'json')

  // ------------------------------------------------------------------ état --
  if (drapeau(options, 'etat')) {
    const etat = {
      initialise: chaine.initialise === true,
      date_init: chaine.date_init ?? null,
      dossier: path.basename(CHEMINS.racine),
      valeurs: {},
      // LE CHAMP S'APPELLE `format`, ET SURTOUT PAS `cle`.
      //
      // `lib/journal.mjs` masque la valeur de toute propriété dont le NOM
      // ressemble à un secret — `/token|key|cle|secret|password|authorization/`.
      // Un champ nommé `cle` sortait donc de l'atelier en « long…mera » : le
      // filet à secrets faisait exactement son travail, sur un mot qui ne
      // désigne ici qu'un format vidéo. On ne desserre pas le filet, on nomme
      // correctement.
      formats: Object.entries(chaine.formats ?? {})
        .filter(([k]) => !k.startsWith('_'))
        .map(([format, f]) => ({ format, actif: f?.actif === true, duree_cible_s: f?.duree_cible_s ?? null })),
      cadence: {
        long_par_semaine: chaine.cadence?.long_par_semaine ?? 0,
        short_par_semaine: chaine.cadence?.short_par_semaine ?? 0,
      },
      polices: policesDisponibles(),
      // LE CATALOGUE PART AVEC L'ÉTAT, il ne se recopie pas dans l'écran.
      // Une liste en dur là-bas divergerait au premier tarif qui bouge, et
      // l'écran annoncerait un prix que le devis ne pratique plus.
      modelesVideo: Object.entries(MODELES_PLAN).map(([format, m]) => ({
        format,
        nom: m.nom,
        resume: m.resume,
        // Cinq secondes : la durée d'un plan de coupe ordinaire. C'est ce qui
        // rend deux modèles comparables d'un coup d'œil.
        usd5s: coutDUnPlan(format, 5),
      })),
      modeleVideoDefaut: MODELE_PLAN_DEFAUT,
    }
    for (const [champ, [bloc, cle]] of Object.entries(CHAMPS)) {
      etat.valeurs[champ] = chaine?.[bloc]?.[cle] ?? null
    }
    if (enJson) {
      console.log(JSON.stringify(etat, null, 2))
      return
    }
    journal.titre(`Identité de la chaîne`)
    journal[etat.initialise ? 'ok' : 'attention'](
      etat.initialise ? `Initialisée le ${etat.date_init}` : `Pas encore initialisée`
    )
    for (const [champ, valeur] of Object.entries(etat.valeurs)) {
      journal.detail(`${champ.padEnd(20)} ${valeur ?? '—'}`)
    }
    journal.detail(`formats actifs       ${etat.formats.filter((f) => f.actif).map((f) => f.format).join(', ') || '—'}`)
    return
  }

  // ---------------------------------------------------------------- écrire --
  const surEntree = await corpsSurEntree()
  const donnees = surEntree ?? options

  // TOUT DÉCLARER D'UN COUP N'EST PAS OBLIGATOIRE, ET NE PAS DÉCLARER NON PLUS.
  //
  // On accepte un objet partiel : ce qui est absent n'est pas touché. C'est ce
  // qui permet de revenir régler une couleur six mois plus tard sans avoir à
  // retaper la promesse de la chaîne.
  let ecrits = 0
  for (const [champ, [bloc, cle]] of Object.entries(CHAMPS)) {
    if (!(champ in donnees)) continue
    const brut = donnees[champ]
    if (champ === 'modele_video' && brut && !MODELES_PLAN[String(brut)]) {
      throw new Error(
        `Modèle vidéo inconnu : « ${brut} ».\n` +
          `  Connus : ${Object.keys(MODELES_PLAN).join(', ')}`
      )
    }
    const valeur = champ.startsWith('couleur_')
      ? couleur(brut, champ)
      : texte(brut, champ, champ === 'promesse' || champ === 'posture' || champ === 'registre' ? 800 : 200)
    chaine[bloc] = chaine[bloc] ?? {}
    chaine[bloc][cle] = valeur
    ecrits++
  }

  // Les formats : une liste de clés qui doivent EXISTER dans chaine.json. Une
  // clé inventée créerait un format que rien ne sait rendre.
  if (donnees.formats !== undefined) {
    const voulus = new Set(
      (Array.isArray(donnees.formats) ? donnees.formats : String(donnees.formats).split(','))
        .map((f) => String(f).trim())
        .filter(Boolean)
    )
    const connus = Object.keys(chaine.formats ?? {}).filter((k) => !k.startsWith('_'))
    for (const f of voulus) {
      if (!connus.includes(f)) throw new Error(`Format inconnu : « ${f} ». Connus : ${connus.join(', ')}`)
    }
    for (const f of connus) chaine.formats[f].actif = voulus.has(f)
    ecrits++
  }

  if (donnees.cadence && typeof donnees.cadence === 'object') {
    chaine.cadence = {
      long_par_semaine: Math.max(0, Math.min(21, Number(donnees.cadence.long_par_semaine) || 0)),
      short_par_semaine: Math.max(0, Math.min(21, Number(donnees.cadence.short_par_semaine) || 0)),
    }
    ecrits++
  }

  if (!ecrits) throw new Error(`Rien à écrire. Donne au moins un champ, ou --etat pour voir.`)

  // UNE CHAÎNE EST INITIALISÉE QUAND ELLE A UN NOM, ET RIEN D'AUTRE.
  //
  // Le drapeau ne dit pas « le socle marketing est fait » — aucun champ de ce
  // fichier ne peut le dire. Il dit : quelqu'un est passé, cette chaîne a une
  // identité, elle n'est plus le dossier vierge qu'on vient de copier. Exiger
  // davantage rendrait le drapeau inatteignable depuis un écran, ce qui était
  // précisément le problème.
  const aUnNom = Boolean(chaine?.identite?.nom)
  if (aUnNom && chaine.initialise !== true) {
    chaine.initialise = true
    chaine.date_init = new Date().toISOString().slice(0, 10)
  }

  ecritJson(chemin, chaine)

  // Les gabarits du socle : posés seulement s'ils manquent. On n'écrase JAMAIS
  // une fiche existante — elle a pu être écrite à la main ou par la skill, et
  // un formulaire ne connaît pas ce qu'elle contient.
  const poses = []
  assureDossier(CHEMINS.marque)
  const fiches = [
    ['Fiche-Produit.md', 'Fiche produit', `## Le produit\n\n- **Nom** : ${chaine.produit?.nom ?? '—'}\n- **Type** : ${chaine.produit?.type ?? '—'}\n- **Prix** : ${chaine.produit?.prix ?? '—'}\n- **Adresse** : ${chaine.produit?.url ?? '—'}\n\n## Les problèmes qu'il résout\n\nÀ écrire.\n\n## Les preuves\n\nÀ écrire.\n\n## Le vocabulaire du client\n\nÀ écrire — ce sont les mots qu'il tape, pas les tiens.`],
    ['Fiche-Avatars.md', 'Fiche avatars', `## Avatar général\n\n- **Nom** : ${chaine.avatar?.nom ?? '—'}\n- **Segment** : ${chaine.avatar?.segment ?? '—'}\n- **Niveau de conscience** : ${chaine.avatar?.niveau_de_conscience ?? '—'}\n\n## Sa journée, ses mots, ce qu'il a déjà essayé\n\nÀ écrire.\n\n## Les autres avatars\n\nÀ écrire — ils servent à varier les angles.`],
    ['Hook-Bank.md', 'Hook bank', `## Par avatar et par niveau de conscience\n\nÀ écrire. Un hook qui n'est rattaché à personne ne sert à rien.`],
    ['Le-Marketeur.md', 'Le marketeur', `## La figure incarnée à l'écran\n\n- **Nom** : ${chaine.marketeur?.nom ?? '—'}\n- **Posture** : ${chaine.marketeur?.posture ?? '—'}\n\n## Son lexique, son ennemi, ce qu'il ne dira jamais\n\nÀ écrire.`],
  ]
  for (const [fichier, titre, corps] of fiches) {
    const ou = path.join(CHEMINS.marque, fichier)
    if (fs.existsSync(ou)) continue
    ecritTexte(ou, gabarit(titre, chaine, corps))
    poses.push(fichier)
  }

  if (enJson) {
    console.log(JSON.stringify({ ok: true, initialise: chaine.initialise === true, gabarits: poses }, null, 2))
    return
  }

  journal.titre(`Identité écrite`)
  journal.ok(`config/chaine.json — ${ecrits} bloc(s) mis à jour`)
  if (poses.length) journal.detail(`Gabarits posés dans marque/ : ${poses.join(', ')}`)
  if (chaine.initialise === true) journal.ok(`La chaîne est initialisée.`)
  else journal.attention(`Il manque le nom : sans lui la chaîne reste « non initialisée ».`)
  journal.detail(
    `Le socle marketing, lui, s'écrit en conversation : /init-chaine. ` +
      `Cette commande pose une carte d'identité, pas une stratégie.`
  )
})
