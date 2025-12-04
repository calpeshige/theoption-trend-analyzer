/**
 * IndexedDB Manager
 * 高速な非同期データストレージを提供
 */

class DBManager {
    constructor(dbName = 'TheOptionTrendDB', version = 1) {
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

                // パターンストアを作成（timestampをキーパスとする）
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'timestamp' });

                    // インデックス作成
                    store.createIndex('assetName', 'assetName', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: true });

                    console.log('[DB] Object store created');
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
