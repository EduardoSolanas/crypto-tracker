/* global jest */
// Mock Dimensions
import { Dimensions } from 'react-native';

jest.mock('react-native-gesture-handler', () => {
    return {
        Swipeable: jest.fn(),
        DrawerLayout: jest.fn(),
        State: {},
        ScrollView: jest.fn(),
        Slider: jest.fn(),
        Switch: jest.fn(),
        TextInput: jest.fn(),
        ToolbarAndroid: jest.fn(),
        ViewPagerAndroid: jest.fn(),
        DrawerLayoutAndroid: jest.fn(),
        WebView: jest.fn(),
        NativeViewGestureHandler: jest.fn(),
        TapGestureHandler: jest.fn(),
        FlingGestureHandler: jest.fn(),
        ForceTouchGestureHandler: jest.fn(),
        LongPressGestureHandler: jest.fn(),
        PanGestureHandler: jest.fn(),
        PinchGestureHandler: jest.fn(),
        RotationGestureHandler: jest.fn(),
        RawButton: jest.fn(),
        BaseButton: jest.fn(),
        RectButton: jest.fn(),
        BorderlessButton: jest.fn(),
        FlatList: jest.fn(),
        gestureHandlerRootHOC: jest.fn(),
        Directions: {},
    };
}, { virtual: true });

jest.mock('react-native-reanimated', () => {
    return {
        default: {
            call: jest.fn(),
            createAnimatedComponent: (component) => component,
            event: jest.fn(),
            Value: jest.fn(),
            Node: jest.fn(),
        },
        useSharedValue: jest.fn(() => ({ value: 0 })),
        useAnimatedStyle: jest.fn(() => ({})),
        withTiming: jest.fn((val) => val),
        withSpring: jest.fn((val) => val),
        withRepeat: jest.fn(),
        Easing: { linear: jest.fn(), ease: jest.fn() },
    };
}, { virtual: true });

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
jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 812 });

jest.mock('expo-haptics', () => ({
    impactAsync: jest.fn(),
    ImpactFeedbackStyle: {
        Light: 'light',
        Medium: 'medium',
        Heavy: 'heavy',
    },
}));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-localization', () => ({
    getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en' }]),
}));

// Removed explicit ViewConfigIgnore mocks; rely on transpiled React Native internals.

jest.mock('react-native/Libraries/Renderer/shims/ReactNative', () => ({
    NativeComponent: {
        get: (name) => ({
            uiViewClassName: name,
            validAttributes: {},
        }),
    },
}), { virtual: true });

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => {
            if (options && options.count !== undefined) {
                return key.includes('Small') ? (options.count > 0 ? `Show ${options.count} Items` : key) : key;
            }
            return key;
        },
        i18n: {
            changeLanguage: jest.fn().mockResolvedValue(true),
            language: 'en',
            resolvedLanguage: 'en',
        },
    }),
    initReactI18next: {
        type: '3rdParty',
        init: jest.fn(),
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

jest.mock('react-native-svg', () => {
    const React = require('react');
    const { View } = require('react-native');
    const MockSvg = ({ children, ...props }) => React.createElement(View, { testID: 'svg', ...props }, children);
    const MockPath = (props) => React.createElement(View, { testID: 'svg-path', ...props });
    const MockLine = (props) => React.createElement(View, { testID: 'svg-line', ...props });
    const MockDefs = ({ children }) => React.createElement(View, null, children);
    const MockLinearGradient = ({ children }) => React.createElement(View, null, children);
    const MockStop = () => null;
    return {
        __esModule: true,
        default: MockSvg,
        Svg: MockSvg,
        Path: MockPath,
        Line: MockLine,
        Defs: MockDefs,
        LinearGradient: MockLinearGradient,
        Stop: MockStop,
    };
});
