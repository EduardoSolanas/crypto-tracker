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

    unique.forEach((sym) => {
        const mapped = COINGECKO_SYMBOL_OVERRIDES[sym];
        if (mapped) symbolToId[sym] = mapped;
    });

    const unresolved = unique.filter((sym) => !symbolToId[sym]);
    if (!unresolved.length) return symbolToId;

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

const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export class CoinGeckoProvider {
    async fetchPrices(symbols) {
        if (!symbols || !symbols.length) return {};

        const symbolToId = await resolveCoinGeckoIds(symbols);
        const symbolsWithId = symbols.filter((sym) => !!symbolToId[sym]);

        if (!symbolsWithId.length) return {};

        const ids = symbolsWithId.map((sym) => symbolToId[sym]);
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;

        const res = await fetch(url);
        const json = await res.json();
        const results = {};

        symbolsWithId.forEach(sym => {
            const id = symbolToId[sym];
            const d = id ? json?.[id] : null;
            if (d) {
                results[sym] = {
                    symbol: sym,
                    price: asNumber(d?.usd),
                    change24h: asNumber(d?.usd_24h_change),
                    high24h: 0, // CoinGecko simple price doesn't give 24h high/low
                    low24h: 0,
                    mktCap: asNumber(d?.usd_market_cap),
                    vol24h: asNumber(d?.usd_24h_vol),
                    imageUrl: null, // Simple price doesn't include image
                };
            }
        });

        return results;
    }
}

