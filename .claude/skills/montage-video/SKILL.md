---
name: montage-video
description: Monte une vidéo de bout en bout — ingestion des rushes, coupe des silences et des ratés, remplacement du timbre de voix par ElevenLabs, transcription mot à mot, sous-titres calés, B-roll, infographies animées, transitions, étalonnage et rendu final. Utilise cette skill quand l'utilisateur a tourné et veut sa vidéo, veut refaire un montage, ajuster la coupe, changer la voix, ajouter des effets, ou mentionne : monte, montage, coupe les silences, sous-titres, rendu, exporte, la vidéo est trop longue, ajoute des animations, refais le montage. Déclencheurs — "/monte", "j'ai fini de tourner", "monte-moi ça", "le montage est mou", "rends la vidéo". Toujours répondre en français.
---

# Monter une vidéo

Le montage n'illustre pas, il **soutient l'attention**. Trois règles priment sur le goût :

1. **Aucun temps mort.** Les silences sautent, les ratés aussi. Un plan qui ne dit rien n'existe pas.
2. **Un événement visuel toutes les 2 à 4 secondes** : coupe, resserrement, mot qui apparaît, insert, infographie. Jamais deux fois le même d'affilée.
3. **L'effet illustre le propos ou il dégage.** Une transition qui ne marque pas un changement de sujet est du bruit ; une infographie qui ne rend pas un chiffre plus clair est une décoration.

**Pour tout ce qui touche au mouvement lui-même** — raccords, direction, cascades, durées, statut des sous-titres — lis `references/doctrine-mouvement.md`. C'est ce qui fait la différence entre une vidéo qui se regarde comme un seul mouvement et une pile de plans animés chacun dans son coin.

---

## L'ordre des opérations, et pourquoi

```
rushes → silences → audio coupé → remplacement du timbre
       → transcription de CE fichier-là → calage des événements → piste image → rendu
```

Deux points ne se contournent pas :

- **On remplace la voix sur l'audio déjà coupé**, pas sur le rush entier. On paie à la minute : convertir des silences, c'est payer pour du vide.
- **On transcrit la voix finale, jamais la prise d'origine.** La sortie du convertisseur n'est pas identique à l'échantillon près à l'entrée : caler les sous-titres sur la prise donne des sous-titres qui glissent, de plus en plus, jusqu'à la fin.

---

## 1. Vérifier les rushes

Ils vont dans `videos/<slug>/02-tournage/`, nommés `prise-01.mp4`, `prise-02.mp4`, `coupe-01.mp4`. Les prises passent avant les plans de coupe ; l'ordre alphabétique fait foi.

Si la caméra a produit des noms illisibles, renomme-les toi-même — ne demande pas à l'utilisateur de le faire.

Avant de lancer, sonde le premier fichier et signale ce qui compromet la suite :

- **pas de piste audio** → la prise est inutilisable ;
- **son très bas ou lointain** → la transcription et le remplacement de voix vont souffrir ; propose de baisser `COUPE_SEUIL_DB` à −40 et préviens que le résultat sera moyen ;
- **cadence variable** → à convertir en cadence fixe avant tout ;
- **moins de 1080 de haut** pour un format vertical → recadrer coûtera de la définition.

---

## 2. Lancer le montage

```bash
npm run monte -- <slug>
```

Par défaut, **il ne refait que ce qui manque**. La transcription et le remplacement de voix coûtent du temps et de l'argent : les rejouer sans raison est le meilleur moyen de brûler un quota pour rien.

| Option | Quand |
|---|---|
| `--voix=brute` | garder sa voix telle quelle, sans ElevenLabs |
| `--depuis=coupe` | refaire à partir de la détection des silences |
| `--depuis=transcris` | le script a changé, il faut recaler |
| `--seuil-db=-40` | couper moins (pièce vivante, micro lointain) |
| `--silence-min=0.5` | garder les silences courts |
| `--sans-coupe` | tout garder — pour une vidéo déjà montée ailleurs |

**Seuil : 5 minutes de voix à convertir sans confirmation.** Au-delà, le pipeline s'arrête et annonce le coût. Annonce-le aussi à l'utilisateur avant de passer `--oui`.

---

## 3. Lire ce que le pipeline dit

Il parle. Ce qu'il faut entendre :

| Message | Ce que ça veut dire | Quoi faire |
|---|---|---|
| « plus de 45 % de retiré » | soit beaucoup d'hésitations, soit un seuil trop haut | faire écouter `03-audio/voix-coupee.wav` avant d'aller plus loin |
| « X mots sur Y n'ont pas été retrouvés » | le texte lu diffère du script | vérifier ; en dessous de 15 %, c'est normal |
| « répartition uniforme » | l'alignement a échoué | le son est mauvais ou la prise ne correspond pas au script — ne pas rendre en l'état |
| « la voix finale fait X pour Y d'image » | dérive entre son et image | au-delà d'une seconde, écouter la fin de la vidéo |
| « N passages où rien ne bouge plus de 4 s » | l'image va sembler figée | ajouter des événements visuels **dans le script**, puis `--depuis=cale` |
| « un événement toutes les N secondes » | densité trop faible | idem |

**Le pipeline ne comble jamais un creux tout seul.** Un événement visuel inventé par une machine n'illustre rien. Il signale, tu écris.

---

## 4. Enrichir le montage

Les événements visuels vivent **dans le script** (`01-script.json`), pas dans le plan de montage. C'est ce qui permet de les relire, de les corriger et de les rejouer.

Pour ajouter un événement : édite le script, puis `npm run monte -- <slug> --depuis=cale`. C'est instantané — ni transcription ni voix ne sont refaites.

Le format complet est dans `ecriture-script/references/format-script.md`. En résumé :

| Type | Pour quoi | Piège |
|---|---|---|
| `mot-cle` | un mot qui porte l'idée | pas plus de quatre mots, sinon ça se lit au lieu de se voir |
| `chiffre` | un compteur qui monte | garder le chiffre final lisible deux bonnes secondes |
| `infographie` | comparaison, liste de trois, chronologie, avant/après | **une idée par infographie** |
| `broll` | montrer ce dont on parle | la requête s'écrit **en anglais** ; sur un mot précis |
| `capture` | une preuve, un écran | lisible une fois réduit |
| `punch-in` | resserrer sur une idée forte | 4 à 8 %, jamais sur une transition |
| `carton` | marquer une rupture | rare, sinon il perd son effet |
| `transition` | changement de sujet **seulement** | à l'intérieur d'une idée, on coupe sec |

Chaque événement porte une **ancre** : le mot du script sur lequel il tombe. C'est ce qui le cale exactement, plutôt qu'« à peu près au milieu du bloc ». L'ancre doit apparaître telle quelle dans le texte du bloc — le pipeline refuse le script sinon.

Le B-roll demandé par `requete` est cherché, téléchargé et vérifié automatiquement, à condition qu'une clé Pexels soit dans le trousseau. Sans clé, ces plans sont retirés et le pipeline le dit.

---

## 5. Contrôler avant de rendre

```bash
npm run studio -- <slug>
```

Ouvre l'aperçu. Scrube la timeline et vérifie, dans cet ordre :

1. **Le calage des sous-titres** sur trois passages pris au hasard, dont un à la toute fin — c'est là que les dérives se voient.
2. **Les jointures de coupe** : pas de mot mangé, pas de respiration coupée en deux.
3. **Les événements visuels** : chacun tombe sur son mot, reste assez longtemps, ne se superpose pas au suivant.
4. **La lisibilité en vertical** : les sous-titres restent au-dessus de l'interface de TikTok et des Shorts.

Puis un extrait pour vérifier vite :

```bash
npm run rends -- <slug> --extrait=0-300 --brouillon
```

**Ne rends jamais une vidéo complète sans avoir montré le plan de montage à l'utilisateur.**

---

## 6. Rendre

```bash
npm run rends -- <slug>
```

Deux passes, et c'est volontaire : Remotion produit un master plat, puis ffmpeg applique l'étalonnage, normalise le son à −14 LUFS et encode avec l'accélération matérielle. Remotion n'a pas de filtre d'étalonnage, et son ffmpeg embarqué est volontairement minimal.

Compter environ trois fois la durée de la vidéo en temps de rendu, sur une carte dédiée.

---

## Le rythme, concrètement

Ce qui fait la différence entre une vidéo qu'on regarde et une vidéo qu'on quitte :

- **Les huit premières secondes n'ont aucun temps mort.** Pas de logo, pas de « bonjour à tous », pas de respiration. Le premier mot est le hook.
- **Un changement toutes les 2 à 4 secondes.** En dessous de deux, c'est épileptique ; au-delà de quatre, l'œil décroche.
- **Alterner les registres.** Deux infographies de suite fatiguent. Après une infographie, un plan simple.
- **Le resserrement ne s'utilise que sur une idée forte.** Systématique, il ne veut plus rien dire.
- **Les transitions marquent les frontières de sujet.** À l'intérieur d'une idée, on coupe sec — le jump cut est le langage du format.
- **Le silence volontaire existe.** Marqué `[pause]` dans le script, il est conservé. C'est le seul silence qui survit.

---

## Quand ça ne va pas

**« Le montage est haché. »** Le seuil de silence est trop bas ou la marge trop courte : `--seuil-db=-40 --silence-min=0.5`, puis `--depuis=coupe`.

**« Les sous-titres sont décalés. »** Vérifie qu'ils ont été calés sur la voix finale et non sur la prise. Si la dérive croît avec le temps, c'est un problème de source : `--depuis=transcris`.

**« La voix ne me ressemble pas. »** C'est le principe du remplacement de timbre. Ce qui est conservé, c'est l'intonation et le rythme. Pour se rapprocher : monter `--similarite`, baisser `--stabilite`. Ou `--voix=brute`.

**« C'est trop long. »** Le montage ne raccourcit pas un script trop long : il retire les silences, c'est tout. Retour à `/script`.

**« Ça manque de dynamisme. »** Regarde les creux signalés par le pipeline, et la densité d'événements. En dessous d'un toutes les cinq secondes, le problème est dans le script, pas dans le montage.
