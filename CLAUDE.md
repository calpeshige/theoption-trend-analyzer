# TheOption Trend Analyzer — プロジェクト運用メモ

このファイルはセッション開始時に毎回読み込まれる。プロジェクト固有の運用ルールを明文化しておく場所。

## 開発版とリリース版の運用

このプロジェクトは Chrome 拡張機能本体（プロジェクトルート）と、別リポジトリの LP（`landing_page/`）で構成される。
拡張機能には「開発版」と「リリース版」があり、以下の方式で管理されている。

### 開発版とリリース版の違い

| | 開発版 | リリース版 |
|---|---|---|
| 場所 | プロジェクトルート直下のソース | `theoption_trend_release/`（自動生成される） |
| `manifest.json` の名前 | `Theoption Trading System (開発用)` | `Theoption Trading System`（`(開発用)` を除去） |
| 配布形式 | — | `Theoption_Trading_System_v{VERSION}.zip`（バージョン付き）＋ `theoption_trend_release.zip`（固定名） |

- **開発版＝ルートのソースそのもの。** Chrome に「パッケージ化されていない拡張機能」として読み込んで開発する。manifest 名に `(開発用)` が付いているので、リリース版と同時にインストールしても区別できる。
- **リリース版＝スクリプトで選別コピーした配布パッケージ。** 配布に必要なファイルだけを抜き出して `theoption_trend_release/` に固め、ZIP 化したもの。`docs/`、`json check/`、各種解析用 `.md` などの開発専用物は含まれない。
- 両者の実質的な差は「manifest の `(開発用)` マーカー」と「含めるファイルの選別」だけ。ロジック本体は同じソースを使う。

### リリースの作り方

ルートの [create_release.sh](create_release.sh) を実行するだけ。手作業でのコピーはしない。

```bash
./create_release.sh
```

スクリプトの処理（[create_release.sh](create_release.sh)）:
1. `manifest.json` の `"version"` からバージョン番号を自動抽出
2. 既存の `theoption_trend_release/` を削除して作り直し
3. `manifest.json` をコピーし、`sed` で `(開発用)` の文字列を除去
4. manifest に記載された実行用 JS 群（`license-manager.js`, `theoption-analyzer.js`, `signal-engine-20.js` など計16ファイル）を選別コピー
5. `scripts/ml-worker.js`、`background.js`、`sidepanel.*`、`popup.*`、`icons/`、`sound/` をコピー
6. ZIP を2種類生成（バージョン付き `Theoption_Trading_System_v{VERSION}.zip` ＋ 固定名 `theoption_trend_release.zip`）

→ **新ファイルを追加してリリースに含めたい場合は、`create_release.sh` のコピー対象にも追記が必要**（スクリプトは選別コピーなので、追記し忘れるとリリースに入らない）。

### バージョンの上げ方

- バージョンの正本は `manifest.json` の `"version"`。これを書き換えてから `create_release.sh` を実行すると、ZIP 名・リリース版 manifest に自動反映される。

### Git 管理と配布

- リリース成果物は [.gitignore](.gitignore) で除外されている: `*.zip` / `create_release.sh` / `theoption_trend_release/` / `Theoption_Trading_System_v*.zip`。リポジトリにはコミットされない。
- LP（`landing_page/`）は `.gitignore` で除外された**別リポジトリ**（`calpeshige/theoption-trading-lp`）。拡張機能本体とは別に push する。
- 配布は GitHub Releases 経由（`docs/コミュニティデータ共有_実装計画.md` 参照）。LP のダウンロードリンクは固定名 `theoption_trend_release.zip` を指す。
