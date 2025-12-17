// --- FALLBACK: BINANCE ---
async function fetchBinancePrices(holdingsMap, currency) {
    console.log('[API] Using Binance Fallback');
    const symbols = Object.keys(holdingsMap);
    const portfolio = [];

    // Binance doesn't have a multi-symbol endpoint like CC, so we fetch in parallel
    // (Rate limit for Binance is very high, 1200/min usually safe)
    await Promise.all(symbols.map(async (sym) => {
        try {
            // MAPPING: USDT is a common base if EUR fails, but let's try CURRENCY first.
            // Binance symbols are usually Uppercase e.g. BTCEUR
            let pair = `${sym}${currency}`.toUpperCase();

            // Special handling for common infinite stablecoins or small caps if needed
            // For now assume standard pairs

            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`);
            if (!res.ok) {
                // Try USDT intermediate if EUR fails? 
                // For now just skip or return 0
                // console.warn(`[Binance] No pair for ${pair}`);
                // return;
                throw new Error(`No pair ${pair}`);
            }

            const json = await res.json();
            const quantity = holdingsMap[sym] ?? 0;
            const price = parseFloat(json.lastPrice);

            portfolio.push({
                symbol: sym,
                quantity,
                price,
                value: quantity * price,
                change24h: parseFloat(json.priceChangePercent),
                high24h: parseFloat(json.highPrice),
                low24h: parseFloat(json.lowPrice),
                mktCap: 0, // Binance ticker doesn't return mkt cap
                vol24h: parseFloat(json.volume) // This is base volume
            });

        } catch (e) {
            console.warn(`[Binance] Error fetching ${sym}:`, e.message);
            // Return fallback/empty entry so we don't crash
            portfolio.push({
                symbol: sym,
                quantity: holdingsMap[sym],
                price: 0, value: 0, change24h: 0, high24h: 0, low24h: 0, mktCap: 0, vol24h: 0
            });
        }
    }));

    portfolio.sort((a, b) => b.value - a.value);
    return portfolio;
}

// --- PRIMARY: CRYPTOCOMPARE ---
export async function fetchPortfolioPrices(holdingsMap, currency) {
    const symbols = Object.keys(holdingsMap || {});
    if (symbols.length === 0) return [];

    try {
        const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbols.join(',')}&tsyms=${currency}`;
        const res = await fetch(url);
        const json = await res.json();

        // Check for Rate Limit or Error
        if (json.Response === 'Error') {
            console.warn('[CryptoCompare] API Error/Rate Limit:', json.Message);
            throw new Error(json.Message || 'API Error');
        }

        const raw = json?.RAW || {};
        const portfolio = symbols.map((sym) => {
            const d = raw?.[sym]?.[currency];

            // If we don't get data for a symbol but valid JSON, it might just be missing in CC
            // But if ALL are missing, it's suspicious.

            const price = d?.PRICE ?? 0;
            const quantity = holdingsMap[sym] ?? 0;
            return {
                symbol: sym,
                quantity,
                price,
                value: quantity * price,
                change24h: d?.CHANGEPCT24HOUR ?? 0,
                high24h: d?.HIGH24HOUR ?? 0,
                low24h: d?.LOW24HOUR ?? 0,
                mktCap: d?.MKTCAP ?? 0,
                vol24h: d?.VOLUME24HOURTO ?? 0,
            };
        });

        portfolio.sort((a, b) => b.value - a.value);
        return portfolio;

    } catch (e) {
        // Fallback to Binance
        // console.log('Falling back to Binance due to:', e.message);
        return await fetchBinancePrices(holdingsMap, currency);
    }
}

// --- FALLBACK HISTORY: BINANCE ---
async function fetchBinanceCandles(symbol, currency, timeframe, limit) {
    try {
        let interval = '1d';
        if (timeframe === 'hour') interval = '1h';
        if (timeframe === 'minute') interval = '1m';

        // Binance limit max is 1000. If we need more (e.g. ALL=2000), we might need multiple calls or just cap it.
        // For simplicity, cap at 1000 for fallback (better than nothing).
        const binanceLimit = Math.min(limit, 1000);

        let pair = `${symbol}${currency}`.toUpperCase();
        const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${binanceLimit}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Binance K-line failed');

        const json = await res.json();
        // Binance response: [ [OpenTime, Open, High, Low, Close, ...], ... ]
        // CC format: { time: unix_seconds, close: number }

        return json.map(k => ({
            time: Math.floor(k[0] / 1000), // ms to sec
            close: parseFloat(k[4]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            open: parseFloat(k[1])
        }));

    } catch (e) {
        console.warn(`[BinanceHist] Failed for ${symbol}:`, e.message);
        return [];
    }
}

export async function fetchHistory(symbol, currency, limit = 30) {
    // Legacy simple fetch, mapped to fetchCandles
    return fetchCandles(symbol, currency, 'day', limit);
}

export async function fetchCandles(symbol, currency, timeframe = 'day', limit = 30) {
    try {
        let endpoint = 'histoday';
        if (timeframe === 'hour') endpoint = 'histohour';
        if (timeframe === 'minute') endpoint = 'histominute';

        const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${symbol}&tsym=${currency}&limit=${limit}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.Response === 'Error') {
            throw new Error(json.Message);
        }

        return json?.Data?.Data || [];
    } catch (e) {
        // Fallback to Binance
        // console.log(`[Hist] Fallback to Binance for ${symbol} (${timeframe})`);
        return await fetchBinanceCandles(symbol, currency, timeframe, limit);
    }
}
