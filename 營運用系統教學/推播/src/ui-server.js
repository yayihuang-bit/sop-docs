const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3000;
const CONFIG_FILE = path.join(__dirname, '..', '系統資料', 'config.json');

// 讀取/儲存設定
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
        return { username: 'yayihuang', password: 'asd123', scheduleTime: '' };
    }
}
function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// 排程
let scheduleTimer = null;
let scheduleFiredDate = '';
function setupSchedule(time) {
    if (scheduleTimer) clearInterval(scheduleTimer);
    if (!time) return;
    const scheduledHour = time.split(':')[0];
    scheduleTimer = setInterval(() => {
        const now = new Date();
        const currentHour = String(now.getHours()).padStart(2, '0');
        const today = now.toDateString();
        if (currentHour === scheduledHour && scheduleFiredDate !== today) {
            scheduleFiredDate = today;
            console.log(`[排程] ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')} 自動執行`);
            const pushChild = runScript(null);
            pushChild.on('close', () => {
                console.log('[排程] 推播發送完成，等待 8 秒後開始統計回填...');
                setTimeout(() => {
                    spawnScript('sync-push-stats.js', null);
                }, 8000);
            });
        }
    }, 60000);
}

// 啟動時套用排程
const cfg = loadConfig();
setupSchedule(cfg.scheduleTime);

function spawnScript(scriptName, sseRes) {
    const scriptPath = path.join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], { cwd: __dirname });

    const send = sseRes ? (obj) => {
        try { sseRes.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {}
    } : () => {};

    child.stdout.on('data', (data) => {
        data.toString().split('\n').filter(l => l.trim()).forEach(line => {
            console.log(line);
            send({ type: 'log', text: line });
        });
    });
    child.stderr.on('data', (data) => {
        data.toString().split('\n').filter(l => l.trim()).forEach(line => {
            console.error(line);
            send({ type: 'log', text: '⚠️ ' + line });
        });
    });
    child.on('close', (code) => {
        if (sseRes) {
            send(code === 0 ? { type: 'done' } : { type: 'error' });
            try { sseRes.end(); } catch {}
        }
    });
    return child;
}

function runScript(sseRes) {
    return spawnScript('auto-post-from-sheet.js', sseRes);
}

const HTML = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>推播自動發送</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Microsoft JhengHei', sans-serif;
  background: #f0f4f8;
  min-height: 100vh;
  padding: 30px 20px;
  display: flex;
  justify-content: center;
}
.wrap { width: 100%; max-width: 640px; display: flex; flex-direction: column; gap: 20px; }
.card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 28px;
}
h1 { font-size: 20px; color: #1a1a2e; margin-bottom: 4px; }
.subtitle { color: #999; font-size: 13px; margin-bottom: 20px; }
h2 { font-size: 15px; color: #333; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
label { font-size: 13px; color: #666; }
input[type=text], input[type=password], input[type=time] {
  padding: 10px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s;
  width: 100%;
}
input:focus { outline: none; border-color: #4f46e5; }
.btn-row { display: flex; gap: 10px; margin-top: 6px; }
.btn {
  flex: 1;
  padding: 11px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary { background: #4f46e5; color: white; }
.btn-primary:hover { background: #4338ca; }
.btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #475569; }
.btn-secondary:hover { background: #e2e8f0; }
.btn-danger { background: #fee2e2; color: #dc2626; }
.btn-danger:hover { background: #fecaca; }
.status-bar {
  display: flex; align-items: center; gap: 10px;
  background: #f8f9fa; border-radius: 10px;
  padding: 12px 16px; margin-bottom: 16px; font-size: 14px; color: #444;
}
.dot {
  width: 11px; height: 11px; border-radius: 50%;
  background: #cbd5e1; flex-shrink: 0; transition: background 0.3s;
}
.dot.idle { background: #cbd5e1; }
.dot.running { background: #f59e0b; animation: pulse 1s infinite; }
.dot.done { background: #10b981; }
.dot.error { background: #ef4444; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.log-area {
  background: #1e1e2e; color: #cdd6f4;
  border-radius: 10px; padding: 14px;
  font-family: 'Consolas', monospace; font-size: 12.5px;
  line-height: 1.7; height: 260px;
  overflow-y: auto; white-space: pre-wrap; word-break: break-all;
}
.log-area .ok { color: #a6e3a1; }
.log-area .warn { color: #f9e2af; }
.log-area .err { color: #f38ba8; }
.schedule-info {
  font-size: 13px; color: #4f46e5; background: #eef2ff;
  padding: 8px 12px; border-radius: 8px; margin-top: 10px;
  display: none;
}
.toast {
  position: fixed; bottom: 24px; right: 24px;
  background: #1e293b; color: white;
  padding: 12px 20px; border-radius: 10px;
  font-size: 14px; opacity: 0;
  transition: opacity 0.3s; pointer-events: none;
}
.toast.show { opacity: 1; }
.modal-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,0.45); z-index: 1000;
  align-items: center; justify-content: center;
}
.modal-overlay.show { display: flex; }
.modal {
  background: white; border-radius: 16px;
  padding: 28px; max-width: 480px; width: 90%;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18);
}
.modal h3 { font-size: 16px; color: #dc2626; margin-bottom: 8px; }
.modal p { font-size: 13px; color: #555; margin-bottom: 14px; }
.modal-list {
  background: #fef2f2; border-radius: 8px;
  padding: 12px 16px; margin-bottom: 18px;
  font-size: 13px; color: #7f1d1d; line-height: 2;
  max-height: 200px; overflow-y: auto;
}
.modal-close {
  width: 100%; padding: 11px; border: none;
  border-radius: 8px; background: #4f46e5; color: white;
  font-size: 14px; font-family: inherit; cursor: pointer;
}
.modal-close:hover { background: #4338ca; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>📣 推播自動發送系統</h1>
    <p class="subtitle">自動讀取試算表，發送所有「待發送」的推播</p>

    <div class="status-bar">
      <div class="dot idle" id="dot"></div>
      <span id="status-text">待機中</span>
    </div>

    <button class="btn btn-primary" id="run-btn" onclick="runScript()" style="width:100%;padding:14px;font-size:15px;margin-bottom:16px">
      ▶ 立即執行發送
    </button>

    <div class="log-area" id="log">等待執行...\n</div>
  </div>

  <!-- 統計回填 -->
  <div class="card">
    <h2>📈 推播統計回填</h2>
    <p style="font-size:13px;color:#666;margin-bottom:16px;">
      從後台「推播設定」匯出 <b>PushNotification*.xlsx</b>，<br>
      放入程式資料夾或下載資料夾，再點下方按鈕自動回填<br>
      <span style="color:#4f46e5;">H欄（點閱次數）、I欄（發送次數）、J欄（開啟率）</span>
    </p>
    <button class="btn btn-primary" id="stats-btn" onclick="runStats()" style="width:100%;margin-bottom:12px">
      ▶ 匯入統計數據
    </button>
    <div class="log-area" id="stats-log" style="height:180px">等待執行...\n</div>
  </div>

  <!-- 排程設定 -->
  <div class="card">
    <h2>⏰ 排程設定</h2>
    <div class="form-row">
      <label>每天自動執行時間（留空代表不排程）</label>
      <input type="time" id="schedule-time" value="">
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveSchedule()">儲存排程</button>
      <button class="btn btn-danger" onclick="clearSchedule()">清除排程</button>
    </div>
    <div class="schedule-info" id="schedule-info"></div>
  </div>

  <!-- 帳號設定 -->
  <div class="card">
    <h2>🔐 後台帳號設定</h2>
    <div class="form-row">
      <label>帳號</label>
      <input type="text" id="username" placeholder="請輸入帳號">
    </div>
    <div class="form-row">
      <label>密碼</label>
      <input type="password" id="password" placeholder="請輸入密碼">
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveAccount()">儲存帳號</button>
    </div>
  </div>

  <!-- Google 帳號 -->
  <div class="card">
    <h2>🌐 Google 帳號設定</h2>
    <p style="font-size:13px;color:#666;margin-bottom:16px;">點擊下方按鈕會開啟瀏覽器，完成 Google 登入後關閉瀏覽器即可。下次執行會自動使用新的帳號。</p>
    <button class="btn btn-secondary" id="google-btn" onclick="reloginGoogle()" style="width:100%">
      🔄 重新登入 Google 帳號
    </button>
    <div id="google-status" style="margin-top:10px;font-size:13px;color:#10b981;display:none"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<!-- 未配對警告 Modal -->
<div class="modal-overlay" id="unmatched-overlay">
  <div class="modal">
    <h3>⚠️ 部分資料未填入</h3>
    <p>以下 xlsx 中的推播在試算表找不到對應的日期/時間，<b>統計數據未回填</b>：</p>
    <div class="modal-list" id="unmatched-list"></div>
    <p style="font-size:12px;color:#999;margin-bottom:16px;">
      請確認試算表的日期與時間格式是否與後台匯出一致。
    </p>
    <button class="modal-close" onclick="document.getElementById('unmatched-overlay').classList.remove('show')">
      我知道了
    </button>
  </div>
</div>

<script>
let running = false;

// 載入設定
fetch('/config').then(r=>r.json()).then(cfg => {
  document.getElementById('username').value = cfg.username || '';
  document.getElementById('password').value = cfg.password || '';
  document.getElementById('schedule-time').value = cfg.scheduleTime || '';
  updateScheduleInfo(cfg.scheduleTime);
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function updateScheduleInfo(time) {
  const el = document.getElementById('schedule-info');
  if (time) {
    el.style.display = 'block';
    el.textContent = '⏰ 已設定每天 ' + time + ' 自動執行';
  } else {
    el.style.display = 'none';
  }
}

function setStatus(state, text) {
  document.getElementById('dot').className = 'dot ' + state;
  document.getElementById('status-text').textContent = text;
}

function appendLog(text) {
  const log = document.getElementById('log');
  const span = document.createElement('span');
  if (text.includes('✅') || text.includes('🎉')) span.className = 'ok';
  else if (text.includes('⚠️') || text.includes('▶️') || text.includes('📝')) span.className = 'warn';
  else if (text.includes('❌') || text.toLowerCase().includes('error')) span.className = 'err';
  span.textContent = text + '\\n';
  log.appendChild(span);
  log.scrollTop = log.scrollHeight;
}

function runScript() {
  if (running) return;
  running = true;
  document.getElementById('run-btn').disabled = true;
  document.getElementById('log').innerHTML = '';
  setStatus('running', '執行中...');

  const es = new EventSource('/run');
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.type === 'log') appendLog(d.text);
    else if (d.type === 'done') {
      setStatus('done', '執行完成！');
      document.getElementById('run-btn').disabled = false;
      running = false; es.close();
    } else if (d.type === 'error') {
      setStatus('error', '執行失敗，請檢查 log');
      document.getElementById('run-btn').disabled = false;
      running = false; es.close();
    }
  };
  es.onerror = () => {
    setStatus('error', '連線中斷');
    document.getElementById('run-btn').disabled = false;
    running = false; es.close();
  };
}

function saveSchedule() {
  const time = document.getElementById('schedule-time').value;
  fetch('/save-config', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ scheduleTime: time })
  }).then(() => {
    updateScheduleInfo(time);
    showToast(time ? '排程已設定：每天 ' + time : '排程已儲存');
  });
}

function clearSchedule() {
  document.getElementById('schedule-time').value = '';
  fetch('/save-config', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ scheduleTime: '' })
  }).then(() => {
    updateScheduleInfo('');
    showToast('排程已清除');
  });
}

function saveAccount() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/save-config', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username, password })
  }).then(() => showToast('帳號密碼已儲存'));
}

let statsRunning = false;

function runStats() {
  if (statsRunning) return;
  statsRunning = true;
  document.getElementById('stats-btn').disabled = true;
  document.getElementById('stats-log').innerHTML = '';

  const appendStats = (text) => {
    const log = document.getElementById('stats-log');
    const span = document.createElement('span');
    if (text.includes('✅') || text.includes('🎉')) span.className = 'ok';
    else if (text.includes('⚠️') || text.includes('▶️')) span.className = 'warn';
    else if (text.includes('❌')) span.className = 'err';
    span.textContent = text + '\\n';
    log.appendChild(span);
    log.scrollTop = log.scrollHeight;
  };

  const showUnmatchedModal = (items) => {
    const list = document.getElementById('unmatched-list');
    list.innerHTML = items.map(function(item) { return '❌ ' + item; }).join('<br>');
    document.getElementById('unmatched-overlay').classList.add('show');
  };

  const es = new EventSource('/sync-stats');
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.type === 'log') {
      if (d.text.startsWith('__UNMATCHED__:')) {
        try {
          const items = JSON.parse(d.text.replace('__UNMATCHED__:', ''));
          showUnmatchedModal(items);
        } catch (_) {}
        return; // 不顯示在 log 裡
      }
      appendStats(d.text);
    } else if (d.type === 'done') {
      document.getElementById('stats-btn').disabled = false;
      statsRunning = false; es.close();
    } else if (d.type === 'error') {
      document.getElementById('stats-btn').disabled = false;
      statsRunning = false; es.close();
    }
  };
  es.onerror = () => {
    document.getElementById('stats-btn').disabled = false;
    statsRunning = false; es.close();
  };
}

function reloginGoogle() {
  const btn = document.getElementById('google-btn');
  const status = document.getElementById('google-status');
  btn.disabled = true;
  btn.textContent = '⏳ 瀏覽器開啟中，請完成登入後關閉瀏覽器...';
  status.style.display = 'none';

  fetch('/google-login').then(r => r.json()).then(d => {
    btn.disabled = false;
    btn.textContent = '🔄 重新登入 Google 帳號';
    if (d.ok) {
      status.style.display = 'block';
      status.textContent = '✅ Google 登入狀態已更新！';
    } else {
      status.style.color = '#ef4444';
      status.style.display = 'block';
      status.textContent = '❌ 登入失敗，請再試一次';
    }
  });
}
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML);
        return;
    }

    if (req.method === 'GET' && req.url === '/config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(loadConfig()));
        return;
    }

    if (req.method === 'POST' && req.url === '/save-config') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            const updates = JSON.parse(body);
            const cfg = loadConfig();
            Object.assign(cfg, updates);
            saveConfig(cfg);

            // 更新腳本的帳密
            if (updates.username !== undefined || updates.password !== undefined) {
                updateScriptCredentials(cfg.username, cfg.password);
            }
            // 套用排程
            if (updates.scheduleTime !== undefined) {
                setupSchedule(cfg.scheduleTime);
            }

            res.writeHead(200);
            res.end('ok');
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/google-login') {
        const loginScript = path.join(__dirname, 'google-login.js');
        const child = spawn('node', [loginScript], { cwd: __dirname });
        child.on('close', (code) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: code === 0 }));
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/run') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        const child = runScript(res);
        req.on('close', () => child.kill());
        return;
    }

    if (req.method === 'GET' && req.url === '/sync-stats') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        const child = spawnScript('sync-push-stats.js', res);
        req.on('close', () => child.kill());
        return;
    }

    res.writeHead(404);
    res.end();
});

function updateScriptCredentials(username, password) {
    const scriptPath = path.join(__dirname, 'auto-post-from-sheet.js');
    let content = fs.readFileSync(scriptPath, 'utf-8');
    content = content.replace(
        /await usernameInput\.fill\('[^']*'\)/,
        `await usernameInput.fill('${username}')`
    );
    content = content.replace(
        /\.first\(\)\.fill\('[^']*'\)/,
        `.first().fill('${password}')`
    );
    fs.writeFileSync(scriptPath, content);
}

server.listen(PORT, () => {
    console.log(`✅ 介面已啟動：http://localhost:${PORT}`);
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}`);
});
