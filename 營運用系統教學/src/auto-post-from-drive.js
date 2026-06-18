const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { findChrome } = require('./chrome-path.js');

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
    notify('❌ 官網文章錯誤', `執行時發生錯誤：\n${err.message}${docUrl}`);
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

// 類別文字 → 後台 value 對照表
const CATEGORY_MAP = {
    '最新消息>營運': '15',
    '最新消息>活動': '14',
    '最新消息>客服': '16',
    '遊戲介紹':      '7',
    '系統說明':      '8',
    '支付教學':      '9',
    '其他說明':      '10',
    '草稿':          '11',
};

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
            await page.keyboard.press('Enter');
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
            continue;
        }

        // 點擊「官網設定-文章管理」子分頁
        try {
            await page.getByText('官網設定-文章管理').click();
            await page.waitForTimeout(2000);
            console.log('✅ 已切換到「官網設定-文章管理」分頁');
        } catch (e) {
            console.log('⚠️ 找不到「官網設定-文章管理」分頁，跳過此文件');
            notify('⚠️ 官網文章警告', `第 ${i + 1} 份文件找不到「官網設定-文章管理」分頁，已跳過。\n\nhttps://docs.google.com/document/d/${docId}/edit`);
            continue;
        }

        // 全選複製
        await page.locator('.kix-appview-editor').click();
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+A');
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+C');
        await page.waitForTimeout(1000);

        // 貼到沙盒
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

        // 解析各欄位
        const extracted = await page.evaluate(() => {
            const sandbox = document.getElementById('crawler-sandbox');
            const allText = sandbox.innerText;

            const categoryMatch = allText.match(/類別[：:][^\S\n]*([^\n]+)/);
            const titleMatch    = allText.match(/標題[：:][^\S\n]*([^\n]+)/);
            const contentMatch  = allText.match(/內文[：:]\s*\n([\s\S]*?)\n*上架時間[：:]/);
            const timeMatch     = allText.match(/上架時間[：:][^\S\n]*([^\n]+)/);

            return {
                category: categoryMatch ? categoryMatch[1].trim() : '',
                title:    titleMatch    ? titleMatch[1].trim()    : '',
                content:  contentMatch  ? contentMatch[1].trim()  : '',
                time:     timeMatch     ? timeMatch[1].trim()     : '',
            };
        });

        console.log(`📂 類別: ${extracted.category}`);
        console.log(`📄 標題: ${extracted.title}`);
        console.log(`⏰ 上架時間: ${extracted.time}`);

        // 必填欄位驗證
        const missingFields = [];
        if (!extracted.title)   missingFields.push('標題');
        if (!extracted.content) missingFields.push('內文');
        if (!extracted.time)    missingFields.push('上架時間');

        if (missingFields.length > 0) {
            const msg = `第 ${i + 1} 份文件以下欄位解析不到，已跳過：\n${missingFields.join('、')}\n\nhttps://docs.google.com/document/d/${docId}/edit`;
            console.log(`⚠️ ${msg}`);
            notify('⚠️ 官網文章警告', msg);
            continue;
        }

        // ── 前往後台填表 ──
        console.log('🚀 前往後台填表...');
        await page.goto(`${BACKSTAGE_URL}/legacy/BulletinArticleManagerForm`);
        await page.waitForTimeout(3000);

        const frame = page.locator('#hbsIframe').contentFrame();

        // 等 iframe 內容載入完成（最多 60 秒）
        await frame.locator('#AddType').waitFor({ state: 'visible', timeout: 60000 });

        // 1. 設定類別
        const categoryValue = CATEGORY_MAP[extracted.category] || '15';
        await frame.locator('#AddType').selectOption(categoryValue);

        // 2. 填標題
        await frame.getByRole('textbox', { name: '標題', exact: true }).fill(extracted.title);

        // 3. 點原始碼，填內文
        await frame.locator('a.cke_button__source').click();
        await page.waitForTimeout(500);
        await frame.locator('textarea.cke_source').fill(extracted.content);

        // 4. 填上架時間
        if (extracted.time) {
            await frame.locator('#StartTime').fill(extracted.time);
            await frame.locator('#StartTime').press('Enter');
        } else {
            console.log('⚠️ 解析不到上架時間，需要手動填寫');
            notify('⚠️ 官網文章警告', `第 ${i + 1} 份文件「${extracted.title}」解析不到上架時間，請手動填寫。\n\nhttps://docs.google.com/document/d/${docId}/edit`);
        }

        // 5. 送出
        page.once('dialog', async dialog => {
            console.log(`💬 彈窗: "${dialog.message()}"，自動確定`);
            await dialog.accept();
        });
        await frame.getByRole('button', { name: '新增', exact: true }).click();
        await page.waitForTimeout(2000);
        console.log(`✅ 第 ${i + 1} 篇文章送出成功！`);

        await page.waitForTimeout(3000);
    }

    console.log('\n🎉 所有文章都已自動發布完畢！');
    await browserContext.close();
})();
