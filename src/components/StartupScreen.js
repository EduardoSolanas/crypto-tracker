import React, { useEffect, useState } from 'react';
import { Image, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { STARTUP_POLYGONS } from './startupPolygons';
import OVERLAYS from './startupOverlays';

const STEP_MS = 80;

export default function StartupScreen() {
    const totalPolygons = STARTUP_POLYGONS.length;
    const dims = useWindowDimensions();
    const frameStyle = [
        styles.bgImage,
        dims?.width > 0 && dims?.height > 0
            ? { width: dims.width, height: dims.height }
            : null,
    ];

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
        }, 50);

        return () => clearInterval(timer);
    }, [totalPolygons]);

    return (
        <View
            style={styles.screen}
            testID="startup-screen"
            accessibilityLabel="CryptoTracker"
            accessibilityValue={{ min: 0, max: totalPolygons, now: litCount }}
        >
            <StatusBar barStyle="light-content" backgroundColor="#070F1C" />
            <Image
                source={require('../../assets/images/splash-polygons-bg.png')}
                fadeDuration={0}
                style={frameStyle}
                resizeMode="stretch"
            />
            {STARTUP_POLYGONS.slice(0, litCount).map((poly, index) => (
                <Image
                    key={poly.id}
                    testID={`startup-polygon-lit-${poly.id}`}
                    source={OVERLAYS[index]}
                    fadeDuration={0}
                    style={frameStyle}
                    resizeMode="stretch"
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#070F1C' },
    bgImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
