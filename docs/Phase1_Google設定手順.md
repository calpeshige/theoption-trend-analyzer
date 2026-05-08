# Phase 1: Google Cloud / Drive 受信基盤の構築

## 目的

拡張機能からアップロードされるバックアップデータを受信する仕組みを作る。
具体的には:
- Google Drive にデータ受信用フォルダを作成
- Google Apps Script で Webhook（受信用URL）を作成
- Google Cloud でサービスアカウントを作成（後でGitHub Actionsから使用）
- GitHub Secrets に認証情報を登録

## 完了の判定基準

✅ Webhook URL が取得できている
✅ curl でテスト送信すると Drive にファイルが作られる
✅ Service Account の JSON キーがダウンロードできている
✅ GitHub Secrets に2つのシークレットが登録されている

## 所要時間: 約30〜45分

---

## ステップ 1: Google Drive に受信用フォルダを作成

### 1-1. Drive を開く
ブラウザで https://drive.google.com を開く（gmail と同じアカウントでログイン）

### 1-2. フォルダ作成
1. 左上「**+ 新規**」ボタンをクリック
2. 「**新しいフォルダ**」を選択
3. フォルダ名: `TheOption-Uploads` と入力
4. 「作成」をクリック

### 1-3. フォルダIDをコピー
1. 作成した `TheOption-Uploads` フォルダをダブルクリックして開く
2. ブラウザのアドレスバーを確認:
   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz123456
                                            ↑ この部分がフォルダID
   ```
3. `folders/` の後の文字列（例: `1AbCdEfGhIjKlMnOpQrStUvWxYz123456`）をコピー

### 1-4. メモする
以下のような形でメモしておく:
```
DRIVE_FOLDER_ID = 1AbCdEfGhIjKlMnOpQrStUvWxYz123456
```

---

## ステップ 2: Google Apps Script Webhook の作成

### 2-1. Apps Script を開く
ブラウザで https://script.google.com を開く

### 2-2. 新規プロジェクト作成
1. 左上「**+ 新しいプロジェクト**」をクリック
2. しばらく待つとエディタ画面が開く

### 2-3. プロジェクト名を変更
1. 画面上部の「無題のプロジェクト」をクリック
2. 名前を `TheOption Data Receiver` に変更
3. 「OK」または「名前を変更」をクリック

### 2-4. コードを貼り付け
1. デフォルトで `function myFunction() {}` のような空のコードがある
2. すべて削除（Ctrl+A → Delete）
3. 以下のコードを貼り付け:

```javascript
const FOLDER_ID = 'ここにステップ1-3でコピーしたフォルダIDを貼り付け';
const MAX_CHUNK_SIZE = 40 * 1024 * 1024; // 40MB（安全マージン込み）

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);

    // 必須パラメータチェック
    if (!params.uploadId || params.chunkIndex === undefined || !params.totalChunks || !params.assetName || !params.dataBase64) {
      return jsonResponse({ success: false, error: 'Missing required parameters' });
    }

    // サイズチェック
    const decodedSize = (params.dataBase64.length * 3) / 4;
    if (decodedSize > MAX_CHUNK_SIZE) {
      return jsonResponse({ success: false, error: 'Chunk too large (max 40MB)' });
    }

    // ファイル名: {uploadId}_chunk_{0001}_of_{0017}_{ASSETNAME}.bin
    const filename = `${params.uploadId}_chunk_${String(params.chunkIndex).padStart(4, '0')}_of_${String(params.totalChunks).padStart(4, '0')}_${params.assetName.replace('/', '')}.bin`;

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(
      Utilities.base64Decode(params.dataBase64),
      'application/octet-stream',
      filename
    );

    const file = folder.createFile(blob);
    return jsonResponse({
      success: true,
      filename: filename,
      fileId: file.getId(),
      size: decodedSize
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// テスト用: ブラウザでアクセスした時の動作確認用
function doGet(e) {
  return ContentService
    .createTextOutput('TheOption Data Receiver is running. Use POST to upload.')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

4. **重要**: 1行目の `'ここに...貼り付け'` を、ステップ1-3でコピーした実際のフォルダIDに置き換える
   - 例: `const FOLDER_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz123456';`

### 2-5. 保存
1. Ctrl+S または「💾 プロジェクトを保存」アイコンをクリック
2. 上部に「保存しました」と表示されることを確認

### 2-6. デプロイ（公開）
1. 画面右上の「**デプロイ**」ボタンをクリック
2. 「**新しいデプロイ**」を選択
3. 左側の「種類の選択」横の歯車アイコン⚙ をクリック
4. 「**ウェブアプリ**」を選択
5. 設定項目を以下のように入力:
   - **説明**: `Initial deployment`（任意）
   - **次のユーザーとして実行**: `自分（あなたのメールアドレス）`
   - **アクセスできるユーザー**: `**全員**` ← 重要！
6. 「**デプロイ**」ボタンをクリック

### 2-7. 初回承認
1. 「アクセスを承認」ダイアログが出る
2. 「アクセスを承認」をクリック
3. Googleアカウント選択画面 → アカウントを選択
4. 「**このアプリは Google で確認されていません**」という警告が出る
5. 「**詳細**」をクリック
6. 「**TheOption Data Receiver（安全ではないページ）に移動**」をクリック
7. 「許可」をクリック

これは自分のアカウントで自分のスクリプトを承認しているだけなので、安全です。

### 2-8. Webhook URL をコピー
1. デプロイ完了後、画面に表示される「**ウェブアプリ**」の URL をコピー
2. 形式: `https://script.google.com/macros/s/AKfycbXXXXXXXXXXXX/exec`
3. これが **Webhook URL** です

### 2-9. メモする
```
WEBHOOK_URL = https://script.google.com/macros/s/AKfycbXXXXXXXXXXXX/exec
```

---

## ステップ 3: Webhook の動作テスト

### 3-1. ブラウザで GET アクセス確認
ブラウザに先ほどの WEBHOOK_URL を貼り付けてアクセス。
以下が表示されればOK:
```
TheOption Data Receiver is running. Use POST to upload.
```

### 3-2. ターミナルで POST テスト
以下のコマンドをターミナルで実行（WEBHOOK_URLは自分のものに置換）:

```bash
curl -X POST 'https://script.google.com/macros/s/AKfycbXXXXXXXXXXXX/exec' \
  -H 'Content-Type: application/json' \
  -d '{
    "uploadId": "test_upload_001",
    "chunkIndex": 0,
    "totalChunks": 1,
    "assetName": "USDJPY",
    "dataBase64": "SGVsbG8gV29ybGQh"
  }'
```

### 3-3. 期待される結果

ターミナルの出力:
```json
{"success":true,"filename":"test_upload_001_chunk_0000_of_0001_USDJPY.bin","fileId":"xxxxx","size":12}
```

### 3-4. Drive で確認
1. https://drive.google.com を開く
2. `TheOption-Uploads` フォルダを開く
3. `test_upload_001_chunk_0000_of_0001_USDJPY.bin` というファイルが作成されていれば成功 ✅

### 3-5. テストファイルを削除
動作確認できたら、テストファイルは削除してもOK。

---

## ステップ 4: Google Cloud サービスアカウント作成（GitHub Actions用）

### 4-1. Google Cloud Console を開く
ブラウザで https://console.cloud.google.com を開く

### 4-2. 新規プロジェクト作成
1. 上部のプロジェクト選択ドロップダウンをクリック
2. 「**新しいプロジェクト**」をクリック
3. プロジェクト名: `theoption-data-curator`（任意）
4. 場所: そのまま（個人アカウントなら「組織なし」）
5. 「作成」をクリック
6. 30秒ほど待つ → 作成完了の通知が来たら、プロジェクト選択ドロップダウンで新しいプロジェクトを選択

### 4-3. Drive API を有効化
1. 左上のハンバーガーメニュー☰ → 「**APIとサービス**」 → 「**ライブラリ**」
2. 検索ボックスに `Google Drive API` と入力
3. 「**Google Drive API**」をクリック
4. 「**有効にする**」ボタンをクリック
5. 有効化されるまで数十秒待つ

### 4-4. サービスアカウント作成
1. 左上のハンバーガーメニュー☰ → 「**APIとサービス**」 → 「**認証情報**」
2. 上部の「**+ 認証情報を作成**」 → 「**サービスアカウント**」
3. 設定:
   - **サービスアカウント名**: `theoption-curator`
   - **サービスアカウント ID**: 自動入力されるのでそのまま
   - **説明**: `For curating community data` （任意）
4. 「**作成して続行**」
5. 「ロールを選択」: 「**閲覧者**」を選択（最低限の権限）
6. 「**続行**」 → 「**完了**」

### 4-5. JSONキーをダウンロード
1. 認証情報画面で、作成したサービスアカウントをクリック
2. 上部の「**キー**」タブをクリック
3. 「**鍵を追加**」 → 「**新しい鍵を作成**」
4. キーのタイプ: 「**JSON**」を選択
5. 「**作成**」をクリック
6. JSONファイルが自動ダウンロードされる（例: `theoption-data-curator-xxxxx.json`）
7. **このファイルは絶対に外部に公開しない！** デスクトップ等に保存

### 4-6. サービスアカウントのメールアドレスをコピー
1. 認証情報画面のサービスアカウント一覧
2. メールアドレス欄: `theoption-curator@theoption-data-curator.iam.gserviceaccount.com` のような形式
3. このメールアドレスをコピー

---

## ステップ 5: Drive フォルダをサービスアカウントに共有

### 5-1. Drive で共有設定
1. https://drive.google.com で `TheOption-Uploads` フォルダを右クリック
2. 「**共有**」を選択
3. ユーザーやグループを追加: ステップ4-6でコピーしたメールアドレスを貼り付け
4. 権限: 「**編集者**」を選択 ← 重要！（処理済みファイルの削除のため）
5. 「**通知を送信**」のチェックを**外す**（送信先がサービスアカウントなので不要）
6. 「**共有**」をクリック

これで GitHub Actions が Drive のファイルを読み取り・削除できるようになります。

---

## ステップ 6: GitHub Secrets に登録

### 6-1. GitHub リポジトリを開く
ブラウザで `https://github.com/calpeshige/theoption-releases` を開く（実際のリポジトリ名に応じて）

### 6-2. Secrets 設定画面へ
1. リポジトリページの「**Settings**」タブをクリック
2. 左サイドバーの「**Secrets and variables**」 → 「**Actions**」
3. 「**Repository secrets**」セクション

### 6-3. シークレット 1: Drive フォルダID
1. 「**New repository secret**」ボタンをクリック
2. **Name**: `DRIVE_FOLDER_ID`
3. **Secret**: ステップ1-3でコピーしたフォルダID（例: `1AbCdEfGhIjKlMnOpQrStUvWxYz123456`）
4. 「**Add secret**」をクリック

### 6-4. シークレット 2: サービスアカウントJSON
1. 「**New repository secret**」ボタンをクリック
2. **Name**: `GOOGLE_SERVICE_ACCOUNT_JSON`
3. **Secret**: ステップ4-5でダウンロードしたJSONファイルの**中身全体**を貼り付け
   - JSONファイルをテキストエディタで開く
   - すべてコピー（`{` から `}` まで全部）
   - そのまま貼り付け
4. 「**Add secret**」をクリック

### 6-5. 確認
Secrets画面に以下の2つが表示されていればOK:
- `DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

---

## ステップ 7: Webhook URL を Claude に共有

実装の Phase 2 で拡張機能のコードに Webhook URL を埋め込む必要があるため、
**ステップ 2-9 でメモした Webhook URL** を Claude（次のステップ）で使用します。

---

## ✅ Phase 1 完了チェックリスト

すべて完了したら、次のフェーズに進めます:

- [ ] Drive に `TheOption-Uploads` フォルダ作成済み
- [ ] フォルダ ID をメモ済み
- [ ] Apps Script プロジェクト作成済み
- [ ] コード貼り付け & 保存済み（FOLDER_ID 置換済み）
- [ ] ウェブアプリとしてデプロイ済み（全員アクセス可）
- [ ] Webhook URL をメモ済み
- [ ] curl テストでDriveにファイルが作成されることを確認
- [ ] Google Cloud プロジェクト作成済み
- [ ] Drive API 有効化済み
- [ ] サービスアカウント作成済み
- [ ] JSONキーをダウンロード済み（安全な場所に保管）
- [ ] サービスアカウントのメールアドレスをメモ済み
- [ ] Drive フォルダをサービスアカウントに「編集者」として共有済み
- [ ] GitHub Secrets に `DRIVE_FOLDER_ID` 登録済み
- [ ] GitHub Secrets に `GOOGLE_SERVICE_ACCOUNT_JSON` 登録済み

---

## トラブルシューティング

### Q1. 「アプリは Google で確認されていません」が出てデプロイできない
A. 「詳細」→「（安全でないページ）に移動」で進めば問題ない。自分のアカウントで自分のコードを実行する許可なので安全。

### Q2. curl テストで `success: false` が返る
A. 以下を確認:
- FOLDER_ID が正しく書き換えられているか
- Apps Script が保存後にデプロイされているか
- アクセス権限が「全員」になっているか
- フォルダ ID が間違っていないか（typoや余計な文字）

### Q3. curl テストで HTML が返ってくる
A. デプロイの「アクセスできるユーザー」が「全員」になっていない。再度デプロイ設定を確認。

### Q4. サービスアカウントのJSONを間違えてGitHubにそのままコミットしてしまった
A. 即座に以下を実施:
1. Google Cloud Console → サービスアカウント → 該当キーを削除
2. 新しいキーを作成し直し
3. GitHub Secrets を新しい内容で更新
4. リポジトリのコミット履歴からも該当ファイルを完全削除（git filter-branch等）

### Q5. Webhook URLを再発行したい
A. Apps Script の「デプロイの管理」→ 既存デプロイの編集 → 「新しいバージョン」を作成。URLは変わらない。

### Q6. Apps Script に変更を加えたが反映されない
A. コード変更後は再デプロイが必要:
- 「デプロイの管理」→ 編集鉛筆アイコン → バージョンを「新しいバージョン」 → デプロイ

---

## 次のステップ

Phase 1 が完了したら、**Phase 2: 拡張機能の自動バックアップ機能実装** に進みます。
Webhook URL を Claude に伝えると、コード実装が始まります。
