import React, { useMemo, useState } from 'react';
import { Dimensions, Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line, Rect } from 'react-native-svg';
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
const formatPathNumber = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return Number(n.toFixed(2)).toString();
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function buildSmoothPath(points) {
    if (!Array.isArray(points) || points.length === 0) return '';

    const first = points[0];
    if (points.length === 1) {
        return `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`;
    }
    if (points.length === 2) {
        const last = points[1];
        return `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)} L ${formatPathNumber(last.x)} ${formatPathNumber(last.y)}`;
    }

    const segments = [`M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`];

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        const c1x = clamp(p1.x + (p2.x - p0.x) / 6, p1.x, p2.x);
        const c1y = clamp(p1.y + (p2.y - p0.y) / 6, minY, maxY);
        const c2x = clamp(p2.x - (p3.x - p1.x) / 6, p1.x, p2.x);
        const c2y = clamp(p2.y - (p3.y - p1.y) / 6, minY, maxY);

        segments.push(
            `C ${formatPathNumber(c1x)} ${formatPathNumber(c1y)} ` +
            `${formatPathNumber(c2x)} ${formatPathNumber(c2y)} ` +
            `${formatPathNumber(p2.x)} ${formatPathNumber(p2.y)}`
        );
    }

    return segments.join(' ');
}

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
    const [chartStyle, setChartStyle] = useState(() => (
        type === 'candle' || type === 'candlestick' ? 'candle' : 'line'
    ));

    // All expensive data-crunching is memoised — only re-runs when the inputs
    // that affect the computed path / labels actually change.
    const computed = useMemo(() => {
        if (!data || data.length === 0) return null;

        const isCandlestick = chartStyle === 'candle';
        const padding = 20;
        const chartHeight = height - padding * 2;
        const n = data.length;

        // Single-pass extraction + min/max (avoids Math.max(...arr) spread on large arrays)
        const values = new Array(n);
        const candleRows = new Array(n);
        let max = -Infinity;
        let min = Infinity;

        for (let i = 0; i < n; i++) {
            const row = data[i] || {};
            const close = Number(row.close ?? row.value ?? 0) || 0;
            const prevClose = i > 0 ? values[i - 1] : close;
            const open = Number(row.open ?? prevClose) || close;
            const high = Number(row.high ?? Math.max(open, close)) || Math.max(open, close);
            const low = Number(row.low ?? Math.min(open, close)) || Math.min(open, close);

            values[i] = close;
            candleRows[i] = { open, high, low, close };
            if (isCandlestick) {
                if (high > max) max = high;
                if (low < min) min = low;
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
        const points = new Array(n);
        const valueToY = (value) => padding + chartHeight - ((value - min) / rangeVal) * chartHeight;
        for (let i = 0; i < n; i++) {
            const x = n > 1 ? i * xScale : screenWidth / 2;
            const y = valueToY(interpolated[i]);
            points[i] = { x, y };
        }
        const linePath = buildSmoothPath(points);

        const lastX = n > 1 ? (n - 1) * xScale : screenWidth / 2;
        const fillPath = n > 0 ? `${linePath} L ${lastX} ${height} L 0 ${height} Z` : '';

        const bodyWidth = Math.max(3, Math.min(9, (n > 1 ? xScale : 12) * 0.55));
        const candleItems = candleRows.map((candle, i) => {
            const close = Number.isFinite(candle.close) ? candle.close : interpolated[i];
            const open = Number.isFinite(candle.open) ? candle.open : (i > 0 ? interpolated[i - 1] : close);
            const high = Number.isFinite(candle.high) ? candle.high : Math.max(open, close);
            const low = Number.isFinite(candle.low) ? candle.low : Math.min(open, close);
            const openY = valueToY(open);
            const closeY = valueToY(close);
            const highY = valueToY(high);
            const lowY = valueToY(low);
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(2, Math.abs(closeY - openY));
            const x = points[i].x;

            return {
                x,
                wickTop: Math.min(highY, lowY),
                wickBottom: Math.max(highY, lowY),
                bodyX: clamp(x - bodyWidth / 2, 0, screenWidth - bodyWidth),
                bodyTop,
                bodyWidth,
                bodyHeight,
                color: close >= open ? '#22c55e' : '#ef4444',
            };
        });

        const axisLabels = getAxisLabels(min, max, currency);

        return { linePath, fillPath, axisLabels, isCandlestick, candleItems };
    }, [data, screenWidth, height, chartStyle, currency]); // `color` not needed — only affects SVG props below

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

    const { linePath, fillPath, axisLabels, isCandlestick, candleItems } = computed;
    const gridColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.15)';
    const toggleTo = chartStyle === 'line' ? 'candlestick' : 'line';

    return (
        <View style={{ height: height + 60 }}>
            {/* Chart fills full width; Y-axis labels float over the right edge */}
            <View style={{ width: screenWidth, height }}>
                <View style={{ width: screenWidth, height }} pointerEvents="none" testID={isCandlestick ? 'candlestick-chart' : 'line-chart'}>
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
                        {!isCandlestick && fillPath ? <Path d={fillPath} fill="url(#fillGrad)" /> : null}

                        {/* Line / Candles */}
                        {isCandlestick ? candleItems.map((candle, i) => (
                            <React.Fragment key={`candle-${i}`}>
                                <Line
                                    testID={`graph-candle-wick-${i}`}
                                    x1={candle.x}
                                    y1={candle.wickTop}
                                    x2={candle.x}
                                    y2={candle.wickBottom}
                                    stroke={candle.color}
                                    strokeWidth={1.4}
                                    strokeLinecap="round"
                                />
                                <Rect
                                    testID={`graph-candle-${i}`}
                                    x={candle.bodyX}
                                    y={candle.bodyTop}
                                    width={candle.bodyWidth}
                                    height={candle.bodyHeight}
                                    rx={1}
                                    fill={candle.color}
                                />
                            </React.Fragment>
                        )) : linePath ? (
                            <Path
                                testID="graph-line-path"
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

                <TouchableOpacity
                    testID="graph-chart-style-toggle"
                    accessibilityLabel={`Switch to ${toggleTo} chart`}
                    onPress={() => setChartStyle((current) => current === 'line' ? 'candle' : 'line')}
                    style={{
                        position: 'absolute',
                        right: 12,
                        bottom: 10,
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isDark ? 'rgba(15,23,42,0.78)' : 'rgba(255,255,255,0.88)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.14)',
                    }}
                >
                    <Svg width={18} height={18} viewBox="0 0 18 18">
                        {chartStyle === 'line' ? (
                            <>
                                <Line x1={4} y1={13} x2={4} y2={4} stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" />
                                <Rect x={2.5} y={7} width={3} height={5} rx={0.7} fill={colors.text} />
                                <Line x1={9} y1={15} x2={9} y2={3} stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" />
                                <Rect x={7.5} y={5} width={3} height={7} rx={0.7} fill={colors.text} />
                                <Line x1={14} y1={12} x2={14} y2={2} stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" />
                                <Rect x={12.5} y={4} width={3} height={4} rx={0.7} fill={colors.text} />
                            </>
                        ) : (
                            <Path
                                d="M2 12 L6 8 L9 10 L14 4"
                                fill="none"
                                stroke={colors.text}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        )}
                    </Svg>
                </TouchableOpacity>
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
