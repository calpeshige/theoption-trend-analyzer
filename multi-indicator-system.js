/**
 * Multi-Dimensional Indicator System
 * Version: 1.0.0
 *
 * 20個以上のテクニカル指標を統合した高精度分析システム
 */

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
  calculate(candles) {
    if (candles.length < 14) {
      return { adx: 0, plusDI: 0, minusDI: 0, strength: 0 };
    }

    let plusDM = 0, minusDM = 0, tr = 0;

    for (let i = 1; i < candles.length; i++) {
      const highDiff = candles[i].high - candles[i-1].high;
      const lowDiff = candles[i-1].low - candles[i].low;

      plusDM += highDiff > 0 && highDiff > lowDiff ? highDiff : 0;
      minusDM += lowDiff > 0 && lowDiff > highDiff ? lowDiff : 0;

      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i-1].close;

      tr += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }

    const plusDI = (plusDM / tr) * 100;
    const minusDI = (minusDM / tr) * 100;
    const adx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

    // 強度スコア（0-10）
    const strength = Math.min(10, adx / 5);

    return { adx, plusDI, minusDI, strength };
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

    console.log(`[Multi-Indicator] 🔍 テクニカル分析開始 (データ: prices=${prices.length}件, candles=${candles.length}件, ticks=${ticks.length}件)`);

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
    console.log(`[Multi-Indicator] 各指標のstrength値:`, {
      macd: macdResult.strength.toFixed(2),
      adx: adxResult.strength.toFixed(2),
      stochastic: stochasticResult.strength.toFixed(2),
      atr: atrResult.strength.toFixed(2),
      roc: rocResult.strength.toFixed(2),
      sentiment: sentimentResult.strength.toFixed(2)
    });

    // デバッグ: 各指標のスコア貢献度を確認
    console.log(`[Multi-Indicator] 📊 各指標のスコア貢献度:`, {
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
    console.log(`[Multi-Indicator] ⚖️ スコア計算: totalScore=${totalScore.toFixed(2)}点 / maxScore=${maxScore}点 = normalizedScore=${normalizedScore.toFixed(2)}, trendConfidence=${trendConfidence.toFixed(2)}`);

    // 🆕 ATRに基づく動的しきい値調整
    // ボラティリティが低い通貨ペア(USD/JPY等)では低いしきい値、高い通貨ペア(仮想通貨等)では高いしきい値を使用
    // ATR strength: 0-10の範囲、絶対値が大きいほどボラティリティが高い
    const atrAbsolute = Math.abs(atrResult.strength);
    // volatilityFactor: 0.5～1.5の範囲で調整
    // ATR=0→0.5倍(しきい値: 7.5/25), ATR=2→0.7倍(10.5/35), ATR=5→1.0倍(15/50), ATR=10→1.5倍(22.5/75)
    const volatilityFactor = Math.max(0.5, Math.min(1.5, 0.5 + (atrAbsolute / 10) * 1.0));

    const highThreshold = 15 * volatilityFactor;
    const strongThreshold = 50 * volatilityFactor;

    console.log(`[Multi-Indicator] 🎚️ 動的しきい値: ATR=${atrAbsolute.toFixed(2)} → volatilityFactor=${volatilityFactor.toFixed(2)} → HIGH=±${highThreshold.toFixed(1)}, STRONG=±${strongThreshold.toFixed(1)}`);

    // シグナル判定（動的しきい値を使用）
    let signal, confidence;

    if (normalizedScore > strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3);
      console.log(`[Multi-Indicator] 🎯 判定: STRONG_HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore > highThreshold) {
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4);
      console.log(`[Multi-Indicator] 🎯 判定: HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${highThreshold.toFixed(1)})`);
    } else if (normalizedScore < -strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3);
      console.log(`[Multi-Indicator] 🎯 判定: STRONG_LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore < -highThreshold) {
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4);
      console.log(`[Multi-Indicator] 🎯 判定: LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${highThreshold.toFixed(1)})`);
    } else {
      signal = 'NEUTRAL';
      confidence = 50 + Math.abs(normalizedScore) * 1.5;
      console.log(`[Multi-Indicator] 🎯 判定: NEUTRAL (normalizedScore=${normalizedScore.toFixed(2)} が -${highThreshold.toFixed(1)}～${highThreshold.toFixed(1)}の範囲内)`);
    }

    console.log(`[Multi-Indicator] ✅ 最終結果: signal=${signal}, confidence=${Math.round(confidence)}%`);
    console.log(`[Multi-Indicator] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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

  // 時間枠別分析（15秒、30秒、60秒、3分、5分）
  analyzeTimeframe(data, timeframeSeconds) {
    const { prices, candles, ticks } = data;

    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🔍 テクニカル分析開始 (データ: prices=${prices.length}件, candles=${candles.length}件, ticks=${ticks.length}件)`);

    // 時間枠に応じた係数を取得
    const scaleFactor = this.getScaleFactor(timeframeSeconds);
    const periodScaleFactor = this.getPeriodScaleFactor(timeframeSeconds);
    console.log(`[Multi-Indicator] 時間枠=${timeframeSeconds}秒, 感度係数=${scaleFactor}倍, 期間係数=${periodScaleFactor}倍`);
    console.log(`[Multi-Indicator] ${timeframeSeconds}秒 入力データ: prices=${prices.length}件, 最新5件=${prices.slice(-5).map(p => p.toFixed(3)).join(', ')}`);

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
    const adxResult = this.adx.calculate(relevantCandles);
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

    console.log(`[Multi-Indicator-Enhanced] ${timeframeSeconds}秒 新規指標:`, {
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
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 各指標のstrength値:`, {
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

    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 📊 各指標のスコア貢献度:`, {
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
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 ⚖️ スコア計算: totalScore=${totalScore.toFixed(2)}点 / maxScore=${maxScore}点 = normalizedScore=${normalizedScore.toFixed(2)}, trendConfidence=${trendConfidence.toFixed(2)}`);

    // 🆕 ATRに基づく動的しきい値調整
    // ボラティリティが低い通貨ペア(USD/JPY等)では低いしきい値、高い通貨ペア(仮想通貨等)では高いしきい値を使用
    const atrAbsolute = Math.abs(atrResult.strength);
    const volatilityFactor = Math.max(0.5, Math.min(1.5, 0.5 + (atrAbsolute / 10) * 1.0));

    const highThreshold = 15 * volatilityFactor;
    const strongThreshold = 50 * volatilityFactor;

    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎚️ 動的しきい値: ATR=${atrAbsolute.toFixed(2)} → volatilityFactor=${volatilityFactor.toFixed(2)} → HIGH=±${highThreshold.toFixed(1)}, STRONG=±${strongThreshold.toFixed(1)}`);

    // シグナル判定（動的しきい値を使用）
    let signal, confidence;

    if (normalizedScore > strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3);
      console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: STRONG_HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore > highThreshold) {
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4);
      console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: HIGH (normalizedScore=${normalizedScore.toFixed(2)} > ${highThreshold.toFixed(1)})`);
    } else if (normalizedScore < -strongThreshold && trendConfidence > 7) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3);
      console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: STRONG_LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${strongThreshold.toFixed(1)} かつ trendConfidence=${trendConfidence.toFixed(2)} > 7)`);
    } else if (normalizedScore < -highThreshold) {
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4);
      console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: LOW (normalizedScore=${normalizedScore.toFixed(2)} < -${highThreshold.toFixed(1)})`);
    } else {
      signal = 'NEUTRAL';
      confidence = null;  // 見送りの場合はパーセンテージなし
      console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 🎯 判定: NEUTRAL (normalizedScore=${normalizedScore.toFixed(2)} が -${highThreshold.toFixed(1)}～${highThreshold.toFixed(1)}の範囲内)`);
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
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 ✅ 最終結果: signal=${signal}, confidence=${confidenceDisplay} (調整前: ${confidence !== null ? Math.round(confidence) : '--'})`);
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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
}
