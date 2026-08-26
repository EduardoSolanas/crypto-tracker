import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, BarChart3, MoreVertical, Plus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    InteractionManager,
    Modal,
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
import { formatMoney, formatNumber, formatQuantity } from '../utils/format';
import { mapCandlesToPoints } from '../utils/chartContracts';
import { COIN_CHART_RANGES } from '../utils/coinChartRange';
import { getMasterTimeframeParams, sliceCandlesForRange } from '../utils/chartDataCache';
import { computeCoinTransactionStats } from '../utils/transactionCalculations';
import { useTheme } from '../utils/theme';

const TransactionItem = React.memo(function TransactionItem({ transaction, sym, currency, coinPrice, onShowOptions, colors, fxRates, t }) {
    const isBuy = transaction.way === 'BUY' || transaction.way === 'DEPOSIT' || transaction.way === 'RECEIVE';
    const date = new Date(transaction.date_iso);
    const dateStr = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const quoteCurrency = String(transaction.quote_currency || transaction.quoteCurrency || currency).toUpperCase();
    const fxRate = quoteCurrency === currency ? 1 : Number(fxRates?.[quoteCurrency] || 0);
    const normalizedQuoteAmount = fxRate > 0 ? (transaction.quote_amount || 0) * fxRate : (quoteCurrency === currency ? (transaction.quote_amount || 0) : 0);

    const purchasePrice = transaction.amount > 0 ? normalizedQuoteAmount / transaction.amount : 0;
    const currentPrice = coinPrice || 0;
    const deltaPct = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;
    const deltaVal = (currentPrice - purchasePrice) * transaction.amount;
    const isPositive = deltaVal >= 0;

    return (
        <View style={[styles.txCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.txHeader}>
                <View style={[styles.txBadge, isBuy ? { backgroundColor: colors.successBg, borderColor: colors.success } : { backgroundColor: colors.errorBg, borderColor: colors.error }]}>
                    <Text style={[styles.txBadgeText, { color: isBuy ? colors.success : colors.error }]}>
                        {transaction.way}
                    </Text>
                </View>
                <Text style={[styles.txHeaderDate, { color: colors.textSecondary }]}>
                    {dateStr} {t('coin.at', 'at')} {timeStr}
                </Text>
                <TouchableOpacity onPress={() => onShowOptions(transaction)} hitSlop={15} style={{ marginLeft: 'auto' }}>
                    <MoreVertical size={16} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <View style={styles.txBody}>
                <View style={styles.txRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>
                            {t('coin.priceLabel', { sym, currency })}
                        </Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>
                            {formatMoney(purchasePrice, currency)}
                        </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>
                            {isBuy ? t('coin.amountAdded', 'Amount Added') : t('coin.amountRemoved', 'Amount Removed')}
                        </Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>
                            {formatNumber(transaction.amount, 6)}
                        </Text>
                    </View>
                </View>

                <View style={[styles.txRow, { marginTop: 10 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>
                            {isBuy ? t('coin.costInclFee', 'Cost') : t('coin.received', 'Received')}
                        </Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>
                            {formatMoney(normalizedQuoteAmount, currency)}
                        </Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={[styles.txLabel, { color: colors.textSecondary }]}>
                            {t('coin.currentWorth', 'Current Worth')}
                        </Text>
                        <Text style={[styles.txValue, { color: colors.text }]}>
                            {formatMoney(transaction.amount * currentPrice, currency)}
                        </Text>
                    </View>
                </View>

                <View style={[styles.txRow, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[styles.txLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
                        {t('coin.delta', 'Return')}
                    </Text>
                    <Text style={{ color: isPositive ? colors.success : colors.error, fontWeight: '700', fontSize: 13 }}>
                        {isPositive ? '+' : ''}{deltaPct.toFixed(2)}% ({isPositive ? '+' : ''}{formatMoney(deltaVal, currency)})
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
    const [isBreakdownVisible, setIsBreakdownVisible] = useState(false);
    const coinRangeCacheRef = useRef(new Map());
    const masterCandlesRef = useRef(new Map());

    const loadChartData = useCallback(async (targetRange, isBackground = false) => {
        if (!sym) return;
        const cacheKey = `${targetRange}_${currency}`;
        const cached = coinRangeCacheRef.current.get(cacheKey);

        if (cached && cached.length > 0) {
            setChartData(cached);
            setChartError('');
            if (!isBackground) setChartLoading(false);
            return;
        }

        if (!isBackground) {
            setChartLoading(true);
            setChartError('');
        }

        try {
            const earliestTxMs = txs.length
                ? txs.reduce((min, t) => {
                    const ts = new Date(t.date_iso).getTime();
                    return Number.isFinite(ts) ? Math.min(min, ts) : min;
                }, Date.now())
                : null;

            const masterParams = getMasterTimeframeParams(targetRange, { earliestTxMs });
            const masterKey = `${masterParams.timeframe}_${currency}`;
            let masterCandles = masterCandlesRef.current.get(masterKey);

            if (!masterCandles || !masterCandles.length) {
                masterCandles = await fetchCandles(sym, currency, masterParams.timeframe, masterParams.limit, masterParams.aggregate);
                if (masterCandles && masterCandles.length) {
                    masterCandlesRef.current.set(masterKey, masterCandles);
                }
            }

            if (masterCandles && masterCandles.length) {
                const nowSec = Math.floor(Date.now() / 1000);
                if (masterParams.timeframe === 'hour') {
                    const slice1D = sliceCandlesForRange(masterCandles, '1D', nowSec);
                    const slice1W = sliceCandlesForRange(masterCandles, '1W', nowSec);
                    coinRangeCacheRef.current.set(`1D_${currency}`, mapCandlesToPoints(slice1D));
                    coinRangeCacheRef.current.set(`1W_${currency}`, mapCandlesToPoints(slice1W));
                } else if (masterParams.timeframe === 'day') {
                    const slice1M = sliceCandlesForRange(masterCandles, '1M', nowSec);
                    const slice1Y = sliceCandlesForRange(masterCandles, '1Y', nowSec);
                    const sliceALL = sliceCandlesForRange(masterCandles, 'ALL', nowSec);
                    coinRangeCacheRef.current.set(`1M_${currency}`, mapCandlesToPoints(slice1M));
                    coinRangeCacheRef.current.set(`1Y_${currency}`, mapCandlesToPoints(slice1Y));
                    coinRangeCacheRef.current.set(`ALL_${currency}`, mapCandlesToPoints(sliceALL));
                } else {
                    const slice1H = sliceCandlesForRange(masterCandles, '1H', nowSec);
                    coinRangeCacheRef.current.set(`1H_${currency}`, mapCandlesToPoints(slice1H));
                }

                const resultPoints = coinRangeCacheRef.current.get(cacheKey) || mapCandlesToPoints(sliceCandlesForRange(masterCandles, targetRange, nowSec));
                setChartData(resultPoints);
            } else {
                setChartData([]);
            }
        } catch (e) {
            if (!cached) {
                setChartError(e?.message || t('home.refreshErrorTitle', 'Refresh Error'));
                setChartData([]);
            }
        } finally {
            if (!isBackground) {
                setChartLoading(false);
            }
        }
    }, [currency, sym, t, txs]);

    const handleRangeSelect = useCallback((r) => {
        setRange(r);
        const cacheKey = `${r}_${currency}`;
        const cached = coinRangeCacheRef.current.get(cacheKey);
        if (cached && cached.length > 0) {
            setChartData(cached);
            setChartError('');
        } else {
            loadChartData(r);
        }
    }, [currency, loadChartData]);

    const refreshData = useCallback(async () => {
        coinRangeCacheRef.current.clear();
        masterCandlesRef.current.clear();
        try {
            const rows = await listTransactionsBySymbol(sym);
            setTxs(rows);
            const holdings = await getHoldingsMap();
            const p = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, currency);
            setCoin(p[0] || { symbol: sym, quantity: holdings[sym] || 0, price: 0, value: 0, change24h: 0 });
            loadChartData(range);
        } catch (_e) {
            Alert.alert(t('coin.unableRefreshTitle', 'Error'), t('coin.unableRefreshMessage', 'Unable to refresh coin data.'));
        }
    }, [sym, currency, loadChartData, range, t]);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            setLoading(true);
            try {
                const c = (await getMeta('currency')) || 'EUR';
                if (!isMounted) return;
                setCurrency(c);

                const holdings = await getHoldingsMap();
                const p = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, c);
                if (!isMounted) return;
                setCoin(p[0] || { symbol: sym, quantity: holdings[sym] || 0, price: 0, value: 0, change24h: 0 });
                setLoading(false);

                const rows = await listTransactionsBySymbol(sym);
                if (!isMounted) return;
                setTxs(rows);

                InteractionManager.runAfterInteractions(() => {
                    if (isMounted) setDeferredReady(true);
                });
            } catch (e) {
                if (globalThis.__DEV__) console.error('Initial load error:', e);
                if (isMounted) setLoading(false);
            }
        })();
        return () => { isMounted = false; };
    }, [sym]);

    useEffect(() => {
        let active = true;
        (async () => {
            const quoteCurrencies = [...new Set(
                txs
                    .map((t) => String(t.quote_currency || t.quoteCurrency || currency).toUpperCase())
                    .filter(Boolean)
            )];
            if (!quoteCurrencies.length) return;
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
        const cacheKey = `${range}_${currency}`;
        if (coinRangeCacheRef.current.has(cacheKey)) {
            const cached = coinRangeCacheRef.current.get(cacheKey);
            if (cached && cached.length > 0) {
                setChartData(cached);
                return;
            }
        }
        loadChartData(range);
    }, [currency, loadChartData, range, sym]);

    const txStats = useMemo(() => {
        return computeCoinTransactionStats(txs, coin?.price || 0, coin?.quantity || 0, {
            targetCurrency: currency,
            fxRates,
        });
    }, [currency, fxRates, txs, coin]);

    const unrealizedGains = useMemo(() => {
        const marketVal = (coin?.price || 0) * (coin?.quantity || 0);
        return marketVal - (txStats.totalCostBasis || 0);
    }, [coin?.price, coin?.quantity, txStats.totalCostBasis]);

    const handleDeleteTransaction = useCallback(async (id) => {
        try {
            const { deleteTransaction, syncHoldingsForSymbol } = await import('../db');
            await deleteTransaction(id);
            await syncHoldingsForSymbol(sym);
            await refreshData();
            Alert.alert(t('coin.deletedTitle', 'Deleted'), t('coin.deletedMessage', 'Transaction removed'));
        } catch (_e) {
            Alert.alert(t('general.error', 'Error'), t('coin.deleteFailedMessage', 'Failed to delete transaction'));
        }
    }, [refreshData, sym, t]);

    const showTransactionOptions = useCallback((tx) => {
        Alert.alert(
            t('coin.transactionOptionsTitle', 'Transaction Options'),
            t('coin.transactionOptionsMessage', 'Select an action for this transaction:'),
            [
                { text: t('general.edit', 'Edit'), onPress: () => router.push({ pathname: '/add-transaction', params: { id: tx.id, symbol: sym } }) },
                {
                    text: t('general.delete', 'Delete'),
                    style: 'destructive',
                    onPress: () => Alert.alert(
                        t('coin.confirmDeleteTitle', 'Confirm Delete'),
                        t('coin.confirmDeleteMessage', 'Are you sure you want to delete this transaction?'),
                        [
                            { text: t('general.cancel', 'Cancel'), style: 'cancel' },
                            { text: t('general.delete', 'Delete'), style: 'destructive', onPress: () => handleDeleteTransaction(tx.id) }
                        ]
                    )
                },
                { text: t('general.cancel', 'Cancel'), style: 'cancel' }
            ]
        );
    }, [handleDeleteTransaction, sym, t]);

    const transactionList = useMemo(() => {
        if (!deferredReady && activeTab !== 'Transactions') return null;
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
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={15}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                    <CoinIcon symbol={sym} imageUrl={coin?.imageUrl} size={32} style={{ marginRight: 10 }} />
                    <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>{sym}</Text>
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                            {t('coin.status', { symbol: sym })}
                        </Text>
                    </View>
                </View>
                <View style={{ width: 28 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.text} size="large" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[2]}>
                    {/* Top Stats Cards */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.owned', 'Owned')}</Text>
                            <Text style={[styles.statValue, { color: colors.text }]}>{formatQuantity(coin?.quantity || 0)}</Text>
                        </View>
                        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.marketValue', 'Market Value')}</Text>
                            <Text style={[styles.statValue, { color: colors.text }]}>{formatMoney(coin?.value || 0, currency)}</Text>
                        </View>
                        <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('coin.totalGains', 'Total P&L')}</Text>
                            <Text style={[styles.statValue, { color: txStats.totalGains >= 0 ? colors.success : colors.error }]}>
                                {txStats.totalGains >= 0 ? '+' : ''}{formatMoney(txStats.totalGains, currency)}
                            </Text>
                        </View>
                    </View>

                    {/* Breakdown Action Button */}
                    <TouchableOpacity
                        style={[styles.breakdownBtn, { backgroundColor: colors.surfaceElevated }]}
                        onPress={() => setIsBreakdownVisible(true)}
                    >
                        <BarChart3 size={15} color={colors.text} style={{ marginRight: 6 }} />
                        <Text style={[styles.breakdownText, { color: colors.text }]}>
                            {t('coin.showBreakdown', 'Show Cost & Gains Breakdown')}
                        </Text>
                    </TouchableOpacity>

                    {/* Tabs */}
                    <View style={{ backgroundColor: colors.background, paddingBottom: 4 }}>
                        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
                            <TouchableOpacity
                                style={[styles.tabItem, activeTab === 'General' && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}
                                onPress={() => setActiveTab('General')}
                            >
                                <Text style={[
                                    styles.tabText,
                                    { color: colors.textSecondary },
                                    activeTab === 'General' && { color: colors.text, fontWeight: '700' }
                                ]}>
                                    {t('coin.generalTab', 'Overview & Chart')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.tabItem, activeTab === 'Transactions' && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}
                                onPress={() => setActiveTab('Transactions')}
                            >
                                <Text style={[
                                    styles.tabText,
                                    { color: colors.textSecondary },
                                    activeTab === 'Transactions' && { color: colors.text, fontWeight: '700' }
                                ]}>
                                    {t('coin.transactionsTab', 'Transactions')} ({txs.length})
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* General / Chart Tab Content */}
                    {activeTab === 'General' && (
                        <View style={styles.chartSection}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
                                <View>
                                    <Text style={[styles.bigPrice, { color: colors.text }]}>
                                        {formatMoney(coin?.price || 0, currency)}
                                    </Text>
                                    <Text style={[
                                        styles.priceChange,
                                        {
                                            color: (coin?.change24h || 0) > 0
                                                ? colors.success
                                                : (coin?.change24h || 0) < 0
                                                    ? colors.error
                                                    : colors.textSecondary
                                        }
                                    ]}>
                                        {(coin?.change24h || 0) > 0 ? '+' : ''}{formatMoney((coin?.price || 0) * ((coin?.change24h || 0) / 100), currency)} ({(coin?.change24h || 0) > 0 ? '+' : ''}{(coin?.change24h || 0).toFixed(2)}%)
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <View style={[styles.marketBadge, { backgroundColor: colors.surfaceElevated }]}>
                                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
                                            {sym} / {currency}
                                        </Text>
                                    </View>
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
                                            <Text style={{ color: colors.error, fontSize: 12, marginBottom: 8 }}>{chartError}</Text>
                                            <TouchableOpacity
                                                onPress={refreshData}
                                                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceElevated }}
                                            >
                                                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>{t('general.retry', 'Retry')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    <View style={styles.rangeRow}>
                                        {COIN_CHART_RANGES.map(r => (
                                            <TouchableOpacity
                                                key={r}
                                                onPress={() => handleRangeSelect(r)}
                                                disabled={chartLoading}
                                                style={[
                                                    styles.rangePill,
                                                    range === r && { backgroundColor: colors.surfaceElevated },
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
                    )}

                    {/* Transactions Tab Content */}
                    {activeTab === 'Transactions' && (
                        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                            {/* Summary Grid */}
                            <View style={[styles.txStatsGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <View style={styles.txStatItem}>
                                    <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.avgBuyPrice', 'Avg Buy')}</Text>
                                    <Text style={[styles.txStatValue, { color: colors.text }]}>{formatMoney(txStats.avgBuy, currency)}</Text>
                                </View>
                                <View style={styles.txStatItem}>
                                    <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.avgSellPrice', 'Avg Sell')}</Text>
                                    <Text style={[styles.txStatValue, { color: colors.text }]}>{formatMoney(txStats.avgSell, currency)}</Text>
                                </View>
                                <View style={styles.txStatItem}>
                                    <Text style={[styles.txStatLabel, { color: colors.textSecondary }]}>{t('coin.transactionsCount', '# Txns')}</Text>
                                    <Text style={[styles.txStatValue, { color: colors.text }]}>{txStats.count}</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.addTxBtn, { backgroundColor: colors.primary }]}
                                onPress={() => router.push({ pathname: '/add-transaction', params: { symbol: sym } })}
                            >
                                <Plus color={colors.primaryInverse} size={18} />
                                <Text style={{ fontWeight: '700', fontSize: 14, marginLeft: 6, color: colors.primaryInverse }}>
                                    {t('coin.newTransaction', 'New Transaction')}
                                </Text>
                            </TouchableOpacity>

                            {transactionList}
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Cost & PnL Breakdown Modal */}
            <Modal visible={isBreakdownVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>
                                {sym} {t('coin.breakdownTitle', 'Cost & Gains Breakdown')}
                            </Text>
                            <TouchableOpacity onPress={() => setIsBreakdownVisible(false)} hitSlop={15}>
                                <X size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 400 }}>
                            <View style={styles.breakdownRow}>
                                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                                    {t('coin.currentPrice', 'Current Price')}
                                </Text>
                                <Text style={[styles.breakdownVal, { color: colors.text }]}>
                                    {formatMoney(coin?.price || 0, currency)}
                                </Text>
                            </View>

                            <View style={styles.breakdownRow}>
                                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                                    {t('coin.totalInvested', 'Total Cost Basis')}
                                </Text>
                                <Text style={[styles.breakdownVal, { color: colors.text }]}>
                                    {formatMoney(txStats.totalCostBasis || 0, currency)}
                                </Text>
                            </View>

                            <View style={styles.breakdownRow}>
                                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                                    {t('coin.unrealizedPnl', 'Unrealized P&L')}
                                </Text>
                                <Text style={[styles.breakdownVal, { color: unrealizedGains >= 0 ? colors.success : colors.error }]}>
                                    {unrealizedGains >= 0 ? '+' : ''}{formatMoney(unrealizedGains, currency)}
                                </Text>
                            </View>

                            <View style={styles.breakdownRow}>
                                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                                    {t('coin.realizedPnl', 'Realized P&L')}
                                </Text>
                                <Text style={[styles.breakdownVal, { color: (txStats.realizedGains || 0) >= 0 ? colors.success : colors.error }]}>
                                    {(txStats.realizedGains || 0) >= 0 ? '+' : ''}{formatMoney(txStats.realizedGains || 0, currency)}
                                </Text>
                            </View>

                            <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }]}>
                                <Text style={[styles.breakdownTotalLabel, { color: colors.text }]}>
                                    {t('coin.totalGains', 'Net Total P&L')}
                                </Text>
                                <Text style={[styles.breakdownTotalVal, { color: txStats.totalGains >= 0 ? colors.success : colors.error }]}>
                                    {txStats.totalGains >= 0 ? '+' : ''}{formatMoney(txStats.totalGains, currency)}
                                </Text>
                            </View>

                            {/* Market Stats if available */}
                            {coin?.high24h > 0 && (
                                <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                                    <View style={styles.breakdownRow}>
                                        <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>{t('coin.high24h', '24h High')}</Text>
                                        <Text style={[styles.breakdownVal, { color: colors.text }]}>{formatMoney(coin.high24h, currency)}</Text>
                                    </View>
                                    <View style={styles.breakdownRow}>
                                        <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>{t('coin.low24h', '24h Low')}</Text>
                                        <Text style={[styles.breakdownVal, { color: colors.text }]}>{formatMoney(coin.low24h, currency)}</Text>
                                    </View>
                                    {coin?.mktCap > 0 && (
                                        <View style={styles.breakdownRow}>
                                            <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>{t('coin.marketCap', 'Market Cap')}</Text>
                                            <Text style={[styles.breakdownVal, { color: colors.text }]}>{formatMoney(coin.mktCap, currency)}</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.closeModalBtn, { backgroundColor: colors.surfaceElevated }]}
                            onPress={() => setIsBreakdownVisible(false)}
                        >
                            <Text style={{ color: colors.text, fontWeight: '700' }}>
                                {t('general.close', 'Close')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    headerSub: { fontSize: 12 },
    backBtn: { padding: 6, borderRadius: 8 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 8,
    },
    statBox: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 8,
        alignItems: 'center',
    },
    statLabel: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
    statValue: { fontSize: 14, fontWeight: '700' },

    breakdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 16,
        marginBottom: 14,
        paddingVertical: 8,
        borderRadius: 10,
    },
    breakdownText: { fontSize: 13, fontWeight: '600' },

    tabRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
    },
    tabText: { fontSize: 14, fontWeight: '500' },

    chartSection: { paddingTop: 16 },
    bigPrice: { fontSize: 32, fontWeight: '800' },
    priceChange: { fontWeight: '700', fontSize: 14, marginTop: 4 },
    marketBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },

    rangeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginTop: 16,
    },
    rangePill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
    },
    rangeText: { fontSize: 13, fontWeight: '600' },

    txStatsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        marginBottom: 16,
    },
    txStatItem: { alignItems: 'center' },
    txStatLabel: { fontSize: 11, marginBottom: 4, fontWeight: '500' },
    txStatValue: { fontWeight: '700', fontSize: 15 },

    addTxBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 16,
    },

    txCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    txHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    txBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8, borderWidth: 1 },
    txBadgeText: { fontSize: 11, fontWeight: '800' },
    txHeaderDate: { fontSize: 12 },
    txBody: {},
    txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    txLabel: { fontSize: 11, marginBottom: 2 },
    txValue: { fontWeight: '700', fontSize: 14 },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        maxWidth: 450,
        borderRadius: 16,
        borderWidth: 1,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: { fontSize: 17, fontWeight: '700' },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 6,
    },
    breakdownLabel: { fontSize: 13 },
    breakdownVal: { fontSize: 14, fontWeight: '600' },
    breakdownTotalLabel: { fontSize: 14, fontWeight: '700' },
    breakdownTotalVal: { fontSize: 16, fontWeight: '800' },
    closeModalBtn: {
        marginTop: 16,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
});
