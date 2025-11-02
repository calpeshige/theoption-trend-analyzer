/**
 * TheOption HTML構造デバッグスクリプト
 *
 * 使い方:
 * 1. TheOptionのトレーディングページを開く
 * 2. F12でコンソールを開く
 * 3. このスクリプトの内容をコピー＆ペーストして実行
 */

console.log('=== TheOption HTML構造デバッグ ===');

// 1. 価格要素を探す
console.log('\n【価格要素の検索】');
const priceSelectors = ['.rate', '[class*="rate"]', '[class*="price"]', '.current-rate'];
priceSelectors.forEach(selector => {
  const elements = document.querySelectorAll(selector);
  if (elements.length > 0) {
    console.log(`✓ ${selector}: ${elements.length}個見つかりました`);
    elements.forEach((el, i) => {
      console.log(`  [${i}] テキスト: "${el.textContent.trim()}" | クラス: "${el.className}"`);
    });
  }
});

// 2. 通貨ペア要素を探す
console.log('\n【通貨ペア要素の検索】');
const assetSelectors = [
  '.asset-name', '.pair-name', '.currency-pair', '.symbol',
  '[class*="asset"]', '[class*="pair"]', '[class*="symbol"]', '[class*="currency"]'
];
assetSelectors.forEach(selector => {
  const elements = document.querySelectorAll(selector);
  if (elements.length > 0) {
    console.log(`✓ ${selector}: ${elements.length}個見つかりました`);
    elements.forEach((el, i) => {
      const text = el.textContent.trim();
      if (text.length < 50) {  // 長すぎるテキストは除外
        console.log(`  [${i}] テキスト: "${text}" | クラス: "${el.className}"`);
      }
    });
  }
});

// 3. data属性を持つ要素を探す
console.log('\n【data属性を持つ要素】');
const dataElements = document.querySelectorAll('[data-asset], [data-pair], [data-symbol], [data-currency]');
if (dataElements.length > 0) {
  dataElements.forEach((el, i) => {
    console.log(`  [${i}] data-asset: "${el.dataset.asset || 'なし'}"`);
    console.log(`      data-pair: "${el.dataset.pair || 'なし'}"`);
    console.log(`      data-symbol: "${el.dataset.symbol || 'なし'}"`);
    console.log(`      クラス: "${el.className}"`);
  });
} else {
  console.log('  data属性を持つ要素は見つかりませんでした');
}

// 4. URLパラメータを確認
console.log('\n【URLパラメータ】');
const urlParams = new URLSearchParams(window.location.search);
console.log(`  URL: ${window.location.href}`);
console.log(`  パラメータ一覧:`);
for (const [key, value] of urlParams.entries()) {
  console.log(`    ${key} = ${value}`);
}

// 5. ページタイトルを確認
console.log('\n【ページタイトル】');
console.log(`  タイトル: "${document.title}"`);

// 6. 通貨ペアらしきテキストを全体から検索
console.log('\n【通貨ペアパターンの全体検索】');
const bodyText = document.body.textContent;
const pairPattern = /([A-Z]{3})[\/\s]?([A-Z]{3})/g;
const matches = [...bodyText.matchAll(pairPattern)];
if (matches.length > 0) {
  const uniquePairs = [...new Set(matches.map(m => `${m[1]}/${m[2]}`))];
  console.log(`  見つかった通貨ペアパターン: ${uniquePairs.join(', ')}`);
} else {
  console.log('  通貨ペアパターンが見つかりませんでした');
}

// 7. 選択中の通貨ペアを示す要素（activeクラスなど）
console.log('\n【アクティブな要素】');
const activeElements = document.querySelectorAll('.active, [class*="active"], [class*="selected"]');
activeElements.forEach((el, i) => {
  const text = el.textContent.trim();
  if (text.length > 0 && text.length < 50) {
    console.log(`  [${i}] テキスト: "${text}" | クラス: "${el.className}"`);
  }
});

// 8. チャート関連の要素
console.log('\n【チャート関連要素】');
const chartSelectors = ['.chart', '[class*="chart"]', '[id*="chart"]'];
chartSelectors.forEach(selector => {
  const elements = document.querySelectorAll(selector);
  if (elements.length > 0) {
    console.log(`✓ ${selector}: ${elements.length}個見つかりました`);
    elements.forEach((el, i) => {
      console.log(`  [${i}] ID: "${el.id}" | クラス: "${el.className.substring(0, 80)}"`);
      // data属性をチェック
      if (el.dataset) {
        Object.keys(el.dataset).forEach(key => {
          console.log(`      data-${key}: "${el.dataset[key]}"`);
        });
      }
    });
  }
});

console.log('\n=== デバッグ完了 ===');
console.log('上記の情報を開発者に共有してください');
