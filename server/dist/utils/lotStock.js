"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotStocks = lotStocks;
exports.isLotExhausted = isLotExhausted;
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const decimal_1 = require("./decimal");
/**
 * Soldes de plusieurs lots en une seule requete, calcules par lot ET par entrepot /
 * emplacement quand on le souhaite. Un lot n'est isnt vraiment epuise que si son solde
 * revient a zero APRES avoir ete stocke : un lot fraichement cree (aucun mouvement) doit
 * rester visible pour pouvoir recevoir du stock.
 */
async function lotStocks(lotIds, client = prisma_1.prisma) {
    const out = new Map();
    if (lotIds.length === 0)
        return out;
    for (const id of lotIds) {
        out.set(id, { quantity: new client_1.Prisma.Decimal(0), moved: false, sortiQty: new client_1.Prisma.Decimal(0), lastExitAt: null });
    }
    const moves = await client.move.findMany({
        where: { status: 'ACTIF', lotId: { in: lotIds } },
        select: { lotId: true, quantity: true, sens: true, movementDate: true, type: { select: { code: true } } },
    });
    for (const m of moves) {
        if (m.lotId == null)
            continue;
        const cur = out.get(m.lotId) ?? {
            quantity: new client_1.Prisma.Decimal(0),
            moved: false,
            sortiQty: new client_1.Prisma.Decimal(0),
            lastExitAt: null,
        };
        const q = (0, decimal_1.dec)(m.quantity);
        cur.quantity = cur.quantity.add(q.mul(m.sens));
        cur.moved = true;
        if (m.sens < 0 && m.type.code === 'SORTIE') {
            cur.sortiQty = cur.sortiQty.add(q);
            if (!cur.lastExitAt || m.movementDate > cur.lastExitAt)
                cur.lastExitAt = m.movementDate;
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
function isLotExhausted(stock) {
    return !!stock && stock.moved && stock.quantity.equals(0);
}
//# sourceMappingURL=lotStock.js.map