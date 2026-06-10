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

// ---- 状態 ----
let db = null;
let unsubscribe = null;
let countdownTimer = null;
let current = null;        // 現在のシグナルドキュメント（JS化済み）
let lastSeq = null;        // 新規シグナル検知用
let soundEnabled = false;
let audioCtx = null;

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
    enableSound();
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

    // デバイス登録
    const maxDevices = parseInt(f.maxDevices?.integerValue ?? '1', 10);
    const devicesArr = (f.devices?.arrayValue?.values || []).map(v => v.stringValue);
    const deviceId = getOrCreateDeviceId();
    if (!devicesArr.includes(deviceId)) {
      if (devicesArr.length >= maxDevices) {
        return { ok: false, reason: `このライセンスは既に${maxDevices}台で使用中です` };
      }
      const reg = await registerDevice(mobKey, [...devicesArr, deviceId]);
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
    if (!snap.exists()) { renderWaiting(); return; }
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
    techConf: num(d.techConf),
    ai: d.ai || null,
    aiConf: num(d.aiConf),
    aiUpRate: num(d.aiUpRate),
    aiDownRate: num(d.aiDownRate),
    starLevel: num(d.starLevel),
    highCount: num(d.highCount),
    lowCount: num(d.lowCount),
    mlLevel: num(d.mlLevel),
    entryAt: toMillis(d.entryAt),
    expiresAt: toMillis(d.expiresAt),
    isTrading: !!d.isTrading,
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
    pushHistory(data);
    notifyNewSignal(data);
  }

  render();
}

// ========================================
// 描画
// ========================================
function render() {
  if (!current) { renderWaiting(); return; }
  updatePcStatus();

  const now = Date.now();
  const hasSignal = (current.signalDir === 'HIGH' || current.signalDir === 'LOW');
  const notExpired = current.expiresAt && now < current.expiresAt;

  if (!hasSignal || !notExpired) { renderWaiting(true); return; }

  document.getElementById('signal-waiting').hidden = true;
  document.getElementById('signal-active').hidden = false;

  const card = document.getElementById('signal-card');
  card.classList.toggle('high', current.signalDir === 'HIGH');
  card.classList.toggle('low', current.signalDir === 'LOW');

  document.getElementById('signal-asset').textContent = current.asset;
  document.getElementById('signal-arrow').textContent = current.signalDir === 'HIGH' ? '▲' : '▼';
  document.getElementById('signal-label').textContent = current.signalDir === 'HIGH' ? 'HIGH（上昇）' : 'LOW（下降）';

  // 信頼度（星）
  const starsEl = document.getElementById('signal-stars');
  const stars = Math.max(0, Math.min(3, current.starLevel));
  starsEl.textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';

  document.getElementById('meta-timeframe').textContent = formatTimeframe(current.timeframe);
  const aiText = current.ai
    ? `${normalizeAi(current.ai)}${current.aiUpRate != null ? ' ' + Math.round(current.signalDir === 'HIGH' ? current.aiUpRate : current.aiDownRate) + '%' : ''}`
    : '--';
  document.getElementById('meta-ai').textContent = aiText;
  document.getElementById('meta-s20').textContent = (current.highCount || current.lowCount)
    ? `H${current.highCount}/L${current.lowCount}` : '--';

  tick(); // カウントダウン即時更新
}

function renderWaiting(keepPcStatus) {
  document.getElementById('signal-active').hidden = true;
  document.getElementById('signal-waiting').hidden = false;
  const card = document.getElementById('signal-card');
  card.classList.remove('high', 'low');
  if (keepPcStatus) updatePcStatus(); else setPcStatus('待機中', null);
}

// 毎秒のカウントダウン更新（通信なし）
function tick() {
  if (!current) return;
  const now = Date.now();
  const hasSignal = (current.signalDir === 'HIGH' || current.signalDir === 'LOW');
  if (!hasSignal) return;

  const valueEl = document.getElementById('countdown-value');
  const labelEl = document.getElementById('countdown-label');
  if (!valueEl) return;

  if (current.entryAt && now < current.entryAt) {
    labelEl.textContent = 'エントリーまで';
    valueEl.textContent = Math.ceil((current.entryAt - now) / 1000) + '秒';
  } else if (current.expiresAt && now < current.expiresAt) {
    labelEl.textContent = '取引中 残り';
    valueEl.textContent = Math.ceil((current.expiresAt - now) / 1000) + '秒';
  } else {
    // 期限切れ → 待機表示へ
    renderWaiting(true);
  }
  updatePcStatus();
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
  const list = loadHistory();
  list.unshift({
    asset: data.asset,
    dir: data.signalDir,
    timeframe: data.timeframe,
    starLevel: data.starLevel,
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
    li.innerHTML = `
      <span class="hi-time">${formatClock(h.time)}</span>
      <span class="hi-asset">${h.asset}</span>
      <span class="hi-dir">${arrow} ${h.dir}</span>
      <span class="hi-tf">${formatTimeframe(h.timeframe)}</span>`;
    ul.appendChild(li);
  }
}

// ========================================
// 通知（アプリ内・音/バイブ）
// ========================================
function notifyNewSignal(data) {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  playBeep(data.signalDir === 'HIGH');
}

function enableSound() {
  if (soundEnabled) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    soundEnabled = true;
    const btn = document.getElementById('enable-sound-button');
    if (btn) { btn.textContent = '🔔 通知音・バイブ 有効'; btn.classList.add('enabled'); }
  } catch (e) { /* 非対応 */ }
}

function playBeep(high) {
  if (!soundEnabled || !audioCtx) return;
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
  document.getElementById('enable-sound-button').onclick = enableSound;
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
function normalizeAi(ai) {
  if (ai === 'ENHANCED_HIGH' || ai === 'HIGH') return '上昇';
  if (ai === 'ENHANCED_LOW' || ai === 'LOW') return '下降';
  return ai;
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
