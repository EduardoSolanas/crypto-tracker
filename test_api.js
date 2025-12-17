const fetch = require('node-fetch'); // Ensure node-fetch is available or use built-in fetch in Node 18+

async function testApi() {
    const symbols = ['BTC', 'ETH'];
    const currency = 'EUR';
    const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbols.join(',')}&tsyms=${currency}`;

    console.log('Testing URL:', url);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error('HTTP Error:', res.status, res.statusText);
            const text = await res.text();
            console.error('Response body:', text);
            return;
        }

        const json = await res.json();
        console.log('API Response Status:', json.Response);
        console.log('API Response Message:', json.Message);

        if (json.RAW) {
            console.log('BTC Price:', json.RAW.BTC.EUR.PRICE);
            console.log('ETH Price:', json.RAW.ETH.EUR.PRICE);
            console.log('SUCCESS: API is reachable and returning data.');
        } else {
            console.log('FAILURE: JSON returned but no RAW data:', JSON.stringify(json, null, 2));
        }
    } catch (e) {
        console.error('Network/Fetch Error:', e.message);
    }
}

testApi();
