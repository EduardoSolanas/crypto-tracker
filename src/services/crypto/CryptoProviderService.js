import { CoinGeckoProvider } from './providers/CoinGeckoProvider.js';
import { CryptoCompareProvider } from './providers/CryptoCompareProvider.js';
import { BinanceProvider } from './providers/BinanceProvider.js';

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
                // Fetch prices for missing symbols using the current provider
                const providerResults = await provider.fetchPrices(missing);

                // Add results to the results map
                for (const symbol in providerResults) {
                    if (providerResults[symbol]) {
                        results[symbol] = providerResults[symbol];
                    }
                }

                // Update missing symbols
                missing = missing.filter(sym => !results[sym]);

            } catch (error) {
                console.warn(`[CryptoProviderService] Provider failed:`, error);
                // Continue to the next provider
            }
        }

        return results;
    }
}
