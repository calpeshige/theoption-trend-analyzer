/**
 * TheOption Trend Analyzer - Popup Script
 * Version: 1.0.0 (調査版)
 */

document.addEventListener('DOMContentLoaded', function() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // 拡張機能が読み込まれているか確認
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];

    if (currentTab && (
      currentTab.url.includes('theoption.com/trading') ||
      currentTab.url.includes('jp.theoption.com/trading')
    )) {
      statusText.textContent = 'API調査モード';
      statusDot.style.background = '#fbbf24';
      statusDot.style.boxShadow = '0 0 10px rgba(251, 191, 36, 0.6)';
    } else {
      statusText.textContent = 'TheOptionページ以外';
      statusDot.style.background = '#94a3b8';
      statusDot.style.boxShadow = 'none';
    }
  });

  console.log('[TheOption Analyzer Popup] 初期化完了');
});
