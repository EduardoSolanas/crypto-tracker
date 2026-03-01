const parseCSVLine = (text, delimiter = ',') => {
    const result = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === delimiter && !inQuotes) {
            result.push(cell.trim());
            cell = '';
        } else {
            cell += char;
        }
    }
    result.push(cell.trim());
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

function parseDateToUtcIso(dateRaw) {
    const raw = String(dateRaw || '').trim();
    if (!raw) return null;

    const dateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
    }

    const naiveDateTime = raw.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/
    );
    if (naiveDateTime) {
        const year = Number(naiveDateTime[1]);
        const month = Number(naiveDateTime[2]);
        const day = Number(naiveDateTime[3]);
        const hour = Number(naiveDateTime[4]);
        const minute = Number(naiveDateTime[5]);
        const second = Number(naiveDateTime[6] || 0);
        return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }

    return null;
}

const SKIP_REASONS = {
    EMPTY: 'empty_row',
    MISSING_REQUIRED: 'missing_required_fields',
    INVALID_AMOUNT: 'invalid_amount',
    INVALID_DATE: 'invalid_date',
    INVALID_SYMBOL: 'invalid_symbol',
};

export function parseDeltaCsvWithReport(csvText) {
    const report = {
        imported: 0,
        skipped: 0,
        reasons: {
            [SKIP_REASONS.EMPTY]: 0,
            [SKIP_REASONS.MISSING_REQUIRED]: 0,
            [SKIP_REASONS.INVALID_AMOUNT]: 0,
            [SKIP_REASONS.INVALID_DATE]: 0,
            [SKIP_REASONS.INVALID_SYMBOL]: 0,
        },
    };

    // Remove BOM if present
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
    }
    
    // Normalize line endings
    csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Detect delimiter (comma or tab)
    const firstLine = csvText.split('\n')[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    
    const lines = csvText.split('\n');
    
    // Try to find header row - look for common column names
    // Skip first row if it looks like column labels (A, B, C, etc.)
    let startRow = 0;
    if (lines[0] && (lines[0].match(/^[A-Z]\t[A-Z]\t/) || lines[0].match(/^[A-Z],[A-Z],/))) {
        startRow = 1; // Skip Excel column header row
    }
    
    const headerIndex = lines.findIndex((line, idx) => {
        if (idx < startRow) return false;
        const lower = line.toLowerCase();
        return lower.includes('base amount') || 
               lower.includes('amount') && lower.includes('date') ||
               lower.includes('way') && lower.includes('currency');
    });
    
    if (headerIndex === -1) {
        // Show first few lines to help debug
        const preview = lines.slice(0, 5).join('\n');
        throw new Error(`Invalid CSV format. Could not find header row.\n\nFile preview:\n${preview}`);
    }

    const headers = parseCSVLine(lines[headerIndex].toLowerCase(), delimiter);
    const getIdx = (t) => headers.findIndex((h) => h.includes(t));

    // More flexible column matching
    const idx = {
        baseAmount: getIdx('base amount') >= 0 ? getIdx('base amount') : getIdx('amount'),
        currency: headers.findIndex((h) => 
            h.includes('base currency') || 
            h.includes('base currency (name)') || 
            h.includes('currency (name)') ||
            (h.includes('currency') && !h.includes('quote') && !h.includes('fee'))
        ),
        way: getIdx('way') >= 0 ? getIdx('way') : getIdx('type'),
        date: getIdx('date'),
        quoteAmount: getIdx('quote amount'),
        quoteCurrency: headers.findIndex((h) => 
            h.includes('quote currency') || 
            h.includes('quote currency (name)')
        ),
    };
    
    // Validate required fields
    if (idx.baseAmount === -1 || idx.currency === -1 || idx.way === -1 || idx.date === -1) {
        const found = headers.join(', ');
        const missing = [];
        if (idx.baseAmount === -1) missing.push('base amount');
        if (idx.currency === -1) missing.push('base currency');
        if (idx.way === -1) missing.push('way/type');
        if (idx.date === -1) missing.push('date');
        throw new Error(`Missing required columns: ${missing.join(', ')}\n\nFound columns: ${found}`);
    }

    const txns = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            report.skipped += 1;
            report.reasons[SKIP_REASONS.EMPTY] += 1;
            continue;
        }

        const cols = parseCSVLine(line, delimiter);

        const rawAmount = cols[idx.baseAmount];
        const rawCurrency = cols[idx.currency];
        const way = cols[idx.way]?.toUpperCase();
        const dateRaw = cols[idx.date];

        if (!rawAmount || !rawCurrency || !way || !dateRaw) {
            report.skipped += 1;
            report.reasons[SKIP_REASONS.MISSING_REQUIRED] += 1;
            continue;
        }

        const amount = parseFloat(rawAmount);
        if (Number.isNaN(amount)) {
            report.skipped += 1;
            report.reasons[SKIP_REASONS.INVALID_AMOUNT] += 1;
            continue;
        }

        const symbol = extractSymbol(rawCurrency);
        if (!symbol) {
            report.skipped += 1;
            report.reasons[SKIP_REASONS.INVALID_SYMBOL] += 1;
            continue;
        }

        const quoteAmt = parseFloat(cols[idx.quoteAmount]);
        const quoteCur = extractSymbol(cols[idx.quoteCurrency] || '') || null;

        const dateISO = parseDateToUtcIso(dateRaw);
        if (!dateISO) {
            report.skipped += 1;
            report.reasons[SKIP_REASONS.INVALID_DATE] += 1;
            continue;
        }

        txns.push({
            dateISO,
            way,
            symbol,
            amount,
            quoteAmount: Number.isNaN(quoteAmt) ? 0 : quoteAmt,
            quoteCurrency: quoteCur,
        });
        report.imported += 1;
    }

    // newest first
    txns.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
    return { txns, report };
}

export function parseDeltaCsvToTxns(csvText) {
    return parseDeltaCsvWithReport(csvText).txns;
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

/**
 * Export transactions to CSV in Delta format
 * @param {Array} transactions - Array of transaction objects from DB
 * @returns {string} CSV formatted string
 */
export function exportTransactionsToCSV(transactions) {
    // CSV Header matching Delta format
    const headers = [
        'Date',
        'Way',
        'Base amount',
        'Base currency (name)',
        'Quote amount',
        'Quote currency (name)',
        'Fee amount',
        'Fee currency (name)',
        'Notes'
    ];

    const rows = [headers.join(',')];

    for (const tx of transactions) {
        // Convert ISO date to readable format
        const date = new Date(tx.date_iso || tx.dateISO);
        const dateStr = date.toISOString();

        // Build CSV row
        const row = [
            dateStr,
            tx.way || 'BUY',
            tx.amount || 0,
            tx.symbol || '',
            tx.quote_amount || tx.quoteAmount || 0,
            tx.quote_currency || tx.quoteCurrency || 'EUR',
            tx.fees || 0,
            tx.fee_currency || tx.feeCurrency || 'EUR',
            tx.notes || ''
        ];

        // Escape values that contain commas
        const escapedRow = row.map(val => {
            const str = String(val);
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        });

        rows.push(escapedRow.join(','));
    }

    return rows.join('\n');
}
