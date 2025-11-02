// 学習データの品質分析スクリプト
// 使用方法: node scripts/analyze_training_data.js

const fs = require('fs');
const path = require('path');

// Chrome拡張機能のストレージからデータを読み込むための簡易実装
// 実際には chrome.storage.local を使用しますが、ここではファイルシステムから読み込みます

function analyzeTrainingData() {
  console.log('=== 学習データ品質分析 ===\n');

  // ダミーデータ分析の代わりに、実際のデータ構造を確認
  console.log('📋 分析項目:');
  console.log('1. トレンド方向の分布 (UP/DOWN/NEUTRAL)');
  console.log('2. テクニカル指標の値の範囲');
  console.log('3. 価格変動の大きさの分布');
  console.log('4. データの時系列的な偏り\n');

  // 実際のデータ分析は拡張機能のコンソールで実行する必要があります
  console.log('⚠️  このスクリプトは拡張機能のコンソールで以下のコードを実行してください:\n');

  const analysisCode = `
// ========================================
// 学習データ品質分析コード
// ========================================

(async function analyzeData() {
  console.log('🔍 学習データの分析を開始します...');

  // ストレージからデータを取得
  const result = await chrome.storage.local.get(['trainingData_USDJPY']);
  const trainingData = result.trainingData_USDJPY || [];

  console.log(\`📊 総データ数: \${trainingData.length}件\n\`);

  if (trainingData.length === 0) {
    console.log('❌ 学習データが見つかりませんでした');
    return;
  }

  // ========================================
  // 1. トレンド方向の分布（15秒）
  // ========================================
  const trendDistribution = {
    UP: 0,
    DOWN: 0,
    NEUTRAL: 0,
    undefined: 0
  };

  trainingData.forEach(data => {
    const pattern = data.pricePattern15s;
    if (!pattern) {
      trendDistribution.undefined++;
    } else {
      const direction = pattern.trendDirection || 'undefined';
      trendDistribution[direction] = (trendDistribution[direction] || 0) + 1;
    }
  });

  console.log('📈 トレンド方向の分布 (15秒):');
  console.log(\`  UP:       \${trendDistribution.UP} 件 (\${(trendDistribution.UP/trainingData.length*100).toFixed(1)}%)\`);
  console.log(\`  DOWN:     \${trendDistribution.DOWN} 件 (\${(trendDistribution.DOWN/trainingData.length*100).toFixed(1)}%)\`);
  console.log(\`  NEUTRAL:  \${trendDistribution.NEUTRAL} 件 (\${(trendDistribution.NEUTRAL/trainingData.length*100).toFixed(1)}%)\`);
  console.log(\`  未定義:   \${trendDistribution.undefined} 件\n\`);

  // ========================================
  // 2. パターンタイプの分布（15秒）
  // ========================================
  const patternTypeDistribution = {};

  trainingData.forEach(data => {
    const pattern = data.pricePattern15s;
    if (pattern) {
      const type = pattern.patternType || 'undefined';
      patternTypeDistribution[type] = (patternTypeDistribution[type] || 0) + 1;
    }
  });

  console.log('🔖 パターンタイプの分布 (15秒):');
  Object.entries(patternTypeDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(\`  \${type}: \${count} 件 (\${(count/trainingData.length*100).toFixed(1)}%)\`);
    });
  console.log('');

  // ========================================
  // 3. テクニカル指標の値の範囲（15秒）
  // ========================================
  const rsiValues = [];
  const macdValues = [];
  const rocValues = [];

  trainingData.forEach(data => {
    const tech = data.techTimeSeries15s;
    if (tech) {
      if (tech.rsi && tech.rsi.length > 0) {
        rsiValues.push(tech.rsi[tech.rsi.length - 1]); // 最新値
      }
      if (tech.macd && tech.macd.length > 0) {
        macdValues.push(tech.macd[tech.macd.length - 1]);
      }
      if (tech.roc && tech.roc.length > 0) {
        rocValues.push(tech.roc[tech.roc.length - 1]);
      }
    }
  });

  function getStats(values, name) {
    if (values.length === 0) return;
    const sorted = values.slice().sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length);

    console.log(\`  \${name}:\`);
    console.log(\`    最小値: \${min.toFixed(2)}\`);
    console.log(\`    最大値: \${max.toFixed(2)}\`);
    console.log(\`    平均値: \${avg.toFixed(2)}\`);
    console.log(\`    中央値: \${median.toFixed(2)}\`);
    console.log(\`    標準偏差: \${stdDev.toFixed(2)}\`);
  }

  console.log('📊 テクニカル指標の統計 (15秒):');
  getStats(rsiValues, 'RSI');
  getStats(macdValues, 'MACD');
  getStats(rocValues, 'ROC');
  console.log('');

  // ========================================
  // 4. 価格変動の大きさの分布（15秒）
  // ========================================
  const volatilityValues = [];
  const trendSlopeValues = [];

  trainingData.forEach(data => {
    const pattern = data.pricePattern15s;
    if (pattern) {
      if (pattern.volatility !== undefined) {
        volatilityValues.push(pattern.volatility);
      }
      if (pattern.trendSlope !== undefined) {
        trendSlopeValues.push(Math.abs(pattern.trendSlope));
      }
    }
  });

  console.log('📉 価格変動の統計 (15秒):');
  getStats(volatilityValues, 'ボラティリティ');
  getStats(trendSlopeValues, 'トレンド傾き（絶対値）');
  console.log('');

  // ========================================
  // 5. 結果の分布（15秒後の結果）
  // ========================================
  const resultDistribution = {
    UP: 0,
    DOWN: 0,
    NEUTRAL: 0,
    pending: 0,
    undefined: 0
  };

  trainingData.forEach(data => {
    const result = data.result15s;
    if (!result) {
      resultDistribution.undefined++;
    } else if (result.pending) {
      resultDistribution.pending++;
    } else {
      const direction = result.direction || 'undefined';
      resultDistribution[direction] = (resultDistribution[direction] || 0) + 1;
    }
  });

  console.log('🎯 結果の分布 (15秒後):');
  console.log(\`  UP:       \${resultDistribution.UP} 件 (\${(resultDistribution.UP/trainingData.length*100).toFixed(1)}%)\`);
  console.log(\`  DOWN:     \${resultDistribution.DOWN} 件 (\${(resultDistribution.DOWN/trainingData.length*100).toFixed(1)}%)\`);
  console.log(\`  NEUTRAL:  \${resultDistribution.NEUTRAL} 件 (\${(resultDistribution.NEUTRAL/trainingData.length*100).toFixed(1)}%)\`);
  console.log(\`  保留中:   \${resultDistribution.pending} 件\`);
  console.log(\`  未定義:   \${resultDistribution.undefined} 件\n\`);

  // ========================================
  // 6. NEUTRALデータのサンプル表示
  // ========================================
  const neutralSamples = trainingData
    .filter(data => data.pricePattern15s?.trendDirection === 'NEUTRAL')
    .slice(0, 5);

  console.log('🔍 NEUTRALデータのサンプル (最初の5件):');
  neutralSamples.forEach((data, index) => {
    const pattern = data.pricePattern15s;
    const tech = data.techTimeSeries15s;
    console.log(\`  [\${index + 1}] トレンド傾き: \${pattern.trendSlope.toFixed(4)}, ボラティリティ: \${pattern.volatility.toFixed(4)}\`);
    console.log(\`      RSI: \${tech.rsi[tech.rsi.length-1]?.toFixed(2) || 'N/A'}, MACD: \${tech.macd[tech.macd.length-1]?.toFixed(4) || 'N/A'}\`);
  });
  console.log('');

  // ========================================
  // 7. 診断と推奨事項
  // ========================================
  console.log('💡 診断結果:');

  const neutralRatio = trendDistribution.NEUTRAL / trainingData.length;
  if (neutralRatio > 0.7) {
    console.log(\`  ⚠️  NEUTRAL比率が異常に高い (\${(neutralRatio*100).toFixed(1)}%)\`);
    console.log('     → データ収集タイミングに偏りがある可能性');
    console.log('     → NEUTRAL判定の閾値が甘すぎる可能性');
  }

  const avgVolatility = volatilityValues.reduce((a, b) => a + b, 0) / volatilityValues.length;
  if (avgVolatility < 0.05) {
    console.log(\`  ⚠️  平均ボラティリティが低い (\${avgVolatility.toFixed(4)})\`);
    console.log('     → 動きの少ない相場データばかりが保存されている');
  }

  const avgSlope = trendSlopeValues.reduce((a, b) => a + b, 0) / trendSlopeValues.length;
  if (avgSlope < 0.05) {
    console.log(\`  ⚠️  平均トレンド傾きが低い (\${avgSlope.toFixed(4)})\`);
    console.log('     → 明確なトレンドのあるデータが少ない');
  }

  console.log('\\n✅ 分析完了');
})();
`;

  console.log(analysisCode);
  console.log('\n📝 上記のコードをコピーして、TheOptionページのコンソールに貼り付けて実行してください。');
}

analyzeTrainingData();
