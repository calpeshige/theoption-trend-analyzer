/**
 * TheOption Trend Analyzer - Popup Script
 * Version: 4.2.0
 */

document.addEventListener('DOMContentLoaded', function() {
  // 設定ボタン
  document.getElementById('settingsBtn').addEventListener('click', function() {
    const settingsInfo = `
【設定方法】

TheOptionのトレーディング画面で、
分析パネル右上の歯車アイコン⚙️を
クリックすると設定パネルが開きます。

■ 設定できる項目
・コンパクトモード
・フォントサイズ調整
・アラート音のON/OFF
    `.trim();

    alert(settingsInfo);
  });

  // ライセンス管理ボタン
  document.getElementById('licenseBtn').addEventListener('click', function() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('license-admin.html')
    });
  });

  // 使い方ガイドボタン
  document.getElementById('guideBtn').addEventListener('click', function() {
    const guideText = `
【TheOption Trend Analyzer 使い方ガイド】

■ 基本的な使い方
1. TheOptionのトレーディング画面を開く
2. 自動的に分析が開始されます
3. 画面右側に分析結果が表示されます

■ 判定時間の切り替え
・画面上部のタブで判定時間を選択できます
  (15秒 / 30秒 / 60秒 / 3分 / 5分)

■ 分析結果の見方
🔴 STRONG_HIGH: 強い上昇シグナル
🟠 HIGH: 上昇シグナル
🟢 NEUTRAL: 見送り推奨
🔵 LOW: 下降シグナル
⚫ STRONG_LOW: 強い下降シグナル

■ 設定
・歯車アイコンから表示設定を変更できます
・フォントサイズ、コンパクトモードなど

■ AI予測機能
・機械学習により過去のパターンから予測
・データが蓄積されるほど精度が向上します
    `.trim();

    alert(guideText);
  });

  // バージョン情報ボタン
  document.getElementById('versionBtn').addEventListener('click', function() {
    const versionInfo = `
【TheOption Trend Analyzer】
バージョン: 4.2.0

■ 主な機能
・多次元テクニカル分析（MACD, ADX, Stochastic, ATR, ROC, Sentiment）
・機械学習による価格予測
・5つの判定時間対応（15秒〜5分）
・動的閾値調整（通貨ペアごとに最適化）
・仮想通貨ペア対応

■ 最新の更新（v4.2.0）
・ポップアップUIを刷新
・使い方ガイド・バージョン情報を追加
・ユーザビリティの向上

■ v4.1.9の更新
・仮想通貨ペアのシグナル乱発問題を修正
・BTC/ETH等の閾値を2.5倍に調整
・分析精度の向上

■ 技術仕様
・リアルタイム価格分析
・最大5万件のML学習データ
・セグメント形状類似度マッチング
    `.trim();

    alert(versionInfo);
  });

  console.log('[TheOption Analyzer Popup] 初期化完了 - v4.2.0');
});
