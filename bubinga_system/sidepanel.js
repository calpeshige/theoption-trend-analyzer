// Bubinga専用ALL-IN自動分析システム V4.2.0 - Side Panel Script
// 20インジケーター個別判定システム + マーチンゲール戦略
// 10分サイクル: エントリーは常に10分刻み（00:00, 10:00, 20:00...）
// 分析結果表示はエントリー10秒前（XX:09:50, XX:19:50...）
// マーチンゲール: 負けたら同じ方向に最大8回までエントリー継続
// ライセンス認証機能付き

(function() {
  'use strict';

  // ライセンス認証チェック（起動時）
  async function checkAuthentication() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['isAuthenticated', 'licenseKey'], (result) => {
        if (result.isAuthenticated && result.licenseKey) {
          resolve(true);
        } else {
          // 認証されていない場合は認証画面へリダイレクト
          window.location.href = 'auth.html';
          resolve(false);
        }
      });
    });
  }

  // 認証チェックを実行
  checkAuthentication().then((isAuthenticated) => {
    if (!isAuthenticated) return;
    // 認証済みの場合のみ以下を実行
    initializeApp();

    // 定期的なライセンス確認を開始（30分ごと）
    if (typeof startLicenseVerification === 'function') {
      startLicenseVerification(30);
    }
  });

  // アプリケーション初期化（認証後に実行）
  function initializeApp() {

  // DOM要素
  const elements = {
    currencyPair: document.getElementById('currencyPair'),
    connectionStatus: document.getElementById('connectionStatus'),
    // 分析時間表示
    analysisTimeDisplay: document.getElementById('analysisTimeDisplay'),
    nextAnalysisTime: document.getElementById('nextAnalysisTime'),
    // カウントダウン
    countdownDisplay: document.getElementById('countdownDisplay'),
    countdownLabel: document.getElementById('countdownLabel'),
    countdownNumber: document.getElementById('countdownNumber'),
    countdownUnit: document.getElementById('countdownUnit'),
    // 結果表示（カウントダウン部分）
    resultDisplayInline: document.getElementById('resultDisplayInline'),
    resultTextLarge: document.getElementById('resultTextLarge'),
    // 監視コントロール
    monitoringBtn: document.getElementById('monitoringBtn'),
    monitoringText: document.getElementById('monitoringText'),
    monitoringIndicator: document.getElementById('monitoringIndicator'),
    monitoringStatusText: document.getElementById('monitoringStatusText'),
    // カウント表示
    highCount: document.getElementById('highCount'),
    lowCount: document.getElementById('lowCount'),
    // シグナル強度メーター
    strengthFill: document.getElementById('strengthFill'),
    strengthLabel: document.getElementById('strengthLabel'),
    // インジケーターカード
    indicatorsGrid: document.getElementById('indicatorsGrid'),
    indicatorsSection: document.getElementById('indicatorsSection'),
    detailToggleBtn: document.getElementById('detailToggleBtn'),
    // 勝敗記録（本日/累計）
    todayWins: document.getElementById('todayWins'),
    todayLoses: document.getElementById('todayLoses'),
    totalWins: document.getElementById('totalWins'),
    totalLoses: document.getElementById('totalLoses'),
    resetTodayStatsBtn: document.getElementById('resetTodayStatsBtn'),
    resetAllStatsBtn: document.getElementById('resetAllStatsBtn'),
    // 今日の詳細トグル
    todayStatsToggleBtn: document.getElementById('todayStatsToggleBtn'),
    todayStatsBreakdown: document.getElementById('todayStatsBreakdown'),
    // 累計の詳細トグル
    totalStatsToggleBtn: document.getElementById('totalStatsToggleBtn'),
    totalStatsBreakdown: document.getElementById('totalStatsBreakdown'),
    // 回戦表示
    roundNumber: document.getElementById('roundNumber'),
    // マーチン金額設定
    editAmountBtn: document.getElementById('editAmountBtn'),
    settingsModal: document.getElementById('settingsModal'),
    modalClose: document.getElementById('modalClose'),
    modalCancel: document.getElementById('modalCancel'),
    modalSave: document.getElementById('modalSave'),
    nextAmountValue: document.getElementById('nextAmountValue'),
    // ヘッダーボタン（設定・データ管理）
    settingsBtn: document.getElementById('settingsBtn'),
    dataManageBtn: document.getElementById('dataManageBtn'),
    // 統一設定モーダル
    generalSettingsModal: document.getElementById('generalSettingsModal'),
    generalSettingsModalClose: document.getElementById('generalSettingsModalClose'),
    generalSettingsModalSave: document.getElementById('generalSettingsModalSave'),
    // データ管理モーダル
    dataManageModal: document.getElementById('dataManageModal'),
    dataManageModalClose: document.getElementById('dataManageModalClose'),
    exportDataBtn: document.getElementById('exportDataBtn'),
    importDataBtn: document.getElementById('importDataBtn'),
    importFileInput: document.getElementById('importFileInput'),
    // 収支履歴モーダル
    balanceHistoryBtn: document.getElementById('balanceHistoryBtn'),
    balanceHistoryModal: document.getElementById('balanceHistoryModal'),
    balanceHistoryModalClose: document.getElementById('balanceHistoryModalClose'),
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    currentMonthDisplay: document.getElementById('currentMonthDisplay'),
    monthlyTotalValue: document.getElementById('monthlyTotalValue'),
    historyList: document.getElementById('historyList'),
    // 8連敗ログモーダル
    lose8LogModal: document.getElementById('lose8LogModal'),
    lose8LogModalClose: document.getElementById('lose8LogModalClose'),
    lose8PeriodLabel: document.getElementById('lose8PeriodLabel'),
    lose8LogList: document.getElementById('lose8LogList'),
    // S/R警告セクション
    srWarningSection: document.getElementById('srWarningSection'),
    srWarningIcon: document.getElementById('srWarningIcon'),
    srWarningText: document.getElementById('srWarningText'),
    srWarningDetail: document.getElementById('srWarningDetail'),
    srSkipBtn: document.getElementById('srSkipBtn'),
    srContinueBtn: document.getElementById('srContinueBtn'),
    // S/Rレベル表示セクション
    srLevelsSection: document.getElementById('srLevelsSection'),
    srCurrentPrice: document.getElementById('srCurrentPrice'),
    srResistanceLevel: document.getElementById('srResistanceLevel'),
    srResistanceValue: document.getElementById('srResistanceValue'),
    srResistanceTouches: document.getElementById('srResistanceTouches'),
    srSupportLevel: document.getElementById('srSupportLevel'),
    srSupportValue: document.getElementById('srSupportValue'),
    srSupportTouches: document.getElementById('srSupportTouches')
  };

  // 状態
  let currentCurrencyPair = '検出中...';
  let isMonitoring = false;
  let isAnalyzing = false;
  let clockTimer = null;

  // オーディオ関連（ユーザーインタラクション後に初期化）
  let audioContext = null;
  let alertAudio = null;
  let soundLevel = 'medium'; // off, low, medium, high
  const soundVolumes = { off: 0, low: 0.3, medium: 0.6, high: 1.0 };

  // 警告設定: off, manual, auto
  let srWarningMode = 'manual';  // レジサポライン警告
  let tlWarningMode = 'manual';  // トレンド/チャネルライン警告

  // サイクル定数（5分サイクル）
  // エントリー時刻: 00:00, 05:00, 10:00, 15:00... (5分ごと、00秒ぴったり)
  // 分析結果表示: XX:04:50, XX:09:50, XX:14:50... (エントリー10秒前)
  // ※ マーチン継続中は分析をスキップ
  const CYCLE_MINUTES = 5;     // 5分サイクル
  const PREP_SECONDS = 10;     // 準備期間10秒
  const ENTRY_SECONDS = 60;    // エントリー期間60秒
  const RESULT_DISPLAY_SECONDS = 5; // 結果表示5秒

  // フェーズ管理
  let currentPhase = 'idle'; // idle, waiting, analyzing, prep, entry, judging
  let phaseEndTime = null;
  let nextEntryTime = null;    // 次回エントリー時刻（XX:00）
  let lastAnalyzedEntry = null; // 重複防止用

  // トレード結果管理
  let currentTrade = null; // { entryPrice, entryTime, direction, judgeTime }
  let tradeHistory = []; // 過去のトレード結果

  // マーチンゲール戦略管理
  const MAX_MARTINGALE_ROUNDS = 8; // 最大8回
  let currentRound = 1;            // 現在の回戦（1-8）
  let martingaleDirection = null;  // マーチンゲール継続時の方向（HIGH/LOW）
  let isMartingaleActive = false;  // マーチンゲール継続中フラグ
  let originalDirection = null;    // 再分析前の元の方向（履歴表示用）
  let isReanalysisMode = false;    // 再分析モード中フラグ
  let isPostReanalysisPrep = false; // 再分析後の準備フェーズフラグ
  let reanalysisResult = null;     // 再分析結果を保存（カウントダウン完了まで保持）
  let reanalysisCompleted = false; // 再分析が完了したかどうか

  // S/R警告管理
  let pendingSRWarning = null;     // 待機中のS/R警告情報
  let srWarningTimeout = null;     // S/R警告の自動タイムアウト

  // 8連敗ログ用：各ラウンドのインジケーター情報を記録
  let roundIndicatorHistory = []; // [{ round, highCount, lowCount, trendMode, timestamp }, ...]

  // マーチン金額設定（デフォルト値）
  let martingaleAmounts = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000];
  let savedPayoutRate = 1.92; // 保存されたペイアウト率
  let baseEntryAmount = 1000; // 1回戦目の金額（自動計算の基準）
  let autoPayoutEnabled = true; // ペイアウト率自動取得フラグ
  let lastDetectedPayoutRate = null; // 最後に検出したペイアウト率
  let payoutCheckTimer = null; // ペイアウト率チェック用タイマー

  // 勝敗統計（通貨ペアごと）
  let allStats = {}; // { 'EUR/USD': {...}, 'USD/JPY': {...}, ... }
  let stats = {
    // 累計
    totalWins: 0,
    totalLoses: 0,
    winByRound: [0, 0, 0, 0, 0, 0, 0, 0], // 1-8回目勝利数
    winDetails: [[], [], [], [], [], [], [], []], // 各回戦の勝利詳細（{low, high}の配列）
    lose8: 0, // 8連敗回数
    // 本日
    todayWins: 0,
    todayLoses: 0,
    todayWinByRound: [0, 0, 0, 0, 0, 0, 0, 0], // 今日の1-8回目勝利数
    todayWinDetails: [[], [], [], [], [], [], [], []], // 今日の各回戦の勝利詳細
    todayLose8: 0, // 今日の8連敗回数
    todayDate: null, // 本日の日付（日付変更検出用）
    lose8Logs: [], // 8連敗ログ（累計）
    todayLose8Logs: [] // 8連敗ログ（本日）
  };

  // 収支データ（通貨ペアごと）
  let allBalances = {}; // { 'EUR/USD': {...}, 'USD/JPY': {...}, ... }
  let balance = {
    todayBalance: 0,      // 今日の収支
    totalBalance: 0,      // 累計収支
    todayDate: null,      // 今日の日付（日付変更検出用）
    dailyHistory: {}      // 日別履歴 { '2025-12-10': 1000, '2025-12-09': -500, ... }
  };

  // 履歴表示用の現在表示月
  let historyDisplayYear = new Date().getFullYear();
  let historyDisplayMonth = new Date().getMonth(); // 0-11

  // Bubingaタブを取得（アクティブでなくても見つける）
  async function getBubingaTab() {
    const tabs = await chrome.tabs.query({ url: 'https://bubinga.com/*' });
    if (tabs && tabs.length > 0) {
      return tabs[0];
    }
    return null;
  }

  // デフォルト統計を作成
  function createDefaultStats() {
    return {
      totalWins: 0,
      totalLoses: 0,
      winByRound: [0, 0, 0, 0, 0, 0, 0, 0],
      winDetails: [[], [], [], [], [], [], [], []], // 各回戦の勝利詳細
      lose8: 0,
      todayWins: 0,
      todayLoses: 0,
      todayWinByRound: [0, 0, 0, 0, 0, 0, 0, 0],
      todayWinDetails: [[], [], [], [], [], [], [], []], // 今日の各回戦の勝利詳細
      todayLose8: 0,
      todayDate: getTodayDateString(),
      lose8Logs: [], // 8連敗ログ（累計）
      todayLose8Logs: [] // 8連敗ログ（本日）
    };
  }

  // デフォルト収支を作成
  function createDefaultBalance() {
    return {
      todayBalance: 0,
      totalBalance: 0,
      todayDate: getTodayDateString(),
      dailyHistory: {}
    };
  }

  // 今日の日付文字列を取得
  function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 初期化
  async function init() {
    loadStats(); // 保存された統計を読み込み
    loadBalance(); // 収支データを読み込み
    loadMartingaleAmounts(); // マーチン金額を読み込み
    loadSoundLevel(); // 音量設定を読み込み
    startClock();
    setupEventListeners();
    setupMessageListener();
    await requestInitialData();

    updateStatsDisplay(); // 統計表示を更新
    updateBalanceDisplay(); // 収支表示を更新
    updateConnectionStatus('connected');
  }

  // 時計を開始
  function startClock() {
    updateClock();
    clockTimer = setInterval(updateClock, 200);
  }

  // 時計を更新（内部タイマー用）
  function updateClock() {
    const now = new Date();

    // 次回分析時間を更新
    updateUntilAnalysis(now);

    // 監視中のフェーズ管理
    if (isMonitoring) {
      handleMonitoringPhase(now);
    }
  }

  // 次回エントリー時刻を計算（XX:00の形式、10分ごと）
  // エントリー時刻: 00, 10, 20, 30, 40, 50分
  // 分析結果表示: エントリーの10秒前（XX:09:50, XX:19:50...）
  function calculateNextEntryTime(baseTime) {
    const now = new Date(baseTime);
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();

    // 10の倍数の分を探す（0, 10, 20, 30, 40, 50）
    // 現在の分より大きい最小の10の倍数
    let nextEntryMinute = Math.ceil((currentMinute + 0.01) / CYCLE_MINUTES) * CYCLE_MINUTES;

    // 候補のエントリー時刻を作成
    const result = new Date(now);
    result.setSeconds(0);
    result.setMilliseconds(0);

    // 時間の繰り上がり処理
    if (nextEntryMinute >= 60) {
      nextEntryMinute = nextEntryMinute % 60;
      result.setHours(result.getHours() + 1);
    }
    result.setMinutes(nextEntryMinute);

    // 分析時刻（エントリー10秒前 = XX:50）を計算
    const analysisTime = new Date(result.getTime() - PREP_SECONDS * 1000);

    // 分析時刻が既に過ぎている場合は、次の10分サイクルへ
    if (now >= analysisTime) {
      // 10分追加
      let newMinute = result.getMinutes() + CYCLE_MINUTES;
      if (newMinute >= 60) {
        newMinute = newMinute % 60;
        result.setHours(result.getHours() + 1);
      }
      result.setMinutes(newMinute);
    }

    return result;
  }


  // 分析時刻を計算（エントリー10秒前 = XX:50）
  function calculateAnalysisTime(entryTime) {
    return new Date(entryTime.getTime() - PREP_SECONDS * 1000);
  }


  // 次回分析結果時間を更新（エントリー10秒前 = 分析結果表示時刻）
  function updateUntilAnalysis(now) {
    if (!nextEntryTime) {
      // 監視開始前は表示をリセット
      elements.nextAnalysisTime.textContent = '--:--:--';
      return;
    }

    // 分析結果表示時刻 = エントリー時刻 - 10秒（例: 12:10:00 → 12:09:50）
    const analysisTime = calculateAnalysisTime(nextEntryTime);
    const analysisHours = String(analysisTime.getHours()).padStart(2, '0');
    const analysisMinutes = String(analysisTime.getMinutes()).padStart(2, '0');
    const analysisSeconds = String(analysisTime.getSeconds()).padStart(2, '0');

    // 分析結果時間を表示
    elements.nextAnalysisTime.textContent = `${analysisHours}:${analysisMinutes}:${analysisSeconds}`;
  }

  // 監視フェーズを処理
  function handleMonitoringPhase(now) {
    switch (currentPhase) {
      case 'waiting':
        // 分析時刻（エントリー10秒前）に達したら分析をトリガー
        if (nextEntryTime) {
          const analysisTime = calculateAnalysisTime(nextEntryTime);
          const entryKey = nextEntryTime.toISOString();
          const shouldTrigger = now >= analysisTime && entryKey !== lastAnalyzedEntry;

          if (shouldTrigger) {
            lastAnalyzedEntry = entryKey;

            // マーチン継続中は分析をスキップして次のサイクルへ
            if (isMartingaleActive) {
              // 次の5分サイクルを計算して待機継続
              nextEntryTime = calculateNextEntryTime(now);
              updateMonitoringStatus('watching', 'マーチン継続中 - 分析スキップ');
            } else {
              triggerAnalysis();
            }
          }
        }
        break;

      case 'prep':
        // 準備期間のカウントダウン
        if (isPostReanalysisPrep && nextEntryTime) {
          // 再分析後の準備フェーズ（次の分の00秒まで待機）
          const remaining = Math.max(0, Math.ceil((nextEntryTime - now) / 1000));
          elements.countdownNumber.textContent = remaining;

          if (remaining <= 0) {
            startReanalysisEntry();
          }
        } else if (nextEntryTime) {
          // 通常の準備フェーズ（エントリー時刻XX:00まで）
          const remaining = Math.max(0, Math.ceil((nextEntryTime - now) / 1000));
          elements.countdownNumber.textContent = remaining;

          if (remaining <= 0) {
            startEntryPhase();
          }
        }
        break;

      case 'entry':
        // エントリー期間のカウントダウン
        if (phaseEndTime) {
          const remaining = Math.max(0, Math.ceil((phaseEndTime - now) / 1000));
          elements.countdownNumber.textContent = remaining;

          if (remaining <= 0) {
            // エントリー終了 → 判定（結果に応じて次のアクションを決定）
            currentPhase = 'judging'; // 重複判定防止
            judgeTradeResult();
          }
        }
        break;

      case 'judging':
      case 'result':
        // 判定中・結果表示中は何もしない（タイマーで自動遷移）
        break;

      case 'reanalysis':
        // 再分析中のカウントダウン
        if (phaseEndTime) {
          const remaining = Math.max(0, Math.ceil((phaseEndTime - now) / 1000));
          elements.countdownNumber.textContent = remaining;

          if (remaining <= 0) {
            // 50秒のカウントダウン終了 → 準備フェーズへ移行
            if (currentPhase === 'reanalysis') {
              console.log('再分析カウントダウン完了、準備フェーズへ移行');
              processReanalysisResult();
            }
          }
        }
        break;
    }
  }

  // 分析をトリガー
  async function triggerAnalysis() {
    if (isAnalyzing) return;

    currentPhase = 'analyzing';
    updateMonitoringStatus('signal', '判定中...');

    await performAnalysis();
  }

  // 分析を実行
  async function performAnalysis() {
    if (isAnalyzing) return;

    isAnalyzing = true;
    console.log('★ performAnalysis開始');

    try {
      // Bubingaタブを検索（アクティブでなくても見つける）
      const tabs = await chrome.tabs.query({ url: 'https://bubinga.com/*' });
      console.log('★ Bubingaタブ検索結果:', tabs.length, '件');

      if (!tabs || tabs.length === 0) {
        throw new Error('Bubingaのタブが見つかりません');
      }

      const tab = tabs[0];
      console.log('★ 使用するタブ:', tab.id, tab.url);

      chrome.tabs.sendMessage(tab.id, {
        type: 'PERFORM_SIGNAL_ANALYSIS',
        candleCount: '120'
      }, (response) => {
        isAnalyzing = false;
        console.log('★ 分析レスポンス:', response);

        if (chrome.runtime.lastError) {
          console.error('★ chrome.runtime.lastError:', chrome.runtime.lastError.message);
          handleAnalysisError(chrome.runtime.lastError.message);
          return;
        }

        if (response && response.signalResult) {
          handleAnalysisResult(response.signalResult);
        } else {
          console.error('★ 分析結果なし:', response);
          handleAnalysisError('分析結果を取得できませんでした');
        }
      });

    } catch (error) {
      isAnalyzing = false;
      console.error('★ performAnalysisエラー:', error.message);
      handleAnalysisError(error.message);
    }
  }

  // 分析エラーを処理
  function handleAnalysisError(message) {
    currentPhase = 'waiting';

    // エラー時は次のサイクルのエントリー時刻を再計算
    const now = new Date();
    nextEntryTime = calculateNextEntryTime(now);
    lastAnalyzedEntry = null; // 次の分析を確実にトリガーするためリセット

    updateMonitoringStatus('watching', '次の判定を待機中...');
  }

  // 分析結果を処理
  function handleAnalysisResult(result) {
    if (result.signal === 'INDICATORS' && result.indicators) {
      displayIndicatorResults(result);

      // S/Rレベル表示を更新（常に表示）
      if (result.supportResistance) {
        updateSRLevelsDisplay(result.supportResistance);
      }

      // マーチンゲール継続中の場合は、分析結果に関わらず同じ方向でエントリー
      if (isMartingaleActive && martingaleDirection) {
        startPrepPhase();
        return;
      }

      // 10対10の場合はスキップ（エントリーしない）
      if (result.highCount === result.lowCount) {
        skipToNextCycle();
        return;
      }

      // 新規エントリーの方向を決定
      const direction = result.highCount > result.lowCount ? 'HIGH' : 'LOW';

      // S/R警告をチェック（設定に応じて処理）
      // トレンド中はS/R警告をスキップしない（トレンド強度0.5以上で抑制）
      const srData = result.supportResistance;
      const isTrending = srData && srData.trendStrength >= 0.5 && srData.trendDirection !== 'neutral';

      if (isTrending && srData.warning) {
        console.log('[S/R v4.9] トレンド中のためS/R警告を無視:', {
          トレンド方向: srData.trendDirection === 'up' ? '上昇' : '下降',
          トレンド強度: srData.trendStrength.toFixed(2),
          警告タイプ: srData.warning
        });
      }

      if (srWarningMode !== 'off' && srData && srData.warning && !isTrending) {
        if (srWarningMode === 'auto') {
          // 自動スキップ（通知表示付き）
          const isResistance = srData.warning === 'resistance';
          const levelName = isResistance ? 'レジスタンス' : 'サポート';
          const distance = isResistance ? srData.distanceToResistance : srData.distanceToSupport;

          // 詳細ログ出力
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🔴 S/R自動スキップ発生');
          console.log('  警告タイプ:', srData.warning);
          console.log('  警告レベル:', srData.warningLevel);
          console.log('  距離:', distance.toFixed(4) + '%');
          console.log('  現在価格:', srData.currentPrice);
          if (isResistance) {
            console.log('  レジスタンス:', srData.resistance);
            console.log('  タッチ回数:', srData.resistanceTouches + '回');
          } else {
            console.log('  サポート:', srData.support);
            console.log('  タッチ回数:', srData.supportTouches + '回');
          }
          console.log('  判定方向:', direction);
          console.log('  時刻:', new Date().toLocaleTimeString());
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          showAutoSkipNotification('sr', `${levelName}付近 (${distance.toFixed(3)}%)`);
          return;
        } else {
          // 警告＋スキップボタン
          showSRWarning(result.supportResistance, direction, result);
          return;
        }
      }

      // トレンドライン警告をチェック（設定に応じて処理）
      if (tlWarningMode !== 'off' && result.trendLineAnalysis && result.trendLineAnalysis.warnings) {
        const tlWarning = checkTrendLineWarningForDirection(result.trendLineAnalysis.warnings, direction);
        if (tlWarning) {
          if (tlWarningMode === 'auto') {
            // 詳細ログ出力
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🟠 トレンドライン自動スキップ発生');
            console.log('  警告タイプ:', tlWarning.type);
            console.log('  警告レベル:', tlWarning.level);
            console.log('  メッセージ:', tlWarning.message);
            if (tlWarning.divergence !== undefined) {
              console.log('  乖離率:', tlWarning.divergence.toFixed(2) + '%');
            }
            if (tlWarning.change !== undefined) {
              console.log('  価格変動:', tlWarning.change.toFixed(2) + '%');
            }
            if (tlWarning.pivotCount !== undefined) {
              console.log('  ピボット数:', tlWarning.pivotCount + '個');
            }
            if (tlWarning.rSquared !== undefined) {
              console.log('  R²(精度):', (tlWarning.rSquared * 100).toFixed(1) + '%');
            }
            console.log('  判定方向:', direction);
            console.log('  時刻:', new Date().toLocaleTimeString());
            // 全警告も出力
            console.log('  全警告一覧:', result.trendLineAnalysis.warnings.map(w => w.type).join(', '));
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // 自動スキップ（通知表示付き）
            showAutoSkipNotification('tl', tlWarning.message);
            return;
          } else {
            // 警告＋スキップボタン
            showTrendLineWarning(tlWarning, direction, result);
            return;
          }
        }
      }

      // 警告なし - 通常のエントリー処理
      proceedWithEntry(direction);
    } else {
      // 旧形式の結果の場合 - 次のサイクルへ
      currentPhase = 'waiting';
      const now = new Date();
      nextEntryTime = calculateNextEntryTime(now);
      lastAnalyzedEntry = null;
      updateMonitoringStatus('watching', '次の判定を待機中...');
    }
  }

  // エントリー処理を進める（S/R警告後の継続時も使用）
  function proceedWithEntry(direction) {
    currentRound = 1;
    martingaleDirection = direction;
    isMartingaleActive = false;
    updateRoundDisplay();
    startPrepPhase();
  }

  // S/R警告を表示
  function showSRWarning(srData, direction, analysisResult) {
    pendingSRWarning = {
      direction: direction,
      srData: srData,
      analysisResult: analysisResult
    };

    const section = elements.srWarningSection;
    const icon = elements.srWarningIcon;
    const text = elements.srWarningText;
    const detail = elements.srWarningDetail;

    // 警告レベルに応じてスタイルを変更
    section.classList.remove('level-medium', 'level-high', 'level-critical');
    section.classList.add('level-' + srData.warningLevel);

    // 警告アイコンと文言を設定
    const isResistance = srData.warning === 'resistance';
    const levelName = isResistance ? 'レジスタンス' : 'サポート';

    if (srData.warningLevel === 'critical') {
      icon.textContent = '🔴';
      text.textContent = `${levelName}タッチ`;
      detail.textContent = '予測困難 - ブレイク/反転の判断不可';
    } else if (srData.warningLevel === 'high') {
      icon.textContent = '🟠';
      text.textContent = `${levelName}に非常に近い`;
      detail.textContent = '予測困難な価格帯です';
    } else {
      icon.textContent = '🟡';
      text.textContent = `${levelName}に接近中`;
      detail.textContent = '注意が必要な価格帯です';
    }

    // 距離情報を追加
    const distance = isResistance ? srData.distanceToResistance : srData.distanceToSupport;
    detail.textContent += ` (${distance.toFixed(3)}%)`;

    // S/R警告セクションを表示
    section.style.display = 'block';

    // ステータス更新
    updateMonitoringStatus('warning', 'S/R警告 - 判断待ち');

    console.log('★ S/R警告表示:', srData.warning, srData.warningLevel, distance.toFixed(3) + '%');

    // 10秒後に自動的にエントリーを進める（タイムアウト）
    if (srWarningTimeout) clearTimeout(srWarningTimeout);
    srWarningTimeout = setTimeout(() => {
      if (pendingSRWarning) {
        console.log('★ S/R警告タイムアウト - 自動エントリー');
        handleSRContinue();
      }
    }, 10000);
  }

  // S/R警告：スキップ
  function handleSRSkip() {
    if (srWarningTimeout) clearTimeout(srWarningTimeout);

    // 詳細ログ出力（pendingSRWarningをクリアする前に）
    if (pendingSRWarning && pendingSRWarning.srData) {
      const srData = pendingSRWarning.srData;
      const isResistance = srData.warning === 'resistance';
      const distance = isResistance ? srData.distanceToResistance : srData.distanceToSupport;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔴 S/R手動スキップ');
      console.log('  警告タイプ:', srData.warning);
      console.log('  警告レベル:', srData.warningLevel);
      console.log('  距離:', distance ? distance.toFixed(4) + '%' : '不明');
      console.log('  現在価格:', srData.currentPrice);
      if (isResistance) {
        console.log('  レジスタンス:', srData.resistance);
        console.log('  タッチ回数:', (srData.resistanceTouches || '?') + '回');
      } else {
        console.log('  サポート:', srData.support);
        console.log('  タッチ回数:', (srData.supportTouches || '?') + '回');
      }
      console.log('  判定方向:', pendingSRWarning.direction);
      console.log('  時刻:', new Date().toLocaleTimeString());
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    pendingSRWarning = null;

    // S/R警告セクションを非表示
    elements.srWarningSection.style.display = 'none';

    // スキップ処理
    skipToNextCycle();
  }

  // S/R警告：そのままエントリー
  function handleSRContinue() {
    if (srWarningTimeout) clearTimeout(srWarningTimeout);

    const warning = pendingSRWarning;
    pendingSRWarning = null;

    // S/R警告セクションを非表示
    elements.srWarningSection.style.display = 'none';

    if (warning) {
      console.log('★ S/R警告：エントリー続行');
      proceedWithEntry(warning.direction);
    }
  }

  // S/Rレベル表示を更新
  function updateSRLevelsDisplay(srData) {
    if (!elements.srLevelsSection) return;

    // 現在価格を表示
    if (srData && srData.currentPrice) {
      elements.srCurrentPrice.textContent = `現在: ${srData.currentPrice.toFixed(2)}`;
    } else {
      elements.srCurrentPrice.textContent = '現在: --';
    }

    // レジスタンス表示
    if (srData && srData.resistance) {
      elements.srResistanceValue.textContent = srData.resistance.toFixed(2);
      elements.srResistanceValue.classList.remove('none');
      elements.srResistanceTouches.textContent = ''; // 回数表示は廃止
      // 距離が近い場合はハイライト
      if (srData.distanceToResistance !== null && srData.distanceToResistance <= 0.1) {
        elements.srResistanceLevel.classList.add('near');
      } else {
        elements.srResistanceLevel.classList.remove('near');
      }
    } else {
      elements.srResistanceValue.textContent = '検出なし';
      elements.srResistanceValue.classList.add('none');
      elements.srResistanceTouches.textContent = '';
      elements.srResistanceLevel.classList.remove('near');
    }

    // サポート表示
    if (srData && srData.support) {
      elements.srSupportValue.textContent = srData.support.toFixed(2);
      elements.srSupportValue.classList.remove('none');
      elements.srSupportTouches.textContent = ''; // 回数表示は廃止
      // 距離が近い場合はハイライト
      if (srData.distanceToSupport !== null && srData.distanceToSupport <= 0.1) {
        elements.srSupportLevel.classList.add('near');
      } else {
        elements.srSupportLevel.classList.remove('near');
      }
    } else {
      elements.srSupportValue.textContent = '検出なし';
      elements.srSupportValue.classList.add('none');
      elements.srSupportTouches.textContent = '';
      elements.srSupportLevel.classList.remove('near');
    }
  }

  // トレンドライン警告：方向に応じた警告をチェック
  function checkTrendLineWarningForDirection(warnings, direction) {
    if (!warnings || warnings.length === 0) return null;

    for (const warning of warnings) {
      // HIGH予測時に注意が必要な警告
      if (direction === 'HIGH') {
        if (warning.type === 'overextended_above_uptrend' ||
            (warning.type === 'consecutive_candles' && warning.direction === 'up') ||
            (warning.type === 'rapid_price_change' && warning.change > 0)) {
          return warning;
        }
      }
      // LOW予測時に注意が必要な警告
      if (direction === 'LOW') {
        if (warning.type === 'overextended_below_downtrend' ||
            (warning.type === 'consecutive_candles' && warning.direction === 'down') ||
            (warning.type === 'rapid_price_change' && warning.change < 0)) {
          return warning;
        }
      }
    }
    return null;
  }

  // トレンドライン警告を表示
  let pendingTLWarning = null;
  let tlWarningTimeout = null;

  function showTrendLineWarning(warning, direction, analysisResult) {
    pendingTLWarning = {
      direction: direction,
      warning: warning,
      analysisResult: analysisResult
    };

    const section = elements.srWarningSection;
    const icon = elements.srWarningIcon;
    const text = elements.srWarningText;
    const detail = elements.srWarningDetail;

    // 警告レベルに応じてスタイルを変更
    section.classList.remove('level-medium', 'level-high', 'level-critical');
    section.classList.add('level-' + warning.level);

    // 警告タイプに応じたアイコンと文言
    if (warning.level === 'critical') {
      icon.textContent = '🔴';
    } else {
      icon.textContent = '🟠';
    }

    // 警告メッセージを設定
    text.textContent = getWarningTitle(warning.type);
    detail.textContent = warning.message;

    // 警告セクションを表示
    section.style.display = 'block';

    // ステータス更新
    updateMonitoringStatus('warning', '過熱警告 - 判断待ち');

    console.log('★ トレンドライン警告表示:', warning.type, warning.level, warning.message);

    // 10秒後に自動スキップ（過熱警告はスキップ推奨）
    if (tlWarningTimeout) clearTimeout(tlWarningTimeout);
    tlWarningTimeout = setTimeout(() => {
      if (pendingTLWarning) {
        console.log('★ トレンドライン警告タイムアウト - 自動スキップ');
        handleTLSkip();
      }
    }, 10000);
  }

  function getWarningTitle(type) {
    switch (type) {
      case 'overextended_above_uptrend':
        return 'トレンドライン乖離（過熱）';
      case 'overextended_below_downtrend':
        return 'トレンドライン乖離（売られすぎ）';
      case 'consecutive_candles':
        return '連続足警告';
      case 'rapid_price_change':
        return '急騰/急落警告';
      default:
        return '過熱警告';
    }
  }

  // トレンドライン警告：スキップ
  function handleTLSkip() {
    if (tlWarningTimeout) clearTimeout(tlWarningTimeout);

    // 詳細ログ出力（pendingTLWarningをクリアする前に）
    if (pendingTLWarning && pendingTLWarning.warning) {
      const tlWarning = pendingTLWarning.warning;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🟠 トレンドライン手動スキップ');
      console.log('  警告タイプ:', tlWarning.type);
      console.log('  警告レベル:', tlWarning.level);
      console.log('  メッセージ:', tlWarning.message);
      if (tlWarning.divergence !== undefined) {
        console.log('  乖離率:', tlWarning.divergence.toFixed(2) + '%');
      }
      if (tlWarning.change !== undefined) {
        console.log('  価格変動:', tlWarning.change.toFixed(2) + '%');
      }
      if (tlWarning.pivotCount !== undefined) {
        console.log('  ピボット数:', tlWarning.pivotCount + '個');
      }
      if (tlWarning.rSquared !== undefined) {
        console.log('  R²(精度):', (tlWarning.rSquared * 100).toFixed(1) + '%');
      }
      console.log('  判定方向:', pendingTLWarning.direction);
      console.log('  時刻:', new Date().toLocaleTimeString());
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    pendingTLWarning = null;

    elements.srWarningSection.style.display = 'none';

    skipToNextCycle();
  }

  // 自動スキップ通知を表示（警告セクションの位置に表示）
  function showAutoSkipNotification(type, message) {
    const section = elements.srWarningSection;
    const icon = elements.srWarningIcon;
    const text = elements.srWarningText;
    const detail = elements.srWarningDetail;

    // スタイルをリセット
    section.classList.remove('level-medium', 'level-high', 'level-critical');
    section.classList.add('level-auto-skip');

    // 自動スキップ用のアイコンと文言
    icon.textContent = '⏭️';
    text.textContent = '自動スキップ';
    detail.textContent = message;

    // スキップボタンを非表示
    const skipBtn = document.getElementById('srSkipBtn');
    if (skipBtn) skipBtn.style.display = 'none';

    // セクションを表示
    section.style.display = 'block';

    console.log('★ 自動スキップ通知:', type, message);

    // 3秒後に非表示にして次のサイクルへ
    setTimeout(() => {
      section.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'block'; // ボタンを復元
      skipToNextCycleQuiet(); // 通知なしでスキップ
    }, 3000);
  }

  // 通知なしで次のサイクルへ（自動スキップ用）
  function skipToNextCycleQuiet() {
    updateMonitoringStatus('watching', 'スキップ');
    startWaitingForNextCycle();
  }

  // 同数スキップ時の処理（5秒間表示してから次のサイクルへ）
  function skipToNextCycle() {

    // 結果セクションにSKIP表示
    const resultSection = document.getElementById('resultSection');
    const resultTextEl = document.getElementById('resultText');
    if (resultTextEl) {
      resultTextEl.textContent = 'SKIP';
      resultTextEl.className = 'result-text skip';
    }
    if (resultSection) resultSection.style.display = 'block';

    updateMonitoringStatus('watching', 'スキップ');

    // 5秒後に次のサイクルを待機
    setTimeout(() => {
      if (resultSection) resultSection.style.display = 'none';
      startWaitingForNextCycle();
    }, RESULT_DISPLAY_SECONDS * 1000);
  }

  // インジケーター結果を表示
  function displayIndicatorResults(result) {
    // カウント更新
    elements.highCount.textContent = result.highCount;
    elements.lowCount.textContent = result.lowCount;

    // 8連敗ログ用：現在ラウンドのインジケーター情報を保存
    if (currentRound === 1) {
      // 1回戦目は履歴をリセット
      roundIndicatorHistory = [];
    }
    roundIndicatorHistory.push({
      round: currentRound,
      highCount: result.highCount,
      lowCount: result.lowCount,
      trendMode: result.trendMode || null,
      timestamp: new Date().toISOString()
    });

    // シグナル強度メーターを更新
    updateSignalStrength(result.highCount, result.lowCount);

    // 各インジケーターカードを更新
    result.indicators.forEach(ind => {
      const card = document.querySelector(`.indicator-card[data-id="${ind.id}"]`);
      if (card) {
        const signalEl = card.querySelector('.indicator-signal');

        // クラスをリセット
        card.classList.remove('high', 'low', 'updated');

        // シグナルに応じてクラスとテキストを設定
        if (ind.signal === 'HIGH') {
          card.classList.add('high');
          signalEl.textContent = 'HIGH';
        } else if (ind.signal === 'LOW') {
          card.classList.add('low');
          signalEl.textContent = 'LOW';
        } else {
          signalEl.textContent = '--';
        }

        // アニメーション
        card.classList.add('updated');
        setTimeout(() => card.classList.remove('updated'), 300);
      }
    });

    // アラート音（再分析モード中は鳴らさない - 準備フェーズ開始時に鳴らす）
    if (!isReanalysisMode) {
      playSound('signal');
    }
  }

  // 準備フェーズ開始（エントリー時刻XX:00まで）
  function startPrepPhase() {
    currentPhase = 'prep';

    // エントリー時刻までの残り秒数を計算
    const now = new Date();
    const remaining = Math.max(0, Math.ceil((nextEntryTime - now) / 1000));

    // カウントダウン表示に切り替え
    elements.analysisTimeDisplay.style.display = 'none';
    elements.countdownDisplay.style.display = 'block';
    elements.countdownDisplay.className = 'countdown-display prep';
    elements.countdownLabel.textContent = '準備中';
    elements.countdownNumber.textContent = remaining;

    // 1回戦目の金額表示は待機開始時に既に表示されている
    // ここでは更新しない

    updateMonitoringStatus('signal', '準備期間');
  }

  // エントリーフェーズ開始（60秒、XX:00ぴったりから開始）
  async function startEntryPhase() {
    currentPhase = 'entry';

    // 次のエントリー金額表示を更新（エントリー中は次の回の金額を表示）
    updateNextAmountDisplay();

    // エントリー終了時刻 = エントリー開始時刻 + 60秒
    phaseEndTime = new Date(nextEntryTime.getTime() + ENTRY_SECONDS * 1000);

    elements.countdownDisplay.className = 'countdown-display entry';
    elements.countdownLabel.textContent = 'エントリー';
    elements.countdownNumber.textContent = ENTRY_SECONDS;

    updateMonitoringStatus('trading', 'エントリー期間');
    playSound('entry');

    // エントリー価格を記録
    await recordEntryPrice();
  }

  // エントリー価格を記録（1分足の始値ベース）
  async function recordEntryPrice() {
    try {
      const tab = await getBubingaTab();
      if (!tab) {
        console.log('recordEntryPrice: Bubingaタブが見つかりません');
        return;
      }

      // 1分足の始値を取得
      chrome.tabs.sendMessage(tab.id, { type: 'GET_1MIN_CANDLE_OPEN' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('recordEntryPrice: 通信エラー、フォールバック');
          // フォールバック: 従来の方法で取得
          recordEntryPriceFallback();
          return;
        }

        if (response && response.candleData) {
          const now = new Date();

          // マーチンゲール継続中は保存された方向を使用、そうでなければ多数派
          let direction;
          if (isMartingaleActive && martingaleDirection) {
            direction = martingaleDirection;
          } else {
            const highCount = parseInt(elements.highCount.textContent) || 0;
            const lowCount = parseInt(elements.lowCount.textContent) || 0;
            direction = highCount >= lowCount ? 'HIGH' : 'LOW';
            martingaleDirection = direction; // 新規エントリー時に方向を保存
          }

          currentTrade = {
            entryPrice: response.candleData.open,  // 1分足の始値をエントリー価格として使用
            entryTime: now.toISOString(),
            direction: direction,
            candleTime: response.candleData.candleTime,  // 1分足の開始時刻を記録
            candleStartTimestamp: response.candleData.candleStartTimestamp,
            currencyPair: response.candleData.currencyPair,
            round: currentRound
          };

          console.log('%c[エントリー価格記録] 1分足始値:', 'background: #9C27B0; color: white;',
            `始値: ${response.candleData.open}, 足開始: ${response.candleData.candleTime}`);

          updateTradeDisplay();
        } else {
          console.log('recordEntryPrice: 1分足データなし、フォールバック');
          recordEntryPriceFallback();
        }
      });

    } catch (error) {
      console.error('recordEntryPrice exception:', error);
      recordEntryPriceFallback();
    }
  }

  // フォールバック: 従来の方法でエントリー価格を記録
  async function recordEntryPriceFallback() {
    try {
      const tab = await getBubingaTab();
      if (!tab) return;

      chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_PRICE' }, (response) => {
        if (chrome.runtime.lastError) return;

        if (response && response.priceData) {
          const now = new Date();

          let direction;
          if (isMartingaleActive && martingaleDirection) {
            direction = martingaleDirection;
          } else {
            const highCount = parseInt(elements.highCount.textContent) || 0;
            const lowCount = parseInt(elements.lowCount.textContent) || 0;
            direction = highCount >= lowCount ? 'HIGH' : 'LOW';
            martingaleDirection = direction;
          }

          currentTrade = {
            entryPrice: response.priceData.price,
            entryTime: now.toISOString(),
            direction: direction,
            candleTime: null,  // フォールバック時はnull
            currencyPair: response.priceData.currencyPair,
            round: currentRound
          };

          console.log('[エントリー価格記録] フォールバック:', response.priceData.price);
          updateTradeDisplay();
        }
      });
    } catch (error) {
      // エラー時は何もしない
    }
  }

  // 待機状態開始（エントリー終了後、次の分析結果まで待機）
  function startWaitingCountdown() {
    currentPhase = 'waiting';
    phaseEndTime = null;
    lastAnalyzedEntry = null;

    // 次の10分サイクルのエントリー時刻を計算
    const now = new Date();
    nextEntryTime = calculateNextEntryTime(now);

    // 時計表示に戻す（次の分析結果時間を表示）
    elements.countdownDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'none';
    elements.analysisTimeDisplay.style.display = 'block';

    // トレードセクションを非表示
    const tradeSection = document.getElementById('tradeSection');
    if (tradeSection) tradeSection.style.display = 'none';

    updateMonitoringStatus('watching', '次の判定を待機中...');
  }

  // トレード結果を判定（裏で実行、結果表示のみ）
  // 1分足の確定終値を使用して判定
  async function judgeTradeResult() {
    // エントリー価格がない場合、まずエントリー価格を取得
    if (!currentTrade) {
      console.log('judgeTradeResult: currentTradeがnull', { isMartingaleActive, currentRound, isReanalysisMode });

      if (isMartingaleActive && currentRound >= 1) {
        // マーチン中：エントリー価格がないので判定不可 → 判定スキップへ
        console.log('★ エントリー価格なし - 判定スキップ処理');
        handleJudgeSkip();
        return;
      }
      // 1回目 or マーチン非アクティブなら次のサイクルへ
      startWaitingForNextCycle();
      return;
    }

    try {
      const tab = await getBubingaTab();
      if (!tab) {
        console.log('judgeTradeResult: Bubingaタブが見つからない');
        retryJudgeTradeResult();
        return;
      }

      // 1分足の確定終値を取得（candleTimeが記録されている場合）
      if (currentTrade.candleTime) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'GET_1MIN_CANDLE_CLOSE',
          candleTime: currentTrade.candleTime
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('judgeTradeResult error:', chrome.runtime.lastError.message);
            // フォールバック: 従来の方法で判定
            judgeTradeResultFallback();
            return;
          }

          if (response && response.candleData && response.candleData.isConfirmed) {
            console.log('%c[判定価格取得] 1分足確定終値:', 'background: #FF9800; color: white;',
              `終値: ${response.candleData.close}, 足時刻: ${response.candleData.candleTime}`);
            processTradeResult(response.candleData.close);
          } else {
            console.log('judgeTradeResult: 1分足終値データなし、フォールバック');
            judgeTradeResultFallback();
          }
        });
      } else {
        // candleTimeがない場合（フォールバックで記録された場合）は従来の方法で判定
        judgeTradeResultFallback();
      }

    } catch (error) {
      console.error('judgeTradeResult exception:', error);
      retryJudgeTradeResult();
    }
  }

  // フォールバック: 従来の方法でトレード結果を判定
  async function judgeTradeResultFallback() {
    try {
      const tab = await getBubingaTab();
      if (!tab) {
        retryJudgeTradeResult();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_PRICE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('judgeTradeResultFallback error:', chrome.runtime.lastError.message);
          retryJudgeTradeResult();
          return;
        }

        if (response && response.priceData) {
          console.log('[判定価格取得] フォールバック:', response.priceData.price);
          processTradeResult(response.priceData.price);
        } else {
          console.log('judgeTradeResultFallback: 価格データなし');
          retryJudgeTradeResult();
        }
      });
    } catch (error) {
      console.error('judgeTradeResultFallback exception:', error);
      retryJudgeTradeResult();
    }
  }

  // 判定スキップ処理（エントリー価格がない場合）
  function handleJudgeSkip() {
    console.log('★ 判定スキップ - 次のラウンドへ（勝敗カウントなし）');
    judgeRetryCount = 0;
    currentTrade = null;

    // 次のマーチンラウンドへ
    currentRound++;
    if (currentRound <= 8) {
      console.log(`判定スキップ後、マーチン${currentRound}回目へ`);
      startMartingaleEntry();
    } else {
      console.log('マーチン8回目終了（判定スキップ含む）');
      resetMartingale();
      startWaitingForNextCycle();
    }
  }

  // 判定リトライ処理
  let judgeRetryCount = 0;
  const MAX_JUDGE_RETRIES = 10; // 10回までリトライ（合計約5秒）

  function retryJudgeTradeResult() {
    judgeRetryCount++;
    if (judgeRetryCount <= MAX_JUDGE_RETRIES) {
      console.log(`判定リトライ ${judgeRetryCount}/${MAX_JUDGE_RETRIES}`);
      setTimeout(() => {
        judgeTradeResult();
      }, 500); // 500msごとにリトライ
    } else {
      // リトライ上限に達した - 判定スキップとして次のラウンドへ継続
      console.error('判定失敗: リトライ上限 - 判定スキップとして継続');
      judgeRetryCount = 0;

      // マーチン継続中の場合
      if (isMartingaleActive && currentRound >= 1) {
        console.log('★ マーチン中 - 判定スキップ、次のエントリーへ');
        // 価格取得失敗でも次のラウンドに進む（勝敗カウントなし）
        currentTrade = null;
        // 次のマーチンラウンドを即座に開始
        currentRound++;
        if (currentRound <= 8) {
          console.log(`判定スキップ後、マーチン${currentRound}回目へ`);
          startMartingaleEntry();
        } else {
          // 8ラウンド超過
          console.log('マーチン8回目終了（判定スキップ含む）');
          resetMartingale();
          startWaitingForNextCycle();
        }
      } else {
        currentTrade = null;
        startWaitingForNextCycle();
      }
    }
  }

  // トレード結果を処理
  function processTradeResult(judgePrice) {
    console.log('★★★ processTradeResult開始 ★★★', { judgePrice, currentTrade });
    judgeRetryCount = 0; // リトライカウントをリセット

    const entryPrice = currentTrade.entryPrice;
    const direction = currentTrade.direction;
    const round = currentTrade.round;
    console.log('processTradeResult: round=' + round + ', direction=' + direction);

    let result;

    if (judgePrice > entryPrice) {
      result = direction === 'HIGH' ? 'WIN' : 'LOSE';
    } else if (judgePrice < entryPrice) {
      result = direction === 'LOW' ? 'WIN' : 'LOSE';
    } else {
      result = 'DRAW';
    }

    // 現在のインジケーター票数を取得
    const highCount = parseInt(elements.highCount.textContent) || 0;
    const lowCount = parseInt(elements.lowCount.textContent) || 0;
    const indicatorCounts = { high: highCount, low: lowCount };

    // 結果を記録
    const tradeResult = {
      ...currentTrade,
      judgePrice: judgePrice,
      result: result,
      priceDiff: judgePrice - entryPrice,
      completedAt: new Date().toISOString(),
      indicatorCounts: indicatorCounts
    };

    tradeHistory.unshift(tradeResult);
    if (tradeHistory.length > 20) {
      tradeHistory = tradeHistory.slice(0, 20);
    }

    // マーチンゲール戦略に基づいて次のアクションを決定
    const continueImmediately = handleMartingaleResult(result, round, indicatorCounts, entryPrice, judgePrice);

    // サウンド再生
    if (result === 'WIN') {
      playSound('win');
    } else if (result === 'LOSE') {
      playSound('lose');
    }

    currentTrade = null;

    console.log('processTradeResult判定:', { continueImmediately, isReanalysisMode, result });

    if (continueImmediately) {
      // マーチンゲール継続: 即座にエントリー開始 + LOSE表示を同時に出す
      console.log('→ マーチン継続（即座エントリー）');
      startMartingaleEntryWithResult(tradeResult);
    } else if (isReanalysisMode) {
      // 4連敗による再分析モード: 結果表示してから再分析開始
      console.log('→ 再分析モード開始へ');
      currentPhase = 'result';
      elements.countdownDisplay.style.display = 'none';

      // トレードセクションを即座に非表示
      const tradeSection = document.getElementById('tradeSection');
      if (tradeSection) tradeSection.style.display = 'none';

      displayTradeResult(tradeResult);

      // 3秒後に再分析モードを開始
      setTimeout(() => {
        elements.resultDisplayInline.style.display = 'none';
        startReanalysisMode();
      }, 3000);
    } else {
      // WIN/DRAW/8連敗: 結果表示フェーズへ移行し、3秒後に次のサイクル待機
      currentPhase = 'result';
      elements.countdownDisplay.style.display = 'none';

      // トレードセクションを即座に非表示（回戦表示が一瞬見えるのを防ぐ）
      const tradeSection = document.getElementById('tradeSection');
      if (tradeSection) tradeSection.style.display = 'none';

      displayTradeResult(tradeResult);

      setTimeout(() => {
        elements.resultDisplayInline.style.display = 'none';
        startWaitingForNextCycle();
      }, 3000);
    }
  }

  // マーチンゲール継続時のエントリー開始（準備期間なし、即座に60秒）
  async function startMartingaleEntry() {
    const now = new Date();
    currentPhase = 'entry';

    // エントリー終了時刻 = 現在時刻 + 60秒
    phaseEndTime = new Date(now.getTime() + ENTRY_SECONDS * 1000);

    // カウントダウン表示
    elements.analysisTimeDisplay.style.display = 'none';
    elements.countdownDisplay.style.display = 'block';
    elements.countdownDisplay.className = 'countdown-display entry';
    elements.countdownLabel.textContent = 'エントリー中';
    elements.countdownNumber.textContent = ENTRY_SECONDS;

    updateMonitoringStatus('trading', currentRound + '回戦目エントリー中');
    playSound('entry');

    // エントリー価格を記録
    await recordMartingaleEntryPrice();
  }

  // マーチンゲール継続時のエントリー開始（LOSE表示と同時にカウントダウン開始）
  async function startMartingaleEntryWithResult(tradeResult) {
    const now = new Date();
    currentPhase = 'entry';

    // エントリー終了時刻 = 現在時刻 + 60秒
    phaseEndTime = new Date(now.getTime() + ENTRY_SECONDS * 1000);

    // まず結果を表示（時計部分に）
    elements.analysisTimeDisplay.style.display = 'none';
    elements.countdownDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'block';
    if (elements.resultTextLarge) {
      elements.resultTextLarge.textContent = tradeResult.result;
      elements.resultTextLarge.className = 'result-text-large ' + tradeResult.result.toLowerCase();
    }

    updateMonitoringStatus('trading', currentRound + '回戦目エントリー中');
    playSound('entry');

    // マーチン継続時は次の回戦の金額を表示
    updateNextAmountDisplay();

    // 3秒後に結果表示を消してカウントダウンを開始
    setTimeout(() => {
      elements.resultDisplayInline.style.display = 'none';
      elements.countdownDisplay.style.display = 'block';
      elements.countdownDisplay.className = 'countdown-display entry';
      elements.countdownLabel.textContent = 'エントリー中';
      // 残り時間を計算
      const remaining = Math.max(0, Math.ceil((phaseEndTime - new Date()) / 1000));
      elements.countdownNumber.textContent = remaining;
    }, 3000);

    // エントリー価格を記録
    await recordMartingaleEntryPrice();
  }

  // マーチンゲール継続時のエントリー価格記録（1分足の始値ベース）
  let martingalePriceRetryCount = 0;
  const MAX_MARTINGALE_PRICE_RETRIES = 5;

  async function recordMartingaleEntryPrice() {
    try {
      const tab = await getBubingaTab();
      if (!tab) {
        console.log('recordMartingaleEntryPrice: Bubingaタブが見つからない、リトライ');
        retryMartingaleEntryPrice();
        return;
      }

      // 1分足の始値を取得
      chrome.tabs.sendMessage(tab.id, { type: 'GET_1MIN_CANDLE_OPEN' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('recordMartingaleEntryPrice: 通信エラー、フォールバック');
          recordMartingaleEntryPriceFallback();
          return;
        }

        if (response && response.candleData) {
          martingalePriceRetryCount = 0;
          const now = new Date();

          currentTrade = {
            entryPrice: response.candleData.open,  // 1分足の始値
            entryTime: now.toISOString(),
            direction: martingaleDirection,
            candleTime: response.candleData.candleTime,  // 1分足の開始時刻
            candleStartTimestamp: response.candleData.candleStartTimestamp,
            currencyPair: response.candleData.currencyPair,
            round: currentRound
          };

          console.log('%c[マーチンエントリー価格] 1分足始値:', 'background: #9C27B0; color: white;',
            `始値: ${response.candleData.open}, 足開始: ${response.candleData.candleTime}`);
          updateTradeDisplay();
        } else {
          console.log('recordMartingaleEntryPrice: 1分足データなし、フォールバック');
          recordMartingaleEntryPriceFallback();
        }
      });

    } catch (error) {
      console.log('recordMartingaleEntryPrice: 例外発生、フォールバック', error);
      recordMartingaleEntryPriceFallback();
    }
  }

  // フォールバック: 従来の方法でマーチンエントリー価格を記録
  async function recordMartingaleEntryPriceFallback() {
    try {
      const tab = await getBubingaTab();
      if (!tab) {
        retryMartingaleEntryPrice();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_PRICE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('recordMartingaleEntryPriceFallback: 通信エラー、リトライ');
          retryMartingaleEntryPrice();
          return;
        }

        if (response && response.priceData) {
          martingalePriceRetryCount = 0;
          const now = new Date();

          currentTrade = {
            entryPrice: response.priceData.price,
            entryTime: now.toISOString(),
            direction: martingaleDirection,
            candleTime: null,  // フォールバック時はnull
            currencyPair: response.priceData.currencyPair,
            round: currentRound
          };

          console.log('[マーチンエントリー価格] フォールバック:', response.priceData.price);
          updateTradeDisplay();
        } else {
          console.log('recordMartingaleEntryPriceFallback: 価格データなし、リトライ');
          retryMartingaleEntryPrice();
        }
      });
    } catch (error) {
      console.log('recordMartingaleEntryPriceFallback: 例外発生、リトライ', error);
      retryMartingaleEntryPrice();
    }
  }

  function retryMartingaleEntryPrice() {
    martingalePriceRetryCount++;
    if (martingalePriceRetryCount <= MAX_MARTINGALE_PRICE_RETRIES) {
      console.log(`マーチン価格取得リトライ ${martingalePriceRetryCount}/${MAX_MARTINGALE_PRICE_RETRIES}`);
      setTimeout(() => {
        recordMartingaleEntryPrice();
      }, 500); // 500msごとにリトライ
    } else {
      console.error('マーチン価格取得失敗: リトライ上限');
      martingalePriceRetryCount = 0;
      // エントリー価格取得失敗 → currentTradeはnullのまま
      // 判定時にリトライされ、それでも失敗なら判定スキップで次ラウンドへ
      console.log('★ エントリー価格取得失敗 - 判定時に再取得を試みる');
    }
  }

  // 次のサイクルを待機（WIN/DRAW/8連敗後）
  function startWaitingForNextCycle() {
    currentPhase = 'waiting';
    phaseEndTime = null;

    // 次の5分サイクルのエントリー時刻を計算
    const now = new Date();
    nextEntryTime = calculateNextEntryTime(now);

    // 重要: 新しいエントリー時刻用にlastAnalyzedEntryをリセット
    // これにより次の分析時刻で確実に分析がトリガーされる
    lastAnalyzedEntry = null;

    // 時計表示（次の分析結果時間を表示）
    elements.countdownDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'none';
    elements.analysisTimeDisplay.style.display = 'block';

    // トレードセクションを非表示
    const tradeSection = document.getElementById('tradeSection');
    if (tradeSection) tradeSection.style.display = 'none';

    // 1回戦目の金額を表示（次のセット用）
    showFirstRoundAmount();

    // 前回の分析結果をリセット（HIGH/LOW、インジケーター、シグナル強度）
    resetIndicators();

    updateMonitoringStatus('watching', '次の判定を待機中...');
  }

  // マーチンゲール結果処理
  // 戻り値: true = マーチンゲール継続（即座にエントリー）, false = 次のサイクルを待機
  function handleMartingaleResult(result, round, indicatorCounts, entryPrice, judgePrice) {
    console.log('handleMartingaleResult呼び出し:', { result, round, currentRound, martingaleDirection });
    let continueImmediately = false;

    // 日付チェック（日付が変わったら今日の勝敗をリセット）
    const today = getTodayDateString();
    if (stats.todayDate !== today) {
      stats.todayWins = 0;
      stats.todayLoses = 0;
      stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
      stats.todayWinDetails = [[], [], [], [], [], [], [], []];
      stats.todayLose8 = 0;
      stats.todayLose8Logs = []; // 本日の8連敗ログもリセット
      stats.todayDate = today;
    }

    if (result === 'WIN') {
      // 勝利: 統計を更新し、マーチンゲールをリセット
      stats.totalWins++;
      stats.todayWins++;
      stats.winByRound[round - 1]++; // 累計の該当回戦の勝利数を加算
      if (!stats.todayWinByRound) stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
      stats.todayWinByRound[round - 1]++; // 今日の該当回戦の勝利数を加算

      // インジケーター票数を記録（最新を先頭に追加）
      const winDetail = {
        low: indicatorCounts.low,
        high: indicatorCounts.high,
        timestamp: Date.now(),
        direction: martingaleDirection,
        entryPrice: entryPrice,
        judgePrice: judgePrice
      };

      // 4回目以降で方向転換があった場合、その情報を追加
      if (round >= 4 && originalDirection && originalDirection !== martingaleDirection) {
        winDetail.directionChanged = {
          from: originalDirection,
          to: martingaleDirection
        };
      }

      // 累計の詳細
      if (!stats.winDetails) {
        stats.winDetails = [[], [], [], [], [], [], [], []];
      }
      stats.winDetails[round - 1].unshift(winDetail);
      // 最大10件まで保持
      if (stats.winDetails[round - 1].length > 10) {
        stats.winDetails[round - 1] = stats.winDetails[round - 1].slice(0, 10);
      }

      // 今日の詳細
      if (!stats.todayWinDetails) {
        stats.todayWinDetails = [[], [], [], [], [], [], [], []];
      }
      stats.todayWinDetails[round - 1].unshift(winDetail);
      // 最大10件まで保持
      if (stats.todayWinDetails[round - 1].length > 10) {
        stats.todayWinDetails[round - 1] = stats.todayWinDetails[round - 1].slice(0, 10);
      }

      // 収支計算（勝利時）
      const profit = calculateWinProfit(round);
      updateBalance(profit);

      // マーチンゲールをリセット
      resetMartingale();

    } else if (result === 'LOSE') {
      // 敗北: 次回戦へ進むか8連敗処理
      if (round >= MAX_MARTINGALE_ROUNDS) {
        // 8連敗
        stats.totalLoses++;
        stats.todayLoses++;
        stats.lose8++;
        if (stats.todayLose8 === undefined) stats.todayLose8 = 0;
        stats.todayLose8++; // 今日の8連敗回数を加算

        // 8連敗ログを記録
        const lose8Log = {
          currencyPair: currentCurrencyPair,
          direction: martingaleDirection,
          timestamp: new Date().toISOString(),
          rounds: roundIndicatorHistory.slice() // 各ラウンドのインジケーター情報をコピー
        };
        if (!stats.lose8Logs) stats.lose8Logs = [];
        if (!stats.todayLose8Logs) stats.todayLose8Logs = [];
        stats.lose8Logs.push(lose8Log);
        stats.todayLose8Logs.push(lose8Log);
        console.log('8連敗ログ記録:', lose8Log);

        // 収支計算（8連敗時 = 全額損失）
        const totalLoss = calculateTotalLoss();
        updateBalance(-totalLoss);

        // マーチンゲールをリセット
        resetMartingale();
      } else {
        // マーチンゲール継続
        currentRound = round + 1;
        isMartingaleActive = true;

        // 4連敗時は再分析モードを開始
        console.log('★★★ LOSE分岐詳細 ★★★', {
          round: round,
          roundEquals4: round === 4,
          roundType: typeof round,
          currentRound: currentRound
        });

        if (round === 4) {
          // 元の方向を保存（履歴表示用）
          originalDirection = martingaleDirection;
          isReanalysisMode = true;
          console.log('★★★★★ 4連敗検出！再分析モード開始 ★★★★★');
          console.log('設定完了:', { originalDirection, isReanalysisMode, continueImmediately });
          // continueImmediately = falseのまま → 再分析モード開始
        } else {
          // 通常のマーチン継続 - 即座に次のエントリーへ
          // 方向は維持（martingaleDirectionはそのまま）
          console.log('通常マーチン継続: round=' + round + ' → 即座エントリーへ');
          updateRoundDisplay();
          continueImmediately = true;
        }
      }

    } else if (result === 'DRAW') {
      // 同値: マーチンゲール継続（同じ回戦で再エントリー）
      isMartingaleActive = true;
      // 回戦数は維持、方向も維持
      continueImmediately = true;
    }

    // 統計を保存・表示更新
    saveStats();
    updateStatsDisplay();

    return continueImmediately;
  }

  // マーチンゲールをリセット
  function resetMartingale() {
    currentRound = 1;
    martingaleDirection = null;
    isMartingaleActive = false;
    originalDirection = null;
    isReanalysisMode = false;
    isPostReanalysisPrep = false;
    reanalysisResult = null;
    reanalysisCompleted = false;
    // updateRoundDisplay()は呼ばない
    // 勝利時はトレードセクションが非表示になるため、回戦表示の更新は不要
    // 次回エントリー開始時にupdateTradeDisplay()で正しく表示される
  }

  // ========================================
  // 4連敗時の再分析モード
  // ========================================

  // 再分析モード開始（4連敗後、準備時間10秒固定で再分析→準備→5回目エントリー）
  async function startReanalysisMode() {
    currentPhase = 'reanalysis';
    const PREP_DURATION = 10; // 準備時間は10秒固定

    const now = new Date();
    console.log('★★★ 4連敗: 再分析モード開始 ★★★');
    console.log('★ 現在時刻:', now.toLocaleTimeString() + '.' + now.getMilliseconds());
    updateMonitoringStatus('signal', '再分析中...');

    // 次の分の00秒を計算し、そこから10秒前を再分析終了時刻とする
    const nextMinuteStart = calculateNextMinuteStart(now);
    console.log('★ 次のエントリー(00秒):', nextMinuteStart.toLocaleTimeString());

    phaseEndTime = new Date(nextMinuteStart.getTime() - PREP_DURATION * 1000);
    console.log('★ 再分析終了時刻(準備開始):', phaseEndTime.toLocaleTimeString());

    const reanalysisDuration = Math.max(0, Math.ceil((phaseEndTime - now) / 1000));
    console.log(`★ 再分析時間: ${reanalysisDuration}秒、準備時間: ${PREP_DURATION}秒固定`);

    // UI表示: 再分析中
    elements.analysisTimeDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'none';
    elements.countdownDisplay.style.display = 'block';
    elements.countdownDisplay.className = 'countdown-display reanalysis';
    elements.countdownLabel.textContent = '再分析中';
    elements.countdownNumber.textContent = reanalysisDuration;

    // 再分析は準備時間開始の2秒前に1回だけ実行（結果表示のタイミングで）
    const analysisDelay = Math.max(0, (reanalysisDuration - 2) * 1000);
    setTimeout(async () => {
      if (!isReanalysisMode || currentPhase !== 'reanalysis') {
        console.log('再分析モード終了、分析スキップ');
        return;
      }

      console.log('再分析実行（準備時間直前）');

      try {
        const tab = await getBubingaTab();
        if (!tab) {
          console.log('Bubingaタブが見つかりません、元の方向で継続');
          finishReanalysis(null);
          return;
        }

        chrome.tabs.sendMessage(tab.id, {
          type: 'PERFORM_SIGNAL_ANALYSIS',
          candleCount: '120'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('再分析エラー:', chrome.runtime.lastError.message);
            finishReanalysis(null);
            return;
          }

          console.log('★ 再分析レスポンス:', response);

          if (response && response.signalResult) {
            console.log('★ 再分析結果:', response.signalResult);
            console.log('★ HIGH:', response.signalResult.highCount, 'LOW:', response.signalResult.lowCount);
            finishReanalysis(response.signalResult);
          } else {
            console.log('再分析結果なし、元の方向で継続');
            finishReanalysis(null);
          }
        });
      } catch (error) {
        console.error('再分析エラー:', error);
        finishReanalysis(null);
      }
    }, analysisDelay);
  }

  // 再分析完了後の処理（結果を保存するだけ、カウントダウン完了まで待機）
  function finishReanalysis(result) {
    if (!isReanalysisMode) return; // 既にリセットされていたら何もしない

    // 結果を保存（カウントダウン完了時に使用）
    reanalysisResult = result;
    reanalysisCompleted = true;

    // インジケーター結果は先に表示
    if (result && result.highCount !== undefined && result.lowCount !== undefined) {
      displayIndicatorResults(result);
    }

    console.log('再分析完了、カウントダウン終了まで待機');
    // 準備フェーズへの移行はupdateTickのカウントダウン完了時に行う
  }

  // 再分析カウントダウン完了後の処理（実際の方向決定と準備フェーズ移行）
  function processReanalysisResult() {
    let newDirection = originalDirection; // デフォルトは元の方向
    let directionChanged = false;

    if (reanalysisResult && reanalysisResult.highCount !== undefined && reanalysisResult.lowCount !== undefined) {
      // 10対10の場合は元の方向を維持
      if (reanalysisResult.highCount !== reanalysisResult.lowCount) {
        const analysisDirection = reanalysisResult.highCount > reanalysisResult.lowCount ? 'HIGH' : 'LOW';
        if (analysisDirection !== originalDirection) {
          newDirection = analysisDirection;
          directionChanged = true;
          console.log(`方向転換: ${originalDirection} → ${newDirection}`);
        }
      }
    }

    // 方向を更新
    martingaleDirection = newDirection;

    // 履歴に方向転換情報を記録
    if (directionChanged) {
      recordDirectionChange(originalDirection, newDirection);
    }

    // フラグをリセット
    reanalysisResult = null;
    reanalysisCompleted = false;

    // 準備フェーズへ移行
    startReanalysisPrepPhase();
  }

  // 再分析後の準備フェーズ（10秒固定で待機）
  function startReanalysisPrepPhase() {
    currentPhase = 'prep';
    isReanalysisMode = false; // 再分析モード終了
    isPostReanalysisPrep = true; // 再分析後の準備フェーズフラグをON

    const now = new Date();
    // 準備時間は10秒固定（再分析モードで計算済みのphaseEndTimeから10秒後がエントリー時刻）
    nextEntryTime = new Date(phaseEndTime.getTime() + 10 * 1000);

    const remaining = Math.max(0, Math.ceil((nextEntryTime - now) / 1000));

    console.log('★ 準備フェーズ開始');
    console.log('★ 現在時刻:', now.toLocaleTimeString() + '.' + now.getMilliseconds());
    console.log('★ エントリー時刻:', nextEntryTime.toLocaleTimeString());
    console.log(`★ 準備時間: ${remaining}秒`);

    elements.countdownDisplay.className = 'countdown-display prep';
    elements.countdownLabel.textContent = '準備中';
    elements.countdownNumber.textContent = remaining;

    updateMonitoringStatus('signal', '5回戦目準備中');

    // アラート音を鳴らす（再分析完了、5回戦目準備開始）
    playSound('signal');

    // 5回目の金額を表示
    updateNextAmountDisplay();
  }

  // 次の分の00秒を計算（再分析後のエントリータイミング用）
  function calculateNextMinuteStart(now) {
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    return next;
  }

  // 再分析後のエントリー開始（00秒ぴったりから開始）
  async function startReanalysisEntry() {
    console.log('startReanalysisEntry: 4回目エントリー開始（00秒ぴったり）');
    originalDirection = null; // 元の方向もリセット
    isPostReanalysisPrep = false; // 再分析後準備フラグをOFF
    currentPhase = 'entry';

    // エントリー終了時刻 = エントリー開始時刻(XX:00) + 60秒
    phaseEndTime = new Date(nextEntryTime.getTime() + ENTRY_SECONDS * 1000);

    elements.countdownDisplay.className = 'countdown-display entry';
    elements.countdownLabel.textContent = 'エントリー';
    elements.countdownNumber.textContent = ENTRY_SECONDS;

    updateMonitoringStatus('trading', currentRound + '回戦目エントリー中');
    playSound('entry');

    // 次回エントリー金額を更新（5回目の金額を表示）
    updateNextAmountDisplay();

    // エントリー価格を記録
    await recordMartingaleEntryPrice();

    // トレード表示を更新
    updateTradeDisplay();
    updateRoundDisplay();
  }

  // 方向転換を履歴に記録
  function recordDirectionChange(oldDirection, newDirection) {
    // 最新のトレード履歴に方向転換情報を追加
    if (tradeHistory.length > 0) {
      // 3回目の負けトレードに方向転換フラグを追加
      const lastTrade = tradeHistory[0];
      lastTrade.directionChangedAfter = {
        from: oldDirection,
        to: newDirection,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`方向転換記録: ${oldDirection} → ${newDirection}`);
  }

  // 回戦表示を更新
  function updateRoundDisplay() {
    // トレードセクション内の回戦表示
    if (elements.roundNumber) {
      elements.roundNumber.textContent = currentRound;
    }
  }

  // トレード表示を更新
  function updateTradeDisplay() {
    const tradeSection = document.getElementById('tradeSection');
    if (!tradeSection) return;

    if (currentTrade) {
      const entryPriceEl = document.getElementById('entryPrice');
      const tradeDirEl = document.getElementById('tradeDirection');
      const roundNumberEl = document.getElementById('roundNumber');

      if (entryPriceEl) entryPriceEl.textContent = currentTrade.entryPrice.toFixed(5);
      if (tradeDirEl) {
        tradeDirEl.textContent = currentTrade.direction;
        tradeDirEl.className = 'trade-direction ' + currentTrade.direction.toLowerCase();
      }
      if (roundNumberEl) roundNumberEl.textContent = currentRound;

      tradeSection.style.display = 'block';
    }
  }

  // トレード結果を表示（時計表示部分に表示）
  function displayTradeResult(result) {
    // カウントダウンを非表示、結果表示をインライン表示
    elements.countdownDisplay.style.display = 'none';
    elements.analysisTimeDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'block';

    // 結果テキストを設定
    if (elements.resultTextLarge) {
      elements.resultTextLarge.textContent = result.result;
      elements.resultTextLarge.className = 'result-text-large ' + result.result.toLowerCase();
    }
  }

  // サイクル完了
  function onCycleComplete() {
    currentPhase = 'waiting';
    phaseEndTime = null;
    lastAnalyzedEntry = null; // 重複防止フラグをリセット

    // 次の10分サイクルのエントリー時刻を計算
    const now = new Date();
    nextEntryTime = calculateNextEntryTime(now);

    // 時計表示に戻す（次の分析結果時間を表示）
    elements.countdownDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'none';
    elements.analysisTimeDisplay.style.display = 'block';

    // トレード・結果セクションを非表示
    const tradeSection = document.getElementById('tradeSection');
    if (tradeSection) tradeSection.style.display = 'none';
    const resultSection = document.getElementById('resultSection');
    if (resultSection) resultSection.style.display = 'none';

    updateMonitoringStatus('watching', '次の判定を待機中...');
    playSound('complete');

    // インジケーターをリセット
    resetIndicators();
  }

  // インジケーターをリセット
  function resetIndicators() {
    elements.highCount.textContent = '-';
    elements.lowCount.textContent = '-';

    document.querySelectorAll('.indicator-card').forEach(card => {
      card.classList.remove('high', 'low');
      const signalEl = card.querySelector('.indicator-signal');
      if (signalEl) signalEl.textContent = '--';
    });

    // シグナル強度メーターをリセット
    resetSignalStrength();
  }

  // シグナル強度メーターを更新
  function updateSignalStrength(highCount, lowCount) {
    const total = highCount + lowCount;
    if (total === 0) {
      resetSignalStrength();
      return;
    }

    const diff = highCount - lowCount;
    const maxDiff = 20; // 最大差（20-0）
    const strengthPercent = Math.abs(diff) / maxDiff * 50; // 0-50%

    // 方向とクラスを設定
    elements.strengthFill.classList.remove('high', 'low');

    if (diff > 0) {
      // HIGH優勢
      elements.strengthFill.classList.add('high');
      elements.strengthFill.style.width = strengthPercent + '%';
      elements.strengthFill.style.left = '50%';
      elements.strengthFill.style.right = 'auto';
      elements.strengthLabel.textContent = 'HIGH優勢';
      elements.strengthLabel.className = 'strength-label high';
    } else if (diff < 0) {
      // LOW優勢
      elements.strengthFill.classList.add('low');
      elements.strengthFill.style.width = strengthPercent + '%';
      elements.strengthFill.style.right = '50%';
      elements.strengthFill.style.left = 'auto';
      elements.strengthLabel.textContent = 'LOW優勢';
      elements.strengthLabel.className = 'strength-label low';
    } else {
      // 同数
      elements.strengthFill.style.width = '0%';
      elements.strengthLabel.textContent = '拮抗';
      elements.strengthLabel.className = 'strength-label neutral';
    }
  }

  // シグナル強度メーターをリセット
  function resetSignalStrength() {
    if (elements.strengthFill) {
      elements.strengthFill.classList.remove('high', 'low');
      elements.strengthFill.style.width = '0%';
    }
    if (elements.strengthLabel) {
      elements.strengthLabel.textContent = '--';
      elements.strengthLabel.className = 'strength-label';
    }
  }

  // オーディオ初期化（ユーザーインタラクション時に呼び出す）
  function initializeAudio() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // AudioContextがsuspended状態ならresumeする
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    // アラート音を事前にロードしておく
    if (!alertAudio) {
      alertAudio = new Audio(chrome.runtime.getURL('voice/alert.wav'));
      alertAudio.volume = 0.7;
      // 一度ロードをトリガー
      alertAudio.load();
    }
  }

  // イベントリスナーの設定
  function setupEventListeners() {
    elements.monitoringBtn.addEventListener('click', () => {
      // ユーザーインタラクション時にオーディオを初期化
      initializeAudio();
      if (isMonitoring) {
        stopMonitoring();
      } else {
        startMonitoring();
      }
    });

    // 今日の勝敗リセットボタン
    if (elements.resetTodayStatsBtn) {
      elements.resetTodayStatsBtn.addEventListener('click', () => {
        if (confirm('今日の勝敗記録をリセットしますか？')) {
          resetTodayStats();
        }
      });
    }

    // 全リセットボタン
    if (elements.resetAllStatsBtn) {
      elements.resetAllStatsBtn.addEventListener('click', () => {
        if (confirm('累計の勝敗記録をリセットしますか？\nこの操作は取り消せません。')) {
          resetAllStats();
        }
      });
    }

    // インジケーター詳細トグルボタン
    if (elements.detailToggleBtn) {
      elements.detailToggleBtn.addEventListener('click', () => {
        toggleIndicatorDetail();
      });
    }

    // 今日の勝敗詳細トグルボタン
    if (elements.todayStatsToggleBtn) {
      elements.todayStatsToggleBtn.addEventListener('click', () => {
        toggleTodayStatsDetail();
      });
    }

    // 累計の勝敗詳細トグルボタン
    if (elements.totalStatsToggleBtn) {
      elements.totalStatsToggleBtn.addEventListener('click', () => {
        toggleTotalStatsDetail();
      });
    }

    // 鉛筆マーククリック（マーチン金額設定モーダルを開く）
    if (elements.editAmountBtn) {
      elements.editAmountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettingsModal();
      });
    }

    // 金額クリック（クリップボードにコピー）
    if (elements.nextAmountValue) {
      elements.nextAmountValue.addEventListener('click', (e) => {
        e.stopPropagation();
        copyAmountToClipboard();
      });
    }

    // マーチン金額モーダルを閉じる
    if (elements.modalClose) {
      elements.modalClose.addEventListener('click', closeSettingsModal);
    }
    if (elements.modalCancel) {
      elements.modalCancel.addEventListener('click', closeSettingsModal);
    }

    // マーチン金額モーダル背景クリックで閉じる
    if (elements.settingsModal) {
      elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
          closeSettingsModal();
        }
      });
    }

    // マーチン金額保存ボタン
    if (elements.modalSave) {
      elements.modalSave.addEventListener('click', saveMartingaleAmounts);
    }

    // 自動計算ボタン
    const autoCalcBtn = document.getElementById('autoCalcBtn');
    if (autoCalcBtn) {
      autoCalcBtn.addEventListener('click', calculateMartingaleAmounts);
    }

    // 設定ボタン（歯車）
    if (elements.settingsBtn) {
      elements.settingsBtn.addEventListener('click', () => {
        openGeneralSettingsModal();
      });
    }

    // 統一設定モーダルを閉じる
    if (elements.generalSettingsModalClose) {
      elements.generalSettingsModalClose.addEventListener('click', closeGeneralSettingsModal);
    }

    // 統一設定モーダル背景クリックで閉じる
    if (elements.generalSettingsModal) {
      elements.generalSettingsModal.addEventListener('click', (e) => {
        if (e.target === elements.generalSettingsModal) {
          closeGeneralSettingsModal();
        }
      });
    }

    // 統一設定保存ボタン
    if (elements.generalSettingsModalSave) {
      elements.generalSettingsModalSave.addEventListener('click', saveGeneralSettings);
    }

    // データ管理ボタン
    if (elements.dataManageBtn) {
      elements.dataManageBtn.addEventListener('click', () => {
        openDataManageModal();
      });
    }

    // データ管理モーダルを閉じる
    if (elements.dataManageModalClose) {
      elements.dataManageModalClose.addEventListener('click', closeDataManageModal);
    }

    // データ管理モーダル背景クリックで閉じる
    if (elements.dataManageModal) {
      elements.dataManageModal.addEventListener('click', (e) => {
        if (e.target === elements.dataManageModal) {
          closeDataManageModal();
        }
      });
    }

    // データエクスポートボタン
    if (elements.exportDataBtn) {
      elements.exportDataBtn.addEventListener('click', exportAllData);
    }

    // データインポートボタン
    if (elements.importDataBtn) {
      elements.importDataBtn.addEventListener('click', () => {
        elements.importFileInput.click();
      });
    }

    // ファイル選択時のインポート処理
    if (elements.importFileInput) {
      elements.importFileInput.addEventListener('change', importAllData);
    }

    // 収支履歴ボタン
    if (elements.balanceHistoryBtn) {
      elements.balanceHistoryBtn.addEventListener('click', () => {
        openBalanceHistoryModal();
      });
    }

    // 収支履歴モーダルを閉じる
    if (elements.balanceHistoryModalClose) {
      elements.balanceHistoryModalClose.addEventListener('click', closeBalanceHistoryModal);
    }

    // 収支履歴モーダル背景クリックで閉じる
    if (elements.balanceHistoryModal) {
      elements.balanceHistoryModal.addEventListener('click', (e) => {
        if (e.target === elements.balanceHistoryModal) {
          closeBalanceHistoryModal();
        }
      });
    }

    // 履歴月移動ボタン
    if (elements.prevMonthBtn) {
      elements.prevMonthBtn.addEventListener('click', () => {
        changeHistoryMonth(-1);
      });
    }
    if (elements.nextMonthBtn) {
      elements.nextMonthBtn.addEventListener('click', () => {
        changeHistoryMonth(1);
      });
    }

    // 今日の収支リセットボタン
    const resetTodayBalanceBtn = document.getElementById('resetTodayBalanceBtn');
    if (resetTodayBalanceBtn) {
      resetTodayBalanceBtn.addEventListener('click', () => {
        if (confirm('今日の収支をリセットしますか？')) {
          resetTodayBalance();
        }
      });
    }

    // 累計収支リセットボタン
    const resetTotalBalanceBtn = document.getElementById('resetTotalBalanceBtn');
    if (resetTotalBalanceBtn) {
      resetTotalBalanceBtn.addEventListener('click', () => {
        if (confirm('累計収支をリセットしますか？\nこの操作は取り消せません。')) {
          resetTotalBalance();
        }
      });
    }

    // 全ての収支履歴リセットボタン
    const resetAllBalanceBtn = document.getElementById('resetAllBalanceBtn');
    if (resetAllBalanceBtn) {
      resetAllBalanceBtn.addEventListener('click', () => {
        if (confirm('全ての収支履歴を削除しますか？\nこの操作は取り消せません。')) {
          resetAllBalanceHistory();
        }
      });
    }

    // 累計を履歴から再計算ボタン
    const recalculateTotalBtn = document.getElementById('recalculateTotalBtn');
    if (recalculateTotalBtn) {
      recalculateTotalBtn.addEventListener('click', () => {
        recalculateTotalFromHistory();
      });
    }

    // 8連敗ログモーダル
    const todayLose8Row = document.getElementById('todayLose8Row');
    if (todayLose8Row) {
      todayLose8Row.addEventListener('click', () => {
        openLose8LogModal('today');
      });
    }
    const totalLose8Row = document.getElementById('totalLose8Row');
    if (totalLose8Row) {
      totalLose8Row.addEventListener('click', () => {
        openLose8LogModal('total');
      });
    }
    if (elements.lose8LogModalClose) {
      elements.lose8LogModalClose.addEventListener('click', closeLose8LogModal);
    }
    if (elements.lose8LogModal) {
      elements.lose8LogModal.addEventListener('click', (e) => {
        if (e.target === elements.lose8LogModal) {
          closeLose8LogModal();
        }
      });
    }

    // S/R警告・トレンドライン警告ボタン
    if (elements.srSkipBtn) {
      elements.srSkipBtn.addEventListener('click', () => {
        // S/R警告またはトレンドライン警告のどちらかをスキップ
        if (pendingSRWarning) {
          handleSRSkip();
        } else if (pendingTLWarning) {
          handleTLSkip();
        }
      });
    }
    if (elements.srContinueBtn) {
      elements.srContinueBtn.addEventListener('click', handleSRContinue);
    }

    // 勝敗詳細行のクリックイベント（HIGH/LOW内訳表示）
    setupBreakdownRowClickEvents();
  }

  // 勝敗詳細行のクリックイベントを設定
  function setupBreakdownRowClickEvents() {
    const breakdownRows = document.querySelectorAll('.breakdown-row.clickable');
    breakdownRows.forEach(row => {
      row.addEventListener('click', () => {
        const round = parseInt(row.dataset.round);
        const period = row.dataset.period || 'total'; // 'today' または 'total'
        toggleBreakdownDetail(row, round, period);
      });
    });
  }

  // 勝敗詳細のHIGH/LOW内訳表示をトグル
  function toggleBreakdownDetail(row, round, period) {
    const isExpanded = row.classList.contains('expanded');

    // 他の行を閉じる
    document.querySelectorAll('.breakdown-row.expanded').forEach(r => {
      r.classList.remove('expanded');
    });

    if (!isExpanded) {
      row.classList.add('expanded');
      updateBreakdownDetail(round, period);
    }
  }

  // 勝利詳細（インジケーター票数）を更新
  function updateBreakdownDetail(round, period = 'total') {
    // 今日 or 累計に応じて対象の要素IDと詳細データを取得
    const detailElId = period === 'today' ? 'todayDetail' + round : 'detail' + round;
    const detailEl = document.getElementById(detailElId);
    if (detailEl) {
      // 勝利詳細を取得（今日 or 累計）
      let details;
      if (period === 'today') {
        details = stats.todayWinDetails ? stats.todayWinDetails[round - 1] : [];
      } else {
        details = stats.winDetails ? stats.winDetails[round - 1] : [];
      }

      if (details.length === 0) {
        detailEl.innerHTML = '<span class="no-data">データなし</span>';
        return;
      }

      // 各勝利のインジケーター票数を表示（LEFT=LOW, RIGHT=HIGH）
      let html = '';
      details.forEach((detail, index) => {
        let directionInfo = '';
        // 方向転換があった場合は表示
        if (detail.directionChanged) {
          directionInfo = `<span class="direction-change">${detail.directionChanged.from}→${detail.directionChanged.to}</span>`;
        } else if (detail.direction) {
          directionInfo = `<span class="direction-badge ${detail.direction.toLowerCase()}">${detail.direction}</span>`;
        }

        // 始値・終値の表示（存在する場合）
        let priceInfo = '';
        if (detail.entryPrice !== undefined && detail.judgePrice !== undefined) {
          const priceDiff = detail.judgePrice - detail.entryPrice;
          const priceDiffClass = priceDiff >= 0 ? 'price-up' : 'price-down';
          const priceDiffSign = priceDiff >= 0 ? '+' : '';
          priceInfo = `<div class="detail-price-info">
            <span class="detail-price">始値: ${detail.entryPrice.toFixed(5)}</span>
            <span class="detail-price">終値: ${detail.judgePrice.toFixed(5)}</span>
            <span class="detail-price ${priceDiffClass}">(${priceDiffSign}${priceDiff.toFixed(5)})</span>
          </div>`;
        }

        html += `<div class="detail-item">${directionInfo}<span class="low-count">LOW ${detail.low}</span><span class="detail-separator">-</span><span class="high-count">HIGH ${detail.high}</span>${priceInfo}</div>`;
      });
      detailEl.innerHTML = html;
    }
  }

  // ============================================
  // マーチン金額設定機能
  // ============================================

  // 特殊マーチン自動計算（利益一定型）
  // 公式: 各回戦金額 = ceil((累計投資額 + 目標利益) / 利益率)
  function calculateMartingaleAmounts() {
    const payoutRateInput = document.getElementById('payoutRate');
    const baseAmountInput = document.getElementById('baseAmount');
    const profitDisplay = document.getElementById('profitDisplay');
    const profitValue = document.getElementById('profitValue');

    const payoutRate = parseFloat(payoutRateInput.value);
    const baseAmount = parseInt(baseAmountInput.value);

    // 入力バリデーション
    if (isNaN(payoutRate) || payoutRate < 1.01 || payoutRate > 3.00) {
      alert('ペイアウト率は1.01〜3.00の範囲で入力してください');
      return;
    }

    if (isNaN(baseAmount) || baseAmount < 1) {
      alert('1回戦目金額を入力してください');
      return;
    }

    // 利益率 = ペイアウト率 - 1（例: 1.92 → 0.92）
    const profitRate = payoutRate - 1;

    // 目標利益 = 1回戦目金額 × 利益率
    const targetProfit = Math.round(baseAmount * profitRate);

    // 各回戦の金額を計算
    const amounts = [];
    let cumulativeInvestment = 0;

    for (let round = 1; round <= 8; round++) {
      if (round === 1) {
        // 1回戦目は入力値をそのまま使用
        amounts.push(baseAmount);
        cumulativeInvestment = baseAmount;
      } else {
        // 2回戦目以降: (累計投資額 + 目標利益) / 利益率 を切り上げ
        const requiredAmount = Math.ceil((cumulativeInvestment + targetProfit) / profitRate);
        amounts.push(requiredAmount);
        cumulativeInvestment += requiredAmount;
      }
    }

    // 計算結果をフォームに反映
    for (let i = 1; i <= 8; i++) {
      const input = document.getElementById('amount' + i);
      if (input) {
        input.value = amounts[i - 1];
      }
    }

    // 利益表示を更新
    if (profitDisplay && profitValue) {
      profitDisplay.style.display = 'block';
      profitValue.textContent = '¥' + targetProfit.toLocaleString();
    }

    // ボタンにフィードバック
    const autoCalcBtn = document.getElementById('autoCalcBtn');
    if (autoCalcBtn) {
      autoCalcBtn.classList.add('calculated');
      setTimeout(() => {
        autoCalcBtn.classList.remove('calculated');
      }, 1000);
    }
  }

  // モーダルを開く
  function openSettingsModal() {
    // 現在の設定値をフォームに反映
    for (let i = 1; i <= 8; i++) {
      const input = document.getElementById('amount' + i);
      if (input) {
        input.value = martingaleAmounts[i - 1] || '';
      }
    }
    // ペイアウト率を復元
    const payoutRateInput = document.getElementById('payoutRate');
    if (payoutRateInput) {
      payoutRateInput.value = savedPayoutRate;
    }
    // 1回戦目金額を復元
    const baseAmountInput = document.getElementById('baseAmount');
    if (baseAmountInput) {
      baseAmountInput.value = baseEntryAmount || martingaleAmounts[0] || '';
    }
    // 自動取得チェックボックスを復元
    const autoPayoutCheckbox = document.getElementById('autoPayoutCheckbox');
    if (autoPayoutCheckbox) {
      autoPayoutCheckbox.checked = autoPayoutEnabled;
    }
    // 利益表示を非表示にリセット
    const profitDisplay = document.getElementById('profitDisplay');
    if (profitDisplay) {
      profitDisplay.style.display = 'none';
    }
    elements.settingsModal.style.display = 'flex';
  }

  // モーダルを閉じる
  function closeSettingsModal() {
    elements.settingsModal.style.display = 'none';
  }

  // マーチン金額を保存
  function saveMartingaleAmounts() {
    const newAmounts = [];
    for (let i = 1; i <= 8; i++) {
      const input = document.getElementById('amount' + i);
      const value = input ? parseInt(input.value) || 0 : 0;
      newAmounts.push(value);
    }
    martingaleAmounts = newAmounts;

    // ペイアウト率も保存
    const payoutRateInput = document.getElementById('payoutRate');
    if (payoutRateInput) {
      savedPayoutRate = parseFloat(payoutRateInput.value) || 1.92;
    }

    // 1回戦目金額を基準金額として保存
    const baseAmountInput = document.getElementById('baseAmount');
    if (baseAmountInput) {
      baseEntryAmount = parseInt(baseAmountInput.value) || martingaleAmounts[0] || 1000;
    } else {
      baseEntryAmount = martingaleAmounts[0] || 1000;
    }

    // 自動取得設定を保存
    const autoPayoutCheckbox = document.getElementById('autoPayoutCheckbox');
    if (autoPayoutCheckbox) {
      autoPayoutEnabled = autoPayoutCheckbox.checked;
    }

    // chrome.storage.localに保存
    chrome.storage.local.set({
      'yajirushi_martingale_amounts': martingaleAmounts,
      'yajirushi_payout_rate': savedPayoutRate,
      'yajirushi_base_amount': baseEntryAmount,
      'yajirushi_auto_payout': autoPayoutEnabled
    });

    // 次のエントリー金額表示を更新
    updateNextAmountDisplay();

    closeSettingsModal();
  }

  // マーチン金額を読み込み
  function loadMartingaleAmounts() {
    chrome.storage.local.get([
      'yajirushi_martingale_amounts',
      'yajirushi_payout_rate',
      'yajirushi_base_amount',
      'yajirushi_auto_payout'
    ], (result) => {
      if (result.yajirushi_martingale_amounts && Array.isArray(result.yajirushi_martingale_amounts)) {
        martingaleAmounts = result.yajirushi_martingale_amounts;
      }
      if (result.yajirushi_payout_rate) {
        savedPayoutRate = result.yajirushi_payout_rate;
      }
      if (result.yajirushi_base_amount) {
        baseEntryAmount = result.yajirushi_base_amount;
      }
      if (result.yajirushi_auto_payout !== undefined) {
        autoPayoutEnabled = result.yajirushi_auto_payout;
      }
      // ペイアウト率監視を常に開始（表示のため）
      startPayoutRateMonitoring();
    });
  }

  // 次のエントリー金額表示を更新
  function updateNextAmountDisplay() {
    // 金額が設定されているかチェック
    const hasValidAmount = martingaleAmounts.some(a => a > 0);
    if (!hasValidAmount) {
      elements.nextAmountValue.textContent = '--';
      return;
    }

    // エントリー中は「次の回戦」の金額を表示
    // 準備期間は「現在の回戦」の金額を表示
    let displayRound;
    if (currentPhase === 'entry' || currentPhase === 'judging') {
      // エントリー中・判定中: 次の回戦の金額（8回戦目なら--表示）
      displayRound = currentRound + 1;
      if (displayRound > MAX_MARTINGALE_ROUNDS) {
        elements.nextAmountValue.textContent = '--';
        return;
      }
    } else {
      // 準備期間: 現在の回戦の金額
      displayRound = currentRound;
    }

    const nextAmount = martingaleAmounts[displayRound - 1] || 0;
    if (nextAmount > 0) {
      elements.nextAmountValue.textContent = '¥' + nextAmount.toLocaleString();
    } else {
      elements.nextAmountValue.textContent = '--';
    }
  }

  // 次のエントリー金額表示をリセット
  function hideNextAmountDisplay() {
    elements.nextAmountValue.textContent = '--';
  }

  // 1回戦目の金額を表示（セット終了後に次のセット用として表示）
  function showFirstRoundAmount() {
    const firstAmount = martingaleAmounts[0] || 0;
    if (firstAmount > 0) {
      elements.nextAmountValue.textContent = '¥' + firstAmount.toLocaleString();
    } else {
      elements.nextAmountValue.textContent = '--';
    }
  }

  // 金額をクリップボードにコピー
  async function copyAmountToClipboard() {
    const amountText = elements.nextAmountValue.textContent;

    // --の場合はコピーしない
    if (amountText === '--') {
      return;
    }

    // ¥と,を除去して数値のみ取得
    const numericValue = amountText.replace(/[¥,]/g, '');

    try {
      await navigator.clipboard.writeText(numericValue);

      // コピー成功のフィードバック
      elements.nextAmountValue.classList.add('copied');
      const originalText = amountText;
      elements.nextAmountValue.textContent = 'コピー完了!';

      setTimeout(() => {
        elements.nextAmountValue.classList.remove('copied');
        elements.nextAmountValue.textContent = originalText;
      }, 1000);
    } catch (err) {
      console.error('クリップボードへのコピーに失敗:', err);
    }
  }

  // ============================================
  // ペイアウト率自動取得機能
  // ============================================

  // ペイアウト率監視を開始
  function startPayoutRateMonitoring() {
    if (payoutCheckTimer) {
      clearInterval(payoutCheckTimer);
    }
    // 5秒ごとにペイアウト率をチェック
    payoutCheckTimer = setInterval(checkPayoutRate, 5000);
    // 即座に1回チェック
    checkPayoutRate();
  }

  // ペイアウト率監視を停止
  function stopPayoutRateMonitoring() {
    if (payoutCheckTimer) {
      clearInterval(payoutCheckTimer);
      payoutCheckTimer = null;
    }
  }

  // ペイアウト率をチェック
  async function checkPayoutRate() {
    try {
      const tab = await getBubingaTab();
      if (!tab) {
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAYOUT_RATE' }, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }

        if (response && response.payoutRate) {
          const detectedRate = response.payoutRate;

          // UI表示を更新（常に）
          updatePayoutRateDisplay(detectedRate);

          // ペイアウト率が変更された場合
          if (lastDetectedPayoutRate !== detectedRate) {
            console.log(`[ペイアウト率変更] ${lastDetectedPayoutRate || '未検出'} → ${detectedRate}`);

            lastDetectedPayoutRate = detectedRate;

            // 自動取得が有効で、保存されている値と異なる場合のみ再計算
            if (autoPayoutEnabled && Math.abs(detectedRate - savedPayoutRate) > 0.001) {
              onPayoutRateChanged(detectedRate);
            }
          }
        }
      });

    } catch (error) {
      console.error('[ペイアウト率チェック] エラー:', error);
    }
  }

  // ペイアウト率表示を更新
  function updatePayoutRateDisplay(rate) {
    const payoutRateEl = document.getElementById('currentPayoutRate');
    if (payoutRateEl) {
      payoutRateEl.textContent = rate.toFixed(2);
    }
  }

  // ペイアウト率変更時の処理
  function onPayoutRateChanged(newRate) {
    // 新しいペイアウト率を保存
    savedPayoutRate = newRate;
    chrome.storage.local.set({ 'yajirushi_payout_rate': savedPayoutRate });

    // 1回戦目金額が設定されている場合、マーチン金額を自動再計算
    if (baseEntryAmount > 0) {
      recalculateMartingaleAmounts(newRate, baseEntryAmount);

      // 通知を表示
      showPayoutChangeNotification(newRate);
    }
  }

  // マーチン金額を再計算（ペイアウト率変更時）
  function recalculateMartingaleAmounts(payoutRate, baseAmount) {
    // 利益率 = ペイアウト率 - 1
    const profitRate = payoutRate - 1;

    // 目標利益 = 1回戦目金額 × 利益率
    const targetProfit = Math.round(baseAmount * profitRate);

    // 各回戦の金額を計算
    const newAmounts = [];
    let cumulativeInvestment = 0;

    for (let round = 1; round <= 8; round++) {
      if (round === 1) {
        newAmounts.push(baseAmount);
        cumulativeInvestment = baseAmount;
      } else {
        // (累計投資額 + 目標利益) / 利益率 を切り上げ
        const requiredAmount = Math.ceil((cumulativeInvestment + targetProfit) / profitRate);
        newAmounts.push(requiredAmount);
        cumulativeInvestment += requiredAmount;
      }
    }

    // 更新
    martingaleAmounts = newAmounts;

    // 保存
    chrome.storage.local.set({
      'yajirushi_martingale_amounts': martingaleAmounts,
      'yajirushi_payout_rate': payoutRate,
      'yajirushi_base_amount': baseAmount
    });

    // 次のエントリー金額表示を更新
    updateNextAmountDisplay();

    console.log('[マーチン金額] 自動再計算完了:', newAmounts);
  }

  // ペイアウト率変更通知を表示
  function showPayoutChangeNotification(newRate) {
    // 既存の通知を削除
    const existingNotification = document.querySelector('.payout-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // 通知要素を作成
    const notification = document.createElement('div');
    notification.className = 'payout-notification';
    notification.innerHTML = `
      <div class="payout-notification-content">
        <span class="payout-notification-icon">⚡</span>
        <span class="payout-notification-text">ペイアウト率が ${(newRate * 100 - 100).toFixed(0)}% に変更されました</span>
        <span class="payout-notification-subtext">マーチン金額を自動調整しました</span>
      </div>
    `;

    // body に追加
    document.body.appendChild(notification);

    // アニメーション開始
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    // 3秒後に消す
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  // ============================================
  // 統一設定機能
  // ============================================

  // 統一設定モーダルを開く
  function openGeneralSettingsModal() {
    // 現在の設定値をドロップダウンに反映
    const soundSelect = document.getElementById('soundLevelSelect');
    if (soundSelect) {
      soundSelect.value = soundLevel;
    }

    // レジサポ警告設定を反映
    const srSelect = document.getElementById('srWarningModeSelect');
    if (srSelect) {
      srSelect.value = srWarningMode;
    }

    // トレンドライン警告設定を反映
    const tlSelect = document.getElementById('tlWarningModeSelect');
    if (tlSelect) {
      tlSelect.value = tlWarningMode;
    }

    elements.generalSettingsModal.style.display = 'flex';
  }

  // 統一設定モーダルを閉じる
  function closeGeneralSettingsModal() {
    elements.generalSettingsModal.style.display = 'none';
  }

  // 統一設定を保存
  function saveGeneralSettings() {
    // 音量設定（ドロップダウンから取得）
    const soundSelect = document.getElementById('soundLevelSelect');
    if (soundSelect) {
      soundLevel = soundSelect.value;
    }

    // レジサポ警告設定（ドロップダウンから取得）
    const srSelect = document.getElementById('srWarningModeSelect');
    if (srSelect) {
      srWarningMode = srSelect.value;
    }

    // トレンドライン警告設定（ドロップダウンから取得）
    const tlSelect = document.getElementById('tlWarningModeSelect');
    if (tlSelect) {
      tlWarningMode = tlSelect.value;
    }

    // 保存
    chrome.storage.local.set({
      'yajirushi_sound_level': soundLevel,
      'yajirushi_sr_warning_mode': srWarningMode,
      'yajirushi_tl_warning_mode': tlWarningMode
    });

    console.log('★ 設定保存:', { soundLevel, srWarningMode, tlWarningMode });
    closeGeneralSettingsModal();
  }

  // 設定を読み込み
  function loadSettings() {
    chrome.storage.local.get([
      'yajirushi_sound_level',
      'yajirushi_sr_warning_mode',
      'yajirushi_tl_warning_mode'
    ], (result) => {
      if (result.yajirushi_sound_level) {
        soundLevel = result.yajirushi_sound_level;
      }
      if (result.yajirushi_sr_warning_mode) {
        srWarningMode = result.yajirushi_sr_warning_mode;
      }
      if (result.yajirushi_tl_warning_mode) {
        tlWarningMode = result.yajirushi_tl_warning_mode;
      }
      console.log('★ 設定読み込み:', { soundLevel, srWarningMode, tlWarningMode });
    });
  }

  // 音量設定を読み込み（後方互換性）
  function loadSoundLevel() {
    loadSettings();
  }

  // ============================================
  // データ管理機能（エクスポート/インポート）
  // ============================================

  // データ管理モーダルを開く
  function openDataManageModal() {
    elements.dataManageModal.style.display = 'flex';
  }

  // データ管理モーダルを閉じる
  function closeDataManageModal() {
    elements.dataManageModal.style.display = 'none';
  }

  // 全データをエクスポート
  function exportAllData() {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stats: allStats,
      balances: allBalances,
      settings: {
        martingaleAmounts: martingaleAmounts,
        payoutRate: savedPayoutRate,
        baseAmount: baseEntryAmount,
        autoPayoutEnabled: autoPayoutEnabled,
        soundLevel: soundLevel
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bubinga_data_${getTodayDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('データをエクスポートしました');
  }

  // 全データをインポート
  function importAllData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedData = JSON.parse(e.target.result);

        // バージョンチェック
        if (!importedData.version) {
          throw new Error('無効なデータフォーマットです');
        }

        // 確認ダイアログ
        if (!confirm('現在のデータを上書きしてインポートしますか？\nこの操作は取り消せません。')) {
          return;
        }

        // 統計をインポート
        if (importedData.stats) {
          allStats = importedData.stats;
          chrome.storage.local.set({ 'yajirushi_stats_all': allStats });
          loadStatsForCurrentPair();
        }

        // 収支をインポート
        if (importedData.balances) {
          allBalances = importedData.balances;
          chrome.storage.local.set({ 'yajirushi_balance_all': allBalances });
          loadBalanceForCurrentPair();
        }

        // 設定をインポート
        if (importedData.settings) {
          const s = importedData.settings;
          if (s.martingaleAmounts) martingaleAmounts = s.martingaleAmounts;
          if (s.payoutRate) savedPayoutRate = s.payoutRate;
          if (s.baseAmount) baseEntryAmount = s.baseAmount;
          if (s.autoPayoutEnabled !== undefined) autoPayoutEnabled = s.autoPayoutEnabled;
          if (s.soundLevel) soundLevel = s.soundLevel;

          chrome.storage.local.set({
            'yajirushi_martingale_amounts': martingaleAmounts,
            'yajirushi_payout_rate': savedPayoutRate,
            'yajirushi_base_amount': baseEntryAmount,
            'yajirushi_auto_payout': autoPayoutEnabled,
            'yajirushi_sound_level': soundLevel
          });
        }

        alert('データをインポートしました');
        closeDataManageModal();

      } catch (error) {
        alert('インポートに失敗しました: ' + error.message);
      }
    };
    reader.readAsText(file);

    // ファイル選択をリセット
    event.target.value = '';
  }

  // ============================================
  // 収支履歴機能
  // ============================================

  // 収支履歴モーダルを開く
  function openBalanceHistoryModal() {
    // 現在の月にリセット
    historyDisplayYear = new Date().getFullYear();
    historyDisplayMonth = new Date().getMonth();
    updateHistoryDisplay();
    elements.balanceHistoryModal.style.display = 'flex';
  }

  // 収支履歴モーダルを閉じる
  function closeBalanceHistoryModal() {
    elements.balanceHistoryModal.style.display = 'none';
  }

  // 履歴表示月を変更
  function changeHistoryMonth(delta) {
    historyDisplayMonth += delta;
    if (historyDisplayMonth < 0) {
      historyDisplayMonth = 11;
      historyDisplayYear--;
    } else if (historyDisplayMonth > 11) {
      historyDisplayMonth = 0;
      historyDisplayYear++;
    }
    updateHistoryDisplay();
  }

  // 履歴表示を更新
  function updateHistoryDisplay() {
    // 月表示を更新
    if (elements.currentMonthDisplay) {
      elements.currentMonthDisplay.textContent = `${historyDisplayYear}年${historyDisplayMonth + 1}月`;
    }

    // 日別履歴を取得
    const dailyHistory = balance.dailyHistory || {};
    const monthKey = `${historyDisplayYear}-${String(historyDisplayMonth + 1).padStart(2, '0')}`;

    // 該当月のデータをフィルタリング
    const monthData = Object.entries(dailyHistory)
      .filter(([date]) => date.startsWith(monthKey))
      .sort((a, b) => b[0].localeCompare(a[0])); // 日付降順

    // 月間合計を計算
    let monthlyTotal = 0;
    monthData.forEach(([, amount]) => {
      monthlyTotal += amount;
    });

    // 月間合計を表示
    if (elements.monthlyTotalValue) {
      elements.monthlyTotalValue.textContent = formatBalance(monthlyTotal);
      elements.monthlyTotalValue.className = 'monthly-total-value ' + getBalanceClass(monthlyTotal);
    }

    // 日別リストを生成
    if (elements.historyList) {
      if (monthData.length === 0) {
        elements.historyList.innerHTML = '<div class="history-empty">この月のデータはありません</div>';
      } else {
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        let html = '';
        monthData.forEach(([date, amount]) => {
          const d = new Date(date);
          const day = d.getDate();
          const weekday = weekdays[d.getDay()];
          const amountClass = amount > 0 ? 'positive' : (amount < 0 ? 'negative' : '');
          html += `
            <div class="history-item">
              <div class="history-item-content">
                <span class="history-date">${day}日<span class="weekday">(${weekday})</span></span>
                <span class="history-amount ${amountClass}">${formatBalance(amount)}</span>
              </div>
              <button class="history-delete-btn" data-date="${date}" title="この日のデータを削除">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          `;
        });
        elements.historyList.innerHTML = html;

        // 各日の削除ボタンにイベントリスナーを追加
        elements.historyList.querySelectorAll('.history-delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const date = btn.dataset.date;
            deleteDailyBalance(date);
          });
        });
      }
    }
  }

  // インジケーター詳細のトグル
  function toggleIndicatorDetail() {
    const isVisible = elements.indicatorsSection.style.display !== 'none';

    if (isVisible) {
      // 非表示にする
      elements.indicatorsSection.style.display = 'none';
      elements.detailToggleBtn.classList.remove('active');
      elements.detailToggleBtn.querySelector('.toggle-text').textContent = '詳細を見る';
    } else {
      // 表示する
      elements.indicatorsSection.style.display = 'block';
      elements.detailToggleBtn.classList.add('active');
      elements.detailToggleBtn.querySelector('.toggle-text').textContent = '詳細を閉じる';
    }
  }

  // 今日の勝敗詳細のトグル
  function toggleTodayStatsDetail() {
    if (!elements.todayStatsBreakdown || !elements.todayStatsToggleBtn) return;
    const isVisible = elements.todayStatsBreakdown.style.display !== 'none';

    if (isVisible) {
      elements.todayStatsBreakdown.style.display = 'none';
      elements.todayStatsToggleBtn.classList.remove('active');
    } else {
      elements.todayStatsBreakdown.style.display = 'block';
      elements.todayStatsToggleBtn.classList.add('active');
    }
  }

  // 累計の勝敗詳細のトグル
  function toggleTotalStatsDetail() {
    if (!elements.totalStatsBreakdown || !elements.totalStatsToggleBtn) return;
    const isVisible = elements.totalStatsBreakdown.style.display !== 'none';

    if (isVisible) {
      elements.totalStatsBreakdown.style.display = 'none';
      elements.totalStatsToggleBtn.classList.remove('active');
    } else {
      elements.totalStatsBreakdown.style.display = 'block';
      elements.totalStatsToggleBtn.classList.add('active');
    }
  }

  // 今日の勝敗をリセット
  function resetTodayStats() {
    stats.todayWins = 0;
    stats.todayLoses = 0;
    stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
    stats.todayWinDetails = [[], [], [], [], [], [], [], []];
    stats.todayLose8 = 0;
    stats.todayLose8Logs = []; // 本日の8連敗ログもリセット
    stats.todayDate = getTodayDateString();
    saveStats();
    updateStatsDisplay();
  }

  // 累計統計をリセット（全てリセット）
  function resetAllStats() {
    stats = createDefaultStats();
    saveStats();
    updateStatsDisplay();
  }

  // 統計を保存（chrome.storage.local）- 通貨ペアごと
  function saveStats() {
    if (currentCurrencyPair && currentCurrencyPair !== '検出中...' && currentCurrencyPair !== '--') {
      allStats[currentCurrencyPair] = { ...stats };
      chrome.storage.local.set({ 'yajirushi_stats_all': allStats });
    }
  }

  // 統計を読み込み - 通貨ペアごと
  function loadStats() {
    chrome.storage.local.get(['yajirushi_stats_all'], (result) => {
      if (result.yajirushi_stats_all) {
        allStats = result.yajirushi_stats_all;
        // 現在の通貨ペアの統計を読み込み
        loadStatsForCurrentPair();
      }
    });
  }

  // 現在の通貨ペアの統計を読み込み
  function loadStatsForCurrentPair() {
    if (currentCurrencyPair && currentCurrencyPair !== '検出中...' && currentCurrencyPair !== '--') {
      if (allStats[currentCurrencyPair]) {
        stats = { ...allStats[currentCurrencyPair] };
        // 古いデータとの互換性: 新しいフィールドがない場合は初期化
        if (!stats.winDetails) {
          stats.winDetails = [[], [], [], [], [], [], [], []];
        }
        // 配列のディープコピー
        stats.winDetails = stats.winDetails.map(arr => [...(arr || [])]);
        stats.winByRound = [...(stats.winByRound || [0, 0, 0, 0, 0, 0, 0, 0])];
        // todayWins/todayLosesがない場合は初期化
        if (stats.todayWins === undefined) stats.todayWins = 0;
        if (stats.todayLoses === undefined) stats.todayLoses = 0;
        if (!stats.todayWinByRound) stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
        else stats.todayWinByRound = [...stats.todayWinByRound];
        if (stats.todayLose8 === undefined) stats.todayLose8 = 0;
        if (!stats.todayWinDetails) stats.todayWinDetails = [[], [], [], [], [], [], [], []];
        else stats.todayWinDetails = stats.todayWinDetails.map(arr => [...(arr || [])]);
        if (!stats.todayDate) stats.todayDate = getTodayDateString();
        // 日付が変わっていたらリセット
        const today = getTodayDateString();
        if (stats.todayDate !== today) {
          stats.todayWins = 0;
          stats.todayLoses = 0;
          stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
          stats.todayWinDetails = [[], [], [], [], [], [], [], []];
          stats.todayLose8 = 0;
          stats.todayLose8Logs = []; // 本日の8連敗ログもリセット
          stats.todayDate = today;
        }
      } else {
        stats = createDefaultStats();
      }
      updateStatsDisplay();
    }
  }

  // 統計表示を更新
  function updateStatsDisplay() {
    // 日付チェック（日付が変わったら今日の勝敗をリセット）
    const today = getTodayDateString();
    if (stats.todayDate !== today) {
      stats.todayWins = 0;
      stats.todayLoses = 0;
      stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
      stats.todayWinDetails = [[], [], [], [], [], [], [], []];
      stats.todayLose8 = 0;
      stats.todayLose8Logs = []; // 本日の8連敗ログもリセット
      stats.todayDate = today;
    }

    // 今日の勝敗
    if (elements.todayWins) elements.todayWins.textContent = stats.todayWins || 0;
    if (elements.todayLoses) elements.todayLoses.textContent = stats.todayLoses || 0;

    // 累計勝敗
    if (elements.totalWins) elements.totalWins.textContent = stats.totalWins;
    if (elements.totalLoses) elements.totalLoses.textContent = stats.totalLoses;

    // 今日の回戦別勝利数（1-8回目）
    if (!stats.todayWinByRound) stats.todayWinByRound = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 1; i <= 8; i++) {
      const todayEl = document.getElementById('todayWin' + i);
      if (todayEl) todayEl.textContent = stats.todayWinByRound[i - 1] || 0;
    }
    // 今日の8連敗回数
    const todayLose8El = document.getElementById('todayLose8');
    if (todayLose8El) todayLose8El.textContent = stats.todayLose8 || 0;

    // 累計の回戦別勝利数（1-8回目）
    for (let i = 1; i <= 8; i++) {
      const el = document.getElementById('win' + i);
      if (el) el.textContent = stats.winByRound[i - 1] || 0;
    }

    // 累計の8連敗回数
    const lose8El = document.getElementById('lose8');
    if (lose8El) lose8El.textContent = stats.lose8 || 0;
  }

  // ============================================
  // 収支トラッカー機能
  // ============================================

  // 勝利時の利益を計算（保存されたペイアウト率を使用）
  function calculateWinProfit(winRound) {
    // 1回戦目〜winRound回目までの累計投資額
    let totalInvestment = 0;
    for (let i = 0; i < winRound; i++) {
      totalInvestment += martingaleAmounts[i] || 0;
    }

    // 勝った回の金額
    const winAmount = martingaleAmounts[winRound - 1] || 0;

    // 利益 = 勝った金額 × ペイアウト率 - 累計投資額（小数点以下切り捨て）
    const profit = Math.floor(winAmount * savedPayoutRate - totalInvestment);
    return profit;
  }

  // 8連敗時の損失を計算
  function calculateTotalLoss() {
    let totalLoss = 0;
    for (let i = 0; i < 8; i++) {
      totalLoss += martingaleAmounts[i] || 0;
    }
    return totalLoss;
  }

  // 収支を更新
  function updateBalance(amount) {
    // 日付チェック（日付が変わったら今日の収支をリセット）
    const today = getTodayDateString();
    if (balance.todayDate !== today) {
      // 前日の収支を履歴に保存（もし前日のデータがあれば）
      if (balance.todayDate && balance.todayBalance !== 0) {
        if (!balance.dailyHistory) balance.dailyHistory = {};
        // 既存の値があれば加算、なければ新規設定
        const prevDate = balance.todayDate;
        balance.dailyHistory[prevDate] = (balance.dailyHistory[prevDate] || 0) + balance.todayBalance;
      }
      balance.todayBalance = 0;
      balance.todayDate = today;
    }

    balance.todayBalance += amount;
    balance.totalBalance += amount;

    // 今日の収支を日別履歴にも反映
    if (!balance.dailyHistory) balance.dailyHistory = {};
    balance.dailyHistory[today] = balance.todayBalance;

    saveBalance();
    updateBalanceDisplay();
  }

  // 収支表示を更新
  function updateBalanceDisplay() {
    const todayEl = document.getElementById('todayBalance');
    const totalEl = document.getElementById('totalBalance');

    if (todayEl) {
      todayEl.textContent = formatBalance(balance.todayBalance);
      todayEl.className = 'balance-value ' + getBalanceClass(balance.todayBalance);
    }

    if (totalEl) {
      totalEl.textContent = formatBalance(balance.totalBalance);
      totalEl.className = 'balance-value ' + getBalanceClass(balance.totalBalance);
    }
  }

  // 収支をフォーマット
  function formatBalance(amount) {
    const prefix = amount >= 0 ? '¥' : '-¥';
    return prefix + Math.abs(amount).toLocaleString();
  }

  // 収支に応じたクラスを取得
  function getBalanceClass(amount) {
    if (amount > 0) return 'positive';
    if (amount < 0) return 'negative';
    return '';
  }

  // 収支を保存
  function saveBalance() {
    if (currentCurrencyPair && currentCurrencyPair !== '検出中...' && currentCurrencyPair !== '--') {
      allBalances[currentCurrencyPair] = { ...balance };
      chrome.storage.local.set({ 'yajirushi_balance_all': allBalances });
    }
  }

  // 収支を読み込み
  function loadBalance() {
    chrome.storage.local.get(['yajirushi_balance_all'], (result) => {
      if (result.yajirushi_balance_all) {
        allBalances = result.yajirushi_balance_all;
        loadBalanceForCurrentPair();
      }
    });
  }

  // 現在の通貨ペアの収支を読み込み
  function loadBalanceForCurrentPair() {
    if (currentCurrencyPair && currentCurrencyPair !== '検出中...' && currentCurrencyPair !== '--') {
      if (allBalances[currentCurrencyPair]) {
        balance = { ...allBalances[currentCurrencyPair] };
        // dailyHistoryがない場合は初期化
        if (!balance.dailyHistory) {
          balance.dailyHistory = {};
        } else {
          // オブジェクトのディープコピー
          balance.dailyHistory = { ...balance.dailyHistory };
        }
        // 日付チェック（日付が変わったら今日の収支をリセット）
        const today = getTodayDateString();
        if (balance.todayDate !== today) {
          // 前日の収支を履歴に保存
          if (balance.todayDate && balance.todayBalance !== 0) {
            balance.dailyHistory[balance.todayDate] = balance.todayBalance;
          }
          balance.todayBalance = 0;
          balance.todayDate = today;
        }
      } else {
        balance = createDefaultBalance();
      }
      updateBalanceDisplay();
    }
  }

  // 収支をリセット（全体）
  function resetBalance() {
    balance = createDefaultBalance();
    saveBalance();
    updateBalanceDisplay();
  }

  // 今日の収支のみリセット
  function resetTodayBalance() {
    balance.todayBalance = 0;
    balance.todayDate = getTodayDateString();
    saveBalance();
    updateBalanceDisplay();
  }

  // 累計収支のみリセット
  function resetTotalBalance() {
    balance.totalBalance = 0;
    saveBalance();
    updateBalanceDisplay();
  }

  // 全ての収支履歴を削除
  function resetAllBalanceHistory() {
    balance.dailyHistory = {};
    balance.totalBalance = 0;
    balance.todayBalance = 0;
    balance.todayDate = getTodayDateString();
    saveBalance();
    updateBalanceDisplay();
    updateHistoryDisplay();
    console.log('全ての収支履歴をリセットしました');
  }

  // 特定の日の収支を削除
  function deleteDailyBalance(dateKey) {
    if (!balance.dailyHistory || !balance.dailyHistory[dateKey]) {
      return;
    }

    if (!confirm(`${dateKey}の収支を削除しますか？`)) {
      return;
    }

    // 累計からその日の金額を減算
    const amount = balance.dailyHistory[dateKey];
    balance.totalBalance -= amount;

    // 今日の日付と同じ場合は今日の収支もリセット
    const today = getTodayDateString();
    if (dateKey === today) {
      balance.todayBalance = 0;
    }

    // 履歴から削除
    delete balance.dailyHistory[dateKey];

    saveBalance();
    updateBalanceDisplay();
    updateHistoryDisplay();
    console.log(`${dateKey}の収支を削除しました`);
  }

  // 累計を日別履歴から再計算
  function recalculateTotalFromHistory() {
    if (!confirm('累計収支を日別履歴の合計から再計算しますか？\n現在の累計値は履歴の合計で上書きされます。')) {
      return;
    }

    let total = 0;
    if (balance.dailyHistory) {
      Object.values(balance.dailyHistory).forEach(amount => {
        total += amount;
      });
    }

    balance.totalBalance = total;
    saveBalance();
    updateBalanceDisplay();
    console.log(`累計を再計算しました: ¥${total.toLocaleString()}`);
    alert(`累計を再計算しました: ¥${total.toLocaleString()}`);
  }

  // 8連敗ログモーダルを開く
  function openLose8LogModal(period) {
    if (!elements.lose8LogModal) return;

    const stats = allStats[currentCurrencyPair];
    if (!stats) {
      elements.lose8LogList.innerHTML = '<div class="lose8-empty">データがありません</div>';
      elements.lose8PeriodLabel.textContent = period === 'today' ? '今日の8連敗' : '累計の8連敗';
      elements.lose8LogModal.style.display = 'flex';
      return;
    }

    const logs = period === 'today' ? (stats.todayLose8Logs || []) : (stats.lose8Logs || []);
    elements.lose8PeriodLabel.textContent = period === 'today' ? '今日の8連敗' : '累計の8連敗';

    if (logs.length === 0) {
      elements.lose8LogList.innerHTML = '<div class="lose8-empty">8連敗の記録はありません</div>';
    } else {
      let html = '';
      // 新しい順に表示
      const sortedLogs = [...logs].reverse();
      sortedLogs.forEach((log, index) => {
        const timestamp = new Date(log.timestamp);
        const dateStr = `${timestamp.getMonth() + 1}/${timestamp.getDate()}`;
        const timeStr = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}`;
        const directionClass = log.direction === 'HIGH' ? 'high' : 'low';

        html += `
          <div class="lose8-log-item">
            <div class="lose8-log-header">
              <span class="lose8-log-pair">${log.currencyPair || '不明'}</span>
              <span class="lose8-log-time">${dateStr} ${timeStr}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span class="lose8-log-direction ${directionClass}">${log.direction || '不明'}</span>
            </div>
            <div class="lose8-rounds-table">
        `;

        // 各ラウンドの結果を表示
        if (log.rounds && log.rounds.length > 0) {
          log.rounds.forEach(round => {
            const roundTime = new Date(round.timestamp);
            const roundTimeStr = `${roundTime.getHours().toString().padStart(2, '0')}:${roundTime.getMinutes().toString().padStart(2, '0')}`;
            const resultClass = round.highCount > round.lowCount ? 'high' : 'low';
            const resultText = `H:${round.highCount} / L:${round.lowCount}`;

            html += `
              <div class="lose8-round-row">
                <span class="lose8-round-num">${round.round}回戦</span>
                <span class="lose8-round-result ${resultClass}">${resultText}</span>
                <span class="lose8-round-time">${roundTimeStr}</span>
              </div>
            `;
          });
        } else {
          html += '<div class="lose8-round-row"><span style="color: rgba(255,255,255,0.4);">詳細データなし</span></div>';
        }

        html += `
            </div>
          </div>
        `;
      });
      elements.lose8LogList.innerHTML = html;
    }

    elements.lose8LogModal.style.display = 'flex';
  }

  // 8連敗ログモーダルを閉じる
  function closeLose8LogModal() {
    if (elements.lose8LogModal) {
      elements.lose8LogModal.style.display = 'none';
    }
  }

  // 監視を開始
  function startMonitoring() {
    if (isMonitoring) return;

    if (currentCurrencyPair === '検出中...' || currentCurrencyPair === '--') {
      alert('通貨ペアを検出できません。Bubingaのチャート画面を開いてください。');
      return;
    }

    isMonitoring = true;
    currentPhase = 'waiting';
    lastAnalyzedEntry = null;

    // 次の10分サイクルのエントリー時刻を計算（分析時刻がまだ来ていないもの）
    const now = new Date();
    nextEntryTime = calculateNextEntryTime(now);

    elements.monitoringBtn.classList.add('active');
    elements.monitoringText.textContent = '監視停止';

    // 監視開始時に1回戦目の金額を表示
    showFirstRoundAmount();

    updateMonitoringStatus('watching', '次の判定を待機中...');
    resetIndicators();
  }

  // 監視を停止
  function stopMonitoring() {
    isMonitoring = false;
    currentPhase = 'idle';
    phaseEndTime = null;
    nextEntryTime = null;
    lastAnalyzedEntry = null;

    // マーチンゲールもリセット
    resetMartingale();

    elements.monitoringBtn.classList.remove('active');
    elements.monitoringText.textContent = '監視開始';

    // 時計表示に戻す
    elements.countdownDisplay.style.display = 'none';
    elements.resultDisplayInline.style.display = 'none';
    elements.analysisTimeDisplay.style.display = 'block';

    // トレード・結果セクションを非表示
    const tradeSection = document.getElementById('tradeSection');
    if (tradeSection) tradeSection.style.display = 'none';
    const resultSection = document.getElementById('resultSection');
    if (resultSection) resultSection.style.display = 'none';

    // 次のエントリー金額表示を非表示
    hideNextAmountDisplay();

    updateMonitoringStatus('idle', '待機中');
    resetIndicators();
  }

  // 監視ステータスを更新
  function updateMonitoringStatus(status, text) {
    elements.monitoringIndicator.className = 'monitoring-indicator';

    switch (status) {
      case 'watching':
        elements.monitoringIndicator.classList.add('watching');
        break;
      case 'signal':
        elements.monitoringIndicator.classList.add('signal');
        break;
      case 'trading':
        elements.monitoringIndicator.classList.add('trading');
        break;
    }

    elements.monitoringStatusText.textContent = text;
  }

  // メッセージリスナーの設定
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'CURRENCY_PAIR_UPDATE':
          updateCurrencyPair(message.data);
          break;
        case 'UPDATE_SIDEPANEL':
          if (message.data.currencyPair) {
            updateCurrencyPair(message.data.currencyPair);
          }
          break;
      }

      sendResponse({ received: true });
      return true;
    });
  }

  // 初期データをcontent scriptから取得
  async function requestInitialData() {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000;

    const tryGetData = async () => {
      try {
        const tab = await getBubingaTab();
        if (tab) {
          return new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_INITIAL_DATA' }, (response) => {
              if (chrome.runtime.lastError) {
                resolve(null);
                return;
              }
              if (response) {
                if (response.currencyPair) updateCurrencyPair(response.currencyPair);
                resolve(response);
              } else {
                resolve(null);
              }
            });
          });
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    while (retryCount < maxRetries) {
      const result = await tryGetData();
      if (result && result.currencyPair && result.currencyPair !== '検出中...') {
        return;
      }
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
  }

  // 通貨ペアを更新
  function updateCurrencyPair(pair) {
    if (pair && pair !== currentCurrencyPair) {
      // 前の通貨ペアの統計・収支を保存
      if (currentCurrencyPair && currentCurrencyPair !== '検出中...' && currentCurrencyPair !== '--') {
        allStats[currentCurrencyPair] = { ...stats };
        chrome.storage.local.set({ 'yajirushi_stats_all': allStats });
        allBalances[currentCurrencyPair] = { ...balance };
        chrome.storage.local.set({ 'yajirushi_balance_all': allBalances });
      }

      currentCurrencyPair = pair;
      elements.currencyPair.textContent = pair;

      // 新しい通貨ペアの統計・収支を読み込み
      loadStatsForCurrentPair();
      loadBalanceForCurrentPair();
    }
  }

  // 接続状態を更新
  function updateConnectionStatus(status) {
    const statusDot = elements.connectionStatus.querySelector('.status-dot');
    const statusText = elements.connectionStatus.querySelector('.connection-text');

    if (!statusDot || !statusText) return;

    statusDot.classList.remove('connected', 'error');

    switch (status) {
      case 'connected':
        statusDot.classList.add('connected');
        statusText.textContent = 'Bubingaに接続中';
        break;
      case 'error':
        statusDot.classList.add('error');
        statusText.textContent = '接続エラー';
        break;
      default:
        statusText.textContent = '接続中...';
    }
  }

  // 音を鳴らす
  function playSound(type) {
    // 音量がOFFなら何もしない
    if (soundLevel === 'off') return;

    const volume = soundVolumes[soundLevel] || 0.6;

    try {
      if (type === 'signal') {
        // 事前に初期化されたオーディオがあれば使用、なければ新規作成
        if (alertAudio) {
          // currentTimeを0にリセットして再生
          alertAudio.currentTime = 0;
          alertAudio.volume = volume;
          alertAudio.play().catch((e) => {
            console.error('Alert audio play error:', e);
            // フォールバック: 新規作成して再生
            const newAudio = new Audio(chrome.runtime.getURL('voice/alert.wav'));
            newAudio.volume = volume;
            newAudio.play().catch(() => {});
          });
        } else {
          const audio = new Audio(chrome.runtime.getURL('voice/alert.wav'));
          audio.volume = volume;
          audio.play().catch((e) => {
            console.error('Audio play error:', e);
          });
        }
      } else {
        // AudioContextを使用した効果音
        const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        // suspendedならresumeを試みる
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // 音量設定を適用
        const baseGain = volume;

        switch (type) {
          case 'entry':
            oscillator.frequency.value = 1046.5;
            gainNode.gain.value = 0.3 * baseGain;
            break;
          case 'complete':
            oscillator.frequency.value = 523.25;
            gainNode.gain.value = 0.2 * baseGain;
            break;
          case 'win':
            // 勝利音（高い音2回）
            oscillator.frequency.value = 1318.5; // E6
            gainNode.gain.value = 0.4 * baseGain;
            break;
          case 'lose':
            // 敗北音（低い音）
            oscillator.frequency.value = 261.63; // C4
            gainNode.gain.value = 0.3 * baseGain;
            break;
        }

        oscillator.type = 'sine';
        oscillator.start();

        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.error('playSound error:', e);
    }
  }

  // 初期化実行
  init();

  } // initializeApp関数の終わり
})();
