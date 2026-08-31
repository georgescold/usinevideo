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
config/          chaine.json (identité), keys.json (secrets, jamais versionné)
marque/          fiche produit, avatars, hook bank, marketeur, DA, ligne éditoriale
veille/          youtube/ et tiktok/ — matière brute + synthèses
veille/inspirations/  le carnet : des vidéos gardées à la main, avec leur transcript
strategie/       mots-clés, matrice d'angles, architecture de chaîne, calendrier
videos/<slug>/   une vidéo = un dossier, numéroté de 00 à 07
assets/          polices, LUT, musique, logos, SFX
marque/voix/     les voix récoltées : extraits propres, référence, mesures
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
npm run empreinte -- --liste          # les empreintes récoltées, et leur durée
npm run empreinte -- --detail=<id>    # extrait par extrait, avec sa mesure
npm run empreinte -- --retire=<id>    # la retire, fichiers compris
npm run entraine -- <id>              # apprend le timbre de cette empreinte
npm run entraine -- --liste           # les modèles entraînés
npm run entraine -- --installe        # pose l'outillage d'entraînement, sans entraîner
npm run entraine -- --retire=<id>     # retire le modèle, garde l'empreinte
npm run voix -- <slug> --local        # convertit avec le modèle entraîné, gratuit
npm run voix -- <slug> --local --transpose=12   # si les tessitures diffèrent
npm run monte -- <slug> --voix=local  # le montage complet avec le modèle local
npm run transcris            # transcription locale mot à mot
npm run voix                 # remplacement du timbre (ElevenLabs)
npm run monte                # construit le plan de montage
npm run rends                # produit le MP4
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
npm run broll                # tes propres plans de coupe, et leurs mots-clés
npm run broll -- --ajoute=<fichier> --mots="produit,guide"
npm run broll -- <slug>      # où ils tomberaient dans cette vidéo, et pourquoi
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

Ce que la récolte permet dépend de la durée obtenue, et les deux seuils sont très éloignés :
**15 à 30 s** suffisent à un moteur zero-shot, un **entraînement** en réclame 15 à 30 min.
La commande l'annonce à chaque récolte.

**Une source, c'est une adresse OU un fichier.** YouTube, TikTok, Instagram, Facebook,
X, Vimeo, Dailymotion, Twitch, SoundCloud — et, pour tout le reste, le chemin d'un fichier
déjà téléchargé. On n'ouvre pas la liste des mille sites de yt-dlp : l'adresse part en
argument d'un programme externe et l'atelier l'expose sur le réseau local. Le fichier local
est l'échappatoire, et elle n'ouvre aucune surface.

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
4. **L'effet illustre le propos ou il dégage.** Une transition qui ne marque pas un changement de sujet est du bruit. Une infographie qui ne rend pas un chiffre plus clair est une décoration.

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
