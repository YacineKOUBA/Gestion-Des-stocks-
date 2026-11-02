import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { dec, toNumber } from '../utils/decimal';
import { issueConfirmToken } from '../utils/confirmToken';

type Db = Prisma.TransactionClient;

export interface NegativeStockConflict {
  code: 'STOCK_NEGATIF_A_CONFIRMATION';
  message: string;
  articleId: number;
  lotId: number | null;
  lotNumber: string | null;
  depotId: number;
  locationId: number | null;
  stockActuel: number;
  quantiteDemandee: number;
  stockApres: number;
  operation: string;
  confirmToken: string;
}

/**
 * Vérifie si l'opération (retrait de stock) va générer un solde négatif.
 * Si oui et sans confirmToken valide pour cette opération, renvoie un conflit
 * à confirmer par l'utilisateur, comme pour D20.
 */
export async function assertNoNegativeStock(
  input: {
    articleId: number;
    lotId?: number | null;
    depotId: number;
    locationId?: number | null;
    quantity: number;
    type: string;
    confirmToken?: string | null;
  },
  sens: number,
  userId: number,
  db: Db = prisma as unknown as Db,
): Promise<void> {
  if (sens >= 0) return;

  const moves = await db.move.findMany({
    where: {
      articleId: input.articleId,
      status: 'ACTIF',
      depotId: input.depotId,
      locationId: input.locationId ?? null,
      lotId: input.lotId === undefined ? undefined : input.lotId,
    },
    select: { quantity: true, sens: true },
  });

  const stockActuel = moves.reduce<Prisma.Decimal>(
    (acc, m) => acc.add(dec(m.quantity).mul(m.sens)),
    new Prisma.Decimal(0),
  );

  const qte = dec(input.quantity);
  const stockApres = stockActuel.sub(qte);

  if (stockApres.greaterThanOrEqualTo(0)) return;

  // Déjà négatif ou va devenir négatif
  const payload = {
    op: 'STOCK_NEGATIF',
    article: input.articleId,
    lot: input.lotId ?? '',
    depot: input.depotId,
    emplacement: input.locationId ?? '',
    qte: toNumber(qte, 3),
    type: input.type,
    user: userId,
  };

  const { verifyConfirmToken } = await import('../utils/confirmToken');
  if (verifyConfirmToken(input.confirmToken, payload)) {
    // Autorisé explicitement par l'utilisateur
    return;
  }

  let lotNumber: string | null = null;
  if (input.lotId != null) {
    const lot = await db.lot.findUnique({ where: { id: input.lotId }, select: { lotNumber: true } });
    lotNumber = lot?.lotNumber ?? null;
  }

  const confirmToken = issueConfirmToken(payload, Date.now());
  const conflict: NegativeStockConflict = {
    code: 'STOCK_NEGATIF_A_CONFIRMATION',
    message: `ATTENTION : cette opération va générer un stock NÉGATIF. Stock actuel : ${toNumber(stockActuel, 3)} - Quantité demandée : ${toNumber(qte, 3)} = Stock après : ${toNumber(stockApres, 3)}. Voulez-vous vraiment continuer ?`,
    articleId: input.articleId,
    lotId: input.lotId ?? null,
    lotNumber,
    depotId: input.depotId,
    locationId: input.locationId ?? null,
    stockActuel: toNumber(stockActuel, 3),
    quantiteDemandee: toNumber(qte, 3),
    stockApres: toNumber(stockApres, 3),
    operation: input.type,
    confirmToken,
  };

  const { conflict: conflictErr } = await import('../utils/apiError');
  throw conflictErr(conflict.message, {
    code: 'STOCK_NEGATIF_A_CONFIRMATION',
    confirmation: conflict,
  });
}
