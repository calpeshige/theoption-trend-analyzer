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
  console.log = () => {};
  console.warn = () => {};
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
window.checkMLStorage = function() {
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
window.testSimilarityCalculation = function() {
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
window.autoCheckSegmentData = function() {
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
    console.log(`✅ セグメント分析あり: ${withSegments}件 (${totalData > 0 ? Math.round(withSegments/totalData*100) : 0}%)`);
    console.log(`❌ セグメント分析なし: ${withoutSegments}件 (${totalData > 0 ? Math.round(withoutSegments/totalData*100) : 0}%)`);

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

(function() {
  'use strict';

  // ========================================
  // Extension Context 監視
  // ========================================

  // 拡張機能のコンテキストが無効化されたかチェック
  let contextInvalidated = false;
  let contextCheckInterval = null;

  // アラート音の設定
  let alertSoundEnabled = false;  // デフォルトOFF

  // 表示設定
  let compactMode = false;    // デフォルト: 通常表示
  let fontSize = 'medium';    // デフォルト: 中サイズ

  /**
   * アラート音を鳴らす（高いビープ音）
   */
  function playAlertSound() {
    if (!alertSoundEnabled) return;

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 高い音（880Hz）
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';

      // 音量設定
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      // 再生
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('[TheOption Analyzer] アラート音の再生に失敗:', error);
    }
  }

  /**
   * コンパクトモードを適用
   */
  function applyCompactMode(enabled) {
    const panel = document.getElementById('theoption-analyzer-panel');
    if (!panel) return;

    compactMode = enabled;

    if (enabled) {
      panel.classList.add('compact-mode');
    } else {
      panel.classList.remove('compact-mode');
    }

    // トグルボタンの状態更新
    const toggleBtn = document.getElementById('compact-mode-toggle');
    if (toggleBtn) {
      if (enabled) {
        toggleBtn.classList.add('active');
      } else {
        toggleBtn.classList.remove('active');
      }
    }

    console.log(`[TheOption Analyzer] 📐 コンパクトモード: ${enabled ? 'ON' : 'OFF'}`);
  }

  /**
   * フォントサイズを適用
   */
  function applyFontSize(size) {
    const panel = document.getElementById('theoption-analyzer-panel');
    if (!panel) return;

    fontSize = size;

    // 既存のフォントサイズクラスを削除
    panel.classList.remove('font-small', 'font-medium', 'font-large');

    // 新しいフォントサイズクラスを追加
    panel.classList.add(`font-${size}`);

    console.log(`[TheOption Analyzer] 🔤 フォントサイズを変更: ${size}`);
  }

  function checkExtensionContext() {
    if (!chrome.runtime?.id && !contextInvalidated) {
      contextInvalidated = true;
      console.warn('[TheOption Analyzer] ⚠️ 拡張機能のコンテキストが無効化されました');
      console.warn('[TheOption Analyzer] 🔄 5秒後に自動的にページをリロードします...');

      // UIに警告を表示
      const analyzerText = document.getElementById('analyzer-text');
      if (analyzerText) {
        analyzerText.textContent = '拡張機能リロード検出 - 自動リロード中...';
        analyzerText.style.color = '#FFA726';
      }

      // 5秒後に自動リロード
      setTimeout(() => {
        console.log('[TheOption Analyzer] 🔄 ページをリロードします');
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
  // 初期化
  // ========================================

  async function initialize() {
    console.log('[TheOption Analyzer] 🔧 初期化開始');

    // LocalStorageから履歴データを復元
    loadHistoryFromStorage();

    // 多次元分析システム初期化
    if (typeof MultiDimensionalAnalyzer !== 'undefined') {
      multiDimAnalyzer = new MultiDimensionalAnalyzer();
      console.log('[TheOption Analyzer] ✅ 多次元分析システム初期化完了');
    } else {
      console.error('[TheOption Analyzer] ❌ MultiDimensionalAnalyzerが見つかりません');
      return;
    }

    // 機械学習システム初期化
    if (typeof MachineLearningSystem !== 'undefined') {
      mlSystem = new MachineLearningSystem();

      // コンテンツスクリプトのwindowに公開
      window.mlSystem = mlSystem;

      // ページコンテキストに初期化状態を注入（コンソールアクセス用）
      console.log('[TheOption Analyzer] 🔧 ページコンテキストへスクリプト注入開始');
      try {
        const script = document.createElement('script');
        script.textContent = `
          (function() {
            window.mlSystemInitialized = true;
            window.checkMLSystemStatus = function() {
              return window.mlSystemInitialized ? "初期化済み" : "未初期化";
            };
            console.log('[TheOption Analyzer] 💡 MLシステム状態確認: コンソールで checkMLSystemStatus() を実行');
          })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        console.log('[TheOption Analyzer] ✅ ページコンテキストへスクリプト注入成功');
      } catch (e) {
        console.error('[TheOption Analyzer] ❌ スクリプト注入失敗:', e);
      }

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

    // UI作成
    createAnalyzerUI();

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

      // UIボタンの状態を更新
      document.querySelectorAll('.similarity-threshold-btn').forEach(btn => {
        if (parseInt(btn.dataset.threshold) === currentSimilarityThreshold) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // 表示テキストを更新
      document.getElementById('current-threshold').textContent = currentSimilarityThreshold;
    });

    // 保存されたデータ件数制限を復元（保存がなければデフォルトnull = 全期間）
    chrome.storage.local.get(['dataLimit'], (result) => {
      if (result.dataLimit !== undefined) {
        currentDataLimit = result.dataLimit;
        console.log(`[TheOption Analyzer] データ件数制限を復元: ${currentDataLimit === null ? '全期間' : currentDataLimit + '件'}`);
      } else {
        // 初回起動時はデフォルトnull（全期間）をストレージに保存
        chrome.storage.local.set({ dataLimit: currentDataLimit });
        console.log(`[TheOption Analyzer] データ件数制限をデフォルト値に設定: 全期間`);
      }

      // UIボタンの状態を更新
      document.querySelectorAll('.data-limit-btn').forEach(btn => {
        const limit = btn.dataset.limit === 'all' ? null : parseInt(btn.dataset.limit);
        if (limit === currentDataLimit) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // 表示テキストを更新
      const displayText = currentDataLimit === null ? '全期間' : `直近${currentDataLimit}件`;
      document.getElementById('current-data-limit').textContent = displayText;
    });

    // 保存されたアラート音設定を復元（保存がなければデフォルトOFF）
    chrome.storage.local.get(['alertSoundEnabled'], (result) => {
      if (result.alertSoundEnabled !== undefined) {
        alertSoundEnabled = result.alertSoundEnabled;
        console.log(`[TheOption Analyzer] アラート音設定を復元: ${alertSoundEnabled ? 'ON' : 'OFF'}`);
      } else {
        // 初回起動時はデフォルトOFFをストレージに保存
        chrome.storage.local.set({ alertSoundEnabled: alertSoundEnabled });
        console.log(`[TheOption Analyzer] アラート音設定をデフォルト値に設定: OFF`);
      }

      // UIの状態を更新
      const toggleBtn = document.getElementById('alert-sound-toggle');
      const statusText = document.getElementById('alert-sound-status');

      if (alertSoundEnabled) {
        toggleBtn.classList.add('active');
        statusText.textContent = 'ON';
      } else {
        toggleBtn.classList.remove('active');
        statusText.textContent = 'OFF';
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

      // UIタブのアクティブ状態を更新
      document.querySelectorAll('.timeframe-analysis-tab').forEach(tab => {
        if (parseInt(tab.dataset.timeframe) === currentTimeframe) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      // 時間枠情報を更新
      updateTimeframeInfo();
    });

    // 保存された表示設定を復元
    chrome.storage.local.get(['compactMode', 'fontSize'], (result) => {
      // コンパクトモード設定を復元
      if (result.compactMode !== undefined) {
        compactMode = result.compactMode;
        console.log(`[TheOption Analyzer] コンパクトモード設定を復元: ${compactMode ? 'ON' : 'OFF'}`);
      } else {
        chrome.storage.local.set({ compactMode: compactMode });
        console.log(`[TheOption Analyzer] コンパクトモード設定をデフォルト値に設定: OFF`);
      }
      applyCompactMode(compactMode);

      // フォントサイズ設定を復元
      if (result.fontSize !== undefined) {
        fontSize = result.fontSize;
        console.log(`[TheOption Analyzer] フォントサイズ設定を復元: ${fontSize}`);
      } else {
        chrome.storage.local.set({ fontSize: fontSize });
        console.log(`[TheOption Analyzer] フォントサイズ設定をデフォルト値に設定: ${fontSize}`);
      }
      applyFontSize(fontSize);

      // フォントサイズセレクトの値を更新
      const fontSizeSelect = document.getElementById('font-size-select');
      if (fontSizeSelect) {
        fontSizeSelect.value = fontSize;
      }
    });

    // 価格データ取得開始
    startPriceMonitoring();

    console.log('[TheOption Analyzer] ✅ 初期化完了');
  }

  // ========================================
  // UI作成（シンプル版）
  // ========================================

  function createAnalyzerUI() {
    const existing = document.getElementById('theoption-analyzer-panel');
    if (existing) existing.remove();

    uiPanel = document.createElement('div');
    uiPanel.id = 'theoption-analyzer-panel';
    uiPanel.innerHTML = `
      <div class="analyzer-compact">
        <button id="analyzer-toggle" class="analyzer-button">
          <span class="analyzer-icon">theoption</span>
          <span class="analyzer-text" id="analyzer-text">起動中...</span>
        </button>
      </div>
      <div class="analyzer-dropdown" id="analyzer-dropdown">
        <!-- 通貨ペア表示 -->
        <div class="asset-display" id="asset-display">
          <div class="asset-label">分析対象</div>
          <div class="asset-name" id="asset-name-display">検出中...</div>
          <div class="asset-data-count" id="asset-data-count">データ: 0件</div>
          <button class="download-csv-button" id="download-csv-button" title="AI学習データをCSV形式でダウンロード">
            学習データをダウンロード
          </button>
        </div>

        <!-- アラート音設定 -->
        <div class="alert-sound-section">
          <div class="alert-sound-label">
            アラート音
            <span class="alert-sound-status" id="alert-sound-status">OFF</span>
          </div>
          <div class="alert-sound-toggle" id="alert-sound-toggle"></div>
        </div>

        <!-- 表示設定 -->
        <div class="display-settings-section">
          <div class="setting-row">
            <span class="setting-label">コンパクト</span>
            <div class="compact-mode-toggle" id="compact-mode-toggle"></div>
          </div>
          <div class="setting-row">
            <span class="setting-label">フォント</span>
            <select class="font-size-select" id="font-size-select">
              <option value="small">小</option>
              <option value="medium" selected>中</option>
              <option value="large">大</option>
            </select>
          </div>
        </div>

        <!-- 取引時間枠 分析一覧 -->
        <div class="timeframe-analysis-tabs">
          <button class="timeframe-analysis-tab" data-timeframe="15">
            <div class="tab-time">15秒</div>
          </button>
          <button class="timeframe-analysis-tab" data-timeframe="30">
            <div class="tab-time">30秒</div>
          </button>
          <button class="timeframe-analysis-tab active" data-timeframe="60">
            <div class="tab-time">60秒</div>
          </button>
          <button class="timeframe-analysis-tab" data-timeframe="180">
            <div class="tab-time">3分</div>
          </button>
          <button class="timeframe-analysis-tab" data-timeframe="300">
            <div class="tab-time">5分</div>
          </button>
        </div>

        <!-- 選択中の時間枠情報 -->
        <div class="timeframe-info">
          <div class="timeframe-info-row">
            <span class="timeframe-info-label">取引時間:</span>
            <span class="timeframe-info-value" id="current-timeframe-display">15秒</span>
          </div>
          <div class="timeframe-info-row">
            <span class="timeframe-info-label">更新頻度:</span>
            <span class="timeframe-info-value" id="update-interval-display">10秒ごと</span>
          </div>
          <div class="timeframe-info-row">
            <span class="timeframe-info-label">使用データ:</span>
            <span class="timeframe-info-value" id="data-window-display">直近60秒</span>
          </div>
          <div class="timeframe-info-row">
            <span class="timeframe-info-label">次回分析:</span>
            <span class="timeframe-info-value" id="next-analysis-countdown">--秒</span>
          </div>
        </div>

        <!-- シグナル表示（テクニカル/AI分離） -->
        <div class="signal-display">
          <!-- テクニカル分析 -->
          <div class="signal-section">
            <div class="signal-label">テクニカル分析</div>
            <div class="signal-main">
              <div class="signal-light-large" id="tech-signal-light" data-signal="wait">●</div>
              <div class="signal-info">
                <div class="signal-direction" id="tech-signal-direction">データ収集中</div>
                <div class="signal-confidence-large" id="tech-signal-confidence">--%</div>
              </div>
            </div>
          </div>

          <!-- AI予測 -->
          <div class="signal-section">
            <div class="signal-label">AI予測</div>
            <div class="signal-main">
              <div class="signal-light-large" id="ai-signal-light" data-signal="wait">●</div>
              <div class="signal-info">
                <div class="signal-direction" id="ai-signal-direction">準備中</div>
                <div class="signal-confidence-large" id="ai-signal-confidence">--%</div>
              </div>
            </div>
          </div>
        </div>

        <!-- テクニカル分析詳細 -->
        <div class="detail-section">
          <div class="detail-title">テクニカル分析</div>
          <div class="detail-content" id="detail-analysis">-</div>
        </div>

        <!-- AI予測根拠 -->
        <div class="detail-section">
          <div class="detail-title">AI予測根拠</div>
          <div class="detail-content" id="detail-ml-reason">-</div>
        </div>

        <!-- AI学習状況 -->
        <div class="ml-status" id="ml-status">
          <div class="ml-title">AI学習状況</div>
          <div class="ml-info">
            <span id="ml-data-count">0</span>件 |
            学習Lv: <span id="ml-learning-level">-</span>%
          </div>
          <div class="ml-progress">
            <div class="ml-progress-bar" id="ml-progress-bar"></div>
          </div>
        </div>

        <!-- 類似度閾値設定 -->
        <div class="similarity-threshold-section">
          <div class="similarity-threshold-title">類似度閾値</div>
          <div class="similarity-threshold-buttons">
            <button class="similarity-threshold-btn" data-threshold="50">50%</button>
            <button class="similarity-threshold-btn" data-threshold="70">70%</button>
            <button class="similarity-threshold-btn" data-threshold="80">80%</button>
            <button class="similarity-threshold-btn" data-threshold="90">90%</button>
          </div>
          <div class="similarity-threshold-info">
            現在: <span id="current-threshold">70</span>%以上のパターンを使用
          </div>
        </div>

        <!-- データ件数制限設定 -->
        <div class="data-limit-section">
          <div class="data-limit-title">使用データ範囲</div>
          <div class="data-limit-buttons">
            <button class="data-limit-btn" data-limit="500">500件</button>
            <button class="data-limit-btn" data-limit="1000">1K</button>
            <button class="data-limit-btn" data-limit="2000">2K</button>
            <button class="data-limit-btn" data-limit="3000">3K</button>
            <button class="data-limit-btn active" data-limit="all">全期間</button>
          </div>
          <div class="data-limit-info">
            現在: <span id="current-data-limit">全期間</span>のデータを使用
          </div>
        </div>
      </div>

      <!-- リサイズハンドル（ドロップダウンの外に配置） -->
      <div class="resize-handle" id="resize-handle"></div>
    `;

    // ダウンロードモーダル（別要素として作成）
    const downloadModal = document.createElement('div');
    downloadModal.className = 'download-modal';
    downloadModal.id = 'download-modal';
    downloadModal.innerHTML = `
        <div class="download-modal-content">
          <div class="download-modal-header">
            <h3>データをダウンロード</h3>
            <button class="download-modal-close" id="download-modal-close">✕</button>
          </div>

          <div class="download-tabs">
            <button class="download-tab active" data-tab="ml-data">AI学習データ</button>
            <button class="download-tab" data-tab="price-history">価格履歴</button>
            <button class="download-tab" data-tab="predictions">予測パターン</button>
            <button class="download-tab" data-tab="trends">トレンド分析</button>
            <button class="download-tab" data-tab="data-management">データ管理</button>
          </div>

          <div class="download-tab-content">
            <!-- AI学習データ -->
            <div class="download-panel active" id="panel-ml-data">
              <h4>AI学習データ</h4>
              <p>機械学習用の全データ（テクニカル指標 + 結果）</p>
              <ul>
                <li>価格、RSI、MACD、ADX、Stochastic、ROC等</li>
                <li>15秒/30秒/60秒/180秒/300秒後の結果</li>
                <li>全35列のデータ</li>
              </ul>
              <button class="download-execute-btn" data-type="ml-data">ダウンロード</button>
            </div>

            <!-- 価格履歴 -->
            <div class="download-panel" id="panel-price-history">
              <h4>価格履歴データ</h4>
              <p>1秒ごとの価格変動データ（直近10分間）</p>
              <ul>
                <li>タイムスタンプ、価格</li>
                <li>前回からの変化、変化率</li>
                <li>最大600行のデータ</li>
              </ul>
              <button class="download-execute-btn" data-type="price-history">ダウンロード</button>
            </div>

            <!-- 予測パターン -->
            <div class="download-panel" id="panel-predictions">
              <h4>予測パターンデータ</h4>
              <p>AI予測の詳細情報（類似パターン分析結果）</p>
              <ul>
                <li>予測結果、信頼度、類似パターン数</li>
                <li>上昇/下降確率</li>
                <li>各タイムフレームごとの予測履歴</li>
              </ul>
              <button class="download-execute-btn" data-type="predictions">ダウンロード</button>
            </div>

            <!-- トレンド分析 -->
            <div class="download-panel" id="panel-trends">
              <h4>トレンド分析データ</h4>
              <p>3段階トレンド分析 + テクニカル分析の履歴</p>
              <ul>
                <li>長期/中期/短期トレンド</li>
                <li>テクニカル判定、トレンド強度</li>
                <li>各タイムフレームごとの分析履歴</li>
              </ul>
              <button class="download-execute-btn" data-type="trends">ダウンロード</button>
            </div>

            <!-- データ管理 -->
            <div class="download-panel" id="panel-data-management">
              <h4>💾 データ管理</h4>
              <p>学習データの完全バックアップと復元</p>

              <div style="margin-bottom: 24px;">
                <h5 style="color: #fff; margin-bottom: 12px;">📥 完全バックアップ (JSON)</h5>
                <p style="font-size: 13px; color: #b0b0b0; margin-bottom: 12px;">
                  全ての学習データを完全な形式で保存します<br>
                  ・セグメント詳細データを含む完全バックアップ<br>
                  ・CSV形式より詳細な情報を保持<br>
                  ・データ復元に使用可能
                </p>
                <button class="download-execute-btn" data-type="json-export" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                  JSONエクスポート
                </button>
              </div>

              <div style="margin-bottom: 24px;">
                <h5 style="color: #fff; margin-bottom: 12px;">📤 データ復元 (JSON)</h5>
                <p style="font-size: 13px; color: #b0b0b0; margin-bottom: 12px;">
                  バックアップしたJSONファイルからデータを復元します<br>
                  ⚠️ 既存データは上書きされます
                </p>
                <input type="file" id="json-import-file" accept=".json" style="display: none;">
                <button class="download-execute-btn" data-type="json-import" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                  JSONインポート
                </button>
              </div>

              <div style="padding: 12px; background: rgba(255, 193, 7, 0.1); border-radius: 8px; border-left: 4px solid #ffc107;">
                <p style="font-size: 12px; color: #ffc107; margin: 0;">
                  <strong>⚠️ 注意</strong><br>
                  JSONインポートは既存データを上書きします。<br>
                  必ず事前にバックアップを取ってください。
                </p>
              </div>

            </div>
          </div>
        </div>
    `;

    // スタイル追加
    const style = document.createElement('style');
    style.textContent = `
      #theoption-analyzer-panel {
        position: fixed;
        top: 50%;
        left: 20px;
        transform: translateY(-50%);
        z-index: 999999;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }

      .analyzer-compact {
        position: relative;
      }

      .analyzer-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%);
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 8px 16px;
        color: #2c3e50;
        font-size: 14px;
        font-weight: 600;
        cursor: move;
        transition: all 0.3s;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        white-space: nowrap;
        min-width: 400px;
        user-select: none;
      }

      .analyzer-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        background: linear-gradient(135deg, #ffffff 0%, #e8e8e8 100%);
      }

      .analyzer-icon {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.5px;
        padding: 2px 6px;
        background: rgba(102, 126, 234, 0.15);
        color: #667eea;
        border-radius: 4px;
      }

      .analyzer-text {
        font-size: 13px;
        color: #2c3e50;
      }

      .analyzer-dropdown {
        position: absolute;
        top: 45px;
        left: 50%;
        transform: translateX(-50%);
        width: 400px;
        height: 600px;
        min-height: 400px;
        background: linear-gradient(180deg, #1e3c72 0%, #2a5298 100%);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        display: none;
        overflow-y: auto;
        overflow-x: hidden;
      }

      /* スクロールバーのスタイル */
      .analyzer-dropdown::-webkit-scrollbar {
        width: 8px;
      }

      .analyzer-dropdown::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.2);
        border-radius: 0 12px 12px 0;
      }

      .analyzer-dropdown::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3);
        border-radius: 4px;
      }

      .analyzer-dropdown::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.5);
      }

      .analyzer-dropdown.active {
        display: block;
        animation: slideDown 0.3s ease;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }

      .asset-display {
        padding: 16px 20px;
        background: rgba(255, 215, 0, 0.1);
        border-bottom: 2px solid rgba(255, 215, 0, 0.3);
        text-align: center;
      }

      /* アラート音設定 */
      .alert-sound-section {
        padding: 12px 20px;
        background: rgba(0,0,0,0.15);
        border-bottom: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .alert-sound-label {
        font-size: 12px;
        color: #ffa726;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .alert-sound-toggle {
        position: relative;
        width: 50px;
        height: 26px;
        background: rgba(255,255,255,0.2);
        border-radius: 13px;
        cursor: pointer;
        transition: all 0.3s;
        border: 1px solid rgba(255,255,255,0.3);
      }

      .alert-sound-toggle.active {
        background: linear-gradient(135deg, #4fc3f7 0%, #29b6f6 100%);
        border-color: #4fc3f7;
        box-shadow: 0 0 10px rgba(79, 195, 247, 0.4);
      }

      .alert-sound-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        transition: all 0.3s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }

      .alert-sound-toggle.active::after {
        left: 26px;
      }

      .alert-sound-status {
        font-size: 10px;
        color: rgba(255,255,255,0.6);
        margin-left: 8px;
      }

      /* 表示設定 */
      .display-settings-section {
        padding: 12px 20px;
        background: rgba(0,0,0,0.15);
        border-bottom: 1px solid rgba(255,255,255,0.1);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .setting-label {
        font-size: 12px;
        color: #4fc3f7;
        font-weight: 600;
      }

      .compact-mode-toggle {
        position: relative;
        width: 50px;
        height: 26px;
        background: rgba(255,255,255,0.2);
        border-radius: 13px;
        cursor: pointer;
        transition: all 0.3s;
        border: 1px solid rgba(255,255,255,0.3);
      }

      .compact-mode-toggle.active {
        background: linear-gradient(135deg, #4fc3f7 0%, #29b6f6 100%);
        border-color: #4fc3f7;
        box-shadow: 0 0 10px rgba(79, 195, 247, 0.4);
      }

      .compact-mode-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        transition: all 0.3s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }

      .compact-mode-toggle.active::after {
        left: 26px;
      }

      .font-size-select {
        padding: 4px 8px;
        border: 1px solid rgba(255,255,255,0.3);
        background: rgba(255,255,255,0.1);
        color: white;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
        transition: all 0.3s;
      }

      .font-size-select:hover {
        background: rgba(255,255,255,0.2);
        border-color: rgba(255,255,255,0.5);
      }

      .font-size-select option {
        background: #1a1f2e;
        color: white;
      }

      /* コンパクトモード */
      #theoption-analyzer-panel.compact-mode .analyzer-dropdown {
        padding: 8px;
      }

      #theoption-analyzer-panel.compact-mode .asset-display {
        padding: 8px 12px;
      }

      #theoption-analyzer-panel.compact-mode .asset-name {
        font-size: 14px;
      }

      #theoption-analyzer-panel.compact-mode .alert-sound-section,
      #theoption-analyzer-panel.compact-mode .display-settings-section {
        padding: 8px 12px;
      }

      #theoption-analyzer-panel.compact-mode .timeframe-analysis-tab {
        padding: 6px 10px;
      }

      #theoption-analyzer-panel.compact-mode .tab-time {
        font-size: 11px;
      }

      #theoption-analyzer-panel.compact-mode .timeframe-content {
        padding: 8px;
      }

      #theoption-analyzer-panel.compact-mode .signal-display {
        padding: 6px 10px;
      }

      #theoption-analyzer-panel.compact-mode .detail-section {
        padding: 6px;
      }

      /* フォントサイズ - 小 */
      #theoption-analyzer-panel.font-small * {
        font-size: 10px !important;
      }

      #theoption-analyzer-panel.font-small .asset-name {
        font-size: 14px !important;
      }

      #theoption-analyzer-panel.font-small .signal-label {
        font-size: 11px !important;
      }

      #theoption-analyzer-panel.font-small .signal-value {
        font-size: 11px !important;
      }

      #theoption-analyzer-panel.font-small .tab-time {
        font-size: 10px !important;
      }

      #theoption-analyzer-panel.font-small .alert-sound-label,
      #theoption-analyzer-panel.font-small .setting-label {
        font-size: 10px !important;
      }

      /* フォントサイズ - 中（デフォルト） */
      #theoption-analyzer-panel.font-medium * {
        font-size: 12px !important;
      }

      #theoption-analyzer-panel.font-medium .asset-name {
        font-size: 18px !important;
      }

      #theoption-analyzer-panel.font-medium .signal-label {
        font-size: 13px !important;
      }

      #theoption-analyzer-panel.font-medium .signal-value {
        font-size: 13px !important;
      }

      #theoption-analyzer-panel.font-medium .tab-time {
        font-size: 12px !important;
      }

      #theoption-analyzer-panel.font-medium .alert-sound-label,
      #theoption-analyzer-panel.font-medium .setting-label {
        font-size: 12px !important;
      }

      /* フォントサイズ - 大 */
      #theoption-analyzer-panel.font-large * {
        font-size: 14px !important;
      }

      #theoption-analyzer-panel.font-large .asset-name {
        font-size: 22px !important;
      }

      #theoption-analyzer-panel.font-large .signal-label {
        font-size: 16px !important;
      }

      #theoption-analyzer-panel.font-large .signal-value {
        font-size: 16px !important;
      }

      #theoption-analyzer-panel.font-large .tab-time {
        font-size: 14px !important;
      }

      #theoption-analyzer-panel.font-large .alert-sound-label,
      #theoption-analyzer-panel.font-large .setting-label {
        font-size: 14px !important;
      }

      .asset-drag-handle {
        cursor: move;
        user-select: none;
        padding: 4px 0;
        margin: -4px 0;
      }

      .asset-drag-handle:hover {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
      }

      .asset-label {
        font-size: 10px;
        color: #FFD700;
        opacity: 0.8;
        margin-bottom: 6px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .asset-name {
        font-size: 18px;
        color: #FFD700;
        font-weight: 700;
        margin-bottom: 6px;
        text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
      }

      .asset-data-count {
        font-size: 11px;
        color: #fff;
        opacity: 0.7;
        font-weight: 500;
      }

      .download-csv-button {
        margin-top: 8px;
        padding: 8px 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        border-radius: 6px;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        width: 100%;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      }

      .download-csv-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
      }

      .download-csv-button:active {
        transform: translateY(0);
      }

      .download-csv-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      /* ダウンロードモーダル */
      .download-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 99999999;
        align-items: flex-start;
        justify-content: center;
        padding: 40px 20px;
        box-sizing: border-box;
        overflow-y: auto;
      }

      .download-modal.active {
        display: flex;
      }

      .download-modal-content {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 16px;
        width: 600px;
        max-width: 100%;
        max-height: 100%;
        overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        animation: modalSlideIn 0.3s ease-out;
        margin: 0 auto;
        position: relative;
        z-index: 100000000;
      }

      @keyframes modalSlideIn {
        from {
          opacity: 0;
          transform: translateY(-30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .download-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 2px solid rgba(102, 126, 234, 0.3);
      }

      .download-modal-header h3 {
        margin: 0;
        color: #fff;
        font-size: 18px;
        font-weight: 600;
      }

      .download-modal-close {
        background: none;
        border: none;
        color: #fff;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .download-modal-close:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .download-tabs {
        display: flex;
        padding: 0 24px;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .download-tab {
        flex: 1;
        padding: 12px 16px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        border-bottom: 3px solid transparent;
      }

      .download-tab:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.05);
      }

      .download-tab.active {
        color: #fff;
        border-bottom-color: #667eea;
      }

      .download-tab-content {
        padding: 24px;
        max-height: 400px;
        overflow-y: auto;
      }

      .download-panel {
        display: none;
      }

      .download-panel.active {
        display: block;
        animation: fadeIn 0.3s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .download-panel h4 {
        margin: 0 0 8px 0;
        color: #fff;
        font-size: 16px;
        font-weight: 600;
      }

      .download-panel p {
        margin: 0 0 16px 0;
        color: rgba(255, 255, 255, 0.7);
        font-size: 13px;
        line-height: 1.5;
      }

      .download-panel ul {
        margin: 0 0 20px 0;
        padding-left: 20px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        line-height: 1.8;
      }

      .download-panel li {
        margin-bottom: 4px;
      }

      .download-execute-btn {
        width: 100%;
        padding: 12px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      .download-execute-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
      }

      .download-execute-btn:active {
        transform: translateY(0);
      }

      .download-execute-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .timeframe-analysis-tabs {
        display: flex;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(0,0,0,0.25);
        border-bottom: 2px solid rgba(255,255,255,0.1);
        gap: 6px;
      }

      .timeframe-analysis-tab {
        flex: 1;
        padding: 8px 6px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        transition: all 0.3s;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .timeframe-analysis-tab:hover {
        background: rgba(255,255,255,0.15);
        transform: translateY(-2px);
      }

      .timeframe-analysis-tab.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-color: #667eea;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transform: translateY(-2px);
      }

      .tab-time {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.8;
      }

      .tab-signal-icon {
        font-size: 20px;
        line-height: 1;
        margin: 2px 0;
      }

      .tab-signal-icon[data-signal="wait"] {
        color: rgba(255,255,255,0.3);
      }

      .tab-signal-icon[data-signal="high"] {
        color: #4ade80;
        text-shadow: 0 0 10px rgba(74, 222, 128, 0.6);
      }

      .tab-signal-icon[data-signal="low"] {
        color: #f87171;
        text-shadow: 0 0 10px rgba(248, 113, 113, 0.6);
      }

      .tab-confidence {
        font-size: 13px;
        font-weight: 700;
        color: rgba(255,255,255,0.9);
      }

      .timeframe-info {
        padding: 14px 20px;
        background: rgba(0,0,0,0.15);
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .timeframe-info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 11px;
      }

      .timeframe-info-label {
        color: #4fc3f7;
        font-weight: 600;
      }

      .timeframe-info-value {
        color: #fff;
        font-weight: 700;
      }

      .signal-display {
        padding: 16px 16px;
        background: rgba(0,0,0,0.2);
        border-bottom: 2px solid rgba(255,255,255,0.1);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .signal-section {
        background: rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 16px;
        border: 1px solid rgba(255,255,255,0.1);
      }

      .signal-label {
        font-size: 11px;
        font-weight: bold;
        color: #4fc3f7;
        margin-bottom: 12px;
        text-align: center;
        letter-spacing: 0.5px;
      }

      .signal-main {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .signal-light-large {
        font-size: 40px;
        filter: drop-shadow(0 0 15px currentColor);
        transition: all 0.3s;
        flex-shrink: 0;
      }

      .signal-light-large[data-signal="high"] {
        color: #4ade80;
      }

      .signal-light-large[data-signal="low"] {
        color: #f87171;
      }

      .signal-light-large[data-signal="wait"] {
        color: rgba(255,255,255,0.3);
      }

      .signal-info {
        flex: 1;
      }

      .signal-direction {
        font-size: 14px;
        color: #fff;
        font-weight: 700;
        margin-bottom: 4px;
        text-align: center;
      }

      .signal-confidence-large {
        font-size: 24px;
        color: #FFD700;
        font-weight: 700;
        text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        text-align: center;
      }

      .hierarchical-trend {
        padding: 16px 20px;
        background: rgba(0,0,0,0.2);
        border-top: 1px solid rgba(255,255,255,0.1);
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .trend-title {
        font-size: 14px;
        color: #fff;
        font-weight: 700;
        margin-bottom: 12px;
        text-align: center;
      }

      .trend-layers {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .trend-layer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: rgba(255,255,255,0.08);
        border-radius: 6px;
        border-left: 3px solid rgba(255,255,255,0.3);
      }

      .trend-label {
        font-size: 12px;
        color: rgba(255,255,255,0.8);
        font-weight: 600;
        min-width: 80px;
      }

      .trend-arrow {
        font-size: 20px;
        margin: 0 8px;
      }

      .trend-status {
        font-size: 13px;
        color: #fff;
        font-weight: 600;
        flex: 1;
        text-align: right;
      }

      .trend-layer[data-trend="UP"] {
        border-left-color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
      }

      .trend-layer[data-trend="DOWN"] {
        border-left-color: #f87171;
        background: rgba(248, 113, 113, 0.1);
      }

      .trend-layer[data-trend="UP"] .trend-arrow {
        color: #4ade80;
      }

      .trend-layer[data-trend="DOWN"] .trend-arrow {
        color: #f87171;
      }

      .trend-alignment {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        background: rgba(255,255,255,0.05);
        border-radius: 6px;
        margin-top: 8px;
      }

      .alignment-text {
        font-size: 13px;
        color: #fff;
        font-weight: 700;
      }

      .trend-alignment[data-alignment="STRONG_UP"] {
        background: rgba(74, 222, 128, 0.15);
        border: 1px solid rgba(74, 222, 128, 0.3);
      }

      .trend-alignment[data-alignment="STRONG_DOWN"] {
        background: rgba(248, 113, 113, 0.15);
        border: 1px solid rgba(248, 113, 113, 0.3);
      }

      .trend-alignment[data-alignment="MIXED"] {
        background: rgba(251, 191, 36, 0.15);
        border: 1px solid rgba(251, 191, 36, 0.3);
      }

      .signal-item {
        text-align: center;
        padding: 12px 8px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
        transition: all 0.3s;
      }

      .signal-item:hover {
        background: rgba(255,255,255,0.15);
        transform: translateY(-2px);
      }

      .signal-time {
        font-size: 11px;
        color: #fff;
        opacity: 0.8;
        margin-bottom: 8px;
        font-weight: 600;
      }

      .signal-light {
        font-size: 32px;
        margin: 8px 0;
        filter: drop-shadow(0 0 8px currentColor);
        transition: all 0.3s;
      }

      .signal-light[data-signal="high"] {
        color: #4CAF50;
      }

      .signal-light[data-signal="low"] {
        color: #F44336;
      }

      .signal-light[data-signal="wait"] {
        color: #9E9E9E;
      }

      .signal-confidence {
        font-size: 13px;
        color: #fff;
        font-weight: 700;
        margin-top: 4px;
      }

      .recommendation {
        padding: 20px;
        background: rgba(0,0,0,0.15);
        border-top: 2px solid rgba(255,255,255,0.1);
      }

      .rec-title {
        font-size: 13px;
        color: #FFD700;
        font-weight: 700;
        margin-bottom: 10px;
      }

      .rec-content {
        font-size: 14px;
        color: #fff;
        line-height: 1.6;
        font-weight: 500;
      }

      .ml-status {
        padding: 16px 20px;
        background: rgba(0,0,0,0.2);
        border-top: 2px solid rgba(255,255,255,0.1);
      }

      .ml-title {
        font-size: 12px;
        color: #4fc3f7;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .ml-info {
        font-size: 12px;
        color: #fff;
        opacity: 0.9;
        margin-bottom: 8px;
      }

      .ml-progress {
        height: 6px;
        background: rgba(0,0,0,0.3);
        border-radius: 3px;
        overflow: hidden;
      }

      .ml-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #4fc3f7, #667eea);
        border-radius: 3px;
        transition: width 0.3s;
        width: 0%;
      }

      /* 類似度閾値設定 */
      .similarity-threshold-section {
        padding: 16px 20px;
        background: rgba(0,0,0,0.15);
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .similarity-threshold-title {
        font-size: 12px;
        color: #4fc3f7;
        font-weight: 600;
        margin-bottom: 10px;
      }

      .similarity-threshold-buttons {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }

      .similarity-threshold-btn {
        flex: 1;
        padding: 8px 12px;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .similarity-threshold-btn:hover {
        background: rgba(255,255,255,0.2);
        border-color: rgba(255,255,255,0.3);
      }

      .similarity-threshold-btn.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-color: #667eea;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
      }

      .similarity-threshold-info {
        font-size: 11px;
        color: #e0e0e0;
        opacity: 0.7;
        text-align: center;
      }

      /* データ件数制限設定 */
      .data-limit-section {
        padding: 16px 20px;
        background: rgba(0,0,0,0.15);
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .data-limit-title {
        font-size: 12px;
        color: #ffa726;
        font-weight: 600;
        margin-bottom: 10px;
      }

      .data-limit-buttons {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
      }

      .data-limit-btn {
        flex: 1;
        padding: 8px 10px;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 6px;
        color: white;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .data-limit-btn:hover {
        background: rgba(255,255,255,0.2);
        border-color: rgba(255,255,255,0.3);
      }

      .data-limit-btn.active {
        background: linear-gradient(135deg, #ffa726 0%, #fb8c00 100%);
        border-color: #ffa726;
        box-shadow: 0 2px 8px rgba(255, 167, 38, 0.4);
      }

      .data-limit-info {
        font-size: 11px;
        color: #e0e0e0;
        opacity: 0.7;
        text-align: center;
      }

      .details-toggle {
        padding: 12px 20px;
        text-align: center;
        font-size: 12px;
        color: #fff;
        opacity: 0.7;
        cursor: pointer;
        border-top: 1px solid rgba(255,255,255,0.1);
        transition: all 0.3s;
      }

      .details-toggle:hover {
        opacity: 1;
        background: rgba(255,255,255,0.05);
      }

      .details-panel {
        border-top: 1px solid rgba(255,255,255,0.1);
        background: rgba(0,0,0,0.2);
      }

      .detail-section {
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .detail-section:last-child {
        border-bottom: none;
      }

      .detail-title {
        font-size: 12px;
        color: #4fc3f7;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .detail-content {
        font-size: 12px;
        color: #fff;
        opacity: 0.9;
        line-height: 1.6;
      }

      /* リサイズハンドル */
      .resize-handle {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        width: 400px;
        height: 12px;
        cursor: ns-resize;
        z-index: 10;
        background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%);
        border-radius: 0 0 12px 12px;
        display: none;
      }

      .resize-handle:hover {
        background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.2) 100%);
      }

      .resize-handle::before {
        content: '⋮';
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        color: rgba(255,255,255,0.4);
        font-size: 16px;
        letter-spacing: 2px;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(uiPanel);
    document.body.appendChild(downloadModal);

    // ドラッグ＆リサイズ機能の実装
    let isDragging = false;
    let isResizing = false;
    let dragStarted = false;
    let justFinishedDragging = false; // ドラッグ完了直後フラグ
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let startMouseX;
    let startMouseY;
    let xOffset = 0;
    let yOffset = 0;
    let panelHeight = 600; // デフォルト高さ
    const DRAG_THRESHOLD = 5; // ドラッグと判定する移動距離（ピクセル）

    const toggleButton = document.getElementById('analyzer-toggle');
    const resizeHandle = document.getElementById('resize-handle');
    const container = document.getElementById('theoption-analyzer-panel');
    const dropdown = document.getElementById('analyzer-dropdown');

    // 初期位置とサイズを保存された値から復元
    chrome.storage.local.get(['panelPosition', 'panelHeight'], (result) => {
      if (result.panelPosition) {
        // 保存された絶対位置を取得
        const savedLeft = parseInt(result.panelPosition.left);
        const savedTop = parseInt(result.panelPosition.top);

        // デフォルト位置からのオフセットを計算
        const defaultLeft = 20; // CSSのデフォルト left: 20px
        const defaultTop = window.innerHeight * 0.5; // CSSのデフォルト top: 50%

        xOffset = savedLeft - defaultLeft;
        yOffset = savedTop - defaultTop;

        // translateで位置を設定
        container.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
      }

      // 保存された高さを復元
      if (result.panelHeight) {
        panelHeight = parseInt(result.panelHeight);
        dropdown.style.height = panelHeight + 'px';
        updateResizeHandlePosition();
      }
    });

    // リサイズハンドルの位置を更新する関数
    function updateResizeHandlePosition() {
      if (dropdown.classList.contains('active')) {
        const dropdownTop = 45; // .analyzer-dropdownのtop値
        const handleHeight = 12; // リサイズハンドルの高さ
        resizeHandle.style.top = (dropdownTop + panelHeight - handleHeight) + 'px';
        resizeHandle.style.display = 'block';
      } else {
        resizeHandle.style.display = 'none';
      }
    }

    // トグルボタンのドラッグイベント
    toggleButton.addEventListener('mousedown', toggleButtonMouseDown);

    // リサイズイベント
    resizeHandle.addEventListener('mousedown', resizeStart);

    // 共通イベント
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    function toggleButtonMouseDown(e) {
      // ドラッグ開始の準備
      dragStarted = true;
      isDragging = false;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      e.preventDefault();
    }

    function resizeStart(e) {
      isResizing = true;
      initialY = e.clientY;
      e.preventDefault();
      e.stopPropagation();
    }

    function handleMouseMove(e) {
      // ドラッグ開始判定（閾値を超えたら）
      if (dragStarted && !isDragging && !isResizing) {
        const deltaX = Math.abs(e.clientX - startMouseX);
        const deltaY = Math.abs(e.clientY - startMouseY);

        if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
          isDragging = true;
        }
      }

      if (isDragging) {
        e.preventDefault();

        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, container);
      } else if (isResizing) {
        e.preventDefault();

        const deltaY = e.clientY - initialY;
        const newHeight = Math.max(400, panelHeight + deltaY); // 最小400px

        dropdown.style.height = newHeight + 'px';

        // リサイズ中もハンドル位置を更新
        const dropdownTop = 45;
        const handleHeight = 12;
        resizeHandle.style.top = (dropdownTop + newHeight - handleHeight) + 'px';
      }
    }

    function handleMouseUp(e) {
      if (isDragging) {
        initialX = currentX;
        initialY = currentY;

        isDragging = false;
        dragStarted = false;
        justFinishedDragging = true; // ドラッグ完了フラグを設定

        // 位置を保存
        const rect = container.getBoundingClientRect();
        chrome.storage.local.set({
          panelPosition: {
            left: rect.left + 'px',
            top: rect.top + 'px'
          }
        });
      } else if (isResizing) {
        const deltaY = e.clientY - initialY;
        panelHeight = Math.max(400, panelHeight + deltaY);
        initialY = e.clientY;

        isResizing = false;

        // リサイズハンドルの位置を更新
        updateResizeHandlePosition();

        // 高さを保存
        chrome.storage.local.set({
          panelHeight: panelHeight
        });
      } else if (dragStarted) {
        // ドラッグではなくクリックだった
        dragStarted = false;
        justFinishedDragging = false; // クリックの場合はフラグをクリア
        // クリックイベントは別のリスナーで処理されるため、ここでは何もしない
      }
    }

    function setTranslate(xPos, yPos, el) {
      el.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }

    // イベントリスナー
    document.getElementById('analyzer-toggle').addEventListener('click', (e) => {
      // ドラッグ中、またはドラッグ直後はクリックイベントを無視
      if (isDragging || dragStarted || justFinishedDragging) {
        e.preventDefault();
        e.stopPropagation();
        // ドラッグ完了フラグをリセット
        if (justFinishedDragging) {
          justFinishedDragging = false;
        }
        return;
      }
      document.getElementById('analyzer-dropdown').classList.toggle('active');
      // リサイズハンドルの位置を更新（開閉時）
      updateResizeHandlePosition();
    });


    // 時間枠分析タブのクリックイベント
    document.querySelectorAll('.timeframe-analysis-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const timeframe = parseInt(tab.dataset.timeframe);
        switchTimeframe(timeframe);
      });
    });

    // 類似度閾値ボタンのクリックイベント
    document.querySelectorAll('.similarity-threshold-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const threshold = parseInt(btn.dataset.threshold);
        changeSimilarityThreshold(threshold);
      });
    });

    // データ件数制限ボタンのクリックイベント
    document.querySelectorAll('.data-limit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const limit = btn.dataset.limit === 'all' ? null : parseInt(btn.dataset.limit);
        changeDataLimit(limit);
      });
    });

    // アラート音トグルのクリックイベント
    document.getElementById('alert-sound-toggle').addEventListener('click', () => {
      toggleAlertSound();
    });

    // コンパクトモードトグルのクリックイベント
    document.getElementById('compact-mode-toggle').addEventListener('click', () => {
      const newMode = !compactMode;
      applyCompactMode(newMode);
      chrome.storage.local.set({ compactMode: newMode });
    });

    // フォントサイズ選択のイベント
    document.getElementById('font-size-select').addEventListener('change', (e) => {
      const size = e.target.value;
      applyFontSize(size);
      chrome.storage.local.set({ fontSize: size });
    });

    // CSVダウンロードボタンのクリックイベント（モーダルを開く）
    document.getElementById('download-csv-button').addEventListener('click', () => {
      document.getElementById('download-modal').classList.add('active');
    });

    // モーダルを閉じる
    document.getElementById('download-modal-close').addEventListener('click', () => {
      document.getElementById('download-modal').classList.remove('active');
    });

    // モーダル背景クリックで閉じる
    document.getElementById('download-modal').addEventListener('click', (e) => {
      if (e.target.id === 'download-modal') {
        document.getElementById('download-modal').classList.remove('active');
      }
    });

    // ダウンロードタブの切り替え
    document.querySelectorAll('.download-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        // すべてのタブとパネルから active を削除
        document.querySelectorAll('.download-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.download-panel').forEach(p => p.classList.remove('active'));

        // 選択されたタブとパネルに active を追加
        tab.classList.add('active');
        document.getElementById(`panel-${tabName}`).classList.add('active');
      });
    });

    // 各ダウンロード実行ボタン
    document.querySelectorAll('.download-execute-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dataType = btn.dataset.type;
        executeDownload(dataType);
      });
    });

    console.log('[TheOption Analyzer] ✅ UI作成完了');
  }

  // ========================================
  // 時間枠切り替え
  // ========================================

  function switchTimeframe(newTimeframe) {
    if (currentTimeframe === newTimeframe) return;

    console.log(`[TheOption Analyzer] ⏱️ 時間枠切り替え: ${TIMEFRAME_CONFIGS[currentTimeframe].label} → ${TIMEFRAME_CONFIGS[newTimeframe].label}`);

    currentTimeframe = newTimeframe;

    // タブのアクティブ状態を更新
    document.querySelectorAll('.timeframe-analysis-tab').forEach(tab => {
      if (parseInt(tab.dataset.timeframe) === newTimeframe) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 判定時間をストレージに保存
    chrome.storage.local.set({ currentTimeframe: newTimeframe });

    // タブ切り替え時は次回分析まで待機
    const minDataPoints = TIMEFRAME_CONFIGS[newTimeframe].minDataPoints;

    if (priceHistory.length >= minDataPoints) {
      // 現在時刻を設定して、次回の分析インターバルまで待機
      lastAnalysisTimes[newTimeframe] = Date.now();

      console.log(`[TheOption Analyzer] ⏳ ${TIMEFRAME_CONFIGS[newTimeframe].label}に切り替え - 次回分析まで待機中`);
      console.log(`[TheOption Analyzer] 📋 updateUIを呼び出し: status=WAITING, message=次回分析まで待機中...`);

      // 待機中メッセージを表示
      updateUI({
        status: 'WAITING',
        message: `次回分析まで待機中...`,
        timeframe: newTimeframe
      });

      console.log(`[TheOption Analyzer] ✅ updateUI呼び出し完了`);
    } else {
      console.log(`[TheOption Analyzer] ⏳ ${TIMEFRAME_CONFIGS[newTimeframe].label} - データ不足（${priceHistory.length}/${minDataPoints}秒）`);
      updateUI({
        status: 'COLLECTING',
        message: `データ収集中... ${priceHistory.length}/${minDataPoints}秒`,
        timeframe: newTimeframe
      });
    }

    // 時間枠情報を更新
    updateTimeframeInfo();
  }

  function updateTimeframeInfo() {
    const config = TIMEFRAME_CONFIGS[currentTimeframe];

    document.getElementById('current-timeframe-display').textContent = config.label;
    document.getElementById('update-interval-display').textContent = `${config.updateInterval}秒ごと`;
    document.getElementById('data-window-display').textContent = `直近${config.dataWindow}秒`;
  }

  // ========================================
  // 類似度閾値変更
  // ========================================

  function changeSimilarityThreshold(newThreshold) {
    console.log(`[TheOption Analyzer] 🎯 類似度閾値変更: ${currentSimilarityThreshold}% → ${newThreshold}%`);

    currentSimilarityThreshold = newThreshold;

    // ボタンのアクティブ状態を更新
    document.querySelectorAll('.similarity-threshold-btn').forEach(btn => {
      if (parseInt(btn.dataset.threshold) === newThreshold) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 表示テキストを更新
    document.getElementById('current-threshold').textContent = newThreshold;

    // 閾値をストレージに保存
    chrome.storage.local.set({ similarityThreshold: newThreshold });

    // 全時間枠の予測を再計算して表示を即座に更新
    repredictAllTimeframes();
  }

  // ========================================
  // アラート音のON/OFF切り替え
  // ========================================

  function toggleAlertSound() {
    alertSoundEnabled = !alertSoundEnabled;

    console.log(`[TheOption Analyzer] 🔊 アラート音: ${alertSoundEnabled ? 'ON' : 'OFF'}`);

    // トグルボタンの見た目を更新
    const toggleBtn = document.getElementById('alert-sound-toggle');
    const statusText = document.getElementById('alert-sound-status');

    if (alertSoundEnabled) {
      toggleBtn.classList.add('active');
      statusText.textContent = 'ON';
    } else {
      toggleBtn.classList.remove('active');
      statusText.textContent = 'OFF';
    }

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

    // ボタンのアクティブ状態を更新
    document.querySelectorAll('.data-limit-btn').forEach(btn => {
      const limit = btn.dataset.limit === 'all' ? null : parseInt(btn.dataset.limit);
      if (limit === newLimit) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 表示テキストを更新
    const displayText = newLimit === null ? '全期間' : `直近${newLimit}件`;
    document.getElementById('current-data-limit').textContent = displayText;

    // データ件数制限をストレージに保存
    chrome.storage.local.set({ dataLimit: newLimit });

    // 全時間枠の予測を再計算して表示を即座に更新
    repredictAllTimeframes();
  }

  // 全時間枠の予測を再実行（閾値変更時）
  function repredictAllTimeframes() {
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
        const newPrediction = mlSystem.predictWithThreshold(
          cachedResult.currentSituation,
          timeframe,
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

  function updateCountdown(elapsed, interval) {
    const countdownEl = document.getElementById('next-analysis-countdown');
    if (!countdownEl) return;

    const remaining = Math.max(0, Math.ceil(interval - elapsed));

    if (remaining === 0) {
      countdownEl.textContent = '🔄 分析中...';
      countdownEl.style.color = '#4CAF50';
    } else if (remaining <= 3) {
      countdownEl.textContent = `${remaining}秒`;
      countdownEl.style.color = '#FFA726';
    } else {
      countdownEl.textContent = `${remaining}秒`;
      countdownEl.style.color = '#e0e0e0';
    }
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
          console.log(`[TheOption Analyzer] 📂 ${asset} の価格データを復元 (${data.priceHistory.length}件, ${Math.round(age/1000)}秒前)`);
          return data;
        } else {
          console.log(`[TheOption Analyzer] ⏰ ${asset} のデータが古すぎます (${Math.round(age/60000)}分前) - 新規収集します`);
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
            console.log(`[TheOption Analyzer] 📂 ${asset} の価格データを復元 (${data.priceHistory.length}件, ${Math.round(age/1000)}秒前) - localStorage使用`);
            return data;
          } else {
            console.log(`[TheOption Analyzer] ⏰ ${asset} のデータが古すぎます (${Math.round(age/60000)}分前) - 新規収集します`);
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

      // 通貨ペア切り替え検出（5秒ごと・パフォーマンス最適化）
      if (now - lastAssetCheck > 5000) {
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
            mlSystem.initialize(detectedAsset).then(() => {
              console.log(`[TheOption Analyzer] 🧠 ${detectedAsset} のMLシステムを初期化完了`);

              // 価格履歴から過去のML結果を復元（ブラウザ更新時のsetTimeout消失対策）
              if (priceHistory.length > 0) {
                const restored = mlSystem.restoreResultsFromPriceHistory(priceHistory);
                if (restored > 0) {
                  console.log(`[TheOption Analyzer] ✨ ${detectedAsset} のML結果を復元: ${restored}件`);
                }
              }
            });
          }

          const previousAsset = currentAsset;
          currentAsset = detectedAsset;
          updateAssetDisplay(currentAsset, priceHistory.length);

          // 通貨ペアが変更された場合、UI表示をクリア
          if (previousAsset !== currentAsset) {
            // AI予測根拠をクリア
            const detailMlReason = document.getElementById('detail-ml-reason');
            if (detailMlReason) {
              detailMlReason.innerHTML = `
                <div style="padding: 12px; background: rgba(102, 126, 234, 0.1); border-radius: 12px; border-left: 3px solid #667eea; text-align: center; color: #a0aec0;">
                  <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">AI予測（機械学習）</div>
                  <div style="font-size: 12px; opacity: 0.8;">データ収集中...</div>
                  <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">AI分析が実行されると表示されます</div>
                </div>
              `;
            }

            // テクニカル分析もクリア
            const detailAnalysis = document.getElementById('detail-analysis');
            if (detailAnalysis) {
              detailAnalysis.innerHTML = `
                <div style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 12px; text-align: center; color: #a0aec0;">
                  <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">テクニカル分析</div>
                  <div style="font-size: 12px; opacity: 0.8;">データ収集中...</div>
                  <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">価格データが集まると表示されます</div>
                </div>
              `;
            }

            // 予測品質レポートも更新（パフォーマンス最適化のため無効化）
            // updateQualityReport();
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
        const currentTimeSinceLastAnalysis = (now - lastAnalysisTimes[currentTimeframe]) / 1000;

        // カウントダウンが変わった時だけUI更新（パフォーマンス最適化）
        const countdownSeconds = Math.floor(currentTimeSinceLastAnalysis);
        if (lastDisplayedCountdown !== countdownSeconds) {
          updateCountdown(currentTimeSinceLastAnalysis, currentConfig.updateInterval);
          lastDisplayedCountdown = countdownSeconds;
        }

        // パフォーマンス最適化: 15秒ごとにMLデータ収集（全判定時間のデータを1回だけ計算）
        const timeSinceLastMLCollection = (now - lastMLDataCollectionTime) / 1000;
        if (timeSinceLastMLCollection >= 15) {
          collectMLData(price);
          lastMLDataCollectionTime = now;
        }

        // 選択中の時間枠のみ分析実行（パフォーマンス最適化: CPU負荷80%削減）
        // 他の時間枠はデータ収集のみ（タブ切り替え時に即座に分析）
        const config = TIMEFRAME_CONFIGS[currentTimeframe];
        const timeSinceLastAnalysis = (now - lastAnalysisTimes[currentTimeframe]) / 1000;

        if (timeSinceLastAnalysis >= config.updateInterval) {
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
    }, 2000); // パフォーマンス最適化: 2秒ごとに変更
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

    // 多次元分析（代表として60秒を使用）
    let multiDimResult;
    try {
      multiDimResult = multiDimAnalyzer.analyzeTimeframe({
        prices: relevantPrices,
        candles: candles,
        ticks: relevantTicks
      }, 60, currentAsset);
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
      ma5: priceHistory.slice(-5).reduce((a,b) => a+b) / 5,
      ma20: priceHistory.length >= 20 ? priceHistory.slice(-20).reduce((a,b) => a+b) / 20 : currentPrice
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

  function performAnalysis(currentPrice, options = {}) {
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

    // 多次元分析（時間枠別の重み付けを使用）
    let multiDimResult;
    try {
      multiDimResult = multiDimAnalyzer.analyzeTimeframe({
        prices: relevantPrices,
        candles: candles,
        ticks: relevantTicks
      }, targetTimeframe, currentAsset);
      console.log(`[TheOption Analyzer] ${config.label} 多次元分析完了:`, multiDimResult);
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
        ma5: priceHistory.slice(-5).reduce((a,b) => a+b) / 5,
        ma20: priceHistory.length >= 20 ? priceHistory.slice(-20).reduce((a,b) => a+b) / 20 : currentPrice
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
      mlPredictions = mlSystem.predictOne(currentSituation, targetTimeframe, currentSimilarityThreshold, currentDataLimit);
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
  // UI更新
  // ========================================

  function updateUI(data) {
    // ボタンテキスト更新
    const analyzerText = document.getElementById('analyzer-text');

    if (data.status === 'COLLECTING') {
      analyzerText.textContent = data.message;
      // メインシグナルも更新
      updateMainSignal(
        { signal: 'WAIT', confidence: 0, direction: 'データ収集中' },
        { available: false }
      );
      return;
    }

    if (data.status === 'WAITING') {
      console.log('[TheOption Analyzer] ⏳ WAITING状態のUI更新:', data.message);
      analyzerText.textContent = data.message;
      // メインシグナルも更新（テクニカルとAI両方とも待機中）
      updateMainSignal(
        { signal: 'WAIT', confidence: null, direction: '待機中' },
        { signal: 'WAIT', confidence: null, direction: '待機中', available: true, isWaiting: true }
      );
      return;
    }

    if (data.status === 'ACTIVE') {
      // 選択中の時間枠の分析結果を取得（テクニカルとAI別々）
      const signals = getCurrentTimeframeSignal(data.multiDim, data.ml);

      // ボタンテキスト（テクニカル / AI の両方を表示）
      // HIGH/LOWの場合はパーセンテージ表示、NEUTRALの場合は見送りのみ
      const techText = signals.technical.confidence !== null
        ? `${signals.technical.direction} ${signals.technical.confidence}%`
        : signals.technical.direction;
      const aiText = signals.ai.available
        ? (signals.ai.confidence !== null ? `${signals.ai.direction} ${signals.ai.confidence}%` : `${signals.ai.direction}`)
        : 'データ不足';

      analyzerText.textContent = `${TIMEFRAME_CONFIGS[currentTimeframe].label} ${techText} / ${aiText}`;

      // メインシグナル表示（テクニカルとAI別々、データ数も渡す）
      updateMainSignal(signals.technical, signals.ai, priceHistory.length);

      // 全時間枠の信号機更新
      updateSignalLights(data.multiDim, data.ml);

      // 3段階トレンド分析更新（UI削除のためコメントアウト）
      // updateHierarchicalTrend();

      // ML状況更新
      console.log('[TheOption Analyzer] 🔄 updateMLStatus 呼び出し中...');
      updateMLStatus(data.mlStats);
      console.log('[TheOption Analyzer] ✅ updateMLStatus 完了');

      // 詳細更新
      console.log('[TheOption Analyzer] 🔄 updateDetails 呼び出し中...', {
        hasMultiDim: !!data.multiDim,
        hasMl: !!data.ml,
        mlStatus: data.ml?.status
      });
      updateDetails(data.multiDim, data.ml);
      console.log('[TheOption Analyzer] ✅ updateDetails 完了');
    }
  }

  function updateMainSignal(techSignal, aiSignal, dataCount) {
    // テクニカル分析の表示
    const techLightEl = document.getElementById('tech-signal-light');
    const techDirectionEl = document.getElementById('tech-signal-direction');
    const techConfidenceEl = document.getElementById('tech-signal-confidence');

    if (techLightEl && techDirectionEl && techConfidenceEl) {
      // データ収集中の判定
      const config = TIMEFRAME_CONFIGS[currentTimeframe];
      const requiredData = config.minDataPoints;
      const currentData = dataCount || priceHistory.length;

      if (currentData < requiredData) {
        // まだデータが足りない - 進捗率表示
        const progressPercent = Math.floor((currentData / requiredData) * 100);

        techLightEl.textContent = '⏳';
        techLightEl.setAttribute('data-signal', 'wait');
        techDirectionEl.textContent = 'データ取得中';
        techConfidenceEl.textContent = `${progressPercent}%`;
      } else {
        // データが十分 - 通常の分析表示

        // シグナルに基づいて表示
        if (techSignal.signal === 'HIGH' || techSignal.signal === 'STRONG_HIGH') {
          // 70%以上で🟢、それ以下は⚪
          if (techSignal.confidence !== null && techSignal.confidence >= 70) {
            techLightEl.textContent = '🟢';
            techLightEl.setAttribute('data-signal', 'high');
            techDirectionEl.textContent = 'HIGH推奨';
          } else {
            techLightEl.textContent = '⚪';
            techLightEl.setAttribute('data-signal', 'wait');
            techDirectionEl.textContent = 'HIGH';
          }
          // HIGH/LOWの場合は必ずパーセンテージ表示
          techConfidenceEl.textContent = techSignal.confidence !== null ? `${techSignal.confidence}%` : '--';
          // アラート音を鳴らす
          playAlertSound();
        } else if (techSignal.signal === 'LOW' || techSignal.signal === 'STRONG_LOW') {
          // 70%以上で🔴、それ以下は⚪
          if (techSignal.confidence !== null && techSignal.confidence >= 70) {
            techLightEl.textContent = '🔴';
            techLightEl.setAttribute('data-signal', 'low');
            techDirectionEl.textContent = 'LOW推奨';
          } else {
            techLightEl.textContent = '⚪';
            techLightEl.setAttribute('data-signal', 'wait');
            techDirectionEl.textContent = 'LOW';
          }
          // HIGH/LOWの場合は必ずパーセンテージ表示
          techConfidenceEl.textContent = techSignal.confidence !== null ? `${techSignal.confidence}%` : '--';
          // アラート音を鳴らす
          playAlertSound();
        } else if (techSignal.signal === 'WAIT') {
          // 待機中
          techLightEl.textContent = '⏳';
          techLightEl.setAttribute('data-signal', 'wait');
          techDirectionEl.textContent = '待機中';
          techConfidenceEl.textContent = '--';
        } else {
          // NEUTRAL - パーセンテージ非表示
          techLightEl.textContent = '⚪';
          techLightEl.setAttribute('data-signal', 'wait');
          techDirectionEl.textContent = '見送り';
          techConfidenceEl.textContent = '--';
        }
      }
    }

    // AI予測の表示
    const aiLightEl = document.getElementById('ai-signal-light');
    const aiDirectionEl = document.getElementById('ai-signal-direction');
    const aiConfidenceEl = document.getElementById('ai-signal-confidence');

    if (aiLightEl && aiDirectionEl && aiConfidenceEl) {
      if (aiSignal && aiSignal.available) {
        if (aiSignal.signal === 'HIGH') {
          // 70%以上で🟢、それ以下は⚪
          if (aiSignal.confidence !== null && aiSignal.confidence >= 70) {
            aiLightEl.textContent = '🟢';
            aiLightEl.setAttribute('data-signal', 'high');
            aiDirectionEl.textContent = 'HIGH推奨';
          } else {
            aiLightEl.textContent = '⚪';
            aiLightEl.setAttribute('data-signal', 'wait');
            aiDirectionEl.textContent = 'HIGH';
          }
          // HIGH/LOWの場合は必ずパーセンテージ表示
          aiConfidenceEl.textContent = aiSignal.confidence !== null ? `${aiSignal.confidence}%` : '--';
          // アラート音を鳴らす
          playAlertSound();
        } else if (aiSignal.signal === 'LOW') {
          // 70%以上で🔴、それ以下は⚪
          if (aiSignal.confidence !== null && aiSignal.confidence >= 70) {
            aiLightEl.textContent = '🔴';
            aiLightEl.setAttribute('data-signal', 'low');
            aiDirectionEl.textContent = 'LOW推奨';
          } else {
            aiLightEl.textContent = '⚪';
            aiLightEl.setAttribute('data-signal', 'wait');
            aiDirectionEl.textContent = 'LOW';
          }
          // HIGH/LOWの場合は必ずパーセンテージ表示
          aiConfidenceEl.textContent = aiSignal.confidence !== null ? `${aiSignal.confidence}%` : '--';
          // アラート音を鳴らす
          playAlertSound();
        } else if (aiSignal.signal === 'WAIT') {
          // 待機中
          aiLightEl.textContent = '⏳';
          aiLightEl.setAttribute('data-signal', 'wait');
          aiDirectionEl.textContent = '待機中';
          aiConfidenceEl.textContent = '--';
        } else {
          // NEUTRAL - パーセンテージ非表示
          aiLightEl.textContent = '⚪';
          aiLightEl.setAttribute('data-signal', 'wait');
          aiDirectionEl.textContent = '見送り';
          aiConfidenceEl.textContent = '--';
        }
      } else {
        // AI予測がまだ利用できない - カウントダウン表示
        const mlDataCount = aiSignal && aiSignal.mlDataCount ? aiSignal.mlDataCount : 0;
        const requiredMlData = 100;

        if (mlDataCount < requiredMlData) {
          // 進捗率表示
          const progressPercent = Math.floor((mlDataCount / requiredMlData) * 100);

          aiLightEl.textContent = '⏳';
          aiLightEl.setAttribute('data-signal', 'wait');
          aiDirectionEl.textContent = 'データ取得中';
          aiConfidenceEl.textContent = `${progressPercent}%`;
        } else {
          aiLightEl.textContent = '⏳';
          aiLightEl.setAttribute('data-signal', 'wait');
          aiDirectionEl.textContent = '計算中';
          aiConfidenceEl.textContent = '---';
        }
      }
    }
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

      let aiDirection;
      if (mlPred.prediction === 'HIGH') {
        aiDirection = 'HIGH';
      } else if (mlPred.prediction === 'LOW') {
        aiDirection = 'LOW';
      } else {
        aiDirection = '見送り';
      }

      ai = {
        available: true,
        signal: mlPred.prediction,
        confidence: mlPred.confidence,
        direction: aiDirection,
        timeframe: TIMEFRAME_CONFIGS[currentTimeframe].label,
        mlDataCount: ml.dataCountWithResults || ml.dataCount || 0,
        mlDataTotal: ml.dataCount || 0
      };
    }

    return { technical, ai };
  }

  // タブからアイコンと信頼度表示を削除したため、この関数は何もしない
  function updateSignalLights(multiDim, ml) {
    return;

    const timeframes = [
      { id: 'signal-15s', tabId: 'tab-confidence-15', iconId: 'tab-icon-15', seconds: 15 },
      { id: 'signal-30s', tabId: 'tab-confidence-30', iconId: 'tab-icon-30', seconds: 30 },
      { id: 'signal-60s', tabId: 'tab-confidence-60', iconId: 'tab-icon-60', seconds: 60 },
      { id: 'signal-3m', tabId: 'tab-confidence-180', iconId: 'tab-icon-180', seconds: 180 },
      { id: 'signal-5m', tabId: 'tab-confidence-300', iconId: 'tab-icon-300', seconds: 300 }
    ];

    timeframes.forEach(tf => {
      // タブの信頼度とアイコン表示を更新
      const tabConfidence = document.getElementById(tf.tabId);
      const tabIcon = document.getElementById(tf.iconId);

      let signal, conf;

      // キャッシュから結果を取得（再計算しない）
      const cachedResult = timeframeResults[tf.seconds];

      if (cachedResult) {
        // キャッシュがあればそれを使用
        signal = cachedResult.multiDim.signal;
        conf = cachedResult.multiDim.confidence;

        // ML予測があればそちらを優先
        if (cachedResult.ml.status === 'READY' && cachedResult.ml.predictions[`${tf.seconds}s`]) {
          const mlPred = cachedResult.ml.predictions[`${tf.seconds}s`];
          if (mlPred.confidence !== null && mlPred.confidence > conf) {
            signal = mlPred.prediction;
            conf = mlPred.confidence;
          }
        }
      } else {
        // キャッシュがない場合は「分析待ち」表示
        signal = 'WAIT';
        conf = 0;
      }

      // タブの信頼度とアイコン表示を更新
      if (tabConfidence) {
        if (cachedResult) {
          tabConfidence.textContent = conf !== null ? `${conf}%` : '--';
        } else {
          tabConfidence.textContent = '--%';
        }
      }

      if (tabIcon) {
        if (conf !== null && conf >= 70) {
          if (signal === 'HIGH') {
            tabIcon.setAttribute('data-signal', 'high');
          } else if (signal === 'LOW') {
            tabIcon.setAttribute('data-signal', 'low');
          } else {
            tabIcon.setAttribute('data-signal', 'wait');
          }
        } else {
          tabIcon.setAttribute('data-signal', 'wait');
        }
      }
    });
  }

  function updateMLStatus(stats) {
    const dataCountWithResults = stats.dataCountWithResults || stats.dataCount || 0;
    const dataTotal = stats.dataCount || 0;

    // 結果があるデータ数を表示（総数も表示）
    const countText = dataTotal > dataCountWithResults
      ? `${dataCountWithResults}/${dataTotal}`
      : `${dataCountWithResults}`;

    document.getElementById('ml-data-count').textContent = countText;

    // learningLevelを表示（旧accuracyから変更）
    const learningLevel = stats.learningLevel !== undefined ? stats.learningLevel : '-';
    document.getElementById('ml-learning-level').textContent = learningLevel;

    // プログレスバーは50,000件基準に変更
    const progress = Math.min(100, (dataCountWithResults / 50000) * 100);
    document.getElementById('ml-progress-bar').style.width = `${progress}%`;
  }

  // ========================================
  // 包括的なトレンド強度計算
  // ========================================

  function calculateComprehensiveTrendStrength(multiDim, priceHistory) {
    const breakdown = multiDim.breakdown;

    // 1. ADXスコア（0-25点）
    // ADX 0-100 を 0-25点にスケーリング
    const adxScore = Math.min(breakdown.adx.adx / 4, 25);

    // 2. MACD強度スコア（0-25点）
    // MACD strengthは通常0-10程度なので、5倍してキャップ
    const macdStrength = Math.abs(breakdown.macd.strength);
    const macdScore = Math.min(macdStrength * 5, 25);

    // 3. ATRスコア（ボラティリティ）（0-20点）
    // ATR%は通常0-5%程度なので、4倍してキャップ
    const atrPercent = breakdown.atr.atrPercent;
    const atrScore = Math.min(atrPercent * 4, 20);

    // 4. 指標の一致度スコア（0-20点）
    // 全ての主要指標が同じ方向を示しているか
    const mainSignal = multiDim.signal;
    const indicators = [
      breakdown.macd.signal,
      breakdown.roc.signal,
      breakdown.stochastic.signal
    ];

    const agreement = indicators.filter(s => s === mainSignal).length;
    const agreementScore = (agreement / indicators.length) * 20;

    // 5. 価格の方向性スコア（0-10点）
    // 直近の価格が一方向に動いているか
    let directionScore = 0;
    if (priceHistory && priceHistory.length >= 10) {
      const recentPrices = priceHistory.slice(-10);
      const increases = recentPrices.filter((p, i) => i > 0 && p > recentPrices[i-1]).length;
      const decreases = recentPrices.filter((p, i) => i > 0 && p < recentPrices[i-1]).length;

      // 一方向に7回以上動いていたら満点
      const maxDirectional = Math.max(increases, decreases);
      directionScore = Math.min((maxDirectional / 9) * 10, 10);
    }

    // 総合強度（0-100点）
    const totalStrength = adxScore + macdScore + atrScore + agreementScore + directionScore;

    return {
      total: Math.round(totalStrength),
      breakdown: {
        adx: Math.round(adxScore),
        macd: Math.round(macdScore),
        atr: Math.round(atrScore),
        agreement: Math.round(agreementScore),
        direction: Math.round(directionScore)
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
    // SimpleTrendAnalyzerがあれば3段階トレンド分析を表示
    if (!window.SimpleTrendAnalyzer || priceHistory.length < 50) {
      return;
    }

    try {
      // SimpleTrendAnalyzerのインスタンスを作成
      const analyzer = new window.SimpleTrendAnalyzer();

      // 価格履歴を追加
      priceHistory.forEach(item => {
        analyzer.addPrice(item.price, item.timestamp);
      });

      // 現在の取引時間で分析
      const result = analyzer.analyze(currentTimeframe);

      if (!result || !result.hierarchicalTrend) {
        return;
      }

      const tf = analyzer.timeframes[currentTimeframe];
      const ht = result.hierarchicalTrend;

      // ラベル更新
      document.getElementById('long-trend-label').textContent = `長期(${tf.long}秒):`;
      document.getElementById('mid-trend-label').textContent = `中期(${tf.mid}秒):`;
      document.getElementById('short-trend-label').textContent = `短期(${tf.short}秒):`;

      // 長期トレンド
      const longLayer = document.getElementById('long-trend-arrow').parentElement;
      longLayer.setAttribute('data-trend', ht.long);
      document.getElementById('long-trend-arrow').textContent = ht.long === 'UP' ? '↑' : '↓';
      document.getElementById('long-trend-status').textContent = ht.long === 'UP' ? '上昇' : '下降';

      // 中期トレンド
      const midLayer = document.getElementById('mid-trend-arrow').parentElement;
      midLayer.setAttribute('data-trend', ht.mid);
      document.getElementById('mid-trend-arrow').textContent = ht.mid === 'UP' ? '↑' : '↓';
      document.getElementById('mid-trend-status').textContent = ht.mid === 'UP' ? '上昇' : '下降';

      // 短期トレンド
      const shortLayer = document.getElementById('short-trend-arrow').parentElement;
      shortLayer.setAttribute('data-trend', ht.short);
      document.getElementById('short-trend-arrow').textContent = ht.short === 'UP' ? '↑' : '↓';
      document.getElementById('short-trend-status').textContent = ht.short === 'UP' ? '上昇' : '下降';

      // 一致度
      const alignmentEl = document.getElementById('trend-alignment');
      alignmentEl.setAttribute('data-alignment', ht.alignment);

      const alignmentText = document.getElementById('alignment-text');
      if (ht.alignment === 'STRONG_UP') {
        alignmentText.textContent = '全トレンド上昇一致';
      } else if (ht.alignment === 'STRONG_DOWN') {
        alignmentText.textContent = '全トレンド下降一致';
      } else if (ht.alignment === 'UP') {
        alignmentText.textContent = '上昇傾向';
      } else if (ht.alignment === 'DOWN') {
        alignmentText.textContent = '下降傾向';
      } else {
        alignmentText.textContent = 'トレンド混在';
      }
    } catch (error) {
      console.error('[TheOption Analyzer] ⚠️ 3段階トレンド分析エラー:', error);
    }
  }

  function updateDetails(multiDim, ml) {
    // 包括的なトレンド強度を計算
    const strengthResult = calculateComprehensiveTrendStrength(multiDim, priceHistory);
    const totalStrength = strengthResult.total;

    // トレンド方向の判定（数値ではなく方向のみ）
    let trendDirection = '中立';
    let trendColor = '#FFA726';
    let isTrending = false;

    if (multiDim.score > 20) {
      trendDirection = '上昇';
      trendColor = '#4CAF50';
      isTrending = true;
    } else if (multiDim.score < -20) {
      trendDirection = '下降';
      trendColor = '#F44336';
      isTrending = true;
    }

    // トレンド表示テキスト（シンプル版）
    let trendDisplayText = '';
    if (isTrending) {
      // トレンドがある場合のみ強度を表示
      const level = getTrendStrengthLevel(totalStrength);
      trendDisplayText = `${trendDirection}トレンド (強度: ${totalStrength}/100 ${level})`;
    } else {
      // 中立の場合は強度を表示しない
      trendDisplayText = `レンジ相場`;
    }

    // 統合判定（テクニカル分析）
    let overallJudgment = '';
    let judgmentColor = '#FFA726';
    let judgmentIndicator = '●';

    if (isTrending && totalStrength >= 70) {
      // トレンドが明確で強度も高い
      overallJudgment = `${trendDirection}トレンド明確`;
      judgmentColor = trendColor;
      judgmentIndicator = '●';
    } else if (isTrending && totalStrength >= 40) {
      // トレンドはあるが強度は中程度
      overallJudgment = `${trendDirection}傾向あり`;
      judgmentColor = trendColor;
      judgmentIndicator = '●';
    } else if (isTrending) {
      // トレンドはあるが弱い
      overallJudgment = `${trendDirection}傾向だが弱い`;
      judgmentColor = '#FF9800';
      judgmentIndicator = '●';
    } else {
      // 中立
      overallJudgment = 'レンジ相場';
      judgmentColor = '#9E9E9E';
      judgmentIndicator = '●';
    }

    // 🆕 信頼度メトリクスを取得（新しいアナライザーの結果）
    const reliability = multiDim.breakdown.reliability || {
      consistency: 0,
      alignment: 0,
      reversals: 0,
      reliabilityScore: 0
    };

    // 信頼度レベルの判定
    let reliabilityLevel = '低';
    let reliabilityColor = '#9E9E9E';
    if (reliability.reliabilityScore >= 80) {
      reliabilityLevel = '高';
      reliabilityColor = '#4CAF50';
    } else if (reliability.reliabilityScore >= 60) {
      reliabilityLevel = '中';
      reliabilityColor = '#FFA726';
    }

    // テクニカル分析表示（信頼度情報を追加）
    document.getElementById('detail-analysis').innerHTML = `
      <div style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 12px;">
        <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #a0aec0;">テクニカル分析</div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 16px; font-weight: bold; color: ${trendColor}; margin-bottom: 4px;">
            ${trendDisplayText}
          </div>
          <div style="font-size: 10px; opacity: 0.6;">
            ${isTrending ?
              `ADX, MACD, ATR, 指標一致度, 価格方向性による総合評価` :
              `明確なトレンドが検出されていません`}
          </div>
        </div>

        <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; border-left: 3px solid ${judgmentColor}; margin-bottom: 8px;">
          <div style="display: flex; align-items: center;">
            <span style="font-size: 16px; margin-right: 8px; color: ${judgmentColor};">${judgmentIndicator}</span>
            <div>
              <div style="font-size: 12px; font-weight: bold; color: ${judgmentColor};">総合判定: ${overallJudgment}</div>
              <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">
                ${isTrending && totalStrength >= 70 ?
                  `エントリー推奨` :
                  !isTrending ?
                  `見送り推奨（レンジ相場）` :
                  `慎重にエントリー`}
              </div>
            </div>
          </div>
        </div>

        <!-- 🆕 信頼度メトリクス表示 -->
        <div style="padding: 8px; background: rgba(0,0,0,0.15); border-radius: 8px; border: 1px solid ${reliabilityColor}33;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #b0b0b0;">📊 分析信頼度</span>
            <span style="font-size: 12px; color: ${reliabilityColor}; font-weight: bold;">${reliabilityLevel} (${Math.round(reliability.reliabilityScore)}%)</span>
          </div>
          <div style="font-size: 10px; color: #a0a0a0; line-height: 1.4;">
            期間一貫性: ${Math.round(reliability.consistency)}% |
            スケール整合性: ${Math.round(reliability.alignment)}% |
            反転回数: ${reliability.reversals}回
          </div>
        </div>
      </div>

      <div style="font-size: 11px; opacity: 0.6;">
        ボラティリティ: ${multiDim.breakdown.atr.volatility}
      </div>
    `;

    // AI予測根拠の段階的表示
    const mlDataCount = ml.dataCountWithResults || ml.dataCount || 0;
    const mlDataTotal = ml.dataCount || 0;
    const maxData = 50000;  // 実際の保存上限に合わせて修正
    const dataPercent = Math.min((mlDataCount / maxData) * 100, 100);  // 100%でキャップ

    // デバッグ: MLステータスを確認
    console.log(`[TheOption Analyzer] 📊 ML表示更新: status=${ml.status}, dataCount=${mlDataCount}, dataTotal=${mlDataTotal}`);

    // 精度ランク判定（50,000件基準）
    let rankLevel = '準備中';
    let rankLabel = '準備中';
    let rankColor = '#9E9E9E';

    if (mlDataCount >= 50000) {
      rankLevel = 'SS級';
      rankLabel = '究極精度';
      rankColor = '#E91E63';  // ピンク色
    } else if (mlDataCount >= 25000) {
      rankLevel = 'S級';
      rankLabel = '最高精度';
      rankColor = '#9C27B0';  // 紫色
    } else if (mlDataCount >= 10000) {
      rankLevel = 'A級';
      rankLabel = '上級レベル';
      rankColor = '#2196F3';  // 青色
    } else if (mlDataCount >= 5000) {
      rankLevel = 'B級';
      rankLabel = '熟練レベル';
      rankColor = '#4CAF50';  // 緑色
    } else if (mlDataCount >= 2000) {
      rankLevel = 'C級';
      rankLabel = '中級レベル';
      rankColor = '#8BC34A';  // 黄緑色
    } else if (mlDataCount >= 500) {
      rankLevel = 'D級';
      rankLabel = '初級レベル';
      rankColor = '#FFA726';  // オレンジ色
    } else if (mlDataCount >= 100) {
      rankLevel = 'E級';
      rankLabel = '入門レベル';
      rankColor = '#FF9800';  // オレンジ色（やや薄め）
    }

    if (ml.status === 'READY') {
      // 現在選択中の時間枠の予測を表示
      const predKey = `${currentTimeframe}s`;
      const pred15s = ml.predictions[predKey];

      console.log('[TheOption Analyzer] 🔍 updateDetails:', {
        currentTimeframe,
        predKey,
        hasPrediction: !!pred15s,
        prediction: pred15s,
        allPredictions: ml.predictions
      });

      // 🔍 予測値の詳細をログ出力（閾値変更の効果を確認）
      if (pred15s) {
        console.log('[TheOption Analyzer] 📊 予測値の詳細:', {
          sampleSize: pred15s.sampleSize,
          upRate: pred15s.upRate,
          downRate: pred15s.downRate,
          confidence: pred15s.confidence,
          prediction: pred15s.prediction
        });
      }

      // 次のランクまでの件数（50,000件基準）
      let nextRankThreshold = 0;
      let nextRankLabel = '';
      if (mlDataCount < 500) {
        nextRankThreshold = 500;
        nextRankLabel = 'D級 初級レベル';
      } else if (mlDataCount < 2000) {
        nextRankThreshold = 2000;
        nextRankLabel = 'C級 中級レベル';
      } else if (mlDataCount < 5000) {
        nextRankThreshold = 5000;
        nextRankLabel = 'B級 熟練レベル';
      } else if (mlDataCount < 10000) {
        nextRankThreshold = 10000;
        nextRankLabel = 'A級 上級レベル';
      } else if (mlDataCount < 25000) {
        nextRankThreshold = 25000;
        nextRankLabel = 'S級 最高精度';
      } else if (mlDataCount < 50000) {
        nextRankThreshold = 50000;
        nextRankLabel = 'SS級 究極精度';
      }

      const remaining = nextRankThreshold > 0 ? nextRankThreshold - mlDataCount : 0;

      // AI予測の方向と信頼度
      let aiDirection = '';
      let aiIndicator = '●';
      let aiColor = '#9E9E9E';

      if (pred15s.prediction === 'INSUFFICIENT_DATA') {
        aiDirection = 'データ不足';
        aiIndicator = '●';
        aiColor = '#FFA726';
      } else if (pred15s.prediction === 'HIGH') {
        aiDirection = '上昇予測';
        aiIndicator = '▲';
        aiColor = '#4CAF50';
      } else if (pred15s.prediction === 'LOW') {
        aiDirection = '下降予測';
        aiIndicator = '▼';
        aiColor = '#F44336';
      } else if (pred15s.prediction === 'NEUTRAL') {
        aiDirection = '方向不明';
        aiIndicator = '●';
        aiColor = '#FFA726';
      } else {
        aiDirection = '計算中';
        aiIndicator = '●';
        aiColor = '#9E9E9E';
      }

      console.log('[TheOption Analyzer] 🎨 AI予測根拠HTML更新:', {
        prediction: pred15s.prediction,
        aiDirection,
        sampleSize: pred15s.sampleSize,
        upRate: pred15s.upRate,
        downRate: pred15s.downRate
      });

      document.getElementById('detail-ml-reason').innerHTML = `
        <div style="padding: 12px; background: rgba(102, 126, 234, 0.1); border-radius: 12px; border-left: 3px solid #667eea;">
          <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #a0aec0;">AI予測（機械学習）</div>

          <div style="margin-bottom: 12px;">
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 20px; margin-right: 8px; color: ${aiColor};">${aiIndicator}</span>
              <div>
                <div style="font-size: 14px; font-weight: bold; color: ${aiColor};">${aiDirection}</div>
                ${(pred15s.prediction === 'HIGH' || pred15s.prediction === 'LOW') && pred15s.confidence !== null ?
                  `<div style="font-size: 10px; opacity: 0.6;">信頼度: ${pred15s.confidence}%</div>` : ''}
              </div>
            </div>
          </div>

          <div style="margin-bottom: 8px;">
            <span style="color: ${rankColor}; font-weight: bold;">学習: ${rankLevel} ${rankLabel}</span>
          </div>

          <div style="margin-bottom: 8px;">
            <div style="font-size: 11px; opacity: 0.8; margin-bottom: 2px;">
              学習データ: ${mlDataCount.toLocaleString()}/${maxData.toLocaleString()}件 (${dataPercent.toFixed(1)}%)
            </div>
            <div style="height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${dataPercent}%; background: linear-gradient(to right, #667eea, #764ba2); transition: width 0.3s;"></div>
            </div>
          </div>

          <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-bottom: 8px;">
            <div style="font-size: 11px;" id="ml-prediction-values">
              ${pred15s.prediction === 'INSUFFICIENT_DATA' ? `
                ${pred15s.reason}<br>
                <span style="font-size: 10px; opacity: 0.7;">
                  ※データ収集から5分後に結果が記録されます<br>
                  ※類似パターンが10件以上で予測開始
                </span>
              ` : `
                類似パターン: ${pred15s.sampleSize}件<br>
                平均類似度: ${pred15s.avgSimilarity ? pred15s.avgSimilarity.toFixed(1) : 0}%<br>
                上昇確率: ${pred15s.upRate}%<br>
                下降確率: ${pred15s.downRate}%
              `}
            </div>
          </div>

          ${pred15s.prediction !== 'INSUFFICIENT_DATA' ? `
            <div style="padding: 8px; background: rgba(255, 167, 38, 0.1); border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255, 167, 38, 0.3);">
              <div style="font-size: 11px; color: #ffa726;">
                📊 使用データ: ${currentDataLimit === null ? '全期間' : '直近' + currentDataLimit.toLocaleString() + '件'}<br>
                <span style="font-size: 10px; opacity: 0.8;">
                  検索対象: ${ml.searchedDataCount ? ml.searchedDataCount.toLocaleString() : mlDataCount.toLocaleString()}件 / 総数: ${mlDataCount.toLocaleString()}件
                </span>
              </div>
            </div>
          ` : ''}

          ${remaining > 0 ? `
            <div style="font-size: 11px; opacity: 0.7;">
              次のランク(${nextRankLabel})まで<br>
              あと${remaining.toLocaleString()}件
            </div>
          ` : mlDataCount >= 50000 ? `
            <div style="font-size: 11px; color: #E91E63;">
              🎉 最大データ蓄積完了<br>
              (50,000件) 究極精度で予測中
            </div>
          ` : ''}
        </div>
      `;

      // 🔍 HTML生成後の値を確認
      console.log('[TheOption Analyzer] 📝 HTMLに書き込んだ値:', {
        sampleSize: pred15s.sampleSize,
        upRate: pred15s.upRate,
        downRate: pred15s.downRate,
        htmlElement: document.getElementById('ml-prediction-values')?.innerHTML
      });
    } else {
      // データ収集中（0-99件）
      const collectPercent = Math.min((mlDataCount / 100) * 100, 100);  // 100%でキャップ
      const remaining = Math.max(100 - mlDataCount, 0);  // 0未満にならないように

      document.getElementById('detail-ml-reason').innerHTML = `
        <div style="padding: 12px; background: rgba(102, 126, 234, 0.1); border-radius: 12px; border-left: 3px solid #667eea;">
          <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #a0aec0;">AI予測（機械学習）</div>

          <div style="margin-bottom: 8px;">
            <span style="font-weight: bold;">データ収集中...</span>
          </div>

          <div style="margin-bottom: 8px;">
            <div style="font-size: 11px; opacity: 0.8; margin-bottom: 2px;">
              進捗: ${Math.min(mlDataCount, 100)}/100件 (${collectPercent.toFixed(0)}%)
            </div>
            <div style="height: 12px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden;">
              <div style="height: 100%; width: ${collectPercent}%; background: linear-gradient(to right, #FFA726, #FF9800); transition: width 0.3s;"></div>
            </div>
          </div>

          <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="font-size: 11px; opacity: 0.8;">
              ${remaining > 0 ? `
                あと${remaining}件で予測開始
              ` : `
                100件到達！次回更新で予測開始します
              `}
              <br>
              <span style="font-size: 10px; opacity: 0.6;">※予測開始後も50,000件まで学習を続けます</span><br>
              <span style="font-size: 10px; opacity: 0.6;">※テクニカル分析は即座に利用可能です</span>
            </div>
          </div>
        </div>
      `;
    }

    // 品質レポートを更新（パフォーマンス最適化のため無効化）
    // updateQualityReport();
  }

  function updateAssetDisplay(assetName, dataCount) {
    const assetNameEl = document.getElementById('asset-name-display');
    const assetDataCountEl = document.getElementById('asset-data-count');

    if (assetNameEl) {
      assetNameEl.textContent = assetName || '検出中...';
    }

    if (assetDataCountEl) {
      const status = dataCount >= 30 ? '✅' : '⏳';
      assetDataCountEl.textContent = `${status} データ: ${dataCount}件`;
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
              ? `${asset.substring(0,3)}/${asset.substring(3,6)}`
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
          ? `${value.substring(0,3)}/${value.substring(3,6)}`
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
    const reportDiv = document.getElementById('detail-quality-report');
    if (!reportDiv) return;

    if (!predictionQualityLog || predictionQualityLog.length === 0) {
      reportDiv.innerHTML = `
        <div style="padding: 12px; background: rgba(102, 126, 234, 0.05); border-radius: 12px; text-align: center; color: #a0aec0; font-size: 12px;">
          予測を実行するとレポートが表示されます
        </div>
      `;
      return;
    }

    // 過去24時間のデータをフィルタ + 現在の通貨ペアでフィルタ
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const recentLogs = predictionQualityLog.filter(log =>
      log.timestamp >= last24h &&
      log.assetName === currentAsset  // 現在の通貨ペアのみ
    );

    if (recentLogs.length === 0) {
      // 現在の通貨ペア名を表示
      const assetDisplayName = currentAsset || '現在の通貨ペア';
      reportDiv.innerHTML = `
        <div style="padding: 12px; background: rgba(102, 126, 234, 0.05); border-radius: 12px; text-align: center; color: #a0aec0; font-size: 12px;">
          <div style="margin-bottom: 8px;">📊 ${assetDisplayName}</div>
          <div style="font-size: 11px; opacity: 0.8;">データ収集中...</div>
          <div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">AI予測が実行されるとレポートが表示されます</div>
        </div>
      `;
      return;
    }

    // 統計計算
    const totalPredictions = recentLogs.length;
    const avgQualityScore = (recentLogs.reduce((sum, log) => sum + log.qualityScore, 0) / totalPredictions).toFixed(1);
    const avgConfidence = (recentLogs.reduce((sum, log) => sum + log.confidence, 0) / totalPredictions).toFixed(1);
    const avgSampleSize = Math.round(recentLogs.reduce((sum, log) => sum + log.sampleSize, 0) / totalPredictions);

    // 品質分布を集計
    const qualityDistribution = {
      '優秀': 0,
      '良好': 0,
      '標準': 0,
      '要注意': 0,
      '低品質': 0
    };
    recentLogs.forEach(log => {
      if (qualityDistribution[log.predictionQuality] !== undefined) {
        qualityDistribution[log.predictionQuality]++;
      }
    });

    // パターン使用頻度を集計
    const patternCounts = {};
    recentLogs.forEach(log => {
      if (log.segmentPattern) {
        patternCounts[log.segmentPattern] = (patternCounts[log.segmentPattern] || 0) + 1;
      }
    });

    // 上位3パターンを取得
    const topPatterns = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // 品質分布の最大値を計算（バーの長さ調整用）
    const maxCount = Math.max(...Object.values(qualityDistribution));

    // 品質カラーマッピング
    const qualityColors = {
      '優秀': '#E91E63',
      '良好': '#4CAF50',
      '標準': '#2196F3',
      '要注意': '#FFA726',
      '低品質': '#9E9E9E'
    };

    // HTML生成
    reportDiv.innerHTML = `
      <div style="padding: 12px; background: rgba(102, 126, 234, 0.05); border-radius: 12px;">
        <!-- 統計サマリー -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="font-size: 10px; color: #b0b0b0; margin-bottom: 2px;">予測回数</div>
            <div style="font-size: 16px; font-weight: bold; color: #fff;">${totalPredictions}回</div>
          </div>
          <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="font-size: 10px; color: #b0b0b0; margin-bottom: 2px;">平均品質</div>
            <div style="font-size: 16px; font-weight: bold; color: #4CAF50;">${avgQualityScore}</div>
          </div>
          <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="font-size: 10px; color: #b0b0b0; margin-bottom: 2px;">平均信頼度</div>
            <div style="font-size: 16px; font-weight: bold; color: #2196F3;">${avgConfidence}%</div>
          </div>
          <div style="padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="font-size: 10px; color: #b0b0b0; margin-bottom: 2px;">平均パターン数</div>
            <div style="font-size: 16px; font-weight: bold; color: #667eea;">${avgSampleSize}件</div>
          </div>
        </div>

        <!-- Top 3パターン -->
        ${topPatterns.length > 0 ? `
          <div>
            <div style="font-size: 11px; color: #b0b0b0; margin-bottom: 6px;">🔥 よく使われるパターン</div>
            ${topPatterns.map(([pattern, count], index) => `
              <div style="padding: 6px; background: rgba(0,0,0,0.2); border-radius: 6px; margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 10px; color: #fff;">${index + 1}. ${pattern}</span>
                  <span style="font-size: 10px; color: #4CAF50; font-weight: bold;">${count}回</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
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
      case 'price-history':
        downloadPriceHistoryAsCSV();
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

    // モーダルを閉じる
    document.getElementById('download-modal').classList.remove('active');

    // 通知
    showDownloadNotification('AI学習データ');
  }

  function downloadPriceHistoryAsCSV() {
    if (!priceHistory || priceHistory.length === 0) {
      alert('価格履歴データがありません');
      return;
    }

    console.log(`[CSV Download] 価格履歴データ件数: ${priceHistory.length}件`);

    // CSVヘッダー
    const headers = [
      'タイムスタンプ',
      '日時',
      '価格',
      '変化',
      '変化率(%)'
    ];

    // CSVデータ行を生成
    const rows = priceHistory.map((item, index) => {
      const date = new Date(item.timestamp);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

      let change = 0;
      let changePercent = 0;

      if (index > 0) {
        change = item.price - priceHistory[index - 1].price;
        changePercent = (change / priceHistory[index - 1].price) * 100;
      }

      return [
        item.timestamp,
        dateStr,
        item.price.toFixed(5),
        change.toFixed(5),
        changePercent.toFixed(4)
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
    const filename = `theoption_price_history_${assetName.replace(/[\/\s]/g, '_')}_${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.log(`[CSV Download] ダウンロード完了: ${filename} (${priceHistory.length}件)`);

    // モーダルを閉じる
    document.getElementById('download-modal').classList.remove('active');

    // 通知
    showDownloadNotification('価格履歴データ');
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

    // モーダルを閉じる
    document.getElementById('download-modal').classList.remove('active');

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

    // モーダルを閉じる
    document.getElementById('download-modal').classList.remove('active');

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

      // モーダルを閉じる
      document.getElementById('download-modal').classList.remove('active');

      // 通知
      showDownloadNotification(`完全バックアップ (${currencyPairs}通貨ペア, ${totalRecords}件)`);
    });
  }

  function importDataFromJSON() {
    console.log('[JSON Import] インポート開始...');

    const fileInput = document.getElementById('json-import-file');
    fileInput.click();

    fileInput.onchange = (e) => {
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

              // モーダルを閉じる
              document.getElementById('download-modal').classList.remove('active');

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
