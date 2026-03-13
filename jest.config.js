process.env.EXPO_OS = process.env.EXPO_OS || 'test';
console.log('--- LOADING JEST CONFIG ---');
module.exports = {
    preset: 'jest-expo',
    moduleNameMapper: {
        'react-native-wagmi-charts': '<rootDir>/src/__mocks__/react-native-wagmi-charts',
        'react-native-chart-kit': '<rootDir>/src/__mocks__/react-native-chart-kit',
        // Mock NativeComponent files to avoid Flow syntax parsing issues
        'react-native/Libraries/NativeComponent/ViewConfigIgnore': '<rootDir>/src/__mocks__/ViewConfigIgnore.js',
        'react-native/Libraries/NativeComponent/BaseViewConfig': '<rootDir>/src/__mocks__/BaseViewConfig.js',
        'react-native/Libraries/NativeComponent/PlatformBaseViewConfig': '<rootDir>/src/__mocks__/PlatformBaseViewConfig.js',
        'react-native/Libraries/NativeComponent/ViewConfig': '<rootDir>/src/__mocks__/ViewConfig.js',
        '.*ViewConfigIgnore(.js)?$': '<rootDir>/src/__mocks__/ViewConfigIgnore.js',
        '.*BaseViewConfig(.js)?$': '<rootDir>/src/__mocks__/BaseViewConfig.js',
        '.*PlatformBaseViewConfig(.js)?$': '<rootDir>/src/__mocks__/PlatformBaseViewConfig.js',
        '.*ViewConfig(.js)?$': '<rootDir>/src/__mocks__/ViewConfig.js',
    },
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-.*|lucide-react-native|react-native-chart-kit|react-native-wagmi-charts)/)',
    ],
    transform: {
        '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    },
    setupFilesAfterEnv: [
        '@testing-library/react-native/extend-expect'
    ],
    setupFiles: [
        './jest.setup.js'
    ]
};
