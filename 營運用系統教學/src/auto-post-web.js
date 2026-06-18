const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { findChrome } = require('./chrome-path.js');

const IMAGE_DIR = 'I:\\行銷部\\02_行銷美術\\包你發娛樂城\\01_官網燈箱';

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

// 已知的官網區段名稱（用於切割全文）
const WEB_SECTIONS = ['官網設定-文章管理', '官網設定-廣告設定'];

// 從全文中擷取指定區段的文字（從區段標題開始，到下一個區段標題或結尾）
function extractSection(allText, sectionName) {
    const idx = allText.indexOf(sectionName);
    if (idx === -1) return null;
    let endIdx = allText.length;
    for (const other of WEB_SECTIONS) {
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

async function waitIfVerification(page) {
    if (page.url().includes('accounts.google.com')) {
        console.log('⚠️ Google 要求驗證身分，請在瀏覽器完成驗證...');
        notify('⚠️ Google 帳號驗證', '請在瀏覽器完成 Google 帳號驗證，完成後腳本將自動繼續。');
        await page.waitForURL(url => !url.href.includes('accounts.google.com'), { timeout: 300000 });
        await page.waitForTimeout(2000);
        console.log('✅ 驗證完成，繼續執行...');
    }
}

function findImageFile(keyword, dir) {
    const targetDir = dir || IMAGE_DIR;
    if (!fs.existsSync(targetDir)) {
        console.log(`⚠️ 找不到圖片資料夾：${targetDir}`);
        return null;
    }
    const allJpg = fs.readdirSync(targetDir).filter(f => /\.(jpg|jpeg)$/i.test(f));
    if (allJpg.length === 0) return null;

    let matched = allJpg.filter(f => f.includes(keyword));
    if (matched.length === 0) {
        const tokens = keyword.match(/\d+|[一-鿿！!？?～~]+/g) || [keyword];
        matched = allJpg.filter(f => tokens.every(t => f.includes(t)));
        if (matched.length > 0) console.log(`🖼️ 關鍵字拆段比對，tokens: [${tokens.join(', ')}]`);
    }
    if (matched.length === 0) return null;

    matched.sort((a, b) =>
        fs.statSync(path.join(targetDir, b)).mtime - fs.statSync(path.join(targetDir, a)).mtime
    );
    console.log(`🖼️ 找到圖片：${matched[0]}${matched.length > 1 ? ` (共 ${matched.length} 個符合，取最新)` : ''}`);
    return path.join(targetDir, matched[0]);
}

function askUserForImage(keyword, dir) {
    try {
        const tmpFile = path.join(__dirname, '_img_select.tmp');
        const targetDir = dir || IMAGE_DIR;
        const initDir = fs.existsSync(targetDir) ? targetDir : 'C:\\';
        const safeInit = initDir.replace(/\\/g, '\\\\');
        const safeTmp  = tmpFile.replace(/\\/g, '\\\\');
        const safeKw   = keyword.replace(/'/g, "''");
        const script = [
            `Add-Type -AssemblyName System.Windows.Forms`,
            `$owner = New-Object System.Windows.Forms.Form`,
            `$owner.TopMost = $true`,
            `$owner.ShowInTaskbar = $false`,
            `$owner.WindowState = 'Minimized'`,
            `$owner.Show()`,
            `$d = New-Object System.Windows.Forms.OpenFileDialog`,
            `$d.Title = '找不到符合「${safeKw}」的圖片，請手動選擇'`,
            `$d.Filter = '圖片檔案 (*.jpg;*.jpeg)|*.jpg;*.jpeg'`,
            `$d.InitialDirectory = '${safeInit}'`,
            `if ($d.ShowDialog($owner) -eq 'OK') { [System.IO.File]::WriteAllText('${safeTmp}', $d.FileName, [System.Text.Encoding]::UTF8) }`,
            `$owner.Dispose()`,
        ].join('\n');
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execSync(`powershell -EncodedCommand ${encoded}`, { stdio: 'ignore' });
        if (fs.existsSync(tmpFile)) {
            const p = fs.readFileSync(tmpFile, 'utf8').trim();
            fs.unlinkSync(tmpFile);
            return p || null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function similarity(a, b) {
    if (!a || !b) return 0;
    const bigrams = s => {
        const bg = new Set();
        for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
        return bg;
    };
    const ba = bigrams(a), bb = bigrams(b);
    let inter = 0;
    for (const bg of ba) if (bb.has(bg)) inter++;
    return (2 * inter) / (ba.size + bb.size);
}

async function autoFindArticleId(page, note) {
    console.log(`🔍 自動查詢文章 ID（廣告註解：${note}）...`);
    await page.goto(`${BACKSTAGE_URL}/index`);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '官網設定' }).click();
    await page.getByRole('navigation').getByRole('link', { name: '文章管理' }).click();
    await page.waitForTimeout(2000);

    const frame = page.locator('#hbsIframe').contentFrame();
    const searchInput = frame.locator('input[type="search"]');
    try {
        await searchInput.waitFor({ state: 'visible', timeout: 30000 });
    } catch {
        console.log('⚠️ 文章管理搜尋框載入失敗');
        return null;
    }

    const keyword = note.slice(0, 10);
    await searchInput.fill(keyword);
    await page.waitForTimeout(1500);

    try {
        const firstRow = frame.locator('table#datatable tbody tr:first-child');
        const id    = (await firstRow.locator('td:nth-child(1)').textContent({ timeout: 5000 }))?.trim();
        const title = (await firstRow.locator('td:nth-child(3)').textContent({ timeout: 5000 }))?.trim() || '';

        if (!id || !/^\d+$/.test(id)) {
            console.log('⚠️ 搜尋結果為空');
            return null;
        }

        const score = similarity(note, title);
        if (score >= 0.4) {
            console.log(`✅ 找到文章：「${title}」→ ID: ${id}（相似度 ${Math.round(score * 100)}%）`);
            return id;
        }

        console.log(`⚠️ 搜尋結果「${title}」相似度不足（${Math.round(score * 100)}%），改手動輸入`);
        return null;
    } catch {
        console.log('⚠️ 讀取搜尋結果失敗');
        return null;
    }
}

function askUserForArticleId(note) {
    try {
        const tmpFile = path.join(__dirname, '_article_id.tmp');
        const safeTmp  = tmpFile.replace(/\\/g, '\\\\');
        const safeNote = note.replace(/'/g, "''");
        const script = `Add-Type -AssemblyName System.Windows.Forms\n$f = New-Object System.Windows.Forms.Form\n$f.Text = '請輸入文章 ID'\n$f.Width = 440\n$f.Height = 160\n$f.StartPosition = 'CenterScreen'\n$f.TopMost = $true\n$l = New-Object System.Windows.Forms.Label\n$l.Text = '自動找不到符合「${safeNote}」的文章，請手動輸入文章 ID：'\n$l.Location = '12,12'\n$l.Size = '410,40'\n$t = New-Object System.Windows.Forms.TextBox\n$t.Location = '12,55'\n$t.Width = 410\n$ok = New-Object System.Windows.Forms.Button\n$ok.Text = '確定'\n$ok.Location = '220,88'\n$ok.DialogResult = 'OK'\n$skip = New-Object System.Windows.Forms.Button\n$skip.Text = '跳過此份'\n$skip.Location = '315,88'\n$skip.DialogResult = 'Cancel'\n$f.Controls.AddRange(@($l, $t, $ok, $skip))\n$f.AcceptButton = $ok\n$f.CancelButton = $skip\nif ($f.ShowDialog() -eq 'OK' -and $t.Text.Trim() -ne '') { [System.IO.File]::WriteAllText('${safeTmp}', $t.Text.Trim(), [System.Text.Encoding]::UTF8) }`;
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execSync(`powershell -EncodedCommand ${encoded}`, { stdio: 'ignore' });
        if (fs.existsSync(tmpFile)) {
            const id = fs.readFileSync(tmpFile, 'utf8').trim();
            fs.unlinkSync(tmpFile);
            return id || null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function formatTime(str) {
    if (!str) return '';
    return str.trim().replace(/(\d{4})\/(\d{1,2})\/(\d{1,2})/, (_, y, m, d) =>
        `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    );
}

const configPath = path.join(__dirname, '..', '系統資料', 'config.json');
const config = require(configPath);
const BACKSTAGE_URL = config.backstage.url;

let currentDocId = '';
process.on('uncaughtException', (err) => {
    const docUrl = currentDocId ? `\n\nhttps://docs.google.com/document/d/${currentDocId}/edit` : '';
    notify('❌ 官網設定錯誤', `執行時發生錯誤：\n${err.message}${docUrl}`);
    process.exit(1);
});

(async () => {
    const userDataDir = path.join(__dirname, '..', '系統資料', 'google_auth');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        executablePath: findChrome(),
    });
    const page = (await browserContext.pages())[0] || await browserContext.newPage();

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

        // 全選複製整份文件（單頁格式，不需要切換分頁）
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

        if (!allText.trim()) {
            console.log(`⚠️ 第 ${i + 1} 份文件內容為空，跳過`);
            notify('⚠️ 官網設定警告', `第 ${i + 1} 份文件讀取不到內容，已跳過。\n\nhttps://docs.google.com/document/d/${docId}/edit`);
            continue;
        }

        // ════════════════════════════════════════════════
        // 區段一：官網設定-文章管理
        // ════════════════════════════════════════════════
        const articleText = extractSection(allText, '官網設定-文章管理');
        if (!articleText) {
            console.log('⚠️ 找不到「官網設定-文章管理」區段，跳過文章管理');
        } else {
            console.log('\n📄 處理「官網設定-文章管理」...');

            const getA = (key) => {
                const m = articleText.match(new RegExp(key + '[：:][^\\S\\n]*([^\\n]*)'));
                return m ? m[1].trim() : '';
            };
            const contentMatch = articleText.match(/內文[：:]\s*\n([\s\S]*?)\n*上架時間[：:]/);

            const article = {
                category: getA('類別'),
                title:    getA('標題'),
                content:  contentMatch ? contentMatch[1].trim() : '',
                time:     getA('上架時間'),
            };

            console.log(`  📂 類別: ${article.category}`);
            console.log(`  📄 標題: ${article.title}`);
            console.log(`  ⏰ 上架時間: ${article.time}`);

            const missingA = [];
            if (!article.title)   missingA.push('標題');
            if (!article.content) missingA.push('內文');
            if (!article.time)    missingA.push('上架時間');

            if (missingA.length > 0) {
                const msg = `第 ${i + 1} 份文件「官網設定-文章管理」以下欄位解析不到，已跳過：\n${missingA.join('、')}\n\nhttps://docs.google.com/document/d/${docId}/edit`;
                console.log(`  ⚠️ ${msg}`);
                notify('⚠️ 官網文章警告', msg);
            } else {
                console.log('  🚀 前往後台填表...');
                await page.goto(`${BACKSTAGE_URL}/legacy/BulletinArticleManagerForm`);
                await page.waitForTimeout(3000);

                const frame = page.locator('#hbsIframe').contentFrame();
                await frame.locator('#AddType').waitFor({ state: 'visible', timeout: 60000 });

                const categoryValue = CATEGORY_MAP[article.category] || '15';
                await frame.locator('#AddType').selectOption(categoryValue);
                await frame.getByRole('textbox', { name: '標題', exact: true }).fill(article.title);
                await frame.locator('a.cke_button__source').click();
                await page.waitForTimeout(500);
                await frame.locator('textarea.cke_source').fill(article.content);

                await frame.locator('#StartTime').fill(article.time);
                await frame.locator('#StartTime').press('Enter');

                page.once('dialog', async dialog => {
                    console.log(`  💬 彈窗: "${dialog.message()}"，自動確定`);
                    await dialog.accept();
                });
                await frame.getByRole('button', { name: '新增', exact: true }).click();
                await page.waitForTimeout(2000);
                console.log(`  ✅ 第 ${i + 1} 篇文章送出成功！`);
                await page.waitForTimeout(2000);
            }
        }

        // ════════════════════════════════════════════════
        // 區段二：官網設定-廣告設定
        // ════════════════════════════════════════════════
        const adText = extractSection(allText, '官網設定-廣告設定');
        if (!adText) {
            console.log('⚠️ 找不到「官網設定-廣告設定」區段，跳過廣告設定');
        } else {
            console.log('\n📋 處理「官網設定-廣告設定」...');

            const getD = (key) => {
                const m = adText.match(new RegExp(key + '[：:][^\\S\\n]*([^\\n]*)', 'i'));
                return m ? m[1].trim() : '';
            };

            const ad = {
                section:    getD('版位'),
                note:       getD('廣告註解'),
                linkType:   getD('超連結方式'),
                articleId:  getD('文章Id'),
                linkUrl:    getD('外連網址'),
                imgKeyword: getD('圖片關鍵字'),
                imgDir:     getD('圖檔位置'),
                startTime:  getD('上架時間'),
                endTime:    getD('下架時間'),
            };

            console.log(`  📋 版位: ${ad.section}`);
            console.log(`  📝 廣告註解: ${ad.note}`);
            console.log(`  🔗 超連結方式: ${ad.linkType}`);
            console.log(`  🖼️ 圖片關鍵字: ${ad.imgKeyword}`);
            console.log(`  ⏰ 上架: ${ad.startTime} ～ ${ad.endTime}`);

            // 內連網址但 articleId 空白 → 自動查詢，找不到再彈手動輸入框
            if (ad.linkType === '內連網址' && !ad.articleId) {
                ad.articleId = await autoFindArticleId(page, ad.note)
                    || askUserForArticleId(ad.note)
                    || '';
            }
            console.log(`  📌 [articleId 確認] linkType=${ad.linkType}，articleId="${ad.articleId}"`);

            const missingD = [];
            if (!ad.section)    missingD.push('版位');
            if (!ad.imgKeyword) missingD.push('圖片關鍵字');
            if (!ad.startTime)  missingD.push('上架時間');
            if (!ad.endTime)    missingD.push('下架時間');
            if (ad.linkType === '內連網址' && !ad.articleId) missingD.push('文章ID');
            if (ad.linkType === '外連網址' && !ad.linkUrl)   missingD.push('連結網址');

            if (missingD.length > 0) {
                const msg = `第 ${i + 1} 份文件「官網設定-廣告設定」以下欄位解析不到，已跳過：\n${missingD.join('、')}\n\nhttps://docs.google.com/document/d/${docId}/edit`;
                console.log(`  ⚠️ ${msg}`);
                notify('⚠️ 廣告設定警告', msg);
            } else {
                // 搜尋圖片
                const imgDir = ad.imgDir || IMAGE_DIR;
                console.log(`  📁 圖片資料夾：${imgDir}`);
                let imgPath = findImageFile(ad.imgKeyword, imgDir);
                if (!imgPath) {
                    console.log(`  ⚠️ 找不到符合「${ad.imgKeyword}」的圖片，開啟手動選擇視窗...`);
                    imgPath = askUserForImage(ad.imgKeyword, imgDir);
                    if (!imgPath) {
                        console.log('  ⚠️ 未選擇圖片，此份廣告設定跳過');
                        notify('⚠️ 廣告設定警告', `第 ${i + 1} 份文件未選擇圖片，廣告設定已跳過。\n\nhttps://docs.google.com/document/d/${docId}/edit`);
                        continue;
                    }
                    console.log(`  🖼️ 手動選擇：${path.basename(imgPath)}`);
                }

                console.log('  🚀 前往後台填廣告設定...');
                await page.goto(`${BACKSTAGE_URL}/index`);
                await page.waitForTimeout(2000);
                await page.getByRole('button', { name: '官網設定' }).click();
                await page.getByRole('navigation').getByRole('link', { name: '廣告設定' }).click();
                await page.waitForTimeout(2000);

                const adFrame = page.locator('#hbsIframe').contentFrame();
                await adFrame.locator('#SectionSelect').waitFor({ state: 'visible', timeout: 60000 });

                await adFrame.locator('#SectionSelect').selectOption({ label: ad.section });
                await page.waitForLoadState('networkidle');
                await adFrame.locator('#TargetType').waitFor({ state: 'visible', timeout: 15000 });

                await adFrame.getByRole('textbox', { name: '廣告註解' }).fill(ad.note || '');

                await adFrame.locator('#TargetType').selectOption({ label: ad.linkType });
                await page.waitForTimeout(800);
                if (ad.linkType === '內連網址' && ad.articleId) {
                    console.log(`  🔗 填入文章 ID: ${ad.articleId}`);
                    const articleInput = adFrame.getByRole('textbox', { name: '文章Id 上架時間 下架時間' });
                    await articleInput.waitFor({ state: 'visible', timeout: 5000 });
                    await articleInput.fill(ad.articleId);
                } else if (ad.linkType === '外連網址' && ad.linkUrl) {
                    console.log(`  🔗 填入外連網址: ${ad.linkUrl}`);
                    await adFrame.locator('#TargetUrl').waitFor({ state: 'visible', timeout: 5000 });
                    await adFrame.locator('#TargetUrl').fill(ad.linkUrl);
                }

                console.log(`  📤 上傳圖片：${path.basename(imgPath)}`);
                await adFrame.getByRole('link', { name: '圖片選擇' }).click();
                await page.waitForTimeout(1000);

                const uploadBtn = adFrame.getByRole('button', { name: '於項目內新增相片' });
                await uploadBtn.setInputFiles(imgPath);
                await page.waitForTimeout(1000);

                await adFrame.locator('#SendPicture').click();
                await page.waitForTimeout(2000);

                await adFrame.locator('[id^="pictureSelected_"]').first().check();
                await page.waitForTimeout(500);
                await adFrame.getByRole('button', { name: '確定選取' }).click();
                await page.waitForTimeout(1000);

                await adFrame.locator('#StartTime').fill(formatTime(ad.startTime));
                await page.waitForTimeout(300);
                await adFrame.locator('#EndTime').fill(formatTime(ad.endTime));
                await page.waitForTimeout(500);

                page.once('dialog', async dialog => {
                    const msg = dialog.message();
                    if (msg.includes('請') || msg.includes('錯誤') || msg.includes('失敗')) {
                        console.log(`  ⚠️ 後台回應錯誤: "${msg}"`);
                        notify('⚠️ 廣告設定警告', `第 ${i + 1} 份後台回應錯誤：\n${msg}\n\nhttps://docs.google.com/document/d/${docId}/edit`);
                        await dialog.dismiss();
                    } else {
                        console.log(`  💬 彈窗: "${msg}"，自動確定`);
                        await dialog.accept();
                    }
                });
                await adFrame.locator('#InsertItem').click();
                await page.waitForTimeout(2000);
                console.log(`  ✅ 第 ${i + 1} 份廣告設定完成！`);
                await page.waitForTimeout(2000);
            }
        }
    }

    console.log('\n🎉 所有官網設定完畢！');
    await browserContext.close();
})();
