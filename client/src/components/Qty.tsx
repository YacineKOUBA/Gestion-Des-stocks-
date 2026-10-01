import type { ReactNode } from 'react';
import { formatNumber } from '../utils/format';

interface QtyProps {
  value: number | string | null | undefined;
  digits?: number;
  className?: string;
  /** Signe affiche avant la quantite (journal des mouvements). */
  sign?: '+' | '-' | '−' | null;
  /** Texte affiche apres la quantite, comme avant (unite, lot, etc.). */
  children?: ReactNode;
}

/**
 * Affiche une quantite. L'unite de mesure, quand elle est utile, est fournie
 * par l'appelant dans `children` : la valeur reste dans son unite de stockage.
 */
export function Qty({ value, digits, className, sign, children }: QtyProps) {
  return (
    <span className={className}>
      {sign}
      {formatNumber(value, digits)}
      {children}
    </span>
  );
}
