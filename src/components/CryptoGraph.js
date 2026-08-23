import React, { memo, useMemo } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { CandlestickChart, LineChart } from 'react-native-wagmi-charts';
import { downsampleCandleData, downsampleLineData } from '../utils/chartSampling';
import { formatCompactMoney } from '../utils/format';
import { useTheme } from '../utils/theme';

const formatYLabel = (val, currency) => formatCompactMoney(val, currency);

function GridLines({ isDark }) {
    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', paddingVertical: 10 }}>
            {[0, 1].map((i) => (
                <View
                    key={i}
                    style={{
                        borderBottomWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.30)',
                        borderStyle: 'dotted',
                        opacity: 1,
                        width: '100%'
                    }}
                />
            ))}
        </View>
    );
}

function CryptoGraph({
    type = 'line',
    data,
    width,
    height = 220,
    color = '#22c55e', // Green default
    currency = 'EUR'
}) {
    const { colors, isDark } = useTheme();

    const screenWidth = width || Dimensions.get('window').width;
    const chartWidth = screenWidth - 50; // Reserve space for labels
    const maxLinePoints = Math.max(40, Math.floor(chartWidth / 4));
    const maxCandlePoints = Math.max(40, Math.floor(chartWidth / 5));

    const lineProcessed = useMemo(() => {
        if (type !== 'line' || !data || data.length === 0) return null;
        const sampled = downsampleLineData(data, maxLinePoints);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < data.length; i++) {
            const v = data[i]?.value;
            if (typeof v === 'number') {
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        return {
            sampledData: sampled,
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 0
        };
    }, [type, data, maxLinePoints]);

    const candleProcessed = useMemo(() => {
        if (type !== 'candle' || !data || data.length === 0) return null;
        const sampled = downsampleCandleData(data, maxCandlePoints);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < data.length; i++) {
            const c = data[i];
            if (c) {
                if (typeof c.low === 'number' && c.low < min) min = c.low;
                if (typeof c.high === 'number' && c.high > max) max = c.high;
            }
        }
        return {
            sampledData: sampled,
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 0
        };
    }, [type, data, maxCandlePoints]);

    if (!data || data.length === 0) return null;

    // Line Chart (Portfolio) - No interactive elements
    if (type === 'line' && lineProcessed) {
        return (
            <View style={{ flexDirection: 'row', height }} pointerEvents="none">
                <View style={{ width: chartWidth, position: 'relative' }}>
                    <GridLines isDark={isDark} />
                    <LineChart.Provider data={lineProcessed.sampledData}>
                        <LineChart width={chartWidth} height={height}>
                            <LineChart.Path color={color} width={2.5} />
                        </LineChart>
                    </LineChart.Provider>
                </View>

                {/* Y-Axis Labels overlay in reserved space */}
                <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                    <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(lineProcessed.max, currency)}</Text>
                    <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(lineProcessed.min, currency)}</Text>
                </View>
            </View>
        );
    }

    // Candlestick Chart (Coin Details) - No interactive elements
    if (type === 'candle' && candleProcessed) {
        return (
            <View pointerEvents="none">
                <View style={{ flexDirection: 'row', height }}>
                    <View style={{ width: chartWidth, position: 'relative' }}>
                        <GridLines isDark={isDark} />
                        <CandlestickChart.Provider data={candleProcessed.sampledData}>
                            <CandlestickChart width={chartWidth} height={height}>
                                <CandlestickChart.Candles />
                            </CandlestickChart>
                        </CandlestickChart.Provider>
                    </View>

                    {/* Y-Axis Labels overlay */}
                    <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                        <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(candleProcessed.max, currency)}</Text>
                        <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(candleProcessed.min, currency)}</Text>
                    </View>
                </View>
            </View>
        );
    }

    return null;
}

export default memo(CryptoGraph);

