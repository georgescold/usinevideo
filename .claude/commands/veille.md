---
description: Veille YouTube — scrape la niche via Apify, récupère miniatures, transcripts et stats, et en tire ce qui marche
argument-hint: [mots-clés, chaîne concurrente ou rien pour reprendre la config]
---

Lance une veille YouTube sur la niche.

Invoque la skill `veille-youtube`.

Cible demandée : $ARGUMENTS

Si aucun argument, déduis les requêtes de `config/chaine.json` et de `marque/Fiche-Produit.md`.
Regarde d'abord ce qui est déjà dans `veille/youtube/` : on ne re-scrape pas ce qu'on a déjà.
Annonce le coût estimé avant de lancer, et respecte le seuil de 100 vidéos sans validation.
