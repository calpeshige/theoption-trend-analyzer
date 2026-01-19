// Technical Analysis Engine V2 - Enhanced Logic
// 改善版テクニカル分析エンジン

class TechnicalAnalysisEngineV2 {
  constructor() {
    this.candles = [];
  }

  setCandles(candles) {
    this.candles = candles;
  }

  // EMA (Exponential Moving Average) 指数移動平均
  calculateEMA(period) {
    if (this.candles.length < period) return null;

    const k = 2 / (period + 1);
    let ema = this.candles[0].close;

    for (let i = 1; i < this.candles.length; i++) {
      ema = this.candles[i].close * k + ema * (1 - k);
    }

    return ema;
  }

  // 全期間のEMAを計算
  calculateEMAArray(period) {
    if (this.candles.length < period) return [];

    const k = 2 / (period + 1);
    const emaArray = [];
    let ema = this.candles[0].close;
    emaArray.push(ema);

    for (let i = 1; i < this.candles.length; i++) {
      ema = this.candles[i].close * k + ema * (1 - k);
      emaArray.push(ema);
    }

    return emaArray;
  }

  // SMA (Simple Moving Average) 単純移動平均
  calculateSMA(period) {
    if (this.candles.length < period) return null;

    const slice = this.candles.slice(-period);
    const sum = slice.reduce((acc, candle) => acc + candle.close, 0);
    return sum / period;
  }

  // ATR (Average True Range) 平均真の範囲
  calculateATR(period) {
    if (this.candles.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < this.candles.length; i++) {
      const high = this.candles[i].high;
      const low = this.candles[i].low;
      const prevClose = this.candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((a, b) => a + b, 0) / period;
  }

  // ADX (Average Directional Index) 平均方向性指数
  calculateADX(period = 14) {
    if (this.candles.length < period * 2) return null;

    const trueRanges = [];
    const plusDM = [];
    const minusDM = [];

    for (let i = 1; i < this.candles.length; i++) {
      const high = this.candles[i].high;
      const low = this.candles[i].low;
      const prevHigh = this.candles[i - 1].high;
      const prevLow = this.candles[i - 1].low;
      const prevClose = this.candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);

      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      if (upMove > downMove && upMove > 0) {
        plusDM.push(upMove);
        minusDM.push(0);
      } else if (downMove > upMove && downMove > 0) {
        plusDM.push(0);
        minusDM.push(downMove);
      } else {
        plusDM.push(0);
        minusDM.push(0);
      }
    }

    if (trueRanges.length < period) return null;

    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b) / period;
    let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b);
    let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b);

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
    }

    const plusDI = (smoothedPlusDM / atr) * 100;
    const minusDI = (smoothedMinusDM / atr) * 100;
    const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

    return dx;
  }

  // RSI (Relative Strength Index) 相対力指数
  calculateRSI(period = 14) {
    if (this.candles.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < this.candles.length; i++) {
      changes.push(this.candles[i].close - this.candles[i - 1].close);
    }

    let gains = 0;
    let losses = 0;

    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        gains += changes[i];
      } else {
        losses += Math.abs(changes[i]);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // Bollinger Bands ボリンジャーバンド
  calculateBollingerBands(period = 20, stdDev = 2) {
    if (this.candles.length < period) return null;

    const sma = this.calculateSMA(period);
    const slice = this.candles.slice(-period);

    const squaredDiffs = slice.map(candle => Math.pow(candle.close - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev),
      bandwidth: ((standardDeviation * stdDev * 2) / sma) * 100
    };
  }

  // MACD
  calculateMACD() {
    const ema12 = this.calculateEMA(12);
    const ema26 = this.calculateEMA(26);

    if (!ema12 || !ema26) return null;

    const macdLine = ema12 - ema26;
    return {
      macd: macdLine,
      signal: macdLine * 0.9,
      histogram: macdLine * 0.1
    };
  }

  // 価格の勢い（Momentum）を計算
  calculateMomentum(period = 10) {
    if (this.candles.length < period + 1) return null;

    const current = this.candles[this.candles.length - 1].close;
    const past = this.candles[this.candles.length - 1 - period].close;

    return ((current - past) / past) * 100;
  }

  // 直近のローソク足パターン分析
  analyzeCandlePattern() {
    if (this.candles.length < 3) return { pattern: 'unknown', bullish: 0 };

    const last = this.candles[this.candles.length - 1];
    const prev = this.candles[this.candles.length - 2];

    const body = Math.abs(last.close - last.open);
    const range = last.high - last.low;
    const bodyRatio = range > 0 ? body / range : 0;

    const isBullish = last.close > last.open;
    const prevBullish = prev.close > prev.open;

    // 強いローソク足（実体が大きい）
    if (bodyRatio > 0.7) {
      return {
        pattern: 'strong_candle',
        bullish: isBullish ? 1 : -1,
        strength: bodyRatio
      };
    }

    // 反転の兆候（前回と逆方向の強いローソク足）
    if (bodyRatio > 0.6 && isBullish !== prevBullish) {
      return {
        pattern: 'reversal',
        bullish: isBullish ? 1 : -1,
        strength: bodyRatio
      };
    }

    return {
      pattern: 'neutral',
      bullish: isBullish ? 0.5 : -0.5,
      strength: bodyRatio
    };
  }

  // サポート・レジスタンスレベル検出
  detectSupportResistance() {
    if (this.candles.length < 20) {
      return { support: null, resistance: null, zones: [] };
    }

    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);
    const closes = this.candles.map(c => c.close);

    // 最近の高値・安値を取得
    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);

    // レジスタンス（最高値付近）
    const maxHigh = Math.max(...recentHighs);
    const resistance = maxHigh;

    // サポート（最安値付近）
    const minLow = Math.min(...recentLows);
    const support = minLow;

    const currentPrice = closes[closes.length - 1];

    // 重要な価格帯を検出（価格が複数回反発した箇所）
    const zones = this.detectPriceZones(closes, highs, lows);

    return {
      support: support,
      resistance: resistance,
      currentPrice: currentPrice,
      distanceToResistance: ((resistance - currentPrice) / currentPrice) * 100,
      distanceToSupport: ((currentPrice - support) / currentPrice) * 100,
      zones: zones
    };
  }

  // トレンドライン検出（線形回帰ベース）
  detectTrendLines() {
    if (this.candles.length < 20) {
      return {
        upTrendLine: null,
        downTrendLine: null,
        channel: null,
        warning: null
      };
    }

    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);
    const closes = this.candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    // ローカルの高値・安値を検出（ピボットポイント）
    const pivotHighs = this.findPivotPoints(highs, 'high');
    const pivotLows = this.findPivotPoints(lows, 'low');

    // 上昇トレンドライン（安値を結ぶ）
    const upTrendLine = this.calculateTrendLine(pivotLows, 'up');

    // 下降トレンドライン（高値を結ぶ）
    const downTrendLine = this.calculateTrendLine(pivotHighs, 'down');

    // チャネル検出
    const channel = this.detectChannel(upTrendLine, downTrendLine, currentPrice);

    // 過熱警告の判定
    const warning = this.checkTrendLineWarning(upTrendLine, downTrendLine, currentPrice, closes);

    return {
      upTrendLine,
      downTrendLine,
      channel,
      warning,
      currentPrice
    };
  }

  // ピボットポイント（ローカル高値/安値）を検出
  findPivotPoints(prices, type) {
    const pivots = [];
    const lookback = 3; // 前後3本で判定

    for (let i = lookback; i < prices.length - lookback; i++) {
      let isPivot = true;

      if (type === 'high') {
        // 高値ピボット: 周囲より高い
        for (let j = 1; j <= lookback; j++) {
          if (prices[i] <= prices[i - j] || prices[i] <= prices[i + j]) {
            isPivot = false;
            break;
          }
        }
      } else {
        // 安値ピボット: 周囲より低い
        for (let j = 1; j <= lookback; j++) {
          if (prices[i] >= prices[i - j] || prices[i] >= prices[i + j]) {
            isPivot = false;
            break;
          }
        }
      }

      if (isPivot) {
        pivots.push({ index: i, price: prices[i] });
      }
    }

    return pivots;
  }

  // 線形回帰でトレンドラインを計算
  calculateTrendLine(pivots, direction) {
    // 改善1: 最低3個のピボットが必要
    if (pivots.length < 3) {
      return null;
    }

    // 最新の3-5個のピボットを使用
    const recentPivots = pivots.slice(-5);

    if (recentPivots.length < 3) {
      return null;
    }

    // 線形回帰（最小二乗法）
    const n = recentPivots.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (const pivot of recentPivots) {
      sumX += pivot.index;
      sumY += pivot.price;
      sumXY += pivot.index * pivot.price;
      sumX2 += pivot.index * pivot.index;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 現在のインデックスでのライン価格を計算
    const currentIndex = this.candles.length - 1;
    const currentLinePrice = slope * currentIndex + intercept;

    // トレンドラインの有効性チェック
    // 上昇トレンドライン: 傾きがプラス
    // 下降トレンドライン: 傾きがマイナス
    const directionValid = (direction === 'up' && slope > 0) || (direction === 'down' && slope < 0);

    // R²（決定係数）を計算して精度を評価
    const meanY = sumY / n;
    let ssTotal = 0, ssResidual = 0;

    for (const pivot of recentPivots) {
      const predicted = slope * pivot.index + intercept;
      ssTotal += Math.pow(pivot.price - meanY, 2);
      ssResidual += Math.pow(pivot.price - predicted, 2);
    }

    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

    // 改善2: R² >= 0.5 かつ 傾き方向が正しい場合のみ有効（0.7から緩和）
    const isValid = directionValid && rSquared >= 0.5;

    return {
      slope,
      intercept,
      currentLinePrice,
      direction,
      isValid,
      rSquared,
      pivotCount: recentPivots.length,
      pivots: recentPivots,
      // 1本あたりの価格変化率
      slopePercent: (slope / currentLinePrice) * 100
    };
  }

  // チャネル（上下のトレンドライン）を検出
  detectChannel(upTrendLine, downTrendLine, currentPrice) {
    if (!upTrendLine || !downTrendLine) {
      return null;
    }

    // 両方のラインが有効で、傾きが近い場合はチャネル
    const slopeDiff = Math.abs(upTrendLine.slope - downTrendLine.slope);
    const avgSlope = (Math.abs(upTrendLine.slope) + Math.abs(downTrendLine.slope)) / 2;
    const slopeRatio = avgSlope > 0 ? slopeDiff / avgSlope : 0;

    // 傾きの差が40%以内ならチャネルと判定（30%から緩和）
    // また、両方のラインが存在すれば検出（isValid条件を緩和）
    const isChannel = slopeRatio < 0.4 && (upTrendLine.isValid || downTrendLine.isValid);

    if (!isChannel) {
      return null;
    }

    const channelWidth = downTrendLine.currentLinePrice - upTrendLine.currentLinePrice;
    const channelMiddle = (downTrendLine.currentLinePrice + upTrendLine.currentLinePrice) / 2;

    // 現在価格のチャネル内での位置（0-100%）
    const pricePosition = ((currentPrice - upTrendLine.currentLinePrice) / channelWidth) * 100;

    return {
      type: upTrendLine.slope > 0 ? 'ascending' : 'descending',
      width: channelWidth,
      widthPercent: (channelWidth / channelMiddle) * 100,
      middle: channelMiddle,
      pricePosition: Math.max(0, Math.min(100, pricePosition)),
      upper: downTrendLine.currentLinePrice,
      lower: upTrendLine.currentLinePrice
    };
  }

  // トレンドラインからの乖離による警告
  checkTrendLineWarning(upTrendLine, downTrendLine, currentPrice, closes) {
    const warnings = [];

    // 上昇トレンドラインからの乖離チェック
    if (upTrendLine && upTrendLine.isValid) {
      const distanceFromUp = ((currentPrice - upTrendLine.currentLinePrice) / currentPrice) * 100;

      // 上昇トレンドライン上方への大きな乖離 = 過熱（1.5%以上で警告、2.5%から緩和）
      if (distanceFromUp > 1.5) {
        // 改善3: ピボット数とR²に応じて警告レベルを調整
        // ピボット4個以上 かつ R²>=0.7 かつ 乖離3%以上 → critical
        // それ以外 → high
        const isHighReliability = upTrendLine.pivotCount >= 4 && upTrendLine.rSquared >= 0.7;
        const level = (distanceFromUp > 3.0 && isHighReliability) ? 'critical' : 'high';

        warnings.push({
          type: 'overextended_above_uptrend',
          level: level,
          message: `上昇トレンドラインから+${distanceFromUp.toFixed(2)}%乖離（過熱）`,
          distance: distanceFromUp,
          divergence: distanceFromUp,
          recommendation: 'HIGH予測に注意',
          pivotCount: upTrendLine.pivotCount,
          rSquared: upTrendLine.rSquared
        });
      }
    }

    // 下降トレンドラインからの乖離チェック
    if (downTrendLine && downTrendLine.isValid) {
      const distanceFromDown = ((downTrendLine.currentLinePrice - currentPrice) / currentPrice) * 100;

      // 下降トレンドライン下方への大きな乖離 = 売られすぎ（1.5%以上で警告、2.5%から緩和）
      if (distanceFromDown > 1.5) {
        // 改善3: ピボット数とR²に応じて警告レベルを調整
        const isHighReliability = downTrendLine.pivotCount >= 4 && downTrendLine.rSquared >= 0.7;
        const level = (distanceFromDown > 3.0 && isHighReliability) ? 'critical' : 'high';

        warnings.push({
          type: 'overextended_below_downtrend',
          level: level,
          message: `下降トレンドラインから-${distanceFromDown.toFixed(2)}%乖離（売られすぎ）`,
          distance: distanceFromDown,
          divergence: distanceFromDown,
          recommendation: 'LOW予測に注意',
          pivotCount: downTrendLine.pivotCount,
          rSquared: downTrendLine.rSquared
        });
      }
    }

    // 急騰/急落検知
    const priceChange = this.detectRapidPriceChange();
    if (priceChange.detected) {
      warnings.push({
        type: 'rapid_price_change',
        level: priceChange.level,
        message: priceChange.message,
        change: priceChange.change,
        recommendation: priceChange.recommendation
      });
    }

    return warnings.length > 0 ? warnings : null;
  }

  // 連続足カウント
  countConsecutiveCandles() {
    if (this.candles.length < 2) {
      return { count: 0, direction: null };
    }

    let count = 1;
    const lastCandle = this.candles[this.candles.length - 1];
    const lastDirection = lastCandle.close > lastCandle.open ? 'up' : 'down';

    for (let i = this.candles.length - 2; i >= 0; i--) {
      const candle = this.candles[i];
      const direction = candle.close > candle.open ? 'up' : 'down';

      if (direction === lastDirection) {
        count++;
      } else {
        break;
      }
    }

    return { count, direction: lastDirection };
  }

  // 急騰/急落検知
  detectRapidPriceChange() {
    if (this.candles.length < 10) {
      return { detected: false };
    }

    // 直近10本での価格変化
    const recent = this.candles.slice(-10);
    const startPrice = recent[0].close;
    const endPrice = recent[recent.length - 1].close;
    const change = ((endPrice - startPrice) / startPrice) * 100;
    const absChange = Math.abs(change);

    // ATRと比較して異常な動きを検出
    const atr = this.calculateATR(10);
    const normalRange = atr ? (atr / startPrice) * 100 * 3 : 0.5; // 3ATR

    if (absChange > normalRange && absChange > 0.5) {
      return {
        detected: true,
        level: absChange > normalRange * 2 ? 'critical' : 'high',
        message: `直近10本で${change > 0 ? '+' : ''}${change.toFixed(2)}%の${change > 0 ? '急騰' : '急落'}`,
        change,
        recommendation: change > 0 ? 'HIGH予測に注意（急騰後の反落リスク）' : 'LOW予測に注意（急落後の反発リスク）'
      };
    }

    return { detected: false };
  }

  // 価格帯（ゾーン）の検出
  detectPriceZones(closes, highs, lows) {
    const zones = [];
    const priceRange = Math.max(...highs) - Math.min(...lows);
    const threshold = priceRange * 0.02; // 2%の範囲

    // 価格を丸めてグループ化
    const priceCounts = {};

    for (let i = 0; i < closes.length; i++) {
      const price = closes[i];
      const roundedPrice = Math.round(price / threshold) * threshold;

      if (!priceCounts[roundedPrice]) {
        priceCounts[roundedPrice] = 0;
      }
      priceCounts[roundedPrice]++;
    }

    // 3回以上タッチした価格帯を重要ゾーンとする
    for (const [price, count] of Object.entries(priceCounts)) {
      if (count >= 3) {
        zones.push({
          price: parseFloat(price),
          touches: count,
          importance: count >= 5 ? 'high' : count >= 4 ? 'medium' : 'low'
        });
      }
    }

    return zones.sort((a, b) => b.touches - a.touches).slice(0, 3);
  }

  // 高度な価格アクションパターン認識
  detectPriceActionPattern() {
    if (this.candles.length < 30) {
      return { pattern: 'none', confidence: 0 };
    }

    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);

    // ダブルトップ検出
    const doubleTop = this.detectDoubleTop(highs, closes);
    if (doubleTop.detected) {
      return { pattern: 'double_top', confidence: doubleTop.confidence, signal: 'bearish' };
    }

    // ダブルボトム検出
    const doubleBottom = this.detectDoubleBottom(lows, closes);
    if (doubleBottom.detected) {
      return { pattern: 'double_bottom', confidence: doubleBottom.confidence, signal: 'bullish' };
    }

    // ヘッドアンドショルダー検出
    const headShoulder = this.detectHeadAndShoulders(highs, lows, closes);
    if (headShoulder.detected) {
      return { pattern: 'head_and_shoulders', confidence: headShoulder.confidence, signal: 'bearish' };
    }

    // 逆ヘッドアンドショルダー検出
    const invHeadShoulder = this.detectInverseHeadAndShoulders(highs, lows, closes);
    if (invHeadShoulder.detected) {
      return { pattern: 'inverse_head_and_shoulders', confidence: invHeadShoulder.confidence, signal: 'bullish' };
    }

    return { pattern: 'none', confidence: 0, signal: 'neutral' };
  }

  // ダブルトップ検出
  detectDoubleTop(highs, closes) {
    const recentHighs = highs.slice(-20);
    const peaks = [];

    // ピークを検出
    for (let i = 2; i < recentHighs.length - 2; i++) {
      if (recentHighs[i] > recentHighs[i - 1] &&
          recentHighs[i] > recentHighs[i - 2] &&
          recentHighs[i] > recentHighs[i + 1] &&
          recentHighs[i] > recentHighs[i + 2]) {
        peaks.push({ index: i, value: recentHighs[i] });
      }
    }

    if (peaks.length >= 2) {
      const lastTwo = peaks.slice(-2);
      const diff = Math.abs(lastTwo[0].value - lastTwo[1].value);
      const avgValue = (lastTwo[0].value + lastTwo[1].value) / 2;
      const diffPercent = (diff / avgValue) * 100;

      // 2つのピークが近い値（2%以内）ならダブルトップ
      if (diffPercent < 2) {
        const currentPrice = closes[closes.length - 1];
        // 現在価格がピークより下ならダブルトップ確定
        if (currentPrice < lastTwo[1].value * 0.98) {
          return { detected: true, confidence: 75 };
        }
        return { detected: true, confidence: 60 };
      }
    }

    return { detected: false, confidence: 0 };
  }

  // ダブルボトム検出
  detectDoubleBottom(lows, closes) {
    const recentLows = lows.slice(-20);
    const troughs = [];

    // 谷を検出
    for (let i = 2; i < recentLows.length - 2; i++) {
      if (recentLows[i] < recentLows[i - 1] &&
          recentLows[i] < recentLows[i - 2] &&
          recentLows[i] < recentLows[i + 1] &&
          recentLows[i] < recentLows[i + 2]) {
        troughs.push({ index: i, value: recentLows[i] });
      }
    }

    if (troughs.length >= 2) {
      const lastTwo = troughs.slice(-2);
      const diff = Math.abs(lastTwo[0].value - lastTwo[1].value);
      const avgValue = (lastTwo[0].value + lastTwo[1].value) / 2;
      const diffPercent = (diff / avgValue) * 100;

      if (diffPercent < 2) {
        const currentPrice = closes[closes.length - 1];
        if (currentPrice > lastTwo[1].value * 1.02) {
          return { detected: true, confidence: 75 };
        }
        return { detected: true, confidence: 60 };
      }
    }

    return { detected: false, confidence: 0 };
  }

  // ヘッドアンドショルダー検出（簡易版）
  detectHeadAndShoulders(highs, lows, closes) {
    if (highs.length < 30) return { detected: false, confidence: 0 };

    const recentHighs = highs.slice(-30);
    const peaks = [];

    for (let i = 3; i < recentHighs.length - 3; i++) {
      if (recentHighs[i] > recentHighs[i - 1] && recentHighs[i] > recentHighs[i + 1]) {
        peaks.push({ index: i, value: recentHighs[i] });
      }
    }

    // 3つのピークが必要（左肩、頭、右肩）
    if (peaks.length >= 3) {
      const lastThree = peaks.slice(-3);
      const [leftShoulder, head, rightShoulder] = lastThree;

      // 頭が両肩より高い
      if (head.value > leftShoulder.value && head.value > rightShoulder.value) {
        // 両肩がほぼ同じ高さ
        const shoulderDiff = Math.abs(leftShoulder.value - rightShoulder.value);
        const avgShoulder = (leftShoulder.value + rightShoulder.value) / 2;
        const diffPercent = (shoulderDiff / avgShoulder) * 100;

        if (diffPercent < 3) {
          return { detected: true, confidence: 70 };
        }
      }
    }

    return { detected: false, confidence: 0 };
  }

  // 逆ヘッドアンドショルダー検出（簡易版）
  detectInverseHeadAndShoulders(highs, lows, closes) {
    if (lows.length < 30) return { detected: false, confidence: 0 };

    const recentLows = lows.slice(-30);
    const troughs = [];

    for (let i = 3; i < recentLows.length - 3; i++) {
      if (recentLows[i] < recentLows[i - 1] && recentLows[i] < recentLows[i + 1]) {
        troughs.push({ index: i, value: recentLows[i] });
      }
    }

    if (troughs.length >= 3) {
      const lastThree = troughs.slice(-3);
      const [leftShoulder, head, rightShoulder] = lastThree;

      if (head.value < leftShoulder.value && head.value < rightShoulder.value) {
        const shoulderDiff = Math.abs(leftShoulder.value - rightShoulder.value);
        const avgShoulder = (leftShoulder.value + rightShoulder.value) / 2;
        const diffPercent = (shoulderDiff / avgShoulder) * 100;

        if (diffPercent < 3) {
          return { detected: true, confidence: 70 };
        }
      }
    }

    return { detected: false, confidence: 0 };
  }

  // より高度なダイバージェンス検出（履歴データ使用）
  detectAdvancedDivergence() {
    if (this.candles.length < 20) {
      return { detected: false, type: 'none', confidence: 0 };
    }

    const closes = this.candles.map(c => c.close);
    const rsiValues = this.calculateRSIArray(14);

    if (rsiValues.length < 10) {
      return { detected: false, type: 'none', confidence: 0 };
    }

    // 価格のピークとRSIのピークを比較
    const priceHighs = [];
    const rsiHighs = [];

    for (let i = 2; i < closes.length - 2; i++) {
      if (closes[i] > closes[i - 1] && closes[i] > closes[i + 1]) {
        priceHighs.push({ index: i, value: closes[i] });
      }
    }

    for (let i = 2; i < rsiValues.length - 2; i++) {
      if (rsiValues[i] > rsiValues[i - 1] && rsiValues[i] > rsiValues[i + 1]) {
        rsiHighs.push({ index: i, value: rsiValues[i] });
      }
    }

    // 弱気ダイバージェンス：価格は高値更新だがRSIは下がっている
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = priceHighs[priceHighs.length - 1];
      const prevPriceHigh = priceHighs[priceHighs.length - 2];
      const lastRSIHigh = rsiHighs[rsiHighs.length - 1];
      const prevRSIHigh = rsiHighs[rsiHighs.length - 2];

      if (lastPriceHigh.value > prevPriceHigh.value && lastRSIHigh.value < prevRSIHigh.value) {
        return { detected: true, type: 'bearish', confidence: 80, signal: '弱気ダイバージェンス - 下落の可能性' };
      }
    }

    // 価格の底とRSIの底を比較
    const priceLows = [];
    const rsiLows = [];

    for (let i = 2; i < closes.length - 2; i++) {
      if (closes[i] < closes[i - 1] && closes[i] < closes[i + 1]) {
        priceLows.push({ index: i, value: closes[i] });
      }
    }

    for (let i = 2; i < rsiValues.length - 2; i++) {
      if (rsiValues[i] < rsiValues[i - 1] && rsiValues[i] < rsiValues[i + 1]) {
        rsiLows.push({ index: i, value: rsiValues[i] });
      }
    }

    // 強気ダイバージェンス：価格は安値更新だがRSIは上がっている
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = priceLows[priceLows.length - 1];
      const prevPriceLow = priceLows[priceLows.length - 2];
      const lastRSILow = rsiLows[rsiLows.length - 1];
      const prevRSILow = rsiLows[rsiLows.length - 2];

      if (lastPriceLow.value < prevPriceLow.value && lastRSILow.value > prevRSILow.value) {
        return { detected: true, type: 'bullish', confidence: 80, signal: '強気ダイバージェンス - 上昇の可能性' };
      }
    }

    return { detected: false, type: 'none', confidence: 0 };
  }

  // RSIの配列を計算
  calculateRSIArray(period = 14) {
    if (this.candles.length < period + 1) return [];

    const rsiArray = [];

    for (let i = period; i < this.candles.length; i++) {
      const slice = this.candles.slice(Math.max(0, i - period - 10), i + 1);
      const gains = [];
      const losses = [];

      for (let j = 1; j < slice.length; j++) {
        const change = slice[j].close - slice[j - 1].close;
        if (change > 0) {
          gains.push(change);
          losses.push(0);
        } else {
          gains.push(0);
          losses.push(Math.abs(change));
        }
      }

      const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

      if (avgLoss === 0) {
        rsiArray.push(100);
      } else {
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        rsiArray.push(rsi);
      }
    }

    return rsiArray;
  }

  // バンドウォーク検出（ボリンジャーバンド沿いの動き）
  detectBandWalk(bb, direction) {
    if (!bb || !bb.upper || !bb.lower || this.candles.length < 5) {
      return { detected: false, count: 0 };
    }

    const recentCandles = this.candles.slice(-5); // 最新5本
    let bandWalkCount = 0;
    const threshold = 0.01; // バンドから1%以内

    for (const candle of recentCandles) {
      if (direction === 'down') {
        // 下降トレンドでBB下限付近を維持
        const distToLower = Math.abs((candle.close - bb.lower) / bb.lower);
        if (distToLower < threshold) {
          bandWalkCount++;
        }
      } else if (direction === 'up') {
        // 上昇トレンドでBB上限付近を維持
        const distToUpper = Math.abs((candle.close - bb.upper) / bb.upper);
        if (distToUpper < threshold) {
          bandWalkCount++;
        }
      }
    }

    // 5本中3本以上でバンドウォーク検出
    return {
      detected: bandWalkCount >= 3,
      count: bandWalkCount
    };
  }

  // セグメント（期間）の分析
  analyzePhase(candles, phaseName) {
    if (candles.length < 5) {
      return { trend: 'unknown', adx: 0, change: 0, atr: 0 };
    }

    const tempEngine = new TechnicalAnalysisEngineV2();
    tempEngine.setCandles(candles);

    const startPrice = candles[0].close;
    const endPrice = candles[candles.length - 1].close;
    const priceChange = ((endPrice - startPrice) / startPrice) * 100;

    const period = Math.min(14, Math.floor(candles.length / 2));
    const adx = tempEngine.calculateADX(period) || 0;
    const atr = tempEngine.calculateATR(period) || 0;

    // トレンド判定（FX向けに閾値を小さく調整）
    let trend = 'ranging';
    const absChange = Math.abs(priceChange);

    // 強いトレンド: 価格変化が大きく、ADXも高い（FXでは0.08%以上で強いトレンド）
    if (priceChange > 0.08 && adx > 18) {
      trend = 'uptrend';
    } else if (priceChange < -0.08 && adx > 18) {
      trend = 'downtrend';
    }
    // 中程度のトレンド: 0.05%以上の変化
    else if (priceChange > 0.05) {
      trend = adx > 12 ? 'uptrend' : 'weak_uptrend';
    } else if (priceChange < -0.05) {
      trend = adx > 12 ? 'downtrend' : 'weak_downtrend';
    }
    // レンジ判定: 0.02%未満の変化かつADX低い
    else if (absChange < 0.02 && adx < 15) {
      trend = 'ranging';
    }
    // 弱いトレンド: 0.02%以上で方向性あり
    else if (priceChange > 0.02) {
      trend = 'weak_uptrend';
    } else if (priceChange < -0.02) {
      trend = 'weak_downtrend';
    }
    // それ以外は極小変動でレンジ
    else {
      trend = 'ranging';
    }

    return {
      name: phaseName,
      trend: trend,
      adx: adx,
      change: priceChange,
      atr: atr,
      startPrice: startPrice,
      endPrice: endPrice
    };
  }

  // 相場のストーリーを構築
  buildMarketStory(phase1, phase2, phase3, overallStats) {
    const phases = [phase1, phase2, phase3];

    // パターン認識
    let pattern = 'unknown';

    // V字反発
    if (phase1.trend.includes('down') && phase2.trend === 'ranging' && phase3.trend.includes('up')) {
      pattern = 'v_reversal_up';
    }
    // 逆V字
    else if (phase1.trend.includes('up') && phase2.trend === 'ranging' && phase3.trend.includes('down')) {
      pattern = 'v_reversal_down';
    }
    // W字底
    else if (phase1.trend.includes('down') && phase2.trend.includes('up') && phase3.trend.includes('down')) {
      pattern = 'w_bottom';
    }
    // M字天井
    else if (phase1.trend.includes('up') && phase2.trend.includes('down') && phase3.trend.includes('up')) {
      pattern = 'm_top';
    }
    // 継続的な上昇
    else if (phases.every(p => p.trend.includes('up'))) {
      pattern = 'continuous_uptrend';
    }
    // 継続的な下降
    else if (phases.every(p => p.trend.includes('down'))) {
      pattern = 'continuous_downtrend';
    }
    // レンジ継続
    else if (phases.every(p => p.trend === 'ranging')) {
      pattern = 'continuous_ranging';
    }
    // 上昇から減速
    else if (phase1.adx > phase2.adx && phase2.adx > phase3.adx && phase1.trend.includes('up')) {
      pattern = 'uptrend_weakening';
    }
    // 下降から減速
    else if (phase1.adx > phase2.adx && phase2.adx > phase3.adx && phase1.trend.includes('down')) {
      pattern = 'downtrend_weakening';
    }
    // トレンド加速
    else if (phase3.adx > phase2.adx && phase2.adx > phase1.adx) {
      pattern = phase3.trend.includes('up') ? 'accelerating_uptrend' : 'accelerating_downtrend';
    }

    // 勢いの変化
    const momentumChange = phase3.adx - phase1.adx;
    let momentumDirection = 'stable';
    if (momentumChange > 10) momentumDirection = 'increasing';
    else if (momentumChange < -10) momentumDirection = 'decreasing';

    // トレードシグナル生成
    let tradeSignal = this.generateTradeSignal(pattern, phase3, overallStats);

    return {
      pattern: pattern,
      momentum: momentumDirection,
      pricePosition: overallStats.pricePosition,
      tradeSignal: tradeSignal
    };
  }

  // トレードシグナル生成
  generateTradeSignal(pattern, currentPhase, overallStats) {
    const patternSignals = {
      'v_reversal_up': { action: '押し目買い', reason: '下落後のV字反発、上昇転換', confidence: 75 },
      'v_reversal_down': { action: '戻り売り', reason: '上昇後の反転、下降転換', confidence: 75 },
      'continuous_uptrend': { action: '押し目買い', reason: '継続的な上昇トレンド', confidence: 80 },
      'continuous_downtrend': { action: '戻り売り', reason: '継続的な下降トレンド', confidence: 80 },
      'continuous_ranging': { action: '様子見', reason: 'レンジ相場継続、方向感なし', confidence: 60 },
      'uptrend_weakening': { action: '利確検討', reason: '上昇トレンドの勢い減速', confidence: 65 },
      'downtrend_weakening': { action: '様子見', reason: '下降トレンド減速、反転の兆し', confidence: 65 },
      'accelerating_uptrend': { action: '順張り買い', reason: '上昇トレンドが加速中', confidence: 85 },
      'accelerating_downtrend': { action: '順張り売り', reason: '下降トレンドが加速中', confidence: 85 },
      'w_bottom': { action: '押し目買い', reason: 'W字底形成の可能性', confidence: 70 },
      'm_top': { action: '戻り売り', reason: 'M字天井形成の可能性', confidence: 70 }
    };

    const baseSignal = patternSignals[pattern] || { action: '様子見', reason: '明確なパターンなし', confidence: 50 };

    // 価格位置による補正
    if (overallStats.pricePosition < 20 && currentPhase.trend.includes('up')) {
      baseSignal.confidence += 10;
      baseSignal.reason += '（底値圏からの上昇）';
    } else if (overallStats.pricePosition > 80 && currentPhase.trend.includes('down')) {
      baseSignal.confidence += 10;
      baseSignal.reason += '（天井圏からの下降）';
    }

    return baseSignal;
  }

  // 高度なトレンド判定（改善版 - 3分割分析）
  analyzeTrend() {
    // 最小15本で分析可能に
    if (this.candles.length < 15) {
      return {
        trend: 'insufficient_data',
        strength: 'unknown',
        direction: 'unknown',
        confidence: 0,
        indicators: {},
        details: 'データ不足: 最低15本のローソク足が必要です'
      };
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    const dataLength = this.candles.length;

    // === 3分割分析 ===
    const seg1End = Math.floor(dataLength / 3);
    const seg2End = Math.floor(dataLength * 2 / 3);

    const segment1 = this.candles.slice(0, seg1End);
    const segment2 = this.candles.slice(seg1End, seg2End);
    const segment3 = this.candles.slice(seg2End);

    const phase1 = this.analyzePhase(segment1, '前半');
    const phase2 = this.analyzePhase(segment2, '中盤');
    const phase3 = this.analyzePhase(segment3, '後半');

    // === 全体統計 ===
    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const firstClose = closes[0];
    const priceRange = maxHigh - minLow;
    const pricePosition = ((currentPrice - minLow) / priceRange) * 100;
    const overallChange = ((currentPrice - firstClose) / firstClose) * 100;

    // ADXの平均を計算
    const adxAverage = (phase1.adx + phase2.adx + phase3.adx) / 3;
    const adxTrend = phase3.adx > phase1.adx ? '増加中' : phase3.adx < phase1.adx ? '減少中' : '安定';

    const overallStats = {
      pricePosition: pricePosition,
      overallChange: overallChange,
      adxAverage: adxAverage,
      adxTrend: adxTrend
    };

    // === 相場ストーリー構築 ===
    const story = this.buildMarketStory(phase1, phase2, phase3, overallStats);

    // === トレンド判定（全体変化を最優先）===
    let currentTrend = 'ranging';
    const absOverallChange = Math.abs(overallChange);

    // 全体変化でメイン判定（FX向け閾値）
    if (overallChange > 0.08 && adxAverage > 18) {
      currentTrend = 'strong_uptrend';
    } else if (overallChange < -0.08 && adxAverage > 18) {
      currentTrend = 'strong_downtrend';
    } else if (overallChange > 0.05) {
      currentTrend = adxAverage > 15 ? 'strong_uptrend' : 'weak_uptrend';
    } else if (overallChange < -0.05) {
      currentTrend = adxAverage > 15 ? 'strong_downtrend' : 'weak_downtrend';
    } else if (overallChange > 0.02) {
      currentTrend = 'weak_uptrend';
    } else if (overallChange < -0.02) {
      currentTrend = 'weak_downtrend';
    } else if (absOverallChange < 0.02 && adxAverage < 20) {
      currentTrend = 'ranging';
    } else {
      // 極小変動だがADXが高い場合はphase3を参考
      if (phase3.trend.includes('up')) currentTrend = 'weak_uptrend';
      else if (phase3.trend.includes('down')) currentTrend = 'weak_downtrend';
      else currentTrend = 'ranging';
    }

    // === 最新の指標値も計算（比較用）===
    const ema1Period = Math.min(10, Math.floor(dataLength / 2));
    const ema2Period = Math.min(20, Math.floor(dataLength * 0.8));

    const ema1 = this.calculateEMA(ema1Period);
    const ema2 = this.calculateEMA(ema2Period);
    const sma = this.calculateSMA(Math.min(20, dataLength - 1));
    const adx = this.calculateADX(Math.min(14, Math.floor(dataLength / 2)));
    const atr = this.calculateATR(Math.min(14, Math.floor(dataLength / 2)));
    const rsi = this.calculateRSI(Math.min(14, Math.floor(dataLength / 2)));
    const bb = this.calculateBollingerBands(Math.min(20, dataLength - 1), 2);
    const momentum = this.calculateMomentum(Math.min(10, Math.floor(dataLength / 2)));
    const candlePattern = this.analyzeCandlePattern();
    const macd = this.calculateMACD();

    // === トレンド強度（ADX平均を基準に全体を評価）===
    let strength = 'weak';
    if (adxAverage > 30 || absOverallChange > 0.1) {
      strength = 'very_strong';
    } else if (adxAverage > 20 || absOverallChange > 0.06) {
      strength = 'strong';
    } else if (adxAverage > 12 || absOverallChange > 0.03) {
      strength = 'moderate';
    }

    // === 方向判定（全体変化基準）===
    let direction = 'neutral';
    if (overallChange > 0.02) {
      direction = 'up';
    } else if (overallChange < -0.02) {
      direction = 'down';
    }

    // === 信頼度計算（トレンド強度 + 方向の明確さ）===
    let confidence = 50;

    if (currentTrend !== 'ranging') {
      // トレンドがある場合
      confidence = 60 + (absOverallChange * 500); // 0.1%変化で+50%
      confidence += (adxAverage * 0.8); // ADX平均で加算

      // ストーリーパターンで補正
      if (story.pattern.includes('continuous') || story.pattern.includes('accelerating')) {
        confidence += 10; // 継続・加速パターンは+10%
      } else if (story.pattern.includes('weakening')) {
        confidence -= 10; // 減速パターンは-10%
      }

      confidence = Math.min(95, Math.max(60, confidence)); // 60-95%の範囲
    } else {
      // レンジの場合
      confidence = 50 + (20 - adxAverage); // ADXが低いほど確信度高い
      confidence = Math.min(80, Math.max(50, confidence)); // 50-80%の範囲
    }

    return {
      trend: currentTrend,
      strength: strength,
      direction: direction,
      confidence: Math.round(confidence),
      phases: {
        phase1: phase1,
        phase2: phase2,
        phase3: phase3
      },
      pattern: story.pattern,
      momentum: story.momentum,
      pricePosition: overallStats.pricePosition,
      overallChange: overallStats.overallChange,
      adxAverage: overallStats.adxAverage,
      adxTrend: overallStats.adxTrend,
      tradeSignal: story.tradeSignal,
      indicators: {
        ema1: ema1 ? ema1.toFixed(5) : 'N/A',
        ema2: ema2 ? ema2.toFixed(5) : 'N/A',
        sma: sma ? sma.toFixed(5) : 'N/A',
        adx: adx ? adx.toFixed(2) : 'N/A',
        atr: atr ? atr.toFixed(5) : 'N/A',
        rsi: rsi ? rsi.toFixed(2) : 'N/A',
        momentum: momentum ? momentum.toFixed(2) + '%' : 'N/A',
        currentPrice: currentPrice.toFixed(5),
        bollingerBands: bb ? {
          upper: bb.upper.toFixed(5),
          middle: bb.middle.toFixed(5),
          lower: bb.lower.toFixed(5),
          bandwidth: bb.bandwidth.toFixed(2) + '%'
        } : 'N/A',
        macd: macd ? macd.macd.toFixed(5) : 'N/A',
        candlePattern: candlePattern.pattern
      },
      details: this.generatePhaseBasedDetails(phase1, phase2, phase3, story, overallStats),
      prediction: this.predictFuture(currentTrend, direction, phase3.adx, adx, rsi, momentum, bb, ema1, ema2, currentPrice, candlePattern),
      supportResistance: this.detectSupportResistance(),
      priceActionPattern: this.detectPriceActionPattern(),
      advancedDivergence: this.detectAdvancedDivergence()
    };
  }

  // 未来予測機能
  predictFuture(currentTrend, direction, strength, adx, rsi, momentum, bb, ema1, ema2, currentPrice, candlePattern) {
    const prediction = {
      continuationProbability: 0,
      reversalRisk: 0,
      breakoutPotential: 0,
      nextMove: 'uncertain',
      confidence: 0,
      signals: [],
      entryPoint: null,
      targetPrice: null,
      stopLoss: null
    };

    // サポート・レジスタンス情報を取得
    const sr = this.detectSupportResistance();

    // 高度なダイバージェンスを検出
    const advDiv = this.detectAdvancedDivergence();

    // 価格アクションパターンを検出
    const pricePattern = this.detectPriceActionPattern();

    // === トレンド別の予測ロジック ===

    if (currentTrend === 'ranging') {
      // レンジ相場: ブレイクアウト予測が重要
      prediction.nextMove = 'breakout_uncertain';
      prediction.continuationProbability = 30; // レンジ継続
      prediction.breakoutPotential = 60; // ブレイク可能性
      prediction.confidence = 55;
      prediction.signals.push('📊 レンジ相場 - ブレイクアウト待ち');

      if (bb && bb.bandwidth < 2) {
        prediction.breakoutPotential += 20;
        prediction.signals.push('⚠️ ボリンジャースクイーズ - ブレイク間近');
      }

      if (adx && adx < 15) {
        prediction.continuationProbability += 20;
        prediction.signals.push('✓ ADX低い - レンジ継続の可能性');
      }

    } else {
      // トレンド相場: 継続・反転予測が重要
      let continuationScore = 50; // ベース50%からスタート

      // 1. ADXによる継続確率
      if (adx && adx > 25) {
        continuationScore += 25;
        prediction.signals.push('✓ ADX強い - トレンド継続の可能性');
      } else if (adx && adx > 15) {
        continuationScore += 10;
        prediction.signals.push('✓ ADX中程度 - トレンド継続');
      } else if (adx && adx < 15) {
        continuationScore -= 15;
        prediction.signals.push('⚠️ ADX弱い - トレンド弱まる');
      }

      // 2. モメンタムの維持
      if (momentum && Math.abs(momentum) > 1.0) {
        continuationScore += 15;
        prediction.signals.push(`✓ 勢い維持 (${momentum.toFixed(2)}%)`);
      } else if (momentum && Math.abs(momentum) < 0.3) {
        continuationScore -= 10;
        prediction.signals.push('⚠️ 勢いが弱い');
      }

      // 3. EMAの配置
      if (ema1 && ema2) {
        if ((direction === 'up' && ema1 > ema2) || (direction === 'down' && ema1 < ema2)) {
          continuationScore += 10;
          prediction.signals.push('✓ EMA配置良好 - トレンド継続');
        } else {
          continuationScore -= 10;
          prediction.signals.push('⚠️ EMAクロス警戒 - 反転の兆し');
        }
      }

      // 4. ローソク足パターン
      if (candlePattern && candlePattern.pattern === 'strong_candle') {
        continuationScore += 10;
        prediction.signals.push('✓ 強いローソク足 - 勢い継続');
      }

      // 継続確率を一時保存（後で調整）
      let tempContinuationScore = Math.max(30, Math.min(90, continuationScore));

      // === Stage 1: トレンド強度による調整係数 ===
      const trendStrength = {
        veryStrong: adx > 40,
        strong: adx > 30,
        moderate: adx > 20,
        weak: adx <= 20
      };

      // 反転シグナルの重み係数（強いトレンドほど反転リスクを軽減）
      const reversalWeightFactor =
        trendStrength.veryStrong ? 0.3 :  // 70%減
        trendStrength.strong ? 0.5 :       // 50%減
        trendStrength.moderate ? 0.7 :     // 30%減
        1.0;                               // そのまま

      // === Stage 2: バンドウォーク検出 ===
      const bandWalk = this.detectBandWalk(bb, direction);

      // ダイバージェンスを事前に検出
      const divergence = this.detectDivergence(rsi, momentum, direction);

      // 反転リスクの計算
      let reversalScore = 0; // ベース0%からスタート
      let trueReversalDetected = false; // 真の反転シグナル

      // === Stage 3: 真の反転条件チェック ===
      // 追加条件1: ダイバージェンス
      const hasDivergence = divergence.detected || advDiv.detected;

      // 追加条件2: トレンド減速
      const trendWeakening =
        (momentum && Math.abs(momentum) < 0.15) ||
        (this.candles.length >= 30 && adx < this.calculateADX(Math.min(14, Math.floor(this.candles.length / 2) - 1)));

      // 追加条件3: バンドウォーク中ではない
      const notBandWalking = !bandWalk.detected;

      // RSI過熱の判定
      if (rsi) {
        if (rsi > 70 && direction === 'up') {
          // 上昇トレンドでRSI過熱
          if (hasDivergence && trendWeakening && notBandWalking) {
            // 真の反転シグナル
            reversalScore += 40;
            trueReversalDetected = true;
            prediction.signals.push('🚨 真の反転シグナル検出 - RSI過熱+ダイバージェンス+減速');
          } else {
            // 単なる過熱（トレンド強度で調整）
            reversalScore += 25 * reversalWeightFactor;
            prediction.signals.push('🚨 RSI買われすぎ (>70) - 反転リスク');
          }
        } else if (rsi < 30 && direction === 'down') {
          // 下降トレンドでRSI過熱
          if (hasDivergence && trendWeakening && notBandWalking) {
            // 真の反転シグナル
            reversalScore += 40;
            trueReversalDetected = true;
            prediction.signals.push('🚨 真の反転シグナル検出 - RSI過熱+ダイバージェンス+減速');
          } else {
            // 単なる過熱（トレンド強度で調整）
            reversalScore += 25 * reversalWeightFactor;
            prediction.signals.push('🚨 RSI売られすぎ (<30) - 反転リスク');
          }
        }
      }

      // ボリンジャーバンドの端
      if (bb && bb.upper && bb.lower) {
        const distanceToUpper = Math.abs((bb.upper - currentPrice) / currentPrice) * 100;
        const distanceToLower = Math.abs((currentPrice - bb.lower) / currentPrice) * 100;

        if (distanceToUpper < 0.05 && direction === 'up') {
          // バンドウォーク中は反転リスク軽減
          if (bandWalk.detected) {
            reversalScore += 5; // 大幅軽減
            prediction.signals.push('📊 バンドウォーク中 - BB上限沿い継続');
          } else {
            reversalScore += 20 * reversalWeightFactor;
            prediction.signals.push('⚠️ ボリンジャー上限到達 - 反転警戒');
          }
        } else if (distanceToLower < 0.05 && direction === 'down') {
          // バンドウォーク中は反転リスク軽減
          if (bandWalk.detected) {
            reversalScore += 5; // 大幅軽減
            prediction.signals.push('📊 バンドウォーク中 - BB下限沿い継続');
          } else {
            reversalScore += 20 * reversalWeightFactor;
            prediction.signals.push('⚠️ ボリンジャー下限到達 - 反発警戒');
          }
        }
      }

      // モメンタム減速（閾値を厳しく）
      const momentumThreshold = adx > 40 ? 0.1 : 0.15;
      if (momentum && Math.abs(momentum) < momentumThreshold) {
        reversalScore += 10 * reversalWeightFactor;
        prediction.signals.push('⚠️ 勢い減速 - 反転の可能性');
      }

      // ダイバージェンス（既に上でチェック済みなので、追加スコアのみ）
      if (divergence.detected && !trueReversalDetected) {
        // 真の反転でない場合のみ追加スコア
        reversalScore += 20 * reversalWeightFactor;
        prediction.signals.push(`🚨 ${divergence.type}ダイバージェンス - 反転の兆候`);
      }

      // 高度なダイバージェンス
      if (advDiv.detected && !trueReversalDetected) {
        reversalScore += Math.min(advDiv.confidence, 20) * reversalWeightFactor;
        prediction.signals.push(`🔍 ${advDiv.signal}`);
      }

      // === Stage 4: 継続シグナルの強化 ===
      if (trendStrength.veryStrong || trendStrength.strong) {
        // バンドウォーク中は継続の可能性が高い
        if (bandWalk.detected) {
          continuationScore += 20;
          prediction.signals.push(`📊 バンドウォーク検出 (${bandWalk.count}/5本) - 強いトレンド継続中`);
        }

        // ADXが上昇中（トレンド加速）
        if (this.candles.length >= 30) {
          const prevAdx = this.calculateADX(Math.min(14, Math.floor(this.candles.length / 2) - 1));
          if (adx > prevAdx) {
            continuationScore += 15;
            prediction.signals.push('📈 ADX上昇中 - トレンド加速');
          }
        }

        // モメンタム維持
        if (momentum && Math.abs(momentum) > 0.3) {
          continuationScore += 15;
          prediction.signals.push(`⚡ 強いモメンタム (${momentum.toFixed(2)}%) - 勢い継続`);
        }
      }

      // 価格アクションパターン
      if (pricePattern.pattern === 'double_top' || pricePattern.pattern === 'head_and_shoulders') {
        reversalScore += 15;
        const patternName = pricePattern.pattern === 'double_top' ? 'ダブルトップ' : 'ヘッドアンドショルダー';
        prediction.signals.push(`📉 ${patternName}形成 - 下落の可能性`);
      } else if (pricePattern.pattern === 'double_bottom' || pricePattern.pattern === 'inverse_head_and_shoulders') {
        if (direction === 'down') {
          reversalScore += 15;
          const patternName = pricePattern.pattern === 'double_bottom' ? 'ダブルボトム' : '逆ヘッドアンドショルダー';
          prediction.signals.push(`📈 ${patternName}形成 - 上昇の可能性`);
        }
      }

      // サポート・レジスタンスへの接近
      if (sr.distanceToResistance !== undefined && sr.distanceToResistance < 1 && direction === 'up') {
        reversalScore += 15;
        prediction.signals.push(`🚧 レジスタンス接近 (${sr.resistance.toFixed(5)}) - 反転警戒`);
      } else if (sr.distanceToSupport !== undefined && sr.distanceToSupport < 1 && direction === 'down') {
        reversalScore += 15;
        prediction.signals.push(`🛡️ サポート接近 (${sr.support.toFixed(5)}) - 反発の可能性`);
      }

      // 継続スコアと反転スコアを再計算（Stage 4で追加された分を反映）
      tempContinuationScore = Math.max(30, Math.min(90, continuationScore));

      // 反転リスクを範囲制限
      let tempReversalScore = Math.max(10, Math.min(90, reversalScore));

      // === 相反関係の調整 ===
      // 継続と反転は合計で100%になるように調整
      const totalScore = tempContinuationScore + tempReversalScore;

      if (totalScore > 100) {
        // 合計が100%を超える場合、比率を保ったまま調整
        const ratio = 100 / totalScore;
        prediction.continuationProbability = Math.round(tempContinuationScore * ratio);
        prediction.reversalRisk = Math.round(tempReversalScore * ratio);
      } else {
        // 合計が100%未満の場合、そのまま使用
        prediction.continuationProbability = Math.round(tempContinuationScore);
        prediction.reversalRisk = Math.round(tempReversalScore);
      }

      // 最終的な確率が極端にならないよう調整
      // どちらかが10%未満にならないようにする
      if (prediction.continuationProbability < 10) {
        prediction.continuationProbability = 10;
        prediction.reversalRisk = 90;
      } else if (prediction.reversalRisk < 10) {
        prediction.reversalRisk = 10;
        prediction.continuationProbability = 90;
      }

      // 次の動きを予測（トレンド中）
      // どちらのシグナルが強いかで判断
      if (prediction.reversalRisk > prediction.continuationProbability) {
        // 反転の可能性が高い
        prediction.nextMove = direction === 'up' ? 'reversal_down' : 'reversal_up';
        prediction.confidence = prediction.reversalRisk;
      } else if (prediction.continuationProbability > prediction.reversalRisk) {
        // 継続の可能性が高い
        prediction.nextMove = direction === 'up' ? 'continue_up' : 'continue_down';
        prediction.confidence = prediction.continuationProbability;
      } else {
        // 拮抗している場合は様子見
        prediction.nextMove = 'consolidation';
        prediction.confidence = 50;
      }
    }

    // 5. バイナリーオプション向けエントリー提案
    if (currentPrice) {
      const range = sr.resistance && sr.support ? sr.resistance - sr.support : currentPrice * 0.001;
      const priceBuffer = range * 0.1; // 価格の10%をバッファとして使用

      if (prediction.nextMove === 'continue_up' || prediction.nextMove === 'breakout_up') {
        // 上昇継続予測 → HIGH エントリー
        prediction.entryDirection = 'HIGH';
        prediction.entryTiming = '今すぐエントリー可能';

        // 押し目エントリーポイントも提案
        if (sr.support) {
          prediction.betterEntryPrice = sr.support + priceBuffer;
          prediction.betterEntryTiming = `サポート付近 (${prediction.betterEntryPrice.toFixed(5)}) まで待つ`;
        }

      } else if (prediction.nextMove === 'continue_down' || prediction.nextMove === 'breakout_down') {
        // 下降継続予測 → LOW エントリー
        prediction.entryDirection = 'LOW';
        prediction.entryTiming = '今すぐエントリー可能';

        // 戻り売りエントリーポイントも提案
        if (sr.resistance) {
          prediction.betterEntryPrice = sr.resistance - priceBuffer;
          prediction.betterEntryTiming = `レジスタンス付近 (${prediction.betterEntryPrice.toFixed(5)}) まで待つ`;
        }

      } else if (prediction.nextMove === 'reversal_up') {
        // 上昇反転予測 → LOW から HIGH へ
        prediction.entryDirection = 'HIGH';

        if (sr.support) {
          prediction.betterEntryPrice = sr.support + priceBuffer;
          prediction.entryTiming = `サポート付近 (${prediction.betterEntryPrice.toFixed(5)}) で反発を確認`;
        } else {
          prediction.entryTiming = '反転のローソク足パターンを確認';
        }

      } else if (prediction.nextMove === 'reversal_down') {
        // 下降反転予測 → HIGH から LOW へ
        prediction.entryDirection = 'LOW';

        if (sr.resistance) {
          prediction.betterEntryPrice = sr.resistance - priceBuffer;
          prediction.entryTiming = `レジスタンス付近 (${prediction.betterEntryPrice.toFixed(5)}) で反落を確認`;
        } else {
          prediction.entryTiming = '反転のローソク足パターンを確認';
        }

      } else {
        // 様子見・調整局面
        prediction.entryDirection = '様子見';
        prediction.entryTiming = '明確なトレンドが形成されるまで待機';
      }
    }

    return prediction;
  }

  // ダイバージェンス検出
  detectDivergence(rsi, momentum, direction) {
    // 簡易的な実装：RSIとモメンタムの方向性をチェック
    if (!rsi || !momentum) {
      return { detected: false, type: 'none' };
    }

    // 弱気ダイバージェンス：価格上昇だがRSI/モメンタム低下
    if (direction === 'up' && rsi < 60 && momentum < 0.5) {
      return { detected: true, type: '弱気' };
    }

    // 強気ダイバージェンス：価格下降だがRSI/モメンタム上昇
    if (direction === 'down' && rsi > 40 && momentum > -0.5) {
      return { detected: true, type: '強気' };
    }

    return { detected: false, type: 'none' };
  }

  generateEnhancedDetails(trend, strength, rsi, direction, directionScore, momentum, candlePattern) {
    const trendDescriptions = {
      'strong_uptrend': '🔥 強い上昇トレンド - 積極的買いシグナル',
      'weak_uptrend': '↗️ 弱い上昇トレンド - 慎重な買いシグナル',
      'strong_downtrend': '❄️ 強い下降トレンド - 積極的売りシグナル',
      'weak_downtrend': '↘️ 弱い下降トレンド - 慎重な売りシグナル',
      'ranging': '⏸️ レンジ相場 - 様子見推奨',
      'insufficient_data': 'データ不足 - 分析不可'
    };

    let details = trendDescriptions[trend] || '判定不能';

    details += `\nトレンド強度: ${strength} (スコア: ${strength.toFixed(1)})`;
    details += `\n方向性: ${direction} (スコア: ${directionScore.toFixed(2)})`;

    if (rsi) {
      if (rsi > 70) {
        details += `\n⚠️ RSI: ${rsi.toFixed(1)} - 買われすぎ（調整の可能性）`;
      } else if (rsi < 30) {
        details += `\n⚠️ RSI: ${rsi.toFixed(1)} - 売られすぎ（反発の可能性）`;
      } else {
        details += `\n✓ RSI: ${rsi.toFixed(1)} - 正常範囲`;
      }
    }

    if (momentum) {
      if (Math.abs(momentum) > 2) {
        details += `\n🚀 モメンタム: ${momentum.toFixed(2)}% - 強い勢い`;
      } else {
        details += `\n📊 モメンタム: ${momentum.toFixed(2)}% - 通常の勢い`;
      }
    }

    if (candlePattern && candlePattern.pattern !== 'neutral') {
      const patternDesc = candlePattern.pattern === 'strong_candle' ? '強いローソク足' :
                         candlePattern.pattern === 'reversal' ? '反転の兆候' : '';
      if (patternDesc) {
        details += `\n🕯️ パターン: ${patternDesc}`;
      }
    }

    return details;
  }

  // フェーズベースの詳細説明生成
  generatePhaseBasedDetails(phase1, phase2, phase3, story, overallStats) {
    const patternDescriptions = {
      'v_reversal_up': 'V字反発（下落→底打ち→上昇）',
      'v_reversal_down': '逆V字反転（上昇→天井→下落）',
      'w_bottom': 'W字底形成（二番底パターン）',
      'm_top': 'M字天井形成（二番天井パターン）',
      'continuous_uptrend': '継続的な上昇トレンド',
      'continuous_downtrend': '継続的な下降トレンド',
      'continuous_ranging': 'レンジ相場継続',
      'uptrend_weakening': '上昇トレンドの減速',
      'downtrend_weakening': '下降トレンドの減速',
      'accelerating_uptrend': '上昇トレンド加速中',
      'accelerating_downtrend': '下降トレンド加速中',
      'unknown': 'パターン不明'
    };

    const trendEmojis = {
      'uptrend': '📈',
      'downtrend': '📉',
      'weak_uptrend': '↗️',
      'weak_downtrend': '↘️',
      'ranging': '⏸️'
    };

    let details = `📊 相場ストーリー: ${patternDescriptions[story.pattern] || 'パターン不明'}\n`;
    details += `\n【3分割分析】(総本数: ${this.candles.length}本)\n`;

    // 前半 - 開始価格と終了価格を追加
    const phase1Emoji = trendEmojis[phase1.trend] || '➖';
    details += `前半: ${phase1Emoji} ${this.getTrendJapanese(phase1.trend)}`;
    details += ` (ADX: ${phase1.adx.toFixed(1)}, 変化: ${phase1.change.toFixed(3)}%)`;
    details += `\n  価格: ${phase1.startPrice.toFixed(5)} → ${phase1.endPrice.toFixed(5)}\n`;

    // 中盤
    const phase2Emoji = trendEmojis[phase2.trend] || '➖';
    details += `中盤: ${phase2Emoji} ${this.getTrendJapanese(phase2.trend)}`;
    details += ` (ADX: ${phase2.adx.toFixed(1)}, 変化: ${phase2.change.toFixed(3)}%)`;
    details += `\n  価格: ${phase2.startPrice.toFixed(5)} → ${phase2.endPrice.toFixed(5)}\n`;

    // 後半
    const phase3Emoji = trendEmojis[phase3.trend] || '➖';
    details += `後半: ${phase3Emoji} ${this.getTrendJapanese(phase3.trend)}`;
    details += ` (ADX: ${phase3.adx.toFixed(1)}, 変化: ${phase3.change.toFixed(3)}%)`;
    details += `\n  価格: ${phase3.startPrice.toFixed(5)} → ${phase3.endPrice.toFixed(5)}\n`;

    // 全体統計
    details += `\n【全体統計】\n`;
    details += `開始価格: ${this.candles[0].close.toFixed(5)}\n`;
    details += `終了価格: ${this.candles[this.candles.length-1].close.toFixed(5)}\n`;
    details += `全体変化: ${overallStats.overallChange.toFixed(3)}%\n`;
    details += `価格位置: ${overallStats.pricePosition.toFixed(1)}% (範囲内)\n`;
    details += `ADX平均: ${overallStats.adxAverage.toFixed(1)} (${overallStats.adxTrend})\n`;

    // トレードシグナル
    details += `\n【トレードシグナル】\n`;
    details += `📌 推奨: ${story.tradeSignal.action}\n`;
    details += `💡 理由: ${story.tradeSignal.reason}\n`;
    details += `🎯 信頼度: ${story.tradeSignal.confidence}%`;

    return details;
  }

  // トレンド名の日本語変換
  getTrendJapanese(trend) {
    const trendNames = {
      'uptrend': '上昇トレンド',
      'downtrend': '下降トレンド',
      'weak_uptrend': '弱い上昇',
      'weak_downtrend': '弱い下降',
      'ranging': 'レンジ',
      'unknown': '不明'
    };
    return trendNames[trend] || trend;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.TechnicalAnalysisEngineV2 = TechnicalAnalysisEngineV2;
}
