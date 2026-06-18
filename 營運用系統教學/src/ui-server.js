const { chromium } = require('./node_modules/playwright');
const { execSync, spawn } = require('child_process');
let currentProcess = null;
let userStopped = false;
const path = require('path');
const fs = require('fs');
const { findChrome } = require('./chrome-path.js');

const SCRIPTS_DIR = __dirname;
const CONFIG_PATH = path.join(__dirname, '..', '系統資料', 'config.json');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function saveConfig(data) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 4), 'utf8');
}

const SCRIPTS = [
    { id: 'article',   name: '官網文章',   file: 'auto-post-article.js' },
    { id: 'ad',        name: '廣告設定',   file: 'auto-post-ad.js' },
    { id: 'marquee',   name: '跑馬燈設定', file: 'auto-post-marquee.js' },
    { id: 'broadcast', name: '定時廣播',   file: 'auto-post-broadcast.js' },
];

const HTML = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>自動發布系統</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'Microsoft JhengHei', sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
}
.container {
    background: #1e293b;
    border-radius: 16px;
    padding: 48px 48px;
    width: 700px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
h1 {
    font-size: 22px;
    text-align: center;
    margin-bottom: 28px;
    color: #94a3b8;
    letter-spacing: 2px;
}
h1 span { color: #38bdf8; }
.section { margin-bottom: 24px; }
.label {
    font-size: 11px;
    color: #64748b;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 10px;
}
.script-card {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    user-select: none;
}
.script-card:hover { border-color: #38bdf8; background: #1a2942; }
.script-card.checked { border-color: #38bdf8; }
.script-card input[type="checkbox"] {
    width: 16px; height: 16px;
    margin-right: 12px;
    accent-color: #38bdf8;
    cursor: pointer;
    flex-shrink: 0;
}
.script-card label { cursor: pointer; font-size: 16px; flex: 1; }
.badge-missing {
    font-size: 10px;
    background: #7f1d1d;
    color: #fca5a5;
    padding: 2px 7px;
    border-radius: 4px;
}
.timing-row { display: flex; gap: 10px; margin-bottom: 12px; }
.timing-btn {
    flex: 1;
    padding: 10px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #94a3b8;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Microsoft JhengHei', sans-serif;
}
.timing-btn.active {
    background: #0c2a4a;
    border-color: #38bdf8;
    color: #38bdf8;
}
#schedBlock { display: none; margin-top: 8px; }
#schedTime {
    width: 100%;
    padding: 10px 14px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 14px;
    font-family: 'Microsoft JhengHei', sans-serif;
}
#schedTime:focus { outline: none; border-color: #38bdf8; }
.countdown {
    margin-top: 8px;
    font-size: 12px;
    color: #64748b;
    text-align: center;
    min-height: 18px;
}
.btn-run {
    width: 100%;
    padding: 18px;
    background: linear-gradient(135deg, #0ea5e9, #38bdf8);
    border: none;
    border-radius: 10px;
    color: #0f172a;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    letter-spacing: 1px;
    transition: opacity 0.2s, transform 0.1s;
    font-family: 'Microsoft JhengHei', sans-serif;
    margin-top: 4px;
}
.btn-run:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-run:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.btn-stop {
    width: 100%;
    padding: 18px;
    background: linear-gradient(135deg, #dc2626, #ef4444);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    letter-spacing: 1px;
    transition: opacity 0.2s, transform 0.1s;
    font-family: 'Microsoft JhengHei', sans-serif;
    margin-top: 4px;
    display: none;
}
.btn-stop:hover { opacity: 0.9; transform: translateY(-1px); }
.log {
    margin-top: 16px;
    padding: 14px;
    background: #0f172a;
    border: 1px solid #1e3a5f;
    border-radius: 10px;
    font-size: 13px;
    min-height: 54px;
    white-space: pre-line;
    line-height: 1.6;
    color: #64748b;
}
.log.running { color: #fbbf24; border-color: #78350f; }
.log.success { color: #34d399; border-color: #064e3b; }
.log.error   { color: #f87171; border-color: #7f1d1d; }
.log.sched   { color: #a78bfa; border-color: #4c1d95; }
.progress { display: flex; gap: 6px; margin-top: 12px; }
.dot { flex: 1; height: 4px; background: #1e293b; border-radius: 2px; }
.dot.done   { background: #34d399; }
.dot.active { background: #fbbf24; }
.dot.fail   { background: #f87171; }
.btn-scan {
    padding: 6px 14px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Microsoft JhengHei', sans-serif;
}
.btn-scan:hover:not(:disabled) { border-color: #38bdf8; color: #38bdf8; }
.btn-scan:disabled { opacity: 0.5; cursor: not-allowed; }
.scan-item {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    margin-bottom: 6px;
    cursor: pointer;
    user-select: none;
    transition: border-color 0.2s;
}
.scan-item.checked { border-color: #334155; }
.scan-item input[type="checkbox"] {
    width: 14px; height: 14px;
    margin-right: 10px;
    accent-color: #38bdf8;
    cursor: pointer;
    flex-shrink: 0;
}
.badge-web { font-size: 10px; background: #0c2a4a; color: #38bdf8; padding: 2px 7px; border-radius: 4px; margin-left: 6px; white-space: nowrap; }
.badge-app { font-size: 10px; background: #1e1b4b; color: #a78bfa; padding: 2px 7px; border-radius: 4px; margin-left: 6px; white-space: nowrap; }
</style>
</head>
<body>
<div class="container">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
        <h1 style="margin:0">自動發布 <span>控制台</span></h1>
        <button onclick="toggleSettings()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:color 0.2s;" title="帳號設定">⚙️</button>
    </div>

    <!-- 設定面板 -->
    <div id="settingsPanel" style="display:none;">
        <div class="label" style="margin-bottom:16px;">帳號設定</div>

        <div style="margin-bottom:14px;">
            <div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Google 帳號</div>
            <input id="cfg_google_email" placeholder="Email" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;font-family:inherit;">
        </div>

        <div style="margin-bottom:20px;">
            <div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">後台帳號</div>
            <div style="display:flex;gap:8px;">
                <input id="cfg_bs_u" placeholder="帳號" style="flex:1;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;font-family:inherit;">
                <input id="cfg_bs_p" placeholder="密碼" type="password" style="flex:1;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:14px;font-family:inherit;">
            </div>
        </div>

        <div style="display:flex;gap:8px;">
            <button onclick="saveSettings()" style="flex:1;padding:12px;background:#0ea5e9;border:none;border-radius:8px;color:#0f172a;font-weight:bold;font-size:15px;cursor:pointer;font-family:inherit;">儲存</button>
            <button onclick="toggleSettings()" style="flex:1;padding:12px;background:#334155;border:none;border-radius:8px;color:#e2e8f0;font-size:15px;cursor:pointer;font-family:inherit;">取消</button>
        </div>
        <div id="saveMsg" style="margin-top:10px;font-size:13px;text-align:center;color:#34d399;min-height:18px;"></div>
        <hr style="border-color:#1e293b;margin:24px 0;">
    </div>

    <div class="section">
        <div class="label" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span>待設定清單</span>
            <button class="btn-scan" id="scanBtn" onclick="doScan()">🔄 重新整理</button>
        </div>
        <div id="scanResults"><span style="color:#fbbf24;font-size:13px;">⏳ 正在讀取試算表...</span></div>
    </div>

    <div class="section">
        <div class="label">選擇執行腳本</div>
        ${SCRIPTS.map(s => `
        <div class="script-card checked" id="card_${s.id}" onclick="toggleCard('${s.id}')">
            <input type="checkbox" class="script-cb" id="cb_${s.id}" value="${s.file}" checked
                onclick="event.stopPropagation()"
                onchange="syncCard('${s.id}')">
            <label for="cb_${s.id}" onclick="event.stopPropagation()">${s.name}</label>
            <span class="badge-missing" id="miss_${s.id}" style="display:none">腳本不存在</span>
        </div>`).join('')}
    </div>

    <div class="section">
        <div class="label">執行時間</div>
        <div class="timing-row">
            <button class="timing-btn active" id="btn_now" onclick="setTiming('now')">▶ 立即執行</button>
            <button class="timing-btn" id="btn_sched" onclick="setTiming('sched')">⏰ 排程執行</button>
        </div>
        <div id="schedBlock">
            <input type="datetime-local" id="schedTime" oninput="updateCountdown()">
            <div class="countdown" id="countdown"></div>
        </div>
    </div>

    <div class="progress" id="progress" style="display:none">
        ${SCRIPTS.map(s => `<div class="dot" id="dot_${s.id}"></div>`).join('')}
    </div>

    <button class="btn-run" id="runBtn" onclick="startRun()">▶ 開始執行</button>
    <button class="btn-stop" id="stopBtn" onclick="stopRun()">⏹ 停止執行</button>
    <div class="log" id="log">請選擇腳本後點擊開始執行</div>
</div>

<script>
let timing = 'now';
let countdownTimer = null;

window.markMissing = (id) => {
    document.getElementById('miss_' + id).style.display = 'inline';
    const cb = document.getElementById('cb_' + id);
    cb.disabled = true;
    cb.checked = false;
    const card = document.getElementById('card_' + id);
    card.style.opacity = '0.45';
    card.style.cursor = 'not-allowed';
};

function toggleCard(id) {
    const cb = document.getElementById('cb_' + id);
    if (cb.disabled) return;
    cb.checked = !cb.checked;
    syncCard(id);
}
function syncCard(id) {
    const cb = document.getElementById('cb_' + id);
    document.getElementById('card_' + id).classList.toggle('checked', cb.checked);
}

function setTiming(t) {
    timing = t;
    document.getElementById('btn_now').classList.toggle('active', t === 'now');
    document.getElementById('btn_sched').classList.toggle('active', t === 'sched');
    document.getElementById('schedBlock').style.display = t === 'sched' ? 'block' : 'none';
    if (t === 'now') {
        document.getElementById('countdown').textContent = '';
        clearInterval(countdownTimer);
    }
}

function updateCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        const val = document.getElementById('schedTime').value;
        if (!val) return;
        const diff = new Date(val) - new Date();
        if (diff <= 0) { document.getElementById('countdown').textContent = '⚠️ 時間已過'; return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        document.getElementById('countdown').textContent =
            '距離執行還有 ' + (h ? h + ' 小時 ' : '') + m + ' 分 ' + s + ' 秒';
    }, 1000);
}

async function startRun() {
    const selectedScripts = Array.from(
        document.querySelectorAll('input.script-cb:checked:not(:disabled)')
    ).map(cb => cb.value);
    if (selectedScripts.length === 0) { setLog('⚠️ 請至少選擇一個腳本', 'error'); return; }

    const checkedDocs = Array.from(document.querySelectorAll('input.scan-cb:checked'));
    if (checkedDocs.length === 0) { setLog('⚠️ 請先從待設定清單勾選要處理的項目', 'error'); return; }

    await window.saveFilter(checkedDocs.map(cb => parseInt(cb.value)));
    await window.saveScriptSelection(selectedScripts);

    if (timing === 'sched') {
        const val = document.getElementById('schedTime').value;
        if (!val) { setLog('⚠️ 請設定排程時間', 'error'); return; }
        const diff = new Date(val) - new Date();
        if (diff <= 0) { setLog('⚠️ 排程時間必須晚於現在', 'error'); return; }
        document.getElementById('runBtn').disabled = true;
        setLog('⏰ 排程設定完成\\n將於 ' + new Date(val).toLocaleString('zh-TW') + ' 自動執行', 'sched');
        await window.scheduleSheet(diff);
    } else {
        window.showStopBtn();
        setLog('⏳ 開始執行...', 'running');
        await window.runSheet();
    }
}

function setLog(msg, cls) {
    const el = document.getElementById('log');
    el.textContent = msg;
    el.className = 'log ' + (cls || '');
}

window.showRunBtn = () => {
    document.getElementById('runBtn').style.display = 'block';
    document.getElementById('runBtn').disabled = false;
    document.getElementById('stopBtn').style.display = 'none';
};
window.showStopBtn = () => {
    document.getElementById('runBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'block';
};
async function stopRun() {
    await window.stopExecution();
}

window.setDot = (id, state) => {
    const el = document.getElementById('dot_' + id);
    if (el) el.className = 'dot ' + state;
};
window.setLog = setLog;
window.enableBtn = () => { document.getElementById('runBtn').disabled = false; };

// 設定面板
window.loadConfigToUI = (cfg) => {
    if (cfg.google)    document.getElementById('cfg_google_email').value = cfg.google.email || '';
    if (cfg.backstage) {
        document.getElementById('cfg_bs_u').value   = cfg.backstage.username || '';
        document.getElementById('cfg_bs_p').value   = cfg.backstage.password || '';
    }
};
function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    document.getElementById('saveMsg').textContent = '';
}
async function saveSettings() {
    const cfg = {
        google:    { email: document.getElementById('cfg_google_email').value },
        backstage: {
            url:      (cfg.backstage && cfg.backstage.url) ? cfg.backstage.url : '',
            username: document.getElementById('cfg_bs_u').value,
            password: document.getElementById('cfg_bs_p').value,
        }
    };
    await window.saveConfig(cfg);
    document.getElementById('saveMsg').textContent = '✅ 已儲存';
    setTimeout(() => { document.getElementById('saveMsg').textContent = ''; }, 2000);
}

async function doScan() {
    var btn = document.getElementById('scanBtn');
    if (btn) btn.disabled = true;
    document.getElementById('scanResults').innerHTML = '<span style="color:#fbbf24;font-size:13px;">⏳ 正在讀取試算表...</span>';
    try {
        var data = await window.scanSheet();
        if (data && data.error) {
            document.getElementById('scanResults').innerHTML = '<span style="color:#f87171;font-size:13px;">❌ ' + escHtml(data.error) + '</span>';
        } else if (!Array.isArray(data) || data.length === 0) {
            document.getElementById('scanResults').innerHTML = '<span style="color:#34d399;font-size:13px;">✅ 目前沒有待設定的項目</span>';
        } else {
            document.getElementById('scanResults').innerHTML = data.map(function(item, idx) {
                var badges = item.types.map(function(t) {
                    return '<span class="badge-' + (t === '官網' ? 'web' : 'app') + '">' + t + '</span>';
                }).join('');
                return '<div class="scan-item checked" id="scan_' + idx + '" onclick="toggleScan(' + idx + ')">' +
                    '<input type="checkbox" class="scan-cb" id="scb_' + idx + '" value="' + item.row + '" checked ' +
                    'onclick="event.stopPropagation()" onchange="syncScan(' + idx + ')">' +
                    '<span style="flex:1;font-size:13px;">' + escHtml(item.label) + '</span>' +
                    badges + '</div>';
            }).join('');
        }
    } catch(e) {
        document.getElementById('scanResults').innerHTML = '<span style="color:#f87171;font-size:13px;">❌ 掃描失敗</span>';
    }
    if (btn) btn.disabled = false;
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toggleScan(idx) {
    var cb = document.getElementById('scb_' + idx);
    cb.checked = !cb.checked;
    syncScan(idx);
}

function syncScan(idx) {
    document.getElementById('scan_' + idx).classList.toggle('checked', document.getElementById('scb_' + idx).checked);
}

// 掃描由 Node.js 在所有函數註冊完畢後觸發
</script>
</body>
</html>`;

async function runScriptsSequentially(page, scripts) {
    const idMap = Object.fromEntries(SCRIPTS.map(s => [s.file, s.id]));
    for (const script of scripts) {
        const id = idMap[script] || script;
        const scriptPath = path.join(SCRIPTS_DIR, script);
        await page.evaluate((id) => {
            window.setDot(id, 'active');
            window.setLog('⏳ 正在執行：' + id + '...', 'running');
        }, id);
        try {
            const stdout = execSync(`node "${scriptPath}"`, {
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf8',
                maxBuffer: 2 * 1024 * 1024,
            });
            const lastLines = stdout.trim().split('\n').filter(l => l.trim()).slice(-12).join('\n');
            await page.evaluate(([id, lines]) => {
                window.setDot(id, 'done');
                if (lines) window.setLog('✅ ' + id + ' 完成\n\n' + lines, 'success');
            }, [id, lastLines]);
        } catch (e) {
            const stdout = e.stdout ? e.stdout.toString() : '';
            const stderr = e.stderr ? e.stderr.toString() : '';
            const lastLines = (stdout + (stderr ? '\n' + stderr : '')).trim().split('\n').filter(l => l.trim()).slice(-15).join('\n');
            await page.evaluate(([id, lines]) => {
                window.setDot(id, 'fail');
                window.setLog('❌ 執行失敗：' + id + (lines ? '\n\n' + lines : ''), 'error');
            }, [id, lastLines]);
            await page.evaluate(() => window.enableBtn());
            return;
        }
    }
    await page.evaluate(() => window.setLog('🎉 所有腳本執行完畢！', 'success'));
    await page.evaluate(() => window.enableBtn());
}

(async () => {
    // 控制台 UI 不需要 google_auth，用一般瀏覽器避免佔用資料夾
    const browser = await chromium.launch({
        headless: false,
        executablePath: findChrome(),
        args: ['--window-size=780,900'],
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 780, height: 860 });

    // ── 先註冊所有 exposed functions，再載入 HTML ──
    // 確保 DOMContentLoaded 觸發 doScan() 時，window.scanSheet 等函數已存在

    const doRunSheet = () => new Promise((resolve) => {
        const scriptPath = path.join(SCRIPTS_DIR, 'run-from-sheet.js');
        userStopped = false;
        currentProcess = spawn('node', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '', stderr = '';
        currentProcess.stdout.on('data', d => { stdout += d.toString(); });
        currentProcess.stderr.on('data', d => { stderr += d.toString(); });

        currentProcess.on('close', async (code) => {
            currentProcess = null;
            const out = (stdout + (stderr ? '\n' + stderr : '')).trim();
            const lastLines = out.split('\n').filter(l => l.trim()).slice(-15).join('\n');

            if (userStopped) {
                await page.evaluate(() => {
                    window.setLog('⏹ 已中止，正在回填已完成項目狀態...', 'running');
                }).catch(() => {});
                // 等待 Playwright browser 完全釋放 google_auth profile
                await new Promise(r => setTimeout(r, 2000));
                // 清除可能殘留的 SingletonLock
                const lockPath = path.join(__dirname, '..', '系統資料', 'google_auth', 'SingletonLock');
                if (fs.existsSync(lockPath)) { try { fs.unlinkSync(lockPath); } catch {} }
                const updateProc = spawn('node', [path.join(SCRIPTS_DIR, 'run-from-sheet.js'), '--update-only'], { stdio: 'pipe' });
                updateProc.on('close', async (updateCode) => {
                    if (updateCode === 0) {
                        await page.evaluate(() => {
                            window.setLog('⏹ 已中止，已完成項目狀態已回填', 'error');
                            window.showRunBtn();
                            doScan();
                        }).catch(() => {});
                    } else {
                        await page.evaluate(() => {
                            window.setLog('⏹ 已中止（無狀態需要回填）', 'error');
                            window.showRunBtn();
                        }).catch(() => {});
                    }
                });
            } else if (code === 0) {
                await page.evaluate((lines) => {
                    window.setLog('✅ 執行完成\n\n' + lines, 'success');
                    window.showRunBtn();
                    doScan();
                }, lastLines).catch(() => {});
            } else {
                await page.evaluate((lines) => {
                    window.setLog('❌ 執行失敗\n\n' + lines, 'error');
                    window.showRunBtn();
                }, lastLines).catch(() => {});
            }
            resolve();
        });
    });

    await page.exposeFunction('saveConfig', (data) => {
        saveConfig(data);
    });

    await page.exposeFunction('runScripts', async (scripts) => {
        await runScriptsSequentially(page, scripts);
    });

    await page.exposeFunction('scheduleRun', async (scripts, delayMs) => {
        setTimeout(async () => {
            await page.evaluate(() => window.setLog('⏳ 排程時間到，開始執行...', 'running'));
            await runScriptsSequentially(page, scripts);
        }, delayMs);
    });

    await page.exposeFunction('scanSheet', () => {
        const scanPath = path.join(SCRIPTS_DIR, 'scan-sheet.js');
        const resultPath = path.join(SCRIPTS_DIR, '_scan_result.json');
        try {
            execSync(`node "${scanPath}"`, {
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf8',
                maxBuffer: 1024 * 1024,
                timeout: 180000,
            });
        } catch (e) { /* scan-sheet writes result file even on error */ }
        if (fs.existsSync(resultPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
                fs.unlinkSync(resultPath);
                return data;
            } catch { return { error: '結果解析失敗' }; }
        }
        return { error: '掃描腳本未輸出結果' };
    });

    await page.exposeFunction('saveFilter', (rows) => {
        const filterPath = path.join(SCRIPTS_DIR, '_sheet_filter.json');
        if (rows && rows.length > 0) {
            fs.writeFileSync(filterPath, JSON.stringify(rows), 'utf8');
        } else if (fs.existsSync(filterPath)) {
            fs.unlinkSync(filterPath);
        }
    });

    await page.exposeFunction('saveScriptSelection', (scripts) => {
        const selPath = path.join(SCRIPTS_DIR, '_script_selection.json');
        fs.writeFileSync(selPath, JSON.stringify(scripts), 'utf8');
    });

    await page.exposeFunction('runSheet', doRunSheet);

    await page.exposeFunction('stopExecution', () => {
        if (!currentProcess) return false;
        userStopped = true;
        try {
            execSync(`taskkill /F /T /PID ${currentProcess.pid}`, { stdio: 'ignore' });
        } catch {
            currentProcess.kill();
        }
        return true;
    });

    await page.exposeFunction('scheduleSheet', (delayMs) => {
        setTimeout(async () => {
            await page.evaluate(() => window.setLog('⏳ 排程時間到，開始執行...', 'running'));
            await doRunSheet();
        }, delayMs);
    });

    // ── 所有函數註冊完畢後，才載入 HTML ──
    await page.setContent(HTML, { waitUntil: 'domcontentloaded' });

    // 標記不存在的腳本
    for (const s of SCRIPTS) {
        const filePath = path.join(SCRIPTS_DIR, s.file);
        if (!fs.existsSync(filePath)) {
            await page.evaluate((id) => window.markMissing(id), s.id);
        }
    }

    // 直接將 config 值寫入 DOM（不依賴 loadConfigToUI 是否已定義）
    const cfg = loadConfig();
    await page.evaluate((cfg) => {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('cfg_google_email', cfg.google?.email);
        set('cfg_bs_u',    cfg.backstage?.username);
        set('cfg_bs_p',    cfg.backstage?.password);
    }, cfg);

    // 所有設定完成後，觸發初始掃描
    await page.evaluate(() => doScan());

    console.log('✅ 控制台已開啟，關閉視窗即結束。');

    // 等到使用者手動關閉視窗
    await new Promise((resolve) => {
        page.on('close', resolve);
        browser.on('disconnected', resolve);
    });

    await browser.close().catch(() => {});
    process.exit(0);
})();
