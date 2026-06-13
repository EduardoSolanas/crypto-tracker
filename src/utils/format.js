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
