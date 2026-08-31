---
name: montage-video
description: Monte une vidéo de bout en bout — ingestion des rushes, coupe des silences et des ratés, remplacement du timbre de voix par ElevenLabs, transcription mot à mot, sous-titres calés, B-roll, infographies animées, transitions, étalonnage et rendu final. Utilise cette skill quand l'utilisateur a tourné et veut sa vidéo, veut refaire un montage, ajuster la coupe, changer la voix, ajouter des effets, ou mentionne : monte, montage, coupe les silences, sous-titres, rendu, exporte, la vidéo est trop longue, ajoute des animations, refais le montage. Déclencheurs — "/monte", "j'ai fini de tourner", "monte-moi ça", "le montage est mou", "rends la vidéo". Toujours répondre en français.
---

# Monter une vidéo

Le montage n'illustre pas, il **soutient l'attention**. Trois règles priment sur le goût :

1. **Aucun temps mort.** Les silences sautent, les ratés aussi. Un plan qui ne dit rien n'existe pas.
2. **Un événement visuel toutes les 2 à 4 secondes** : coupe, resserrement, mot qui apparaît, insert, infographie. Jamais deux fois le même d'affilée.
3. **L'effet illustre le propos ou il dégage.** Une transition qui ne marque pas un changement de sujet est du bruit ; une infographie qui ne rend pas un chiffre plus clair est une décoration.

**Pour tout ce qui touche au mouvement lui-même** — raccords, direction, cascades, durées, statut des sous-titres — lis `references/doctrine-mouvement.md`. C'est ce qui fait la différence entre une vidéo qui se regarde comme un seul mouvement et une pile de plans animés chacun dans son coin.

---

## L'ordre des opérations, et pourquoi

```
rushes → silences → audio coupé → remplacement du timbre
       → transcription de CE fichier-là → calage des événements → piste image → rendu
```

Deux points ne se contournent pas :

- **On remplace la voix sur l'audio déjà coupé**, pas sur le rush entier. On paie à la minute : convertir des silences, c'est payer pour du vide.
- **On transcrit la voix finale, jamais la prise d'origine.** La sortie du convertisseur n'est pas identique à l'échantillon près à l'entrée : caler les sous-titres sur la prise donne des sous-titres qui glissent, de plus en plus, jusqu'à la fin.

---

## 1. Vérifier les rushes

Ils vont dans `videos/<slug>/02-tournage/`, nommés `prise-01.mp4`, `prise-02.mp4`, `coupe-01.mp4`. Les prises passent avant les plans de coupe ; l'ordre alphabétique fait foi.

Si la caméra a produit des noms illisibles, renomme-les toi-même — ne demande pas à l'utilisateur de le faire.

Avant de lancer, sonde le premier fichier et signale ce qui compromet la suite :

- **pas de piste audio** → la prise est inutilisable ;
- **son très bas ou lointain** → la transcription et le remplacement de voix vont souffrir ; propose de baisser `COUPE_SEUIL_DB` à −40 et préviens que le résultat sera moyen ;
- **cadence variable** → à convertir en cadence fixe avant tout ;
- **moins de 1080 de haut** pour un format vertical → recadrer coûtera de la définition.

---

## 2. Lancer le montage

```bash
npm run monte -- <slug>
```

Par défaut, **il ne refait que ce qui manque**. La transcription et le remplacement de voix coûtent du temps et de l'argent : les rejouer sans raison est le meilleur moyen de brûler un quota pour rien.

| Option | Quand |
|---|---|
| `--voix=brute` | garder sa voix telle quelle, sans ElevenLabs |
| `--depuis=coupe` | refaire à partir de la détection des silences |
| `--depuis=transcris` | le script a changé, il faut recaler |
| `--seuil-db=-40` | couper moins (pièce vivante, micro lointain) |
| `--silence-min=0.5` | garder les silences courts |
| `--coupe-silences` | retirer les silences — **désactivé par défaut**, le son déposé n'est pas modifié |

**Seuil : 5 minutes de voix à convertir sans confirmation.** Au-delà, le pipeline s'arrête et annonce le coût. Annonce-le aussi à l'utilisateur avant de passer `--oui`.

---

## 3. Lire ce que le pipeline dit

Il parle. Ce qu'il faut entendre :

| Message | Ce que ça veut dire | Quoi faire |
|---|---|---|
| « plus de 45 % de retiré » | soit beaucoup d'hésitations, soit un seuil trop haut | faire écouter `03-audio/voix-coupee.wav` avant d'aller plus loin |
| « X mots sur Y n'ont pas été retrouvés » | le texte lu diffère du script | vérifier ; en dessous de 15 %, c'est normal |
| « répartition uniforme » | l'alignement a échoué | le son est mauvais ou la prise ne correspond pas au script — ne pas rendre en l'état |
| « la voix finale fait X pour Y d'image » | dérive entre son et image | au-delà d'une seconde, écouter la fin de la vidéo |
| « N passages où rien ne bouge plus de 4 s » | l'image va sembler figée | ajouter des événements visuels **dans le script**, puis `--depuis=cale` |
| « un événement toutes les N secondes » | densité trop faible | idem |

**Le pipeline ne comble jamais un creux tout seul.** Un événement visuel inventé par une machine n'illustre rien. Il signale, tu écris.

---

## 4. Enrichir le montage

Les événements visuels vivent **dans le script** (`01-script.json`), pas dans le plan de montage. C'est ce qui permet de les relire, de les corriger et de les rejouer.

Pour ajouter un événement : édite le script, puis `npm run monte -- <slug> --depuis=cale`. C'est instantané — ni transcription ni voix ne sont refaites.

Le format complet est dans `ecriture-script/references/format-script.md`. En résumé :

| Type | Pour quoi | Piège |
|---|---|---|
| `mot-cle` | un mot qui porte l'idée | pas plus de quatre mots, sinon ça se lit au lieu de se voir |
| `chiffre` | un compteur qui monte | garder le chiffre final lisible deux bonnes secondes |
| `infographie` | comparaison, liste de trois, chronologie, avant/après | **une idée par infographie** |
| `broll` | montrer ce dont on parle | la requête s'écrit **en anglais** ; sur un mot précis |
| `capture` | une preuve, un écran | lisible une fois réduit |
| `punch-in` | resserrer sur une idée forte | 4 à 8 %, jamais sur une transition |
| `carton` | marquer une rupture | rare, sinon il perd son effet |
| `transition` | changement de sujet **seulement** | à l'intérieur d'une idée, on coupe sec |

Chaque événement porte une **ancre** : le mot du script sur lequel il tombe. C'est ce qui le cale exactement, plutôt qu'« à peu près au milieu du bloc ». L'ancre doit apparaître telle quelle dans le texte du bloc — le pipeline refuse le script sinon.

Le B-roll demandé par `requete` est cherché, téléchargé et vérifié automatiquement, à condition qu'une clé Pexels soit dans le trousseau. Sans clé, ces plans sont retirés et le pipeline le dit.

---

## 5. Contrôler avant de rendre

```bash
npm run studio -- <slug>
```

Ouvre l'aperçu. Scrube la timeline et vérifie, dans cet ordre :

1. **Le calage des sous-titres** sur trois passages pris au hasard, dont un à la toute fin — c'est là que les dérives se voient.
2. **Les jointures de coupe** : pas de mot mangé, pas de respiration coupée en deux.
3. **Les événements visuels** : chacun tombe sur son mot, reste assez longtemps, ne se superpose pas au suivant.
4. **La lisibilité en vertical** : les sous-titres restent au-dessus de l'interface de TikTok et des Shorts.

Puis un extrait pour vérifier vite :

```bash
npm run rends -- <slug> --extrait=0-300 --brouillon
```

**Ne rends jamais une vidéo complète sans avoir montré le plan de montage à l'utilisateur.**

---

## 6. Rendre

```bash
npm run rends -- <slug>
```

Deux passes, et c'est volontaire : Remotion produit un master plat, puis ffmpeg applique l'étalonnage, normalise le son à −14 LUFS et encode avec l'accélération matérielle. Remotion n'a pas de filtre d'étalonnage, et son ffmpeg embarqué est volontairement minimal.

Compter environ trois fois la durée de la vidéo en temps de rendu, sur une carte dédiée.

---

## Le rythme, concrètement

Ce qui fait la différence entre une vidéo qu'on regarde et une vidéo qu'on quitte :

- **Les huit premières secondes n'ont aucun temps mort.** Pas de logo, pas de « bonjour à tous », pas de respiration. Le premier mot est le hook.
- **Un changement toutes les 2 à 4 secondes.** En dessous de deux, c'est épileptique ; au-delà de quatre, l'œil décroche.
- **Alterner les registres.** Deux infographies de suite fatiguent. Après une infographie, un plan simple.
- **Le resserrement ne s'utilise que sur une idée forte.** Systématique, il ne veut plus rien dire.
- **Les transitions marquent les frontières de sujet.** À l'intérieur d'une idée, on coupe sec — le jump cut est le langage du format.
- **Le silence volontaire existe.** Marqué `[pause]` dans le script, il est conservé. C'est le seul silence qui survit.

---

## Quand ça ne va pas

**« Le montage est haché. »** Le seuil de silence est trop bas ou la marge trop courte : `--seuil-db=-40 --silence-min=0.5`, puis `--depuis=coupe`.

**« Les sous-titres sont décalés. »** Vérifie qu'ils ont été calés sur la voix finale et non sur la prise. Si la dérive croît avec le temps, c'est un problème de source : `--depuis=transcris`.

**« La voix ne me ressemble pas. »** C'est le principe du remplacement de timbre. Ce qui est conservé, c'est l'intonation et le rythme. Pour se rapprocher : monter `--similarite`, baisser `--stabilite`. Ou `--voix=brute`.

**« C'est trop long. »** Le montage ne raccourcit pas un script trop long : il retire les silences, c'est tout. Retour à `/script`.

**« Ça manque de dynamisme. »** Regarde les creux signalés par le pipeline, et la densité d'événements. En dessous d'un toutes les cinq secondes, le problème est dans le script, pas dans le montage.

---

## Cinq règles tirées de la production

Chacune vient d'un défaut constaté à l'écran, pas d'une intuition. Elles priment sur le goût.

### 1. Un plan animé ne dépasse JAMAIS sa propre durée

Un clip généré fait cinq secondes. Posé sur un créneau de vingt, il se fige sur sa dernière
image pendant quinze — et **un arrêt sur image au milieu d'un montage se voit immédiatement**,
bien plus qu'une image fixe assumée, qui elle porte un faux travelling et ne prétend pas bouger.

Avant de rendre, vérifie qu'aucun plan vidéo n'a un créneau plus long que le fichier. S'il
dépasse, deux issues : le repasser en image fixe, ou **prolonger avec la même image en fixe**,
ce qui donne un raccord invisible.

### 2. On n'anime que ce qui ne fait pas bouger un corps humain

C'est là que la génération vidéo se trahit. Un visage, une silhouette, une gestuelle produisent
un mouvement mou qu'un spectateur repère en une seconde, même sans savoir le nommer — c'est ce
qui fait dire « on dirait de l'IA ».

Un objet, une lumière, une matière, un lieu vide, des mains seules, une silhouette de dos et
immobile : tout cela passe parfaitement. **Deux personnes qui se parlent : jamais.**

### 3. Le texte à l'écran, c'est le sous-titre — et rien d'autre

Une surcouche de mots-clés qui tourne en même temps qu'un sous-titre mot à mot produit **deux
couches de texte simultanées**, souvent le même mot deux fois quand la surcouche est ancrée sur
ce que la voix dit à cet instant. L'écran est chargé et le spectateur lit deux fois la même chose.

Le sous-titre porte le rythme à lui seul. Les seules exceptions sont l'**infographie**, qui dit
ce que la voix ne peut pas dire, et le **carton final**, qui porte l'action.

### 4. Le sous-titre transcrit ce qui est DIT, jamais ce qui était écrit

Forcer le texte du script sur l'audio ne marche que si la personne l'a récité mot pour mot. Dès
qu'elle s'en écarte — et il vaut mieux qu'elle s'en écarte —, les mots divergents n'ont plus
d'horodatage propre : ils sont interpolés entre leurs voisins, et **le décalage grandit sur toute
la suite**. Le spectateur lit alors autre chose que ce qu'il entend.

Le script structure les blocs et porte les événements visuels. La voix, elle, se transcrit.

### 5. Sur un format sans caméra, le plan de coupe EST la piste image

Ailleurs, un plan de coupe est un insert : il couvre un mot, puis rend la main au visage. Sans
visage, il n'y a rien en dessous — juste un aplat. Des plans espacés laissent donc la majorité
de la vidéo sur un fond vide.

La couverture doit être **continue**, chaque plan tenant jusqu'au suivant. Et comme un plan animé
ne peut pas s'étirer (règle 1), le mélange est imposé par la technique autant que par le budget :
**des images animées d'un faux travelling pour couvrir la durée, des clips courts réservés aux
pics d'émotion.**

### 6. Le rythme des plans : deux planchers et un plafond

Trois contraintes, dans cet ordre de priorité.

**Aucun plan ne dure moins de deux secondes.** En dessous, l'œil n'a pas le temps de comprendre
ce qu'il regarde : le plan passe, il n'apprend rien, et l'enchaînement se lit comme de la
nervosité plutôt que comme du rythme. Deux ancres trop rapprochées ne donnent donc pas deux
plans — la seconde est fondue dans la première.

**On change de plan quand on change de phrase.** Un plan qui tient sur deux phrases donne
l'impression que l'image a été oubliée : l'oreille est passée à autre chose, l'œil est resté.
La coupe posée sur une fin de phrase se ressent comme une avancée, et c'est elle qui tient la
durée de visionnage.

Le pipeline détecte ces frontières sur deux signaux — la ponctuation forte, et tout silence de
plus de 450 ms — puis découpe automatiquement les plans qui les traversent.

**Quand les deux règles s'opposent, le plancher gagne.** Deux fins de phrase séparées de moins
de deux secondes ne produisent qu'une seule coupe : découper là fabriquerait exactement les
plans trop courts que la première règle interdit. Il reste donc toujours quelques frontières
non coupées, et c'est voulu.

Cible atteinte en pratique : **des plans de 2 à 5 secondes, moyenne autour de 4**.

### 7. Une infographie fixe ce qui serait perdu, sinon elle n'existe pas

Le test est unique et il est sévère : **est-ce que le spectateur repart avec quelque chose qu'il
n'aurait pas retenu à l'oreille ?**

Une énumération que la voix débite en une seconde et demie mérite une infographie : écrite, elle
se retient. En revanche, une phrase que la voix vient de dire, mise à l'écran telle quelle et
décorée, **ne fixe rien** : elle redit. Elle prend l'écran et ne le rend pas.

Trois formes à refuser systématiquement :

- **la répétition illustrée** — la même phrase affichée trois fois parce que la voix la répète ;
- **le schéma sans donnée** — une chronologie, un graphe ou un rail qui ne porte aucun chiffre ni
  aucune comparaison réelle ;
- **le concept décoré** — une idée abstraite posée dans une carte, avec une bordure et un fond.

Sur un format court, **une infographie par vidéo est un maximum raisonnable**, et zéro est un
résultat acceptable. Le carton final ne compte pas : il porte une action, pas une information.

### 8. Les plans de banque sont étalonnés, les plans générés ne le sont pas

Les seconds naissent dans la palette de la chaîne. Les premiers arrivent avec les couleurs de
n'importe quel stock et, posés côte à côte, ils trahissent immédiatement leur provenance. Une
désaturation et une pousse vers la couleur d'accent suffisent à les faire appartenir à la même
vidéo — c'est ce qui fait qu'un plan gratuit cesse de ressembler à un plan gratuit.

Et **une requête ne verrouille pas ce qu'une banque renvoie.** Tout ce qui doit correspondre à
l'avatar visé se précise dans la requête elle-même, sans quoi la banque choisit à ta place.

### 9. Le mélange, et ce qu'il coûte

Une banque d'images fournit aussi des **vidéos**, gratuitement et sans limite. La génération, elle,
se paie au plan. La répartition qui en découle :

| | Source | Coût |
|---|---|---|
| Les pics d'émotion | génération | ~0,20 $ le plan |
| Tout le reste | banque, en vidéo | zéro |

Quatre à cinq plans générés par vidéo suffisent. Tout générer coûte cinq fois plus pour un gain
que personne ne voit — et se heurte de toute façon à la règle 1, puisqu'un plan généré ne dure
que cinq secondes.

---

## La passe « pro » : ce qui sépare un montage propre d'un montage professionnel

Portée depuis l'étude d'une stack de montage publicitaire (autonomous-shortform-facecam-editing),
adaptée au faceless. Chaque point est implémenté dans le pipeline — cette section explique le POURQUOI.

### 10. La première image est la vignette

Elle est deux choses à la fois : la miniature que la plateforme propose dans le fil, et le quart
de seconde où la rétention se décide. **Aucun fondu au noir en ouverture sur un short**, aucun
fondu d'entrée sur le premier plan, aucun impact de coupe dessus : la première image est pleine,
nette, immobile. (Le fondu d'ouverture reste légitime en format long, où le clic a déjà eu lieu.)

### 11. Le mouvement est un système à trois étages

- **L'impact de coupe** : chaque plan entre 4 % trop grand et se pose en un quart de seconde.
  Sous le seuil où on le remarque, au-dessus du seuil où on le ressent.
- **Le zoom d'appui (punch-in)** s'applique à l'ÉTAGE IMAGE ENTIER, jamais à la piste seule —
  sur un faceless, la piste est un fond invisible sous les plans, et un zoom dessus ne zoome
  rien. Montée franche sur le mot, tenue courte, retour doux. Les sous-titres restent hors de
  l'étage : eux ne bougent jamais.
- **L'ambiance** : une vignette et un grain qui dérive, sur toute la vidéo. C'est la couche qui
  unifie des plans venus de trois mondes (banque étalonnée, génération, aplats).

### 12. Les archétypes au-delà de l'infographie-liste

- **`takeover`** — un seul mot, plein écran, qui claque avec secousse et éclair d'accent. Réservé
  au pivot émotionnel, une fois par tiers de vidéo au maximum : utilisé deux fois de suite, il ne
  veut plus rien dire.
- **`pastilles`** — des pilules qui poppent en cascade, pour une énumération que la voix débite
  trop vite pour être lue ligne à ligne.
- La règle de choix venue de la pub, transposable : un nombre prononcé appelle un compteur, une
  énumération une liste ou des pastilles, le pivot un takeover, jamais deux archétypes identiques
  d'affilée.

### 13. On ne rend jamais à l'aveugle, et on ne perd jamais une version

Chaque rendu produit automatiquement :

- une **planche de huit images** (`<slug>-planche.jpg`) — c'est elle qui attrape les accidents
  visuels que les journaux ne voient pas (elle a trouvé, dès sa première exécution : une première
  image noire, un mot de takeover qui débordait, et dix punch-ins qui n'existaient pas à l'écran) ;
- une **mesure de sonie du fichier final** — cible −14 LUFS ± 1, vrai pic sous −1 dBTP. C'est le
  fichier que la plateforme lira, pas la voix avant mixage ;
- la **version précédente conservée** (`<slug>.precedent.mp4`) — écraser le master rend toute
  comparaison impossible.

### 14. La transcription est assainie d'office

Trois défauts reproductibles du moteur, corrigés avant tout usage : le générique halluciné sur le
silence de fin (« Sous-titrage Société Radio-Canada »), les horodatages non croissants qui font se
chevaucher deux sous-titres, et les nombres éclatés (« 5 » / « 000 ») dont la pagination peut
tomber au milieu.

### 15. Les sous-titres se découpent à la grammaire, jamais au compteur

Une pagination au compteur produit des pages comme « TOUT ALORS QU'IL » — des groupes qui ne
veulent rien dire parce qu'ils se ferment au milieu d'un lien grammatical. L'œil bute, page
après page, et c'est cette friction qui fait « sous-titres générés ».

Trois règles, implémentées dans `pagine()` :

- une page se ferme sur une **ponctuation**, un **silence**, ou un **mot plein** — jamais sur un
  article, une préposition, une conjonction ou un pronom (liste des mots-outils, élisions
  courtes comprises : « qu'il », « n'y », « l'on ») ;
- si le mot **suivant** clôt la phrase, la page l'absorbe au lieu de le laisser orphelin —
  sinon la chute de chaque phrase se retrouve seule sur sa page ;
- garde-fou : cinq mots maximum.

Et le contour du texte est un **vrai contour** — huit ombres dures en croix, le procédé des
sous-titres broadcast — pas une ombre floue qui laisse le texte se noyer sur un plan clair.

### 16. La hiérarchie des raccords : coupe dans une idée, poussée entre deux

**Plus aucun fondu enchaîné entre deux plans.** C'est le langage du diaporama — et, les plans
étant contigus, le fondu d'entrée révélait le fond nu à chaque raccord.

- À l'intérieur d'un bloc du script : **coupe sèche avec impact** (4 % d'échelle résorbés en un
  quart de seconde).
- Au changement de bloc : **poussée** — le nouveau plan monte et pousse l'ancien, qui est
  prolongé d'une demi-seconde pour survivre dessous. Le spectateur sent le chapitre changer
  sans qu'on le lui dise.
- Le faux travelling **varie par plan** (graine sur le nom de fichier : avant, arrière,
  latéral) — toujours le même zoom avant est un signal « diaporama » détecté en trois plans.

### 17. L'étalonnage est un partage de teintes, pas un filtre

Un filtre décale tout uniformément ; un étalonnage donne une **direction à la lumière**. Sur
l'étage image seul (jamais les sous-titres ni l'habillage) : contraste léger, et un partage de
teintes en lumière douce — ombres froides en haut, chaleur d'accent en bas. C'est la différence
entre une image filtrée et une image étalonnée.

### 18. La convergence des couches : le mot fort est appuyé partout à la fois

Le mot sur lequel le script ancre un `punch-in` est, par construction, le mot le plus fort de sa
phrase — c'est l'auteur qui l'a désigné. Ce mot reçoit donc TOUT en même temps, automatiquement :
le zoom d'appui sur l'image, et la couleur d'accent dans le sous-titre (qui lui reste après le
passage de la voix). C'est cette convergence — les couches qui appuient ensemble, au même
instant, sur le même mot — qui fait un montage dirigé plutôt qu'une accumulation d'effets.

L'appartenance punch → mot est stricte (le punch tombe DANS le mot), jamais une fenêtre de
tolérance : une fenêtre colore le mot-outil collé juste avant l'ancre.

### 19. Le flou de mouvement vend la poussée

Une poussée de section nette du premier au dernier pixel se lit comme un déplacement
d'interface ; avec un flou maximal à mi-course et nul à l'arrivée, elle se lit comme un
mouvement de caméra. Même trajet — c'est l'œil qui change de catégorie.

### 20. Le template porte le geste, la config porte la teinte

Aucune couleur en dur dans les effets : la chaleur de l'étalonnage, la pastille des sous-titres,
les cartons — tout dérive de `identite_visuelle` dans `config/chaine.json`. Une chaîne bleue a
des bas de cadre bleus sans toucher au code. C'est le critère de réplicabilité : si lancer une
nouvelle chaîne demande de modifier `remotion/` ou `pipeline/`, c'est un bug.

**Pas de barre de progression** : essayée, retirée — elle n'apporte rien sur ces formats et
ajoute un élément d'interface sur une image qui n'en veut pas.

### 21. La charte vient de l'avatar, jamais du goût

Aucune couleur ni police ne se choisit à la main. `identite-visuelle` les **dérive de l'image
de marque** de la chaîne, vérifie les contrastes, et écrit `config/chaine.json`. Le montage lit
tout depuis là.

Deux conséquences pratiques :

- **Il faut deux tons d'accent**, pas un. L'accent doit se lire comme texte SUR le fond (donc
  clair) et porter du texte blanc en pastille (donc sombre) : un seul ton ne peut pas tenir les
  deux emplois. La pastille est une variante assombrie de la **même teinte** — l'identité est
  intacte, la lisibilité revient.
- **`direction_plans` s'ajoute à chaque requête de banque.** C'est ce qui empêche une chaîne
  douce de recevoir des plans durs, à la source plutôt que requête par requête.

Sur une police variable, **ne régler que `wght`** : les axes optiques interagissent mal avec
`font-size` au rendu et font s'effondrer le texte.

### 22. Un seul rendu à la fois, et on lit son verdict

Deux rendus lancés en parallèle partagent les dossiers temporaires de Remotion et **échouent au
mixage audio** — « Error opening output ... remotion-audio-mixing ». Le second meurt en cours,
laisse le master précédent en place, et la planche de contrôle qu'on regarde ensuite date du
rendu d'avant. On croit alors juger un changement qui n'a jamais été rendu.

Deux règles qui en découlent :

- **Jamais deux rendus concurrents.** Attendre la fin du premier, même si c'est long.
- **Vérifier la fraîcheur avant de juger.** Si la planche est plus ancienne que les plans de
  coupe ou que `plan.json`, elle ne montre pas ce qu'on croit. Un `tail` sur la sortie masque
  les erreurs : lire les dernières lignes en entier.
