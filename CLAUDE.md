# CLAUDE.md — cerveau de la chaîne

> Ce fichier est lu à chaque conversation. Il dit **ce qu'est ce dossier**, **ce que tu as le droit de faire**, et **dans quel ordre**. Tout le reste en découle.

---

## 1. Ce qu'est ce dossier

**Un dossier = une chaîne = un avatar = un segment marketing = un produit.**

Ce dossier est un **template réplicable**. On le copie pour lancer une nouvelle chaîne, on l'initialise une fois, et il devient l'usine à contenu d'une seule marque. Deux produits différents ⇒ deux dossiers différents. Jamais de mélange.

**Langue de travail et de production : le français.** Tu réponds en français, tu écris les scripts en français, tu documentes en français.

## 2. Règle d'or

**Tout se pilote dans la conversation Claude Code. Aucun frontend, jamais.**

Pas de serveur web, pas d'interface Streamlit, pas de dashboard, pas d'app Electron. L'utilisateur discute, tu produis des fichiers et des MP4. Si une étape demande une interface, c'est que l'étape est mal conçue — reprends-la en ligne de commande ou en conversation.

Seule exception tolérée : `npx remotion studio`, l'aperçu de montage, que l'utilisateur ouvre lui-même pour scruber une timeline avant de payer un rendu. C'est un outil de contrôle, pas une interface de pilotage.

## 3. Le pipeline

Huit étapes. Chacune a une commande, une skill, et un dossier de sortie. On ne saute pas une étape : chacune lit ce que la précédente a écrit.

| # | Étape | Commande | Écrit dans |
|---|---|---|---|
| 0 | **Initialiser la chaîne** — brief produit, avatar, marketeur, identité visuelle | `/init-chaine` | `marque/`, `config/chaine.json` |
| 1 | **Veille YouTube** — ce qui marche dans la niche : miniatures, titres, transcripts, perf | `/veille` | `veille/youtube/` |
| 2 | **Décoder TikTok** — l'utilisateur colle des liens, on extrait stats + texte + pourquoi ça a marché | `/decode` | `veille/tiktok/` |
| 3 | **Stratégie** — mots-clés par intention, matrice d'angles, architecture de chaîne, maillage interne, calendrier | `/plan` | `strategie/` |
| 4 | **Écrire** — un script par vidéo, dans le format retenu | `/script` | `videos/<slug>/01-script.md` |
| 5 | **Brief de tournage** — prompteur, découpage, consignes de prise | `/tournage` | `videos/<slug>/02-tournage/` |
| 6 | **Monter** — transcription, coupe, voix, sous-titres, B-roll, motion, rendu | `/monte` | `videos/<slug>/06-rendu/` |
| 7 | **Publier** — titre, description, tags, chapitres, miniature, maillage interne | `/publie` | `videos/<slug>/07-publication.md` |
| 8 | **Bilan** — perf à J+7 / J+28, ce qu'on double, ce qu'on tue | `/bilan` | `perf/` |

L'ordre normal est 0 → 1 → 2 → 3 puis une boucle 4 → 5 → 6 → 7 → 8 par vidéo. La boucle réalimente l'étape 3.

## 4. Carte du dossier

```
config/          chaine.json (identité), keys.json (secrets, jamais versionné)
marque/          fiche produit, avatars, hook bank, marketeur, DA, ligne éditoriale
veille/          youtube/ et tiktok/ — matière brute + synthèses
strategie/       mots-clés, matrice d'angles, architecture de chaîne, calendrier
videos/<slug>/   une vidéo = un dossier, numéroté de 00 à 07
assets/          polices, LUT, musique, B-roll, logos, SFX
pipeline/        le code exécutable (Node) — c'est lui qui fait le travail
remotion/        les compositions de montage
perf/            historique des performances
outils/          scripts utilitaires (autotest, nouvelle chaîne, import de clés)
.claude/         commandes et skills
```

Les binaires lourds (whisper, modèles) ne vivent **pas** ici : ils sont dans un cache partagé
entre toutes les chaînes, hors du dossier. Copier le dossier ne duplique pas trois gigaoctets.

## 5. Ce que tu fais toujours

1. **Tu lis `config/chaine.json` avant toute action de production.** Si `initialise` vaut `false`, tu proposes `/init-chaine` et tu n'inventes rien.
2. **Tu lis `marque/` avant d'écrire quoi que ce soit d'éditorial.** Un script écrit sans l'avatar sous les yeux est un script générique, donc un script mort.
3. **Tu t'appuies sur `veille/` avant de décider d'un angle ou d'un titre.** On ne devine pas ce qui marche : on l'a scrapé.
4. **Tu écris des fichiers, pas des réponses.** Un script, une stratégie, un plan de montage → un fichier dans le bon dossier. La conversation sert à décider, les fichiers à conserver.
5. **Tu vérifies après chaque changement de code** : `npm run verifie` (voir §8). Un pipeline qui ne tourne pas ne sert à rien.
6. **Tu nommes en `kebab-case-sans-accent`** les dossiers de vidéo et les fichiers générés. Le contenu, lui, est en français accentué.

## 6. Ce que tu ne fais jamais

- **Tu ne crées pas de frontend.** Voir §2.
- **Tu n'écris jamais une clé API en clair** dans un fichier versionné, un log, un commit ou une réponse. Les clés vivent dans `config/keys.json` et se lisent via `pipeline/lib/trousseau.mjs`. Dans les logs, on affiche `apify_…7Xqm`.
- **Tu ne publies rien tout seul.** Tu prépares le fichier de publication ; c'est l'utilisateur qui met en ligne. Aucun appel d'API de publication sans son accord explicite, à chaque fois.
- **Tu ne supprimes ni rush ni rendu** sans le lui demander. Un tournage ne se refait pas.
- **Tu ne lances pas d'appel payant sans annoncer le coût.** Apify, ElevenLabs et HeyGen coûtent. Tu annonces l'estimation (crédits, euros) et tu attends le feu vert au-delà des seuils de §7.
- **Tu ne re-scrapes pas ce qui est déjà dans `veille/`.** Tu regardes d'abord.
- **Tu ne codes pas en dur la niche, le produit ou l'avatar** dans `pipeline/` ou `remotion/`. Tout ce qui est spécifique à la chaîne vit dans `config/` et `marque/`. C'est ce qui rend le dossier réplicable.

## 7. Appels payants : les seuils

| Action | Sans demander | À faire valider |
|---|---|---|
| Veille YouTube (Apify) | ≤ 100 vidéos | au-delà |
| Décodage TikTok | ≤ 10 liens | au-delà |
| Speech-to-speech ElevenLabs | ≤ 5 min d'audio | au-delà |
| Rendu Remotion | toujours (c'est du CPU/GPU local, gratuit) | — |
| HeyGen | jamais | toujours |

Le trousseau tourne automatiquement entre les clés d'un même service. Si toutes les clés d'un service sont épuisées, tu le dis clairement au lieu d'échouer en silence.

## 8. Commandes du projet

```bash
npm run verifie              # environnement : outils, clés, quotas, modèles
npm run verifie -- --quotas  # interroge les quotas réels des API
npm run autotest             # fabrique une vidéo de test et vérifie toute la chaîne
npm run veille               # veille YouTube
npm run tiktok               # ingestion d'un lien TikTok
npm run transcris            # transcription locale mot à mot
npm run voix                 # remplacement du timbre (ElevenLabs)
npm run monte                # construit le plan de montage
npm run rends                # produit le MP4
npm run studio -- <slug>     # aperçu, pour contrôler avant de rendre
npm run importe-cles         # récupère les clés d'un ancien projet
npm run nouvelle-chaine      # copie le template pour une nouvelle chaîne
```

Chaque script accepte `--aide`.

## 9. Le montage : doctrine

Le montage n'illustre pas, il **soutient l'attention**. Trois règles qui priment sur le goût :

1. **Aucun temps mort.** Les silences > `COUPE_SILENCE_MIN` sautent, les ratés et répétitions aussi. Un plan qui ne dit rien n'existe pas.
2. **Un événement visuel toutes les 2 à 4 secondes** : coupe, punch-in, apparition d'un mot-clé, insert B-roll, infographie. Jamais deux fois le même effet de suite.
3. **L'effet illustre le propos ou il dégage.** Une transition qui ne marque pas un changement de sujet est du bruit. Une infographie qui ne rend pas un chiffre plus clair est une décoration.

Les sous-titres sont **calés mot à mot** sur l'audio, jamais approximés. Le détail des styles vit dans `marque/identite-visuelle.md` et les skills de montage.

## 10. Skills

Les skills dans `.claude/skills/` portent le savoir-faire détaillé. Tu les invoques par leur nom quand la tâche correspond. Les principales :

| Skill | Ce qu'elle porte |
|---|---|
| `init-chaine` | l'entretien d'initialisation, du socle marque au premier calendrier |
| `veille-youtube` | scraping Apify, scoring de performance, lecture des miniatures |
| `decodage-tiktok` | ingestion d'un lien, transcript, autopsie de la performance |
| `strategie-contenu` | intentions de recherche, matrice d'angles, hubs et maillage interne |
| `ecriture-script` | écriture long format et short, et le contrat avec le montage |
| `brief-tournage` | prompteur, découpage en prises, consignes de son et de cadre |
| `montage-video` | la chaîne complète, des rushes au rendu |
| `publication-seo` | titre, miniature, description, chapitres, maillage |
| `bilan-performance` | lecture des chiffres, verdicts par angle et par format |

Deux fichiers de référence portent les règles chiffrées, à lire quand elles s'appliquent :
`strategie-contenu/references/seo-youtube.md` et `montage-video/references/doctrine-mouvement.md`.

Le socle marketing lui-même est produit par la skill **`avatars-et-produit`**, qui vit hors de
ce dossier. `init-chaine` la délègue plutôt que de la réécrire.

## 11. Après chaque modification du code

```bash
npm run verifie
```

Et si tu as touché à `remotion/` : rends 3 secondes de test avant d'annoncer que ça marche.
