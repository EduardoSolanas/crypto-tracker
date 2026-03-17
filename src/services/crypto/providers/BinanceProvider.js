export class BinanceProvider {
    async fetchPrices(symbols) {
        if (!symbols || !symbols.length) return {};

        const results = {};

        await Promise.all(symbols.map(async (sym) => {
            try {
                const symUpper = String(sym).toUpperCase();

                const fetchPair = async (p) => {
                    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${p}`);
                    if (!res.ok) return null;
                    return res.json();
                };

                let json = null;
                // Try USDT
                json = await fetchPair(`${symUpper}USDT`);

                // Try BUSD
                if (!json) {
                    json = await fetchPair(`${symUpper}BUSD`);
                }

                if (json) {
                    const price = parseFloat(json.lastPrice);
                    if (price > 0) {
                        results[sym] = {
                            symbol: sym,
                            price: price,
                            change24h: parseFloat(json.priceChangePercent),
                            high24h: parseFloat(json.highPrice),
                            low24h: parseFloat(json.lowPrice),
                            mktCap: 0, // Binance ticker doesn't return mkt cap
                            vol24h: parseFloat(json.quoteVolume), // Volume in USD(T)
                            imageUrl: null,
                        };
                    }
                }
            } catch (e) {
                console.warn(`[BinanceProvider] Error fetching ${sym}:`, e.message);
            }
        }));

        return results;
    }
}

