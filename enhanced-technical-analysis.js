/**
 * Enhanced Technical Analysis System v1.2.0
 *
 * 高精度テクニカル分析エンジン
 * - Multi-timeframe Confluence Analysis (MTF)
 * - Market Regime Detection (5フェーズ)
 * - Confluence Scoring System (100点評価)
 * - Dynamic Parameter Optimization
 * - Entry Quality Filter
 * - Dynamic Volatility Thresholds (v5.8.13)
 * - Early Move Detection (v5.8.14) - 初動検出システム
 * - Momentum Direction Analysis (v5.8.14) - モメンタム方向分析
 */

// デバッグモード（本番ではfalse）
const ETA_DEBUG = false;
const etaLog = ETA_DEBUG ? console.log.bind(console, '[ETA]') : () => {};

/**
 * マーケットレジーム（相場状態）の定義
 */
const MarketRegime = {
  STRONG_TREND_UP: 'STRONG_TREND_UP',     // 強い上昇トレンド
  STRONG_TREND_DOWN: 'STRONG_TREND_DOWN', // 強い下降トレンド
  WEAK_TREND_UP: 'WEAK_TREND_UP',         // 弱い上昇トレンド
  WEAK_TREND_DOWN: 'WEAK_TREND_DOWN',     // 弱い下降トレンド
  RANGE: 'RANGE',                         // レンジ相場
  BREAKOUT_UP: 'BREAKOUT_UP',             // 上方ブレイクアウト
  BREAKOUT_DOWN: 'BREAKOUT_DOWN',         // 下方ブレイクアウト
  REVERSAL_UP: 'REVERSAL_UP',             // 上方反転（下落→上昇）
  REVERSAL_DOWN: 'REVERSAL_DOWN'          // 下方反転（上昇→下落）
};

/**
 * Enhanced Technical Analysis Engine
 */
class EnhancedTechnicalAnalysis {
  constructor() {
    // 価格データキャッシュ（複数タイムフレーム）
    this.priceHistory = [];
    this.tickHistory = [];

    // 計算結果キャッシュ
    this.cache = {
      indicators: {},
      regime: null,
      lastUpdate: 0
    };

    // 設定
    this.config = {
      // MTF分析の時間枠（秒）
      timeframes: [15, 30, 60, 180, 300],

      // コンフルエンス閾値
      minConfluenceScore: 70,
      highQualityScore: 85,

      // エントリーフィルター
      minIndicatorAgreement: 0.6, // 60%以上の指標一致
      maxVolatilityRatio: 2.5,    // ATR比の上限

      // ADX閾値（基準値: 動的に調整される）
      adxTrendThreshold: 18,        // 弱トレンド検出
      adxStrongTrendThreshold: 28,  // 強トレンド検出

      // RSI閾値（基準値: 動的に調整される）
      rsiOverbought: 65,
      rsiOversold: 35,
      rsiExtreme: 25
    };

    // v5.8.13: 動的ボラティリティ閾値システム
    this.volatilityState = {
      currentATR: 0,
      averageATR: 0,
      volatilityRatio: 1.0,  // 現在ATR / 平均ATR
      regime: 'NORMAL',       // LOW, NORMAL, HIGH, EXTREME
      lastUpdate: 0,
      history: []             // ATR履歴（移動平均用）
    };

    // v5.8.14→v5.9.0: 初動検出・モメンタム方向分析用の指標履歴（履歴を50に拡張）
    this.indicatorHistory = {
      rsi: [],          // RSI履歴
      stochK: [],       // Stochastic %K履歴
      macdHist: [],     // MACDヒストグラム履歴
      momentum: [],     // モメンタム履歴
      maxLength: 50     // v5.9.0: 保持する最大期間（10→50）
    };

    // v5.9.0: ADX履歴（パーセンタイル計算用）
    this.adxHistory = [];
    this.adxHistoryMax = 200;

    // v5.9.0: BB幅履歴（中央値計算用）
    this.bbWidthHistory = [];
    this.bbWidthHistoryMax = 50;
  }

  // ========================================
  // 動的ボラティリティ閾値システム (v5.8.13)
  // ========================================

  /**
   * ボラティリティ状態を更新
   * @param {Array} data - 価格データ
   */
  updateVolatilityState(data) {
    if (!data || data.length < 20) return;

    const currentATR = this.calculateATR(data, 14);
    if (!currentATR || currentATR === 0) return;

    // ATR履歴を更新（最大100期間）
    this.volatilityState.history.push(currentATR);
    if (this.volatilityState.history.length > 100) {
      this.volatilityState.history.shift();
    }

    // 平均ATRを計算（過去50期間の移動平均）
    const historyForAvg = this.volatilityState.history.slice(-50);
    const averageATR = historyForAvg.reduce((a, b) => a + b, 0) / historyForAvg.length;

    // ボラティリティ比率
    const volatilityRatio = currentATR / averageATR;

    // ボラティリティレジームを判定
    let regime = 'NORMAL';
    if (volatilityRatio < 0.6) {
      regime = 'LOW';
    } else if (volatilityRatio > 2.0) {
      regime = 'EXTREME';
    } else if (volatilityRatio > 1.4) {
      regime = 'HIGH';
    }

    this.volatilityState = {
      ...this.volatilityState,
      currentATR,
      averageATR,
      volatilityRatio,
      regime,
      lastUpdate: Date.now()
    };

    etaLog(`[Volatility] ATR: ${currentATR.toFixed(6)}, Avg: ${averageATR.toFixed(6)}, Ratio: ${volatilityRatio.toFixed(2)}, Regime: ${regime}`);
  }

  /**
   * ボラティリティに応じた動的閾値を取得
   * @returns {Object} 動的に調整された閾値
   */
  getDynamicThresholds() {
    const { volatilityRatio, regime } = this.volatilityState;
    const base = this.config;

    // ボラティリティが低い場合: 閾値を厳しく（小さな動きでも反応）
    // ボラティリティが高い場合: 閾値を緩く（ノイズを除去）

    let multiplier = 1.0;
    let rsiAdjustment = 0;
    let adxAdjustment = 0;

    switch (regime) {
      case 'LOW':
        // 低ボラティリティ: より敏感に反応
        multiplier = 0.8;
        rsiAdjustment = -5;  // RSI閾値を中央に寄せる（65→60, 35→40）
        adxAdjustment = -3;  // ADX閾値を下げる（より弱いトレンドでも検出）
        break;

      case 'NORMAL':
        // 通常: 基準値のまま
        multiplier = 1.0;
        rsiAdjustment = 0;
        adxAdjustment = 0;
        break;

      case 'HIGH':
        // 高ボラティリティ: ノイズ除去のため閾値を緩める
        multiplier = 1.2;
        rsiAdjustment = 5;   // RSI閾値を外側に（65→70, 35→30）
        adxAdjustment = 3;   // ADX閾値を上げる（強いトレンドのみ検出）
        break;

      case 'EXTREME':
        // 極端なボラティリティ: 大幅にノイズ除去
        multiplier = 1.5;
        rsiAdjustment = 10;  // RSI閾値をさらに外側に
        adxAdjustment = 5;   // ADX閾値をさらに上げる
        break;
    }

    // 動的閾値を計算
    const dynamicThresholds = {
      // RSI閾値
      rsiOverbought: Math.min(80, base.rsiOverbought + rsiAdjustment),
      rsiOversold: Math.max(20, base.rsiOversold - rsiAdjustment),
      rsiExtreme: Math.max(15, base.rsiExtreme - Math.floor(rsiAdjustment / 2)),

      // ADX閾値
      adxTrendThreshold: Math.max(12, base.adxTrendThreshold + adxAdjustment),
      adxStrongTrendThreshold: Math.max(20, base.adxStrongTrendThreshold + adxAdjustment),

      // モメンタム閾値（ボラティリティに比例）
      momentumThreshold: 0.1 * multiplier,

      // BB閾値調整
      bbOverboughtPosition: Math.min(90, 80 + (rsiAdjustment / 2)),
      bbOversoldPosition: Math.max(10, 20 - (rsiAdjustment / 2)),

      // ストキャスティクス閾値
      stochOverbought: Math.min(85, 80 + rsiAdjustment),
      stochOversold: Math.max(15, 20 - rsiAdjustment),

      // ボラティリティ情報
      volatilityRegime: regime,
      volatilityRatio: volatilityRatio,
      multiplier: multiplier
    };

    etaLog(`[Dynamic Thresholds] RSI: ${dynamicThresholds.rsiOversold}-${dynamicThresholds.rsiOverbought}, ADX: ${dynamicThresholds.adxTrendThreshold}/${dynamicThresholds.adxStrongTrendThreshold}`);

    return dynamicThresholds;
  }

  // ========================================
  // 初動検出システム (v5.8.14)
  // ========================================

  /**
   * 指標履歴を更新
   * @param {string} indicatorName - 指標名（rsi, stochK, macdHist, momentum）
   * @param {number} value - 指標値
   */
  updateIndicatorHistory(indicatorName, value) {
    if (value === null || value === undefined || isNaN(value)) return;

    const history = this.indicatorHistory[indicatorName];
    if (!history) return;

    history.push(value);
    if (history.length > this.indicatorHistory.maxLength) {
      history.shift();
    }
  }

  /**
   * 初動検出（ニュートラルゾーンからの離脱を検出）
   * @param {number} currentValue - 現在の指標値
   * @param {Array} history - 指標の履歴
   * @param {Object} zones - ゾーン定義 { neutral: {low, high}, extreme: {low, high} }
   * @returns {Object} { type: 'EARLY_HIGH'|'EARLY_LOW'|'OVEREXTENDED'|'NEUTRAL', strength: 0-100 }
   */
  detectEarlyMove(currentValue, history, zones) {
    if (!history || history.length < 2) {
      return { type: 'NEUTRAL', strength: 0, reason: '履歴不足' };
    }

    const prevValue = history[history.length - 2];
    const { neutral, extreme } = zones;

    // 1. 極端ゾーンに入った場合 = 動きすぎ（見送り推奨）
    if (currentValue <= extreme.low) {
      return {
        type: 'OVEREXTENDED_LOW',
        strength: 0,
        reason: `極端な売られすぎ (${currentValue.toFixed(1)})`
      };
    }
    if (currentValue >= extreme.high) {
      return {
        type: 'OVEREXTENDED_HIGH',
        strength: 0,
        reason: `極端な買われすぎ (${currentValue.toFixed(1)})`
      };
    }

    // 2. ニュートラルゾーンから離脱する動き = 初動
    const wasInNeutral = prevValue >= neutral.low && prevValue <= neutral.high;

    if (wasInNeutral) {
      // ニュートラルから上に離脱 → 上昇の初動
      if (currentValue > neutral.high) {
        const strength = Math.min(100, (currentValue - neutral.high) * 10);
        return {
          type: 'EARLY_HIGH',
          strength,
          reason: `ニュートラルから上昇離脱 (${prevValue.toFixed(1)}→${currentValue.toFixed(1)})`
        };
      }
      // ニュートラルから下に離脱 → 下落の初動
      if (currentValue < neutral.low) {
        const strength = Math.min(100, (neutral.low - currentValue) * 10);
        return {
          type: 'EARLY_LOW',
          strength,
          reason: `ニュートラルから下落離脱 (${prevValue.toFixed(1)}→${currentValue.toFixed(1)})`
        };
      }
    }

    // 3. ニュートラルゾーン内での動き = 方向の兆候
    if (currentValue >= neutral.low && currentValue <= neutral.high) {
      const direction = currentValue - prevValue;
      if (Math.abs(direction) > 2) {
        if (direction > 0) {
          return { type: 'HINT_HIGH', strength: 30, reason: 'ニュートラル内で上昇傾向' };
        } else {
          return { type: 'HINT_LOW', strength: 30, reason: 'ニュートラル内で下落傾向' };
        }
      }
    }

    // 4. ニュートラル外だが極端ではない = トレンド継続中
    if (currentValue > neutral.high && currentValue < extreme.high) {
      return { type: 'TREND_HIGH', strength: 50, reason: '上昇トレンド継続中' };
    }
    if (currentValue < neutral.low && currentValue > extreme.low) {
      return { type: 'TREND_LOW', strength: 50, reason: '下落トレンド継続中' };
    }

    return { type: 'NEUTRAL', strength: 0, reason: '明確なシグナルなし' };
  }

  // ========================================
  // モメンタム方向分析 (v5.8.14)
  // ========================================

  /**
   * モメンタム方向を検出（加速/減速/反転の判定）
   * @param {Array} values - 指標値の履歴（最低3期間必要）
   * @returns {Object} { direction: string, strength: number, isAccelerating: boolean }
   */
  detectMomentumDirection(values) {
    if (!values || values.length < 3) {
      return {
        direction: 'UNKNOWN',
        strength: 0,
        isAccelerating: false,
        reason: '履歴不足'
      };
    }

    // 直近の変化を計算
    const changes = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(values[i] - values[i - 1]);
    }

    const recentChange = changes[changes.length - 1];
    const prevChange = changes.length >= 2 ? changes[changes.length - 2] : 0;

    // 変化の加速度
    const acceleration = recentChange - prevChange;

    // 方向と強度を判定
    let direction = 'STABLE';
    let strength = Math.abs(recentChange) * 10;
    let isAccelerating = false;
    let reason = '';

    if (recentChange > 0.5) {
      // 上昇中
      if (acceleration > 0.3) {
        direction = 'ACCELERATING_UP';
        isAccelerating = true;
        strength = Math.min(100, strength * 1.5);
        reason = '上昇加速中';
      } else if (acceleration < -0.3) {
        direction = 'DECELERATING_UP';
        isAccelerating = false;
        strength = Math.max(20, strength * 0.5);
        reason = '上昇減速中（反転の兆候）';
      } else {
        direction = 'RISING';
        reason = '上昇中';
      }
    } else if (recentChange < -0.5) {
      // 下落中
      if (acceleration < -0.3) {
        direction = 'ACCELERATING_DOWN';
        isAccelerating = true;
        strength = Math.min(100, strength * 1.5);
        reason = '下落加速中';
      } else if (acceleration > 0.3) {
        direction = 'DECELERATING_DOWN';
        isAccelerating = false;
        strength = Math.max(20, strength * 0.5);
        reason = '下落減速中（反転の兆候）';
      } else {
        direction = 'FALLING';
        reason = '下落中';
      }
    } else {
      direction = 'STABLE';
      strength = 0;
      reason = '横ばい';
    }

    // 反転検出: 前回と今回の変化が逆方向
    const isReversal = (prevChange > 0.5 && recentChange < -0.5) ||
                       (prevChange < -0.5 && recentChange > 0.5);

    if (isReversal) {
      direction = recentChange > 0 ? 'REVERSAL_UP' : 'REVERSAL_DOWN';
      strength = Math.min(100, Math.abs(recentChange - prevChange) * 15);
      reason = recentChange > 0 ? '下落→上昇に反転' : '上昇→下落に反転';
    }

    return {
      direction,
      strength: Math.round(strength),
      isAccelerating,
      isReversal,
      recentChange,
      acceleration,
      reason
    };
  }

  /**
   * 総合的な初動・モメンタム分析を実行
   * @param {Object} indicators - 計算済み指標
   * @returns {Object} 分析結果
   */
  analyzeEarlyMoveAndMomentum(indicators) {
    // 指標履歴を更新
    if (indicators.rsi) this.updateIndicatorHistory('rsi', indicators.rsi);
    if (indicators.stochastic?.k) this.updateIndicatorHistory('stochK', indicators.stochastic.k);
    if (indicators.macd?.histogram) this.updateIndicatorHistory('macdHist', indicators.macd.histogram);
    if (indicators.momentum !== undefined) this.updateIndicatorHistory('momentum', indicators.momentum);

    // RSI初動検出
    const rsiEarlyMove = this.detectEarlyMove(
      indicators.rsi || 50,
      this.indicatorHistory.rsi,
      {
        neutral: { low: 45, high: 55 },
        extreme: { low: 25, high: 75 }
      }
    );

    // Stochastic初動検出
    const stochEarlyMove = this.detectEarlyMove(
      indicators.stochastic?.k || 50,
      this.indicatorHistory.stochK,
      {
        neutral: { low: 40, high: 60 },
        extreme: { low: 15, high: 85 }
      }
    );

    // RSIモメンタム方向
    const rsiMomentum = this.detectMomentumDirection(this.indicatorHistory.rsi);

    // MACDヒストグラムモメンタム方向
    const macdMomentum = this.detectMomentumDirection(this.indicatorHistory.macdHist);

    // 総合判定
    const analysis = {
      rsi: {
        earlyMove: rsiEarlyMove,
        momentum: rsiMomentum
      },
      stochastic: {
        earlyMove: stochEarlyMove
      },
      macd: {
        momentum: macdMomentum
      },
      summary: this.summarizeEarlyMoveAnalysis(rsiEarlyMove, stochEarlyMove, rsiMomentum, macdMomentum)
    };

    etaLog(`[EarlyMove] RSI: ${rsiEarlyMove.type}(${rsiEarlyMove.strength}) Stoch: ${stochEarlyMove.type}(${stochEarlyMove.strength})`);
    etaLog(`[Momentum] RSI: ${rsiMomentum.direction} MACD: ${macdMomentum.direction}`);

    return analysis;
  }

  /**
   * 初動・モメンタム分析の総合判定
   */
  summarizeEarlyMoveAnalysis(rsiEarlyMove, stochEarlyMove, rsiMomentum, macdMomentum) {
    let signal = 'NEUTRAL';
    let confidence = 0;
    let reasons = [];

    // 極端ゾーンチェック（見送り判定）
    if (rsiEarlyMove.type === 'OVEREXTENDED_HIGH' || stochEarlyMove.type === 'OVEREXTENDED_HIGH') {
      return {
        signal: 'SKIP',
        confidence: 0,
        reason: '指標が極端な買われすぎ - 反落リスク高',
        details: reasons
      };
    }
    if (rsiEarlyMove.type === 'OVEREXTENDED_LOW' || stochEarlyMove.type === 'OVEREXTENDED_LOW') {
      return {
        signal: 'SKIP',
        confidence: 0,
        reason: '指標が極端な売られすぎ - 反発リスク高',
        details: reasons
      };
    }

    // 初動検出によるシグナル
    let highScore = 0;
    let lowScore = 0;

    // RSI初動
    if (rsiEarlyMove.type === 'EARLY_HIGH' || rsiEarlyMove.type === 'HINT_HIGH') {
      highScore += rsiEarlyMove.strength;
      reasons.push(`RSI: ${rsiEarlyMove.reason}`);
    } else if (rsiEarlyMove.type === 'EARLY_LOW' || rsiEarlyMove.type === 'HINT_LOW') {
      lowScore += rsiEarlyMove.strength;
      reasons.push(`RSI: ${rsiEarlyMove.reason}`);
    }

    // Stochastic初動
    if (stochEarlyMove.type === 'EARLY_HIGH' || stochEarlyMove.type === 'HINT_HIGH') {
      highScore += stochEarlyMove.strength;
      reasons.push(`Stoch: ${stochEarlyMove.reason}`);
    } else if (stochEarlyMove.type === 'EARLY_LOW' || stochEarlyMove.type === 'HINT_LOW') {
      lowScore += stochEarlyMove.strength;
      reasons.push(`Stoch: ${stochEarlyMove.reason}`);
    }

    // モメンタム方向による補正
    if (rsiMomentum.direction.includes('UP') && rsiMomentum.isAccelerating) {
      highScore += 30;
      reasons.push(`RSIモメンタム: ${rsiMomentum.reason}`);
    } else if (rsiMomentum.direction.includes('DOWN') && rsiMomentum.isAccelerating) {
      lowScore += 30;
      reasons.push(`RSIモメンタム: ${rsiMomentum.reason}`);
    }

    // 減速中は逆方向のヒント
    if (rsiMomentum.direction === 'DECELERATING_UP') {
      lowScore += 20;
      reasons.push('RSI上昇減速 - 反落の兆候');
    } else if (rsiMomentum.direction === 'DECELERATING_DOWN') {
      highScore += 20;
      reasons.push('RSI下落減速 - 反発の兆候');
    }

    // MACDモメンタム
    if (macdMomentum.direction.includes('UP') && macdMomentum.isAccelerating) {
      highScore += 25;
      reasons.push(`MACDモメンタム: ${macdMomentum.reason}`);
    } else if (macdMomentum.direction.includes('DOWN') && macdMomentum.isAccelerating) {
      lowScore += 25;
      reasons.push(`MACDモメンタム: ${macdMomentum.reason}`);
    }

    // 反転シグナル（強い）
    if (rsiMomentum.isReversal || macdMomentum.isReversal) {
      const reversalDir = rsiMomentum.direction === 'REVERSAL_UP' || macdMomentum.direction === 'REVERSAL_UP' ? 'HIGH' : 'LOW';
      if (reversalDir === 'HIGH') {
        highScore += 40;
      } else {
        lowScore += 40;
      }
      reasons.push('反転シグナル検出');
    }

    // 最終判定
    if (highScore > lowScore && highScore >= 50) {
      signal = 'HIGH';
      confidence = Math.min(100, highScore);
    } else if (lowScore > highScore && lowScore >= 50) {
      signal = 'LOW';
      confidence = Math.min(100, lowScore);
    } else {
      signal = 'NEUTRAL';
      confidence = 0;
    }

    return {
      signal,
      confidence,
      reason: reasons.length > 0 ? reasons[0] : '明確なシグナルなし',
      details: reasons,
      scores: { high: highScore, low: lowScore }
    };
  }

  /**
   * 価格データを更新
   * @param {number} price - 現在価格
   * @param {number} timestamp - タイムスタンプ
   */
  updatePrice(price, timestamp = Date.now()) {
    this.tickHistory.push({ price, timestamp });

    // 10分以上前のティックデータを削除
    const cutoff = timestamp - 600000;
    this.tickHistory = this.tickHistory.filter(t => t.timestamp > cutoff);

    // キャッシュをクリア
    this.cache.lastUpdate = timestamp;
  }

  /**
   * 価格履歴を設定
   * @param {Array} history - 価格履歴配列
   */
  setPriceHistory(history) {
    this.priceHistory = history;
    this.cache.indicators = {};
  }

  // ========================================
  // 1. Multi-timeframe Confluence Analysis
  // ========================================

  /**
   * 複数タイムフレームでの分析を実行
   * @returns {Object} MTF分析結果
   */
  analyzeMultiTimeframe() {
    const results = {};
    const timeframes = this.config.timeframes;

    for (const tf of timeframes) {
      results[tf] = this.analyzeTimeframe(tf);
    }

    // タイムフレーム間の一致度を計算
    const confluence = this.calculateTimeframeConfluence(results);

    return {
      timeframes: results,
      confluence,
      primarySignal: this.determinePrimarySignal(results, confluence)
    };
  }

  /**
   * 単一タイムフレームの分析
   * @param {number} seconds - タイムフレーム（秒）
   * @returns {Object} 分析結果
   */
  analyzeTimeframe(seconds) {
    const data = this.getDataForTimeframe(seconds);
    if (!data || data.length < 20) {
      return { signal: 'NEUTRAL', confidence: 0, indicators: {}, earlyMoveAnalysis: null };
    }

    const indicators = {
      rsi: this.calculateRSI(data, 14),
      macd: this.calculateMACD(data),
      ma: this.calculateMACrossover(data),
      bb: this.calculateBollingerBands(data, 20, 2),
      adx: this.calculateADX(data, 14),
      stochastic: this.calculateStochastic(data, 14, 3, 3),
      momentum: this.calculateMomentum(data, 10)
    };

    // v5.8.14: 初動検出・モメンタム分析
    const earlyMoveAnalysis = this.analyzeEarlyMoveAndMomentum(indicators);

    // 各指標のシグナルを取得
    const signals = {
      rsi: this.getRSISignal(indicators.rsi),
      macd: this.getMACDSignal(indicators.macd),
      ma: this.getMASignal(indicators.ma),
      bb: this.getBBSignal(indicators.bb, data),
      adx: this.getADXSignal(indicators.adx),
      stochastic: this.getStochasticSignal(indicators.stochastic),
      momentum: this.getMomentumSignal(indicators.momentum)
    };

    // デバッグ用: 各指標のシグナル状態をログ
    etaLog(`[TF ${seconds}s] RSI:${signals.rsi} MACD:${signals.macd} MA:${signals.ma} BB:${signals.bb} ADX:${signals.adx} Stoch:${signals.stochastic} Mom:${signals.momentum}`);

    // v5.8.14: 初動検出の結果を考慮した総合シグナル
    const { signal, confidence } = this.aggregateSignalsWithEarlyMove(signals, earlyMoveAnalysis);

    return {
      signal,
      confidence,
      indicators,
      signals,
      earlyMoveAnalysis
    };
  }

  /**
   * タイムフレーム間のコンフルエンス（一致度）を計算
   * @param {Object} results - 各タイムフレームの分析結果
   * @returns {Object} コンフルエンス情報
   */
  calculateTimeframeConfluence(results) {
    const timeframes = Object.keys(results).map(Number).sort((a, b) => a - b);

    let highCount = 0;
    let lowCount = 0;
    let totalConfidence = 0;
    let validCount = 0;

    // 重み付け: 短いTFは即時性、長いTFは信頼性
    const weights = {
      15: 0.15,
      30: 0.20,
      60: 0.25,
      180: 0.25,
      300: 0.15
    };

    for (const tf of timeframes) {
      const result = results[tf];
      if (result.signal === 'HIGH') highCount++;
      else if (result.signal === 'LOW') lowCount++;

      totalConfidence += result.confidence * (weights[tf] || 0.2);
      validCount++;
    }

    // 方向の一致度
    const directionAgreement = Math.max(highCount, lowCount) / validCount;

    // 支配的な方向
    let dominantDirection = 'NEUTRAL';
    if (highCount > lowCount && directionAgreement >= 0.6) {
      dominantDirection = 'HIGH';
    } else if (lowCount > highCount && directionAgreement >= 0.6) {
      dominantDirection = 'LOW';
    }

    return {
      highCount,
      lowCount,
      neutralCount: validCount - highCount - lowCount,
      directionAgreement: Math.round(directionAgreement * 100),
      dominantDirection,
      weightedConfidence: Math.round(totalConfidence),
      isStrong: directionAgreement >= 0.8 && totalConfidence >= 60
    };
  }

  /**
   * プライマリシグナルを決定
   * @param {Object} results - タイムフレーム結果
   * @param {Object} confluence - コンフルエンス情報
   * @returns {Object} プライマリシグナル
   */
  determinePrimarySignal(results, confluence) {
    // コンフルエンスが弱い場合はNEUTRAL
    if (confluence.directionAgreement < 60) {
      return { signal: 'NEUTRAL', reason: 'タイムフレーム間で方向が分散' };
    }

    // 60秒TFを基準に、他のTFとの整合性をチェック
    const tf60 = results[60];
    const tf30 = results[30];
    const tf180 = results[180];

    // 30秒と180秒の両方が同じ方向なら強いシグナル
    if (tf30.signal === tf180.signal && tf30.signal !== 'NEUTRAL') {
      if (tf60.signal === tf30.signal) {
        return {
          signal: tf30.signal,
          reason: '3タイムフレーム一致',
          confidence: Math.round((tf30.confidence + tf60.confidence + tf180.confidence) / 3)
        };
      }
    }

    return {
      signal: confluence.dominantDirection,
      reason: `${confluence.directionAgreement}%一致`,
      confidence: confluence.weightedConfidence
    };
  }

  // ========================================
  // 2. Market Regime Detection
  // ========================================

  /**
   * 時間枠ごとの判定期間マッピング（秒）
   * 判定時間の4倍を基本とする
   */
  getAnalysisPeriod(timeframeSec) {
    const periodMap = {
      15: 60,    // 15秒判定 → 直近60秒（1分）
      30: 120,   // 30秒判定 → 直近120秒（2分）
      60: 180,   // 60秒判定 → 直近180秒（3分）
      180: 360,  // 3分判定 → 直近360秒（6分）
      300: 600   // 5分判定 → 直近600秒（10分）
    };
    return periodMap[timeframeSec] || timeframeSec * 4;
  }

  /**
   * 現在のマーケットレジームを検出
   * @param {number} timeframeSec - 判定時間枠（秒）。省略時は現在選択中の時間枠
   * @param {Object} dynamicThresholds - 動的閾値（省略時は静的設定を使用）
   * @returns {Object} レジーム情報
   */
  detectMarketRegime(timeframeSec = 60, dynamicThresholds = null) {
    const fullData = this.priceHistory;
    if (!fullData || fullData.length < 50) {
      return { regime: MarketRegime.RANGE, confidence: 0, details: {} };
    }

    // v5.8.13: 動的閾値を使用（指定がなければ静的設定）
    const thresholds = dynamicThresholds || {
      adxTrendThreshold: this.config.adxTrendThreshold,
      adxStrongTrendThreshold: this.config.adxStrongTrendThreshold,
      rsiExtreme: this.config.rsiExtreme,
      bbOversoldPosition: 20,
      bbOverboughtPosition: 80
    };

    // 時間枠に応じたデータ期間を取得
    const analysisPeriod = this.getAnalysisPeriod(timeframeSec);
    const dataPoints = Math.min(fullData.length, analysisPeriod);
    const data = fullData.slice(-dataPoints);

    etaLog(`[ETA] detectMarketRegime: timeframe=${timeframeSec}s, period=${analysisPeriod}s, dataPoints=${dataPoints}, volatility=${thresholds.volatilityRegime || 'STATIC'}`);

    // ADXでトレンド強度を判定
    const adx = this.calculateADX(data, 14);
    const adxValue = adx?.adx || 0;

    // ボリンジャーバンド幅でボラティリティを判定
    const bb = this.calculateBollingerBands(data, 20, 2);
    const bbWidth = bb?.bandwidth || 0;

    // 価格の位置（BBの中での位置）
    const currentPrice = data[data.length - 1];
    const bbPosition = bb ? ((currentPrice - bb.lower) / (bb.upper - bb.lower)) * 100 : 50;

    // ATRの変化率（ブレイクアウト検出用）
    const atrChange = this.calculateATRChangeRate(data);

    // RSIの極値チェック
    const rsi = this.calculateRSI(data, 14);

    // トレンド方向の判定（EMA短期 vs EMA長期）
    const ema5 = this.calculateEMA(data, 5);
    const ema20 = this.calculateEMA(data, 20);
    const trendDirection = ema5 > ema20 ? 'UP' : 'DOWN';

    // 直近の価格変動方向（モメンタム）
    const recentChange = data.length >= 5 ? data[data.length - 1] - data[data.length - 5] : 0;
    const momentumDirection = recentChange > 0 ? 'UP' : 'DOWN';

    // レジーム判定（v5.8.13: 動的閾値を使用）
    let regime = MarketRegime.RANGE;
    let confidence = 0;
    const details = {
      adx: adxValue,
      bbWidth,
      bbPosition,
      atrChange,
      rsi,
      trendDirection,
      analysisPeriod,
      volatilityRegime: thresholds.volatilityRegime || 'STATIC'
    };

    // 1. 強いトレンド（方向付き）- 動的ADX閾値使用
    if (adxValue >= thresholds.adxStrongTrendThreshold) {
      regime = trendDirection === 'UP' ? MarketRegime.STRONG_TREND_UP : MarketRegime.STRONG_TREND_DOWN;
      confidence = Math.min(100, 50 + adxValue);
    }
    // 2. 弱いトレンド（方向付き）- 動的ADX閾値使用
    else if (adxValue >= thresholds.adxTrendThreshold) {
      regime = trendDirection === 'UP' ? MarketRegime.WEAK_TREND_UP : MarketRegime.WEAK_TREND_DOWN;
      confidence = Math.min(100, 40 + adxValue);
    }
    // 3. ブレイクアウト（方向付き）- 動的BB閾値使用
    else if (atrChange > 1.3 && (bbPosition < thresholds.bbOversoldPosition || bbPosition > thresholds.bbOverboughtPosition)) {
      regime = bbPosition > 50 ? MarketRegime.BREAKOUT_UP : MarketRegime.BREAKOUT_DOWN;
      confidence = Math.min(100, 60 + atrChange * 10);
    }
    // 4. 反転局面（方向付き）- 動的RSI閾値使用
    else if ((rsi <= thresholds.rsiExtreme || rsi >= 100 - thresholds.rsiExtreme) &&
             (bbPosition < 20 || bbPosition > 80)) {
      // RSIが低い（売られすぎ）→上方反転、RSIが高い（買われすぎ）→下方反転
      regime = rsi <= this.config.rsiExtreme ? MarketRegime.REVERSAL_UP : MarketRegime.REVERSAL_DOWN;
      confidence = Math.min(100, 50 + Math.abs(50 - rsi));
    }
    // 5. レンジ
    else {
      regime = MarketRegime.RANGE;
      confidence = Math.max(30, 80 - adxValue);
    }

    etaLog(`[ETA] Market Regime: ${regime} (confidence: ${confidence}%, period: ${analysisPeriod}s)`);

    return { regime, confidence, details };
  }

  /**
   * ATR変化率を計算
   * @param {Array} data - 価格データ
   * @returns {number} ATR変化率
   */
  calculateATRChangeRate(data) {
    if (data.length < 28) return 1.0;

    const recentATR = this.calculateATR(data.slice(-14), 14);
    const prevATR = this.calculateATR(data.slice(-28, -14), 14);

    if (!prevATR || prevATR === 0) return 1.0;
    return recentATR / prevATR;
  }

  // ========================================
  // 3. Confluence Scoring System
  // ========================================

  /**
   * コンフルエンススコアを計算（100点満点）
   * 相場状況に応じた採点基準を使用
   * @param {string} direction - 'HIGH' または 'LOW'
   * @param {string} regime - マーケットレジーム（省略時は自動検出）
   * @returns {Object} スコア詳細
   */
  calculateConfluenceScore(direction, regime = null) {
    const data = this.priceHistory;
    if (!data || data.length < 50) {
      return { total: 0, breakdown: {}, grade: 'F' };
    }

    // レジームが指定されていない場合は検出
    if (!regime) {
      const detected = this.detectMarketRegime();
      regime = detected.regime;
    }

    // レジームの基本タイプを取得（方向を除外）
    const baseRegime = regime.replace(/_UP$|_DOWN$/, '');

    let breakdown = {};
    let total = 0;

    // 相場状況に応じた採点基準を適用
    switch (baseRegime) {
      case 'STRONG_TREND':
      case 'WEAK_TREND':
        // トレンド相場用の採点（強・弱共通）
        ({ breakdown, total } = this.calculateTrendScore(data, direction));
        break;

      case 'RANGE':
        // レンジ相場用の採点
        ({ breakdown, total } = this.calculateRangeScore(data, direction));
        break;

      case 'BREAKOUT':
        // ブレイクアウト用の採点
        ({ breakdown, total } = this.calculateBreakoutScore(data, direction));
        break;

      case 'REVERSAL':
        // 反転用の採点
        ({ breakdown, total } = this.calculateReversalScore(data, direction));
        break;

      default:
        // デフォルトはトレンド用
        ({ breakdown, total } = this.calculateTrendScore(data, direction));
    }

    // グレード判定
    let grade = 'F';
    if (total >= 90) grade = 'A+';
    else if (total >= 85) grade = 'A';
    else if (total >= 80) grade = 'B+';
    else if (total >= 75) grade = 'B';
    else if (total >= 70) grade = 'C+';
    else if (total >= 65) grade = 'C';
    else if (total >= 60) grade = 'D';

    etaLog(`[Confluence] Regime: ${regime}, Total: ${total}, Grade: ${grade}`);

    return { total: Math.round(total), breakdown, grade, regime };
  }

  /**
   * トレンド相場用スコア計算（100点満点）
   * 強トレンド・弱トレンド共通
   * 重視: EMA順序、ADX強度、モメンタム方向、MACD
   */
  calculateTrendScore(data, direction) {
    const breakdown = {};
    let total = 0;

    // 1. EMA順序・トレンド構造 (30点)
    breakdown.trendStructure = this.scoreTrendStructure(data, direction);
    total += breakdown.trendStructure.score;

    // 2. ADXトレンド強度 (25点)
    breakdown.adxStrength = this.scoreADXStrength(data, direction);
    total += breakdown.adxStrength.score;

    // 3. モメンタム・MACD (25点)
    breakdown.momentum = this.scoreTrendMomentum(data, direction);
    total += breakdown.momentum.score;

    // 4. 価格とEMAの位置関係 (20点)
    breakdown.pricePosition = this.scoreTrendPricePosition(data, direction);
    total += breakdown.pricePosition.score;

    return { breakdown, total };
  }

  /**
   * レンジ相場用スコア計算（100点満点）
   * 重視: RSI極値、BB位置、反転シグナル
   */
  calculateRangeScore(data, direction) {
    const breakdown = {};
    let total = 0;

    // 1. RSI極値・反転シグナル (35点)
    breakdown.rsiReversal = this.scoreRangeRSI(data, direction);
    total += breakdown.rsiReversal.score;

    // 2. BB位置・反発ポイント (30点)
    breakdown.bbPosition = this.scoreRangeBBPosition(data, direction);
    total += breakdown.bbPosition.score;

    // 3. ストキャスティクス (20点)
    breakdown.stochastic = this.scoreRangeStochastic(data, direction);
    total += breakdown.stochastic.score;

    // 4. サポレジ距離 (15点)
    breakdown.supportResist = this.scoreRangeSR(data, direction);
    total += breakdown.supportResist.score;

    return { breakdown, total };
  }

  /**
   * ブレイクアウト用スコア計算（100点満点）
   * 重視: ATR変化、BBブレイク、モメンタム加速
   */
  calculateBreakoutScore(data, direction) {
    const breakdown = {};
    let total = 0;

    // 1. ATR変化率・ボラティリティ拡大 (30点)
    breakdown.atrChange = this.scoreBreakoutATR(data, direction);
    total += breakdown.atrChange.score;

    // 2. BBブレイク・価格位置 (30点)
    breakdown.bbBreak = this.scoreBreakoutBB(data, direction);
    total += breakdown.bbBreak.score;

    // 3. モメンタム加速 (25点)
    breakdown.momentumAccel = this.scoreBreakoutMomentum(data, direction);
    total += breakdown.momentumAccel.score;

    // 4. 出来高的指標（連続足） (15点)
    breakdown.consecutive = this.scoreBreakoutConsecutive(data, direction);
    total += breakdown.consecutive.score;

    return { breakdown, total };
  }

  /**
   * 反転用スコア計算（100点満点）
   * 重視: RSI極値、ダイバージェンス的動き、BB端
   */
  calculateReversalScore(data, direction) {
    const breakdown = {};
    let total = 0;

    // 1. RSI極値・過熱感 (35点)
    breakdown.rsiExtreme = this.scoreReversalRSI(data, direction);
    total += breakdown.rsiExtreme.score;

    // 2. BB端での反転シグナル (30点)
    breakdown.bbEdge = this.scoreReversalBB(data, direction);
    total += breakdown.bbEdge.score;

    // 3. ダイバージェンス的動き (20点)
    breakdown.divergence = this.scoreReversalDivergence(data, direction);
    total += breakdown.divergence.score;

    // 4. 反転足パターン (15点)
    breakdown.candlePattern = this.scoreReversalCandle(data, direction);
    total += breakdown.candlePattern.score;

    return { breakdown, total };
  }

  // ========================================
  // トレンド相場用スコア関数
  // ========================================

  /**
   * トレンド構造スコア（30点満点）
   */
  scoreTrendStructure(data, direction) {
    let score = 0;
    const reasons = [];

    const ema5 = this.calculateEMAArray(data, 5);
    const ema20 = this.calculateEMAArray(data, 20);
    const ema50 = this.calculateEMAArray(data, 50);

    if (ema5.length < 5) return { score: 0, reasons: ['データ不足'] };

    const currentPrice = data[data.length - 1];
    const ema5Current = ema5[ema5.length - 1];
    const ema20Current = ema20[ema20.length - 1];
    const ema50Current = ema50[ema50.length - 1];

    if (direction === 'HIGH') {
      // パーフェクトオーダー（上昇）
      if (currentPrice > ema5Current && ema5Current > ema20Current && ema20Current > ema50Current) {
        score += 30;
        reasons.push('パーフェクトオーダー（上昇）');
      } else if (ema5Current > ema20Current && ema20Current > ema50Current) {
        score += 22;
        reasons.push('EMA上昇配列');
      } else if (currentPrice > ema20Current && ema20Current > ema50Current) {
        score += 15;
        reasons.push('上昇トレンド構造');
      } else if (currentPrice > ema50Current) {
        score += 8;
        reasons.push('長期線上');
      }
    } else {
      // パーフェクトオーダー（下降）
      if (currentPrice < ema5Current && ema5Current < ema20Current && ema20Current < ema50Current) {
        score += 30;
        reasons.push('パーフェクトオーダー（下降）');
      } else if (ema5Current < ema20Current && ema20Current < ema50Current) {
        score += 22;
        reasons.push('EMA下降配列');
      } else if (currentPrice < ema20Current && ema20Current < ema50Current) {
        score += 15;
        reasons.push('下降トレンド構造');
      } else if (currentPrice < ema50Current) {
        score += 8;
        reasons.push('長期線下');
      }
    }

    return { score: Math.min(30, score), reasons };
  }

  /**
   * ADX強度スコア（25点満点）
   */
  scoreADXStrength(data, direction) {
    let score = 0;
    const reasons = [];

    const adx = this.calculateADX(data, 14);
    if (!adx) return { score: 5, reasons: ['ADX計算不可'] };

    // ADX強度
    if (adx.adx >= 35) {
      score += 15;
      reasons.push(`ADX非常に強い: ${Math.round(adx.adx)}`);
    } else if (adx.adx >= 25) {
      score += 12;
      reasons.push(`ADX強い: ${Math.round(adx.adx)}`);
    } else if (adx.adx >= 18) {
      score += 8;
      reasons.push(`ADX中程度: ${Math.round(adx.adx)}`);
    } else {
      score += 3;
      reasons.push(`ADX弱い: ${Math.round(adx.adx)}`);
    }

    // DI方向
    if (direction === 'HIGH' && adx.plusDI > adx.minusDI) {
      const diff = adx.plusDI - adx.minusDI;
      if (diff > 15) {
        score += 10;
        reasons.push('+DI優勢（強）');
      } else if (diff > 5) {
        score += 7;
        reasons.push('+DI優勢');
      } else {
        score += 3;
        reasons.push('+DIわずかに優勢');
      }
    } else if (direction === 'LOW' && adx.minusDI > adx.plusDI) {
      const diff = adx.minusDI - adx.plusDI;
      if (diff > 15) {
        score += 10;
        reasons.push('-DI優勢（強）');
      } else if (diff > 5) {
        score += 7;
        reasons.push('-DI優勢');
      } else {
        score += 3;
        reasons.push('-DIわずかに優勢');
      }
    }

    return { score: Math.min(25, score), reasons };
  }

  /**
   * トレンドモメンタムスコア（25点満点）
   */
  scoreTrendMomentum(data, direction) {
    let score = 0;
    const reasons = [];

    // MACD
    const macd = this.calculateMACD(data);
    if (macd) {
      if (direction === 'HIGH') {
        if (macd.histogram > 0 && macd.macd > macd.signal) {
          score += 12;
          reasons.push('MACD上昇シグナル');
        } else if (macd.histogram > 0) {
          score += 8;
          reasons.push('MACDヒストグラム+');
        } else if (macd.macd > macd.signal) {
          score += 5;
          reasons.push('MACDシグナル上');
        }
      } else {
        if (macd.histogram < 0 && macd.macd < macd.signal) {
          score += 12;
          reasons.push('MACD下降シグナル');
        } else if (macd.histogram < 0) {
          score += 8;
          reasons.push('MACDヒストグラム-');
        } else if (macd.macd < macd.signal) {
          score += 5;
          reasons.push('MACDシグナル下');
        }
      }
    }

    // モメンタム
    const momentum = this.calculateMomentum(data, 10);
    if (momentum !== null) {
      if (direction === 'HIGH' && momentum > 0.15) {
        score += 8;
        reasons.push(`強いモメンタム+${momentum.toFixed(2)}%`);
      } else if (direction === 'HIGH' && momentum > 0) {
        score += 5;
        reasons.push(`モメンタム+${momentum.toFixed(2)}%`);
      } else if (direction === 'LOW' && momentum < -0.15) {
        score += 8;
        reasons.push(`強いモメンタム${momentum.toFixed(2)}%`);
      } else if (direction === 'LOW' && momentum < 0) {
        score += 5;
        reasons.push(`モメンタム${momentum.toFixed(2)}%`);
      }
    }

    // 連続足
    const consecutive = this.countConsecutiveCandles(data);
    if (direction === 'HIGH' && consecutive.bullish >= 4) {
      score += 5;
      reasons.push(`連続陽線${consecutive.bullish}本`);
    } else if (direction === 'HIGH' && consecutive.bullish >= 2) {
      score += 3;
      reasons.push(`連続陽線${consecutive.bullish}本`);
    } else if (direction === 'LOW' && consecutive.bearish >= 4) {
      score += 5;
      reasons.push(`連続陰線${consecutive.bearish}本`);
    } else if (direction === 'LOW' && consecutive.bearish >= 2) {
      score += 3;
      reasons.push(`連続陰線${consecutive.bearish}本`);
    }

    return { score: Math.min(25, score), reasons };
  }

  /**
   * トレンド価格位置スコア（20点満点）
   */
  scoreTrendPricePosition(data, direction) {
    let score = 0;
    const reasons = [];

    const currentPrice = data[data.length - 1];
    const ema20 = this.calculateEMA(data, 20);
    const bb = this.calculateBollingerBands(data, 20, 2);

    if (!ema20 || !bb) return { score: 5, reasons: ['データ不足'] };

    // 価格とEMA20の距離（トレンドの押し目・戻り）
    const distFromEMA = ((currentPrice - ema20) / ema20) * 100;

    if (direction === 'HIGH') {
      // 上昇トレンドでEMA20近くは良いエントリー
      if (distFromEMA > 0 && distFromEMA < 0.3) {
        score += 15;
        reasons.push('EMA20付近（押し目）');
      } else if (distFromEMA > 0.3 && distFromEMA < 0.8) {
        score += 10;
        reasons.push('EMA20上方');
      } else if (distFromEMA >= 0.8) {
        score += 5;
        reasons.push('EMA20から離れすぎ');
      } else if (distFromEMA < 0) {
        score += 3;
        reasons.push('EMA20下（逆行注意）');
      }
    } else {
      if (distFromEMA < 0 && distFromEMA > -0.3) {
        score += 15;
        reasons.push('EMA20付近（戻り）');
      } else if (distFromEMA < -0.3 && distFromEMA > -0.8) {
        score += 10;
        reasons.push('EMA20下方');
      } else if (distFromEMA <= -0.8) {
        score += 5;
        reasons.push('EMA20から離れすぎ');
      } else if (distFromEMA > 0) {
        score += 3;
        reasons.push('EMA20上（逆行注意）');
      }
    }

    // BB位置
    const bbPosition = ((currentPrice - bb.lower) / (bb.upper - bb.lower)) * 100;
    if (direction === 'HIGH' && bbPosition >= 40 && bbPosition <= 70) {
      score += 5;
      reasons.push('BB中央〜上位');
    } else if (direction === 'LOW' && bbPosition >= 30 && bbPosition <= 60) {
      score += 5;
      reasons.push('BB中央〜下位');
    }

    return { score: Math.min(20, score), reasons };
  }

  // ========================================
  // レンジ相場用スコア関数
  // ========================================

  /**
   * レンジRSIスコア（35点満点）
   */
  scoreRangeRSI(data, direction) {
    let score = 0;
    const reasons = [];

    const rsi = this.calculateRSI(data, 14);
    if (rsi === null) return { score: 5, reasons: ['RSI計算不可'] };

    if (direction === 'HIGH') {
      // レンジでHIGHを狙うならRSIは低い方が良い
      if (rsi <= 25) {
        score += 35;
        reasons.push(`RSI極度売られすぎ: ${Math.round(rsi)}`);
      } else if (rsi <= 35) {
        score += 28;
        reasons.push(`RSI売られすぎ: ${Math.round(rsi)}`);
      } else if (rsi <= 45) {
        score += 20;
        reasons.push(`RSIやや低い: ${Math.round(rsi)}`);
      } else if (rsi <= 55) {
        score += 12;
        reasons.push(`RSI中立: ${Math.round(rsi)}`);
      } else {
        score += 5;
        reasons.push(`RSI高すぎ: ${Math.round(rsi)}`);
      }
    } else {
      // レンジでLOWを狙うならRSIは高い方が良い
      if (rsi >= 75) {
        score += 35;
        reasons.push(`RSI極度買われすぎ: ${Math.round(rsi)}`);
      } else if (rsi >= 65) {
        score += 28;
        reasons.push(`RSI買われすぎ: ${Math.round(rsi)}`);
      } else if (rsi >= 55) {
        score += 20;
        reasons.push(`RSIやや高い: ${Math.round(rsi)}`);
      } else if (rsi >= 45) {
        score += 12;
        reasons.push(`RSI中立: ${Math.round(rsi)}`);
      } else {
        score += 5;
        reasons.push(`RSI低すぎ: ${Math.round(rsi)}`);
      }
    }

    return { score: Math.min(35, score), reasons };
  }

  /**
   * レンジBB位置スコア（30点満点）
   */
  scoreRangeBBPosition(data, direction) {
    let score = 0;
    const reasons = [];

    const bb = this.calculateBollingerBands(data, 20, 2);
    if (!bb) return { score: 5, reasons: ['BB計算不可'] };

    const currentPrice = data[data.length - 1];
    const bbPosition = ((currentPrice - bb.lower) / (bb.upper - bb.lower)) * 100;

    if (direction === 'HIGH') {
      // レンジでHIGHを狙うなら下限付近が良い
      if (bbPosition <= 10) {
        score += 30;
        reasons.push(`BB下限タッチ: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 20) {
        score += 25;
        reasons.push(`BB下限付近: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 35) {
        score += 18;
        reasons.push(`BB下位: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 50) {
        score += 10;
        reasons.push(`BB中央: ${Math.round(bbPosition)}%`);
      } else {
        score += 3;
        reasons.push(`BB上位（反発遠い）: ${Math.round(bbPosition)}%`);
      }
    } else {
      // レンジでLOWを狙うなら上限付近が良い
      if (bbPosition >= 90) {
        score += 30;
        reasons.push(`BB上限タッチ: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 80) {
        score += 25;
        reasons.push(`BB上限付近: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 65) {
        score += 18;
        reasons.push(`BB上位: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 50) {
        score += 10;
        reasons.push(`BB中央: ${Math.round(bbPosition)}%`);
      } else {
        score += 3;
        reasons.push(`BB下位（反落遠い）: ${Math.round(bbPosition)}%`);
      }
    }

    return { score: Math.min(30, score), reasons };
  }

  /**
   * レンジストキャスティクススコア（20点満点）
   */
  scoreRangeStochastic(data, direction) {
    let score = 0;
    const reasons = [];

    const stoch = this.calculateStochastic(data, 14, 3, 3);
    if (!stoch) return { score: 5, reasons: ['Stoch計算不可'] };

    if (direction === 'HIGH') {
      if (stoch.k <= 20 && stoch.k > stoch.d) {
        score += 20;
        reasons.push('Stoch売られすぎ＋上向き');
      } else if (stoch.k <= 20) {
        score += 15;
        reasons.push('Stoch売られすぎ');
      } else if (stoch.k <= 40 && stoch.k > stoch.d) {
        score += 12;
        reasons.push('Stoch低位＋上向き');
      } else if (stoch.k > stoch.d) {
        score += 8;
        reasons.push('Stoch上向き');
      } else {
        score += 3;
        reasons.push('Stoch下向き');
      }
    } else {
      if (stoch.k >= 80 && stoch.k < stoch.d) {
        score += 20;
        reasons.push('Stoch買われすぎ＋下向き');
      } else if (stoch.k >= 80) {
        score += 15;
        reasons.push('Stoch買われすぎ');
      } else if (stoch.k >= 60 && stoch.k < stoch.d) {
        score += 12;
        reasons.push('Stoch高位＋下向き');
      } else if (stoch.k < stoch.d) {
        score += 8;
        reasons.push('Stoch下向き');
      } else {
        score += 3;
        reasons.push('Stoch上向き');
      }
    }

    return { score: Math.min(20, score), reasons };
  }

  /**
   * レンジサポレジスコア（15点満点）
   */
  scoreRangeSR(data, direction) {
    let score = 0;
    const reasons = [];

    const sr = this.detectSupportResistance(data);
    if (!sr) return { score: 5, reasons: ['SR検出不可'] };

    const currentPrice = data[data.length - 1];
    const range = sr.resistance - sr.support;
    const distToSupport = ((currentPrice - sr.support) / range) * 100;
    const distToResist = ((sr.resistance - currentPrice) / range) * 100;

    if (direction === 'HIGH') {
      if (distToSupport <= 15) {
        score += 15;
        reasons.push('サポート付近');
      } else if (distToSupport <= 30) {
        score += 10;
        reasons.push('サポート近い');
      } else if (distToSupport <= 50) {
        score += 5;
        reasons.push('レンジ下半分');
      }
    } else {
      if (distToResist <= 15) {
        score += 15;
        reasons.push('レジスタンス付近');
      } else if (distToResist <= 30) {
        score += 10;
        reasons.push('レジスタンス近い');
      } else if (distToResist <= 50) {
        score += 5;
        reasons.push('レンジ上半分');
      }
    }

    return { score: Math.min(15, score), reasons };
  }

  // ========================================
  // ブレイクアウト用スコア関数
  // ========================================

  /**
   * ブレイクアウトATRスコア（30点満点）
   */
  scoreBreakoutATR(data, direction) {
    let score = 0;
    const reasons = [];

    const atrChange = this.calculateATRChangeRate(data);

    if (atrChange >= 2.0) {
      score += 30;
      reasons.push(`ATR急拡大: ${atrChange.toFixed(2)}倍`);
    } else if (atrChange >= 1.5) {
      score += 24;
      reasons.push(`ATR拡大: ${atrChange.toFixed(2)}倍`);
    } else if (atrChange >= 1.3) {
      score += 18;
      reasons.push(`ATRやや拡大: ${atrChange.toFixed(2)}倍`);
    } else if (atrChange >= 1.1) {
      score += 10;
      reasons.push(`ATR微増: ${atrChange.toFixed(2)}倍`);
    } else {
      score += 5;
      reasons.push(`ATR変化なし: ${atrChange.toFixed(2)}倍`);
    }

    return { score: Math.min(30, score), reasons };
  }

  /**
   * ブレイクアウトBBスコア（30点満点）
   */
  scoreBreakoutBB(data, direction) {
    let score = 0;
    const reasons = [];

    const bb = this.calculateBollingerBands(data, 20, 2);
    if (!bb) return { score: 5, reasons: ['BB計算不可'] };

    const currentPrice = data[data.length - 1];
    const bbPosition = ((currentPrice - bb.lower) / (bb.upper - bb.lower)) * 100;

    if (direction === 'HIGH') {
      // 上方ブレイク
      if (currentPrice > bb.upper) {
        score += 30;
        reasons.push('BB上限ブレイク');
      } else if (bbPosition >= 90) {
        score += 24;
        reasons.push(`BB上限付近: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 80) {
        score += 18;
        reasons.push(`BB上位: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 60) {
        score += 10;
        reasons.push(`BB中央上: ${Math.round(bbPosition)}%`);
      } else {
        score += 3;
        reasons.push('ブレイク位置遠い');
      }
    } else {
      // 下方ブレイク
      if (currentPrice < bb.lower) {
        score += 30;
        reasons.push('BB下限ブレイク');
      } else if (bbPosition <= 10) {
        score += 24;
        reasons.push(`BB下限付近: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 20) {
        score += 18;
        reasons.push(`BB下位: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 40) {
        score += 10;
        reasons.push(`BB中央下: ${Math.round(bbPosition)}%`);
      } else {
        score += 3;
        reasons.push('ブレイク位置遠い');
      }
    }

    return { score: Math.min(30, score), reasons };
  }

  /**
   * ブレイクアウトモメンタムスコア（25点満点）
   */
  scoreBreakoutMomentum(data, direction) {
    let score = 0;
    const reasons = [];

    // モメンタム加速
    const momentum = this.calculateMomentum(data, 10);
    const shortMomentum = this.calculateMomentum(data, 5);

    if (momentum !== null && shortMomentum !== null) {
      if (direction === 'HIGH') {
        if (shortMomentum > momentum && shortMomentum > 0.2) {
          score += 15;
          reasons.push('モメンタム加速中');
        } else if (shortMomentum > 0.15) {
          score += 12;
          reasons.push('強いモメンタム');
        } else if (shortMomentum > 0) {
          score += 8;
          reasons.push('正のモメンタム');
        }
      } else {
        if (shortMomentum < momentum && shortMomentum < -0.2) {
          score += 15;
          reasons.push('モメンタム加速中');
        } else if (shortMomentum < -0.15) {
          score += 12;
          reasons.push('強いモメンタム');
        } else if (shortMomentum < 0) {
          score += 8;
          reasons.push('負のモメンタム');
        }
      }
    }

    // MACD
    const macd = this.calculateMACD(data);
    if (macd) {
      if (direction === 'HIGH' && macd.histogram > 0 && macd.macd > macd.signal) {
        score += 10;
        reasons.push('MACDブル');
      } else if (direction === 'LOW' && macd.histogram < 0 && macd.macd < macd.signal) {
        score += 10;
        reasons.push('MACDベア');
      }
    }

    return { score: Math.min(25, score), reasons };
  }

  /**
   * ブレイクアウト連続足スコア（15点満点）
   */
  scoreBreakoutConsecutive(data, direction) {
    let score = 0;
    const reasons = [];

    const consecutive = this.countConsecutiveCandles(data);

    if (direction === 'HIGH') {
      if (consecutive.bullish >= 5) {
        score += 15;
        reasons.push(`強い連続陽線: ${consecutive.bullish}本`);
      } else if (consecutive.bullish >= 3) {
        score += 10;
        reasons.push(`連続陽線: ${consecutive.bullish}本`);
      } else if (consecutive.bullish >= 2) {
        score += 5;
        reasons.push(`陽線継続: ${consecutive.bullish}本`);
      }
    } else {
      if (consecutive.bearish >= 5) {
        score += 15;
        reasons.push(`強い連続陰線: ${consecutive.bearish}本`);
      } else if (consecutive.bearish >= 3) {
        score += 10;
        reasons.push(`連続陰線: ${consecutive.bearish}本`);
      } else if (consecutive.bearish >= 2) {
        score += 5;
        reasons.push(`陰線継続: ${consecutive.bearish}本`);
      }
    }

    return { score: Math.min(15, score), reasons };
  }

  // ========================================
  // 反転用スコア関数
  // ========================================

  /**
   * 反転RSIスコア（35点満点）
   */
  scoreReversalRSI(data, direction) {
    let score = 0;
    const reasons = [];

    const rsi = this.calculateRSI(data, 14);
    if (rsi === null) return { score: 5, reasons: ['RSI計算不可'] };

    if (direction === 'HIGH') {
      // 上方反転を狙う（下落からの転換）→RSIが低い状態
      if (rsi <= 20) {
        score += 35;
        reasons.push(`RSI極度売られすぎ: ${Math.round(rsi)}`);
      } else if (rsi <= 30) {
        score += 28;
        reasons.push(`RSI売られすぎ: ${Math.round(rsi)}`);
      } else if (rsi <= 40) {
        score += 20;
        reasons.push(`RSI低位: ${Math.round(rsi)}`);
      } else {
        score += 8;
        reasons.push(`RSI反転条件弱い: ${Math.round(rsi)}`);
      }
    } else {
      // 下方反転を狙う（上昇からの転換）→RSIが高い状態
      if (rsi >= 80) {
        score += 35;
        reasons.push(`RSI極度買われすぎ: ${Math.round(rsi)}`);
      } else if (rsi >= 70) {
        score += 28;
        reasons.push(`RSI買われすぎ: ${Math.round(rsi)}`);
      } else if (rsi >= 60) {
        score += 20;
        reasons.push(`RSI高位: ${Math.round(rsi)}`);
      } else {
        score += 8;
        reasons.push(`RSI反転条件弱い: ${Math.round(rsi)}`);
      }
    }

    return { score: Math.min(35, score), reasons };
  }

  /**
   * 反転BBスコア（30点満点）
   */
  scoreReversalBB(data, direction) {
    let score = 0;
    const reasons = [];

    const bb = this.calculateBollingerBands(data, 20, 2);
    if (!bb) return { score: 5, reasons: ['BB計算不可'] };

    const currentPrice = data[data.length - 1];
    const bbPosition = ((currentPrice - bb.lower) / (bb.upper - bb.lower)) * 100;

    if (direction === 'HIGH') {
      // 上方反転→BB下限からの反発
      if (currentPrice <= bb.lower) {
        score += 30;
        reasons.push('BB下限以下（反発期待）');
      } else if (bbPosition <= 10) {
        score += 25;
        reasons.push(`BB下限付近: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 20) {
        score += 18;
        reasons.push(`BB下位: ${Math.round(bbPosition)}%`);
      } else if (bbPosition <= 35) {
        score += 10;
        reasons.push(`BB下半分: ${Math.round(bbPosition)}%`);
      } else {
        score += 3;
        reasons.push('反発位置遠い');
      }
    } else {
      // 下方反転→BB上限からの反落
      if (currentPrice >= bb.upper) {
        score += 30;
        reasons.push('BB上限以上（反落期待）');
      } else if (bbPosition >= 90) {
        score += 25;
        reasons.push(`BB上限付近: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 80) {
        score += 18;
        reasons.push(`BB上位: ${Math.round(bbPosition)}%`);
      } else if (bbPosition >= 65) {
        score += 10;
        reasons.push(`BB上半分: ${Math.round(bbPosition)}%`);
      } else {
        score += 3;
        reasons.push('反落位置遠い');
      }
    }

    return { score: Math.min(30, score), reasons };
  }

  /**
   * 反転ダイバージェンススコア（20点満点）
   * ※簡易版：価格とRSIの乖離で判定
   */
  scoreReversalDivergence(data, direction) {
    let score = 0;
    const reasons = [];

    if (data.length < 20) return { score: 5, reasons: ['データ不足'] };

    // 直近の価格変化
    const recentPrices = data.slice(-10);
    const prevPrices = data.slice(-20, -10);
    const recentHigh = Math.max(...recentPrices);
    const prevHigh = Math.max(...prevPrices);
    const recentLow = Math.min(...recentPrices);
    const prevLow = Math.min(...prevPrices);

    // RSI変化
    const currentRSI = this.calculateRSI(data, 14);
    const prevRSI = this.calculateRSI(data.slice(0, -10), 14);

    if (currentRSI === null || prevRSI === null) return { score: 5, reasons: ['RSI計算不可'] };

    if (direction === 'HIGH') {
      // 弱気ダイバージェンス的動き（価格は安値更新、RSIは上昇）
      if (recentLow < prevLow && currentRSI > prevRSI) {
        score += 20;
        reasons.push('弱気ダイバージェンス的');
      } else if (currentRSI > prevRSI + 5) {
        score += 12;
        reasons.push('RSI上昇中');
      } else if (currentRSI > prevRSI) {
        score += 8;
        reasons.push('RSIやや上昇');
      }
    } else {
      // 強気ダイバージェンス的動き（価格は高値更新、RSIは下降）
      if (recentHigh > prevHigh && currentRSI < prevRSI) {
        score += 20;
        reasons.push('強気ダイバージェンス的');
      } else if (currentRSI < prevRSI - 5) {
        score += 12;
        reasons.push('RSI下降中');
      } else if (currentRSI < prevRSI) {
        score += 8;
        reasons.push('RSIやや下降');
      }
    }

    return { score: Math.min(20, score), reasons };
  }

  /**
   * 反転足パターンスコア（15点満点）
   */
  scoreReversalCandle(data, direction) {
    let score = 0;
    const reasons = [];

    if (data.length < 5) return { score: 5, reasons: ['データ不足'] };

    // 直近の動き
    const last5 = data.slice(-5);
    const lastChange = last5[4] - last5[3];
    const prevChange = last5[3] - last5[2];
    const prev2Change = last5[2] - last5[1];

    if (direction === 'HIGH') {
      // 下落後の反転
      if (prev2Change < 0 && prevChange < 0 && lastChange > 0) {
        score += 15;
        reasons.push('下落後反転パターン');
      } else if (prevChange < 0 && lastChange > 0) {
        score += 10;
        reasons.push('陰線後陽線');
      } else if (lastChange > 0) {
        score += 5;
        reasons.push('直近陽線');
      }
    } else {
      // 上昇後の反転
      if (prev2Change > 0 && prevChange > 0 && lastChange < 0) {
        score += 15;
        reasons.push('上昇後反転パターン');
      } else if (prevChange > 0 && lastChange < 0) {
        score += 10;
        reasons.push('陽線後陰線');
      } else if (lastChange < 0) {
        score += 5;
        reasons.push('直近陰線');
      }
    }

    return { score: Math.min(15, score), reasons };
  }

  // ========================================
  // 4. Dynamic Parameter Optimization
  // ========================================

  /**
   * 現在のレジームに基づいてパラメータを最適化
   * @param {string} regime - マーケットレジーム
   * @returns {Object} 最適化されたパラメータ
   */
  getOptimizedParameters(regime) {
    const baseParams = { ...this.config };

    // 方向付きレジームを基本タイプに変換
    const baseRegime = regime.replace(/_UP$|_DOWN$/, '');

    switch (baseRegime) {
      case 'STRONG_TREND':
        return {
          ...baseParams,
          // 強いトレンド時は指標一致の閾値を下げ、トレンドフォローしやすく
          minIndicatorAgreement: 0.5,
          minConfluenceScore: 65,
          rsiOverbought: 75,  // RSI閾値を緩和
          rsiOversold: 25,
          preferredStrategy: 'TREND_FOLLOW'
        };

      case 'WEAK_TREND':
        return {
          ...baseParams,
          minIndicatorAgreement: 0.55,
          minConfluenceScore: 70,
          preferredStrategy: 'TREND_FOLLOW_CAUTIOUS'
        };

      case 'RANGE':
        return {
          ...baseParams,
          // レンジ相場では厳格に
          minIndicatorAgreement: 0.65,
          minConfluenceScore: 75,
          rsiOverbought: 65,  // RSI閾値を厳格に
          rsiOversold: 35,
          preferredStrategy: 'RANGE_REVERSAL'
        };

      case 'BREAKOUT':
        return {
          ...baseParams,
          minIndicatorAgreement: 0.6,
          minConfluenceScore: 70,
          maxVolatilityRatio: 3.0,  // ボラティリティ許容を上げる
          preferredStrategy: 'BREAKOUT_FOLLOW'
        };

      case 'REVERSAL':
        return {
          ...baseParams,
          // 反転局面では非常に厳格に
          minIndicatorAgreement: 0.7,
          minConfluenceScore: 80,
          preferredStrategy: 'REVERSAL_CATCH'
        };

      default:
        return baseParams;
    }
  }

  // ========================================
  // 5. Entry Quality Filter
  // ========================================

  /**
   * エントリー品質を評価
   * @param {string} direction - 'HIGH' または 'LOW'
   * @param {Object} cachedRegime - キャッシュ済みのレジーム情報（省略可）
   * @param {Object} cachedMtf - キャッシュ済みのMTF分析結果（省略可）
   * @returns {Object} 品質評価結果
   */
  evaluateEntryQuality(direction, cachedRegime = null, cachedMtf = null) {
    // キャッシュがあれば再利用（パフォーマンス最適化）
    const regime = cachedRegime || this.detectMarketRegime();
    const mtfAnalysis = cachedMtf || this.analyzeMultiTimeframe();

    const params = this.getOptimizedParameters(regime.regime);
    // レジームに応じた採点基準でスコア計算
    const confluenceScore = this.calculateConfluenceScore(direction, regime.regime);

    // 品質チェック項目
    const checks = {
      regimeMatch: this.checkRegimeMatch(regime.regime, direction),
      confluencePass: confluenceScore.total >= params.minConfluenceScore,
      mtfAgreement: mtfAnalysis.confluence.directionAgreement >= params.minIndicatorAgreement * 100,
      volatilityOk: this.checkVolatilityOk(params),
      noConflictingSignal: this.checkNoConflictingSignals(direction)
    };

    // 全てのチェックをパス
    const allPassed = Object.values(checks).every(v => v === true);

    // 品質スコア（0-100）
    const passedCount = Object.values(checks).filter(v => v === true).length;
    const qualityScore = Math.round((passedCount / Object.keys(checks).length) * 100);

    // 推奨アクション
    let recommendation = 'SKIP';
    let reason = '';

    if (allPassed && confluenceScore.total >= params.highQualityScore) {
      recommendation = 'STRONG_ENTRY';
      reason = '全条件クリア + 高品質スコア';
    } else if (allPassed) {
      recommendation = 'ENTRY';
      reason = '全条件クリア';
    } else if (passedCount >= 4) {
      recommendation = 'WEAK_ENTRY';
      reason = `${passedCount}/5条件クリア`;
    } else {
      recommendation = 'SKIP';
      const failedChecks = Object.entries(checks)
        .filter(([k, v]) => !v)
        .map(([k]) => k);
      reason = `条件未達: ${failedChecks.join(', ')}`;
    }

    return {
      recommendation,
      reason,
      qualityScore,
      confluenceScore,
      regime,
      mtfAnalysis,
      checks,
      optimizedParams: params
    };
  }

  /**
   * レジームとシグナル方向の整合性チェック
   */
  checkRegimeMatch(regime, direction) {
    // 方向付きレジームの場合、レジームの方向とシグナル方向を比較
    if (regime.endsWith('_UP')) {
      return direction === 'HIGH';
    }
    if (regime.endsWith('_DOWN')) {
      return direction === 'LOW';
    }

    // レンジ相場はどちらでも可
    return true;
  }

  /**
   * ボラティリティチェック
   */
  checkVolatilityOk(params) {
    const atr = this.calculateATR(this.priceHistory, 14);
    const prevATR = this.calculateATR(this.priceHistory.slice(0, -14), 14);

    if (!atr || !prevATR) return true;

    const ratio = atr / prevATR;
    return ratio <= params.maxVolatilityRatio;
  }

  /**
   * 相反シグナルのチェック
   */
  checkNoConflictingSignals(direction) {
    const rsi = this.calculateRSI(this.priceHistory, 14);
    const stoch = this.calculateStochastic(this.priceHistory, 14, 3, 3);

    // 極端な逆シグナルがないかチェック
    if (direction === 'HIGH') {
      if (rsi && rsi > 80) return false; // 過買い状態でHIGHは危険
      if (stoch && stoch.k > 85 && stoch.d > 85) return false;
    } else {
      if (rsi && rsi < 20) return false; // 過売り状態でLOWは危険
      if (stoch && stoch.k < 15 && stoch.d < 15) return false;
    }

    return true;
  }

  // ========================================
  // メイン分析関数
  // ========================================

  /**
   * 総合分析を実行
   * @param {number} timeframeSec - 判定時間枠（秒）。省略時は60秒
   * @returns {Object} 総合分析結果
   */
  analyze(timeframeSec = 60) {
    const startTime = performance.now();
    etaLog(`analyze() 開始 - timeframe=${timeframeSec}s, priceHistory:`, this.priceHistory.length, 'tickHistory:', this.tickHistory.length);

    try {
      if (this.priceHistory.length < 50) {
        etaLog('analyze() データ不足で終了');
        return {
          signal: 'NEUTRAL',
          confidence: 0,
          grade: '--',
          reason: 'データ不足',
          recommendation: 'SKIP'
        };
      }

      // v5.8.13: ボラティリティ状態を更新
      this.updateVolatilityState(this.priceHistory);
      const dynamicThresholds = this.getDynamicThresholds();

      // レジーム検出（時間枠に応じた期間で分析、動的閾値使用）
      etaLog('detectMarketRegime() 開始');
      const regimeStart = performance.now();
      const regime = this.detectMarketRegime(timeframeSec, dynamicThresholds);
      etaLog('detectMarketRegime() 完了:', (performance.now() - regimeStart).toFixed(2), 'ms', regime.regime);

      // MTF分析（軽量版：メインの60秒のみ詳細分析）
      etaLog('analyzeMultiTimeframeLite() 開始');
      const mtfStart = performance.now();
      const mtf = this.analyzeMultiTimeframeLite();
      etaLog('analyzeMultiTimeframeLite() 完了:', (performance.now() - mtfStart).toFixed(2), 'ms');

      // v5.8.14: 初動検出結果を取得（60秒タイムフレームから）
      const tf60Result = mtf.timeframes?.[60];
      const earlyMoveAnalysis = tf60Result?.earlyMoveAnalysis;
      const earlyMoveSummary = earlyMoveAnalysis?.summary;

      // v5.8.14: 初動検出ログ（常に表示）
      if (earlyMoveSummary) {
        const logFn = window.originalConsoleLog || console.log;
        const rsiInfo = earlyMoveAnalysis.rsi?.earlyMove;
        const stochInfo = earlyMoveAnalysis.stochastic?.earlyMove;
        logFn(`[初動検出] RSI: ${rsiInfo?.type || 'N/A'}(${rsiInfo?.strength || 0}) | Stoch: ${stochInfo?.type || 'N/A'}(${stochInfo?.strength || 0}) | 判定: ${earlyMoveSummary.signal} | 理由: ${earlyMoveSummary.reason || '-'}`);
      }

      // v5.8.14: 初動検出がSKIP（極端ゾーン）を返した場合 → 見送り
      if (earlyMoveSummary?.signal === 'SKIP') {
        const logFn = window.originalConsoleLog || console.log;
        logFn(`[初動検出] 🚫 見送り判定: ${earlyMoveSummary.reason}`);
        return {
          signal: 'NEUTRAL',
          confidence: 0,
          grade: '--',
          reason: earlyMoveSummary.reason,
          recommendation: 'SKIP',
          regime: regime.regime,
          mtfAgreement: mtf.confluence.directionAgreement,
          earlyMoveSkip: true,
          earlyMoveReason: earlyMoveSummary.reason
        };
      }

      // 予測方向の決定
      const direction = mtf.confluence.dominantDirection;
      etaLog('direction:', direction, 'agreement:', mtf.confluence.directionAgreement);

      if (direction === 'NEUTRAL') {
        etaLog('analyze() NEUTRAL で終了:', (performance.now() - startTime).toFixed(2), 'ms');
        return {
          signal: 'NEUTRAL',
          confidence: 0,
          grade: '--',
          reason: 'シグナル方向不明確',
          recommendation: 'SKIP',
          regime: regime.regime,
          mtfAgreement: mtf.confluence.directionAgreement
        };
      }

      // v5.8.14: 初動検出と従来シグナルの方向が逆の場合 → 見送り
      if (earlyMoveSummary && earlyMoveSummary.signal !== 'NEUTRAL') {
        if ((direction === 'HIGH' && earlyMoveSummary.signal === 'LOW') ||
            (direction === 'LOW' && earlyMoveSummary.signal === 'HIGH')) {
          const logFn = window.originalConsoleLog || console.log;
          logFn(`[初動検出] ⚠️ 従来シグナル(${direction})と初動(${earlyMoveSummary.signal})が逆方向 → 見送り`);
          return {
            signal: 'NEUTRAL',
            confidence: 0,
            grade: '--',
            reason: `従来(${direction})と初動(${earlyMoveSummary.signal})が逆方向`,
            recommendation: 'SKIP',
            regime: regime.regime,
            mtfAgreement: mtf.confluence.directionAgreement,
            earlyMoveConflict: true
          };
        }
      }

      // エントリー品質評価（キャッシュを再利用）
      etaLog('evaluateEntryQuality() 開始');
      const qualityStart = performance.now();
      const quality = this.evaluateEntryQuality(direction, regime, mtf);
      etaLog('evaluateEntryQuality() 完了:', (performance.now() - qualityStart).toFixed(2), 'ms');

      // v5.8.14: 初動検出が一致している場合は信頼度を強化
      let finalConfidence = quality.confluenceScore.total;
      let finalGrade = quality.confluenceScore.grade;
      if (earlyMoveSummary && earlyMoveSummary.signal === direction) {
        const boost = Math.round(earlyMoveSummary.confidence * 0.2);
        finalConfidence = Math.min(100, finalConfidence + boost);
        const logFn = window.originalConsoleLog || console.log;
        logFn(`[初動検出] ✅ 従来と初動が一致(${direction}) → 信頼度+${boost}% (${quality.confluenceScore.total}→${finalConfidence})`);
      }

      etaLog('analyze() 完了:', (performance.now() - startTime).toFixed(2), 'ms', '推奨:', quality.recommendation);

      // v5.9.0: エントリー条件v2用データを生成
      const v2Data = this.buildV2ConditionData(regime, mtf, earlyMoveAnalysis, direction);

      return {
        signal: direction,
        confidence: finalConfidence,
        grade: finalGrade,
        recommendation: quality.recommendation,
        reason: quality.reason,
        regime: regime.regime,
        mtfAgreement: mtf.confluence.directionAgreement,
        qualityScore: quality.qualityScore,
        earlyMoveAnalysis: earlyMoveSummary,
        volatilityRegime: this.volatilityState.regime,
        v2: v2Data
      };
    } catch (error) {
      etaLog('analyze() エラー:', error.message, error.stack);
      return {
        signal: 'NEUTRAL',
        confidence: 0,
        grade: '--',
        reason: '分析エラー',
        recommendation: 'SKIP'
      };
    }
  }

  // ========================================
  // v5.9.0: エントリー条件v2用データ生成
  // ========================================

  /**
   * v2条件判定に必要な全データを一括生成
   */
  buildV2ConditionData(regime, mtf, earlyMoveAnalysis, direction) {
    const data = this.priceHistory;
    if (!data || data.length < 50) return null;

    // --- T1: 局面適合用データ ---
    const adxValue = regime.details?.adx || 0;
    // ADX履歴を更新してパーセンタイルを計算
    this.adxHistory.push(adxValue);
    if (this.adxHistory.length > this.adxHistoryMax) this.adxHistory.shift();
    const adxPct = this.calculatePercentile(this.adxHistory, adxValue);

    // EMA傾き正規化: slope = (EMA20_now - EMA20_5ago) / (ATR14 + ε)
    const ema20Now = this.calculateEMA(data, 20);
    const ema20_5ago = data.length >= 25 ? this.calculateEMA(data.slice(0, -5), 20) : ema20Now;
    const atr14 = this.volatilityState.currentATR || 0.0001;
    const emaSlope = (ema20Now - ema20_5ago) / (atr14 + 0.00001);

    // BB幅拡大率
    const bb = this.calculateBollingerBands(data, 20, 2);
    const bbWidth = bb?.bandwidth || 0;
    this.bbWidthHistory.push(bbWidth);
    if (this.bbWidthHistory.length > this.bbWidthHistoryMax) this.bbWidthHistory.shift();
    const medianBBWidth = this.calculateMedian(this.bbWidthHistory);
    const bbExpansionRatio = medianBBWidth > 0 ? bbWidth / medianBBWidth : 1.0;
    const bbPosition = bb ? ((data[data.length - 1] - bb.lower) / (bb.upper - bb.lower)) * 100 : 50;

    // v2レジーム分類
    let v2Regime = 'TRANSITION';
    if (bbExpansionRatio >= 1.30 && (bbPosition < 10 || bbPosition > 90)) {
      v2Regime = 'BREAKOUT';
    } else if (adxPct >= 0.70 && Math.abs(emaSlope) >= 0.25) {
      v2Regime = 'TREND';
    } else if (adxPct <= 0.40 && bbExpansionRatio <= 1.10) {
      v2Regime = 'RANGE';
    }

    // --- T2: ボラ適合用データ ---
    const medianATR = this.calculateMedian(this.volatilityState.history.slice(-50));
    const volRatio = medianATR > 0 ? atr14 / medianATR : 1.0;

    // --- T3: 時間軸整合用データ ---
    // 各TFの方向スコア s_tf = (vH - vL) / 7
    const tfScores = {};
    for (const [tf, result] of Object.entries(mtf.timeframes)) {
      if (!result.signals) { tfScores[tf] = 0; continue; }
      let vH = 0, vL = 0;
      for (const sig of Object.values(result.signals)) {
        if (sig === 'HIGH') vH++;
        else if (sig === 'LOW') vL++;
      }
      tfScores[tf] = (vH - vL) / 7;
    }
    // 重み付き整合スコア（3TF版: 30, 60, 180）
    const s30 = tfScores['30'] || 0;
    const s60 = tfScores['60'] || 0;
    const s180 = tfScores['180'] || 0;
    const mtfWeightedScore = 0.30 * s30 + 0.40 * s60 + 0.30 * s180;

    // --- T4: エントリートリガー用データ ---
    const rsi = regime.details?.rsi || 50;
    const stoch = this.calculateStochastic(data, 14, 3, 3);
    const macd = this.calculateMACD(data);
    const ema9 = this.calculateEMA(data, 9);
    const currentPrice = data[data.length - 1];
    const prevPrice = data.length >= 2 ? data[data.length - 2] : currentPrice;

    // RSI 50クロス判定
    const rsiHistory = this.indicatorHistory.rsi;
    const rsiPrev = rsiHistory.length >= 2 ? rsiHistory[rsiHistory.length - 2] : rsi;
    const rsiCross50Up = rsiPrev <= 50 && rsi > 50;
    const rsiCross50Down = rsiPrev >= 50 && rsi < 50;

    // MACDヒストグラム連続増加/ゼロ付近判定
    const macdHist = macd?.histogram || 0;
    const macdHistory = this.indicatorHistory.macdHist;
    let macdIncreasing = false;
    let macdNearZero = Math.abs(macdHist) < atr14 * 0.5;
    if (macdHistory.length >= 3) {
      const h = macdHistory;
      macdIncreasing = (h[h.length - 1] > h[h.length - 2]) && (h[h.length - 2] > h[h.length - 3]);
    }

    // EMA9ブレイク判定
    const ema9BreakUp = prevPrice <= ema9 && currentPrice > ema9;
    const ema9BreakDown = prevPrice >= ema9 && currentPrice < ema9;
    // EMA9傾き
    const ema9Prev = data.length >= 3 ? this.calculateEMA(data.slice(0, -1), 9) : ema9;
    const ema9SlopeUp = ema9 > ema9Prev;
    const ema9SlopeDown = ema9 < ema9Prev;

    // BB回帰判定（レンジ用）
    const bbUpper = bb?.upper || currentPrice;
    const bbLower = bb?.lower || currentPrice;
    const prevBBExceeded = prevPrice > bbUpper || prevPrice < bbLower;
    const nowInsideBB = currentPrice <= bbUpper && currentPrice >= bbLower;
    const bbReversion = prevBBExceeded && nowInsideBB;

    // RSI極端域からの戻り判定（レンジ用）
    const rsiFromOverbought = rsiPrev > 70 && rsi <= 70;
    const rsiFromOversold = rsiPrev < 30 && rsi >= 30;

    // ストキャスティクス極端域反転クロス判定（レンジ用）
    const stochK = stoch?.k || 50;
    const stochD = stoch?.d || 50;
    const stochHistory = this.indicatorHistory.stochK;
    const stochPrev = stochHistory.length >= 2 ? stochHistory[stochHistory.length - 2] : stochK;
    const stochReversalUp = stochPrev < 20 && stochK > stochD;
    const stochReversalDown = stochPrev > 80 && stochK < stochD;

    return {
      // T1: 局面適合
      t1: {
        adxPct,
        emaSlope,
        bbExpansionRatio,
        bbPosition,
        v2Regime,  // 'TREND' | 'BREAKOUT' | 'RANGE' | 'TRANSITION'
        rsi
      },
      // T2: ボラ適合
      t2: {
        volRatio,
        medianATR
      },
      // T3: 時間軸整合
      t3: {
        tfScores,
        mtfWeightedScore,
        s30, s60, s180
      },
      // T4: エントリートリガー
      t4: {
        // トレンド用
        rsiCross50Up, rsiCross50Down,
        macdIncreasing, macdNearZero, macdHist,
        ema9BreakUp, ema9BreakDown,
        ema9SlopeUp, ema9SlopeDown,
        // レンジ用
        bbReversion,
        rsiFromOverbought, rsiFromOversold,
        stochReversalUp, stochReversalDown,
        // 共通
        rsi, stochK, stochD
      }
    };
  }

  /**
   * 配列内での値のパーセンタイル（0〜1）を計算
   */
  calculatePercentile(arr, value) {
    if (!arr || arr.length === 0) return 0.5;
    const sorted = [...arr].sort((a, b) => a - b);
    let count = 0;
    for (const v of sorted) {
      if (v < value) count++;
    }
    return count / sorted.length;
  }

  /**
   * 配列の中央値を計算
   */
  calculateMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * 軽量版MTF分析（パフォーマンス最適化）
   * @returns {Object} MTF分析結果
   */
  analyzeMultiTimeframeLite() {
    // 主要な3タイムフレームのみ分析（15, 60, 300は除外して負荷軽減）
    const timeframes = [30, 60, 180];
    const results = {};

    for (const tf of timeframes) {
      results[tf] = this.analyzeTimeframe(tf);
    }

    // タイムフレーム間の一致度を計算
    const confluence = this.calculateTimeframeConfluenceLite(results);

    return {
      timeframes: results,
      confluence,
      primarySignal: confluence.dominantDirection
    };
  }

  /**
   * 軽量版コンフルエンス計算
   */
  calculateTimeframeConfluenceLite(results) {
    const timeframes = Object.keys(results).map(Number);
    let highCount = 0;
    let lowCount = 0;

    for (const tf of timeframes) {
      const result = results[tf];
      if (result.signal === 'HIGH') highCount++;
      else if (result.signal === 'LOW') lowCount++;
    }

    const validCount = timeframes.length;
    const directionAgreement = Math.max(highCount, lowCount) / validCount;

    // デバッグ用ログ
    etaLog(`[MTF Confluence] TF結果: HIGH:${highCount} LOW:${lowCount} NEUTRAL:${validCount - highCount - lowCount}`);

    let dominantDirection = 'NEUTRAL';
    // 閾値を緩和: 60% → 34% (3TF中1つ以上で方向決定、ただし過半数側を優先)
    // 超短期取引では1つでも明確なシグナルがあれば考慮
    if (highCount > lowCount) {
      dominantDirection = 'HIGH';
    } else if (lowCount > highCount) {
      dominantDirection = 'LOW';
    }

    return {
      highCount,
      lowCount,
      directionAgreement: Math.round(directionAgreement * 100),
      dominantDirection,
      isStrong: directionAgreement >= 0.67 // 3TF中2つ以上一致で強いシグナル
    };
  }

  // ========================================
  // テクニカル指標計算関数
  // ========================================

  /**
   * 指定タイムフレームのデータを取得
   */
  getDataForTimeframe(seconds) {
    // 1秒あたりのティック数を推定してリサンプリング
    const now = Date.now();
    const startTime = now - seconds * 1000;

    // ティックデータからリサンプリング
    const relevantTicks = this.tickHistory.filter(t => t.timestamp >= startTime);

    if (relevantTicks.length < 10) {
      // ティック不足の場合はpriceHistoryから推定
      const ratio = seconds / 60; // 60秒を基準
      const dataPoints = Math.min(this.priceHistory.length, Math.round(50 * ratio));
      return this.priceHistory.slice(-dataPoints);
    }

    return relevantTicks.map(t => t.price);
  }

  /**
   * RSI計算
   */
  calculateRSI(data, period = 14) {
    if (!data || data.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1]);
    }

    let gains = 0, losses = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) gains += changes[i];
      else losses += Math.abs(changes[i]);
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

  /**
   * MACD計算（正確版）
   * v5.8.12: シグナルラインを正しい9期間EMAで計算
   */
  calculateMACD(data) {
    if (!data || data.length < 35) return null; // 26 + 9 期間必要

    // MACD配列を計算
    const macdArray = [];
    for (let i = 25; i < data.length; i++) {
      const slice = data.slice(0, i + 1);
      const ema12 = this.calculateEMA(slice, 12);
      const ema26 = this.calculateEMA(slice, 26);
      if (ema12 !== null && ema26 !== null) {
        macdArray.push(ema12 - ema26);
      }
    }

    if (macdArray.length < 9) return null;

    // 現在のMACD値
    const macd = macdArray[macdArray.length - 1];

    // シグナルライン = MACDの9期間EMA
    const k = 2 / (9 + 1);
    let signal = macdArray[0];
    for (let i = 1; i < macdArray.length; i++) {
      signal = macdArray[i] * k + signal * (1 - k);
    }

    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  /**
   * EMA計算
   */
  calculateEMA(data, period) {
    if (!data || data.length < period) return null;

    const k = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }

    return ema;
  }

  /**
   * EMA配列計算
   */
  calculateEMAArray(data, period) {
    if (!data || data.length < period) return [];

    const k = 2 / (period + 1);
    const emaArray = [];
    let ema = data[0];
    emaArray.push(ema);

    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
      emaArray.push(ema);
    }

    return emaArray;
  }

  /**
   * MAクロスオーバー計算
   */
  calculateMACrossover(data) {
    const ema5 = this.calculateEMAArray(data, 5);
    const ema20 = this.calculateEMAArray(data, 20);

    if (ema5.length < 2 || ema20.length < 2) return null;

    const currentDiff = ema5[ema5.length - 1] - ema20[ema20.length - 1];
    const prevDiff = ema5[ema5.length - 2] - ema20[ema20.length - 2];

    return {
      ema5: ema5[ema5.length - 1],
      ema20: ema20[ema20.length - 1],
      diff: currentDiff,
      crossover: prevDiff <= 0 && currentDiff > 0 ? 'GOLDEN' :
                 prevDiff >= 0 && currentDiff < 0 ? 'DEAD' : 'NONE'
    };
  }

  /**
   * ボリンジャーバンド計算
   */
  calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (!data || data.length < period) return null;

    const slice = data.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;

    const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const upper = sma + standardDeviation * stdDev;
    const lower = sma - standardDeviation * stdDev;

    return {
      upper,
      middle: sma,
      lower,
      bandwidth: ((upper - lower) / sma) * 100
    };
  }

  /**
   * ADX計算（Wilderの正確版）
   * v5.8.12: 正しいDM計算とスムージング処理
   */
  calculateADX(data, period = 14) {
    if (!data || data.length < period * 2 + 1) return null;

    // True Range, +DM, -DMの配列を計算
    const trueRanges = [];
    const plusDMs = [];
    const minusDMs = [];

    for (let i = 1; i < data.length; i++) {
      const high = data[i];
      const low = data[i]; // 終値データのみの場合は同値
      const prevHigh = data[i - 1];
      const prevLow = data[i - 1];
      const prevClose = data[i - 1];

      // True Range（終値データのみの場合の近似）
      const tr = Math.abs(data[i] - data[i - 1]);
      trueRanges.push(tr);

      // Directional Movement
      const upMove = data[i] - data[i - 1];
      const downMove = data[i - 1] - data[i];

      // +DM: 上昇幅が下降幅より大きく、かつ正の場合
      // -DM: 下降幅が上昇幅より大きく、かつ正の場合
      let plusDM = 0;
      let minusDM = 0;

      if (upMove > 0 && upMove > Math.abs(downMove)) {
        plusDM = upMove;
      }
      if (downMove > 0 && downMove > upMove) {
        minusDM = downMove;
      }

      plusDMs.push(plusDM);
      minusDMs.push(minusDM);
    }

    if (trueRanges.length < period) return null;

    // Wilderのスムージング（指数平滑移動平均）
    const smooth = (arr, p) => {
      let smoothed = arr.slice(0, p).reduce((a, b) => a + b, 0);
      for (let i = p; i < arr.length; i++) {
        smoothed = smoothed - (smoothed / p) + arr[i];
      }
      return smoothed;
    };

    const smoothedTR = smooth(trueRanges, period);
    const smoothedPlusDM = smooth(plusDMs, period);
    const smoothedMinusDM = smooth(minusDMs, period);

    if (smoothedTR === 0) return { adx: 0, plusDI: 0, minusDI: 0 };

    // Directional Indicators
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;

    // DX (Directional Index)
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

    // ADX = DXのスムージング（簡易版：直近DXを使用）
    // より正確にはDX配列を作成してスムージングするが、
    // リアルタイム取引では直近DXで十分
    const adx = dx;

    return { adx: Math.min(100, adx), plusDI, minusDI };
  }

  /**
   * ATR計算
   */
  calculateATR(data, period = 14) {
    if (!data || data.length < period + 1) return null;

    let tr = 0;
    for (let i = 1; i < data.length; i++) {
      tr += Math.abs(data[i] - data[i - 1]);
    }

    return tr / (data.length - 1);
  }

  /**
   * Stochastic計算（正確版）
   * v5.8.12: %Dを正しい3期間SMAで計算
   */
  calculateStochastic(data, kPeriod = 14, kSmooth = 3, dPeriod = 3) {
    if (!data || data.length < kPeriod + dPeriod) return null;

    // Raw %K 配列を計算（%Dの計算に必要）
    const rawKValues = [];
    for (let i = kPeriod - 1; i < data.length; i++) {
      const slice = data.slice(i - kPeriod + 1, i + 1);
      const high = Math.max(...slice);
      const low = Math.min(...slice);
      const close = data[i];

      if (high === low) {
        rawKValues.push(50);
      } else {
        rawKValues.push(((close - low) / (high - low)) * 100);
      }
    }

    if (rawKValues.length < dPeriod) return { k: 50, d: 50 };

    // %K (Slow %K = Raw %KのkSmooth期間SMA、ただしここではRaw %Kを使用)
    const k = rawKValues[rawKValues.length - 1];

    // %D = %Kの3期間SMA
    const recentK = rawKValues.slice(-dPeriod);
    const d = recentK.reduce((a, b) => a + b, 0) / dPeriod;

    return { k, d };
  }

  /**
   * モメンタム計算
   */
  calculateMomentum(data, period = 10) {
    if (!data || data.length < period + 1) return null;

    const current = data[data.length - 1];
    const past = data[data.length - 1 - period];

    return ((current - past) / past) * 100;
  }

  /**
   * CCI計算
   */
  calculateCCI(data, period = 20) {
    if (!data || data.length < period) return null;

    const slice = data.slice(-period);
    const tp = slice[slice.length - 1]; // 簡易: 終値をTypical Priceとして使用
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const meanDev = slice.reduce((a, b) => a + Math.abs(b - sma), 0) / period;

    if (meanDev === 0) return 0;
    return (tp - sma) / (0.015 * meanDev);
  }

  /**
   * サポート/レジスタンス検出
   */
  detectSupportResistance(data) {
    if (!data || data.length < 20) return null;

    const recent = data.slice(-20);
    const support = Math.min(...recent);
    const resistance = Math.max(...recent);

    return { support, resistance };
  }

  /**
   * 連続陽線/陰線カウント
   */
  countConsecutiveCandles(data) {
    if (!data || data.length < 5) return { bullish: 0, bearish: 0 };

    let bullish = 0, bearish = 0;

    for (let i = data.length - 1; i > 0; i--) {
      const change = data[i] - data[i - 1];

      if (i === data.length - 1) {
        // 最新の方向を記録
        if (change > 0) bullish = 1;
        else if (change < 0) bearish = 1;
      } else {
        // 連続チェック
        if (change > 0 && bullish > 0) bullish++;
        else if (change < 0 && bearish > 0) bearish++;
        else break;
      }
    }

    return { bullish, bearish };
  }

  // ========================================
  // シグナル判定関数（v5.8.13: 動的閾値対応）
  // ========================================

  /**
   * RSIシグナル判定（動的閾値対応）
   */
  getRSISignal(rsi, dynamicThresholds = null) {
    if (!rsi) return 'NEUTRAL';

    // 動的閾値があれば使用、なければ静的設定
    const overbought = dynamicThresholds?.rsiOverbought || this.config.rsiOverbought;
    const oversold = dynamicThresholds?.rsiOversold || this.config.rsiOversold;

    if (rsi >= overbought) return 'LOW';
    if (rsi <= oversold) return 'HIGH';
    if (rsi >= 55) return 'HIGH';
    if (rsi <= 45) return 'LOW';
    return 'NEUTRAL';
  }

  getMACDSignal(macd) {
    if (!macd) return 'NEUTRAL';
    if (macd.histogram > 0 && macd.macd > macd.signal) return 'HIGH';
    if (macd.histogram < 0 && macd.macd < macd.signal) return 'LOW';
    return 'NEUTRAL';
  }

  getMASignal(ma) {
    if (!ma) return 'NEUTRAL';
    if (ma.crossover === 'GOLDEN') return 'HIGH';
    if (ma.crossover === 'DEAD') return 'LOW';
    if (ma.diff > 0) return 'HIGH';
    if (ma.diff < 0) return 'LOW';
    return 'NEUTRAL';
  }

  /**
   * BBシグナル判定（動的閾値対応）
   */
  getBBSignal(bb, data, dynamicThresholds = null) {
    if (!bb || !data) return 'NEUTRAL';
    const currentPrice = data[data.length - 1];
    const position = ((currentPrice - bb.lower) / (bb.upper - bb.lower)) * 100;

    // 動的閾値があれば使用
    const oversoldPos = dynamicThresholds?.bbOversoldPosition || 20;
    const overboughtPos = dynamicThresholds?.bbOverboughtPosition || 80;

    if (position < oversoldPos) return 'HIGH'; // 下限付近で反発期待
    if (position > overboughtPos) return 'LOW';  // 上限付近で反落期待
    if (position > 50) return 'HIGH';
    return 'LOW';
  }

  /**
   * ADXシグナル判定（動的閾値対応）
   */
  getADXSignal(adx, dynamicThresholds = null) {
    if (!adx) return 'NEUTRAL';

    // 動的閾値があれば使用
    const trendThreshold = dynamicThresholds?.adxTrendThreshold || 20;

    if (adx.adx < trendThreshold) return 'NEUTRAL'; // トレンドなし
    if (adx.plusDI > adx.minusDI) return 'HIGH';
    if (adx.minusDI > adx.plusDI) return 'LOW';
    return 'NEUTRAL';
  }

  /**
   * ストキャスティクスシグナル判定（動的閾値対応）
   */
  getStochasticSignal(stoch, dynamicThresholds = null) {
    if (!stoch) return 'NEUTRAL';

    // 動的閾値があれば使用
    const oversold = dynamicThresholds?.stochOversold || 20;
    const overbought = dynamicThresholds?.stochOverbought || 80;

    if (stoch.k < oversold && stoch.k > stoch.d) return 'HIGH';
    if (stoch.k > overbought && stoch.k < stoch.d) return 'LOW';
    if (stoch.k > stoch.d) return 'HIGH';
    if (stoch.k < stoch.d) return 'LOW';
    return 'NEUTRAL';
  }

  /**
   * モメンタムシグナル判定（動的閾値対応）
   */
  getMomentumSignal(momentum, dynamicThresholds = null) {
    if (momentum === null) return 'NEUTRAL';

    // 動的閾値があれば使用
    const threshold = dynamicThresholds?.momentumThreshold || 0.1;

    if (momentum > threshold) return 'HIGH';
    if (momentum < -threshold) return 'LOW';
    return 'NEUTRAL';
  }

  /**
   * シグナルを集計
   */
  aggregateSignals(signals) {
    let highCount = 0, lowCount = 0;
    const total = Object.keys(signals).length;

    for (const signal of Object.values(signals)) {
      if (signal === 'HIGH') highCount++;
      else if (signal === 'LOW') lowCount++;
    }

    // デバッグ用: 指標の状態をログ出力
    etaLog(`[aggregateSignals] HIGH:${highCount} LOW:${lowCount} NEUTRAL:${total - highCount - lowCount} / total:${total}`);

    // 閾値を緩和: 60% → 43% (7指標中3つ以上で方向決定)
    // 超短期取引ではより感度の高い判定が必要
    if (highCount > lowCount && highCount >= total * 0.43) {
      return { signal: 'HIGH', confidence: Math.round((highCount / total) * 100) };
    }
    if (lowCount > highCount && lowCount >= total * 0.43) {
      return { signal: 'LOW', confidence: Math.round((lowCount / total) * 100) };
    }

    return { signal: 'NEUTRAL', confidence: 50 };
  }

  /**
   * v5.8.14: 初動検出を考慮したシグナル集計
   * 従来のシグナル集計に初動検出・モメンタム分析の結果を統合
   */
  aggregateSignalsWithEarlyMove(signals, earlyMoveAnalysis) {
    // 基本のシグナル集計
    let highCount = 0, lowCount = 0;
    const total = Object.keys(signals).length;

    for (const signal of Object.values(signals)) {
      if (signal === 'HIGH') highCount++;
      else if (signal === 'LOW') lowCount++;
    }

    // 初動検出の結果を取得
    const earlyMoveSummary = earlyMoveAnalysis?.summary;

    // 初動検出がSKIP（極端ゾーン）を返した場合 → 見送り
    if (earlyMoveSummary?.signal === 'SKIP') {
      etaLog(`[aggregateWithEarlyMove] SKIP: ${earlyMoveSummary.reason}`);
      return {
        signal: 'NEUTRAL',
        confidence: 0,
        reason: earlyMoveSummary.reason,
        skipped: true
      };
    }

    // 従来のシグナル判定
    let baseSignal = 'NEUTRAL';
    let baseConfidence = 50;

    if (highCount > lowCount && highCount >= total * 0.43) {
      baseSignal = 'HIGH';
      baseConfidence = Math.round((highCount / total) * 100);
    } else if (lowCount > highCount && lowCount >= total * 0.43) {
      baseSignal = 'LOW';
      baseConfidence = Math.round((lowCount / total) * 100);
    }

    // 初動検出のシグナルと信頼度
    const earlyMoveSignal = earlyMoveSummary?.signal || 'NEUTRAL';
    const earlyMoveConfidence = earlyMoveSummary?.confidence || 0;

    // シグナルの統合ロジック
    let finalSignal = baseSignal;
    let finalConfidence = baseConfidence;
    let reason = '';

    // Case 1: 両方が同じ方向 → 強化
    if (baseSignal === earlyMoveSignal && baseSignal !== 'NEUTRAL') {
      finalConfidence = Math.min(100, baseConfidence + Math.round(earlyMoveConfidence * 0.3));
      reason = `従来+初動一致 (${earlyMoveSummary?.reason || ''})`;
      etaLog(`[aggregateWithEarlyMove] 強化: ${finalSignal} conf=${finalConfidence}`);
    }
    // Case 2: 従来がNEUTRALだが初動が明確 → 初動を採用
    else if (baseSignal === 'NEUTRAL' && earlyMoveSignal !== 'NEUTRAL' && earlyMoveConfidence >= 60) {
      finalSignal = earlyMoveSignal;
      finalConfidence = earlyMoveConfidence;
      reason = `初動検出優先 (${earlyMoveSummary?.reason || ''})`;
      etaLog(`[aggregateWithEarlyMove] 初動優先: ${finalSignal} conf=${finalConfidence}`);
    }
    // Case 3: 従来と初動が逆方向 → 信頼度を下げる
    else if (baseSignal !== 'NEUTRAL' && earlyMoveSignal !== 'NEUTRAL' && baseSignal !== earlyMoveSignal) {
      // 初動が強い場合は見送り
      if (earlyMoveConfidence >= 70) {
        finalSignal = 'NEUTRAL';
        finalConfidence = 30;
        reason = `従来と初動が逆方向 - 見送り推奨`;
        etaLog(`[aggregateWithEarlyMove] 逆方向のため見送り`);
      } else {
        // 初動が弱い場合は従来を維持だが信頼度を下げる
        finalConfidence = Math.max(30, baseConfidence - 20);
        reason = `従来シグナル（初動は逆方向）`;
        etaLog(`[aggregateWithEarlyMove] 従来維持だが信頼度低下: ${finalSignal} conf=${finalConfidence}`);
      }
    }
    // Case 4: その他 → 従来のまま
    else {
      reason = highCount > 0 || lowCount > 0 ? '従来シグナル' : '明確なシグナルなし';
    }

    etaLog(`[aggregateWithEarlyMove] Final: ${finalSignal} conf=${finalConfidence} (base=${baseSignal}/${baseConfidence}, early=${earlyMoveSignal}/${earlyMoveConfidence})`);

    return {
      signal: finalSignal,
      confidence: finalConfidence,
      reason,
      baseSignal,
      baseConfidence,
      earlyMoveSignal,
      earlyMoveConfidence
    };
  }
}

// グローバルに公開
window.EnhancedTechnicalAnalysis = EnhancedTechnicalAnalysis;
window.MarketRegime = MarketRegime;
