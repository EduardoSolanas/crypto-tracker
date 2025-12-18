import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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

export default function AddTransactionScreen() {
    const params = useLocalSearchParams();
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
            Alert.alert('Missing fields', 'Please fill in Symbol, Amount and Price');
            return;
        }

        setLoading(true);
        try {
            const qty = parseFloat(amount);
            const p = parseFloat(price);

            if (isNaN(qty) || isNaN(p)) {
                Alert.alert('Invalid numbers', 'Amount and Price must be numbers');
                setLoading(false);
                return;
            }

            const newTx = {
                dateISO: new Date(date).toISOString(),
                symbol: symbol.toUpperCase(),
                way: type,
                amount: qty,
                quoteCurrency: currency,
                quoteAmount: p * qty, // Store total cost/value
                fees: 0,
                notes: 'Manual entry'
            };

            if (txId) {
                await updateTransaction(txId, newTx);
            } else {
                await insertTransactions([newTx]);
            }

            await syncHoldingsForSymbol(newTx.symbol);

            // Go back
            router.back();
        } catch (e) {
            Alert.alert('Error', e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>Add Transaction</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.form}>

                    {/* Type Selector */}
                    <View style={styles.typeRow}>
                        {['BUY', 'SELL'].map(t => (
                            <TouchableOpacity
                                key={t}
                                style={[styles.typeBtn, type === t && (t === 'BUY' ? styles.bgGreen : styles.bgRed)]}
                                onPress={() => setType(t)}
                            >
                                <Text style={[styles.typeText, type === t && styles.textWhite]}>{t}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Symbol */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Coin Symbol (e.g. BTC)</Text>
                        <TextInput
                            style={styles.input}
                            value={symbol}
                            onChangeText={t => setSymbol(t.toUpperCase())}
                            placeholder="BTC"
                            placeholderTextColor="#64748b"
                        />
                    </View>

                    {/* Amount */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Amount</Text>
                        <TextInput
                            style={styles.input}
                            value={amount}
                            onChangeText={setAmount}
                            placeholder="0.00"
                            placeholderTextColor="#64748b"
                            keyboardType="numeric"
                        />
                    </View>

                    {/* Price per Coin */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Price per Coin ({currency})</Text>
                        <TextInput
                            style={styles.input}
                            value={price}
                            onChangeText={setPrice}
                            placeholder="0.00"
                            placeholderTextColor="#64748b"
                            keyboardType="numeric"
                        />
                    </View>

                    {/* Date */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
                        <TextInput
                            style={styles.input}
                            value={date}
                            onChangeText={setDate}
                            placeholder="2023-01-01"
                            placeholderTextColor="#64748b"
                        />
                    </View>

                    <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                        {loading ? <ActivityIndicator color="#000" /> : (
                            <>
                                <Check color="#000" size={20} />
                                <Text style={styles.saveText}>Save Transaction</Text>
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    iconBtn: { padding: 4 },
    title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

    form: { padding: 24 },
    inputGroup: { marginBottom: 24 },
    label: { color: '#94a3b8', marginBottom: 8, fontSize: 14 },
    input: { backgroundColor: '#1e293b', color: '#fff', padding: 16, borderRadius: 12, fontSize: 16 },

    typeRow: { flexDirection: 'row', marginBottom: 32, backgroundColor: '#1e293b', borderRadius: 12, padding: 4 },
    typeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
    typeText: { color: '#94a3b8', fontWeight: 'bold' },
    textWhite: { color: '#fff' },
    bgGreen: { backgroundColor: '#22c55e' },
    bgRed: { backgroundColor: '#ef4444' },

    saveBtn: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 16 },
    saveText: { color: '#000', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }
});
