import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Feather from '@expo/vector-icons/Feather';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import appJson from '../app.json';
import { fetchPortfolioPrices } from '../src/cryptoCompare';
import { exportTransactionsToCSV, parseDeltaCsvWithReport } from '../src/csv';
import { clearAllData, getAllTransactions, getHoldingsMap, getMeta, initDb, insertTransactions, setMeta } from '../src/db';
import i18n, { getSystemLanguage } from '../src/i18n';
import { getCurrencyOptions } from '../src/utils/currencies';
import { SUPPORTED_LANGUAGES } from '../src/utils/languages';
import { useTheme } from '../src/utils/theme';

export default function SettingsScreen() {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const tr = (key, fallback, options) => {
        const value = t(key, options);
        if (typeof value !== 'string') return fallback;
        if (value === key || value.endsWith(key)) return fallback;
        return value;
    };
    const [currency, setCurrency] = useState('EUR');
    const [language, setLanguage] = useState('system');
    const [loading, setLoading] = useState(true);
    const [importProgress, setImportProgress] = useState(null); // { current, total, stage }
    const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
    const [currencySearch, setCurrencySearch] = useState('');

    const currencyOptions = getCurrencyOptions(i18n.resolvedLanguage || 'en');

    const filteredCurrencyOptions = useMemo(() => {
        const query = currencySearch.trim().toLowerCase();
        if (!query) return currencyOptions;

        return currencyOptions.filter((option) =>
            option.code.toLowerCase().includes(query) || option.name.toLowerCase().includes(query)
        );
    }, [currencyOptions, currencySearch]);

    useEffect(() => {
        let isMounted = true;

        async function loadSettings() {
            try {
                await initDb();
                const c = await getMeta('currency');
                if (isMounted && c) setCurrency(c);

                const savedLanguage = await getMeta('language');
                const nextLanguage = savedLanguage || 'system';
                if (isMounted) setLanguage(nextLanguage);

                const resolvedLanguage = nextLanguage === 'system' ? getSystemLanguage() : nextLanguage;
                await i18n.changeLanguage(resolvedLanguage);
            } catch (e) {
                if (globalThis.__DEV__) {
                    console.error(e);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadSettings();
        return () => { isMounted = false; };
    }, []);

    const handleSelectCurrency = async (code) => {
        try {
            setCurrency(code);
            await setMeta('currency', code);
            setIsCurrencyModalVisible(false);
            setCurrencySearch('');
        } catch (_e) {
            Alert.alert(tr('general.error', 'Error'), tr('settings.failedToSave', 'Failed to save settings'));
        }
    };

    const handleSelectLanguage = async (code) => {
        try {
            setLanguage(code);
            await setMeta('language', code);
            const resolvedLanguage = code === 'system' ? getSystemLanguage() : code;
            await i18n.changeLanguage(resolvedLanguage);
        } catch (_e) {
            Alert.alert(tr('general.error', 'Error'), tr('settings.failedToSave', 'Failed to save settings'));
        }
    };

    const handleImportTransactions = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', '*/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || !result.assets.length) return;

            const asset = result.assets[0];

            try {
                setImportProgress({ current: 0, total: 4, stage: tr('settings.readingCsv', 'Reading CSV file...') });

                const response = await fetch(asset.uri);
                const text = await response.text();

                setImportProgress({ current: 1, total: 4, stage: tr('settings.parsingTransactions', 'Parsing transactions...') });
                const { txns, report } = parseDeltaCsvWithReport(text);
                if (!txns.length) {
                    setImportProgress(null);
                    Alert.alert(tr('settings.parseError', 'Parse error'), tr('settings.noTransactionsFound', 'No transactions found in CSV'));
                    return;
                }

                Alert.alert(
                    tr('settings.importTransactions', 'Import Transactions'),
                    tr('settings.importFound', `Found ${txns.length} transactions. This will replace all existing data. Continue?`, { count: txns.length }),
                    [
                        {
                            text: tr('general.cancel', 'Cancel'),
                            style: 'cancel',
                            onPress: () => setImportProgress(null)
                        },
                        {
                            text: tr('general.import', 'Import'),
                            style: 'destructive',
                            onPress: async () => {
                                try {
                                    setImportProgress({ current: 2, total: 4, stage: tr('settings.clearingOldData', 'Clearing old data...') });
                                    await clearAllData();

                                    setImportProgress({ current: 3, total: 4, stage: tr('settings.savingTransactions', `Saving ${txns.length} transactions...`, { count: txns.length }) });
                                    await insertTransactions(txns);
                                    const holdings = await getHoldingsMap();

                                    setImportProgress({ current: 4, total: 4, stage: tr('settings.fetchingLatestPrices', 'Fetching latest prices...') });
                                    const currentCurrency = await getMeta('currency') || currency;
                                    await fetchPortfolioPrices(holdings, currentCurrency);

                                    setImportProgress(null);
                                    Alert.alert(
                                        tr('settings.importComplete', 'Import Complete'),
                                        tr('settings.importReport', `Imported: ${report.imported}\nSkipped: ${report.skipped}\n\nReasons:\n- Empty rows: ${report.reasons.empty_row}\n- Missing required fields: ${report.reasons.missing_required_fields}\n- Invalid amount: ${report.reasons.invalid_amount}\n- Invalid date: ${report.reasons.invalid_date}\n- Invalid symbol: ${report.reasons.invalid_symbol}`, {
                                            imported: report.imported,
                                            skipped: report.skipped,
                                            empty: report.reasons.empty_row,
                                            missing: report.reasons.missing_required_fields,
                                            invalidAmount: report.reasons.invalid_amount,
                                            invalidDate: report.reasons.invalid_date,
                                            invalidSymbol: report.reasons.invalid_symbol,
                                        }),
                                        [{ text: tr('general.ok', 'OK'), onPress: () => router.replace('/') }]
                                    );
                                } catch (e) {
                                    setImportProgress(null);
                                    Alert.alert(tr('settings.importError', 'Import error'), e?.message ?? String(e));
                                }
                            }
                        }
                    ]
                );
            } catch (e) {
                setImportProgress(null);
                Alert.alert(tr('settings.importError', 'Import error'), e?.message ?? String(e));
            }
        } catch (e) {
            setImportProgress(null);
            Alert.alert(tr('settings.pickerError', 'Picker error'), String(e));
        }
    };

    const handleExportTransactions = async () => {
        try {
            setLoading(true);
            const transactions = await getAllTransactions();

            if (!transactions || transactions.length === 0) {
                Alert.alert(tr('settings.noData', 'No Data'), tr('settings.noTransactionsToExport', 'No transactions to export'));
                return;
            }

            const csvContent = exportTransactionsToCSV(transactions);
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `crypto-portfolio-${timestamp}.csv`;

            if (FileSystem.StorageAccessFramework) {
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!permissions.granted) {
                    Alert.alert(tr('settings.permissionDenied', 'Permission Denied'), tr('settings.cannotExportWithoutPermission', 'Cannot export without storage permission'));
                    return;
                }

                const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                    permissions.directoryUri,
                    filename,
                    'text/csv'
                );

                await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
                Alert.alert(tr('general.ok', 'OK'), tr('settings.exportSuccess', `Exported ${transactions.length} transactions`, { count: transactions.length }));
            } else if (FileSystem.cacheDirectory) {
                const fileUri = FileSystem.cacheDirectory + filename;
                await FileSystem.writeAsStringAsync(fileUri, csvContent);

                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                    await Sharing.shareAsync(fileUri, {
                        mimeType: 'text/csv',
                        dialogTitle: tr('settings.exportCsv', 'Export CSV'),
                        UTI: 'public.comma-separated-values-text',
                    });
                } else {
                    Alert.alert(tr('general.ok', 'OK'), tr('settings.exportedTo', `Exported to ${filename}`, { filename }));
                }
            } else {
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                Alert.alert(tr('general.ok', 'OK'), tr('settings.downloadSuccess', `Downloaded ${filename}`, { filename }));
            }
        } catch (e) {
            if (globalThis.__DEV__) {
                console.error('Export error:', e);
            }
            Alert.alert(tr('settings.exportError', 'Export error'), e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleResetData = () => {
        Alert.alert(
            tr('settings.resetTitle', 'Reset All Data'),
            tr('settings.resetMessage', 'This will permanently delete all your transactions, holdings, and cached data. This action cannot be undone.'),
            [
                { text: tr('general.cancel', 'Cancel'), style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await clearAllData();
                            Alert.alert('Success', tr('settings.resetSuccess', 'All data has been reset'), [
                                { text: tr('general.ok', 'OK'), onPress: () => router.replace('/') }
                            ]);
                        } catch (e) {
                            Alert.alert(tr('general.error', 'Error'), e?.message ?? String(e));
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Feather name="arrow-left" color={colors.text} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{tr('settings.title', 'Settings')}</Text>
                <Text style={[styles.versionText, { color: colors.textSecondary }]}>
                    v{appJson.expo.version}
                </Text>
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{tr('settings.defaultCurrency', 'Default Currency')}</Text>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => setIsCurrencyModalVisible(true)}
                    >
                        <View>
                            <Text style={[styles.rowText, { color: colors.text }]}>{tr('settings.selectCurrency', 'Select Currency')}</Text>
                            <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                                {tr('settings.selectedCurrency', `Selected: ${currency}`, { currency })}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{tr('settings.language', 'Language')}</Text>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    {SUPPORTED_LANGUAGES.map((lang, index) => (
                        <TouchableOpacity
                            key={lang.code}
                            style={[
                                styles.row,
                                index !== SUPPORTED_LANGUAGES.length - 1 && { ...styles.borderBottom, borderBottomColor: colors.borderLight }
                            ]}
                            onPress={() => handleSelectLanguage(lang.code)}
                        >
                            <Text style={[styles.rowText, { color: colors.text }]}>{lang.label}</Text>
                            {language === lang.code && <Feather name="check" color="#22c55e" size={20} />}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{tr('settings.dataManagement', 'Data Management')}</Text>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <TouchableOpacity
                        style={[styles.row, { ...styles.borderBottom, borderBottomColor: colors.borderLight }]}
                        onPress={handleImportTransactions}
                        disabled={loading}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="upload" size={20} color={colors.text} style={{ marginRight: 12 }} />
                            <Text style={[styles.rowText, { color: colors.text }]}>{tr('settings.importCsv', 'Import CSV')}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.row}
                        onPress={handleExportTransactions}
                        disabled={loading}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="download" size={20} color={colors.text} style={{ marginRight: 12 }} />
                            <Text style={[styles.rowText, { color: colors.text }]}>{tr('settings.exportCsv', 'Export CSV')}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            <TouchableOpacity
                style={styles.resetBtn}
                onPress={handleResetData}
                disabled={loading}
            >
                <Text style={styles.resetText}>{tr('settings.resetAllData', 'Reset All Data')}</Text>
            </TouchableOpacity>

            <Modal visible={isCurrencyModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.currencyModalContent, { backgroundColor: colors.surface }]}> 
                        <Text style={[styles.modalTitle, { color: colors.text }]}>{tr('settings.selectCurrency', 'Select Currency')}</Text>
                        <TextInput
                            value={currencySearch}
                            onChangeText={setCurrencySearch}
                            placeholder={tr('settings.searchCurrencyPlaceholder', 'Search currency code or name')}
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.searchInput, { color: colors.text, borderColor: colors.border }]}
                        />

                        <FlatList
                            data={filteredCurrencyOptions}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.row, styles.currencyRow, { borderBottomColor: colors.borderLight }]}
                                    onPress={() => handleSelectCurrency(item.code)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.rowText, { color: colors.text }]}>{item.code}</Text>
                                        <Text style={{ color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>{item.name}</Text>
                                    </View>
                                    {currency === item.code && <Feather name="check" color="#22c55e" size={20} />}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{tr('settings.noCurrenciesFound', 'No currencies found')}</Text>
                            }
                        />

                        <TouchableOpacity
                            style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
                            onPress={() => {
                                setIsCurrencyModalVisible(false);
                                setCurrencySearch('');
                            }}
                        >
                            <Text style={[styles.rowText, { color: colors.text }]}>{tr('general.cancel', 'Cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={!!importProgress}
                transparent
                animationType="fade"
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>
                            {tr('settings.importingTransactions', 'Importing Transactions')}
                        </Text>
                        <Text style={[styles.modalStage, { color: colors.textSecondary }]}>
                            {importProgress?.stage}
                        </Text>

                        <View style={[styles.progressBarContainer, { backgroundColor: colors.surfaceElevated }]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        width: `${(importProgress?.current / importProgress?.total) * 100}%`,
                                        backgroundColor: colors.primary
                                    }
                                ]}
                            />
                        </View>

                        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                            {tr('settings.stepOf', `Step ${importProgress?.current} of ${importProgress?.total}`, { current: importProgress?.current, total: importProgress?.total })}
                        </Text>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingVertical: 12 },
    backBtn: { padding: 8, marginRight: 8 },
    title: { fontSize: 24, fontWeight: 'bold', flex: 1 },
    versionText: { fontSize: 12, fontWeight: '500' },

    // ...existing code...
    sectionTitle: { fontSize: 14, marginBottom: 12, fontWeight: '600' },
    card: { borderRadius: 12 },

    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16
    },
    borderBottom: { borderBottomWidth: 1 },
    rowText: { fontSize: 16, fontWeight: '500' },

    resetBtn: {
        marginTop: 'auto',
        marginBottom: 24,
        padding: 16,
        backgroundColor: '#332222',
        borderRadius: 12,
        alignItems: 'center'
    },
    resetText: { color: '#ef4444', fontWeight: 'bold' },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
        padding: 24,
        borderRadius: 16,
        alignItems: 'center'
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 12
    },
    modalStage: {
        fontSize: 14,
        marginBottom: 20,
        textAlign: 'center'
    },
    progressBarContainer: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4
    },
    progressText: {
        fontSize: 12,
        fontWeight: '500'
    },

    currencyModalContent: {
        width: '100%',
        maxWidth: 500,
        maxHeight: '85%',
        padding: 16,
        borderRadius: 16
    },
    searchInput: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 10,
    },
    currencyRow: {
        borderBottomWidth: 1,
    },
    emptyText: {
        padding: 20,
        textAlign: 'center'
    },
    closeBtn: {
        marginTop: 12,
        borderRadius: 10,
        alignItems: 'center',
        padding: 12,
    }
});

