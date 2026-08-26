import { formatMoney } from '../format';

describe('formatMoney', () => {
    it('formats standard amounts with 2 decimal places', () => {
        const formatted = formatMoney(1234.56, 'EUR');
        expect(formatted).toMatch(/1,?234\.56/);
        expect(formatted).toContain('€');
    });

    it('formats zero as 2 decimal places without extra precision', () => {
        const formatted = formatMoney(0, 'EUR');
        expect(formatted).toMatch(/0\.00/);
        expect(formatted).toContain('€');
    });

    it('formats sub-cent amounts with up to 4 decimal places', () => {
        const formatted = formatMoney(0.0055, 'EUR');
        expect(formatted).toMatch(/0\.0055/);
        expect(formatted).toContain('€');
    });

    it('formats micro-priced amounts with up to 6 decimal places', () => {
        const formatted = formatMoney(0.000065, 'EUR');
        expect(formatted).toMatch(/0\.000065/);
        expect(formatted).toContain('€');
    });

    it('handles negative values correctly', () => {
        const formatted = formatMoney(-6632.89, 'EUR');
        expect(formatted).toMatch(/-.*6,?632\.89/);
    });

    it('handles null, undefined, and NaN gracefully', () => {
        expect(formatMoney(null, 'EUR')).toMatch(/0\.00/);
        expect(formatMoney(undefined, 'EUR')).toMatch(/0\.00/);
        expect(formatMoney(NaN, 'EUR')).toMatch(/0\.00/);
    });
});
