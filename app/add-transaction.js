import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getMeta, getTransactionById, initDb, insertTransactions, syncHoldingsForSymbol, updateTransaction } from '../src/db';
import { useTheme } from '../src/utils/theme';

function dateInputToUtcIso(dateInput) {
    const raw = String(dateInput || '').trim();
    const dateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('INVALID_DATE_FORMAT');
    }
    return parsed.toISOString();
}

export default function AddTransactionScreen() {
    const params = useLocalSearchParams();
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [loading, setLoading] = useState(false);
    const txId = params.id;

    // Form State
    const [symbol, setSymbol] = useState(params.symbol || '');
    const [type, setType] = useState('BUY'); // BUY, SELL, DEPOSIT, WITHDRAW
    const [amount, setAmount] = useState('');
    const [price, setPrice] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
    const [currency, setCurrency] = useState('EUR');

    useEffect(() => {
        (async () => {
            await initDb();
            const c = await getMeta('currency');
            if (c) setCurrency(c);

            if (txId) {
                const tx = await getTransactionById(txId);
                if (tx) {
                    setSymbol(tx.symbol);
                    setType(tx.way);
                    setAmount(String(tx.amount));
                    setPrice(String(tx.quote_amount / tx.amount));
                    setDate(tx.date_iso.split('T')[0]);
                }
            }
        })();
    }, [txId]);

    const handleSave = async () => {
        if (!symbol || !amount || !price) {
            Alert.alert(t('addTransaction.missingFieldsTitle'), t('addTransaction.missingFieldsMessage'));
            return;
        }

        setLoading(true);
        try {
            const existingTx = txId ? await getTransactionById(txId) : null;
            const qty = parseFloat(amount);
            const p = parseFloat(price);

            if (isNaN(qty) || isNaN(p)) {
                Alert.alert(t('addTransaction.invalidNumbersTitle'), t('addTransaction.invalidNumbersMessage'));
                setLoading(false);
                return;
            }

            const newTx = {
                dateISO: dateInputToUtcIso(date),
                symbol: symbol.toUpperCase(),
                way: type,
                amount: qty,
                quoteCurrency: currency,
                quoteAmount: p * qty, // Store total cost/value
                fees: 0,
                notes: t('addTransaction.manualEntry')
            };

            if (txId) {
                await updateTransaction(txId, newTx);
            } else {
                await insertTransactions([newTx]);
            }

            await syncHoldingsForSymbol(newTx.symbol);
            if (existingTx?.symbol && existingTx.symbol !== newTx.symbol) {
                await syncHoldingsForSymbol(existingTx.symbol);
            }

            // Go back
            router.back();
        } catch (e) {
            if (e?.message === 'INVALID_DATE_FORMAT') {
                Alert.alert(t('general.error'), t('addTransaction.dateInvalidMessage'));
            } else {
                Alert.alert(t('general.error'), e.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.iconBtn}
                    testID="add-tx-back-button"
                    accessibilityLabel="add-tx-back-button"
                >
                    <Feather name="arrow-left" color={colors.text} size={24} />
                </TouchableOpacity>
                <Text
                    style={[styles.title, { color: colors.text }]}
                    testID="add-tx-title"
                    accessibilityLabel="add-tx-title"
                >
                    {t('addTransaction.title')}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.form}>

                    {/* Type Selector */}
                    <View style={[styles.typeRow, { backgroundColor: colors.surface }]}>
                        {['BUY', 'SELL'].map(t => (
                            <TouchableOpacity
                                key={t}
                                style={[styles.typeBtn, type === t && (t === 'BUY' ? styles.bgGreen : styles.bgRed)]}
                                onPress={() => setType(t)}
                                testID={`add-tx-type-${t.toLowerCase()}`}
                                accessibilityLabel={`add-tx-type-${t.toLowerCase()}`}
                            >
                                <Text style={[styles.typeText, { color: colors.textSecondary }, type === t && styles.textWhite]}>{t}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Symbol */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('addTransaction.symbolLabel')}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
                            value={symbol}
                            onChangeText={t => setSymbol(t.toUpperCase())}
                            placeholder="BTC"
                            placeholderTextColor={colors.textSecondary}
                            testID="add-tx-symbol-input"
                            accessibilityLabel="add-tx-symbol-input"
                        />
                    </View>

                    {/* Amount */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('addTransaction.amountLabel')}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
                            value={amount}
                            onChangeText={setAmount}
                            placeholder="0.00"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="numeric"
                            testID="add-tx-amount-input"
                            accessibilityLabel="add-tx-amount-input"
                        />
                    </View>

                    {/* Price per Coin */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('addTransaction.pricePerCoinLabel', { currency })}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
                            value={price}
                            onChangeText={setPrice}
                            placeholder="0.00"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="numeric"
                            testID="add-tx-price-input"
                            accessibilityLabel="add-tx-price-input"
                        />
                    </View>

                    {/* Date */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('addTransaction.dateLabel')}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
                            value={date}
                            onChangeText={setDate}
                            placeholder="2023-01-01"
                            placeholderTextColor={colors.textSecondary}
                            testID="add-tx-date-input"
                            accessibilityLabel="add-tx-date-input"
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                        onPress={handleSave}
                        disabled={loading}
                        testID="add-tx-save-button"
                        accessibilityLabel="add-tx-save-button"
                    >
                        {loading ? <ActivityIndicator color={colors.primaryInverse} /> : (
                            <>
                                <Feather name="check" color={colors.primaryInverse} size={20} />
                                <Text style={[styles.saveText, { color: colors.primaryInverse }]}>{t('addTransaction.saveTransaction')}</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    iconBtn: { padding: 4 },
    title: { fontSize: 20, fontWeight: 'bold' },

    form: { padding: 24 },
    inputGroup: { marginBottom: 24 },
    label: { marginBottom: 8, fontSize: 14 },
    input: { padding: 16, borderRadius: 12, fontSize: 16 },

    typeRow: { flexDirection: 'row', marginBottom: 32, borderRadius: 12, padding: 4 },
    typeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
    typeText: { fontWeight: 'bold' },
    textWhite: { color: '#fff' },
    bgGreen: { backgroundColor: '#22c55e' },
    bgRed: { backgroundColor: '#ef4444' },

    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 16 },
    saveText: { fontWeight: 'bold', fontSize: 16, marginLeft: 8 }
});
