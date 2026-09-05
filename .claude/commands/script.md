---
description: Écrit le script d'une vidéo — un seul script à la fois, dans le format retenu
argument-hint: <sujet ou slug> [--format=long-face|long-faceless|long-screencast|short-face|short-faceless]
---

Écris le script de cette vidéo.

Invoque la skill `ecriture-script`.

Demande : $ARGUMENTS

Un script à la fois, jamais un lot sans que l'utilisateur l'ait demandé explicitement.
Avant d'écrire : lis `marque/`, la ligne du calendrier concernée dans `strategie/calendrier.md`,
et les transcripts de veille pertinents.

Sortie : `videos/<slug>/00-brief.md` puis `videos/<slug>/01-script.md` et `01-script.json`.
Termine en proposant le brief de tournage (`/tournage <slug>`).
