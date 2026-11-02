import { Router } from 'express';
import { prisma } from '../prisma';
import { expiryWhere, lotFlag, LOT_FLAGS } from '../utils/lotFlag';
import { parse } from '../utils/parse';
import { lotSchema, lotUpdateSchema } from '../validators';
import { toNumber } from '../utils/decimal';
import { Prisma } from '@prisma/client';
import { audit } from '../utils/audit';
import { conflict, badRequest, notFound } from '../utils/apiError';
import { isLotExhausted, lotStocks } from '../utils/lotStock';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

router.get('/', requirePermission('lot:read'), async (req, res) => {
  const flag = req.query.flag as string | undefined;
  const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
  const search = (req.query.search as string | undefined)?.trim();
  // includeExhausted : les lots a stock ZERO restent masques par defaut. Les operations
  // qui font entrer du stock (reception, retour, inventaire, ajustement positif) doivent
  // pouvoir cibler un lot vide, y compris un lot neuf jamais mouvemente.
  const includeExhausted = req.query.includeExhausted === 'true';
  const now = new Date();

  // D24 : un drapeau inconnu est REFUSE. Avant, il etait ignore et le filtre renvoyait
  // tous les lots : un `?flag=ROUGE` lettre-morte apres le changement d'echelle aurait
  // affiché la liste complete en faisant croire qu'il avait filtre.
  const bornes = flag ? expiryWhere(flag, now) : {};
  if (flag && !bornes) {
    throw badRequest(
      `Drapeau de péremption inconnu : ${flag}. Valeurs acceptées : ${LOT_FLAGS.join(', ')}.`,
    );
  }

  const where = {
    ...(articleId ? { articleId } : {}),
    ...(flag ? { expiryDate: { not: null, ...bornes!.expiryDate } } : {}),
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
  // (independante des autres lots du meme article). Un lot epuise (solde exactement a
  // zero, meme sans mouvement) est masque par defaut : plus rien a sortir. Il reapparait
  // avec includeExhausted, ou des que du stock revient.
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

// Suppression DEFINITIVE d'un lot, reservee a l'administrateur (`lot:delete`).
//
// Regle : un lot ne peut etre supprime que si son STOCK ACTIF est exactement a zero.
// L'historique (mouvements, reservations terminees, bons, inventaires clotures) ne bloque
// plus : les cles etrangeres sont en ON DELETE SET NULL, donc la suppression detache le
// lot de ces lignes sans effacer les operations elles-memes. Le journal d'audit conserve
// l'article et le numero du lot supprime.
//
// En revanche, un lot encore engage reste protege : stock positif, reservation ACTIVE,
// pret/emprunt non solde ou inventaire ouvert. Il faut d'abord solder l'operation.
router.delete('/:id', requirePermission('lot:delete'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Identifiant invalide');
  }

  const lot = await prisma.lot.findUnique({ where: { id } });
  if (!lot) throw notFound('Lot introuvable');

  const [stocks, moves, allocations, bonLines, inventoryLines, activeAllocations, openLoans, openInventoryLines] =
    await Promise.all([
      lotStocks([id]),
      prisma.move.count({ where: { lotId: id } }),
      prisma.reservationAllocation.count({ where: { lotId: id } }),
      prisma.bonLine.count({ where: { lotId: id } }),
      prisma.inventoryLine.count({ where: { lotId: id } }),
      prisma.reservationAllocation.count({ where: { lotId: id, reservation: { status: 'ACTIF' } } }),
      prisma.loan.count({
        where: { move: { is: { lotId: id } }, status: { in: ['OUVERT', 'PARTIEL'] } },
      }),
      prisma.inventoryLine.count({ where: { lotId: id, inventory: { status: 'OUVERTE' } } }),
    ]);

  const stock = stocks.get(id)?.quantity ?? new Prisma.Decimal(0);
  if (stock.greaterThan(0)) {
    throw conflict(
      `Suppression impossible : ce lot contient encore ${toNumber(stock, 3)} unité(s) en stock. ` +
        'Sortez ou ajustez le stock jusqu’à zéro avant de le supprimer.',
    );
  }
  if (stock.lessThan(0)) {
    throw conflict(
      `Suppression impossible : le stock de ce lot est négatif (${toNumber(stock, 3)}). ` +
        "Corrigez d'abord cette anomalie par un mouvement d'entrée ou un ajustement.",
    );
  }
  if (activeAllocations > 0) {
    throw conflict(
      'Suppression impossible : ce lot est promis par une réservation active. ' +
        'Annulez ou validez cette réservation avant de le supprimer.',
    );
  }
  if (openLoans > 0) {
    throw conflict(
      'Suppression impossible : un prêt/emprunt en cours utilise ce lot. ' +
        'Attendez sa restitution complète avant de le supprimer.',
    );
  }
  if (openInventoryLines > 0) {
    throw conflict(
      'Suppression impossible : ce lot figure dans un inventaire ouvert. ' +
        "Clôturez l'inventaire avant de le supprimer.",
    );
  }

  await prisma.lot.delete({ where: { id } });

  await audit(req.user!.id, 'SUPPRESSION', 'lot', String(id), {
    articleId: lot.articleId,
    lotNumber: lot.lotNumber,
    stock: toNumber(stock, 3),
    // References historiques detachees par ON DELETE SET NULL, conservees ici pour
    // savoir ce que la suppression a delie sans effacer les operations.
    detachedReferences: { moves, allocations, bonLines, inventoryLines },
  });

  res.json({ id: lot.id });
});

export default router;