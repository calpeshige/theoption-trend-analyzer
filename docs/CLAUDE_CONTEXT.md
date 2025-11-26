# Claude Code 引き継ぎドキュメント - TheOption Trend Analyzer

> **このファイルの目的**: 新しいClaude Codeセッションで、このプロジェクトの全コンテキストを即座に理解し、開発を継続できるようにする

---

## 📌 プロジェクト概要

### 基本情報
- **プロジェクト名**: TheOption Trend Analyzer
- **現在のバージョン**: V1.0.0 (API調査版)
- **ステータス**: 🚧 API調査フェーズ
- **作成日**: 2025-10-24
- **プロジェクトパス**: `/Users/shige/Documents/拡張機能/theoption_trend/`

### プロジェクトの目的
TheOptionのトレーディングプラットフォーム用のChrome拡張機能を開発し、Bubinga版と同等のテクニカル分析・トレンド予測機能を提供する。

### 親プロジェクト
このプロジェクトは **Bubinga Trend Analyzer (V4.9.1)** の姉妹プロジェクトです。
- Bubinga版パス: `/Users/shige/Documents/拡張機能/bubinga_trend/`
- Bubinga配布版: `/Users/shige/Documents/拡張機能/bubinga_trend_release/`

---

## 🎯 現在の開発フェーズ

### Phase 1: API調査（現在のフェーズ）

**目的**: TheOptionのAPIエンドポイントと仕様を特定する

**完了済み**:
- ✅ プロジェクトフォルダ作成
- ✅ manifest.json作成
- ✅ API調査用拡張機能の実装
- ✅ ドキュメント整備

**次のタスク**:
1. TheOptionにログインしてAPI調査を実行
2. ローソク足データ取得APIを特定
3. 認証方法を特定
4. レスポンス構造を記録
5. `API調査メモ.md` に全情報を追記

**未完了のフェーズ**:
- Phase 2: データ取得実装
- Phase 3: 分析機能移植
- Phase 4: UI実装
- Phase 5: テスト・リリース

---

## 📁 プロジェクト構造

```
theoption_trend/
├── CLAUDE_CONTEXT.md           # このファイル - 引き継ぎ用
├── manifest.json               # Chrome拡張機能設定
├── README.md                   # プロジェクト概要
├── API調査メモ.md              # API調査結果（要記入）
├── インストール方法.md         # インストールガイド
│
├── theoption-analyzer.js       # メインスクリプト（調査モード）
├── technical-analysis-engine.js # プレースホルダー（未実装）
├── popup.html                  # ポップアップUI
├── popup.css                   # スタイルシート
├── popup.js                    # ポップアップロジック
│
└── icons/                      # アイコン画像
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🔑 重要な技術情報

### 調査済みAPI情報

#### APIベースアドレス
```
https://platformapi.theoption.com/Client.svc/
```

#### 認証方法（推測）
- セッションID: `localStorage` に保存
- ログイン状態キー: `isUserLoggedIn`
- セッション管理: `MP.sessionId`

#### 未確認事項（調査必須）
- [ ] ローソク足データ取得エンドポイント
- [ ] リクエストメソッド (GET/POST)
- [ ] 認証ヘッダーの形式
- [ ] パラメータ（アセットID, from, to, detalization）
- [ ] レスポンスJSON構造
- [ ] アセット一覧取得API

### 現在の実装状況

#### theoption-analyzer.js（調査モード）
**機能**:
- fetch API呼び出しのフック・監視
- XMLHttpRequest の監視
- localStorage/sessionStorage の監視
- コンソールへのAPI情報記録

**重要なコード**:
```javascript
// platformapi.theoption.com へのリクエストを自動検出
window.fetch = function(...args) {
  if (url.includes('platformapi.theoption.com')) {
    console.log('URL:', url);
    console.log('Method:', options.method);
    console.log('Headers:', options.headers);
    console.log('Body:', options.body);
  }
  return originalFetch.apply(this, args);
};
```

---

## 🔄 Bubingaプロジェクトとの関係

### コード移植計画

TheOption版は、Bubinga版のコードをベースに開発します。

#### 移植元ファイル
| Bubingaファイル | TheOptionファイル | 移植状況 |
|----------------|------------------|---------|
| `technical-analysis-engine-v2.js` | `technical-analysis-engine.js` | ⏳ 未移植 |
| `bubinga-analyzer-v4.9.js` | `theoption-analyzer.js` | 🚧 調査モードのみ |
| `popup.html/css/js` | `popup.html/css/js` | ✅ 骨組み完成 |

#### 主要な変更箇所（API調査後に実装）

**データ取得部分**:
```javascript
// Bubinga版
const url = `https://api.bubinga.com/api/v1/assets/${assetId}/candles`;
const headers = { 'x-jwt': authToken };

// TheOption版（仮）
const url = `https://platformapi.theoption.com/Client.svc/[エンドポイント]`;
const headers = { /* 要調査 */ };
```

**テクニカル分析エンジン**:
- Bubinga版のロジックをそのまま移植可能
- calculateEMA(), calculateRSI(), calculateADX() 等
- 入力データ形式のみ調整

### Bubinga版で得られた重要な知見

#### 1. API時刻同期問題
**問題**: PC時刻がサーバーより進んでいると400エラー
**解決策**: 5分の安全マージンを設定
```javascript
const safeNow = new Date(now.getTime() - 5 * 60 * 1000);
```

#### 2. 確率の逆関係
**問題**: 継続確率と反転リスクが独立計算で合計>100%
**解決策**: 正規化して合計を100%に
```javascript
const totalScore = continuationScore + reversalScore;
if (totalScore > 100) {
  const ratio = 100 / totalScore;
  continuationProbability = Math.round(continuationScore * ratio);
  reversalRisk = Math.round(reversalScore * ratio);
}
```

#### 3. Windows互換性
**問題**: Windowsでselect要素のテキストが見えない
**解決策**: `color-scheme: dark` を追加
```html
<select style="color: white; color-scheme: dark;">
  <option style="background: #2d2d2d; color: white;">...</option>
</select>
```

#### 4. ネットワークタブの表示バグ
**発見**: DevToolsのネットワークタブと実際のリクエストURLが異なる場合がある
**対策**: `xhr.responseURL` で実際のURLを確認

---

## 🚀 開発開始時の手順

### 新しいセッションで開発を始める際

#### Step 1: プロジェクトを開く
```bash
cd /Users/shige/Documents/拡張機能/theoption_trend
```

#### Step 2: このファイルを読む
`CLAUDE_CONTEXT.md` を最初に読んでコンテキストを理解

#### Step 3: 現在のフェーズを確認
- Phase 1（API調査）が完了しているか？
- `API調査メモ.md` に情報が記録されているか？

#### Step 4: 次のタスクを実行
- API調査未完了 → 調査を実施
- API調査完了 → Phase 2（データ取得実装）に進む

---

## 📋 API調査の実施方法

### 事前準備
1. 拡張機能をChromeにインストール
   - `chrome://extensions/`
   - デベロッパーモードON
   - 「パッケージ化されていない拡張機能を読み込む」
   - このフォルダを選択

### 調査実行
1. https://jp.theoption.com/trading にログイン
2. F12でデベロッパーツールを開く
3. **Console** タブを選択
4. チャートを操作:
   - 通貨ペアを変更（EUR/USD等）
   - 時間足を変更（1分、5分等）
   - 異なる通貨ペアに切り替え

### 記録すべき情報
コンソールに表示されるAPIコールから以下を記録：

```
✅ チェックリスト:
□ エンドポイントURL（完全なパス）
□ リクエストメソッド (GET/POST)
□ 必要なヘッダー
  □ Authorization
  □ Content-Type
  □ Cookie
  □ その他
□ リクエストパラメータ
  □ アセットID/通貨ペアコード
  □ 開始時刻 (from)
  □ 終了時刻 (to)
  □ 時間足 (interval/detalization)
□ レスポンスJSON構造
  □ データ配列のキー名
  □ 各キャンドルのプロパティ（time, open, high, low, close, volume）
□ アセット一覧取得API（あれば）
```

### 記録場所
`API調査メモ.md` の「未確認事項（要調査）」セクションに追記

---

## 🔧 Phase 2以降の実装ガイド

### Phase 2: データ取得実装

#### タスクリスト
1. API接続関数の作成
   ```javascript
   async function fetchTheOptionCandles(assetId, from, to, detalization) {
     // API調査結果を基に実装
   }
   ```

2. 認証処理の実装
   ```javascript
   function getAuthToken() {
     // localStorage または sessionStorage から取得
   }
   ```

3. エラーハンドリング
   - 400エラー（パラメータエラー）
   - 401エラー（認証エラー）
   - 403エラー（権限エラー）
   - 429エラー（レート制限）

4. Bubingaの時刻マージン対策を適用
   ```javascript
   const safeNow = new Date(now.getTime() - 5 * 60 * 1000);
   ```

### Phase 3: 分析機能移植

#### タスクリスト
1. Bubingaのテクニカル分析エンジンをコピー
   ```bash
   # technical-analysis-engine-v2.js の内容をコピー
   ```

2. データ形式の適応
   ```javascript
   // Bubingaのデータ形式
   { from: timestamp, open: 1.08500, ... }

   // TheOptionのデータ形式（要確認）
   { time: timestamp, open: 1.08500, ... }
   ```

3. 関数名の調整（必要に応じて）
   - `analyzeBubingaData()` → `analyzeTheOptionData()`

### Phase 4: UI実装

#### タスクリスト
1. 分析パネルの作成
   - Bubinga版のパネルデザインを参考
   - TheOptionのページデザインに合わせて調整

2. 設定UIの実装
   - ローソク足本数選択
   - 通貨ペア選択
   - 時間足選択

3. 結果表示の実装
   - トレンド方向
   - 継続確率/反転リスク
   - エントリー提案

### Phase 5: テスト・リリース

#### タスクリスト
1. 機能テスト
   - データ取得
   - 分析精度
   - UI表示

2. エラーハンドリングテスト
   - ネットワークエラー
   - 認証エラー
   - データ不足エラー

3. ドキュメント完成
   - README.md更新
   - インストール方法.md更新

4. 配布版作成
   ```bash
   mkdir /Users/shige/Documents/拡張機能/theoption_trend_release
   # 必要ファイルのみコピー
   ```

---

## 💡 開発のベストプラクティス

### コーディング規約
1. **Bubingaとの一貫性を保つ**
   - 関数名、変数名の命名規則を統一
   - コメントスタイルを統一

2. **デバッグログを充実させる**
   ```javascript
   console.log('%c[TheOption Analyzer]', 'background: #1976D2; color: white; padding: 2px 6px;', 'メッセージ');
   ```

3. **エラーハンドリングを徹底**
   - すべてのAPI呼び出しに try-catch
   - ユーザーにわかりやすいエラーメッセージ

### Git管理（推奨）
```bash
cd /Users/shige/Documents/拡張機能/theoption_trend
git init
git add .
git commit -m "Initial commit: API調査版"
```

### バージョン管理
- `manifest.json` の version を更新
- 主要な変更時に README.md の開発ログを更新

---

## 🔗 参考ドキュメント

### プロジェクト内
- [README.md](README.md) - プロジェクト概要
- [API調査メモ.md](API調査メモ.md) - API調査結果
- [インストール方法.md](インストール方法.md) - インストールガイド

### Bubingaプロジェクト
- [../bubinga_trend/README.md](../bubinga_trend/README.md)
- [../bubinga_trend/ANALYSIS_LOGIC.md](../bubinga_trend/ANALYSIS_LOGIC.md)
- [../bubinga_trend/エラー修正履歴_API400.md](../bubinga_trend/エラー修正履歴_API400.md)

### 全体構成
- [../プロジェクト構成.md](../プロジェクト構成.md) - 全プロジェクトの比較

---

## ⚠️ 注意事項

### セキュリティ
- 認証トークンやセッションIDをコード内にハードコーディングしない
- デバッグログに機密情報を出力しない
- GitHub等に公開する場合は機密情報を除去

### 利用規約
- TheOptionの利用規約を確認し、自動化ツールの使用が許可されているか確認
- 過度なAPI呼び出しでサーバーに負荷をかけない
- レート制限を遵守

### 責任
- この拡張機能は学習・開発用途
- 実際の取引は自己責任
- 損失について開発者は責任を負わない

---

## 📞 開発時のチェックリスト

### 新しいセッション開始時
- [ ] `CLAUDE_CONTEXT.md` を読む
- [ ] 現在のフェーズを確認
- [ ] `API調査メモ.md` の状態を確認
- [ ] 前回のTODOを確認

### API調査完了時
- [ ] 全ての調査項目を `API調査メモ.md` に記録
- [ ] エンドポイントURLを確認
- [ ] レスポンスJSON構造を記録
- [ ] 認証方法を特定

### コード実装時
- [ ] Bubingaのコードを参考にする
- [ ] デバッグログを追加
- [ ] エラーハンドリングを実装
- [ ] コメントを充実させる

### Phase完了時
- [ ] 機能テストを実施
- [ ] ドキュメントを更新
- [ ] manifest.json のバージョンを更新
- [ ] 次のPhaseのタスクを明確化

---

## 🎓 Bubingaプロジェクトから学ぶべきこと

### 技術的な実装パターン

#### 1. XMLHttpRequest vs fetch
Bubingaでは最終的に `XMLHttpRequest` を使用（fetch APIのフック回避）
```javascript
const xhr = new XMLHttpRequest();
xhr.open('GET', apiUrl, true);
xhr.setRequestHeader('x-jwt', authToken);
```

#### 2. 時刻の扱い
5分のマージンで時刻同期問題を回避
```javascript
const now = new Date();
const safeNow = new Date(now.getTime() - 5 * 60 * 1000);
```

#### 3. データ検証
APIレスポンスの検証を徹底
```javascript
if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
  throw new Error('APIからデータを取得できませんでした。');
}
```

#### 4. テクニカル分析
Bubingaで実装済みの関数（そのまま移植可能）:
- `calculateEMA(data, period)` - 指数移動平均
- `calculateRSI(data, period)` - 相対力指数
- `calculateADX(data, period)` - 平均方向性指数
- `identifyTrend(adx, ema)` - トレンド判定
- `predictNextMove(trend, rsi, support, resistance)` - 次の動き予測

### UIデザインパターン

#### パネル配置
Bubingaでは中央固定配置を採用
```javascript
panel.style.position = 'fixed';
panel.style.top = '50%';
panel.style.left = '50%';
panel.style.transform = 'translate(-50%, -50%)';
```

#### ドラッグ可能パネル
ユーザーがパネルを移動できる機能を実装
```javascript
panel.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', stopDrag);
```

---

## 📝 開発履歴テンプレート

### バージョン更新時にREADME.mdに追記

```markdown
## 開発ログ

### V1.0.0 (2025-10-24)
- プロジェクト初期化
- API調査モード実装
- ドキュメント整備

### V1.1.0 (予定)
- API調査完了
- データ取得機能実装

### V2.0.0 (予定)
- テクニカル分析機能実装
- UI実装
- 初回リリース
```

---

## 🎯 最優先タスク

### 今すぐやるべきこと
1. **API調査の実施**
   - TheOptionにログイン
   - デベロッパーツールでAPI監視
   - `API調査メモ.md` に全情報を記録

2. **調査結果の検証**
   - エンドポイントが正しいか確認
   - 手動でAPIコールを試す（curlやPostman）

3. **実装方針の決定**
   - Bubingaと同じアーキテクチャを採用するか
   - 改善すべき点はあるか

---

**このドキュメントを読んだ後、すぐに開発を始められます。**
**わからないことがあれば、Bubingaプロジェクトのコードを参照してください。**

---

**最終更新**: 2025-10-24
**作成者**: Claude Code
**次回セッションで最初に読むべきファイル**: このファイル（CLAUDE_CONTEXT.md）
