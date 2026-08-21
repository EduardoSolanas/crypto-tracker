const React = require('react');
const { View, Text } = require('react-native');

const MockView = ({ children }) => React.createElement(View, null, children);
const MockText = ({ style, children }) => React.createElement(Text, { style }, children);

// Create LineChart as a component function
function LineChartComponent({ children, width, height }) {
    return React.createElement(View, { testID: 'line-chart' }, children);
}

// Add sub-components as properties
LineChartComponent.Provider = MockView;
LineChartComponent.Path = () => null;
LineChartComponent.CursorCrosshair = () => null;
LineChartComponent.PriceText = MockText;

// Create CandlestickChart as a component function
function CandlestickChartComponent({ children, width, height }) {
    return React.createElement(View, { testID: 'candlestick-chart' }, children);
}

// Add sub-components as properties
CandlestickChartComponent.Provider = MockView;
CandlestickChartComponent.Candles = () => null;
CandlestickChartComponent.Crosshair = () => null;
CandlestickChartComponent.PriceText = MockText;
CandlestickChartComponent.DatetimeText = MockText;

module.exports = {
    LineChart: LineChartComponent,
    CandlestickChart: CandlestickChartComponent,
};
