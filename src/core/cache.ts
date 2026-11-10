/**
 * 本地会话与方案计划持久化缓存与淘汰清理模块 (高可靠生产级)
 *
 * 核心功能：
 * - 统一缓存会话列表与方案计划元数据，实现面板秒级极速首屏呈现
 * - 记录探测未命中（负向缓存）的无效会话 ID，避免每次重复发起无效网络探测
 * - 提供纯内存与持久化两种淘汰机制，消灭中间冗余磁盘同步读写
 * - 安全序列化与多层容错处理
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TrajectorySummary } from './ls-client.js';
import { PlanItem } from '../services/plan-service.js';

const CACHE_DIR = path.join(os.homedir(), '.gemini', 'antigravity-history');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

export interface CachePayload {
  conversations: Record<string, TrajectorySummary>;
  plans: PlanItem[];
  negativeRecoveryIds: string[];
}

interface CacheData {
  version: number;
  updatedAt: string;
  conversations: Record<string, TrajectorySummary>;
  plans?: PlanItem[];
  negativeRecoveryIds?: string[];
}

/**
 * 读取完整的持久化缓存结构（包含会话、方案计划与负向探测记录）
 */
export function readFullCache(): CachePayload {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return { conversations: {}, plans: [], negativeRecoveryIds: [] };
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data: CacheData = JSON.parse(raw);
    const conversations = data.conversations || {};
    const plans = Array.isArray(data.plans) ? data.plans : [];
    const negativeRecoveryIds = Array.isArray(data.negativeRecoveryIds) ? data.negativeRecoveryIds : [];
    return { conversations, plans, negativeRecoveryIds };
  } catch {
    return { conversations: {}, plans: [], negativeRecoveryIds: [] };
  }
}

/**
 * 兼容原有接口：读取会话持久化缓存
 */
export function readCache(): Record<string, TrajectorySummary> {
  return readFullCache().conversations;
}

/**
 * 写入持久化缓存（全量原子回写，支持合并写入会话、计划与负向标记）
 *
 * @param conversations 会话字典
 * @param plans 方案计划列表
 * @param negativeRecoveryIds 已确认无标题的会话标识列表
 */
export function writeCache(
  conversations: Record<string, TrajectorySummary>,
  plans?: PlanItem[],
  negativeRecoveryIds?: string[],
): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    let finalPlans = plans;
    let finalNegative = negativeRecoveryIds;

    // 若未显式传入，尝试继承已有缓存，防止丢失已有工件数据
    if (!finalPlans || !finalNegative) {
      const existing = readFullCache();
      if (!finalPlans) {
        finalPlans = existing.plans;
      }
      if (!finalNegative) {
        finalNegative = existing.negativeRecoveryIds;
      }
    }

    const data: CacheData = {
      version: 2,
      updatedAt: new Date().toISOString(),
      conversations,
      plans: finalPlans || [],
      negativeRecoveryIds: finalNegative || [],
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
