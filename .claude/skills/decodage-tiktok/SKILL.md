---
name: decodage-tiktok
description: Décode des vidéos TikTok, Reels ou Shorts à partir de leur lien — statistiques, transcript mot à mot, découpage du script, et autopsie de ce qui a réellement fait la performance. Utilise cette skill quand l'utilisateur colle un ou plusieurs liens de vidéos courtes, demande pourquoi une vidéo a marché, veut décortiquer un hook, ou mentionne : TikTok, Reels, Shorts, ce short, cette vidéo a fait X vues, pourquoi ça marche, décortique, analyse ce contenu, transcript de ce lien. Déclencheurs — "/decode", un lien tiktok.com ou instagram.com collé dans la conversation, "pourquoi cette vidéo a cartonné", "analyse-moi ce short". Toujours répondre en français.
---

# Décoder une vidéo courte

L'utilisateur envoie des liens. On en tire trois choses : **ce qui s'est passé** (les chiffres), **ce qui a été dit** (le transcript), et **pourquoi ça a marché** (l'autopsie).

La troisième est la seule qui compte. Les deux premières sont mécaniques — c'est le pipeline qui les fait.

---

## 1. Ingérer

```bash
npm run tiktok -- <url> <url> <url>
```

Le pipeline essaie d'abord `yt-dlp`, en local et gratuitement : il couvre les cinq statistiques qui comptent, **sauvegardes comprises**. Apify ne sert que de repli quand TikTok bloque.

Il télécharge l'audio, le transcrit en local, puis efface l'audio. On garde les statistiques, la couverture et le texte.

Seuil : 10 liens sans confirmation. Au-delà, demande.

Sortie : `veille/tiktok/raw/<id>.json`, `transcripts/<id>.txt`, et `index.json`.

---

## 2. Lire les chiffres

Les valeurs brutes ne disent rien. Ce sont les **rapports** qui parlent, et le pipeline les calcule :

| Rapport | Ce qu'il révèle | Repère |
|---|---|---|
| likes / vues | l'adhésion immédiate | 8 à 12 % est bon |
| commentaires / vues | la friction — on commente ce qui dérange ou ce qui manque | plus de 1 % est élevé |
| partages / vues | l'utilité sociale : « ça, il faut que tu le voies » | plus de 1 % est fort |
| **sauvegardes / vues** | **l'utilité personnelle : on garde ce qu'on compte appliquer** | **plus de 2 % est un signal d'or** |
| vues / abonnés de l'auteur | la sortie de l'audience acquise | plus de 3 = la vidéo a marché seule |

**La sauvegarde est la métrique la plus sous-estimée.** Un fort taux de likes signe le divertissement ; un fort taux de sauvegardes signe la valeur. Pour une chaîne qui vend quelque chose, c'est la seconde qui compte.

Un fort taux de commentaires avec un faible taux de likes signale souvent une **polarisation** : la vidéo fait réagir contre elle. Ce n'est pas forcément mauvais, mais ce n'est pas reproductible sans en assumer le coût.

---

## 3. Découper le script

Depuis le transcript, découpe et **horodate** :

| Moment | Ce qu'on note |
|---|---|
| **Hook** (0 – 1,5 s) | Les mots exacts. La mécanique employée. Ce que l'image montre pendant ce temps. |
| **Tension** (1,5 – 5 s) | Comment le problème est rendu personnel. |
| **Corps** | L'idée unique. Combien de temps elle met à arriver. |
| **Chute** | Referme, ou rouvre pour la boucle. |

Compte les mots et déduis le débit. Au-dessus de 190 mots par minute, la densité fait partie de l'effet — et elle est reproductible.

Note aussi **ce qui n'est pas dit** : combien de temps avant que le sujet soit identifiable, s'il y a une promesse explicite, si le produit apparaît et à quel moment.

---

## 4. L'autopsie

C'est le travail. Réponds à ces questions, dans cet ordre, en t'appuyant sur les chiffres et le texte :

1. **Qu'est-ce qui a arrêté le pouce ?** Le premier mot, la première image, ou une incongruité visuelle ? Si tu ne peux pas le dire en une phrase, la vidéo a peut-être marché pour une raison externe (le compte, le son, un moment).
2. **À quel niveau de conscience parle-t-elle ?** Ne sait pas qu'il a le problème, le connaît, cherche des solutions, compare, décide. C'est ce qui détermine si l'angle est transposable chez nous.
3. **Quelle tension exploite-t-elle ?** Peur, frustration, injustice ressentie, désir, curiosité. Nomme-la.
4. **Qu'est-ce qui est reproductible chez nous ?** La mécanique du hook, la structure, le rythme, l'angle. Sois précis.
5. **Qu'est-ce qui ne l'est pas ?** L'audience de l'auteur, sa tête, un son du moment, un contexte d'actualité, un budget de production. **Il faut le dire.** Une vidéo qui marche parce que son auteur a 800 000 abonnés n'apprend rien à une chaîne neuve.
6. **Le verdict** : on transpose, on s'en inspire, ou on écarte.

**La question 5 est celle qu'on saute et qu'il ne faut pas sauter.** La plupart des « ça marche » sont des effets d'audience, pas des effets de contenu.

---

## 5. Ce que ça change

Termine toujours par du concret, pas par une analyse en l'air :

- ajoute les mécaniques retenues à `strategie/matrice-angles.md` ;
- si un hook est transposable, écris-le **dans les mots de notre avatar** et propose de l'ajouter à `marque/Hook-Bank.md` ;
- si un format revient sur plusieurs vidéos décodées, propose de l'activer dans `config/chaine.json`.

Une analyse qui ne modifie aucun fichier n'a servi à rien.

---

## Quand plusieurs liens sont envoyés ensemble

Ne les traite pas un par un dans la réponse : traite-les ensemble et **cherche ce qu'ils ont en commun**. C'est là que se trouve le signal.

- Même mécanique de hook sur trois vidéos performantes ? C'est la mécanique de la niche.
- Même durée ? C'est le format de la niche.
- Un seul se distingue ? C'est peut-être le plus intéressant, ou une anomalie — regarde le rapport vues/abonnés pour trancher.

Rends un tableau comparatif d'abord, l'autopsie détaillée ensuite, et seulement pour les deux ou trois qui apprennent quelque chose.

---

## Limites à annoncer

- **Les vues affichées ne sont pas la portée.** Une boucle compte, un replay compte. Une vidéo courte gonfle mécaniquement.
- **La date compte.** Une vidéo de 18 mois a bénéficié d'une distribution différente.
- **On ne voit pas la courbe de rétention.** C'est la donnée la plus utile et elle est privée. Tout ce qu'on en déduit reste une inférence — dis-le.
- **Le son utilisé** peut expliquer une partie de la performance sans rien devoir au contenu.
