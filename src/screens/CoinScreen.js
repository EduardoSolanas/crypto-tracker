import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MoreVertical, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import CryptoGraph from '../components/CryptoGraph';
import { fetchCandles, fetchPortfolioPrices } from '../cryptoCompare';
import { getHoldingsMap, getMeta, listTransactionsBySymbol } from '../db';
import { formatMoney, formatNumber } from '../utils/format';

const TransactionItem = React.memo(({ t, sym, currency, coinPrice, onShowOptions }) => {
    const isBuy = t.way === 'BUY';
    const date = new Date(t.date_iso);
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    return (
        <View style={styles.txCard}>
            <View style={styles.txHeader}>
                <View style={[styles.txBadge, isBuy ? styles.bgGreen : styles.bgRed]}>
                    <Text style={[styles.txBadgeText, isBuy ? styles.textGreen : styles.textRed]}>{t.way}</Text>
                </View>
                <Text style={styles.txHeaderDate}>{dateStr} at {timeStr} via Manual</Text>
                <TouchableOpacity onPress={() => onShowOptions(t)} hitSlop={15} style={{ marginLeft: 'auto' }}>
                    <MoreVertical size={16} color="#64748b" />
                </TouchableOpacity>
            </View>

            <View style={styles.txBody}>
                <View style={styles.txRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.txLabel}>Price ({sym}/EUR)</Text>
                        <Text style={styles.txValue}>{formatMoney(t.quote_amount / t.amount, currency)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.txLabel}>Amount Added</Text>
                        <Text style={styles.txValue}>{formatNumber(t.amount, 6)}</Text>
                    </View>
                </View>
                <View style={[styles.txRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.txLabel}>Cost (Incl. Fee)</Text>
                        <Text style={styles.txValue}>{formatMoney(t.quote_amount, currency)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.txLabel}>Worth</Text>
                        <Text style={styles.txValue}>{formatMoney(t.amount * (coinPrice || 0), currency)}</Text>
                    </View>
                </View>

                <View style={{ marginTop: 12 }}>
                    <Text style={styles.txLabel}>Delta</Text>
                    <Text style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 14 }}>+40.92%</Text>
                </View>
            </View>
        </View>
    );
});

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
    const [deferredReady, setDeferredReady] = useState(false);

    const refreshData = useCallback(async () => {
        try {
            const rows = await listTransactionsBySymbol(sym);
            setTxs(rows);
            const holdings = await getHoldingsMap();
            const p = await fetchPortfolioPrices({ [sym]: holdings[sym] || 0 }, currency);
            setCoin(p[0] || { symbol: sym, quantity: holdings[sym] || 0, price: 0, value: 0, change24h: 0 });
        } catch (e) {
            console.error('refreshData error:', e);
        }
    }, [sym, currency]);

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
                console.error('Initial load error:', e);
                setLoading(false);
            }
        })();
    }, [sym]);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            if (!sym) return;
            setChartLoading(true);
            try {
                const startTime = Date.now();
                let timeframe = 'minute';
                let limit = 144;
                let aggregate = 1;

                switch (range) {
                    case '1H': timeframe = 'minute'; limit = 60; aggregate = 1; break;
                    case '4H': timeframe = 'minute'; limit = 120; aggregate = 2; break; // 60 pts
                    case '12H': timeframe = 'minute'; limit = 120; aggregate = 6; break; // 120 pts
                    case '1D': timeframe = 'minute'; limit = 120; aggregate = 12; break; // 120 pts
                    case '3D': timeframe = 'hour'; limit = 72; aggregate = 1; break;
                    case '1W': timeframe = 'hour'; limit = 84; aggregate = 2; break; // 84 pts
                    case '1M': timeframe = 'hour'; limit = 120; aggregate = 6; break; // 120 pts
                    case '3M': timeframe = 'day'; limit = 90; aggregate = 1; break;
                    case '6M': timeframe = 'day'; limit = 180; aggregate = 1; break;
                    case 'YTD': timeframe = 'day'; limit = 365; aggregate = 1; break;
                    case 'ALL': timeframe = 'day'; limit = 200; aggregate = 5; break; // 100 pts
                }

                const candles = await fetchCandles(sym, currency, timeframe, limit, aggregate);
                const endTime = Date.now();
                console.log(`[PERF] Coin Chart (${range}): ${endTime - startTime}ms (${candles.length} pts)`);
                if (isMounted) {
                    if (candles && candles.length) {
                        setChartData(candles.map(c => ({
                            timestamp: c.time * 1000,
                            open: c.open,
                            high: c.high,
                            low: c.low,
                            close: c.close,
                        })));
                    } else {
                        setChartData([]);
                    }
                }
            } finally {
                if (isMounted) setChartLoading(false);
            }
        })();
        return () => { isMounted = false; };
    }, [sym, currency, range]);

    const txStats = useMemo(() => {
        let buyTotal = 0, buyCount = 0;
        let sellTotal = 0, sellCount = 0;
        for (const t of txs) {
            if (t.way === 'BUY') {
                const val = t.quote_amount > 0 ? t.quote_amount : (t.amount * (coin?.price || 0));
                buyTotal += val;
                buyCount += t.amount;
            } else if (t.way === 'SELL') {
                const val = t.quote_amount > 0 ? t.quote_amount : (t.amount * (coin?.price || 0));
                sellTotal += val;
                sellCount += t.amount;
            }
        }
        return {
            avgBuy: buyCount > 0 ? buyTotal / buyCount : 0,
            avgSell: sellCount > 0 ? sellTotal / sellCount : 0,
            count: txs.length
        };
    }, [txs, coin]);

    const handleDeleteTransaction = async (id) => {
        try {
            const { deleteTransaction, syncHoldingsForSymbol } = await import('../db');
            await deleteTransaction(id);
            await syncHoldingsForSymbol(sym);
            await refreshData();
            Alert.alert('Deleted', 'Transaction removed');
        } catch (e) {
            Alert.alert('Error', 'Failed to delete data');
        }
    };

    const showTransactionOptions = useCallback((t) => {
        Alert.alert(
            'Transaction Options',
            'What would you like to do?',
            [
                { text: 'Edit', onPress: () => router.push({ pathname: '/add-transaction', params: { id: t.id, symbol: sym } }) },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => Alert.alert('Confirm Delete', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteTransaction(t.id) }
                    ])
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    }, [sym, refreshData]);

    const transactionList = useMemo(() => {
        if (!deferredReady && activeTab !== 'Transactions') return null;
        // Limit to 100 transactions to prevent UI lag on large histories (like BTC)
        const visibleTxs = txs.slice(0, 100);
        return visibleTxs.map(t => (
            <TransactionItem
                key={t.id}
                t={t}
                sym={sym}
                currency={currency}
                coinPrice={coin?.price}
                onShowOptions={showTransactionOptions}
            />
        ));
    }, [txs, sym, currency, coin?.price, showTransactionOptions, deferredReady, activeTab]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={20}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={styles.headerTitle}>{sym}</Text>
                    <Text style={styles.headerSub}>{sym} Status</Text>
                </View>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color="#fff" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 40 }} stickyHeaderIndices={[2]}>
                    <View style={styles.statsRow}>
                        <View>
                            <Text style={styles.statLabel}>Owned</Text>
                            <Text style={styles.statValue}>{formatNumber(coin?.quantity || 0, 2)}</Text>
                        </View>
                        <View>
                            <Text style={styles.statLabel}>Market Value</Text>
                            <Text style={styles.statValue}>{formatMoney(coin?.value, currency)}</Text>
                        </View>
                        <View>
                            <Text style={styles.statLabel}>Total Gains</Text>
                            <Text style={[styles.statValue, { color: (coin?.value - (txStats.avgBuy * coin?.quantity)) >= 0 ? '#22c55e' : '#ef4444' }]}>
                                {formatMoney(coin?.value - (txStats.avgBuy * coin?.quantity), currency)}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.breakdownBtn}>
                        <Text style={styles.breakdownText}>Show Cost & Gains Breakdown</Text>
                    </TouchableOpacity>

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

                    <View style={{ display: activeTab === 'General' ? 'flex' : 'none' }}>
                        <View style={styles.chartSection}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
                                <View>
                                    <Text style={styles.bigPrice}>{formatMoney(coin?.price, currency)}</Text>
                                    <Text style={[styles.priceChange, { color: coin?.change24h >= 0 ? '#22c55e' : '#ef4444' }]}>
                                        {formatMoney(coin?.price * (coin?.change24h / 100), currency)}
                                        ({coin?.change24h >= 0 ? '+' : ''}{coin?.change24h?.toFixed(2)}%)
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Market</Text>
                                    <Text style={{ color: '#64748b', fontSize: 10 }}>{sym}/{currency}</Text>
                                </View>
                            </View>

                            {chartLoading ? (
                                <View style={{ height: 250, justifyContent: 'center', alignItems: 'center' }}>
                                    <ActivityIndicator color="#fff" />
                                </View>
                            ) : (
                                <>
                                    <CryptoGraph type="candle" data={chartData} currency={currency} />
                                    <View style={styles.rangeRow}>
                                        {['1H', '1D', '1W', '1M', '1Y', 'ALL'].map(r => (
                                            <TouchableOpacity
                                                key={r}
                                                onPress={() => setRange(r)}
                                                disabled={chartLoading}
                                                style={[
                                                    styles.rangePill,
                                                    range === r && styles.rangePillActive,
                                                    chartLoading && { opacity: 0.5 }
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.rangeText,
                                                    { color: range === r ? '#fff' : '#94a3b8' }
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

                            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 16 }}>
                                <TouchableOpacity style={styles.addTxBtn} onPress={() => router.push('/add-transaction')}>
                                    <Plus color="#000" size={20} />
                                    <Text style={{ fontWeight: 'bold', fontSize: 14, marginLeft: 8 }}>New Transaction</Text>
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
    container: { flex: 1, backgroundColor: '#000000' },
    header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    headerSub: { fontSize: 12, color: '#94a3b8' },
    backBtn: { padding: 4 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    statLabel: { color: '#94a3b8', fontSize: 11, textAlign: 'center' },
    statValue: { color: '#fff', fontSize: 15, fontWeight: 'bold', textAlign: 'center', marginTop: 4 },
    breakdownBtn: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
    breakdownText: { color: '#64748b', fontSize: 13 },
    tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    tabActive: { borderBottomWidth: 2, borderBottomColor: '#fff' },
    tabText: { color: '#94a3b8', fontWeight: '600' },
    tabTextActive: { color: '#fff' },
    chartSection: { paddingTop: 16 },
    bigPrice: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
    priceChange: { fontWeight: 'bold', marginTop: 4 },
    rangeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 16 },
    rangePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    rangePillActive: { backgroundColor: '#334155' },
    rangeText: { fontSize: 13, fontWeight: '600' },
    rangeTextActive: { color: '#fff' },
    txStatsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 16 },
    txStatItem: { alignItems: 'center' },
    txStatLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 4 },
    txStatValue: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    addTxBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
    txCard: { backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
    txHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    txBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 8, borderWidth: 1 },
    bgGreen: { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)' },
    bgRed: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
    txBadgeText: { fontSize: 11, fontWeight: 'bold' },
    textGreen: { color: '#22c55e' },
    textRed: { color: '#ef4444' },
    txHeaderDate: { color: '#64748b', fontSize: 11 },
    txBody: {},
    txRow: { flexDirection: 'row', justifyContent: 'space-between' },
    txLabel: { color: '#64748b', fontSize: 11, marginBottom: 4 },
    txValue: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
