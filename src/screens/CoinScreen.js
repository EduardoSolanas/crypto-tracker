import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MoreVertical, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    InteractionManager,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinIcon from '../components/CoinIcon';
import CryptoGraph from '../components/CryptoGraph';
import { fetchCandles, fetchFxRates, fetchPortfolioPrices } from '../cryptoCompare';
import { getHoldingsMap, getMeta, listTransactionsBySymbol } from '../db';
import { formatMoney, formatNumber } from '../utils/format';
import { mapCandlesToPoints } from '../utils/chartContracts';
import { COIN_CHART_RANGES, getCoinChartFetchParams } from '../utils/coinChartRange';
import { computeCoinTransactionStats } from '../utils/transactionCalculations';
import { useTheme } from '../utils/theme';

const TransactionItem = React.memo(function TransactionItem({ transaction, sym, currency, coinPrice, onShowOptions, colors, fxRates, t }) {
    const isBuy = transaction.way === 'BUY' || transaction.way === 'DEPOSIT' || transaction.way === 'RECEIVE';
    const date = new Date(transaction.date_iso);
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const quoteCurrency = String(transaction.quote_currency || transaction.quoteCurrency || currency).toUpperCase();
    const fxRate = quoteCurrency === currency ? 1 : Number(fxRates?.[quoteCurrency] || 0);
    const normalizedQuoteAmount = fxRate > 0 ? (transaction.quote_amount || 0) * fxRate : (quoteCurrency === currency ? (transaction.quote_amount || 0) : 0);

    // Calculate actual delta for this transaction
    const purchasePrice = transaction.amount > 0 ? normalizedQuoteAmount / transaction.amount : 0;
    const currentPrice = coinPrice || 0;
    const deltaPct = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
    const deltaVal = (currentPrice - purchasePrice) * transaction.amount;
    const deltaColor = deltaVal >= 0 ? '#22c55e' : '#ef4444';

    return (
        <View style={[styles.txCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.txHeader}>
                <View style={[styles.txBadge, isBuy ? styles.bgGreen : styles.bgRed]}>
                    <Text style={[styles.txBadgeText, isBuy ? styles.textGreen : styles.textRed]}>{transaction.way}</Text>
                </View>
                <Text style={[styles.txHeaderDate, { color: colors.textSecondary }]}>{dateStr} {t('coin.at')} {timeStr} {t('coin.viaManual')}</Text>
                <TouchableOpacity onPress={() => onShowOptions(transaction)} hitSlop={15} style={{ marginLeft: 'auto' }}>
                    <MoreVertical size={16} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.txBody}>
                <View style={styles.txRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t('coin.priceLabel', { sym, currency })}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatMoney(purchasePrice, currency)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{isBuy ? t('coin.amountAdded') : t('coin.amountRemoved')}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatNumber(transaction.amount, 6)}</Text>
                    </View>
                </View>
                <View style={[styles.txRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{isBuy ? t('coin.costInclFee') : t('coin.received')}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatMoney(normalizedQuoteAmount, currency)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t('coin.currentWorth')}</Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>{formatMoney(transaction.amount * currentPrice, currency)}</Text>
                    </View>
                </View>

                <View style={{ marginTop: 12 }}>
                    <Text style={[styles.txLabel, { color: colors.textSecondary }]}>{t('coin.delta')}</Text>
                    <Text style={{ color: deltaColor, fontWeight: 'bold', fontSize: 14 }}>
                        {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}% ({formatMoney(deltaVal, currency)})
                    </Text>
                </View>
            </View>
        </View>
    );
});

export default function CoinScreen() {
    const { symbol, id } = useLocalSearchParams();
    const sym = String(symbol || id || '').toUpperCase();
    const { colors } = useTheme();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [currency, setCurrency] = useState('EUR');
    const [txs, setTxs] = useState([]);
    const [coin, setCoin] = useState(null);

    const [activeTab, setActiveTab] = useState('General');
    const [range, setRange] = useState('1D');
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState('');
    const [deferredReady, setDeferredReady] = useState(false);
    const [fxRates, setFxRates] = useState({});

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
            setLoading(true);
            try {
                const c = (await getMeta('currency')) || 'EUR';
                setCurrency(c);

                const holdings = await getHoldingsMap();
                const p = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, c);
                setCoin(p[0] || { symbol: sym, quantity: holdings[sym] || 0, price: 0, value: 0, change24h: 0 });

                // Price is shown, now unblock the UI
                setLoading(false);

                // Now fetch transactions in background
                const rows = await listTransactionsBySymbol(sym);
                setTxs(rows);

                InteractionManager.runAfterInteractions(() => {
                    setDeferredReady(true);
                });
            } catch (e) {
                if (globalThis.__DEV__) console.error('Initial load error:', e);
                setLoading(false);
            }
        })();
    }, [sym]);

    useEffect(() => {
        let active = true;
        (async () => {
            const quoteCurrencies = [...new Set(
                txs
                    .map((t) => String(t.quote_currency || t.quoteCurrency || currency).toUpperCase())
                    .filter(Boolean)
            )];
            const rates = await fetchFxRates(quoteCurrencies, currency);
            if (active) {
                setFxRates(rates);
            }
        })();
        return () => {
            active = false;
        };
    }, [currency, txs]);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            if (!sym) return;
            setChartLoading(true);
            setChartError('');
            try {
                const startTime = Date.now();
                const earliestTxMs = txs.length
                    ? txs.reduce((min, t) => {
                        const ts = new Date(t.date_iso).getTime();
                        return Number.isFinite(ts) ? Math.min(min, ts) : min;
                    }, Date.now())
                    : null;
                const { timeframe, limit, aggregate } = getCoinChartFetchParams(range, { earliestTxMs });

                const candles = await fetchCandles(sym, currency, timeframe, limit, aggregate);
                const endTime = Date.now();
                if (globalThis.__DEV__) {
                    console.log(`[PERF] Coin Chart (${range}): ${endTime - startTime}ms (${candles.length} pts)`);
                }
                if (isMounted) {
                    if (candles && candles.length) {
                        setChartData(mapCandlesToPoints(candles));
                    } else {
                        setChartData([]);
                    }
                }
            } catch (e) {
                if (isMounted) {
                    setChartError(e?.message || t('home.refreshErrorTitle'));
                    setChartData([]);
                }
            } finally {
                if (isMounted) setChartLoading(false);
            }
        })();
        return () => { isMounted = false; };
    }, [sym, currency, range, t, txs]);

    const txStats = useMemo(() => {
        return computeCoinTransactionStats(txs, coin?.price || 0, coin?.quantity || 0, {
            targetCurrency: currency,
            fxRates,
        });
    }, [currency, fxRates, txs, coin]);

    const handleDeleteTransaction = useCallback(async (id) => {
        try {
            const { deleteTransaction, syncHoldingsForSymbol } = await import('../db');
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

    const transactionList = useMemo(() => {
        if (!deferredReady && activeTab !== 'Transactions') return null;
        // Limit to 100 transactions to prevent UI lag on large histories (like BTC)
        const visibleTxs = txs.slice(0, 100);
        return visibleTxs.map((transaction) => (
            <TransactionItem
                key={transaction.id}
                transaction={transaction}
                sym={sym}
                currency={currency}
                coinPrice={coin?.price}
                onShowOptions={showTransactionOptions}
                colors={colors}
                fxRates={fxRates}
                t={t}
            />
        ));
    }, [txs, sym, currency, coin?.price, showTransactionOptions, deferredReady, activeTab, colors, fxRates, t]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                    <CoinIcon symbol={sym} imageUrl={coin?.imageUrl} size={32} style={{ marginRight: 10 }} />
                    <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>{sym}</Text>
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{t('coin.status', { symbol: sym })}</Text>
                    </View>
                </View>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.text} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[2]}>
                    <View style={styles.statsRow}>
                        <View>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.owned')}</Text>
                            <Text style={[styles.statValue, { color: colors.text }]}>{formatNumber(coin?.quantity || 0, 2)}</Text>
                        </View>
                        <View>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.marketValue')}</Text>
                            <Text style={[styles.statValue, { color: colors.text }]}>{formatMoney(coin?.value, currency)}</Text>
                        </View>
                        <View>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.totalGains')}</Text>
                            <Text style={[styles.statValue, { color: txStats.totalGains >= 0 ? '#22c55e' : '#ef4444' }]}>
                                {formatMoney(txStats.totalGains, currency)}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.breakdownBtn}>
                        <Text style={[styles.breakdownText, { color: colors.textSecondary }]}>{t('coin.showBreakdown')}</Text>
                    </TouchableOpacity>

                    <View style={{ backgroundColor: colors.background, paddingBottom: 8 }}>
                        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
                            <TouchableOpacity style={[styles.tabItem, activeTab === 'General' && { ...styles.tabActive, borderBottomColor: colors.text }]} onPress={() => setActiveTab('General')}>
                                <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'General' && { ...styles.tabTextActive, color: colors.text }]}>{t('coin.generalTab')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tabItem, activeTab === 'Transactions' && { ...styles.tabActive, borderBottomColor: colors.text }]} onPress={() => setActiveTab('Transactions')}>
                                <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'Transactions' && { ...styles.tabTextActive, color: colors.text }]}>{t('coin.transactionsTab')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={{ display: activeTab === 'General' ? 'flex' : 'none' }}>
                        <View style={styles.chartSection}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
                                <View>
                                    <Text style={[styles.bigPrice, { color: colors.text }]}>{formatMoney(coin?.price, currency)}</Text>
                                    <Text style={[styles.priceChange, { color: coin?.change24h >= 0 ? '#22c55e' : '#ef4444' }]}>
                                        {formatMoney(coin?.price * (coin?.change24h / 100), currency)}
                                        ({coin?.change24h >= 0 ? '+' : ''}{coin?.change24h?.toFixed(2)}%)
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>{t('coin.market')}</Text>
                                    <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{sym}/{currency}</Text>
                                </View>
                            </View>

                            {chartLoading ? (
                                <View style={{ height: 250, justifyContent: 'center', alignItems: 'center' }}>
                                    <ActivityIndicator color={colors.text} />
                                </View>
                            ) : (
                                <>
                                    <CryptoGraph type="candle" data={chartData} currency={currency} />
                                    {!!chartError && (
                                        <View style={{ alignItems: 'center', marginTop: 8 }}>
                                            <Text style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{chartError}</Text>
                                            <TouchableOpacity
                                                onPress={refreshData}
                                                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceElevated }}
                                            >
                                                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>{t('general.retry')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    <View style={styles.rangeRow}>
                                        {COIN_CHART_RANGES.map(r => (
                                            <TouchableOpacity
                                                key={r}
                                                onPress={() => setRange(r)}
                                                disabled={chartLoading}
                                                style={[
                                                    styles.rangePill,
                                                    range === r && { ...styles.rangePillActive, backgroundColor: colors.surfaceElevated },
                                                    chartLoading && { opacity: 0.5 }
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.rangeText,
                                                    { color: range === r ? colors.text : colors.textSecondary }
                                                ]}>{r}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}
                        </View>
                    </View>

                    <View style={{ display: activeTab === 'Transactions' ? 'flex' : 'none' }}>
                        <View style={{ paddingHorizontal: 16 }}>
                            <View style={styles.txStatsGrid}>
                                <View style={styles.txStatItem}>
                                    <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.avgBuyPrice')}</Text>
                                    <Text style={[styles.txStatValue, { color: colors.text }]}>{formatMoney(txStats.avgBuy, currency)}</Text>
                                </View>
                                <View style={styles.txStatItem}>
                                    <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.avgSellPrice')}</Text>
                                    <Text style={[styles.txStatValue, { color: colors.text }]}>{formatMoney(txStats.avgSell, currency)}</Text>
                                </View>
                                <View style={styles.txStatItem}>
                                    <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.transactionsCount')}</Text>
                                    <Text style={[styles.txStatValue, { color: colors.text }]}>{txStats.count}</Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 16 }}>
                                <TouchableOpacity style={[styles.addTxBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/add-transaction')}>
                                    <Plus color={colors.primaryInverse} size={20} />
                                    <Text style={{ fontWeight: 'bold', fontSize: 14, marginLeft: 8, color: colors.primaryInverse }}>{t('coin.newTransaction')}</Text>
                                </TouchableOpacity>
                            </View>

                            {transactionList}
                        </View>
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    headerSub: { fontSize: 12 },
    backBtn: { padding: 4 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    statLabel: { fontSize: 11, textAlign: 'center' },
    statValue: { fontSize: 15, fontWeight: 'bold', textAlign: 'center', marginTop: 4 },
    breakdownBtn: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
    breakdownText: { fontSize: 13 },
    tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    tabActive: { borderBottomWidth: 2 },
    tabText: { fontWeight: '600' },
    tabTextActive: {},
    chartSection: { paddingTop: 16 },
    bigPrice: { fontSize: 32, fontWeight: 'bold' },
    priceChange: { fontWeight: 'bold', marginTop: 4 },
    rangeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 16 },
    rangePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    rangePillActive: {},
    rangeText: { fontSize: 13, fontWeight: '600' },
    rangeTextActive: {},
    txStatsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 16 },
    txStatItem: { alignItems: 'center' },
    txStatLabel: { fontSize: 11, marginBottom: 4 },
    txStatValue: { fontWeight: 'bold', fontSize: 15 },
    addTxBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
    txCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
    txHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    txBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 8, borderWidth: 1 },
    bgGreen: { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
    bgRed: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
    txBadgeText: { fontSize: 11, fontWeight: 'bold' },
    textGreen: { color: '#22c55e' },
    textRed: { color: '#ef4444' },
    txHeaderDate: { fontSize: 11 },
    txBody: {},
    txRow: { flexDirection: 'row', justifyContent: 'space-between' },
    txLabel: { fontSize: 11, marginBottom: 4 },
    txValue: { fontWeight: 'bold', fontSize: 14 },
});
