import React from 'react';
import { act, render } from '@testing-library/react-native';
import StartupScreen from '../StartupScreen';
import { STARTUP_POLYGONS } from '../startupPolygons';

describe('StartupScreen fan animation', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const litCount = (screen) => screen.queryAllByTestId(/^startup-polygon-lit-/).length;

    it('lights polygons progressively over time without snapping to full', () => {
        const screen = render(<StartupScreen />);

        expect(screen.getByTestId('startup-screen')).toBeTruthy();
        const initialLit = litCount(screen);
        expect(initialLit).toBeGreaterThanOrEqual(1);
        expect(initialLit).toBeLessThan(STARTUP_POLYGONS.length);

        act(() => { jest.advanceTimersByTime(800); });
        const earlyLit = litCount(screen);
        expect(earlyLit).toBeGreaterThan(initialLit);
        expect(earlyLit).toBeLessThan(STARTUP_POLYGONS.length);

        act(() => { jest.advanceTimersByTime(8000); });
        expect(litCount(screen)).toBe(STARTUP_POLYGONS.length);
    });

    it('keeps animating at the same pace regardless of any progress prop', () => {
        const screen = render(<StartupScreen progress={1} />);

        const litNow = litCount(screen);
        expect(litNow).toBeLessThan(STARTUP_POLYGONS.length);

        act(() => { jest.advanceTimersByTime(160); });
        screen.rerender(<StartupScreen progress={1} />);
        const litAfterTwoTicks = litCount(screen);
        expect(litAfterTwoTicks).toBeGreaterThan(litNow);
        expect(litAfterTwoTicks).toBeLessThan(STARTUP_POLYGONS.length);
    });
});
