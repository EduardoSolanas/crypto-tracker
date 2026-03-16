import { __resetCryptoProviderCachesForTesting, fetchPortfolioPrices } from '../cryptoCompare';

function jsonResponse(body, ok = true) {
    return {
        ok,
        async json() {
            return body;
        },
    };
}

describe('fetchPortfolioPrices pricing cascade', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        __resetCryptoProviderCachesForTesting();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('uses CoinGecko direct BTC/target quote when available', async () => {
        global.fetch.mockResolvedValueOnce(
            jsonResponse({
                bitcoin: {
                    eur: 60000,
                    eur_24h_change: 2.5,
                    eur_market_cap: 1000000,
                    eur_24h_vol: 500000,
                }
            })
        );

        const result = await fetchPortfolioPrices({ BTC: 2 }, 'EUR');

        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(60000);
        expect(result[0].value).toBe(120000);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toContain('api.coingecko.com/api/v3/simple/price');
        expect(global.fetch.mock.calls[0][0]).toContain('ids=bitcoin');
        expect(global.fetch.mock.calls[0][0]).toContain('vs_currencies=eur,usd');
    });

    it('falls back to BTC/USD * USD/target when CoinGecko direct pair is missing', async () => {
        global.fetch
            .mockResolvedValueOnce(
                jsonResponse({
                    bitcoin: {
                        usd: 60000,
                        usd_24h_change: 1,
                        usd_market_cap: 1000000,
                        usd_24h_vol: 200000,
                    }
                })
            )
            .mockResolvedValueOnce(jsonResponse({ USD: { BRL: 5 } }));

        const result = await fetchPortfolioPrices({ BTC: 1 }, 'BRL');

        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(300000);
        expect(result[0].value).toBe(300000);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[1][0]).toContain('pricemulti?fsyms=USD&tsyms=BRL');
    });

    it('uses exchangerate.host when USD/target is unavailable on CryptoCompare', async () => {
        global.fetch
            .mockResolvedValueOnce(
                jsonResponse({
                    bitcoin: {
                        usd: 60000,
                        usd_24h_change: 0,
                        usd_market_cap: 0,
                        usd_24h_vol: 0,
                    }
                })
            )
            .mockResolvedValueOnce(jsonResponse({}))
            .mockResolvedValueOnce(jsonResponse({ rates: { JPY: 150 } }));

        const result = await fetchPortfolioPrices({ BTC: 1 }, 'JPY');

        expect(result[0].price).toBe(9000000);
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(global.fetch.mock.calls[2][0]).toContain('api.exchangerate.host/latest?base=USD&symbols=JPY');
    });

    it('returns zeroed row when all providers fail to price the symbol', async () => {
        global.fetch
            // CoinGecko id resolution -> no symbol mapping
            .mockResolvedValueOnce(jsonResponse([]))
            // CryptoCompare direct and USD paths + FX fallbacks
            .mockResolvedValueOnce(jsonResponse({ RAW: {} }))
            .mockResolvedValueOnce(jsonResponse({ RAW: {} }))
            .mockResolvedValueOnce(jsonResponse({}))
            .mockResolvedValueOnce(jsonResponse({ rates: {} }))
            // Binance final fallback fails as well
            .mockResolvedValueOnce(jsonResponse({}, false));

        const result = await fetchPortfolioPrices({ ZZZ: 1 }, 'XOF');

        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('ZZZ');
        expect(result[0].price).toBe(0);
        expect(result[0].value).toBe(0);
        expect(global.fetch.mock.calls[5][0]).toContain('api.binance.com/api/v3/ticker/24hr?symbol=ZZZXOF');
    });

    it('falls back to Binance when CoinGecko and CryptoCompare fail', async () => {
        global.fetch
            .mockRejectedValueOnce(new Error('CoinGecko rate limit'))
            .mockResolvedValueOnce(jsonResponse({ Response: 'Error', Message: 'Rate limit' }))
            .mockResolvedValueOnce(
                jsonResponse({
                    lastPrice: '61000',
                    priceChangePercent: '1.5',
                    highPrice: '62000',
                    lowPrice: '60000',
                    volume: '1000',
                })
            );

        const result = await fetchPortfolioPrices({ BTC: 1 }, 'USD');

        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(61000);
        expect(result[0].value).toBe(61000);
        expect(global.fetch.mock.calls[2][0]).toContain('api.binance.com/api/v3/ticker/24hr?symbol=BTCUSD');
    });
});
