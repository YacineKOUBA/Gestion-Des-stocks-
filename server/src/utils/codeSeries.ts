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
  const build = (value: number) => `${series.prefix}${String(value).padStart(width, '0')}`;

  /*
   * Le compteur peut etre en retard sur la realite : les imports historiques
   * (ou une restauration) ont insere des articles sans incrementer la serie.
   * Sans ce rattrapage, le premier code genere existait deja et la creation
   * echouait en P2002 (« Doublon detecte ») quel que soit le libelle saisi.
   * On avance donc jusqu'au premier code libre. La ligne de serie etant
   * verrouillee (FOR UPDATE) et la creation se faisant dans la meme
   * transaction, deux creations concurrentes ne peuvent pas se voir.
   */
  let value = series.nextValue;
  for (let garde = 0; garde < 1_000_000; garde += 1) {
    const code = build(value);
    const exists = await db.article.findUnique({ where: { code }, select: { id: true } });
    if (!exists) {
      await db.codeSeries.update({
        where: { id: series.id },
        data: { nextValue: value + 1 },
      });
      return code;
    }
    value += 1;
  }
  throw conflict(`Impossible de générer un code libre pour la catégorie ${categoryId}`);
}
