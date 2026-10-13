"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOT_FLAGS_ALERTE = exports.LOT_FLAGS = exports.MOIS_VERT = exports.MOIS_ORANGE = void 0;
exports.lotFlag = lotFlag;
exports.expiryWhere = expiryWhere;
/** Mois avant expiration a partir duquel le lot passe en ORANGE puis en VERT (D24). */
exports.MOIS_ORANGE = 3;
exports.MOIS_VERT = 6;
function addMonths(date, months) {
    const d = new Date(date.getTime());
    d.setUTCMonth(d.getUTCMonth() + months);
    // 31 janvier + 1 mois deborderait sur mars ; on ramene au dernier jour du mois vise.
    const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (d.getUTCDate() > dernier)
        d.setUTCDate(dernier);
    return d;
}
/**
 * `lots.expiry_date` est une colonne `date` : elle ne peut representer qu'un JOUR, sans
 * heure. La regle se raisonne donc en jours, jamais en instants.
 *
 * C'est indispensable, pas cosmetique : l'attribut `expiryDate >= <instant>` est evalue
 * par PostgreSQL dans le fuseau de la SESSION (ici `Etc/GMT+11`), qui convertit
 * `2026-10-05` en `2026-10-05 11:00 UTC`. Un filtre `gte: 2026-10-05T09:29Z` laissait donc
 * passer la date du jour, que `lotFlag` classait pourtant `PERIME` puisque minuit etait
 * deja passe. Le badge et le filtre discutaient a 11 heures d'ecart, sans aucun message.
 * On raisonne desormais sur le jour UTC, commun aux deux.
 */
function jourUtc(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
/** Calcule le drapeau d'un lot a partir de sa date de peremption. null si pas de peremption. */
function lotFlag(expiryDate, now = new Date()) {
    if (!expiryDate)
        return null;
    const exp = new Date(expiryDate);
    if (Number.isNaN(exp.getTime()))
        return null;
    const auj = jourUtc(now);
    const e = jourUtc(exp);
    if (e.getTime() < auj.getTime())
        return 'PERIME';
    if (e.getTime() < addMonths(auj, exports.MOIS_ORANGE).getTime())
        return 'ORANGE';
    if (e.getTime() < addMonths(auj, exports.MOIS_VERT).getTime())
        return 'JAUNE';
    return 'VERT';
}
/** Tous les drapeaux acceptes, du plus urgent au plus calme : l'ordre des filtres de l'ecran. */
exports.LOT_FLAGS = ['PERIME', 'ORANGE', 'JAUNE', 'VERT'];
/** Drapeaux exigant une action : ce sont eux qui alimentent la carte d'alertes du tableau de bord. */
exports.LOT_FLAGS_ALERTE = ['PERIME', 'ORANGE'];
/**
 * Traduit un drapeau en bornes de date Prisma. Renvoie null pour un drapeau inconnu :
 * le filtre doit alors etre refuse plutot que d'ignorer silencieusement le criteres et
 * de renvoyer tous les lots, ce qui ferait croire a un filtre qui n'a rien filtre.
 */
function expiryWhere(flag, now = new Date()) {
    const f = flag.toUpperCase();
    // Bornes ramenees au jour UTC : voir jourUtc(). Sans cela, la meme date peut etre
    // PERIME sur le badge et ORANGE dans le filtre, selon le fuseau de la session.
    const auj = jourUtc(now);
    if (f === 'PERIME' || f === 'PERIMEE' || f === 'EXPIRE')
        return { expiryDate: { lt: auj } };
    if (f === 'ORANGE')
        return { expiryDate: { gte: auj, lt: addMonths(auj, exports.MOIS_ORANGE) } };
    if (f === 'JAUNE' || f === 'YELLOW') {
        return { expiryDate: { gte: addMonths(auj, exports.MOIS_ORANGE), lt: addMonths(auj, exports.MOIS_VERT) } };
    }
    if (f === 'VERT' || f === 'GREEN')
        return { expiryDate: { gte: addMonths(auj, exports.MOIS_VERT) } };
    return null;
}
//# sourceMappingURL=lotFlag.js.map