"""Complete les informations manquantes du PREMIER article (200001) via l'API.

Valeurs lues dans l'onglet PRODUIT du classeur officiel :
  EMPLOI GD    = REVENTE EN L'ETAT   -> enum ArticleEmploi.REVENTE_EN_LETAT
  APPLICATION  = BOISSONS-CONFITURE-COSMETIQUE-PHARMA
  SOURCE       = INTERNATIONAL      -> enum SourceAchat.INTERNATIONAL
  FABRICANT    = vide  -> null
  FREQUENCE(j) = vide  -> null
  ORIGINE      = vide  -> null
"""
import json
import urllib.error
import urllib.request

BASE = "http://localhost:4000/api"


def call(method, path, data=None, tok=None):
    headers = {"Content-Type": "application/json"}
    if tok:
        headers["Authorization"] = "Bearer " + tok
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
        method=method,
    )
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


s, login = call("POST", "/auth/login", {"login": "admin", "password": "admin2026"})
assert s == 200, login
tok = login["token"]

s, items = call("GET", "/articles", None, tok)
art = [x for x in items if x["code"] == "200001"]
assert art, "article 200001 introuvable"
art = art[0]
print("AVANT  id=%s" % art["id"])
print(
    "  emploiGd=%s | application=%s | sourceAchat=%s | fabricant=%s | frequence=%s"
    % (art["emploiGd"], art["application"], art["sourceAchat"], art["fabricant"], art["frequence"])
)

payload = {
    "emploiGd": "REVENTE_EN_LETAT",
    "application": "BOISSONS-CONFITURE-COSMETIQUE-PHARMA",
    "sourceAchat": "INTERNATIONAL",
    "fabricant": None,
    "frequence": None,
    "originId": None,
}
s, resp = call("PUT", "/articles/%d" % art["id"], payload, tok)
print("PUT /articles/%d -> %s" % (art["id"], s))
if s != 200:
    print("  reponse :", json.dumps(resp, ensure_ascii=False))
    raise SystemExit(1)

s, full = call("GET", "/articles/%d" % art["id"], None, tok)
print("APRES  GET /articles/%d -> %s" % (art["id"], s))
for key in (
    "code",
    "designation",
    "designation2",
    "fabricant",
    "emploiGd",
    "application",
    "sourceAchat",
    "periode",
    "frequence",
    "statut",
    "origin",
    "category",
    "family",
    "unit",
    "packaging",
):
    v = full.get(key)
    if isinstance(v, dict):
        v = {k: v[k] for k in ("id", "code", "label") if k in v}
    print("  %-13s = %s" % (key, v))
