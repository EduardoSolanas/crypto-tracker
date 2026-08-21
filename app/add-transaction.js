import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMeta, getTransactionById, initDb, insertTransactions, updateTransaction } from '../src/db';
import { formatMoney, formatNumber } from '../src/utils/format';
import { useTheme } from '../src/utils/theme';

const TX_TYPES = ['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'RECEIVE', 'SEND'];

function dateInputToUtcIso(dateInput) {
    const raw = String(dateInput || '').trim();
    const dateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        if (
            date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            throw new Error('INVALID_DATE_FORMAT');
        }
        return date.toISOString();
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('INVALID_DATE_FORMAT');
    }
    return parsed.toISOString();
}

function getFormattedDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().split('T')[0];
}

export default function AddTransactionScreen() {
    const params = useLocalSearchParams();
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [loading, setLoading] = useState(false);
    const txId = params.id;

    // Form State
    const [symbol, setSymbol] = useState(params.symbol || '');
    const [type, setType] = useState('BUY');
    const [amount, setAmount] = useState('');
    const [price, setPrice] = useState('');
    const [fee, setFee] = useState('');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(getFormattedDate(0));
    const [currency, setCurrency] = useState('EUR');

    useEffect(() => {
        let isMounted = true;
        (async () => {
            await initDb();
            const c = await getMeta('currency');
            if (!isMounted) return;
            if (c) setCurrency(c);

            if (txId) {
                const tx = await getTransactionById(txId);
                if (!isMounted) return;
                if (tx) {
                    setSymbol(tx.symbol || '');
                    setType(tx.way || 'BUY');
                    setAmount(String(tx.amount || ''));
                    const unitPrice = tx.amount > 0 ? (tx.quote_amount / tx.amount) : 0;
                    setPrice(unitPrice ? String(unitPrice) : '');
                    setDate(tx.date_iso ? tx.date_iso.split('T')[0] : getFormattedDate(0));
                    setCurrency(tx.quote_currency || c || 'EUR');
                }
            }
        })();
        return () => { isMounted = false; };
    }, [txId]);

    const isBuyGroup = type === 'BUY' || type === 'DEPOSIT' || type === 'RECEIVE';

    // Live calculation summary
    const calculationSummary = useMemo(() => {
        const qty = parseFloat(amount);
        const p = parseFloat(price);
        const f = parseFloat(fee) || 0;

        if (!Number.isFinite(qty) || !Number.isFinite(p) || qty <= 0 || p <= 0) {
            return null;
        }

        const subtotal = qty * p;
        const total = isBuyGroup ? subtotal + f : Math.max(0, subtotal - f);

        return {
            subtotal,
            fee: f,
            total,
            qty,
            p,
        };
    }, [amount, price, fee, isBuyGroup]);

    const handleSave = async () => {
        if (!symbol.trim() || !amount.trim() || !price.trim()) {
            Alert.alert(
                t('addTransaction.missingFieldsTitle', 'Missing fields'),
                t('addTransaction.missingFieldsMessage', 'Please fill in Symbol, Amount and Price')
            );
            return;
        }

        setLoading(true);
        try {
            const qty = Number(amount);
            const p = Number(price);
            const feeNum = Number(fee) || 0;

            if (!Number.isFinite(qty) || !Number.isFinite(p) || qty <= 0 || p <= 0) {
                Alert.alert(
                    t('addTransaction.invalidNumbersTitle', 'Invalid numbers'),
                    t('addTransaction.invalidNumbersMessage', 'Amount and Price must be positive numbers')
                );
                setLoading(false);
                return;
            }

            const rawQuote = isBuyGroup ? (p * qty + feeNum) : Math.max(0, p * qty - feeNum);

            const newTx = {
                dateISO: dateInputToUtcIso(date),
                symbol: symbol.trim().toUpperCase(),
                way: type,
                amount: qty,
                quoteCurrency: currency,
                quoteAmount: rawQuote,
                fees: feeNum,
                notes: notes.trim() || t('addTransaction.manualEntry', 'Manual entry')
            };

            if (txId) {
                await updateTransaction(txId, newTx);
            } else {
                await insertTransactions([newTx]);
            }

            router.back();
        } catch (e) {
            if (e?.message === 'INVALID_DATE_FORMAT') {
                Alert.alert(
                    t('general.error', 'Error'),
                    t('addTransaction.dateInvalidMessage', 'Invalid date format. Use YYYY-MM-DD.')
                );
            } else {
                Alert.alert(t('general.error', 'Error'), e.message || String(e));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={12}>
                    <ArrowLeft color={colors.text} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>
                    {txId ? t('addTransaction.editTitle', 'Edit Transaction') : t('addTransaction.title', 'Add Transaction')}
                </Text>
                <View style={{ width: 32 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

                    {/* Type Selector Pills */}
                    <Text style={[styles.label, { color: colors.textSecondary }]}>{t('coin.generalTab', 'Transaction Type')}</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.typeRow}
                    >
                        {TX_TYPES.map((tItem) => {
                            const isSelected = type === tItem;
                            const isPositiveType = tItem === 'BUY' || tItem === 'DEPOSIT' || tItem === 'RECEIVE';
                            let activeBg = isPositiveType ? colors.success : colors.error;

                            return (
                                <TouchableOpacity
                                    key={tItem}
                                    style={[
                                        styles.typeBtn,
                                        { backgroundColor: colors.surfaceElevated },
                                        isSelected && { backgroundColor: activeBg }
                                    ]}
                                    onPress={() => setType(tItem)}
                                >
                                    <Text style={[
                                        styles.typeText,
                                        { color: colors.textSecondary },
                                        isSelected && { color: '#FFFFFF' }
                                    ]}>
                                        {tItem}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Symbol */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            {t('addTransaction.symbolLabel', 'Coin Symbol (e.g. BTC)')}
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.borderLight,
                                    color: colors.text
                                }
                            ]}
                            value={symbol}
                            onChangeText={(val) => setSymbol(val.toUpperCase())}
                            placeholder="BTC"
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />
                    </View>

                    {/* Amount & Price (2 Column Row) */}
                    <View style={styles.twoColRow}>
                        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>
                                {t('addTransaction.amountLabel', 'Amount')}
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.borderLight,
                                        color: colors.text
                                    }
                                ]}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="decimal-pad"
                            />
                        </View>

                        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>
                                {t('addTransaction.pricePerCoinLabel', { currency })}
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.borderLight,
                                        color: colors.text
                                    }
                                ]}
                                value={price}
                                onChangeText={setPrice}
                                placeholder="0.00"
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>

                    {/* Fees */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            {t('addTransaction.feeLabel', { currency })}
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.borderLight,
                                    color: colors.text
                                }
                            ]}
                            value={fee}
                            onChangeText={setFee}
                            placeholder="0.00"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="decimal-pad"
                        />
                    </View>

                    {/* Date with quick chips */}
                    <View style={styles.inputGroup}>
                        <View style={styles.dateHeaderRow}>
                            <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 0 }]}>
                                {t('addTransaction.dateLabel', 'Date (YYYY-MM-DD)')}
                            </Text>
                            <View style={styles.dateChipsRow}>
                                <TouchableOpacity
                                    style={[styles.dateChip, { backgroundColor: colors.surfaceElevated }]}
                                    onPress={() => setDate(getFormattedDate(0))}
                                >
                                    <Text style={[styles.dateChipText, { color: colors.text }]}>
                                        {t('addTransaction.today', 'Today')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.dateChip, { backgroundColor: colors.surfaceElevated }]}
                                    onPress={() => setDate(getFormattedDate(1))}
                                >
                                    <Text style={[styles.dateChipText, { color: colors.text }]}>
                                        {t('addTransaction.yesterday', 'Yesterday')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.borderLight,
                                    color: colors.text,
                                    marginTop: 8
                                }
                            ]}
                            value={date}
                            onChangeText={setDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={colors.textSecondary}
                        />
                    </View>

                    {/* Notes */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            {t('addTransaction.notesLabel', 'Notes (optional)')}
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.borderLight,
                                    color: colors.text
                                }
                            ]}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder={t('addTransaction.notesPlaceholder', 'e.g. Exchange buy, Hardware wallet deposit...')}
                            placeholderTextColor={colors.textSecondary}
                        />
                    </View>

                    {/* Live Calculation Preview Card */}
                    {calculationSummary && (
                        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={styles.previewHeader}>
                                <Sparkles size={16} color={colors.accent || colors.primary} style={{ marginRight: 6 }} />
                                <Text style={[styles.previewTitle, { color: colors.text }]}>
                                    {t('addTransaction.previewTotal', 'Estimated Total')}
                                </Text>
                            </View>

                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                                    {formatNumber(calculationSummary.qty, 4)} {symbol || 'COIN'} × {formatMoney(calculationSummary.p, currency)}
                                </Text>
                                <Text style={[styles.previewValue, { color: colors.text }]}>
                                    {formatMoney(calculationSummary.subtotal, currency)}
                                </Text>
                            </View>

                            {calculationSummary.fee > 0 && (
                                <View style={styles.previewRow}>
                                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                                        {t('addTransaction.feeLabel', { currency })}
                                    </Text>
                                    <Text style={[styles.previewValue, { color: colors.textSecondary }]}>
                                        {isBuyGroup ? '+' : '-'}{formatMoney(calculationSummary.fee, currency)}
                                    </Text>
                                </View>
                            )}

                            <View style={[styles.previewDivider, { backgroundColor: colors.borderLight }]} />

                            <View style={styles.previewRow}>
                                <Text style={[styles.previewTotalLabel, { color: colors.text }]}>
                                    {isBuyGroup ? t('coin.costInclFee', 'Total Cost') : t('coin.received', 'Total Proceeds')}
                                </Text>
                                <Text style={[
                                    styles.previewTotalValue,
                                    { color: isBuyGroup ? colors.text : colors.success }
                                ]}>
                                    {formatMoney(calculationSummary.total, currency)}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={[
                            styles.saveBtn,
                            { backgroundColor: colors.primary },
                            loading && { opacity: 0.7 }
                        ]}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.primaryInverse} />
                        ) : (
                            <>
                                <Check color={colors.primaryInverse} size={20} />
                                <Text style={[styles.saveText, { color: colors.primaryInverse }]}>
                                    {t('addTransaction.saveTransaction', 'Save Transaction')}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    iconBtn: { padding: 6, borderRadius: 8 },
    title: { fontSize: 20, fontWeight: '700' },

    form: { padding: 20, paddingBottom: 40 },
    inputGroup: { marginBottom: 20 },
    label: { marginBottom: 6, fontSize: 13, fontWeight: '600' },
    input: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        fontSize: 16,
        borderWidth: 1,
    },

    twoColRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },

    typeRow: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 8,
    },
    typeBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
    },
    typeText: { fontWeight: '700', fontSize: 13 },

    dateHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateChipsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    dateChip: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 8,
    },
    dateChipText: {
        fontSize: 12,
        fontWeight: '600',
    },

    previewCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        marginBottom: 20,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    previewTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 3,
    },
    previewLabel: {
        fontSize: 13,
    },
    previewValue: {
        fontSize: 13,
        fontWeight: '600',
    },
    previewDivider: {
        height: 1,
        marginVertical: 8,
    },
    previewTotalLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    previewTotalValue: {
        fontSize: 16,
        fontWeight: '800',
    },

    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        marginTop: 8,
    },
    saveText: { fontWeight: '700', fontSize: 16, marginLeft: 8 },
});
