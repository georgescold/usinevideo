> **Analyse produite le 26 août 2026 par 11 agents.** 1 285 000 tokens, 34 minutes.
> 1 778 vidéos en base, 437 franchissent le double seuil de crédibilité (20 000 vues ET
> 1 000 abonnés), 72 autopsiées ligne à ligne. 36 concepts en écart, 15 prioritaires.
>
> ⚠️ **À lire avant tout tri automatique :** les trois meilleurs ratios français du corpus
> entier sont du bruit (contenu d'adoration). Un classement par ratio sans lecture des titres
> aurait produit la consigne de faire des vidéos de louange.

---

# Pourquoi elles fascinent, et ce qu'on peut prendre

Note de reference, chaine Conseils Relationnels, avatar Le Desabuse. Ecrite le 26 aout 2026 sur le corpus `veille/youtube/raw`.

---

## Ce qui a ete regarde

**Le corpus.** 1 778 fichiers JSON dans `veille/youtube/raw`, 1 778 identifiants uniques (aucun doublon), dont 1 728 avec un transcript exploitable de plus de 200 caracteres. Le corpus a ete constitue le 26 aout 2026 en 9 campagnes Apify, 195 requetes, 2 011 remontees cumulees, pour 8,09 USD (`veille/youtube/index.json`).

**Les langues.** 479 fichiers francais (`fr`, `fr-FR`, `French`), 1 174 anglais (`en`, `en-US`, `en-GB`, `en-CA`, `en-IN`, `English`), le reste disperse en arabe (27), hindi (27), coreen, turc, polonais, swahili, amharique. 44 fichiers sans langue detectee, 15 sans nombre de vues.

**Le filtre de credibilite.** Le seuil impose est double : au moins 20 000 vues **et** au moins 1 000 abonnes. 437 fichiers le franchissent, dont **95 en francais** et **304 en anglais**. Tout ce qui suit est tire de cette zone. 72 videos ont ete autopsiees ligne a ligne : hook verbatim, promesse, boucle ouverte, structure, verdict volume ou ratio.

**Le bruit ecarte sans analyse.** Sur les 95 francaises qui passent le seuil, 12 sont du bruit par titre (adoration, chansons chretiennes, tarot, astrologie, numerologie, dramas Zee, films nigerians) ; sur les 304 anglaises, 10. Ce n'est pas une precaution theorique : **les trois meilleurs ratios francais du corpus entier sont du bruit.** `PqS794FlAgE` (221 920 vues / 3 510 abonnes, ratio 63,23, contenu d'adoration), `4Hzc-UCjBiM` (945 793 / 17 500, ratio 54,05, adoration), `56IB09qfWDA` (870 965 / 25 900, ratio 33,63, adoration). Plus loin, `EmyUVguXdDc` (207 102 / 13 600, ratio 15,23, Zee Magic) et `B6nV8k401v0` (2 405 763 / 109 000, ratio 22,07, drama). Un tri automatique par ratio, sans lecture des titres, aurait donne au departement editorial une consigne consistant a produire des videos de louange.

**L'avertissement sur les artefacts de denominateur.** Un ratio eleve sur une base minuscule ne prouve rien : une seule poussee de recommandation le fabrique. Cas reels du corpus, tous ecartes : `kbUvsGOXGNQ` (5 766 vues / **63 abonnes**, ratio 91,52), `hTZgWfGWtbA` (10 341 vues / **337 abonnes**, ratio 30,69), `jpA2s-GX71k` (147 vues / **11 abonnes**, ratio 13,36). Aucun de ces chiffres n'est un signal. C'est pour cette raison que le seuil est double et non simple : le ratio seul ment, le ratio adosse a un volume absolu parle. Meme la meilleure preuve anglaise du corpus, `tkAOBvPL5jY` (968 027 vues / 4 280 abonnes, ratio 226,17), est traitee ici avec prudence : c'est le volume absolu de 968 027 vues qui sauve le signal, pas le 226.

**Methode de lecture des transcripts.** Aucun transcript n'a ete lu en entier. Certains font plus de 100 000 caracteres (`IRzbOFDvjaE` : 103 233 caracteres). Extraction par script : les 300 a 400 premiers caracteres pour le hook et la promesse, puis deux ou trois echantillons a 30 %, 55 % et 95 % pour la structure et la cloture.

---

## Les mecanismes de fascination

Classes par frequence d'apparition dans les 72 autopsies. C'est la section qui sert a ecrire.

### 1. La reattribution du symptome
**Le moteur dominant. Present dans une majorite des videos a fort ratio.**

*Tension ouverte* : la video ne promet pas un resultat futur, elle re-explique un fait douloureux que le spectateur vit deja et pour lequel il porte deja un verdict sur lui-meme. On m'evite, mes amis se sont eloignes, elle est partie, je ne ressens plus rien. La question n'est jamais « que va-t-il se passer », c'est **« qu'est-ce que ca dit de moi »**.
*Ce qui retient* : la cause honteuse (je suis defectueux) est remplacee par une cause structurelle. Mais la preuve arrive par facettes successives, chacune decrivant une nouvelle zone de la vie actuelle du spectateur. La video se comporte comme un miroir : partir, c'est cesser d'etre decrit.
*Quand ca referme* : jamais completement. La meilleure version rend la question au spectateur au lieu de la resoudre.

> « Il arrive à un moment dans la vie intérieure où les liens qui nous entouraient autrefois commencent à se modifier sans bruit. Ce n'est pas une rupture brutale, mais une sorte de déplacement silencieux » (`Epm62VSAWBM`, 474 494 vues / 16 500 abonnes, ratio 28,76, 1 010 commentaires)

> « Est-ce que tu as déjà remarqué que certaines personnes semblent mal à l'aise autour de toi, qu'on t'approche moins facilement que les autres ? » (`Hcp5nXMsmUM`, 104 912 vues / 3 330 abonnes, ratio 31,51, 507 commentaires soit 0,48 % par vue)

**Tient sans visage : oui, integralement.** Les deux preuves sont deja des voix off sur illustration.

---

### 2. La refutation du diagnostic que le spectateur subit, dans les quinze premiers mots

*Tension ouverte* : on nomme l'explication que le spectateur s'entend donner depuis des annees, et on la refuse. Ce n'est pas de la curiosite qu'on declenche, c'est une question d'innocence.
*Ce qui retient* : la video ne promet pas une information, elle promet **une innocence**. C'est la seule promesse a laquelle Le Desabuse ne peut pas resister, parce que sa vraie question n'est pas « comment faire » mais « est-ce que c'est ma faute ».
*Quand ca referme* : le verdict tombe en dix a trente secondes ; la preuve, elle, est etalee sur toute la video.

> « Some people don't give up on dating because they're afraid of rejection. They give up because they tried. They did what they were told. They showed up, they improved, and it still didn't lead anywhere. » (`hWVNyFJtrqY`, 32 206 vues / 2 390 abonnes, ratio 13,48, **296 commentaires pour 32 206 vues, soit 0,92 % par vue, le plus fort taux de commentaire verifie du corpus**)

> « Psychology says people who don't have friends are often misunderstood, not broken, not awkward, and definitely not the problem. » (`B4TsytUH3rA`, 572 204 vues / 49 600 abonnes, ratio 11,54)

**Tient sans visage : oui.** Les deux chaines sont faceless, sans budget visible, sans invite.

---

### 3. L'absolution annoncee, la preuve differee

*Tension ouverte* : le verdict liberateur tombe dans les trente premieres secondes. « Ce n'est pas un défaut. Ce n'est pas un problème » (`Hcp5nXMsmUM`, a 29 s). « Cette idée n'est pas totalement fausse, mais elle est profondément incomplète » (`fkDZtdiy8jE`, a 16 s).
*Ce qui retient* : le spectateur ne reste pas pour la conclusion, il l'a deja. Il reste pour **le droit d'y croire**. C'est ce qui tient 26,6 minutes de narration synthetique sans un seul visage.
*Quand ca referme* : sur une absolution finale et non sur un conseil.

> « Pendant des années, on a entretenu une idée très rassurante, celle selon laquelle l'amour serait toujours possible, quel que soit l'âge » (`fkDZtdiy8jE`, 181 501 vues / 4 520 abonnes, ratio 40,16, 633 commentaires)

> « When nothing builds, stopping feels like a rational response, and that's exactly what makes it so hard to question. » (`hWVNyFJtrqY`, a 95 % du transcript)

**Tient sans visage : oui.** `fkDZtdiy8jE` est le cas le plus instructif du corpus francais : 181 501 vues sur 4 520 abonnes, zero visage, narration synthetique, et la description avoue « inspiré par » Cyrulnik sans que l'homme ne prononce un mot.

---

### 4. Ouvrir sur un symptome sensoriel, jamais sur un theme

*Tension ouverte* : la video decrit un etat physique et quotidien avec une precision que le spectateur n'a jamais mise en mots lui-meme. Il se reconnait **avant** de comprendre de quoi on parle.
*Ce qui retient* : la reconnaissance remplace la demonstration. Aucune des videos performantes du corpus n'ouvre en annoncant son sujet.
*Quand ca referme* : quand le symptome recoit son nom, ce qui peut prendre plusieurs minutes.

> « Les messages deviennent plus rares, les rencontres se font plus espacées » (`Epm62VSAWBM`)

> « J'ai pas d'amis. J'ai personne avec qui aller au resto. J'ai personne avec qui aller faire du sport » (`sn9n5nytcyA`, AQuatre, 306 215 vues / 87 600 abonnes, ratio 3,50, temoignages bruts d'inconnus en ouverture)

**Tient sans visage : oui, et c'est meme la solution du probleme.** `sn9n5nytcyA` ouvre sur des inconnus qui avouent une honte : pour une chaine sans visage, c'est le seul moyen d'ouvrir sur de l'humain sans se montrer. Version transposable : commentaires YouTube ou fils Reddit affiches a l'ecran et lus en voix off.

---

### 5. L'ouverture par negation

*Tension ouverte* : on nomme trois choses que ce n'est **pas** avant de dire ce que c'est. Cout : zero seconde, zero information livree.
*Ce qui retient* : chaque negation creuse le trou plus profond. Le spectateur ne peut pas partir avant qu'il soit rempli.
*Quand ca referme* : par une formule-verdict courte, placee vers la 55e seconde, celle que le spectateur ira recopier en commentaire.

> « Ce n'est pas une cassure ni une explosion de colère. Ce n'est même pas une dépression, c'est un arrêt. » (`rAs8p-Ndqq4`, 147 499 vues / 7 050 abonnes, ratio 20,92, 644 commentaires soit 0,44 % par vue)

> « That's called having similar hobbies and it's nice, but it's not compatibility. You think you're incompatible because you argue sometimes? You're not necessarily. » (`KbU0Kjoovfk`, 656 732 vues / 90 900 abonnes, ratio 7,22)

**Tient sans visage : oui.** `rAs8p-Ndqq4` laisse d'ailleurs un trou de gabarit non rempli dans sa description (« en nous appuyant sur les travaux de et sur son concept d'individuation »), preuve que le resultat vient de la structure et non du soin.

---

### 6. La mise en accusation d'une croyance rassurante, jamais d'une ignorance

*Tension ouverte* : ce n'est pas la curiosite qu'on declenche, c'est l'alarme d'un cout deja paye. Si la regle que je suis depuis quinze ans est fausse, qu'est-ce que j'ai perdu ?
*Ce qui retient* : le spectateur reste pour recuperer la liste complete des regles qu'il a violees sans le savoir.
*Quand ca referme* : quand la croyance est remplacee par une mecanique nommee, jamais par un encouragement.

> « On vous a toujours dit "Sois gentil et les gens te respecteront." C'est le plus gros mensonge qu'on vous a raconté. » (`WJaBSoYbvrY`, 88 252 vues / 7 540 abonnes, ratio 11,70, en seulement 68 jours, duree 208 s)

> « La plupart des gens pensent que le charisme c'est quelque chose avec lequel on est. Soit tu l'as, soit tu l'as pas. C'est faux et la psychologie le prouve. » (`KD29j-MrNdI`, 718 403 vues / 119 000 abonnes, ratio 6,04)

**Tient sans visage : oui.** Corollaire vaut pour le titre : les quatre meilleurs ratios francais hors bruit portent tous un titre qui **nie** une croyance au lieu de promettre un benefice. `pvl4_qAPgu8` « ON NE TOMBE PAS AMOUREUX PAR HASARD » (ratio 54,62), `RqkhUt5GSzY` (30,22), `Epm62VSAWBM` (28,76), `Hcp5nXMsmUM` (31,51). A l'inverse, `D5DaD33q1QI` « Le Secret des Ruptures Amoureuses » fait 0,38.

---

### 7. Le compteur visible et l'objet numerote

*Tension ouverte* : un objet compte cree une dette. A chaque item livre, le spectateur sait combien il en reste.
*Ce qui retient* : chaque bloc referme sa propre micro-boucle en 90 secondes et en rouvre une autre. Et dans les meilleures versions, chaque item n'est pas une description mais **un test executable sur une personne reelle**.
*Quand ca referme* : au recapitulatif, souvent double d'une interdiction de changer.

> « Faites semblant d'être occupée avec votre téléphone, puis tournez-vous soudainement vers lui » (`4RYg81rG9yM`, 151 500 vues / 11 800 abonnes, ratio 12,84, **943 commentaires, 0,62 % par vue**)

> « Il existe des mécanismes précis, des raccourcis mentaux que ton cerveau et celui des autres suivent automatiquement chaque jour » (`KD29j-MrNdI`, six mecanismes annonces a 31 s)

**Tient sans visage : oui.** Contre-epreuve verifiee : les videos sans compteur et sans echeance plafonnent malgre des audiences enormes. `D5DaD33q1QI` (76,3 min, ratio 0,38 sur 618 000 abonnes), `JM5JcEo9x9I` (46 min, ratio 0,15 sur 1 690 000 abonnes).

---

### 8. Le loop nomme et date

*Tension ouverte* : on ne dit pas « restez jusqu'au bout ». On donne un numero et une place dans la liste, et on l'annonce **au milieu**, pas au debut, ce qui retient exactement ceux qui allaient decrocher.
*Ce qui retient* : le spectateur sait precisement ce qu'il perd en partant.
*Quand ca referme* : a l'item annonce, jamais avant.

> « Le signal numéro 7 est le plus clair de tous » (`4RYg81rG9yM`, annonce a 55 % de la video)

> « Attention, la dernière partie de cette vidéo est un véritable électrochoc » (`z2wM0cEDDRE`, 250 055 vues / 23 700 abonnes, ratio 10,55, loop pose a 27 s)

**Tient sans visage : oui.** Variante structurelle plus propre : le classement inverse. `_fhF7jclE60` annonce « I'm going to start with tier three, which is the absolute worst apps » : le verdict est en fin de video et la structure porte la retention sans un seul rappel verbal (170 902 vues / 8 580 abonnes, ratio 19,92, 414 s).

---

### 9. Le hook bande annonce : empiler sans jamais repondre

*Tension ouverte* : six a huit affirmations ou questions choc, sans contexte, sans transition, sur 25 a 70 secondes. Ce sont autant d'hamecons paralleles : il suffit qu'un seul accroche.
*Ce qui retient* : une structure de dette. Huit affirmations lancees, une seule remboursee a la fois.
*Quand ca referme* : une par une, sur toute la duree, ce qui autorise des formats de 40 a 60 minutes.

> « L'amour est une drogue naturelle comme la cocaïne, comme les endorphines. Les jeunes font moins l'amour que les anciens et ça c'est un étonnement. Un canard motivé pour la sexualité biologiquement, il a des testicules qui font la moitié de l'abdomen. » (`RqkhUt5GSzY`, 1 429 224 vues / 47 300 abonnes, ratio 30,22)

> « Alors, est-ce que le coup de foudre existe ? [...] Euh, tu m'étouffes, j'en peux plus, euh, tu me contrôles » (`pvl4_qAPgu8`, 358 312 vues / 6 560 abonnes, **ratio 54,62, le meilleur signal francais hors bruit de tout le corpus**)

**Tient sans visage : oui, avec adaptation.** `pvl4_qAPgu8` intercale des verbatims de dispute joues. En voix off, cela se transpose en son de dispute plus texte a l'ecran. C'est du montage, pas du tournage.

---

### 10. L'autorite administree apres le choc, et le plus souvent empruntee

*Tension ouverte* : rien n'est presente ni contextualise avant d'avoir choque. `RqkhUt5GSzY` ne dit « je m'appelle Boris Cyrulnik » qu'a 77 s, apres 70 secondes de phrases choc.
*Ce qui retient* : le nom fait le travail d'une source. `B4TsytUH3rA` commence litteralement par le mot « Psychology ».
*Le fait industriel* : `fkDZtdiy8jE` (ratio 40,16) et `Epm62VSAWBM` (ratio 28,76) sont sortis **le meme jour, sur deux chaines differentes de 4 520 et 16 500 abonnes**, avec la meme structure, le meme nom d'autorite dans le titre, et une voix off qui recite un texte que Cyrulnik n'a jamais prononce. Ce n'est pas un coup de chance, c'est une chaine de production faceless qui fonctionne deux fois de suite.

> « Saviez-vous que 87 % des hommes véritablement amoureux ne l'admettent jamais ouvertement ? Bonjour, je suis Alex [...] En 20 ans de carrière » (`4RYg81rG9yM`, chiffre invente, titre de psychiatre invérifiable)

> « Et si je vous disais que Carl Jung a découvert un moyen de voir à travers le masque de n'importe qui en seulement deux questions » (`UH27ZgPxWmY`, 374 184 vues / 98 400 abonnes, ratio 3,80)

**Tient sans visage : oui, et c'est precisement notre format cible.** Mais c'est un emprunt d'autorite, et il est hors de nos regles. Voir la section « Ce qu'on ne prend pas ».

---

### 11. Le cout paye a la place du spectateur, annonce tot et chiffre

*Tension ouverte* : le narrateur a deja subi ce que le spectateur redoute, et il le prouve par des nombres verifiables.
*Ce qui retient* : ce n'est pas un argument d'autorite, c'est une garantie de sincerite. Elle justifie a elle seule 7, 17 ou 100 minutes de patience.
*Quand ca referme* : sur un tableau ou un total, pas sur une opinion.

> « I swiped 500 total times with 100 of them being right swipes, and I got zero matches » (`_fhF7jclE60`, 170 902 vues / 8 580 abonnes, ratio 19,92 ; la description assume : « This isn't theory or advice »)

> « I have spent the last almost 100 hours in open relationship support groups, forums, reading books » (`IRzbOFDvjaE`, 323 440 vues / 18 000 abonnes, ratio 17,97, pour un essai de 100,7 minutes)

**Tient sans visage : oui pour `_fhF7jclE60` (captures d'ecran, compteur a l'image, tableau final anime), partiellement pour `IRzbOFDvjaE` qui repose aussi sur des entretiens filmes.**

---

### 12. La micro-scene reconnaissable a la place de l'argument

*Tension ouverte* : aucune. On empile des scenes trop precises pour etre inventees.
*Ce qui retient* : chaque scene est une preuve que l'auteur a vecu ca, donc qu'il a le droit de nommer. La reconnaissance remplace la demonstration et retient mieux qu'elle.
*Quand ca referme* : jamais. `hWVNyFJtrqY` tient huit minutes sans un seul conseil.

> « It stops generating new attempts. Not because something is broken, but because it learned that attempts don't move outcomes. And without a real feedback loop, there's nothing to work with. » (`hWVNyFJtrqY`, a 45 % du transcript)

> « Pattern three, the overinvestor. Any small sign of interest, and he's all in. One good conversation, and he's imagining the relationship. A few texts and he's rearranging his whole schedule. » (`CsaUp1M089c`, 48 164 vues / 7 710 abonnes, ratio 6,25, 266 s)

**Tient sans visage : oui, c'est le format le moins cher du corpus.** Six a neuf minutes, voix off, aucun tournage, aucune source a verifier.

---

### 13. La promesse d'irreversibilite

*Tension ouverte* : on ne vend pas une information, qu'on peut aller chercher ailleurs. On vend une modification permanente de la perception, qui ne s'obtient qu'en restant.
*Ce qui retient* : c'est la formulation la plus efficace du corpus pour tenir un format long, et elle coute une phrase.
*Quand ca referme* : jamais, par construction.

> « Une fois que tu les connais, tu ne peux plus ne pas les voir » (`KD29j-MrNdI`, a 37 s)

> « À la fin de cette vidéo, vous ne verrez plus jamais les gens de la même manière » (`UH27ZgPxWmY`, a 20 s)

**Tient sans visage : oui.** C'est exactement ce que veut Le Desabuse : comprendre, pas agir.

---

### 14. Ne pas refermer sur une consolation

*Tension ouverte* : la derniere phrase n'est pas un conseil, c'est une question rendue au spectateur. La tension n'est pas resolue, elle est deposee dans les commentaires.
*Ce qui retient* : c'est la seule cloture qui ne trahit pas l'avatar. Les videos qui rouvrent la porte a la fin (`XDlAQfoCKjg` : « quand tu seras prêt à dater ») annulent tout ce qu'elles avaient gagne.
*Preuve chiffree* : `hWVNyFJtrqY` finit sur « At what point did you decide that trying no longer made sense? » et obtient 0,92 % de commentaires par vue. `I5xLd9O0LnU`, qui vend la prophetie (« ton temps viendra »), obtient 0,14 % (284 commentaires pour 204 556 vues) malgre 34,6 minutes et 13 400 abonnes.

**Tient sans visage : oui.** Contre-exemple a bannir : `ZOFsWTwN_TE` (51 364 vues / 4 190 abonnes, ratio 12,26) ouvre parfaitement sur une humiliation concrete puis traite de « loser mentality » ceux qui ont abandonne, c'est-a-dire exactement notre avatar. Excellent mecanisme, destination disqualifiante.

---

### Ce qui n'apparait nulle part dans les videos a fort ratio

**L'espoir date.** Une seule video du corpus vend la prophetie (`I5xLd9O0LnU`, « l'univers te murmure : sois patient, ton temps viendra ») et c'est celle qui a le plus faible engagement par vue de sa tranche : 0,14 % de commentaires et 2,49 % de likes, contre 0,48 % et 4,10 % pour `Hcp5nXMsmUM`, contre 0,92 % pour `hWVNyFJtrqY`. Les ratios les plus hauts vendent l'inverse : **la permission d'arreter d'esperer.**

---

## Ce qui fait du volume contre ce qui fait du ratio

**Ce sont deux choses differentes, et une seule nous concerne.**

**Le volume brut se paie en nom propre, jamais en ecriture.** Les plus grosses videos du corpus reposent sur des audiences deja constituees ou sur un nom mondial :

| id | vues | abonnes | ratio | ce qui porte |
|---|---|---|---|---|
| `Af9t_7LqJo8` | 5 821 353 | 23 000 000 | **0,25** | la chaine seule, et elle sous-performe sa base de 75 % |
| `ikbcrpowlIs` | 5 631 692 | 4 900 000 | 1,15 | la chaine |
| `aOV8OSPBRBE` | 5 497 021 | 7 060 000 | **0,78** | trois createurs FR reunis, moins de vues que d'abonnes |
| `7czBQD-y8bs` | 5 060 392 | 2 010 000 | 2,52 | le nom Cristiano Ronaldo |

Aucune de ces vues ne se serait produite sur une chaine neuve, et aucune de ces productions (decors, casting, 67 a 83 minutes) n'est a notre portee.

**Le ratio, lui, mesure ce que le contenu a fait tout seul.** Il faut le lire adosse a un volume absolu :

| id | vues | abonnes | ratio | ce qui porte |
|---|---|---|---|---|
| `pvl4_qAPgu8` | 358 312 | 6 560 | **54,62** | le hook et le titre, rien d'autre |
| `fkDZtdiy8jE` | 181 501 | 4 520 | 40,16 | narration synthetique, zero visage |
| `Hcp5nXMsmUM` | 104 912 | 3 330 | 31,51 | 5,5 min, voix off, aucune autorite citee |
| `Epm62VSAWBM` | 474 494 | 16 500 | 28,76 | idem, meme jour, autre chaine |
| `hWVNyFJtrqY` | 32 206 | 2 390 | 13,48 | le texte seul, 2 390 abonnes |

**Ce qui nous concerne, c'est le ratio, et une seule raison le justifie : la chaine part de zero abonne.** Une video a 1 429 224 vues sur 47 300 abonnes (`RqkhUt5GSzY`, ratio 30,22) nous apprend quelque chose ; l'audience de la chaine y explique moins de 4 % des vues. Une video a 249 604 vues sur 1 690 000 abonnes (`JM5JcEo9x9I`, ratio 0,15) ne nous apprend rien de positif, elle nous apprend seulement qu'un sujet excellent peut etre mal servi.

**Le plafond atteignable.** Le plus grand nombre de vues obtenu dans tout le corpus francais **sans nom propre, sans invite celebre et sans audience preexistante** est de **358 312 vues** (`pvl4_qAPgu8`, 6 560 abonnes). C'est notre plafond realiste, et il est atteint par l'ecriture du hook seule. Objectif operationnel intermediaire, plus honnete : la zone `Hcp5nXMsmUM` / `WJaBSoYbvrY`, soit 88 000 a 105 000 vues sur 3 000 a 7 500 abonnes, obtenue avec des videos de 3,5 a 5,5 minutes.

**Les deux echecs les plus instructifs du corpus.** `JM5JcEo9x9I` (BLAST, applis de rencontre, 249 604 vues / 1 690 000 abonnes, ratio 0,15) et `D5DaD33q1QI` (Ben Nevert, ruptures amoureuses, 232 832 vues / 618 000 abonnes, ratio 0,38, 76,3 minutes). Deux sujets ideaux pour nos hubs H3 et H1, deux audiences enormes, deux plafonnements. Les deux ouvrent sans tension : l'une sur un cadrage mediatique, l'autre sur des politesses et une enumeration de diplomes (« Paola, merci d'être là. Merci à toi de m'avoir invité »). Conclusion double : **les trente premieres secondes decident de tout, et ces deux sujets sont demontres porteurs et mal occupes en francais.**

---

## Les concepts anglophones absents du francais

Tableau de synthese. « Etat FR » mesure le corpus de 479 fichiers francais, pas YouTube France (voir les limites en fin de note).

| Concept | Preuve anglaise chiffree | Etat francais mesure | Verdict |
|---|---|---|---|
| Expliquer l'arret comme une conclusion rationnelle | `hWVNyFJtrqY` 32 206 v / 2 390 ab, r13,48, 0,92 % comm. Corrobore par `B4TsytUH3rA` 572 204 / 49 600, r11,54 | 0 occurrence exploitable. Le format « psychologie de ceux qui » : 1 seul hit FR, `Rl39Urma5vc` 8 194 v / 30 800 ab, r0,27, et il porte sur la famille | **priorite** |
| L'ame soeur comme invention historique, la bonne personne n'existe pas | `tWDcqt-Xj2w` 2 891 936 v / 269 000 ab, r10,75. Corrobore par `eTbA81qNYt4` 424 059 / 101 000, r4,20 et `4apGtiz42Qk` 680 609 / 269 000, r2,53 | 0 occurrence (« de botton », « school of life » : 1 hit, `JRXXfTwQs4I`, ARTE, 54 474 v / 5 020 000 ab, r0,01, et il ne porte pas la these). La these **inverse** cartonne : `RqkhUt5GSzY` r30,22, `pvl4_qAPgu8` r54,62 | **priorite** |
| La relation floue comme adaptation materielle, pas comme lachete | `XPN_1RRCFsM` 84 264 v / 13 000 ab, r6,48, 405 s | **0 occurrence du mot dans les 479 fichiers FR.** Le cadrage moral, lui, est partout | **priorite** |
| Le protocole chiffre applique a chaque application | `_fhF7jclE60` 170 902 v / 8 580 ab, r19,92 | 0 protocole. Les « j'ai testé » FR sont de l'affiliation : `dNWKYK0pb2s` 987 v / 108 000 ab, `M_E6cR1HfS8` 1 427 / 108 000, `DXQVEXp-wbk` 45 378 / 98 600, r0,46 | **priorite** |
| Corriger le mot « compatibilite » au lieu de le tester | `KbU0Kjoovfk` 656 732 v / 90 900 ab, r7,22. Contre-test sur la meme chaine : `NLHnAb1Jabg` 92 401 v, r1,02, soit 7,1 fois moins | 48 hits, colonises par astrologie, numerologie, tarot, et deux hits qui parlent de Windows 11 et d'eSIM. Meilleure execution serieuse : `Td-NFTcu6jo` 103 046 v / 284 000 ab, r0,36 | **priorite** |
| La boucle de celui qui n'a jamais eu de relation | `B-IK-N9dE9w` 220 417 v / 4 100 ab, r53,76. Corrobore par `uVpxg6qPYcg` 109 362 / 37 400, r2,92 | **0 hit** sur « jamais eu de relation / copine / copain / jamais ete en couple / jamais ete amoureux » | **priorite** |
| Nommer les schemas au lieu de les corriger | `CsaUp1M089c` 48 164 v / 7 710 ab, r6,25 | 12 hits, tous captes par la psychogenealogie et l'hypnose, aucun au-dessus du seuil | **priorite** |
| Pourquoi tu n'as pas vu les signes (retrospectif) | `ac7IZ8Np2Qc` 204 761 v / 10 800 ab, r18,96 | Le format « signes » performe mais uniquement en prospectif : `4RYg81rG9yM` 151 500 v / 11 800 ab, r12,84. 0 occurrence retrospective | **a tester** |
| Le pronostic terminal d'un profil | `VhYNreR8Rg0` 237 784 v / 44 200 ab, r5,38 ; `P83pOhq40uU` 363 952 / 44 200, r8,23 ; `w7crWK69JqU` 146 973 / 44 200, r3,33 | Le lexique de l'attachement est sature (52 hits) mais toujours descriptif, jamais pronostique, et ecrase par les gros denominateurs : `jkCJQgfapWw` 137 475 v / 305 000 ab, r0,45 | **a prendre** |
| L'effondrement financier des applis | `xDcKMjDOeuc` 279 970 v / 119 000 ab, r2,35 ; `PhDTB9s1zPI` 144 698 / 69 700, r2,08. **Aucun ne franchit 3 de ratio, je le signale** | 0 occurrence. Le sujet applis existe en FR mais uniquement en denonciation : `JM5JcEo9x9I` r0,15, `uabhNv08Xss` 34 037 v / 100 000 ab, r0,34 | **a tester** |
| La question unique de screening dont la reponse est la reaction | `tWDcqt-Xj2w`, segment qui donne son titre a 2 891 936 vues | 0 occurrence. Terrain adjacent occupe : `UH27ZgPxWmY` 374 184 v / 98 400 ab, r3,80, mais il lit la reponse, pas la reaction | **a prendre** |
| Les faux criteres comme boucliers | `uVpxg6qPYcg` 109 362 v / 37 400 ab, **r2,92, sous le seuil, je ne l'arrondis pas** | 0 hit. Mais `12wMsc352eQ` occupe deja le terrain voisin en FR : 659 670 v / 87 600 ab, r7,53, **5,76 % de likes par vue, le meilleur indice de satisfaction verifie du corpus** | **a tester** |
| L'immersion documentee chiffree | `IRzbOFDvjaE` 323 440 v / 18 000 ab, r17,97 | Le format enquete existe et sous-performe : `D43kgNuRD2c` 46 430 v / 46 300 ab, r1,00 ; `X4DMk_1Oor8` 22 023 / 21 400, r1,03 | **a tester** |
| L'effet psychologique nomme applique a une scene amoureuse | `MMlCFNOuEtw` 48 249 v / 2 050 ab, r23,54, mais format compilation de 3 heures pour s'endormir | 3 hits, tous des artefacts de denominateur (`_pkSiUTYYP4` : 5 abonnes) | **a tester en dernier** |

### Detail des prioritaires

**1. Expliquer l'arret comme une conclusion rationnelle.** C'est le cas le plus propre du corpus. `hWVNyFJtrqY` fait 32 206 vues sur 2 390 abonnes, sans visage, sans invite, sans budget visible, et obtient 296 commentaires, soit 0,92 % par vue, le plus fort taux verifie ici. Il ne reste rien d'autre que le texte pour expliquer la performance. La mecanique est reelle et causale : maintenir l'espoir contre la deception repetee consomme une energie psychologique, et le cerveau cesse d'investir dans un systeme qui ne renvoie aucun retour interpretable. Une seule coupe a faire : la version anglaise reintroduit un filet d'espoir vers 80 % (avoir cesse d'esperer fait rater des signaux). Nous supprimons cette porte de sortie.

**2. L'ame soeur comme invention datee.** C'est le plus grand ecart mesurable du territoire, et il est mesurable dans les deux sens. La these fait 2 891 936 vues en anglais (`tWDcqt-Xj2w`) et zero occurrence en francais ; la these **inverse** fait 1 429 224 vues (`RqkhUt5GSzY`) et 358 312 vues (`pvl4_qAPgu8`) en francais. L'appetit du public francophone pour la question est demontre par deux videos massives ; personne ne lui a jamais oppose la refutation. Se poser en contre-champ d'une video qui cartonne, c'est capter sa demande sans partager son offre.

**3. La relation floue comme adaptation materielle.** Le pivot de `XPN_1RRCFsM` est explicite et verifie : le cadrage habituel est nomme puis rejete, et l'explication par l'attachement est elle-meme nuancee (« It's tempting to reduce everything to attachment styles, but that explanation only goes so far »). L'enonce le plus fort est celui de la perte impossible a justifier : pas d'etiquette, pas de raison, aucune facon socialement acceptee d'en faire le deuil. Personne n'a formule cela en francais. Adaptation obligatoire : remplacer le US Census Bureau et le Surgeon General par l'INSEE et l'INED.

**4. Le protocole chiffre sur les applications.** C'est le seul format qui repond a POURQUOI sans demander de croire quiconque. Le Desabuse refuse l'opinion d'un coach ; il ne peut pas refuser un denombrement. Et le resultat le disculpe mecaniquement : si 500 swipes donnent zero match, le probleme n'est pas lui.

**5. Compatibilite.** Le cas decisif est un echec francais : `Wce3mjFVj8Q`, « Comment faire la différence entre attirance intense et vraie compatibilité ? », 34 vues sur 29 700 abonnes. Le titre existe deja mot pour mot en francais et n'a jamais trouve son public, parce qu'il **pose une question au lieu de corriger une erreur**. Le contre-test anglophone est encore plus net : meme chaine, meme duree, meme voix, `KbU0Kjoovfk` (cadrage « tu emploies ce mot a l'envers ») fait 656 732 vues et `NLHnAb1Jabg` (cadrage « voici la checklist ») fait 92 401 vues.

**6. La boucle de celui qui n'a jamais eu de relation.** Zero hit dans 479 fichiers francais, sur le coeur exact de l'avatar. Le seul concurrent identifie sur le sujet, `2_MPs0BA5ww`, a fait 66 vues sur 11 800 abonnes.

**Honnetete sur ces absences.** Une partie d'entre elles est peut-etre un defaut de recherche et non un vide de marche. Le corpus a ete constitue en une journee avec 195 requetes, majoritairement centrees sur « pourquoi mes relations ne durent pas », « compatibilite », « applications de rencontre », « styles d'attachement ». Le zero absolu sur « situationship » est solide (le mot est peu implante en francais) ; le zero sur « jamais eu de relation » est plus fragile, parce que trois requetes seulement visaient cette zone. Avant d'engager une serie sur un ecart, il faut refaire une passe de veille ciblee sur les synonymes francais du concept.

---

## Les dix concepts a prendre, classes

Classement par rapport preuve sur risque, du plus sur au plus incertain.

**1. Psychologie de ceux qui ont arrete de chercher.**
Titre propose : *Arrêter d'y croire : personne ne décide ça*. Hub H1.
Preuve : `hWVNyFJtrqY`, 32 206 v / 2 390 ab, r13,48, 0,92 % de commentaires.
Sans visage : natif. La preuve anglaise est deja une voix off sur illustration, 8 min 47, aucun tournage, aucune source a verifier.
Risque : le miroir est tres proche ; si le ton glisse vers l'apitoiement, la retention s'effondre au milieu. Tenir le registre clinique, bannir toute phrase en « tu es », compenser par une precision descriptive tres fine (les cinq micro-scenes du fade).

**2. La bonne personne n'existe pas, et l'ame soeur est une invention recente.**
Titre propose : *L'âme sœur est une invention du XIXe siècle*. Hub H1, prolongement H2.
Preuve : `tWDcqt-Xj2w`, 2 891 936 v / 269 000 ab, r10,75 ; these inverse a 1 429 224 v en francais (`RqkhUt5GSzY`).
Sans visage : l'absence de visage est ici un **avantage**. La preuve anglaise tient sur 23 minutes de talking head et sur le charisme de l'orateur, ce qui est irreproductible et inutile a reproduire : la these est historique, donc elle s'illustre (gravures, affiches de comedies romantiques, courbe INSEE de l'age au premier mariage).
Risque : sans visage et sans diplome affiche, une these historique doit etre sourcee de facon irreprochable ou elle passe pour une opinion. Chaque date a l'ecran avec sa source. Et le public francais aime l'ame soeur : le ton doit rester constatif, jamais condescendant.

**3. Les relations floues : personne n'est devenu lache.**
Titre propose : *Relations floues : personne n'est devenu lâche*. Hub H2, pont vers H3.
Preuve : `XPN_1RRCFsM`, 84 264 v / 13 000 ab, r6,48, 405 s.
Sans visage : natif, c'est un essai avec sources affichees. La version anglaise ouvre sur trois clips de createurs ; sans visage, on remplace par trois commentaires ou fils de discussion affiches et lus en voix off, meme effet de choralite pour zero tournage.
Risque : le mot est peu implante en francais et peut couter du clic ; prevoir une formulation francaise dans les trois premiers mots. Et l'explication structurelle peut s'entendre comme une deresponsabilisation si le ton devient militant. Rester descriptif.

**4. Le cout reel des applications, mesure.**
Titre propose : *3000 swipes sur 8 applis : le coût réel*. Hub H3.
Preuve : `_fhF7jclE60`, 170 902 v / 8 580 ab, r19,92.
Sans visage : c'est le format le plus naturel en voix off. Captures d'ecran, compteur a l'image, tableau final anime, aucun visage necessaire une seule seconde.
Risque : si une appli sort bien du test, la video bascule en recommandation produit et la voix est perdue en une phrase. Verrouiller en amont : la metrique publiee est **un cout** (swipes par conversation reelle, heures par rendez-vous obtenu), jamais un classement. Second risque : creer les comptes de test prend du temps reel et certaines applis facturent.

**5. Compatibilite, le mot employe a l'envers.**
Titre propose : *Compatibilité : le mot que tu emploies à l'envers*. Hub H2, lecture H1.
Preuve : `KbU0Kjoovfk`, 656 732 v / 90 900 ab, r7,22, contre-test interne a 1,02.
Sans visage : la version anglaise est deja une voix off sur habillage typographique. Les paires d'exemples se montent en split-screen typographique, ce qui donne un evenement visuel toutes les trois secondes sans effort.
Risque : basculer en checklist de selection, ce qui est du conseil et sort de l'avatar. Rester au passe. Et concurrence SEO frontale avec l'astrologie sur la requete « compatibilite amoureuse » (48 hits FR, majoritairement astro) : la formulation ne doit pas pouvoir etre confondue avec un test astro.

**6. Jamais tombe amoureux : la boucle qui se referme.**
Titre propose : *Jamais tombé amoureux : la boucle qui se referme*. Hub H1.
Preuve : `B-IK-N9dE9w`, 220 417 v / 4 100 ab, r53,76 ; `uVpxg6qPYcg`, 109 362 / 37 400, r2,92 (deja en voix off, il donne le gabarit de montage).
Sans visage : la preuve la plus forte est un vlog face camera, donc inutilisable telle quelle, et c'est justement ce qui rend l'ecart exploitable : la contrainte force a extraire la **boucle** du temoignage et a l'enoncer a la deuxieme personne, ce qui l'universalise. Quatre crans, quatre chapitres, un schema anime en fin de video.
Risque : sujet honteux. Mal ecrit, il expose le spectateur et le fait fermer. Ne jamais decrire une personne, toujours un mecanisme. Le titre et la miniature doivent pouvoir etre vus sur un ecran de metro sans humilier celui qui regarde : proscrire toute formulation en « tu n'as jamais ».

**7. Le schema que tu repetes a un nom.**
Titre propose : *Le schéma que tu répètes a un nom*. Hub H1.
Preuve : `CsaUp1M089c`, 48 164 v / 7 710 ab, r6,25 ; format corrobore par `B4TsytUH3rA`, 572 204 / 49 600, r11,54.
Sans visage : format natif. Chaque pattern devient un chapitre avec une carte-titre plein cadre, la phrase-alibi entre guillemets, une scene B-roll de vingt secondes. C'est aussi le meilleur reservoir a shorts du hub : cinq patterns, cinq shorts de 45 a 60 s, chacun autonome.
Risque : la taxonomie glisse vite vers le diagnostic humiliant. Ecrire chaque pattern comme une strategie de protection intelligente qui a cesse de payer. Et couper la moitie prescriptive : la version anglaise bascule a 55 % en mode d'emploi, ce qui detruirait la credibilite.

**8. Les signes : pourquoi tu ne les as pas vus.**
Titre propose : *Les signes : pourquoi tu ne les as pas vus*. Hub H1.
Preuve : `ac7IZ8Np2Qc`, 204 761 v / 10 800 ab, r18,96. Ce qui performe n'est pas la liste, c'est la premisse d'ouverture : « When you're deeply involved with someone, your judgment gets clouded. You start making excuses for behavior you'd never accept from anyone else. » Demande FR prouvee par `4RYg81rG9yM` (151 500 v, r12,84, 943 commentaires).
Sans visage : oui, mais l'adaptation est une operation chirurgicale et non une traduction. La preuve anglaise est de la manosphere avec une cible designee et un imperatif. On garde le mecanisme d'aveuglement, on jette la liste, la cible et le genre.
Risque : un titre contenant « signes » attire l'audience qui cherche de l'espoir, qui clique puis part a la minute deux, ce qui abime le signal. Le titre doit annoncer explicitement le passe et l'absence de remede.

**9. Le pronostic terminal : avec qui finit vraiment quelqu'un qui fuit.**
Titre propose : *Avec qui finit vraiment quelqu'un qui fuit*. Hub H2.
Preuve : trois videos, une chaine, toutes au-dessus du seuil : `P83pOhq40uU` 363 952 v / 44 200 ab r8,23, `VhYNreR8Rg0` 237 784 / 44 200 r5,38, `w7crWK69JqU` 146 973 / 44 200 r3,33.
Sans visage : la chaine source est deja entierement faceless, voix off plus habillage. Transposition directe.
Risque : le plus eleve des dix. Le terrain francais de l'attachement est occupe (52 hits) et le vocabulaire est use ; il faut decrire le mecanisme sans l'etiqueter. Surtout, retirer toute promesse implicite de retour de l'autre, qui est de l'espoir deguise. Et l'ecart de performance FR/EN peut venir d'une saturation du public francophone autant que d'une mauvaise execution : tester sur **une** video avant d'en faire une serie, et arbitrer sur la retention a la minute 3, pas sur les vues.

**10. L'effondrement financier des applications.**
Titre propose : *Ce que les chiffres des applis disent de toi*. Hub H3.
Preuve : `xDcKMjDOeuc` 279 970 v / 119 000 ab r2,35 (« Five years later, that $13 billion is now worth $335 million ») et `PhDTB9s1zPI` 144 698 / 69 700 r2,08 (« the stock shot up over 76% and the company was suddenly worth $14 billion »). **Aucun des deux ne franchit un ratio de 3, je le dis franchement : c'est le maillon le plus faible des dix.**
Sans visage : natif, c'est du graphique et de la voix off.
Risque : le sujet est financier et l'avatar est sentimental ; le pont entre les deux doit etre fait explicitement dans les trente premieres secondes, sinon la video attire des investisseurs et pas des celibataires. Et le sourcage comptable prend du temps reel.

**Reserves, a garder au chaud.** La question de screening dont la valeur est dans la reaction (`tWDcqt-Xj2w`, segment titre de 2 891 936 vues, mais collision avec `UH27ZgPxWmY` a 374 184 vues) ; les faux criteres comme boucliers (`uVpxg6qPYcg`, r2,92 sous le seuil, et `12wMsc352eQ` occupe deja le terrain voisin en francais avec 659 670 vues) ; l'immersion documentee (`IRzbOFDvjaE`, r17,97, mais 100 minutes et la moitie du dispositif en entretiens filmes).

---

## Ce qu'on ne prend pas, et pourquoi

**Le format « selon Jung, Machiavel, les stoiciens ».** Il marche, il est faceless, il est a notre portee technique, et il est **sature**. Au moins huit chaines francaises l'occupent : `UH27ZgPxWmY` (374 184 v / 98 400 ab, r3,80), `4RYg81rG9yM` (151 500 / 11 800, r12,84), `z2wM0cEDDRE` (250 055 / 23 700, r10,55), `WtjuuYT-m9I` (149 293 / 56 700, r2,63), `kxutgpcZyxI` (90 214 / 36 700, r2,46), `_ZI6V_tLI4M` (73 998 / 51 300, r1,44), plus l'anglophone `05ch81PuyfA` (1 077 724 / 211 000, r5,11). Le cout de differenciation depasse le gain, et la promesse « Jung avait tout compris » contredit frontalement un avatar qui ne veut ni maximes ni mystique. **On garde la lecon d'execution** (voix off plus habillage sobre plus titre a promesse forte suffisent a faire 150 000 a 375 000 vues sur 12 000 a 98 000 abonnes) et on jette le beguin philosophique.

**L'autorite empruntee a un mort ou a un absent.** C'est le procede des deux meilleurs ratios faceless francais du corpus, `fkDZtdiy8jE` (r40,16) et `Epm62VSAWBM` (r28,76) : le nom de Cyrulnik dans le titre, une voix off qui recite un texte qu'il n'a jamais prononce, et une description qui dit « inspiré par ». C'est efficace et c'est hors de nos regles : on ne signe pas un texte du nom de quelqu'un d'autre. On prend leur **structure** (croyance rassurante attaquee, « pas fausse, incomplète », chaine de causes, absolution) et on refuse leur **procede**.

**Le chiffre invente et le faux titre professionnel.** `4RYg81rG9yM` ouvre sur « 87 % des hommes véritablement amoureux ne l'admettent jamais » et sur « je suis Alex, psychiatre depuis 20 ans ». Les deux sont invérifiables. La chaine tient sur la rigueur : chaque chiffre cite doit venir d'une source affichable a l'ecran.

**Le quiz visuel a score.** `rI-rDHsZSbs` fait 868 785 vues sur 22 800 abonnes (ratio 38,10) et `7ITMWdMy6Hc` 743 169 sur la meme base (ratio 32,60). Ce sont les deux plus hauts ratios exploitables du territoire anglophone, et il faut les refuser. Le moteur est la participation plus un resultat flatteur, et les trois issues sont toutes valorisantes. Le risque n'est pas l'echec, **c'est le succes sur le mauvais public** : une audience de divertissement qui ne reviendra pas pour un essai de 14 minutes, et un positionnement brouille des la troisieme video.

**Le debat de plateau.** `lMs3IIAYvDQ` tient 64,3 minutes sur 462 445 vues et 34 000 abonnes (ratio 13,60) par l'irritation : le spectateur choisit un camp en trente secondes et ne peut plus partir sur une phrase qu'il desapprouve. Le mecanisme est excellent et impossible sans plateau. On garde la technique transposable : exposer l'argument adverse dans sa version la plus forte avant de le trancher.

**Le tribunal public et le micro-trottoir.** `tkAOBvPL5jY` (968 027 v / 4 280 ab, ratio 226,17) et `f4TUAOfEIew` (842 191 / 38 900, r21,65) reposent sur des personnes reelles filmees et sur un public en salle qui joue le choeur. Rien de tout cela ne se transpose. On garde une seule brique : la question posee brute, sans mise en contexte, choisie pour etre indefendable.

**L'espoir date et la prophetie.** `I5xLd9O0LnU` (204 556 v / 13 400 ab, r15,27) vend « ton temps viendra » et obtient l'engagement le plus faible mesure ici : 0,14 % de commentaires et 2,49 % de likes par vue, sur 34,6 minutes. C'est l'exact contraire de l'avatar, et c'est le meilleur **adversaire** disponible pour un episode H1 sur les promesses d'ame soeur qui retardent la comprehension.

**La reconquete et la manipulation.** `z2wM0cEDDRE` promet « elle te suppliera de revenir » (250 055 v / 23 700 ab, r10,55). Le sujet est parmi les plus recherches en francais, et la promesse trahit exactement l'avatar. On garde le pivot de reformulation de question, retourne : la question n'est pas comment la recuperer, la question est pourquoi ca s'est joue avant elle.

**Le mepris pour ceux qui ont arrete.** `ZOFsWTwN_TE` (51 364 v / 4 190 ab, r12,26) ouvre parfaitement puis traite de « loser mentality » ceux qui ont abandonne. Le Desabuse **est** celui qui a arrete. Une video qui l'insulte a la minute 10 perd tout ce qu'elle avait gagne a la minute 1.

**Le vecu invente.** Plusieurs mecanismes performants reposent sur un cout paye par le narrateur (`_fhF7jclE60`, 500 swipes ; `IRzbOFDvjaE`, 100 heures ; `B-IK-N9dE9w`, 25 ans de celibat). Ces mecanismes ne sont utilisables que si le cout a reellement ete paye. Une voix off qui dit « j'ai teste » sans avoir teste est un mensonge verifiable, et c'est le genre de mensonge que ce public detecte.

**La flatterie sans explication.** `B4TsytUH3rA` (572 204 v, r11,54) livre sept traits qui sont tous des compliments deguises en diagnostics. Le gabarit de production est exactement le notre (6 minutes, voix off, items numerotes, zero image de soi) et il faut le prendre ; mais chaque item doit livrer une cause verifiable, sinon on a copie la coquille et jete la seule chose qui interesse l'avatar. Regle d'ecriture : ne jamais dire « tu es fort », dire « voilà le prix que tu as payé pour ne pas être déçu ».

---

## Ce que cette analyse ne dit pas

**Elle ne mesure ni la retention ni le taux de clic.** Aucun champ du corpus ne contient de watch time, de duree moyenne de visionnage ni de CTR. Toutes les affirmations sur « ce qui retient » sont des inferences de structure, pas des mesures. La seule approximation d'engagement disponible est le taux de commentaires et de likes par vue, et il est bruite : `4RYg81rG9yM` obtient 0,62 % de commentaires en partie par sollicitation directe deux fois dans le script, `z2wM0cEDDRE` (0,32 %) par une promesse de reponse personnelle et un objectif de likes chiffre. Une partie du signal d'engagement est de l'ingenierie, pas de la fascination.

**Le ratio vues sur abonnes est un instrument grossier.** Le nombre d'abonnes est celui du jour du scrape, pas celui du jour de la publication. Une video de 340 jours sur une chaine qui a triple depuis voit son ratio ecrase (`I5xLd9O0LnU`, 340 jours) ; une video de 68 jours voit le sien flatte (`WJaBSoYbvrY`). Les comparaisons entre videos d'ages tres differents sont a prendre avec prudence.

**L'echantillon des mecanismes est petit.** 437 fichiers franchissent le seuil de credibilite, 72 ont ete autopsies. Les mecanismes sont donc typologises sur environ 16 % du corpus eligible, et les frequences annoncees dans la section 2 sont des frequences **dans les autopsies**, pas dans le corpus.

**Les absences francaises sont des absences dans ce corpus, pas dans YouTube France.** Le corpus a ete constitue en une seule journee, avec 195 requetes, dont la majorite tournent autour de quatre familles : la duree des relations, la compatibilite, les applications, les styles d'attachement. Un concept absent de nos 479 fichiers francais peut simplement n'avoir jamais ete cherche. Le zero sur « situationship » est solide parce que le mot lui-meme est peu implante ; le zero sur « jamais eu de relation » l'est moins. **Avant d'engager une serie sur un ecart, refaire une passe de veille ciblee sur les synonymes francais du concept.**

**Le corpus est biaise par sa methode de collecte.** Les requetes etaient en francais et en anglais uniquement, ce qui explique la presence de 27 fichiers en hindi et 27 en arabe sans qu'aucun n'ait ete cherche : ce sont des recommandations laterales d'Apify. Cela signifie aussi que le corpus contient ce que YouTube **recommande** autour de ces requetes, pas ce qui existe.

**Le seuil de credibilite est arbitraire.** 20 000 vues et 1 000 abonnes ecartent des signaux reels. `hWVNyFJtrqY`, la meilleure preuve du concept prioritaire numero 1, ne franchit le seuil de vues que de 12 206 unites et n'a que 2 390 abonnes ; il n'a survecu que parce que trois autres videos de la meme famille de format le corroborent. A l'inverse, `uVpxg6qPYcg` est retenu comme corroboration alors qu'il est a 2,92 de ratio, donc en dessous du seuil de 3 utilise dans le releve des concepts. Ces deux cas sont signales dans le texte plutot qu'arrondis.

**Rien ici ne prouve qu'un mecanisme transposable fonctionnera sur une chaine neuve.** Toutes les preuves sont des chaines qui avaient deja entre 2 390 et 269 000 abonnes. La plus petite base credible du corpus est de 2 390 abonnes (`hWVNyFJtrqY`) et de 2 600 (`XDlAQfoCKjg`, 56 472 vues, r21,72). Le corpus ne contient **aucune** preuve de ce que fait une video a zero abonne.
