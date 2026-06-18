const { chromium } = require('./node_modules/playwright');
const { findChrome } = require('./chrome-path.js');
const path = require('path');

(async () => {
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        executablePath: findChrome(),
        args: ['--window-size=1280,900'],
    });
    const page = await browserContext.newPage();
    await page.goto('https://backstage.online808.com/index');
    await page.pause();
})();
