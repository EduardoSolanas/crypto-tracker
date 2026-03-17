import { Stack } from 'expo-router';
import '../src/i18n';

export default function Layout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: 'slide_from_right',
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    headerShown: false,
                    title: 'Portfolio',
                }}
            />
            <Stack.Screen
                name="settings"
                options={{
                    presentation: 'modal',
                    headerShown: false,
                    animation: 'slide_from_bottom',
                }}
            />
            <Stack.Screen
                name="add-transaction"
                options={{
                    presentation: 'modal',
                    headerShown: false,
                    animation: 'slide_from_bottom',
                }}
            />
            <Stack.Screen
                name="coin/[symbol]"
                options={{
                    headerShown: false,
                    presentation: 'card',
                    animation: 'slide_from_right',
                }}
            />
        </Stack>
    );
}
