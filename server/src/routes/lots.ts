import { Router } from 'express';
import { prisma } from '../prisma';
import { expiryWhere, lotFlag } from '../utils/lotFlag';
import { parse } from '../utils/parse';
import { lotSchema, lotUpdateSchema } from '../validators';
import { toNumber } from '../utils/decimal';
import { Prisma } from '@prisma/client';
import { audit } from '../utils/audit';
import { conflict } from '../utils/apiError';
import { isLotExhausted, lotStocks } from '../utils/lotStock';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

router.get('/', requirePermission('lot:read'), async (req, res) => {
  const flag = req.query.flag as string | undefined;
  const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
  const search = (req.query.search as string | undefined)?.trim();
  // includeExhausted : les lots epuises restent normally masques, mais un RETOUR doit
  // pouvoir cibler un lot parti a zero (le lot masque, ou son stock est revenu a zero).
  const includeExhausted = req.query.includeExhausted === 'true';
  const now = new Date();

  const where = {
    ...(articleId ? { articleId } : {}),
    ...(flag ? { expiryDate: { not: null, ...expiryWhere(flag, now).expiryDate } } : {}),
    ...(search
      ? {
          OR: [
            { lotNumber: { contains: search, mode: 'insensitive' as const } },
            { article: { code: { contains: search, mode: 'insensitive' as const } } },
            { article: { designation: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const lots = await prisma.lot.findMany({
    where,
    include: {
      article: {
        select: { code: true, designation: true, currency: true, unitPrice: true, unit: { select: { code: true } } },
      },
    },
    orderBy: [{ expiryDate: 'asc' }, { id: 'desc' }],
  });

  // Quantite disponible PAR LOT : somme des mouvements actifs de CE lot uniquement
  // (independante des autres lots du meme article). Un lot epuise (solde revenu a zero
  // apres avoir ete stocke) est masque : plus rien a sortir, il n'a pas sa place dans les
  // listes ni dans les selecteurs. Il reapparait des que du stock revient.
  const stocks = await lotStocks(lots.map((l) => l.id));
  const visibles = includeExhausted ? lots : lots.filter((l) => !isLotExhausted(stocks.get(l.id)));

  res.json(
    visibles.map((l) => {
      const stock = stocks.get(l.id);
      return {
        ...l,
        quantity: toNumber(stock?.quantity ?? new Prisma.Decimal(0)),
        exhausted: isLotExhausted(stock),
        // Historique de sortie du lot : permet de proposer en tete d'un RETOUR les lots
        // par lesquels la marchandise est reellement sortiee.
        sortiQty: toNumber(stock?.sortiQty ?? new Prisma.Decimal(0)),
        lastExitAt: stock?.lastExitAt ?? null,
        flag: lotFlag(l.expiryDate, now),
      };
    }),
  );
});

// D16 : la creation et la modification d'un lot n'étaient protegees par aucune porte
// (donc ouvertes au magasinier). Elles le deviennent explicitement.
router.post('/', requirePermission('lot:write'), async (req, res) => {
  const data = parse(lotSchema, req.body);
  const lot = await prisma.lot.create({
    data: {
      articleId: data.articleId,
      lotNumber: data.lotNumber,
      fabricDate: data.fabricDate ?? null,
      expiryDate: data.expiryDate ?? null,
      unitPrice: data.unitPrice ?? null,
      observation: data.observation ?? null,
    },
  });

  // Le prix est propre au lot : jamais applique au prix de l'article (les autres lots
  // du meme article conservent leur propre prix). Si vide, ce lot n'a pas de prix propre
  // et les calculs retomberont sur le prix de l'article.

  await audit(req.user!.id, 'CREATION', 'lot', String(lot.id), {
    articleId: data.articleId,
    lotNumber: data.lotNumber,
    ...(data.unitPrice != null ? { unitPrice: data.unitPrice } : {}),
  });

  res.status(201).json(lot);
});

router.put('/:id', requirePermission('lot:write'), async (req, res) => {
  const id = Number(req.params.id);
  const data = parse(lotUpdateSchema, req.body);

  // Unicite (article, numero de lot) : la contrainte @@unique le garantit en base, mais on
  // verifie d'abord pour renvoyer un message clair (exclut le lot en cours de modification).
  // NB : comme le PUT est partiel, on ne controle l'unicite que si les deux champs definissant
  // la contrainte sont fournis (sinon un PUT ne modifiant que l'observation serait a tort rejete).
  if (data.articleId !== undefined && data.lotNumber !== undefined) {
    const existing = await prisma.lot.findFirst({
      where: { articleId: data.articleId, lotNumber: data.lotNumber },
    });
    if (existing && existing.id !== id) {
      throw conflict(`Un lot avec le numéro « ${data.lotNumber} » existe déjà pour cet article.`);
    }
  }

  const lot = await prisma.lot.update({
    where: { id },
    data: {
      ...(data.articleId !== undefined ? { articleId: data.articleId } : {}),
      ...(data.lotNumber !== undefined ? { lotNumber: data.lotNumber } : {}),
      ...(data.fabricDate !== undefined ? { fabricDate: data.fabricDate } : {}),
      ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate } : {}),
      ...(data.unitPrice !== undefined ? { unitPrice: data.unitPrice } : {}),
      ...(data.observation !== undefined ? { observation: data.observation } : {}),
    },
  });

  await audit(req.user!.id, 'MODIFICATION', 'lot', String(id), {
    ...(data.lotNumber !== undefined ? { lotNumber: data.lotNumber } : {}),
    ...(data.observation !== undefined ? { observation: data.observation } : {}),
    ...(data.unitPrice != null ? { unitPrice: data.unitPrice } : {}),
  });

  res.json(lot);
});

export default router;