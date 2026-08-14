# SOP 文件站 - 架構說明 (for AI)

## 📋 快速概覽

這是用 **MkDocs Material** 搭配 **GitHub Pages** 的文件站，內容全是繁體中文的公司內部 SOP。特點：

- **靜態站點**：部署到 GitHub Pages，push 到 `main` 自動更新
- **密碼保護**：所有頁面都有登入認證（密碼：`asd12345`），但 **repo 是 public 的**，這個密碼只是擋一般人隨便滑進來看，不是真的權限控管
- **Flying GIFs**：頁面會隨機播放飛行的 gif
- **石頭色系頂部**：導覽列是深黑到石頭灰的漸層（不是 Material 預設的 indigo）
- **各分類有自己的主題色**：遊戲類教學＝紫、營運活動教學＝棕、競品指南＝綠、Git使用教學＝藍綠、其他文件教學＝藍灰，卡片邊框、按鈕、標題文字都統一套色
- **集中連結管理**：用 `mkdocs-macros-plugin`，同一個網址如果會出現在兩個以上地方，寫在 `mkdocs.yml` 的 `extra.links` 一次，全站用 `{{ links.xxx }}` 引用，改一次全部同步
- **每篇文件自動生成「連結彙整」**：掃描內文所有連結，依分類（試算表／簡報／雲端資料夾／Slack／其他）整理成表格，不用手動維護
- **每篇文件自動生成「📑 目錄」**：頁面有 2 個以上 H2 標題就自動產生跳轉清單，插在連結彙整下方（沒有連結彙整就接在版本資訊下方），索引頁（卡片式）不生成
- **表格儲存格智慧換行**：一行放得下就不換行，真的太長才換行，靠 JS 量測實際寬度判斷，不是猜字數
- **「我的常用連結」個人化收藏**：每個訪客自己的瀏覽器記錄自己的常用連結（localStorage，不同人不同份），可以在任何頁面的連結彙整裡點 ☆ 收藏，首頁會依來源分類分組顯示
- **版本資訊全部手動更新**：每份文件開頭的「版本」「撰寫日期」「BY」都要手動填寫。**曾經有一支 GitHub Actions（`update-md-metadata.yml`）自動更新「撰寫日期」「BY」，但因為持續執行失敗已於 2026-07-31 移除**，現在三個欄位都得自己改
- **⚠️ 寫連結文字／標題時，中文跟英文（或數字）中間要留空格**：搜尋引擎（lunr.js）是照文字有沒有空白/標點分隔來斷詞，中英文黏在一起沒空格會被當成一整塊索引，之後只能搜「完整那一整串」才找得到，搜局部關鍵字（例如只打「survey」或中間的兩個字）會完全找不到。寫連結文字、標題時養成習慣中英文之間留空格（例如「活動 獎勵 機率 公布 survey」而不是「活動獎勵機率公布survey」），這是**寫內容的人（AI）要自動注意的事**，不是使用者需要記得的規則
- **重點提醒可以用粗體＋黃底標記**：寫法是 `<mark>⚠️ **要強調的文字**</mark>`，跟一般沒有粗體黃底、只是文字前加 ⚠️ 的提醒不同。用在真的容易出錯、忘記會出問題的重點，不要整份文件到處都用，不然會失去強調效果
- **標題兩側的 gif 每次隨機換一個**：跟右側飛來飛去的 gif 共用同一個素材池（`FLY_GIFS` 陣列），不用去改每份文件，`overrides/main.html` 有一段 JS 統一處理
- **有一份 `CLAUDE.md`（repo 根目錄）**：AI 每次工作會自動載入，內容是「先讀 `ARCHITECTURE.md`」的指示 + 這個專案的協作方式，`ARCHITECTURE.md` 才是規則本體，`CLAUDE.md` 只是入口，不要把細節寫進 `CLAUDE.md`
- **不常用但偶爾要找的連結，可以用「其他參考資源」這種輕量清單**，不用整個做成卡片：直接在索引頁的卡片區塊下面加一個 `##` 小節、條列連結就好（範例見 `docs/營運_索引.md` 的「📎 其他參考資源」），比另開一個新的教學頁面划算

---

## 📁 目錄結構

```
sop-docs/
├── mkdocs.yml                    # MkDocs 配置：nav、plugins、集中連結清單 extra.links
├── README.md                     # 專案說明（舊的，非架構文件）
├── CLAUDE.md                     # AI 每次工作自動載入，內容是「先讀 ARCHITECTURE.md」的指示，規則本體不寫在這
├── ARCHITECTURE.md               # 這個檔案（給 AI 用，要跟著改動更新）
├── docs/
│   ├── index.md                  # 首頁：常用連結 + 五大分類卡片導覽
│   ├── 連結總表.md               # 內部工具頁，不排進 nav，用來列出 links 清單方便挑選常用連結預設值
│   ├── 遊戲上線工作_索引.md／遊戲上線SOP.md／遊戲調整流程.md
│   ├── 營運_索引.md／營運企劃執行工作大綱.md／文案調整.md／營運文案寫法.md／營運活動基本設定.md／換皮資訊_索引.md
│   ├── 抽獎_索引.md／直播流程.md／抽獎流程.md（抽獎券推廣流程）／其他抽獎流程.md
│   ├── 競品指南_索引.md／競品指南.md
│   ├── 競品優化_使用指南.md／競品優化_管理者指南.md（有對應的 .html，見下方）
│   ├── Git使用教學_索引.md／Git版本推送與衝突處理.md／如何使用GIT.md    # Git使用教學分類（第 4 個大分類），如何使用GIT.md 內容目前是 🟡 待補充 骨架
│   ├── 文件格式教學_索引.md      # 併入 Git使用教學分類，給人看的寫作規則版，跟這份 ARCHITECTURE.md 內容對應
│   ├── BUG回報方式.md            # 其他文件教學分類（第 5 個大分類），目前只有這一頁，nav 是扁平單一條目（不是巢狀子選單）
│   ├── files/                    # 可下載的檔案（例如 .pptx 範本），跟 images/ 平行的慣例，用 `[文字](files/檔名)` 引用，MkDocs 會原封不動複製過去
│   ├── stylesheets/
│   │   └── extra.css             # 全站自訂樣式（見下方詳解）
│   └── *.html                    # 5 個獨立 HTML 檔案，見「獨立 HTML 頁面」章節
├── overrides/
│   └── main.html                 # Material 主題 override：密碼、GIF、常用連結、連結彙整、自動目錄、表格換行邏輯全在這
├── .github/workflows/
│   └── deploy.yml                # push 到 main 就自動 build + 部署（唯一一支，`update-md-metadata.yml` 已於 2026-07-31 移除）
└── 競品優化/                     # 舊的維護資料夾，含 _embed.py／_embed_admin.py（已棄用，見下方說明）
```

---

## 🔧 核心組件

### 1. mkdocs.yml

```yaml
theme:
  name: material
  palette:
    primary: indigo    # 這個設定其實被 extra.css 的 CSS 變數蓋掉了，實際顯示是石頭色
  features:
    - navigation.tabs   # 三大分類渲染成頂部分頁籤
    - toc.integrate
    - search.suggest
    - search.highlight

nav:                     # 見檔案內容，目前是「首頁 / 遊戲類教學 / 營運活動教學 / 競品指南 / Git使用教學 / 其他文件教學」五大分類

plugins:
  - search
  - macros               # mkdocs-macros-plugin，讓 {{ links.xxx }} 能在 .md 裡被替換成真正網址

extra:
  links:                 # 集中連結清單，key 是代號，value 是真正網址
    xxx_yyy: "https://..."
```

**加新頁面**：`docs/` 新增 `.md`，在 `nav:` 對應分類底下加一行。

**改共用連結（重要）**：如果某個網址會出現在兩個以上地方（不管是同一份文件內還是跨文件），**不要直接貼網址**，改成：
1. 在 `extra.links` 底下加一行 `代號: "網址"`
2. 內文用 `{{ links.代號 }}` 引用，例如 `[中獎名單]({{ links.winner_list_tool }})`
3. 之後網址要改，只改 `mkdocs.yml` 這一行，全部引用處建置時自動同步

`docs/連結總表.md` 有目前所有 `links.*` 代號跟中文說明的對照，忘記代號叫什麼可以去那邊查。

⚠️ **這個外掛在本地要先裝**：`python -m pip install mkdocs-macros-plugin`（GitHub Actions 的 `deploy.yml` 已經裝了）。**新增 plugin 或改 `mkdocs.yml` 的 plugins 設定後，本地 `mkdocs serve` 要整個重啟才會生效**，光改文件內容觸發的即時重載不夠。

---

### 2. overrides/main.html

Material 主題的 override 檔案，`{% block scripts %}` 裡塞了好幾個獨立的 IIFE，各自負責一件事：

| 功能 | 邏輯摘要 |
|------|---------|
| 密碼保護 | 檢查 `localStorage.sop_authenticated`，沒有就蓋一層密碼框，密碼寫死在程式碼裡（`asd12345`） |
| Flying GIFs | 隨機挑一張 GIF，從右邊界飛到左邊界，30-90 秒觸發一次，最多同時 1 隻，可拖曳。素材池是 `FLY_GIFS` 陣列 |
| 標題兩側 gif 隨機化 | 每次進頁面，把標題兩側固定寫死的 gif（`<img src="...KOrIxsEQaBJcHgiiqL/giphy.gif">`）換成從 `FLY_GIFS` 隨機挑的一張，左右兩側用同一張（不會不一致）。不用改任何一份 `.md`，直接在 JS 裡用 `img[src="固定網址"]` 選到那兩個 `<img>` 替換 `src` |
| 自動排序卡片 | 只在有 `display:grid` 卡片的索引頁生效，依 `localStorage.sop_clicks`（每個連結的累積點擊次數）把卡片區塊排到前面。**「我的常用連結」區塊有特別排除，永遠固定在第一個，不參與排序**（用 `node.textContent.indexOf('我的常用連結')` 判斷） |
| 我的常用連結（收藏系統） | 見下方「常用連結系統」專節 |
| 自動連結彙整 | 見下方「連結彙整」專節 |
| 自動目錄 | 只在**非索引頁**且有 2 個以上 H2 標題時生效，掃描 `.md-content__inner` 的直屬 `h2`（排除 `#link-summary`），用瀏覽器渲染出的 `h2.id`（python-markdown toc 擴充套件自動產生，中文標題通常是 `_1`／`_2`⋯）組成跳轉清單，插在「連結彙整」表格後面（沒有就插在版本資訊 blockquote 後面）。**必須排在「自動連結彙整」的 `DOMContentLoaded` 監聽器之後註冊**，才能抓到連結彙整自己的 `<h2 id="link-summary">` 已經插入 DOM |
| 表格儲存格智慧換行 | 見下方「表格換行」專節 |

**⚠️ 修改這個檔案後的重要規則**：本地 `mkdocs serve` 只監看 `docs/` 資料夾，**不監看 `overrides/`**。改完 `main.html` 要嘛重啟伺服器，要嘛用「碰一下 `docs/index.md` 的修改時間」的方式強制觸發重建（`Get-Item ... .LastWriteTime = Get-Date`），不然預覽會是舊版但你不會發現。

**跨頁錨點連結的慣例**：中文標題被 python-markdown 的 toc 擴充套件自動產生的 `id` 通常沒有意義（`_1`、`_2`⋯，只有標題含英文單字時才會取那個字當 id，例如「Help」）。**同頁**的自動目錄可以直接讀當下渲染出的 `h2.id`，不受影響；但如果是**從別的頁面**連過來指定某個段落（例如 `文案調整.md` 連到 `遊戲調整流程.md` 的某一節），不能依賴這個自動 id（內容順序一改就跑掉），要在該 `## 標題` 前手動加一行 `<a id="有意義的英文代號"></a>`，再用 `[文字](/sop-docs/頁面/#有意義的英文代號)` 引用。

#### 常用連結系統（收藏功能）

- 資料存在瀏覽器的 `localStorage['sop_favorites']`，格式是 `[{href, text, category}, ...]`，**每個訪客的瀏覽器各自獨立**，換裝置/清快取會重置回預設值
- `DEFAULT_FAVORITES`：新訪客第一次進站看到的預設收藏，目前是 4 個（包你發更新計畫表、營運活動文件表、抽獎券規劃表、營運自動化文件表），網址用 `{{ config.extra.links.xxx }}` 從 `mkdocs.yml` 的集中清單拉，不是寫死
- `getPageCategory()`：依網址路徑判斷這頁屬於「遊戲類教學／營運活動教學／競品指南／Git使用教學／其他文件教學／其他」哪個分類（正則比對路徑裡有沒有「遊戲」「營運/換皮/抽獎/直播」「競品」「文件格式/git」（不分大小寫，因為有的頁面檔名是 `Git...`、有的是全大寫 `如何使用GIT`）「BUG」），**加星星時會自動記錄當下頁面屬於哪個分類**
- 首頁 `index.md` 有個 `<div id="my-favorites-list">` 容器，`renderFavorites()` 會把收藏依分類分組渲染成一區一區，顏色跟著分類走
- 舊資料相容：`loadFavorites()` 讀到沒有 `category` 欄位的項目，會先試著用網址比對 `DEFAULT_FAVORITES` 補回分類，比對不到才歸到「其他」

#### 連結彙整（自動生成）

- 只在**非索引頁**（沒有 grid 卡片的一般文章頁）生效
- 掃描 `.md-content__inner` 裡所有 `a[href]`，排除 `#開頭`／`mailto:`／文字是「參考」「這裡」「查看」「點此」「連結」「簡報」這種太籠統的
- 依網址分類：站內文件／試算表／簡報／雲端資料夾／Slack 群組／其他
- 插在頁面版本資訊（第一個 blockquote）後面
- 每個連結後面會加一顆 ☆／★，點擊呼叫 `toggleFavorite()` 加入/移除常用連結

#### 表格換行（重要的 CSS 陷阱記錄）

- CSS 預設全部表格儲存格 `white-space: nowrap`（見 `extra.css`）
- **陷阱**：`table-layout:fixed` 底下，同一欄所有儲存格共用同一個欄寬，只要欄內有一格文字很長把欄撐寬，同欄其他短格量到的也是撐寬後的欄寬，不是自己文字的真實寬度，直接拿 `scrollWidth` vs `clientWidth` 比較會誤判
- **解法**：用一個隱藏的量尺 `<span>`（不在表格裡，不受欄寬共用影響）分別量每格文字自己的真實寬度，再跟該欄依 `%` 換算出的實際可用寬度（`外層 .md-typeset__scrollwrap 的寬度 × th 宣告的 %`）比較，超過才設 `white-space:normal`
- 頁面載入、視窗縮放都會重新計算

---

### 3. docs/stylesheets/extra.css

全站 CSS override，重點規則：

- `[data-md-color-primary] { --md-primary-fg-color: ... }`：蓋掉 Material 預設的 indigo，改成頂部導覽列的石頭色漸層（`.md-header`／`.md-tabs` 用 `linear-gradient`）。**注意**：Material 把顏色設定寫在 `<body data-md-color-primary="indigo">` 屬性上，單純改 `:root` 的 CSS 變數蓋不掉，要用 `[data-md-color-primary]` 選擇器 + `!important`
- 標題（h1/h2/h3）全部 `font-weight:700`，h2 之間 margin 拉大到 40px（緊接版本資訊 blockquote 後的第一個 h2 例外，保持較近）
- 黃底引用區塊（`>` blockquote）開頭自動加 🦉 emoji（`::before` content）
- 表格 `width:100% !important; table-layout:fixed;`，字級跟內文一樣大（不用 Material 預設的縮小字）
- 數字清單（`<ol>`）改成藍底白字圓框，不用瀏覽器預設的 `1. 2. 3.`。**陷阱**：Material 主題對「巢狀 `<ol>`」（列表裡面又有一層列表）預設套用 `list-style-type: lower-alpha`（顯示成 a. b. c.），選擇器優先權比單純的 `.md-typeset ol` 高，會蓋掉我們的藍底圓框樣式。解法是選擇器要多寫一個 `.md-typeset ol ol`，兩個都設 `list-style:none`，巢狀清單才會跟第一層一樣套用圓框樣式
- 圖片（png/jpg/jpeg，排除裝飾用 GIF）自動加 1px 黑框
- 表格儲存格預設 `white-space:nowrap`，`.wrap` class 可覆蓋回 `normal`（但這個 class 現在其實用不太到了，因為 JS 會動態算並直接蓋 inline style）

**注意**：各分類的主題色（遊戲類教學紫／營運活動教學棕／競品指南綠／Git使用教學藍綠／其他文件教學藍灰）**不是**寫在 extra.css，是直接寫在 `index.md` 各個卡片的 `style="color:#7c6a9c"` 這種 inline style 裡，逐個 div 手動上色的。五個分類顏色代碼：
- 遊戲類教學：`#7c6a9c`（底色 `#f2f0f5`）
- 營運活動教學：`#a8734f`（底色 `#f7f0e8`）
- 競品指南：`#6f8f76`（底色 `#eff4f0`）
- Git使用教學：`#2f8f83`（底色 `#e6f3f1`）
- 其他文件教學：`#5b7c99`（底色 `#eef2f6`）

**卡片按鈕對齊陷阱**：首頁跟各分類索引頁的卡片（`display:grid` 裡一個個 `border:2px solid...` 的 div）用 CSS Grid 預設 `align-items:stretch` 會讓同一列的卡片自動等高，但如果卡片內只是單純 `h3` + `p` + `a`（查看按鈕）依序往下排，說明文字**字數不同、換行數不同**時按鈕會停在不同高度，同一列的按鈕看起來歪掉。解法是卡片 div 加 `display:flex;flex-direction:column;`，按鈕的 `<a>` 加 `margin-top:auto;`（不是固定的 `margin-top:16px`，那樣遇到兩行說明文字還是會被推低），auto margin 才會把按鈕確實貼到卡片底部，不管說明文字長短都對齊。新增卡片時要照這個寫法，不要複製舊卡片時漏掉這兩個屬性。

---

### 4. 獨立 HTML 頁面

`docs/` 底下有 5 個**完全獨立、自成一份的 HTML 檔案**（自己的 `<!DOCTYPE html><html><head><style>`），不是 MkDocs 用 Markdown 渲染出來的：

- `營運_文件生成指南.html`
- `營運_自動發布指南.html`
- `營運_推播教學.html`
- `競品優化_使用指南.html`（有對應的 `競品優化_使用指南.md`，但兩者已經不同步）
- `競品優化_管理者指南.html`（同上，對應 `競品優化_管理者指南.md`）

**這些檔案完全不會經過 `overrides/main.html` 這個模板**，因為 MkDocs 對 `docs/` 裡的 `.html` 檔案是直接原封不動複製到輸出資料夾，不會套用主題。這代表：
- 沒有石頭色頂部、沒有分類配色，維持自己內嵌 `<style>` 的舊樣式
- 主站的密碼保護、GIF 動畫**不會**自動套用（除非這幾個檔案自己也寫了）

**但「連結彙整＋星星收藏」功能已經個別注入到這 5 個檔案裡**（各自在 `<main id="content">` 的版本資訊後插入 `<div id="fav-link-summary">`，在 `</body>` 前插入一段自包含的 `<script>`，複製了跟 main.html 同一套收藏邏輯，靠同網域共用 localStorage 跟主站互通）。以後要改收藏系統的邏輯，記得**這 6 個地方要一起改**（`overrides/main.html` + 這 5 個 HTML 檔案），沒有共用機制可以一次改全部。

**`競品優化_使用指南.html`／`管理者指南.html` 的 `.md` 對應檔案已經名存實亡**：`競品優化/_維護/_embed.py`／`_embed_admin.py` 這兩支產生腳本從建立後就沒再被執行過，git 紀錄顯示後來都是直接手改 `.html`，兩邊內容已經分岔、不同步。改這兩個系統教學時要直接改 `.html`，不要以為改 `.md` 會自動同步過去。

---

## 🚀 部署流程

### GitHub Actions（一支）

**`deploy.yml`**：push 到 `main` 就觸發，`pip install mkdocs-material mkdocs-macros-plugin` → `mkdocs gh-deploy --force`。1-2 分鐘後 https://yayihuang-bit.github.io/sop-docs/ 更新。

**曾經還有一支 `update-md-metadata.yml`**，會在 push 後自動把文件的「撰寫日期」「BY」改成當天日期／推送者帳號，但持續執行失敗（`No jobs were run`），使用者確認後於 2026-07-31 直接移除，改回全手動維護。之後不會再有類似的自動化，除非重新建立。

---

## ✏️ 常見更新場景

### 情景 1：新增或修改文件內容
編輯 `docs/*.md` → push。「版本」「撰寫日期」「BY」**都要自己改**（沒有自動化）。

### 情景 2：加新頁面
1. `docs/` 新增 `.md`
2. `mkdocs.yml` 的 `nav:` 底下對應分類加一行
3. 如果內容裡有連結會跟別的頁面共用，用 `{{ links.xxx }}`（先在 `extra.links` 登記）
4. push

### 情景 3：某個網址要改，而且不只一個地方在用
改 `mkdocs.yml` 的 `extra.links` 對應那行，不用去每份文件找。

### 情景 4：改「我的常用連結」的預設值
1. `mkdocs.yml` 的 `extra.links` 加新代號
2. `overrides/main.html` 的 `DEFAULT_FAVORITES` 陣列加一筆，`category` 選 `遊戲類教學`／`營運活動教學`／`競品指南`／`Git使用教學`／`其他文件教學`／`其他`
3. 順手在 `docs/連結總表.md` 也加一筆做紀錄
4. 觸發本地伺服器重建驗證

### 情景 5：改密碼 / GIF 頻率 / 目錄寬度
同舊版說明，都在 `overrides/main.html` 裡（密碼寫死的字串、`FLY_MAX`、`FLY_GIFS` 陣列）。**現在桌面版側邊欄是隱藏的**（`display:none`，見 extra.css 的 `@media (min-width: 1221px)` 區塊），舊版文件講的 380px 寬度設定已經不適用。

### 情景 6：改導航菜單 / 加新分類
`mkdocs.yml` 的 `nav:`。如果是全新的大分類（不是塞進現有五個），記得：
- `getPageCategory()`（`overrides/main.html`）的正則要加新分類的路徑判斷
- `CATEGORY_ORDER`／`CATEGORY_COLORS` 也要加
- `index.md` 首頁跟該分類自己的索引頁（例如 `營運_索引.md`）都要加對應卡片，兩處要一起改，不然某一邊會漏

**分類只有單一頁面時，nav 可以扁平化**：不用硬寫成巢狀 `首頁:` 子選單，直接 `分類名稱: 檔名.md` 一行就好（例如 `其他文件教學: BUG回報方式.md`），跟 `競品指南: 競品指南_索引.md` 是同樣的寫法慣例。之後這個分類如果又加了第二頁，才需要改回巢狀結構加 `首頁:` 條目。

### 情景 7：加可下載的檔案（不是圖片，例如 .pptx／.docx 範本）
放到 `docs/files/`（沒有就新建），用 `[顯示文字](files/檔名)` 引用（跟 `docs/images/` 是平行的慣例）。MkDocs 會把整個資料夾原封不動複製到輸出網站，使用者點連結就會下載。**檔名跟連結文字最好一致**，不然使用者下載下來看到的檔名跟頁面上寫的對不上，會覺得怪。

---

## 🔍 Debug 常見問題

### 改了 overrides/main.html，本地預覽沒反應
`mkdocs serve` 不監看 `overrides/`。重啟伺服器，或碰一下 `docs/index.md` 的檔案修改時間強制觸發重建。

### 加了新的 plugin（例如 macros），本地預覽一直連不上/沒反應
Plugin 設定變更要整個重啟 `mkdocs serve` 進程，不是碰檔案時間能解決的，光重載不會重新載入 plugin。

### `{{ links.xxx }}` 在畫面上直接顯示成文字，沒被換成網址
確認：① `mkdocs.yml` 有沒有裝 `- macros`；② 代號有沒有在 `extra.links` 裡拼對；③ 這個語法只在 `.md` 檔案裡有效，**獨立 HTML 檔案裡完全不會被處理**，那邊要直接寫死網址。

### 站內搜尋打局部關鍵字找不到，但打完整字串找得到
八成是那段文字中英文黏在一起沒有空格（例如「活動獎勵機率公布survey」），被 lunr.js 索引成一整塊 token，只有打一模一樣的完整字串才會命中。解法：把文字改成中英文之間有空格分隔（例如「活動 獎勵 機率 公布 survey」），不管是放在條列清單還是卡片標題/說明裡，規則都一樣。`mkdocs.yml` 的 `search.lang` 曾經誤設成無效值 `zh-TW`（會靜默 fallback 成英文），已改成合法的 `zh`，但實測發現光改 `lang` 沒辦法解決這個問題，真正有效的還是「來源文字本身要留空格」。

### 常用連結分類跑到「其他」去
通常是瀏覽器裡已經存了分類功能上線前存的舊資料（`localStorage.sop_favorites` 裡的項目沒有 `category` 欄位）。`loadFavorites()` 已經有做「用網址比對 DEFAULT_FAVORITES 自動補分類」，但比對不到的舊項目還是只能落到「其他」，這是預期行為，不是 bug——因為系統真的不知道那個項目當初是從哪個分類頁面收藏的。

### 表格文字明明很短卻被強制換行 / 明明很長卻擠成一行不換行
八成是量測邏輯抓錯表格（例如頁面上有多個 table，選錯了）或是量測時機在 DOM 還沒完全 render 完。實際除錯方式：在瀏覽器 console 直接重跑 `autoWrapCells()` 內部邏輯，把 `containerWidth`／`targetPx`／量尺量到的 `naturalWidth` 都印出來比對，不要用儲存格自己的 `scrollWidth`/`clientWidth`（會被同欄其他儲存格撐寬污染，見上方「表格換行」陷阱說明）。

### 推送後網站沒有更新
1. 看 GitHub repo 的 Actions 分頁有沒有紅叉
2. 等 `deploy.yml` 跑完（通常 1-2 分鐘）
3. 清瀏覽器快取

---

## 💡 給 AI 的提示

**常見請求 → 對應改動：**

| 請求 | 改動檔案 | 備註 |
|------|---------|------|
| 改密碼 | `overrides/main.html` | 密碼字串寫死在 JS 裡 |
| 改 GIF 頻率/素材 | `overrides/main.html` | `FLY_MAX`／`FLY_GIFS` |
| 加新頁面 | `docs/*.md` + `mkdocs.yml` nav | |
| 改網站名稱 | `mkdocs.yml` | `site_name` |
| 改頂部顏色 | `docs/stylesheets/extra.css` | `[data-md-color-primary]` 那段，不是改 `mkdocs.yml` 的 `palette`（那個已經被蓋掉沒作用） |
| 某網址要一次改全部引用處 | `mkdocs.yml` 的 `extra.links` | 不要去每份文件找 |
| 加/改常用連結預設值 | `mkdocs.yml` extra.links + `overrides/main.html` 的 `DEFAULT_FAVORITES` | 兩處都要改，見「情景 4」 |
| 改表格換行邏輯 | `overrides/main.html` 的 `autoWrapCells` | 小心「同欄共用寬度」那個陷阱，見上方說明 |
| 改自動目錄邏輯 | `overrides/main.html` 裡「自動目錄」那個 IIFE | 讀的是渲染出來的 `h2.id`，不是手動加的 `<a id>` 錨點；排除 `#link-summary` 避免把「連結彙整」自己也列進去 |
| 改某分類主題色 / 新增一個大分類 | `docs/index.md` 逐個 inline style + `overrides/main.html` 的 `CATEGORY_COLORS`／`CATEGORY_ORDER`／`getPageCategory()` | 沒有集中管理，這幾處都要手動改，見「情景 6」 |
| 改 5 個獨立 HTML 頁面的收藏功能 | 這 5 個 `.html` 檔案各自的 `<script>` 區塊 | 跟 main.html 邏輯是分開複製的六份，沒有共用 |
| 放可下載的檔案（.pptx／.docx 等） | `docs/files/` | 見「情景 7」，不要放在 `docs/` 根目錄 |
| 標記重點提醒（粗體＋黃底） | 直接在 `.md` 裡寫 `<mark>⚠️ **文字**</mark>` | 不用改任何設定檔，純內文語法 |
| 改 `競品優化_使用指南/管理者指南.html` | 直接改 `.html`，不要改 `.md` | 兩邊已經不同步，`.md` 改了不會自動反映到 `.html` |
| 改動 `overrides/main.html` 或 `mkdocs.yml` plugins 後要驗證本地效果 | 先確認本地伺服器有重啟或重建，不然會看到舊版還以為沒生效 | |

---

## 🔗 相關連結

- **線上站點**：https://yayihuang-bit.github.io/sop-docs/
- **GitHub Repo**：https://github.com/yayihuang-bit/sop-docs
- **MkDocs 文檔**：https://www.mkdocs.org/
- **Material 主題**：https://squidfunk.github.io/mkdocs-material/
- **mkdocs-macros-plugin**：https://mkdocs-macros-plugin.readthedocs.io/
