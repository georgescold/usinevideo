#!/usr/bin/env node
/**
 * drive.mjs — le Drive de la chaîne : s'y connecter, y poser un dossier, y
 * envoyer un master.
 *
 * UN DOSSIER PAR CHAÎNE, ET IL APPARTIENT À LA CHAÎNE.
 *
 * L'identifiant du dossier vit dans `config/chaine.json`, comme tout ce qui
 * définit une chaîne. Copier le dossier pour en lancer une nouvelle ne copie
 * donc PAS la destination Drive : `nouvelle-chaine` la retire, et la seconde
 * chaîne se pose son propre dossier. Deux marques qui déversent dans le même
 * dossier, c'est le genre de mélange qu'on ne remarque qu'au bout d'un mois.
 *
 * LES SECRETS RESTENT LOCAUX. `config/keys.json` n'est jamais versionné : le
 * jeton d'un poste ne suit pas le dossier sur le disque partagé, et chaque
 * machine s'autorise une fois (CLAUDE.md §4).
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import { CHEMINS, litJson, dossierVideo } from './lib/chemins.mjs'
import { journal, progression, duree } from './lib/journal.mjs'
import { litArgs, drapeau, aide, principal } from './lib/args.mjs'
import {
  PORTEE,
  estConfigure,
  estConnecte,
  poseLesIdentifiants,
  autorise,
  oublieLeJeton,
  verifieLeJeton,
  creeLeDossier,
  renommeLeDossier,
  dossierDeLaChaine,
  envoie,
} from './lib/drive.mjs'

const { options, positionnels } = litArgs()

aide(
  options,
  `
drive.mjs — le Drive de la chaîne

  npm run drive                          où en est la connexion, et quel dossier
  npm run drive -- --identifiants --client=<id> --secret=-
                                         pose l'identifiant et le secret OAuth
                                         ( --secret=-  les lit sur l'entrée standard )
  npm run drive -- --connecte            l'autorisation, une fois par poste
  npm run drive -- --dossier             crée le dossier de la chaîne dans Drive
  npm run drive -- --dossier="Nom"       sous un autre nom
  npm run drive -- --dossier --force     en refait un, même s'il y en avait un
  npm run drive -- --renomme             le renomme d'après l'identité de la chaîne
  npm run drive -- <slug>                envoie le master de cette vidéo
  npm run drive -- <slug> --fichier=<chemin>   envoie ce fichier-là
  npm run drive -- --deconnecte          oublie le jeton de ce poste

CE QU'IL FAUT AVOIR FAIT DANS LA CONSOLE GOOGLE, UNE FOIS

  1. console.cloud.google.com — un projet, n'importe lequel.
  2. « API et services » → Bibliothèque → activer « Google Drive API ».
  3. Écran de consentement OAuth : type EXTERNE, un nom, ton adresse.
  4. Portées : ajouter UNIQUEMENT
       ${PORTEE}
     C'est la seule portée Drive que Google ne classe pas comme sensible :
     aucune vérification d'application à demander.
  5. Publier l'application (« En production »). Laissée « En test », ses jetons
     expirent au bout de 7 jours et il faut se reconnecter chaque semaine.
  6. Identifiants → Créer → ID client OAuth → type « Application de bureau ».
     Rien à déclarer comme URI de redirection : la boucle locale sur 127.0.0.1
     est acceptée d'office pour ce type.

  Ni compte de service, ni clé d'API, ni facturation.
`
)

principal(async () => {
  // ------------------------------------------------- poser les identifiants --
  if (drapeau(options, 'identifiants')) {
    const clientId = options.client
    let secret = options.secret
    if (secret === '-') secret = await lisLEntreeStandard('Secret du client OAuth')
    if (typeof clientId !== 'string' || typeof secret !== 'string') {
      throw new Error(
        `Donne les deux : --client=<id> --secret=-\n` +
          `  Le tiret lit le secret sur l'entrée standard, pour ne pas le laisser\n` +
          `  dans l'historique du terminal.`
      )
    }
    poseLesIdentifiants({ clientId, clientSecret: secret })
    journal.ok(`Identifiants OAuth enregistrés.`)
    journal.info(`Autorise ce poste : npm run drive -- --connecte`)
    return
  }

  // ------------------------------------------------------------ autoriser ---
  if (drapeau(options, 'connecte')) {
    if (!estConfigure()) {
      throw new Error(
        `Aucun identifiant OAuth. Fais d'abord la console Google (npm run drive -- --aide),\n` +
          `puis : npm run drive -- --identifiants --client=<id> --secret=-`
      )
    }
    journal.titre(`Autorisation Google Drive`)
    await autorise({
      surUrl: (url) => {
        journal.info(`Ouvre cette adresse, puis accepte :`)
        console.log(`\n  ${url}\n`)
        journal.detail(`La page se referme d'elle-même. Rien ne transite hors de ce poste.`)
      },
    })
    journal.ok(`Ce poste est autorisé.`)
    if (!dossierDeLaChaine()) journal.info(`Pose le dossier : npm run drive -- --dossier`)
    return
  }

  if (drapeau(options, 'deconnecte')) {
    const fait = oublieLeJeton()
    journal.ok(fait ? `Jeton oublié sur ce poste.` : `Il n'y avait rien à oublier.`)
    journal.detail(`L'accès reste ouvert côté Google : https://myaccount.google.com/permissions`)
    return
  }

  // -------------------------------------------------------- le dossier -----
  if (options.dossier !== undefined) {
    const chaine = litJson(CHEMINS.chaine, {})
    // LE NOM DE LA CHAINE VIT DANS `identite`, PAS A LA RACINE.
    //
    // Le premier dossier pose s'est appele « Chaine » pour cette seule raison :
    // le repli cherchait `chaine.nom`, qui n'existe pas.
    const nom =
      typeof options.dossier === 'string'
        ? options.dossier
        : chaine.identite?.nom ?? chaine.identite?.id ?? 'Chaîne'
    const r = await creeLeDossier(nom, { force: drapeau(options, 'force') })
    if (r.nouveau) {
      journal.ok(`Dossier « ${r.dossier_nom} » créé dans ton Drive.`)
      if (r.lien) journal.detail(r.lien)
      journal.detail(
        `Tu peux le déplacer ou le renommer dans Drive : son identifiant ne change pas.`
      )
    } else {
      journal.info(`Cette chaîne dépose déjà dans « ${r.dossier_nom} ».`)
      journal.detail(`--force pour en créer un autre.`)
    }
    return
  }

  // ---------------------------------------------------------- renommer -----
  if (options.renomme !== undefined) {
    const chaine = litJson(CHEMINS.chaine, {})
    const nom =
      typeof options.renomme === 'string'
        ? options.renomme
        : chaine.identite?.nom ?? chaine.identite?.id ?? 'Chaîne'
    const d = await renommeLeDossier(nom)
    journal.ok(`Le dossier s'appelle maintenant « ${d.dossier_nom} ».`)
    if (d.lien) journal.detail(d.lien)
    return
  }

  // ------------------------------------------------------------- l'envoi ---
  const slug = positionnels[0]
  if (slug) {
    const v = dossierVideo(slug)
    const fichier = options.fichier
      ? path.resolve(String(options.fichier))
      : trouveLeMaster(v, slug)

    const taille = fs.statSync(fichier).size
    journal.titre(`Envoi vers Drive`)
    journal.info(
      `${path.basename(fichier)} · ${(taille / 1e6).toFixed(1)} Mo → « ${dossierDeLaChaine()?.dossier_nom} »`
    )

    // L'ÉTIQUETTE EST LA CLÉ DE SUIVI DE `progression` : elle doit être STABLE.
    //
    // On y passait le pourcentage et le temps restant. À chaque appel,
    // l'étiquette changeait donc, `progression` croyait voir un nouveau travail,
    // repartait de zéro — d'où deux pourcentages sur la même ligne et un
    // « reste 0 s » systématique. Le nom du fichier ne bouge pas ; le reste,
    // c'est le travail de `progression`.
    const r = await envoie(fichier, {
      surProgres: (p) => progression(p.envoye, p.taille, path.basename(fichier)),
    })
    journal.ok(`Envoyé en ${duree(r.secondes)}.`)
    if (r.lien) journal.detail(r.lien)
    if (drapeau(options, 'json')) console.log(JSON.stringify({ ok: true, ...r }, null, 2))
    return
  }

  // --------------------------------------------------------------- l'état --
  //
  // En JSON pour l'atelier : il a besoin de savoir s'il peut proposer le bouton,
  // et quoi écrire dessus quand il ne le peut pas.
  if (drapeau(options, 'json')) {
    const d = dossierDeLaChaine()
    // On INTERROGE Google plutôt que de se fier à la présence du jeton : en mode
    // Test, il expire au bout de sept jours sans disparaître du trousseau.
    const jeton = await verifieLeJeton()
    console.log(
      JSON.stringify(
        {
          ok: true,
          configure: estConfigure(),
          connecte: jeton.ok,
          jeton_perime: Boolean(estConnecte() && !jeton.ok),
          motif: jeton.motif,
          dossier: d ? { nom: d.dossier_nom, lien: d.lien ?? null } : null,
          pret: Boolean(jeton.ok && d),
        },
        null,
        2
      )
    )
    return
  }

  journal.titre(`Google Drive`)
  if (!estConfigure()) {
    journal.attention(`Aucun identifiant OAuth sur ce poste.`)
    journal.detail(`Ce qu'il faut faire dans la console Google : npm run drive -- --aide`)
    return
  }
  journal.ok(`Identifiants OAuth en place.`)
  if (!estConnecte()) {
    journal.attention(`Ce poste n'est pas encore autorisé.`)
    journal.detail(`npm run drive -- --connecte`)
    return
  }
  journal.ok(`Poste autorisé.`)

  const d = dossierDeLaChaine()
  if (!d) {
    journal.attention(`Cette chaîne n'a pas de dossier Drive.`)
    journal.detail(`npm run drive -- --dossier`)
    return
  }
  journal.ok(`Dépose dans « ${d.dossier_nom} ».`)
  if (d.lien) journal.detail(d.lien)
  journal.detail(`Envoyer un master : npm run drive -- <slug>`)
})

/** Le master d'une vidéo, quel que soit le nom qu'il porte. */
function trouveLeMaster(v, slug) {
  const candidats = [
    path.join(v.rendu, `${slug}.mp4`),
    path.join(v.rendu, 'master.mp4'),
  ]
  for (const c of candidats) if (fs.existsSync(c)) return c
  // Le dossier de rendu peut contenir des essais : on prend le plus gros, qui
  // est le master dans tous les cas de figure observés.
  if (fs.existsSync(v.rendu)) {
    const mp4 = fs
      .readdirSync(v.rendu)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => ({ f, o: fs.statSync(path.join(v.rendu, f)).size }))
      .sort((a, b) => b.o - a.o)
    if (mp4.length) return path.join(v.rendu, mp4[0].f)
  }
  throw new Error(`Aucun rendu pour « ${slug} ». Lance le rendu d'abord.`)
}

/** Lit une valeur sur l'entrée standard, sans la laisser dans l'historique. */
function lisLEntreeStandard(quoi) {
  return new Promise((resoud) => {
    if (!process.stdin.isTTY) {
      let tampon = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (d) => (tampon += d))
      process.stdin.on('end', () => resoud(tampon.trim()))
      return
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`${quoi} : `, (r) => { rl.close(); resoud(r.trim()) })
  })
}
