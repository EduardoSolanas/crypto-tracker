import { CryptoProviderService } from './CryptoProviderService.js';

const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

class CryptoService {
    constructor() {
        this.providerService = new CryptoProviderService();
    }

    async getFxRate(targetCurrency) {
        const target = String(targetCurrency || '').toUpperCase();
        if (!target || target === 'USD') return 1;

        // Try CryptoCompare for FX
        try {
            const url = `https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=${target}`;
            const res = await fetch(url);
            const json = await res.json();
            const rate = asNumber(json?.[target]);
            if (rate > 0) return rate;
        } catch (e) {
            console.warn('[CryptoService] FX rate fetch failed:', e);
        }

        // Fallback or returned 0?
        // Maybe try another source if needed, but for now simple fallback.
        return 0;
    }

    async getPortfolio(holdingsMap, currency) {
        // console.log('[CryptoService] getPortfolio called with:', JSON.stringify(holdingsMap), currency);
        const originalSymbols = Object.keys(holdingsMap || {});
        if (!originalSymbols.length) return [];

        const targetCurrency = String(currency || 'USD').toUpperCase();

        // Use uppercase symbols for fetching prices
        const fetchSymbols = [...new Set(originalSymbols.map(s => String(s).toUpperCase()))];
        // console.log('[CryptoService] Fetching prices for:', fetchSymbols);

        // 1. Get prices in USD
        let usdPrices = {};
        try {
            usdPrices = await this.providerService.fetchPrices(fetchSymbols);
            // console.log('[CryptoService] Got USD prices:', Object.keys(usdPrices));
        } catch (e) {
            console.error('[CryptoService] Provider fetch error:', e);
        }

        // 2. Get FX Rate if needed
        let fxRate = 1;
        if (targetCurrency !== 'USD') {
            fxRate = await this.getFxRate(targetCurrency);
            // console.log('[CryptoService] FX Rate for', targetCurrency, ':', fxRate);
        }

        // 3. Map to Portfolio Rows (using original keys for quantity, but uppercase keys for valid price lookup)
        const portfolio = originalSymbols.map((sym) => {
            const quantity = holdingsMap[sym] ?? 0;
            const upSym = String(sym).toUpperCase();
            const item = usdPrices[upSym];

            if (!item) {
                console.warn(`[CryptoService] No price found for ${sym} (checked ${upSym})`);
                // Return empty/zero row
                return {
                    symbol: sym,
                    quantity,
                    price: 0,
                    value: 0,
                    change24h: 0,
                    high24h: 0,
                    low24h: 0,
                    mktCap: 0,
                    vol24h: 0,
                    imageUrl: null,
                };
            }

            // Convert values
            const price = item.price * fxRate;
            const value = quantity * price;

            return {
                symbol: sym,
                quantity,
                price,
                value,
                change24h: item.change24h, // Percentage change doesn't change with currency
                high24h: item.high24h * fxRate,
                low24h: item.low24h * fxRate,
                mktCap: item.mktCap * fxRate,
                vol24h: item.vol24h * fxRate,
                imageUrl: item.imageUrl,
            };
        });

        // Sort by value descending
        portfolio.sort((a, b) => b.value - a.value);

        return portfolio;
    }
}

export const cryptoService = new CryptoService();
