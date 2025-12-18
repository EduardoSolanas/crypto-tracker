
/**
 * Formats a number as currency with thousand separators and dynamic symbols.
 * @param {number|string} val The value to format.
 * @param {string} cur The currency code (EUR, USD, GBP, etc.)
 * @returns {string} Formatted currency string (e.g., "€ 1,234.56")
 */
export const formatMoney = (val, cur = 'EUR') => {
    const v = Number(val || 0);
    const symbols = { 'EUR': '€', 'USD': '$', 'GBP': '£' };
    const symbol = symbols[cur] || cur;
    return `${symbol} ${v.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
};

/**
 * Formats a number with thousand separators.
 * @param {number|string} val The value to format.
 * @param {number} decimals Number of decimal places.
 * @returns {string} Formatted number string (e.g., "1,234.56")
 */
export const formatNumber = (val, decimals = 2) => {
    const v = Number(val || 0);
    return v.toFixed(decimals).replace(/\d(?=(\d{3})+\.)/g, '$&,');
};
