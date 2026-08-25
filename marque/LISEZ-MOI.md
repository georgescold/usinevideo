# marque/ — le socle

Tout ce qui est **propre à cette chaîne** vit ici. Le reste de la stack (`pipeline/`, `remotion/`, `.claude/`) est générique et ne connaît rien du produit : c'est ce qui permet de copier le dossier pour lancer une autre chaîne.

Aucun script ni aucun agent ne doit écrire un angle, un titre ou une phrase sans avoir lu ces fichiers.

## Les six fichiers

| Fichier | Ce qu'il porte | Qui l'écrit |
|---|---|---|
| `Fiche-Produit.md` | Le produit traduit en problèmes, bénéfices, preuves, vocabulaire client | skill `avatars-et-produit`, phase 1 |
| `Fiche-Avatars.md` | Les personnes visées, incarnées, avec leur langage propre | skill `avatars-et-produit`, phase 2 |
| `Hook-Bank.md` | Les angles et les hooks, classés par avatar et par niveau de conscience | skill `avatars-et-produit`, phase 2 |
| `Le-Marketeur.md` | La figure d'autorité que tu incarnes à l'écran : posture, lexique, ennemi | skill `avatars-et-produit`, phase 3 |
| `identite-visuelle.md` | La direction artistique vidéo : polices, couleurs, sous-titres, rythme, LUT | skill `init-chaine`, après la veille |
| `ligne-editoriale.md` | Les formats retenus, les piliers, ce qu'on dit et ce qu'on ne dit jamais | skill `init-chaine`, après la veille |

## L'ordre compte

1. **Produit → Avatars → Hook Bank → Marketeur.** On ne part jamais du produit pour trouver des arguments : on part de la personne. C'est la skill `avatars-et-produit` qui gère les quatre, dans cet ordre, sans sauter d'étape.
2. **Puis la veille** (`/veille`, `/decode`). On regarde ce qui marche réellement dans la niche avant de décider d'un format ou d'une esthétique.
3. **Alors seulement** on écrit `identite-visuelle.md` et `ligne-editoriale.md`. Choisir sa direction artistique avant d'avoir vu la concurrence, c'est choisir au hasard.

## Règle de lisibilité

Ces fiches sont lues par des agents autant que par toi. Mise en forme simple, chaque champ nommé et expliqué en clair, aucun jargon de méthode, aucun nom d'auteur. Un agent qui ouvre une fiche sans contexte doit pouvoir travailler.

## Ce qui n'a pas sa place ici

Les scripts de vidéos (`videos/`), la stratégie de mots-clés (`strategie/`), la matière scrapée (`veille/`). Ici, uniquement ce qui ne change pas d'une vidéo à l'autre.
