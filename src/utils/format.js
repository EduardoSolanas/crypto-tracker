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
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(v);
    } catch (_e) {
        const rounded = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.00$/, '');
        const [intPart, fracPart] = rounded.split('.');
        const withGroups = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${cur} ${fracPart ? `${withGroups}.${fracPart}` : withGroups}`;
    }
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
