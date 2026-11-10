/**
 * 本地会话扫描与全量恢复管理模块
 *
 * 核心功能：
 * - 扫描本地数据目录中的会话实体文件（兼容 antigravity-ide 与 antigravity）
 * - 支持扫描 SQLite (.db/.db-wal) 数据库与 Protobuf (.pb) 文件
 * - 精准比对 .db-wal 活跃写入时间戳，确保最新修改会话置顶
 * - 提取多段用户输入条目（items）拼接还原真实会话大标题
 * - 输出物理真实存在的会话 ID 集合，为缓存淘汰与一致性校验提供事实依据
 * - 彻底物理删除会话相关 SQLite/PB 实体文件及关联脑图数据目录，支持单条与批量删除
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { callApi, TrajectorySummary } from './ls-client.js';

export interface DiskConversationItem {
  id: string;
  filePath: string;
  mtime: Date;
  size: number;
}

/**
 * 获取所有存在会话实体文件的候选目录列表（排除脑图工件目录，保障会话纯净）
 */
export function getCandidateConvDirs(customAppDirs: string[] = []): string[] {
  const home = os.homedir();
  const dirNames = new Set<string>();

  for (const name of customAppDirs) {
    if (name && typeof name === 'string') {
      dirNames.add(name);
    }
  }

  dirNames.add('antigravity');
  dirNames.add('antigravity-ide');

  const validDirs: string[] = [];
  for (const name of dirNames) {
    const p = path.join(home, '.gemini', name, 'conversations');
    if (fs.existsSync(p)) {
      validDirs.push(p);
    }
  }

  return validDirs;
}

/**
 * 获取主会话目录路径
 */
export function getConversationsDir(customAppDirs: string[] = []): string | null {
  const dirs = getCandidateConvDirs(customAppDirs);
  return dirs.length > 0 ? dirs[0] : null;
}

/**
 * 扫描指定目录下的所有实体文件，返回物理真实存在的会话快照
 */
export function scanDiskConversations(convDirs: string | string[]): DiskConversationItem[] {
  const dirs = Array.isArray(convDirs) ? convDirs : [convDirs];
  const map = new Map<string, DiskConversationItem>();

  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) { continue; }
    try {
      const items = fs.readdirSync(dir);

      // conversations 目录下扫描 .db 与 .pb 真实对话实体
      for (const file of items) {
        let id: string | null = null;
        if (file.endsWith('.db') && !file.endsWith('.db-wal') && !file.endsWith('.db-shm')) {
          id = file.slice(0, -3);
        } else if (file.endsWith('.pb')) {
          id = file.slice(0, -3);
        }

        if (id) {
          try {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            let latestMtime = stat.mtime;

            // 检查关联的 .db-wal 活跃写入日志时间戳
            const walPath = path.join(dir, `${file}-wal`);
            if (fs.existsSync(walPath)) {
              try {
                const walStat = fs.statSync(walPath);
                if (walStat.mtime.getTime() > latestMtime.getTime()) {
                  latestMtime = walStat.mtime;
                }
              } catch {
                // 忽略 wal 读取异常
              }
            }

            const existing = map.get(id);
            if (!existing || latestMtime.getTime() > existing.mtime.getTime()) {
              map.set(id, { id, filePath, mtime: latestMtime, size: stat.size });
            }
          } catch {
            // 安全忽略无法访问的文件
          }
        }
      }
    } catch {
      // 安全忽略目录扫描异常
    }
  }

  return Array.from(map.values());
}

/**
 * 提取磁盘物理存在的全部有效会话 ID 集合
 */
export function getValidDiskConversationIds(convDirs: string | string[]): Set<string> {
  const items = scanDiskConversations(convDirs);
  return new Set(items.map((it) => it.id));
}

/**
 * 恢复未索引会话的核心摘要与标题（优先通过可用端点，支持负向未命中识别）
 */
export async function recoverUnindexed(
  unindexedIds: string[],
  endpoints: Array<{ port: number; csrf: string }>,
  onProgress?: (done: number, total: number, id: string) => void,
  onItemLoaded?: (id: string, summary: TrajectorySummary) => void,
): Promise<{ activated: number; failed: number; total: number; unrecoverableIds: string[] }> {
  if (unindexedIds.length === 0 || endpoints.length === 0) {
    return { activated: 0, failed: 0, total: 0, unrecoverableIds: [] };
  }

  let activated = 0;
  let failed = 0;
  const unrecoverableIds: string[] = [];
  const batchSize = 5;

  for (let i = 0; i < unindexedIds.length; i += batchSize) {
    const batch = unindexedIds.slice(i, i + batchSize);
    const promises = batch.map(async (cascadeId, j) => {
      const ep = endpoints[(i + j) % endpoints.length];
      const result = await callApi(
        ep.port,
        ep.csrf,
        'GetCascadeTrajectorySteps',
        { cascadeId, startIndex: 0, endIndex: 1 },
        3000,
      );

      if (result) {
        const steps = (result.steps as Array<{ userInput?: { userQuery?: string; userResponse?: string; items?: Array<{ text?: string }> } }>) ||
          (result.messages as Array<{ userInput?: { userQuery?: string; userResponse?: string; items?: Array<{ text?: string }> } }>);

        let extractedTitle = '';
        if (steps && steps.length > 0) {
          const first = steps[0];
          if (first.userInput) {
            if (Array.isArray(first.userInput.items)) {
              for (const it of first.userInput.items) {
                if (typeof it.text === 'string' && it.text.trim()) {
                  extractedTitle += ' ' + it.text.trim();
                }
              }
            }
            if (!extractedTitle.trim()) {
              extractedTitle = first.userInput.userQuery || first.userInput.userResponse || '';
            }
            extractedTitle = extractedTitle.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 50);
          }
        }

        if (extractedTitle) {
          onItemLoaded?.(cascadeId, { summary: extractedTitle });
          return { cascadeId, success: true, hasTitle: true };
        }
        // 虽然响应了但该会话确实无标题（如空会话），标记为不可恢复项，纳入负向缓存
        return { cascadeId, success: false, hasTitle: false };
      }
      return { cascadeId, success: false, hasTitle: false };
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.success) {
        activated++;
      } else {
        failed++;
        unrecoverableIds.push(r.cascadeId);
      }
      onProgress?.(activated + failed, unindexedIds.length, r.cascadeId);
    }
  }

  return { activated, failed, total: unindexedIds.length, unrecoverableIds };
}

/**
 * 彻底物理删除会话相关 SQLite/PB 实体文件及关联脑图数据目录（异步并发高性能实现）
 *
 * @param cascadeId 会话全局唯一标识
 * @param customAppDirs 自定义应用目录
 * @param precomputedDirs 预计算的会话与脑图目录列表 (提速优化)
 * @returns 删除结果统计
 */
export async function deleteConversationFiles(
  cascadeId: string,
  customAppDirs: string[] = [],
  precomputedDirs?: { convDirs: string[]; brainDirs: string[] },
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  if (!cascadeId || typeof cascadeId !== 'string' || path.basename(cascadeId) !== cascadeId) {
    return { success: false, deletedCount: 0, error: '无效或不合法的会话标识' };
  }

  let deletedCount = 0;
  const convDirs = precomputedDirs ? precomputedDirs.convDirs : getCandidateConvDirs(customAppDirs);

  const home = os.homedir();
  const brainCandidates = precomputedDirs ? precomputedDirs.brainDirs : [
    path.join(home, '.gemini', 'antigravity', 'brain'),
    path.join(home, '.gemini', 'antigravity-ide', 'brain'),
    path.join(home, '.gemini', 'antigravity-backup', 'brain'),
  ];

  // 1. 并发删除 conversations 目录下的实体数据库与日志文件
  const exts = ['.db', '.db-wal', '.db-shm', '.pb'];
  const deleteTasks: Array<Promise<void>> = [];

  for (const dir of convDirs) {
    for (const ext of exts) {
      const targetFile = path.join(dir, `${cascadeId}${ext}`);
      deleteTasks.push(
        fs.promises.unlink(targetFile)
          .then(() => {
            deletedCount++;
          })
          .catch(() => {
            // 文件不存在或已被删除时安全忽略
          }),
      );
    }
  }

  // 2. 并发清理关联的 brain 数据目录 (含 transcript 日志与临时工件)
  for (const bDir of brainCandidates) {
    const targetBrainSub = path.join(bDir, cascadeId);
    deleteTasks.push(
      fs.promises.rm(targetBrainSub, { recursive: true, force: true })
        .then(() => {
          deletedCount++;
        })
        .catch(() => {
          // 目录不存在或被系统占有时安全容错，不中断整体流程
        }),
    );
  }

  try {
    await Promise.all(deleteTasks);
    return { success: true, deletedCount };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { success: false, deletedCount, error: errMsg };
  }
}

/**
 * 批量彻底物理删除会话实体文件及关联脑图数据目录（高并发毫秒级批处理）
 *
 * @param cascadeIds 待删除会话标识数组
 * @param customAppDirs 自定义应用目录
 * @returns 批量删除统计
 */
export async function batchDeleteConversationFiles(
  cascadeIds: string[],
  customAppDirs: string[] = [],
): Promise<{ successCount: number; failedCount: number; failedIds: string[] }> {
  let successCount = 0;
  let failedCount = 0;
  const failedIds: string[] = [];

  const home = os.homedir();
  const precomputedDirs = {
    convDirs: getCandidateConvDirs(customAppDirs),
    brainDirs: [
      path.join(home, '.gemini', 'antigravity', 'brain'),
      path.join(home, '.gemini', 'antigravity-ide', 'brain'),
      path.join(home, '.gemini', 'antigravity-backup', 'brain'),
    ],
  };

  // 采用分批并发执行，单批次最大 20 个会话并发，防止高并发耗尽操作系统文件句柄
  const batchSize = 20;
  for (let i = 0; i < cascadeIds.length; i += batchSize) {
    const chunk = cascadeIds.slice(i, i + batchSize);
    const chunkPromises = chunk.map((cid) => deleteConversationFiles(cid, customAppDirs, precomputedDirs));
    const results = await Promise.all(chunkPromises);

    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      const cid = chunk[j];
      if (res.success) {
        successCount++;
      } else {
        failedCount++;
        failedIds.push(cid);
      }
    }
  }

  return { successCount, failedCount, failedIds };
}
