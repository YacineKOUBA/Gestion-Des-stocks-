"""Verification prealable au remplissage du 2ieme article (200002).

- 200002 existe-t-il deja dans /api/articles ?
- IDs du referentiel : MATIERE PREMIERE / CONSERVATEUR / KG / CARTON
Lecture seule.
"""
import json
import urllib.error
import urllib.request

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
        r = urllib.request.urlopen(req, timeout=10)
        return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300].decode("utf-8", "replace")


s, login = call("POST", "/auth/login", {"login": "admin", "password": "admin2026"})
assert s == 200, login
TOKEN = login["token"]

st, arts = call("GET", "/articles")
if isinstance(arts, list):
    hit = [a for a in arts if str(a.get("code")) == "200002"]
    print("GET /articles -> %s | total = %s | 200002 present : %s"
          % (st, len(arts), bool(hit)))
    if hit:
        print("   dump :", json.dumps(hit[0], ensure_ascii=False))
    first = [a for a in arts if str(a.get("code")) == "200001"]
    if first:
        a = first[0]
        print("   reference 200001 : id=%s | emploiGd=%s | sourceAchat=%s | application=%s"
              % (a.get("id"), a.get("emploiGd"), a.get("sourceAchat"), a.get("application")))
else:
    print("GET /articles ->", st, arts)

checks = [
    ("/referential/categories", "CATEGORIE", "MATIERE PREMIERE"),
    ("/referential/families", "FAMILLE", "CONSERVATEUR"),
    ("/referential/units", "UNITE", "KG"),
    ("/referential/packaging", "CONDIT", "CARTON"),
]
for path, label, needle in checks:
    st, rows = call("GET", path)
    if isinstance(rows, list):
        found = [r for r in rows if str(r.get("label", "")).upper() == needle]
        print("%-9s -> %s | %s = %s" % (label, st, needle, found[0] if found else "ABSENT"))
    else:
        print("%-9s -> %s %s" % (label, st, rows))

# Listing complet des categories et des unites (pour IDs exacts, libelles accentues)
for path, label in (("/referential/categories", "CATEGORIES"), ("/referential/units", "UNITES")):
    st, rows = call("GET", path)
    print("--- %s (%s) ---" % (label, st))
    for r in rows:
        print("   id=%-3s code=%-20s label=%s" % (r.get("id"), r.get("code"), r.get("label")))
