import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import '../src/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync('#000000').catch(() => {});

const CUSTOM_SPLASH_DURATION_MS = 1400;

export default function Layout() {
    const [showCustomSplash, setShowCustomSplash] = useState(true);

    useEffect(() => {
        SplashScreen.hideAsync().catch(() => {});
        const t = setTimeout(() => setShowCustomSplash(false), CUSTOM_SPLASH_DURATION_MS);
        return () => clearTimeout(t);
    }, []);

    return (
        <>
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                    animation: 'slide_from_right',
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false, title: 'Portfolio' }} />
                <Stack.Screen
                    name="settings"
                    options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="add-transaction"
                    options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="coin/[symbol]"
                    options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }}
                />
            </Stack>
            {showCustomSplash && (
                <View style={styles.splash} pointerEvents="none">
                    <Image
                        source={require('../assets/images/splash-icon.png')}
                        style={styles.splashImage}
                        resizeMode="contain"
                    />
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    splash: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    splashImage: {
        width: '100%',
        height: '100%',
    },
});
