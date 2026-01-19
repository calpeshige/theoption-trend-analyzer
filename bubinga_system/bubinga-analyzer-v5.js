// Bubinga分析システム矢印さん V1.0.0 - Content Script (Side Panel Version)
// サイドパネル版 - フローティングパネル削除

(function() {
  'use strict';

  const BA_NAMESPACE = 'yajirushiSanV100';

  if (window[BA_NAMESPACE]) {
    return;
  }
  window[BA_NAMESPACE] = true;

  const isMainFrame = window.self === window.top;
  const isIframe = !isMainFrame;

  console.log(`%c[矢印さん V1.0.0] 起動 (${isMainFrame ? 'メイン' : 'iframe'})`, 'background: #4CAF50; color: white; padding: 5px 10px; font-weight: bold;');

  const CONFIG = {
    candleCounts: {
      '15': { label: '15本', candles: 15 },
      '30': { label: '30本', candles: 30 },
      '45': { label: '45本', candles: 45 },
      '60': { label: '60本', candles: 60 },
      '120': { label: '120本', candles: 120 },
      '240': { label: '240本', candles: 240 },
      '360': { label: '360本', candles: 360 },
      '720': { label: '720本', candles: 720 }
    },
    defaultCount: '120',
    currencyPairKey: 'ba-current-pair',
    assetMapKey: 'ba-asset-map',
    assetMapExpiry: 'ba-asset-map-expiry',
    chartTimeframeKey: 'ba-chart-timeframe',
    minCandlesRequired: 15
  };

  const TIMEFRAME_MAP = {
    '5秒': { detalization: '5s', seconds: 5 },
    '10秒': { detalization: '10s', seconds: 10 },
    '15秒': { detalization: '15s', seconds: 15 },
    '30秒': { detalization: '30s', seconds: 30 },
    '1分': { detalization: '1m', seconds: 60 },
    '5分': { detalization: '5m', seconds: 300 },
    '15分': { detalization: '15m', seconds: 900 },
    '30分': { detalization: '30m', seconds: 1800 },
    '1時間': { detalization: '1h', seconds: 3600 },
    '4時間': { detalization: '4h', seconds: 14400 }
  };

  let currentCurrencyPair = '検出中...';
  let currentChartTimeframe = '1分';
  let assetMap = null;

  // トークンをlocalStorageからchrome.storageに同期
  function syncTokenToStorage() {
    try {
      const authToken = localStorage.getItem('authToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (authToken && chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'ba-authToken': authToken,
          'ba-refreshToken': refreshToken
        }, () => {
          if (chrome.runtime.lastError) {
            console.debug('[Token Sync] Context invalidated, skipping sync');
          }
        });
      }
    } catch (e) {
      console.debug('[Token Sync] Error:', e.message);
    }
  }

  // chrome.storageからトークンを取得（フォールバック付き）
  async function getAuthToken() {
    let localToken = null;
    try {
      localToken = localStorage.getItem('authToken');
    } catch (e) {
      console.debug('[Token Get] localStorage access error:', e.message);
    }

    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return localToken;
    }

    try {
      return new Promise((resolve) => {
        chrome.storage.local.get(['ba-authToken'], (result) => {
          if (chrome.runtime.lastError) {
            resolve(localToken);
          } else {
            resolve(result['ba-authToken'] || localToken);
          }
        });
      });
    } catch (e) {
      return localToken;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    console.log('[矢印さん] 初期化開始');

    if (isMainFrame) {
      syncTokenToStorage();
      setInterval(syncTokenToStorage, 5000);
    }

    await loadAssetMapping();

    detectCurrencyPair();
    setInterval(detectCurrencyPair, 300);

    detectChartTimeframe();
    setInterval(detectChartTimeframe, 1000);

    // メッセージリスナーを設定
    setupMessageListener();

    console.log('[矢印さん] 初期化完了');
  }

  // メッセージリスナーの設定
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Content] メッセージ受信:', message.type, `(${isMainFrame ? 'メイン' : 'iframe'})`);

      // 通貨ペアを取得可能かチェック（localStorageフォールバック付き）
      function canHandleAnalysis() {
        if (currentCurrencyPair !== '検出中...') return true;
        const savedPair = localStorage.getItem(CONFIG.currencyPairKey);
        return savedPair && savedPair !== '検出中...';
      }

      switch (message.type) {
        case 'GET_INITIAL_DATA':
          // 有効なデータを持つコンテキストのみ応答
          if (currentCurrencyPair !== '検出中...' || !isMainFrame) {
            sendResponse({
              currencyPair: currentCurrencyPair !== '検出中...' ? currentCurrencyPair : localStorage.getItem(CONFIG.currencyPairKey),
              timeframe: currentChartTimeframe
            });
          }
          break;

        case 'PERFORM_ANALYSIS':
          // 分析可能なコンテキストのみ処理
          if (!canHandleAnalysis()) {
            console.log('[Content] 分析をスキップ - 通貨ペア未検出');
            return false; // 他のコンテキストに処理を譲る
          }
          performAnalysis(message.candleCount).then(result => {
            sendResponse({ result: result });
          }).catch(error => {
            sendResponse({ error: error.message });
          });
          return true; // 非同期レスポンス

        case 'PERFORM_SIGNAL_ANALYSIS':
          // 分析可能なコンテキストのみ処理
          if (!canHandleAnalysis()) {
            console.log('[Content] シグナル分析をスキップ - 通貨ペア未検出');
            return false; // 他のコンテキストに処理を譲る
          }
          performSignalAnalysis(message.candleCount).then(signalResult => {
            sendResponse({ signalResult: signalResult });
          }).catch(error => {
            sendResponse({ error: error.message });
          });
          return true; // 非同期レスポンス

        case 'GET_CURRENT_PRICE':
          // 現在価格を取得
          if (!canHandleAnalysis()) {
            console.log('[Content] 価格取得をスキップ - 通貨ペア未検出');
            return false;
          }
          fetchCurrentPrice().then(priceData => {
            sendResponse({ priceData: priceData });
          }).catch(error => {
            sendResponse({ error: error.message });
          });
          return true; // 非同期レスポンス

        case 'GET_1MIN_CANDLE_OPEN':
          // 1分足の始値を取得（エントリー価格用）
          if (!canHandleAnalysis()) {
            console.log('[Content] 1分足始値取得をスキップ - 通貨ペア未検出');
            return false;
          }
          fetch1MinCandleOpen().then(candleData => {
            sendResponse({ candleData: candleData });
          }).catch(error => {
            sendResponse({ error: error.message });
          });
          return true;

        case 'GET_1MIN_CANDLE_CLOSE':
          // 1分足の確定終値を取得（判定価格用）
          if (!canHandleAnalysis()) {
            console.log('[Content] 1分足終値取得をスキップ - 通貨ペア未検出');
            return false;
          }
          fetch1MinCandleClose(message.candleTime).then(candleData => {
            sendResponse({ candleData: candleData });
          }).catch(error => {
            sendResponse({ error: error.message });
          });
          return true;

        case 'GET_PAYOUT_RATE':
          // ペイアウト率を取得
          const payoutRate = detectPayoutRate();
          sendResponse({ payoutRate: payoutRate });
          break;

        default:
          sendResponse({ received: true });
      }

      return true;
    });
  }

  function detectChartTimeframe() {
    try {
      const iframes = document.querySelectorAll('iframe');

      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (!iframeDoc) continue;

          const timeframeButtons = iframeDoc.querySelectorAll('button[aria-haspopup="menu"]');

          for (const button of timeframeButtons) {
            const text = button.textContent.trim();
            const match = text.match(/^(\d+)\s*(秒|分|時間?)$/);

            if (match) {
              const timeframe = match[1] + match[2];

              if (TIMEFRAME_MAP[timeframe]) {
                if (currentChartTimeframe !== timeframe) {
                  currentChartTimeframe = timeframe;
                  localStorage.setItem(CONFIG.chartTimeframeKey, timeframe);
                  console.log('%c[時間足] 検出:', 'background: #FF9800; color: white; padding: 2px 6px;', timeframe);

                  // サイドパネルに通知
                  notifyTimeframeUpdate(timeframe);
                }
                return;
              }
            }
          }

          const walker = iframeDoc.createTreeWalker(
            iframeDoc.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );

          let node;
          while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            const match = text.match(/^(\d+)(秒|分|時間?)$/);
            if (match) {
              const timeframe = match[1] + match[2];
              if (TIMEFRAME_MAP[timeframe]) {
                if (currentChartTimeframe !== timeframe) {
                  currentChartTimeframe = timeframe;
                  localStorage.setItem(CONFIG.chartTimeframeKey, timeframe);
                  notifyTimeframeUpdate(timeframe);
                }
                return;
              }
            }
          }

        } catch (e) {}
      }
    } catch (e) {}
  }

  async function loadAssetMapping() {
    const cached = localStorage.getItem(CONFIG.assetMapKey);
    const expiry = localStorage.getItem(CONFIG.assetMapExpiry);

    if (cached && expiry && Date.now() < parseInt(expiry)) {
      assetMap = JSON.parse(cached);
      console.log('%c[Asset Map] キャッシュから読み込み:', 'background: #2196F3; color: white; padding: 2px 6px;', Object.keys(assetMap).length + '通貨ペア');
      return;
    }

    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        console.warn('[Asset Map] 認証トークンが見つかりません。Bubingaにログインしてください。');
        return;
      }

      const response = await fetch('https://api.bubinga.com/api/v1/assets?pagination[limit]=250&pagination[offset]=0', {
        headers: {
          'x-jwt': authToken,
          'accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const map = {};
      data.data.forEach(asset => {
        if (asset.name && asset.id) {
          map[asset.name] = asset.id;
        }
      });

      assetMap = map;
      localStorage.setItem(CONFIG.assetMapKey, JSON.stringify(map));
      localStorage.setItem(CONFIG.assetMapExpiry, (Date.now() + 3600000).toString());

      console.log('%c[Asset Map] API から取得:', 'background: #4CAF50; color: white; padding: 2px 6px;', Object.keys(map).length + '通貨ペア');

    } catch (error) {
      console.error('[Asset Map] 取得エラー:', error);
    }
  }

  function getAssetId(currencyPairName) {
    if (!assetMap) {
      return null;
    }
    return assetMap[currencyPairName] || null;
  }

  function detectCurrencyPair() {
    let pair = null;

    try {
      if (isIframe) {
        const chartTabAsset = document.querySelector('.chart-tab-asset');
        if (chartTabAsset) {
          const text = chartTabAsset.textContent.trim();
          if (text && text.length > 0 && text !== '検出中...') {
            pair = text;
          }
        }
      }

      if (isMainFrame && !pair) {
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
              const chartTabAsset = iframeDoc.querySelector('.chart-tab-asset');
              if (chartTabAsset) {
                const text = chartTabAsset.textContent.trim();
                if (text && text.length > 0 && text !== '検出中...') {
                  pair = text;
                  break;
                }
              }
            }
          } catch (e) {}
        }
      }

      if (pair && pair !== currentCurrencyPair) {
        currentCurrencyPair = pair;
        localStorage.setItem(CONFIG.currencyPairKey, pair);
        console.log('%c[通貨ペア] 検出:', 'background: #2196F3; color: white; padding: 2px 6px;', pair);

        // サイドパネルに通知
        notifyCurrencyPairUpdate(pair);
      }
    } catch (e) {}
  }

  // 通貨ペア更新をサイドパネルに通知
  function notifyCurrencyPairUpdate(pair) {
    try {
      chrome.runtime.sendMessage({
        type: 'CURRENCY_PAIR_UPDATE',
        data: pair
      }).catch(() => {});
    } catch (e) {}
  }

  // 時間足更新をサイドパネルに通知
  function notifyTimeframeUpdate(timeframe) {
    try {
      chrome.runtime.sendMessage({
        type: 'TIMEFRAME_UPDATE',
        data: timeframe
      }).catch(() => {});
    } catch (e) {}
  }

  // 現在価格を取得（リアルタイム）
  async function fetchCurrentPrice() {
    const authToken = await getAuthToken();

    if (!authToken) {
      throw new Error('認証トークンが見つかりません。');
    }

    if (!assetMap) {
      await loadAssetMapping();
    }

    const assetId = getAssetId(currentCurrencyPair);

    if (!assetId) {
      throw new Error(`通貨ペア "${currentCurrencyPair}" のAsset IDが見つかりません。`);
    }

    try {
      const now = new Date();
      // リアルタイム価格を取得するため、オフセットなしで直近のデータを取得
      const from = new Date(now.getTime() - 60 * 1000); // 過去1分間

      console.log('%c[価格取得] リアルタイム価格取得:', 'background: #FF5722; color: white; padding: 2px 6px;',
        `${currentCurrencyPair}`);

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const fromISO = from.toISOString();
        const toISO = now.toISOString();

        const baseUrl = 'https://api.bubinga.com/api/v1/assets/' + assetId + '/candles';
        const params = [
          'from=' + encodeURIComponent(fromISO),
          'to=' + encodeURIComponent(toISO),
          'detalization=5s'  // 5秒足で最新の価格を取得
        ];
        const apiUrl = baseUrl + '?' + params.join('&');

        xhr.open('GET', apiUrl, true);
        xhr.setRequestHeader('x-jwt', authToken);
        xhr.setRequestHeader('accept', 'application/json');
        xhr.setRequestHeader('accept-language', 'ja');

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve({
                ok: true,
                status: xhr.status,
                json: async () => data
              });
            } catch (e) {
              reject(new Error('JSON parse error: ' + e.message));
            }
          } else {
            resolve({
              ok: false,
              status: xhr.status,
              statusText: xhr.statusText
            });
          }
        };

        xhr.onerror = function() {
          reject(new Error('Network error'));
        };

        xhr.send();
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('価格データを取得できませんでした。');
      }

      // 最新のローソク足の終値を現在価格として使用
      const latestCandle = data.data[data.data.length - 1];
      const currentPrice = latestCandle.close;

      console.log('%c[価格取得] 成功:', 'background: #4CAF50; color: white; padding: 2px 6px;',
        `価格: ${currentPrice}, 時刻: ${latestCandle.time}`);

      return {
        price: currentPrice,
        time: latestCandle.time,
        currencyPair: currentCurrencyPair,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[価格取得] エラー:', error);
      throw error;
    }
  }

  // 1分足の始値を取得（エントリー価格用）
  // 現在進行中の1分足の始値を返す
  async function fetch1MinCandleOpen() {
    const authToken = await getAuthToken();

    if (!authToken) {
      throw new Error('認証トークンが見つかりません。');
    }

    if (!assetMap) {
      await loadAssetMapping();
    }

    const assetId = getAssetId(currentCurrencyPair);

    if (!assetId) {
      throw new Error(`通貨ペア "${currentCurrencyPair}" のAsset IDが見つかりません。`);
    }

    try {
      const now = new Date();
      // 現在の1分足の開始時刻を計算（秒とミリ秒を0にする）
      const currentCandleStart = new Date(now);
      currentCandleStart.setSeconds(0, 0);

      // 現在形成中の足を確実に取得するため、現在時刻を含む範囲を取得
      // from: 現在の足の開始時刻から少し前
      // to: 現在時刻より少し後（未来）
      const from = new Date(currentCandleStart.getTime() - 10 * 1000); // 10秒前
      const to = new Date(now.getTime() + 10 * 1000); // 10秒後（現在形成中の足を含める）

      console.log('%c[1分足始値取得] 取得開始:', 'background: #9C27B0; color: white; padding: 2px 6px;',
        `${currentCurrencyPair}, 現在足開始: ${currentCandleStart.toISOString()}, now: ${now.toISOString()}`);

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const fromISO = from.toISOString();
        const toISO = to.toISOString();

        const baseUrl = 'https://api.bubinga.com/api/v1/assets/' + assetId + '/candles';
        const params = [
          'from=' + encodeURIComponent(fromISO),
          'to=' + encodeURIComponent(toISO),
          'detalization=1m'  // 1分足で取得
        ];
        const apiUrl = baseUrl + '?' + params.join('&');

        xhr.open('GET', apiUrl, true);
        xhr.setRequestHeader('x-jwt', authToken);
        xhr.setRequestHeader('accept', 'application/json');
        xhr.setRequestHeader('accept-language', 'ja');

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve({
                ok: true,
                status: xhr.status,
                json: async () => data
              });
            } catch (e) {
              reject(new Error('JSON parse error: ' + e.message));
            }
          } else {
            resolve({
              ok: false,
              status: xhr.status,
              statusText: xhr.statusText
            });
          }
        };

        xhr.onerror = function() {
          reject(new Error('Network error'));
        };

        xhr.send();
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('1分足データを取得できませんでした。');
      }

      // 現在の1分足（形成中の足）を特定
      // 現在時刻を含む足を探す
      let currentCandle = null;
      for (const candle of data.data) {
        const candleStartTime = new Date(candle.time).getTime();
        const candleEndTime = candleStartTime + 60 * 1000;
        // 現在時刻がこの足の範囲内（開始時刻 <= now < 終了時刻）
        if (now.getTime() >= candleStartTime && now.getTime() < candleEndTime) {
          currentCandle = candle;
          break;
        }
      }

      // 見つからない場合は最新の足を使用
      if (!currentCandle) {
        currentCandle = data.data[data.data.length - 1];
        console.warn('[1分足始値取得] 現在形成中の足が見つからないため、最新の足を使用');
      }

      const candleTime = new Date(currentCandle.time);

      console.log('%c[1分足始値取得] 成功:', 'background: #4CAF50; color: white; padding: 2px 6px;',
        `始値: ${currentCandle.open}, 足開始時刻: ${currentCandle.time}, 現在時刻: ${now.toISOString()}`);

      return {
        open: currentCandle.open,
        high: currentCandle.high,
        low: currentCandle.low,
        close: currentCandle.close,
        candleTime: currentCandle.time,
        candleStartTimestamp: candleTime.getTime(),
        currencyPair: currentCurrencyPair,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[1分足始値取得] エラー:', error);
      throw error;
    }
  }

  // 1分足の確定終値を取得（判定価格用）
  // 指定された時刻の1分足が確定した後、その終値を返す
  async function fetch1MinCandleClose(candleStartTime) {
    const authToken = await getAuthToken();

    if (!authToken) {
      throw new Error('認証トークンが見つかりません。');
    }

    if (!assetMap) {
      await loadAssetMapping();
    }

    const assetId = getAssetId(currentCurrencyPair);

    if (!assetId) {
      throw new Error(`通貨ペア "${currentCurrencyPair}" のAsset IDが見つかりません。`);
    }

    try {
      // candleStartTimeは対象の1分足の開始時刻（ISO文字列またはタイムスタンプ）
      const targetTime = new Date(candleStartTime);
      const targetEndTime = new Date(targetTime.getTime() + 60 * 1000); // 足の終了時刻

      // 対象の足が含まれる範囲を取得（前後1分のバッファ）
      const from = new Date(targetTime.getTime() - 60 * 1000);
      const to = new Date(targetEndTime.getTime() + 60 * 1000);

      console.log('%c[1分足終値取得] 取得開始:', 'background: #FF9800; color: white; padding: 2px 6px;',
        `${currentCurrencyPair}, 対象足: ${targetTime.toISOString()}`);

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const fromISO = from.toISOString();
        const toISO = to.toISOString();

        const baseUrl = 'https://api.bubinga.com/api/v1/assets/' + assetId + '/candles';
        const params = [
          'from=' + encodeURIComponent(fromISO),
          'to=' + encodeURIComponent(toISO),
          'detalization=1m'  // 1分足で取得
        ];
        const apiUrl = baseUrl + '?' + params.join('&');

        xhr.open('GET', apiUrl, true);
        xhr.setRequestHeader('x-jwt', authToken);
        xhr.setRequestHeader('accept', 'application/json');
        xhr.setRequestHeader('accept-language', 'ja');

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve({
                ok: true,
                status: xhr.status,
                json: async () => data
              });
            } catch (e) {
              reject(new Error('JSON parse error: ' + e.message));
            }
          } else {
            resolve({
              ok: false,
              status: xhr.status,
              statusText: xhr.statusText
            });
          }
        };

        xhr.onerror = function() {
          reject(new Error('Network error'));
        };

        xhr.send();
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('1分足データを取得できませんでした。');
      }

      // 対象の時刻に一致する1分足を探す
      let targetCandle = null;
      for (const candle of data.data) {
        const candleTime = new Date(candle.time).getTime();
        // 時刻が一致（1秒以内の誤差を許容）
        if (Math.abs(candleTime - targetTime.getTime()) < 1000) {
          targetCandle = candle;
          break;
        }
      }

      if (!targetCandle) {
        // 一致する足が見つからない場合、最も近い足を使用
        console.warn('[1分足終値取得] 対象足が見つからないため、最新の確定足を使用');
        // 現在時刻より前の最新の足を探す
        const now = Date.now();
        for (let i = data.data.length - 1; i >= 0; i--) {
          const candleTime = new Date(data.data[i].time).getTime();
          if (candleTime + 60000 <= now) { // 足が確定している
            targetCandle = data.data[i];
            break;
          }
        }
      }

      if (!targetCandle) {
        throw new Error('確定した1分足が見つかりません。');
      }

      console.log('%c[1分足終値取得] 成功:', 'background: #4CAF50; color: white; padding: 2px 6px;',
        `終値: ${targetCandle.close}, 足時刻: ${targetCandle.time}`);

      return {
        open: targetCandle.open,
        high: targetCandle.high,
        low: targetCandle.low,
        close: targetCandle.close,
        candleTime: targetCandle.time,
        currencyPair: currentCurrencyPair,
        timestamp: new Date().toISOString(),
        isConfirmed: true
      };

    } catch (error) {
      console.error('[1分足終値取得] エラー:', error);
      throw error;
    }
  }

  // ローソク足データを取得
  async function fetchRealCandleData(requestedCandleCount) {
    const authToken = await getAuthToken();

    if (!authToken) {
      throw new Error('認証トークンが見つかりません。Bubingaにログインしてください。');
    }

    if (!assetMap) {
      await loadAssetMapping();
    }

    const assetId = getAssetId(currentCurrencyPair);

    if (!assetId) {
      throw new Error(`通貨ペア "${currentCurrencyPair}" のAsset IDが見つかりません。`);
    }

    const timeframeConfig = TIMEFRAME_MAP[currentChartTimeframe];
    if (!timeframeConfig) {
      throw new Error(`時間足 "${currentChartTimeframe}" は対応していません。`);
    }

    const detalization = timeframeConfig.detalization;
    const candleSeconds = timeframeConfig.seconds;

    const actualCandleCount = Math.max(requestedCandleCount, CONFIG.minCandlesRequired);
    const totalSeconds = actualCandleCount * candleSeconds;

    console.log('%c[データ計算]', 'background: #9C27B0; color: white; padding: 2px 6px;',
      `要求: ${requestedCandleCount}本, 実際: ${actualCandleCount}本`);

    try {
      const now = new Date();
      const safeNow = new Date(now.getTime() - 5 * 60 * 1000);
      const from = new Date(safeNow.getTime() - totalSeconds * 1000);

      console.log('%c[API] ローソク足データ取得:', 'background: #2196F3; color: white; padding: 2px 6px;',
        `${currentCurrencyPair}, 時間足: ${currentChartTimeframe}, 本数: ${actualCandleCount}本`);

      const response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const fromISO = from.toISOString();
        const toISO = safeNow.toISOString();

        const baseUrl = 'https://api.bubinga.com/api/v1/assets/' + assetId + '/candles';
        const detalizationEncoded = encodeURIComponent(detalization);

        const params = [
          'from=' + encodeURIComponent(fromISO),
          'to=' + encodeURIComponent(toISO),
          'detalization=' + detalizationEncoded
        ];
        const apiUrl = baseUrl + '?' + params.join('&');

        xhr.open('GET', apiUrl, true);
        xhr.setRequestHeader('x-jwt', authToken);
        xhr.setRequestHeader('accept', 'application/json');
        xhr.setRequestHeader('accept-language', 'ja');

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve({
                ok: true,
                status: xhr.status,
                json: async () => data
              });
            } catch (e) {
              reject(new Error('JSON parse error: ' + e.message));
            }
          } else {
            resolve({
              ok: false,
              status: xhr.status,
              statusText: xhr.statusText
            });
          }
        };

        xhr.onerror = function() {
          reject(new Error('Network error'));
        };

        xhr.send();
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('APIからデータを取得できませんでした。');
      }

      console.log('%c[API] データ取得成功:', 'background: #4CAF50; color: white; padding: 2px 6px;',
        `${data.data.length}本のローソク足`);

      const totalMinutes = Math.floor(totalSeconds / 60);

      return {
        candles: data.data,
        actualCount: data.data.length,
        totalMinutes: totalMinutes,
        totalHours: Math.floor(totalMinutes / 60)
      };

    } catch (error) {
      console.error('[API] データ取得エラー:', error);
      throw error;
    }
  }

  function convertAPIDataToCandles(apiData) {
    if (!apiData || !Array.isArray(apiData)) {
      return [];
    }

    return apiData.map(candle => ({
      time: new Date(candle.time).getTime(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: 0
    }));
  }

  function formatTimePeriod(totalMinutes) {
    if (totalMinutes < 60) {
      return `${totalMinutes}分`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
      return `${hours}時間`;
    }

    return `${hours}時間${minutes}分`;
  }

  // 分析を実行
  async function performAnalysis(candleCountKey) {
    // 通貨ペアをチェック（localStorageフォールバック付き）
    let pair = currentCurrencyPair;
    if (pair === '検出中...') {
      const savedPair = localStorage.getItem(CONFIG.currencyPairKey);
      if (savedPair && savedPair !== '検出中...') {
        pair = savedPair;
        currentCurrencyPair = pair;
        console.log('[分析] localStorageから通貨ペア取得:', pair);
      } else {
        detectCurrencyPair();
        pair = currentCurrencyPair;
      }
    }

    if (pair === '検出中...') {
      throw new Error('通貨ペアを検出できません。チャート画面が表示されているか確認してください。');
    }

    const config = CONFIG.candleCounts[candleCountKey] || CONFIG.candleCounts[CONFIG.defaultCount];
    const requestedCount = config.candles;

    const result = await fetchRealCandleData(requestedCount);
    const candles = convertAPIDataToCandles(result.candles);

    if (candles.length === 0) {
      throw new Error('有効なローソク足データがありません。');
    }

    if (candles.length < CONFIG.minCandlesRequired) {
      throw new Error(`データ不足: ${candles.length}本（最低${CONFIG.minCandlesRequired}本必要）`);
    }

    if (!window.TechnicalAnalysisEngineV2) {
      throw new Error('TechnicalAnalysisEngineV2 が読み込まれていません');
    }

    console.log('%c[矢印さん] リアルデータで分析開始:', 'background: #9C27B0; color: white; padding: 2px 6px;',
      `${candles.length}本のローソク足（時間足: ${currentChartTimeframe}）`);

    const engine = new window.TechnicalAnalysisEngineV2();
    engine.setCandles(candles);

    const analysisResult = engine.analyzeTrend();

    // 結果を整形
    return formatAnalysisResult(analysisResult, result.actualCount, requestedCount, result.totalMinutes);
  }

  function formatAnalysisResult(result, actualCount, requestedCount, totalMinutes) {
    const timePeriod = formatTimePeriod(totalMinutes);

    // 詳細テキストを生成
    let details;
    if (result.phases && result.pattern) {
      details = `
📊 【分析期間】過去${actualCount}本（${timePeriod}）
通貨ペア: ${currentCurrencyPair}
時間足: ${currentChartTimeframe}

━━━━━━━━━━━━━━━━━
${result.details}
━━━━━━━━━━━━━━━━━

📈 テクニカル指標（現在値）:
EMA(短期): ${result.indicators.ema1}
EMA(長期): ${result.indicators.ema2}
ADX: ${result.indicators.adx}
RSI: ${result.indicators.rsi}
Momentum: ${result.indicators.momentum}
MACD: ${result.indicators.macd}
      `.trim();
    } else {
      details = `
📊 【現在の分析】過去${actualCount}本（${timePeriod}）
通貨ペア: ${currentCurrencyPair}
時間足: ${currentChartTimeframe}
トレンド: ${result.trend}
信頼度: ${result.confidence}%

📈 テクニカル指標:
EMA(短期): ${result.indicators.ema1}
EMA(長期): ${result.indicators.ema2}
ADX: ${result.indicators.adx}
RSI: ${result.indicators.rsi}
Momentum: ${result.indicators.momentum}
MACD: ${result.indicators.macd}

💡 ${result.details}
      `.trim();
    }

    return {
      trend: result.trend,
      strength: result.strength,
      direction: result.direction,
      confidence: result.confidence,
      details: details,
      indicators: result.indicators,
      prediction: result.prediction,
      phases: result.phases,
      pattern: result.pattern
    };
  }

  // ペイアウト率を検出
  function detectPayoutRate() {
    let payoutRate = null;

    try {
      // メインフレームで検出
      if (isMainFrame) {
        // 方法1: ペイアウト率表示要素を直接検索（例: "+92%" や "1.92" など）
        const payoutSelectors = [
          '.payout-value',
          '.payout-rate',
          '.profit-rate',
          '[class*="payout"]',
          '[class*="profit"]',
          '.trade-payout',
          '.option-payout'
        ];

        for (const selector of payoutSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const rate = extractPayoutRate(el.textContent);
            if (rate) {
              payoutRate = rate;
              break;
            }
          }
          if (payoutRate) break;
        }

        // 方法2: iframe内を検索
        if (!payoutRate) {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              if (iframeDoc) {
                // ペイアウト関連のテキストを含む要素を検索
                const walker = iframeDoc.createTreeWalker(
                  iframeDoc.body,
                  NodeFilter.SHOW_TEXT,
                  null,
                  false
                );

                let node;
                while (node = walker.nextNode()) {
                  const text = node.textContent.trim();
                  // "92%", "+92%", "1.92" などのパターンを検索
                  const rate = extractPayoutRate(text);
                  if (rate) {
                    // 親要素がペイアウト関連かチェック
                    const parent = node.parentElement;
                    if (parent && isPayoutRelatedElement(parent)) {
                      payoutRate = rate;
                      break;
                    }
                  }
                }
                if (payoutRate) break;

                // セレクターで検索
                for (const selector of payoutSelectors) {
                  const elements = iframeDoc.querySelectorAll(selector);
                  for (const el of elements) {
                    const rate = extractPayoutRate(el.textContent);
                    if (rate) {
                      payoutRate = rate;
                      break;
                    }
                  }
                  if (payoutRate) break;
                }
              }
            } catch (e) {}
            if (payoutRate) break;
          }
        }

        // 方法3: 全テキストノードからペイアウト関連を検索
        if (!payoutRate) {
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.children.length === 0) { // 末端要素
              const text = el.textContent.trim();
              if (text.includes('%') || text.match(/^1\.\d{2}$/)) {
                const rate = extractPayoutRate(text);
                if (rate && isPayoutRelatedElement(el)) {
                  payoutRate = rate;
                  break;
                }
              }
            }
          }
        }
      }

      // iframeコンテキストでの検出
      if (isIframe && !payoutRate) {
        const payoutSelectors = [
          '.payout-value',
          '.payout-rate',
          '.profit-rate',
          '[class*="payout"]',
          '[class*="profit"]'
        ];

        for (const selector of payoutSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const rate = extractPayoutRate(el.textContent);
            if (rate) {
              payoutRate = rate;
              break;
            }
          }
          if (payoutRate) break;
        }
      }

      if (payoutRate) {
        console.log('%c[ペイアウト率] 検出:', 'background: #FF9800; color: white; padding: 2px 6px;', payoutRate);
      }

    } catch (e) {
      console.error('[ペイアウト率] 検出エラー:', e);
    }

    return payoutRate;
  }

  // テキストからペイアウト率を抽出
  function extractPayoutRate(text) {
    if (!text) return null;

    // パターン1: "+92%" や "92%" → 1.92
    const percentMatch = text.match(/[+]?(\d{1,3})%/);
    if (percentMatch) {
      const percent = parseInt(percentMatch[1]);
      if (percent >= 50 && percent <= 200) {
        return 1 + (percent / 100); // 92% → 1.92
      }
    }

    // パターン2: "1.92" や "×1.92" → 1.92
    const decimalMatch = text.match(/[×x]?\s*(1\.\d{1,2})/i);
    if (decimalMatch) {
      const rate = parseFloat(decimalMatch[1]);
      if (rate >= 1.01 && rate <= 3.00) {
        return rate;
      }
    }

    // パターン3: "92" のみ（コンテキストによる）→ 1.92
    const numberMatch = text.match(/^(\d{2})$/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1]);
      if (num >= 50 && num <= 99) {
        return 1 + (num / 100);
      }
    }

    return null;
  }

  // 要素がペイアウト関連かどうかをチェック
  function isPayoutRelatedElement(element) {
    if (!element) return false;

    const payoutKeywords = ['payout', 'profit', 'rate', 'ペイアウト', '利益', '倍率', 'return'];
    const classAndId = (element.className || '') + ' ' + (element.id || '');

    for (const keyword of payoutKeywords) {
      if (classAndId.toLowerCase().includes(keyword.toLowerCase())) {
        return true;
      }
    }

    // 親要素も確認（2階層まで）
    let parent = element.parentElement;
    for (let i = 0; i < 2 && parent; i++) {
      const parentClassAndId = (parent.className || '') + ' ' + (parent.id || '');
      for (const keyword of payoutKeywords) {
        if (parentClassAndId.toLowerCase().includes(keyword.toLowerCase())) {
          return true;
        }
      }
      parent = parent.parentElement;
    }

    return false;
  }

  // シグナル分析を実行（5層分析システム）
  async function performSignalAnalysis(candleCountKey) {
    // 通貨ペアをチェック（localStorageフォールバック付き）
    let pair = currentCurrencyPair;
    if (pair === '検出中...') {
      // localStorageから取得を試行
      const savedPair = localStorage.getItem(CONFIG.currencyPairKey);
      if (savedPair && savedPair !== '検出中...') {
        pair = savedPair;
        currentCurrencyPair = pair;
        console.log('[シグナル分析] localStorageから通貨ペア取得:', pair);
      } else {
        // 再検出を試行
        detectCurrencyPair();
        pair = currentCurrencyPair;
      }
    }

    if (pair === '検出中...') {
      throw new Error('通貨ペアを検出できません。チャート画面が表示されているか確認してください。');
    }

    // 分析期間の設定（30, 60, 120, 180, 240分）
    const requestedCount = parseInt(candleCountKey) || 120;

    console.log('%c[シグナル分析] 開始:', 'background: #E91E63; color: white; padding: 2px 6px;',
      `${currentCurrencyPair}, ${requestedCount}本`);

    // ローソク足データを取得
    const result = await fetchRealCandleData(requestedCount);
    const candles = convertAPIDataToCandles(result.candles);

    if (candles.length === 0) {
      throw new Error('有効なローソク足データがありません。');
    }

    if (candles.length < 30) {
      throw new Error(`データ不足: ${candles.length}本（最低30本必要）`);
    }

    // SignalEngine を使用して5層分析を実行
    if (!window.SignalEngine) {
      throw new Error('SignalEngine が読み込まれていません');
    }

    const signalEngine = new window.SignalEngine();
    signalEngine.setCandles(candles);

    const signalResult = signalEngine.analyze();

    console.log('%c[シグナル分析] 完了:', 'background: #4CAF50; color: white; padding: 2px 6px;',
      `シグナル: ${signalResult.signal}, 信頼度: ${signalResult.confidence}%`);

    // 追加情報を付与
    signalResult.currencyPair = currentCurrencyPair;
    signalResult.timeframe = currentChartTimeframe;
    signalResult.candleCount = candles.length;
    signalResult.analysisTime = new Date().toISOString();

    return signalResult;
  }

})();
