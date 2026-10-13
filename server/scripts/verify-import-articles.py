"""Verification de l'import complet des articles (lecture seule, via l'API)."""
import json
import urllib.error
import urllib.request
from collections import Counter

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
        r = urllib.request.urlopen(req, timeout=30)
        return r, json.load(r)
    except urllib.error.HTTPError as e:
        return e, json.loads(e.read().decode("utf-8", "replace"))


r, login = call("POST", "/auth/login", {"login": "admin", "password": "admin2026"})
TOKEN = login["token"]

r, arts = call("GET", "/articles")
total_hdr = r.headers.get("X-Total-Count")
print("GET /articles -> %s | X-Total-Count = %s | items = %d" % (r.status, total_hdr, len(arts)))

codes = [str(a["code"]) for a in arts]
dups = [(c, n) for c, n in Counter(codes).items() if n > 1]
print("codes en doublon en base : %s" % (dups if dups else "AUCUN"))


def c(fn, label):
    print("%-18s : %s" % (label, dict(sorted(Counter(fn(a) for a in arts).items(), key=lambda kv: str(kv[0])))))

c(lambda a: (a.get("category") or {}).get("label", "(sans)"), "CATEGORIE")
c(lambda a: (a.get("unit") or {}).get("code", "(sans)"), "UNITE")
c(lambda a: (a.get("packaging") or {}).get("label") or "(vide)", "CONDITIONNEMENT")
c(lambda a: a.get("emploiGd"), "EMPLOI GD")
c(lambda a: a.get("sourceAchat") or "(vide)", "SOURCE")
c(lambda a: a.get("statut"), "STATUT")
c(lambda a: "vide" if not (a.get("family") or {}).get("label") else "renseignee", "FAMILLE")
c(lambda a: "vide" if not a.get("fabricant") else "renseigne", "FABRICANT")
c(lambda a: "vide" if not a.get("application") else "renseignee", "APPLICATION")
c(lambda a: "vide" if not a.get("designation2") else "renseigne", "DESIGNATION2")

print("\nArticles MIXTE : %s" % [(a["code"], a["designation"]) for a in arts if a.get("emploiGd") == "MIXTE"])
sans_cat = [a["code"] for a in arts if not a.get("category")]
sans_unit = [a["code"] for a in arts if not a.get("unit")]
print("sans categorie : %s | sans unite : %s" % (sans_cat, sans_unit))
print("sans famille   : %d" % sum(1 for a in arts if not (a.get("family") or {}).get("label")))

print("\n--- controle des deux premiers (deja verifies) ---")
for code in ("200001", "200002"):
    a = [x for x in arts if str(x["code"]) == code][0]
    print("  %s : %s | emploi=%s source=%s unit=%s pack=%s d2=%r"
          % (code, a["designation"], a["emploiGd"], a.get("sourceAchat"),
             (a.get("unit") or {}).get("code"), (a.get("packaging") or {}).get("label"), a.get("designation2")))

mixte = [a for a in arts if a.get("emploiGd") == "MIXTE"]
for a in mixte:
    print("MIXTE : %s %s (%s) emploi=%s" % (a["code"], a["designation"], (a.get("category") or {}).get("label"), a["emploiGd"]))

# Pagination 75
r2, page = call("GET", "/articles?limit=75&offset=0")
print("\npagination : limit=75 offset=0 -> %s articles | X-Total-Count=%s X-Limit=%s X-Offset=%s"
      % (len(page), r.headers.get("X-Total-Count"), r.headers.get("X-Limit"), r.headers.get("X-Offset")))