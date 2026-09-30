import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import {
    Plus,
    Search,
    Settings,
    TrendingUp,
    Upload,
    X
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinIcon from '../components/CoinIcon';
import StartupScreen from '../components/StartupScreen';
import CryptoGraph from '../components/CryptoGraph';
import { clearCandleCache, fetchCandles, fetchPortfolioPrices } from '../cryptoCompare';
import { computeHoldingsFromTxns, parseDeltaCsvWithReport } from '../csv';
import { getAllTransactions, getHoldingsMap, getMeta, initDb, loadCache, replaceAllTransactions, saveCache } from '../db';
import { formatMoney, formatQuantity } from '../utils/format';
import { computePortfolioHistory } from '../utils/portfolioHistory';
import { useTheme } from '../utils/theme';

const CACHE_MAJOR = 10 * 60 * 1000;  // 10 minutes for assets > $10
const CACHE_MINOR = 60 * 60 * 1000;  // 1 hour for assets <= $10

const debugLog = (...args) => {
    if (globalThis.__DEV__) {
        console.log(...args);
    }
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
    const [range, setRange] = useState('1D');
    const [graphLoading, setGraphLoading] = useState(true);
    const [graphError, setGraphError] = useState('');
    const [chartColor, setChartColor] = useState('#22c55e');
    const [delta, setDelta] = useState({ val: 0, pct: 0 });
    const [coinDeltas, setCoinDeltas] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('value');
    const [showSmallBalances, setShowSmallBalances] = useState(false);
    const didBootstrapRef = useRef(false);
    const rangeCacheRef = useRef(new Map());
    const historyRequestsRef = useRef(new Map());
    const historyGenerationRef = useRef(0);
    const txnsRef = useRef([]);
    const activeRangeRef = useRef(range);
    const activeCurrencyRef = useRef(currency);
    useEffect(() => { activeRangeRef.current = range; }, [range]);
    useEffect(() => { activeCurrencyRef.current = currency; }, [currency]);

    const totalValue = useMemo(
        () => (portfolio ? portfolio.reduce((acc, c) => acc + (c.value || 0), 0) : 0),
        [portfolio]
    );

    const getEffectiveHoldings = useCallback(async () => {
        const allTxns = txnsRef.current.length > 0 ? txnsRef.current : await getAllTransactions();
        if (allTxns && allTxns.length > 0) {
            txnsRef.current = allTxns;
            return computeHoldingsFromTxns(
                allTxns.map(t => ({
                    symbol: t.symbol,
                    amount: Number(t.amount || 0),
                    way: t.way,
                }))
            );
        }
        return {};
    }, []);

    const smartFetchPortfolio = useCallback(async (holdingsMap, cachedPortfolio, savedTimestamp, selectedCurrency) => {
        const symbols = Object.keys(holdingsMap || {}).filter(s => (holdingsMap[s] || 0) > 0.00000001);
        if (symbols.length === 0) {
            return [];
        }

        const now = Date.now();
        const toFetch = [];
        const kept = [];

        if (!cachedPortfolio || !savedTimestamp) {
            toFetch.push(...symbols);
        } else {
            const cacheMap = new Map(cachedPortfolio.map(i => [i.symbol, i]));

            for (const sym of symbols) {
                const cachedItem = cacheMap.get(sym);
                if (!cachedItem || !cachedItem.price || cachedItem.price <= 0) {
                    toFetch.push(sym);
                } else {
                    const val = cachedItem.value;
                    const age = now - savedTimestamp;
                    const threshold = val > 10 ? CACHE_MAJOR : CACHE_MINOR;

                    if (age > threshold) {
                        toFetch.push(sym);
                    } else {
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

        debugLog(`[SmartFetch] Fetching ${toFetch.length} items (Cached: ${kept.length})`);

        const subsetMap = {};
        toFetch.forEach(s => subsetMap[s] = holdingsMap[s]);

        const newItems = await fetchPortfolioPrices(subsetMap, selectedCurrency);
        const merged = [...kept, ...newItems];
        merged.sort((a, b) => b.value - a.value);
        return merged;
    }, []);

    const computeHistory = useCallback(async (allTxns, currentPortfolio, selectedCurrency, selectedRange, isBackground = false) => {
        if (!allTxns || !allTxns.length) {
            setChartData([]);
            setDelta({ val: 0, pct: 0 });
            setCoinDeltas({});
            setGraphLoading(false);
            return;
        }

        const cacheKey = `${selectedRange}_${selectedCurrency}`;
        const requestGeneration = historyGenerationRef.current;
        const cached = rangeCacheRef.current.get(cacheKey);
        let request;

        if (cached && !isBackground) {
            setChartData(cached.chartData);
            setDelta(cached.delta);
            setChartColor(cached.chartColor);
            setCoinDeltas(cached.coinDeltas);
            setGraphError('');
            setGraphLoading(false);
            return;
        } else if (!isBackground) {
            // Never leave the previous range visible while the requested range loads.
            setChartData([]);
            setGraphLoading(true);
        }

        try {
            setGraphError('');
            request = historyRequestsRef.current.get(cacheKey);
            if (!request) {
                request = computePortfolioHistory({
                    allTxns,
                    currentPortfolio,
                    currency: selectedCurrency,
                    range: selectedRange,
                    fetchCandles
                });
                historyRequestsRef.current.set(cacheKey, request);
            }

            const { chartData, delta, chartColor, coinDeltas } = await request;

            // A refresh/import supersedes any history request that was already running.
            if (requestGeneration !== historyGenerationRef.current) return;

            rangeCacheRef.current.set(cacheKey, { chartData, delta, chartColor, coinDeltas });

            // A background request may finish after the user changes range/currency.
            // Keep its cache entry, but only paint it if it is still selected.
            if (activeRangeRef.current === selectedRange && activeCurrencyRef.current === selectedCurrency) {
                setChartData(chartData);
                setDelta(delta);
                setChartColor(chartColor);
                setCoinDeltas(coinDeltas);
            }

            if (currentPortfolio?.length && selectedRange === '1D') {
                const rangesObj = Object.fromEntries(rangeCacheRef.current.entries());
                saveCache(currentPortfolio, chartData, delta, selectedRange, selectedCurrency, rangesObj);
            }
        } catch (e) {
            if (globalThis.__DEV__) console.error('[computeHistory] Error', e);
            if (
                requestGeneration === historyGenerationRef.current &&
                !cached &&
                activeRangeRef.current === selectedRange &&
                activeCurrencyRef.current === selectedCurrency
            ) {
                setGraphError(e?.message || tr('home.refreshErrorTitle', 'Refresh Error'));
            }
        } finally {
            if (historyRequestsRef.current.get(cacheKey) === request) {
                historyRequestsRef.current.delete(cacheKey);
            }
            if (
                requestGeneration === historyGenerationRef.current &&
                activeRangeRef.current === selectedRange &&
                activeCurrencyRef.current === selectedCurrency
            ) {
                setGraphLoading(false);
            }
        }
    }, [tr]);

    const handleRangeSelect = useCallback((r) => {
        activeRangeRef.current = r;
        setRange(r);
        const cacheKey = `${r}_${currency}`;
        const cached = rangeCacheRef.current.get(cacheKey);
        if (cached) {
            setChartData(cached.chartData);
            setDelta(cached.delta);
            setChartColor(cached.chartColor);
            setCoinDeltas(cached.coinDeltas);
            setGraphError('');
            setGraphLoading(false);
        } else if (portfolio && portfolio.length > 0) {
            setChartData([]);
            setGraphLoading(true);
            const txs = txnsRef.current && txnsRef.current.length > 0 ? txnsRef.current : null;
            if (txs) {
                computeHistory(txs, portfolio, currency, r);
            } else {
                getAllTransactions().then((all) => {
                    txnsRef.current = all || [];
                    if (all && all.length > 0) computeHistory(all, portfolio, currency, r);
                });
            }
        }
    }, [computeHistory, currency, portfolio]);

    useEffect(() => {
        if (didBootstrapRef.current) return;
        didBootstrapRef.current = true;
        (async () => {
            let selectedCurrency = 'EUR';
            try {
                await initDb();
                const [savedCurrency, allTxns] = await Promise.all([
                    getMeta('currency'),
                    getAllTransactions()
                ]);
                selectedCurrency = savedCurrency || 'EUR';
                setCurrency(selectedCurrency);
                activeCurrencyRef.current = selectedCurrency;

                txnsRef.current = allTxns || [];
                if (!allTxns || allTxns.length === 0) {
                    setPortfolio([]);
                    setBooting(false);
                    return;
                }

                const holdings = await getEffectiveHoldings();
                const symbols = Object.keys(holdings).filter(s => (holdings[s] || 0) > 0.00000001);
                if (symbols.length === 0) {
                    setPortfolio([]);
                    setBooting(false);
                    return;
                }

                const cached = await loadCache(selectedCurrency);
                if (cached?.rangesMap) {
                    Object.entries(cached.rangesMap).forEach(([k, v]) => {
                        if (v && v.chartData && v.chartData.length > 0) {
                            rangeCacheRef.current.set(k, v);
                        }
                    });
                }

                // Parallelize price fetching and 1D candles pre-fetching for fast first load.
                // Do not show the graphs screen until both API calls and graph building complete.
                const [freshPortfolio] = await Promise.all([
                    smartFetchPortfolio(holdings, cached?.portfolio, cached?.timestamp, selectedCurrency),
                    Promise.all(symbols.map(sym => fetchCandles(sym, selectedCurrency, 'hour', 44, 1).catch(() => [])))
                ]);

                if (freshPortfolio && freshPortfolio.length > 0) {
                    setPortfolio(freshPortfolio);
                    await computeHistory(allTxns, freshPortfolio, selectedCurrency, '1D');
                } else {
                    setPortfolio([]);
                }
            } catch (e) {
                const allTxns = await getAllTransactions().catch(() => []);
                const loaded = allTxns.length > 0 ? await loadCache(selectedCurrency) : null;

                if (loaded && loaded.portfolio && loaded.portfolio.length > 0) {
                    setPortfolio(loaded.portfolio);
                    setChartData(loaded.chartData);
                    setDelta(loaded.delta);
                    setRange('1D');
                    activeRangeRef.current = '1D';
                    setGraphLoading(false);
                    Alert.alert(tr('home.offlineModeTitle', 'Offline Mode'), tr('home.offlineModeMessage', 'Using cached data (API Limit / Network).'));
                } else {
                    setPortfolio([]);
                    if (e.message && e.message.includes('Rate Limit')) {
                        Alert.alert(tr('home.apiLimitTitle', 'API Limit'), tr('home.apiLimitMessage', 'Rate limit reached. Please wait.'));
                    } else if (e.message && e.message.includes('Type 99')) {
                        Alert.alert(tr('home.apiLimitTitle', 'API Limit'), tr('home.apiLimitMessage', 'Rate limit reached. Please wait.'));
                    } else if (allTxns.length > 0) {
                        Alert.alert(tr('general.error', 'Error'), e.message);
                    }
                }
            } finally {
                setBooting(false);
            }
        })();
    }, [computeHistory, getEffectiveHoldings, smartFetchPortfolio, tr]);

    const pickAndImportCsv = async () => {
        let result;
        try {
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

            await replaceAllTransactions(txns);
            const holdings = await getHoldingsMap();

            const p = await fetchPortfolioPrices(holdings, currency);
            const allTxns = await getAllTransactions();
            txnsRef.current = allTxns || [];
            setPortfolio(p);
            historyGenerationRef.current += 1;
            rangeCacheRef.current.clear();
            historyRequestsRef.current.clear();
            await computeHistory(allTxns, p, currency, range);

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
        historyGenerationRef.current += 1;
        rangeCacheRef.current.clear();
        historyRequestsRef.current.clear();
        clearCandleCache();
        try {
            const allTxns = await getAllTransactions();
            txnsRef.current = allTxns || [];
            if (!allTxns || allTxns.length === 0) {
                setPortfolio([]);
                return;
            }
            const holdings = await getEffectiveHoldings();
            const symbols = Object.keys(holdings).filter(s => (holdings[s] || 0) > 0.00000001);
            if (symbols.length === 0) {
                setPortfolio([]);
                return;
            }
            const p = await fetchPortfolioPrices(holdings, currency);
            setPortfolio(p);
            await computeHistory(allTxns, p, currency, range);
        } catch (e) {
            const allTxns = await getAllTransactions().catch(() => []);
            const cached = allTxns.length > 0 ? await loadCache(currency) : null;
            if (cached && cached.portfolio && cached.portfolio.length > 0) {
                setPortfolio(cached.portfolio);
                setChartData(cached.chartData);
                setDelta(cached.delta);
                Alert.alert(tr('home.offlineTitle', 'Offline'), tr('home.offlineMessage', 'Using cached data (API Error)'));
            } else {
                setPortfolio([]);
                Alert.alert(tr('home.refreshErrorTitle', 'Refresh Error'), e?.message ?? String(e));
            }
        } finally {
            setLoading(false);
        }
    };

    // Filter & Sort for visible portfolio
    const visiblePortfolio = useMemo(() => {
        if (!portfolio) return [];
        let list = portfolio.filter(p => showSmallBalances || (p.value || 0) >= 10);

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(item => item.symbol.toLowerCase().includes(q));
        }

        return [...list].sort((a, b) => {
            const aVal = Number.isFinite(a?.value) ? a.value : 0;
            const bVal = Number.isFinite(b?.value) ? b.value : 0;
            const aHasNormalVal = aVal >= 10;
            const bHasNormalVal = bVal >= 10;
            const aHasZeroVal = aVal <= 0 || !a?.price || a.price <= 0;
            const bHasZeroVal = bVal <= 0 || !b?.price || b.price <= 0;

            // 1. Currencies with normal balances (>= 10) always appear before small/zero balances (< 10)
            if (aHasNormalVal !== bHasNormalVal) {
                return aHasNormalVal ? -1 : 1;
            }

            // 2. Currencies with small balances (> 0) appear before currencies with NO value (<= 0)
            if (aHasZeroVal !== bHasZeroVal) {
                return aHasZeroVal ? 1 : -1;
            }

            // 3. Sort within the same tier by selected sort criteria
            if (sortBy === 'change') {
                const aChange = Number.isFinite(a?.change24h) ? a.change24h : 0;
                const bChange = Number.isFinite(b?.change24h) ? b.change24h : 0;
                return bChange - aChange;
            }
            if (sortBy === 'name') {
                return (a?.symbol || '').localeCompare(b?.symbol || '');
            }
            if (sortBy === 'quantity') {
                const aQty = Number.isFinite(a?.quantity) ? a.quantity : 0;
                const bQty = Number.isFinite(b?.quantity) ? b.quantity : 0;
                return bQty - aQty;
            }
            return bVal - aVal;
        });
    }, [portfolio, showSmallBalances, searchQuery, sortBy]);

    const hasSmallBalances = useMemo(
        () => (portfolio ? portfolio.some(p => (p.value || 0) < 10) : false),
        [portfolio]
    );
    const hiddenCount = (portfolio?.length || 0) - (portfolio ? portfolio.filter(p => (p.value || 0) >= 10).length : 0);

    if (booting) {
        return <StartupScreen />;
    }

    if (!portfolio || portfolio.length === 0) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors?.background || '#000' }}>
                <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors?.background || '#000'} />
                <View style={styles.centerContent}>
                    <View style={[styles.emptyIconCircle, { backgroundColor: colors?.surfaceElevated || '#222' }]}>
                        <TrendingUp color={colors?.primary || '#fff'} size={48} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors?.text || '#fff' }]}>{tr('home.portfolio', 'Portfolio')}</Text>
                    <Text style={[styles.emptySubtitle, { color: colors?.textSecondary || '#999' }]}>
                        {tr('home.noData', 'No data. Import CSV.')}
                    </Text>

                    <View style={styles.emptyActionRow}>
                        <TouchableOpacity
                            style={[styles.emptyBtn, { backgroundColor: colors?.primary || '#fff' }]}
                            onPress={() => router.push('/add-transaction')}
                        >
                            <Plus color={colors?.primaryInverse || '#000'} size={18} style={{ marginRight: 6 }} />
                            <Text style={[styles.emptyBtnText, { color: colors?.primaryInverse || '#000' }]}>
                                {tr('home.addFirstTransaction', 'Add Transaction')}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.emptyBtnSecondary, { backgroundColor: colors?.surface || '#111', borderColor: colors?.border || '#333' }]}
                            onPress={pickAndImportCsv}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color={colors?.text || '#fff'} />
                            ) : (
                                <>
                                    <Upload color={colors?.text || '#fff'} size={18} style={{ marginRight: 6 }} />
                                    <Text style={[styles.emptyBtnTextSecondary, { color: colors?.text || '#fff' }]}>
                                        {tr('home.importCsv', 'Import CSV')}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    const heroVal = delta?.val ?? 0;
    const heroPct = delta?.pct ?? 0;
    const isHeroPositive = heroVal > 0 || (heroVal === 0 && heroPct > 0.001);
    const isHeroNegative = heroVal < 0 || (heroVal === 0 && heroPct < -0.001);
    const heroColor = isHeroPositive
        ? (colors?.success || '#22c55e')
        : isHeroNegative
            ? (colors?.error || '#ef4444')
            : (colors?.textSecondary || '#999');

    return (
        <View style={{ flex: 1, backgroundColor: colors?.background || '#000' }}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors?.background || '#000'} />
            <ScrollView
                contentContainerStyle={{ paddingBottom: 110 }}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={refreshPrices} tintColor={colors?.text || '#fff'} />
                }
            >
                {/* Header / Hero */}
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.subTitle, { color: colors?.textSecondary || '#999' }]}>
                            {tr('home.totalWorth', 'Total Worth')}
                        </Text>
                        <Text style={[styles.totalText, { color: colors?.text || '#fff' }]}>
                            {formatMoney(totalValue, currency)}
                        </Text>

                        {/* Range PnL */}
                        <View style={styles.pnlRow}>
                            <Text style={[
                                styles.pnlValText,
                                { color: heroColor }
                            ]}>
                                {isHeroPositive ? '+' : ''}{formatMoney(heroVal, currency)}
                            </Text>
                            <Text style={[
                                styles.pnlPctText,
                                { color: heroColor }
                            ]}>
                                ({isHeroPositive ? '+' : ''}{Number(heroPct).toFixed(2)}%)
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push('/settings')}
                        style={[styles.iconButton, { backgroundColor: colors?.surfaceElevated || '#222' }]}
                        hitSlop={10}
                    >
                        <Settings color={colors?.text || '#fff'} size={22} />
                    </TouchableOpacity>
                </View>

                {/* GRAPH SECTION */}
                <View style={{ marginBottom: 16 }}>
                    <View style={styles.graphFrame}>
                        {graphLoading ? (
                            <ActivityIndicator
                                testID="graph-loading-indicator"
                                size="small"
                                color={colors?.text || '#fff'}
                            />
                        ) : !graphError ? (
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
                        ) : null}
                    </View>

                    {!!graphError && (
                        <View style={{ alignItems: 'center', marginTop: 12 }}>
                            <Text style={{ color: colors?.error || '#ef4444', fontSize: 12, marginBottom: 8 }}>{graphError}</Text>
                            <TouchableOpacity
                                onPress={refreshPrices}
                                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: colors?.surfaceElevated || '#222' }}
                            >
                                <Text style={{ color: colors?.text || '#fff', fontWeight: '600', fontSize: 12 }}>{tr('general.retry', 'Retry')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Range Selector */}
                    <View style={styles.rangeSelectorRow}>
                        {['1H', '1D', '1W', '1M', '1Y', 'ALL'].map((r) => (
                            <TouchableOpacity
                                key={r}
                                onPress={() => handleRangeSelect(r)}
                                style={[
                                    styles.rangePill,
                                    range === r && { backgroundColor: colors?.surfaceElevated || '#222' }
                                ]}
                            >
                                <Text style={[
                                    styles.rangePillText,
                                    { color: range === r ? (colors?.text || '#fff') : (colors?.textSecondary || '#999') }
                                ]}>
                                    {r}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>



                {/* ASSETS SECTION */}
                <View style={styles.assetsSection}>
                    <View style={styles.assetsHeaderRow}>
                        <Text style={[styles.assetsHeading, { color: colors?.text || '#fff' }]}>
                            {tr('home.assets', 'Assets')}
                        </Text>
                    </View>

                    {/* Search & Sort Controls */}
                    <View style={styles.filterControlsRow}>
                        <View style={[styles.searchBox, { backgroundColor: colors?.surface || '#111', borderColor: colors?.border || '#222' }]}>
                            <Search size={16} color={colors?.textSecondary || '#999'} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[styles.searchInput, { color: colors?.text || '#fff' }]}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder={tr('home.searchPlaceholder', 'Search coins (e.g. BTC, ETH)...')}
                                placeholderTextColor={colors?.textSecondary || '#999'}
                                autoCapitalize="none"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                                    <X size={16} color={colors?.textSecondary || '#999'} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Sort Pills */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.sortScrollView}
                        contentContainerStyle={styles.sortPillsRow}
                    >
                        {[
                            { key: 'value', label: tr('home.sortValue', 'Best Value') },
                            { key: 'change', label: tr('home.sortChange', '24h %') },
                            { key: 'name', label: tr('home.sortName', 'A-Z') },
                            { key: 'quantity', label: tr('home.sortQuantity', 'Quantity') }
                        ].map((sortItem) => (
                            <TouchableOpacity
                                key={sortItem.key}
                                style={[
                                    styles.sortPill,
                                    { backgroundColor: colors?.surfaceElevated || '#222' },
                                    sortBy === sortItem.key && { backgroundColor: colors?.primary || '#fff' }
                                ]}
                                onPress={() => setSortBy(sortItem.key)}
                            >
                                <Text style={[
                                    styles.sortPillText,
                                    { color: colors?.textSecondary || '#999' },
                                    sortBy === sortItem.key && { color: colors?.primaryInverse || '#000', fontWeight: '700' }
                                ]}>
                                    {sortItem.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Asset Items List */}
                    {visiblePortfolio.length === 0 ? (
                        <View style={styles.noResultsBox}>
                            <Text style={[styles.noResultsText, { color: colors?.textSecondary || '#999' }]}>
                                {tr('home.noMatchingCoins', `No coins matching "${searchQuery}"`, { query: searchQuery })}
                            </Text>
                        </View>
                    ) : (
                        visiblePortfolio.map((item) => {
                            let deltaData = coinDeltas[item.symbol];

                            if (!deltaData) {
                                const startPrice = item.price / (1 + ((item.change24h || 0) / 100));
                                const valDelta = (item.price - startPrice) * item.quantity;
                                deltaData = { val: valDelta, pct: item.change24h || 0 };
                            }

                            if (typeof deltaData === 'number') {
                                const pct = deltaData;
                                const startPrice = item.price / (1 + (pct / 100));
                                const valDelta = (item.price - startPrice) * item.quantity;
                                deltaData = { val: valDelta, pct };
                            }

                            const itemValDelta = deltaData?.val || 0;
                            const itemPctDelta = deltaData?.pct || 0;
                            const isPositive = itemValDelta > 0 || (itemValDelta === 0 && itemPctDelta > 0.001);
                            const isNegative = itemValDelta < 0 || (itemValDelta === 0 && itemPctDelta < -0.001);
                            const itemColor = isPositive
                                ? (colors?.success || '#22c55e')
                                : isNegative
                                    ? (colors?.error || '#ef4444')
                                    : (colors?.textSecondary || '#999');

                            return (
                                <TouchableOpacity
                                    key={item.symbol}
                                    style={[styles.coinRow, { borderBottomColor: colors?.border || '#222' }]}
                                    onPress={() => router.push({ pathname: '/coin/[symbol]', params: { symbol: item.symbol, currency } })}
                                    activeOpacity={0.7}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <CoinIcon
                                            symbol={item.symbol}
                                            imageUrl={item.imageUrl}
                                            size={40}
                                            style={{ marginRight: 12 }}
                                        />
                                        <View>
                                            <Text style={[styles.coinSymbol, { color: colors?.text || '#fff' }]}>{item.symbol}</Text>
                                            <Text style={[styles.coinPrice, { color: colors?.textSecondary || '#999' }]}>
                                                {formatQuantity(item.quantity)} | {formatMoney(item.price, currency)}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[styles.coinValue, { color: colors?.text || '#fff' }]}>
                                            {formatMoney(item.value, currency)}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                            <Text style={{
                                                color: itemColor,
                                                fontSize: 13,
                                                fontWeight: '600'
                                            }}>
                                                {isPositive ? '+' : ''}{formatMoney(itemValDelta, currency)}
                                            </Text>
                                            <Text style={{
                                                color: itemColor,
                                                fontSize: 13,
                                                fontWeight: '600',
                                                marginLeft: 4
                                            }}>
                                                ({isPositive ? '+' : ''}{Number(itemPctDelta).toFixed(2)}%)
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}

                    {/* Small Balances Toggle */}
                    {hasSmallBalances && (
                        <TouchableOpacity
                            onPress={() => setShowSmallBalances(!showSmallBalances)}
                            style={styles.smallBalancesBtn}
                        >
                            <Text style={[styles.smallBalancesText, { color: colors?.textSecondary || '#999' }]}>
                                {showSmallBalances
                                    ? tr('home.hideSmallBalances', 'Hide Small Balances')
                                    : tr('home.showSmallBalances', `Show ${hiddenCount} Small Balances`, { count: hiddenCount })}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* Add Transaction Button */}
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: colors?.primary || '#fff' }]}
                        onPress={() => router.push('/add-transaction')}
                    >
                        <Plus color={colors?.primaryInverse || '#000'} size={20} />
                        <Text style={[styles.addButtonText, { color: colors?.primaryInverse || '#000' }]}>
                            {tr('home.addTransaction', 'Add Transaction')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 56,
        paddingBottom: 12,
    },
    subTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    totalText: { fontSize: 34, fontWeight: '800', marginVertical: 4 },
    iconButton: { padding: 10, borderRadius: 20 },

    pnlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    pnlValText: { fontSize: 14, fontWeight: '700', marginRight: 4 },
    pnlPctText: { fontSize: 13, fontWeight: '600' },

    graphFrame: {
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
    },

    rangeSelectorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: 16,
    },
    rangePill: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 14,
    },
    rangePillText: { fontSize: 13, fontWeight: '700' },



    assetsSection: { paddingHorizontal: 16 },
    assetsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    assetsHeading: { fontSize: 20, fontWeight: '800' },

    filterControlsRow: {
        marginBottom: 10,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },

    sortScrollView: {
        marginHorizontal: -16,
        marginBottom: 14,
    },
    sortPillsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
    },
    sortPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    sortPillText: {
        fontSize: 12,
        fontWeight: '600',
    },

    coinRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    coinSymbol: { fontWeight: '700', fontSize: 16 },
    coinPrice: { fontSize: 13, marginTop: 2 },
    coinValue: { fontWeight: '700', fontSize: 16 },

    smallBalancesBtn: {
        alignSelf: 'center',
        marginTop: 16,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    smallBalancesText: { fontSize: 13, fontWeight: '600' },

    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 14,
        marginTop: 20,
    },
    addButtonText: { fontWeight: '700', fontSize: 15, marginLeft: 8 },

    noResultsBox: {
        paddingVertical: 32,
        alignItems: 'center',
    },
    noResultsText: { fontSize: 14 },

    emptyIconCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
    emptySubtitle: { fontSize: 15, textAlign: 'center', marginBottom: 24, maxWidth: 300, lineHeight: 22 },
    emptyActionRow: { gap: 12, width: '100%', maxWidth: 280 },
    emptyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
    },
    emptyBtnText: { fontWeight: '700', fontSize: 15 },
    emptyBtnSecondary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
    },
    emptyBtnTextSecondary: { fontWeight: '700', fontSize: 15 },
});
