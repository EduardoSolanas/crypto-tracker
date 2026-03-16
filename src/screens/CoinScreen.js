import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinIcon from '../components/CoinIcon';
import CryptoGraph from '../components/CryptoGraph';
import { fetchCandles, fetchFxRates, fetchPortfolioPrices } from '../cryptoCompare';
import { deleteTransaction, getHoldingsMap, getMeta, listTransactionsBySymbol, syncHoldingsForSymbol } from '../db';
import { formatMoney, formatNumber } from '../utils/format';
import { mapCandlesToPoints } from '../utils/chartContracts';
import { getCoinChartFetchParams } from '../utils/coinChartRange';
import { computeCoinTransactionStats } from '../utils/transactionCalculations';
import { useTheme } from '../utils/theme';

const CHART_CACHE_TTL_MS = 5 * 60 * 1000;
const RANGE_PREFETCH_MAP = {
    '1H': ['1D'],
    '1D': ['1H', '1W'],
    '1W': ['1D', '1M'],
    '1M': ['1W', '1Y'],
    '1Y': ['1M', 'ALL'],
    'ALL': ['1Y'],
};

const getChartCacheKey = (sym, currency, range) => `${sym}:${currency}:${range}`;

// ── Module-level chart cache — persists across mounts/unmounts so revisiting
//    the same coin doesn't re-fetch chart data (TTL still applies). ──
const globalChartCache = {};

/** @internal — exposed only for test cleanup */
export function __clearChartCacheForTesting() {
    for (const key of Object.keys(globalChartCache)) {
        delete globalChartCache[key];
    }
}

const TransactionItem = React.memo(function TransactionItem({ transaction, sym, currency, coinPrice, onShowOptions, colors, fxRates, t }) {
    const isBuy = transaction.way === 'BUY' || transaction.way === 'DEPOSIT' || transaction.way === 'RECEIVE';
    const date = new Date(transaction.date_iso);
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const quoteCurrency = String(transaction.quote_currency || transaction.quoteCurrency || currency).toUpperCase();
    const fxRate = quoteCurrency === currency ? 1 : Number(fxRates?.[quoteCurrency] || 0);
    const normalizedQuoteAmount = fxRate > 0 ? (transaction.quote_amount || 0) * fxRate : (quoteCurrency === currency ? (transaction.quote_amount || 0) : 0);

    const purchasePrice = transaction.amount > 0 ? normalizedQuoteAmount / transaction.amount : 0;
    const currentPrice = coinPrice || 0;
    const deltaPct = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
    const deltaVal = (currentPrice - purchasePrice) * transaction.amount;
    const deltaColor = deltaVal >= 0 ? colors.success : colors.error;

    return (
        <View style={[styles.txCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.txHeader}>
                <View style={[styles.txBadge, isBuy ? styles.bgGreen : styles.bgRed]}>
                    <Text style={[styles.txBadgeText, isBuy ? styles.textGreen : styles.textRed]}>{transaction.way}</Text>
                </View>
                <Text style={[styles.txHeaderDate, { color: colors.textSecondary }]}>{dateStr} {t('coin.at')} {timeStr}</Text>
                <TouchableOpacity onPress={() => onShowOptions(transaction)} hitSlop={15} style={styles.txHeaderOptions} testID={`tx-options-btn-${transaction.id}`} accessibilityLabel="tx-options-btn">
                    <Feather name="more-vertical" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.txBody}>
                <View style={styles.txRow}>
                    <View style={styles.txColLeft}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t('coin.priceLabel', { sym, currency })}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatMoney(purchasePrice, currency)}</Text>
                    </View>
                    <View style={styles.txColRight}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{isBuy ? t('coin.amountAdded') : t('coin.amountRemoved')}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatNumber(transaction.amount, 2)}</Text>
                    </View>
                </View>
                <View style={[styles.txRow, styles.txRowGap]}>
                    <View style={styles.txColLeft}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{isBuy ? t('coin.costInclFee') : t('coin.received')}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatMoney(normalizedQuoteAmount, currency)}</Text>
                    </View>
                    <View style={styles.txColRight}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t('coin.currentWorth')}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatMoney(transaction.amount * currentPrice, currency)}</Text>
                    </View>
                </View>

                <View style={styles.txDeltaRow}>
                    <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t('coin.delta')}</Text>
                    <Text style={[styles.txDeltaValue, { color: deltaColor }]}>
                        {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}% ({formatMoney(deltaVal, currency)})
                    </Text>
                </View>
            </View>
        </View>
    );
});

export default function CoinScreen() {
    const { symbol, id, initialCoinData, currency: paramCurrency } = useLocalSearchParams();
    const sym = String(symbol || id || '').toUpperCase();
    const { colors } = useTheme();
    const { t } = useTranslation();

    // Initialize currency from route params (passed by HomeScreen) to avoid:
    // 1) a getMeta DB call on mount
    // 2) a state change from 'EUR' → real currency that double-fires the chart effect
    const [currency, setCurrency] = useState(() => paramCurrency || 'EUR');
    const [txs, setTxs] = useState([]);

    const [coin, setCoin] = useState(() => {
        if (initialCoinData) {
            try { return JSON.parse(initialCoinData); } catch (_e) { return null; }
        }
        return null;
    });

    const [loading, setLoading] = useState(() => !coin);
    const [range, setRange] = useState('1D');
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(true);
    const [chartError, setChartError] = useState('');
    const [fxRates, setFxRates] = useState({});

    const chartRequestIdRef = useRef(0);
    const chartInFlightKeyRef = useRef('');

    const isMountedRef = useRef(true);
    const hadInitialCoinRef = useRef(!!coin);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const safeSetState = useCallback((setter, value) => {
        if (isMountedRef.current) setter(value);
    }, []);

    const refreshData = useCallback(async () => {
        try {
            const rows = await listTransactionsBySymbol(sym);
            setTxs(rows);
            const holdings = await getHoldingsMap();
            const p = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, currency);
            setCoin(p[0] || { symbol: sym, quantity: holdings[sym] || 0, price: 0, value: 0, change24h: 0 });
        } catch (_e) {
            Alert.alert(t('coin.unableRefreshTitle'), t('coin.unableRefreshMessage'));
        }
    }, [sym, currency, t]);

    useEffect(() => {
        (async () => {
            // Only show spinner if we don't have cached data to show immediately
            if (!hadInitialCoinRef.current) safeSetState(setLoading, true);
            try {
                // When initialCoinData is present the price is already fresh (just fetched
                // by HomeScreen seconds ago) — only load DB-local data.
                if (hadInitialCoinRef.current) {
                    const [storedCurrency, transactions] = await Promise.all([
                        getMeta('currency'),
                        listTransactionsBySymbol(sym),
                    ]);
                    // Only update currency if it differs from what we got via params
                    // (edge case: param missing or stale).
                    const nextCurrency = storedCurrency || 'EUR';
                    if (nextCurrency !== currency) {
                        safeSetState(setCurrency, nextCurrency);
                    }
                    safeSetState(setTxs, transactions || []);
                } else {
                    // No initial data — full fetch needed.
                    const [storedCurrency, holdings, transactions] = await Promise.all([
                        getMeta('currency'),
                        getHoldingsMap(),
                        listTransactionsBySymbol(sym),
                    ]);

                    const nextCurrency = storedCurrency || 'EUR';
                    safeSetState(setCurrency, nextCurrency);
                    safeSetState(setTxs, transactions || []);

                    const portfolio = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, nextCurrency);
                    if (portfolio && portfolio.length > 0) {
                        safeSetState(setCoin, portfolio[0]);
                    }
                }
            } catch (e) {
                if (globalThis.__DEV__) console.error('Initial load error:', e);
            } finally {
                safeSetState(setLoading, false);
            }
        })();
        // currency intentionally omitted – including it double-fires the chart
        // effect when paramCurrency differs from the DB value on first mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sym, safeSetState]);

    useEffect(() => {
        const quoteCurrencies = [...new Set(txs.map(t => String(t.quote_currency || t.quoteCurrency || currency).toUpperCase()))];
        if (quoteCurrencies.length === 0) return;
        let active = true;
        (async () => {
            const rates = await fetchFxRates(quoteCurrencies, currency);
            if (active) safeSetState(setFxRates, rates);
        })();
        return () => { active = false; };
    }, [txs, currency, safeSetState]);

    // Keep the earliest-tx timestamp in a ref so the chart effect can read it
    // without needing `txs` as a dependency (which caused repeated chart fetches).
    const earliestTxMsRef = useRef(Date.now() - 365 * 24 * 60 * 60 * 1000);
    useEffect(() => {
        if (txs.length > 0) {
            earliestTxMsRef.current = Math.min(...txs.map((t) => new Date(t.date_iso).getTime()));
        }
    }, [txs]);

    // Chart loading is independent from page loading so we can warm it early.
    // Uses module-level globalChartCache so revisiting the same coin is instant.
    useEffect(() => {
        if (!sym) return;

        let active = true;
        const cacheKey = getChartCacheKey(sym, currency, range);
        const cached = globalChartCache[cacheKey];

        if (cached && (Date.now() - cached.timestamp < CHART_CACHE_TTL_MS)) {
            safeSetState(setChartData, cached.data);
            safeSetState(setChartLoading, false);
            safeSetState(setChartError, '');
            return () => { active = false; };
        }

        if (chartInFlightKeyRef.current === cacheKey) {
            return () => { active = false; };
        }

        const requestId = ++chartRequestIdRef.current;
        chartInFlightKeyRef.current = cacheKey;
        safeSetState(setChartLoading, true);
        safeSetState(setChartError, '');

        (async () => {
            try {
                const startTime = Date.now();
                const params = getCoinChartFetchParams(range, { earliestTxMs: earliestTxMsRef.current });
                const candles = await fetchCandles(sym, currency, params.timeframe, params.limit, params.aggregate);

                if (globalThis.__DEV__) {
                    console.log(`[PERF] Coin Chart (${range}): ${Date.now() - startTime}ms (${candles?.length || 0} pts)`);
                }

                if (!active || requestId !== chartRequestIdRef.current) return;

                const points = candles?.length ? mapCandlesToPoints(candles) : [];
                globalChartCache[cacheKey] = { data: points, timestamp: Date.now() };
                safeSetState(setChartData, points);

                // Warm up likely next range(s) so switching feels instant.
                const prefetchRanges = RANGE_PREFETCH_MAP[range] || [];
                prefetchRanges.forEach(async (r) => {
                    const prefetchKey = getChartCacheKey(sym, currency, r);
                    const hit = globalChartCache[prefetchKey];
                    if (hit && (Date.now() - hit.timestamp < CHART_CACHE_TTL_MS)) return;
                    try {
                        const p = getCoinChartFetchParams(r, { earliestTxMs: earliestTxMsRef.current });
                        const c = await fetchCandles(sym, currency, p.timeframe, p.limit, p.aggregate);
                        globalChartCache[prefetchKey] = {
                            data: c?.length ? mapCandlesToPoints(c) : [],
                            timestamp: Date.now(),
                        };
                    } catch (_e) {
                        // Ignore prefetch errors; on-demand fetch still handles misses.
                    }
                });
            } catch (e) {
                if (!active || requestId !== chartRequestIdRef.current) return;
                safeSetState(setChartError, e?.message || 'Error loading chart');
            } finally {
                if (chartInFlightKeyRef.current === cacheKey) {
                    chartInFlightKeyRef.current = '';
                }
                if (active && requestId === chartRequestIdRef.current) {
                    safeSetState(setChartLoading, false);
                }
            }
        })();

        return () => { active = false; };
    }, [sym, currency, range, safeSetState]);

    const txStats = useMemo(() => {
        const stats = computeCoinTransactionStats(txs, coin?.price || 0, coin?.quantity || 0, {
            targetCurrency: currency,
            fxRates,
        });
        const totalGainsPct = stats.totalCostBasis > 0
            ? (stats.totalGains / stats.totalCostBasis) * 100
            : 0;
        return { ...stats, totalGainsPct };
    }, [currency, fxRates, txs, coin]);

    const handleDeleteTransaction = useCallback(async (id) => {
        try {
            await deleteTransaction(id);
            await syncHoldingsForSymbol(sym);
            await refreshData();
            Alert.alert(t('coin.deletedTitle'), t('coin.deletedMessage'));
        } catch (_e) {
            Alert.alert(t('general.error'), t('coin.deleteFailedMessage'));
        }
    }, [refreshData, sym, t]);

    const showTransactionOptions = useCallback((tx) => {
        Alert.alert(
            t('coin.transactionOptionsTitle'),
            t('coin.transactionOptionsMessage'),
            [
                { text: t('general.edit'), onPress: () => router.push({ pathname: '/add-transaction', params: { id: tx.id, symbol: sym } }) },
                {
                    text: t('general.delete'),
                    style: 'destructive',
                    onPress: () => Alert.alert(t('coin.confirmDeleteTitle'), t('coin.confirmDeleteMessage'), [
                        { text: t('general.cancel'), style: 'cancel' },
                        { text: t('general.delete'), style: 'destructive', onPress: () => handleDeleteTransaction(tx.id) }
                    ])
                },
                { text: t('general.cancel'), style: 'cancel' }
            ]
        );
    }, [handleDeleteTransaction, sym, t]);

    // ── FlatList renderItem for virtualized transaction list ──
    const renderTransaction = useCallback(({ item: transaction }) => (
        <TransactionItem
            transaction={transaction}
            sym={sym}
            currency={currency}
            coinPrice={coin?.price}
            onShowOptions={showTransactionOptions}
            colors={colors}
            fxRates={fxRates}
            t={t}
        />
    ), [sym, currency, coin?.price, showTransactionOptions, colors, fxRates, t]);

    const keyExtractor = useCallback((item) => String(item.id), []);

    // ── ListHeaderComponent: KPI card + chart + tx section header + add button ──
    const listHeader = useMemo(() => (
        <>
            {/* ── KPI card: both stats rows wrapped in a surface card ── */}
            <View style={styles.kpiCard}>
                {/* Row 1: Owned / Market Value / Total Gains */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiItem}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.owned')}</Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>{formatNumber(coin?.quantity || 0, 2)}</Text>
                    </View>
                    <View style={styles.kpiItem}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.marketValue')}</Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>{formatMoney(coin?.value, currency)}</Text>
                    </View>
                    <View style={styles.kpiItem}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.totalGains')}</Text>
                        <Text style={[styles.statValue, { color: txStats.totalGains >= 0 ? colors.success : colors.error }]}>
                            {formatMoney(txStats.totalGains, currency)}
                        </Text>
                    </View>
                </View>

                {/* Row 2: Avg Buy / Avg Sell / Total Return */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiItem}>
                        <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.avgBuyPrice')}</Text>
                        <Text style={[styles.txStatValue, { color: colors.text }]}>{formatMoney(txStats.avgBuy, currency)}</Text>
                    </View>
                    <View style={styles.kpiItem}>
                        <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.avgSellPrice')}</Text>
                        <Text style={[styles.txStatValue, { color: colors.text }]}>{formatMoney(txStats.avgSell, currency)}</Text>
                    </View>
                    <View style={styles.kpiItem}>
                        <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.totalReturnPct')}</Text>
                        <Text style={[styles.txStatValue, { color: txStats.totalGains >= 0 ? colors.success : colors.error }]}>
                            {txStats.totalGainsPct >= 0 ? '+' : ''}{txStats.totalGainsPct.toFixed(2)}%
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.chartSection}>
                <View style={styles.chartHeader}>
                    <View>
                        <Text style={[styles.bigPrice, { color: colors.text }]}>{formatMoney(coin?.price, currency)}</Text>
                        <Text style={[styles.priceChange, { color: coin?.change24h >= 0 ? colors.success : colors.error }]}>
                            {formatMoney(coin?.price * (coin?.change24h / 100), currency)}
                            ({coin?.change24h >= 0 ? '+' : ''}{coin?.change24h?.toFixed(2)}%)
                        </Text>
                    </View>
                    <View style={styles.marketPairWrap}>
                        <Text style={[styles.marketPair, { color: colors.text }]}>{sym}/{String(currency).toUpperCase()}</Text>
                    </View>
                </View>

                {chartLoading && chartData.length === 0 ? (
                    <View style={styles.chartLoadingWrap}>
                        <ActivityIndicator color={colors.text} />
                    </View>
                ) : (
                    <CryptoGraph
                        type="candle"
                        data={chartData}
                        currency={currency}
                        range={range}
                        onRangeChange={setRange}
                        loading={false}
                        refreshing={chartLoading && chartData.length > 0}
                    />
                )}
                {!!chartError && (
                    <View style={styles.chartErrorWrap}>
                        <Text style={[styles.chartErrorText, { color: colors.error }]}>{chartError}</Text>
                        <TouchableOpacity
                            onPress={refreshData}
                            style={[styles.chartRetryBtn, { backgroundColor: colors.surfaceElevated }]}
                        >
                            <Text style={[styles.chartRetryText, { color: colors.text }]}>{t('general.retry')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <View style={styles.txSectionWrap}>
                <View style={styles.txSectionHeader}>
                    <Text
                        style={[styles.txSectionTitle, { color: colors.text }]}
                        testID="coin-transactions-title"
                        accessibilityLabel="coin-transactions-title"
                    >
                        {t('coin.transactionsTab')}
                    </Text>
                    {txStats.count > 0 && (
                        <Text style={[styles.txCountText, { color: colors.textSecondary }]}>#{txStats.count}</Text>
                    )}
                </View>

                <View style={styles.addTxBtnRow}>
                    <TouchableOpacity
                        style={[styles.addTxBtn, { backgroundColor: colors.primary }]}
                        onPress={() => router.push('/add-transaction')}
                    >
                        <Feather name="plus" color={colors.primaryInverse} size={20} />
                        <Text style={[styles.addTxBtnLabel, { color: colors.primaryInverse }]}>{t('coin.newTransaction')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </>
    ), [coin, currency, txStats, chartData, chartLoading, chartError, range, colors, sym, refreshData, t]);

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.background }]}
            testID="coin-screen-root"
            accessibilityLabel="coin-screen-root"
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20}>
                    <Feather name="arrow-left" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <CoinIcon symbol={sym} imageUrl={coin?.imageUrl} size={32} style={{ marginRight: 10 }} />
                    <View style={styles.headerCenterText}>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>{sym}</Text>
                    </View>
                </View>
                <View style={styles.headerSpacer} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.text} />
                </View>
            ) : (
                <FlatList
                    data={txs}
                    renderItem={renderTransaction}
                    keyExtractor={keyExtractor}
                    ListHeaderComponent={listHeader}
                    contentContainerStyle={styles.scrollContent}
                    initialNumToRender={8}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:        { flex: 1 },
    scrollContent:    { paddingBottom: 32 },

    // Header
    header:           { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerCenter:     { flexDirection: 'row', alignItems: 'center' },
    headerCenterText: { alignItems: 'center' },
    headerSpacer:     { width: 24 },
    headerTitle:      { fontSize: 18, fontWeight: '700' },
    backBtn:          { padding: 4 },
    center:           { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // KPI Card — unified surface card replacing the flat rows
    kpiCard:          { marginHorizontal: 16, marginTop: 8, marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
    kpiRow:           { flexDirection: 'row', paddingVertical: 14 },
    kpiItem:          { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    kpiColDivider:    { width: 1, marginVertical: 8 },
    kpiRowDivider:    { height: 1 },

    // KPI labels/values (kept for backwards compat)
    statsRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    statLabel:        { fontSize: 11, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValue:        { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 4 },

    // Secondary KPIs
    sectionPadding:   { paddingHorizontal: 16 },
    txStatsGrid:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 },
    txStatItem:       { flex: 1, alignItems: 'center' },
    txStatLabel:      { fontSize: 11, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
    txStatValue:      { fontWeight: '600', fontSize: 14, textAlign: 'center' },

    // Chart
    chartSection:     { paddingTop: 8 },
    chartHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, marginBottom: 8 },
    bigPrice:         { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    priceChange:      { fontSize: 14, fontWeight: '600', marginTop: 2 },
    marketPairWrap:   { alignItems: 'flex-end' },
    marketPair:       { fontSize: 20, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

    // Chart feedback
    chartLoadingWrap: { height: 250, justifyContent: 'center', alignItems: 'center' },
    chartErrorWrap:   { alignItems: 'center', marginTop: 8 },
    chartErrorText:   { fontSize: 12, marginBottom: 8 },
    chartRetryBtn:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
    chartRetryText:   { fontWeight: '600', fontSize: 12 },

    // Transactions Section
    txSectionWrap:    { paddingHorizontal: 16, paddingTop: 20, marginTop: 8 },
    txSectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    txSectionTitle:   { fontSize: 18, fontWeight: '700' },
    txSectionPct:     { fontSize: 16, fontWeight: '700' },
    txSectionCount:   { fontSize: 14, fontWeight: '600' },
    // Pill badge for transaction count
    txCountBadge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
    txCountText:      { fontSize: 13, fontWeight: '700' },
    addTxBtnRow:      { flexDirection: 'row', justifyContent: 'center', marginVertical: 16 },
    addTxBtn:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24 },
    addTxBtnLabel:    { fontWeight: '700', fontSize: 14, marginLeft: 8 },

    // Transaction Card
    txCard:           { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16, marginHorizontal: 16 },
    txHeader:         { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    txBadge:          { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 8, borderWidth: 1 },
    txBadgeText:      { fontSize: 12, fontWeight: '700' },
    txHeaderDate:     { fontSize: 12 },
    txHeaderOptions:  { marginLeft: 'auto' },
    txBody:           {},
    txRow:            { flexDirection: 'row' },
    txRowGap:         { marginTop: 12 },
    txColLeft:        { flex: 1, alignItems: 'flex-start' },
    txColRight:       { flex: 1, alignItems: 'flex-end' },
    txLabel:          { fontSize: 12, marginBottom: 4 },
    txValue:          { fontWeight: '700', fontSize: 15 },
    txDeltaRow:       { marginTop: 12 },
    txDeltaValue:     { fontWeight: '700', fontSize: 14 },

    // Shared badge colours
    bgGreen:          { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
    bgRed:            { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
    textGreen:        { color: '#22c55e' },
    textRed:          { color: '#ef4444' },
});
