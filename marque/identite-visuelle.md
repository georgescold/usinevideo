# Identité visuelle — <!-- NOM DE LA CHAÎNE -->

> **État : à remplir.** Ce fichier est écrit par `/init-chaine`, **après** la veille (`/veille`, `/decode`). On ne choisit pas une direction artistique avant d'avoir vu ce qui fonctionne dans la niche.
>
> Ce fichier explique. Les valeurs qui pilotent réellement le rendu sont dans `config/chaine.json` → `identite_visuelle`. Les deux doivent rester d'accord.

Rappel du contexte en une ligne, pour un agent qui ouvre ce fichier sans rien connaître du projet : *<!-- « Chaîne YouTube et TikTok de X, qui parle à Y à propos de Z. » -->*

---

## 1. Le parti pris

Une phrase qui dit à quoi la chaîne ressemble et pourquoi. Pas une liste d'adjectifs : une décision.

> *<!-- Exemple de formulation attendue : « Sobre et dense. Fond sombre, un seul accent, aucune fioriture : tout l'espace visuel sert à rendre un raisonnement lisible. » -->*

**Ce qu'on ne fait jamais** — la liste des tics visuels de la niche qu'on refuse, relevés pendant la veille.

---

## 2. Couleurs

| Rôle | Valeur | Où ça sert |
|---|---|---|
| Fond | `#______` | fond des inserts, des infographies, des cartons |
| Texte | `#______` | texte principal à l'écran |
| Accent | `#______` | mot actif des sous-titres, chiffres, soulignements |
| Accent secondaire | `#______` | second niveau, comparaisons, « avant/après » |
| Alerte | `#______` | ce qui doit inquiéter (rare) |

**Règle :** l'accent signe, il ne tapisse pas. S'il couvre plus d'un dixième de l'écran, ce n'est plus un accent.

**Contraste :** tout texte à l'écran doit rester lisible sur un téléphone tenu à bout de bras, en plein soleil. En dessous d'un rapport de 4,5:1 sur son fond, on change la couleur, pas la taille.

---

## 3. Polices

| Usage | Police | Graisse | Détail |
|---|---|---|---|
| Sous-titres | | 700–800 | interlettrage serré, jamais de police à empattement |
| Titres à l'écran / cartons | | 700 | |
| Chiffres et données | | 600 | chasse fixe, pour que les compteurs ne tremblent pas |
| Annotations | | 500 | |

Les fichiers de police vivent dans `assets/fonts/`. Une police non déposée là ne sera pas embarquée au rendu et le texte retombera sur une police système : le rendu changera sans prévenir.

---

## 4. Sous-titres

C'est l'élément le plus vu de toutes les vidéos. Il se décide une fois.

- **Style** : `<!-- mot-a-mot-pastille | ligne-karaoke | bloc-2-lignes -->`
- **Mots affichés à la fois** : `<!-- 1 à 3 en vertical, 3 à 6 en horizontal -->`
- **Casse** : `<!-- MAJUSCULES | Phrase normale -->`
- **Ponctuation à l'écran** : `<!-- retirée sauf ? et ! -->` — la ponctuation reste dans le texte lu, elle pilote les respirations.
- **Mot actif** : `<!-- pastille d'accent | couleur seule | échelle 1,08 -->`
- **Position** : `<!-- hauteur en % depuis le bas -->` — au-dessus de la zone d'interface de TikTok et des Shorts.
- **Ombre / contour** : indispensable dès que le fond bouge.

**Ils sont calés mot à mot sur l'audio réel, jamais estimés.** C'est la transcription locale qui donne les temps.

---

## 5. Rythme et montage

- **Événement visuel toutes les** `<!-- 2 à 4 -->` **secondes** : coupe, punch-in, mot-clé qui apparaît, insert, infographie.
- **Jamais deux fois le même effet de suite.**
- **Punch-in** : amplitude `<!-- 4 à 8 % -->`, sur une idée forte, jamais sur une transition.
- **Transitions** : réservées aux changements de sujet. À l'intérieur d'une idée, on coupe sec.
- **Silences** : tout ce qui dépasse `COUPE_SILENCE_MIN` saute. Sauf un silence volontaire, marqué dans le script par `[pause]`.
- **B-roll** : `<!-- couvre X % du temps -->`, toujours en soutien d'un mot précis, jamais en papier peint.

---

## 6. Infographies

Ce qui mérite d'exister à l'écran : un chiffre, une comparaison, une liste de trois éléments, une chronologie, un avant/après. Tout le reste se dit.

- **Style** : `<!-- plat | verre translucide | trait fin | plein -->`
- **Apparition** : `<!-- en cascade décalée, ressort court -->`
- **Durée d'affichage** : au moins le temps de la lire à voix haute, plus une seconde.
- **Une idée par infographie.** Deux idées = deux infographies.

---

## 7. Étalonnage

- **LUT** : `assets/luts/<!-- nom.cube -->`, appliquée à `<!-- 50 -->` %.
- **Registre** : `<!-- pastel doux | contrasté chaud | froid cinéma | neutre -->`
- Le visage prime : jamais de teinte qui verdit ou grise la peau.

---

## 8. Miniatures

La miniature n'illustre pas la vidéo : elle **incarne la tension que le spectateur porte déjà**.

- **Composition** : `<!-- gros plan visage regard caméra | objet + texte | avant-après -->`
- **Texte** : `<!-- 3 à 5 mots maximum -->`, jamais la répétition du titre — il le complète.
- **Récurrences** : ce qui reste identique d'une miniature à l'autre pour que la chaîne se reconnaisse au scroll.
- **Test** : réduite à la taille d'un timbre, le sujet doit rester identifiable.

---

## 9. Son

- **Musique** : `<!-- registre -->`, volume sous la voix `<!-- 6 à 10 % -->`, absente sur les passages à forte densité d'information.
- **Effets** : whoosh sur les transitions de sujet, tick sur l'apparition des chiffres. Rares, sinon ils deviennent du bruit.
- **Voix** : normalisée à −16 LUFS pour le long format, −14 pour les formats verticaux.

---

## 10. Habillage récurrent

- **Intro** : `<!-- durée en secondes, ce qu'on y voit -->` — jamais de générique avant le hook.
- **Sortie** : `<!-- écran de fin, durée, ce qu'on y met -->` — sur YouTube, les 20 dernières secondes portent l'écran de fin et deux vidéos suggérées.
- **Logo** : `assets/logos/<!-- fichier -->`, `<!-- position, opacité, ou absent -->`.
