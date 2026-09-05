"""
raie-tonale.py — y a-t-il un sifflement fixe dans ces extraits.

CE SCRIPT MESURE. IL NE FILTRE RIEN ET NE TOUCHE A AUCUN ECHANTILLON.

POURQUOI IL EXISTE.

Le 1er septembre 2026, un modele entrainé sur onze sources a rendu une voix
propre... avec un sifflement fin, constant, decrit comme « une espece
d'acouphene ». Il etait a 14 643 Hz, +9,4 dB au-dessus de son voisinage. Ni la
conversion ni la transposition ne le produisaient : la meme raie sortait a
--transpose=0 comme a +12, et la prise d'origine n'en avait aucune.

Il venait du CORPUS. Cinq des onze sources portaient une raie tonale entre
13,3 et 16,4 kHz, de +11,8 a +17,9 dB. Le modele l'avait apprise comme faisant
partie du timbre, et la restituait sur chaque conversion.

C'est le meme piege que celui du §8 de CLAUDE.md — un moteur apprend les
defauts de ce qu'on lui donne en meme temps que la voix — sauf que ce
defaut-la est dans l'audio D'ORIGINE. Decouper dans l'original, qui protege des
artefacts du separateur, n'en protege pas. Une video re-encodee ou captee
d'ecran porte souvent une raie de ce genre, et rien ne la signalait avant
d'entendre le modele fini, deux heures et demie d'entrainement plus tard.

CE QU'ON MESURE, ET POURQUOI SUR LES EXTRAITS.

On mesure sur les EXTRAITS et pas sur le fichier telecharge : les extraits sont
le corpus, c'est exactement ce que le moteur verra. Une raie qui ne vit que
dans les passages ecartes n'a aucune importance.

Le critere est le contraste local : une raie tonale depasse ses voisines
immediates de plusieurs decibels, la ou un souffle ou une consonne etalent leur
energie sur toute la bande. On compare donc chaque ligne du spectre moyen a la
mediane de son voisinage (±300 Hz, en excluant la ligne elle-meme et ses deux
adjacentes, que la fenetre d'analyse etale).

Releve sur le corpus qui a servi de cas :

    source propre       ecart de 4,0 a 7,4 dB
    source sifflante    ecart de 11,8 a 17,9 dB

Le seuil vit cote Node, ou il se regle ; ici on rend les mesures.

Sortie : un objet JSON sur la sortie standard.
"""

import json
import sys

import numpy as np
import soundfile as sf

# 8192 points a 44,1 kHz donnent une resolution de 5,4 Hz : assez fin pour
# qu'une raie tienne dans une ou deux lignes et ressorte de son voisinage.
FENETRE = 8192

# En dessous de 10 kHz, la voix elle-meme a des pics etroits — un formant tenu,
# une sifflante. Au-dessus de 20 kHz, il n'y a plus rien d'audible et les
# encodeurs y laissent n'importe quoi.
BAS_HZ = 10_000
HAUT_HZ = 20_000

# La demi-largeur du voisinage compare. 300 Hz est large devant une raie et
# etroit devant la pente generale du spectre.
VOISINAGE_HZ = 300

PLANCHER = 1e-12


def mono(chemin):
    x, sr = sf.read(chemin, dtype="float32", always_2d=True)
    return x.mean(axis=1), sr


def spectre_moyen(x, sr):
    """Le spectre moyen des fenetres qui portent du signal, en dB."""
    fen = np.hanning(FENETRE)
    somme = None
    compte = 0
    for depart in range(0, max(1, len(x) - FENETRE), FENETRE // 2):
        bloc = x[depart : depart + FENETRE]
        if len(bloc) < FENETRE:
            break
        # Une fenetre muette n'apprend rien sur une raie et tire la moyenne.
        if np.sqrt(np.mean(bloc**2)) < 1e-4:
            continue
        s = np.abs(np.fft.rfft(bloc * fen))
        somme = s if somme is None else somme + s
        compte += 1
    if not compte:
        return None, None
    db = 20 * np.log10(somme / compte + PLANCHER)
    return db, np.fft.rfftfreq(FENETRE, 1 / sr)


def raie(chemin):
    """La raie la plus saillante du fichier, ou None s'il n'y a rien a mesurer."""
    x, sr = mono(chemin)
    db, f = spectre_moyen(x, sr)
    if db is None:
        return None

    pas = f[1] - f[0]
    largeur = max(1, int(VOISINAGE_HZ / pas))
    haut = min(HAUT_HZ, sr / 2 - 500)

    meilleure = None
    for i in np.where((f >= BAS_HZ) & (f <= haut))[0]:
        a, b = max(0, i - largeur), min(len(f), i + largeur)
        # On retire la ligne et ses deux adjacentes : la fenetre de Hann etale
        # une raie pure sur trois lignes, les compter comme voisinage
        # reviendrait a comparer la raie a elle-meme.
        voisins = np.concatenate([db[a : max(a, i - 3)], db[min(b, i + 4) : b]])
        if len(voisins) < 10:
            continue
        ecart = float(db[i] - np.median(voisins))
        if meilleure is None or ecart > meilleure[1]:
            meilleure = (float(f[i]), ecart)
    if meilleure is None:
        return None
    return {"hz": round(meilleure[0]), "ecartDb": round(meilleure[1], 1)}


def main():
    if len(sys.argv) < 2:
        print("usage: raie-tonale.py <extrait.wav> [extrait.wav …]", file=sys.stderr)
        return 2

    mesures = []
    for chemin in sys.argv[1:]:
        try:
            r = raie(chemin)
        except Exception as e:  # un extrait illisible ne doit pas emporter le lot
            mesures.append({"fichier": chemin, "erreur": str(e)[:200]})
            continue
        if r:
            mesures.append({"fichier": chemin, **r})

    mesurables = [m for m in mesures if "ecartDb" in m]
    # LA MEDIANE, PAS LE MAXIMUM.
    #
    # Un extrait isole peut contenir un bruit d'ambiance tonal — une hotte, un
    # ecran — sans que la source entiere soit atteinte. Ce qu'on veut savoir est
    # si la raie est PRESENTE PARTOUT : c'est elle que le modele apprendra.
    resume = None
    if mesurables:
        resume = {
            "hz": int(np.median([m["hz"] for m in mesurables])),
            "ecartDb": round(float(np.median([m["ecartDb"] for m in mesurables])), 1),
            "extraits": len(mesurables),
        }

    return json.dumps({"raie": resume, "parExtrait": mesures})


if __name__ == "__main__":
    sortie = main()
    if isinstance(sortie, str):
        print(sortie)
        sys.exit(0)
    sys.exit(sortie)
