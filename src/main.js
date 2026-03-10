/**
 * main.js
 * =======
 * 時間主導型トリガーから呼び出されるメイン関数。
 * 設定値は config.js の CONFIG オブジェクトで管理します。
 *
 * 処理フロー:
 * 1. 監視フォルダ内のGoogleドキュメントを列挙
 * 2. ファイル名フィルタ＋未処理チェックで対象を絞り込む
 * 3. 各ドキュメントから targetHeadingText セクションを抽出
 * 4. 集約ドキュメントの先頭へ転記（最新が上に積み上がる）
 * 5. 処理済みIDをスプレッドシートに記録
 */

/**
 * エントリポイント。トリガーに登録する関数。
 */
function processFilteredSummaryDocsWithLink() {
  const targetHeadingLevel = DocumentApp.ParagraphHeading.HEADING1;

  try {
    const sourceFolder = DriveApp.getFolderById(CONFIG.sourceFolderId);
    const targetDoc    = DocumentApp.openById(CONFIG.targetDocId);
    const spreadsheet  = SpreadsheetApp.openById(CONFIG.processedDocsSheetId);
    const sheet        = spreadsheet.getSheetByName(CONFIG.sheetName)
                         || spreadsheet.insertSheet(CONFIG.sheetName);

    // 処理済みIDをSetに読み込む（APIコール削減のため一括取得）
    const processedIds = loadProcessedIds_(sheet);

    let processedCount = 0;
    const files = sourceFolder.getFiles();

    while (files.hasNext()) {
      const file     = files.next();
      const fileId   = file.getId();
      const fileName = file.getName();
      const fileUrl  = file.getUrl();

      // 対象外スキップ: Googleドキュメント以外 / フィルタ不一致 / 処理済み
      if (file.getMimeType() !== MimeType.GOOGLE_DOCS
          || !fileName.includes(CONFIG.fileNameFilter)
          || processedIds.has(fileId)) {
        continue;
      }

      Logger.log(`対象ドキュメントを発見: ${fileName} (ID: ${fileId})`);

      const srcDoc  = DocumentApp.openById(fileId);
      const srcBody = srcDoc.getBody();

      const extracted = extractSection_(srcBody, CONFIG.targetHeadingText, targetHeadingLevel);
      srcDoc.saveAndClose();

      if (extracted.length === 0) {
        Logger.log(`スキップ: 「${CONFIG.targetHeadingText}」セクションが見つかりません → ${fileName}`);
        continue;
      }

      // 集約ドキュメントへ転記（先頭に追記 = 最新が上）
      prependToDoc_(targetDoc.getBody(), fileName, fileUrl, extracted);
      targetDoc.saveAndClose();

      // 処理済みとしてスプレッドシートに記録
      sheet.appendRow([fileId, fileName, new Date()]);
      processedIds.add(fileId);
      processedCount++;

      Logger.log(`転記完了: ${fileName}`);

      // 次のファイルのために再度開く（saveAndClose後は再オープンが必要）
      if (files.hasNext()) {
        var reopened = DocumentApp.openById(CONFIG.targetDocId);
        // ループ内変数を更新する代わりに、末尾の prependToDoc_ 呼び出しで毎回openするよう変更済み
      }
    }

    Logger.log(processedCount === 0
      ? '新しい対象ドキュメントはありませんでした。'
      : `処理完了: ${processedCount} 件`);

  } catch (e) {
    Logger.log('エラーが発生しました: ' + e.message + '\n' + e.stack);
  }
}


// ─── プライベート関数（_ サフィックスで区別） ─────────────────────────────

/**
 * スプレッドシートから処理済みIDのSetを返す
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Set<string>}
 */
function loadProcessedIds_(sheet) {
  const ids = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    sheet.getRange(1, 1, lastRow, 1).getValues().forEach(row => {
      if (row[0]) ids.add(row[0]);
    });
  }
  return ids;
}

/**
 * ドキュメントボディから指定見出し配下のセクションを抽出して返す
 * @param {GoogleAppsScript.Document.Body} body
 * @param {string} headingText  抽出開始となる見出しテキスト（完全一致）
 * @param {GoogleAppsScript.Document.ParagraphHeading} headingLevel  見出しレベル
 * @returns {GoogleAppsScript.Document.Element[]}  コピーされた要素の配列
 */
function extractSection_(body, headingText, headingLevel) {
  const elements = [];
  let inSection = false;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const child = body.getChild(i);

    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      const para        = child.asParagraph();
      const paraHeading = para.getHeading();

      // 対象見出しを発見 → 抽出開始
      if (!inSection
          && paraHeading === headingLevel
          && para.getText().trim() === headingText) {
        inSection = true;
        continue; // 見出し行自体は含めない
      }

      // 同レベル以上の次の見出しを発見 → 抽出終了
      if (inSection
          && paraHeading !== DocumentApp.ParagraphHeading.NORMAL
          && paraHeading <= headingLevel) {
        break;
      }
    }

    if (inSection) {
      elements.push(child.copy());
    }
  }

  return elements;
}

/**
 * 集約ドキュメントの先頭にセクションを挿入する
 * （毎回先頭挿入するため、最後に処理したドキュメントが最上部に来る）
 *
 * 挿入後のドキュメント構造（先頭から）:
 * ─────────────────────────────
 * [H1] ファイル名
 * [リンク] 元ドキュメントURL
 * （空行）
 * [抽出コンテンツ: 段落 / リスト / テーブル / 画像]
 * （空行）
 * ─────────────────────────（水平線）
 * （空行）
 * ... 前回以前のエントリ ...
 * ─────────────────────────────
 *
 * @param {GoogleAppsScript.Document.Body} body
 * @param {string} fileName
 * @param {string} fileUrl
 * @param {GoogleAppsScript.Document.Element[]} elements
 */
function prependToDoc_(body, fileName, fileUrl, elements) {
  let idx = 0;

  // 既存コンテンツがある場合は先頭にセパレータを入れる
  if (body.getNumChildren() > 0 && body.getText().trim() !== '') {
    body.insertParagraph(idx, '');
    idx++;
  }

  // ファイル名を見出し1として挿入
  body.insertParagraph(idx, fileName)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  idx++;

  // 元ドキュメントへのリンク
  const linkPara = body.insertParagraph(idx, fileUrl);
  linkPara.setLinkUrl(fileUrl);
  linkPara.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  idx++;

  // 空行
  body.insertParagraph(idx, '');
  idx++;

  // 抽出要素を逆順で同一インデックスに挿入（= 元の順序で積み上がる）
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    insertElement_(body, idx, el);
  }

  // フッター: 空行 → 水平線 → 空行
  const endIdx = idx + elements.length;
  body.insertParagraph(endIdx,     '');
  body.insertHorizontalRule(endIdx + 1);
  body.insertParagraph(endIdx + 2, '');
}

/**
 * 要素タイプに応じてボディに挿入する
 * ※ 見出し4はNORMAL + 太字・下線に変換して挿入
 * @param {GoogleAppsScript.Document.Body} body
 * @param {number} index
 * @param {GoogleAppsScript.Document.Element} el
 */
function insertElement_(body, index, el) {
  const type = el.getType();

  if (type === DocumentApp.ElementType.PARAGRAPH) {
    const para = el.asParagraph().copy();
    // 見出し4 → 標準テキスト（太字・下線）に変換
    if (para.getHeading() === DocumentApp.ParagraphHeading.HEADING4) {
      para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      para.setBold(true);
      para.setUnderline(true);
    }
    body.insertParagraph(index, para);
  } else if (type === DocumentApp.ElementType.TABLE) {
    body.insertTable(index, el.asTable());
  } else if (type === DocumentApp.ElementType.LIST_ITEM) {
    body.insertListItem(index, el.asListItem());
  } else if (type === DocumentApp.ElementType.INLINE_IMAGE) {
    body.insertImage(index, el.asInlineImage());
  }
  // 対応外タイプはスキップ
}
