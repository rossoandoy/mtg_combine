# mtg_combine

Google Apps Script（GAS）で動作する、**議事録ドキュメントの自動集約ツール**です。
指定フォルダを定期監視し、特定の見出しセクションを抽出して集約ドキュメントへ自動転記します。

---

## 目次

1. [仕組みの概要](#仕組みの概要)
2. [転記フロー詳細](#転記フロー詳細)
3. [ファイル構成](#ファイル構成)
4. [セットアップ手順](#セットアップ手順)
5. [転用・カスタマイズ方法](#転用カスタマイズ方法)
6. [トリガー設定](#トリガー設定)
7. [開発フロー（clasp）](#開発フローclasp)
8. [トラブルシューティング](#トラブルシューティング)

---

## 仕組みの概要

```
【監視フォルダ】
     ↓ ファイル名フィルタ（例: "TRG様"を含む）
     ↓ Googleドキュメントのみ
     ↓ 未処理のもののみ（スプレッドシートで管理）
【各ドキュメント】
     ↓ 指定見出し「summary(original)」以降のセクションを抽出
【集約ドキュメント】← 先頭に転記（最新が上に積み上がる）
【管理スプレッドシート】← 処理済みIDを記録（再実行時の重複防止）
```

必要なGoogleリソースは4つです：

| リソース | 用途 |
|---|---|
| 監視フォルダ（Google Drive） | 議事録ドキュメントが生成・配置される場所 |
| 各議事録ドキュメント | summaryを抽出する元ファイル |
| 集約ドキュメント | 全議事録のsummaryを集める場所 |
| 管理スプレッドシート | 処理済みIDの記録・重複防止 |

---

## 転記フロー詳細

### 1. 抽出ロジック

元ドキュメントを先頭から走査し、`summary(original)`（見出し1）を発見した時点から抽出を開始します。
**同レベル以上の次の見出し（見出し1）が出現するまで**が抽出範囲です。

```
元ドキュメントの構造例:
─────────────────────────────
# 議事録タイトル        ← H1（対象外）
## 参加者              ← H2（対象外）
# summary(original)   ← H1 ★ここから抽出開始
  通常テキスト
  - リスト項目
  #### 小見出し        ← H4（→ 太字・下線に変換して転記）
  | テーブル |
# 次のセクション       ← H1 ★ここで抽出終了
─────────────────────────────
```

対応している要素タイプ：
- 段落（通常テキスト・見出し）
- リスト（箇条書き・番号付き）
- テーブル
- インライン画像
- ※ 見出し4（H4）のみ → 標準テキスト（太字・下線）に変換

### 2. 集約ドキュメントへの転記構造

新しいsummaryは常に**先頭に追記**されます。複数回実行されると最新のものが上に積み上がります。

```
集約ドキュメントの構造（実行後）:
─────────────────────────────────────────
# ファイル名（最新）                         ← H1（ファイル名）
https://docs.google.com/...               ← 元ドキュメントへのリンク
（空行）
抽出されたsummaryの内容...
（空行）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━（水平線）
（空行）
# ファイル名（前回）
https://docs.google.com/...
...
─────────────────────────────────────────
```

### 3. 重複防止の仕組み

実行のたびに管理スプレッドシートのA列を読み込み、処理済みのドキュメントIDをSetに格納します。
すでに処理済みのIDはスキップされるため、トリガーが複数回実行されても重複転記しません。

管理シートの構造：

| A列（ドキュメントID） | B列（ファイル名） | C列（処理日時） |
|---|---|---|
| 1ABC...xyz | 2024-01-15_TRG様議事録 | 2024/01/15 10:00:00 |

---

## ファイル構成

```
mtg_combine/
├── .clasp.json          # claspプロジェクト設定（スクリプトID・rootDir指定）
├── .gitignore
├── README.md
└── src/                 # GASへpushされるファイル群（rootDir）
    ├── appsscript.json  # GASマニフェスト（タイムゾーン・権限・ランタイム）
    ├── config.js        # ★設定値のみ（転用時はここだけ変更）
    └── main.js          # 処理ロジック（通常変更不要）
```

**なぜ `src/` を分けているか**
`rootDir: "src"` とすることで、`clasp push` 時に `src/` 配下のみがGASへ送信されます。
README・`.gitignore` などローカル管理用のファイルがGASプロジェクトに混入するのを防ぎます。

---

## セットアップ手順

### 前提条件

- Google アカウント（G Suite / Google Workspace または 個人）
- Node.js v18 以上
- clasp v3.x

```bash
npm install -g @google/clasp
```

### 手順

**① Google認証**

```bash
clasp login
```

ブラウザが起動しGoogleアカウントでの認証を求められます。

**② リポジトリをクローン**

```bash
git clone https://github.com/rossoandoy/mtg_combine.git
cd mtg_combine
```

**③ 設定値を編集**

`src/config.js` を開き、自分の環境のIDに書き換えます（[設定値の取得方法](#設定値の取得方法)参照）。

```javascript
const CONFIG = {
  sourceFolderId:       'YOUR_FOLDER_ID',
  targetDocId:          'YOUR_TARGET_DOC_ID',
  fileNameFilter:       'TRG様',         // 対象ファイル名に含まれるキーワード
  processedDocsSheetId: 'YOUR_SHEET_ID',
  sheetName:            '転記の自動化_TRG',
  targetHeadingText:    'summary(original)',
};
```

**④ GASへデプロイ**

```bash
clasp push
```

**⑤ トリガーを設定**（[トリガー設定](#トリガー設定)参照）

### 設定値の取得方法

| 値 | 取得方法 |
|---|---|
| フォルダID | Google DriveでフォルダURLの `folders/` 以降の文字列 |
| ドキュメントID | Google DocsのURLの `/d/` と `/edit` の間の文字列 |
| スプレッドシートID | Google SheetsのURLの `/d/` と `/edit` の間の文字列 |

例: `https://docs.google.com/document/d/`**`1ABC...xyz`**`/edit`

---

## 転用・カスタマイズ方法

このスクリプトは `config.js` の値を変えるだけで別プロジェクトに転用できます。

### 別のクライアント・プロジェクト向けに使う

```javascript
// src/config.js を以下のように変更するだけ
const CONFIG = {
  sourceFolderId:       '新しいフォルダのID',
  targetDocId:          '新しい集約ドキュメントのID',
  fileNameFilter:       '山田株式会社',    // ← 対象クライアント名に変更
  processedDocsSheetId: '新しいスプレッドシートのID',
  sheetName:            '転記の自動化_山田',
  targetHeadingText:    'summary(original)',
};
```

### 抽出する見出しセクションを変える

```javascript
targetHeadingText: 'アクションアイテム',  // 「アクションアイテム」セクションを抽出
```

対象の見出しテキストは**完全一致**です。スペースや大文字小文字に注意してください。

### 見出し4の変換ルールを変えたい場合

`src/main.js` の `insertElement_` 関数内を編集します：

```javascript
// 現状: 見出し4 → 太字・下線
if (para.getHeading() === DocumentApp.ParagraphHeading.HEADING4) {
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  para.setBold(true);
  para.setUnderline(true);
}

// 変更例: 見出し3 → 太字のみ
if (para.getHeading() === DocumentApp.ParagraphHeading.HEADING3) {
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  para.setBold(true);
}
```

---

## トリガー設定

GASのトリガーは **GASエディタのUI** または **clasp** から設定できます。

### GASエディタから設定する場合

1. `clasp open` でGASエディタをブラウザで開く
2. 左メニュー「トリガー」→「トリガーを追加」
3. 以下のように設定：

| 項目 | 値 |
|---|---|
| 実行する関数 | `processFilteredSummaryDocsWithLink` |
| イベントのソース | 時間主導型 |
| 時間ベースのトリガーのタイプ | 時間ベースのタイマー |
| 時間の間隔 | 1時間ごと（または任意の間隔） |

### 推奨設定

- **監視頻度**: 議事録の生成頻度に合わせて設定（例: 1時間ごと〜1日1回）
- **失敗時の通知**: 「エラー通知の設定」でメール通知を有効にしておくことを推奨

---

## 開発フロー（clasp）

```bash
# ローカルで編集した内容をGASへ反映
clasp push

# GASの最新をローカルに取得（手動でエディタ編集した場合）
clasp pull

# GASエディタをブラウザで開く
clasp open

# 実行ログをターミナルで確認
clasp logs

# 動作確認（ドライラン）
clasp run processFilteredSummaryDocsWithLink
```

### ローカル開発のポイント

- **設定値の変更は `src/config.js` のみ** に留めることで、`main.js` を共通ライブラリとして維持できます
- `clasp push` 前に `src/` 配下のファイルのみ変更されていることを確認してください
- `filePushOrder: ["config.js", "main.js"]` により、GAS実行時に `config.js`（`CONFIG` 定義）が先に読み込まれます

---

## トラブルシューティング

### `summary(original)` が見つからないと言われる

元ドキュメントの見出しテキストを確認してください。
前後のスペースや全角/半角の違いで一致しない場合があります。

### 同じドキュメントが何度も処理される

管理スプレッドシートのシート名（`sheetName`）が `config.js` の設定と一致しているか確認してください。

### `clasp push` でエラーが出る

```bash
clasp login  # 再認証
clasp push
```

認証トークンの期限切れが原因の場合は再ログインで解決します。

### 権限エラー（GAS実行時）

GASスクリプトは初回実行時に権限の承認が必要です。
`clasp open` でGASエディタを開き、手動で一度実行して権限を承認してください。

---

## 関連リソース

- [Google Apps Script ドキュメント](https://developers.google.com/apps-script)
- [clasp GitHub](https://github.com/google/clasp)
- [GAS DocumentApp リファレンス](https://developers.google.com/apps-script/reference/document/document-app)
