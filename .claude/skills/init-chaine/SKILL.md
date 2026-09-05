---
name: init-chaine
description: Initialise un dossier de chaîne de A à Z — socle marketing (fiche produit, avatars, hook bank, marketeur), veille de niche, puis direction artistique, formats vidéo, architecture de chaîne et premier calendrier. Utilise cette skill quand l'utilisateur démarre une nouvelle chaîne, un nouveau compte, un nouveau produit ou un nouveau segment, quand il vient de copier le dossier template, ou quand il mentionne : initialiser la chaîne, nouveau projet, nouvelle chaîne, démarrer, brief produit, on part de zéro, configurer le dossier. Déclencheurs — "/init-chaine", "on lance une nouvelle chaîne", "j'ai un nouveau produit", "initialise ce dossier". Toujours répondre en français.
---

# Initialiser une chaîne

Un dossier = une chaîne = un avatar = un segment = un produit. Cette skill transforme le dossier template en usine à contenu pour **une** marque.

Cinq phases, dans cet ordre. **On ne saute pas une phase et on ne les inverse pas** : chacune a besoin de ce que la précédente a produit. En particulier, la direction artistique et les formats se décident **après** la veille — choisir avant d'avoir vu la niche, c'est choisir au hasard.

Compter 1 à 2 heures avec l'utilisateur, dont l'essentiel en phase 1. C'est le seul moment où on lui prend du temps ; ensuite la chaîne tourne.

---

## Avant de commencer

1. Lis `config/chaine.json`. Si `initialise` vaut `true`, **arrête-toi** et demande ce qu'il veut reprendre (le socle ? la direction artistique ? juste le calendrier ?). N'écrase jamais un socle existant sans accord explicite.
2. Lance `npm run verifie`. S'il manque un outil ou une clé, dis-le maintenant : ça évite de découvrir en phase 2 qu'aucune clé Apify ne répond.
3. Annonce le plan à l'utilisateur en cinq lignes, dis-lui combien de temps ça va prendre, puis commence.

---

## Phase 1 — Le socle marketing

**Délègue entièrement à la skill `avatars-et-produit`.** Ne réécris pas sa méthode : invoque-la.

Une seule consigne à lui passer : **le dossier de travail est `marque/`**, pas un sous-dossier `<projet>/`. Les quatre livrables doivent atterrir en :

- `marque/Fiche-Produit.md`
- `marque/Fiche-Avatars.md`
- `marque/Hook-Bank.md`
- `marque/Le-Marketeur.md`

Elle enchaîne d'elle-même produit → avatars → hook bank → marketeur, avec ses propres règles. Laisse-la aller jusqu'au bout, y compris ses questions.

Quand elle a fini, reviens ici et remplis `config/chaine.json` :

- `identite.nom`, `identite.promesse`, `identite.en_une_phrase`
- `produit.*` d'après la fiche produit
- `avatar.nom`, `avatar.segment`, `avatar.niveau_de_conscience` — **l'avatar général**, celui à qui la chaîne parle par défaut. Les autres restent dans la fiche avatars et servent à varier les angles.
- `marketeur.nom`, `marketeur.posture`

**Verrou :** tant que les quatre fichiers n'existent pas, on ne passe pas en phase 2.

---

## Phase 2 — Voir la niche

On regarde ce qui existe avant de décider quoi que ce soit.

### 2.1 Veille YouTube

Invoque la skill `veille-youtube`.

Construis les requêtes à partir du socle, pas de ton intuition :

- le vocabulaire client réel de `Fiche-Produit.md` — ce sont les mots que les gens tapent ;
- les problèmes résolus, reformulés comme une recherche (« comment… », « pourquoi… », « meilleur… », « erreur… ») ;
- les mots exacts de chaque avatar dans `Fiche-Avatars.md`.

Vise 40 à 80 vidéos sur 4 à 8 requêtes. Demande à l'utilisateur s'il connaît déjà des chaînes concurrentes : deux bonnes chaînes valent mieux que dix requêtes.

### 2.2 Décodage TikTok

Demande : « Envoie-moi 5 à 15 liens de TikToks ou de Reels qui t'ont marqué dans cette niche — les tiens, ceux des concurrents, ou juste ceux qui t'ont arrêté au scroll. »

S'il en a, invoque `decodage-tiktok`. S'il n'en a pas, ne bloque pas : note-le comme un trou à combler et continue. La veille YouTube seule suffit à décider des formats.

### 2.3 Ce qu'on en retient

Écris `veille/synthese.md`, court et tranché :

- **Les formats qui dominent** : long ou court, face caméra ou faceless, durées réelles observées.
- **Les codes visuels** : ce que font toutes les miniatures qui marchent, ce que font tous les montages.
- **Les angles saturés** : ce que tout le monde dit déjà. On n'y va pas, ou on y va à contre-courant.
- **Les trous** : les requêtes à intention claire dont les meilleurs résultats sont médiocres, anciens ou hors sujet. Ce sont nos premières vidéos.
- **Le plafond réaliste** : combien de vues font les bonnes vidéos de cette niche. Sert à calibrer les attentes et les seuils de `/bilan`.

---

## Phase 3 — Direction artistique et formats

Maintenant qu'on a vu, on décide.

### 3.1 Les formats

Propose les formats à activer **avec la raison tirée de la veille** pour chacun. Formulation attendue : « Dans cette niche, les vidéos qui rankent sur les requêtes "comment" sont des screencasts de 8 à 12 minutes ; le face caméra ne domine que sur les sujets d'opinion. Je propose long-screencast et short-face. »

**Jamais plus de trois formats au démarrage.** Une chaîne qui fait tout ne fait rien bien, et chaque format a sa propre courbe d'apprentissage.

Reporte dans `config/chaine.json` → `formats` (avec les durées cibles observées) et dans le tableau de `marque/ligne-editoriale.md`.

### 3.2 La direction artistique

Remplis `marque/identite-visuelle.md` section par section, en montrant tes choix au fur et à mesure. Deux principes :

- **Chaque choix se justifie par la veille ou par l'avatar.** « Fond sombre parce que la niche est en fond clair et qu'on veut trancher au scroll » est une raison. « Fond sombre parce que c'est joli » n'en est pas une.
- **On tranche.** Trois polices, une couleur d'accent, un style de sous-titres. Une direction artistique qui garde toutes les options ouvertes n'en est pas une.

Demande explicitement :

- s'il a déjà des polices, un logo, une charte → à déposer dans `assets/` ;
- des références visuelles qu'il aime (captures, liens) → analyse-les et nomme ce qui s'y joue ;
- ce qu'il refuse absolument.

Reporte les valeurs machine dans `config/chaine.json` → `identite_visuelle`.

### 3.3 La voix

Trois questions :

1. **Quel mode ?** `sts` (il enregistre, ElevenLabs remplace le timbre), `brute` (sa voix telle quelle), `tts` (voix synthétique), `avatar` (HeyGen). Le défaut est `sts`.
2. Si `sts` : quelle voix ElevenLabs ? Aide-le à choisir, note l'identifiant dans `voix.elevenlabs_voice_id`.
3. **Fais un aller-retour complet maintenant** : demande-lui 30 secondes d'enregistrement, passe-les dans la transcription puis dans le speech-to-speech, fais-lui écouter. C'est le seul moyen de savoir si la chaîne technique fonctionne avant d'avoir tourné une vraie vidéo. Une voix décevante se corrige ici, pas après trois heures de tournage.

Remplis `marque/ligne-editoriale.md` §4 à partir de `Le-Marketeur.md`.

---

## Phase 4 — Architecture de chaîne

Invoque la skill `strategie-contenu`. Passe-lui `veille/synthese.md` et laisse-la travailler — ne double pas son travail.

Ce que tu vérifies en sortie :

- chaque pilier de `ligne-editoriale.md` a sa vidéo pilier et au moins trois satellites ;
- chaque satellite sait vers quelle vidéo il pointe et laquelle pointe vers lui ;
- chaque problème majeur de `Fiche-Produit.md` est couvert par au moins une vidéo prévue.

---

## Phase 5 — Premier calendrier et clôture

### 5.1 Calendrier

Douze premières vidéos dans `strategie/calendrier.md`, dans un ordre qui a du sens :

1. **Les trois premières sont des satellites**, pas des piliers. On apprend à monter sur des vidéos à faible enjeu, et on ranke sur des requêtes moins disputées.
2. Ensuite le premier pilier, quand la chaîne a de quoi le mailler.
3. Chaque long format est accompagné d'un ou deux shorts qui en extraient un angle.

Chaque ligne porte : date, format, pilier, angle, avatar visé, niveau de conscience, mot-clé cible, slug.

### 5.2 Clôture

Passe `initialise` à `true`, renseigne `date_init`, puis affiche un récapitulatif d'une page :

- ce qui a été écrit, fichier par fichier ;
- les trous restants — les « à valider » du socle, les clés manquantes, les formats non testés ;
- la commande suivante : `/script <sujet de la première vidéo>`.

---

## Ce qui fait échouer une initialisation

- **Inventer le socle** au lieu de le tirer de l'utilisateur. Un avatar inventé produit des scripts génériques, et un script générique ne fait rien. En cas de trou : écris « à valider » et signale-le.
- **Décider la direction artistique avant la veille.** Voir phase 3.
- **Activer six formats.** Voir 3.1.
- **Ne pas tester la chaîne technique** avant la première vraie vidéo. Voir 3.3.
- **Un calendrier de douze piliers.** Les piliers coûtent cher et restent invisibles tant qu'aucun satellite ne pointe vers eux.
