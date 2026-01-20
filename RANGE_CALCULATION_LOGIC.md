# Portfolio History Range Calculation Logic

## Overview
This document explains how the portfolio value is calculated across different time ranges (1H, 1D, 1W, 1M, 1Y, ALL).

---

## Time Range Configuration

Each range has specific parameters that determine:
1. **Timeframe**: Granularity of data (minute/hour/day)
2. **Limit**: Number of data points to fetch from API
3. **Step**: Time interval between calculation points

### Range Parameters

| Range | Timeframe | API Limit | Natural Points | Actual Points* | Step Size |
|-------|-----------|-----------|----------------|----------------|-----------|
| 1H    | minute    | 80        | 60             | 60-62          | 60 sec    |
| 1D    | minute    | 1460      | 1440           | 100**          | 60 sec    |
| 1W    | hour      | 188       | 168            | 100**          | 3600 sec  |
| 1M    | day       | 50        | 30             | 30-31          | 86400 sec |
| 1Y    | day       | 385       | 365            | ~100**         | ~345600 sec*** |
| ALL   | day       | 2000      | 1980           | ~100**         | Variable*** |

\* Actual points rendered on the graph  
\*\* Performance capped to ≤100 points for smooth rendering  
\*\*\* Step size increased by multiplier when natural points > 100

---

## Calculation Algorithm

### Step 1: Time Grid Generation

```javascript
// Calculate base step size
let stepSeconds = 86400;  // Default: 1 day
if (rTimeframe === 'hour') stepSeconds = 3600;
if (rTimeframe === 'minute') stepSeconds = 60;

// Apply performance cap (max 100 points)
let simStep = stepSeconds;
let simLimit = rLimit;
if (rLimit > 100) {
    const multiplier = Math.ceil(rLimit / 100);
    simStep = stepSeconds * multiplier;
    simLimit = Math.floor(rLimit / multiplier);
}

// Generate time points grid
const nowSec = Math.floor(Date.now() / 1000);
const gridNow = Math.floor(nowSec / stepSeconds) * stepSeconds;  // Align to grid

let timePoints = [];
for (let i = simLimit; i >= 0; i--) {
    const ts = gridNow - (i * simStep);
    if (ts <= nowSec) timePoints.push(ts);
}
```

**Example (1H range):**
- Current time: `2026-01-20 15:37:42`
- Grid aligned: `2026-01-20 15:37:00` (aligned to minute)
- Time points: 60 points back, each 60 seconds apart
- Result: `[15:37:00, 15:36:00, 15:35:00, ..., 14:38:00]` (reversed)

**Example (1Y range with performance cap):**
- Natural points: 365 days
- Multiplier: `ceil(365 / 100) = 4`
- Actual step: `86400 * 4 = 345600 seconds` (~4 days)
- Result: ~91 points instead of 365

---

### Step 2: Transaction Replay

Transactions are replayed chronologically to determine portfolio composition at each time point:

```javascript
const sortedTxns = [...allTxns].sort((a, b) => 
    new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
);

const quantities = {};  // Current holdings at each point
let txnPointer = 0;

for (const tPoint of timePoints) {
    // Apply all transactions that occurred before this time point
    while (txnPointer < sortedTxns.length) {
        const t = sortedTxns[txnPointer];
        const tTime = new Date(t.dateISO).getTime() / 1000;
        if (tTime > tPoint) break;

        // Update quantities
        if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) {
            quantities[t.symbol] += t.amount;
        }
        if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) {
            quantities[t.symbol] -= t.amount;
        }
        txnPointer++;
    }

    // Calculate portfolio value at this point
    // (see Step 3)
}
```

**Example:**
```
Transactions:
- 2026-01-15 10:00 | BUY  | BTC | 1
- 2026-01-18 14:00 | BUY  | ETH | 10
- 2026-01-19 16:00 | SELL | BTC | 0.5

Time points (1D range):
- 2026-01-19 00:00 → holdings: {BTC: 1, ETH: 10}
- 2026-01-19 12:00 → holdings: {BTC: 1, ETH: 10}
- 2026-01-20 00:00 → holdings: {BTC: 0.5, ETH: 10}  (sell applied)
```

---

### Step 3: Price History Lookup

For each asset at each time point, find the closest historical price:

```javascript
const historyPointers = {};  // Optimized pointer per symbol

for (const tPoint of timePoints) {
    let val = 0;
    
    for (const [sym, qty] of Object.entries(quantities)) {
        if (qty <= 0.00000001) continue;  // Skip dust
        
        const hist = historyMap[sym];
        if (!hist || hist.length === 0) continue;

        // Use optimized pointer (O(n) instead of O(n²))
        let ptr = historyPointers[sym] || 0;
        while (ptr < hist.length - 1 && hist[ptr + 1].time <= tPoint) {
            ptr++;
        }
        historyPointers[sym] = ptr;

        // Use price if within tolerance
        if (hist[ptr].time <= tPoint + simStep) {
            val += qty * hist[ptr].close;
        }
    }
    
    chartData.push({ timestamp: tPoint * 1000, value: val });
}
```

**Price Tolerance:**
- Accepts prices up to `simStep` seconds old
- For 1H range: accepts prices up to 60 sec old
- For 1Y range (with multiplier 4): accepts prices up to 4 days old
- This allows graceful handling of missing data

---

### Step 4: Post-Processing

**4.1 Trim Zero-Value Start (Long Ranges Only)**

For 1M, 1Y, and ALL ranges, remove leading zero-value points:

```javascript
const firstActiveIndex = graphPoints.findIndex(p => p.value > 0.0001);

if (firstActiveIndex > 0 && ['1M', '1Y', 'ALL'].includes(range)) {
    graphPoints = graphPoints.slice(firstActiveIndex);
}
```

**Rationale:** In long-term views, showing months of zero portfolio before first purchase isn't useful.

**4.2 Calculate Delta**

```javascript
const startVal = graphPoints[0].value;
const endVal = graphPoints[graphPoints.length - 1].value;
const diff = endVal - startVal;
const pct = startVal > 0.0001 ? (diff / startVal) * 100 : 0;

delta = { val: diff, pct };
chartColor = diff >= 0 ? '#22c55e' : '#ef4444';
```

**4.3 Calculate Per-Asset Performance**

```javascript
function getAssetPerformance(item, history, range, rangeStart) {
    const { price, quantity, change24h } = item;
    
    // Special case: 1D uses current change24h
    if (range === '1D') {
        const startPrice = price / (1 + (change24h / 100));
        return { val: (price - startPrice) * quantity, pct: change24h };
    }
    
    // Other ranges: look up historical start price
    const startNode = history.find(c => c.time >= rangeStart) || history[0];
    const startPrice = startNode.open || startNode.close;
    
    if (startPrice > 0) {
        const diff = price - startPrice;
        return { val: diff * quantity, pct: (diff / startPrice) * 100 };
    }
    
    return { val: 0, pct: 0 };
}
```

---

## Optimizations

### 1. Performance Cap (Max 100 Points)

**Problem:** Long ranges (1Y = 365 days, ALL = 2000 days) would create too many DOM elements, causing lag.

**Solution:** Dynamically increase step size to cap points at ~100:

```javascript
if (rLimit > 100) {
    const multiplier = Math.ceil(rLimit / 100);
    simStep = stepSeconds * multiplier;
    simLimit = Math.floor(rLimit / multiplier);
}
```

**Trade-off:** Slight loss of granularity on long ranges (e.g., 4-day intervals for 1Y instead of daily).

### 2. Significant Assets Filter

**Problem:** Fetching price history for hundreds of dust assets wastes API calls and time.

**Solution:** Only fetch history for assets worth > $10:

```javascript
const significantSymbols = new Set();
if (currentPortfolio) {
    currentPortfolio.forEach(p => {
        if (p.value > 10) significantSymbols.add(p.symbol);
    });
}
```

**Impact:** Can reduce API calls from 200+ to 10-20 for typical portfolios.

### 3. History Pointer Optimization

**Problem:** Naive nested loop for price lookup is O(n²).

**Solution:** Maintain pointer per symbol that only moves forward:

```javascript
const historyPointers = {};
// In loop:
let ptr = historyPointers[sym] || 0;
while (ptr < hist.length - 1 && hist[ptr + 1].time <= tPoint) {
    ptr++;
}
historyPointers[sym] = ptr;  // Save for next iteration
```

**Complexity:** O(n) instead of O(n²)

### 4. Single-Pass Transaction Replay

Transactions are sorted once, then replayed in a single pass using a pointer.

---

## Edge Cases Handled

### 1. Transaction at Exact Time Point

When a transaction occurs exactly at a grid point, it's included in the calculation for that point and all subsequent points.

### 2. Missing Price Data

If no price data exists for a time point, the algorithm uses the last known price (within tolerance of `simStep`).

### 3. Sparse Price History

API may return gaps. The pointer system gracefully uses the closest available price.

### 4. Empty Portfolio Before First Transaction

Leading zeros are trimmed for long-term views but preserved for short-term views where context matters.

### 5. Multi-Asset with Different Timezones

All calculations use Unix timestamps (UTC), avoiding timezone issues.

### 6. Very Small Quantities (Satoshis)

Quantities below `0.00000001` are considered dust and ignored to prevent floating-point errors.

---

## Testing Coverage

### Test Categories

1. **Time Point Generation** (6 tests)
   - Verifies correct number of points for each range
   - Verifies correct spacing between points
   - Verifies API call parameters

2. **Value Calculation Accuracy** (3 tests)
   - Verifies portfolio value at specific time points
   - Tests mid-range transactions
   - Tests SELL transactions reducing value

3. **Multi-Asset Calculations** (2 tests)
   - Tests summing multiple asset values
   - Tests assets with different price movements

4. **Edge Cases** (3 tests)
   - Missing price data
   - Transaction at exact time point
   - Very small quantities

5. **Performance Cap** (1 test)
   - Verifies point reduction for long ranges

**Total: 86 tests across 4 test suites**

---

## Example Calculations

### Example 1: Simple 1D Range

**Portfolio:**
- 1 BTC bought 48 hours ago at $48,000
- Current price: $52,000

**Calculation:**
1. Generate 1440 minute-level time points (performance cap → 100 points)
2. Fetch BTC price history (1440 minutes)
3. For each point:
   - Quantity = 1 BTC (constant, no mid-range transactions)
   - Price = look up from history
   - Value = 1 × price
4. Result:
   - Start value: ~$48,000
   - End value: ~$52,000
   - Delta: +$4,000 (+8.33%)
   - Color: Green

### Example 2: Multi-Asset with Mid-Range Transaction

**Portfolio:**
- 1 BTC bought 7 days ago at $45,000
- 10 ETH bought 3 days ago at $2,800
- Current: BTC = $50,000, ETH = $3,000

**Calculation (1W range):**
1. Generate 168 hourly time points
2. Fetch history for BTC and ETH
3. For each point before day 4:
   - Value = 1 BTC × price
4. For each point after day 4:
   - Value = (1 BTC × btcPrice) + (10 ETH × ethPrice)
5. Result:
   - Start: ~$45,000 (BTC only)
   - Mid (day 4): ~$47,000 + $28,000 = $75,000
   - End: $50,000 + $30,000 = $80,000
   - Delta: +$35,000 (+77.8%)

---

## Known Limitations

1. **Price Tolerance:** Long ranges may use prices up to 4 days old due to performance cap multiplier
2. **Granularity Loss:** 1Y and ALL views sacrifice some detail for performance
3. **API Rate Limits:** CryptoCompare has rate limits; app falls back to Binance
4. **Historical Accuracy:** API historical data may have gaps or inaccuracies
5. **No Intraday Fees:** Transaction fees not included in calculations

---

## Future Enhancements

1. **Adaptive Point Generation:** Use more points where portfolio changes occur
2. **Local Price Caching:** Cache historical prices in DB to reduce API calls
3. **Fee Tracking:** Include transaction fees in value calculations
4. **Fiat Conversion:** Support live fiat exchange rates
5. **Custom Date Ranges:** Allow user to select arbitrary date ranges

---

## References

- Source: `src/utils/portfolioHistory.js`
- Tests: `src/utils/__tests__/rangeCalculations.test.js`
- Tests: `src/utils/__tests__/portfolioHistory.test.js`
