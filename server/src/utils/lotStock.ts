import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { dec } from './decimal';

export interface LotStock {
  /** Solde du lot : somme des mouvements ACTIF de CE lot uniquement (recus - sortis). */
  quantity: Prisma.Decimal;
  /** Le lot a deja ete mouvemente : un lot vide mais jamais stocke reste visible. */
  moved: boolean;
  /**
   * Total sorti du lot en SORTIE (depart client) et date de la derniere sortie. meme
   * convention que le controle de coherence du RETOUR : PERTE et TRANSFERT n'en font
   * pas partie. Sert a proposer en tete les lots par lesquels la marchandise est
   * reellement partiee chez un client. Les reservations n'apparaissent pas ici :
   * elles ne creent aucun mouvement (D20), seule leur validation produit un SORTIE.
   */
  sortiQty: Prisma.Decimal;
  lastExitAt: Date | null;
}

/**
 * Soldes de plusieurs lots en une seule requete, calcules par lot ET par entrepot /
 * emplacement quand on le souhaite. Un lot n'est isnt vraiment epuise que si son solde
 * revient a zero APRES avoir ete stocke : un lot fraichement cree (aucun mouvement) doit
 * rester visible pour pouvoir recevoir du stock.
 */
export async function lotStocks(
  lotIds: number[],
  client: Pick<typeof prisma, 'move'> = prisma,
): Promise<Map<number, LotStock>> {
  const out = new Map<number, LotStock>();
  if (lotIds.length === 0) return out;
  for (const id of lotIds) {
    out.set(id, { quantity: new Prisma.Decimal(0), moved: false, sortiQty: new Prisma.Decimal(0), lastExitAt: null });
  }

  const moves = await client.move.findMany({
    where: { status: 'ACTIF', lotId: { in: lotIds } },
    select: { lotId: true, quantity: true, sens: true, movementDate: true, type: { select: { code: true } } },
  });
  for (const m of moves) {
    if (m.lotId == null) continue;
    const cur = out.get(m.lotId) ?? {
      quantity: new Prisma.Decimal(0),
      moved: false,
      sortiQty: new Prisma.Decimal(0),
      lastExitAt: null,
    };
    const q = dec(m.quantity);
    cur.quantity = cur.quantity.add(q.mul(m.sens));
    cur.moved = true;
    if (m.sens < 0 && m.type.code === 'SORTIE') {
      cur.sortiQty = cur.sortiQty.add(q);
      if (!cur.lastExitAt || m.movementDate > cur.lastExitAt) cur.lastExitAt = m.movementDate;
    }
    out.set(m.lotId, cur);
  }
  return out;
}

/**
 * Un lot est considere epuise lorsqu'il a deja ete mouvemente et que son solde est
 * exactement revenu a zero : il n'a plus rien a sortir, on le masque des listes et des
 * selecteurs. Il reapparait des que du stock revient (retour, annulation de reservation,
 * regularisation d'inventaire) car le calcul est fait a chaque lecture.
 *
 * Un solde NEGATIF n'est jamais masque : c'est une anomalie de donnees qui doit rester
 * visible pour etre corrigee.
 */
export function isLotExhausted(stock: LotStock | undefined): boolean {
  return !!stock && stock.moved && stock.quantity.equals(0);
}
