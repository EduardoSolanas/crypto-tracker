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

import { formatMoney } from '../utils/format';

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
            const startTime = Date.now();
            setGraphLoading(true);

            if (!allTxns || !allTxns.length) {
                const now = Date.now();
                setChartData([{ timestamp: now - 86400000, value: 0 }, { timestamp: now, value: 0 }]);
                setChartColor('#94a3b8');
                setDelta({ val: 0, pct: 0 });
                setGraphLoading(false);
                return;
            }

            // FILTER: Only fetch history for assets with value > 10
            const significantSymbols = new Set();
            if (currentPortfolio) {
                currentPortfolio.forEach(p => {
                    if (p.value > 10) significantSymbols.add(p.symbol);
                });
            }

            // --- 1. PARAMS & TIME POINTS ---
            let rLimit = 30;
            let rTimeframe = 'day';
            switch (selectedRange) {
                case '1H': rTimeframe = 'minute'; rLimit = 60; break;
                case '1D': rTimeframe = 'minute'; rLimit = 1440; break;
                case '1W': rTimeframe = 'hour'; rLimit = 168; break;
                case '1M': rTimeframe = 'day'; rLimit = 30; break;
                case '1Y': rTimeframe = 'day'; rLimit = 365; break;
                case 'ALL': rTimeframe = 'day'; rLimit = 1980; break;
                default: rTimeframe = 'day'; rLimit = 90;
            }

            let stepSeconds = 86400;
            if (rTimeframe === 'hour') stepSeconds = 3600;
            if (rTimeframe === 'minute') stepSeconds = 60;

            const nowSec = Math.floor(Date.now() / 1000);
            const gridNow = Math.floor(nowSec / stepSeconds) * stepSeconds;

            // PERFORMANCE CAP: Don't simulate more than ~100 points for maximum smoothness
            let simStep = stepSeconds;
            let simLimit = rLimit;
            if (rLimit > 100) {
                const multiplier = Math.ceil(rLimit / 100);
                simStep = stepSeconds * multiplier;
                simLimit = Math.floor(rLimit / multiplier);
            }

            let timePoints = [];
            for (let i = simLimit; i >= 0; i--) {
                const ts = gridNow - (i * simStep);
                if (ts <= nowSec) timePoints.push(ts);
            }
            if (nowSec - timePoints[timePoints.length - 1] > 1) timePoints.push(nowSec);

            // --- 2. FETCH HISTORY ---
            const { fetchCandles } = await import('../cryptoCompare');
            const historyMap = {};
            const symbolsToFetch = Array.from(significantSymbols);

            if (symbolsToFetch.length > 0) {
                await Promise.all(
                    symbolsToFetch.map(async (sym) => {
                        try {
                            const data = await fetchCandles(sym, currency, rTimeframe, rLimit + 20);
                            if (data && data.length) data.sort((a, b) => a.time - b.time);
                            historyMap[sym] = data || [];
                        } catch (err) {
                            historyMap[sym] = [];
                        }
                    })
                );
            }

            // --- 3. EFFICIENT SIMULATION ---
            const sortedTxns = [...allTxns].sort((a, b) => {
                const da = new Date(a.dateISO || a.date_iso).getTime();
                const db = new Date(b.dateISO || b.date_iso).getTime();
                return da - db;
            });

            const quantities = {};
            let txnPointer = 0;
            const historyPointers = {};
            symbolsToFetch.forEach(s => historyPointers[s] = 0);

            let graphPoints = timePoints.map(tPoint => {
                while (txnPointer < sortedTxns.length) {
                    const t = sortedTxns[txnPointer];
                    const tTime = new Date(t.dateISO || t.date_iso).getTime() / 1000;
                    if (tTime > tPoint) break;

                    if (!quantities[t.symbol]) quantities[t.symbol] = 0;
                    if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) quantities[t.symbol] += t.amount;
                    if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) quantities[t.symbol] -= t.amount;
                    txnPointer++;
                }

                let val = 0;
                for (const [sym, qty] of Object.entries(quantities)) {
                    if (qty <= 0.00000001) continue;
                    const hist = historyMap[sym];
                    if (!hist || hist.length === 0) continue;

                    let ptr = historyPointers[sym] || 0;
                    while (ptr < hist.length - 1 && hist[ptr + 1].time <= tPoint) {
                        ptr++;
                    }
                    historyPointers[sym] = ptr;
                    if (hist[ptr].time <= tPoint + simStep) {
                        val += qty * hist[ptr].close;
                    }
                }
                return { timestamp: tPoint * 1000, value: val };
            });

            const endTime = Date.now();
            console.log(`[PERF] Graph Simulation: ${endTime - startTime}ms (${graphPoints.length} points)`);

            // --- 4. POST-PROCESS ---
            const firstActiveIndex = graphPoints.findIndex(p => p.value > 0.0001);
            if (firstActiveIndex > 0 && ['1M', '1Y', 'ALL'].includes(selectedRange)) {
                graphPoints = graphPoints.slice(firstActiveIndex);
            }

            let newDelta = { val: 0, pct: 0 };
            if (graphPoints.length > 0) {
                const startVal = graphPoints[0].value;
                const endVal = graphPoints[graphPoints.length - 1].value;
                const diff = endVal - startVal;
                const pct = startVal > 0.0001 ? (diff / startVal) * 100 : 0;
                newDelta = { val: diff, pct };
                setDelta(newDelta);
                setChartColor(diff >= 0 ? '#22c55e' : '#ef4444');
            }

            // --- 5. ASSET PERFORMANCE ---
            const getAssetPerformance = (item, history, range, startTime) => {
                const { price, quantity, change24h } = item;
                if (range === '1D') {
                    const startPrice = price / (1 + (change24h / 100));
                    return { val: (price - startPrice) * quantity, pct: change24h };
                }
                if (!history || history.length === 0) return { val: 0, pct: 0 };
                const startNode = history.find(c => c.time >= startTime) || history[0];
                const startPrice = startNode.open || startNode.close;
                if (startPrice > 0) {
                    const diff = price - startPrice;
                    return { val: diff * quantity, pct: (diff / startPrice) * 100 };
                }
                return { val: 0, pct: 0 };
            };

            const newCoinDeltas = {};
            const rangeStart = timePoints[0];
            if (currentPortfolio) {
                currentPortfolio.forEach(item => {
                    newCoinDeltas[item.symbol] = getAssetPerformance(item, historyMap[item.symbol], selectedRange, rangeStart);
                });
            }
            setCoinDeltas(newCoinDeltas);
            setChartData(graphPoints);

            if (currentPortfolio?.length) {
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
            getAllTransactions().then(txs => {
                computeHistory(txs, portfolio, currency, range);
            });
        }
    }, [range, portfolio]); // Trigger on range or portfolio change

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
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={refreshPrices} tintColor="#fff" />
                }
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.subTitle}>Total Worth</Text>
                        <TouchableOpacity onPress={() => {
                            const next = currency === 'EUR' ? 'GBP' : currency === 'GBP' ? 'USD' : 'EUR';
                            setCurrencyAndReload(next);
                        }}>
                            <Text style={styles.totalText}>
                                {formatMoney(totalValue, currency)}
                            </Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={{
                                color: delta.val >= 0 ? '#22c55e' : '#ef4444',
                                fontSize: 16,
                                fontWeight: '600',
                                marginRight: 6
                            }}>
                                {delta.val >= 0 ? '+' : ''}{formatMoney(delta.val, currency)}
                            </Text>
                            <View style={{
                                backgroundColor: delta.val >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4
                            }}>
                                <Text style={{
                                    color: delta.val >= 0 ? '#22c55e' : '#ef4444',
                                    fontSize: 12,
                                    fontWeight: '700'
                                }}>
                                    {delta.pct.toFixed(2)}%
                                </Text>
                            </View>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconButton}>
                        <Settings color="#fff" size={24} />
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
                                    backgroundColor: range === r ? '#334155' : 'transparent',
                                    opacity: graphLoading ? 0.5 : 1
                                }}
                            >
                                <Text style={{
                                    color: range === r ? '#fff' : '#94a3b8',
                                    fontWeight: '600',
                                    fontSize: 13
                                }}>{r}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {graphLoading && (
                        <ActivityIndicator size="small" color="#ffff" style={{ marginTop: 10 }} />
                    )}
                </View>

                {/* ASSETS LIST */}
                <View style={{ paddingHorizontal: 16 }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Assets</Text>

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
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{item.symbol[0]}</Text>
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
                                            color: isPositive ? '#4ade80' : '#f87171',
                                            fontSize: 13,
                                            fontWeight: '500'
                                        }}>
                                            {isPositive ? '+' : ''}{formatMoney(deltaData.val, currency)}
                                        </Text>
                                        <Text style={{
                                            color: isPositive ? '#4ade80' : '#f87171',
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
