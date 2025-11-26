# FLAT過大評価対策 - 実装完了

## 📅 実装日時
2025-11-02

## 🎯 実装内容

### **問題の定義**
低ボラティリティ相場で全セグメントがFLATの場合、類似度が高く評価されるが、実際には予測価値がない（50-50のギャンブル）という問題。

### **解決方針**
- **個別セグメント判定の変更なし**: FLAT⇄FLATの個別判定は維持
- **全体フィルターの追加**: 6セグメント全体のアクティビティで評価
- **文脈依存の評価**: 混在パターン（UP/DOWNあり）ではFLAT一致も有効、全FLATパターンでは除外

---

## 🔧 実装詳細

### **1. EnhancedSegmentScoring - アクティビティ判定追加**

**ファイル**: `segment-similarity-calculator.js`

#### **A. 閾値設定 (468-502行目)**

```javascript
constructor() {
  // ... 既存の設定 ...

  // アクティブセグメント判定の閾値
  this.activityThresholds = {
    minMagnitude: 0.05,        // 最小変化量: 0.05%
    minActiveSegments: 3,      // 最低限必要なアクティブセグメント数 (50%)
    minActiveRatio: 0.5        // 最低限必要なアクティブ比率 (50%)
  };
}
```

#### **B. アクティブセグメント判定メソッド (591-599行目)**

```javascript
/**
 * セグメントがアクティブ（動きがある）か判定
 */
isActiveSegment(segment) {
  // UP または DOWN の場合はアクティブ
  if (segment.direction === 'UP' || segment.direction === 'DOWN') {
    return true;
  }

  // FLAT でも変化量が閾値を超えていればアクティブとみなす
  return segment.magnitude >= this.activityThresholds.minMagnitude;
}
```

**判定ロジック**:
- `direction === 'UP'` または `'DOWN'` → アクティブ
- `direction === 'FLAT'` かつ `magnitude >= 0.05%` → アクティブ
- それ以外 → 非アクティブ

#### **C. calculateTotalScore - 全体フィルター実装 (604-658行目)**

```javascript
calculateTotalScore(currentSegments, historicalSegments) {
  const maxScore = 75.6;

  // === アクティブセグメント数をカウント ===
  const currentActiveCount = currentSegments.filter(s => this.isActiveSegment(s)).length;
  const historicalActiveCount = historicalSegments.filter(s => this.isActiveSegment(s)).length;

  // 両方のパターンでアクティブセグメント数の少ない方を採用
  const minActiveCount = Math.min(currentActiveCount, historicalActiveCount);
  const activeRatio = minActiveCount / 6;

  // === 低ボラティリティ判定 ===
  if (minActiveCount < this.activityThresholds.minActiveSegments) {
    console.log(`[EnhancedScoring] ⚠️ 低ボラティリティパターン検出: アクティブセグメント ${minActiveCount}/6 (${(activeRatio*100).toFixed(0)}%)`);
    return {
      percentage: 0,
      totalScore: 0,
      maxScore: maxScore,
      segmentScores: [],
      lowVolatility: true,
      activeSegments: minActiveCount,
      activeRatio: activeRatio,
      reason: `全セグメントが低ボラティリティ (アクティブ: ${minActiveCount}/6, 閾値: ${this.activityThresholds.minActiveSegments}/6)`
    };
  }

  // === 通常のスコア計算 ===
  // ... 既存のスコア計算ロジック ...

  console.log(`[EnhancedScoring] ✅ アクティブセグメント ${minActiveCount}/6 (${(activeRatio*100).toFixed(0)}%) - スコア計算実行`);

  return {
    percentage: Math.min(100, percentage),
    totalScore: totalScore,
    maxScore: maxScore,
    segmentScores: segmentScores,
    lowVolatility: false,
    activeSegments: minActiveCount,
    activeRatio: activeRatio
  };
}
```

**フィルタリングロジック**:
1. 現在と過去のアクティブセグメント数をカウント
2. 少ない方を採用（厳格な判定）
3. アクティブ数 < 3 (50%未満) → `lowVolatility: true`, `percentage: 0`
4. アクティブ数 >= 3 → 通常のスコア計算

---

### **2. SegmentSimilarityCalculator - 低ボラティリティ除外**

**ファイル**: `segment-similarity-calculator.js`

#### **comparePriceSegments - 低ボラティリティ処理 (86-108行目)**

```javascript
// 3. 総合スコア計算（アクティビティフィルター付き）
const result = enhancedScoring.calculateTotalScore(currentSegments, historicalSegments);

// === 低ボラティリティパターンの除外 ===
if (result.lowVolatility) {
  console.log(`[SegmentSimilarity] ⚠️ 低ボラティリティのため類似度0を返却: ${result.reason}`);
  return {
    similarity: 0,
    enhancedScore: 0,
    patternScore: 0,
    patternHashMatch: false,
    segmentScores: [],
    matches: [],
    patternType: 'LOW_VOLATILITY',
    lowVolatility: true,
    activeSegments: result.activeSegments,
    activeRatio: result.activeRatio,
    reason: result.reason,
    details: {
      recency: 0,
      continuity: 0,
      coverage: 0,
      matchLevels: []
    }
  };
}

// 4. パターン評価を乗算して最終スコア
const finalScore = (result.percentage / 100) * (patternEval.score / 100);

return {
  similarity: finalScore,
  enhancedScore: result.percentage,
  patternScore: patternEval.score,
  // ... 既存の返却値 ...
  lowVolatility: false,
  activeSegments: result.activeSegments,
  activeRatio: result.activeRatio,
  // ...
};
```

**動作**:
- `lowVolatility: true` の場合、即座に類似度0を返す
- それ以外は通常の計算を継続
- アクティブセグメント情報を常に返却

---

### **3. PatternMatchingSystem - 予測閾値引き上げ**

**ファイル**: `machine-learning-system.js`

#### **predict - 閾値変更 (689-702行目)**

```javascript
// 予測（改善版: 70%に厳格化 - 低ボラティリティ対策）
let prediction, confidence;
const CONFIDENCE_THRESHOLD = 70;  // 60% → 70%に引き上げ

if (upRate >= CONFIDENCE_THRESHOLD) {
  prediction = 'HIGH';
  confidence = Math.round(upRate);
} else if (downRate >= CONFIDENCE_THRESHOLD) {
  prediction = 'LOW';
  confidence = Math.round(downRate);
} else {
  prediction = 'NEUTRAL';
  confidence = null; // 見送りの場合はパーセンテージなし
}
```

**変更点**:
- 60% → **70%** に引き上げ
- より厳格な予測判定

---

### **4. デバッグログ - 低ボラティリティ理由表示**

**ファイル**: `machine-learning-system.js`

#### **詳細スコア分析 - 低ボラティリティ表示 (555-570行目)**

```javascript
// 価格セグメントスコア表示（新システム専用）
if (sample.breakdown.priceSegments) {
  const ps = sample.breakdown.priceSegments;

  // 低ボラティリティ判定の表示
  if (ps.lowVolatility) {
    console.log(`[ML] 🔬     価格セグメント: 0/40点 | ⚠️ 低ボラティリティ除外`);
    console.log(`[ML] 🔬       └─ 理由: ${ps.reason || 'アクティブセグメント不足'}`);
  } else {
    console.log(`[ML] 🔬     価格セグメント: ${sample.priceSegmentScore}/40点 | 強化=${ps.enhancedScore.toFixed(1)}% パターン=${ps.patternScore.toFixed(1)}%`);
    console.log(`[ML] 🔬       ├─ アクティブセグメント: ${ps.activeSegments || 'N/A'}/6 (${ps.activeRatio ? (ps.activeRatio*100).toFixed(0) : 'N/A'}%)`);
    console.log(`[ML] 🔬       ├─ 一致パターン: ${ps.patternType} (セグメント[${ps.matches.join(',')}])`);
    console.log(`[ML] 🔬       ├─ 評価軸: 直近性=${ps.details.recency.toFixed(0)}% 連続性=${ps.details.continuity.toFixed(0)}% カバー率=${ps.details.coverage.toFixed(0)}%`);
    console.log(`[ML] 🔬       └─ 一致レベル: ${ps.details.matchLevels.join(' → ')}`);
  }
}
```

**表示内容**:
- 低ボラティリティの場合: 除外理由を表示
- 通常の場合: アクティブセグメント情報も含めて表示

---

## 📊 動作例

### **ケース1: 全FLATパターン (低ボラティリティ)**

**入力**:
```javascript
現在: [FLAT][FLAT][FLAT][FLAT][FLAT][FLAT]
過去: [FLAT][FLAT][FLAT][FLAT][FLAT][FLAT]

全セグメント magnitude < 0.05%
```

**処理**:
```
[EnhancedScoring] ⚠️ 低ボラティリティパターン検出: アクティブセグメント 0/6 (0%)
[SegmentSimilarity] ⚠️ 低ボラティリティのため類似度0を返却: 全セグメントが低ボラティリティ (アクティブ: 0/6, 閾値: 3/6)
```

**出力**:
```javascript
{
  similarity: 0,
  enhancedScore: 0,
  patternScore: 0,
  patternType: 'LOW_VOLATILITY',
  lowVolatility: true,
  activeSegments: 0,
  activeRatio: 0,
  reason: '全セグメントが低ボラティリティ (アクティブ: 0/6, 閾値: 3/6)'
}
```

**結果**: 類似度0 → 予測不可（INSUFFICIENT_DATA）

---

### **ケース2: 混在パターン (50%以上アクティブ)**

**入力**:
```javascript
現在: [UP][FLAT][UP][DOWN][UP][FLAT]
過去: [UP][FLAT][UP][DOWN][UP][FLAT]

アクティブセグメント: [0][2][3][4] = 4/6 (67%)
```

**処理**:
```
[EnhancedScoring] ✅ アクティブセグメント 4/6 (67%) - スコア計算実行
```

**出力**:
```javascript
{
  similarity: 0.83,  // 83%
  enhancedScore: 92.5,
  patternScore: 90.0,
  patternType: 'RECENT_TRIPLE',
  lowVolatility: false,
  activeSegments: 4,
  activeRatio: 0.67
}
```

**結果**: 類似度83% → 予測可能（HIGH/LOW）

---

### **ケース3: 境界ケース (50%ちょうど)**

**入力**:
```javascript
現在: [UP][FLAT][FLAT][DOWN][FLAT][UP]
過去: [UP][FLAT][FLAT][DOWN][FLAT][UP]

アクティブセグメント: [0][3][5] = 3/6 (50%)
```

**処理**:
```
[EnhancedScoring] ✅ アクティブセグメント 3/6 (50%) - スコア計算実行
```

**出力**:
```javascript
{
  similarity: 0.62,  // 62%
  enhancedScore: 75.0,
  patternScore: 83.0,
  lowVolatility: false,
  activeSegments: 3,
  activeRatio: 0.5
}
```

**結果**: 類似度62% → 閾値次第で予測可能

---

## 🎯 期待される効果

### **修正前の問題**
```
全FLAT パターン:
  → EnhancedScore: 87.5%
  → PatternScore: 100%
  → 最終類似度: 87.5%
  → 類似パターン: 150件
  → UP率: 52%, DOWN率: 48%
  → 予測: NEUTRAL (60%閾値で微妙)
  → 問題: 50-50のギャンブル予測
```

### **修正後の動作**
```
全FLAT パターン:
  → アクティブセグメント: 0/6
  → lowVolatility: true
  → 類似度: 0%
  → 類似パターン: 0件
  → 予測: INSUFFICIENT_DATA
  → UI表示: "動きの少ない相場 - 予測見送り"
  → 効果: 無意味な予測を排除 ✅
```

---

## ✅ テスト方法

### **ブラウザコンソールで確認**

#### **1. アクティブセグメント判定のテスト**
```javascript
// EnhancedSegmentScoringのインスタンス作成
const scorer = new window.EnhancedSegmentScoring();

// テストセグメント
const flatSeg = { direction: 'FLAT', magnitude: 0.02 };
const activeFlatSeg = { direction: 'FLAT', magnitude: 0.08 };
const upSeg = { direction: 'UP', magnitude: 0.15 };

console.log('FLAT (0.02%):', scorer.isActiveSegment(flatSeg));  // false
console.log('FLAT (0.08%):', scorer.isActiveSegment(activeFlatSeg));  // true
console.log('UP:', scorer.isActiveSegment(upSeg));  // true
```

#### **2. 学習データのアクティビティ確認**
```javascript
(async function checkActivity() {
  const result = await chrome.storage.local.get(['theoption_ml_BTC_JPY']);
  const data = result.theoption_ml_BTC_JPY || [];

  if (data.length > 0 && data[data.length - 1].priceSegments15s) {
    const latest = data[data.length - 1].priceSegments15s;
    const scorer = new window.EnhancedSegmentScoring();

    console.log('最新データのアクティビティ:');
    latest.segments.forEach((seg, i) => {
      const isActive = scorer.isActiveSegment(seg);
      console.log(`  Seg[${i}]: ${seg.direction} (${seg.magnitude.toFixed(3)}%) → ${isActive ? '✅ Active' : '❌ Inactive'}`);
    });

    const activeCount = latest.segments.filter(s => scorer.isActiveSegment(s)).length;
    console.log(`\n総計: ${activeCount}/6アクティブ (${(activeCount/6*100).toFixed(0)}%)`);
  }
})();
```

#### **3. 予測実行時のログ確認**
コンソールで以下のログを確認：
```
[EnhancedScoring] ⚠️ 低ボラティリティパターン検出: アクティブセグメント 2/6 (33%)
[SegmentSimilarity] ⚠️ 低ボラティリティのため類似度0を返却: 全セグメントが低ボラティリティ (アクティブ: 2/6, 閾値: 3/6)
[ML] 🔍 フィルタリング結果: チェック=214件, 閾値通過=0件, minSimilarity=70%
```

---

## 📝 まとめ

### **実装内容**
✅ アクティブセグメント判定メソッド追加
✅ calculateTotalScoreに全体フィルター実装
✅ 予測閾値を60% → 70%に引き上げ
✅ 低ボラティリティ理由の詳細ログ追加

### **変更ファイル**
- `segment-similarity-calculator.js` (EnhancedSegmentScoring, SegmentSimilarityCalculator)
- `machine-learning-system.js` (PatternMatchingSystem)

### **設計方針の遵守**
- ✅ FLAT⇄FLATの個別判定は変更なし（文脈依存の評価を維持）
- ✅ 全体のアクティビティで判定（混在パターンとの区別）
- ✅ 低ボラティリティパターンを明確に除外

### **予想される効果**
- 50-50予測の排除 → 予測精度向上
- 低ボラティリティ相場での誤予測減少
- ユーザー体験の向上（無意味な予測をしない）

---

**実装完了日**: 2025-11-02
**次のステップ**: 実際の相場データでの動作確認とチューニング
