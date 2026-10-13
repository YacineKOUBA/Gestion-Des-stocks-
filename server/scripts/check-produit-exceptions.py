"""Controle de preparation a l'import des articles depuis produits_full.csv.

1. Affiche les lignes incompletes (code, unite ou emploi vides ; statut <> ACTIVE).
2. Compare les valeurs distinctes du CSV au referentiel de l'application
   (categories, familles, unites, conditionnements) pour n'oublier aucun cas.

Lecture seule.
"""
import csv
import json
import urllib.error
import urllib.request
from collections import Counter

CSV = r"C:\Users\Y.DROUICHE\Documents\Default Project\produits_full.csv"
BASE = "http://localhost:4000/api"
TOKEN = None


def call(method, path, data=None):
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
        method=method,
    )
    try:
        r = urllib.request.urlopen(req, timeout=15)
        return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:400].decode("utf-8", "replace")


s, login = call("POST", "/auth/login", {"login": "admin", "password": "admin2026"})
assert s == 200, login
TOKEN = login["token"]

with open(CSV, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f, delimiter=";"))

print("Lignes CSV : %d" % len(rows))

print("\n=== LIGNES INCOMPLETES OU INHABITUELLES ===")
nb = 0
for r in rows:
    pb = []
    if not r["code"]:
        pb.append("CODE vide")
    if not r["unite"]:
        pb.append("UNITE vide")
    if not r["emploi"]:
        pb.append("EMPLOI vide")
    if r["statut"] != "ACTIVE":
        pb.append("STATUT=%s" % r["statut"])
    if not r["designation"]:
        pb.append("DESIGNATION vide")
    if pb:
        nb += 1
        print("- ligne Excel %s : %s" % (r["_ligne_excel"], ", ".join(pb)))
        for k in ("code", "designation", "designation2", "fabricant", "emploi",
                  "categorie", "famille", "application", "unite",
                  "conditionnement", "source"):
            print("     %-16s = %r" % (k, r[k]))
print("Total lignes a probleme : %d" % nb)

print("\n=== CONFRONTATION AU REFERENTIEL ===")


def db_values(path, key):
    s, rows_ = call("GET", path)
    assert s == 200, (path, rows_)
    return {str(x.get(key, "")).upper() for x in rows_}, rows_


cats, cat_rows = db_values("/referential/categories", "code")
fams, fam_rows = db_values("/referential/families", "label")
units, unit_rows = db_values("/referential/units", "code")
packs, pack_rows = db_values("/referential/packaging", "label")

print("Categories en base : %s" % sorted(cats))
for v in sorted({r["categorie"] for r in rows}):
    cible = v.upper().replace(" ", "_")
    print("  CSV categorie %-20r -> code %-20r %s" % (v, cible, "OK" if cible in cats else ">>> ABSENT"))

print("Unites en base : %s" % sorted(units))
for v in sorted({r["unite"] for r in rows}):
    cible = "LITRE" if v == "L" else (v or "").upper()
    print("  CSV unite %-10r -> code %-10r %s" % (v, cible, "OK" if cible in units else (">>> ABSENT" if v else "(vide -> a decider)")))

print("Conditionnements en base : %s" % sorted(packs))
for v in sorted({r["conditionnement"] for r in rows}):
    print("  CSV conditionnement %-10r %s" % (v, "OK" if v.upper() in packs else (">>> ABSENT" if v else "(vide -> null)")))

print("Familles en base : %d" % len(fams))
for v in sorted({r["famille"] for r in rows}):
    print("  CSV famille %-28r %s" % (v, "OK" if v.upper() in fams else ">>> ABSENT"))

# Emploi / Source : valeurs attendues par les enums Prisma
emplois_ok = {"PRODUCTION", "REVENTE_EN_LETAT", "MIXTE"}
sources_ok = {"INTERNATIONAL", "LOCAL", "MIXTE", "NON_DEFINI"}
print("Emploi CSV distincts : %s" % dict(Counter(r["emploi"] for r in rows)))
print("Source CSV distincts : %s" % dict(Counter(r["source"] for r in rows)))
for v in {r["emploi"] for r in rows if r["emploi"]}:
    cible = v.upper().replace(" ", "_").replace("'", "").replace("L'ETAT", "L_ETAT")
    print("  emploi %-18r -> %-18r %s" % (v, cible, "OK" if cible in emplois_ok else ">>> A MAPPER"))
for v in {r["source"] for r in rows if r["source"]}:
    print("  source %-16r -> %-16r %s" % (v, v.upper(), "OK" if v.upper() in sources_ok else ">>> A MAPPER"))