/**
 * TheOption Trend Analyzer - Main Script
 * Version: 4.1.4 (バイアス表示版)
 *
 * 多次元指標分析 + 機械学習 + シンプルUI + 市場バイアス表示
 */

// ========================================
// デバッグモード設定
// ========================================
// グローバル変数として定義（他のファイルと共有）
if (typeof window.DEBUG_MODE === 'undefined') {
  window.DEBUG_MODE = false; // true=デバッグ表示, false=本番（ログなし）
}

if (!window.DEBUG_MODE) {
  console.log = () => { };
  console.warn = () => { };
  // console.errorはエラー確認のため残す
}
// ========================================

console.log('[TheOption Analyzer] 拡張機能を読み込みました v4.1.4 (バイアス表示版)');

// ========================================
// ライセンスチェック（非同期）
// ========================================
// license-manager.jsの初期化完了を待つ
(async function waitForLicense() {
  console.log('[TheOption Analyzer] ライセンス初期化を待機中...');

  // 既に初期化済みの場合
  if (window.licenseManager && window.licenseManager.isInitialized) {
    console.log('[TheOption Analyzer] ライセンスは既に初期化済み');
    checkLicenseAndStart();
    return;
  }

  // licenseReadyイベントを待つ
  window.addEventListener('licenseReady', function onLicenseReady(event) {
    console.log('[TheOption Analyzer] ライセンス初期化完了イベント受信:', event.detail);
    window.removeEventListener('licenseReady', onLicenseReady);
    checkLicenseAndStart();
  }, { once: true });
})();

function checkLicenseAndStart() {
  if (!window.licenseManager || !window.licenseManager.isLicenseValid) {
    console.warn('[TheOption Analyzer] ⚠️ ライセンスが無効なため、拡張機能を起動しません');
    return; // エラーではなく静かに終了
  }

  console.log('[TheOption Analyzer] ✅ ライセンス有効 - 拡張機能を起動します');
  initializeAnalyzer(); // 実際の初期化処理を呼び出す
}

// メイン初期化関数
function initializeAnalyzer() {

  // ========================================
  // デバッグ用グローバル関数（即座に定義）
  // ========================================

  // ストレージ容量確認用の関数をグローバルに公開
  window.checkMLStorage = function () {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.error('❌ chrome.storage が利用できません。コンテンツスクリプト内で実行してください。');
      return;
    }

    chrome.storage.local.get(null, (items) => {
      let totalSize = 0;
      let mlDataCount = 0;
      console.log('========== ストレージ容量詳細 ==========');

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('theoption_ml_')) {
          mlDataCount++;
          const str = JSON.stringify(value);
          const sizeKB = (str.length / 1024).toFixed(2);
          const sizeMB = (str.length / 1024 / 1024).toFixed(2);
          const count = Array.isArray(value) ? value.length : 'N/A';

          console.log(`📦 ${key}:`);
          console.log(`   - データ件数: ${count}件`);
          console.log(`   - サイズ: ${sizeKB} KB (${sizeMB} MB)`);

          totalSize += str.length;
        }
      }

      if (mlDataCount === 0) {
        console.log('ℹ️ まだストレージにMLデータが保存されていません');
        console.log('ℹ️ データは10件ごとに保存されます。もう少しお待ちください...');
      }

      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
      console.log('========================================');
      console.log(`💾 合計サイズ: ${totalSizeMB} MB`);
      console.log(`📊 ML通貨ペア数: ${mlDataCount}`);
      console.log(`✅ unlimitedStorage: 有効 (制限なし)`);
      console.log('========================================');
    });
  };

  // 類似度計算テスト用関数（70%以上のパターンが存在するか確認）
  window.testSimilarityCalculation = function () {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.error('❌ chrome.storage が利用できません');
      return;
    }

    chrome.storage.local.get(['theoption_ml_BTC_JPY'], (result) => {
      const data = result.theoption_ml_BTC_JPY;
      if (!data || data.length < 100) {
        console.log('❌ データ不足');
        return;
      }

      // 結果が記録されているデータを抽出
      const withResults = data.filter(d => d.result15s && !d.result15s.pending);
      console.log(`📊 結果記録済みデータ: ${withResults.length}件`);

      // 真ん中のデータを1つ取り出す
      const testIndex = Math.floor(withResults.length / 2);
      const testPattern = withResults[testIndex];

      console.log(`🔍 テストパターン: インデックス=${testIndex}`);
      console.log(`  価格: ${testPattern.price}`);
      console.log(`  タイムスタンプ: ${new Date(testPattern.timestamp).toLocaleString('ja-JP')}`);

      // 類似度計算
      const calculator = new SegmentSimilarityCalculator();
      const similarities = [];

      console.log('🔄 類似度計算中...');
      const startTime = Date.now();

      for (let i = 0; i < Math.min(500, withResults.length); i++) {
        const similarity = calculator.calculateSimilarity(
          testPattern,
          withResults[i],
          15
        );
        if (similarity >= 70) {
          similarities.push({ index: i, similarity });
        }
      }

      const calcTime = Date.now() - startTime;

      // ソート
      similarities.sort((a, b) => b.similarity - a.similarity);

      console.log('\n📊 類似度70%以上の結果:');
      console.log(`  計算時間: ${calcTime}ms`);
      console.log(`  件数: ${similarities.length}件`);
      if (similarities.length > 0) {
        console.log(`  最大類似度: ${Math.round(similarities[0].similarity)}%`);
        console.log(`  上位10件:`, similarities.slice(0, 10).map(s => `${Math.round(s.similarity)}%`).join(', '));
      } else {
        console.log('  ❌ 70%以上なし（類似度計算に問題がある可能性）');
      }

      // 全体の類似度分布
      const allSims = withResults.slice(0, 500).map((d, i) => {
        const sim = calculator.calculateSimilarity(testPattern, d, 15);
        return { index: i, similarity: sim };
      });
      allSims.sort((a, b) => b.similarity - a.similarity);

      console.log('\n📊 類似度分布（上位20件）:');
      console.log(allSims.slice(0, 20).map(s => Math.round(s.similarity)).join(', '));

      // 統計情報
      const above80 = allSims.filter(s => s.similarity >= 80).length;
      const above70 = allSims.filter(s => s.similarity >= 70).length;
      const above60 = allSims.filter(s => s.similarity >= 60).length;
      const above50 = allSims.filter(s => s.similarity >= 50).length;

      console.log('\n📊 類似度別件数（500件中）:');
      console.log(`  80%以上: ${above80}件`);
      console.log(`  70%以上: ${above70}件`);
      console.log(`  60%以上: ${above60}件`);
      console.log(`  50%以上: ${above50}件`);
    });
  };

  // セグメント分析データの自動診断関数
  window.autoCheckSegmentData = function () {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.error('❌ chrome.storage が利用できません');
      return;
    }

    chrome.storage.local.get(null, (items) => {
      console.log('\n');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔬 セグメント分析データ 自動診断');
      console.log('═══════════════════════════════════════════════════════════');

      let totalData = 0;
      let withSegments = 0;
      let withoutSegments = 0;
      let latestDataInfo = null;

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('theoption_ml_') && Array.isArray(value)) {
          totalData += value.length;

          value.forEach((data, idx) => {
            if (data.priceSegments15s) {
              withSegments++;
            } else {
              withoutSegments++;
            }

            // 最新データを保存
            if (idx === value.length - 1) {
              latestDataInfo = {
                asset: key.replace('theoption_ml_', ''),
                data: data,
                index: idx
              };
            }
          });
        }
      }

      console.log(`📊 総データ数: ${totalData}件`);
      console.log(`✅ セグメント分析あり: ${withSegments}件 (${totalData > 0 ? Math.round(withSegments / totalData * 100) : 0}%)`);
      console.log(`❌ セグメント分析なし: ${withoutSegments}件 (${totalData > 0 ? Math.round(withoutSegments / totalData * 100) : 0}%)`);

      if (latestDataInfo) {
        console.log('\n───────────────────────────────────────────────────────────');
        console.log(`🔍 最新データ詳細 (${latestDataInfo.asset})`);
        console.log('───────────────────────────────────────────────────────────');

        const data = latestDataInfo.data;

        if (data.priceSegments15s) {
          console.log('✅ priceSegments15s: 存在');
          console.log(`   セグメント数: ${data.priceSegments15s.segmentCount}`);
          console.log(`   パターン: ${data.priceSegments15s.pattern}`);
          console.log(`   形状ハッシュ: ${data.priceSegments15s.shapeHash}`);
          console.log(`   要約:`, data.priceSegments15s.summary);
        } else if (data.pricePattern15s) {
          console.log('⚠️  pricePattern15s: 存在（旧形式）');
          console.log(`   トレンド: ${data.pricePattern15s.trendDirection}`);
          console.log(`   傾き: ${data.pricePattern15s.slope.toFixed(3)}`);
          console.log(`   パターン: ${data.pricePattern15s.patternType}`);
        } else {
          console.log('❌ 価格パターンデータなし');
        }

        if (data.techSegments15s) {
          console.log('✅ techSegments15s: 存在');
          console.log(`   セグメント数: ${data.techSegments15s.segmentCount}`);
        } else if (data.techTimeSeries15s) {
          console.log('⚠️  techTimeSeries15s: 存在（旧形式）');
        } else {
          console.log('❌ テクニカル指標時系列データなし');
        }

        console.log(`\n📅 タイムスタンプ: ${new Date(data.timestamp).toLocaleString('ja-JP')}`);
        console.log(`💰 価格: ${data.price}`);
      } else {
        console.log('\nℹ️  まだデータが収集されていません');
        console.log('   データは15秒ごとに収集されます。しばらくお待ちください...');
      }

      console.log('═══════════════════════════════════════════════════════════');

      // 判定結果をわかりやすく表示
      if (totalData === 0) {
        console.log('🟡 状態: データ収集中（まだ保存されていません）');
      } else if (withSegments === totalData) {
        console.log('🟢 状態: 全データでセグメント分析が動作しています！');
      } else if (withSegments > 0) {
        console.log('🟡 状態: 新データのみセグメント分析あり（古いデータは旧形式）');
      } else {
        console.log('🔴 状態: セグメント分析が動作していません');
      }

      console.log('═══════════════════════════════════════════════════════════\n');
    });
  };

  console.log('[TheOption Analyzer] 💡 ストレージ容量確認: コンソールで checkMLStorage() を実行してください');
  console.log('[TheOption Analyzer] 🧪 類似度計算テスト: コンソールで testSimilarityCalculation() を実行してください');
  console.log('[TheOption Analyzer] 🔬 セグメント分析診断: 自動実行されます');

  // 診断機能を即座に実行可能にする
  setTimeout(() => {
    if (typeof window.autoCheckSegmentData === 'function') {
      console.log('[TheOption Analyzer] 🔬 セグメント分析データ診断を5秒後に実行します...');
      window.autoCheckSegmentData();
    } else {
      console.warn('[TheOption Analyzer] ⚠️ autoCheckSegmentData関数が見つかりません');
    }
  }, 5000);

  // 類似度計算テストを自動実行（BTC/JPYデータ読み込み後）
  setTimeout(() => {
    if (typeof window.testSimilarityCalculation === 'function') {
      console.log('[TheOption Analyzer] 🧪 類似度計算テストを15秒後に自動実行します...');
      setTimeout(() => {
        window.testSimilarityCalculation();
      }, 10000); // さらに10秒待つ（BTC/JPYデータ読み込み待ち）
    }
  }, 5000);

  (function () {
    'use strict';

    // ========================================
    // Extension Context 監視
    // ========================================

    // 拡張機能のコンテキストが無効化されたかチェック
    let contextInvalidated = false;
    let contextCheckInterval = null;

    // アラート音の設定
    let alertSoundEnabled = false;  // デフォルトOFF
    let alertVolume = 'medium';     // デフォルト: 中
    let alertSoundType = '01';      // デフォルト: サウンド1

    // 音量レベルのマッピング
    const volumeLevels = {
      low: 0.3,       // 小
      medium: 0.6,    // 中
      high: 1.0       // 大
    };

    // 表示設定
    let fontSize = 'medium';    // デフォルト: 中サイズ

    /**
     * アラート音を鳴らす（選択したサウンドファイルを再生）
     */
    function playAlertSound() {
      if (!alertSoundEnabled) return;

      try {
        const soundFile = `sound/${alertSoundType}.mp3`;
        const audio = new Audio(chrome.runtime.getURL(soundFile));

        // 音量設定
        const volume = volumeLevels[alertVolume] || volumeLevels.medium;
        audio.volume = volume;

        audio.play().catch(err => {
          console.warn('[TheOption Analyzer] アラート音再生エラー:', err);
        });
      } catch (error) {
        console.error('[TheOption Analyzer] アラート音の再生に失敗:', error);
      }
    }

    /**
     * フォントサイズを適用
     */
    function applyFontSize(size) {
      // オーバーレイ削除のため、DOM操作は行わない
      fontSize = size;
      console.log(`[TheOption Analyzer] 🔤 フォントサイズを変更: ${size}`);
    }

    function checkExtensionContext() {
      if (!chrome.runtime?.id && !contextInvalidated) {
        contextInvalidated = true;
        // コンテキスト無効化を検出 → 静かに自動リロード（ユーザーへの警告は不要）

        // 5秒後に自動リロード
        setTimeout(() => {
          window.location.reload();
        }, 5000);

        // 監視を停止
        if (contextCheckInterval) {
          clearInterval(contextCheckInterval);
        }
        if (priceUpdateInterval) {
          clearInterval(priceUpdateInterval);
        }
      }
    }

    // 10秒ごとにコンテキストをチェック
    contextCheckInterval = setInterval(checkExtensionContext, 10000);

    // ========================================
    // グローバル変数
    // ========================================

    let multiDimAnalyzer = null;
    let mlSystem = null;
    let signalEnhancer = null;  // シグナル強化システム（複数時間枠統合 + クラスタリング + ボラティリティ適応）
    let techTimeSeriesAnalyzer = null;  // テクニカル指標時系列分析
    let detailedSegmentAnalyzer = null;  // 詳細セグメント分析
    let priceUpdateInterval = null;
    let uiPanel = null;
    let tickData = [];
    let priceHistory = [];
    let candles = [];
    let currentAsset = null;  // 現在の通貨ペア
    let assetDataCache = {};  // 通貨ペアごとのデータキャッシュ
    let currentTimeframe = 60;  // 現在選択中の時間枠（秒）- デフォルトは60秒
    let lastAnalysisTime = 0;  // 最後に分析を実行した時刻（後方互換のため保持）
    let currentSimilarityThreshold = 50;  // 類似度閾値（デフォルト50%）
    let currentDataLimit = null;  // データ件数制限（null = 全期間, 500/1000/2000/3000）

    // 時間枠ごとの分析結果キャッシュ
    let timeframeResults = {
      15: null,
      30: null,
      60: null,
      180: null,
      300: null
    };

    // 時間枠ごとの最終分析時刻
    let lastAnalysisTimes = {
      15: 0,
      30: 0,
      60: 0,
      180: 0,
      300: 0
    };

    // MLデータ収集の最終実行時刻（パフォーマンス最適化）
    let lastMLDataCollectionTime = 0;

    // 取引中状態の管理
    let tradingState = {
      isTrading: false,        // 取引中かどうか
      startTime: 0,            // 取引開始時刻（ms）
      duration: 0,             // 判定時間（秒）
      remainingTime: 0,        // 取引残り時間（秒）
      timeframe: 0,            // 取引を開始した時間枠
      signal: null             // 取引開始時のシグナル（取引中に保持）
    };

    // 事前計算されたMLデータ（全判定時間のデータを15秒ごとに1回だけ計算）
    let cachedMLData = null;

    // 予測パターン履歴（最大1000件）
    let predictionHistory = [];

    // トレンド分析履歴（最大1000件）
    let trendHistory = [];

    // 予測品質ログ（最大1000件）
    let predictionQualityLog = [];

    // ========================================
    // 時間枠別設定
    // ========================================

    const TIMEFRAME_CONFIGS = {
      15: {
        label: '15秒',
        updateInterval: 15,  // 15秒ごとに更新
        prepTime: 5,  // エントリー5秒前に分析完了
        dataWindow: 120,  // 直近2分のデータを使用
        minDataPoints: 120,  // 最低2分(120秒)のデータが必要
        weights: {
          macd: 1.5,
          adx: 1.0,
          stochastic: 1.5,
          atr: 1.0,
          roc: 2.5,  // 超短期は価格変化率を重視
          sentiment: 2.5  // 市場の瞬間的な動きを重視
        }
      },
      30: {
        label: '30秒',
        updateInterval: 30,  // 30秒ごとに更新
        prepTime: 5,  // エントリー5秒前に分析完了
        dataWindow: 300,  // 直近5分のデータを使用（長期MA300秒に対応）
        minDataPoints: 300,  // 最低5分(300秒)のデータが必要
        weights: {
          macd: 1.8,
          adx: 1.2,
          stochastic: 2.0,
          atr: 1.0,
          roc: 2.3,
          sentiment: 2.0
        }
      },
      60: {
        label: '60秒',
        updateInterval: 60,  // 60秒ごとに更新
        prepTime: 5,  // エントリー5秒前に分析完了
        dataWindow: 480,  // 直近8分のデータを使用（長期MA480秒に対応）
        minDataPoints: 480,  // 最低8分(480秒)のデータが必要
        weights: {
          macd: 2.0,
          adx: 1.5,
          stochastic: 1.8,
          atr: 1.2,
          roc: 2.0,
          sentiment: 1.5
        }
      },
      180: {
        label: '3分',
        updateInterval: 180,  // 180秒ごとに更新
        prepTime: 5,  // エントリー5秒前に分析完了
        dataWindow: 540,  // 直近9分のデータを使用（長期MA540秒に対応）
        minDataPoints: 540,
        weights: {
          macd: 2.5,  // 長期はトレンド重視
          adx: 2.0,
          stochastic: 1.5,
          atr: 1.5,
          roc: 1.5,
          sentiment: 1.0
        }
      },
      300: {
        label: '5分',
        updateInterval: 300,  // 300秒ごとに更新
        prepTime: 5,  // エントリー5秒前に分析完了
        dataWindow: 600,  // 直近10分のデータを使用（長期MA600秒に対応）
        minDataPoints: 600,
        weights: {
          macd: 2.5,
          adx: 2.5,  // 最長期はトレンドの強さを最重視
          stochastic: 1.2,
          atr: 1.5,
          roc: 1.2,
          sentiment: 0.8
        }
      }
    };

    // ========================================
    // 設定変更時のML予測再実行
    // ========================================

    // 設定変更時にML予測を再実行
    async function rerunMLPrediction() {
      if (!mlSystem || !mlSystem.predictWithThreshold) {
        console.log('[TheOption Analyzer] MLシステムが準備できていません');
        return;
      }

      const cachedResult = timeframeResults[currentTimeframe];
      if (!cachedResult || !cachedResult.currentSituation) {
        console.log('[TheOption Analyzer] キャッシュされたデータがありません');
        return;
      }

      try {
        // 🔍 デバッグ: currentDataLimitの値と型を確認
        console.log(`[TheOption Analyzer Debug] currentDataLimit value: ${currentDataLimit}, type: ${typeof currentDataLimit}`);
        console.log(`[TheOption Analyzer] 🔄 設定変更により予測を再実行 (閾値: ${currentSimilarityThreshold}%, データ: ${currentDataLimit || '全期間'})`);

        // 新しい設定で予測を再実行
        const newPrediction = await mlSystem.predictWithThreshold(
          cachedResult.currentSituation,
          currentTimeframe,
          currentSimilarityThreshold,
          currentDataLimit
        );

        // キャッシュを更新
        if (!cachedResult.ml) {
          cachedResult.ml = {
            status: 'READY',
            dataCount: 0,
            dataCountWithResults: 0,
            predictions: {}
          };
        }

        if (!cachedResult.ml.predictions) {
          cachedResult.ml.predictions = {};
        }

        const predictionKey = `${currentTimeframe}s`;
        cachedResult.ml.predictions[predictionKey] = newPrediction;

        console.log(`[TheOption Analyzer] ✅ 予測結果更新:`, {
          上昇確率: newPrediction.upRate + '%',
          下降確率: newPrediction.downRate + '%',
          マッチ数: newPrediction.sampleSize
        });

        // UIを更新
        updateUI({
          status: 'ACTIVE',
          multiDim: cachedResult.multiDim,
          ml: cachedResult.ml,
          mlStats: cachedResult.mlStats
        });

      } catch (error) {
        console.error('[TheOption Analyzer] 予測再実行エラー:', error);
      }
    }

    // ========================================
    // サイドパネル通信
    // ========================================

    // サイドパネルに分析データを送信
    function sendAnalysisToSidePanel() {
      console.log('[TheOption Analyzer] 🔵 sendAnalysisToSidePanel 呼び出し開始');
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        console.log('[TheOption Analyzer] ⚠️ chrome.runtime が利用不可');
        return;
      }

      try {
        // 全時間枠の分析結果を集約
        const timeframesData = {};
        Object.keys(TIMEFRAME_CONFIGS).forEach(tf => {
          const result = timeframeResults[tf];
          if (result && result.multiDim) {
            const signals = getCurrentTimeframeSignal(result.multiDim, result.ml);

            // オーバーレイと同じ詳細分析を計算（時間枠を渡す）
            const multiDim = result.multiDim;
            const strengthResult = calculateComprehensiveTrendStrength(multiDim, priceHistory, tf);
            const totalStrength = strengthResult.total;

            // 時間枠別の閾値を取得
            const tfConfig = TIMEFRAME_ANALYSIS_CONFIG[tf] || TIMEFRAME_ANALYSIS_CONFIG[60];
            const threshold = tfConfig.trendThreshold;

            // スコアをスムージング（急激な変動を抑制）
            const smoothedScore = smoothScore(multiDim.score, tf, currentAsset || 'default');

            // トレンド方向の判定（時間枠別閾値 + スムージング適用）
            let trendDirection = '中立';
            let trendColor = '#FFA726';
            let isTrending = false;

            if (smoothedScore > threshold) {
              trendDirection = '上昇';
              trendColor = '#4CAF50';
              isTrending = true;
            } else if (smoothedScore < -threshold) {
              trendDirection = '下降';
              trendColor = '#F44336';
              isTrending = true;
            }

            // トレンド表示テキスト
            let trendDisplayText = '';
            if (isTrending) {
              const level = getTrendStrengthLevel(totalStrength);
              trendDisplayText = `${trendDirection}トレンド (強度: ${totalStrength}/100 ${level})`;
            } else {
              trendDisplayText = 'レンジ相場';
            }

            // 統合判定
            let overallJudgment = '';
            let judgmentColor = '#FFA726';
            if (isTrending && totalStrength >= 70) {
              overallJudgment = `${trendDirection}トレンド明確`;
              judgmentColor = trendColor;
            } else if (isTrending && totalStrength >= 40) {
              overallJudgment = `${trendDirection}傾向あり`;
              judgmentColor = trendColor;
            } else if (isTrending) {
              overallJudgment = `${trendDirection}傾向だが弱い`;
              judgmentColor = '#FF9800';
            } else {
              overallJudgment = 'レンジ相場';
              judgmentColor = '#9E9E9E';
            }

            // 信頼度メトリクス
            const reliability = multiDim.breakdown?.reliability || {
              consistency: 0,
              alignment: 0,
              reversals: 0,
              reliabilityScore: 0
            };

            let reliabilityLevel = '低';
            let reliabilityColor = '#9E9E9E';
            if (reliability.reliabilityScore >= 80) {
              reliabilityLevel = '高';
              reliabilityColor = '#4CAF50';
            } else if (reliability.reliabilityScore >= 60) {
              reliabilityLevel = '中';
              reliabilityColor = '#FFA726';
            }

            // 推奨テキスト
            let recommendation = '';
            if (isTrending && totalStrength >= 70) {
              recommendation = 'エントリー推奨';
            } else if (!isTrending) {
              recommendation = '見送り推奨（レンジ相場）';
            } else {
              recommendation = '慎重にエントリー';
            }

            // ボラティリティ
            const volatility = multiDim.breakdown?.atr?.volatility || '-';

            // 該当時間枠のML予測を取得
            const mlPred = result.ml?.predictions?.[`${tf}s`];
            // 類似度は上位パターンの平均またはconfidenceを使用
            const mlSimilarity = mlPred?.topPatterns?.[0]?.similarity || mlPred?.confidence;

            // 🔧 ML状態は常に最新の統計から取得（キャッシュの古いstatusを使わない）
            const currentMlStats = mlSystem && mlSystem.getStatistics ? mlSystem.getStatistics() : null;
            const mlStatus = currentMlStats?.status || result.ml?.status;
            const mlDataCount = currentMlStats?.dataCount || result.ml?.dataCount;
            const mlDataCountWithResults = currentMlStats?.dataCountWithResults || result.ml?.dataCountWithResults;
            const isMLReady = mlStatus === 'READY';

            timeframesData[tf] = {
              technical: {
                signal: multiDim.signal || 'NEUTRAL',
                confidence: multiDim.confidence,
                breakdown: multiDim.breakdown,
                // 詳細分析データを追加
                trendDisplayText: trendDisplayText,
                trendDirection: trendDirection,
                trendColor: trendColor,
                isTrending: isTrending,
                totalStrength: totalStrength,
                overallJudgment: overallJudgment,
                judgmentColor: judgmentColor,
                reliability: reliability,
                reliabilityLevel: reliabilityLevel,
                reliabilityColor: reliabilityColor,
                recommendation: recommendation,
                volatility: volatility
              },
              ai: {
                signal: isMLReady && mlPred ? mlPred.prediction : 'NEUTRAL',
                similarity: mlSimilarity,
                matchCount: mlPred?.sampleSize,
                upRate: mlPred?.upRate,
                downRate: mlPred?.downRate,
                available: isMLReady && !!mlPred && mlPred.prediction !== 'INSUFFICIENT_DATA',
                status: mlStatus,
                dataCount: mlDataCount,
                dataCountWithResults: mlDataCountWithResults
              },
              combined: signals ? {
                signal: signals.combined?.signal || 'NEUTRAL',
                confidence: signals.combined?.confidence
              } : null
            };
          }
        });

        // ML学習状況を取得（timeframeResultsから取得、なければgetStatistics()を使用）
        let mlStats = null;

        // まずtimeframeResultsに保存されたmlStatsを探す（オーバーレイと同じデータソース）
        const currentResult = timeframeResults[currentTimeframe];
        if (currentResult && currentResult.mlStats) {
          mlStats = currentResult.mlStats;
        } else if (mlSystem && mlSystem.getStatistics) {
          // フォールバック: 直接getStatistics()を呼び出す
          const stats = mlSystem.getStatistics();
          const learningLevel = stats.learningLevel !== undefined
            ? stats.learningLevel
            : Math.min(100, Math.round((stats.dataCountWithResults / 500) * 100));
          mlStats = {
            dataCount: stats.dataCount,
            dataCountWithResults: stats.dataCountWithResults,
            learningLevel: learningLevel,
            accuracy: stats.accuracy,
            status: stats.status
          };
        }

        // === シグナル強化システムによる追加シグナル ===
        let enhancedSignal = null;
        if (signalEnhancer && currentResult && currentResult.currentSituation) {
          try {
            // 全時間枠の予測を収集
            const allPredictions = {};
            Object.keys(timeframeResults).forEach(tf => {
              const tfResult = timeframeResults[tf];
              if (tfResult && tfResult.ml && tfResult.ml.predictions) {
                const mlPred = tfResult.ml.predictions[`${tf}s`];
                if (mlPred && mlPred.prediction !== 'INSUFFICIENT_DATA') {
                  allPredictions[tf] = {
                    prediction: mlPred.prediction,
                    upRate: mlPred.upRate || 0,
                    downRate: mlPred.downRate || 0,
                    similarity: mlPred.topPatterns?.[0]?.similarity || mlPred.confidence || 0,
                    sampleSize: mlPred.sampleSize || 0
                  };
                }
              }
            });

            // シグナル強化を実行
            enhancedSignal = signalEnhancer.enhance({
              situation: currentResult.currentSituation,
              predictions: allPredictions,
              matchedPatterns: currentResult.ml?.predictions?.[`${currentTimeframe}s`]?.topPatterns || [],
              primaryTimeframe: currentTimeframe,
              baseThreshold: currentSimilarityThreshold
            });

            if (enhancedSignal && enhancedSignal.enhanced) {
              console.log(`[TheOption Analyzer] 🚀 強化シグナル検出: type=${enhancedSignal.signal.type}, dir=${enhancedSignal.signal.direction}, ★${enhancedSignal.signal.starLevel}`);
            }
          } catch (error) {
            console.error('[TheOption Analyzer] シグナル強化エラー:', error);
          }
        }

        const data = {
          asset: currentAsset,
          dataCount: priceHistory.length,
          timeframes: timeframesData,
          currentTimeframe: currentTimeframe,
          mlStats: mlStats,
          enhancedSignal: enhancedSignal  // 強化シグナルを追加
        };

        console.log('[TheOption Analyzer] 📤 サイドパネル送信 mlStats:', mlStats);

        // 🔍 診断: AI予測詳細の状態を確認
        const currentTfData = timeframesData[currentTimeframe];
        if (currentTfData) {
          console.log(`[TheOption Analyzer] 🔍 AI予測診断 (${currentTimeframe}秒):`, {
            available: currentTfData.ai?.available,
            status: currentTfData.ai?.status,
            signal: currentTfData.ai?.signal,
            mlPredExists: !!timeframeResults[currentTimeframe]?.ml?.predictions?.[`${currentTimeframe}s`],
            dataCountWithResults: currentTfData.ai?.dataCountWithResults
          });
        }

        chrome.runtime.sendMessage({
          type: 'ANALYSIS_UPDATE',
          data: data
        }).catch(() => {
          // サイドパネルが開いていない場合は無視
        });
      } catch (error) {
        console.error('[TheOption Analyzer] サイドパネル送信エラー:', error);
      }
    }

    // サイドパネルにリアルタイムステータスを送信（カウントダウン、データ収集進捗）
    function sendStatusToSidePanel(countdown) {
      console.log('[TheOption Analyzer] 🟢 sendStatusToSidePanel 呼び出し countdown:', countdown);
      if (!chrome.runtime || !chrome.runtime.sendMessage) return;

      try {
        // 現在の時間枠の設定を取得
        const config = TIMEFRAME_CONFIGS[currentTimeframe];
        const requiredData = config.minDataPoints || 30;
        const currentData = priceHistory.length;

        // テクニカル分析のデータ収集進捗
        let techProgress = null;
        if (currentData < requiredData) {
          techProgress = {
            collecting: true,
            percent: Math.floor((currentData / requiredData) * 100)
          };
        }

        // AI予測のデータ収集進捗
        let aiProgress = null;
        const mlDataCount = mlSystem && mlSystem.getDataCount ? mlSystem.getDataCount() : 0;
        const requiredMlData = 50; // AI予測に必要な最低データ数
        if (mlDataCount < requiredMlData) {
          aiProgress = {
            collecting: true,
            percent: Math.floor((mlDataCount / requiredMlData) * 100)
          };
        }

        // ML統計情報を取得（リアルタイム更新用）
        let mlStats = null;
        if (mlSystem && mlSystem.getStatistics) {
          const stats = mlSystem.getStatistics();
          const learningLevel = stats.learningLevel !== undefined
            ? stats.learningLevel
            : Math.min(100, Math.round((stats.dataCountWithResults / 500) * 100));
          mlStats = {
            dataCount: stats.dataCount,
            dataCountWithResults: stats.dataCountWithResults,
            learningLevel: learningLevel,
            accuracy: stats.accuracy,
            status: stats.status
          };
        }

        // 現在のシグナルを取得
        // 取引中は保存されたシグナルを使用（UIの操作でシグナルが消えるバグを防止）
        let currentSignal = null;
        const isTradingForCurrentTimeframe = tradingState.isTrading && tradingState.timeframe === currentTimeframe;

        if (isTradingForCurrentTimeframe && tradingState.signal) {
          // 取引中は保存されたシグナルを使用
          currentSignal = tradingState.signal;
        } else {
          // 通常時は timeframeResults から取得
          const currentResult = timeframeResults[currentTimeframe];
          if (currentResult && currentResult.multiDim) {
            const signals = getCurrentTimeframeSignal(currentResult.multiDim, currentResult.ml);
            // signals.technical.signal は 'HIGH', 'LOW', 'NEUTRAL' など
            // signals.ai.available が true なら signals.ai.signal が 'HIGH', 'LOW' など
            currentSignal = {
              tech: signals.technical ? signals.technical.signal : null,
              techConfidence: signals.technical ? signals.technical.confidence : null,
              ai: signals.ai && signals.ai.available ? signals.ai.signal : null,
              aiConfidence: signals.ai && signals.ai.available ? signals.ai.confidence : null,
              aiDiff: signals.ai ? signals.ai.diff : null,
              aiStarLevel: null  // 強化シグナル用
            };

            // === 強化シグナルのチェック ===
            // 標準のAIシグナル（60%シグナル）がない場合、強化シグナルをチェック
            if (signalEnhancer && currentResult.currentSituation &&
                (!signals.ai.available || signals.ai.signal === 'NEUTRAL' ||
                 signals.ai.signal === 'TREND_HIGH' || signals.ai.signal === 'TREND_LOW')) {
              try {
                // 全時間枠の予測を収集
                const allPredictions = {};
                Object.keys(timeframeResults).forEach(tf => {
                  const tfResult = timeframeResults[tf];
                  if (tfResult && tfResult.ml && tfResult.ml.predictions) {
                    const mlPred = tfResult.ml.predictions[`${tf}s`];
                    if (mlPred && mlPred.prediction !== 'INSUFFICIENT_DATA') {
                      allPredictions[tf] = {
                        prediction: mlPred.prediction,
                        upRate: mlPred.upRate || 0,
                        downRate: mlPred.downRate || 0,
                        similarity: mlPred.topPatterns?.[0]?.similarity || mlPred.confidence || 0,
                        sampleSize: mlPred.sampleSize || 0
                      };
                    }
                  }
                });

                // シグナル強化を実行
                const enhanced = signalEnhancer.enhance({
                  situation: currentResult.currentSituation,
                  predictions: allPredictions,
                  matchedPatterns: currentResult.ml?.predictions?.[`${currentTimeframe}s`]?.topPatterns || [],
                  primaryTimeframe: currentTimeframe,
                  baseThreshold: currentSimilarityThreshold
                });

                // 強化シグナルがあり、標準シグナルより優先する場合
                if (enhanced && enhanced.enhanced && enhanced.signal.type !== 'TREND') {
                  const enhDir = enhanced.signal.direction;
                  if (enhDir === 'HIGH') {
                    currentSignal.ai = 'ENHANCED_HIGH';
                    currentSignal.aiStarLevel = enhanced.signal.starLevel;
                  } else if (enhDir === 'LOW') {
                    currentSignal.ai = 'ENHANCED_LOW';
                    currentSignal.aiStarLevel = enhanced.signal.starLevel;
                  }
                }
              } catch (error) {
                // エラーは無視（強化シグナルはオプション機能）
              }
            }
          }
        }

        const prepTime = config.prepTime || 5;

        // 取引中の場合は残り時間を計算
        let signalReset = false;
        let tradingStatusUpdated = isTradingForCurrentTimeframe;  // 取引状態の更新後の値を保持
        if (tradingState.isTrading) {
          const elapsed = Math.floor((Date.now() - tradingState.startTime) / 1000);
          tradingState.remainingTime = Math.max(0, tradingState.duration - elapsed);

          // 取引終了判定
          if (tradingState.remainingTime <= 0) {
            const tradingTimeframe = tradingState.timeframe;  // 取引していた時間枠を保存
            tradingState.isTrading = false;
            tradingState.remainingTime = 0;
            tradingState.signal = null;  // 保存されたシグナルもクリア
            tradingStatusUpdated = false;  // 取引終了を反映
            // シグナルリセットは取引していた時間枠が現在の時間枠と一致する場合のみ
            if (tradingTimeframe === currentTimeframe) {
              signalReset = true;  // シグナルリセットフラグを設定
            }
            // 分析結果をクリア（取引していた時間枠の結果をクリア）
            timeframeResults[tradingTimeframe] = null;
            console.log(`[TheOption Analyzer] 🔄 取引終了: ${tradingTimeframe}秒のシグナルをリセット (現在の時間枠: ${currentTimeframe}秒, countdown: ${countdown})`);
          }
        }

        // 取引終了後はシグナルをnullにする
        const statusData = {
          asset: currentAsset,
          dataCount: priceHistory.length,
          countdown: countdown,              // 次のエントリーまでの残り秒数
          prepTime: prepTime,                // 準備時間（5秒）
          currentSignal: signalReset ? null : currentSignal,  // リセット時はnull
          signalReset: signalReset,          // シグナルリセットフラグ
          isTrading: tradingStatusUpdated,   // 取引中かどうか（更新後の状態を使用）
          tradingRemaining: tradingStatusUpdated ? tradingState.remainingTime : 0,  // 取引残り時間
          techProgress: techProgress,
          aiProgress: aiProgress,
          currentTimeframe: currentTimeframe,
          mlStats: mlStats
        };

        // デバッグ: mlStatsが0以外の時のみログ
        if (mlStats && (mlStats.dataCount > 0 || mlStats.dataCountWithResults > 0)) {
          console.log('[TheOption Analyzer] 📤 STATUS_UPDATE mlStats:', mlStats);
        }

        chrome.runtime.sendMessage({
          type: 'STATUS_UPDATE',
          data: statusData
        }).catch(() => {
          // サイドパネルが開いていない場合は無視
        });
      } catch (error) {
        // エラーは無視
      }
    }

    // バックグラウンドからのメッセージを受信
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'REQUEST_ANALYSIS_DATA') {
          // 分析データを返す（sendAnalysisToSidePanelと同じ詳細データを含む）
          const timeframesData = {};
          Object.keys(TIMEFRAME_CONFIGS).forEach(tf => {
            const result = timeframeResults[tf];
            if (result && result.multiDim) {
              const signals = getCurrentTimeframeSignal(result.multiDim, result.ml);
              const multiDim = result.multiDim;

              // オーバーレイと同じ詳細分析を計算（時間枠を渡す）
              const strengthResult = calculateComprehensiveTrendStrength(multiDim, priceHistory, tf);
              const totalStrength = strengthResult.total;

              // 時間枠別の閾値を取得
              const tfConfig = TIMEFRAME_ANALYSIS_CONFIG[tf] || TIMEFRAME_ANALYSIS_CONFIG[60];
              const threshold = tfConfig.trendThreshold;

              // スコアをスムージング（急激な変動を抑制）
              const smoothedScore = smoothScore(multiDim.score, tf, currentAsset || 'default');

              // トレンド方向の判定（時間枠別閾値 + スムージング適用）
              let trendDirection = '中立';
              let trendColor = '#FFA726';
              let isTrending = false;

              if (smoothedScore > threshold) {
                trendDirection = '上昇';
                trendColor = '#4CAF50';
                isTrending = true;
              } else if (smoothedScore < -threshold) {
                trendDirection = '下降';
                trendColor = '#F44336';
                isTrending = true;
              }

              // トレンド表示テキスト
              let trendDisplayText = '';
              if (isTrending) {
                const level = getTrendStrengthLevel(totalStrength);
                trendDisplayText = `${trendDirection}トレンド (強度: ${totalStrength}/100 ${level})`;
              } else {
                trendDisplayText = 'レンジ相場';
              }

              // 統合判定
              let overallJudgment = '';
              let judgmentColor = '#FFA726';
              if (isTrending && totalStrength >= 70) {
                overallJudgment = `${trendDirection}トレンド明確`;
                judgmentColor = trendColor;
              } else if (isTrending && totalStrength >= 40) {
                overallJudgment = `${trendDirection}傾向あり`;
                judgmentColor = trendColor;
              } else if (isTrending) {
                overallJudgment = `${trendDirection}傾向だが弱い`;
                judgmentColor = '#FF9800';
              } else {
                overallJudgment = 'レンジ相場';
                judgmentColor = '#9E9E9E';
              }

              // 信頼度メトリクス
              const reliability = multiDim.breakdown?.reliability || {
                consistency: 0,
                alignment: 0,
                reversals: 0,
                reliabilityScore: 0
              };

              let reliabilityLevel = '低';
              let reliabilityColor = '#9E9E9E';
              if (reliability.reliabilityScore >= 80) {
                reliabilityLevel = '高';
                reliabilityColor = '#4CAF50';
              } else if (reliability.reliabilityScore >= 60) {
                reliabilityLevel = '中';
                reliabilityColor = '#FFA726';
              }

              // 推奨テキスト
              let recommendation = '';
              if (isTrending && totalStrength >= 70) {
                recommendation = 'エントリー推奨';
              } else if (!isTrending) {
                recommendation = '見送り推奨（レンジ相場）';
              } else {
                recommendation = '慎重にエントリー';
              }

              // ボラティリティ
              const volatility = multiDim.breakdown?.atr?.volatility || '-';

              // 該当時間枠のML予測を取得
              const mlPred = result.ml?.predictions?.[`${tf}s`];
              // 類似度は上位パターンの平均またはconfidenceを使用
              const mlSimilarity = mlPred?.topPatterns?.[0]?.similarity || mlPred?.confidence;

              timeframesData[tf] = {
                technical: {
                  signal: multiDim.signal || 'NEUTRAL',
                  confidence: multiDim.confidence,
                  breakdown: multiDim.breakdown,
                  trendDisplayText: trendDisplayText,
                  trendDirection: trendDirection,
                  trendColor: trendColor,
                  isTrending: isTrending,
                  totalStrength: totalStrength,
                  overallJudgment: overallJudgment,
                  judgmentColor: judgmentColor,
                  reliability: reliability,
                  reliabilityLevel: reliabilityLevel,
                  reliabilityColor: reliabilityColor,
                  recommendation: recommendation,
                  volatility: volatility
                },
                ai: {
                  signal: result.ml?.status === 'READY' && mlPred ? mlPred.prediction : 'NEUTRAL',
                  similarity: mlSimilarity,
                  matchCount: mlPred?.sampleSize,
                  upRate: mlPred?.upRate,
                  downRate: mlPred?.downRate,
                  available: result.ml?.status === 'READY' && !!mlPred && mlPred.prediction !== 'INSUFFICIENT_DATA',
                  status: result.ml?.status,
                  dataCount: result.ml?.dataCount,
                  dataCountWithResults: result.ml?.dataCountWithResults
                },
                combined: signals ? {
                  signal: signals.combined?.signal || 'NEUTRAL',
                  confidence: signals.combined?.confidence
                } : null
              };
            }
          });

          // ML学習状況を取得（timeframeResultsから取得、なければgetStatistics()を使用）
          let mlStats = null;

          // まずtimeframeResultsに保存されたmlStatsを探す（オーバーレイと同じデータソース）
          const currentResult = timeframeResults[currentTimeframe];

          if (currentResult && currentResult.mlStats) {
            mlStats = currentResult.mlStats;
          } else if (mlSystem && mlSystem.getStatistics) {
            // フォールバック: 直接getStatistics()を呼び出す
            const stats = mlSystem.getStatistics();
            const learningLevel = stats.learningLevel !== undefined
              ? stats.learningLevel
              : Math.min(100, Math.round((stats.dataCountWithResults / 500) * 100));
            mlStats = {
              dataCount: stats.dataCount,
              dataCountWithResults: stats.dataCountWithResults,
              learningLevel: learningLevel,
              accuracy: stats.accuracy,
              status: stats.status
            };
          }

          sendResponse({
            asset: currentAsset,
            dataCount: priceHistory.length,
            timeframes: timeframesData,
            currentTimeframe: currentTimeframe,
            mlStats: mlStats
          });
        }

        if (message.type === 'SETTING_CHANGED') {
          // 設定変更を適用
          // 🔍 デバッグ: 受け取った値の詳細を出力
          console.log(`[TheOption Analyzer Debug] SETTING_CHANGED received: key=${message.key}, value=${message.value}, type=${typeof message.value}`);
          console.log('[TheOption Analyzer] 設定変更:', message.key, '=', message.value);

          if (message.key === 'similarityThreshold') {
            currentSimilarityThreshold = message.value;
            // ML予測を再実行
            rerunMLPrediction();
          } else if (message.key === 'dataLimit') {
            console.log(`[TheOption Analyzer Debug] Before update: currentDataLimit=${currentDataLimit}`);
            currentDataLimit = message.value;
            console.log(`[TheOption Analyzer Debug] After update: currentDataLimit=${currentDataLimit}`);
            // ML予測を再実行
            rerunMLPrediction();
          }

          // サイドパネルにデータを再送信
          sendAnalysisToSidePanel();
        }

        if (message.type === 'TIMEFRAME_CHANGED') {
          // 時間枠変更
          currentTimeframe = message.timeframe;
          // UI更新
          const result = timeframeResults[currentTimeframe];
          if (result) {
            updateUI({
              status: 'ACTIVE',
              multiDim: result.multiDim,
              ml: result.ml,
              mlStats: result.mlStats
            });
          }
        }

        // ダウンロード実行
        if (message.type === 'EXECUTE_DOWNLOAD') {
          console.log('[TheOption Analyzer] ダウンロード実行:', message.downloadType);
          switch (message.downloadType) {
            case 'ML_DATA':
              downloadMLDataAsCSV();
              break;
            case 'PREDICTIONS':
              downloadPredictionsAsCSV();
              break;
            case 'TRENDS':
              downloadTrendsAsCSV();
              break;
            case 'EXPORT_JSON':
              exportDataAsJSON();
              break;
            case 'IMPORT_JSON':
              importDataFromJSON();
              break;
            default:
              console.warn('[TheOption Analyzer] 不明なダウンロードタイプ:', message.downloadType);
          }
        }

        return true; // 非同期レスポンス
      });
    }

    // ========================================
    // 初期化
    // ========================================

    async function initialize() {
      console.log('[TheOption Analyzer] 🔧 初期化開始');

      // LocalStorageから履歴データを復元
      loadHistoryFromStorage();

      // 多次元分析システム初期化（V2アーキテクチャを優先使用）
      if (typeof MultiDimensionalAnalyzerV2 !== 'undefined') {
        multiDimAnalyzer = new MultiDimensionalAnalyzerV2();
        console.log('[TheOption Analyzer] ════════════════════════════════════════');
        console.log('[TheOption Analyzer] ✅ V2アーキテクチャ初期化完了');
        console.log('[TheOption Analyzer]    - PhaseDetector: TREND/RANGE検出');
        console.log('[TheOption Analyzer]    - ResistanceFilter: 抵抗帯フィルター');
        console.log('[TheOption Analyzer]    - TIMEFRAME_CONFIGS: 時間枠別設定');
        console.log('[TheOption Analyzer] ════════════════════════════════════════');
      } else if (typeof MultiDimensionalAnalyzer !== 'undefined') {
        multiDimAnalyzer = new MultiDimensionalAnalyzer();
        console.log('[TheOption Analyzer] ⚠️ V2が見つかりません - レガシーモードで動作');
      } else {
        console.error('[TheOption Analyzer] ❌ MultiDimensionalAnalyzerが見つかりません');
        return;
      }

      // 機械学習システム初期化
      if (typeof MachineLearningSystem !== 'undefined') {
        mlSystem = new MachineLearningSystem();

        // コンテンツスクリプトのwindowに公開
        window.mlSystem = mlSystem;

        // 初期化は通貨ペア検出後に実行
        console.log('[TheOption Analyzer] ✅ 機械学習システム準備完了（通貨ペア検出待ち）');
      } else {
        console.error('[TheOption Analyzer] ❌ MachineLearningSystemが見つかりません');
        return;
      }

      // テクニカル指標時系列分析システム初期化
      if (typeof TechnicalTimeSeriesAnalyzer !== 'undefined') {
        techTimeSeriesAnalyzer = new TechnicalTimeSeriesAnalyzer();
        console.log('[TheOption Analyzer] ✅ テクニカル指標時系列分析システム初期化完了');
      } else {
        console.error('[TheOption Analyzer] ❌ TechnicalTimeSeriesAnalyzerが見つかりません');
        return;
      }

      // 詳細セグメント分析システム初期化
      if (typeof DetailedSegmentAnalyzer !== 'undefined') {
        detailedSegmentAnalyzer = new DetailedSegmentAnalyzer();
        console.log('[TheOption Analyzer] ✅ 詳細セグメント分析システム初期化完了');
      } else {
        console.error('[TheOption Analyzer] ❌ DetailedSegmentAnalyzerが見つかりません');
        return;
      }

      // シグナル強化システム初期化（複数時間枠統合 + クラスタリング + ボラティリティ適応）
      if (typeof SignalEnhancerSystem !== 'undefined') {
        signalEnhancer = new SignalEnhancerSystem();
        window.signalEnhancer = signalEnhancer;
        console.log('[TheOption Analyzer] ✅ シグナル強化システム初期化完了');
      } else {
        console.warn('[TheOption Analyzer] ⚠️ SignalEnhancerSystemが見つかりません（オプション機能）');
        // 必須ではないため続行
      }

      // 保存された設定を復元（保存がなければデフォルト50%を使用）
      chrome.storage.local.get(['similarityThreshold'], (result) => {
        if (result.similarityThreshold) {
          currentSimilarityThreshold = result.similarityThreshold;
          console.log(`[TheOption Analyzer] 類似度閾値を復元: ${currentSimilarityThreshold}%`);
        } else {
          // 初回起動時はデフォルト50%をストレージに保存
          chrome.storage.local.set({ similarityThreshold: currentSimilarityThreshold });
          console.log(`[TheOption Analyzer] 類似度閾値をデフォルト値に設定: ${currentSimilarityThreshold}%`);
        }
      });

      // 保存されたデータ件数制限を復元（保存がなければデフォルトnull = 全期間）
      chrome.storage.local.get(['dataLimit'], (result) => {
        if (result.dataLimit !== undefined) {
          // 文字列'all'が保存されている場合はnullに変換（後方互換性）
          const storedValue = result.dataLimit;
          if (storedValue === 'all' || storedValue === null) {
            currentDataLimit = null;
          } else if (typeof storedValue === 'string') {
            currentDataLimit = parseInt(storedValue) || null;
          } else {
            currentDataLimit = storedValue;
          }
          console.log(`[TheOption Analyzer] データ件数制限を復元: ${currentDataLimit === null ? '全期間' : currentDataLimit + '件'} (raw: ${storedValue})`);
        } else {
          // 初回起動時はデフォルトnull（全期間）をストレージに保存
          chrome.storage.local.set({ dataLimit: currentDataLimit });
          console.log(`[TheOption Analyzer] データ件数制限をデフォルト値に設定: 全期間`);
        }
      });

      // 保存されたアラート音設定を復元（保存がなければデフォルトOFF）
      chrome.storage.local.get(['alertSoundEnabled', 'alertVolume', 'alertSoundType'], (result) => {
        if (result.alertSoundEnabled !== undefined) {
          alertSoundEnabled = result.alertSoundEnabled;
          console.log(`[TheOption Analyzer] アラート音設定を復元: ${alertSoundEnabled ? 'ON' : 'OFF'}`);
        } else {
          // 初回起動時はデフォルトOFFをストレージに保存
          chrome.storage.local.set({ alertSoundEnabled: alertSoundEnabled });
          console.log(`[TheOption Analyzer] アラート音設定をデフォルト値に設定: OFF`);
        }

        // 音量設定を復元
        if (result.alertVolume !== undefined) {
          alertVolume = result.alertVolume;
          console.log(`[TheOption Analyzer] 音量設定を復元: ${alertVolume}`);
        } else {
          // 初回起動時はデフォルト値をストレージに保存
          chrome.storage.local.set({ alertVolume: alertVolume });
          console.log(`[TheOption Analyzer] 音量設定をデフォルト値に設定: ${alertVolume}`);
        }

        // アラート音の種類を復元
        if (result.alertSoundType !== undefined) {
          alertSoundType = result.alertSoundType;
          console.log(`[TheOption Analyzer] アラート音の種類を復元: ${alertSoundType}`);
        } else {
          chrome.storage.local.set({ alertSoundType: alertSoundType });
          console.log(`[TheOption Analyzer] アラート音の種類をデフォルト値に設定: ${alertSoundType}`);
        }
      });

      // ストレージ変更を監視（サイドパネルからの設定変更を反映）
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        if (changes.alertSoundType?.newValue !== undefined) {
          alertSoundType = changes.alertSoundType.newValue;
          console.log(`[TheOption Analyzer] アラート音の種類が変更されました: ${alertSoundType}`);
        }
        if (changes.alertVolume?.newValue !== undefined) {
          alertVolume = changes.alertVolume.newValue;
          console.log(`[TheOption Analyzer] 音量が変更されました: ${alertVolume}`);
        }
        if (changes.alertSoundEnabled?.newValue !== undefined) {
          alertSoundEnabled = changes.alertSoundEnabled.newValue;
          console.log(`[TheOption Analyzer] アラート音設定が変更されました: ${alertSoundEnabled ? 'ON' : 'OFF'}`);
        }
      });

      // 保存された判定時間を復元（保存がなければデフォルト60秒）
      chrome.storage.local.get(['currentTimeframe'], (result) => {
        if (result.currentTimeframe !== undefined) {
          currentTimeframe = result.currentTimeframe;
          console.log(`[TheOption Analyzer] 判定時間を復元: ${TIMEFRAME_CONFIGS[currentTimeframe].label}`);
        } else {
          // 初回起動時はデフォルト60秒をストレージに保存
          chrome.storage.local.set({ currentTimeframe: currentTimeframe });
          console.log(`[TheOption Analyzer] 判定時間をデフォルト値に設定: ${TIMEFRAME_CONFIGS[currentTimeframe].label}`);
        }
      });

      // 保存された表示設定を復元
      chrome.storage.local.get(['fontSize'], (result) => {
        // フォントサイズ設定を復元
        if (result.fontSize !== undefined) {
          fontSize = result.fontSize;
          console.log(`[TheOption Analyzer] フォントサイズ設定を復元: ${fontSize}`);
        } else {
          chrome.storage.local.set({ fontSize: fontSize });
          console.log(`[TheOption Analyzer] フォントサイズ設定をデフォルト値に設定: ${fontSize}`);
        }
      });

      // 価格データ取得開始
      startPriceMonitoring();

      console.log('[TheOption Analyzer] ✅ 初期化完了');
    }


    // ========================================
    // 時間枠切り替え
    // ========================================

    function switchTimeframe(newTimeframe) {
      if (currentTimeframe === newTimeframe) return;

      console.log(`[TheOption Analyzer] ⏱️ 時間枠切り替え: ${TIMEFRAME_CONFIGS[currentTimeframe].label} → ${TIMEFRAME_CONFIGS[newTimeframe].label}`);

      currentTimeframe = newTimeframe;

      // 判定時間をストレージに保存
      chrome.storage.local.set({ currentTimeframe: newTimeframe });

      // タブ切り替え時は次回分析まで待機
      const minDataPoints = TIMEFRAME_CONFIGS[newTimeframe].minDataPoints;

      if (priceHistory.length >= minDataPoints) {
        // 現在時刻を設定して、次回の分析インターバルまで待機
        lastAnalysisTimes[newTimeframe] = Date.now();
        console.log(`[TheOption Analyzer] ⏳ ${TIMEFRAME_CONFIGS[newTimeframe].label}に切り替え - 次回分析まで待機中`);
      } else {
        console.log(`[TheOption Analyzer] ⏳ ${TIMEFRAME_CONFIGS[newTimeframe].label} - データ不足（${priceHistory.length}/${minDataPoints}秒）`);
      }
    }

    function updateTimeframeInfo() {
      // オーバーレイ削除のため、この関数は何もしない
    }

    // ========================================
    // 類似度閾値変更
    // ========================================

    function changeSimilarityThreshold(newThreshold) {
      console.log(`[TheOption Analyzer] 🎯 類似度閾値変更: ${currentSimilarityThreshold}% → ${newThreshold}%`);

      currentSimilarityThreshold = newThreshold;

      // 閾値をストレージに保存
      chrome.storage.local.set({ similarityThreshold: newThreshold });

      // 全時間枠の予測を再計算
      repredictAllTimeframes();
    }

    // ========================================
    // アラート音のON/OFF切り替え
    // ========================================

    function toggleAlertSound() {
      alertSoundEnabled = !alertSoundEnabled;

      console.log(`[TheOption Analyzer] 🔊 アラート音: ${alertSoundEnabled ? 'ON' : 'OFF'}`);

      // 設定をストレージに保存
      chrome.storage.local.set({ alertSoundEnabled: alertSoundEnabled });

      // テスト音を鳴らす（ONにした時のみ）
      if (alertSoundEnabled) {
        playAlertSound();
      }
    }

    // ========================================
    // データ件数制限変更
    // ========================================

    function changeDataLimit(newLimit) {
      const oldLimitText = currentDataLimit === null ? '全期間' : `${currentDataLimit}件`;
      const newLimitText = newLimit === null ? '全期間' : `${newLimit}件`;
      console.log(`[TheOption Analyzer] 📊 データ件数制限変更: ${oldLimitText} → ${newLimitText}`);

      currentDataLimit = newLimit;

      // データ件数制限をストレージに保存
      chrome.storage.local.set({ dataLimit: newLimit });

      // 全時間枠の予測を再計算
      repredictAllTimeframes();
    }

    // 全時間枠の予測を再実行（閾値変更時）
    async function repredictAllTimeframes() {
      if (!mlSystem) {
        console.warn('[TheOption Analyzer] ⚠️ MLシステムが初期化されていません');
        return;
      }

      console.log(`[TheOption Analyzer] 🔄 類似度${currentSimilarityThreshold}%で選択中の時間枠（${currentTimeframe}秒）の予測を再計算中...`);
      console.log('[TheOption Analyzer] 📋 timeframeResults:', timeframeResults);

      // 選択中の時間枠のみ予測を再実行（パフォーマンス最適化）
      const timeframe = currentTimeframe;
      const cachedResult = timeframeResults[timeframe];

      console.log(`[TheOption Analyzer] 📊 ${timeframe}秒: キャッシュ確認`, {
        hasCachedResult: !!cachedResult,
        hasCurrentSituation: !!(cachedResult && cachedResult.currentSituation),
        hasMl: !!(cachedResult && cachedResult.ml)
      });

      if (cachedResult && cachedResult.currentSituation) {
        try {
          console.log(`[TheOption Analyzer] 🎯 ${timeframe}秒: 予測を再計算中...`);

          // MLシステムの状態を確認
          console.log(`[TheOption Analyzer] 🔍 MLシステム状態:`, {
            mlSystemExists: !!mlSystem,
            currentAsset: currentAsset,
            hasCurrentSituation: !!cachedResult.currentSituation,
            閾値: currentSimilarityThreshold
          });

          // 新しい閾値とデータ件数制限で予測を再実行
          const newPrediction = await mlSystem.predictWithThreshold(
            cachedResult.currentSituation,
            timeframe, // Changed from 'tf' to 'timeframe' to match local variable
            currentSimilarityThreshold,
            currentDataLimit
          );

          console.log(`[TheOption Analyzer] 📈 ${timeframe}秒: 新しい予測結果`, newPrediction);
          console.log(`[TheOption Analyzer] 🔍 ${timeframe}秒: 予測値詳細`, {
            閾値: currentSimilarityThreshold + '%',
            類似パターン数: newPrediction.sampleSize,
            上昇確率: newPrediction.upRate + '%',
            下降確率: newPrediction.downRate + '%',
            信頼度: newPrediction.confidence + '%'
          });

          // キャッシュを更新（キーは "15s", "60s" などの文字列形式）
          // 既存のmlデータを保持しつつ、predictionsだけ更新
          if (!cachedResult.ml) {
            cachedResult.ml = {
              status: 'READY',
              dataCount: 0,
              dataCountWithResults: 0,
              predictions: {}
            };
          }

          // predictionsオブジェクトが存在しない場合は作成
          if (!cachedResult.ml.predictions) {
            cachedResult.ml.predictions = {};
          }

          // 予測データを更新
          const predictionKey = `${timeframe}s`;
          cachedResult.ml.predictions[predictionKey] = newPrediction;
          console.log(`[TheOption Analyzer] 💾 ${timeframe}秒: キャッシュ更新完了 (key: ${predictionKey})`, cachedResult.ml.predictions[predictionKey]);

          // 画面を更新（選択中の時間枠）
          updateUI({
            status: 'ACTIVE',
            multiDim: cachedResult.multiDim,
            ml: cachedResult.ml,
            mlStats: cachedResult.mlStats
          });

          // タブのアイコンも更新
          updateTabIcon(timeframe, newPrediction);

          console.log(`[TheOption Analyzer] ✅ ${timeframe}秒: 予測更新完了`);
        } catch (error) {
          console.error(`[TheOption Analyzer] ❌ ${timeframe}秒の予測再計算エラー:`, error);
        }
      }

      console.log('[TheOption Analyzer] ✅ 選択中の時間枠の予測再計算完了');
    }

    // タブアイコンを更新（パフォーマンス最適化のため無効化）
    function updateTabIcon(timeframe, prediction) {
      // タブボタンからアイコンと信頼度表示を削除したため、この関数は何もしない
      return;
    }

    function updateCountdown(remainingSeconds) {
      // オーバーレイ削除のため、この関数は何もしない
    }

    // ========================================
    // 価格データの永続化
    // ========================================

    // 価格データをストレージに保存
    async function savePriceData(asset, data) {
      const storageKey = `theoption_price_${asset.replace(/[\/\s]/g, '_')}`;
      const dataToSave = {
        priceHistory: data.priceHistory.slice(-300), // 最新300件（5分）
        tickData: data.tickData.slice(-300),
        candles: data.candles,
        timestamp: Date.now()
      };

      try {
        // Extension contextが有効かチェック
        if (!chrome.runtime?.id) {
          // コンテキスト無効化を即座にチェック関数に通知
          if (!contextInvalidated) {
            checkExtensionContext();
          }
          throw new Error('Extension context invalidated');
        }

        await chrome.storage.local.set({ [storageKey]: dataToSave });
        console.log(`[TheOption Analyzer] 💾 ${asset} の価格データを保存 (${dataToSave.priceHistory.length}件)`);
      } catch (error) {
        // Chrome storage が使えない場合は localStorage にフォールバック
        try {
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
          console.log(`[TheOption Analyzer] 💾 ${asset} の価格データを保存 (${dataToSave.priceHistory.length}件) - localStorage使用`);
        } catch (localError) {
          console.warn(`[TheOption Analyzer] ⚠️ データ保存に失敗しました:`, localError.message);
        }
      }
    }

    // 価格データをストレージから復元
    async function loadPriceData(asset) {
      const storageKey = `theoption_price_${asset.replace(/[\/\s]/g, '_')}`;

      try {
        // Extension contextが有効かチェック
        if (!chrome.runtime?.id) {
          throw new Error('Extension context invalidated');
        }

        const result = await chrome.storage.local.get([storageKey]);

        if (result[storageKey]) {
          const data = result[storageKey];
          const age = Date.now() - data.timestamp;
          const maxAge = 10 * 60 * 1000; // 10分

          if (age < maxAge) {
            console.log(`[TheOption Analyzer] 📂 ${asset} の価格データを復元 (${data.priceHistory.length}件, ${Math.round(age / 1000)}秒前)`);
            return data;
          } else {
            console.log(`[TheOption Analyzer] ⏰ ${asset} のデータが古すぎます (${Math.round(age / 60000)}分前) - 新規収集します`);
            return null;
          }
        } else {
          console.log(`[TheOption Analyzer] 🆕 ${asset} の保存データなし - 新規収集します`);
          return null;
        }
      } catch (error) {
        // Chrome storage が使えない場合は localStorage から読み込み
        try {
          const savedData = localStorage.getItem(storageKey);
          if (savedData) {
            const data = JSON.parse(savedData);
            const age = Date.now() - data.timestamp;
            const maxAge = 10 * 60 * 1000; // 10分

            if (age < maxAge) {
              console.log(`[TheOption Analyzer] 📂 ${asset} の価格データを復元 (${data.priceHistory.length}件, ${Math.round(age / 1000)}秒前) - localStorage使用`);
              return data;
            } else {
              console.log(`[TheOption Analyzer] ⏰ ${asset} のデータが古すぎます (${Math.round(age / 60000)}分前) - 新規収集します`);
              return null;
            }
          }
        } catch (localError) {
          console.log(`[TheOption Analyzer] 🆕 ${asset} の保存データなし - 新規収集します`);
        }
        return null;
      }
    }

    // ========================================
    // TheOption取引時間同期判定
    // ========================================

    /**
     * 現在時刻がエントリータイミング（取引区切り）かどうかを判定
     * @param {number} timeframe - 判定時間（秒）
     * @returns {boolean} - エントリータイミングの場合true
     */
    function isTradeTimingBoundary(timeframe) {
      const now = new Date();
      const seconds = now.getSeconds();
      const minutes = now.getMinutes();

      switch (timeframe) {
        case 15:
          // 15秒: 0, 15, 30, 45秒
          return seconds % 15 === 0;

        case 30:
          // 30秒: 0, 30秒
          return seconds % 30 === 0;

        case 60:
          // 60秒: 毎分0秒
          return seconds === 0;

        case 180:
          // 180秒(3分): 0秒かつ分が3で割り切れる (0, 3, 6, 9...)
          return seconds === 0 && minutes % 3 === 0;

        case 300:
          // 300秒(5分): 0秒かつ分が5で割り切れる (0, 5, 10, 15...)
          return seconds === 0 && minutes % 5 === 0;

        default:
          return false;
      }
    }

    /**
     * 現在時刻が分析実行タイミング（エントリーのprepTime秒前）かどうかを判定
     * @param {number} timeframe - 判定時間（秒）
     * @returns {boolean} - 分析タイミングの場合true
     */
    function isAnalysisTiming(timeframe) {
      const config = TIMEFRAME_CONFIGS[timeframe];
      const prepTime = config.prepTime || 5;
      const secondsUntilEntry = getSecondsUntilNextTiming(timeframe);

      // エントリーのprepTime秒前（±1秒の許容範囲）
      return secondsUntilEntry === prepTime || secondsUntilEntry === prepTime + 1;
    }

    /**
     * 次回のエントリータイミングまでの秒数を計算
     * @param {number} timeframe - 判定時間（秒）
     * @returns {number} - 次回エントリーまでの秒数
     */
    function getSecondsUntilNextTiming(timeframe) {
      const now = new Date();
      const seconds = now.getSeconds();
      const minutes = now.getMinutes();

      switch (timeframe) {
        case 15:
          // 次の15秒区切りまで
          const next15 = Math.ceil((seconds + 1) / 15) * 15;
          return (next15 >= 60 ? 60 : next15) - seconds;

        case 30:
          // 次の30秒区切りまで
          const next30 = Math.ceil((seconds + 1) / 30) * 30;
          return (next30 >= 60 ? 60 : next30) - seconds;

        case 60:
          // 次の分まで
          return seconds === 0 ? 60 : 60 - seconds;

        case 180:
          // 次の3分区切りまで
          const currentTotalSeconds = minutes * 60 + seconds;
          const next180 = Math.ceil((currentTotalSeconds + 1) / 180) * 180;
          return next180 - currentTotalSeconds;

        case 300:
          // 次の5分区切りまで
          const currentTotalSeconds300 = minutes * 60 + seconds;
          const next300 = Math.ceil((currentTotalSeconds300 + 1) / 300) * 300;
          return next300 - currentTotalSeconds300;

        default:
          return 0;
      }
    }

    /**
     * 現在のフェーズを取得
     * @param {number} timeframe - 判定時間（秒）
     * @returns {string} - 'analyzing' | 'ready' | 'waiting'
     */
    function getCurrentPhase(timeframe) {
      const config = TIMEFRAME_CONFIGS[timeframe];
      const prepTime = config.prepTime || 5;
      const secondsUntilEntry = getSecondsUntilNextTiming(timeframe);

      if (secondsUntilEntry <= prepTime && secondsUntilEntry > 0) {
        return 'ready';  // 準備時間（エントリー待ち）
      } else if (secondsUntilEntry === prepTime + 1 || secondsUntilEntry === prepTime + 2) {
        return 'analyzing';  // 分析中
      }
      return 'waiting';  // 次回分析待ち
    }

    // ========================================
    // 価格データ監視
    // ========================================

    function startPriceMonitoring() {
      console.log('[TheOption Analyzer] 📡 価格監視開始');

      let tickCount = 0;
      let lastLogTime = 0;
      let lastAssetCheck = 0;

      // UI更新のスロットリング用（パフォーマンス最適化）
      let lastDisplayedCount = -1;
      let lastDisplayedCountdown = -1;

      priceUpdateInterval = setInterval(async () => {
        const price = getCurrentPriceFromDOM();
        const now = Date.now();

        // 通貨ペア切り替え検出（1秒ごと・サイドパネル即時反映対応）
        if (now - lastAssetCheck > 1000) {
          const detectedAsset = getCurrentAssetPair();

          if (detectedAsset !== currentAsset) {
            if (currentAsset !== null) {
              // 通貨ペアが切り替わった
              console.log(`[TheOption Analyzer] 🔄 通貨ペア切り替え検出: ${currentAsset} → ${detectedAsset}`);

              // 表示キャッシュをクリア（ML学習データは保持）
              timeframeResults = {
                15: null,
                30: null,
                60: null,
                180: null,
                300: null
              };
              // UI更新キャッシュもリセット
              lastDisplayedCount = -1;
              lastDisplayedCountdown = -1;
              console.log('[TheOption Analyzer] 🗑️ 表示キャッシュをクリアしました');

              // ローディング表示
              updateUI({
                status: 'COLLECTING',
                message: `🔄 ${detectedAsset} の分析準備中...`,
                timeframe: currentTimeframe
              });

              // 現在のデータをストレージに保存
              if (currentAsset && priceHistory.length > 0) {
                savePriceData(currentAsset, {
                  priceHistory: priceHistory,
                  tickData: tickData,
                  candles: candles
                });
              }

              // ストレージから復元を試みる
              const savedData = await loadPriceData(detectedAsset);
              if (savedData) {
                priceHistory = [...savedData.priceHistory];
                tickData = [...savedData.tickData];
                candles = [...savedData.candles];
                console.log(`[TheOption Analyzer] 📂 ${detectedAsset} のデータを復元 (${priceHistory.length}件)`);

                // データ復元後、選択中の時間枠のみ分析実行（パフォーマンス最適化）
                const minDataPoints = TIMEFRAME_CONFIGS[currentTimeframe].minDataPoints;
                if (priceHistory.length >= minDataPoints) {
                  console.log(`[TheOption Analyzer] ✨ 復元データで${TIMEFRAME_CONFIGS[currentTimeframe].label}の分析を開始`);
                  performAnalysis(price, { timeframe: currentTimeframe, isTabSwitch: false });
                  lastAnalysisTimes[currentTimeframe] = now;
                }
              } else {
                priceHistory = [];
                tickData = [];
                candles = [];
                console.log(`[TheOption Analyzer] 🆕 ${detectedAsset} のデータ収集を開始`);
              }

              // 機械学習システムも通貨ペア別に切り替え
              mlSystem.setCurrentAsset(detectedAsset);
              mlSystem.initialize(detectedAsset).then(() => {
                console.log(`[TheOption Analyzer] 🧠 ${detectedAsset} のMLシステムを初期化完了`);

                // 価格履歴から過去のML結果を復元（ブラウザ更新時のsetTimeout消失対策）
                if (priceHistory.length > 0) {
                  const restored = mlSystem.restoreResultsFromPriceHistory(priceHistory);
                  if (restored > 0) {
                    console.log(`[TheOption Analyzer] ✨ ${detectedAsset} のML結果を復元: ${restored}件`);
                  }
                }

                // ML初期化完了後にサイドパネルに正しいmlStatsを送信
                const stats = mlSystem.getStatistics();
                console.log(`[TheOption Analyzer] 📊 ML初期化後の統計:`, stats);

                // ML初期化完了後、十分なデータがあれば再分析を実行してAI予測を更新
                const currentPrice = window.theOptionCurrentPrice;
                if (currentPrice && priceHistory.length >= TIMEFRAME_CONFIGS[currentTimeframe].minDataPoints) {
                  console.log(`[TheOption Analyzer] 🔄 通貨ペア切替後のML初期化完了、再分析を実行 (price: ${currentPrice})`);
                  performAnalysis(currentPrice, { timeframe: currentTimeframe, isTabSwitch: false, forceUpdate: true });
                } else {
                  sendAnalysisToSidePanel();
                }
                sendStatusToSidePanel(getSecondsUntilNextTiming(currentTimeframe));
              });

              tickCount = 0;
              priceDetectionLogged = false;
            } else {
              // 初回検出時 - ストレージから復元を試みる
              const savedData = await loadPriceData(detectedAsset);
              if (savedData) {
                priceHistory = [...savedData.priceHistory];
                tickData = [...savedData.tickData];
                candles = [...savedData.candles];
                console.log(`[TheOption Analyzer] 📂 初回起動: ${detectedAsset} のデータを復元 (${priceHistory.length}件)`);

                // データ復元後、選択中の時間枠のみ分析実行（パフォーマンス最適化）
                const minDataPoints = TIMEFRAME_CONFIGS[currentTimeframe].minDataPoints;
                if (priceHistory.length >= minDataPoints) {
                  console.log(`[TheOption Analyzer] ✨ 復元データで${TIMEFRAME_CONFIGS[currentTimeframe].label}の分析を開始`);
                  performAnalysis(price, { timeframe: currentTimeframe, isTabSwitch: false });
                  lastAnalysisTimes[currentTimeframe] = now;
                }
              }

              mlSystem.setCurrentAsset(detectedAsset);

              // 統計情報の更新リスナーを設定（初期化中のデータロードをキャッチするため先に設定）
              mlSystem.onStatsUpdated = (stats) => {
                console.log('[TheOption Analyzer] 📊 ML統計更新:', stats);
                sendAnalysisToSidePanel({ mlStats: stats });
              };

              mlSystem.initialize(detectedAsset).then(() => {
                console.log(`[TheOption Analyzer] 🧠 ${detectedAsset} のMLシステムを初期化完了`);

                // 価格履歴から過去のML結果を復元（ブラウザ更新時のsetTimeout消失対策）
                if (priceHistory.length > 0) {
                  const restored = mlSystem.restoreResultsFromPriceHistory(priceHistory);
                  if (restored > 0) {
                    console.log(`[TheOption Analyzer] ✨ ${detectedAsset} のML結果を復元: ${restored}件`);
                  }
                }

                // 統計情報をログ出力
                const stats = mlSystem.getStatistics();
                console.log('[TheOption Analyzer] 📊 ML初期化後の統計(初回):', stats);

                // ML初期化完了後、十分なデータがあれば再分析を実行してAI予測を更新
                const currentPrice = window.theOptionCurrentPrice;
                if (currentPrice && priceHistory.length >= TIMEFRAME_CONFIGS[currentTimeframe].minDataPoints) {
                  console.log(`[TheOption Analyzer] 🔄 ML初期化完了後の再分析を実行 (price: ${currentPrice})`);
                  performAnalysis(currentPrice, { timeframe: currentTimeframe, isTabSwitch: false, forceUpdate: true });
                } else {
                  // 分析データが足りない場合でもmlStatsだけは送信
                  sendAnalysisToSidePanel({
                    mlStats: stats
                  });
                }
                sendStatusToSidePanel(getSecondsUntilNextTiming(currentTimeframe));
              });
            }

            const previousAsset = currentAsset;
            currentAsset = detectedAsset;
            updateAssetDisplay(currentAsset, priceHistory.length);

            // サイドパネルに即座に通貨ペア変更を通知（mlStats初期化前でもassetとdataCountは即反映）
            try {
              chrome.runtime.sendMessage({
                type: 'ASSET_UPDATE',
                data: {
                  asset: currentAsset,
                  dataCount: priceHistory.length
                }
              }).catch(() => { });
              // ステータス更新も即時送信（通貨ペア情報を含む）
              sendStatusToSidePanel(getSecondsUntilNextTiming(currentTimeframe));
            } catch (e) { }

            // 通貨ペアが変更された場合、UI表示をクリア
            if (previousAsset !== currentAsset) {
              // オーバーレイ削除のため、DOM操作は行わない
              // サイドパネルへのデータ更新は sendAnalysisToSidePanel() で実施
            }
          }

          lastAssetCheck = now;
        }

        if (price) {
          window.theOptionCurrentPrice = price;

          // ティックデータ記録
          const tick = {
            price: price,
            timestamp: Date.now(),
            change: tickData.length > 0 ? price - tickData[tickData.length - 1].price : 0
          };
          tickData.push(tick);
          if (tickData.length > 300) tickData.shift();

          // 価格履歴記録
          priceHistory.push(price);
          if (priceHistory.length > 600) priceHistory.shift();  // 10分間保持（長期MA計算に必要）

          tickCount++;

          // データ件数が変わった時だけUI更新（パフォーマンス最適化）
          if (currentAsset && lastDisplayedCount !== priceHistory.length) {
            updateAssetDisplay(currentAsset, priceHistory.length);
            lastDisplayedCount = priceHistory.length;
          }

          // 30秒ごとに進捗ログとデータ保存（パフォーマンス最適化）
          if (now - lastLogTime > 30000) {
            const config = TIMEFRAME_CONFIGS[currentTimeframe];
            console.log(`[TheOption Analyzer] 📊 ${currentAsset || 'データ'} 収集中: ${priceHistory.length}/${config.minDataPoints}秒 (価格: ${price})`);
            lastLogTime = now;

            // 30秒ごとにストレージに保存（パフォーマンス最適化）
            if (currentAsset && priceHistory.length > 0) {
              savePriceData(currentAsset, {
                priceHistory: priceHistory,
                tickData: tickData,
                candles: candles
              });
            }
          }

          // 全時間枠の並行分析
          const currentConfig = TIMEFRAME_CONFIGS[currentTimeframe];

          // TheOption取引時間同期: 次回タイミングまでの秒数を計算
          const secondsUntilNext = getSecondsUntilNextTiming(currentTimeframe);

          // カウントダウンが変わった時だけUI更新（パフォーマンス最適化）
          // ただし、取引中は毎秒更新する
          const shouldUpdate = lastDisplayedCountdown !== secondsUntilNext || tradingState.isTrading;

          if (shouldUpdate) {
            // エントリータイミングの検出（0秒到達 または サイクル変更）
            // サイクル変更: 前回1-2秒 → 今回が大きい値（次のサイクルに移行）
            const isEntryTiming = !tradingState.isTrading && (
              secondsUntilNext === 0 ||
              (lastDisplayedCountdown <= 2 && lastDisplayedCountdown > 0 && secondsUntilNext > lastDisplayedCountdown)
            );

            if (isEntryTiming) {
              // 現在のシグナルを確認
              const currentResult = timeframeResults[currentTimeframe];
              if (currentResult && currentResult.multiDim) {
                const signals = getCurrentTimeframeSignal(currentResult.multiDim, currentResult.ml);
                const techSignal = signals.technical ? signals.technical.signal : null;
                const aiSignal = signals.ai && signals.ai.available ? signals.ai.signal : null;

                // HIGH/LOWシグナルがある場合のみ取引状態を開始（STRONG_HIGH/STRONG_LOWも含む）
                const hasTechSignal = techSignal === 'HIGH' || techSignal === 'LOW' || techSignal === 'STRONG_HIGH' || techSignal === 'STRONG_LOW';
                const hasAISignal = aiSignal === 'HIGH' || aiSignal === 'LOW';
                if (hasTechSignal || hasAISignal) {
                  tradingState.isTrading = true;
                  tradingState.startTime = Date.now();
                  tradingState.duration = currentTimeframe;
                  tradingState.remainingTime = currentTimeframe;
                  tradingState.timeframe = currentTimeframe;
                  // 取引開始時のシグナルを保存（取引中に保持するため）
                  tradingState.signal = {
                    tech: techSignal,
                    techConfidence: signals.technical ? signals.technical.confidence : null,
                    ai: aiSignal,
                    aiConfidence: signals.ai && signals.ai.available ? signals.ai.confidence : null
                  };
                  console.log(`[TheOption Analyzer] 🎯 取引開始: ${currentTimeframe}秒判定 (シグナル: tech=${techSignal}, ai=${aiSignal})`);
                  // エントリータイミング（0秒）でアラート音を再生（2回目）
                  console.log(`[TheOption Analyzer] 🔔 エントリータイミング: アラート音を再生`);
                  playAlertSound();
                } else {
                  console.log(`[TheOption Analyzer] ⏭️ 見送り: シグナルなし (tech=${techSignal}, ai=${aiSignal})`);
                }
              } else {
                console.log(`[TheOption Analyzer] ⏭️ 見送り: 分析結果なし`);
              }
            }

            updateCountdown(secondsUntilNext);
            lastDisplayedCountdown = secondsUntilNext;
            // サイドパネルにもステータスを送信
            sendStatusToSidePanel(secondsUntilNext);
          }

          // パフォーマンス最適化: 15秒ごとにMLデータ収集（全判定時間のデータを1回だけ計算）
          const timeSinceLastMLCollection = (now - lastMLDataCollectionTime) / 1000;
          if (timeSinceLastMLCollection >= 15) {
            collectMLData(price);
            lastMLDataCollectionTime = now;
          }

          // TheOption取引時間同期: エントリーのprepTime秒前に分析実行
          // 選択中の時間枠のみ分析実行（パフォーマンス最適化: CPU負荷80%削減）
          const config = TIMEFRAME_CONFIGS[currentTimeframe];
          const timeSinceLastAnalysis = (now - lastAnalysisTimes[currentTimeframe]) / 1000;
          const prepTime = config.prepTime || 5;

          // 分析タイミング（エントリーのprepTime秒前）かつ、前回分析から最低2秒経過している場合に実行
          // 取引中は分析しない（重複実行防止のため2秒間隔チェック）
          if (!tradingState.isTrading && isAnalysisTiming(currentTimeframe) && timeSinceLastAnalysis >= 2) {
            const dateTime = new Date();
            const timeStr = `${dateTime.getHours()}:${String(dateTime.getMinutes()).padStart(2, '0')}:${String(dateTime.getSeconds()).padStart(2, '0')}`;
            const secondsUntilEntry = getSecondsUntilNextTiming(currentTimeframe);
            console.log(`[TheOption Analyzer] ⏰ 分析実行: ${timeStr} (${TIMEFRAME_CONFIGS[currentTimeframe].label}) - エントリーまで${secondsUntilEntry}秒`);

            performAnalysis(price, { timeframe: currentTimeframe });
            lastAnalysisTimes[currentTimeframe] = now;
            lastAnalysisTime = now;
          }
        } else {
          // 価格が取得できない場合
          if (now - lastLogTime > 5000) {
            console.warn('[TheOption Analyzer] ⚠️ 価格取得失敗 - TheOptionのページが読み込まれていますか？');
            lastLogTime = now;
          }
        }
      }, 1000); // TheOption取引時間同期のため1秒ごとに監視
    }

    // ========================================
    // MLデータ収集（パフォーマンス最適化）
    // ========================================
    // 全判定時間のデータを15秒ごとに1回だけ計算
    // 各判定時間は事前計算されたデータを使用して予測のみ実行

    function collectMLData(currentPrice) {
      console.log('[TheOption Analyzer] 🔄 MLデータ収集開始（全判定時間）');

      // 最低データ数チェック（15秒判定の要件を満たせば全判定時間のデータ収集可能）
      const minConfig = TIMEFRAME_CONFIGS[15];
      if (priceHistory.length < minConfig.minDataPoints) {
        console.log('[TheOption Analyzer] ⏳ データ不足のためMLデータ収集スキップ');
        return;
      }

      // 時間枠に応じたデータ範囲を取得（最大の300秒用）
      const maxConfig = TIMEFRAME_CONFIGS[300];
      const relevantPrices = priceHistory.slice(-maxConfig.dataWindow);
      const relevantTicks = tickData.slice(-maxConfig.dataWindow);

      // ローソク足生成
      const candles = generateCandles(relevantPrices);
      if (candles.length === 0) {
        console.log('[TheOption Analyzer] ⚠️ ローソク足生成失敗 - MLデータ収集スキップ');
        return;
      }

      // 多次元分析（代表として60秒を使用、V2アーキテクチャ対応）
      let multiDimResult;
      try {
        if (multiDimAnalyzer.analyzeV2) {
          multiDimResult = multiDimAnalyzer.analyzeV2({
            prices: relevantPrices,
            candles: candles,
            ticks: relevantTicks
          }, 60, currentAsset);
        } else {
          // V2が利用できない場合のフォールバック（デフォルト閾値5を使用）
          multiDimResult = multiDimAnalyzer.analyzeTimeframe({
            prices: relevantPrices,
            candles: candles,
            ticks: relevantTicks
          }, 60, currentAsset, 5);
        }
      } catch (error) {
        console.error('[TheOption Analyzer] 多次元分析エラー:', error);
        return;
      }

      // テクニカル指標を記録
      const currentIndicators = {
        rsi: 50,
        macdStrength: multiDimResult.breakdown.macd.strength,
        stochasticK: multiDimResult.breakdown.stochastic.k,
        adxValue: multiDimResult.breakdown.adx.adx,
        rocValue: multiDimResult.breakdown.roc.roc,
        ma5: priceHistory.slice(-5).reduce((a, b) => a + b) / 5,
        ma20: priceHistory.length >= 20 ? priceHistory.slice(-20).reduce((a, b) => a + b) / 20 : currentPrice
      };
      techTimeSeriesAnalyzer.recordIndicators(currentIndicators);

      // 全判定時間のテクニカル指標時系列分析
      const techTimeSeries15s = techTimeSeriesAnalyzer.analyzeTimeframe(15);
      const techTimeSeries30s = techTimeSeriesAnalyzer.analyzeTimeframe(30);
      const techTimeSeries60s = techTimeSeriesAnalyzer.analyzeTimeframe(60);
      const techTimeSeries180s = techTimeSeriesAnalyzer.analyzeTimeframe(180);
      const techTimeSeries300s = techTimeSeriesAnalyzer.analyzeTimeframe(300);

      // 全判定時間の価格パターン分析
      const pricePatternAnalyzer = new window.PricePatternAnalyzer();
      const pricePattern15s = pricePatternAnalyzer.analyze(priceHistory, 15);
      const pricePattern30s = pricePatternAnalyzer.analyze(priceHistory, 30);
      const pricePattern60s = pricePatternAnalyzer.analyze(priceHistory, 60);
      const pricePattern180s = pricePatternAnalyzer.analyze(priceHistory, 180);
      const pricePattern300s = pricePatternAnalyzer.analyze(priceHistory, 300);

      // 全判定時間の詳細セグメント分析
      const atrPercent = multiDimResult.breakdown.atr.atrPercent;
      const priceSegments15s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 15, atrPercent);
      const priceSegments30s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 30, atrPercent);
      const priceSegments60s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 60, atrPercent);
      const priceSegments180s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 180, atrPercent);
      const priceSegments300s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 300, atrPercent);

      // データをキャッシュに保存
      cachedMLData = {
        currentPrice: currentPrice,
        currentIndicators: currentIndicators,
        multiDimResult: multiDimResult,
        atrPercent: atrPercent,

        // 全判定時間のデータ
        techTimeSeries: {
          '15s': techTimeSeries15s,
          '30s': techTimeSeries30s,
          '60s': techTimeSeries60s,
          '180s': techTimeSeries180s,
          '300s': techTimeSeries300s
        },
        pricePattern: {
          '15s': pricePattern15s,
          '30s': pricePattern30s,
          '60s': pricePattern60s,
          '180s': pricePattern180s,
          '300s': pricePattern300s
        },
        priceSegments: {
          '15s': priceSegments15s,
          '30s': priceSegments30s,
          '60s': priceSegments60s,
          '180s': priceSegments180s,
          '300s': priceSegments300s
        },

        timestamp: Date.now()
      };

      console.log('[TheOption Analyzer] ✅ MLデータ収集完了（全判定時間のデータを1回だけ計算）');
    }

    // ========================================
    // 統合分析実行
    // ========================================

    async function performAnalysis(currentPrice, options = {}) {
      const targetTimeframe = options.timeframe || currentTimeframe;
      const config = TIMEFRAME_CONFIGS[targetTimeframe];
      const isTabSwitch = options.isTabSwitch || false;

      // 時間枠に応じた最低データ数をチェック
      if (priceHistory.length < config.minDataPoints) {
        // 選択中の時間枠の場合のみUI更新
        if (targetTimeframe === currentTimeframe) {
          updateUI({
            status: 'COLLECTING',
            message: `データ収集中... (${priceHistory.length}/${config.minDataPoints}秒)`,
            timeframe: targetTimeframe
          });
        }
        return;
      }

      console.log('[TheOption Analyzer] 分析開始:', {
        timeframe: config.label,
        priceCount: priceHistory.length,
        tickCount: tickData.length,
        currentPrice: currentPrice,
        updateInterval: `${config.updateInterval}秒ごと`,
        isTabSwitch: isTabSwitch,
        最新5件の価格: priceHistory.slice(-5)
      });

      // 時間枠に応じたデータ範囲を取得
      const relevantPrices = priceHistory.slice(-config.dataWindow);
      const relevantTicks = tickData.slice(-config.dataWindow);

      // ダミーローソク足生成（簡易版）
      candles = generateCandles(relevantPrices);

      if (candles.length === 0) {
        console.error('[TheOption Analyzer] ローソク足生成失敗');
        if (targetTimeframe === currentTimeframe) {
          updateUI({
            status: 'COLLECTING',
            message: `データ収集中... (${priceHistory.length}/${config.minDataPoints}秒)`,
            timeframe: targetTimeframe
          });
        }
        return;
      }

      console.log('[TheOption Analyzer] ローソク足生成完了:', candles.length);

      // 多次元分析（V2アーキテクチャを優先使用）
      let multiDimResult;
      try {
        // V2アナライザーの場合はanalyzeV2を使用
        console.log(`[TheOption Analyzer] 🔄 analyzeV2メソッド存在確認: ${!!multiDimAnalyzer.analyzeV2}`);
        if (multiDimAnalyzer.analyzeV2) {
          console.log(`[TheOption Analyzer] 📡 V2分析呼び出し開始 - ${config.label}`);
          multiDimResult = multiDimAnalyzer.analyzeV2({
            prices: relevantPrices,
            candles: candles,
            ticks: relevantTicks
          }, targetTimeframe, currentAsset);
          console.log(`[TheOption Analyzer] ${config.label} V2多次元分析完了:`, {
            signal: multiDimResult.signal,
            confidence: multiDimResult.confidence,
            phase: multiDimResult.phase,
            trendDirection: multiDimResult.trendDirection,
            resistanceBlocked: multiDimResult.resistanceBlocked
          });
        } else {
          // レガシーアナライザーの場合（後方互換性、デフォルト閾値5を使用）
          multiDimResult = multiDimAnalyzer.analyzeTimeframe({
            prices: relevantPrices,
            candles: candles,
            ticks: relevantTicks
          }, targetTimeframe, currentAsset, 5);
          console.log(`[TheOption Analyzer] ${config.label} 多次元分析完了:`, multiDimResult);
        }
      } catch (error) {
        console.error(`[TheOption Analyzer] ${config.label} 多次元分析エラー:`, error);
        return;
      }

      // パフォーマンス最適化: 事前計算されたMLデータを使用
      let currentIndicators, atrPercent;
      let techTimeSeries15s, techTimeSeries30s, techTimeSeries60s, techTimeSeries180s, techTimeSeries300s;
      let pricePattern15s, pricePattern30s, pricePattern60s, pricePattern180s, pricePattern300s;
      let priceSegments15s, priceSegments30s, priceSegments60s, priceSegments180s, priceSegments300s;

      if (cachedMLData && !isTabSwitch) {
        // 事前計算されたデータを使用（67%パフォーマンス向上）
        console.log(`[TheOption Analyzer] ⚡ ${config.label} キャッシュされたMLデータを使用`);
        currentIndicators = cachedMLData.currentIndicators;
        atrPercent = cachedMLData.atrPercent;

        techTimeSeries15s = cachedMLData.techTimeSeries['15s'];
        techTimeSeries30s = cachedMLData.techTimeSeries['30s'];
        techTimeSeries60s = cachedMLData.techTimeSeries['60s'];
        techTimeSeries180s = cachedMLData.techTimeSeries['180s'];
        techTimeSeries300s = cachedMLData.techTimeSeries['300s'];

        pricePattern15s = cachedMLData.pricePattern['15s'];
        pricePattern30s = cachedMLData.pricePattern['30s'];
        pricePattern60s = cachedMLData.pricePattern['60s'];
        pricePattern180s = cachedMLData.pricePattern['180s'];
        pricePattern300s = cachedMLData.pricePattern['300s'];

        priceSegments15s = cachedMLData.priceSegments['15s'];
        priceSegments30s = cachedMLData.priceSegments['30s'];
        priceSegments60s = cachedMLData.priceSegments['60s'];
        priceSegments180s = cachedMLData.priceSegments['180s'];
        priceSegments300s = cachedMLData.priceSegments['300s'];
      } else {
        // キャッシュがない場合は従来通り計算（後方互換性）
        console.log(`[TheOption Analyzer] 🔄 ${config.label} MLデータを計算`);

        currentIndicators = {
          rsi: 50,
          macdStrength: multiDimResult.breakdown.macd.strength,
          stochasticK: multiDimResult.breakdown.stochastic.k,
          adxValue: multiDimResult.breakdown.adx.adx,
          rocValue: multiDimResult.breakdown.roc.roc,
          ma5: priceHistory.slice(-5).reduce((a, b) => a + b) / 5,
          ma20: priceHistory.length >= 20 ? priceHistory.slice(-20).reduce((a, b) => a + b) / 20 : currentPrice
        };
        techTimeSeriesAnalyzer.recordIndicators(currentIndicators);

        techTimeSeries15s = techTimeSeriesAnalyzer.analyzeTimeframe(15);
        techTimeSeries30s = techTimeSeriesAnalyzer.analyzeTimeframe(30);
        techTimeSeries60s = techTimeSeriesAnalyzer.analyzeTimeframe(60);
        techTimeSeries180s = techTimeSeriesAnalyzer.analyzeTimeframe(180);
        techTimeSeries300s = techTimeSeriesAnalyzer.analyzeTimeframe(300);

        const pricePatternAnalyzer = new window.PricePatternAnalyzer();
        pricePattern15s = pricePatternAnalyzer.analyze(priceHistory, 15);
        pricePattern30s = pricePatternAnalyzer.analyze(priceHistory, 30);
        pricePattern60s = pricePatternAnalyzer.analyze(priceHistory, 60);
        pricePattern180s = pricePatternAnalyzer.analyze(priceHistory, 180);
        pricePattern300s = pricePatternAnalyzer.analyze(priceHistory, 300);

        atrPercent = multiDimResult.breakdown.atr.atrPercent;
        priceSegments15s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 15, atrPercent);
        priceSegments30s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 30, atrPercent);
        priceSegments60s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 60, atrPercent);
        priceSegments180s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 180, atrPercent);
        priceSegments300s = detailedSegmentAnalyzer.analyzePriceSegments(priceHistory, 300, atrPercent);
      }

      // テクニカル指標の詳細セグメント分析（各指標の動きを詳細に分析）
      // 注: 現在は価格セグメントのみ実装。将来的にテクニカル指標のセグメント分析も追加可能

      // 機械学習用の状況データ
      const currentSituation = {
        // 通貨ペア名（コンテキスト対応の形状分類に使用）
        assetName: currentAsset || 'UNKNOWN',

        price: currentPrice,
        rsi: 50, // ダミー
        ma5: currentIndicators.ma5,
        ma20: currentIndicators.ma20,
        macdStrength: currentIndicators.macdStrength,
        adxValue: currentIndicators.adxValue,
        stochasticK: currentIndicators.stochasticK,
        atrPercent: multiDimResult.breakdown.atr.atrPercent,
        rocValue: currentIndicators.rocValue,
        sentimentScore: multiDimResult.breakdown.sentiment.upRatio,

        // 価格パターン特徴量（判定時間ごと）
        pricePattern15s: pricePattern15s,
        pricePattern30s: pricePattern30s,
        pricePattern60s: pricePattern60s,
        pricePattern180s: pricePattern180s,
        pricePattern300s: pricePattern300s,

        // テクニカル指標の時系列データ（判定時間ごと）
        techTimeSeries15s: techTimeSeries15s,
        techTimeSeries30s: techTimeSeries30s,
        techTimeSeries60s: techTimeSeries60s,
        techTimeSeries180s: techTimeSeries180s,
        techTimeSeries300s: techTimeSeries300s,

        // 詳細セグメント分析データ（判定時間ごと）
        priceSegments15s: priceSegments15s,
        priceSegments30s: priceSegments30s,
        priceSegments60s: priceSegments60s,
        priceSegments180s: priceSegments180s,
        priceSegments300s: priceSegments300s,

        hour: new Date().getHours(),
        minute: new Date().getMinutes(),
        dayOfWeek: new Date().getDay()
      };

      // データ収集（タブ切り替え時はスキップ）
      if (!isTabSwitch) {
        try {
          // 価格パターン + テクニカル時系列 + 詳細セグメント情報を含めてMLシステムに渡す
          mlSystem.startCollecting({ currentPrice }, {
            multiDim: multiDimResult,
            pricePattern15s: pricePattern15s,
            pricePattern30s: pricePattern30s,
            pricePattern60s: pricePattern60s,
            pricePattern180s: pricePattern180s,
            pricePattern300s: pricePattern300s,
            techTimeSeries15s: techTimeSeries15s,
            techTimeSeries30s: techTimeSeries30s,
            techTimeSeries60s: techTimeSeries60s,
            techTimeSeries180s: techTimeSeries180s,
            techTimeSeries300s: techTimeSeries300s,
            priceSegments15s: priceSegments15s,
            priceSegments30s: priceSegments30s,
            priceSegments60s: priceSegments60s,
            priceSegments180s: priceSegments180s,
            priceSegments300s: priceSegments300s
          });
          console.log('[TheOption Analyzer] ML データ収集開始（価格パターン + テクニカル時系列 + 詳細セグメント含む）');
        } catch (error) {
          console.error('[TheOption Analyzer] ML データ収集エラー:', error);
        }
      } else {
        console.log('[TheOption Analyzer] ⏭️ タブ切り替えのため、MLデータ収集をスキップ');
      }

      // 🔬 診断: 最新データのセグメント情報を確認
      if (currentSituation.priceSegments15s) {
        console.log('[🔬 診断] 最新データのセグメント情報:', {
          pattern: currentSituation.priceSegments15s.pattern,
          segments: currentSituation.priceSegments15s.segments?.map(s => s.direction),
          volatility: currentSituation.priceSegments15s.volatility
        });
      } else {
        console.warn('[🔬 診断] ⚠️ 最新データにpriceSegments15sがありません！');
      }

      // AI予測（選択中の時間枠のみ - パフォーマンス最適化: CPU負荷80%削減）
      let mlPredictions;
      try {
        mlPredictions = await mlSystem.predictOne(currentSituation, targetTimeframe, currentSimilarityThreshold, currentDataLimit);
        const limitText = currentDataLimit === null ? '全期間' : `直近${currentDataLimit}件`;
        console.log(`[TheOption Analyzer] ML 予測完了（${targetTimeframe}秒, 閾値: ${currentSimilarityThreshold}%, データ: ${limitText}）:`, mlPredictions);

        // データ使用状況の詳細ログ
        if (mlPredictions.status === 'READY') {
          console.log(`[TheOption Analyzer] 📊 データ使用状況:`, {
            設定: limitText,
            総データ数: mlPredictions.dataCount,
            結果記録済み: mlPredictions.dataCountWithResults,
            検索対象: mlPredictions.searchedDataCount,
            使用率: `${((mlPredictions.searchedDataCount / mlPredictions.dataCountWithResults) * 100).toFixed(1)}%`
          });
        }
      } catch (error) {
        console.error('[TheOption Analyzer] ML 予測エラー:', error);
        mlPredictions = { status: 'ERROR', predictions: {} };
      }

      // 3段階トレンド分析
      const hierarchicalTrend = getHierarchicalTrend(targetTimeframe);

      // 履歴記録（パフォーマンス最適化のため無効化）
      // if (!isTabSwitch) {
      //   try {
      //     recordPrediction(targetTimeframe, mlPredictions, multiDimResult);
      //     recordTrend(targetTimeframe, hierarchicalTrend, multiDimResult);
      //   } catch (error) {
      //     console.error('[TheOption Analyzer] 履歴記録エラー:', error);
      //   }
      // }

      // 分析結果をキャッシュに保存（currentSituationも保存して閾値変更時に使用）
      timeframeResults[targetTimeframe] = {
        multiDim: multiDimResult,
        ml: mlPredictions,
        mlStats: mlSystem.getStatistics(),
        currentSituation: currentSituation,  // 閾値変更時の再計算用
        timestamp: Date.now()
      };
      console.log(`[TheOption Analyzer] ✅ ${config.label}の分析結果をキャッシュに保存しました`);

      // シグナルが出た場合にアラート音を鳴らす（選択中の時間枠のみ）
      // テクニカル: HIGH/LOW/STRONG_HIGH/STRONG_LOW
      // AI: HIGH/LOW + 傾向(20pt差以上)
      if (targetTimeframe === currentTimeframe && !isTabSwitch) {
        const techSignal = multiDimResult?.signal;
        // 注意: predictionsのキーは '15s', '30s' などの文字列形式
        const predictionKey = `${targetTimeframe}s`;
        const mlPred = mlPredictions?.predictions?.[predictionKey];
        const hasTechSignal = techSignal === 'HIGH' || techSignal === 'LOW' || techSignal === 'STRONG_HIGH' || techSignal === 'STRONG_LOW';

        // AI予測のシグナル判定（60%シグナル + 20pt差傾向）
        let hasAISignal = false;
        if (mlPred && mlPred.prediction !== 'INSUFFICIENT_DATA') {
          const upRate = mlPred.upRate || 0;
          const downRate = mlPred.downRate || 0;
          const drawRate = 100 - upRate - downRate;
          const diff = Math.abs(upRate - downRate);

          // 同値率30%以下で、60%シグナルまたは20pt差傾向がある場合
          if (drawRate <= 30 && (upRate >= 60 || downRate >= 60 || diff >= 20)) {
            hasAISignal = true;
          }
        }

        if (hasTechSignal || hasAISignal) {
          console.log(`[TheOption Analyzer] 🔔 シグナル検出: Tech=${techSignal}, AI=${hasAISignal ? '傾向あり' : 'なし'} - アラート音を再生`);
          playAlertSound();
        }
      }

      // サイドパネルにデータを送信
      sendAnalysisToSidePanel();

      // UI更新（選択中の時間枠の場合のみ）
      if (targetTimeframe === currentTimeframe) {
        try {
          updateUI({
            status: 'ACTIVE',
            multiDim: multiDimResult,
            ml: mlPredictions,
            mlStats: mlSystem.getStatistics()
          });
          console.log(`[TheOption Analyzer] ${config.label} UI更新完了`);
        } catch (error) {
          console.error(`[TheOption Analyzer] ${config.label} UI更新エラー:`, error);
        }
      } else {
        console.log(`[TheOption Analyzer] ${config.label} バックグラウンド分析完了（UI更新なし）`);
      }
    }

    // ========================================
    // UI更新（オーバーレイ削除後は何もしない）
    // ========================================

    function updateUI(data) {
      // オーバーレイ削除のため、この関数は何もしない
      // サイドパネルへのデータ送信は sendAnalysisToSidePanel() で行う
    }

    function updateMainSignal(techSignal, aiSignal, dataCount) {
      // オーバーレイ削除のため、この関数は何もしない
    }

    function getCurrentTimeframeSignal(multiDim, ml) {
      // テクニカル分析の結果
      const techSignal = multiDim.signal;
      const techConf = multiDim.confidence;

      let techDirection;
      if (techSignal === 'HIGH') {
        techDirection = 'HIGH';
      } else if (techSignal === 'LOW') {
        techDirection = 'LOW';
      } else {
        techDirection = '見送り';
      }

      const technical = {
        signal: techSignal,
        confidence: techConf,
        direction: techDirection,
        timeframe: TIMEFRAME_CONFIGS[currentTimeframe].label
      };

      // AI予測の結果
      let ai = {
        available: false,
        mlDataCount: ml.dataCountWithResults || ml.dataCount || 0,
        mlDataTotal: ml.dataCount || 0
      };

      if (ml.status === 'READY' && ml.predictions[`${currentTimeframe}s`]) {
        const mlPred = ml.predictions[`${currentTimeframe}s`];
        const upRate = mlPred.upRate || 0;
        const downRate = mlPred.downRate || 0;
        const drawRate = 100 - upRate - downRate;
        const diff = Math.abs(upRate - downRate);

        // === AI予測シグナル判定ロジック ===
        // 優先度: 1.同値率チェック → 2.60%シグナル → 3.20pt差傾向 → 4.見送り
        let aiSignal = mlPred.prediction;
        let aiDirection = '見送り';

        if (drawRate > 30) {
          // 同値率が30%超え → 見送り
          aiSignal = 'NEUTRAL';
          aiDirection = '見送り';
        } else if (upRate >= 60) {
          // 上昇60%以上 → HIGHシグナル
          aiSignal = 'HIGH';
          aiDirection = 'HIGH';
        } else if (downRate >= 60) {
          // 下降60%以上 → LOWシグナル
          aiSignal = 'LOW';
          aiDirection = 'LOW';
        } else if (diff >= 20) {
          // 20pt以上の差がある → 傾向表示
          if (upRate > downRate) {
            aiSignal = 'TREND_HIGH';
            aiDirection = '上昇傾向';
          } else {
            aiSignal = 'TREND_LOW';
            aiDirection = '下降傾向';
          }
        } else {
          // それ以外 → 見送り
          aiSignal = 'NEUTRAL';
          aiDirection = '見送り';
        }

        ai = {
          available: aiSignal !== 'NEUTRAL' && aiSignal !== 'INSUFFICIENT_DATA',
          signal: aiSignal,
          confidence: mlPred.confidence,
          direction: aiDirection,
          timeframe: TIMEFRAME_CONFIGS[currentTimeframe].label,
          mlDataCount: ml.dataCountWithResults || ml.dataCount || 0,
          mlDataTotal: ml.dataCount || 0,
          upRate: upRate,
          downRate: downRate,
          diff: diff
        };
      }

      return { technical, ai };
    }

    function updateSignalLights(multiDim, ml) {
      // オーバーレイ削除のため、この関数は何もしない
    }

    function updateMLStatus(stats) {
      // オーバーレイ削除のため、この関数は何もしない
    }

    // ========================================
    // 時間枠別分析設定
    // ========================================
    const TIMEFRAME_ANALYSIS_CONFIG = {
      15: {
        name: '15秒',
        // 分析対象期間（秒）: 15秒判定なら30-45秒の履歴を見る
        analysisWindow: 45,
        // 判定閾値: 短い時間枠ほど大きな動きが必要
        trendThreshold: 35,      // score > 35 で上昇/下降判定（デフォルト20）
        // スコアのスムージング係数（0-1）: 高いほど過去の値を重視
        smoothingFactor: 0.6,
        // 直近価格の方向性チェック件数
        directionCheckCount: 5,
        // 価格の一方向動き最低回数
        minDirectionalMoves: 3,
        // 強度計算の重み調整
        weights: {
          adx: 0.8,       // 短期ではADXの信頼性が下がる
          macd: 0.7,      // MACDも短期では信頼性低下
          atr: 1.2,       // ボラティリティは重要
          agreement: 1.0,
          direction: 1.5  // 価格の直近動きを重視
        }
      },
      30: {
        name: '30秒',
        analysisWindow: 90,
        trendThreshold: 30,
        smoothingFactor: 0.5,
        directionCheckCount: 8,
        minDirectionalMoves: 5,
        weights: {
          adx: 0.9,
          macd: 0.8,
          atr: 1.1,
          agreement: 1.0,
          direction: 1.3
        }
      },
      60: {
        name: '1分',
        analysisWindow: 180,
        trendThreshold: 25,
        smoothingFactor: 0.4,
        directionCheckCount: 10,
        minDirectionalMoves: 6,
        weights: {
          adx: 1.0,
          macd: 1.0,
          atr: 1.0,
          agreement: 1.0,
          direction: 1.0
        }
      },
      180: {
        name: '3分',
        analysisWindow: 540,
        trendThreshold: 20,
        smoothingFactor: 0.3,
        directionCheckCount: 15,
        minDirectionalMoves: 8,
        weights: {
          adx: 1.1,
          macd: 1.1,
          atr: 0.9,
          agreement: 1.1,
          direction: 0.8
        }
      },
      300: {
        name: '5分',
        analysisWindow: 900,
        trendThreshold: 18,
        smoothingFactor: 0.2,
        directionCheckCount: 20,
        minDirectionalMoves: 10,
        weights: {
          adx: 1.2,
          macd: 1.2,
          atr: 0.8,
          agreement: 1.2,
          direction: 0.6
        }
      }
    };

    // スムージング用の過去スコア履歴を保持
    const scoreHistory = {};

    // スコアをスムージングする関数
    function smoothScore(currentScore, timeframeSec, assetKey = 'default') {
      const config = TIMEFRAME_ANALYSIS_CONFIG[timeframeSec] || TIMEFRAME_ANALYSIS_CONFIG[60];
      const key = `${assetKey}_${timeframeSec}`;

      if (!scoreHistory[key]) {
        scoreHistory[key] = [];
      }

      // 現在のスコアを履歴に追加
      scoreHistory[key].push(currentScore);

      // 履歴の最大件数を制限（時間枠に応じて）
      const maxHistory = timeframeSec <= 30 ? 5 : 3;
      if (scoreHistory[key].length > maxHistory) {
        scoreHistory[key].shift();
      }

      // 指数移動平均（EMA）でスムージング
      const factor = config.smoothingFactor;
      let smoothed = scoreHistory[key][0];
      for (let i = 1; i < scoreHistory[key].length; i++) {
        smoothed = factor * smoothed + (1 - factor) * scoreHistory[key][i];
      }

      return smoothed;
    }

    // ========================================
    // 包括的なトレンド強度計算（時間枠対応版）
    // ========================================

    function calculateComprehensiveTrendStrength(multiDim, priceHistory, timeframeSec = 60) {
      const config = TIMEFRAME_ANALYSIS_CONFIG[timeframeSec] || TIMEFRAME_ANALYSIS_CONFIG[60];
      const weights = config.weights;
      const breakdown = multiDim.breakdown;

      // 1. ADXスコア（0-25点）× 時間枠別重み
      // ADX 0-100 を 0-25点にスケーリング
      const adxScore = Math.min(breakdown.adx.adx / 4, 25) * weights.adx;

      // 2. MACD強度スコア（0-25点）× 時間枠別重み
      // MACD strengthは通常0-10程度なので、5倍してキャップ
      const macdStrength = Math.abs(breakdown.macd.strength);
      const macdScore = Math.min(macdStrength * 5, 25) * weights.macd;

      // 3. ATRスコア（ボラティリティ）（0-20点）× 時間枠別重み
      // ATR%は通常0-5%程度なので、4倍してキャップ
      const atrPercent = breakdown.atr.atrPercent;
      const atrScore = Math.min(atrPercent * 4, 20) * weights.atr;

      // 4. 指標の一致度スコア（0-20点）× 時間枠別重み
      // 全ての主要指標が同じ方向を示しているか
      const mainSignal = multiDim.signal;
      const indicators = [
        breakdown.macd.signal,
        breakdown.roc.signal,
        breakdown.stochastic.signal
      ];

      const agreement = indicators.filter(s => s === mainSignal).length;
      const agreementScore = (agreement / indicators.length) * 20 * weights.agreement;

      // 5. 価格の方向性スコア（0-10点）× 時間枠別重み
      // 時間枠に応じた件数で直近価格をチェック
      let directionScore = 0;
      const checkCount = config.directionCheckCount;
      const minMoves = config.minDirectionalMoves;

      if (priceHistory && priceHistory.length >= checkCount) {
        const recentPrices = priceHistory.slice(-checkCount);
        const increases = recentPrices.filter((p, i) => i > 0 && p > recentPrices[i - 1]).length;
        const decreases = recentPrices.filter((p, i) => i > 0 && p < recentPrices[i - 1]).length;

        // 時間枠に応じた最低回数以上動いていたら加点
        const maxDirectional = Math.max(increases, decreases);
        if (maxDirectional >= minMoves) {
          directionScore = Math.min((maxDirectional / (checkCount - 1)) * 10, 10) * weights.direction;
        }
      }

      // 総合強度（0-100点に正規化）
      // 重み付け後の最大スコアを計算して正規化
      const maxPossibleScore = 25 * weights.adx + 25 * weights.macd + 20 * weights.atr + 20 * weights.agreement + 10 * weights.direction;
      const rawTotal = adxScore + macdScore + atrScore + agreementScore + directionScore;
      const normalizedStrength = (rawTotal / maxPossibleScore) * 100;

      return {
        total: Math.round(normalizedStrength),
        breakdown: {
          adx: Math.round(adxScore),
          macd: Math.round(macdScore),
          atr: Math.round(atrScore),
          agreement: Math.round(agreementScore),
          direction: Math.round(directionScore)
        },
        config: {
          timeframe: timeframeSec,
          threshold: config.trendThreshold
        }
      };
    }

    function getTrendStrengthLevel(strength) {
      if (strength >= 81) return 'S級';
      if (strength >= 61) return 'A級';
      if (strength >= 41) return 'B級';
      if (strength >= 21) return 'C級';
      if (strength >= 11) return 'D級';
      return 'E級';
    }

    function updateHierarchicalTrend() {
      // オーバーレイ削除のため、この関数は何もしない
    }

    function updateDetails(multiDim, ml) {
      // オーバーレイ削除のため、この関数は何もしない
    }

    function updateAssetDisplay(assetName, dataCount) {
      // サイドパネルにストレージ経由でデータを反映
      try {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            sidepanel_asset: assetName || '検出中...',
            sidepanel_dataCount: dataCount,
            sidepanel_timestamp: Date.now()
          }).catch(() => { });
        }
      } catch (e) {
        // ストレージエラーは無視
      }
    }


    // ========================================
    // ダミーローソク足生成
    // ========================================

    function generateCandles(prices) {
      const candles = [];
      const candleSize = 10;

      for (let i = 0; i < prices.length; i += candleSize) {
        const segment = prices.slice(i, i + candleSize);
        if (segment.length < candleSize) break;

        candles.push({
          open: segment[0],
          high: Math.max(...segment),
          low: Math.min(...segment),
          close: segment[segment.length - 1]
        });
      }

      return candles;
    }

    // ========================================
    // 通貨ペア検出
    // ========================================

    /**
     * 通貨ペア名を正規化（モード表示を除去）
     * 例: "AUD/JPY (Demo)" → "AUD/JPY"
     *     "AUD/JPY デモ" → "AUD/JPY"
     *     "AUD/JPY [リアル]" → "AUD/JPY"
     */
    function normalizeAssetName(assetName) {
      if (!assetName) return assetName;

      // モード表示を除去するパターン
      return assetName
        .replace(/\s*[\(（].*?[\)）]\s*/g, '')  // (Demo), （デモ）など
        .replace(/\s*[\[【].*?[\]】]\s*/g, '')  // [リアル], 【デモ】など
        .replace(/\s*(demo|デモ|real|リアル|practice|プラクティス)\s*$/gi, '')  // 末尾のモード表示
        .trim();
    }

    function getCurrentAssetPair() {
      let detectedPairs = [];

      // 方法1: 通貨ペア表示要素から取得（拡張版）
      const assetSelectors = [
        '.asset-name', '.pair-name', '.currency-pair', '.symbol', '.asset', '.pair',
        '[class*="asset"]', '[class*="pair"]', '[class*="symbol"]', '[class*="currency"]',
        '[class*="Asset"]', '[class*="Pair"]', '[class*="Symbol"]'
      ];

      for (const selector of assetSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.trim();
            // 通貨ペアパターン（USD/JPY, USDJPY, EUR/USD など）
            const pairMatch = text.match(/\b([A-Z]{3})[\/\s-]?([A-Z]{3})\b/);
            if (pairMatch && text.length < 30) {  // 30文字以下に制限
              const pair = `${pairMatch[1]}/${pairMatch[2]}`;
              detectedPairs.push({ pair, method: `セレクタ: ${selector}`, element: el });
            }
          }
        } catch (e) {
          // セレクタエラーを無視
        }
      }

      // 方法2: activeクラスを持つ要素から優先的に取得
      const activeElements = document.querySelectorAll('.active, [class*="active"], [class*="selected"], [class*="current"]');
      for (const el of activeElements) {
        const text = el.textContent.trim();
        const pairMatch = text.match(/\b([A-Z]{3})[\/\s-]?([A-Z]{3})\b/);
        if (pairMatch && text.length < 30) {
          const pair = normalizeAssetName(`${pairMatch[1]}/${pairMatch[2]}`);
          // activeな要素は最優先
          console.log(`[TheOption Analyzer] 💱 通貨ペア検出: ${pair} (active要素, 正規化済み)`);
          return pair;
        }
      }

      // 方法3: data属性から取得
      const dataSelectors = ['[data-asset]', '[data-pair]', '[data-symbol]', '[data-currency]', '[data-instrument]'];
      for (const selector of dataSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const asset = el.dataset.asset || el.dataset.pair || el.dataset.symbol ||
              el.dataset.currency || el.dataset.instrument;
            if (asset) {
              // USDJPY → USD/JPY に変換
              const formatted = asset.match(/^([A-Z]{3})([A-Z]{3})$/)
                ? `${asset.substring(0, 3)}/${asset.substring(3, 6)}`
                : asset;
              const normalized = normalizeAssetName(formatted);
              console.log(`[TheOption Analyzer] 💱 通貨ペア検出: ${normalized} (data属性: ${selector}, 正規化済み)`);
              return normalized;
            }
          }
        } catch (e) {
          // エラーを無視
        }
      }

      // 方法4: URLパラメータから取得
      const urlParams = new URLSearchParams(window.location.search);
      const possibleParams = ['asset', 'pair', 'symbol', 'currency', 'instrument'];
      for (const param of possibleParams) {
        const value = urlParams.get(param);
        if (value) {
          const formatted = value.match(/^([A-Z]{3})([A-Z]{3})$/)
            ? `${value.substring(0, 3)}/${value.substring(3, 6)}`
            : value;
          const normalized = normalizeAssetName(formatted);
          console.log(`[TheOption Analyzer] 💱 通貨ペア検出: ${normalized} (URL: ${param}, 正規化済み)`);
          return normalized;
        }
      }

      // 方法5: 検出された通貨ペアから選択
      if (detectedPairs.length > 0) {
        // 最初に見つかったものを使用
        const selected = detectedPairs[0];
        const normalized = normalizeAssetName(selected.pair);
        console.log(`[TheOption Analyzer] 💱 通貨ペア検出: ${normalized} (${selected.method}, 正規化済み)`);

        // デバッグ情報: 他に見つかった通貨ペアも表示
        if (detectedPairs.length > 1) {
          console.log(`[TheOption Analyzer] 📋 他の候補: ${detectedPairs.slice(1, 5).map(d => d.pair).join(', ')}`);
        }

        return normalized;
      }

      // 方法6: 価格の近くにある通貨ペアを探す
      const priceElements = document.querySelectorAll('.rate, [class*="rate"], [class*="price"]');
      for (const priceEl of priceElements) {
        let parent = priceEl.parentElement;
        let depth = 0;
        while (parent && depth < 5) {  // 5階層まで遡る
          const text = parent.textContent;
          const pairMatch = text.match(/\b([A-Z]{3})[\/\s-]?([A-Z]{3})\b/);
          if (pairMatch && text.length < 100) {
            const pair = normalizeAssetName(`${pairMatch[1]}/${pairMatch[2]}`);
            console.log(`[TheOption Analyzer] 💱 通貨ペア検出: ${pair} (価格要素の親, 正規化済み)`);
            return pair;
          }
          parent = parent.parentElement;
          depth++;
        }
      }

      console.warn('[TheOption Analyzer] ⚠️ 通貨ペアを検出できません');
      console.warn('[TheOption Analyzer] 📝 デバッグスクリプトを使用してください: debug-theoption.js');
      return 'UNKNOWN';
    }

    // ========================================
    // 価格取得
    // ========================================

    let priceDetectionLogged = false;

    function getCurrentPriceFromDOM() {
      // より具体的なセレクタから試行（returnRate等のペイアウト率を除外）
      const selectors = [
        // 価格専用のクラス（優先）
        '.current-price',
        '.asset-price',
        '.market-price',
        '.live-price',
        '[data-price]',

        // 一般的な価格関連セレクタ
        '.price:not(.returnRate)',
        '[class*="price"]:not(.returnRate)',
        '[class*="Price"]:not(.returnRate)',

        // レート関連（returnRateを除外）
        '.current-rate:not(.returnRate)',
        '.asset-rate:not(.returnRate)',
        '.rate:not(.returnRate)',
        '[class*="rate"]:not(.returnRate)',
        '[class*="Rate"]:not(.returnRate)',
        '[data-rate]:not(.returnRate)'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // returnRate, payoutRate等のペイアウト率要素を明示的に除外
          if (el.className.includes('return') ||
            el.className.includes('payout') ||
            el.className.includes('Payout') ||
            el.className.includes('Return')) {
            continue;
          }

          const text = el.textContent.trim();
          const number = parseFloat(text.replace(/[^0-9.]/g, ''));

          // ペイアウト率（80-100の整数値）を除外しつつ、全ての正当な価格を許可
          // EUR/USD (1.15), AUD/USD (0.65), NZD/JPY (87.09)などの100未満の価格も取得可能
          const isLikelyPayoutRate = (number >= 80 && number <= 100 && Math.floor(number) === number);

          if (!isNaN(number) && number > 0 && !isLikelyPayoutRate && number < 100000000) {
            // 詳細ログ: どの要素から価格を取得しているか特定
            console.log(`[TheOption Analyzer] 💹 価格検出: ${number}`);
            console.log(`[TheOption Analyzer] 🔍 セレクタ: ${selector}`);
            console.log(`[TheOption Analyzer] 🔍 要素情報:`, {
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              textContent: text,
              innerHTML: el.innerHTML.substring(0, 100)
            });
            console.log(`[TheOption Analyzer] 🔍 親要素:`, {
              tagName: el.parentElement?.tagName,
              className: el.parentElement?.className,
              id: el.parentElement?.id
            });
            return number;
          }
        }
      }

      console.warn('[TheOption Analyzer] ⚠️ 価格要素が見つかりません - TheOptionのページ構造が変更された可能性があります');
      console.warn('[TheOption Analyzer] 💡 コンソールで以下を実行して価格要素を探してください:');
      console.warn('[TheOption Analyzer] document.querySelectorAll(\'[class*="price"], [class*="Price"], [class*="rate"]\').forEach(el => console.log(el.className, el.textContent))');
      return null;
    }

    // ========================================
    // 履歴記録機能
    // ========================================

    /**
     * 予測品質スコアを計算
     */
    function calculatePredictionQuality(pred, mlStats) {
      if (!pred || !mlStats) return { score: 0, label: '不明', details: {} };

      const sampleSize = pred.sampleSize || 0;
      const avgSimilarity = pred.avgSimilarity || 0;
      const confidence = pred.confidence || 0;

      // データカバレッジ（インデックス化率）
      const indexedData = mlStats.dataCountWithResults || mlStats.dataCount || 0;
      const totalData = mlStats.dataCount || 1;
      const coverage = (indexedData / totalData) * 100;

      // パターン多様性スコア（200種類で満点）
      const patternCount = mlStats.optimizationStats?.segmentPatterns || 0;
      const diversityScore = Math.min(100, (patternCount / 2) * 100);

      // データ量充足度（50,000件で満点）
      const dataSufficiency = Math.min(100, (indexedData / 50000) * 100);

      // サンプルサイズスコア（100件で満点）
      const sampleScore = Math.min(100, sampleSize);

      // 品質スコア計算
      const score = Math.round(
        (coverage * 0.2) +          // カバレッジ 20%
        (diversityScore * 0.3) +    // 多様性 30%
        (dataSufficiency * 0.2) +   // データ量 20%
        (avgSimilarity * 0.2) +     // 類似度 20%
        (sampleScore * 0.1)         // サンプル数 10%
      );

      // ラベル判定
      let label = '不明';
      if (score >= 85) label = '優秀';
      else if (score >= 70) label = '良好';
      else if (score >= 55) label = '標準';
      else if (score >= 40) label = '要注意';
      else label = '低品質';

      // 予測品質判定（別の基準）
      let predictionQuality = '不明';
      if (sampleSize >= 50 && avgSimilarity >= 85) {
        predictionQuality = '優秀';
      } else if (sampleSize >= 30 && avgSimilarity >= 75) {
        predictionQuality = '良好';
      } else if (sampleSize >= 20 && avgSimilarity >= 65) {
        predictionQuality = '標準';
      } else {
        predictionQuality = '要注意';
      }

      return {
        score: score,
        label: label,
        predictionQuality: predictionQuality,
        details: {
          coverage: coverage.toFixed(1),
          diversity: diversityScore.toFixed(1),
          dataSufficiency: dataSufficiency.toFixed(1),
          avgSimilarity: avgSimilarity,
          sampleScore: sampleScore.toFixed(1),
          sampleSize: sampleSize,
          patternCount: patternCount
        }
      };
    }

    /**
     * 予測品質レポートを更新
     */
    function updateQualityReport() {
      // オーバーレイ削除のため、この関数は何もしない
      // 品質レポートデータは内部で保持しているため、必要に応じてサイドパネルに送信可能
    }

    function recordPrediction(timeframe, mlPredictions, multiDim) {
      if (!mlPredictions || !mlPredictions.predictions) return;

      const pred = mlPredictions.predictions[`${timeframe}s`];

      if (pred && pred.prediction !== 'INSUFFICIENT_DATA') {
        predictionHistory.push({
          timestamp: Date.now(),
          timeframe: timeframe,
          prediction: pred.prediction,
          confidence: pred.confidence !== null ? pred.confidence : 0,
          upRate: pred.upRate || 0,
          downRate: pred.downRate || 0,
          sampleSize: pred.sampleSize || 0,
          avgChange: parseFloat(pred.avgChange) || 0,
          // 現在の市場状況も記録
          currentPrice: getCurrentPriceFromDOM() || 0,
          macdStrength: multiDim?.breakdown?.macd?.strength || 0,
          adxValue: multiDim?.breakdown?.adx?.adx || 0,
          rsi: multiDim?.breakdown?.rsi?.value || 50
        });

        // 最大1000件に制限
        if (predictionHistory.length > 1000) {
          predictionHistory.shift(); // 古いものを削除
        }

        // LocalStorageに保存（最新500件のみ）
        try {
          const dataToSave = predictionHistory.slice(-500);
          localStorage.setItem('theoption_prediction_history', JSON.stringify(dataToSave));
        } catch (error) {
          console.error('[History] 予測履歴の保存に失敗:', error);
          // 容量超過の場合は古いデータを削除
          if (error.name === 'QuotaExceededError') {
            console.warn('[History] LocalStorage容量超過 - 最新300件のみ保存');
            try {
              const reducedData = predictionHistory.slice(-300);
              localStorage.setItem('theoption_prediction_history', JSON.stringify(reducedData));
            } catch (retryError) {
              console.error('[History] 再試行も失敗:', retryError);
            }
          }
        }

        console.log(`[History] 予測履歴記録: ${timeframe}秒 - ${pred.prediction} ${pred.confidence !== null ? `(${pred.confidence}%)` : ''} - 総件数: ${predictionHistory.length}`);

        // 予測品質ログを記録
        if (mlSystem) {
          const mlStats = mlSystem.getStatistics();

          const quality = calculatePredictionQuality(pred, mlStats);

          predictionQualityLog.push({
            timestamp: Date.now(),
            assetName: currentAsset || 'UNKNOWN',  // 通貨ペア名を記録
            timeframe: timeframe,
            prediction: pred.prediction,
            confidence: pred.confidence !== null ? pred.confidence : 0,
            // パターン分析情報
            sampleSize: pred.sampleSize || 0,
            avgSimilarity: pred.avgSimilarity || 0,
            segmentPattern: pred.segmentPattern || '',
            // 品質スコア
            qualityScore: quality.score,
            qualityLabel: quality.label,
            predictionQuality: quality.predictionQuality,
            // データ情報
            indexedData: mlStats.dataCountWithResults || mlStats.dataCount || 0,
            totalData: mlStats.dataCount || 0,
            coveragePercent: quality.details.coverage,
            patternCount: quality.details.patternCount,
            // 市場情報
            currentPrice: getCurrentPriceFromDOM() || 0,
            rsi: multiDim?.breakdown?.rsi?.value || 50,
            macdStrength: multiDim?.breakdown?.macd?.strength || 0,
            adxValue: multiDim?.breakdown?.adx?.adx || 0,
            // 予測詳細
            upRate: pred.upRate || 0,
            downRate: pred.downRate || 0
          });

          // 最大1000件に制限
          if (predictionQualityLog.length > 1000) {
            predictionQualityLog.shift();
          }

          console.log(`[Quality] 品質ログ記録: ${timeframe}秒 - スコア:${quality.score} (${quality.label}) - 総件数: ${predictionQualityLog.length}`);

          // 品質レポートを更新（パフォーマンス最適化のため無効化）
          // updateQualityReport();
        }
      }
    }

    function recordTrend(timeframe, hierarchicalTrend, multiDim) {
      if (!hierarchicalTrend || !multiDim) return;

      const trendStrength = calculateTrendStrength(multiDim);

      trendHistory.push({
        timestamp: Date.now(),
        timeframe: timeframe,
        // 3段階トレンド
        longTrend: hierarchicalTrend.long || 'UNKNOWN',
        midTrend: hierarchicalTrend.mid || 'UNKNOWN',
        shortTrend: hierarchicalTrend.short || 'UNKNOWN',
        alignment: hierarchicalTrend.alignment || 'UNKNOWN',
        // テクニカル分析
        technicalSignal: multiDim.signal || 'NEUTRAL',
        technicalScore: multiDim.score || 0,
        trendStrength: trendStrength,
        // 詳細指標
        macdSignal: multiDim.breakdown?.macd?.signal || 'NEUTRAL',
        adxValue: multiDim.breakdown?.adx?.adx || 0,
        adxTrend: multiDim.breakdown?.adx?.trend || 'NEUTRAL',
        volatility: multiDim.breakdown?.atr?.volatility || 'LOW'
      });

      // 最大1000件に制限
      if (trendHistory.length > 1000) {
        trendHistory.shift();
      }

      // LocalStorageに保存（最新500件のみ）
      try {
        const dataToSave = trendHistory.slice(-500);
        localStorage.setItem('theoption_trend_history', JSON.stringify(dataToSave));
      } catch (error) {
        console.error('[History] トレンド履歴の保存に失敗:', error);
        // 容量超過の場合は古いデータを削除
        if (error.name === 'QuotaExceededError') {
          console.warn('[History] LocalStorage容量超過 - 最新300件のみ保存');
          try {
            const reducedData = trendHistory.slice(-300);
            localStorage.setItem('theoption_trend_history', JSON.stringify(reducedData));
          } catch (retryError) {
            console.error('[History] 再試行も失敗:', retryError);
          }
        }
      }

      console.log(`[History] トレンド履歴記録: ${timeframe}秒 - ${hierarchicalTrend.long}/${hierarchicalTrend.mid}/${hierarchicalTrend.short} - 総件数: ${trendHistory.length}`);
    }

    function calculateTrendStrength(multiDim) {
      if (!multiDim || !multiDim.breakdown) return 0;

      // ADX、MACD、ROCなどから総合的な強度を計算
      const adxScore = multiDim.breakdown.adx?.adx || 0;
      const macdScore = Math.abs(multiDim.breakdown.macd?.strength || 0) * 5;
      const rocScore = Math.abs(multiDim.breakdown.roc?.roc || 0) * 10;

      return Math.min(100, Math.round((adxScore + macdScore + rocScore) / 3));
    }

    /**
     * LocalStorageから全履歴データを復元
     */
    function loadHistoryFromStorage() {
      console.log('[History] LocalStorageから履歴データを復元中...');

      // 予測履歴を復元
      try {
        const savedPredictions = localStorage.getItem('theoption_prediction_history');
        if (savedPredictions) {
          const loaded = JSON.parse(savedPredictions);
          predictionHistory.length = 0;
          predictionHistory.push(...loaded);
          console.log(`[History] 予測履歴を復元: ${predictionHistory.length}件`);
        }
      } catch (error) {
        console.error('[History] 予測履歴の復元に失敗:', error);
      }

      // トレンド履歴を復元
      try {
        const savedTrends = localStorage.getItem('theoption_trend_history');
        if (savedTrends) {
          const loaded = JSON.parse(savedTrends);
          trendHistory.length = 0;
          trendHistory.push(...loaded);
          console.log(`[History] トレンド履歴を復元: ${trendHistory.length}件`);
        }
      } catch (error) {
        console.error('[History] トレンド履歴の復元に失敗:', error);
      }

      console.log('[History] 履歴データの復元完了');
    }

    function getHierarchicalTrend(timeframe) {
      if (priceHistory.length < 50) return null;

      try {
        const analyzer = new window.SimpleTrendAnalyzer();
        priceHistory.forEach(item => {
          analyzer.addPrice(item.price || item, item.timestamp || Date.now());
        });

        const result = analyzer.analyze(timeframe);
        return result?.hierarchicalTrend || null;
      } catch (error) {
        console.warn('[History] 3段階トレンド分析エラー:', error);
        return null;
      }
    }

    // ========================================
    // CSVダウンロード機能（統合版）
    // ========================================

    function executeDownload(dataType) {
      console.log(`[CSV Download] ダウンロード開始: ${dataType}`);

      switch (dataType) {
        case 'ml-data':
          downloadMLDataAsCSV();
          break;
        case 'predictions':
          downloadPredictionsAsCSV();
          break;
        case 'trends':
          downloadTrendsAsCSV();
          break;
        case 'json-export':
          exportDataAsJSON();
          break;
        case 'json-import':
          importDataFromJSON();
          break;
        default:
          alert('不明なデータタイプです');
      }
    }

    function downloadMLDataAsCSV() {
      if (!mlSystem) {
        alert('AI学習システムが初期化されていません');
        return;
      }

      const system = mlSystem.getCurrentSystem();
      if (!system || !system.dataCollector) {
        alert('学習データがありません');
        return;
      }

      const trainingData = system.dataCollector.trainingData;
      if (!trainingData || trainingData.length === 0) {
        alert('ダウンロード可能なデータがありません');
        return;
      }

      console.log(`[CSV Download] データ件数: ${trainingData.length}件`);

      // CSVヘッダー
      const headers = [
        'タイムスタンプ',
        '日時',
        '価格',
        'RSI',
        'MA5',
        'MA20',
        'MACD強度',
        'ADX',
        'Stochastic K',
        'ATR (%)',
        'ROC',
        'センチメント',
        '時',
        '分',
        '曜日',
        // セグメント分析データ（15秒）
        'セグメントパターン15s',
        'セグメントハッシュ15s',
        'セグメント数15s',
        '上昇セグメント比率15s',
        '下降セグメント比率15s',
        '平坦セグメント比率15s',
        '平均変化量15s',
        '平均ボラティリティ15s',
        '支配的パターン15s',
        // セグメント分析データ（30秒）
        'セグメントパターン30s',
        'セグメントハッシュ30s',
        'セグメント数30s',
        // セグメント分析データ（60秒）
        'セグメントパターン60s',
        'セグメントハッシュ60s',
        'セグメント数60s',
        // セグメント分析データ（180秒）
        'セグメントパターン180s',
        'セグメントハッシュ180s',
        'セグメント数180s',
        // セグメント分析データ（300秒）
        'セグメントパターン300s',
        'セグメントハッシュ300s',
        'セグメント数300s',
        // 結果データ
        '15秒後_価格',
        '15秒後_変化',
        '15秒後_変化率(%)',
        '15秒後_方向',
        '30秒後_価格',
        '30秒後_変化',
        '30秒後_変化率(%)',
        '30秒後_方向',
        '60秒後_価格',
        '60秒後_変化',
        '60秒後_変化率(%)',
        '60秒後_方向',
        '180秒後_価格',
        '180秒後_変化',
        '180秒後_変化率(%)',
        '180秒後_方向',
        '300秒後_価格',
        '300秒後_変化',
        '300秒後_変化率(%)',
        '300秒後_方向'
      ];

      // CSVデータ行を生成
      const rows = trainingData.map(data => {
        const date = new Date(data.timestamp);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

        const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][data.dayOfWeek];

        // セグメント分析データの抽出
        const seg15s = data.priceSegments15s?.summary || {};
        const seg30s = data.priceSegments30s?.summary || {};
        const seg60s = data.priceSegments60s?.summary || {};
        const seg180s = data.priceSegments180s?.summary || {};
        const seg300s = data.priceSegments300s?.summary || {};

        return [
          data.timestamp,
          dateStr,
          data.price.toFixed(5),
          data.rsi.toFixed(2),
          data.ma5.toFixed(5),
          data.ma20.toFixed(5),
          data.macdStrength.toFixed(2),
          data.adxValue.toFixed(2),
          data.stochasticK.toFixed(2),
          data.atrPercent.toFixed(4),
          data.rocValue.toFixed(4),
          data.sentimentScore.toFixed(4),
          data.hour,
          data.minute,
          dayOfWeekStr,
          // セグメント分析データ（15秒）
          data.priceSegments15s?.pattern || '',
          data.priceSegments15s?.shapeHash || '',
          data.priceSegments15s?.segmentCount || '',
          seg15s.upRatio?.toFixed(3) || '',
          seg15s.downRatio?.toFixed(3) || '',
          seg15s.flatRatio?.toFixed(3) || '',
          seg15s.avgMagnitude?.toFixed(4) || '',
          seg15s.avgVolatility?.toFixed(4) || '',
          seg15s.dominantPattern || '',
          // セグメント分析データ（30秒）
          data.priceSegments30s?.pattern || '',
          data.priceSegments30s?.shapeHash || '',
          data.priceSegments30s?.segmentCount || '',
          // セグメント分析データ（60秒）
          data.priceSegments60s?.pattern || '',
          data.priceSegments60s?.shapeHash || '',
          data.priceSegments60s?.segmentCount || '',
          // セグメント分析データ（180秒）
          data.priceSegments180s?.pattern || '',
          data.priceSegments180s?.shapeHash || '',
          data.priceSegments180s?.segmentCount || '',
          // セグメント分析データ（300秒）
          data.priceSegments300s?.pattern || '',
          data.priceSegments300s?.shapeHash || '',
          data.priceSegments300s?.segmentCount || '',
          // 結果データ
          data.result15s?.price?.toFixed(5) || '',
          data.result15s?.change?.toFixed(5) || '',
          data.result15s?.changePercent?.toFixed(4) || '',
          data.result15s?.direction || '',
          data.result30s?.price?.toFixed(5) || '',
          data.result30s?.change?.toFixed(5) || '',
          data.result30s?.changePercent?.toFixed(4) || '',
          data.result30s?.direction || '',
          data.result60s?.price?.toFixed(5) || '',
          data.result60s?.change?.toFixed(5) || '',
          data.result60s?.changePercent?.toFixed(4) || '',
          data.result60s?.direction || '',
          data.result180s?.price?.toFixed(5) || '',
          data.result180s?.change?.toFixed(5) || '',
          data.result180s?.changePercent?.toFixed(4) || '',
          data.result180s?.direction || '',
          data.result300s?.price?.toFixed(5) || '',
          data.result300s?.change?.toFixed(5) || '',
          data.result300s?.changePercent?.toFixed(4) || '',
          data.result300s?.direction || ''
        ].join(',');
      });

      // CSV文字列を生成
      const csvContent = [
        headers.join(','),
        ...rows
      ].join('\n');

      // BOM付きでUTF-8エンコード（Excelで文字化けしないように）
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

      // ダウンロード用のリンクを作成
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const assetName = currentAsset || 'unknown';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `theoption_ml_data_${assetName.replace(/[\/\s]/g, '_')}_${timestamp}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      console.log(`[CSV Download] ダウンロード完了: ${filename} (${trainingData.length}件)`);

      // 通知
      showDownloadNotification('AI学習データ');
    }

    function downloadPredictionsAsCSV() {
      if (!predictionHistory || predictionHistory.length === 0) {
        alert('予測履歴データがありません\n\n分析が実行されると自動的に記録されます。');
        return;
      }

      console.log(`[CSV Download] 予測パターンデータ件数: ${predictionHistory.length}件`);

      // CSVヘッダー
      const headers = [
        'タイムスタンプ',
        '日時',
        'タイムフレーム(秒)',
        '予測結果',
        '信頼度(%)',
        '上昇確率(%)',
        '下降確率(%)',
        '類似パターン数',
        '平均変化率(%)',
        '現在価格',
        'MACD強度',
        'ADX',
        'RSI'
      ];

      // CSVデータ行を生成
      const rows = predictionHistory.map(record => {
        const date = new Date(record.timestamp);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

        return [
          record.timestamp,
          dateStr,
          record.timeframe,
          record.prediction,
          record.confidence,
          record.upRate,
          record.downRate,
          record.sampleSize,
          record.avgChange,
          record.currentPrice.toFixed(5),
          record.macdStrength.toFixed(2),
          record.adxValue.toFixed(2),
          record.rsi.toFixed(2)
        ].join(',');
      });

      // CSV文字列を生成
      const csvContent = [headers.join(','), ...rows].join('\n');

      // BOM付きでUTF-8エンコード
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

      // ダウンロード
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const assetName = currentAsset || 'unknown';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `theoption_predictions_${assetName.replace(/[\/\s]/g, '_')}_${timestamp}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      console.log(`[CSV Download] ダウンロード完了: ${filename} (${predictionHistory.length}件)`);

      // 通知
      showDownloadNotification('予測パターンデータ');
    }

    function downloadTrendsAsCSV() {
      if (!trendHistory || trendHistory.length === 0) {
        alert('トレンド分析履歴データがありません\n\n分析が実行されると自動的に記録されます。');
        return;
      }

      console.log(`[CSV Download] トレンド分析データ件数: ${trendHistory.length}件`);

      // CSVヘッダー
      const headers = [
        'タイムスタンプ',
        '日時',
        'タイムフレーム(秒)',
        '長期トレンド',
        '中期トレンド',
        '短期トレンド',
        'トレンド一致',
        'テクニカルシグナル',
        'テクニカルスコア',
        'トレンド強度',
        'MACDシグナル',
        'ADX',
        'ADXトレンド',
        'ボラティリティ'
      ];

      // CSVデータ行を生成
      const rows = trendHistory.map(record => {
        const date = new Date(record.timestamp);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

        return [
          record.timestamp,
          dateStr,
          record.timeframe,
          record.longTrend,
          record.midTrend,
          record.shortTrend,
          record.alignment,
          record.technicalSignal,
          record.technicalScore,
          record.trendStrength,
          record.macdSignal,
          record.adxValue.toFixed(2),
          record.adxTrend,
          record.volatility
        ].join(',');
      });

      // CSV文字列を生成
      const csvContent = [headers.join(','), ...rows].join('\n');

      // BOM付きでUTF-8エンコード
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

      // ダウンロード
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const assetName = currentAsset || 'unknown';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `theoption_trends_${assetName.replace(/[\/\s]/g, '_')}_${timestamp}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      console.log(`[CSV Download] ダウンロード完了: ${filename} (${trendHistory.length}件)`);

      // 通知
      showDownloadNotification('トレンド分析データ');
    }

    // パフォーマンス最適化のため無効化
    // function downloadPredictionQualityAsCSV() {
    //   if (!predictionQualityLog || predictionQualityLog.length === 0) {
    //     alert('予測品質ログがありません\n\n予測が実行されると自動的に記録されます。');
    //     return;
    //   }
    //   ...
    // }

    function showDownloadNotification(dataName) {
      // 簡易通知
      const notification = document.createElement('div');
      notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 99999999;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      animation: slideInRight 0.3s ease-out;
    `;
      notification.textContent = `✅ ${dataName}をダウンロードしました`;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }

    // ========================================
    // JSONエクスポート・インポート機能
    // ========================================

    function exportDataAsJSON() {
      console.log('[JSON Export] エクスポート開始...');

      chrome.storage.local.get(null, (allData) => {
        // theoption_ml_で始まるキーのみ抽出
        const mlData = {};
        let totalRecords = 0;
        let currencyPairs = 0;

        Object.keys(allData).forEach(key => {
          if (key.startsWith('theoption_ml_')) {
            mlData[key] = allData[key];
            if (Array.isArray(allData[key])) {
              totalRecords += allData[key].length;
              currencyPairs++;
            }
          }
        });

        if (totalRecords === 0) {
          alert('エクスポート可能な学習データがありません');
          return;
        }

        console.log(`[JSON Export] ${currencyPairs}通貨ペア, ${totalRecords}件のデータをエクスポート`);

        // JSON形式で生成
        const json = JSON.stringify(mlData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });

        // ダウンロード
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `theoption_backup_${timestamp}.json`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        console.log(`[JSON Export] ✅ エクスポート完了: ${filename}`);

        // 通知
        showDownloadNotification(`完全バックアップ (${currencyPairs}通貨ペア, ${totalRecords}件)`);
      });
    }

    function importDataFromJSON() {
      console.log('[JSON Import] インポート開始...');

      // ファイル入力要素を動的に作成
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.click();

      fileInput.onchange = (e) => {
        // 使用後に要素を削除
        document.body.removeChild(fileInput);
        const file = e.target.files[0];
        if (!file) {
          console.log('[JSON Import] ファイルが選択されませんでした');
          return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);

            // データ検証
            const validation = validateImportData(data);
            if (!validation.valid) {
              alert(`❌ データ検証エラー\n\n${validation.error}`);
              console.error('[JSON Import] 検証エラー:', validation.error);
              return;
            }

            // 確認ダイアログ
            const confirmed = confirm(
              `${validation.currencyPairs}通貨ペア, ${validation.totalRecords}件のデータをインポートします。\n\n` +
              `⚠️ 既存のデータは上書きされます。\n\n続行しますか？`
            );

            if (!confirmed) {
              console.log('[JSON Import] キャンセルされました');
              return;
            }

            // Chrome Storageに復元
            chrome.storage.local.set(data, () => {
              if (chrome.runtime.lastError) {
                console.error('[JSON Import] エラー:', chrome.runtime.lastError);
                alert('❌ インポートに失敗しました\n\n' + chrome.runtime.lastError.message);
              } else {
                console.log(`[JSON Import] ✅ インポート完了: ${validation.totalRecords}件`);

                // 通知
                alert(
                  `✅ データをインポートしました\n\n` +
                  `通貨ペア: ${validation.currencyPairs}\n` +
                  `データ件数: ${validation.totalRecords}件\n\n` +
                  `ページをリロードします。`
                );

                // ページリロード
                setTimeout(() => {
                  location.reload();
                }, 1000);
              }
            });

          } catch (error) {
            console.error('[JSON Import] ファイル読み込みエラー:', error);
            alert('❌ ファイルの読み込みに失敗しました\n\nJSON形式が正しいか確認してください。');
          }
        };

        reader.readAsText(file);
      };
    }

    function validateImportData(data) {
      // 基本構造チェック
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'データ形式が不正です' };
      }

      let currencyPairs = 0;
      let totalRecords = 0;

      for (let key in data) {
        // キー名チェック
        if (!key.startsWith('theoption_ml_')) {
          return { valid: false, error: `無効なキー: ${key}` };
        }

        // 配列チェック
        if (!Array.isArray(data[key])) {
          return { valid: false, error: `${key}のデータ形式が配列ではありません` };
        }

        currencyPairs++;

        // 各データの構造チェック
        for (let item of data[key]) {
          if (!item.timestamp || !item.price) {
            return { valid: false, error: `${key}に必須フィールド(timestamp/price)がありません` };
          }
          totalRecords++;
        }
      }

      if (totalRecords === 0) {
        return { valid: false, error: 'データが空です' };
      }

      return {
        valid: true,
        currencyPairs: currencyPairs,
        totalRecords: totalRecords
      };
    }


    // ========================================
    // 起動
    // ========================================

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      setTimeout(initialize, 2000);
    }

  })();

} // initializeAnalyzer() の終了
