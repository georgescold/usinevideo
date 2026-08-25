---
name: veille-youtube
description: Scrape la niche sur YouTube via Apify — titres, miniatures, transcripts, vues, abonnés — puis en tire ce qui fonctionne réellement : formats dominants, codes de miniature, angles saturés, trous à exploiter. Utilise cette skill quand l'utilisateur veut analyser la concurrence, voir ce qui marche dans une niche, chercher des idées de sujets, comprendre pourquoi une vidéo cartonne, ou mentionne : veille, concurrence, concurrents, scraper YouTube, analyser la niche, ce qui marche, benchmark, miniatures des autres, transcripts. Déclencheurs — "/veille", "regarde ce que font les concurrents", "analyse la niche X", "trouve-moi des sujets qui marchent", "scrape cette chaîne". Toujours répondre en français.
---

# Veille YouTube

On ne devine pas ce qui marche : on le regarde. Cette skill rapatrie la matière brute d'une niche et en tire des décisions.

Elle sert trois questions, et seulement celles-là :

1. **Quels sujets sortent** — et à quel niveau de performance.
2. **Comment ils sont emballés** — titre, miniature, format, durée, structure d'ouverture.
3. **Où sont les trous** — les requêtes à intention claire dont les meilleurs résultats sont médiocres.

---

## Avant de lancer

1. **Regarde ce qu'on a déjà.** `veille/youtube/index.json` liste tout ce qui est en base. Une vidéo déjà scrapée est déjà payée : on ne la reprend pas.
2. **Construis les requêtes à partir du socle, pas de ton intuition.**
   - le vocabulaire client réel de `marque/Fiche-Produit.md` — ce sont les mots que les gens tapent ;
   - les problèmes résolus, reformulés en recherche : « comment… », « pourquoi… », « meilleur… », « erreur… », « X vs Y », « prix… » ;
   - les mots exacts de chaque avatar dans `marque/Fiche-Avatars.md`.
   - Couvre les quatre intentions (voir `references/seo-youtube.md` §3), pas seulement l'informationnelle.
3. **Demande à l'utilisateur les chaînes concurrentes qu'il connaît.** Deux bonnes chaînes valent mieux que dix requêtes : on les scrape par URL, ce qui donne leur catalogue complet plutôt qu'un échantillon.
4. **Annonce le coût.** 0,004 $ par vidéo, transcript inclus. 60 vidéos ≈ 0,24 $. Au-delà de 100 vidéos, demande l'accord explicite.

---

## Lancer

```bash
npm run veille -- "prix site vitrine" "erreur site vitrine" "meilleur cms 2026" --par-requete=20
```

Options utiles :

| Option | Quand |
|---|---|
| `--fraicheur=month` | sujet qui bouge vite ; `year` par défaut |
| `--tri=views` | pour voir les plafonds de la niche plutôt que la pertinence |
| `--duree=plus20` | isoler les formats longs |
| `--shorts` | inclure les formats courts |
| `--urls=a,b,c` | détailler des vidéos précises |

Le pipeline écrit `veille/youtube/raw/<id>.json`, `transcripts/<id>.txt`, `miniatures/<id>.jpg`, et met à jour `index.json`.

---

## Lire les résultats

### Le score

`score = log10(vues) × (vues / abonnés) × décroissance selon l'âge`

Il ne récompense pas le volume mais le **débordement** : une vidéo qui fait bien plus de vues que la chaîne n'a d'abonnés a trouvé quelque chose. Le logarithme empêche une chaîne de 30 abonnés de dominer le classement avec 400 vues ; la décroissance sur 90 jours donne le pas à ce qui marche maintenant.

Une vidéo sans données de vues ou d'abonnés a un score de zéro — pas de donnée, pas de signal.

**Repères :** un rapport vues/abonnés supérieur à 3 est un vrai débordement. Au-dessus de 20, il faut comprendre pourquoi, en détail.

### Les miniatures

Ouvre les images du haut du classement, en lot, et cherche ce qui est **commun** :

- visage ou pas ; si oui, quelle part du cadre, quel regard, quelle émotion ;
- combien de mots de texte, quelle graisse, quelle couleur ;
- fond uni, flou, ou scène ;
- ce que la miniature promet que le titre ne dit pas.

Ce que tu cherches, ce n'est pas quoi copier — c'est **le code commun de la niche**, pour savoir ce qui trancherait au scroll.

### Les transcripts

Ils sont dans `veille/youtube/transcripts/`. Pour les cinq meilleures vidéos, lis **les 45 premières secondes** et note :

- la mécanique du hook (voir la liste dans `ecriture-script`) ;
- combien de temps avant d'annoncer la promesse ;
- s'il y a une preuve de légitimité, et laquelle ;
- ce qui est promis, et si la suite le tient.

Pour le corps, ne lis pas tout : cherche la **structure** (combien de blocs, quel enchaînement) et les **chiffres cités** — ils indiquent où sont les sources de la niche.

### Les titres

Relève les patrons qui reviennent et leur fréquence. Compare à ceux autorisés dans `references/seo-youtube.md` §5. Un patron sur-représenté dans la niche est un patron dont on peut sortir pour trancher — ou qu'il faut suivre parce que c'est ce que l'audience attend. Les deux sont défendables ; c'est un choix à expliciter.

---

## Écrire la synthèse

Dans `veille/synthese.md`, court et tranché. Personne ne relira dix pages.

- **Les formats qui dominent** : long ou court, face caméra ou faceless, durées médianes constatées.
- **Les codes visuels** : ce que font toutes les miniatures qui marchent, ce que font tous les montages.
- **Les angles saturés** : ce que tout le monde dit déjà. On n'y va pas, ou on y va à contre-courant — et alors on le dit.
- **Les trous** : requêtes à intention claire dont les meilleurs résultats sont médiocres, anciens ou hors sujet. Ce sont les premières vidéos à faire.
- **Le plafond réaliste** : ce que font les bonnes vidéos de cette niche. Sert à calibrer les attentes et les seuils de `/bilan`.
- **Ce qu'on ne sait toujours pas** — les questions que la veille n'a pas tranchées.

Chaque affirmation s'appuie sur des identifiants de vidéos. Une synthèse sans référence est une opinion.

---

## Erreurs à ne pas commettre

- **Re-scraper la même niche chaque semaine.** La niche ne bouge pas si vite. Une veille de fond au démarrage, puis des veilles ciblées avant chaque nouveau hub.
- **Confondre volume et signal.** Une chaîne à un million d'abonnés qui fait 300 000 vues est en sous-performance. C'est le rapport qui parle.
- **Copier un angle qui marche chez un concurrent installé.** Son autorité de chaîne fait la moitié du travail. Sur une chaîne neuve, le même angle ne donnera pas le même résultat.
- **Lire les transcripts en entier.** Les 45 premières secondes et la structure suffisent, et coûtent dix fois moins de temps.
- **Oublier de persister.** Les données Apify ne sont conservées que sept jours au palier gratuit. Le pipeline écrit tout de suite ; ne le court-circuite pas.

---

## Si les clés sont épuisées

Le trousseau bascule tout seul entre les dix-sept clés. S'il les a toutes épuisées, il le dit clairement. Options, dans l'ordre :

1. `npm run verifie -- --quotas` pour voir l'état réel de chaque clé ;
2. attendre la remise à zéro mensuelle (chaque clé a son propre cycle) ;
3. réduire `--par-requete` et cibler mieux les requêtes.

Ne jamais contourner en scrapant à la main : le format de sortie ne serait pas le même et le reste du pipeline ne saurait pas le lire.
