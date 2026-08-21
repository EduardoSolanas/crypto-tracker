import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getCachedIconUri, getIconFallbackUris } from '../utils/iconCache';

/**
 * CoinIcon component that displays a cryptocurrency icon with local caching
 * Falls back to a colored circle with the coin's first letter if icon fails to load
 */
export default function CoinIcon({ symbol, imageUrl, size = 40, style }) {
    const [iconUri, setIconUri] = useState(null);
    const [hasError, setHasError] = useState(false);
    const [fallbackIndex, setFallbackIndex] = useState(0);
    const [fallbackUris, setFallbackUris] = useState([]);

    useEffect(() => {
        let mounted = true;
        
        const loadIcon = async () => {
            try {
                const uri = await getCachedIconUri(symbol, imageUrl);
                if (mounted) {
                    setIconUri(uri);
                    setHasError(false);
                    setFallbackUris(getIconFallbackUris(symbol, imageUrl));
                    setFallbackIndex(0);
                }
            } catch (_e) {
                if (mounted) {
                    setHasError(true);
                }
            }
        };

        loadIcon();

        return () => {
            mounted = false;
        };
    }, [symbol, imageUrl]);

    // Generate a consistent color based on the symbol
    const getColorFromSymbol = (sym) => {
        const colors = [
            '#F7931A', // BTC orange
            '#627EEA', // ETH blue
            '#26A17B', // USDT green
            '#2775CA', // USDC blue
            '#E84142', // AVAX red
            '#8247E5', // MATIC purple
            '#00D395', // Compound green
            '#FF007A', // Uniswap pink
            '#0033AD', // Chainlink blue
            '#14F195', // Solana green
        ];
        
        // Simple hash based on symbol
        let hash = 0;
        for (let i = 0; i < sym.length; i++) {
            hash = sym.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const containerStyle = [
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        style
    ];

    // Show fallback if no URI or error loading
    const handleImageError = () => {
        const nextIndex = fallbackIndex + 1;
        if (nextIndex < fallbackUris.length) {
            setFallbackIndex(nextIndex);
            setIconUri(fallbackUris[nextIndex]);
            setHasError(false);
            return;
        }
        setHasError(true);
    };

    if (!iconUri || hasError) {
        const bgColor = getColorFromSymbol(symbol);
        return (
            <View testID="coin-icon-fallback" style={[containerStyle, styles.fallback, { backgroundColor: bgColor }]}>
                <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>
                    {symbol?.charAt(0)?.toUpperCase() || '?'}
                </Text>
            </View>
        );
    }

    return (
        <View style={containerStyle}>
            <Image
                testID="coin-icon-image"
                source={{ uri: iconUri }}
                style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
                onError={handleImageError}
                resizeMode="cover"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        backgroundColor: '#1e293b',
    },
    image: {
        backgroundColor: 'transparent',
    },
    fallback: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        color: '#ffffff',
        fontWeight: 'bold',
    },
});
