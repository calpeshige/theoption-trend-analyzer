// Signal Engine 20 - 20インジケーター多数決シグナルシステム
// bubinga_system/signal-engine.js から移植
// theoption_trend用にインターフェースを調整

class SignalEngine20 {
  constructor() {
    this.candles = [];
    this.trendMode = null;
    this.rangeContext = null;
    this.shortTermMomentum = null;

    // v5.10.6: 判定時間別パラメータ（デフォルトは標準値）
    this.params = {
      ma: [5, 20, 50],       // EMA短期, 中期, 長期
      macd: [12, 26, 9],     // fast, slow, signal
      ich: [9, 26, 52],      // 転換線, 基準線, 先行スパン
      adx: 14                // ADX期間
    };

    // v5.10.6: モメンタムフィルタ設定
    this.filterLevel = 1;  // 0=OFF, 1=弱, 2=中, 3=強
    this.filterParams = {
      candleCheckCount: 5,   // 直近N本の陽線/陰線チェック
      atrLookbackShort: 3,   // ATR短期平均
      atrLookbackLong: 10,   // ATR長期平均
      rocCount: 3            // ROC計算用の本数
    };

    // 20インジケーターの定義
    this.INDICATORS = [
      { id: 'MA', name: 'Moving Average', abbr: 'MA', category: 'trend' },
      { id: 'BB', name: 'Bollinger Bands', abbr: 'BB', category: 'trend' },
      { id: 'MAC', name: 'MACD', abbr: 'MAC', category: 'trend' },
      { id: 'RSI', name: 'RSI', abbr: 'RSI', category: 'oscillator' },
      { id: 'STO', name: 'Stochastic', abbr: 'STO', category: 'oscillator' },
      { id: 'ICH', name: 'Ichimoku', abbr: 'ICH', category: 'trend' },
      { id: 'ATR', name: 'ATR', abbr: 'ATR', category: 'volatility' },
      { id: 'ADX', name: 'ADX', abbr: 'ADX', category: 'volatility' },
      { id: 'SAR', name: 'Parabolic SAR', abbr: 'SAR', category: 'trend' },
      { id: 'ENV', name: 'Envelopes', abbr: 'ENV', category: 'trend' },
      { id: 'SDV', name: 'Std Deviation', abbr: 'SDV', category: 'volatility' },
      { id: 'CCI', name: 'CCI', abbr: 'CCI', category: 'oscillator' },
      { id: 'MOM', name: 'Momentum', abbr: 'MOM', category: 'oscillator' },
      { id: 'WPR', name: 'Williams %R', abbr: 'WPR', category: 'oscillator' },
      { id: 'FRX', name: 'Force Index', abbr: 'FRX', category: 'volume' },
      { id: 'DEM', name: 'DeMarker', abbr: 'DEM', category: 'oscillator' },
      { id: 'ALG', name: 'Alligator', abbr: 'ALG', category: 'trend' },
      { id: 'FRA', name: 'Fractals', abbr: 'FRA', category: 'volatility' },
      { id: 'ACD', name: 'A/D', abbr: 'ACD', category: 'volume' },
      { id: 'OBV', name: 'OBV', abbr: 'OBV', category: 'volume' }
    ];
  }

  // ローソク足データをセット
  setCandles(candles) {
    this.candles = candles;
    this.trendMode = null;
  }

  // v5.10.6: 判定時間別パラメータをセット
  setParams(params) {
    if (params) {
      if (params.ma) this.params.ma = params.ma;
      if (params.macd) this.params.macd = params.macd;
      if (params.ich) this.params.ich = params.ich;
      if (params.adx !== undefined) this.params.adx = params.adx;
    }
  }

  // v5.10.6: フィルタ強度をセット (0=OFF, 1=弱, 2=中, 3=強)
  setFilterLevel(level) {
    this.filterLevel = Math.max(0, Math.min(3, level));
  }

  // v5.10.6: フィルタパラメータをセット（判定時間別）
  setFilterParams(params) {
    if (params) {
      Object.assign(this.filterParams, params);
    }
  }

  // ========================================
  // メイン分析関数
  // ========================================

  analyze() {
    // v5.9.5: 最低本数は呼び出し側(TIMEFRAME_CONFIGS.signal20.minCandles)で判定時間別に制御
    // ここでは最低限の安全チェックのみ（RSI(14)計算に最低14本必要）
    if (this.candles.length < 14) {
      return {
        signal: 'WAIT',
        indicators: [],
        highCount: 0,
        lowCount: 0,
        starLevel: 0,
        reason: `データ不足（${this.candles.length}本 / 最低14本必要）`,
        timestamp: Date.now()
      };
    }

    // 強いトレンドを検出
    this.trendMode = this.detectStrongTrend();

    // レンジ相場の検出と位置判定
    this.rangeContext = this.detectRangeContext();

    // 短期モメンタムの検出
    this.shortTermMomentum = this.detectShortTermMomentum();

    // 20インジケーターの判定を実行
    const indicators = this.analyzeAllIndicators();

    // 多数決カウント
    const highCount = indicators.filter(ind => ind.signal === 'HIGH').length;
    const lowCount = indicators.filter(ind => ind.signal === 'LOW').length;
    const neutralCount = 20 - highCount - lowCount;

    // シグナル判定（3段階星）
    const { signal, starLevel } = this.determineSignal(highCount, lowCount);

    // v5.10.6: モメンタムフィルタ適用
    const momentumCheck = this.checkMomentumFilter(signal);
    const filteredSignal = momentumCheck.passed ? signal : 'NEUTRAL';
    const filteredStarLevel = momentumCheck.passed ? starLevel : 0;

    return {
      signal: filteredSignal,        // フィルタ適用後のシグナル
      rawSignal: signal,             // フィルタ前の生シグナル
      indicators: indicators,
      highCount: highCount,
      lowCount: lowCount,
      neutralCount: neutralCount,
      starLevel: filteredStarLevel,
      rawStarLevel: starLevel,       // フィルタ前の星レベル
      trendMode: this.trendMode,
      momentumFilter: momentumCheck, // フィルタ詳細情報
      timestamp: Date.now()
    };
  }

  // シグナル判定：多数決 → 3段階星
  determineSignal(highCount, lowCount) {
    const maxCount = Math.max(highCount, lowCount);
    const direction = highCount > lowCount ? 'HIGH' : 'LOW';

    // 13個未満 = シグナルなし
    if (maxCount < 13) {
      return { signal: 'NEUTRAL', starLevel: 0 };
    }

    // 強トレンドフィルター：逆方向シグナルを抑制
    if (this.trendMode === 'STRONG_UP' && direction === 'LOW') {
      return { signal: 'NEUTRAL', starLevel: 0 };
    }
    if (this.trendMode === 'STRONG_DOWN' && direction === 'HIGH') {
      return { signal: 'NEUTRAL', starLevel: 0 };
    }

    // 星レベル判定
    let starLevel;
    if (maxCount >= 17) {
      starLevel = 3;  // 17-20個：強い一致
    } else if (maxCount >= 15) {
      starLevel = 2;  // 15-16個：明確な優勢
    } else {
      starLevel = 1;  // 13-14個：優勢だが確信薄
    }

    return { signal: direction, starLevel: starLevel };
  }

  // ========================================
  // v5.10.6: モメンタムフィルタ
  // 多数決シグナルが出た後、直近の値動きに勢いがあるか検証
  // ========================================

  checkMomentumFilter(signal) {
    // フィルタOFF or NEUTRALシグナルはそのまま通過
    if (this.filterLevel === 0 || signal === 'NEUTRAL' || signal === 'WAIT') {
      return { passed: true, score: 3, details: { candle: true, atr: true, roc: true }, level: this.filterLevel };
    }

    const fp = this.filterParams;
    const isHigh = signal === 'HIGH';

    // (1) 直近N本の陽線/陰線比率
    const candleCheck = this._checkCandleDirection(isHigh, fp.candleCheckCount);

    // (2) ATR縮小率（勢いの残量）
    const atrCheck = this._checkATRExpansion(fp.atrLookbackShort, fp.atrLookbackLong);

    // (3) 直近N本のROC（価格変化率）
    const rocCheck = this._checkROCDirection(isHigh, fp.rocCount);

    const score = (candleCheck ? 1 : 0) + (atrCheck ? 1 : 0) + (rocCheck ? 1 : 0);

    // フィルタ強度に応じた閾値
    // 弱: 1/3以上でOK、中: 2/3以上でOK、強: 3/3全てでOK
    const requiredScore = this.filterLevel; // 1=弱, 2=中, 3=強
    const passed = score >= requiredScore;

    return {
      passed: passed,
      score: score,
      requiredScore: requiredScore,
      details: { candle: candleCheck, atr: atrCheck, roc: rocCheck },
      level: this.filterLevel
    };
  }

  // フィルタ(1): 直近N本のローソク足がシグナル方向に動いているか
  _checkCandleDirection(isHigh, count) {
    if (this.candles.length < count) return true; // データ不足は通過
    const recent = this.candles.slice(-count);
    let supportCount = 0;
    for (const c of recent) {
      if (isHigh && c.close > c.open) supportCount++;
      else if (!isHigh && c.close < c.open) supportCount++;
    }
    // 過半数がシグナル方向ならOK
    return supportCount >= Math.ceil(count / 2);
  }

  // フィルタ(2): ATRが縮小していないか（勢い残量チェック）
  _checkATRExpansion(shortLookback, longLookback) {
    const atr = this.calculateATRArray(14);
    if (atr.length < longLookback) return true; // データ不足は通過
    const shortAvg = atr.slice(-shortLookback).reduce((a, b) => a + b, 0) / shortLookback;
    const longAvg = atr.slice(-longLookback).reduce((a, b) => a + b, 0) / longLookback;
    // 短期ATRが長期ATRの70%以上あれば勢い十分
    return shortAvg >= longAvg * 0.7;
  }

  // フィルタ(3): 直近N本のROC（価格変化率）がシグナル方向か
  _checkROCDirection(isHigh, count) {
    if (this.candles.length < count + 1) return true; // データ不足は通過
    const current = this.candles[this.candles.length - 1].close;
    const past = this.candles[this.candles.length - 1 - count].close;
    const roc = (current - past) / past;
    // ROCがシグナル方向であればOK
    if (isHigh) return roc > 0;
    return roc < 0;
  }

  // ========================================
  // 強いトレンド検出システム
  // ========================================

  // v5.10.6: パラメータ対応
  detectStrongTrend() {
    const minRequired = Math.max(this.params.ma[2], this.params.adx * 2);
    if (this.candles.length < minRequired) return null;

    let score = 0;
    let direction = 0;

    // 条件1: ADX > 25 かつ DI方向
    const adxData = this.calculateADXFull(this.params.adx);
    if (adxData && adxData.adx > 25) {
      score++;
      direction += adxData.plusDI > adxData.minusDI ? 1 : -1;
      if (adxData.adx > 35) {
        score++;
        direction += adxData.plusDI > adxData.minusDI ? 1 : -1;
      }
    }

    // 条件2: EMA配列（パラメータ対応）
    const ema20 = this.calculateEMAArray(this.params.ma[1]);
    const ema50 = this.calculateEMAArray(this.params.ma[2]);
    const currentPrice = this.candles[this.candles.length - 1].close;

    if (ema20.length > 0 && ema50.length > 0) {
      const ema20Current = ema20[ema20.length - 1];
      const ema50Current = ema50[ema50.length - 1];
      if (currentPrice > ema20Current && ema20Current > ema50Current) {
        score++;
        direction += 1;
      } else if (currentPrice < ema20Current && ema20Current < ema50Current) {
        score++;
        direction -= 1;
      }
    }

    // 条件3: 直近10本の陰線/陽線比率
    const recentCandles = this.candles.slice(-10);
    let bearishCount = 0;
    let bullishCount = 0;
    recentCandles.forEach(c => {
      if (c.close < c.open) bearishCount++;
      else if (c.close > c.open) bullishCount++;
    });
    if (bearishCount >= 7) { score++; direction -= 1; }
    else if (bullishCount >= 7) { score++; direction += 1; }

    // 条件4: 直近の価格変動率
    const priceChange = (currentPrice - this.candles[this.candles.length - 10].close) / this.candles[this.candles.length - 10].close;
    if (Math.abs(priceChange) > 0.004) {
      score++;
      direction += priceChange > 0 ? 1 : -1;
    }

    // 条件5: MACDトレンド判定
    const macd = this.calculateMACDArray();
    if (macd.length >= 5) {
      const current = macd[macd.length - 1];
      const prev3 = macd[macd.length - 4];
      if (current.macd > current.signal && current.histogram > prev3.histogram) {
        score++;
        direction += 1;
      } else if (current.macd < current.signal && current.histogram < prev3.histogram) {
        score++;
        direction -= 1;
      }
    }

    // 条件6: 連続した価格の方向
    const last5 = this.candles.slice(-5);
    let consecutiveUp = 0;
    let consecutiveDown = 0;
    for (let i = 1; i < last5.length; i++) {
      if (last5[i].close > last5[i - 1].close) consecutiveUp++;
      else if (last5[i].close < last5[i - 1].close) consecutiveDown++;
    }
    if (consecutiveUp >= 4) { score++; direction += 1; }
    else if (consecutiveDown >= 4) { score++; direction -= 1; }

    if (score >= 3) {
      if (direction >= 3) return 'STRONG_UP';
      if (direction <= -3) return 'STRONG_DOWN';
    }

    return null;
  }

  // ========================================
  // レンジ相場検出
  // ========================================

  // v5.10.6: パラメータ対応
  detectRangeContext() {
    const minRequired = Math.max(this.params.ma[2], this.params.adx * 2);
    if (this.candles.length < minRequired) {
      return { isRange: false, position: 'middle', positionPercent: 50 };
    }

    const lookback = Math.min(100, this.candles.length);
    const recentCandles = this.candles.slice(-lookback);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);
    const rangeWidth = rangeHigh - rangeLow;

    const currentPrice = this.candles[this.candles.length - 1].close;
    const positionPercent = ((currentPrice - rangeLow) / rangeWidth) * 100;

    const adxData = this.calculateADXFull(this.params.adx);
    const isWeakTrend = !adxData || adxData.adx < 25;
    const isRange = isWeakTrend && !this.trendMode;

    let position = 'middle';
    if (positionPercent <= 25) position = 'low_zone';
    else if (positionPercent >= 75) position = 'high_zone';

    return { isRange, position, positionPercent: Math.round(positionPercent) };
  }

  // ========================================
  // 短期モメンタム検出
  // ========================================

  detectShortTermMomentum() {
    if (this.candles.length < 5) {
      return { direction: 'neutral', consecutiveCount: 0, strength: 0 };
    }

    const last5 = this.candles.slice(-5);
    let bullishCount = 0;
    let bearishCount = 0;
    for (const candle of last5) {
      if (candle.close > candle.open) bullishCount++;
      else if (candle.close < candle.open) bearishCount++;
    }

    let consecutiveCount = 0;
    let lastDirection = null;
    for (let i = this.candles.length - 1; i >= Math.max(0, this.candles.length - 10); i--) {
      const candle = this.candles[i];
      const isBullish = candle.close > candle.open;
      if (consecutiveCount === 0) {
        lastDirection = isBullish ? 'up' : 'down';
        consecutiveCount = 1;
      } else if ((lastDirection === 'up' && isBullish) || (lastDirection === 'down' && !isBullish)) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    let direction = 'neutral';
    let strength = 0;
    if (bullishCount >= 4) { direction = 'bullish'; strength = bullishCount; }
    else if (bearishCount >= 4) { direction = 'bearish'; strength = bearishCount; }
    else if (bullishCount >= 3 && consecutiveCount >= 3 && lastDirection === 'up') { direction = 'bullish'; strength = 3; }
    else if (bearishCount >= 3 && consecutiveCount >= 3 && lastDirection === 'down') { direction = 'bearish'; strength = 3; }

    return { direction, consecutiveCount, strength };
  }

  getRangeContextAdjustment() {
    if (!this.rangeContext || !this.shortTermMomentum || this.trendMode) return 0;

    const { isRange, position } = this.rangeContext;
    const { direction, strength } = this.shortTermMomentum;
    const rangeFactor = isRange ? 1.0 : 0.5;
    let adjustment = 0;

    if (position === 'low_zone' && direction === 'bullish') adjustment = strength * rangeFactor;
    else if (position === 'high_zone' && direction === 'bearish') adjustment = -strength * rangeFactor;
    else if (position === 'low_zone' && direction === 'bearish') adjustment = 1 * rangeFactor;
    else if (position === 'high_zone' && direction === 'bullish') adjustment = -1 * rangeFactor;
    else if (position === 'middle' && direction === 'bullish') adjustment = Math.min(2, strength) * rangeFactor * 0.5;
    else if (position === 'middle' && direction === 'bearish') adjustment = -Math.min(2, strength) * rangeFactor * 0.5;

    return Math.round(adjustment);
  }

  getFilteredSignal(score, threshold = 1) {
    let adjustedScore = score + this.getRangeContextAdjustment();
    if (adjustedScore > threshold) return 'HIGH';
    if (adjustedScore < -threshold) return 'LOW';
    return 'NEUTRAL';
  }

  getFilteredSignalRaw(score, threshold = 1) {
    if (score > threshold) return 'HIGH';
    if (score < -threshold) return 'LOW';
    return 'NEUTRAL';
  }

  // ========================================
  // 全インジケーター分析
  // ========================================

  analyzeAllIndicators() {
    return [
      this.analyzeMA(),
      this.analyzeBB(),
      this.analyzeMACD(),
      this.analyzeRSI(),
      this.analyzeSTO(),
      this.analyzeICH(),
      this.analyzeATR(),
      this.analyzeADX(),
      this.analyzeSAR(),
      this.analyzeENV(),
      this.analyzeSDV(),
      this.analyzeCCI(),
      this.analyzeMOM(),
      this.analyzeWPR(),
      this.analyzeFRX(),
      this.analyzeDEM(),
      this.analyzeALG(),
      this.analyzeFRA(),
      this.analyzeACD(),
      this.analyzeOBV()
    ];
  }

  // ========================================
  // トレンド系インジケーター (7個)
  // ========================================

  // 1. MA - 3層EMAクロス分析（v5.10.6: パラメータ対応）
  analyzeMA() {
    const [maPeriodShort, maPeriodMid, maPeriodLong] = this.params.ma;
    const emaShort = this.calculateEMAArray(maPeriodShort);
    const emaMid = this.calculateEMAArray(maPeriodMid);
    const emaLong = this.calculateEMAArray(maPeriodLong);
    const currentPrice = this.candles[this.candles.length - 1].close;

    if (emaShort.length < 5 || emaMid.length < 5 || emaLong.length < 5) {
      return { id: 'MA', abbr: 'MA', signal: 'NEUTRAL' };
    }

    const ema5Current = emaShort[emaShort.length - 1];
    const ema20Current = emaMid[emaMid.length - 1];
    const ema50Current = emaLong[emaLong.length - 1];
    const ema5Prev3 = emaShort[emaShort.length - 4];
    const ema20Prev3 = emaMid[emaMid.length - 4];
    const ema50Prev3 = emaLong[emaLong.length - 4];

    let score = 0;

    // EMAの並び順
    if (ema5Current > ema20Current && ema20Current > ema50Current) score += 3;
    else if (ema5Current < ema20Current && ema20Current < ema50Current) score -= 3;
    else if (ema5Current > ema20Current) score += 1;
    else if (ema5Current < ema20Current) score -= 1;

    // EMA収束検出
    const emaSpread = Math.abs(ema5Current - ema50Current) / ema50Current * 100;
    const emaSpreadPrev = Math.abs(ema5Prev3 - ema50Prev3) / ema50Prev3 * 100;
    if (emaSpread < 0.15) score = Math.round(score * 0.5);
    else if (emaSpread > emaSpreadPrev * 1.3) score = score > 0 ? score + 1 : score - 1;

    // EMA傾斜角度
    const ema20Slope = (ema20Current - ema20Prev3) / ema20Prev3 * 100;
    const ema50Slope = (ema50Current - ema50Prev3) / ema50Prev3 * 100;
    if (ema20Slope > 0.05 && ema50Slope > 0.03) score += 1;
    else if (ema20Slope < -0.05 && ema50Slope < -0.03) score -= 1;
    if (Math.abs(ema20Slope) > Math.abs(ema50Slope) * 1.5) score = score > 0 ? score + 1 : score - 1;

    // 価格乖離率
    const deviationFromEma20 = (currentPrice - ema20Current) / ema20Current * 100;
    if (deviationFromEma20 > 0.5 && score > 0) score -= 1;
    else if (deviationFromEma20 < -0.5 && score < 0) score += 1;

    // クロス後の確認
    const ema5Prev = emaShort[emaShort.length - 3];
    const ema20Prev = emaMid[emaMid.length - 3];
    const ema5Prev2 = emaShort[emaShort.length - 2];
    const ema20Prev2 = emaMid[emaMid.length - 2];

    if (ema5Prev < ema20Prev && ema5Prev2 > ema20Prev2 && ema5Current > ema20Current) score += 2;
    else if (ema5Prev < ema20Prev && ema5Current > ema20Current) score += 1;
    if (ema5Prev > ema20Prev && ema5Prev2 < ema20Prev2 && ema5Current < ema20Current) score -= 2;
    else if (ema5Prev > ema20Prev && ema5Current < ema20Current) score -= 1;

    // 価格とEMA中期の位置関係
    let priceAboveEma20Count = 0;
    for (let i = 0; i < 5; i++) {
      if (this.candles[this.candles.length - 1 - i].close > emaMid[emaMid.length - 1 - i]) priceAboveEma20Count++;
    }
    if (priceAboveEma20Count >= 4) score += 1;
    else if (priceAboveEma20Count <= 1) score -= 1;

    return { id: 'MA', abbr: 'MA', signal: this.getFilteredSignal(score) };
  }

  // 2. BB - ボリンジャーバンド
  analyzeBB() {
    const bb = this.calculateBollingerBandsArray(20, 2);
    if (bb.length < 10) return { id: 'BB', abbr: 'BB', signal: 'NEUTRAL' };

    const current = bb[bb.length - 1];
    const prev5 = bb[bb.length - 6];
    const prev10 = bb[bb.length - 10];
    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    let score = 0;

    const bandWidth = current.upper - current.lower;
    const percentB = (currentPrice - current.lower) / bandWidth;

    const currBandwidthPct = bandWidth / current.middle * 100;
    const prev5BandwidthPct = (prev5.upper - prev5.lower) / prev5.middle * 100;
    let avgBandwidth = 0;
    for (let i = bb.length - 10; i < bb.length; i++) {
      avgBandwidth += (bb[i].upper - bb[i].lower) / bb[i].middle * 100;
    }
    avgBandwidth /= 10;

    const isSqueezing = currBandwidthPct < avgBandwidth * 0.8;
    const wasSqueezing = prev5BandwidthPct < avgBandwidth * 0.8;
    const isExpanding = currBandwidthPct > prev5BandwidthPct * 1.2;

    if (wasSqueezing && isExpanding) {
      if (percentB > 0.8) score += 3;
      else if (percentB < 0.2) score -= 3;
    } else if (isSqueezing) {
      score = Math.round(score * 0.5);
    }

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (percentB < 0.5) score -= 2;
      if (percentB < 0.25) score -= 2;
      if (currentPrice < current.middle) score -= 1;
      return { id: 'BB', abbr: 'BB', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (percentB > 0.5) score += 2;
      if (percentB > 0.75) score += 2;
      if (currentPrice > current.middle) score += 1;
      return { id: 'BB', abbr: 'BB', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // バンドウォーク検出
    let upperWalkCount = 0, lowerWalkCount = 0, upperTouchCount = 0, lowerTouchCount = 0;
    for (let i = bb.length - 5; i < bb.length; i++) {
      const candle = this.candles[this.candles.length - (bb.length - i)];
      const bandData = bb[i];
      const pos = (candle.close - bandData.lower) / (bandData.upper - bandData.lower);
      if (pos > 0.8) upperWalkCount++;
      if (pos < 0.2) lowerWalkCount++;
      if (candle.high >= bandData.upper * 0.995) upperTouchCount++;
      if (candle.low <= bandData.lower * 1.005) lowerTouchCount++;
    }

    if (upperTouchCount >= 3) { score += upperWalkCount >= 3 ? 2 : -1; }
    if (lowerTouchCount >= 3) { score += lowerWalkCount >= 3 ? -2 : 1; }

    if (percentB > 0.75) score += upperWalkCount >= 3 ? 2 : -1;
    else if (percentB < 0.25) score += lowerWalkCount >= 3 ? -2 : 1;
    else if (percentB > 0.5) score += 1;
    else score -= 1;

    // ミドルラインクロス
    if (prevPrice < current.middle && currentPrice > current.middle) score += 2;
    else if (prevPrice > current.middle && currentPrice < current.middle) score -= 2;

    if (isExpanding && !wasSqueezing) score = score > 0 ? score + 1 : score - 1;

    return { id: 'BB', abbr: 'BB', signal: this.getFilteredSignal(score) };
  }

  // 3. MACD
  analyzeMACD() {
    const macd = this.calculateMACDArray();
    if (macd.length < 10) return { id: 'MAC', abbr: 'MAC', signal: 'NEUTRAL' };

    const current = macd[macd.length - 1];
    const prev = macd[macd.length - 2];
    const prev2 = macd[macd.length - 3];
    const prev3 = macd[macd.length - 4];
    const prev4 = macd[macd.length - 5];
    let score = 0;

    // MACDラインとシグナルラインのクロス
    if (prev.macd < prev.signal && current.macd > current.signal) score += 3;
    else if (prev.macd > prev.signal && current.macd < current.signal) score -= 3;

    // ゼロライン距離
    const macdAbsValue = Math.abs(current.macd);
    const avgMacdAbs = macd.slice(-20).reduce((a, b) => a + Math.abs(b.macd), 0) / 20;
    if (current.macd > 0) { score += 1; if (macdAbsValue > avgMacdAbs * 1.5) score -= 1; }
    else { score -= 1; if (macdAbsValue > avgMacdAbs * 1.5) score += 1; }

    // ゼロラインクロス
    if (prev.macd < 0 && current.macd > 0) score += 2;
    else if (prev.macd > 0 && current.macd < 0) score -= 2;

    // ヒストグラム反転パターン
    const hist = [prev4.histogram, prev3.histogram, prev2.histogram, prev.histogram, current.histogram];
    if (hist[0] > 0 && hist[1] > 0 && hist[2] > 0 && hist[3] > 0 && hist[4] > 0) {
      const shrinking = hist[0] > hist[1] && hist[1] > hist[2] && hist[2] > hist[3];
      if (shrinking && hist[4] > hist[3]) score += 1;
      else if (shrinking) score -= 1;
    }
    if (hist[0] < 0 && hist[1] < 0 && hist[2] < 0 && hist[3] < 0 && hist[4] < 0) {
      const shrinking = hist[0] < hist[1] && hist[1] < hist[2] && hist[2] < hist[3];
      if (shrinking && hist[4] < hist[3]) score -= 1;
      else if (shrinking) score += 1;
    }

    // MACD-シグナル乖離幅
    const gap = current.macd - current.signal;
    const prevGap = prev.macd - prev.signal;
    const gapExpanding = Math.abs(gap) > Math.abs(prevGap);
    if (gap > 0 && gapExpanding) score += 1;
    else if (gap < 0 && gapExpanding) score -= 1;

    // クロス予測
    const gapTrend = gap - prevGap;
    const isConverging = (gap > 0 && gapTrend < 0) || (gap < 0 && gapTrend > 0);
    if (isConverging && Math.abs(gap) < Math.abs(prevGap) * 0.5) {
      score += gap > 0 ? -1 : 1;
    }

    // ヒストグラムの傾斜
    if (current.histogram > prev.histogram && prev.histogram > prev3.histogram) score += 1;
    else if (current.histogram < prev.histogram && prev.histogram < prev3.histogram) score -= 1;

    // ダイバージェンス
    const prices = this.candles.slice(-15).map(c => c.close);
    const macdValues = macd.slice(-15).map(m => m.macd);
    const priceHigh = Math.max(...prices);
    const priceLow = Math.min(...prices);
    const macdHigh = Math.max(...macdValues);
    const macdLow = Math.min(...macdValues);
    const priceAtEnd = prices[prices.length - 1];
    const macdAtEnd = macdValues[macdValues.length - 1];

    if (priceAtEnd >= priceHigh * 0.99 && macdAtEnd < macdHigh * 0.9) score -= 2;
    if (priceAtEnd <= priceLow * 1.01 && macdAtEnd > macdLow * 1.1) score += 2;

    return { id: 'MAC', abbr: 'MAC', signal: this.getFilteredSignal(score) };
  }

  // 4. RSI
  analyzeRSI() {
    const rsiArray = this.calculateRSIArray(14);
    if (rsiArray.length < 15) return { id: 'RSI', abbr: 'RSI', signal: 'NEUTRAL' };

    const currentRSI = rsiArray[rsiArray.length - 1];
    const prevRSI = rsiArray[rsiArray.length - 2];
    const prev2RSI = rsiArray[rsiArray.length - 3];
    let score = 0;

    const rsiMomentum = currentRSI - prevRSI;
    const prevMomentum = prevRSI - prev2RSI;
    const isAccelerating = Math.abs(rsiMomentum) > Math.abs(prevMomentum);
    const rsiMA5 = rsiArray.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const rsiMA10 = rsiArray.slice(-10).reduce((a, b) => a + b, 0) / 10;

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentRSI < 50) score -= 2;
      if (currentRSI < 30) score -= 2;
      if (currentRSI < prevRSI) score -= 1;
      if (rsiMA5 < rsiMA10) score -= 1;
      return { id: 'RSI', abbr: 'RSI', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentRSI > 50) score += 2;
      if (currentRSI > 70) score += 2;
      if (currentRSI > prevRSI) score += 1;
      if (rsiMA5 > rsiMA10) score += 1;
      return { id: 'RSI', abbr: 'RSI', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // 中央ゾーン回避
    if (currentRSI >= 40 && currentRSI <= 60) score = Math.round(score * 0.5);
    else if (currentRSI > 50) score += 1;
    else score -= 1;

    // ゾーン滞在時間
    let overboughtCount = 0, oversoldCount = 0;
    for (let i = 0; i < 10; i++) {
      if (rsiArray[rsiArray.length - 1 - i] > 70) overboughtCount++;
      if (rsiArray[rsiArray.length - 1 - i] < 30) oversoldCount++;
    }

    if (currentRSI > 70) {
      if (overboughtCount >= 5) score += currentRSI < prevRSI ? -3 : -1;
      else score += (currentRSI > prevRSI && isAccelerating) ? 1 : -1;
    } else if (currentRSI < 30) {
      if (oversoldCount >= 5) score += currentRSI > prevRSI ? 3 : 1;
      else score += (currentRSI < prevRSI && isAccelerating) ? -1 : 1;
    }

    // RSI MA
    if (rsiMA5 > rsiMA10 && currentRSI > rsiMA5) score += 1;
    else if (rsiMA5 < rsiMA10 && currentRSI < rsiMA5) score -= 1;

    // RSI傾き
    if (rsiMomentum > 3 && isAccelerating) score += 1;
    else if (rsiMomentum < -3 && isAccelerating) score -= 1;

    // ダイバージェンス
    const prices = this.candles.slice(-15).map(c => c.close);
    const rsiSlice = rsiArray.slice(-15);
    const priceAtEnd = prices[prices.length - 1];
    const rsiAtEnd = rsiSlice[rsiSlice.length - 1];
    if (priceAtEnd >= Math.max(...prices) * 0.995 && rsiAtEnd < Math.max(...rsiSlice) - 5) score -= 2;
    if (priceAtEnd <= Math.min(...prices) * 1.005 && rsiAtEnd > Math.min(...rsiSlice) + 5) score += 2;

    // 隠れダイバージェンス
    if (priceAtEnd > prices[0] && rsiAtEnd < rsiSlice[0] && currentRSI > 40) score += 1;
    if (priceAtEnd < prices[0] && rsiAtEnd > rsiSlice[0] && currentRSI < 60) score -= 1;

    return { id: 'RSI', abbr: 'RSI', signal: this.getFilteredSignal(score) };
  }

  // 5. Stochastic
  analyzeSTO() {
    const sto = this.calculateStochastic(14, 3, 3);
    if (!sto || sto.length < 10) return { id: 'STO', abbr: 'STO', signal: 'NEUTRAL' };

    const current = sto[sto.length - 1];
    const prev = sto[sto.length - 2];
    const prev2 = sto[sto.length - 3];
    const prev3 = sto[sto.length - 4];
    const prev4 = sto[sto.length - 5];
    let score = 0;

    const kMomentum = current.k - prev.k;
    const prevKMomentum = prev.k - prev2.k;
    const isAccelerating = Math.sign(kMomentum) === Math.sign(prevKMomentum) && Math.abs(kMomentum) > Math.abs(prevKMomentum);
    const isDecelerating = Math.sign(kMomentum) === Math.sign(prevKMomentum) && Math.abs(kMomentum) < Math.abs(prevKMomentum);
    const kdGap = current.k - current.d;
    const prevKdGap = prev.k - prev.d;
    const gapExpanding = Math.abs(kdGap) > Math.abs(prevKdGap);

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (current.k < 50) score -= 2;
      if (current.k < 20) score -= 2;
      if (current.k < prev.k) score -= 1;
      if (kdGap < 0 && gapExpanding) score -= 1;
      return { id: 'STO', abbr: 'STO', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (current.k > 50) score += 2;
      if (current.k > 80) score += 2;
      if (current.k > prev.k) score += 1;
      if (kdGap > 0 && gapExpanding) score += 1;
      return { id: 'STO', abbr: 'STO', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // ゾーン滞在時間
    let overboughtCount = 0, oversoldCount = 0;
    for (let i = 0; i < 8; i++) { if (sto[sto.length - 1 - i].k > 80) overboughtCount++; if (sto[sto.length - 1 - i].k < 20) oversoldCount++; }

    // ダブルボトム/トップ
    const recentKs = [prev4.k, prev3.k, prev2.k, prev.k, current.k];
    if (recentKs[0] < 30 && recentKs[2] < 30 && recentKs[1] > recentKs[0] && recentKs[1] > recentKs[2] && current.k > prev.k) score += 3;
    if (recentKs[0] > 70 && recentKs[2] > 70 && recentKs[1] < recentKs[0] && recentKs[1] < recentKs[2] && current.k < prev.k) score -= 3;

    // フック検出
    if (prev.k < prev.d && prev.k < 25 && current.k > prev.k && kMomentum > 2) score += 2;
    if (prev.k > prev.d && prev.k > 75 && current.k < prev.k && kMomentum < -2) score -= 2;

    // クロス
    if (prev.k < prev.d && current.k > current.d) { score += 2; if (current.k < 30) score += 1; }
    else if (prev.k > prev.d && current.k < current.d) { score -= 2; if (current.k > 70) score -= 1; }

    // ゾーン分析
    if (current.k > 80) { score += (overboughtCount >= 4 && current.k < prev.k && isDecelerating) ? -3 : (overboughtCount >= 4 ? -1 : ((current.k > prev.k && isAccelerating) ? 1 : -1)); }
    else if (current.k < 20) { score += (oversoldCount >= 4 && current.k > prev.k && isDecelerating) ? 3 : (oversoldCount >= 4 ? 1 : ((current.k < prev.k && isAccelerating) ? -1 : 1)); }
    else if (current.k > 50) score += 1;
    else score -= 1;

    // %K-%D乖離
    if (kdGap > 10 && gapExpanding) score += 1;
    else if (kdGap < -10 && gapExpanding) score -= 1;

    if (kMomentum > 0) { score += 1; if (isAccelerating && kMomentum > 5) score += 1; }
    else { score -= 1; if (isAccelerating && kMomentum < -5) score -= 1; }

    return { id: 'STO', abbr: 'STO', signal: this.getFilteredSignal(score) };
  }

  // 6. Ichimoku
  analyzeICH() {
    const ichimoku = this.calculateIchimoku();
    if (!ichimoku) return { id: 'ICH', abbr: 'ICH', signal: 'NEUTRAL' };

    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    let score = 0;

    const cloudTop = Math.max(ichimoku.senkouA, ichimoku.senkouB);
    const cloudBottom = Math.min(ichimoku.senkouA, ichimoku.senkouB);
    const cloudThickness = cloudTop - cloudBottom;

    const tenkanAboveKijun = ichimoku.tenkan > ichimoku.kijun;
    const priceAboveCloud = currentPrice > cloudTop;
    const priceBelowCloud = currentPrice < cloudBottom;
    const chikouAbovePrice = ichimoku.chikou > currentPrice;
    const chikouBelowPrice = ichimoku.chikou < currentPrice;

    // 三役好転/三役逆転
    if (tenkanAboveKijun && priceAboveCloud && chikouAbovePrice) score += 4;
    else if (!tenkanAboveKijun && priceBelowCloud && chikouBelowPrice) score -= 4;
    else {
      if (tenkanAboveKijun) score += 2; else score -= 2;
      if (priceAboveCloud) score += 2; else if (priceBelowCloud) score -= 2;
      if (chikouAbovePrice) score += 1; else if (chikouBelowPrice) score -= 1;
    }

    // 雲の厚さ
    const cloudThicknessRatio = cloudThickness / currentPrice * 100;
    if (cloudThicknessRatio > 0.3) { if (priceAboveCloud) score += 1; else if (priceBelowCloud) score -= 1; }
    else if (cloudThicknessRatio < 0.1) score = Math.round(score * 0.8);

    // 雲の色
    if (ichimoku.senkouA > ichimoku.senkouB) score += 1; else score -= 1;

    // 転換線-基準線の乖離
    const tkGapRatio = Math.abs(ichimoku.tenkan - ichimoku.kijun) / ichimoku.kijun * 100;
    if (tkGapRatio > 0.1) score = score > 0 ? score + 1 : score - 1;
    else if (tkGapRatio < 0.02) score = Math.round(score * 0.7);

    // 雲との距離
    if (priceAboveCloud && (currentPrice - cloudTop) / currentPrice * 100 > 0.5) score -= 1;
    else if (priceBelowCloud && (cloudBottom - currentPrice) / currentPrice * 100 > 0.5) score += 1;

    // 雲突入/突破
    const wasAboveCloud = prevPrice > cloudTop;
    const wasBelowCloud = prevPrice < cloudBottom;
    const wasInCloud = prevPrice >= cloudBottom && prevPrice <= cloudTop;
    if (wasBelowCloud && priceAboveCloud) score += 2;
    else if (wasInCloud && priceAboveCloud) score += 1;
    if (wasAboveCloud && priceBelowCloud) score -= 2;
    else if (wasInCloud && priceBelowCloud) score -= 1;

    return { id: 'ICH', abbr: 'ICH', signal: this.getFilteredSignal(score) };
  }

  // 7. ATR
  analyzeATR() {
    const atr = this.calculateATRArray(14);
    if (atr.length < 15) return { id: 'ATR', abbr: 'ATR', signal: 'NEUTRAL' };

    const currentATR = atr[atr.length - 1];
    const prevATR = atr[atr.length - 2];
    const prev3ATR = atr[atr.length - 4];
    const prev5ATR = atr[atr.length - 6];
    const avgATR20 = atr.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, atr.length);

    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    const prev5Price = this.candles[this.candles.length - 6].close;
    const priceDirection = currentPrice > prev5Price ? 1 : -1;
    const priceChange = Math.abs(currentPrice - prevPrice);
    let score = 0;

    const atrRatio = currentATR / avgATR20;
    const isSqueezing = atrRatio < 0.7;
    const isExpanding = atrRatio > 1.3;

    if (isSqueezing) score = Math.round(priceDirection * 0.5);

    if (isExpanding) {
      score = priceDirection * 3;
      if (currentATR > prevATR && prevATR > prev3ATR) score = score > 0 ? score + 1 : score - 1;
    }

    const atrChangeRate = (currentATR - prev5ATR) / prev5ATR;
    if (!isSqueezing && !isExpanding) {
      if (atrChangeRate > 0.2) score = priceDirection * 2;
      else score = priceDirection * 1;
    }

    const priceToATR = priceChange / currentATR;
    if (priceToATR > 1.5) score = score > 0 ? score + 2 : score - 2;
    else if (priceToATR > 1.0) score = score > 0 ? score + 1 : score - 1;
    else if (priceToATR < 0.3) score = Math.round(score * 0.7);

    const atrSlope = (currentATR - prev3ATR) / prev3ATR;
    if (atrSlope > 0.1 && score !== 0) score = score > 0 ? score + 1 : score - 1;
    else if (atrSlope < -0.15 && Math.abs(score) > 1) score = Math.round(score * 0.8);

    // スクイーズからのブレイクアウト
    const prev3Ratio = prev3ATR / avgATR20;
    if (prev3Ratio < 0.75 && currentATR > prev3ATR * 1.2) score = priceDirection * 4;

    return { id: 'ATR', abbr: 'ATR', signal: this.getFilteredSignal(score) };
  }

  // 8. ADX（v5.10.6: パラメータ対応）
  analyzeADX() {
    const adxData = this.calculateADXFullExtended(this.params.adx);
    if (!adxData || !adxData.history || adxData.history.length < 5) return { id: 'ADX', abbr: 'ADX', signal: 'NEUTRAL' };

    const hist = adxData.history;
    const currentADX = adxData.adx;
    const prevADX = hist[hist.length - 2].adx;
    const prev3ADX = hist[hist.length - 4].adx;
    let score = 0;

    const diGap = adxData.plusDI - adxData.minusDI;
    score += diGap > 0 ? 2 : -2;

    // DIクロス
    const prevPlusDI = hist[hist.length - 2].plusDI;
    const prevMinusDI = hist[hist.length - 2].minusDI;
    const prev2PlusDI = hist[hist.length - 3].plusDI;
    const prev2MinusDI = hist[hist.length - 3].minusDI;

    if (prevPlusDI < prevMinusDI && adxData.plusDI > adxData.minusDI) { score += 3; if (currentADX > 20) score += 1; }
    else if (prevPlusDI > prevMinusDI && adxData.plusDI < adxData.minusDI) { score -= 3; if (currentADX > 20) score -= 1; }

    if (prev2PlusDI < prev2MinusDI && prevPlusDI > prevMinusDI && adxData.plusDI > adxData.minusDI) score += 1;
    else if (prev2PlusDI > prev2MinusDI && prevPlusDI < prevMinusDI && adxData.plusDI < adxData.minusDI) score -= 1;

    // ADX値
    if (currentADX > 40) score = score > 0 ? score + 3 : score - 3;
    else if (currentADX > 30) score = score > 0 ? score + 2 : score - 2;
    else if (currentADX > 25) score = score > 0 ? score + 1 : score - 1;
    else if (currentADX < 20) score = Math.round(score * 0.5);

    // ADXピーク検出
    if (prevADX > prev3ADX && prevADX > currentADX && prevADX > 30) score = Math.round(score * 0.7);
    if (prevADX < prev3ADX && prevADX < currentADX && prevADX < 20) score = score > 0 ? score + 1 : score - 1;

    // ADX傾き
    const adxSlope = currentADX - prevADX;
    if (adxSlope > 0 && (prevADX - prev3ADX) > 0) score = score > 0 ? score + 1 : score - 1;
    else if (adxSlope < 0 && currentADX > 25) score = Math.round(score * 0.85);

    // DI乖離率
    const diGapRatio = Math.abs(diGap) / (adxData.plusDI + adxData.minusDI) * 100;
    if (diGapRatio > 30 && currentADX > 25) score = score > 0 ? score + 1 : score - 1;
    else if (diGapRatio < 10) score = Math.round(score * 0.6);

    // トレンド成熟度
    let highADXCount = 0;
    for (let i = 1; i <= 5 && i < hist.length; i++) { if (hist[hist.length - i].adx > 25) highADXCount++; }
    if (highADXCount >= 4 && adxSlope < 0) score = Math.round(score * 0.75);

    return { id: 'ADX', abbr: 'ADX', signal: this.getFilteredSignal(score) };
  }

  // 9. Parabolic SAR
  analyzeSAR() {
    const sar = this.calculateParabolicSARExtended();
    if (sar.length < 15) return { id: 'SAR', abbr: 'SAR', signal: 'NEUTRAL' };

    const currentPrice = this.candles[this.candles.length - 1].close;
    const currentSAR = sar[sar.length - 1];
    const prevSAR = sar[sar.length - 2];
    let score = 0;

    const isUptrend = currentPrice > currentSAR.value;
    score += isUptrend ? 2 : -2;

    // SAR距離
    const sarDistance = Math.abs(currentPrice - currentSAR.value) / currentPrice * 100;
    const prevSarDistance = Math.abs(this.candles[this.candles.length - 2].close - prevSAR.value) / this.candles[this.candles.length - 2].close * 100;
    if (sarDistance < prevSarDistance * 0.7) score = Math.round(score * 0.7);
    else if (sarDistance > prevSarDistance * 1.2) score = score > 0 ? score + 1 : score - 1;

    // トレンド継続期間
    let trendLength = 0;
    const currentTrend = currentSAR.trend;
    for (let i = sar.length - 1; i >= 0; i--) { if (sar[i].trend === currentTrend) trendLength++; else break; }

    if (trendLength >= 10) score = Math.round(score * 0.8);
    else if (trendLength >= 5) score = score > 0 ? score + 2 : score - 2;
    else if (trendLength >= 3) score = score > 0 ? score + 1 : score - 1;
    else if (trendLength <= 2) score = Math.round(score * 0.6);

    // 反転頻度
    let recentReversals = 0;
    for (let i = sar.length - 10; i < sar.length - 1; i++) { if (sar[i].trend !== sar[i + 1].trend) recentReversals++; }
    if (recentReversals >= 3) score = Math.round(score * 0.4);
    else if (recentReversals === 0 && trendLength >= 5) score = score > 0 ? score + 1 : score - 1;

    // SAR加速
    const sarMovement = Math.abs(currentSAR.value - prevSAR.value);
    const prevSarMovement = sar.length > 2 ? Math.abs(prevSAR.value - sar[sar.length - 3].value) : sarMovement;
    if (sarMovement > prevSarMovement * 1.3) score = score > 0 ? score + 1 : score - 1;
    else if (sarMovement < prevSarMovement * 0.7 && trendLength > 5) score = Math.round(score * 0.8);

    // 直近反転
    if (trendLength === 1) {
      let prevTrendLength = 0;
      for (let i = sar.length - 2; i >= 0; i--) { if (sar[i].trend !== currentTrend) prevTrendLength++; else break; }
      if (prevTrendLength >= 5) score = score > 0 ? score + 2 : score - 2;
      else if (prevTrendLength <= 2) score = Math.round(score * 0.5);
    }

    return { id: 'SAR', abbr: 'SAR', signal: this.getFilteredSignal(score) };
  }

  // 10. Envelopes
  analyzeENV() {
    const atr = this.calculateATRArray(14);
    let envPercentage = 0.1;
    if (atr.length > 0) {
      const currentATR = atr[atr.length - 1];
      const avgPrice = this.candles.slice(-20).reduce((a, c) => a + c.close, 0) / 20;
      envPercentage = Math.max(0.05, Math.min(0.3, (currentATR / avgPrice) * 100 * 0.5));
    }

    const env = this.calculateEnvelopes(20, envPercentage);
    if (!env) return { id: 'ENV', abbr: 'ENV', signal: 'NEUTRAL' };

    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    let score = 0;

    const position = (currentPrice - env.lower) / (env.upper - env.lower);

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (position < 0.5) score -= 2; if (position < 0.2) score -= 2; if (currentPrice < env.middle) score -= 1;
      return { id: 'ENV', abbr: 'ENV', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (position > 0.5) score += 2; if (position > 0.8) score += 2; if (currentPrice > env.middle) score += 1;
      return { id: 'ENV', abbr: 'ENV', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // バンドタッチ・突破
    let upperBreakCount = 0, lowerBreakCount = 0, upperTouchCount = 0, lowerTouchCount = 0;
    for (let i = 0; i < 10 && i < this.candles.length; i++) {
      const candle = this.candles[this.candles.length - 1 - i];
      const candlePos = (candle.close - env.lower) / (env.upper - env.lower);
      if (candlePos >= 0.95) upperTouchCount++;
      if (candlePos <= 0.05) lowerTouchCount++;
      if (candle.high > env.upper) upperBreakCount++;
      if (candle.low < env.lower) lowerBreakCount++;
    }

    if (upperBreakCount >= 3) score += 2;
    else if (upperTouchCount >= 3 && upperBreakCount < 2) score -= 1;
    if (lowerBreakCount >= 3) score -= 2;
    else if (lowerTouchCount >= 3 && lowerBreakCount < 2) score += 1;

    // 中央線クロス
    if (prevPrice < env.middle && currentPrice > env.middle) score += 2;
    else if (prevPrice > env.middle && currentPrice < env.middle) score -= 2;

    // 位置
    if (position > 0.9) score += upperBreakCount >= 2 ? 1 : -1;
    else if (position < 0.1) score += lowerBreakCount >= 2 ? -1 : 1;
    else if (position > 0.5) score += 1;
    else score -= 1;

    return { id: 'ENV', abbr: 'ENV', signal: this.getFilteredSignal(score) };
  }

  // 11. SDV
  analyzeSDV() {
    const sdv = this.calculateStdDevArray(20);
    if (sdv.length < 10) return { id: 'SDV', abbr: 'SDV', signal: 'NEUTRAL' };

    const currentSDV = sdv[sdv.length - 1];
    const avgSDV = sdv.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const prevSDV = sdv[sdv.length - 5];
    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 5].close;
    const priceDirection = currentPrice > prevPrice ? 1 : -1;
    let score = 0;

    if (currentSDV > avgSDV * 1.5) score = priceDirection * 3;
    else if (currentSDV > prevSDV) score = priceDirection * 1;
    else score = priceDirection * 1;

    return { id: 'SDV', abbr: 'SDV', signal: this.getFilteredSignal(score) };
  }

  // 12. CCI
  analyzeCCI() {
    const cci = this.calculateCCIArray(20);
    if (cci.length < 10) return { id: 'CCI', abbr: 'CCI', signal: 'NEUTRAL' };

    const currentCCI = cci[cci.length - 1];
    const prevCCI = cci[cci.length - 2];
    const prev2CCI = cci[cci.length - 3];
    const prev3CCI = cci[cci.length - 4];
    let score = 0;

    const cciMomentum = currentCCI - prevCCI;
    const prevMomentum = prevCCI - prev2CCI;
    const isAccelerating = Math.abs(cciMomentum) > Math.abs(prevMomentum);

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentCCI < 0) score -= 2; if (currentCCI < -100) score -= 2; if (currentCCI < prevCCI) score -= 1;
      if (isAccelerating && cciMomentum < 0) score -= 1;
      return { id: 'CCI', abbr: 'CCI', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentCCI > 0) score += 2; if (currentCCI > 100) score += 2; if (currentCCI > prevCCI) score += 1;
      if (isAccelerating && cciMomentum > 0) score += 1;
      return { id: 'CCI', abbr: 'CCI', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // ゼロラインクロス
    if (prevCCI < 0 && currentCCI > 0) score += 2;
    else if (prevCCI > 0 && currentCCI < 0) score -= 2;

    // ±200極端ゾーン
    if (currentCCI > 200) score += (currentCCI > prevCCI && isAccelerating) ? 1 : (currentCCI < prevCCI ? -2 : 0);
    else if (currentCCI < -200) score += (currentCCI < prevCCI && isAccelerating) ? -1 : (currentCCI > prevCCI ? 2 : 0);
    else if (currentCCI > 100) score += currentCCI > prevCCI ? 2 : -1;
    else if (currentCCI < -100) score += currentCCI < prevCCI ? -2 : 1;
    else if (currentCCI > 0) score += 1;
    else score -= 1;

    // ゾーン滞在時間
    let overBoughtCount = 0, overSoldCount = 0;
    for (let i = 1; i <= 5; i++) { if (cci[cci.length - i] > 100) overBoughtCount++; if (cci[cci.length - i] < -100) overSoldCount++; }
    if (overBoughtCount >= 4 && currentCCI < prevCCI) score -= 2;
    else if (overSoldCount >= 4 && currentCCI > prevCCI) score += 2;

    // ゼロライン振動
    let zeroLineCrosses = 0;
    for (let i = 1; i < 5; i++) { if ((cci[cci.length - i] > 0 && cci[cci.length - i - 1] < 0) || (cci[cci.length - i] < 0 && cci[cci.length - i - 1] > 0)) zeroLineCrosses++; }
    if (zeroLineCrosses >= 2) score = Math.round(score * 0.5);

    // トレンドライン + 加速
    if (currentCCI > prevCCI && prevCCI > prev3CCI) { score += 1; if (isAccelerating) score += 1; }
    else if (currentCCI < prevCCI && prevCCI < prev3CCI) { score -= 1; if (isAccelerating) score -= 1; }

    return { id: 'CCI', abbr: 'CCI', signal: this.getFilteredSignal(score) };
  }

  // 13. Momentum
  analyzeMOM() {
    const mom = this.calculateMomentumArray(10);
    if (mom.length < 10) return { id: 'MOM', abbr: 'MOM', signal: 'NEUTRAL' };

    const currentMom = mom[mom.length - 1];
    const prevMom = mom[mom.length - 2];
    const prev2Mom = mom[mom.length - 3];
    const prev3Mom = mom[mom.length - 4];
    const prev5Mom = mom[mom.length - 6];
    let score = 0;

    const momVelocity = currentMom - prevMom;
    const prevVelocity = prevMom - prev2Mom;
    const isAccelerating = Math.abs(momVelocity) > Math.abs(prevVelocity);

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentMom < 0) score -= 2; if (currentMom < prevMom) score -= 2;
      if (isAccelerating && momVelocity < 0) score -= 1;
      return { id: 'MOM', abbr: 'MOM', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentMom > 0) score += 2; if (currentMom > prevMom) score += 2;
      if (isAccelerating && momVelocity > 0) score += 1;
      return { id: 'MOM', abbr: 'MOM', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    if (currentMom > 0) score += 2; else score -= 2;

    // ゼロラインクロス
    if (prevMom < 0 && currentMom > 0) { score += 2; if (prev2Mom < 0) score += 1; }
    else if (prevMom > 0 && currentMom < 0) { score -= 2; if (prev2Mom > 0) score -= 1; }

    // 加速/減速
    if (currentMom > 0) {
      if (currentMom > prevMom) { score += 2; if (isAccelerating) score += 1; }
      else { score -= 1; if (isAccelerating && momVelocity < 0) score -= 1; }
    } else {
      if (currentMom < prevMom) { score -= 2; if (isAccelerating) score -= 1; }
      else { score += 1; if (isAccelerating && momVelocity > 0) score += 1; }
    }

    // 発散/収束
    const momMA5 = mom.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const momMA10 = mom.slice(-10).reduce((a, b) => a + b, 0) / 10;
    if (momMA5 > momMA10 && currentMom > momMA5) score += 1;
    else if (momMA5 < momMA10 && currentMom < momMA5) score -= 1;
    else if (Math.abs(momMA5 - momMA10) < Math.abs(prev5Mom) * 0.1) score = Math.round(score * 0.7);

    // ピーク/ボトム
    if (prevMom > prev2Mom && prevMom > prev3Mom && prevMom > currentMom && currentMom > 0) score -= 2;
    else if (prevMom < prev2Mom && prevMom < prev3Mom && prevMom < currentMom && currentMom < 0) score += 2;

    return { id: 'MOM', abbr: 'MOM', signal: this.getFilteredSignal(score) };
  }

  // 14. Williams %R
  analyzeWPR() {
    const wpr = this.calculateWilliamsRArray(14);
    if (wpr.length < 10) return { id: 'WPR', abbr: 'WPR', signal: 'NEUTRAL' };

    const currentWPR = wpr[wpr.length - 1];
    const prevWPR = wpr[wpr.length - 2];
    const prev2WPR = wpr[wpr.length - 3];
    let score = 0;

    const wprVelocity = currentWPR - prevWPR;
    const prevVelocity = prevWPR - prev2WPR;
    const isAccelerating = Math.abs(wprVelocity) > Math.abs(prevVelocity);

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentWPR < -50) score -= 2; if (currentWPR < -80) score -= 2; if (currentWPR < prevWPR) score -= 1;
      return { id: 'WPR', abbr: 'WPR', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentWPR > -50) score += 2; if (currentWPR > -20) score += 2; if (currentWPR > prevWPR) score += 1;
      return { id: 'WPR', abbr: 'WPR', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // ゾーン分析
    if (currentWPR > -20) score += currentWPR < prevWPR ? -2 : 1;
    else if (currentWPR < -80) score += currentWPR > prevWPR ? 2 : -1;
    else if (currentWPR > -50) score += 1;
    else score -= 1;

    // ゾーン滞在時間
    let overBoughtCount = 0, overSoldCount = 0;
    for (let i = 1; i <= 5; i++) { if (wpr[wpr.length - i] > -20) overBoughtCount++; if (wpr[wpr.length - i] < -80) overSoldCount++; }
    if (overBoughtCount >= 4 && currentWPR < prevWPR) score -= 2;
    else if (overSoldCount >= 4 && currentWPR > prevWPR) score += 2;

    // -50ラインクロス
    if (prevWPR < -50 && currentWPR > -50) score += 1;
    else if (prevWPR > -50 && currentWPR < -50) score -= 1;

    // 傾き + 加速
    if (currentWPR > prevWPR) { score += 1; if (isAccelerating && wprVelocity > 0) score += 1; }
    else { score -= 1; if (isAccelerating && wprVelocity < 0) score -= 1; }

    return { id: 'WPR', abbr: 'WPR', signal: this.getFilteredSignal(score) };
  }

  // 15. Force Index
  analyzeFRX() {
    const frx = this.calculateForceIndexArray(13);
    if (frx.length < 5) return { id: 'FRX', abbr: 'FRX', signal: 'NEUTRAL' };

    const currentFRX = frx[frx.length - 1];
    const prevFRX = frx[frx.length - 2];
    let score = 0;

    if (currentFRX > 0) score += 2; else score -= 2;
    if (currentFRX > prevFRX) score += 1; else score -= 1;

    const avgFRX = frx.slice(-10).reduce((a, b) => a + Math.abs(b), 0) / 10;
    if (Math.abs(currentFRX) > avgFRX * 1.5) score = score > 0 ? score + 1 : score - 1;

    return { id: 'FRX', abbr: 'FRX', signal: this.getFilteredSignal(score) };
  }

  // 16. DeMarker
  analyzeDEM() {
    const dem = this.calculateDeMarkerArray(14);
    if (dem.length < 10) return { id: 'DEM', abbr: 'DEM', signal: 'NEUTRAL' };

    const currentDEM = dem[dem.length - 1];
    const prevDEM = dem[dem.length - 2];
    const prev2DEM = dem[dem.length - 3];
    const prev3DEM = dem[dem.length - 4];
    let score = 0;

    const demVelocity = currentDEM - prevDEM;
    const prevVelocity = prevDEM - prev2DEM;
    const isAccelerating = Math.abs(demVelocity) > Math.abs(prevVelocity);

    // 強トレンドモード
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentDEM < 0.5) score -= 2; if (currentDEM < 0.3) score -= 2; if (currentDEM < prevDEM) score -= 1;
      return { id: 'DEM', abbr: 'DEM', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentDEM > 0.5) score += 2; if (currentDEM > 0.7) score += 2; if (currentDEM > prevDEM) score += 1;
      return { id: 'DEM', abbr: 'DEM', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    if (currentDEM > 0.5) score += 1; else score -= 1;

    // 0.5ラインクロス
    if (prevDEM < 0.5 && currentDEM > 0.5) { score += 2; if (prev2DEM < 0.5) score += 1; }
    else if (prevDEM > 0.5 && currentDEM < 0.5) { score -= 2; if (prev2DEM > 0.5) score -= 1; }

    // 極端ゾーン
    let highZoneCount = 0, lowZoneCount = 0;
    for (let i = 1; i <= 5; i++) { if (dem[dem.length - i] > 0.7) highZoneCount++; if (dem[dem.length - i] < 0.3) lowZoneCount++; }

    if (currentDEM > 0.7) { if (highZoneCount >= 3 && currentDEM < prevDEM) score -= 3; else score += currentDEM < prevDEM ? -2 : 1; }
    else if (currentDEM < 0.3) { if (lowZoneCount >= 3 && currentDEM > prevDEM) score += 3; else score += currentDEM > prevDEM ? 2 : -1; }

    // ピーク/ボトム
    if (prevDEM > prev2DEM && prevDEM > prev3DEM && prevDEM > currentDEM && prevDEM > 0.6) score -= 2;
    else if (prevDEM < prev2DEM && prevDEM < prev3DEM && prevDEM < currentDEM && prevDEM < 0.4) score += 2;

    // 傾き + 加速
    if (currentDEM > prevDEM) { score += 1; if (isAccelerating && demVelocity > 0) score += 1; }
    else { score -= 1; if (isAccelerating && demVelocity < 0) score -= 1; }

    // DEM MA平滑化
    const demMA5 = dem.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const demMA10 = dem.slice(-10).reduce((a, b) => a + b, 0) / 10;
    if (demMA5 > demMA10 && currentDEM > demMA5) score += 1;
    else if (demMA5 < demMA10 && currentDEM < demMA5) score -= 1;

    return { id: 'DEM', abbr: 'DEM', signal: this.getFilteredSignal(score) };
  }

  // 17. Alligator
  analyzeALG() {
    const alligator = this.calculateAlligatorExtended();
    if (!alligator || alligator.history.length < 5) return { id: 'ALG', abbr: 'ALG', signal: 'NEUTRAL' };

    const currentPrice = this.candles[this.candles.length - 1].close;
    let score = 0;

    // 3線の並び順
    if (alligator.lips > alligator.teeth && alligator.teeth > alligator.jaw) score += 3;
    else if (alligator.lips < alligator.teeth && alligator.teeth < alligator.jaw) score -= 3;
    else if (alligator.lips > alligator.teeth) score += 1;
    else if (alligator.lips < alligator.teeth) score -= 1;

    // スリープ/覚醒
    const spread = Math.abs(alligator.lips - alligator.jaw) / alligator.jaw * 100;
    const spreadTeethLips = Math.abs(alligator.lips - alligator.teeth) / alligator.teeth * 100;
    const spreadTeethJaw = Math.abs(alligator.teeth - alligator.jaw) / alligator.jaw * 100;

    const hist = alligator.history;
    const prevSpread = Math.abs(hist[hist.length - 2].lips - hist[hist.length - 2].jaw) / hist[hist.length - 2].jaw * 100;
    const prev3Spread = Math.abs(hist[hist.length - 4].lips - hist[hist.length - 4].jaw) / hist[hist.length - 4].jaw * 100;

    const isSleeping = spread < 0.02 && spreadTeethLips < 0.01 && spreadTeethJaw < 0.01;
    const isAwakening = spread > prevSpread * 1.3 && prevSpread > prev3Spread;

    if (isSleeping) score = 0;
    else if (isAwakening) score = score > 0 ? score + 2 : score < 0 ? score - 2 : 0;
    else if (spread > 0.15) score = score > 0 ? score + 1 : score - 1;

    // 線の開き速度
    const spreadVelocity = spread - prevSpread;
    if (spreadVelocity > 0 && (prevSpread - prev3Spread) > 0) score = score > 0 ? score + 1 : score < 0 ? score - 1 : 0;
    else if (spreadVelocity < 0 && spread > 0.05) score = Math.round(score * 0.7);

    // 価格と3線の位置関係
    const priceAboveAll = currentPrice > alligator.lips && currentPrice > alligator.teeth && currentPrice > alligator.jaw;
    const priceBelowAll = currentPrice < alligator.lips && currentPrice < alligator.teeth && currentPrice < alligator.jaw;
    if (priceAboveAll && score > 0) score += 1;
    else if (priceBelowAll && score < 0) score -= 1;
    else if (!priceAboveAll && !priceBelowAll) score = Math.round(score * 0.6);

    // 並び順の継続
    let orderConsistency = 0;
    for (let i = 1; i <= 3; i++) {
      const h = hist[hist.length - i];
      if (h.lips > h.teeth && h.teeth > h.jaw) orderConsistency++;
      else if (h.lips < h.teeth && h.teeth < h.jaw) orderConsistency--;
    }
    if (orderConsistency >= 2 && score > 0) score += 1;
    else if (orderConsistency <= -2 && score < 0) score -= 1;
    else if (orderConsistency === 0) score = Math.round(score * 0.7);

    return { id: 'ALG', abbr: 'ALG', signal: this.getFilteredSignal(score) };
  }

  // 18. Fractals
  analyzeFRA() {
    const fractals = this.detectFractals();
    if (!fractals) return { id: 'FRA', abbr: 'FRA', signal: 'NEUTRAL' };

    const currentPrice = this.candles[this.candles.length - 1].close;
    let score = 0;

    if (fractals.lastHigh && currentPrice > fractals.lastHigh) score += 3;
    else if (fractals.lastLow && currentPrice < fractals.lastLow) score -= 3;

    if (fractals.lastHigh && fractals.lastLow) {
      const mid = (fractals.lastHigh + fractals.lastLow) / 2;
      score += currentPrice > mid ? 1 : -1;
    }

    return { id: 'FRA', abbr: 'FRA', signal: this.getFilteredSignal(score) };
  }

  // 19. A/D
  analyzeACD() {
    const acd = this.calculateADLineArray();
    if (acd.length < 10) return { id: 'ACD', abbr: 'ACD', signal: 'NEUTRAL' };

    const currentACD = acd[acd.length - 1];
    const prevACD = acd[acd.length - 5];
    let score = 0;

    if (currentACD > prevACD) score += 2; else score -= 2;

    const prices = this.candles.slice(-10).map(c => c.close);
    const priceTrend = prices[prices.length - 1] - prices[0];
    const acdTrend = currentACD - acd[acd.length - 10];
    if (priceTrend > 0 && acdTrend < 0) score -= 2;
    else if (priceTrend < 0 && acdTrend > 0) score += 2;

    return { id: 'ACD', abbr: 'ACD', signal: this.getFilteredSignal(score) };
  }

  // 20. OBV
  analyzeOBV() {
    const obv = this.calculateOBVArray();
    if (obv.length < 10) return { id: 'OBV', abbr: 'OBV', signal: 'NEUTRAL' };

    const currentOBV = obv[obv.length - 1];
    const prevOBV = obv[obv.length - 5];
    const prev10OBV = obv[obv.length - 10];
    let score = 0;

    if (currentOBV > prevOBV) score += 2; else score -= 2;

    const obvSMA = obv.slice(-10).reduce((a, b) => a + b, 0) / 10;
    if (currentOBV > obvSMA) score += 1; else score -= 1;

    const prices = this.candles.slice(-10).map(c => c.close);
    const priceTrend = prices[prices.length - 1] - prices[0];
    const obvTrend = currentOBV - prev10OBV;
    if (priceTrend > 0 && obvTrend < 0) score -= 2;
    else if (priceTrend < 0 && obvTrend > 0) score += 2;

    return { id: 'OBV', abbr: 'OBV', signal: this.getFilteredSignal(score) };
  }

  // ========================================
  // 計算ヘルパー関数
  // ========================================

  calculateEMAArray(period) {
    if (this.candles.length < period) return [];
    const k = 2 / (period + 1);
    const emaArray = [];
    let ema = this.candles[0].close;
    for (let i = 0; i < this.candles.length; i++) {
      ema = i === 0 ? this.candles[i].close : this.candles[i].close * k + ema * (1 - k);
      if (i >= period - 1) emaArray.push(ema);
    }
    return emaArray;
  }

  calculateSMA(period) {
    if (this.candles.length < period) return null;
    let sum = 0;
    for (let i = this.candles.length - period; i < this.candles.length; i++) sum += this.candles[i].close;
    return sum / period;
  }

  calculateBollingerBandsArray(period, stdDev) {
    if (this.candles.length < period) return [];
    const result = [];
    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      const sma = sum / period;
      const variance = slice.map(c => Math.pow(c.close - sma, 2)).reduce((a, b) => a + b) / period;
      const sd = Math.sqrt(variance);
      result.push({ upper: sma + sd * stdDev, middle: sma, lower: sma - sd * stdDev });
    }
    return result;
  }

  // v5.10.6: パラメータ対応（デフォルト引数はthis.paramsから取得）
  calculateMACDArray(fastPeriod, slowPeriod, signalPeriod) {
    const fast = fastPeriod || this.params.macd[0];
    const slow = slowPeriod || this.params.macd[1];
    const sig = signalPeriod || this.params.macd[2];
    const emaFast = this.calculateEMAArray(fast);
    const emaSlow = this.calculateEMAArray(slow);
    if (emaFast.length < sig || emaSlow.length < sig) return [];
    const macdLine = [];
    const offset = emaFast.length - emaSlow.length;
    for (let i = 0; i < emaSlow.length; i++) macdLine.push(emaFast[i + offset] - emaSlow[i]);
    const signalLine = [];
    const k = 2 / (sig + 1);
    let signal = macdLine[0];
    for (let i = 0; i < macdLine.length; i++) {
      signal = macdLine[i] * k + signal * (1 - k);
      if (i >= sig - 1) signalLine.push(signal);
    }
    const result = [];
    const signalOffset = macdLine.length - signalLine.length;
    for (let i = 0; i < signalLine.length; i++) {
      const macd = macdLine[i + signalOffset];
      result.push({ macd, signal: signalLine[i], histogram: macd - signalLine[i] });
    }
    return result;
  }

  calculateRSIArray(period) {
    if (this.candles.length < period + 1) return [];
    const result = [];
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = this.candles[i].close - this.candles[i - 1].close;
      if (change > 0) gains += change; else losses += Math.abs(change);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period; i < this.candles.length; i++) {
      if (i > period) {
        const change = this.candles[i].close - this.candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
      }
      result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    return result;
  }

  calculateStochastic(kPeriod, kSmooth, dPeriod) {
    if (this.candles.length < kPeriod + kSmooth + dPeriod) return [];
    const rawK = [];
    for (let i = kPeriod - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - kPeriod + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      rawK.push(high === low ? 50 : ((this.candles[i].close - low) / (high - low)) * 100);
    }
    const smoothedK = [];
    for (let i = kSmooth - 1; i < rawK.length; i++) smoothedK.push(rawK.slice(i - kSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / kSmooth);
    const result = [];
    for (let i = dPeriod - 1; i < smoothedK.length; i++) result.push({ k: smoothedK[i], d: smoothedK.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / dPeriod });
    return result;
  }

  // v5.10.6: パラメータ対応
  calculateIchimoku() {
    const [tenkanPeriod, kijunPeriod, senkouPeriod] = this.params.ich;
    if (this.candles.length < senkouPeriod) return null;
    const calcMidpoint = (period, endIndex) => {
      const slice = this.candles.slice(endIndex - period, endIndex);
      return (Math.max(...slice.map(c => c.high)) + Math.min(...slice.map(c => c.low))) / 2;
    };
    const lastIndex = this.candles.length;
    return {
      tenkan: calcMidpoint(tenkanPeriod, lastIndex),
      kijun: calcMidpoint(kijunPeriod, lastIndex),
      senkouA: (calcMidpoint(tenkanPeriod, lastIndex) + calcMidpoint(kijunPeriod, lastIndex)) / 2,
      senkouB: calcMidpoint(senkouPeriod, lastIndex),
      chikou: this.candles[lastIndex - kijunPeriod] ? this.candles[lastIndex - kijunPeriod].close : this.candles[lastIndex - 1].close
    };
  }

  calculateParabolicSARExtended() {
    if (this.candles.length < 5) return [];
    const result = [];
    let af = 0.02;
    const afMax = 0.2, afStep = 0.02;
    let trend = this.candles[1].close > this.candles[0].close ? 1 : -1;
    let sar = trend === 1 ? this.candles[0].low : this.candles[0].high;
    let ep = trend === 1 ? this.candles[0].high : this.candles[0].low;
    for (let i = 1; i < this.candles.length; i++) {
      const candle = this.candles[i];
      sar = sar + af * (ep - sar);
      let newTrend = trend;
      if (trend === 1 && candle.low < sar) { newTrend = -1; sar = ep; ep = candle.low; af = afStep; }
      else if (trend === -1 && candle.high > sar) { newTrend = 1; sar = ep; ep = candle.high; af = afStep; }
      else {
        if (trend === 1 && candle.high > ep) { ep = candle.high; af = Math.min(af + afStep, afMax); }
        else if (trend === -1 && candle.low < ep) { ep = candle.low; af = Math.min(af + afStep, afMax); }
      }
      trend = newTrend;
      result.push({ value: sar, trend: trend === 1 ? 'up' : 'down', af, ep });
    }
    return result;
  }

  calculateEnvelopes(period, percentage) {
    const sma = this.calculateSMA(period);
    if (!sma) return null;
    const deviation = sma * (percentage / 100);
    return { upper: sma + deviation, middle: sma, lower: sma - deviation };
  }

  calculateAlligatorExtended() {
    if (this.candles.length < 25) return null;
    const smmaAtIndex = (period, shift, endIdx) => {
      const actualEnd = endIdx - shift;
      if (actualEnd < period) return null;
      let sum = 0;
      for (let i = actualEnd - period; i < actualEnd; i++) sum += (this.candles[i].high + this.candles[i].low) / 2;
      return sum / period;
    };
    const history = [];
    const lookback = Math.min(10, this.candles.length - 21);
    for (let i = 0; i < lookback; i++) {
      const idx = this.candles.length - i;
      const jaw = smmaAtIndex(13, 8, idx), teeth = smmaAtIndex(8, 5, idx), lips = smmaAtIndex(5, 3, idx);
      if (jaw !== null && teeth !== null && lips !== null) history.unshift({ jaw, teeth, lips });
    }
    if (history.length < 5) return null;
    const current = history[history.length - 1];
    return { jaw: current.jaw, teeth: current.teeth, lips: current.lips, history };
  }

  calculateCCIArray(period) {
    if (this.candles.length < period) return [];
    const result = [];
    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const tp = slice.map(c => (c.high + c.low + c.close) / 3);
      const smaTP = tp.reduce((a, b) => a + b, 0) / period;
      const meanDev = tp.reduce((acc, val) => acc + Math.abs(val - smaTP), 0) / period;
      const currentTP = (this.candles[i].high + this.candles[i].low + this.candles[i].close) / 3;
      result.push(meanDev === 0 ? 0 : (currentTP - smaTP) / (0.015 * meanDev));
    }
    return result;
  }

  calculateMomentumArray(period) {
    if (this.candles.length < period + 1) return [];
    const result = [];
    for (let i = period; i < this.candles.length; i++) result.push(((this.candles[i].close - this.candles[i - period].close) / this.candles[i - period].close) * 100);
    return result;
  }

  calculateWilliamsRArray(period) {
    if (this.candles.length < period) return [];
    const result = [];
    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      result.push(high === low ? -50 : ((high - this.candles[i].close) / (high - low)) * -100);
    }
    return result;
  }

  calculateDeMarkerArray(period) {
    if (this.candles.length < period + 1) return [];
    const deMax = [], deMin = [];
    for (let i = 1; i < this.candles.length; i++) {
      const highDiff = this.candles[i].high - this.candles[i - 1].high;
      const lowDiff = this.candles[i - 1].low - this.candles[i].low;
      deMax.push(highDiff > 0 ? highDiff : 0);
      deMin.push(lowDiff > 0 ? lowDiff : 0);
    }
    const result = [];
    for (let i = period - 1; i < deMax.length; i++) {
      const sumMax = deMax.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      const sumMin = deMin.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sumMax + sumMin === 0 ? 0.5 : sumMax / (sumMax + sumMin));
    }
    return result;
  }

  calculateATRArray(period) {
    if (this.candles.length < period + 1) return [];
    const trueRanges = [];
    for (let i = 1; i < this.candles.length; i++) {
      trueRanges.push(Math.max(this.candles[i].high - this.candles[i].low, Math.abs(this.candles[i].high - this.candles[i - 1].close), Math.abs(this.candles[i].low - this.candles[i - 1].close)));
    }
    const result = [];
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(atr);
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      result.push(atr);
    }
    return result;
  }

  calculateADXFull(period) {
    if (this.candles.length < period * 2) return null;
    const trueRanges = [], plusDM = [], minusDM = [];
    for (let i = 1; i < this.candles.length; i++) {
      const high = this.candles[i].high, low = this.candles[i].low, prevHigh = this.candles[i - 1].high, prevLow = this.candles[i - 1].low, prevClose = this.candles[i - 1].close;
      trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
      const upMove = high - prevHigh, downMove = prevLow - low;
      if (upMove > downMove && upMove > 0) { plusDM.push(upMove); minusDM.push(0); }
      else if (downMove > upMove && downMove > 0) { plusDM.push(0); minusDM.push(downMove); }
      else { plusDM.push(0); minusDM.push(0); }
    }
    if (trueRanges.length < period) return null;
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b) / period;
    let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b);
    let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b);
    const dxArray = [];
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
      const pDI = (smoothedPlusDM / atr) * 100, mDI = (smoothedMinusDM / atr) * 100;
      dxArray.push({ dx: pDI + mDI !== 0 ? (Math.abs(pDI - mDI) / (pDI + mDI)) * 100 : 0, plusDI: pDI, minusDI: mDI });
    }
    if (dxArray.length < period) return null;
    let adx = dxArray.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    for (let i = period; i < dxArray.length; i++) adx = (adx * (period - 1) + dxArray[i].dx) / period;
    const lastDX = dxArray[dxArray.length - 1];
    return { adx, plusDI: lastDX.plusDI, minusDI: lastDX.minusDI };
  }

  calculateADXFullExtended(period) {
    if (this.candles.length < period * 2 + 10) return null;
    const trueRanges = [], plusDM = [], minusDM = [];
    for (let i = 1; i < this.candles.length; i++) {
      const high = this.candles[i].high, low = this.candles[i].low, prevHigh = this.candles[i - 1].high, prevLow = this.candles[i - 1].low, prevClose = this.candles[i - 1].close;
      trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
      const upMove = high - prevHigh, downMove = prevLow - low;
      if (upMove > downMove && upMove > 0) { plusDM.push(upMove); minusDM.push(0); }
      else if (downMove > upMove && downMove > 0) { plusDM.push(0); minusDM.push(downMove); }
      else { plusDM.push(0); minusDM.push(0); }
    }
    if (trueRanges.length < period) return null;
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b) / period;
    let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b);
    let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b);
    const dxArray = [];
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
      const pDI = (smoothedPlusDM / atr) * 100, mDI = (smoothedMinusDM / atr) * 100;
      dxArray.push({ dx: pDI + mDI !== 0 ? (Math.abs(pDI - mDI) / (pDI + mDI)) * 100 : 0, plusDI: pDI, minusDI: mDI });
    }
    if (dxArray.length < period) return null;
    let adx = dxArray.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    const history = [];
    for (let i = period; i < dxArray.length; i++) {
      adx = (adx * (period - 1) + dxArray[i].dx) / period;
      history.push({ adx, plusDI: dxArray[i].plusDI, minusDI: dxArray[i].minusDI });
    }
    if (history.length < 5) return null;
    const current = history[history.length - 1];
    return { adx: current.adx, plusDI: current.plusDI, minusDI: current.minusDI, history };
  }

  calculateStdDevArray(period) {
    if (this.candles.length < period) return [];
    const result = [];
    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const mean = slice.reduce((acc, c) => acc + c.close, 0) / period;
      result.push(Math.sqrt(slice.map(c => Math.pow(c.close - mean, 2)).reduce((a, b) => a + b) / period));
    }
    return result;
  }

  detectFractals() {
    if (this.candles.length < 5) return null;
    let lastHigh = null, lastLow = null;
    const lookback = Math.min(20, this.candles.length - 4);
    for (let i = this.candles.length - 3; i >= this.candles.length - lookback; i--) {
      const candle = this.candles[i];
      const prev2 = this.candles[i - 2], prev1 = this.candles[i - 1], next1 = this.candles[i + 1], next2 = this.candles[i + 2];
      if (!lastHigh && candle.high > prev2.high && candle.high > prev1.high && candle.high > next1.high && candle.high > next2.high) lastHigh = candle.high;
      if (!lastLow && candle.low < prev2.low && candle.low < prev1.low && candle.low < next1.low && candle.low < next2.low) lastLow = candle.low;
      if (lastHigh && lastLow) break;
    }
    return { lastHigh, lastLow };
  }

  calculateForceIndexArray(period) {
    if (this.candles.length < period + 1) return [];
    const forceIndex = [];
    for (let i = 1; i < this.candles.length; i++) forceIndex.push((this.candles[i].close - this.candles[i - 1].close) * (this.candles[i].volume || 1));
    const result = [];
    const k = 2 / (period + 1);
    let ema = forceIndex[0];
    for (let i = 0; i < forceIndex.length; i++) {
      ema = forceIndex[i] * k + ema * (1 - k);
      if (i >= period - 1) result.push(ema);
    }
    return result;
  }

  calculateADLineArray() {
    if (this.candles.length < 2) return [];
    const result = [];
    let adLine = 0;
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      const clv = c.high === c.low ? 0 : ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low);
      adLine += clv * (c.volume || 1);
      result.push(adLine);
    }
    return result;
  }

  calculateOBVArray() {
    if (this.candles.length < 2) return [];
    const result = [];
    let obv = 0;
    for (let i = 0; i < this.candles.length; i++) {
      if (i === 0) obv = this.candles[i].volume || 0;
      else {
        const volume = this.candles[i].volume || 1;
        if (this.candles[i].close > this.candles[i - 1].close) obv += volume;
        else if (this.candles[i].close < this.candles[i - 1].close) obv -= volume;
      }
      result.push(obv);
    }
    return result;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.SignalEngine20 = SignalEngine20;
}
