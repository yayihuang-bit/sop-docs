const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// ===================== 設定區 =====================
const SPREADSHEET_ID = '1uIYYoJn2iYkWIx9oZLdABD2x1kUtnI8dEem9Uv0QbGc';
const SHEET_GID      = '1744716887';
const DATA_START_ROW = 5;
const USER_DATA_DIR  = path.join(__dirname, '..', '系統資料', 'google_auth');
const BACKEND_URL    = 'https://backstage.online808.com/PushNotification';
const CONFIG_FILE    = path.join(__dirname, '..', '系統資料', 'config.json');
const TEMP_XLSX_PATH = path.join(__dirname, '..', '暫存', 'temp_push_stats.xlsx');

const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_GID}`;
// ===================================================

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
    catch { return { username: '', password: '' }; }
}

// 標準化日期："2026/04/10" 或 "2026/4/10" → "2026/4/10"
function normalizeDate(d) {
    const p = d.split('/');
    return `${p[0]}/${parseInt(p[1])}/${parseInt(p[2])}`;
}

// 標準化時間：只取 HH:MM
function normalizeTime(t) {
    return t.trim().slice(0, 5);
}

function parseCSV(text) {
    const rows = [];
    let cols = [], current = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            cols.push(current.trim()); current = '';
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            cols.push(current.trim()); rows.push(cols); cols = []; current = '';
        } else {
            current += ch;
        }
    }
    if (current || cols.length > 0) { cols.push(current.trim()); rows.push(cols); }
    return rows;
}

(async () => {
    const config = loadConfig();

    // ── 1. 啟動 Playwright ──
    const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        viewport: null,
        acceptDownloads: true,
        channel: 'chrome',
    });
    const page = browserContext.pages()[0] || await browserContext.newPage();

    // ── 2. 登入後台 ──
    console.log('🔐 正在前往後台...');
    try {
        await page.goto(BACKEND_URL);
    } catch (e) {
        console.log('❌ 無法連線後台，請確認 VPN 是否已開啟。');
        await browserContext.close();
        return;
    }
    await page.waitForTimeout(3000);

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
    } catch (_) {
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

    // ── 3. 前往推播設定、全選並匯出 xlsx ──
    console.log('📥 正在從後台匯出推播統計...');

    await page.getByRole('link', { name: '推播設定' }).click();
    await page.waitForTimeout(1500);

    // 勾選表頭全選 checkbox
    await page.getByRole('row', { name: 'ID 異動時間 推播時間 受眾 推播 狀態 操作' }).getByRole('checkbox').check();
    await page.waitForTimeout(500);
    console.log('✅ 已全選');

    // 點「匯出資料」並等待下載
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出資料' }).click();
    const download = await downloadPromise;
    await download.saveAs(TEMP_XLSX_PATH);
    console.log('✅ 統計資料下載完成');

    // ── 5. 解析 xlsx ──
    const wb = XLSX.readFile(TEMP_XLSX_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const xlsxRows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 只處理 30 天內的資料
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // 建立查找表："日期_時間" → { clicks, sends, openRate }
    const statsMap = {};
    for (let i = 1; i < xlsxRows.length; i++) {
        const row = xlsxRows[i];
        const date     = (row[0] || '').toString().trim();
        const time     = (row[2] || '').toString().trim();
        const clicks   = row[5] != null ? String(row[5]) : '';
        const sends    = row[6] != null ? String(row[6]) : '';
        const openRate = row[7] != null ? String(row[7]) : '';

        if (date && time) {
            const [y, m, d] = date.split('/').map(Number);
            const rowDate = new Date(y, m - 1, d);
            if (rowDate < thirtyDaysAgo || rowDate > today) continue;
            const key = `${normalizeDate(date)}_${normalizeTime(time)}`;
            statsMap[key] = { clicks, sends, openRate };
        }
    }
    console.log(`📊 30天內有效統計資料：${Object.keys(statsMap).length} 筆（${thirtyDaysAgo.toLocaleDateString('zh-TW')} ~ ${today.toLocaleDateString('zh-TW')}）`);

    // ── 6. 下載試算表 CSV ──
    console.log('\n📋 正在讀取試算表...');
    const csvPath = path.join(__dirname, '..', '暫存', 'temp_sheet.csv');
    const [csvDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.goto(CSV_URL).catch(() => {}),
    ]);
    await csvDownload.saveAs(csvPath);
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const allRows = parseCSV(csvText);

    // 找 header 列（日期欄）
    const headerCsvIdx = allRows.findIndex(row => (row[0] || '').trim() === '日期');
    if (headerCsvIdx === -1) {
        console.log('❌ 找不到 header 列（日期），請確認試算表格式');
        await browserContext.close();
        return;
    }
    const csvIdxToSheetRow = (csvIdx) => 4 + (csvIdx - headerCsvIdx);

    // ── 7. 比對，找出要更新的列 ──
    const toUpdate = [];
    const matchedKeys = new Set();

    for (let csvIdx = 0; csvIdx < allRows.length; csvIdx++) {
        const row = allRows[csvIdx];
        const sheetRowNum = csvIdxToSheetRow(csvIdx);
        if (sheetRowNum < DATA_START_ROW) continue;

        const date = (row[0] || '').trim();
        const time = (row[1] || '').trim();
        if (!date || !time || date === '日期') continue;
        if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(date)) continue;

        const key = `${normalizeDate(date)}_${normalizeTime(time)}`;
        if (statsMap[key]) {
            toUpdate.push({ sheetRowNum, date, time, stats: statsMap[key] });
            matchedKeys.add(key);
        }
    }

    // 找出後台有、但試算表找不到的資料
    const unmatched = Object.entries(statsMap)
        .filter(([key]) => !matchedKeys.has(key))
        .map(([key]) => {
            const [date, time] = key.split('_');
            return `${date} ${time}`;
        });

    if (toUpdate.length === 0) {
        console.log('⚠️ 試算表中沒有找到與後台對應的資料（請確認日期/時間是否一致）');
        if (unmatched.length > 0) {
            console.log(`__UNMATCHED__:${JSON.stringify(unmatched)}`);
        }
        await browserContext.close();
        return;
    }

    console.log(`\n✅ 找到 ${toUpdate.length} 筆對應資料，準備回填...`);
    for (const { date, time, stats } of toUpdate) {
        console.log(`   ${date} ${time} → 點閱:${stats.clicks} 發送:${stats.sends} 開啟率:${stats.openRate}`);
    }

    // 先輸出未配對通知，確保 crash 前介面就能顯示 Modal
    if (unmatched.length > 0) {
        console.log(`\n⚠️ 以下 ${unmatched.length} 筆資料在試算表中找不到對應列：`);
        unmatched.forEach(item => console.log(`   ❌ ${item}`));
        console.log(`__UNMATCHED__:${JSON.stringify(unmatched)}`);
    }

    // ── 8. 開啟試算表，逐列寫入 H / I / J ──
    await page.goto(SHEET_URL);
    await page.waitForTimeout(4000);

    const writeCell = async (cellRef, value) => {
        await page.click('.waffle-name-box');
        await page.waitForTimeout(200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.click('.waffle-name-box');
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+A');
        await page.keyboard.type(cellRef);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);

        const formulaBar = page.locator(
            '[contenteditable="true"][id*="formula"], [contenteditable="true"].cell-input, div[contenteditable="true"]'
        ).first();
        await formulaBar.click();
        await page.waitForTimeout(200);
        await page.keyboard.press('Control+A');
        await page.keyboard.insertText(value);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
    };

    const setFontSize = async (rangeRef, size) => {
        try {
            await page.click('.waffle-name-box');
            await page.waitForTimeout(200);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(100);
            await page.click('.waffle-name-box');
            await page.waitForTimeout(200);
            await page.keyboard.press('Control+A');
            await page.keyboard.type(rangeRef);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);

            const fontSizeInput = page.locator(
                '[aria-label="Font size"], [aria-label="字型大小"], [aria-label="字体大小"]'
            ).first();
            await fontSizeInput.click({ clickCount: 3, timeout: 5000 });
            await page.waitForTimeout(200);
            await fontSizeInput.fill(String(size));
            await fontSizeInput.press('Enter');
            await page.waitForTimeout(500);
        } catch (_) {
            console.log(`⚠️ 字體大小設定失敗（${rangeRef}），請手動設為 ${size}pt`);
        }
    };

    for (const { sheetRowNum, date, time, stats } of toUpdate) {
        console.log(`\n▶️ 更新第 ${sheetRowNum} 列 (${date} ${time})...`);
        await writeCell(`H${sheetRowNum}`, stats.clicks);
        await writeCell(`I${sheetRowNum}`, stats.sends);
        await writeCell(`J${sheetRowNum}`, stats.openRate);
        await setFontSize(`H${sheetRowNum}:J${sheetRowNum}`, 12);
        console.log(`✅ 第 ${sheetRowNum} 列已寫入 H/I/J（12pt）`);
    }

    console.log('\n🎉 所有統計數據已成功回填至試算表！');
    await browserContext.close();
})();
