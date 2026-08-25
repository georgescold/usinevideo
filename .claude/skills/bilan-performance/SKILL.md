---
name: bilan-performance
description: Fait le bilan des performances d'une chaîne ou d'une vidéo — lit les six métriques qui comptent en rapport à la médiane de la chaîne, tranche par angle et par format (doubler, corriger, abandonner), et reporte les verdicts dans la stratégie. Utilise cette skill quand l'utilisateur veut analyser ses résultats, savoir si une vidéo a marché, décider quoi produire ensuite, ou mentionne : bilan, résultats, performances, statistiques, ça a marché ou pas, taux de clic, rétention, analytics, combien de vues, quoi faire ensuite. Déclencheurs — "/bilan", "voilà mes stats", "est-ce que ça a marché", "je fais quoi maintenant", "cette vidéo a fait X vues". Toujours répondre en français.
---

# Bilan de performance

Une vidéo ne se juge pas dans l'absolu. Elle se juge **par rapport à la médiane de la chaîne, sur la même source de trafic**. « 4 % de taux de clic » ne veut rien dire ; « 0,6 fois la médiane en trafic de recherche » veut dire quelque chose.

**Lis `../strategie-contenu/references/seo-youtube.md`** — les seuils y sont. Cette skill dit comment les appliquer et quoi en faire.

---

## 1. Récupérer les chiffres

YouTube Studio n'a pas d'accès en lecture depuis ce dossier. Demande à l'utilisateur, dans **YouTube Studio → Analytics → Avancé**, en filtrant **par source de trafic** :

| Métrique | Où |
|---|---|
| Impressions | Portée |
| Taux de clic des impressions | Portée |
| Durée moyenne de visionnage **en pourcentage** | Engagement |
| Abonnés gagnés | Audience |
| Clics sortants | Engagement, si des liens existent |
| Part du trafic venant de la recherche | Sources de trafic |

**Six métriques, aucune autre.** Les vues n'en font pas partie : elles sont un résultat, pas un diagnostic.

**La segmentation par source de trafic n'est pas optionnelle.** Le taux de clic depuis l'accueil mesure l'attrait à froid ; depuis les abonnements, la fidélité ; depuis la recherche, l'adéquation entre la promesse et la requête. Les mélanger produit une moyenne qui ne décrit aucune réalité.

Range ce qu'il donne dans `perf/historique.json` : slug, date de publication, âge en jours, source de trafic, les six métriques. Sans historique, il n'y a pas de médiane, donc pas de bilan possible — dis-le au premier appel.

---

## 2. Calculer les rapports

Pour chaque métrique : `valeur / médiane des 28 derniers jours de la chaîne, même source de trafic`.

Sur une chaîne neuve (moins de six vidéos), il n'y a pas encore de médiane fiable. Dis-le franchement plutôt que de produire un verdict qui n'en est pas un : à ce stade, on regarde les **tendances** (est-ce que ça monte ?) et la **rétention absolue** comparée aux repères de durée, rien de plus.

---

## 3. Lire, selon l'échéance

**Chaque échéance ne répond qu'à une question.** Lire le sujet à 7 jours ou l'emballage à 28 conduit à des décisions fausses.

| Échéance | Question | Ce qu'on en fait |
|---|---|---|
| **48 h** | Y a-t-il un incident ? | Taux de clic sous 3 % ou rétention sous la bande habituelle → la distribution est coupée. On note, on ne corrige pas encore. |
| **7 jours** | L'**emballage** fonctionne-t-il ? | Titre et miniature. |
| **28 jours** | Le **sujet** et l'**intention** portent-ils ? | La position se stabilise 2 à 4 semaines après la mise en ligne. |
| **90 jours** | Quelle valeur d'actif ? | L'âge médian d'une vidéo bien classée est d'environ 29 mois. **On ne retitre ni ne dépublie avant 90 jours.** |

### Verdict à 7 jours

| Condition | Verdict | Action |
|---|---|---|
| `impressions_r < 0,5` | Ne rien conclure | Distribution en recherche seule. Attendre 28 jours. |
| `ctr_r < 0,8` | Problème d'emballage | Test comparatif, trois variantes très différentes. **Ne pas toucher au contenu.** |
| `ctr_r ≥ 0,8` et `retention_r < 0,8` | Promesse non tenue | Corriger le hook et la première minute **sur les prochaines vidéos**. **Ne pas toucher à l'emballage.** |
| `ctr_r ≥ 1,2` et `retention_r ≥ 1,2` | Doubler | 3 à 5 satellites sur cet angle, sous 21 jours. |

### Verdict à 28 jours

| Condition | Ce que ça veut dire |
|---|---|
| part de trafic en recherche ≥ 30 % | L'angle capte de la recherche : industrialiser en hub complet. |
| position moyenne ≤ 3 sur le mot-clé | Construire le pilier sur cet angle. |
| plus de 5 abonnés pour 1 000 vues | Angle qualifiant : il attire les bonnes personnes. |
| clics produit ≥ 1,2 fois la médiane | Prioriser, **même si les vues sont moyennes**. C'est le chiffre qui paie. |

---

## 4. Trancher par angle, pas par vidéo

C'est le point que tout le monde rate. **Aucun verdict sur une seule vidéo.** Il faut au moins deux vidéos par angle, et la règle d'abandon en demande trois.

Pour chaque angle de `strategie/matrice-angles.md`, regroupe ses vidéos et regarde la tendance :

- **Doubler** : deux vidéos au-dessus de 1,2 sur les deux métriques → 3 à 5 satellites sous 21 jours, et le pilier si la position le justifie.
- **Corriger** : le problème est identifié et localisé (emballage ou promesse) → une nouvelle vidéo qui corrige uniquement ce point, le reste constant.
- **Abandonner** : **trois vidéos consécutives** sous 0,8 sur le taux de clic **et** la rétention, **simultanément**, **et** après qu'un test comparatif ait été mené. Abandonner sur un seul échec est une erreur de lecture, pas une décision.

Fais la même lecture par **format** : si les shorts font 0,3 fois la médiane de la chaîne sur trois vidéos, ce n'est pas le sujet qui est en cause, c'est le format — ou la façon dont on le traite.

**Rappel pour les Shorts** : le taux de clic n'existe pas, il n'y a pas de miniature dans le fil. Ne le fais jamais figurer dans un bilan de Shorts. Ce qui compte : le rapport entre ceux qui passent et ceux qui regardent, les relectures, les partages.

---

## 5. Écrire les conséquences

Un bilan qui ne modifie aucun fichier n'a servi à rien.

- `strategie/matrice-angles.md` : état de chaque angle mis à jour, avec la date et le chiffre qui a motivé le verdict.
- `strategie/calendrier.md` : les satellites des angles doublés ajoutés, les vidéos des angles abandonnés retirées.
- `strategie/mots-cles.md` : position réelle constatée, statut mis à jour.
- `perf/historique.json` : les relevés.
- `marque/ligne-editoriale.md` : si un format est abandonné ou activé.

Et note **ce qu'on a appris**, pas seulement ce qu'on a décidé. « Les titres qui posent une question font 1,4 fois la médiane en taux de clic sur cette chaîne » vaut plus que trois verdicts.

---

## Ce qu'il faut refuser de faire

- **Conclure sur une vidéo.** Deux minimum, trois pour abandonner.
- **Comparer à un repère externe.** « La moyenne de la plateforme est à 4 % » ne dit rien de cette chaîne.
- **Mélanger les sources de trafic.** Voir §1.
- **Retitrer une vidéo de moins de 90 jours** qui n'a pas de problème d'emballage avéré.
- **Toucher à une vidéo intemporelle qui se classe bien.** Son âge est un actif.
- **Corriger l'emballage et le contenu en même temps.** On ne saura pas lequel a agi, et le test suivant sera aveugle.
- **Lire les vues.** Elles ne sont pas un facteur de classement et ne diagnostiquent rien.

---

## Si l'utilisateur n'a pas de chiffres

Ne fabrique rien. Dis ce qu'il faut relever, où, et propose de refaire le bilan quand il les aura. En attendant, tu peux vérifier ce qui est vérifiable sans données : la conformité des titres, des miniatures et du maillage aux règles de la doctrine. C'est souvent là que se trouve le problème.
