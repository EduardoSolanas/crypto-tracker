import { formatQuantity } from '../format';

describe('formatQuantity', () => {
    it('keeps fractional holdings instead of truncating to 0', () => {
        expect(formatQuantity(0.42)).toBe('0.42');
        expect(formatQuantity(0.0001234)).toBe('0.0001234');
    });

    it('shows up to 2 decimals for holdings >= 1', () => {
        expect(formatQuantity(6.1)).toBe('6.1');
        expect(formatQuantity(1234.567)).toBe('1234.57');
    });

    it('handles zero and invalid input', () => {
        expect(formatQuantity(0)).toBe('0');
        expect(formatQuantity(null)).toBe('0');
        expect(formatQuantity(undefined)).toBe('0');
        expect(formatQuantity(NaN)).toBe('0');
    });
});
