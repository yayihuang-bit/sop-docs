const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { findChrome } = require('./chrome-path.js');

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

const configPath = path.join(__dirname, '..', '系統資料', 'config.json');
const config = require(configPath);
const BACKSTAGE_URL = config.backstage.url;

let currentDocId = '';
process.on('uncaughtException', (err) => {
    const docUrl = currentDocId ? `\n\nhttps://docs.google.com/document/d/${currentDocId}/edit` : '';
    notify('❌ 跑馬燈錯誤', `執行時發生錯誤：\n${err.message}${docUrl}`);
    process.exit(1);
});

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

// 時間格式轉換：2026/4/10 00:00:00 → 2026-4-10 00:00:00
function formatTime(str) {
    if (!str) return '';
    return str.replace(/\//g, '-');
}

(async () => {
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        executablePath: findChrome(),
    });

    const page = await browserContext.pages()[0] || await browserContext.newPage();

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
    const APP_LIST = path.join(__dirname, '_app_doc_list.json');
    if (!fs.existsSync(APP_LIST)) {
        console.log('❌ 找不到文件清單，請使用控制台「試算表自動化」功能。');
        await browserContext.close();
        return;
    }
    const docIds = JSON.parse(fs.readFileSync(APP_LIST, 'utf8'));
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

        // 打開 Google Docs
        await page.goto(`https://docs.google.com/document/d/${docId}/edit`);
        await page.waitForTimeout(2000);
        await waitIfVerification(page);

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

        // 擷取「APP-公告系統-跑馬燈設定」區段
        const sectionText = extractSection(allText, 'APP-公告系統-跑馬燈設定');
        if (!sectionText) {
            console.log('⚠️ 找不到「APP-公告系統-跑馬燈設定」區段，跳過此文件');
            notify('⚠️ 跑馬燈警告', `第 ${i + 1} 份文件找不到「APP-公告系統-跑馬燈設定」區段，已跳過。\n\nhttps://docs.google.com/document/d/${docId}/edit`);
            failedDocIds.push(docId); failCount++;
            continue;
        }

        // 解析各欄位
        const get = (key) => {
            const m = sectionText.match(new RegExp(key + '[：:][^\\S\\n]*([^\\n]*)'));
            return m ? m[1].trim() : '';
        };
        const extracted = {
            audience:  get('受眾範圍'),
            startTime: get('啟用時間[\\(（]起[\\)）]'),
            endTime:   get('啟用時間[\\(（]訖[\\)）]'),
            platform:  get('顯示平台'),
            content:   get('跑馬燈內容'),
            count:     get('出現次數'),
            interval:  get('出現間隔[\\(（]秒[\\)）]'),
        };

        console.log(`📢 跑馬燈內容: ${extracted.content}`);
        console.log(`⏰ 啟用時間: ${extracted.startTime} ~ ${extracted.endTime}`);
        console.log(`🔢 出現次數: ${extracted.count}，間隔: ${extracted.interval} 秒`);

        // 必填欄位驗證
        const missingFields = [];
        if (!extracted.content)   missingFields.push('跑馬燈內容');
        if (!extracted.startTime) missingFields.push('啟用時間(起)');
        if (!extracted.endTime)   missingFields.push('啟用時間(訖)');
        if (!extracted.count)     missingFields.push('出現次數');
        if (!extracted.interval)  missingFields.push('出現間隔(秒)');

        if (missingFields.length > 0) {
            const msg = `第 ${i + 1} 份文件以下欄位解析不到，已跳過：\n${missingFields.join('、')}\n\nhttps://docs.google.com/document/d/${docId}/edit`;
            console.log(`⚠️ ${msg}`);
            notify('⚠️ 跑馬燈警告', msg);
            failedDocIds.push(docId); failCount++;
            continue;
        }


        // ── 前往後台填表 ──
        console.log('🚀 前往後台填跑馬燈設定...');
        await page.goto(`${BACKSTAGE_URL}/index`);
        await page.waitForTimeout(2000);

        await page.getByRole('button', { name: '公告系統' }).click();
        await page.getByRole('navigation').getByRole('link', { name: '跑馬燈設定' }).click();
        await page.waitForTimeout(2000);

        // 點擊新增
        await page.getByRole('checkbox', { name: '點擊以新增' }).check();
        await page.waitForTimeout(500);

        // 受眾範圍
        await page.getByRole('button', { name: /受眾範圍/ }).click();
        await page.getByRole('menuitem', { name: extracted.audience || '全會員' }).click();

        // 啟用時間(起)
        await page.getByRole('textbox', { name: '啟用時間(起)' }).click();
        await page.getByRole('textbox', { name: '啟用時間(起)' }).fill(formatTime(extracted.startTime));
        await page.waitForTimeout(300);

        // 啟用時間(迄)
        await page.getByRole('textbox', { name: '啟用時間(迄)' }).click();
        await page.getByRole('textbox', { name: '啟用時間(迄)' }).fill(formatTime(extracted.endTime));
        await page.waitForTimeout(300);

        // 顯示平台
        await page.getByRole('button', { name: /顯示平台/ }).click();
        await page.getByRole('menuitem', { name: extracted.platform || '全平台' }).click();

        // 跑馬燈內容
        await page.getByRole('textbox', { name: '跑馬燈內容' }).fill(extracted.content);

        // 出現次數
        await page.getByRole('textbox', { name: '出現次數' }).fill(extracted.count || '');

        // 出現間隔
        await page.getByRole('textbox', { name: '出現間隔(秒)' }).fill(extracted.interval || '');

        // 送出
        await page.getByRole('button', { name: '確定新增' }).click();
        await page.waitForTimeout(1000);

        const confirmBtn = page.getByRole('button', { name: '確定' });
        if (await confirmBtn.isVisible({ timeout: 3000 })) {
            await confirmBtn.click();
        }

        await page.waitForTimeout(2000);
        successDocIds.push(docId);
        console.log(`✅ 第 ${i + 1} 份跑馬燈設定完成！`);
        await page.waitForTimeout(3000);
    }

    console.log('\n🎉 所有跑馬燈設定完畢！');
    const writeIds = (file, ids) => {
        if (!ids.length) return;
        const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
        fs.writeFileSync(file, JSON.stringify([...new Set([...prev, ...ids])]));
    };
    writeIds(path.join(__dirname, '_app_failures.json'), failedDocIds);
    writeIds(path.join(__dirname, '_app_successes.json'), successDocIds);
    await browserContext.close();
    if (failCount > 0) process.exit(1);
})();
