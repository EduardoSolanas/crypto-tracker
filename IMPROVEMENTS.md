# CryptoPortfolio Logic Analysis & Improvements

**Analysis Date:** 2026-01-20  
**Test Status:** ✅ All 71 tests passing  
**Critical Issues:** 4  
**Medium Priority:** 6  
**Low Priority:** 3

---

## 🔴 CRITICAL ISSUES (Must Fix)

### 1. Undefined Cache Constants
**File:** `src/screens/HomeScreen.js:72`  
**Severity:** Critical - ReferenceError  
**Impact:** App crash when smartFetchPortfolio runs

```javascript
// Current (BROKEN):
const threshold = val > 10 ? CACHE_MAJOR : CACHE_MINOR;

// Fix: Add at module level (after imports):
const CACHE_MAJOR = 10 * 60 * 1000;  // 10 minutes
const CACHE_MINOR = 60 * 60 * 1000;  // 1 hour
```

---

### 2. Range Selector Not Functional
**File:** `src/screens/HomeScreen.js:383`  
**Severity:** Critical - Feature broken  
**Impact:** CryptoGraph range selector does nothing

```javascript
// Current (BROKEN):
<CryptoGraph
    onRangeChange={() => { }}  // No-op!
/>

// Fix:
<CryptoGraph
    onRangeChange={(r) => setRange(r)}
/>
```

**Alternative:** Remove `onRangeChange` from CryptoGraph since HomeScreen already has range buttons at line 395-414.

---

### 3. Platform-Specific Sort Behavior
**Files:** `src/db.web.js:63` vs `src/db.native.js:184`  
**Severity:** Critical - Cross-platform inconsistency  
**Impact:** Different behavior on web vs native

```javascript
// db.web.js (DESCENDING):
getAllTransactions() {
    return mem.transactions.sort((a, b) => (a.date_iso > b.date_iso ? 1 : -1));
}

// db.native.js (ASCENDING):
SELECT * FROM transactions ORDER BY date_iso ASC

// Fix db.web.js to match native:
getAllTransactions() {
    return mem.transactions.sort((a, b) => (a.date_iso < b.date_iso ? -1 : 1));
}
```

---

### 4. Missing Currency Dependency
**File:** `src/screens/HomeScreen.js:146`  
**Severity:** High - Stale data  
**Impact:** Graph not recalculated when currency changes

```javascript
// Current (MISSING currency):
useEffect(() => {
    if (portfolio) {
        getAllTransactions().then(txs => {
            computeHistory(txs, portfolio, currency, range);
        });
    }
}, [range, portfolio]);

// Fix:
}, [range, portfolio, currency]);
```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 5. Inconsistent Default Ranges
**Files:** `src/screens/HomeScreen.js:38`, `src/components/Graph.js:16`  
**Impact:** UI confusion, mismatched states

```javascript
// HomeScreen.js:38
const [range, setRange] = useState('1D');

// Graph.js:16
const [range, setRange] = useState('1M');

// Recommendation: Standardize to '1D' everywhere
```

---

### 6. Inefficient Transaction Sorting
**File:** `src/csv.js:89` vs `src/utils/portfolioHistory.js:91`

```javascript
// CSV parser sorts descending (newest first)
txns.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));

// Portfolio history immediately re-sorts ascending
const sortedTxns = [...allTxns].sort((a, b) => {
    const da = new Date(a.dateISO || a.date_iso).getTime();
    const db = new Date(b.dateISO || b.date_iso).getTime();
    return da - db;
});

// Recommendation: Sort ascending in CSV parser to avoid re-sorting
```

---

### 7. Potential Index Out of Bounds
**File:** `src/utils/portfolioHistory.js:171`

```javascript
// Current (UNSAFE):
const startNode = history.find(c => c.time >= rangeStart) || history[0];

// Fix:
const startNode = history.find(c => c.time >= rangeStart) || (history.length > 0 ? history[0] : null);
if (!startNode) return { val: 0, pct: 0 };
```

---

### 8. Stale Data Tolerance Issue
**File:** `src/utils/portfolioHistory.js:129`  
**Impact:** Inaccurate graph for long ranges

```javascript
// Current: Accepts data up to simStep old
if (hist[ptr].time <= tPoint + simStep) {
    val += qty * hist[ptr].close;
}

// For 1Y range with rLimit=365, simStep can be 4+ days due to cap at 100 points
// Line 56-62: multiplier = Math.ceil(365 / 100) = 4
// Line 60: simStep = stepSeconds * 4 = 86400 * 4 = 345600 seconds (4 days)

// Recommendation: Tighten tolerance or document this behavior
if (hist[ptr].time <= tPoint + (simStep / 2)) {  // More strict
```

---

### 9. Missing Import for computePortfolioHistory
**File:** `src/screens/HomeScreen.js:22`

```javascript
// Current imports from db:
import { ... } from '../db';

// But computePortfolioHistory is NOT imported!
// Line 116 uses it without import

// Fix: Add import
import { computePortfolioHistory } from '../utils/portfolioHistory';
```

---

### 10. Duplicate Range Selectors
**File:** `src/screens/HomeScreen.js`  
**Impact:** Confusing UX, duplicate code

- CryptoGraph has internal range selector (lines 5-92 in Graph.js)
- HomeScreen has external range selector (lines 395-414)
- Both control the same state but CryptoGraph's is non-functional

**Recommendation:** Remove one. Keep HomeScreen version since it's wired correctly.

---

## 🟢 LOW PRIORITY IMPROVEMENTS

### 11. Inconsistent Date Handling
**File:** `src/utils/portfolioHistory.js:92-95`

```javascript
// Uses both dateISO and date_iso
const da = new Date(a.dateISO || a.date_iso).getTime();
const db = new Date(b.dateISO || b.date_iso).getTime();

// Standardize field names across codebase
```

---

### 12. Magic Numbers
**File:** `src/utils/portfolioHistory.js`

```javascript
// Line 31: Filter threshold
if (p.value > 10) significantSymbols.add(p.symbol);

// Line 56: Performance cap
if (rLimit > 100) {

// Line 116: Quantity threshold
if (qty <= 0.00000001) continue;

// Recommendation: Define as named constants at module level
const SIGNIFICANT_VALUE_THRESHOLD = 10;
const MAX_GRAPH_POINTS = 100;
const MIN_QUANTITY = 0.00000001;
```

---

### 13. Console.log Statements in Production
**Multiple files:** db.web.js, db.native.js, cryptoCompare.js

```javascript
console.log('[DB][web] initDb (noop)');
console.log('[API] Using Binance Fallback');
console.warn(`[Binance] Error fetching ${sym}:`, e.message);

// Recommendation: Use proper logging library or debug flag
const DEBUG = __DEV__;
if (DEBUG) console.log('[DB][web] initDb (noop)');
```

---

## 📊 PERFORMANCE OBSERVATIONS

### Positive Optimizations
✅ **Smart caching** (HomeScreen.js:50-105) - Excellent differential fetching  
✅ **Performance cap** (portfolioHistory.js:55-62) - Limits to 100 points  
✅ **Significant assets filter** (portfolioHistory.js:27-33) - Skips <$10 assets  
✅ **History pointer optimization** (portfolioHistory.js:99-100) - O(n) not O(n²)  
✅ **Database indexes** (db.native.js:38-45) - Proper SQL indexing

### Potential Optimizations
- Transaction sorting happens twice (CSV + portfolioHistory)
- `Date.parse()` called repeatedly in loops (cache results)
- Web DB stores everything in memory (consider IndexedDB for large portfolios)

---

## 🧪 TEST COVERAGE

**Current Status:**
- ✅ 71/71 tests passing
- ✅ Graph component fully tested
- ✅ CryptoGraph component fully tested
- ✅ Portfolio history logic tested across all ranges
- ✅ Multi-asset portfolio tested
- ✅ Edge cases covered (empty data, single point, etc.)

**Missing Tests:**
- ❌ HomeScreen integration tests
- ❌ Cache logic tests (smartFetchPortfolio)
- ❌ DB operations (native/web)
- ❌ CSV parsing edge cases (malformed dates, negative amounts)
- ❌ Error handling (API failures, network timeouts)

---

## 🔧 RECOMMENDED FIX PRIORITY

1. **Immediate (Deploy Blocker):**
   - Fix #1: Add cache constants
   - Fix #3: Fix web DB sort order
   - Fix #9: Add missing import

2. **Next Sprint:**
   - Fix #2: Wire range selector or remove duplicate
   - Fix #4: Add currency to dependencies
   - Fix #5: Standardize default range
   - Fix #6: Optimize transaction sorting

3. **Future Refactor:**
   - Fix #7-8: Improve portfolio history robustness
   - Fix #10: Remove duplicate UI elements
   - Fix #11-13: Code quality improvements

---

## 📝 NOTES

- All tests pass despite some logic issues (tests don't cover HomeScreen)
- Code quality is generally good with clear separation of concerns
- Database abstraction (web/native) is well-designed
- API fallback logic (CryptoCompare → Binance) is robust
- Performance optimizations show thoughtful design

**Overall Assessment:** 7.5/10
- Solid foundation with excellent test coverage for core logic
- Critical issues are isolated and easy to fix
- Main concern is HomeScreen integration gaps
