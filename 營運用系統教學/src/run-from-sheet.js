const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { findChrome } = require('./chrome-path.js');

const SHEET_ID  = '1qmRZ-OT-PW6IzQFoJatZKf8fMUwnnBX-gyYHZCxuL1E';
const SHEET_GID = '1234248588';

const STATUS_TRIGGER = '待設定';
const STATUS_DONE    = '已完成';

// 官網腳本讀這個 / APP 腳本讀這個
const WEB_LIST_FILE = path.join(__dirname, '_web_doc_list.json');
const APP_LIST_FILE = path.join(__dirname, '_app_doc_list.json');

function parseCSV(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inQ) {
            if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQ = false; }
            else { cur += ch; }
        } else {
            if (ch === '"') { inQ = true; }
            else if (ch === ',') { row.push(cur); cur = ''; }
            else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
            else { cur += ch; }
        }
    }
    row.push(cur);
    if (row.some(c => c)) rows.push(row);
    return rows;
}

async function waitIfVerification(page) {
    if (page.url().includes('accounts.google.com')) {
        console.log('⚠️ 請完成 Google 帳號驗證...');
        await page.waitForURL(u => !u.href.includes('accounts.google.com'), { timeout: 300000 });
        await page.waitForTimeout(2000);
    }
}

// 透過 URL 選中儲存格，複製後貼入沙盒讀取超連結 href，回傳 Google Doc ID
async function getDocIdFromCell(page, cellRef) {
    try {
        await page.goto(
            `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}&range=${cellRef}`
        );
        await page.waitForTimeout(3000);

        // 確保在瀏覽模式（非編輯模式），再複製儲存格
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+c');
        await page.waitForTimeout(500);

        // 貼入沙盒讀取 HTML，Google Sheets 複製時保留超連結 <a href>
        await page.evaluate(() => {
            let old = document.getElementById('cell-link-sandbox');
            if (old) old.remove();
            const div = document.createElement('div');
            div.id = 'cell-link-sandbox';
            div.contentEditable = 'true';
            div.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;overflow:hidden;z-index:9999;';
            document.body.appendChild(div);
            div.focus();
        });
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(500);

        const href = await page.evaluate(() => {
            const sandbox = document.getElementById('cell-link-sandbox');
            if (!sandbox) return null;
            const a = sandbox.querySelector('a[href*="docs.google.com"]')
                   || sandbox.querySelector('a[href*="drive.google.com"]');
            return a ? a.href : null;
        });

        if (href) {
            // docs.google.com/document/d/[ID]
            let m = href.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
            if (m) return m[1];
            // drive.google.com/file/d/[ID] 或 /d/[ID]
            m = href.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (m) return m[1];
            // drive.google.com/open?id=[ID]
            m = href.match(/[?&]id=([a-zA-Z0-9-_]+)/);
            if (m) return m[1];
        }

        console.log(`⚠️ ${cellRef} 找不到 Google Doc 超連結`);
        return null;
    } catch (e) {
        console.log(`⚠️ 讀取 ${cellRef} 失敗: ${e.message.slice(0, 80)}`);
        return null;
    }
}

// 透過 Name Box 導航至儲存格並設定下拉選單值
async function updateSheetCell(page, cellRef, value) {
    try {
        // 用 ?gid= 查詢參數確保切到正確分頁（hash 方式可能被上一個 session 狀態覆蓋）
        await page.goto(
            `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}&range=${cellRef}`
        );
        await page.waitForTimeout(3000);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Step 1: Name Box 導航至正確格子
        const nameBoxSelectors = ['.waffle-name-box', '[class*="name-box"]'];
        for (const sel of nameBoxSelectors) {
            try {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await el.click({ timeout: 3000 });
                    await page.waitForTimeout(200);
                    await page.keyboard.press('Control+A');
                    await page.keyboard.type(cellRef);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(600);
                    break;
                }
            } catch (e) {}
        }

        // Step 2: 用 active-cell-border 的實際螢幕座標點擊格子，觸發 chip 下拉選單
        // 不直接用 Alt+↓，因為 Name Box Enter 後 focus 可能還留在 Name Box，
        // 若此時打字會把文字輸入 Name Box，Google Sheets 當成格子位址查詢，跳到錯誤分頁
        const pos = await page.evaluate(() => {
            const borders = [...document.querySelectorAll('.active-cell-border')];
            if (!borders.length) return null;
            let topY = null, bottomY = null, leftX = null, rightX = null;
            for (const b of borders) {
                const r = b.getBoundingClientRect();
                if (b.style.borderTopWidth && r.width > 50)    { topY = r.top; leftX = r.left; }
                if (b.style.borderBottomWidth && r.width > 50)   bottomY = r.top;
                if (b.style.borderRightWidth && r.height > 5)    rightX = r.left;
            }
            if (topY === null || bottomY === null) return null;
            const x = rightX !== null
                ? Math.round(leftX + Math.min(rightX - leftX, 300) / 2)
                : Math.round(leftX + 80);
            const y = Math.round((topY + bottomY) / 2);
            if (y < 50 || y > window.innerHeight - 20) return null;
            if (x < 10 || x > window.innerWidth - 10) return null;
            return { x, y };
        });

        if (pos) {
            console.log(`  🖱️ 點擊格子 (${pos.x}, ${pos.y})`);
            await page.mouse.click(pos.x, pos.y);
            await page.waitForTimeout(800);
        } else {
            // 找不到格子位置，用 Alt+↓ 嘗試（focus 在 grid 上時有效）
            await page.keyboard.press('Alt+ArrowDown');
            await page.waitForTimeout(800);
        }

        // Step 3: 找 .waffle-dropdown-chip 選項（chip 下拉選單的選項元素）
        const chip = page.locator('.waffle-dropdown-chip').filter({ hasText: value }).first();
        if (await chip.isVisible({ timeout: 2000 }).catch(() => false)) {
            await chip.click({ timeout: 5000 });
            await page.waitForTimeout(800);
            console.log(`  ✅ ${cellRef} → ${value}`);
            return;
        }

        // 備用：role=option（舊版 Google Sheets 格式）
        const optionByRole = page.getByRole('option', { name: value, exact: true });
        if (await optionByRole.isVisible({ timeout: 1000 }).catch(() => false)) {
            await optionByRole.click({ timeout: 3000 });
            await page.waitForTimeout(800);
            console.log(`  ✅ ${cellRef} → ${value}（role=option）`);
            return;
        }

        // 下拉選單找不到選項（例如自訂文字「設定失敗(xxx)」），改用直接輸入
        // 先按 Escape 關閉可能殘留的下拉，再重新點擊格子確保 focus 在 grid
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        if (pos) {
            await page.mouse.click(pos.x, pos.y);
            await page.waitForTimeout(400);
        }
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);
        await page.keyboard.type(value);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        console.log(`  ✅ ${cellRef} → ${value}（直接輸入）`);
    } catch (e) {
        console.log(`  ⚠️ 更新 ${cellRef} 失敗: ${e.message.slice(0, 60)}`);
    }
}

function runScript(scriptName) {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`\n▶️  執行 ${scriptName}...`);
    try {
        const out = execSync(`node "${scriptPath}"`, {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024,
        });
        if (out.trim()) console.log(out.trim());
        console.log(`✅ ${scriptName} 完成`);
        return true;
    } catch (e) {
        const detail = ((e.stdout || '') + '\n' + (e.stderr || '')).trim();
        if (detail) console.log(detail);
        console.log(`❌ ${scriptName} 執行失敗`);
        return false;
    }
}

(async () => {
    const userDataDir         = path.join(__dirname, '..', '系統資料', 'google_auth');
    const WEB_FAIL_FILE       = path.join(__dirname, '_web_failures.json');
    const APP_FAIL_FILE       = path.join(__dirname, '_app_failures.json');
    const WEB_SUCCESS_FILE    = path.join(__dirname, '_web_successes.json');
    const APP_SUCCESS_FILE    = path.join(__dirname, '_app_successes.json');
    const PENDING_STATUS_FILE = path.join(__dirname, '_pending_status.json');
    const DONE_ARTICLE        = path.join(__dirname, '_done_article.json');
    const DONE_AD             = path.join(__dirname, '_done_ad.json');
    const DONE_MARQUEE        = path.join(__dirname, '_done_marquee.json');
    const DONE_BROADCAST      = path.join(__dirname, '_done_broadcast.json');
    const STATUS_FAIL         = '設定失敗';

    // ── --update-only 模式：讀取暫存狀態並回填試算表 ──
    if (process.argv.includes('--update-only')) {
        if (!fs.existsSync(PENDING_STATUS_FILE)) {
            console.log('ℹ️ 沒有待回填的狀態，結束。');
            return;
        }
        const pending = JSON.parse(fs.readFileSync(PENDING_STATUS_FILE, 'utf8'));
        const { webRows: _webRows, appRows: _appRows, rowDocMap: _rowDocMap,
                runArticle: _runArticle, runAd: _runAd,
                runMarquee: _runMarquee, runBroadcast: _runBroadcast } = pending;

        const webFailedDocs  = new Set(fs.existsSync(WEB_FAIL_FILE)   ? JSON.parse(fs.readFileSync(WEB_FAIL_FILE, 'utf8'))   : []);
        const webSuccessDocs = new Set(fs.existsSync(WEB_SUCCESS_FILE) ? JSON.parse(fs.readFileSync(WEB_SUCCESS_FILE, 'utf8')) : []);
        const appFailedDocs  = new Set(fs.existsSync(APP_FAIL_FILE)   ? JSON.parse(fs.readFileSync(APP_FAIL_FILE, 'utf8'))   : []);
        const appSuccessDocs = new Set(fs.existsSync(APP_SUCCESS_FILE) ? JSON.parse(fs.readFileSync(APP_SUCCESS_FILE, 'utf8')) : []);

        // 只有所有啟用腳本都有完成標記，才能寫「已完成」
        const _allWebDone = (!_runArticle || fs.existsSync(DONE_ARTICLE))
                         && (!_runAd      || fs.existsSync(DONE_AD));
        const _allAppDone = (!_runMarquee   || fs.existsSync(DONE_MARQUEE))
                         && (!_runBroadcast || fs.existsSync(DONE_BROADCAST));

        for (const f of [WEB_FAIL_FILE, APP_FAIL_FILE, WEB_SUCCESS_FILE, APP_SUCCESS_FILE,
                         DONE_ARTICLE, DONE_AD, DONE_MARQUEE, DONE_BROADCAST, PENDING_STATUS_FILE])
            if (fs.existsSync(f)) fs.unlinkSync(f);

        const _ctx = await chromium.launchPersistentContext(userDataDir, { headless: false, viewport: null, executablePath: findChrome() });
        const _pg  = (await _ctx.pages())[0] || await _ctx.newPage();

        console.log('\n📊 回填試算表狀態...');
        for (const r of _webRows) {
            const docId = _rowDocMap[r];
            if (!docId) continue;
            if (!_allWebDone) {
                await updateSheetCell(_pg, `F${r}`, STATUS_FAIL);
            } else if (webFailedDocs.has(docId)) {
                await updateSheetCell(_pg, `F${r}`, STATUS_FAIL);
            } else if (webSuccessDocs.has(docId)) {
                await updateSheetCell(_pg, `F${r}`, STATUS_DONE);
            }
        }
        for (const r of _appRows) {
            const docId = _rowDocMap[r];
            if (!docId) continue;
            if (!_allAppDone) {
                await updateSheetCell(_pg, `G${r}`, STATUS_FAIL);
            } else if (appFailedDocs.has(docId)) {
                await updateSheetCell(_pg, `G${r}`, STATUS_FAIL);
            } else if (appSuccessDocs.has(docId)) {
                await updateSheetCell(_pg, `G${r}`, STATUS_DONE);
            }
        }
        console.log('\n✅ 狀態回填完成！');
        await _ctx.close();
        return;
    }

    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        executablePath: findChrome(),
    });
    const page = (await browserContext.pages())[0] || await browserContext.newPage();

    // ── Step 1：讀取試算表 CSV ──
    console.log('📊 讀取試算表...');
    await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`);
    await page.waitForTimeout(3000);
    await waitIfVerification(page);

    // 透過瀏覽器下載 CSV（避開企業防火牆 EACCES 問題）
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
    const tmpPath = path.join(__dirname, '_tmp_sheet.csv');
    let csvText = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const dlPromise = page.waitForEvent('download', { timeout: 30000 });
            page.goto(csvUrl).catch(() => {});
            const dl = await dlPromise;
            await dl.saveAs(tmpPath);
            csvText = fs.readFileSync(tmpPath, 'utf8');
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            break;
        } catch (e) {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            if (attempt < 2) {
                console.log('⚠️ CSV 下載失敗，重試...');
                await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`);
                await page.waitForTimeout(2000);
            } else {
                throw e;
            }
        }
    }
    const rows = parseCSV(csvText);

    if (rows.length < 3) {
        console.log('❌ 試算表資料不足');
        await browserContext.close();
        return;
    }

    // 自動找欄位（從所有列的 header 掃描）
    let colF = 5, colG = 6;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const fIdx = rows[i].findIndex(h => h.includes('官網設定'));
        const gIdx = rows[i].findIndex(h => h.includes('APP設定'));
        if (fIdx !== -1) colF = fIdx;
        if (gIdx !== -1) colG = gIdx;
        if (fIdx !== -1 && gIdx !== -1) break;
    }
    console.log(`📋 官網狀態欄：${String.fromCharCode(65 + colF)}（索引 ${colF}），APP 狀態欄：${String.fromCharCode(65 + colG)}（索引 ${colG}）`);

    // 收集待設定列：用 E 欄文件名稱（官網設定/APP）判斷屬於哪個欄位
    let webRows = [], appRows = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const fStatus = (row[colF] || '').trim();
        const gStatus = (row[colG] || '').trim();
        const docName = (row[4] || '').trim();  // E 欄文件名稱
        const sheetRow = i + 1;

        if (fStatus !== STATUS_TRIGGER && gStatus !== STATUS_TRIGGER) continue;

        // E 欄空白（無文件連結）→ 跳過，與 scan-sheet.js 一致
        if (!docName) {
            console.log(`  ⚠️ 第 ${sheetRow} 列 E 欄無文件連結，跳過`);
            continue;
        }

        // F欄「待設定」→ 官網腳本處理
        if (fStatus === STATUS_TRIGGER) webRows.push(sheetRow);
        // G欄「待設定」→ APP腳本處理
        if (gStatus === STATUS_TRIGGER) appRows.push(sheetRow);
    }

    // 套用 UI 選取過濾（由控制台寫入 _sheet_filter.json）
    const FILTER_FILE = path.join(__dirname, '_sheet_filter.json');
    if (fs.existsSync(FILTER_FILE)) {
        const selectedRows = new Set(JSON.parse(fs.readFileSync(FILTER_FILE, 'utf8')));
        if (selectedRows.size > 0) {
            webRows = webRows.filter(r => selectedRows.has(r));
            appRows = appRows.filter(r => selectedRows.has(r));
            console.log(`📌 套用選取過濾：${Array.from(selectedRows).join(', ')} 列`);
        }
        fs.unlinkSync(FILTER_FILE);
    }

    console.log(`🌐 官網待設定：${webRows.length} 列${webRows.length ? ' [' + webRows.join(', ') + ']' : ''}`);
    console.log(`📱 APP待設定：${appRows.length} 列${appRows.length ? ' [' + appRows.join(', ') + ']' : ''}`);

    if (webRows.length === 0 && appRows.length === 0) {
        console.log('✅ 目前沒有待設定的項目');
        await browserContext.close();
        return;
    }

    // ── Step 2：從 E 欄讀超連結（每個儲存格透過 URL 直接選中）──
    console.log('\n🔗 讀取 E 欄文件連結...');

    const allRows = [...new Set([...webRows, ...appRows])];
    const rowDocMap = {};
    for (const sheetRow of allRows) {
        console.log(`  讀取 E${sheetRow}...`);
        rowDocMap[sheetRow] = await getDocIdFromCell(page, `E${sheetRow}`);
        if (rowDocMap[sheetRow]) {
            console.log(`  → ${rowDocMap[sheetRow]}`);
        } else {
            console.log(`  ⚠️ E${sheetRow} 有文字但找不到 Google Doc 超連結，此列跳過`);
        }
    }

    // 關閉瀏覽器，讓子腳本能使用 google_auth（Chromium 不允許同一 profile 同時開兩個 context）
    await browserContext.close();

    // ── Step 3：寫文件清單，執行腳本 ──
    const webDocIds = webRows.map(r => rowDocMap[r]).filter(Boolean);
    const appDocIds = appRows.map(r => rowDocMap[r]).filter(Boolean);

    // 讀取腳本選擇（由 UI 寫入）
    const SCRIPT_SEL_FILE = path.join(__dirname, '_script_selection.json');
    let selectedScripts = null;
    if (fs.existsSync(SCRIPT_SEL_FILE)) {
        selectedScripts = new Set(JSON.parse(fs.readFileSync(SCRIPT_SEL_FILE, 'utf8')));
        fs.unlinkSync(SCRIPT_SEL_FILE);
        console.log(`📋 選擇腳本：${Array.from(selectedScripts).join(', ')}`);
    }
    const shouldRun = (f) => !selectedScripts || selectedScripts.has(f);

    const runWeb = shouldRun('auto-post-article.js') || shouldRun('auto-post-ad.js')
        || shouldRun('auto-post-web.js') || shouldRun('auto-post-from-drive.js');
    const runApp = shouldRun('auto-post-marquee.js') || shouldRun('auto-post-broadcast.js');

    const webFailed = [];
    const appFailed = [];

    // 清除上次殘留的記錄，避免舊資料影響本次結果
    for (const f of [WEB_FAIL_FILE, APP_FAIL_FILE, WEB_SUCCESS_FILE, APP_SUCCESS_FILE,
                     DONE_ARTICLE, DONE_AD, DONE_MARQUEE, DONE_BROADCAST])
        if (fs.existsSync(f)) fs.unlinkSync(f);

    // 儲存列↔文件對應 + 啟用腳本清單，供中止後狀態回填使用
    fs.writeFileSync(PENDING_STATUS_FILE, JSON.stringify({
        webRows, appRows, rowDocMap,
        runArticle:   shouldRun('auto-post-article.js'),
        runAd:        shouldRun('auto-post-ad.js'),
        runMarquee:   shouldRun('auto-post-marquee.js'),
        runBroadcast: shouldRun('auto-post-broadcast.js'),
    }));

    if (webDocIds.length > 0 && runWeb) {
        console.log(`\n📝 官網文件清單（${webDocIds.length} 份）：${webDocIds.join(', ')}`);
        fs.writeFileSync(WEB_LIST_FILE, JSON.stringify(webDocIds));
        if (shouldRun('auto-post-article.js') || shouldRun('auto-post-from-drive.js') || shouldRun('auto-post-web.js')) {
            runScript('auto-post-article.js') || webFailed.push('官網文章');
            fs.writeFileSync(DONE_ARTICLE, '1');
        }
        if (shouldRun('auto-post-ad.js') || shouldRun('auto-post-web.js')) {
            // 等待 google_auth profile 完全釋放
            const lockFile = path.join(__dirname, '..', '系統資料', 'google_auth', 'SingletonLock');
            await new Promise(resolve => {
                const check = () => fs.existsSync(lockFile) ? setTimeout(check, 300) : resolve();
                setTimeout(check, 500);
            });
            runScript('auto-post-ad.js') || webFailed.push('廣告設定');
            fs.writeFileSync(DONE_AD, '1');
        }
        fs.existsSync(WEB_LIST_FILE) && fs.unlinkSync(WEB_LIST_FILE);
    }

    if (appDocIds.length > 0 && runApp) {
        console.log(`\n📝 APP 文件清單（${appDocIds.length} 份）：${appDocIds.join(', ')}`);
        fs.writeFileSync(APP_LIST_FILE, JSON.stringify(appDocIds));
        if (shouldRun('auto-post-marquee.js')) {
            runScript('auto-post-marquee.js') || appFailed.push('跑馬燈');
            fs.writeFileSync(DONE_MARQUEE, '1');
        }
        if (shouldRun('auto-post-broadcast.js')) {
            runScript('auto-post-broadcast.js') || appFailed.push('定時廣播');
            fs.writeFileSync(DONE_BROADCAST, '1');
        }
        fs.existsSync(APP_LIST_FILE) && fs.unlinkSync(APP_LIST_FILE);
    }

    if (webFailed.length > 0) console.log(`⚠️ 官網失敗項目：${webFailed.join('、')}`);
    if (appFailed.length > 0) console.log(`⚠️ APP 失敗項目：${appFailed.join('、')}`);

    // 讀取各腳本記錄的失敗/成功 docId 清單
    const webFailedDocs  = new Set(fs.existsSync(WEB_FAIL_FILE)   ? JSON.parse(fs.readFileSync(WEB_FAIL_FILE, 'utf8'))   : []);
    const webSuccessDocs = new Set(fs.existsSync(WEB_SUCCESS_FILE) ? JSON.parse(fs.readFileSync(WEB_SUCCESS_FILE, 'utf8')) : []);
    const appFailedDocs  = new Set(fs.existsSync(APP_FAIL_FILE)   ? JSON.parse(fs.readFileSync(APP_FAIL_FILE, 'utf8'))   : []);
    const appSuccessDocs = new Set(fs.existsSync(APP_SUCCESS_FILE) ? JSON.parse(fs.readFileSync(APP_SUCCESS_FILE, 'utf8')) : []);

    // 所有啟用的腳本都跑完才算「全部完成」，否則未跑到的文件維持待設定
    const allWebDone = (!shouldRun('auto-post-article.js') || fs.existsSync(DONE_ARTICLE))
                    && (!shouldRun('auto-post-ad.js')       || fs.existsSync(DONE_AD));
    const allAppDone = (!shouldRun('auto-post-marquee.js')   || fs.existsSync(DONE_MARQUEE))
                    && (!shouldRun('auto-post-broadcast.js') || fs.existsSync(DONE_BROADCAST));

    for (const f of [WEB_FAIL_FILE, APP_FAIL_FILE, WEB_SUCCESS_FILE, APP_SUCCESS_FILE,
                     DONE_ARTICLE, DONE_AD, DONE_MARQUEE, DONE_BROADCAST])
        if (fs.existsSync(f)) fs.unlinkSync(f);

    // ── Step 4：重新開瀏覽器，更新試算表狀態 ──
    console.log('\n📊 更新試算表狀態...');
    const ctx2 = await chromium.launchPersistentContext(userDataDir, { headless: false, viewport: null, executablePath: findChrome() });
    const page2 = (await ctx2.pages())[0] || await ctx2.newPage();

    if (webDocIds.length > 0 && runWeb) {
        for (const r of webRows) {
            const docId = rowDocMap[r];
            if (!docId) continue;
            if (!allWebDone) {
                await updateSheetCell(page2, `F${r}`, STATUS_FAIL);
            } else if (webFailedDocs.has(docId)) {
                await updateSheetCell(page2, `F${r}`, STATUS_FAIL);
            } else if (webSuccessDocs.has(docId)) {
                await updateSheetCell(page2, `F${r}`, STATUS_DONE);
            }
        }
    }

    if (appDocIds.length > 0 && runApp) {
        for (const r of appRows) {
            const docId = rowDocMap[r];
            if (!docId) continue;
            if (!allAppDone) {
                await updateSheetCell(page2, `G${r}`, STATUS_FAIL);
            } else if (appFailedDocs.has(docId)) {
                await updateSheetCell(page2, `G${r}`, STATUS_FAIL);
            } else if (appSuccessDocs.has(docId)) {
                await updateSheetCell(page2, `G${r}`, STATUS_DONE);
            }
        }
    }

    if (fs.existsSync(PENDING_STATUS_FILE)) fs.unlinkSync(PENDING_STATUS_FILE);
    console.log('\n🎉 試算表自動化完成！');
    await ctx2.close();
})();
