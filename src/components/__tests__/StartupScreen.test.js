import React from 'react';
import { render } from '@testing-library/react-native';
import StartupScreen, { STARTUP_POLYGONS } from '../StartupScreen';

describe('StartupScreen polygon progress', () => {
    it('lights more polygons as progress increases from 0 to 1', () => {
        const { getByTestId, queryAllByTestId, rerender } = render(<StartupScreen progress={0.1} />);

        expect(getByTestId('startup-screen')).toBeTruthy();
        const initialLit = queryAllByTestId(/^startup-polygon-lit-/).length;
        expect(initialLit).toBeGreaterThanOrEqual(1);
        expect(initialLit).toBeLessThan(STARTUP_POLYGONS.length);

        rerender(<StartupScreen progress={0.5} />);
        const midLit = queryAllByTestId(/^startup-polygon-lit-/).length;
        expect(midLit).toBeGreaterThan(initialLit);

        rerender(<StartupScreen progress={1} />);
        const fullLit = queryAllByTestId(/^startup-polygon-lit-/).length;
        expect(fullLit).toBe(STARTUP_POLYGONS.length);
    });
});
