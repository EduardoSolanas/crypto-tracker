const React = require('react');
// Use string element types to avoid importing react-native which triggers Flow parsing issues in CI

module.exports = {
    LineChart: () => React.createElement('View', null),
};
