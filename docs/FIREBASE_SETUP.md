# Firebase セットアップ手順書

TheOption Trend Analyzer のライセンス認証システムをセットアップするための手順です。

## 所要時間
約15分

---

## ステップ1: Firebaseプロジェクトの作成

1. **Firebaseコンソールにアクセス**
   - https://console.firebase.google.com にアクセス
   - Googleアカウントでログイン

2. **プロジェクトを追加**
   - 「プロジェクトを追加」をクリック
   - プロジェクト名を入力（例: `theoption-license`）
   - 「続行」をクリック

3. **Google アナリティクス**
   - 「今は設定しない」を選択
   - 「プロジェクトを作成」をクリック

4. **プロジェクト作成完了**
   - 1〜2分待つ
   - 「続行」をクリック

---

## ステップ2: Firestore Database の作成

1. **左メニューから「Firestore Database」を選択**

2. **「データベースの作成」をクリック**

3. **セキュリティルールの選択**
   - 「**本番環境モード**」を選択
   - 「次へ」をクリック

4. **ロケーションの選択**
   - `asia-northeast1 (Tokyo)` を選択
   - 「有効にする」をクリック

5. **データベース作成完了**
   - 数秒待つとデータベースが作成されます

---

## ステップ3: Firestore Security Rules の設定

1. **「ルール」タブをクリック**

2. **以下のルールをコピー＆ペースト**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // licensesコレクションは読み取り専用（拡張機能から）
    match /licenses/{licenseKey} {
      allow read: if true;  // 誰でも読み取り可能（ライセンス検証のため）
      allow write: if false; // 書き込みは禁止（管理画面からのみ）
    }
  }
}
```

3. **「公開」をクリック**

---

## ステップ4: Web API キーの取得

1. **左メニューから「プロジェクトの設定」⚙️ をクリック**

2. **「全般」タブで下にスクロール**

3. **「ウェブ API キー」をコピー**
   - 例: `AIzaSyCuPbyOoP3-ILBBNLzx70ox2grmgjhknEQ`

4. **「プロジェクト ID」もコピー**
   - 例: `theoption-license`

---

## ステップ5: 拡張機能に設定を適用

1. **`license-manager.js` ファイルを開く**

2. **以下の部分を書き換える**

```javascript
const FIREBASE_CONFIG = {
  projectId: 'YOUR_PROJECT_ID',  // ← ここをコピーしたプロジェクトIDに置き換え
  apiKey: 'YOUR_API_KEY'         // ← ここをコピーしたWeb API キーに置き換え
};
```

**例:**
```javascript
const FIREBASE_CONFIG = {
  projectId: 'theoption-license',
  apiKey: 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
};
```

3. **ファイルを保存**

---

## ステップ6: テスト用ライセンスキーの作成

1. **Firebaseコンソールで「Firestore Database」を開く**

2. **「コレクションを開始」をクリック**

3. **コレクションIDを入力**
   - コレクションID: `licenses`
   - 「次へ」をクリック

4. **最初のドキュメントを作成**
   - ドキュメントID: `TEST-1234-5678-9ABC` （テスト用ライセンスキー）
   - フィールドを追加:
     - フィールド名: `active`, 型: `boolean`, 値: `true`
     - フィールド名: `userName`, 型: `string`, 値: `テストユーザー`
     - フィールド名: `maxDevices`, 型: `number`, 値: `1`
     - フィールド名: `expiryDate`, 型: `timestamp`, 値: （1年後の日付を選択）
   - 「保存」をクリック

---

## ステップ7: 動作確認

1. **Chrome拡張機能をリロード**
   - `chrome://extensions` を開く
   - 「TheOption Trend Analyzer」の「更新」ボタンをクリック

2. **TheOptionのトレーディング画面を開く**
   - https://jp.theoption.com/trading

3. **ライセンス入力ダイアログが表示される**
   - テスト用ライセンスキー `TEST-1234-5678-9ABC` を入力
   - 「アクティベート」をクリック

4. **認証成功！**
   - 「✓ 認証成功！」と表示される
   - 拡張機能が正常に動作する

---

## ライセンスキーの発行方法

### 方法1: Firebaseコンソールで手動作成（推奨）

1. **Firestore Database を開く**
2. **`licenses` コレクションを選択**
3. **「ドキュメントを追加」をクリック**
4. **ドキュメントIDにライセンスキーを入力**
   - 例: `THEO-A1B2-C3D4-E5F6`
   - 形式は自由ですが、ユニークにすること
5. **フィールドを追加:**
   - `active`: `true` （boolean）
   - `userName`: 購入者名 （string）
   - `maxDevices`: `1` （number）
   - `expiryDate`: 有効期限 （timestamp、省略可）
6. **「保存」をクリック**
7. **購入者にライセンスキーを送る**

### 方法2: 管理ツールを使用（より簡単）

`license-admin.html` を開いて、フォームから簡単にライセンスキーを発行できます。
詳細は次のステップで説明します。

---

## セキュリティ上の注意

### ✅ 安全な設定
- Firestore Security Rules で書き込みを禁止している
- Web API キーは公開されても問題なし（読み取り専用のため）

### ⚠️ 注意事項
- **ライセンスキーは推測されにくいものにする**
  - ランダムな文字列を使用
  - 例: `THEO-A1B2-C3D4-E5F6` （16文字以上推奨）
- **不正使用が見つかったらすぐに無効化**
  - Firebaseコンソールで `active` を `false` に変更

---

## 料金について

### Sparkプラン（無料）の制限
- **ドキュメント読み取り:** 50,000回/日まで無料
- **ストレージ:** 1GB まで無料

### 想定コスト
- **ユーザー数100人、1日1回再検証の場合:**
  - 読み取り回数: 100回/日
  - **完全無料**

- **ユーザー数1000人の場合:**
  - 読み取り回数: 1000回/日
  - **完全無料**

無料枠を超える可能性はほぼゼロです。

---

## トラブルシューティング

### エラー: 「ライセンスキーが見つかりません」
- Firestoreでライセンスキーが正しく作成されているか確認
- ドキュメントIDが入力したライセンスキーと一致しているか確認

### エラー: 「このライセンスキーは無効化されています」
- Firestoreで `active` フィールドが `true` になっているか確認

### エラー: 「検証エラー」
- `license-manager.js` の FIREBASE_CONFIG が正しく設定されているか確認
- インターネット接続を確認

---

## 次のステップ

次は「ライセンスキー管理ツール」を使って、簡単にライセンスキーを発行・管理する方法を説明します。

`license-admin.html` ファイルを確認してください。
