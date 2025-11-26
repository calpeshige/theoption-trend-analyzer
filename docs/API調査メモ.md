# TheOption API調査メモ

## 🎯 最終更新: 2025-10-25 (Chrome DevTools MCP調査完了)

## 調査方法
Chrome DevTools MCPサーバーを使用して、実際のTheOptionサイトから自動取得

---

## ✅ 確認済みAPI情報

### 1. APIベースアドレス
```
https://platformapi.theoption.com/Client.svc/
```
**確認方法**: ネットワークリクエスト監視 + SDK設定ファイル

### 2. プラットフォーム設定
```javascript
{
  "origin": "https://platformapi.theoption.com/Client.svc",
  "operatorName": "TheOption",
  "operatorId": 1,
  "clientType": 10,
  "demo": false
}
```

### 3. WebSocket (Lightstreamer)
```
URL: wss://push.theoption.com/lightstreamer/
Host: push.theoption.com
Port: 443
Engine: theOptionChartd
Adapter: MARKETSPULSE_REMOTE
```

**セッション例**:
```
Session ID: S941347ed9e0386dfMa2aT2122700
Server: Lightstreamer HTTP Server
IP: 30.10.46.83
```

---

## 📡 確認済みAPIエンドポイント

### GetAssetsMetaData
**用途**: 全通貨ペア・アセット情報の取得

**URL**: `POST https://platformapi.theoption.com/Client.svc/GetAssetsMetaData`

**リクエスト**:
```json
{
  "operatorName": "TheOption",
  "timeout": 60000
}
```

**レスポンス例**:
```json
{
  "data": {
    "AssetsMetaData": [
      {
        "AssetId": 1,
        "MarketType": "Currency",
        "Name": "USD/JPY",
        "PipSize": 0.01,
        "Precision": 3,
        "SupportedResolutions": ["P1D", "P1M", "P1W", "PT10M", "PT15M", "PT1H", "PT1M", "PT3M", "PT4H", "PT5M"],
        "Ticker": "USDJPY"
      },
      {
        "AssetId": 2,
        "MarketType": "Currency",
        "Name": "EUR/USD",
        "PipSize": 0.0001,
        "Precision": 5,
        "SupportedResolutions": ["P1D", "P1M", "P1W", "PT10M", "PT15M", "PT1H", "PT1M", "PT3M", "PT4H", "PT5M"],
        "Ticker": "EURUSD"
      },
      {
        "AssetId": 1006,
        "MarketType": "Commodity",
        "Name": "GOLD",
        "PipSize": 1.0,
        "Precision": 2,
        "SupportedResolutions": ["P1D", "P1M", "P1W", "PT10M", "PT15M", "PT1H", "PT1M", "PT3M", "PT4H", "PT5M"],
        "Ticker": "XAUUSD"
      }
    ]
  },
  "status": "success",
  "timestamp": "2025-10-25T04:21:22.689Z"
}
```

**利用可能なアセット一覧**:
| AssetId | Name | MarketType | Ticker | Precision |
|---------|------|------------|--------|-----------|
| 1 | USD/JPY | Currency | USDJPY | 3 |
| 2 | EUR/USD | Currency | EURUSD | 5 |
| 3 | GBP/USD | Currency | GBPUSD | 5 |
| 4 | EUR/GBP | Currency | EURGBP | 5 |
| 5 | EUR/JPY | Currency | EURJPY | 3 |
| 6 | GBP/JPY | Currency | GBPJPY | 3 |
| 7 | AUD/JPY | Currency | AUDJPY | 3 |
| 9 | AUD/USD | Currency | AUDUSD | 5 |
| 10 | NZD/JPY | Currency | NZDJPY | 3 |
| 11 | NZD/USD | Currency | NZDUSD | 5 |
| 12 | USD/CHF | Currency | USDCHF | 5 |
| 13 | CAD/JPY | Currency | CADJPY | 3 |
| 14 | CHF/JPY | Currency | CHFJPY | 3 |
| 15 | USD/CAD | Currency | USDCAD | 5 |
| 16 | EUR/AUD | Currency | EURAUD | 5 |
| 17 | GBP/AUD | Currency | GBPAUD | 5 |
| 1006 | GOLD | Commodity | XAUUSD | 2 |
| 1012 | BTC/USD | Crypto | XBTUSD | 0 |
| 1013 | ETH/JPY | Crypto | ETHJPY | 0 |
| 1014 | ETH/USD | Crypto | ETHUSD | 1 |
| 1015 | BTC/JPY | Crypto | BTCJPY | 0 |

### サポートされている時間足 (SupportedResolutions)
ISO 8601 Period形式:
- `PT1M` - 1分足
- `PT3M` - 3分足
- `PT5M` - 5分足
- `PT10M` - 10分足
- `PT15M` - 15分足
- `PT1H` - 1時間足
- `PT4H` - 4時間足
- `P1D` - 1日足
- `P1W` - 1週間足
- `P1M` - 1ヶ月足

---

## 🔐 認証・セッション管理

### LocalStorage
```javascript
// ログイン状態
localStorage.getItem("isUserLoggedIn") // "true" or "false"

// プラクティスモード
localStorage.getItem("TheOption_IsPracticeMode") // "false"

// アセット情報キャッシュ
localStorage.getItem("cachedAssetsFor-theOptionProd") // JSON形式のアセット情報
```

### MPオブジェクト (グローバル設定)
```javascript
window.MP = {
  userId: "929642",
  siteCurrency: "¥",
  UserCurrency: "¥",
  isPracticeMode: false,
  IsQuickDemoLoginEnabled: false,
  antiForgeryToken: "dcc_duj...",  // CSRF保護用
  DisplayDecimals: false,
  currencyFormatPrecision: "2"
}
```

### Cookie
```
cultureData=currentCulture=ja-JP
TheOptionCountFailureLogin=0
AWSALB=... (ロードバランサー用)
AWSALBCORS=... (CORS対応)
```

---

## 🚀 SDK・サービス構成

### Reactive Services SDK
```
Base URL: https://platform-sdk.theoption.com/reactive-services/1.16.0/
```

**利用可能なサービス**:
- `auth-service/service.js` - 認証サービス
- `market-service/service.js` - マーケットデータサービス
- `server-time-service/service.js` - サーバー時刻同期
- `trader-service/service.js` - トレーダー情報・残高管理

### 設定ファイル
```
https://platform-sdk.theoption.com/config/theOptionProd.json
```

**主要設定**:
```json
{
  "serverTime": {
    "origin": "https://platformapi.theoption.com/Client.svc"
  },
  "trade": {
    "origin": "https://platformapi.theoption.com/Client.svc",
    "operatorName": "TheOption",
    "operatorId": 1,
    "clientType": 10,
    "requestTimeout": 5000,
    "LS_HOST": "push.theoption.com",
    "LS_PORT": "443",
    "LS_DOMAIN": "theoption.com",
    "LS_ENGINE_NAME": "theOptionChartd"
  },
  "featureToggles": {
    "usePrivateDataStreams": true,
    "isRecentlyTradedEnabled": false,
    "isTradingTrendEnabled": false
  }
}
```

---

## 📊 その他のエンドポイント (推測)

以下は設定ファイルから推測されるエンドポイント:

### GetSiteSettingsValues
```
POST https://platformapi.theoption.com/Client.svc/GetSiteSettingsValues
```

### GetTraderBalance
```
GET/POST https://platformapi.theoption.com/Client.svc/GetTraderBalance
```

### GetCandles (推測)
**注意**: このエンドポイントは未確認。実際のチャートデータはLightstreamer経由でストリーミング配信される可能性が高い

```
GET/POST https://platformapi.theoption.com/Client.svc/GetCandles?assetId={id}&from={timestamp}&to={timestamp}&detalization={resolution}
```

---

## 🔍 ローソク足データ取得方法

### 方法1: Lightstreamer WebSocket (推奨)
リアルタイムデータはLightstreamerプロトコルでストリーミング配信

**接続先**:
```
wss://push.theoption.com/lightstreamer/
```

**手順**:
1. セッション作成: `POST /lightstreamer/create_session.js`
2. サブスクリプション: アセットID + 時間足を指定
3. リアルタイム受信: OHLC + Tickデータ

### 方法2: REST API (要確認)
過去データ取得用のエンドポイントが存在する可能性あり

**推測エンドポイント**:
```
POST /Client.svc/GetHistoricalData
POST /Client.svc/GetCandles
```

**要調査**: 実際にチャートを操作して、Network タブでリクエストを確認する必要あり

---

## 🛠️ MCP統合のための実装ガイド

### ステップ1: アセット一覧取得
```javascript
const response = await fetch('https://platformapi.theoption.com/Client.svc/GetAssetsMetaData', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    operatorName: 'TheOption',
    timeout: 60000
  })
});
const { data } = await response.json();
// data.AssetsMetaData に全アセット情報
```

### ステップ2: WebSocket接続 (Lightstreamer)
```javascript
// Lightstreamerクライアントライブラリが必要
// npm install lightstreamer-client-node

import { LightstreamerClient, Subscription } from 'lightstreamer-client-node';

const client = new LightstreamerClient('https://push.theoption.com', 'MARKETSPULSE_REMOTE');
client.connect();

const subscription = new Subscription('MERGE', ['Asset_1'], ['last', 'time', 'bid', 'ask']);
subscription.addListener({
  onItemUpdate: (update) => {
    console.log('Price update:', update.getValue('last'));
  }
});

client.subscribe(subscription);
```

### ステップ3: セッション管理
```javascript
// Cookie経由でセッション維持
// ブラウザからCookieをエクスポートして使用
const headers = {
  'Cookie': 'AWSALB=...; AWSALBCORS=...'
};
```

---

## ⚠️ 注意事項

### ローソク足データAPI
**未確認**: REST APIでの過去データ取得エンドポイントは確認できていません

**推奨対応**:
1. Lightstreamer WebSocketでリアルタイムデータを受信
2. 受信データをローカルに蓄積してローソク足を構築
3. または、実際のトレーディング画面でチャート操作時のAPIコールを監視

### WebSocket vs REST API
TheOptionは主にWebSocketベースのリアルタイムストリーミング:
- ✅ Lightstreamer経由でリアルタイム価格配信
- ❓ REST APIでの過去データ一括取得は要調査

---

## 📝 調査項目チェックリスト

- [x] APIベースURL
- [x] アセット一覧取得エンドポイント
- [x] アセットID ↔ 通貨ペア名マッピング
- [x] サポートされている時間足
- [x] WebSocket URL (Lightstreamer)
- [x] 認証方法 (Cookie + localStorage)
- [ ] **ローソク足データ取得API** (REST) - 要調査
- [ ] 過去データ一括取得方法 - 要調査
- [ ] エラーレスポンス形式 - 要調査
- [ ] レート制限の有無 - 要調査

---

## 🎯 次のステップ

### 優先度: 高
1. **Lightstreamer統合**: WebSocketでリアルタイムデータ受信実装
2. **MCPサーバー更新**: 取得したAPI情報を `theoption-mcp-server.js` に反映
3. **アセット管理**: GetAssetsMetaData のレスポンスをキャッシュ

### 優先度: 中
4. **過去データAPI調査**: 実際にチャート操作してRESTエンドポイント確認
5. **エラーハンドリング**: 各種エラーレスポンスの処理実装

### 優先度: 低
6. **Chrome拡張機能統合**: Lightstreamerデータを拡張機能で表示
7. **テクニカル分析実装**: ローソク足データからトレンド分析

---

## 参考リンク

- [Lightstreamer公式ドキュメント](https://lightstreamer.com/docs/)
- [ISO 8601 Period形式](https://en.wikipedia.org/wiki/ISO_8601#Durations)
- [MCP使用ガイド](MCP使用ガイド.md)
