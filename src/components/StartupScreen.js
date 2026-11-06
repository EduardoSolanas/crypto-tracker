import React, { useEffect, useState } from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';
import { STARTUP_POLYGONS } from './startupPolygons';
import OVERLAYS from './startupOverlays';

const STEP_MS = 175;

export default function StartupScreen() {
    const totalPolygons = STARTUP_POLYGONS.length;
    const [litCount, setLitCount] = useState(1);

    useEffect(() => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            const next = Math.min(
                totalPolygons,
                Math.max(1, 1 + Math.floor(elapsed / STEP_MS))
            );
            setLitCount(next);
            if (next >= totalPolygons) {
                clearInterval(timer);
            }
        }, 45);

        return () => clearInterval(timer);
    }, [totalPolygons]);

    return (
        <View
            style={styles.screen}
            testID="startup-screen"
            accessibilityLabel="CryptoTracker"
            accessibilityValue={{ min: 0, max: totalPolygons, now: litCount }}
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <Image
                source={require('../../assets/images/splash-polygons-bg.png')}
                fadeDuration={0}
                style={styles.bgImage}
                resizeMode="stretch"
            />
            {STARTUP_POLYGONS.slice(0, litCount).map((poly, index) => (
                <Image
                    key={poly.id}
                    testID={`startup-polygon-lit-${poly.id}`}
                    source={OVERLAYS[index]}
                    fadeDuration={0}
                    style={styles.bgImage}
                    resizeMode="stretch"
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#070F1C' },
    bgImage: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
    },
});
