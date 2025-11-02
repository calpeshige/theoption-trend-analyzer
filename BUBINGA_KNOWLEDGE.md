# Bubingaプロジェクトから得た技術的知見

> **このファイルの目的**: Bubinga開発で得られた全ての技術的知見を記録し、TheOption版開発で同じ問題を避ける

---

## 🏗️ アーキテクチャ設計

### ファイル構成

Bubingaでは以下の2ファイル構成を採用：

#### 1. technical-analysis-engine-v2.js
**役割**: テクニカル分析のコアロジック
**サイズ**: 約48KB
**主要な関数**:
- `calculateEMA(data, period)` - 指数移動平均
- `calculateRSI(data, period)` - 相対力指数
- `calculateADX(data, period)` - 平均方向性指数
- `calculateMACD(data)` - MACD指標
- `identifyTrend(adx, ema)` - トレンド判定
- `findSupportResistance(data)` - サポート/レジスタンス検出
- `predictNextMove(...)` - 次の動き予測

**特徴**:
- 純粋な計算ロジックのみ
- DOM操作なし
- ページ非依存（テスト可能）

#### 2. bubinga-analyzer-v4.9.js
**役割**: UI制御、API通信、イベント処理
**サイズ**: 約31KB
**主要な機能**:
- APIからのデータ取得
- 分析パネルのUI構築
- ユーザー操作の処理
- 設定の保存/読み込み

**この構成の利点**:
- コアロジックの再利用性が高い
- テストが容易
- デバッグしやすい

---

## 🔌 API通信の実装

### 最終的な実装: XMLHttpRequest

Bubingaでは当初 `fetch()` を使用していましたが、最終的に `XMLHttpRequest` に変更しました。

#### 理由
1. 一部のブラウザ拡張機能が `fetch()` をフックして改変する
2. ネットワークタブの表示と実際のリクエストが異なる場合がある
3. `XMLHttpRequest` はフックされにくい

#### 実装例
```javascript
const response = await new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();

  const apiUrl = `https://api.bubinga.com/api/v1/assets/${assetId}/candles` +
    `?from=${encodeURIComponent(fromISO)}` +
    `&to=${encodeURIComponent(toISO)}` +
    `&detalization=${encodeURIComponent(detalization)}`;

  xhr.open('GET', apiUrl, true);
  xhr.setRequestHeader('x-jwt', authToken);
  xhr.setRequestHeader('accept', 'application/json');

  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.responseText);
      resolve({ ok: true, status: xhr.status, json: async () => data });
    } else {
      resolve({ ok: false, status: xhr.status, statusText: xhr.statusText });
    }
  };

  xhr.onerror = function() {
    reject(new Error('Network error'));
  };

  xhr.send();
});
```

### 認証方法

Bubingaでは `x-jwt` ヘッダーで認証：

```javascript
// 認証トークンの取得
const authToken = localStorage.getItem('token');

// ヘッダーに設定
xhr.setRequestHeader('x-jwt', authToken);
```

### エラーハンドリング

```javascript
if (!response.ok) {
  throw new Error(`API Error: ${response.status} - ${response.statusText}`);
}

const data = await response.json();

if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
  throw new Error('APIからデータを取得できませんでした。');
}
```

---

## ⏰ 時刻同期問題とその解決

### 問題の発見

一部のユーザーで400エラーが発生：
```
{
  "errors": [{
    "code": "30fbb013-d015-4232-8b3b-8f3be97a7e14",
    "origin": "to",
    "template": "This value should be less than or equal to {{ compared_value }}."
  }]
}
```

### 原因

ユーザーのPC時刻がBubingaサーバーの時刻より進んでいる場合、`to` パラメータが「未来の時刻」として拒否される。

### 解決策

**5分の安全マージン**を設定：

```javascript
// 修正前
const now = new Date();
const from = new Date(now.getTime() - totalSeconds * 1000);
const toISO = now.toISOString(); // ❌ PC時刻がサーバーより進んでいると拒否

// 修正後
const now = new Date();
const safeNow = new Date(now.getTime() - 5 * 60 * 1000); // 5分前
const from = new Date(safeNow.getTime() - totalSeconds * 1000);
const toISO = safeNow.toISOString(); // ✅ 安全マージン確保
```

### なぜ5分？
- PC時刻のずれは通常数分程度
- 5分のマージンで大半のケースをカバー
- データの新鮮さには影響しない（5分前のデータでも十分）

### TheOption版への適用
同じ問題が発生する可能性が高いため、最初から安全マージンを実装すべき。

---

## 📊 確率計算の正規化

### 問題の発見

トレンド継続確率と反転リスクが独立して計算され、合計が100%を超えることがあった：
```
トレンド継続確率: 85%
反転リスク: 85%
合計: 170% ❌
```

### 原因

両方の値が独立して0-100%の範囲で計算されていた：
```javascript
// 問題のあったコード
const continuationProbability = Math.max(30, Math.min(90, continuationScore));
const reversalRisk = Math.max(20, Math.min(90, reversalScore)); // 独立計算
```

### 解決策

**正規化して合計を100%に**：

```javascript
// 一時的な値を計算
let tempContinuationScore = Math.max(30, Math.min(90, continuationScore));
let tempReversalScore = Math.max(10, Math.min(90, reversalScore));

// 合計が100%を超える場合は正規化
const totalScore = tempContinuationScore + tempReversalScore;
if (totalScore > 100) {
  const ratio = 100 / totalScore;
  prediction.continuationProbability = Math.round(tempContinuationScore * ratio);
  prediction.reversalRisk = Math.round(tempReversalScore * ratio);
} else {
  prediction.continuationProbability = tempContinuationScore;
  prediction.reversalRisk = tempReversalScore;
}
```

### TheOption版への適用
同じロジックをそのまま使用できる。

---

## 🖥️ Windows互換性問題

### 問題の発見

Windowsユーザーから報告：
「分析するローソク足本数を選ぶところが真っ白で、本数が見えなくなっています」

### 原因

Windowsでは `<select>` 要素のデフォルト背景が白色で、`color: white` を設定すると白文字が白背景に表示される。

### 解決策

**color-schemeプロパティを追加**：

```html
<select style="color: white; color-scheme: dark;">
  <option style="background: #2d2d2d; color: white;">15本 (最小)</option>
  <option style="background: #2d2d2d; color: white;">30本</option>
</select>
```

#### 重要なポイント
- `color-scheme: dark` でOSのダークモードを適用
- 各 `<option>` にも明示的に `background` と `color` を設定

### TheOption版への適用
最初からこのスタイルを適用すべき。

---

## 🐛 デバッグログのベストプラクティス

### 色付きコンソールログ

視認性を高めるため、背景色を使い分ける：

```javascript
// 情報
console.log('%c[INFO]', 'background: #2196F3; color: white; padding: 2px 6px;', 'メッセージ');

// 成功
console.log('%c[SUCCESS]', 'background: #4CAF50; color: white; padding: 2px 6px;', 'メッセージ');

// 警告
console.warn('%c[WARNING]', 'background: #FF9800; color: white; padding: 2px 6px;', 'メッセージ');

// エラー
console.error('%c[ERROR]', 'background: #F44336; color: white; padding: 2px 6px;', 'メッセージ');

// デバッグ
console.log('%c[DEBUG]', 'background: #9C27B0; color: white; padding: 2px 6px;', 'メッセージ');
```

### 構造化ログ

オブジェクトを使って関連情報をグループ化：

```javascript
console.log('%c[DEBUG] 時刻情報:', 'background: #00BCD4; color: white; padding: 2px 6px;', {
  'PC現在時刻': now.toISOString(),
  '安全時刻': safeNow.toISOString(),
  '差分': '5分前'
});
```

### API呼び出しのログ

リクエストとレスポンスを明確に区別：

```javascript
// リクエスト
console.log('%c[API Request]', 'background: #FF5722; color: white; padding: 2px 6px;', {
  url: apiUrl,
  method: 'GET',
  headers: { 'x-jwt': '...' }
});

// レスポンス成功
console.log('%c[API Response]', 'background: #4CAF50; color: white; padding: 2px 6px;', {
  status: 200,
  data: data
});

// レスポンス失敗
console.error('%c[API Error]', 'background: #F44336; color: white; padding: 2px 6px;', {
  status: xhr.status,
  statusText: xhr.statusText,
  responseText: xhr.responseText.substring(0, 200)
});
```

---

## 🎨 UI/UXの実装パターン

### パネルの配置

#### 固定位置（中央）
```javascript
panel.style.position = 'fixed';
panel.style.top = '50%';
panel.style.left = '50%';
panel.style.transform = 'translate(-50%, -50%)';
panel.style.zIndex = '999999';
```

#### ドラッグ可能にする
```javascript
let isDragging = false;
let currentX, currentY, initialX, initialY;

panel.addEventListener('mousedown', function(e) {
  if (e.target === panel || e.target.classList.contains('ba-header')) {
    isDragging = true;
    initialX = e.clientX - panel.offsetLeft;
    initialY = e.clientY - panel.offsetTop;
  }
});

document.addEventListener('mousemove', function(e) {
  if (isDragging) {
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    panel.style.left = currentX + 'px';
    panel.style.top = currentY + 'px';
    panel.style.transform = 'none'; // 中央配置を解除
  }
});

document.addEventListener('mouseup', function() {
  isDragging = false;
});
```

### レスポンシブデザイン

```css
/* 基本スタイル */
.ba-panel {
  width: 400px;
  max-width: 90vw; /* 画面幅の90%まで */
  max-height: 80vh; /* 画面高さの80%まで */
  overflow-y: auto;
}

/* スクロールバーのカスタマイズ */
.ba-panel::-webkit-scrollbar {
  width: 8px;
}

.ba-panel::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.1);
}

.ba-panel::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.3);
  border-radius: 4px;
}
```

---

## 📦 データ構造とバリデーション

### ローソク足データの検証

```javascript
function validateCandleData(data) {
  // データ存在チェック
  if (!data || !data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid data structure');
  }

  // 最小本数チェック
  if (data.data.length < CONFIG.minCandlesRequired) {
    console.warn(`データ不足: ${data.data.length}本 < ${CONFIG.minCandlesRequired}本`);
  }

  // 各キャンドルの検証
  for (let i = 0; i < data.data.length; i++) {
    const candle = data.data[i];
    if (!candle.from || !candle.open || !candle.high || !candle.low || !candle.close) {
      console.error('無効なキャンドルデータ:', candle);
      throw new Error(`Invalid candle data at index ${i}`);
    }
  }

  return true;
}
```

### Bubingaのデータ形式

```javascript
{
  "data": [
    {
      "from": 1729781400,        // Unix timestamp
      "to": 1729781460,
      "open": 1.08500,
      "high": 1.08550,
      "low": 1.08480,
      "close": 1.08520,
      "volume": null             // Bubingaではnull
    }
  ]
}
```

### TheOption版で注意すべき点
- タイムスタンプの形式（Unix vs ISO8601）
- プロパティ名（from/to vs time/timestamp）
- volumeの有無

---

## 🔧 設定管理

### chrome.storage.local の使用

```javascript
// 設定の保存
chrome.storage.local.set({
  'ba-panel-visible': true,
  'ba-candle-count': 60
}, function() {
  console.log('設定を保存しました');
});

// 設定の読み込み
chrome.storage.local.get(['ba-panel-visible', 'ba-candle-count'], function(result) {
  const isVisible = result['ba-panel-visible'] !== false; // デフォルトtrue
  const candleCount = result['ba-candle-count'] || 60;    // デフォルト60
});
```

### 設定のデフォルト値

```javascript
const CONFIG = {
  minCandlesRequired: 15,      // 最小ローソク足数
  defaultCandleCount: 60,      // デフォルト本数
  maxCandleCount: 200,         // 最大本数
  apiTimeout: 10000,           // APIタイムアウト（ミリ秒）
  safetyMarginMinutes: 5       // 時刻の安全マージン（分）
};
```

---

## 🧪 テクニカル分析アルゴリズム

### EMA（指数移動平均）

```javascript
function calculateEMA(data, period) {
  if (!data || data.length < period) return [];

  const ema = [];
  const multiplier = 2 / (period + 1);

  // 最初のSMAを計算
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  ema[period - 1] = sum / period;

  // EMAを計算
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i].close - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}
```

### RSI（相対力指数）

```javascript
function calculateRSI(data, period = 14) {
  if (!data || data.length < period + 1) return [];

  const rsi = [];
  let gains = 0;
  let losses = 0;

  // 最初のperiod分の平均を計算
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));

  // 残りを計算
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}
```

### ADX（平均方向性指数）

```javascript
function calculateADX(data, period = 14) {
  if (!data || data.length < period * 2) return [];

  const adx = [];
  const plusDM = [];
  const minusDM = [];
  const tr = [];

  // +DM, -DM, TRを計算
  for (let i = 1; i < data.length; i++) {
    const highDiff = data[i].high - data[i - 1].high;
    const lowDiff = data[i - 1].low - data[i].low;

    plusDM[i] = (highDiff > lowDiff && highDiff > 0) ? highDiff : 0;
    minusDM[i] = (lowDiff > highDiff && lowDiff > 0) ? lowDiff : 0;

    const hl = data[i].high - data[i].low;
    const hc = Math.abs(data[i].high - data[i - 1].close);
    const lc = Math.abs(data[i].low - data[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  // 平滑化されたDIを計算
  let smoothedPlusDM = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smoothedTR = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);

  const plusDI = [];
  const minusDI = [];
  const dx = [];

  for (let i = period; i < data.length; i++) {
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];
    smoothedTR = smoothedTR - smoothedTR / period + tr[i];

    plusDI[i] = (smoothedPlusDM / smoothedTR) * 100;
    minusDI[i] = (smoothedMinusDM / smoothedTR) * 100;

    const diSum = plusDI[i] + minusDI[i];
    const diDiff = Math.abs(plusDI[i] - minusDI[i]);
    dx[i] = diSum !== 0 ? (diDiff / diSum) * 100 : 0;
  }

  // ADXを計算（DXの平滑化）
  let adxSum = 0;
  for (let i = period; i < period * 2; i++) {
    adxSum += dx[i];
  }
  adx[period * 2 - 1] = adxSum / period;

  for (let i = period * 2; i < data.length; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }

  return adx;
}
```

---

## 🎯 エントリー提案ロジック

### バイナリーオプション用の提案

```javascript
// トレンド継続（上昇）
if (prediction.nextMove === 'continue_up' || prediction.nextMove === 'breakout_up') {
  prediction.entryDirection = 'HIGH';
  prediction.entryTiming = '今すぐエントリー可能';

  if (sr.support) {
    prediction.betterEntryPrice = sr.support + priceBuffer;
    prediction.betterEntryTiming = `サポート付近 (${prediction.betterEntryPrice.toFixed(5)}) まで待つ`;
  }
}

// トレンド継続（下降）
else if (prediction.nextMove === 'continue_down' || prediction.nextMove === 'breakout_down') {
  prediction.entryDirection = 'LOW';
  prediction.entryTiming = '今すぐエントリー可能';

  if (sr.resistance) {
    prediction.betterEntryPrice = sr.resistance - priceBuffer;
    prediction.betterEntryTiming = `レジスタンス付近 (${prediction.betterEntryPrice.toFixed(5)}) まで待つ`;
  }
}

// レンジ相場
else if (prediction.nextMove === 'range') {
  prediction.entryDirection = '様子見';
  prediction.entryTiming = 'レンジ相場のため明確なエントリーポイントなし';
}
```

### 重要なポイント
- FX用の「ストップロス」「ターゲット価格」「リスクリワード比」は不要
- バイナリーオプションでは「方向（HIGH/LOW）」と「タイミング」が重要
- 価格よりも「今すぐ」「待つべき」の判断が価値がある

---

## 🚨 よくあるエラーと対処法

### 1. "APIからデータを取得できませんでした"

**原因**:
- 認証トークンが無効
- ネットワークエラー
- API仕様変更

**デバッグ方法**:
```javascript
console.log('Auth token:', authToken);
console.log('API URL:', apiUrl);
console.log('Response status:', response.status);
console.log('Response data:', data);
```

### 2. "データ不足"警告

**原因**: 取得できたローソク足の本数が少ない

**対処**:
```javascript
if (data.data.length < CONFIG.minCandlesRequired) {
  console.warn(`データ不足: ${data.data.length}本 < ${CONFIG.minCandlesRequired}本`);
  // それでも可能な範囲で分析を試みる
}
```

### 3. パネルが表示されない

**原因**:
- DOMの読み込みタイミング
- z-indexが低い
- display:none になっている

**対処**:
```javascript
// DOMContentLoaded後に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnalyzer);
} else {
  initAnalyzer();
}

// z-indexを十分高く
panel.style.zIndex = '999999';
```

---

## 📝 コーディング規約

### 命名規則

```javascript
// 定数: UPPER_SNAKE_CASE
const API_BASE_URL = 'https://api.bubinga.com';
const MIN_CANDLES_REQUIRED = 15;

// 関数: camelCase
function fetchCandleData() { }
function calculateEMA() { }

// 変数: camelCase
let currentPrice = 1.08500;
let isAnalyzing = false;

// クラス: PascalCase (使用していない)

// DOM ID: kebab-case
const panel = document.getElementById('ba-panel');
const button = document.getElementById('ba-analyze-button');
```

### コメント規則

```javascript
// 🔧 修正コメント
// 🚧 未実装・TODO
// ⚠️ 注意事項
// 💡 ヒント・アイデア
// ❌ 問題のあったコード
// ✅ 修正後のコード

// セクション区切り
// ========================================
// セクション名
// ========================================
```

### エラー処理

```javascript
// 必ずtry-catchで囲む
try {
  const data = await fetchCandleData();
  const analysis = analyzeTrend(data);
  displayResults(analysis);
} catch (error) {
  console.error('[Bubinga Analyzer] エラー:', error);
  displayError(error.message);
}

// ユーザーにわかりやすいメッセージ
function displayError(message) {
  alert('分析エラー: ' + message + '\n\nページをリロードして再試行してください。');
}
```

---

## 🎓 学んだベストプラクティス

### 1. プログレッシブエンハンスメント
最小限の機能から始めて、段階的に機能を追加する。

### 2. フェイルセーフ
エラーが発生しても、可能な範囲で動作を継続する。

### 3. ユーザーフィードバック
処理中は必ずローディング表示を出す。

### 4. パフォーマンス
- 不要なDOM操作を避ける
- 大量のデータは一度に処理しない
- デバウンス・スロットリングを活用

### 5. 保守性
- コメントを充実させる
- 関数を小さく保つ
- マジックナンバーを避ける

---

## 🔗 参考リンク

### Bubingaプロジェクト
- [README.md](../bubinga_trend/README.md)
- [ANALYSIS_LOGIC.md](../bubinga_trend/ANALYSIS_LOGIC.md)
- [エラー修正履歴_API400.md](../bubinga_trend/エラー修正履歴_API400.md)

### 技術ドキュメント
- Chrome拡張機能: https://developer.chrome.com/docs/extensions/
- Manifest V3: https://developer.chrome.com/docs/extensions/mv3/intro/

---

**このドキュメントをTheOption版開発時に参照すれば、Bubingaで遭遇した問題を避けられます。**

---

**最終更新**: 2025-10-24
**作成者**: Claude Code
