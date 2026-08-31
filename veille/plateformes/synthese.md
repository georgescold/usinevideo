# Publier en vertical faceless : ce que la veille Reddit permet de décider

> **Récolté le 28 août 2026** par `npm run reddit`, via Apify (Reddit refuse l'accès direct aux
> agents : 403 au domaine, et le domaine est hors de l'index de recherche accessible).
>
> **Corpus : 309 entrées** — r/youtubers 113, r/InstagramMarketing 118, r/TikTokMarketing 78.
> Fenêtre : mars → août 2026. Part réellement exploitable estimée : 25 à 42 % selon le subreddit.
>
> **Analysé par trois lecteurs indépendants, puis mis en défaut par deux contradicteurs.**
> Les corrections des contradicteurs sont appliquées ci-dessous.

---

## La limite de méthode, à lire avant tout le reste

**La récolte a été plafonnée à 6 commentaires par discussion.** Sur les dix posts dont le nombre
réel de commentaires est connu, il y en avait **644 dans la réalité et 60 dans le fichier — 9,3 %**.
Un post à 190 commentaires n'en a livré que 6.

**Conséquence directe : aucune affirmation d'absence n'est valide.** « Personne ne parle du
watermark », « aucune mention d'un plafond de publication », « rien sur les sous-titres » — ces
phrases ne veulent dire qu'une chose : *le haut de six fils ne le contient pas*. Elles ne prouvent
rien sur ce que la niche pense. La première version de cette synthèse en tirait des conclusions ;
elles ont été retirées.

C'est un défaut de la récolte, pas de l'analyse. Une prochaine passe devra monter
`--commentaires` à 30 ou 40, quitte à réduire le nombre de posts.

**Les votes manquent sur la majorité des entrées** (69 % côté YouTube, 69 sur 78 côté TikTok). La
pondération se fait donc surtout par récurrence entre discussions, pas par votes.

---

## L'entrée qui compte plus que toutes les autres

`t3_1sz8ysk` · r/InstagramMarketing · 29 avril 2026 · **157 votes** · ouvre par
« *no courses to sell, nothing to promote* ».

Neuf ans à faire croître des pages Instagram à temps plein. Des pages menées **à un million
d'abonnés plusieurs fois**, la plus rapide en quatre mois, et une à deux millions en onze mois.
C'est le **seul** décollage du corpus qui soit à la fois chiffré, non commercial, **faceless**, et
accompagné de sa méthode et de sa cadence.

Ce qu'il dit :

- **10 à 15 publications par jour sur un compte neuf.** « *instagram will not flag you for spamming* ».
- **Aucun hashtag.** « *Those are completely useless.* »
- **Plusieurs pages lancées en parallèle**, on concentre l'effort sur celle qui décolle.
- **Une semaine à 10 par jour sans traction → on abandonne la page et on en ouvre une autre.**
- **Le nom et le logo décident** : il a vu des copies de ses pages échouer sur un mauvais nom.
- Un watermark maison ajouté au montage, sur InShot ou Canva.

### Et la réserve qui change tout

**Son modèle est la curation.** Il récupère le contenu d'autres pages, le remonte, le republie.
Il l'écrit noir sur blanc : « *je pourrais trouver de quoi faire cent posts en une heure* ».

**Sa cadence n'est pas transposable à une chaîne qui écrit et enregistre ses propres textes.** Dix
à quinze publications par jour ne sont possibles que parce qu'il a supprimé le goulot
d'étranglement de la production. Reprendre le chiffre sans le modèle serait la pire lecture
possible de ce document.

**Ce qui est transposable, en revanche, c'est la structure de son raisonnement** : le volume est sa
variable d'ajustement parce que le contenu ne lui coûte rien. Quand le contenu coûte cher — un
script, une prise, un montage — la variable d'ajustement doit être ailleurs. C'est la vraie
question que ce document pose à cette chaîne.

---

## Cadence : la réponse honnête

**Il n'existe pas, dans ce corpus, de cadence défendable pour un créateur de contenu original.**

| Chiffre | Plateforme | Sources | Statut |
|---|---|---|---|
| 10-15 posts/jour, compte neuf | Instagram | 1 (157 votes) | Solide **mais modèle de curation** |
| 3 vidéos/semaine | TikTok | 1, votes inconnus | Conseil isolé à un débutant |
| 1 reel/jour + stories | Instagram | 1, **source commerciale** | À écarter |
| 1×/semaine | YouTube | 1 | **Contredit dans son propre fil** |

**Ce qui est en revanche bien établi, et c'est un résultat négatif utile :** publier tous les jours
pendant des mois ne débloque rien à soi seul. Six témoignages d'échec sur les trois plateformes,
tous concordants — quatorze semaines quotidiennes pour 240 abonnés, plus de mille vidéos pour 41
impressions, trois publications par jour bloquées à 200 abonnés. **La cadence n'est pas le levier.**

Aucune entrée ne rapporte de plafond imposé par une plateforme. Compte tenu de la limite de
méthode ci-dessus, cela ne signifie pas qu'il n'y en a pas.

---

## Chauffe d'un compte neuf : le dossier ne sait rien

**Zéro entrée exploitable.** Le terme faisait partie des requêtes de collecte et n'a rien ramené.

Les trois seules occurrences du mot ne répondent pas à la question : un rituel de quinze minutes
d'activité *avant chaque publication* (non corroboré, issu d'un échange sans preuve) ; une
automatisation de création de comptes dont l'auteur vend le montage, sans durée ni protocole ; et
un emploi du mot dans un tout autre sens.

**Ce que le corpus dit à la place va dans le sens inverse d'une chauffe** : « *la plupart des gens
passent trois mois à préparer une page au lieu de publier* » (175 votes), et le praticien à 157
votes publie 10 à 15 fois par jour dès l'ouverture du compte.

**Je ne peux affirmer ni que la chauffe est réelle, ni qu'elle est un mythe.** Toute procédure
qu'on te proposera par ailleurs ne vient pas de ce dossier.

---

## Ce qui fait réellement chuter la portée

**1. La dérive de niche — le point le mieux étayé du corpus.** Sept entrées, deux plateformes.
« *la vidéo fera très mal, peut-être cinq vues au total* » ; « *mon audience passe vite, donc les
vidéos meurent tôt* » (14 votes) ; « *YouTube lit encore cette chaîne comme une chaîne Tarkov* ».
Le remède cité est d'ouvrir une seconde chaîne plutôt que d'élargir la première.

**2. La perte pure et simple du compte YouTube.** Trois entrées, dont une à 120 votes : chaîne
entière supprimée pour une vidéo **privée** de 2020, appel refusé en moins d'une heure. Le recours
par @TeamYouTube a échoué dans un cas rapporté.

→ **Conséquence pour une chaîne produite en série : garder une copie locale de chaque master.**
Deux auteurs le regrettent explicitement après coup. C'est déjà le cas ici, `06-rendu/` est sur le
disque — mais ça vaut d'être conscient que la plateforme n'est pas un archivage.

**3. Le format en série.** Deux entrées indépendantes à 176 et 175 votes : « *fais-en une série
pour qu'ils puissent suivre le parcours* ». C'est le point le mieux voté du corpus sur le format.

**4. Les hashtags sont morts.** Quatre entrées convergentes, dont deux témoignages d'arrêt sans
baisse constatée.

---

## Ce que ce corpus ne permet pas de conclure

- **Rien sur le faceless en contenu original.** Le seul cas faceless documenté est de la curation.
  Neuf entrées touchent le sujet, aucune ne compare, et sur YouTube quatre réponses à quelqu'un
  qui envisageait une chaîne faceless parlent toutes d'argent sans répondre à la question.
- **Rien sur la durée optimale, le hook, les sous-titres** — absents de l'échantillon capturé, ce
  qui ne veut pas dire absents de la niche.
- **Rien sur le français.** Tout le corpus est anglophone.
- **Rien sur les seuils d'amorçage** : le fameux blocage « à 200 vues » est un symptôme partagé
  par sept entrées, mais la seule réponse technique le **démonte** par l'arithmétique — quarante
  et une impressions à 24 % de clics font dix vues, pas un bridage.

---

## Ce que je retiens pour cette chaîne

1. **La cadence n'est pas le levier.** Six échecs concordants le montrent. Produire plus de courts
   médiocres ne fera pas décoller la chaîne.
2. **La dérive de niche est le vrai risque**, et c'est le point le mieux étayé du dossier. Un
   segment unique, tenu — ce que la stratégie impose déjà.
3. **Penser en série plutôt qu'en vidéos isolées.** Deux entrées à plus de 175 votes, le meilleur
   appui du corpus sur le format. Les cent courts prévus gagneraient à s'annoncer comme une suite
   plutôt que comme cent objets séparés.
4. **Le goulot d'étranglement est la production.** C'est la leçon structurelle du praticien à 157
   votes : il a gagné en supprimant le coût du contenu. Cette chaîne ne peut pas faire ça — donc
   son avantage doit venir d'ailleurs que du volume.
