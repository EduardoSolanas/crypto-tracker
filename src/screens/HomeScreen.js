import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { Plus, Settings, TrendingUp } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CryptoGraph from '../components/CryptoGraph';
import { fetchPortfolioPrices } from '../cryptoCompare';
import { computeHoldingsFromTxns, parseDeltaCsvToTxns } from '../csv';
import { clearAllData, getAllTransactions, getHoldingsMap, getMeta, initDb, insertTransactions, loadCache, saveCache, setMeta, upsertHoldings } from '../db';

const log = (...args) => {
    // console.log('[UPLOAD]', ...args);
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// Cache expiration times
const CACHE_MAJOR = 10 * 60 * 1000;  // 10 minutes for assets > $10
const CACHE_MINOR = 60 * 60 * 1000;  // 1 hour for assets <= $10

import { formatMoney } from '../utils/format';
import { computePortfolioHistory } from '../utils/portfolioHistory';
import { useTheme } from '../utils/theme';

export default function HomeScreen() {
    const { colors, isDark } = useTheme();
    const [booting, setBooting] = useState(true);
    const [loading, setLoading] = useState(false);
    const [currency, setCurrency] = useState('EUR');
    const [portfolio, setPortfolio] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [range, setRange] = useState('1D'); // Default range
    const [graphLoading, setGraphLoading] = useState(false);
    const [chartColor, setChartColor] = useState('#22c55e');
    const [delta, setDelta] = useState({ val: 0, pct: 0 });

    const totalValue = useMemo(
        () => (portfolio ? portfolio.reduce((acc, c) => acc + c.value, 0) : 0),
        [portfolio]
    );


    // Helper: Smart Fetch
    const smartFetchPortfolio = async (holdingsMap, cachedPortfolio, savedTimestamp) => {
        const now = Date.now();
        const symbols = Object.keys(holdingsMap);
        const toFetch = [];
        const kept = [];

        if (!cachedPortfolio || !savedTimestamp) {
            // No cache? Fetch all.
            toFetch.push(...symbols);
        } else {
            const cacheMap = new Map(cachedPortfolio.map(i => [i.symbol, i]));

            for (const sym of symbols) {
                const cachedItem = cacheMap.get(sym);
                if (!cachedItem) {
                    // New symbol not in cache
                    toFetch.push(sym);
                } else {
                    const val = cachedItem.value;
                    const age = now - savedTimestamp;

                    // Logic: If val > 10, expire in 10 mins. If val <= 10, expire in 1h.
                    const threshold = val > 10 ? CACHE_MAJOR : CACHE_MINOR;

                    if (age > threshold) {
                        toFetch.push(sym);
                    } else {
                        // Keep cached item but update quantity if changed in DB (holdingsMap is source of truth for qty)
                        // If qty changed, we SHOULD fetch to get accurate value? 
                        // Or just update value = newQty * oldPrice?
                        // Let's safe update: if qty diff, fetch.
                        if (Math.abs(cachedItem.quantity - holdingsMap[sym]) > 0.00000001) {
                            toFetch.push(sym);
                        } else {
                            kept.push(cachedItem);
                        }
                    }
                }
            }
        }

        if (toFetch.length === 0) return kept;

        console.log(`[SmartFetch] Fetching ${toFetch.length} items (Cached: ${kept.length})`);

        // Fetch only needed subset
        const subsetMap = {};
        toFetch.forEach(s => subsetMap[s] = holdingsMap[s]);

        const newItems = await fetchPortfolioPrices(subsetMap, currency);

        // Merge
        const merged = [...kept, ...newItems];
        merged.sort((a, b) => b.value - a.value);
        return merged;
    };

    // Compute History with dynamic range support
    const computeHistory = async (allTxns, currentPortfolio, currency, selectedRange) => {
        try {
            setGraphLoading(true);

            // Dynamically import fetchCandles to avoid circular dependency issues if any
            // though standard import at top is usually fine, complying with existing style
            const { fetchCandles } = await import('../cryptoCompare');

            const { chartData, delta, chartColor, coinDeltas } = await computePortfolioHistory({
                allTxns,
                currentPortfolio,
                currency,
                range: selectedRange,
                fetchCandles
            });

            setChartData(chartData);
            setDelta(delta);
            setChartColor(chartColor);
            setCoinDeltas(coinDeltas);

            if (currentPortfolio?.length) {
                saveCache(currentPortfolio, chartData, delta, selectedRange);
            }

        } catch (e) {
            console.error('[computeHistory] Error', e);
        } finally {
            setGraphLoading(false);
        }
    };
    // Effect to reload when range changes, BUT only if we have portfolio data
    useEffect(() => {
        if (portfolio) {
            getAllTransactions().then(txs => {
                computeHistory(txs, portfolio, currency, range);
            });
        }
    }, [range, portfolio, currency]); // Trigger on range, portfolio, or currency change

    useEffect(() => {
        (async () => {
            try {
                await initDb();
                const savedCurrency = await getMeta('currency');
                if (savedCurrency) setCurrency(savedCurrency);

                const holdings = await getHoldingsMap();
                const cached = await loadCache();

                // Boot: Try smart fetch (which respects timeouts)
                // If smartFetch returns, it handles cache logic internally (returns stored items if fresh)
                const p = await smartFetchPortfolio(holdings, cached?.portfolio, cached?.timestamp);

                const allTxns = await getAllTransactions();
                setPortfolio(p);
                computeHistory(allTxns, p, savedCurrency || currency, '1D');
            } catch (e) {
                // If API fails, try to load cache (even if stale)
                const loaded = await loadCache();

                if (loaded) {
                    setPortfolio(loaded.portfolio);
                    setChartData(loaded.chartData);
                    setDelta(loaded.delta);
                    setRange(loaded.range);
                    Alert.alert('Offline Mode', 'Using cached data (API Limit / Network).');
                } else {
                    if (e.message && e.message.includes('Rate Limit')) {
                        Alert.alert('API Limit', 'Rate limit reached. Please wait.');
                    } else if (e.message && e.message.includes('Type 99')) {
                        Alert.alert('API Limit', 'Rate limit reached. Please wait.');
                    } else {
                        Alert.alert('Error', e.message);
                    }
                }
            } finally {
                setBooting(false);
            }
        })();
    }, []);

    const pickAndImportCsv = async () => {
        let result;
        try {
            result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', '*/*'],
                copyToCacheDirectory: true,
            });
        } catch (e) {
            Alert.alert('Picker error', String(e));
            return;
        }

        if (result.canceled || !result.assets || !result.assets.length) return;

        const asset = result.assets[0];
        setLoading(true);

        try {
            let text;
            if (asset.uri.startsWith('file://') || asset.uri.startsWith('content://')) {
                text = await FileSystem.readAsStringAsync(asset.uri);
            } else {
                const res = await fetch(asset.uri);
                text = await res.text();
            }

            const txns = parseDeltaCsvToTxns(text);
            if (!txns.length) {
                Alert.alert('Parse error', 'No transactions found');
                return;
            }

            await clearAllData();
            await insertTransactions(txns);
            const holdings = computeHoldingsFromTxns(txns);
            await upsertHoldings(holdings);

            const p = await fetchPortfolioPrices(holdings, currency);
            setPortfolio(p);
            computeHistory(txns, p, currency, range);

            Alert.alert('Import complete', `Imported ${txns.length} transactions`);
        } catch (e) {
            Alert.alert('Import error', e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const refreshPrices = async () => {
        setLoading(true);
        try {
            const holdings = await getHoldingsMap();
            const p = await fetchPortfolioPrices(holdings, currency);
            const allTxns = await getAllTransactions();
            setPortfolio(p);
            computeHistory(allTxns, p, currency, range);
        } catch (e) {
            const cached = await loadCache();
            if (cached) {
                setPortfolio(cached.portfolio);
                setChartData(cached.chartData);
                setDelta(cached.delta);
                Alert.alert('Offline', 'Using cached data (API Error)');
            } else {
                Alert.alert('Refresh Error', e?.message ?? String(e));
            }
        } finally {
            setLoading(false);
        }
    };

    const wipeDb = async () => {
        setLoading(true);
        try {
            await clearAllData();
            setPortfolio(null);
        } catch (e) {
            Alert.alert('Error', e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const setCurrencyAndReload = async (c) => {
        setCurrency(c);
        await setMeta('currency', c);
        const holdings = await getHoldingsMap();
        const p = await fetchPortfolioPrices(holdings, c);
        if (Object.keys(holdings).length) {
            setPortfolio(p);
            computeHistory(holdings, p, c, range);
        } else {
            setPortfolio(null);
            setChartData([]);
        }
    };

    const [coinDeltas, setCoinDeltas] = useState({});

    const [showSmallBalances, setShowSmallBalances] = useState(false);

    // Filter for display
    const visiblePortfolio = useMemo(() => {
        if (!portfolio) return [];
        return portfolio
            .filter(p => showSmallBalances || p.value >= 10)
            .sort((a, b) => b.value - a.value);
    }, [portfolio, showSmallBalances]);

    // Count hidden
    const hiddenCount = (portfolio?.length || 0) - visiblePortfolio.length;

    if (booting) {
        return (
            <SafeAreaView style={[{ flex: 1, backgroundColor: colors.background }, styles.centerContent]}>
                <ActivityIndicator color={colors.text} />
            </SafeAreaView>
        );
    }

    if (!portfolio) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
                <View style={[styles.centerContent]}>
                    <TrendingUp color={colors.text} size={48} />
                    <Text style={[styles.title, { color: colors.text }]}>Portfolio</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>No data. Import CSV.</Text>
                    <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: colors.primary }]} onPress={pickAndImportCsv} disabled={loading}>
                        {loading ? <ActivityIndicator color={colors.primaryInverse} /> : <Text style={[styles.uploadBtnText, { color: colors.primaryInverse }]}>Import CSV</Text>}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={refreshPrices} tintColor={colors.text} />
                }
            >
                <View style={[styles.header, { paddingTop: 60 }]}>
                    <View>
                        <Text style={[styles.subTitle, { color: colors.textSecondary }]}>Total Worth</Text>
                        <TouchableOpacity onPress={() => {
                            const next = currency === 'EUR' ? 'GBP' : currency === 'GBP' ? 'USD' : 'EUR';
                            setCurrencyAndReload(next);
                        }}>
                            <Text style={[styles.totalText, { color: colors.text }]}>
                                {formatMoney(totalValue, currency)}
                            </Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={{
                                color: delta.val >= 0 ? colors.success : colors.error,
                                fontSize: 16,
                                fontWeight: '600',
                                marginRight: 6
                            }}>
                                {delta.val >= 0 ? '+' : ''}{formatMoney(delta.val, currency)}
                            </Text>
                            <View style={{
                                backgroundColor: delta.val >= 0 ? colors.successBg : colors.errorBg,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4
                            }}>
                                <Text style={{
                                    color: delta.val >= 0 ? colors.success : colors.error,
                                    fontSize: 12,
                                    fontWeight: '700'
                                }}>
                                    {delta.pct.toFixed(2)}%
                                </Text>
                            </View>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => router.push('/settings')} style={[styles.iconButton, { backgroundColor: colors.surfaceElevated }]}>
                        <Settings color={colors.text} size={24} />
                    </TouchableOpacity>
                </View>

                {/* GRAPH */}
                <View style={{ marginBottom: 24 }}>
                    <CryptoGraph
                        data={chartData}
                        currentValue={totalValue}
                        currency={currency}
                        type="line"
                        onRangeChange={() => { }}
                        showGrid={false}
                        height={220}
                        color={chartColor}
                    />
                    {/* Range Selector */}
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingHorizontal: 16,
                        marginTop: 16
                    }}>
                        {['1H', '1D', '1W', '1M', '1Y', 'ALL'].map(r => (
                            <TouchableOpacity
                                key={r}
                                onPress={() => setRange(r)}
                                disabled={graphLoading}
                                style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 12,
                                    borderRadius: 16,
                                    backgroundColor: range === r ? colors.surfaceElevated : 'transparent',
                                    opacity: graphLoading ? 0.5 : 1
                                }}
                            >
                                <Text style={{
                                    color: range === r ? colors.text : colors.textSecondary,
                                    fontWeight: '600',
                                    fontSize: 13
                                }}>{r}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {graphLoading && (
                        <ActivityIndicator size="small" color={colors.text} style={{ marginTop: 10 }} />
                    )}
                </View>

                {/* ASSETS LIST */}
                <View style={{ paddingHorizontal: 16 }}>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Assets</Text>

                    {visiblePortfolio.map((item) => {
                        // Use calculated delta if avail
                        let deltaData = coinDeltas[item.symbol];

                        // If deltaData is missing or undefined
                        if (!deltaData) {
                            // Fallback approximation using 24h change
                            const startPrice = item.price / (1 + (item.change24h / 100));
                            const valDelta = (item.price - startPrice) * item.quantity;
                            deltaData = { val: valDelta, pct: item.change24h };
                        }

                        // Safety check: if deltaData came from legacy state as just a number (unlikely but possible during hot reload)
                        if (typeof deltaData === 'number') {
                            const pct = deltaData;
                            const startPrice = item.price / (1 + (pct / 100));
                            const valDelta = (item.price - startPrice) * item.quantity;
                            deltaData = { val: valDelta, pct: pct };
                        }

                        const isPositive = deltaData.val >= 0;

                        return (
                            <TouchableOpacity
                                key={item.symbol}
                                style={styles.coinRow}
                                onPress={() => router.push({ pathname: '/coin/[id]', params: { id: item.symbol, currency } })}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    {/* Icon Placeholder */}
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.symbol[0]}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.coinSymbol}>{item.symbol}</Text>
                                        <Text style={styles.coinPrice}>
                                            {item.quantity.toFixed(0)} | {formatMoney(item.price, currency)}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.coinValue}>{formatMoney(item.value, currency)}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={{
                                            color: isPositive ? colors.successLight : colors.errorLight,
                                            fontSize: 13,
                                            fontWeight: '500'
                                        }}>
                                            {isPositive ? '+' : ''}{formatMoney(deltaData.val, currency)}
                                        </Text>
                                        <Text style={{
                                            color: isPositive ? colors.successLight : colors.errorLight,
                                            fontSize: 13,
                                            marginLeft: 6
                                        }}>
                                            ({isPositive ? '+' : ''}{deltaData.pct.toFixed(2)}%)
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )
                    })}

                    {/* Show/Hide Button */}
                    {hiddenCount > 0 && (
                        <TouchableOpacity
                            onPress={() => setShowSmallBalances(!showSmallBalances)}
                            style={{
                                alignSelf: 'center',
                                marginTop: 12,
                                paddingVertical: 8,
                                paddingHorizontal: 16,
                            }}
                        >
                            <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>
                                {showSmallBalances ? 'Hide Small Balances' : `Show ${hiddenCount} Small Balances`}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* Add Button */}
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => router.push('/add-transaction')}
                    >
                        <Plus color="#000" size={24} />
                        <Text style={{ color: '#000', fontWeight: 'bold', marginLeft: 8 }}>Add Transaction</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, paddingTop: 60 },
    subTitle: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
    totalText: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginVertical: 4 },
    iconButton: { padding: 8, backgroundColor: '#334155', borderRadius: 20 },

    scrollContent: { paddingBottom: 40 },

    heroSection: { paddingHorizontal: 16, paddingTop: 16 },
    heroLabel: { color: '#94a3b8', fontSize: 14 },
    heroValue: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginVertical: 4 },
    deltaRow: { flexDirection: 'row', alignItems: 'center' },
    deltaText: { fontSize: 14, fontWeight: '600' },

    chartSection: { marginTop: 24, marginBottom: 24 },
    rangeRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, paddingHorizontal: 16 },
    rangeText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
    rangeTextActive: { color: '#fff', backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 2, borderRadius: 12, overflow: 'hidden' },

    assetsList: { paddingHorizontal: 16 },
    coinRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    coinLeft: { flexDirection: 'row', alignItems: 'center' },
    coinIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    coinIconText: { color: '#fff', fontWeight: 'bold' },
    rowSymbol: { fontWeight: 'bold', color: '#fff', fontSize: 16 },
    rowQty: { color: '#94a3b8', fontSize: 14 },
    coinRight: { alignItems: 'flex-end' },
    rowValue: { fontWeight: 'bold', color: '#fff', fontSize: 16 },
    changeText: { fontSize: 14, fontWeight: '600', marginTop: 2 },
    textGreen: { color: '#22c55e' },
    textRed: { color: '#ef4444' },

    coinSymbol: { fontWeight: 'bold', color: '#fff', fontSize: 16 },
    coinPrice: { color: '#94a3b8', fontSize: 13 },
    coinValue: { fontWeight: 'bold', color: '#fff', fontSize: 16 },

    addButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, marginTop: 24
    },

    title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 16 },
    subtitle: { color: '#94a3b8', marginTop: 8, marginBottom: 24 },
    uploadBtn: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
    uploadBtnText: { color: '#000', fontWeight: 'bold' },
});
