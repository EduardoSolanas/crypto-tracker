/* global test */
import { formatMoney } from '../utils/format';

describe('formatMoney', () => {
    test('shows 2 decimal places if there is a fraction', () => {
        expect(formatMoney(1234.56, 'USD')).toContain('1,234.56');
        expect(formatMoney(1234.5, 'USD')).toContain('1,234.50');
        expect(formatMoney(1234.01, 'USD')).toContain('1,234.01');
    });

    test('always shows exactly 2 decimals if not .00', () => {
        // This is specifically testing the "show the price with always 2 decimal if it is not .00" requirement
        // Current implementation (Intl) *already* does this as we have minimumFractionDigits: 2
        // Let's ensure it stays that way if we modify the code later.
        const resultHalf = formatMoney(1234.5, 'USD');
        expect(resultHalf).toContain('1,234.50');

        const resultInt = formatMoney(1234, 'USD');
        expect(resultInt).not.toContain('.00');
        expect(resultInt).toMatch(/1,234/);
    });

    test('shows no decimal places if the value is an integer (.00)', () => {
        expect(formatMoney(1234.00, 'USD')).not.toContain('.00');
        expect(formatMoney(1234, 'USD')).not.toContain('.00');
        // Check exact match depending on locale, but focus on the absence of .00
        const result = formatMoney(1234, 'USD');
        expect(result).toMatch(/1,234/);
        expect(result).not.toContain('.00');
    });

    test('handles small fractional values correctly', () => {
        expect(formatMoney(0.01, 'USD')).toContain('0.01');
        expect(formatMoney(0, 'USD')).not.toContain('.00');
    });
});
