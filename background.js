/**
 * Background Service Worker
 * サイドパネルの制御とコンテンツスクリプトとの通信を担当
 *
 * v5.6.4: bubinga_systemパターンに従い、onActivated/onFocusChangedを削除
 * macOS Spaces切り替えでも分析が継続するようにシンプル化
 */

// デバッグモード（本番ではfalse）
const DEBUG_MODE = false;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => {};

// 最新の分析データをキャッシュ
let cachedAnalysisData = null;

// 拡張機能のアイコンがクリックされたときにサイドパネルを開く
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 拡張機能の更新（リロード）時にTheOptionタブを自動リロード
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    // 少し遅延させてからリロード（古いスクリプトの完全終了を待つ）
    setTimeout(() => {
      chrome.tabs.query({ url: ['*://jp.theoption.com/trading*', '*://theoption.com/trading*'] }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.reload(tab.id);
          debugLog(`[Background] TheOptionタブ自動リロード: tabId=${tab.id}`);
        }
      });
    }, 500);
  }
});

// TheOptionのトレーディングページでサイドパネルを有効化/無効化
// bubinga_systemパターン: onUpdatedのみでサイドパネル制御
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isTheOption = tab.url.includes('theoption.com/trading');

    if (isTheOption) {
      chrome.sidePanel.setOptions({
        tabId,
        path: 'sidepanel.html',
        enabled: true
      });
      debugLog(`[Background] サイドパネル有効化: tabId=${tabId}`);
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
  // システム強制リロード: TheOptionタブをリロードしてコンテンツスクリプトを再注入
  if (message.type === 'FORCE_RELOAD') {
    chrome.tabs.query({ url: ['*://jp.theoption.com/trading*', '*://theoption.com/trading*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.reload(tabs[0].id);
        console.log(`[Background] 強制リロード実行: tabId=${tabs[0].id}`);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'TheOptionタブが見つかりません' });
      }
    });
    return true;
  }

  // システム状態をサイドパネルに転送
  if (message.type === 'SYSTEM_STATE') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  // コンテンツスクリプトの初期化完了通知をサイドパネルに転送
  if (message.type === 'CONTENT_SCRIPT_READY') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }

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

  // v5.9.2: 20インジケータ多数決データをサイドパネルに転送
  if (message.type === 'SIGNAL20_UPDATE') {
    chrome.runtime.sendMessage(message).catch(() => {});
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

  // v5.9.3: Signal20データのリクエスト/レスポンス型中継
  if (message.type === 'GET_SIGNAL20_DATA') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_SIGNAL20_DATA' })
          .then(response => {
            sendResponse(response);
          })
          .catch(() => {
            sendResponse(null);
          });
      } else {
        sendResponse(null);
      }
    });
    return true; // 非同期レスポンス
  }

  // v5.10.4: データ整理リクエスト中継
  if (message.type === 'TRIM_DATA') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_TRIM_DATA' })
          .then(response => sendResponse(response))
          .catch(() => sendResponse({ success: false, error: 'connection failed' }));
      } else {
        sendResponse({ success: false, error: 'no tab' });
      }
    });
    return true;
  }

  // v5.10.4: 月別データ件数/削除の中継
  if (message.type === 'GET_MONTHLY_COUNTS' || message.type === 'DELETE_BY_MONTH') {
    const requestType = message.type === 'GET_MONTHLY_COUNTS' ? 'REQUEST_MONTHLY_COUNTS' : 'REQUEST_DELETE_BY_MONTH';
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { ...message, type: requestType })
          .then(response => sendResponse(response))
          .catch(() => sendResponse({ success: false }));
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }

  // サイドパネルからのデータ要求
  if (message.type === 'GET_ANALYSIS_DATA') {
    // TheOptionタブを探してデータを取得
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
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
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }

  // 時間枠変更をコンテンツスクリプトに転送
  if (message.type === 'TIMEFRAME_CHANGED') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }

  // ダウンロード要求をコンテンツスクリプトに転送
  if (message.type === 'REQUEST_DOWNLOAD') {
    debugLog('[Background] REQUEST_DOWNLOAD受信:', message.downloadType);
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      debugLog('[Background] theoption.comタブ検索結果:', tabs?.length, 'タブ');
      if (tabs && tabs.length > 0) {
        const targetTab = tabs[0];
        debugLog('[Background] ダウンロード指示送信先:', targetTab.id, targetTab.url);
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'EXECUTE_DOWNLOAD',
          downloadType: message.downloadType
        }).then(() => {
          debugLog('[Background] EXECUTE_DOWNLOAD送信成功');
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('[Background] EXECUTE_DOWNLOAD送信失敗:', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        debugLog('[Background] theoption.comタブが見つかりません');
        sendResponse({ success: false, error: 'TheOptionタブが見つかりません' });
      }
    });
    return true; // 非同期レスポンス
  }

  // v5.10.6: モメンタムフィルタ強度変更
  if (message.type === 'SET_MOMENTUM_FILTER') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_FILTER_LEVEL',
          level: message.level
        }).then(response => {
          sendResponse(response || { success: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: 'TheOptionタブが見つかりません' });
      }
    });
    return true;
  }

  // v5.12.4: 急変フィルタ強度変更
  if (message.type === 'SET_PRICE_POSITION_FILTER') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_PRICE_POSITION_FILTER_LEVEL',
          level: message.level
        }).then(response => {
          sendResponse(response || { success: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: 'TheOptionタブが見つかりません' });
      }
    });
    return true;
  }

  // シグナルモード変更
  if (message.type === 'SET_SIGNAL_MODE') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_SIGNAL_MODE',
          mode: message.mode
        }).then(response => {
          sendResponse(response || { success: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: 'TheOptionタブが見つかりません' });
      }
    });
    return true;
  }

  // 通貨ペア別データ一覧を取得（IndexedDBから）
  if (message.type === 'GET_ASSET_DATA_LIST') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_ASSET_DATA_LIST' })
          .then(response => {
            sendResponse(response);
          })
          .catch(() => {
            sendResponse({ error: 'Content script not available' });
          });
      } else {
        sendResponse({ error: 'No TheOption tab' });
      }
    });
    return true; // 非同期レスポンスを使用
  }

  // 時間帯別データ件数を取得（IndexedDBから）
  if (message.type === 'GET_SESSION_DATA_COUNT') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_SESSION_DATA_COUNT' })
          .then(response => {
            sendResponse(response);
          })
          .catch(() => {
            sendResponse({ error: 'Content script not available' });
          });
      } else {
        sendResponse({ error: 'No TheOption tab' });
      }
    });
    return true; // 非同期レスポンスを使用
  }

  // v5.8.19: 時間帯別件数を取得（IndexedDBから）
  if (message.type === 'GET_HOURLY_COUNTS') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'REQUEST_HOURLY_COUNTS',
          assetName: message.assetName
        })
          .then(response => sendResponse(response))
          .catch(() => sendResponse({ error: 'Content script not available' }));
      } else {
        sendResponse({ error: 'No TheOption tab' });
      }
    });
    return true;
  }

  // v5.8.19: 時間帯別データ削除
  if (message.type === 'DELETE_BY_HOURS') {
    chrome.tabs.query({ url: ['https://jp.theoption.com/*', 'https://theoption.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'REQUEST_DELETE_BY_HOURS',
          assetName: message.assetName,
          hours: message.hours
        })
          .then(response => sendResponse(response))
          .catch(() => sendResponse({ error: 'Content script not available' }));
      } else {
        sendResponse({ error: 'No TheOption tab' });
      }
    });
    return true;
  }
});

debugLog('[Background] Service Worker 起動完了');
