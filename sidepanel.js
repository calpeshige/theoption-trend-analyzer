/**
 * Side Panel JavaScript - Material Design 3
 * Professional Trading Interface
 */

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
  trendStrength: 'medium',
  similarityThreshold: 70,
  dataLimit: 'all'
};

// 状態管理
let currentTimeframe = 60;
let latestAnalysisData = null;
let expandedCards = new Set(['tech-card', 'ai-card']); // デフォルトで展開

// チカチカ防止用の前回値
let lastMLStats = { dataCountWithResults: null, dataCount: null, learningLevel: null };
let lastAISignal = { signal: null, similarity: null, available: null };
let lastTechSignal = { signal: null, confidence: null };
// データカウントは常に増加のみ許可（チカチカ防止）
let highestMLDataCount = 0;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[SidePanel] Material Design 3 インターフェース初期化');

  loadSettings();
  setupEventListeners();
  listenForAnalysisUpdates();
  listenForStorageChanges();
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
      document.getElementById('asset-name-display').textContent = changes.sidepanel_asset.newValue;
    }
    if (changes.sidepanel_dataCount?.newValue !== undefined) {
      document.getElementById('asset-data-count').textContent = `${changes.sidepanel_dataCount.newValue}件`;
    }
  });
}

// 設定読み込み
function loadSettings() {
  chrome.storage.local.get(['alertSoundEnabled', 'alertVolume', 'alertSoundType', 'fontSize', 'trendStrengthFilter', 'similarityThreshold', 'dataLimit'], (result) => {
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
    if (result.trendStrengthFilter) {
      currentSettings.trendStrength = result.trendStrengthFilter;
      document.getElementById('trend-strength-select').value = result.trendStrengthFilter;
    }
    if (result.similarityThreshold) {
      currentSettings.similarityThreshold = result.similarityThreshold;
      updateThresholdChips(result.similarityThreshold);
    }
    const dataLimit = result.dataLimit || 'all';
    currentSettings.dataLimit = dataLimit;
    updateDataLimitChips(dataLimit);
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

  // トレンド強度フィルター
  document.getElementById('trend-strength-select').addEventListener('change', (e) => {
    currentSettings.trendStrength = e.target.value;
    chrome.storage.local.set({ trendStrengthFilter: e.target.value });
    notifySettingChange('trendStrengthFilter', e.target.value);
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

// ダウンロードリクエスト
function requestDownload(type) {
  console.log('[SidePanel] ダウンロードリクエスト:', type);
  chrome.runtime.sendMessage({ type: 'REQUEST_DOWNLOAD', downloadType: type });
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

  document.querySelectorAll('.timeframe-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.timeframe) === timeframe);
  });

  chrome.runtime.sendMessage({ type: 'TIMEFRAME_CHANGED', timeframe: timeframe });

  // 時間枠切替時は一旦リセットしてから新しいデータを表示
  if (latestAnalysisData) {
    updateDisplay(latestAnalysisData);
  } else {
    // データがない場合はリセット状態を表示
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
  chrome.storage.local.set({ dataLimit: limit });
  notifySettingChange('dataLimit', limit === 'all' ? null : parseInt(limit));
}

function updateDataLimitChips(limit) {
  document.querySelectorAll('#data-limit-chips .setting-chip').forEach(chip => {
    const chipLimit = chip.dataset.limit;
    const isActive = chipLimit === limit || (chipLimit === 'all' && limit === null);
    chip.classList.toggle('active', isActive);
  });
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
    return true;
  });
}

// シグナルカードをリセット（取引終了時）
function resetSignalCards() {
  console.log('[SidePanel] シグナルカードをリセット');

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
  lastAISignal = { signal: null, similarity: null, available: null };
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

  if (data.asset) {
    document.getElementById('asset-name-display').textContent = data.asset;
  }
  if (data.dataCount !== undefined) {
    document.getElementById('asset-data-count').textContent = `${data.dataCount}件`;
  }

  // シグナルリセット（取引終了時）
  if (data.signalReset) {
    resetSignalCards();
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

    // カウントダウンの最大値を更新（新しいサイクル開始時）
    if (countdown > lastCountdownTotal) {
      lastCountdownTotal = countdown;
    }
    // 取引中の場合は取引時間を使用
    const totalForRing = isTrading ? tradingDuration : lastCountdownTotal;
    const currentForRing = isTrading ? tradingRemaining : countdown;

    // シグナルがHIGHまたはLOWかどうかを判定（STRONG_HIGH/STRONG_LOWも含む）
    const hasSignal = signal && (
      signal.tech === 'HIGH' || signal.tech === 'LOW' ||
      signal.tech === 'STRONG_HIGH' || signal.tech === 'STRONG_LOW' ||
      signal.ai === 'HIGH' || signal.ai === 'LOW'
    );

    // アラート音はtheoption-analyzer.jsで再生するため、ここでは再生しない
    // （二重再生防止）

    // フェーズを決定して表示を変更
    if (isTrading) {
      // 取引中：判定時間のカウントダウン
      nextAnalysisEl.textContent = tradingRemaining;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-ready');
        countdownContainer.classList.add('phase-trading');
      }
      if (countdownLabel) countdownLabel.textContent = '取引中';
    } else if (countdown <= prepTime && countdown > 0 && hasSignal) {
      // 準備：シグナルがあり、残り5秒以内
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-analyzing', 'phase-trading');
        countdownContainer.classList.add('phase-ready');
      }
      if (countdownLabel) countdownLabel.textContent = '準備';
    } else {
      // 分析中：デフォルト状態
      nextAnalysisEl.textContent = countdown;
      if (countdownContainer) {
        countdownContainer.classList.remove('phase-ready', 'phase-trading');
        countdownContainer.classList.add('phase-analyzing');
      }
      if (countdownLabel) countdownLabel.textContent = '分析中';
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

  if (data.asset) {
    document.getElementById('asset-name-display').textContent = data.asset;
  }
  if (data.dataCount !== undefined) {
    document.getElementById('asset-data-count').textContent = `${data.dataCount}件`;
  }

  const timeframeData = data.timeframes ? data.timeframes[currentTimeframe] : null;

  // デバッグログ
  console.log('[SidePanel] 受信データ:', {
    timeframe: currentTimeframe,
    hasTimeframeData: !!timeframeData,
    aiData: timeframeData?.ai,
    techData: timeframeData?.technical?.signal
  });

  if (timeframeData) {
    updateDualSignals(timeframeData);
    updateTechnicalCard(timeframeData.technical);
    updateAICard(timeframeData.ai);
  } else {
    // 選択した時間枠のデータがない場合はカードをリセット
    console.log('[SidePanel] 時間枠のデータなし - カードをリセット');
    resetSignalCards();
  }

  if (data.mlStats) {
    updateMLStatus(data.mlStats);
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
      confidence = tech.confidence ? `${Math.round(tech.confidence)}%` : '';
    } else if (signal === 'LOW' || signal === 'STRONG_LOW') {
      dataSignal = 'low';
      label = 'LOW';
      confidence = tech.confidence ? `${Math.round(tech.confidence)}%` : '';
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

  // デバッグログ
  console.log('[SidePanel] AI予測データ:', ai);

  const available = ai ? ai.available : false;
  const status = ai ? ai.status : null;

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

  const signal = ai.signal || 'NEUTRAL';
  const similarity = ai.similarity;

  // 信頼度はupRate/downRateを使用（シグナル方向に応じて）
  const upRate = ai.upRate || 0;
  const downRate = ai.downRate || 0;

  if (signal === 'HIGH' || signal === 'STRONG_HIGH') {
    dataSignal = 'high';
    label = 'HIGH';
    confidence = upRate ? `${Math.round(upRate)}%` : '';
  } else if (signal === 'LOW' || signal === 'STRONG_LOW') {
    dataSignal = 'low';
    label = 'LOW';
    confidence = downRate ? `${Math.round(downRate)}%` : '';
  } else {
    dataSignal = 'wait';
    label = '見送り';
    confidence = '';
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

// テクニカル分析詳細カード更新（KPIカードスタイル）
function updateTechnicalCard(technical) {
  const detailBox = document.getElementById('tech-detail');

  if (!detailBox) return;

  if (!technical) {
    detailBox.innerHTML = '<p class="detail-text">分析データを待機中...</p>';
    return;
  }

  // チカチカ防止
  const signal = technical.signal || 'NEUTRAL';
  const conf = technical.confidence;
  if (lastTechSignal.signal === signal && lastTechSignal.confidence === conf) {
    return;
  }
  lastTechSignal = { signal, confidence: conf };

  // トレンド情報を解析
  const trendText = technical.trendDisplayText || '';
  let trendDirection = '横ばい';
  let trendClass = 'trend-neutral';
  let strength = 0;
  let grade = 'C';
  let gradeLabel = '普通';

  // トレンド方向を判定
  if (trendText.includes('上昇')) {
    trendDirection = '上昇';
    trendClass = 'trend-up';
  } else if (trendText.includes('下降')) {
    trendDirection = '下降';
    trendClass = 'trend-down';
  }

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

  // 判定の色クラス
  let judgmentClass = '';
  const judgment = technical.overallJudgment || '';
  if (judgment.includes('上昇') || judgment.includes('HIGH')) {
    judgmentClass = 'judgment-up';
  } else if (judgment.includes('下降') || judgment.includes('LOW')) {
    judgmentClass = 'judgment-down';
  }

  // KPIカードスタイルのHTML生成
  detailBox.innerHTML = `
    <div class="tech-kpi-grid">
      <div class="tech-kpi-card">
        <div class="tech-kpi-label">トレンド</div>
        <div class="tech-kpi-value ${trendClass}">${trendDirection === '上昇' ? '↑' : trendDirection === '下降' ? '↓' : '→'}</div>
        <div class="tech-kpi-sub">${trendDirection}</div>
      </div>
      <div class="tech-kpi-card">
        <div class="tech-kpi-label">強度</div>
        <div class="tech-kpi-value ${trendClass}">${strength}</div>
        <div class="tech-strength-bar">
          <div class="tech-strength-fill ${trendClass}" style="width: ${strength}%"></div>
        </div>
      </div>
      <div class="tech-kpi-card">
        <div class="tech-kpi-label">グレード</div>
        <div class="tech-grade-badge grade-${grade.toLowerCase()}">${grade}</div>
        <div class="tech-kpi-sub">${gradeLabel}</div>
      </div>
    </div>
    <div class="tech-summary">
      <div class="tech-summary-row">
        <span class="tech-summary-label">判定</span>
        <span class="tech-summary-value ${judgmentClass}">${judgment || '-'}</span>
      </div>
      <div class="tech-summary-row">
        <span class="tech-summary-label">推奨</span>
        <span class="tech-summary-value">${technical.recommendation || '-'}</span>
      </div>
    </div>
  `;
}

// AI予測詳細カード更新（シグナルはメインカードのみ）
function updateAICard(ai) {
  const probUp = document.getElementById('prob-up');
  const probDown = document.getElementById('prob-down');
  const probBarUp = document.getElementById('prob-bar-up');
  const probBarDown = document.getElementById('prob-bar-down');
  const detailBox = document.getElementById('ai-detail');
  const probContainer = document.getElementById('probability-container');

  const available = ai ? ai.available : false;
  const signal = ai ? (ai.signal || 'NEUTRAL') : 'NEUTRAL';
  const similarity = ai ? ai.similarity : null;

  // チカチカ防止
  if (lastAISignal.signal === signal &&
      lastAISignal.similarity === similarity &&
      lastAISignal.available === available) {
    return;
  }
  lastAISignal = { signal, similarity, available };

  if (!available) {
    if (probUp) probUp.textContent = '上昇 --%';
    if (probDown) probDown.textContent = '下降 --%';
    if (probBarUp) probBarUp.style.width = '0%';
    if (probBarDown) probBarDown.style.width = '0%';
    if (detailBox) detailBox.innerHTML = '<p class="detail-text">学習データ収集中...</p>';
    return;
  }

  // 確率バー更新
  const upRate = ai.upRate || 0;
  const downRate = ai.downRate || 0;
  if (probUp) probUp.textContent = `上昇 ${upRate}%`;
  if (probDown) probDown.textContent = `下降 ${downRate}%`;
  if (probBarUp) probBarUp.style.width = `${upRate}%`;
  if (probBarDown) probBarDown.style.width = `${downRate}%`;

  // 詳細情報のみ表示（シグナルバッジは表示しない）
  const matchCount = ai.matchCount || 0;
  if (detailBox) {
    detailBox.innerHTML = `
      <p class="detail-text" style="font-weight: 600;">
        マッチパターン: <strong style="font-weight: 700;">${matchCount}件</strong>
        ${similarity ? ` / 類似度: <strong style="font-weight: 700;">${Math.round(similarity)}%</strong>` : ''}
      </p>
    `;
  }
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
    console.warn('[SidePanel] アラート音再生エラー:', err);
  });
}

console.log('[SidePanel] Material Design 3 スクリプト読み込み完了');
