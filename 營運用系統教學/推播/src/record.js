const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browserContext = await chromium.launchPersistentContext(
        path.join(__dirname, '..', '系統資料', 'google_auth'),
        { headless: false, viewport: null, channel: 'chrome' }
    );
    const page = browserContext.pages()[0] || await browserContext.newPage();
    await page.goto('https://backstage.online808.com/PushNotification');

    // 開啟 Playwright Inspector（有錄製按鈕）
    await page.pause();
})();
