import currencyCodes from 'currency-codes';

function buildDisplayName(code, locale) {
    const fallback = currencyCodes.code(code)?.currency || code;

    if (typeof Intl.DisplayNames !== 'function') {
        return fallback;
    }

    try {
        const names = new Intl.DisplayNames([locale || 'en'], { type: 'currency' });
        return names.of(code) || fallback;
    } catch (_e) {
        return fallback;
    }
}

export function getCurrencyOptions(locale) {
    return currencyCodes
        .codes()
        .map((code) => ({
            code,
            name: buildDisplayName(code, locale),
        }))
        .sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.code.localeCompare(b.code);
        });
}
