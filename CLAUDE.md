# CLAUDE.md — cerveau de la chaîne

> Ce fichier est lu à chaque conversation. Il dit **ce qu'est ce dossier**, **ce que tu as le droit de faire**, et **dans quel ordre**. Tout le reste en découle.

---

## 1. Ce qu'est ce dossier

**Un dossier = une chaîne = un avatar = un segment marketing = un produit.**

Ce dossier est un **template réplicable**. On le copie pour lancer une nouvelle chaîne, on l'initialise une fois, et il devient l'usine à contenu d'une seule marque. Deux produits différents ⇒ deux dossiers différents. Jamais de mélange.

**Langue de travail et de production : le français.** Tu réponds en français, tu écris les scripts en français, tu documentes en français.

## 2. Règle d'or

**L'écriture se décide dans la conversation. La fabrication se pilote dans l'atelier.**

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

**Trois contraintes, et elles ne se négocient pas :**

1. **Aucune logique métier dans l'atelier.** Chaque capacité existe d'abord comme commande
   utilisable seule au terminal. L'interface l'appelle, affiche son journal, montre son résultat.
   Si l'atelier disparaît demain, la chaîne se produit encore.
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
npm run monte -- <slug> --ouverture=ia   # le premier plan généré par IA (0,18 $), les autres en banque
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
npm run depose -- <slug> --retire     # met de côté la prise ET ce qui en découle,
                                      #   pour en déposer une autre
npm run supprime -- <slug>   # met la vidéo de côté dans videos/.corbeille/
npm run supprime -- --corbeille       # ce qui est de côté, et depuis quand
npm run supprime -- --restaure=<nom>  # la remet dans videos/
npm run soustitres -- <slug>          # les réglages de sous-titrage, et leur origine
npm run soustitres -- <slug> --applique   # les pose dans le plan SANS remonter
npm run texte -- <slug>      # les mots transcrits, avec leurs temps
npm run texte -- <slug> --incertains  # ceux dont Whisper doutait — à relire en premier
npm run texte -- <slug> --chiffres    # les nombres dits en lettres, mis en chiffres
npm run soustitres -- <slug> --defaut # ces réglages deviennent ceux de la chaîne
npm run broll                # tes propres plans de coupe, et leurs mots-clés
npm run broll -- --ajoute=<fichier> --mots="produit,guide"
npm run broll -- <slug>      # où ils tomberaient dans cette vidéo, et pourquoi
npm run broll -- <slug> --plans        # les plans de coupe du montage, un par un
npm run broll -- <slug> --remplace=3   # en échange un contre un autre candidat
npm run studio -- <slug>     # aperçu, pour contrôler avant de rendre
npm run atelier              # l'atelier : du dépôt de l'audio au master
npm run cles                 # le trousseau : lister, ajouter, retirer, dégeler
npm run cles -- --quotas     # les quotas réels, clé par clé
npm run choix-voix -- --catalogue     # les voix ElevenLabs accessibles
npm run choix-voix -- --partagees --ton=? # les tons de voix disponibles
npm run choix-voix -- --partagees --langue=fr --genre=female --ton=calm
npm run choix-voix -- <slug> --voix=<id>   # la voix retenue pour CETTE vidéo
npm run choix-voix -- <slug> --essai --voix=<id>   # 10 s convertis, pour écouter
npm run choix-voix -- <slug> --essai --voix=<id> --stabilite=0.2  # et son intonation
npm run choix-voix -- --defaut --voix=<id>         # le défaut de la chaîne
npm run choix-voix -- --defaut --local --modele=<id> --transpose=12
                                                  # le modèle local ET sa transposition
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

**Ça demande une vraie clé API Anthropic** (`sk-ant-api…`, console.anthropic.com), pas le jeton
OAuth de Claude Code (`sk-ant-oat…`) qui, lui, est refusé en 401 par l'API. Compter moins d'un
centime par vidéo. Sans clé, le script se déduit en conversation — c'est ce que fait cette
commande, en moins de mots.

### Deux modes de fabrication, et un avatar qui appartient à la chaîne

L'atelier propose, après le choix du format, **comment fabriquer l'image** :

**Création simple** — le mode d'origine, inchangé. Tu déposes ta prise, le montage l'habille de
plans de coupe.

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

**L'ouverture peut être générée d'emblée**, sans passer par la banque : `--ouverture=ia` au
terminal, une case dans l'atelier, et le devis de 0,18 $ avant de partir. Le détecteur trouve un
visage, pas ce qu'il porte ; la génération, elle, reçoit l'intention du bloc. Les trente plans
suivants restent en banque.

Les sous-titres sont **calés mot à mot** sur l'audio, jamais approximés. Le détail des styles vit dans `marque/identite-visuelle.md` et les skills de montage.

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
