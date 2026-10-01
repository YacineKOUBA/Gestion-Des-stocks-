import type { ZodType } from 'zod';
import { badRequest } from './apiError';

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

/** Convertit un identifiant de route (string) en BigInt avec erreur 400 si invalide. */
export function toBigInt(value: string): bigint {
  if (!/^\d+$/.test(value)) throw badRequest(`Identifiant invalide : ${value}`);
  return BigInt(value);
}

/** Convertit un identifiant de route (string) en number avec erreur 400 si invalide. */
export function toInt(value: string): number {
  if (!/^\d+$/.test(value)) throw badRequest(`Identifiant invalide : ${value}`);
  return Number(value);
}