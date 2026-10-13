"""Extraction INTEGRALE de l'onglet PRODUIT -> produits_full.csv + diagnostic.

Colonnes utiles a l'article (PRODUIT) :
  ITEM, STATUT, CODE ARTICLE, DESIGNATION, DESIGNATION2, FABRICANT, EMPLOI GD,
  CATEGORIE, FAMILLE, APPLICATION, U.M., CONDITIONNEMENT, FREQUENCE (j),
  SOURCE, ORIGINE

Sortie : produits_full.csv (separateur ';', UTF-8 sans BOM, une ligne par article)
Diagnostic : doublons de code, valeurs distinctes par champ, champs Origine /
             Frequence non vides, statuts autres que ACTIVE, codes/designations vides.

Lecture seule : le classeur n'est jamais modifie.
"""
import csv
import re
from collections import Counter

import openpyxl

XLSX = r"C:\Users\Y.DROUICHE\Downloads\GD TRADING-GESTION DES STOCKS.xlsx"
SHEET = "PRODUIT"
OUT = r"C:\Users\Y.DROUICHE\Documents\Default Project\produits_full.csv"

COLS = [
    ("item", 2),
    ("statut", 3),
    ("code", 5),
    ("designation", 6),
    ("designation2", 7),
    ("fabricant", 8),
    ("emploi", 9),
    ("categorie", 10),
    ("famille", 11),
    ("application", 12),
    ("unite", 13),
    ("conditionnement", 14),
    ("frequence", 15),
    ("source", 16),
    ("origine", 17),
]


def norm(v):
    """Cellule -> chaine propre. Les nombres (codes) deviennent des entiers sans decimale."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return re.sub(r"\s+", " ", str(v)).strip()


wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["PRODUIT"]

rows = []
vides = 0
for r in range(2, ws.max_row + 1):
    vals = {name: norm(ws.cell(row=r, column=idx).value) for name, idx in COLS}
    vals["_ligne_excel"] = r
    if not vals["code"] and not vals["designation"]:
        vides += 1
        continue
    vals["_ligne_excel"] = r
    rows.append(vals)

# ---- CSV ---------------------------------------------------------------------
entetes = ["_ligne_excel"] + [name for name, _ in COLS]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=entetes, delimiter=";", extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)

# ---- Diagnostic --------------------------------------------------------------
def compte(champ):
    return Counter(r[champ] for r in rows)


print("=" * 70)
print("LIGNES DE DONNEES PRODUIT : %d   (lignes completement vides ignorees : %d)" % (len(rows), vides))
print("Fichier ecrit : %s" % OUT)

codes = [r["code"] for r in rows]
sans_code = [r for r in rows if not r["code"]]
print("Lignes sans CODE ARTICLE : %d" % len(sans_code))
for r in sans_code[:10]:
    print("   ligne Excel %s : designation=%r" % (r["_ligne_excel"], r["designation"]))

dups = [(c, n) for c, n in Counter(codes).items() if c and n > 1]
print("Codes en DOUBLON : %d" % len(dups))
for c, n in dups:
    print("   code %s present %d fois :" % (c, n))
    for r in rows:
        if r["code"] == c:
            print("      ligne Excel %s : %r (designation2=%r, fab=%r)" % (r["_ligne_excel"], r["designation"], r["designation2"], r["fabricant"]))

print("-" * 70)
for champ in ("statut", "categorie", "emploi", "unite", "source", "conditionnement"):
    print("%s : %s" % (champ.upper().ljust(16), dict(compte(champ))))

print("-" * 70)
fam = compte("famille")
print("FAMILLE : %d valeurs distinctes" % len(fam))
for label, n in sorted(fam.items()):
    print("   %-28s %d" % (label or "(vide)", n))

app = compte("application")
print("APPLICATION : %d valeurs distinctes" % len(app))
for label, n in sorted(app.items()):
    print("   %-50s %d" % (label or "(vide)", n))

print("-" * 70)
freq_non_vide = [r for r in rows if r["frequence"]]
orig_non_vide = [r for r in rows if r["origine"]]
fab_non_vide = [r for r in rows if r["fabricant"]]
d2_non_vide = [r for r in rows if r["designation2"]]
print("FREQUENCE non vide : %d" % len(freq_non_vide))
for r in freq_non_vide[:20]:
    print("   ligne %s code %s -> %r" % (r["_ligne_excel"], r["code"], r["frequence"]))
print("ORIGINE non vide   : %d" % len(orig_non_vide))
for r in orig_non_vide[:20]:
    print("   ligne %s code %s -> %r" % (r["_ligne_excel"], r["code"], r["origine"]))
print("FABRICANT non vide : %d" % len(fab_non_vide))
print("DESIGNATION2 non vide : %d" % len(d2_non_vide))