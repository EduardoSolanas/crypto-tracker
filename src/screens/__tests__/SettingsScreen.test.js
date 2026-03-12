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
    const { Text } = require('react-native');
    return function MockFeather(props) {
        return React.createElement(Text, null, props.name || 'icon');
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
});
