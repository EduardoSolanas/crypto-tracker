import React, { useMemo } from 'react';
import { Dimensions, Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line } from 'react-native-svg';
import { useTheme } from '../utils/theme';

const formatYLabel = (val, currency, fractionDigits) => {
    if (val === null || val === undefined) return '';
    const n = Number(val);
    if (isNaN(n)) return '';
    return n.toLocaleString(undefined, {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
};

const getStartingFractionDigits = (maxAbsValue) => {
    if (maxAbsValue >= 1000) return 0;
    if (maxAbsValue >= 100) return 1;
    if (maxAbsValue >= 1) return 2;
    if (maxAbsValue >= 0.01) return 4;
    return 6;
};

const getAxisLabels = (min, max, currency) => {
    const maxAbsValue = Math.max(Math.abs(min || 0), Math.abs(max || 0));
    const startDigits = getStartingFractionDigits(maxAbsValue);

    for (let digits = startDigits; digits <= 8; digits++) {
        const maxLabel = formatYLabel(max, currency, digits);
        const minLabel = formatYLabel(min, currency, digits);
        if (maxLabel !== minLabel) {
            return { maxLabel, minLabel };
        }
    }

    return {
        maxLabel: formatYLabel(max, currency, 8),
        minLabel: formatYLabel(min, currency, 8),
    };
};

// Module-level constant — not re-created on every render
const RANGE_BUTTONS = ['1H', '1D', '1W', '1M', '1Y', 'ALL'];

export default React.memo(function CryptoGraph({
    type = 'line',
    data,
    width,
    height = 220,
    color = '#22c55e',
    currency = 'EUR',
    range,
    onRangeChange,
    loading = false,
    refreshing = false,
    error = ''
}) {
    const { colors, isDark } = useTheme();
    const screenWidth = width || Dimensions.get('window').width;

    // All expensive data-crunching is memoised — only re-runs when the inputs
    // that affect the computed path / labels actually change.
    const computed = useMemo(() => {
        if (!data || data.length === 0) return null;

        const isCandlestick = type === 'candle' || type === 'candlestick';
        const padding = 20;
        const chartHeight = height - padding * 2;
        const n = data.length;

        // Single-pass extraction + min/max (avoids Math.max(...arr) spread on large arrays)
        const values = new Array(n);
        let max = -Infinity;
        let min = Infinity;

        for (let i = 0; i < n; i++) {
            values[i] = data[i].value || data[i].close || 0;
            if (isCandlestick) {
                const hi = data[i].high || data[i].value || data[i].close || 0;
                const lo = data[i].low  || data[i].value || data[i].close || 0;
                if (hi > max) max = hi;
                if (lo < min) min = lo;
            } else {
                if (values[i] > max) max = values[i];
                if (values[i] < min) min = values[i];
            }
        }
        const rangeVal = max - min || 1;

        // Interpolate zero / missing values between valid data points
        const interpolated = [...values];
        for (let i = 1; i < n - 1; i++) {
            if (interpolated[i] === 0 || interpolated[i] == null) {
                let prevIdx = i - 1;
                while (prevIdx >= 0 && (interpolated[prevIdx] === 0 || interpolated[prevIdx] == null)) prevIdx--;
                let nextIdx = i + 1;
                while (nextIdx < n && (interpolated[nextIdx] === 0 || interpolated[nextIdx] == null)) nextIdx++;
                if (prevIdx >= 0 && nextIdx < n) {
                    interpolated[i] = interpolated[prevIdx] + ((i - prevIdx) / (nextIdx - prevIdx)) * (interpolated[nextIdx] - interpolated[prevIdx]);
                } else if (prevIdx >= 0) {
                    interpolated[i] = interpolated[prevIdx];
                } else if (nextIdx < n) {
                    interpolated[i] = interpolated[nextIdx];
                }
            }
        }
        if (n > 0 && (interpolated[0] === 0 || interpolated[0] == null)) {
            const firstValid = interpolated.find(v => v > 0);
            if (firstValid != null) interpolated[0] = firstValid;
        }
        if (n > 1 && (interpolated[n - 1] === 0 || interpolated[n - 1] == null)) {
            for (let i = n - 2; i >= 0; i--) {
                if (interpolated[i] > 0) { interpolated[n - 1] = interpolated[i]; break; }
            }
        }

        // Build SVG path in a single pass using an array then join —
        // avoids O(n) intermediate string allocations from += concatenation.
        const xScale = n > 1 ? screenWidth / (n - 1) : 0;
        const segments = new Array(n);
        for (let i = 0; i < n; i++) {
            const x = n > 1 ? i * xScale : screenWidth / 2;
            const y = padding + chartHeight - ((interpolated[i] - min) / rangeVal) * chartHeight;
            segments[i] = i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }
        const linePath = segments.join(' ');

        const lastX = n > 1 ? (n - 1) * xScale : screenWidth / 2;
        const fillPath = n > 0 ? `${linePath} L ${lastX} ${height} L 0 ${height} Z` : '';

        const axisLabels = getAxisLabels(min, max, currency);

        return { linePath, fillPath, axisLabels, isCandlestick };
    }, [data, screenWidth, height, type, currency]); // `color` not needed — only affects SVG props below

    if (loading) {
        return (
            <View style={{ height: height + 60 }}>
                <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator color={colors.text} />
                </View>
                {onRangeChange && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 16, opacity: 0.3 }}>
                        {RANGE_BUTTONS.map(r => (
                            <View
                                key={r}
                                style={[
                                    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
                                    range === r && { backgroundColor: colors.surfaceElevated }
                                ]}
                            >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: range === r ? colors.text : colors.textSecondary }}>{r}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ height, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Text style={{ color: '#ef4444', textAlign: 'center', marginBottom: 8 }}>{error}</Text>
            </View>
        );
    }

    if (!computed) {
        return <View style={{ width: 0, height: 0 }} testID="line-chart" />;
    }

    const { linePath, fillPath, axisLabels, isCandlestick } = computed;
    const gridColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.15)';

    return (
        <View style={{ height: height + 60 }}>
            {/* Chart fills full width; Y-axis labels float over the right edge */}
            <View style={{ width: screenWidth, height }} pointerEvents="none">
                <View style={{ width: screenWidth, height }} testID={isCandlestick ? 'candlestick-chart' : 'line-chart'}>
                    <Svg width={screenWidth} height={height}>
                        <Defs>
                            <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={color} stopOpacity="0.15" />
                                <Stop offset="1" stopColor={color} stopOpacity="0.01" />
                            </LinearGradient>
                        </Defs>

                        {/* Grid lines — dashed, white in dark / subtle in light */}
                        <Line x1={0} y1={20} x2={screenWidth} y2={20} stroke={gridColor} strokeWidth={1} strokeDasharray="4 4" />
                        <Line x1={0} y1={height - 20} x2={screenWidth} y2={height - 20} stroke={gridColor} strokeWidth={1} strokeDasharray="4 4" />

                        {/* Area fill */}
                        {fillPath ? <Path d={fillPath} fill="url(#fillGrad)" /> : null}

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

                {/* Y-Axis Labels — absolutely positioned over the right side of the chart */}
                <View style={{
                    position: 'absolute',
                    right: 6,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'space-between',
                    paddingTop: 4,
                    paddingBottom: 4,
                    alignItems: 'flex-end',
                }}>
                    <Text testID="graph-y-max" style={{ color: isDark ? colors.text : colors.textSecondary, fontSize: 11 }}>{axisLabels.maxLabel}</Text>
                    <Text testID="graph-y-min" style={{ color: isDark ? colors.text : colors.textSecondary, fontSize: 11 }}>{axisLabels.minLabel}</Text>
                </View>

                {/* Refreshing overlay — small centred spinner while keeping the old chart visible */}
                {refreshing && (
                    <View style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)',
                    }}
                        pointerEvents="none"
                    >
                        <ActivityIndicator size="small" color={colors.text} />
                    </View>
                )}
            </View>

            {onRangeChange && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 16 }}>
                    {RANGE_BUTTONS.map(r => (
                        <TouchableOpacity
                            key={r}
                            onPress={() => onRangeChange(r)}
                            testID={`graph-range-${r}`}
                            accessibilityLabel={`graph-range-${r}`}
                            style={[
                                { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
                                range === r && { backgroundColor: colors.surfaceElevated }
                            ]}
                        >
                            <Text style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: range === r ? colors.text : colors.textSecondary
                            }}>{r}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
});
