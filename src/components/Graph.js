import { useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '../utils/theme';

const ranges = ['1H', '24H', '1M', '1Y', 'ALL'];

export default function Graph({
    data,
    loading,
    onRangeChange,
    currency = 'EUR',
    currentValue = 0,
    width,
    height = 220
}) {
    const { colors } = useTheme();
    const [range, setRange] = useState('1D');
    const [hoverValue, setHoverValue] = useState(null);

    const handleRangePress = (r) => {
        setRange(r);
        if (onRangeChange) onRangeChange(r);
    };

    const formatMoney = (val) => `${currency} ${Number(val || 0).toFixed(2)}`;
    const displayValue = hoverValue !== null ? hoverValue : currentValue;

    const chartConfig = {
        backgroundGradientFrom: colors.background,
        backgroundGradientTo: colors.background,
        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
        strokeWidth: 2,
        decimalPlaces: 2,
        propsForDots: {
            r: "6",
            strokeWidth: "2",
            stroke: "transparent",
            fill: "transparent"
        },
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
            {/* Value Display */}
            <View style={styles.header}>
                <Text style={[styles.value, { color: colors.text }]}>{formatMoney(displayValue)}</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                    {hoverValue !== null ? 'Selected' : 'Current Value'}
                </Text>
            </View>

            {/* Content */}
            <View style={styles.chartWrapper}>
                {loading ? (
                    <View style={[styles.center, { height }]}>
                        <ActivityIndicator testID="loading-indicator" color="#2563eb" />
                    </View>
                ) : (
                    data && data.length > 0 ? (
                        <LineChart
                            data={{ labels: [], datasets: [{ data }] }}
                            width={width || Dimensions.get('window').width - 32}
                            height={height}
                            chartConfig={chartConfig}
                            withDots={true}
                            withInnerLines={false}
                            withOuterLines={false}
                            withVerticalLabels={false}
                            withHorizontalLabels={false}
                            bezier
                            onDataPointClick={({ value }) => setHoverValue(value)}
                            style={{ paddingRight: 0, borderRadius: 16 }}
                        />
                    ) : (
                        <View style={[styles.center, { height }]}>
                            <Text style={[styles.muted, { color: colors.textSecondary }]}>No data available</Text>
                        </View>
                    )
                )}
            </View>

            {/* Ranges */}
            <View style={[styles.rangeRow, { backgroundColor: colors.background }]}>
                {ranges.map(r => (
                    <TouchableOpacity
                        key={r}
                        style={[styles.rangeBtn, range === r && { ...styles.rangeBtnActive, backgroundColor: colors.surface }]}
                        onPress={() => handleRangePress(r)}
                    >
                        <Text style={[styles.rangeText, { color: colors.textSecondary }, range === r && styles.rangeTextActive]}>{r}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { borderRadius: 16, padding: 16, elevation: 2, marginBottom: 24 },
    header: { marginBottom: 16 },
    value: { fontSize: 24, fontWeight: 'bold' },
    sub: { fontSize: 12, marginTop: 4 },
    chartWrapper: { marginBottom: 16, alignItems: 'center' },
    center: { justifyContent: 'center', alignItems: 'center' },
    muted: {},
    rangeRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 8, padding: 4 },
    rangeBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6 },
    rangeBtnActive: { elevation: 1 },
    rangeText: { fontSize: 12, fontWeight: '600' },
    rangeTextActive: { color: '#2563eb' },
});
