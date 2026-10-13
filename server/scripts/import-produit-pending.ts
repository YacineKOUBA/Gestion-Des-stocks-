/**
 * Insertion des 3 dernieres lignes de l'onglet PRODUIT, apres arbitrage :
 *   - ligne Excel 138 : KERRY WHIPTREME 8313  -> code 200181 (200107 etant deja
 *     pris par le 8225) ;
 *   - lignes Excel 224/225 : SYMETAL ALUMINIUM SILVER ALU-FOIL 38 MIC
 *     385MM / 620MM -> codes 100056 / 100057, unite UNITE (suite de la serie
 *     EMBALLAGE 100xxx, dernier = 100055).
 *
 * Meme methode que l'import principal : Prisma fournit le `code` (l'API le
 * genere sinon), puis completion des champs metier via l'API (trace d'audit).
 *
 * Idempotent : un code deja present n'est pas recree.
 */
import { PrismaClient } from "@prisma/client";

const API = "http://localhost:4000/api";

type Pending = {
  ligne: number;
  code: string;
  designation: string;
  designation2: string | null;
  fabricant: string | null;
  emploi: "REVENTE_EN_LETAT" | "PRODUCTION" | "MIXTE";
  categorie: string;
  famille: string;
  application: string | null;
  unite: string;
  conditionnement: string | null;
  frequence: number | null;
  source: "INTERNATIONAL" | "LOCAL" | "MIXTE" | null;
  origine: string | null;
};

const PENDING: Pending[] = [
  {
    ligne: 138,
    code: "200181",
    designation: "KERRY WHIPTREME 8313",
    designation2: null,
    fabricant: "KERRY",
    emploi: "REVENTE_EN_LETAT",
    categorie: "MATIERE PREMIERE",
    famille: "BASE FOISONNANTE",
    application: null,
    unite: "KG",
    conditionnement: "SAC",
    frequence: null,
    source: "INTERNATIONAL",
    origine: null,
  },
  {
    ligne: 224,
    code: "100056",
    designation: "SYMETAL ALUMINIUM SILVER ALU-FOIL 38 MIC / 385MM",
    designation2: null,
    fabricant: null,
    emploi: "REVENTE_EN_LETAT",
    categorie: "EMBALLAGE",
    famille: "ALUMINIUM",
    application: null,
    unite: "UNITE",
    conditionnement: null,
    frequence: null,
    source: null,
    origine: null,
  },
  {
    ligne: 225,
    code: "100057",
    designation: "SYMETAL ALUMINIUM SILVER ALU-FOIL 38 MIC / 620MM",
    designation2: null,
    fabricant: null,
    emploi: "REVENTE_EN_LETAT",
    categorie: "EMBALLAGE",
    famille: "ALUMINIUM",
    application: null,
    unite: "UNITE",
    conditionnement: null,
    frequence: null,
    source: null,
    origine: null,
  },
];

async function main() {
  const prisma = new PrismaClient();

  const cats = await prisma.category.findMany();
  const fams = await prisma.family.findMany();
  const units = await prisma.unit.findMany();
  const packs = await prisma.packaging.findMany();

  const catId = (code: string) => {
    const cible = code.trim().replace(/\s+/g, "_").toUpperCase();
    const c = cats.find((x) => x.code.toUpperCase() === cible);
    if (!c) throw new Error(`categorie inconnue : ${code}`);
    return c.id;
  };
  const famId = (label: string) => {
    const f = fams.find((x) => x.label.toUpperCase() === label.toUpperCase());
    if (!f) throw new Error(`famille inconnue : ${label}`);
    return f.id;
  };
  const unitId = (code: string) => {
    const u = units.find((x) => x.code === code);
    if (!u) throw new Error(`unite inconnue : ${code}`);
    return u.id;
  };
  const packId = (label: string | null) =>
    label ? packs.find((p) => p.label.toUpperCase() === label.toUpperCase())?.id ?? null : null;

  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "admin", password: "admin2026" }),
  });
  const { token } = (await login.json()) as { token: string };

  let created = 0;
  let existed = 0;
  let failures = 0;

  for (const p of PENDING) {
    const existing = await prisma.article.findUnique({ where: { code: p.code } });
    let articleId: number;
    if (existing) {
      existed++;
      articleId = existing.id;
      console.log(`DEJA  ${p.code} (id=${articleId}) — completion`);
    } else {
      const art = await prisma.article.create({
        data: {
          code: p.code,
          designation: p.designation,
          designation2: p.designation2,
          categoryId: catId(p.categorie),
          familyId: famId(p.famille),
          unitId: unitId(p.unite),
          packagingId: packId(p.conditionnement),
          statut: "ACTIVE",
        },
      });
      created++;
      articleId = art.id;
      console.log(`CREE  ${p.code} (id=${articleId}) — ${p.designation}`);
    }

    const res = await fetch(`${API}/articles/${articleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        emploiGd: p.emploi,
        application: p.application,
        sourceAchat: p.source,
        fabricant: p.fabricant,
        frequence: p.frequence,
        originId: null,
      }),
    });
    if (res.status !== 200) {
      failures++;
      console.log(`ECHEC ${p.code} : PUT ${res.status} ${await res.text()}`);
    } else {
      console.log(`OK    ${p.code} : emploi=${p.emploi} source=${p.source ?? "(vide)"} unite=${p.unite}`);
    }
  }

  const total = await prisma.article.count();
  console.log("\n================ RESUME ================");
  console.log(`crees=${created}  deja=${existed}  echecs=${failures}`);
  console.log(`TOTAL ARTICLES EN BASE = ${total}`);
  await prisma.$disconnect();
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});