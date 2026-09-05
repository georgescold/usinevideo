# Les polices de sous-titrage

**Titrer et sous-titrer sont deux métiers différents.** Une police de titrage se regarde ; une
police de sous-titrage se lit — à 86 pixels, par-dessus une image qui bouge, sur un téléphone,
souvent sans le son, et en une fraction de seconde.

Une serif de caractère, une didone, une condensée expressive : magnifiques en titre, mauvaises
en sous-titre. Ce répertoire n'existe que pour empêcher ce glissement.

---

## Ce qui fait une bonne police de sous-titre

Quatre propriétés, dans cet ordre :

1. **Des pleins épais et réguliers.** Un délié fin disparaît dès que le plan derrière est clair.
   C'est le critère qui élimine toutes les didones.
2. **Des formes ouvertes et distinctes.** Le `a`, le `e` et le `o` ne doivent pas se confondre à
   petite taille ; le `l`, le `I` et le `1` non plus.
3. **Une chasse régulière.** Le mot actif change de couleur, jamais de largeur : une police aux
   largeurs irrégulières fait vibrer la ligne.
4. **Aucune personnalité de trop.** Le sous-titre doit se faire oublier. Le caractère de la
   chaîne se joue dans la couleur, le rythme et les infographies — pas dans le dessin des `g`.

**Le corollaire, contre-intuitif :** on ne choisit PAS la police de sous-titre pour exprimer la
marque. On la choisit pour disparaître, et on laisse la couleur porter l'identité.

---

## Le répertoire

Toutes sont gratuites (OFL ou Apache) et parmi les plus employées en sous-titrage social.
Classées de la plus neutre à la plus marquée.

| Police | Caractère | Quand la prendre | Réserve |
|---|---|---|---|
| **Inter** | neutre, technique | une chaîne qui explique, qui analyse, qui parle de méthode | aucune — c'est le choix sûr par défaut |
| **Roboto** | neutre, familier | ce que YouTube emploie lui-même : elle se fond, on ne la voit pas | peut sembler *trop* générique |
| **Open Sans** | humaniste, doux | une chaîne qui s'adresse, qui rassure | un peu large : les longues phrases passent vite sur deux lignes |
| **Montserrat** | géométrique, élégante | **le standard du sous-titrage social**. Chic sans être froide | ses majuscules sont larges : surveiller les mots longs |
| **Poppins** | géométrique, ronde | une chaîne chaleureuse, jeune, accessible | ses formes très circulaires prennent de la place |
| **Nunito** | arrondie, tendre | douceur assumée, sujets intimes | l'arrondi peut sembler enfantin sur un sujet grave |
| **Archivo Black** | grotesque grasse | une chaîne qui affirme, qui tranche | très présente : elle prend le dessus sur l'image |
| **Anton** | condensée d'affiche | quand il faut caser beaucoup de mots par ligne | omniprésente sur TikTok : aucune distinction |

### Ce qu'on ne met JAMAIS en sous-titre

- **Les serifs de caractère** — Fraunces, Playfair, Bodoni, Cormorant. Essayées, rejetées : les
  déliés se noient sur les plans clairs et la lecture ralentit.
- **Les manuscrites et les fantaisies**, quel que soit le sujet.
- **Les monospaces**, sauf sujet technique assumé.
- **Toute police à moins de 700 de graisse** : à 86 px sur une image, un poids « medium » est
  déjà trop léger.

Ces polices peuvent servir ailleurs — un carton, un titre de miniature — mais jamais sur la
ligne de sous-titre.

---

## Comment choisir, en deux questions

1. **Le sujet est-il grave ?** Si oui, écarter Nunito et Poppins : leur rondeur adoucit ce qui
   ne doit pas l'être.
2. **La chaîne veut-elle affirmer ou expliquer ?** Affirmer → Archivo Black ou Anton.
   Expliquer → Inter, Roboto, Montserrat.

En cas d'hésitation : **Montserrat**. C'est le compromis que le sous-titrage social a fini par
adopter, et il est difficile à prendre en défaut.

---

## Récupérer une police

```bash
curl -sL -o "assets/fonts/<Nom>-Variable.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/<nom>/<Fichier>.ttf"
curl -sL -o "assets/fonts/<nom>-LICENCE.txt" \
  "https://github.com/google/fonts/raw/main/ofl/<nom>/OFL.txt"
```

Les crochets d'une police variable s'encodent : `Montserrat%5Bwght%5D.ttf`.

**Vérifier systématiquement** que le fichier est bien une police : un chemin erroné rend une
page HTML de 300 ko qui a l'air d'un fichier valide et casse silencieusement le rendu.

```bash
file -b assets/fonts/<Nom>.ttf   # doit dire « TrueType Font data »
```

Sur une police variable, **ne régler que l'axe `wght`**. Les axes optiques (`opsz`) interagissent
mal avec `font-size` au rendu et font s'effondrer le texte.
