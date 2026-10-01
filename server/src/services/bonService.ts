import { prisma } from '../prisma';
import { bonSchema } from '../validators';
import type { z } from 'zod';
import { Prisma } from '@prisma/client';
import { audit } from '../utils/audit';
import { notFound, badRequest } from '../utils/apiError';
import { dec, toNumber } from '../utils/decimal';

type BonInput = z.input<typeof bonSchema>;

export async function createBon(data: BonInput, userId: number) {
  const year = new Date(data.bonDate).getFullYear();
  const prefix =
  data.type === 'ENTREE' ? 'BE' : data.type === 'SORTIE' ? 'BS' : data.type === 'LIVRAISON' ? 'BL' : data.type === 'RETOUR' ? 'BR' : 'BT';

  // Compteur par type et par annee + calcul des montants, dans une transaction.
  const bon = await prisma.$transaction(async (tx) => {
    const count = await tx.bon.count({
      where: { type: data.type, bonDate: { gte: new Date(year, 0, 1) } },
    });
    const ref = `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;

    // PU fourni, sinon prix courant de l'article ; montant ligne = quantite x PU.
    const ids = data.lines.map((l) => l.articleId);
    const articles = await tx.article.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, unitPrice: true, currency: true },
    });
    const priceById = new Map(articles.map((a) => [a.id, dec(a.unitPrice)]));

    // INVARIANT DEVISE : un bon ne peut pas melanger des lignes de devises differentes.
    // Chaque montant de ligne est calcule a partir du prix de l'article, exprime dans la
    // devise de cet article : sommer un prix DZD et un prix USD dans montantTotal
    // additionnerait deux montants non comparables. Il faut unifier les devises avant.
    const currencyById = new Map(articles.map((a) => [a.id, a.currency]));
    const devises = new Set<string>();
    for (const l of data.lines) {
      const c = currencyById.get(l.articleId);
      if (c) devises.add(c);
    }
    if (devises.size > 1) {
      const codes = [...devises].sort();
      const codesById = new Map(articles.map((a) => [a.id, `${a.code} (${a.currency})`]));
      const detail = [...new Set(data.lines.map((l) => codesById.get(l.articleId)).filter(Boolean))].join(', ');
      throw badRequest(
        `Bon non autorisé : les lignes du bon sont dans plusieurs devises (${codes.join(', ')}). ` +
          `Un bon doit etre libelle dans une seule devise : unifiez les prix des articles concernes ` +
          `avant d'elaborer le bon. Lignes concernees : ${detail}.`,
      );
    }

    // La devise du bon est verrouillee sur celle de ses lignes : sans ce controle, le bon
    // pourrait etre libelle dans une devise et ses montants etre calcules sur les prix
    // des articles, exprimes dans une autre.
    const deviseLignes = [...devises][0];
    if (deviseLignes && deviseLignes !== data.currency) {
      throw badRequest(
        `Bon non autorisé : le bon est libelle en ${data.currency} alors que ses lignes sont en ${deviseLignes}. ` +
          `La devise du bon doit etre celle des articles concernes : unify les devises avant d'elaborer le bon.`,
      );
    }

    let total = new Prisma.Decimal(0);
    const lines = data.lines.map((l) => {
      const unitPrice = l.unitPrice != null ? dec(l.unitPrice) : priceById.get(l.articleId) ?? new Prisma.Decimal(0);
      const montant = dec(l.quantity).mul(unitPrice);
      total = total.add(montant);
      return {
        articleId: l.articleId,
        lotId: l.lotId ?? null,
        quantity: l.quantity,
        unitPrice: toNumber(unitPrice, 4),
        montant: toNumber(montant, 4),
        observation: l.observation ?? null,
      };
    });

    return tx.bon.create({
      data: {
        ref,
        type: data.type,
        depotId: data.depotId,
        depotDestId: data.depotDestId,
        partnerId: data.partnerId,
        bonDate: data.bonDate,
        currency: data.currency ?? 'DZD',
        montantTotal: toNumber(total, 4),
        lines: { create: lines },
      },
    });
  });

  await audit(userId, 'CREATION', 'bon', String(bon.id), { ref: bon.ref, montantTotal: bon.montantTotal });
  return bon;
}

export async function listBons() {
  return prisma.bon.findMany({
    include: {
      partner: true,
      depot: true,
      lines: { include: { article: { select: { code: true, designation: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBon(id: bigint) {
  const bon = await prisma.bon.findUnique({
    where: { id },
    include: {
      partner: true,
      depot: true,
      lines: { include: { article: { select: { code: true, designation: true, unit: { select: { code: true } } } }, lot: true } },
    },
  });
  if (!bon) throw notFound('Bon introuvable');
  return bon;
}
