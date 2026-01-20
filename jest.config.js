console.log('--- LOADING JEST CONFIG ---');
module.exports = {
    preset: 'jest-expo',
    transform: {
        '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    },
    moduleNameMapper: {
        'react-native-wagmi-charts': '<rootDir>/src/__mocks__/react-native-wagmi-charts',
        'react-native-chart-kit': '<rootDir>/src/__mocks__/react-native-chart-kit',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-wagmi-charts|react-native-chart-kit|react-native-reanimated|react-native-worklets)'
    ],
    setupFilesAfterEnv: [
        '@testing-library/jest-native/extend-expect'
    ],
    setupFiles: [
        './jest.setup.js'
    ]
};
