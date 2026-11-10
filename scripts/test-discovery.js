const { execSync } = require('child_process');
const os = require('os');

console.log('=== 测试进程与端口探测耗时 ===');
const t0 = Date.now();

try {
  const stdout = execSync('wmic process get processid,caption,commandline /format:csv', {
    timeout: 8000,
    encoding: 'utf-8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log('1. wmic 执行完成，耗时:', Date.now() - t0, 'ms');

  const servers = [];
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.includes('agy.exe') || lower.includes('language_server') || lower.includes('csrf_token')) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const pidStr = parts[parts.length - 1].trim();
        const pid = parseInt(pidStr, 10);
        const cmdLine = parts.slice(2, parts.length - 1).join(',');
        const m = cmdLine.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);
        const csrf = m ? m[1] : '';
        if (csrf && !isNaN(pid)) {
          servers.push({ pid, csrf, cmdLine });
        }
      }
    }
  }
  console.log('2. 匹配到的语言服务进程数:', servers.length);

  for (const srv of servers) {
    const t1 = Date.now();
    const netstatOut = execSync('netstat -ano', { encoding: 'utf-8', timeout: 6000, windowsHide: true });
    console.log(`3. 进程 PID ${srv.pid} 执行 netstat 耗时:`, Date.now() - t1, 'ms');
  }

} catch (err) {
  console.error('执行报错:', err);
}

console.log('总耗时:', Date.now() - t0, 'ms');

// 继续测试端口与HTTP API调用
const http = require('http');
const https = require('https');

async function testApi(port, csrf) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const body = JSON.stringify({});
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': csrf,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 2000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ ok: res.statusCode === 200, status: res.statusCode, elapsed: Date.now() - t0, len: data.length });
      });
    });
    req.on('error', (e) => resolve({ ok: false, err: e.message, elapsed: Date.now() - t0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, timeout: true, elapsed: Date.now() - t0 }); });
    req.write(body);
    req.end();
  });
}

(async () => {
  const netstatOut = execSync('netstat -ano', { encoding: 'utf-8' });
  const pids = [18152, 25200];
  for (const pid of pids) {
    const ports = [];
    for (const line of netstatOut.split('\n')) {
      if (line.includes('LISTENING') && line.includes(String(pid))) {
        const m = line.match(/127\.0\.0\.1:(\d+)/);
        if (m) ports.push(parseInt(m[1], 10));
      }
    }
    console.log(`PID ${pid} listening ports:`, ports);
    for (const port of ports) {
      const res = await testApi(port, 'test');
      console.log(`  -> Port ${port}:`, res);
    }
  }
})();
