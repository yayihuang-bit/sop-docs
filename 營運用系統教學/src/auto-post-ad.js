const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { findChrome } = require('./chrome-path.js');

const IMAGE_DIR = 'I:\\行銷部\\02_行銷美術\\包你發娛樂城\\01_官網燈箱';

const ALL_SECTIONS = [
    '官網設定-文章管理-QA測試用',
    '官網設定-文章管理-AI自動化用',
    '官網設定-廣告設定',
    'APP-公告系統-跑馬燈設定',
    'APP-客服系統-定時廣播',
];

function extractSection(allText, sectionName) {
    const idx = allText.indexOf(sectionName);
    if (idx === -1) return null;
    let endIdx = allText.length;
    for (const other of ALL_SECTIONS) {
        if (other === sectionName) continue;
        const otherIdx = allText.indexOf(other, idx + sectionName.length);
        if (otherIdx !== -1 && otherIdx < endIdx) endIdx = otherIdx;
    }
    return allText.slice(idx, endIdx);
}

function notify(title, message) {
    try {
        const urlMatch = message.match(/https?:\/\/\S+/);
        const url = urlMatch ? urlMatch[0] : null;
        const displayMsg = url
            ? message.replace(/\n*https?:\/\/\S+/, '').trimEnd() + '\n\n點擊確定後自動開啟文件'
            : message;
        const safeMsg   = displayMsg.replace(/"/g, '`"').replace(/\n/g, '`n');
        const safeTitle = title.replace(/"/g, '`"');
        const script = url
            ? `Add-Type -AssemblyName PresentationFramework; $r = [System.Windows.MessageBox]::Show("${safeMsg}", "${safeTitle}"); if ($r -eq "OK") { Start-Process "${url}" }`
            : `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show("${safeMsg}", "${safeTitle}")`;
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execSync(`powershell -EncodedCommand ${encoded}`, { stdio: 'ignore' });
    } catch (e) {}
}

// 偵測 Google 驗證頁面，等待使用者完成後再繼續
async function waitIfVerification(page) {
    if (page.url().includes('accounts.google.com')) {
        console.log('⚠️ Google 要求驗證身分，請在瀏覽器完成驗證...');
        notify('⚠️ Google 帳號驗證', '請在瀏覽器完成 Google 帳號驗證，完成後腳本將自動繼續。');
        await page.waitForURL(url => !url.href.includes('accounts.google.com'), { timeout: 300000 });
        await page.waitForTimeout(2000);
        console.log('✅ 驗證完成，繼續執行...');
    }
}

// 在指定資料夾搜尋含關鍵字的圖片，回傳最新的一個
function findImageFile(keyword, dir) {
    const targetDir = dir || IMAGE_DIR;
    if (!fs.existsSync(targetDir)) {
        console.log(`⚠️ 找不到圖片資料夾：${targetDir}`);
        return null;
    }
    const allJpg = fs.readdirSync(targetDir).filter(f => /\.(jpg|jpeg)$/i.test(f));
    if (allJpg.length === 0) return null;

    // 1. 先試完整字串包含
    let matched = allJpg.filter(f => f.includes(keyword));

    // 2. 找不到時，拆成數字段 + 中文段分別比對（處理 0401冥神... → 260401_..._冥神... 這類命名）
    if (matched.length === 0) {
        const tokens = keyword.match(/\d+|[一-鿿！!？?～~]+/g) || [keyword];
        matched = allJpg.filter(f => tokens.every(t => f.includes(t)));
        if (matched.length > 0) {
            console.log(`🖼️ 關鍵字拆段比對，tokens: [${tokens.join(', ')}]`);
        }
    }

    if (matched.length === 0) return null;

    matched.sort((a, b) =>
        fs.statSync(path.join(targetDir, b)).mtime - fs.statSync(path.join(targetDir, a)).mtime
    );
    console.log(`🖼️ 找到圖片：${matched[0]}${matched.length > 1 ? ` (共 ${matched.length} 個符合，取最新)` : ''}`);
    return path.join(targetDir, matched[0]);
}

// 找不到圖片時，用 Windows 檔案選擇器讓使用者手動選圖（最前面顯示）
function askUserForImage(keyword, dir) {
    try {
        const tmpFile = path.join(__dirname, '_img_select.tmp');
        const targetDir = dir || IMAGE_DIR;
        const initDir = fs.existsSync(targetDir) ? targetDir : 'C:\\';
        const safeInit = initDir.replace(/\\/g, '\\\\');
        const safeTmp  = tmpFile.replace(/\\/g, '\\\\');
        const safeKw   = keyword.replace(/'/g, "''");
        const script = [
            `Add-Type -AssemblyName System.Windows.Forms`,
            `$owner = New-Object System.Windows.Forms.Form`,
            `$owner.TopMost = $true`,
            `$owner.ShowInTaskbar = $false`,
            `$owner.WindowState = 'Minimized'`,
            `$owner.Show()`,
            `$d = New-Object System.Windows.Forms.OpenFileDialog`,
            `$d.Title = '找不到符合「${safeKw}」的圖片，請手動選擇'`,
            `$d.Filter = '圖片檔案 (*.jpg;*.jpeg)|*.jpg;*.jpeg'`,
            `$d.InitialDirectory = '${safeInit}'`,
            `if ($d.ShowDialog($owner) -eq 'OK') { [System.IO.File]::WriteAllText('${safeTmp}', $d.FileName, [System.Text.Encoding]::UTF8) }`,
            `$owner.Dispose()`,
        ].join('\n');
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execSync(`powershell -EncodedCommand ${encoded}`, { stdio: 'ignore' });
        if (fs.existsSync(tmpFile)) {
            const p = fs.readFileSync(tmpFile, 'utf8').trim();
            fs.unlinkSync(tmpFile);
            return p || null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// 正規化字串：去空白、零寬字元、統一全形標點
function normalizeStr(s) {
    return (s || '').trim()
        .replace(/[​‌‍﻿]/g, '')  // 零寬字元
        .replace(/　/g, ' ')                      // 全形空格
        .replace(/\s+/g, ' ')
        .trim();
}

// Sørensen-Dice bigram 相似度，適合中文字串比對
function similarity(a, b) {
    if (!a || !b) return 0;
    const bigrams = s => {
        const bg = new Set();
        for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
        return bg;
    };
    const ba = bigrams(a), bb = bigrams(b);
    let inter = 0;
    for (const bg of ba) if (bb.has(bg)) inter++;
    return (2 * inter) / (ba.size + bb.size);
}

// 去後台文章管理，用搜尋框輸入廣告註解關鍵字，取第一筆符合的文章 ID
async function autoFindArticleId(page, note) {
    console.log(`🔍 自動查詢文章 ID（廣告註解：${note}）...`);
    await page.goto(`${BACKSTAGE_URL}/index`);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '官網設定' }).click();
    await page.getByRole('navigation').getByRole('link', { name: '文章管理' }).click();
    await page.waitForTimeout(2000);

    const frame = page.locator('#hbsIframe').contentFrame();
    const searchInput = frame.locator('input[type="search"]');
    try {
        await searchInput.waitFor({ state: 'visible', timeout: 30000 });
    } catch {
        console.log('⚠️ 文章管理搜尋框載入失敗');
        return null;
    }

    // 取前 10 字當搜尋關鍵字
    const keyword = note.slice(0, 10);
    await searchInput.fill(keyword);
    await page.waitForTimeout(2500);  // 等 DataTable 更新

    const normNote = normalizeStr(note);

    // 讀取所有搜尋結果，取 ID 最大（最新）且相似度足夠的那筆
    try {
        const rows = frame.locator('table#datatable tbody tr');
        const count = await rows.count();
        if (count === 0) {
            console.log('⚠️ 搜尋結果為空');
            return null;
        }

        let bestId = null, bestTitle = '', bestScore = 0;
        for (let i = 0; i < count; i++) {
            const row = rows.nth(i);
            const cells = row.locator('td');
            const cellCount = await cells.count();
            // 「沒有符合記錄」的 placeholder row 只有 1 格
            if (cellCount < 3) continue;

            const idText = (await cells.nth(0).textContent({ timeout: 5000 }))?.trim();
            if (!idText || !/^\d+$/.test(idText)) continue;

            // 嘗試所有欄位，取與 note 相似度最高的
            let rowBestScore = 0, rowBestText = '';
            for (let c = 1; c < cellCount; c++) {
                const cellText = normalizeStr((await cells.nth(c).textContent({ timeout: 5000 })) || '');
                if (!cellText) continue;
                const isExact = cellText === normNote;
                const sc = isExact ? 1.0 : similarity(normNote, cellText);
                if (sc > rowBestScore) { rowBestScore = sc; rowBestText = cellText; }
            }

            console.log(`  → ID ${idText}：最佳欄「${rowBestText}」相似度 ${Math.round(rowBestScore * 100)}%`);

            const numId = parseInt(idText, 10);
            if (rowBestScore >= 0.4 && numId > (parseInt(bestId || '0', 10))) {
                bestId = idText;
                bestTitle = rowBestText;
                bestScore = rowBestScore;
            }
        }

        if (bestId) {
            console.log(`✅ 找到文章：「${bestTitle}」→ ID: ${bestId}（相似度 ${Math.round(bestScore * 100)}%）`);
            return bestId;
        }

        console.log(`⚠️ 搜尋結果相似度不足，改手動輸入`);
        return null;
    } catch (e) {
        console.log(`⚠️ 讀取搜尋結果失敗：${e.message}`);
        return null;
    }
}

// 自動找不到時彈 Windows 輸入框，讓使用者手動填文章 ID
function askUserForArticleId(note) {
    try {
        const tmpFile = path.join(__dirname, '_article_id.tmp');
        const safeTmp  = tmpFile.replace(/\\/g, '\\\\');
        const safeNote = note.replace(/'/g, "''");
        const script = `Add-Type -AssemblyName System.Windows.Forms\n$f = New-Object System.Windows.Forms.Form\n$f.Text = '請輸入文章 ID'\n$f.Width = 440\n$f.Height = 160\n$f.StartPosition = 'CenterScreen'\n$f.TopMost = $true\n$l = New-Object System.Windows.Forms.Label\n$l.Text = '自動找不到符合「${safeNote}」的文章，請手動輸入文章 ID：'\n$l.Location = '12,12'\n$l.Size = '410,40'\n$t = New-Object System.Windows.Forms.TextBox\n$t.Location = '12,55'\n$t.Width = 410\n$ok = New-Object System.Windows.Forms.Button\n$ok.Text = '確定'\n$ok.Location = '220,88'\n$ok.DialogResult = 'OK'\n$skip = New-Object System.Windows.Forms.Button\n$skip.Text = '跳過此份'\n$skip.Location = '315,88'\n$skip.DialogResult = 'Cancel'\n$f.Controls.AddRange(@($l, $t, $ok, $skip))\n$f.AcceptButton = $ok\n$f.CancelButton = $skip\nif ($f.ShowDialog() -eq 'OK' -and $t.Text.Trim() -ne '') { [System.IO.File]::WriteAllText('${safeTmp}', $t.Text.Trim(), [System.Text.Encoding]::UTF8) }`;
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execSync(`powershell -EncodedCommand ${encoded}`, { stdio: 'ignore' });
        if (fs.existsSync(tmpFile)) {
            const id = fs.readFileSync(tmpFile, 'utf8').trim();
            fs.unlinkSync(tmpFile);
            return id || null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// 時間格式轉換：2026/4/1 13:00:00 → 2026-04-01 13:00:00
function formatTime(str) {
    if (!str) return '';
    return str.trim().replace(/(\d{4})\/(\d{1,2})\/(\d{1,2})/, (_, y, m, d) =>
        `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    );
}

const configPath = path.join(__dirname, '..', '系統資料', 'config.json');
const config = require(configPath);
const BACKSTAGE_URL = config.backstage.url;

let currentDocId = '';
process.on('uncaughtException', (err) => {
    console.error(`❌ 錯誤：${err.message}`);
    const docUrl = currentDocId ? `\n\nhttps://docs.google.com/document/d/${currentDocId}/edit` : '';
    notify('❌ 廣告設定錯誤', `執行時發生錯誤：\n${err.message}${docUrl}`);
    process.exit(1);
});

(async () => {
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        executablePath: findChrome(),
    });

    const page = await browserContext.pages()[0] || await browserContext.newPage();

    // ── 網路重試：開啟後偶爾因前一腳本剛關閉 Chrome 而暫時被封鎖 ──
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await page.goto(`${BACKSTAGE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
            const title = await page.title();
            const content = await page.content().catch(() => '');
            if (title.includes('封鎖') || title.includes('找不到') || title.includes('無法') ||
                content.includes('ERR_NETWORK_ACCESS_DENIED') || content.includes('存取權遭到封鎖')) {
                console.log(`⚠️ 網路暫時被封鎖，${5}秒後重試 (${attempt + 1}/3)...`);
                await page.waitForTimeout(5000);
                continue;
            }
            break;
        } catch (e) {
            if (attempt < 2) {
                console.log(`⚠️ 頁面載入失敗，5秒後重試 (${attempt + 1}/3)...`);
                await page.waitForTimeout(5000);
            }
        }
    }

    // ── Step 1: 登入後台 ──
    console.log('1. 正在前往後台並登入...');
    try {
        await page.goto(`${BACKSTAGE_URL}/login`);
        const usernameInput = page.getByRole('textbox', { name: '請輸入帳號' });
        if (await usernameInput.isVisible({ timeout: 3000 })) {
            await usernameInput.fill(config.backstage.username);
            await page.getByRole('textbox', { name: '請輸入密碼' }).fill(config.backstage.password);
            await page.getByRole('button', { name: '登入' }).click();
            console.log('✅ 後台登入成功');
        } else {
            console.log('✅ 後台已是登入狀態');
        }
        await page.waitForTimeout(2500);
        try {
            const backdrop = page.locator('.MuiBackdrop-root');
            if (await backdrop.isVisible({ timeout: 2000 })) {
                await backdrop.click();
                await page.waitForTimeout(300);
            }
        } catch {}
    } catch (e) {
        console.log('✅ 後台已是登入狀態');
    }

    // ── Step 2: 取得文件清單 ──
    const WEB_LIST = path.join(__dirname, '_web_doc_list.json');
    if (!fs.existsSync(WEB_LIST)) {
        console.log('❌ 找不到文件清單，請使用控制台「試算表自動化」功能。');
        await browserContext.close();
        return;
    }
    const docIds = JSON.parse(fs.readFileSync(WEB_LIST, 'utf8'));
    console.log(`\n2. 使用試算表文件清單：${docIds.length} 份`);
    if (docIds.length === 0) {
        console.log('❌ 文件清單為空，腳本終止。');
        await browserContext.close();
        return;
    }

    // ── Step 3: 逐個處理文件 ──
    let failCount = 0;
    const failedDocIds = [];
    const successDocIds = [];
    for (let i = 0; i < docIds.length; i++) {
        const docId = docIds[i];
        currentDocId = docId;
        console.log(`\n▶️ 開始處理第 ${i + 1} 份文件 (ID: ${docId})`);

        await page.goto(`https://docs.google.com/document/d/${docId}/edit`);
        await page.waitForTimeout(2000);
        await waitIfVerification(page);

        // 確認是可開啟的 Google Docs；第一次可能短暫顯示錯誤頁，自動 reload 一次
        let editorOk = await page.locator('.kix-appview-editor').isVisible({ timeout: 10000 }).catch(() => false);
        if (!editorOk) {
            console.log(`⚠️ ${docId} 載入異常，reload 重試...`);
            await page.reload();
            await page.waitForTimeout(2000);
            editorOk = await page.locator('.kix-appview-editor').isVisible({ timeout: 20000 }).catch(() => false);
        }
        if (!editorOk) {
            console.log(`⚠️ ${docId} 非 Google Docs 或無法開啟，跳過`);
            failedDocIds.push(docId); failCount++;
            continue;
        }

        // 全選複製整份文件
        await page.locator('.kix-appview-editor').click();
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+A');
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+C');
        await page.waitForTimeout(1000);

        // 貼到沙盒取得全文
        await page.evaluate(() => {
            let old = document.getElementById('crawler-sandbox');
            if (old) old.remove();
            const sandbox = document.createElement('div');
            sandbox.id = 'crawler-sandbox';
            sandbox.contentEditable = 'true';
            sandbox.style.cssText = 'position:fixed;top:0;left:0;opacity:0.01;z-index:9999;';
            document.body.appendChild(sandbox);
            sandbox.focus();
        });
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(1000);

        const allText = await page.evaluate(() => {
            const sandbox = document.getElementById('crawler-sandbox');
            return sandbox ? sandbox.innerText : '';
        });

        // 擷取「官網設定-廣告設定」區段
        const sectionText = extractSection(allText, '官網設定-廣告設定');
        if (!sectionText) {
            console.log('⚠️ 找不到「官網設定-廣告設定」區段，跳過此文件');
            notify('⚠️ 廣告設定警告', `第 ${i + 1} 份文件找不到「官網設定-廣告設定」區段，已跳過。\n\nhttps://docs.google.com/document/d/${docId}/edit`);
            failedDocIds.push(docId); failCount++;
            continue;
        }

        // 解析各欄位
        const get = (key) => {
            const m = sectionText.match(new RegExp(key + '[：:][^\\S\\n]*([^\\n]*)', 'i'));
            return m ? m[1].trim() : '';
        };
        const extracted = {
            section:    get('版位'),
            note:       get('廣告註解'),
            linkType:   get('超連結方式'),
            articleId:  get('文章Id'),
            linkUrl:    get('外連網址'),
            imgKeyword: get('圖片關鍵字'),
            imgDir:     get('圖檔位置'),
            startTime:  get('上架時間'),
            endTime:    get('下架時間'),
        };

        console.log(`📋 版位: ${extracted.section}`);
        console.log(`📝 廣告註解: ${extracted.note}`);
        console.log(`🔗 超連結方式: ${extracted.linkType}`);
        console.log(`🖼️ 圖片關鍵字: ${extracted.imgKeyword}`);
        console.log(`⏰ 上架: ${extracted.startTime} ～ ${extracted.endTime}`);

        // 內連網址但 articleId 空白 → 自動查詢，找不到再彈手動輸入框
        if (extracted.linkType === '內連網址' && !extracted.articleId) {
            extracted.articleId = await autoFindArticleId(page, extracted.note)
                || askUserForArticleId(extracted.note)
                || '';
        }
        console.log(`📌 [articleId 確認] linkType=${extracted.linkType}，articleId="${extracted.articleId}"`);

        // 必填欄位驗證
        const missingFields = [];
        if (!extracted.section)    missingFields.push('版位');
        if (!extracted.imgKeyword) missingFields.push('圖片關鍵字');
        if (!extracted.startTime)  missingFields.push('上架時間');
        if (!extracted.endTime)    missingFields.push('下架時間');
        if (extracted.linkType === '內連網址' && !extracted.articleId) missingFields.push('文章ID');
        if (extracted.linkType === '外連網址' && !extracted.linkUrl)   missingFields.push('連結網址');

        if (missingFields.length > 0) {
            const msg = `第 ${i + 1} 份文件以下欄位解析不到，已跳過：\n${missingFields.join('、')}\n\nhttps://docs.google.com/document/d/${docId}/edit`;
            console.log(`⚠️ ${msg}`);
            notify('⚠️ 廣告設定警告', msg);
            failedDocIds.push(docId); failCount++;
            continue;
        }

        // ── 前往後台填表 ──
        console.log('🚀 前往後台填廣告設定...');
        await page.goto(`${BACKSTAGE_URL}/index`);
        await page.waitForTimeout(2000);
        await page.getByRole('button', { name: '官網設定' }).click();
        await page.getByRole('navigation').getByRole('link', { name: '廣告設定' }).click();
        await page.waitForTimeout(2000);

        const frame = page.locator('#hbsIframe').contentFrame();

        // 等 iframe 載入
        await frame.locator('#SectionSelect').waitFor({ state: 'visible', timeout: 60000 });

        // 1. 版位（選完後等 iframe 表單穩定）
        await frame.locator('#SectionSelect').selectOption({ label: extracted.section });
        await page.waitForLoadState('networkidle');
        await frame.locator('#TargetType').waitFor({ state: 'visible', timeout: 15000 });

        // 2. 廣告註解
        await frame.getByRole('textbox', { name: '廣告註解' }).fill(extracted.note || '');

        // 3. 超連結方式 + 文章ID / 連結網址
        await frame.locator('#TargetType').selectOption({ label: extracted.linkType });
        await page.waitForTimeout(800);
        if (extracted.linkType === '內連網址' && extracted.articleId) {
            console.log(`🔗 填入文章 ID: ${extracted.articleId}`);
            const articleInput = frame.getByRole('textbox', { name: '文章Id 上架時間 下架時間' });
            await articleInput.waitFor({ state: 'visible', timeout: 5000 });
            await articleInput.fill(extracted.articleId);
        } else if (extracted.linkType === '外連網址' && extracted.linkUrl) {
            console.log(`🔗 填入外連網址: ${extracted.linkUrl}`);
            await frame.locator('#TargetUrl').waitFor({ state: 'visible', timeout: 5000 });
            await frame.locator('#TargetUrl').fill(extracted.linkUrl);
        }

        // 4. 搜尋圖片（進入後台後才選，讓使用者看著廣告設定頁選圖）
        const imgDir = extracted.imgDir || IMAGE_DIR;
        console.log(`📁 圖片資料夾：${imgDir}`);
        let imgPath = findImageFile(extracted.imgKeyword, imgDir);
        if (!imgPath) {
            console.log(`⚠️ 找不到符合「${extracted.imgKeyword}」的圖片，開啟手動選擇視窗...`);
            imgPath = askUserForImage(extracted.imgKeyword, imgDir);
            if (!imgPath) {
                console.log('⚠️ 未選擇圖片，暫停腳本。請在 Playwright Inspector 按 Resume 繼續（此份文件將跳過）');
                failedDocIds.push(docId); failCount++;
                await page.pause();
                continue;
            }
            console.log(`🖼️ 手動選擇：${path.basename(imgPath)}`);
        }

        // 5. 上傳圖片
        console.log(`📤 上傳圖片：${path.basename(imgPath)}`);
        await frame.getByRole('link', { name: '圖片選擇' }).click();
        await page.waitForTimeout(1000);

        const uploadBtn = frame.getByRole('button', { name: '於項目內新增相片' });
        await uploadBtn.setInputFiles(imgPath);
        await page.waitForTimeout(1000);

        // 送出上傳
        await frame.locator('#SendPicture').click();
        await page.waitForTimeout(2000);

        // 選取剛上傳的圖片（第一個）
        await frame.locator('[id^="pictureSelected_"]').first().check();
        await page.waitForTimeout(500);
        await frame.getByRole('button', { name: '確定選取' }).click();
        await page.waitForTimeout(1000);

        // 6. 上架時間
        await frame.locator('#StartTime').fill(formatTime(extracted.startTime));
        await page.waitForTimeout(300);

        // 7. 下架時間
        await frame.locator('#EndTime').fill(formatTime(extracted.endTime));
        await page.waitForTimeout(500);

        // 8. 送出
        let docSuccess = true;
        page.once('dialog', async dialog => {
            const msg = dialog.message();
            if (msg.includes('請') || msg.includes('錯誤') || msg.includes('失敗')) {
                console.log(`⚠️ 後台回應錯誤: "${msg}"`);
                notify('⚠️ 廣告設定警告', `第 ${i + 1} 份後台回應錯誤：\n${msg}\n\nhttps://docs.google.com/document/d/${docId}/edit`);
                docSuccess = false;
                await dialog.dismiss();
            } else {
                console.log(`💬 彈窗: "${msg}"，自動確定`);
                await dialog.accept();
            }
        });
        await frame.locator('#InsertItem').click();
        await page.waitForTimeout(2000);
        if (!docSuccess) {
            failedDocIds.push(docId); failCount++;
            console.log(`❌ 第 ${i + 1} 份廣告設定失敗`);
        } else {
            successDocIds.push(docId);
            console.log(`✅ 第 ${i + 1} 份廣告設定完成！`);
        }
        await page.waitForTimeout(3000);
    }

    console.log('\n🎉 所有廣告設定完畢！');
    const writeIds = (file, ids) => {
        if (!ids.length) return;
        const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
        fs.writeFileSync(file, JSON.stringify([...new Set([...prev, ...ids])]));
    };
    writeIds(path.join(__dirname, '_web_failures.json'), failedDocIds);
    writeIds(path.join(__dirname, '_web_successes.json'), successDocIds);
    await browserContext.close();
    if (failCount > 0) process.exit(1);
})();
