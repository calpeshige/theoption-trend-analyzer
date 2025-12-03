/**
 * セグメント類似度計算システム
 * DetailedSegmentAnalyzerの結果を比較して類似度を算出
 */

// デバッグモード（本番ではfalse）
const SSC_DEBUG = false;
const sscLog = SSC_DEBUG ? console.log.bind(console) : () => {};

class SegmentSimilarityCalculator {
  constructor() {
    // 各特徴量の重み設定
    this.weights = {
      // 価格パターン比較の重み (合計100%)
      pricePattern: {
        direction: 30,        // トレンド方向の一致
        magnitude: 20,        // 変化量の類似度
        volatility: 15,       // ボラティリティの類似度
        range: 10,            // レンジの類似度
        upRatio: 10,          // 上昇比率の類似度
        patternType: 10,      // パターンタイプの一致
        peakTroughPos: 5      // ピーク/谷の位置類似度
      },

      // テクニカル指標比較の重み (合計100%)
      techIndicator: {
        direction: 40,        // トレンド方向の一致
        velocity: 30,         // 変化速度の類似度
        volatility: 20,       // ボラティリティの類似度
        range: 10             // レンジの類似度
      }
    };

    // 許容誤差の閾値
    this.thresholds = {
      magnitude: 0.5,         // 変化量の誤差許容: 0.5%
      volatility: 0.3,        // ボラティリティの誤差許容
      range: 0.5,             // レンジの誤差許容: 0.5%
      upRatio: 0.15,          // 上昇比率の誤差許容: 15%
      peakTroughPos: 0.2      // ピーク/谷位置の誤差許容: 20%
    };
  }

  /**
   * 価格パターンのセグメント類似度を計算（新システム統合版）
   * @param {Object} currentAnalysis - 現在の分析結果
   * @param {Object} historicalAnalysis - 過去の分析結果
   * @param {number} timeframe - 時間枠（秒）
   * @param {Object} context - コンテキスト情報（省略可）{ assetName }
   */
  comparePriceSegments(currentAnalysis, historicalAnalysis, timeframe = 60, context = {}) {
    if (!currentAnalysis || !historicalAnalysis) {
      return { similarity: 0, details: {} };
    }

    const currentSegments = currentAnalysis.segments;
    const historicalSegments = historicalAnalysis.segments;

    // セグメント数が一致しない場合は類似度0
    if (currentSegments.length !== historicalSegments.length) {
      console.warn('[SegmentSimilarity] セグメント数が不一致:',
        currentSegments.length, 'vs', historicalSegments.length);
      return { similarity: 0, details: {} };
    }

    // === 新システム: EnhancedSegmentScoring ===
    const globalScope = typeof window !== 'undefined' ? window : self;
    const enhancedScoring = new globalScope.EnhancedSegmentScoring();

    // コンテキストに時間枠を追加
    const shapeContext = {
      assetName: context.assetName || null,
      timeframe: timeframe,
      baseMagnitude: enhancedScoring.getBaseMagnitude({ assetName: context.assetName, timeframe })
    };
    const patternEvaluator = new globalScope.MatchPatternEvaluator();

    // 1. 各セグメントのスコアと一致リストを取得
    const segmentScores = [];
    const matches = []; // 一致したセグメントのインデックス

    for (let i = 0; i < currentSegments.length; i++) {
      const score = enhancedScoring.scoreSegment(
        currentSegments[i],
        historicalSegments[i],
        i,
        shapeContext  // コンテキストを渡す
      );
      segmentScores.push(score);

      // v2.4: 一致判定の閾値を調整
      // matchLevel >= 0.3 を「一致」とカウント
      // 乗算式(shape*mag*slope)により、全ての要素が約0.67以上で一致と判定
      // 例: 0.7 * 0.7 * 0.7 = 0.343 → 一致
      //     0.6 * 0.6 * 0.6 = 0.216 → 不一致
      if (score.matchLevel >= 0.3) {
        matches.push(i);
      }
    }

    // 2. 一致パターンを評価
    const patternEval = patternEvaluator.evaluate(matches, timeframe);

    // 3. 総合スコア計算（アクティビティフィルター付き、時間枠考慮）
    const result = enhancedScoring.calculateTotalScore(currentSegments, historicalSegments, timeframe, shapeContext);

    // === 低ボラティリティパターンの除外 ===
    if (result.lowVolatility) {
      // 🔬 診断用：低ボラティリティフィルターの影響を確認（サンプリング）
      if (Math.random() < 0.01) {
        console.log(`[🔬 低ボラティリティ除外] ${result.reason}`);
      }
      return {
        similarity: 0,
        enhancedScore: 0,
        patternScore: 0,
        patternHashMatch: false,
        segmentScores: [],
        matches: [],
        patternType: 'LOW_VOLATILITY',
        lowVolatility: true,
        activeSegments: result.activeSegments,
        activeRatio: result.activeRatio,
        reason: result.reason,
        details: {
          recency: 0,
          continuity: 0,
          coverage: 0,
          matchLevels: []
        }
      };
    }

    // === v2.5: 類似度計算の根本的な再設計 ===
    //
    // 問題: これまでの計算は複雑すぎて、99%が頻発する原因が特定しにくかった
    // 解決: matchLevel（乗算式で計算済み）を直接使用し、シンプルな加重平均に
    //
    // matchLevel = shape * mag * slope の乗算式（v2.4で導入）
    // これをセグメント重み[1,4,16]で加重平均すれば、直感的な類似度になる

    const segmentWeights = [1, 4, 16];
    const totalWeight = 21; // 1+4+16

    // 各セグメントのmatchLevelを加重平均
    let weightedMatchLevel = 0;
    for (let i = 0; i < segmentScores.length; i++) {
      weightedMatchLevel += segmentScores[i].matchLevel * (segmentWeights[i] / totalWeight);
    }

    // patternEvalは一致パターンの質を評価（連続性、直近性など）
    // これを0.5〜1.0の範囲の係数として使用
    const patternMultiplier = 0.5 + (patternEval.score / 100) * 0.5;

    // 最終スコア = 加重matchLevel × パターン係数
    let finalScore = weightedMatchLevel * patternMultiplier;

    // v2.5: 診断ログ（高スコア時のみ）
    if (finalScore >= 0.9 && Math.random() < 0.1) {
      console.log(`[v2.5診断] finalScore=${(finalScore*100).toFixed(1)}% = weightedML(${(weightedMatchLevel*100).toFixed(1)}%) × patternMult(${patternMultiplier.toFixed(2)}) | matchLevels=[${segmentScores.map(s => s.matchLevel.toFixed(2)).join(',')}]`);
    }

    // v2.3: デバッグログを削減（問題解決済み）
    // 高類似度（95%以上）のみログ出力
    if (finalScore >= 0.95) {
      console.log(`[🔍 高類似度] ${(finalScore * 100).toFixed(1)}% | hash=${currentAnalysis.shapeHash}`);
    }

    // === 診断情報の準備 ===
    const isHashMatch = currentAnalysis.shapeHash === historicalAnalysis.shapeHash;

    return {
      similarity: finalScore,
      enhancedScore: result.percentage,
      patternScore: patternEval.score,
      patternHashMatch: currentAnalysis.shapeHash === historicalAnalysis.shapeHash,
      segmentScores: segmentScores,
      matches: matches,
      patternType: patternEval.pattern,
      lowVolatility: false,
      activeSegments: result.activeSegments,
      activeRatio: result.activeRatio,
      details: {
        recency: patternEval.recency,
        continuity: patternEval.continuity,
        coverage: patternEval.coverage,
        matchLevels: segmentScores.map(s => s.matchLevelName)
      }
    };
  }

  /**
   * 類似度計算（comparePriceSegmentsのエイリアス）
   * machine-learning-system.jsとの互換性のため
   */
  calculateSimilarity(currentSituation, historicalSituation, timeframe = 15) {
    // currentSituationとhistoricalSituationから必要なデータを抽出
    const currentAnalysis = currentSituation[`priceSegments${timeframe}s`];
    const historicalAnalysis = historicalSituation[`priceSegments${timeframe}s`];

    // v2.3: デバッグログを削減（問題解決済み）
    if (!currentAnalysis || !historicalAnalysis) {
      return 0;
    }

    // コンテキストを構築（assetNameを取得）
    // currentSituationとhistoricalSituationの両方からassetNameを取得を試みる
    const assetName = currentSituation.assetName || historicalSituation.assetName || null;
    const context = { assetName };

    // comparePriceSegmentsを呼び出し（コンテキスト付き）
    const result = this.comparePriceSegments(currentAnalysis, historicalAnalysis, timeframe, context);

    // 🔬 診断用：リアルタイム計算で70%以上の場合のみログ出力
    const finalScore = result.similarity * 100;
    if (finalScore >= 70) {
      sscLog(`[🔬 リアルタイム高スコア] 最終=${Math.round(finalScore)}%, current=${currentAnalysis.pattern}, historical=${historicalAnalysis.pattern}`);
    }

    // similarityの値をパーセンテージで返す（0-100）
    return finalScore;
  }

  /**
   * 個別セグメントの価格パターン比較
   */
  comparePriceSegment(current, historical) {
    const w = this.weights.pricePattern;

    // 1. トレンド方向の一致 (30%)
    const directionScore = this.compareDirection(current.direction, historical.direction);

    // 2. 変化量の類似度 (20%)
    const magnitudeScore = this.compareMagnitude(current.magnitude, historical.magnitude);

    // 3. ボラティリティの類似度 (15%)
    const volatilityScore = this.compareVolatility(current.volatility, historical.volatility, current.avgPrice);

    // 4. レンジの類似度 (10%)
    const rangeScore = this.compareRange(current.rangePercent, historical.rangePercent);

    // 5. 上昇比率の類似度 (10%)
    const upRatioScore = this.compareUpRatio(current.upRatio, historical.upRatio);

    // 6. パターンタイプの一致 (10%)
    const patternTypeScore = this.comparePatternType(current.patternType, historical.patternType);

    // 7. ピーク/谷の位置類似度 (5%)
    const peakTroughScore = this.comparePeakTroughPosition(
      current.peakPosition, historical.peakPosition,
      current.troughPosition, historical.troughPosition
    );

    // 重み付け合計
    const totalScore = (
      (directionScore * w.direction) +
      (magnitudeScore * w.magnitude) +
      (volatilityScore * w.volatility) +
      (rangeScore * w.range) +
      (upRatioScore * w.upRatio) +
      (patternTypeScore * w.patternType) +
      (peakTroughScore * w.peakTroughPos)
    ) / 100;

    return {
      totalScore: totalScore,
      directionScore: directionScore,
      magnitudeScore: magnitudeScore,
      volatilityScore: volatilityScore,
      rangeScore: rangeScore,
      upRatioScore: upRatioScore,
      patternTypeScore: patternTypeScore,
      peakTroughScore: peakTroughScore
    };
  }

  /**
   * テクニカル指標のセグメント類似度を計算
   */
  compareTechSegments(currentAnalysis, historicalAnalysis) {
    if (!currentAnalysis || !historicalAnalysis) {
      return { similarity: 0, details: {} };
    }

    const currentSegments = currentAnalysis.segments;
    const historicalSegments = historicalAnalysis.segments;

    if (currentSegments.length !== historicalSegments.length) {
      return { similarity: 0, details: {} };
    }

    const segmentScores = [];
    for (let i = 0; i < currentSegments.length; i++) {
      const score = this.compareTechSegment(currentSegments[i], historicalSegments[i]);
      segmentScores.push(score);
    }

    const avgScore = segmentScores.reduce((sum, s) => sum + s.totalScore, 0) / segmentScores.length;

    return {
      similarity: avgScore,
      segmentScores: segmentScores,
      details: {
        avgDirection: segmentScores.reduce((sum, s) => sum + s.directionScore, 0) / segmentScores.length,
        avgVelocity: segmentScores.reduce((sum, s) => sum + s.velocityScore, 0) / segmentScores.length,
        avgVolatility: segmentScores.reduce((sum, s) => sum + s.volatilityScore, 0) / segmentScores.length,
        avgRange: segmentScores.reduce((sum, s) => sum + s.rangeScore, 0) / segmentScores.length
      }
    };
  }

  /**
   * 個別セグメントのテクニカル指標比較
   */
  compareTechSegment(current, historical) {
    const w = this.weights.techIndicator;

    // 1. トレンド方向の一致 (40%)
    const directionScore = this.compareDirection(current.direction, historical.direction);

    // 2. 変化速度の類似度 (30%)
    const velocityScore = this.compareMagnitude(Math.abs(current.slope), Math.abs(historical.slope));

    // 3. ボラティリティの類似度 (20%)
    const volatilityScore = this.compareVolatility(current.volatility, historical.volatility, current.avgValue);

    // 4. レンジの類似度 (10%)
    const rangeScore = this.compareNumericValue(current.range, historical.range, 0.5);

    const totalScore = (
      (directionScore * w.direction) +
      (velocityScore * w.velocity) +
      (volatilityScore * w.volatility) +
      (rangeScore * w.range)
    ) / 100;

    return {
      totalScore: totalScore,
      directionScore: directionScore,
      velocityScore: velocityScore,
      volatilityScore: volatilityScore,
      rangeScore: rangeScore
    };
  }

  /**
   * トレンド方向の比較
   */
  compareDirection(dir1, dir2) {
    if (dir1 === dir2) {
      // 完全一致
      if (dir1 === 'FLAT') {
        return 0.05; // FLAT同士は5%のみ (NEUTRAL減点)
      }
      return 1.0; // UP⇄UP, DOWN⇄DOWNは100%
    }

    // 方向不一致
    if (dir1 === 'FLAT' || dir2 === 'FLAT') {
      return 0.0; // FLAT⇄UP/DOWNは0%
    }

    return 0.0; // UP⇄DOWNも0%
  }

  /**
   * 変化量の類似度 (magnitude, velocity用)
   */
  compareMagnitude(val1, val2) {
    const diff = Math.abs(val1 - val2);
    const threshold = this.thresholds.magnitude;

    if (diff <= threshold * 0.2) {
      return 1.0; // 誤差20%以内: 100%
    } else if (diff <= threshold * 0.5) {
      return 0.8; // 誤差50%以内: 80%
    } else if (diff <= threshold) {
      return 0.5; // 誤差100%以内: 50%
    } else if (diff <= threshold * 2) {
      return 0.2; // 誤差200%以内: 20%
    }

    return 0.0; // それ以上: 0%
  }

  /**
   * ボラティリティの類似度
   */
  compareVolatility(vol1, vol2, avgValue) {
    const relVol1 = avgValue !== 0 ? vol1 / avgValue : 0;
    const relVol2 = avgValue !== 0 ? vol2 / avgValue : 0;

    const diff = Math.abs(relVol1 - relVol2);
    const threshold = this.thresholds.volatility;

    if (diff <= threshold * 0.2) {
      return 1.0;
    } else if (diff <= threshold * 0.5) {
      return 0.8;
    } else if (diff <= threshold) {
      return 0.5;
    } else if (diff <= threshold * 2) {
      return 0.2;
    }

    return 0.0;
  }

  /**
   * レンジの類似度
   */
  compareRange(range1, range2) {
    const diff = Math.abs(range1 - range2);
    const threshold = this.thresholds.range;

    if (diff <= threshold * 0.2) {
      return 1.0;
    } else if (diff <= threshold * 0.5) {
      return 0.8;
    } else if (diff <= threshold) {
      return 0.5;
    } else if (diff <= threshold * 2) {
      return 0.2;
    }

    return 0.0;
  }

  /**
   * 上昇比率の類似度
   */
  compareUpRatio(ratio1, ratio2) {
    const diff = Math.abs(ratio1 - ratio2);
    const threshold = this.thresholds.upRatio;

    if (diff <= threshold * 0.2) {
      return 1.0;
    } else if (diff <= threshold * 0.5) {
      return 0.8;
    } else if (diff <= threshold) {
      return 0.5;
    } else if (diff <= threshold * 2) {
      return 0.2;
    }

    return 0.0;
  }

  /**
   * パターンタイプの一致度
   */
  comparePatternType(type1, type2) {
    if (type1 === type2) {
      // RANGE/COMPLEXは低スコア
      if (type1 === 'RANGE' || type1 === 'COMPLEX') {
        return 0.3; // 30%
      }
      return 1.0; // 100%
    }

    // 類似パターン
    if ((type1 === 'UPTREND' && type2 === 'V_SHAPE') ||
      (type1 === 'V_SHAPE' && type2 === 'UPTREND')) {
      return 0.5; // 50%
    }

    if ((type1 === 'DOWNTREND' && type2 === 'INVERTED_V_SHAPE') ||
      (type1 === 'INVERTED_V_SHAPE' && type2 === 'DOWNTREND')) {
      return 0.5; // 50%
    }

    return 0.0; // 不一致
  }

  /**
   * ピーク/谷の位置類似度
   */
  comparePeakTroughPosition(peak1, peak2, trough1, trough2) {
    const peakDiff = Math.abs(peak1 - peak2);
    const troughDiff = Math.abs(trough1 - trough2);
    const avgDiff = (peakDiff + troughDiff) / 2;
    const threshold = this.thresholds.peakTroughPos;

    if (avgDiff <= threshold * 0.2) {
      return 1.0;
    } else if (avgDiff <= threshold * 0.5) {
      return 0.8;
    } else if (avgDiff <= threshold) {
      return 0.5;
    } else if (avgDiff <= threshold * 2) {
      return 0.2;
    }

    return 0.0;
  }

  /**
   * 数値の類似度 (汎用)
   */
  compareNumericValue(val1, val2, threshold) {
    const diff = Math.abs(val1 - val2);

    if (diff <= threshold * 0.2) {
      return 1.0;
    } else if (diff <= threshold * 0.5) {
      return 0.8;
    } else if (diff <= threshold) {
      return 0.5;
    } else if (diff <= threshold * 2) {
      return 0.2;
    }

    return 0.0;
  }

  /**
   * パターン要約の類似度
   */
  compareSummary(summary1, summary2) {
    if (!summary1 || !summary2) return 0;

    // 各要素の類似度
    const upRatioScore = this.compareUpRatio(summary1.upRatio, summary2.upRatio);
    const downRatioScore = this.compareUpRatio(summary1.downRatio, summary2.downRatio);
    const magnitudeScore = this.compareMagnitude(summary1.avgMagnitude, summary2.avgMagnitude);
    const volatilityScore = this.compareVolatility(summary1.avgVolatility, summary2.avgVolatility, 1);
    const patternScore = this.comparePatternType(summary1.dominantPattern, summary2.dominantPattern);

    return (upRatioScore + downRatioScore + magnitudeScore + volatilityScore + patternScore) / 5;
  }

  /**
   * 詳細なデバッグ情報を生成
   */
  generateDebugInfo(currentAnalysis, historicalAnalysis, comparisonResult) {
    const debugInfo = {
      segmentCount: currentAnalysis.segments.length,
      patternHash: {
        current: currentAnalysis.shapeHash,
        historical: historicalAnalysis.shapeHash,
        match: currentAnalysis.shapeHash === historicalAnalysis.shapeHash
      },
      overallSimilarity: `${(comparisonResult.similarity * 100).toFixed(1)}%`,
      segmentDetails: []
    };

    for (let i = 0; i < currentAnalysis.segments.length; i++) {
      const curr = currentAnalysis.segments[i];
      const hist = historicalAnalysis.segments[i];
      const score = comparisonResult.segmentScores[i];

      debugInfo.segmentDetails.push({
        segmentIndex: i,
        similarity: `${(score.totalScore * 100).toFixed(1)}%`,
        current: {
          direction: curr.direction,
          magnitude: curr.magnitude?.toFixed(3),
          patternType: curr.patternType
        },
        historical: {
          direction: hist.direction,
          magnitude: hist.magnitude?.toFixed(3),
          patternType: hist.patternType
        },
        scores: {
          direction: `${(score.directionScore * 100).toFixed(0)}%`,
          magnitude: `${(score.magnitudeScore * 100).toFixed(0)}%`,
          volatility: `${(score.volatilityScore * 100).toFixed(0)}%`,
          patternType: `${(score.patternTypeScore * 100).toFixed(0)}%`
        }
      });
    }

    return debugInfo;
  }
}

// グローバルスコープに公開
// グローバルスコープに公開
(typeof window !== 'undefined' ? window : self).SegmentSimilarityCalculator = SegmentSimilarityCalculator;

// === グローバル統計情報（インスタンス間で共有）===
// EnhancedSegmentScoringのインスタンスが毎回newされても統計が保持される
// 注意: globalScopeはcomparePriceSegments内でも宣言されているため、
// ここでは別名（_globalScopeForStats）を使用
const _globalScopeForStats = typeof window !== 'undefined' ? window : self;
if (!_globalScopeForStats._enhancedScoringGlobalStats) {
  _globalScopeForStats._enhancedScoringGlobalStats = {
    magnitudeStats: {},
    initialized: false
  };
}

/**
 * 強化されたセグメントスコアリングシステム
 * 多次元一致評価（方向+変化量+傾き）とセグメント位置の重み付け
 *
 * v2.1: 統計情報のグローバル共有
 * - インスタンス間で統計を共有
 * - 実際のデータから学習した基準値を使用
 * - 同じ形状カテゴリでもmagnitude/slopeの連続値で差別化
 */
class EnhancedSegmentScoring {
  constructor() {
    // セグメント位置の指数重み（全時間枠3セグメント統一）
    this.segmentWeights = [1, 4, 16];

    // 一致レベルの定義
    this.matchLevels = {
      PERFECT: 1.0,    // 方向+変化量+傾き+形状 全て一致
      HIGH: 0.7,       // 方向+変化量 一致
      MEDIUM: 0.4,     // 方向のみ 一致
      LOW: 0.2,        // 片方FLAT等の部分一致
      NONE: 0.0,       // 方向不一致（FLAT含む）
      OPPOSITE: -0.3   // 反対方向（UP⇄DOWN）ペナルティ
    };

    // パターンタイプボーナス（一致時のみ適用）
    this.patternBonus = {
      UPTREND: 1.2,
      DOWNTREND: 1.2,
      V_SHAPE: 1.15,
      INVERTED_V_SHAPE: 1.15,
      RANGE: 1.05,
      COMPLEX: 1.0
    };

    // 一致判定の閾値（厳格化: 100%類似度が多すぎる問題対策）
    this.thresholds = {
      magnitude: 0.15,   // 変化量の許容誤差: 0.15% (0.3%→0.15%に厳格化)
      slope: 0.1         // 傾きの許容誤差: 0.1 (0.2→0.1に厳格化)
    };

    // アクティブセグメント判定の閾値
    this.activityThresholds = {
      minMagnitude: 0.05,        // 最小変化量: 0.05%
      minActiveSegments: 3,      // 最低限必要なアクティブセグメント数 (50%) - デフォルト値
      minActiveRatio: 0.5        // 最低限必要なアクティブ比率 (50%)
    };

    // === コンテキスト対応: 通貨ペア別・時間枠別の基準値 ===
    // v2.1修正: 実際のデータに基づいた現実的なデフォルト値
    // USD/JPY 30秒の実測値: 平均 0.003〜0.008%
    this.defaultMagnitudeByAssetType = {
      FOREX_MAJOR: 0.008,    // USD/JPY, EUR/USD 等（実測値ベース）
      FOREX_CROSS: 0.012,    // EUR/JPY, GBP/JPY 等
      CRYPTO: 0.3,           // BTC, ETH 等
      DEFAULT: 0.01
    };

    // 時間枠別の倍率（短い時間枠ほど変動は小さい）
    this.timeframeMagnitudeMultiplier = {
      15: 0.6,    // 15秒: 基準の60%
      30: 0.8,    // 30秒: 基準の80%
      60: 1.0,    // 60秒: 基準（1倍）
      180: 1.8,   // 3分: 基準の180%
      300: 2.5    // 5分: 基準の250%
    };

    // 動的に学習される統計情報（グローバル共有）
    // インスタンス間で共有することで、統計が毎回リセットされない
    const gs = typeof window !== 'undefined' ? window : self;
    this.magnitudeStats = gs._enhancedScoringGlobalStats.magnitudeStats;

    // 仮想通貨プレフィックス
    this.cryptoPrefixes = ['BTC', 'ETH', 'LTC', 'XRP', 'BCH', 'ADA', 'DOT', 'DOGE'];
  }

  /**
   * 通貨ペアの種類を判定
   */
  getAssetType(assetName) {
    if (!assetName) return 'DEFAULT';

    // 仮想通貨判定
    if (this.cryptoPrefixes.some(prefix => assetName.startsWith(prefix))) {
      return 'CRYPTO';
    }

    // メジャー通貨ペア判定
    const majorPairs = ['USD/JPY', 'EUR/USD', 'GBP/USD', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD'];
    if (majorPairs.includes(assetName)) {
      return 'FOREX_MAJOR';
    }

    // クロス通貨ペア
    return 'FOREX_CROSS';
  }

  /**
   * コンテキストに基づく基準magnitudeを取得
   */
  getBaseMagnitude(context = {}) {
    const { assetName, timeframe = 60 } = context;

    // 動的統計があればそれを使用
    const statsKey = `${assetName || 'default'}_${timeframe}`;
    if (this.magnitudeStats[statsKey] && this.magnitudeStats[statsKey].count >= 100) {
      return this.magnitudeStats[statsKey].avgMagnitude;
    }

    // デフォルト値を計算
    const assetType = this.getAssetType(assetName);
    const baseMag = this.defaultMagnitudeByAssetType[assetType] || this.defaultMagnitudeByAssetType.DEFAULT;
    const timeframeMult = this.timeframeMagnitudeMultiplier[timeframe] || 1.0;

    return baseMag * timeframeMult;
  }

  /**
   * 統計情報を更新（学習データから呼び出される）
   */
  updateMagnitudeStats(assetName, timeframe, magnitude) {
    const statsKey = `${assetName || 'default'}_${timeframe}`;

    if (!this.magnitudeStats[statsKey]) {
      this.magnitudeStats[statsKey] = {
        sum: 0,
        sumSquared: 0,
        count: 0,
        avgMagnitude: this.getBaseMagnitude({ assetName, timeframe }),
        stdMagnitude: 0
      };
    }

    const stats = this.magnitudeStats[statsKey];
    stats.sum += Math.abs(magnitude);
    stats.sumSquared += magnitude * magnitude;
    stats.count++;

    // 平均と標準偏差を更新
    stats.avgMagnitude = stats.sum / stats.count;
    if (stats.count > 1) {
      const variance = (stats.sumSquared / stats.count) - (stats.avgMagnitude * stats.avgMagnitude);
      stats.stdMagnitude = Math.sqrt(Math.max(0, variance));
    }
  }

  /**
   * バッチで統計情報を初期化（データロード時に呼び出し）
   */
  initializeStatsFromData(trainingData, assetName, timeframe) {
    const statsKey = `${assetName || 'default'}_${timeframe}`;
    const segmentKey = `priceSegments${timeframe}s`;

    // 既に十分な統計があればスキップ
    if (this.magnitudeStats[statsKey] && this.magnitudeStats[statsKey].count >= 500) {
      return;
    }

    let sum = 0;
    let sumSquared = 0;
    let count = 0;

    for (const data of trainingData) {
      if (data.assetName !== assetName) continue;

      const segments = data[segmentKey];
      if (!segments || !segments.segments) continue;

      for (const seg of segments.segments) {
        if (seg.direction !== 'FLAT') {
          const mag = Math.abs(seg.magnitude);
          sum += mag;
          sumSquared += mag * mag;
          count++;
        }
      }
    }

    if (count > 0) {
      const avgMag = sum / count;
      const variance = (sumSquared / count) - (avgMag * avgMag);
      const stdMag = Math.sqrt(Math.max(0, variance));

      this.magnitudeStats[statsKey] = {
        sum, sumSquared, count,
        avgMagnitude: avgMag,
        stdMagnitude: stdMag
      };

      console.log(`[EnhancedScoring] 📊 統計初期化: ${statsKey} - 平均magnitude=${avgMag.toFixed(4)}%, 標準偏差=${stdMag.toFixed(4)}%, サンプル数=${count}`);
    }
  }

  /**
   * 最小アクティブセグメント数を取得（全時間枠統一: 1/3 = 33%）
   */
  getMinActiveSegments(timeframe) {
    return 1;
  }

  /**
   * セグメント重みを取得（全時間枠統一）
   */
  getSegmentWeights(timeframe) {
    return this.segmentWeights;
  }

  /**
   * セグメント数を取得（全時間枠統一）
   */
  getSegmentCount(timeframe) {
    return 3;
  }

  /**
   * セグメント単体のスコアを計算
   * @param {Object} currentSeg - 現在のセグメント
   * @param {Object} historicalSeg - 過去のセグメント
   * @param {number} segmentIndex - セグメントインデックス
   * @param {Object} context - コンテキスト（assetName, timeframe, baseMagnitude）
   */
  scoreSegment(currentSeg, historicalSeg, segmentIndex, context = {}) {
    // 1. 基本重み
    const baseWeight = this.segmentWeights[segmentIndex];

    // 2. 一致レベルを判定（コンテキスト付き）
    const matchLevel = this.determineMatchLevel(currentSeg, historicalSeg, context);

    // 3. パターンボーナス（一致時のみ）
    let patternMult = 1.0;
    if (currentSeg.patternType === historicalSeg.patternType) {
      patternMult = this.patternBonus[currentSeg.patternType] || 1.0;
    }

    // 4. 最終スコア
    const score = baseWeight * matchLevel * patternMult;

    return {
      score: score,
      baseWeight: baseWeight,
      matchLevel: matchLevel,
      matchLevelName: this.getMatchLevelName(matchLevel),
      patternMult: patternMult,
      details: {
        direction: currentSeg.direction === historicalSeg.direction,
        magnitudeMatch: this.isMagnitudeMatch(currentSeg, historicalSeg),
        slopeMatch: this.isSlopeMatch(currentSeg, historicalSeg),
        patternMatch: currentSeg.patternType === historicalSeg.patternType
      }
    };
  }

  /**
   * 一致レベルを判定（案B改良: 形状分析を基本スコアに統合）
   *
   * 100%類似度の多発問題を解決：
   * - 同じshapeHash（DDU等）でも、内部形状（STEADY vs ACCELERATING等）の違いで差をつける
   * - magnitude/slopeの連続的評価で、段階的なスコア差を生成
   *
   * @param {Object} current - 現在のセグメント
   * @param {Object} historical - 過去のセグメント
   * @param {Object} context - コンテキスト（assetName, timeframe, baseMagnitude）
   */
  determineMatchLevel(current, historical, context = {}) {
    // === 反対方向の検出（UP⇄DOWN）===
    const isOpposite = (current.direction === 'UP' && historical.direction === 'DOWN') ||
                       (current.direction === 'DOWN' && historical.direction === 'UP');
    if (isOpposite) {
      // 変化量が大きいほどペナルティを強化
      const avgMagnitude = (Math.abs(current.magnitude) + Math.abs(historical.magnitude)) / 2;
      const magnitudePenalty = Math.min(avgMagnitude * 0.5, 0.2); // 最大0.2追加ペナルティ
      return this.matchLevels.OPPOSITE - magnitudePenalty;
    }

    // === 方向一致チェック ===
    const dirMatch = current.direction === historical.direction;

    // 方向不一致の場合の処理（改善版）
    if (!dirMatch) {
      // 片方がFLATの場合は部分的なスコアを与える
      // FLATは「動きがない」状態なので、完全な不一致ではない
      const currentFlat = current.direction === 'FLAT';
      const historicalFlat = historical.direction === 'FLAT';

      if (currentFlat || historicalFlat) {
        // FLATと他方向の不一致: LOW * 0.5 程度（20%程度のスコア）
        // 変化量が小さければより高いスコア
        const nonFlatMag = currentFlat ? historical.magnitude : current.magnitude;
        const magPenalty = Math.min(Math.abs(nonFlatMag) * 0.3, 0.3);
        return this.matchLevels.LOW * (0.5 - magPenalty);
      }
      // UP vs DOWN の完全不一致
      return this.matchLevels.NONE;
    }

    // FLAT同士の場合（改善版）
    // 低ボラティリティ環境同士は有効な類似パターンとして認識
    if (current.direction === 'FLAT' && historical.direction === 'FLAT') {
      // FLATの変化量（magnitude）が近い場合はより高いスコア
      const flatMagSim = this.calculateMagnitudeSimilarity(current, historical);
      // MEDIUM * 0.6 〜 MEDIUM * 0.9 (40%〜60%程度のスコア)
      return this.matchLevels.MEDIUM * (0.6 + flatMagSim * 0.3);
    }

    // === 形状分析を基本スコアに統合（案1+3の核心） ===
    // セグメント内の「どのように」動いたかを評価（コンテキスト対応）
    const currentShape = this.estimateSegmentShape(current, context);
    const historicalShape = this.estimateSegmentShape(historical, context);
    const shapeSimilarity = this.compareShapes(currentShape, historicalShape);

    // === 変化量の連続的類似度（段階的評価） ===
    const magSimilarity = this.calculateMagnitudeSimilarity(current, historical);

    // === 傾きの連続的類似度 ===
    const slopeSimilarity = this.calculateSlopeSimilarity(current, historical);

    // === 統合スコア計算（v2.4: 厳格化） ===
    // 形状・変化量・傾きの全てが高い場合のみ高スコア
    // 乗算式により、どれか一つでも低ければスコアが大きく下がる

    // v2.4: 加算式から乗算式に変更
    // 以前: combinedSimilarity = shape*0.4 + mag*0.35 + slope*0.25 (0.4〜1.0の範囲で高スコア多発)
    // 現在: combinedSimilarity = shape * mag * slope (全て高くないと高スコアにならない)
    const combinedSimilarity = shapeSimilarity * magSimilarity * slopeSimilarity;

    // スコアレベルを連続的に計算
    // combinedSimilarity: 0.0 〜 1.0
    // 出力: 0.0 〜 PERFECT(1.0) の範囲
    // v2.4: 最低保証を撤廃し、純粋な乗算結果を使用
    const baseScore = this.matchLevels.PERFECT * combinedSimilarity;

    return baseScore;
  }

  /**
   * 傾き（slope）の連続的類似度を計算
   * v2.5: より厳格な評価に変更
   */
  calculateSlopeSimilarity(current, historical) {
    const curSlope = current.slope || 0;
    const histSlope = historical.slope || 0;
    const diff = Math.abs(curSlope - histSlope);

    // v2.5: 絶対値ベースの閾値を使用（相対値だと小さい値同士で高スコアになりすぎる）
    // FX 30秒足での典型的なslope範囲: -0.01 〜 +0.01
    const threshold = 0.002; // この差以下で完全一致とみなす
    const maxDiff = 0.01;    // この差以上で類似度0

    if (diff <= threshold) {
      return 1.0 - (diff / threshold) * 0.2; // 0.8〜1.0
    }
    if (diff >= maxDiff) {
      return 0.0;
    }
    // threshold〜maxDiff間は線形減衰
    return 0.8 * (1 - (diff - threshold) / (maxDiff - threshold));
  }

  /**
   * 変化量の類似度を0-1で返す
   * v2.5: より厳格な評価に変更
   */
  calculateMagnitudeSimilarity(current, historical) {
    const curMag = current.magnitude || 0;
    const histMag = historical.magnitude || 0;
    const diff = Math.abs(curMag - histMag);

    // v2.5: 絶対値ベースの閾値を使用
    // FX 30秒足での典型的なmagnitude範囲: -0.05 〜 +0.05 (%)
    const threshold = 0.005; // この差以下で完全一致とみなす
    const maxDiff = 0.03;    // この差以上で類似度0

    if (diff <= threshold) {
      return 1.0 - (diff / threshold) * 0.2; // 0.8〜1.0
    }
    if (diff >= maxDiff) {
      return 0.0;
    }
    // threshold〜maxDiff間は線形減衰
    return 0.8 * (1 - (diff - threshold) / (maxDiff - threshold));
  }

  /**
   * 一致レベル名を取得
   */
  getMatchLevelName(level) {
    if (level >= this.matchLevels.PERFECT * 0.9) return 'PERFECT';
    if (level >= this.matchLevels.HIGH * 0.9) return 'HIGH';
    if (level >= this.matchLevels.MEDIUM * 0.9) return 'MEDIUM';
    if (level >= this.matchLevels.LOW * 0.9) return 'LOW';
    if (level < 0) return 'OPPOSITE';
    return 'NONE';
  }

  /**
   * 変化量が一致しているか
   */
  isMagnitudeMatch(current, historical) {
    const diff = Math.abs(current.magnitude - historical.magnitude);
    return diff <= this.thresholds.magnitude;
  }

  /**
   * 傾きが一致しているか
   */
  isSlopeMatch(current, historical) {
    const diff = Math.abs(current.slope - historical.slope);
    return diff <= this.thresholds.slope;
  }

  /**
   * セグメントがアクティブ（動きがある）か判定
   */
  isActiveSegment(segment) {
    // UP または DOWN の場合はアクティブ
    if (segment.direction === 'UP' || segment.direction === 'DOWN') {
      return true;
    }

    // FLAT でも変化量が閾値を超えていればアクティブとみなす
    return segment.magnitude >= this.activityThresholds.minMagnitude;
  }

  /**
   * 文脈付きFLAT評価
   * FLATの前後のセグメント方向を考慮して意味のあるFLATかを評価
   *
   * パターン例（3セグメント: [0][1][2]）:
   * - UP → FLAT → UP: 継続型（押し目待ち） → 高スコア
   * - DOWN → FLAT → DOWN: 継続型（戻り待ち） → 高スコア
   * - UP → FLAT → DOWN: 反転型（天井圏） → 高スコア
   * - DOWN → FLAT → UP: 反転型（底値圏） → 高スコア
   * - FLAT → FLAT → FLAT: 無方向 → 低スコア
   */
  evaluateFlatContext(currentSegs, historicalSegs) {
    // 各セグメントの方向を取得
    const currentDirs = currentSegs.map(s => s.direction);
    const histDirs = historicalSegs.map(s => s.direction);

    // FLATの位置と文脈を分析
    let contextBonus = 0;

    for (let i = 0; i < 3; i++) {
      // 両方がFLATの場合のみ文脈評価
      if (currentDirs[i] === 'FLAT' && histDirs[i] === 'FLAT') {
        const currentContext = this.getFlatContext(currentDirs, i);
        const histContext = this.getFlatContext(histDirs, i);

        // 文脈が同じ場合にボーナス
        if (currentContext === histContext && currentContext !== 'ISOLATED') {
          // 文脈タイプに応じたボーナス
          const bonusMap = {
            'CONTINUATION_UP': 0.5,    // UP→FLAT→UP
            'CONTINUATION_DOWN': 0.5,  // DOWN→FLAT→DOWN
            'REVERSAL_TOP': 0.4,       // UP→FLAT→DOWN
            'REVERSAL_BOTTOM': 0.4,    // DOWN→FLAT→UP
            'CONSOLIDATION': 0.2       // その他の意味のあるパターン
          };
          contextBonus += bonusMap[currentContext] || 0;
        }
      }
    }

    return contextBonus;
  }

  /**
   * FLATセグメントの文脈タイプを判定
   */
  getFlatContext(directions, flatIndex) {
    const prev = flatIndex > 0 ? directions[flatIndex - 1] : null;
    const next = flatIndex < 2 ? directions[flatIndex + 1] : null;

    // 前後がない場合
    if (!prev && !next) return 'ISOLATED';

    // 継続型パターン
    if (prev === 'UP' && next === 'UP') return 'CONTINUATION_UP';
    if (prev === 'DOWN' && next === 'DOWN') return 'CONTINUATION_DOWN';

    // 反転型パターン
    if (prev === 'UP' && next === 'DOWN') return 'REVERSAL_TOP';
    if (prev === 'DOWN' && next === 'UP') return 'REVERSAL_BOTTOM';

    // 片側のみ有効な場合
    if (prev === 'UP' || next === 'UP') return 'CONSOLIDATION';
    if (prev === 'DOWN' || next === 'DOWN') return 'CONSOLIDATION';

    // 前後もFLAT
    return 'ISOLATED';
  }

  /**
   * 案F: ボラティリティ環境マッチング
   * 現在と過去のボラティリティ環境が似ているかを評価
   *
   * ボラティリティ環境:
   * - HIGH: 高ボラティリティ（急激な変動）
   * - MEDIUM: 中程度
   * - LOW: 低ボラティリティ（穏やかな変動）
   */
  evaluateVolatilityEnvironment(currentSegs, historicalSegs) {
    // 各パターンの総合ボラティリティを計算
    const currentVolatility = this.calculateTotalVolatility(currentSegs);
    const historicalVolatility = this.calculateTotalVolatility(historicalSegs);

    // ボラティリティ環境を分類
    const currentEnv = this.classifyVolatilityEnvironment(currentVolatility);
    const historicalEnv = this.classifyVolatilityEnvironment(historicalVolatility);

    // 環境マッチングスコアを計算
    let matchScore = 0;

    if (currentEnv === historicalEnv) {
      // 完全一致: 高ボーナス
      matchScore = 0.15;
    } else if (Math.abs(this.getEnvLevel(currentEnv) - this.getEnvLevel(historicalEnv)) === 1) {
      // 隣接環境: 小ボーナス（HIGH↔MEDIUM, MEDIUM↔LOW）
      matchScore = 0.05;
    } else {
      // 不一致（HIGH↔LOW）: ペナルティ
      matchScore = -0.1;
    }

    // ボラティリティの数値的な類似度も加味
    const volRatio = Math.min(currentVolatility, historicalVolatility) /
                     Math.max(currentVolatility, historicalVolatility, 0.001);
    const numericSimilarity = volRatio * 0.05; // 最大5%追加

    return {
      score: matchScore + numericSimilarity,
      currentEnv: currentEnv,
      historicalEnv: historicalEnv,
      currentVolatility: currentVolatility,
      historicalVolatility: historicalVolatility,
      isMatch: currentEnv === historicalEnv
    };
  }

  /**
   * セグメント群の総合ボラティリティを計算
   */
  calculateTotalVolatility(segments) {
    if (!segments || segments.length === 0) return 0;

    // 各セグメントのvolatilityとrangePercentを合算
    let totalVol = 0;
    for (const seg of segments) {
      const vol = seg.volatility || 0;
      const range = seg.rangePercent || 0;
      // volatilityとrangeの加重平均（volatility重視）
      totalVol += vol * 0.7 + range * 0.3;
    }

    return totalVol / segments.length;
  }

  /**
   * ボラティリティ環境を分類
   */
  classifyVolatilityEnvironment(volatility) {
    // 閾値は経験的に調整（通貨ペアによって異なる可能性あり）
    if (volatility >= 0.15) return 'HIGH';      // 高ボラティリティ
    if (volatility >= 0.05) return 'MEDIUM';    // 中程度
    return 'LOW';                                // 低ボラティリティ
  }

  /**
   * 環境レベルを数値化（比較用）
   */
  getEnvLevel(env) {
    const levels = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2 };
    return levels[env] || 1;
  }

  // ============================================
  // 案1 + 案3: 詳細類似度評価
  // ============================================

  /**
   * 案3: モメンタム変化率を計算（相対評価）
   * セグメント間の勢いの変化パターンを分析
   *
   * @param {Array} segments - セグメント配列
   * @returns {Object} - モメンタムシフト情報
   */
  calculateMomentumShift(segments) {
    if (!segments || segments.length < 2) {
      return { type: 'UNKNOWN', value: 0, shifts: [] };
    }

    const momentums = segments.map(s => s.magnitude || 0);

    // 平均モメンタムを基準にした相対変化（通貨ペア非依存）
    const avgMomentum = momentums.reduce((a, b) => a + b, 0) / momentums.length || 0.001;

    // 各セグメント間の変化率
    const shifts = [];
    for (let i = 1; i < momentums.length; i++) {
      const shift = (momentums[i] - momentums[i - 1]) / avgMomentum;
      shifts.push(shift);
    }

    // トレンド（全体的な加速/減速）
    const trend = shifts.reduce((a, b) => a + b, 0);

    // パターン分類
    let type;
    if (trend > 0.5) {
      type = 'ACCELERATING';  // 加速中（勢い増加）
    } else if (trend < -0.5) {
      type = 'DECELERATING';  // 減速中（勢い減少）
    } else if (Math.abs(shifts[shifts.length - 1]) > 1.0) {
      type = 'SPIKE';         // 直近で急変
    } else {
      type = 'STABLE';        // 安定
    }

    return {
      type: type,
      value: trend,
      shifts: shifts,
      avgMomentum: avgMomentum
    };
  }

  /**
   * 案1改良: セグメント内形状を推定（コンテキスト対応版）
   *
   * v2.0 改良点:
   * - 通貨ペア・時間枠に応じた相対的な強度判定
   * - 形状カテゴリの細分化（STRONG/MODERATE/WEAK）
   * - magnitudeの相対評価
   *
   * @param {Object} segment - セグメントデータ
   * @param {Object} context - コンテキスト情報 { assetName, timeframe, baseMagnitude }
   * @returns {string} - 形状タイプ（例: "STEADY_DOWN_STRONG"）
   */
  estimateSegmentShape(segment, context = {}) {
    const { direction, peakPosition, troughPosition, upRatio, magnitude } = segment;

    // v2.3: デバッグログを削減（問題解決済み）

    // FLATセグメントは形状なし（強度も判定）
    if (direction === 'FLAT') {
      const baseMag = context.baseMagnitude || this.getBaseMagnitude(context);
      const magRatio = Math.abs(magnitude || 0) / baseMag;

      // FLATでも微小な動きの大小で分類
      if (magRatio < 0.3) return 'FLAT_TIGHT';      // ほぼ完全な横ばい
      if (magRatio < 0.6) return 'FLAT_LOOSE';      // 緩やかな横ばい
      return 'FLAT_CHOPPY';                          // 小さな上下動
    }

    // === 相対的な強度を計算 ===
    const baseMag = context.baseMagnitude || this.getBaseMagnitude(context);
    const magRatio = Math.abs(magnitude || 0) / baseMag;

    // 強度レベルを判定（相対的）
    let strength;
    if (magRatio >= 2.0) {
      strength = 'STRONG';      // 平均の2倍以上 = 強い動き
    } else if (magRatio >= 1.0) {
      strength = 'MODERATE';    // 平均以上 = 普通の動き
    } else if (magRatio >= 0.5) {
      strength = 'WEAK';        // 平均の半分以上 = 弱い動き
    } else {
      strength = 'MINIMAL';     // 平均の半分未満 = ごく弱い動き
    }

    // === 上昇セグメントの形状分析 ===
    if (direction === 'UP') {
      let baseShape;

      // upRatioによる基本形状判定（細分化）
      if (upRatio > 0.85) {
        baseShape = 'STEADY_UP';           // 非常に安定した上昇
      } else if (upRatio > 0.7) {
        baseShape = 'GRADUAL_UP';          // やや安定した上昇
      } else if (peakPosition < 0.2) {
        baseShape = 'SPIKE_UP';            // 序盤にピーク（急騰後横ばい）
      } else if (peakPosition < 0.35) {
        baseShape = 'EARLY_PEAK_UP';       // 前半にピーク
      } else if (peakPosition > 0.85) {
        baseShape = 'ACCELERATING_UP';     // 終盤にピーク（加速上昇）
      } else if (peakPosition > 0.65) {
        baseShape = 'LATE_RISE_UP';        // 後半に上昇
      } else if (troughPosition > 0.35 && troughPosition < 0.65) {
        baseShape = 'V_RECOVERY_UP';       // V字回復
      } else {
        baseShape = 'CHOPPY_UP';           // 不規則な上昇
      }

      return `${baseShape}_${strength}`;
    }

    // === 下降セグメントの形状分析 ===
    if (direction === 'DOWN') {
      let baseShape;

      // upRatioによる基本形状判定（細分化）
      if (upRatio < 0.15) {
        baseShape = 'STEADY_DOWN';         // 非常に安定した下降
      } else if (upRatio < 0.3) {
        baseShape = 'GRADUAL_DOWN';        // やや安定した下降
      } else if (troughPosition < 0.2) {
        baseShape = 'SPIKE_DOWN';          // 序盤に谷（急落後横ばい）
      } else if (troughPosition < 0.35) {
        baseShape = 'EARLY_DIP_DOWN';      // 前半に谷
      } else if (troughPosition > 0.85) {
        baseShape = 'ACCELERATING_DOWN';   // 終盤に谷（加速下落）
      } else if (troughPosition > 0.65) {
        baseShape = 'LATE_DROP_DOWN';      // 後半に下落
      } else if (peakPosition > 0.35 && peakPosition < 0.65) {
        baseShape = 'INVERTED_V_DOWN';     // 逆V字
      } else {
        baseShape = 'CHOPPY_DOWN';         // 不規則な下降
      }

      return `${baseShape}_${strength}`;
    }

    return 'UNKNOWN';
  }

  /**
   * 形状文字列から基本形状と強度を分離
   * @param {string} shape - 形状文字列（例: "STEADY_DOWN_STRONG"）
   * @returns {Object} - { baseShape, strength }
   */
  parseShape(shape) {
    if (!shape || shape === 'UNKNOWN') {
      return { baseShape: 'UNKNOWN', strength: 'UNKNOWN' };
    }

    // FLAT系の特別処理
    if (shape.startsWith('FLAT')) {
      return { baseShape: shape, strength: 'FLAT' };
    }

    // 最後のアンダースコア以降が強度
    const parts = shape.split('_');
    const strength = parts.pop();
    const baseShape = parts.join('_');

    // 強度が有効な値かチェック
    const validStrengths = ['STRONG', 'MODERATE', 'WEAK', 'MINIMAL'];
    if (validStrengths.includes(strength)) {
      return { baseShape, strength };
    }

    // 旧形式（強度なし）の場合
    return { baseShape: shape, strength: 'MODERATE' };
  }

  /**
   * 形状の類似度を計算（v2.0: 強度レベル対応版）
   *
   * 新しい形状形式: "STEADY_DOWN_STRONG" = 基本形状 + 強度
   * - 基本形状が同じで強度も同じ → 1.0
   * - 基本形状が同じで強度が1段階違う → 0.85
   * - 基本形状が同じで強度が2段階違う → 0.7
   * - 基本形状が関連で強度が同じ → 0.6
   * - etc.
   *
   * @param {string} shape1 - 形状1
   * @param {string} shape2 - 形状2
   * @returns {number} - 類似度 (0-1)
   */
  compareShapes(shape1, shape2) {
    // 完全一致
    if (shape1 === shape2) {
      return 1.0;
    }

    // 形状をパース
    const parsed1 = this.parseShape(shape1);
    const parsed2 = this.parseShape(shape2);

    // === FLAT系の処理 ===
    if (parsed1.baseShape.startsWith('FLAT') || parsed2.baseShape.startsWith('FLAT')) {
      // FLAT同士
      if (parsed1.baseShape.startsWith('FLAT') && parsed2.baseShape.startsWith('FLAT')) {
        // FLAT_TIGHT vs FLAT_LOOSE など
        if (parsed1.baseShape === parsed2.baseShape) return 1.0;
        // FLAT_TIGHT と FLAT_LOOSE は近い
        if ((parsed1.baseShape === 'FLAT_TIGHT' || parsed1.baseShape === 'FLAT_LOOSE') &&
            (parsed2.baseShape === 'FLAT_TIGHT' || parsed2.baseShape === 'FLAT_LOOSE')) {
          return 0.85;
        }
        // FLAT_CHOPPY と他のFLAT
        return 0.6;
      }

      // FLATと他の形状の比較
      const otherParsed = parsed1.baseShape.startsWith('FLAT') ? parsed2 : parsed1;
      const flatParsed = parsed1.baseShape.startsWith('FLAT') ? parsed1 : parsed2;

      // FLAT_TIGHTは動きがないので、どの形状とも類似度低い
      if (flatParsed.baseShape === 'FLAT_TIGHT') {
        return 0.1;
      }

      // 弱い動きのFLATと弱い動きの方向性は近い
      if (otherParsed.strength === 'MINIMAL' || otherParsed.strength === 'WEAK') {
        if (otherParsed.baseShape.includes('STEADY') || otherParsed.baseShape.includes('GRADUAL')) {
          return 0.4;
        }
        return 0.25;
      }

      // 強い動きとFLATは遠い
      return 0.1;
    }

    // === 方向性チェック ===
    const isUp1 = parsed1.baseShape.includes('UP');
    const isUp2 = parsed2.baseShape.includes('UP');
    const isDown1 = parsed1.baseShape.includes('DOWN');
    const isDown2 = parsed2.baseShape.includes('DOWN');

    // 反対方向は類似度0
    if ((isUp1 && isDown2) || (isDown1 && isUp2)) {
      return 0.0;
    }

    // === 強度の差を計算 ===
    const strengthOrder = ['MINIMAL', 'WEAK', 'MODERATE', 'STRONG'];
    const strength1Idx = strengthOrder.indexOf(parsed1.strength);
    const strength2Idx = strengthOrder.indexOf(parsed2.strength);
    const strengthDiff = Math.abs(strength1Idx - strength2Idx);

    // 強度差による減点係数
    const strengthPenalty = {
      0: 1.0,    // 同じ強度
      1: 0.85,   // 1段階差
      2: 0.7,    // 2段階差
      3: 0.55    // 3段階差（MINIMALとSTRONG）
    };
    const strengthMult = strengthPenalty[strengthDiff] || 0.5;

    // === 基本形状の類似度 ===
    const base1 = parsed1.baseShape;
    const base2 = parsed2.baseShape;

    // 同じ基本形状
    if (base1 === base2) {
      return strengthMult;
    }

    // 関連形状グループ（新しい細分化に対応）
    const relatedGroups = [
      // 安定系上昇
      ['STEADY_UP', 'GRADUAL_UP'],
      // 加速系上昇
      ['ACCELERATING_UP', 'LATE_RISE_UP'],
      // 急変系上昇
      ['SPIKE_UP', 'EARLY_PEAK_UP'],
      // V字系上昇
      ['V_RECOVERY_UP', 'CHOPPY_UP'],

      // 安定系下降
      ['STEADY_DOWN', 'GRADUAL_DOWN'],
      // 加速系下降
      ['ACCELERATING_DOWN', 'LATE_DROP_DOWN'],
      // 急変系下降
      ['SPIKE_DOWN', 'EARLY_DIP_DOWN'],
      // 逆V字系下降
      ['INVERTED_V_DOWN', 'CHOPPY_DOWN'],

      // 類似パターン（方向内）
      ['STEADY_UP', 'ACCELERATING_UP'],
      ['STEADY_DOWN', 'ACCELERATING_DOWN'],
      ['GRADUAL_UP', 'LATE_RISE_UP'],
      ['GRADUAL_DOWN', 'LATE_DROP_DOWN']
    ];

    // 関連グループ内かチェック
    for (const group of relatedGroups) {
      if (group.includes(base1) && group.includes(base2)) {
        return 0.65 * strengthMult;  // 関連形状 × 強度係数
      }
    }

    // 同じ方向だが関連グループ外
    if ((isUp1 && isUp2) || (isDown1 && isDown2)) {
      return 0.35 * strengthMult;
    }

    // その他（通常ここには来ない）
    return 0.0;
  }

  /**
   * 詳細類似度評価（案1 + 案3の統合）
   * モメンタム変化率 + セグメント内形状を評価
   *
   * @param {Array} currentSegs - 現在のセグメント群
   * @param {Array} historicalSegs - 過去のセグメント群
   * @param {Object} context - コンテキスト（assetName, timeframe, baseMagnitude）
   * @returns {Object} - 評価結果
   */
  evaluateDetailedSimilarity(currentSegs, historicalSegs, context = {}) {
    let bonus = 0;
    let momentumBonus = 0;
    let shapeBonus = 0;

    // === 案3: モメンタム変化率の比較 ===
    const currentMomentum = this.calculateMomentumShift(currentSegs);
    const historicalMomentum = this.calculateMomentumShift(historicalSegs);

    // モメンタムパターンの一致評価
    if (currentMomentum.type === historicalMomentum.type) {
      // パターン一致 + 数値的な類似度
      const valueDiff = Math.abs(currentMomentum.value - historicalMomentum.value);
      const similarity = Math.exp(-valueDiff * 0.5); // 差が大きいほど減衰
      momentumBonus = 0.12 * similarity; // 最大12%ボーナス
      bonus += momentumBonus;
    } else {
      // パターン不一致はペナルティ
      // ただし、STABLE以外の不一致のみペナルティ
      if (currentMomentum.type !== 'STABLE' && historicalMomentum.type !== 'STABLE') {
        momentumBonus = -0.08; // -8%ペナルティ
        bonus += momentumBonus;
      }
    }

    // === 案1: セグメント内形状の比較（コンテキスト対応） ===
    const currentShapes = currentSegs.map(s => this.estimateSegmentShape(s, context));
    const historicalShapes = historicalSegs.map(s => this.estimateSegmentShape(s, context));

    // 各セグメントの形状類似度（重み付き）
    const shapeDetails = [];
    for (let i = 0; i < 3; i++) {
      const shapeSimilarity = this.compareShapes(currentShapes[i], historicalShapes[i]);
      // セグメント重み [1, 4, 16] を正規化して適用
      const weight = this.segmentWeights[i] / 21; // 21 = 1+4+16
      const segShapeBonus = 0.08 * shapeSimilarity * weight;
      shapeBonus += segShapeBonus;
      bonus += segShapeBonus;
      shapeDetails.push({ seg: i, cur: currentShapes[i], hist: historicalShapes[i], sim: shapeSimilarity });
    }

    return {
      bonus: bonus, // 最大約+20%、最小約-8%
      momentumMatch: currentMomentum.type === historicalMomentum.type,
      momentumBonus: momentumBonus,
      shapeBonus: shapeBonus,
      currentMomentum: currentMomentum,
      historicalMomentum: historicalMomentum,
      currentShapes: currentShapes,
      historicalShapes: historicalShapes
    };
  }

  /**
   * 全セグメントの総合スコアを計算（アクティビティフィルター付き）
   * @param {Array} currentSegments - 現在のセグメント群
   * @param {Array} historicalSegments - 過去のセグメント群
   * @param {number} timeframe - 時間枠
   * @param {Object} context - コンテキスト（assetName, timeframe, baseMagnitude）
   */
  calculateTotalScore(currentSegments, historicalSegments, timeframe = 60, context = {}) {
    const segmentCount = 3;
    const maxScore = this.segmentWeights.reduce((a, b) => a + b, 0) * 1.2;

    // === アクティブセグメント数をカウント ===
    const currentActiveCount = currentSegments.filter(s => this.isActiveSegment(s)).length;
    const historicalActiveCount = historicalSegments.filter(s => this.isActiveSegment(s)).length;

    // 両方のパターンでアクティブセグメント数の少ない方を採用
    const minActiveCount = Math.min(currentActiveCount, historicalActiveCount);
    const activeRatio = minActiveCount / segmentCount;

    // === 時間枠別の低ボラティリティ判定 ===
    // v2.3修正: 低ボラティリティフィルターを無効化
    // 理由: FOREX市場では変動が小さい時間帯も多く、全データが除外されてしまう問題があった
    // 代わりに、FLAT同士の比較でも類似度を計算し、形状ベースで差別化する
    const minRequired = 0; // this.getMinActiveSegments(timeframe); // 無効化

    if (minActiveCount < minRequired) {
      // v2.3: このブロックは実質的に無効化（minRequired=0のため）
      return {
        percentage: 0,
        totalScore: 0,
        maxScore: maxScore,
        segmentScores: [],
        lowVolatility: true,
        activeSegments: minActiveCount,
        activeRatio: activeRatio,
        timeframe: timeframe,
        minRequired: minRequired,
        reason: `全セグメントが低ボラティリティ (アクティブ: ${minActiveCount}/${segmentCount}, 閾値: ${minRequired}/${segmentCount}, 時間枠: ${timeframe}秒)`
      };
    }

    // === 通常のスコア計算 ===
    let totalScore = 0;
    const segmentScores = [];

    for (let i = 0; i < 3; i++) {
      const segScore = this.scoreSegment(
        currentSegments[i],
        historicalSegments[i],
        i,
        context  // コンテキストを渡す
      );
      totalScore += segScore.score;
      segmentScores.push(segScore);
    }

    // === 文脈付きFLAT評価ボーナス ===
    const flatContextBonus = this.evaluateFlatContext(currentSegments, historicalSegments);
    totalScore += flatContextBonus * maxScore * 0.1; // 最大10%のボーナス

    // === 案F: ボラティリティ環境マッチング（v2.2で緩和）===
    const volEnvResult = this.evaluateVolatilityEnvironment(currentSegments, historicalSegments);
    // v2.2修正: ペナルティを緩和（-10% → -5%）し、ボーナスも控えめに
    const volEnvScore = volEnvResult.score >= 0
      ? volEnvResult.score * 0.5   // ボーナスは半分に
      : volEnvResult.score * 0.3;  // ペナルティは30%に緩和
    totalScore += volEnvScore * maxScore;

    // === 案1+3: 詳細類似度評価（モメンタム変化率 + セグメント内形状） ===
    // v2.2修正: ペナルティを大幅に緩和し、ボーナス寄りに調整
    const detailedResult = this.evaluateDetailedSimilarity(currentSegments, historicalSegments, context);

    // 形状完全一致でない場合は、detailedResult.bonusの効果を強化
    // 形状が全て一致していればbonus=0以上、不一致があればマイナスになる
    const allShapesMatch = detailedResult.currentShapes.every(
      (shape, i) => shape === detailedResult.historicalShapes[i]
    );

    if (allShapesMatch) {
      // 形状完全一致: 通常のボーナス適用
      totalScore += detailedResult.bonus * maxScore;
    } else {
      // 形状不一致: 緩やかなペナルティ（v2.2でさらに緩和）
      // v2.2修正: ペナルティを大幅に緩和（0%になりすぎ問題対策）
      // shapeBonusが低くてもペナルティは最大5%程度に抑える
      const shapeMismatchPenalty = Math.min((0.08 - detailedResult.shapeBonus) * 0.8, 0.05); // 最大5%
      const momentumPenalty = detailedResult.momentumMatch ? 0 : 0.02; // 不一致でも2%（5%→2%に緩和）
      totalScore -= (shapeMismatchPenalty + momentumPenalty) * maxScore;
    }

    // v2.2: totalScoreが0以下にならないよう最低保証
    // 方向が一致していれば最低20%のスコアを保証
    const baseScore = this.segmentWeights.reduce((a, b) => a + b, 0) * 0.2;
    if (totalScore < baseScore) {
      totalScore = baseScore;
    }

    // パーセンテージに変換
    const rawPercentage = (totalScore / maxScore) * 100;

    // パフォーマンス最適化のため無効化（大量データ時に負荷が高い）
    // sscLog(`[EnhancedScoring] ✅ アクティブセグメント ${minActiveCount}/${segmentCount} (${(activeRatio*100).toFixed(0)}%) - スコア計算実行`);

    // 最終的なpercentageは0-100に制限
    // 100%は形状・magnitude・slope・モメンタム全てが一致した場合のみ
    const percentage = Math.min(100, Math.max(0, rawPercentage));

    return {
      percentage: percentage,
      totalScore: totalScore,
      maxScore: maxScore,
      segmentScores: segmentScores,
      lowVolatility: false,
      activeSegments: minActiveCount,
      activeRatio: activeRatio,
      volatilityEnv: volEnvResult,
      detailedSimilarity: detailedResult // 詳細類似度情報を追加
    };
  }
}

/**
 * 一致パターン評価システム
 * どのセグメントが一致しているかのパターンを評価
 */
class MatchPatternEvaluator {
  /**
   * 一致パターンを評価（全時間枠3セグメント統一）
   * @param {Array} matches - 一致したセグメントのインデックス [0-2]
   * @param {number} timeframe - 時間枠（秒）※互換性のため残すが使用しない
   * @returns {Object} - スコアと詳細
   */
  evaluate(matches, timeframe = 60) {
    if (matches.length === 0) return {
      score: 0,
      recency: 0,
      continuity: 0,
      coverage: 0,
      pattern: 'NO_MATCH'
    };

    const segmentCount = 3;

    // === 軸1: 直近性 (Recency) ===
    const recency = this.evaluateRecency(matches);

    // === 軸2: 連続性 (Continuity) ===
    const continuity = this.evaluateContinuity(matches);

    // === 軸3: カバレッジ (Coverage) ===
    const coverage = this.evaluateCoverage(matches);

    // 重み付き合計 (改善版: カバー率を重視)
    const score =
      recency * 0.4 +      // 直近性: 40% (50% → 40%)
      continuity * 0.35 +  // 連続性: 35% (30% → 35%)
      coverage * 0.25;     // カバレッジ: 25% (20% → 25%)

    return {
      score: score,
      recency: recency,
      continuity: continuity,
      coverage: coverage,
      pattern: this.describePattern(matches)
    };
  }

  /**
   * 直近性を評価（全時間枠3セグメント統一）
   */
  evaluateRecency(matches) {
    const weights = [1, 4, 16];
    const maxWeight = 16;

    // 最新の一致セグメント
    const latestMatch = Math.max(...matches);
    const latestWeight = weights[latestMatch];

    // 直近セグメント([2])の一致数
    const recentCount = matches.filter(i => i >= 2).length;

    // 中盤以降([1][2])の一致数
    const midCount = matches.filter(i => i >= 1).length;

    // スコア計算 (改善版: ボーナス強化)
    const baseScore = (latestWeight / maxWeight) * 100; // 0-100
    const bonusScore = recentCount * 12; // 直近で+12点ずつ
    const extraBonus = midCount * 2;     // 中盤以降で+2点ずつ

    return Math.min(100, baseScore + bonusScore + extraBonus);
  }

  /**
   * 連続性を評価（全時間枠3セグメント統一）
   */
  evaluateContinuity(matches) {
    const sorted = [...matches].sort((a, b) => a - b);

    // 最長連続を見つける
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    let consecutiveGroups = [];
    let groupStart = 0;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        if (currentConsecutive >= 2) {
          consecutiveGroups.push(currentConsecutive);
        }
        currentConsecutive = 1;
        groupStart = i;
      }
    }
    // 最後のグループを追加
    if (currentConsecutive >= 2) {
      consecutiveGroups.push(currentConsecutive);
    }

    // 連続数に応じてスコア（3セグメント統一）
    const consecutiveScore = {
      1: 0,
      2: 70,
      3: 100
    }[maxConsecutive] || 0;

    // 直近から連続している場合、ボーナス
    const isRecentContinuous = sorted.length >= 2 &&
      sorted[sorted.length - 1] === 2 &&
      sorted[sorted.length - 2] === 1;
    const recentBonus = isRecentContinuous ? 1.25 : 1.0;

    // 複数の連続グループがある場合、軽微なボーナス (新規)
    const multiGroupBonus = consecutiveGroups.length > 1 ? 5 : 0;

    return Math.min(100, consecutiveScore * recentBonus + multiGroupBonus);
  }

  /**
   * カバレッジを評価（一致数の割合）
   */
  evaluateCoverage(matches) {
    return (matches.length / 3) * 100; // 0-100
  }

  /**
   * パターンを説明（3セグメント統一）
   */
  describePattern(matches) {
    const sorted = [...matches].sort((a, b) => a - b);

    // 全て一致 ([0][1][2])
    if (sorted.length === 3) {
      return 'PERFECT_MATCH';
    }
    // 直近2連続 ([1][2])
    if (sorted.includes(1) && sorted.includes(2)) {
      return 'RECENT_DOUBLE';
    }
    // 最新含む
    if (sorted.includes(2)) {
      return 'INCLUDES_LATEST';
    }
    // 古いデータのみ
    return 'OLD_ONLY';
  }
}

// グローバルスコープに公開
(typeof window !== 'undefined' ? window : self).EnhancedSegmentScoring = EnhancedSegmentScoring;
(typeof window !== 'undefined' ? window : self).MatchPatternEvaluator = MatchPatternEvaluator;
