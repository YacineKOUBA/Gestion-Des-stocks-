/**
 * Insere le 2ieme article de l'onglet PRODUIT (code 200002, articles.csv),
 * sur le meme modele que insert-first-article.ts (utilise pour 200001).
 *
 * Schéma réel : Article.categoryId / familyId / unitId / packagingId (relations),
 * statut ACTIVE. Le POST /api/articles ne convient pas : il genere lui-meme
 * le `code` (nextArticleCode) et ne peut donc pas porter le code officiel.
 *
 * Idempotent : si le code existe deja, rien n'est fait.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_CODE = '200002';
const prisma = new PrismaClient();

function normCat(code: string): string {
  return code.toUpperCase().trim().replace(/\s+/g, '_');
}

async function main() {
  // --- Ligne cible dans articles.csv (extraction de l'onglet PRODUIT) ------
  const csvPath = path.resolve(__dirname, '../../articles.csv');
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(';').map((h) => h.trim());

  const all = lines.slice(1).map((l) => {
    const cols = l.split(';').map((v) => (v ?? '').trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cols[i] ?? ''));
    return row;
  });

  const row = all.find((r) => r.code === TARGET_CODE);
  if (!row) throw new Error(`Ligne ${TARGET_CODE} introuvable dans articles.csv`);
  console.log('Ligne cible :', JSON.stringify(row));

  // --- Resolution du référentiel -------------------------------------------
  const catCode = normCat(row.categorie || '');
  const category = await prisma.category.findUnique({ where: { code: catCode } });
  if (!category) throw new Error(`Catégorie introuvable : ${catCode}`);

  const familyLabel = (row.famille || '').toUpperCase();
  const family = await prisma.family.findFirst({
    where: { label: { equals: familyLabel, mode: 'insensitive' } },
  });
  if (!family) throw new Error(`Famille introuvable : ${familyLabel}`);

  const unitCode = row.unite === 'L' ? 'LITRE' : (row.unite || 'UNITE').toUpperCase();
  const unit = await prisma.unit.findUnique({ where: { code: unitCode } });
  if (!unit) throw new Error(`Unité introuvable : ${unitCode}`);

  let packaging = row.conditionnement
    ? await prisma.packaging.findFirst({
        where: { label: { equals: row.conditionnement, mode: 'insensitive' } },
      })
    : null;
  if (row.conditionnement && !packaging) {
    packaging = await prisma.packaging.create({
      data: { label: row.conditionnement, code: row.conditionnement.toUpperCase() },
    });
    console.log(`Conditionnement créé : ${packaging.label} (${packaging.code})`);
  }

  console.log(
    `Referentiel : category=${category.id} family=${family.id} unit=${unit.id} packaging=${packaging?.id ?? 'null'}`,
  );

  // --- Insertion ------------------------------------------------------------
  const existing = await prisma.article.findUnique({ where: { code: row.code } });
  if (existing) {
    console.log(`Article ${row.code} déjà présent (id=${existing.id}) — rien fait.`);
    process.exit(0);
  }

  const created = await prisma.article.create({
    data: {
      code: row.code,
      designation: row.designation,
      designation2: row.designation2 || null,
      categoryId: category.id,
      familyId: family.id,
      unitId: unit.id,
      packagingId: packaging?.id ?? null,
      statut: 'ACTIVE',
    },
    include: { category: true, family: true, unit: true, packaging: true },
  });

  console.log('INSÉRÉ :', JSON.stringify(created, null, 2));
  console.log('TOTAL ARTICLES =', await prisma.article.count());
  process.exit(0);
}

main().catch(async (e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});
