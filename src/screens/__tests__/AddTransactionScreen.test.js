import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AddTransactionScreen from '../../../app/add-transaction';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => key === 'addTransaction.pricePerCoinLabel'
            ? `Price per Coin (${options.currency})`
            : ({
                'addTransaction.saveTransaction': 'Save Transaction',
                'addTransaction.manualEntry': 'Manual entry',
            }[key] || key),
    }),
}));

jest.mock('expo-router', () => ({
    router: { back: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({ id: '1' })),
}));

jest.mock('../../../src/db', () => ({
    initDb: jest.fn().mockResolvedValue(undefined),
    getMeta: jest.fn().mockResolvedValue('EUR'),
    getTransactionById: jest.fn().mockResolvedValue({
        id: 1,
        symbol: 'BTC',
        way: 'BUY',
        amount: 2,
        quote_amount: 100,
        quote_currency: 'USD',
        date_iso: '2024-01-01T00:00:00.000Z',
    }),
    updateTransaction: jest.fn().mockResolvedValue(undefined),
    syncHoldingsForSymbol: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#000', text: '#fff', textSecondary: '#999', surface: '#111',
            primary: '#3b82f6', primaryInverse: '#fff',
        },
    }),
}));

describe('AddTransactionScreen edit currency', () => {
    it('retains the existing transaction quote currency when saved', async () => {
        const { getByText } = render(<AddTransactionScreen />);
        const db = require('../../../src/db');

        await waitFor(() => expect(getByText('Price per Coin (USD)')).toBeTruthy());
        fireEvent.press(getByText('Save Transaction'));

        await waitFor(() => {
            expect(db.updateTransaction).toHaveBeenCalledWith('1', expect.objectContaining({
                quoteCurrency: 'USD',
            }));
        });
    });
});
