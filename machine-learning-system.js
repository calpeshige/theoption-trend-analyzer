/**
 * Machine Learning System
 * Version: 1.0.0
 *
 * 自動学習・予測システム
 * 外部AI不要、完全ブラウザ内で動作
 */

// ========================================
// デバッグモード設定
// ========================================
// グローバル変数として定義（他のファイルと共有）
if (typeof window.DEBUG_MODE === 'undefined') {
  window.DEBUG_MODE = true; // true=デバッグ表示, false=本番（ログなし）
}

if (!window.DEBUG_MODE) {
  console.log = () => {};
  console.warn = () => {};
  // console.errorはエラー確認のため残す
}
// ========================================

// ========================================
// 1. Data Collection System
// ========================================

class DataCollectionSystem {
  constructor() {
    this.trainingData = [];
    this.isCollecting = false;
    this.assetName = 'default';  // 通貨ペア名を保持
  }

  // 通貨ペア名を設定
  setAssetName(assetName) {
    this.assetName = assetName;
  }

  // 現在の状況を記録
  recordSituation(marketData, indicators) {
    const currentPrice = marketData.currentPrice;
    const timestamp = Date.now();

    const situation = {
      // タイムスタンプ
      timestamp: timestamp,

      // 基本データ
      price: currentPrice,

      // テクニカル指標
      rsi: indicators.rsi || 50,
      ma5: indicators.ma5 || currentPrice,
      ma20: indicators.ma20 || currentPrice,

      // 多次元指標
      macdStrength: indicators.multiDim?.breakdown.macd.strength || 0,
      adxValue: indicators.multiDim?.breakdown.adx.adx || 0,
      stochasticK: indicators.multiDim?.breakdown.stochastic.k || 50,
      atrPercent: indicators.multiDim?.breakdown.atr.atrPercent || 0,
      rocValue: indicators.multiDim?.breakdown.roc.roc || 0,
      sentimentScore: indicators.multiDim?.breakdown.sentiment.upRatio || 0.5,

      // 価格パターン特徴量（判定時間ごとに異なるデータ範囲を使用）
      pricePattern15s: indicators.pricePattern15s || this.getEmptyPricePattern(),
      pricePattern30s: indicators.pricePattern30s || this.getEmptyPricePattern(),
      pricePattern60s: indicators.pricePattern60s || this.getEmptyPricePattern(),
      pricePattern180s: indicators.pricePattern180s || this.getEmptyPricePattern(),
      pricePattern300s: indicators.pricePattern300s || this.getEmptyPricePattern(),

      // テクニカル指標の時系列データ（判定時間ごとに異なるデータ範囲を使用）
      techTimeSeries15s: indicators.techTimeSeries15s || this.getEmptyTechTimeSeries(),
      techTimeSeries30s: indicators.techTimeSeries30s || this.getEmptyTechTimeSeries(),
      techTimeSeries60s: indicators.techTimeSeries60s || this.getEmptyTechTimeSeries(),
      techTimeSeries180s: indicators.techTimeSeries180s || this.getEmptyTechTimeSeries(),
      techTimeSeries300s: indicators.techTimeSeries300s || this.getEmptyTechTimeSeries(),

      // 詳細セグメント分析データ（判定時間ごと）
      priceSegments15s: indicators.priceSegments15s || null,
      priceSegments30s: indicators.priceSegments30s || null,
      priceSegments60s: indicators.priceSegments60s || null,
      priceSegments180s: indicators.priceSegments180s || null,
      priceSegments300s: indicators.priceSegments300s || null,

      // 時間情報
      hour: new Date().getHours(),
      minute: new Date().getMinutes(),
      dayOfWeek: new Date().getDay(),

      // 結果（即座にプレースホルダーで記録、後で更新）
      result15s: {
        price: currentPrice,
        change: 0,
        changePercent: 0,
        direction: 'NEUTRAL',
        pending: true  // 未確定フラグ
      },
      result30s: {
        price: currentPrice,
        change: 0,
        changePercent: 0,
        direction: 'NEUTRAL',
        pending: true
      },
      result60s: {
        price: currentPrice,
        change: 0,
        changePercent: 0,
        direction: 'NEUTRAL',
        pending: true
      },
      result180s: {
        price: currentPrice,
        change: 0,
        changePercent: 0,
        direction: 'NEUTRAL',
        pending: true
      },
      result300s: {
        price: currentPrice,
        change: 0,
        changePercent: 0,
        direction: 'NEUTRAL',
        pending: true
      }
    };

    // ===== データ保存フィルター =====
    // 相場の動きが小さい場合はデータを保存しない（パフォーマンス最適化）
    const shouldSaveData = this.hasMarketMovement(situation);
    if (!shouldSaveData) {
      console.log('[ML] 📉 相場変動が閾値以下のためデータ保存をスキップ');
      return null; // データ未保存を示すためnullを返す
    }

    console.log('[ML] ✅ 相場変動検出 - データを保存');
    this.trainingData.push(situation);

    // メモリ制限: 60000件を超えたら重要度ベースでダウンサンプリング
    if (this.trainingData.length > 60000) {
      console.log(`[ML] メモリ上のデータが60000件を超えました。サンプリングを実行します...`);
      this.trainingData = this.intelligentSampling(this.trainingData, 50000);
    }

    // タイマーをセット（実際の結果で上書き）
    this.scheduleResultRecording(situation);

    // 即座に保存（結果はプレースホルダーだが、データは保存される）
    if (this.trainingData.length % 10 === 0) {
      this.saveToStorage(this.assetName);
    }

    return situation;
  }

  // 空の価格パターンを返す
  getEmptyPricePattern() {
    return {
      change10s: 0,
      change30s: 0,
      change60s: 0,
      changeFull: 0,
      trendSlope: 0,
      trendDirection: 'NEUTRAL',
      trendStrength: 0,
      upRatio: 0.5,
      acceleration: 0,
      volatility: 0,
      patternType: 'NEUTRAL'
    };
  }

  // 空のテクニカル時系列データを返す
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

  /**
   * 相場に動きがあるかチェック（データ保存フィルター）
   * どれか1つの時間枠で動きがあるセグメントがあればtrue
   * @param {Object} situation - データポイント
   * @returns {boolean} 保存すべきデータならtrue
   */
  hasMarketMovement(situation) {
    const timeframes = [15, 30, 60, 180, 300];

    for (const tf of timeframes) {
      const segments = situation[`priceSegments${tf}s`];

      // セグメントデータが存在しない場合はスキップ
      if (!segments || !segments.segments || !Array.isArray(segments.segments)) {
        continue;
      }

      // セグメント配列をチェック
      for (const segment of segments.segments) {
        // UPまたはDOWNのセグメントが1つでもあれば「動きあり」
        if (segment.direction === 'UP' || segment.direction === 'DOWN') {
          console.log(`[ML] 🎯 ${tf}秒セグメント${segment.index}で動き検出: ${segment.direction} (${(segment.changePercent * 100).toFixed(4)}%)`);
          return true;
        }
      }
    }

    // 全時間枠で全セグメントがFLAT → 動きなし
    console.log('[ML] 全時間枠でFLAT判定');
    return false;
  }

  // 結果記録のスケジュール
  scheduleResultRecording(situation) {
    const timeframes = [15, 30, 60, 180, 300];

    timeframes.forEach(seconds => {
      setTimeout(() => {
        this.recordResult(situation, seconds);
      }, seconds * 1000);
    });
  }

  // 結果を記録（プレースホルダーを実際の値で上書き）
  recordResult(situation, seconds) {
    const currentPrice = window.theOptionCurrentPrice || situation.price;
    const change = currentPrice - situation.price;
    const changePercent = (change / situation.price) * 100;
    const direction = change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'NEUTRAL';

    // 実際の結果で上書き（pendingフラグを削除）
    situation[`result${seconds}s`] = {
      price: currentPrice,
      change: change,
      changePercent: changePercent,
      direction: direction,
      pending: false  // 確定済み
    };

    // 全タイムフレームの結果が確定したら保存
    const allConfirmed = [15, 30, 60, 180, 300].every(tf =>
      situation[`result${tf}s`] && !situation[`result${tf}s`].pending
    );

    if (allConfirmed) {
      console.log(`[ML] データID ${situation.timestamp}: 全結果確定 - 保存`);
      this.saveToStorage(this.assetName);
    }
  }

  // ストレージに保存（通貨ペア別）- 重要度ベースサンプリング
  saveToStorage(assetName = 'default') {
    try {
      // Extension contextが有効かチェック
      if (!chrome.runtime?.id) {
        console.warn(`[ML] ⚠️ 拡張機能のコンテキストが無効です。localStorageにフォールバックします。`);
        throw new Error('Extension context invalidated');
      }

      const storageKey = `theoption_ml_${assetName.replace(/[\/\s]/g, '_')}`;

      // 重要度ベースのサンプリング（50000件まで保存）
      const dataToSave = this.intelligentSampling(this.trainingData, 50000);

      chrome.storage.local.set({
        [storageKey]: dataToSave
      }, () => {
        if (chrome.runtime?.lastError) {
          console.warn(`[ML] Chrome storage エラー: ${chrome.runtime.lastError.message}`);
          // localStorageにフォールバック
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
          console.log(`[ML] ${assetName}: ${dataToSave.length}件のデータを保存しました（localStorage）`);
        } else {
          // データサイズを計算
          const dataStr = JSON.stringify(dataToSave);
          const dataSizeKB = (dataStr.length / 1024).toFixed(2);
          const dataSizeMB = (dataStr.length / 1024 / 1024).toFixed(2);
          console.log(`[ML] 💾 ${assetName}: ${dataToSave.length}件のデータを保存しました（元: ${this.trainingData.length}件）`);
          console.log(`[ML] 💾 データサイズ: ${dataSizeKB} KB (${dataSizeMB} MB)`);
        }
      });
    } catch (e) {
      // フォールバック: localStorage
      const storageKey = `theoption_ml_${assetName.replace(/[\/\s]/g, '_')}`;
      const dataToSave = this.intelligentSampling(this.trainingData, 50000);
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      console.log(`[ML] ${assetName}: ${dataToSave.length}件のデータを保存しました（localStorage、理由: ${e.message}）`);
    }
  }

  // ストレージから読み込み（通貨ペア別）
  async loadFromStorage(assetName = 'default') {
    return new Promise((resolve) => {
      try {
        // Extension contextが有効かチェック
        if (!chrome.runtime?.id) {
          console.warn(`[ML] ⚠️ 拡張機能のコンテキストが無効です。localStorageから読み込みます。`);
          throw new Error('Extension context invalidated');
        }

        const storageKey = `theoption_ml_${assetName.replace(/[\/\s]/g, '_')}`;
        chrome.storage.local.get([storageKey], (result) => {
          if (chrome.runtime?.lastError) {
            console.warn(`[ML] Chrome storage エラー: ${chrome.runtime.lastError.message}`);
            // localStorageから読み込み
            const data = localStorage.getItem(storageKey);
            if (data) {
              this.trainingData = JSON.parse(data);
              console.log(`[ML] ${assetName}: ${this.trainingData.length}件のデータを読み込みました（localStorage）`);
            }
            resolve();
          } else if (result[storageKey]) {
            this.trainingData = result[storageKey];
            console.log(`[ML] ${assetName}: ${this.trainingData.length}件のデータを読み込みました`);
            resolve();
          } else {
            console.log(`[ML] ${assetName}: 新規データ収集を開始します`);
            resolve();
          }
        });
      } catch (e) {
        // フォールバック: localStorage
        const storageKey = `theoption_ml_${assetName.replace(/[\/\s]/g, '_')}`;
        const data = localStorage.getItem(storageKey);
        if (data) {
          this.trainingData = JSON.parse(data);
          console.log(`[ML] ${assetName}: ${this.trainingData.length}件のデータを読み込みました（localStorage、理由: ${e.message}）`);
        }
        resolve();
      }
    });
  }

  getDataCount() {
    return this.trainingData.length;
  }

  /**
   * 結果が揃っているデータ数を取得（予測に使用可能なデータ数）
   */
  getDataCountWithResults() {
    return this.trainingData.filter(d => {
      // 最低限15秒の結果があり、かつ確定済み（pending=falseまたは未定義）
      return d.result15s !== null &&
             d.result15s !== undefined &&
             (d.result15s.pending === false || d.result15s.pending === undefined);
    }).length;
  }

  /**
   * 価格履歴から過去データの結果を復元
   * ブラウザ更新でsetTimeoutが消えた場合に、既存データの結果を補完
   */
  restoreResultsFromPriceHistory(priceHistory) {
    if (!priceHistory || priceHistory.length === 0) {
      return;
    }

    let restoredCount = 0;
    const timeframes = [15, 30, 60, 180, 300];

    // 各学習データについて、結果が未設定の場合は復元を試みる
    for (const situation of this.trainingData) {
      // 既に全ての結果が揃っている場合はスキップ
      const hasAllResults = timeframes.every(tf => situation[`result${tf}s`]);
      if (hasAllResults) continue;

      // タイムスタンプから価格履歴のインデックスを探す
      const situationTime = situation.timestamp;

      // 価格履歴には timestamp がない可能性があるので、
      // trainingData のタイムスタンプと現在時刻から推測
      // （簡易実装：最新のデータから順に処理されると仮定）

      // より確実な方法：situation.priceと一致する価格を探す
      const matchIndex = priceHistory.findIndex((p, idx) => {
        // 価格が完全一致、または非常に近い（0.001以内）
        return Math.abs(p - situation.price) < 0.001;
      });

      if (matchIndex === -1) continue;

      // 各タイムフレームの結果を復元
      let situationUpdated = false;
      timeframes.forEach(seconds => {
        const resultKey = `result${seconds}s`;
        const existingResult = situation[resultKey];

        // pendingではない確定済みの結果がある場合はスキップ
        if (existingResult && !existingResult.pending) return;

        // seconds秒後の価格を取得（1秒 = 1インデックスと仮定）
        const futureIndex = matchIndex + seconds;
        if (futureIndex >= priceHistory.length) return;

        const futurePrice = priceHistory[futureIndex];
        const change = futurePrice - situation.price;
        const changePercent = (change / situation.price) * 100;
        const direction = change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'NEUTRAL';

        // 復元した結果は確定済み（pending=false）としてマーク
        situation[resultKey] = {
          price: futurePrice,
          change: change,
          changePercent: changePercent,
          direction: direction,
          pending: false
        };

        situationUpdated = true;
      });

      if (situationUpdated) {
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      console.log(`[ML] ✨ 価格履歴から ${restoredCount} 件のデータ結果を復元しました`);
      // 復元したデータを保存
      this.saveToStorage(this.assetName);
    }

    return restoredCount;
  }

  // データの重要度を計算（価値の高いデータを優先保存）
  calculateImportance(data) {
    let importance = 0;

    // 1. 大きな価格変動は重要（ボラティリティが高い）
    if (data.result15s) {
      const changePercent = Math.abs(data.result15s.changePercent || 0);
      importance += changePercent * 10; // 変動率が高いほど重要
    }

    // 2. 明確なトレンド（上昇/下降）は重要
    const hasTrend = data.result15s?.direction !== 'NEUTRAL' ||
                     data.result30s?.direction !== 'NEUTRAL' ||
                     data.result60s?.direction !== 'NEUTRAL';
    if (hasTrend) importance += 5;

    // 3. 極端な指標値は重要（RSI 70以上/30以下、ADX高い等）
    if (data.rsi > 70 || data.rsi < 30) importance += 3;
    if (data.adxValue > 25) importance += 2;

    // 4. 全タイムフレームの結果が揃っているデータは重要
    const hasAllResults = data.result15s && data.result30s &&
                         data.result60s && data.result180s && data.result300s;
    if (hasAllResults) importance += 3;

    // 5. 最近のデータは重要（時間経過で減衰）
    const age = Date.now() - data.timestamp;
    const daysSinceRecord = age / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 5 - daysSinceRecord * 0.1); // 50日で0になる
    importance += recencyBonus;

    return importance;
  }

  // 重要度ベースのサンプリング（50000件を超えたらダウンサンプリング）
  intelligentSampling(data, targetSize = 50000) {
    if (data.length <= targetSize) {
      return data; // そのまま返す
    }

    console.log(`[ML] データ量が${data.length}件を超えたため、重要度ベースで${targetSize}件にサンプリングします`);

    // 各データに重要度を付与
    const dataWithImportance = data.map(item => ({
      data: item,
      importance: this.calculateImportance(item)
    }));

    // 重要度でソート（降順）
    dataWithImportance.sort((a, b) => b.importance - a.importance);

    // 上位を確実に残す（重要度TOP 30000件）
    const topData = dataWithImportance.slice(0, Math.floor(targetSize * 0.6));

    // 残りはランダムサンプリング（多様性を確保）
    const remaining = dataWithImportance.slice(Math.floor(targetSize * 0.6));
    const randomSampled = [];
    const randomCount = targetSize - topData.length;

    for (let i = 0; i < randomCount && i < remaining.length; i++) {
      const randomIndex = Math.floor(Math.random() * remaining.length);
      randomSampled.push(remaining.splice(randomIndex, 1)[0]);
    }

    // 結合してタイムスタンプでソート（時系列順に戻す）
    const result = [...topData, ...randomSampled]
      .map(item => item.data)
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[ML] サンプリング完了: ${result.length}件（重要度TOP: ${topData.length}件, ランダム: ${randomSampled.length}件）`);

    return result;
  }
}

// ========================================
// 2. Pattern Matching System
// ========================================

class PatternMatchingSystem {
  constructor(trainingData) {
    this.trainingData = trainingData;

    // セグメント分析システムを初期化
    this.segmentAnalyzer = new DetailedSegmentAnalyzer();
    this.similarityCalculator = new SegmentSimilarityCalculator();
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
      console.log(`[ML] 🔍 findSimilarPatterns開始: timeframe=${timeframe}s, minSimilarity=${minSimilarity}%`);
      console.log(`[ML] 📊 データ範囲: 直近${maxDataCount}件指定 → 実際の検索対象=${targetDataWithResults}件（結果記録済み） / 総数=${totalDataCount}件`);
    } else {
      console.log(`[ML] 🔍 findSimilarPatterns開始: timeframe=${timeframe}s, minSimilarity=${minSimilarity}%`);
      console.log(`[ML] 📊 データ範囲: 全期間使用 → 検索対象=${dataWithResults}件（結果記録済み） / 総数=${totalDataCount}件`);
    }

    // 全件検索（データ件数制限を適用）
    console.log('[ML] 🔍 全件検索を使用');
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

    console.log(`[ML] 🔍 フィルタリング結果: チェック=${totalChecked}件, 閾値通過=${passedThreshold}件, minSimilarity=${minSimilarity}%`);

    // 🔬 診断: 類似度の分布を確認
    if (allSimilarities.length > 0) {
      allSimilarities.sort((a, b) => b - a);
      const above70 = allSimilarities.filter(s => s >= 70).length;
      const above60 = allSimilarities.filter(s => s >= 60).length;
      const above50 = allSimilarities.filter(s => s >= 50).length;
      console.log(`[🔬 診断] 類似度分布: 最大=${Math.round(allSimilarities[0])}%, 70%以上=${above70}件, 60%以上=${above60}件, 50%以上=${above50}件`);
      console.log(`[🔬 診断] 上位10件の類似度:`, allSimilarities.slice(0, 10).map(s => Math.round(s)));
    }

    // 類似度でソート
    similarPatterns.sort((a, b) => b.similarity - a.similarity);

    // 上位5件の類似度をログ出力
    const top5Similarities = similarPatterns.slice(0, 5).map(p => Math.round(p.similarity));
    console.log(`[ML] 📊 上位5件の類似度: [${top5Similarities.join(', ')}]`);

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
    console.log(`[ML] ✅ 返却するパターン数: ${result.length}件 (閾値${minSimilarity}%の上限${maxPatterns}件)`);

    // 詳細スコア内訳を出力（閾値通過した上位5件のみ）
    // _detailedSamplesには閾値未満のデータも含まれているため、フィルタリングが必要
    if (this._detailedSamples && this._detailedSamples.length > 0) {
      // 類似度が閾値以上のサンプルのみ抽出
      const validSamples = this._detailedSamples.filter(s => s.similarity >= minSimilarity);

      if (validSamples.length > 0) {
        console.log(`[ML] 🔬 ========== 上位5件のスコア詳細分析 ==========`);
        validSamples.forEach((sample, index) => {
          console.log(`[ML] 🔬 [${index + 1}] 類似度: ${sample.similarity}% (${sample.totalScore}/${sample.maxScore}点)`);

          // テクニカル指標スコア表示
          if (sample.breakdown.rsi) {
            console.log(`[ML] 🔬     テクニカル指標: ${sample.techScore}/30点 | RSI=${sample.breakdown.rsi.score} MACD=${sample.breakdown.macd.score} ROC=${sample.breakdown.roc.score} MA=${sample.breakdown.maCross.score} Stoch=${sample.breakdown.stochastic.score} ADX=${sample.breakdown.adx.score}`);
          }

          // 価格セグメントスコア表示（新システム専用）
          if (sample.breakdown.priceSegments) {
            const ps = sample.breakdown.priceSegments;

            // 低ボラティリティ判定の表示
            if (ps.lowVolatility) {
              console.log(`[ML] 🔬     価格セグメント: 0/40点 | ⚠️ 低ボラティリティ除外`);
              console.log(`[ML] 🔬       └─ 理由: ${ps.reason || 'アクティブセグメント不足'}`);
            } else {
              console.log(`[ML] 🔬     価格セグメント: ${sample.priceSegmentScore}/40点 | 強化=${ps.enhancedScore.toFixed(1)}% パターン=${ps.patternScore.toFixed(1)}%`);
              console.log(`[ML] 🔬       ├─ アクティブセグメント: ${ps.activeSegments || 'N/A'}/6 (${ps.activeRatio ? (ps.activeRatio*100).toFixed(0) : 'N/A'}%)`);
              console.log(`[ML] 🔬       ├─ 一致パターン: ${ps.patternType} (セグメント[${ps.matches.join(',')}])`);
              console.log(`[ML] 🔬       ├─ 評価軸: 直近性=${ps.details.recency.toFixed(0)}% 連続性=${ps.details.continuity.toFixed(0)}% カバー率=${ps.details.coverage.toFixed(0)}%`);
              console.log(`[ML] 🔬       └─ 一致レベル: ${ps.details.matchLevels.join(' → ')}`);
            }
          }
        });
        console.log(`[ML] 🔬 =============================================`);
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
    console.log(`[ML] 予測実行: timeframe=${timeframe}s, 閾値=${minSimilarity}%, 結果記録済み=${dataWithResults}件, 類似パターン=${similarPatterns.length}件`);

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
    console.log(`[ML] 🎯 predictWithThreshold呼び出し: timeframe=${timeframe}s, minSimilarity=${minSimilarity}%`);
    const result = this.predict(currentSituation, timeframe, minSimilarity);
    console.log(`[ML] 🎯 predictWithThreshold結果:`, result);
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

// ========================================
// 3. Integrated ML System
// ========================================

class MachineLearningSystem {
  constructor() {
    this.assetSystems = {};  // 通貨ペアごとのMLシステム
    this.currentAsset = null;
  }

  // 通貨ペアを設定
  setCurrentAsset(assetName) {
    if (!assetName || assetName === 'UNKNOWN') {
      console.warn('[ML] 通貨ペアが不明です');
      return;
    }

    // 新しい通貨ペアの場合、システムを作成
    if (!this.assetSystems[assetName]) {
      console.log(`[ML] ${assetName} 用のシステムを作成`);
      this.assetSystems[assetName] = {
        dataCollector: new DataCollectionSystem(),
        patternMatcher: null,
        isReady: false
      };
    }

    this.currentAsset = assetName;
  }

  // 現在の通貨ペアのシステムを取得
  getCurrentSystem() {
    if (!this.currentAsset || !this.assetSystems[this.currentAsset]) {
      return null;
    }
    return this.assetSystems[this.currentAsset];
  }

  async initialize(assetName = null) {
    if (assetName) {
      this.setCurrentAsset(assetName);
    }

    const system = this.getCurrentSystem();
    if (!system) {
      console.warn('[ML] 初期化失敗: 通貨ペアが設定されていません');
      return false;
    }

    // DataCollectionSystemに通貨ペア名をセット
    system.dataCollector.setAssetName(this.currentAsset);

    // ストレージから通貨ペア別にデータを読み込み
    await system.dataCollector.loadFromStorage(this.currentAsset);
    system.patternMatcher = new PatternMatchingSystem(system.dataCollector.trainingData);
    system.isReady = system.dataCollector.getDataCount() >= 100;

    console.log(`[ML] ${this.currentAsset} 初期化完了 - データ数: ${system.dataCollector.getDataCount()}件`);

    return system.isReady;
  }

  /**
   * 価格履歴から過去のMLデータの結果を復元
   * ブラウザ更新後に呼び出す
   */
  restoreResultsFromPriceHistory(priceHistory) {
    const system = this.getCurrentSystem();
    if (!system) {
      console.warn('[ML] 結果復元失敗: システムが初期化されていません');
      return 0;
    }

    const restoredCount = system.dataCollector.restoreResultsFromPriceHistory(priceHistory);

    // 結果が復元された場合、PatternMatcherを再構築
    if (restoredCount > 0) {
      system.patternMatcher = new PatternMatchingSystem(system.dataCollector.trainingData);

      // 結果が揃ったデータが100件以上あるかチェック
      const dataWithResults = system.dataCollector.trainingData.filter(d => {
        return d.result15s && d.result30s && d.result60s && d.result180s && d.result300s;
      }).length;

      if (dataWithResults >= 100) {
        system.isReady = true;
        console.log(`[ML] ${this.currentAsset} が使用可能になりました（結果あり: ${dataWithResults}件）`);
      }
    }

    return restoredCount;
  }

  // データ収集を開始
  startCollecting(marketData, indicators) {
    const system = this.getCurrentSystem();
    if (!system) {
      console.warn('[ML] データ収集失敗: システムが初期化されていません');
      return null;
    }

    return system.dataCollector.recordSituation(marketData, indicators);
  }

  // 予測を実行
  predictAll(currentSituation, threshold = 50, maxDataCount = null) {
    const system = this.getCurrentSystem();
    if (!system) {
      return {
        status: 'NOT_READY',
        dataCount: 0,
        dataCountWithResults: 0,
        searchedDataCount: 0,
        required: 100
      };
    }

    const dataCount = system.dataCollector.getDataCount();
    const dataCountWithResults = system.dataCollector.getDataCountWithResults();

    // isReadyを動的に更新（結果があるデータが100件以上でREADY）
    if (dataCountWithResults >= 100 && !system.isReady) {
      system.isReady = true;
      system.patternMatcher = new PatternMatchingSystem(system.dataCollector.trainingData);
      console.log(`[ML] ${this.currentAsset} が100件到達！予測を開始します（結果あり: ${dataCountWithResults}件 / 総数: ${dataCount}件）`);
    }

    if (!system.isReady) {
      return {
        status: 'NOT_READY',
        dataCount: dataCount,
        dataCountWithResults: dataCountWithResults,
        searchedDataCount: 0,
        required: 100
      };
    }

    // 検索対象データ数を計算
    let searchedDataCount = dataCountWithResults;
    if (maxDataCount !== null && maxDataCount > 0) {
      searchedDataCount = Math.min(dataCountWithResults, maxDataCount);
    }

    const timeframes = [15, 30, 60, 180, 300];
    const predictions = {};

    timeframes.forEach(tf => {
      predictions[`${tf}s`] = system.patternMatcher.predict(currentSituation, tf, threshold, maxDataCount);
    });

    return {
      status: 'READY',
      dataCount: dataCount,
      dataCountWithResults: dataCountWithResults,
      searchedDataCount: searchedDataCount,
      dataLimit: maxDataCount,
      predictions
    };
  }

  // 選択中の時間枠のみ予測（パフォーマンス最適化: CPU負荷80%削減）
  predictOne(currentSituation, timeframe, threshold = 50, maxDataCount = null) {
    const system = this.getCurrentSystem();
    if (!system) {
      return {
        status: 'NOT_READY',
        dataCount: 0,
        dataCountWithResults: 0,
        searchedDataCount: 0,
        required: 100
      };
    }

    const dataCount = system.dataCollector.getDataCount();
    const dataCountWithResults = system.dataCollector.getDataCountWithResults();

    // isReadyを動的に更新（結果があるデータが100件以上でREADY）
    if (dataCountWithResults >= 100 && !system.isReady) {
      system.isReady = true;
      system.patternMatcher = new PatternMatchingSystem(system.dataCollector.trainingData);
      console.log(`[ML] ${this.currentAsset} が100件到達！予測を開始します（結果あり: ${dataCountWithResults}件 / 総数: ${dataCount}件）`);
    }

    if (!system.isReady) {
      return {
        status: 'NOT_READY',
        dataCount: dataCount,
        dataCountWithResults: dataCountWithResults,
        searchedDataCount: 0,
        required: 100
      };
    }

    // 検索対象データ数を計算
    let searchedDataCount = dataCountWithResults;
    if (maxDataCount !== null && maxDataCount > 0) {
      searchedDataCount = Math.min(dataCountWithResults, maxDataCount);
    }

    // 選択中の時間枠のみ予測
    const predictions = {};
    predictions[`${timeframe}s`] = system.patternMatcher.predict(currentSituation, timeframe, threshold, maxDataCount);

    return {
      status: 'READY',
      dataCount: dataCount,
      dataCountWithResults: dataCountWithResults,
      searchedDataCount: searchedDataCount,
      dataLimit: maxDataCount,
      predictions
    };
  }

  // 指定された閾値で予測を実行
  predictWithThreshold(currentSituation, timeframe, threshold, maxDataCount = null) {
    console.log(`[ML] 🔧 MachineLearningSystem.predictWithThreshold呼び出し: timeframe=${timeframe}s, threshold=${threshold}%, maxDataCount=${maxDataCount}`);
    const system = this.getCurrentSystem();
    if (!system || !system.isReady) {
      console.warn(`[ML] ⚠️ システム未初期化: system=${!!system}, isReady=${system?.isReady}`);
      return {
        prediction: 'INSUFFICIENT_DATA',
        confidence: 0,
        sampleSize: 0,
        reason: 'システム未初期化'
      };
    }

    console.log(`[ML] ✅ PatternMatcher.predict を呼び出します`);
    const result = system.patternMatcher.predict(currentSituation, timeframe, threshold, maxDataCount);
    console.log(`[ML] ✅ MachineLearningSystem.predictWithThreshold結果:`, result);
    return result;
  }

  // データ件数を取得
  getDataCount() {
    const system = this.getCurrentSystem();
    if (!system) {
      return 0;
    }
    return system.dataCollector.getDataCount();
  }

  // 統計情報を取得
  getStatistics() {
    const system = this.getCurrentSystem();
    if (!system) {
      return {
        dataCount: 0,
        dataCountWithResults: 0,
        accuracy: null,
        isReady: false
      };
    }

    const dataCount = system.dataCollector.getDataCount();
    const dataCountWithResults = system.dataCollector.getDataCountWithResults();

    if (dataCount === 0) {
      return {
        dataCount: 0,
        dataCountWithResults: 0,
        accuracy: 0,
        status: 'NO_DATA'
      };
    }

    // 学習レベル計算（最大50,000件基準）
    // 100件で学習開始、50,000件で最高レベル到達
    let learningLevel = 0;

    if (dataCountWithResults >= 50000) {
      learningLevel = 100;  // 最高レベル
    } else if (dataCountWithResults >= 100) {
      // 100件〜50,000件の間で0〜100%のスケール
      learningLevel = Math.round((dataCountWithResults / 50000) * 100);
    } else {
      // 100件未満は0%
      learningLevel = 0;
    }

    return {
      dataCount,
      dataCountWithResults,
      learningLevel: learningLevel,  // 学習レベル（0-100%）
      status: dataCountWithResults >= 100 ? 'READY' : 'COLLECTING',
      requiredData: Math.max(0, 100 - dataCountWithResults)
    };
  }

}

// グローバルスコープに公開
if (typeof window !== 'undefined') {
  window.MachineLearningSystem = MachineLearningSystem;
  window.DataCollectionSystem = DataCollectionSystem;
  window.PatternMatchingSystem = PatternMatchingSystem;
}
