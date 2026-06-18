/*
README - 複製已完成活動到公告資料腳本

此程式碼用於在 Google 試算表中自動從 "活動範本" 分頁複製已完成的活動到 "公告資料彙整" 分頁。當活動標記為 "DONE" 並且該活動未在公告資料中存在時，會將其添加到目標分頁。以下是具體的操作步驟和說明：

1. **程式碼概述**：
   - 讀取 "活動範本" 工作表中的數據，找出標記為 "DONE" 的活動。
   - 檢查是否為新活動，如果是新活動，則將其複製到 "公告資料彙整" 工作表中。

2. **主要功能**：
   - `複製已完成活動到公告資料()` 函數：主要負責從 "活動範本" 分頁中複製標記為 "DONE" 的活動到 "公告資料彙整" 分頁。
     - 獲取 "活動範本" 的數據範圍，從 A 列（狀態）、F 列（主標）、G 列（副標）、C 列（活動分類）進行篩選。
     - 將狀態為 "DONE" 並且不在 "公告資料彙整" 中的活動複製過去。

3. **資料篩選與複製**：
   - 只會複製狀態為 "DONE" 的活動。
   - 將活動主標、副標和活動分類添加到目標分頁的 A、B、D 列。
   - 在 "公告資料彙整" 中，如果該活動已存在（通過主標和副標唯一標識），則不會再次添加，避免重複。

4. **程式運行流程**：
   - 讀取 "活動範本" 分頁的數據，過濾出狀態為 "DONE" 的活動。
   - 通過檢查 "公告資料彙整" 中的主標和副標來確保不重複添加相同活動。
   - 將新活動數據添加到 "公告資料彙整" 分頁的最後一行。

5. **日誌記錄**：
   - 每次運行程式時，會記錄複製的活動數量。如果沒有符合條件的活動，則記錄 "沒有新的資料需要複製"。

6. **運行方法**：
   - 此程式應定期手動運行或通過觸發器設置自動運行，以確保新的活動能及時複製到公告資料中。
*/
function 複製已完成活動到公告資料() {
  // 獲取試算表
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // 獲取源分頁和目標分頁
  var sourceSheet = spreadsheet.getSheetByName('活動範本');
  var targetSheet = spreadsheet.getSheetByName('公告資料彙整');
  
  // 獲取源分頁的資料範圍
  var lastRow = sourceSheet.getLastRow();
  var sourceRange = sourceSheet.getRange(2, 1, lastRow - 1, 7); // A2:G的所有資料
  var sourceValues = sourceRange.getValues();
  
  // 獲取目標分頁現有資料
  var targetLastRow = targetSheet.getLastRow();
  var existingData = targetSheet.getRange(2, 1, targetLastRow - 1, 2).getValues(); // 只獲取A和B列的資料
  
  // 創建一個Set來存儲現有資料的唯一標識符（主標+副標）
  var existingDataSet = new Set(existingData.map(row => row[0] + '|' + row[1]));
  
  // 準備存儲符合條件的新資料
  var newData = [];
  
  // 遍歷源資料，篩選出標記為DONE的項目，並檢查是否為新資料
  for (var i = 0; i < sourceValues.length; i++) {
    if (sourceValues[i][0] === 'DONE') { // A列為DONE
      var mainTitle = sourceValues[i][5]; // F列(主標)
      var subTitle = sourceValues[i][6];  // G列(副標)
      var activityType = sourceValues[i][2]; // C列(活動分類)
      
      // 檢查是否為新資料（只比對主標和副標）
      var rowIdentifier = mainTitle + '|' + subTitle;
      if (!existingDataSet.has(rowIdentifier)) {
        newData.push([
          mainTitle,     // A列(主標)
          subTitle,      // B列(副標)
          '',            // C列保持空白
          activityType   // D列(活動分類)
        ]);
        existingDataSet.add(rowIdentifier); // 將新資料添加到Set中，避免在本次操作中重複添加
      }
    }
  }
  
  // 如果有新資料，則寫入目標分頁
  if (newData.length > 0) {
    // 在現有資料後追加新資料
    targetSheet.getRange(targetLastRow + 1, 1, newData.length, 4).setValues(newData);
    
    Logger.log('完成複製 ' + newData.length + ' 筆新資料到公告資料彙整分頁。');
  } else {
    Logger.log('沒有新的資料需要複製。');
  }
}