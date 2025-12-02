/**
 * Machine Learning System (Optimized)
 * Version: 2.1.0
 * 
 * - IndexedDB for asynchronous storage
 * - Web Worker for background pattern matching
 * - Restored MachineLearningSystem class for compatibility
 */

// ========================================
// デバッグモード設定
// ========================================
if (typeof window.DEBUG_MODE === 'undefined') {
  window.DEBUG_MODE = false; // 本番ではfalse
}

// デバッグ用ログ関数
const mlsLog = window.DEBUG_MODE ? console.log.bind(console) : () => {};

// ========================================
// 1. Data Collection System (Optimized)
// ========================================

class DataCollectionSystem {
  constructor() {
    this.trainingData = []; // キャッシュ用（直近データのみ保持）
    this.isCollecting = false;
    this.assetName = 'default';

    // IndexedDBマネージャー
    this.dbManager = new window.DBManager();
    this.dbInitialized = false;
  }

  async initDB() {
    try {
      await this.dbManager.init();
      this.dbInitialized = true;
      mlsLog('[ML] IndexedDB initialized');

      // 🔧 既存のIndexedDBデータのassetName正規化
      await this.normalizeExistingAssetNames();

      // レガシーデータからの移行チェック
      await this.migrateFromLocalStorage();

      // 初期ロード
      await this.loadRecentData();
    } catch (e) {
      console.error('[ML] DB Init Failed:', e);
    }
  }

  // 既存のIndexedDBデータのassetNameを正規化
  // - undefinedや空のassetName → storageKeyから推測して設定
  // - アンダースコア形式 → スラッシュ形式に変換
  async normalizeExistingAssetNames() {
    if (!this.dbInitialized) return;

    try {
      // 全レコードを取得（assetNameフィルタなし）
      const allRecords = await this.dbManager.getAllRecords(null);
      mlsLog(`[ML Normalize] 🔍 Checking ${allRecords.length} existing records for assetName format...`);
      mlsLog(`[ML Normalize] 📋 Current assetName: "${this.assetName}"`);

      // assetNameの分布を確認
      const assetNameCounts = {};
      allRecords.forEach(r => {
        const name = r.assetName === undefined ? 'undefined' : (r.assetName === null ? 'null' : (r.assetName === '' ? 'empty' : r.assetName));
        assetNameCounts[name] = (assetNameCounts[name] || 0) + 1;
      });
      mlsLog(`[ML Normalize] 📊 AssetName distribution:`, assetNameCounts);

      // 修正が必要なレコードをフィルタ
      // 1. assetNameがundefined/null/空
      // 2. アンダースコア形式
      const recordsToUpdate = allRecords.filter(record => {
        // undefined, null, 空文字をチェック
        if (record.assetName === undefined || record.assetName === null || record.assetName === '') {
          return true;
        }
        // アンダースコア形式をチェック
        if (typeof record.assetName === 'string' && record.assetName.includes('_') && !record.assetName.includes('/')) {
          return true;
        }
        return false;
      });

      if (recordsToUpdate.length === 0) {
        mlsLog('[ML Normalize] ✅ All existing records already have correct assetName format');
        return;
      }

      // 統計
      const undefinedCount = recordsToUpdate.filter(r => r.assetName === undefined || r.assetName === null || r.assetName === '').length;
      const underscoreCount = recordsToUpdate.filter(r => typeof r.assetName === 'string' && r.assetName.includes('_')).length;
      mlsLog(`[ML Normalize] 🔄 Found ${recordsToUpdate.length} records needing normalization:`);
      mlsLog(`[ML Normalize]    - undefined/null/empty: ${undefinedCount}`);
      mlsLog(`[ML Normalize]    - underscore format: ${underscoreCount}`);

      // 正規化してバッチ更新
      const normalizedRecords = recordsToUpdate.map(record => {
        // assetNameがundefined/null/空の場合、現在のassetNameを使用
        if (record.assetName === undefined || record.assetName === null || record.assetName === '') {
          // this.assetNameが有効な場合のみ設定（"default"は無効とみなす）
          if (this.assetName && this.assetName !== 'default') {
            return { ...record, assetName: this.assetName };
          }
          // そうでない場合は後で修正されるのでスキップ
          return null;
        }
        // アンダースコア形式をスラッシュ形式に変換
        if (typeof record.assetName === 'string' && record.assetName.includes('_')) {
          return { ...record, assetName: record.assetName.replace(/_/g, '/') };
        }
        return record;
      }).filter(r => r !== null); // nullをフィルタ

      if (normalizedRecords.length === 0) {
        mlsLog('[ML Normalize] ⏭️ No records to update (waiting for valid assetName)');
        return;
      }

      // サンプルログ
      const samples = normalizedRecords.slice(0, 3).map(r => r.assetName);
      mlsLog(`[ML Normalize] 📋 Sample normalized assetNames:`, samples);

      // 保存（put操作なので同じtimestampのレコードは上書き）
      const savedCount = await this.dbManager.saveRecords(normalizedRecords);
      mlsLog(`[ML Normalize] ✅ Normalized ${savedCount} records in IndexedDB`);
    } catch (e) {
      console.error('[ML Normalize] ❌ Normalization failed:', e);
    }
  }

  // LocalStorage(chrome.storage.local)からのデータ移行
  async migrateFromLocalStorage() {
    mlsLog('[ML Migration] 🚀 migrateFromLocalStorage() called');

    if (!this.dbInitialized) {
      console.warn('[ML Migration] ⚠️ DB not initialized yet.');
      return;
    }

    try {
      mlsLog(`[ML Migration] 📋 Starting migration check for asset: "${this.assetName}"`);

      // 既にデータがあるか確認
      const count = await this.dbManager.getCount(this.assetName);
      mlsLog(`[ML Migration] 📊 Current IndexedDB count for "${this.assetName}": ${count}`);

      // キー名の形式を修正（/を_に置換）
      const sanitizedAssetName = this.assetName.replace(/\//g, '_');
      const storageKey = `theoption_ml_${sanitizedAssetName}`;
      mlsLog(`[ML Migration] 🔑 Looking for localStorage key: "${storageKey}"`);

      return new Promise((resolve) => {
        chrome.storage.local.get(null, async (allData) => {
          // デバッグ用：ML関連キーのみ表示
          const mlKeys = Object.keys(allData).filter(k => k.startsWith('theoption_ml_'));
          mlsLog('[ML Migration] 📦 ML keys in localStorage:', mlKeys);

          const legacyData = allData[storageKey];
          const legacyCount = legacyData && Array.isArray(legacyData) ? legacyData.length : 0;
          mlsLog(`[ML Migration] 🔍 Legacy data found: ${legacyCount} records`);

          // 条件: レガシーデータがIndexedDBより多い場合、または IndexedDBが100件未満の場合
          if (legacyCount > 0 && (legacyCount > count || count < 100)) {
            mlsLog(`[ML Migration] ✅ Migration needed: legacy(${legacyCount}) > indexedDB(${count}) OR indexedDB < 100`);
            mlsLog(`[ML Migration] 📥 Migrating ${legacyCount} records to IndexedDB...`);

            // 🔧 assetName を正規化
            // 1. assetNameが存在しない場合 → 現在の通貨ペア名を設定
            // 2. アンダースコア形式 → スラッシュ形式に変換 (例: "BTC_JPY" → "BTC/JPY")
            const normalizedData = legacyData.map(record => {
              // assetNameが存在しない場合、現在の通貨ペアを設定
              if (!record.assetName) {
                return { ...record, assetName: this.assetName };
              }
              // アンダースコア形式をスラッシュ形式に変換
              if (record.assetName.includes('_')) {
                const normalizedAssetName = record.assetName.replace(/_/g, '/');
                return { ...record, assetName: normalizedAssetName };
              }
              return record;
            });

            // サンプルログ（最初の5件のassetNameを表示）
            const sampleAssets = normalizedData.slice(0, 5).map(r => r.assetName);
            mlsLog(`[ML Migration] 📋 Sample assetNames after normalization:`, sampleAssets);

            // 一括保存（既存データとマージされる）
            const savedCount = await this.dbManager.saveRecords(normalizedData);
            mlsLog(`[ML Migration] ✅ Migration completed! Saved ${savedCount} records.`);

            // データ再ロードをトリガー
            await this.loadRecentData();
          } else if (legacyCount === 0) {
            mlsLog(`[ML Migration] ℹ️ No legacy data found for key "${storageKey}"`);
          } else {
            mlsLog(`[ML Migration] ⏭️ Skipping: IndexedDB(${count}) >= legacy(${legacyCount}) and count >= 100`);
          }
          resolve();
        });
      });
    } catch (e) {
      console.error('[ML Migration] ❌ Migration Failed:', e);
    }
  }

  async loadRecentData() {
    if (!this.dbInitialized) return;
    try {
      const allData = await this.dbManager.getAllRecords(this.assetName);
      this.trainingData = allData;
      mlsLog(`[ML] Loaded ${allData.length} records from DB for ${this.assetName}`);

      // Workerにもデータを送る
      if (this.patternMatcher) {
        this.patternMatcher.updateWorkerData(this.trainingData);
      }

      // データ更新を通知（内部コールバック）
      if (this.onDataUpdated) {
        this.onDataUpdated(this.trainingData);
      }

      // 🆕 外部統計通知（MachineLearningSystemから設定される）
      // マイグレーション後のUI更新を確実にするため
      if (this.onStatsUpdatedExternal) {
        this.onStatsUpdatedExternal(this.trainingData.length);
      }

      return allData;
    } catch (e) {
      console.error('[ML] Load Data Failed:', e);
      return [];
    }
  }

  async setAssetName(assetName) {
    this.assetName = assetName;

    // 🔧 通貨ペアが有効な場合、undefinedなassetNameを修正
    if (assetName && assetName !== 'default') {
      await this.normalizeExistingAssetNames();
    }

    // 通貨ペア変更時に移行チェック
    await this.migrateFromLocalStorage();

    // 通貨ペア変更時にデータ再ロード
    return this.loadRecentData();
  }

  // 現在の状況を記録
  recordSituation(marketData, indicators) {
    const currentPrice = marketData.currentPrice;
    const timestamp = Date.now();

    const situation = {
      timestamp: timestamp,
      assetName: this.assetName,
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

      // 価格パターン特徴量
      pricePattern15s: indicators.pricePattern15s || this.getEmptyPricePattern(),
      pricePattern30s: indicators.pricePattern30s || this.getEmptyPricePattern(),
      pricePattern60s: indicators.pricePattern60s || this.getEmptyPricePattern(),
      pricePattern180s: indicators.pricePattern180s || this.getEmptyPricePattern(),
      pricePattern300s: indicators.pricePattern300s || this.getEmptyPricePattern(),

      // テクニカル指標の時系列データ
      techTimeSeries15s: indicators.techTimeSeries15s || this.getEmptyTechTimeSeries(),
      techTimeSeries30s: indicators.techTimeSeries30s || this.getEmptyTechTimeSeries(),
      techTimeSeries60s: indicators.techTimeSeries60s || this.getEmptyTechTimeSeries(),
      techTimeSeries180s: indicators.techTimeSeries180s || this.getEmptyTechTimeSeries(),
      techTimeSeries300s: indicators.techTimeSeries300s || this.getEmptyTechTimeSeries(),

      // 詳細セグメント分析データ
      priceSegments15s: indicators.priceSegments15s || null,
      priceSegments30s: indicators.priceSegments30s || null,
      priceSegments60s: indicators.priceSegments60s || null,
      priceSegments180s: indicators.priceSegments180s || null,
      priceSegments300s: indicators.priceSegments300s || null,

      // 時間情報
      hour: new Date().getHours(),
      minute: new Date().getMinutes(),
      dayOfWeek: new Date().getDay(),

      // 結果（プレースホルダー）
      result15s: { pending: true, price: currentPrice, change: 0, changePercent: 0, direction: 'NEUTRAL' },
      result30s: { pending: true, price: currentPrice, change: 0, changePercent: 0, direction: 'NEUTRAL' },
      result60s: { pending: true, price: currentPrice, change: 0, changePercent: 0, direction: 'NEUTRAL' },
      result180s: { pending: true, price: currentPrice, change: 0, changePercent: 0, direction: 'NEUTRAL' },
      result300s: { pending: true, price: currentPrice, change: 0, changePercent: 0, direction: 'NEUTRAL' }
    };

    // フィルター
    if (!this.hasMarketMovement(situation)) {
      return null;
    }

    // メモリキャッシュに追加
    this.trainingData.push(situation);

    // DB保存（非同期）
    this.saveToStorage(situation);

    // 結果記録スケジュール
    this.scheduleResultRecording(situation);

    return situation;
  }

  // DBに保存（単一レコード）
  async saveToStorage(record) {
    if (!this.dbInitialized) return;
    try {
      await this.dbManager.saveRecord(record);

      // 定期的に古いデータを削除（例: 1%の確率で実行）
      if (Math.random() < 0.01) {
        this.dbManager.pruneRecords(50000, this.assetName);
      }
    } catch (e) {
      console.error('[ML] Save Error:', e);
    }
  }

  // 空の価格パターンを返す
  getEmptyPricePattern() {
    return {
      change10s: 0, change30s: 0, change60s: 0, changeFull: 0,
      trendSlope: 0, trendDirection: 'NEUTRAL', trendStrength: 0,
      upRatio: 0.5, acceleration: 0, volatility: 0, patternType: 'NEUTRAL'
    };
  }

  // 空のテクニカル時系列データを返す
  getEmptyTechTimeSeries() {
    const empty = { current: 0, start: 0, end: 0, trend: 'NEUTRAL', velocity: 0, change: 0, changePercent: 0, volatility: 0, range: 0, strength: 0 };
    return {
      rsi: { ...empty }, macd: { ...empty }, stochastic: { ...empty }, adx: { ...empty }, roc: { ...empty }, ma5: { ...empty }, ma20: { ...empty },
      maCross: { current: 'NEUTRAL', crossover: 'NONE', trend: 'NEUTRAL', strength: 0, divergence: 0 }
    };
  }

  hasMarketMovement(situation) {
    const timeframes = [15, 30, 60, 180, 300];
    for (const tf of timeframes) {
      const segments = situation[`priceSegments${tf}s`];
      if (!segments || !segments.segments) continue;
      for (const segment of segments.segments) {
        if (segment.direction === 'UP' || segment.direction === 'DOWN') return true;
      }
    }
    return false;
  }

  scheduleResultRecording(situation) {
    const timeframes = [15, 30, 60, 180, 300];
    timeframes.forEach(seconds => {
      setTimeout(() => {
        this.recordResult(situation, seconds);
      }, seconds * 1000);
    });
  }

  recordResult(situation, seconds) {
    const currentPrice = window.theOptionCurrentPrice || situation.price;
    const change = currentPrice - situation.price;
    const changePercent = (change / situation.price) * 100;
    const direction = change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'NEUTRAL';

    situation[`result${seconds}s`] = {
      price: currentPrice,
      change: change,
      changePercent: changePercent,
      direction: direction,
      pending: false
    };

    // 結果更新をDBに保存
    this.saveToStorage(situation);

    // 全結果確定時の処理
    const allConfirmed = [15, 30, 60, 180, 300].every(tf =>
      situation[`result${tf}s`] && !situation[`result${tf}s`].pending
    );

    if (allConfirmed) {
      // コールバックがあれば通知
      if (this.onDataUpdated) {
        this.onDataUpdated(this.trainingData);
      }
    }
  }

  getDataCount() { return this.trainingData.length; }
  getDataCountWithResults() { return this.trainingData.filter(d => !d.result15s?.pending).length; }
}

// ========================================
// 2. Pattern Matching System (Optimized with Worker)
// ========================================

class PatternMatchingSystem {
  constructor() {
    this.worker = null;
    this.initWorker();
  }

  async initWorker() {
    try {
      // Workerスクリプトのパス (scripts/ml-worker.jsを使用)
      const workerScriptPath = 'scripts/ml-worker.js';
      const workerUrl = chrome.runtime.getURL(workerScriptPath);

      // WorkerスクリプトをフェッチしてBlobを作成（CORS/CSP回避のため）
      const response = await fetch(workerUrl);
      let workerScript = await response.text();

      // importScriptsのパスを絶対パスに書き換え
      // '../detailed-segment-analyzer.js' -> 'chrome-extension://.../detailed-segment-analyzer.js'
      const baseUrl = chrome.runtime.getURL('');
      workerScript = workerScript.replace(
        /importScripts\s*\(([^)]+)\)/g,
        (match, args) => {
          const newArgs = args.split(',').map(arg => {
            const path = arg.trim().replace(/['"]/g, '');
            // 相対パスを解決（簡易的な処理）
            // ../foo.js -> foo.js (root relative to extension base)
            const cleanPath = path.replace(/^\.\.\//, '');
            return `'${baseUrl}${cleanPath}'`;
          }).join(',');
          return `importScripts(${newArgs})`;
        }
      );

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      this.worker = new Worker(blobUrl);

      this.worker.onmessage = (e) => {
        const { type, payload, id } = e.data;
        if (type === 'ERROR') {
          console.error('[ML Worker Error]', payload ? payload.error : 'Unknown error');
        } else if (type === 'INIT_COMPLETE') {
          mlsLog(`[ML Worker] Init complete: ${payload.count} records`);
        } else if (type === 'ADD_DATA_COMPLETE') {
          // mlsLog(`[ML Worker] Data added. Total: ${payload.count}`);
        }
      };

      mlsLog('[ML] Worker initialized via Blob');
    } catch (e) {
      console.error('[ML] Worker Init Failed:', e);
    }
  }

  updateWorkerData(data) {
    if (!this.worker) return;
    this.worker.postMessage({
      type: 'INIT',
      id: 'init_' + Date.now(),
      payload: {
        assetName: 'current',
        data: data
      }
    });
  }

  async predictAsync(currentSituation, timeframe = 15, minSimilarity = 50, maxDataCount = null) {
    if (!this.worker) return { prediction: 'ERROR', reason: 'Worker not initialized' };

    return new Promise((resolve, reject) => {
      const msgId = 'predict_' + Date.now() + '_' + Math.random();

      const handler = (e) => {
        const { type, payload, id } = e.data;
        if (id !== msgId) return; // ID不一致は無視

        if (type === 'PREDICT_RESULT') {
          this.worker.removeEventListener('message', handler);
          resolve(payload);
        } else if (type === 'ERROR') {
          this.worker.removeEventListener('message', handler);
          reject(payload);
        }
      };

      this.worker.addEventListener('message', handler);

      this.worker.postMessage({
        type: 'PREDICT',
        id: msgId,
        payload: {
          currentSituation,
          timeframe,
          threshold: minSimilarity,
          maxDataCount
        }
      });

      // タイムアウト設定（10秒 - データ量が多い場合は長めに）
      setTimeout(() => {
        this.worker.removeEventListener('message', handler);
        resolve({ prediction: 'TIMEOUT', reason: 'Worker timed out' });
      }, 10000);
    });
  }
}

// ========================================
// 3. Machine Learning System (Facade)
// ========================================

class MachineLearningSystem {
  constructor() {
    this.dataSystem = new DataCollectionSystem();
    this.patternMatcher = new PatternMatchingSystem();
    this.onStatsUpdated = null; // 外部通知用コールバック

    // データ更新時の連携
    this.dataSystem.onDataUpdated = (data) => {
      this.patternMatcher.updateWorkerData(data);

      // 統計情報の更新を通知
      if (this.onStatsUpdated) {
        this.onStatsUpdated(this.getStatistics());
      }
    };

    // 🆕 DataCollectionSystemからの外部統計通知用コールバック
    // マイグレーション後のUI更新を確実にするため（タイミング問題の解決）
    this.dataSystem.onStatsUpdatedExternal = (count) => {
      mlsLog(`[ML] 🔔 External stats notification: ${count} records`);
      if (this.onStatsUpdated) {
        this.onStatsUpdated(this.getStatistics());
      }
    };

    // 初期化
    this.dataSystem.initDB().then(() => {
      // 初期データをWorkerに送る
      this.patternMatcher.updateWorkerData(this.dataSystem.trainingData);
    });
  }

  async initialize(assetName) {
    await this.dataSystem.setAssetName(assetName);
    this.patternMatcher.updateWorkerData(this.dataSystem.trainingData);

    // 🆕 初期化完了後に統計を通知（onStatsUpdatedが設定された後のため確実）
    mlsLog(`[ML] ✅ Initialize complete for ${assetName}, data count: ${this.dataSystem.trainingData.length}`);
    if (this.onStatsUpdated) {
      this.onStatsUpdated(this.getStatistics());
    }
  }

  setCurrentAsset(assetName) {
    this.dataSystem.setAssetName(assetName);
  }

  startCollecting(marketData, indicators) {
    return this.dataSystem.recordSituation(marketData, indicators);
  }

  // 非同期予測（推奨）
  async predictAsync(currentSituation, timeframe, minSimilarity, maxDataCount) {
    return this.patternMatcher.predictAsync(currentSituation, timeframe, minSimilarity, maxDataCount);
  }

  // 互換性維持のためのメソッド（非同期に変更）
  // 注意: 呼び出し元は await する必要があります
  async predictOne(currentSituation, timeframe, minSimilarity, maxDataCount) {
    const result = await this.predictAsync(currentSituation, timeframe, minSimilarity, maxDataCount);

    // 旧形式のレスポンス構造に変換
    // キーは "15s" 形式の文字列（sendAnalysisToSidePanelとの互換性のため）
    const timeframeKey = `${timeframe}s`;
    return {
      status: result.prediction === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'READY',
      dataCount: this.dataSystem.getDataCount(),
      dataCountWithResults: this.dataSystem.getDataCountWithResults(),
      searchedDataCount: result.sampleSize || 0,
      predictions: {
        [timeframeKey]: {
          signal: result.prediction,
          confidence: result.confidence,
          prediction: result.prediction,
          upRate: result.upRate,
          downRate: result.downRate,
          sampleSize: result.sampleSize,
          topPatterns: result.topPatterns
        }
      }
    };
  }

  // 互換性維持のためのメソッド（非同期に変更）
  async predictWithThreshold(currentSituation, timeframe, similarityThreshold, dataLimit) {
    const result = await this.predictAsync(currentSituation, timeframe, similarityThreshold, dataLimit);
    return result; // predictWithThresholdは結果オブジェクトを直接返していた
  }

  getStatistics() {
    const count = this.dataSystem.getDataCountWithResults();
    const totalCount = this.dataSystem.getDataCount();
    // 学習レベル: 50,000件で100%（UIの最大件数表示と一致）
    const learningLevel = Math.min(100, Math.round((totalCount / 50000) * 100));
    return {
      dataCount: totalCount,
      dataCountWithResults: count,
      learningLevel: learningLevel,
      status: count > 100 ? 'READY' : 'COLLECTING',
      accuracy: 0 // 計算コスト高いため省略
    };
  }

  restoreResultsFromPriceHistory(priceHistory) {
    // 実装省略（必要なら追加）
    return 0;
  }

  getDataCount() { return this.dataSystem.getDataCount(); }
  getDataCountWithResults() { return this.dataSystem.getDataCountWithResults(); }
}

// グローバルに公開
window.MachineLearningSystem = MachineLearningSystem;
