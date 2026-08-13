import { Dimensions, Text, View } from 'react-native';
import { downsampleCandleData, downsampleLineData } from '../utils/chartSampling';
import { useTheme } from '../utils/theme';

const formatYLabel = (value, currency) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';

    return number.toLocaleString(undefined, {
        maximumFractionDigits: 0,
        style: 'currency',
        currency: currency || 'USD',
    });
};

/**
 * react-native-wagmi-charts relies on native Reanimated worklets and cannot be
 * evaluated by the web exporter. Keep the native chart in CryptoGraph.js and
 * provide a lightweight, non-interactive web fallback instead.
 */
export default function CryptoGraph({
    type = 'line',
    data,
    width,
    height = 220,
    color = '#22c55e',
    currency = 'EUR',
}) {
    const { colors, isDark } = useTheme();

    if (!data?.length || !['line', 'candle'].includes(type)) return null;

    const chartWidth = (width || Dimensions.get('window').width) - 50;
    const maxPoints = Math.max(40, Math.floor(chartWidth / (type === 'line' ? 4 : 5)));
    const sampledData = type === 'line'
        ? downsampleLineData(data, maxPoints)
        : downsampleCandleData(data, maxPoints);
    const values = type === 'line'
        ? data.map(({ value }) => Number(value))
        : data.flatMap(({ high, low }) => [Number(high), Number(low)]);
    const finiteValues = values.filter(Number.isFinite);

    if (!finiteValues.length) return null;

    const max = Math.max(...finiteValues);
    const min = Math.min(...finiteValues);

    return (
        <View style={{ flexDirection: 'row', height }} pointerEvents="none">
            <View
                testID="web-chart-fallback"
                style={{
                    width: chartWidth,
                    position: 'relative',
                    borderBottomWidth: 2,
                    borderColor: color,
                    opacity: sampledData.length ? 1 : 0,
                }}
            >
                {[0, 1].map((index) => (
                    <View
                        key={index}
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: index === 0 ? 10 : undefined,
                            bottom: index === 1 ? 10 : undefined,
                            borderBottomWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.30)',
                            borderStyle: 'dotted',
                        }}
                    />
                ))}
            </View>
            <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
            </View>
        </View>
    );
}
