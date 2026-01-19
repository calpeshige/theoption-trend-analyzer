// Bubinga分析システム矢印さん V1.0.0 - Background Service Worker
// サイドパネルの開閉機能

const BUBINGA_URL_PATTERN = 'bubinga.com';

// アイコンクリックでサイドパネルを開くように設定
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => {
    console.log('[矢印さん] サイドパネル動作設定完了');
  })
  .catch((error) => {
    console.error('[矢印さん] サイドパネル設定エラー:', error);
  });

// タブ更新時の処理（Bubingaサイトでサイドパネルを有効化）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  // Bubingaサイトかどうかチェック
  if (tab.url.includes(BUBINGA_URL_PATTERN)) {
    try {
      // このタブでサイドパネルを有効化
      await chrome.sidePanel.setOptions({
        tabId: tabId,
        path: 'sidepanel.html',
        enabled: true
      });
      console.log('[矢印さん] Bubingaサイト検出 - サイドパネル有効化:', tabId);
    } catch (error) {
      console.error('[矢印さん] サイドパネル有効化エラー:', error);
    }
  } else {
    // Bubinga以外のサイトではサイドパネルを無効化
    try {
      await chrome.sidePanel.setOptions({
        tabId: tabId,
        enabled: false
      });
    } catch (error) {
      // エラーは無視
    }
  }
});

// タブが閉じられた時の処理
chrome.tabs.onRemoved.addListener((tabId) => {
  // 必要に応じてクリーンアップ
});

// content scriptからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id });
    return true;
  }

  if (message.type === 'ANALYSIS_DATA') {
    // サイドパネルにデータを転送
    chrome.runtime.sendMessage({
      type: 'UPDATE_SIDEPANEL',
      data: message.data
    }).catch(() => {
      // サイドパネルが開いていない場合のエラーは無視
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CURRENCY_PAIR_UPDATE') {
    // 通貨ペア更新をサイドパネルに転送
    chrome.runtime.sendMessage({
      type: 'CURRENCY_PAIR_UPDATE',
      data: message.data
    }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TIMEFRAME_UPDATE') {
    // 時間足更新をサイドパネルに転送
    chrome.runtime.sendMessage({
      type: 'TIMEFRAME_UPDATE',
      data: message.data
    }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'REFRESH_TAB') {
    // タブをリロード
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes(BUBINGA_URL_PATTERN)) {
        chrome.tabs.reload(tabs[0].id);
        sendResponse({ success: true });
      }
    });
    return true;
  }

  return true;
});

// 拡張機能インストール時の処理
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[矢印さん] V1.0.0 インストール完了');

  // デフォルト設定を保存
  chrome.storage.local.set({
    'ba-selected-count': '120',
    'ba-panel-visible': true
  });

  // インストール/更新時にBubingaタブを自動リロード
  if (details.reason === 'install' || details.reason === 'update') {
    try {
      const tabs = await chrome.tabs.query({ url: '*://bubinga.com/*' });
      for (const tab of tabs) {
        await chrome.tabs.reload(tab.id);
        console.log('[矢印さん] Bubingaタブをリロード:', tab.id);
      }
    } catch (error) {
      console.error('[矢印さん] タブリロードエラー:', error);
    }
  }
});

console.log('[矢印さん] V1.0.0 Service Worker 起動');
