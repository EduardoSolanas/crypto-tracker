import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { Plus, RefreshCw, Trash2, TrendingUp } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
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
import { clearAllData, getHoldingsMap, getMeta, initDb, insertTransactions, setMeta, upsertHoldings } from '../db';

const log = (...args) => {
    // console.log('[UPLOAD]', ...args);
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const formatMoney = (val, cur = 'EUR') => {
    const v = Number(val || 0);
    return `${cur} ${v.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
};

export default function HomeScreen() {
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

    // --- CACHING HELPERS ---
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

    const saveCache = async (p, cData, d, r) => {
        try {
            await setMeta('cached_portfolio', JSON.stringify(p));
            await setMeta('cached_chart_data', JSON.stringify(cData));
            await setMeta('cached_delta', JSON.stringify(d));
            await setMeta('cached_range', r);
            await setMeta('cached_timestamp', Date.now().toString());
            // console.log('[DEBUG] Cache saved');
        } catch (e) {
            console.error('[Cache] Save Error', e);
        }
    };

    const loadCache = async () => {
        try {
            const pStr = await getMeta('cached_portfolio');
            const cStr = await getMeta('cached_chart_data');
            const dStr = await getMeta('cached_delta');
            const rStr = await getMeta('cached_range');
            const tsStr = await getMeta('cached_timestamp');

            if (pStr && cStr) {
                const data = {
                    portfolio: JSON.parse(pStr),
                    chartData: JSON.parse(cStr),
                    delta: dStr ? JSON.parse(dStr) : { val: 0, pct: 0 },
                    range: rStr || '1D',
                    timestamp: tsStr ? Number(tsStr) : 0
                };
                return data;
            }
        } catch (e) {
            console.error('[Cache] Load Error', e);
        }
        return null;
    };

    // Compute History with dynamic range support
    const computeHistory = async (currentHoldings, currentPortfolio, savedCurrency, selectedRange) => {
        try {
            setGraphLoading(true);
            const allTxns = await initDb().then(() => import('../db').then(m => m.getAllTransactions()));

            if (!allTxns.length) {
                // Return flat 0 line if no transactions
                const now = Date.now();
                setChartData([{ timestamp: now - 86400000, value: 0 }, { timestamp: now, value: 0 }]);
                setChartColor('#94a3b8');
                setDelta({ val: 0, pct: 0 });
                setGraphLoading(false);
                return;
            }

            const assets = Object.keys(currentHoldings);
            if (!assets.length && !allTxns.length) {
                setGraphLoading(false);
                return;
            }

            // --- 1. DETERMINE TIMELINE PARAMETERS ---
            let rLimit = 30;
            let rTimeframe = 'day';

            // Map Range to API params
            switch (selectedRange) {
                case '1H': rTimeframe = 'minute'; rLimit = 60; break;
                case '1D': rTimeframe = 'minute'; rLimit = 1440; break; // Full day resolution
                case '1W': rTimeframe = 'hour'; rLimit = 168; break;
                case '1M': rTimeframe = 'day'; rLimit = 30; break;
                case '1Y': rTimeframe = 'day'; rLimit = 365; break;
                case 'ALL': rTimeframe = 'day'; rLimit = 1980; break; // Max safe limit
                default: rTimeframe = 'day'; rLimit = 90;
            }

            let stepSeconds = 86400; // day
            if (rTimeframe === 'hour') stepSeconds = 3600;
            if (rTimeframe === 'minute') stepSeconds = 60;

            // --- 2. GENERATE TIME POINTS ---
            // We want a grid aligned to API (Step) BUT ending at NOW to capture latest movement.
            const nowMs = Date.now();
            const nowSec = Math.floor(nowMs / 1000);

            // Grid-aligned "Latest" point
            const gridNow = Math.floor(nowSec / stepSeconds) * stepSeconds;

            let timePoints = [];
            // Generate history points backwards from gridNow
            let fetchLimit = rLimit;
            // Special case for 1D: we want full day coverage
            if (selectedRange === '1D') fetchLimit = 1440;

            for (let i = fetchLimit; i >= 0; i--) {
                const ts = gridNow - (i * stepSeconds);
                if (ts <= nowSec) timePoints.push(ts);
            }

            // Crucial: Add exact NOW point if it's significantly different from gridNow
            // This ensures instant updates (buy now -> graph jumps now)
            if (nowSec - timePoints[timePoints.length - 1] > 1) {
                timePoints.push(nowSec);
            }

            // --- 3. FETCH HISTORY FOR ALL INVOLVED ASSETS ---
            const { fetchCandles } = await import('../cryptoCompare');
            // Get all symbols ever involved (even if 0 now) or at least current holdings
            const uniqueSymbols = new Set([...allTxns.map(t => t.symbol), ...Object.keys(currentHoldings)]);

            // Map: Symbol -> Array of { time, close }
            const historyMap = {};

            // Fetch extra buffer to ensure coverage
            const fetchCount = rLimit + 20;

            await Promise.all(
                Array.from(uniqueSymbols).map(async (sym) => {
                    // Optimized: Only fetch if we suspect non-zero holding.
                    // But we don't know timeline alloc yet. Fetch all involved is safest.
                    try {
                        const data = await fetchCandles(sym, savedCurrency || currency, rTimeframe, fetchCount);
                        // Sort just in case (API usually returns sorted)
                        if (data && data.length) data.sort((a, b) => a.time - b.time);
                        historyMap[sym] = data || [];
                    } catch (err) {
                        console.warn(`[History] Failed to fetch for ${sym}`, err);
                        historyMap[sym] = [];
                    }
                })
            );

            // --- 4. SIMULATE PORTFOLIO VALUE AT EACH POINT ---
            let graphPoints = timePoints.map(tPoint => {
                // A. Calculate Holdings at tPoint
                // Sum all txs happening BEFORE OR AT tPoint
                const relevantTxns = allTxns.filter(t => new Date(t.dateISO || t.date_iso).getTime() / 1000 <= tPoint);

                const h = {};
                for (const t of relevantTxns) {
                    if (!h[t.symbol]) h[t.symbol] = 0;
                    if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) h[t.symbol] += t.amount;
                    if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) h[t.symbol] -= t.amount;
                }

                // B. Calculate Value using History
                let val = 0;
                for (const [sym, qty] of Object.entries(h)) {
                    if (qty <= 0.00000001) continue; // Skip dust

                    const hist = historyMap[sym];
                    let price = 0;

                    if (hist && hist.length > 0) {
                        // Find closest candle
                        // Simple robust logic: Find candle with time <= tPoint + small_tolerance
                        const candidates = hist.filter(c => c.time <= tPoint + (stepSeconds / 2));

                        if (candidates.length > 0) {
                            price = candidates[candidates.length - 1].close;
                        }
                    }

                    // Fallback: If no history found (gap or very new coin not in hist yet)
                    // If tPoint is very recent (Last 24h), try to use currentPortfolio Live Price
                    if (price === 0 && Math.abs(nowSec - tPoint) < 86400) {
                        const currP = currentPortfolio?.find(c => c.symbol === sym);
                        if (currP) price = currP.price;
                    }

                    val += qty * price;
                }

                return { timestamp: tPoint * 1000, value: val };
            });

            // --- 5. POST-PROCESSING ---

            // Trim leading zeros (if graph is mostly empty)
            const firstActiveIndex = graphPoints.findIndex(p => p.value > 0.0001);
            if (firstActiveIndex > 0) {
                // For long ranges, trim. For 1H/1D, maybe keep to show "You started just now"
                if (['1M', '1Y', 'ALL'].includes(selectedRange)) {
                    graphPoints = graphPoints.slice(firstActiveIndex);
                }
            }

            // Downsample for performance if too many points
            if (graphPoints.length > 100) {
                const step = Math.ceil(graphPoints.length / 80);
                graphPoints = graphPoints.filter((_, i) => i % step === 0 || i === graphPoints.length - 1);
            }

            // Compute Delta
            let newDelta = { val: 0, pct: 0 };
            if (graphPoints.length > 0) {
                const startVal = graphPoints[0].value;
                const endVal = graphPoints[graphPoints.length - 1].value;
                const diff = endVal - startVal;
                // Avoid division by zero
                const pct = startVal > 0.0001 ? (diff / startVal) * 100 : 0;

                newDelta = { val: diff, pct };
                setDelta(newDelta);
                setChartColor(diff >= 0 ? '#22c55e' : '#ef4444');
            } else {
                setDelta({ val: 0, pct: 0 });
                setChartColor('#94a3b8');
            }

            setChartData(graphPoints);
            // Save successful state
            if (currentPortfolio && currentPortfolio.length > 0) {
                saveCache(currentPortfolio, graphPoints, newDelta, selectedRange);
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
            getHoldingsMap().then(h => computeHistory(h, portfolio, currency, range));
        }
    }, [range]); // Trigger on range change

    useEffect(() => {
        (async () => {
            try {
                await initDb();
                const savedCurrency = await getMeta('currency');
                if (savedCurrency) setCurrency(savedCurrency);

                const cached = await loadCache();
                const isFresh = cached && (Date.now() - cached.timestamp < CACHE_DURATION);

                // Use cache if fresh
                if (isFresh) {
                    console.log('[App] Using fresh cache');
                    setPortfolio(cached.portfolio);
                    setChartData(cached.chartData);
                    setDelta(cached.delta);
                    setRange(cached.range);
                    setBooting(false);
                    return;
                }

                // Otherwise, fetch new
                const holdings = await getHoldingsMap();
                if (Object.keys(holdings).length > 0) {
                    const p = await fetchPortfolioPrices(holdings, savedCurrency || currency);
                    setPortfolio(p);
                    computeHistory(holdings, p, savedCurrency || currency, '1D');
                } else {
                    // If fetch fails (or no holdings), and we have STALE cache, use it as fallback?
                    // Actually, if we are here, it means we have no holdings OR we want to fetch new data.
                    // If fetch fails, the catch block handles fallback.

                    // But if no holdings, check if we have stale cache to show?
                    // Usually if no holdings map, we are genuinely empty or just imported.
                    if (cached) {
                        // Fallback to cache even if stale if we have nothing else?
                        setPortfolio(cached.portfolio);
                        setChartData(cached.chartData);
                        setDelta(cached.delta);
                        setRange(cached.range);
                    } else {
                        setPortfolio(null);
                        setChartData([]);
                    }
                }
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
            computeHistory(holdings, p, currency, range);

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
            setPortfolio(p);
            computeHistory(holdings, p, currency, range);
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

    if (booting) {
        return (
            <SafeAreaView style={[styles.container, styles.centerContent]}>
                <ActivityIndicator color="#fff" />
            </SafeAreaView>
        );
    }

    if (!portfolio) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={[styles.centerContent]}>
                    <TrendingUp color="#fff" size={48} />
                    <Text style={styles.title}>Portfolio</Text>
                    <Text style={styles.subtitle}>No data. Import CSV.</Text>
                    <TouchableOpacity style={styles.uploadBtn} onPress={pickAndImportCsv} disabled={loading}>
                        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>Import CSV</Text>}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000" />

            {/* HEADER */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Portfolios</Text>
                <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={refreshPrices} disabled={loading} style={styles.iconBtn}>
                        <RefreshCw color="#fff" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={wipeDb} disabled={loading} style={styles.iconBtn}>
                        <Trash2 color="#fff" size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={pickAndImportCsv} disabled={loading} style={styles.iconBtn}>
                        <Plus color="#fff" size={20} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* HERO */}
                <View style={styles.heroSection}>
                    <Text style={styles.heroLabel}>Total Worth</Text>
                    <Text style={styles.heroValue}>{formatMoney(totalValue, currency)}</Text>
                    <View style={styles.deltaRow}>
                        <Text style={[styles.deltaText, delta.val >= 0 ? styles.textGreen : styles.textRed]}>
                            {delta.val >= 0 ? '+' : ''}{formatMoney(delta.val, currency)} ({delta.val >= 0 ? '+' : ''}{delta.pct.toFixed(2)}%)
                        </Text>
                    </View>
                </View>

                {/* GRAPH */}
                <View style={styles.chartSection}>
                    {graphLoading ? (
                        <View style={{ height: 220, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator color={chartColor} />
                        </View>
                    ) : (
                        <CryptoGraph type="line" data={chartData} color={chartColor} currency={currency} />
                    )}

                    <View style={styles.rangeRow}>
                        {['1H', '1D', '1W', '1M', '1Y', 'ALL'].map(r => (
                            <TouchableOpacity key={r} onPress={() => setRange(r)}>
                                <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>{r}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* ASSETS */}
                <View style={styles.assetsList}>
                    {portfolio.map((coin) => (
                        <TouchableOpacity
                            key={coin.symbol}
                            style={styles.coinRow}
                            onPress={() => router.push(`/coin/${coin.symbol}`)}
                        >
                            <View style={styles.coinLeft}>
                                <View style={styles.coinIcon}>
                                    <Text style={styles.coinIconText}>{coin.symbol[0]}</Text>
                                </View>
                                <View>
                                    <Text style={styles.rowSymbol}>{coin.symbol}</Text>
                                    <Text style={styles.rowQty}>{coin.quantity.toFixed(4)} <Text style={{ color: '#64748b' }}>| {formatMoney(coin.price, currency)}</Text></Text>
                                </View>
                            </View>

                            <View style={styles.coinRight}>
                                <Text style={styles.rowValue}>{formatMoney(coin.value, currency)}</Text>
                                <View style={{ flexDirection: 'row' }}>
                                    <Text style={[styles.changeText, coin.change24h >= 0 ? styles.textGreen : styles.textRed]}>
                                        {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                                    </Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    iconBtn: { marginLeft: 16 },

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

    title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 16 },
    subtitle: { color: '#94a3b8', marginTop: 8, marginBottom: 24 },
    uploadBtn: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
    uploadBtnText: { color: '#000', fontWeight: 'bold' },
});
