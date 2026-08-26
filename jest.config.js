console.log('--- LOADING JEST CONFIG ---');
module.exports = {
    preset: 'jest-expo',
    transform: {
        '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    },
    moduleNameMapper: {
        'react-native-wagmi-charts': '<rootDir>/src/__mocks__/react-native-wagmi-charts',
        'react-native-chart-kit': '<rootDir>/src/__mocks__/react-native-chart-kit',
        '^d3-shape$': '<rootDir>/node_modules/d3-shape/dist/d3-shape.js',
        '^d3-path$': '<rootDir>/node_modules/d3-path/dist/d3-path.js',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-wagmi-charts|react-native-chart-kit|react-native-reanimated|react-native-worklets|d3-(shape|path))'
    ],
    setupFilesAfterEnv: [
        '@testing-library/jest-native/extend-expect'
    ],
    setupFiles: [
        './jest.setup.js'
    ]
};
