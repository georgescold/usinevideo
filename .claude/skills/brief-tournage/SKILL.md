---
name: brief-tournage
description: Prépare le tournage d'une vidéo — texte au prompteur découpé en prises tenables, liste des plans de coupe à filmer, consignes de cadre, son et lumière, et les réglages qui conditionnent la suite du montage automatique. Utilise cette skill quand l'utilisateur va tourner, veut son prompteur, demande comment filmer, ou mentionne : tournage, prompteur, téléprompteur, je vais filmer, comment je tourne ça, réglages caméra, enregistrer ma voix, prises. Déclencheurs — "/tournage", "je tourne quand ?", "prépare-moi le prompteur", "je vais enregistrer la voix off". Toujours répondre en français.
---

# Préparer un tournage

Le montage est automatique. Il ne rattrapera pas un mauvais rush : il en fera un montage rapide et propre d'un mauvais rush. Ce qui se gagne ici se gagne définitivement.

Cette skill produit trois choses : **le prompteur**, **la liste de tournage**, **les consignes**. Elles vont dans `videos/<slug>/02-tournage/`.

---

## Avant

Lis `videos/<slug>/01-script.json`. S'il n'existe pas, arrête-toi : il faut un script avant de tourner. Lis aussi `config/chaine.json` (format, mode de voix) et `marque/identite-visuelle.md` (le cadre, la lumière, ce qui doit se retrouver à l'image).

---

## 1. Le prompteur — `02-tournage/prompteur.md`

Le texte à lire, découpé pour être **tenable**.

### Découpage en prises

Une prise est un morceau qu'on peut dire d'une traite sans se tromper. En pratique :

- **face caméra : 30 à 60 secondes par prise**, soit 80 à 150 mots ;
- **voix off seule : jusqu'à 2 minutes**, on est assis, on relit, c'est plus facile ;
- une prise ne coupe **jamais au milieu d'une phrase** ni au milieu d'une idée.

Numérote les prises. Reporte le numéro dans le champ `prise` de chaque bloc du script JSON, pour que le montage sache remettre les morceaux dans l'ordre même si le tournage a été fait en désordre.

### Mise en forme

- **Gros, aéré, une idée par ligne.** Une ligne = un souffle.
- **Les indications de jeu entre crochets** au-dessus de la ligne, jamais dedans : `[tranchant]`, `[ralentir]`, `[sourire]`, `[pause 1 s]`.
- **Souligne les mots à appuyer.** Ce sont ceux qui porteront un événement visuel au montage.
- **Aucune indication technique dans le texte lu.** Ce qui est écrit sera dit.

### Repères de calage

Entre deux prises, une ligne de séparation qui rappelle le numéro et les premiers mots. C'est ce que l'utilisateur lira à voix haute avant de commencer — ça sert de marqueur audio au montage.

---

## 2. La liste de tournage — `02-tournage/liste.md`

Ce qu'il faut filmer **en plus** du face caméra, pendant qu'on est déjà installé. Repasser filmer un plan de coupe une semaine plus tard n'arrive jamais.

Extrait du script JSON tous les événements visuels de type `broll` et `capture`, et pour chacun décide : **on le filme, ou on le prend en banque d'images ?**

- **On le filme** si l'objet est chez l'utilisateur, si le plan met en scène sa main, son écran, son produit, ou si un plan générique casserait la crédibilité.
- **On le prend en banque** si c'est un lieu, une foule, une abstraction, une matière.

Pour chaque plan à filmer : ce qu'on voit, la durée (5 secondes suffisent, on ne coupe jamais au montage faute de matière), l'axe, et le mot du script sur lequel il tombera.

Ajoute systématiquement, même si le script ne les demande pas :

- **trois plans de coupe passe-partout** — les mains, un détail du décor, un déplacement. Ils sauvent un raccord raté ;
- **deux secondes de silence en début et en fin de chaque prise**, micro ouvert. C'est le profil de bruit de la pièce : la réduction de bruit s'en sert, et sans lui elle abîme la voix.

---

## 3. Les consignes — `02-tournage/consignes.md`

Ce qui conditionne la suite. À dire une fois, puis à rappeler en une ligne aux tournages suivants.

### Ce qui compte pour le montage automatique

| Consigne | Pourquoi |
|---|---|
| **Ne coupe pas la caméra entre deux essais.** Reprends la phrase depuis le début, à voix haute. | Le montage détecte les reprises et garde la dernière. Couper et relancer crée des fichiers à recoller à la main. |
| **Micro à 15–25 cm, hors champ.** Jamais le micro de la caméra. | La transcription mot à mot et le speech-to-speech s'effondrent sur un son lointain. C'est le facteur numéro un de la qualité finale. |
| **Pièce mate** : rideaux, tapis, pas de carrelage nu. | La réverbération ne se retire pas. |
| **Aucune musique, aucun ventilateur, aucune notification** pendant la prise. | Ce qui est dans le rush y reste. |
| **Deux secondes de silence** au début et à la fin de chaque prise. | Profil de bruit, et marge de coupe. |
| **Annonce le numéro de prise à voix haute** avant de commencer. | Repérage automatique dans le rush. |
| **Enregistre en 4K si tu peux, sinon 1080p à 25 ou 30 images/s.** | Le 4K permet de recadrer en vertical sans perte, donc de tirer des shorts du même tournage. |
| **Ne bouge pas le cadre en cours de prise.** | Les punch-ins sont ajoutés au montage. Un zoom fait à la main les rend impossibles. |

### Cadre et lumière

Reprends ce qui est écrit dans `marque/identite-visuelle.md`. Si rien n'y est encore, propose et fais valider :

- **Cadre** : buste, regard à hauteur d'objectif, un tiers d'air au-dessus de la tête, décor lisible mais qui ne raconte rien de concurrent.
- **Lumière** : une source principale à 45°, une seconde plus faible de l'autre côté pour ouvrir les ombres, rien derrière qui surexpose.
- **Le même cadre à chaque tournage.** Une chaîne se reconnaît autant à son cadre qu'à son visage.

### Nommage des fichiers

L'utilisateur dépose ses rushes dans `videos/<slug>/02-tournage/`. Le pipeline les prend dans l'ordre alphabétique, donc :

```
prise-01.mp4  prise-02.mp4  …  coupe-01.mp4  coupe-02.mp4
```

Si sa caméra sort des noms illisibles, ne lui demande pas de renommer : dis-le-lui et fais-le au moment du `/monte`.

---

## 4. Rendre la main

Affiche un récapitulatif court : le nombre de prises, la durée estimée de tournage (compter deux fois et demie la durée finale), les plans de coupe à filmer, et les trois consignes qui comptent le plus ce jour-là.

Termine par : « Quand c'est tourné, dépose les fichiers dans `videos/<slug>/02-tournage/` et lance `/monte <slug>`. »

---

## Cas particuliers

**Voix off seule (faceless, screencast).** Pas de cadre ni de lumière. En revanche le son devient tout : insiste sur le micro, la pièce et la reprise à voix haute. Le prompteur peut aller jusqu'à 2 minutes par prise.

**Screencast.** Ajoute au brief : la résolution d'enregistrement (jamais en dessous de 1920×1080), le curseur agrandi, les notifications coupées, le zoom du navigateur à 125 % pour que le texte reste lisible en vertical, et la liste des écrans à montrer dans l'ordre.

**Avatar de synthèse.** Il n'y a pas de tournage : le script part directement en génération. Dis-le et propose `/monte <slug>` tout de suite.
