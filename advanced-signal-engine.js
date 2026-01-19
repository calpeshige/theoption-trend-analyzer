/**
 * Advanced Signal Engine v1.0
 * 高精度シグナル判定エンジン
 *
 * 3つのアプローチを組み合わせた予測システム：
 * 1. モメンタム継続性分析 - 直近の勢いが継続するか
 * 2. 反転タイミング検出 - 極値からの反転を狙う
 * 3. 多数決投票システム - 20以上の指標で民主的に決定
 */

// デバッグモード
const ASE_DEBUG = false;
const aseLog = ASE_DEBUG ? console.log.bind(console, '[ASE]') : () => {};

class AdvancedSignalEngine {
  constructor() {
    this.priceHistory = [];
    this.tickHistory = [];
    this.candleHistory = [];
  }

  /**
   * データを更新
   */
  updateData(prices, ticks, candles) {
    this.priceHistory = prices || [];
    this.tickHistory = ticks || [];
    this.candleHistory = candles || [];
  }

  // ========================================
  // 1. 多数決投票システム（20以上の指標）
  // ========================================

  /**
   * 全指標で投票を実施
   * @returns {Object} 投票結果
   */
  conductVoting() {
    const votes = {
      HIGH: [],
      LOW: [],
      NEUTRAL: []
    };

    const prices = this.priceHistory;
    const ticks = this.tickHistory;
    const candles = this.candleHistory;

    if (prices.length < 30) {
      return { winner: 'NEUTRAL', confidence: 0, details: votes, total: 0 };
    }

    // === 価格ベース指標 ===

    // 1. 短期モメンタム（5期間）
    const mom5 = this.calculateMomentum(prices, 5);
    this.castVote(votes, 'モメンタム5', mom5 > 0.01 ? 'HIGH' : mom5 < -0.01 ? 'LOW' : 'NEUTRAL');

    // 2. 中期モメンタム（10期間）
    const mom10 = this.calculateMomentum(prices, 10);
    this.castVote(votes, 'モメンタム10', mom10 > 0.01 ? 'HIGH' : mom10 < -0.01 ? 'LOW' : 'NEUTRAL');

    // 3. 長期モメンタム（20期間）
    const mom20 = this.calculateMomentum(prices, 20);
    this.castVote(votes, 'モメンタム20', mom20 > 0.01 ? 'HIGH' : mom20 < -0.01 ? 'LOW' : 'NEUTRAL');

    // 4. ROC（Rate of Change）5期間
    const roc5 = this.calculateROC(prices, 5);
    this.castVote(votes, 'ROC5', roc5 > 0.05 ? 'HIGH' : roc5 < -0.05 ? 'LOW' : 'NEUTRAL');

    // 5. ROC 10期間
    const roc10 = this.calculateROC(prices, 10);
    this.castVote(votes, 'ROC10', roc10 > 0.05 ? 'HIGH' : roc10 < -0.05 ? 'LOW' : 'NEUTRAL');

    // 6. 価格位置（直近レンジ内での位置）
    const pricePosition = this.calculatePricePosition(prices, 20);
    this.castVote(votes, '価格位置', pricePosition > 0.7 ? 'HIGH' : pricePosition < 0.3 ? 'LOW' : 'NEUTRAL');

    // === 移動平均ベース指標 ===

    // 7. MA5 vs 現在価格
    const ma5 = this.calculateSMA(prices, 5);
    const currentPrice = prices[prices.length - 1];
    this.castVote(votes, 'MA5クロス', currentPrice > ma5 ? 'HIGH' : currentPrice < ma5 ? 'LOW' : 'NEUTRAL');

    // 8. MA10 vs 現在価格
    const ma10 = this.calculateSMA(prices, 10);
    this.castVote(votes, 'MA10クロス', currentPrice > ma10 ? 'HIGH' : currentPrice < ma10 ? 'LOW' : 'NEUTRAL');

    // 9. MA20 vs 現在価格
    const ma20 = this.calculateSMA(prices, 20);
    this.castVote(votes, 'MA20クロス', currentPrice > ma20 ? 'HIGH' : currentPrice < ma20 ? 'LOW' : 'NEUTRAL');

    // 10. MA5 vs MA10（ゴールデン/デッドクロス）
    this.castVote(votes, 'MA5-10クロス', ma5 > ma10 ? 'HIGH' : ma5 < ma10 ? 'LOW' : 'NEUTRAL');

    // 11. MA10 vs MA20
    this.castVote(votes, 'MA10-20クロス', ma10 > ma20 ? 'HIGH' : ma10 < ma20 ? 'LOW' : 'NEUTRAL');

    // 12. EMA5 vs EMA10
    const ema5 = this.calculateEMA(prices, 5);
    const ema10 = this.calculateEMA(prices, 10);
    this.castVote(votes, 'EMA5-10', ema5 > ema10 ? 'HIGH' : ema5 < ema10 ? 'LOW' : 'NEUTRAL');

    // === オシレーター系指標 ===

    // 13. RSI（14期間）
    const rsi14 = this.calculateRSI(prices, 14);
    // RSIは50を中心に判定（トレンドフォロー）
    this.castVote(votes, 'RSI14トレンド', rsi14 > 55 ? 'HIGH' : rsi14 < 45 ? 'LOW' : 'NEUTRAL');

    // 14. RSI反転シグナル
    const rsiReversal = this.detectRSIReversal(prices);
    this.castVote(votes, 'RSI反転', rsiReversal);

    // 15. ストキャスティクス%K
    const stoch = this.calculateStochastic(prices, 14);
    this.castVote(votes, 'Stoch%Kトレンド', stoch.k > 55 ? 'HIGH' : stoch.k < 45 ? 'LOW' : 'NEUTRAL');

    // 16. ストキャスティクス反転
    const stochReversal = this.detectStochReversal(stoch);
    this.castVote(votes, 'Stoch反転', stochReversal);

    // 17. %K vs %D クロス
    this.castVote(votes, 'Stochクロス', stoch.k > stoch.d ? 'HIGH' : stoch.k < stoch.d ? 'LOW' : 'NEUTRAL');

    // 18. CCI（Commodity Channel Index）
    const cci = this.calculateCCI(prices, 20);
    this.castVote(votes, 'CCI', cci > 100 ? 'HIGH' : cci < -100 ? 'LOW' : 'NEUTRAL');

    // 19. Williams %R
    const willR = this.calculateWilliamsR(prices, 14);
    this.castVote(votes, 'Williams%R', willR > -20 ? 'HIGH' : willR < -80 ? 'LOW' : 'NEUTRAL');

    // === MACD系指標 ===

    // 20. MACDヒストグラム
    const macd = this.calculateMACD(prices);
    this.castVote(votes, 'MACDヒストグラム', macd.histogram > 0 ? 'HIGH' : macd.histogram < 0 ? 'LOW' : 'NEUTRAL');

    // 21. MACDラインvsシグナル
    this.castVote(votes, 'MACDクロス', macd.macdLine > macd.signalLine ? 'HIGH' : macd.macdLine < macd.signalLine ? 'LOW' : 'NEUTRAL');

    // 22. MACDヒストグラムの勢い
    const macdMomentum = this.calculateMACDMomentum(prices);
    this.castVote(votes, 'MACD勢い', macdMomentum > 0 ? 'HIGH' : macdMomentum < 0 ? 'LOW' : 'NEUTRAL');

    // === ボラティリティ・トレンド強度指標 ===

    // 23. ボリンジャーバンド位置
    const bb = this.calculateBollingerBands(prices, 20);
    const bbPosition = (currentPrice - bb.lower) / (bb.upper - bb.lower);
    this.castVote(votes, 'BB位置', bbPosition > 0.7 ? 'HIGH' : bbPosition < 0.3 ? 'LOW' : 'NEUTRAL');

    // 24. ボリンジャーバンドブレイク予兆
    const bbBreak = this.detectBBBreakout(prices, bb);
    this.castVote(votes, 'BBブレイク', bbBreak);

    // 25. ATR方向性（ボラティリティ拡大中か）
    const atrDirection = this.calculateATRDirection(prices, 14);
    // ボラティリティ拡大中はトレンドが継続しやすい
    if (atrDirection > 0.1) {
      // 拡大中 → 現在のモメンタムと同方向
      this.castVote(votes, 'ATR拡大', mom5 > 0 ? 'HIGH' : mom5 < 0 ? 'LOW' : 'NEUTRAL');
    } else {
      this.castVote(votes, 'ATR拡大', 'NEUTRAL');
    }

    // === 価格アクション指標 ===

    // 26. 直近3本の方向
    const recent3Direction = this.analyzeRecentBars(prices, 3);
    this.castVote(votes, '直近3本', recent3Direction);

    // 27. 直近5本の方向
    const recent5Direction = this.analyzeRecentBars(prices, 5);
    this.castVote(votes, '直近5本', recent5Direction);

    // 28. 高値更新・安値更新
    const hhll = this.detectHigherHighLowerLow(prices, 10);
    this.castVote(votes, '高安値更新', hhll);

    // 29. 価格加速度
    const acceleration = this.calculateAcceleration(prices, 5);
    this.castVote(votes, '加速度', acceleration > 0.001 ? 'HIGH' : acceleration < -0.001 ? 'LOW' : 'NEUTRAL');

    // 30. ティック方向（直近のティック比率）
    if (ticks.length >= 20) {
      const tickDirection = this.analyzeTickDirection(ticks, 20);
      this.castVote(votes, 'ティック方向', tickDirection);
    }

    // === 集計 ===
    const total = votes.HIGH.length + votes.LOW.length + votes.NEUTRAL.length;
    const highRatio = votes.HIGH.length / total;
    const lowRatio = votes.LOW.length / total;

    let winner = 'NEUTRAL';
    let confidence = 0;

    // 60%以上の合意でシグナル発出
    if (highRatio >= 0.6) {
      winner = 'HIGH';
      confidence = Math.round(highRatio * 100);
    } else if (lowRatio >= 0.6) {
      winner = 'LOW';
      confidence = Math.round(lowRatio * 100);
    } else if (highRatio >= 0.5 && highRatio > lowRatio + 0.15) {
      // 50%以上で、かつ反対より15%以上多い場合
      winner = 'HIGH';
      confidence = Math.round(highRatio * 100);
    } else if (lowRatio >= 0.5 && lowRatio > highRatio + 0.15) {
      winner = 'LOW';
      confidence = Math.round(lowRatio * 100);
    }

    aseLog(`[投票結果] HIGH:${votes.HIGH.length} LOW:${votes.LOW.length} NEUTRAL:${votes.NEUTRAL.length} → ${winner} (${confidence}%)`);

    return {
      winner,
      confidence,
      details: votes,
      total,
      highCount: votes.HIGH.length,
      lowCount: votes.LOW.length,
      neutralCount: votes.NEUTRAL.length,
      highRatio: Math.round(highRatio * 100),
      lowRatio: Math.round(lowRatio * 100)
    };
  }

  /**
   * 投票を記録
   */
  castVote(votes, indicatorName, direction) {
    if (direction === 'HIGH' || direction === 'LOW' || direction === 'NEUTRAL') {
      votes[direction].push(indicatorName);
      aseLog(`  [${indicatorName}] → ${direction}`);
    }
  }

  // ========================================
  // 2. モメンタム継続性分析
  // ========================================

  /**
   * モメンタムの継続性を分析
   * @returns {Object} 継続性分析結果
   */
  analyzeMomentumContinuity() {
    const prices = this.priceHistory;
    if (prices.length < 20) {
      return { signal: 'NEUTRAL', strength: 0, reason: 'データ不足' };
    }

    // 複数期間でモメンタムを計算
    const mom3 = this.calculateMomentum(prices, 3);
    const mom5 = this.calculateMomentum(prices, 5);
    const mom10 = this.calculateMomentum(prices, 10);

    // モメンタムの一貫性をチェック
    const allPositive = mom3 > 0 && mom5 > 0 && mom10 > 0;
    const allNegative = mom3 < 0 && mom5 < 0 && mom10 < 0;

    // モメンタムの強さ
    const avgMomentum = (Math.abs(mom3) + Math.abs(mom5) + Math.abs(mom10)) / 3;

    // 加速・減速の検出
    const isAccelerating = Math.abs(mom3) > Math.abs(mom5) && Math.abs(mom5) > Math.abs(mom10);
    const isDecelerating = Math.abs(mom3) < Math.abs(mom5) && Math.abs(mom5) < Math.abs(mom10);

    let signal = 'NEUTRAL';
    let strength = 0;
    let reason = '';

    if (allPositive && isAccelerating) {
      signal = 'HIGH';
      strength = Math.min(100, avgMomentum * 1000);
      reason = '上昇モメンタム加速中';
    } else if (allNegative && isAccelerating) {
      signal = 'LOW';
      strength = Math.min(100, avgMomentum * 1000);
      reason = '下降モメンタム加速中';
    } else if (allPositive) {
      signal = 'HIGH';
      strength = Math.min(80, avgMomentum * 800);
      reason = '上昇モメンタム継続';
    } else if (allNegative) {
      signal = 'LOW';
      strength = Math.min(80, avgMomentum * 800);
      reason = '下降モメンタム継続';
    } else if (isDecelerating) {
      // 減速中は反転の可能性
      signal = mom3 > 0 ? 'LOW' : 'HIGH'; // 逆方向
      strength = 30;
      reason = 'モメンタム減速→反転の可能性';
    }

    return { signal, strength, reason, mom3, mom5, mom10, isAccelerating, isDecelerating };
  }

  // ========================================
  // 3. 反転タイミング検出
  // ========================================

  /**
   * 反転タイミングを検出
   * @returns {Object} 反転分析結果
   */
  detectReversalTiming() {
    const prices = this.priceHistory;
    if (prices.length < 20) {
      return { signal: 'NEUTRAL', strength: 0, reason: 'データ不足' };
    }

    const rsi = this.calculateRSI(prices, 14);
    const stoch = this.calculateStochastic(prices, 14);
    const bb = this.calculateBollingerBands(prices, 20);
    const currentPrice = prices[prices.length - 1];

    let signal = 'NEUTRAL';
    let strength = 0;
    let reason = '';
    let reversalSignals = 0;

    // RSI極値からの反転
    if (rsi < 25) {
      // 過売り → 上昇反転期待
      const rsiReversal = this.detectRSIReversal(prices);
      if (rsiReversal === 'HIGH') {
        reversalSignals++;
        reason += 'RSI過売り反転 ';
      }
    } else if (rsi > 75) {
      // 過買い → 下降反転期待
      const rsiReversal = this.detectRSIReversal(prices);
      if (rsiReversal === 'LOW') {
        reversalSignals++;
        reason += 'RSI過買い反転 ';
      }
    }

    // ストキャスティクス極値からの反転
    if (stoch.k < 20 && stoch.k > stoch.d) {
      reversalSignals++;
      signal = 'HIGH';
      reason += 'Stoch過売り反転 ';
    } else if (stoch.k > 80 && stoch.k < stoch.d) {
      reversalSignals++;
      signal = 'LOW';
      reason += 'Stoch過買い反転 ';
    }

    // ボリンジャーバンド接触からの反転
    if (currentPrice <= bb.lower * 1.001) {
      reversalSignals++;
      signal = 'HIGH';
      reason += 'BB下限接触 ';
    } else if (currentPrice >= bb.upper * 0.999) {
      reversalSignals++;
      signal = 'LOW';
      reason += 'BB上限接触 ';
    }

    // 複数の反転シグナルが一致した場合のみ有効
    if (reversalSignals >= 2) {
      strength = Math.min(100, reversalSignals * 35);
    } else if (reversalSignals === 1) {
      strength = 25; // 単独の反転シグナルは弱い
    } else {
      signal = 'NEUTRAL';
      reason = '反転シグナルなし';
    }

    return { signal, strength, reason: reason.trim(), reversalSignals, rsi, stochK: stoch.k };
  }

  // ========================================
  // 4. 統合シグナル判定
  // ========================================

  /**
   * 全アプローチを統合してシグナルを判定
   * @returns {Object} 統合シグナル
   */
  analyze() {
    const startTime = performance.now();

    if (this.priceHistory.length < 30) {
      return {
        signal: 'NEUTRAL',
        confidence: 0,
        reason: 'データ不足',
        details: {}
      };
    }

    // 1. 多数決投票
    const voting = this.conductVoting();

    // 2. モメンタム継続性
    const momentum = this.analyzeMomentumContinuity();

    // 3. 反転タイミング
    const reversal = this.detectReversalTiming();

    // === 統合判定ロジック ===
    let finalSignal = 'NEUTRAL';
    let finalConfidence = 0;
    let finalReason = '';

    // 優先度1: 多数決で60%以上の合意
    if (voting.confidence >= 60) {
      finalSignal = voting.winner;
      finalConfidence = voting.confidence;
      finalReason = `多数決${voting.highCount > voting.lowCount ? 'HIGH' : 'LOW'}優勢(${voting.confidence}%)`;
    }
    // 優先度2: 多数決50%以上 + モメンタム一致
    else if (voting.confidence >= 50 && voting.winner === momentum.signal && momentum.strength >= 30) {
      finalSignal = voting.winner;
      finalConfidence = Math.round((voting.confidence + momentum.strength) / 2);
      finalReason = `多数決+モメンタム一致(${finalConfidence}%)`;
    }
    // 優先度3: 強い反転シグナル（複数一致）
    else if (reversal.reversalSignals >= 2 && reversal.strength >= 50) {
      finalSignal = reversal.signal;
      finalConfidence = reversal.strength;
      finalReason = `反転シグナル: ${reversal.reason}`;
    }
    // 優先度4: モメンタム加速中（強い継続シグナル）
    else if (momentum.isAccelerating && momentum.strength >= 60) {
      finalSignal = momentum.signal;
      finalConfidence = momentum.strength;
      finalReason = momentum.reason;
    }
    // それ以外はNEUTRAL
    else {
      finalReason = `合意不足(HIGH:${voting.highRatio}% LOW:${voting.lowRatio}%)`;
    }

    const elapsed = performance.now() - startTime;
    aseLog(`[統合判定] ${finalSignal} (${finalConfidence}%) - ${finalReason} [${elapsed.toFixed(1)}ms]`);

    return {
      signal: finalSignal,
      confidence: finalConfidence,
      reason: finalReason,
      voting: {
        winner: voting.winner,
        confidence: voting.confidence,
        highCount: voting.highCount,
        lowCount: voting.lowCount,
        neutralCount: voting.neutralCount,
        highRatio: voting.highRatio,
        lowRatio: voting.lowRatio,
        total: voting.total
      },
      momentum: {
        signal: momentum.signal,
        strength: momentum.strength,
        reason: momentum.reason,
        isAccelerating: momentum.isAccelerating
      },
      reversal: {
        signal: reversal.signal,
        strength: reversal.strength,
        reason: reversal.reason,
        count: reversal.reversalSignals
      }
    };
  }

  // ========================================
  // テクニカル指標計算関数
  // ========================================

  calculateMomentum(prices, period) {
    if (prices.length < period + 1) return 0;
    const current = prices[prices.length - 1];
    const past = prices[prices.length - 1 - period];
    return (current - past) / past;
  }

  calculateROC(prices, period) {
    return this.calculateMomentum(prices, period) * 100;
  }

  calculatePricePosition(prices, period) {
    if (prices.length < period) return 0.5;
    const recent = prices.slice(-period);
    const high = Math.max(...recent);
    const low = Math.min(...recent);
    const current = prices[prices.length - 1];
    if (high === low) return 0.5;
    return (current - low) / (high - low);
  }

  calculateSMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateRSI(prices, period) {
    if (prices.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  detectRSIReversal(prices) {
    if (prices.length < 20) return 'NEUTRAL';

    const rsi = this.calculateRSI(prices, 14);
    const prevRsi = this.calculateRSI(prices.slice(0, -3), 14);

    // 過売りからの反発
    if (prevRsi < 30 && rsi > prevRsi + 5) {
      return 'HIGH';
    }
    // 過買いからの反落
    if (prevRsi > 70 && rsi < prevRsi - 5) {
      return 'LOW';
    }
    return 'NEUTRAL';
  }

  /**
   * Stochastic計算（正確版）
   * v5.8.12: %Dを正しい3期間SMAで計算
   */
  calculateStochastic(prices, period) {
    if (prices.length < period + 3) return { k: 50, d: 50 };

    // Raw %K 配列を計算（%Dの計算に必要）
    const rawKValues = [];
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const high = Math.max(...slice);
      const low = Math.min(...slice);
      const close = prices[i];

      if (high === low) {
        rawKValues.push(50);
      } else {
        rawKValues.push(((close - low) / (high - low)) * 100);
      }
    }

    if (rawKValues.length < 3) return { k: 50, d: 50 };

    // %K
    const k = rawKValues[rawKValues.length - 1];

    // %D = %Kの3期間SMA
    const recentK = rawKValues.slice(-3);
    const d = recentK.reduce((a, b) => a + b, 0) / 3;

    return { k, d };
  }

  detectStochReversal(stoch) {
    // 過売りからの反発
    if (stoch.k < 25 && stoch.k > stoch.d) {
      return 'HIGH';
    }
    // 過買いからの反落
    if (stoch.k > 75 && stoch.k < stoch.d) {
      return 'LOW';
    }
    return 'NEUTRAL';
  }

  calculateCCI(prices, period) {
    if (prices.length < period) return 0;

    const tp = prices[prices.length - 1]; // 簡易版：終値のみ使用
    const sma = this.calculateSMA(prices, period);

    // 平均偏差
    const slice = prices.slice(-period);
    const meanDev = slice.reduce((sum, p) => sum + Math.abs(p - sma), 0) / period;

    if (meanDev === 0) return 0;
    return (tp - sma) / (0.015 * meanDev);
  }

  calculateWilliamsR(prices, period) {
    if (prices.length < period) return -50;

    const recent = prices.slice(-period);
    const high = Math.max(...recent);
    const low = Math.min(...recent);
    const current = prices[prices.length - 1];

    if (high === low) return -50;
    return ((high - current) / (high - low)) * -100;
  }

  /**
   * MACD計算（正確版）
   * v5.8.12: シグナルラインを正しい9期間EMAで計算
   */
  calculateMACD(prices) {
    if (prices.length < 35) {
      const ema12 = this.calculateEMA(prices, 12);
      const ema26 = this.calculateEMA(prices, 26);
      const macdLine = ema12 - ema26;
      return { macdLine, signalLine: macdLine * 0.85, histogram: macdLine * 0.15 };
    }

    // MACD配列を計算
    const macdArray = [];
    for (let i = 25; i < prices.length; i++) {
      const slice = prices.slice(0, i + 1);
      const ema12 = this.calculateEMA(slice, 12);
      const ema26 = this.calculateEMA(slice, 26);
      macdArray.push(ema12 - ema26);
    }

    if (macdArray.length < 9) {
      const macdLine = macdArray[macdArray.length - 1];
      return { macdLine, signalLine: macdLine * 0.85, histogram: macdLine * 0.15 };
    }

    // 現在のMACD値
    const macdLine = macdArray[macdArray.length - 1];

    // シグナルライン = MACDの9期間EMA
    const k = 2 / (9 + 1);
    let signalLine = macdArray[0];
    for (let i = 1; i < macdArray.length; i++) {
      signalLine = macdArray[i] * k + signalLine * (1 - k);
    }

    const histogram = macdLine - signalLine;

    return { macdLine, signalLine, histogram };
  }

  calculateMACDMomentum(prices) {
    if (prices.length < 30) return 0;

    const current = this.calculateMACD(prices);
    const prev = this.calculateMACD(prices.slice(0, -3));

    return current.histogram - prev.histogram;
  }

  calculateBollingerBands(prices, period) {
    const sma = this.calculateSMA(prices, period);
    const slice = prices.slice(-period);

    // 標準偏差
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      middle: sma,
      upper: sma + stdDev * 2,
      lower: sma - stdDev * 2,
      stdDev
    };
  }

  detectBBBreakout(prices, bb) {
    if (prices.length < 5) return 'NEUTRAL';

    const current = prices[prices.length - 1];
    const prev = prices[prices.length - 3];

    // 下限から反発
    if (prev <= bb.lower && current > bb.lower) {
      return 'HIGH';
    }
    // 上限から反落
    if (prev >= bb.upper && current < bb.upper) {
      return 'LOW';
    }
    return 'NEUTRAL';
  }

  calculateATRDirection(prices, period) {
    if (prices.length < period + 5) return 0;

    // 現在のATR vs 5期間前のATR
    const currentATR = this.calculateATR(prices, period);
    const prevATR = this.calculateATR(prices.slice(0, -5), period);

    if (prevATR === 0) return 0;
    return (currentATR - prevATR) / prevATR;
  }

  calculateATR(prices, period) {
    if (prices.length < period + 1) return 0;

    let trSum = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const tr = Math.abs(prices[i] - prices[i - 1]);
      trSum += tr;
    }
    return trSum / period;
  }

  analyzeRecentBars(prices, count) {
    if (prices.length < count + 1) return 'NEUTRAL';

    let upCount = 0, downCount = 0;
    for (let i = prices.length - count; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) upCount++;
      else if (prices[i] < prices[i - 1]) downCount++;
    }

    if (upCount >= count * 0.7) return 'HIGH';
    if (downCount >= count * 0.7) return 'LOW';
    return 'NEUTRAL';
  }

  detectHigherHighLowerLow(prices, period) {
    if (prices.length < period * 2) return 'NEUTRAL';

    const firstHalf = prices.slice(-period * 2, -period);
    const secondHalf = prices.slice(-period);

    const firstHigh = Math.max(...firstHalf);
    const firstLow = Math.min(...firstHalf);
    const secondHigh = Math.max(...secondHalf);
    const secondLow = Math.min(...secondHalf);

    // 高値更新 & 安値切り上げ → 上昇トレンド
    if (secondHigh > firstHigh && secondLow > firstLow) {
      return 'HIGH';
    }
    // 安値更新 & 高値切り下げ → 下降トレンド
    if (secondLow < firstLow && secondHigh < firstHigh) {
      return 'LOW';
    }
    return 'NEUTRAL';
  }

  calculateAcceleration(prices, period) {
    if (prices.length < period * 2) return 0;

    const recentMom = this.calculateMomentum(prices, period);
    const prevMom = this.calculateMomentum(prices.slice(0, -period), period);

    return recentMom - prevMom;
  }

  analyzeTickDirection(ticks, count) {
    if (ticks.length < count) return 'NEUTRAL';

    const recent = ticks.slice(-count);
    let upCount = 0;

    for (const tick of recent) {
      if (tick.change > 0) upCount++;
    }

    const upRatio = upCount / count;
    if (upRatio >= 0.65) return 'HIGH';
    if (upRatio <= 0.35) return 'LOW';
    return 'NEUTRAL';
  }
}

// グローバルに公開
window.AdvancedSignalEngine = AdvancedSignalEngine;
