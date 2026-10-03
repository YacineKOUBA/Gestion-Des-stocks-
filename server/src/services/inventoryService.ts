import { prisma } from '../prisma';
import { InventoryDecision, Prisma } from '@prisma/client';
import { badRequest, notFound } from '../utils/apiError';
import { audit } from '../utils/audit';
import { createMovement } from './movementService';
import { dec, toNumber } from '../utils/decimal';

export async function openInventory(
  title: string | undefined,
  depotId: number,
  openedBy: number,
) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  // Le suffixe est une sequence ANNUELLE, pas un rang dans le mois : la premiere
  // campagne creee en octobre affiche INV-2026-10-003 s'il y a deja eu deux campagnes
  // en 2026. C'est voulu : le compteur est strictement croissant sur l'annee, ce qui
  // garantit l'unicite du code (contrainte @unique) sans verrou supplementaire.
  // Passer a un compteur mensuel exigerait de verrouiller la creation (cf. bons).
  const count = await prisma.inventory.count({
    where: { openedAt: { gte: new Date(year, 0, 1) } },
  });
  const code = `INV-${year}-${month}-${String(count + 1).padStart(3, '0')}`;
  const inv = await prisma.inventory.create({
    data: { code, title, depotId, openedBy },
  });
  await audit(openedBy, 'CREATION', 'inventory', String(inv.id), { code });
  return inv;
}

/** Peuple la campagne avec les lignes theoriques d'un depot (stock actuel par article/lot). */
export async function getInventory(id: bigint) {
  const inv = await prisma.inventory.findUnique({
    where: { id },
    include: {
      depot: true,
      lines: {
        include: {
          article: { select: { code: true, designation: true, unit: { select: { code: true, label: true } } } },
          lot: true,
          // Chaque ligne est rattachee a un emplacement : sans lui, deux lignes du meme
          // article et du meme lot (emplacements differents) seraient indiscernables.
          location: { select: { id: true, code: true, label: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!inv) throw notFound('Inventaire introuvable');
  return inv;
}

export async function populateLines(inventoryId: bigint, depotId: number) {
  const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
  if (!inv) throw notFound('Campagne d’inventaire introuvable');
  if (inv.status === 'CLOTUREE') throw badRequest('Campagne déjà clôturée');

  const moves = await prisma.move.findMany({
    where: { status: 'ACTIF', depotId: inv.depotId ?? depotId },
    select: {
      articleId: true,
      lotId: true,
      locationId: true,
      quantity: true,
      sens: true,
    },
  });
  // Le regroupement se fait par article + lot + EMPLACEMENT : l'ecart d'inventaire
  // est ensuite ajuste sur le stock de cet emplacement precis. Aggreger par lot
  // seul melangeait les emplacements du depot et rendait l'ajustement impossible
  // ("stock insuffisant") alors que l'ecart etait reel.
  const agg = new Map<
    string,
    { articleId: number; lotId: number | null; locationId: number | null; qty: Prisma.Decimal }
  >();
  for (const m of moves) {
    const key = `${m.articleId}|${m.lotId ?? 0}|${m.locationId ?? 0}`;
    const signed = dec(m.quantity).mul(m.sens);
    const cur = agg.get(key);
    if (cur) cur.qty = cur.qty.add(signed);
    else agg.set(key, { articleId: m.articleId, lotId: m.lotId, locationId: m.locationId, qty: signed });
  }

  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const line of agg.values()) {
      if (line.qty.isZero()) continue;
      const exists = await tx.inventoryLine.findFirst({
        where: {
          inventoryId,
          articleId: line.articleId,
          lotId: line.lotId,
          locationId: line.locationId,
        },
      });
      if (exists) continue;
      await tx.inventoryLine.create({
        data: {
          inventoryId,
          articleId: line.articleId,
          lotId: line.lotId,
          locationId: line.locationId,
          qtyTheoretical: toNumber(line.qty),
        },
      });
      created += 1;
    }
  });
  return { created };
}

export async function setCount(
  inventoryId: bigint,
  lineId: bigint,
  qtyCounted: number,
  countedBy: number,
) {
  const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
  if (!inv) throw notFound('Campagne d’inventaire introuvable');
  if (inv.status === 'CLOTUREE') throw badRequest('Campagne déjà clôturée');

  const line = await prisma.inventoryLine.findFirst({ where: { id: lineId, inventoryId } });
  if (!line) throw notFound('Ligne d’inventaire introuvable dans cette campagne');

  // Un comptage porte toujours sur une ligne déjà générée par la campagne.
  // L'écart se calcule sur le théorique figé au moment du "Générer les lignes"
  // (snapshot), et non sur un stock recalculé, sinon la colonne "Théorique" et
  // l'"Écart" affichés deviennent incohérents.
  const variance = toNumber(dec(qtyCounted).sub(dec(line.qtyTheoretical)));

  const updated = await prisma.inventoryLine.update({
    where: { id: line.id },
    data: {
      qtyCounted,
      variance,
      status: 'COMPTE',
      countedBy,
      countedAt: new Date(),
    },
  });
  await audit(countedBy, 'MODIFICATION', 'inventory_line', String(updated.id), {
    qtyCounted,
  });
  return updated;
}

export async function validateLine(
  lineId: bigint,
  decision: InventoryDecision,
  lossReason: string | undefined,
  userId: number,
  confirmToken?: string | null,
) {
  const line = await prisma.inventoryLine.findUnique({
    where: { id: lineId },
    include: { inventory: true },
  });
  if (!line) throw notFound('Ligne d’inventaire introuvable');
  if (line.inventory.status === 'CLOTUREE') throw badRequest('Campagne déjà clôturée');
  if (line.variance === null) throw badRequest('Quantité comptée manquante');

  const variance = toNumber(line.variance);
  if (variance === 0) {
    await prisma.inventoryLine.update({
      where: { id: lineId },
      data: { status: 'VALIDE', validatedBy: userId, validatedAt: new Date() },
    });
    await audit(userId, 'VALIDATION', 'inventory_line', String(lineId), { ecart: 0 });
    return { variance: 0 };
  }

  if (decision === InventoryDecision.PERTE && !lossReason) {
    throw badRequest('Le motif de la perte est obligatoire (casse, vol...)');
  }

  const type = decision === InventoryDecision.PERTE ? 'PERTE' : 'AJUSTEMENT';
  const moveId = await prisma.$transaction(async (tx) => {
    const move = await createMovement(
      {
        type,
        articleId: line.articleId,
        lotId: line.lotId,
        locationId: line.locationId,
        depotId: line.inventory.depotId!,
        movementDate: new Date(),
        quantity: Math.abs(variance),
        sens: variance > 0 ? 1 : -1,
        observation: decision === InventoryDecision.PERTE ? lossReason : 'Écart inventaire',
        inventoryId: line.inventoryId,
        // D20, decision 4 : la cloture d'inventaire retire du stock, elle est
        // donc soumise au controle d'empietement sur stock reserve.
        confirmToken: confirmToken ?? null,
      },
      userId,
      tx,
    );

    await tx.inventoryLine.update({
      where: { id: lineId },
      data: {
        status: 'VALIDE',
        decision,
        lossReason: decision === InventoryDecision.PERTE ? lossReason : null,
        movementId: (move as { id: bigint }).id,
        validatedBy: userId,
        validatedAt: new Date(),
      },
    });
    return (move as { id: bigint }).id;
  });

  await audit(userId, 'VALIDATION', 'inventory_line', String(lineId), {
    variance,
    decision,
    movementId: moveId,
  });
  return { variance, decision, movementId: moveId };
}

export async function closeInventory(inventoryId: bigint, userId: number) {
  const inv = await prisma.inventory.update({
    where: { id: inventoryId },
    data: { status: 'CLOTUREE', closedBy: userId, closedAt: new Date() },
  });
  await audit(userId, 'VALIDATION', 'inventory', String(inventoryId), {
    action: 'CLOTURE',
  });
  return inv;
}