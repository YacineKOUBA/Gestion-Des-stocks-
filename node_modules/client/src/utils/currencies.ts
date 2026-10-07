// Liste fermee des devises (doit rester synchronisee avec server/src/utils/currencies.ts).
export const CURRENCIES = [
  { code: 'DZD', label: 'Dinar algérien' },
  { code: 'USD', label: 'Dollar américain' },
  { code: 'EUR', label: 'Euro' },
  { code: 'CNY', label: 'Yuan chinois' },
  { code: 'GBP', label: 'Livre sterling' },
  { code: 'EGP', label: 'Livre égyptienne' },
  { code: 'MYR', label: 'Ringgit malaisien' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const CURRENCY_CODES: readonly string[] = CURRENCIES.map((c) => c.code);

export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` }));

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return value != null && (CURRENCY_CODES as readonly string[]).includes(value);
}