const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// ===================== 設定區 =====================
const SPREADSHEET_ID = '1uIYYoJn2iYkWIx9oZLdABD2x1kUtnI8dEem9Uv0QbGc';
const SHEET_GID      = '1744716887';
const DATA_START_ROW = 5;
const USER_DATA_DIR  = path.join(__dirname, '..', '系統資料', 'google_auth');
const CONFIG_FILE    = path.join(__dirname, '..', '系統資料', 'config.json');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
    catch { return { username: '', password: '' }; }
}

const CSV_URL  = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_GID}`;
const BACKEND_URL = 'https://backstage.online808.com/PushNotification';
// ===================================================

// 把 "2024/5/15" + "20:00:00" 轉成 "2024-05-15 20:00:00"
function formatDateTime(dateStr, timeStr) {
    const parts = dateStr.split('/');
    const yyyy = parts[0];
    const mm   = (parts[1] || '').padStart(2, '0');
    const dd   = (parts[2] || '').padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${timeStr}`;
}

function parseCSV(text) {
    const rows = [];
    let cols = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            cols.push(current.trim());
            current = '';
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            // 引號外的換行才是真正的列結尾
            if (ch === '\r' && text[i + 1] === '\n') i++;
            cols.push(current.trim());
            rows.push(cols);
            cols = [];
            current = '';
        } else {
            current += ch;
        }
    }
    if (current || cols.length > 0) {
        cols.push(current.trim());
        rows.push(cols);
    }

    return rows;
}

(async () => {
    const config = loadConfig();
    const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        viewport: null,
        acceptDownloads: true,
        channel: 'chrome',
    });

    const page = await browserContext.pages()[0] || await browserContext.newPage();

    // 全程攔截 Bearer token
    let accessToken = null;
    browserContext.on('request', request => {
        const auth = request.headers()['authorization'];
        if (auth?.startsWith('Bearer ')) {
            accessToken = auth.replace('Bearer ', '');
        }
    });

    // ── Step 1: 讀取試算表 ──
    console.log('📊 正在讀取試算表資料...');
    const csvPath = path.join(__dirname, '..', '暫存', 'temp_sheet.csv');
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.goto(CSV_URL).catch(() => {}), // 下載時 goto 會丟錯，吞掉即可
    ]);
    await download.saveAs(csvPath);
    const csvText = require('fs').readFileSync(csvPath, 'utf-8');
    const allRows  = parseCSV(csvText);

    // 動態找「日期」header 列在 CSV 的哪一行，自動校正行號偏移
    const headerCsvIdx = allRows.findIndex(row => (row[0] || '').trim() === '日期');
    if (headerCsvIdx === -1) {
        console.log('❌ 找不到 header 列（日期），請確認試算表格式');
        await browserContext.close();
        return;
    }
    // header 列是 sheet 第 4 列，所以 CSV index 對應的 sheet row = 4 + (csvIdx - headerCsvIdx)
    const csvIdxToSheetRow = (csvIdx) => 4 + (csvIdx - headerCsvIdx);

    const toProcess = allRows
        .map((row, csvIdx) => ({ row, sheetRowNum: csvIdxToSheetRow(csvIdx) }))
        .filter(({ row, sheetRowNum }) => sheetRowNum >= 5)
        .filter(({ row }) => {
            const date    = (row[0] || '').trim();
            const time    = (row[1] || '').trim();
            const title   = (row[2] || '').trim();
            const content = (row[3] || '').trim();
            const status  = (row[6] || '').trim();
            // 狀態必須是「待發送」
            if (status !== '待發送') return false;
            // 跳過標題列和格式不對的列
            if (!date || date === '日期') return false;
            if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(date)) return false;
            // A B C D 任一空白就跳過
            if (!time || !title || !content) {
                console.log(`⏭️ 跳過 (欄位不完整): ${date} ${title || '(無標題)'}`);
                return false;
            }
            return true;
        });

    console.log(`🔍 找到 ${toProcess.length} 筆待發送的資料`);

    if (toProcess.length === 0) {
        console.log('✅ 沒有待發送的資料，結束。');
        await browserContext.close();
        return;
    }

    // ── Step 2: 登入後台 ──
    console.log('\n1. 正在前往後台...');
    await page.goto(BACKEND_URL);
    await page.waitForTimeout(3000);

    // 如果有登入頁面，填入帳密並登入
    try {
        const usernameInput = page.getByRole('textbox', { name: /帳號|username/i }).first();
        if (await usernameInput.isVisible({ timeout: 3000 })) {
            await usernameInput.fill(config.username);
            await page.getByRole('textbox', { name: /密碼|password/i }).first().fill(config.password);
            await page.getByRole('button', { name: '登入' }).click();
            await page.waitForTimeout(3000);
            console.log('✅ 後台登入成功');
        } else {
            console.log('✅ 後台已是登入狀態');
        }
    } catch (e) {
        console.log('✅ 後台已是登入狀態');
    }

    // 登入後若出現「改密碼」彈窗，自動按取消
    try {
        const cancelBtn = page.getByRole('button', { name: '取消' });
        if (await cancelBtn.isVisible({ timeout: 3000 })) {
            await cancelBtn.click();
            console.log('✅ 已關閉改密碼提示');
        }
    } catch (_) {}

    // ── Step 3: 逐列發文 ──
    for (let idx = 0; idx < toProcess.length; idx++) {
        const { row, sheetRowNum } = toProcess[idx];

        const date      = (row[0] || '').trim(); // A
        const time      = (row[1] || '').trim(); // B
        const title     = (row[2] || '').trim(); // C → 敘述
        const content   = (row[3] || '').trim(); // D → 廣告內容
        const startTime = formatDateTime(date, time);

        console.log(`\n▶️ [${idx + 1}/${toProcess.length}] 敘述: ${title}`);
        console.log(`   上架時間: ${startTime}`);

        // 前往推播設定頁
        await page.goto(BACKEND_URL);
        await page.waitForTimeout(2000);

        // 開啟新增（右上角「點擊以新增」toggle 或按鈕）
        const addToggle = page.locator('text=點擊以新增').first();
        if (await addToggle.isVisible({ timeout: 3000 })) {
            await addToggle.click();
            await page.waitForTimeout(1000);
        }

        // 受眾範圍：確認選「全會員」（預設就是，這裡做保險）
        try {
            const audienceSelect = page.locator('select').first();
            if (await audienceSelect.isVisible({ timeout: 2000 })) {
                await audienceSelect.selectOption({ label: '全會員' });
            }
        } catch (_) {}

        // 填開始時間
        await page.getByLabel('開始時間').fill(startTime);
        await page.waitForTimeout(300);

        // 填敘述
        await page.getByLabel('敘述').fill(title);
        await page.waitForTimeout(300);

        // 填廣告內容
        await page.getByLabel('廣告內容').fill(content);
        await page.waitForTimeout(300);

        // 點確定新增
        await page.getByRole('button', { name: '確定新增' }).click();

        // 等 MUI 確認彈窗出現，點「確定」
        await page.getByRole('button', { name: '確定' }).click();
        await page.waitForTimeout(2000);
        console.log(`✅ 第 ${idx + 1} 筆送出成功！`);

        // ── Step 4: 更新試算表 G 欄 ──
        const cellRef = `G${sheetRowNum}`;
        console.log(`📝 標記 ${cellRef} 為已發送...`);

        await page.goto(`${SHEET_URL}&range=${cellRef}`);
        await page.waitForTimeout(4000);

        // 用 Name Box 導航，直接輸入儲存格位址（Escape 先關掉任何下拉）
        await page.click('.waffle-name-box');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await page.click('.waffle-name-box');
        await page.waitForTimeout(300);
        await page.keyboard.press('Control+A');
        await page.keyboard.type(cellRef);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        // 點 formula bar（fx 旁邊那個 contenteditable div）
        const formulaBar = page.locator('[contenteditable="true"][id*="formula"], [contenteditable="true"].cell-input, div[contenteditable="true"]').first();
        await formulaBar.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Control+A');
        await page.keyboard.insertText('已發送');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        console.log(`✅ ${cellRef} 已標記`);

        await page.waitForTimeout(1000);
    }

    console.log('\n🎉 所有推播已自動發送完畢！');
    await browserContext.close();
})();
