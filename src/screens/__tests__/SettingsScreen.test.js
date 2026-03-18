import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../../../app/settings';

const mockRouter = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
};

jest.mock('expo-router', () => ({
    router: mockRouter,
    Stack: {
        Screen: () => null,
    },
}));

// Vector icons can pull in native setup; replace with a plain component for stable render tests.
jest.mock('@expo/vector-icons/Feather', () => {
    const React = require('react');
    // Use a simple span-like element to avoid importing react-native's Text
    // which triggers Flow syntax parsing issues in CI
    return function MockFeather(props) {
        return React.createElement('Text', { testID: 'mock-feather' }, props.name || 'icon');
    };
});

// Keep DB side effects isolated; this test only validates screen render state.
jest.mock('../../../src/db', () => ({
    initDb: jest.fn().mockResolvedValue(undefined),
    getMeta: jest.fn(async (key) => (key === 'currency' ? 'EUR' : 'system')),
    setMeta: jest.fn().mockResolvedValue(undefined),
    getAllTransactions: jest.fn().mockResolvedValue([]),
    clearAllData: jest.fn().mockResolvedValue(undefined),
    insertTransactions: jest.fn().mockResolvedValue(undefined),
    getHoldingsMap: jest.fn().mockResolvedValue({}),
}));

// Avoid booting full i18next init pipeline for this simple render test.
jest.mock('../../../src/i18n', () => ({
    __esModule: true,
    default: {
        resolvedLanguage: 'en',
        changeLanguage: jest.fn().mockResolvedValue(true),
    },
    getSystemLanguage: jest.fn(() => 'en'),
}));

// Keep currency modal data tiny; the full list is unnecessary for this assertion.
jest.mock('../../../src/utils/currencies', () => ({
    getCurrencyOptions: jest.fn(() => [
        { code: 'EUR', name: 'Euro' },
        { code: 'USD', name: 'US Dollar' },
    ]),
}));

describe('SettingsScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders import and reset actions', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            expect(getByText('Import CSV')).toBeTruthy();
            expect(getByText('Reset All Data')).toBeTruthy();
        });
    });

    it('displays the build version at the top right', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            const versionText = getByText('v1.1.1');
            expect(versionText).toBeTruthy();
        });
    });
});
