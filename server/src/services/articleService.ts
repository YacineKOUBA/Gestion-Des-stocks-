import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import type { Article, ArticleStatut } from '@prisma/client';
import { nextArticleCode } from '../utils/codeSeries';
import { notFound, conflict, badRequest } from '../utils/apiError';
import { audit } from '../utils/audit';
import { dec, toNumber } from '../utils/decimal';

export interface ArticleListFilters {
  search?: string;
  categoryId?: number;
  familyId?: number;
  statut?: string;
  /**
   * Nombre maximum de lignes renvoyees. Absent = PAS de pagination : tout le
   * catalogue part au client. C'est indispensable car les listes deroulantes des
   * bons, reservations, prets et lots ont besoin de l'integralite des articles.
   */
  limit?: number;
  offset?: number;
}

const ARTICLE_INCLUDE = {
  category: true,
  family: true,
  unit: true,
  origin: true,
  packaging: true,
} satisfies Prisma.ArticleInclude;

export async function listArticles(filters: ArticleListFilters): Promise<{ items: Article[]; total: number }> {
  const where: Prisma.ArticleWhereInput = {};
  if (filters.search) {
    where.OR = [
      { designation: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search } },
    ];
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.familyId) where.familyId = filters.familyId;
  if (filters.statut) where.statut = filters.statut as ArticleStatut;

  // `code` est UNIQUE en base : le tri par code est donc total et la pagination ne
  // peut pas faire sauter ni repeter un article entre deux pages.
  if (filters.limit === undefined) {
    const items = await prisma.article.findMany({ where, include: ARTICLE_INCLUDE, orderBy: { code: 'asc' } });
    return { items, total: items.length };
  }

  const [total, items] = await prisma.$transaction([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      include: ARTICLE_INCLUDE,
      orderBy: { code: 'asc' },
      take: filters.limit,
      skip: filters.offset ?? 0,
    }),
  ]);
  return { items, total };
}

export async function getArticle(id: number) {
  const article = await prisma.article.findUnique({
    where: { id },
    include: { category: true, family: true, unit: true, origin: true, packaging: true },
  });
  if (!article) throw notFound('Article introuvable');
  return article;
}

export async function createArticle(
  data: Omit<Prisma.ArticleCreateInput, 'code'>,
  userId: number,
): Promise<Article> {
  const categoryId = (data as { category: { connect: { id: number } } }).category.connect
    .id;
  const article = await prisma.$transaction(async (tx) => {
    const code = await nextArticleCode(categoryId, tx);
    return tx.article.create({
      data: { ...data, code } as Prisma.ArticleCreateInput,
    });
  });
  await audit(userId, 'CREATION', 'article', String(article.id), { code: article.code });
  return article;
}

export async function updateArticle(
  id: number,
  data: Prisma.ArticleUpdateInput,
  userId: number,
) {
  const before = await prisma.article.findUnique({ where: { id } });
  if (!before) throw notFound('Article introuvable');

  // INVARIANT UNITE : l'unite de mesure est portee par l'article et ne doit JAMAIS
  // changer des qu'il existe des mouvements : sinon tout le stock historique passerait
  // silencieusement de KG a L, et une somme d'quantites comparerait deux unites differentes.
  const targetUnitId = (data.unit as { connect?: { id?: number } } | undefined)?.connect?.id;
  if (targetUnitId != null && targetUnitId !== before.unitId) {
    const [nbMouvements, nbLots] = await Promise.all([
      prisma.move.count({ where: { articleId: id } }),
      prisma.lot.count({ where: { articleId: id } }),
    ]);
    if (nbMouvements > 0 || nbLots > 0) {
      throw badRequest(
        "Impossible de changer l'unité de mesure : cet article a déjà des mouvements de stock" +
          (nbLots > 0 ? ' et des lots' : '') +
          '. Les quantités sont exprimées dans son unité actuelle. Créez un nouvel article avec la bonne unité.',
      );
    }
  }

  const article = await prisma.article.update({ where: { id }, data });
  await audit(userId, 'MODIFICATION', 'article', String(id), { before, after: article });
  return article;
}

export async function setArticlePrice(id: number, unitPrice: number, currency: string | undefined, userId: number) {
  const cur = currency ?? 'DZD';
  const article = await prisma.$transaction(async (tx) => {
    const updated = await tx.article.update({
      where: { id },
      data: { unitPrice, currency: cur },
    });
    await tx.priceHistory.create({
      data: { articleId: id, unitPrice, currency: cur, changedBy: userId },
    });
    return updated;
  });
  await audit(userId, 'MODIFICATION', 'article', String(id), {
    action: 'PRIX',
    unitPrice,
    currency: cur,
  });
  return article;
}

/**
 * Suppression TOTALE d'un article. Autorisee UNIQUEMENT si l'article ne figure
 * dans aucun dépôt : aucun mouvement actif (stock disponible) ne doit exister.
 * Les references restantes (lots, mouvements annules, bons, prets, commandes,
 * inventaires...) bloquent la suppression (P2003 -> 409).
 */
export async function deleteArticle(id: number, userId: number) {
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) throw notFound('Article introuvable');

  const activeMoves = await prisma.move.count({
    where: { articleId: id, status: 'ACTIF' },
  });
  if (activeMoves > 0) {
    throw conflict(
      'Suppression impossible : cet article figure encore dans des dépôts (mouvements actifs / stock disponible).',
    );
  }

  // Les mouvements ANNULÉS ne comptent pas dans le stock (aucun dépôt) : on les purge
  // pour autoriser la suppression, sans toucher aux mouvements ACTIFS (deja verifies).
  const annuleIds = (
    await prisma.move.findMany({
      where: { articleId: id, status: 'ANNULE' },
      select: { id: true },
    })
  ).map((m) => m.id);

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      if (annuleIds.length) {
        // Detache les moities liées (self reference) avant purge.
        await tx.move.updateMany({
          where: { OR: [{ id: { in: annuleIds } }, { linkMoveId: { in: annuleIds } }] },
          data: { linkMoveId: null },
        });
        await tx.move.deleteMany({ where: { id: { in: annuleIds } } });
      }
      await tx.priceHistory.deleteMany({ where: { articleId: id } });
      return tx.article.delete({ where: { id } });
    });
    await audit(userId, 'SUPPRESSION', 'article', String(id), {
      code: article.code,
      designation: article.designation,
      purgedMoves: annuleIds.length,
    });
    return deleted;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw conflict(
        'Suppression impossible : cet article est utilisé par des lots, mouvements, bons, prêts, commandes ou inventaires.',
      );
    }
    throw e;
  }
}

/** Consommation mensuelle des 12 derniers mois, calculee depuis les SORTIES (D3). */
export async function monthlyConsumption(articleId: number, months = 12) {
  const from = new Date();
  from.setMonth(from.getMonth() - months + 1);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const moves = await prisma.move.findMany({
    where: {
      articleId,
      status: 'ACTIF',
      type: { code: 'SORTIE' },
      movementDate: { gte: from },
    },
    select: { quantity: true, sens: true, movementDate: true },
  });

  const perMonth = new Map<string, Prisma.Decimal>();
  for (const m of moves) {
    // movementDate est une colonne @db.Date : Prisma la renvoie a minuit UTC. Le
    // regroupement se fait donc en UTC, sinon une sortie datee du 1er du mois
    // serait rattachee au mois precedent sur un serveur en decalage negatif.
    const key = `${m.movementDate.getUTCFullYear()}${String(m.movementDate.getUTCMonth() + 1).padStart(2, '0')}`;
    perMonth.set(key, (perMonth.get(key) ?? new Prisma.Decimal(0)).add(dec(m.quantity)));
  }
  const values = Array.from(perMonth.values());
  const count = values.length;
  const sum = values.reduce<Prisma.Decimal>((a, b) => a.add(b), new Prisma.Decimal(0));
  const breakdown: Record<string, number> = {};
  for (const [k, v] of perMonth) breakdown[k] = toNumber(v);
  return {
    months: count,
    cMax: count ? toNumber(values.reduce((a, b) => (b.greaterThan(a) ? b : a))) : 0,
    avg: count ? toNumber(sum.div(count), 3) : 0,
    breakdown,
  };
}