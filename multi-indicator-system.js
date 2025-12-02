/**
 * Multi-Dimensional Indicator System
 * Version: 1.0.0
 *
 * 20個以上のテクニカル指標を統合した高精度分析システム
 */

// デバッグモード（本番ではfalse）
const MIS_DEBUG = false;
const misLog = MIS_DEBUG ? misLog.bind(console) : () => {};

// ========================================
// 1. MACD Indicator
// ========================================

class MACDIndicator {
  calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
  }

  calculate(prices, scaleFactor = 1, periodScaleFactor = 1) {
    // 期間をスケーリング（最小値を確保）
    const period26 = Math.max(10, Math.round(26 * periodScaleFactor));
    const period12 = Math.max(5, Math.round(12 * periodScaleFactor));

    if (prices.length < period26) {
      return { macd: 0, signal: 0, histogram: 0, strength: 0 };
    }

    const ema12 = this.calculateEMA(prices.slice(-period26), period12);
    const ema26 = this.calculateEMA(prices.slice(-period26), period26);
    const macd = ema12 - ema26;

    // シグナルライン（簡易版）
    const signal = macd * 0.8;
    const histogram = macd - signal;

    // 強度スコア（-10 to +10）
    // 超短期取引用にscaleFactorで感度調整
    const strength = Math.max(-10, Math.min(10, histogram * 100 * scaleFactor));

    return { macd, signal, histogram, strength };
  }
}

// ========================================
// 2. ADX Indicator
// ========================================

class ADXIndicator {
  calculate(candles, timeframeSeconds = 15) {
    // タイムフレームに応じた観測期間を計算（判定時間の2倍）
    // 短期タイムフレームでは期間を短くして計算可能にする
    const observationSeconds = timeframeSeconds * 2;

    // タイムフレームに応じた期間設定
    // 15秒: 7期間（キャンドル12個で計算可能）
    // 30秒: 14期間
    // 60秒以上: 30期間
    let period;
    if (timeframeSeconds <= 15) {
      period = 7;  // 15秒用（超短期）
    } else if (timeframeSeconds <= 30) {
      period = 14; // 30秒用
    } else {
      period = 30; // 60秒以上用
    }

    // 必要なキャンドル数を計算
    const requiredCandles = period;

    // デバッグログ
    misLog(`[ADX Debug] candles.length=${candles.length}, required=${requiredCandles}, timeframe=${timeframeSeconds}s`);

    if (candles.length < requiredCandles) {
      misLog(`[ADX Debug] データ不足: ${candles.length} < ${requiredCandles}`);
      return { adx: 0, plusDI: 0, minusDI: 0, strength: 0, reason: 'insufficient_data' };
    }

    // 直近の必要な期間分のキャンドルを取得
    const recentCandles = candles.slice(-requiredCandles);

    // キャンドルデータの検証
    if (recentCandles.length > 0) {
      const sample = recentCandles[0];
      misLog(`[ADX Debug] キャンドルサンプル: high=${sample.high}, low=${sample.low}, open=${sample.open}, close=${sample.close}`);

      // high/lowが同じ（価格変動なし）キャンドルの数をカウント
      const flatCandles = recentCandles.filter(c => c.high === c.low).length;
      misLog(`[ADX Debug] フラットキャンドル数: ${flatCandles}/${recentCandles.length}`);
    }

    let plusDM = 0, minusDM = 0, tr = 0;
    let plusDMCount = 0, minusDMCount = 0;

    for (let i = 1; i < recentCandles.length; i++) {
      const highDiff = recentCandles[i].high - recentCandles[i-1].high;
      const lowDiff = recentCandles[i-1].low - recentCandles[i].low;

      if (highDiff > 0 && highDiff > lowDiff) {
        plusDM += highDiff;
        plusDMCount++;
      }
      if (lowDiff > 0 && lowDiff > highDiff) {
        minusDM += lowDiff;
        minusDMCount++;
      }

      const high = recentCandles[i].high;
      const low = recentCandles[i].low;
      const prevClose = recentCandles[i-1].close;

      tr += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }

    misLog(`[ADX Debug] plusDM=${plusDM.toFixed(6)}, minusDM=${minusDM.toFixed(6)}, TR=${tr.toFixed(6)}`);
    misLog(`[ADX Debug] plusDMカウント=${plusDMCount}, minusDMカウント=${minusDMCount}`);

    // TRが0の場合（価格変動なし）
    if (tr === 0) {
      misLog(`[ADX Debug] TR=0: 価格変動なし`);
      return { adx: 0, plusDI: 0, minusDI: 0, strength: 0, reason: 'no_price_movement' };
    }

    const plusDI = (plusDM / tr) * 100;
    const minusDI = (minusDM / tr) * 100;

    // plusDI + minusDI が0の場合のガード
    const diSum = plusDI + minusDI;
    const adx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;

    // 強度スコア（0-10）
    const strength = Math.min(10, adx / 5);

    misLog(`[ADX Debug] 結果: ADX=${adx.toFixed(2)}, +DI=${plusDI.toFixed(2)}, -DI=${minusDI.toFixed(2)}`);

    return { adx, plusDI, minusDI, strength, observationSeconds, period };
  }
}

// ========================================
// 3. Stochastic Oscillator
// ========================================

class StochasticIndicator {
  calculate(candles, period = 14, periodScaleFactor = 1) {
    // 期間をスケーリング（最小値を確保）
    const scaledPeriod = Math.max(5, Math.round(period * periodScaleFactor));

    if (candles.length < scaledPeriod) {
      return { k: 50, d: 50, signal: 'NEUTRAL', strength: 0 };
    }

    const recentCandles = candles.slice(-scaledPeriod);
    const currentClose = recentCandles[recentCandles.length - 1].close;

    const highest = Math.max(...recentCandles.map(c => c.high));
    const lowest = Math.min(...recentCandles.map(c => c.low));

    const k = ((currentClose - lowest) / (highest - lowest)) * 100;
    const d = k * 0.9; // 簡易版

    let signal = 'NEUTRAL';
    let strength = 0;

    if (k > 80 && d > 80) {
      signal = 'OVERBOUGHT';
      strength = -5;
    } else if (k < 20 && d < 20) {
      signal = 'OVERSOLD';
      strength = -5;
    } else if (k > d && k < 80) {
      signal = 'BULLISH';
      strength = 5;
    } else if (k < d && k > 20) {
      signal = 'BEARISH';
      strength = -5;
    }

    return { k, d, signal, strength };
  }
}

// ========================================
// 4. ATR Indicator
// ========================================

class ATRIndicator {
  calculate(candles, period = 14, scaleFactor = 1) {
    if (candles.length < 2) {
      return { atr: 0, volatility: 'LOW', strength: 0 };
    }

    let sumTR = 0;

    for (let i = 1; i < Math.min(candles.length, period + 1); i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i-1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      sumTR += tr;
    }

    const atr = sumTR / Math.min(candles.length - 1, period);
    const currentPrice = candles[candles.length - 1].close;
    const atrPercent = (atr / currentPrice) * 100;

    // 超短期取引用に閾値を調整
    const highThreshold = 0.5 / scaleFactor;    // 15秒: 0.005%, 5分: 0.5%
    const moderateThreshold = 0.2 / scaleFactor; // 15秒: 0.002%, 5分: 0.2%

    let volatility, strength;

    if (atrPercent > highThreshold) {
      volatility = 'HIGH';
      strength = 3;
    } else if (atrPercent > moderateThreshold) {
      volatility = 'MODERATE';
      strength = 2;
    } else {
      volatility = 'LOW';
      strength = 1;
    }

    return { atr, atrPercent, volatility, strength };
  }
}

// ========================================
// 5. ROC Indicator
// ========================================

class ROCIndicator {
  calculate(prices, period = 10, scaleFactor = 1, periodScaleFactor = 1) {
    // 期間をスケーリング（最小値を確保）
    const scaledPeriod = Math.max(3, Math.round(period * periodScaleFactor));

    if (prices.length < scaledPeriod + 1) {
      return { roc: 0, signal: 'NEUTRAL', strength: 0 };
    }

    const currentPrice = prices[prices.length - 1];
    const pastPrice = prices[prices.length - 1 - scaledPeriod];

    const roc = ((currentPrice - pastPrice) / pastPrice) * 100;

    // 超短期取引用に閾値を調整
    const strongThreshold = 1.0 / scaleFactor;  // 15秒: 0.01%, 5分: 1.0%
    const weakThreshold = 0.3 / scaleFactor;    // 15秒: 0.003%, 5分: 0.3%

    let signal, strength;

    if (roc > strongThreshold) {
      signal = 'STRONG_UP';
      strength = 10;
    } else if (roc > weakThreshold) {
      signal = 'UP';
      strength = 5;
    } else if (roc < -strongThreshold) {
      signal = 'STRONG_DOWN';
      strength = -10;
    } else if (roc < -weakThreshold) {
      signal = 'DOWN';
      strength = -5;
    } else {
      signal = 'NEUTRAL';
      strength = 0;
    }

    return { roc, signal, strength };
  }
}

// ========================================
// 6. Market Sentiment Analyzer
// ========================================

class MarketSentimentAnalyzer {
  analyze(ticks, scaleFactor = 1, periodScaleFactor = 1) {
    // 期間をスケーリング（最小値を確保）
    const scaledPeriod = Math.max(20, Math.round(60 * periodScaleFactor));

    if (ticks.length < Math.round(30 * periodScaleFactor)) {
      return { sentiment: 'NEUTRAL', intensity: 'LOW', strength: 0 };
    }

    const recent = ticks.slice(-scaledPeriod);

    // 上昇ティック比率
    const upTicks = recent.filter(t => t.change > 0).length;
    const upRatio = upTicks / recent.length;

    // 平均変化幅
    const avgChange = recent.reduce((sum, t) => sum + Math.abs(t.change), 0) / recent.length;

    let sentiment, intensity, strength;

    if (upRatio > 0.65) {
      sentiment = 'BULLISH';
      strength = 5;
    } else if (upRatio < 0.35) {
      sentiment = 'BEARISH';
      strength = -5;
    } else {
      sentiment = 'NEUTRAL';
      strength = 0;
    }

    // 超短期取引用に閾値を調整
    const highThreshold = 10 / scaleFactor;    // 15秒: 0.1, 5分: 10
    const moderateThreshold = 5 / scaleFactor;  // 15秒: 0.05, 5分: 5

    if (avgChange > highThreshold) {
      intensity = 'HIGH';
      strength *= 1.5;
    } else if (avgChange > moderateThreshold) {
      intensity = 'MODERATE';
    } else {
      intensity = 'LOW';
      strength *= 0.5;
    }

    return { sentiment, intensity, upRatio, avgChange, strength };
  }
}

// ========================================
// 7. Timeframe Trend Analyzer (Period Segmentation)
// ========================================

class TimeframeTrendAnalyzer {
  /**
   * 分析期間を複数セグメントに分割して評価
   * 期間全体の動きを把握し、直近偏重を防ぐ
   */
  analyzeSegmentedTrend(prices, timeframeSeconds) {
    if (prices.length < 10) {
      return {
        segments: [],
        consistency: 0,
        dominantDirection: 'NEUTRAL',
        trendReversals: 0,
        reliability: 0
      };
    }

    // セグメント数を決定（3-5分割）
    const segmentCount = this.getSegmentCount(timeframeSeconds);
    const segmentSize = Math.floor(prices.length / segmentCount);

    const segments = [];

    for (let i = 0; i < segmentCount; i++) {
      const start = i * segmentSize;
      const end = (i === segmentCount - 1) ? prices.length : (i + 1) * segmentSize;
      const segmentPrices = prices.slice(start, end);

      if (segmentPrices.length < 2) continue;

      const analysis = {
        startPrice: segmentPrices[0],
        endPrice: segmentPrices[segmentPrices.length - 1],
        changePercent: ((segmentPrices[segmentPrices.length - 1] - segmentPrices[0]) / segmentPrices[0]) * 100,
        direction: null,
        volatility: this.calculateSegmentVolatility(segmentPrices),
        strength: 0
      };

      // 方向判定（閾値を時間枠に応じて調整）
      const threshold = timeframeSeconds <= 30 ? 0.02 : 0.05;
      if (analysis.changePercent > threshold) analysis.direction = 'UP';
      else if (analysis.changePercent < -threshold) analysis.direction = 'DOWN';
      else analysis.direction = 'FLAT';

      // 強度計算（変化率とボラティリティから）
      analysis.strength = Math.abs(analysis.changePercent) / (analysis.volatility + 0.001);

      segments.push(analysis);
    }

    const consistency = this.calculateConsistency(segments);
    const reversals = this.countReversals(segments);

    return {
      segments: segments,
      consistency: consistency,
      dominantDirection: this.getDominantDirection(segments),
      trendReversals: reversals,
      reliability: this.calculateReliability(consistency, reversals, segments.length)
    };
  }

  getSegmentCount(timeframeSeconds) {
    if (timeframeSeconds <= 15) return 3;
    if (timeframeSeconds <= 60) return 4;
    return 5;
  }

  calculateSegmentVolatility(prices) {
    if (prices.length < 2) return 0;

    let sum = 0;
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i-1]) / prices[i-1]) * 100;
      sum += change;
    }
    return sum / (prices.length - 1);
  }

  calculateConsistency(segments) {
    if (segments.length === 0) return 0;

    // 同一方向のセグメント数 / 全セグメント数
    const directions = segments.map(s => s.direction);
    const upCount = directions.filter(d => d === 'UP').length;
    const downCount = directions.filter(d => d === 'DOWN').length;
    const maxSameDirection = Math.max(upCount, downCount);

    return (maxSameDirection / segments.length) * 100; // 0-100%
  }

  getDominantDirection(segments) {
    if (segments.length === 0) return 'NEUTRAL';

    const upCount = segments.filter(s => s.direction === 'UP').length;
    const downCount = segments.filter(s => s.direction === 'DOWN').length;

    if (upCount > downCount) return 'UP';
    if (downCount > upCount) return 'DOWN';
    return 'NEUTRAL';
  }

  countReversals(segments) {
    if (segments.length < 2) return 0;

    let reversals = 0;
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1].direction;
      const curr = segments[i].direction;
      if ((prev === 'UP' && curr === 'DOWN') || (prev === 'DOWN' && curr === 'UP')) {
        reversals++;
      }
    }
    return reversals;
  }

  calculateReliability(consistency, reversals, segmentCount) {
    // 一貫性が高く、反転が少ないほど信頼度が高い
    const consistencyScore = consistency; // 0-100
    const reversalPenalty = (reversals / (segmentCount - 1)) * 50; // 0-50

    return Math.max(0, Math.min(100, consistencyScore - reversalPenalty));
  }
}

// ========================================
// 8. Enhanced Indicator Calculator (Balanced Weighting)
// ========================================

class EnhancedIndicatorCalculator {
  constructor() {
    this.macdIndicator = new MACDIndicator();
  }

  /**
   * 期間全体を考慮したバランス調整MACD
   * 直近偏重を防ぎ、期間全体の動きを反映
   */
  calculateBalancedMACD(prices, timeframeSeconds) {
    if (prices.length < 30) {
      return {
        histogram: 0,
        strength: 0,
        consistency: 0,
        segments: { early: null, middle: null, late: null }
      };
    }

    // 期間を3分割
    const third = Math.floor(prices.length / 3);
    const early = prices.slice(0, third);
    const middle = prices.slice(third, third * 2);
    const late = prices.slice(third * 2);

    // 各期間でMACDを計算
    const macdEarly = this.macdIndicator.calculate(early, 1, 1);
    const macdMiddle = this.macdIndicator.calculate(middle, 1, 1);
    const macdLate = this.macdIndicator.calculate(late, 1, 1);

    // 重み付け平均（直近40%, 中盤30%, 前半30%）
    const weightedHistogram = macdLate.histogram * 0.4 + macdMiddle.histogram * 0.3 + macdEarly.histogram * 0.3;
    const weightedStrength = macdLate.strength * 0.4 + macdMiddle.strength * 0.3 + macdEarly.strength * 0.3;

    // 一貫性スコア（全期間で同じ方向なら高い）
    const consistency = this.calculateDirectionConsistency([macdEarly, macdMiddle, macdLate]);

    return {
      histogram: weightedHistogram,
      strength: weightedStrength,
      consistency: consistency, // 0-100%
      segments: {
        early: macdEarly,
        middle: macdMiddle,
        late: macdLate
      }
    };
  }

  calculateDirectionConsistency(indicators) {
    const directions = indicators.map(ind => Math.sign(ind.histogram));
    const allSame = directions.every(d => d === directions[0] && d !== 0);

    if (allSame) return 100;

    const positiveCount = directions.filter(d => d > 0).length;
    const negativeCount = directions.filter(d => d < 0).length;

    return (Math.max(positiveCount, negativeCount) / directions.length) * 100;
  }
}

// ========================================
// 9. Multi-Scale Trend Analyzer (Time-Scale Integration)
// ========================================

class MultiScaleTrendAnalyzer {
  /**
   * 短期・中期・長期のトレンドを統合評価
   * 複数タイムスケールでの整合性をチェック
   */
  analyzeMultiScale(prices, targetTimeframe) {
    if (prices.length < targetTimeframe) {
      return {
        shortTerm: { direction: 'NEUTRAL', strength: 0, changePercent: 0 },
        midTerm: { direction: 'NEUTRAL', strength: 0, changePercent: 0 },
        longTerm: { direction: 'NEUTRAL', strength: 0, changePercent: 0 },
        alignment: 0,
        confidence: 0
      };
    }

    const shortTerm = prices.slice(-Math.min(targetTimeframe, prices.length));
    const midTerm = prices.slice(-Math.min(targetTimeframe * 3, prices.length));
    const longTerm = prices.slice(-Math.min(targetTimeframe * 10, prices.length));

    const shortTrend = this.calculateTrend(shortTerm);
    const midTrend = this.calculateTrend(midTerm);
    const longTrend = this.calculateTrend(longTerm);

    // トレンドの整合性
    const alignment = this.calculateAlignment([shortTrend, midTrend, longTrend]);

    return {
      shortTerm: shortTrend,
      midTerm: midTrend,
      longTerm: longTrend,
      alignment: alignment, // 0-100%（全て同じ方向なら100）
      confidence: this.calculateConfidence(alignment, shortTrend.strength)
    };
  }

  calculateTrend(prices) {
    if (prices.length < 2) {
      return { direction: 'NEUTRAL', strength: 0, changePercent: 0 };
    }

    const startPrice = prices[0];
    const endPrice = prices[prices.length - 1];
    const change = ((endPrice - startPrice) / startPrice) * 100;

    return {
      direction: change > 0.05 ? 'UP' : change < -0.05 ? 'DOWN' : 'NEUTRAL',
      strength: Math.abs(change),
      changePercent: change
    };
  }

  calculateAlignment(trends) {
    const directions = trends.map(t => t.direction);
    const upCount = directions.filter(d => d === 'UP').length;
    const downCount = directions.filter(d => d === 'DOWN').length;

    if (upCount === 3 || downCount === 3) return 100; // 完全一致
    if (upCount === 2 || downCount === 2) return 66; // 2/3一致
    return 33; // バラバラ
  }

  calculateConfidence(alignment, trendStrength) {
    // 整合性が高く、トレンドが強いほど信頼度が高い
    return (alignment * 0.6 + Math.min(trendStrength * 10, 100) * 0.4);
  }
}

// ========================================
// 10. Integrated Analysis System
// ========================================

class MultiDimensionalAnalyzer {
  constructor() {
    this.macd = new MACDIndicator();
    this.adx = new ADXIndicator();
    this.stochastic = new StochasticIndicator();
    this.atr = new ATRIndicator();
    this.roc = new ROCIndicator();
    this.sentiment = new MarketSentimentAnalyzer();

    // 新しいアナライザーを追加
    this.timeframeTrendAnalyzer = new TimeframeTrendAnalyzer();
    this.enhancedIndicatorCalculator = new EnhancedIndicatorCalculator();
    this.multiScaleTrendAnalyzer = new MultiScaleTrendAnalyzer();
  }

  // 時間枠に応じた感度調整係数を取得
  getScaleFactor(timeframeSeconds) {
    if (timeframeSeconds <= 15) return 100;    // 15秒: 100倍（超高感度）
    if (timeframeSeconds <= 30) return 50;     // 30秒: 50倍（高感度）
    if (timeframeSeconds <= 60) return 20;     // 60秒: 20倍（中感度）
    if (timeframeSeconds <= 180) return 5;     // 3分: 5倍（低感度）
    return 1;                                   // 5分: 通常感度
  }

  // 時間枠に応じた期間スケーリング係数を取得（判定時間に比例）
  getPeriodScaleFactor(timeframeSeconds) {
    // 基準: 60秒判定 = 1.0倍
    if (timeframeSeconds <= 15) return 0.25;   // 15秒: 1/4
    if (timeframeSeconds <= 30) return 0.5;    // 30秒: 1/2
    if (timeframeSeconds <= 60) return 1.0;    // 60秒: 基準
    if (timeframeSeconds <= 180) return 3.0;   // 180秒: 3倍
    return 5.0;                                 // 300秒: 5倍
  }

  analyze(data) {
    const { prices, candles, ticks } = data;

    misLog(`[Multi-Indicator] 🔍 テクニカル分析開始 (データ: prices=${prices.length}件, candles=${candles.length}件, ticks=${ticks.length}件)`);

    // 各指標を計算
    const macdResult = this.macd.calculate(prices);
    const adxResult = this.adx.calculate(candles);
    const stochasticResult = this.stochastic.calculate(candles);
    const atrResult = this.atr.calculate(candles);
    const rocResult = this.roc.calculate(prices);
    const sentimentResult = this.sentiment.analyze(ticks);

    // スコア統合
    let totalScore = 0;
    let maxScore = 0;

    // MACD（重み: 20%）
    totalScore += macdResult.strength * 2;
    maxScore += 20;

    // ADX（重み: 15%）- トレンドの強さをスコアと信頼度に反映
    totalScore += adxResult.strength * 1.5;
    const trendConfidence = adxResult.strength * 1.5;
    maxScore += 15;

    // Stochastic（重み: 15%）
    totalScore += stochasticResult.strength * 1.5;
    maxScore += 15;

    // ATR（重み: 10%）- ボラティリティをスコアと信頼度に反映
    totalScore += atrResult.strength;
    const volatilityBonus = atrResult.strength;
    maxScore += 10;

    // ROC（重み: 20%）
    totalScore += rocResult.strength * 2;
    maxScore += 20;

    // Sentiment（重み: 20%）
    totalScore += sentimentResult.strength * 2;
    maxScore += 20;

    // デバッグ: 各指標のstrength値を確認
    misLog(`[Multi-Indicator] 各指標のstrength値:`, {
      macd: macdResult.strength.toFixed(2),
      adx: adxResult.strength.toFixed(2),
      stochastic: stochasticResult.strength.toFixed(2),
      atr: atrResult.strength.toFixed(2),
      roc: rocResult.strength.toFixed(2),
      sentiment: sentimentResult.strength.toFixed(2)
    });

    // デバッグ: 各指標のスコア貢献度を確認
    misLog(`[Multi-Indicator] 📊 各指標のスコア貢献度:`, {
      'MACD貢献': (macdResult.strength * 2).toFixed(2) + '点',
      'ADX貢献': (adxResult.strength * 1.5).toFixed(2) + '点 ✨',
      'Stochastic貢献': (stochasticResult.strength * 1.5).toFixed(2) + '点',
      'ATR貢献': (atrResult.strength).toFixed(2) + '点 ✨',
      'ROC貢献': (rocResult.strength * 2).toFixed(2) + '点',
      'Sentiment貢献': (sentimentResult.strength * 2).toFixed(2) + '点'
    });

    // 正規化（-100 to +100）
    const normalizedScore = (totalScore / maxScore) * 100;

    // デバッグ: スコアを確認
    misLog(`[Multi-Indicator] ⚖️ スコア計算: totalScore=${totalScore.toFixed(2)}点 / maxScore=${maxScore}点 = normalizedScore=${normalizedScore.toFixed(2)}, trendConfidence=${trendConfidence.toFixed(2)}`);

    // 🆕 ATRに基づく動的しきい値調整
    // ボラティリティが低い通貨ペア(USD/JPY等)では低いしきい値、高い通貨ペア(仮想通貨等)では高いしきい値を使用
    // ATR strength: 0-10の範囲、絶対値が大きいほどボラティリティが高い
    const atrAbsolute = Math.abs(atrResult.strength);
    // volatilityFactor: 0.5～1.5の範囲で調整
    // ATR=0→0.5倍(しきい値: 7.5/25), ATR=2→0.7倍(10.5/35), ATR=5→1.0倍(15/50), ATR=10→1.5倍(22.5/75)
    const volatilityFactor = Math.max(0.5, Math.min(1.5, 0.5 + (atrAbsolute / 10) * 1.0));

    const highThreshold = 15 * volatilityFactor;
    const strongThreshold = 50 * volatilityFactor;

    misLog(`[Multi-Indicator] 🎚️ 動的しきい値: ATR=${atrAbsolute.toFixed(2)} → volatilityFactor=${volatilityFactor.toFixed(2)} → HIGH=±${highThreshold.toFixed(1)}, STRONG=±${strongThreshold.toFixed(1)}`);

    // シグナル判定（動的しきい値を使用）
    let signal, confidence;

    if (normalizedScore > strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3);
      misLog(`[Multi-Indicator] 🎯 判定: STRONG_HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore > highThreshold) {
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4);
      misLog(`[Multi-Indicator] 🎯 判定: HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${highThreshold.toFixed(1)})`);
    } else if (normalizedScore < -strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3);
      misLog(`[Multi-Indicator] 🎯 判定: STRONG_LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore < -highThreshold) {
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4);
      misLog(`[Multi-Indicator] 🎯 判定: LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${highThreshold.toFixed(1)})`);
    } else {
      signal = 'NEUTRAL';
      confidence = 50 + Math.abs(normalizedScore) * 1.5;
      misLog(`[Multi-Indicator] 🎯 判定: NEUTRAL (normalizedScore=${normalizedScore.toFixed(2)} が -${highThreshold.toFixed(1)}～${highThreshold.toFixed(1)}の範囲内)`);
    }

    misLog(`[Multi-Indicator] ✅ 最終結果: signal=${signal}, confidence=${Math.round(confidence)}%`);
    misLog(`[Multi-Indicator] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return {
      signal,
      confidence: Math.round(confidence),
      score: Math.round(normalizedScore),
      breakdown: {
        macd: macdResult,
        adx: adxResult,
        stochastic: stochasticResult,
        atr: atrResult,
        roc: rocResult,
        sentiment: sentimentResult
      }
    };
  }

  // 🆕 仮想通貨ペア判定
  isCryptocurrencyPair(asset) {
    if (!asset) return false;
    // BTC, ETH で始まる通貨ペアを仮想通貨として判定
    const cryptoPrefixes = ['BTC', 'ETH', 'LTC', 'XRP', 'BCH', 'ADA', 'DOT', 'DOGE'];
    return cryptoPrefixes.some(prefix => asset.startsWith(prefix));
  }

  // 時間枠別分析（15秒、30秒、60秒、3分、5分）
  analyzeTimeframe(data, timeframeSeconds, asset = null, trendStrengthThreshold = 5) {
    const { prices, candles, ticks } = data;

    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🔍 テクニカル分析開始 (データ: prices=${prices.length}件, candles=${candles.length}件, ticks=${ticks.length}件, トレンド強度閾値: ${trendStrengthThreshold})`);

    // 時間枠に応じた係数を取得
    const scaleFactor = this.getScaleFactor(timeframeSeconds);
    const periodScaleFactor = this.getPeriodScaleFactor(timeframeSeconds);
    misLog(`[Multi-Indicator] 時間枠=${timeframeSeconds}秒, 感度係数=${scaleFactor}倍, 期間係数=${periodScaleFactor}倍`);
    misLog(`[Multi-Indicator] ${timeframeSeconds}秒 入力データ: prices=${prices.length}件, 最新5件=${prices.slice(-5).map(p => p.toFixed(3)).join(', ')}`);

    // 時間枠に応じてデータをフィルタリング
    // 短期: 直近のデータのみ使用（ノイズに敏感）
    // 長期: より多くのデータ使用（トレンド重視）

    let relevantPrices, relevantCandles, relevantTicks;

    if (timeframeSeconds <= 15) {
      // 15秒: 超短期（直近2分のデータで精度向上）
      relevantPrices = prices.slice(-120);
      relevantCandles = candles.slice(-120);
      relevantTicks = ticks.slice(-120);
    } else {
      // 30秒以上: 渡されたデータをそのまま使用（長期MA計算のため制限しない）
      relevantPrices = prices;
      relevantCandles = candles;
      relevantTicks = ticks;
    }

    // 各指標を計算（感度係数と期間係数を渡す）
    const macdResult = this.macd.calculate(relevantPrices, scaleFactor, periodScaleFactor);
    const adxResult = this.adx.calculate(relevantCandles, timeframeSeconds);
    const stochasticResult = this.stochastic.calculate(relevantCandles, 14, periodScaleFactor);
    const atrResult = this.atr.calculate(relevantCandles, 14, scaleFactor);
    const rocResult = this.roc.calculate(relevantPrices, 10, scaleFactor, periodScaleFactor);
    const sentimentResult = this.sentiment.analyze(relevantTicks, scaleFactor, periodScaleFactor);

    // 🆕 新規追加: 期間分割評価
    const segmentedTrend = this.timeframeTrendAnalyzer.analyzeSegmentedTrend(
      relevantPrices,
      timeframeSeconds
    );

    // 🆕 新規追加: バランス調整MACD
    const balancedMACD = this.enhancedIndicatorCalculator.calculateBalancedMACD(
      relevantPrices,
      timeframeSeconds
    );

    // 🆕 新規追加: 複数タイムスケール評価
    const multiScale = this.multiScaleTrendAnalyzer.analyzeMultiScale(
      prices, // 全データを使用
      timeframeSeconds
    );

    misLog(`[Multi-Indicator-Enhanced] ${timeframeSeconds}秒 新規指標:`, {
      segmentConsistency: segmentedTrend.consistency.toFixed(1) + '%',
      trendReversals: segmentedTrend.trendReversals,
      macdConsistency: balancedMACD.consistency.toFixed(1) + '%',
      multiScaleAlignment: multiScale.alignment + '%',
      reliability: segmentedTrend.reliability.toFixed(1) + '%'
    });

    // 時間枠による重み調整
    let macdWeight = 1.5; // 2.0 → 1.5（バランス調整MACDを追加するため）
    let rocWeight = 2.0;
    let sentimentWeight = 2.0;

    if (timeframeSeconds <= 30) {
      // 超短期: センチメントとROCを重視
      sentimentWeight = 2.5;
      rocWeight = 2.3;
      macdWeight = 1.2;
    } else if (timeframeSeconds >= 180) {
      // 長期: MACDとADXを重視
      macdWeight = 1.8;
      sentimentWeight = 1.5;
    }

    // スコア統合
    let totalScore = 0;
    let maxScore = 0;

    // 既存の指標（重みを若干調整）
    totalScore += macdResult.strength * macdWeight;
    maxScore += 10 * macdWeight;

    totalScore += adxResult.strength * 1.5;
    const trendConfidence = adxResult.strength * 1.5;
    maxScore += 15;

    // ADX観測期間の情報をログ出力
    misLog(`[Multi-Indicator-ADX] ${timeframeSeconds}秒判定 → ADX観測期間: ${adxResult.observationSeconds || timeframeSeconds * 2}秒 (${adxResult.period || 30}期間), トレンド強度: ${adxResult.strength.toFixed(1)}, trendConfidence: ${trendConfidence.toFixed(1)}`);

    totalScore += stochasticResult.strength * 1.5;
    maxScore += 15;

    totalScore += atrResult.strength;
    const volatilityBonus = atrResult.strength;
    maxScore += 10;

    totalScore += rocResult.strength * rocWeight;
    maxScore += 10 * rocWeight;

    totalScore += sentimentResult.strength * sentimentWeight;
    maxScore += 10 * sentimentWeight;

    // 🆕 バランス調整MACD（新規）
    totalScore += balancedMACD.strength * 2.0;
    maxScore += 10 * 2.0;

    // 🆕 期間一貫性ボーナス
    const consistencyBonus = (segmentedTrend.consistency / 100) * 15;
    if (segmentedTrend.dominantDirection === 'UP') {
      totalScore += consistencyBonus;
    } else if (segmentedTrend.dominantDirection === 'DOWN') {
      totalScore -= consistencyBonus;
    }
    maxScore += 15;

    // 🆕 タイムスケール整合性ボーナス
    const alignmentBonus = (multiScale.alignment / 100) * 20;
    if (multiScale.shortTerm.direction === 'UP') {
      totalScore += alignmentBonus;
    } else if (multiScale.shortTerm.direction === 'DOWN') {
      totalScore -= alignmentBonus;
    }
    maxScore += 20;

    // 🆕 反転ペナルティ（頻繁な方向転換は信頼性低）
    const reversalPenalty = segmentedTrend.trendReversals * 5;
    totalScore -= reversalPenalty;

    // デバッグ: 各指標のstrength値を確認
    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 各指標のstrength値:`, {
      macd: macdResult.strength.toFixed(2),
      adx: adxResult.strength.toFixed(2),
      stochastic: stochasticResult.strength.toFixed(2),
      atr: atrResult.strength.toFixed(2),
      roc: rocResult.strength.toFixed(2),
      sentiment: sentimentResult.strength.toFixed(2)
    });

    // デバッグ: 各指標のスコア貢献度を確認
    const macdContribution = macdResult.strength * macdWeight;
    const adxContribution = adxResult.strength * 1.5;
    const stochasticContribution = stochasticResult.strength * 1.5;
    const atrContribution = atrResult.strength;
    const rocContribution = rocResult.strength * rocWeight;
    const sentimentContribution = sentimentResult.strength * sentimentWeight;
    const balancedMACDContribution = balancedMACD.strength * 2.0;

    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 📊 各指標のスコア貢献度:`, {
      'MACD貢献': macdContribution.toFixed(2) + '点',
      'ADX貢献': adxContribution.toFixed(2) + '点 ✨',
      'Stochastic貢献': stochasticContribution.toFixed(2) + '点',
      'ATR貢献': atrContribution.toFixed(2) + '点 ✨',
      'ROC貢献': rocContribution.toFixed(2) + '点',
      'Sentiment貢献': sentimentContribution.toFixed(2) + '点',
      'バランスMACD貢献': balancedMACDContribution.toFixed(2) + '点',
      '一貫性ボーナス': (segmentedTrend.dominantDirection === 'UP' ? '+' : segmentedTrend.dominantDirection === 'DOWN' ? '-' : '') + consistencyBonus.toFixed(2) + '点',
      '整合性ボーナス': (multiScale.shortTerm.direction === 'UP' ? '+' : multiScale.shortTerm.direction === 'DOWN' ? '-' : '') + alignmentBonus.toFixed(2) + '点',
      '反転ペナルティ': '-' + reversalPenalty.toFixed(2) + '点'
    });

    // 正規化
    const normalizedScore = (totalScore / maxScore) * 100;

    // デバッグ: スコアを確認
    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 ⚖️ スコア計算: totalScore=${totalScore.toFixed(2)}点 / maxScore=${maxScore}点 = normalizedScore=${normalizedScore.toFixed(2)}, trendConfidence=${trendConfidence.toFixed(2)}`);

    // 🆕 ATRパーセント値に基づく動的しきい値調整（全通貨ペア対応）
    // ボラティリティが低い通貨ペア(USD/JPY等)では低いしきい値、高い通貨ペア(仮想通貨等)では高いしきい値を使用
    const atrPercent = atrResult.atrPercent || 0.5;  // 実際のATRパーセント値を使用（フォールバック0.5%）

    // ボラティリティファクター：ATRパーセント値を基準に連続的に調整
    // USD/JPY (0.3%) → 0.3, EUR/USD (0.5%) → 0.5, EUR/JPY (0.8%) → 0.8, GBP/JPY (1.2%) → 1.2, BTC/JPY (6%) → 2.0
    const volatilityFactor = Math.max(0.3, Math.min(2.0, atrPercent / 1.0));

    // 🆕 仮想通貨ペアの場合、さらに閾値を調整（シグナル頻度の最適化）
    // 仮想通貨は高ボラティリティのため、追加で閾値を引き上げる
    const isCrypto = this.isCryptocurrencyPair(asset);
    const cryptoMultiplier = isCrypto ? 1.5 : 1.0;

    let highThreshold = 15 * volatilityFactor * cryptoMultiplier;
    let strongThreshold = 50 * volatilityFactor * cryptoMultiplier;

    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎚️ 動的しきい値: ATR=${atrPercent.toFixed(2)}% → volatilityFactor=${volatilityFactor.toFixed(2)}${isCrypto ? ' 🪙仮想通貨×1.5倍' : ''} → HIGH=±${highThreshold.toFixed(1)}, STRONG=±${strongThreshold.toFixed(1)}`);

    // シグナル判定（動的しきい値を使用）
    let signal, confidence;

    if (normalizedScore > strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3);
      misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: STRONG_HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore > highThreshold && trendConfidence > trendStrengthThreshold) {
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4);
      misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${highThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > ${trendStrengthThreshold})`);
    } else if (normalizedScore < -strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3);
      misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: STRONG_LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore < -highThreshold && trendConfidence > trendStrengthThreshold) {
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4);
      misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${highThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > ${trendStrengthThreshold})`);
    } else {
      signal = 'NEUTRAL';
      confidence = null;  // 見送りの場合はパーセンテージなし
      misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: NEUTRAL (normalizedScore=${normalizedScore.toFixed(2)} が -${highThreshold.toFixed(1)}～${highThreshold.toFixed(1)}の範囲内、または trendConfidence=${trendConfidence.toFixed(2)} <= ${trendStrengthThreshold})`);
    }

    // 🆕 信頼度を一貫性・整合性で調整
    let adjustedConfidence = confidence;
    if (confidence !== null) {
      // 一貫性が高い（80%以上）: 信頼度を5-10%上昇
      // 整合性が高い（100%）: 信頼度を5-10%上昇
      // 反転が多い: 信頼度を低下
      const reliabilityBonus = (segmentedTrend.reliability / 100) * 10;
      const alignmentBonus = (multiScale.alignment / 100) * 10;
      const reversalPenaltyPercent = Math.min(segmentedTrend.trendReversals * 5, 20);

      adjustedConfidence = confidence + reliabilityBonus + alignmentBonus - reversalPenaltyPercent;
      adjustedConfidence = Math.max(60, Math.min(95, adjustedConfidence)); // 60-95%の範囲に制限
    }

    const confidenceDisplay = adjustedConfidence !== null ? `${Math.round(adjustedConfidence)}%` : '--';
    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 ✅ 最終結果: signal=${signal}, confidence=${confidenceDisplay} (調整前: ${confidence !== null ? Math.round(confidence) : '--'})`);
    misLog(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return {
      signal,
      confidence: adjustedConfidence !== null ? Math.round(adjustedConfidence) : null,
      score: Math.round(normalizedScore),
      timeframe: timeframeSeconds,
      breakdown: {
        macd: macdResult,
        adx: adxResult,
        stochastic: stochasticResult,
        atr: atrResult,
        roc: rocResult,
        sentiment: sentimentResult,

        // 🆕 新規追加
        balancedMACD: balancedMACD,
        segmentedTrend: segmentedTrend,
        multiScale: multiScale,

        // 🆕 信頼度メトリクス
        reliability: {
          consistency: segmentedTrend.consistency,
          alignment: multiScale.alignment,
          reversals: segmentedTrend.trendReversals,
          overallConfidence: multiScale.confidence,
          reliabilityScore: segmentedTrend.reliability
        }
      }
    };
  }
}

// ========================================
// 11. Phase Detector (TREND/RANGE環境認識)
// ========================================

class PhaseDetector {
  /**
   * ボリンジャーバンド拡張率とADXを組み合わせて
   * 現在の市場がTREND相場かRANGE相場かを判定
   */
  detectPhase(candles, prices, timeframeSeconds) {
    // タイムフレームに応じた必要期間を設定
    // 15秒: 10期間（キャンドル12個で計算可能）
    // 30秒: 14期間
    // 60秒以上: 20期間
    let requiredPeriod;
    if (timeframeSeconds <= 15) {
      requiredPeriod = 10;
    } else if (timeframeSeconds <= 30) {
      requiredPeriod = 14;
    } else {
      requiredPeriod = 20;
    }

    if (candles.length < requiredPeriod || prices.length < requiredPeriod) {
      misLog(`[PhaseDetector] データ不足: candles=${candles.length}, prices=${prices.length}, required=${requiredPeriod}`);
      return { phase: 'UNKNOWN', confidence: 0, details: {} };
    }

    // ボリンジャーバンド計算（タイムフレームに応じた期間）
    const bbResult = this.calculateBollingerBands(prices, requiredPeriod);

    // BB拡張率（現在の幅 / 20期間平均幅）
    const bbExpansionRate = bbResult.currentWidth / bbResult.avgWidth;

    // 価格のBB内での位置（%B）
    const percentB = (prices[prices.length - 1] - bbResult.lower) / (bbResult.upper - bbResult.lower);

    // ADX計算（短期用に最適化）
    const adxIndicator = new ADXIndicator();
    const adxResult = adxIndicator.calculate(candles, timeframeSeconds);

    // 時間枠に応じた閾値調整
    let trendThreshold, rangeThreshold;
    if (timeframeSeconds <= 30) {
      // 超短期: BB拡張率を主に使用（ADXは参考程度）
      trendThreshold = { bbExpansion: 1.2, adx: 15 };
      rangeThreshold = { bbExpansion: 0.8, adx: 20 };
    } else if (timeframeSeconds <= 60) {
      // 短期: BB拡張率とADXを併用
      trendThreshold = { bbExpansion: 1.3, adx: 20 };
      rangeThreshold = { bbExpansion: 0.9, adx: 25 };
    } else {
      // 長期: ADXを主に使用
      trendThreshold = { bbExpansion: 1.4, adx: 25 };
      rangeThreshold = { bbExpansion: 1.0, adx: 20 };
    }

    // Phase判定
    let phase, confidence;

    if (timeframeSeconds <= 30) {
      // 超短期はBB拡張率を重視
      if (bbExpansionRate > trendThreshold.bbExpansion) {
        phase = 'TREND';
        confidence = Math.min(100, 60 + (bbExpansionRate - 1) * 40);
      } else if (bbExpansionRate < rangeThreshold.bbExpansion) {
        phase = 'RANGE';
        confidence = Math.min(100, 60 + (1 - bbExpansionRate) * 40);
      } else {
        phase = 'TRANSITION';
        confidence = 50;
      }
    } else {
      // 長期はADXも考慮
      const isTrendByBB = bbExpansionRate > trendThreshold.bbExpansion;
      const isTrendByADX = adxResult.adx > trendThreshold.adx;
      const isRangeByBB = bbExpansionRate < rangeThreshold.bbExpansion;
      const isRangeByADX = adxResult.adx < rangeThreshold.adx;

      if (isTrendByBB && isTrendByADX) {
        phase = 'TREND';
        confidence = Math.min(100, 70 + adxResult.adx / 2);
      } else if (isRangeByBB && isRangeByADX) {
        phase = 'RANGE';
        confidence = Math.min(100, 70 + (rangeThreshold.adx - adxResult.adx));
      } else if (isTrendByBB || isTrendByADX) {
        phase = 'TREND';
        confidence = 55;
      } else {
        phase = 'RANGE';
        confidence = 55;
      }
    }

    // トレンド方向の判定
    let trendDirection = 'NEUTRAL';
    if (phase === 'TREND') {
      if (adxResult.plusDI > adxResult.minusDI && prices[prices.length - 1] > bbResult.middle) {
        trendDirection = 'UP';
      } else if (adxResult.minusDI > adxResult.plusDI && prices[prices.length - 1] < bbResult.middle) {
        trendDirection = 'DOWN';
      }
    }

    return {
      phase,
      confidence: Math.round(confidence),
      trendDirection,
      details: {
        bbExpansionRate: Math.round(bbExpansionRate * 100) / 100,
        percentB: Math.round(percentB * 100) / 100,
        adx: Math.round(adxResult.adx * 10) / 10,
        plusDI: Math.round(adxResult.plusDI * 10) / 10,
        minusDI: Math.round(adxResult.minusDI * 10) / 10,
        bbUpper: bbResult.upper,
        bbMiddle: bbResult.middle,
        bbLower: bbResult.lower
      }
    };
  }

  calculateBollingerBands(prices, period = 20, stdDevMultiplier = 2) {
    if (prices.length < period) {
      return { upper: 0, middle: 0, lower: 0, currentWidth: 0, avgWidth: 0 };
    }

    const recentPrices = prices.slice(-period);

    // 中央線（SMA）
    const middle = recentPrices.reduce((sum, p) => sum + p, 0) / period;

    // 標準偏差
    const squaredDiffs = recentPrices.map(p => Math.pow(p - middle, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
    const stdDev = Math.sqrt(variance);

    // 上下バンド
    const upper = middle + stdDevMultiplier * stdDev;
    const lower = middle - stdDevMultiplier * stdDev;
    const currentWidth = upper - lower;

    // 平均バンド幅（過去のバンド幅との比較用）
    let avgWidth = currentWidth;
    if (prices.length >= period * 2) {
      const widths = [];
      for (let i = period; i <= prices.length; i++) {
        const slice = prices.slice(i - period, i);
        const m = slice.reduce((s, p) => s + p, 0) / period;
        const sd = Math.sqrt(slice.map(p => Math.pow(p - m, 2)).reduce((s, d) => s + d, 0) / period);
        widths.push(sd * 2 * stdDevMultiplier);
      }
      avgWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
    }

    return { upper, middle, lower, currentWidth, avgWidth };
  }
}

// ========================================
// 12. Resistance Filter (抵抗帯フィルター)
// ========================================

class ResistanceFilter {
  /**
   * 直近の高値/安値付近でのエントリーをフィルタリング
   * 天井・底での逆張りリスクを回避
   */
  checkResistance(prices, candles, signal, timeframeSeconds) {
    if (prices.length < 20 || candles.length < 20) {
      return { blocked: false, reason: null };
    }

    const currentPrice = prices[prices.length - 1];

    // 直近N期間の高値・安値を取得
    const lookbackPeriod = Math.min(50, candles.length);
    const recentCandles = candles.slice(-lookbackPeriod);

    const highestHigh = Math.max(...recentCandles.map(c => c.high));
    const lowestLow = Math.min(...recentCandles.map(c => c.low));
    const priceRange = highestHigh - lowestLow;

    // 抵抗帯の閾値（価格レンジの5%以内を抵抗帯とみなす）
    const resistanceThreshold = priceRange * 0.05;

    // 現在価格が高値/安値付近かチェック
    const nearHighest = currentPrice >= (highestHigh - resistanceThreshold);
    const nearLowest = currentPrice <= (lowestLow + resistanceThreshold);

    // HIGHシグナルで天井付近 → ブロック
    if ((signal === 'HIGH' || signal === 'STRONG_HIGH') && nearHighest) {
      return {
        blocked: true,
        reason: 'NEAR_RESISTANCE',
        details: {
          currentPrice,
          highestHigh,
          distance: highestHigh - currentPrice,
          threshold: resistanceThreshold
        }
      };
    }

    // LOWシグナルで底付近 → ブロック
    if ((signal === 'LOW' || signal === 'STRONG_LOW') && nearLowest) {
      return {
        blocked: true,
        reason: 'NEAR_SUPPORT',
        details: {
          currentPrice,
          lowestLow,
          distance: currentPrice - lowestLow,
          threshold: resistanceThreshold
        }
      };
    }

    return { blocked: false, reason: null };
  }
}

// ========================================
// 13. Timeframe Config (時間枠別設定)
// ========================================

const TIMEFRAME_CONFIGS = {
  15: {
    name: '15秒',
    // 指標の重み設定
    weights: {
      macd: 1.0,        // MACDは参考程度
      adx: 0.5,         // ADXは15秒では信頼性低
      stochastic: 1.5,  // ストキャスティクスは有効
      atr: 1.0,
      roc: 2.5,         // ROCを重視（短期の勢い）
      sentiment: 0,     // センチメントは無効
      bb: 2.0           // BB拡張率を重視
    },
    // シグナル閾値
    thresholds: {
      highScore: 20,      // HIGHシグナルの閾値
      strongScore: 40,    // STRONG_HIGHの閾値
      minConfidence: 55   // 最小信頼度
    },
    // Phase別の追加設定
    phaseConfig: {
      TREND: { scoreMultiplier: 1.2, confidenceBonus: 5 },
      RANGE: { scoreMultiplier: 0.8, confidenceBonus: -5 }
    },
    // BB拡張率の閾値
    bbExpansionThreshold: 1.2,
    // 抵抗帯フィルター有効
    resistanceFilterEnabled: true
  },
  30: {
    name: '30秒',
    weights: {
      macd: 1.2,
      adx: 0.8,
      stochastic: 1.5,
      atr: 1.0,
      roc: 2.0,
      sentiment: 0,     // センチメントは無効
      bb: 1.8
    },
    thresholds: {
      highScore: 18,
      strongScore: 38,
      minConfidence: 55
    },
    phaseConfig: {
      TREND: { scoreMultiplier: 1.2, confidenceBonus: 5 },
      RANGE: { scoreMultiplier: 0.85, confidenceBonus: -3 }
    },
    bbExpansionThreshold: 1.25,
    resistanceFilterEnabled: true
  },
  60: {
    name: '60秒',
    weights: {
      macd: 1.5,
      adx: 1.2,
      stochastic: 1.3,
      atr: 1.0,
      roc: 1.8,
      sentiment: 0,     // センチメントは無効
      bb: 1.5
    },
    thresholds: {
      highScore: 15,
      strongScore: 35,
      minConfidence: 58
    },
    phaseConfig: {
      TREND: { scoreMultiplier: 1.15, confidenceBonus: 5 },
      RANGE: { scoreMultiplier: 0.9, confidenceBonus: 0 }
    },
    bbExpansionThreshold: 1.3,
    resistanceFilterEnabled: true
  },
  180: {
    name: '3分',
    weights: {
      macd: 2.0,
      adx: 1.5,
      stochastic: 1.2,
      atr: 1.0,
      roc: 1.5,
      sentiment: 1.5,   // センチメント有効（長期）
      bb: 1.2
    },
    thresholds: {
      highScore: 12,
      strongScore: 30,
      minConfidence: 60
    },
    phaseConfig: {
      TREND: { scoreMultiplier: 1.1, confidenceBonus: 8 },
      RANGE: { scoreMultiplier: 0.95, confidenceBonus: 0 }
    },
    bbExpansionThreshold: 1.35,
    resistanceFilterEnabled: true
  },
  300: {
    name: '5分',
    weights: {
      macd: 2.0,
      adx: 1.8,
      stochastic: 1.0,
      atr: 1.0,
      roc: 1.2,
      sentiment: 2.0,   // センチメント有効（長期）
      bb: 1.0
    },
    thresholds: {
      highScore: 10,
      strongScore: 28,
      minConfidence: 62
    },
    phaseConfig: {
      TREND: { scoreMultiplier: 1.1, confidenceBonus: 10 },
      RANGE: { scoreMultiplier: 1.0, confidenceBonus: 0 }
    },
    bbExpansionThreshold: 1.4,
    resistanceFilterEnabled: true
  }
};

// 仮想通貨用の追加調整
const CRYPTO_ADJUSTMENTS = {
  // 閾値を1.5倍に
  thresholdMultiplier: 1.5,
  // 信頼度の下限を上げる
  minConfidenceBonus: 5,
  // BB拡張率の閾値を緩和
  bbExpansionMultiplier: 1.2
};

// ========================================
// 14. Enhanced Multi-Dimensional Analyzer V2
// ========================================

class MultiDimensionalAnalyzerV2 {
  constructor() {
    this.macd = new MACDIndicator();
    this.adx = new ADXIndicator();
    this.stochastic = new StochasticIndicator();
    this.atr = new ATRIndicator();
    this.roc = new ROCIndicator();
    this.sentiment = new MarketSentimentAnalyzer();
    this.phaseDetector = new PhaseDetector();
    this.resistanceFilter = new ResistanceFilter();

    // 既存のアナライザー
    this.timeframeTrendAnalyzer = new TimeframeTrendAnalyzer();
    this.enhancedIndicatorCalculator = new EnhancedIndicatorCalculator();
    this.multiScaleTrendAnalyzer = new MultiScaleTrendAnalyzer();

    // 🆕 MTF（マルチタイムフレーム）用キャッシュ
    // 各時間枠の最新分析結果を保存（5秒間有効）
    this.mtfCache = new Map();
    this.mtfCacheExpiry = 5000; // 5秒
  }

  // 🆕 MTFキャッシュに結果を保存
  cacheMTFResult(timeframeSeconds, result) {
    this.mtfCache.set(timeframeSeconds, {
      result,
      timestamp: Date.now()
    });
  }

  // 🆕 MTFキャッシュから結果を取得
  getMTFCache(timeframeSeconds) {
    const cached = this.mtfCache.get(timeframeSeconds);
    if (cached && (Date.now() - cached.timestamp) < this.mtfCacheExpiry) {
      return cached.result;
    }
    return null;
  }

  // 🆕 上位タイムフレームのリストを取得
  getUpperTimeframes(currentTimeframe) {
    const allTimeframes = [15, 30, 60, 180, 300];
    return allTimeframes.filter(tf => tf > currentTimeframe);
  }

  // 仮想通貨ペア判定
  isCryptocurrencyPair(asset) {
    if (!asset) return false;
    const cryptoPrefixes = ['BTC', 'ETH', 'LTC', 'XRP', 'BCH', 'ADA', 'DOT', 'DOGE'];
    return cryptoPrefixes.some(prefix => asset.startsWith(prefix));
  }

  // 時間枠に応じた感度調整係数
  getScaleFactor(timeframeSeconds) {
    if (timeframeSeconds <= 15) return 100;
    if (timeframeSeconds <= 30) return 50;
    if (timeframeSeconds <= 60) return 20;
    if (timeframeSeconds <= 180) return 5;
    return 1;
  }

  // 時間枠に応じた期間スケーリング係数
  getPeriodScaleFactor(timeframeSeconds) {
    if (timeframeSeconds <= 15) return 0.25;
    if (timeframeSeconds <= 30) return 0.5;
    if (timeframeSeconds <= 60) return 1.0;
    if (timeframeSeconds <= 180) return 3.0;
    return 5.0;
  }

  /**
   * 新アーキテクチャによる分析
   * 通貨タイプ → 時間枠設定 → Phase検出 → TREND/RANGEロジック → 抵抗帯フィルター → シグナル出力
   */
  analyzeV2(data, timeframeSeconds, asset = null) {
    const { prices, candles, ticks } = data;

    misLog(`\n[V2] ════════════════════════════════════════════════════════`);
    misLog(`[V2] 🔍 V2アーキテクチャ分析開始 - ${timeframeSeconds}秒`);
    misLog(`[V2] 📊 データ量: prices=${prices.length}, candles=${candles.length}, ticks=${ticks.length}`);

    // 1. 通貨タイプ判定
    const isCrypto = this.isCryptocurrencyPair(asset);
    misLog(`[V2] 💱 通貨: ${asset || 'unknown'} (${isCrypto ? '仮想通貨' : '法定通貨'})`);

    // 2. 時間枠設定を取得
    const config = TIMEFRAME_CONFIGS[timeframeSeconds] || TIMEFRAME_CONFIGS[60];
    misLog(`[V2] ⏱️ 設定: ${config.name}`);

    // 3. Phase検出（TREND/RANGE）
    const phaseResult = this.phaseDetector.detectPhase(candles, prices, timeframeSeconds);
    misLog(`[V2] ────────────────────────────────────────────────────────`);
    misLog(`[V2] 📈 Phase検出結果:`);
    misLog(`[V2]   Phase: ${phaseResult.phase} (信頼度: ${phaseResult.confidence}%)`);
    misLog(`[V2]   トレンド方向: ${phaseResult.trendDirection}`);
    misLog(`[V2]   BB拡張率: ${phaseResult.details.bbExpansionRate} (>1.2でTREND)`);
    misLog(`[V2]   ADX: ${phaseResult.details.adx} (>20でトレンド強い)`);
    misLog(`[V2]   %B: ${phaseResult.details.percentB} (0-1, 0.5が中央)`);

    // 4. 各指標を計算
    const scaleFactor = this.getScaleFactor(timeframeSeconds);
    const periodScaleFactor = this.getPeriodScaleFactor(timeframeSeconds);

    const macdResult = this.macd.calculate(prices, scaleFactor, periodScaleFactor);
    const adxResult = this.adx.calculate(candles, timeframeSeconds);
    const stochasticResult = this.stochastic.calculate(candles, 14, periodScaleFactor);
    const atrResult = this.atr.calculate(candles, 14, scaleFactor);
    const rocResult = this.roc.calculate(prices, 10, scaleFactor, periodScaleFactor);

    // センチメントは長期（180秒以上）のみ
    let sentimentResult = { sentiment: 'NEUTRAL', strength: 0 };
    if (timeframeSeconds >= 180) {
      sentimentResult = this.sentiment.analyze(ticks, scaleFactor, periodScaleFactor);
    }

    // 各指標のログ出力
    misLog(`[V2] ────────────────────────────────────────────────────────`);
    misLog(`[V2] 📊 各指標の計算結果:`);
    misLog(`[V2]   MACD: signal=${macdResult.signal}, strength=${macdResult.strength.toFixed(2)}`);
    misLog(`[V2]   ADX: adx=${adxResult.adx.toFixed(1)}, +DI=${adxResult.plusDI.toFixed(1)}, -DI=${adxResult.minusDI.toFixed(1)}`);
    misLog(`[V2]   Stochastic: signal=${stochasticResult.signal}, K=${stochasticResult.k.toFixed(1)}, D=${stochasticResult.d.toFixed(1)}`);
    misLog(`[V2]   ATR: strength=${atrResult.strength.toFixed(2)}, atr%=${atrResult.atrPercent.toFixed(4)}`);
    misLog(`[V2]   ROC: signal=${rocResult.signal}, roc=${rocResult.roc.toFixed(4)}`);
    if (timeframeSeconds >= 180) {
      misLog(`[V2]   Sentiment: ${sentimentResult.sentiment}, strength=${sentimentResult.strength.toFixed(2)}`);
    }

    // 5. Phase別ロジックでスコア計算
    const baseWeights = config.weights;
    let totalScore = 0;
    let maxScore = 0;

    // 🆕 動的重み付けシステム
    // ボラティリティレベルの判定（ATR%ベース）
    const volatilityLevel = atrResult.atrPercent;
    let volatilityClass;
    if (volatilityLevel > 0.5) {
      volatilityClass = 'HIGH';
    } else if (volatilityLevel > 0.2) {
      volatilityClass = 'MEDIUM';
    } else {
      volatilityClass = 'LOW';
    }

    // 動的重み調整係数
    const dynamicMultipliers = {
      macd: 1.0,
      adx: 1.0,
      stochastic: 1.0,
      atr: 1.0,
      roc: 1.0,
      sentiment: 1.0,
      bb: 1.0
    };

    // Phase + ボラティリティに基づく動的調整
    if (phaseResult.phase === 'TREND') {
      // トレンド相場：トレンド追随指標を重視
      dynamicMultipliers.macd *= 1.3;
      dynamicMultipliers.adx *= 1.5;
      dynamicMultipliers.roc *= 1.2;
      dynamicMultipliers.stochastic *= 0.7; // 逆張り指標を軽視

      if (volatilityClass === 'HIGH') {
        // 高ボラ+トレンド：ATRとROCをさらに重視
        dynamicMultipliers.atr *= 1.4;
        dynamicMultipliers.roc *= 1.3;
      }
    } else if (phaseResult.phase === 'RANGE') {
      // レンジ相場：逆張り指標を重視
      dynamicMultipliers.stochastic *= 1.5;
      dynamicMultipliers.macd *= 0.8;
      dynamicMultipliers.adx *= 0.5;

      if (volatilityClass === 'LOW') {
        // 低ボラ+レンジ：Stochasticをさらに重視
        dynamicMultipliers.stochastic *= 1.3;
      }
    } else {
      // TRANSITION相場：バランス重視、やや保守的
      dynamicMultipliers.macd *= 0.9;
      dynamicMultipliers.adx *= 0.9;
      dynamicMultipliers.stochastic *= 1.1;
    }

    // ADX強度による追加調整
    if (adxResult.adx > 40) {
      // 強いトレンド時：トレンド指標をブースト
      dynamicMultipliers.macd *= 1.2;
      dynamicMultipliers.roc *= 1.2;
    } else if (adxResult.adx < 20) {
      // 弱いトレンド時：Stochasticをブースト
      dynamicMultipliers.stochastic *= 1.2;
    }

    // 最終的な動的重み計算
    const dynamicWeights = {
      macd: baseWeights.macd * dynamicMultipliers.macd,
      adx: baseWeights.adx * dynamicMultipliers.adx,
      stochastic: baseWeights.stochastic * dynamicMultipliers.stochastic,
      atr: baseWeights.atr * dynamicMultipliers.atr,
      roc: baseWeights.roc * dynamicMultipliers.roc,
      sentiment: baseWeights.sentiment * dynamicMultipliers.sentiment,
      bb: baseWeights.bb * dynamicMultipliers.bb
    };

    misLog(`[V2] ⚖️ 動的重み付け:`);
    misLog(`[V2]   ボラティリティ: ${volatilityClass} (ATR%: ${(volatilityLevel * 100).toFixed(2)}%)`);
    misLog(`[V2]   Phase: ${phaseResult.phase}, ADX: ${adxResult.adx.toFixed(1)}`);
    misLog(`[V2]   MACD: ${baseWeights.macd}→${dynamicWeights.macd.toFixed(2)} | ADX: ${baseWeights.adx}→${dynamicWeights.adx.toFixed(2)}`);
    misLog(`[V2]   Stoch: ${baseWeights.stochastic}→${dynamicWeights.stochastic.toFixed(2)} | ROC: ${baseWeights.roc}→${dynamicWeights.roc.toFixed(2)}`);

    // MACD（動的重み適用）
    totalScore += macdResult.strength * dynamicWeights.macd;
    maxScore += 10 * dynamicWeights.macd;

    // ADX（動的重み適用）
    totalScore += adxResult.strength * dynamicWeights.adx;
    maxScore += 10 * dynamicWeights.adx;

    // Stochastic（動的重み適用）
    totalScore += stochasticResult.strength * dynamicWeights.stochastic;
    maxScore += 10 * dynamicWeights.stochastic;

    // ATR（動的重み適用）
    totalScore += atrResult.strength * dynamicWeights.atr;
    maxScore += 10 * dynamicWeights.atr;

    // ROC（動的重み適用）
    totalScore += rocResult.strength * dynamicWeights.roc;
    maxScore += 10 * dynamicWeights.roc;

    // Sentiment（長期のみ、動的重み適用）
    if (timeframeSeconds >= 180) {
      totalScore += sentimentResult.strength * dynamicWeights.sentiment;
      maxScore += 10 * dynamicWeights.sentiment;
    }

    // BB拡張率ボーナス（トレンド相場で方向が一致する場合、動的重み適用）
    if (phaseResult.phase === 'TREND' && dynamicWeights.bb > 0) {
      const bbBonus = (phaseResult.details.bbExpansionRate - 1) * 10 * dynamicWeights.bb;
      if (phaseResult.trendDirection === 'UP') {
        totalScore += bbBonus;
      } else if (phaseResult.trendDirection === 'DOWN') {
        totalScore -= bbBonus;
      }
      maxScore += 10 * dynamicWeights.bb;
    }

    // 🆕 指標コンセンサス計算
    const indicatorDirections = [];

    // 各指標の方向性を判定（正:HIGH方向, 負:LOW方向, 0:中立）
    if (macdResult.strength > 2) indicatorDirections.push({ name: 'MACD', dir: 'HIGH' });
    else if (macdResult.strength < -2) indicatorDirections.push({ name: 'MACD', dir: 'LOW' });
    else indicatorDirections.push({ name: 'MACD', dir: 'NEUTRAL' });

    if (adxResult.strength > 2) indicatorDirections.push({ name: 'ADX', dir: 'HIGH' });
    else if (adxResult.strength < -2) indicatorDirections.push({ name: 'ADX', dir: 'LOW' });
    else indicatorDirections.push({ name: 'ADX', dir: 'NEUTRAL' });

    if (stochasticResult.strength > 2) indicatorDirections.push({ name: 'Stoch', dir: 'HIGH' });
    else if (stochasticResult.strength < -2) indicatorDirections.push({ name: 'Stoch', dir: 'LOW' });
    else indicatorDirections.push({ name: 'Stoch', dir: 'NEUTRAL' });

    if (atrResult.strength > 2) indicatorDirections.push({ name: 'ATR', dir: 'HIGH' });
    else if (atrResult.strength < -2) indicatorDirections.push({ name: 'ATR', dir: 'LOW' });
    else indicatorDirections.push({ name: 'ATR', dir: 'NEUTRAL' });

    if (rocResult.strength > 2) indicatorDirections.push({ name: 'ROC', dir: 'HIGH' });
    else if (rocResult.strength < -2) indicatorDirections.push({ name: 'ROC', dir: 'LOW' });
    else indicatorDirections.push({ name: 'ROC', dir: 'NEUTRAL' });

    // Sentimentは長期のみカウント
    if (timeframeSeconds >= 180) {
      if (sentimentResult.strength > 2) indicatorDirections.push({ name: 'Sent', dir: 'HIGH' });
      else if (sentimentResult.strength < -2) indicatorDirections.push({ name: 'Sent', dir: 'LOW' });
      else indicatorDirections.push({ name: 'Sent', dir: 'NEUTRAL' });
    }

    // コンセンサス集計
    const highCount = indicatorDirections.filter(i => i.dir === 'HIGH').length;
    const lowCount = indicatorDirections.filter(i => i.dir === 'LOW').length;
    const totalIndicators = indicatorDirections.length;
    const consensusRatio = Math.max(highCount, lowCount) / totalIndicators;
    const consensusDirection = highCount > lowCount ? 'HIGH' : (lowCount > highCount ? 'LOW' : 'NEUTRAL');

    // コンセンサスボーナス計算（4/5以上で+5%, 5/5以上で+10%, 5/6以上で+12%, 6/6で+15%）
    let consensusBonus = 0;
    if (consensusRatio >= 1.0) {
      consensusBonus = 15; // 全指標一致
    } else if (consensusRatio >= 0.833) { // 5/6
      consensusBonus = 12;
    } else if (consensusRatio >= 0.8) { // 4/5 or 5/6
      consensusBonus = 10;
    } else if (consensusRatio >= 0.6) { // 3/5 or 4/6
      consensusBonus = 5;
    }

    // スコアの方向とコンセンサス方向が一致する場合のみボーナス適用
    const scoreDirection = totalScore > 0 ? 'HIGH' : (totalScore < 0 ? 'LOW' : 'NEUTRAL');
    const consensusApplied = consensusBonus > 0 && scoreDirection === consensusDirection && scoreDirection !== 'NEUTRAL';

    misLog(`[V2] 🤝 指標コンセンサス:`);
    misLog(`[V2]   HIGH: ${highCount}/${totalIndicators} | LOW: ${lowCount}/${totalIndicators}`);
    misLog(`[V2]   一致率: ${(consensusRatio * 100).toFixed(0)}% (${consensusDirection})`);
    misLog(`[V2]   ボーナス: ${consensusApplied ? `+${consensusBonus}% (適用)` : `${consensusBonus}% (方向不一致で不適用)`}`);

    // 各指標の方向を表示
    const dirSymbols = indicatorDirections.map(i => {
      const symbol = i.dir === 'HIGH' ? '↑' : (i.dir === 'LOW' ? '↓' : '→');
      return `${i.name}:${symbol}`;
    });
    misLog(`[V2]   詳細: ${dirSymbols.join(' | ')}`);

    // 🆕 指標矛盾検出システム
    // 重要な指標ペア間の矛盾を検出し、信頼度にペナルティを適用
    const contradictions = [];

    // MACD vs Stochastic 矛盾チェック（トレンド vs モメンタム）
    const macdDir = indicatorDirections.find(i => i.name === 'MACD');
    const stochDir = indicatorDirections.find(i => i.name === 'Stoch');
    if (macdDir && stochDir && macdDir.dir !== 'NEUTRAL' && stochDir.dir !== 'NEUTRAL') {
      if (macdDir.dir !== stochDir.dir) {
        contradictions.push({
          pair: 'MACD-Stoch',
          reason: `MACD:${macdDir.dir} vs Stoch:${stochDir.dir}`,
          severity: 'medium'
        });
      }
    }

    // ADX vs ROC 矛盾チェック（トレンド強度 vs 変化率）
    const adxDir = indicatorDirections.find(i => i.name === 'ADX');
    const rocDir = indicatorDirections.find(i => i.name === 'ROC');
    if (adxDir && rocDir && adxDir.dir !== 'NEUTRAL' && rocDir.dir !== 'NEUTRAL') {
      if (adxDir.dir !== rocDir.dir) {
        contradictions.push({
          pair: 'ADX-ROC',
          reason: `ADX:${adxDir.dir} vs ROC:${rocDir.dir}`,
          severity: 'medium'
        });
      }
    }

    // MACD vs ROC 矛盾チェック（主要トレンド指標）
    if (macdDir && rocDir && macdDir.dir !== 'NEUTRAL' && rocDir.dir !== 'NEUTRAL') {
      if (macdDir.dir !== rocDir.dir) {
        contradictions.push({
          pair: 'MACD-ROC',
          reason: `MACD:${macdDir.dir} vs ROC:${rocDir.dir}`,
          severity: 'high' // 両方ともトレンド指標なので重要
        });
      }
    }

    // Phase vs 主要指標 矛盾チェック
    if (phaseResult.trendDirection !== 'NEUTRAL' && phaseResult.phase === 'TREND') {
      const phaseDir = phaseResult.trendDirection === 'UP' ? 'HIGH' : 'LOW';
      if (macdDir && macdDir.dir !== 'NEUTRAL' && macdDir.dir !== phaseDir) {
        contradictions.push({
          pair: 'Phase-MACD',
          reason: `Phase:${phaseDir} vs MACD:${macdDir.dir}`,
          severity: 'high'
        });
      }
    }

    // 矛盾ペナルティ計算
    let contradictionPenalty = 0;
    const highSeverityCount = contradictions.filter(c => c.severity === 'high').length;
    const mediumSeverityCount = contradictions.filter(c => c.severity === 'medium').length;

    contradictionPenalty = (highSeverityCount * 8) + (mediumSeverityCount * 4);
    contradictionPenalty = Math.min(contradictionPenalty, 25); // 最大25%ペナルティ

    misLog(`[V2] ⚔️ 指標矛盾検出:`);
    if (contradictions.length > 0) {
      misLog(`[V2]   矛盾数: ${contradictions.length} (高: ${highSeverityCount}, 中: ${mediumSeverityCount})`);
      contradictions.forEach(c => {
        misLog(`[V2]   ⚠️ ${c.pair}: ${c.reason} [${c.severity}]`);
      });
      misLog(`[V2]   ペナルティ: -${contradictionPenalty}%`);
    } else {
      misLog(`[V2]   ✅ 矛盾なし - 指標は一貫しています`);
    }

    // Phase別スコア調整
    const phaseConfig = config.phaseConfig[phaseResult.phase] || { scoreMultiplier: 1, confidenceBonus: 0 };
    totalScore *= phaseConfig.scoreMultiplier;

    // 正規化
    const normalizedScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    misLog(`[V2] ────────────────────────────────────────────────────────`);
    misLog(`[V2] 🧮 スコア計算:`);
    misLog(`[V2]   Raw Score: ${totalScore.toFixed(2)} / Max: ${maxScore.toFixed(2)}`);
    misLog(`[V2]   Normalized: ${normalizedScore.toFixed(2)}%`);
    misLog(`[V2]   Phase乗数: ${phaseConfig.scoreMultiplier}x`);

    // 6. 閾値設定（仮想通貨の場合は調整）
    let thresholds = { ...config.thresholds };
    if (isCrypto) {
      thresholds.highScore *= CRYPTO_ADJUSTMENTS.thresholdMultiplier;
      thresholds.strongScore *= CRYPTO_ADJUSTMENTS.thresholdMultiplier;
      thresholds.minConfidence += CRYPTO_ADJUSTMENTS.minConfidenceBonus;
    }

    // 7. シグナル判定（コンセンサスボーナス + 矛盾ペナルティ適用）
    let signal, confidence;
    const appliedConsensusBonus = consensusApplied ? consensusBonus : 0;
    const netAdjustment = appliedConsensusBonus - contradictionPenalty; // コンセンサスボーナス - 矛盾ペナルティ

    misLog(`[V2]   信頼度調整: コンセンサス+${appliedConsensusBonus}% - 矛盾${contradictionPenalty}% = ${netAdjustment >= 0 ? '+' : ''}${netAdjustment}%`);

    if (normalizedScore > thresholds.strongScore) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3 + phaseConfig.confidenceBonus + netAdjustment);
    } else if (normalizedScore > thresholds.highScore) {
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4 + phaseConfig.confidenceBonus + netAdjustment);
    } else if (normalizedScore < -thresholds.strongScore) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3 + phaseConfig.confidenceBonus + netAdjustment);
    } else if (normalizedScore < -thresholds.highScore) {
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4 + phaseConfig.confidenceBonus + netAdjustment);
    } else {
      signal = 'NEUTRAL';
      confidence = null;
    }

    // 信頼度の下限チェック
    if (confidence !== null && confidence < thresholds.minConfidence) {
      misLog(`[V2]   ⚠️ 信頼度不足: ${Math.round(confidence)}% < ${thresholds.minConfidence}% → NEUTRAL`);
      signal = 'NEUTRAL';
      confidence = null;
    }

    misLog(`[V2] ────────────────────────────────────────────────────────`);
    misLog(`[V2] 🎯 シグナル判定:`);
    misLog(`[V2]   閾値: HIGH>${thresholds.highScore}, STRONG>${thresholds.strongScore}`);
    misLog(`[V2]   判定: ${signal} (${confidence !== null ? Math.round(confidence) + '%' : '--'})`);

    // 🆕 7.5. マルチタイムフレーム（MTF）確認
    // 上位タイムフレームのトレンド方向を確認し、一致していればボーナス、逆ならペナルティ
    let mtfBonus = 0;
    let mtfPenalty = 0;
    const mtfResults = [];
    const upperTimeframes = this.getUpperTimeframes(timeframeSeconds);

    // 現在のシグナル方向を判定
    const currentDirection = signal.includes('HIGH') ? 'HIGH' : (signal.includes('LOW') ? 'LOW' : 'NEUTRAL');

    misLog(`[V2] 🔄 MTF（マルチタイムフレーム）確認:`);
    misLog(`[V2]   現在: ${timeframeSeconds}秒 → ${signal} (${currentDirection})`);
    misLog(`[V2]   上位TF: [${upperTimeframes.join(', ')}]秒`);

    if (signal !== 'NEUTRAL' && upperTimeframes.length > 0) {
      for (const upperTf of upperTimeframes) {
        const cachedResult = this.getMTFCache(upperTf);
        if (cachedResult) {
          const upperDirection = cachedResult.signal.includes('HIGH') ? 'HIGH' :
                                 (cachedResult.signal.includes('LOW') ? 'LOW' : 'NEUTRAL');

          mtfResults.push({
            timeframe: upperTf,
            signal: cachedResult.signal,
            direction: upperDirection,
            phase: cachedResult.phase
          });

          if (upperDirection === currentDirection) {
            // 上位TFと方向一致 → ボーナス
            const bonus = upperTf >= 180 ? 6 : (upperTf >= 60 ? 4 : 2);
            mtfBonus += bonus;
            misLog(`[V2]   ✅ ${upperTf}秒: ${cachedResult.signal} (${upperDirection}) → 一致 +${bonus}%`);
          } else if (upperDirection !== 'NEUTRAL' && upperDirection !== currentDirection) {
            // 上位TFと方向逆 → ペナルティ
            const penalty = upperTf >= 180 ? 8 : (upperTf >= 60 ? 5 : 3);
            mtfPenalty += penalty;
            misLog(`[V2]   ⛔ ${upperTf}秒: ${cachedResult.signal} (${upperDirection}) → 逆行 -${penalty}%`);
          } else {
            misLog(`[V2]   ➖ ${upperTf}秒: ${cachedResult.signal} (${upperDirection}) → 中立`);
          }
        } else {
          misLog(`[V2]   ❓ ${upperTf}秒: キャッシュなし（初回分析または期限切れ）`);
        }
      }

      // MTFボーナス/ペナルティの上限設定
      mtfBonus = Math.min(mtfBonus, 15);   // 最大+15%
      mtfPenalty = Math.min(mtfPenalty, 20); // 最大-20%

      const mtfNetAdjustment = mtfBonus - mtfPenalty;
      misLog(`[V2]   MTF調整: +${mtfBonus}% - ${mtfPenalty}% = ${mtfNetAdjustment >= 0 ? '+' : ''}${mtfNetAdjustment}%`);

      // 信頼度にMTF調整を適用
      if (confidence !== null) {
        confidence += mtfNetAdjustment;
        // 再度上限/下限チェック
        if (signal.includes('STRONG')) {
          confidence = Math.min(95, confidence);
        } else {
          confidence = Math.min(85, confidence);
        }

        // MTF逆行で信頼度が下限以下になった場合
        if (confidence < thresholds.minConfidence) {
          misLog(`[V2]   ⚠️ MTF逆行により信頼度低下: ${Math.round(confidence)}% < ${thresholds.minConfidence}% → NEUTRAL`);
          signal = 'NEUTRAL';
          confidence = null;
        }
      }
    } else {
      misLog(`[V2]   ➖ MTF確認スキップ（NEUTRAL or 最上位TF）`);
    }

    // 8. 抵抗帯フィルター
    let finalSignal = signal;
    let finalConfidence = confidence;
    let resistanceBlocked = false;

    if (config.resistanceFilterEnabled && signal !== 'NEUTRAL') {
      const resistanceCheck = this.resistanceFilter.checkResistance(prices, candles, signal, timeframeSeconds);
      misLog(`[V2] 🛡️ 抵抗帯フィルター: ${config.resistanceFilterEnabled ? '有効' : '無効'}`);
      if (resistanceCheck.blocked) {
        misLog(`[V2]   ⛔ ブロック: ${resistanceCheck.reason}`);
        if (resistanceCheck.details) {
          misLog(`[V2]   詳細: 現在価格=${resistanceCheck.details.currentPrice?.toFixed(5)}`);
        }
        finalSignal = 'NEUTRAL';
        finalConfidence = null;
        resistanceBlocked = true;
      } else {
        misLog(`[V2]   ✅ 通過（抵抗帯なし）`);
      }
    } else if (!config.resistanceFilterEnabled) {
      misLog(`[V2] 🛡️ 抵抗帯フィルター: 無効（この時間枠では使用しない）`);
    }

    misLog(`[V2] ════════════════════════════════════════════════════════`);
    misLog(`[V2] ✅ 最終結果: ${finalSignal} ${finalConfidence !== null ? `(${Math.round(finalConfidence)}%)` : ''}`);
    misLog(`[V2]    Phase: ${phaseResult.phase} | 方向: ${phaseResult.trendDirection} | スコア: ${normalizedScore.toFixed(1)}`);
    misLog(`[V2] ════════════════════════════════════════════════════════\n`);

    // 🆕 MTFキャッシュに結果を保存（他の時間枠から参照可能にする）
    const result = {
      signal: finalSignal,
      confidence: finalConfidence !== null ? Math.round(finalConfidence) : null,
      score: Math.round(normalizedScore),
      timeframe: timeframeSeconds,
      phase: phaseResult.phase,
      phaseConfidence: phaseResult.confidence,
      trendDirection: phaseResult.trendDirection,
      resistanceBlocked,
      consensus: {
        highCount,
        lowCount,
        totalIndicators,
        ratio: consensusRatio,
        direction: consensusDirection,
        bonus: appliedConsensusBonus,
        applied: consensusApplied
      },
      contradictions: {
        count: contradictions.length,
        highSeverity: highSeverityCount,
        mediumSeverity: mediumSeverityCount,
        penalty: contradictionPenalty,
        details: contradictions
      },
      mtf: {
        bonus: mtfBonus,
        penalty: mtfPenalty,
        netAdjustment: mtfBonus - mtfPenalty,
        upperTimeframesChecked: mtfResults.length,
        results: mtfResults
      },
      dynamicWeights: {
        volatilityClass,
        volatilityLevel,
        baseWeights: baseWeights,
        appliedWeights: dynamicWeights,
        multipliers: dynamicMultipliers
      },
      breakdown: {
        macd: macdResult,
        adx: adxResult,
        stochastic: stochasticResult,
        atr: atrResult,
        roc: rocResult,
        sentiment: sentimentResult,
        phase: phaseResult,
        weights: dynamicWeights,
        thresholds: thresholds
      }
    };

    // キャッシュに保存
    this.cacheMTFResult(timeframeSeconds, result);

    return result;
  }
}

// グローバルスコープに公開
if (typeof window !== 'undefined') {
  window.MultiDimensionalAnalyzer = MultiDimensionalAnalyzer;
  window.MACDIndicator = MACDIndicator;
  window.ADXIndicator = ADXIndicator;
  window.StochasticIndicator = StochasticIndicator;
  window.ATRIndicator = ATRIndicator;
  window.ROCIndicator = ROCIndicator;
  window.MarketSentimentAnalyzer = MarketSentimentAnalyzer;

  // 🆕 新しいアナライザーを公開
  window.TimeframeTrendAnalyzer = TimeframeTrendAnalyzer;
  window.EnhancedIndicatorCalculator = EnhancedIndicatorCalculator;
  window.MultiScaleTrendAnalyzer = MultiScaleTrendAnalyzer;

  // 🆕 V2アーキテクチャ
  window.PhaseDetector = PhaseDetector;
  window.ResistanceFilter = ResistanceFilter;
  window.MultiDimensionalAnalyzerV2 = MultiDimensionalAnalyzerV2;
  window.TIMEFRAME_CONFIGS = TIMEFRAME_CONFIGS;
  window.CRYPTO_ADJUSTMENTS = CRYPTO_ADJUSTMENTS;
}
