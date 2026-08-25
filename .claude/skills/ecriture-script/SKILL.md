---
name: ecriture-script
description: Écrit le script d'une vidéo YouTube longue ou d'un short TikTok/Reels/Shorts, à partir du socle marque, de la veille et du calendrier. Produit un script dit mot pour mot, prêt à lire au prompteur, plus sa version machine qui pilotera le montage. Utilise cette skill quand l'utilisateur veut écrire, réécrire ou durcir un script, quand il donne un sujet de vidéo, ou quand il mentionne : script, écris-moi une vidéo, texte de la vidéo, prompteur, hook, accroche, réécris le script, raccourcis. Déclencheurs — "/script", "écris-moi une vidéo sur X", "fais-moi un short sur Y", "le hook est mou", "réécris l'intro". Toujours répondre en français.
---

# Écrire un script

Un script est du **texte destiné à être dit**, pas lu. Il s'écrit à l'oreille : phrases courtes, verbes concrets, aucune subordonnée qu'on ne peut pas prononcer d'une traite. S'il faut le relire pour le comprendre, il est raté.

**Un script à la fois.** Un lot ne se produit que si l'utilisateur le demande explicitement, et jamais avant que le premier script du format ait été monté et publié — on ne duplique pas un format qu'on n'a pas encore validé.

---

## Ce que tu lis avant d'écrire

Dans cet ordre, sans en sauter :

1. `config/chaine.json` — format actif, durées cibles, avatar général.
2. `marque/Fiche-Avatars.md` — l'avatar visé, **et surtout son vocabulaire propre**. Le script doit sonner comme lui.
3. `marque/Hook-Bank.md` — l'angle et le hook s'y trouvent peut-être déjà.
4. `marque/Le-Marketeur.md` — la posture, le lexique signature, les mots interdits.
5. `marque/ligne-editoriale.md` — la structure du format, les interdits.
6. `strategie/calendrier.md` — la ligne de cette vidéo : pilier, angle, mot-clé, maillage.
7. `veille/youtube/transcripts/` — les transcripts des vidéos qui rankent sur ce mot-clé. Tu regardes **comment elles ouvrent**, pas quoi copier.

Si `config/chaine.json` porte `initialise: false`, arrête-toi : propose `/init-chaine`.

---

## La règle qui prime sur tout

**Un script = un avatar + un niveau de conscience + un angle.**

Mélanger deux niveaux de conscience dans une vidéo, c'est parler à personne. Si l'avatar ne sait pas encore qu'il a le problème, le produit n'apparaît pas — même pas en fin de vidéo, même pas « discrètement ». Si l'avatar compare déjà des solutions, on peut être frontal dès la première minute.

Le niveau visé est écrit dans le brief, il ne se décide pas en cours d'écriture.

---

## Étape 1 — Le brief

Avant le script, écris `videos/<slug>/00-brief.md`. Court, une demi-page :

- **Le slug** — `kebab-case-sans-accent`, tiré du mot-clé cible, pas du titre.
- **Format et durée cible**.
- **Mot-clé cible et intention de recherche** (informative, commerciale, transactionnelle, navigationnelle).
- **Avatar visé, niveau de conscience, émotion dominante.**
- **L'angle en une phrase**, et l'ennemi qu'on attaque.
- **La promesse** — ce que le spectateur saura faire ou comprendre à la fin.
- **La preuve** — ce qui rend l'affirmation centrale crédible. Si tu n'en as pas, dis-le : c'est un problème de sujet, pas d'écriture.
- **Le maillage** — vers quelles vidéos existantes celle-ci pointe, et lesquelles pointeront vers elle.
- **La chute** — la seule action demandée.

Montre le brief à l'utilisateur et attends son accord. Corriger un angle coûte trente secondes ici et deux heures après le tournage.

---

## Étape 2 — Le hook

Le hook se travaille séparément, avant le reste, et on en écrit **cinq** avant d'en garder un.

Un hook ne sert qu'à une chose : **faire réagir**. S'il peut être lu sans provoquer la moindre réaction interne — « tiens, c'est pour moi », « c'est faux », « comment ça ? » — il est mort.

Mécaniques à faire tourner, jamais deux fois la même d'affilée sur la chaîne :

- la vérité qu'on n'ose pas dire ;
- l'erreur que tout le monde fait ;
- l'ennemi commun — un statu quo, une industrie, jamais une personne ;
- la promesse contre-intuitive ;
- le chiffre qui choque ;
- la question qui met face à soi ;
- le « si tu fais ça, arrête tout de suite ».

Contraintes dures :

- **Long format : 8 secondes maximum**, soit 20 à 25 mots. Le sujet est identifiable dès la première phrase.
- **Short : 1,5 seconde**, soit 5 à 8 mots. Et l'image dit déjà quelque chose.
- **Aucun bonjour, aucun logo, aucun « dans cette vidéo je vais vous ».**
- Le hook emploie **les mots de l'avatar**, pas les tiens.

Présente les cinq à l'utilisateur, dis lequel tu recommandes et pourquoi. Il tranche.

---

## Étape 3 — Le corps

### Long format

| Bloc | Durée | Ce qui s'y passe |
|---|---|---|
| `hook` | 0–8 s | La tension, posée. |
| `promesse` | 8–20 s | Ce qu'il saura à la fin, et pourquoi ça le concerne, lui. |
| `legitimite` | 20–35 s | Une phrase, pas un CV. |
| `corps-1..n` | le reste | Trois à cinq blocs. Un bloc = une idée + une preuve + une conséquence. |
| `relance` | au milieu | Une raison de rester, placée là où l'attention décroche. |
| `chute` | −40 s | Une seule action. |
| `sortie` | 20 dernières s | De quoi tenir l'écran de fin. |

Un bloc de corps qui ne tient pas en une phrase résumable n'est pas un bloc : c'est deux.

### Short

| Bloc | Durée | Ce qui s'y passe |
|---|---|---|
| `hook` | 0–1,5 s | Arrête le pouce. |
| `tension` | 1,5–5 s | Pourquoi c'est un problème pour lui. |
| `corps` | jusqu'à −5 s | **Une** idée. |
| `chute` | 5 dernières s | Referme, ou rouvre pour la boucle. |

### Ce qui vaut pour les deux

- **Une phrase = une idée.** Pas de « et par ailleurs ».
- **Le concret bat l'abstrait.** Un exemple, un chiffre, une scène. Jamais « il est important de ».
- **Les chiffres sont sourcés** ou ils sautent.
- **Les mots interdits du Marketeur** ne passent pas. Relis-les avant de rendre.
- **Densité** : viser 145 à 165 mots par minute en long format, 170 à 190 en short. Compte les mots et vérifie la durée estimée.
- **Marquer les silences voulus** par `[pause]` dans le texte. Tout silence non marqué sera coupé au montage.

---

## Étape 4 — Le visuel, bloc par bloc

Le script porte aussi ce qui s'affiche. C'est là que se joue la différence entre une vidéo qu'on regarde et une vidéo qu'on quitte.

Pour chaque bloc, prévois les événements visuels — **un toutes les 2 à 4 secondes**, jamais deux fois le même d'affilée :

| Type | Quand l'utiliser |
|---|---|
| `mot-cle` | un mot qui apparaît à l'écran parce qu'il porte l'idée |
| `chiffre` | un compteur, un pourcentage, un montant |
| `infographie` | une comparaison, une liste de trois, une chronologie, un avant/après |
| `broll` | une image ou une vidéo qui montre ce dont on parle, sur un mot précis |
| `capture` | une capture d'écran, une preuve, un extrait |
| `punch-in` | un resserrement de 4 à 8 % sur une idée forte |
| `carton` | un plein écran qui marque une rupture de sujet |

**Trois filtres avant de garder un événement visuel :**

1. Il illustre le propos, ou il dégage.
2. Il rend quelque chose plus clair, pas plus joli.
3. Il tient à l'écran au moins le temps de le lire à voix haute, plus une seconde.

Pour un `broll`, écris la **requête de recherche en anglais** — c'est la langue des banques d'images — et le mot du script sur lequel il doit tomber.

---

## Étape 5 — Les deux livrables

### `videos/<slug>/01-script.md` — la version humaine

Ce que tu lis au prompteur. Le texte dit, en gros, aéré, un bloc par section, avec les indications de jeu entre crochets. C'est le fichier que l'utilisateur aura sous les yeux en tournant.

### `videos/<slug>/01-script.json` — la version machine

Le contrat avec le montage. Format exact dans `references/format-script.md`. En résumé :

```json
{
  "slug": "...",
  "format": "long-face",
  "duree_cible_s": 600,
  "mot_cle": "...",
  "avatar": "...",
  "niveau_conscience": "...",
  "angle": "...",
  "blocs": [
    {
      "id": "hook",
      "role": "hook",
      "texte": "Le texte dit, mot pour mot.",
      "intention": "vif",
      "prise": 1,
      "visuel": [
        { "type": "mot-cle", "texte": "coût réel", "ancre": "coûte" },
        { "type": "punch-in", "amplitude": 0.06 }
      ],
      "notes_montage": "Couper sec sur la fin de phrase."
    }
  ],
  "maillage": { "vers": ["autre-slug"], "depuis": ["slug-pilier"] }
}
```

**La voix off est la concaténation exacte des `blocs[].texte`.** Si les deux fichiers divergent, le montage se calera sur le JSON et le prompteur dira autre chose : vérifie qu'ils disent la même chose avant de rendre la main.

---

## Étape 6 — Le contrôle

Avant de rendre, passe le script à ces sept questions. Une seule réponse « non » et tu réécris.

1. Le hook fait-il réagir dans les 8 secondes (1,5 s en short) ?
2. Un seul avatar, un seul niveau de conscience, un seul angle ?
3. Chaque affirmation forte a-t-elle sa preuve ?
4. Le vocabulaire est-il celui de l'avatar, pas le mien ?
5. Aucun mot interdit du Marketeur ?
6. La durée estimée tient-elle dans la cible ?
7. Y a-t-il un événement visuel toutes les 2 à 4 secondes, sans répétition ?

Puis affiche : la durée estimée, le nombre de mots, le nombre d'événements visuels, et propose `/tournage <slug>`.

---

## Réécrire

Quand l'utilisateur dit « le hook est mou », « c'est trop long », « ça fait vendeur » :

- **ne réécris que ce qu'il pointe.** Réécrire tout un script pour une phrase, c'est perdre ce qui marchait déjà ;
- garde les identifiants de blocs stables — le montage s'appuie dessus ;
- si tu changes un `texte`, change-le dans les deux fichiers.
