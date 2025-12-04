/**
 * Signal Enhancer System
 * Version: 1.0.0
 *
 * AI予測の精度を維持しながらシグナル回数を増やす3つの機能:
 * 1. 複数時間枠統合シグナル (Multi-Timeframe Consensus)
 * 2. パターンクラスタリング (Pattern Clustering)
 * 3. ボラティリティ適応型閾値 (Volatility-Adaptive Threshold)
 */

// デバッグモード
if (typeof window.DEBUG_MODE === 'undefined') {
  window.DEBUG_MODE = false;
}
const sesLog = window.DEBUG_MODE ? console.log.bind(console) : () => {};

// ========================================
// 1. 複数時間枠統合シグナル
// ========================================

class MultiTimeframeConsensus {
  constructor() {
    // 各時間枠の重み（長い時間枠ほど信頼性が高い）
    this.timeframeWeights = {
      15: 0.6,   // 15秒: ノイズが多い
      30: 0.8,   // 30秒: やや信頼
      60: 1.0,   // 60秒: 基準
      180: 1.1,  // 3分: 高信頼
      300: 1.2   // 5分: 最高信頼
    };

    // 統合シグナル発出の最小合意スコア
    this.minConsensusScore = 1.5; // 重み付き合意スコア
  }

  /**
   * 複数時間枠の予測結果から統合シグナルを計算
   * @param {Object} predictions - 各時間枠の予測結果 { 15: {...}, 30: {...}, ... }
   * @param {number} primaryTimeframe - メインの時間枠
   * @returns {Object} 統合シグナル結果
   */
  calculateConsensus(predictions, primaryTimeframe) {
    const timeframes = Object.keys(predictions).map(Number).filter(tf => predictions[tf]);

    if (timeframes.length < 2) {
      return { hasConsensus: false, reason: 'INSUFFICIENT_TIMEFRAMES' };
    }

    let highScore = 0;
    let lowScore = 0;
    let totalWeight = 0;
    const details = [];

    for (const tf of timeframes) {
      const pred = predictions[tf];
      if (!pred || pred.prediction === 'INSUFFICIENT_DATA') continue;

      const weight = this.timeframeWeights[tf] || 1.0;
      totalWeight += weight;

      const upRate = pred.upRate || 0;
      const downRate = pred.downRate || 0;
      const diff = Math.abs(upRate - downRate);

      // 方向性の判定
      let direction = 'NEUTRAL';
      let strength = 0;

      if (upRate >= 60) {
        direction = 'HIGH';
        strength = (upRate - 50) / 50; // 50-100% を 0-1 に正規化
      } else if (downRate >= 60) {
        direction = 'LOW';
        strength = (downRate - 50) / 50;
      } else if (diff >= 20) {
        // 傾向レベル（弱いシグナル）
        direction = upRate > downRate ? 'TREND_HIGH' : 'TREND_LOW';
        strength = diff / 100 * 0.5; // 傾向は半分の強度
      }

      if (direction === 'HIGH' || direction === 'TREND_HIGH') {
        highScore += weight * strength;
      } else if (direction === 'LOW' || direction === 'TREND_LOW') {
        lowScore += weight * strength;
      }

      details.push({
        timeframe: tf,
        direction,
        strength,
        weight,
        upRate,
        downRate
      });
    }

    // 合意スコアの計算
    const netScore = highScore - lowScore;
    const absScore = Math.abs(netScore);
    const consensusDirection = netScore > 0 ? 'HIGH' : netScore < 0 ? 'LOW' : 'NEUTRAL';

    // プライマリ時間枠との一致ボーナス
    const primaryPred = predictions[primaryTimeframe];
    let primaryBonus = 0;
    if (primaryPred && primaryPred.prediction !== 'INSUFFICIENT_DATA') {
      const primaryUp = primaryPred.upRate || 0;
      const primaryDown = primaryPred.downRate || 0;
      const primaryDir = primaryUp >= 60 ? 'HIGH' : primaryDown >= 60 ? 'LOW' :
                         primaryUp > primaryDown && Math.abs(primaryUp - primaryDown) >= 20 ? 'TREND_HIGH' :
                         primaryDown > primaryUp && Math.abs(primaryUp - primaryDown) >= 20 ? 'TREND_LOW' : 'NEUTRAL';

      if ((consensusDirection === 'HIGH' && (primaryDir === 'HIGH' || primaryDir === 'TREND_HIGH')) ||
          (consensusDirection === 'LOW' && (primaryDir === 'LOW' || primaryDir === 'TREND_LOW'))) {
        primaryBonus = 0.3;
      }
    }

    const finalScore = absScore + primaryBonus;
    const hasConsensus = finalScore >= this.minConsensusScore && consensusDirection !== 'NEUTRAL';

    // 統合シグナルの信頼度（星レベル用）
    // 1.5-2.0 → ★1, 2.0-2.5 → ★2, 2.5-3.0 → ★3, 3.0+ → ★4
    let starLevel = 1;
    if (finalScore >= 3.0) starLevel = 4;
    else if (finalScore >= 2.5) starLevel = 3;
    else if (finalScore >= 2.0) starLevel = 2;

    sesLog(`[MTC] 統合シグナル計算: HIGH=${highScore.toFixed(2)}, LOW=${lowScore.toFixed(2)}, net=${netScore.toFixed(2)}, consensus=${hasConsensus}`);

    return {
      hasConsensus,
      direction: consensusDirection,
      score: finalScore,
      starLevel,
      highScore,
      lowScore,
      agreementCount: details.filter(d =>
        (consensusDirection === 'HIGH' && (d.direction === 'HIGH' || d.direction === 'TREND_HIGH')) ||
        (consensusDirection === 'LOW' && (d.direction === 'LOW' || d.direction === 'TREND_LOW'))
      ).length,
      totalTimeframes: timeframes.length,
      details,
      reason: hasConsensus ? 'CONSENSUS_REACHED' : 'NO_CONSENSUS'
    };
  }
}

// ========================================
// 2. パターンクラスタリング
// ========================================

class PatternClusterer {
  constructor() {
    // クラスタ定義（勝率に基づく）
    this.clusters = {
      HIGH_WIN: { minWinRate: 65, thresholdBonus: -15 },  // 勝率65%以上: 閾値を15%下げる
      MEDIUM_WIN: { minWinRate: 55, thresholdBonus: -5 }, // 勝率55-65%: 閾値を5%下げる
      LOW_WIN: { minWinRate: 0, thresholdBonus: 5 }       // 勝率55%未満: 閾値を5%上げる
    };

    // パターン特徴ごとの勝率履歴
    this.patternWinRates = {};

    // 統計情報
    this.stats = {
      totalPatterns: 0,
      highWinPatterns: 0,
      mediumWinPatterns: 0,
      lowWinPatterns: 0
    };
  }

  /**
   * パターンの特徴を抽出してクラスタを判定
   * @param {Object} situation - 現在の相場状況
   * @param {Array} matchedPatterns - マッチした過去パターン
   * @returns {Object} クラスタ情報
   */
  classifyPattern(situation, matchedPatterns) {
    if (!matchedPatterns || matchedPatterns.length < 5) {
      return { cluster: 'UNKNOWN', thresholdBonus: 0, confidence: 0 };
    }

    // パターンの特徴を抽出
    const features = this.extractFeatures(situation);
    const featureKey = this.getFeatureKey(features);

    // マッチしたパターンから勝率を計算
    const winRate = this.calculateWinRate(matchedPatterns);

    // クラスタを判定
    let cluster = 'LOW_WIN';
    let thresholdBonus = this.clusters.LOW_WIN.thresholdBonus;

    if (winRate >= this.clusters.HIGH_WIN.minWinRate) {
      cluster = 'HIGH_WIN';
      thresholdBonus = this.clusters.HIGH_WIN.thresholdBonus;
    } else if (winRate >= this.clusters.MEDIUM_WIN.minWinRate) {
      cluster = 'MEDIUM_WIN';
      thresholdBonus = this.clusters.MEDIUM_WIN.thresholdBonus;
    }

    // 勝率履歴を更新
    this.updateWinRateHistory(featureKey, winRate, cluster);

    sesLog(`[PC] パターン分類: cluster=${cluster}, winRate=${winRate.toFixed(1)}%, thresholdBonus=${thresholdBonus}`);

    return {
      cluster,
      thresholdBonus,
      winRate,
      features,
      featureKey,
      confidence: matchedPatterns.length >= 20 ? 'HIGH' : matchedPatterns.length >= 10 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * 相場状況から特徴を抽出
   */
  extractFeatures(situation) {
    const features = {
      // ボラティリティレベル
      volatility: 'MEDIUM',
      // トレンド強度
      trendStrength: 'MEDIUM',
      // 時間帯
      timeSlot: 'NORMAL',
      // パターン形状
      patternShape: 'NEUTRAL'
    };

    // priceSegmentsからボラティリティを判定
    const segments = situation.priceSegments30s || situation.priceSegments15s;
    if (segments) {
      const vol = segments.volatility || 0;
      if (vol > 0.03) features.volatility = 'HIGH';
      else if (vol < 0.01) features.volatility = 'LOW';

      // パターン形状
      if (segments.pattern) {
        features.patternShape = segments.pattern;
      }
    }

    // 時間帯判定
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 11) features.timeSlot = 'TOKYO_MORNING';
    else if (hour >= 14 && hour <= 16) features.timeSlot = 'EUROPE_OPEN';
    else if (hour >= 21 && hour <= 23) features.timeSlot = 'US_SESSION';
    else if (hour >= 0 && hour <= 6) features.timeSlot = 'QUIET';

    return features;
  }

  /**
   * 特徴からキーを生成
   */
  getFeatureKey(features) {
    return `${features.volatility}_${features.trendStrength}_${features.timeSlot}_${features.patternShape}`;
  }

  /**
   * マッチしたパターンから勝率を計算
   */
  calculateWinRate(matchedPatterns) {
    if (!matchedPatterns || matchedPatterns.length === 0) return 50;

    let wins = 0;
    let total = 0;

    for (const pattern of matchedPatterns) {
      // 予測方向と実際の結果を比較
      const result = pattern.result30s || pattern.result15s || pattern.result60s;
      if (!result || result.pending) continue;

      const predictedDir = pattern.upRate > pattern.downRate ? 'UP' : 'DOWN';
      const actualDir = result.direction;

      if (predictedDir === actualDir) wins++;
      total++;
    }

    return total > 0 ? (wins / total) * 100 : 50;
  }

  /**
   * 勝率履歴を更新
   */
  updateWinRateHistory(featureKey, winRate, cluster) {
    if (!this.patternWinRates[featureKey]) {
      this.patternWinRates[featureKey] = { samples: [], avgWinRate: 50, cluster };
    }

    const history = this.patternWinRates[featureKey];
    history.samples.push(winRate);

    // 最新100サンプルのみ保持
    if (history.samples.length > 100) {
      history.samples.shift();
    }

    // 平均を更新
    history.avgWinRate = history.samples.reduce((a, b) => a + b, 0) / history.samples.length;
    history.cluster = cluster;

    // 統計更新
    this.stats.totalPatterns++;
    if (cluster === 'HIGH_WIN') this.stats.highWinPatterns++;
    else if (cluster === 'MEDIUM_WIN') this.stats.mediumWinPatterns++;
    else this.stats.lowWinPatterns++;
  }

  /**
   * 特定の特徴キーの履歴から推奨閾値ボーナスを取得
   */
  getHistoricalThresholdBonus(featureKey) {
    const history = this.patternWinRates[featureKey];
    if (!history || history.samples.length < 10) {
      return 0; // 履歴不足
    }

    // 過去の平均勝率からボーナスを決定
    if (history.avgWinRate >= 65) return -15;
    if (history.avgWinRate >= 55) return -5;
    return 5;
  }
}

// ========================================
// 3. ボラティリティ適応型閾値
// ========================================

class VolatilityAdaptiveThreshold {
  constructor() {
    // ボラティリティレベル別の閾値調整
    this.adjustments = {
      VERY_HIGH: { thresholdMod: -15, description: '超高ボラ: パターンが明確' },
      HIGH: { thresholdMod: -10, description: '高ボラ: やや明確' },
      MEDIUM: { thresholdMod: 0, description: '中ボラ: 標準' },
      LOW: { thresholdMod: 5, description: '低ボラ: ノイズ多め' },
      VERY_LOW: { thresholdMod: 10, description: '超低ボラ: 信頼性低' }
    };

    // ボラティリティ履歴（移動平均計算用）
    this.volatilityHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * 現在のボラティリティに基づいて閾値を調整
   * @param {Object} situation - 現在の相場状況
   * @param {number} baseThreshold - ベースの閾値
   * @returns {Object} 調整結果
   */
  adjustThreshold(situation, baseThreshold) {
    const volatility = this.calculateVolatility(situation);
    const level = this.classifyVolatility(volatility);
    const adjustment = this.adjustments[level];

    const adjustedThreshold = Math.max(30, Math.min(90, baseThreshold + adjustment.thresholdMod));

    sesLog(`[VAT] ボラティリティ調整: vol=${volatility.toFixed(4)}, level=${level}, base=${baseThreshold}, adjusted=${adjustedThreshold}`);

    return {
      volatility,
      level,
      baseThreshold,
      adjustedThreshold,
      modification: adjustment.thresholdMod,
      description: adjustment.description
    };
  }

  /**
   * 相場状況からボラティリティを計算
   */
  calculateVolatility(situation) {
    // 複数のソースからボラティリティを取得
    const sources = [];

    // priceSegmentsから
    for (const tf of [15, 30, 60]) {
      const segments = situation[`priceSegments${tf}s`];
      if (segments && typeof segments.volatility === 'number') {
        sources.push(segments.volatility);
      }
    }

    // ATRから（存在すれば）
    if (situation.atrPercent) {
      sources.push(situation.atrPercent / 100);
    }

    // 平均を計算
    if (sources.length === 0) return 0.015; // デフォルト値

    const avgVolatility = sources.reduce((a, b) => a + b, 0) / sources.length;

    // 履歴に追加
    this.volatilityHistory.push(avgVolatility);
    if (this.volatilityHistory.length > this.maxHistorySize) {
      this.volatilityHistory.shift();
    }

    return avgVolatility;
  }

  /**
   * ボラティリティをレベルに分類
   */
  classifyVolatility(volatility) {
    // 履歴がある場合は相対的に判断
    if (this.volatilityHistory.length >= 20) {
      const sorted = [...this.volatilityHistory].sort((a, b) => a - b);
      const percentile = this.volatilityHistory.filter(v => v <= volatility).length / this.volatilityHistory.length;

      if (percentile >= 0.9) return 'VERY_HIGH';
      if (percentile >= 0.7) return 'HIGH';
      if (percentile >= 0.3) return 'MEDIUM';
      if (percentile >= 0.1) return 'LOW';
      return 'VERY_LOW';
    }

    // 履歴不足時は絶対値で判断（FX 30秒足の典型的な範囲）
    if (volatility >= 0.04) return 'VERY_HIGH';
    if (volatility >= 0.025) return 'HIGH';
    if (volatility >= 0.01) return 'MEDIUM';
    if (volatility >= 0.005) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * 現在のボラティリティ統計を取得
   */
  getStatistics() {
    if (this.volatilityHistory.length === 0) {
      return { current: 0, avg: 0, min: 0, max: 0, level: 'UNKNOWN' };
    }

    const current = this.volatilityHistory[this.volatilityHistory.length - 1];
    const avg = this.volatilityHistory.reduce((a, b) => a + b, 0) / this.volatilityHistory.length;
    const min = Math.min(...this.volatilityHistory);
    const max = Math.max(...this.volatilityHistory);

    return {
      current,
      avg,
      min,
      max,
      level: this.classifyVolatility(current),
      historySize: this.volatilityHistory.length
    };
  }
}

// ========================================
// 統合シグナル強化システム
// ========================================

class SignalEnhancerSystem {
  constructor() {
    this.multiTimeframe = new MultiTimeframeConsensus();
    this.patternClusterer = new PatternClusterer();
    this.volatilityAdapter = new VolatilityAdaptiveThreshold();

    // 強化シグナルの履歴
    this.enhancedSignalHistory = [];
    this.maxHistorySize = 500;

    sesLog('[SES] Signal Enhancer System initialized');
  }

  /**
   * シグナルを強化（3つの手法を統合）
   * @param {Object} params - パラメータ
   * @param {Object} params.situation - 現在の相場状況
   * @param {Object} params.predictions - 各時間枠の予測結果
   * @param {Array} params.matchedPatterns - マッチしたパターン
   * @param {number} params.primaryTimeframe - メインの時間枠
   * @param {number} params.baseThreshold - ベースの閾値
   * @returns {Object} 強化されたシグナル
   */
  enhance(params) {
    const { situation, predictions, matchedPatterns, primaryTimeframe, baseThreshold } = params;

    // 1. 複数時間枠統合
    const consensus = this.multiTimeframe.calculateConsensus(predictions, primaryTimeframe);

    // 2. パターンクラスタリング
    const cluster = this.patternClusterer.classifyPattern(situation, matchedPatterns);

    // 3. ボラティリティ適応
    const volatility = this.volatilityAdapter.adjustThreshold(situation, baseThreshold);

    // 統合閾値の計算
    const thresholdAdjustment = cluster.thresholdBonus + volatility.modification;
    const effectiveThreshold = Math.max(30, Math.min(90, baseThreshold + thresholdAdjustment));

    // プライマリ時間枠の予測
    const primaryPred = predictions[primaryTimeframe];
    const primaryUpRate = primaryPred?.upRate || 50;
    const primaryDownRate = primaryPred?.downRate || 50;
    const primarySimilarity = primaryPred?.similarity || 0;

    // 強化シグナルの判定
    let enhancedSignal = {
      type: 'NONE',
      direction: 'NEUTRAL',
      confidence: 0,
      starLevel: 0,
      source: []
    };

    // シグナル発出条件のチェック

    // A. 標準シグナル（60%以上）
    if (primaryUpRate >= 60 || primaryDownRate >= 60) {
      enhancedSignal = {
        type: 'STANDARD',
        direction: primaryUpRate >= 60 ? 'HIGH' : 'LOW',
        confidence: Math.max(primaryUpRate, primaryDownRate),
        starLevel: this.getStarLevel(Math.max(primaryUpRate, primaryDownRate)),
        source: ['STANDARD']
      };
    }
    // B. 複数時間枠合意シグナル（類似度が調整後閾値以上）
    else if (consensus.hasConsensus && primarySimilarity >= effectiveThreshold) {
      enhancedSignal = {
        type: 'MULTI_TIMEFRAME',
        direction: consensus.direction,
        confidence: consensus.score * 20, // スコアを%に変換
        starLevel: consensus.starLevel,
        source: ['MULTI_TIMEFRAME'],
        consensusDetails: consensus
      };
    }
    // C. 高勝率クラスタシグナル（クラスタが HIGH_WIN で類似度が調整後閾値以上）
    else if (cluster.cluster === 'HIGH_WIN' && primarySimilarity >= effectiveThreshold) {
      const diff = Math.abs(primaryUpRate - primaryDownRate);
      if (diff >= 15) { // 15pt以上の差がある場合
        enhancedSignal = {
          type: 'HIGH_WIN_CLUSTER',
          direction: primaryUpRate > primaryDownRate ? 'HIGH' : 'LOW',
          confidence: cluster.winRate,
          starLevel: Math.min(3, Math.floor((cluster.winRate - 50) / 10) + 1),
          source: ['HIGH_WIN_CLUSTER'],
          clusterDetails: cluster
        };
      }
    }
    // D. ボラティリティ適応シグナル（高ボラ時で類似度が調整後閾値以上）
    else if ((volatility.level === 'HIGH' || volatility.level === 'VERY_HIGH') &&
             primarySimilarity >= effectiveThreshold) {
      const diff = Math.abs(primaryUpRate - primaryDownRate);
      if (diff >= 15) {
        enhancedSignal = {
          type: 'VOLATILITY_ADAPTED',
          direction: primaryUpRate > primaryDownRate ? 'HIGH' : 'LOW',
          confidence: 50 + diff / 2,
          starLevel: volatility.level === 'VERY_HIGH' ? 2 : 1,
          source: ['VOLATILITY_ADAPTED'],
          volatilityDetails: volatility
        };
      }
    }
    // E. 傾向シグナル（20pt以上の差）- 既存ロジック
    else {
      const diff = Math.abs(primaryUpRate - primaryDownRate);
      if (diff >= 20) {
        enhancedSignal = {
          type: 'TREND',
          direction: primaryUpRate > primaryDownRate ? 'TREND_HIGH' : 'TREND_LOW',
          confidence: diff,
          starLevel: diff >= 30 ? 2 : 1,
          source: ['TREND']
        };
      }
    }

    // 複数ソースの統合（シグナルが複数の条件を満たす場合）
    if (enhancedSignal.type !== 'NONE' && enhancedSignal.type !== 'STANDARD') {
      // 複数時間枠の合意がある場合、ソースに追加
      if (consensus.hasConsensus &&
          ((enhancedSignal.direction === 'HIGH' && consensus.direction === 'HIGH') ||
           (enhancedSignal.direction === 'LOW' && consensus.direction === 'LOW') ||
           (enhancedSignal.direction === 'TREND_HIGH' && consensus.direction === 'HIGH') ||
           (enhancedSignal.direction === 'TREND_LOW' && consensus.direction === 'LOW'))) {
        if (!enhancedSignal.source.includes('MULTI_TIMEFRAME')) {
          enhancedSignal.source.push('MULTI_TIMEFRAME');
          enhancedSignal.starLevel = Math.min(5, enhancedSignal.starLevel + 1);
        }
      }

      // 高勝率クラスタの場合、ソースに追加
      if (cluster.cluster === 'HIGH_WIN' && !enhancedSignal.source.includes('HIGH_WIN_CLUSTER')) {
        enhancedSignal.source.push('HIGH_WIN_CLUSTER');
        enhancedSignal.starLevel = Math.min(5, enhancedSignal.starLevel + 1);
      }
    }

    // 結果オブジェクト
    const result = {
      enhanced: enhancedSignal.type !== 'NONE',
      signal: enhancedSignal,
      analysis: {
        consensus,
        cluster,
        volatility,
        thresholdAdjustment,
        effectiveThreshold,
        baseThreshold
      },
      timestamp: Date.now()
    };

    // 履歴に追加
    this.enhancedSignalHistory.push({
      ...result,
      primaryTimeframe,
      primaryUpRate,
      primaryDownRate
    });
    if (this.enhancedSignalHistory.length > this.maxHistorySize) {
      this.enhancedSignalHistory.shift();
    }

    sesLog(`[SES] 強化シグナル: type=${enhancedSignal.type}, dir=${enhancedSignal.direction}, star=${enhancedSignal.starLevel}, sources=${enhancedSignal.source.join(',')}`);

    return result;
  }

  /**
   * 信頼度から星レベルを計算
   */
  getStarLevel(confidence) {
    if (confidence >= 90) return 5;
    if (confidence >= 80) return 4;
    if (confidence >= 70) return 3;
    if (confidence >= 65) return 2;
    return 1;
  }

  /**
   * 統計情報を取得
   */
  getStatistics() {
    const history = this.enhancedSignalHistory;
    const totalSignals = history.filter(h => h.enhanced).length;

    const byType = {
      STANDARD: history.filter(h => h.signal.type === 'STANDARD').length,
      MULTI_TIMEFRAME: history.filter(h => h.signal.type === 'MULTI_TIMEFRAME').length,
      HIGH_WIN_CLUSTER: history.filter(h => h.signal.type === 'HIGH_WIN_CLUSTER').length,
      VOLATILITY_ADAPTED: history.filter(h => h.signal.type === 'VOLATILITY_ADAPTED').length,
      TREND: history.filter(h => h.signal.type === 'TREND').length
    };

    return {
      totalAnalyzed: history.length,
      totalSignals,
      signalRate: history.length > 0 ? (totalSignals / history.length * 100).toFixed(1) : 0,
      byType,
      patternCluster: this.patternClusterer.stats,
      volatility: this.volatilityAdapter.getStatistics()
    };
  }
}

// グローバルに公開
window.SignalEnhancerSystem = SignalEnhancerSystem;
window.MultiTimeframeConsensus = MultiTimeframeConsensus;
window.PatternClusterer = PatternClusterer;
window.VolatilityAdaptiveThreshold = VolatilityAdaptiveThreshold;

sesLog('[SES] Signal Enhancer System module loaded');
