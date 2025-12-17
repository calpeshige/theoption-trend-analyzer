/**
 * IndexedDB Manager
 * 高速な非同期データストレージを提供
 */

class DBManager {
    constructor(dbName = 'TheOptionTrendDB', version = 2) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.storeName = 'patterns';
    }

    /**
     * データベースを初期化
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('[DB] Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('[DB] Database initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // パターンストアを作成（timestampをキーパスとする）
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'timestamp' });

                    // インデックス作成
                    store.createIndex('assetName', 'assetName', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: true });
                    store.createIndex('hour', 'hour', { unique: false });

                    console.log('[DB] Object store created with hour index');
                } else if (oldVersion < 2) {
                    // v1 → v2: hourインデックスを追加
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore(this.storeName);

                    if (!store.indexNames.contains('hour')) {
                        store.createIndex('hour', 'hour', { unique: false });
                        console.log('[DB] Added hour index for time-based filtering');
                    }
                }
            };
        });
    }

    /**
     * レコードを保存または更新
     * @param {Object} record - 保存するデータ
     */
    async saveRecord(record) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const request = store.put(record);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                console.error('[DB] Save error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 複数のレコードを一括保存
     * @param {Array} records - 保存するデータの配列
     */
    async saveRecords(records) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            let successCount = 0;
            let errorCount = 0;

            transaction.oncomplete = () => {
                console.log(`[DB] Batch save completed: ${successCount} success, ${errorCount} errors`);
                resolve(successCount);
            };

            transaction.onerror = (event) => {
                console.error('[DB] Transaction error:', event.target.error);
                reject(event.target.error);
            };

            records.forEach(record => {
                const request = store.put(record);
                request.onsuccess = () => successCount++;
                request.onerror = () => errorCount++;
            });
        });
    }

    /**
     * 全レコードを取得
     * @param {string} assetName - 通貨ペア名（オプション）
     */
    async getAllRecords(assetName = null) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            let request;

            if (assetName) {
                const index = store.index('assetName');
                request = index.getAll(IDBKeyRange.only(assetName));
            } else {
                request = store.getAll();
            }

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                console.error('[DB] Get all error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * レコード数を取得
     */
    async getCount(assetName = null) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            let request;

            if (assetName) {
                const index = store.index('assetName');
                request = index.count(IDBKeyRange.only(assetName));
            } else {
                request = store.count();
            }

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                console.error('[DB] Count error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 古いデータを削除（数制限）
     * @param {number} maxCount - 最大保持件数
     * @param {string} assetName - 通貨ペア名
     */
    async pruneRecords(maxCount = 50000, assetName = null) {
        if (!this.db) await this.init();

        const count = await this.getCount(assetName);
        if (count <= maxCount) return 0;

        const deleteCount = count - maxCount;
        console.log(`[DB] Pruning ${deleteCount} records...`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp'); // タイムスタンプ順

            let deleted = 0;
            const request = index.openCursor(); // 昇順（古い順）

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && deleted < deleteCount) {
                    // assetName指定がある場合はフィルタリング
                    if (!assetName || cursor.value.assetName === assetName) {
                        cursor.delete();
                        deleted++;
                    }
                    cursor.continue();
                } else {
                    // 完了（これ以上削除しない、またはカーソル終了）
                }
            };

            transaction.oncomplete = () => {
                console.log(`[DB] Pruned ${deleted} records`);
                resolve(deleted);
            };

            transaction.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * 単一レコードを追加（重複時はエラー）
     * @param {Object} record - 追加するデータ
     */
    async addRecord(record) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const request = store.add(record);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * 全レコードを削除
     */
    async clearAllRecords() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const request = store.clear();

            request.onsuccess = () => {
                console.log('[DB] All records cleared');
                resolve();
            };

            request.onerror = (event) => {
                console.error('[DB] Clear error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * レコード件数を取得（getCountのエイリアス）
     */
    async getRecordCount(assetName = null) {
        return this.getCount(assetName);
    }

    /**
     * 時間帯でフィルタしてレコードを取得
     * @param {string} assetName - 通貨ペア名
     * @param {number[]} hours - 取得する時間帯の配列 (例: [10, 11, 12])
     * @returns {Promise<Array>} フィルタされたレコード
     */
    async getRecordsByHours(assetName, hours) {
        if (!this.db) await this.init();
        if (!hours || hours.length === 0) {
            return this.getAllRecords(assetName);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const results = [];

            // hourインデックスを使用して各時間帯のデータを取得
            let completedQueries = 0;
            const totalQueries = hours.length;

            for (const hour of hours) {
                const index = store.index('hour');
                const request = index.getAll(IDBKeyRange.only(hour));

                request.onsuccess = () => {
                    const records = request.result;
                    // assetNameでフィルタ
                    const filtered = assetName
                        ? records.filter(r => r.assetName === assetName)
                        : records;
                    results.push(...filtered);
                    completedQueries++;

                    if (completedQueries === totalQueries) {
                        // 重複を除去してtimestamp順にソート
                        const uniqueResults = [...new Map(results.map(r => [r.timestamp, r])).values()];
                        uniqueResults.sort((a, b) => a.timestamp - b.timestamp);
                        resolve(uniqueResults);
                    }
                };

                request.onerror = (event) => {
                    console.error('[DB] Get by hours error:', event.target.error);
                    reject(event.target.error);
                };
            }
        });
    }

    /**
     * 市場セッションの定義
     */
    static getMarketSessions() {
        return {
            TOKYO: { name: '東京', hours: [9, 10, 11, 12, 13, 14, 15], start: 9, end: 15 },
            EUROPE: { name: '欧州', hours: [16, 17, 18, 19, 20], start: 16, end: 20 },
            NY: { name: 'NY', hours: [21, 22, 23, 0, 1, 2], start: 21, end: 2 },
            QUIET: { name: '静穏', hours: [3, 4, 5, 6, 7, 8], start: 3, end: 8 }
        };
    }

    /**
     * 現在時刻の市場セッションを取得
     * @param {number} hour - 時間 (0-23)
     * @returns {string} セッション名 (TOKYO, EUROPE, NY, QUIET)
     */
    static getCurrentSession(hour) {
        const sessions = DBManager.getMarketSessions();
        for (const [sessionName, session] of Object.entries(sessions)) {
            if (session.hours.includes(hour)) {
                return sessionName;
            }
        }
        return 'QUIET';
    }

    /**
     * 時間帯優先度付きの時間範囲を取得
     * 例: 11時の場合 → [11, 10, 12, 9, 13]（±1.5時間を段階的に）
     * @param {number} currentHour - 現在の時間
     * @param {number} range - 範囲（デフォルト1.5時間 → 2時間として計算）
     * @returns {number[]} 優先度順の時間配列
     */
    static getHourRangeWithPriority(currentHour, range = 2) {
        const hours = [currentHour];
        for (let i = 1; i <= range; i++) {
            const before = (currentHour - i + 24) % 24;
            const after = (currentHour + i) % 24;
            hours.push(before, after);
        }
        return hours;
    }

    /**
     * 登録されている通貨ペア一覧を取得
     * @returns {Array} 通貨ペア名の配列（件数付き）
     */
    async getAssetList() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('assetName');
            const request = index.openCursor(null, 'nextunique');

            const assets = [];

            request.onsuccess = async (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    assets.push(cursor.value.assetName);
                    cursor.continue();
                } else {
                    // 各通貨ペアの件数を取得
                    const result = [];
                    for (const assetName of assets) {
                        const count = await this.getCount(assetName);
                        result.push({ assetName, count });
                    }
                    resolve(result);
                }
            };

            request.onerror = (event) => {
                console.error('[DB] Get asset list error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * ストリーミングエクスポート（メモリ効率の良い大量データエクスポート）
     * カーソルで少しずつ読み込み、Blobパーツとして蓄積
     * @param {string} assetName - 通貨ペア名（nullで全データ）
     * @param {function} onProgress - 進捗コールバック (current, total) => void
     * @returns {Blob} JSONデータのBlob
     */
    async streamExport(assetName = null, onProgress = null) {
        if (!this.db) await this.init();

        // まず件数を取得
        const totalCount = await this.getCount(assetName);
        if (totalCount === 0) {
            return null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            let request;
            if (assetName) {
                const index = store.index('assetName');
                request = index.openCursor(IDBKeyRange.only(assetName));
            } else {
                request = store.openCursor();
            }

            // ストレージキー形式に変換
            const storageKey = assetName
                ? `theoption_ml_${assetName.replace(/\//g, '_')}`
                : null;

            const blobParts = [];
            let recordCount = 0;
            let isFirst = true;
            const BATCH_SIZE = 500; // 500件ごとにBlobパーツを作成
            let currentBatch = [];

            // JSON開始
            if (assetName) {
                blobParts.push(`{\n  "${storageKey}": [\n`);
            } else {
                // 全データの場合は通貨ペア別にグループ化が必要
                // この場合は従来の方式を使用（全データは選択不可にする）
            }

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (cursor) {
                    const record = cursor.value;

                    // レコードをJSON文字列に変換
                    const jsonStr = JSON.stringify(record);
                    const prefix = isFirst ? '    ' : ',\n    ';
                    currentBatch.push(prefix + jsonStr);
                    isFirst = false;
                    recordCount++;

                    // バッチサイズに達したらBlobパーツに追加
                    if (currentBatch.length >= BATCH_SIZE) {
                        blobParts.push(currentBatch.join(''));
                        currentBatch = [];

                        // 進捗通知
                        if (onProgress) {
                            onProgress(recordCount, totalCount);
                        }
                    }

                    cursor.continue();
                } else {
                    // カーソル終了 - 残りのバッチを追加
                    if (currentBatch.length > 0) {
                        blobParts.push(currentBatch.join(''));
                    }

                    // JSON終了
                    blobParts.push('\n  ]\n}');

                    // Blobを作成
                    const blob = new Blob(blobParts, { type: 'application/json' });

                    console.log(`[DB] Stream export completed: ${recordCount} records, ${blob.size} bytes`);
                    resolve({ blob, recordCount });
                }
            };

            request.onerror = (event) => {
                console.error('[DB] Stream export error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * データベースを削除（デバッグ用）
     */
    async deleteDatabase() {
        if (this.db) {
            this.db.close();
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
}

// グローバルに公開
window.DBManager = DBManager;
