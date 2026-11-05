import React, { useEffect, useState } from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';
import { STARTUP_POLYGONS } from './startupPolygons';
import OVERLAYS from './startupOverlays';

// Polygons light up in the stored fan order, one step per tick. Rendered as
// pre-baked PNG overlays (see scripts/generate-startup-overlays.mjs) instead
// of runtime react-native-svg, which silently failed to paint on device.
export default function StartupScreen() {
    const totalPolygons = STARTUP_POLYGONS.length;

    const [animState, setAnimState] = useState({ playhead: 1, tick: 0 });

    useEffect(() => {
        const timer = setInterval(() => {
            setAnimState((prev) => ({
                playhead: Math.min(totalPolygons + 1, prev.playhead + 0.32),
                tick: prev.tick + 1,
            }));
        }, 80);
        return () => clearInterval(timer);
    }, [totalPolygons]);

    const litCount = Math.min(totalPolygons, Math.max(1, Math.ceil(animState.playhead)));

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
                style={styles.bgImage}
                resizeMode="stretch"
            />
            {STARTUP_POLYGONS.slice(0, litCount).map((poly, index) => (
                <Image
                    key={poly.id}
                    testID={`startup-polygon-lit-${poly.id}`}
                    source={OVERLAYS[index]}
                    style={styles.bgImage}
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
