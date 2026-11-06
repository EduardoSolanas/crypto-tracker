import React from 'react';
import { act, render } from '@testing-library/react-native';
import StartupScreen from '../StartupScreen';
import { STARTUP_POLYGONS } from '../startupPolygons';

const litCount = (screen) => screen.queryAllByTestId(/^startup-polygon-lit-/).length;

const settle = async (ms) => {
    await act(async () => {
        await new Promise((r) => setTimeout(r, ms));
    });
};

// Real timers only: fake-timer state leaked across suites under runInBand and
// hung the worker. The full 20-polygon sweep takes ~1.6 s of wall clock.
describe('StartupScreen fan animation', () => {
    it('lights polygons progressively over time until all are lit', async () => {
        const screen = render(<StartupScreen />);

        expect(screen.getByTestId('startup-screen')).toBeTruthy();
        const initialLit = litCount(screen);
        expect(initialLit).toBeGreaterThanOrEqual(1);
        expect(initialLit).toBeLessThan(STARTUP_POLYGONS.length);

        await settle(600);
        const earlyLit = litCount(screen);
        expect(earlyLit).toBeGreaterThan(initialLit);
        expect(earlyLit).toBeLessThan(STARTUP_POLYGONS.length);

        await settle(9600);
        expect(litCount(screen)).toBe(STARTUP_POLYGONS.length);
    }, 20000);
});
