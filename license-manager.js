// ========================================
// TheOption Trend Analyzer - License Manager
// ライセンス認証システム
// ========================================

(function() {
  'use strict';

  // ========================================
  // 設定（Firebaseプロジェクト情報）
  // ========================================
  const FIREBASE_CONFIG = {
    projectId: 'theoption-license',  // Firebaseプロジェクト ID
    apiKey: 'AIzaSyCuPbyOoP3-ILBBNLzx70ox2grmgjhknEQ'  // Firebase Web API キー
  };

  const LICENSE_COLLECTION = 'licenses';  // Firestoreコレクション名
  const RECHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24時間ごとに再検証
  const DEVICE_ID_KEY = 'deviceId';  // デバイスID保存キー
  const LICENSE_KEY_KEY = 'licenseKey';  // ライセンスキー保存キー
  const LICENSE_INFO_KEY = 'licenseInfo';  // ライセンス情報保存キー
  const LICENSE_CHECK_TIME_KEY = 'licenseCheckTime';  // 検証時刻保存キー

  // グローバル変数
  window.licenseManager = {
    isLicenseValid: false,
    licenseInfo: null,
    isInitialized: false
  };

  // ライセンス初期化完了を通知するヘルパー関数
  function notifyLicenseReady() {
    window.licenseManager.isInitialized = true;
    // カスタムイベントを発火
    window.dispatchEvent(new CustomEvent('licenseReady', {
      detail: {
        isValid: window.licenseManager.isLicenseValid,
        licenseInfo: window.licenseManager.licenseInfo
      }
    }));
    console.log('[License] ✅ ライセンス初期化完了イベント発火');
  }

  // ========================================
  // デバイスID管理
  // ========================================

  // ユニークなデバイスIDを生成
  function generateDeviceId() {
    // ランダムな文字列を生成
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const randomPart = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

    // タイムスタンプを追加
    const timestamp = Date.now().toString(36);

    return `DEV-${randomPart.substring(0, 8)}-${timestamp}`;
  }

  // デバイスIDを取得（なければ生成して保存）
  // sync優先、localにフォールバック
  async function getOrCreateDeviceId() {
    return new Promise((resolve) => {
      // まずsyncストレージを確認
      chrome.storage.sync.get([DEVICE_ID_KEY], (syncResult) => {
        if (syncResult[DEVICE_ID_KEY]) {
          console.log('[License] sync既存のデバイスID:', syncResult[DEVICE_ID_KEY]);
          // localにもコピーしておく（フォールバック用）
          chrome.storage.local.set({ [DEVICE_ID_KEY]: syncResult[DEVICE_ID_KEY] });
          resolve(syncResult[DEVICE_ID_KEY]);
        } else {
          // syncにない場合、localを確認
          chrome.storage.local.get([DEVICE_ID_KEY], (localResult) => {
            if (localResult[DEVICE_ID_KEY]) {
              console.log('[License] local既存のデバイスID:', localResult[DEVICE_ID_KEY]);
              // syncにもコピー
              chrome.storage.sync.set({ [DEVICE_ID_KEY]: localResult[DEVICE_ID_KEY] });
              resolve(localResult[DEVICE_ID_KEY]);
            } else {
              // どちらにもない場合、新規生成
              const newDeviceId = generateDeviceId();
              console.log('[License] 新規デバイスID生成:', newDeviceId);
              // 両方に保存
              chrome.storage.sync.set({ [DEVICE_ID_KEY]: newDeviceId });
              chrome.storage.local.set({ [DEVICE_ID_KEY]: newDeviceId }, () => {
                resolve(newDeviceId);
              });
            }
          });
        }
      });
    });
  }

  // ========================================
  // デバイス登録・検証
  // ========================================

  // Firestoreにデバイスを登録
  async function registerDevice(licenseKey, deviceId, currentDevices) {
    try {
      // 新しいデバイスリストを作成
      const updatedDevices = [...currentDevices, deviceId];

      // Firestore REST API でドキュメントを更新
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${LICENSE_COLLECTION}/${licenseKey}?updateMask.fieldPaths=devices&key=${FIREBASE_CONFIG.apiKey}`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            devices: {
              arrayValue: {
                values: updatedDevices.map(d => ({ stringValue: d }))
              }
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log('[License] ✓ デバイス登録成功:', deviceId);
      return { success: true };

    } catch (error) {
      console.error('[License] デバイス登録エラー:', error);
      return { success: false, error: error.message };
    }
  }

  // デバイスの検証と登録
  async function validateAndRegisterDevice(licenseKey, maxDevices, currentDevices, deviceId) {
    // 現在のデバイスが既に登録済みかチェック
    if (currentDevices.includes(deviceId)) {
      console.log('[License] ✓ このデバイスは登録済みです');
      return { valid: true, isNewDevice: false };
    }

    // 登録済みデバイス数をチェック
    if (currentDevices.length >= maxDevices) {
      console.log(`[License] ✗ デバイス上限到達 (${currentDevices.length}/${maxDevices})`);
      return {
        valid: false,
        reason: `このライセンスは既に${maxDevices}台のデバイスで使用中です。\n別のデバイスで使用する場合は管理者にお問い合わせください。`
      };
    }

    // 新しいデバイスを登録
    console.log(`[License] 新しいデバイスを登録中... (${currentDevices.length + 1}/${maxDevices})`);
    const registerResult = await registerDevice(licenseKey, deviceId, currentDevices);

    if (registerResult.success) {
      return { valid: true, isNewDevice: true };
    } else {
      return { valid: false, reason: 'デバイスの登録に失敗しました。再度お試しください。' };
    }
  }

  // ========================================
  // ライセンスキー検証
  // ========================================
  async function validateLicenseKey(licenseKey, skipDeviceCheck = false) {
    try {
      // Firestore REST APIでライセンスキーを検証
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${LICENSE_COLLECTION}/${licenseKey}?key=${FIREBASE_CONFIG.apiKey}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { valid: false, reason: 'ライセンスキーが見つかりません' };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // データが存在するか確認
      if (!data.fields) {
        return { valid: false, reason: 'ライセンスデータが不正です' };
      }

      // ライセンス情報を取得
      const isActive = data.fields.active?.booleanValue ?? false;
      const expiryDate = data.fields.expiryDate?.timestampValue;
      const maxDevices = parseInt(data.fields.maxDevices?.integerValue ?? '1', 10);
      const userName = data.fields.userName?.stringValue ?? '不明';

      // 登録済みデバイスを取得（配列がない場合は空配列）
      const devicesArray = data.fields.devices?.arrayValue?.values || [];
      const currentDevices = devicesArray.map(v => v.stringValue);

      // アクティブ状態をチェック
      if (!isActive) {
        return { valid: false, reason: 'このライセンスキーは無効化されています' };
      }

      // 有効期限をチェック
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        if (expiry < new Date()) {
          return { valid: false, reason: 'ライセンスキーの有効期限が切れています' };
        }
      }

      // デバイス検証（skipDeviceCheckがfalseの場合のみ）
      if (!skipDeviceCheck) {
        const deviceId = await getOrCreateDeviceId();
        const deviceResult = await validateAndRegisterDevice(licenseKey, maxDevices, currentDevices, deviceId);

        if (!deviceResult.valid) {
          return { valid: false, reason: deviceResult.reason };
        }

        // 新規デバイス登録の場合はログ出力
        if (deviceResult.isNewDevice) {
          console.log('[License] ✓ 新しいデバイスとして登録されました');
        }
      }

      // 検証成功
      return {
        valid: true,
        licenseInfo: {
          key: licenseKey,
          userName: userName,
          maxDevices: maxDevices,
          expiryDate: expiryDate,
          isActive: isActive,
          registeredDevices: currentDevices.length
        }
      };

    } catch (error) {
      console.error('[License] 検証エラー:', error);
      return { valid: false, reason: `検証エラー: ${error.message}` };
    }
  }

  // ========================================
  // ストレージからライセンスキーを取得（sync優先、localフォールバック）
  // ========================================
  async function getSavedLicenseKey() {
    return new Promise((resolve) => {
      // まずsyncストレージを確認
      chrome.storage.sync.get([LICENSE_KEY_KEY, LICENSE_CHECK_TIME_KEY], (syncResult) => {
        if (syncResult[LICENSE_KEY_KEY]) {
          console.log('[License] syncからライセンスキーを取得');
          // localにもコピー
          chrome.storage.local.set({
            [LICENSE_KEY_KEY]: syncResult[LICENSE_KEY_KEY],
            [LICENSE_CHECK_TIME_KEY]: syncResult[LICENSE_CHECK_TIME_KEY] || 0
          });
          resolve({
            licenseKey: syncResult[LICENSE_KEY_KEY],
            lastCheckTime: syncResult[LICENSE_CHECK_TIME_KEY] || 0
          });
        } else {
          // syncにない場合、localを確認
          chrome.storage.local.get([LICENSE_KEY_KEY, LICENSE_CHECK_TIME_KEY, 'licenseKey', 'licenseCheckTime'], (localResult) => {
            // 新旧両方のキー名をサポート（既存ユーザー対応）
            const licenseKey = localResult[LICENSE_KEY_KEY] || localResult.licenseKey || null;
            const lastCheckTime = localResult[LICENSE_CHECK_TIME_KEY] || localResult.licenseCheckTime || 0;

            if (licenseKey) {
              console.log('[License] localからライセンスキーを取得');
              // syncにコピー
              chrome.storage.sync.set({
                [LICENSE_KEY_KEY]: licenseKey,
                [LICENSE_CHECK_TIME_KEY]: lastCheckTime
              });
            }
            resolve({
              licenseKey: licenseKey,
              lastCheckTime: lastCheckTime
            });
          });
        }
      });
    });
  }

  // ========================================
  // ライセンスキーを保存（syncとlocalの両方に保存）
  // ========================================
  async function saveLicenseKey(licenseKey, licenseInfo) {
    const checkTime = Date.now();
    return new Promise((resolve) => {
      // syncストレージに保存（Googleアカウントで同期）
      chrome.storage.sync.set({
        [LICENSE_KEY_KEY]: licenseKey,
        [LICENSE_INFO_KEY]: licenseInfo,
        [LICENSE_CHECK_TIME_KEY]: checkTime
      });

      // localストレージにも保存（フォールバック用）
      chrome.storage.local.set({
        [LICENSE_KEY_KEY]: licenseKey,
        [LICENSE_INFO_KEY]: licenseInfo,
        [LICENSE_CHECK_TIME_KEY]: checkTime,
        // 旧キー名も保持（互換性のため）
        licenseKey: licenseKey,
        licenseInfo: licenseInfo,
        licenseCheckTime: checkTime
      }, () => {
        console.log('[License] ライセンスキーをsync/localに保存完了');
        resolve();
      });
    });
  }

  // ========================================
  // ライセンスキーをクリア（syncとlocalの両方からクリア）
  // ========================================
  async function clearLicenseKey() {
    return new Promise((resolve) => {
      // syncストレージからクリア
      chrome.storage.sync.remove([LICENSE_KEY_KEY, LICENSE_INFO_KEY, LICENSE_CHECK_TIME_KEY]);

      // localストレージからクリア（新旧両方のキー名）
      chrome.storage.local.remove([
        LICENSE_KEY_KEY, LICENSE_INFO_KEY, LICENSE_CHECK_TIME_KEY,
        'licenseKey', 'licenseInfo', 'licenseCheckTime'
      ], () => {
        console.log('[License] ライセンスキーをsync/localからクリア完了');
        resolve();
      });
    });
  }

  // ========================================
  // ライセンス入力UIを表示
  // ========================================
  function showLicenseInputDialog() {
    // 既存のダイアログがあれば削除
    const existingDialog = document.getElementById('license-dialog-overlay');
    if (existingDialog) {
      existingDialog.remove();
    }

    // ダイアログHTML
    const dialogHTML = `
      <div id="license-dialog-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <div style="
          background: #1a1a2e;
          border-radius: 16px;
          padding: 32px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          color: #ffffff;
        ">
          <h2 style="
            margin: 0 0 16px 0;
            font-size: 24px;
            font-weight: 600;
            color: #667eea;
          ">Theoption Trading System</h2>

          <p style="
            margin: 0 0 24px 0;
            color: #a0aec0;
            line-height: 1.6;
          ">この拡張機能を使用するにはライセンスキーが必要です。<br>購入時に受け取ったライセンスキーを入力してください。</p>

          <div style="margin-bottom: 24px;">
            <label style="
              display: block;
              margin-bottom: 8px;
              color: #cbd5e0;
              font-size: 14px;
              font-weight: 500;
            ">ライセンスキー</label>
            <input
              type="text"
              id="license-key-input"
              placeholder="THEO-XXXX-XXXX-XXXX"
              style="
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #2d3748;
                border-radius: 8px;
                background: #2d3748;
                color: #ffffff;
                font-size: 16px;
                font-family: 'Courier New', monospace;
                box-sizing: border-box;
                outline: none;
                transition: border-color 0.2s;
              "
            />
          </div>

          <div id="license-error-message" style="
            display: none;
            padding: 12px;
            margin-bottom: 16px;
            background: rgba(245, 101, 101, 0.2);
            border-left: 3px solid #f56565;
            border-radius: 4px;
            color: #fc8181;
            font-size: 14px;
          "></div>

          <button id="license-activate-btn" style="
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          ">アクティベート</button>

          <p style="
            margin: 16px 0 0 0;
            text-align: center;
            font-size: 12px;
            color: #718096;
          ">ライセンスキーをお持ちでない場合は、<br>販売者にお問い合わせください。</p>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    // イベントリスナー
    const inputEl = document.getElementById('license-key-input');
    const btnEl = document.getElementById('license-activate-btn');
    const errorEl = document.getElementById('license-error-message');

    // Enterキーでもアクティベート
    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        btnEl.click();
      }
    });

    // アクティベートボタン
    btnEl.addEventListener('click', async () => {
      const licenseKey = inputEl.value.trim();

      if (!licenseKey) {
        showError('ライセンスキーを入力してください');
        return;
      }

      // ローディング状態
      btnEl.disabled = true;
      btnEl.textContent = '検証中...';
      errorEl.style.display = 'none';

      // ライセンス検証
      const result = await validateLicenseKey(licenseKey);

      if (result.valid) {
        // 成功
        await saveLicenseKey(licenseKey, result.licenseInfo);
        window.licenseManager.isLicenseValid = true;
        window.licenseManager.licenseInfo = result.licenseInfo;

        btnEl.textContent = '✓ 認証成功！';
        btnEl.style.background = 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)';

        setTimeout(() => {
          document.getElementById('license-dialog-overlay').remove();
          location.reload(); // ページをリロードして拡張機能を有効化
        }, 1000);

      } else {
        // 失敗
        showError(result.reason);
        btnEl.disabled = false;
        btnEl.textContent = 'アクティベート';
      }
    });

    function showError(message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }

    // フォーカス
    inputEl.focus();
  }

  // ========================================
  // 初期化処理
  // ========================================
  async function initializeLicense() {
    console.log('[License] ライセンス認証システムを初期化中...');

    // 設定チェック
    if (FIREBASE_CONFIG.projectId === 'YOUR_PROJECT_ID' || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
      console.warn('[License] ⚠️ Firebase設定が未完了です。license-manager.js の FIREBASE_CONFIG を設定してください。');
      // 開発モードとして動作を許可（本番環境では削除してください）
      window.licenseManager.isLicenseValid = true;
      notifyLicenseReady();
      return;
    }

    // 保存されたライセンスキーを確認
    const saved = await getSavedLicenseKey();

    if (!saved.licenseKey) {
      // ライセンスキーがない場合
      console.log('[License] ライセンスキーが未登録です');
      notifyLicenseReady(); // 初期化完了を通知（isValid = false）
      showLicenseInputDialog();
      return;
    }

    // 再検証が必要かチェック（24時間ごと）
    const now = Date.now();
    const timeSinceLastCheck = now - saved.lastCheckTime;

    if (timeSinceLastCheck < RECHECK_INTERVAL) {
      // 最近検証済み - でもデバイス登録は確認する
      const hoursUntilRecheck = Math.floor((RECHECK_INTERVAL - timeSinceLastCheck) / 1000 / 60 / 60);
      console.log(`[License] ✓ ライセンス有効（次回検証まで ${hoursUntilRecheck}時間）`);

      // デバイスIDを取得して、未登録の場合のみ完全な検証を行う
      const deviceId = await getOrCreateDeviceId();
      const licenseInfo = await new Promise(resolve => {
        // sync優先でlicenseInfoを取得
        chrome.storage.sync.get([LICENSE_INFO_KEY], (syncResult) => {
          if (syncResult[LICENSE_INFO_KEY]) {
            resolve(syncResult[LICENSE_INFO_KEY]);
          } else {
            chrome.storage.local.get([LICENSE_INFO_KEY, 'licenseInfo'], (localResult) => {
              resolve(localResult[LICENSE_INFO_KEY] || localResult.licenseInfo);
            });
          }
        });
      });

      // デバイス登録状況を確認するため、一度Firestoreをチェック
      console.log('[License] デバイス登録状況を確認中...');
      const result = await validateLicenseKey(saved.licenseKey, false);  // デバイスチェックを含む

      if (result.valid) {
        window.licenseManager.isLicenseValid = true;
        window.licenseManager.licenseInfo = result.licenseInfo;
        await saveLicenseKey(saved.licenseKey, result.licenseInfo);
        notifyLicenseReady();
      } else {
        // デバイス上限などで失敗
        console.error('[License] ✗ デバイス検証失敗:', result.reason);
        window.licenseManager.isLicenseValid = false;
        notifyLicenseReady();
        alert(`ライセンスエラー\n\n${result.reason}`);
      }
      return;
    }

    // 再検証
    console.log('[License] ライセンスキーを再検証中...');
    const result = await validateLicenseKey(saved.licenseKey);

    if (result.valid) {
      // 検証成功
      console.log('[License] ✓ ライセンス再検証成功');
      await saveLicenseKey(saved.licenseKey, result.licenseInfo);
      window.licenseManager.isLicenseValid = true;
      window.licenseManager.licenseInfo = result.licenseInfo;
      notifyLicenseReady(); // 初期化完了を通知
    } else {
      // 検証失敗
      console.error('[License] ✗ ライセンス検証失敗:', result.reason);
      await clearLicenseKey();
      notifyLicenseReady(); // 初期化完了を通知（isValid = false）
      alert(`ライセンス検証エラー\n\n${result.reason}\n\n再度ライセンスキーを入力してください。`);
      showLicenseInputDialog();
    }
  }

  // ========================================
  // ページ読み込み時に実行
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLicense);
  } else {
    initializeLicense();
  }

})();
