function normalizeTimestamp(item, fallbackIndex) {
    const ts = item?.timestamp;
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    return fallbackIndex;
}

/**
 * Largest Triangle Three Buckets (LTTB) downsampling algorithm.
 * Downsamples line points while preserving visual peaks, troughs, and overall trend
 * without introducing artificial oscillation or sawteeth.
 */
export function downsampleLineData(points, maxPoints) {
    if (!Array.isArray(points)) return [];
    if (!Number.isFinite(maxPoints) || maxPoints < 3 || points.length <= maxPoints) {
        return points;
    }

    const dataLength = points.length;
    const sampled = [points[0]];

    const bucketSize = (dataLength - 2) / (maxPoints - 2);
    let aIndex = 0; // Previously selected point index

    for (let i = 0; i < maxPoints - 2; i++) {
        // Range for current bucket
        const bucketStart = Math.floor(i * bucketSize) + 1;
        const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, dataLength - 1);

        // Range for next bucket to compute average
        const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
        const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, dataLength);

        let avgX = 0;
        let avgY = 0;
        let nextBucketCount = 0;

        for (let j = nextBucketStart; j < nextBucketEnd; j++) {
            avgX += normalizeTimestamp(points[j], j);
            avgY += (points[j]?.value ?? 0);
            nextBucketCount++;
        }

        if (nextBucketCount > 0) {
            avgX /= nextBucketCount;
            avgY /= nextBucketCount;
        } else {
            const lastPt = points[dataLength - 1];
            avgX = normalizeTimestamp(lastPt, dataLength - 1);
            avgY = (lastPt?.value ?? 0);
        }

        // Point A (previously selected point)
        const pointA = points[aIndex];
        const aX = normalizeTimestamp(pointA, aIndex);
        const aY = (pointA?.value ?? 0);

        // Find point in current bucket with largest triangle area
        let maxArea = -1;
        let bestIndex = bucketStart;

        for (let j = bucketStart; j < bucketEnd; j++) {
            const currentPt = points[j];
            const cX = normalizeTimestamp(currentPt, j);
            const cY = (currentPt?.value ?? 0);

            const area = Math.abs(
                (aX - avgX) * (cY - aY) - (aX - cX) * (avgY - aY)
            ) * 0.5;

            if (area > maxArea) {
                maxArea = area;
                bestIndex = j;
            }
        }

        sampled.push(points[bestIndex]);
        aIndex = bestIndex;
    }

    sampled.push(points[dataLength - 1]);
    return sampled;
}

/**
 * Smooth line points using a 3-point weighted average filter [0.25, 0.5, 0.25].
 * Preserves the exact start and end values so deltas and boundary values remain exact.
 */
export function smoothLineData(points) {
    if (!Array.isArray(points) || points.length <= 4) return points || [];
    const result = [{ ...points[0] }];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1]?.value ?? 0;
        const curr = points[i]?.value ?? 0;
        const next = points[i + 1]?.value ?? 0;
        const smoothedVal = 0.25 * prev + 0.5 * curr + 0.25 * next;
        result.push({ ...points[i], value: smoothedVal });
    }
    result.push({ ...points[points.length - 1] });
    return result;
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
