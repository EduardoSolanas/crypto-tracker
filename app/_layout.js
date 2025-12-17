import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

if (typeof window !== 'undefined') {
    const originalError = console.error;
    console.error = (...args) => {
        if (
            typeof args[0] === 'string' &&
            args[0].includes('transform-origin')
        ) {
            return;
        }
        originalError(...args);
    };
}

export default function Layout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack
                screenOptions={{
                    headerShown: false
                }}
            />
        </GestureHandlerRootView>
    );
}
