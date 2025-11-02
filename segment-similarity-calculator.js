/**
 * セグメント類似度計算システム
 * DetailedSegmentAnalyzerの結果を比較して類似度を算出
 */

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
   */
  comparePriceSegments(currentAnalysis, historicalAnalysis) {
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
    const enhancedScoring = new window.EnhancedSegmentScoring();
    const patternEvaluator = new window.MatchPatternEvaluator();

    // 1. 各セグメントのスコアと一致リストを取得
    const segmentScores = [];
    const matches = []; // 一致したセグメントのインデックス

    for (let i = 0; i < currentSegments.length; i++) {
      const score = enhancedScoring.scoreSegment(
        currentSegments[i],
        historicalSegments[i],
        i
      );
      segmentScores.push(score);

      // 何らかの一致がある場合
      if (score.matchLevel > 0) {
        matches.push(i);
      }
    }

    // 2. 一致パターンを評価
    const patternEval = patternEvaluator.evaluate(matches);

    // 3. 総合スコア計算（アクティビティフィルター付き）
    const result = enhancedScoring.calculateTotalScore(currentSegments, historicalSegments);

    // === 低ボラティリティパターンの除外 ===
    if (result.lowVolatility) {
      console.log(`[SegmentSimilarity] ⚠️ 低ボラティリティのため類似度0を返却: ${result.reason}`);
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

    // 4. パターン評価を乗算して最終スコア
    const finalScore = (result.percentage / 100) * (patternEval.score / 100);

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
window.SegmentSimilarityCalculator = SegmentSimilarityCalculator;

/**
 * 強化されたセグメントスコアリングシステム
 * 多次元一致評価（方向+変化量+傾き）とセグメント位置の重み付け
 */
class EnhancedSegmentScoring {
  constructor() {
    // セグメント位置の指数重み
    this.segmentWeights = [1, 2, 4, 8, 16, 32];

    // 一致レベルの定義
    this.matchLevels = {
      PERFECT: 1.0,    // 方向+変化量+傾き 全て一致
      HIGH: 0.7,       // 方向+変化量 一致
      MEDIUM: 0.4,     // 方向のみ 一致
      NONE: 0.0        // 方向不一致
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

    // 一致判定の閾値
    this.thresholds = {
      magnitude: 0.3,    // 変化量の許容誤差: 0.3%
      slope: 0.2         // 傾きの許容誤差: 0.2
    };

    // アクティブセグメント判定の閾値
    this.activityThresholds = {
      minMagnitude: 0.05,        // 最小変化量: 0.05%
      minActiveSegments: 3,      // 最低限必要なアクティブセグメント数 (50%)
      minActiveRatio: 0.5        // 最低限必要なアクティブ比率 (50%)
    };
  }

  /**
   * セグメント単体のスコアを計算
   */
  scoreSegment(currentSeg, historicalSeg, segmentIndex) {
    // 1. 基本重み
    const baseWeight = this.segmentWeights[segmentIndex];

    // 2. 一致レベルを判定
    const matchLevel = this.determineMatchLevel(currentSeg, historicalSeg);

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
   * 一致レベルを判定
   */
  determineMatchLevel(current, historical) {
    // 方向チェック
    const dirMatch = current.direction === historical.direction;
    if (!dirMatch) return this.matchLevels.NONE;

    // 変化量チェック
    const magMatch = this.isMagnitudeMatch(current, historical);

    // 傾きチェック
    const slopeMatch = this.isSlopeMatch(current, historical);

    // レベル判定
    if (magMatch && slopeMatch) {
      return this.matchLevels.PERFECT;  // 完全一致
    } else if (magMatch) {
      return this.matchLevels.HIGH;     // 高一致
    } else {
      return this.matchLevels.MEDIUM;   // 中一致（方向のみ）
    }
  }

  /**
   * 一致レベル名を取得
   */
  getMatchLevelName(level) {
    if (level === this.matchLevels.PERFECT) return 'PERFECT';
    if (level === this.matchLevels.HIGH) return 'HIGH';
    if (level === this.matchLevels.MEDIUM) return 'MEDIUM';
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
   * 全6セグメントの総合スコアを計算（アクティビティフィルター付き）
   */
  calculateTotalScore(currentSegments, historicalSegments) {
    const maxScore = this.segmentWeights.reduce((a, b) => a + b, 0) * 1.2; // 63 * 1.2 = 75.6

    // === アクティブセグメント数をカウント ===
    const currentActiveCount = currentSegments.filter(s => this.isActiveSegment(s)).length;
    const historicalActiveCount = historicalSegments.filter(s => this.isActiveSegment(s)).length;

    // 両方のパターンでアクティブセグメント数の少ない方を採用
    const minActiveCount = Math.min(currentActiveCount, historicalActiveCount);
    const activeRatio = minActiveCount / 6;

    // === 低ボラティリティ判定 ===
    if (minActiveCount < this.activityThresholds.minActiveSegments) {
      console.log(`[EnhancedScoring] ⚠️ 低ボラティリティパターン検出: アクティブセグメント ${minActiveCount}/6 (${(activeRatio*100).toFixed(0)}%)`);
      return {
        percentage: 0,
        totalScore: 0,
        maxScore: maxScore,
        segmentScores: [],
        lowVolatility: true,
        activeSegments: minActiveCount,
        activeRatio: activeRatio,
        reason: `全セグメントが低ボラティリティ (アクティブ: ${minActiveCount}/6, 閾値: ${this.activityThresholds.minActiveSegments}/6)`
      };
    }

    // === 通常のスコア計算 ===
    let totalScore = 0;
    const segmentScores = [];

    for (let i = 0; i < 6; i++) {
      const segScore = this.scoreSegment(
        currentSegments[i],
        historicalSegments[i],
        i
      );
      totalScore += segScore.score;
      segmentScores.push(segScore);
    }

    // パーセンテージに変換
    const percentage = (totalScore / maxScore) * 100;

    console.log(`[EnhancedScoring] ✅ アクティブセグメント ${minActiveCount}/6 (${(activeRatio*100).toFixed(0)}%) - スコア計算実行`);

    return {
      percentage: Math.min(100, percentage),
      totalScore: totalScore,
      maxScore: maxScore,
      segmentScores: segmentScores,
      lowVolatility: false,
      activeSegments: minActiveCount,
      activeRatio: activeRatio
    };
  }
}

/**
 * 一致パターン評価システム
 * どのセグメントが一致しているかのパターンを評価
 */
class MatchPatternEvaluator {
  /**
   * 一致パターンを評価 (改善版)
   * @param {Array} matches - 一致したセグメントのインデックス [0-5]
   * @returns {Object} - スコアと詳細
   */
  evaluate(matches) {
    if (matches.length === 0) return {
      score: 0,
      recency: 0,
      continuity: 0,
      coverage: 0,
      pattern: 'NO_MATCH'
    };

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
   * 直近性を評価 (改善版)
   */
  evaluateRecency(matches) {
    const weights = [1, 2, 4, 8, 16, 32]; // 指数重み
    const maxWeight = 32;

    // 最新の一致セグメント
    const latestMatch = Math.max(...matches);
    const latestWeight = weights[latestMatch];

    // 直近3つ([3][4][5])のうちいくつ一致しているか
    const recent3 = matches.filter(i => i >= 3).length;

    // 直近5つ([1][2][3][4][5])のうちいくつ一致しているか
    const recent5 = matches.filter(i => i >= 1).length;

    // スコア計算 (改善版: ボーナス強化)
    const baseScore = (latestWeight / maxWeight) * 100; // 0-100
    const bonusScore = recent3 * 12; // 直近3つで+12点ずつ (10 → 12)
    const extraBonus = recent5 * 2;  // 直近5つで+2点ずつ (新規)

    return Math.min(100, baseScore + bonusScore + extraBonus);
  }

  /**
   * 連続性を評価 (改善版)
   */
  evaluateContinuity(matches) {
    const sorted = [...matches].sort((a, b) => a - b);

    // 最長連続を見つける
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    let consecutiveGroups = [];
    let groupStart = 0;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i-1] + 1) {
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

    // 連続数に応じてスコア (改善版: スコア調整)
    const consecutiveScore = {
      1: 0,
      2: 45,   // 40 → 45
      3: 75,   // 70 → 75
      4: 88,   // 85 → 88
      5: 96,   // 95 → 96
      6: 100
    }[maxConsecutive] || 0;

    // 直近から連続している場合、ボーナス (改善版: 1.3 → 1.25)
    const isRecentContinuous = sorted[sorted.length - 1] === 5 &&
                               sorted[sorted.length - 2] === 4;
    const recentBonus = isRecentContinuous ? 1.25 : 1.0;

    // 複数の連続グループがある場合、軽微なボーナス (新規)
    const multiGroupBonus = consecutiveGroups.length > 1 ? 5 : 0;

    return Math.min(100, consecutiveScore * recentBonus + multiGroupBonus);
  }

  /**
   * カバレッジを評価（一致数の割合）
   */
  evaluateCoverage(matches) {
    return (matches.length / 6) * 100; // 0-100
  }

  /**
   * パターンを説明
   */
  describePattern(matches) {
    const sorted = [...matches].sort((a, b) => a - b);

    // 直近3連続 ([3][4][5])
    if (sorted.includes(3) && sorted.includes(4) && sorted.includes(5)) {
      return 'RECENT_TRIPLE';
    }
    // 直近2連続 ([4][5])
    if (sorted.includes(4) && sorted.includes(5)) {
      return 'RECENT_DOUBLE';
    }
    // 最新含む
    if (sorted.includes(5)) {
      return 'INCLUDES_LATEST';
    }
    // 中間連続
    if (sorted.includes(2) && sorted.includes(3) && sorted.includes(4)) {
      return 'MIDDLE_CONTINUOUS';
    }
    // 古いデータのみ
    if (Math.max(...sorted) <= 2) {
      return 'OLD_ONLY';
    }
    // 散発的
    return 'SCATTERED';
  }
}

// グローバルスコープに公開
window.EnhancedSegmentScoring = EnhancedSegmentScoring;
window.MatchPatternEvaluator = MatchPatternEvaluator;
