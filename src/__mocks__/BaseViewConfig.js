// Mock for react-native/Libraries/NativeComponent/BaseViewConfig
// Avoids Flow syntax parsing issues in jest

module.exports = {
    __esModule: true,
    default: {
        uiViewClassName: 'RCTView',
        validAttributes: {
            accessibilityLabel: true,
            accessibilityHint: true,
            accessibilityRole: true,
            accessibilityState: true,
            accessibilityValue: true,
            testID: true,
            nativeID: true,
            hitSlop: true,
            pointerEvents: true,
            style: true,
            onLayout: true,
        },
    },
};

