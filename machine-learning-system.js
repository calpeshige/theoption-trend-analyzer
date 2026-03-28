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

    // 時間帯別分析モード
    this.timeFilterMode = 'all'; // 'all' | 'session' | 'hour'
    this.timeFilteredData = []; // 時間帯フィルタ後のデータ
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

  // v5.10.4: 手動データ整理（全通貨ペアを24,500件にトリミング）
  async trimAllAssets() {
    if (!this.dbInitialized) return { totalDeleted: 0, details: [] };
    const MAX_PER_ASSET = 24500;
    const details = [];
    let totalDeleted = 0;
    try {
      const assetList = await this.dbManager.getAssetList();
      console.error('[ML] trimAllAssets開始:', assetList.length, '通貨ペア');
      for (const { assetName, count } of assetList) {
        console.error(`[ML] チェック: ${assetName} = ${count}件`);
        if (count > MAX_PER_ASSET) {
          const deleted = await this.dbManager.pruneRecords(MAX_PER_ASSET, assetName);
          totalDeleted += deleted;
          details.push({ assetName, before: count, after: count - deleted, deleted });
          console.error(`[ML] トリミング完了: ${assetName} ${count}→${count - deleted}件 (${deleted}件削除)`);
        }
      }
      // DB総件数とメモリデータを更新
      if (totalDeleted > 0) {
        this.totalDataCount = await this.dbManager.getCount(this.assetName);
        await this.loadRecentData();
      }
      console.error(`[ML] trimAllAssets完了: 合計${totalDeleted}件削除`);
    } catch (e) {
      console.error('[ML] trimAllAssets error:', e);
    }
    return { totalDeleted, details };
  }

  // 既存のIndexedDBデータのassetNameを正規化
  // - undefinedや空のassetName → storageKeyから推測して設定
  // - アンダースコア形式 → スラッシュ形式に変換
  // メモリ効率化: 初回起動時のみ実行し、結果をフラグで記録
  async normalizeExistingAssetNames() {
    if (!this.dbInitialized) return;

    // 既に正規化済みの場合はスキップ
    const normalizedKey = `theoption_normalized_${this.assetName}`;
    const alreadyNormalized = localStorage.getItem(normalizedKey);
    if (alreadyNormalized === 'true') {
      mlsLog(`[ML Normalize] ✅ 既に正規化済み（スキップ）`);
      return;
    }

    try {
      // サンプリングで正規化が必要かチェック（最新100件のみ）
      const sampleRecords = await this.dbManager.getRecentRecords(this.assetName, 100);
      const needsNormalization = sampleRecords.some(r =>
        r.assetName === undefined ||
        r.assetName === null ||
        r.assetName === '' ||
        (typeof r.assetName === 'string' && r.assetName.includes('_') && !r.assetName.includes('/'))
      );

      if (!needsNormalization) {
        mlsLog(`[ML Normalize] ✅ サンプルチェック: 正規化不要`);
        localStorage.setItem(normalizedKey, 'true');
        return;
      }

      // 正規化が必要な場合のみ全データを読み込む
      console.log(`[ML Normalize] 🔄 正規化が必要 - 全データをチェック中...`);
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

      // 正規化完了フラグを保存
      localStorage.setItem(normalizedKey, 'true');
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
      // 全件数を取得（統計表示用）
      const totalCount = await this.dbManager.getCount(this.assetName);
      this.totalDataCount = totalCount;

      // メモリ効率化: 最大5000件に制限（安定動作のため）
      // 42000件等の大量データはブラウザをクラッシュさせるため
      const MAX_MEMORY_LOAD = 5000;
      const recentData = await this.dbManager.getRecentRecords(this.assetName, MAX_MEMORY_LOAD);
      this.trainingData = recentData;

      console.log(`[ML] ✅ データロード: 最新${recentData.length}件 (DB総データ: ${totalCount}件)`);

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
      // 総件数を通知（分析対象件数ではなく）
      if (this.onStatsUpdatedExternal) {
        this.onStatsUpdatedExternal(totalCount);
      }

      // v5.10.4: 鮮度キャッシュ更新（直近30日のデータ割合）
      try {
        const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recent30d = await this.dbManager.getRecordCountSince(since30d, this.assetName);
        this.cachedFreshness = {
          recent30d,
          total: totalCount,
          percent: totalCount > 0 ? Math.round((recent30d / totalCount) * 100) : 0
        };
      } catch (e) {
        // 鮮度計算エラーは無視
      }

      return recentData;
    } catch (e) {
      console.error('[ML] Load Data Failed:', e);
      return [];
    }
  }

  /**
   * 段階的にデータを取得（パターンマッチング用）
   * @param {number} count - 取得件数
   * @returns {Promise<Array>} データ配列
   */
  async loadDataForStage(count) {
    if (!this.dbInitialized) return this.trainingData;

    // 現在のメモリ上のデータで十分なら追加取得しない
    if (this.trainingData.length >= count) {
      return this.trainingData;
    }

    // 必要な分だけDBから取得
    try {
      const data = await this.dbManager.getRecentRecords(this.assetName, count);
      this.trainingData = data;
      console.log(`[ML] 📊 段階的取得: ${data.length}件をロード`);

      // Workerにもデータを送る
      if (this.patternMatcher) {
        this.patternMatcher.updateWorkerData(this.trainingData);
      }

      return data;
    } catch (e) {
      console.error('[ML] 段階的取得エラー:', e);
      return this.trainingData;
    }
  }

  // データ範囲の設定（段階的検索により全データを使用可能）
  // この設定は互換性のために残すが、実際の検索はPatternMatchingSystemの
  // 段階的検索アルゴリズムで効率化される
  setMaxDataCount(count) {
    this.maxDataCount = count;
    console.log(`[ML] データ範囲設定: ${count === 'all' ? '全期間' : count + '件'} (段階的検索で効率化)`);
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
      console.log(`[ML] ⏭️ データスキップ: 市場変動なし (総データ: ${this.trainingData.length}件)`);
      return null;
    }

    // メモリキャッシュに追加
    this.trainingData.push(situation);

    // 時間帯別モードの場合、新データを timeFilteredData にも追加
    let timeFilterUpdated = false;
    if (this.timeFilterMode !== 'all' && this.timeFilteredData) {
      // 新データの時間が現在のフィルタ条件に一致するかチェック
      const dataHour = situation.hour;
      const currentHour = new Date().getHours();

      let shouldAdd = false;
      if (this.timeFilterMode === 'hour') {
        // 時間帯モード: 現在時刻±2時間
        const targetHours = window.DBManager?.getHourRangeWithPriority?.(currentHour, 2) || [];
        shouldAdd = targetHours.includes(dataHour);
      } else if (this.timeFilterMode === 'session') {
        // セッションモード: 現在のセッションの時間帯
        const currentSession = window.DBManager?.getCurrentSession?.(currentHour);
        const sessions = window.DBManager?.getMarketSessions?.() || {};
        const sessionInfo = sessions[currentSession];
        shouldAdd = sessionInfo?.hours?.includes(dataHour) || false;
      }

      if (shouldAdd) {
        this.timeFilteredData.push(situation);
        timeFilterUpdated = true;
      }
    }

    // 時間帯別データが更新された場合、UIに通知
    if (timeFilterUpdated && this.onTimeFilterUpdated) {
      this.onTimeFilterUpdated(this.getTimeFilterInfo());
    }

    // DB保存（非同期、totalDataCountはsaveToStorage内で更新）
    this.saveToStorage(situation).then(() => {
      console.log(`[ML] ✅ データ追加: メモリ${this.trainingData.length}件, DB総計${this.totalDataCount}件, 時間帯別${this.timeFilteredData?.length || 0}件 (価格: ${situation.price})`);
    });

    // 結果記録スケジュール
    this.scheduleResultRecording(situation);

    return situation;
  }

  // DBに保存（単一レコード）
  async saveToStorage(record) {
    if (!this.dbInitialized) return;
    try {
      await this.dbManager.saveRecord(record);
      // DB実件数を取得して同期（通貨ペア別）
      this.totalDataCount = await this.dbManager.getCount(this.assetName);
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

  // DB総件数を返す（UIの「収集データ」表示用、現在の通貨ペアのみ）
  getDataCount() { return this.totalDataCount || 0; }
  getDataCountWithResults() { return this.trainingData.filter(d => !d.result15s?.pending).length; }

  // DB総件数を非同期で取得して更新（現在の通貨ペアのみ）
  async refreshTotalCount() {
    if (this.dbInitialized) {
      this.totalDataCount = await this.dbManager.getCount(this.assetName);
      console.log(`[ML] 📊 DB総件数を更新: ${this.assetName} = ${this.totalDataCount}件`);
    }
    return this.totalDataCount || 0;
  }

  // ========================================
  // 時間帯別分析機能
  // ========================================

  /**
   * 時間帯フィルタモードを設定
   * @param {string} mode - 'all' | 'session' | 'hour'
   */
  async setTimeFilterMode(mode) {
    this.timeFilterMode = mode;
    mlsLog(`[ML] 時間帯フィルタモード変更: ${mode}`);

    if (mode === 'all') {
      // 全期間モード: フィルタなし
      this.timeFilteredData = this.trainingData;
    } else {
      // 時間帯別モード: データを再ロード
      await this.loadTimeFilteredData();
    }

    // Workerにフィルタ後のデータを送信
    if (this.patternMatcher) {
      this.patternMatcher.updateWorkerData(this.timeFilteredData, mode);
    }

    return this.timeFilteredData.length;
  }

  /**
   * 時間帯フィルタ済みデータをロード
   */
  async loadTimeFilteredData() {
    if (!this.dbInitialized) {
      this.timeFilteredData = [];
      return;
    }

    const currentHour = new Date().getHours();
    const currentSession = window.DBManager.getCurrentSession(currentHour);
    const sessions = window.DBManager.getMarketSessions();

    let targetHours = [];

    if (this.timeFilterMode === 'session') {
      // セッションモード: 現在のセッション全体 + 現在時刻±1.5時間を優先
      const sessionInfo = sessions[currentSession];
      targetHours = sessionInfo ? sessionInfo.hours : [];
      mlsLog(`[ML] セッションモード: ${currentSession} (${sessionInfo?.name}), 対象時間: ${targetHours.join(',')}`);
    } else if (this.timeFilterMode === 'hour') {
      // 時間帯モード: 現在時刻±2時間
      targetHours = window.DBManager.getHourRangeWithPriority(currentHour, 2);
      mlsLog(`[ML] 時間帯モード: 現在${currentHour}時, 対象時間: ${targetHours.join(',')}`);
    }

    try {
      this.timeFilteredData = await this.dbManager.getRecordsByHours(this.assetName, targetHours);
      mlsLog(`[ML] 時間帯フィルタ完了: ${this.timeFilteredData.length}件 (全${this.trainingData.length}件中)`);

      // データ不足時の段階的拡張
      const MIN_DATA_COUNT = 20;
      if (this.timeFilteredData.length < MIN_DATA_COUNT && this.timeFilterMode === 'hour') {
        mlsLog(`[ML] データ不足 (${this.timeFilteredData.length}件), セッション全体に拡張`);
        const sessionInfo = sessions[currentSession];
        if (sessionInfo) {
          this.timeFilteredData = await this.dbManager.getRecordsByHours(this.assetName, sessionInfo.hours);
          mlsLog(`[ML] セッション拡張後: ${this.timeFilteredData.length}件`);
        }
      }

      // それでも不足の場合はデータ不足として扱う（全データには戻さない）
      if (this.timeFilteredData.length < MIN_DATA_COUNT) {
        mlsLog(`[ML] ⚠️ データ不足: ${this.timeFilteredData.length}件 (最低${MIN_DATA_COUNT}件必要)`);
      }
    } catch (error) {
      console.error('[ML] 時間帯フィルタエラー:', error);
      this.timeFilteredData = [];
    }
  }

  /**
   * 時間帯フィルタ情報を取得
   */
  getTimeFilterInfo() {
    const currentHour = new Date().getHours();
    const currentSession = window.DBManager.getCurrentSession(currentHour);
    const sessions = window.DBManager.getMarketSessions();
    const sessionInfo = sessions[currentSession];

    return {
      mode: this.timeFilterMode,
      currentHour,
      currentSession,
      sessionName: sessionInfo?.name || '不明',
      filteredCount: this.timeFilteredData.length,
      totalCount: this.trainingData.length,
      targetHours: this.timeFilterMode === 'hour'
        ? window.DBManager.getHourRangeWithPriority(currentHour, 2)
        : (sessionInfo?.hours || [])
    };
  }

  /**
   * 分析用データを取得（フィルタモードに応じて返す）
   */
  getAnalysisData() {
    return this.timeFilterMode === 'all' ? this.trainingData : this.timeFilteredData;
  }
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
          // データ不足時のエラーは正常な動作の一部なのでwarnレベル
          console.warn('[ML Worker]', payload ? payload.error : 'データ処理中');
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

  updateWorkerData(data, timeFilterMode = 'all') {
    if (!this.worker) return;
    this.worker.postMessage({
      type: 'INIT',
      id: 'init_' + Date.now(),
      payload: {
        assetName: 'current',
        data: data,
        timeFilterMode: timeFilterMode
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

    // 🆕 時間帯別データ更新通知用コールバック
    this.dataSystem.onTimeFilterUpdated = (timeFilterInfo) => {
      mlsLog(`[ML] 🕐 Time filter updated: ${timeFilterInfo.filteredCount} records`);
      if (this.onTimeFilterUpdated) {
        this.onTimeFilterUpdated(timeFilterInfo);
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
    // totalDataCountはsetAssetName→loadRecentDataで既に設定されている
    console.log(`[ML] ✅ Initialize complete for ${assetName}, メモリ: ${this.dataSystem.trainingData.length}件, DB総計: ${this.dataSystem.totalDataCount}件`);
    if (this.onStatsUpdated) {
      this.onStatsUpdated(this.getStatistics());
    }
  }

  async setCurrentAsset(assetName) {
    await this.dataSystem.setAssetName(assetName);
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
    // 学習レベル: 25,000件で100%（UIの最大件数表示と一致）
    const learningLevel = Math.min(100, Math.round((totalCount / 25000) * 100));
    return {
      dataCount: totalCount,
      dataCountWithResults: count,
      learningLevel: learningLevel,
      status: count > 100 ? 'READY' : 'COLLECTING',
      accuracy: 0, // 計算コスト高いため省略
      freshness: this.dataSystem.cachedFreshness || null
    };
  }

  restoreResultsFromPriceHistory(priceHistory) {
    // 実装省略（必要なら追加）
    return 0;
  }

  getDataCount() { return this.dataSystem.getDataCount(); }
  getDataCountWithResults() { return this.dataSystem.getDataCountWithResults(); }

  // 時間帯別分析機能
  async setTimeFilterMode(mode) {
    return this.dataSystem.setTimeFilterMode(mode);
  }

  getTimeFilterInfo() {
    return this.dataSystem.getTimeFilterInfo();
  }

  getTimeFilterMode() {
    return this.dataSystem.timeFilterMode;
  }
}

// グローバルに公開
window.MachineLearningSystem = MachineLearningSystem;
