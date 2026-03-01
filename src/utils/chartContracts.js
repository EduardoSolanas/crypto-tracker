/**
 * @typedef {{ timestamp: number, value: number }} LinePoint
 * @typedef {{ timestamp: number, open: number, high: number, low: number, close: number }} CandlePoint
 */

export function toLinePoint(timestamp, value) {
    return {
        timestamp: Number(timestamp || 0),
        value: Number(value || 0),
    };
}

export function toCandlePoint(candle) {
    return {
        timestamp: Number(candle?.time || 0) * 1000,
        open: Number(candle?.open || 0),
        high: Number(candle?.high || 0),
        low: Number(candle?.low || 0),
        close: Number(candle?.close || 0),
    };
}

export function mapCandlesToPoints(candles) {
    return (candles || []).map(toCandlePoint);
}
