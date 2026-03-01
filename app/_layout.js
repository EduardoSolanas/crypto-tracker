import { Stack } from 'expo-router';
import '../src/i18n';

export default function Layout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false
            }}
        />
    );
}
