import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinIcon from '../components/CoinIcon';
import CryptoGraph from '../components/CryptoGraph';
import { fetchCandles, fetchPortfolioPrices } from '../cryptoCompare';
import { computeHoldingsFromTxns, parseDeltaCsvWithReport } from '../csv';
import { clearAllData, getAllTransactions, getHoldingsMap, getMeta, initDb, insertTransactions, loadCache, saveCache } from '../db';
import { formatMoney } from '../utils/format';
import { computePortfolioHistory } from '../utils/portfolioHistory';
import { useTheme } from '../utils/theme';

// Cache expiration times
const CACHE_MAJOR = 10 * 60 * 1000;  // 10 minutes for assets > $10
const CACHE_MINOR = 60 * 60 * 1000;  // 1 hour for assets <= $10
const RANGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes per-range history cache
const debugLog = (...args) => {
    if (globalThis.__DEV__) {
        console.log(...args);
    }
};

const sortPortfolioByValueDesc = (items) => {
    const rows = Array.isArray(items) ? [...items] : [];
    rows.sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));
    return rows;
};

export default function HomeScreen() {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const tr = useCallback((key, fallback, options) => {
        const value = t(key, options);
        if (typeof value !== 'string') return fallback;
        if (value === key || value.endsWith(key)) return fallback;
        return value;
    }, [t]);
    const [booting, setBooting] = useState(true);
    const [loading, setLoading] = useState(false);
    const [currency, setCurrency] = useState('EUR');
    const [portfolio, setPortfolio] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [range, setRange] = useState('1D'); // Default range
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphRefreshing, setGraphRefreshing] = useState(false);
    const [graphError, setGraphError] = useState('');
    const [chartColor, setChartColor] = useState('#22c55e');
    const [delta, setDelta] = useState({ val: 0, pct: 0 });
    const didBootstrapRef = useRef(false);
    // Cache the last-fetched transaction list so range changes don't need a DB
    // round-trip — only invalidated when portfolio data actually changes.
    const allTxnsRef = useRef(null);
    // Bootstrap already computes history; skip the effect's first run so we don't
    // compute it a second time immediately after setPortfolio fires.
    const skipNextHistoryRef = useRef(false);
    // Per-range result cache — avoids re-fetching when the user switches back to a
    // recently-viewed range. TTL: 5 minutes (RANGE_CACHE_TTL).
    const rangeCacheRef = useRef({});

    const totalValue = useMemo(
        () => (portfolio ? portfolio.reduce((acc, c) => acc + c.value, 0) : 0),
        [portfolio]
    );

    const [coinDeltas, setCoinDeltas] = useState({});
    const [showSmallBalances, setShowSmallBalances] = useState(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const safeSetState = useCallback((setter, value) => {
        if (isMountedRef.current) {
            setter(value);
        }
    }, []);

    const getEffectiveHoldings = useCallback(async () => {
        const allTxns = await getAllTransactions();
        if (allTxns.length > 0) {
            return computeHoldingsFromTxns(
                allTxns.map(t => ({
                    symbol: t.symbol,
                    amount: t.amount,
                    way: t.way,
                }))
            );
        }
        return getHoldingsMap();
    }, []);


    // Helper: Smart Fetch
    const smartFetchPortfolio = useCallback(async (holdingsMap, cachedPortfolio, savedTimestamp) => {
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

        if (toFetch.length === 0) return sortPortfolioByValueDesc(kept);

        debugLog(`[SmartFetch] Fetching ${toFetch.length} items (Cached: ${kept.length})`);

        // Fetch only needed subset
        const subsetMap = {};
        toFetch.forEach(s => subsetMap[s] = holdingsMap[s]);

        const newItems = await fetchPortfolioPrices(subsetMap, currency);

        // Merge
        return sortPortfolioByValueDesc([...kept, ...newItems]);
    }, [currency]);

    // Compute History with dynamic range support
    const computeHistory = useCallback(async (allTxns, currentPortfolio, selectedCurrency, selectedRange) => {
        try {
            // ── Instant cache hit ───────────────────────────────────────────
            const cached = rangeCacheRef.current[selectedRange];
            const now = Date.now();
            if (cached && (now - cached.timestamp) < RANGE_CACHE_TTL) {
                // Data is fresh — paint immediately, no spinner needed
                setChartData(cached.chartData);
                setDelta(cached.delta);
                setChartColor(cached.chartColor);
                setCoinDeltas(cached.coinDeltas);
                return;
            }

            // ── Stale cache: paint old data instantly, refresh in background ─
            if (cached) {
                setChartData(cached.chartData);
                setDelta(cached.delta);
                setChartColor(cached.chartColor);
                setCoinDeltas(cached.coinDeltas);
                setGraphRefreshing(true);   // overlay spinner, chart stays visible
            } else {
                setGraphLoading(true);      // full spinner, no data yet
            }
            setGraphError('');

            const { chartData, delta, chartColor, coinDeltas } = await computePortfolioHistory({
                allTxns,
                currentPortfolio,
                currency: selectedCurrency,
                range: selectedRange,
                fetchCandles
            });

            // Write to cache
            rangeCacheRef.current[selectedRange] = { chartData, delta, chartColor, coinDeltas, timestamp: Date.now() };

            setChartData(chartData);
            setDelta(delta);
            setChartColor(chartColor);
            setCoinDeltas(coinDeltas);

            if (currentPortfolio?.length) {
                saveCache(currentPortfolio, chartData, delta, selectedRange);
            }

        } catch (e) {
            if (globalThis.__DEV__) console.error('[computeHistory] Error', e);
            setGraphError(e?.message || tr('home.refreshErrorTitle', 'Refresh Error'));
        } finally {
            setGraphLoading(false);
            setGraphRefreshing(false);
        }
    }, [tr]);
    // Recompute graph whenever range/currency/portfolio changes.
    useEffect(() => {
        if (!portfolio) return;

        // Bootstrap already computed history for the first portfolio value — skip once.
        if (skipNextHistoryRef.current) {
            skipNextHistoryRef.current = false;
            return;
        }

        // Re-use the cached transaction list when only the range changed (no DB call).
        // Invalidate the cache (allTxnsRef.current = null) after import / refresh.
        if (allTxnsRef.current !== null) {
            computeHistory(allTxnsRef.current, portfolio, currency, range);
            return;
        }

        getAllTransactions().then((txs) => {
            allTxnsRef.current = txs;
            computeHistory(txs, portfolio, currency, range);
        });
    }, [computeHistory, currency, portfolio, range]);

    useEffect(() => {
        async function bootstrap() {
            if (didBootstrapRef.current) return;
            didBootstrapRef.current = true;

            try {
                await initDb();
                const currentCurrency = await getMeta('currency');
                if (currentCurrency) safeSetState(setCurrency, currentCurrency);

                const cached = await loadCache();
                const holdingsMap = await getEffectiveHoldings();

                const filteredCachedPortfolio = cached?.portfolio ?
                    cached.portfolio.filter(item => Object.keys(holdingsMap).includes(item.symbol)) : null;

                const nextPortfolio = await smartFetchPortfolio(holdingsMap, filteredCachedPortfolio, cached?.timestamp);
                safeSetState(setPortfolio, nextPortfolio);

                if (cached?.chartData && cached?.range === range) {
                    safeSetState(setChartData, cached.chartData);
                    safeSetState(setDelta, cached.delta);
                    // History came from cache — still skip the effect's first run
                    skipNextHistoryRef.current = true;
                } else {
                    await refreshData(range);
                    // refreshData already computed history — skip the effect's first run
                    skipNextHistoryRef.current = true;
                }
            } catch (e) {
                debugLog('Bootstrap error:', e);
            } finally {
                safeSetState(setBooting, false);
            }
        }

        bootstrap();
    }, [range, refreshData, getEffectiveHoldings, smartFetchPortfolio, safeSetState]);

    const pickAndImportCsv = async () => {
        let result;
        try {
            const DocumentPicker = await import('expo-document-picker');
            result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', '*/*'],
                copyToCacheDirectory: true,
            });
        } catch (e) {
            Alert.alert(tr('home.pickerErrorTitle', 'Picker error'), String(e));
            return;
        }

        if (result.canceled || !result.assets || !result.assets.length) return;

        const asset = result.assets[0];
        setLoading(true);

        try {
            let text;
            if (asset.uri.startsWith('file://') || asset.uri.startsWith('content://')) {
                const FileSystem = await import('expo-file-system/legacy');
                text = await FileSystem.readAsStringAsync(asset.uri);
            } else {
                const res = await fetch(asset.uri);
                text = await res.text();
            }

            const { txns, report } = parseDeltaCsvWithReport(text);
            if (!txns.length) {
                Alert.alert(tr('home.parseErrorTitle', 'Parse error'), tr('home.parseErrorMessage', 'No transactions found'));
                return;
            }

            await clearAllData();
            await insertTransactions(txns);
            const holdings = await getHoldingsMap();

            const p = await fetchPortfolioPrices(holdings, currency);
            const allTxns = await getAllTransactions();
            // Invalidate cache so the next effect run fetches fresh transactions,
            // then skip that run because we're calling computeHistory directly here.
            allTxnsRef.current = allTxns;
            skipNextHistoryRef.current = true;
            setPortfolio(sortPortfolioByValueDesc(p));
            computeHistory(allTxns, p, currency, range);

            Alert.alert(
                tr('home.importCompleteTitle', 'Import complete'),
                tr('home.importCompleteMessage', `Imported: ${report.imported}\nSkipped: ${report.skipped}`, { imported: report.imported, skipped: report.skipped })
            );
        } catch (e) {
            Alert.alert(tr('home.importErrorTitle', 'Import error'), e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const refreshPrices = async () => {
        setLoading(true);
        rangeCacheRef.current = {}; // invalidate all cached ranges
        try {
            const holdings = await getEffectiveHoldings();
            const p = await fetchPortfolioPrices(holdings, currency);
            const allTxns = await getAllTransactions();
            allTxnsRef.current = allTxns;
            skipNextHistoryRef.current = true;
            setPortfolio(sortPortfolioByValueDesc(p));
            computeHistory(allTxns, p, currency, range);
        } catch (e) {
            const cached = await loadCache();
            if (cached) {
                setPortfolio(sortPortfolioByValueDesc(cached.portfolio));
                setChartData(cached.chartData);
                setDelta(cached.delta);
                Alert.alert(tr('home.offlineTitle', 'Offline'), tr('home.offlineMessage', 'Using cached data (API Error)'));
            } else {
                Alert.alert(tr('home.refreshErrorTitle', 'Refresh Error'), e?.message ?? String(e));
            }
        } finally {
            setLoading(false);
        }
    };

    const refreshData = useCallback(async (selectedRange = range) => {
        safeSetState(setGraphLoading, true);
        setGraphError('');
        try {
            const txs = await getAllTransactions();
            allTxnsRef.current = txs;
            const currentCurrency = await getMeta('currency') || currency;

            const { chartData, delta, chartColor, coinDeltas } = await computePortfolioHistory({
                allTxns: txs,
                currentPortfolio: portfolio,
                currency: currentCurrency,
                range: selectedRange,
                fetchCandles,
            });

            // Populate the per-range cache so switching back to this range is instant
            rangeCacheRef.current[selectedRange] = { chartData, delta, chartColor, coinDeltas, timestamp: Date.now() };

            safeSetState(setChartData, chartData);
            safeSetState(setDelta, delta);
            safeSetState(setChartColor, chartColor);
            safeSetState(setCoinDeltas, coinDeltas);

            if (portfolio?.length) {
                saveCache(portfolio, chartData, delta, selectedRange);
            }
        } catch (e) {
            safeSetState(setGraphError, e?.message || tr('home.refreshErrorTitle', 'Refresh Error'));
        } finally {
            safeSetState(setGraphLoading, false);
        }
    }, [range, currency, portfolio, tr, safeSetState]);

    const filteredPortfolio = useMemo(() => {
        if (!portfolio) return null;
        return portfolio.filter(c => c.value >= 10);
    }, [portfolio]);

    // Separate coins with value < 10 into two groups:
    // 1) Genuine small balances — the API returned a real price, but qty × price < 10
    // 2) Unpriced coins — the API had no data, so price === 0
    const smallBalances = useMemo(() => {
        if (!portfolio) return [];
        return portfolio.filter(c => c.value < 10 && c.price > 0);
    }, [portfolio]);

    const unpricedCoins = useMemo(() => {
        if (!portfolio) return [];
        return portfolio.filter(c => c.price === 0 || c.price == null);
    }, [portfolio]);

    const displayedPortfolio = useMemo(() => {
        if (!portfolio) return null;
        // Always show coins with value >= 10 (the main list).
        // When toggle is on, also include genuine small balances AND unpriced coins.
        if (showSmallBalances) return portfolio;
        return filteredPortfolio;
    }, [portfolio, filteredPortfolio, showSmallBalances]);

    if (booting) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <ScrollView
                refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshPrices} tintColor={colors.primary} />}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                <View style={styles.header}>
                    <View>
                        <Text
                            style={[styles.title, { color: colors.textSecondary }]}
                            testID="home-portfolio-title"
                            accessibilityLabel="home-portfolio-title"
                        >
                            {tr('home.portfolio', 'Portfolio')}
                        </Text>
                        <Text style={[styles.totalValue, { color: colors.text }]}>{formatMoney(totalValue, currency)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={[styles.delta, { color: chartColor }]}>
                                {delta.val >= 0 ? '+' : ''}{formatMoney(delta.val, currency)}
                            </Text>
                            <View style={[styles.pctBadge, { backgroundColor: chartColor + '20' }]}>
                                <Text style={[styles.pctText, { color: chartColor }]}>
                                    {delta.pct >= 0 ? '+' : ''}{delta.pct.toFixed(2)}%
                                </Text>
                            </View>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}>
                        <Feather name="settings" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <CryptoGraph
                    data={chartData}
                    range={range}
                    onRangeChange={setRange}
                    loading={graphLoading && chartData.length === 0}
                    refreshing={graphRefreshing || (graphLoading && chartData.length > 0)}
                    error={graphError}
                    color={chartColor}
                    currency={currency}
                />

                <View style={styles.assetsHeader}>
                    <Text
                        style={[styles.sectionTitle, { color: colors.text }]}
                        testID="home-assets-title"
                        accessibilityLabel="home-assets-title"
                    >
                        {tr('home.assets', 'Assets')}
                    </Text>
                </View>

                {displayedPortfolio?.length > 0 ? (
                    displayedPortfolio.map((item) => (
                <TouchableOpacity
                    key={item.symbol}
                    style={[styles.assetRow, { backgroundColor: colors.surface }]}
                    testID={`asset-row-${item.symbol}`}
                    accessibilityLabel={`asset-row-${item.symbol}`}
                    onPress={() => router.push({
                                pathname: `/coin/${item.symbol}`,
                                params: {
                                    symbol: item.symbol,
                                    id: item.id,
                                    // Pass initial data to render immediately without waiting for fetch
                                    initialCoinData: JSON.stringify(item),
                                    currency,
                                }
                            })}
                        >
                            <View style={styles.assetLeft}>
                                <CoinIcon symbol={item.symbol} size={40} />
                                <View style={{ marginLeft: 12 }}>
                                    <Text style={[styles.assetSymbol, { color: colors.text }]}>{item.symbol}</Text>
                                    <Text style={{ color: colors.textSecondary }}>
                                        {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.assetRight}>
                                <Text style={[styles.assetValue, { color: colors.text }]}>
                                    {item.price > 0 ? formatMoney(item.value, currency) : '—'}
                                </Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <Text style={[styles.assetPrice, { color: colors.textSecondary, marginRight: 8 }]}>
                                        {item.price > 0 ? formatMoney(item.price, currency) : tr('home.priceUnavailable', 'No price data')}
                                    </Text>
                                    {coinDeltas[item.symbol] && (
                                        <Text style={{
                                            color: coinDeltas[item.symbol].pct >= 0 ? '#22c55e' : '#ef4444',
                                            fontSize: 12,
                                            fontWeight: 'bold'
                                        }}>
                                            {coinDeltas[item.symbol].pct >= 0 ? '+' : ''}
                                            {coinDeltas[item.symbol].pct.toFixed(2)}%
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))
                ) : (
                    <View style={styles.emptyContainer}>
                        <Text
                            style={[styles.emptyText, { color: colors.textSecondary }]}
                            testID="home-empty-text"
                            accessibilityLabel="home-empty-text"
                        >
                            {tr('home.noData', 'No data. Import CSV.')}
                        </Text>
                        <TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.primary }]} onPress={pickAndImportCsv}>
                            <Text style={styles.importBtnText}>{tr('home.importCsv', 'Import CSV')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {(smallBalances.length > 0 || unpricedCoins.length > 0) && (
                    <TouchableOpacity
                        style={styles.smallBalancesToggle}
                        onPress={() => setShowSmallBalances(!showSmallBalances)}
                    >
                        <Text style={[styles.smallBalancesText, { color: colors.primary }]}>
                            {showSmallBalances
                                ? tr('home.hideSmallBalances', 'Hide Small Balances')
                                : tr('home.showSmallBalances', `Show ${smallBalances.length + unpricedCoins.length} Small Balances`, { count: smallBalances.length + unpricedCoins.length })}
                        </Text>
                        <Feather name={showSmallBalances ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
                    </TouchableOpacity>
                )}
            </ScrollView>

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/add-transaction')}
                testID="home-add-tx-fab"
                accessibilityLabel="home-add-tx-fab"
            >
                <Feather name="plus" size={24} color="#fff" />
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingTop: 8,
        marginBottom: 16,
    },
    title: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    totalValue: { fontSize: 32, fontWeight: 'bold', marginVertical: 4 },
    delta: { fontSize: 16, fontWeight: '600', marginRight: 8 },
    pctBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    pctText: { fontSize: 12, fontWeight: 'bold' },
    settingsBtn: { padding: 8 },
    assetsHeader: { paddingHorizontal: 16, marginBottom: 12, marginTop: 8 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold' },
    assetRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
    },
    assetLeft: { flexDirection: 'row', alignItems: 'center' },
    assetSymbol: { fontSize: 18, fontWeight: 'bold' },
    assetRight: { alignItems: 'flex-end' },
    assetValue: { fontSize: 18, fontWeight: '600' },
    assetPrice: { fontSize: 14, marginTop: 2 },
    emptyContainer: { alignItems: 'center', padding: 40 },
    emptyText: { fontSize: 16, marginBottom: 20 },
    importBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    importBtnText: { color: '#fff', fontWeight: 'bold' },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    smallBalancesToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        marginTop: 8,
        marginHorizontal: 16,
    },
    smallBalancesText: {
        fontSize: 14,
        fontWeight: '600',
        marginRight: 4,
    },
});
