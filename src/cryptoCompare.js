const debugLog = (...args) => {
    if (globalThis.__DEV__) {
        console.log(...args);
    }
};

// Get image URL path from API response
const getImageUrlPath = (d) => d?.IMAGEURL || null;
const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const hasPrice = (d) => asNumber(d?.PRICE) > 0;

async function fetchCcPriceMultiFull(symbols, currency) {
    const fsyms = (symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean);
    const tsym = String(currency || '').toUpperCase();
    if (!fsyms.length || !tsym) return {};

    const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${fsyms.join(',')}&tsyms=${tsym}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json?.Response === 'Error') {
        throw new Error(json.Message || 'API Error');
    }

    return json?.RAW || {};
}

async function fetchUsdToTargetRate(targetCurrency) {
    const target = String(targetCurrency || '').toUpperCase();
    if (!target) return 0;
    if (target === 'USD') return 1;

    try {
        const ccUrl = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=USD&tsyms=${target}`;
        const ccRes = await fetch(ccUrl);
        const ccJson = await ccRes.json();
        const ccRate = asNumber(ccJson?.USD?.[target]);
        if (ccRate > 0) return ccRate;
    } catch (_e) {
        // Try fiat FX provider as fallback.
    }

    try {
        const fxUrl = `https://api.exchangerate.host/latest?base=USD&symbols=${target}`;
        const fxRes = await fetch(fxUrl);
        const fxJson = await fxRes.json();
        const fxRate = asNumber(fxJson?.rates?.[target]);
        if (fxRate > 0) return fxRate;
    } catch (_e) {
        // No FX rate available.
    }

    return 0;
}

function mapCcQuoteToPortfolioRow(sym, d, quantity) {
    const price = asNumber(d?.PRICE);
    return {
        symbol: sym,
        quantity,
        price,
        value: quantity * price,
        change24h: asNumber(d?.CHANGEPCT24HOUR),
        high24h: asNumber(d?.HIGH24HOUR),
        low24h: asNumber(d?.LOW24HOUR),
        mktCap: asNumber(d?.MKTCAP),
        vol24h: asNumber(d?.VOLUME24HOURTO),
        imageUrl: getImageUrlPath(d)
    };
}

// --- FALLBACK: BINANCE ---
async function fetchBinancePrices(holdingsMap, currency) {
    debugLog('[API] Using Binance Fallback');
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
                vol24h: parseFloat(json.volume), // This is base volume
                imageUrl: null // Will use fallback in CoinIcon component
            });

        } catch (e) {
            console.warn(`[Binance] Error fetching ${sym}:`, e.message);
            // Return fallback/empty entry so we don't crash
            portfolio.push({
                symbol: sym,
                quantity: holdingsMap[sym],
                price: 0, value: 0, change24h: 0, high24h: 0, low24h: 0, mktCap: 0, vol24h: 0,
                imageUrl: null
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
    const targetCurrency = String(currency || '').toUpperCase();

    try {
        // 1) Try direct pair(s) first.
        const directRaw = await fetchCcPriceMultiFull(symbols, targetCurrency);
        const missingSymbols = symbols.filter((sym) => !hasPrice(directRaw?.[sym]?.[targetCurrency]));

        let usdRaw = {};
        let usdToTargetRate = 0;

        // 2) For missing direct quotes, try cross-rate via USD.
        if (missingSymbols.length > 0) {
            usdRaw = await fetchCcPriceMultiFull(missingSymbols, 'USD');
            usdToTargetRate = await fetchUsdToTargetRate(targetCurrency);
        }

        const portfolio = symbols.map((sym) => {
            const quantity = holdingsMap[sym] ?? 0;
            const directQuote = directRaw?.[sym]?.[targetCurrency];
            if (hasPrice(directQuote)) {
                return mapCcQuoteToPortfolioRow(sym, directQuote, quantity);
            }

            const usdQuote = usdRaw?.[sym]?.USD;
            if (hasPrice(usdQuote) && usdToTargetRate > 0) {
                return {
                    symbol: sym,
                    quantity,
                    price: asNumber(usdQuote.PRICE) * usdToTargetRate,
                    value: quantity * asNumber(usdQuote.PRICE) * usdToTargetRate,
                    change24h: asNumber(usdQuote.CHANGEPCT24HOUR),
                    high24h: asNumber(usdQuote.HIGH24HOUR) * usdToTargetRate,
                    low24h: asNumber(usdQuote.LOW24HOUR) * usdToTargetRate,
                    mktCap: asNumber(usdQuote.MKTCAP) * usdToTargetRate,
                    vol24h: asNumber(usdQuote.VOLUME24HOURTO) * usdToTargetRate,
                    imageUrl: getImageUrlPath(usdQuote)
                };
            }

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
                imageUrl: null
            };
        });

        portfolio.sort((a, b) => b.value - a.value);
        return portfolio;

    } catch (e) {
        console.warn('[CryptoCompare] Primary pricing failed:', e?.message || e);
        // Fallback to Binance
        return await fetchBinancePrices(holdingsMap, currency);
    }
}

export async function fetchFxRates(fromCurrencies, toCurrency) {
    const uniqueFrom = [...new Set((fromCurrencies || []).map((c) => String(c || '').toUpperCase()).filter(Boolean))];
    const target = String(toCurrency || '').toUpperCase();
    if (!uniqueFrom.length || !target) return {};

    const rateMap = {};
    for (const code of uniqueFrom) {
        if (code === target) {
            rateMap[code] = 1;
        }
    }

    const missing = uniqueFrom.filter((code) => !(code in rateMap));
    if (!missing.length) return rateMap;

    try {
        const url = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${missing.join(',')}&tsyms=${target}`;
        const res = await fetch(url);
        const json = await res.json();
        for (const code of missing) {
            const rate = Number(json?.[code]?.[target]);
            if (Number.isFinite(rate) && rate > 0) {
                rateMap[code] = rate;
            }
        }
    } catch (_e) {
        // Keep partial rates only.
    }

    return rateMap;
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

export async function fetchCandles(symbol, currency, timeframe = 'day', limit = 30, aggregate = 1) {
    try {
        let endpoint = 'histoday';
        if (timeframe === 'hour') endpoint = 'histohour';
        if (timeframe === 'minute') endpoint = 'histominute';

        const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${symbol}&tsym=${currency}&limit=${limit}&aggregate=${aggregate}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.Response === 'Error') {
            throw new Error(json.Message);
        }

        return json?.Data?.Data || [];
    } catch (_e) {
        // Fallback to Binance
        // console.log(`[Hist] Fallback to Binance for ${symbol} (${timeframe})`);
        return await fetchBinanceCandles(symbol, currency, timeframe, limit);
    }
}
