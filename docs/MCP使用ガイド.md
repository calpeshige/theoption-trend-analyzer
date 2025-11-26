# TheOption MCP Server 使用ガイド

## 概要

TheOptionのAPIにMCP (Model Context Protocol) 経由でアクセスするためのサーバーです。
Claude Code等のMCPクライアントから TheOption API を呼び出すことができます。

## セットアップ

### 1. 依存パッケージのインストール

```bash
cd /Users/shige/Documents/拡張機能/theoption_trend
npm install
```

### 2. Claude Code の設定ファイルに追加

`~/.claude/mcp.json` (または Claude Code の設定ファイル) に以下を追加:

```json
{
  "mcpServers": {
    "theoption": {
      "command": "node",
      "args": [
        "/Users/shige/Documents/拡張機能/theoption_trend/theoption-mcp-server.js"
      ],
      "env": {
        "THEOPTION_API_BASE": "https://platformapi.theoption.com/Client.svc",
        "THEOPTION_SESSION_STORAGE": "/Users/shige/Documents/拡張機能/theoption_trend/.session"
      }
    }
  }
}
```

### 3. セッションIDの取得

TheOptionにログインして、ブラウザのDevToolsでセッションIDを取得します:

1. https://jp.theoption.com/trading にログイン
2. F12 → Console タブを開く
3. 以下のいずれかを実行:

```javascript
// 方法1: localStorage から取得
localStorage.getItem('sessionId')

// 方法2: MP オブジェクトから取得
MP.sessionId

// 方法3: 全ての認証情報を確認
console.log({
  sessionId: MP.sessionId,
  isLoggedIn: localStorage.getItem('isUserLoggedIn'),
  cookies: document.cookie
})
```

4. 表示されたセッションIDをコピー

## 使用方法

### MCPサーバーの起動確認

Claude Code を起動すると自動的にMCPサーバーが起動します。
手動でテストする場合:

```bash
node theoption-mcp-server.js
```

### 利用可能なツール

#### 1. `get_api_info`
API情報とエンドポイント一覧を取得

```javascript
// Claude Code で使用
mcp__theoption__get_api_info()
```

出力例:
```json
{
  "apiBase": "https://platformapi.theoption.com/Client.svc",
  "tradingUrl": "https://jp.theoption.com/trading",
  "isLoggedIn": false,
  "hasSession": false,
  "endpoints": {
    "candles": "/GetCandles",
    "assets": "/GetAssets",
    "balance": "/GetTraderBalance"
  }
}
```

#### 2. `set_session`
セッション情報を設定（最初に必ず実行）

```javascript
// ブラウザから取得したセッションIDを設定
mcp__theoption__set_session({
  sessionId: "あなたのセッションID",
  cookies: {} // オプション
})
```

#### 3. `get_candles`
ローソク足データを取得

```javascript
// 例: EUR/USD の過去1時間の1分足データ
const now = Math.floor(Date.now() / 1000);
const oneHourAgo = now - 3600;

mcp__theoption__get_candles({
  assetId: 1,              // 1 = EUR/USD (要確認)
  from: oneHourAgo,        // 開始時刻 (Unix timestamp)
  to: now,                 // 終了時刻 (Unix timestamp)
  detalization: "1m"       // 時間足: 1m, 5m, 15m, 30m, 1h, 4h, 1d
})
```

#### 4. `get_assets`
利用可能な全通貨ペア一覧を取得

```javascript
mcp__theoption__get_assets()
```

#### 5. `get_trader_balance`
トレーダーの残高情報を取得

```javascript
mcp__theoption__get_trader_balance()
```

#### 6. `get_session_status`
現在のセッション状態を確認

```javascript
mcp__theoption__get_session_status()
```

#### 7. `load_session` / `save_session`
セッション情報の永続化

```javascript
// セッション情報を保存
mcp__theoption__save_session()

// 保存したセッション情報を読み込み
mcp__theoption__load_session()
```

## ワークフロー例

### 初回セットアップ

```javascript
// 1. API情報を確認
mcp__theoption__get_api_info()

// 2. セッションIDを設定（ブラウザから取得したもの）
mcp__theoption__set_session({
  sessionId: "your-session-id-here"
})

// 3. セッション状態を確認
mcp__theoption__get_session_status()

// 4. セッションを保存（次回から load_session で読み込める）
mcp__theoption__save_session()
```

### データ取得

```javascript
// 1. 保存済みセッションを読み込み
mcp__theoption__load_session()

// 2. 利用可能な通貨ペアを確認
mcp__theoption__get_assets()

// 3. ローソク足データを取得
const now = Math.floor(Date.now() / 1000);
const from = now - 3600; // 1時間前

mcp__theoption__get_candles({
  assetId: 1,
  from: from,
  to: now,
  detalization: "1m"
})

// 4. 残高を確認
mcp__theoption__get_trader_balance()
```

## トラブルシューティング

### エラー: "認証が必要です"

**原因**: セッションIDが設定されていないか、期限切れ

**対処法**:
1. ブラウザで TheOption にログインし直す
2. 新しいセッションIDを取得
3. `set_session` で設定し直す

### エラー: "APIレスポンスが返らない"

**原因**: エンドポイントURLやパラメータが間違っている可能性

**対処法**:
1. ブラウザのDevTools → Network タブで実際のAPIコールを確認
2. [API調査メモ.md](API調査メモ.md) を更新
3. MCPサーバーのエンドポイント実装を修正

### セッションが保存されない

**確認事項**:
- `.session` ファイルの書き込み権限
- `THEOPTION_SESSION_STORAGE` 環境変数のパス

## 注意事項

### セキュリティ

⚠️ **重要**: セッションIDは機密情報です
- `.session` ファイルを `.gitignore` に追加
- セッションIDを他人と共有しない
- 定期的にログインし直して新しいセッションを使用

### API制限

- TheOption のAPIレート制限に注意
- 大量リクエストを避ける
- エラーレスポンスを適切に処理

### 開発中の制限

現在、以下の情報が未確定です（実際のAPI調査が必要）:

- ✅ APIベースURL: 確認済み
- ⚠️ 正確なエンドポイント名: 推測
- ⚠️ アセットIDマッピング: 未確認
- ⚠️ レスポンスJSON構造: 未確認
- ⚠️ 認証ヘッダーの形式: 推測

**次のステップ**: 実際にブラウザでAPIコールを監視して、正確な仕様を確認してください。

## API調査の進め方

### 1. Chrome拡張機能で監視

拡張機能 [theoption-analyzer.js](theoption-analyzer.js:1) が自動でAPIコールを記録します:

1. 拡張機能をインストール
2. TheOptionにログイン
3. チャートを操作（通貨ペア変更、時間足変更）
4. Consoleに記録されたAPI情報を確認
5. [API調査メモ.md](API調査メモ.md) に追記

### 2. Network タブで確認

DevTools → Network → Fetch/XHR で:
- リクエストURL
- メソッド (GET/POST)
- Headers (特に認証関連)
- Request Payload
- Response データ構造

### 3. MCPサーバー更新

調査結果を元に [theoption-mcp-server.js](theoption-mcp-server.js:1) を更新:

```javascript
// 例: エンドポイントが /GetCandleData だった場合
async getCandles(assetId, from, to, detalization = '1m') {
  const params = new URLSearchParams({
    assetId: assetId.toString(),
    from: from.toString(),
    to: to.toString(),
    detalization,
  });

  return this.request(`/GetCandleData?${params}`, {
    method: 'GET',
  });
}
```

## ファイル構成

```
theoption_trend/
├── theoption-mcp-server.js   # MCPサーバー本体
├── package.json               # Node.js依存関係
├── mcp.json                   # Claude Code用設定
├── .session                   # セッション情報（自動生成、gitignore推奨）
├── theoption-analyzer.js      # Chrome拡張（API監視用）
├── API調査メモ.md             # API調査結果
└── MCP使用ガイド.md           # このファイル
```

## 今後の拡張

実装予定の機能:

- [ ] WebSocket接続（リアルタイム価格更新）
- [ ] 注文実行API
- [ ] ポジション管理API
- [ ] 履歴データ取得
- [ ] エラーリトライ機能
- [ ] レート制限対応
- [ ] 自動セッション更新

## 参考リンク

- [MCP仕様](https://modelcontextprotocol.io/)
- [API調査メモ](API調査メモ.md)
- [API調査実施ガイド](API調査実施ガイド.md)
- [Chrome拡張インストール方法](インストール方法.md)
