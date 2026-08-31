---
name: identite-visuelle
description: Dérive la direction artistique d'une chaîne depuis son image de marque — palette, typographie, atmosphère, direction des plans. À lancer une fois par chaîne, avant la première vidéo.
---

# Donner une identité visuelle à une chaîne

Une chaîne se reconnaît **avant** d'être lue. Si sa vidéo n'a pas les couleurs de son avatar,
le spectateur qui la croise dans un fil ne fait pas le lien — et il ne le fera jamais
consciemment, c'est justement pour ça que ça compte.

Cette skill produit **l'identité visuelle complète d'une chaîne à partir d'une seule image** :
son avatar, sa photo de profil, ou n'importe quelle image que la personne désigne comme « c'est
ça, la chaîne ». Tout ce qui en sort atterrit dans `config/chaine.json`, que le montage lit
sans qu'une ligne de code change.

---

## Pourquoi partir de l'image, et pas d'un goût

Trois raisons, et la troisième est la plus importante.

1. **L'avatar est le seul élément visuel vu à coup sûr, partout.** Dans le fil, en commentaire,
   en suggestion, en notification. C'est lui le point fixe — la vidéo doit s'y accorder, pas
   l'inverse.
2. **Une palette constatée est reproductible.** Choisie « au goût » à chaque nouvelle chaîne,
   c'est la meilleure façon de refaire trois fois la même — ou de dériver sans s'en rendre
   compte.
3. **Ça rend le désaccord possible.** Une palette dérivée d'une image se discute : « l'accent
   vient du cœur rouge, il fait 4,1:1 sur le fond ». Une palette choisie au goût ne se discute
   pas, elle se subit.

---

## L'entretien, en trois questions

Avant de lancer l'outil, trois choses à obtenir — et rien de plus, on ne fait pas remplir un
formulaire.

1. **L'image.** « Envoie-moi l'image de marque de la chaîne : l'avatar, la photo de profil, ou
   l'image qui la représente le mieux. » Elle se range dans `marque/identite/avatar.<ext>`.
2. **Ce qu'elle promet.** « En un mot, cette image promet quoi au spectateur ? » — de la
   douceur, de la rigueur, de l'urgence, du réconfort. Ce mot arbitrera les cas limites de
   typographie.
3. **Ce qu'elle ne doit surtout pas être.** Plus utile que la question précédente : un interdit
   se vérifie, une intention non.

Si l'image n'existe pas encore, **on ne devine pas** : on le dit, et on la fait générer d'abord.
Une charte inventée sera à refaire au moment où l'avatar arrivera.

---

## Étape 1 — Dériver

```bash
node outils/da-depuis-image.mjs marque/identite/avatar.png
```

L'outil sort les couleurs relevées, les rôles attribués, les contrastes vérifiés et une famille
typographique. **On le lit avant d'appliquer.** Ajouter `--applique` écrit dans
`config/chaine.json`.

### Comment il attribue les rôles

Il ne prend pas les couleurs dominantes : sur une image de marque, le dominant est presque
toujours un fond neutre ou une peau, et une charte bâtie dessus est terne. Il classe par rôle :

| Rôle | Comment il est choisi |
|---|---|
| **fond** | la plus sombre, désaturée et assombrie jusqu'à porter du texte — mais sa **teinte** est conservée : c'est elle qui fait l'identité |
| **accent** | la plus **saturée**, même minoritaire. Un cœur rouge sur 2 % de l'image est l'accent, pas le ciel qui en occupe la moitié |
| **accent secondaire** | la plus éloignée en teinte de l'accent : c'est lui qui évite le monochrome |
| **texte** | quasi-blanc, réchauffé de deux points vers l'accent — un blanc pur sur une charte chaude fait tache |

**La teinte est constatée, la clarté est calculée.** Une image de marque n'a aucune raison de
contenir un fond assez sombre et un texte assez clair pour que l'un porte l'autre : on lui prend
ses teintes, on ajuste les luminosités.

### Les contrastes, et le seul cas où on passe outre

Quatre rapports sont vérifiés, sur les seuils WCAG AA :

- **texte sur fond ≥ 4,5** — non négociable, c'est 80 % du texte à l'écran ;
- **accent sur fond ≥ 3** — l'accent sert de texte secondaire ;
- **texte sur accent ≥ 4,5** — la pastille du sous-titre ;
- **second sur fond ≥ 3**.

L'accent porte deux contraintes qui tirent en sens inverse (clair pour être lisible sur le fond,
sombre pour porter du texte blanc). L'outil balaie la plage de clarté et retient le meilleur
compromis. **Si ça ne passe toujours pas, c'est que la teinte ne peut pas tenir les deux rôles** —
un rouge très saturé, typiquement. Deux issues, dans cet ordre :

1. donner au sous-titre un **texte foncé sur pastille d'accent** plutôt que blanc ;
2. réserver l'accent aux filets et aux aplats, et sortir la pastille en `accent secondaire`.

Ce qu'on ne fait pas : désaturer l'accent jusqu'à ce que le chiffre passe. On perdrait
l'identité pour gagner un test.

## Étape 2 — La typographie

L'outil propose une famille à partir de deux mesures objectives — la saturation moyenne et
l'étendue de clarté :

| Famille | Ce que dit l'image | Police d'affiche |
|---|---|---|
| **brutale** | palette sourde, contraste franc : elle affirme | ArchivoBlack |
| **sobre** | palette et contraste médians : elle explique | Anton |
| **chaleureuse** | palette saturée ou contraste doux : elle accueille | Fraunces |

Ce n'est pas une science, et c'est assumé : **une règle explicite vaut mieux qu'un choix
arbitraire refait à chaque chaîne**, et elle se discute. Le mot obtenu à la question 2 tranche
les cas limites.

La police de lecture reste **Inter** dans les trois cas : elle porte les petits libellés, où
la personnalité nuit à la lisibilité.

Récupérer la police (licence OFL, gratuite pour tout usage) :

```bash
curl -sL -o assets/fonts/<Nom>-Regular.ttf "https://github.com/google/fonts/raw/main/ofl/<nom>/<Fichier>.ttf"
curl -sL -o assets/fonts/<Nom>-LICENCE.txt "https://github.com/google/fonts/raw/main/ofl/<nom>/OFL.txt"
```

Le montage scanne `assets/fonts/` et déduit le nom de famille du nom de fichier : rien d'autre
à déclarer.

## Étape 3 — L'atmosphère et les plans

La palette ne suffit pas. Deux réglages de plus, à écrire dans `identite_visuelle` :

- **`ambiance`** — `douce`, `neutre` ou `dure`. Elle règle la vignette, le grain et le contraste
  d'ensemble. Une chaîne réconfortante en ambiance dure se contredit elle-même.
- **`direction_plans`** — une phrase en anglais, ajoutée à toutes les requêtes de banque
  d'images. C'est elle qui empêche une chaîne douce de recevoir des plans durs, et elle règle
  le problème à la source plutôt qu'au cas par cas.

  Exemple pour une chaîne chaleureuse : `soft warm light, gentle, intimate, film grain`.

## Étape 4 — La fiche, et la vérification

Écrire `marque/identite-visuelle.md` : la palette avec ses rôles, la typographie et son
pourquoi, l'ambiance, la direction des plans, et **ce que la chaîne s'interdit visuellement**.
Cette dernière section est la plus utile — un interdit se vérifie.

Puis **rendre une image de contrôle** avant de produire quoi que ce soit :

```bash
npm run rends -- <slug> --extrait=0-90 --brouillon
```

Regarder la planche. Une charte se juge sur une image rendue, jamais sur des codes hexadécimaux.

---

## Ce qui ne change pas d'une chaîne à l'autre

La charte change ; **la doctrine de montage, non**. Le rythme des plans, la pagination des
sous-titres, la hiérarchie des raccords, la règle des infographies : tout cela vit dans
`montage-video` et vaut pour toutes les chaînes.

Une nouvelle chaîne hérite donc d'un montage déjà au niveau, et ne redéfinit que ce qui la
distingue. **Si lancer une chaîne demande de modifier `remotion/` ou `pipeline/`, c'est un
bug** — pas une personnalisation.

---

## Ce que la charte impose au reste de la chaîne

Deux effets de bord constatés en production, et qui se règlent au niveau de la chaîne — pas
vidéo par vidéo.

### Une banque d'images rend des plans clairs. Il faut demander le contraire.

Les banques sont peuplées de plans lumineux et bien exposés. Sur une charte nocturne, ils
tranchent : un calendrier blanc au milieu d'une vidéo bleu pétrole se lit comme une pièce
rapportée, même bien étalonné.

`direction_plans` doit donc porter **la lumière**, pas seulement l'ambiance :

```
low key lighting, dark, night, intimate, soft warm light, cinematic, film grain
```

Et l'étalonnage assombrit en complément — mais un étalonnage ne rattrape pas un plan surexposé,
il le grise. La correction se fait d'abord à la recherche.

### L'étalonnage se dérive de l'accent, jamais écrit en dur

Un filtre `sepia + hue-rotate` réglé pour une charte orange **pousse chaque plan à l'opposé de
l'accent** sur une charte bleue. La rotation de teinte se calcule donc à partir de la couleur
d'accent réelle, et la luminosité suit l'ambiance déclarée.

C'est le même critère que partout : **si changer de chaîne demande de toucher au code, c'est un
bug.**
