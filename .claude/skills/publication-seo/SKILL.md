---
name: publication-seo
description: Prépare la mise en ligne d'une vidéo — titres candidats, brief de miniature, description optimisée, chapitres tirés du transcript réel, tags, playlist d'accueil et maillage interne (fiches et écran de fin). Utilise cette skill quand la vidéo est montée et qu'il faut la publier, quand l'utilisateur demande un titre, une miniature, une description, des chapitres, ou mentionne : publier, mise en ligne, titre YouTube, miniature, thumbnail, description, chapitres, tags, playlist, cartes, écran de fin. Déclencheurs — "/publie", "trouve-moi un titre", "prépare la description", "fais les chapitres", "je vais mettre en ligne". Toujours répondre en français.
---

# Préparer une publication

Le montage est fini ; il reste ce qui décide si quelqu'un la regardera. **Tu prépares, l'utilisateur met en ligne.** Aucun appel d'API de publication, jamais, sans son accord explicite à chaque fois.

**Lis `../strategie-contenu/references/seo-youtube.md`** — les règles chiffrées y sont. Cette skill dit dans quel ordre les appliquer et ce qu'il faut produire.

---

## Ce que tu lis d'abord

`videos/<slug>/00-brief.md` (mot-clé, intention, avatar), `01-script.json`, `04-transcript.json` (pour les chapitres et le fichier de sous-titres), `strategie/architecture-chaine.md` (le hub, le maillage), `05-montage/attributions.json` s'il existe, et `marque/identite-visuelle.md` pour la miniature.

---

## 1. Le titre — trois candidats, classés

Produis **trois** titres, dis lequel tu recommandes et pourquoi. L'utilisateur tranche.

Contraintes non négociables :

- mot-clé exact **dès le premier caractère ou dans les 3 premiers mots** ;
- promesse compréhensible seule **dans les 45 premiers caractères** — c'est là que le mobile coupe ;
- **60 caractères maximum** pour une vidéo qui vise la recherche ;
- **un seul patron par titre**, pris dans la liste autorisée ;
- refusé : mot-clé répété deux fois, tout en majuscules, plus de deux émojis, ambiguïté après troncature à 45 caractères.

Affiche pour chacun : le nombre de caractères, ce qu'on voit après troncature à 45, et le patron employé. Sans ça, l'utilisateur ne peut pas arbitrer.

**Le titre promet ce que la vidéo tient dans sa première minute.** Un titre qui sur-promet produit un fort taux de clic et une rétention faible — c'est le signal le plus punitif qui existe. Mieux vaut un titre honnête qui clique moins.

---

## 2. La miniature — un brief, pas une image

Tu ne fabriques pas la miniature : tu écris le brief pour la produire.

**Elle n'illustre pas la vidéo : elle incarne la tension que le spectateur porte déjà.**

Le brief contient :

- **la composition** : ce qu'on voit, en une phrase ;
- **le visage** : présent ou non ; s'il l'est, un quart à un tiers du cadre, regard caméra, émotion **lisible mais non caricaturale** ;
- **le texte** : 3 à 5 mots maximum, en police lourde. **Il ne répète jamais le titre** — ensemble ils forment une phrase complète ;
- **les couleurs**, reprises de `marque/identite-visuelle.md`, en évitant la palette rouge-blanc-noir de l'interface YouTube ;
- **le point d'attention unique** ;
- **la vérification** : réduite à 120 px de large, le sujet reste identifiable et le texte lisible.

Si la chaîne a déjà des miniatures, rappelle ce qui doit rester constant pour qu'elle se reconnaisse au scroll.

Propose deux variantes **visuellement très différentes** si un test comparatif est prévu : trois variantes proches donnent un test qui traîne deux semaines sans conclure.

---

## 3. La description — cinq blocs

1. **Les 150 premiers caractères.** C'est l'extrait affiché en recherche. Mot-clé exact dans les 25 premiers mots, promesse. **Aucun lien, aucun hashtag, aucun appel à l'action** — c'est une faute, pas une préférence.
2. **150 à 250 mots** de développement : mot-clé 2 à 4 fois, plus 3 à 5 variantes sémantiques. Écrit pour être lu, pas pour être bourré.
3. **Les chapitres.**
4. **3 à 7 liens** : le produit, la playlist du hub, les sources citées, les attributions de `05-montage/attributions.json` — les licences CC-BY l'exigent.
5. **2 à 3 hashtags** : un large, un de niche, un de marque.

Total visé : 250 à 500 mots.

---

## 4. Les chapitres

Tirés du **transcript réel**, pas du plan du script : ce qui compte est ce qui a été dit.

Conditions officielles, sans lesquelles ils ne s'activent pas : au moins trois horodatages, ordre croissant, **le premier obligatoirement `00:00`**, au moins 10 secondes par chapitre. Cible : 5 à 9 chapitres pour 10 à 15 minutes.

**Chaque titre de chapitre s'écrit comme une requête autonome**, jamais comme un intertitre créatif :

- « Combien ça coûte réellement » — oui
- « Le nerf de la guerre » — non

Chaque chapitre se classe indépendamment : c'est le moyen le moins cher de positionner une vidéo sur plusieurs requêtes.

---

## 5. Le fichier de sous-titres

```bash
npm run transcris -- <slug> --srt
```

**À déposer systématiquement**, après relecture à la main. La transcription est indexée, et une part significative des vues se fait sous-titres activés. Les sous-titres automatiques seuls sont un point faible.

Relis au moins les noms propres, les chiffres et les termes techniques : c'est là que la transcription se trompe, et c'est exactement ce qui est indexé.

---

## 6. Le maillage

La partie que tout le monde saute, et qui construit la chaîne.

- **Playlist d'accueil** : celle du hub. Si la vidéo est un pilier, elle passe en première position.
- **Fiches** : 2 à 4, avec leur horodatage. Chacune placée au moment où le sous-sujet est évoqué, et **5 à 10 secondes avant un décrochage** de la courbe de rétention. Sur une vidéo neuve, on ne connaît pas encore la courbe : place-les aux transitions de sujet et note qu'il faudra les revoir après 28 jours.
- **Écran de fin** : sur les 15 à 20 dernières secondes, **sur une séquence tournée pour ça**, jamais un fondu au noir. Deux éléments : la **playlist du hub** — pas une vidéo isolée, c'est la playlist qui déclenche la lecture automatique — et le bouton d'abonnement.
- **Vidéos qui pointeront vers celle-ci** : liste-les, avec l'horodatage où ajouter la fiche. C'est une action à faire sur les anciennes vidéos, et elle s'oublie toujours.

---

## 7. Les tags

**60 secondes, pas plus.** Position officielle de YouTube : les tags sont « peu importants » et ne servent qu'à rattraper les fautes d'orthographe.

Le mot-clé, deux ou trois variantes, les fautes de frappe courantes. Puis on passe à autre chose.

---

## Le livrable

Tout dans `videos/<slug>/07-publication.md`, en blocs **copiables tels quels** — l'utilisateur va faire des copier-coller dans YouTube Studio, ne l'oblige pas à recomposer.

```markdown
# Publication — <slug>

## Titre        (3 candidats, recommandation, longueur, troncature à 45)
## Miniature    (brief complet)
## Description  (le texte final, prêt à coller)
## Chapitres    (prêts à coller)
## Tags         (prêts à coller)
## Playlist     (laquelle, quelle position)
## Fiches       (horodatage → vidéo cible)
## Écran de fin (playlist + abonnement)
## À faire ailleurs  (fiches à ajouter sur les anciennes vidéos)
## À relever    (les 6 métriques à noter à J+7 et J+28)
```

Termine par un rappel : **noter les chiffres à 7 et 28 jours** pour que `/bilan` puisse trancher. Sans relevé, le test d'angles ne vaut rien.

---

## Ce qui fait échouer une publication

- **Un lien ou un hashtag dans les 150 premiers caractères.** C'est l'extrait de recherche.
- **Un texte de miniature qui répète le titre.** On perd la moitié de la surface d'accroche.
- **Des chapitres créatifs.** Ils ne rankent sur rien.
- **Un écran de fin sur un fondu au noir.** Personne ne clique sur du noir.
- **Cibler une vidéo au lieu d'une playlist** en écran de fin.
- **Passer une heure sur les tags.**
- **Publier sans avoir noté le mot-clé cible.** À 28 jours, on ne saura pas si ça a marché.
