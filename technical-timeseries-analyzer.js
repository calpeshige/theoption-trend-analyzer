/**
 * テクニカル指標時系列分析システム
 * 判定時間に応じた範囲内でテクニカル指標の動きを分析
 */

class TechnicalTimeSeriesAnalyzer {
  constructor() {
    // 判定時間ごとのデータ範囲（秒）
    this.dataRanges = {
      15: 60,    // 15秒判定 → 直近60秒
      30: 90,    // 30秒判定 → 直近90秒
      60: 120,   // 60秒判定 → 直近120秒
      180: 240,  // 3分判定 → 直近240秒
      300: 300   // 5分判定 → 直近300秒
    };

    // 各指標の履歴を保存
    this.history = {
      rsi: [],
      macd: [],
      stochastic: [],
      adx: [],
      roc: [],
      ma5: [],
      ma20: []
    };

    // タイムスタンプ
    this.timestamps = [];
  }

  /**
   * テクニカル指標の現在値を記録
   */
  recordIndicators(indicators) {
    const now = Date.now();

    this.timestamps.push(now);
    this.history.rsi.push(indicators.rsi || 50);
    this.history.macd.push(indicators.macdStrength || 0);
    this.history.stochastic.push(indicators.stochasticK || 50);
    this.history.adx.push(indicators.adxValue || 0);
    this.history.roc.push(indicators.rocValue || 0);
    this.history.ma5.push(indicators.ma5 || 0);
    this.history.ma20.push(indicators.ma20 || 0);

    // 古いデータを削除（最大300秒分のみ保持）
    const maxDataPoints = 300;
    if (this.timestamps.length > maxDataPoints) {
      this.timestamps.shift();
      Object.keys(this.history).forEach(key => {
        this.history[key].shift();
      });
    }
  }

  /**
   * 指定された時間枠で時系列分析を実行
   */
  analyzeTimeframe(timeframe = 60) {
    const dataRange = this.dataRanges[timeframe];

    // データが不足している場合
    if (this.timestamps.length < dataRange) {
      return this.getEmptyAnalysis();
    }

    // 指定範囲のデータを取得
    const rangeData = this.getDataInRange(dataRange);

    // 各指標を分析
    return {
      rsi: this.analyzeIndicator(rangeData.rsi),
      macd: this.analyzeIndicator(rangeData.macd),
      stochastic: this.analyzeIndicator(rangeData.stochastic),
      adx: this.analyzeIndicator(rangeData.adx),
      roc: this.analyzeIndicator(rangeData.roc),
      ma5: this.analyzeIndicator(rangeData.ma5),
      ma20: this.analyzeIndicator(rangeData.ma20),
      maCross: this.analyzeMACross(rangeData.ma5, rangeData.ma20)
    };
  }

  /**
   * 指定範囲のデータを取得
   */
  getDataInRange(dataRange) {
    const result = {};
    Object.keys(this.history).forEach(key => {
      result[key] = this.history[key].slice(-dataRange);
    });
    return result;
  }

  /**
   * 個別指標の時系列分析
   */
  analyzeIndicator(data) {
    if (!data || data.length < 2) {
      return {
        current: 0,
        start: 0,
        end: 0,
        trend: 'NEUTRAL',
        velocity: 0,
        change: 0,
        changePercent: 0,
        volatility: 0,
        range: 0
      };
    }

    const current = data[data.length - 1];
    const start = data[0];
    const end = current;
    const change = end - start;
    const changePercent = start !== 0 ? (change / start) * 100 : 0;

    // 線形回帰でトレンドを計算
    const trend = this.calculateTrend(data);
    const velocity = change / data.length; // 変化速度（単位時間あたり）

    // ボラティリティ（標準偏差）
    const volatility = this.calculateStdDev(data);

    // レンジ（最大-最小）
    const range = Math.max(...data) - Math.min(...data);

    return {
      current,
      start,
      end,
      trend: trend.direction,
      velocity: trend.slope,
      change,
      changePercent,
      volatility,
      range,
      strength: Math.abs(trend.slope) // トレンドの強さ
    };
  }

  /**
   * 移動平均線のクロス分析
   */
  analyzeMACross(ma5Data, ma20Data) {
    if (!ma5Data || !ma20Data || ma5Data.length < 2) {
      return {
        current: 'NEUTRAL',
        trend: 'NEUTRAL',
        strength: 0,
        divergence: 0
      };
    }

    const ma5Current = ma5Data[ma5Data.length - 1];
    const ma20Current = ma20Data[ma20Data.length - 1];
    const ma5Previous = ma5Data[ma5Data.length - 2];
    const ma20Previous = ma20Data[ma20Data.length - 2];

    // 現在の位置関係
    const currentPosition = ma5Current > ma20Current ? 'GOLDEN' : 'DEAD';

    // 前回の位置関係
    const previousPosition = ma5Previous > ma20Previous ? 'GOLDEN' : 'DEAD';

    // クロスオーバー検出
    let crossover = 'NONE';
    if (currentPosition === 'GOLDEN' && previousPosition === 'DEAD') {
      crossover = 'GOLDEN_CROSS'; // ゴールデンクロス発生
    } else if (currentPosition === 'DEAD' && previousPosition === 'GOLDEN') {
      crossover = 'DEAD_CROSS'; // デッドクロス発生
    }

    // 乖離率
    const divergence = ma20Current !== 0 ? ((ma5Current - ma20Current) / ma20Current) * 100 : 0;

    // トレンドの強さ（乖離が大きいほど強い）
    const strength = Math.abs(divergence);

    return {
      current: currentPosition,
      crossover,
      trend: currentPosition,
      strength,
      divergence
    };
  }

  /**
   * 線形回帰でトレンドを計算
   */
  calculateTrend(data) {
    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // トレンド方向の判定
    let direction = 'NEUTRAL';
    const threshold = 0.01; // 傾きの閾値

    if (slope > threshold) {
      direction = 'RISING';
    } else if (slope < -threshold) {
      direction = 'FALLING';
    }

    return {
      slope,
      direction
    };
  }

  /**
   * 標準偏差を計算
   */
  calculateStdDev(data) {
    const n = data.length;
    const mean = data.reduce((sum, val) => sum + val, 0) / n;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    return Math.sqrt(variance);
  }

  /**
   * 空の分析結果を返す
   */
  getEmptyAnalysis() {
    const emptyIndicator = {
      current: 0,
      start: 0,
      end: 0,
      trend: 'NEUTRAL',
      velocity: 0,
      change: 0,
      changePercent: 0,
      volatility: 0,
      range: 0,
      strength: 0
    };

    return {
      rsi: { ...emptyIndicator },
      macd: { ...emptyIndicator },
      stochastic: { ...emptyIndicator },
      adx: { ...emptyIndicator },
      roc: { ...emptyIndicator },
      ma5: { ...emptyIndicator },
      ma20: { ...emptyIndicator },
      maCross: {
        current: 'NEUTRAL',
        crossover: 'NONE',
        trend: 'NEUTRAL',
        strength: 0,
        divergence: 0
      }
    };
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    Object.keys(this.history).forEach(key => {
      this.history[key] = [];
    });
    this.timestamps = [];
  }
}

// グローバルに公開
window.TechnicalTimeSeriesAnalyzer = TechnicalTimeSeriesAnalyzer;
