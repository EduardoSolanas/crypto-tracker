const parseCSVLine = (text) => {
    const result = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            result.push(cell);
            cell = '';
        } else {
            cell += char;
        }
    }
    result.push(cell);
    return result;
};

const extractSymbol = (currencyStr) => {
    if (!currencyStr) return null;
    const str = currencyStr.trim();
    const match = str.match(/\((.*?)\)/);
    if (match) {
        const contentInParens = match[1];
        const contentOutside = str.split('(')[0].trim();
        return (contentOutside.length > 0 && contentOutside.length <= 5)
            ? contentOutside.toUpperCase()
            : contentInParens.toUpperCase();
    }
    return str.split(' ')[0].toUpperCase();
};

export function parseDeltaCsvToTxns(csvText) {
    const lines = csvText.split('\n');
    const headerIndex = lines.findIndex((line) => line.toLowerCase().includes('base amount'));
    if (headerIndex === -1) throw new Error("Invalid CSV format. Missing 'Base amount' header.");

    const headers = parseCSVLine(lines[headerIndex].toLowerCase());
    const getIdx = (t) => headers.findIndex((h) => h.includes(t));

    const idx = {
        baseAmount: getIdx('base amount'),
        currency: headers.findIndex((h) => h.includes('base currency') || h.includes('base currency (name)')),
        way: getIdx('way'),
        date: getIdx('date'),
        quoteAmount: getIdx('quote amount'),
        quoteCurrency: getIdx('quote currency'),
    };

    const txns = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVLine(line);

        const rawAmount = cols[idx.baseAmount];
        const rawCurrency = cols[idx.currency];
        const way = cols[idx.way]?.toUpperCase();
        const dateRaw = cols[idx.date];

        if (!rawAmount || !rawCurrency || !way || !dateRaw) continue;

        const amount = parseFloat(rawAmount);
        if (Number.isNaN(amount)) continue;

        const symbol = extractSymbol(rawCurrency);
        if (!symbol) continue;

        const quoteAmt = parseFloat(cols[idx.quoteAmount]);
        const quoteCur = extractSymbol(cols[idx.quoteCurrency] || '') || null;

        // Keep ISO date for SQLite sorting. If the CSV date is not ISO, JS Date usually still parses it.
        const dateISO = new Date(dateRaw).toISOString();

        txns.push({
            dateISO,
            way,
            symbol,
            amount,
            quoteAmount: Number.isNaN(quoteAmt) ? 0 : quoteAmt,
            quoteCurrency: quoteCur,
        });
    }

    // newest first
    txns.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
    return txns;
}

export function computeHoldingsFromTxns(txns) {
    const holdings = {};
    for (const t of txns) {
        if (!holdings[t.symbol]) holdings[t.symbol] = 0;

        if (['BUY', 'DEPOSIT', 'RECEIVE'].includes(t.way)) holdings[t.symbol] += t.amount;
        if (['SELL', 'WITHDRAW', 'SEND'].includes(t.way)) holdings[t.symbol] -= t.amount;
    }

    // filter tiny dust/negatives
    const active = {};
    for (const [sym, qty] of Object.entries(holdings)) {
        if (qty > 0.0000001) active[sym] = qty;
    }
    return active;
}
