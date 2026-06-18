# 推播自動發送系統 — AI 移交說明

> 本文件供接手維護的 AI 快速理解此專案的檔案組織與 HTML 撰寫規範。  
> 撰寫日期：2026-06-02

---

## 一、專案目錄結構

```
auto-post-playwright/           ← 專案根目錄
├── start.bat                   ← 使用者入口：雙擊啟動系統（執行 node src/ui-server.js）
├── 點我錄製腳本.bat             ← 開啟 Playwright Inspector，供錄製後台操作流程
├── 使用指南.html               ← 操作者閱讀的使用手冊（主要維護對象）
├── 使用指南.md                 ← 使用指南的 Markdown 草稿版本（先在這裡改，確認後同步到 HTML）
│
├── src/                        ← 所有 Node.js 程式碼
│   ├── ui-server.js            ← Web Server（port 3000）+ 排程邏輯 + SSE 串流
│   ├── auto-post-from-sheet.js ← 推播發送自動化（讀 CSV → 登入後台 → 逐筆填表）
│   ├── sync-push-stats.js      ← 統計回填自動化（登入後台 → 匯出 xlsx → 回填試算表）
│   ├── google-login.js         ← Google 帳號重新登入（獨立腳本）
│   ├── record.js               ← Playwright 錄製輔助
│   ├── package.json
│   └── node_modules/           ← npm 套件（自動安裝，勿手動修改）
│
├── 系統資料/                   ← 執行期設定與登入狀態
│   ├── config.json             ← 後台帳號、密碼、排程時間（由 UI 介面儲存）
│   └── google_auth/            ← Playwright PersistentContext 的 Chrome profile
│
├── 暫存/                       ← 腳本執行時的暫存下載檔
│   ├── temp_sheet.csv          ← 每次從 Google Sheets 下載的 CSV
│   └── temp_push_stats.xlsx    ← 從後台匯出的推播統計 xlsx
│
├── 示意圖/                     ← 使用指南.html / .md 中使用的截圖
│   ├── image.png               ← 系統 UI 主畫面（無箭頭）
│   ├── image-1.png             ← 系統 UI，箭頭指向「立即執行發送」
│   ├── image-2.png             ← 系統 UI，箭頭指向「匯入統計數據」
│   ├── image-3.png             ← Google Sheets 試算表截圖
│   ├── image-4.png             ← 後台帳號 + Google帳號設定區塊
│   ├── image-5.png             ← 後台推播管理頁面截圖
│   ├── image-6.png             ← 系統 UI，箭頭指向統計回填按鈕
│   ├── image-7.png             ← 試算表回填後截圖
│   ├── image-8.png             ← 排程設定截圖，箭頭指向儲存排程按鈕
│   └── image-9.png             ← 後台帳號設定 + Google帳號設定 UI
│
├── 參考文件/                   ← 技術文件（維護者用）
│   └── 推播自動發送系統_架構書_v2.md
│
└── AI參考/                     ← AI 接手用的參考資料
    ├── 架構書.md               ← 另一個系統的架構書（競品分析，非本系統）
    └── 移交說明_auto-post-playwright.md  ← 本文件
```

---

## 二、核心程式邏輯摘要

### config.json 結構

```json
{
  "username": "後台帳號",
  "password": "後台密碼",
  "scheduleTime": "10:00"
}
```

- 路徑：`系統資料/config.json`
- 由 `ui-server.js` 的 Web UI 讀寫
- `auto-post-from-sheet.js` 和 `sync-push-stats.js` 都從這裡讀取帳密

### 排程邏輯（ui-server.js）

- `setInterval` 每分鐘比對當前小時與設定小時
- 使用 `scheduleFiredDate` 確保同一天只觸發一次
- 排程觸發順序：**推播發送完成（on close）後，才執行統計回填**（依序，非同時）

### 試算表欄位對應（auto-post-from-sheet.js）

| 欄 | 內容 | 用途 |
|---|---|---|
| A（row[0]）| 上架日期（格式：2026/5/15） | 組合成開始時間 |
| B（row[1]）| 時間（格式：20:00:00） | 組合成開始時間 |
| C（row[2]）| 敘述（後台表單的「敘述」欄位） | 填入後台 |
| D（row[3]）| 廣告內容 | 填入後台 |
| G（row[6]）| 狀態（「待發送」才處理） | 篩選條件；發送後改為「已發送」 |
| H / I / J | 點閱次數 / 發送次數 / 開啟率 | 由 sync-push-stats.js 回填 |

---

## 三、使用指南.html 撰寫規範

### 3.1 維護方式

1. 先修改 `使用指南.md`（Markdown 版本），確認內容正確
2. 再同步更新 `使用指南.html`
3. 每次更新後，在 HTML 頂部的修訂紀錄表格補上版本資訊

### 3.2 HTML 整體結構

```
<html>
  <head>
    <style>  ← 全部 CSS 內嵌在這裡，無外部 CSS 檔
    </style>
  </head>
  <body>
    <nav id="sidebar">   ← 固定側邊欄目錄
    <main id="content">  ← 主要內容區
    <button id="back-top"> ← 回到頂端按鈕（固定右下角）
    <script>  ← 飛過 GIF 動畫
    <script>  ← back-to-top + scroll spy
  </body>
</html>
```

### 3.3 CSS 變數（:root）

```css
--primary: #1a73e8        /* 主色藍，用於按鈕、標題底線、ol 數字圓圈 */
--primary-light: #e8f0fe  /* 淺藍底，hover / 選中 / info-box 背景 */
--warn-bg: #fff8e1        /* 黃底，warn-box 背景 */
--warn-border: #f9a825    /* 黃邊，warn-box 左邊框 */
--tip-bg: #e8f5e9         /* 綠底（備用，未大量使用） */
--tip-border: #43a047     /* 綠邊（備用） */
--code-bg: #f5f5f5        /* code 標籤背景 */
--border: #e0e0e0         /* 分隔線顏色 */
--text: #202124           /* 主文字色 */
--text-muted: #5f6368     /* 次要文字色 */
--sidebar-w: 260px        /* 側邊欄寬度 */
```

### 3.4 常用元件

#### info-box（藍色提示框）

```html
<div class="info-box">💡 提示文字內容</div>
```

用途：重要說明、注意事項（非警告性）

#### warn-box（黃色警告框）

```html
<div class="warn-box">⚠️ <strong>注意：</strong>警告文字內容</div>
```

用途：可能造成錯誤的操作提醒

#### blockquote（黃底引用）

```html
<blockquote>⚠️ 簡短注意事項</blockquote>
```

用途：補充說明，比 warn-box 輕量

#### 有序清單（ol）— 藍色圓圈數字

```html
<ol>
  <li>步驟一</li>
  <li>步驟二</li>
  <li>步驟三</li>
</ol>
```

CSS 會自動替所有 `#content ol li` 加上藍色圓圈數字（counter），**不需要手動加 badge**。

> **注意**：若步驟中間有插入圖片需要斷開 `<ol>`，必須用 `start="N"` 屬性接續編號，且 CSS 中需有對應的 `counter-reset` 規則：
> ```css
> #content ol[start="2"] { counter-reset: ol-counter 1; }
> #content ol[start="3"] { counter-reset: ol-counter 2; }
> /* 以此類推... */
> ```
> 圖片要放在 `</ol>` 之後、下一個 `<ol start="N">` 之前，**不要放在 `<li>` 裡面**（會造成 flex 排版異常）。

範例：
```html
<ol>
  <li>步驟一</li>
  <li>步驟二</li>
</ol>
<img src="示意圖/image-6.png" style="max-width:100%;border-radius:8px;border:1px solid #e0e0e0;margin:12px 0;display:block;">
<ol start="3">
  <li>步驟三</li>
</ol>
```

#### step-badge（h3 標題前的藍色步驟數字）

```html
<h3 id="s2-1"><span class="step-badge">1</span>步驟標題</h3>
```

用途：「第一次使用新電腦」章節中各子步驟的標題，手動指定數字。

#### 圖片（示意圖）

```html
<img src="示意圖/image-N.png" style="max-width:100%;border-radius:8px;border:1px solid #e0e0e0;margin:12px 0;display:block;">
```

所有圖片統一放在 `示意圖/` 資料夾，路徑以 `示意圖/` 開頭（相對路徑）。

#### 表格

```html
<table>
  <thead><tr><th>欄位一</th><th>欄位二</th></tr></thead>
  <tbody>
    <tr><td>資料</td><td>資料</td></tr>
  </tbody>
</table>
```

CSS 已定義標準表格樣式（藍色表頭、偶數列灰底、hover 淺藍）。

#### code 標籤（行內程式碼）

```html
<code>start.bat</code>
```

用於檔案名稱、指令、路徑等。

### 3.5 側邊欄（#sidebar）

- 固定在左側，`position: fixed`
- 每個目錄項目對應一個 `<a href="#anchor-id">` 連結
- 子項目用 `<li class="indent">` 縮排，字體較小（13px）
- `spy-active` class 由 scroll spy JS 自動切換，表示當前閱讀位置
- 行動裝置（max-width: 768px）側邊欄隱藏，內容全寬

目錄與對應 section id：

| 目錄文字 | href | h2/h3 的 id |
|---|---|---|
| 📝 修訂紀錄 | #changelog | `id="changelog"` |
| 🏃 快速入門 | #quick-start | `id="quick-start"` |
| 1. 環境需求 | #s1 | `id="s1"` |
| 2. 第一次使用新電腦 | #s2 | `id="s2"` |
| 步驟 1：Node.js | #s2-1 | `id="s2-1"` |
| 步驟 2：Chrome | #s2-2 | `id="s2-2"` |
| 步驟 3：啟動 | #s2-3 | `id="s2-3"` |
| 3. 功能說明 | #s3 | `id="s3"` |
| 3.1 推播發送 | #s3-1 | `id="s3-1"` |
| 3.2 統計回填 | #s3-2 | `id="s3-2"` |
| 3.3 排程設定 | #s3-3 | `id="s3-3"` |
| 3.4 後台帳號設定 | #s3-4 | `id="s3-4"` |
| 3.5 Google 帳號設定 | #s3-5 | `id="s3-5"` |
| 4. 常見問題 | #s5 | `id="s5"` |

### 3.6 JavaScript（頁面行為）

頁面有兩段 `<script>`：

**第一段：飛過 GIF 動畫**

- `FLY_GIFS`：6 個 giphy.com 動圖 URL 陣列
- 每隔 30～90 秒隨機觸發一隻 GIF 從右側飛入、波浪飄過、左側消失
- 最多同時 3 隻（`FLY_MAX = 3`）
- 支援滑鼠長按拖曳（按住 300ms 啟動 grab 模式，放開後繼續飛走）
- 行動裝置或視窗寬度 < 1024px 時不觸發

**第二段：回到頂端 + scroll spy**

- 捲動超過 300px 時顯示 `#back-top` 按鈕
- scroll spy：比對各 section 的 `offsetTop`，自動在側邊欄對應連結加上 `spy-active` class

### 3.7 頁面頂部的標題

```html
<h1>
  <img src="[giphy GIF URL]" width="60" style="display:inline;border:none;margin:0 8px 0 0;vertical-align:middle;">
  推播自動發送/追蹤數據系統 — 使用指南
  <img src="[giphy GIF URL]" width="60" style="display:inline;border:none;margin:0 0 0 8px;vertical-align:middle;">
</h1>
<p class="subtitle">版本：v1.0　撰寫日期：2026-06-01</p>
```

兩個 GIF 是同一個（鴨子圖，giphy media3 ID：`KOrIxsEQaBJcHgiiqL`），一左一右夾住標題文字。

### 3.8 修訂紀錄表格

位於頁面最頂部，在 `<h2 id="changelog">` 之後：

```html
<div style="background:#fff8e1;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:14px;color:#5f4000;">
  ⚠️ <strong>維護提醒：</strong>每次修改 <code>使用指南.md</code> 確認完畢後，須同步更新 <code>使用指南.html</code>，並在下方修訂紀錄補上版本資訊。
</div>

<table style="width:100%;border-collapse:collapse;font-size:14px;">
  <thead>
    <tr style="background:var(--primary-light);">
      <th style="text-align:left;padding:10px 14px;border:1px solid var(--border);width:70px;white-space:nowrap;">版本</th>
      <th style="text-align:left;padding:10px 14px;border:1px solid var(--border);width:110px;white-space:nowrap;">日期</th>
      <th style="text-align:left;padding:10px 14px;border:1px solid var(--border);width:90px;white-space:nowrap;">執行人</th>
      <th style="text-align:left;padding:10px 14px;border:1px solid var(--border);">修訂內容</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:10px 14px;border:1px solid var(--border);font-weight:700;white-space:nowrap;">v1.0</td>
      <td style="padding:10px 14px;border:1px solid var(--border);color:var(--text-muted);white-space:nowrap;">2026-06-01</td>
      <td style="padding:10px 14px;border:1px solid var(--border);white-space:nowrap;">呱呱</td>
      <td style="padding:10px 14px;border:1px solid var(--border);">初版發布</td>
    </tr>
    <!-- 新增版本時在這裡加 <tr> -->
  </tbody>
</table>
```

---

## 四、使用指南.md 與 .html 的同步規範

1. `使用指南.md` 是「草稿」，用來快速確認文字內容
2. 確認後將內容手動翻譯/對應到 `使用指南.html` 的 HTML 標記
3. 圖片一律存放在 `示意圖/` 資料夾
4. MD 中的圖片路徑格式：`![](示意圖/image-N.png)`
5. HTML 中的圖片路徑格式：`src="示意圖/image-N.png"`
6. 新增圖片時，依序命名（目前已到 image-9.png）

---

## 五、常見維護情境

### 新增一個常見問題

在 `使用指南.html` 的 `<h2 id="s5">4. 常見問題</h2>` 區塊內追加：

```html
<h3>Q：問題描述</h3>
<p>解答文字。</p>
```

若解答有步驟：
```html
<h3>Q：問題描述</h3>
<ol>
  <li>步驟一</li>
  <li>步驟二</li>
</ol>
```

同步更新 `使用指南.md` 的對應位置。

### 修改後台網址

1. `src/auto-post-from-sheet.js` 第 19 行的 `BACKEND_URL`
2. `src/sync-push-stats.js` 第 11 行的 `BACKEND_URL`

### 試算表欄位有變動

修改 `src/auto-post-from-sheet.js` 中 `toProcess` filter 區塊的欄位 index（row[N]）與對應的 `getByLabel()` 填表邏輯。

### 後台表單欄位有變動

使用 `點我錄製腳本.bat` 重新錄製操作流程，再依據錄製結果改寫 `auto-post-from-sheet.js` 的 Step 3「逐列發文」區塊。
