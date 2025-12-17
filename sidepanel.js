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
  alertSound: false,
  alertSoundType: '01',
  volume: 'medium',
  fontSize: 'medium',
  similarityThreshold: 70,
  dataLimit: 'all',
  timeFilterMode: 'all' // 'all' | 'session'
};

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
// シグナル表示状態の追跡（シグナル消失防止）
let signalDisplayed = false;  // シグナルが一度表示されたかどうか
let lastDisplayedSignal = null;  // 最後に表示されたシグナル

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  debugLog('[SidePanel] Material Design 3 インターフェース初期化');

  loadSettings();
  setupEventListeners();
  listenForAnalysisUpdates();
  listenForStorageChanges();

  // 初期状態でシグナルカードを「準備中」にする
  resetSignalCardsToWaiting();

  requestAnalysisData();

  // 初期データ取得
  chrome.storage.local.get(['sidepanel_asset', 'sidepanel_dataCount'], (result) => {
    if (result.sidepanel_asset) {
      document.getElementById('asset-name-display').textContent = result.sidepanel_asset;
    }
    if (result.sidepanel_dataCount !== undefined) {
      document.getElementById('asset-data-count').textContent = `${result.sidepanel_dataCount}件`;
    }
  });

  // 定期的にデータを要求
  setInterval(requestAnalysisData, 2000);

  // カードの初期展開状態を適用
  expandedCards.forEach(cardId => {
    const card = document.getElementById(cardId);
    if (card) card.classList.add('expanded');
  });

  updateStatus('waiting', '接続待機中...');
});

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
      const progressPercent = Math.min(100, (count / 50000) * 100);
      progressBar.style.width = `${progressPercent}%`;
    }

    // 学習レベルも更新
    const learningLevelEl = document.getElementById('ml-learning-level');
    if (learningLevelEl) {
      const learningLevel = Math.min(100, Math.round((count / 50000) * 100));
      learningLevelEl.textContent = learningLevel;
    }

    debugLog(`[SidePanel] 通貨ペア変更: ${assetName} → ${count}件読み込み`);
  } catch (error) {
    console.error('[SidePanel] ML data load error:', error);
  }
}

// 設定読み込み
function loadSettings() {
  chrome.storage.local.get(['alertSoundEnabled', 'alertVolume', 'alertSoundType', 'fontSize', 'similarityThreshold', 'dataLimit', 'timeFilterMode'], (result) => {
    if (result.alertSoundEnabled !== undefined) {
      currentSettings.alertSound = result.alertSoundEnabled;
      const toggle = document.getElementById('alert-sound-toggle');
      if (result.alertSoundEnabled) toggle.classList.add('active');
    }
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
    }
  });
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
  document.getElementById('export-json').addEventListener('click', () => requestDownload('EXPORT_JSON'));
  document.getElementById('import-json').addEventListener('click', () => requestDownload('IMPORT_JSON'));

  // アラート音トグル
  document.getElementById('alert-sound-toggle').addEventListener('click', (e) => {
    currentSettings.alertSound = !currentSettings.alertSound;
    e.currentTarget.classList.toggle('active', currentSettings.alertSound);
    chrome.storage.local.set({ alertSoundEnabled: currentSettings.alertSound });
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

  // 通貨ペア別データ状況モーダル
  document.getElementById('ml-detail-btn').addEventListener('click', openAssetDataModal);
  document.getElementById('close-asset-data').addEventListener('click', closeAssetDataModal);
  document.getElementById('asset-data-overlay').addEventListener('click', closeAssetDataModal);
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
      <div class="asset-data-list">
    `;

    for (const [assetName, count] of sortedAssets) {
      const isCurrent = assetName === currentAsset;
      const percent = Math.round((count / 50000) * 100);
      const barWidth = Math.min(100, (count / maxCount) * 100);

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
          <div class="asset-data-icon">${icon}</div>
          <div class="asset-data-info">
            <span class="asset-data-name">${assetName}${isCurrent ? ' (現在)' : ''}</span>
            <span class="asset-data-count">${count.toLocaleString()}件</span>
          </div>
          <div class="asset-data-bar-container">
            <div class="asset-data-bar" style="width: ${barWidth}%"></div>
          </div>
          <span class="asset-data-percent">${percent}%</span>
        </div>
      `;
    }

    html += '</div>';
    contentEl.innerHTML = html;

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

// ダウンロードリクエスト
function requestDownload(type) {
  console.log('[SidePanel] ダウンロードリクエスト送信:', type);
  chrome.runtime.sendMessage({ type: 'REQUEST_DOWNLOAD', downloadType: type }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[SidePanel] メッセージ送信エラー:', chrome.runtime.lastError.message);
    } else {
      console.log('[SidePanel] メッセージ送信完了');
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

  document.querySelectorAll('.timeframe-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.timeframe) === timeframe);
  });

  chrome.runtime.sendMessage({ type: 'TIMEFRAME_CHANGED', timeframe: timeframe });

  // 時間枠切替時はシグナルカードを「準備中」にリセット
  // 実際のシグナル表示は次のSTATUS_UPDATEで適切なタイミング（prepTime以内）に更新される
  resetSignalCardsToWaiting();
  signalDisplayed = false;  // シグナル表示状態もリセット
  lastDisplayedSignal = null;

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

// 時間帯フィルタモード変更
function changeTimeFilterMode(mode) {
  currentSettings.timeFilterMode = mode;
  updateTimeFilterChips(mode);
  chrome.storage.local.set({ timeFilterMode: mode });
  notifySettingChange('timeFilterMode', mode);

  // 時間帯情報を即座に更新
  updateTimeFilterInfo();
}

function updateTimeFilterChips(mode) {
  document.querySelectorAll('#time-filter-chips .setting-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.mode === mode);
  });
}

// 時間帯フィルタ情報を更新
function updateTimeFilterInfo() {
  const infoEl = document.getElementById('time-filter-info');
  if (!infoEl) return;

  if (currentSettings.timeFilterMode === 'all') {
    infoEl.textContent = '';
    infoEl.style.display = 'none';
  } else {
    // 現在時刻から市場セッションを判定
    const hour = new Date().getHours();
    let sessionName = '不明';
    let hourRange = '';

    if (hour >= 9 && hour <= 15) {
      sessionName = '東京';
      hourRange = `${Math.max(9, hour - 2)}〜${Math.min(15, hour + 2)}時`;
    } else if (hour >= 16 && hour <= 20) {
      sessionName = '欧州';
      hourRange = `${Math.max(16, hour - 2)}〜${Math.min(20, hour + 2)}時`;
    } else if (hour >= 21 || hour <= 2) {
      sessionName = 'NY';
      hourRange = `${hour - 2 < 0 ? hour - 2 + 24 : hour - 2}〜${(hour + 2) % 24}時`;
    } else {
      sessionName = '静穏';
      hourRange = `${Math.max(3, hour - 2)}〜${Math.min(8, hour + 2)}時`;
    }

    infoEl.textContent = `${sessionName} (${hourRange})`;
    infoEl.style.display = 'inline';
  }
}

// 時間帯フィルタ情報を更新（サーバーから受信した情報を使用）
function updateTimeFilterInfoFromServer(timeFilterInfo) {
  const infoEl = document.getElementById('time-filter-info');
  if (!infoEl) return;

  if (!timeFilterInfo || timeFilterInfo.mode === 'all') {
    infoEl.textContent = '';
    infoEl.style.display = 'none';
  } else {
    const sessionName = timeFilterInfo.sessionName || '不明';
    const currentHour = timeFilterInfo.currentHour;
    const targetHours = timeFilterInfo.targetHours || [];

    // 時間範囲を表示
    let hourRange = '';
    if (targetHours.length > 0) {
      const minHour = Math.min(...targetHours);
      const maxHour = Math.max(...targetHours);
      hourRange = `${minHour}〜${maxHour}時`;
    } else if (currentHour !== undefined) {
      hourRange = `${currentHour}時付近`;
    }

    // フィルタ後のデータ件数を表示（あれば）
    const dataCountText = timeFilterInfo.filteredDataCount !== undefined
      ? ` [${timeFilterInfo.filteredDataCount}件]`
      : '';

    infoEl.textContent = `${sessionName} (${hourRange})${dataCountText}`;
    infoEl.style.display = 'inline';
  }
}

// 設定変更通知
function notifySettingChange(key, value) {
  chrome.runtime.sendMessage({ type: 'SETTING_CHANGED', key: key, value: value });
}

// 分析データ更新監視
function listenForAnalysisUpdates() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ANALYSIS_UPDATE') {
      latestAnalysisData = message.data;
      updateDisplay(message.data);
      updateStatus('connected', 'データ受信中');
    }

    if (message.type === 'STATUS_UPDATE') {
      updateRealtimeStatus(message.data);
    }

    if (message.type === 'ASSET_UPDATE' && message.data) {
      if (message.data.asset) {
        document.getElementById('asset-name-display').textContent = message.data.asset;
      }
      if (message.data.dataCount !== undefined) {
        document.getElementById('asset-data-count').textContent = `${message.data.dataCount}件`;
      }
    }

    // システム状態通知（ページ非アクティブ時の対応）
    if (message.type === 'SYSTEM_STATE' && message.data) {
      handleSystemStateChange(message.data);
    }
    // 同期的に処理完了するため、return falseまたは省略
    // return trueは非同期レスポンスが必要な場合のみ使用
  });
}

// システム状態変更ハンドラ（タブ切り替え対策）
let isSystemActive = true;

function handleSystemStateChange(data) {
  if (data.active) {
    // システム再開
    debugLog('[SidePanel] システム再開通知を受信');
    isSystemActive = true;
    updateStatus('connected', 'データ受信中');

    // シグナル表示状態をリセット（古い状態が残らないように）
    signalDisplayed = false;
    lastDisplayedSignal = null;

    // シグナルカードを「準備中」にリセット
    resetSignalCardsToWaiting();
  } else {
    // システム一時停止
    debugLog('[SidePanel] システム一時停止通知を受信');
    isSystemActive = false;
    updateStatus('waiting', '他のページを表示中...');

    // シグナル表示状態を保持（戻ってきた時に再開できるように）
  }
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

  // テクニカル詳細カードをリセット
  const techDetailBox = document.getElementById('tech-detail');
  if (techDetailBox) {
    techDetailBox.innerHTML = '<p class="detail-text">分析データを待機中...</p>';
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

  // チカチカ防止用のキャッシュもリセット
  lastTechSignal = { signal: null, confidence: null };
  lastAISignal = { signal: null, matchCount: null, available: null };
}

// シグナルカードを「準備中」状態にリセット（詳細カードはそのまま）
function resetSignalCardsToWaiting() {
  // テクニカル分析シグナルカードを準備中に
  const techCardEl = document.getElementById('tech-signal-card');
  const techIconEl = document.getElementById('tech-signal-icon');
  const techLabelEl = document.getElementById('tech-signal-label');
  const techConfidenceEl = document.getElementById('tech-signal-confidence');
  if (techIconEl) techIconEl.setAttribute('data-signal', 'wait');
  if (techCardEl) techCardEl.setAttribute('data-signal-type', 'wait');
  if (techLabelEl) techLabelEl.textContent = '準備中';
  if (techConfidenceEl) techConfidenceEl.textContent = '--';

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
      // 星表示に変更（50%以上でシグナル発出、80%+→★5, 70-79%→★4, 60-69%→★3, 50-59%→★2）
      confidence = signal.techConfidence ? getStarRating(getConfidenceStarLevel(signal.techConfidence)) : '';
    } else if (signal.tech === 'LOW' || signal.tech === 'STRONG_LOW') {
      dataSignal = 'low';
      label = 'LOW';
      confidence = signal.techConfidence ? getStarRating(getConfidenceStarLevel(signal.techConfidence)) : '';
    }

    techIconEl.setAttribute('data-signal', dataSignal);
    techLabelEl.textContent = label;
    techConfidenceEl.textContent = confidence;
    if (techCardEl) techCardEl.setAttribute('data-signal-type', dataSignal);
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
  }
}

// 円形プログレスリングの周長（2 * π * r = 2 * π * 26 ≈ 163.36）
const RING_CIRCUMFERENCE = 163.36;
let lastCountdownTotal = 60; // 直近の合計秒数を記憶

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

  // システムが非アクティブの場合は更新しない（タブ切り替え対策）
  if (!isSystemActive) {
    debugLog('[SidePanel] システム非アクティブのため STATUS_UPDATE をスキップ');
    return;
  }

  // デバッグ: 受信データをログ出力
  debugLog('[SidePanel] STATUS_UPDATE受信:', {
    isTrading: data.isTrading,
    tradingRemaining: data.tradingRemaining,
    countdown: data.countdown,
    signalReset: data.signalReset,
    currentSignal: data.currentSignal
  });

  if (data.asset) {
    document.getElementById('asset-name-display').textContent = data.asset;
  }
  if (data.dataCount !== undefined) {
    document.getElementById('asset-data-count').textContent = `${data.dataCount}件`;
  }

  // シグナルリセット（取引終了時）
  if (data.signalReset) {
    resetSignalCards();
    signalDisplayed = false;  // シグナル表示状態もリセット
    lastDisplayedSignal = null;
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
    // 取引終了（signalReset）時または新しいサイクル開始時にリセット
    if (data.signalReset || countdown > lastCountdownTotal) {
      // 時間枠に応じた最大値を設定
      lastCountdownTotal = currentTimeframe;
    }
    // 取引中の場合は取引時間を使用
    const totalForRing = isTrading ? tradingDuration : lastCountdownTotal;
    const currentForRing = isTrading ? tradingRemaining : countdown;

    // シグナルがあるかどうかを判定（HIGH/LOW + 傾向表示 + 統合シグナル）
    const hasSignal = signal && (
      signal.tech === 'HIGH' || signal.tech === 'LOW' ||
      signal.tech === 'STRONG_HIGH' || signal.tech === 'STRONG_LOW' ||
      signal.ai === 'HIGH' || signal.ai === 'LOW' ||
      signal.ai === 'TREND_HIGH' || signal.ai === 'TREND_LOW' ||
      signal.ai === 'ENHANCED_HIGH' || signal.ai === 'ENHANCED_LOW'
    );

    // アラート音はtheoption-analyzer.jsで再生するため、ここでは再生しない
    // （二重再生防止）

    // シグナルが有効な場合は表示状態を更新
    if (hasSignal && signal) {
      signalDisplayed = true;
      lastDisplayedSignal = signal;
    }

    // フェーズを決定して表示を変更
    if (isTrading) {
      // 取引中：判定時間のカウントダウン
      nextAnalysisEl.textContent = tradingRemaining;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-ready');
        countdownContainer.classList.add('phase-trading');
      }
      if (countdownLabel) countdownLabel.textContent = '取引中';
      // 取引中はシグナルカードを表示（保存されたシグナルを使用）
      if (signal) {
        updateSignalCardsFromStatus(signal);
      } else if (lastDisplayedSignal) {
        // シグナルがない場合は最後に表示されたシグナルを使用
        updateSignalCardsFromStatus(lastDisplayedSignal);
      }
    } else if (countdown <= prepTime && countdown > 0 && hasSignal) {
      // 準備：シグナルがあり、残り5秒以内
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-trading');
        countdownContainer.classList.add('phase-ready');
      }
      if (countdownLabel) countdownLabel.textContent = '準備';
      // 準備フェーズでシグナルカードを表示
      if (signal) {
        updateSignalCardsFromStatus(signal);
      }
    } else if (signalDisplayed && lastDisplayedSignal && countdown > 0) {
      // シグナルが一度表示された後は、取引終了まで保持（エントリー待機中も含む）
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-trading');
        countdownContainer.classList.add('phase-ready');
      }
      if (countdownLabel) countdownLabel.textContent = 'エントリー';
      // 保存されたシグナルを表示し続ける
      updateSignalCardsFromStatus(lastDisplayedSignal);
    } else {
      // 分析中：デフォルト状態（シグナルがまだ表示されていない場合のみリセット）
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-ready', 'phase-trading');
        countdownContainer.classList.add('phase-analyzing');
      }
      if (countdownLabel) countdownLabel.textContent = '分析中';
      // シグナルがまだ表示されていない場合のみ「準備中」にリセット
      if (!signalDisplayed) {
        resetSignalCardsToWaiting();
      }
    }

    // プログレスリング更新
    updateProgressRing(currentForRing, totalForRing);
  }

  // ML統計
  if (data.mlStats) {
    updateMLStatus(data.mlStats);
  }

  updateStatus('connected', 'データ受信中');
}

// 分析データ要求
function requestAnalysisData() {
  // まず現在の時間枠をコンテンツスクリプトに通知（同期）
  chrome.runtime.sendMessage({ type: 'TIMEFRAME_CHANGED', timeframe: currentTimeframe });

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
function updateDisplay(data) {
  if (!data) return;

  // システムが非アクティブの場合は更新しない（タブ切り替え対策）
  if (!isSystemActive) {
    debugLog('[SidePanel] システム非アクティブのため ANALYSIS_UPDATE をスキップ');
    return;
  }

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
    debugLog('[SidePanel] 詳細カードのみ更新');
  } else {
    debugLog('[SidePanel] 時間枠のデータなし - カードをリセット');
    resetSignalCards();
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

// 星表示ヘルパー関数（5段階）
function getStarRating(level) {
  // level: 1-5
  const filled = Math.min(5, Math.max(1, level));
  const empty = 5 - filled;
  return '★'.repeat(filled) + '☆'.repeat(empty);
}

// confidence値から星レベルを計算（テクニカル分析用）
// テクニカル分析のシグナル（HIGH/LOW）は60%以上で発出
// 案B: 60-64%→★1, 65-69%→★2, 70-79%→★3, 80-89%→★4, 90%+→★5
function getConfidenceStarLevel(confidence) {
  if (confidence >= 90) return 5;
  if (confidence >= 80) return 4;
  if (confidence >= 70) return 3;
  if (confidence >= 65) return 2;
  return 1; // 60-64%（シグナル発出時の最低ライン）
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

  // デバッグ: available状態を確認
  console.log('[SidePanel] 🔍 AI available状態:', {
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

// 相場状況カード更新（案1: デュアルゲージ - 強度+ボラティリティ）
// 前回の値を保持（アニメーション用）
let lastTechValues = { strength: 0, grade: 'C', volatility: '中', judgment: '', volaPercent: 50 };

function updateTechnicalCard(technical) {
  const detailBox = document.getElementById('tech-detail');

  if (!detailBox) return;

  // 固定高さのコンテナを常に維持（待機中もデータ表示時と同じ高さ）
  if (!technical) {
    detailBox.innerHTML = `
      <div class="tech-dashboard">
        <div class="tech-waiting-state">
          <div class="tech-waiting-icon">📊</div>
          <div class="tech-waiting-text">分析データを待機中...</div>
        </div>
      </div>
    `;
    return;
  }

  // トレンド情報を解析
  const trendText = technical.trendDisplayText || '';
  let strength = 0;
  let grade = 'C';
  let gradeLabel = '普通';

  // 強度を抽出 (例: "強度: 40/100")
  const strengthMatch = trendText.match(/強度[：:]\s*(\d+)/);
  if (strengthMatch) {
    strength = parseInt(strengthMatch[1], 10);
  }

  // グレードを抽出 (例: "C級")
  const gradeMatch = trendText.match(/([SABCDE])級/);
  if (gradeMatch) {
    grade = gradeMatch[1];
  }

  // グレードラベルの対応表
  const gradeLabels = {
    'S': '最強',
    'A': '強い',
    'B': 'やや強',
    'C': '普通',
    'D': '弱い',
    'E': '最弱'
  };
  gradeLabel = gradeLabels[grade] || '普通';

  // 判定テキストと色クラス
  let judgmentClass = '';
  const judgment = technical.overallJudgment || '';
  if (judgment.includes('上昇') || judgment.includes('HIGH')) {
    judgmentClass = 'judgment-up';
  } else if (judgment.includes('下降') || judgment.includes('LOW')) {
    judgmentClass = 'judgment-down';
  }

  // ボラティリティを解析（高/中/低 → ゲージ用パーセント変換）
  const volatilityRaw = technical.volatility || '-';
  let volatilityLevel = '中';
  let volatilityClass = 'vola-medium';
  let volaPercent = 50; // デフォルト中間
  let volaColor = '#ff9800'; // orange

  if (volatilityRaw === '高い' || volatilityRaw === '非常に高い' || volatilityRaw.includes('高')) {
    volatilityLevel = '高';
    volatilityClass = 'vola-high';
    volaPercent = volatilityRaw === '非常に高い' ? 95 : 80;
    volaColor = '#f44336'; // red
  } else if (volatilityRaw === '低い' || volatilityRaw === '非常に低い' || volatilityRaw.includes('低')) {
    volatilityLevel = '低';
    volatilityClass = 'vola-low';
    volaPercent = volatilityRaw === '非常に低い' ? 10 : 25;
    volaColor = '#4caf50'; // green
  } else if (volatilityRaw === '-') {
    volatilityLevel = '-';
    volatilityClass = 'vola-unknown';
    volaPercent = 0;
    volaColor = '#9e9e9e';
  }

  // 強度に基づく色
  let strengthColor = '#9e9e9e'; // neutral
  if (strength >= 70) {
    strengthColor = '#4caf50'; // green
  } else if (strength >= 40) {
    strengthColor = '#ff9800'; // orange
  } else if (strength > 0) {
    strengthColor = '#f44336'; // red
  }

  // 初回レンダリングかどうか（tech-dual-gaugesがあれば既にデータ表示済み）
  const isFirstRender = !detailBox.querySelector('.tech-dual-gauges');

  if (isFirstRender) {
    // 初回: HTML構造を作成（デュアルゲージレイアウト）
    detailBox.innerHTML = `
      <div class="tech-dashboard">
        <div class="tech-dual-gauges">
          <!-- 強度ゲージ -->
          <div class="tech-gauge-item">
            <div class="tech-circle-gauge" id="tech-strength-gauge">
              <svg viewBox="0 0 100 100">
                <circle class="gauge-bg" cx="50" cy="50" r="42" />
                <circle class="gauge-fill strength-fill" cx="50" cy="50" r="42"
                        stroke-dasharray="264"
                        stroke-dashoffset="264"
                        style="stroke: ${strengthColor};" />
              </svg>
              <div class="gauge-center">
                <span class="gauge-value" id="strength-value">0</span>
                <span class="gauge-unit">%</span>
              </div>
            </div>
            <div class="tech-gauge-label">強度</div>
          </div>

          <!-- ボラティリティゲージ -->
          <div class="tech-gauge-item">
            <div class="tech-circle-gauge" id="tech-vola-gauge">
              <svg viewBox="0 0 100 100">
                <circle class="gauge-bg" cx="50" cy="50" r="42" />
                <circle class="gauge-fill vola-fill" cx="50" cy="50" r="42"
                        stroke-dasharray="264"
                        stroke-dashoffset="264"
                        style="stroke: ${volaColor};" />
              </svg>
              <div class="gauge-center">
                <span class="gauge-vola-label ${volatilityClass}" id="vola-label">${volatilityLevel}</span>
              </div>
            </div>
            <div class="tech-gauge-label">ボラ</div>
          </div>
        </div>

        <!-- 情報エリア -->
        <div class="tech-compact-info">
          <div class="tech-compact-row">
            <span class="tech-compact-label">判定</span>
            <span class="tech-compact-value ${judgmentClass}" id="tech-judgment">${judgment || '-'}</span>
          </div>
          <div class="tech-compact-row">
            <span class="tech-compact-label">グレード</span>
            <span class="tech-compact-value">
              <span class="tech-grade-pill grade-${grade.toLowerCase()}" id="tech-grade">${grade}</span>
              <span class="tech-grade-text" id="tech-grade-label">${gradeLabel}</span>
            </span>
          </div>
        </div>
      </div>
    `;

    // 初回アニメーション（少し遅延させて開始）
    requestAnimationFrame(() => {
      animateStrengthGauge(0, strength, strengthColor);
      animateVolaGauge(0, volaPercent, volaColor);
    });
  } else {
    // 更新: 既存の要素を滑らかに更新
    const judgmentEl = detailBox.querySelector('#tech-judgment');
    const gradeEl = detailBox.querySelector('#tech-grade');
    const gradeLabelEl = detailBox.querySelector('#tech-grade-label');
    const volaLabelEl = detailBox.querySelector('#vola-label');

    // 強度ゲージをアニメーション更新
    if (lastTechValues.strength !== strength) {
      animateStrengthGauge(lastTechValues.strength, strength, strengthColor);
    }

    // ボラゲージをアニメーション更新
    if (lastTechValues.volaPercent !== volaPercent) {
      animateVolaGauge(lastTechValues.volaPercent, volaPercent, volaColor);
    }

    // ボララベル更新
    if (volaLabelEl && lastTechValues.volatility !== volatilityLevel) {
      volaLabelEl.classList.add('value-updating');
      setTimeout(() => {
        volaLabelEl.textContent = volatilityLevel;
        volaLabelEl.className = `gauge-vola-label ${volatilityClass}`;
        volaLabelEl.id = 'vola-label';
        volaLabelEl.classList.remove('value-updating');
      }, 150);
    }

    // 判定更新（フェードアニメーション）
    if (judgmentEl && lastTechValues.judgment !== judgment) {
      judgmentEl.classList.add('value-updating');
      setTimeout(() => {
        judgmentEl.textContent = judgment || '-';
        judgmentEl.className = `tech-compact-value ${judgmentClass}`;
        judgmentEl.id = 'tech-judgment';
        judgmentEl.classList.remove('value-updating');
      }, 150);
    }

    // グレード更新
    if (gradeEl && lastTechValues.grade !== grade) {
      gradeEl.classList.add('value-updating');
      gradeLabelEl.classList.add('value-updating');
      setTimeout(() => {
        gradeEl.textContent = grade;
        gradeEl.className = `tech-grade-pill grade-${grade.toLowerCase()}`;
        gradeEl.id = 'tech-grade';
        gradeLabelEl.textContent = gradeLabel;
        gradeEl.classList.remove('value-updating');
        gradeLabelEl.classList.remove('value-updating');
      }, 150);
    }
  }

  // 値を保存
  lastTechValues = { strength, grade, volatility: volatilityLevel, judgment, volaPercent };
}

// 強度ゲージアニメーション関数
function animateStrengthGauge(fromValue, toValue, color) {
  const detailBox = document.getElementById('tech-detail');
  if (!detailBox) return;

  const gaugeFill = detailBox.querySelector('.strength-fill');
  const gaugeValue = detailBox.querySelector('#strength-value');
  if (!gaugeFill || !gaugeValue) return;

  const duration = 600; // ms
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // イージング (ease-out-cubic)
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentValue = Math.round(fromValue + (toValue - fromValue) * eased);
    const offset = 264 - (currentValue / 100) * 264;

    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.style.stroke = color;
    gaugeValue.textContent = currentValue;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

// ボラゲージアニメーション関数
function animateVolaGauge(fromValue, toValue, color) {
  const detailBox = document.getElementById('tech-detail');
  if (!detailBox) return;

  const gaugeFill = detailBox.querySelector('.vola-fill');
  if (!gaugeFill) return;

  const duration = 600; // ms
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // イージング (ease-out-cubic)
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentValue = fromValue + (toValue - fromValue) * eased;
    const offset = 264 - (currentValue / 100) * 264;

    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.style.stroke = color;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

// AI予測詳細カード更新（シグナルはメインカードのみ）
function updateAICard(ai, stratification) {
  const probUp = document.getElementById('prob-up');
  const probDown = document.getElementById('prob-down');
  const probBarUp = document.getElementById('prob-bar-up');
  const probBarDown = document.getElementById('prob-bar-down');
  const detailBox = document.getElementById('ai-detail');
  const probContainer = document.getElementById('probability-container');

  const available = ai ? ai.available : false;
  const signal = ai ? (ai.signal || 'NEUTRAL') : 'NEUTRAL';
  const matchCount = ai ? (ai.matchCount || 0) : 0;

  // チカチカ防止
  if (lastAISignal.signal === signal &&
      lastAISignal.matchCount === matchCount &&
      lastAISignal.available === available) {
    return;
  }
  lastAISignal = { signal, matchCount, available };

  if (!available) {
    if (probUp) probUp.textContent = '上昇 --%';
    if (probDown) probDown.textContent = '下降 --%';
    if (probBarUp) probBarUp.style.width = '0%';
    if (probBarDown) probBarDown.style.width = '0%';

    // INSUFFICIENT_DATA（マッチパターン不足）の場合はマッチパターン数を表示
    if (ai && ai.signal === 'INSUFFICIENT_DATA') {
      const threshold = currentSettings.similarityThreshold || 50;
      if (detailBox) {
        detailBox.innerHTML = `
          <p class="detail-text" style="font-weight: 600;">
            閾値${threshold}%以上: <strong style="font-weight: 700;">${matchCount}件</strong>
            <span style="color: #999; font-size: 0.85em;">（最低10件必要）</span>
          </p>
        `;
      }
    } else {
      if (detailBox) detailBox.innerHTML = '<p class="detail-text">学習データ収集中...</p>';
    }
    return;
  }

  // 層別化データがある場合はそちらを優先表示
  let displayUpRate = ai.upRate || 0;
  let displayDownRate = ai.downRate || 0;
  let hasStratification = false;
  let originalUpRate = ai.upRate || 0;
  let originalDownRate = ai.downRate || 0;

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

// 層別化インサイトを表示
function updateStratificationInsights(stratification) {
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

// ML学習状況更新
function updateMLStatus(mlStats) {
  if (!mlStats) return;

  const rawDataCount = mlStats.dataCountWithResults || mlStats.dataCount || 0;
  const learningLevel = mlStats.learningLevel;

  // チカチカ防止: データカウントは増加のみ許可（減少は無視）
  // これにより 3179 → 3178 → 3179 のような行ったり来たりを防止
  const dataCountWithResults = Math.max(highestMLDataCount, rawDataCount);
  if (rawDataCount > highestMLDataCount) {
    highestMLDataCount = rawDataCount;
  }

  // 値が変わっていない場合は更新をスキップ
  if (lastMLStats.dataCountWithResults === dataCountWithResults &&
      lastMLStats.learningLevel === learningLevel) {
    return;
  }
  lastMLStats = { dataCountWithResults, dataCount: mlStats.dataCount, learningLevel };

  const dataCountEl = document.getElementById('ml-data-count');
  const learningLevelEl = document.getElementById('ml-learning-level');
  const progressBar = document.getElementById('ml-progress-bar');
  const countBadge = document.getElementById('ml-count-badge');

  const countText = dataCountWithResults.toLocaleString();

  if (dataCountEl) dataCountEl.textContent = countText;
  if (countBadge) countBadge.textContent = `${countText}件`;
  if (learningLevelEl && learningLevel !== undefined) {
    learningLevelEl.textContent = learningLevel;
  }
  if (progressBar) {
    const progress = Math.min(100, (dataCountWithResults / 50000) * 100);
    progressBar.style.width = `${progress}%`;
  }
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

debugLog('[SidePanel] Material Design 3 スクリプト読み込み完了');
