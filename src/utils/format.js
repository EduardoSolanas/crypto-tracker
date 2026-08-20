/**
 * Formats a number as currency with locale-aware separators and symbols.
 * @param {number|string} val The value to format.
 * @param {string} cur The currency code (EUR, USD, GBP, etc.)
 * @returns {string} Formatted currency string.
 */
export const formatMoney = (val, cur = 'EUR') => {
    const v = Number(val || 0);

    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: cur || 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(v);
    } catch (_e) {
        return `${cur} ${v.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
    }
};

/**
 * Formats a coin quantity with sensible precision.
 * Large holdings (>= 1) show up to 2 decimals; fractional holdings keep
 * up to 4 significant digits so small balances are not truncated to "0".
 * Trailing zeros are trimmed.
 * @param {number|string} val The quantity to format.
 * @returns {string} Formatted quantity string.
 */
export const formatQuantity = (val) => {
    const v = Number(val || 0);
    if (!Number.isFinite(v) || v === 0) return '0';
    const rounded = Math.abs(v) >= 1 ? Number(v.toFixed(2)) : Number(v.toPrecision(4));
    return String(rounded);
};

/**
 * Formats a number with locale-aware separators.
 * @param {number|string} val The value to format.
 * @param {number} decimals Number of decimal places.
 * @returns {string} Formatted number string.
 */
export const formatNumber = (val, decimals = 2) => {
    const v = Number(val || 0);

    try {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(v);
    } catch (_e) {
        return v.toFixed(decimals).replace(/\d(?=(\d{3})+\.)/g, '$&,');
    }
};

const CURRENCY_SYMBOLS = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    JPY: '¥',
    CHF: 'CHF ',
    CAD: 'CA$',
    AUD: 'AUD ',
};

/**
 * Formats a monetary value into a compact representation (e.g. €70K, $100K, €1.2M).
 * Ideal for chart Y-axis labels and tight space constraints.
 * @param {number|string} val The value to format.
 * @param {string} cur The currency code (EUR, USD, etc.).
 * @returns {string} Compact formatted currency string.
 */
export const formatCompactMoney = (val, cur = 'EUR') => {
    if (val === null || val === undefined || val === '') return '';
    const n = Number(val);
    if (!Number.isFinite(n)) return '';

    const isNegative = n < 0;
    const abs = Math.abs(n);
    const currCode = (cur || 'USD').toUpperCase();
    const sym = CURRENCY_SYMBOLS[currCode] || `${currCode} `;
    const sign = isNegative ? '-' : '';

    if (abs === 0) {
        return `${sym}0`;
    }

    if (abs >= 1e9) {
        const num = (abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1).replace(/\.0$/, '');
        return `${sign}${sym}${num}B`;
    }
    if (abs >= 1e6) {
        const num = (abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '');
        return `${sign}${sym}${num}M`;
    }
    if (abs >= 1e3) {
        const num = (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '');
        return `${sign}${sym}${num}K`;
    }
    if (abs >= 10) {
        return `${sign}${sym}${abs.toFixed(0)}`;
    }
    if (abs >= 1) {
        return `${sign}${sym}${abs.toFixed(2).replace(/\.?0+$/, '')}`;
    }
    if (abs >= 0.01) {
        return `${sign}${sym}${abs.toFixed(2)}`;
    }
    if (abs >= 0.0001) {
        return `${sign}${sym}${abs.toFixed(4)}`;
    }
    return `${sign}${sym}${abs.toFixed(6).replace(/0+$/, '')}`;
};
