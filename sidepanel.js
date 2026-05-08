/**
 * Side Panel JavaScript - Material Design 3
 * Professional Trading Interface
 */

// デバッグモード（本番ではfalse）
const DEBUG_MODE = false;

// デバッグ用ログ関数
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => {};

// 時間枠設定
const TIMEFRAME_CONFIGS = {
  15: { label: '15秒', interval: 5000, dataWindow: 30000 },
  30: { label: '30秒', interval: 5000, dataWindow: 45000 },
  60: { label: '60秒', interval: 10000, dataWindow: 60000 },
  180: { label: '3分', interval: 15000, dataWindow: 120000 },
  300: { label: '5分', interval: 20000, dataWindow: 180000 }
};

// 現在の設定
let currentSettings = {
  alertSoundMode: 'off', // 'off' | 'tech' | 'ai' | 'both'
  alertSoundType: '01',
  volume: 'medium',
  fontSize: 'medium',
  similarityThreshold: 70,
  dataLimit: 'all',
  timeFilterMode: 'all', // 'all' | 'session'
  momentumFilterLevel: 2,  // v5.10.6: 0=OFF, 1=弱, 2=中, 3=強
  pricePositionFilterLevel: 2,  // v5.12.4: 0=OFF, 1=弱, 2=中, 3=強
  signalMode: 'majority',  // 'majority'（多数決モード）| 'standard'（標準モード）
  // 自動バックアップ設定 (5日固定の起動時催促方式)
  autoBackupEnabled: false,        // 起動時の催促 ON/OFF
  lastBackupTime: 0,               // 最終バックアップ時刻 (UNIXタイムスタンプ ms)
  backupConsentShown: false        // 初回ウェルカムダイアログ表示済みフラグ
};

const BACKUP_INTERVAL_DAYS = 5; // 5日固定

// 状態管理
let currentTimeframe = 60;
let latestAnalysisData = null;
let latestEnhancedSignal = null;  // 強化シグナル情報
let expandedCards = new Set(['tech-card', 'ai-card']); // デフォルトで展開

// チカチカ防止用の前回値
let lastMLStats = { dataCountWithResults: null, dataCount: null, learningLevel: null };
let lastAISignal = { signal: null, matchCount: null, available: null };
let lastTechSignal = { signal: null, confidence: null };
// データカウントは常に増加のみ許可（チカチカ防止）
let highestMLDataCount = 0;
// データ整理中フラグ（整理完了までUI更新を抑制）
let isTrimmingData = false;
// シグナル表示状態の追跡（シグナル消失防止）
let signalDisplayed = false;  // シグナルが一度表示されたかどうか
let lastDisplayedSignal = null;  // 最後に表示されたシグナル
let latestSignal20 = null;  // v5.9.2: 最新の20インジケータ多数決データ

// v5.6.5: AI予測詳細の表示保持用（取引終了までデータを保持）
let lastValidAICardData = null;  // 最後に有効だったAI予測詳細データ
let isInTrading = false;  // 取引中フラグ

// v5.6.6: AI予測詳細のロック機構（シグナル表示後は値を固定）
let aiPredictionLock = {
  isLocked: false,           // ロック状態
  lockedData: null,          // ロックされたデータ（upRate, downRate, matchCount, stratification）
  lockTime: 0,               // ロック開始時刻
  lastCountdown: 0           // ロック時のカウントダウン値
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  debugLog('[SidePanel] Material Design 3 インターフェース初期化 (v5.6.5)');

  loadSettings();
  setupEventListeners();
  listenForAnalysisUpdates();
  listenForStorageChanges();

  // 初期状態でシグナルカードを「準備中」にする
  resetSignalCardsToWaiting();

  // v5.9.3: Signal20データを2秒ごとにポーリング（確実な更新）
  startSignal20Polling();

  // マーケット概況カードはデフォルトで展開
  const techCard = document.getElementById('tech-card');
  if (techCard) {
    techCard.classList.add('expanded');
    expandedCards.add('tech-card');
  }

  // 初期データ取得
  chrome.storage.local.get(['sidepanel_asset', 'sidepanel_dataCount'], (result) => {
    if (result.sidepanel_asset) {
      document.getElementById('asset-name-display').textContent = result.sidepanel_asset;
    }
    if (result.sidepanel_dataCount !== undefined) {
      document.getElementById('asset-data-count').textContent = `${result.sidepanel_dataCount}件`;
    }
  });

  // v5.6.4: 常にアクティブ状態で開始（待機画面を使わない）
  showActiveState();
  updateStatus('connected', 'データ受信中');
  // v5.10.2: 初回のみ時間枠を同期（以降はselectTimeframeで送信）
  chrome.runtime.sendMessage({ type: 'TIMEFRAME_CHANGED', timeframe: currentTimeframe });
  requestAnalysisData();

  // 定期的にデータを要求
  setInterval(requestAnalysisData, 2000);

  // カードの初期展開状態を適用
  expandedCards.forEach(cardId => {
    const card = document.getElementById(cardId);
    if (card) card.classList.add('expanded');
  });

  // 強制リロードボタン
  const forceReloadBtn = document.getElementById('force-reload-button');
  if (forceReloadBtn) {
    forceReloadBtn.addEventListener('click', () => {
      const svgIcon = forceReloadBtn.querySelector('svg');
      if (svgIcon) svgIcon.style.animation = 'spin 1s linear infinite';
      chrome.runtime.sendMessage({ type: 'FORCE_RELOAD' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          if (svgIcon) svgIcon.style.animation = '';
          alert('リロード失敗: TheOptionのタブが見つかりません');
        }
        // タブリロード後、サイドパネル自体もリセット
        setTimeout(() => {
          location.reload();
        }, 1500);
      });
    });
  }

});

// v5.6.4: visibilitychange監視は削除（不要）
// bubinga_systemパターン: 状態管理を行わず、常にアクティブで動作

// ストレージ変更監視
function listenForStorageChanges() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.sidepanel_asset?.newValue) {
      const newAsset = changes.sidepanel_asset.newValue;
      document.getElementById('asset-name-display').textContent = newAsset;

      // 通貨ペア変更時: highestMLDataCountをリセットして新しい通貨ペアのデータを即座に読み込む
      highestMLDataCount = 0;
      loadMLDataCountForAsset(newAsset);
    }
    if (changes.sidepanel_dataCount?.newValue !== undefined) {
      document.getElementById('asset-data-count').textContent = `${changes.sidepanel_dataCount.newValue}件`;
    }
  });
}

// 通貨ペア変更時にストレージからデータ件数を即座に読み込む
async function loadMLDataCountForAsset(assetName) {
  try {
    const storageKey = `theoption_ml_${assetName.replace('/', '_')}`;
    const result = await chrome.storage.local.get(storageKey);
    const data = result[storageKey];
    const count = Array.isArray(data) ? data.length : 0;

    // highestMLDataCountを更新
    highestMLDataCount = count;

    // UI更新
    const dataCountEl = document.getElementById('ml-data-count');
    const countBadge = document.getElementById('ml-count-badge');
    const progressBar = document.getElementById('ml-progress-bar');
    const countText = count.toLocaleString();

    if (dataCountEl) dataCountEl.textContent = countText;
    if (countBadge) countBadge.textContent = `${countText}件`;
    if (progressBar) {
      const progressPercent = Math.min(100, (count / 25000) * 100);
      progressBar.style.width = `${progressPercent}%`;
    }

    // 学習レベルも更新
    const learningLevelEl = document.getElementById('ml-learning-level');
    if (learningLevelEl) {
      const learningLevel = Math.min(100, Math.round((count / 25000) * 100));
      learningLevelEl.textContent = learningLevel;
    }

    debugLog(`[SidePanel] 通貨ペア変更: ${assetName} → ${count}件読み込み`);
  } catch (error) {
    console.error('[SidePanel] ML data load error:', error);
  }
}

// 設定読み込み
function loadSettings() {
  chrome.storage.local.get(['alertSoundMode', 'alertSoundEnabled', 'alertVolume', 'alertSoundType', 'fontSize', 'similarityThreshold', 'dataLimit', 'timeFilterMode', 'momentumFilterLevel', 'pricePositionFilterLevel', 'signalMode'], (result) => {
    // v5.8.20: alertSoundMode（新キー）を優先、旧alertSoundEnabledからのマイグレーション
    if (result.alertSoundMode) {
      currentSettings.alertSoundMode = result.alertSoundMode;
    } else if (result.alertSoundEnabled !== undefined) {
      // 旧設定からの移行: ON→'both', OFF→'off'
      currentSettings.alertSoundMode = result.alertSoundEnabled ? 'both' : 'off';
      chrome.storage.local.set({ alertSoundMode: currentSettings.alertSoundMode });
    }
    const modeSelect = document.getElementById('alert-sound-mode');
    if (modeSelect) modeSelect.value = currentSettings.alertSoundMode;
    if (result.alertVolume) {
      currentSettings.volume = result.alertVolume;
      document.getElementById('volume-select').value = result.alertVolume;
    }
    if (result.alertSoundType) {
      currentSettings.alertSoundType = result.alertSoundType;
      document.getElementById('alert-sound-select').value = result.alertSoundType;
    }
    if (result.fontSize) {
      currentSettings.fontSize = result.fontSize;
      document.getElementById('font-size-select').value = result.fontSize;
      applyFontSize(result.fontSize);
    }
    if (result.similarityThreshold) {
      currentSettings.similarityThreshold = result.similarityThreshold;
      updateThresholdChips(result.similarityThreshold);
    }
    // dataLimitはnull（全期間）または数値で保存されている
    // UIチップ用に文字列に変換（null → 'all', 500 → '500'）
    let dataLimit;
    if (result.dataLimit === null || result.dataLimit === undefined) {
      dataLimit = 'all';
    } else if (typeof result.dataLimit === 'string' && result.dataLimit === 'all') {
      // 後方互換性：古い形式の'all'文字列
      dataLimit = 'all';
    } else {
      dataLimit = String(result.dataLimit);
    }
    currentSettings.dataLimit = dataLimit;
    updateDataLimitChips(dataLimit);

    // 時間帯フィルタモード
    if (result.timeFilterMode) {
      currentSettings.timeFilterMode = result.timeFilterMode;
      updateTimeFilterChips(result.timeFilterMode);
      // v5.6.4: 初期化時にも時間帯ラベルを表示
      updateTimeFilterInfo();
      // v5.6.4: 初期化時にコンテンツスクリプトにも通知
      notifySettingChange('timeFilterMode', result.timeFilterMode);
    }

    // v5.10.6: モメンタムフィルタ初期化
    if (result.momentumFilterLevel !== undefined) {
      currentSettings.momentumFilterLevel = result.momentumFilterLevel;
    }
    // 設定画面のselectを初期化
    const filterSelect = document.getElementById('momentum-filter-select');
    if (filterSelect) filterSelect.value = String(currentSettings.momentumFilterLevel);
    // 起動時にコンテンツスクリプトにも通知
    chrome.runtime.sendMessage({ type: 'SET_MOMENTUM_FILTER', level: currentSettings.momentumFilterLevel });

    // v5.12.4: 急変フィルタ初期化
    if (result.pricePositionFilterLevel !== undefined) {
      currentSettings.pricePositionFilterLevel = result.pricePositionFilterLevel;
    }
    const ppFilterSelect = document.getElementById('price-position-filter-select');
    if (ppFilterSelect) ppFilterSelect.value = String(currentSettings.pricePositionFilterLevel);
    chrome.runtime.sendMessage({ type: 'SET_PRICE_POSITION_FILTER', level: currentSettings.pricePositionFilterLevel });

    // シグナルモード初期化
    if (result.signalMode) {
      currentSettings.signalMode = result.signalMode;
    }
    const signalModeSelect = document.getElementById('signal-mode-select');
    if (signalModeSelect) signalModeSelect.value = currentSettings.signalMode;
    updateSignalModeBadge(currentSettings.signalMode);
    updateSignalModeUI(currentSettings.signalMode);
    // 起動時にコンテンツスクリプトにも通知
    chrome.runtime.sendMessage({ type: 'SET_SIGNAL_MODE', mode: currentSettings.signalMode });

    // v5.6.5: データ範囲のヒントを初期化
    updateDataLimitHint(dataLimit);
  });

  // 自動バックアップ設定の読み込み
  loadAutoBackupSettings();
}

// 自動バックアップ設定の読み込み
function loadAutoBackupSettings() {
  chrome.storage.local.get([
    'autoBackupEnabled',
    'lastBackupTime',
    'backupConsentShown',
    'forceShowBackupPrompt'
  ], (result) => {
    currentSettings.autoBackupEnabled = result.autoBackupEnabled === true;
    currentSettings.lastBackupTime = result.lastBackupTime || 0;
    currentSettings.backupConsentShown = result.backupConsentShown === true;

    // UIに反映
    const toggle = document.getElementById('auto-backup-toggle');
    if (toggle) {
      toggle.classList.toggle('active', currentSettings.autoBackupEnabled);
    }
    updateBackupTimeDisplay();

    // 拡張機能リロード後の強制表示フラグをチェック
    const forceShow = result.forceShowBackupPrompt === true;
    if (forceShow) {
      // フラグを消費 (1回限り)
      chrome.storage.local.remove('forceShowBackupPrompt');
    }

    // 起動時に催促判定 (少し遅延させて初期化を待つ)
    setTimeout(() => checkAndShowBackupPrompt(forceShow), 1500);
  });
}

// 起動時の催促判定: 5日経過 & 自動催促ON & 未通知ならモーダル表示
// @param {boolean} force - true の場合、5日判定をスキップして強制表示 (拡張機能リロード時など)
function checkAndShowBackupPrompt(force = false) {
  if (!currentSettings.autoBackupEnabled) return;

  // このセッションで既に表示したかチェック (sessionStorage相当)
  if (sessionStorage.getItem('backupPromptShown') === '1') {
    return;
  }

  if (!force) {
    const now = Date.now();
    const lastBackup = currentSettings.lastBackupTime || 0;
    const intervalMs = BACKUP_INTERVAL_DAYS * 24 * 3600 * 1000;

    // 最終バックアップから5日経過しているかチェック
    // lastBackupTime=0(未実施)の場合も催促対象
    if (lastBackup > 0 && (now - lastBackup) < intervalMs) {
      return; // まだ催促タイミングではない
    }
  }

  showBackupPromptDialog();
}

// 催促モーダル表示
function showBackupPromptDialog() {
  const overlay = document.getElementById('backup-prompt-overlay');
  const dialog = document.getElementById('backup-prompt-dialog');
  const messageEl = document.getElementById('backup-prompt-message');

  if (!overlay || !dialog) return;

  // メッセージカスタマイズ(初回 or 経過日数表示)
  if (currentSettings.lastBackupTime === 0) {
    messageEl.innerHTML = 'コミュニティバックアップに参加しましょう。<br>あなたのデータが他のユーザーの役に立ちます。';
  } else {
    const daysAgo = Math.floor((Date.now() - currentSettings.lastBackupTime) / (24 * 3600 * 1000));
    messageEl.innerHTML = `前回のバックアップから${daysAgo}日が経過しました。<br>データをバックアップしますか？`;
  }

  overlay.style.display = 'block';
  dialog.style.display = 'block';

  sessionStorage.setItem('backupPromptShown', '1');
}

// 催促モーダルを閉じる
function closeBackupPromptDialog() {
  document.getElementById('backup-prompt-overlay').style.display = 'none';
  document.getElementById('backup-prompt-dialog').style.display = 'none';
}

// 最終バックアップの表示更新
function updateBackupTimeDisplay() {
  const lastEl = document.getElementById('last-backup-time');
  if (lastEl) {
    if (currentSettings.lastBackupTime > 0) {
      lastEl.textContent = formatBackupDateTime(currentSettings.lastBackupTime);
    } else {
      lastEl.textContent = '未実施';
    }
  }
}

// バックアップ日時のフォーマット (例: "2026-05-15 14:30")
function formatBackupDateTime(timestamp) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// イベントリスナー設定
function setupEventListeners() {
  // 設定ボトムシート
  document.getElementById('settings-button').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', closeSettings);

  // ダウンロードボトムシート
  document.getElementById('download-button').addEventListener('click', openDownload);
  document.getElementById('close-download').addEventListener('click', closeDownload);
  document.getElementById('download-overlay').addEventListener('click', closeDownload);

  // ダウンロードメニュー項目
  document.getElementById('download-ml-data').addEventListener('click', () => requestDownload('ML_DATA'));
  document.getElementById('download-predictions').addEventListener('click', () => requestDownload('PREDICTIONS'));
  document.getElementById('download-trends').addEventListener('click', () => requestDownload('TRENDS'));
  document.getElementById('import-json').addEventListener('click', () => requestDownload('IMPORT_JSON'));

  // シグナルモード設定
  document.getElementById('signal-mode-select').addEventListener('change', (e) => {
    currentSettings.signalMode = e.target.value;
    chrome.storage.local.set({ signalMode: e.target.value });
    chrome.runtime.sendMessage({ type: 'SET_SIGNAL_MODE', mode: e.target.value });
    updateSignalModeBadge(e.target.value);
    updateSignalModeUI(e.target.value);
    // モード切替時にシグナル表示状態をリセット（前モードのシグナルが残るのを防止）
    signalDisplayed = false;
    lastDisplayedSignal = null;
    latestSignal20 = null;
    lastTechSignal = { signal: null, confidence: null };
    lastAISignal = { signal: null, matchCount: null, available: null };
  });

  // v5.10.6: モメンタムフィルタ設定（設定画面内）
  document.getElementById('momentum-filter-select').addEventListener('change', (e) => {
    const level = parseInt(e.target.value);
    currentSettings.momentumFilterLevel = level;
    chrome.storage.local.set({ momentumFilterLevel: level });
    chrome.runtime.sendMessage({ type: 'SET_MOMENTUM_FILTER', level: level });
  });

  // v5.12.4: 急変フィルタ設定
  document.getElementById('price-position-filter-select').addEventListener('change', (e) => {
    const level = parseInt(e.target.value);
    currentSettings.pricePositionFilterLevel = level;
    chrome.storage.local.set({ pricePositionFilterLevel: level });
    chrome.runtime.sendMessage({ type: 'SET_PRICE_POSITION_FILTER', level: level });
  });

  // アラート音モード選択
  document.getElementById('alert-sound-mode').addEventListener('change', (e) => {
    currentSettings.alertSoundMode = e.target.value;
    chrome.storage.local.set({ alertSoundMode: e.target.value });
  });

  // 音量設定
  document.getElementById('volume-select').addEventListener('change', (e) => {
    currentSettings.volume = e.target.value;
    chrome.storage.local.set({ alertVolume: e.target.value });
  });

  // アラート音の種類選択
  document.getElementById('alert-sound-select').addEventListener('change', (e) => {
    currentSettings.alertSoundType = e.target.value;
    chrome.storage.local.set({ alertSoundType: e.target.value });
  });

  // 試聴ボタン
  document.getElementById('test-sound-button').addEventListener('click', () => {
    playAlertSound(currentSettings.alertSoundType, currentSettings.volume);
  });

  // フォントサイズ設定
  document.getElementById('font-size-select').addEventListener('change', (e) => {
    currentSettings.fontSize = e.target.value;
    applyFontSize(e.target.value);
    chrome.storage.local.set({ fontSize: e.target.value });
  });

  // 時間枠チップ
  document.querySelectorAll('.timeframe-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const timeframe = parseInt(chip.dataset.timeframe);
      selectTimeframe(timeframe);
    });
  });

  // 展開可能カード
  ['tech', 'ai', 'ml'].forEach(prefix => {
    const header = document.getElementById(`${prefix}-header`);
    const card = document.getElementById(`${prefix}-card`);
    if (header && card) {
      header.addEventListener('click', () => toggleCard(card));
    }
  });

  // 20インジケータ多数決カードの展開/折りたたみ
  const indicatorDebugHeader = document.getElementById('indicator-debug-header');
  const indicatorDebugPanel = document.getElementById('indicator-debug-panel');
  if (indicatorDebugHeader && indicatorDebugPanel) {
    indicatorDebugHeader.addEventListener('click', () => {
      indicatorDebugPanel.classList.toggle('expanded');
    });
  }

  // 類似度閾値チップ
  document.querySelectorAll('#threshold-chips .setting-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const threshold = parseInt(chip.dataset.threshold);
      changeSimilarityThreshold(threshold);
    });
  });

  // データ範囲チップ
  document.querySelectorAll('#data-limit-chips .setting-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const limit = chip.dataset.limit;
      changeDataLimit(limit);
    });
  });

  // 時間帯フィルタチップ
  document.querySelectorAll('#time-filter-chips .setting-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.mode;
      changeTimeFilterMode(mode);
    });
  });

  // v5.10.4: データ整理ボタン
  document.getElementById('ml-trim-btn').addEventListener('click', executeTrimData);

  // 通貨ペア別データ状況モーダル
  document.getElementById('ml-detail-btn').addEventListener('click', openAssetDataModal);
  document.getElementById('close-asset-data').addEventListener('click', closeAssetDataModal);
  document.getElementById('asset-data-overlay').addEventListener('click', closeAssetDataModal);

  // 時間帯バッジクリックで時間帯別データ詳細モーダルを開く
  document.getElementById('time-filter-badge').addEventListener('click', (e) => {
    e.stopPropagation(); // カードヘッダーのクリックイベントを防止
    openSessionDataModal();
  });
  document.getElementById('close-session-data').addEventListener('click', closeSessionDataModal);
  document.getElementById('session-data-overlay').addEventListener('click', closeSessionDataModal);

  // 自動バックアップ催促: ON/OFFトグル
  const autoBackupToggle = document.getElementById('auto-backup-toggle');
  if (autoBackupToggle) {
    autoBackupToggle.addEventListener('click', handleAutoBackupToggle);
  }

  // 手動バックアップボタン
  const manualBtn = document.getElementById('manual-backup-button');
  if (manualBtn) {
    manualBtn.addEventListener('click', handleManualBackup);
  }

  // 通貨ペア選択モーダル(手動・催促共通)
  const closeAssetsBtn = document.getElementById('close-backup-assets');
  if (closeAssetsBtn) {
    closeAssetsBtn.addEventListener('click', closeBackupAssetsModal);
  }
  const assetsOverlay = document.getElementById('backup-assets-overlay');
  if (assetsOverlay) {
    assetsOverlay.addEventListener('click', closeBackupAssetsModal);
  }
  const selectAllBtn = document.getElementById('backup-assets-select-all');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('#backup-assets-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
  }
  const deselectAllBtn = document.getElementById('backup-assets-deselect-all');
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
      document.querySelectorAll('#backup-assets-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
  }
  const saveBtn = document.getElementById('backup-assets-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveBackupAssetsSelection);
  }

  // 催促モーダルのボタン
  const promptLater = document.getElementById('backup-prompt-later');
  if (promptLater) {
    promptLater.addEventListener('click', closeBackupPromptDialog);
  }
  const promptExecute = document.getElementById('backup-prompt-execute');
  if (promptExecute) {
    promptExecute.addEventListener('click', () => {
      closeBackupPromptDialog();
      openBackupAssetsModal();
    });
  }
}

// 設定パネル開閉
function openSettings() {
  document.getElementById('settings-overlay').classList.add('active');
  document.getElementById('settings-sheet').classList.add('active');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('active');
  document.getElementById('settings-sheet').classList.remove('active');
}

// ダウンロードメニュー
function openDownload() {
  document.getElementById('download-overlay').classList.add('active');
  document.getElementById('download-sheet').classList.add('active');
}

function closeDownload() {
  document.getElementById('download-overlay').classList.remove('active');
  document.getElementById('download-sheet').classList.remove('active');
}

// 通貨ペア別データモーダル
function openAssetDataModal() {
  document.getElementById('asset-data-overlay').classList.add('active');
  document.getElementById('asset-data-sheet').classList.add('active');
  loadAssetDataList();
}

function closeAssetDataModal() {
  document.getElementById('asset-data-overlay').classList.remove('active');
  document.getElementById('asset-data-sheet').classList.remove('active');
}

// 時間帯別データモーダル
function openSessionDataModal() {
  document.getElementById('session-data-overlay').classList.add('active');
  document.getElementById('session-data-sheet').classList.add('active');
  loadSessionDataList();
}

function closeSessionDataModal() {
  document.getElementById('session-data-overlay').classList.remove('active');
  document.getElementById('session-data-sheet').classList.remove('active');
}

// 時間帯別データを読み込み
async function loadSessionDataList() {
  const contentEl = document.getElementById('session-data-content');
  contentEl.innerHTML = '<div class="session-data-loading"><span>読み込み中...</span></div>';

  try {
    // コンテンツスクリプト経由でIndexedDBから時間帯別データを取得
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_SESSION_DATA_COUNT' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    const sessionCounts = response?.sessionCounts || {};
    const totalCount = response?.totalCount || 0;
    const currentSession = response?.currentSession || '';
    const assetName = response?.assetName || '';

    // モーダルタイトルを通貨ペア名付きに更新
    const titleEl = document.querySelector('#session-data-sheet .bottom-sheet-title');
    if (titleEl) {
      titleEl.textContent = assetName ? `🕐 ${assetName} 時間帯別データ` : '🕐 時間帯別データ件数';
    }

    // 時間帯の定義
    const sessions = [
      { key: 'tokyo', name: '東京時間', time: '9:00 - 15:59', icon: '🇯🇵' },
      { key: 'europe', name: '欧州時間', time: '16:00 - 20:59', icon: '🇪🇺' },
      { key: 'ny', name: 'NY時間', time: '21:00 - 2:59', icon: '🇺🇸' },
      { key: 'quiet', name: '静穏時間', time: '3:00 - 8:59', icon: '🌙' }
    ];

    // HTMLを構築
    let html = '<div class="session-data-list">';

    for (const session of sessions) {
      const count = sessionCounts[session.key] || 0;
      const isCurrent = session.key === currentSession;

      html += `
        <div class="session-data-item${isCurrent ? ' current' : ''}">
          <div class="session-info">
            <span class="session-name">${session.icon} ${session.name}</span>
            <span class="session-time">${session.time}</span>
          </div>
          <span class="session-count">${count.toLocaleString()}件</span>
        </div>
      `;
    }

    html += '</div>';

    // 合計
    html += `
      <div class="session-total">
        <span class="session-total-label">合計データ数</span>
        <span class="session-total-count">${totalCount.toLocaleString()}件</span>
      </div>
    `;

    contentEl.innerHTML = html;

  } catch (error) {
    console.error('[SidePanel] 時間帯別データ取得エラー:', error);
    contentEl.innerHTML = `
      <div class="session-data-loading">
        <span>データを取得できません</span>
        <span style="font-size: 11px; margin-top: 8px;">TheOptionページでトレードを開始してください</span>
      </div>
    `;
  }
}

// 通貨ペア別データを読み込み（IndexedDBから取得）
async function loadAssetDataList() {
  const contentEl = document.getElementById('asset-data-content');
  contentEl.innerHTML = '<div class="asset-data-loading"><span>読み込み中...</span></div>';

  try {
    // コンテンツスクリプト経由でIndexedDBからデータを取得
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_ASSET_DATA_LIST' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    const assetDataMap = response?.assetDataMap || {};
    const totalCount = response?.totalCount || 0;
    const currentAsset = response?.currentAsset || '';

    // データがない場合
    if (Object.keys(assetDataMap).length === 0) {
      contentEl.innerHTML = `
        <div class="asset-data-empty">
          <span class="asset-data-empty-icon">📭</span>
          <span>まだデータがありません</span>
          <span style="font-size: 12px;">TheOptionでトレードすると自動的に収集されます</span>
        </div>
      `;
      return;
    }

    // 件数でソート（降順）
    const sortedAssets = Object.entries(assetDataMap)
      .sort((a, b) => b[1] - a[1]);

    // 最大件数（プログレスバー計算用）
    const maxCount = Math.max(...Object.values(assetDataMap), 1);

    // HTMLを構築
    let html = `
      <div class="asset-data-summary">
        <div class="asset-data-summary-item">
          <span class="asset-data-summary-value">${sortedAssets.length}</span>
          <span class="asset-data-summary-label">通貨ペア</span>
        </div>
        <div class="asset-data-summary-item">
          <span class="asset-data-summary-value">${totalCount.toLocaleString()}</span>
          <span class="asset-data-summary-label">総データ数</span>
        </div>
      </div>
      <div class="asset-data-bulk-actions">
        <button class="bulk-delete-btn" id="bulk-delete-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          一括削除
        </button>
      </div>
      <div class="asset-data-list">
    `;

    for (const [assetName, count] of sortedAssets) {
      const isCurrent = assetName === currentAsset;
      const percent = Math.round((count / 25000) * 100);
      const barWidth = Math.min(100, (count / maxCount) * 100);
      const sanitizedId = assetName.replace(/\//g, '-');

      // 通貨ペアのアイコンを決定
      let icon = '💱';
      if (assetName.includes('BTC') || assetName.includes('ETH')) {
        icon = '₿';
      } else if (assetName.includes('JPY')) {
        icon = '¥';
      } else if (assetName.includes('USD')) {
        icon = '$';
      } else if (assetName.includes('EUR')) {
        icon = '€';
      } else if (assetName.includes('GBP')) {
        icon = '£';
      }

      html += `
        <div class="asset-data-item ${isCurrent ? 'current' : ''}">
          <div class="asset-data-row" data-asset="${assetName}">
            <div class="asset-data-icon">${icon}</div>
            <div class="asset-data-info">
              <span class="asset-data-name">${assetName}${isCurrent ? ' (現在)' : ''}</span>
              <span class="asset-data-count">${count.toLocaleString()}件</span>
            </div>
            <div class="asset-data-bar-container">
              <div class="asset-data-bar" style="width: ${barWidth}%"></div>
            </div>
            <span class="asset-data-percent">${percent}%</span>
            <span class="asset-data-expand-icon">▶</span>
          </div>
          <div class="asset-hour-detail" id="hour-detail-${sanitizedId}" style="display: none;">
            <div class="hour-grid-loading">読み込み中...</div>
          </div>
        </div>
      `;
    }

    html += '</div>';
    contentEl.innerHTML = html;

    // v5.8.19: イベントリスナー設定
    contentEl.querySelectorAll('.asset-data-row').forEach(row => {
      row.addEventListener('click', () => {
        toggleAssetHourDetail(row.dataset.asset);
      });
    });

    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', openBulkDeletePanel);
    }

  } catch (error) {
    console.error('[SidePanel] 通貨ペア別データ取得エラー:', error);
    contentEl.innerHTML = `
      <div class="asset-data-empty">
        <span class="asset-data-empty-icon">⚠️</span>
        <span>データの取得に失敗しました</span>
      </div>
    `;
  }
}

// ========================================
// v5.8.19: 時間帯別データ削除UI
// ========================================

// 時間からセッションCSSクラスを取得
function getSessionClassForHour(hour) {
  if (hour >= 9 && hour <= 15) return 'session-tokyo';
  if (hour >= 16 && hour <= 20) return 'session-europe';
  if (hour >= 21 || hour <= 2) return 'session-ny';
  return 'session-quiet';
}

// 通貨ペア行をクリックで展開/閉じ
async function toggleAssetHourDetail(assetName) {
  const sanitizedId = assetName.replace(/\//g, '-');
  const detailEl = document.getElementById(`hour-detail-${sanitizedId}`);
  if (!detailEl) return;
  const expandIcon = detailEl.parentElement.querySelector('.asset-data-expand-icon');

  if (detailEl.style.display === 'none') {
    detailEl.style.display = 'block';
    if (expandIcon) expandIcon.textContent = '▼';
    detailEl.innerHTML = '<div class="hour-grid-loading">読み込み中...</div>';

    try {
      // 月別データと時間帯データを並行取得
      const [monthlyResp, hourlyResp] = await Promise.all([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'GET_MONTHLY_COUNTS', assetName }, (resp) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(resp);
          });
        }),
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'GET_HOURLY_COUNTS', assetName }, (resp) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(resp);
          });
        })
      ]);

      // 月別内訳 + 時間帯グリッドの順で表示
      detailEl.innerHTML = '';
      if (monthlyResp?.success && monthlyResp.counts) {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'month-breakdown';
        renderMonthlyBreakdown(monthDiv, assetName, monthlyResp.counts);
        detailEl.appendChild(monthDiv);
      }
      if (!hourlyResp?.error) {
        const hourDiv = document.createElement('div');
        renderHourGrid(hourDiv, assetName, hourlyResp.hourlyCounts);
        detailEl.appendChild(hourDiv);
      }
    } catch (error) {
      console.error('[SidePanel] データ取得エラー:', error);
      detailEl.innerHTML = '<div class="hour-grid-error">取得に失敗しました</div>';
    }
  } else {
    detailEl.style.display = 'none';
    if (expandIcon) expandIcon.textContent = '▶';
  }
}

// v5.10.4: 月別データ内訳を描画
function renderMonthlyBreakdown(container, assetName, monthlyCounts) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // 新しい順にソート
  const sorted = Object.entries(monthlyCounts).sort((a, b) => b[0].localeCompare(a[0]));
  if (sorted.length === 0) {
    container.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:#999;">データなし</div>';
    return;
  }

  const maxCount = Math.max(...sorted.map(([, c]) => c));
  let html = '<div style="padding:4px 12px 2px;font-size:11px;font-weight:600;color:var(--md-sys-color-on-surface-variant);">月別データ内訳</div>';

  for (const [yearMonth, count] of sorted) {
    const [y, m] = yearMonth.split('-');
    const label = `${y}年${parseInt(m)}月`;
    const freshness = yearMonth === currentMonth ? 'fresh' : yearMonth === lastMonth ? 'recent' : 'old';
    const barWidth = Math.round((count / maxCount) * 100);

    html += `
      <div class="month-row" data-asset="${assetName}" data-month="${yearMonth}" data-count="${count}">
        <span class="month-indicator ${freshness}"></span>
        <span class="month-label">${label}</span>
        <span class="month-count">${count.toLocaleString()}件</span>
        <div class="month-bar-container">
          <div class="month-bar ${freshness}" style="width:${barWidth}%"></div>
        </div>
      </div>
      <div class="month-delete-form" id="mdf-${assetName.replace(/\//g, '-')}-${yearMonth}" style="display:none;">
        <span>古い順に</span>
        <input type="number" min="1" max="${count}" value="${count}" />
        <span>件</span>
        <button class="month-delete-btn">削除</button>
      </div>
    `;
  }

  container.innerHTML = html;

  // 月行のクリックで削除フォームをトグル
  container.querySelectorAll('.month-row').forEach(row => {
    row.addEventListener('click', () => {
      const asset = row.dataset.asset;
      const month = row.dataset.month;
      const formId = `mdf-${asset.replace(/\//g, '-')}-${month}`;
      const form = document.getElementById(formId);
      if (form) {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      }
    });
  });

  // 削除ボタンのクリック
  container.querySelectorAll('.month-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const form = btn.closest('.month-delete-form');
      const input = form.querySelector('input');
      const deleteCount = parseInt(input.value);
      if (!deleteCount || deleteCount < 1) return;

      // フォームIDからassetとmonthを復元
      const formId = form.id; // mdf-EUR-USD-2026-03
      const parts = formId.replace('mdf-', '').split('-');
      const yearMonth = `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
      const assetParts = parts.slice(0, parts.length - 2);
      const assetNameFromId = assetParts.join('/');

      btn.disabled = true;
      btn.textContent = '削除中...';

      try {
        const resp = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'DELETE_BY_MONTH',
            assetName: assetNameFromId,
            yearMonth,
            count: deleteCount
          }, (r) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(r);
          });
        });

        if (resp?.success) {
          highestMLDataCount = 0; // UI更新を許可
          // 月別データを再取得して再描画
          const refreshResp = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'GET_MONTHLY_COUNTS', assetName: assetNameFromId }, (r) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(r);
            });
          });
          if (refreshResp?.success) {
            renderMonthlyBreakdown(container, assetNameFromId, refreshResp.counts);
          }
          // 通貨ペアリストも再読み込み
          loadAssetDataList();
        }
      } catch (err) {
        console.error('[SidePanel] 月別削除エラー:', err);
      }

      btn.disabled = false;
      btn.textContent = '削除';
    });
  });
}

// 24時間グリッドを描画
function renderHourGrid(containerEl, assetName, hourlyCounts) {
  const targetLabel = assetName || '全通貨ペア';

  let gridHtml = `
    <div class="hour-grid-header">
      <label class="hour-select-all">
        <input type="checkbox" class="hour-select-all-cb" data-asset="${assetName || 'all'}">
        <span>全選択</span>
      </label>
    </div>
    <div class="hour-grid">
  `;

  for (let h = 0; h < 24; h++) {
    const count = hourlyCounts[h] || 0;
    const hasData = count > 0;
    const sessionClass = getSessionClassForHour(h);

    gridHtml += `
      <label class="hour-cell ${sessionClass} ${hasData ? '' : 'no-data'}">
        <input type="checkbox" class="hour-cb" data-hour="${h}" data-asset="${assetName || 'all'}" ${hasData ? '' : 'disabled'}>
        <span class="hour-label">${h}時</span>
        <span class="hour-count">${count.toLocaleString()}</span>
      </label>
    `;
  }

  gridHtml += `
    </div>
    <div class="hour-session-legend">
      <span class="legend-tokyo">東京</span>
      <span class="legend-europe">欧州</span>
      <span class="legend-ny">NY</span>
      <span class="legend-quiet">静穏</span>
    </div>
    <div class="hour-grid-actions">
      <button class="hour-delete-btn" data-asset="${assetName || ''}" disabled>
        削除 (<span class="hour-delete-count">0</span>件)
      </button>
    </div>
  `;

  containerEl.innerHTML = gridHtml;

  // 全選択チェックボックス
  const selectAllCb = containerEl.querySelector('.hour-select-all-cb');
  selectAllCb.addEventListener('change', (e) => {
    containerEl.querySelectorAll('.hour-cb:not(:disabled)').forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateHourDeleteButtonState(containerEl, hourlyCounts);
  });

  // 個別チェックボックス
  containerEl.querySelectorAll('.hour-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      updateHourDeleteButtonState(containerEl, hourlyCounts);
    });
  });

  // 削除ボタン
  const deleteBtn = containerEl.querySelector('.hour-delete-btn');
  deleteBtn.addEventListener('click', () => {
    const selectedHours = getSelectedHoursFromContainer(containerEl);
    if (selectedHours.length > 0) {
      showDeleteConfirmation(assetName, selectedHours, hourlyCounts);
    }
  });
}

// 選択された時間帯を取得
function getSelectedHoursFromContainer(containerEl) {
  const checked = containerEl.querySelectorAll('.hour-cb:checked');
  return Array.from(checked).map(cb => parseInt(cb.dataset.hour));
}

// 削除ボタンの状態更新
function updateHourDeleteButtonState(containerEl, hourlyCounts) {
  const selectedHours = getSelectedHoursFromContainer(containerEl);
  const totalSelected = selectedHours.reduce((sum, h) => sum + (hourlyCounts[h] || 0), 0);
  const deleteBtn = containerEl.querySelector('.hour-delete-btn');
  const countSpan = containerEl.querySelector('.hour-delete-count');
  if (deleteBtn) deleteBtn.disabled = selectedHours.length === 0;
  if (countSpan) countSpan.textContent = totalSelected.toLocaleString();
}

// 一括削除パネルを開閉
function openBulkDeletePanel() {
  const contentEl = document.getElementById('asset-data-content');
  const existingBulk = document.getElementById('bulk-hour-panel');

  if (existingBulk) {
    existingBulk.remove();
    return;
  }

  chrome.runtime.sendMessage(
    { type: 'GET_HOURLY_COUNTS', assetName: null },
    (response) => {
      if (chrome.runtime.lastError || response?.error) return;

      const panelEl = document.createElement('div');
      panelEl.id = 'bulk-hour-panel';
      panelEl.className = 'bulk-hour-panel';

      const bulkActions = contentEl.querySelector('.asset-data-bulk-actions');
      if (bulkActions && bulkActions.nextSibling) {
        contentEl.insertBefore(panelEl, bulkActions.nextSibling);
      } else {
        contentEl.appendChild(panelEl);
      }

      panelEl.innerHTML = '<div class="bulk-panel-title">全通貨ペア一括 - 時間帯選択</div>';
      const gridContainer = document.createElement('div');
      panelEl.appendChild(gridContainer);
      renderHourGrid(gridContainer, null, response.hourlyCounts);
    }
  );
}

// 削除確認ダイアログを表示
function showDeleteConfirmation(assetName, hours, hourlyCounts) {
  const totalToDelete = hours.reduce((sum, h) => sum + (hourlyCounts[h] || 0), 0);
  const hourLabels = hours.sort((a, b) => a - b).map(h => `${h}時`).join(', ');
  const target = assetName || '全通貨ペア';

  const messageEl = document.getElementById('delete-confirm-message');
  messageEl.textContent = `${target} の ${hourLabels} のデータ (${totalToDelete.toLocaleString()}件) を削除しますか？この操作は取り消せません。`;

  document.getElementById('delete-confirm-overlay').classList.add('active');
  document.getElementById('delete-confirm-dialog').classList.add('active');

  // ボタンのリスナーをリセット（cloneNode方式）
  const okBtn = document.getElementById('delete-confirm-ok');
  const cancelBtn = document.getElementById('delete-confirm-cancel');
  const overlay = document.getElementById('delete-confirm-overlay');

  const newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  newCancelBtn.addEventListener('click', closeDeleteConfirmation);
  overlay.onclick = closeDeleteConfirmation;

  newOkBtn.addEventListener('click', async () => {
    newOkBtn.disabled = true;
    newOkBtn.textContent = '削除中...';
    await executeHourDelete(assetName, hours);
    closeDeleteConfirmation();
  });
}

// 削除確認ダイアログを閉じる
function closeDeleteConfirmation() {
  document.getElementById('delete-confirm-overlay').classList.remove('active');
  document.getElementById('delete-confirm-dialog').classList.remove('active');
}

// 時間帯別データ削除を実行
async function executeHourDelete(assetName, hours) {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'DELETE_BY_HOURS', assetName: assetName, hours: hours },
        (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        }
      );
    });

    if (response?.error) throw new Error(response.error);

    debugLog(`[SidePanel] 削除完了: ${response.deletedCount}件`);

    // モーダルの内容を更新
    await loadAssetDataList();

  } catch (error) {
    console.error('[SidePanel] 削除エラー:', error);
  }
}

// ダウンロードリクエスト
function requestDownload(type) {
  debugLog('[SidePanel] ダウンロードリクエスト送信:', type);
  chrome.runtime.sendMessage({ type: 'REQUEST_DOWNLOAD', downloadType: type }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[SidePanel] メッセージ送信エラー:', chrome.runtime.lastError.message);
    } else {
      debugLog('[SidePanel] メッセージ送信完了');
    }
  });
  closeDownload();
}

// カード展開/折りたたみ
function toggleCard(card) {
  card.classList.toggle('expanded');
  const cardId = card.id;
  if (card.classList.contains('expanded')) {
    expandedCards.add(cardId);
  } else {
    expandedCards.delete(cardId);
  }
}

// フォントサイズ適用
function applyFontSize(size) {
  document.body.classList.remove('font-small', 'font-medium', 'font-large');
  if (size !== 'medium') {
    document.body.classList.add('font-' + size);
  }
}

// 時間枠選択
function selectTimeframe(timeframe) {
  currentTimeframe = timeframe;
  // 時間枠に応じてカウントダウンの最大値をリセット
  lastCountdownTotal = timeframe;
  lastStatusCountdown = -1;

  document.querySelectorAll('.timeframe-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.timeframe) === timeframe);
  });

  chrome.runtime.sendMessage({ type: 'TIMEFRAME_CHANGED', timeframe: timeframe });

  // 時間枠切替時はシグナルカードを「準備中」にリセット
  resetSignalCardsToWaiting();
  // v5.10.3: テクニカルカードも明示的にリセット（前の時間枠の残り時間を消す）
  const techIconEl = document.getElementById('tech-signal-icon');
  const techCardEl = document.getElementById('tech-signal-card');
  const techLabelEl = document.getElementById('tech-signal-label');
  const techConfidenceEl = document.getElementById('tech-signal-confidence');
  if (techIconEl) techIconEl.setAttribute('data-signal', 'wait');
  if (techCardEl) techCardEl.setAttribute('data-signal-type', 'wait');
  if (techLabelEl) techLabelEl.textContent = '準備中';
  if (techConfidenceEl) techConfidenceEl.textContent = '--';
  signalDisplayed = false;
  lastDisplayedSignal = null;

  // v5.10.1: 時間枠切替時に多数決パネルもリセット
  latestSignal20 = null;
  const dbgSummary = document.getElementById('indicator-debug-summary');
  const dbgGrid = document.getElementById('indicator-debug-grid');
  if (dbgSummary) dbgSummary.textContent = '分析待ち...';
  if (dbgGrid) dbgGrid.innerHTML = '';

  // v5.6.6: 時間枠変更時にAI予測詳細のロックも解除
  if (aiPredictionLock.isLocked) {
    debugLog('[SidePanel] 🔓 時間枠変更によりAI予測詳細ロック解除');
    aiPredictionLock.isLocked = false;
    aiPredictionLock.lockedData = null;
  }
  lastValidAICardData = null;

  // 時間枠変更時はマーケット概況をリセット（新しい間隔で即更新させる）
  resetMarketOverview();

  // 詳細カードを更新
  if (latestAnalysisData) {
    updateDisplay(latestAnalysisData);
  } else {
    // データがない場合は完全リセット
    resetSignalCards();
  }
}

// 類似度閾値変更
function changeSimilarityThreshold(threshold) {
  currentSettings.similarityThreshold = threshold;
  updateThresholdChips(threshold);
  chrome.storage.local.set({ similarityThreshold: threshold });
  notifySettingChange('similarityThreshold', threshold);
}

function updateThresholdChips(threshold) {
  document.querySelectorAll('#threshold-chips .setting-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.threshold) === threshold);
  });
}

// データ範囲変更
function changeDataLimit(limit) {
  currentSettings.dataLimit = limit;
  updateDataLimitChips(limit);
  updateDataLimitHint(limit);
  // ストレージと通知には変換後の値を使用（'all' → null, 数値文字列 → 数値）
  const convertedValue = limit === 'all' ? null : parseInt(limit);
  chrome.storage.local.set({ dataLimit: convertedValue });
  notifySettingChange('dataLimit', convertedValue);
}

function updateDataLimitChips(limit) {
  document.querySelectorAll('#data-limit-chips .setting-chip').forEach(chip => {
    const chipLimit = chip.dataset.limit;
    const isActive = chipLimit === limit || (chipLimit === 'all' && limit === null);
    chip.classList.toggle('active', isActive);
  });
}

// v5.6.5: データ範囲のヒントテキストを更新
function updateDataLimitHint(limit) {
  const hintEl = document.getElementById('data-limit-hint');
  if (!hintEl) return;

  if (limit === 'all' || limit === null) {
    if (currentSettings.timeFilterMode === 'session') {
      hintEl.textContent = '時間帯フィルタ後の全データを使用';
    } else {
      hintEl.textContent = '全データを使用';
    }
  } else {
    const limitNum = parseInt(limit);
    if (currentSettings.timeFilterMode === 'session') {
      hintEl.textContent = `時間帯フィルタ後の直近${limitNum.toLocaleString()}件を使用`;
    } else {
      hintEl.textContent = `直近${limitNum.toLocaleString()}件を使用`;
    }
  }
}

// 時間帯フィルタモード変更
function changeTimeFilterMode(mode) {
  currentSettings.timeFilterMode = mode;
  updateTimeFilterChips(mode);
  chrome.storage.local.set({ timeFilterMode: mode });
  notifySettingChange('timeFilterMode', mode);

  // 時間帯情報を即座に更新
  updateTimeFilterInfo();
  // v5.6.5: データ範囲のヒントも更新
  updateDataLimitHint(currentSettings.dataLimit);
}

function updateTimeFilterChips(mode) {
  document.querySelectorAll('#time-filter-chips .setting-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.mode === mode);
  });
}

// 時間帯フィルタ情報を更新（AI予測詳細タイトル横のバッジ）
function updateTimeFilterInfo() {
  const badgeEl = document.getElementById('time-filter-badge');
  if (!badgeEl) return;

  if (currentSettings.timeFilterMode === 'all') {
    badgeEl.textContent = '';
  } else {
    // 現在時刻から市場セッションを判定
    const hour = new Date().getHours();
    let sessionName = '不明';

    if (hour >= 9 && hour <= 15) {
      sessionName = '東京';
    } else if (hour >= 16 && hour <= 20) {
      sessionName = '欧州';
    } else if (hour >= 21 || hour <= 2) {
      sessionName = 'NY';
    } else {
      sessionName = '静穏';
    }

    // v5.6.4: 初期表示は時間帯名のみ（件数はサーバーから来たら更新）
    badgeEl.textContent = `${sessionName}時間`;
  }
}

// 時間帯フィルタ情報を更新（サーバーから受信した情報を使用）
function updateTimeFilterInfoFromServer(timeFilterInfo) {
  const badgeEl = document.getElementById('time-filter-badge');
  if (!badgeEl) return;

  // 現在の設定が「全体」モードなら常に非表示
  if (currentSettings.timeFilterMode === 'all') {
    badgeEl.textContent = '';
    return;
  }

  // サイドパネル側が時間帯別モードなら、サーバー情報を使って表示
  // （サーバー側のmodeが'all'でも、サイドパネルの設定を優先）
  if (!timeFilterInfo) {
    // サーバー情報がない場合は、ローカル判定で時間帯名のみ表示
    return;
  }

  const sessionName = timeFilterInfo.sessionName || '不明';
  const filteredCount = timeFilterInfo.filteredCount;

  // フィルタ後のデータ件数を表示（0件でも正常に表示）
  if (filteredCount !== undefined) {
    badgeEl.textContent = `${sessionName} ${filteredCount}件`;
  } else {
    // filteredCountがundefinedの場合のみ時間帯名のみ
    badgeEl.textContent = `${sessionName}時間`;
  }
}

// 設定変更通知
function notifySettingChange(key, value) {
  chrome.runtime.sendMessage({ type: 'SETTING_CHANGED', key: key, value: value });
}

// 分析データ更新監視
// v5.6.4: bubinga_systemパターン - 常にデータを受信、状態管理なし
function listenForAnalysisUpdates() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // コンテンツスクリプト初期化完了 → 即座にデータ要求
    if (message.type === 'CONTENT_SCRIPT_READY') {
      debugLog('[SidePanel] コンテンツスクリプト初期化完了を受信');
      chrome.runtime.sendMessage({ type: 'TIMEFRAME_CHANGED', timeframe: currentTimeframe });
      requestAnalysisData();
    }

    if (message.type === 'ANALYSIS_UPDATE') {
      latestAnalysisData = message.data;
      // v5.10.3: signal20はポーリング専用。ここでは処理しない
      updateDisplay(message.data);
      updateStatus('connected', 'データ受信中');
    }

    if (message.type === 'STATUS_UPDATE') {
      updateRealtimeStatus(message.data);
    }

    // v5.10.3: SIGNAL20_UPDATEは廃止。ポーリング専用に統一

    // 時間帯別データ更新を受信
    if (message.type === 'TIME_FILTER_UPDATE' && message.data?.timeFilterInfo) {
      updateTimeFilterInfoFromServer(message.data.timeFilterInfo);
    }

    if (message.type === 'ASSET_UPDATE' && message.data) {
      if (message.data.asset) {
        document.getElementById('asset-name-display').textContent = message.data.asset;

        // v5.6.6: 通貨ペア変更時にAI予測詳細のロックも解除
        if (aiPredictionLock.isLocked) {
          debugLog('[SidePanel] 🔓 通貨ペア変更によりAI予測詳細ロック解除');
          aiPredictionLock.isLocked = false;
          aiPredictionLock.lockedData = null;
        }
        lastValidAICardData = null;
        signalDisplayed = false;
        lastDisplayedSignal = null;
      }
      if (message.data.dataCount !== undefined) {
        document.getElementById('asset-data-count').textContent = `${message.data.dataCount}件`;
      }
    }
    // v5.6.4: PAGE_STATE, SYSTEM_STATEは使用しない（bubinga_systemパターン）
  });
}

// v5.6.4: bubinga_systemパターン - 状態管理を削除
// isSystemActive, isOnTheOptionPage, isStabilizing, stabilizingTimer,
// handleSystemStateChange, handlePageStateChange は削除済み

// 待機状態のUIを表示（使用しないが互換性のため残す）
function showWaitingState() {
  debugLog('[SidePanel] showWaitingState called (v5.6.4: no-op)');
  // v5.6.4: 待機状態への遷移は行わない
}

// アクティブ状態のUIを表示（TheOptionページ用）
function showActiveState() {
  debugLog('[SidePanel] アクティブ画面を表示');

  // 待機画面を非表示、メインコンテンツを表示
  const waitingScreen = document.getElementById('waiting-screen');
  const mainContent = document.getElementById('main-content');
  const topBar = document.querySelector('.top-bar');

  if (waitingScreen) waitingScreen.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
  if (topBar) topBar.classList.remove('waiting-mode');
}

// シグナルカードをリセット（取引終了時）
function resetSignalCards() {
  debugLog('[SidePanel] シグナルカードをリセット');

  // テクニカル分析シグナルカードをリセット
  const techCardEl = document.getElementById('tech-signal-card');
  const techIconEl = document.getElementById('tech-signal-icon');
  const techLabelEl = document.getElementById('tech-signal-label');
  const techConfidenceEl = document.getElementById('tech-signal-confidence');
  if (techIconEl) techIconEl.setAttribute('data-signal', 'wait');
  if (techCardEl) techCardEl.setAttribute('data-signal-type', 'wait');
  if (techLabelEl) techLabelEl.textContent = '準備中';
  if (techConfidenceEl) techConfidenceEl.textContent = '--';

  // AI予測シグナルカードをリセット
  const aiCardEl = document.getElementById('ai-signal-card');
  const aiIconEl = document.getElementById('ai-signal-icon');
  const aiLabelEl = document.getElementById('ai-signal-label');
  const aiConfidenceEl = document.getElementById('ai-signal-confidence');
  if (aiIconEl) aiIconEl.setAttribute('data-signal', 'wait');
  if (aiCardEl) aiCardEl.setAttribute('data-signal-type', 'wait');
  if (aiLabelEl) aiLabelEl.textContent = '準備中';
  if (aiConfidenceEl) aiConfidenceEl.textContent = '--';

  // テクニカル詳細カードをリセット（v5.8.21: ゲージ削除後はエントリー条件のみ）
  const techDetailBox = document.getElementById('tech-detail');
  if (techDetailBox) {
    techDetailBox.innerHTML = '';
  }

  // AI詳細カードをリセット
  const probUp = document.getElementById('prob-up');
  const probDown = document.getElementById('prob-down');
  const probBarUp = document.getElementById('prob-bar-up');
  const probBarDown = document.getElementById('prob-bar-down');
  const aiDetailBox = document.getElementById('ai-detail');
  if (probUp) probUp.textContent = '上昇 --%';
  if (probDown) probDown.textContent = '下降 --%';
  if (probBarUp) probBarUp.style.width = '0%';
  if (probBarDown) probBarDown.style.width = '0%';
  if (aiDetailBox) {
    aiDetailBox.innerHTML = '<p class="detail-text">学習データ収集中...</p>';
  }

  // 急変警告をリセット
  const reversalEl = document.getElementById('reversal-alert');
  if (reversalEl) reversalEl.classList.remove('active');

  // チカチカ防止用のキャッシュもリセット
  lastTechSignal = { signal: null, confidence: null };
  lastAISignal = { signal: null, matchCount: null, available: null };

  // マーケット概況はリセットしない（カウントダウン継続のため）
}

// シグナルカードを「準備中」状態にリセット（詳細カードはそのまま）
// v5.10.3: テクニカルカードはポーリングが残り時間を表示するため、ここではAIカードのみリセット
function resetSignalCardsToWaiting() {
  // v5.10.3: テクニカルカードはポーリングが制御するため触らない

  // AI予測シグナルカードを準備中に
  const aiCardEl = document.getElementById('ai-signal-card');
  const aiIconEl = document.getElementById('ai-signal-icon');
  const aiLabelEl = document.getElementById('ai-signal-label');
  const aiConfidenceEl = document.getElementById('ai-signal-confidence');
  if (aiIconEl) aiIconEl.setAttribute('data-signal', 'wait');
  if (aiCardEl) aiCardEl.setAttribute('data-signal-type', 'wait');
  if (aiLabelEl) aiLabelEl.textContent = '準備中';
  if (aiConfidenceEl) aiConfidenceEl.textContent = '--';
}

// STATUS_UPDATEのcurrentSignalからシグナルカードを更新
function updateSignalCardsFromStatus(signal) {
  if (!signal) return;

  // テクニカル分析シグナルカード更新
  const techCardEl = document.getElementById('tech-signal-card');
  const techIconEl = document.getElementById('tech-signal-icon');
  const techLabelEl = document.getElementById('tech-signal-label');
  const techConfidenceEl = document.getElementById('tech-signal-confidence');

  if (techIconEl && techLabelEl && techConfidenceEl) {
    let dataSignal = 'wait';
    let label = '見送り';
    let confidence = '';

    if (signal.tech === 'HIGH' || signal.tech === 'STRONG_HIGH') {
      dataSignal = 'high';
      label = 'HIGH';
      // ポーリングのlatestSignal20を優先（STATUS_UPDATEのsignal.signal20との不一致を防止）
      const s20 = latestSignal20 || signal.signal20;
      const starLevel = s20 ? s20.starLevel : (signal.techConfidence ? getConfidenceStarLevel(signal.techConfidence) : 1);
      confidence = getStarRating(starLevel);
    } else if (signal.tech === 'LOW' || signal.tech === 'STRONG_LOW') {
      dataSignal = 'low';
      label = 'LOW';
      const s20 = latestSignal20 || signal.signal20;
      const starLevel = s20 ? s20.starLevel : (signal.techConfidence ? getConfidenceStarLevel(signal.techConfidence) : 1);
      confidence = getStarRating(starLevel);
    }

    techIconEl.setAttribute('data-signal', dataSignal);
    techLabelEl.textContent = label;
    techConfidenceEl.textContent = confidence;
    if (techCardEl) techCardEl.setAttribute('data-signal-type', dataSignal);

    // デバッグパネルはポーリング専用（STATUS_UPDATEから更新するとチカチカの原因になる）

    // (旧エントリー条件判定は削除、マーケット概況はANALYSIS_UPDATEで更新)
  }

  // AI予測シグナルカード更新
  const aiCardEl = document.getElementById('ai-signal-card');
  const aiIconEl = document.getElementById('ai-signal-icon');
  const aiLabelEl = document.getElementById('ai-signal-label');
  const aiConfidenceEl = document.getElementById('ai-signal-confidence');

  if (aiIconEl && aiLabelEl && aiConfidenceEl) {
    let dataSignal = 'wait';
    let label = '学習中';
    let confidence = '';

    if (signal.ai === 'HIGH') {
      dataSignal = 'high';
      label = 'HIGH';
      confidence = signal.aiConfidence ? getStarRating(getAIStarLevel(signal.aiConfidence)) : '';
    } else if (signal.ai === 'LOW') {
      dataSignal = 'low';
      label = 'LOW';
      confidence = signal.aiConfidence ? getStarRating(getAIStarLevel(signal.aiConfidence)) : '';
    } else if (signal.ai === 'TREND_HIGH') {
      dataSignal = 'trend-high';
      label = '上昇傾向';
      confidence = signal.aiDiff ? getStarRating(signal.aiDiff >= 30 ? 2 : 1) : getStarRating(1);
    } else if (signal.ai === 'TREND_LOW') {
      dataSignal = 'trend-low';
      label = '下降傾向';
      confidence = signal.aiDiff ? getStarRating(signal.aiDiff >= 30 ? 2 : 1) : getStarRating(1);
    } else if (signal.ai === 'ENHANCED_HIGH') {
      // 強化シグナル（複数時間枠合意/高勝率クラスタ/ボラティリティ適応）
      dataSignal = 'enhanced-high';
      label = '統合HIGH';
      confidence = signal.aiStarLevel ? getStarRating(signal.aiStarLevel) : getStarRating(2);
    } else if (signal.ai === 'ENHANCED_LOW') {
      dataSignal = 'enhanced-low';
      label = '統合LOW';
      confidence = signal.aiStarLevel ? getStarRating(signal.aiStarLevel) : getStarRating(2);
    } else if (signal.ai) {
      // AIシグナルがあるが HIGH/LOW/TREND/ENHANCED 以外の場合
      dataSignal = 'wait';
      label = '見送り';
      confidence = '';
    }

    aiIconEl.setAttribute('data-signal', dataSignal);
    aiLabelEl.textContent = label;
    aiConfidenceEl.textContent = confidence;
    if (aiCardEl) aiCardEl.setAttribute('data-signal-type', dataSignal);

    // (旧AI条件チェックは削除)
  }

  // v5.6.5: シグナルに含まれるAI予測詳細データでAI予測詳細カードも更新
  // シグナルが表示されているのに詳細が表示されない問題を解決
  if (signal.aiUpRate !== undefined && signal.aiDownRate !== undefined && signal.aiMatchCount >= 10) {
    const aiData = {
      upRate: signal.aiUpRate,
      downRate: signal.aiDownRate,
      matchCount: signal.aiMatchCount,
      signal: signal.ai,
      available: true
    };
    // AI予測詳細カードを直接更新
    updateAICardFromSignal(aiData);
  }
}

// 円形プログレスリングの周長（2 * π * r = 2 * π * 26 ≈ 163.36）
const RING_CIRCUMFERENCE = 163.36;
let lastCountdownTotal = 60; // 直近の合計秒数を記憶
let lastStatusCountdown = -1; // 前回のSTATUS_UPDATEカウントダウン値（サイクル変更検出用）

// プログレスリング更新
function updateProgressRing(current, total) {
  const progressEl = document.getElementById('countdown-progress');
  if (!progressEl) return;

  // 進捗率を計算（0〜1）
  const progress = total > 0 ? current / total : 0;
  // stroke-dashoffsetを計算（0で満タン、RING_CIRCUMFERENCEで空）
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  progressEl.style.strokeDashoffset = offset;
}

// リアルタイムステータス更新
function updateRealtimeStatus(data) {
  if (!data) return;

  // v5.6.4: 常に更新を受け入れる（状態チェック削除）

  // デバッグ: 受信データをログ出力
  debugLog('[SidePanel] STATUS_UPDATE受信:', {
    isTrading: data.isTrading,
    tradingRemaining: data.tradingRemaining,
    countdown: data.countdown,
    signalReset: data.signalReset,
    currentSignal: data.currentSignal
  });

  // v5.6.5: 取引中フラグを更新
  const wasInTrading = isInTrading;  // 更新前の値を保存
  if (data.isTrading !== undefined) {
    isInTrading = data.isTrading;
  }

  if (data.asset) {
    document.getElementById('asset-name-display').textContent = data.asset;
  }
  if (data.dataCount !== undefined) {
    document.getElementById('asset-data-count').textContent = `${data.dataCount}件`;
  }

  // 多数決モード: STATUS_UPDATEのsignal20データでlatestSignal20を同期
  // （ポーリングとのタイムラグでアラート音は鳴るがシグナル非表示になるのを防止）
  if (currentSettings.signalMode === 'majority' && data.signal20) {
    if (data.signal20.signal !== 'WAIT') {
      latestSignal20 = data.signal20;
    } else {
      latestSignal20 = null;
    }
  }

  // シグナルリセット（取引終了時）
  // 取引中→非取引の遷移を検出してリセット
  const tradingJustEnded = data.signalReset || (wasInTrading && !data.isTrading);
  if (tradingJustEnded) {
    resetSignalCards();
    signalDisplayed = false;
    lastDisplayedSignal = null;
    lastValidAICardData = null;
    isInTrading = false;

    if (aiPredictionLock.isLocked) {
      debugLog('[SidePanel] 🔓 取引終了によりAI予測詳細ロック解除');
      aiPredictionLock.isLocked = false;
      aiPredictionLock.lockedData = null;
    }

    // マーケット概況は取引終了でもリセットしない（カウントダウン継続のため）
  }

  // カウントダウン（フェーズに応じて表示を変更）
  const nextAnalysisEl = document.getElementById('next-analysis');
  const countdownContainer = document.getElementById('header-countdown');
  const countdownLabel = countdownContainer ? countdownContainer.querySelector('.countdown-label') : null;

  if (nextAnalysisEl) {
    const countdown = data.countdown !== undefined ? Math.max(0, data.countdown) : 0;
    const prepTime = data.prepTime || 5;
    const signal = data.currentSignal;
    const isTrading = data.isTrading || false;
    const tradingRemaining = data.tradingRemaining || 0;
    const tradingDuration = data.tradingDuration || currentTimeframe;

    // カウントダウンの最大値を更新
    // v5.10.4: サイクル変更検出（カウントダウンが前回より増加 = 新しいサイクル開始）
    // 通常カウントダウンは減少するので、増加は必ずサイクル切り替わりを意味する
    const isCycleChange = !isTrading && lastStatusCountdown >= 0 && countdown > lastStatusCountdown;
    if (data.signalReset || isCycleChange) {
      // 時間枠に応じた最大値を設定
      lastCountdownTotal = currentTimeframe;

      // v5.10.4: サイクル変更 or signalReset → シグナルカードを完全リセット
      debugLog('[SidePanel] 🔄 シグナル状態リセット:', data.signalReset ? 'signalReset' : 'サイクル変更');
      signalDisplayed = false;
      lastDisplayedSignal = null;
      resetSignalCards();  // テクニカル・AIカード両方を「準備中」に戻す

      // v5.6.6: AI予測詳細のロックを解除
      if (aiPredictionLock.isLocked) {
        debugLog('[SidePanel] 🔓 AI予測詳細ロック解除');
        aiPredictionLock.isLocked = false;
        aiPredictionLock.lockedData = null;
      }

    }
    lastStatusCountdown = isTrading ? -1 : countdown;

    // マーケット概況カウントダウンをエントリーcountdownに初回同期
    // 準備期間（prepTime=5秒）の直前で0になるように揃える
    // → countdown=6の時にマーケット概況が更新 → 直後にテクニカル・AIの5秒カウントダウン開始
    if (!isTrading && marketOverviewInitialized && !marketOverviewSynced && countdown > 0) {
      const interval = getMarketOverviewIntervalSec();
      const tf = currentTimeframe;
      const prepOffset = prepTime + 1; // countdown=6で0になるようにする
      const cyclesPerUpdate = Math.round(interval / tf);
      // 残り秒数 = (cycles-1)*tf + (countdown - prepOffset)
      let aligned = (cyclesPerUpdate - 1) * tf + (countdown - prepOffset);
      // 負の場合は1サイクル足す
      if (aligned <= 0) aligned += tf;
      marketOverviewRemaining = aligned;
      marketOverviewTargetTime = Date.now() + aligned * 1000;
      marketOverviewSynced = true;
      const cdEl = document.getElementById('market-countdown');
      if (cdEl) cdEl.textContent = `${marketOverviewRemaining}秒`;
    }

    // 取引中の場合は取引時間を使用
    const totalForRing = isTrading ? tradingDuration : lastCountdownTotal;
    const currentForRing = isTrading ? tradingRemaining : countdown;

    // シグナルがあるかどうかを判定（HIGH/LOW + 傾向表示 + 統合シグナル）
    // v5.10.3: Signal20がまだ結果を出していない場合はシグナル無効とする
    // （前の時間枠の結果が引き継がれるのを防止）
    const hasValidTech = signal && (
      signal.tech === 'HIGH' || signal.tech === 'LOW' ||
      signal.tech === 'STRONG_HIGH' || signal.tech === 'STRONG_LOW'
    );
    const hasValidAI = signal && (
      signal.ai === 'HIGH' || signal.ai === 'LOW' ||
      signal.ai === 'TREND_HIGH' || signal.ai === 'TREND_LOW' ||
      signal.ai === 'ENHANCED_HIGH' || signal.ai === 'ENHANCED_LOW'
    );
    // 多数決モード: latestSignal20が存在する場合のみテクニカル有効 / 標準モード: Signal20チェック不要
    const hasSignal = (hasValidTech && (currentSettings.signalMode === 'standard' || latestSignal20 !== null)) || hasValidAI;

    // アラート音はtheoption-analyzer.jsで再生するため、ここでは再生しない
    // （二重再生防止）

    // フェーズを決定して表示を変更
    // v5.10.4: シンプルな3段階フロー: 分析中 → 準備 → 取引中
    if (isTrading) {
      // 取引中：判定時間のカウントダウン
      nextAnalysisEl.textContent = tradingRemaining;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-ready', 'phase-entry');
        countdownContainer.classList.add('phase-trading');
      }
      if (countdownLabel) countdownLabel.textContent = '取引中';
      // 取引中はシグナルカードを表示
      if (signal) {
        signalDisplayed = true;
        lastDisplayedSignal = signal;
        updateSignalCardsFromStatus(signal);
      } else if (lastDisplayedSignal) {
        updateSignalCardsFromStatus(lastDisplayedSignal);
      }
    } else if (countdown <= prepTime && countdown > 0 && hasSignal) {
      // 準備：シグナルがあり、残り秒数がprepTime以内
      // シグナルが初めて表示されるタイミングでアラート音を再生
      if (!signalDisplayed) {
        const hasTech = hasValidTech && (currentSettings.signalMode === 'standard' || latestSignal20 !== null);
        const triggerType = (hasTech && hasValidAI) ? 'both' : (hasTech ? 'tech' : 'ai');
        if (currentSettings.alertSoundMode !== 'off') {
          const shouldPlay =
            currentSettings.alertSoundMode === 'both' ||
            (currentSettings.alertSoundMode === 'tech' && hasTech) ||
            (currentSettings.alertSoundMode === 'ai' && hasValidAI);
          if (shouldPlay) {
            playAlertSound(currentSettings.alertSoundType, currentSettings.volume);
            debugLog(`[SidePanel] 🔔 シグナル表示アラート: ${triggerType}`);
          }
        }
      }
      signalDisplayed = true;
      lastDisplayedSignal = signal;
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-trading', 'phase-entry');
        countdownContainer.classList.add('phase-ready');
      }
      if (countdownLabel) countdownLabel.textContent = '準備';
      updateSignalCardsFromStatus(signal);
      // AI予測詳細をロック
      if (!aiPredictionLock.isLocked) {
        aiPredictionLock.isLocked = true;
        aiPredictionLock.lockTime = Date.now();
        aiPredictionLock.lastCountdown = countdown;
        aiPredictionLock.lockedData = {
          upRate: signal.aiUpRate,
          downRate: signal.aiDownRate,
          matchCount: signal.aiMatchCount
        };
        debugLog('[SidePanel] 🔒 AI予測詳細をロック:', aiPredictionLock.lockedData);
      }
    } else {
      // 分析中：シグナルなし or prepTime外
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-ready', 'phase-trading', 'phase-entry');
        countdownContainer.classList.add('phase-analyzing');
      }
      if (countdownLabel) countdownLabel.textContent = '分析中';
    }

    // プログレスリング更新
    updateProgressRing(currentForRing, totalForRing);

    // 急変警告の表示/非表示（準備中カウントダウン5秒〜1秒の間のみ）
    const reversalEl = document.getElementById('reversal-alert');
    if (reversalEl) {
      const ra = data.reversalAlert;
      const isPrepPhase = !isTrading && countdown <= prepTime && countdown > 0 && signalDisplayed;
      if (ra && ra.detected && isPrepPhase) {
        reversalEl.classList.add('active');
        const dirText = ra.direction === 'DROP' ? '急落' : '急騰';
        reversalEl.querySelector('.reversal-alert-text').textContent = `⚠ ${dirText}検出 (ATR×${ra.atrMultiple})`;
      } else {
        reversalEl.classList.remove('active');
      }
    }
  }

  // 標準モード時: signal20Statusのデータ収集カウントダウンを表示
  if (currentSettings.signalMode === 'standard' && !signalDisplayed && data.signal20Status && !data.signal20Status.ready) {
    const techCardEl = document.getElementById('tech-signal-card');
    const techIconEl = document.getElementById('tech-signal-icon');
    const techLabelEl = document.getElementById('tech-signal-label');
    const techConfidenceEl = document.getElementById('tech-signal-confidence');
    if (techIconEl) techIconEl.setAttribute('data-signal', 'wait');
    if (techCardEl) techCardEl.setAttribute('data-signal-type', 'wait');
    if (techLabelEl) {
      const sec = data.signal20Status.remainingSec;
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      techLabelEl.textContent = min > 0 ? `あと${min}分${s > 0 ? s + '秒' : ''}` : `あと${s}秒`;
    }
    if (techConfidenceEl) {
      techConfidenceEl.textContent = '';
    }
  }

  // ML統計
  if (data.mlStats) {
    updateMLStatus(data.mlStats);
  }

  updateStatus('connected', 'データ受信中');
}

// 分析データ要求
// v5.6.4: 常にデータ要求を実行（状態チェック削除）
function requestAnalysisData() {
  // v5.10.2: TIMEFRAME_CHANGEDはselectTimeframe()でのみ送信（毎回送るとsignal20がリセットされる）
  chrome.runtime.sendMessage({ type: 'GET_ANALYSIS_DATA' }, (response) => {
    // chrome.runtime.lastError をチェックしてエラーを抑制
    if (chrome.runtime.lastError) {
      debugLog('[SidePanel] メッセージ送信エラー（無視可能）:', chrome.runtime.lastError.message);
      return;
    }

    if (response) {
      latestAnalysisData = response;
      updateDisplay(response);
      updateStatus('connected', 'データ受信中');
    }
  });
}

// メイン表示更新
// v5.6.4: 常に更新を受け入れる（状態チェック削除）
function updateDisplay(data) {
  if (!data) return;

  if (data.asset) {
    document.getElementById('asset-name-display').textContent = data.asset;
  }
  if (data.dataCount !== undefined) {
    document.getElementById('asset-data-count').textContent = `${data.dataCount}件`;
  }

  // 強化シグナル情報を保存
  if (data.enhancedSignal) {
    latestEnhancedSignal = data.enhancedSignal;
    debugLog('[SidePanel] 強化シグナル受信:', data.enhancedSignal);
  }

  const timeframeData = data.timeframes ? data.timeframes[currentTimeframe] : null;

  debugLog('[SidePanel] 受信データ:', {
    timeframe: currentTimeframe,
    hasTimeframeData: !!timeframeData,
    aiData: timeframeData?.ai,
    techData: timeframeData?.technical?.signal,
    enhanced: data.enhancedSignal?.enhanced
  });

  if (timeframeData) {
    // シグナルカードは常に「準備中」として表示
    // 実際のシグナル表示は updateRealtimeStatus で prepTime 以内の時のみ行う
    // ここでは詳細カード（相場状況、AI予測詳細）のみ更新
    updateTechnicalCard(timeframeData.technical);
    updateAICard(timeframeData.ai, data.stratification);
    updateStratificationInsights(data.stratification);
    // マーケット概況カードを更新
    updateMarketOverview(timeframeData.enhanced, timeframeData.technical);
    debugLog('[SidePanel] 詳細カードのみ更新');
  } else {
    debugLog('[SidePanel] 時間枠のデータなし - 詳細カードのみリセット');
    // v5.10.3: resetSignalCards()を呼ぶとテクニカルカードの残り時間表示が消えるため
    // ここでは詳細カードのみリセット（テクニカルカードはポーリングが制御）
    const techDetailBox = document.getElementById('tech-detail');
    if (techDetailBox) techDetailBox.innerHTML = '';
    const probUp = document.getElementById('prob-up');
    const probDown = document.getElementById('prob-down');
    const probBarUp = document.getElementById('prob-bar-up');
    const probBarDown = document.getElementById('prob-bar-down');
    const aiDetailBox = document.getElementById('ai-detail');
    if (probUp) probUp.textContent = '上昇 --%';
    if (probDown) probDown.textContent = '下降 --%';
    if (probBarUp) probBarUp.style.width = '0%';
    if (probBarDown) probBarDown.style.width = '0%';
    if (aiDetailBox) aiDetailBox.innerHTML = '<p class="detail-text">学習データ収集中...</p>';
    // マーケット概況はリセットしない（カウントダウン継続のため）
  }

  if (data.mlStats) {
    updateMLStatus(data.mlStats);
  }

  // 時間帯フィルタ情報を更新（サーバーから受信した情報を使用）
  if (data.timeFilterInfo) {
    updateTimeFilterInfoFromServer(data.timeFilterInfo);
  }
}

// デュアルシグナルカード更新（テクニカル分析 + AI予測）
function updateDualSignals(timeframeData) {
  const tech = timeframeData.technical;
  const ai = timeframeData.ai;

  // テクニカル分析シグナルカード更新
  updateTechSignalCard(tech);

  // AI予測シグナルカード更新
  updateAISignalCard(ai);
}

// 星表示ヘルパー関数（3段階 - 20インジケータ多数決用）
function getStarRating(level) {
  // level: 1-3
  const filled = Math.min(3, Math.max(1, level));
  const empty = 3 - filled;
  return '★'.repeat(filled) + '☆'.repeat(empty);
}

// confidence値から星レベルを計算（テクニカル分析用 - 20インジケータ多数決）
// 13-14個→★1, 15-16個→★2, 17-20個→★3
function getConfidenceStarLevel(confidence) {
  // signal20のstarLevelが直接使える場合はそのまま返す
  // confidence値からの変換（60=★1, 75=★2, 90=★3）
  if (confidence >= 90) return 3;
  if (confidence >= 75) return 2;
  return 1;
}

// AI予測の星レベルを計算（60%以上のシグナル用）
// 案B: 60-64%→★1, 65-69%→★2, 70-79%→★3, 80-89%→★4, 90%+→★5
function getAIStarLevel(confidence) {
  if (confidence >= 90) return 5;
  if (confidence >= 80) return 4;
  if (confidence >= 70) return 3;
  if (confidence >= 65) return 2;
  return 1; // 60-64%
}

// 強化シグナルのラベルを取得
// type: MULTI_TIMEFRAME, HIGH_WIN_CLUSTER, VOLATILITY_ADAPTED
function getEnhancedLabel(type, direction) {
  const dirLabel = direction === 'HIGH' ? '↑' : '↓';
  switch (type) {
    case 'MULTI_TIMEFRAME':
      return `統合${dirLabel}`;  // 複数時間枠で合意
    case 'HIGH_WIN_CLUSTER':
      return `好条件${dirLabel}`; // 高勝率パターン
    case 'VOLATILITY_ADAPTED':
      return `高ボラ${dirLabel}`; // ボラティリティ適応
    default:
      return direction === 'HIGH' ? '上昇傾向' : '下降傾向';
  }
}

// テクニカル分析シグナルカード更新
function updateTechSignalCard(tech) {
  const cardEl = document.getElementById('tech-signal-card');
  const iconEl = document.getElementById('tech-signal-icon');
  const labelEl = document.getElementById('tech-signal-label');
  const confidenceEl = document.getElementById('tech-signal-confidence');

  if (!iconEl || !labelEl || !confidenceEl) return;

  let dataSignal = 'wait';
  let label = 'データ収集中';
  let confidence = '--';

  if (tech && tech.signal) {
    const signal = tech.signal;
    if (signal === 'HIGH' || signal === 'STRONG_HIGH') {
      dataSignal = 'high';
      label = 'HIGH';
      const starLevel = tech.confidence ? getConfidenceStarLevel(tech.confidence) : 3;
      confidence = getStarRating(starLevel);
    } else if (signal === 'LOW' || signal === 'STRONG_LOW') {
      dataSignal = 'low';
      label = 'LOW';
      const starLevel = tech.confidence ? getConfidenceStarLevel(tech.confidence) : 3;
      confidence = getStarRating(starLevel);
    } else {
      dataSignal = 'wait';
      label = '見送り';
      confidence = '';
    }
  }

  // シグナル変更時のアニメーション
  const prevSignal = iconEl.getAttribute('data-signal');
  if (prevSignal !== dataSignal && cardEl) {
    cardEl.classList.add('signal-changed');
    setTimeout(() => cardEl.classList.remove('signal-changed'), 400);
  }

  iconEl.setAttribute('data-signal', dataSignal);
  labelEl.textContent = label;
  confidenceEl.textContent = confidence;

  // グラデーションアクセント用の属性を設定
  if (cardEl) {
    cardEl.setAttribute('data-signal-type', dataSignal);
  }
}

// AI予測のグレードを計算（確率差と信頼度に基づく）
function calculateAIGrade(upRate, downRate) {
  const maxRate = Math.max(upRate, downRate);
  const diff = Math.abs(upRate - downRate);

  // グレード計算: 最大確率と差の組み合わせ
  // A+: 80%以上 かつ 差50pt以上
  // A:  75%以上 かつ 差40pt以上
  // B+: 70%以上 かつ 差30pt以上
  // B:  65%以上 かつ 差25pt以上
  // C+: 60%以上 かつ 差20pt以上
  // C:  55%以上 または 差15pt以上
  // D:  50%以上 または 差10pt以上
  // F:  それ以外

  if (maxRate >= 80 && diff >= 50) return 'A+';
  if (maxRate >= 75 && diff >= 40) return 'A';
  if (maxRate >= 70 && diff >= 30) return 'B+';
  if (maxRate >= 65 && diff >= 25) return 'B';
  if (maxRate >= 60 && diff >= 20) return 'C+';
  if (maxRate >= 55 || diff >= 15) return 'C';
  if (maxRate >= 50 || diff >= 10) return 'D';
  return 'F';
}

// v5.8.7: グレードから推奨アクションを取得
function getRecommendationFromGrade(grade) {
  // A+, A → 推奨
  // B+, B → 可
  // C+, C → 慎重
  // D, F → 見送り
  if (grade === 'A+' || grade === 'A') return '推奨';
  if (grade === 'B+' || grade === 'B') return '可';
  if (grade === 'C+' || grade === 'C') return '慎重';
  return '見送り';
}

// AI予測シグナルカード更新
function updateAISignalCard(ai) {
  const cardEl = document.getElementById('ai-signal-card');
  const iconEl = document.getElementById('ai-signal-icon');
  const labelEl = document.getElementById('ai-signal-label');
  const confidenceEl = document.getElementById('ai-signal-confidence');

  if (!iconEl || !labelEl || !confidenceEl) return;

  debugLog('[SidePanel] AI予測データ:', ai);

  const available = ai ? ai.available : false;
  const status = ai ? ai.status : null;

  debugLog('[SidePanel] 🔍 AI available状態:', {
    available,
    status,
    upRate: ai?.upRate,
    downRate: ai?.downRate,
    signal: ai?.signal
  });

  if (!available) {
    const prevSignal = iconEl.getAttribute('data-signal');
    if (prevSignal !== 'wait' && cardEl) {
      cardEl.classList.add('signal-changed');
      setTimeout(() => cardEl.classList.remove('signal-changed'), 400);
    }
    iconEl.setAttribute('data-signal', 'wait');
    if (cardEl) cardEl.setAttribute('data-signal-type', 'wait');
    // より詳細なステータス表示
    if (!ai) {
      labelEl.textContent = 'データなし';
    } else if (status === 'INITIALIZING') {
      labelEl.textContent = '初期化中';
    } else if (status === 'LOADING') {
      labelEl.textContent = '読込中';
    } else if (status === 'COLLECTING') {
      labelEl.textContent = '学習中';
    } else if (ai.signal === 'INSUFFICIENT_DATA') {
      labelEl.textContent = 'データ不足';
    } else {
      labelEl.textContent = '準備中';
    }
    confidenceEl.textContent = '';
    return;
  }

  let dataSignal = 'wait';
  let label = '見送り';
  let confidence = '';

  // 信頼度はupRate/downRateを使用
  const upRate = ai.upRate || 0;
  const downRate = ai.downRate || 0;
  const drawRate = 100 - upRate - downRate; // 同値率
  const diff = Math.abs(upRate - downRate); // 上昇と下降の差

  // === 強化シグナルシステム ===
  // 1. 標準シグナル（60%以上）
  // 2. 強化シグナル（複数時間枠統合、高勝率クラスタ、ボラティリティ適応）
  // 3. 傾向シグナル（20pt差）

  // 強化シグナルがある場合は優先して使用
  const enhanced = latestEnhancedSignal;
  const hasEnhancedSignal = enhanced && enhanced.enhanced && enhanced.signal && enhanced.signal.type !== 'NONE';

  // デバッグログ（本番では無効）
  // console.log('[SidePanel SES Debug] 📊 AI判定入力:', { upRate, downRate, drawRate, diff, hasEnhanced: hasEnhancedSignal });

  if (drawRate > 30) {
    // 同値率が30%超え → 見送り
    dataSignal = 'wait';
    label = '見送り';
    confidence = '';
  } else if (upRate >= 60) {
    // 上昇60%以上 → HIGHシグナル（★1-5）
    dataSignal = 'high';
    label = 'HIGH';
    confidence = getStarRating(getAIStarLevel(upRate));
  } else if (downRate >= 60) {
    // 下降60%以上 → LOWシグナル（★1-5）
    dataSignal = 'low';
    label = 'LOW';
    confidence = getStarRating(getAIStarLevel(downRate));
  } else if (hasEnhancedSignal && enhanced.signal.type !== 'TREND' && enhanced.signal.type !== 'STANDARD') {
    // 強化シグナル（複数時間枠統合、高勝率クラスタ、ボラティリティ適応）
    const sig = enhanced.signal;
    const starLevel = Math.min(5, Math.max(1, sig.starLevel || 1));

    if (sig.direction === 'HIGH') {
      dataSignal = 'enhanced-high';
      label = getEnhancedLabel(sig.type, 'HIGH');
      confidence = getStarRating(starLevel);
    } else if (sig.direction === 'LOW') {
      dataSignal = 'enhanced-low';
      label = getEnhancedLabel(sig.type, 'LOW');
      confidence = getStarRating(starLevel);
    } else {
      // 強化シグナルだが方向不明 → 見送り
      dataSignal = 'wait';
      label = '見送り';
      confidence = '';
    }
    // console.log('[SidePanel SES Debug] ✅ 強化シグナル適用:', { type: sig.type, dir: sig.direction, star: starLevel, label, dataSignal });
  } else if (diff >= 20) {
    // 20pt以上の差がある → 傾向表示（★1-2）
    const starLevel = diff >= 30 ? 2 : 1;
    if (upRate > downRate) {
      dataSignal = 'trend-high';
      label = '上昇傾向';
      confidence = getStarRating(starLevel);
    } else {
      dataSignal = 'trend-low';
      label = '下降傾向';
      confidence = getStarRating(starLevel);
    }
  } else {
    // それ以外 → 見送り
    dataSignal = 'wait';
    label = '見送り';
    confidence = '';
  }

  // 最終判定結果ログ（本番では無効）
  // console.log('[SidePanel SES Debug] 📤 最終判定:', { dataSignal, label, confidence });

  // シグナル変更時のアニメーション
  const prevSignal = iconEl.getAttribute('data-signal');
  if (prevSignal !== dataSignal && cardEl) {
    cardEl.classList.add('signal-changed');
    setTimeout(() => cardEl.classList.remove('signal-changed'), 400);
  }

  iconEl.setAttribute('data-signal', dataSignal);
  labelEl.textContent = label;
  confidenceEl.textContent = confidence;

  // グラデーションアクセント用の属性を設定
  if (cardEl) {
    cardEl.setAttribute('data-signal-type', dataSignal);
  }

}

// v5.8.21: 強度・ボラティリティゲージは削除（エントリー条件カードに統合）
// updateTechnicalCard は呼び出しを維持するが中身は空（互換性）
function updateTechnicalCard(technical) {
  // エントリー条件カードで表示するため、ここでは何もしない
}

// AI予測詳細カード更新（シグナルはメインカードのみ）
function updateAICard(ai, stratification) {
  // v5.6.6: ロック中は更新をスキップ（シグナル表示後は値を固定）
  if (aiPredictionLock.isLocked && aiPredictionLock.lockedData) {
    debugLog('[SidePanel] 🔒 AI予測詳細ロック中 - 更新スキップ');
    return;
  }

  const probUp = document.getElementById('prob-up');
  const probDown = document.getElementById('prob-down');
  const probBarUp = document.getElementById('prob-bar-up');
  const probBarDown = document.getElementById('prob-bar-down');
  const detailBox = document.getElementById('ai-detail');
  const probContainer = document.getElementById('probability-container');

  const available = ai ? ai.available : false;
  const signal = ai ? (ai.signal || 'NEUTRAL') : 'NEUTRAL';
  let matchCount = ai ? (ai.matchCount || 0) : 0;
  let upRate = ai ? (ai.upRate || 0) : 0;
  let downRate = ai ? (ai.downRate || 0) : 0;

  // v5.6.5: 最低10件のマッチパターンが必要（ML側の判定基準と同期）
  const MIN_MATCH_COUNT = 10;

  // v5.6.5: 有効なデータ = upRate/downRateがあり、かつマッチ数が10件以上
  const hasValidData = (upRate > 0 || downRate > 0) && matchCount >= MIN_MATCH_COUNT;

  if (hasValidData) {
    // 有効なデータがあれば保持（10件以上の場合のみ）
    lastValidAICardData = {
      upRate,
      downRate,
      matchCount,
      signal,
      stratification
    };
    debugLog('[SidePanel] AI予測詳細データを保持:', lastValidAICardData);
  } else if ((isInTrading || signalDisplayed) && lastValidAICardData) {
    // v5.6.5: 取引中またはシグナル表示中でデータがない場合、前回の保持データを使用
    // signalDisplayedがtrueの場合 = シグナルが一度表示されたサイクル内
    debugLog('[SidePanel] 取引中/シグナル表示中: 保持データを使用:', lastValidAICardData);
    upRate = lastValidAICardData.upRate;
    downRate = lastValidAICardData.downRate;
    matchCount = lastValidAICardData.matchCount;
    stratification = lastValidAICardData.stratification;
  }

  // v5.6.4: チカチカ防止を削除（正確な表示を優先）
  lastAISignal = { signal, matchCount, available, upRate, downRate };

  // v5.6.5: 表示可能なデータがあるかチェック（10件以上のマッチが必要）
  // 保持データから復元した場合はすでに条件を満たしている
  const hasDisplayData = (upRate > 0 || downRate > 0) && matchCount >= MIN_MATCH_COUNT;

  if (!hasDisplayData) {
    // データがない、またはマッチ数が不足の場合
    if (probUp) probUp.textContent = '上昇 --%';
    if (probDown) probDown.textContent = '下降 --%';
    if (probBarUp) probBarUp.style.width = '0%';
    if (probBarDown) probBarDown.style.width = '0%';

    // マッチパターン不足の場合はマッチパターン数を表示
    const threshold = currentSettings.similarityThreshold || 50;
    if (matchCount > 0 && matchCount < MIN_MATCH_COUNT) {
      // 1件以上あるが10件未満
      if (detailBox) {
        detailBox.innerHTML = `
          <p class="detail-text" style="font-weight: 600;">
            閾値${threshold}%以上: <strong style="font-weight: 700;">${matchCount}件</strong>
            <span style="color: #999; font-size: 0.85em;">（最低${MIN_MATCH_COUNT}件必要）</span>
          </p>
        `;
      }
    } else if (ai && ai.signal === 'INSUFFICIENT_DATA') {
      // INSUFFICIENT_DATA シグナルの場合
      if (detailBox) {
        detailBox.innerHTML = `
          <p class="detail-text" style="font-weight: 600;">
            閾値${threshold}%以上: <strong style="font-weight: 700;">${matchCount}件</strong>
            <span style="color: #999; font-size: 0.85em;">（最低${MIN_MATCH_COUNT}件必要）</span>
          </p>
        `;
      }
    } else {
      if (detailBox) detailBox.innerHTML = '<p class="detail-text">学習データ収集中...</p>';
    }
    return;
  }

  // 層別化データがある場合はそちらを優先表示
  // v5.6.5: 保持データを使用する場合を考慮してupRate/downRateを使用
  let displayUpRate = upRate;
  let displayDownRate = downRate;
  let hasStratification = false;
  let originalUpRate = upRate;
  let originalDownRate = downRate;

  if (stratification && stratification.hasEnoughData) {
    displayUpRate = stratification.upRate;
    displayDownRate = stratification.downRate;
    hasStratification = true;
    if (stratification.original) {
      originalUpRate = stratification.original.upRate;
      originalDownRate = stratification.original.downRate;
    }
  }

  // 確率バー更新（層別化後の値を表示）
  if (probUp) probUp.textContent = `上昇 ${displayUpRate}%`;
  if (probDown) probDown.textContent = `下降 ${displayDownRate}%`;
  if (probBarUp) probBarUp.style.width = `${displayUpRate}%`;
  if (probBarDown) probBarDown.style.width = `${displayDownRate}%`;

  // 詳細情報
  const threshold = currentSettings.similarityThreshold || 50;
  const drawRate = 100 - displayUpRate - displayDownRate;

  if (detailBox) {
    let detailHTML = `
      <p class="detail-text" style="font-weight: 600;">
        閾値${threshold}%以上: <strong style="font-weight: 700;">${matchCount}件</strong>
        <span style="color: #999; font-size: 0.85em; margin-left: 8px;">同値率: ${Math.round(drawRate)}%</span>
      </p>
    `;

    // 層別化による変更があった場合、元の値との比較を表示
    if (hasStratification && (originalUpRate !== displayUpRate || originalDownRate !== displayDownRate)) {
      const upDiff = displayUpRate - originalUpRate;
      const downDiff = displayDownRate - originalDownRate;
      const upChange = upDiff > 0 ? `+${upDiff}` : upDiff;
      const downChange = downDiff > 0 ? `+${downDiff}` : downDiff;

      detailHTML += `
        <div class="original-vs-stratified">
          <span class="original-rate">元: 上昇${originalUpRate}% / 下降${originalDownRate}%</span>
          <span class="arrow-icon">→</span>
          <span class="stratified-rate ${displayUpRate > displayDownRate ? 'up' : displayDownRate > displayUpRate ? 'down' : ''}">
            層別化後: 上昇${displayUpRate}% (${upChange}) / 下降${displayDownRate}% (${downChange})
          </span>
        </div>
      `;
    }

    detailBox.innerHTML = detailHTML;
  }
}

// v5.6.5: シグナルからAI予測詳細カードを直接更新
// STATUS_UPDATEのcurrentSignalに含まれるデータを使用
function updateAICardFromSignal(aiData) {
  // v5.6.6: ロック中は更新をスキップ（シグナル表示後は値を固定）
  if (aiPredictionLock.isLocked && aiPredictionLock.lockedData) {
    debugLog('[SidePanel] 🔒 AI予測詳細ロック中（FromSignal） - 更新スキップ');
    return;
  }

  const probUp = document.getElementById('prob-up');
  const probDown = document.getElementById('prob-down');
  const probBarUp = document.getElementById('prob-bar-up');
  const probBarDown = document.getElementById('prob-bar-down');
  const detailBox = document.getElementById('ai-detail');

  const upRate = aiData.upRate || 0;
  const downRate = aiData.downRate || 0;
  const matchCount = aiData.matchCount || 0;

  // データを保持（取引終了まで維持するため）
  lastValidAICardData = {
    upRate,
    downRate,
    matchCount,
    signal: aiData.signal,
    stratification: null
  };

  // 確率バー更新
  if (probUp) probUp.textContent = `上昇 ${upRate}%`;
  if (probDown) probDown.textContent = `下降 ${downRate}%`;
  if (probBarUp) probBarUp.style.width = `${upRate}%`;
  if (probBarDown) probBarDown.style.width = `${downRate}%`;

  // 詳細情報
  const threshold = currentSettings.similarityThreshold || 50;
  const drawRate = 100 - upRate - downRate;

  if (detailBox) {
    detailBox.innerHTML = `
      <p class="detail-text" style="font-weight: 600;">
        閾値${threshold}%以上: <strong style="font-weight: 700;">${matchCount}件</strong>
        <span style="color: #999; font-size: 0.85em; margin-left: 8px;">同値率: ${Math.round(drawRate)}%</span>
      </p>
    `;
  }

  debugLog('[SidePanel] シグナルからAI予測詳細を更新:', { upRate, downRate, matchCount });
}

// 層別化インサイトを表示
function updateStratificationInsights(stratification) {
  // v5.6.6: ロック中は更新をスキップ
  if (aiPredictionLock.isLocked && aiPredictionLock.lockedData) {
    return;
  }

  const insightsContainer = document.getElementById('stratification-insights');
  if (!insightsContainer) return;

  // 層別化データがない場合は非表示
  if (!stratification || !stratification.hasEnoughData || !stratification.summary) {
    insightsContainer.innerHTML = '';
    return;
  }

  const summary = stratification.summary;

  // インサイトがない場合も非表示
  if (!summary.hasSignificantInsight || !summary.insights || summary.insights.length === 0) {
    insightsContainer.innerHTML = '';
    return;
  }

  let html = '';

  // 各インサイトを表示
  for (const insight of summary.insights) {
    const impactClass = insight.impact || 'neutral';
    html += `
      <div class="insight-item ${impactClass}">
        <span class="insight-icon">${insight.icon}</span>
        <span class="insight-text">${insight.text}</span>
      </div>
    `;
  }

  // サマリー行を追加
  if (summary.totalBoost > 0) {
    const boostLevel = summary.confidenceLevel || 'low';
    const contextInfo = stratification.context?.contextName || '';
    const volInfo = stratification.volatility?.levelName || '';

    html += `
      <div class="stratification-summary">
        <div class="context-info">
          ${contextInfo ? `<span class="context-badge">${contextInfo}</span>` : ''}
          ${volInfo ? `<span class="context-badge">${volInfo}</span>` : ''}
        </div>
        <div class="stratification-boost ${boostLevel}">
          精度向上: +${summary.totalBoost}pt
        </div>
      </div>
    `;
  }

  insightsContainer.innerHTML = html;
}

// ========================================
// マーケット概況カード
// ========================================

let latestEnhancedData = null;

let lastMomentumValue = null; // 前回のモメンタム値（加速/減速判定用）
let pendingMarketData = null; // 次回更新用のデータをバッファ
let marketOverviewInitialized = false; // 初回更新済みフラグ
let marketOverviewTimerId = null; // setIntervalのID
let marketOverviewRemaining = 0; // 次回更新までの残り秒数
let marketOverviewSynced = false; // countdownと同期済みフラグ
let marketOverviewTargetTime = 0; // 次回更新の目標時刻（Date.now()ベース）

// 判定時間ごとの更新間隔（秒）
const MARKET_OVERVIEW_INTERVAL_SEC = {
  15: 60,    // 60秒ごと
  30: 60,    // 60秒ごと
  60: 60,    // 60秒ごと
  180: 180,  // 180秒ごと
  300: 300   // 300秒ごと
};

function getMarketOverviewIntervalSec() {
  return MARKET_OVERVIEW_INTERVAL_SEC[currentTimeframe] || 60;
}

/**
 * sidepanel自身のsetIntervalでカウントダウンを駆動
 * Date.now()ベースで残り時間を計算するため、バックグラウンドでも正確に動作。
 */
function startMarketOverviewTimer() {
  if (marketOverviewTimerId) clearInterval(marketOverviewTimerId);

  marketOverviewTimerId = setInterval(() => {
    if (!marketOverviewInitialized) return;

    const now = Date.now();
    marketOverviewRemaining = Math.ceil((marketOverviewTargetTime - now) / 1000);
    const countdownEl = document.getElementById('market-countdown');

    if (marketOverviewRemaining <= 0) {
      // 更新実行
      if (pendingMarketData) {
        updateMarketOverview(pendingMarketData.enhanced, pendingMarketData.technical, true);
      }
      // 次の目標時刻をセット
      marketOverviewTargetTime = now + getMarketOverviewIntervalSec() * 1000;
      marketOverviewRemaining = getMarketOverviewIntervalSec();
    }
    if (countdownEl) countdownEl.textContent = `${marketOverviewRemaining}秒`;
  }, 1000);
}

// 後方互換: 旧コードから呼ばれる関数のスタブ
function resetEnhancedAnalysisLock() {
  // マーケット概況はリセットしない（カウントダウン継続のため）
}

/**
 * マーケット概況カードを更新
 * enhanced(v2付き)があればフル表示、なければtechnicalからフォールバック表示
 */
function updateMarketOverview(enhanced, technical, forceUpdate = false) {
  if (enhanced) latestEnhancedData = enhanced;

  const v2 = enhanced?.v2;

  // 常に最新データをバッファに保存（次回更新時に使用）
  pendingMarketData = { enhanced, technical };

  // 初回は即表示してタイマー開始、以降はタイマーから呼ばれるまで待つ
  if (!forceUpdate && marketOverviewInitialized) {
    return;
  }
  if (!marketOverviewInitialized) {
    // 初回: 目標時刻をセットしてタイマー開始
    marketOverviewRemaining = getMarketOverviewIntervalSec();
    marketOverviewTargetTime = Date.now() + marketOverviewRemaining * 1000;
    const cdEl = document.getElementById('market-countdown');
    if (cdEl) cdEl.textContent = `${marketOverviewRemaining}秒`;
    startMarketOverviewTimer();
  }
  marketOverviewInitialized = true;

  // モメンタム・価格位置・ボラティリティを抽出
  let momentum = 0;       // -1〜+1
  let bbPosition = 50;    // 0〜100（ボリンジャーバンド内の位置）
  let volRatio = 1.0;
  let volLabel = '通常';
  let volClass = 'vol-normal';
  let macdIncreasing = null;

  if (v2 && v2.t1 && v2.t2) {
    momentum = v2.t1.emaSlope || 0;
    bbPosition = v2.t1.bbPosition ?? 50;
    volRatio = v2.t2.volRatio || 1.0;
    macdIncreasing = v2.t4?.macdIncreasing ?? null;
  } else if (technical) {
    // v2が来ない場合: 前回のv2値があればそれを使用（v2は低頻度で更新されるため）
    if (lastMomentumValue !== null) {
      momentum = lastMomentumValue;
    } else {
      const breakdown = technical.breakdown || {};
      momentum = breakdown.momentum?.score ?? 0;
    }
    // フォールバック: bbPositionがない場合はRSIから推定
    const breakdown = technical.breakdown || {};
    bbPosition = breakdown.rsi?.value ?? 50;
    // ボラティリティ文字列→ratioに変換
    const volStr = technical.volatility || 'NORMAL';
    const ratioMap = { 'VERY_LOW': 0.5, 'LOW': 0.75, 'MODERATE': 1.0, 'NORMAL': 1.0, 'HIGH': 1.3, 'VERY_HIGH': 1.6, 'EXTREME': 2.0 };
    volRatio = ratioMap[volStr] || 1.0;
  }

  // ボラティリティバッジ
  if (volRatio < 0.65) { volLabel = '非常に静穏'; volClass = 'vol-very-low'; }
  else if (volRatio < 0.85) { volLabel = '静穏'; volClass = 'vol-low'; }
  else if (volRatio > 1.4) { volLabel = '非常に活発'; volClass = 'vol-very-high'; }
  else if (volRatio > 1.1) { volLabel = '活発'; volClass = 'vol-high'; }
  const volBadge = document.getElementById('market-volatility-badge');
  if (volBadge) {
    volBadge.textContent = volLabel;
    volBadge.className = `market-volatility-badge ${volClass}`;
  }

  // モメンタム方向・アイコン・ラベル
  const absMom = Math.abs(momentum);
  let momIcon, momLabel, momColor;
  if (momentum > 0.25)      { momIcon = '⬆'; momLabel = '上方向に強い勢い'; momColor = '#2e7d32'; }
  else if (momentum > 0.1)  { momIcon = '⬆'; momLabel = '上方向に勢いあり'; momColor = '#2e7d32'; }
  else if (momentum > 0.04) { momIcon = '↗'; momLabel = 'やや上方向'; momColor = '#4caf50'; }
  else if (momentum < -0.25){ momIcon = '⬇'; momLabel = '下方向に強い勢い'; momColor = '#c62828'; }
  else if (momentum < -0.1) { momIcon = '⬇'; momLabel = '下方向に勢いあり'; momColor = '#c62828'; }
  else if (momentum < -0.04){ momIcon = '↘'; momLabel = 'やや下方向'; momColor = '#e53935'; }
  else                      { momIcon = '➡'; momLabel = '方向感なし'; momColor = '#757575'; }

  // 勢いの変化（前回モメンタムとの比較）
  let changeLabel = '';
  if (lastMomentumValue !== null) {
    const diff = absMom - Math.abs(lastMomentumValue);
    if (diff > 0.03) changeLabel = '（加速中）';
    else if (diff < -0.03) changeLabel = '（減速中）';
    else changeLabel = '（横ばい）';
  }
  lastMomentumValue = momentum;

  // モメンタム表示
  const momIconEl = document.getElementById('market-momentum-icon');
  const momLabelEl = document.getElementById('market-momentum-label');
  const momFill = document.getElementById('market-momentum-fill');
  if (momIconEl) momIconEl.textContent = momIcon;
  if (momLabelEl) {
    momLabelEl.textContent = `${momLabel}${changeLabel}`;
    momLabelEl.style.color = momColor;
  }
  if (momFill) {
    const barWidth = Math.min(100, absMom * 100);
    momFill.style.width = `${barWidth}%`;
    momFill.style.background = momColor;
  }

  // 価格位置
  let posText;
  if (bbPosition > 95)      posText = '直近の値幅を上に突破';
  else if (bbPosition > 75) posText = '直近の値幅の上限付近';
  else if (bbPosition > 60) posText = '直近の値幅のやや上寄り';
  else if (bbPosition >= 40) posText = '直近の値幅の中央付近';
  else if (bbPosition >= 25) posText = '直近の値幅のやや下寄り';
  else if (bbPosition >= 5)  posText = '直近の値幅の下限付近';
  else                       posText = '直近の値幅を下に突破';

  const posEl = document.getElementById('market-price-position');
  if (posEl) posEl.textContent = posText;

  // 予測文
  const forecastEl = document.getElementById('market-forecast-text');
  if (forecastEl) {
    forecastEl.textContent = generateMarketForecast(momentum, bbPosition, volRatio, macdIncreasing);
  }

  // 最終更新時刻
  const updatedEl = document.getElementById('market-last-updated');
  if (updatedEl) {
    const now = new Date();
    updatedEl.textContent = `最終更新 ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }
}

/**
 * モメンタム・価格位置ベースの予測文を生成
 */
function generateMarketForecast(momentum, bbPosition, volRatio, macdIncreasing) {
  const parts = [];
  const isUp = momentum > 0.08;
  const isDown = momentum < -0.08;
  const isStrong = Math.abs(momentum) > 0.3;
  const isNeutral = !isUp && !isDown;

  const isUpperZone = bbPosition > 75;
  const isLowerZone = bbPosition < 25;
  const isBreakUp = bbPosition > 95;
  const isBreakDown = bbPosition < 5;
  const isMid = bbPosition >= 25 && bbPosition <= 75;

  // 上方向に勢いがある場合
  if (isUp) {
    if (isBreakUp) {
      if (isStrong) parts.push('上方向の勢いが強く、値幅を超える動きが続く可能性がある。ただし急激な戻しにも注意');
      else if (macdIncreasing === false) parts.push('値幅の上限付近で勢いが弱まっている。押し戻される可能性が高まっている');
      else parts.push('上方向の勢いは維持されているが、値幅の上限付近で膠着しやすい');
    } else if (isUpperZone) {
      if (macdIncreasing === false) parts.push('値幅の上限付近で勢いが弱まっている。押し戻される可能性が高まっている');
      else parts.push('上方向の勢いは維持されているが、値幅の上限付近で膠着しやすい');
    } else if (isLowerZone) {
      if (isStrong) parts.push('下限付近から反発の勢いが出ている。上方向への転換の兆し');
      else parts.push('下限付近で上方向への動きが弱い。反発が続くか不透明');
    } else {
      if (macdIncreasing) parts.push('上方向の勢いが強まっている。このまま上限に向かう展開が見込まれる');
      else if (macdIncreasing === false) parts.push('上方向への動きが鈍化している。方向感が失われつつある');
      else parts.push('緩やかに上方向へ推移。方向感がはっきり出るか注視');
    }
  }
  // 下方向に勢いがある場合
  else if (isDown) {
    if (isBreakDown) {
      if (isStrong) parts.push('下方向の勢いが強く、値幅を超える動きが続く可能性がある。ただし急激な戻しにも注意');
      else if (macdIncreasing) parts.push('値幅の下限付近で勢いが弱まっている。反発の可能性が高まっている');
      else parts.push('下方向の勢いは維持されているが、値幅の下限付近で膠着しやすい');
    } else if (isLowerZone) {
      if (macdIncreasing) parts.push('値幅の下限付近で勢いが弱まっている。反発の可能性が高まっている');
      else parts.push('下方向の勢いは維持されているが、値幅の下限付近で膠着しやすい');
    } else if (isUpperZone) {
      if (isStrong) parts.push('上限付近から反落の勢いが出ている。下方向への転換の兆し');
      else parts.push('上限付近で下方向への動きが弱い。反落が続くか不透明');
    } else {
      if (macdIncreasing === false) parts.push('下方向の勢いが強まっている。このまま下限に向かう展開が見込まれる');
      else if (macdIncreasing) parts.push('下方向への動きが鈍化している。方向感が失われつつある');
      else parts.push('緩やかに下方向へ推移。方向感がはっきり出るか注視');
    }
  }
  // 方向感なし
  else {
    if (isBreakUp) parts.push('値幅を上に超えたが勢いが伴っていない。すぐに戻される可能性がある');
    else if (isBreakDown) parts.push('値幅を下に超えたが勢いが伴っていない。すぐに戻される可能性がある');
    else if (isUpperZone) parts.push('値幅の上限付近で方向感がない。ここから下に押し戻されやすい位置');
    else if (isLowerZone) parts.push('値幅の下限付近で方向感がない。ここから上に反発しやすい位置');
    else parts.push('方向感が出にくい状態。明確な動きが出るまで様子見が無難');
  }

  // ボラティリティ補足
  if (volRatio > 1.8) parts.push('値動きが非常に大きく、急変動に注意');
  else if (volRatio < 0.5) parts.push('値動きが極端に小さく、同値リスクが高い');

  return parts.join('。') + '。';
}

function resetMarketOverview() {
  if (marketOverviewTimerId) { clearInterval(marketOverviewTimerId); marketOverviewTimerId = null; }
  marketOverviewInitialized = false;
  marketOverviewSynced = false;
  marketOverviewRemaining = 0;
  marketOverviewTargetTime = 0;
  pendingMarketData = null;
  lastMomentumValue = null;
  const countdownEl = document.getElementById('market-countdown');
  if (countdownEl) { countdownEl.textContent = ''; }
  const momLabel = document.getElementById('market-momentum-label');
  const momIcon = document.getElementById('market-momentum-icon');
  const momFill = document.getElementById('market-momentum-fill');
  const posEl = document.getElementById('market-price-position');
  const forecastEl = document.getElementById('market-forecast-text');
  if (momLabel) { momLabel.textContent = '分析待ち'; momLabel.style.color = ''; }
  if (momIcon) momIcon.textContent = '➡';
  if (momFill) momFill.style.width = '0%';
  if (posEl) posEl.textContent = '';
  if (forecastEl) forecastEl.textContent = 'データ収集中...';
  const updatedEl = document.getElementById('market-last-updated');
  if (updatedEl) updatedEl.textContent = '';
  const volBadge = document.getElementById('market-volatility-badge');
  if (volBadge) { volBadge.textContent = ''; volBadge.className = 'market-volatility-badge'; }
}

// ML学習状況更新
function updateMLStatus(mlStats) {
  if (!mlStats) return;
  // データ整理中はUI更新を抑制（チカチカ防止）
  if (isTrimmingData) return;

  // DB総件数を優先して表示（dataCount = DB総件数、dataCountWithResults = メモリ上の結果あり件数）
  // メモリは最大10000件に制限されているが、DBには42000件以上保存されている可能性がある
  const rawDataCount = mlStats.dataCount || mlStats.dataCountWithResults || 0;
  const learningLevel = mlStats.learningLevel;

  // チカチカ防止: 小さな変動（±10件以内）は無視、大きな減少は反映（トリミング対応）
  let displayDataCount;
  if (rawDataCount < highestMLDataCount - 10) {
    // 大幅減少（トリミング等）→ 即座に反映
    highestMLDataCount = rawDataCount;
    displayDataCount = rawDataCount;
  } else {
    displayDataCount = Math.max(highestMLDataCount, rawDataCount);
    if (rawDataCount > highestMLDataCount) {
      highestMLDataCount = rawDataCount;
    }
  }

  // 値が変わっていない場合は更新をスキップ
  if (lastMLStats.dataCount === displayDataCount &&
      lastMLStats.learningLevel === learningLevel) {
    return;
  }
  lastMLStats = { dataCountWithResults: mlStats.dataCountWithResults, dataCount: displayDataCount, learningLevel };

  const dataCountEl = document.getElementById('ml-data-count');
  const learningLevelEl = document.getElementById('ml-learning-level');
  const progressBar = document.getElementById('ml-progress-bar');
  const countBadge = document.getElementById('ml-count-badge');

  const countText = displayDataCount.toLocaleString();

  if (dataCountEl) dataCountEl.textContent = countText;
  if (countBadge) countBadge.textContent = `${countText}件`;
  if (learningLevelEl && learningLevel !== undefined) {
    learningLevelEl.textContent = learningLevel;
  }
  if (progressBar) {
    const progress = Math.min(100, (displayDataCount / 25000) * 100);
    progressBar.style.width = `${progress}%`;
  }

  // v5.10.4: データ鮮度表示
  const freshnessEl = document.getElementById('ml-freshness');
  const freshnessStarsEl = document.getElementById('ml-freshness-stars');
  const freshnessDetailEl = document.getElementById('ml-freshness-detail');
  if (freshnessEl && mlStats.freshness && mlStats.freshness.total > 0) {
    freshnessEl.style.display = 'flex';
    const pct = mlStats.freshness.percent;
    // 星: 80%+=5, 60%+=4, 40%+=3, 20%+=2, それ以下=1
    const stars = pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1;
    freshnessStarsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    freshnessDetailEl.textContent = `(直近30日: ${pct}%)`;
  } else if (freshnessEl) {
    freshnessEl.style.display = 'none';
  }

  // v5.10.4: 25,000件超過時にデータ整理ボタンを表示（24,500件にトリミング）
  const trimBtn = document.getElementById('ml-trim-btn');
  const trimCountEl = document.getElementById('ml-trim-count');
  if (trimBtn) {
    const excess = displayDataCount - 24500;
    if (displayDataCount > 25000) {
      trimBtn.style.display = 'flex';
      if (trimCountEl) trimCountEl.textContent = excess.toLocaleString();
    } else {
      trimBtn.style.display = 'none';
    }
  }
}

// v5.10.4: データ整理実行（ブロッキングオーバーレイ付き）
function executeTrimData() {
  const overlay = document.getElementById('trim-overlay');
  const trimBtn = document.getElementById('ml-trim-btn');
  if (!overlay || !trimBtn) return;

  // 画面全体をブロック & UI更新を抑制
  overlay.style.display = 'flex';
  isTrimmingData = true;

  chrome.runtime.sendMessage({ type: 'TRIM_DATA' }, (response) => {
    if (chrome.runtime.lastError) {
      isTrimmingData = false;
      overlay.style.display = 'none';
      return;
    }

    if (response && response.success) {
      // カウンターをリセット
      highestMLDataCount = 0;
      lastMLStats = { dataCountWithResults: null, dataCount: null, learningLevel: null };
      trimBtn.style.display = 'none';
      trimBtn.innerHTML = 'データ整理（<span id="ml-trim-count">0</span>件削除）';
      debugLog(`[SidePanel] データ整理完了: ${response.totalDeleted}件削除`);
    }

    // 整理完了後、少し待ってからUI更新を再開しオーバーレイを解除
    // （バックグラウンドのデータ再読み込みが安定するのを待つ）
    setTimeout(() => {
      isTrimmingData = false;
      overlay.style.display = 'none';
    }, 1500);
  });
}

// ステータス更新
function updateStatus(status, text) {
  const indicatorEl = document.getElementById('status-indicator');
  const textEl = document.getElementById('status-text');

  indicatorEl.className = 'indicator-dot ' + status;
  textEl.textContent = text;
}

// アラート音再生
function playAlertSound(soundType, volume) {
  const soundFile = `sound/${soundType}.mp3`;
  const audio = new Audio(chrome.runtime.getURL(soundFile));

  // 音量設定
  const volumeLevels = {
    'low': 0.3,
    'medium': 0.6,
    'high': 1.0
  };
  audio.volume = volumeLevels[volume] || 0.6;

  audio.play().catch(err => {
    debugLog('[SidePanel] アラート音再生エラー:', err);
  });
}

// v5.9.1: デバッグ用20インジケータ結果表示（後で削除）
let debugPanelCallCount = 0;
function updateIndicatorDebugPanel(signal20) {
  debugPanelCallCount++;
  const panel = document.getElementById('indicator-debug-panel');
  const grid = document.getElementById('indicator-debug-grid');
  const summary = document.getElementById('indicator-debug-summary');
  if (!panel || !grid || !summary) return;
  if (!signal20) { summary.textContent = `呼出${debugPanelCallCount}回 データなし`; return; }

  // サマリー表示（v5.10.6: フィルタ情報付き）
  const { signal, rawSignal, highCount, lowCount, neutralCount, starLevel, trendMode, momentumFilter, pricePositionFilter } = signal20;
  const starStr = starLevel > 0 ? '★'.repeat(starLevel) + '☆'.repeat(3 - starLevel) : '---';
  const signalLabel = signal === 'HIGH' ? 'HIGH' : signal === 'LOW' ? 'LOW' : 'WAIT';
  let filterStr = '';
  if (momentumFilter && momentumFilter.level > 0 && rawSignal && rawSignal !== 'NEUTRAL' && rawSignal !== 'WAIT') {
    if (!momentumFilter.passed) {
      filterStr = ` [F:BLOCK ${momentumFilter.score}/${momentumFilter.requiredScore}]`;
    } else {
      filterStr = ` [F:PASS]`;
    }
  }
  // v5.12.4: 急変フィルタ表示
  if (pricePositionFilter && pricePositionFilter.position !== undefined) {
    if (!pricePositionFilter.passed) {
      filterStr += ` [急変:BLOCK]`;
    }
  }
  summary.textContent = `${signalLabel} ${starStr} (H:${highCount} L:${lowCount} N:${neutralCount})${filterStr}`;
  summary.style.color = signal === 'HIGH' ? 'var(--signal-up)' : signal === 'LOW' ? 'var(--signal-down)' : 'var(--signal-neutral)';

  // 各インジケータの結果をグリッドに表示
  // indicators は [{id, abbr, signal}, ...] の配列形式
  const indicators = signal20.indicators || [];

  let html = '';
  for (const ind of indicators) {
    const name = ind.abbr || ind.id || '??';
    const sig = ind.signal;
    let cls = 'neutral';
    let label = '--';
    if (sig === 'HIGH') { cls = 'high'; label = 'H'; }
    else if (sig === 'LOW') { cls = 'low'; label = 'L'; }
    else if (sig === 'NEUTRAL') { cls = 'neutral'; label = 'N'; }
    html += `<div class="indicator-debug-cell ${cls}"><span class="indicator-debug-name">${name}</span><span class="indicator-debug-result">${label}</span></div>`;
  }

  // トレンドモード表示
  if (trendMode && trendMode !== 'NONE') {
    html += `<div class="indicator-debug-trend" style="grid-column: 1 / -1;">トレンド: ${trendMode}</div>`;
  }

  grid.innerHTML = html;
}

// シグナルモードバッジ更新
function updateSignalModeBadge(mode) {
  const badge = document.getElementById('signal-mode-badge');
  if (!badge) return;
  if (mode === 'standard') {
    badge.textContent = '標準';
    badge.className = 'signal-mode-badge mode-standard';
  } else {
    badge.textContent = '多数決';
    badge.className = 'signal-mode-badge';
  }
}

// シグナルモードに応じたUI表示切替（20インジケータパネルの表示/非表示）
function updateSignalModeUI(mode) {
  const debugPanel = document.getElementById('indicator-debug-panel');
  if (debugPanel) {
    debugPanel.style.display = mode === 'majority' ? '' : 'none';
  }
}

// v5.10.3: Signal20データをポーリングで取得（唯一のデータパス）
// signal20 + signal20Statusの両方を取得し、デバッグパネルとテクニカルカードを更新
let signal20PollCount = 0;
function startSignal20Polling() {
  setInterval(() => {
    signal20PollCount++;
    chrome.runtime.sendMessage({ type: 'GET_SIGNAL20_DATA' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (!response) return;

      // 標準モード時: Signal20データ不要、カウントダウンはSTATUS_UPDATEのsignal20Statusで処理
      if (response.signalMode === 'standard' || currentSettings.signalMode === 'standard') {
        latestSignal20 = null;
        return;
      }

      // 多数決モード: signal20データがあればデバッグパネル更新
      if (response.signal20) {
        updateIndicatorDebugPanel(response.signal20);
        // v5.10.4: Signal20がWAIT（ローソク足不足）の場合はnull扱い
        if (response.signal20.signal !== 'WAIT') {
          latestSignal20 = response.signal20;
        } else {
          latestSignal20 = null;
        }
      } else {
        latestSignal20 = null;
      }

      // signal20Statusに基づいてテクニカルカードの残り時間を表示
      // ※シグナルが表示済みの場合は更新しない（シグナル表示を優先）
      if (!signalDisplayed && response.signal20Status && !response.signal20Status.ready) {
        const techCardEl = document.getElementById('tech-signal-card');
        const techIconEl = document.getElementById('tech-signal-icon');
        const techLabelEl = document.getElementById('tech-signal-label');
        const techConfidenceEl = document.getElementById('tech-signal-confidence');
        if (techIconEl) techIconEl.setAttribute('data-signal', 'wait');
        if (techCardEl) techCardEl.setAttribute('data-signal-type', 'wait');
        if (techLabelEl) {
          const sec = response.signal20Status.remainingSec;
          const min = Math.floor(sec / 60);
          const s = sec % 60;
          techLabelEl.textContent = min > 0 ? `あと${min}分${s > 0 ? s + '秒' : ''}` : `あと${s}秒`;
        }
        if (techConfidenceEl) {
          techConfidenceEl.textContent = '';
        }
      }
    });
  }, 2000); // 2秒ごと
}


// ============================================================================
// 自動バックアップ ハンドラ群
// ============================================================================

// 自動催促 ON/OFF トグル
function handleAutoBackupToggle() {
  const toggle = document.getElementById('auto-backup-toggle');
  if (!toggle) return;

  const currentlyEnabled = currentSettings.autoBackupEnabled;

  if (!currentlyEnabled) {
    // OFF → ON: 初回または同意未取得ならウェルカムダイアログを表示
    if (!currentSettings.backupConsentShown) {
      showBackupWelcomeDialog();
    } else {
      enableAutoBackup();
    }
  } else {
    // ON → OFF: 確認なしで無効化
    disableAutoBackup();
  }
}

// 手動バックアップボタン
function handleManualBackup() {
  const btn = document.getElementById('manual-backup-button');
  if (!btn) return;

  // 通貨ペア選択ダイアログを表示
  openBackupAssetsModal();
}

// 手動バックアップ用: 通貨ペア選択後の実行
function executeManualBackupWithAssets(selectedAssets) {
  const btn = document.getElementById('manual-backup-button');
  if (!btn) return;

  if (selectedAssets.length === 0) {
    alert('通貨ペアを選択してください');
    return;
  }

  const confirmed = confirm(
    '🤝 手動バックアップを実行します\n\n' +
    `対象通貨ペア: ${selectedAssets.length}件\n` +
    `${selectedAssets.slice(0, 5).join(', ')}${selectedAssets.length > 5 ? ' ほか' : ''}\n\n` +
    '・あなたのPCに学習データのJSONがダウンロードされます\n' +
    '・同時にコミュニティへも自動共有されます\n\n' +
    '実行しますか？'
  );

  if (!confirmed) return;

  btn.disabled = true;
  btn.textContent = 'バックアップ実行中...';

  chrome.runtime.sendMessage(
    {
      type: 'REQUEST_DOWNLOAD',
      downloadType: 'AUTO_BACKUP',
      assetNames: selectedAssets
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[SidePanel] バックアップ要求エラー:', chrome.runtime.lastError.message);
        alert('❌ バックアップ要求に失敗しました\n' + chrome.runtime.lastError.message);
        btn.disabled = false;
        btn.textContent = '今すぐバックアップ';
      } else {
        debugLog('[SidePanel] バックアップ要求送信完了');
      }
      setTimeout(() => {
        if (btn.disabled) {
          btn.disabled = false;
          btn.textContent = '今すぐバックアップ';
        }
      }, 30 * 60 * 1000);
    }
  );
}

// 初回ウェルカムダイアログ
function showBackupWelcomeDialog() {
  const message =
    '🤝 コミュニティバックアップのご案内\n\n' +
    '【動作内容】\n' +
    '・5日に1回、起動時にバックアップを促す通知が表示されます\n' +
    '・通知は取引中には表示されず、起動時のみです\n' +
    '・バックアップ時は通貨ペアを毎回選択できます\n' +
    '・選んだ通貨ペアのデータがあなたのPCに保存されます\n' +
    '・同時にコミュニティへも匿名で共有されます\n' +
    '・他のユーザーが提供したデータも、後でダウンロードして取り込めます\n\n' +
    '【ご注意】\n' +
    '・データには個人を特定する情報は含まれません\n' +
    '・いつでも設定からOFFにできます\n' +
    '・「今すぐバックアップ」ボタンでいつでも実行可能です\n\n' +
    '催促を有効化しますか？';

  if (confirm(message)) {
    currentSettings.backupConsentShown = true;
    chrome.storage.local.set({ backupConsentShown: true });
    enableAutoBackup();
  } else {
    // 拒否時は同意未取得のままにし、トグルは引き続きOFF
    const toggle = document.getElementById('auto-backup-toggle');
    if (toggle) toggle.classList.remove('active');
  }
}

// 自動催促を有効化
function enableAutoBackup() {
  currentSettings.autoBackupEnabled = true;
  chrome.storage.local.set({ autoBackupEnabled: true });

  const toggle = document.getElementById('auto-backup-toggle');
  if (toggle) toggle.classList.add('active');
  updateBackupTimeDisplay();

  debugLog('[SidePanel] 起動時催促を有効化');
}

// 自動催促を無効化
function disableAutoBackup() {
  currentSettings.autoBackupEnabled = false;
  chrome.storage.local.set({ autoBackupEnabled: false });

  const toggle = document.getElementById('auto-backup-toggle');
  if (toggle) toggle.classList.remove('active');
  updateBackupTimeDisplay();

  debugLog('[SidePanel] 起動時催促を無効化');
}

// ============================================================================
// 対象通貨ペア選択モーダル
// ============================================================================

let availableAssetsCache = [];

function openBackupAssetsModal() {
  const overlay = document.getElementById('backup-assets-overlay');
  const sheet = document.getElementById('backup-assets-sheet');
  const list = document.getElementById('backup-assets-list');
  const saveBtn = document.getElementById('backup-assets-save');
  const titleEl = document.querySelector('#backup-assets-sheet .bottom-sheet-title');
  const noteEl = document.querySelector('.backup-assets-note');

  if (!overlay || !sheet || !list) return;

  if (titleEl) titleEl.textContent = 'バックアップする通貨ペア';
  if (saveBtn) saveBtn.textContent = 'バックアップ実行';
  if (noteEl) noteEl.textContent = 'バックアップする通貨ペアを選択してください（不要なものはチェックを外してください）';

  overlay.classList.add('active');
  sheet.classList.add('active');

  list.innerHTML = '<div class="backup-assets-loading">通貨ペア一覧を取得中...</div>';

  // 通貨ペア一覧を取得
  requestAssetListForBackup();
}

function requestAssetListForBackup() {
  chrome.runtime.sendMessage({ type: 'GET_ASSET_LIST_FOR_BACKUP' }, (response) => {
    if (response && response.success && Array.isArray(response.assetList)) {
      availableAssetsCache = response.assetList;
      renderBackupAssetsList(response.assetList);
    } else {
      const list = document.getElementById('backup-assets-list');
      if (list) {
        list.innerHTML = `<div class="backup-assets-loading">${
          response?.error || '通貨ペア一覧の取得に失敗しました'
        }</div>`;
      }
    }
  });
}

function renderBackupAssetsList(assetList) {
  const list = document.getElementById('backup-assets-list');
  if (!list) return;

  if (!assetList || assetList.length === 0) {
    list.innerHTML = '<div class="backup-assets-loading">登録されている通貨ペアがありません</div>';
    return;
  }

  // デフォルトで全て選択(ユーザーは不要なものだけチェックを外せばよい)
  list.innerHTML = assetList.map(({ assetName, count }) => {
    const safeId = `backup-asset-cb-${assetName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return `
      <label class="backup-asset-item" for="${safeId}">
        <input type="checkbox" id="${safeId}" data-asset="${assetName}" checked>
        <span class="backup-asset-item-name">${assetName}</span>
        <span class="backup-asset-item-count">${count.toLocaleString()}件</span>
      </label>
    `;
  }).join('');
}

function closeBackupAssetsModal() {
  document.getElementById('backup-assets-overlay').classList.remove('active');
  document.getElementById('backup-assets-sheet').classList.remove('active');
}

function saveBackupAssetsSelection() {
  const checkboxes = document.querySelectorAll('#backup-assets-list input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes).map(cb => cb.dataset.asset);

  closeBackupAssetsModal();
  executeManualBackupWithAssets(selected);
}


// バックアップ完了通知の受信(background.js から転送)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BACKUP_COMPLETED') {
    const btn = document.getElementById('manual-backup-button');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '今すぐバックアップ';
    }

    if (message.success) {
      currentSettings.lastBackupTime = message.timestamp || Date.now();
      chrome.storage.local.set({ lastBackupTime: currentSettings.lastBackupTime });
      updateBackupTimeDisplay();

      const recordCount = message.recordCount || 0;
      const fileCount = message.fileCount || 0;
      alert(
        '✅ バックアップが完了しました\n\n' +
        `処理した通貨ペア: ${fileCount}件\n` +
        `処理したレコード: ${recordCount.toLocaleString()}件`
      );
    } else {
      alert('❌ バックアップに失敗しました\n\n' + (message.error || '不明なエラー'));
    }
  }
});


debugLog('[SidePanel] Material Design 3 スクリプト読み込み完了');
