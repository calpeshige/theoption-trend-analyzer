/**
 * Machine Learning Worker
 *
 * パターンマッチングなどの重い処理をバックグラウンドで実行するWeb Worker
 */

// 依存スクリプトの読み込み
importScripts(
    '../detailed-segment-analyzer.js',
    '../segment-similarity-calculator.js',
    '../pattern-matching-system.js'
);

// グローバル変数
let patternMatcher = null;
let trainingData = [];
let assetName = 'default';
let timeFilterMode = 'all'; // 'all' | 'session' | 'hour'

// メッセージハンドラ
self.onmessage = function (e) {
    const { type, payload, id } = e.data;

    try {
        switch (type) {
            case 'INIT':
                handleInit(payload, id);
                break;
            case 'ADD_DATA':
                handleAddData(payload, id);
                break;
            case 'PREDICT':
                handlePredict(payload, id);
                break;
            case 'GET_STATS':
                handleGetStats(payload, id);
                break;
            default:
                console.warn('[ML Worker] Unknown message type:', type);
        }
    } catch (error) {
        console.error('[ML Worker] Error handling message:', error);
        self.postMessage({
            type: 'ERROR',
            id: id,
            payload: { error: error.message, stack: error.stack }
        });
    }
};

// 初期化処理
function handleInit(payload, id) {
    // console.log(`[ML Worker] Initializing for ${payload.assetName} with ${payload.data.length} records`);
    assetName = payload.assetName;
    trainingData = payload.data || [];
    timeFilterMode = payload.timeFilterMode || 'all';

    // PatternMatchingSystemの初期化
    patternMatcher = new self.PatternMatchingSystem(trainingData);

    console.log(`[ML Worker] 初期化完了: ${trainingData.length}件, モード: ${timeFilterMode}`);

    self.postMessage({
        type: 'INIT_COMPLETE',
        id: id,
        payload: {
            success: true,
            count: trainingData.length,
            timeFilterMode: timeFilterMode
        }
    });
}

// データ追加処理
function handleAddData(payload, id) {
    const newData = payload;
    trainingData.push(newData);

    // データ制限（メモリ管理）- メインスレッドと同じロジック
    if (trainingData.length > 60000) {
        // ここでサンプリングロジックを入れることも可能だが、
        // 複雑さを避けるため単純に古いデータを削除するか、メインスレッド側で管理する
        // 今回は単純に保持する（メインスレッドが保存時にサンプリングするため）
    }

    // PatternMatcherは参照を持っているので再作成不要だが、念のため
    // （配列の中身が変わっても参照は同じならOK）

    // 結果を返す必要はあまりないが、完了通知
    if (id) {
        self.postMessage({
            type: 'ADD_DATA_COMPLETE',
            id: id,
            payload: { count: trainingData.length }
        });
    }
}

// 予測処理
function handlePredict(payload, id) {
    if (!patternMatcher) {
        throw new Error('PatternMatcher not initialized');
    }

    const { currentSituation, timeframe, threshold, maxDataCount } = payload;

    // 時間帯別モードの場合、時間優先度を計算に追加
    let options = {
        maxDataCount,
        timeFilterMode
    };

    // 時間帯別モードで現在時刻情報を追加
    if (timeFilterMode !== 'all' && currentSituation) {
        options.currentHour = currentSituation.hour || new Date().getHours();
    }

    const result = patternMatcher.predict(
        currentSituation,
        timeframe,
        threshold,
        maxDataCount,
        options
    );

    // 時間帯フィルタ情報を結果に追加
    result.timeFilterMode = timeFilterMode;
    result.dataCount = trainingData.length;

    self.postMessage({
        type: 'PREDICT_RESULT',
        id: id,
        payload: result
    });
}

// 統計情報取得
function handleGetStats(payload, id) {
    const dataCount = trainingData.length;
    // 結果が揃っているデータ数
    const dataWithResults = trainingData.filter(d =>
        d.result15s && d.result30s && d.result60s && d.result180s && d.result300s
    ).length;

    self.postMessage({
        type: 'STATS_RESULT',
        id: id,
        payload: {
            dataCount,
            dataWithResults
        }
    });
}
