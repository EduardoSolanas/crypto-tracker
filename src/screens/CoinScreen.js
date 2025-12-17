import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MoreVertical, Plus, Star } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CryptoGraph from '../components/CryptoGraph';
import { fetchPortfolioPrices } from '../cryptoCompare';
import { getHoldingsMap, getMeta, listTransactionsBySymbol } from '../db';

const formatMoney = (val, cur = 'EUR') => `${cur} ${Number(val || 0).toFixed(2)}`;

export default function CoinScreen() {
    const { symbol } = useLocalSearchParams();
    const sym = String(symbol || '').toUpperCase();

    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('EUR');
    const [txs, setTxs] = useState([]);
    const [coin, setCoin] = useState(null);

    const [activeTab, setActiveTab] = useState('General');
    const [range, setRange] = useState('1D');
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const c = (await getMeta('currency')) || 'EUR';
                setCurrency(c);

                const rows = await listTransactionsBySymbol(sym);
                setTxs(rows);

                const holdings = await getHoldingsMap();
                const p = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, c);
                setCoin(p[0] || { symbol: sym, quantity: holdings[sym] || 0, price: 0, value: 0, change24h: 0 });
            } finally {
                setLoading(false);
            }
        })();
    }, [sym]);

    // Graph Data Fetching
    useEffect(() => {
        let isMounted = true;
        (async () => {
            if (!sym) return;
            setChartLoading(true);

            let timeframe = 'minute'; // default
            let limit = 1440; // 1D

            // OPTIMIZATION: Use coarser grains for longer periods to reduce chart load
            switch (range) {
                case '1H': timeframe = 'minute'; limit = 60; break;
                case '4H': timeframe = 'minute'; limit = 240; break;
                case '12H': timeframe = 'minute'; limit = 720; break;
                case '1D': timeframe = 'minute'; limit = 144; break; // Downsample 1D to 10min intervals? No, API is strict. Keep minute but maybe less points?
                // Actually 1D minute data is fine, but for others:

                case '3D': timeframe = 'hour'; limit = 72; break; // 3 * 24 = 72 points
                case '1W': timeframe = 'hour'; limit = 168; break; // 7 * 24 = 168 points
                case '1M': timeframe = 'hour'; limit = 720; break; // 30 * 24 = 720 points (high res)
                case '3M': timeframe = 'day'; limit = 90; break;
                case '6M': timeframe = 'day'; limit = 180; break;
                case 'YTD': timeframe = 'day'; limit = 365; break;
                case 'ALL': timeframe = 'day'; limit = 1000; break;
            }
            // For 1D, limit=1440 is a lot of SVG paths.
            // If the user says it's taxing, we should reduce resolution. 
            // CryptoCompare supports `aggregate` param but our wrapper doesn't use it.
            // We can ask for hourly for 1D (24 points) but that's too blocky.
            // Let's stick to the logic above which is already better than fetching minutes for everything.
            // previous code had 'minute' for 1D which is 1440 points. That is heavy.
            // Wagmi charts handles it but it can be slow on older devices.

            try {
                const { fetchCandles } = await import('../cryptoCompare');
                const candles = await fetchCandles(sym, currency, timeframe, limit);

                if (isMounted) {
                    if (candles && candles.length) {
                        const formatted = candles.map(c => ({
                            timestamp: c.time * 1000,
                            open: c.open,
                            high: c.high,
                            low: c.low,
                            close: c.close,
                        }));
                        setChartData(formatted);
                    } else {
                        setChartData([]);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                if (isMounted) setChartLoading(false);
            }
        })();
        return () => { isMounted = false; };
    }, [sym, currency, range]); // Re-run when range changes

    // Memoize Stats for Transactions Tab
    const txStats = useMemo(() => {
        let buyTotal = 0, buyCount = 0;
        let sellTotal = 0, sellCount = 0;
        let count = 0;

        for (const t of txs) {
            count++;
            if (t.way === 'BUY') {
                // If we have quote_amount use it, else approximate
                const val = t.quote_amount > 0 ? t.quote_amount : (t.amount * (coin?.price || 0));
                buyTotal += val;
                buyCount += t.amount;
            }
            if (t.way === 'SELL') {
                const val = t.quote_amount > 0 ? t.quote_amount : (t.amount * (coin?.price || 0));
                sellTotal += val;
                sellCount += t.amount;
            }
        }

        const avgBuy = buyCount > 0 ? buyTotal / buyCount : 0; // Cost basis per unit approx
        const avgSell = sellCount > 0 ? sellTotal / sellCount : 0;

        return { avgBuy, avgSell, count };
    }, [txs, coin]);

    const renderTransactionItem = (t) => {
        const isBuy = t.way === 'BUY';
        const date = new Date(t.date_iso);
        const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        return (
            <View key={t.id} style={styles.txCard}>
                <View style={styles.txHeader}>
                    <View style={[styles.txBadge, isBuy ? styles.bgGreen : styles.bgRed]}>
                        <Text style={[styles.txBadgeText, isBuy ? styles.textGreen : styles.textRed]}>{t.way}</Text>
                    </View>
                    <Text style={styles.txHeaderDate}>{dateStr} at {timeStr} via Manual</Text>
                    <MoreVertical size={16} color="#64748b" style={{ marginLeft: 'auto' }} />
                </View>

                <View style={styles.txBody}>
                    <View style={styles.txRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.txLabel}>Buy Price ({sym}/EUR)</Text>
                            <Text style={styles.txValue}>{formatMoney(t.quote_amount / t.amount, currency)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.txLabel}>Amount Added</Text>
                            <Text style={styles.txValue}>{Number(t.amount).toFixed(6)}</Text>
                        </View>
                    </View>
                    <View style={[styles.txRow, { marginTop: 12 }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.txLabel}>Cost (Incl. Fee)</Text>
                            <Text style={styles.txValue}>{formatMoney(t.quote_amount, currency)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.txLabel}>Worth</Text>
                            <Text style={styles.txValue}>{formatMoney(t.amount * (coin?.price || 0), currency)}</Text>
                        </View>
                    </View>

                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.txLabel}>Delta</Text>
                        <Text style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 14 }}>+40.92%</Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={styles.headerTitle}>{sym}</Text>
                    <Text style={styles.headerSub}>Bitcoin</Text>
                </View>
                <View style={{ flexDirection: 'row' }}>
                    <Star color="#f59e0b" size={24} style={{ marginRight: 16 }} />
                    <MoreVertical color="#fff" size={24} />
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#fff" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[2]}>

                    {/* INFO ROW (Always visible) */}
                    <View style={styles.statsRow}>
                        <View>
                            <Text style={styles.statLabel}>Owned</Text>
                            <Text style={styles.statValue}>{Number(coin?.quantity || 0).toFixed(2)}</Text>
                        </View>
                        <View>
                            <Text style={styles.statLabel}>Market Value</Text>
                            <Text style={styles.statValue}>{formatMoney(coin?.value, currency)}</Text>
                        </View>
                        <View>
                            <Text style={styles.statLabel}>Total Gains</Text>
                            <Text style={[styles.statValue, { color: '#22c55e' }]}>+€458,339</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.breakdownBtn}>
                        <Text style={styles.breakdownText}>Show Cost & Gains Breakdown</Text>
                    </TouchableOpacity>

                    {/* TABS HEADER */}
                    <View style={{ backgroundColor: '#000000', paddingBottom: 8 }}>
                        <View style={styles.tabRow}>
                            <TouchableOpacity style={[styles.tabItem, activeTab === 'General' && styles.tabActive]} onPress={() => setActiveTab('General')}>
                                <Text style={[styles.tabText, activeTab === 'General' && styles.tabTextActive]}>General</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tabItem, activeTab === 'Transactions' && styles.tabActive]} onPress={() => setActiveTab('Transactions')}>
                                <Text style={[styles.tabText, activeTab === 'Transactions' && styles.tabTextActive]}>Transactions</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* TAB CONTENT */}

                    {activeTab === 'General' && (
                        <View style={styles.chartSection}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
                                <View>
                                    <Text style={styles.bigPrice}>{formatMoney(coin?.price, currency)}</Text>
                                    <Text style={styles.priceChange}>+{formatMoney(1607.22)} +2.20%</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Binance</Text>
                                    <Text style={{ color: '#64748b', fontSize: 10 }}>BTC/EUR</Text>
                                </View>
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow}>
                                {['1H', '4H', '12H', '1D', '3D', '1W', '1M', '3M', '6M', 'YTD', 'ALL'].map(r => (
                                    <TouchableOpacity
                                        key={r}
                                        onPress={() => setRange(r)}
                                        disabled={chartLoading}
                                        style={[styles.rangePill, range === r && styles.rangePillActive]}
                                    >
                                        <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>{r}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {chartLoading ? (
                                <View style={{ height: 250, justifyContent: 'center', alignItems: 'center' }}>
                                    <ActivityIndicator color="#fff" />
                                </View>
                            ) : (
                                <CryptoGraph type="candle" data={chartData} currency={currency} />
                            )}

                            {/* ACTIONS */}
                            <View style={{ padding: 16 }}>
                                <TouchableOpacity style={styles.histRow}>
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Historical movements</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {activeTab === 'Transactions' && (
                        <View style={{ paddingHorizontal: 16 }}>
                            {/* Stats Grid */}
                            <View style={styles.txStatsGrid}>
                                <View style={styles.txStatItem}>
                                    <Text style={styles.txStatLabel}>Avg. Buy Price</Text>
                                    <Text style={styles.txStatValue}>{formatMoney(txStats.avgBuy, currency)}</Text>
                                </View>
                                <View style={styles.txStatItem}>
                                    <Text style={styles.txStatLabel}>Avg. Sell Price</Text>
                                    <Text style={styles.txStatValue}>{formatMoney(txStats.avgSell, currency)}</Text>
                                </View>
                                <View style={styles.txStatItem}>
                                    <Text style={styles.txStatLabel}># Transactions</Text>
                                    <Text style={styles.txStatValue}>{txStats.count}</Text>
                                </View>
                            </View>

                            {/* Add Button & Filter */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16 }}>
                                <TouchableOpacity style={styles.addTxBtn} onPress={() => router.push('/add-transaction')}>
                                    <Plus color="#000" size={24} />
                                    <Text style={{ fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>New Transaction</Text>
                                </TouchableOpacity>
                            </View>

                            {/* List */}
                            {txs.map(renderTransactionItem)}
                            <View style={{ height: 40 }} />
                        </View>
                    )}

                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    headerSub: { fontSize: 12, color: '#94a3b8' },
    backBtn: { padding: 4 },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 32, paddingVertical: 16 },
    statLabel: { color: '#94a3b8', fontSize: 12, textAlign: 'center' },
    statValue: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginTop: 4 },

    breakdownBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    proBadge: { backgroundColor: '#fcd34d', paddingHorizontal: 4, borderRadius: 4, marginRight: 8 },
    proText: { fontSize: 10, fontWeight: 'bold', color: '#000' },
    breakdownText: { color: '#fff', fontWeight: '600' },

    tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#334155' },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    tabActive: { borderBottomWidth: 2, borderBottomColor: '#fff' },
    tabText: { color: '#94a3b8', fontWeight: '600' },
    tabTextActive: { color: '#fff', fontWeight: 'bold' },

    chartSection: { marginBottom: 24, paddingTop: 16 },
    bigPrice: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
    priceChange: { color: '#22c55e', fontWeight: 'bold', marginTop: 4 },

    rangeRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },
    rangePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
    rangePillActive: { backgroundColor: '#fff' },
    rangeText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
    rangeTextActive: { color: '#000' },

    tradeBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
    tradeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

    // Transactions Tab
    txStatsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
    txStatItem: { alignItems: 'center' },
    txStatLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
    txStatValue: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    addTxBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 24 },

    txCard: { backgroundColor: '#000', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 16, marginBottom: 12 },
    txHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    txBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8, borderWidth: 1 },
    bgGreen: { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
    bgRed: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
    txBadgeText: { fontSize: 12, fontWeight: 'bold' },
    textGreen: { color: '#22c55e' },
    textRed: { color: '#ef4444' },
    txHeaderDate: { color: '#94a3b8', fontSize: 12 },

    txBody: {},
    txRow: { flexDirection: 'row', justifyContent: 'space-between' },
    txLabel: { color: '#64748b', fontSize: 12, marginBottom: 4 },
    txValue: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});

