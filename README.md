# mtg_combine

Google Apps Script（GAS）で動作する、議事録ドキュメントの自動集約ツールです。

## 概要

指定したGoogle Driveフォルダを定期監視し、特定の命名規則を持つGoogleドキュメントから`summary(original)`セクションの内容を抽出して、集約ドキュメントへ自動転記します。

```
[監視フォルダ] → ファイル名フィルタ → [summary(original)セクション抽出] → [集約ドキュメントへ転記]
                                                                              ↓
                                                               [処理済みIDをスプレッドシートに記録]
```

## 機能

- **定期監視**: 時間主導型トリガーによるフォルダの自動監視
- **フィルタリング**: ファイル名に特定文字列を含むGoogleドキュメントのみ対象
- **重複排除**: 処理済みドキュメントIDをスプレッドシートに記録し、二重転記を防止
- **構造保持**: 見出し・リスト・テーブル・画像などのドキュメント要素を保持して転記
- **ハイパーリンク付与**: 転記時に元ドキュメントへのリンクを自動付与
- **見出しレベル変換**: 見出し4 → 標準テキスト（太字・下線）に自動変換

## ファイル構成

```
mtg_combine/
├── .clasp.json        # claspプロジェクト設定（スクリプトIDなど）
├── appsscript.json    # GASマニフェスト（タイムゾーン・ランタイム設定）
└── コード.js          # メインスクリプト
```

## 設定項目

`コード.js` 冒頭の設定項目を環境に合わせて変更してください。

| 変数名 | 説明 |
|---|---|
| `sourceFolderId` | 監視対象のGoogle DriveフォルダID |
| `targetDocId` | 内容を転記する集約GoogleドキュメントID |
| `fileNameFilter` | 対象ファイルの名前に含まれるキーワード（例: `TRG様`） |
| `processedDocsSheetId` | 処理済みID管理スプレッドシートのID |
| `sheetName` | 管理シートのシート名 |
| `targetHeadingText` | 抽出対象の見出しテキスト（デフォルト: `summary(original)`） |

## セットアップ

### 前提条件

- Node.js（最新LTS推奨）
- [clasp](https://github.com/google/clasp) v3.x

```bash
npm install -g @google/clasp
```

### ローカル環境構築

```bash
# 1. Google アカウントでログイン
clasp login

# 2. リポジトリをクローン
git clone https://github.com/rossoandoy/mtg_combine.git
cd mtg_combine

# 3. GASプロジェクトへのコード反映
clasp push
```

### トリガー設定

GASエディタ（または clasp）からトリガーを設定します。

```
関数: processFilteredSummaryDocsWithLink
トリガーのタイプ: 時間主導型
種類: 時間ベースのタイマー（例: 1時間ごと）
```

## 開発フロー

```bash
# ローカルで編集後、GASへ反映
clasp push

# GASの最新をローカルに取得
clasp pull

# GASエディタをブラウザで開く
clasp open
```

## 関連リソース

- [Google Apps Script ドキュメント](https://developers.google.com/apps-script)
- [clasp GitHub](https://github.com/google/clasp)
