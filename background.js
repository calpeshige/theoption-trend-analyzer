/**
 * Background Service Worker
 * サイドパネルの制御とコンテンツスクリプトとの通信を担当
 */

// 最新の分析データをキャッシュ
let cachedAnalysisData = null;

// 拡張機能のアイコンがクリックされたときにサイドパネルを開く
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// TheOptionのトレーディングページでサイドパネルを有効化
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('theoption.com/trading')) {
      chrome.sidePanel.setOptions({
        tabId,
        path: 'sidepanel.html',
        enabled: true
      });
    } else {
      chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
    }
  }
});

// メッセージハンドラー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // コンテンツスクリプトからの分析データ更新
  if (message.type === 'ANALYSIS_UPDATE') {
    // データをキャッシュ
    cachedAnalysisData = message.data;

    // サイドパネルにデータを転送（サイドパネルが開いている場合）
    chrome.runtime.sendMessage(message).catch(() => {
      // サイドパネルが開いていない場合はエラーを無視
    });
  }

  // コンテンツスクリプトからのステータス更新（カウントダウン、進捗）
  if (message.type === 'STATUS_UPDATE') {
    // サイドパネルにステータスを転送
    chrome.runtime.sendMessage(message).catch(() => {
      // サイドパネルが開いていない場合はエラーを無視
    });
  }

  // 通貨ペア変更の即時通知
  if (message.type === 'ASSET_UPDATE') {
    // キャッシュの通貨ペア情報を更新（GET_ANALYSIS_DATA で古いデータが返らないように）
    if (cachedAnalysisData && message.data) {
      cachedAnalysisData.asset = message.data.asset;
      cachedAnalysisData.dataCount = message.data.dataCount;
    }
    // サイドパネルに即座に転送
    chrome.runtime.sendMessage(message).catch(() => {
      // サイドパネルが開いていない場合はエラーを無視
    });
  }

  // サイドパネルからのデータ要求
  if (message.type === 'GET_ANALYSIS_DATA') {
    // 常にコンテンツスクリプトから最新データを取得（キャッシュを使わない）
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_ANALYSIS_DATA' })
          .then(response => {
            if (response) {
              cachedAnalysisData = response;
            }
            sendResponse(response);
          })
          .catch(() => {
            // コンテンツスクリプトに接続できない場合はキャッシュを返す
            sendResponse(cachedAnalysisData);
          });
      } else {
        sendResponse(cachedAnalysisData);
      }
    });
    return true; // 非同期レスポンスを使用
  }

  // 設定変更をコンテンツスクリプトに転送
  if (message.type === 'SETTING_CHANGED') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }

  // 時間枠変更をコンテンツスクリプトに転送
  if (message.type === 'TIMEFRAME_CHANGED') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }

  // ダウンロード要求をコンテンツスクリプトに転送
  if (message.type === 'REQUEST_DOWNLOAD') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'EXECUTE_DOWNLOAD',
          downloadType: message.downloadType
        }).catch(() => {});
      }
    });
  }

  return true;
});

console.log('[Background] Service Worker 起動完了');
