import React from 'react';
import { Image, StatusBar, StyleSheet, View } from 'react-native';

export default function StartupScreen() {
    return (
        <View style={styles.screen} testID="startup-screen">
            <StatusBar barStyle="light-content" backgroundColor="#070F1C" />
            <Image
                source={require('../../assets/images/branding-source.png')}
                style={StyleSheet.absoluteFillObject}
                resizeMode="contain"
                accessibilityLabel="CryptoTracker"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#070F1C' },
});
