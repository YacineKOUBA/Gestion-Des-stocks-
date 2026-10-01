import { Prisma } from '@prisma/client';

export type Dec = Prisma.Decimal;

/** Convertit une valeur Prisma.Decimal | number | string | null en Prisma.Decimal sur. */
export function dec(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Arrondit un Decimal vers un number JavaScript (pour la serialisation JSON). */
export function toNumber(value: Prisma.Decimal | null | undefined, digits = 3): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toFixed(digits));
}

/** Somme precise d'une liste de quantites/prix (evite les erreurs d'arrondi flottantes). */
export function sumDecimals(
  values: Array<Prisma.Decimal | number | string | null | undefined>,
): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.add(dec(v)), new Prisma.Decimal(0));
}
