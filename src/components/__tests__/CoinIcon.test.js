import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
        const { getByTestId, queryByTestId } = render(
            <CoinIcon symbol="BTC" imageUrl={null} size={40} />
        );

        const image = await waitFor(() => getByTestId('coin-icon-image'));
        fireEvent(image, 'error');

        await waitFor(() => {
            expect(queryByTestId('coin-icon-fallback')).toBeNull();
        });

        fireEvent(getByTestId('coin-icon-image'), 'error');

        await waitFor(() => {
            expect(getByTestId('coin-icon-fallback')).toBeTruthy();
        });
    });
});
