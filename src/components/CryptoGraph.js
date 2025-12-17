import * as haptics from 'expo-haptics';
import { Dimensions, Text, View } from 'react-native';
import { CandlestickChart, LineChart } from 'react-native-wagmi-charts';

const formatYLabel = (val, currency) => {
    if (!val) return '';
    const n = Number(val);
    if (isNaN(n)) return '';
    // Format compact for space saving
    return n.toLocaleString(undefined, { maximumFractionDigits: 0, style: 'currency', currency: currency || 'USD' });
};

export default function CryptoGraph({
    type = 'line',
    data,
    width,
    height = 220,
    color = '#22c55e', // Green default
    currency = 'EUR'
}) {
    if (!data || data.length === 0) return null;

    const screenWidth = width || Dimensions.get('window').width;
    const chartWidth = screenWidth - 50; // Reserve space for labels

    function invokeHaptic() {
        haptics.impactAsync(haptics.ImpactFeedbackStyle.Light);
    }

    // Horizontal Grid Lines Component
    const GridLines = () => (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', paddingVertical: 10 }}>
            {[...Array(5)].map((_, i) => (
                <View key={i} style={{ height: 1, backgroundColor: '#334155', opacity: 0.3, width: '100%' }} />
            ))}
        </View>
    );

    // Line Chart (Portfolio)
    if (type === 'line') {
        const values = data.map(d => d.value);
        const max = Math.max(...values);
        const min = Math.min(...values);

        return (
            <View style={{ flexDirection: 'row', height }}>
                <View style={{ width: chartWidth, position: 'relative' }}>
                    <GridLines />
                    <LineChart.Provider data={data}>
                        <LineChart width={chartWidth} height={height}>
                            <LineChart.Path color={color} width={3} />
                            <LineChart.CursorCrosshair color={color} onActivated={invokeHaptic} onEnded={invokeHaptic} />
                        </LineChart>
                        <LineChart.PriceText style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }} />
                    </LineChart.Provider>
                </View>

                {/* Y-Axis Labels overlay in reserved space */}
                <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                    <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min + (max - min) * 0.75, currency)}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min + (max - min) * 0.50, currency)}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min + (max - min) * 0.25, currency)}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
                </View>
            </View>
        );
    }

    // Candlestick Chart (Coin Details)
    if (type === 'candle') {
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);
        const max = Math.max(...highs);
        const min = Math.min(...lows);

        return (
            <View>
                <View style={{ flexDirection: 'row', height }}>
                    <View style={{ width: chartWidth, position: 'relative' }}>
                        <GridLines />
                        <CandlestickChart.Provider data={data}>
                            <CandlestickChart width={chartWidth} height={height}>
                                <CandlestickChart.Candles />
                                <CandlestickChart.Crosshair onActivated={invokeHaptic} onEnded={invokeHaptic} />
                            </CandlestickChart>
                        </CandlestickChart.Provider>
                    </View>

                    {/* Y-Axis Labels overlay */}
                    <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min + (max - min) * 0.75, currency)}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min + (max - min) * 0.50, currency)}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min + (max - min) * 0.25, currency)}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
                    </View>
                </View>

                {/* Helper for price text below chart to avoid overlap */}
                <CandlestickChart.Provider data={data}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 16 }}>
                        <CandlestickChart.PriceText style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }} />
                        <CandlestickChart.DatetimeText style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }} />
                    </View>
                </CandlestickChart.Provider>
            </View>
        );
    }

    return null;
}
