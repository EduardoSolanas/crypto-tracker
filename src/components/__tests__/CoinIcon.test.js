import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CoinIcon from '../CoinIcon';

jest.mock('../../utils/iconCache', () => ({
    getCachedIconUri: jest.fn(async () => 'https://bad.example/icon.png'),
    getIconFallbackUris: jest.fn(() => [
        'https://bad.example/icon.png',
        'https://fallback.example/icon.png',
    ]),
}));

describe('CoinIcon', () => {
    it('uses fallback uri before showing text fallback', async () => {
        const screen = render(
            <CoinIcon symbol="BTC" imageUrl={null} size={40} />
        );

        // Flush the icon-load promise deterministically (microtasks, no timers).
        await act(async () => {});

        fireEvent(screen.getByTestId('coin-icon-image'), 'error');
        await act(async () => {});

        // First error advanced to the second fallback URI: image still shown.
        expect(screen.queryByTestId('coin-icon-fallback')).toBeNull();

        fireEvent(screen.getByTestId('coin-icon-image'), 'error');
        await act(async () => {});

        // Second error exhausted the fallback list: letter fallback shown.
        expect(screen.getByTestId('coin-icon-fallback')).toBeTruthy();
    });
});
