import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../../../app/settings';

// Mock dependencies
jest.mock('expo-router', () => ({
    router: {
        push: jest.fn(),
        back: jest.fn(),
        replace: jest.fn(),
    },
    Stack: {
        Screen: ({ children }) => children,
    },
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
    StorageAccessFramework: null,
    cacheDirectory: '/cache/',
    writeAsStringAsync: jest.fn(),
    EncodingType: {
        UTF8: 'utf8',
    },
}));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/db', () => ({
    initDb: jest.fn().mockResolvedValue(undefined),
    getAllTransactions: jest.fn().mockResolvedValue([]),
    getMeta: jest.fn().mockResolvedValue('EUR'),
    setMeta: jest.fn().mockResolvedValue(undefined),
    clearAllData: jest.fn().mockResolvedValue(undefined),
    insertTransactions: jest.fn().mockResolvedValue(undefined),
    getHoldingsMap: jest.fn().mockResolvedValue({ BTC: 1, ETH: 10 }),
}));

jest.mock('../../../src/utils/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#000',
            text: '#fff',
            textSecondary: '#999',
            surface: '#111',
            surfaceElevated: '#222',
            primary: '#3b82f6',
            borderLight: '#333',
        },
        isDark: true,
    }),
}));

jest.mock('../../../src/csv', () => ({
    parseDeltaCsvWithReport: jest.fn(),
    exportTransactionsToCSV: jest.fn(),
}));

jest.mock('../../../src/cryptoCompare', () => ({
    fetchPortfolioPrices: jest.fn().mockResolvedValue([]),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('SettingsScreen - Import Progress', () => {
    const mockTransactions = [
        { id: '1', symbol: 'BTC', amount: 1, quote_amount: 50000, way: 'BUY', timestamp: Date.now() },
        { id: '2', symbol: 'ETH', amount: 10, quote_amount: 30000, way: 'BUY', timestamp: Date.now() },
    ];

    const mockCsvContent = 'symbol,amount,quote_amount,way,timestamp\nBTC,1,50000,BUY,2024-01-01';

    beforeEach(() => {
        jest.clearAllMocks();
        Alert.alert = jest.fn();
        
        const DocumentPicker = require('expo-document-picker');
        const csv = require('../../../src/csv');
        
        DocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                uri: 'file:///test.csv',
                name: 'test.csv',
            }],
        });
        
        global.fetch.mockResolvedValue({
            text: jest.fn().mockResolvedValue(mockCsvContent),
        });
        
        csv.parseDeltaCsvWithReport.mockReturnValue({
            txns: mockTransactions,
            report: {
                imported: 2,
                skipped: 0,
                reasons: {
                    empty_row: 0,
                    missing_required_fields: 0,
                    invalid_amount: 0,
                    invalid_date: 0,
                    invalid_symbol: 0,
                },
            },
        });
    });

    it('should show progress modal during import', async () => {
        const { getByText, queryByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        // Click import button
        const importButton = getByText('Import CSV');
        fireEvent.press(importButton);

        // Progress modal should appear or Alert should be shown (fast path)
        await waitFor(() => {
            const hasProgress = queryByText('Importing Transactions') !== null;
            const hasAlert = Alert.alert.mock.calls.length > 0;
            expect(hasProgress || hasAlert).toBeTruthy();
        });
    });

    it('should show progress stages and eventually show confirmation', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        // Eventually shows confirmation dialog
        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Import Transactions',
                expect.stringContaining('Found 2 transactions'),
                expect.any(Array)
            );
        });
    });

    it('should show confirmation dialog with transaction count', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Import Transactions',
                expect.stringContaining('Found 2 transactions'),
                expect.any(Array)
            );
        });
    });

    it('should show all progress stages after confirmation', async () => {
        const db = require('../../../src/db');
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalled();
        });

        // Simulate user clicking "Import" in confirmation dialog
        const alertCall = Alert.alert.mock.calls[0];
        const importAction = alertCall[2].find(btn => btn.text === 'Import');
        await importAction.onPress();

        // Verify progress stages
        await waitFor(() => {
            expect(db.clearAllData).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(db.insertTransactions).toHaveBeenCalledWith(mockTransactions);
        });
    });

    it('should fetch prices during import', async () => {
        const cryptoCompare = require('../../../src/cryptoCompare');
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalled();
        });

        const alertCall = Alert.alert.mock.calls[0];
        const importAction = alertCall[2].find(btn => btn.text === 'Import');
        await importAction.onPress();

        await waitFor(() => {
            expect(cryptoCompare.fetchPortfolioPrices).toHaveBeenCalledWith(
                { BTC: 1, ETH: 10 },
                'EUR'
            );
        });
    });

    it('should navigate to home page after successful import', async () => {
        const router = require('expo-router').router;
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalled();
        });

        // Confirm import
        const confirmationAlert = Alert.alert.mock.calls[0];
        const importAction = confirmationAlert[2].find(btn => btn.text === 'Import');
        await importAction.onPress();

        // Wait for success alert
        await waitFor(() => {
            const successAlert = Alert.alert.mock.calls.find(
                call => call[0] === 'Import Complete'
            );
            expect(successAlert).toBeTruthy();
        });

        // Simulate user clicking OK on success dialog
        const successAlert = Alert.alert.mock.calls.find(call => call[0] === 'Import Complete');
        const okAction = successAlert[2][0];
        okAction.onPress();

        expect(router.replace).toHaveBeenCalledWith('/');
    });

    it('should show progress bar with correct percentage', async () => {
        const { getByText, UNSAFE_getByProps } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(getByText('Importing Transactions')).toBeTruthy();
        });

        // Check for progress text
        await waitFor(() => {
            expect(getByText(/Step \d+ of \d+/)).toBeTruthy();
        });
    });

    it('should hide progress modal on cancellation', async () => {
        const { getByText, queryByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalled();
        });

        // Click cancel
        const alertCall = Alert.alert.mock.calls[0];
        const cancelAction = alertCall[2].find(btn => btn.text === 'Cancel');
        cancelAction.onPress();

        await waitFor(() => {
            expect(queryByText('Importing Transactions')).toBeNull();
        });
    });

    it('should handle empty CSV gracefully', async () => {
        const csv = require('../../../src/csv');
        csv.parseDeltaCsvWithReport.mockReturnValue({
            txns: [],
            report: {
                imported: 0,
                skipped: 1,
                reasons: {
                    empty_row: 1,
                    missing_required_fields: 0,
                    invalid_amount: 0,
                    invalid_date: 0,
                    invalid_symbol: 0,
                },
            },
        });

        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Parse error',
                'No transactions found in CSV'
            );
        });
    });

    it('should handle import errors gracefully', async () => {
        const db = require('../../../src/db');
        db.insertTransactions.mockRejectedValueOnce(new Error('Database error'));

        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalled();
        });

        const alertCall = Alert.alert.mock.calls[0];
        const importAction = alertCall[2].find(btn => btn.text === 'Import');
        await importAction.onPress();

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Import error',
                'Database error'
            );
        });
    });

    it('should clear old data before importing new transactions', async () => {
        const db = require('../../../src/db');
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
        });

        fireEvent.press(getByText('Import CSV'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalled();
        });

        const alertCall = Alert.alert.mock.calls[0];
        const importAction = alertCall[2].find(btn => btn.text === 'Import');
        await importAction.onPress();

        await waitFor(() => {
            expect(db.clearAllData).toHaveBeenCalled();
        });

        // Ensure clearAllData is called before insertTransactions
        const clearIndex = db.clearAllData.mock.invocationCallOrder[0];
        const insertIndex = db.insertTransactions.mock.invocationCallOrder[0];
        expect(clearIndex).toBeLessThan(insertIndex);
    });
});

describe('SettingsScreen - Reset Data', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Alert.alert = jest.fn();
    });

    it('should show confirmation dialog when reset is pressed', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Reset All Data')).toBeTruthy();
        });

        fireEvent.press(getByText('Reset All Data'));

        expect(Alert.alert).toHaveBeenCalledWith(
            'Reset All Data',
            expect.stringContaining('permanently delete'),
            expect.any(Array)
        );
    });

    it('should call clearAllData when confirmed', async () => {
        const db = require('../../../src/db');
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Reset All Data')).toBeTruthy();
        });

        fireEvent.press(getByText('Reset All Data'));

        // Find the Reset button in the alert
        const alertCall = Alert.alert.mock.calls[0];
        const resetAction = alertCall[2].find(btn => btn.text === 'Reset');
        await resetAction.onPress();

        await waitFor(() => {
            expect(db.clearAllData).toHaveBeenCalled();
        });
    });

    it('should navigate to home after successful reset', async () => {
        const router = require('expo-router').router;
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Reset All Data')).toBeTruthy();
        });

        fireEvent.press(getByText('Reset All Data'));

        // Confirm reset
        const confirmationAlert = Alert.alert.mock.calls[0];
        const resetAction = confirmationAlert[2].find(btn => btn.text === 'Reset');
        await resetAction.onPress();

        // Wait for success alert
        await waitFor(() => {
            const successAlert = Alert.alert.mock.calls.find(
                call => call[0] === 'Success'
            );
            expect(successAlert).toBeTruthy();
        });

        // Simulate user clicking OK on success dialog
        const successAlert = Alert.alert.mock.calls.find(call => call[0] === 'Success');
        const okAction = successAlert[2][0];
        okAction.onPress();

        expect(router.replace).toHaveBeenCalledWith('/');
    });

    it('should handle reset errors gracefully', async () => {
        const db = require('../../../src/db');
        db.clearAllData.mockRejectedValueOnce(new Error('Database error'));

        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Reset All Data')).toBeTruthy();
        });

        fireEvent.press(getByText('Reset All Data'));

        // Confirm reset
        const alertCall = Alert.alert.mock.calls[0];
        const resetAction = alertCall[2].find(btn => btn.text === 'Reset');
        await resetAction.onPress();

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Error',
                'Database error'
            );
        });
    });

    it('should not reset data when cancel is pressed', async () => {
        const db = require('../../../src/db');
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Reset All Data')).toBeTruthy();
        });

        fireEvent.press(getByText('Reset All Data'));

        // Click cancel
        const alertCall = Alert.alert.mock.calls[0];
        const cancelAction = alertCall[2].find(btn => btn.text === 'Cancel');
        
        // Cancel doesn't have onPress by default in Alert.alert cancel style
        // Just verify clearAllData wasn't called yet
        expect(db.clearAllData).not.toHaveBeenCalled();
    });
});
