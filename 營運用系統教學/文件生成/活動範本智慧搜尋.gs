function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  if (sheet.getName() !== '在這生成文件') return;
  if (range.getColumn() !== 3) return;
  if (range.getRow() < 3) return;

  var templateSheet = e.source.getSheetByName('活動範本模板(不是在生成文件喔)');
  if (!templateSheet) {
    SpreadsheetApp.getUi().alert('找不到「活動範本模板」分頁');
    return;
  }

  var templateData = templateSheet.getRange(2, 1, templateSheet.getLastRow() - 1, templateSheet.getLastColumn()).getValues();
  var headerRow = templateSheet.getRange(1, 1, 1, templateSheet.getLastColumn()).getValues()[0];
  var auxColumnIndex = headerRow.indexOf('範本比對用') + 1;
  if (auxColumnIndex === 0) {
    SpreadsheetApp.getUi().alert('找不到「範本比對用」欄位');
    return;
  }
  var templateAuxKeywords = templateSheet.getRange(2, auxColumnIndex, templateSheet.getLastRow() - 1, 1).getValues().flat();

  var numRows = range.getNumRows();

  for (var r = 0; r < numRows; r++) {
    var cellRow = range.getRow() + r;
    var cell = sheet.getRange(cellRow, 3);
    var cellValue = cell.getValue().toString();
    var note = cell.getNote();

    // 判斷是否為下拉選單選擇
    if (note && note.startsWith('MATCHES:')) {
      var matchData = JSON.parse(note.substring(8));
      var match = null;
      for (var j = 0; j < matchData.length; j++) {
        if (matchData[j].name === cellValue) {
          match = matchData[j];
          break;
        }
      }

      if (match) {
        // 使用者選了 → 套用範本（copyTo 會蓋掉黃色背景和格式）
        cell.clearNote();
        cell.setDataValidation(null);
        templateSheet.getRange(match.row, 1, 1, match.numCols)
          .copyTo(sheet.getRange(cellRow, 1), { contentsOnly: false });
        sheet.getRange(cellRow, 3).clearNote();
        continue;
      } else {
        // 使用者刪掉內容或貼了新值 → 清掉所有格式重來
        cell.clearNote();
        cell.setDataValidation(null);
        cell.setBackground(null);
        cell.setFontColor(null);
        cell.setFontWeight('normal');
      }
    }

    // 當作新關鍵字處理
    var value = cellValue.replace(/[\r\n]+/g, ' ').replace(/\(.*?\)/g, '').trim();
    if (value === '') continue;

    var result = findMatches(value, templateData, templateAuxKeywords);

    if (result.exactMatch) {
      var m = result.exactMatch;
      templateSheet.getRange(m.row, 1, 1, m.data.length)
        .copyTo(sheet.getRange(cellRow, 1), { contentsOnly: false });
      sheet.getRange(cellRow, 3).clearNote();

    } else if (result.matches.length === 1) {
      var m = result.matches[0];
      templateSheet.getRange(m.row, 1, 1, m.data.length)
        .copyTo(sheet.getRange(cellRow, 1), { contentsOnly: false });
      sheet.getRange(cellRow, 3).clearNote();

    } else if (result.matches.length === 0) {
      SpreadsheetApp.getUi().alert('無對應範本：' + value);

    } else {
      // 多個候選 → 黃底 + 提示文字 + 下拉選單
      var matchNames = result.matches.map(function(m) { return m.name; });
      var matchDataToStore = result.matches.map(function(m) {
        return { name: m.name, row: m.row, numCols: m.data.length };
      });

      cell.setBackground('#FFFF00');           // 黃底
      cell.setValue('請選擇(' + value + ')範本👉'); // 提示文字
      cell.setFontColor('#CC6600');             // 深橘色文字，更明顯
      cell.setFontWeight('bold');
      cell.setNote('MATCHES:' + JSON.stringify(matchDataToStore));

      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(matchNames, true)
        .setAllowInvalid(true)
        .build();
      cell.setDataValidation(rule);
    }
  }
}

// ============================================================
// 找匹配
// ============================================================
function findMatches(inputKeyword, templateData, templateAuxKeywords) {
  var exactMatch = null;
  var matches = [];
  var processedKeyword = inputKeyword.toLowerCase();
  var keywordParts = processedKeyword.split(/[\s]+/);

  for (var i = 0; i < templateData.length; i++) {
    var templateCategory = templateData[i][2] ? templateData[i][2].toString().toLowerCase() : '';
    var auxKeyword = templateAuxKeywords[i] ? templateAuxKeywords[i].toString().toLowerCase() : '';

    if (templateCategory === processedKeyword) {
      exactMatch = { name: templateData[i][2], data: templateData[i], row: i + 2 };
      break;
    }

    var matchFound = keywordParts.some(function(part) {
      return templateCategory.includes(part) || (auxKeyword !== '' && processedKeyword.includes(auxKeyword));
    });
    var similarityScore = getSimilarity(processedKeyword, templateCategory);

    if (matchFound || similarityScore > 0.2) {
      matches.push({ name: templateData[i][2], data: templateData[i], row: i + 2, score: similarityScore });
    }
  }

  matches.sort(function(a, b) { return b.score - a.score; });
  return { exactMatch: exactMatch, matches: matches };
}

// ============================================================
// 相似度計算
// ============================================================
function getSimilarity(s1, s2) {
  var longer  = s1.length >= s2.length ? s1 : s2;
  var shorter = s1.length >= s2.length ? s2 : s1;
  var longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  var costs = [];
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        var newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}
