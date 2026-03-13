console.log('--- LOADING JEST CONFIG ---');
module.exports = {
    preset: 'jest-expo',
    moduleNameMapper: {
        'react-native-wagmi-charts': '<rootDir>/src/__mocks__/react-native-wagmi-charts',
        'react-native-chart-kit': '<rootDir>/src/__mocks__/react-native-chart-kit',
        '^react-native/Libraries/NativeComponent/ViewConfigIgnore(\\.js)?$': '<rootDir>/src/__mocks__/ViewConfigIgnore.js',
        '^\\./ViewConfigIgnore(\\.js)?$': '<rootDir>/src/__mocks__/ViewConfigIgnore.js',
    },
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|react-native-svg|react-native-gesture-handler|react-native-reanimated))',
    ],
    setupFilesAfterEnv: [
        '@testing-library/jest-native/extend-expect'
    ],
    setupFiles: [
        './jest.setup.js'
    ]
};
