const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const getImageUrlPath = (d) => d?.IMAGEURL || null;

export class CryptoCompareProvider {
    async fetchPrices(symbols) {
        if (!symbols || !symbols.length) return {};

        const fsyms = (symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean);
        const tsym = 'USD';

        if (!fsyms.length) return {};

        const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${fsyms.join(',')}&tsyms=${tsym}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json?.Response === 'Error') {
            console.error(json.Message || 'API Error'); // Log but don't throw if partial success?
            return {};
        }

        const raw = json?.RAW || {};
        const results = {};

        fsyms.forEach(sym => {
            const d = raw[sym]?.[tsym];
            if (d && asNumber(d.PRICE) > 0) {
                results[sym] = {
                    symbol: sym,
                    price: asNumber(d.PRICE),
                    change24h: asNumber(d.CHANGEPCT24HOUR),
                    high24h: asNumber(d.HIGH24HOUR),
                    low24h: asNumber(d.LOW24HOUR),
                    mktCap: asNumber(d.MKTCAP),
                    vol24h: asNumber(d.VOLUME24HOURTO),
                    imageUrl: getImageUrlPath(d),
                };
            }
        });

        return results;
    }
}

