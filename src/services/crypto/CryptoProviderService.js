import { CoinGeckoProvider } from './providers/CoinGeckoProvider.js';
import { CryptoCompareProvider } from './providers/CryptoCompareProvider.js';
import { BinanceProvider } from './providers/BinanceProvider.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_MAX_ATTEMPTS = process.env.NODE_ENV === 'test' ? 1 : 3;

async function withRetry(fn, maxAttempts = DEFAULT_MAX_ATTEMPTS, baseDelayMs = 500) {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** attempt));
            }
        }
    }
    throw lastError;
}

export class CryptoProviderService {
    constructor() {
        this.providers = [
            new CoinGeckoProvider(),
            new CryptoCompareProvider(),
            new BinanceProvider(),
        ];
    }

    async fetchPrices(symbols) {
        if (!symbols || !symbols.length) return {};

        const results = {};
        let missing = [...symbols];

        for (const provider of this.providers) {
            if (missing.length === 0) break;

            try {
                const providerResults = await withRetry(() => provider.fetchPrices(missing));

                for (const symbol in providerResults) {
                    if (providerResults[symbol]) {
                        results[symbol] = providerResults[symbol];
                    }
                }

                missing = missing.filter(sym => !results[sym]);

            } catch (error) {
                logger.warn('[CryptoProviderService] Provider failed after retries:', error);
            }
        }

        return results;
    }
}
