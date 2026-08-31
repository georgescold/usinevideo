# Ce qui distingue réellement une vidéo qui déborde son audience

> **Mesuré le 28 août 2026** sur la veille YouTube de la chaîne, avec un **groupe témoin**.
> C'est la seule analyse de ce dossier qui compare des gagnantes à des perdantes.

---

## Pourquoi ce document existe

Trois analyses successives ont disséqué les vidéos performantes de la niche et en ont tiré des
lois : ouvrir sur un compte annoncé, poser une absolution, tenir telle densité d'adresse, telle
longueur de phrase.

**Toutes avaient le même défaut, et il est disqualifiant : elles ne regardaient que des gagnantes.**
Sélectionner l'échantillon sur la variable qu'on veut expliquer interdit toute conclusion. Si
l'anaphore et l'absolution sont du français courant de la niche — présentes chez tout le monde, y
compris chez ceux qui ne font aucune vue — elles ne discriminent rien.

La base pour le vérifier était sur le disque depuis le début : **1 735 transcripts**.

## La méthode

- Corpus : les vidéos de `veille/youtube/index.json` en français, dans la niche (hors musique,
  religion, fiction, divertissement), d'au moins 500 abonnés et 3 000 vues, entre 3 et 90 minutes,
  avec un transcript d'au moins 250 mots. **57 vidéos.**
- Mesure de performance : le **ratio vues ÷ abonnés**, qui isole ce que le contenu a fait de ce que
  la taille du compte a fait. Médiane du corpus : **0,36×**.
- Comparaison : les **15 meilleures** (ratio médian **6,68×**) contre les **15 dernières** (ratio
  médian **0,05×**). Un facteur 130 entre les deux groupes.
- Toutes les fréquences sont normalisées pour mille mots.

---

## Le résultat

| Figure | Haut (15) | Bas (15) | Rapport | Verdict |
|---|---|---|---|---|
| **Écart « pas X, mais Y »** | 0,6 | 0,1 | **×8,7** | **Discrimine** |
| Absolution (« tu n'as rien fait de mal ») | 0,2 | 0,2 | ×1,3 | Non discriminant |
| Compte annoncé (« les cinq signes ») | 0,1 | 0,2 | ×0,6 | **Discrimine à l'envers** |
| Adresse (tu / vous) | 56,2 | 50,6 | ×1,1 | Non discriminant |
| Première personne (je / mon) | 39,4 | 38,5 | ×1,0 | Non discriminant |
| Mots par phrase | 17,7 | 17,0 | ×1,0 | Non discriminant |

### Robustesse du seul résultat positif

Testé sur trois formulations indépendantes de la même figure :

| Formulation | Haut | Bas |
|---|---|---|
| stricte — « ne sont pas X **mais** Y » | 32 occurrences · **9 vidéos sur 15** | 5 occurrences · 5 sur 15 |
| large — « pas … mais » | 132 · **14 sur 15** | 88 · 10 sur 15 |
| inverse — « ce n'est pas X, c'est Y » | 32 · **8 sur 15** | 8 · 5 sur 15 |

Le groupe haut a des transcripts **plus courts** (3 916 mots contre 5 124). La normalisation par
millier de mots joue donc contre le résultat, pas pour lui.

---

## Ce que ça tue

**Le compte annoncé n'est pas un levier — il est légèrement contre-indiqué.** Il avait été érigé en
loi parce que les deux TikToks les plus vus l'employaient. Or ces deux-là datent de 2022 et 2023 :
en vues par jour, l'un d'eux est avant-dernier de son lot. **Le classement en vues absolues mesurait
l'ancienneté.**

**Le débat impersonnel contre adresse directe portait sur un non-facteur.** 56,2 contre 50,6 marques
d'adresse pour mille mots : les gagnantes et les perdantes se ressemblent. La question « faut-il
tutoyer ? » a occupé trois échanges et ne se décide pas sur la performance. Elle se décide sur
l'identité de la chaîne, et c'est tout.

**La longueur de phrase ne prédit rien.** 17,7 contre 17,0 mots. La règle « aucune phrase sous dix
mots, moyenne 18 à 28 » n'est pas fondée sur la performance. Elle peut rester comme choix de style,
elle ne doit plus être défendue comme condition de viralité.

**L'absolution ne discrimine pas.** Elle reste juste éditorialement — on ne culpabilise pas le
spectateur — mais elle ne fait pas la différence.

## Ce que ça établit

**Une seule chose, et elle est solide : l'écart.** Dire ce que la chose n'est pas, puis ce qu'elle
est. « Ce n'est pas une rupture brutale, mais un déplacement silencieux. » « Les gens toxiques ne
cherchent pas la gentillesse, ils cherchent la soumission. » « La flamme, c'est pas un feu
d'artifice, c'est un feu de bois. »

Neuf des quinze meilleures en emploient, contre cinq des quinze dernières, et elles en emploient
huit fois plus souvent rapporté au texte.

**C'est la seule règle d'écriture de ce dossier qui ait survécu à un groupe témoin.**

---

## Les limites, qui restent lourdes

1. **Quinze contre quinze.** L'échantillon est petit. Le résultat est robuste à la formulation, il
   ne l'est pas nécessairement à un autre corpus.
2. **Corrélation, pas causalité.** Le titre, la miniature, le sujet et la distribution externe ne
   sont pas contrôlés. Il se peut que l'écart soit la marque d'un rédacteur soigneux plutôt que la
   cause des vues.
3. **YouTube seulement.** Le corpus TikTok n'a pas de nombre d'abonnés, donc pas de ratio, donc pas
   de groupe témoin possible. Rien de mesuré ici ne vaut démonstration pour le format court.
4. **Aucune vidéo faceless mesurée séparément.** Trois des vidéos à haut ratio sont de fait des voix
   off impersonnelles (40,2×, 28,8×, 20,9×), ce qui montre que le faceless peut déborder son
   audience — mais trois cas ne font pas une mesure.
5. **Le corpus de veille est contaminé.** Sur les douze premiers ratios français bruts, au moins
   trois sont hors niche : un chant gospel à 54×, une adoration à 33×, une série dramatique à 22×.
   Tout classement par ratio doit être filtré avant d'être lu.
