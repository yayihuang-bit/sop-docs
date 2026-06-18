# SOP 文件站 - 架構說明 (for AI)

## 📋 快速概覽

這是用 **MkDocs** 搭配 **GitHub Pages** 的文件站。特點：

- **靜態站點**：部署到 GitHub Pages，自動更新
- **密碼保護**：所有頁面都有登入認證（密碼：asd12345）
- **Flying GIFs**：頁面會隨機播放飛行的 gif
- **適應式寬度**：左邊目錄寬 380px，內容區域自適應

---

## 📁 目錄結構

```
sop-docs/
├── mkdocs.yml              # MkDocs 配置文件
├── README.md               # 專案說明（不是文件內容，只是舊的）
├── ARCHITECTURE.md         # 這個檔案（給 AI 用）
├── docs/
│   ├── index.md            # 首頁
│   └── 遊戲上線SOP.md      # 文件內容
├── overrides/
│   └── main.html           # 自訂 HTML override（密碼 + gif 邏輯）
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions 自動部署
└── .git/                   # Git 版本控制
```

---

## 🔧 核心組件

### 1. **mkdocs.yml** - 配置文件

```yaml
site_name: SOP 文件                    # 網站標題
site_url: https://yayihuang-bit.github.io/sop-docs/
theme:
  name: material                        # Material Design 主題
  language: zh                          # 繁體中文
  features:
    - navigation.instant                # 快速導航（無刷新）
    - navigation.tracking               # 導航追蹤
    - navigation.tabs                   # 標籤導航
    - navigation.top                    # 回到頂部按鈕
    - toc.integrate                     # 整合目錄
    - search.suggest                    # 搜尋建議
    - search.highlight                  # 搜尋高亮
  custom_dir: overrides                 # 使用 overrides 資料夾內的自訂檔案

nav:                                    # 導航菜單
  - 首頁: index.md
  - 遊戲上線 SOP: 遊戲上線SOP.md
```

**如何更新：**
- 加新頁面：在 `docs/` 新增 `.md` 檔案，然後在 `nav:` 底下加一行
- 改顏色：修改 `palette` → `primary` / `accent` 欄位

---

### 2. **overrides/main.html** - 密碼 + GIF 邏輯

這是 Material 主題的 override 檔案，主要包含三部分：

#### A. 密碼保護邏輯（第 3-19 行）

```html
<script>
  if (localStorage.getItem('sop_authenticated') !== 'true') {
    // 顯示密碼框，覆蓋整個頁面
    document.documentElement.innerHTML = '...密碼框 HTML...';
    // 檢查密碼是否正確
    // 正確 → 存到 localStorage + 重新載入頁面
    // 錯誤 → 顯示錯誤訊息
  }
</script>
```

**邏輯流程：**
1. 頁面載入 → 檢查 `localStorage.sop_authenticated`
2. 沒有 or 值不是 `'true'` → 顯示密碼框，覆蓋所有內容
3. 輸入 `asd12345` → 存到 localStorage + `location.reload()`
4. 下次訪問 → 直接跳過密碼框（localStorage 在本地瀏覽器保存）

**修改密碼：**
```javascript
if(document.getElementById('pwd-input').value === 'asd12345'){  // ← 改這裡
```

#### B. CSS 樣式（第 9-30 行）

```css
.md-sidebar--primary {
  width: 380px !important;              /* 桌面版左邊目錄寬度 */
}
.md-content__inner {
  max-width: none !important;           /* 移除內容最大寬度限制 */
}
.md-typeset {
  max-width: none !important;           /* 移除文字區寬度限制 */
}
@media (max-width: 1024px) {
  .md-sidebar--primary {
    width: 85vw !important;             /* 平板版：螢幕寬度的 85% */
    max-width: 300px !important;
  }
}
@media (max-width: 480px) {
  .md-sidebar--primary {
    width: 90vw !important;             /* 手機版：螢幕寬度的 90% */
    max-width: 280px !important;
  }
}
```

**調整寬度：**
- **桌面版**：改 `380px` 為其他數值
- **平板版**（1024px 以下）：改 `85vw` 和 `300px`
- **手機版**（480px 以下）：改 `90vw` 和 `280px`
- 使用 `vw` (視口寬度百分比) 讓菜單自適應螢幕，不會超出邊界

#### C. Flying GIFs（第 28-170 行）

隨機播放的動畫邏輯：

```javascript
var FLY_GIFS = [
  'https://media2.giphy.com/media/...',  // gif URL 列表
  'https://media4.giphy.com/media/...',
  // ...6 個 gif
];

function triggerFlyGif(){
  // 隨機選一個 gif
  // 右邊界飛到左邊界（動畫 2.5-7.5 秒）
  // 上下波動（wave 動畫）
  // 可以拖動（mousedown/up）
}

function scheduleFlyGif(){
  // 每隔 30-90 秒觸發一次
  // 最多同時 3 個 gif
  // 页面隱藏時暫停（visibilitychange 事件）
}
```

**修改 GIF 播放：**
- 改頻率：找 `(30 + Math.random() * 60) * 1000` 這行，數字越小越頻繁
- 改最多同時數：找 `var FLY_MAX = 3` 改成別的數字
- 換 GIF：修改 `FLY_GIFS` 陣列裡的 URL

---

## 🚀 部署流程

### GitHub Actions 自動部署

檔案：`.github/workflows/deploy.yml`

每次 push 到 `main` 分支時，自動執行：
1. 檢出程式碼
2. 安裝 Python + MkDocs + Material 主題
3. Build 靜態網站到 `site/` 資料夾
4. 推送到 `gh-pages` 分支
5. GitHub Pages 發佈

**需要推送才能看到更新。** 本地改好後：
```bash
git add .
git commit -m "描述改動"
git push
```

1-2 分鐘後在 https://yayihuang-bit.github.io/sop-docs/ 看到更新。

---

## ✏️ 常見更新場景

### 📝 情景 1：新增或修改文件內容

**步驟：**
1. 編輯 `docs/` 底下的 `.md` 檔案
2. Push 到 GitHub
3. 等 1-2 分鐘，網站自動更新

**注意：**
- 密碼保護會自動套用到所有頁面（不需要每頁都加）
- GIF 動畫也是全站套用

### 🎨 情景 2：改密碼

**步驟：**
1. 打開 `overrides/main.html`
2. 找到 `if(document.getElementById('pwd-input').value === 'asd12345'){` 這行
3. 改 `'asd12345'` 為新密碼
4. Push

**注意：**
- localStorage 會記住舊密碼，使用者需要清快取 (Ctrl+Shift+Del) 才能重新輸入

### 🌈 情景 3：修改左邊目錄寬度

**步驟：**
1. 打開 `overrides/main.html`
2. 找 `.md-sidebar--primary { width: 380px !important; }`
3. 改 `380px` 為你要的寬度（如 `420px`）
4. Push

### 🎬 情景 4：改 GIF 播放頻率或數量

**步驟：**
1. 打開 `overrides/main.html`
2. 找 `var FLY_MAX = 3;` → 改同時最多幾個 gif
3. 找 `(30 + Math.random() * 60) * 1000` → 改播放間隔時間（毫秒）
   - `30-90` 秒：`(30 + Math.random() * 60) * 1000`
   - `10-30` 秒：`(10 + Math.random() * 20) * 1000`
4. Push

### 📌 情景 5：換 GIF 素材

**步驟：**
1. 打開 `overrides/main.html`
2. 找 `var FLY_GIFS = [` 這段
3. 把 `'https://media...giphy.gif'` 換成新 URL
4. Push

**找 GIF URL 的方法：**
- 在 Giphy / Tenor 找想要的 GIF
- 右鍵 → 複製圖片連結
- 貼進去就行

### 🎯 情景 6：改導航菜單

**步驟：**
1. 打開 `mkdocs.yml`
2. 修改 `nav:` 段落：
   ```yaml
   nav:
     - 首頁: index.md
     - 遊戲上線 SOP: 遊戲上線SOP.md
     - 新頁面: 路徑/新文件.md  # ← 加這行
   ```
3. Push

---

## 🔍 Debug 常見問題

### 問題：推送後網站沒有更新

**原因可能：**
1. GitHub Actions 還在執行（1-2 分鐘）
2. 瀏覽器快取（Ctrl+Shift+Del 清快取）
3. 檔案名稱大小寫錯誤（Linux 區分大小寫）

**解決方案：**
- 檢查 GitHub repo 的 Actions 分頁，看是否有紅叉
- 清瀏覽器快取
- 確認檔案路徑拼寫

### 問題：密碼輸入後又跳密碼框

**原因：**
localStorage 沒有正確存取（跨域或隱私模式）

**解決方案：**
- 清快取試試
- 不用隱私模式

### 問題：GIF 沒有播放

**原因可能：**
1. 頁面還沒認證（沒輸密碼）
2. GIF URL 失效（Giphy 刪除了）
3. 瀏覽器閹割了（某些瀏覽器對動畫限制）

**解決方案：**
- 先輸入密碼
- 檢查 GIF URL 是否還能訪問
- 試試其他瀏覽器

### 問題：手機上點左上角菜單，菜單寬度超過螢幕

**原因：**
菜單寬度 380px 在手機螢幕上太寬

**解決方案：**
已修復！使用響應式設計：
- 1024px 以下（平板/手機）：自動調整為 `85vw` / `90vw`
- 480px 以下（小手機）：進一步縮小至最大 280px
- 菜單現在會自適應螢幕寬度，不會超出邊界

---

## 💡 給 AI 的提示

如果使用者要求更新此站，請參考這份文件：

**常見請求 → 對應改動：**

| 請求 | 改動檔案 | 位置 |
|------|--------|------|
| 改密碼 | `overrides/main.html` | 第 ~51 行 |
| 改 GIF 頻率 | `overrides/main.html` | 第 ~132、140 行 |
| 加新頁面 | `docs/` 新增 `.md` + `mkdocs.yml` | nav 段落 |
| 改目錄寬度（含手機版） | `overrides/main.html` | 第 ~10-30 行 CSS 區塊 |
| 改網站名稱 | `mkdocs.yml` | `site_name` 欄位 |
| 改顏色主題 | `mkdocs.yml` | `palette` 段落 |
| 換 GIF 素材 | `overrides/main.html` | 第 ~70-76 行 `FLY_GIFS` 陣列 |

---

## 🔗 相關連結

- **線上站點**：https://yayihuang-bit.github.io/sop-docs/
- **GitHub Repo**：https://github.com/yayihuang-bit/sop-docs
- **MkDocs 文檔**：https://www.mkdocs.org/
- **Material 主題**：https://squidfunk.github.io/mkdocs-material/
