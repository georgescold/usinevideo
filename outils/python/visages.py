# -*- coding: utf-8 -*-
"""
visages.py — y a-t-il un visage dans ce plan, et est-il assez grand pour qu'on
y lise une émotion ?

POURQUOI CETTE MESURE EXISTE.

Un plan d'ouverture se juge à une chose : est-ce qu'il arrête l'œil. Rien ne
l'arrête comme un visage — c'est la seule forme que le regard humain cherche
avant même de comprendre ce qu'il voit, et c'est le seul support d'émotion qui
se lise en une demi-seconde.

Les autres relevés du pipeline (mouvement, contraste, couleur) passaient à côté :
un portrait sombre, immobile et désaturé sortait « terne » sur les trois, alors
que c'est exactement le plan qu'on veut en ouverture.

CE QUE ÇA NE FAIT PAS.

Ça ne lit PAS l'émotion. Ça repère un visage — le véhicule de l'émotion, pas
l'émotion elle-même. Un visage vide sort le même chiffre qu'un visage bouleversé.

Et ça en rate. Le détecteur de Haar est aveugle aux profils marqués, aux
contre-jours et aux visages de trois quarts dans le noir : sur les trente-deux
plans d'un montage réel, il en manque au moins un (une silhouette à contre-jour).
« Aucun visage trouvé » veut donc dire « pas trouvé », jamais « il n'y en a pas ».
C'est pourquoi le pipeline s'en sert comme d'un BONUS et jamais d'une exclusion :
un plan avec visage passe devant, un plan sans visage reste candidat.

LE PIÈGE, ET SA PARADE.

Sur une seule vue, Haar hallucine : un appareil photo posé dans le noir a rendu
un « visage » occupant 40 % du cadre. Un visage réel, lui, tient sur plusieurs
vues d'affilée. On exige donc DEUX vues au minimum, et on retient la taille
médiane plutôt que la plus grande — la médiane ne se laisse pas emporter par une
fausse détection isolée.

Sortie : une ligne JSON par fichier, sur la sortie standard.
"""

import json
import sys

try:
    import cv2
except ImportError:
    print(json.dumps({"erreur": "cv2 absent"}))
    sys.exit(2)


VUES = 8
"""Huit vues réparties dans le plan. Moins rate un visage qui n'apparaît qu'à la
fin ; plus coûte du temps pour une précision dont personne ne fait rien."""

VUES_MINIMUM = 2
"""En dessous, c'est du bruit — voir « le piège » plus haut."""


def mesure(chemin):
    capture = cv2.VideoCapture(chemin)
    if not capture.isOpened():
        return None

    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frontal = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    profil = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")

    tailles = []
    vues = 0
    for k in range(VUES):
        # Une photo n'a qu'une image : `total` vaut 0 ou 1, et on lit ce qu'il y a.
        if total > 1:
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(total * (k + 0.5) / VUES))
        ok, image = capture.read()
        if not ok:
            break
        vues += 1

        # On travaille en 480 px de large : Haar n'y perd rien et y gagne le
        # droit de tourner sur cinq candidats sans qu'on l'attende.
        hauteur, largeur = image.shape[:2]
        facteur = 480.0 / max(hauteur, largeur)
        if facteur < 1:
            image = cv2.resize(image, (int(largeur * facteur), int(hauteur * facteur)))

        gris = cv2.equalizeHist(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
        h, w = gris.shape[:2]
        minimum = int(h * 0.06)
        boites = list(frontal.detectMultiScale(gris, 1.1, 5, minSize=(minimum, minimum)))
        boites += list(profil.detectMultiScale(gris, 1.1, 5, minSize=(minimum, minimum)))
        if boites:
            plus_grande = max(bw * bh for (_, _, bw, bh) in boites)
            tailles.append(100.0 * plus_grande / float(w * h))

    capture.release()
    if vues == 0:
        return None

    if len(tailles) < VUES_MINIMUM:
        return {"present": False, "vues": vues, "trouve": len(tailles), "taille": 0.0}

    tailles.sort()
    mediane = tailles[len(tailles) // 2]
    return {
        "present": True,
        "vues": vues,
        "trouve": len(tailles),
        "taille": round(mediane, 1),
    }


for fichier in sys.argv[1:]:
    resultat = mesure(fichier)
    print(json.dumps({"fichier": fichier, **(resultat or {"present": False, "illisible": True})}))
