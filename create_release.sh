#!/bin/bash

# 配布用パッケージ作成スクリプト
# manifest.json から自動的にバージョンを取得
RELEASE_DIR="theoption_trend_release"
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
ZIP_NAME="Theoption_Trading_System_v${VERSION}.zip"
# サイトのダウンロードリンクと一致する固定名のZIPも作る
GENERIC_ZIP_NAME="theoption_trend_release.zip"

echo "📋 バージョン: v${VERSION}"

echo "📦 配布用パッケージ作成開始..."

# 既存のリリースフォルダがあれば削除
if [ -d "$RELEASE_DIR" ]; then
  echo "🧹 既存のリリースフォルダを削除..."
  rm -rf "$RELEASE_DIR"
fi

# リリースフォルダ作成
echo "📁 リリースフォルダを作成..."
mkdir -p "$RELEASE_DIR"

# manifest.json（開発用の名前を配布用に自動置換）
echo "✅ manifest.json をコピー"
cp manifest.json "$RELEASE_DIR/"
sed -i '' 's/ (開発用)//g' "$RELEASE_DIR/manifest.json"
echo "   → 名前から「(開発用)」を除去しました"

# JSファイル（manifest.jsonに記載されているもの）
echo "✅ 実行用JSファイルをコピー"
cp license-manager.js "$RELEASE_DIR/"
cp mobile-relay.js "$RELEASE_DIR/"
cp trend-analyzer-engine.js "$RELEASE_DIR/"
cp multi-indicator-system.js "$RELEASE_DIR/"
cp price-pattern-analyzer.js "$RELEASE_DIR/"
cp technical-timeseries-analyzer.js "$RELEASE_DIR/"
cp detailed-segment-analyzer.js "$RELEASE_DIR/"
cp segment-similarity-calculator.js "$RELEASE_DIR/"
cp machine-learning-system.js "$RELEASE_DIR/"
cp db-manager.js "$RELEASE_DIR/"
cp pattern-matching-system.js "$RELEASE_DIR/"
cp pattern-stratification-system.js "$RELEASE_DIR/"
cp signal-enhancer-system.js "$RELEASE_DIR/"
cp enhanced-technical-analysis.js "$RELEASE_DIR/"
cp advanced-signal-engine.js "$RELEASE_DIR/"
cp signal-engine-20.js "$RELEASE_DIR/"
cp theoption-analyzer.js "$RELEASE_DIR/"

# scriptsフォルダ（Web Worker）
echo "✅ scriptsフォルダをコピー"
mkdir -p "$RELEASE_DIR/scripts"
cp scripts/ml-worker.js "$RELEASE_DIR/scripts/"

# background service worker
echo "✅ background.js をコピー"
cp background.js "$RELEASE_DIR/"

# sidepanel関連
echo "✅ sidepanel関連ファイルをコピー"
cp sidepanel.html "$RELEASE_DIR/"
cp sidepanel.css "$RELEASE_DIR/"
cp sidepanel.js "$RELEASE_DIR/"
cp qrcode.js "$RELEASE_DIR/"

# popup関連
echo "✅ popup関連ファイルをコピー"
cp popup.html "$RELEASE_DIR/"
cp popup.css "$RELEASE_DIR/"
cp popup.js "$RELEASE_DIR/"

# iconsフォルダ
echo "✅ iconsフォルダをコピー"
cp -r icons "$RELEASE_DIR/"

# soundフォルダ
echo "✅ soundフォルダをコピー"
cp -r sound "$RELEASE_DIR/"

# ZIPファイル作成 (バージョン付き名前と固定名の両方を作成)
echo "🗜️  ZIPファイルを作成中..."
# 既存のZIPを削除
[ -f "$ZIP_NAME" ] && rm "$ZIP_NAME"
[ -f "$GENERIC_ZIP_NAME" ] && rm "$GENERIC_ZIP_NAME"

cd "$RELEASE_DIR"
zip -r "../$ZIP_NAME" . > /dev/null 2>&1
cd ..
# サイトのダウンロードリンクと一致する固定名でもコピー
cp "$ZIP_NAME" "$GENERIC_ZIP_NAME"

# 完了メッセージ
echo ""
echo "✅ 配布用パッケージ作成完了！"
echo ""
echo "📦 作成されたファイル:"
echo "   フォルダ: $RELEASE_DIR/"
echo "   ZIP1 (バージョン付き): $ZIP_NAME"
echo "   ZIP2 (固定名): $GENERIC_ZIP_NAME"
echo ""
echo "📊 含まれるファイル:"
ls -1 "$RELEASE_DIR/" | sed 's/^/   - /'
echo ""
echo "📏 ZIPファイルサイズ:"
ls -lh "$ZIP_NAME" | awk '{print "   " $5}'

