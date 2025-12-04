/**
 * Pattern Matcher Worker
 * Handles heavy pattern matching computations in a background thread.
 */

// Import the full similarity calculator logic
try {
    importScripts('segment-similarity-calculator.js');
} catch (e) {
    console.error('[Worker] Failed to import scripts:', e);
}

class PatternMatcherWorker {
    constructor() {
        this.trainingDataCache = [];
        this.similarityCalculator = new SegmentSimilarityCalculator();
    }

    updateData(data) {
        this.trainingDataCache = data;
        self.postMessage({
            type: 'DATA_UPDATED',
            count: this.trainingDataCache.length
        });
    }

    predict(currentSituation, timeframe, minSimilarity, maxDataCount) {
        if (!this.trainingDataCache || this.trainingDataCache.length === 0) {
            return {
                prediction: 'INSUFFICIENT_DATA',
                confidence: 0,
                sampleSize: 0,
                upRate: 0,
                downRate: 0,
                topPatterns: []
            };
        }

        // Filter data if maxDataCount is specified
        let targetData = this.trainingDataCache;
        if (maxDataCount && maxDataCount > 0) {
            targetData = targetData.slice(-maxDataCount);
        }

        // Filter data that has results for the target timeframe
        const validData = targetData.filter(d =>
            d[`result${timeframe}s`] && !d[`result${timeframe}s`].pending
        );

        if (validData.length < 10) {
            return {
                prediction: 'INSUFFICIENT_DATA',
                confidence: 0,
                sampleSize: 0,
                upRate: 0,
                downRate: 0,
                topPatterns: []
            };
        }

        // Calculate similarity for all valid past patterns
        const matches = [];
        const startTime = Date.now();

        for (const past of validData) {
            // Skip if missing segment data
            if (!past[`priceSegments${timeframe}s`] || !currentSituation[`priceSegments${timeframe}s`]) {
                continue;
            }

            const similarity = this.similarityCalculator.calculateSimilarity(
                currentSituation,
                past,
                timeframe
            );

            if (similarity >= minSimilarity) {
                matches.push({
                    similarity: similarity,
                    result: past[`result${timeframe}s`],
                    timestamp: past.timestamp
                });
            }
        }

        // Sort by similarity (descending)
        matches.sort((a, b) => b.similarity - a.similarity);

        // Take top matches (e.g., top 10 or all above threshold)
        // For prediction, we use all matches above threshold but weight them by similarity
        const topMatches = matches; // matches are already filtered by minSimilarity

        if (topMatches.length === 0) {
            return {
                prediction: 'NEUTRAL',
                confidence: 0,
                sampleSize: 0,
                upRate: 0,
                downRate: 0,
                topPatterns: []
            };
        }

        // Calculate prediction stats
        let upWeight = 0;
        let downWeight = 0;
        let totalWeight = 0;

        topMatches.forEach(m => {
            const weight = Math.pow(m.similarity / 100, 2); // Square the similarity to give more weight to high matches
            if (m.result.direction === 'UP') {
                upWeight += weight;
            } else if (m.result.direction === 'DOWN') {
                downWeight += weight;
            }
            totalWeight += weight;
        });

        const upRate = totalWeight > 0 ? (upWeight / totalWeight) * 100 : 0;
        const downRate = totalWeight > 0 ? (downWeight / totalWeight) * 100 : 0;

        // Determine prediction
        let prediction = 'NEUTRAL';
        let confidence = 0;

        if (upRate > 60) {
            prediction = 'HIGH';
            confidence = upRate;
        } else if (downRate > 60) {
            prediction = 'LOW';
            confidence = downRate;
        } else {
            confidence = Math.max(upRate, downRate);
        }

        // Return result
        return {
            prediction: prediction,
            confidence: Math.round(confidence),
            sampleSize: topMatches.length,
            upRate: Math.round(upRate),
            downRate: Math.round(downRate),
            topPatterns: topMatches.slice(0, 5) // Return top 5 for debugging/display
        };
    }
}

// Initialize worker
const worker = new PatternMatcherWorker();

// Message handler
self.onmessage = function (e) {
    const { type, payload } = e.data;

    try {
        switch (type) {
            case 'UPDATE_DATA':
                worker.updateData(payload);
                break;

            case 'PREDICT':
                // threshold と minSimilarity の両方に対応（送信側で名前が異なる場合があるため）
                const { currentSituation, timeframe, threshold, minSimilarity, maxDataCount } = payload;
                const similarityThreshold = threshold ?? minSimilarity ?? 50; // デフォルト50%
                const result = worker.predict(currentSituation, timeframe, similarityThreshold, maxDataCount);
                self.postMessage({
                    type: 'PREDICTION_RESULT',
                    result: result
                });
                break;

            default:
                console.warn('[Worker] Unknown message type:', type);
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            message: error.message,
            stack: error.stack
        });
    }
};
