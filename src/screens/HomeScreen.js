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
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphError, setGraphError] = useState('');
    const [chartColor, setChartColor] = useState('#22c55e');
    const [delta, setDelta] = useState({ val: 0, pct: 0 });
    const [coinDeltas, setCoinDeltas] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('value');
    const [showSmallBalances, setShowSmallBalances] = useState(false);
    const didBootstrapRef = useRef(false);
    const rangeCacheRef = useRef(new Map());
    const txnsRef = useRef([]);

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
            return;
        }

        const cacheKey = `${selectedRange}_${selectedCurrency}`;
        const cached = rangeCacheRef.current.get(cacheKey);

        if (cached && !isBackground) {
            setChartData(cached.chartData);
            setDelta(cached.delta);
            setChartColor(cached.chartColor);
            setCoinDeltas(cached.coinDeltas);
            setGraphError('');
            return;
        } else if (!isBackground) {
            setGraphLoading(true);
        }

        try {
            setGraphError('');
            const { chartData, delta, chartColor, coinDeltas } = await computePortfolioHistory({
                allTxns,
                currentPortfolio,
                currency: selectedCurrency,
                range: selectedRange,
                fetchCandles
            });

            rangeCacheRef.current.set(cacheKey, { chartData, delta, chartColor, coinDeltas });

            setChartData(chartData);
            setDelta(delta);
            setChartColor(chartColor);
            setCoinDeltas(coinDeltas);

            if (currentPortfolio?.length && selectedRange === '1D') {
                const rangesObj = Object.fromEntries(rangeCacheRef.current.entries());
                saveCache(currentPortfolio, chartData, delta, selectedRange, selectedCurrency, rangesObj);
            }
        } catch (e) {
            if (globalThis.__DEV__) console.error('[computeHistory] Error', e);
            if (!cached) {
                setGraphError(e?.message || tr('home.refreshErrorTitle', 'Refresh Error'));
            }
        } finally {
            if (!isBackground) {
                setGraphLoading(false);
            }
        }
    }, [tr]);

    const prewarmRanges = useCallback((allTxns, currentPortfolio, selectedCurrency) => {
        (async () => {
            // 1. Immediately prewarm 1H and 1W in parallel
            const immediateRanges = ['1H', '1W'];
            await Promise.all(
                immediateRanges.map(async (r) => {
                    try {
                        const cacheKey = `${r}_${selectedCurrency}`;
                        if (!rangeCacheRef.current.has(cacheKey)) {
                            const res = await computePortfolioHistory({
                                allTxns,
                                currentPortfolio,
                                currency: selectedCurrency,
                                range: r,
                                fetchCandles
                            });
                            rangeCacheRef.current.set(cacheKey, res);
                        }
                    } catch (_e) {}
                })
            );

            // 2. Prewarm remaining ranges sequentially (1M, ALL, 1Y)
            const remainingRanges = ['1M', 'ALL', '1Y'];
            for (const r of remainingRanges) {
                try {
                    const cacheKey = `${r}_${selectedCurrency}`;
                    if (!rangeCacheRef.current.has(cacheKey)) {
                        const res = await computePortfolioHistory({
                            allTxns,
                            currentPortfolio,
                            currency: selectedCurrency,
                            range: r,
                            fetchCandles
                        });
                        rangeCacheRef.current.set(cacheKey, res);
                    }
                } catch (_e) {}
            }

            // 3. Persist complete multi-range cache
            try {
                const rangesObj = Object.fromEntries(rangeCacheRef.current.entries());
                const d1Data = rangeCacheRef.current.get(`1D_${selectedCurrency}`);
                if (d1Data) {
                    saveCache(currentPortfolio, d1Data.chartData, d1Data.delta, '1D', selectedCurrency, rangesObj);
                }
            } catch (_e) {}
        })();
    }, []);

    const handleRangeSelect = useCallback((r) => {
        setRange(r);
        const cacheKey = `${r}_${currency}`;
        const cached = rangeCacheRef.current.get(cacheKey);
        if (cached) {
            setChartData(cached.chartData);
            setDelta(cached.delta);
            setChartColor(cached.chartColor);
            setCoinDeltas(cached.coinDeltas);
            setGraphError('');
        } else if (portfolio && portfolio.length > 0) {
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

    // Recompute graph whenever range/currency/portfolio changes.
    useEffect(() => {
        if (!portfolio || portfolio.length === 0) return;
        const cacheKey = `${range}_${currency}`;
        if (rangeCacheRef.current.has(cacheKey)) {
            return;
        }
        const txs = txnsRef.current && txnsRef.current.length > 0 ? txnsRef.current : null;
        if (txs) {
            computeHistory(txs, portfolio, currency, range);
        } else {
            getAllTransactions().then((all) => {
                txnsRef.current = all || [];
                if (all && all.length > 0) {
                    computeHistory(all, portfolio, currency, range);
                }
            });
        }
    }, [computeHistory, currency, portfolio, range]);

    useEffect(() => {
        if (didBootstrapRef.current) return;
        didBootstrapRef.current = true;
        (async () => {
            let selectedCurrency = 'EUR';
            try {
                await initDb();
                const savedCurrency = await getMeta('currency');
                selectedCurrency = savedCurrency || 'EUR';
                setCurrency(selectedCurrency);

                const allTxns = await getAllTransactions();
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
                        rangeCacheRef.current.set(k, v);
                    });
                }
                const p = await smartFetchPortfolio(holdings, cached?.portfolio, cached?.timestamp, selectedCurrency);

                setPortfolio(p);
                await computeHistory(allTxns, p, selectedCurrency, '1D');
                prewarmRanges(allTxns, p, selectedCurrency);
            } catch (e) {
                const allTxns = await getAllTransactions().catch(() => []);
                const loaded = allTxns.length > 0 ? await loadCache(selectedCurrency) : null;

                if (loaded && loaded.portfolio && loaded.portfolio.length > 0) {
                    setPortfolio(loaded.portfolio);
                    setChartData(loaded.chartData);
                    setDelta(loaded.delta);
                    setRange(loaded.range);
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
    }, [computeHistory, getEffectiveHoldings, prewarmRanges, smartFetchPortfolio, tr]);

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
        rangeCacheRef.current.clear();
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
            prewarmRanges(allTxns, p, currency);
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
        let list = portfolio.filter(p => showSmallBalances || p.value >= 10);

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(item => item.symbol.toLowerCase().includes(q));
        }

        return [...list].sort((a, b) => {
            if (sortBy === 'change') {
                return (b.change24h || 0) - (a.change24h || 0);
            }
            if (sortBy === 'name') {
                return a.symbol.localeCompare(b.symbol);
            }
            if (sortBy === 'quantity') {
                return (b.quantity || 0) - (a.quantity || 0);
            }
            return (b.value || 0) - (a.value || 0);
        });
    }, [portfolio, showSmallBalances, searchQuery, sortBy]);

    const hasSmallBalances = useMemo(
        () => (portfolio ? portfolio.some(p => p.value < 10) : false),
        [portfolio]
    );
    const hiddenCount = (portfolio?.length || 0) - (portfolio ? portfolio.filter(p => p.value >= 10).length : 0);

    if (booting) {
        return (
            <SafeAreaView style={[{ flex: 1, backgroundColor: colors?.background || '#000' }, styles.centerContent]}>
                <ActivityIndicator color={colors?.text || '#fff'} size="large" />
            </SafeAreaView>
        );
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

    const isHeroPositive = (delta?.val ?? 0) >= 0;

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
                <View style={[styles.header, { borderBottomColor: colors?.border || '#222' }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.subTitle, { color: colors?.textSecondary || '#999' }]}>
                            {tr('home.totalWorth', 'Total Worth')}
                        </Text>
                        <Text style={[styles.totalText, { color: colors?.text || '#fff' }]}>
                            {formatMoney(totalValue, currency)}
                        </Text>

                        {/* Range PnL */}
                        <View style={styles.pnlRow}>
                            <View
                                style={[
                                    styles.pnlPill,
                                    { backgroundColor: isHeroPositive ? (colors?.successBg || 'rgba(34,197,94,0.2)') : (colors?.errorBg || 'rgba(239,68,68,0.2)') }
                                ]}
                            >
                                <Text style={[
                                    styles.pnlValText,
                                    { color: isHeroPositive ? (colors?.success || '#22c55e') : (colors?.error || '#ef4444') }
                                ]}>
                                    {isHeroPositive ? '+' : ''}{formatMoney(delta?.val || 0, currency)}
                                </Text>
                                <Text style={[
                                    styles.pnlPctText,
                                    { color: isHeroPositive ? (colors?.success || '#22c55e') : (colors?.error || '#ef4444') }
                                ]}>
                                    ({isHeroPositive ? '+' : ''}{Number(delta?.pct || 0).toFixed(2)}%)
                                </Text>
                            </View>
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
                    {graphLoading && (
                        <ActivityIndicator size="small" color={colors?.text || '#fff'} style={{ marginTop: 8 }} />
                    )}
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

                            const isPositive = (deltaData.val || 0) >= 0;

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
                                                color: isPositive ? (colors?.success || '#22c55e') : (colors?.error || '#ef4444'),
                                                fontSize: 13,
                                                fontWeight: '600'
                                            }}>
                                                {isPositive ? '+' : ''}{formatMoney(deltaData.val, currency)}
                                            </Text>
                                            <Text style={{
                                                color: isPositive ? (colors?.success || '#22c55e') : (colors?.error || '#ef4444'),
                                                fontSize: 13,
                                                fontWeight: '600',
                                                marginLeft: 4
                                            }}>
                                                ({isPositive ? '+' : ''}{Number(deltaData?.pct || 0).toFixed(2)}%)
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
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    subTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    totalText: { fontSize: 34, fontWeight: '800', marginVertical: 4 },
    iconButton: { padding: 10, borderRadius: 20 },

    pnlRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    pnlPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    pnlValText: { fontSize: 14, fontWeight: '700', marginRight: 4 },
    pnlPctText: { fontSize: 13, fontWeight: '600' },

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
