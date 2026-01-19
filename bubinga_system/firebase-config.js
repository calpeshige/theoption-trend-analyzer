// Firebase設定ファイル
// Bubinga専用ALL-IN自動分析システム - ライセンス認証用

const firebaseConfig = {
  apiKey: "AIzaSyC0MMo3BskttrblYKCJKkjMlUBLMR72s1A",
  authDomain: "bubinga-license.firebaseapp.com",
  projectId: "bubinga-license",
  storageBucket: "bubinga-license.firebasestorage.app",
  messagingSenderId: "764493123192",
  appId: "1:764493123192:web:ddd06baa78a2f11f28e78d",
  measurementId: "G-9PQGV3EXM2"
};

// Firestoreコレクション名
const LICENSES_COLLECTION = 'licenses';

// デバイスIDを生成・取得する関数
async function getDeviceId() {
  // chrome.storage.localからデバイスIDを取得
  return new Promise((resolve) => {
    chrome.storage.local.get(['deviceId'], (result) => {
      if (result.deviceId) {
        resolve(result.deviceId);
      } else {
        // 新しいデバイスIDを生成
        const newDeviceId = generateDeviceId();
        chrome.storage.local.set({ deviceId: newDeviceId }, () => {
          resolve(newDeviceId);
        });
      }
    });
  });
}

// デバイスID生成
function generateDeviceId() {
  // UUID v4形式でデバイスIDを生成
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  // UUID v4形式に変換
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;

  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// ライセンス認証状態を保存
async function saveLicenseState(licenseKey, isAuthenticated) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      licenseKey: licenseKey,
      isAuthenticated: isAuthenticated,
      authTimestamp: Date.now()
    }, resolve);
  });
}

// ライセンス認証状態を取得
async function getLicenseState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['licenseKey', 'isAuthenticated', 'authTimestamp'], (result) => {
      resolve({
        licenseKey: result.licenseKey || null,
        isAuthenticated: result.isAuthenticated || false,
        authTimestamp: result.authTimestamp || null
      });
    });
  });
}

// ライセンス認証状態をクリア
async function clearLicenseState() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['licenseKey', 'isAuthenticated', 'authTimestamp'], resolve);
  });
}

// Firestore REST API ベースURL
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

// ライセンスの有効性をFirestoreで確認
async function verifyLicenseWithFirestore(licenseKey, deviceId) {
  try {
    const url = `${FIRESTORE_BASE_URL}/licenses/${licenseKey}?key=${firebaseConfig.apiKey}`;
    const response = await fetch(url);

    if (response.status === 404) {
      // ライセンスが削除されている
      return { valid: false, reason: 'deleted' };
    }

    if (!response.ok) {
      // ネットワークエラー等 - 現状維持
      return { valid: true, reason: 'network_error' };
    }

    const data = await response.json();

    // ライセンスが無効化されているかチェック
    const isActive = data.fields?.isActive?.booleanValue ?? false;
    if (!isActive) {
      return { valid: false, reason: 'deactivated' };
    }

    // デバイスIDが一致するかチェック
    const registeredDeviceId = data.fields?.deviceId?.stringValue || null;
    if (registeredDeviceId && registeredDeviceId !== deviceId) {
      return { valid: false, reason: 'device_mismatch' };
    }

    return { valid: true, reason: 'ok' };
  } catch (error) {
    // ネットワークエラー時は現状維持（オフラインでも使えるように）
    console.error('License verification error:', error);
    return { valid: true, reason: 'network_error' };
  }
}

// 定期的なライセンス確認を開始
function startLicenseVerification(intervalMinutes = 30) {
  // 即座に確認
  performLicenseCheck();

  // 定期的に確認（デフォルト30分ごと）
  setInterval(() => {
    performLicenseCheck();
  }, intervalMinutes * 60 * 1000);
}

// ライセンス確認を実行
async function performLicenseCheck() {
  try {
    const licenseState = await getLicenseState();
    if (!licenseState.isAuthenticated || !licenseState.licenseKey) {
      return;
    }

    const deviceId = await getDeviceId();
    const result = await verifyLicenseWithFirestore(licenseState.licenseKey, deviceId);

    if (!result.valid) {
      // ライセンスが無効 - 認証状態をクリアして認証画面へ
      await clearLicenseState();

      let message = 'ライセンスが無効になりました。';
      if (result.reason === 'deleted') {
        message = 'ライセンスが削除されました。再認証が必要です。';
      } else if (result.reason === 'deactivated') {
        message = 'ライセンスが無効化されました。管理者にお問い合わせください。';
      } else if (result.reason === 'device_mismatch') {
        message = 'このライセンスは別のデバイスで使用されています。';
      }

      alert(message);
      window.location.href = 'auth.html';
    }
  } catch (error) {
    console.error('License check error:', error);
  }
}
