const fetch = require('node-fetch');

async function testBinance() {
    // Binance uses 'BTCEUR' format
    const symbols = ['BTC', 'ETH', 'SOL', 'ADA'];
    const currency = 'EUR';

    console.log(`Testing Binance for ${symbols.join(',')} in ${currency}...`);

    for (const sym of symbols) {
        const pair = `${sym}${currency}`;
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.log(`[${pair}] Failed: ${res.status}`);
                continue;
            }
            const json = await res.json();
            console.log(`[${pair}] Success: Price=${json.lastPrice} Change=${json.priceChangePercent}% Vol=${json.volume}`);
        } catch (e) {
            console.log(`[${pair}] Error: ${e.message}`);
        }
    }
}

testBinance();
