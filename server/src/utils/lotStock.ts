import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { dec } from './decimal';

export interface LotStock {
  /** Solde du lot : somme des mouvements ACTIF de CE lot uniquement (recus - sortis). */
  quantity: Prisma.Decimal;
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
 * emplacement quand on le souhaite. Le solde d'un lot neuf sans mouvement est zero.
 */
export async function lotStocks(
  lotIds: number[],
  client: Pick<typeof prisma, 'move'> = prisma,
): Promise<Map<number, LotStock>> {
  const out = new Map<number, LotStock>();
  if (lotIds.length === 0) return out;
  for (const id of lotIds) {
    out.set(id, { quantity: new Prisma.Decimal(0), sortiQty: new Prisma.Decimal(0), lastExitAt: null });
  }

  const moves = await client.move.findMany({
    where: { status: 'ACTIF', lotId: { in: lotIds } },
    select: { lotId: true, quantity: true, sens: true, movementDate: true, type: { select: { code: true } } },
  });
  for (const m of moves) {
    if (m.lotId == null) continue;
    const cur = out.get(m.lotId) ?? {
      quantity: new Prisma.Decimal(0),
      sortiQty: new Prisma.Decimal(0),
      lastExitAt: null,
    };
    const q = dec(m.quantity);
    cur.quantity = cur.quantity.add(q.mul(m.sens));
    if (m.sens < 0 && m.type.code === 'SORTIE') {
      cur.sortiQty = cur.sortiQty.add(q);
      if (!cur.lastExitAt || m.movementDate > cur.lastExitAt) cur.lastExitAt = m.movementDate;
    }
    out.set(m.lotId, cur);
  }
  return out;
}

/**
 * Un lot est epuise des que son solde ACTIF est exactement ZERO, qu'il ait deja ete
 * mouvemente ou non. On le masque des listes et des selecteurs par defaut ; le filtre
 * `includeExhausted` permet de le revoir, notamment pour le supprimer.
 *
 * Les operations qui font ENTRER du stock demandent explicitement les lots epuises :
 * un lot neuf a zero doit pouvoir etre choisi pour sa premiere reception.
 *
 * Un solde NEGATIF n'est jamais masque : c'est une anomalie de donnees qui doit rester
 * visible pour etre corrigee.
 */
export function isLotExhausted(stock: LotStock | undefined): boolean {
  return !!stock && stock.quantity.equals(0);
}
