function normalizeTimestamp(item, fallbackIndex) {
    const ts = item?.timestamp;
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    return fallbackIndex;
}

/**
 * Downsample line points while preserving local min/max shape.
 */
export function downsampleLineData(points, maxPoints) {
    if (!Array.isArray(points)) return [];
    if (!Number.isFinite(maxPoints) || maxPoints < 3 || points.length <= maxPoints) {
        return points;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const middle = points.slice(1, -1);
    if (middle.length === 0) return points;

    const targetMiddlePoints = Math.max(1, maxPoints - 2);
    const bucketSize = Math.ceil(middle.length / Math.ceil(targetMiddlePoints / 2));
    const sampled = [first];

    for (let i = 0; i < middle.length; i += bucketSize) {
        const bucket = middle.slice(i, i + bucketSize);
        if (!bucket.length) continue;

        let minPoint = bucket[0];
        let maxPoint = bucket[0];
        for (const p of bucket) {
            if (p.value < minPoint.value) minPoint = p;
            if (p.value > maxPoint.value) maxPoint = p;
        }

        if (minPoint === maxPoint) {
            sampled.push(minPoint);
            continue;
        }

        const minTs = normalizeTimestamp(minPoint, i);
        const maxTs = normalizeTimestamp(maxPoint, i);
        if (minTs <= maxTs) {
            sampled.push(minPoint, maxPoint);
        } else {
            sampled.push(maxPoint, minPoint);
        }
    }

    sampled.push(last);
    return sampled.length > maxPoints ? sampled.slice(0, maxPoints) : sampled;
}

/**
 * Downsample candlestick data by bucket, keeping first + last and
 * selecting representative candles in-between.
 */
export function downsampleCandleData(points, maxPoints) {
    if (!Array.isArray(points)) return [];
    if (!Number.isFinite(maxPoints) || maxPoints < 3 || points.length <= maxPoints) {
        return points;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const middle = points.slice(1, -1);
    if (!middle.length) return points;

    const targetMiddlePoints = Math.max(1, maxPoints - 2);
    const bucketSize = Math.ceil(middle.length / targetMiddlePoints);
    const sampled = [first];

    for (let i = 0; i < middle.length; i += bucketSize) {
        const bucket = middle.slice(i, i + bucketSize);
        if (!bucket.length) continue;

        // Pick the candle with widest range in the bucket.
        let selected = bucket[0];
        let maxRange = (selected.high ?? 0) - (selected.low ?? 0);

        for (const candle of bucket) {
            const range = (candle.high ?? 0) - (candle.low ?? 0);
            if (range > maxRange) {
                maxRange = range;
                selected = candle;
            }
        }
        sampled.push(selected);
    }

    sampled.push(last);
    return sampled.length > maxPoints ? sampled.slice(0, maxPoints) : sampled;
}
