/**
 * Insere le PREMIER article de l'onglet PRODUIT (fichier articles.csv).
 *
 * Schéma réel : Article.categoryId / familyId / unitId / packagingId (relations),
 * statut ACTIVE. Les anciens scripts écrivaient des colonnes inexistantes
 * (`categorie`, `unite`, `familleId`) : Prisma levait une erreur et rien
 * n'était inséré.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function normCat(code: string): string {
  return code.toUpperCase().trim().replace(/\s+/g, '_');
}

async function main() {
  const csvPath = path.resolve(__dirname, '../../articles.csv');
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(';').map((h) => h.trim());
  const cols = lines[1].split(';').map((v) => (v ?? '').trim());
  const row: Record<string, string> = {};
  header.forEach((h, i) => (row[h] = cols[i] ?? ''));
  console.log('Ligne 1 du fichier :', JSON.stringify(row));

  // --- Résolution du référentiel -------------------------------------------
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
    packaging = await prisma.packaging.create({ data: { label: row.conditionnement } });
    console.log(`Conditionnement créé dans le référentiel : ${packaging.label}`);
  }

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
