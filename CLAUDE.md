# CLAUDE.md — cerveau de la chaîne

> Ce fichier est lu à chaque conversation. Il dit **ce qu'est ce dossier**, **ce que tu as le droit de faire**, et **dans quel ordre**. Tout le reste en découle.

---

## 1. Ce qu'est ce dossier

**Un dossier = une chaîne = un avatar = un segment marketing = un produit.**

Ce dossier est un **template réplicable**. On le copie pour lancer une nouvelle chaîne, on l'initialise une fois, et il devient l'usine à contenu d'une seule marque. Deux produits différents ⇒ deux dossiers différents. Jamais de mélange.

**Langue de travail et de production : le français.** Tu réponds en français, tu écris les scripts en français, tu documentes en français.

## 2. Règle d'or

**L'écriture se décide dans la conversation. TOUT LE RESTE se pilote dans l'atelier — et rien ne
se tape au terminal.**

La ligne ne passe pas entre « avec interface » et « sans interface » : elle passe entre **juger**
et **exécuter**.

**Juger, c'est la conversation.** Un angle, une forme de script, un hook, un verdict de
performance. Ces étapes n'ont pas de bouton parce qu'elles n'ont pas de résultat qu'on valide
d'un clic : on en discute, on les reprend, on les refuse. Elles restent ici, dans le fil.

**Exécuter, c'est l'atelier** — l'interface locale ouverte par `npm run atelier`. Déposer un
audio, écouter huit voix, régler la graisse d'un contour, relancer le calage, télécharger le
master. Ce sont des gestes qui se voient et s'entendent, pas des décisions qui s'argumentent.
Les faire passer par des phrases était le vrai défaut d'ergonomie.

**L'atelier a deux espaces, et ils ne font pas le même métier.** « Production »
fabrique une vidéo : sept étapes, un ordre, un slug ouvert. « Inspirations » est
un carnet de références qui appartient à la CHAÎNE — on y colle un lien TikTok
ou YouTube, la vidéo est rapatriée et transcrite en local, et on la revoit avec
son texte à côté. Ni étape, ni ordre, ni slug : ce qu'on y garde resservira sur
la dixième vidéo comme sur la première. Le second n'est pas une huitième marche
du premier, et le présenter ainsi mentirait sur ce qu'il est.

### RIEN NE SE TAPE AU TERMINAL. C'EST LA RÈGLE, ET ELLE PRIME.

Demandé quatre fois, refusé trois : **aucune capacité de ce dossier ne s'atteint en tapant une
commande à la main.** Tout ce qui s'exécute a son bouton dans l'atelier. Un chemin qui n'existe
qu'au terminal est un défaut à corriger, pas un arbitrage à défendre.

Ça ne contredit pas la contrainte 1 ci-dessous, et il faut voir pourquoi : **une commande existe
toujours, elle ne se TAPE plus.** Le CLI reste la couche qui fait le travail — c'est ce qui rend
l'atelier remplaçable et testable — mais l'écran doit toujours offrir de quoi la lancer.

**Le trousseau a son écran**, et c'était le dernier geste qui obligeait le terminal. On clique sur
les soldes, dans l'en-tête : la liste par service, l'état de chaque clé, l'ajout, le retrait, le
dégel. Un message d'échec de clé porte un bouton qui y mène — on ne réécrit pas le message de la
commande, qui est juste au terminal, on lui accroche la porte qui va avec.

**La valeur saisie part sur l'ENTRÉE STANDARD**, jamais en argument : une ligne de commande se lit
dans la liste des processus et finit dans `t.commande`, donc dans le journal affiché à l'écran.
`cles.mjs --valeur=-` existe précisément pour ça. La promesse de démarrage a donc été corrigée —
elle disait « aucune clé ne traverse ce serveur », ce qui cesse d'être vrai pour celle qu'on tape ;
elle dit maintenant ce qui l'est : aucune clé n'est journalisée ni passée en argument. Vérifié : la
commande enregistrée est `--ajoute=claude --valeur=- --json`, et la valeur n'apparaît nulle part
dans la réponse.

**`cles.mjs --ajoute` NE VÉRIFIE PAS la clé** — il refuse un doublon et le gabarit d'exemple, rien
de plus, aucun appel au service. L'écran ne dit donc pas « vérifiée » : il dit qu'elle sera essayée
au premier appel, et qu'un refus l'enverra au frigo. Annoncer une vérification qui n'a pas eu lieu
ferait chercher ailleurs le jour où la clé est fausse.

**Ce que ça impose à chaque modification** — et c'est une consigne d'écriture de code, pas un vœu :

- une capacité nouvelle se livre avec sa **commande ET son bouton**, dans le même changement ;
- un message d'erreur qui dit « lance `npm run …` » est un **bug d'ergonomie** : il doit nommer
  l'écran où le geste se fait. La commande, elle, garde son message de terminal — « va à l'étape 3 »
  ne veut rien dire dans un terminal, et les deux publics ne lisent pas au même endroit ;
- un manque qui bloque (pas de clés, pas de dépendances, pas de modèle entraîné, pas d'identité)
  s'affiche **là où il bloque**, avec le bouton qui le comble ;
- ce qui se répare deux écrans plus loin se dit **aussi** là où on le constate, avec de quoi y
  aller.

**La seule exception, et elle est étroite : ce qui s'ÉCRIT.** Un script, un angle, un hook, un
verdict de performance. Ce ne sont pas des gestes qu'on exécute, ce sont des textes qu'on
argumente, qu'on reprend et qu'on refuse. La première interface de ce dossier est morte d'avoir
voulu les mettre sur un bouton — un clic sur « Écrire le script » a rendu un brief puis s'est
arrêté, faute de pouvoir donner la validation que la skill exigeait.

Tout le reste — y compris l'identité de la chaîne, qui était l'exception d'hier — est à l'écran.

**Trois contraintes, et elles ne se négocient pas :**

1. **Aucune logique métier dans l'atelier.** Chaque capacité existe d'abord comme commande
   utilisable seule au terminal. L'interface l'appelle, affiche son journal, montre son résultat.
   Si l'atelier disparaît demain, la chaîne se produit encore. Ce n'est PAS une permission de
   s'arrêter à la commande : voir la règle ci-dessus.
2. **Chaque étape se valide avant la suivante.** L'atelier ne fabrique jamais une vidéo d'un
   bout à l'autre sans qu'on ait dit oui entre-temps. C'est précisément ce qui manquait à la
   première tentative.
3. **Aucun appel payant sans annonce du coût.** Les seuils du §7 valent dans l'atelier comme
   ailleurs, et l'écran l'affiche avant de lancer.

### Une première tentative a échoué. Il faut savoir pourquoi.

Le 28 août 2026, une interface locale a été construite : serveur Node, onglets par étape de
production, lancement de commandes avec journal en direct, dépôt de rushes, et même un appel à
Claude Code en mode non interactif pour les étapes qui demandent de réfléchir. Elle fonctionnait.
Elle a été supprimée le jour même.

**Ce qu'elle avait raté :** elle mettait un bouton sur *tout*, y compris sur les étapes de
jugement. Le symptôme est net — un clic sur « Écrire le script » a produit un brief, puis s'est
arrêté net : la skill exige une validation avant d'écrire, et personne ne pouvait la donner. Il a
fallu revenir dans la conversation, et le reste a suivi.

Ce n'est donc pas l'interface qui était l'erreur, c'est son périmètre. L'atelier reprend
exactement la moitié qui marchait : **du dépôt de l'audio au téléchargement du master**. Il ne
prétend pas écrire.

Reste hors atelier, définitivement : l'écriture de script, le choix d'un angle, la stratégie, le
bilan de performance. Et `npx remotion studio` reste ce qu'il était — un scrub de timeline, pas
un pilotage.

### L'identité se déclare à l'écran. Le socle, lui, se discute.

`/init-chaine` était le SEUL chemin vers un nom, un format actif et une palette — et il sort du
logiciel. Une chaîne neuve restait donc sans identité, et l'écran ne pouvait que le constater :
pour poser deux couleurs, il fallait fermer l'atelier, ouvrir Claude Code et entamer un entretien
d'une heure.

`npm run initialise` est l'autre chemin. Elle **DÉCLARE** ce qu'on sait déjà — nom, promesse,
produit, avatar, marketeur, registre, formats actifs, cadence, palette, polices —, sans appel
réseau, sans clé, sans modèle. L'atelier l'appelle depuis le bandeau d'initialisation et depuis
« Identité » sur la ligne de la chaîne ouverte. Un champ laissé vide reste vide ; on revient
régler une couleur six mois plus tard sans retaper la promesse.

**Une chaîne est « initialisée » dès qu'elle a un NOM, et rien d'autre.** Le drapeau ne dit pas
que le socle marketing est fait — aucun champ de `chaine.json` ne peut le dire. Il dit qu'une
identité existe. Exiger davantage le rendrait inatteignable depuis un écran, ce qui était le
problème.

**Ce que la commande n'est pas.** Elle n'invente pas d'avatar, ne fait pas de veille, n'écrit pas
de hook bank. Les quatre fiches de `marque/` sont posées en **gabarits**, et leur en-tête dit
franchement qu'elles n'ont pas été écrites — une fiche produit de trois lignes qui ressemble à une
fiche produit est le pire des deux mondes : on croit l'avoir faite, on ne la refait jamais, et
chaque script s'écrit sur du vide. Une fiche déjà présente n'est jamais écrasée.

L'entretien reste, et reste meilleur pour le socle. Il n'est simplement plus la porte d'entrée.

**`cle` EST UN MOT INTERDIT DANS UNE SORTIE `--json`.** `lib/journal.mjs` masque la valeur de
toute propriété dont le nom correspond à `/token|key|cle|secret|password|authorization/`. Le champ
`{ cle: 'long_face_camera' }` ressortait donc de l'atelier en « long…mera », et les cases à cocher
de l'écran étaient illisibles. Le filet faisait exactement son travail, sur un mot qui ne désignait
ici qu'un format vidéo. **On ne desserre pas le filet, on nomme le champ autrement** — ici
`format`.

### Une chaîne neuve s'ouvre. Elle ne se remplit pas toute seule.

L'atelier exigeait `initialise: true` pour démarrer, et refusait la bascule vers une chaîne qui
ne l'était pas. Or **aucune chaîne fraîchement copiée ne l'est** : le bouton « Nouvelle chaîne »
de cet écran fabriquait donc, à tous les coups, une ligne que le même écran refusait ensuite
d'ouvrir — « pas encore initialisée », et un chemin à copier. Un bouton qui produit une chose que
l'écran ne sait pas afficher est un bouton qui ment.

Le verrou n'était pas dans le pipeline : **aucune commande de `pipeline/` n'exige
l'initialisation**. L'atelier était plus strict que ce qu'il pilote. Il s'ouvre maintenant, et
écrit en tête ce qui manque avec le dossier où ouvrir Claude Code.

Ce qui n'a pas bougé : `/init-chaine` reste un entretien, et il se mène en conversation. Le dépôt,
la transcription, le carnet et les avatars n'attendent rien de lui ; le montage, si — sans
direction artistique il n'a ni police, ni couleur, ni style de sous-titres.

**Créer une chaîne est UN geste, pas trois.** « Créer » ne faisait que copier le code. Il fallait
ensuite cliquer « Installer ses dépendances » dans une note en bas du panneau, puis retrouver la
ligne de la chaîne et cliquer « Ouvrir » — trois gestes séparés par deux écrans, pour une suite
qui n'a qu'un ordre possible et aucune décision. C'était le §2 mal appliqué : la règle sépare ce
qui se JUGE de ce qui s'exécute, pas les étapes d'une même exécution. Copier, installer, entrer
s'enchaînent maintenant sous un seul bouton, journal ouvert. Les clés sont copiées **par défaut** :
sans elles une chaîne neuve ne peut ni chercher un plan de coupe, ni fabriquer une voix, ni
scraper la niche.

**Et une chaîne neuve PRODUIT, même sans `/init-chaine`.** La cascade des sous-titres retombe sur
le modèle Hormozi et les polices embarquées : vérifié sur une chaîne à `identite_visuelle` vide,
elle rend treize réglages complets — Montserrat, mot-à-mot couleur, 78 px. Le montage tourne avec.
Ce que l'entretien apporte est **éditorial** — produit, avatar, marketeur — et une direction
artistique qui soit la sienne plutôt qu'un défaut neutre. L'écran le disait de travers : il
annonçait « ni police, ni couleur, ni style de sous-titres », ce qui est faux et décourageait
d'essayer.

Ce qui ne s'enchaîne toujours pas : `/init-chaine`. C'est un entretien, et la première interface
de ce dossier est morte d'avoir voulu le mettre sur un bouton.

**`node_modules` ne voyage pas, et la liste le dit.** Il pèse trois cents mégaoctets,
`nouvelle-chaine` ne le copie pas, et §4 pose qu'un dossier de chaîne se déplace d'un poste à
l'autre : le second n'a rien d'installé. La ligne proposait « Ouvrir », l'essai à blanc échouait
sur un `ERR_MODULE_NOT_FOUND` illisible, et on restait sur place sans savoir quoi faire. Le manque
est maintenant écrit sur la ligne, avec le bouton qui le comble.

**On change de chaîne en cliquant sur la CHAÎNE.** Le bouton portait le mot « Atelier » — le nom
du logiciel — et le nom de la chaîne vivait juste en dessous, en gris, inerte. Pour en changer il
fallait cliquer sur ce qui ne la désignait pas. Le titre redevient un titre, le nom de la chaîne
devient le bouton, et il porte un chevron. Il retombe sur le **nom du dossier** quand
`identite.nom` est vide : sur une chaîne neuve le bouton se réduisait à son chevron, trois pixels
de large, et on se retrouvait enfermé dans la chaîne qu'on venait d'ouvrir.

**Le solde Fish est dans l'en-tête, à côté de fal et d'ElevenLabs.** Il manquait alors que c'est le
plus vite dépensé des trois : une voix off de dix minutes coûte quinze centimes, et on en refait
cinq avant d'être content. Les deux services de voix se suivent — on arbitre entre eux, et un
arbitrage se lit mieux quand les deux chiffres sont côte à côte. `cles.mjs --quotas` distingue
« aucune clé fish » de « solde indisponible » : `credit()` rend `null` dans les deux cas, et les
deux appellent des gestes opposés.

**Le garde « travail en cours » attend avant de refuser.** Il existe pour une bonne raison — un
montage qui écrit dans l'ancienne chaîne pendant qu'on regarde la nouvelle —, mais il refusait au
PREMIER travail venu, et l'atelier en lance tout seul : le solde des services payants se relit à
chaque retour dans la fenêtre, et rouvrir le menu des chaînes EST un retour dans la fenêtre.
`cles.mjs --quotas` met quatre secondes. Cliquer « Ouvrir » pendant ces quatre secondes se soldait
donc par un refus, sur une commande qui ne fait que lire des soldes. Relevé le 7 septembre 2026 :
six lancements en trois minutes, rien qu'en cliquant dans l'écran — d'où un refus qui paraissait
aléatoire, sa cause étant invisible.

Classer les commandes en « lit » et « écrit » aurait demandé d'auditer quarante appels et de
rejuger chaque nouveau. **Le temps suffit à trancher** : ce que l'atelier lance de lui-même dure
des secondes, ce qui écrit vraiment — montage, rendu, entraînement — dure des minutes. On attend
donc cinq secondes, et on ne refuse que ce qui tourne encore après. Et le refus **nomme** le
travail et son âge : « 1 travail(aux) en cours » n'apprenait ni quoi, ni depuis quand, ni s'il
fallait attendre ou aller le tuer.

### Une chaîne n'hérite de RIEN, pas même de l'esthétique

`nouvelle-chaine` vidait l'identité, le produit, l'avatar, la voix et le Drive, et laissait passer
deux choses qui disent la marque aussi fort que les autres :

- **le bloc `identite_visuelle`** entier — polices, palette, style de sous-titres, ambiance, et
  jusqu'à `direction_plans`, cette phrase ajoutée à *chaque* requête de banque d'images. Une
  chaîne neuve recevait l'esthétique de la précédente sans que rien ne le dise, et `derivee_de`
  pointait un logo qui n'existait pas chez elle ;
- **`marque/identite-visuelle.md` et `marque/ligne-editoriale.md`**, copiés comme des gabarits
  alors que `marque/LISEZ-MOI.md` dit qu'ils sont écrits par `/init-chaine` après la veille. Dans
  une chaîne qui produit, ce sont deux documents pleins : une promesse, des piliers, ce qu'on ne
  dit jamais.

Les deux repartent vides, avec les handles de plateforme et la musique de fond. Le §6 l'interdit,
le §1 dit pourquoi.

## 3. Le pipeline

Huit étapes. Chacune a une commande, une skill, et un dossier de sortie. On ne saute pas une étape : chacune lit ce que la précédente a écrit.

| # | Étape | Commande | Écrit dans |
|---|---|---|---|
| 0 | **Initialiser la chaîne** — brief produit, avatar, marketeur, identité visuelle | `/init-chaine` | `marque/`, `config/chaine.json` |
| 1 | **Veille YouTube** — ce qui marche dans la niche : miniatures, titres, transcripts, perf | `/veille` | `veille/youtube/` |
| 2 | **Décoder TikTok** — l'utilisateur colle des liens, on extrait stats + texte + pourquoi ça a marché | `/decode` | `veille/tiktok/` |
| 3 | **Stratégie** — mots-clés par intention, matrice d'angles, architecture de chaîne, maillage interne, calendrier | `/plan` | `strategie/` |
| 4 | **Écrire** — un script par vidéo, dans le format retenu | `/script` | `videos/<slug>/01-script.md` |
| 5 | **Brief de tournage** — prompteur, découpage, consignes de prise | `/tournage` | `videos/<slug>/02-tournage/` |
| 6 | **Monter** — transcription, coupe, voix, sous-titres, B-roll, motion, rendu | `/monte` | `videos/<slug>/06-rendu/` |
| 7 | **Publier** — titre, description, tags, chapitres, miniature, maillage interne | `/publie` | `videos/<slug>/07-publication.md` |
| 8 | **Bilan** — perf à J+7 / J+28, ce qu'on double, ce qu'on tue | `/bilan` | `perf/` |

L'ordre normal est 0 → 1 → 2 → 3 puis une boucle 4 → 5 → 6 → 7 → 8 par vidéo. La boucle réalimente l'étape 3.

### Fabriquer la prise au lieu de l'enregistrer

Sur une chaîne à avatar, personne ne parle : le texte existe, la voix se fabrique.
`npm run parle` comble exactement ce trou, et **le résultat est une prise comme une autre** — il
se dépose dans `02-tournage/`, à l'endroit où l'on aurait posé un enregistrement. Tout ce qui
suit (transcription mot à mot, sous-titres calés, couverture en plans de coupe) fonctionne sans
savoir d'où vient le son. Une branche « pipeline TTS » aurait dupliqué six étapes pour une seule
différence.

**Le modèle entraîné de `marque/voix/` ne sait pas lire, et c'est structurel.** RVC est un
CONVERTISSEUR de timbre : il transforme une voix en une autre, il lui faut une source parlée. Et
c'est la source qui porte l'intonation — le modèle ne fait que plaquer le timbre par-dessus. La
source gratuite d'Applio, edge-tts, est plate. Fish fait les deux d'un coup : il lit, et il lit
avec du relief.

**L'intonation se joue sur trois leviers, et le premier est le TEXTE.** Fish lit `(soupir)`,
`(agacé)`, `(rires)`, `(chuchote)` comme des indications de jeu, pas comme des mots. Mesuré le
4 septembre 2026 : à réglages égaux, c'est le texte marqué qui rend la lecture la plus vivante,
devant la seule montée de température. Une phrase plate reste plate quel que soit le réglage —
d'où les marqueurs cliquables dans l'écran plutôt qu'à taper de mémoire.

Les deux autres leviers : `temperature` (0,92 par défaut — à 0,5 la lecture est régulière et
morte) et le modèle (`s2.1-pro`, retenu à l'oreille devant `s1` et `speech-1.6`).

**Le script se DIRIGE avant d'être lu.** Poser les marqueurs à la main marche sur trois phrases
et jamais sur un script de dix minutes — et une lecture sans marqueur est une lecture régulière,
c'est-à-dire morte. La passe de direction lit le script, décide ce que chaque phrase doit faire
ressentir, et pose les indications aux **virages** — là où l'émotion change, pas partout : un
marqueur sur tout est un marqueur sur rien.

Elle rend le texte marqué **dans le champ de saisie**, et s'arrête là. On le relit, on le corrige,
on le refuse. Enchaîner sur la lecture ferait payer une génération avant d'avoir pu juger ce que
la machine a compris — et une direction d'acteur qu'on ne voit pas est une direction qu'on ne peut
pas juger (§2).

**UN MARQUEUR EST UN ÉVÉNEMENT, PAS UNE COULEUR — et c'est mesuré.** On les croyait de deux
natures : les sons d'un côté, les intentions de l'autre. Relevé le 5 septembre 2026, même phrase,
même voix, mêmes réglages :

| | durée | écart |
|---|---|---|
| nue | 2,04 s | — |
| `(rires)` devant | 2,14 s | +0,09 |
| `(agacé)` devant | 2,28 s | +0,23 |
| `(sourire dans la voix)` devant | 2,55 s | **+0,51** |
| ponctuation seule — « exactement... comme prévu » | 2,60 s | **+0,56** |

Aucun silence en tête dans aucun cas. La demi-seconde du « sourire » est donc un **événement
vocal collé au début** : Fish joue le marqueur, puis récite la suite à plat. À l'oreille, elle
s'arrête et rit — un hoquet, pas une intention.

**MAIS UN SAUT DE LIGNE N'EST PAS DE LA PONCTUATION : C'EST UNE PAUSE PAYANTE.** Première
application de la règle ci-dessus, et elle a raté pour cette raison. Le même script rendu en un
bloc fait **18,79 s** ; découpé en phrases séparées par des lignes vides, **21,39 s** — 2,6 s de
blanc ajouté, 0,3 s à chaque coupure. La lecture devient une suite d'énoncés indépendants,
« séquencée », exactement le défaut qu'on croyait éviter en aérant.

Le texte dirigé revient donc en **un seul bloc**, et la consigne l'interdit explicitement. Un
filet le nettoie quand même : un modèle aère spontanément un texte long, et demander poliment ne
suffit pas quand la conséquence est mesurable.

`chunk_length` (plage 100–300) n'y est pour rien : 18,82 s au minimum contre 18,79 s par défaut.

**Et la ponctuation fait mieux, sans rien pouvoir casser.** Elle change la lecture autant que le
marqueur le plus fort, et elle ne peut pas produire de bruit parasite : elle n'est pas jouée, elle
est lue. C'est donc le levier PRINCIPAL de la direction, et les marqueurs sont l'exception —
`(rires)` et `(soupir)` deux fois par script au plus, là où le son est voulu ; les autres à un
vrai virage, jamais sur deux phrases de suite. Sur le même script, la direction est passée de six
marqueurs à un seul.

L'écran les sépare en deux rangées, et les sonores sont en pointillés : les mélanger laissait
croire à neuf nuances équivalentes, alors que deux d'entre elles font du bruit.

**L'ÉNERGIE SE GAGNE DANS LE TEXTE, PAS AU VOLUME.** Deux mesures du 5 septembre 2026 :

| levier | sonie moyenne | crête | verdict |
|---|---|---|---|
| référence | −19,8 dB | −3,6 dB | — |
| `prosody.volume: 6` | −15,3 dB | **0,0 dB** | **écarté** — c'est de l'écrêtage, pas de la puissance (§9) |
| texte punchy (`!`, un mot en CAPITALES) | −19,6 dB | −2,7 dB | retenu |
| punchy + `temperature` 1,0 | −19,7 dB | −0,7 dB | retenu |

Le texte monte les **crêtes** sans toucher la moyenne : plus d'attaque, plus d'écart entre le posé
et le claqué. C'est ce qu'on entend comme « elle appuie ». Le volume, lui, monte tout et tape le
plafond.

La direction demande donc explicitement une lecture convaincue, poussée dans le micro, jamais
conversationnelle — avec des points d'exclamation, un mot en capitales par paragraphe au plus, et
la chute isolée par des points de suspension. `temperature` passe de 0,92 à **1,0** ; au-delà de
1,1 la lecture part en vrille et invente des accents.

**Le point d'exclamation fait MONTER la fin de phrase — toujours.** C'est ce qui donne l'attaque,
et c'est exactement ce qui ruine une chute grave : « il y a un tableur ! » sonne enthousiaste là
où il faut que ça tombe. Une phrase grave finit sur un point, et tire son poids d'une ellipse
AVANT les derniers mots, jamais du volume. Les points d'exclamation appartiennent aux lignes
énergiques, indignées ou enthousiastes.

**Les sauts de ligne sont retirés du texte, à la source.** Un script collé depuis un traitement
de texte en est plein — et souvent AU MILIEU des phrases, là où la ligne s'est simplement
enroulée. Chacun vaut 0,3 s de blanc : sur un script réel de dix lignes, 1,7 s de pauses, dont
plusieurs en pleine phrase. La lecture est hachée et aucun réglage ne la rattrape.

Le nettoyage se fait dans `parle()`, le seul endroit par lequel passent l'essai, la prise et la
direction. Les mots ne bougent pas ; ce qui bouge est une mise en page qui n'a pas de sens à
l'oral. Une respiration voulue s'écrit avec un point ou des points de suspension, qui sont de
vraies marques prosodiques. Le journal annonce combien de sauts ont été retirés — un nettoyage
silencieux se découvrirait à l'oreille trois essais plus tard, en cherchant ailleurs.

**On entend les soudures, et ce sont les tronçons.** Fish découpe le texte, synthétise chaque
morceau séparément et les recolle : aux joints, le timbre et le fond de pièce sautent. Ce ne sont
pas des blancs — relevé le 5 septembre 2026, aucun silence détectable au-dessus de −32 dB sur
0,08 s dans une prise où les cuts s'entendent. `chunk_length` accepte 100 à 300 ; il est posé au
**maximum**, pour le moins de joints possible. C'est le seul levier exposé sur ce point.

**Le débit monte à 1,12** (`prosody.speed`) : le format court pardonne mal la lenteur. Le même
texte passe de 20,5 s à 18,0 s, et la crête redescend à −1,5 dB — on gagne aussi de la marge avant
distorsion. Réglable par vidéo dans l'écran, de 0,92 à 1,20.

**Attention au plafond.** À ces réglages la crête est à −0,7 dB, soit au-dessus du seuil de
−1 dBTP que le rendu signale. Pousser davantage distordra.

**Les mots ne bougent pas, et c'est vérifié.** Le modèle peut ajouter des marqueurs et retoucher
la ponctuation — une virgule, des points de suspension changent une lecture, et c'est ce qui fait
« appuyer » sur un mot. Il ne peut pas réécrire une phrase : ce serait réécrire le script en
croyant le diriger. La suite des mots est comparée avant/après, et un écart annule tout.

**Trois chemins vers une voix, et le premier est le meilleur pour l'intonation :**

| | d'où vient l'intonation | contrôle | coût |
|---|---|---|---|
| ta prise → modèle entraîné | **toi** | total, jusqu'au mot | rien |
| Fish → modèle entraîné | Fish, dirigé | à la phrase | ~0,15 $ / 10 min |
| Fish seul | idem | à la phrase | idem |

RVC suit ton contour de hauteur note par note : il ne fabrique aucune intonation, il la
**transporte**. Là où tu appuies, ça appuie. En revanche une courbe de prosodie ne se transplante
pas sur un autre texte — la conversion est synchrone au fichier source, il n'y a pas de banque
d'intonations à recopier.

**Un essai n'est pas une prise.** `--essai` écrit dans `03-audio/essais/`, nommé d'après ses
réglages pour que deux essais se comparent au lieu de s'écraser, et ne touche pas au tournage.
Sans cette séparation, chaque écoute écraserait la prise et invaliderait la transcription déjà
calculée.

`prosody.normalize_loudness` est explicitement à `false` : il écraserait la dynamique qu'on vient
de payer pour obtenir, et c'est le §9 appliqué à la synthèse.

### Déposer deux fois EMPILE, et rien ne le disait

Le montage colle les prises bout à bout, dans l'ordre alphabétique — c'est ce qui permet de tourner
en plusieurs fois. Mais déposer trois fois le même fichier donne trois prises, donc quinze minutes
là où on en voulait cinq. Le doublon se voyait dans la **durée**, jamais dans une action : la fiche
joignait les noms par des points, et le seul geste possible était `--retire`, qui enlève TOUT.

`--retire=<prise>` n'en enlève qu'une — « prise-02.mp3 », « prise-02 » ou « 2 », parce qu'on
désigne ce qu'on lit à l'écran. Chaque prise a maintenant sa ligne et son bouton à l'étape 2, et le
compte est écrit quand il y en a plusieurs.

**Ce qui découle part avec, même pour une seule prise.** La piste est la concaténation : en
retirer une la raccourcit, et tout ce qui était calé dessus devient faux. Garder le transcript
donnerait des sous-titres qui suivent une voix qui n'existe plus — le §9, nommément. Rien n'est
détruit : tout va dans `.prises-precedentes/`.

### Le mode de production se lit sur le rush, jamais sur le script

Le fichier déposé dans `02-tournage/` décide du montage :

| Ce qui est déposé | Ce que ça veut dire | Ce que fait le montage |
|---|---|---|
| **un audio seul** (`.mp3`, `.m4a`, `.wav`) | voix off, aucune image tournée | la piste image est construite **entièrement** en plans de coupe, en couverture continue |
| **une vidéo** (`.mp4`, `.mov`) | capture d'écran ou face caméra | l'image tournée est **conservée** ; aucun plan de coupe ne la recouvre, seulement des inserts ponctuels si le script en demande |

Le script déclare un format avant le tournage : il peut se tromper. Le fichier, non. Quand les
deux divergent, le pipeline suit le fichier et le signale.

C'est ce qui permet de mélanger les modes sans rien reconfigurer : une comparaison filmée à
l'écran et une voix off passent par le même pipeline.

## 4. Carte du dossier

```
config/          chaine.json (identité + dossier Drive), keys.json (secrets, jamais versionné)
marque/          fiche produit, avatars, hook bank, marketeur, DA, ligne éditoriale
veille/          youtube/ et tiktok/ — matière brute + synthèses
veille/inspirations/  le carnet : des vidéos gardées à la main, avec leur transcript
strategie/       mots-clés, matrice d'angles, architecture de chaîne, calendrier
videos/<slug>/   une vidéo = un dossier, numéroté de 00 à 07
assets/          polices, LUT, musique, logos, SFX
marque/voix/     les voix récoltées : extraits propres, référence, mesures
marque/avatars/  les visages de la chaîne : photos de référence et signe distinctif
assets/broll/    TES plans de coupe, avec leurs mots-clés — voir §10
pipeline/        le code exécutable (Node) — c'est lui qui fait le travail
remotion/        les compositions de montage
perf/            historique des performances
outils/          scripts utilitaires (autotest, nouvelle chaîne, import de clés)
.claude/         commandes et skills
```

Les binaires lourds (whisper, modèles) ne vivent **pas** ici : ils sont dans un cache partagé
entre toutes les chaînes, hors du dossier. Copier le dossier ne duplique pas trois gigaoctets.

### Produire depuis plusieurs machines

Le dossier d'une chaîne est **autonome et déplaçable** : tout ce qui la définit y est, et rien
n'y référence un chemin absolu. C'est ce qui permet de le poser sur un disque partagé et de
produire depuis deux postes.

Trois règles à respecter pour que ça tienne :

1. **Une vidéo appartient à une machine à la fois pendant son montage.** Deux montages simultanés
   sur le même slug écrivent le même `plan.json` et le même dossier `public/` — le dernier écrase
   l'autre. Rien ne l'empêche mécaniquement : c'est à la personne de ne pas le faire.
   faire.
2. **Les rendus ne se synchronisent pas.** Un master pèse quatre-vingts mégaoctets et se
   reconstruit en huit minutes à partir du plan : le transporter coûte plus cher que le refaire.
   Ce qui doit voyager, c'est `01-script.json`, `04-transcript.json` et `05-montage/` — quelques
   centaines de kilooctets.
3. **Les clés restent locales.** `config/keys.json` n'est jamais versionné ni synchronisé : chaque
   poste a le sien, alimenté par `npm run importe-cles`.

## 5. Ce que tu fais toujours

1. **Tu lis `config/chaine.json` avant toute action de production.** Si `initialise` vaut `false`, tu proposes `/init-chaine` et tu n'inventes rien.
2. **Tu lis `marque/` avant d'écrire quoi que ce soit d'éditorial.** Un script écrit sans l'avatar sous les yeux est un script générique, donc un script mort.
3. **Tu t'appuies sur `veille/` avant de décider d'un angle ou d'un titre.** On ne devine pas ce qui marche : on l'a scrapé.
4. **Tu écris des fichiers, pas des réponses.** Un script, une stratégie, un plan de montage → un fichier dans le bon dossier. La conversation sert à décider, les fichiers à conserver.
5. **Tu vérifies après chaque changement de code** : `npm run verifie` (voir §8). Un pipeline qui ne tourne pas ne sert à rien.
6. **Tu nommes en `kebab-case-sans-accent`** les dossiers de vidéo et les fichiers générés. Le contenu, lui, est en français accentué.
7. **Un slug de vidéo fait DEUX MOTS AU PLUS.** `difficile-obtenir`, pas
   `court-difficile-a-obtenir` : c'est un identifiant, pas un titre. Le vrai titre vit dans le
   script et dans la publication, où il n'a aucune limite. `npm run depose` refuse au-delà, sauf
   sur une vidéo qui existe déjà — la renommer casserait tout ce qui pointe dessus.

## 6. Ce que tu ne fais jamais

- **Tu ne crées pas de frontend.** Voir §2.
- **Tu n'écris jamais une clé API en clair** dans un fichier versionné, un log, un commit ou une réponse. Les clés vivent dans `config/keys.json` et se lisent via `pipeline/lib/trousseau.mjs`. Dans les logs, on affiche `apify_…7Xqm`.
- **Tu ne publies rien tout seul.** Tu prépares le fichier de publication ; c'est l'utilisateur qui met en ligne. Aucun appel d'API de publication sans son accord explicite, à chaque fois.
- **Tu ne supprimes ni rush ni rendu** sans le lui demander. Un tournage ne se refait pas.
- **Tu ne lances pas d'appel payant sans annoncer le coût.** Apify, ElevenLabs et HeyGen coûtent. Tu annonces l'estimation (crédits, euros) et tu attends le feu vert au-delà des seuils de §7.
- **Tu ne re-scrapes pas ce qui est déjà dans `veille/`.** Tu regardes d'abord.
- **Tu ne codes pas en dur la niche, le produit ou l'avatar** dans `pipeline/` ou `remotion/`. Tout ce qui est spécifique à la chaîne vit dans `config/` et `marque/`. C'est ce qui rend le dossier réplicable.

## 7. Appels payants : les seuils

| Action | Sans demander | À faire valider |
|---|---|---|
| Veille YouTube (Apify) | ≤ 100 vidéos | au-delà |
| Décodage TikTok | ≤ 10 liens | au-delà |
| Speech-to-speech ElevenLabs | ≤ 5 min d'audio | au-delà |
| Rendu Remotion | toujours (c'est du CPU/GPU local, gratuit) | — |
| HeyGen | jamais | toujours |

Le trousseau tourne automatiquement entre les clés d'un même service. Si toutes les clés d'un service sont épuisées, tu le dis clairement au lieu d'échouer en silence.

## 8. Commandes du projet

```bash
npm run verifie              # environnement : outils, clés, quotas, modèles
npm run verifie -- --quotas  # interroge les quotas réels des API
npm run autotest             # fabrique une vidéo de test et vérifie toute la chaîne
npm run veille               # veille YouTube
npm run tiktok               # ingestion d'un lien TikTok
npm run inspire              # le carnet d'inspirations
npm run inspire -- <url>     # dépose une vidéo TikTok/YouTube : rapatriée + transcrite
npm run inspire -- --texte=<id>    # son transcript, sur la sortie standard
npm run inspire -- --repagine      # refait les paragraphes des transcripts, hors ligne
npm run inspire -- --retire=<id>   # la retire du carnet, fichiers compris
npm run empreinte -- <source…>        # récolte une voix propre : sépare, mesure, découpe
npm run empreinte -- --depuis=liens.txt --nom="Untel"   # tout un lot, en une fois
npm run empreinte -- --installe-ytdlp # pose ou met à jour yt-dlp (403 YouTube)
npm run empreinte -- --liste          # les empreintes récoltées, et leur durée
npm run empreinte -- --detail=<id>    # source par source, puis extrait par extrait
npm run empreinte -- --remesure=<id>  # cherche un sifflement fixe dans chaque source
npm run empreinte -- --retire-source=<rang> --de=<id>   # UNE source, et ses extraits
npm run empreinte -- --retire=<id>    # la retire, fichiers compris
npm run entraine -- <id>              # apprend le timbre de cette empreinte
npm run entraine -- --liste           # les modèles entraînés
npm run entraine -- --installe        # pose l'outillage d'entraînement, sans entraîner
npm run entraine -- --retire=<id>     # retire le modèle, garde l'empreinte
npm run voix -- <slug> --local        # convertit avec le modèle entraîné, gratuit
npm run voix -- <slug> --local --transpose=12   # si les tessitures diffèrent
npm run monte -- <slug> --voix=local  # le montage complet avec le modèle local
npm run parle -- --voix=?              # les voix du compte Fish
npm run parle -- <slug> --texte="…"    # fabrique la prise à partir du texte
npm run parle -- <slug> --dirige       # pose les marqueurs d'intonation, et s'arrête là
npm run parle -- <slug> --modele-local=myriam   # Fish lit, ton modèle plaque le timbre
npm run parle -- <slug> --essai        # 10 s, pour écouter, sans rien engager
npm run parle -- <slug> --devis        # ce que ça coûterait
npm run transcris            # transcription locale mot à mot
npm run voix                 # remplacement du timbre (ElevenLabs)
npm run monte                # construit le plan de montage
npm run monte -- <slug> --ouverture=ia   # le premier plan généré par IA, les autres en banque
npm run monte -- <slug> --comble=ia      # génère un plan là où la banque n'a RIEN rendu
npm run monte -- <slug> --comble=ia --comble-max=5   # et son plafond
npm run monte -- <slug> --plans-ia=5     # budget de 5 plans générés, placés là où ils
                                         #   servent le plus : le script est lu en entier
npm run broll -- <slug> --estime         # combien de plans de coupe aura ce montage
npm run rends                # produit le MP4
npm run avatars              # les visages de la chaîne, et leurs photos
npm run avatars -- --ajoute=<id> --nom="…" --signe="…" <photos…>
npm run avatars -- --identite=<id>            son identité de jeu
npm run avatars -- --identite=<id> --deduis   la déduit de ses photos et de la marque
npm run avatars -- --identite=<id> --texte="…"   l'écrit à la main
npm run avatars -- --retire=<id>
npm run copie -- <slug> --lien=<url> --avatar=<id>   # rejoue une vidéo avec l'avatar
npm run copie -- <slug> --lien=<url> --avatar=<id> --devis   # le prix, sans rien lancer
npm run ecris -- <slug>      # déduit le script d'une prise DÉJÀ enregistrée
npm run ecris -- <slug> --force   # le réécrit
npm run drive                # le Drive de la chaîne : connexion, dossier, état
npm run drive -- --aide      # ce qu'il faut faire dans la console Google, une fois
npm run drive -- --connecte  # autorise CE poste (une fois par machine)
npm run drive -- --dossier   # crée le dossier de la chaîne dans ton Drive
npm run drive -- <slug>      # y dépose le master de cette vidéo
npm run etat                 # où en est chaque vidéo, déduit du disque
npm run etat -- <slug>       # le détail d'une vidéo, étape par étape
npm run depose -- <slug> <fichier>    # range un rush dans 02-tournage/
npm run depose -- <slug> --retire=2   # ne retire QUE cette prise-là
npm run depose -- <slug> --retire     # met de côté la prise ET ce qui en découle,
                                      #   pour en déposer une autre
npm run supprime -- <slug>   # met la vidéo de côté dans videos/.corbeille/
npm run supprime -- --corbeille       # ce qui est de côté, et depuis quand
npm run supprime -- --restaure=<nom>  # la remet dans videos/
npm run soustitres -- <slug>          # les réglages de sous-titrage, et leur origine
npm run soustitres -- <slug> --applique   # les pose dans le plan SANS remonter
npm run texte -- <slug>      # les mots transcrits, avec leurs temps
npm run texte -- <slug> --incertains  # ceux dont Whisper doutait — à relire en premier
npm run texte -- <slug> --trous       # les silences où des mots ont pu être SAUTÉS
npm run transcris -- --defaut=<modele>   # la qualité d'écoute de la CHAÎNE
npm run transcris -- <slug> --refais     # tout réécouter, et remettre le plan d'accord
npm run texte -- <slug> --chiffres    # les nombres dits en lettres, mis en chiffres
npm run soustitres -- <slug> --defaut # ces réglages deviennent ceux de la chaîne
npm run broll                # tes propres plans de coupe, et leurs mots-clés
npm run broll -- --ajoute=<fichier> --mots="produit,guide"
npm run broll -- <slug>      # où ils tomberaient dans cette vidéo, et pourquoi
npm run broll -- <slug> --plans        # les plans de coupe du montage, un par un
npm run broll -- <slug> --lisibilite   # les plans dont le fond avalerait les sous-titres
npm run broll -- <slug> --efface-plans # détruit la piste image, garde les sous-titres
npm run monte -- <slug> --refais-plans # écarte les plans déjà employés, pour en avoir d'autres
npm run broll -- <slug> --remplace=3   # en échange un contre un autre candidat
npm run studio -- <slug>     # aperçu, pour contrôler avant de rendre
npm run initialise           # l'identité de la chaîne : nom, formats, palette
npm run initialise -- --etat # ce qu'elle porte déjà
npm run atelier              # l'atelier : du dépôt de l'audio au master
npm run cles                 # le trousseau : lister, ajouter, retirer, dégeler
npm run cles -- --donne-a=<dossier>   # copie CE trousseau dans une autre chaîne
npm run cles -- --quotas     # les quotas réels, clé par clé
npm run choix-voix -- --catalogue     # les voix ElevenLabs accessibles
npm run choix-voix -- --partagees --ton=? # les tons de voix disponibles
npm run choix-voix -- --partagees --langue=fr --genre=female --ton=calm
npm run choix-voix -- <slug> --voix=<id>   # la voix retenue pour CETTE vidéo
npm run choix-voix -- <slug> --essai --voix=<id>   # 10 s convertis, pour écouter
npm run choix-voix -- <slug> --essai --voix=<id> --stabilite=0.2  # et son intonation
npm run choix-voix -- --defaut --voix=<id>         # le défaut de la chaîne
npm run choix-voix -- --defaut --fish --voix=<id>  # la voix FISH par défaut (celle qui LIT)
npm run choix-voix -- --defaut --local --modele=<id> --transpose=12
                                                  # le modèle local ET sa transposition
npm run choix-voix -- --favoris                   # les voix gardées — elles sont à la CHAÎNE
npm run choix-voix -- --favori --voix=<id> --nom="…"        # en garder une
npm run choix-voix -- --favori --voix=<id> --fish           # côté Fish
npm run choix-voix -- --oublie-favori --voix=<id>           # la retirer
npm run importe-cles         # récupère les clés d'un ancien projet
npm run nouvelle-chaine -- <dossier>  # copie le template pour une nouvelle chaîne
npm run maj-chaine -- <dossier>   # remet le CODE d'une autre chaîne à jour
npm run maj-chaine -- --liste     # ce qui serait remplacé, et ce qui ne l'est jamais
```

Une clé ne s'affiche jamais en entier, et se désigne toujours par son étiquette. Pour en poser
une sans la laisser dans l'historique du terminal : `--valeur=-` la lit sur l'entrée standard.
C'est la façon propre de poser une clé sans la laisser derrière soi.

### La voix se choisit par vidéo

Quatre niveaux, du plus précis au plus général — chacun ne sert que si le précédent est absent :

1. `--voix-id=` sur la ligne de commande, pour un essai ;
2. `videos/<slug>/03-audio/voix-choisie.json`, écrit par `npm run choix-voix` ;
3. `config/chaine.json` → `voix.elevenlabs_voice_id`, le défaut de la chaîne ;
4. `ELEVENLABS_VOICE_ID` dans `.env`, en dernier recours.

### Écrire un script, et déduire un script : deux choses différentes

**Écrire** — choisir un angle, un hook, une chute — reste dans la conversation avec `/script`.
C'est du jugement, et ça se fait AVANT de tourner.

**Déduire** est l'inverse : la prise est enregistrée, les mots sont dits, l'éditorial a eu lieu
quand la personne a parlé. Il ne reste qu'à découper la prise en passages et à traduire chacun en
requête d'images. Aucune décision — donc un bouton, à l'étape 6, et `npm run ecris` au terminal.

Le montage exigeait `01-script.json` et l'écran renvoyait vers une commande à taper dans le fil
**pour une vidéo déjà tournée**. C'était le défaut de la première interface revenu par une autre
porte : une marche sans bouton là où rien ne s'argumente.

**Le découpage et les ancres se calculent, seule la requête part au modèle.** Les blocs suivent la
ponctuation et les silences ; les ancres sont découpées dans le texte réel, donc elles se calent
toujours. Le modèle ne remplit que deux champs — `requete` et `intention` — et ne peut pas casser
la structure. Un garde-fou vérifie que les blocs, mis bout à bout, redisent exactement la prise.

**ET SI CLAUDE N'EST PAS JOIGNABLE, FAL FAIT LE MÊME TRAVAIL.** Le seul appel de langage du
pipeline dépendait d'une clé `sk-ant-api…`, et par elle seule : sans elle, la déduction s'arrêtait
sur un 401 alors que le transcript était là, les 38 blocs découpés, et qu'il ne manquait que
quatre mots d'anglais par bloc. C'est la question qu'on a posée à raison — « le texte, tu l'as
dans les sous-titres ».

`cerveau.mjs` essaie donc Claude, puis retombe sur `fal-ai/any-llm` — la même famille de modèles,
derrière une clé qu'on a déjà pour les plans générés. L'ordre compte : Claude rend de meilleures
requêtes, et sa clé, quand elle est là, est déjà payée. Vérifié le 7 septembre 2026 sur une prise
réelle : 38 blocs, 907 mots, requêtes filmables — « Man in suit looking sad in office ».

Deux pièges à ne pas défaire : la branche fal doit rendre `{ texte, jetons }` comme celle de
Claude, sinon `demandeJson` casse au destructurage ; et `jetons` reste `null`, parce que fal n'en
rend pas le compte et qu'un chiffre inventé ferait mentir le coût affiché.

**`cerveauDisponible()` compte fal**, sans quoi l'écran annonçait « pas de cerveau » sur une chaîne
parfaitement capable de répondre.

**Ça demande une vraie clé API Anthropic** (`sk-ant-api…`, console.anthropic.com), pas le jeton
OAuth de Claude Code (`sk-ant-oat…`) qui, lui, est refusé en 401 par l'API. Compter moins d'un
centime par vidéo. Sans clé, le script se déduit en conversation — c'est ce que fait cette
commande, en moins de mots.

### Trois modes de fabrication, et un avatar qui appartient à la chaîne

**LE MODE SE CHOISIT À L'ÉTAPE 6, EN TÊTE DES PLANS.** Il vivait à l'étape 1, juste sous le
format, au motif qu'il « n'a de sens qu'une fois qu'on sait ce qu'on fabrique ». C'est vrai et ça
ne suffisait pas : le mode ne décide de RIEN avant l'étape 6 — ni le dépôt, ni la transcription,
ni la voix n'en dépendent. On le choisissait donc cinq écrans avant qu'il ne serve, pour ne plus
s'en souvenir en arrivant devant le bouton qu'il commande, et devant la dépense qu'il engage.

Deux conséquences, et la seconde est la vraie :

1. l'étape 1 ne demande plus que le format, donc elle **enchaîne** de nouveau vers l'étape 2 ;
   l'enchaînement n'avait été coupé que pour laisser voir le mode ;
2. **« Création assistée » EST le réglage du comblage, ce n'est plus une case qu'elle pré-coche.**
   Elle cochait « Combler les trous par IA » deux écrans plus loin, et la recochait à chaque
   redessin de l'étape 1 : la même décision s'écrivait à deux endroits, dont l'un écrasait l'autre
   sans le dire. Les deux étant maintenant côte à côte, la case a disparu. On coupe le comblage en
   repassant en création simple, et ça se lit sur la carte retenue.

**Création simple** — la banque d'images seule, rien n'est payant. Tu déposes ta prise, le montage
l'habille de plans de coupe.

**Création assistée** — le script est lu en entier avant qu'un centime soit dépensé, et la
génération va aux passages qu'une banque d'images ne peut pas servir ; ce qui reste du budget
comble les trous, comme avant. Voir « Placer les plans générés » au §10. C'est le seul mode où
l'étape 6 montre un modèle vidéo, un budget et un prix.

**Copie IA** — tu donnes le lien d'une vidéo. Elle est rapatriée, découpée en tronçons de dix
secondes, et chaque tronçon sert de **référence de mouvement** à `hailuo-03/reference-to-video` :
le modèle en tire le cadrage et l'énergie, et les rejoue avec les photos de l'avatar. Il s'inspire,
il ne décalque pas — on obtient « le même genre de plan avec ton personnage », pas la vidéo de
quelqu'un d'autre avec un visage collé dessus. Le remplacement de visage n'est pas proposé : coller
un visage sur le corps et la performance d'une personne qui n'a rien demandé est autre chose.

**Le modèle doit REGARDER la référence, et ce qu'on lui laisse voir décide de tout.** Relevé le
4 septembre 2026, en trois essais à quatre centimes :

| ce que le prompt disait de la référence | ce qui est sorti |
|---|---|
| rien — « reprends le cadrage et l'énergie » | Valérie, mais de nuit, en intérieur, souriante. Décor et registre inventés depuis les photos de l'avatar |
| tout, **tenue comprise** | le décor et la pose justes — et **la créatrice d'origine à la place de Valérie** |
| le lieu, la lumière, le cadrage, l'émotion. **Rien sur la personne** | Valérie, sous les palmiers, en plein jour, même pose, même cadrage |

Deux leçons, et la seconde a coûté un plan. Une tenue décrite au détail près est un signalement
d'identité aussi fort qu'un visage : le texte confirmait la vidéo de référence, et le modèle a
reconstruit la personne. Et l'**ordre** compte — l'identité était en tête, la scène après ; le
modèle a suivi ce qui venait en dernier. Elle est désormais en fin de prompt, avec une phrase qui
dit explicitement que la protagoniste de la référence ne doit pas apparaître.

Reste un biais à connaître : le modèle **fait sourire tout le monde**. Une expression décrite comme
neutre ressort en sourire large, et un avatar qui sourit sur chaque plan se repère en une seconde.
Le prompt le lui interdit maintenant explicitement.

**Un avatar est un JEU de photos, pas une image.** Une seule référence tient tant que la scène
reste proche du cadrage d'origine ; dès qu'on s'en éloigne — elle marche dehors, elle est de trois
quarts, elle est dans le noir — le modèle rend quelqu'un d'autre. Relevé sur un plan de marche :
une brune de vingt-cinq ans à la place d'une blonde de quarante-deux. Deux à quatre angles
suffisent à le tenir, et le **signe distinctif** — une mèche colorée, une monture — est nommé dans
chaque prompt : c'est lui qui ancre l'identité quand le cadrage change.

**Le signe tient le VISAGE. L'identité tient la PERSONNE.** Le signe suffit à ce qu'on
reconnaisse un visage d'un plan à l'autre. Il ne dit rien de la gestuelle, de la façon de regarder
l'objectif ou de le fuir, de ce que le visage fait quand elle doute, du rythme. Sans ça chaque
génération invente un tempérament : une vidéo la montre expansive, la suivante réservée, et
l'abonné ne construit jamais de personnage — il voit une inconnue qui a le même visage. Le défaut
ne se voit pas sur un plan, il se voit sur dix.

L'identité de jeu vit donc dans `avatar.json`, à côté du signe, et part dans chaque prompt.
**Elle se déduit une fois, puis elle ne bouge plus** — une identité régénérée à chaque vidéo n'en
est pas une, c'est un tirage au sort qui se répète. Elle se corrige à la main dans l'onglet
Avatars, en français ; sa traduction anglaise se refait toute seule dès que le français change.

**Elle ne se déduit pas de la photo seule, et la première tentative l'a prouvé.** Relevé le
5 septembre 2026 : à partir du seul portrait de référence, Valérie est ressortie « souriante,
chaleureuse, joie et confiance » — le sourire posé de la photo promu tempérament, c'est-à-dire
exactement le biais qu'on passe trois essais à combattre, gravé cette fois dans chaque prompt.

Le tempérament appartient à la MARQUE, pas au cliché. La déduction lit donc `config/chaine.json`
— la promesse, la posture éditoriale, le segment visé — et le prompt lui interdit de prendre
l'expression de l'instant pour un caractère. Deuxième essai, même photo : « autorité calme, gestes
mesurés, léger haussement de sourcil pour le doute, sourire entendu quand un mécanisme est mis à
jour, silences calculés ». Le registre du Vulgarisateur, pas celui d'une photo d'identité.

**Une personnalité est une AMPLITUDE, pas une expression.** La première version demandait
« son expression faciale » au singulier et rendait une mine qu'on aurait collée sur chaque plan —
le défaut du sourire par défaut, repris par l'autre bout. Trente plans d'une même mine sont un
diaporama, qu'elle soit souriante ou impassible. La déduction demande donc un tempérament, puis la
façon dont il se **décline** selon ce qui arrive : enthousiasme, surprise, doute, agacement,
chacun décrit différemment. C'est la variation qui fait reconnaître quelqu'un.

**Le registre appartient à la chaîne**, et vit dans `config/chaine.json` → `avatars.registre` —
ici « ultra dynamique, excentrique et solaire ». `nouvelle-chaine` le remet à vide : une autre
marque peut vouloir un avatar posé, et le coder en dur ferait mentir le §6.

Trois réglages ont été nécessaires pour qu'il tienne, et chacun apprend quelque chose :

| ce qui ratait | la cause | le correctif |
|---|---|---|
| « autorité calme, gestes mesurés, silences calculés » | la **posture éditoriale** du marketeur était donnée comme direction d'acteur | elle décrit l'ÉCRITURE, pas le jeu : elle sort du contexte. Un script rigoureux et une interprète solaire ne se contredisent pas |
| « amplitude modérée, intensité calculée » | le registre était au **milieu** du prompt | il passe en dernier, non négociable, avec l'interdiction explicite de le raboter |
| solaire oui, **excentrique** jamais | l'excentricité est un **tic**, pas un adjectif | on demande nommément un travers signature. Valérie tapote l'index sur sa tempe quand elle cherche un mot |

Ce tic est au jeu ce que le signe distinctif est au visage : le détail auquel on la reconnaît
quand tout le reste change.

Dans un plan, **la vidéo de référence donne les actions et le minutage, l'identité donne la
manière**. Les deux ne se disputent pas tant qu'on ne demande pas la même chose aux deux. Ce qu'on
refuse est l'expression FIGÉE, jamais l'expression : le prompt exige un visage mobile d'un bout à
l'autre du plan.

Les avatars vivent dans `marque/avatars/`, comme la voix et la direction artistique. Ils
appartiennent à la chaîne, pas à une vidéo, et `nouvelle-chaine` ne les copie pas. On en crée un
depuis l'onglet **Avatars**, et le panneau de copie y mène en un clic : proposer un menu de ce qui
existe déjà et renvoyer le reste vers une consigne à lire était le défaut du §2 remis à l'envers.

**Le texte incrusté de la référence n'est pas la scène.** Une vidéo rapatriée de TikTok arrive avec
son accroche en gros, ses sous-titres automatiques et le filigrane de la plateforme. Le modèle
regarde cette image et la prend pour ce qu'il doit reproduire : il rejoue les bandeaux avec le
mouvement, en charabia — des lettres qui ont la forme de mots sans en être. Et sur une chaîne dont
les sous-titres sont calés mot à mot, ce faux texte vient se cogner au vrai.

La règle vit donc en un seul endroit, `outils/fal-video.mjs`, sous **deux formulations** — et le
nom dit laquelle est laquelle :

| constante | forme | pour qui |
|---|---|---|
| `SANS_TEXTE` | prompt **négatif** — une liste de ce qu'on refuse | les modèles qui ont ce champ (`ltx-video`, les plans de coupe) |
| `AUCUN_TEXTE_A_L_ECRAN` | phrase **positive** | ceux qui n'en ont pas — `hailuo-03`, la copie |
| `IGNORE_LE_TEXTE_INCRUSTE` | phrase positive, propre à la copie | dit que les bandeaux ont été ajoutés après coup |

Les confondre retourne la consigne : `SANS_TEXTE` recopiée dans un prompt positif se lit
« text, letters, words, captions » — elle en **demande**. C'est arrivé une fois, à l'écriture de
cette section.

### Le Drive de la chaîne

Le master se dépose dans un dossier Google Drive **qui appartient à la chaîne** : son
identifiant vit dans `config/chaine.json`, comme tout ce qui la définit. `nouvelle-chaine` le
retire — deux marques qui déversent dans le même dossier, c'est un mélange qu'on ne remarque
qu'au bout d'un mois.

**Ce n'est pas un compte de service, et ça ne peut pas l'être.** Un compte de service possède
son propre Drive, et ce Drive a zéro octet de quota : le fichier lui appartiendrait, et l'envoi
échoue en `storageQuotaExceeded` — y compris dans un dossier partagé, car partager donne le droit
d'écrire, pas le quota pour stocker. Les deux contournements (Drive partagé, délégation de
domaine) exigent Google Workspace. Sur un compte Gmail personnel, aucun des deux n'existe.

On passe donc par **OAuth « application de bureau »** : une autorisation dans le navigateur, une
fois par poste, puis un jeton de rafraîchissement dans `config/keys.json` — jamais versionné,
jamais synchronisé (§4). Les fichiers t'appartiennent et comptent sur ton quota.

**La portée est `drive.file`, et elle décide de la conception.** Elle ne donne accès qu'aux
fichiers que l'application a créés : elle ne peut ni lire, ni lister, ni toucher le reste du
Drive, même sur un bug. C'est aussi la seule portée Drive que Google ne classe pas comme
sensible — aucune vérification d'application à demander. Sa contrepartie : on ne peut PAS écrire
dans un dossier créé à la main dont on collerait l'identifiant. C'est donc la commande qui crée
le dossier, une fois. Tu peux ensuite le déplacer ou le renommer dans Drive : l'identifiant ne
bouge pas.

**Le piège de la console, et il coûte une semaine.** Une application OAuth laissée « En test »
voit ses jetons de rafraîchissement expirer au bout de **7 jours**. Il faut la passer « En
production » — ce qui, avec `drive.file` seul, ne déclenche aucune vérification.

L'atelier propose l'envoi à l'étape 7, à côté du téléchargement : c'est un geste, pas une
décision (§2). La **connexion**, elle, reste au terminal — elle ouvre un écran de consentement
Google et écrit un jeton dans le trousseau.

### Récolter une voix au lieu d'en louer une

`npm run empreinte -- <url>` rapatrie l'audio d'une vidéo, sépare la voix de ce qui
l'entoure, et ne garde que les passages où elle est **seule**. Rien n'est payant : yt-dlp
télécharge, les modèles UVR séparent, le tout en local.

**La séparation est un instrument de mesure, pas un traitement.** Les extraits sont
découpés dans l'audio **d'origine**, jamais dans la piste vocale extraite : celle-ci porte
les artefacts du séparateur, et la donner en référence à un moteur de conversion lui
apprendrait ces défauts en même temps que le timbre. C'est le §9 appliqué à la récolte.

Le critère de « voix seule » est le **résidu** : ce qui reste quand on a retiré la voix. On
ne cherche pas à détecter la musique — elle se cache trop bien sous un locuteur. Relevé sur
deux vidéos réelles, en fenêtres d'une demi-seconde :

| | écart voix / résidu |
|---|---|
| voix seule, face caméra | médian 34,6 dB — minimum 17,3 |
| voix sur musique de fond | médian 12,4 dB — maximum 23,3 |

Les deux distributions ne se touchent pas, et le seuil par défaut (20 dB, `--marge=`) passe
entre les deux.

**Le résidu ne dit rien d'un sifflement fixe, et c'est le second défaut à mesurer.** Le
1er septembre 2026, un modèle entraîné sur onze sources a rendu une voix propre portant une
raie à 14 643 Hz — « une espèce d'acouphène ». Ni la conversion ni la transposition ne la
produisaient : identique à `--transpose=0` comme à `+12`, et absente de la prise. Elle venait
du **corpus**, où cinq sources sur onze en portaient une entre 13,3 et 16,4 kHz.

| | écart de la raie à son voisinage |
|---|---|
| source propre | 4,0 à 7,4 dB |
| source sifflante | 11,8 à 17,9 dB |

C'est le piège du §9 déplacé d'un cran : découper dans l'original protège des artefacts du
séparateur, **pas de ceux qui sont déjà dans l'original** — ré-encodage, capture d'écran, bruit
d'appareil. Le modèle apprend la raie comme une partie du timbre et la rend sur chaque
conversion. La récolte la mesure et l'annonce désormais au-delà de 10 dB (`--raie-seuil=`), et
`--remesure=<id>` rattrape les empreintes d'avant. Une source signalée se vérifie à l'oreille en
dix secondes ; gardée, elle coûte deux heures et demie d'entraînement.

Ce que la récolte permet dépend de la durée obtenue, et les deux seuils sont très éloignés :
**15 à 30 s** suffisent à un moteur zero-shot, un **entraînement** en réclame 15 à 30 min.
La commande l'annonce à chaque récolte.

**Une source, c'est une adresse OU un fichier.** YouTube, TikTok, Instagram, Facebook,
X, Vimeo, Dailymotion, Twitch, SoundCloud — et, pour tout le reste, le chemin d'un fichier
déjà téléchargé. On n'ouvre pas la liste des mille sites de yt-dlp : l'adresse part en
argument d'un programme externe et l'atelier l'expose sur le réseau local. Le fichier local
est l'échappatoire, et elle n'ouvre aucune surface.

**TikTok ne bloque pas : il sert autre chose.** Relevé le 4 septembre 2026 — toute vidéo
TikTok échouait sur `Unexpected response from webpage request`, y compris une déjà rapatriée
par ce dossier. Ni la version ni l'accès n'étaient en cause : le stable `2026.08.19` et le
nightly `2026.08.30` échouent pareil, et la même page demandée avec un en-tête de Chrome rend
403 ko et son bloc de données complet — `statusCode: 0`, l'auteur, la durée. Avec l'en-tête par
défaut de yt-dlp, elle rend une page que l'extracteur ne reconnaît pas.

Un en-tête de navigateur est donc posé sur **chaque** appel de yt-dlp (`UA_NAVIGATEUR` dans
`pipeline/lib/tiktok.mjs`, remplaçable par `YTDLP_UA=` dans `.env`). C'est un en-tête, pas une
session, et la différence est tout : un en-tête ne porte l'identité de personne. Vérifié après
coup sur TikTok **et** YouTube, qui n'a pas bougé.

**Instagram, Facebook et X ne servent plus rien à un visiteur anonyme.** yt-dlp répond
« login required », et c'est définitif. Deux voies, et la première est la plus courte :

**1. Déposer le fichier.** On télécharge la vidéo depuis son navigateur, et on donne le
fichier — au terminal, ou en le glissant dans l'écran « Voix » de l'atelier. Aucune session
en jeu, traitement identique. C'est ce qu'il faut faire pour trois vidéos.

```bash
npm run empreinte -- ./reel-1.mp4 ./reel-2.mp4 --nom="Untel"
```

**2. Passer une session**, quand le lot se compte en dizaines :

```bash
npm run empreinte -- --depuis=liens.txt --cookies-fichier=cookies.txt
```

Ou `YTDLP_COOKIES_FICHIER=` dans `.env` — lu par le terminal comme par l'atelier. **Sous
Windows, `--cookies=chrome` ne marche plus** : depuis Chrome 127 la clé de déchiffrement est
liée au processus du navigateur (App-Bound Encryption), et Edge partage le même verrou.
Firefox reste lisible. La voie fiable est le fichier, exporté par une extension
« Get cookies.txt ».

Rien n'est lu par défaut, et c'est délibéré : ouvrir une session appartient à son
propriétaire, pas à un programme qui vient d'échouer. Le fichier porte une session vivante —
`.gitignore` l'écarte sous tous ses noms courants, au même titre qu'une clé d'API. Le journal
annonce s'il en emploie une : sans ça, rien ne distingue « je n'en ai pas fourni » de
« la mienne n'a pas marché », qui appellent des gestes opposés.

**Récolter en lot est le mode normal**, parce qu'une source rend une à deux minutes et
qu'un entraînement en demande vingt. Le manifeste s'écrit après **chaque** source : une
récolte de quarante liens interrompue au trente-huitième reprend où elle en était, et
relancer la même liste ne retélécharge rien.

### Entraîner un timbre

`npm run entraine -- <id>` apprend le timbre d'une empreinte récoltée. Applio — le fork MIT
et maintenu de RVC — dans son propre environnement Python, avec un torch CUDA. Compter
45 min sur une RTX 3060 pour 300 époques.

**Ce que le modèle apprend, et ce qu'il n'apprend pas.** Il apprend un **timbre** : la
signature du conduit vocal, les formants, la texture. Il n'apprend **pas** une façon de
parler. En conversion voix-à-voix, la mélodie de la phrase vient de la prise SOURCE — le
modèle suit ton contour de hauteur, transposé dans la tessiture de la cible.

Il faut le dire, parce qu'on attend souvent l'inverse : multiplier les sources améliore la
**robustesse** du timbre — plus de phonèmes vus, moins d'artefacts sur un chuchotement ou un
aigu — et ne change rien au phrasé. C'est précisément ce que veut le §9.

**Deux pièges d'Applio, réglés dans le code, à ne pas « réparer ».**

1. `--process-effects` et `--noise-reduction` sont des **drapeaux** : les écrire les active,
   il n'existe pas de « false ». Ce sont les deux traitements que le §9 interdit. Leur
   absence de la ligne de commande est le geste, pas un oubli.
2. Un clone à la main n'a pas `assets/config.json`, et l'extraction du modèle final échoue
   dessus — **en silence**. Applio annonce alors « trained successfully », sort en code 0,
   et laisse 1,3 Go d'états d'optimiseur sans modèle. Le fichier est posé à l'installation.

L'index de recherche est supprimé avant chaque entraînement : `extract_index.py` refuse de
regénérer un index existant, et le périmé survivait au réentraînement.

### Convertir avec le modèle entraîné

Trois modes de voix, et ils vivent au même endroit — `monte.mjs` :

| `--voix=` | ce que ça fait | ce que ça coûte |
|---|---|---|
| `sts` | timbre du catalogue ElevenLabs | des crédits, annoncés avant (§7) |
| `local` | modèle entraîné de `marque/voix/` | rien : la carte du poste |
| `brute` | aucune conversion | rien |

**ON ESSAIE UNE VOIX FISH SUR SES PROPRES MOTS, PAS SUR UNE PHRASE DE DÉMONSTRATION.** La
question qu'on se pose devant une voix est « comment sonnerait MA prise avec elle ». Fish ne peut
pas convertir l'enregistrement — voir ci-dessous —, mais il peut dire **ce qu'on a dit** : mêmes
mots, même longueur, même sujet. Sur une phrase de démonstration on juge le texte autant que la
voix, et la comparaison ne vaut rien.

Le champ d'essai se remplit donc du **transcript de la prise**, coupé aux instants pour couvrir
exactement les secondes demandées ; à défaut, du script ; à défaut de tout, on le dit plutôt que
d'inventer une phrase. `npm run parle -- --mots-de-la-prise=<slug> --secondes=20` rend ce texte
sans rien synthétiser. Vérifié le 7 septembre 2026 : 21,1 s de voix Fish sur les mots réels d'une
prise.

Le plafond de l'essai passe de 400 à 1200 caractères — 400 couvraient les dix secondes d'origine,
et auraient tronqué les vingt d'aujourd'hui **en silence**. C'était le quatrième plafond du même
réglage.

**FISH N'EST PAS DANS CE TABLEAU, ET IL N'Y SERA JAMAIS.** C'est la confusion la plus coûteuse de
tout le §8, et elle est structurelle : Fish **lit un texte**, il ne transforme pas un
enregistrement. Son API n'expose que de la synthèse (`/v1/tts`) ; il n'existe aucun point d'entrée
voix-à-voix. Une prise déjà enregistrée ne se convertit donc que par `sts` ou par `local` — et
`local` est le meilleur des deux pour l'intonation, puisque RVC transporte TON contour de hauteur
au lieu d'en réinventer un.

Fish entre en amont, à la place du tournage : `npm run parle` fabrique la prise à partir du texte
(§3). Les deux se chaînent — `--modele-local=` fait lire Fish, puis plaque le timbre entraîné —
mais le point de départ reste le TEXTE.

**Et l'atelier ne réclame un identifiant ElevenLabs qu'en mode `sts`.** L'étape « Voix » ne se
validait qu'avec un timbre du catalogue, quel que soit le mode de la chaîne : en `local`, `tts`
ou `avatar`, elle restait « absent » et barrait l'étape « Audio complet » d'un « Retiens d'abord
une voix » qui renvoyait vers un catalogue payant dont on n'allait rien faire. Le verdict
`voixChoisie` de `etat.mjs` énumère maintenant le seul mode concerné — `sts` — plutôt que ses
contraires : une liste de ce qu'on exclut se re-périme au mode suivant. Le défaut se cachait sur
une chaîne où traîne un `elevenlabs_voice_id` de défaut, et mordait de plein fouet sur une chaîne
neuve.

La cascade du modèle est celle de la voix (§8) : `--modele=`, puis
`03-audio/voix-choisie.json`, puis `config/chaine.json` → `voix.modele_local`, puis — s'il
n'y en a qu'un — le seul entraîné.

**`--transpose=` est le réglage qu'on oublie, et son oubli ne ressemble pas à un oubli.** Le
modèle ne transpose pas de lui-même : il plaque un timbre sur TA hauteur. Convertir une voix
d'homme vers un modèle de femme sans transposer donne une voix de femme une octave trop bas
— ça sonne « robotique », et on accuse le modèle. Compte ±12 demi-tons entre tessitures
éloignées.

**La durée est vérifiée après chaque conversion, et c'est la seule chose qui compte
vraiment.** Les sous-titres sont calés mot à mot sur ce fichier. La conversion est synchrone
à la trame — mesuré à 0,02 s près sur 40 s, 0,03 s sur 2 min — mais si elle dérivait, rien
d'autre ne le signalerait : on le découvrirait au rendu, sur des sous-titres qui glissent, et
on chercherait ailleurs.

**Un piège d'environnement, réglé, à ne pas défaire.** faiss lit son index par l'API ANSI de
Windows : sur un chemin accentué — et ce dossier s'appelle « Usine à vidéo » — l'ouverture
échoue, Applio avale l'erreur, et la conversion se termine « avec succès » **sans index**. On
perd la fidélité de prononciation sur une ligne noyée dans le journal. Les fichiers passent
donc par le cache partagé, dont le chemin est sans accent, et la sortie est rapatriée après.

### Deux moteurs vivent sous le mot « voix », et l'écran n'en montrait qu'un

L'étape 3 s'appelle « Voix » et ne présentait que le catalogue **ElevenLabs**. Or deux moteurs se
partagent ce mot, et ils ne font pas le même métier :

| | ce qu'il fait | d'où part le son |
|---|---|---|
| **Fish** | LIT un texte | rien — la prise se fabrique |
| **ElevenLabs / modèle entraîné** | CONVERTIT un enregistrement | ta prise |

On cherchait donc les voix Fish à l'étape qui porte leur nom, et elles n'y étaient pas. Pire :
**aucun chemin n'existait pour en retenir une durablement**, ni à l'écran ni au terminal.
`choix-voix --defaut` posait un timbre ElevenLabs, `--defaut --local` un modèle entraîné ;
`voix.fish_voice_id` ne se posait qu'en éditant `config/chaine.json` à la main, ce que le §5
interdit. On pouvait choisir une voix Fish pour UNE génération, jamais pour la chaîne.

`npm run choix-voix -- --defaut --fish --voix=<id>` comble le trou, et l'étape 3 porte maintenant
la liste complète — voix du compte et bibliothèque publique — avec écoute sur une phrase avant de
retenir. **Une voix ne se juge pas sur son nom**, c'était déjà la règle du catalogue ElevenLabs.

**Deux défauts se cachaient derrière ce bouton**, et aucun ne se voyait :

1. **Le nom de l'essai ne portait pas la voix.** `essai-s2.1-pro-t1.wav` — deux voix essayées à la
   suite écrivaient le même fichier, la seconde écrasant la première. On ne pouvait donc pas
   comparer, c'est-à-dire pas choisir, ce pour quoi l'essai existe. Le nom porte maintenant les
   huit premiers caractères de l'identifiant.
2. **`parle.mjs` ne rendait rien en `--json` sur un essai, et l'atelier ne lui passait pas
   `--json`.** Le wav arrivait bien sur le disque, payé, et l'écran annonçait « l'essai n'a rien
   rendu ». Un bouton qui marche dont le résultat est introuvable.

**La bibliothèque Fish se parcourt, elle ne se télécharge pas.** On en chargeait quarante et on
filtrait dedans : taper un nom qui existe à la trois-centième position ne rendait rien, et on en
concluait que la voix n'existait pas. La recherche part maintenant au **serveur** (`--cherche=`),
la langue se choisit (`--langue=`), et les pages se chargent à la demande (`--page=`) — cent par
cent, ce que Fish autorise au maximum. Vérifié : 100 puis 201 voix à l'écran, « macron » toutes
langues rend les trois Macron de la bibliothèque.

**« Aucune voix » et « aucune clé » n'appellent pas le même geste.** L'écran annonçait « aucune
voix Fish disponible » à une chaîne qui n'avait simplement pas de `config/keys.json` — recréée
sans ses clés. On cherche alors une voix qui manquerait chez Fish, alors qu'il manque une clé chez
soi. Deux défauts se cumulaient : l'échec était **mis en cache** (`appli.voixFish = {}`), donc le
premier affichage disait la vraie cause et tous les suivants la remplaçaient par le message
générique.

**Une chaîne sans trousseau n'avait aucun moyen d'en recevoir un.** `nouvelle-chaine --avec-cles`
copie les clés à la CRÉATION ; après, plus rien — ni commande, ni écran. Sans elles la chaîne
démarre, monte et transcrit, mais rate en silence tout ce qui parle au réseau. Le manque s'écrit
maintenant sur sa ligne dans le menu des chaînes, avec le bouton qui le comble :
`npm run cles -- --donne-a=<dossier>`. Le trousseau existant n'est **jamais écrasé** — il peut
porter des clés que celui-ci n'a pas. Aucune clé ne traverse le serveur : une commande fille copie
un fichier d'un dossier à l'autre.

**Un essai dure VINGT secondes, pas huit.** Huit suffisaient à répondre par oui ou par non sur la
transposition ; elles ne suffisent pas à juger une VOIX — il faut une phrase entière, une
respiration, une fin de phrase qui descend. On rejugeait donc en conversion complète, ce que
l'essai est censé éviter. Le plafond passe à 60 s, **et les trois bornes s'alignent** : l'écran, la
route de l'atelier et la commande. Elles valaient 60, 30 et 30 — demander quarante-cinq secondes
en aurait rendu trente sans le dire, et on aurait jugé un extrait qui n'est pas celui qu'on a
réglé.

**Un essai se lance tout seul, depuis un lecteur qui était hors du champ.** Les étapes 3 et 4 font
deux hauteurs d'écran : on entendait une voix sans voir d'où elle venait, et on cherchait la pause
en faisant défiler pendant que ça parlait. La commande existait — `<audio controls>` — elle n'était
pas là où l'on regarde. Le lecteur vient maintenant se placer au centre de l'écran quand il
s'ouvre.

**Et quand l'attente est irréductible, elle se DIT.** Deux boutons passaient pour cassés, et
c'était la même cause — le premier mot n'arrivait qu'APRÈS la plus longue partie de l'attente :

| bouton | ce qu'il attend | ce qu'il montrait |
|---|---|---|
| « Charger 100 voix de plus » | 1,9 s — Fish met 0,8 s à rendre cent voix | rien : bouton intact et cliquable |
| « Ouvrir » une chaîne | plusieurs secondes — le serveur essaie la chaîne visée À BLANC, puis se relance, puis le navigateur sonde le port mort | rien jusqu'à la réponse du serveur |

On recliquait, ce qui lançait une seconde requête, ce qui allongeait l'attente.

Les deux annoncent maintenant avant d'attendre, et se figent le temps du travail — deux bascules
simultanées feraient partir deux serveurs sur le même port, et le second mourrait sur
`EADDRINUSE`.

**MAIS ANNONCER UNE ATTENTE NE LA REND PAS IRRÉDUCTIBLE, ET CELLE-CI NE L'ÉTAIT PAS.** Mesuré le
8 septembre 2026, clic « Ouvrir » sur une chaîne : **5,03 s**, dont 4,89 s à attendre
`cles.mjs --quotas`. La bascule n'attendait pas la chaîne visée — elle attendait la lecture des
soldes que l'écran venait de lancer tout seul. Quatre causes, quatre corrections :

| ce qui coûtait | avant | après |
|---|---|---|
| `cles.mjs --quotas` — quatre `await` à la file | 4,65 s | **2,13 s** (`Promise.all`) |
| relu à CHAQUE retour dans la fenêtre | à chaque fois | une fois par minute |
| `serveur.close()` attendait les connexions keep-alive | jusqu'à 3 s | ~0 (`closeAllConnections`) |
| granularité des sondes — 300 ms côté serveur, 500 ms avant le premier essai côté navigateur | ~800 ms | 40 ms / 100 ms |

**Total mesuré : 5,03 s → 0,65 à 1,05 s**, soit deux démarrages d'atelier (240 à 490 ms chacun) et
rien d'autre. L'écart entre les deux chaînes est le nombre de vidéos à recenser au démarrage.

**L'essai à blanc reste**, et c'est délibéré : il coûte un démarrage, il évite de tuer le serveur
courant pour une chaîne qui ne démarrera pas. Deux incidents l'ont motivé, et la panne qu'il
prévient est la pire possible — plus de serveur du tout, donc plus rien à l'écran, pas même un
message.

**Le garde « travail en cours », lui, n'a pas bougé.** Il attend toujours cinq secondes avant de
refuser. C'est le déclencheur qui était de trop, pas le garde : rien ne doit tourner en
permanence dans le dos de l'écran.

**Ce qui pouvait être supprimé l'a été.** Paginer la bibliothèque Fish redemandait aussi les voix
du compte et le solde, qui n'ont pas bougé : 0,34 s + 0,24 s payés pour redécouvrir ce qu'on savait
déjà. `--bibliotheque-seule` les saute et l'écran empile la page sur ce qu'il a — mesuré 1,89 s →
1,09 s. Les 0,8 s de Fish, eux, ne se négocient pas.

### Un clic doit rendre un résultat, pas une animation

Mesure du 7 septembre 2026, chemin complet d'un clic : le JavaScript rend en **2 à 19 ms**. Tout
le reste était de l'animation.

| ce qui s'animait | avant | après |
|---|---|---|
| le panneau modal | 280 ms, ressort qui dépasse et revient | 90 ms, droit |
| l'étape qui entre | 280 ms depuis `opacity: 0` — écran vide au premier dixième de seconde | 90 ms depuis `.35` |
| les lignes d'une liste | 25 ms de décalage par ligne, plafonné à 120 ms, **puis** 200 ms de fondu | 90 ms, sans décalage |

Ouvrir le menu des chaînes coûtait donc **six cents millisecondes de mouvement après que l'écran
soit prêt**. C'est ce qu'on lit comme « ce n'est pas instantané » : rien ne rame, tout attend.

Le décalage par ligne était la plus grosse prise. Il valait « pour donner un sens de lecture » —
raisonnement qui tient sur une liste de cinq et pas sur les cent voix de la bibliothèque Fish, où
la sixième ligne et toutes les suivantes attendaient 120 ms avant de commencer leur fondu. L'œil
commence par le haut, décalage ou pas.

Le mouvement reste — il dit le sens, il situe — mais **sous le seuil où on le voit** : au-delà
d'environ 150 ms on regarde l'animation, en dessous on regarde le résultat. `backdrop-filter` passe
de 4 à 2 pixels : c'est la seule ligne du fichier qui coûte du GPU à chaque trame.

### Un écran qui choisit un moteur doit le PASSER à la commande

`monte.mjs` lit `const modeVoix = options.voix || chaine?.voix?.mode || 'sts'`. Sans `--voix=`, il
retombe donc sur le mode de la chaîne — et l'atelier ne le passait que pour `local` et `brute`.
Choisir « ElevenLabs » à l'étape 4 lançait la commande **sans moteur** : sur une chaîne réglée en
`local`, le journal répondait « voix (mode local) » puis « Aucun modèle entraîné », un message
sans aucun rapport avec ce qu'on avait demandé — et il arrivait après la coupe et la
transcription. L'écran disait une chose, la commande en faisait une autre.

**Et les deux culs-de-sac de cette étape se constatent AVANT de travailler.** Ils échouaient en
fin de course, quand tout le coûteux était déjà fait :

| moteur | ce qui manquait | quand on l'apprenait |
|---|---|---|
| `sts` | aucun timbre ElevenLabs dans les quatre niveaux de la cascade | à la conversion, après le devis accepté |
| `local` | aucun modèle entraîné dans `marque/voix/` | à la conversion, après la transcription |

Les deux se lisent sans rien lancer, et le refus renvoie à l'étape 3 — où le timbre se choisit et
où la récolte a son écran. La commande, elle, garde son message de terminal : « va à l'étape 3 »
ne veut rien dire dans un terminal.

### Ce qui est RETENU n'est pas ce qui a SERVI

`03-audio/voix-choisie.json` porte une INTENTION : un timbre ElevenLabs mis de côté, qui n'a
peut-être jamais servi — la chaîne peut être en mode `local`, et le mode a pu changer depuis. Un
mois plus tard, devant un audio qu'on ne refait pas, la seule question est « avec quoi celui-ci
a-t-il été fabriqué », et la réponse n'était nulle part : l'étape 3 montrait le timbre en réserve,
l'étape 4 le défaut de la CHAÎNE, et aucun des deux ne décrivait le fichier qu'on écoute. On lisait
trois choses de trois endroits, et on en concluait que « tout est remis à zéro ».

`03-audio/voix-employee.json` est écrit **par la conversion elle-même**, à la fin de `monte.mjs` :
mode, timbre, réglages, modèle local, transposition, musique posée, date. C'est la seule source qui
ne peut pas mentir — elle est produite par le geste qu'elle décrit. Les deux étapes l'affichent, et
le sélecteur de moteur de l'étape 4 en repart : **ce que CET audio a employé, puis le défaut de la
chaîne, puis le premier de la liste.**

`null` veut dire « on ne sait pas » — l'audio est antérieur à ce fichier —, jamais « rien n'a
servi ». L'écran le dit ainsi ; deviner à partir du mode actuel serait pire que se taire, puisque
c'est justement ce qui a pu changer.

### Les voix favorites appartiennent à la CHAÎNE

La bibliothèque ElevenLabs se compte en milliers, celle de Fish en centaines. On en écoute vingt,
on en trouve trois bonnes, on en retient une — et les deux autres étaient perdues. La vidéo
suivante recommençait la même recherche, avec les mêmes filtres tapés de mémoire. C'est le travail
qu'on refaisait, et il n'avait aucun endroit où se déposer.

Une favorite est une paire **(moteur, identifiant)** — Fish et ElevenLabs ont chacun les leurs — et
vit dans `config/chaine.json → voix.favoris`, comme les avatars et la direction artistique :
elle sert sur la dixième vidéo comme sur la première. `nouvelle-chaine` la vide, en liste vide et
jamais à `null` : ce sont des timbres jugés à l'oreille contre l'avatar d'une autre marque.

**Elle ne DÉCIDE rien** — ni le défaut de la chaîne, ni la voix d'une vidéo. C'est une liste courte
de ce qu'on a déjà jugé, posée en tête de l'étape 3, et qui porte les mêmes actions que les cartes
du dessous. Les deux gestes de sélection restent où ils étaient.

```bash
npm run choix-voix -- --favoris                              # ce qui est gardé
npm run choix-voix -- --favori --voix=<id> --nom="…"         # en garder une
npm run choix-voix -- --favori --voix=<id> --fish            # côté Fish
npm run choix-voix -- --oublie-favori --voix=<id>            # la retirer
```

L'étoile de l'écran fait la même chose, et **peint avant de demander au serveur** : un aller-retour
visible sur une bascule se lit comme une hésitation. En cas d'échec elle revient, et on le dit.

### Corriger un sous-titre ne recharge plus l'écran

Six défauts se cumulaient sur le même geste. Trois faisaient bouger l'écran tout seul, deux
perdaient des données, et le dernier ne disait pas ce qui était enregistré.

**L'ÉCRITURE PART TOUTE SEULE, APRÈS CHAQUE CHANGEMENT.** C'est le reproche principal, et il était
fondé : rien ne s'enregistrait tant que le focus ne QUITTAIT pas la colonne. Passer à la ligne
suivante avec Entrée, cliquer sur une autre ligne, corriger dix lignes d'affilée — rien ne partait.
On changeait d'étape ou de vidéo, et tout était perdu sans un mot. Chaque frappe programme
maintenant l'écriture ; le bouton « Enregistrer » n'est plus qu'un filet.

**ET ÇA SE VOIT.** Le pied de colonne affichait « 2 lignes récrites » puis se vidait : rien ne
distinguait *pas encore parti*, *en train de partir* et *c'est écrit* — la seule question qu'on se
pose avant de fermer l'onglet. Trois états explicites, et « ✓ Enregistré » reste affiché. Un
enregistrement automatique qu'on ne voit pas ne rassure personne : on continue de chercher le
bouton.

**L'ÉTAPE REJOUAIT SON ANIMATION D'ENTRÉE TOUTE SEULE.** `montre()` se rappelle sur la MÊME étape
dès que l'état a bougé sur le disque — donc après chaque correction, puisque le plan est retouché.
`data-sens` repassait alors à « avant », le nom de l'animation CSS changeait, et l'écran rejouait
son glissement de six pixels. En venant de l'étape 6, donc en « arrière », c'était systématique.
On ne touche plus à `data-sens` quand on ne se déplace pas.

**ET L'APERÇU SE RELANÇAIT AVEC.** Le même redessin rappelait `chargeLeStudio()`, qui relançait la
boucle : le son se coupait et reprenait, un hoquet à chaque enregistrement — pendant qu'on écoute
précisément pour juger le calage. `apercu.raf` dit si l'on est parti ; non nul, on ne touche à rien.

**CHANGER DE VIDÉO AVEC UNE CORRECTION EN ATTENTE ÉTAIT LE PIRE DES CAS.** Une correction désigne
la ligne d'UNE vidéo ; la garder en mémoire après un changement de slug l'aurait envoyée à la
suivante, sur des lignes sans rapport. On écrit avant de partir, et on attend — la seule attente
justifiée de cet écran, parce que ce qui suit détruit le contexte dont ces corrections ont besoin.
Un `beforeunload` couvre le dernier trou : fermer l'onglet pendant le demi-battement.

Les trois défauts d'origine, qui restent :

1. **`rechargeLeStudio()` après chaque correction.** Il vidait `appli.st`, masquait le panneau,
   refaisait deux requêtes, remettait les curseurs et relançait l'aperçu **au premier sous-titre**.
   Sur un geste de correction, c'est un rechargement de page — et c'est ce qu'on voyait. On relit
   désormais les MOTS et rien d'autre (`relisLesMots`), sans masquer quoi que ce soit.
2. **L'aperçu et la liste repartaient de zéro.** Corriger une ligne à 2:16 ramenait l'image au
   début et la colonne de texte en haut : la page qu'on venait de corriger disparaissait de
   l'écran, d'où « le sous-titre ne se modifie pas » — il s'était modifié, on ne le regardait plus.
   `relanceLApercu({ gardeLaPosition: true })` garde l'instant, l'état de lecture et la position du
   son ; `dessineLeTexte` garde le défilement, le champ visé et la sélection dedans. Même règle en
   traînant « mots par ligne », qui rejouait l'aperçu depuis le début à chaque pixel.
3. **UNE CORRECTION TAPÉE PENDANT QU'UNE AUTRE S'ÉCRIVAIT ÉTAIT PERDUE, EN SILENCE.** Deux lignes
   l'expliquaient : `if (enregistrementEnCours) return` abandonnait la seconde, et
   `corrections.clear()` effaçait ensuite tout — y compris ce qui n'était jamais parti. On ne vide
   plus que ce qui a été envoyé, et une demande arrivée pendant le vol relance un tour.

**LA CLÉ D'UNE CORRECTION EN ATTENTE EST L'INSTANT, PLUS L'INDEX.** Elle valait `de`, l'index du
premier mot de la ligne — or une correction qui change le nombre de mots décale tous les index
suivants : la correction en attente vingt lignes plus bas ne désignait plus rien. `debutMs` ne
bouge pas, `pipeline/texte.mjs` conservant explicitement les bornes de chaque plage récrite. Ce qui
peut encore bouger est le DÉCOUPAGE en pages ; une correction dont la ligne a disparu est alors
**abandonnée et annoncée**, jamais reposée sur la ligne d'à côté.

**L'écriture attend un demi-battement** (450 ms). Elle partait au `focusout`, c'est-à-dire à
l'instant précis où l'on clique ailleurs — sur la flèche de lecture, sur la ligne suivante : deux
corrections rapprochées faisaient deux allers-retours qui se croisaient. Dix lignes corrigées à la
file font maintenant une seule requête. Le bouton « Enregistrer » reste immédiat : on clique dessus
précisément pour ne pas attendre.

Vérifié le 8 septembre 2026 sur une prise de 67 sous-titres. Deux corrections à 60 ms d'écart : les
deux sur le disque et dans le plan. Une frappe **sans jamais quitter le champ** : écrite d'elle-même,
« ✓ Enregistré » affiché. Et sur le même geste, en venant de l'étape 6 : `data-sens` inchangé,
aucune animation rejouée, panneau jamais masqué, aperçu resté à 0:34, colonne restée à 700 px, focus
et position du curseur rendus.

### CE QU'ON ÉCRIT DANS UNE LIGNE RESTE DANS CETTE LIGNE

La colonne re-paginait à chaque relecture des mots. Or `pagine()` coupe sur le nombre de mots, la
ponctuation et les silences : écrire « 82.194 euros » là où il y avait « 82 » fait passer la ligne
de cinq mots à sept, et elle **se scinde**. On tapait un chiffre, une ligne apparaissait en dessous
avec la fin de sa propre phrase, et tout ce qui suivait descendait d'un cran. C'est le contraire de
ce qu'on attend d'une zone de texte.

**On fige les FENÊTRES DE TEMPS, pas les index.** Une correction qui change le nombre de mots
décale tous les index ; `[debutMs, finMs]` de chaque ligne, non — `pipeline/texte.mjs` conserve
explicitement les bornes de toute plage récrite. C'est le mécanisme qui sert déjà à patcher
`plan.json` sans le repaginer. Un mot qui ne tombe dans aucune fenêtre forme sa propre ligne :
c'est le cas d'une insertion dans un silence, et une ligne neuve est bien ce qu'on veut là.

**LES BORNES SE TOUCHENT, ET UN TEST D'INTERVALLE S'Y TROMPE.** La fin d'une ligne est le `finMs`
de son dernier mot, et le mot suivant commence souvent **exactement** là — `repartis` pose la borne
d'un côté et reprend de l'autre. Un test `debutMs <= fenetre.finMs` happait donc le premier mot de
la ligne suivante dans la précédente, et le découpage « figé » ne redonnait pas celui qu'on venait
de figer. On avance un curseur dans des fenêtres ordonnées : un mot appartient à la dernière
fenêtre ouverte avant lui.

**LES INDEX DU PATCH VIENNENT DES MOTS, PLUS DU DOM — et c'était le pire des bugs.** `de` et `a` se
lisaient dans `dataset`, donc dans la colonne telle qu'elle avait été dessinée. Or une correction
qui change le nombre de mots décale tous les index qui suivent : dès que la colonne n'était pas
redessinée entre deux enregistrements, la correction suivante partait avec les index d'AVANT et
récrivait une plage décalée, à cheval sur deux lignes. **Des mots étaient écrasés et le texte tapé
atterrissait au mauvais endroit** — « ça se mélange avec la ligne du dessous », « il disparaît ».
`lignesDuTexte()` recalcule les index depuis `appli.st.mots`, la seule source à jour.

**ON MET LA COLONNE À JOUR EN PLACE, ON NE LA RECONSTRUIT PAS.** Deux écueils se font face : tout
redessiner à chaque enregistrement recrée le champ en pleine saisie et la position du curseur
redevient approximative — le « je n'arrive pas à placer mon curseur » ; ne rien redessiner laisse
un DOM périmé, c'est-à-dire le bug ci-dessus. Le découpage étant figé, la structure ne bouge
presque jamais : on rafraîchit les index et les textes **sans toucher au champ qu'on remplit**, et
on ne reconstruit que si la structure a réellement changé.

**L'APERÇU LIT LE MÊME DÉCOUPAGE QUE LA COLONNE.** Il paginait de son côté : on corrigeait une
ligne, on cliquait sur son heure pour l'entendre, et l'écran montrait une page qui ne contenait pas
le texte qu'on venait d'écrire. Deux découpages, deux vérités. `pagesCourantes()` est le seul point
de décision — deux endroits qui paginent chacun de leur côté finissent toujours par se contredire.

**CE QUE LE RENDU FERA PEUT DIFFÉRER, ET ÇA SE DIT FRANCHEMENT.** Tant qu'on édite, le découpage
figé n'est plus celui de `pagine()`. Un bouton discret ne suffisait pas — on irait juger un
découpage que la vidéo ne produira pas. Le pied porte donc **« ⚠ La vidéo découpera autrement —
mettre à jour »**, à la couleur de l'attention, visible seulement quand les deux divergent, et un
clic remet les trois d'accord.

Vérifié le 8 septembre 2026, sur le geste exact. Six chiffres tapés un par un avec 620 ms de
pause : champ jamais recréé, curseur à 20, 21, 22, 23, 24, 25, **67 lignes du début à la fin**.
Deux corrections successives **sans redessin entre elles** — le cas qui mélangeait tout : chacune
au bon endroit, 214 → 216 mots sur le disque, **aucun mot d'origine perdu**. Et la ligne corrigée
s'affiche à l'identique dans la colonne et dans l'aperçu.

### LE MODÈLE DE TRANSCRIPTION SE MESURE, IL NE SE DEVINE PAS

Relevé le 8 septembre 2026 sur une VSL réelle de 897 mots, dont le script donne la vérité.
Exactitude **après** correction par le script — la seule qui compte, puisque c'est ce que le
pipeline produit :

| modèle | exactitude | temps |
|---|---|---|
| `medium` | 94,6 % | 20,5 s |
| **`large-v3-turbo`** | **96,8 %** | **12,9 s** |
| `large-v3` | 77,5 % | 482,9 s |

**`large-v3` complet est un PIÈGE, et c'est contre-intuitif.** Il a rendu 756 mots pour 897
attendus — il saute des passages entiers — en trente-cinq fois le temps. Le prendre pour « le
meilleur parce que le plus gros » dégrade la transcription en la ralentissant. Il reste dans la
liste de l'écran, avec son chiffre : le cacher obligerait à refaire la mesure pour savoir pourquoi
il n'y est pas.

`turbo` est meilleur ET plus rapide que `medium` : il n'y a pas d'arbitrage, seulement un défaut à
corriger. C'est le nouveau défaut de `MODELE_DEFAUT`.

**CE QUI N'A RIEN CHANGÉ, ET QUI A ÉTÉ RETIRÉ.** Un beam search élargi (`-bs 8 -bo 8`) et un seuil
d'entropie relevé (`-et 2.8`) rendent **exactement** le même résultat — 860 mots justes des deux
côtés. Le décodeur distillé de `turbo` n'a que deux couches : il n'y a presque rien à explorer. Du
code qui prétend améliorer sans rien changer fait perdre du temps à qui le lit ; ne pas le remettre
sans une mesure qui le justifie.

**LE MODÈLE SE POSE PAR COMMANDE, PLUS EN ÉDITANT `.env`.** Il n'y vivait que là — c'est-à-dire
nulle part, puisque le §2 dit que rien ne se tape. `config/chaine.json → transcription.modele` a sa
commande et son écran, et **prime sur `.env`** : la qualité d'écoute devient une décision de
chaîne, réglable là où l'on travaille. `.env` reste pour ce qui appartient à la MACHINE.

```bash
npm run transcris -- --defaut=large-v3-turbo   # pour la chaîne
npm run transcris -- <slug> --modele=medium    # pour cette fois
```

### REPARTIR DE ZÉRO, QUAND ON S'EST PERDU

On corrige, on insère, on supprime — et on finit par ne plus reconnaître son texte. Il manquait le
geste qui rend tout à ce que la machine entend.

**IL ÉTAIT EN PIED DE COLONNE, DONC IL N'EXISTAIT PAS.** Mesuré : ce pied commence à 767 px et
finit à 1 161 dans une fenêtre de 1 050 — **il faut défiler pour l'atteindre**, et on ne défile pas
vers une chose dont on ignore l'existence. Le bouton a été redemandé alors qu'il était là.
Troisième fois dans cet écran qu'un raisonnement sur l'encombrement perd contre une découverte qui
n'a pas lieu, après la bande d'insertion et le repli qui l'enfermait.

Le `⟲` vit donc dans la TÊTE de la colonne, à côté de « 123 », toujours à l'écran. Ce qui le rend
sûr n'est pas d'être caché, c'est la confirmation qui dit ce qu'il détruit. La qualité d'écoute
reste en pied : c'est un réglage, pas un geste.

**ON NE REFAIT PAS LE MONTAGE, ON REMET LE TEXTE.** `monte --depuis=transcris` aurait été le geste
évident, et il en fait beaucoup trop : il reconstruit la piste image, donc trente recherches
d'images et autant de clips retéléchargés — pour un texte à corriger. Pire, la fenêtre de réemploi
des dix derniers montages ferait valser des plans qu'on avait validés.

`transcris --refais` suffit, **et il remet lui-même les mots du plan d'accord**. C'est le point qui
manquait : `plan.json` porte sa propre copie des mots — celle que Remotion lit —, et retranscrire
sans y toucher laissait le rendu afficher l'ancien texte sans que rien ne le dise. Le reste du plan
ne bouge pas : l'audio n'a pas changé, donc les plans de coupe, les coupes et le thème sont
toujours à leur place. Vérifié : 14 événements et 1 coupe identiques après réanalyse.

Ce qui ne bouge pas non plus : la **voix** (aucune conversion payante ne repart) et les réglages de
style, qui vivent dans `soustitres.json`.

### VIDER UN CHAMP N'EST PAS SUPPRIMER UNE LIGNE

Côté commande, un texte vide **retire** les mots visés — c'est le comportement documenté de
`--corrige`. À l'écran, c'en était un piège : sélectionner tout et retaper commence par vider le
champ, et le demi-battement d'écriture passait avant qu'on ait fini de taper. La ligne disparaissait
pour un geste qui ne demandait rien.

Un champ vidé n'est donc plus une correction : rien ne part, et le quitter sans avoir retapé rend
son texte — les mots sont toujours là, une ligne vide à l'écran ferait croire le contraire. Le champ
le dit pendant ce temps, en pointillés plutôt qu'à la couleur d'une modification en attente.

**Supprimer a son bouton : une poubelle par ligne.** Elle garde sa place — vingt-six pixels de
colonne — et ne se montre qu'au survol : deux cents corbeilles alignées seraient deux cents
invitations à supprimer sur un écran dont le métier est de relire. Sans la colonne réservée, le
texte se décalerait au passage de la souris, ligne après ligne.

**Pas de boîte de dialogue, mais pas d'un seul clic non plus.** On supprime plusieurs lignes à la
suite, et une fenêtre à chaque fois serait insupportable. Le premier clic **arme** le bouton — il
devient rouge et dit « Sûr ? » — et un second, dans les trois secondes, retire les mots. Un clic
ailleurs le désarme.

**ET LE TEXTE RETIRÉ RESTE RÉCUPÉRABLE.** Les mots partent, leurs instants restent libres : le
silence qu'ils laissent porte aussitôt une bande d'insertion (§ ci-dessous), **pré-remplie avec ce
qu'on vient de retirer** et sélectionnée — Entrée le remet, taper écrit autre chose. Se tromper
coûte deux clics, pas une retranscription.

Vérifié le 8 septembre 2026 : vider un champ ne fait rien partir même après deux secondes, et le
texte revient au `blur` ; premier clic « Sûr ? » sans rien retirer, second clic 67 → 66 lignes ; la
bande « + 1,8 s de silence » repropose « et les potentiels matchs. », et un Entrée rend un
transcript **identique mot pour mot** à celui d'avant — 214 mots. Les instants **internes**, eux,
sont redistribués dans le silence : les bornes tiennent, le surlignage à l'intérieur de la ligne
devient approximatif, comme pour toute réécriture qui change le nombre de mots.

### Whisper ne se trompe pas seulement, il SAUTE des mots

Corriger une ligne couvre le mot mal entendu. Ça ne couvre pas le mot **absent** : « les droits
s'élèvent à 82.194 euros » ressort en « les droits s'élèvent à 82 », et il ne reste rien à
corriger — le manque n'a aucun mot où s'accrocher.

**Rattacher les mots manquants à la ligne d'avant marcherait à l'écrit et mentirait à l'image.**
Ils se caleraient dans la fenêtre de CETTE ligne, donc s'afficheraient avant d'être prononcés, et
le reste de la ligne se comprimerait pour leur faire place. Le silence, lui, est exactement le
temps pendant lequel ces mots ont été dits.

D'où une **troisième forme de patch**, à côté du mot et de la plage :

```bash
[{ "apres": 42, "texte": "194 euros" }]   # insère dans le silence qui suit le mot 42
npm run texte -- <slug> --trous           # où sont ces silences, et leur durée
```

Rien n'est remplacé : les instants se répartissent dans le trou, et **aucun mot existant ne
bouge**. Vérifié sur une prise réelle — trois mots posés entre 9 399 et 10 239 ms, le mot d'avant
finit toujours à 9 399, celui d'après commence toujours à 10 239, et le plan est patché avec.

**LE SEUIL EST MESURÉ, PAS CHOISI.** Sur une prise de 907 mots, l'intervalle médian entre deux mots
vaut **40 ms** et le neuvième décile 460. Au-delà de **600 ms**, un silence peut cacher une dizaine
de mots — et il n'y en a qu'une soixantaine sur 846 intervalles, assez rares pour qu'on les regarde
un par un. En dessous de 60 ms par mot inséré, on refuse en disant combien de place il y a
réellement : `repartis` rendrait des mots d'une image, qui clignotent sans être lisibles.

**On n'insère pas après le dernier mot** : ce module ne connaît pas la durée de l'audio, et
inventer une borne haute poserait des sous-titres au-delà de la fin de la vidéo. On récrit la
dernière ligne à la place.

**Deux pièges du plan, et le premier était silencieux.** Le repérage par fenêtre de temps suppose
des mots DANS la fenêtre ; dans un silence il n'y en a aucun, `findIndex` rendait −1, et le
`continue` laissait `plan.json` en arrière — le rendu aurait affiché l'ancien texte sans que rien
ne le dise. Une insertion cherche donc son point d'ancrage : le premier mot qui commence après le
silence. Et une insertion qui tombe au milieu d'une plage récrite dans le même envoi est
**refusée** : les mots qui l'entourent sont sur le point de disparaître.

**ELLE SE VOIT AU REPOS, PARCE QU'UNE FONCTION QU'ON NE TROUVE PAS N'EXISTE PAS.** Elle ne se
montrait qu'au survol, au motif qu'une soixantaine de marqueurs sur deux cents lignes seraient du
bruit. L'argument tenait sur le papier et a échoué à l'usage : **la fonction a été redemandée alors
qu'elle était déjà là**. Un raisonnement sur l'encombrement ne vaut rien contre une découverte qui
n'a pas lieu.

Le compromis est dans le POIDS, pas dans la présence : au repos un « + » de onze pixels, presque de
la couleur du fond, sans texte ; au survol, la durée du silence s'affiche — elle dit combien de mots
peuvent y tenir. La bande garde sa hauteur dans les deux états, donc aucun saut de mise en page.

**Le seuil voyage, il ne se recopie pas.** La soustraction entre deux instants n'est pas une règle
métier et se fait à l'écran ; le seuil en est une, et il sort de `soustitres.mjs --json`
(`silence_inserable_ms`). Une copie dans l'interface se serait périmée au premier ajustement.

**Deux fonctions supposaient que chaque enfant de la liste est une ligne**, et les bandes de
silence en sont aussi. `suitLeTexte` prenait `children[indice]` : le surlignage de lecture suivait
une phrase de plus en plus décalée à mesure qu'on avançait. Il vise maintenant
`[data-page="N"]`. Le filtre de recherche, lui, masque les bandes tant qu'il est actif — elles
décriraient des voisinages qui ne sont plus à l'écran.

### La stabilité se règle par vidéo, et le montage l'emploie

Le speech-to-speech transporte **ta** performance : le débit, les respirations et
les montées de voix sont les tiennes. `stabilite` décide seulement de combien la
machine s'autorise à en dévier — basse, elle suit et vibre davantage ; haute,
elle lisse. C'est le seul réglage qui touche à l'intonation, et `style` reste à 0
volontairement : l'exagérer détruit ce qu'on cherche à conserver.

Le réglage s'essaie sur dix secondes, se garde dans
`03-audio/voix-choisie.json`, et **le montage l'emploie**. Sans ce dernier
maillon l'écoute ne servirait à rien : la conversion complète retomberait sur
0,5 quoi qu'on ait entendu. Le nom du fichier d'essai porte le réglage, pour que
deux essais de la même voix se comparent au lieu de s'écraser.

Le montage annonce laquelle il emploie **et d'où elle vient**. Une voix ne se juge pas sur son
nom : `npm run choix-voix -- --catalogue` donne l'adresse d'un extrait à écouter, parce qu'un
paie en conversion refaite.

Chaque script accepte `--aide`.

## 9. Le son : on ne le touche pas

**L'audio déposé sort tel qu'il a été enregistré.** Aucun débruitage, aucune normalisation,
aucune compression, aucun égaliseur. Ce n'est pas une préférence esthétique, c'est le résultat
de trois essais ratés.

Ce qui avait été essayé, et pourquoi ça a été retiré :

| Traitement | Ce qu'il faisait de mal |
|---|---|
| chaîne de restauration (passe-haut, déclic, `afftdn`, de-esseur, compresseur) | la porte de bruit tronquait les fins de phrase peu énergiques ; `anlmdn` lissait les consonnes sourdes avec le souffle |
| normalisation `loudnorm` à −14 LUFS, deux fois dans la chaîne | écrasait la dynamique alors que les plateformes renormalisent de toute façon |
| `remove_background_noise` d'ElevenLabs, actif par défaut | débruitait la prise **avant** la conversion, donc sur le signal de référence |

Et le défaut commun, le plus grave : la transcription mot à mot travaillait alors sur un signal
différent de celui qu'on entend. **Les sous-titres se décalaient.** Un peu de souffle de pièce
s'accepte ; un sous-titre qui ne suit plus la voix, non.

**La coupe des silences est désactivée elle aussi**, depuis le 28 août 2026. Elle ne
touchait aucun échantillon conservé — elle retirait des morceaux et recollait le reste — mais
retirer est encore modifier, et la consigne est que le son déposé sorte tel quel. Elle se
rallume par vidéo : `npm run monte -- <slug> --coupe-silences`.

La contrepartie est réelle : les silences de la prise restent dans la vidéo, et le rythme est
celui de l'enregistrement. Sur une prise où l'on cherche ses mots, ça s'entend. C'est un
arbitrage assumé — voir §10, dont la première règle est désormais à lire avec cette réserve.

Deux choses touchent encore à la piste, et ce ne sont pas des traitements :

- **les fondus de 8 ms** aux raccords, quand la coupe est demandée — sans eux chaque raccord claque ;
- **le remplacement de timbre** par ElevenLabs, quand il est demandé — c'est un choix éditorial.

Le rendu **mesure** la sonie et l'annonce, sans la corriger : la mesure dit de combien la
plateforme remontera le fichier. Seul un vrai pic au-dessus de −1 dBTP déclenche une alerte,
parce que lui annonce une vraie distorsion.

## 10. Le montage : doctrine

Le montage n'illustre pas, il **soutient l'attention**. Quatre règles qui priment sur le goût :

1. **Aucun temps mort — mais plus au prix de la piste.** La règle valait tant que le montage
   coupait les silences. Il ne le fait plus par défaut (§9) : le temps mort se combat donc
   maintenant à l'écriture et à la prise, pas au découpage. `--coupe-silences` reste disponible
   quand une prise le mérite vraiment.
2. **Un événement visuel toutes les 2 à 4 secondes** : coupe, punch-in, apparition d'un mot-clé, insert B-roll, infographie. Jamais deux fois le même effet de suite.
3. **Tes propres plans se posent EN INSERT, jamais en plein écran.** Pexels ne connaîtra jamais
   ton produit ni ton visage : ce qui est déposé dans `assets/broll/` avec des mots-clés vient se
   poser en carte par-dessus le plan de coupe, qui continue de vivre derrière et recule d'un pas
   — six pour cent d'échelle, un voile de flou — pour laisser lire la carte. Une image qui prend
   tout le cadre arrête le montage : on passe d'une vidéo à une diapositive.
   Les mots-clés se cherchent dans la requête (anglais) **et** dans l'ancre du script (français).
   Un plan qui n'accroche rien laisse la place à Pexels ; il n'est jamais posé au hasard.
   Vérifie avant de monter : `npm run broll -- <slug>`.
4. **Un plan de banque ne resservira pas avant dix vidéos.** La déduplication valait dans une
   vidéo ; entre deux, la même requête ramenait le même premier candidat, et l'abonné qui en
   regarde trois de suite voyait trois fois la même main sur le même téléphone — la signature
   d'une chaîne « à plans de banque ». Le montage écarte tout média employé par les **dix**
   derniers montages de la chaîne. Aucun registre : les `plan.json` sont le registre, une vidéo
   supprimée sort d'elle-même de la fenêtre.
5. **L'effet illustre le propos ou il dégage.** Une transition qui ne marque pas un changement de sujet est du bruit. Une infographie qui ne rend pas un chiffre plus clair est une décoration.

### Le premier plan décide de tous les autres

Les quatre règles valent pour les trente plans d'une vidéo. Le premier en réclame une
cinquième, parce qu'il ne joue pas le même rôle : **c'est le seul dont dépend le fait que les
autres soient vus.** Un spectateur qui ne s'arrête pas dans les deux premières secondes ne verra
ni le hook, ni l'argument, ni l'appel à l'action.

**Ce qui arrête le mieux, c'est un visage qui porte une émotion.** C'est la forme que le regard
humain repère avant même de comprendre ce qu'il voit, et le seul support d'émotion qui se lise en
une demi-seconde. Ni le mouvement ni le contraste n'en approchent : un visage immobile en gros
plan arrête plus qu'une foule agitée.

Le montage rapatrie donc **cinq** candidats pour ce plan-là, cherche un visage dans chacun, et
retient **celui dont le visage occupe le plus de cadre** — une émotion se lit sur un gros plan,
pas sur une silhouette au fond de l'image. `outils/python/visages.py`, OpenCV, huit vues par clip,
un visage exigé sur deux vues au moins (sur une seule, le détecteur hallucine : un appareil photo
posé dans le noir a rendu un « visage » de 40 % du cadre).

**Ce signal est un bonus, jamais une exclusion.** Le détecteur rate des visages — profils
marqués, contre-jours, trois-quarts dans le noir. « Aucun visage trouvé » veut dire « pas
trouvé », jamais « il n'y en a pas ». Et il ne lit pas l'émotion : il repère le véhicule, pas ce
qu'il transporte. Un visage vide rend le même chiffre qu'un visage bouleversé.

**Quand aucun candidat ne montre de visage**, on retombe sur trois relevés — qui ne disent pas ce
qui accroche, seulement ce qui ne peut pas accrocher :

| signal | ce qu'il capte | tiers bas | médiane | tiers haut |
|---|---|---|---|---|
| **mouvement** | ça bouge à l'image | < 2 | 3,2 | > 5 |
| **contraste** | ça tranche, il y a un sujet | < 35 | 39 | > 85 |
| **couleur** | ce n'est pas du gris | < 4 | 5,6 | > 10 |

Le choix se fait par un scrutin par rangs, jamais par une note : additionner des points de
contraste et des points de mouvement reviendrait à décréter en secret un taux de change entre
deux grandeurs qui n'en ont pas.

**Un plan n'est déclaré terne que s'il n'a ni visage, ni aucun des trois.** L'exception du visage
n'est pas une politesse, c'est une correction : le plan 24 d'un montage réel sort
`1,2 · 13,6 · 0,3` — terne sur les trois relevés. C'est un portrait en gros plan, en clair-obscur,
noir et blanc, le plan le plus chargé du lot. Trois nombres disaient exactement le contraire de ce
qu'un œil voit en un dixième de seconde.

**Le vrai verdict se donne à l'œil.** `npm run broll -- <slug> --plans` affiche les relevés ;
l'atelier marque la vignette d'ouverture sans lui mettre de note, parce qu'un chiffre affiché là
se lirait comme une validation. Aucune mesure ne dit si l'émotion est là.

**Et le levier le plus fort est à l'écriture.** Une requête qui demande une personne et un état
(« femme qui encaisse une nouvelle », « homme seul qui hésite ») rend des visages ; une requête
d'ambiance rend des décors. Le plan d'ouverture mérite qu'on écrive sa requête exprès. Pour la
génération par IA, l'ouverture demande explicitement un gros plan de visage avec l'émotion lisible
dans les yeux — les plans suivants, non : trente portraits d'affilée sont un diaporama.

### Le hors-sujet ne se mesure pas. La LISIBILITÉ, si.

C'est la seule chose qu'on sache dire d'un plan avec un chiffre. « Est-ce que cette image parle du
bon sujet » n'a aucun signal — la banque rend cinq candidats pour une requête absurde. « Du texte
blanc va-t-il se lire là-dessus » en a un seul, et il suffit : **la clarté du fond à l'endroit
exact où le texte se pose.**

**On mesure la BANDE, pas l'image.** Une image globalement sombre peut avoir un bas surexposé — un
plafond de bureau, un ciel, une table blanche. La moyenne de l'image dirait « sombre » et le
sous-titre disparaîtrait quand même. On découpe donc la hauteur où le texte atterrit, d'après le
`positionBas` du THÈME DU PLAN — pas des réglages : les deux peuvent diverger, et mesurer la
mauvaise bande ne dirait rien de la vidéo qu'on va produire.

Relevé sur les 86 plans d'un montage réel, le 7 septembre 2026 :

| | luminance de la bande |
|---|---|
| plan le plus sombre | 30 |
| médiane | 120 |
| quartile haut | 149 |
| décile haut | **167** |
| plan le plus clair | 207 |

**Le seuil est à 170** — le décile haut. Il signale environ un plan sur dix, ceux qui sont vraiment
clairs, sans noyer l'alerte dans la moitié du montage. Sur ce montage il en a trouvé cinq, et les
requêtes disent pourquoi : « Calendar with dates highlighted », « Person signing insurance
document », « Wedding rings on registry document ». Du papier blanc.

`npm run broll -- <slug> --lisibilite` mesure et **écrit le relevé dans le plan** : quatre-vingts
clips prennent deux à trois minutes, le refaire à chaque ouverture d'écran serait insupportable.
`bandeY: null` veut dire « pas encore mesuré », **jamais** « bon » — confondre les deux ferait
passer un montage non vérifié pour un montage validé.

Trois réponses à un plan trop clair, et l'écran les propose toutes : l'échanger, le générer, ou
épaissir le contour à l'étape 5.

**Un plan généré se dit sur la vignette, ET par quel modèle.** Rien ne le distinguait d'un plan de
banque : on relançait une génération en croyant que rien n'avait changé, alors que l'ouverture
venait d'être refaite. Et sans le modèle, on ne peut pas juger si le prix payé valait ce qu'on
regarde — le rapport va de un à soixante. `_modele` est écrit à la génération, dans les deux
chemins : le comblage du montage et l'échange à la main.

**Une remontage EFFACE les mesures de lisibilité**, et c'est normal : le plan est reconstruit,
`_bandeY` avec. Il faut donc remesurer après. L'écran ne dit rien plutôt que d'afficher un ancien
relevé qui ne décrit plus les plans à l'image.

### La revue des plans : elle existait, on ne la trouvait pas

L'étape 6 sait depuis longtemps rejouer un plan **avec sa voix off et ses sous-titres calés**, et
l'ouvrir en grand. Trois choses le cachaient, et la troisième était un bug :

1. **Le bouton disait « Un autre ».** Il n'échangeait rien : il ouvrait le plan en grand, d'où
   l'échange devient possible. On cherchait donc ailleurs de quoi agrandir un plan, et on ne
   cliquait pas sur celui qui le faisait. Il dit maintenant « Agrandir ».
2. **On ne pouvait pas enchaîner.** Revoir une piste image, c'est regarder trente plans à la file ;
   il fallait fermer, retrouver la vignette suivante dans la grille, la rouvrir. Trois gestes entre
   deux plans, donc on n'en regardait jamais que deux ou trois. Le panneau a `‹` et `›`, et les
   flèches du clavier font la même chose.
3. **`dessinePlan` sortait AVANT de redessiner la revue** quand le plan était absent. Deux
   conséquences opposées et aussi trompeuses l'une que l'autre : sur une vidéo neuve, l'étape 6
   n'affichait qu'un bouton et rien ne disait que c'est ici qu'on regarde les plans une fois
   générés ; et en passant d'une vidéo montée à une vidéo qui ne l'est pas, l'écran continuait
   d'afficher **les trente-quatre plans de l'autre vidéo**, avec leur voix off et le bouton qui
   aurait échangé un plan chez la voisine. L'absence se dit maintenant en toutes lettres.

**Un plan généré porte sa RAISON**, au survol : le script l'a désigné (marqué d'une étoile), ou la
banque n'avait rien. C'est la seule chose qu'on puisse corriger au montage suivant — si le script a
choisi un passage qui n'en valait pas la peine, ça se voit ici et nulle part ailleurs.

### Effacer la piste image, et rien d'autre

« Reprendre des plans différents » écarte les anciens ; **« Effacer tous les plans » les
détruit**. Les deux ne servent pas au même moment : l'un pour varier, l'autre pour repartir propre.

**Ce qui part** : `plan.json`, `attributions.json`, et les clips de `public/broll/`. Ce sont des
dérivés — le plan se reconstruit depuis le script et le transcript, les clips se retéléchargent.
Rien là-dedans n'est du travail humain. Sur un montage réel : 86 plans, 173 fichiers, **550 Mo**.

**Ce qui reste, et c'est le cœur de la fonction** : `soustitres.json`. Il vit dans le MÊME dossier
que le plan, et c'est une décision — réglée à l'œil devant l'aperçu, validée. L'emporter en
effaçant la piste image serait le pire des échanges. Restent aussi `coupe.json`,
`public/image.mp4` et `public/voix.wav` : la coupe et la voix convertie ne dépendent pas des plans
de coupe, et les refaire coûterait une conversion payante pour rien.

**On détruit vraiment, on n'archive pas.** Le §6 protège les rushes et les rendus ; une piste
image n'est ni l'un ni l'autre. Cinq cents mégaoctets de clips de banque « mis de côté » sont cinq
cents mégaoctets qu'on ne rouvrira jamais.

### Un remontage redonnait les MÊMES plans

`plansEmployesRecemment` exclut le slug courant — à raison : remonter pour changer une taille de
sous-titres ne doit pas faire valser toute la piste image. Mais du coup « Régénérer les plans »
redonnait exactement les mêmes : la banque rend ses candidats dans le même ordre, et rien ne les
écartait. On ne pouvait pas refuser une piste entière.

`--refais-plans` (« Reprendre des plans différents ») lit les `_mediaId` du plan AVANT de le
réécrire — après, ils n'existent plus — et les ajoute aux exclusions.

### Placer les plans générés — le script décide, pas le hasard

`--plans-ia=<n>` (« Création assistée » dans l'atelier) fixe un **budget** de plans générés pour
ce montage, et le dépense là où la génération sert le plus. `--comble=ia` reste ce qu'il était :
il ne fait que boucher les trous.

**LA BONNE QUESTION N'EST PAS « CE PLAN EST-IL HORS SUJET ».** Celle-là n'a aucun signal, et
c'est mesuré : le 7 septembre 2026, la requête absurde `zzqxwv nonexistent kkjhgf` a rendu cinq
candidats Pexels, dont un visage occupant 25,8 % du cadre, et le plan a été résolu normalement.
Un plan regardé seul ne dira jamais s'il parle du bon sujet.

**LA QUESTION QUI A UNE RÉPONSE EST « QU'EST-CE QU'UNE BANQUE NE PEUT PAS SERVIR ».** Elle se
pose sur le script ENTIER, pas sur un plan, et elle se lit dans le texte :

- un mécanisme abstrait que le texte explique — un calcul, une règle, un enchaînement de causes ;
- un objet, un chiffre ou une situation précise que le texte nomme et que personne n'a filmée ;
- une émotion nommée à un instant nommé, quand c'est le visage qui porte le propos ;
- une image que le texte fabrique lui-même : une métaphore, une comparaison, une scène imaginée.

Et symétriquement : une rue, un bureau, des mains sur un clavier, quelqu'un qui marche — la
banque sert ça très bien, et ça ne doit rien coûter.

`pipeline/lib/choix-ia.mjs` pose cette question au cerveau (Claude, puis fal — §8), avec le texte
complet, ce qui est **dit pendant** chaque plan, et la requête de banque prévue. Il rend le sujet
de la vidéo, les plans retenus, la raison de chacun, et une requête réécrite en anglais — parce
qu'une requête de banque est faite de quatre mots-clés et qu'un modèle vidéo veut une scène.
Mesuré sur une prise réelle : 34 plans, 3,6 s, moins d'un centime, et des choix qu'on peut
défendre — l'ouverture, la notification sans réponse, l'expression ambiguë, les rouages de
l'incertitude.

**Trois garde-fous, et chacun a coûté quelque chose.**

1. **L'OUVERTURE EST NOMMÉE DANS LA CONSIGNE.** `promptDePlan` ajoute au premier plan de coupe
   « gros plan de visage, l'émotion lisible dans les yeux » (§10). Sans le dire au modèle, il
   proposait des rouages pour ce plan-là, et la requête finale demandait des rouages ET un
   visage : on paie alors un plan qui n'est ni l'un ni l'autre. Constaté à la première génération
   d'essai.
2. **UN NUMÉRO INVENTÉ EST JETÉ, jamais rattrapé.** Un `n` hors bornes, un doublon ou une requête
   vide coûteraient une génération posée au mauvais endroit — donc payée et fausse.
3. **LE BUDGET DES PLANS CHOISIS EST RÉSERVÉ.** Ils sont répartis sur toute la durée ; les trous
   tombent où ils tombent. Sans réservation, trois trous dans les vingt premières secondes
   épuisaient le budget et le plan explicitement demandé à la centième seconde passait à la
   trappe.

**Un plan choisi n'interroge PAS la banque.** Dix requêtes et cinq téléchargements pour un fichier
qu'on jette, ce serait déjà du gaspillage ; le vrai coût est ailleurs — le candidat rapatrié
entrerait dans la fenêtre de réemploi des dix montages suivants, où il écarterait un plan qu'on
n'a jamais montré.

**Sans cerveau joignable, on retombe sur le comblage**, et on le dit. Sans clé Pexels non plus, la
génération reste possible : la sortie était sèche — tous les plans retirés, budget intact, et rien
qui explique pourquoi une « création assistée » n'avait rien produit.

**Le comblage, lui, n'a pas changé, et son déclencheur reste le VIDE.** C'est le seul que l'on
sache mesurer sur un plan isolé : après la déduplication interne, la fenêtre de réemploi des dix
derniers montages et les téléchargements ratés, il ne reste aucun candidat. Le trou ne resterait
pas vide — le plan précédent s'étire pour le couvrir, c'est-à-dire le temps mort que le §10
interdit en premier.

Ce qui se mesure, c'est qu'il ne reste **aucun** candidat après la déduplication interne, la
fenêtre de réemploi des dix derniers montages et les téléchargements ratés. C'est rare sur une
chaîne jeune, et de plus en plus fréquent à mesure que la fenêtre se remplit — sur le même essai,
67 plans étaient déjà écartés pour cause de réemploi.

**LE BUDGET SE RÈGLE, IL NE SE SUBIT PLUS.** Il valait trois, en dur, dans le serveur ET dans
l'écran. Trois est une bonne valeur sur une vidéo de deux minutes et une valeur absurde sur une de
dix. C'est un curseur à l'étape 6, et son **maximum est le nombre de plans de coupe que ce montage
aura** — `npm run broll -- <slug> --estime` le compte sans rien appeler, dans le plan de montage
quand il existe, dans le script sinon. Offrir un budget de trente sur une vidéo qui compte douze
plans serait un chiffre qui ne veut rien dire, et le prix affiché à côté serait faux d'autant.

**Le budget est un PLAFOND, pas une cible**, et l'écran le dit : le script décide combien de plans
méritent vraiment une génération, et ce qui n'est pas employé n'est pas facturé. Rendre une liste
vide est un bon résultat — dépenser cinq générations sur une vidéo que la banque couvre serait
exactement le gaspillage qu'on cherche à éviter. Sans plafond, une vidéo dont la banque rate vingt
requêtes coûterait vingt plans sans qu'on l'ait dit une seule fois.

**ET CE PIRE CAS NE S'ÉCRIT NULLE PART EN DUR.** Le libellé de l'écran annonçait « jusqu'à
0,54 $ », celui de l'ouverture « 0,18 $ », et `monte.mjs` multipliait par `0.18` dans son devis
comme dans son journal. Ces trois nombres étaient le tarif d'un modèle qui n'est même plus au
catalogue : le plan de cinq secondes va de 0,04 $ à 2,36 $ — un facteur soixante. On lisait donc
« 0,54 $ » juste au-dessus du sélecteur qui le dément, ce qui est pire que ne rien afficher.

Le prix est maintenant **calculé** à partir du modèle retenu, partout : dans le libellé de la case
d'ouverture, dans la note du pire cas, dans le devis du serveur et dans les deux lignes de journal
de `monte.mjs`. Un tarif ne se recopie pas — il se lit dans `MODELES_PLAN`.

Une génération refusée par fal redevient un trou : le reste du montage ne s'arrête pas pour ça.

### Le modèle vidéo se choisit à l'écran, et son prix décide

Il était une constante dans le code, avec un prix — 0,18 $ — écrit à côté. Les deux étaient faux
dès qu'on changeait de modèle, et ils ne se changeaient qu'en éditant le code. Tarifs fal relevés
le 7 septembre 2026, pour un plan de **cinq secondes** :

| modèle | prix / plan 5 s | facturation |
|---|---|---|
| `fal-ai/ltx-video-13b-distilled` | **0,04 $** | par vidéo |
| `minimax/h3-max/text-to-video` | 0,10 $ | 0,02 $/s (tarif promotionnel) |
| `alibaba/wan-3.0-prime/text-to-video` | 0,70 $ | 0,14 $/s en 720p |
| `bytedance/seedance-2.5/text-to-video` | **2,36 $** | 0,473 $/s en 720p |

**Un facteur soixante.** Le devis de l'étape 6 passe donc de 0,16 $ à 9,46 $ selon le choix — un
prix figé aurait fait accepter cinquante fois la somme annoncée, ce que le §7 interdit. Le choix
vit dans `identite_visuelle.modele_video`, se règle dans « Identité », et le prix s'affiche dans
la liste : choisir sans voir ce que ça coûte, c'est choisir à l'aveugle une dépense qui se répète
à chaque trou comblé.

**Le modèle se choisit AUSSI à l'étape 6**, là où la dépense se décide — celui de la chaîne reste
le défaut, et `--modele-video=` ne vaut que pour ce montage. Refaire une ouverture avec un modèle
plus cher ne doit pas obliger à basculer toute la chaîne. Le total s'affiche **avant** le clic :
« au pire 4 plans avec Wan 3.0 Prime — 2,80 $ ». Le devis arrive après le clic, quand on a déjà
décidé ; le chiffre qui compte est celui qu'on lit avant.

**LE MODÈLE CHOISI N'ÉTAIT PAS CELUI QUI GÉNÉRAIT.** `--modele-video=` existe pour essayer un
modèle sur UNE vidéo sans basculer la chaîne : `monte.mjs` le pose dans sa carte `chaine` **en
mémoire**, et annonce le bon prix. Mais `medias.mjs` et `plan-broll.mjs` appelaient
`modeleDePlan(litChaine())` — ils **relisaient `config/chaine.json` sur le disque**, qui n'avait pas
bougé. Choisir Seedance à l'étape 6 affichait donc 2,36 $ le plan, envoyait l'option, la voyait
passer dans le journal — et générait avec LTX à 0,04 $.

Relevé le 8 septembre 2026 sur une VSL réelle : `modele_video` de la chaîne à `null`, et les cinq
plans générés portent tous `fal-ai/ltx-video-13b-distilled` dans leur `_modele`. Le devis annonçait
onze dollars, la facture en valait vingt centimes, et l'image n'était pas celle qu'on avait
demandée. **Un modèle relu sur le disque ignore par construction tout ce qui se décide pour un seul
montage** : il arrive maintenant par l'appelant, avec repli sur la chaîne pour les chemins qui n'ont
rien à passer (`broll --remplace`). C'est `_modele`, écrit dans le plan, qui permet de le vérifier
après coup — sans lui, ce défaut serait resté invisible.

**Un plan remplacé change de PROVENANCE, et l'oubli ne se voyait nulle part.** Un plan d'abord
généré puis échangé contre un plan de banque gardait `source: 'fal'` : le fichier venait de Pexels,
le plan disait l'inverse. Une licence CC-BY exige l'attribution de son auteur — un plan de banque
catalogué « fal » est un crédit qu'on ne rend pas.

**TROIS CHOSES VARIENT D'UN MODÈLE À L'AUTRE, et les ignorer casse en silence.**

1. **La forme du corps.** LTX veut `num_frames` ; Seedance, MiniMax et Wan veulent `duration` en
   secondes. Envoyer l'un à l'autre ne lève pas : le champ inconnu est ignoré, et on paie une
   vidéo de la durée par DÉFAUT du modèle. On le découvre au montage, sur un plan qui ne tient pas
   dans son trou.
2. **Le prompt négatif.** Seedance 2.5, MiniMax H3 Max et Wan 3.0 n'en ont PAS. La consigne
   « aucun texte à l'image » passe alors par le prompt POSITIF — c'est exactement à quoi sert
   `AUCUN_TEXTE_A_L_ECRAN`, et `promptDePlan` l'y met déjà pour tous.
3. **L'audio.** Seedance en génère par défaut. Sur un plan de coupe, la bande son est la voix
   off : un plan qui apporte la sienne se superpose à elle, et rien en aval ne la retire.
   `generate_audio: false`, explicitement.

Le catalogue — identifiant, prix, forme du corps — vit dans `MODELES_PLAN` de
`pipeline/lib/fal.mjs`, et l'écran le reçoit du serveur. Une liste recopiée dans l'interface
divergerait au premier tarif qui bouge, et l'écran annoncerait un prix que le devis ne pratique
plus. Le garde de solde suit aussi : 0,20 $ suffisait pour LTX, pas pour un plan Seedance à 2,36 $.

**Le prompt d'un plan généré vit dans `pipeline/lib/fal.mjs`, et nulle part ailleurs.** Il était
dans `plan-broll.mjs` ; le comblage en avait besoin du même, et deux copies auraient divergé à la
première correction de l'émotion — on corrige d'un côté, l'autre continue de rendre des plans
froids, et rien ne dit lequel a servi. `medias.mjs` ne peut pas importer `plan-broll.mjs`, qui
l'importe déjà : d'où ce troisième module, que les deux voient.

**L'ouverture peut être générée d'emblée**, sans passer par la banque : `--ouverture=ia` au
terminal, une case en « création assistée » dans l'atelier, et le prix du modèle retenu écrit sur
la case avant de partir. Le détecteur trouve un
visage, pas ce qu'il porte ; la génération, elle, reçoit l'intention du bloc. Les trente plans
suivants restent en banque.

Les sous-titres sont **calés mot à mot** sur l'audio, jamais approximés. Le détail des styles vit dans `marque/identite-visuelle.md` et les skills de montage.

### L'échelle des sous-titres se prend sur le PETIT CÔTÉ

`taille` est un corps de police exprimé pour la composition de référence — **1080 × 1920**, la
verticale, où le petit côté est la largeur. Le rendu mettait donc à l'échelle par `largeur / 1080`,
ce qui est juste tant qu'on ne monte que du vertical et **faux d'un facteur 1,78 en horizontal** :
sur une composition 1920 × 1080, le 94 px réglé dans l'atelier sortait à 167 px. Relevé le
8 septembre 2026 sur une VSL 16:9 — la même page passait de deux lignes à l'écran de réglage à
**quatre** au rendu, et rien nulle part ne l'annonçait.

L'échelle se prend maintenant sur `min(largeur, hauteur)`. Elle vaut 1 dans les deux orientations,
donc **aucun rendu vertical déjà fait ne bouge**, et l'indépendance à la définition est gardée : la
même vidéo rendue en 2160 × 3840 double son corps de police. Même correction dans `Evenements.tsx`,
qui grossissait pareil chaque mot-clé, chaque chiffre et chaque carte d'insert.

**L'INTERLIGNE EST ÉCRIT DES DEUX CÔTÉS.** Sans valeur explicite, chaque police impose la sienne —
Roboto 1,17, Montserrat 1,22, Anton 1,50 — et l'aperçu, lui, héritait le 1,6 du corps de la page :
1,94 corps entre deux lignes contre 1,51 au rendu. Il vaut **1,15** dans `SousTitres.tsx` comme dans
`atelier/app.js`, la séparation des lignes étant déjà payée par la gouttière de 0,22.

**La vignette de plan de l'étape 6 divisait aussi par 1080**, donc annonçait un corps 78 % trop gros
sur un montage horizontal. Elle divise par la largeur du format. Elle reste une approximation
déclarée sur le reste — graisse et gouttière —, mais plus sur la taille.

Vérifié au pixel le 8 septembre 2026 sur un rendu 1920 × 1080 : lignes espacées de 142 px pour 140
attendus, bloc à 264 px du bas pour 248 attendus — l'écart est l'ombre portée de 10 px de flou, que
le seuil de mesure attrape. L'aperçu et le rendu calculent désormais avec les mêmes nombres : 94 px
de corps sur 1 920 de large, 20,7 de gouttière, 19,5 de contour, 1 651 de largeur utile.

## 11. Skills

Les skills dans `.claude/skills/` portent le savoir-faire détaillé. Tu les invoques par leur nom quand la tâche correspond. Les principales :

| Skill | Ce qu'elle porte |
|---|---|
| `init-chaine` | l'entretien d'initialisation, du socle marque au premier calendrier |
| `veille-youtube` | scraping Apify, scoring de performance, lecture des miniatures |
| `decodage-tiktok` | ingestion d'un lien, transcript, autopsie de la performance |
| `strategie-contenu` | intentions de recherche, matrice d'angles, hubs et maillage interne |
| `ecriture-script` | écriture long format et short, et le contrat avec le montage |
| `brief-tournage` | prompteur, découpage en prises, consignes de son et de cadre |
| `montage-video` | la chaîne complète, des rushes au rendu |
| `publication-seo` | titre, miniature, description, chapitres, maillage |
| `bilan-performance` | lecture des chiffres, verdicts par angle et par format |

Deux fichiers de référence portent les règles chiffrées, à lire quand elles s'appliquent :
`strategie-contenu/references/seo-youtube.md` et `montage-video/references/doctrine-mouvement.md`.

Le socle marketing lui-même est produit par la skill **`avatars-et-produit`**, qui vit hors de
ce dossier. `init-chaine` la délègue plutôt que de la réécrire.

## 12. Après chaque modification du code

```bash
npm run verifie
```

Et si tu as touché à `remotion/` : rends 3 secondes de test avant d'annoncer que ça marche.
