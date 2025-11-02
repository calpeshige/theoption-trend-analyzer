/**
 * Price Pattern Analyzer
 * Version: 1.0.0
 *
 * 価格データから時系列パターンを抽出し、AI予測の精度を向上させる
 */

class PricePatternAnalyzer {
  constructor() {
    // 判定時間ごとの推奨データ範囲（秒）
    this.dataRanges = {
      15: 60,    // 15秒判定 → 直近60秒のデータ
      30: 90,    // 30秒判定 → 直近90秒のデータ
      60: 120,   // 60秒判定 → 直近120秒のデータ
      180: 240,  // 3分判定 → 直近240秒のデータ
      300: 300   // 5分判定 → 直近300秒のデータ（全データ）
    };
  }

  /**
   * メイン分析関数: 価格パターンを抽出
   * @param {Array} priceHistory - 価格履歴配列（最大300個）
   * @param {number} timeframe - 判定時間（15, 30, 60, 180, 300）
   * @returns {Object} パターン情報
   */
  analyze(priceHistory, timeframe = 60) {
    if (!priceHistory || priceHistory.length < 30) {
      return this.getEmptyPattern();
    }

    const lookback = this.dataRanges[timeframe] || 120;
    const actualLookback = Math.min(lookback, priceHistory.length);
    const recentPrices = priceHistory.slice(-actualLookback);

    // 現在価格
    const currentPrice = recentPrices[recentPrices.length - 1];

    // 基本統計
    const stats = this.calculateBasicStats(recentPrices);

    // 短期変化率（10秒、30秒、60秒前との比較）
    const changes = this.calculateShortTermChanges(recentPrices, currentPrice);

    // トレンド分析
    const trend = this.analyzeTrend(recentPrices);

    // モメンタム分析
    const momentum = this.analyzeMomentum(recentPrices);

    // ボラティリティ分析
    const volatility = this.analyzeVolatility(recentPrices);

    // パターン認識
    const pattern = this.detectPattern(recentPrices);

    return {
      // 基本情報
      currentPrice,
      lookbackPeriod: actualLookback,

      // 基本統計
      ...stats,

      // 短期変化
      ...changes,

      // トレンド
      ...trend,

      // モメンタム
      ...momentum,

      // ボラティリティ
      ...volatility,

      // パターン
      ...pattern
    };
  }

  /**
   * 基本統計量を計算
   */
  calculateBasicStats(prices) {
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const range = high - low;
    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const rangePercent = (range / avg) * 100;

    return {
      high,
      low,
      range,
      rangePercent,
      avgPrice: avg
    };
  }

  /**
   * 短期変化率を計算
   */
  calculateShortTermChanges(prices, currentPrice) {
    const changes = {};

    // 10秒前との変化
    if (prices.length >= 10) {
      const price10sAgo = prices[prices.length - 10];
      changes.change10s = ((currentPrice - price10sAgo) / price10sAgo) * 100;
    } else {
      changes.change10s = 0;
    }

    // 30秒前との変化
    if (prices.length >= 30) {
      const price30sAgo = prices[prices.length - 30];
      changes.change30s = ((currentPrice - price30sAgo) / price30sAgo) * 100;
    } else {
      changes.change30s = 0;
    }

    // 60秒前との変化
    if (prices.length >= 60) {
      const price60sAgo = prices[prices.length - 60];
      changes.change60s = ((currentPrice - price60sAgo) / price60sAgo) * 100;
    } else {
      changes.change60s = 0;
    }

    // 全期間の変化
    const firstPrice = prices[0];
    changes.changeFull = ((currentPrice - firstPrice) / firstPrice) * 100;

    return changes;
  }

  /**
   * トレンド分析（線形回帰による傾き）
   */
  analyzeTrend(prices) {
    // 線形回帰で傾きを計算
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 傾きをパーセント表記に変換
    const avgPrice = sumY / n;
    const trendSlope = (slope / avgPrice) * 100;

    // トレンド方向の判定
    let trendDirection;
    if (trendSlope > 0.02) {
      trendDirection = 'UP';
    } else if (trendSlope < -0.02) {
      trendDirection = 'DOWN';
    } else {
      trendDirection = 'NEUTRAL';
    }

    // トレンドの強さ（R²相関係数）
    const predictions = prices.map((_, i) => slope * i + intercept);
    const meanY = sumY / n;
    let ssRes = 0, ssTot = 0;

    for (let i = 0; i < n; i++) {
      ssRes += Math.pow(prices[i] - predictions[i], 2);
      ssTot += Math.pow(prices[i] - meanY, 2);
    }

    const trendStrength = ssTot > 0 ? (1 - ssRes / ssTot) : 0;

    return {
      trendSlope,
      trendDirection,
      trendStrength: Math.max(0, Math.min(1, trendStrength)) // 0-1に正規化
    };
  }

  /**
   * モメンタム分析（価格の勢い）
   */
  analyzeMomentum(prices) {
    // 上昇・下降回数をカウント
    let upCount = 0, downCount = 0;
    let maxConsecutiveUp = 0, maxConsecutiveDown = 0;
    let currentConsecutiveUp = 0, currentConsecutiveDown = 0;

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];

      if (change > 0) {
        upCount++;
        currentConsecutiveUp++;
        currentConsecutiveDown = 0;
        maxConsecutiveUp = Math.max(maxConsecutiveUp, currentConsecutiveUp);
      } else if (change < 0) {
        downCount++;
        currentConsecutiveDown++;
        currentConsecutiveUp = 0;
        maxConsecutiveDown = Math.max(maxConsecutiveDown, currentConsecutiveDown);
      } else {
        currentConsecutiveUp = 0;
        currentConsecutiveDown = 0;
      }
    }

    const totalMoves = upCount + downCount;
    const upRatio = totalMoves > 0 ? upCount / totalMoves : 0.5;

    // 加速度（価格変化率の変化）
    const acceleration = this.calculateAcceleration(prices);

    return {
      upCount,
      downCount,
      upRatio,
      maxConsecutiveUp,
      maxConsecutiveDown,
      acceleration
    };
  }

  /**
   * 加速度計算（変化率の変化）
   */
  calculateAcceleration(prices) {
    if (prices.length < 3) return 0;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    let accelSum = 0;
    for (let i = 1; i < changes.length; i++) {
      accelSum += changes[i] - changes[i - 1];
    }

    return accelSum / (changes.length - 1);
  }

  /**
   * ボラティリティ分析
   */
  analyzeVolatility(prices) {
    // 標準偏差
    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volatilityPercent = (stdDev / avg) * 100;

    // 直近の変動が大きいか（直近30%のデータで判定）
    const recent30Percent = Math.floor(prices.length * 0.3);
    const recentPrices = prices.slice(-recent30Percent);
    const recentAvg = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;
    const recentVariance = recentPrices.reduce((sum, p) => sum + Math.pow(p - recentAvg, 2), 0) / recentPrices.length;
    const recentStdDev = Math.sqrt(recentVariance);
    const recentVolatilityPercent = (recentStdDev / recentAvg) * 100;

    // ボラティリティが増加しているか
    const volatilityIncreasing = recentVolatilityPercent > volatilityPercent;

    return {
      volatility: volatilityPercent,
      recentVolatility: recentVolatilityPercent,
      volatilityIncreasing
    };
  }

  /**
   * チャートパターン検出
   */
  detectPattern(prices) {
    if (prices.length < 20) {
      return {
        patternType: 'INSUFFICIENT_DATA',
        patternStrength: 0
      };
    }

    // 高値・安値のピークを検出
    const peaks = this.findPeaks(prices);
    const valleys = this.findValleys(prices);

    // パターン判定
    let patternType = 'NEUTRAL';
    let patternStrength = 0;

    // 上昇トレンド: 高値と安値が切り上がっている
    if (this.isHigherHighsAndLows(peaks, valleys)) {
      patternType = 'UPTREND';
      patternStrength = 0.8;
    }
    // 下降トレンド: 高値と安値が切り下がっている
    else if (this.isLowerHighsAndLows(peaks, valleys)) {
      patternType = 'DOWNTREND';
      patternStrength = 0.8;
    }
    // ダブルトップ
    else if (this.isDoubleTop(peaks, prices)) {
      patternType = 'DOUBLE_TOP';
      patternStrength = 0.7;
    }
    // ダブルボトム
    else if (this.isDoubleBottom(valleys, prices)) {
      patternType = 'DOUBLE_BOTTOM';
      patternStrength = 0.7;
    }
    // レンジ相場
    else if (peaks.length >= 2 && valleys.length >= 2) {
      patternType = 'RANGE';
      patternStrength = 0.5;
    }

    return {
      patternType,
      patternStrength,
      peakCount: peaks.length,
      valleyCount: valleys.length
    };
  }

  /**
   * ピーク（高値）を検出
   */
  findPeaks(prices, threshold = 0.0001) {
    const peaks = [];

    for (let i = 2; i < prices.length - 2; i++) {
      const current = prices[i];
      const left1 = prices[i - 1];
      const left2 = prices[i - 2];
      const right1 = prices[i + 1];
      const right2 = prices[i + 2];

      if (current > left1 && current > left2 &&
          current > right1 && current > right2 &&
          (current - Math.min(left1, left2, right1, right2)) / current > threshold) {
        peaks.push({ index: i, price: current });
      }
    }

    return peaks;
  }

  /**
   * 谷（安値）を検出
   */
  findValleys(prices, threshold = 0.0001) {
    const valleys = [];

    for (let i = 2; i < prices.length - 2; i++) {
      const current = prices[i];
      const left1 = prices[i - 1];
      const left2 = prices[i - 2];
      const right1 = prices[i + 1];
      const right2 = prices[i + 2];

      if (current < left1 && current < left2 &&
          current < right1 && current < right2 &&
          (Math.max(left1, left2, right1, right2) - current) / current > threshold) {
        valleys.push({ index: i, price: current });
      }
    }

    return valleys;
  }

  /**
   * 高値と安値が切り上がっているか（上昇トレンド）
   */
  isHigherHighsAndLows(peaks, valleys) {
    if (peaks.length < 2 || valleys.length < 2) return false;

    const recentPeaks = peaks.slice(-2);
    const recentValleys = valleys.slice(-2);

    return recentPeaks[1].price > recentPeaks[0].price &&
           recentValleys[1].price > recentValleys[0].price;
  }

  /**
   * 高値と安値が切り下がっているか（下降トレンド）
   */
  isLowerHighsAndLows(peaks, valleys) {
    if (peaks.length < 2 || valleys.length < 2) return false;

    const recentPeaks = peaks.slice(-2);
    const recentValleys = valleys.slice(-2);

    return recentPeaks[1].price < recentPeaks[0].price &&
           recentValleys[1].price < recentValleys[0].price;
  }

  /**
   * ダブルトップパターン検出
   */
  isDoubleTop(peaks, prices) {
    if (peaks.length < 2) return false;

    const lastTwo = peaks.slice(-2);
    const priceDiff = Math.abs(lastTwo[0].price - lastTwo[1].price);
    const avgPrice = (lastTwo[0].price + lastTwo[1].price) / 2;
    const similarity = priceDiff / avgPrice;

    // 2つの高値が近く（1%以内）、間に谷がある
    if (similarity < 0.01) {
      const middleIndex = Math.floor((lastTwo[0].index + lastTwo[1].index) / 2);
      const middlePrice = prices[middleIndex];
      return middlePrice < Math.min(lastTwo[0].price, lastTwo[1].price) * 0.995;
    }

    return false;
  }

  /**
   * ダブルボトムパターン検出
   */
  isDoubleBottom(valleys, prices) {
    if (valleys.length < 2) return false;

    const lastTwo = valleys.slice(-2);
    const priceDiff = Math.abs(lastTwo[0].price - lastTwo[1].price);
    const avgPrice = (lastTwo[0].price + lastTwo[1].price) / 2;
    const similarity = priceDiff / avgPrice;

    // 2つの安値が近く（1%以内）、間に山がある
    if (similarity < 0.01) {
      const middleIndex = Math.floor((lastTwo[0].index + lastTwo[1].index) / 2);
      const middlePrice = prices[middleIndex];
      return middlePrice > Math.max(lastTwo[0].price, lastTwo[1].price) * 1.005;
    }

    return false;
  }

  /**
   * 空のパターンを返す（データ不足時）
   */
  getEmptyPattern() {
    return {
      currentPrice: 0,
      lookbackPeriod: 0,
      high: 0,
      low: 0,
      range: 0,
      rangePercent: 0,
      avgPrice: 0,
      change10s: 0,
      change30s: 0,
      change60s: 0,
      changeFull: 0,
      trendSlope: 0,
      trendDirection: 'NEUTRAL',
      trendStrength: 0,
      upCount: 0,
      downCount: 0,
      upRatio: 0.5,
      maxConsecutiveUp: 0,
      maxConsecutiveDown: 0,
      acceleration: 0,
      volatility: 0,
      recentVolatility: 0,
      volatilityIncreasing: false,
      patternType: 'INSUFFICIENT_DATA',
      patternStrength: 0,
      peakCount: 0,
      valleyCount: 0
    };
  }
}

// グローバルに公開
window.PricePatternAnalyzer = PricePatternAnalyzer;
