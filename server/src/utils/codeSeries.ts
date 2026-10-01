import { prisma } from '../prisma';
import { conflict } from './apiError';
import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

/**
 * Genere le prochain code article selon la serie de la categorie (ex. 100001).
 * Doit etre appele dans une transaction fournie par l'appelant pour que
 * l'increment de serie et la creation de l'article soient atomiques.
 * Le compteur est verrouille (FOR UPDATE) pour eviter les doublons concurrents.
 */
export async function nextArticleCode(categoryId: number, db: Db = prisma): Promise<string> {
  await db.$queryRaw`SELECT id FROM "CodeSeries" WHERE "categoryId" = ${categoryId} FOR UPDATE`;
  const series = await db.codeSeries.findUnique({ where: { categoryId } });
  if (!series) {
    throw conflict(`Pas de série de codes pour la catégorie ${categoryId}`);
  }
  const width = series.digits - series.prefix.length;
  const body = String(series.nextValue).padStart(width, '0');
  const code = `${series.prefix}${body}`;
  await db.codeSeries.update({
    where: { id: series.id },
    data: { nextValue: series.nextValue + 1 },
  });
  return code;
}
