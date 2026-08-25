# Format de `01-script.json`

Le contrat entre l'écriture et le montage. Le pipeline lit ce fichier ; s'il n'est pas conforme, le montage échoue avec un message explicite plutôt que de deviner.

---

## Racine

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `slug` | chaîne | oui | Identique au nom du dossier. `kebab-case-sans-accent`. |
| `format` | énum | oui | `long-face` · `long-faceless` · `long-screencast` · `long-avatar` · `short-face` · `short-faceless` · `short-avatar` |
| `duree_cible_s` | entier | oui | Durée visée en secondes. Sert au contrôle, pas au rendu. |
| `titre_travail` | chaîne | oui | Titre interne. Le vrai titre se décide à la publication, pas ici. |
| `mot_cle` | chaîne | oui | Mot-clé cible. Vide seulement pour un short d'opinion. |
| `intention` | énum | oui | `informative` · `commerciale` · `transactionnelle` · `navigationnelle` |
| `pilier` | chaîne | oui | Doit exister dans `marque/ligne-editoriale.md`. |
| `angle` | chaîne | oui | L'angle en une phrase. |
| `avatar` | chaîne | oui | Nom de l'avatar visé, tel qu'écrit dans `Fiche-Avatars.md`. |
| `niveau_conscience` | entier 1–5 | oui | 1 = ne sait pas qu'il a le problème, 5 = compare des solutions. |
| `blocs` | tableau | oui | Voir plus bas. Au moins un. |
| `maillage` | objet | oui | `{ "vers": ["slug"], "depuis": ["slug"] }`. Tableaux vides tolérés sur la toute première vidéo de la chaîne, pas après. |
| `notes` | chaîne | non | Ce qu'il faut savoir et qui n'entre nulle part ailleurs. |

---

## Un bloc

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `id` | chaîne | oui | Unique. **Stable** : le montage s'y réfère. Ne jamais le renuméroter lors d'une réécriture. |
| `role` | énum | oui | `hook` · `promesse` · `legitimite` · `corps` · `relance` · `tension` · `chute` · `sortie` |
| `texte` | chaîne | oui | **Ce qui est dit, mot pour mot.** La voix off est la concaténation exacte de tous les `texte`. |
| `intention` | énum | non | Couleur de jeu : `vif` · `posé` · `grave` · `curieux` · `complice` · `tranchant` · `intime`. Sert au prompteur et au réglage de la voix. |
| `prise` | entier | non | Numéro de prise au tournage. Plusieurs blocs peuvent partager une prise. |
| `visuel` | tableau | non | Les événements visuels du bloc. Voir plus bas. |
| `notes_montage` | chaîne | non | Consigne libre pour le monteur. |
| `pause_apres_ms` | entier | non | Silence volontaire à conserver après ce bloc. Sans ce champ, tout silence saute. |

### Sur `texte`

- Écrit pour être **dit** : phrases courtes, pas de subordonnée impossible à prononcer d'une traite.
- La ponctuation reste : elle pilote les respirations de la voix et le découpage des sous-titres.
- `[pause]` dans le texte marque un silence volontaire à cet endroit précis.
- Pas de balise de mise en forme, pas de markdown, pas d'emoji. Ce texte sera lu à voix haute.

---

## Un événement visuel

Élément du tableau `visuel`. Le champ `ancre` dit **sur quel mot du `texte`** l'événement se déclenche — c'est ce qui permet un calage exact une fois l'audio transcrit. Sans `ancre`, l'événement démarre au début du bloc.

| Champ commun | Type | Rôle |
|---|---|---|
| `type` | énum | Voir le tableau ci-dessous. |
| `ancre` | chaîne | Mot ou début de phrase du `texte` sur lequel se cale l'événement. Doit exister tel quel dans `texte`. |
| `duree_s` | nombre | Durée d'affichage. Par défaut : le temps de lire, plus une seconde. |
| `position` | énum | `plein` · `haut` · `bas` · `gauche` · `droite` · `coin`. Défaut `plein` pour un carton, `bas` pour le reste. |

### Types

| `type` | Champs propres | Ce que ça fait |
|---|---|---|
| `mot-cle` | `texte` | Un mot ou une expression apparaît à l'écran parce qu'il porte l'idée. |
| `chiffre` | `de`, `a`, `suffixe`, `prefixe` | Un compteur qui monte. `de` peut valoir `0`. |
| `infographie` | `modele`, `donnees` | Voir les modèles ci-dessous. |
| `broll` | `requete`, `source` | `requete` **en anglais** (langue des banques d'images). `source` : `pexels` · `pixabay` · `local` · `capture`. |
| `capture` | `fichier` | Un fichier de `videos/<slug>/02-tournage/` ou `assets/`. |
| `punch-in` | `amplitude` | Resserrement de 0,04 à 0,08. Sur une idée forte, jamais sur une transition. |
| `carton` | `texte`, `sous_texte` | Plein écran, marque une rupture de sujet. |
| `transition` | `effet` | `fondu` · `glissement` · `volet` · `flash`. **Uniquement entre deux sujets.** À l'intérieur d'une idée, on coupe sec. |
| `souligne` | `texte` | Surligne une expression déjà affichée. |
| `flou` | `zone` | Masque une zone — visage, nom, montant. |

### Modèles d'infographie

| `modele` | `donnees` attendues | Pour quoi |
|---|---|---|
| `liste` | `{ "items": ["…", "…", "…"] }` | Trois éléments, apparition en cascade. Jamais plus de cinq. |
| `comparaison` | `{ "gauche": {...}, "droite": {...} }` | Deux options face à face. |
| `avant-apres` | `{ "avant": "…", "apres": "…" }` | Un changement d'état. |
| `chronologie` | `{ "etapes": [{ "date": "…", "texte": "…" }] }` | Une suite d'événements. |
| `barres` | `{ "series": [{ "libelle": "…", "valeur": 12 }] }` | Un ordre de grandeur. Quatre barres maximum. |
| `citation` | `{ "texte": "…", "source": "…" }` | Une citation, avec sa source. |

**Une idée par infographie.** Deux idées, deux infographies.

---

## Exemple minimal valide

```json
{
  "slug": "combien-coute-vraiment-un-site-vitrine",
  "format": "long-face",
  "duree_cible_s": 480,
  "titre_travail": "Le vrai coût d'un site vitrine",
  "mot_cle": "prix site vitrine",
  "intention": "commerciale",
  "pilier": "Budget",
  "angle": "Le devis n'est pas le coût : ce qui coûte, c'est ce qu'on paie après.",
  "avatar": "Le gérant qui a déjà été déçu",
  "niveau_conscience": 2,
  "blocs": [
    {
      "id": "hook",
      "role": "hook",
      "texte": "On t'a annoncé 1500 euros. Tu en paieras 4000. Et personne ne te l'a dit.",
      "intention": "tranchant",
      "prise": 1,
      "visuel": [
        { "type": "chiffre", "de": 1500, "a": 4000, "suffixe": " €", "ancre": "4000" },
        { "type": "punch-in", "amplitude": 0.06, "ancre": "personne" }
      ]
    },
    {
      "id": "promesse",
      "role": "promesse",
      "texte": "Dans les huit prochaines minutes, je te montre la facture réelle, ligne par ligne. Celle que tu découvres au bout de six mois.",
      "intention": "posé",
      "prise": 1,
      "visuel": [{ "type": "mot-cle", "texte": "ligne par ligne", "ancre": "ligne par ligne" }]
    }
  ],
  "maillage": {
    "vers": ["choisir-son-prestataire-web"],
    "depuis": ["erreurs-site-vitrine"]
  }
}
```

---

## Contrôles que le pipeline applique

Le montage refuse un script qui ne passe pas ces contrôles, avec un message qui dit quoi corriger :

- `slug` identique au nom du dossier ;
- `format` dans la liste, et activé dans `config/chaine.json` ;
- au moins un bloc, et un seul bloc de rôle `hook` ;
- chaque `id` de bloc unique ;
- chaque `ancre` présente telle quelle dans le `texte` de son bloc ;
- chaque `modele` d'infographie connu, avec les `donnees` qu'il attend ;
- `niveau_conscience` entre 1 et 5 ;
- pas de `transition` à l'intérieur d'un bloc de rôle `corps` — les transitions marquent les ruptures de sujet, donc les frontières de blocs ;
- durée estimée à ±25 % de `duree_cible_s`, sinon avertissement (pas un blocage).
