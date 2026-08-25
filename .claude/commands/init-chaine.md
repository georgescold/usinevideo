---
description: Initialise la chaîne — brief produit, avatars, marketeur, puis direction artistique et formats après la veille
argument-hint: [nom du projet ou rien]
---

Initialise cette chaîne de bout en bout.

Invoque la skill `init-chaine` et suis-la sans sauter d'étape. Elle enchaîne :
socle marketing (via la skill `avatars-et-produit`) → veille → direction artistique
et formats → architecture de chaîne → premier calendrier.

Argument éventuel (nom du projet, produit, URL) : $ARGUMENTS

Si `config/chaine.json` porte déjà `"initialise": true`, ne recommence pas :
demande d'abord à l'utilisateur ce qu'il veut reprendre.
