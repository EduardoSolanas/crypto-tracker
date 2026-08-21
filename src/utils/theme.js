import { useColorScheme } from 'react-native';

export const ALLOCATION_PALETTE = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#14B8A6', // Teal
    '#6366F1', // Indigo
    '#64748B', // Slate
];

/**
 * Get color tokens for given scheme ('dark' | 'light')
 */
export const getThemeColors = (colorScheme) => {
    const isDark = colorScheme === 'dark';

    return {
        // Backgrounds
        background: isDark ? '#090D16' : '#F8FAFC',
        surface: isDark ? '#131C2E' : '#FFFFFF',
        surfaceElevated: isDark ? '#1E293B' : '#EDF2F7',
        surfaceSubtle: isDark ? '#0F172A' : '#F1F5F9',
        card: isDark ? '#131C2E' : '#FFFFFF',

        // Text
        text: isDark ? '#F8FAFC' : '#0F172A',
        textSecondary: isDark ? '#94A3B8' : '#64748B',
        textTertiary: isDark ? '#64748B' : '#94A3B8',

        // Borders
        border: isDark ? '#1E293B' : '#E2E8F0',
        borderLight: isDark ? '#2D3748' : '#E2E8F0',

        // Status
        success: '#22C55E',
        successLight: '#4ADE80',
        successBg: isDark ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.12)',

        error: '#EF4444',
        errorLight: '#F87171',
        errorBg: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.12)',

        warning: '#F59E0B',
        warningBg: isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.12)',

        // Neutral & Brand
        gray: '#94A3B8',
        grayLight: '#CBD5E1',
        primary: isDark ? '#FFFFFF' : '#0F172A',
        primaryInverse: isDark ? '#090D16' : '#FFFFFF',
        accent: '#3B82F6',

        // Inputs
        inputBg: isDark ? '#131C2E' : '#FFFFFF',
        inputBorder: isDark ? '#2D3748' : '#CBD5E1',

        // Chart
        chartNeutral: '#94A3B8',
        allocationColors: ALLOCATION_PALETTE,
    };
};

/**
 * Theme hook that adapts to system or specified theme
 */
export const useTheme = (overrideScheme) => {
    const systemScheme = useColorScheme();
    const activeScheme = overrideScheme && overrideScheme !== 'system' ? overrideScheme : systemScheme;
    const isDark = activeScheme === 'dark';

    return {
        isDark,
        colorScheme: activeScheme || 'dark',
        colors: getThemeColors(activeScheme || 'dark'),
        allocationColors: ALLOCATION_PALETTE,
    };
};
