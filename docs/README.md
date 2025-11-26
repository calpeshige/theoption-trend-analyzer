# TheOption Trend Analyzer

TheOptionのトレーディングプラットフォーム用のChrome拡張機能で、高度なテクニカル分析とトレンド予測を提供します。

## 🚧 開発状況

**現在のステータス**: API調査中

### 完了項目
- ✅ プロジェクトフォルダ構成
- ✅ manifest.json作成
- ✅ API調査メモ作成

### 未完了項目（要実装）
- ⏳ TheOption API仕様の特定
  - ローソク足データ取得エンドポイント
  - 認証方法
  - パラメータ形式
- ⏳ テクニカル分析エンジン（Bubingaコードを移植）
- ⏳ UI実装
- ⏳ データ取得ロジック

## 📋 必要な調査作業

### 手順1: TheOptionにログイン
1. https://jp.theoption.com/trading にアクセス
2. アカウントにログイン
3. トレーディング画面を開く

### 手順2: DevToolsでAPI調査
1. Chrome DevTools を開く（F12）
2. **Network** タブを選択
3. **XHR** または **Fetch** フィルタを有効化
4. チャートを操作（通貨ペア変更、時間足変更）
5. APIリクエストを記録

### 手順3: 必要な情報を記録
以下の情報を `API調査メモ.md` に追記してください：

```
✅ チェック項目:
□ ローソク足データ取得API URL
□ リクエストメソッド (GET/POST)
□ 必要なヘッダー (Authorization, Cookie等)
□ パラメータ (asset_id, from, to, detalization等)
□ レスポンスJSON構造
□ アセット一覧取得API (あれば)
```

### 例: 記録すべき情報

#### リクエスト例
```
URL: https://platformapi.theoption.com/Client.svc/GetCandles
Method: POST
Headers:
  Content-Type: application/json
  Authorization: Bearer [TOKEN]
Body:
  {
    "assetId": 1,
    "from": "2025-10-24T14:00:00Z",
    "to": "2025-10-24T15:00:00Z",
    "interval": "1m"
  }
```

#### レスポンス例
```json
{
  "success": true,
  "data": [
    {
      "timestamp": 1729781400,
      "open": 1.08500,
      "high": 1.08550,
      "low": 1.08480,
      "close": 1.08520,
      "volume": 1000
    }
  ]
}
```

## 🔗 参考

### Bubinga版との比較
このプロジェクトは `bubinga_trend` をベースにしています：
- 同じテクニカル分析エンジンを使用予定
- UIデザインはTheOptionに合わせて調整
- API接続部分のみ書き換え

### Bubingaで使用したAPI
```javascript
// Bubinga API例
const url = `https://api.bubinga.com/api/v1/assets/${assetId}/candles?from=${from}&to=${to}&detalization=1m`;
headers: { 'x-jwt': authToken }
```

## 📁 プロジェクト構造

```
theoption_trend/
├── manifest.json                 # Chrome拡張機能設定
├── README.md                     # このファイル
├── API調査メモ.md                # API調査結果
├── technical-analysis-engine.js  # テクニカル分析エンジン（未作成）
├── theoption-analyzer.js         # メインスクリプト（未作成）
├── popup.html                    # ポップアップUI（未作成）
├── popup.js                      # ポップアップロジック（未作成）
├── popup.css                     # スタイル（未作成）
└── icons/                        # アイコン画像
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## ⚠️ 注意事項

1. **API調査が最優先**: 実装前に必ずAPIエンドポイントと仕様を特定してください
2. **認証方法**: TheOptionのセッション管理方法を確認する必要があります
3. **CORS制限**: API呼び出しにCORS制限がある場合、manifest.jsonの`host_permissions`で対応
4. **利用規約**: TheOptionの利用規約を確認し、自動化ツールの使用が許可されているか確認してください

## 📝 開発ログ

### 2025-10-24
- プロジェクト初期化
- API調査メモ作成
- manifest.json作成
- 次のステップ: 実際のAPI仕様を特定
