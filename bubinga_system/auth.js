// ライセンス認証ロジック（Cloud Functionsなし版）
// Bubinga専用ALL-IN自動分析システム
// ※ FIRESTORE_BASE_URLはfirebase-config.jsで定義済み

// DOM要素
let elements = {};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  // DOM要素の取得
  elements = {
    authForm: document.getElementById('authForm'),
    authSuccess: document.getElementById('authSuccess'),
    licenseKeyInput: document.getElementById('licenseKey'),
    authBtn: document.getElementById('authBtn'),
    btnText: document.querySelector('.btn-text'),
    btnLoading: document.querySelector('.btn-loading'),
    errorMessage: document.getElementById('errorMessage'),
    errorText: document.getElementById('errorText'),
    deviceId: document.getElementById('deviceId')
  };

  // デバイスIDを表示
  const deviceId = await getDeviceId();
  elements.deviceId.textContent = deviceId;

  // 既に認証済みかチェック
  const licenseState = await getLicenseState();
  if (licenseState.isAuthenticated && licenseState.licenseKey) {
    // 認証済みの場合、メイン画面へ遷移
    showSuccess();
    setTimeout(() => {
      redirectToMain();
    }, 1500);
    return;
  }

  // 認証ボタンのイベント
  elements.authBtn.addEventListener('click', handleAuth);

  // Enterキーでも認証
  elements.licenseKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  });

  // ライセンスキー入力のフォーマット
  elements.licenseKeyInput.addEventListener('input', formatLicenseKey);
});

// ライセンスキーのフォーマット（ハイフン自動挿入）
function formatLicenseKey(e) {
  let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // 4文字ごとにハイフンを挿入
  if (value.length > 0) {
    const parts = value.match(/.{1,4}/g) || [];
    value = parts.join('-');
  }

  // 最大19文字（XXXX-XXXX-XXXX-XXXX）
  if (value.length > 19) {
    value = value.substring(0, 19);
  }

  e.target.value = value;
}

// 認証処理
async function handleAuth() {
  const licenseKey = elements.licenseKeyInput.value.trim().toUpperCase();

  // バリデーション
  if (!licenseKey) {
    showError('ライセンスキーを入力してください');
    return;
  }

  // ライセンスキー形式チェック（XXXX-XXXX-XXXX-XXXX）
  const keyPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!keyPattern.test(licenseKey)) {
    showError('ライセンスキーの形式が正しくありません');
    return;
  }

  // ローディング表示
  setLoading(true);
  hideError();

  try {
    const deviceId = await getDeviceId();

    // Firestoreからライセンス情報を取得
    const licenseData = await fetchLicenseFromFirestore(licenseKey);

    if (!licenseData) {
      showError('無効なライセンスキーです');
      setLoading(false);
      return;
    }

    // ライセンスが有効かチェック
    if (!licenseData.isActive) {
      showError('このライセンスは無効化されています');
      setLoading(false);
      return;
    }

    // デバイスIDチェック
    if (licenseData.deviceId && licenseData.deviceId !== deviceId) {
      showError('このライセンスは別のデバイスで使用されています');
      setLoading(false);
      return;
    }

    // 初回認証の場合、デバイスIDを登録
    if (!licenseData.deviceId) {
      const registered = await registerDeviceToLicense(licenseKey, deviceId);
      if (!registered) {
        showError('デバイス登録に失敗しました。管理者にお問い合わせください');
        setLoading(false);
        return;
      }
    }

    // 認証成功 - ローカルに保存
    await saveLicenseState(licenseKey, true);

    // 成功表示
    showSuccess();

    // メイン画面へ遷移
    setTimeout(() => {
      redirectToMain();
    }, 1500);

  } catch (error) {
    console.error('認証エラー:', error);
    showError('認証処理中にエラーが発生しました。インターネット接続を確認してください');
    setLoading(false);
  }
}

// Firestoreからライセンス情報を取得（REST API）
async function fetchLicenseFromFirestore(licenseKey) {
  try {
    const url = `${FIRESTORE_BASE_URL}/licenses/${licenseKey}?key=${firebaseConfig.apiKey}`;
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Firestoreのドキュメント形式からデータを抽出
    return {
      isActive: data.fields?.isActive?.booleanValue ?? false,
      deviceId: data.fields?.deviceId?.stringValue || null,
      createdAt: data.fields?.createdAt?.timestampValue || null,
      activatedAt: data.fields?.activatedAt?.timestampValue || null
    };
  } catch (error) {
    console.error('Firestore取得エラー:', error);
    throw error;
  }
}

// デバイスIDをライセンスに登録（REST API で直接Firestoreに書き込み）
async function registerDeviceToLicense(licenseKey, deviceId) {
  try {
    const url = `${FIRESTORE_BASE_URL}/licenses/${licenseKey}?updateMask.fieldPaths=deviceId&updateMask.fieldPaths=activatedAt&key=${firebaseConfig.apiKey}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          deviceId: { stringValue: deviceId },
          activatedAt: { timestampValue: new Date().toISOString() }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('デバイス登録エラー:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('デバイス登録リクエストエラー:', error);
    return false;
  }
}

// ローディング状態の切り替え
function setLoading(isLoading) {
  elements.authBtn.disabled = isLoading;
  elements.btnText.style.display = isLoading ? 'none' : 'inline';
  elements.btnLoading.style.display = isLoading ? 'flex' : 'none';
}

// エラー表示
function showError(message) {
  elements.errorText.textContent = message;
  elements.errorMessage.style.display = 'flex';
}

// エラー非表示
function hideError() {
  elements.errorMessage.style.display = 'none';
}

// 成功表示
function showSuccess() {
  elements.authForm.style.display = 'none';
  elements.authSuccess.style.display = 'block';
}

// メイン画面へ遷移
function redirectToMain() {
  // Side Panel APIを使用している場合は、現在のページを置き換え
  window.location.href = 'sidepanel.html';
}
