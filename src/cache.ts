/**
 * 本地会话摘要持久化缓存与淘汰清理模块
 *
 * 核心功能：
 * - 缓存会话列表元数据，实现重启后毫秒级秒开
 * - 提供缓存淘汰接口（Prune），自动清理磁盘上已物理删除的幽灵残留会话
 * - 安全序列化与容错处理
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-03
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TrajectorySummary } from './ls-client.js';

const CACHE_DIR = path.join(os.homedir(), '.gemini', 'antigravity-history');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

interface CacheData {
  version: 1;
  updatedAt: string;
  conversations: Record<string, TrajectorySummary>;
}

/**
 * 读取持久化缓存
 */
export function readCache(): Record<string, TrajectorySummary> {
  try {
    if (!fs.existsSync(CACHE_FILE)) { return {}; }
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data: CacheData = JSON.parse(raw);
    if (data.version !== 1) { return {}; }
    return data.conversations || {};
  } catch {
    return {};
  }
}

/**
 * 写入持久化缓存
 */
export function writeCache(conversations: Record<string, TrajectorySummary>): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const data: CacheData = {
      version: 1,
      updatedAt: new Date().toISOString(),
      conversations,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // 写入失败安全处理
  }
}

/**
 * 缓存淘汰机制：严格对比真实合法 ID 集合，剔除物理磁盘或服务上已不存在的无效残留会话
 */
export function pruneCache(validIds: Set<string>): Record<string, TrajectorySummary> {
  const current = readCache();
  const pruned: Record<string, TrajectorySummary> = {};
  let removedCount = 0;

  for (const [id, summary] of Object.entries(current)) {
    if (validIds.has(id)) {
      pruned[id] = summary;
    } else {
      removedCount++;
    }
  }

  if (removedCount > 0) {
    writeCache(pruned);
  }
  return pruned;
}
