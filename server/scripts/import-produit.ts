/**
 * Import des articles de l'onglet PRODUIT (produits_full.csv) vers la base.
 *
 * Methode identique aux articles 1 et 2 :
 *   1. insertion via Prisma au schema REEL (Article.categoryId/familyId/unitId/
 *      packagingId/statut) — le POST /api/articles ne peut pas porter le `code`
 *      officiel, il le genere ;
 *   2. completion des champs de l'onglet PRODUIT via l'API (PUT /articles/:id) :
 *      EMPLOI GD, APPLICATION, SOURCE, FABRICANT, FREQUENCE -> trace d'audit.
 *
 * Idempotent : un code deja present n'est pas reinsere (il est seulement complete).
 *
 * Lignes volontairement NON traitees (a arbitrer) :
 *   - code vide (2 lignes SYMETAL) ;
 *   - 2e occurrence d'un code en doublon (KERRY WHIPTREME 8313 sous 200107).
 *
 * Usage : tsx import-produit.ts   (le rapport est ecrit a l'ecran)
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:4000/api';
const CSV = path.resolve(__dirname, '../../produits_full.csv');

const prisma = new PrismaClient();

type Row = Record<string, string>;

// --- Lecture CSV (separateur ';', guillemets doubles) ------------------------
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ';') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(): Row[] {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    const row: Row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

// --- Mappages ---------------------------------------------------------------
function mapCategorie(v: string): string {
  return v.toUpperCase().trim().replace(/\s+/g, '_');
}
function mapUnite(v: string): string {
  if (!v) return '';
  return v.toUpperCase() === 'L' ? 'LITRE' : v.toUpperCase();
}
function mapEmploi(v: string): string {
  if (!v) return 'PRODUCTION'; // vide -> defaut (mapping acte)
  const u = v.toUpperCase().trim();
  if (u === "REVENTE EN L'ETAT") return 'REVENTE_EN_LETAT';
  return u.replace(/\s+/g, '_');
}
function mapSource(v: string): string | null {
  return v ? v.toUpperCase().trim().replace(/\s+/g, '_') : null;
}

// --- API --------------------------------------------------------------------
async function login(): Promise<string> {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', password: 'admin2026' }),
  });
  if (r.status !== 200) throw new Error(`login ${r.status}`);
  return (await r.json()).token as string;
}

async function complete(token: string, id: number, payload: Record<string, unknown>) {
  const r = await fetch(`${API}/articles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = r.status === 200 ? null : await r.text();
  return { status: r.status, body };
}

// --- Programme --------------------------------------------------------------
async function main() {
  const rows = readCsv();
  console.log(`Lignes CSV : ${rows.length}`);

  // Referentiel resolu une fois
  const cats = new Map((await prisma.category.findMany()).map((c) => [c.code.toUpperCase(), c]));
  const fams = new Map((await prisma.family.findMany()).map((f) => [f.label.toUpperCase(), f]));
  const units = new Map((await prisma.unit.findMany()).map((u) => [u.code.toUpperCase(), u]));
  const packs = new Map((await prisma.packaging.findMany()).map((p) => [p.label.toUpperCase(), p]));

  const token = await login();

  const vus = new Set<string>();
  let crees = 0, deja = 0, completes = 0, echecs = 0;
  const ignores: string[] = [];
  const enAttente: string[] = [];
  const problemes: string[] = [];

  for (const row of rows) {
    const code = row.code;
    const lig = row._ligne_excel;

    // Lignes a arbitrer
    if (!code) {
      ignores.push(`ligne Excel ${lig} : code vide -> ${row.designation}`);
      continue;
    }
    if (vus.has(code)) {
      enAttente.push(
        `ligne Excel ${lig} : code ${code} DEJA vu -> ${row.designation} (doublon a arbitrer)`,
      );
      continue;
    }
    vus.add(code);

    // Resolution referentiel
    const cat = cats.get(mapCategorie(row.categorie));
    const unit = units.get(mapUnite(row.unite));
    const fam = row.famille ? fams.get(row.famille.toUpperCase()) : undefined;
    const pack = row.conditionnement ? packs.get(row.conditionnement.toUpperCase()) : undefined;

    if (!cat || !unit) {
      problemes.push(
        `ligne Excel ${lig} code ${code} : referentiel introuvable (categorie=${row.categorie} unite=${row.unite})`,
      );
      echecs++;
      continue;
    }

    // 1. Insertion (schema reel) si absente
    let article = await prisma.article.findUnique({ where: { code } });
    if (!article) {
      article = await prisma.article.create({
        data: {
          code,
          designation: row.designation,
          designation2: row.designation2 || null,
          categoryId: cat.id,
          familyId: fam?.id ?? null,
          unitId: unit.id,
          packagingId: pack?.id ?? null,
          statut: 'ACTIVE',
        },
      });
      crees++;
    } else {
      deja++;
    }

    // 2. Completion des champs de l'onglet PRODUIT via l'API (trace d'audit)
    const payload = {
      emploiGd: mapEmploi(row.emploi),
      application: row.application || null,
      sourceAchat: mapSource(row.source),
      fabricant: row.fabricant || null,
      frequence: row.frequence ? Number(row.frequence) : null,
      originId: null,
    };
    const res = await complete(token, article.id, payload);
    if (res.status === 200) {
      completes++;
      console.log(
        `OK   ${code.padEnd(7)} id=${String(article.id).padEnd(4)} ` +
          `${row.categorie}/${row.famille}/${row.unite}` +
          `${row.conditionnement ? '/' + row.conditionnement : ''}` +
          ` | emploi=${payload.emploiGd} source=${payload.sourceAchat ?? '-'} ` +
          `app=${payload.application ? 'oui' : '-'} fab=${payload.fabricant ? 'oui' : '-'}`,
      );
    } else {
      echecs++;
      problemes.push(`code ${code} : PUT ${res.status} -> ${res.body}`);
      console.log(`ERR  ${code} : PUT ${res.status} ${res.body}`);
    }
  }

  console.log('\n================ RAPPORT ================');
  console.log(`Lignes CSV lues          : ${rows.length}`);
  console.log(`Articles crees           : ${crees}`);
  console.log(`Deja presents (complete) : ${deja}`);
  console.log(`Completions API reussies : ${completes}`);
  console.log(`Echecs                   : ${echecs}`);
  console.log(`Ignorees (code vide)     : ${ignores.length}`);
  for (const i of ignores) console.log(`   - ${i}`);
  console.log(`En attente (doublon)     : ${enAttente.length}`);
  for (const a of enAttente) console.log(`   - ${a}`);
  if (problemes.length) {
    console.log('PROBLEMES :');
    problemes.forEach((p) => console.log(`   - ${p}`));
  }
  console.log(`TOTAL ARTICLES EN BASE   : ${await prisma.article.count()}`);
  process.exit(echecs > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});