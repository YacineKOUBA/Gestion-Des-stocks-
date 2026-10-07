/**
 * Regle unique de calcul des drapeaux de peremption (source de verite unique).
 *
 * D24 (demande directeur) : quatre niveaux, du plus urgent au plus calme.
 *   - lot deja expire                          -> PERIME  (drapeau rouge)
 *   - peremption dans moins de 3 mois         -> ORANGE  (drapeau orange)
 *   - peremption entre 3 mois et moins de 6   -> JAUNE   (drapeau jaune)
 *   - peremption dans plus de 6 mois          -> VERT    (drapeau vert)
 *
 * Ancienne regle (M4/M9) : < 6 mois = ROUGE, 6-12 mois = ORANGE, > 12 mois = VERT.
 * Le code ROUGE n'existe plus : le rouge designe desormais les seuls lots perimes,
 * qui gardent le code PERIME pour continuer a distinguer « perime » de « a surveiller »
 * dans les filtres et le journal. D'ou l'ajout du niveau JAUNE.
 *
 * Les periodes sont fixees ici, comme avant : une seule regle a lire, un seul endroit
 * a modifier. Les bornes sont inclusives a gauche, exclusives a droite, pour qu'un lot
 * a la borne exacte tombe toujours dans le niveau le plus severe qui s'applique.
 */
export type LotFlagCode = 'PERIME' | 'ORANGE' | 'JAUNE' | 'VERT';

/** Mois avant expiration a partir duquel le lot passe en ORANGE puis en VERT (D24). */
export const MOIS_ORANGE = 3;
export const MOIS_VERT = 6;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 janvier + 1 mois deborderait sur mars ; on ramene au dernier jour du mois vise.
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  if (d.getUTCDate() > dernier) d.setUTCDate(dernier);
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
function jourUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Calcule le drapeau d'un lot a partir de sa date de peremption. null si pas de peremption. */
export function lotFlag(
  expiryDate: Date | string | null | undefined,
  now: Date = new Date(),
): LotFlagCode | null {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return null;
  const auj = jourUtc(now);
  const e = jourUtc(exp);
  if (e.getTime() < auj.getTime()) return 'PERIME';
  if (e.getTime() < addMonths(auj, MOIS_ORANGE).getTime()) return 'ORANGE';
  if (e.getTime() < addMonths(auj, MOIS_VERT).getTime()) return 'JAUNE';
  return 'VERT';
}

/** Tous les drapeaux acceptes, du plus urgent au plus calme : l'ordre des filtres de l'ecran. */
export const LOT_FLAGS: LotFlagCode[] = ['PERIME', 'ORANGE', 'JAUNE', 'VERT'];

/** Drapeaux exigant une action : ce sont eux qui alimentent la carte d'alertes du tableau de bord. */
export const LOT_FLAGS_ALERTE: LotFlagCode[] = ['PERIME', 'ORANGE'];

/**
 * Traduit un drapeau en bornes de date Prisma. Renvoie null pour un drapeau inconnu :
 * le filtre doit alors etre refuse plutot que d'ignorer silencieusement le criteres et
 * de renvoyer tous les lots, ce qui ferait croire a un filtre qui n'a rien filtre.
 */
export function expiryWhere(
  flag: string,
  now: Date = new Date(),
): { expiryDate?: { lt?: Date; gte?: Date; lte?: Date } } | null {
  const f = flag.toUpperCase();
  // Bornes ramenees au jour UTC : voir jourUtc(). Sans cela, la meme date peut etre
  // PERIME sur le badge et ORANGE dans le filtre, selon le fuseau de la session.
  const auj = jourUtc(now);
  if (f === 'PERIME' || f === 'PERIMEE' || f === 'EXPIRE') return { expiryDate: { lt: auj } };
  if (f === 'ORANGE') return { expiryDate: { gte: auj, lt: addMonths(auj, MOIS_ORANGE) } };
  if (f === 'JAUNE' || f === 'YELLOW') {
    return { expiryDate: { gte: addMonths(auj, MOIS_ORANGE), lt: addMonths(auj, MOIS_VERT) } };
  }
  if (f === 'VERT' || f === 'GREEN') return { expiryDate: { gte: addMonths(auj, MOIS_VERT) } };
  return null;
}