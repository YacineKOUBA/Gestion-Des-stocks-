/**
 * Regle unique de calcul des drapeaux de peremption (source de verite unique).
 * Cahier des charges M4/M9 : < 6 mois = ROUGE, 6-12 mois = ORANGE, > 12 mois = VERT.
 * Un lot deja expire est marque PERIME.
 */
export type LotFlagCode = 'PERIME' | 'ROUGE' | 'ORANGE' | 'VERT';

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Calcule le drapeau d'un lot a partir de sa date de peremption. null si pas de peremption. */
export function lotFlag(
  expiryDate: Date | string | null | undefined,
  now: Date = new Date(),
): LotFlagCode | null {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return null;
  if (exp.getTime() < now.getTime()) return 'PERIME';
  if (exp.getTime() < addMonths(now, 6).getTime()) return 'ROUGE';
  if (exp.getTime() < addMonths(now, 12).getTime()) return 'ORANGE';
  return 'VERT';
}

/** Traduit un drapeau (ROUGE/RED, VERT/GREEN, ORANGE, PERIME) en bornes de date Prisma. */
export function expiryWhere(
  flag: string,
  now: Date = new Date(),
): { expiryDate?: { lt?: Date; gte?: Date; lte?: Date } } {
  const f = flag.toUpperCase();
  if (f === 'PERIME' || f === 'PERIMEE' || f === 'EXPIRE') return { expiryDate: { lt: now } };
  if (f === 'ROUGE' || f === 'RED') return { expiryDate: { gte: now, lt: addMonths(now, 6) } };
  if (f === 'ORANGE') return { expiryDate: { gte: addMonths(now, 6), lt: addMonths(now, 12) } };
  if (f === 'VERT' || f === 'GREEN') return { expiryDate: { gte: addMonths(now, 12) } };
  return {};
}
