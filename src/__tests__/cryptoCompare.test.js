import { fetchPortfolioPrices } from '../cryptoCompare';

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
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('uses direct BTC/target quote when available', async () => {
        global.fetch.mockResolvedValueOnce(
            jsonResponse({
                RAW: {
                    BTC: {
                        EUR: {
                            PRICE: 60000,
                            CHANGEPCT24HOUR: 2.5,
                            HIGH24HOUR: 61000,
                            LOW24HOUR: 59000,
                            MKTCAP: 1000000,
                            VOLUME24HOURTO: 500000,
                            IMAGEURL: '/media/btc.png',
                        },
                    },
                },
            })
        );

        const result = await fetchPortfolioPrices({ BTC: 2 }, 'EUR');

        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(60000);
        expect(result[0].value).toBe(120000);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toContain('pricemultifull');
        expect(global.fetch.mock.calls[0][0]).toContain('fsyms=BTC');
        expect(global.fetch.mock.calls[0][0]).toContain('tsyms=EUR');
    });

    it('falls back to BTC/USD * USD/target when direct pair is missing', async () => {
        global.fetch
            .mockResolvedValueOnce(jsonResponse({ RAW: {} }))
            .mockResolvedValueOnce(
                jsonResponse({
                    RAW: {
                        BTC: {
                            USD: {
                                PRICE: 60000,
                                CHANGEPCT24HOUR: 1,
                                HIGH24HOUR: 60500,
                                LOW24HOUR: 59000,
                                MKTCAP: 1000000,
                                VOLUME24HOURTO: 200000,
                            },
                        },
                    },
                })
            )
            .mockResolvedValueOnce(jsonResponse({ USD: { BRL: 5 } }));

        const result = await fetchPortfolioPrices({ BTC: 1 }, 'BRL');

        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(300000);
        expect(result[0].value).toBe(300000);
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(global.fetch.mock.calls[2][0]).toContain('pricemulti?fsyms=USD&tsyms=BRL');
    });

    it('uses exchangerate.host when USD/target is unavailable on CryptoCompare', async () => {
        global.fetch
            .mockResolvedValueOnce(jsonResponse({ RAW: {} }))
            .mockResolvedValueOnce(
                jsonResponse({
                    RAW: {
                        BTC: {
                            USD: {
                                PRICE: 60000,
                                CHANGEPCT24HOUR: 0,
                                HIGH24HOUR: 60000,
                                LOW24HOUR: 59000,
                                MKTCAP: 0,
                                VOLUME24HOURTO: 0,
                            },
                        },
                    },
                })
            )
            .mockResolvedValueOnce(jsonResponse({}))
            .mockResolvedValueOnce(jsonResponse({ rates: { JPY: 150 } }));

        const result = await fetchPortfolioPrices({ BTC: 1 }, 'JPY');

        expect(result[0].price).toBe(9000000);
        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(global.fetch.mock.calls[3][0]).toContain('api.exchangerate.host/latest?base=USD&symbols=JPY');
    });

    it('returns zeroed row when neither direct nor cross-rate pricing is available', async () => {
        global.fetch
            .mockResolvedValueOnce(jsonResponse({ RAW: {} }))
            .mockResolvedValueOnce(jsonResponse({ RAW: {} }))
            .mockResolvedValueOnce(jsonResponse({}))
            .mockResolvedValueOnce(jsonResponse({ rates: {} }));

        const result = await fetchPortfolioPrices({ BTC: 1 }, 'XOF');

        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('BTC');
        expect(result[0].price).toBe(0);
        expect(result[0].value).toBe(0);
    });

    it('falls back to Binance when CryptoCompare returns API error', async () => {
        global.fetch
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
        expect(global.fetch.mock.calls[1][0]).toContain('api.binance.com/api/v3/ticker/24hr?symbol=BTCUSD');
    });
});
