import { Dimensions, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line } from 'react-native-svg';
import { useTheme } from '../utils/theme';

const formatYLabel = (val, currency) => {
    if (!val) return '';
    const n = Number(val);
    if (isNaN(n)) return '';
    return n.toLocaleString(undefined, { maximumFractionDigits: 0, style: 'currency', currency: currency || 'USD' });
};

export default function CryptoGraph({
    type = 'line',
    data,
    width,
    height = 220,
    color = '#22c55e',
    currency = 'EUR'
}) {
    const { colors, isDark } = useTheme();

    if (!data || data.length === 0) return null;

    const screenWidth = width || Dimensions.get('window').width;
    const chartWidth = screenWidth - 50;

    const isCandlestick = type === 'candle' || type === 'candlestick';

    const values = data.map(d => d.value || d.close || 0);
    const highs = data.map(d => d.high || d.value || d.close || 0);
    const lows = data.map(d => d.low || d.value || d.close || 0);
    const max = isCandlestick ? Math.max(...highs) : Math.max(...values);
    const min = isCandlestick ? Math.min(...lows) : Math.min(...values);
    const range = max - min || 1;

    const padding = 20;
    const chartHeight = height - padding * 2;

    // Interpolate zero/missing values between valid data points to avoid gaps
    const interpolated = [...values];
    for (let i = 1; i < interpolated.length - 1; i++) {
        if (interpolated[i] === 0 || interpolated[i] == null) {
            // Find previous valid value
            let prevIdx = i - 1;
            while (prevIdx >= 0 && (interpolated[prevIdx] === 0 || interpolated[prevIdx] == null)) prevIdx--;
            // Find next valid value
            let nextIdx = i + 1;
            while (nextIdx < interpolated.length && (interpolated[nextIdx] === 0 || interpolated[nextIdx] == null)) nextIdx++;
            if (prevIdx >= 0 && nextIdx < interpolated.length) {
                // Linear interpolation
                const ratio = (i - prevIdx) / (nextIdx - prevIdx);
                interpolated[i] = interpolated[prevIdx] + ratio * (interpolated[nextIdx] - interpolated[prevIdx]);
            } else if (prevIdx >= 0) {
                interpolated[i] = interpolated[prevIdx];
            } else if (nextIdx < interpolated.length) {
                interpolated[i] = interpolated[nextIdx];
            }
        }
    }
    // Handle edge cases: first and last points
    if (interpolated.length > 0 && (interpolated[0] === 0 || interpolated[0] == null)) {
        const firstValid = interpolated.find(v => v > 0);
        if (firstValid) interpolated[0] = firstValid;
    }
    if (interpolated.length > 1 && (interpolated[interpolated.length - 1] === 0 || interpolated[interpolated.length - 1] == null)) {
        for (let i = interpolated.length - 2; i >= 0; i--) {
            if (interpolated[i] > 0) { interpolated[interpolated.length - 1] = interpolated[i]; break; }
        }
    }

    // Build SVG path for the line
    const points = interpolated.map((v, i) => {
        const x = interpolated.length > 1 ? (i / (interpolated.length - 1)) * chartWidth : chartWidth / 2;
        const y = padding + chartHeight - ((v - min) / range) * chartHeight;
        return { x, y };
    });

    let linePath = '';
    if (points.length > 0) {
        linePath = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            linePath += ` L ${points[i].x} ${points[i].y}`;
        }
    }

    // Build the fill path (area under the line)
    let fillPath = '';
    if (points.length > 0) {
        fillPath = linePath + ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
    }

    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    return (
        <View style={{ flexDirection: 'row', height }} pointerEvents="none">
            <View style={{ width: chartWidth, height }} testID={isCandlestick ? 'candlestick-chart' : 'line-chart'}>
                <Svg width={chartWidth} height={height}>
                    <Defs>
                        <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={color} stopOpacity="0.15" />
                            <Stop offset="1" stopColor={color} stopOpacity="0.01" />
                        </LinearGradient>
                    </Defs>

                    {/* Grid lines */}
                    <Line x1={0} y1={padding} x2={chartWidth} y2={padding} stroke={gridColor} strokeWidth={1} />
                    <Line x1={0} y1={height - padding} x2={chartWidth} y2={height - padding} stroke={gridColor} strokeWidth={1} />

                    {/* Area fill */}
                    {fillPath ? (
                        <Path d={fillPath} fill="url(#fillGrad)" />
                    ) : null}

                    {/* Line */}
                    {linePath ? (
                        <Path
                            d={linePath}
                            fill="none"
                            stroke={color}
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ) : null}
                </Svg>
            </View>

            {/* Y-Axis Labels */}
            <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
            </View>
        </View>
    );
}
