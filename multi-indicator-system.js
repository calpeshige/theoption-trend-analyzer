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
// 7. Integrated Analysis System
// ========================================

class MultiDimensionalAnalyzer {
  constructor() {
    this.macd = new MACDIndicator();
    this.adx = new ADXIndicator();
    this.stochastic = new StochasticIndicator();
    this.atr = new ATRIndicator();
    this.roc = new ROCIndicator();
    this.sentiment = new MarketSentimentAnalyzer();
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

    // ADX（重み: 15%）- トレンドの強さを信頼度に反映
    const trendConfidence = adxResult.strength * 1.5;
    maxScore += 15;

    // Stochastic（重み: 15%）
    totalScore += stochasticResult.strength * 1.5;
    maxScore += 15;

    // ATR（重み: 10%）- ボラティリティを信頼度に反映
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

    // 正規化（-100 to +100）
    const normalizedScore = (totalScore / maxScore) * 100;

    // デバッグ: スコアを確認
    console.log(`[Multi-Indicator] totalScore=${totalScore.toFixed(2)}, maxScore=${maxScore}, normalizedScore=${normalizedScore.toFixed(2)}, trendConfidence=${trendConfidence.toFixed(2)}`);

    // シグナル判定（判定基準を緩和して感度向上）
    let signal, confidence;

    if (normalizedScore > 50 && trendConfidence > 7) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3);
    } else if (normalizedScore > 15) {  // 30 → 15 に緩和
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4);
    } else if (normalizedScore < -50 && trendConfidence > 7) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3);
    } else if (normalizedScore < -15) {  // -30 → -15 に緩和
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4);
    } else {
      signal = 'NEUTRAL';
      confidence = 50 + Math.abs(normalizedScore) * 1.5;  // 信頼度向上: 30-45% → 50-72%
    }

    console.log(`[Multi-Indicator] 判定結果: signal=${signal}, confidence=${Math.round(confidence)}%`);

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

    // 時間枠による重み調整
    let macdWeight = 2.0;
    let rocWeight = 2.0;
    let sentimentWeight = 2.0;

    if (timeframeSeconds <= 30) {
      // 超短期: センチメントとROCを重視
      sentimentWeight = 2.5;
      rocWeight = 2.3;
      macdWeight = 1.5;
    } else if (timeframeSeconds >= 180) {
      // 長期: MACDとADXを重視
      macdWeight = 2.5;
      sentimentWeight = 1.5;
    }

    // スコア統合
    let totalScore = 0;
    let maxScore = 0;

    totalScore += macdResult.strength * macdWeight;
    maxScore += 10 * macdWeight;

    const trendConfidence = adxResult.strength * 1.5;
    maxScore += 15;

    totalScore += stochasticResult.strength * 1.5;
    maxScore += 15;

    const volatilityBonus = atrResult.strength;
    maxScore += 10;

    totalScore += rocResult.strength * rocWeight;
    maxScore += 10 * rocWeight;

    totalScore += sentimentResult.strength * sentimentWeight;
    maxScore += 10 * sentimentWeight;

    // デバッグ: 各指標のstrength値を確認
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 各指標のstrength値:`, {
      macd: macdResult.strength.toFixed(2),
      adx: adxResult.strength.toFixed(2),
      stochastic: stochasticResult.strength.toFixed(2),
      atr: atrResult.strength.toFixed(2),
      roc: rocResult.strength.toFixed(2),
      sentiment: sentimentResult.strength.toFixed(2)
    });

    // 正規化
    const normalizedScore = (totalScore / maxScore) * 100;

    // デバッグ: スコアを確認
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 totalScore=${totalScore.toFixed(2)}, maxScore=${maxScore}, normalizedScore=${normalizedScore.toFixed(2)}, trendConfidence=${trendConfidence.toFixed(2)}`);

    // シグナル判定（判定基準を緩和して感度向上）
    let signal, confidence;

    if (normalizedScore > 50 && trendConfidence > 7) {
      signal = 'STRONG_HIGH';
      confidence = Math.min(95, 70 + normalizedScore / 3);
    } else if (normalizedScore > 15) {  // 30 → 15 に緩和
      signal = 'HIGH';
      confidence = Math.min(85, 60 + normalizedScore / 4);
    } else if (normalizedScore < -50 && trendConfidence > 7) {
      signal = 'STRONG_LOW';
      confidence = Math.min(95, 70 + Math.abs(normalizedScore) / 3);
    } else if (normalizedScore < -15) {  // -30 → -15 に緩和
      signal = 'LOW';
      confidence = Math.min(85, 60 + Math.abs(normalizedScore) / 4);
    } else {
      signal = 'NEUTRAL';
      confidence = null;  // 見送りの場合はパーセンテージなし
    }

    const confidenceDisplay = confidence !== null ? `${Math.round(confidence)}%` : '--';
    console.log(`[Multi-Indicator-Timeframe] ${timeframeSeconds}秒 判定結果: signal=${signal}, confidence=${confidenceDisplay}`);

    return {
      signal,
      confidence: confidence !== null ? Math.round(confidence) : null,
      score: Math.round(normalizedScore),
      timeframe: timeframeSeconds,
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
}
