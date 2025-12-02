/**
 * Pattern Matching System
 *
 * 過去のデータパターンと現在の状況を比較し、
 * 類似した過去のケースから将来の動きを予測する
 */

// デバッグモード（本番ではfalse）
const PMS_DEBUG = false;
const pmsLog = PMS_DEBUG ? pmsLog.bind(console) : () => {};

class PatternMatchingSystem {
    constructor(trainingData) {
        this.trainingData = trainingData;

        // セグメント分析システムを初期化
        // グローバルスコープから取得（Worker/Window両対応）
        const globalScope = typeof window !== 'undefined' ? window : self;
        this.segmentAnalyzer = new globalScope.DetailedSegmentAnalyzer();
        this.similarityCalculator = new globalScope.SegmentSimilarityCalculator();
    }

    // 類似パターンを検索（段階的マッチング）
    findSimilarPatterns(currentSituation, timeframe = 15, minSimilarity = 50, maxDataCount = null) {
        // データ件数制限の適用
        let targetData = this.trainingData;
        const totalDataCount = this.trainingData.length;
        const dataWithResults = this.trainingData.filter(d => d[`result${timeframe}s`] && !d[`result${timeframe}s`].pending).length;

        if (maxDataCount !== null && maxDataCount > 0) {
            // 最新のmaxDataCount件を使用
            targetData = this.trainingData.slice(-maxDataCount);
            const targetDataWithResults = targetData.filter(d => d[`result${timeframe}s`] && !d[`result${timeframe}s`].pending).length;
            pmsLog(`[ML] 🔍 findSimilarPatterns開始: timeframe=${timeframe}s, minSimilarity=${minSimilarity}%`);
            pmsLog(`[ML] 📊 データ範囲: 直近${maxDataCount}件指定 → 実際の検索対象=${targetDataWithResults}件（結果記録済み） / 総数=${totalDataCount}件`);
        } else {
            pmsLog(`[ML] 🔍 findSimilarPatterns開始: timeframe=${timeframe}s, minSimilarity=${minSimilarity}%`);
            pmsLog(`[ML] 📊 データ範囲: 全期間使用 → 検索対象=${dataWithResults}件（結果記録済み） / 総数=${totalDataCount}件`);
        }

        // 全件検索（データ件数制限を適用）
        pmsLog('[ML] 🔍 全件検索を使用');
        const similarPatterns = [];
        const allSimilarities = []; // 🔬 診断用：全類似度を記録
        let totalChecked = 0;
        let passedThreshold = 0;

        for (const past of targetData) {
            // 結果が記録されていないデータはスキップ
            const result = past[`result${timeframe}s`];
            if (!result) continue;

            // pending（未確定）のデータはスキップ
            if (result.pending === true) continue;

            // 類似度を計算（timeframeを渡す）
            const similarity = this.calculateSimilarity(currentSituation, past, timeframe);
            totalChecked++;
            allSimilarities.push(similarity); // 🔬 診断用

            if (similarity >= minSimilarity) {
                passedThreshold++;
                similarPatterns.push({
                    pattern: past,
                    similarity: similarity,
                    result: result
                });
            }
        }

        pmsLog(`[ML] 🔍 フィルタリング結果: チェック=${totalChecked}件, 閾値通過=${passedThreshold}件, minSimilarity=${minSimilarity}%`);

        // 🔬 診断: 類似度の分布を確認
        if (allSimilarities.length > 0) {
            allSimilarities.sort((a, b) => b - a);
            const above70 = allSimilarities.filter(s => s >= 70).length;
            const above60 = allSimilarities.filter(s => s >= 60).length;
            const above50 = allSimilarities.filter(s => s >= 50).length;
            pmsLog(`[🔬 診断] 類似度分布: 最大=${Math.round(allSimilarities[0])}%, 70%以上=${above70}件, 60%以上=${above60}件, 50%以上=${above50}件`);
            pmsLog(`[🔬 診断] 上位10件の類似度:`, allSimilarities.slice(0, 10).map(s => Math.round(s)));
        }

        // 類似度でソート
        similarPatterns.sort((a, b) => b.similarity - a.similarity);

        // 上位5件の類似度をログ出力
        const top5Similarities = similarPatterns.slice(0, 5).map(p => Math.round(p.similarity));
        pmsLog(`[ML] 📊 上位5件の類似度: [${top5Similarities.join(', ')}]`);

        // 閾値に応じて使用するパターン数を調整
        // 低い閾値ではより多くのパターンを使用し、高い閾値では厳格にフィルタリング
        let maxPatterns;
        if (minSimilarity >= 90) {
            maxPatterns = 100;  // 90%以上: 最も厳格（上位100件）
        } else if (minSimilarity >= 80) {
            maxPatterns = 200;  // 80%以上: 中程度（上位200件）
        } else if (minSimilarity >= 70) {
            maxPatterns = 300;  // 70%以上: 標準（上位300件）
        } else {
            maxPatterns = 500;  // 50-69%: より多くのパターン（上位500件）
        }

        const result = similarPatterns.slice(0, maxPatterns);
        pmsLog(`[ML] ✅ 返却するパターン数: ${result.length}件 (閾値${minSimilarity}%の上限${maxPatterns}件)`);

        // 詳細スコア内訳を出力（閾値通過した上位5件のみ）
        // _detailedSamplesには閾値未満のデータも含まれているため、フィルタリングが必要
        if (this._detailedSamples && this._detailedSamples.length > 0) {
            // 類似度が閾値以上のサンプルのみ抽出
            const validSamples = this._detailedSamples.filter(s => s.similarity >= minSimilarity);

            if (validSamples.length > 0) {
                pmsLog(`[ML] 🔬 ========== 上位5件のスコア詳細分析 ==========`);
                validSamples.forEach((sample, index) => {
                    pmsLog(`[ML] 🔬 [${index + 1}] 類似度: ${sample.similarity}% (${sample.totalScore}/${sample.maxScore}点)`);

                    // テクニカル指標スコア表示
                    if (sample.breakdown.rsi) {
                        pmsLog(`[ML] 🔬     テクニカル指標: ${sample.techScore}/30点 | RSI=${sample.breakdown.rsi.score} MACD=${sample.breakdown.macd.score} ROC=${sample.breakdown.roc.score} MA=${sample.breakdown.maCross.score} Stoch=${sample.breakdown.stochastic.score} ADX=${sample.breakdown.adx.score}`);
                    }

                    // 価格セグメントスコア表示（新システム専用）
                    if (sample.breakdown.priceSegments) {
                        const ps = sample.breakdown.priceSegments;

                        // 低ボラティリティ判定の表示
                        if (ps.lowVolatility) {
                            pmsLog(`[ML] 🔬     価格セグメント: 0/40点 | ⚠️ 低ボラティリティ除外`);
                            pmsLog(`[ML] 🔬       └─ 理由: ${ps.reason || 'アクティブセグメント不足'}`);
                        } else {
                            pmsLog(`[ML] 🔬     価格セグメント: ${sample.priceSegmentScore}/40点 | 強化=${ps.enhancedScore.toFixed(1)}% パターン=${ps.patternScore.toFixed(1)}%`);
                            pmsLog(`[ML] 🔬       ├─ アクティブセグメント: ${ps.activeSegments || 'N/A'}/6 (${ps.activeRatio ? (ps.activeRatio * 100).toFixed(0) : 'N/A'}%)`);
                            pmsLog(`[ML] 🔬       ├─ 一致パターン: ${ps.patternType} (セグメント[${ps.matches.join(',')}])`);
                            pmsLog(`[ML] 🔬       ├─ 評価軸: 直近性=${ps.details.recency.toFixed(0)}% 連続性=${ps.details.continuity.toFixed(0)}% カバー率=${ps.details.coverage.toFixed(0)}%`);
                            pmsLog(`[ML] 🔬       └─ 一致レベル: ${ps.details.matchLevels.join(' → ')}`);
                        }
                    }
                });
                pmsLog(`[ML] 🔬 =============================================`);
            }
            // リセット（次回の検索用）
            this._detailedSamples = [];
        }

        return result;
    }

    // 類似度計算（0-100点）- セグメントベースの詳細分析版
    calculateSimilarity(current, past, timeframe = 60) {
        // 新しいセグメント類似度計算システムを使用
        // SegmentSimilarityCalculatorの加重平均方式（セグメント60% + パターン評価40%）
        return this.similarityCalculator.calculateSimilarity(current, past, timeframe);
    }

    // 予測を生成（改善版: より柔軟な判定）
    predict(currentSituation, timeframe = 15, minSimilarity = 50, maxDataCount = null) {
        const similarPatterns = this.findSimilarPatterns(currentSituation, timeframe, minSimilarity, maxDataCount);

        // 結果が記録されたデータの総数を確認
        const dataWithResults = this.trainingData.filter(d => d[`result${timeframe}s`]).length;
        pmsLog(`[ML] 予測実行: timeframe=${timeframe}s, 閾値=${minSimilarity}%, 結果記録済み=${dataWithResults}件, 類似パターン=${similarPatterns.length}件`);

        if (similarPatterns.length < 10) {
            return {
                prediction: 'INSUFFICIENT_DATA',
                confidence: 0,
                sampleSize: similarPatterns.length,
                dataWithResults: dataWithResults,
                reason: `類似パターン不足（${similarPatterns.length}/10件、結果記録済み${dataWithResults}件）`
            };
        }

        // 結果を集計
        const upCount = similarPatterns.filter(p => p.result.direction === 'UP').length;
        const downCount = similarPatterns.filter(p => p.result.direction === 'DOWN').length;
        const totalCount = similarPatterns.length;

        const upRate = (upCount / totalCount) * 100;
        const downRate = (downCount / totalCount) * 100;

        // 平均変化率
        const avgChangePercent = similarPatterns.reduce((sum, p) =>
            sum + p.result.changePercent, 0) / totalCount;

        // 予測（60%以上でHIGH/LOW判定 - テクニカル分析と統一）
        let prediction, confidence;
        const CONFIDENCE_THRESHOLD = 60;  // テクニカル分析と同じ閾値

        if (upRate >= CONFIDENCE_THRESHOLD) {
            prediction = 'HIGH';
            confidence = Math.round(upRate);
        } else if (downRate >= CONFIDENCE_THRESHOLD) {
            prediction = 'LOW';
            confidence = Math.round(downRate);
        } else {
            prediction = 'NEUTRAL';
            confidence = null; // 見送りの場合はパーセンテージなし
        }

        return {
            prediction,
            confidence,
            upRate: Math.round(upRate),
            downRate: Math.round(downRate),
            sampleSize: totalCount,
            avgChange: avgChangePercent.toFixed(3),
            topPatterns: similarPatterns.slice(0, 5).map(p => ({
                similarity: Math.round(p.similarity),
                result: p.result.direction,
                change: p.result.changePercent.toFixed(3)
            }))
        };
    }

    // 指定された閾値で予測を実行（閾値変更時用）
    predictWithThreshold(currentSituation, timeframe = 15, minSimilarity = 70) {
        pmsLog(`[ML] 🎯 predictWithThreshold呼び出し: timeframe=${timeframe}s, minSimilarity=${minSimilarity}%`);
        const result = this.predict(currentSituation, timeframe, minSimilarity);
        pmsLog(`[ML] 🎯 predictWithThreshold結果:`, result);
        return result;
    }

    // テクニカル指標の時系列比較（動きのパターンで評価）
    compareTechIndicator(current, past, maxPoints) {
        let score = 0;

        // トレンド方向一致（40%）- NEUTRAL同士の過剰スコアリング修正
        if (current.trend === past.trend) {
            // NEUTRAL同士の場合は大幅減点
            if (current.trend === 'NEUTRAL') {
                score += maxPoints * 0.05; // NEUTRAL⇄NEUTRAL: わずか5%のみ
            } else {
                // UP⇄UP または DOWN⇄DOWN: 満点
                score += maxPoints * 0.4;
            }
        } else if (current.trend === 'NEUTRAL' || past.trend === 'NEUTRAL') {
            // どちらかがNEUTRALで、もう一方がUP/DOWNの場合は0点
            score += 0;
        }

        // 変化速度の類似度（30%）
        const velocityDiff = Math.abs(current.velocity - past.velocity);
        const velocityThreshold = Math.max(Math.abs(current.velocity), Math.abs(past.velocity), 0.1);
        const velocitySimilarity = Math.max(0, 1 - (velocityDiff / velocityThreshold));
        score += maxPoints * 0.3 * velocitySimilarity;

        // ボラティリティの類似度（20%）
        const volDiff = Math.abs(current.volatility - past.volatility);
        const volThreshold = Math.max(current.volatility, past.volatility, 1);
        const volSimilarity = Math.max(0, 1 - (volDiff / volThreshold));
        score += maxPoints * 0.2 * volSimilarity;

        // レンジ（変動幅）の類似度（10%）
        const rangeDiff = Math.abs(current.range - past.range);
        const rangeThreshold = Math.max(current.range, past.range, 1);
        const rangeSimilarity = Math.max(0, 1 - (rangeDiff / rangeThreshold));
        score += maxPoints * 0.1 * rangeSimilarity;

        return score;
    }

    // MAクロスの比較
    compareMACross(current, past, maxPoints) {
        let score = 0;

        // クロスオーバー状態の一致（50%）
        if (current.crossover === past.crossover && current.crossover !== 'NONE') {
            score += maxPoints * 0.5; // クロスが同じタイミングで発生
        } else if (current.trend === past.trend) {
            score += maxPoints * 0.3; // 位置関係が同じ
        }

        // 乖離率の類似度（30%）
        const divDiff = Math.abs(current.divergence - past.divergence);
        if (divDiff < 0.5) {
            score += maxPoints * 0.3;
        } else if (divDiff < 1.0) {
            score += maxPoints * 0.2;
        } else if (divDiff < 2.0) {
            score += maxPoints * 0.1;
        }

        // 強さの類似度（20%）
        const strengthDiff = Math.abs(current.strength - past.strength);
        if (strengthDiff < 1.0) {
            score += maxPoints * 0.2;
        } else if (strengthDiff < 2.0) {
            score += maxPoints * 0.1;
        }

        return score;
    }

    // 空のテクニカル時系列データを返す（PatternMatchingSystem用）
    getEmptyTechTimeSeries() {
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
}

// グローバルスコープに公開
(typeof window !== 'undefined' ? window : self).PatternMatchingSystem = PatternMatchingSystem;
