---
name: strategie-contenu
description: Construit la stratégie de contenu d'une chaîne — mots-clés classés par intention de recherche, matrice d'angles à tester, architecture en hubs avec piliers, satellites, playlists et maillage interne, puis le calendrier de production. Utilise cette skill quand l'utilisateur veut planifier ses contenus, trouver des sujets, organiser sa chaîne, comprendre le SEO YouTube, préparer un calendrier éditorial, ou mentionne : stratégie, plan de contenu, mots-clés, SEO, intentions de recherche, piliers, playlists, maillage interne, calendrier éditorial, quels sujets faire, tester des angles. Déclencheurs — "/plan", "qu'est-ce que je publie ce mois-ci", "organise ma chaîne", "trouve-moi les mots-clés", "fais-moi le calendrier". Toujours répondre en français.
---

# Stratégie de contenu

Une chaîne qui range ses vidéos les unes à côté des autres reste un tas de vidéos. Une chaîne qui les fait **pointer les unes vers les autres** devient une autorité sur un sujet — et c'est le seul endroit où YouTube reconnaît officiellement qu'une chaîne fait autorité.

**Lis `references/seo-youtube.md` avant de travailler.** Ce fichier porte les règles chiffrées ; cette skill dit dans quel ordre les appliquer.

---

## Ce que tu lis d'abord

1. `veille/synthese.md` — **obligatoire**. Sans veille, tu inventerais une stratégie pour une niche que tu n'as pas vue. Si le fichier n'existe pas, arrête-toi et propose `/veille`.
2. `marque/Fiche-Produit.md` — les problèmes résolus deviennent les hubs.
3. `marque/Fiche-Avatars.md` et `marque/Hook-Bank.md` — les angles existent peut-être déjà.
4. `marque/ligne-editoriale.md` — les formats actifs et les interdits.
5. `perf/historique.json` s'il existe — ce qui a déjà marché prime sur ce qui devrait marcher.

---

## Étape 1 — Les mots-clés

Quatre sources, dans l'ordre du §4 de la doctrine. Aucune ne suffit seule, et **YouTube ne publie aucun volume de recherche officiel** : tout chiffre est une estimation, dis-le.

Tu peux faire l'autocomplétion toi-même : cherche sur YouTube la requête de base, puis avec chaque lettre de l'alphabet. C'est fastidieux mais c'est la source la plus fiable et elle est gratuite.

Pour chaque mot-clé retenu, écris dans `strategie/mots-cles.md` :

| Colonne | Contenu |
|---|---|
| Mot-clé | tel qu'on le tape |
| Intention | informationnelle · commerciale · transactionnelle · navigationnelle |
| Volume estimé | et sa source |
| Difficulté | estimation, et sur quoi elle repose |
| Ce qui ranke aujourd'hui | les trois premiers, avec leur faiblesse |
| Hub | à quel territoire il appartient |
| Statut | à faire · en cours · publié · abandonné |

**Seuils :** 300 à 5 000 recherches mensuelles estimées ; difficulté sous 40 tant que la chaîne n'a pas trois vidéos dans le top 3 d'un hub, sous 60 ensuite.

**Couvre les quatre intentions.** Une chaîne qui n'a que de l'informationnel fait des vues et zéro client ; une chaîne qui n'a que du commercial n'a aucune autorité pour être crue.

---

## Étape 2 — L'architecture

Dans `strategie/architecture-chaine.md`.

### Les hubs

3 à 5, pas plus. Un par problème majeur du produit. Moins de trois : rien ne se compose. Plus de cinq : l'autorité se dilue et aucun hub n'atteint la masse critique.

Pour chaque hub :

- **le mot-clé principal** — celui du pilier ;
- **la vidéo pilier** : 10 à 20 minutes, la référence sur le sujet ;
- **5 à 8 satellites** : longue traîne, 6 à 12 minutes, chacun sur une requête précise ;
- **une playlist**, avec son propre titre et sa propre description optimisés — une playlist se classe pour elle-même ;
- **le mélange d'intentions** : environ 60 % informationnel, 30 % commercial, 10 % le reste.

### Le maillage

C'est la partie que tout le monde saute. Pour **chaque** vidéo prévue, écris :

- **vers quoi elle pointe** : le pilier de son hub, plus une vidéo latérale ;
- **ce qui pointe vers elle** ;
- **où placer les fiches** : 2 à 4 par vidéo, 5 à 10 secondes avant chaque décrochage de rétention, au moment où le sous-sujet est évoqué ;
- **l'écran de fin** : la playlist du hub, jamais une vidéo isolée — c'est la playlist qui déclenche la lecture automatique.

**Une vidéo qui ne pointe vers rien et vers laquelle rien ne pointe est refusée.** Elle ne construit pas la chaîne, elle l'encombre.

**Une idée qui n'entre dans aucun hub ouvre formellement un nouveau hub**, avec son pilier et ses cinq satellites planifiés. Sinon on ne la fait pas. C'est la règle qui empêche une chaîne de devenir un tas.

---

## Étape 3 — La matrice d'angles

Dans `strategie/matrice-angles.md`.

Un **angle** est une manière d'attaquer un sujet, pas un sujet. « Le prix d'un site vitrine » est un sujet ; « le devis n'est pas le coût » est un angle.

Pour chaque hub, au moins **quatre angles distincts**, tirés de la Hook Bank quand ils y sont. Pour chacun :

| Champ | Contenu |
|---|---|
| Angle | en une phrase |
| Avatar visé | et son niveau de conscience |
| Tension exploitée | peur, frustration, injustice, désir, curiosité |
| Ennemi | le statu quo ou la croyance attaqués — jamais une personne |
| Vidéos de test | **au moins deux**. Aucun verdict sur une seule. |
| État | à tester · en test · doublé · abandonné |

**Le protocole de test**, repris de la doctrine : un angle par semaine, on fait varier `titre + miniature + première minute`, on garde constants `structure + durée + format`. Sans variables isolées, un test n'apprend rien.

Écris dans ce fichier les **seuils de décision** — c'est `/bilan` qui les appliquera :

- 7 jours : `ctr_r < 0,8` → problème d'emballage · `ctr_r ≥ 0,8` et `retention_r < 0,8` → promesse non tenue · les deux ≥ 1,2 → doubler sous 21 jours ;
- abandon : trois vidéos consécutives sous 0,8 sur les deux métriques **simultanément**, et après un test comparatif.

Tous les seuils sont des **rapports à la médiane des 28 derniers jours de la chaîne, sur la même source de trafic**. Aucun repère externe absolu n'entre dans une décision.

---

## Étape 4 — Le calendrier

Dans `strategie/calendrier.md`. Douze lignes pour commencer, pas plus : un calendrier de six mois écrit avant la première vidéo sera faux au bout de trois.

L'ordre compte :

1. **Les trois premières vidéos sont des satellites.** On apprend à écrire, tourner et monter sur des vidéos à faible enjeu, sur des requêtes moins disputées.
2. **Puis le premier pilier**, quand il y a de quoi le mailler.
3. Chaque long format s'accompagne d'un ou deux shorts qui en extraient un angle — **par correspondance de sujet, pas par un lien**.

Chaque ligne porte : date · format · hub · angle · avatar · niveau de conscience · mot-clé cible · slug · état.

**Cadence** : le plancher est d'un long format par semaine. En dessous, la chaîne ne décolle pas — les chiffres du §2 de la doctrine sont sans appel.

---

## Étape 5 — Rendre la main

Affiche un récapitulatif :

- les hubs et leur couverture (combien de vidéos prévues, combien publiées) ;
- les problèmes produit **non couverts** par un hub — c'est le trou le plus coûteux ;
- les angles jamais testés ;
- la prochaine vidéo à faire, et pourquoi celle-là.

Puis propose `/script <slug>`.

---

## Mettre à jour plutôt que refaire

Aux appels suivants, la stratégie existe. On ne la réécrit pas : on l'**amende**.

- `/bilan` a produit des verdicts → reporte-les dans la matrice d'angles.
- Un mot-clé a été publié → change son statut, note sa position réelle.
- Un angle est doublé → ajoute ses satellites au calendrier, sous 21 jours.
- Un angle est abandonné → dis pourquoi dans le fichier. Une chaîne qui ne garde pas trace de ses échecs les répète.

---

## Ce qui fait échouer une stratégie

- **La faire sans veille.** Voir plus haut.
- **Sept hubs.** L'autorité se dilue, aucun n'atteint la masse critique.
- **Des vidéos orphelines.** Elles font des vues et ne construisent rien.
- **Conclure sur une vidéo.** Deux minimum par angle, sinon c'est du bruit.
- **Utiliser des repères externes** dans une décision. « 4 % de taux de clic, c'est la moyenne » ne dit rien de ta chaîne. Seul le rapport à ta propre médiane compte.
- **Toucher à une vidéo intemporelle qui se classe bien.** Son âge est un actif. On ne retitre pas avant 90 jours, et jamais une vidéo qui marche.
