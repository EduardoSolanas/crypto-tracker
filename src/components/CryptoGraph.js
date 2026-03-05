import { Dimensions, Text, View } from 'react-native';
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

    const values = data.map(d => d.value || d.close || 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    return (
        <View style={{ flexDirection: 'row', height }} pointerEvents="none">
            <View style={{ width: chartWidth, height, position: 'relative' }}>
                {/* Grid lines */}
                <View style={{ position: 'absolute', top: 20, left: 0, right: 0, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                <View style={{ position: 'absolute', bottom: 20, left: 0, right: 0, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />

                {/* Line chart using small Views as segments */}
                <View style={{ position: 'absolute', top: 0, left: 0, width: chartWidth, height }}>
                    {values.length > 1 && values.map((v, i) => {
                        if (i === 0) return null;
                        const prevY = height - ((values[i-1] - min) / range) * (height - 40) - 20;
                        const currY = height - ((v - min) / range) * (height - 40) - 20;
                        const prevX = ((i - 1) / (values.length - 1)) * chartWidth;
                        const currX = (i / (values.length - 1)) * chartWidth;

                        const dx = currX - prevX;
                        const dy = currY - prevY;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                        return (
                            <View
                                key={i}
                                style={{
                                    position: 'absolute',
                                    left: prevX,
                                    top: Math.min(prevY, currY),
                                    width: length,
                                    height: 2.5,
                                    backgroundColor: color,
                                    transform: [
                                        { translateY: Math.abs(currY - prevY) / 2 },
                                        { rotate: `${angle}deg` }
                                    ],
                                    transformOrigin: 'left center'
                                }}
                            />
                        );
                    })}
                </View>
            </View>

            {/* Y-Axis Labels */}
            <View style={{ width: 50, justifyContent: 'space-between', paddingVertical: 10, alignItems: 'flex-end', paddingRight: 8 }}>
                <Text testID="graph-y-max" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(max, currency)}</Text>
                <Text testID="graph-y-min" style={{ color: colors.textSecondary, fontSize: 10 }}>{formatYLabel(min, currency)}</Text>
            </View>
        </View>
    );
}
