import React, { useEffect, useState } from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

// Subpixel-matched vertex coordinates in the 412 x 915 top-left crop of branding-source.png
const V = {
    C_TL:  [0, 0],
    T0:    [27, 0],
    T1:    [158, 0],
    T2:    [254, 0],
    T3:    [322, 0],
    R_TOP: [412, 48],
    V0:    [86.5, 32.5],
    L0:    [0, 44.5],
    R0:    [412, 169],
    L1:    [0, 178],
    V1:    [41, 198],
    L2:    [0, 240],
    V2:    [282.5, 305],
    R1:    [412, 308.5],
    L3:    [0, 358],
    R2:    [412, 402.5],
    V3:    [179, 436],
    V4:    [318.5, 456.5],
    L4:    [0, 514],
    L5:    [0, 639.5],
    V5:    [73, 662.5],
    L6:    [0, 703.5],
    V6:    [180, 730],
    V7:    [410, 765.5],
    L7:    [0, 903],
    B0:    [11, 915],
    C_BL:  [0, 915],
};

// Polygons ordered in an alternating Left & Right Fan pattern sweeping across the mesh
export const STARTUP_POLYGONS = [
    { id: 'P20', side: 'left',  pts: ['L7', 'V5', 'V6', 'B0', 'C_BL'] },
    { id: 'P18', side: 'right', pts: ['V4', 'V7', 'V6'] },
    { id: 'P19', side: 'left',  pts: ['L6', 'V5', 'L7'] },
    { id: 'P17', side: 'right', pts: ['V3', 'V4', 'V6'] },
    { id: 'P15', side: 'left',  pts: ['L5', 'V5', 'L6'] },
    { id: 'P16', side: 'right', pts: ['V3', 'V6', 'V5'] },
    { id: 'P14', side: 'left',  pts: ['L4', 'V5', 'L5'] },
    { id: 'P12', side: 'right', pts: ['V2', 'R1', 'R2', 'V4'] },
    { id: 'P13', side: 'left',  pts: ['L3', 'V3', 'V5', 'L4'] },
    { id: 'P11', side: 'right', pts: ['V2', 'V4', 'V3'] },
    { id: 'P9',  side: 'left',  pts: ['L2', 'V1', 'V3', 'L3'] },
    { id: 'P8',  side: 'right', pts: ['V2', 'R0', 'R1'] },
    { id: 'P4',  side: 'left',  pts: ['L1', 'V1', 'L2'] },
    { id: 'P10', side: 'right', pts: ['V1', 'V2', 'V3'] },
    { id: 'P3',  side: 'left',  pts: ['L0', 'V1', 'L1'] },
    { id: 'P7',  side: 'right', pts: ['T2', 'T3', 'R_TOP', 'R0', 'V2'] },
    { id: 'P1',  side: 'left',  pts: ['C_TL', 'T0', 'V0', 'V1', 'L0'] },
    { id: 'P6',  side: 'right', pts: ['V0', 'V2', 'V1'] },
    { id: 'P2',  side: 'left',  pts: ['T0', 'T1', 'V0'] },
    { id: 'P5',  side: 'right', pts: ['T1', 'T2', 'V2', 'V0'] },
].map((poly) => ({
    ...poly,
    points: poly.pts.map((k) => V[k].join(',')).join(' '),
}));

function computeSwitchOnEnvelope(age, phase, index) {
    if (age <= 0) {
        return { isLit: false, baseOpacity: 0, surgeOpacity: 0, strokeOpacity: 0, strokeWidth: 0 };
    }
    const breathe = 0.06 * Math.sin(phase - index * 0.45);
    let base = 0;
    let surge = 0;

    if (age < 0.45) {
        // Power-on brightness ramp-up to peak bloom
        const u = age / 0.45;
        base = 1 - Math.pow(1 - u, 2.5);
        surge = Math.pow(u, 0.8);
    } else {
        // Smooth settle from peak brightness surge down to steady illuminated state
        const settle = Math.exp(-(age - 0.45) * 2.0);
        base = 0.78 + 0.22 * settle + breathe;
        surge = 0.95 * settle;
    }

    return {
        isLit: true,
        baseOpacity: Math.min(1, Math.max(0, base)),
        surgeOpacity: Math.min(1, Math.max(0, surge)),
        strokeOpacity: Math.min(1, base * 0.8 + surge * 0.6),
        strokeWidth: 1.2 + surge * 1.5,
    };
}

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

    const effectivePlayhead = animState.playhead;
    const litCount = Math.min(totalPolygons, Math.max(1, Math.ceil(effectivePlayhead)));
    const phase = animState.tick * 0.25;

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
            <Svg
                width="100%"
                height="100%"
                viewBox="0 0 412 915"
                preserveAspectRatio="none"
                style={StyleSheet.absoluteFillObject}
            >
                <Defs>
                    {/* Left-fan gradients sweep inward from left to right */}
                    <LinearGradient id="startupLeftSteadyGrad" x1="0%" y1="30%" x2="100%" y2="70%">
                        <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.48" />
                        <Stop offset="60%" stopColor="#0284C7" stopOpacity="0.30" />
                        <Stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.20" />
                    </LinearGradient>
                    <LinearGradient id="startupLeftSurgeGrad" x1="0%" y1="30%" x2="100%" y2="70%">
                        <Stop offset="0%" stopColor="#F0F9FF" stopOpacity="0.90" />
                        <Stop offset="45%" stopColor="#7DD3FC" stopOpacity="0.68" />
                        <Stop offset="100%" stopColor="#38BDF8" stopOpacity="0.38" />
                    </LinearGradient>

                    {/* Right-fan gradients sweep inward from right to left */}
                    <LinearGradient id="startupRightSteadyGrad" x1="100%" y1="30%" x2="0%" y2="70%">
                        <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.48" />
                        <Stop offset="60%" stopColor="#0284C7" stopOpacity="0.30" />
                        <Stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.20" />
                    </LinearGradient>
                    <LinearGradient id="startupRightSurgeGrad" x1="100%" y1="30%" x2="0%" y2="70%">
                        <Stop offset="0%" stopColor="#F0F9FF" stopOpacity="0.90" />
                        <Stop offset="45%" stopColor="#7DD3FC" stopOpacity="0.68" />
                        <Stop offset="100%" stopColor="#38BDF8" stopOpacity="0.38" />
                    </LinearGradient>
                </Defs>

                {STARTUP_POLYGONS.map((poly, index) => {
                    const age = effectivePlayhead - index;
                    const { isLit, baseOpacity, surgeOpacity, strokeOpacity, strokeWidth } =
                        computeSwitchOnEnvelope(age, phase, index);
                    const steadyGrad = poly.side === 'left' ? 'url(#startupLeftSteadyGrad)' : 'url(#startupRightSteadyGrad)';
                    const surgeGrad = poly.side === 'left' ? 'url(#startupLeftSurgeGrad)' : 'url(#startupRightSurgeGrad)';

                    return (
                        <React.Fragment key={poly.id}>
                            <Polygon
                                testID={isLit ? `startup-polygon-lit-${poly.id}` : `startup-polygon-unlit-${poly.id}`}
                                points={poly.points}
                                fill={isLit ? steadyGrad : 'none'}
                                fillOpacity={baseOpacity}
                                stroke={isLit ? '#38BDF8' : 'none'}
                                strokeWidth={strokeWidth}
                                strokeOpacity={strokeOpacity}
                            />
                            {isLit && surgeOpacity > 0.02 && (
                                <Polygon
                                    points={poly.points}
                                    fill={surgeGrad}
                                    fillOpacity={surgeOpacity}
                                    stroke="#E0F2FE"
                                    strokeWidth={strokeWidth * 0.9}
                                    strokeOpacity={surgeOpacity * 0.95}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#070F1C' },
    bgImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
