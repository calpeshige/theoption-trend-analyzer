/**
 * Pattern Stratification System
 * Version: 1.0.0
 *
 * パターンマッチングの精度を向上させる3つの層別化機能:
 * 1. コンテキスト層別化 (Context Stratification)
 * 2. ボラティリティ層別化 (Volatility Stratification)
 * 3. 連続パターン分析 (Sequential Pattern Analysis)
 */

// デバッグモード
const PSS_DEBUG = true;  // 動作確認後はfalseに変更
const pssLog = PSS_DEBUG ? console.log.bind(console) : () => {};

// ========================================
// 1. コンテキスト層別化
// ========================================

/**
 * マッチしたパターンを市場コンテキストで層別化
 * 同じパターンでも、発生時の相場状況で結果が異なることを考慮
 */
class ContextStratifier {
  constructor() {
    // コンテキスト分類の定義
    this.contextTypes = {
      STRONG_TREND_UP: { name: '強い上昇トレンド', weight: 1.5 },
      TREND_UP: { name: '上昇トレンド', weight: 1.3 },
      WEAK_TREND_UP: { name: '弱い上昇トレンド', weight: 1.1 },
      RANGE: { name: 'レンジ相場', weight: 1.0 },
      WEAK_TREND_DOWN: { name: '弱い下降トレンド', weight: 1.1 },
      TREND_DOWN: { name: '下降トレンド', weight: 1.3 },
      STRONG_TREND_DOWN: { name: '強い下降トレンド', weight: 1.5 }
    };
  }

  /**
   * 相場状況からコンテキストを判定
   * @param {Object} situation - 相場状況オブジェクト
   * @returns {string} コンテキストタイプ
   */
  classifyContext(situation) {
    if (!situation) return 'RANGE';

    // トレンド強度とセンチメントから判定
    // フィールド名: 変換済み(trendStrength等) または 元データ(macdStrength等) を参照
    const trendStrength = situation.trendStrength ?? situation.macdStrength ?? 0;
    const sentiment = situation.sentiment ?? situation.sentimentScore ?? 0;
    const momentum = situation.momentum ?? situation.rocValue ?? 0;

    // センチメントは0-1の場合は0-100に変換
    const normalizedSentiment = sentiment <= 1 ? sentiment * 100 : sentiment;

    // 複合スコアを計算（トレンド強度50% + センチメント30% + モメンタム20%）
    const compositeScore = (trendStrength * 0.5) + (normalizedSentiment * 0.3) + (momentum * 0.2);

    if (compositeScore >= 70) return 'STRONG_TREND_UP';
    if (compositeScore >= 55) return 'TREND_UP';
    if (compositeScore >= 45) return 'WEAK_TREND_UP';
    if (compositeScore >= 35) return 'WEAK_TREND_DOWN';
    if (compositeScore >= 20) return 'TREND_DOWN';
    if (compositeScore < 20) return 'STRONG_TREND_DOWN';

    return 'RANGE';
  }

  /**
   * パターンをコンテキストで層別化して分析
   * @param {Array} patterns - マッチしたパターン配列
   * @param {Object} currentSituation - 現在の相場状況
   * @param {number} timeframe - 判定時間（秒）
   * @returns {Object} 層別化された分析結果
   */
  stratify(patterns, currentSituation, timeframe) {
    const currentContext = this.classifyContext(currentSituation);
    pssLog(`[PSS-Context] 現在のコンテキスト: ${currentContext} (${this.contextTypes[currentContext]?.name || '不明'})`);

    // パターンをコンテキストで分類
    const stratified = {};
    Object.keys(this.contextTypes).forEach(ctx => {
      stratified[ctx] = [];
    });

    for (const pattern of patterns) {
      const patternContext = this.classifyContext(pattern.pattern);
      if (stratified[patternContext]) {
        stratified[patternContext].push(pattern);
      }
    }

    // 現在のコンテキストに一致するパターンの統計
    const matchingPatterns = stratified[currentContext] || [];
    const resultKey = `result${timeframe}s`;

    let contextUpCount = 0;
    let contextDownCount = 0;
    let contextTotalWeight = 0;
    let contextWeightedUp = 0;
    let contextWeightedDown = 0;

    for (const p of matchingPatterns) {
      const result = p.pattern[resultKey];
      if (!result || result.pending) continue;

      const weight = p.similarity / 100;
      contextTotalWeight += weight;

      if (result.direction === 'UP') {
        contextUpCount++;
        contextWeightedUp += weight;
      } else if (result.direction === 'DOWN') {
        contextDownCount++;
        contextWeightedDown += weight;
      }
    }

    // 全パターンの統計（参照用）
    let allUpCount = 0;
    let allDownCount = 0;
    let allTotalWeight = 0;
    let allWeightedUp = 0;
    let allWeightedDown = 0;

    for (const p of patterns) {
      const result = p.pattern[resultKey];
      if (!result || result.pending) continue;

      const weight = p.similarity / 100;
      allTotalWeight += weight;

      if (result.direction === 'UP') {
        allUpCount++;
        allWeightedUp += weight;
      } else if (result.direction === 'DOWN') {
        allDownCount++;
        allWeightedDown += weight;
      }
    }

    // コンテキスト一致パターンの率を計算
    const contextUpRate = contextTotalWeight > 0 ? (contextWeightedUp / contextTotalWeight) * 100 : 0;
    const contextDownRate = contextTotalWeight > 0 ? (contextWeightedDown / contextTotalWeight) * 100 : 0;

    // 全パターンの率
    const allUpRate = allTotalWeight > 0 ? (allWeightedUp / allTotalWeight) * 100 : 0;
    const allDownRate = allTotalWeight > 0 ? (allWeightedDown / allTotalWeight) * 100 : 0;

    const contextBoost = contextUpCount + contextDownCount >= 5 ?
      Math.abs(contextUpRate - contextDownRate) - Math.abs(allUpRate - allDownRate) : 0;

    pssLog(`[PSS-Context] コンテキスト一致: ${matchingPatterns.length}件 (UP: ${contextUpRate.toFixed(1)}%, DOWN: ${contextDownRate.toFixed(1)}%)`);
    pssLog(`[PSS-Context] 全パターン: ${patterns.length}件 (UP: ${allUpRate.toFixed(1)}%, DOWN: ${allDownRate.toFixed(1)}%)`);
    pssLog(`[PSS-Context] コンテキストブースト: ${contextBoost.toFixed(1)}pt`);

    return {
      currentContext,
      contextName: this.contextTypes[currentContext]?.name || '不明',
      stratified: {
        context: {
          count: matchingPatterns.length,
          upCount: contextUpCount,
          downCount: contextDownCount,
          upRate: Math.round(contextUpRate),
          downRate: Math.round(contextDownRate)
        },
        all: {
          count: patterns.length,
          upCount: allUpCount,
          downCount: allDownCount,
          upRate: Math.round(allUpRate),
          downRate: Math.round(allDownRate)
        }
      },
      // コンテキスト一致のサンプルが十分かどうか
      hasEnoughContext: matchingPatterns.length >= 5,
      contextBoost: Math.round(contextBoost)
    };
  }
}

// ========================================
// 2. ボラティリティ層別化
// ========================================

/**
 * マッチしたパターンをボラティリティで層別化
 * 高ボラ時と低ボラ時では同じパターンでも結果が異なる
 */
class VolatilityStratifier {
  constructor() {
    // ボラティリティレベルの定義（仮想通貨/法定通貨で異なる）
    this.levels = {
      VERY_HIGH: { name: '超高ボラ', weight: 1.5 },
      HIGH: { name: '高ボラ', weight: 1.3 },
      MEDIUM: { name: '中ボラ', weight: 1.0 },
      LOW: { name: '低ボラ', weight: 0.8 },
      VERY_LOW: { name: '超低ボラ', weight: 0.6 }
    };
  }

  /**
   * 相場状況からボラティリティレベルを判定
   * @param {Object} situation - 相場状況オブジェクト
   * @param {string} assetType - 'CRYPTO' or 'FIAT'
   * @returns {string} ボラティリティレベル
   */
  classifyVolatility(situation, assetType = 'FIAT') {
    if (!situation) return 'MEDIUM';

    // ATRまたはボラティリティ値を取得
    // フィールド名: 変換済み(volatility) または 元データ(atrPercent, atr) を参照
    const volatility = situation.volatility ?? situation.atrPercent ?? situation.atr ?? 0;

    // 閾値（資産タイプに応じて調整）
    const thresholds = assetType === 'CRYPTO' ? {
      VERY_HIGH: 0.001,
      HIGH: 0.0006,
      MEDIUM: 0.0003,
      LOW: 0.00015
    } : {
      VERY_HIGH: 0.0003,
      HIGH: 0.0002,
      MEDIUM: 0.0001,
      LOW: 0.00005
    };

    if (volatility >= thresholds.VERY_HIGH) return 'VERY_HIGH';
    if (volatility >= thresholds.HIGH) return 'HIGH';
    if (volatility >= thresholds.MEDIUM) return 'MEDIUM';
    if (volatility >= thresholds.LOW) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * パターンをボラティリティで層別化して分析
   * @param {Array} patterns - マッチしたパターン配列
   * @param {Object} currentSituation - 現在の相場状況
   * @param {number} timeframe - 判定時間（秒）
   * @param {string} assetType - 'CRYPTO' or 'FIAT'
   * @returns {Object} 層別化された分析結果
   */
  stratify(patterns, currentSituation, timeframe, assetType = 'FIAT') {
    const currentLevel = this.classifyVolatility(currentSituation, assetType);
    pssLog(`[PSS-Volatility] 現在のボラティリティ: ${currentLevel} (${this.levels[currentLevel]?.name || '不明'})`);

    // パターンをボラティリティで分類
    const stratified = {};
    Object.keys(this.levels).forEach(level => {
      stratified[level] = [];
    });

    for (const pattern of patterns) {
      const patternLevel = this.classifyVolatility(pattern.pattern, assetType);
      if (stratified[patternLevel]) {
        stratified[patternLevel].push(pattern);
      }
    }

    // 現在のボラティリティに一致するパターンの統計
    const matchingPatterns = stratified[currentLevel] || [];
    const resultKey = `result${timeframe}s`;

    let volUpCount = 0;
    let volDownCount = 0;
    let volTotalWeight = 0;
    let volWeightedUp = 0;
    let volWeightedDown = 0;

    for (const p of matchingPatterns) {
      const result = p.pattern[resultKey];
      if (!result || result.pending) continue;

      const weight = p.similarity / 100;
      volTotalWeight += weight;

      if (result.direction === 'UP') {
        volUpCount++;
        volWeightedUp += weight;
      } else if (result.direction === 'DOWN') {
        volDownCount++;
        volWeightedDown += weight;
      }
    }

    // ボラティリティ一致パターンの率を計算
    const volUpRate = volTotalWeight > 0 ? (volWeightedUp / volTotalWeight) * 100 : 0;
    const volDownRate = volTotalWeight > 0 ? (volWeightedDown / volTotalWeight) * 100 : 0;

    // 隣接レベルも含めた統計（ボラティリティは隣接レベルも参考になる）
    const adjacentLevels = this.getAdjacentLevels(currentLevel);
    let adjacentUpCount = 0;
    let adjacentDownCount = 0;
    let adjacentTotalWeight = 0;

    for (const level of adjacentLevels) {
      for (const p of (stratified[level] || [])) {
        const result = p.pattern[resultKey];
        if (!result || result.pending) continue;

        const weight = p.similarity / 100;
        adjacentTotalWeight += weight;

        if (result.direction === 'UP') {
          adjacentUpCount++;
        } else if (result.direction === 'DOWN') {
          adjacentDownCount++;
        }
      }
    }

    const adjacentUpRate = adjacentTotalWeight > 0 ?
      (adjacentUpCount / (adjacentUpCount + adjacentDownCount)) * 100 : 0;
    const adjacentDownRate = adjacentTotalWeight > 0 ?
      (adjacentDownCount / (adjacentUpCount + adjacentDownCount)) * 100 : 0;

    pssLog(`[PSS-Volatility] ボラ一致: ${matchingPatterns.length}件 (UP: ${volUpRate.toFixed(1)}%, DOWN: ${volDownRate.toFixed(1)}%)`);
    pssLog(`[PSS-Volatility] 隣接レベル含む: ${adjacentUpCount + adjacentDownCount}件`);

    return {
      currentLevel,
      levelName: this.levels[currentLevel]?.name || '不明',
      stratified: {
        exact: {
          count: matchingPatterns.length,
          upCount: volUpCount,
          downCount: volDownCount,
          upRate: Math.round(volUpRate),
          downRate: Math.round(volDownRate)
        },
        adjacent: {
          count: adjacentUpCount + adjacentDownCount,
          upRate: Math.round(adjacentUpRate),
          downRate: Math.round(adjacentDownRate)
        }
      },
      hasEnoughVolMatch: matchingPatterns.length >= 5,
      volatilityBoost: Math.round(Math.abs(volUpRate - volDownRate) - Math.abs(adjacentUpRate - adjacentDownRate))
    };
  }

  /**
   * 隣接するボラティリティレベルを取得
   */
  getAdjacentLevels(level) {
    const order = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];
    const idx = order.indexOf(level);
    const adjacent = [level];
    if (idx > 0) adjacent.push(order[idx - 1]);
    if (idx < order.length - 1) adjacent.push(order[idx + 1]);
    return adjacent;
  }
}

// ========================================
// 3. 連続パターン分析
// ========================================

/**
 * 直前のパターン結果を考慮した連続パターン分析
 * パターンAの後にパターンBが来た場合の結果を分析
 */
class SequentialPatternAnalyzer {
  constructor() {
    // 連続パターン履歴（最大100件）
    this.patternHistory = [];
    this.maxHistorySize = 100;

    // 連続パターンの統計
    this.sequentialStats = {};
  }

  /**
   * パターン結果を履歴に追加
   * @param {Object} pattern - パターン情報
   * @param {string} result - 結果（'UP', 'DOWN', 'NEUTRAL'）
   */
  recordPattern(pattern, result) {
    const entry = {
      timestamp: Date.now(),
      patternType: this.classifyPattern(pattern),
      result: result
    };

    this.patternHistory.push(entry);

    // 履歴サイズ制限
    if (this.patternHistory.length > this.maxHistorySize) {
      this.patternHistory.shift();
    }

    // 連続パターン統計を更新
    this.updateSequentialStats();
  }

  /**
   * パターンを分類（簡易版）
   * @param {Object} pattern - パターン情報
   * @returns {string} パターンタイプ
   */
  classifyPattern(pattern) {
    if (!pattern) return 'UNKNOWN';

    const trendStrength = pattern.trendStrength || 0;
    const momentum = pattern.momentum || 0;

    // 簡易分類: トレンド方向 + 強度
    if (trendStrength > 60 && momentum > 0) return 'STRONG_UP';
    if (trendStrength > 50 && momentum > 0) return 'UP';
    if (trendStrength < 40 && momentum < 0) return 'STRONG_DOWN';
    if (trendStrength < 50 && momentum < 0) return 'DOWN';
    return 'NEUTRAL';
  }

  /**
   * 連続パターン統計を更新
   */
  updateSequentialStats() {
    this.sequentialStats = {};

    for (let i = 1; i < this.patternHistory.length; i++) {
      const prev = this.patternHistory[i - 1];
      const curr = this.patternHistory[i];

      // 時間間隔が5分以内のみ連続とみなす
      if (curr.timestamp - prev.timestamp > 5 * 60 * 1000) continue;

      const key = `${prev.patternType}->${curr.patternType}`;
      if (!this.sequentialStats[key]) {
        this.sequentialStats[key] = { up: 0, down: 0, total: 0 };
      }

      this.sequentialStats[key].total++;
      if (curr.result === 'UP') {
        this.sequentialStats[key].up++;
      } else if (curr.result === 'DOWN') {
        this.sequentialStats[key].down++;
      }
    }
  }

  /**
   * 連続パターンに基づく予測ブーストを計算
   * @param {Object} currentPattern - 現在のパターン
   * @param {Object} previousPattern - 直前のパターン
   * @returns {Object} ブースト情報
   */
  calculateSequentialBoost(currentPattern, previousPattern) {
    if (!previousPattern || !currentPattern) {
      return { hasSequential: false, boost: 0 };
    }

    const prevType = this.classifyPattern(previousPattern);
    const currType = this.classifyPattern(currentPattern);
    const key = `${prevType}->${currType}`;

    const stats = this.sequentialStats[key];
    if (!stats || stats.total < 5) {
      return { hasSequential: false, boost: 0, reason: 'データ不足' };
    }

    const upRate = (stats.up / stats.total) * 100;
    const downRate = (stats.down / stats.total) * 100;
    const diff = Math.abs(upRate - downRate);

    // 差が10pt以上ある場合のみブーストを適用
    if (diff < 10) {
      return { hasSequential: true, boost: 0, sequence: key, upRate, downRate, reason: '有意差なし' };
    }

    pssLog(`[PSS-Sequential] 連続パターン検出: ${key}`);
    pssLog(`[PSS-Sequential] 統計: ${stats.total}件 (UP: ${upRate.toFixed(1)}%, DOWN: ${downRate.toFixed(1)}%)`);

    return {
      hasSequential: true,
      sequence: key,
      sampleSize: stats.total,
      upRate: Math.round(upRate),
      downRate: Math.round(downRate),
      boost: Math.round(diff / 2),  // ブーストは差分の半分
      direction: upRate > downRate ? 'UP' : 'DOWN'
    };
  }

  /**
   * マッチパターンから連続パターンを分析
   * @param {Array} patterns - マッチしたパターン配列
   * @param {Object} currentSituation - 現在の相場状況
   * @param {number} timeframe - 判定時間（秒）
   * @returns {Object} 連続パターン分析結果
   */
  analyzeSequential(patterns, currentSituation, timeframe) {
    if (patterns.length === 0) {
      return { hasSequential: false };
    }

    // パターンを時系列でソート
    const sortedPatterns = [...patterns].sort((a, b) => {
      const timeA = a.pattern.timestamp || 0;
      const timeB = b.pattern.timestamp || 0;
      return timeA - timeB;
    });

    const resultKey = `result${timeframe}s`;

    // 連続パターンの統計を計算
    const sequenceStats = {};

    for (let i = 1; i < sortedPatterns.length; i++) {
      const prev = sortedPatterns[i - 1];
      const curr = sortedPatterns[i];

      // 時間間隔チェック（15分以内）
      const prevTime = prev.pattern.timestamp || 0;
      const currTime = curr.pattern.timestamp || 0;
      if (currTime - prevTime > 15 * 60 * 1000) continue;

      const prevType = this.classifyPattern(prev.pattern);
      const currType = this.classifyPattern(curr.pattern);
      const key = `${prevType}->${currType}`;

      if (!sequenceStats[key]) {
        sequenceStats[key] = { up: 0, down: 0, total: 0, patterns: [] };
      }

      const result = curr.pattern[resultKey];
      if (result && !result.pending) {
        sequenceStats[key].total++;
        sequenceStats[key].patterns.push(curr);
        if (result.direction === 'UP') {
          sequenceStats[key].up++;
        } else if (result.direction === 'DOWN') {
          sequenceStats[key].down++;
        }
      }
    }

    // 現在のパターンに対応する連続パターンを探す
    const currentType = this.classifyPattern(currentSituation);

    // 直近のパターンを取得
    const recentPattern = this.patternHistory.length > 0 ?
      this.patternHistory[this.patternHistory.length - 1] : null;

    let sequentialBoost = null;
    if (recentPattern) {
      const key = `${recentPattern.patternType}->${currentType}`;
      const stats = sequenceStats[key];
      if (stats && stats.total >= 3) {
        const upRate = (stats.up / stats.total) * 100;
        const downRate = (stats.down / stats.total) * 100;
        const diff = Math.abs(upRate - downRate);

        if (diff >= 10) {
          sequentialBoost = {
            sequence: key,
            sampleSize: stats.total,
            upRate: Math.round(upRate),
            downRate: Math.round(downRate),
            boost: Math.round(diff / 3),
            direction: upRate > downRate ? 'UP' : 'DOWN'
          };
          pssLog(`[PSS-Sequential] 連続パターン発見: ${key} (${stats.total}件, 差=${diff.toFixed(1)}pt)`);
        }
      }
    }

    // 全連続パターンの中で有意なものをリスト
    const significantSequences = Object.entries(sequenceStats)
      .filter(([_, stats]) => stats.total >= 3)
      .map(([key, stats]) => ({
        sequence: key,
        total: stats.total,
        upRate: Math.round((stats.up / stats.total) * 100),
        downRate: Math.round((stats.down / stats.total) * 100),
        diff: Math.abs((stats.up / stats.total) * 100 - (stats.down / stats.total) * 100)
      }))
      .filter(s => s.diff >= 10)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 5);

    return {
      hasSequential: sequentialBoost !== null,
      currentSequence: sequentialBoost,
      significantSequences,
      previousPattern: recentPattern?.patternType || null
    };
  }
}

// ========================================
// 統合層別化システム
// ========================================

class PatternStratificationSystem {
  constructor() {
    this.contextStratifier = new ContextStratifier();
    this.volatilityStratifier = new VolatilityStratifier();
    this.sequentialAnalyzer = new SequentialPatternAnalyzer();

    // 現在の通貨ペア情報
    this.currentSymbol = null;
    this.assetType = 'FIAT';

    pssLog('[PSS] Pattern Stratification System initialized');
  }

  /**
   * 通貨ペアを設定
   * @param {string} symbol - 通貨ペアシンボル
   */
  setSymbol(symbol) {
    this.currentSymbol = symbol;
    // CRYPTO_PAIRSがグローバルに定義されている場合は使用
    const cryptoPairs = window.CRYPTO_PAIRS || ['BTC/JPY', 'BTC/USD', 'ETH/JPY', 'ETH/USD'];
    const normalizedSymbol = symbol?.toUpperCase().replace(/([A-Z]{3})([A-Z]{3})/, '$1/$2') || '';
    this.assetType = cryptoPairs.includes(normalizedSymbol) ? 'CRYPTO' : 'FIAT';
    pssLog(`[PSS] 通貨ペア設定: ${symbol} → ${this.assetType}`);
  }

  /**
   * 総合層別化分析を実行
   * @param {Array} patterns - マッチしたパターン配列
   * @param {Object} currentSituation - 現在の相場状況
   * @param {number} timeframe - 判定時間（秒）
   * @returns {Object} 総合分析結果
   */
  analyze(patterns, currentSituation, timeframe) {
    if (!patterns || patterns.length === 0) {
      pssLog('[PSS] ⚠️ 層別化スキップ: パターンなし');
      return {
        hasEnoughData: false,
        reason: 'パターンなし'
      };
    }

    pssLog(`[PSS] ========== 層別化分析開始 ==========`);
    pssLog(`[PSS] 📊 入力データ: ${patterns.length}件, 時間枠: ${timeframe}秒, 通貨タイプ: ${this.assetType}`);
    // 両方のフィールド名に対応
    const trend = currentSituation?.trendStrength ?? currentSituation?.macdStrength ?? null;
    const sent = currentSituation?.sentiment ?? currentSituation?.sentimentScore ?? null;
    const mom = currentSituation?.momentum ?? currentSituation?.rocValue ?? null;
    const vol = currentSituation?.volatility ?? currentSituation?.atrPercent ?? null;
    pssLog(`[PSS] 📈 現在状況: trend=${trend?.toFixed?.(1) || '-'}, sentiment=${sent?.toFixed?.(2) || '-'}, momentum=${mom?.toFixed?.(1) || '-'}, vol=${vol?.toFixed?.(6) || '-'}`);

    // 1. コンテキスト層別化
    pssLog('[PSS] 🔹 Step 1: コンテキスト層別化...');
    const contextResult = this.contextStratifier.stratify(patterns, currentSituation, timeframe);
    pssLog(`[PSS]   → コンテキスト: ${contextResult.contextName} | 一致: ${contextResult.stratified?.context?.count || 0}件 | ブースト: ${contextResult.contextBoost || 0}pt`);

    // 2. ボラティリティ層別化
    pssLog('[PSS] 🔹 Step 2: ボラティリティ層別化...');
    const volatilityResult = this.volatilityStratifier.stratify(
      patterns, currentSituation, timeframe, this.assetType
    );
    pssLog(`[PSS]   → ボラティリティ: ${volatilityResult.levelName} | 一致: ${volatilityResult.stratified?.exact?.count || 0}件 | ブースト: ${volatilityResult.volatilityBoost || 0}pt`);

    // 3. 連続パターン分析
    pssLog('[PSS] 🔹 Step 3: 連続パターン分析...');
    const sequentialResult = this.sequentialAnalyzer.analyzeSequential(
      patterns, currentSituation, timeframe
    );
    pssLog(`[PSS]   → 連続パターン: ${sequentialResult.hasSequential ? sequentialResult.currentSequence?.sequence : 'なし'} | ブースト: ${sequentialResult.currentSequence?.boost || 0}pt`);

    // 総合スコアを計算
    pssLog('[PSS] 🔹 Step 4: 総合スコア計算...');
    const stratifiedResult = this.calculateStratifiedScore(
      patterns, currentSituation, timeframe,
      contextResult, volatilityResult, sequentialResult
    );

    pssLog(`[PSS] ========== 層別化分析完了 ==========`);
    pssLog(`[PSS] 📊 元の予測: UP ${contextResult.stratified?.all?.upRate || '-'}% / DOWN ${contextResult.stratified?.all?.downRate || '-'}%`);
    pssLog(`[PSS] ✨ 層別化後: UP ${stratifiedResult.upRate}% / DOWN ${stratifiedResult.downRate}% (信頼度: ${stratifiedResult.confidence})`);
    pssLog(`[PSS] 📈 合計ブースト: コンテキスト${contextResult.contextBoost || 0}pt + ボラ${volatilityResult.volatilityBoost || 0}pt + 連続${sequentialResult.currentSequence?.boost || 0}pt`);

    return {
      hasEnoughData: true,
      // 層別化された上昇/下降率
      upRate: stratifiedResult.upRate,
      downRate: stratifiedResult.downRate,
      // 信頼度（層別化による精度向上の度合い）
      confidence: stratifiedResult.confidence,
      // 元の全パターン統計
      original: {
        upRate: contextResult.stratified.all.upRate,
        downRate: contextResult.stratified.all.downRate,
        count: patterns.length
      },
      // 層別化詳細
      context: contextResult,
      volatility: volatilityResult,
      sequential: sequentialResult,
      // UI表示用サマリー
      summary: this.generateSummary(contextResult, volatilityResult, sequentialResult, stratifiedResult)
    };
  }

  /**
   * 層別化スコアを計算
   */
  calculateStratifiedScore(patterns, currentSituation, timeframe, contextResult, volatilityResult, sequentialResult) {
    const resultKey = `result${timeframe}s`;

    // ベースの上昇/下降率（全パターン）
    let baseUpRate = contextResult.stratified.all.upRate;
    let baseDownRate = contextResult.stratified.all.downRate;

    // 層別化による調整
    let upBoost = 0;
    let downBoost = 0;
    let confidenceBoost = 0;

    // 1. コンテキスト層別化の影響（サンプル数が十分な場合）
    if (contextResult.hasEnoughContext) {
      const ctxUp = contextResult.stratified.context.upRate;
      const ctxDown = contextResult.stratified.context.downRate;
      const ctxDiff = ctxUp - ctxDown;
      const allDiff = baseUpRate - baseDownRate;

      // コンテキスト一致の方が偏りが大きい場合、その方向にブースト
      if (Math.abs(ctxDiff) > Math.abs(allDiff)) {
        if (ctxDiff > 0) {
          upBoost += Math.min(10, (ctxDiff - allDiff) / 2);
        } else {
          downBoost += Math.min(10, (allDiff - ctxDiff) / 2);
        }
        confidenceBoost += 10;
      }
    }

    // 2. ボラティリティ層別化の影響
    if (volatilityResult.hasEnoughVolMatch) {
      const volUp = volatilityResult.stratified.exact.upRate;
      const volDown = volatilityResult.stratified.exact.downRate;
      const volDiff = volUp - volDown;
      const baseDiff = baseUpRate - baseDownRate;

      if (Math.abs(volDiff) > Math.abs(baseDiff)) {
        if (volDiff > 0) {
          upBoost += Math.min(8, (volDiff - baseDiff) / 2);
        } else {
          downBoost += Math.min(8, (baseDiff - volDiff) / 2);
        }
        confidenceBoost += 8;
      }
    }

    // 3. 連続パターンの影響
    if (sequentialResult.hasSequential && sequentialResult.currentSequence) {
      const seqBoost = sequentialResult.currentSequence.boost || 0;
      if (sequentialResult.currentSequence.direction === 'UP') {
        upBoost += seqBoost;
      } else {
        downBoost += seqBoost;
      }
      confidenceBoost += 5;
    }

    // 最終スコアを計算（ブーストを適用）
    let finalUpRate = Math.min(100, Math.max(0, baseUpRate + upBoost - downBoost * 0.3));
    let finalDownRate = Math.min(100, Math.max(0, baseDownRate + downBoost - upBoost * 0.3));

    // 正規化（合計が100を超えないように）
    const total = finalUpRate + finalDownRate;
    if (total > 100) {
      const scale = 100 / total;
      finalUpRate *= scale;
      finalDownRate *= scale;
    }

    return {
      upRate: Math.round(finalUpRate),
      downRate: Math.round(finalDownRate),
      confidence: Math.min(100, 50 + confidenceBoost),
      boosts: {
        context: upBoost > downBoost ? upBoost : -downBoost,
        volatility: volatilityResult.volatilityBoost,
        sequential: sequentialResult.currentSequence?.boost || 0
      }
    };
  }

  /**
   * UI表示用のサマリーを生成
   */
  generateSummary(contextResult, volatilityResult, sequentialResult, stratifiedResult) {
    const insights = [];

    // コンテキスト分析の洞察
    if (contextResult.hasEnoughContext) {
      const ctxDiff = Math.abs(contextResult.stratified.context.upRate - contextResult.stratified.context.downRate);
      const allDiff = Math.abs(contextResult.stratified.all.upRate - contextResult.stratified.all.downRate);
      if (ctxDiff > allDiff + 5) {
        const direction = contextResult.stratified.context.upRate > contextResult.stratified.context.downRate ? '上昇' : '下降';
        insights.push({
          type: 'context',
          icon: '📊',
          text: `${contextResult.contextName}では${direction}傾向 (+${Math.round(ctxDiff - allDiff)}pt)`,
          impact: 'positive'
        });
      }
    }

    // ボラティリティ分析の洞察
    if (volatilityResult.hasEnoughVolMatch) {
      const volDiff = Math.abs(volatilityResult.stratified.exact.upRate - volatilityResult.stratified.exact.downRate);
      if (volDiff >= 15) {
        const direction = volatilityResult.stratified.exact.upRate > volatilityResult.stratified.exact.downRate ? '上昇' : '下降';
        insights.push({
          type: 'volatility',
          icon: '📈',
          text: `${volatilityResult.levelName}時は${direction}優位 (${Math.round(volDiff)}pt差)`,
          impact: 'positive'
        });
      }
    }

    // 連続パターン分析の洞察
    if (sequentialResult.hasSequential && sequentialResult.currentSequence) {
      const seq = sequentialResult.currentSequence;
      const direction = seq.direction === 'UP' ? '上昇' : '下降';
      insights.push({
        type: 'sequential',
        icon: '🔄',
        text: `連続パターンで${direction}確率上昇 (+${seq.boost}pt)`,
        impact: 'positive'
      });
    }

    // 精度向上の度合い
    const totalBoost = Math.abs(stratifiedResult.boosts.context || 0) +
                       Math.abs(stratifiedResult.boosts.volatility || 0) +
                       Math.abs(stratifiedResult.boosts.sequential || 0);

    return {
      insights,
      totalBoost: Math.round(totalBoost),
      hasSignificantInsight: insights.length > 0,
      confidenceLevel: totalBoost >= 15 ? 'high' : totalBoost >= 8 ? 'medium' : 'low'
    };
  }

  /**
   * パターン結果を履歴に記録（連続パターン分析用）
   * @param {Object} situation - 相場状況
   * @param {string} result - 結果
   */
  recordPatternResult(situation, result) {
    this.sequentialAnalyzer.recordPattern(situation, result);
  }
}

// グローバルに公開
window.PatternStratificationSystem = PatternStratificationSystem;
window.ContextStratifier = ContextStratifier;
window.VolatilityStratifier = VolatilityStratifier;
window.SequentialPatternAnalyzer = SequentialPatternAnalyzer;

pssLog('[PSS] Pattern Stratification System module loaded (v1.0.0)');
