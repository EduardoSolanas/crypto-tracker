// Manual test to verify total portfolio profit bug
// Run with: node test_total_profit_bug.js

const { computePortfolioHistory } = require('./src/utils/portfolioHistory');

async function testBug() {
    const nowSec = Math.floor(Date.now() / 1000);

    // User bought BTC 60 days ago at $30k
    const txns = [{
        dateISO: new Date((nowSec - 60 * 86400) * 1000).toISOString(),
        symbol: 'BTC',
        amount: 1,
        way: 'BUY'
    }];

    // Mock fetchCandles
    const mockFetchCandles = async () => {
        return Array.from({ length: 65 }, (_, i) => {
            const daysAgo = 65 - i;
            const time = nowSec - daysAgo * 86400;
            let price;
            if (daysAgo >= 60) price = 30000;  // Purchase price
            else if (daysAgo >= 30) price = 40000;  // 1M ago
            else price = 50000;  // Recent
            return { time, open: price, close: price };
        });
    };

    const portfolio = [{
        symbol: 'BTC',
        value: 50000,
        quantity: 1,
        price: 50000,
        change24h: 2
    }];

    const result = await computePortfolioHistory({
        allTxns: txns,
        currentPortfolio: portfolio,
        currency: 'USD',
        range: '1M',
        fetchCandles: mockFetchCandles
    });

    console.log('=== RESULT ===');
    console.log('Delta value:', result.delta.val);
    console.log('Delta pct:', result.delta.pct);
    console.log('Chart data points:', result.chartData.length);
    console.log('First point value:', result.chartData[0]?.value);
    console.log('Last point value:', result.chartData[result.chartData.length - 1]?.value);

    console.log('\n=== EXPECTED ===');
    console.log('Delta value: ~10000 (50k - 40k)');
    console.log('Delta pct: ~25%');

    console.log('\n=== BUG WOULD SHOW ===');
    console.log('Delta value: ~20000 (50k - 30k)');
    console.log('Delta pct: ~66.67%');
}

testBug().catch(console.error);
