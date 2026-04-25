const BUY_WAYS = new Set(['BUY', 'DEPOSIT', 'RECEIVE']);
const SELL_WAYS = new Set(['SELL', 'WITHDRAW', 'SEND']);
const EPSILON = 1e-8;

export function sortTransactionsAsc(transactions) {
    return [...(transactions || [])].sort((a, b) => {
        const aTime = new Date(a.dateISO || a.date_iso || 0).getTime();
        const bTime = new Date(b.dateISO || b.date_iso || 0).getTime();
        return aTime - bTime;
    });
}

function normalizeQuoteAmount(quoteAmount, quoteCurrency, targetCurrency, fxRates) {
    const amount = Number(quoteAmount || 0);
    if (amount <= 0) return 0;

    const from = String(quoteCurrency || targetCurrency || '').toUpperCase();
    const to = String(targetCurrency || '').toUpperCase();
    if (!to || !from || from === to) {
        return amount;
    }

    const rate = Number(fxRates?.[from]);
    if (!Number.isFinite(rate) || rate <= 0) {
        return amount;
    }
    return amount * rate;
}

export function computeCoinTransactionStats(
    transactions,
    currentPrice = 0,
    currentQty = 0,
    options = {}
) {
    const { targetCurrency = null, fxRates = {} } = options;
    const txs = sortTransactionsAsc(transactions);
    let buyTotalCost = 0;
    let buyTotalQty = 0;
    // Only units where we recorded a cost — used so free coins (airdrops/deposits with
    // no quote_amount) don't drag down the displayed average buy price.
    let buyPricedQty = 0;
    let sellTotalValue = 0;
    let sellTotalQty = 0;
    let realizedGains = 0;
    let runningQty = 0;
    let runningCostBasis = 0;

    for (const t of txs) {
        const way = String(t.way || '').toUpperCase();
        const amount = Number(t.amount || 0);
        const rawQuoteAmount = Number(t.quote_amount ?? t.quoteAmount ?? 0);
        const quoteCurrency = t.quote_currency ?? t.quoteCurrency ?? null;
        const quoteAmount = normalizeQuoteAmount(
            rawQuoteAmount,
            quoteCurrency,
            targetCurrency,
            fxRates
        );

        if (amount <= 0) continue;

        if (BUY_WAYS.has(way)) {
            buyTotalQty += amount;
            if (quoteAmount > 0) {
                buyTotalCost += quoteAmount;
                buyPricedQty += amount;
            }

            runningQty += amount;
            runningCostBasis += quoteAmount > 0 ? quoteAmount : 0;
            continue;
        }

        if (SELL_WAYS.has(way)) {
            const proceeds = quoteAmount > 0 ? quoteAmount : 0;
            sellTotalQty += amount;
            sellTotalValue += proceeds;

            // Weighted-average cost basis over currently held quantity.
            const avgCost = runningQty > EPSILON ? runningCostBasis / runningQty : 0;
            // Guard against over-sells so we do not create artificial realized gains.
            const qtyMatched = Math.min(amount, Math.max(0, runningQty));
            const costRemoved = avgCost * qtyMatched;
            const proceedsMatched = amount > EPSILON ? proceeds * (qtyMatched / amount) : 0;
            realizedGains += proceedsMatched - costRemoved;

            runningQty -= qtyMatched;
            runningCostBasis -= costRemoved;
            if (runningQty < EPSILON) {
                runningQty = 0;
                runningCostBasis = 0;
            }
        }
    }

    const marketValue = Number(currentPrice || 0) * Number(currentQty || 0);
    const totalGains = realizedGains + marketValue - runningCostBasis;

    return {
        avgBuy: buyPricedQty > EPSILON ? buyTotalCost / buyPricedQty : 0,
        avgSell: sellTotalQty > EPSILON ? sellTotalValue / sellTotalQty : 0,
        totalCostBasis: runningCostBasis,
        buyTotalCost,
        realizedGains,
        totalGains,
        count: txs.length,
    };
}
