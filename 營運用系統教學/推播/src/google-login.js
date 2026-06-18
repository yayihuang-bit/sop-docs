const { chromium } = require('playwright');
const path = require('path');

(async () => {
    // 將登入狀態存在專案底下的 google_auth 資料夾
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');

    console.log('====================================================');
    console.log('正在為 Google 登入開啟專屬瀏覽器...');
    console.log(`登入狀態將保存在: ${userDataDir}`);
    console.log('====================================================');
    console.log('【你的任務】：');
    console.log('1. 在彈出的瀏覽器中，完成你的 Google 帳號登入 (包含雙重驗證)。');
    console.log('2. 登入成功，等待畫面完全載入你的 Google Drive 文件列表。');
    console.log('3. 確認看到文件後，請**直接點擊右上角的 X 關閉瀏覽器**。');
    console.log('====================================================');

    // 使用 persistent context 來長久保存 Session，並嘗試套用本機 Chrome 降低被阻擋機率
    try {
        const browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            viewport: null,
            args: ['--start-maximized'],
            channel: 'chrome',
        });

        const page = await browserContext.pages()[0] || await browserContext.newPage();

        // 前往你要抓取的 Google Drive 資料夾
        await page.goto('https://drive.google.com/drive/u/1/folders/1g9NJ5adZScL5rnpzbSpMJdKrNtnmmK3t');

        // 等待瀏覽器關閉事件
        browserContext.on('close', () => {
            console.log('\n✅ 瀏覽器已關閉，你的 Google 登入狀態已成功被記住！');
            console.log('之後的自動化程式將直接使用這個狀態，不需要再登入了。');
            process.exit(0);
        });

    } catch (error) {
        console.error('開啟瀏覽器失敗：', error);
    }
})();
