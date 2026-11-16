/**
 * Backfill : un article qui possede au moins un lot est « suivi par lot ».
 *
 * La creation/modification d'un lot coche desormais automatiquement
 * `Article.isLotTracked`. Ce script aligne les donnees existantes, creees avant
 * cette regle : sans lui, des articles porteurs de lots resteraient non suivis
 * et les selecteurs de lot des mouvements ne s'afficheraient pas.
 *
 * Idempotent : ne touche que les articles encore a `false`.
 *
 * Usage : npx tsx scripts/backfill-lot-tracked.ts
 */
import { prisma } from '../src/prisma';

async function main() {
  const articles = await prisma.article.findMany({
    where: { isLotTracked: false, lots: { some: {} } },
    select: { id: true, code: true, designation: true, _count: { select: { lots: true } } },
  });

  if (articles.length === 0) {
    console.log('Aucun article a corriger : tous les articles porteurs de lots sont deja suivis.');
    return;
  }

  const result = await prisma.article.updateMany({
    where: { id: { in: articles.map((a) => a.id) } },
    data: { isLotTracked: true },
  });

  for (const a of articles) {
    console.log(`- ${a.code} — ${a.designation} (${a._count.lots} lot(s)) : suivi par lot active`);
  }
  console.log(`${result.count} article(s) mis a jour.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
