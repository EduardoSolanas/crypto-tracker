import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './locales/de/common.json';
import en from './locales/en/common.json';
import es from './locales/es/common.json';
import fr from './locales/fr/common.json';
import pt from './locales/pt/common.json';

const resources = {
    en: { translation: en },
    es: { translation: es },
    pt: { translation: pt },
    fr: { translation: fr },
    de: { translation: de },
};

const supportedLanguages = Object.keys(resources);

function resolveDeviceLanguage() {
    const tag = Localization.getLocales?.()?.[0]?.languageTag || 'en';
    const base = String(tag).split('-')[0].toLowerCase();
    return supportedLanguages.includes(base) ? base : 'en';
}

if (!i18n.isInitialized) {
    // eslint-disable-next-line import/no-named-as-default-member
    i18n
        .use(initReactI18next)
        .init({
            resources,
            lng: resolveDeviceLanguage(),
            fallbackLng: 'en',
            interpolation: {
                escapeValue: false,
            },
            compatibilityJSON: 'v4',
        });
}

export const getSystemLanguage = resolveDeviceLanguage;
export default i18n;
