/**
 * Curate Community Data from Google Drive
 *
 * 拡張機能ユーザーから自動アップロードされた学習データチャンクを
 * Google Drive から取得し、通貨ペアごとに統合・トリミング・公開する。
 *
 * 実行: GitHub Actions (毎日03:00 JST)
 * 環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_JSON: サービスアカウントの認証JSON
 *   DRIVE_FOLDER_ID: 受信箱フォルダのID
 *   GITHUB_TOKEN: GitHub Releases アップロード用トークン
 *   GITHUB_REPOSITORY: "owner/repo" 形式 (例: calpeshige/theoption-releases)
 */

import { google } from 'googleapis';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

// stream-json は CommonJS モジュールなので default export 経由でインポート
// stream-json v2.x のパスは小文字ハイフン区切り(streamers/stream-array.js)
import streamChainPkg from 'stream-chain';
import streamJsonPkg from 'stream-json';
import streamArrayPkg from 'stream-json/streamers/stream-array.js';
import pickPkg from 'stream-json/filters/pick.js';

const chain = streamChainPkg;  // default export が chain 関数そのもの
const { parser } = streamJsonPkg;
const { streamArray } = streamArrayPkg;
const { pick } = pickPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DATA_META_DIR = join(REPO_ROOT, 'data-meta');
const RELEASE_DIR = join(REPO_ROOT, '.release-tmp');
const MANUAL_HTML_PATH = join(REPO_ROOT, 'docs', 'trading-manual.html');
const RECORDS_PER_ASSET = 20000;
const MIN_TIMESTAMP = Date.now() - 5 * 365 * 24 * 3600 * 1000; // 5年前
const MAX_TIMESTAMP = Date.now() + 24 * 3600 * 1000;            // 1日後 (時計ずれ許容)

// =============================================================================
// メイン処理
// =============================================================================

async function main() {
  log('🤖 コミュニティデータキュレーション開始');

  // 認証情報読み込み
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  if (!folderId) throw new Error('DRIVE_FOLDER_ID が設定されていません');

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const drive = google.drive({ version: 'v3', auth });

  // 1. Drive からチャンクファイル一覧を取得
  log('📂 Drive からファイル一覧を取得中...');
  const files = await listDriveFiles(drive, folderId);
  log(`  → ${files.length} ファイル検出`);

  if (files.length === 0) {
    log('⚠ 処理対象ファイルなし。終了します。');
    return;
  }

  // 2. uploadId ごとに同一バックアップセッションのチャンクをグループ化
  const sessionGroups = groupByUploadSession(files);
  log(`📦 ${Object.keys(sessionGroups).length} アップロードセッションを検出`);

  // 3. 各セッションの全チャンクを連結 → 解凍 → JSON化 → 構造検証
  const recordsByAsset = new Map(); // assetName → Map(timestamp → record)
  const processedFileIds = []; // 処理に成功したファイル(Drive上で削除する)

  for (const [sessionKey, group] of Object.entries(sessionGroups)) {
    try {
      const records = await processSession(drive, sessionKey, group);
      if (records && records.length > 0) {
        const assetName = group.assetName;
        if (!recordsByAsset.has(assetName)) recordsByAsset.set(assetName, new Map());
        const assetMap = recordsByAsset.get(assetName);
        let added = 0;
        for (const record of records) {
          if (!assetMap.has(record.timestamp)) {
            assetMap.set(record.timestamp, record);
            added++;
          } else {
            // 重複: 既存と新規でレコード内容が異なる場合は新しい方を採用
            assetMap.set(record.timestamp, record);
          }
        }
        log(`  ✓ ${sessionKey}: ${assetName} ${records.length}件取得 (新規${added}件)`);

        // 処理成功したセッションのファイルIDを記録
        for (const file of group.chunks) {
          processedFileIds.push(file.id);
        }
      }
    } catch (err) {
      log(`  ✗ ${sessionKey} 処理エラー: ${err.message}`);
    }
  }

  if (recordsByAsset.size === 0) {
    log('⚠ 有効なレコードが0件のため、公開処理をスキップ');
    return;
  }

  // 4. 通貨ペアごとに新しい順20,000件にトリミング & 公開ファイル作成
  mkdirSync(DATA_META_DIR, { recursive: true });
  mkdirSync(RELEASE_DIR, { recursive: true });

  const allMeta = [];
  for (const [assetName, recordMap] of recordsByAsset) {
    const sorted = [...recordMap.values()].sort((a, b) => b.timestamp - a.timestamp);
    const top = sorted.slice(0, RECORDS_PER_ASSET);

    log(`📊 ${assetName}: 総ユニーク件数 ${sorted.length}件 → 上位 ${top.length}件採用`);

    // メタデータ生成
    const meta = generateMeta(assetName, top);

    // gzip圧縮ファイル作成
    const safeAsset = assetName.replace(/\//g, '');
    const exportObj = { [`theoption_ml_${assetName.replace(/\//g, '_')}`]: top };
    const json = JSON.stringify(exportObj);
    const compressed = gzipSync(Buffer.from(json));

    const releaseFilename = `${safeAsset}_${RECORDS_PER_ASSET}.json.gz`;
    const releaseFilePath = join(RELEASE_DIR, releaseFilename);
    writeFileSync(releaseFilePath, compressed);

    // メタデータJSON保存
    const metaFilename = `${safeAsset}.meta.json`;
    const metaFilePath = join(DATA_META_DIR, metaFilename);
    writeFileSync(metaFilePath, JSON.stringify(meta, null, 2));

    allMeta.push({
      ...meta,
      releaseFilename,
      releaseFilePath,
      compressedSize: compressed.length
    });
  }

  // 5. GitHub Releases にアップロード
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    log('☁️ GitHub Releases にアップロード中...');
    for (const meta of allMeta) {
      try {
        const downloadUrl = await uploadToGitHubRelease(meta);
        meta.downloadUrl = downloadUrl;
        // メタJSONを再保存(downloadUrl付き)
        const safeAsset = meta.assetName.replace(/\//g, '');
        writeFileSync(
          join(DATA_META_DIR, `${safeAsset}.meta.json`),
          JSON.stringify(meta, null, 2)
        );
      } catch (err) {
        log(`  ✗ ${meta.assetName} アップロード失敗: ${err.message}`);
      }
    }
  } else {
    log('⚠ GITHUB_TOKEN/GITHUB_REPOSITORY が未設定のため、リリースアップロードはスキップ');
  }

  // 6. trading-manual.html を自動更新
  log('📝 trading-manual.html を更新中...');
  updateManualHtml(allMeta);

  // 7. 処理済みのDriveファイルを Apps Script 経由でゴミ箱移動
  // サービスアカウントは他人がオーナーのファイルを操作できないため、
  // オーナー(Apps Scriptのデプロイユーザー)経由でゴミ箱に移動する
  if (processedFileIds.length > 0) {
    await deleteFilesViaAppsScript(processedFileIds);
  }

  // クリーンアップ
  if (existsSync(RELEASE_DIR)) {
    rmSync(RELEASE_DIR, { recursive: true });
  }

  log('✅ キュレーション完了');
}

// =============================================================================
// Drive API
// =============================================================================

async function listDriveFiles(drive, folderId) {
  const files = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, size, mimeType, createdTime)',
      pageSize: 1000,
      pageToken
    });
    if (res.data.files) files.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadDriveFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

// =============================================================================
// Apps Script 経由のファイル削除 (オーナー権限で実行)
// =============================================================================

async function deleteFilesViaAppsScript(fileIds) {
  const webhookUrl = process.env.APPS_SCRIPT_WEBHOOK_URL;
  const deleteSecret = process.env.DELETE_SECRET;

  if (!webhookUrl || !deleteSecret) {
    log(`  ⚠ APPS_SCRIPT_WEBHOOK_URL / DELETE_SECRET が未設定のため、ゴミ箱移動をスキップ`);
    return;
  }

  log(`🗑️ 処理済みファイル ${fileIds.length} 件を Apps Script 経由でゴミ箱に移動中...`);

  // 1リクエストあたり最大100件ずつ送る (Apps Scriptの実行時間制限考慮)
  const BATCH_SIZE = 100;
  let totalDeleted = 0;
  let totalFailed = 0;

  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'delete',
          secret: deleteSecret,
          fileIds: batch
        }),
        redirect: 'follow'
      });

      if (!res.ok) {
        log(`  ✗ バッチ削除失敗 HTTP ${res.status}`);
        totalFailed += batch.length;
        continue;
      }

      const json = await res.json();
      if (json.success) {
        totalDeleted += json.deleted || 0;
        totalFailed += json.failed || 0;
        if (json.errors && json.errors.length > 0) {
          for (const err of json.errors.slice(0, 5)) {
            log(`  ✗ ${err}`);
          }
          if (json.errors.length > 5) {
            log(`  ... ほか ${json.errors.length - 5} 件のエラー`);
          }
        }
      } else {
        log(`  ✗ バッチ削除失敗: ${json.error}`);
        totalFailed += batch.length;
      }
    } catch (err) {
      log(`  ✗ バッチ削除リクエスト失敗: ${err.message}`);
      totalFailed += batch.length;
    }
  }

  log(`  ✓ ${totalDeleted}/${fileIds.length} 件をゴミ箱に移動完了 (失敗${totalFailed}件)`);
}

// =============================================================================
// セッショングループ化 & 連結処理
// =============================================================================

/**
 * ファイル名: {uploadId}_chunk_{chunkIndex}_of_{totalChunks}_{ASSETNAME}.bin
 * uploadId + assetName をキーにしてグループ化
 */
function groupByUploadSession(files) {
  const groups = {};
  for (const file of files) {
    const m = file.name.match(/^(.+?)_chunk_(\d{4})_of_(\d{4})_(.+?)\.bin$/);
    if (!m) {
      log(`  ⚠ 不明なファイル名形式: ${file.name}`);
      continue;
    }
    const [, uploadId, chunkIndexStr, totalChunksStr, assetName] = m;
    const chunkIndex = parseInt(chunkIndexStr, 10);
    const totalChunks = parseInt(totalChunksStr, 10);
    const sessionKey = `${uploadId}_${assetName}`;
    if (!groups[sessionKey]) {
      groups[sessionKey] = {
        uploadId,
        assetName: normalizeAssetName(assetName),
        totalChunks,
        chunks: []
      };
    }
    groups[sessionKey].chunks.push({ id: file.id, name: file.name, chunkIndex, totalChunks });
  }
  return groups;
}

/**
 * "USDJPY" → "USD/JPY" に正規化(主要通貨ペアの場合)
 * 既知のパターンに合致しない場合はそのまま返す
 */
function normalizeAssetName(rawName) {
  // 6文字なら3文字+3文字でスラッシュ挿入
  if (/^[A-Z]{6}$/.test(rawName)) {
    return rawName.slice(0, 3) + '/' + rawName.slice(3);
  }
  return rawName;
}

async function processSession(drive, sessionKey, group) {
  // 全チャンクが揃っているかチェック
  if (group.chunks.length < group.totalChunks) {
    log(`  ⚠ ${sessionKey}: チャンク不完全 (${group.chunks.length}/${group.totalChunks})、スキップ`);
    return null;
  }

  // chunkIndex順にソート
  group.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  // 全チャンクをダウンロードして連結
  const buffers = [];
  for (const chunk of group.chunks) {
    const buf = await downloadDriveFile(drive, chunk.id);
    buffers.push(buf);
  }
  const combined = Buffer.concat(buffers);

  // gzip解凍 (バッファのまま、文字列化しない)
  let decompressed;
  try {
    decompressed = gunzipSync(combined);
  } catch (err) {
    throw new Error(`gzip解凍失敗: ${err.message}`);
  }

  // データサイズに応じてパース方法を選択
  // 約400MB以上の文字列は Node.js の上限超過リスクがあるためストリーミング
  const SIZE_THRESHOLD = 400 * 1024 * 1024;

  if (decompressed.length < SIZE_THRESHOLD) {
    // 通常サイズ: JSON.parse 一括
    let parsed;
    try {
      parsed = JSON.parse(decompressed.toString('utf8'));
    } catch (err) {
      throw new Error(`JSON.parse失敗: ${err.message}`);
    }
    const validated = validateAndExtractRecords(parsed);
    if (!validated.records.length) {
      throw new Error('有効なレコードが0件');
    }
    return validated.records;
  } else {
    // 大容量: ストリーミングパース (文字列化しない)
    log(`  ⚙ ${sessionKey}: 大容量データ(${(decompressed.length / 1024 / 1024).toFixed(0)}MB) ストリーミングモードでパース`);
    const records = await parseRecordsStreaming(decompressed);
    if (!records.length) {
      throw new Error('有効なレコードが0件');
    }
    return records;
  }
}

/**
 * ストリーミングJSONパーサーで大容量データを処理する
 * 期待構造: { "theoption_ml_<asset>": [ {timestamp, price, ...}, ... ] }
 *
 * stream-json v2 の chain() パターンを使用してパイプラインを構築:
 *   Readable → parser → pick (theoption_ml_*) → streamArray → records
 *
 * 注意: 大容量バッファをそのまま Readable.from に渡すと、内部で文字列化を
 * 試みて Node.js の文字列上限(0x1fffffe8)を超えてしまうため、
 * 16MBずつのチャンクに分割した自作Readableを使う。
 */
function parseRecordsStreaming(buffer) {
  return new Promise((resolve, reject) => {
    const records = [];

    // 16MB チャンクで送り出す Readable を作成 (文字列化を回避)
    const CHUNK_SIZE = 16 * 1024 * 1024;
    let offset = 0;

    const source = new Readable({
      read() {
        if (offset >= buffer.length) {
          this.push(null); // ストリーム終端
          return;
        }
        const end = Math.min(offset + CHUNK_SIZE, buffer.length);
        const chunk = buffer.subarray(offset, end);
        offset = end;
        this.push(chunk);
      }
    });

    const pipeline = chain([
      source,
      parser(),
      pick({ filter: /^theoption_ml_/ }),
      streamArray()
    ]);

    pipeline.on('data', ({ value }) => {
      if (isValidRecord(value)) {
        records.push(value);
      }
    });

    pipeline.on('end', () => {
      resolve(records);
    });

    pipeline.on('error', (err) => {
      reject(new Error(`ストリーミングパース失敗: ${err.message}`));
    });
  });
}

/**
 * データ構造を検証してレコード配列を抽出
 * 期待: { "theoption_ml_USD_JPY": [ {timestamp, price, ...}, ... ] }
 */
function validateAndExtractRecords(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('データがオブジェクトではない');
  }

  const records = [];
  for (const key of Object.keys(data)) {
    if (!key.startsWith('theoption_ml_')) {
      continue; // 無関係なキーは無視
    }
    if (!Array.isArray(data[key])) {
      throw new Error(`${key} が配列ではない`);
    }
    for (const record of data[key]) {
      if (!isValidRecord(record)) continue;
      records.push(record);
    }
  }
  return { records };
}

function isValidRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (typeof record.timestamp !== 'number') return false;
  if (record.timestamp < MIN_TIMESTAMP || record.timestamp > MAX_TIMESTAMP) return false;
  if (typeof record.price !== 'number' || !isFinite(record.price)) return false;
  return true;
}

// =============================================================================
// メタデータ生成
// =============================================================================

function generateMeta(assetName, records) {
  const timestamps = records.map(r => r.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  // 時間帯分布
  const hourDist = new Array(24).fill(0);
  for (const r of records) {
    const hour = typeof r.hour === 'number' ? r.hour : new Date(r.timestamp).getHours();
    if (hour >= 0 && hour <= 23) hourDist[hour]++;
  }
  const activeHours = hourDist
    .map((count, hour) => ({ hour, count }))
    .filter(x => x.count > 0)
    .map(x => x.hour);
  const allHours = activeHours.length === 24;

  return {
    assetName,
    recordCount: records.length,
    periodStart: new Date(minTs).toISOString(),
    periodEnd: new Date(maxTs).toISOString(),
    hourCoverage: allHours ? '全時間帯（0-23時）' : `${activeHours.length}時間帯（${activeHours.join(', ')}時）`,
    hourDistribution: hourDist,
    lastUpdated: new Date().toISOString()
  };
}

// =============================================================================
// GitHub Releases アップロード
// =============================================================================

async function uploadToGitHubRelease(meta) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const safeAsset = meta.assetName.replace(/\//g, '');
  const tag = `data-${safeAsset}-latest`;
  const releaseName = `Community Data: ${meta.assetName}`;

  // 既存リリース取得 or 新規作成
  let release = await getRelease(repo, token, tag);
  if (release) {
    // 既存アセットを削除
    if (release.assets && release.assets.length > 0) {
      for (const asset of release.assets) {
        await deleteAsset(repo, token, asset.id);
      }
    }
    // リリース情報を更新
    release = await updateRelease(repo, token, release.id, {
      name: releaseName,
      body: generateReleaseBody(meta)
    });
  } else {
    release = await createRelease(repo, token, {
      tag_name: tag,
      name: releaseName,
      body: generateReleaseBody(meta),
      draft: false,
      prerelease: false
    });
  }

  // ファイルアップロード
  const fileBuffer = readFileSync(meta.releaseFilePath);
  const uploadUrl = release.upload_url.replace(/\{\?[^}]+\}/, `?name=${encodeURIComponent(meta.releaseFilename)}`);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/gzip',
      'Content-Length': fileBuffer.length
    },
    body: fileBuffer
  });

  if (!res.ok) {
    throw new Error(`Asset upload failed: ${res.status} ${await res.text()}`);
  }

  const asset = await res.json();
  return asset.browser_download_url;
}

async function getRelease(repo, token, tag) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    headers: { 'Authorization': `token ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Get release failed: ${res.status}`);
  return res.json();
}

async function createRelease(repo, token, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Create release failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateRelease(repo, token, releaseId, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Update release failed: ${res.status}`);
  return res.json();
}

async function deleteAsset(repo, token, assetId) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${assetId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `token ${token}` }
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete asset failed: ${res.status}`);
  }
}

function generateReleaseBody(meta) {
  return [
    `# AI学習データ - ${meta.assetName}`,
    '',
    `- 件数: ${meta.recordCount.toLocaleString()}件`,
    `- 期間: ${meta.periodStart.slice(0, 10)} 〜 ${meta.periodEnd.slice(0, 10)}`,
    `- 時間帯: ${meta.hourCoverage}`,
    `- 最終更新: ${meta.lastUpdated.slice(0, 10)}`,
    '',
    'このリリースは GitHub Actions により自動生成されています。',
    '拡張機能の「JSONインポート」機能でファイルを取り込めます。'
  ].join('\n');
}

// =============================================================================
// trading-manual.html 自動更新
// =============================================================================

function updateManualHtml(allMeta) {
  if (!existsSync(MANUAL_HTML_PATH)) {
    log('  ⚠ trading-manual.html が見つからないためスキップ');
    return;
  }

  const html = readFileSync(MANUAL_HTML_PATH, 'utf8');
  const startMarker = '<!-- COMMUNITY_DATA_START -->';
  const endMarker = '<!-- COMMUNITY_DATA_END -->';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    log('  ⚠ HTMLマーカーが見つからないためスキップ');
    return;
  }

  const before = html.substring(0, startIdx + startMarker.length);
  const after = html.substring(endIdx);

  let inner = '\n        <!-- このセクションはGitHub Actionsで自動生成されます。手動編集禁止 -->\n';
  if (allMeta.length === 0) {
    inner += '        <p style="text-align: center; padding: 40px 0; color: var(--text-secondary);">\n';
    inner += '          現在、提供されたデータはまだありません。<br>\n';
    inner += '          自動バックアップに参加して、コミュニティを育てていきましょう。\n';
    inner += '        </p>\n        ';
  } else {
    // 通貨ペア順にソート
    const sortedMeta = [...allMeta].sort((a, b) => a.assetName.localeCompare(b.assetName));
    for (const meta of sortedMeta) {
      const sizeMB = (meta.compressedSize / 1024 / 1024).toFixed(1);
      const downloadUrl = meta.downloadUrl || '#';
      inner += `        <div class="release-card">\n`;
      inner += `          <div class="release-header">\n`;
      inner += `            <span class="release-version">${escapeHtml(meta.assetName)}</span>\n`;
      inner += `            <span class="release-date">最終更新: ${meta.lastUpdated.slice(0, 10)}</span>\n`;
      inner += `          </div>\n`;
      inner += `          <div class="release-notes">\n`;
      inner += `            <ul>\n`;
      inner += `              <li>件数: ${meta.recordCount.toLocaleString()}件</li>\n`;
      inner += `              <li>期間: ${meta.periodStart.slice(0, 10)} 〜 ${meta.periodEnd.slice(0, 10)}</li>\n`;
      inner += `              <li>時間帯: ${escapeHtml(meta.hourCoverage)}</li>\n`;
      inner += `              <li>サイズ: ${sizeMB} MB (gzip圧縮)</li>\n`;
      inner += `            </ul>\n`;
      inner += `          </div>\n`;
      inner += `          <a class="download-btn" href="${escapeHtml(downloadUrl)}">\n`;
      inner += `            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>\n`;
      inner += `            ダウンロード（${escapeHtml(meta.assetName)}）\n`;
      inner += `          </a>\n`;
      inner += `        </div>\n`;
    }
    inner += '        ';
  }

  const newHtml = before + inner + after;
  writeFileSync(MANUAL_HTML_PATH, newHtml);
  log(`  ✓ trading-manual.html を更新 (${allMeta.length}件)`);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================================================
// ユーティリティ
// =============================================================================

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
}

// =============================================================================
// 実行
// =============================================================================

main().catch(err => {
  log(`❌ エラー: ${err.message}`);
  console.error(err);
  process.exit(1);
});
