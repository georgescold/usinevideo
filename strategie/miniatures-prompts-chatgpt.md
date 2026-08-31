# Prompts de miniatures, prêts à coller dans ChatGPT

> **À quoi sert ce fichier.** Chaque bloc ci-dessous se colle tel quel dans ChatGPT pour générer
> une miniature. Chaque prompt est **autonome** : il contient le style complet et la scène, donc
> il fonctionne dans une conversation neuve comme au milieu d'une longue discussion, sans
> dépendre de ce qui a été dit avant.
>
> **Pourquoi ces prompts sont en prose et en français.** ChatGPT génère mieux à partir de phrases
> descriptives que d'une liste de mots-clés séparés par des virgules. C'est l'inverse de FLUX, qui
> préfère l'empilement de mots-clés. Le fichier `miniatures.json` conserve les deux versions :
> la prose ici, la version mots-clés dans `notre_adaptation.prompt_image` si tu repasses un jour
> par une API.
>
> **La règle qui casse le plus de miniatures : ChatGPT adore ajouter du texte.** Chaque prompt se
> termine donc par une interdiction explicite et répétée. Si une image revient avec du texte
> dedans, relance en disant simplement « refais sans aucun texte, aucune lettre, aucun mot ».
>
> **Le texte de la miniature ne se génère jamais.** Il se compose par-dessus, en Anton, dans un
> éditeur. Le français accentué est systématiquement massacré par les générateurs, et notre texte
> en contient partout.
>
> Analyse complète, référence virale et candidats écartés : `miniatures.json`.

---

## Le format de sortie à demander

Demande **1280 x 720, format 16:9**. Si ChatGPT te sort du carré, précise « format paysage 16:9,
1280 par 720 pixels » et relance.

---

## 1. Pourquoi ça s'arrête toujours au bout de 3 mois

**Texte à composer par-dessus (ne pas le générer) :** `PERSONNE N'A RIEN DIT`
**Référence virale :** When a Dismissive Avoidant and You Both Stop Contacting Each Other — This Is What Happens Next · ratio 8.23 · `veille/youtube/miniatures/P83pOhq40uU.jpg`
**Occlusion à réaliser dans l'éditeur :** Le texte court en une ligne dans le tiers superieur. L'abat-jour conique de la suspension descend depuis le coin superieur gauche et mange les deux premieres lettres de PERSONNE : le P et le E passent derriere le metal, le reste du mot ressort devant l'ombre. Le mot reste reconnaissable a 120 px, mais l'oeil enregistre que le texte est DANS la piece, pas pose dessus.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Une piece sombre, tard. Deux mannequins d'atelier articules en ambre mat sont assis aux deux extremites d'un meme banc de bois use, un large vide entre eux. Aucun visage, aucun trait : juste deux tetes lisses et les rotules visibles aux epaules, aux coudes, aux genoux. Chacun est legerement tourne vers l'exterieur, buste voute, un telephone dans la main, dont l'ecran projette une lueur bleue froide sur le torse ambre — les deux seules taches froides de l'image. Entre eux, sur le banc, une tasse en ceramique oubliee, froide. Une suspension industrielle a abat-jour conique descend dans le coin superieur gauche du cadre, ampoule tungstene allumee : sa flaque de lumiere chaude tombe sur le banc vide, au centre, et meurt avant d'atteindre l'un ou l'autre. Le tiers superieur est une zone d'ombre profonde, vide, reservee au texte.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 2. Prix applis de rencontre : où le mur payant tombe

**Texte à composer par-dessus (ne pas le générer) :** `ET TES ANNÉES`
**Référence virale :** I Tested Every Dating App — Only These Gave Matches · ratio 19.92 · `veille/youtube/miniatures/_fhF7jclE60.jpg`
**Occlusion à réaliser dans l'éditeur :** Le mot ANNÉES passe partiellement derriere la bande de ticket de caisse qui monte en arc dans le tiers superieur droit. Le papier coupe le haut des dernieres lettres, ce qui pousse le texte dans la profondeur de la scene au lieu de le laisser colle en surface.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Un mannequin d'atelier articule en ambre mat, sans aucun trait de visage, est assis a meme le sol d'une piece sombre et vide, avachi vers l'avant, coudes sur les genoux, epaules effondrees. Il tient a deux mains un petit ecran rectangulaire qui l'eclaire par en dessous. De cet ecran s'echappe un tres long ticket de caisse en papier : la bande monte d'abord en arc dans le tiers superieur droit du cadre, puis retombe et s'enroule en boucles froissees autour de ses chevilles et de ses pieds, s'accumulant sur le sol. Autour de lui, dans l'obscurite, une couronne de petits rectangles lumineux flotte, flous et en retrait, qui le cerne sans lui voler l'attention. C'est l'encerclement de la reference, transpose : les applis ne sont plus des logos, elles sont la facture qu'elles ont emise, et le mannequin est assis dedans.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 3. On s'aimait, ça n'a pas suffi : pourquoi

**Texte à composer par-dessus (ne pas le générer) :** `AUCUN COUPABLE`
**Référence virale :** We Still Love Each Other – Just Not the Same Way | Same Hearts, Different Roads · ratio 27.75 · `veille/youtube/miniatures/r85Yxzn_FpE.jpg`
**Occlusion à réaliser dans l'éditeur :** Le mot AUCUN pose sa base sur la poutre : le bas des lettres A-U-C passe DERRIERE le bord inferieur de la poutre sombre qui traverse le haut du cadre. A droite, la derniere syllabe de COUPABLE (les lettres B-L-E) glisse DERRIERE la tete lisse du mannequin reste de dos, qui monte juste assez haut pour manger le pied des lettres. Le mot reste integralement lisible — on ne masque jamais plus de 25 % de la hauteur des caracteres — mais il n'est plus a plat sur l'image : il est pris dans la piece, et l'oeil met une fraction de seconde de plus a le decoller du decor.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Un interieur photorealiste sombre et abandonne, fond brun profond. Deux mannequins d'atelier articules en ambre mat, sans aucun trait de visage, se tiennent dos a dos exactement a l'endroit ou un vieux parquet use se separe en deux couloirs qui s'eloignent. Derriere eux, une flaque de lumiere doree tombant d'une fenetre hors cadre eclaire un banc de bois a deux places, vide, en leger flou : c'est le passe commun, chaud. Devant chacun, un couloir etroit s'enfonce dans une penombre froide et morte : ce sont les deux avenirs. L'un des deux mannequins a tourne sa tete lisse par-dessus son epaule vers l'autre, qui n'a pas tourne la sienne. Leurs mains pendent presque cote a cote, separees par quelques centimetres de vide que la lumiere chaude souligne : le seul detail net de l'image, et le vrai sujet. Une lourde poutre de bois sombre barre le haut du cadre. Le tiers superieur reste vide et tres sombre pour recevoir AUCUN COUPABLE en Anton blanc creme.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 4. Pourquoi tes relations ne durent jamais (ce n'est pas toi)

**Texte à composer par-dessus (ne pas le générer) :** `ON T'A RIEN APPRIS`
**Référence virale :** Tu fais peur aux gens sans le savoir..... voilà POURQUOI 👀 · ratio 31.51 · `veille/youtube/miniatures/Hcp5nXMsmUM.jpg`
**Occlusion à réaliser dans l'éditeur :** Le montant de porte en bois sombre place au premier plan sur le bord gauche passe DEVANT le debut de la premiere ligne : la lettre O de ON est a moitie avalee par le bois, seule sa moitie droite emerge. La seconde ligne, APPRIS, est decalee vers la droite et se lit entierement nette. Le regard doit reconstruire le O, ce qui coute une fraction de seconde — la meme fraction de seconde que la tete du personnage vole au mot POURQUOI dans la reference. Bonus : le montant etant l element le plus proche de l objectif et le texte etant derriere lui mais devant le couloir, on obtient trois plans de profondeur nets, ce qui empeche la miniature de ressembler a une image plate avec un calque de texte colle dessus.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Un couloir sombre en enfilade, taille dans un brun profond presque noir. Une serie de chambranles de portes en bois massif, tous identiques, se repetent en fuyant vers le fond ou brule une unique lumiere chaude. Trois mannequins d atelier articules en ambre mat, strictement identiques, se tiennent chacun devant une porte successive, tous vus de dos, tous exactement dans la meme posture : un bras leve, la main tendue vers la poignee. Ce n est pas trois personnes, c est la meme, trois fois — le motif qui se repete, rendu visible d un seul coup d oeil. Le plus proche est grand, net, ourle de lumiere ; les deux autres decroissent, s assombrissent et se brouillent derriere lui comme des echos. Au tout premier plan a gauche, le montant vertical du chambranle le plus proche barre le bord du cadre, tres sombre, tres proche de l objectif. Le tiers superieur du cadre est un mur nu dans l ombre, entierement vide, reserve au texte. Le texte blanc creme se pose la, en deux lignes decalees : ON T'A RIEN demarre derriere le montant de bois qui lui mange le O, APPRIS est en retrait et se lit net. Aucun visage nulle part, aucune anatomie, juste des articulations a rotule et de l ambre mat dans le noir.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 5. Attirance ou compatibilité : la confusion qui coûte cher

**Texte à composer par-dessus (ne pas le générer) :** `ÇA NE TIENDRA PAS`
**Référence virale :** La science révèle le secret de l'Amour · ratio 7.53 · `veille/youtube/miniatures/12wMsc352eQ.jpg`
**Occlusion à réaliser dans l'éditeur :** Texte compose sur une seule ligne bord a bord dans le tiers superieur, en Anton capitales blanc creme #F5EFE8 avec contour net. La tete lisse et l'epaule du mannequin de gauche remontent devant le bas des lettres de TIENDRA : les jambages du I, du E et du N sont manges par le crane ambre, exactement comme la tete de l'homme traverse le A et le S de HASARD dans la reference. En complement, un ou deux points de bokeh chaud sont recomposes par-dessus le Ç de ÇA pour que le mot soit pris dans l'image et non pose dessus. Ordre des couches : fond, texte, tete du mannequin de gauche, grain.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Deux mannequins d'atelier articules en ambre mat, tetes lisses et totalement sans traits, articulations a boules visibles au cou, aux epaules, aux coudes et aux hanches, assis de profil face a face dans les deux tiers inferieurs du cadre. Ils sont penches l'un vers l'autre jusqu'a ce que leurs fronts vierges se frolent, mains jointes au centre : la posture de l'attirance maximale, le moment ou ca semble evident. Mais chacun est assis sur son propre bloc de pierre brute, et entre les deux blocs, juste sous leurs mains jointes, s'ouvre une fente d'ombre noire : les corps se rejoignent, les socles non. Derriere eux, obscurite brune profonde piquee de points de lumiere chaude completement flous. Le tiers superieur est laisse vide pour le texte, et seule la tete du mannequin de gauche y remonte.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 6. Rencontrer quelqu'un sans passer par les applis

**Texte à composer par-dessus (ne pas le générer) :** `ME MONTRER M'ÉPUISE`
**Référence virale :** I Tested Every Dating App — Only These Gave Matches · ratio 19.92 · `veille/youtube/miniatures/_fhF7jclE60.jpg`
**Occlusion à réaliser dans l'éditeur :** Le mot M'ÉPUISE, en bout de deuxieme ligne a droite, glisse partiellement derriere le bord gauche du grand panneau vertical lumineux qui monte dans le tiers superieur. Environ un tiers du mot passe derriere le panneau : assez pour creer la profondeur, pas assez pour gener la lecture. Repli si le panneau ne remonte pas assez haut a la generation : faire passer la fin de ME MONTRER derriere le coin superieur de l ecran flottant le plus haut de la grappe de gauche.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Une piece sombre, plancher de bois poussiereux. Au centre, un petit mannequin d atelier articule en ambre mat, sans aucun trait de visage, debout sur un socle rond bas de presentoir de vitrine, faiblement eclaire par en dessous. Il est tasse : epaules affaissees, tete legerement inclinee vers le bas, bras refermes sur son propre torse. Autour de lui, serres comme une nuee, une douzaine de panneaux de verre et d ecrans rectangulaires flottants, inclines chacun a un angle different, tous parfaitement vides et emettant une lumiere bleu-blanc froide, tous orientes vers lui, comme autant de vitrines qui l examinent. Le halo froid des panneaux ourle son corps ambre pendant qu une unique lumiere chaude directionnelle tombe de la gauche. A droite, un panneau vertical plus haut que les autres monte dans le tiers superieur du cadre. Tout le reste du tiers superieur est du brun profond vide, reserve au texte.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 7. Compatibilité amoureuse : comment ça se mesure

**Texte à composer par-dessus (ne pas le générer) :** `PAS AU FEELING`
**Référence virale :** La science révèle le secret de l'Amour · ratio 7.53 · `veille/youtube/miniatures/12wMsc352eQ.jpg`
**Occlusion à réaliser dans l'éditeur :** Le mot FEELING passe derriere la tete et l epaule du mannequin de droite, qui montent dans la bande de texte : le crane lisse mange le bas du F et du premier E, l epaule effleure le G. A gauche, le haut du crane du second mannequin vient juste toucher la base du P de PAS. Le fleau en laiton de la balance monte lui aussi legerement et coupe la barre du A de AU. Trois points de contact seulement, tous par le bas des lettres : le mot reste entierement dechiffrable a 120 px, mais l oeil percoit que le texte est dans la piece et pas colle dessus.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Interieur sombre et chaud, un restaurant de quartier le soir, apres le service. Deux mannequins d atelier articules en ambre mat sont assis face a face en profil, penches l un vers l autre au-dessus d une petite table ronde. Leurs mains posees sur la nappe se cherchent sans se toucher, a quelques centimetres l une de l autre : c est le centre exact de l image et l unique point d attention. Entre leurs deux mains, posee sur la table, une balance de comptoir ancienne en laiton a deux plateaux, un plateau plus bas que l autre. Derriere eux, tres flou, une enfilade de lampes chaudes en bokeh ambre le long d un mur brun profond. La lumiere vient de la gauche en rasant : elle allume l arete des epaules, des avant-bras et du haut du crane des deux pantins et laisse tout le reste dans l ombre. Le tiers superieur est un aplat de brun tres sombre, presque vide. Le texte PAS AU FEELING y court sur toute la largeur, en Anton capitales blanc creme.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 8. Points communs en couple : ça ne décide rien

**Texte à composer par-dessus (ne pas le générer) :** `ALORS QUOI ?`
**Référence virale :** La science révèle le secret de l'Amour · ratio 7.53 · `veille/youtube/miniatures/12wMsc352eQ.jpg`
**Occlusion à réaliser dans l'éditeur :** Le sommet du crane du mannequin de gauche passe devant le bas du O de ALORS ; le sommet du crane de droite passe devant le bas du U de QUOI. Le point d interrogation, isole a droite dans le noir, reste entierement libre — comme le ? de HASARD? dans la reference. Les mots sont donc DANS le salon, pas colles par-dessus.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Un salon sombre le soir. Deux mannequins d atelier articules en ambre mat, sans aucun trait de visage, articulations a rotule visibles aux epaules, coudes et hanches, sont assis cote a cote sur un canape anthracite. Ils sont dans une posture rigoureusement identique et symetrique : meme inclinaison de tete vers l ecran hors champ, jambes croisees du meme cote, et les deux plongent la main au meme instant dans un unique bol de popcorn pose entre eux. Entre leurs corps, un coussin de canape entierement vide : ils ne se touchent nulle part, sauf par le bol. La lumiere chaude d un televiseur hors champ, a gauche, les decoupe ; derriere, un lampadaire diffuse un bokeh ambre sur un mur brun profond. La symetrie est trop parfaite pour etre humaine — on dirait deux exemplaires du meme objet. Le tiers superieur est laisse dans le noir, vide, et le sommet des deux cranes vient juste mordre le bas de cette bande.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 9. Applis de rencontre : 500 swipes chacune, le compte

**Texte à composer par-dessus (ne pas le générer) :** `MATCHS OBTENUS`
**Référence virale :** I Tested Every Dating App — Only These Gave Matches · ratio 19.92 · `veille/youtube/miniatures/_fhF7jclE60.jpg`
**Occlusion à réaliser dans l'éditeur :** Le mot MATCHS passe derriere l epaule du mannequin place au premier plan, qui en mange le pied des deux premieres lettres. OBTENUS reste entierement net a droite.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Une piece sombre, fond brun tres profond. Un mannequin d atelier articule en ambre mat, sans aucun trait de visage, se tient debout de dos au premier plan, legerement decale a gauche, epaules basses. Devant lui, occupant tout le mur du fond, une immense grille de petits rectangles lumineux froids, alignes en colonnes regulieres, des centaines, qui s etend au-dela du cadre : ce sont les profils envoyes, anonymes, sans aucun logo ni visage identifiable. A ses pieds, au sol, dans la flaque de lumiere chaude d une seule lampe hors champ, deux ou trois rectangles seulement, tombes, minuscules par comparaison. L ecart d echelle entre le mur et le sol est le sujet. Le tiers superieur reste dans l ombre, vide, reserve au texte.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## 10. Personnalité et ruptures : ce que ton profil révèle

**Texte à composer par-dessus (ne pas le générer) :** `TOUJOURS LA MÊME FIN`
**Référence virale :** Psychology of People Who Have Given Up On Dating · ratio 13.48 · `veille/youtube/miniatures/hWVNyFJtrqY.jpg`
**Occlusion à réaliser dans l'éditeur :** Le mot TOUJOURS, premier mot de la premiere ligne, passe partiellement DERRIERE le pieu d amarrage et sa corde enroulee qui montent dans le tiers superieur gauche. Le T et le O disparaissent derriere le bois, le reste du mot ressort de l autre cote. Le texte cesse d etre un calque pose dessus, il entre dans la scene et fabrique un plan de profondeur supplementaire.

```
Génère une image en format paysage 16:9, 1280 par 720 pixels.

STYLE, à respecter strictement :
Rendu 3D photoréaliste, éclairage cinématographique en clair-obscur. Les personnages sont
des mannequins d'atelier articulés, en ambre mat saturé, avec des articulations à rotule
visibles aux épaules, aux coudes, aux hanches et aux genoux. Leurs têtes sont lisses et
totalement dépourvues de traits : ni yeux, ni bouche, ni nez, aucune expression faciale.
L'émotion passe uniquement par la posture et l'orientation du corps.
Le décor, lui, est photoréaliste et texturé, en couleurs naturelles, dominante brun très
profond presque noire. Une seule source de lumière chaude, directionnelle. Un seul point
d'attention dans toute l'image.

SCÈNE :
Crepuscule, tout en brun profond. Au premier plan a droite, gros dans le cadre, un mannequin d atelier articule en ambre mat, sans aucun trait de visage, assis au bout d un ponton de bois use, jambes pendantes au-dessus d une eau noire et immobile, epaules basses, tete legerement inclinee vers le bas. Il ne regarde pas derriere lui. Plus loin sur l eau, en file diagonale qui s enfonce vers l horizon, TROIS petites barques de bois portent chacune deux mannequins ambre assis serres l un contre l autre, et s eloignent vers une lueur chaude tres basse ; chaque barque est plus petite et plus sombre que la precedente. Ce ne sont pas trois couples, c est le meme couple trois fois : le motif. A gauche, un haut pieu d amarrage en bois grisaille, corde enroulee, monte de l eau jusque dans le tiers superieur du cadre. Le tiers superieur reste un ciel brun profond vide, reserve au texte. Le bas droite reste en eau noire vide pour respirer.

CADRAGE :
Le tiers supérieur de l'image doit rester vide, sombre et sans détail : c'est l'emplacement
réservé au texte, qui sera ajouté plus tard dans un éditeur.

INTERDICTIONS ABSOLUES :
N'écris aucun texte, aucune lettre, aucun mot, aucun chiffre, aucun logo, aucun filigrane
nulle part dans l'image. Aucun visage humain réel, aucun trait de visage sur les mannequins.
Aucune couleur criarde. L'image doit rester lisible et identifiable une fois réduite à
120 pixels de large.
```

---

## Contrôle avant de garder une image

- Reduite a 120 px de large : le sujet est identifiable et le texte lisible ?
- Le texte de la miniature ne partage aucun mot avec le titre ?
- Ensemble, titre et miniature forment une phrase ou un dialogue ?
- Un seul point d attention ?
- Aucun logo, aucune marque, aucune interface reconnaissable ?
- Le texte est-il partiellement masque par un element de la scene ?
- Aucun visage reel, aucun trait de visage detaille sur les figures ?
- Poids sous 2 Mo, dimensions 1280x720 ?

## Si le rendu dérape

| Symptôme | Correction à demander |
|---|---|
| Du texte apparaît dans l'image | « refais sans aucun texte, aucune lettre, aucun mot » |
| Les mannequins ont un visage | « les têtes doivent être totalement lisses, sans yeux ni bouche ni nez » |
| L'image est carrée | « format paysage 16:9, 1280 par 720 pixels » |
| Le haut est chargé | « laisse le tiers supérieur vide, sombre et sans détail » |
| Ça ressemble à un dessin | « rendu 3D photoréaliste, éclairage cinématographique, décor texturé » |
| Trop clair, trop plat | « clair-obscur, une seule source de lumière chaude, fond brun très profond » |

## Un point à surveiller sur ce lot

Les miniatures 5, 7 et 8 mettent toutes en scène deux mannequins assis. Les mises en scène
divergent réellement, mais publiées à trois semaines d'intervalle elles peuvent se ressembler
dans une grille de chaîne. Si le rendu confirme la ressemblance, écarte-les davantage : change
le décor, le cadrage ou le nombre de personnages sur l'une des trois.
