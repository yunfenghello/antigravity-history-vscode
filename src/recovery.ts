/**
 * 本地会话扫描与全量恢复管理模块
 *
 * 核心功能：
 * - 扫描本地数据目录中的会话实体文件（兼容 antigravity-ide 与 antigravity）
 * - 支持扫描 SQLite (.db/.db-wal) 数据库与 Protobuf (.pb) 文件
 * - 精准比对 .db-wal 活跃写入时间戳，确保最新修改会话置顶
 * - 提取多段用户输入条目（items）拼接还原真实会话大标题
 * - 输出物理真实存在的会话 ID 集合，为缓存淘汰与一致性校验提供事实依据
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-03
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
 * 恢复未索引会话的核心摘要与标题（优先通过可用端点）
 */
export async function recoverUnindexed(
  unindexedIds: string[],
  endpoints: Array<{ port: number; csrf: string }>,
  onProgress?: (done: number, total: number, id: string) => void,
  onItemLoaded?: (id: string, summary: TrajectorySummary) => void,
): Promise<{ activated: number; failed: number; total: number }> {
  if (unindexedIds.length === 0 || endpoints.length === 0) {
    return { activated: 0, failed: 0, total: 0 };
  }

  let activated = 0;
  let failed = 0;
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
        5000,
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
        }
        return { cascadeId, success: true };
      }
      return { cascadeId, success: false };
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.success) {
        activated++;
      } else {
        failed++;
      }
      onProgress?.(activated + failed, unindexedIds.length, r.cascadeId);
    }
  }

  return { activated, failed, total: unindexedIds.length };
}
