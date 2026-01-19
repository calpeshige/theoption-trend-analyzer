// Signal Engine V5.0.0 - 20インジケーター高度分析システム
// 各インジケーターに独自ロジックを実装し、相場の方向性を判定

class SignalEngine {
  constructor() {
    this.candles = [];
    this.technicalEngine = null;

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

  setCandles(candles) {
    this.candles = candles;
    if (window.TechnicalAnalysisEngineV2) {
      this.technicalEngine = new window.TechnicalAnalysisEngineV2();
      this.technicalEngine.setCandles(candles);
    }
    // トレンドモードをリセット
    this.trendMode = null;
  }

  // ========================================
  // 強いトレンド検出システム（改善版）
  // 逆張りシグナル抑制のため、中程度のトレンドも検出
  // ========================================

  // 強いトレンドを検出してモードを設定（改善版: 3条件以上に厳格化）
  detectStrongTrend() {
    if (this.candles.length < 50) return null;

    let score = 0;
    let direction = 0; // 1: 上昇, -1: 下降

    // 条件1: ADX > 25 かつ DI方向（閾値を22→25に厳格化）
    const adxData = this.calculateADXFull(14);
    if (adxData && adxData.adx > 25) {
      score++;
      if (adxData.plusDI > adxData.minusDI) {
        direction += 1;
      } else {
        direction -= 1;
      }
      // ADX > 35 で非常に強いトレンド → 追加スコア（閾値を30→35に厳格化）
      if (adxData.adx > 35) {
        score++;
        direction += adxData.plusDI > adxData.minusDI ? 1 : -1;
      }
    }

    // 条件2: EMA配列（価格 vs EMA20 vs EMA50）
    const ema20 = this.calculateEMAArray(20);
    const ema50 = this.calculateEMAArray(50);
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

    // 条件3: 直近10本の陰線/陽線比率（閾値を6→7に厳格化）
    const recentCandles = this.candles.slice(-10);
    let bearishCount = 0;
    let bullishCount = 0;

    recentCandles.forEach(c => {
      if (c.close < c.open) bearishCount++;
      else if (c.close > c.open) bullishCount++;
    });

    if (bearishCount >= 7) {
      score++;
      direction -= 1;
    } else if (bullishCount >= 7) {
      score++;
      direction += 1;
    }

    // 条件4: 直近の価格変動率（閾値を0.3%→0.4%に厳格化）
    const priceChange = (currentPrice - this.candles[this.candles.length - 10].close) / this.candles[this.candles.length - 10].close;
    if (Math.abs(priceChange) > 0.004) { // 0.4%以上の変動
      score++;
      direction += priceChange > 0 ? 1 : -1;
    }

    // 条件5: MACDトレンド判定
    const macd = this.calculateMACDArray();
    if (macd.length >= 5) {
      const current = macd[macd.length - 1];
      const prev3 = macd[macd.length - 4];

      // MACDラインがシグナルラインより上/下 かつ ヒストグラムが拡大中
      if (current.macd > current.signal && current.histogram > prev3.histogram) {
        score++;
        direction += 1;
      } else if (current.macd < current.signal && current.histogram < prev3.histogram) {
        score++;
        direction -= 1;
      }
    }

    // 条件6: 連続した価格の方向（直近5本が同方向）
    const last5 = this.candles.slice(-5);
    let consecutiveUp = 0;
    let consecutiveDown = 0;
    for (let i = 1; i < last5.length; i++) {
      if (last5[i].close > last5[i-1].close) consecutiveUp++;
      else if (last5[i].close < last5[i-1].close) consecutiveDown++;
    }
    if (consecutiveUp >= 4) {
      score++;
      direction += 1;
    } else if (consecutiveDown >= 4) {
      score++;
      direction -= 1;
    }

    // 【改善】3条件以上該当 かつ 方向が一致している場合のみトレンドモードを設定
    // （閾値を2→3に厳格化して誤検出を防止）
    if (score >= 3) {
      if (direction >= 3) {
        return 'STRONG_UP';
      } else if (direction <= -3) {
        return 'STRONG_DOWN';
      }
    }

    return null;
  }

  // ========================================
  // 【新規】レンジ相場検出・位置判定システム
  // ========================================

  // レンジ相場の検出と現在位置の判定
  detectRangeContext() {
    if (this.candles.length < 50) {
      return { isRange: false, position: 'middle', positionPercent: 50 };
    }

    const lookback = Math.min(100, this.candles.length);
    const recentCandles = this.candles.slice(-lookback);

    // 高値・安値の範囲を計算
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);
    const rangeWidth = rangeHigh - rangeLow;

    // 現在価格の位置を0-100%で計算
    const currentPrice = this.candles[this.candles.length - 1].close;
    const positionPercent = ((currentPrice - rangeLow) / rangeWidth) * 100;

    // ADXでトレンド強度を確認（ADX < 25 ならレンジの可能性）
    const adxData = this.calculateADXFull(14);
    const isWeakTrend = !adxData || adxData.adx < 25;

    // レンジ判定: トレンドが弱い または STRONG_UP/DOWNでない
    const isRange = isWeakTrend && !this.trendMode;

    // 位置の判定
    let position = 'middle';
    if (positionPercent <= 25) {
      position = 'low_zone';  // 安値圏（下位25%）
    } else if (positionPercent >= 75) {
      position = 'high_zone'; // 高値圏（上位25%）
    }

    return {
      isRange,
      position,
      positionPercent: Math.round(positionPercent),
      rangeHigh,
      rangeLow,
      rangeWidth,
      currentPrice
    };
  }

  // 短期モメンタム（連続陽線/陰線）の検出
  detectShortTermMomentum() {
    if (this.candles.length < 5) {
      return { direction: 'neutral', consecutiveCount: 0, strength: 0 };
    }

    // 直近5本の陽線/陰線をカウント
    const last5 = this.candles.slice(-5);
    let bullishCount = 0;  // 陽線の数
    let bearishCount = 0;  // 陰線の数

    for (const candle of last5) {
      if (candle.close > candle.open) {
        bullishCount++;
      } else if (candle.close < candle.open) {
        bearishCount++;
      }
    }

    // 連続陽線/陰線のカウント（直近から遡る）
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

    // モメンタムの方向と強度を判定
    let direction = 'neutral';
    let strength = 0;

    if (bullishCount >= 4) {
      direction = 'bullish';
      strength = bullishCount;  // 4-5
    } else if (bearishCount >= 4) {
      direction = 'bearish';
      strength = bearishCount;  // 4-5
    } else if (bullishCount >= 3 && consecutiveCount >= 3 && lastDirection === 'up') {
      direction = 'bullish';
      strength = 3;
    } else if (bearishCount >= 3 && consecutiveCount >= 3 && lastDirection === 'down') {
      direction = 'bearish';
      strength = 3;
    }

    return {
      direction,
      consecutiveCount,
      consecutiveDirection: lastDirection,
      bullishCount,
      bearishCount,
      strength
    };
  }

  // レンジ位置×短期モメンタムによるスコア調整値を取得
  getRangeContextAdjustment() {
    if (!this.rangeContext || !this.shortTermMomentum) {
      return 0;
    }

    // トレンドモードがある場合は調整しない
    if (this.trendMode) {
      return 0;
    }

    const { isRange, position } = this.rangeContext;
    const { direction, strength } = this.shortTermMomentum;

    // レンジ相場でない場合は調整を弱める
    const rangeFactor = isRange ? 1.0 : 0.5;

    let adjustment = 0;

    // 安値圏 + 陽線連続 → HIGH方向への加点
    if (position === 'low_zone' && direction === 'bullish') {
      adjustment = strength * rangeFactor;  // +3 ~ +5
    }
    // 高値圏 + 陰線連続 → LOW方向への加点（マイナス値）
    else if (position === 'high_zone' && direction === 'bearish') {
      adjustment = -strength * rangeFactor;  // -3 ~ -5
    }
    // 安値圏 + 陰線連続 → すでに売られすぎ、反発の可能性（弱いHIGH）
    else if (position === 'low_zone' && direction === 'bearish') {
      adjustment = 1 * rangeFactor;  // 弱いHIGHバイアス
    }
    // 高値圏 + 陽線連続 → すでに買われすぎ、反落の可能性（弱いLOW）
    else if (position === 'high_zone' && direction === 'bullish') {
      adjustment = -1 * rangeFactor;  // 弱いLOWバイアス
    }
    // 中央 + モメンタムあり → モメンタム方向に軽く調整
    else if (position === 'middle' && direction === 'bullish') {
      adjustment = Math.min(2, strength) * rangeFactor * 0.5;  // +1 ~ +1
    }
    else if (position === 'middle' && direction === 'bearish') {
      adjustment = -Math.min(2, strength) * rangeFactor * 0.5;  // -1 ~ -1
    }

    return Math.round(adjustment);
  }

  // メイン分析関数 - 20インジケーターを実際のロジックで判定
  // 【改善】相関インジケーターのグループ化投票制限を導入
  analyze() {
    if (this.candles.length < 30) {
      return this.createNoSignalResult('データ不足（最低30本必要）');
    }

    // 強いトレンドを検出
    this.trendMode = this.detectStrongTrend();

    // 【新規】レンジ相場の検出と位置判定
    this.rangeContext = this.detectRangeContext();

    // 【新規】短期モメンタム（連続陽線/陰線）の検出
    this.shortTermMomentum = this.detectShortTermMomentum();

    // 20インジケーターの判定を実行（トレンドモードを考慮）
    const indicators = this.analyzeAllIndicators();

    // 20個の多数決（制限なし）
    const highCount = indicators.filter(ind => ind.signal === 'HIGH').length;
    const lowCount = indicators.filter(ind => ind.signal === 'LOW').length;

    // サポート/レジスタンスレベルを検出
    const srLevels = this.detectSupportResistanceLevels();

    // トレンドライン/チャネル分析と過熱警告を検出
    const trendLineAnalysis = this.detectTrendLineWarnings();

    return {
      signal: 'INDICATORS',
      indicators: indicators,
      highCount: highCount,
      lowCount: lowCount,
      trendMode: this.trendMode,
      supportResistance: srLevels,
      trendLineAnalysis: trendLineAnalysis,
      timestamp: new Date().toISOString()
    };
  }

  // トレンドライン分析と過熱警告
  detectTrendLineWarnings() {
    if (!this.analysisEngine || this.candles.length < 20) {
      return null;
    }

    try {
      // TechnicalAnalysisEngineV2のトレンドライン検出を使用
      this.analysisEngine.setCandles(this.candles);
      const trendLines = this.analysisEngine.detectTrendLines();

      if (!trendLines) {
        return null;
      }

      return {
        upTrendLine: trendLines.upTrendLine,
        downTrendLine: trendLines.downTrendLine,
        channel: trendLines.channel,
        warnings: trendLines.warning,
        currentPrice: trendLines.currentPrice
      };
    } catch (e) {
      console.error('トレンドライン分析エラー:', e);
      return null;
    }
  }

  // 【新規】相関インジケーターのグループ化投票制限
  // 各カテゴリから最大N票までしかカウントしない
  applyGroupVotingLimit(indicators) {
    // インジケーターをカテゴリ別に分類
    const groups = {
      // トレンド系: MA, BB, ICH, ALG, SAR, ENV, MAC → 最大4票
      trend: { ids: ['MA', 'BB', 'ICH', 'ALG', 'SAR', 'ENV', 'MAC'], maxVotes: 4 },
      // オシレーター系: RSI, STO, CCI, WPR, MOM, DEM → 最大3票
      oscillator: { ids: ['RSI', 'STO', 'CCI', 'WPR', 'MOM', 'DEM'], maxVotes: 3 },
      // ボラティリティ系: ATR, ADX, SDV, FRA → 最大2票
      volatility: { ids: ['ATR', 'ADX', 'SDV', 'FRA'], maxVotes: 2 },
      // ボリューム系: OBV, ACD, FRX → 最大2票
      volume: { ids: ['OBV', 'ACD', 'FRX'], maxVotes: 2 }
    };

    let highCount = 0;
    let lowCount = 0;

    // 各グループごとに投票をカウント
    for (const [groupName, group] of Object.entries(groups)) {
      const groupIndicators = indicators.filter(ind => group.ids.includes(ind.id));

      let groupHighVotes = 0;
      let groupLowVotes = 0;

      for (const ind of groupIndicators) {
        if (ind.signal === 'HIGH') groupHighVotes++;
        else if (ind.signal === 'LOW') groupLowVotes++;
      }

      // 最大投票数で制限
      highCount += Math.min(groupHighVotes, group.maxVotes);
      lowCount += Math.min(groupLowVotes, group.maxVotes);
    }

    return { highCount, lowCount };
  }

  // 【新規】確信度フィルタ付きシグナル判定
  // スコア±1以下の弱いシグナルはNEUTRALにする
  // 【改善】レンジ位置×短期モメンタムの調整を適用
  getFilteredSignal(score, threshold = 1, applyRangeAdjustment = true) {
    // レンジ調整を適用
    let adjustedScore = score;
    if (applyRangeAdjustment) {
      adjustedScore += this.getRangeContextAdjustment();
    }

    if (adjustedScore > threshold) return 'HIGH';
    if (adjustedScore < -threshold) return 'LOW';
    return 'NEUTRAL';
  }

  // レンジ調整なしのシグナル判定（一部インジケーター用）
  getFilteredSignalRaw(score, threshold = 1) {
    if (score > threshold) return 'HIGH';
    if (score < -threshold) return 'LOW';
    return 'NEUTRAL';
  }

  // 全インジケーターを分析
  analyzeAllIndicators() {
    const results = [];

    // 各インジケーターの分析を実行（トレンドモードを渡す）
    results.push(this.analyzeMA());       // 1. Moving Average
    results.push(this.analyzeBB());       // 2. Bollinger Bands
    results.push(this.analyzeMACD());     // 3. MACD
    results.push(this.analyzeRSI());      // 4. RSI
    results.push(this.analyzeSTO());      // 5. Stochastic
    results.push(this.analyzeICH());      // 6. Ichimoku
    results.push(this.analyzeATR());      // 7. ATR
    results.push(this.analyzeADX());      // 8. ADX
    results.push(this.analyzeSAR());      // 9. Parabolic SAR
    results.push(this.analyzeENV());      // 10. Envelopes
    results.push(this.analyzeSDV());      // 11. Standard Deviation
    results.push(this.analyzeCCI());      // 12. CCI
    results.push(this.analyzeMOM());      // 13. Momentum
    results.push(this.analyzeWPR());      // 14. Williams %R
    results.push(this.analyzeFRX());      // 15. Force Index
    results.push(this.analyzeDEM());      // 16. DeMarker
    results.push(this.analyzeALG());      // 17. Alligator
    results.push(this.analyzeFRA());      // 18. Fractals
    results.push(this.analyzeACD());      // 19. A/D (Accumulation/Distribution)
    results.push(this.analyzeOBV());      // 20. OBV

    return results;
  }

  // ========================================
  // トレンド系インジケーター (7個)
  // ========================================

  // 1. MA (Moving Average) - 3層EMAクロス分析【強化版】
  // 追加: 収束検出、傾斜角度、価格乖離率、クロス確認期間
  analyzeMA() {
    const ema5 = this.calculateEMAArray(5);
    const ema20 = this.calculateEMAArray(20);
    const ema50 = this.calculateEMAArray(50);
    const currentPrice = this.candles[this.candles.length - 1].close;

    if (ema5.length < 5 || ema20.length < 5 || ema50.length < 5) {
      return { id: 'MA', abbr: 'MA', signal: 'NEUTRAL' };
    }

    const ema5Current = ema5[ema5.length - 1];
    const ema20Current = ema20[ema20.length - 1];
    const ema50Current = ema50[ema50.length - 1];
    const ema5Prev3 = ema5[ema5.length - 4];
    const ema20Prev3 = ema20[ema20.length - 4];
    const ema50Prev3 = ema50[ema50.length - 4];

    let score = 0;

    // === 基本: EMAの並び順チェック ===
    if (ema5Current > ema20Current && ema20Current > ema50Current) {
      score += 3; // 完全な上昇配列
    } else if (ema5Current < ema20Current && ema20Current < ema50Current) {
      score -= 3; // 完全な下降配列
    } else if (ema5Current > ema20Current) {
      score += 1;
    } else if (ema5Current < ema20Current) {
      score -= 1;
    }

    // === 強化1: EMA収束検出（ブレイクアウト予兆）===
    const emaSpread = Math.abs(ema5Current - ema50Current) / ema50Current * 100;
    const emaSpreadPrev = Math.abs(ema5Prev3 - ema50Prev3) / ema50Prev3 * 100;
    const isConverging = emaSpread < 0.15; // 0.15%未満で収束
    const isExpanding = emaSpread > emaSpreadPrev * 1.3; // 30%以上拡大

    if (isConverging) {
      // 収束中は方向感が弱い → スコア減衰
      score = Math.round(score * 0.5);
    } else if (isExpanding) {
      // 拡大中はトレンド強化
      score = score > 0 ? score + 1 : score - 1;
    }

    // === 強化2: EMA傾斜角度（トレンド勢い）===
    const ema20Slope = (ema20Current - ema20Prev3) / ema20Prev3 * 100;
    const ema50Slope = (ema50Current - ema50Prev3) / ema50Prev3 * 100;

    // 両方のEMAが同方向に傾斜
    if (ema20Slope > 0.05 && ema50Slope > 0.03) {
      score += 1; // 強い上昇トレンド
    } else if (ema20Slope < -0.05 && ema50Slope < -0.03) {
      score -= 1; // 強い下降トレンド
    }

    // 傾斜の加速/減速
    if (Math.abs(ema20Slope) > Math.abs(ema50Slope) * 1.5) {
      // 短期EMAが長期より急傾斜 = トレンド加速
      score = score > 0 ? score + 1 : score - 1;
    }

    // === 強化3: 価格乖離率 ===
    const deviationFromEma20 = (currentPrice - ema20Current) / ema20Current * 100;

    if (Math.abs(deviationFromEma20) > 0.5) {
      // 乖離が大きい場合、回帰の可能性を考慮
      if (deviationFromEma20 > 0.5 && score > 0) {
        score -= 1; // 上に乖離しすぎ → 買いシグナル弱める
      } else if (deviationFromEma20 < -0.5 && score < 0) {
        score += 1; // 下に乖離しすぎ → 売りシグナル弱める
      }
    }

    // === 強化4: クロス後の確認期間 ===
    const ema5Prev = ema5[ema5.length - 3];
    const ema20Prev = ema20[ema20.length - 3];
    const ema5Prev2 = ema5[ema5.length - 2];
    const ema20Prev2 = ema20[ema20.length - 2];

    // ゴールデンクロス確認（2期間以上維持）
    if (ema5Prev < ema20Prev && ema5Prev2 > ema20Prev2 && ema5Current > ema20Current) {
      score += 2; // 確認済みゴールデンクロス
    } else if (ema5Prev < ema20Prev && ema5Current > ema20Current) {
      score += 1; // 直近クロス（未確認）
    }
    // デッドクロス確認
    if (ema5Prev > ema20Prev && ema5Prev2 < ema20Prev2 && ema5Current < ema20Current) {
      score -= 2; // 確認済みデッドクロス
    } else if (ema5Prev > ema20Prev && ema5Current < ema20Current) {
      score -= 1; // 直近クロス（未確認）
    }

    // === 強化5: 価格とEMA20の位置関係 + 連続性 ===
    let priceAboveEma20Count = 0;
    for (let i = 0; i < 5; i++) {
      const price = this.candles[this.candles.length - 1 - i].close;
      const ema = ema20[ema20.length - 1 - i];
      if (price > ema) priceAboveEma20Count++;
    }

    if (priceAboveEma20Count >= 4) {
      score += 1; // 価格がEMA20上を維持
    } else if (priceAboveEma20Count <= 1) {
      score -= 1; // 価格がEMA20下を維持
    }

    return {
      id: 'MA',
      abbr: 'MA',
      signal: this.getFilteredSignal(score)
    };
  }

  // 2. BB (Bollinger Bands) - バンドウォーク + 価格位置分析【強化版】
  // 追加: スクイーズ検出、スクイーズ→拡大パターン、%B、連続バンドタッチ、ミドルラインクロス
  analyzeBB() {
    const bb = this.calculateBollingerBandsArray(20, 2);
    if (bb.length < 10) {
      return { id: 'BB', abbr: 'BB', signal: 'NEUTRAL' };
    }

    const current = bb[bb.length - 1];
    const prev5 = bb[bb.length - 6];
    const prev10 = bb[bb.length - 10];
    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;

    let score = 0;

    // 価格位置（%B = バンド内の相対位置）
    const bandWidth = current.upper - current.lower;
    const percentB = (currentPrice - current.lower) / bandWidth;

    // === 強化1: スクイーズ検出（低ボラティリティ期間）===
    const currBandwidthPct = bandWidth / current.middle * 100;
    const prev5BandwidthPct = (prev5.upper - prev5.lower) / prev5.middle * 100;
    const prev10BandwidthPct = (prev10.upper - prev10.lower) / prev10.middle * 100;

    // 直近10期間の平均バンド幅
    let avgBandwidth = 0;
    for (let i = bb.length - 10; i < bb.length; i++) {
      avgBandwidth += (bb[i].upper - bb[i].lower) / bb[i].middle * 100;
    }
    avgBandwidth /= 10;

    const isSqueezing = currBandwidthPct < avgBandwidth * 0.8; // 平均の80%未満
    const wasSqueezing = prev5BandwidthPct < avgBandwidth * 0.8;
    const isExpanding = currBandwidthPct > prev5BandwidthPct * 1.2; // 20%以上拡大

    // === 強化2: スクイーズ→拡大パターン（ブレイクアウト）===
    if (wasSqueezing && isExpanding) {
      // スクイーズからの拡大 = ブレイクアウト
      if (percentB > 0.8) {
        score += 3; // 上方ブレイクアウト
      } else if (percentB < 0.2) {
        score -= 3; // 下方ブレイクアウト
      }
    } else if (isSqueezing) {
      // スクイーズ中は方向感なし → スコア減衰
      score = Math.round(score * 0.5);
    }

    // 強いトレンドモード時はトレンドフォローのみ
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

    // === 通常モード ===

    // === 強化3: バンドウォーク検出（改善版）===
    let upperWalkCount = 0;
    let lowerWalkCount = 0;
    let upperTouchCount = 0;
    let lowerTouchCount = 0;

    for (let i = bb.length - 5; i < bb.length; i++) {
      const candle = this.candles[this.candles.length - (bb.length - i)];
      const bandData = bb[i];
      const pos = (candle.close - bandData.lower) / (bandData.upper - bandData.lower);

      if (pos > 0.8) upperWalkCount++;
      if (pos < 0.2) lowerWalkCount++;
      if (candle.high >= bandData.upper * 0.995) upperTouchCount++; // 上限タッチ
      if (candle.low <= bandData.lower * 1.005) lowerTouchCount++; // 下限タッチ
    }

    // === 強化4: 連続バンドタッチ（トレンド継続 vs 反転）===
    if (upperTouchCount >= 3) {
      if (upperWalkCount >= 3) {
        score += 2; // 上限ウォーク継続 = 強い上昇
      } else {
        score -= 1; // 上限タッチ後反落の可能性
      }
    }
    if (lowerTouchCount >= 3) {
      if (lowerWalkCount >= 3) {
        score -= 2; // 下限ウォーク継続 = 強い下降
      } else {
        score += 1; // 下限タッチ後反発の可能性
      }
    }

    // %B位置による基本スコア
    if (percentB > 0.75) {
      if (upperWalkCount >= 3) {
        score += 2;
      } else {
        score -= 1; // 過熱感
      }
    } else if (percentB < 0.25) {
      if (lowerWalkCount >= 3) {
        score -= 2;
      } else {
        score += 1; // 売られすぎ
      }
    } else if (percentB > 0.5) {
      score += 1;
    } else {
      score -= 1;
    }

    // === 強化5: ミドルラインクロス ===
    if (prevPrice < current.middle && currentPrice > current.middle) {
      score += 2; // ミドルライン上抜け
    } else if (prevPrice > current.middle && currentPrice < current.middle) {
      score -= 2; // ミドルライン下抜け
    }

    // バンド幅の変化による確信度調整
    if (isExpanding && !wasSqueezing) {
      // 通常の拡大 = トレンド強化
      score = score > 0 ? score + 1 : score - 1;
    }

    return {
      id: 'BB',
      abbr: 'BB',
      signal: this.getFilteredSignal(score)
    };
  }

  // 3. MACD - ラインクロス + ヒストグラム傾斜 + ダイバージェンス【強化版】
  // 追加: ゼロライン距離、ヒストグラム反転パターン、MACD-シグナル乖離、クロス予測
  analyzeMACD() {
    const macd = this.calculateMACDArray();
    if (macd.length < 10) {
      return { id: 'MAC', abbr: 'MAC', signal: 'NEUTRAL' };
    }

    const current = macd[macd.length - 1];
    const prev = macd[macd.length - 2];
    const prev2 = macd[macd.length - 3];
    const prev3 = macd[macd.length - 4];
    const prev4 = macd[macd.length - 5];

    let score = 0;

    // === 基本: MACDラインとシグナルラインのクロス ===
    if (prev.macd < prev.signal && current.macd > current.signal) {
      score += 3; // ゴールデンクロス
    } else if (prev.macd > prev.signal && current.macd < current.signal) {
      score -= 3; // デッドクロス
    }

    // === 強化1: ゼロライン距離の考慮 ===
    // ゼロライン付近でのクロスはより信頼性が高い
    const macdAbsValue = Math.abs(current.macd);
    const avgMacdAbs = macd.slice(-20).reduce((a, b) => a + Math.abs(b.macd), 0) / 20;

    if (current.macd > 0) {
      score += 1;
      // ゼロラインより大きく上にいる = 過熱の可能性
      if (macdAbsValue > avgMacdAbs * 1.5) {
        score -= 1; // 過熱感で減点
      }
    } else {
      score -= 1;
      // ゼロラインより大きく下にいる = 売られすぎの可能性
      if (macdAbsValue > avgMacdAbs * 1.5) {
        score += 1; // 売られすぎで加点
      }
    }

    // ゼロラインクロス
    if (prev.macd < 0 && current.macd > 0) {
      score += 2; // ゼロライン上抜け
    } else if (prev.macd > 0 && current.macd < 0) {
      score -= 2; // ゼロライン下抜け
    }

    // === 強化2: ヒストグラム反転パターン（3縮小→1拡大）===
    const hist = [prev4.histogram, prev3.histogram, prev2.histogram, prev.histogram, current.histogram];

    // 正のヒストグラムが縮小後に拡大（下落への転換予兆）
    if (hist[0] > 0 && hist[1] > 0 && hist[2] > 0 && hist[3] > 0 && hist[4] > 0) {
      const shrinking = hist[0] > hist[1] && hist[1] > hist[2] && hist[2] > hist[3];
      const expanding = hist[4] > hist[3];
      if (shrinking && expanding) {
        score += 1; // 縮小後の反転上昇
      } else if (shrinking && !expanding) {
        score -= 1; // 縮小継続 = 勢い低下
      }
    }

    // 負のヒストグラムが縮小後に拡大（上昇への転換予兆）
    if (hist[0] < 0 && hist[1] < 0 && hist[2] < 0 && hist[3] < 0 && hist[4] < 0) {
      const shrinking = hist[0] < hist[1] && hist[1] < hist[2] && hist[2] < hist[3]; // 絶対値で縮小
      const expanding = hist[4] < hist[3]; // 絶対値で拡大
      if (shrinking && expanding) {
        score -= 1; // 縮小後の反転下降
      } else if (shrinking && !expanding) {
        score += 1; // 縮小継続 = 下落勢い低下
      }
    }

    // === 強化3: MACD-シグナル乖離幅 ===
    const gap = current.macd - current.signal;
    const prevGap = prev.macd - prev.signal;
    const gapExpanding = Math.abs(gap) > Math.abs(prevGap);

    if (gap > 0 && gapExpanding) {
      score += 1; // MACDがシグナルを上回り乖離拡大
    } else if (gap < 0 && gapExpanding) {
      score -= 1; // MACDがシグナルを下回り乖離拡大
    }

    // === 強化4: クロス予測（収束検出）===
    const gapTrend = gap - prevGap;
    const isConverging = (gap > 0 && gapTrend < 0) || (gap < 0 && gapTrend > 0);

    if (isConverging && Math.abs(gap) < Math.abs(prevGap) * 0.5) {
      // 急速に収束中 = クロス間近
      if (gap > 0) {
        score -= 1; // 上からのデッドクロス予兆
      } else {
        score += 1; // 下からのゴールデンクロス予兆
      }
    }

    // === 基本: ヒストグラムの傾斜 ===
    if (current.histogram > prev.histogram && prev.histogram > prev3.histogram) {
      score += 1; // ヒストグラム増加
    } else if (current.histogram < prev.histogram && prev.histogram < prev3.histogram) {
      score -= 1; // ヒストグラム減少
    }

    // === 強化5: ダイバージェンス検出（改善版）===
    const prices = this.candles.slice(-15).map(c => c.close);
    const macdValues = macd.slice(-15).map(m => m.macd);

    // 価格のピーク/ボトムを検出
    const priceHigh = Math.max(...prices);
    const priceLow = Math.min(...prices);
    const macdHigh = Math.max(...macdValues);
    const macdLow = Math.min(...macdValues);

    const priceAtEnd = prices[prices.length - 1];
    const macdAtEnd = macdValues[macdValues.length - 1];

    // 弱気ダイバージェンス: 価格高値更新、MACD高値未更新
    if (priceAtEnd >= priceHigh * 0.99 && macdAtEnd < macdHigh * 0.9) {
      score -= 2;
    }
    // 強気ダイバージェンス: 価格安値更新、MACD安値未更新
    if (priceAtEnd <= priceLow * 1.01 && macdAtEnd > macdLow * 1.1) {
      score += 2;
    }

    return {
      id: 'MAC',
      abbr: 'MAC',
      signal: this.getFilteredSignal(score)
    };
  }

  // 6. ICH (Ichimoku) - 転換線/基準線クロス + 雲との位置関係【強化版】
  // 追加: 三役好転/三役逆転、雲の厚さ、雲のねじれ、転換線-基準線乖離、価格と雲の距離
  analyzeICH() {
    const ichimoku = this.calculateIchimoku();
    if (!ichimoku) {
      return { id: 'ICH', abbr: 'ICH', signal: 'NEUTRAL' };
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    let score = 0;

    // 雲の上限/下限
    const cloudTop = Math.max(ichimoku.senkouA, ichimoku.senkouB);
    const cloudBottom = Math.min(ichimoku.senkouA, ichimoku.senkouB);
    const cloudThickness = cloudTop - cloudBottom;
    const cloudMid = (cloudTop + cloudBottom) / 2;

    // === 強化1: 三役好転/三役逆転の検出 ===
    // 三役好転: ①転換線>基準線 ②価格>雲 ③遅行スパン>26期前価格
    const tenkanAboveKijun = ichimoku.tenkan > ichimoku.kijun;
    const priceAboveCloud = currentPrice > cloudTop;
    const priceBelowCloud = currentPrice < cloudBottom;
    const chikouAbovePrice = ichimoku.chikou > currentPrice;
    const chikouBelowPrice = ichimoku.chikou < currentPrice;

    // 三役好転（完全な買いシグナル）
    if (tenkanAboveKijun && priceAboveCloud && chikouAbovePrice) {
      score += 4;
    }
    // 三役逆転（完全な売りシグナル）
    else if (!tenkanAboveKijun && priceBelowCloud && chikouBelowPrice) {
      score -= 4;
    }
    // 部分的な条件
    else {
      // 転換線と基準線のクロス
      if (tenkanAboveKijun) {
        score += 2;
      } else {
        score -= 2;
      }

      // 価格と雲の位置関係
      if (priceAboveCloud) {
        score += 2;
      } else if (priceBelowCloud) {
        score -= 2;
      }
      // 雲の中は中立（スコア追加なし）

      // 遅行スパン
      if (chikouAbovePrice) {
        score += 1;
      } else if (chikouBelowPrice) {
        score -= 1;
      }
    }

    // === 強化2: 雲の厚さによる信頼性 ===
    const cloudThicknessRatio = cloudThickness / currentPrice * 100;

    if (cloudThicknessRatio > 0.3) {
      // 厚い雲 = 強いサポート/レジスタンス
      if (priceAboveCloud) {
        score += 1; // 厚い雲を上抜け = 強い上昇
      } else if (priceBelowCloud) {
        score -= 1; // 厚い雲を下抜け = 強い下落
      }
    } else if (cloudThicknessRatio < 0.1) {
      // 薄い雲 = 方向感弱い
      score = Math.round(score * 0.8);
    }

    // === 強化3: 雲の色（将来の雲の方向）===
    if (ichimoku.senkouA > ichimoku.senkouB) {
      score += 1; // 強気雲
    } else {
      score -= 1; // 弱気雲
    }

    // === 強化4: 転換線-基準線の乖離幅 ===
    const tkGap = ichimoku.tenkan - ichimoku.kijun;
    const tkGapRatio = Math.abs(tkGap) / ichimoku.kijun * 100;

    if (tkGapRatio > 0.1) {
      // 乖離が大きい = トレンド強い
      score = score > 0 ? score + 1 : score - 1;
    } else if (tkGapRatio < 0.02) {
      // 転換線と基準線が近接 = 方向感弱い
      score = Math.round(score * 0.7);
    }

    // === 強化5: 価格と雲の距離 ===
    if (priceAboveCloud) {
      const distanceFromCloud = (currentPrice - cloudTop) / currentPrice * 100;
      if (distanceFromCloud > 0.5) {
        // 雲から離れすぎ = 過熱感
        score -= 1;
      }
    } else if (priceBelowCloud) {
      const distanceFromCloud = (cloudBottom - currentPrice) / currentPrice * 100;
      if (distanceFromCloud > 0.5) {
        // 雲から離れすぎ = 売られすぎ
        score += 1;
      }
    }

    // === 強化6: 雲突入/突破の検出 ===
    const wasAboveCloud = prevPrice > cloudTop;
    const wasBelowCloud = prevPrice < cloudBottom;
    const wasInCloud = prevPrice >= cloudBottom && prevPrice <= cloudTop;

    // 雲上抜け
    if (wasBelowCloud && priceAboveCloud) {
      score += 2;
    } else if (wasInCloud && priceAboveCloud) {
      score += 1;
    }
    // 雲下抜け
    if (wasAboveCloud && priceBelowCloud) {
      score -= 2;
    } else if (wasInCloud && priceBelowCloud) {
      score -= 1;
    }

    return {
      id: 'ICH',
      abbr: 'ICH',
      signal: this.getFilteredSignal(score)
    };
  }

  // 9. SAR (Parabolic SAR) - ドット位置 + 反転頻度【強化版】
  // 追加: SAR距離、加速因子(AF)相当、反転間隔、価格-SAR乖離率、トレンド成熟度
  analyzeSAR() {
    const sar = this.calculateParabolicSARExtended();
    if (sar.length < 15) {
      return { id: 'SAR', abbr: 'SAR', signal: 'NEUTRAL' };
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    const currentSAR = sar[sar.length - 1];
    const prevSAR = sar[sar.length - 2];
    let score = 0;

    // === 基本: SARと価格の位置 ===
    const isUptrend = currentPrice > currentSAR.value;
    if (isUptrend) {
      score += 2;
    } else {
      score -= 2;
    }

    // === 強化1: SAR距離（価格との乖離率）===
    const sarDistance = Math.abs(currentPrice - currentSAR.value) / currentPrice * 100;
    const prevSarDistance = Math.abs(this.candles[this.candles.length - 2].close - prevSAR.value) / this.candles[this.candles.length - 2].close * 100;

    // 距離が縮まっている = 反転の可能性
    if (sarDistance < prevSarDistance * 0.7) {
      // SAR距離が急速に縮小 = 反転接近
      score = Math.round(score * 0.7);
    } else if (sarDistance > prevSarDistance * 1.2) {
      // SAR距離が拡大 = トレンド加速
      score = score > 0 ? score + 1 : score - 1;
    }

    // === 強化2: トレンド継続期間と成熟度 ===
    let trendLength = 0;
    const currentTrend = currentSAR.trend;
    for (let i = sar.length - 1; i >= 0; i--) {
      if (sar[i].trend === currentTrend) {
        trendLength++;
      } else {
        break;
      }
    }

    // トレンド成熟度による評価
    if (trendLength >= 10) {
      // 長すぎるトレンド = 反転リスク
      score = Math.round(score * 0.8);
    } else if (trendLength >= 5) {
      // 成熟したトレンド = 信頼性高い
      score = score > 0 ? score + 2 : score - 2;
    } else if (trendLength >= 3) {
      score = score > 0 ? score + 1 : score - 1;
    } else if (trendLength <= 2) {
      // 新しいトレンド = 確認必要
      score = Math.round(score * 0.6);
    }

    // === 強化3: 反転間隔の分析 ===
    const reversalIntervals = [];
    let lastReversalIdx = -1;
    for (let i = 1; i < sar.length; i++) {
      if (sar[i].trend !== sar[i - 1].trend) {
        if (lastReversalIdx >= 0) {
          reversalIntervals.push(i - lastReversalIdx);
        }
        lastReversalIdx = i;
      }
    }

    // 最近の反転頻度
    let recentReversals = 0;
    for (let i = sar.length - 10; i < sar.length - 1; i++) {
      if (sar[i].trend !== sar[i + 1].trend) {
        recentReversals++;
      }
    }

    if (recentReversals >= 3) {
      // 頻繁な反転 = レンジ相場でノイズが多い
      score = Math.round(score * 0.4);
    } else if (recentReversals === 0 && trendLength >= 5) {
      // 安定したトレンド
      score = score > 0 ? score + 1 : score - 1;
    }

    // === 強化4: SAR加速の検出 ===
    // SARの移動速度を計算
    const sarMovement = Math.abs(currentSAR.value - prevSAR.value);
    const prevSarMovement = sar.length > 2 ? Math.abs(prevSAR.value - sar[sar.length - 3].value) : sarMovement;

    if (sarMovement > prevSarMovement * 1.3) {
      // SAR加速中 = トレンド強化
      score = score > 0 ? score + 1 : score - 1;
    } else if (sarMovement < prevSarMovement * 0.7 && trendLength > 5) {
      // SAR減速中 = トレンド弱化の可能性
      score = Math.round(score * 0.8);
    }

    // === 強化5: 直近の反転シグナル ===
    if (trendLength === 1) {
      // たった今反転した
      // 前のトレンドの長さを確認
      let prevTrendLength = 0;
      for (let i = sar.length - 2; i >= 0; i--) {
        if (sar[i].trend !== currentTrend) {
          prevTrendLength++;
        } else {
          break;
        }
      }

      if (prevTrendLength >= 5) {
        // 長いトレンドからの反転 = 信頼性高い
        score = score > 0 ? score + 2 : score - 2;
      } else if (prevTrendLength <= 2) {
        // 短いトレンドからの反転 = ノイズの可能性
        score = Math.round(score * 0.5);
      }
    }

    return {
      id: 'SAR',
      abbr: 'SAR',
      signal: this.getFilteredSignal(score)
    };
  }

  // 10. ENV (Envelopes) - 価格位置 + 中央線との乖離【強化版】
  // 追加: 動的乖離率調整、突破頻度、中央線クロス、バンドタッチ連続、ボラティリティ適応
  analyzeENV() {
    // 動的な乖離率を計算（ATRベース）
    const atr = this.calculateATRArray(14);
    let envPercentage = 0.1; // デフォルト
    if (atr.length > 0) {
      const currentATR = atr[atr.length - 1];
      const avgPrice = this.candles.slice(-20).reduce((a, c) => a + c.close, 0) / 20;
      const atrPct = (currentATR / avgPrice) * 100;
      // ATRに基づいて乖離率を動的調整（0.05% - 0.3%）
      envPercentage = Math.max(0.05, Math.min(0.3, atrPct * 0.5));
    }

    const env = this.calculateEnvelopes(20, envPercentage);
    if (!env) {
      return { id: 'ENV', abbr: 'ENV', signal: 'NEUTRAL' };
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    let score = 0;

    // エンベロープ内の位置
    const position = (currentPrice - env.lower) / (env.upper - env.lower);
    const prevPosition = (prevPrice - env.lower) / (env.upper - env.lower);

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (position < 0.5) score -= 2;
      if (position < 0.2) score -= 2;
      if (currentPrice < env.middle) score -= 1;
      return { id: 'ENV', abbr: 'ENV', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (position > 0.5) score += 2;
      if (position > 0.8) score += 2;
      if (currentPrice > env.middle) score += 1;
      return { id: 'ENV', abbr: 'ENV', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 強化1: バンドタッチ・突破の検出 ===
    let upperTouchCount = 0;
    let lowerTouchCount = 0;
    let upperBreakCount = 0;
    let lowerBreakCount = 0;

    for (let i = 0; i < 10 && i < this.candles.length; i++) {
      const candle = this.candles[this.candles.length - 1 - i];
      const candlePos = (candle.close - env.lower) / (env.upper - env.lower);
      if (candlePos >= 0.95) upperTouchCount++;
      if (candlePos <= 0.05) lowerTouchCount++;
      if (candle.high > env.upper) upperBreakCount++;
      if (candle.low < env.lower) lowerBreakCount++;
    }

    // === 強化2: 連続タッチ/突破パターン ===
    if (upperBreakCount >= 3) {
      score += 2; // 上限を頻繁に突破 = 強い上昇トレンド
    } else if (upperTouchCount >= 3 && upperBreakCount < 2) {
      score -= 1; // 上限タッチだが突破できず = 反落の可能性
    }

    if (lowerBreakCount >= 3) {
      score -= 2; // 下限を頻繁に突破 = 強い下降トレンド
    } else if (lowerTouchCount >= 3 && lowerBreakCount < 2) {
      score += 1; // 下限タッチだが突破できず = 反発の可能性
    }

    // === 強化3: 中央線クロス ===
    if (prevPrice < env.middle && currentPrice > env.middle) {
      score += 2; // 中央線上抜け
    } else if (prevPrice > env.middle && currentPrice < env.middle) {
      score -= 2; // 中央線下抜け
    }

    // === 強化4: 位置に基づく基本スコア ===
    if (position > 0.9) {
      // 上限付近
      if (upperBreakCount >= 2) {
        score += 1; // 突破実績あり = トレンド継続
      } else {
        score -= 1; // 突破できず = 反落リスク
      }
    } else if (position < 0.1) {
      // 下限付近
      if (lowerBreakCount >= 2) {
        score -= 1; // 突破実績あり = トレンド継続
      } else {
        score += 1; // 突破できず = 反発リスク
      }
    } else if (position > 0.5) {
      score += 1;
    } else {
      score -= 1;
    }

    // === 強化5: 中央線との乖離率 + 回帰期待 ===
    const deviation = ((currentPrice - env.middle) / env.middle) * 100;
    const extremeDeviation = envPercentage * 0.8; // 動的な極端乖離閾値

    if (Math.abs(deviation) > extremeDeviation) {
      // 極端な乖離 = 回帰期待
      if (deviation > 0) {
        score -= 1;
      } else {
        score += 1;
      }
    }

    // === 強化6: モメンタム方向との一致 ===
    const momentum = currentPrice - this.candles[this.candles.length - 5].close;
    const positionChange = position - prevPosition;

    if (momentum > 0 && positionChange > 0 && position > 0.5) {
      score += 1; // 上昇モメンタムと位置上昇が一致
    } else if (momentum < 0 && positionChange < 0 && position < 0.5) {
      score -= 1; // 下降モメンタムと位置下降が一致
    }

    return {
      id: 'ENV',
      abbr: 'ENV',
      signal: this.getFilteredSignal(score)
    };
  }

  // 17. Alligator - 3線クロス + 覚醒/スリープ検出【強化版】
  // 追加: スリープ/覚醒状態検出、線の開き速度、価格と線の位置関係、順序確認期間
  analyzeALG() {
    const alligator = this.calculateAlligatorExtended();
    if (!alligator || alligator.history.length < 5) {
      return { id: 'ALG', abbr: 'ALG', signal: 'NEUTRAL' };
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    let score = 0;

    // === 基本: 3線の並び順（リップス > ティース > ジョーズ = 上昇）===
    if (alligator.lips > alligator.teeth && alligator.teeth > alligator.jaw) {
      score += 3; // 完全な上昇配列
    } else if (alligator.lips < alligator.teeth && alligator.teeth < alligator.jaw) {
      score -= 3; // 完全な下降配列
    } else if (alligator.lips > alligator.teeth) {
      score += 1;
    } else if (alligator.lips < alligator.teeth) {
      score -= 1;
    }

    // === 強化1: スリープ/覚醒状態検出 ===
    const spread = Math.abs(alligator.lips - alligator.jaw) / alligator.jaw * 100;
    const spreadTeethLips = Math.abs(alligator.lips - alligator.teeth) / alligator.teeth * 100;
    const spreadTeethJaw = Math.abs(alligator.teeth - alligator.jaw) / alligator.jaw * 100;

    // 過去のスプレッドを計算
    const hist = alligator.history;
    const prevSpread = Math.abs(hist[hist.length - 2].lips - hist[hist.length - 2].jaw) / hist[hist.length - 2].jaw * 100;
    const prev3Spread = Math.abs(hist[hist.length - 4].lips - hist[hist.length - 4].jaw) / hist[hist.length - 4].jaw * 100;

    // スリープ状態（3線が非常に近い）
    const isSleeping = spread < 0.02 && spreadTeethLips < 0.01 && spreadTeethJaw < 0.01;
    // 覚醒中（スプレッドが拡大）
    const isAwakening = spread > prevSpread * 1.3 && prevSpread > prev3Spread;
    // 食事中（強いトレンド）
    const isEating = spread > 0.15;

    if (isSleeping) {
      // スリープ状態 → シグナル無効化
      score = 0;
    } else if (isAwakening) {
      // 覚醒中 → トレンド方向のシグナル強化
      score = score > 0 ? score + 2 : score < 0 ? score - 2 : 0;
    } else if (isEating) {
      // 食事中（強いトレンド）
      score = score > 0 ? score + 1 : score - 1;
    }

    // === 強化2: 線の開き速度（トレンド加速/減速）===
    const spreadVelocity = spread - prevSpread;
    const prevVelocity = prevSpread - prev3Spread;

    if (spreadVelocity > 0 && prevVelocity > 0) {
      // 加速拡大 → トレンド継続
      score = score > 0 ? score + 1 : score < 0 ? score - 1 : 0;
    } else if (spreadVelocity < 0 && spread > 0.05) {
      // 収束中（トレンド弱化）→ 逆張り警戒
      score = Math.round(score * 0.7);
    }

    // === 強化3: 価格と3線の位置関係 ===
    const priceAboveAll = currentPrice > alligator.lips && currentPrice > alligator.teeth && currentPrice > alligator.jaw;
    const priceBelowAll = currentPrice < alligator.lips && currentPrice < alligator.teeth && currentPrice < alligator.jaw;
    const priceInLines = !priceAboveAll && !priceBelowAll;

    if (priceAboveAll && score > 0) {
      score += 1; // 価格が全線の上 → 上昇トレンド確認
    } else if (priceBelowAll && score < 0) {
      score -= 1; // 価格が全線の下 → 下降トレンド確認
    } else if (priceInLines) {
      // 価格が線の間 → 方向感不明
      score = Math.round(score * 0.6);
    }

    // === 強化4: 並び順の継続確認 ===
    let orderConsistency = 0;
    for (let i = 1; i <= 3; i++) {
      const h = hist[hist.length - i];
      if (h.lips > h.teeth && h.teeth > h.jaw) {
        orderConsistency++;
      } else if (h.lips < h.teeth && h.teeth < h.jaw) {
        orderConsistency--;
      }
    }

    if (orderConsistency >= 2 && score > 0) {
      score += 1; // 上昇配列が継続
    } else if (orderConsistency <= -2 && score < 0) {
      score -= 1; // 下降配列が継続
    } else if (orderConsistency === 0) {
      // 配列が混乱 → 方向感弱い
      score = Math.round(score * 0.7);
    }

    return {
      id: 'ALG',
      abbr: 'ALG',
      signal: this.getFilteredSignal(score)
    };
  }

  // ========================================
  // オシレーター系インジケーター (6個)
  // ========================================

  // 4. RSI - 50ライン + 過熱ゾーン + ダイバージェンス【強化版】
  // 追加: RSI勢い/速度、ゾーン滞在時間、隠れダイバージェンス、中央ゾーン回避、RSI MA平滑化
  analyzeRSI() {
    const rsiArray = this.calculateRSIArray(14);
    if (rsiArray.length < 15) {
      return { id: 'RSI', abbr: 'RSI', signal: 'NEUTRAL' };
    }

    const currentRSI = rsiArray[rsiArray.length - 1];
    const prevRSI = rsiArray[rsiArray.length - 2];
    const prev2RSI = rsiArray[rsiArray.length - 3];
    const prev5RSI = rsiArray[rsiArray.length - 6];
    let score = 0;

    // === 強化1: RSIのモメンタム（変化速度）===
    const rsiMomentum = currentRSI - prevRSI;
    const prevMomentum = prevRSI - prev2RSI;
    const isAccelerating = Math.abs(rsiMomentum) > Math.abs(prevMomentum);

    // RSI移動平均（平滑化）
    const rsiMA5 = rsiArray.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const rsiMA10 = rsiArray.slice(-10).reduce((a, b) => a + b, 0) / 10;

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentRSI < 50) score -= 2;
      if (currentRSI < 30) score -= 2;
      if (currentRSI < prevRSI) score -= 1;
      if (rsiMA5 < rsiMA10) score -= 1; // RSI MA下降
      return { id: 'RSI', abbr: 'RSI', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentRSI > 50) score += 2;
      if (currentRSI > 70) score += 2;
      if (currentRSI > prevRSI) score += 1;
      if (rsiMA5 > rsiMA10) score += 1; // RSI MA上昇
      return { id: 'RSI', abbr: 'RSI', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 強化2: 中央ゾーン（40-60）回避 ===
    if (currentRSI >= 40 && currentRSI <= 60) {
      // 中央ゾーンは方向感が弱い → シグナル弱める
      score = Math.round(score * 0.5);
    } else {
      // 50ラインの上下
      if (currentRSI > 50) {
        score += 1;
      } else {
        score -= 1;
      }
    }

    // === 強化3: ゾーン滞在時間 ===
    let overboughtCount = 0;
    let oversoldCount = 0;
    for (let i = 0; i < 10; i++) {
      const rsi = rsiArray[rsiArray.length - 1 - i];
      if (rsi > 70) overboughtCount++;
      if (rsi < 30) oversoldCount++;
    }

    // 過熱ゾーン分析（滞在時間考慮）
    if (currentRSI > 70) {
      if (overboughtCount >= 5) {
        // 長期間買われすぎ → 反落リスク高
        if (currentRSI < prevRSI) {
          score -= 3; // 下落開始
        } else {
          score -= 1; // まだ上昇中だが警戒
        }
      } else {
        // 短期間の買われすぎ
        if (currentRSI > prevRSI && isAccelerating) {
          score += 1; // 勢いあり継続
        } else {
          score -= 1;
        }
      }
    } else if (currentRSI < 30) {
      if (oversoldCount >= 5) {
        // 長期間売られすぎ → 反発リスク高
        if (currentRSI > prevRSI) {
          score += 3; // 上昇開始
        } else {
          score += 1; // まだ下落中だが警戒
        }
      } else {
        // 短期間の売られすぎ
        if (currentRSI < prevRSI && isAccelerating) {
          score -= 1; // 勢いあり継続
        } else {
          score += 1;
        }
      }
    }

    // === 強化4: RSI MA平滑化によるトレンド判定 ===
    if (rsiMA5 > rsiMA10 && currentRSI > rsiMA5) {
      score += 1; // RSIの上昇トレンド
    } else if (rsiMA5 < rsiMA10 && currentRSI < rsiMA5) {
      score -= 1; // RSIの下降トレンド
    }

    // === 強化5: RSIの傾き（勢い）===
    if (rsiMomentum > 3 && isAccelerating) {
      score += 1; // 急上昇中
    } else if (rsiMomentum < -3 && isAccelerating) {
      score -= 1; // 急下降中
    }

    // === 強化6: 通常ダイバージェンス検出（改善版）===
    const prices = this.candles.slice(-15).map(c => c.close);
    const rsiSlice = rsiArray.slice(-15);

    // 価格とRSIの高値/安値を検出
    const priceHigh = Math.max(...prices);
    const priceLow = Math.min(...prices);
    const rsiHigh = Math.max(...rsiSlice);
    const rsiLow = Math.min(...rsiSlice);

    const priceAtEnd = prices[prices.length - 1];
    const rsiAtEnd = rsiSlice[rsiSlice.length - 1];

    // 弱気ダイバージェンス: 価格高値更新、RSI高値未更新
    if (priceAtEnd >= priceHigh * 0.995 && rsiAtEnd < rsiHigh - 5) {
      score -= 2;
    }
    // 強気ダイバージェンス: 価格安値更新、RSI安値未更新
    if (priceAtEnd <= priceLow * 1.005 && rsiAtEnd > rsiLow + 5) {
      score += 2;
    }

    // === 強化7: 隠れダイバージェンス（トレンド継続シグナル）===
    const priceStart = prices[0];
    const rsiStart = rsiSlice[0];

    // 隠れ強気: 価格が高値切り上げ、RSIが安値切り下げ（上昇トレンド継続）
    if (priceAtEnd > priceStart && rsiAtEnd < rsiStart && currentRSI > 40) {
      score += 1;
    }
    // 隠れ弱気: 価格が安値切り下げ、RSIが高値切り上げ（下降トレンド継続）
    if (priceAtEnd < priceStart && rsiAtEnd > rsiStart && currentRSI < 60) {
      score -= 1;
    }

    return {
      id: 'RSI',
      abbr: 'RSI',
      signal: this.getFilteredSignal(score)
    };
  }

  // 5. STO (Stochastic) - %K/%Dクロス + 80/20ゾーン【強化版】
  // 追加: ダブルボトム/トップ検出、ゾーン滞在時間、%K加速度、%K-%D乖離、フック検出
  analyzeSTO() {
    const sto = this.calculateStochastic(14, 3, 3);
    if (!sto || sto.length < 10) {
      return { id: 'STO', abbr: 'STO', signal: 'NEUTRAL' };
    }

    const current = sto[sto.length - 1];
    const prev = sto[sto.length - 2];
    const prev2 = sto[sto.length - 3];
    const prev3 = sto[sto.length - 4];
    const prev4 = sto[sto.length - 5];
    let score = 0;

    // === 強化1: %Kの加速度（モメンタム）===
    const kMomentum = current.k - prev.k;
    const prevKMomentum = prev.k - prev2.k;
    const isAccelerating = Math.sign(kMomentum) === Math.sign(prevKMomentum) && Math.abs(kMomentum) > Math.abs(prevKMomentum);
    const isDecelerating = Math.sign(kMomentum) === Math.sign(prevKMomentum) && Math.abs(kMomentum) < Math.abs(prevKMomentum);

    // === 強化2: %K-%D乖離幅 ===
    const kdGap = current.k - current.d;
    const prevKdGap = prev.k - prev.d;
    const gapExpanding = Math.abs(kdGap) > Math.abs(prevKdGap);

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (current.k < 50) score -= 2;
      if (current.k < 20) score -= 2;
      if (current.k < prev.k) score -= 1;
      if (kdGap < 0 && gapExpanding) score -= 1; // 乖離拡大
      return { id: 'STO', abbr: 'STO', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (current.k > 50) score += 2;
      if (current.k > 80) score += 2;
      if (current.k > prev.k) score += 1;
      if (kdGap > 0 && gapExpanding) score += 1; // 乖離拡大
      return { id: 'STO', abbr: 'STO', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 強化3: ゾーン滞在時間 ===
    let overboughtCount = 0;
    let oversoldCount = 0;
    for (let i = 0; i < 8; i++) {
      if (sto[sto.length - 1 - i].k > 80) overboughtCount++;
      if (sto[sto.length - 1 - i].k < 20) oversoldCount++;
    }

    // === 強化4: ダブルボトム/ダブルトップ検出 ===
    // 売られすぎゾーンでのダブルボトム（W字形）
    const recentKs = [prev4.k, prev3.k, prev2.k, prev.k, current.k];
    const minIdx = recentKs.indexOf(Math.min(...recentKs));
    const maxIdx = recentKs.indexOf(Math.max(...recentKs));

    // ダブルボトム: 安値→高値→安値→上昇
    const hasDoubleBottom = recentKs[0] < 30 && recentKs[2] < 30 && recentKs[1] > recentKs[0] && recentKs[1] > recentKs[2] && current.k > prev.k;
    // ダブルトップ: 高値→安値→高値→下落
    const hasDoubleTop = recentKs[0] > 70 && recentKs[2] > 70 && recentKs[1] < recentKs[0] && recentKs[1] < recentKs[2] && current.k < prev.k;

    if (hasDoubleBottom) {
      score += 3; // 強い買いシグナル
    }
    if (hasDoubleTop) {
      score -= 3; // 強い売りシグナル
    }

    // === 強化5: フック検出（反転の初動）===
    // 売られすぎからのフック（%Kが%Dを下回った後、上向きに転換）
    if (prev.k < prev.d && prev.k < 25 && current.k > prev.k && kMomentum > 2) {
      score += 2; // フックアップ
    }
    // 買われすぎからのフック
    if (prev.k > prev.d && prev.k > 75 && current.k < prev.k && kMomentum < -2) {
      score -= 2; // フックダウン
    }

    // %Kと%Dのクロス
    if (prev.k < prev.d && current.k > current.d) {
      score += 2;
      // クロスがゾーン内で発生した場合は強化
      if (current.k < 30) score += 1; // 売られすぎゾーンでのGC
    } else if (prev.k > prev.d && current.k < current.d) {
      score -= 2;
      if (current.k > 70) score -= 1; // 買われすぎゾーンでのDC
    }

    // 80/20ゾーン分析（滞在時間考慮）
    if (current.k > 80) {
      if (overboughtCount >= 4) {
        // 長期間買われすぎ → 反落リスク
        if (current.k < prev.k && isDecelerating) {
          score -= 3;
        } else {
          score -= 1;
        }
      } else {
        if (current.k > prev.k && isAccelerating) {
          score += 1;
        } else {
          score -= 1;
        }
      }
    } else if (current.k < 20) {
      if (oversoldCount >= 4) {
        // 長期間売られすぎ → 反発リスク
        if (current.k > prev.k && isDecelerating) {
          score += 3;
        } else {
          score += 1;
        }
      } else {
        if (current.k < prev.k && isAccelerating) {
          score -= 1;
        } else {
          score += 1;
        }
      }
    } else if (current.k > 50) {
      score += 1;
    } else {
      score -= 1;
    }

    // === 強化6: %K-%D乖離による確信度 ===
    if (kdGap > 10 && gapExpanding) {
      score += 1; // 強い上昇モメンタム
    } else if (kdGap < -10 && gapExpanding) {
      score -= 1; // 強い下降モメンタム
    }

    // %Kの傾き（加速考慮）
    if (kMomentum > 0) {
      score += 1;
      if (isAccelerating && kMomentum > 5) score += 1; // 急加速
    } else {
      score -= 1;
      if (isAccelerating && kMomentum < -5) score -= 1; // 急減速
    }

    return {
      id: 'STO',
      abbr: 'STO',
      signal: this.getFilteredSignal(score)
    };
  }

  // 12. CCI - ゼロラインクロス + ±100/±200ゾーン【強化版】
  // 追加: ±200極端ゾーン、ゾーン滞在時間、ゼロライン振動検出、ダイバージェンス、モメンタム
  analyzeCCI() {
    const cci = this.calculateCCIArray(20);
    if (cci.length < 10) {
      return { id: 'CCI', abbr: 'CCI', signal: 'NEUTRAL' };
    }

    const currentCCI = cci[cci.length - 1];
    const prevCCI = cci[cci.length - 2];
    const prev2CCI = cci[cci.length - 3];
    const prev3CCI = cci[cci.length - 4];
    const prev5CCI = cci[cci.length - 6];
    let score = 0;

    // === 強化1: CCIモメンタム（変化速度）===
    const cciMomentum = currentCCI - prevCCI;
    const prevMomentum = prevCCI - prev2CCI;
    const isAccelerating = Math.abs(cciMomentum) > Math.abs(prevMomentum);

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentCCI < 0) score -= 2;
      if (currentCCI < -100) score -= 2;
      if (currentCCI < -200) score -= 1; // 極端ゾーンでも継続
      if (currentCCI < prevCCI) score -= 1;
      if (isAccelerating && cciMomentum < 0) score -= 1;
      return { id: 'CCI', abbr: 'CCI', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentCCI > 0) score += 2;
      if (currentCCI > 100) score += 2;
      if (currentCCI > 200) score += 1; // 極端ゾーンでも継続
      if (currentCCI > prevCCI) score += 1;
      if (isAccelerating && cciMomentum > 0) score += 1;
      return { id: 'CCI', abbr: 'CCI', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 基本: ゼロラインクロス ===
    if (prevCCI < 0 && currentCCI > 0) {
      score += 2;
    } else if (prevCCI > 0 && currentCCI < 0) {
      score -= 2;
    }

    // === 強化2: ±200極端ゾーン（反転可能性高）===
    if (currentCCI > 200) {
      if (currentCCI > prevCCI && isAccelerating) {
        score += 1; // まだ上昇継続
      } else if (currentCCI < prevCCI) {
        score -= 2; // 極端ゾーンから反落 → 強い売りシグナル
      }
    } else if (currentCCI < -200) {
      if (currentCCI < prevCCI && isAccelerating) {
        score -= 1; // まだ下落継続
      } else if (currentCCI > prevCCI) {
        score += 2; // 極端ゾーンから反発 → 強い買いシグナル
      }
    }
    // ±100ゾーン分析
    else if (currentCCI > 100) {
      if (currentCCI > prevCCI) {
        score += 2;
      } else {
        score -= 1; // 反落開始
      }
    } else if (currentCCI < -100) {
      if (currentCCI < prevCCI) {
        score -= 2;
      } else {
        score += 1; // 反発開始
      }
    } else if (currentCCI > 0) {
      score += 1;
    } else {
      score -= 1;
    }

    // === 強化3: ゾーン滞在時間 ===
    let overBoughtCount = 0;
    let overSoldCount = 0;
    for (let i = 1; i <= 5; i++) {
      const val = cci[cci.length - i];
      if (val > 100) overBoughtCount++;
      if (val < -100) overSoldCount++;
    }

    if (overBoughtCount >= 4 && currentCCI < prevCCI) {
      score -= 2; // 長期過熱後の反落 → 強い売りシグナル
    } else if (overSoldCount >= 4 && currentCCI > prevCCI) {
      score += 2; // 長期過売後の反発 → 強い買いシグナル
    }

    // === 強化4: ゼロライン振動検出（方向感なし）===
    let zeroLineCrosses = 0;
    for (let i = 1; i < 5; i++) {
      const curr = cci[cci.length - i];
      const prev = cci[cci.length - i - 1];
      if ((curr > 0 && prev < 0) || (curr < 0 && prev > 0)) {
        zeroLineCrosses++;
      }
    }

    if (zeroLineCrosses >= 2) {
      // 頻繁なゼロラインクロス → 方向感弱い
      score = Math.round(score * 0.5);
    }

    // === 強化5: CCIダイバージェンス ===
    if (this.candles.length >= 10) {
      const prices = this.candles.slice(-10).map(c => c.close);
      const cciSlice = cci.slice(-10);

      const priceHighIdx = prices.indexOf(Math.max(...prices));
      const priceLowIdx = prices.indexOf(Math.min(...prices));
      const cciHighIdx = cciSlice.indexOf(Math.max(...cciSlice));
      const cciLowIdx = cciSlice.indexOf(Math.min(...cciSlice));

      // 弱気ダイバージェンス: 価格高値更新、CCI高値切り下げ
      if (priceHighIdx > 5 && cciHighIdx < 5 && prices[priceHighIdx] > prices[cciHighIdx]) {
        score -= 1;
      }
      // 強気ダイバージェンス: 価格安値更新、CCI安値切り上げ
      if (priceLowIdx > 5 && cciLowIdx < 5 && prices[priceLowIdx] < prices[cciLowIdx]) {
        score += 1;
      }
    }

    // === 強化6: トレンドライン（傾き）+ 加速 ===
    if (currentCCI > prevCCI && prevCCI > prev3CCI) {
      score += 1;
      if (isAccelerating) score += 1; // 加速上昇
    } else if (currentCCI < prevCCI && prevCCI < prev3CCI) {
      score -= 1;
      if (isAccelerating) score -= 1; // 加速下落
    }

    return {
      id: 'CCI',
      abbr: 'CCI',
      signal: this.getFilteredSignal(score)
    };
  }

  // 13. MOM (Momentum) - ゼロライン + 加速/減速【強化版】
  // 追加: ゼロラインクロス確認、モメンタム発散/収束、ゾーン滞在時間、ダイバージェンス
  analyzeMOM() {
    const mom = this.calculateMomentumArray(10);
    if (mom.length < 10) {
      return { id: 'MOM', abbr: 'MOM', signal: 'NEUTRAL' };
    }

    const currentMom = mom[mom.length - 1];
    const prevMom = mom[mom.length - 2];
    const prev2Mom = mom[mom.length - 3];
    const prev3Mom = mom[mom.length - 4];
    const prev5Mom = mom[mom.length - 6];
    let score = 0;

    // === 強化1: モメンタムの変化速度 ===
    const momVelocity = currentMom - prevMom;
    const prevVelocity = prevMom - prev2Mom;
    const isAccelerating = Math.abs(momVelocity) > Math.abs(prevVelocity);

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentMom < 0) score -= 2;
      if (currentMom < prevMom) score -= 2;
      if (isAccelerating && momVelocity < 0) score -= 1;
      return { id: 'MOM', abbr: 'MOM', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentMom > 0) score += 2;
      if (currentMom > prevMom) score += 2;
      if (isAccelerating && momVelocity > 0) score += 1;
      return { id: 'MOM', abbr: 'MOM', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 基本: ゼロライン上下 ===
    if (currentMom > 0) {
      score += 2;
    } else {
      score -= 2;
    }

    // === 強化2: ゼロラインクロス確認 ===
    if (prevMom < 0 && currentMom > 0) {
      score += 2; // ゼロライン上抜け
      if (prev2Mom < 0) score += 1; // 確認済み
    } else if (prevMom > 0 && currentMom < 0) {
      score -= 2; // ゼロライン下抜け
      if (prev2Mom > 0) score -= 1; // 確認済み
    }

    // === 強化3: 加速/減速 + 変化速度 ===
    if (currentMom > 0) {
      if (currentMom > prevMom) {
        score += 2; // 加速上昇
        if (isAccelerating) score += 1; // さらに加速
      } else {
        score -= 1; // 減速
        if (isAccelerating && momVelocity < 0) score -= 1; // 急減速
      }
    } else {
      if (currentMom < prevMom) {
        score -= 2; // 加速下落
        if (isAccelerating) score -= 1; // さらに加速
      } else {
        score += 1; // 減速
        if (isAccelerating && momVelocity > 0) score += 1; // 急減速
      }
    }

    // === 強化4: モメンタム発散/収束パターン ===
    const momMA5 = mom.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const momMA10 = mom.slice(-10).reduce((a, b) => a + b, 0) / 10;

    if (momMA5 > momMA10 && currentMom > momMA5) {
      score += 1; // 発散（上昇トレンド強化）
    } else if (momMA5 < momMA10 && currentMom < momMA5) {
      score -= 1; // 発散（下降トレンド強化）
    } else if (Math.abs(momMA5 - momMA10) < Math.abs(prev5Mom) * 0.1) {
      // 収束 → 方向感弱い
      score = Math.round(score * 0.7);
    }

    // === 強化5: ゾーン滞在時間 ===
    let positiveCount = 0;
    let negativeCount = 0;
    for (let i = 1; i <= 5; i++) {
      if (mom[mom.length - i] > 0) positiveCount++;
      else negativeCount++;
    }

    if (positiveCount >= 4 && currentMom < prevMom) {
      score -= 1; // 長期プラス後の減速 → 反転警戒
    } else if (negativeCount >= 4 && currentMom > prevMom) {
      score += 1; // 長期マイナス後の回復 → 反転シグナル
    }

    // === 強化6: ピーク/ボトム検出（改良版）===
    if (prevMom > prev2Mom && prevMom > prev3Mom && prevMom > currentMom) {
      if (currentMom > 0) {
        score -= 2; // プラス圏でのピーク → 強い売りシグナル
      }
    } else if (prevMom < prev2Mom && prevMom < prev3Mom && prevMom < currentMom) {
      if (currentMom < 0) {
        score += 2; // マイナス圏でのボトム → 強い買いシグナル
      }
    }

    // === 強化7: モメンタムダイバージェンス ===
    if (this.candles.length >= 10) {
      const prices = this.candles.slice(-10).map(c => c.close);
      const momSlice = mom.slice(-10);

      // 価格高値更新、モメンタム高値切り下げ = 弱気ダイバージェンス
      const priceMax = Math.max(...prices);
      const momMax = Math.max(...momSlice);
      const priceMaxIdx = prices.indexOf(priceMax);
      const momMaxIdx = momSlice.indexOf(momMax);

      if (priceMaxIdx > 5 && momMaxIdx < 5) {
        score -= 1; // 弱気ダイバージェンス
      }

      // 価格安値更新、モメンタム安値切り上げ = 強気ダイバージェンス
      const priceMin = Math.min(...prices);
      const momMin = Math.min(...momSlice);
      const priceMinIdx = prices.indexOf(priceMin);
      const momMinIdx = momSlice.indexOf(momMin);

      if (priceMinIdx > 5 && momMinIdx < 5) {
        score += 1; // 強気ダイバージェンス
      }
    }

    return {
      id: 'MOM',
      abbr: 'MOM',
      signal: this.getFilteredSignal(score)
    };
  }

  // 14. WPR (Williams %R) - -20/-80ゾーン + 反転シグナル【強化版】
  // 追加: フェイルスイング、ゾーン滞在時間、-50ラインクロス、ダイバージェンス、モメンタム
  analyzeWPR() {
    const wpr = this.calculateWilliamsRArray(14);
    if (wpr.length < 10) {
      return { id: 'WPR', abbr: 'WPR', signal: 'NEUTRAL' };
    }

    const currentWPR = wpr[wpr.length - 1];
    const prevWPR = wpr[wpr.length - 2];
    const prev2WPR = wpr[wpr.length - 3];
    const prev3WPR = wpr[wpr.length - 4];
    let score = 0;

    // === 強化1: WPRモメンタム ===
    const wprVelocity = currentWPR - prevWPR;
    const prevVelocity = prevWPR - prev2WPR;
    const isAccelerating = Math.abs(wprVelocity) > Math.abs(prevVelocity);

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentWPR < -50) score -= 2;
      if (currentWPR < -80) score -= 2;
      if (currentWPR < prevWPR) score -= 1;
      if (isAccelerating && wprVelocity < 0) score -= 1;
      return { id: 'WPR', abbr: 'WPR', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentWPR > -50) score += 2;
      if (currentWPR > -20) score += 2;
      if (currentWPR > prevWPR) score += 1;
      if (isAccelerating && wprVelocity > 0) score += 1;
      return { id: 'WPR', abbr: 'WPR', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 基本: ゾーン分析（Williams %Rは0～-100の範囲）===
    if (currentWPR > -20) {
      // 買われすぎゾーン
      if (currentWPR < prevWPR) {
        score -= 2;
      } else {
        score += 1;
      }
    } else if (currentWPR < -80) {
      // 売られすぎゾーン
      if (currentWPR > prevWPR) {
        score += 2;
      } else {
        score -= 1;
      }
    } else if (currentWPR > -50) {
      score += 1;
    } else {
      score -= 1;
    }

    // === 強化2: フェイルスイング（重要な反転パターン）===
    // 強気フェイルスイング: -80以下 → 上昇 → -80以下に戻らず → 直近高値超え
    let recentLows = [];
    let recentHighs = [];
    for (let i = 1; i <= 7; i++) {
      const val = wpr[wpr.length - i];
      if (i > 1) {
        const prevVal = wpr[wpr.length - i + 1];
        const nextVal = wpr[wpr.length - i - 1] || val;
        if (val < prevVal && val < nextVal) recentLows.push({ idx: i, val });
        if (val > prevVal && val > nextVal) recentHighs.push({ idx: i, val });
      }
    }

    // 強気フェイルスイング検出
    if (recentLows.length >= 2) {
      const [low1, low2] = recentLows.slice(0, 2);
      if (low2.val < -80 && low1.val > low2.val && low1.val > -80) {
        // 2番底が切り上げ、かつ-80ゾーン脱出
        if (currentWPR > prevWPR) {
          score += 3; // 強気フェイルスイング
        }
      }
    }

    // 弱気フェイルスイング検出
    if (recentHighs.length >= 2) {
      const [high1, high2] = recentHighs.slice(0, 2);
      if (high2.val > -20 && high1.val < high2.val && high1.val < -20) {
        // 2番天井が切り下げ、かつ-20ゾーン脱出
        if (currentWPR < prevWPR) {
          score -= 3; // 弱気フェイルスイング
        }
      }
    }

    // === 強化3: ゾーン滞在時間 ===
    let overBoughtCount = 0;
    let overSoldCount = 0;
    for (let i = 1; i <= 5; i++) {
      const val = wpr[wpr.length - i];
      if (val > -20) overBoughtCount++;
      if (val < -80) overSoldCount++;
    }

    if (overBoughtCount >= 4 && currentWPR < prevWPR) {
      score -= 2; // 長期過熱後の反落 → 強い売りシグナル
    } else if (overSoldCount >= 4 && currentWPR > prevWPR) {
      score += 2; // 長期過売後の反発 → 強い買いシグナル
    }

    // === 強化4: -50ラインクロス ===
    if (prevWPR < -50 && currentWPR > -50) {
      score += 1; // -50上抜け
    } else if (prevWPR > -50 && currentWPR < -50) {
      score -= 1; // -50下抜け
    }

    // === 強化5: 傾き + 加速 ===
    if (currentWPR > prevWPR) {
      score += 1;
      if (isAccelerating && wprVelocity > 0) score += 1;
    } else {
      score -= 1;
      if (isAccelerating && wprVelocity < 0) score -= 1;
    }

    // === 強化6: WPRダイバージェンス ===
    if (this.candles.length >= 10) {
      const prices = this.candles.slice(-10).map(c => c.close);
      const wprSlice = wpr.slice(-10);

      const priceMaxIdx = prices.indexOf(Math.max(...prices));
      const wprMaxIdx = wprSlice.indexOf(Math.max(...wprSlice));

      // 弱気ダイバージェンス
      if (priceMaxIdx > 5 && wprMaxIdx < 5) {
        score -= 1;
      }

      const priceMinIdx = prices.indexOf(Math.min(...prices));
      const wprMinIdx = wprSlice.indexOf(Math.min(...wprSlice));

      // 強気ダイバージェンス
      if (priceMinIdx > 5 && wprMinIdx < 5) {
        score += 1;
      }
    }

    return {
      id: 'WPR',
      abbr: 'WPR',
      signal: this.getFilteredSignal(score)
    };
  }

  // 16. DEM (DeMarker) - 0.5ライン + 0.7/0.3ゾーン【強化版】
  // 追加: 持続時間、0.5ラインクロス、極端ゾーン滞在、方向転換検出、ダイバージェンス
  analyzeDEM() {
    const dem = this.calculateDeMarkerArray(14);
    if (dem.length < 10) {
      return { id: 'DEM', abbr: 'DEM', signal: 'NEUTRAL' };
    }

    const currentDEM = dem[dem.length - 1];
    const prevDEM = dem[dem.length - 2];
    const prev2DEM = dem[dem.length - 3];
    const prev3DEM = dem[dem.length - 4];
    let score = 0;

    // === 強化1: DEMモメンタム ===
    const demVelocity = currentDEM - prevDEM;
    const prevVelocity = prevDEM - prev2DEM;
    const isAccelerating = Math.abs(demVelocity) > Math.abs(prevVelocity);

    // 強いトレンドモード時はトレンドフォローのみ
    if (this.trendMode === 'STRONG_DOWN') {
      if (currentDEM < 0.5) score -= 2;
      if (currentDEM < 0.3) score -= 2;
      if (currentDEM < prevDEM) score -= 1;
      if (isAccelerating && demVelocity < 0) score -= 1;
      return { id: 'DEM', abbr: 'DEM', signal: score < 0 ? 'LOW' : 'NEUTRAL' };
    } else if (this.trendMode === 'STRONG_UP') {
      if (currentDEM > 0.5) score += 2;
      if (currentDEM > 0.7) score += 2;
      if (currentDEM > prevDEM) score += 1;
      if (isAccelerating && demVelocity > 0) score += 1;
      return { id: 'DEM', abbr: 'DEM', signal: score > 0 ? 'HIGH' : 'NEUTRAL' };
    }

    // === 通常モード ===

    // === 基本: 0.5ライン上下 ===
    if (currentDEM > 0.5) {
      score += 1;
    } else {
      score -= 1;
    }

    // === 強化2: 0.5ラインクロス確認 ===
    if (prevDEM < 0.5 && currentDEM > 0.5) {
      score += 2; // 0.5上抜け
      if (prev2DEM < 0.5) score += 1; // 確認済み
    } else if (prevDEM > 0.5 && currentDEM < 0.5) {
      score -= 2; // 0.5下抜け
      if (prev2DEM > 0.5) score -= 1; // 確認済み
    }

    // === 強化3: 極端ゾーン + 持続時間 ===
    let highZoneCount = 0;
    let lowZoneCount = 0;
    for (let i = 1; i <= 5; i++) {
      const val = dem[dem.length - i];
      if (val > 0.7) highZoneCount++;
      if (val < 0.3) lowZoneCount++;
    }

    if (currentDEM > 0.7) {
      if (highZoneCount >= 3) {
        // 長期過熱 → 反転リスク高
        if (currentDEM < prevDEM) {
          score -= 3; // 長期過熱後の反落
        }
      } else {
        if (currentDEM < prevDEM) {
          score -= 2;
        } else {
          score += 1;
        }
      }
    } else if (currentDEM < 0.3) {
      if (lowZoneCount >= 3) {
        // 長期過売 → 反発リスク高
        if (currentDEM > prevDEM) {
          score += 3; // 長期過売後の反発
        }
      } else {
        if (currentDEM > prevDEM) {
          score += 2;
        } else {
          score -= 1;
        }
      }
    }

    // === 強化4: 方向転換検出（ピーク/ボトム）===
    if (prevDEM > prev2DEM && prevDEM > prev3DEM && prevDEM > currentDEM) {
      // ピーク形成
      if (prevDEM > 0.6) {
        score -= 2; // 高値圏でのピーク → 売りシグナル
      }
    } else if (prevDEM < prev2DEM && prevDEM < prev3DEM && prevDEM < currentDEM) {
      // ボトム形成
      if (prevDEM < 0.4) {
        score += 2; // 安値圏でのボトム → 買いシグナル
      }
    }

    // === 強化5: 傾き + 加速 ===
    if (currentDEM > prevDEM) {
      score += 1;
      if (isAccelerating && demVelocity > 0) score += 1;
    } else {
      score -= 1;
      if (isAccelerating && demVelocity < 0) score -= 1;
    }

    // === 強化6: DEM MA平滑化 ===
    const demMA5 = dem.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const demMA10 = dem.slice(-10).reduce((a, b) => a + b, 0) / 10;

    if (demMA5 > demMA10 && currentDEM > demMA5) {
      score += 1; // 上昇トレンド確認
    } else if (demMA5 < demMA10 && currentDEM < demMA5) {
      score -= 1; // 下降トレンド確認
    }

    // === 強化7: DEMダイバージェンス ===
    if (this.candles.length >= 10) {
      const prices = this.candles.slice(-10).map(c => c.close);
      const demSlice = dem.slice(-10);

      const priceMaxIdx = prices.indexOf(Math.max(...prices));
      const demMaxIdx = demSlice.indexOf(Math.max(...demSlice));

      // 弱気ダイバージェンス
      if (priceMaxIdx > 5 && demMaxIdx < 5) {
        score -= 1;
      }

      const priceMinIdx = prices.indexOf(Math.min(...prices));
      const demMinIdx = demSlice.indexOf(Math.min(...demSlice));

      // 強気ダイバージェンス
      if (priceMinIdx > 5 && demMinIdx < 5) {
        score += 1;
      }
    }

    return {
      id: 'DEM',
      abbr: 'DEM',
      signal: this.getFilteredSignal(score)
    };
  }

  // ========================================
  // ボラティリティ系インジケーター (4個)
  // ========================================

  // 7. ATR - ボラティリティ変化 + 価格変動との組み合わせ【強化版】
  // 追加: スクイーズ/拡大検出、ATRブレイクアウト、トレンド強度補正、変化率分析
  analyzeATR() {
    const atr = this.calculateATRArray(14);
    if (atr.length < 15) {
      return { id: 'ATR', abbr: 'ATR', signal: 'NEUTRAL' };
    }

    const currentATR = atr[atr.length - 1];
    const prevATR = atr[atr.length - 2];
    const prev3ATR = atr[atr.length - 4];
    const prev5ATR = atr[atr.length - 6];
    const avgATR = atr.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const avgATR20 = atr.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, atr.length);

    // 直近の価格変動
    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 2].close;
    const prev5Price = this.candles[this.candles.length - 6].close;
    const priceDirection = currentPrice > prev5Price ? 1 : -1;
    const priceChange = Math.abs(currentPrice - prevPrice);

    let score = 0;

    // === 強化1: スクイーズ検出（ボラティリティ収縮）===
    const atrRatio = currentATR / avgATR20;
    const isSqueezing = atrRatio < 0.7; // ATRが長期平均の70%以下
    const isExpanding = atrRatio > 1.3; // ATRが長期平均の130%以上

    if (isSqueezing) {
      // スクイーズ中 → ブレイクアウト待ち、シグナル抑制
      score = Math.round(priceDirection * 0.5);
    }

    // === 強化2: ATR拡大 + 価格方向 ===
    if (isExpanding) {
      // ボラティリティ急拡大 → トレンド発生
      score = priceDirection * 3;

      // さらに拡大中か確認
      if (currentATR > prevATR && prevATR > prev3ATR) {
        score = score > 0 ? score + 1 : score - 1;
      }
    }

    // === 強化3: ATR変化率分析 ===
    const atrChangeRate = (currentATR - prev5ATR) / prev5ATR;

    if (!isSqueezing && !isExpanding) {
      if (atrChangeRate > 0.2) {
        // ATR 20%以上増加 → トレンド強化
        score = priceDirection * 2;
      } else if (atrChangeRate < -0.2) {
        // ATR 20%以上減少 → トレンド終息の可能性
        score = priceDirection * 1;
      } else {
        score = priceDirection * 1;
      }
    }

    // === 強化4: 価格変動とATRの関係 ===
    const priceToATR = priceChange / currentATR;

    if (priceToATR > 1.5) {
      // 価格変動がATRの1.5倍以上 → 強い動き
      score = score > 0 ? score + 2 : score - 2;
    } else if (priceToATR > 1.0) {
      // 価格変動がATR以上 → 正常な動き強化
      score = score > 0 ? score + 1 : score - 1;
    } else if (priceToATR < 0.3) {
      // 価格変動がATRの30%未満 → 方向感弱い
      score = Math.round(score * 0.7);
    }

    // === 強化5: ATRトレンド（傾き）===
    const atrSlope = (currentATR - prev3ATR) / prev3ATR;

    if (atrSlope > 0.1 && score !== 0) {
      // ATR上昇中 → トレンド継続
      score = score > 0 ? score + 1 : score - 1;
    } else if (atrSlope < -0.15 && Math.abs(score) > 1) {
      // ATR下降中 → トレンド終息警告
      score = Math.round(score * 0.8);
    }

    // === 強化6: スクイーズからのブレイクアウト検出 ===
    // 直前がスクイーズで現在拡大中
    const prev3Ratio = prev3ATR / avgATR20;
    const wasSqueezing = prev3Ratio < 0.75;

    if (wasSqueezing && currentATR > prev3ATR * 1.2) {
      // スクイーズからのブレイクアウト → 強いシグナル
      score = priceDirection * 4;
    }

    return {
      id: 'ATR',
      abbr: 'ATR',
      signal: this.getFilteredSignal(score)
    };
  }

  // 8. ADX - トレンド強度 + +DI/-DIクロス【強化版】
  // 追加: DIクロス確認、ADXピーク検出、トレンド成熟度、DI乖離率
  analyzeADX() {
    const adxData = this.calculateADXFullExtended(14);
    if (!adxData || !adxData.history || adxData.history.length < 5) {
      return { id: 'ADX', abbr: 'ADX', signal: 'NEUTRAL' };
    }

    const hist = adxData.history;
    const currentADX = adxData.adx;
    const prevADX = hist[hist.length - 2].adx;
    const prev3ADX = hist[hist.length - 4].adx;
    let score = 0;

    // === 基本: +DIと-DIの位置関係 ===
    const diGap = adxData.plusDI - adxData.minusDI;
    if (diGap > 0) {
      score += 2; // 上昇トレンド
    } else {
      score -= 2; // 下降トレンド
    }

    // === 強化1: DIクロス検出と確認 ===
    const prevPlusDI = hist[hist.length - 2].plusDI;
    const prevMinusDI = hist[hist.length - 2].minusDI;
    const prev2PlusDI = hist[hist.length - 3].plusDI;
    const prev2MinusDI = hist[hist.length - 3].minusDI;

    // ゴールデンクロス（+DIが-DIを上抜け）
    if (prevPlusDI < prevMinusDI && adxData.plusDI > adxData.minusDI) {
      score += 3; // DIクロス発生
      if (currentADX > 20) score += 1; // ADXが十分な強度
    }
    // デッドクロス（+DIが-DIを下抜け）
    else if (prevPlusDI > prevMinusDI && adxData.plusDI < adxData.minusDI) {
      score -= 3;
      if (currentADX > 20) score -= 1;
    }

    // クロス後の確認（2期間維持）
    if (prev2PlusDI < prev2MinusDI && prevPlusDI > prevMinusDI && adxData.plusDI > adxData.minusDI) {
      score += 1; // 確認済みゴールデンクロス
    } else if (prev2PlusDI > prev2MinusDI && prevPlusDI < prevMinusDI && adxData.plusDI < adxData.minusDI) {
      score -= 1; // 確認済みデッドクロス
    }

    // === 強化2: ADX値によるトレンド強度（段階的）===
    if (currentADX > 40) {
      // 非常に強いトレンド
      score = score > 0 ? score + 3 : score - 3;
    } else if (currentADX > 30) {
      // 強いトレンド
      score = score > 0 ? score + 2 : score - 2;
    } else if (currentADX > 25) {
      // トレンドあり
      score = score > 0 ? score + 1 : score - 1;
    } else if (currentADX < 20) {
      // トレンドなし/弱い → 信頼性低下
      score = Math.round(score * 0.5);
    }

    // === 強化3: ADXピーク検出（トレンド転換警告）===
    if (prevADX > prev3ADX && prevADX > currentADX && prevADX > 30) {
      // ADXピーク形成 → トレンド弱化の兆候
      score = Math.round(score * 0.7);
    }

    // ADXボトム検出（新トレンド開始の可能性）
    if (prevADX < prev3ADX && prevADX < currentADX && prevADX < 20) {
      // ADXボトムから上昇開始
      score = score > 0 ? score + 1 : score - 1;
    }

    // === 強化4: ADXの傾き（トレンド強度変化）===
    const adxSlope = currentADX - prevADX;
    const prevSlope = prevADX - prev3ADX;

    if (adxSlope > 0 && prevSlope > 0) {
      // ADX継続上昇 → トレンド強化中
      score = score > 0 ? score + 1 : score - 1;
    } else if (adxSlope < 0 && currentADX > 25) {
      // ADX下降中（まだトレンドは強い）→ 終息警告
      score = Math.round(score * 0.85);
    }

    // === 強化5: DI乖離率（トレンド強度の補助指標）===
    const diGapRatio = Math.abs(diGap) / (adxData.plusDI + adxData.minusDI) * 100;

    if (diGapRatio > 30 && currentADX > 25) {
      // DIが大きく乖離 + ADXが強い → トレンド確実
      score = score > 0 ? score + 1 : score - 1;
    } else if (diGapRatio < 10) {
      // DIがほぼ同値 → 方向感不明
      score = Math.round(score * 0.6);
    }

    // === 強化6: トレンド成熟度（ADX高値圏滞在時間）===
    let highADXCount = 0;
    for (let i = 1; i <= 5 && i < hist.length; i++) {
      if (hist[hist.length - i].adx > 25) highADXCount++;
    }

    if (highADXCount >= 4 && adxSlope < 0) {
      // 長期トレンド後の弱化 → 反転リスク
      score = Math.round(score * 0.75);
    }

    return {
      id: 'ADX',
      abbr: 'ADX',
      signal: this.getFilteredSignal(score)
    };
  }

  // 11. SDV (Standard Deviation) - ボラティリティ変化
  analyzeSDV() {
    const sdv = this.calculateStdDevArray(20);
    if (sdv.length < 10) {
      return { id: 'SDV', abbr: 'SDV', signal: 'NEUTRAL' };
    }

    const currentSDV = sdv[sdv.length - 1];
    const avgSDV = sdv.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const prevSDV = sdv[sdv.length - 5];

    // 価格方向
    const currentPrice = this.candles[this.candles.length - 1].close;
    const prevPrice = this.candles[this.candles.length - 5].close;
    const priceDirection = currentPrice > prevPrice ? 1 : -1;

    let score = 0;

    // ボラティリティ急増 = ブレイクアウト
    if (currentSDV > avgSDV * 1.5) {
      score = priceDirection * 3;
    } else if (currentSDV > prevSDV) {
      score = priceDirection * 1;
    } else {
      // ボラティリティ低下中は現在の方向を維持
      score = priceDirection * 1;
    }

    return {
      id: 'SDV',
      abbr: 'SDV',
      signal: this.getFilteredSignal(score)
    };
  }

  // 18. FRA (Fractals) - フラクタルブレイクアウト
  analyzeFRA() {
    const fractals = this.detectFractals();
    if (!fractals) {
      return { id: 'FRA', abbr: 'FRA', signal: 'NEUTRAL' };
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    let score = 0;

    // 直近のフラクタル高値/安値との比較
    if (fractals.lastHigh && currentPrice > fractals.lastHigh) {
      score += 3; // 高値ブレイクアウト
    } else if (fractals.lastLow && currentPrice < fractals.lastLow) {
      score -= 3; // 安値ブレイクアウト
    }

    // 価格位置
    if (fractals.lastHigh && fractals.lastLow) {
      const mid = (fractals.lastHigh + fractals.lastLow) / 2;
      if (currentPrice > mid) {
        score += 1;
      } else {
        score -= 1;
      }
    }

    return {
      id: 'FRA',
      abbr: 'FRA',
      signal: this.getFilteredSignal(score)
    };
  }

  // ========================================
  // 出来高系インジケーター (3個)
  // ========================================

  // 15. FRX (Force Index) - ゼロライン + 勢い
  analyzeFRX() {
    const frx = this.calculateForceIndexArray(13);
    if (frx.length < 5) {
      return { id: 'FRX', abbr: 'FRX', signal: 'NEUTRAL' };
    }

    const currentFRX = frx[frx.length - 1];
    const prevFRX = frx[frx.length - 2];
    let score = 0;

    // ゼロライン上下
    if (currentFRX > 0) {
      score += 2;
    } else {
      score -= 2;
    }

    // 傾き
    if (currentFRX > prevFRX) {
      score += 1;
    } else {
      score -= 1;
    }

    // 強さ（絶対値）
    const avgFRX = frx.slice(-10).reduce((a, b) => a + Math.abs(b), 0) / 10;
    if (Math.abs(currentFRX) > avgFRX * 1.5) {
      score = score > 0 ? score + 1 : score - 1;
    }

    return {
      id: 'FRX',
      abbr: 'FRX',
      signal: this.getFilteredSignal(score)
    };
  }

  // 19. ACD (Accumulation/Distribution) - 傾き + ダイバージェンス
  analyzeACD() {
    const acd = this.calculateADLineArray();
    if (acd.length < 10) {
      return { id: 'ACD', abbr: 'ACD', signal: 'NEUTRAL' };
    }

    const currentACD = acd[acd.length - 1];
    const prevACD = acd[acd.length - 5];
    let score = 0;

    // A/Dラインの傾き
    if (currentACD > prevACD) {
      score += 2; // 買い圧力優勢
    } else {
      score -= 2; // 売り圧力優勢
    }

    // ダイバージェンス検出
    const prices = this.candles.slice(-10).map(c => c.close);
    const priceTrend = prices[prices.length - 1] - prices[0];
    const acdTrend = currentACD - acd[acd.length - 10];

    if (priceTrend > 0 && acdTrend < 0) {
      score -= 2; // 弱気ダイバージェンス
    } else if (priceTrend < 0 && acdTrend > 0) {
      score += 2; // 強気ダイバージェンス
    }

    return {
      id: 'ACD',
      abbr: 'ACD',
      signal: this.getFilteredSignal(score)
    };
  }

  // 20. OBV - 傾き + ダイバージェンス
  analyzeOBV() {
    const obv = this.calculateOBVArray();
    if (obv.length < 10) {
      return { id: 'OBV', abbr: 'OBV', signal: 'NEUTRAL' };
    }

    const currentOBV = obv[obv.length - 1];
    const prevOBV = obv[obv.length - 5];
    const prev10OBV = obv[obv.length - 10];
    let score = 0;

    // OBVの傾き
    if (currentOBV > prevOBV) {
      score += 2;
    } else {
      score -= 2;
    }

    // OBV移動平均との関係
    const obvSMA = obv.slice(-10).reduce((a, b) => a + b, 0) / 10;
    if (currentOBV > obvSMA) {
      score += 1;
    } else {
      score -= 1;
    }

    // ダイバージェンス
    const prices = this.candles.slice(-10).map(c => c.close);
    const priceTrend = prices[prices.length - 1] - prices[0];
    const obvTrend = currentOBV - prev10OBV;

    if (priceTrend > 0 && obvTrend < 0) {
      score -= 2;
    } else if (priceTrend < 0 && obvTrend > 0) {
      score += 2;
    }

    return {
      id: 'OBV',
      abbr: 'OBV',
      signal: this.getFilteredSignal(score)
    };
  }

  // ========================================
  // 計算ヘルパー関数
  // ========================================

  // EMA配列計算
  calculateEMAArray(period) {
    if (this.candles.length < period) return [];

    const k = 2 / (period + 1);
    const emaArray = [];
    let ema = this.candles[0].close;

    for (let i = 0; i < this.candles.length; i++) {
      if (i === 0) {
        ema = this.candles[i].close;
      } else {
        ema = this.candles[i].close * k + ema * (1 - k);
      }
      if (i >= period - 1) {
        emaArray.push(ema);
      }
    }

    return emaArray;
  }

  // SMA計算
  calculateSMA(period, endIndex = null) {
    const end = endIndex !== null ? endIndex : this.candles.length;
    if (end < period) return null;

    let sum = 0;
    for (let i = end - period; i < end; i++) {
      sum += this.candles[i].close;
    }
    return sum / period;
  }

  // ボリンジャーバンド配列計算
  calculateBollingerBandsArray(period, stdDev) {
    if (this.candles.length < period) return [];

    const result = [];

    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      const sma = sum / period;

      const squaredDiffs = slice.map(c => Math.pow(c.close - sma, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b) / period;
      const sd = Math.sqrt(variance);

      result.push({
        upper: sma + (sd * stdDev),
        middle: sma,
        lower: sma - (sd * stdDev)
      });
    }

    return result;
  }

  // MACD配列計算
  calculateMACDArray() {
    const ema12 = this.calculateEMAArray(12);
    const ema26 = this.calculateEMAArray(26);

    if (ema12.length < 9 || ema26.length < 9) return [];

    const macdLine = [];
    const offset = ema12.length - ema26.length;

    for (let i = 0; i < ema26.length; i++) {
      macdLine.push(ema12[i + offset] - ema26[i]);
    }

    // シグナルライン（MACD の9期間EMA）
    const signalLine = [];
    const k = 2 / 10;
    let signal = macdLine[0];

    for (let i = 0; i < macdLine.length; i++) {
      signal = macdLine[i] * k + signal * (1 - k);
      if (i >= 8) {
        signalLine.push(signal);
      }
    }

    // 結果を組み立て
    const result = [];
    const signalOffset = macdLine.length - signalLine.length;

    for (let i = 0; i < signalLine.length; i++) {
      const macd = macdLine[i + signalOffset];
      const sig = signalLine[i];
      result.push({
        macd: macd,
        signal: sig,
        histogram: macd - sig
      });
    }

    return result;
  }

  // RSI配列計算
  calculateRSIArray(period) {
    if (this.candles.length < period + 1) return [];

    const result = [];
    let gains = 0;
    let losses = 0;

    // 最初の期間
    for (let i = 1; i <= period; i++) {
      const change = this.candles[i].close - this.candles[i - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period; i < this.candles.length; i++) {
      if (i > period) {
        const change = this.candles[i].close - this.candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
      }

      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
    }

    return result;
  }

  // ストキャスティクス計算
  calculateStochastic(kPeriod, kSmooth, dPeriod) {
    if (this.candles.length < kPeriod + kSmooth + dPeriod) return [];

    const result = [];
    const rawK = [];

    // Raw %K計算
    for (let i = kPeriod - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - kPeriod + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const close = this.candles[i].close;

      if (high === low) {
        rawK.push(50);
      } else {
        rawK.push(((close - low) / (high - low)) * 100);
      }
    }

    // %K（平滑化）
    const smoothedK = [];
    for (let i = kSmooth - 1; i < rawK.length; i++) {
      const sum = rawK.slice(i - kSmooth + 1, i + 1).reduce((a, b) => a + b, 0);
      smoothedK.push(sum / kSmooth);
    }

    // %D
    for (let i = dPeriod - 1; i < smoothedK.length; i++) {
      const sum = smoothedK.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push({
        k: smoothedK[i],
        d: sum / dPeriod
      });
    }

    return result;
  }

  // 一目均衡表計算
  calculateIchimoku() {
    if (this.candles.length < 52) return null;

    const calcMidpoint = (period, endIndex) => {
      const slice = this.candles.slice(endIndex - period, endIndex);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      return (high + low) / 2;
    };

    const lastIndex = this.candles.length;

    return {
      tenkan: calcMidpoint(9, lastIndex),      // 転換線
      kijun: calcMidpoint(26, lastIndex),      // 基準線
      senkouA: (calcMidpoint(9, lastIndex) + calcMidpoint(26, lastIndex)) / 2,  // 先行スパンA
      senkouB: calcMidpoint(52, lastIndex),    // 先行スパンB
      chikou: this.candles[lastIndex - 26] ? this.candles[lastIndex - 26].close : this.candles[lastIndex - 1].close  // 遅行スパン
    };
  }

  // Parabolic SAR計算
  calculateParabolicSAR() {
    if (this.candles.length < 5) return [];

    const result = [];
    let af = 0.02;
    const afMax = 0.2;
    const afStep = 0.02;

    let trend = this.candles[1].close > this.candles[0].close ? 1 : -1;
    let sar = trend === 1 ? this.candles[0].low : this.candles[0].high;
    let ep = trend === 1 ? this.candles[0].high : this.candles[0].low;

    for (let i = 1; i < this.candles.length; i++) {
      const candle = this.candles[i];

      // SAR更新
      sar = sar + af * (ep - sar);

      // トレンド反転チェック
      let newTrend = trend;
      if (trend === 1 && candle.low < sar) {
        newTrend = -1;
        sar = ep;
        ep = candle.low;
        af = afStep;
      } else if (trend === -1 && candle.high > sar) {
        newTrend = 1;
        sar = ep;
        ep = candle.high;
        af = afStep;
      } else {
        // トレンド継続
        if (trend === 1) {
          if (candle.high > ep) {
            ep = candle.high;
            af = Math.min(af + afStep, afMax);
          }
        } else {
          if (candle.low < ep) {
            ep = candle.low;
            af = Math.min(af + afStep, afMax);
          }
        }
      }

      trend = newTrend;

      result.push({
        value: sar,
        trend: trend === 1 ? 'up' : 'down'
      });
    }

    return result;
  }

  // Parabolic SAR拡張版（AF値付き）
  calculateParabolicSARExtended() {
    if (this.candles.length < 5) return [];

    const result = [];
    let af = 0.02;
    const afMax = 0.2;
    const afStep = 0.02;

    let trend = this.candles[1].close > this.candles[0].close ? 1 : -1;
    let sar = trend === 1 ? this.candles[0].low : this.candles[0].high;
    let ep = trend === 1 ? this.candles[0].high : this.candles[0].low;

    for (let i = 1; i < this.candles.length; i++) {
      const candle = this.candles[i];

      sar = sar + af * (ep - sar);

      let newTrend = trend;
      if (trend === 1 && candle.low < sar) {
        newTrend = -1;
        sar = ep;
        ep = candle.low;
        af = afStep;
      } else if (trend === -1 && candle.high > sar) {
        newTrend = 1;
        sar = ep;
        ep = candle.high;
        af = afStep;
      } else {
        if (trend === 1) {
          if (candle.high > ep) {
            ep = candle.high;
            af = Math.min(af + afStep, afMax);
          }
        } else {
          if (candle.low < ep) {
            ep = candle.low;
            af = Math.min(af + afStep, afMax);
          }
        }
      }

      trend = newTrend;

      result.push({
        value: sar,
        trend: trend === 1 ? 'up' : 'down',
        af: af,
        ep: ep
      });
    }

    return result;
  }

  // Envelopes計算
  calculateEnvelopes(period, percentage) {
    const sma = this.calculateSMA(period);
    if (!sma) return null;

    const deviation = sma * (percentage / 100);
    return {
      upper: sma + deviation,
      middle: sma,
      lower: sma - deviation
    };
  }

  // Alligator計算
  calculateAlligator() {
    if (this.candles.length < 21) return null;

    const smma = (period, shift) => {
      const endIndex = this.candles.length - shift;
      if (endIndex < period) return null;

      let sum = 0;
      for (let i = endIndex - period; i < endIndex; i++) {
        sum += (this.candles[i].high + this.candles[i].low) / 2;
      }
      return sum / period;
    };

    return {
      jaw: smma(13, 8),    // ジョーズ（青）
      teeth: smma(8, 5),   // ティース（赤）
      lips: smma(5, 3)     // リップス（緑）
    };
  }

  // Alligator拡張計算（履歴付き）
  calculateAlligatorExtended() {
    if (this.candles.length < 25) return null;

    const smmaAtIndex = (period, shift, endIdx) => {
      const actualEnd = endIdx - shift;
      if (actualEnd < period) return null;

      let sum = 0;
      for (let i = actualEnd - period; i < actualEnd; i++) {
        sum += (this.candles[i].high + this.candles[i].low) / 2;
      }
      return sum / period;
    };

    const history = [];
    const lookback = Math.min(10, this.candles.length - 21);

    for (let i = 0; i < lookback; i++) {
      const idx = this.candles.length - i;
      const jaw = smmaAtIndex(13, 8, idx);
      const teeth = smmaAtIndex(8, 5, idx);
      const lips = smmaAtIndex(5, 3, idx);

      if (jaw !== null && teeth !== null && lips !== null) {
        history.unshift({ jaw, teeth, lips });
      }
    }

    if (history.length < 5) return null;

    const current = history[history.length - 1];
    return {
      jaw: current.jaw,
      teeth: current.teeth,
      lips: current.lips,
      history: history
    };
  }

  // CCI配列計算
  calculateCCIArray(period) {
    if (this.candles.length < period) return [];

    const result = [];

    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);

      // Typical Price
      const tp = slice.map(c => (c.high + c.low + c.close) / 3);
      const smaTP = tp.reduce((a, b) => a + b, 0) / period;

      // Mean Deviation
      const meanDev = tp.reduce((acc, val) => acc + Math.abs(val - smaTP), 0) / period;

      const currentTP = (this.candles[i].high + this.candles[i].low + this.candles[i].close) / 3;

      if (meanDev === 0) {
        result.push(0);
      } else {
        result.push((currentTP - smaTP) / (0.015 * meanDev));
      }
    }

    return result;
  }

  // Momentum配列計算
  calculateMomentumArray(period) {
    if (this.candles.length < period + 1) return [];

    const result = [];

    for (let i = period; i < this.candles.length; i++) {
      const current = this.candles[i].close;
      const past = this.candles[i - period].close;
      result.push(((current - past) / past) * 100);
    }

    return result;
  }

  // Williams %R配列計算
  calculateWilliamsRArray(period) {
    if (this.candles.length < period) return [];

    const result = [];

    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(c => c.high));
      const low = Math.min(...slice.map(c => c.low));
      const close = this.candles[i].close;

      if (high === low) {
        result.push(-50);
      } else {
        result.push(((high - close) / (high - low)) * -100);
      }
    }

    return result;
  }

  // DeMarker配列計算
  calculateDeMarkerArray(period) {
    if (this.candles.length < period + 1) return [];

    const deMax = [];
    const deMin = [];

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

      if (sumMax + sumMin === 0) {
        result.push(0.5);
      } else {
        result.push(sumMax / (sumMax + sumMin));
      }
    }

    return result;
  }

  // ATR配列計算
  calculateATRArray(period) {
    if (this.candles.length < period + 1) return [];

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

    const result = [];
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(atr);

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      result.push(atr);
    }

    return result;
  }

  // ADX詳細計算
  calculateADXFull(period) {
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

    const dxArray = [];

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];

      const plusDI = (smoothedPlusDM / atr) * 100;
      const minusDI = (smoothedMinusDM / atr) * 100;
      const dx = plusDI + minusDI !== 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;

      dxArray.push({ dx, plusDI, minusDI });
    }

    if (dxArray.length < period) return null;

    // ADX計算
    let adx = dxArray.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    const adxArray = [adx];

    for (let i = period; i < dxArray.length; i++) {
      adx = (adx * (period - 1) + dxArray[i].dx) / period;
      adxArray.push(adx);
    }

    const lastDX = dxArray[dxArray.length - 1];
    const prevADX = adxArray.length > 1 ? adxArray[adxArray.length - 2] : adxArray[0];

    return {
      adx: adx,
      plusDI: lastDX.plusDI,
      minusDI: lastDX.minusDI,
      adxSlope: adx - prevADX
    };
  }

  // ADX拡張計算（履歴付き）
  calculateADXFullExtended(period) {
    if (this.candles.length < period * 2 + 10) return null;

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

    const dxArray = [];

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];

      const plusDI = (smoothedPlusDM / atr) * 100;
      const minusDI = (smoothedMinusDM / atr) * 100;
      const dx = plusDI + minusDI !== 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;

      dxArray.push({ dx, plusDI, minusDI });
    }

    if (dxArray.length < period) return null;

    // ADX計算（履歴保持）
    let adx = dxArray.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    const history = [];

    for (let i = period; i < dxArray.length; i++) {
      adx = (adx * (period - 1) + dxArray[i].dx) / period;
      history.push({
        adx: adx,
        plusDI: dxArray[i].plusDI,
        minusDI: dxArray[i].minusDI
      });
    }

    if (history.length < 5) return null;

    const current = history[history.length - 1];
    return {
      adx: current.adx,
      plusDI: current.plusDI,
      minusDI: current.minusDI,
      history: history
    };
  }

  // Standard Deviation配列計算
  calculateStdDevArray(period) {
    if (this.candles.length < period) return [];

    const result = [];

    for (let i = period - 1; i < this.candles.length; i++) {
      const slice = this.candles.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      const mean = sum / period;

      const squaredDiffs = slice.map(c => Math.pow(c.close - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b) / period;

      result.push(Math.sqrt(variance));
    }

    return result;
  }

  // Fractals検出
  detectFractals() {
    if (this.candles.length < 5) return null;

    let lastHigh = null;
    let lastLow = null;

    // 直近20本からフラクタルを検出
    const lookback = Math.min(20, this.candles.length - 4);

    for (let i = this.candles.length - 3; i >= this.candles.length - lookback; i--) {
      const candle = this.candles[i];
      const prev2 = this.candles[i - 2];
      const prev1 = this.candles[i - 1];
      const next1 = this.candles[i + 1];
      const next2 = this.candles[i + 2];

      // フラクタル高値
      if (!lastHigh &&
          candle.high > prev2.high &&
          candle.high > prev1.high &&
          candle.high > next1.high &&
          candle.high > next2.high) {
        lastHigh = candle.high;
      }

      // フラクタル安値
      if (!lastLow &&
          candle.low < prev2.low &&
          candle.low < prev1.low &&
          candle.low < next1.low &&
          candle.low < next2.low) {
        lastLow = candle.low;
      }

      if (lastHigh && lastLow) break;
    }

    return { lastHigh, lastLow };
  }

  // Force Index配列計算
  calculateForceIndexArray(period) {
    if (this.candles.length < period + 1) return [];

    const forceIndex = [];

    for (let i = 1; i < this.candles.length; i++) {
      const change = this.candles[i].close - this.candles[i - 1].close;
      const volume = this.candles[i].volume || 1;
      forceIndex.push(change * volume);
    }

    // EMA平滑化
    const result = [];
    const k = 2 / (period + 1);
    let ema = forceIndex[0];

    for (let i = 0; i < forceIndex.length; i++) {
      ema = forceIndex[i] * k + ema * (1 - k);
      if (i >= period - 1) {
        result.push(ema);
      }
    }

    return result;
  }

  // A/D Line配列計算
  calculateADLineArray() {
    if (this.candles.length < 2) return [];

    const result = [];
    let adLine = 0;

    for (let i = 0; i < this.candles.length; i++) {
      const candle = this.candles[i];
      const clv = candle.high === candle.low ? 0 :
        ((candle.close - candle.low) - (candle.high - candle.close)) / (candle.high - candle.low);
      const volume = candle.volume || 1;
      adLine += clv * volume;
      result.push(adLine);
    }

    return result;
  }

  // OBV配列計算
  calculateOBVArray() {
    if (this.candles.length < 2) return [];

    const result = [];
    let obv = 0;

    for (let i = 0; i < this.candles.length; i++) {
      if (i === 0) {
        obv = this.candles[i].volume || 0;
      } else {
        const volume = this.candles[i].volume || 1;
        if (this.candles[i].close > this.candles[i - 1].close) {
          obv += volume;
        } else if (this.candles[i].close < this.candles[i - 1].close) {
          obv -= volume;
        }
      }
      result.push(obv);
    }

    return result;
  }

  // シグナルなし結果
  createNoSignalResult(reason) {
    return {
      signal: 'WAIT',
      indicators: [],
      highCount: 0,
      lowCount: 0,
      reason: reason,
      timestamp: new Date().toISOString()
    };
  }

  // ========================================
  // サポート/レジスタンス検出（価格ゾーン方式）
  // v4.8: 複数回到達し、ブレイクされていない価格ゾーンを検出
  // - レジスタンス: 高値が複数回到達し、上抜けされていないゾーン
  // - サポート: 安値が複数回到達し、下抜けされていないゾーン
  // ========================================

  detectSupportResistanceLevels() {
    if (this.candles.length < 20) {
      return { support: null, resistance: null, warning: null };
    }

    // 最大100本を使用
    const lookback = Math.min(100, this.candles.length);
    const recentCandles = this.candles.slice(-lookback);
    const currentPrice = this.candles[this.candles.length - 1].close;

    // トレンド強度を計算（警告抑制のため）
    const trendInfo = this.calculateTrendStrength(recentCandles);

    // しきい値: 同じ価格帯とみなす範囲
    const zoneThreshold = 0.05;

    // まず、ローカルピーク（反転ポイント）を検出
    const highPeaks = this.findLocalPeaks(recentCandles, 'high');
    const lowPeaks = this.findLocalPeaks(recentCandles, 'low');

    console.log('[S/R v4.9] 開始:', {
      ローソク足数: lookback,
      現在価格: currentPrice.toFixed(5),
      高値ピーク数: highPeaks.length,
      安値ピーク数: lowPeaks.length,
      トレンド: trendInfo.direction,
      トレンド強度: trendInfo.strength.toFixed(2)
    });

    // レジスタンス: 現在価格より上のピークをクラスタリング
    const resistance = this.findSRFromPeaks(highPeaks, currentPrice, zoneThreshold, 'resistance');

    // サポート: 現在価格より下のピークをクラスタリング
    const support = this.findSRFromPeaks(lowPeaks, currentPrice, zoneThreshold, 'support');

    console.log('[S/R v4.9] 結果:', {
      現在価格: currentPrice.toFixed(5),
      レジスタンス: resistance ? `${resistance.price.toFixed(5)} (${resistance.touchCount}回反転)` : '検出なし',
      サポート: support ? `${support.price.toFixed(5)} (${support.touchCount}回反転)` : '検出なし'
    });

    // 距離を計算（%）
    const distanceToResistance = resistance
      ? ((resistance.price - currentPrice) / currentPrice) * 100
      : null;
    const distanceToSupport = support
      ? ((currentPrice - support.price) / currentPrice) * 100
      : null;

    // 警告判定（トレンド中は警告を抑制）
    let warning = null;
    let warningLevel = null;
    const warningThreshold = 0.02;

    // トレンドが強い場合（strength >= 0.5）は、S/R警告を全て抑制
    // トレンド中は価格が一方向に動くため、S/Rで反転する確率が低い
    // 上昇トレンド中: 新高値更新はレジスタンスブレイク、押し目はサポートではない
    // 下降トレンド中: 新安値更新はサポートブレイク、戻りはレジスタンスではない
    const isTrending = trendInfo.strength >= 0.5;

    if (isTrending) {
      console.log('[S/R v4.9] トレンド検出 - S/R警告を全抑制:', {
        方向: trendInfo.direction === 'up' ? '上昇' : '下降',
        強度: trendInfo.strength.toFixed(2)
      });
    }

    // トレンド中でなければ警告判定を行う
    if (!isTrending) {
      if (resistance && distanceToResistance !== null &&
          distanceToResistance <= warningThreshold && resistance.touchCount >= 2) {
        warning = 'resistance';
        warningLevel = resistance.touchCount >= 3 ? 'critical' : 'high';
      }

      if (!warning && support && distanceToSupport !== null &&
          distanceToSupport <= warningThreshold && support.touchCount >= 2) {
        warning = 'support';
        warningLevel = support.touchCount >= 3 ? 'critical' : 'high';
      }
    }

    return {
      support: support ? support.price : null,
      resistance: resistance ? resistance.price : null,
      currentPrice: currentPrice,
      distanceToResistance: distanceToResistance,
      distanceToSupport: distanceToSupport,
      warning: warning,
      warningLevel: warningLevel,
      lookbackBars: lookback,
      resistanceTouches: resistance ? resistance.touchCount : 0,
      supportTouches: support ? support.touchCount : 0,
      resistanceZoneCount: resistance ? 1 : 0,
      supportZoneCount: support ? 1 : 0,
      trendDirection: trendInfo.direction,
      trendStrength: trendInfo.strength
    };
  }

  // トレンド強度を計算
  // 戻り値: { direction: 'up'|'down'|'neutral', strength: 0-1 }
  calculateTrendStrength(candles) {
    if (candles.length < 20) {
      return { direction: 'neutral', strength: 0 };
    }

    // 直近20本で判定
    const period = Math.min(20, candles.length);
    const recent = candles.slice(-period);

    // 方法1: 価格の変化率
    const startPrice = recent[0].close;
    const endPrice = recent[recent.length - 1].close;
    const priceChange = (endPrice - startPrice) / startPrice;

    // 方法2: 高値・安値の傾向（Higher Highs/Higher Lows or Lower Highs/Lower Lows）
    let higherHighs = 0;
    let lowerLows = 0;
    let lowerHighs = 0;
    let higherLows = 0;

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].high > recent[i-1].high) higherHighs++;
      if (recent[i].low > recent[i-1].low) higherLows++;
      if (recent[i].high < recent[i-1].high) lowerHighs++;
      if (recent[i].low < recent[i-1].low) lowerLows++;
    }

    const comparisons = recent.length - 1;
    const upTrendScore = (higherHighs + higherLows) / (comparisons * 2);
    const downTrendScore = (lowerHighs + lowerLows) / (comparisons * 2);

    // 方法3: 移動平均の傾き
    const ma5 = this.calcSimpleAverage(recent.slice(-5).map(c => c.close));
    const ma10 = this.calcSimpleAverage(recent.slice(-10).map(c => c.close));
    const ma20 = this.calcSimpleAverage(recent.map(c => c.close));

    // MA5 > MA10 > MA20 = 上昇トレンド
    // MA5 < MA10 < MA20 = 下降トレンド
    const maAlignment = (ma5 > ma10 && ma10 > ma20) ? 1 :
                        (ma5 < ma10 && ma10 < ma20) ? -1 : 0;

    // 総合判定
    let direction = 'neutral';
    let strength = 0;

    // 価格変化率が0.2%以上で、トレンドスコアが0.45以上ならトレンド
    // MA整列は加点要素として扱う（必須条件から外す）
    if (priceChange > 0.002 && upTrendScore > 0.45) {
      direction = 'up';
      // 強度計算: スコア + 変化率ボーナス + MA整列ボーナス
      strength = Math.min(1, (upTrendScore + Math.abs(priceChange) * 20 + (maAlignment === 1 ? 0.2 : 0)) / 1.5);
    } else if (priceChange < -0.002 && downTrendScore > 0.45) {
      direction = 'down';
      strength = Math.min(1, (downTrendScore + Math.abs(priceChange) * 20 + (maAlignment === -1 ? 0.2 : 0)) / 1.5);
    }

    console.log('[S/R v4.9] トレンド分析:', {
      価格変化率: (priceChange * 100).toFixed(3) + '%',
      上昇スコア: upTrendScore.toFixed(2),
      下降スコア: downTrendScore.toFixed(2),
      MA整列: maAlignment === 1 ? '上昇' : maAlignment === -1 ? '下降' : 'なし',
      判定: direction,
      強度: strength.toFixed(2)
    });

    return { direction, strength };
  }

  // シンプルな配列平均計算（トレンド強度計算用）
  calcSimpleAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  // ローカルピーク（反転ポイント）を検出
  // type: 'high' = 高値で反転（周囲より高い）、'low' = 安値で反転（周囲より低い）
  findLocalPeaks(candles, type) {
    const peaks = [];
    const lookback = 3; // 前後3本と比較

    for (let i = lookback; i < candles.length - lookback; i++) {
      const price = type === 'high' ? candles[i].high : candles[i].low;
      let isPeak = true;

      // 前後の足と比較
      for (let j = 1; j <= lookback; j++) {
        const prevPrice = type === 'high' ? candles[i - j].high : candles[i - j].low;
        const nextPrice = type === 'high' ? candles[i + j].high : candles[i + j].low;

        if (type === 'high') {
          // 高値ピーク: 周囲より高い
          if (price <= prevPrice || price <= nextPrice) {
            isPeak = false;
            break;
          }
        } else {
          // 安値ピーク: 周囲より低い
          if (price >= prevPrice || price >= nextPrice) {
            isPeak = false;
            break;
          }
        }
      }

      if (isPeak) {
        peaks.push({ price: price, index: i });
      }
    }

    // 直近5本の最高値/最安値も追加（まだピーク確定していなくても重要）
    const lastFew = candles.slice(-5);
    if (lastFew.length > 0) {
      const prices = lastFew.map(c => type === 'high' ? c.high : c.low);
      const extremePrice = type === 'high' ? Math.max(...prices) : Math.min(...prices);
      const extremeLocalIdx = prices.indexOf(extremePrice);
      const extremeIdx = candles.length - 5 + extremeLocalIdx;

      // 既存のピークと重複しないか確認
      const exists = peaks.some(p => Math.abs(p.index - extremeIdx) <= 2);
      if (!exists && extremeIdx >= 0) {
        peaks.push({ price: extremePrice, index: extremeIdx });
      }
    }

    return peaks;
  }

  // ピークからS/Rレベルを検出
  findSRFromPeaks(peaks, currentPrice, threshold, type) {
    if (peaks.length === 0) return null;

    // 現在価格でフィルタリング
    const filteredPeaks = peaks.filter(p =>
      type === 'resistance' ? p.price > currentPrice : p.price < currentPrice
    );

    if (filteredPeaks.length === 0) return null;

    // ピークをクラスタリング（価格が近いものをグループ化）
    const clusters = [];
    const used = new Set();

    // 現在価格に近い順にソート
    const sorted = [...filteredPeaks].sort((a, b) =>
      type === 'resistance'
        ? a.price - b.price  // レジスタンス: 低い順（現在価格に近い）
        : b.price - a.price  // サポート: 高い順（現在価格に近い）
    );

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;

      const cluster = [sorted[i]];
      used.add(i);

      // 同じクラスタに属するピークを探す
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;

        // クラスタ内のいずれかのピークと価格が近いか
        const isClose = cluster.some(p => Math.abs(sorted[j].price - p.price) <= threshold);
        if (isClose) {
          cluster.push(sorted[j]);
          used.add(j);
        }
      }

      // クラスタの統計
      const avgPrice = cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length;

      clusters.push({
        avgPrice: avgPrice,
        touchCount: cluster.length,
        peaks: cluster
      });
    }

    // 2回以上反転しているクラスタで、現在価格に最も近いものを返す
    const validClusters = clusters.filter(c => c.touchCount >= 2);

    if (validClusters.length > 0) {
      // 現在価格に最も近いクラスタ
      return {
        price: validClusters[0].avgPrice,
        touchCount: validClusters[0].touchCount
      };
    }

    // 2回以上反転したゾーンがない = トレンド相場などで明確なS/Rがない
    // この場合は「検出なし」を返す
    return null;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.SignalEngine = SignalEngine;
}
