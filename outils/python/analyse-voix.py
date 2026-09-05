"""
analyse-voix.py — ou la voix est-elle seule, et ou la musique la couvre.

CE SCRIPT MESURE. IL NE COUPE RIEN ET NE TOUCHE A AUCUN ECHANTILLON.

Il recoit les deux pistes produites par la separation (la voix d'un cote,
l'accompagnement de l'autre) et rend, fenetre par fenetre, deux nombres : le
niveau de la voix et celui de ce qui l'entoure. Node decide ensuite quoi
garder, et decoupe dans l'ORIGINAL.

C'est la meme discipline que le §9 de CLAUDE.md : la separation est un
instrument de mesure, pas un traitement. Une piste vocale extraite porte des
artefacts de reconstruction — metallique dans les aigus, transitoires rabotees.
La donner en reference a un moteur de conversion, ce serait lui apprendre les
defauts du separateur en meme temps que le timbre.

LE CRITERE, ET POURQUOI CELUI-LA.

On ne cherche pas a detecter la musique — elle se cache tres bien sous une voix,
et tous les indices spectraux qu'on peut lui opposer (planeite, regularite
rythmique) se trompent des qu'un locuteur parle sur un fond discret. On mesure
l'inverse, qui est direct : ce qui RESTE quand on a retire la voix. Si le
residu est trente decibels sous elle, il n'y a rien derriere. S'il est douze
decibels dessous, il y a quelque chose.

Releve sur deux videos reelles, en fenetres d'une demi-seconde :

    voix seule (face camera)     ecart median 34,6 dB   minimum 17,3
    voix sur musique de fond     ecart median 12,4 dB   maximum 23,3

Les deux distributions ne se touchent pas. Le seuil vit cote Node, ou il se
regle ; ici on se contente de rendre les mesures.

Sortie : un objet JSON sur la sortie standard.
"""

import json
import sys

import numpy as np
import soundfile as sf

FENETRE_S = 0.5

# Le plancher d'un silence numerique. Sans lui, log10(0) part a l'infini et une
# fenetre parfaitement muette empoisonne toutes les statistiques du fichier.
PLANCHER = 1e-12


def niveaux_db(x, sr, fenetre_s=FENETRE_S):
    """Le niveau efficace de chaque fenetre, en decibels."""
    n = max(1, int(sr * fenetre_s))
    m = len(x) // n
    if m == 0:
        return np.array([])
    bloc = x[: m * n].reshape(m, n).astype(np.float64)
    return 20 * np.log10(np.sqrt((bloc**2).mean(axis=1)) + PLANCHER)


def mono(chemin):
    x, sr = sf.read(chemin, dtype="float32", always_2d=True)
    return x.mean(axis=1), sr


def main():
    if len(sys.argv) < 3:
        print("usage: analyse-voix.py <voix.wav> <accompagnement.wav>", file=sys.stderr)
        return 2

    voix, sr = mono(sys.argv[1])
    accomp, sr2 = mono(sys.argv[2])
    if sr != sr2:
        print("Les deux pistes n'ont pas la meme frequence.", file=sys.stderr)
        return 1

    # Les deux stems sortent du meme separateur et font en principe la meme
    # longueur ; un echantillon d'ecart suffirait a decaler tout le releve.
    n = min(len(voix), len(accomp))
    v = niveaux_db(voix[:n], sr)
    a = niveaux_db(accomp[:n], sr)
    if len(v) == 0:
        print(json.dumps({"fenetreS": FENETRE_S, "fenetres": [], "reperes": {}}))
        return 0

    taille = min(len(v), len(a))
    v, a = v[:taille], a[:taille]

    # LE SEUIL DE PAROLE SE LIT DANS LE FICHIER, IL NE SE POSE PAS EN DUR.
    #
    # Une chaine YouTube normalisee a -14 LUFS et un enregistrement de salon a
    # -32 n'ont pas le meme plancher. Un seuil absolu aurait donc garde tout
    # d'un fichier fort et rien d'un fichier faible. On prend le niveau haut du
    # fichier (95e centile, insensible a un claquement isole) et on descend de
    # 25 dB : sous cette ligne, ce n'est plus de la parole tenue.
    haut = float(np.percentile(v, 95))

    return json.dumps(
        {
            "fenetreS": FENETRE_S,
            "secondes": round(taille * FENETRE_S, 2),
            "reperes": {
                "voixHaute": round(haut, 1),
                "voixMediane": round(float(np.median(v)), 1),
                "accompMedian": round(float(np.median(a)), 1),
                "ecartMedian": round(float(np.median(v - a)), 1),
            },
            "fenetres": [
                {"voix": round(float(x), 1), "accomp": round(float(y), 1)}
                for x, y in zip(v, a)
            ],
        }
    )


if __name__ == "__main__":
    sortie = main()
    if isinstance(sortie, str):
        print(sortie)
        sys.exit(0)
    sys.exit(sortie)
