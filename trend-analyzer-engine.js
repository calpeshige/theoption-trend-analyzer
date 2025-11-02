/**
 * TheOption Trend Analyzer Engine
 * Version: 3.0.0
 *
 * リアルタイム価格データからトレンド分析を実行
 * 各取引時間（5秒/15秒/30秒/60秒/3分/5分）に最適化された階層的分析
 */

class SimpleTrendAnalyzer {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 600; // 最大600秒（10分）保持
    this.prices = [];
    this.timestamps = [];
    this.lastAnalysis = null;

    // 取引時間別の分析期間設定（個別最適化）
    // ルール: 5秒〜3分取引は長期が600秒を超えない、5分取引は長期600秒
    this.timeframes = {
      5: { long: 50, mid: 25, short: 10, minData: 50 },         // 5秒取引: 現状維持
      15: { long: 150, mid: 75, short: 30, minData: 150 },      // 15秒取引: 2.5分/1.25分/30秒
      30: { long: 300, mid: 150, short: 60, minData: 300 },     // 30秒取引: 5分/2.5分/1分
      60: { long: 480, mid: 240, short: 120, minData: 480 },    // 60秒取引: 8分/4分/2分
      180: { long: 540, mid: 360, short: 180, minData: 540 },   // 3分取引: 9分/6分/3分
      300: { long: 600, mid: 300, short: 150, minData: 600 }    // 5分取引: 10分/5分/2.5分
    };
  }

  /**
   * 新しい価格データを追加
   */
  addPrice(price, timestamp = Date.now()) {
    this.prices.push(parseFloat(price));
    this.timestamps.push(timestamp);

    // 古いデータを削除
    if (this.prices.length > this.maxSize) {
      this.prices.shift();
      this.timestamps.shift();
    }
  }

  /**
   * メイン分析関数（取引時間を指定して階層的分析）
   * @param {number} tradingTime - 取引時間（5, 15, 30, 60, 180, 300秒）
   */
  analyze(tradingTime = 60) {
    // 取引時間の設定を取得（デフォルトは60秒）
    const tf = this.timeframes[tradingTime] || this.timeframes[60];

    // 最低データ数チェック
    if (this.prices.length < tf.minData) {
      const waitTime = Math.ceil((tf.minData - this.prices.length) / 60);
      return {
        signal: 'WAIT',
        confidence: 0,
        reason: `データ収集中（あと約${waitTime}分）`,
        dataPoints: this.prices.length,
        requiredPoints: tf.minData,
        tradingTime: tradingTime
      };
    }

    const currentPrice = this.prices[this.prices.length - 1];

    // 3段階MA計算（取引時間ごとに個別最適化された期間）
    const maLong = this.calculateMA(tf.long);    // 長期トレンド - 全体の流れ
    const maMid = this.calculateMA(tf.mid);      // 中期トレンド - 現在の勢い
    const maShort = this.calculateMA(tf.short);  // 短期トレンド - エントリータイミング

    // RSI（中期トレンドに基づく）
    const rsi = this.calculateRSI(tf.mid);

    // ボリンジャーバンド（長期トレンドに基づく）
    const bb = this.calculateBollingerBands(tf.long, 2);

    // MACD（中期トレンドベース）
    const macd = this.calculateMACD(Math.floor(tf.mid / 2), tf.mid, Math.floor(tf.mid / 3));

    // トレンド判定
    const trendSignals = this.determineTrendHierarchical({
      maLong, maMid, maShort, rsi, bb, macd, currentPrice, tradingTime
    });

    this.lastAnalysis = {
      timestamp: Date.now(),
      tradingTime: tradingTime,
      signal: trendSignals.signal,
      confidence: trendSignals.confidence,
      reason: trendSignals.reason,
      hierarchicalTrend: trendSignals.hierarchicalTrend,
      indicators: {
        longTrend: maLong.toFixed(2),   // 長期MA - 全体の流れ
        midTrend: maMid.toFixed(2),     // 中期MA - 現在の勢い
        shortTrend: maShort.toFixed(2), // 短期MA - エントリータイミング
        rsi: rsi.toFixed(2),
        bollingerBands: {
          upper: bb.upper.toFixed(2),
          middle: bb.middle.toFixed(2),
          lower: bb.lower.toFixed(2)
        },
        macd: {
          macd: macd.macd.toFixed(2),
          signal: macd.signal.toFixed(2),
          histogram: macd.histogram.toFixed(2)
        }
      },
      currentPrice: currentPrice.toFixed(2),
      dataPoints: this.prices.length
    };

    return this.lastAnalysis;
  }

  /**
   * 3段階トレンド判定（取引時間に最適化）
   */
  determineTrendHierarchical({ maLong, maMid, maShort, rsi, bb, macd, currentPrice, tradingTime }) {
    let score = 0;
    const signals = [];
    const hierarchicalTrend = {};

    // 各取引時間ごとの期間を取得
    const tf_config = this.timeframes[tradingTime];

    // 長期トレンド判定（全体の流れ）
    const longTrend = maMid > maLong ? 'UP' : 'DOWN';
    hierarchicalTrend.long = longTrend;
    if (longTrend === 'UP') {
      score += 4;
      signals.push(`長期↑ (${tf_config.long}秒)`);
    } else {
      score -= 4;
      signals.push(`長期↓ (${tf_config.long}秒)`);
    }

    // 中期トレンド判定（現在の勢い）
    const midTrend = maShort > maMid ? 'UP' : 'DOWN';
    hierarchicalTrend.mid = midTrend;
    if (midTrend === 'UP') {
      score += 3;
      signals.push(`中期↑ (${tf_config.mid}秒)`);
    } else {
      score -= 3;
      signals.push(`中期↓ (${tf_config.mid}秒)`);
    }

    // 短期トレンド判定（エントリータイミング）
    const shortTrend = currentPrice > maShort ? 'UP' : 'DOWN';
    hierarchicalTrend.short = shortTrend;
    if (shortTrend === 'UP') {
      score += 2;
      signals.push(`短期↑ (${tf_config.short}秒)`);
    } else {
      score -= 2;
      signals.push(`短期↓ (${tf_config.short}秒)`);
    }

    // トレンド一致度ボーナス
    const trendAlignment = [longTrend, midTrend, shortTrend];
    const upCount = trendAlignment.filter(t => t === 'UP').length;
    const downCount = trendAlignment.filter(t => t === 'DOWN').length;

    if (upCount === 3) {
      score += 3;
      signals.push('全一致↑');
      hierarchicalTrend.alignment = 'STRONG_UP';
    } else if (downCount === 3) {
      score -= 3;
      signals.push('全一致↓');
      hierarchicalTrend.alignment = 'STRONG_DOWN';
    } else if (upCount === 2) {
      score += 1;
      hierarchicalTrend.alignment = 'UP';
    } else if (downCount === 2) {
      score -= 1;
      hierarchicalTrend.alignment = 'DOWN';
    } else {
      hierarchicalTrend.alignment = 'MIXED';
    }

    // RSI分析
    if (rsi > 70) {
      score -= 2;
      signals.push(`RSI ${rsi.toFixed(0)} (買われすぎ)`);
    } else if (rsi < 30) {
      score += 2;
      signals.push(`RSI ${rsi.toFixed(0)} (売られすぎ)`);
    } else if (rsi > 50) {
      score += 1;
      signals.push(`RSI ${rsi.toFixed(0)} (強気)`);
    } else {
      score -= 1;
      signals.push(`RSI ${rsi.toFixed(0)} (弱気)`);
    }

    // ボリンジャーバンド分析
    if (currentPrice > bb.upper) {
      score -= 2;
      signals.push('BB上限突破');
    } else if (currentPrice < bb.lower) {
      score += 2;
      signals.push('BB下限突破');
    }

    // MACD分析
    if (macd.histogram > 0) {
      score += 1;
      signals.push('MACD↑');
    } else {
      score -= 1;
      signals.push('MACD↓');
    }

    // 総合判定
    let signal, confidence, reason, bias, biasStrength;

    if (score >= 6) {
      signal = 'HIGH';
      confidence = Math.min(95, 60 + score * 3);
      reason = '非常に強い上昇トレンド';
    } else if (score >= 3) {
      signal = 'HIGH';
      confidence = 65 + score * 3;
      reason = '上昇トレンド';
    } else if (score <= -6) {
      signal = 'LOW';
      confidence = Math.min(95, 60 + Math.abs(score) * 3);
      reason = '非常に強い下降トレンド';
    } else if (score <= -3) {
      signal = 'LOW';
      confidence = 65 + Math.abs(score) * 3;
      reason = '下降トレンド';
    } else {
      signal = 'NEUTRAL';
      confidence = null; // 見送りの場合はパーセンテージなし

      // トレンド不明瞭でも、わずかな傾向を bias として提供
      if (score > 1.5) {
        bias = 'UP'; // やや上昇寄り
        biasStrength = Math.min(score / 3 * 100, 50); // 最大50%
      } else if (score < -1.5) {
        bias = 'DOWN'; // やや下降寄り
        biasStrength = Math.min(Math.abs(score) / 3 * 100, 50);
      } else {
        bias = 'RANGE'; // レンジ
        biasStrength = (3 - Math.abs(score)) / 3 * 100; // レンジ度合い
      }

      reason = `トレンド不明瞭 (${bias === 'UP' ? 'やや上昇寄り' : bias === 'DOWN' ? 'やや下降寄り' : 'レンジ'})`;
    }

    return {
      signal,
      confidence,
      bias: signal === 'NEUTRAL' ? bias : null,
      biasStrength: signal === 'NEUTRAL' ? Math.round(biasStrength) : null,
      reason: `${reason} | ${signals.slice(0, 5).join(', ')}`,
      hierarchicalTrend
    };
  }

  /**
   * 移動平均 (MA) 計算
   */
  calculateMA(period) {
    if (this.prices.length < period) {
      return 0;
    }

    const slice = this.prices.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * RSI (Relative Strength Index) 計算
   */
  calculateRSI(period = 14) {
    if (this.prices.length < period + 1) {
      return 50; // デフォルト中立値
    }

    const changes = [];
    for (let i = 1; i < this.prices.length; i++) {
      changes.push(this.prices[i] - this.prices[i - 1]);
    }

    const recentChanges = changes.slice(-period);
    const gains = recentChanges.map(c => c > 0 ? c : 0);
    const losses = recentChanges.map(c => c < 0 ? -c : 0);

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * ボリンジャーバンド計算
   */
  calculateBollingerBands(period = 20, multiplier = 2) {
    if (this.prices.length < period) {
      const avg = this.calculateMA(this.prices.length);
      return { upper: avg, middle: avg, lower: avg };
    }

    const middle = this.calculateMA(period);
    const slice = this.prices.slice(-period);

    // 標準偏差計算
    const squaredDiffs = slice.map(p => Math.pow(p - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: middle + (stdDev * multiplier),
      middle: middle,
      lower: middle - (stdDev * multiplier)
    };
  }

  /**
   * MACD (Moving Average Convergence Divergence) 計算
   */
  calculateMACD(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (this.prices.length < slowPeriod) {
      return { macd: 0, signal: 0, histogram: 0 };
    }

    const emaFast = this.calculateEMA(fastPeriod);
    const emaSlow = this.calculateEMA(slowPeriod);
    const macd = emaFast - emaSlow;

    // シグナルライン用のEMA計算は簡略化
    const signal = macd * 0.5; // 簡易実装
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  /**
   * EMA (Exponential Moving Average) 計算
   */
  calculateEMA(period) {
    if (this.prices.length < period) {
      return this.calculateMA(this.prices.length);
    }

    const multiplier = 2 / (period + 1);
    let ema = this.calculateMA(period);

    const recentPrices = this.prices.slice(-period);
    for (const price of recentPrices) {
      ema = (price - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * 現在のステータス取得
   */
  getStatus() {
    return {
      isReady: this.prices.length >= 50,
      dataPoints: this.prices.length,
      maxSize: this.maxSize,
      lastAnalysis: this.lastAnalysis
    };
  }

  /**
   * データクリア
   */
  clear() {
    this.prices = [];
    this.timestamps = [];
    this.lastAnalysis = null;
  }
}

// グローバルスコープに公開
if (typeof window !== 'undefined') {
  window.SimpleTrendAnalyzer = SimpleTrendAnalyzer;
}

// Node.js環境用のエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleTrendAnalyzer;
}
