// ========================================
// TheOption シグナル PWA - メインロジック
// PCの拡張機能が live_signals/{PCキー} に書き込むシグナルを購読して表示・通知する
// ========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ---- 設定（拡張機能と同じFirebaseプロジェクト）----
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCuPbyOoP3-ILBBNLzx70ox2grmgjhknEQ',
  projectId: 'theoption-license'
};
const LICENSE_COLLECTION = 'licenses';
const LIVE_COLLECTION = 'live_signals';
const RECHECK_INTERVAL = 24 * 60 * 60 * 1000;   // ライセンス再検証間隔（24h）
const PC_ONLINE_THRESHOLD = 90 * 1000;          // PC生存とみなす最終更新からの猶予（90秒）
const HISTORY_MAX = 10;

// ---- localStorage キー ----
const LS_AUTH = 'theoption_mobile_auth';        // { mobLicense, channel, deviceId, validatedAt }
const LS_HISTORY = 'theoption_mobile_history';
const LS_SOUND = 'theoption_mobile_sound';       // 通知音 ON/OFF（'off'でOFF、それ以外ON）

// ---- 状態 ----
let db = null;
let unsubscribe = null;
let countdownTimer = null;
let current = null;        // 現在のシグナルドキュメント（JS化済み）
let lastSeq = null;        // 新規シグナル検知用
let panelsHold = false;    // 取引終了後、次のシグナルまでテクニカル/AIをデフォルト表示に保持
let wasTrading = false;    // 直前が取引中だったか（取引終了の検出用）
let soundOn = localStorage.getItem(LS_SOUND) !== 'off';  // 通知音設定（デフォルトON）
let audioCtx = null;       // 音声再生用（ユーザー操作で解禁）
let audioUnlocked = false;

// ========================================
// 起動
// ========================================
init();

async function init() {
  // URLの ?ch= をチャンネル候補として控える（QR経由のアクセス）
  const params = new URLSearchParams(location.search);
  const chFromUrl = params.get('ch');

  const auth = loadAuth();

  if (auth && auth.mobLicense && auth.channel) {
    // 24時間以内なら再検証スキップ、超過していれば再検証
    const fresh = (Date.now() - (auth.validatedAt || 0)) < RECHECK_INTERVAL;
    if (fresh) {
      startApp(auth.channel);
      return;
    }
    const re = await validateLicense(auth.mobLicense, chFromUrl);
    if (re.ok) {
      startApp(re.channel);
      return;
    }
    // 再検証失敗 → ログインへ
    clearAuth();
  }

  showLogin(chFromUrl);
}

// ========================================
// ログイン画面
// ========================================
function showLogin(chFromUrl) {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('main-screen').hidden = true;

  const input = document.getElementById('license-input');
  const button = document.getElementById('login-button');
  const errorEl = document.getElementById('login-error');

  const submit = async () => {
    const key = input.value.trim().toUpperCase();
    errorEl.hidden = true;
    if (!key) { showLoginError('ライセンスキーを入力してください'); return; }
    button.disabled = true;
    button.textContent = '認証中…';
    // ログインのタップ操作で音声を解禁（iOS/Android対策）
    ensureAudio();
    const result = await validateLicense(key, chFromUrl);
    button.disabled = false;
    button.textContent = '認証して接続';
    if (!result.ok) {
      showLoginError(result.reason || '認証に失敗しました');
      return;
    }
    saveAuth({ mobLicense: key, channel: result.channel, deviceId: result.deviceId, validatedAt: Date.now() });
    startApp(result.channel);
  };

  button.onclick = submit;
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
}

function showLoginError(msg) {
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

// ========================================
// ライセンス検証（Firestore REST）— license-manager.js のロジックを移植
// ========================================
async function validateLicense(mobKey, chFromUrl) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}` +
      `/databases/(default)/documents/${LICENSE_COLLECTION}/${encodeURIComponent(mobKey)}?key=${FIREBASE_CONFIG.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return { ok: false, reason: 'ライセンスキーが見つかりません' };
      return { ok: false, reason: `通信エラー (HTTP ${res.status})` };
    }
    const data = await res.json();
    const f = data.fields;
    if (!f) return { ok: false, reason: 'ライセンスデータが不正です' };

    const type = f.type?.stringValue || (mobKey.startsWith('MOB-') ? 'mobile' : 'pc');
    if (type !== 'mobile') {
      return { ok: false, reason: 'これはスマホ版ライセンス（MOB-）ではありません' };
    }
    const isActive = f.active?.booleanValue ?? false;
    if (!isActive) return { ok: false, reason: 'このライセンスは無効化されています' };

    const expiryDate = f.expiryDate?.timestampValue;
    if (expiryDate && new Date(expiryDate) < new Date()) {
      return { ok: false, reason: 'ライセンスの有効期限が切れています' };
    }

    const channel = f.pairedPcLicense?.stringValue || null;
    if (!channel) {
      return { ok: false, reason: 'ペアのPC版ライセンスが設定されていません' };
    }
    // QRのチャンネルと食い違う場合はライセンス側を優先（警告のみ）
    if (chFromUrl && chFromUrl !== channel) {
      console.warn('[Mobile] QRのチャンネルとライセンスのペアが不一致。ライセンス側を採用します。');
    }

    // デバイス登録（スマホはキャッシュ削除で端末IDが変わるため「置き換え方式」）
    const maxDevices = parseInt(f.maxDevices?.integerValue ?? '1', 10);
    const devicesArr = (f.devices?.arrayValue?.values || []).map(v => v.stringValue);
    const deviceId = getOrCreateDeviceId();
    if (!devicesArr.includes(deviceId)) {
      let newDevices;
      if (devicesArr.length < maxDevices) {
        // 空きあり → 追加登録
        newDevices = [...devicesArr, deviceId];
      } else {
        // 上限到達 → 最も古い端末を新しい端末で置き換える（最新の maxDevices 台を保持）
        // ※キャッシュ削除→再認証で締め出されないようにするため。同時利用は上限台数までに制限される。
        const keep = maxDevices > 1 ? devicesArr.slice(-(maxDevices - 1)) : [];
        newDevices = keep.concat(deviceId);
      }
      const reg = await registerDevice(mobKey, newDevices);
      if (!reg) return { ok: false, reason: 'デバイス登録に失敗しました' };
    }

    return { ok: true, channel, deviceId };
  } catch (e) {
    return { ok: false, reason: `検証エラー: ${e.message}` };
  }
}

async function registerDevice(mobKey, updatedDevices) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}` +
      `/databases/(default)/documents/${LICENSE_COLLECTION}/${encodeURIComponent(mobKey)}` +
      `?updateMask.fieldPaths=devices&key=${FIREBASE_CONFIG.apiKey}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { devices: { arrayValue: { values: updatedDevices.map(d => ({ stringValue: d })) } } }
      })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem('theoption_mobile_deviceId');
  if (!id) {
    const rand = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 8);
    id = `DEV-${rand}-${Date.now().toString(36)}`;
    localStorage.setItem('theoption_mobile_deviceId', id);
  }
  return id;
}

// ========================================
// メインアプリ起動 — Firestore購読
// ========================================
function startApp(channel) {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('main-screen').hidden = false;

  wireMainControls(channel);
  detectiOSInstallHint();

  if (!db) {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
  }

  if (unsubscribe) unsubscribe();
  const ref = doc(db, LIVE_COLLECTION, channel);
  unsubscribe = onSnapshot(ref, (snap) => {
    if (!snap.exists()) { renderNoData(); return; }
    handleSnapshot(snap.data());
  }, (err) => {
    console.error('[Mobile] 購読エラー:', err);
    setPcStatus('接続エラー', false);
  });

  // ローカルカウントダウン（毎秒・通信なし）
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);

  renderHistory(loadHistory());
}

// Firestoreドキュメント（SDKがネイティブ値に変換済み）を処理
function handleSnapshot(d) {
  const data = {
    asset: d.asset || '',
    timeframe: d.timeframe || 0,
    signalDir: d.signalDir || 'NONE',
    // テクニカル
    techDir: d.techDir || 'NEUTRAL',
    techConf: num(d.techConf),
    starLevel: num(d.starLevel),
    highCount: num(d.highCount),
    lowCount: num(d.lowCount),
    // AI予測
    aiDir: d.aiDir || 'NONE',
    aiUpRate: d.aiUpRate != null ? num(d.aiUpRate) : null,
    aiDownRate: d.aiDownRate != null ? num(d.aiDownRate) : null,
    aiConf: d.aiConf != null ? num(d.aiConf) : null,
    mlLevel: num(d.mlLevel),
    // カウントダウン
    entryAt: toMillis(d.entryAt),
    expiresAt: toMillis(d.expiresAt),
    nextEntryAt: toMillis(d.nextEntryAt),
    isTrading: !!d.isTrading,
    tradingRemaining: num(d.tradingRemaining),
    updatedAt: toMillis(d.updatedAt),
    seq: num(d.seq),
    signalMode: d.signalMode || ''
  };

  // 新規シグナル検知（seqが増え、方向がHIGH/LOW）
  const isNewSignal = lastSeq !== null && data.seq > lastSeq &&
    (data.signalDir === 'HIGH' || data.signalDir === 'LOW');

  current = data;
  if (lastSeq === null) {
    lastSeq = data.seq; // 初回はベースライン設定のみ（過去シグナルで通知しない）
  } else if (data.seq > lastSeq) {
    lastSeq = data.seq;
  }

  if (isNewSignal) {
    panelsHold = false; // 新しいシグナル → パネルのデフォルト保持を解除して表示
    pushHistory(data);
    notifyNewSignal(data);
  }

  render();
}

// ========================================
// 描画
// ========================================
const DIR_LABEL = { HIGH: '上昇', LOW: '下降', NEUTRAL: '中立', NONE: '—' };

function render() {
  const waitingNote = document.getElementById('waiting-note');
  if (!current) {
    waitingNote.hidden = false;
    setPcStatus('待機中', null);
    return;
  }
  waitingNote.hidden = true;
  updatePcStatus();
  applyPanels();
  tick(); // 準備カウントダウン・エントリーバナーを即時更新
}

// テクニカル/AIパネルの描画。panelsHold（取引終了後〜次シグナルまで）はデフォルト表示にする。
function applyPanels() {
  if (!current) return;
  const hold = panelsHold;

  // --- テクニカル ---
  const techPanel = document.getElementById('tech-panel');
  setPanelDir(techPanel, document.getElementById('tech-dir'), hold ? 'NONE' : current.techDir);
  const techStars = Math.max(0, Math.min(3, current.starLevel));
  document.getElementById('tech-stars').textContent =
    (!hold && techStars > 0) ? '★'.repeat(techStars) + '☆'.repeat(3 - techStars) : '☆☆☆';
  document.getElementById('tech-sub').textContent =
    hold ? '20指標 待機中'
         : ((current.highCount || current.lowCount) ? `20指標 H${current.highCount} / L${current.lowCount}` : '20指標 集計中');

  // --- AI予測 ---
  const aiPanel = document.getElementById('ai-panel');
  setPanelDir(aiPanel, document.getElementById('ai-dir'), hold ? 'NONE' : current.aiDir);
  const ratesEl = document.getElementById('ai-rates');
  if (hold) {
    ratesEl.textContent = '待機中';
  } else if (current.aiUpRate != null && current.aiDownRate != null) {
    ratesEl.textContent = `↑${Math.round(current.aiUpRate)}%　↓${Math.round(current.aiDownRate)}%`;
  } else {
    ratesEl.textContent = '判定準備中';
  }
  document.getElementById('ai-sub').textContent = `学習 ${current.mlLevel || 0}%`;
}

// エントリーバナーの表示更新（期限切れで自動的に消す＝前回シグナルの残留防止）
function updateEntryBanner(now) {
  const banner = document.getElementById('entry-banner');
  const hasEntry = current && (current.signalDir === 'HIGH' || current.signalDir === 'LOW');
  const notExpired = current && (!current.expiresAt || now < current.expiresAt);
  if (hasEntry && notExpired) {
    banner.hidden = false;
    banner.classList.toggle('high', current.signalDir === 'HIGH');
    banner.classList.toggle('low', current.signalDir === 'LOW');
    document.getElementById('entry-arrow').textContent = current.signalDir === 'HIGH' ? '▲' : '▼';
    document.getElementById('entry-text').textContent =
      current.signalDir === 'HIGH' ? 'エントリー HIGH（上昇）' : 'エントリー LOW（下降）';
    const s = Math.max(0, Math.min(3, current.starLevel));
    document.getElementById('entry-stars').textContent = s > 0 ? '★'.repeat(s) : '';
  } else {
    banner.hidden = true;
  }
}

// PCがまだ一度も書き込んでいない（ドキュメント未存在）
function renderNoData() {
  document.getElementById('waiting-note').hidden = false;
  document.getElementById('entry-banner').hidden = true;
  setPcStatus('PC未送信', null);
}

// パネルの方向表示（色・矢印）を設定
function setPanelDir(panelEl, dirEl, dir) {
  panelEl.classList.toggle('high', dir === 'HIGH');
  panelEl.classList.toggle('low', dir === 'LOW');
  const arrow = dir === 'HIGH' ? '▲ ' : dir === 'LOW' ? '▼ ' : '';
  dirEl.textContent = arrow + (DIR_LABEL[dir] || '—');
}

// 毎秒の準備カウントダウン更新（通信なし・ローカル計算）
// 状態色をPC版に合わせる: 分析中=グレー / 準備中=オレンジ / 取引中=赤
function tick() {
  if (!current) return;
  const now = Date.now();
  const bar = document.getElementById('prep-bar');
  const labelEl = document.getElementById('prep-label');
  const valueEl = document.getElementById('prep-value');
  document.getElementById('prep-asset').textContent = current.asset || '--';
  document.getElementById('prep-tf').textContent = formatTimeframe(current.timeframe);

  const hasEntry = (current.signalDir === 'HIGH' || current.signalDir === 'LOW');
  const trading = current.isTrading && current.expiresAt && now < current.expiresAt;
  const preparing = hasEntry && current.entryAt && now < current.entryAt;

  // 取引終了を検出 → テクニカル/AIを即デフォルトへ（次シグナルまで保持）
  if (wasTrading && !trading) {
    panelsHold = true;
    applyPanels();
  }
  wasTrading = trading;

  let phase, label, value;
  if (trading) {
    phase = 'phase-trading';
    label = '取引中 残り';
    value = Math.ceil((current.expiresAt - now) / 1000) + '秒';
  } else if (preparing) {
    phase = 'phase-ready';
    label = '準備中 エントリーまで';
    value = Math.ceil((current.entryAt - now) / 1000) + '秒';
  } else {
    phase = 'phase-analyzing';
    label = '分析中 次の判定まで';
    const rem = prepRemaining(now);
    value = rem != null ? rem + '秒' : '--';
  }
  bar.classList.remove('phase-analyzing', 'phase-ready', 'phase-trading');
  bar.classList.add(phase);
  labelEl.textContent = label;
  valueEl.textContent = value;

  updateEntryBanner(now);
  updatePcStatus();
}

// 準備カウントダウンの残り秒（nextEntryAtを基準に、過ぎたらtimeframe分ローリング）
function prepRemaining(now) {
  if (!current || !current.nextEntryAt) return null;
  const tf = current.timeframe || 0;
  let target = current.nextEntryAt;
  let rem = Math.ceil((target - now) / 1000);
  if (rem <= 0 && tf > 0) {
    // 判定時刻を過ぎた場合は次サイクルへ（最大100回でガード）
    let guard = 0;
    while (rem <= 0 && guard < 100) { target += tf * 1000; rem = Math.ceil((target - now) / 1000); guard++; }
  }
  return rem > 0 ? rem : null;
}

function updatePcStatus() {
  if (!current || !current.updatedAt) { setPcStatus('--', null); return; }
  const online = (Date.now() - current.updatedAt) < PC_ONLINE_THRESHOLD;
  setPcStatus(online ? 'PC稼働中' : 'PCオフライン', online);
}

function setPcStatus(text, online) {
  const el = document.getElementById('pc-status');
  el.textContent = (online === true ? '🟢 ' : online === false ? '🔴 ' : '') + text;
}

// ========================================
// 履歴
// ========================================
function pushHistory(data) {
  // このシグナルにテクニカル/AIのどちらが一致したか（両方一致＝両者がエントリー方向と同じ）
  const techMatch = data.techDir === data.signalDir;
  const aiMatch = data.aiDir === data.signalDir;
  const list = loadHistory();
  list.unshift({
    asset: data.asset,
    dir: data.signalDir,
    timeframe: data.timeframe,
    starLevel: data.starLevel,
    tech: techMatch,
    ai: aiMatch,
    time: Date.now()
  });
  const trimmed = list.slice(0, HISTORY_MAX);
  localStorage.setItem(LS_HISTORY, JSON.stringify(trimmed));
  renderHistory(trimmed);
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { return []; }
}

function renderHistory(list) {
  const ul = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  ul.querySelectorAll('.history-item').forEach(el => el.remove());
  if (!list.length) { empty.hidden = false; return; }
  empty.hidden = true;
  for (const h of list) {
    const li = document.createElement('li');
    li.className = 'history-item ' + (h.dir === 'HIGH' ? 'high' : 'low');
    const arrow = h.dir === 'HIGH' ? '▲' : '▼';
    // シグナルの出どころ（テクニカル/AI/両方）
    let srcLabel, srcClass;
    if (h.tech && h.ai) { srcLabel = 'テク+AI'; srcClass = 'both'; }
    else if (h.tech) { srcLabel = 'テクニカル'; srcClass = 'tech'; }
    else if (h.ai) { srcLabel = 'AI'; srcClass = 'ai'; }
    else { srcLabel = '—'; srcClass = ''; }
    li.innerHTML = `
      <span class="hi-time">${formatClock(h.time)}</span>
      <span class="hi-asset">${h.asset}</span>
      <span class="hi-dir">${arrow} ${h.dir}</span>
      <span class="hi-src ${srcClass}">${srcLabel}</span>
      <span class="hi-tf">${formatTimeframe(h.timeframe)}</span>`;
    ul.appendChild(li);
  }
}

// ========================================
// 通知（アプリ内・音のみ。バイブは無し）
// ========================================
function notifyNewSignal(data) {
  if (soundOn) playBeep(data.signalDir === 'HIGH');
}

// ユーザー操作時に音声を解禁（iOS/Android対策）。ONのときのみ。
function ensureAudio() {
  if (audioUnlocked || !soundOn) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioUnlocked = true;
  } catch (e) { /* 非対応 */ }
}

// 通知音 ON/OFF を設定して保存・UI反映
function setSound(on) {
  soundOn = !!on;
  localStorage.setItem(LS_SOUND, soundOn ? 'on' : 'off');
  const toggle = document.getElementById('sound-toggle');
  if (toggle) toggle.classList.toggle('on', soundOn);
  if (soundOn) ensureAudio();
}

function playBeep(high) {
  if (!soundOn || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = high ? 880 : 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) { /* 無視 */ }
}

// ========================================
// メイン画面のコントロール配線
// ========================================
function wireMainControls(channel) {
  // 通知音トグル
  const soundToggle = document.getElementById('sound-toggle');
  if (soundToggle) {
    soundToggle.classList.toggle('on', soundOn);
    soundToggle.onclick = () => setSound(!soundOn);
  }
  // 最初のユーザー操作で音声を解禁（ONの場合）
  const unlock = () => { ensureAudio(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock, { once: true });

  document.getElementById('logout-button').onclick = () => {
    if (unsubscribe) unsubscribe();
    if (countdownTimer) clearInterval(countdownTimer);
    clearAuth();
    location.reload();
  };
}

function detectiOSInstallHint() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    document.getElementById('install-hint').hidden = false;
  }
}

// ========================================
// ユーティリティ
// ========================================
function num(v) { return typeof v === 'number' ? v : (v != null ? Number(v) || 0 : 0); }
function toMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis(); // Firestore Timestamp
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}
function formatTimeframe(tf) {
  if (!tf) return '--';
  if (tf < 60) return `${tf}秒`;
  return `${tf / 60}分`;
}
function formatClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function loadAuth() { try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch (e) { return null; } }
function saveAuth(a) { localStorage.setItem(LS_AUTH, JSON.stringify(a)); }
function clearAuth() { localStorage.removeItem(LS_AUTH); }

// ========================================
// Service Worker 登録（オフラインシェル）
// ========================================
if ('serviceWorker' in navigator) {
  // 既にSWが制御中の場合、新SWが有効化されたら一度だけリロードして最新を反映
  if (navigator.serviceWorker.controller) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => reg.update())
      .catch(() => {});
  });
}
