const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { findChrome } = require('./chrome-path.js');

const SHEET_ID  = '1qmRZ-OT-PW6IzQFoJatZKf8fMUwnnBX-gyYHZCxuL1E';
const SHEET_GID = '1234248588';
const STATUS_TRIGGER = '待設定';
const RESULT_FILE = path.join(__dirname, '_scan_result.json');

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
        console.log('⚠️ Google 要求驗證身分，請在瀏覽器完成驗證...');
        await page.waitForURL(url => !url.href.includes('accounts.google.com'), { timeout: 300000 });
        await page.waitForTimeout(2000);
        console.log('✅ 驗證完成');
    }
}

(async () => {
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        executablePath: findChrome(),
    });
    const page = (await browserContext.pages())[0] || await browserContext.newPage();

    try {
        // 先開試算表頁面，處理 Google 驗證
        await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`);
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
                    await page.goto(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`);
                    await page.waitForTimeout(2000);
                } else {
                    throw e;
                }
            }
        }

        await browserContext.close();

        if (!csvText || csvText.trimStart().startsWith('<')) {
            fs.writeFileSync(RESULT_FILE,
                JSON.stringify({ error: '試算表載入失敗，請確認 Google 登入狀態' }), 'utf8');
            return;
        }

        const rows = parseCSV(csvText);
        if (rows.length < 2) {
            fs.writeFileSync(RESULT_FILE, JSON.stringify([]), 'utf8');
            return;
        }

        let colF = 5, colG = 6;
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const fIdx = rows[i].findIndex(h => h.includes('官網設定'));
            const gIdx = rows[i].findIndex(h => h.includes('APP設定'));
            if (fIdx !== -1) colF = fIdx;
            if (gIdx !== -1) colG = gIdx;
            if (fIdx !== -1 && gIdx !== -1) break;
        }

        const result = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fStatus = (row[colF] || '').trim();
            const gStatus = (row[colG] || '').trim();
            const sheetRow = i + 1;

            const types = [];
            if (fStatus === STATUS_TRIGGER) types.push('官網');
            if (gStatus === STATUS_TRIGGER) types.push('APP');
            if (types.length === 0) continue;

            const docName = (row[4] || '').trim();

            // E 欄空白（無文件連結）→ 視為錯誤，不列入待設定清單
            if (!docName) continue;

            const datePart = (row[0] || '').trim();
            const label = docName || datePart || ('第 ' + sheetRow + ' 列');
            result.push({ row: sheetRow, types, label });
        }

        fs.writeFileSync(RESULT_FILE, JSON.stringify(result), 'utf8');
    } catch (e) {
        fs.writeFileSync(RESULT_FILE, JSON.stringify({ error: e.message }), 'utf8');
        try { await browserContext.close(); } catch {}
    }
})();
