import React, { memo, useEffect, useState } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, View } from 'react-native';
import { STARTUP_POLYGONS } from './startupPolygons';
import OVERLAYS from './startupOverlays';

const STEP_MS = 80;

// Pre-mounted native-driver overlay layer so all 20 polygon bitmaps decode
// immediately at mount (fadeDuration={0}) and animate on the native UI thread
// at 60fps even while SQLite and history calculations run on the JS thread.
const PolygonOverlayLayer = memo(function PolygonOverlayLayer({ opacities }) {
    return (
        <>
            {STARTUP_POLYGONS.map((poly, index) => (
                <Animated.Image
                    key={poly.id}
                    source={OVERLAYS[index]}
                    fadeDuration={0}
                    style={[styles.bgImage, { opacity: opacities[index] }]}
                    resizeMode="stretch"
                />
            ))}
        </>
    );
});

export default function StartupScreen() {
    const totalPolygons = STARTUP_POLYGONS.length;
    const [opacities] = useState(() =>
        STARTUP_POLYGONS.map((_, i) => new Animated.Value(i === 0 ? 0.25 : 0))
    );

    const [litCount, setLitCount] = useState(1);

    useEffect(() => {
        const animations = opacities.map((anim, index) =>
            Animated.sequence([
                Animated.delay(index * STEP_MS),
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 140,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(anim, {
                    toValue: 0.9,
                    duration: 180,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );

        const composite = Animated.parallel(animations);
        composite.start();

        const timer = setInterval(() => {
            setLitCount((prev) => {
                if (prev >= totalPolygons) {
                    clearInterval(timer);
                    return totalPolygons;
                }
                return prev + 1;
            });
        }, STEP_MS);

        return () => {
            composite.stop();
            clearInterval(timer);
        };
    }, [opacities, totalPolygons]);

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
                style={styles.bgImage}
                resizeMode="stretch"
            />
            <PolygonOverlayLayer opacities={opacities} />
            {STARTUP_POLYGONS.slice(0, litCount).map((poly) => (
                <View
                    key={poly.id}
                    testID={`startup-polygon-lit-${poly.id}`}
                    pointerEvents="none"
                    style={styles.marker}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#070F1C' },
    bgImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    marker: { position: 'absolute', width: 0, height: 0 },
});
