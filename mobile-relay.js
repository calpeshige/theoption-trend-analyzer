// ========================================
// TheOption Trend Analyzer - Mobile Relay
// PCのシグナルをFirestoreへ転送し、スマホPWAへリアルタイム共有する
// （単独では動作せず、theoption-analyzer.js から writeLiveSignal() を呼ばれる）
// ========================================

(function() {
  'use strict';

  // ========================================
  // 設定（license-manager.js と同じFirebaseプロジェクトをそのまま再利用）
  // ========================================
  const FIREBASE_CONFIG = {
    projectId: 'theoption-license',
    apiKey: 'AIzaSyCuPbyOoP3-ILBBNLzx70ox2grmgjhknEQ'
  };

  const LICENSE_COLLECTION = 'licenses';        // ペアリング情報の取得元
  const LIVE_COLLECTION = 'live_signals';       // PC→スマホのライブシグナル中継先
  const PAIRING_RECHECK_INTERVAL = 24 * 60 * 60 * 1000; // ペアリング再取得間隔（24h）

  const ENABLED_KEY = 'mobileRelayEnabled';     // chrome.storage.local: 連携ON/OFF
  const PAIRED_MOBILE_KEY = 'pairedMobileLicenseCache'; // chrome.storage.local: ペアMOBキャッシュ

  // ========================================
  // 状態
  // ========================================
  const state = {
    enabled: false,        // ユーザーが連携をONにしているか
    pairedMobile: null,    // ペアリングされたスマホ版ライセンス（あれば連携対象が存在）
    lastPairingCheck: 0
  };

  // 保存済みの設定を読み込む
  try {
    chrome.storage.local.get([ENABLED_KEY, PAIRED_MOBILE_KEY], (r) => {
      state.enabled = r[ENABLED_KEY] === true;
      state.pairedMobile = r[PAIRED_MOBILE_KEY] || null;
      if (state.enabled) refreshPairing(true);
    });
  } catch (e) {
    // 拡張コンテキスト外では無視
  }

  // ========================================
  // ヘルパー
  // ========================================

  // PC版ライセンスキー（= 転送チャンネルID）を取得
  function getPcKey() {
    const lm = window.licenseManager;
    return (lm && lm.licenseInfo && lm.licenseInfo.key) || null;
  }

  // 連携が有効か（ONかつ有効なPCキーがあり、ペアのスマホ版が存在する場合のみ書き込む）
  function isEnabled() {
    return state.enabled && !!getPcKey() && !!state.pairedMobile;
  }

  // JS値オブジェクト → Firestore typed value 形式へ変換
  function toFields(obj) {
    const fields = {};
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const v = obj[key];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string') {
        fields[key] = { stringValue: v };
      } else if (typeof v === 'boolean') {
        fields[key] = { booleanValue: v };
      } else if (typeof v === 'number') {
        if (Number.isFinite(v)) {
          fields[key] = Number.isInteger(v)
            ? { integerValue: String(v) }
            : { doubleValue: v };
        }
      } else if (v instanceof Date) {
        fields[key] = { timestampValue: v.toISOString() };
      }
    }
    return fields;
  }

  // ペアリング情報（pairedMobileLicense）をFirestoreから取得・キャッシュ
  async function refreshPairing(force) {
    const pcKey = getPcKey();
    if (!pcKey) return;
    const now = Date.now();
    if (!force && (now - state.lastPairingCheck) < PAIRING_RECHECK_INTERVAL) return;
    state.lastPairingCheck = now;

    try {
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}` +
        `/databases/(default)/documents/${LICENSE_COLLECTION}/${encodeURIComponent(pcKey)}` +
        `?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const paired = data.fields && data.fields.pairedMobileLicense
        ? data.fields.pairedMobileLicense.stringValue
        : null;
      state.pairedMobile = paired || null;
      chrome.storage.local.set({ [PAIRED_MOBILE_KEY]: state.pairedMobile });
      console.log('[MobileRelay] ペアリング確認:', state.pairedMobile ? '✓ スマホ版あり' : 'なし');
    } catch (e) {
      // ネットワークエラー時は前回キャッシュを維持
    }
  }

  // ON/OFF切り替え（sidepanelからの指示で呼ばれる）
  function setEnabled(enabled) {
    state.enabled = !!enabled;
    chrome.storage.local.set({ [ENABLED_KEY]: state.enabled });
    console.log('[MobileRelay] 連携:', state.enabled ? 'ON' : 'OFF');
    if (state.enabled) refreshPairing(true);
  }

  // ライブシグナルをFirestoreへ書き込む（live_signals/{PCキー} を全フィールド上書き＝upsert）
  async function writeLiveSignal(payload) {
    const pcKey = getPcKey();
    if (!pcKey) return false;
    try {
      // updateMask を付けず全フィールドを送ることで、毎回ドキュメント全体を上書き（存在しなければ新規作成）
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}` +
        `/databases/(default)/documents/${LIVE_COLLECTION}/${encodeURIComponent(pcKey)}` +
        `?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFields(payload) })
      });
      if (!res.ok) {
        console.warn('[MobileRelay] 書き込み失敗: HTTP', res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[MobileRelay] 書き込みエラー:', e.message);
      return false;
    }
  }

  // ========================================
  // 公開API
  // ========================================
  window.mobileRelay = {
    isEnabled,
    setEnabled,
    refreshPairing,
    writeLiveSignal,
    getState: () => ({
      enabled: state.enabled,
      pcKey: getPcKey(),
      pairedMobile: state.pairedMobile
    })
  };

  // ライセンス初期化完了後にペアリングを取得
  window.addEventListener('licenseReady', () => {
    if (state.enabled) refreshPairing(true);
  });

  console.log('[MobileRelay] 初期化完了');
})();
