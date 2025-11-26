# 🚀 TheOption Trend Analyzer - クイックスタートガイド

> **新しいClaude Codeセッションを開始する際に、最初に読むべきファイル**

---

## ⚡ 3ステップで開発再開

### Step 1: コンテキストを読む（2分）
1. このファイル（QUICKSTART.md）を読む ← 今ここ
2. [CLAUDE_CONTEXT.md](CLAUDE_CONTEXT.md) を読む - プロジェクト全体像

### Step 2: 現在の状態を確認（1分）
```bash
cd /Users/shige/Documents/拡張機能/theoption_trend
ls -la
```

### Step 3: 次のタスクを実行
現在のフェーズに応じたタスクを実行（下記参照）

---

## 📍 現在の状態

### プロジェクト情報
- **名前**: TheOption Trend Analyzer
- **バージョン**: V1.0.0 (API調査版)
- **フェーズ**: Phase 1 - API調査
- **パス**: `/Users/shige/Documents/拡張機能/theoption_trend/`

### 完了済み
- ✅ プロジェクトフォルダ作成
- ✅ 基本ファイル作成（manifest.json, popup.html等）
- ✅ API調査用拡張機能の実装
- ✅ ドキュメント整備

### 次のタスク
- ⏳ **API調査の実施** ← 最優先

---

## 🎯 現在のフェーズ: Phase 1 - API調査

### 目的
TheOptionのAPIエンドポイントとパラメータを特定する

### 必要な作業

#### 1. 拡張機能をインストール
```
1. chrome://extensions/ を開く
2. デベロッパーモードをON
3. 「パッケージ化されていない拡張機能を読み込む」
4. このフォルダを選択
```

#### 2. TheOptionでAPI調査
```
1. https://jp.theoption.com/trading にログイン
2. F12でデベロッパーツールを開く
3. Consoleタブを選択
4. チャートを操作（通貨ペア変更、時間足変更）
5. コンソールに記録されたAPIコールを確認
```

#### 3. 情報を記録
以下を [API調査メモ.md](API調査メモ.md) に追記：
- [ ] エンドポイントURL
- [ ] リクエストメソッド
- [ ] 認証ヘッダー
- [ ] パラメータ
- [ ] レスポンス構造

---

## 📚 重要なファイル

### 必読ドキュメント（優先順）
1. **QUICKSTART.md** ← このファイル
2. **CLAUDE_CONTEXT.md** - 全体像と開発ガイド
3. **BUBINGA_KNOWLEDGE.md** - Bubingaからの技術的知見
4. **API調査メモ.md** - API調査結果（要記入）

### 実装ファイル
- **manifest.json** - Chrome拡張機能設定
- **theoption-analyzer.js** - メインスクリプト（調査モード）
- **technical-analysis-engine.js** - プレースホルダー
- **popup.html/css/js** - ポップアップUI

---

## 🔄 フェーズ別タスク

### Phase 1: API調査（現在）
**ゴール**: APIエンドポイントと仕様を特定

**タスク**:
- [ ] API調査実施
- [ ] 全情報を記録
- [ ] 手動でAPI呼び出しテスト（curlやPostman）

**完了条件**:
- API調査メモ.md に全項目が記入されている
- 手動でローソク足データを取得できる

### Phase 2: データ取得実装（次）
**ゴール**: APIからデータを取得する関数を実装

**タスク**:
- [ ] `fetchTheOptionCandles()` 関数作成
- [ ] 認証処理実装
- [ ] エラーハンドリング実装
- [ ] 時刻マージン対策（Bubingaの知見を適用）

### Phase 3: 分析機能移植
**ゴール**: テクニカル分析機能を実装

**タスク**:
- [ ] Bubingaのエンジンをコピー
- [ ] データ形式を適応
- [ ] テスト実行

### Phase 4: UI実装
**ゴール**: 分析パネルを表示

**タスク**:
- [ ] パネルUI作成
- [ ] 結果表示
- [ ] ユーザー操作処理

### Phase 5: テスト・リリース
**ゴール**: 配布可能な状態にする

**タスク**:
- [ ] 総合テスト
- [ ] バグ修正
- [ ] ドキュメント完成
- [ ] 配布版作成

---

## 🛠️ よく使うコマンド

### ファイル一覧
```bash
ls -lah
```

### ファイル編集
```bash
# VSCodeで開く
code .

# 特定ファイル
code CLAUDE_CONTEXT.md
```

### Chrome拡張機能の再読み込み
```
chrome://extensions/ で「更新」ボタンをクリック
```

---

## 💡 開発のヒント

### API調査時
- コンソールに色付きログが表示される
- `[API監視]` で始まるログを探す
- リクエストとレスポンスの両方を記録

### 実装時
- Bubingaのコードを参考にする
- 同じ問題を避けるため BUBINGA_KNOWLEDGE.md を読む
- デバッグログを充実させる

### 困ったら
1. CLAUDE_CONTEXT.md を読み直す
2. Bubingaプロジェクトのコードを確認
3. API調査メモ.md の記録を確認

---

## 🔗 関連プロジェクト

### Bubingaプロジェクト（参考用）
- **開発版**: `/Users/shige/Documents/拡張機能/bubinga_trend/`
- **配布版**: `/Users/shige/Documents/拡張機能/bubinga_trend_release/`

### 主要ファイル
- `technical-analysis-engine-v2.js` - 移植元
- `bubinga-analyzer-v4.9.js` - 参考実装
- `エラー修正履歴_API400.md` - 重要な知見

---

## ✅ 開発開始前のチェックリスト

新しいセッションで開発を始める前に：

- [ ] QUICKSTART.md を読んだ
- [ ] CLAUDE_CONTEXT.md を読んだ
- [ ] 現在のフェーズを理解した
- [ ] 次のタスクを把握した
- [ ] 必要なファイルの場所を確認した

---

## 🎯 次の行動

### API調査が未完了の場合
1. 拡張機能をインストール
2. TheOptionにログイン
3. API調査を実施
4. API調査メモ.md に記録

### API調査が完了している場合
1. API調査メモ.md を確認
2. Phase 2（データ取得実装）に進む
3. CLAUDE_CONTEXT.md の「Phase 2以降の実装ガイド」を参照

---

## 📞 サポート

### 詳細情報が必要な場合

| 知りたいこと | 参照ドキュメント |
|------------|----------------|
| プロジェクト全体像 | CLAUDE_CONTEXT.md |
| Bubingaの技術的知見 | BUBINGA_KNOWLEDGE.md |
| API調査方法 | インストール方法.md |
| API調査結果 | API調査メモ.md |
| プロジェクト概要 | README.md |

---

**準備完了！開発を始めましょう 🚀**

1. まず CLAUDE_CONTEXT.md を読む
2. API調査を実施（未完了の場合）
3. Phase 2に進む（API調査完了の場合）

---

**最終更新**: 2025-10-24
**作成者**: Claude Code
