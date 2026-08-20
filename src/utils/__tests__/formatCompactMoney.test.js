import { formatCompactMoney } from '../format';

describe('formatCompactMoney', () => {
    it('returns empty string for invalid numbers', () => {
        expect(formatCompactMoney(null)).toBe('');
        expect(formatCompactMoney(undefined)).toBe('');
        expect(formatCompactMoney('abc')).toBe('');
        expect(formatCompactMoney(NaN)).toBe('');
    });

    it('formats 0 correctly', () => {
        expect(formatCompactMoney(0, 'EUR')).toBe('€0');
        expect(formatCompactMoney(0, 'USD')).toBe('$0');
    });

    it('formats thousands with K', () => {
        expect(formatCompactMoney(70000, 'EUR')).toBe('€70K');
        expect(formatCompactMoney(100000, 'USD')).toBe('$100K');
        expect(formatCompactMoney(15400, 'USD')).toBe('$15.4K');
        expect(formatCompactMoney(760697, 'EUR')).toBe('€761K');
        expect(formatCompactMoney(1000, 'GBP')).toBe('£1K');
    });

    it('formats millions with M', () => {
        expect(formatCompactMoney(1246548, 'EUR')).toBe('€1.2M');
        expect(formatCompactMoney(12000000, 'USD')).toBe('$12M');
        expect(formatCompactMoney(3500000, 'EUR')).toBe('€3.5M');
    });

    it('formats billions with B', () => {
        expect(formatCompactMoney(1500000000, 'USD')).toBe('$1.5B');
        expect(formatCompactMoney(20000000000, 'EUR')).toBe('€20B');
    });

    it('formats sub-thousand values cleanly without decimal clutter', () => {
        expect(formatCompactMoney(350, 'EUR')).toBe('€350');
        expect(formatCompactMoney(12, 'USD')).toBe('$12');
    });

    it('formats fractional values for small asset prices', () => {
        expect(formatCompactMoney(0.85, 'EUR')).toBe('€0.85');
        expect(formatCompactMoney(0.0045, 'USD')).toBe('$0.0045');
        expect(formatCompactMoney(0.000012, 'USD')).toBe('$0.000012');
    });

    it('handles negative amounts correctly', () => {
        expect(formatCompactMoney(-70000, 'EUR')).toBe('-€70K');
        expect(formatCompactMoney(-1246548, 'USD')).toBe('-$1.2M');
    });

    it('supports arbitrary currency codes', () => {
        expect(formatCompactMoney(50000, 'AUD')).toBe('AUD 50K');
        expect(formatCompactMoney(50000, 'CHF')).toBe('CHF 50K');
    });
});
