# Usine à contenu

**Un dossier = une chaîne = un avatar = un segment = un produit.**

Ce dossier est un template. On le copie pour lancer une nouvelle chaîne, on l'initialise une fois, et il devient l'usine à contenu d'une seule marque. Deux produits, deux dossiers.

Tout se pilote **dans la conversation Claude Code**. Il n'y a pas d'interface, et il n'y en aura pas.

---

## Ce que ça fait

| Étape | Commande | Ce qui se passe |
|---|---|---|
| Initialiser | `/init-chaine` | Fiche produit, avatars, hook bank, marketeur, puis veille, puis direction artistique et formats |
| Voir la niche | `/veille` | Scrape YouTube : titres, miniatures, transcripts, vues, abonnés — et ce qu'il faut en retenir |
| Décoder | `/decode <lien>` | Un TikTok ou un Reel : stats, transcript, et pourquoi ça a marché |
| Planifier | `/plan` | Mots-clés par intention, angles à tester, hubs, maillage interne, calendrier |
| Écrire | `/script <sujet>` | Un script dit mot pour mot, plus sa version machine qui pilotera le montage |
| Tourner | `/tournage <slug>` | Prompteur découpé en prises, plans de coupe à filmer, consignes de son et de cadre |
| Monter | `/monte <slug>` | Coupe des silences, remplacement du timbre, sous-titres mot à mot, B-roll, infographies, rendu |
| Publier | `/publie <slug>` | Titres, miniature, description, chapitres, playlist, fiches et écran de fin |
| Décider | `/bilan` | Ce qu'on double, ce qu'on corrige, ce qu'on abandonne |

---

## Démarrer

```bash
npm install
npm run verifie
```

`verifie` dit ce qui manque et comment le corriger. Puis, dans Claude Code :

```
/init-chaine
```

Compter une à deux heures. C'est le seul moment où le dossier prend du temps ; ensuite il produit.

### Vérifier que tout marche vraiment

```bash
npm run autotest
```

Fabrique une vidéo de test, la monte, la rend, contrôle le résultat et nettoie. Aucun appel payant, aucune clé nécessaire. À lancer après chaque copie du dossier sur une nouvelle machine.

---

## Les clés

Elles vivent dans `config/keys.json`, **jamais versionné**. Chaque service accepte **plusieurs clés** : la stack tourne entre elles toute seule et met au frigo celles qui sont épuisées.

```bash
cp config/keys.example.json config/keys.json    # puis remplir
npm run verifie -- --quotas                     # état réel de chaque clé
```

| Service | Nécessaire pour | Sans lui |
|---|---|---|
| **Apify** | veille YouTube, repli TikTok | pas de veille |
| **ElevenLabs** | remplacement du timbre de voix | la voix brute marche très bien |
| **Pexels** | B-roll automatique | les plans de coupe demandés sont retirés |

Le palier gratuit d'ElevenLabs **n'accorde aucune licence commerciale**. Le trousseau prend toujours une clé payante en priorité quand il y en a une.

Pour récupérer les clés d'un ancien projet :

```bash
npm run importe-cles -- "C:\chemin\vers\ancien-projet"
```

---

## Lancer une deuxième chaîne

```bash
npm run nouvelle-chaine -- "C:\Users\moi\Desktop\Ma seconde chaine"
```

Copie le code, les skills, la structure et les polices. **Ne copie ni les vidéos, ni la veille, ni le socle marque** : une chaîne ne doit rien hériter d'une autre. Les binaires et les modèles restent partagés — rien à retélécharger.

---

## Le dossier

```
config/          chaine.json (l'identité), keys.json (les secrets)
marque/          fiche produit, avatars, hook bank, marketeur, DA, ligne éditoriale
veille/          ce qui a été scrapé, et la synthèse qu'on en tire
strategie/       mots-clés, angles, architecture de chaîne, calendrier
videos/<slug>/   une vidéo = un dossier, numéroté de 00 à 07
assets/          polices, LUT, musique, B-roll, logos
pipeline/        le code qui fait le travail
remotion/        les compositions de montage
perf/            l'historique des performances
.claude/         commandes et skills
```

Une vidéo, de gauche à droite :

```
00-brief.md   01-script.md/.json   02-tournage/   03-audio/
04-transcript.json   05-montage/   06-rendu/   07-publication.md
```

---

## Ce que la machine fait, et ce qu'elle ne fait pas

**Elle fait** : scraper, transcrire mot à mot, détecter les silences, couper, remplacer le timbre, caler les sous-titres à la milliseconde, chercher le B-roll, animer les infographies, étalonner, encoder.

**Elle ne fait pas** : décider d'un angle, écrire un hook qui déclenche, choisir ce qui mérite une infographie, juger si une prise est bonne. Et elle ne publie rien : elle prépare, tu mets en ligne.

---

## Comment ça marche, techniquement

La voix off est enregistrée par toi. Le pipeline retire les silences, envoie l'audio coupé à ElevenLabs pour n'en changer que le **timbre** — l'intonation et le rythme restent les tiens — puis transcrit **ce fichier-là** en local avec whisper.cpp pour obtenir les temps de chaque mot.

ffmpeg monte la piste image (coupe, recolle, met à la définition finale). Remotion pose par-dessus les sous-titres, le B-roll, les infographies et les effets. Une seconde passe ffmpeg applique la LUT, normalise le son à −14 LUFS et encode avec la carte graphique.

Toutes les positions sont calculées une fois pour toutes côté pipeline, à partir de la transcription réelle. Le rendu ne peut pas les désynchroniser.

**Rien ne sort de ta machine, sauf** : les requêtes de veille (Apify), l'audio à convertir (ElevenLabs) et les recherches de B-roll (Pexels).

---

## Les commandes

```bash
npm run verifie          # ce qui manque, et comment le corriger
npm run verifie -- --quotas   # état réel des clés
npm run autotest         # la chaîne complète fonctionne-t-elle ?
npm run veille -- "..."  # veille YouTube
npm run tiktok -- <url>  # décoder un TikTok
npm run transcris -- <slug>
npm run voix -- <slug>   # remplacer le timbre
npm run monte -- <slug>  # construire le plan de montage
npm run rends -- <slug>  # produire le MP4
npm run studio -- <slug> # aperçu, pour contrôler avant de rendre
```

Chaque commande accepte `--aide`.

---

## Ce qu'il faut sur la machine

Node 20 ou plus, ffmpeg, et de la place. `yt-dlp` rend le décodage TikTok gratuit ; sans lui il passe par Apify et devient payant.

whisper.cpp et son modèle se téléchargent tout seuls au premier usage, dans un cache **partagé entre toutes les chaînes**. Avec une carte NVIDIA, `WHISPER_GPU=true` dans `.env` accélère la transcription d'environ 20 fois — mesuré sur RTX 3060 : 60 s d'audio en 3 s (670 Mo à télécharger une fois).
