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
    if (!res.ok) throw new Error('CryptoCompare HTTP Error');
    const json = await res.json();

    if (json?.Response === 'Error' || json?.Err) {
        throw new Error(json?.Message || json?.Err?.message || 'API Error');
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

// --- MULTI-EXCHANGE PRICING (Binance / Coinbase / Gate.io) ---
async function fetchBinancePrices(holdingsMap, currency) {
    debugLog('[API] Using Multi-Exchange Pricing');
    const symbols = Object.keys(holdingsMap);
    const target = String(currency || 'EUR').toUpperCase();
    const portfolio = [];

    let usdtToTarget = 1;
    if (target !== 'USD') {
        try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${target}USDT`);
            if (r.ok) {
                const j = await r.json();
                const rate = parseFloat(j.price);
                if (rate > 0) usdtToTarget = 1 / rate;
            }
        } catch (_e) {
            const fx = await fetchUsdToTargetRate(target);
            if (fx > 0) usdtToTarget = fx;
        }
    }

    await Promise.all(symbols.map(async (sym) => {
        const quantity = holdingsMap[sym] ?? 0;
        let price = 0;
        let change24h = 0;
        let high24h = 0;
        let low24h = 0;
        let vol24h = 0;

        // 1. Binance direct pair
        try {
            const resDirect = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}${target}`);
            if (resDirect.ok) {
                const j = await resDirect.json();
                price = parseFloat(j.lastPrice);
                change24h = parseFloat(j.priceChangePercent);
                high24h = parseFloat(j.highPrice);
                low24h = parseFloat(j.lowPrice);
                vol24h = parseFloat(j.volume);
            } else {
                // 2. Binance USDT pair
                const resUsdt = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}USDT`);
                if (resUsdt.ok) {
                    const j = await resUsdt.json();
                    price = parseFloat(j.lastPrice) * usdtToTarget;
                    change24h = parseFloat(j.priceChangePercent);
                    high24h = parseFloat(j.highPrice) * usdtToTarget;
                    low24h = parseFloat(j.lowPrice) * usdtToTarget;
                    vol24h = parseFloat(j.volume);
                }
            }
        } catch (_e) {}

        // 3. Coinbase spot price if not found
        if (!price || price <= 0) {
            try {
                const cbRes = await fetch(`https://api.coinbase.com/v2/prices/${sym}-${target}/spot`);
                if (cbRes.ok) {
                    const cbJson = await cbRes.json();
                    const p = parseFloat(cbJson?.data?.amount);
                    if (p > 0) {
                        price = p;
                        high24h = p;
                        low24h = p;
                    }
                }
            } catch (_e) {}
        }

        // 4. Gate.io if not found
        if (!price || price <= 0) {
            try {
                const gateRes = await fetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${sym}_USDT`);
                if (gateRes.ok) {
                    const gateJson = await gateRes.json();
                    if (gateJson?.[0]?.last) {
                        const p = parseFloat(gateJson[0].last) * usdtToTarget;
                        if (p > 0) {
                            price = p;
                            change24h = parseFloat(gateJson[0].change_percentage || 0);
                            high24h = parseFloat(gateJson[0].high_24h || 0) * usdtToTarget;
                            low24h = parseFloat(gateJson[0].low_24h || 0) * usdtToTarget;
                        }
                    }
                }
            } catch (_e) {}
        }

        portfolio.push({
            symbol: sym,
            quantity,
            price: Number.isFinite(price) ? price : 0,
            value: Number.isFinite(price) ? quantity * price : 0,
            change24h: Number.isFinite(change24h) ? change24h : 0,
            high24h: Number.isFinite(high24h) ? high24h : 0,
            low24h: Number.isFinite(low24h) ? low24h : 0,
            mktCap: 0,
            vol24h: Number.isFinite(vol24h) ? vol24h : 0,
            imageUrl: null,
        });
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

            return null;
        });

        // If any symbol failed to get a price or returned null, fall back to multi-exchange
        if (portfolio.some(row => !row || row.price === 0)) {
            return await fetchBinancePrices(holdingsMap, currency);
        }

        portfolio.sort((a, b) => b.value - a.value);
        return portfolio;

    } catch (e) {
        debugLog('[CryptoCompare] Primary pricing failed, falling back to multi-exchange:', e?.message || e);
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

// --- HISTORICAL CANDLES ---
async function fetchBinanceCandles(symbol, currency, timeframe, limit) {
    try {
        let interval = '1d';
        if (timeframe === 'hour') interval = '1h';
        if (timeframe === 'minute') interval = '1m';

        const binanceLimit = Math.min(limit, 1000);
        const target = String(currency || 'EUR').toUpperCase();
        let pair = `${symbol}${target}`.toUpperCase();
        let rate = 1;

        let res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${binanceLimit}`);
        if (!res.ok) {
            const usdtPair = `${symbol}USDT`.toUpperCase();
            res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${usdtPair}&interval=${interval}&limit=${binanceLimit}`);
            if (!res.ok) throw new Error('Binance K-line failed');

            if (target !== 'USD') {
                try {
                    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${target}USDT`);
                    if (r.ok) {
                        const j = await r.json();
                        const p = parseFloat(j.price);
                        if (p > 0) rate = 1 / p;
                    }
                } catch (_e) {}
            }
        }

        const json = await res.json();
        return json.map(k => ({
            time: Math.floor(k[0] / 1000),
            close: parseFloat(k[4]) * rate,
            high: parseFloat(k[2]) * rate,
            low: parseFloat(k[3]) * rate,
            open: parseFloat(k[1]) * rate
        }));

    } catch (_e) {
        return [];
    }
}

const candleCache = new Map();
const inFlightCandleRequests = new Map();
const CANDLE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes TTL

export function clearCandleCache() {
    candleCache.clear();
    inFlightCandleRequests.clear();
}

export async function fetchHistory(symbol, currency, limit = 30) {
    return fetchCandles(symbol, currency, 'day', limit);
}

export async function fetchCandles(symbol, currency, timeframe = 'day', limit = 30, aggregate = 1) {
    const sym = String(symbol || '').toUpperCase();
    const curr = String(currency || '').toUpperCase();
    const cacheKey = `${sym}_${curr}_${timeframe}_${limit}_${aggregate}`;
    const cached = candleCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp < CANDLE_CACHE_TTL) && cached.data?.length > 0) {
        return cached.data;
    }

    if (inFlightCandleRequests.has(cacheKey)) {
        return inFlightCandleRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
        let candles = [];
        try {
            let endpoint = 'histoday';
            if (timeframe === 'hour') endpoint = 'histohour';
            if (timeframe === 'minute') endpoint = 'histominute';

            const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${sym}&tsym=${curr}&limit=${limit}&aggregate=${aggregate}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('CryptoCompare HTTP Error');
            const json = await res.json();

            if (json.Response === 'Error' || json.Err || !json?.Data?.Data || !json?.Data?.Data?.length) {
                throw new Error(json?.Message || json?.Err?.message || 'No candle data');
            }

            candles = json.Data.Data;
        } catch (_e) {
            candles = await fetchBinanceCandles(sym, curr, timeframe, limit);
        }

        if (candles && candles.length > 0) {
            candleCache.set(cacheKey, { timestamp: Date.now(), data: candles });
        }

        return candles;
    })().finally(() => {
        inFlightCandleRequests.delete(cacheKey);
    });

    inFlightCandleRequests.set(cacheKey, requestPromise);
    return requestPromise;
}
