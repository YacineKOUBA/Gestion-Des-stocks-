// Liste fermee des devises utilisees par l'application (decision utilisateur).
export const CURRENCIES = [
  { code: 'DZD', label: 'Dinar algérien' },
  { code: 'USD', label: 'Dollar américain' },
  { code: 'EUR', label: 'Euro' },
  { code: 'CNY', label: 'Yuan chinois' },
  { code: 'GBP', label: 'Livre sterling' },
  { code: 'EGP', label: 'Livre égyptienne' },
  { code: 'MYR', label: 'Ringgit malaisien' },
] as const;

export const CURRENCY_CODES = [...CURRENCIES.map((c) => c.code)] as const;

export const DEFAULT_CURRENCY = 'DZD' as const;

export function isCurrencyCode(value: string | null | undefined): value is (typeof CURRENCY_CODES)[number] {
  return value != null && (CURRENCY_CODES as readonly string[]).includes(value);
}