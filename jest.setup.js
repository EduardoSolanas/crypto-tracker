import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');

    // The mock for `call` is not provided with the default export.
    Reanimated.default.call = () => { };

    return Reanimated;
});

// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({
    __esModule: true,
    default: {
        API: {
            setHasNativeAnimatedModel: jest.fn(),
            setNativeProps: jest.fn(),
        },
    },
}), { virtual: true });

// Mock Dimensions
import { Dimensions } from 'react-native';
jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 812 });

jest.mock('expo-haptics', () => ({
    impactAsync: jest.fn(),
    ImpactFeedbackStyle: {
        Light: 'light',
        Medium: 'medium',
        Heavy: 'heavy',
    },
}));

jest.mock('react-native-wagmi-charts', () => {
    const React = require('react');
    const { View } = require('react-native');
    const MockView = ({ children }) => <View>{children}</View>;
    return {
        CandlestickChart: {
            Provider: MockView,
            Candles: () => null,
            Crosshair: () => null,
            PriceText: ({ style, children }) => <View style={style}>{children}</View>,
            DatetimeText: ({ style, children }) => <View style={style}>{children}</View>,
        },
        LineChart: {
            Provider: MockView,
            Path: () => null,
            CursorCrosshair: () => null,
            PriceText: ({ style, children }) => <View style={style}>{children}</View>,
        },
    };
});

jest.mock('react-native-chart-kit', () => ({
    LineChart: () => null,
}));
