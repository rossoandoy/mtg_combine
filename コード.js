  /**
 * 時間主導型トリガーで実行され、特定のフォルダを定期的に監視します。
 * ファイル名に特定の文字列が含まれる新しいGoogleドキュメントを見つけ、
 * ドキュメント内の見出し1「summary(original)」の内容を抽出して転記します。
 * 転記する際は、ファイル名を見出し1とし、その下に元のドキュメントのURLをハイパーリンクで追加します。
 * 抽出内容中の見出し4は標準テキスト（太字・下線）に変換します。
 * 転記済みファイルのIDをスプレッドシートに記録し、重複転記を防ぎます。
 */
function processFilteredSummaryDocsWithLink() { // 関数名を再度変更しました
  
  // ① 設定項目: ここをあなたの環境に合わせて変更してください
  
  // 新しいドキュメントが作成されるフォルダのID
  const sourceFolderId = '1bkeM7eB_Qbvtb0lpfiHiscnlrZpBctIt';
  
  // 内容を転記する既存のGoogleドキュメントのID
  const targetDocId = '1XnirprVgY7rnHRo0kLKglPYZlE2jffhWMAst4D5XjjE';
  
  // ファイル名に含まれる特定の文字列 (例: '報告書', '議事録')
  const fileNameFilter = 'TRG様';
  
  // 転記済みドキュメントIDを記録するスプレッドシートのID
  const processedDocsSheetId = '1-i-GEO_6DaAbNkyC8nMbqllV_AEmNvRF2g0lgeTchyM';
  const sheetName = '転記の自動化_TRG'; // スプレッドシートのシート名（任意で変更可能）
  
  // 抽出対象の見出しテキストとそのレベル (元のドキュメントでのレベル)
  const targetHeadingText = 'summary(original)';
  const targetHeadingLevel = DocumentApp.ParagraphHeading.HEADING1; // 見出し1

  try {
    const sourceFolder = DriveApp.getFolderById(sourceFolderId);
    const files = sourceFolder.getFiles();
    const targetDoc = DocumentApp.openById(targetDocId);
    const targetDocBody = targetDoc.getBody();

    // 処理済みIDリストのスプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(processedDocsSheetId);
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);

    // 処理済みIDをメモリに読み込む (パフォーマンス向上のため)
    const processedIds = new Set();
    const lastRow = sheet.getLastRow();
    if (lastRow > 0) {
      const range = sheet.getRange(1, 1, lastRow, 1); // A列にIDが記録されていると仮定
      const values = range.getValues();
      values.forEach(row => processedIds.add(row[0]));
    }

    let processedCount = 0;

    while (files.hasNext()) {
      const file = files.next();
      const fileId = file.getId();
      const fileName = file.getName();
      const fileUrl = file.getUrl(); // ファイルのURLを取得

      // ② フィルタリングと重複チェック
      if (file.getMimeType() === MimeType.GOOGLE_DOCS &&
          fileName.includes(fileNameFilter) &&
          !processedIds.has(fileId)) {

        Logger.log(`新しい対象ドキュメントを発見しました: ${fileName} (ID: ${fileId})`);

        const newDoc = DocumentApp.openById(fileId);
        const newDocBody = newDoc.getBody();

        let foundTargetHeading = false;
        let extractedContentElements = []; // 抽出した要素を格納する配列

        // 新しいドキュメントから見出し「summary(original)」の内容を抽出
        for (let i = 0; i < newDocBody.getNumChildren(); i++) {
          const child = newDocBody.getChild(i);

          if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
            const paragraph = child.asParagraph();
            const headingType = paragraph.getHeading();

            if (!foundTargetHeading && headingType === targetHeadingLevel && paragraph.getText().trim() === targetHeadingText) {
              foundTargetHeading = true;
              continue; // 見出し自体は抽出しない
            }

            if (foundTargetHeading && headingType !== DocumentApp.ParagraphHeading.NORMAL && headingType <= targetHeadingLevel) {
                break;
            }
          }

          if (foundTargetHeading) {
            extractedContentElements.push(child.copy());
          }
        }

        if (extractedContentElements.length === 0) {
          Logger.log(`ドキュメント「${fileName}」には見出し「${targetHeadingText}」またはその後の内容が見つかりませんでした。`);
          newDoc.saveAndClose();
          continue; // 次のファイルへ
        }

        // ③ 転記先のドキュメントの先頭に挿入
        const targetDocBodyNumChildren = targetDocBody.getNumChildren();
        let insertIndex = 0;

        if (targetDocBodyNumChildren > 0 || targetDocBody.getText().trim() !== '') {
          targetDocBody.insertParagraph(insertIndex, '');
          insertIndex++;
        }

        // ドキュメントボディの先頭にファイル名を見出し1として挿入
        const fileHeading = targetDocBody.insertParagraph(insertIndex, fileName);
        fileHeading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        insertIndex++;

        // その直下に元のドキュメントのURLをハイパーリンクとして追加
        const urlParagraph = targetDocBody.insertParagraph(insertIndex, fileUrl);
        urlParagraph.setLinkUrl(fileUrl); // ★ 修正点: 引数を1つにしました
        urlParagraph.setHeading(DocumentApp.ParagraphHeading.NORMAL);
        insertIndex++;

        // ハイパーリンクと抽出内容の間に改行を追加
        targetDocBody.insertParagraph(insertIndex, '');
        insertIndex++;

        // 抽出したコンテンツ要素をターゲットドキュメントの先頭に挿入
        for (let i = extractedContentElements.length - 1; i >= 0; i--) {
          const child = extractedContentElements[i];
          
          if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
            const originalParagraph = child.asParagraph();
            const copiedParagraph = originalParagraph.copy();

            if (originalParagraph.getHeading() === DocumentApp.ParagraphHeading.HEADING4) {
              copiedParagraph.setHeading(DocumentApp.ParagraphHeading.NORMAL);
              copiedParagraph.setBold(true);
              copiedParagraph.setUnderline(true);
            }
            targetDocBody.insertParagraph(insertIndex, copiedParagraph);

          } else if (child.getType() === DocumentApp.ElementType.TABLE) {
            targetDocBody.insertTable(insertIndex, child.asTable());
          } else if (child.getType() === DocumentApp.ElementType.LIST_ITEM) {
            targetDocBody.insertListItem(insertIndex, child.asListItem());
          } else if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
            targetDocBody.insertImage(insertIndex, child.asInlineImage());
          }
        }

        // 転記された内容の末尾に区切り線を追加
        const endOfTransferredContentIndex = insertIndex + extractedContentElements.length;

        targetDocBody.insertParagraph(endOfTransferredContentIndex, '');
        targetDocBody.insertHorizontalRule(endOfTransferredContentIndex + 1);
        targetDocBody.insertParagraph(endOfTransferredContentIndex + 2, '');

        // ドキュメントを保存
        newDoc.saveAndClose();
        targetDoc.saveAndClose();

        // 処理済みIDをスプレッドシートに記録
        sheet.appendRow([fileId]);
        processedIds.add(fileId);
        processedCount++;
        Logger.log(`ドキュメント「${fileName}」から内容を抽出し、リンク付きで転記しました。`);
      }
    }
    if (processedCount === 0) {
      Logger.log('新しい対象ドキュメントは見つかりませんでした。');
    }
  } catch (error) {
    Logger.log('スクリプトの実行中にエラーが発生しました: ' + error.message);
  }
}