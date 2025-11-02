/**
 * Stable Trend Analyzer Engine
 * Version: 3.0.0
 *
 * 安定したトレンド分析システム
 * - マルチタイムフレーム分析（1分/5分/15分足）
 * - シグナル安定化（3回連続確認）
 * - トレンド継続性評価
 */

// ========================================
// 1. CandleBuilder - ローソク足生成
// ========================================

class CandleBuilder {
  constructor(timeframe = 60) {
    this.timeframe = timeframe; // 秒
    this.currentCandle = null;
    this.completedCandles = [];
    this.maxCandles = 100;
  }

  addTick(price, timestamp) {
    const candleTime = Math.floor(timestamp / this.timeframe) * this.timeframe;

    if (!this.currentCandle || this.currentCandle.time !== candleTime) {
      // 前のローソク足を完成させる
      if (this.currentCandle) {
        this.completedCandles.push(this.currentCandle);
        if (this.completedCandles.length > this.maxCandles) {
          this.completedCandles.shift();
        }
      }

      // 新しいローソク足を開始
      this.currentCandle = {
        time: candleTime,
        open: price,
        high: price,
        low: price,
        close: price,
        ticks: 1
      };
    } else {
      // 現在のローソク足を更新
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
      this.currentCandle.ticks++;
    }
  }

  getCandles() {
    return this.currentCandle
      ? [...this.completedCandles, this.currentCandle]
      : this.completedCandles;
  }

  getCompletedCandles() {
    return this.completedCandles;
  }

  hasEnoughData(minCandles = 20) {
    return this.completedCandles.length >= minCandles;
  }
}

// ========================================
// 2. SignalStabilizer - シグナル安定化
// ========================================

class SignalStabilizer {
  constructor(confirmCount = 3) {
    this.confirmCount = confirmCount;
    this.history = [];
  }

  addSignal(signal, confidence) {
    this.history.push({ signal, confidence, timestamp: Date.now() });

    if (this.history.length > this.confirmCount) {
      this.history.shift();
    }

    // 連続して同じシグナルか確認
    if (this.history.length === this.confirmCount) {
      const allSame = this.history.every(s => s.signal === this.history[0].signal);

      if (allSame) {
        // 平均信頼度を計算
        const avgConfidence = this.history.reduce((sum, s) => sum + s.confidence, 0) / this.confirmCount;

        return {
          confirmed: true,
          signal: this.history[0].signal,
          confidence: Math.round(avgConfidence)
        };
      }
    }

    return {
      confirmed: false,
      signal: this.history.length > 0 ? this.history[this.history.length - 1].signal : 'WAIT',
      confidence: 0,
      pending: this.history.length,
      required: this.confirmCount
    };
  }

  reset() {
    this.history = [];
  }
}

// ========================================
// 3. TrendContinuity - トレンド継続性評価
// ========================================

class TrendContinuity {
  constructor() {
    this.currentTrend = null;
    this.trendStartTime = null;
  }

  updateTrend(signal) {
    const now = Date.now();

    if (signal !== this.currentTrend) {
      // トレンド変化
      this.currentTrend = signal;
      this.trendStartTime = now;
    }

    const duration = this.trendStartTime ? now - this.trendStartTime : 0;
    const durationMinutes = Math.floor(duration / 60000);

    // トレンド継続時間に応じたボーナス
    let confidenceBonus = 0;
    if (durationMinutes >= 5) {
      confidenceBonus = 10; // 5分以上継続
    } else if (durationMinutes >= 3) {
      confidenceBonus = 5; // 3分以上継続
    }

    return {
      signal: this.currentTrend,
      duration: duration,
      durationMinutes: durationMinutes,
      confidenceBonus: confidenceBonus
    };
  }
}

// ========================================
// 4. CandleAnalyzer - ローソク足分析
// ========================================

class CandleAnalyzer {
  /**
   * 移動平均 (MA) 計算
   */
  static calculateMA(candles, period) {
    if (candles.length < period) {
      return 0;
    }

    const recentCandles = candles.slice(-period);
    const sum = recentCandles.reduce((acc, c) => acc + c.close, 0);
    return sum / period;
  }

  /**
   * RSI (Relative Strength Index) 計算
   */
  static calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) {
      return 50;
    }

    const changes = [];
    for (let i = 1; i < candles.length; i++) {
      changes.push(candles[i].close - candles[i - 1].close);
    }

    const recentChanges = changes.slice(-period);
    const gains = recentChanges.map(c => c > 0 ? c : 0);
    const losses = recentChanges.map(c => c < 0 ? -c : 0);

    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * ボリンジャーバンド計算
   */
  static calculateBollingerBands(candles, period = 20, multiplier = 2) {
    if (candles.length < period) {
      const avg = candles.reduce((sum, c) => sum + c.close, 0) / candles.length;
      return { upper: avg, middle: avg, lower: avg };
    }

    const middle = CandleAnalyzer.calculateMA(candles, period);
    const recentCandles = candles.slice(-period);

    const squaredDiffs = recentCandles.map(c => Math.pow(c.close - middle, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: middle + (stdDev * multiplier),
      middle: middle,
      lower: middle - (stdDev * multiplier)
    };
  }

  /**
   * ボラティリティ計算
   */
  static calculateVolatility(candles, period = 20) {
    if (candles.length < period) {
      return 0;
    }

    const recentCandles = candles.slice(-period);
    const closes = recentCandles.map(c => c.close);
    const avg = closes.reduce((a, b) => a + b) / period;
    const variance = closes.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / period;

    return Math.sqrt(variance);
  }

  /**
   * 単一タイムフレームの分析
   */
  static analyzeSingleTF(candles, tfName) {
    if (candles.length < 5) {
      return {
        signal: 'WAIT',
        score: 0,
        confidence: 0,
        reason: `${tfName}: データ不足`,
        indicators: {}
      };
    }

    const currentPrice = candles[candles.length - 1].close;
    const ma5 = CandleAnalyzer.calculateMA(candles, 5);
    const ma20 = CandleAnalyzer.calculateMA(candles, 20);
    const ma50 = CandleAnalyzer.calculateMA(candles, 50);
    const rsi = CandleAnalyzer.calculateRSI(candles, 14);
    const bb = CandleAnalyzer.calculateBollingerBands(candles, 20, 2);
    const volatility = CandleAnalyzer.calculateVolatility(candles, 20);

    let score = 0;
    const signals = [];

    // MA分析（短期 vs 中期）
    if (ma5 > ma20) {
      score += 3;
      signals.push('MA5>MA20');
    } else {
      score -= 3;
      signals.push('MA5<MA20');
    }

    // MA分析（中期 vs 長期）
    if (candles.length >= 50) {
      if (ma20 > ma50) {
        score += 2;
        signals.push('MA20>MA50');
      } else {
        score -= 2;
        signals.push('MA20<MA50');
      }
    }

    // RSI分析
    if (rsi > 70) {
      score -= 4;
      signals.push(`RSI${Math.round(rsi)}(買われすぎ)`);
    } else if (rsi < 30) {
      score += 4;
      signals.push(`RSI${Math.round(rsi)}(売られすぎ)`);
    } else if (rsi > 55) {
      score += 1;
      signals.push(`RSI${Math.round(rsi)}`);
    } else if (rsi < 45) {
      score -= 1;
      signals.push(`RSI${Math.round(rsi)}`);
    }

    // ボリンジャーバンド分析
    if (currentPrice > bb.upper) {
      score -= 2;
      signals.push('BB上限突破');
    } else if (currentPrice < bb.lower) {
      score += 2;
      signals.push('BB下限突破');
    }

    // ボラティリティチェック（重要: 閾値を強化）
    const minVolatility = currentPrice * 0.001; // 0.1%以上の変動が必要
    if (volatility < minVolatility) {
      return {
        signal: 'NEUTRAL',
        score: 0,
        confidence: 30,
        reason: `${tfName}: レンジ相場（ボラ不足）`,
        indicators: { ma5, ma20, rsi, volatility, currentPrice }
      };
    }

    // 総合判定（閾値を±5に強化）
    let signal, confidence, reason;

    if (score >= 7) {
      signal = 'HIGH';
      confidence = Math.min(95, 70 + score * 2);
      reason = `${tfName}: 強い上昇`;
    } else if (score >= 5) {
      signal = 'HIGH';
      confidence = 75;
      reason = `${tfName}: 上昇`;
    } else if (score <= -7) {
      signal = 'LOW';
      confidence = Math.min(95, 70 + Math.abs(score) * 2);
      reason = `${tfName}: 強い下降`;
    } else if (score <= -5) {
      signal = 'LOW';
      confidence = 75;
      reason = `${tfName}: 下降`;
    } else {
      signal = 'NEUTRAL';
      confidence = 40;
      reason = `${tfName}: トレンド不明瞭`;
    }

    return {
      signal,
      score,
      confidence,
      reason: `${reason} | ${signals.join(', ')}`,
      indicators: {
        ma5: ma5.toFixed(2),
        ma20: ma20.toFixed(2),
        ma50: ma50.toFixed(2),
        rsi: rsi.toFixed(1),
        bb: {
          upper: bb.upper.toFixed(2),
          middle: bb.middle.toFixed(2),
          lower: bb.lower.toFixed(2)
        },
        volatility: volatility.toFixed(2),
        currentPrice: currentPrice.toFixed(2)
      }
    };
  }
}

// ========================================
// 5. MultiTimeframeAnalyzer - 統合分析
// ========================================

class MultiTimeframeAnalyzer {
  constructor() {
    this.tf1m = new CandleBuilder(60);    // 1分足
    this.tf5m = new CandleBuilder(300);   // 5分足
    this.tf15m = new CandleBuilder(900);  // 15分足
    this.stabilizer = new SignalStabilizer(3);
    this.trendContinuity = new TrendContinuity();
    this.currentPrice = null;
  }

  addTick(price, timestamp = Date.now()) {
    this.currentPrice = price;
    // タイムスタンプをミリ秒から秒に変換
    const timestampSec = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
    this.tf1m.addTick(price, timestampSec);
    this.tf5m.addTick(price, timestampSec);
    this.tf15m.addTick(price, timestampSec);
  }

  analyze() {
    // 各タイムフレームの分析
    const candles1m = this.tf1m.getCompletedCandles();
    const candles5m = this.tf5m.getCompletedCandles();
    const candles15m = this.tf15m.getCompletedCandles();

    // データ不足チェック（5分に短縮）
    if (candles1m.length < 5) {
      return {
        signal: 'WAIT',
        confidence: 0,
        confirmed: false,
        status: `価格データ収集中（${candles1m.length}/5分）`,
        pending: candles1m.length,
        required: 5,
        reason: `分析に必要な価格データを収集中... ${candles1m.length}/5分`,
        timeframes: {
          '1m': 'WAIT',
          '5m': 'WAIT',
          '15m': 'WAIT'
        },
        trendDuration: 0,
        indicators: {
          ma5: '-',
          ma20: '-',
          rsi: '-'
        },
        currentPrice: this.currentPrice || '-',
        dataPoints: candles1m.length + candles5m.length + candles15m.length,
        dataStatus: {
          '1m': `${candles1m.length}分`,
          '5m': `${candles5m.length}分`,
          '15m': `${candles15m.length}分`
        }
      };
    }

    const analysis1m = CandleAnalyzer.analyzeSingleTF(candles1m, '1分足');
    const analysis5m = CandleAnalyzer.analyzeSingleTF(candles5m, '5分足');
    const analysis15m = CandleAnalyzer.analyzeSingleTF(candles15m, '15分足');

    // マルチタイムフレーム統合
    const combined = this.combineSignals([analysis1m, analysis5m, analysis15m]);

    // シグナル安定化
    const stabilized = this.stabilizer.addSignal(combined.signal, combined.confidence);

    // トレンド継続性評価
    const trend = this.trendContinuity.updateTrend(stabilized.signal);

    // 最終信頼度（トレンド継続ボーナス加算）
    const finalConfidence = stabilized.confirmed
      ? Math.min(95, combined.confidence + trend.confidenceBonus)
      : 0;

    const result = {
      signal: stabilized.confirmed ? stabilized.signal : 'WAIT',
      confidence: finalConfidence,
      confirmed: stabilized.confirmed,
      status: stabilized.confirmed ? '3回連続確認済み' : `確認待ち（${stabilized.pending}/${stabilized.required}回）`,
      pending: stabilized.pending,
      required: stabilized.required,
      reason: stabilized.confirmed ? combined.reason : `確認待ち（${stabilized.pending}/${stabilized.required}回）`,
      timeframes: {
        '1m': analysis1m.signal,
        '5m': analysis5m.signal,
        '15m': analysis15m.signal
      },
      trendDuration: trend.durationMinutes,
      indicators: {
        ma5: analysis1m.indicators?.ma5 || '-',
        ma20: analysis1m.indicators?.ma20 || '-',
        rsi: analysis1m.indicators?.rsi || '-'
      },
      currentPrice: this.currentPrice || '-',
      dataPoints: candles1m.length + candles5m.length + candles15m.length,
      dataStatus: {
        '1m': `${candles1m.length}本`,
        '5m': `${candles5m.length}本`,
        '15m': `${candles15m.length}本`
      }
    };

    // 相場状況と予測を追加
    result.marketCondition = this.generateMarketCondition(result, analysis1m);
    result.futurePrediction = this.generateFuturePrediction(result, analysis1m);

    return result;
  }

  generateMarketCondition(result, analysis1m) {
    if (!result.confirmed) {
      return 'データ収集中...';
    }

    const rsi = parseFloat(analysis1m.indicators?.rsi || 0);
    const ma5 = parseFloat(analysis1m.indicators?.ma5 || 0);
    const ma20 = parseFloat(analysis1m.indicators?.ma20 || 0);
    const price = parseFloat(this.currentPrice || 0);

    let condition = '';

    // トレンド判定
    if (ma5 > ma20) {
      const strength = ((ma5 - ma20) / ma20 * 100).toFixed(2);
      if (result.trendDuration >= 5) {
        condition = `強い上昇トレンド（${result.trendDuration}分継続中）`;
      } else {
        condition = `上昇トレンド`;
      }
    } else if (ma5 < ma20) {
      const strength = ((ma20 - ma5) / ma20 * 100).toFixed(2);
      if (result.trendDuration >= 5) {
        condition = `強い下降トレンド（${result.trendDuration}分継続中）`;
      } else {
        condition = `下降トレンド`;
      }
    } else {
      condition = 'レンジ相場（横ばい）';
    }

    // RSI状態
    if (rsi > 70) {
      condition += ' | 買われすぎ（RSI: ' + rsi.toFixed(1) + '）';
    } else if (rsi < 30) {
      condition += ' | 売られすぎ（RSI: ' + rsi.toFixed(1) + '）';
    } else {
      condition += ' | 適正範囲（RSI: ' + rsi.toFixed(1) + '）';
    }

    // ボラティリティ
    const allSame = result.timeframes['1m'] === result.timeframes['5m'] &&
                    result.timeframes['5m'] === result.timeframes['15m'];
    if (allSame) {
      condition += ' | 全時間足で方向一致';
    }

    return condition;
  }

  generateFuturePrediction(result, analysis1m) {
    if (!result.confirmed) {
      return 'データ収集中...';
    }

    const signal = result.signal;
    const confidence = result.confidence;
    const rsi = parseFloat(analysis1m.indicators?.rsi || 0);
    const trendDuration = result.trendDuration;

    let prediction = '';

    if (signal === 'HIGH') {
      prediction = '🔺 価格上昇の可能性が高い';

      if (confidence >= 80) {
        prediction += '（信頼度が非常に高い）';
      } else if (confidence >= 70) {
        prediction += '（信頼度が高い）';
      }

      if (trendDuration >= 5) {
        prediction += ` | トレンド${trendDuration}分継続中、さらに上昇の可能性`;
      }

      if (rsi > 70) {
        prediction += ' | ただし買われすぎ領域のため反転に注意';
      }

      prediction += ' → HIGHでのエントリーを推奨';

    } else if (signal === 'LOW') {
      prediction = '🔻 価格下降の可能性が高い';

      if (confidence >= 80) {
        prediction += '（信頼度が非常に高い）';
      } else if (confidence >= 70) {
        prediction += '（信頼度が高い）';
      }

      if (trendDuration >= 5) {
        prediction += ` | トレンド${trendDuration}分継続中、さらに下降の可能性`;
      }

      if (rsi < 30) {
        prediction += ' | ただし売られすぎ領域のため反転に注意';
      }

      prediction += ' → LOWでのエントリーを推奨';

    } else {
      prediction = '⏸ トレンド不明瞭 | エントリー見送りを推奨';
    }

    return prediction;
  }

  combineSignals(analyses) {
    // 有効な分析のみ（WAIT, NEUTRALを除外）
    const validAnalyses = analyses.filter(a => a.signal === 'HIGH' || a.signal === 'LOW');

    if (validAnalyses.length === 0) {
      return {
        signal: 'NEUTRAL',
        confidence: 40,
        reason: '全時間足でトレンド不明瞭'
      };
    }

    // HIGH/LOWのカウント
    const highCount = validAnalyses.filter(a => a.signal === 'HIGH').length;
    const lowCount = validAnalyses.filter(a => a.signal === 'LOW').length;

    // 多数決
    let finalSignal;
    let baseConfidence;

    if (highCount > lowCount) {
      finalSignal = 'HIGH';
      baseConfidence = highCount === 3 ? 85 : highCount === 2 ? 75 : 65;
    } else if (lowCount > highCount) {
      finalSignal = 'LOW';
      baseConfidence = lowCount === 3 ? 85 : lowCount === 2 ? 75 : 65;
    } else {
      finalSignal = 'NEUTRAL';
      baseConfidence = 50;
    }

    // 理由の集約
    const reasons = analyses.map(a => a.reason).filter(r => !r.includes('データ不足'));

    return {
      signal: finalSignal,
      confidence: baseConfidence,
      reason: reasons.join(' | ')
    };
  }

  getStatus() {
    return {
      hasEnoughData: this.tf1m.getCompletedCandles().length >= 20,
      candles: {
        '1m': this.tf1m.getCompletedCandles().length,
        '5m': this.tf5m.getCompletedCandles().length,
        '15m': this.tf15m.getCompletedCandles().length
      }
    };
  }
}

// グローバルスコープに公開
if (typeof window !== 'undefined') {
  window.CandleBuilder = CandleBuilder;
  window.SignalStabilizer = SignalStabilizer;
  window.TrendContinuity = TrendContinuity;
  window.CandleAnalyzer = CandleAnalyzer;
  window.MultiTimeframeAnalyzer = MultiTimeframeAnalyzer;
}

// Node.js環境用のエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CandleBuilder,
    SignalStabilizer,
    TrendContinuity,
    CandleAnalyzer,
    MultiTimeframeAnalyzer
  };
}
