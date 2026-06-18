const { chromium } = require('playwright');
const path = require('path');
const { findChrome } = require('./chrome-path.js');

(async () => {
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');

    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        executablePath: findChrome(),
    });

    const page = await browserContext.pages()[0] || await browserContext.newPage();
    await page.goto('https://backstage.online808.com/index');

    console.log('✅ 瀏覽器已開啟，關閉視窗後自動結束。');
    await browserContext.waitForEvent('close');
})();
