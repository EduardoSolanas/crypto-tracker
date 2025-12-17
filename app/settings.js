
import { Stack, router } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMeta, initDb, setMeta } from '../src/db';

export default function SettingsScreen() {
    const [currency, setCurrency] = useState('EUR');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            await initDb();
            const c = await getMeta('currency');
            if (c) setCurrency(c);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectCurrency = async (c) => {
        try {
            setCurrency(c);
            await setMeta('currency', c);
            // Optionally alert or just save silently
            // Alert.alert('Saved', `Default currency set to ${c}`);
        } catch (e) {
            Alert.alert('Error', 'Failed to save settings');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Default Currency</Text>
                <View style={styles.card}>
                    {['EUR', 'USD', 'GBP'].map((c, i) => (
                        <TouchableOpacity
                            key={c}
                            style={[
                                styles.row,
                                i !== 2 && styles.borderBottom
                            ]}
                            onPress={() => handleSelectCurrency(c)}
                        >
                            <Text style={styles.rowText}>{c}</Text>
                            {currency === c && <Check color="#22c55e" size={20} />}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                    Alert.alert('Coming Soon', 'Reset functionality to be implemented');
                }}
            >
                <Text style={styles.resetText}>Reset All Data</Text>
            </TouchableOpacity>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000', padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingVertical: 12 },
    backBtn: { padding: 8, marginRight: 8 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },

    section: { marginBottom: 32 },
    sectionTitle: { color: '#94a3b8', fontSize: 14, marginBottom: 12, fontWeight: '600' },
    card: { backgroundColor: '#1e293b', borderRadius: 12 },

    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16
    },
    borderBottom: { borderBottomWidth: 1, borderBottomColor: '#334155' },
    rowText: { color: '#fff', fontSize: 16, fontWeight: '500' },

    resetBtn: {
        marginTop: 'auto',
        marginBottom: 24,
        padding: 16,
        backgroundColor: '#332222',
        borderRadius: 12,
        alignItems: 'center'
    },
    resetText: { color: '#ef4444', fontWeight: 'bold' }
});
