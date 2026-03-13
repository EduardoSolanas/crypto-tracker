/* global jest */
// Note: Avoid importing from 'react-native' at top level to prevent Flow syntax parsing issues
// The Dimensions mock is applied after Jest has fully initialized

// Configure RNTL to use predefined host component names to avoid Flow syntax parsing issues
import { configure } from '@testing-library/react-native';
configure({
    // This tells RNTL what the host component names are, avoiding auto-detection
    // which can fail due to Flow type syntax in RN internals
    hostComponentNames: {
        text: 'Text',
        textInput: 'TextInput',
        image: 'Image',
        switch: 'Switch',
        scrollView: 'ScrollView',
        modal: 'Modal',
    },
});

// Mock the mockComponent helper to prevent it from calling requireActual
// which would load react-native internals with Flow syntax
jest.mock('react-native/jest/mockComponent', () => {
    const React = require('react');
    return (moduleName) => {
        const SuperClass = React.Component;
        const name = moduleName.replace(/.*\//, '');
        return class extends SuperClass {
            static displayName = 'Mock' + name;
            render() {
                return React.createElement(name, this.props, this.props.children);
            }
        };
    };
}, { virtual: true });

// Mock Text component to avoid Flow syntax parsing issues in CI
// The jest-expo preset's mock tries to use requireActual which triggers Flow parsing
jest.mock('react-native/Libraries/Text/Text', () => {
    const React = require('react');
    const Text = React.forwardRef(({ children, style, testID, ...props }, ref) => {
        return React.createElement('Text', { ref, style, testID, ...props }, children);
    });
    Text.displayName = 'Text';
    return Text;
}, { virtual: true });

// ViewConfigIgnore is now mapped via jest.config.js moduleNameMapper

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

// Mock Dimensions - use jest.mock instead of spyOn to avoid importing react-native
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
    get: jest.fn().mockReturnValue({ width: 375, height: 812 }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
}), { virtual: true });

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
    // Use string element types to avoid importing react-native which triggers Flow parsing issues
    const MockView = ({ children }) => React.createElement('View', null, children);
    return {
        CandlestickChart: {
            Provider: MockView,
            Candles: () => null,
            Crosshair: () => null,
            PriceText: ({ style, children }) => React.createElement('View', { style }, children),
            DatetimeText: ({ style, children }) => React.createElement('View', { style }, children),
        },
        LineChart: {
            Provider: MockView,
            Path: () => null,
            CursorCrosshair: () => null,
            PriceText: ({ style, children }) => React.createElement('View', { style }, children),
        },
    };
});

jest.mock('react-native-chart-kit', () => ({
    LineChart: () => null,
}));

jest.mock('react-native-svg', () => {
    const React = require('react');
    // Use string element types to avoid importing react-native which triggers Flow parsing issues
    const MockSvg = ({ children, ...props }) => React.createElement('View', { testID: 'svg', ...props }, children);
    const MockPath = (props) => React.createElement('View', { testID: 'svg-path', ...props });
    const MockLine = (props) => React.createElement('View', { testID: 'svg-line', ...props });
    const MockDefs = ({ children }) => React.createElement('View', null, children);
    const MockLinearGradient = ({ children }) => React.createElement('View', null, children);
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
