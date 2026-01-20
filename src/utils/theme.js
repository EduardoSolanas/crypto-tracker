import { useColorScheme } from 'react-native';

/**
 * Theme colors that adapt to system dark/light mode
 */
export const useTheme = () => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return {
        isDark,
        colors: {
            // Backgrounds
            background: isDark ? '#000000' : '#FFFFFF',
            surface: isDark ? '#1e293b' : '#F1F5F9',
            surfaceElevated: isDark ? '#334155' : '#E2E8F0',

            // Text
            text: isDark ? '#FFFFFF' : '#0F172A',
            textSecondary: isDark ? '#94a3b8' : '#64748B',
            textTertiary: isDark ? '#64748b' : '#94A3B8',

            // Borders
            border: isDark ? '#1e293b' : '#E2E8F0',
            borderLight: isDark ? '#334155' : '#CBD5E1',

            // Status colors (same for both themes)
            success: '#22c55e',
            successLight: '#4ade80',
            successBg: 'rgba(34, 197, 94, 0.15)',

            error: '#ef4444',
            errorLight: '#f87171',
            errorBg: 'rgba(239, 68, 68, 0.15)',

            // Neutral
            gray: '#94a3b8',
            grayLight: '#cbd5e1',

            // Interactive
            primary: isDark ? '#FFFFFF' : '#000000',
            primaryInverse: isDark ? '#000000' : '#FFFFFF',

            // Chart
            chartNeutral: '#94a3b8',
        }
    };
};

/**
 * Get theme colors without hook (for use outside components)
 */
export const getThemeColors = (colorScheme) => {
    const isDark = colorScheme === 'dark';

    return {
        background: isDark ? '#000000' : '#FFFFFF',
        surface: isDark ? '#1e293b' : '#F1F5F9',
        surfaceElevated: isDark ? '#334155' : '#E2E8F0',
        text: isDark ? '#FFFFFF' : '#0F172A',
        textSecondary: isDark ? '#94a3b8' : '#64748B',
        textTertiary: isDark ? '#64748b' : '#94A3B8',
        border: isDark ? '#1e293b' : '#E2E8F0',
        borderLight: isDark ? '#334155' : '#CBD5E1',
        success: '#22c55e',
        successLight: '#4ade80',
        successBg: 'rgba(34, 197, 94, 0.15)',
        error: '#ef4444',
        errorLight: '#f87171',
        errorBg: 'rgba(239, 68, 68, 0.15)',
        gray: '#94a3b8',
        grayLight: '#cbd5e1',
        primary: isDark ? '#FFFFFF' : '#000000',
        primaryInverse: isDark ? '#000000' : '#FFFFFF',
        chartNeutral: '#94a3b8',
    };
};
