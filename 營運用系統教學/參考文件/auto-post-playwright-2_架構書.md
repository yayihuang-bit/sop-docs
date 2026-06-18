# auto-post-playwright-2 — 自動發布系統架構書
> 本文件說明系統完整架構、腳本功能、Google Docs 格式規範與執行方式。
> **執行前請確認：VPN 已連線、google_auth 資料夾存在、Google Docs 格式正確。**
> 最後更新：2026-05-25

---

## 一、專案目標

將人工登入後台填表的作業，改為自動化執行。

**操作者只需要做一件事：在 Google Docs 同一頁內，依區段填好資料。**

系統負責：
- 自動登入後台（帳密集中存放於 `config.json`）
- 讀取 Google Sheets 試算表內的文件連結
- 讀取 Google Docs 全文，依區段標題識別類型並解析欄位
- 自動填入對應後台表單並送出
- 任何欄位缺漏或執行錯誤，立即彈出 Windows 通知視窗
- **試算表自動化**：完成後自動將試算表狀態欄位改為「已完成」；失敗或中斷時寫入「設定失敗」

---

## ⚠️ 注意事項

### 半自動腳本（需人工確認）

下列腳本為**半自動**，執行後仍需人工二次確認與補件，**請勿在無人值守的情況下執行**：

| 腳本 | 原因 |
|---|---|
| **官網文章**（auto-post-article.js） | 自動填入文字內容，但圖片、獎勵表格需手動補上；並非每篇文章都有自動化，未標記 AI 自動化的文件會被跳過 |
| **官網燈箱／廣告設定**（auto-post-ad.js） | 自動填入廣告資料，但內容正確性需人工確認 |

### 刻意未自動化的項目

部分項目是**有意不做自動化**的，原因可能是格式不固定、需要人工判斷，或人為調整空間較大。這些項目在試算表中不會出現「待設定」狀態，也不會被腳本處理。若需要新增自動化項目，請依架構書第六節步驟操作，並與相關人員確認。

---

## 二、系統架構

```
使用者操作層
  ├─ Google Docs（單頁多區段格式填寫資料）
  └─ Google Sheets 試算表（營運排程）
        ↓ 腳本讀取文件清單
執行層（Node.js + Playwright）
  ├─ auto-post-article.js   → 後台：官網設定 > 文章管理
  ├─ auto-post-ad.js        → 後台：官網設定 > 廣告設定
  ├─ auto-post-marquee.js   → 後台：公告系統 > 跑馬燈設定
  └─ auto-post-broadcast.js → 後台：客服系統 > 定時廣播
控制層
  ├─ ui-server.js           ← 圖形控制台（start.bat 啟動）
  ├─ run-from-sheet.js      ← 試算表自動化（讀試算表 → 執行 → 更新狀態）
  └─ scan-sheet.js          ← 掃描試算表，輸出待設定清單
通知層
  └─ Windows MessageBox（PowerShell EncodedCommand）
       ├─ 有缺漏欄位 → 彈警告 + 點確定自動開啟問題文件
       ├─ 執行錯誤  → 彈錯誤 + 點確定自動開啟問題文件
       └─ 全部完成  → 彈成功通知
```

---

## 三、資料夾結構

```
auto-post-playwright-2/
├─ start.bat                          ← 雙擊啟動圖形控制台
├─ 點我錄製腳本.bat                   ← 雙擊開啟 Playwright 錄製工具
├─ 使用說明.html                      ← 操作說明主頁（三個系統的入口）
├─ ▲使用說明.md                       ← 操作說明草稿（MD 版）
│
├─ src/                               ← 所有腳本集中於此
│   ├─ ui-server.js                   ← 控制台主程式（由 start.bat 執行）
│   ├─ chrome-path.js                 ← 查找系統 Chrome 路徑的共用模組
│   ├─ record.js                      ← 錄製工具腳本（由 點我錄製腳本.bat 執行）
│   ├─ run-from-sheet.js              ← 試算表自動化主腳本
│   ├─ scan-sheet.js                  ← 試算表掃描腳本
│   ├─ auto-post-article.js           ← 官網文章腳本
│   ├─ auto-post-ad.js                ← 廣告設定腳本
│   ├─ auto-post-marquee.js           ← 跑馬燈腳本
│   ├─ auto-post-broadcast.js         ← 定時廣播腳本
│   ├─ auto-post-web.js               ← 官網燈箱腳本
│   ├─ auto-post-from-drive.js        ← 官網文章腳本（Drive 版）
│   ├─ open-browser.js                ← 手動開瀏覽器工具
│   ├─ google-login.js                ← Google 帳號登入輔助
│   ├─ package.json
│   └─ node_modules/                  ← npm 套件（勿手動修改）
│
├─ 系統資料/
│   ├─ config.json                    ← 帳號密碼與後台網址設定
│   └─ google_auth/                   ← 瀏覽器登入狀態（Google Cookie）
│
├─ 參考文件/                          ← 技術參考資料與 HTML 指南
├─ 示意圖/                            ← 使用說明截圖與影片
├─ 文件生成/                          ← Google Apps Script 文件生成系統
├─ 推播/                              ← 推播自動發送系統（獨立）
│
└─ 執行中暫存（自動產生，勿手動修改）
   ├─ _web_doc_list.json              ← 官網文件清單
   ├─ _app_doc_list.json              ← APP 文件清單
   ├─ _web_failures.json / _web_successes.json
   ├─ _app_failures.json / _app_successes.json
   ├─ _done_article.json / _done_ad.json / _done_marquee.json / _done_broadcast.json
   ├─ _pending_status.json            ← 中斷回填用
   ├─ _scan_result.json
   ├─ _sheet_filter.json
   └─ _script_selection.json
```

> 以 `_` 開頭的 `.json` 均為執行中暫存檔，每次執行前自動清除。

---

## 四、config.json 帳號設定

路徑：`系統資料/config.json`

```json
{
    "google": { "email": "your@email.com" },
    "backstage": {
        "url": "https://your-backstage-url.com",
        "username": "your_username",
        "password": "your_password"
    }
}
```

> 後台網址如需更換，直接修改 `系統資料/config.json` 的 `backstage.url`。

---

## 五、Google Docs 文件格式規範

### 格式：單頁多區段

每份 Google Docs 文件為**單一頁面**，依需求包含多個區段。每個區段以**含有對應名稱的標題列**作為開頭。

**區段名稱 → 腳本 → 試算表狀態欄：**

| 區段名稱 | 說明 | 對應腳本 | 試算表狀態欄 |
|---|---|---|---|
| `官網設定-文章管理-QA測試用` | QA 人員測試用，自動化**不讀取** | — | F 欄 |
| `官網設定-文章管理-AI自動化用` | 自動化讀取此區段發布文章 | auto-post-article.js | F 欄 |
| `官網設定-廣告設定` | 廣告燈箱設定 | auto-post-ad.js | F 欄 |
| `APP-公告系統-跑馬燈設定` | 跑馬燈設定 | auto-post-marquee.js | G 欄 |
| `APP-客服系統-定時廣播` | 定時廣播設定 | auto-post-broadcast.js | G 欄 |

> 區段名稱可帶編號前綴（如 `一、官網設定-文章管理-AI自動化用`），腳本用子字串比對，不要求完全一致。
> 文件中沒有對應區段 → 腳本靜默跳過，並計入**失敗**（狀態寫「設定失敗」）。

### 區段切割邏輯（extractSection）

```
腳本複製整頁全文 → 以區段名稱為關鍵字找起點
                 → 以下一個已知區段名稱為終點
                 → 擷取中間的文字進行欄位解析
```

已知區段清單（ALL_SECTIONS，四支腳本共用）：
```js
[
    '官網設定-文章管理-QA測試用',
    '官網設定-文章管理-AI自動化用',
    '官網設定-廣告設定',
    'APP-公告系統-跑馬燈設定',
    'APP-客服系統-定時廣播',
]
```

---

## 六、試算表自動化（run-from-sheet.js）

### 試算表資訊

| 項目 | 值 |
|---|---|
| 試算表 ID | `1qmRZ-OT-PW6IzQFoJatZKf8fMUwnnBX-gyYHZCxuL1E` |
| 分頁 | 營運排程（GID：`1234248588`） |
| E 欄 | Google Docs 文件超連結（支援 docs.google.com 及 drive.google.com 格式） |
| F 欄 | 官網設定狀態（見下方狀態說明） |
| G 欄 | APP設定狀態（見下方狀態說明） |

**試算表狀態說明：**

| 狀態 | 說明 | 由誰寫入 |
|---|---|---|
| `待設定` | 尚未處理，等待執行 | 人工 |
| `已完成` | 所有腳本執行成功 | 腳本自動寫入 |
| `設定失敗` | 有腳本失敗，或執行中途被停止 | 腳本自動寫入 |
| `未完成` | 項目本身尚未完成（與自動化無關） | 人工 |
| `已暫停` | 活動暫停（與自動化無關） | 人工 |
| `不須設定` | 該項目不需要設定文章（與自動化無關） | 人工 |

> 腳本只處理狀態為 `待設定` 的列，其餘狀態一律跳過不動。

### 執行流程

```
run-from-sheet.js
  │
  ├─ Step 1：開啟瀏覽器，下載 CSV 解析試算表
  │          掃描 F、G 欄，找出「待設定」的列
  │          E 欄無文件連結的列 → 跳過（不計入待設定）
  │
  ├─ Step 2：逐列讀取 E 欄超連結（複製貼入沙盒取 href），取得 Doc ID
  │          支援 docs.google.com 與 drive.google.com 兩種連結格式
  │
  ├─ Step 3：關閉瀏覽器（釋放 google_auth 供子腳本使用）
  │          清除上次殘留的暫存檔（failures / successes / done 標記）
  │          將列↔docId 對應與啟用腳本清單寫入 _pending_status.json
  │          將 Doc ID 清單寫入 _web_doc_list.json / _app_doc_list.json
  │          依序 execSync 執行子腳本；每支腳本跑完後寫完成標記
  │          （若 run-from-sheet.js 被中途 kill，標記來不及寫）
  │          ※ 官網文章執行後、廣告設定執行前：等待 google_auth/SingletonLock
  │            消失，確保 profile 完全釋放再開新 Chrome（避免 profile 衝突）
  │
  └─ Step 4：重新開啟瀏覽器，依「完成標記 + 成敗記錄」更新試算表狀態
             見下方【試算表狀態判斷規則】
```

### 試算表狀態判斷規則

每個 group（官網 / APP）獨立判斷，規則如下：

```
若該 group 的完成標記不齊全（有腳本被 kill 沒跑完）
  → 所有列 → 設定失敗

若所有腳本都跑完（完成標記齊全）
  → docId 在失敗清單 → 設定失敗
  → docId 在成功清單 → 已完成
  → 兩者皆無          → 不更新（維持待設定）
```

**完成標記檔：**
| 腳本 | 標記檔 |
|---|---|
| auto-post-article.js | `_done_article.json` |
| auto-post-ad.js | `_done_ad.json` |
| auto-post-marquee.js | `_done_marquee.json` |
| auto-post-broadcast.js | `_done_broadcast.json` |

> 標記在每支腳本的 `execSync` 返回後才寫入。若 `run-from-sheet.js` 本身被 kill，標記就不會存在。

### 文件路由邏輯

**只依試算表狀態欄判斷**（不看文件名稱）：

```
F 欄 = 待設定 → 加入官網腳本處理清單（webRows）
G 欄 = 待設定 → 加入 APP 腳本處理清單（appRows）
同一列可同時進兩個清單（文件含多個區段時）
```

### E 欄驗證規則

- **E 欄空白**（無文件連結）→ 跳過，不計入待設定
- **E 欄有文字但找不到超連結** → 記錄警告並跳過
- **支援連結格式**：
  - `https://docs.google.com/document/d/[ID]/edit`
  - `https://drive.google.com/file/d/[ID]/view`
  - `https://drive.google.com/open?id=[ID]`

### 試算表狀態欄更新機制（updateSheetCell）

```
1. 導航至 ?gid=1234248588#gid=1234248588&range=Fxxx
2. 點擊 .waffle-name-box，輸入格子位址（如 F561），按 Enter
3. 用 JS 讀取 .active-cell-border 座標，mouse.click() 點擊格子
4. 嘗試點擊 .waffle-dropdown-chip 下拉選項（適用於「已完成」等預設值）
5. 備用：role=option 選項
6. 若下拉無對應選項：Escape 關閉下拉 → 重新點擊格子 → Delete 清空 → 直接打字輸入 → Enter 確認
```

> F/G 欄的下拉選項需包含 `待設定`、`已完成`、`設定失敗`，腳本才能正確寫入。

---

## 七、四支腳本說明

### 腳本失敗判斷機制

四支腳本均使用 `failCount` 計數，每份文件遇到以下任何一種情況都會 `failedDocIds.push(docId); failCount++`：
- 找不到對應區段（extractSection 回傳 null）
- Google Docs 無法開啟或載入失敗
- 欄位解析不到（missingFields）
- 廣告圖片找不到且使用者按「跳過」（ad 腳本）
- 後台送出後 dialog 回應錯誤訊息（ad / broadcast 腳本）

腳本結束時：
- `failedDocIds` 寫入 `_web_failures.json`（或 `_app_failures.json`）
- `successDocIds` 寫入 `_web_successes.json`（或 `_app_successes.json`）
- `failCount > 0` → `process.exit(1)`，`run-from-sheet.js` 的 `runScript()` 偵測到非零 exit code

> **所有 `continue` 路徑都必須有 `failedDocIds.push(docId); failCount++`，漏掉會導致腳本以 exit 0 結束，試算表誤顯示「已完成」。**

---

### 腳本 1：auto-post-article.js（官網文章）

**讀取區段：** `官網設定-文章管理-AI自動化用`（QA測試用區段不讀取）

**Google Docs 欄位格式：**
```
官網設定-文章管理-AI自動化用
類別：最新消息>活動
標題：4月活動公告
內容：
<p>活動內容 HTML...</p>
上架時間：2026/4/15 10:00:00
```

> `內文：` 和 `內容：` 皆可識別。內文支援多行 HTML，以「上架時間：」作為結尾邊界。

**類別對照表：**
| Google Docs 填寫 | 後台分類 ID |
|---|---|
| 最新消息>營運 | 15 |
| 最新消息>活動 | 14 |
| 最新消息>客服 | 16 |
| 遊戲介紹 | 7 |
| 系統說明 | 8 |
| 支付教學 | 9 |
| 其他說明 | 10 |
| 草稿 | 11 |

**必填欄位：** 標題、內文（或內容）、上架時間

**後台導航：** 後台首頁 → 點選「官網設定」→ 點選「文章管理」（選單點擊，非直接跳 URL）

---

### 腳本 2：auto-post-ad.js（廣告設定）

**讀取區段：** `官網設定-廣告設定`

**Google Docs 欄位格式：**
```
官網設定-廣告設定
版位：廣告燈箱
廣告註解：冥神祕寶來襲！王之力讓你馬上富！
超連結方式：內連網址
外連網址：（外連時填 URL，內連留空）
文章Id：（內連時填文章 ID，可留空讓腳本自動查詢）
圖片關鍵字：0401冥神祕寶來襲！
圖檔位置：（選填，留空使用預設路徑）
上架時間：2026/4/1 12:00:00
下架時間：2026/4/15 23:59:59
```

**超連結方式說明：**
| 選項 | 需填欄位 |
|---|---|
| 內連網址 | 文章Id（可留空，腳本自動查詢） |
| 外連網址 | 外連網址（填完整 URL） |

**文章 ID 自動查詢流程：**
1. `文章Id` 留空 → 腳本進後台「文章管理」搜尋框，輸入廣告註解前 10 字
2. 掃描所有搜尋結果的**所有欄位**（不固定哪欄），對每列取最高相似度
3. 取**相似度 ≥ 40% 且 ID 最大（最新）**的文章
4. 比對前先正規化字串（去零寬字元、全形空格），完全相符視為 100% 相似
5. 找不到 → 彈出 Windows 輸入框讓使用者手動填
6. 輸入框按「跳過此份」→ 跳過該文件（計入失敗次數）

> 若有多篇同名文章，自動取 ID 最大（最新發布）的那篇。

**圖片上傳流程：**
1. 依 `圖片關鍵字` 搜尋 fileserver 資料夾，取最新修改的一個
2. 關鍵字支援拆段比對（如 `0401冥神` 可比對 `260401_..._冥神...`）
3. 找不到 → 彈出 Windows 檔案選擇器（預設開在 fileserver 資料夾）
4. 使用者未選圖 → 跳過該份廣告設定（計入失敗次數）

**預設圖片路徑：**
```
I:\行銷部\02_行銷美術\包你發娛樂城\01_官網燈箱
```

**必填欄位：** 版位、圖片關鍵字、上架時間、下架時間

**後台導航：** 後台首頁 → 點選「官網設定」→ 點選「廣告設定」

---

### 腳本 3：auto-post-marquee.js（跑馬燈設定）

**讀取區段：** `APP-公告系統-跑馬燈設定`

**Google Docs 欄位格式：**
```
APP-公告系統-跑馬燈設定
受眾範圍：全會員
啟用時間(起)：2026/4/15 00:00:00
啟用時間(訖)：2026/4/30 23:59:59
顯示平台：全平台
跑馬燈內容：4月活動火熱進行中！
出現次數：1440
出現間隔(秒)：600
```

**時間格式：** 填 `2026/4/15`，腳本自動轉為 `2026-4-15`

**必填欄位：** 跑馬燈內容、啟用時間(起)、啟用時間(訖)、出現次數、出現間隔(秒)

**後台導航：** 後台首頁 → 點選「公告系統」→ 點選「跑馬燈設定」

---

### 腳本 4：auto-post-broadcast.js（定時廣播）

**讀取區段：** `APP-客服系統-定時廣播`

**Google Docs 欄位格式：**
```
APP-客服系統-定時廣播
指定頻道：（選填，留空不指定）
廣播內容：4月活動正在進行，請把握機會！
廣播起訖時間：2026/4/15 00:00:00 - 2026/4/30 23:59:59
出現次數：10
間隔：180分
```

**時間格式：** 起訖寫同一行以` - `分隔，腳本自動轉換補零

**間隔：** 填 `180分` 或 `180` 皆可，自動去除中文

**必填欄位：** 廣播內容、廣播起訖時間、出現次數、間隔

**後台導航：** 後台首頁 → 點選「客服系統 <功能查詢>」→ 點選「定時廣播」（iframe #hbsIframe）

---

## 八、控制台（start.bat / ui-server.js）

雙擊 `start.bat` 啟動圖形控制台，功能：

| 功能 | 說明 |
|---|---|
| 腳本選擇 | 四支腳本預設全選，可個別取消勾選 |
| 待設定清單 | 從試算表掃描「待設定」列，可勾選要處理的項目 |
| 立即執行 | 點「開始執行」立即依序跑選中的腳本 |
| 排程執行 | 選擇日期時間，到點自動執行 |
| 停止執行 | 執行中顯示「停止執行」按鈕，點擊後立即終止所有腳本 |
| 帳號設定 | 齒輪圖示開啟設定，可修改 Google 帳號與後台帳密 |

**控制台腳本清單：**

| 控制台顯示名稱 | 腳本檔案 |
|---|---|
| 官網文章 | auto-post-article.js |
| 廣告設定 | auto-post-ad.js |
| 跑馬燈設定 | auto-post-marquee.js |
| 定時廣播 | auto-post-broadcast.js |

> 控制台的腳本選擇結果寫入 `_script_selection.json`，由 `run-from-sheet.js` 讀取決定要跑哪幾支。

### 停止執行機制

```
使用者點「停止執行」
  │
  ├─ ui-server.js 呼叫 taskkill /F /T /PID 終止整個程序樹
  │  （包含 run-from-sheet.js 及其子程序 Playwright browser）
  │
  ├─ 等待程序完全結束（close 事件）+ 2 秒緩衝
  │  清除可能殘留的 google_auth/SingletonLock
  │
  └─ 執行 node run-from-sheet.js --update-only
       讀取 _pending_status.json（儲存了列↔docId 對應與啟用腳本清單）
       讀取 failures / successes / done 標記
       依【試算表狀態判斷規則】回填試算表
       完成後顯示「已完成項目狀態已回填」或「無狀態需要回填」
```

**中斷後的狀態結果：**

| 情境 | 試算表狀態 |
|---|---|
| 官網或 APP 任何腳本被中途 kill | 所有該 group 的列 → **設定失敗** |
| 全部腳本跑完，某文件失敗 | 失敗的列 → **設定失敗** |
| 全部腳本跑完，全部成功 | **已完成** |
| 某文件完全未被處理（kill 太早）| **不更新**（維持待設定） |

---

## 九、核心技術說明

### 瀏覽器登入持久化
```
chromium.launchPersistentContext('系統資料/google_auth', { headless: false })
```
- `系統資料/google_auth` 資料夾儲存 Google 帳號與後台的登入 Cookie
- 首次執行前需手動登入並儲存狀態（執行 `open-browser.js`）
- 若出現 `SingletonLock` 錯誤：刪除 `系統資料\google_auth\SingletonLock`（停止執行後會自動嘗試清除）
- **google_auth 同一時間只能被一個 Playwright context 使用**
- `run-from-sheet.js` 在執行子腳本前會先關閉主瀏覽器，子腳本結束後再重新開啟

### 後台導航方式

後台為 SPA（單頁應用程式），會記住上次停留的分頁。所有腳本改用**選單點擊**方式導航，而非直接跳 URL，確保正確觸發分頁切換：

```js
await page.goto(`${BACKSTAGE_URL}/index`);
await page.getByRole('button', { name: '官網設定' }).click();
await page.getByRole('navigation').getByRole('link', { name: '文章管理' }).click();
```

### 文件內容讀取（隱藏沙盒技術）
```
1. 在 Google Docs 內 Ctrl+A → Ctrl+C（全選複製整頁）
2. 建立不可見的 contentEditable div（opacity: 0.01）
3. 在 div 內 Ctrl+V 貼上
4. 用 innerText 取得全文純文字，傳回 Node.js
5. 在 Node.js 用 extractSection() 依區段名稱切割
6. 用 Regex 解析各欄位
```
> 不依賴 Google Docs API，完整保留換行格式。

### 區段切割（extractSection）
```js
function extractSection(allText, sectionName) {
    const idx = allText.indexOf(sectionName);        // 找區段起點
    if (idx === -1) return null;
    let endIdx = allText.length;
    for (const other of ALL_SECTIONS) {              // 找下一個區段作為終點
        if (other === sectionName) continue;
        const otherIdx = allText.indexOf(other, idx + sectionName.length);
        if (otherIdx !== -1 && otherIdx < endIdx) endIdx = otherIdx;
    }
    return allText.slice(idx, endIdx);
}
```
- 區段名稱用子字串比對，允許帶編號前綴（`一、`、`二、`...）或 emoji 前綴
- 找不到區段名稱回傳 `null`，腳本計入失敗並跳過

### 欄位解析 Regex 規則
```js
const get = (key) => {
    const m = text.match(new RegExp(key + '[：:][^\\S\\n]*([^\\n]*)', 'i'));
    return m ? m[1].trim() : '';
};
```
- `[^\S\n]*`：只吃橫向空白，不跨越換行
- `i` flag：大小寫不分（如 `文章Id` / `文章ID` 都能解析）

### Google 帳號驗證偵測
```js
async function waitIfVerification(page) {
    if (page.url().includes('accounts.google.com')) {
        notify('⚠️ Google 帳號驗證', '請在瀏覽器完成驗證...');
        await page.waitForURL(url => !url.href.includes('accounts.google.com'), { timeout: 300000 });
    }
}
```
> 偵測到 Google 驗證頁面時暫停等待，不自動失敗。

### Windows 通知（PowerShell Base64）
```js
const encoded = Buffer.from(script, 'utf16le').toString('base64');
execSync(`powershell -EncodedCommand ${encoded}`, { stdio: 'ignore' });
```
> 支援多行文字與中文；訊息含 URL 時，點「確定」自動開啟網頁。

---

## 十、執行方式

### 首次環境建置
```bash
cd C:\Users\yayihuang\Desktop\auto-post-playwright\auto-post-playwright-2\src
npm install
```

### 圖形控制台（推薦）
```
雙擊 start.bat
```

### 試算表自動化（命令列）
```bash
node src\run-from-sheet.js
```

### 單支腳本直接執行
```bash
node src\auto-post-article.js     # 只跑官網文章
node src\auto-post-ad.js          # 只跑廣告設定
node src\auto-post-marquee.js     # 只跑跑馬燈
node src\auto-post-broadcast.js   # 只跑定時廣播
```

> 直接執行單支腳本時，需先手動建立 `_web_doc_list.json` 或 `_app_doc_list.json`（內含 Doc ID 陣列）。

---

## 十一、常見錯誤排查

| 錯誤現象 | 原因 | 解法 |
|---|---|---|
| `SingletonLock` 錯誤 | google_auth 被上次瀏覽器鎖住 | 刪除 `系統資料\google_auth\SingletonLock`（停止執行後會自動清除） |
| 廣告設定出現「網際網路存取權遭到封鎖」（ERR_NETWORK_ACCESS_DENIED） | 前一腳本關閉 Chrome 後，Windows 防火牆暫時封鎖新開的 Chrome | 已修正：auto-post-ad.js 偵測到此錯誤頁會自動等 5 秒重試，最多 3 次，無需手動介入 |
| 找不到區段 | 文件中無對應區段名稱 | 確認文件內有對應文字（如 `官網設定-廣告設定`）；找不到會計入失敗 |
| 欄位解析不到 | 欄位名稱或格式有誤 | 確認格式為 `欄位名稱：值`，冒號可為全形或半形 |
| 圖片找不到 | fileserver 路徑無法存取或檔名不含關鍵字 | 腳本會彈出檔案選擇器讓手動選圖 |
| 文章 ID 找不到 | 廣告註解與文章標題差異過大 | 腳本會彈出輸入框讓手動填 ID |
| 後台登入失敗 | google_auth 快取過期 | 執行 `open-browser.js` 手動重新登入 |
| 通知視窗沒彈出 | PowerShell 被封鎖 | 以系統管理員身份執行 |
| 試算表狀態未更新 | chip 下拉無法開啟 | 確認 F/G 欄下拉選項包含「待設定」、「已完成」、「設定失敗」 |
| E 欄有文字但跳過 | 文件連結未設超連結（只有文字） | 在試算表重新插入超連結（支援 docs.google.com 及 drive.google.com） |
| 卡在後台上次分頁 | 後台 SPA 記住上次狀態 | 已修正：腳本改用選單點擊導航，不再直接跳 URL |
| 中斷後狀態仍顯示待設定 | _pending_status.json 不存在（kill 太早） | 正常現象：kill 在讀試算表階段，還沒有文件清單，保留待設定讓下次重跑 |
| 中斷後顯示已完成（舊版 bug） | 已修正：現在中斷一律顯示設定失敗 | — |
