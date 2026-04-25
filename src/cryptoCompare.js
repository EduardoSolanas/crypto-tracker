import { cryptoService } from './services/crypto/CryptoService.js';
import { logger } from './utils/logger.js';

const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const hasPrice = (d) => asNumber(d?.PRICE) > 0;

const COINGECKO_SYMBOL_OVERRIDES = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    XRP: 'ripple',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    FLR: 'flare-networks',
    SGB: 'songbird',
    PLU: 'pluton',
    LUNA: 'terra-luna-2',
};

let coinGeckoCoinListPromise = null;

/** @internal - test helper */
export function __resetCryptoProviderCachesForTesting() {
    coinGeckoCoinListPromise = null;
}

// Get image URL path from CryptoCompare API response
const getImageUrlPath = (d) => d?.IMAGEURL || null;

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

async function fetchCoinGeckoCoinList() {
    if (!coinGeckoCoinListPromise) {
        const url = 'https://api.coingecko.com/api/v3/coins/list?include_platform=false';
        coinGeckoCoinListPromise = fetch(url)
            .then((res) => res.json())
            .then((rows) => (Array.isArray(rows) ? rows : []))
            .catch(() => []);
    }
    return coinGeckoCoinListPromise;
}

async function resolveCoinGeckoIds(symbols) {
    const unique = [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))];
    const symbolToId = {};
    if (!unique.length) return symbolToId;

    // 1) deterministic manual overrides for known ambiguous/high-priority symbols
    unique.forEach((sym) => {
        const mapped = COINGECKO_SYMBOL_OVERRIDES[sym];
        if (mapped) symbolToId[sym] = mapped;
    });

    const unresolved = unique.filter((sym) => !symbolToId[sym]);
    if (!unresolved.length) return symbolToId;

    // 2) fallback to /coins/list resolution by symbol
    const coinList = await fetchCoinGeckoCoinList();
    const bySymbol = new Map();
    for (const coin of coinList) {
        const sym = String(coin?.symbol || '').toUpperCase();
        if (!sym || bySymbol.has(sym)) continue;
        bySymbol.set(sym, coin.id);
    }

    unresolved.forEach((sym) => {
        const id = bySymbol.get(sym);
        if (id) symbolToId[sym] = id;
    });

    return symbolToId;
}

function sampleCandles(candles, limit) {
    const target = Math.max(1, Number(limit || 0));
    const rows = Array.isArray(candles) ? candles : [];
    if (rows.length <= target) return rows;

    const sampled = [];
    const step = rows.length / target;
    for (let i = 0; i < target; i++) {
        const idx = Math.min(rows.length - 1, Math.floor(i * step));
        sampled.push(rows[idx]);
    }
    return sampled;
}

function mapDurationToCoinGeckoDays(timeframe, limit, aggregate) {
    let unitSeconds = 86400;
    if (timeframe === 'hour') unitSeconds = 3600;
    if (timeframe === 'minute') unitSeconds = 60;

    const durationDays = (Math.max(1, Number(limit || 1)) * Math.max(1, Number(aggregate || 1)) * unitSeconds) / 86400;
    if (durationDays <= 1) return '1';
    if (durationDays <= 7) return '7';
    if (durationDays <= 14) return '14';
    if (durationDays <= 30) return '30';
    if (durationDays <= 90) return '90';
    if (durationDays <= 180) return '180';
    if (durationDays <= 365) return '365';
    return 'max';
}

/* eslint-disable-next-line no-unused-vars */
async function fetchCoinGeckoPrices(holdingsMap, currency) {
    const symbols = Object.keys(holdingsMap || {}).map((s) => String(s).toUpperCase());
    if (!symbols.length) return [];

    const targetCurrency = String(currency || '').toUpperCase();
    const targetCurrencyLower = targetCurrency.toLowerCase();
    const symbolToId = await resolveCoinGeckoIds(symbols);

    const symbolsWithId = symbols.filter((sym) => !!symbolToId[sym]);
    if (!symbolsWithId.length) return symbols.map((sym) => ({
        symbol: sym,
        quantity: holdingsMap[sym] ?? 0,
        price: 0,
        value: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        mktCap: 0,
        vol24h: 0,
        imageUrl: null,
    }));

    const ids = symbolsWithId.map((sym) => symbolToId[sym]);
    const vsCurrencies = targetCurrency === 'USD' ? 'usd' : `${targetCurrencyLower},usd`;
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${vsCurrencies}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;
    const res = await fetch(url);
    const json = await res.json();

    let usdToTargetRate = targetCurrency === 'USD' ? 1 : 0;

    if (targetCurrency !== 'USD') {
        const needsUsdCross = symbols.some((sym) => {
            const id = symbolToId[sym];
            const d = id ? json?.[id] : null;
            const direct = asNumber(d?.[targetCurrencyLower]);
            const usd = asNumber(d?.usd);
            return direct <= 0 && usd > 0;
        });
        if (needsUsdCross) {
            usdToTargetRate = await fetchUsdToTargetRate(targetCurrency);
        }
    }

    const idToSymbols = new Map();
    for (const sym of symbolsWithId) {
        const id = symbolToId[sym];
        const bucket = idToSymbols.get(id) || [];
        bucket.push(sym);
        idToSymbols.set(id, bucket);
    }

    const portfolio = symbols.map((sym) => {
        const quantity = holdingsMap[sym] ?? 0;
        const id = symbolToId[sym];
        const d = id ? json?.[id] : null;

        let price = asNumber(d?.[targetCurrencyLower]);
        let mktCap = asNumber(d?.[`${targetCurrencyLower}_market_cap`]);
        let vol24h = asNumber(d?.[`${targetCurrencyLower}_24h_vol`]);

        if (price <= 0 && usdToTargetRate > 0) {
            const usdPrice = asNumber(d?.usd);
            if (usdPrice > 0) {
                price = usdPrice * usdToTargetRate;
                mktCap = asNumber(d?.usd_market_cap) * usdToTargetRate;
                vol24h = asNumber(d?.usd_24h_vol) * usdToTargetRate;
            }
        }

        return {
            symbol: sym,
            quantity,
            price,
            value: quantity * price,
            change24h: asNumber(d?.[`${targetCurrencyLower}_24h_change`] ?? d?.usd_24h_change),
            high24h: 0,
            low24h: 0,
            mktCap,
            vol24h,
            imageUrl: null,
        };
    });

    return portfolio;
}

async function fetchCoinGeckoCandles(symbol, currency, timeframe, limit, aggregate) {
    const sym = String(symbol || '').toUpperCase();
    const idMap = await resolveCoinGeckoIds([sym]);
    const id = idMap[sym];
    if (!id) throw new Error(`CoinGecko id not found for ${sym}`);

    const days = mapDurationToCoinGeckoDays(timeframe, limit, aggregate);
    const vsCurrency = String(currency || '').toLowerCase();
    const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=${vsCurrency}&days=${days}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko OHLC failed (${res.status})`);
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    const candles = rows.map((r) => ({
        time: Math.floor(asNumber(r?.[0]) / 1000),
        open: asNumber(r?.[1]),
        high: asNumber(r?.[2]),
        low: asNumber(r?.[3]),
        close: asNumber(r?.[4]),
    }));

    return sampleCandles(candles, limit);
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

/* eslint-disable-next-line no-unused-vars */
async function fetchPortfolioPricesFromCryptoCompare(holdingsMap, currency) {
    const symbols = Object.keys(holdingsMap || {});
    if (symbols.length === 0) return [];
    const targetCurrency = String(currency || '').toUpperCase();

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

    return symbols.map((sym) => {
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
}

// --- FALLBACK: BINANCE ---
/* eslint-disable-next-line no-unused-vars */
async function fetchBinancePrices(holdingsMap, currency) {
    const symbols = Object.keys(holdingsMap);
    const portfolio = [];

    // Attempt to resolve exchange rate to target currency (fallback to 0 if fails)
    let usdToTargetRate = 1;
    const target = String(currency || 'USD').toUpperCase();
    if (target !== 'USD' && target !== 'USDT') {
        usdToTargetRate = await fetchUsdToTargetRate(target);
    }

    // Binance doesn't have a multi-symbol endpoint like CC, so we fetch in parallel
    // (Rate limit for Binance is very high, 1200/min usually safe)
    await Promise.all(symbols.map(async (sym) => {
        try {
            const symUpper = String(sym).toUpperCase();

            const fetchPair = async (p) => {
                const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${p}`);
                if (!res.ok) return null;
                return res.json();
            };

            let json = null;
            let finalRate = 1;

            // 1. Try Direct pair if applicable (and not USD/USDT which we cover below)
            if (target !== 'USD' && target !== 'USDT') {
                 json = await fetchPair(`${symUpper}${target}`);
            }

            // 2. Try USDT
            if (!json) {
                json = await fetchPair(`${symUpper}USDT`);
                if (json) {
                    if (target !== 'USD' && target !== 'USDT') {
                        finalRate = usdToTargetRate;
                    }
                }
            }

            // 3. Try BUSD
            if (!json) {
                json = await fetchPair(`${symUpper}BUSD`);
                 if (json) {
                    if (target !== 'USD' && target !== 'BUSD') {
                        finalRate = usdToTargetRate;
                    }
                }
            }

            if (!json) {
                 throw new Error(`No pair for ${sym} (checked ${target}, USDT, BUSD)`);
            }

            // If we relied on USD rate but it failed
            if (finalRate === 0) {
                 logger.warn(`[Binance] Missing FX rate for ${target}, cannot convert ${sym}`);
                 // We have a price in USD but can't convert. Treating as 0 price effectively.
                 finalRate = 0;
            }

            const quantity = holdingsMap[sym] ?? 0;
            const price = parseFloat(json.lastPrice) * finalRate;
            const quoteVol = parseFloat(json.quoteVolume); // Volume in Quote Asset (e.g. USDT)
            const vol24h = quoteVol * finalRate;

            portfolio.push({
                symbol: sym,
                quantity,
                price,
                value: quantity * price,
                change24h: parseFloat(json.priceChangePercent), // % change is same regardless of currency
                high24h: parseFloat(json.highPrice) * finalRate,
                low24h: parseFloat(json.lowPrice) * finalRate,
                mktCap: 0, // Binance ticker doesn't return mkt cap
                vol24h,
                imageUrl: null // Will use fallback in CoinIcon component
            });

        } catch (e) {
            logger.warn(`[Binance] Error fetching ${sym}:`, e.message);
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

// --- PRIMARY: COINGECKO ---
export async function fetchPortfolioPrices(holdingsMap, currency) {
    return cryptoService.getPortfolio(holdingsMap, currency);
}

/*
export async function fetchPortfolioPrices(holdingsMap, currency) {
    const symbols = Object.keys(holdingsMap || {});
    if (symbols.length === 0) return [];

    try {
        let primary = await fetchCoinGeckoPrices(holdingsMap, currency);
        let bySymbol = Object.fromEntries(primary.map((r) => [r.symbol, r]));

        let unresolved = symbols.filter((sym) => asNumber(bySymbol?.[sym]?.price) <= 0);

        // Per-symbol fallback to CryptoCompare for unresolved quotes.
        if (unresolved.length > 0) {
            const partialHoldings = {};
            unresolved.forEach((sym) => { partialHoldings[sym] = holdingsMap[sym]; });
            const ccRows = await fetchPortfolioPricesFromCryptoCompare(partialHoldings, currency);
            ccRows.forEach((row) => {
                if (asNumber(row?.price) > 0) bySymbol[row.symbol] = row;
            });
        }

        unresolved = symbols.filter((sym) => asNumber(bySymbol?.[sym]?.price) <= 0);

        // Final per-symbol fallback to Binance for unresolved quotes.
        if (unresolved.length > 0) {
            const partialHoldings = {};
            unresolved.forEach((sym) => { partialHoldings[sym] = holdingsMap[sym]; });
            const bnRows = await fetchBinancePrices(partialHoldings, currency);
            bnRows.forEach((row) => {
                if (asNumber(row?.price) > 0) bySymbol[row.symbol] = row;
            });
        }

        const portfolio = symbols.map((sym) => bySymbol[sym] || {
            symbol: sym,
            quantity: holdingsMap[sym] ?? 0,
            price: 0,
            value: 0,
            change24h: 0,
            high24h: 0,
            low24h: 0,
            mktCap: 0,
            vol24h: 0,
            imageUrl: null,
        });

        portfolio.sort((a, b) => b.value - a.value);
        return portfolio;

    } catch (e) {
        logger.warn('[CoinGecko] Primary pricing failed:', e?.message || e);
        try {
            const ccRows = await fetchPortfolioPricesFromCryptoCompare(holdingsMap, currency);
            const hasAnyPrice = ccRows.some((r) => asNumber(r?.price) > 0);
            if (hasAnyPrice) return ccRows.sort((a, b) => b.value - a.value);
        } catch (ccErr) {
            logger.warn('[CryptoCompare] Pricing fallback failed:', ccErr?.message || ccErr);
        }
        return await fetchBinancePrices(holdingsMap, currency);
    }
}
*/

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
        // Try open.er-api.com as fallback for fiat-to-fiat rates.
    }

    const stillMissing = missing.filter((code) => !(code in rateMap));
    if (stillMissing.length > 0) {
        try {
            const fxRes = await fetch(`https://open.er-api.com/v6/latest/${target}`);
            const fxJson = await fxRes.json();
            if (fxJson?.result === 'success' && fxJson.rates) {
                for (const code of stillMissing) {
                    const rate = Number(fxJson.rates[code]);
                    if (Number.isFinite(rate) && rate > 0) {
                        // er-api returns rates FROM target, so rate is target→code — invert
                        rateMap[code] = 1 / rate;
                    }
                }
            }
        } catch (_e) {
            // No FX fallback available; callers handle missing keys gracefully.
        }
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
        logger.warn(`[BinanceHist] Failed for ${symbol}:`, e.message);
        return [];
    }
}

export async function fetchHistory(symbol, currency, limit = 30) {
    // Legacy simple fetch, mapped to fetchCandles
    return fetchCandles(symbol, currency, 'day', limit);
}

export async function fetchCandles(symbol, currency, timeframe = 'day', limit = 30, aggregate = 1) {
    try {
        const cgCandles = await fetchCoinGeckoCandles(symbol, currency, timeframe, limit, aggregate);
        if (cgCandles.length > 0) {
            return cgCandles;
        }
    } catch (_e) {
        // Continue to CryptoCompare fallback
    }

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
