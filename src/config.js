/**
 * config.js
 * =========
 * このスクリプトを別プロジェクトに転用する際は、このファイルの値だけを変更してください。
 * main.js のロジックは変更不要です。
 */

// eslint-disable-next-line no-unused-vars
const CONFIG = {
  /** 新しいドキュメントが作成される監視フォルダのID */
  sourceFolderId: '1bkeM7eB_Qbvtb0lpfiHiscnlrZpBctIt',

  /** summaryを集約する既存Googleドキュメントのid */
  targetDocId: '1XnirprVgY7rnHRo0kLKglPYZlE2jffhWMAst4D5XjjE',

  /**
   * 処理対象とするファイル名フィルタキーワード
   * ファイル名にこの文字列が含まれるGoogleドキュメントのみ対象になります
   * 例: '議事録', '報告書', 'TRG様'
   */
  fileNameFilter: 'TRG様',

  /** 処理済みドキュメントIDを記録するスプレッドシートのID */
  processedDocsSheetId: '1-i-GEO_6DaAbNkyC8nMbqllV_AEmNvRF2g0lgeTchyM',

  /** 処理済みID管理シートのシート名 */
  sheetName: '転記の自動化_TRG',

  /**
   * 抽出対象となる見出しのテキスト（完全一致）
   * この見出し以降・同レベル以上の次の見出しまでの内容が抽出されます
   */
  targetHeadingText: 'summary(original)',
};
