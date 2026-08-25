# Ligne éditoriale — <!-- NOM DE LA CHAÎNE -->

> **État : à remplir.** Écrit par `/init-chaine`, **après** la veille. Les formats ne se choisissent pas à l'avance : ils se déduisent de ce qui fonctionne dans la niche, croisé avec ce que l'avatar supporte.

Rappel du contexte en une ligne : *<!-- « Chaîne qui parle à Y de Z, pour amener vers le produit X. » -->*

---

## 1. La promesse de la chaîne

Une phrase que le spectateur doit pouvoir répéter à quelqu'un d'autre. Si elle contient « et aussi », elle est trop large.

> *<!-- « Ici, on <verbe> pour <qui>, sans <la douleur>. » -->*

**Ce que la chaîne n'est pas** — les trois sujets voisins qu'on refuse, même s'ils feraient des vues. Une chaîne qui parle de tout ne ranke sur rien.

---

## 2. Les piliers

Trois à cinq piliers, pas plus. Un pilier est un **territoire de sujets**, pas un sujet. Chacun porte une vidéo pilier et ses satellites (voir `strategie/architecture-chaine.md`).

| Pilier | Ce qu'il couvre | Avatar visé | Niveau de conscience dominant | Playlist |
|---|---|---|---|---|
| 1. | | | | |
| 2. | | | | |
| 3. | | | | |

**Règle de couverture :** chaque problème majeur de `Fiche-Produit.md` tombe dans au moins un pilier. Un pilier qui ne mène à aucun problème produit est un pilier de vanité — il fait des vues et zéro client.

---

## 3. Les formats retenus

Cochés par `/init-chaine` d'après la veille, et reportés dans `config/chaine.json` → `formats`.

| Format | Actif | Durée cible | À quoi il sert | Cadence |
|---|---|---|---|---|
| Long face caméra | ☐ | | autorité, conversion, sujets qui demandent qu'on croie l'émetteur | /sem |
| Long faceless (voix off + B-roll) | ☐ | | volume SEO, sujets factuels, comparatifs | /sem |
| Long screencast / démo | ☐ | | tutoriels, preuves d'usage, « comment faire » | /sem |
| Long avatar de synthèse | ☐ | | volume quand le visage compte peu | /sem |
| Short face caméra | ☐ | | opinion, prise de position, tête de série | /sem |
| Short faceless | ☐ | | volume, chiffres, listes | /sem |
| Short avatar | ☐ | | volume sans tournage | /sem |

**Un format ne s'active pas parce qu'il est possible.** Il s'active parce que la veille montre qu'il performe dans cette niche, ou parce qu'il porte un pilier qu'aucun autre format ne peut porter.

---

## 4. La voix à l'écran

Reprise de `Le-Marketeur.md`, ramenée à ce qui se joue en vidéo.

- **Posture** : <!-- celui qui sait et qui tranche | l'insider qui montre | le praticien qui démontre -->
- **Rythme de parole** : <!-- dense et rapide | posé avec des silences marqués -->
- **Ce qu'il dit toujours** : ses formules signature, reprises telles quelles.
- **Ce qu'il ne dirait jamais** : les mots qui cassent sa crédibilité. Un agent qui écrit un script doit pouvoir s'y référer et s'autocensurer.
- **Tutoiement / vouvoiement** : <!-- choisir, et ne plus en changer -->
- **L'ennemi** : le statu quo, la croyance ou l'industrie qu'on attaque. Jamais une personne.

---

## 5. Structure d'un long format

| Moment | Durée | Ce qui s'y passe |
|---|---|---|
| Hook | 0–8 s | La tension, posée. Pas de bonjour, pas de logo, pas de « dans cette vidéo ». |
| Promesse | 8–20 s | Ce que le spectateur saura à la fin, et pourquoi c'est lui que ça concerne. |
| Légitimité | 20–35 s | Une phrase, pas un CV. Pourquoi c'est toi qui le dis. |
| Corps | | Trois à cinq blocs. Chaque bloc : une idée, une preuve, une conséquence. |
| Relance | milieu | Une raison de rester, placée là où la courbe de rétention décroche. |
| Chute | fin −40 s | Ce qu'il fait maintenant. Une seule action. |
| Écran de fin | 20 dernières s | Deux vidéos suggérées, choisies pour le maillage (voir `strategie/`). |

**Interdits :** l'intro qui s'excuse, le « avant de commencer », l'appel à l'abonnement dans les 30 premières secondes, l'annonce d'un plan qu'on ne suivra pas.

---

## 6. Structure d'un short

| Moment | Durée | Ce qui s'y passe |
|---|---|---|
| Hook | 0–1,5 s | Une image ou une phrase qui arrête le pouce. Le sujet est déjà visible. |
| Tension | 1,5–5 s | Pourquoi c'est un problème, pour lui. |
| Corps | 5 s–fin −5 s | Une seule idée. Une. |
| Chute | 5 dernières s | Une phrase qui referme, ou qui rouvre pour la boucle. |

**Un short = un angle = un niveau de conscience.** Deux idées dans un short, c'est zéro idée retenue.

---

## 7. Le test d'angles

Un angle est une manière d'attaquer un même sujet. On ne devine pas lequel marche : on en sort plusieurs et on regarde.

- **Par pilier**, sortir au moins <!-- 4 --> angles distincts avant de conclure quoi que ce soit.
- Un angle se juge à <!-- 7 --> jours sur les shorts, à <!-- 28 --> jours sur le long format.
- Les seuils de décision (doubler / ajuster / tuer) vivent dans `strategie/matrice-angles.md`, et `/bilan` les applique.

---

## 8. Ce qu'on ne publie jamais

- Une vidéo sans mot-clé cible identifié.
- Une vidéo qui ne renvoie vers aucune autre vidéo de la chaîne.
- Une promesse dans le titre que la vidéo ne tient pas — c'est le meilleur moyen de tuer une chaîne durablement.
- Une affirmation chiffrée sans source vérifiée.
- Un contenu qui rabaisse une personne ou un groupe. On tape sur les croyances et le statu quo, jamais sur les gens.
