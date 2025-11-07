// ========================================
// Indexed Pattern Matcher（複合インデックス方式）
// 戦略3: 複合指標インデックスによる高速パターンマッチング
// ========================================

class IndexedPatternMatcher {
  constructor() {
    this.data = [];
    this.dataMap = new Map(); // IDから実データへの高速アクセス
    this.isIndexed = false;

    // 複合インデックス
    this.indexes = {
      segment: {},      // セグメントパターン
      momentum: {},     // RSI + Stochastic（モメンタム系）
      trend: {},        // MACD + ROC + MA Cross（トレンド系）
      strength: {}      // ADX（トレンド強度）
    };

    // 統計情報
    this.stats = {
      totalData: 0,
      segmentPatterns: 0,
      momentumCategories: 5,
      trendCategories: 5,
      strengthCategories: 3,
      buildTime: 0,
      lastBuildDate: null
    };
  }

  /**
   * インデックスを構築（ボタン押下時）
   */
  buildIndexes(trainingData, timeframe = 60) {
    console.log(`[IndexedMatcher] 📚 インデックス構築開始: ${trainingData.length}件, timeframe=${timeframe}s`);
    const startTime = Date.now();

    // 初期化
    this.data = trainingData;
    this.dataMap.clear();
    this.indexes = {
      segment: {},
      momentum: {},
      trend: {},
      strength: {}
    };

    // データをマップに登録
    this.data.forEach((data, index) => {
      this.dataMap.set(index, data);
    });

    // 結果が確定しているデータのみをインデックス化
    let indexedCount = 0;

    this.data.forEach((data, index) => {
      const result = data[`result${timeframe}s`];

      // 結果が未確定のデータはスキップ
      if (!result || result.pending === true) {
        return;
      }

      // セグメントデータがないデータはスキップ
      const segments = data[`priceSegments${timeframe}s`];
      if (!segments || !segments.pattern) {
        return;
      }

      // 1. セグメントパターン
      const segmentKey = segments.pattern;
      if (!this.indexes.segment[segmentKey]) {
        this.indexes.segment[segmentKey] = [];
      }
      this.indexes.segment[segmentKey].push(index);

      // 2. モメンタム（RSI + Stochastic）
      const momentumKey = this._classifyMomentum(data.rsi, data.stochasticK);
      if (!this.indexes.momentum[momentumKey]) {
        this.indexes.momentum[momentumKey] = [];
      }
      this.indexes.momentum[momentumKey].push(index);

      // 3. トレンド（MACD + ROC + MA Cross）
      const trendKey = this._classifyTrend(
        data.macdStrength,
        data.rocValue,
        data[`techTimeSeries${timeframe}s`]?.maCross
      );
      if (!this.indexes.trend[trendKey]) {
        this.indexes.trend[trendKey] = [];
      }
      this.indexes.trend[trendKey].push(index);

      // 4. トレンド強度（ADX）
      const strengthKey = this._classifyStrength(data.adxValue);
      if (!this.indexes.strength[strengthKey]) {
        this.indexes.strength[strengthKey] = [];
      }
      this.indexes.strength[strengthKey].push(index);

      indexedCount++;
    });

    // 統計情報を更新
    const buildTime = Date.now() - startTime;
    this.stats = {
      totalData: this.data.length,
      indexedData: indexedCount,
      segmentPatterns: Object.keys(this.indexes.segment).length,
      momentumCategories: Object.keys(this.indexes.momentum).length,
      trendCategories: Object.keys(this.indexes.trend).length,
      strengthCategories: Object.keys(this.indexes.strength).length,
      buildTime: buildTime,
      lastBuildDate: new Date()
    };

    this.isIndexed = true;

    console.log(`[IndexedMatcher] ✅ インデックス構築完了: ${buildTime}ms`);
    console.log(`[IndexedMatcher] 📊 統計:`);
    console.log(`  - インデックス化データ: ${indexedCount}/${this.data.length}件`);
    console.log(`  - セグメントパターン: ${this.stats.segmentPatterns}種類`);
    console.log(`  - モメンタム: ${this.stats.momentumCategories}カテゴリ`);
    console.log(`  - トレンド: ${this.stats.trendCategories}カテゴリ`);
    console.log(`  - 強度: ${this.stats.strengthCategories}カテゴリ`);

    return this.stats;
  }

  /**
   * 類似パターンを検索（分析時）
   */
  findSimilarPatterns(currentSituation, timeframe = 60, similarityCalculator) {
    if (!this.isIndexed) {
      console.warn('[IndexedMatcher] ⚠️ インデックスが構築されていません');
      return [];
    }

    const searchStart = Date.now();

    // 1. 現在の状況から検索条件を生成
    const segments = currentSituation[`priceSegments${timeframe}s`];
    if (!segments || !segments.pattern) {
      console.warn('[IndexedMatcher] ⚠️ セグメントデータがありません');
      return [];
    }

    const conditions = {
      segment: segments.pattern,
      momentum: this._classifyMomentum(currentSituation.rsi, currentSituation.stochasticK),
      trend: this._classifyTrend(
        currentSituation.macdStrength,
        currentSituation.rocValue,
        currentSituation[`techTimeSeries${timeframe}s`]?.maCross
      ),
      strength: this._classifyStrength(currentSituation.adxValue)
    };

    console.log(`[IndexedMatcher] 🔍 検索条件:`, conditions);

    // 2. 各インデックスから候補を取得
    const candidateSets = [];

    // セグメント（最重要）
    if (this.indexes.segment[conditions.segment]) {
      candidateSets.push(this.indexes.segment[conditions.segment]);
      console.log(`[IndexedMatcher]   - セグメント: ${this.indexes.segment[conditions.segment].length}件`);
    } else {
      console.log(`[IndexedMatcher]   - セグメント: 0件（パターン未登録）`);
    }

    // モメンタム
    if (this.indexes.momentum[conditions.momentum]) {
      candidateSets.push(this.indexes.momentum[conditions.momentum]);
      console.log(`[IndexedMatcher]   - モメンタム: ${this.indexes.momentum[conditions.momentum].length}件`);
    }

    // トレンド
    if (this.indexes.trend[conditions.trend]) {
      candidateSets.push(this.indexes.trend[conditions.trend]);
      console.log(`[IndexedMatcher]   - トレンド: ${this.indexes.trend[conditions.trend].length}件`);
    }

    // 強度
    if (this.indexes.strength[conditions.strength]) {
      candidateSets.push(this.indexes.strength[conditions.strength]);
      console.log(`[IndexedMatcher]   - 強度: ${this.indexes.strength[conditions.strength].length}件`);
    }

    // 3. 積集合を計算
    if (candidateSets.length === 0) {
      console.log('[IndexedMatcher] ⚠️ マッチする候補がありません');
      return [];
    }

    let matchingIndexes = this._intersection(candidateSets);
    console.log(`[IndexedMatcher] 🎯 積集合: ${matchingIndexes.length}件`);

    // 4. マッチ数が少なすぎる場合は条件を緩和（段階的）
    if (matchingIndexes.length < 30) {
      console.log('[IndexedMatcher] ⚠️ マッチ数が少ないため条件を緩和');

      // レベル1: セグメントとモメンタムだけで再検索
      const relaxedSets1 = [];
      if (this.indexes.segment[conditions.segment]) {
        relaxedSets1.push(this.indexes.segment[conditions.segment]);
      }
      if (this.indexes.momentum[conditions.momentum]) {
        relaxedSets1.push(this.indexes.momentum[conditions.momentum]);
      }

      if (relaxedSets1.length > 0) {
        matchingIndexes = this._intersection(relaxedSets1);
        console.log(`[IndexedMatcher] 🔄 緩和レベル1（セグメント+モメンタム）: ${matchingIndexes.length}件`);
      }

      // レベル2: まだ少ない場合はセグメントのみ
      if (matchingIndexes.length < 20) {
        console.log('[IndexedMatcher] ⚠️ さらに緩和が必要');

        if (this.indexes.segment[conditions.segment]) {
          matchingIndexes = this.indexes.segment[conditions.segment];
          console.log(`[IndexedMatcher] 🔄 緩和レベル2（セグメントのみ）: ${matchingIndexes.length}件`);
        }
      }

      // レベル3: セグメントがない場合はモメンタムとトレンドで検索
      if (matchingIndexes.length < 10) {
        console.log('[IndexedMatcher] ⚠️ セグメントパターンが少ない、別の条件で検索');

        const relaxedSets2 = [];
        if (this.indexes.momentum[conditions.momentum]) {
          relaxedSets2.push(this.indexes.momentum[conditions.momentum]);
        }
        if (this.indexes.trend[conditions.trend]) {
          relaxedSets2.push(this.indexes.trend[conditions.trend]);
        }

        if (relaxedSets2.length > 0) {
          matchingIndexes = this._intersection(relaxedSets2);
          console.log(`[IndexedMatcher] 🔄 緩和レベル3（モメンタム+トレンド）: ${matchingIndexes.length}件`);
        }
      }
    }

    // 5. マッチ数が多すぎる場合は追加条件を適用
    if (matchingIndexes.length > 200) {
      console.log('[IndexedMatcher] ⚠️ マッチ数が多すぎるため追加フィルタリング');

      // 強度条件を追加
      if (this.indexes.strength[conditions.strength]) {
        const strengthSet = new Set(this.indexes.strength[conditions.strength]);
        matchingIndexes = matchingIndexes.filter(idx => strengthSet.has(idx));
        console.log(`[IndexedMatcher] 🔄 フィルタ後: ${matchingIndexes.length}件`);
      }
    }

    const searchTime = Date.now() - searchStart;
    console.log(`[IndexedMatcher] ⚡ インデックス検索時間: ${searchTime}ms`);

    // 6. 実データを取得して詳細な類似度計算
    const detailedStart = Date.now();
    const matchingData = matchingIndexes.map(idx => this.dataMap.get(idx));

    // 詳細な類似度計算（既存のロジックを使用）
    const withSimilarity = matchingData.map(data => {
      const similarity = similarityCalculator.calculateSimilarity(
        currentSituation,
        data,
        timeframe
      );
      return {
        pattern: data,
        similarity: similarity,
        result: data[`result${timeframe}s`]
      };
    });

    // 類似度でソート
    withSimilarity.sort((a, b) => b.similarity - a.similarity);

    const detailedTime = Date.now() - detailedStart;
    const totalTime = Date.now() - searchStart;

    console.log(`[IndexedMatcher] ⚡ 詳細計算時間: ${detailedTime}ms (${matchingData.length}件)`);
    console.log(`[IndexedMatcher] ✅ 総処理時間: ${totalTime}ms`);
    console.log(`[IndexedMatcher] 📊 上位5件の類似度: [${withSimilarity.slice(0, 5).map(p => Math.round(p.similarity)).join(', ')}]`);

    return withSimilarity;
  }

  /**
   * モメンタムを分類（RSI + Stochastic）
   */
  _classifyMomentum(rsi, stochastic) {
    // RSIとStochasticのスコア化
    const rsiScore = this._normalizeIndicator(rsi, 0, 100);
    const stochScore = this._normalizeIndicator(stochastic, 0, 100);

    // 加重平均（RSI 60%, Stochastic 40%）
    const combined = rsiScore * 0.6 + stochScore * 0.4;

    // 5段階分類
    if (combined >= 0.75) return "強い買われすぎ";
    if (combined >= 0.6) return "買われすぎ";
    if (combined <= 0.25) return "強い売られすぎ";
    if (combined <= 0.4) return "売られすぎ";
    return "中立";
  }

  /**
   * トレンドを分類（MACD + ROC + MA Cross）
   */
  _classifyTrend(macdStrength, rocValue, maCross) {
    // 各指標のスコア化（-1〜1）
    const macdScore = this._normalizeTrendIndicator(macdStrength, -0.03, 0.03);
    const rocScore = this._normalizeTrendIndicator(rocValue, -0.8, 0.8);

    // MA Crossのスコア
    let maCrossScore = 0;
    if (maCross) {
      if (maCross.crossover === 'GOLDEN') {
        maCrossScore = 0.8;
      } else if (maCross.crossover === 'DEAD') {
        maCrossScore = -0.8;
      } else if (maCross.trend === 'UP') {
        maCrossScore = 0.3;
      } else if (maCross.trend === 'DOWN') {
        maCrossScore = -0.3;
      }
    }

    // 加重平均（MACD 40%, ROC 30%, MA Cross 30%）
    const combined = macdScore * 0.4 + rocScore * 0.3 + maCrossScore * 0.3;

    // 5段階分類
    if (combined >= 0.6) return "強い上昇";
    if (combined >= 0.2) return "上昇";
    if (combined <= -0.6) return "強い下降";
    if (combined <= -0.2) return "下降";
    return "横ばい";
  }

  /**
   * トレンド強度を分類（ADX）
   */
  _classifyStrength(adxValue) {
    if (adxValue >= 35) return "強い";
    if (adxValue <= 20) return "弱い";
    return "中";
  }

  /**
   * 指標を0-1に正規化
   */
  _normalizeIndicator(value, min, max) {
    if (value <= min) return 0;
    if (value >= max) return 1;
    return (value - min) / (max - min);
  }

  /**
   * トレンド指標を-1〜1に正規化
   */
  _normalizeTrendIndicator(value, min, max) {
    const normalized = (value - min) / (max - min); // 0-1
    return normalized * 2 - 1; // -1〜1
  }

  /**
   * 積集合を計算
   */
  _intersection(arrays) {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];

    // 最小の配列から始める（効率化）
    arrays.sort((a, b) => a.length - b.length);
    let result = new Set(arrays[0]);

    for (let i = 1; i < arrays.length; i++) {
      const currentSet = new Set(arrays[i]);
      result = new Set([...result].filter(id => currentSet.has(id)));

      // 早期終了（結果が空になった場合）
      if (result.size === 0) break;
    }

    return Array.from(result);
  }

  /**
   * 統計情報を取得
   */
  getStatistics() {
    return {
      ...this.stats,
      isIndexed: this.isIndexed
    };
  }

  /**
   * インデックスをクリア
   */
  clear() {
    this.data = [];
    this.dataMap.clear();
    this.indexes = {
      segment: {},
      momentum: {},
      trend: {},
      strength: {}
    };
    this.isIndexed = false;
    console.log('[IndexedMatcher] 🧹 インデックスをクリアしました');
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.IndexedPatternMatcher = IndexedPatternMatcher;
}
