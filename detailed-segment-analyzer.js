/**
 * 詳細セグメント分析システム
 * 価格・テクニカル指標のパターンを細かく分析して類似度を計算
 */

class DetailedSegmentAnalyzer {
  constructor() {
    // 各判定時間のセグメント設定（全て6セグメントに統一）
    this.segmentConfigs = {
      15:  { dataRange: 60,  segmentDuration: 10, segmentCount: 6 },  // 15秒判定: 60秒を10秒×6
      30:  { dataRange: 90,  segmentDuration: 15, segmentCount: 6 },  // 30秒判定: 90秒を15秒×6
      60:  { dataRange: 120, segmentDuration: 20, segmentCount: 6 },  // 60秒判定: 120秒を20秒×6
      180: { dataRange: 240, segmentDuration: 40, segmentCount: 6 },  // 3分判定: 240秒を40秒×6
      300: { dataRange: 300, segmentDuration: 50, segmentCount: 6 }   // 5分判定: 300秒を50秒×6
    };

    // 動的閾値計算用のキャッシュ
    this.thresholdCache = {
      value: null,           // 計算済みの閾値
      lastCalculated: 0,     // 最終計算時刻
      cacheValidityMs: 60000 // キャッシュ有効期限（1分）
    };

    // 統計ベース閾値のパラメータ
    this.thresholdParams = {
      sampleSize: 100,           // 過去何件のデータで統計を取るか
      stdDevMultiplier: 0.25,    // 標準偏差の何倍を閾値とするか（ノイズレベル）
      minThreshold: 0.001,       // 最小閾値（0.001% = 極小の動き）
      maxThreshold: 0.1,         // 最大閾値（0.1% = 大きな動き）
      atrWeight: 0.6,            // ATRベース閾値の重み
      statsWeight: 0.4           // 統計ベース閾値の重み
    };
  }

  /**
   * 動的閾値を計算（ATRベース + 統計ベース）
   */
  calculateDynamicThreshold(priceHistory, atrPercent) {
    const now = Date.now();

    // キャッシュが有効ならそれを返す
    if (this.thresholdCache.value !== null &&
        (now - this.thresholdCache.lastCalculated) < this.thresholdCache.cacheValidityMs) {
      return this.thresholdCache.value;
    }

    let threshold = this.thresholdParams.minThreshold;

    // === 方法1: ATRベースの閾値 ===
    let atrBasedThreshold = this.thresholdParams.minThreshold;
    if (atrPercent && atrPercent > 0) {
      // ATRの10%をノイズレベルとする
      atrBasedThreshold = atrPercent * 0.1;
      atrBasedThreshold = Math.max(
        this.thresholdParams.minThreshold,
        Math.min(this.thresholdParams.maxThreshold, atrBasedThreshold)
      );
    }

    // === 方法2: 統計ベースの閾値 ===
    let statsBasedThreshold = this.thresholdParams.minThreshold;
    if (priceHistory && priceHistory.length >= 10) {
      const sampleSize = Math.min(this.thresholdParams.sampleSize, priceHistory.length - 1);
      const recentPrices = priceHistory.slice(-sampleSize - 1);

      // 1秒ごとの変化率を計算
      const changes = [];
      for (let i = 1; i < recentPrices.length; i++) {
        const changePercent = Math.abs(
          (recentPrices[i].price - recentPrices[i-1].price) / recentPrices[i-1].price * 100
        );
        changes.push(changePercent);
      }

      if (changes.length > 0) {
        // 平均と標準偏差を計算
        const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
        const variance = changes.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / changes.length;
        const stdDev = Math.sqrt(variance);

        // 標準偏差の25%をノイズレベルとする
        statsBasedThreshold = stdDev * this.thresholdParams.stdDevMultiplier;
        statsBasedThreshold = Math.max(
          this.thresholdParams.minThreshold,
          Math.min(this.thresholdParams.maxThreshold, statsBasedThreshold)
        );
      }
    }

    // === 方法1と方法2を加重平均で統合 ===
    threshold = (
      atrBasedThreshold * this.thresholdParams.atrWeight +
      statsBasedThreshold * this.thresholdParams.statsWeight
    );

    // 最終的な範囲チェック
    threshold = Math.max(
      this.thresholdParams.minThreshold,
      Math.min(this.thresholdParams.maxThreshold, threshold)
    );

    // キャッシュに保存
    this.thresholdCache.value = threshold;
    this.thresholdCache.lastCalculated = now;

    console.log(`[DynamicThreshold] 計算完了:`);
    console.log(`  ATRベース: ${(atrBasedThreshold * 100).toFixed(4)}%`);
    console.log(`  統計ベース: ${(statsBasedThreshold * 100).toFixed(4)}%`);
    console.log(`  最終閾値: ${(threshold * 100).toFixed(4)}%`);

    return threshold;
  }

  /**
   * 価格履歴をセグメントに分割して詳細分析
   */
  analyzePriceSegments(priceHistory, timeframe = 60, atrPercent = null) {
    const config = this.segmentConfigs[timeframe];
    if (!config) {
      console.warn(`[DetailedSegment] 未対応の時間枠: ${timeframe}`);
      return this.getEmptyPriceSegmentAnalysis(6);
    }

    // 必要なデータ数を取得
    const relevantData = priceHistory.slice(-config.dataRange);

    if (relevantData.length < config.dataRange) {
      return this.getEmptyPriceSegmentAnalysis(config.segmentCount);
    }

    // 動的閾値を計算（全セグメントで共通）
    const dynamicThreshold = this.calculateDynamicThreshold(priceHistory, atrPercent);

    // セグメントごとに詳細分析
    const segments = [];
    const pointsPerSegment = Math.floor(relevantData.length / config.segmentCount);

    for (let i = 0; i < config.segmentCount; i++) {
      const startIdx = i * pointsPerSegment;
      const endIdx = (i === config.segmentCount - 1)
        ? relevantData.length
        : (i + 1) * pointsPerSegment;

      const segmentData = relevantData.slice(startIdx, endIdx);
      const segment = this.analyzePriceSegment(segmentData, i, dynamicThreshold);
      segments.push(segment);
    }

    return {
      segments: segments,
      pattern: this.generatePattern(segments),
      shapeHash: this.generateShapeHash(segments),
      segmentCount: config.segmentCount,
      summary: this.generateSummary(segments),
      threshold: dynamicThreshold  // デバッグ用に閾値も返す
    };
  }

  /**
   * 個別セグメントの詳細分析（フェーズ1-3の全特徴量）
   */
  analyzePriceSegment(data, index, dynamicThreshold = null) {
    if (data.length < 2) {
      return this.getEmptyPriceSegment(index);
    }

    const startPrice = data[0];
    const endPrice = data[data.length - 1];
    const maxPrice = Math.max(...data);
    const minPrice = Math.min(...data);
    const avgPrice = data.reduce((a, b) => a + b, 0) / data.length;

    // === フェーズ1: 基本統計 ===
    const change = endPrice - startPrice;
    const changePercent = (change / startPrice) * 100;

    // === フェーズ2: トレンド特徴 ===
    const slope = this.calculateLinearRegressionSlope(data);
    const direction = this.classifyDirection(slope, changePercent, dynamicThreshold);

    // ボラティリティ（標準偏差）
    const variance = data.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / data.length;
    const volatility = Math.sqrt(variance);

    // レンジ
    const range = maxPrice - minPrice;
    const rangePercent = (range / avgPrice) * 100;

    // 上昇/下降の比率
    let upCount = 0, downCount = 0, flatCount = 0;
    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i-1];
      if (Math.abs(diff / data[i-1] * 100) < 0.005) {
        flatCount++;
      } else if (diff > 0) {
        upCount++;
      } else {
        downCount++;
      }
    }
    const totalMoves = upCount + downCount + flatCount;
    const upRatio = totalMoves > 0 ? upCount / totalMoves : 0.5;

    // === フェーズ3: 形状特徴 ===
    const peakIndex = data.indexOf(maxPrice);
    const troughIndex = data.indexOf(minPrice);
    const peakPosition = peakIndex / (data.length - 1);
    const troughPosition = troughIndex / (data.length - 1);

    // パターンタイプの分類
    const patternType = this.classifyPricePattern(data, slope, peakPosition, troughPosition);

    // 変化の強度（正規化された絶対値）
    const magnitude = Math.abs(changePercent);
    const normalizedMagnitude = this.normalizeToScale(magnitude, 0, 2, 0, 10); // 0-2%を0-10にマッピング

    return {
      index: index,

      // フェーズ1: 基本統計
      startPrice: startPrice,
      endPrice: endPrice,
      change: change,
      changePercent: changePercent,
      avgPrice: avgPrice,

      // フェーズ2: トレンド特徴
      slope: slope,
      direction: direction,
      magnitude: magnitude,
      normalizedMagnitude: normalizedMagnitude,
      volatility: volatility,
      range: range,
      rangePercent: rangePercent,
      upRatio: upRatio,

      // フェーズ3: 形状特徴
      maxPrice: maxPrice,
      minPrice: minPrice,
      peakPosition: peakPosition,
      troughPosition: troughPosition,
      patternType: patternType
    };
  }

  /**
   * テクニカル指標のセグメント分析
   */
  analyzeTechSegments(techHistory, timeframe = 60) {
    const config = this.segmentConfigs[timeframe];
    if (!config || !techHistory || techHistory.length < config.dataRange) {
      return this.getEmptyTechSegmentAnalysis(config ? config.segmentCount : 6);
    }

    const relevantData = techHistory.slice(-config.dataRange);
    const segments = [];
    const pointsPerSegment = Math.floor(relevantData.length / config.segmentCount);

    for (let i = 0; i < config.segmentCount; i++) {
      const startIdx = i * pointsPerSegment;
      const endIdx = (i === config.segmentCount - 1)
        ? relevantData.length
        : (i + 1) * pointsPerSegment;

      const segmentData = relevantData.slice(startIdx, endIdx);
      const segment = this.analyzeTechSegment(segmentData, i);
      segments.push(segment);
    }

    return {
      segments: segments,
      pattern: this.generatePattern(segments),
      shapeHash: this.generateShapeHash(segments),
      segmentCount: config.segmentCount
    };
  }

  /**
   * テクニカル指標セグメントの詳細分析
   */
  analyzeTechSegment(data, index) {
    if (data.length < 2) {
      return this.getEmptyTechSegment(index);
    }

    const startValue = data[0];
    const endValue = data[data.length - 1];
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const avgValue = data.reduce((a, b) => a + b, 0) / data.length;

    const change = endValue - startValue;
    const changePercent = startValue !== 0 ? (change / Math.abs(startValue)) * 100 : 0;
    const slope = this.calculateLinearRegressionSlope(data);
    const direction = this.classifyDirection(slope, changePercent);

    const variance = data.reduce((sum, v) => sum + Math.pow(v - avgValue, 2), 0) / data.length;
    const volatility = Math.sqrt(variance);
    const range = maxValue - minValue;

    return {
      index: index,
      startValue: startValue,
      endValue: endValue,
      change: change,
      changePercent: changePercent,
      direction: direction,
      slope: slope,
      volatility: volatility,
      range: range,
      avgValue: avgValue
    };
  }

  /**
   * 線形回帰で傾きを計算
   */
  calculateLinearRegressionSlope(data) {
    const n = data.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;

    // 価格に対する相対的な傾き（%）
    return avgY !== 0 ? (slope / avgY) * 100 : 0;
  }

  /**
   * 方向を分類（動的閾値ベース）
   */
  classifyDirection(slope, changePercent, dynamicThreshold = null) {
    // 動的閾値が渡されていない場合は、デフォルト値を使用
    const threshold = dynamicThreshold !== null
      ? dynamicThreshold
      : this.thresholdParams.minThreshold;

    if (Math.abs(changePercent) < threshold) {
      return 'FLAT';
    }

    return slope > 0 ? 'UP' : 'DOWN';
  }

  /**
   * 価格パターンを分類（フェーズ3）
   */
  classifyPricePattern(data, slope, peakPosition, troughPosition) {
    const len = data.length;
    const startValue = data[0];
    const endValue = data[len - 1];
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);

    const avgValue = data.reduce((a, b) => a + b, 0) / len;
    const variance = data.reduce((sum, v) => sum + Math.pow(v - avgValue, 2), 0) / len;
    const volatility = Math.sqrt(variance);
    const relativeVolatility = volatility / avgValue;

    // V字パターン: 谷が中央付近にある
    if (troughPosition > 0.3 && troughPosition < 0.7) {
      if (startValue > minValue && endValue > minValue) {
        const recoveryRatio = (endValue - minValue) / (startValue - minValue);
        if (recoveryRatio > 0.5) {
          return 'V_SHAPE';
        }
      }
    }

    // 逆V字パターン: 山が中央付近にある
    if (peakPosition > 0.3 && peakPosition < 0.7) {
      if (startValue < maxValue && endValue < maxValue) {
        const fallRatio = (maxValue - endValue) / (maxValue - startValue);
        if (fallRatio > 0.5) {
          return 'INVERTED_V_SHAPE';
        }
      }
    }

    // トレンドパターン
    if (Math.abs(slope) > 0.1) {
      if (slope > 0.1) {
        return 'UPTREND';
      } else if (slope < -0.1) {
        return 'DOWNTREND';
      }
    }

    // レンジ相場（低ボラティリティ）
    if (relativeVolatility < 0.002) {
      return 'RANGE';
    }

    // 複雑なパターン
    return 'COMPLEX';
  }

  /**
   * パターン文字列を生成
   */
  generatePattern(segments) {
    return segments.map(s => s.direction).join('-');
  }

  /**
   * 高速比較用のハッシュを生成
   */
  generateShapeHash(segments) {
    return segments.map(s => {
      if (s.direction === 'UP') return 'U';
      if (s.direction === 'DOWN') return 'D';
      return 'N';
    }).join('');
  }

  /**
   * パターン要約を生成
   */
  generateSummary(segments) {
    const directionCount = { UP: 0, DOWN: 0, FLAT: 0 };
    const patternTypeCount = {};

    segments.forEach(seg => {
      directionCount[seg.direction] = (directionCount[seg.direction] || 0) + 1;
      patternTypeCount[seg.patternType] = (patternTypeCount[seg.patternType] || 0) + 1;
    });

    const totalSegments = segments.length;
    const avgMagnitude = segments.reduce((sum, seg) => sum + seg.magnitude, 0) / totalSegments;
    const avgVolatility = segments.reduce((sum, seg) => sum + seg.volatility, 0) / totalSegments;

    return {
      upSegments: directionCount.UP,
      downSegments: directionCount.DOWN,
      flatSegments: directionCount.FLAT,
      upRatio: directionCount.UP / totalSegments,
      downRatio: directionCount.DOWN / totalSegments,
      flatRatio: directionCount.FLAT / totalSegments,
      avgMagnitude: avgMagnitude,
      avgVolatility: avgVolatility,
      dominantPattern: this.getDominantPattern(patternTypeCount)
    };
  }

  /**
   * 支配的なパターンタイプを取得
   */
  getDominantPattern(patternTypeCount) {
    let maxCount = 0;
    let dominant = 'COMPLEX';

    for (const [pattern, count] of Object.entries(patternTypeCount)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = pattern;
      }
    }

    return dominant;
  }

  /**
   * 値を指定範囲にマッピング
   */
  normalizeToScale(value, inMin, inMax, outMin, outMax) {
    const clamped = Math.max(inMin, Math.min(inMax, value));
    return ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
  }

  /**
   * 空の価格セグメント分析を返す
   */
  getEmptyPriceSegmentAnalysis(segmentCount) {
    return {
      segments: Array(segmentCount).fill().map((_, i) => this.getEmptyPriceSegment(i)),
      pattern: Array(segmentCount).fill('FLAT').join('-'),
      shapeHash: 'N'.repeat(segmentCount),
      segmentCount: segmentCount,
      summary: {
        upSegments: 0,
        downSegments: 0,
        flatSegments: segmentCount,
        upRatio: 0,
        downRatio: 0,
        flatRatio: 1,
        avgMagnitude: 0,
        avgVolatility: 0,
        dominantPattern: 'RANGE'
      }
    };
  }

  /**
   * 空の価格セグメントを返す
   */
  getEmptyPriceSegment(index) {
    return {
      index: index,
      startPrice: 0,
      endPrice: 0,
      change: 0,
      changePercent: 0,
      avgPrice: 0,
      slope: 0,
      direction: 'FLAT',
      magnitude: 0,
      normalizedMagnitude: 0,
      volatility: 0,
      range: 0,
      rangePercent: 0,
      upRatio: 0.5,
      maxPrice: 0,
      minPrice: 0,
      peakPosition: 0.5,
      troughPosition: 0.5,
      patternType: 'RANGE'
    };
  }

  /**
   * 空のテクニカルセグメント分析を返す
   */
  getEmptyTechSegmentAnalysis(segmentCount) {
    return {
      segments: Array(segmentCount).fill().map((_, i) => this.getEmptyTechSegment(i)),
      pattern: Array(segmentCount).fill('FLAT').join('-'),
      shapeHash: 'N'.repeat(segmentCount),
      segmentCount: segmentCount
    };
  }

  /**
   * 空のテクニカルセグメントを返す
   */
  getEmptyTechSegment(index) {
    return {
      index: index,
      startValue: 0,
      endValue: 0,
      change: 0,
      changePercent: 0,
      direction: 'FLAT',
      slope: 0,
      volatility: 0,
      range: 0,
      avgValue: 0
    };
  }
}

// グローバルスコープに公開
window.DetailedSegmentAnalyzer = DetailedSegmentAnalyzer;
