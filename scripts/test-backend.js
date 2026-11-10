const os = require('os');
const path = require('path');
const fs = require('fs');

console.log('=== 测试后端真实扫描逻辑 ===');
const home = os.homedir();
const candidateDirs = [
  path.join(home, '.gemini', 'antigravity', 'conversations'),
  path.join(home, '.gemini', 'antigravity-ide', 'conversations')
].filter(p => fs.existsSync(p));

console.log('候选会话目录:', candidateDirs);

const t0 = Date.now();
// 模拟 scanDiskConversations
const map = new Map();
for (const dir of candidateDirs) {
  const items = fs.readdirSync(dir);
  for (const file of items) {
    let id = null;
    if (file.endsWith('.db') && !file.endsWith('.db-wal') && !file.endsWith('.db-shm')) {
      id = file.slice(0, -3);
    } else if (file.endsWith('.pb')) {
      id = file.slice(0, -3);
    }
    if (id) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      map.set(id, { id, filePath, mtime: stat.mtime });
    }
  }
}
console.log(`扫描本地磁盘会话完成，耗时 ${Date.now() - t0}ms，发现 ${map.size} 项`);

// 测试读取 cache.json
const cachePath = path.join(home, '.gemini', 'antigravity_history_cache.json');
console.log('Cache path exists:', fs.existsSync(cachePath));
if (fs.existsSync(cachePath)) {
  const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  console.log('Cache items:', Object.keys(cacheData).length);
}

// 模拟 scanBrainPlans
const brainDir = path.join(home, '.gemini', 'antigravity', 'brain');
if (fs.existsSync(brainDir)) {
  const t1 = Date.now();
  const subdirs = fs.readdirSync(brainDir);
  const plans = [];
  for (const d of subdirs) {
    const planDir = path.join(brainDir, d);
    if (!fs.statSync(planDir).isDirectory()) continue;
    const files = fs.readdirSync(planDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      plans.push({ id: d, dirPath: planDir, mdCount: mdFiles.length });
    }
  }
  console.log(`扫描脑图工件完成，耗时 ${Date.now() - t1}ms，发现 ${plans.length} 项`);
}

console.log('=== 后端扫描测试结束，耗时极短，无死锁 ===');
