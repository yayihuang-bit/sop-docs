// ==============================
// 設定區
// ==============================
const OUTPUT_FOLDER_ID = '1qdBRQJ0M3rnOTVYoIuK2wYttMiM5jLF1';

// ==============================
// 開啟試算表時建立選單
// ==============================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⭐自動化工具⭐')
    .addItem('生成營運文案', 'generateDocuments')
    .addToUi();
}

// ==============================
// 主程式：批次生成文件
// 條件：D欄有值（打OK）且 A欄空白
// ==============================
function generateDocuments() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('在這生成文件');
  const lastRow = sheet.getLastRow();

  if (lastRow < 3) {
    SpreadsheetApp.getUi().alert('活動範本沒有資料');
    return;
  }

  const headers     = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allValues   = sheet.getRange(3, 1, lastRow - 2, sheet.getLastColumn()).getValues();
  const allDisplays = sheet.getRange(3, 1, lastRow - 2, sheet.getLastColumn()).getDisplayValues();
  const folder        = DriveApp.getFolderById(OUTPUT_FOLDER_ID);

  let successCount = 0;
  let errorRows = [];

  for (let i = 0; i < allValues.length; i++) {
    const rowNum  = i + 3;
    const values  = allValues[i];
    const display = allDisplays[i];
    const colA    = values[0];   // 生成狀態
    const colD    = values[3];   // 生成打OK

    // 條件：D欄有值 且 A欄空白
    if (!colD || colA !== '') continue;

    try {
      // 從 C 欄超連結取得範本 ID
      const richText   = sheet.getRange(rowNum, 3).getRichTextValue();
      const runs       = richText.getRuns();
      const templateUrl = richText.getLinkUrl() || (runs.find(r => r.getLinkUrl()) || {}).getLinkUrl();

      if (!templateUrl) {
        errorRows.push(`第${rowNum}列：C欄沒有文件連結`);
        continue;
      }
      const idMatch = templateUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!idMatch) {
        errorRows.push(`第${rowNum}列：無法解析文件 ID`);
        continue;
      }

      // 用欄位標題對照顯示值（格式跟試算表完全一致，不做轉換）
      const data = {};
      headers.forEach((header, idx) => { data[header] = display[idx]; });

      const variables = {};
      headers.forEach((header, idx) => {
        if (!header) return;
        variables[header] = display[idx] || '';
      });

      // 組合檔名：0629-0705 活動分類
      const nameStart = data['{{檔名開始日}}'] || data['{{開始日}}'] || '';
      const nameEnd   = data['{{檔名結束日}}'] || data['{{結束日}}'] || '';
      const nameType  = data['{{活動分類}}']   || data['{{主標}}'] || '文案';
      const docName   = `${nameStart}-${nameEnd} ${nameType}`;

      // 複製範本並替換變數
      const copy = DriveApp.getFileById(idMatch[1]).makeCopy(docName, folder);
      const doc  = DocumentApp.openById(copy.getId());
      const body = doc.getBody();
      Object.entries(variables).forEach(([placeholder, value]) => {
        const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        body.replaceText(escaped, value);
      });
      doc.saveAndClose();

      // A欄標記 DONE
      sheet.getRange(rowNum, 1).setValue('DONE');
      successCount++;

    } catch (e) {
      errorRows.push(`第${rowNum}列：${e.message}`);
    }
  }

  let msg = `✅ 成功生成 ${successCount} 份文件`;
  if (errorRows.length > 0) msg += `\n\n❌ 以下列發生錯誤：\n${errorRows.join('\n')}`;
  SpreadsheetApp.getUi().alert(msg);
}
