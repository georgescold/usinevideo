# Identité visuelle — Conseils Relationnels

Dérivée de `marque/identite/conseils relationnels logo.jpeg` par
`node outils/da-depuis-image.mjs`. **Rien n'a été choisi au goût** : chaque teinte vient de
l'avatar, chaque clarté est calculée pour la lisibilité.

Pour la refaire ou la vérifier :

```bash
node outils/da-depuis-image.mjs "marque/identite/conseils relationnels logo.jpeg"
```

---

## La palette

| Rôle | Couleur | D'où elle vient |
|---|---|---|
| **Fond** | `#0e1718` | le bleu pétrole nocturne de l'avatar, qui en occupe **46 %** — assombri jusqu'à porter du texte, mais sa teinte est intacte |
| **Accent** | `#bf5b2c` | la terre cuite des vêtements et des chairs : la couleur la plus **saturée** de l'image |
| **Pastille** | `#ae5328` | le même accent, assombri — voir plus bas pourquoi il en faut deux |
| **Accent secondaire** | `#248db3` | le bleu du ciel étoilé, la teinte la plus éloignée de l'accent |
| **Texte** | `#f5f3f2` | un blanc réchauffé de deux points vers l'accent, jamais un blanc pur |

**Terre cuite sur bleu pétrole.** C'est la complémentaire chaud/froid la plus solide qui
existe, et elle n'a pas été décidée : elle était déjà dans l'image.

### Pourquoi deux tons d'accent

L'accent doit tenir **deux emplois contradictoires** : se lire comme texte SUR le fond (donc
être clair) et porter du texte blanc en pastille (donc être sombre). À la clarté qui satisfait
le premier, aucun texte ne contraste correctement avec lui.

D'où une variante assombrie de la **même teinte** pour le fond du mot actif. L'identité est
intacte — c'est la même couleur — et le texte redevient lisible.

### Les contrastes, mesurés

| | Rapport | Minimum |
|---|---|---|
| texte sur fond | **16,4 : 1** | 4,5 |
| accent sur fond | **4,1 : 1** | 3 |
| texte sur pastille | **4,7 : 1** | 4,5 |
| second sur fond | **4,8 : 1** | 3 |

Les quatre passent. Une palette jolie mais illisible sur un téléphone au soleil n'est pas une
palette, c'est une humeur.

---

## La typographie

| Emploi | Police | Pourquoi |
|---|---|---|
| **Affiche** — sous-titres, infographies, cartons | **Fraunces** (variable, `wght 900`) | l'outil a classé l'image comme *chaleureuse* : palette saturée et contraste doux. Une serif douce, à l'opposé des condensées brutales du format court — c'est ce qui fait qu'on reconnaît la chaîne en une image |
| **Lecture** — petits libellés, numéros | **Inter** | la personnalité nuit à la lisibilité en petit |

⚠️ **Ne régler que l'axe `wght`.** Les axes optiques (`opsz`) interagissent mal avec `font-size`
au rendu et font s'effondrer le texte — constaté, corrigé.

---

## L'atmosphère

**Ambiance : `douce`.** Vignette légère, grain à peine perceptible. Une chaîne qui explique et
déculpabilise ne peut pas avoir l'atmosphère d'une chaîne qui alarme.

**Direction des plans**, ajoutée à *chaque* requête de banque d'images :

```
soft warm light, intimate, cinematic, teal and amber, film grain
```

C'est elle qui a remplacé le bonhomme au chapeau de fête par une table aux bougies. Le problème
se règle **à la source** plutôt que requête par requête.

---

## Ce que la chaîne s'interdit visuellement

Un interdit se vérifie ; une intention non.

- **Le rouge vif d'alerte.** L'accent est une terre cuite, pas un rouge de signalisation. La
  chaîne explique, elle n'alarme pas.
- **Le noir pur** en fond. Le fond est un bleu pétrole très sombre : il a une teinte, et c'est
  elle qu'on reconnaît.
- **Les condensées d'affiche** (Anton, Bebas) — vues partout sur le format court, et en
  contradiction avec la douceur de l'avatar.
- **Les plans durs, cliniques ou surexposés.** Tout doit pouvoir exister à la lumière d'une
  bougie.
- **Le blanc pur** pour le texte. Sur une charte chaude, il fait tache.

---

## Ce qui ne dépend pas de cette chaîne

Le rythme des plans, la pagination des sous-titres, la hiérarchie des raccords, les règles
d'infographie : tout cela vit dans la skill `montage-video` et vaut pour **toutes** les
chaînes. Une nouvelle chaîne hérite d'un montage déjà au niveau et ne redéfinit que sa charte.
