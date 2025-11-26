# JSONインポート/エクスポート機能 実装完了

## 実装日時
2025-11-02

## 概要

学習データの完全バックアップと復元機能を実装しました。これにより、データの破損やブラウザのクリア時にも、保存したJSONファイルから完全にデータを復元できるようになりました。

## 背景

### 問題点

**既存のCSVダウンロードの課題**:
- セグメント詳細データ（segments配列）が含まれていない
- テクニカル指標の時系列データが欠落
- 価格パターン詳細が保存されない
- → CSV形式では完全なデータ復元が不可能

### 必要性

1. **データの完全性**
   - 全ての情報を保持した形でバックアップ
   - セグメント分析の詳細データも含めて保存

2. **災害対策**
   - ブラウザキャッシュのクリア
   - 拡張機能の再インストール
   - PC の故障

3. **データ移行**
   - 別のPCへの移行
   - ブラウザの移行
   - テスト環境へのデータ投入

## 実装内容

### 1. UI追加

#### ダウンロードモーダルに「データ管理」タブを追加

[theoption-analyzer.js:565-570](theoption-analyzer.js#L565-L570)

```html
<div class="download-tabs">
  <button class="download-tab active" data-tab="ml-data">AI学習データ</button>
  <button class="download-tab" data-tab="price-history">価格履歴</button>
  <button class="download-tab" data-tab="predictions">予測パターン</button>
  <button class="download-tab" data-tab="trends">トレンド分析</button>
  <button class="download-tab" data-tab="data-management">データ管理</button> ← 新規追加
</div>
```

#### データ管理パネルの追加

[theoption-analyzer.js:621-658](theoption-analyzer.js#L621-L658)

```html
<div class="download-panel" id="panel-data-management">
  <h4>💾 データ管理</h4>

  <!-- JSONエクスポート -->
  <div>
    <h5>📥 完全バックアップ (JSON)</h5>
    <p>
      ・セグメント詳細データを含む完全バックアップ<br>
      ・CSV形式より詳細な情報を保持<br>
      ・データ復元に使用可能
    </p>
    <button data-type="json-export">JSONエクスポート</button>
  </div>

  <!-- JSONインポート -->
  <div>
    <h5>📤 データ復元 (JSON)</h5>
    <p>
      バックアップしたJSONファイルからデータを復元<br>
      ⚠️ 既存データは上書きされます
    </p>
    <input type="file" id="json-import-file" accept=".json" style="display: none;">
    <button data-type="json-import">JSONインポート</button>
  </div>

  <!-- 警告 -->
  <div class="warning">
    ⚠️ 注意: JSONインポートは既存データを上書きします。
  </div>
</div>
```

### 2. JSONエクスポート機能

[theoption-analyzer.js:3994-4048](theoption-analyzer.js#L3994-L4048)

```javascript
function exportDataAsJSON() {
  console.log('[JSON Export] エクスポート開始...');

  chrome.storage.local.get(null, (allData) => {
    // theoption_ml_で始まるキーのみ抽出
    const mlData = {};
    let totalRecords = 0;
    let currencyPairs = 0;

    Object.keys(allData).forEach(key => {
      if (key.startsWith('theoption_ml_')) {
        mlData[key] = allData[key];
        if (Array.isArray(allData[key])) {
          totalRecords += allData[key].length;
          currencyPairs++;
        }
      }
    });

    if (totalRecords === 0) {
      alert('エクスポート可能な学習データがありません');
      return;
    }

    console.log(`[JSON Export] ${currencyPairs}通貨ペア, ${totalRecords}件のデータをエクスポート`);

    // JSON形式で生成
    const json = JSON.stringify(mlData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // ダウンロード
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `theoption_backup_${timestamp}.json`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.log(`[JSON Export] ✅ エクスポート完了: ${filename}`);

    // 通知
    showDownloadNotification(`完全バックアップ (${currencyPairs}通貨ペア, ${totalRecords}件)`);
  });
}
```

**機能**:
- Chrome Storageから全ての学習データを取得
- `theoption_ml_`で始まるキーのみフィルタリング
- JSON形式で整形（インデント付き）
- タイムスタンプ付きファイル名で保存

**出力ファイル名**:
```
theoption_backup_2025-11-02T15-30-45.json
```

### 3. JSONインポート機能

[theoption-analyzer.js:4050-4122](theoption-analyzer.js#L4050-L4122)

```javascript
function importDataFromJSON() {
  console.log('[JSON Import] インポート開始...');

  const fileInput = document.getElementById('json-import-file');
  fileInput.click();

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      console.log('[JSON Import] ファイルが選択されませんでした');
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // データ検証
        const validation = validateImportData(data);
        if (!validation.valid) {
          alert(`❌ データ検証エラー\n\n${validation.error}`);
          console.error('[JSON Import] 検証エラー:', validation.error);
          return;
        }

        // 確認ダイアログ
        const confirmed = confirm(
          `${validation.currencyPairs}通貨ペア, ${validation.totalRecords}件のデータをインポートします。\n\n` +
          `⚠️ 既存のデータは上書きされます。\n\n続行しますか？`
        );

        if (!confirmed) {
          console.log('[JSON Import] キャンセルされました');
          return;
        }

        // Chrome Storageに復元
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            console.error('[JSON Import] エラー:', chrome.runtime.lastError);
            alert('❌ インポートに失敗しました\n\n' + chrome.runtime.lastError.message);
          } else {
            console.log(`[JSON Import] ✅ インポート完了: ${validation.totalRecords}件`);

            // 通知
            alert(
              `✅ データをインポートしました\n\n` +
              `通貨ペア: ${validation.currencyPairs}\n` +
              `データ件数: ${validation.totalRecords}件\n\n` +
              `ページをリロードします。`
            );

            // ページリロード
            setTimeout(() => {
              location.reload();
            }, 1000);
          }
        });

      } catch (error) {
        console.error('[JSON Import] ファイル読み込みエラー:', error);
        alert('❌ ファイルの読み込みに失敗しました\n\nJSON形式が正しいか確認してください。');
      }
    };

    reader.readAsText(file);
  };
}
```

**処理フロー**:
1. ファイル選択ダイアログを表示
2. JSONファイルを読み込み
3. データ検証（validateImportData）
4. 確認ダイアログ表示
5. Chrome Storageに保存
6. ページリロード

### 4. データ検証機能

[theoption-analyzer.js:4124-4164](theoption-analyzer.js#L4124-L4164)

```javascript
function validateImportData(data) {
  // 基本構造チェック
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'データ形式が不正です' };
  }

  let currencyPairs = 0;
  let totalRecords = 0;

  for (let key in data) {
    // キー名チェック
    if (!key.startsWith('theoption_ml_')) {
      return { valid: false, error: `無効なキー: ${key}` };
    }

    // 配列チェック
    if (!Array.isArray(data[key])) {
      return { valid: false, error: `${key}のデータ形式が配列ではありません` };
    }

    currencyPairs++;

    // 各データの構造チェック
    for (let item of data[key]) {
      if (!item.timestamp || !item.price) {
        return { valid: false, error: `${key}に必須フィールド(timestamp/price)がありません` };
      }
      totalRecords++;
    }
  }

  if (totalRecords === 0) {
    return { valid: false, error: 'データが空です' };
  }

  return {
    valid: true,
    currencyPairs: currencyPairs,
    totalRecords: totalRecords
  };
}
```

**検証項目**:
1. ✅ データ型チェック（object）
2. ✅ キー名チェック（`theoption_ml_`で始まる）
3. ✅ データ型チェック（array）
4. ✅ 必須フィールドチェック（timestamp, price）
5. ✅ データ件数チェック（0件でないこと）

**返却値**:
```javascript
{
  valid: true,
  currencyPairs: 3,      // 通貨ペア数
  totalRecords: 1234     // データ件数
}
```

### 5. イベントハンドラーの追加

[theoption-analyzer.js:3515-3520](theoption-analyzer.js#L3515-L3520)

```javascript
function executeDownload(dataType) {
  console.log(`[CSV Download] ダウンロード開始: ${dataType}`);

  switch (dataType) {
    case 'ml-data':
      downloadMLDataAsCSV();
      break;
    case 'price-history':
      downloadPriceHistoryAsCSV();
      break;
    case 'predictions':
      downloadPredictionsAsCSV();
      break;
    case 'trends':
      downloadTrendsAsCSV();
      break;
    case 'json-export':     // ← 追加
      exportDataAsJSON();
      break;
    case 'json-import':     // ← 追加
      importDataFromJSON();
      break;
    default:
      alert('不明なデータタイプです');
  }
}
```

## 使用方法

### バックアップ（エクスポート）

1. **TheOptionの取引画面で拡張機能パネルを開く**
2. **「データダウンロード」ボタンをクリック**
3. **「データ管理」タブを選択**
4. **「JSONエクスポート」ボタンをクリック**
5. **`theoption_backup_XXXX.json`がダウンロードされる**

### 復元（インポート）

1. **TheOptionの取引画面で拡張機能パネルを開く**
2. **「データダウンロード」ボタンをクリック**
3. **「データ管理」タブを選択**
4. **「JSONインポート」ボタンをクリック**
5. **ファイル選択ダイアログでバックアップJSONを選択**
6. **確認ダイアログで「OK」をクリック**
7. **自動的にページがリロードされ、データが復元される**

## データ形式

### JSONエクスポート形式

```json
{
  "theoption_ml_EURUSD_OTC": [
    {
      "timestamp": 1730552400000,
      "price": 1.08532,
      "rsi": 45.2,
      "ma5": 1.08530,
      "ma20": 1.08525,
      // ... 他の指標
      "priceSegments15s": {
        "segments": [
          {
            "direction": "UP",
            "magnitude": 0.0052,
            "volatility": 0.00012,
            "slope": 0.0041,
            "startPrice": 1.08520,
            "endPrice": 1.08525,
            // ... セグメント詳細
          },
          // ... 残り5個のセグメント
        ],
        "pattern": "U-D-F-U-D-U",
        "shapeHash": "UDUDFU",
        "segmentCount": 6,
        "threshold": 0.0042
      },
      // ... 他の時間枠のセグメント
      "result15s": {
        "price": 1.08545,
        "change": 0.00013,
        "changePercent": 0.012,
        "direction": "UP",
        "pending": false
      }
      // ... 他の時間枠の結果
    },
    // ... 他のデータ
  ],
  "theoption_ml_BTCUSD_OTC": [
    // ... BTC/USDのデータ
  ]
}
```

**ポイント**:
- ✅ `segments`配列が完全に保存される
- ✅ 各セグメントの詳細データも保持
- ✅ 動的閾値（threshold）も記録
- ✅ 結果データ（result15s等）も保存

### CSV形式との比較

| 項目 | CSV | JSON |
|------|-----|------|
| セグメント詳細 | ❌ なし | ✅ あり |
| segments配列 | ❌ なし | ✅ あり |
| 動的閾値 | ❌ なし | ✅ あり |
| 時系列データ | ❌ なし | ✅ あり |
| データ復元 | ❌ 不可 | ✅ 可能 |
| ファイルサイズ | 小 | 大 |
| 人間が見やすい | ✅ Excel | ❌ テキスト |

## 効果

### ✅ データの完全性

**JSONエクスポート**:
- 全てのデータが保存される
- セグメント分析の詳細も完全に保持
- CSV形式では失われる情報も保存

### ✅ データの可搬性

**簡単な移行**:
1. JSONエクスポート
2. 別のPC/ブラウザでインポート
3. 完全に復元完了

### ✅ 災害対策

**万が一の備え**:
- ブラウザキャッシュのクリア → JSON復元
- 拡張機能の再インストール → JSON復元
- PCの故障 → 別PCでJSON復元

### ✅ 開発・テスト

**効率的な開発**:
- テストデータの共有
- 検証環境への投入
- バージョン間のデータ移行

## 注意事項

### ⚠️ インポート時の上書き

**重要**: JSONインポートは既存データを**完全に上書き**します

**推奨手順**:
1. 既存データをエクスポート（バックアップ）
2. 新しいデータをインポート
3. 問題があれば元のデータを再インポート

### ⚠️ ファイルサイズ

**大容量ファイル**:
- 10,000件のデータで約50-100MB
- ダウンロード・アップロードに時間がかかる
- ストレージ容量に注意

### ⚠️ ブラウザの制限

**Chrome Storage制限**:
- QUOTA_BYTES: 通常無制限（manifest.jsonでunlimitedStorage設定済み）
- ただし、極端に大きいデータは注意

## 検証方法

### 1. エクスポートの確認

```javascript
// ブラウザコンソールで実行
// JSONファイルをダウンロード後、開いて確認

// 確認ポイント:
// ✅ theoption_ml_で始まるキーが存在
// ✅ 各キーの値が配列
// ✅ priceSegments15s.segments が存在
// ✅ segments配列が6個のオブジェクトを含む
```

### 2. インポートの確認

```javascript
// インポート後、コンソールで確認
chrome.storage.local.get(null, (data) => {
  const keys = Object.keys(data).filter(k => k.startsWith('theoption_ml_'));
  console.log('通貨ペア数:', keys.length);

  keys.forEach(key => {
    console.log(key, 'データ件数:', data[key].length);
  });
});
```

### 3. データ整合性の確認

```javascript
// segments配列の確認
chrome.storage.local.get(null, (data) => {
  const firstData = data['theoption_ml_EURUSD_OTC'][0];
  console.log('segments15s:', firstData.priceSegments15s.segments);
  console.log('セグメント数:', firstData.priceSegments15s.segments.length); // 6個であることを確認
});
```

## トラブルシューティング

### エラー: "データ検証エラー"

**原因**: JSONファイルの形式が不正

**対処**:
1. JSONファイルをテキストエディタで開く
2. 構造が正しいか確認
3. 必要に応じて再エクスポート

### エラー: "インポートに失敗しました"

**原因**: Chrome Storage容量超過

**対処**:
1. 既存データを削除してから再試行
2. データを分割してインポート

### データが反映されない

**原因**: ページリロードが完了していない

**対処**:
1. 手動でページをリロード（F5）
2. コンソールでデータ確認

## 今後の展開

### フェーズ1: 追加機能

- ✅ 部分インポート機能（特定通貨ペアのみ）
- ✅ データマージ機能（既存+新規）
- ✅ データ圧縮（gzip）

### フェーズ2: UI改善

- ✅ プログレスバー表示
- ✅ ドラッグ&ドロップ対応
- ✅ データプレビュー機能

## まとめ

### 実装完了機能

✅ **JSONエクスポート**
- 完全なデータバックアップ
- セグメント詳細を含む
- タイムスタンプ付きファイル名

✅ **JSONインポート**
- ファイル選択ダイアログ
- データ検証機能
- 確認ダイアログ
- 自動ページリロード

✅ **データ検証**
- 構造チェック
- 必須フィールドチェック
- エラーメッセージ表示

✅ **UI統合**
- データ管理タブ追加
- 既存UIと統一されたデザイン
- わかりやすいガイダンス

### 次のステップ

1. **拡張機能をリロード**
   - `chrome://extensions/` → リロード

2. **動作確認**
   - データダウンロード → データ管理タブ
   - JSONエクスポートボタンをクリック
   - ダウンロードされたJSONを確認

3. **必要に応じて既存データをバックアップ**
   - 重要なデータがある場合は即座にエクスポート

---

**実装完了日**: 2025-11-02
**テスト状況**: 検証待ち
**次回アクション**: 拡張機能リロード → エクスポート/インポートテスト
