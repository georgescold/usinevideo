---
description: Monte la vidéo — transcription, coupe des silences, voix ElevenLabs, sous-titres, B-roll, motion, rendu
argument-hint: <slug> [--voix=sts|brute] [--apercu]
---

Monte cette vidéo.

Invoque la skill `montage-video`.

Vidéo : $ARGUMENTS

Enchaîne : ingestion des rushes → transcription locale mot à mot → détection des silences
et des ratés → validation du plan de coupe avec l'utilisateur → speech-to-speech si demandé
→ construction du plan de montage → aperçu → rendu.

Ne rends jamais sans avoir montré le plan de montage. Annonce le coût ElevenLabs avant
de synthétiser.
