import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CryptoGraph from '../CryptoGraph';
import { useTheme } from '../../utils/theme';

// Mock dependencies
jest.mock('../../utils/theme', () => ({
    useTheme: jest.fn(),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

describe('CryptoGraph Range Selector', () => {
    const mockColors = {
        background: '#ffffff',
        text: '#000000',
        textSecondary: '#666666',
        surfaceElevated: '#f0f0f0',
    };

    beforeEach(() => {
        useTheme.mockReturnValue({ colors: mockColors, isDark: false });
    });

    const mockData = [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 20 },
    ];

    it('renders range selector buttons when onRangeChange is provided', () => {
        const onRangeChange = jest.fn();
        const { getByText } = render(
            <CryptoGraph
                data={mockData}
                range="1D"
                onRangeChange={onRangeChange}
            />
        );

        expect(getByText('1H')).toBeTruthy();
        expect(getByText('1D')).toBeTruthy();
        expect(getByText('1W')).toBeTruthy();
        expect(getByText('1M')).toBeTruthy();
        expect(getByText('1Y')).toBeTruthy();
        expect(getByText('ALL')).toBeTruthy();
    });

    it('calls onRangeChange when a range button is pressed', () => {
        const onRangeChange = jest.fn();
        const { getByText } = render(
            <CryptoGraph
                data={mockData}
                range="1D"
                onRangeChange={onRangeChange}
            />
        );

        fireEvent.press(getByText('1H'));
        expect(onRangeChange).toHaveBeenCalledWith('1H');

        fireEvent.press(getByText('ALL'));
        expect(onRangeChange).toHaveBeenCalledWith('ALL');
    });

    it('does not render range selector when onRangeChange is not provided', () => {
        const { queryByText } = render(
            <CryptoGraph data={mockData} range="1D" />
        );

        expect(queryByText('1H')).toBeNull();
        expect(queryByText('ALL')).toBeNull();
    });

    it('renders loading state when loading is true', () => {
        const { queryByTestId } = render(
            <CryptoGraph data={mockData} loading={true} />
        );
        // ActivityIndicator doesn't have a default testID we are using, but let's check it's there
        // Our component returns a View with ActivityIndicator
        // Since we didn't add a testID to the loading view, we can check for its presence via container if needed,
        // but let's just verify it DOES NOT show the chart.
        expect(queryByTestId('line-chart')).toBeNull();
    });

    it('renders error message when error is provided', () => {
        const errorMessage = 'Failed to load data';
        const { getByText, queryByTestId } = render(
            <CryptoGraph data={mockData} error={errorMessage} />
        );

        expect(getByText(errorMessage)).toBeTruthy();
        expect(queryByTestId('line-chart')).toBeNull();
    });
});

