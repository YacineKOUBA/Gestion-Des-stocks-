"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CURRENCY = exports.CURRENCY_CODES = exports.CURRENCIES = void 0;
exports.isCurrencyCode = isCurrencyCode;
// Liste fermee des devises utilisees par l'application (decision utilisateur).
exports.CURRENCIES = [
    { code: 'DZD', label: 'Dinar algérien' },
    { code: 'USD', label: 'Dollar américain' },
    { code: 'EUR', label: 'Euro' },
    { code: 'CNY', label: 'Yuan chinois' },
    { code: 'GBP', label: 'Livre sterling' },
    { code: 'EGP', label: 'Livre égyptienne' },
    { code: 'MYR', label: 'Ringgit malaisien' },
];
exports.CURRENCY_CODES = [...exports.CURRENCIES.map((c) => c.code)];
exports.DEFAULT_CURRENCY = 'DZD';
function isCurrencyCode(value) {
    return value != null && exports.CURRENCY_CODES.includes(value);
}
//# sourceMappingURL=currencies.js.map