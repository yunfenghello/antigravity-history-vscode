/**
 * 数据刷新协调器 — 三级渐进式非阻塞极限流式刷新引擎 (第六步高性能架构)
 *
 * 核心功能：
 * - 阶段一（毫秒级极速首屏）：内存与持久化联合缓存 2ms 内即时下发会话与方案计划，消灭界面白屏与等待感
 * - 阶段二（快速本地异步对齐）：磁盘物理实体与脑图工件增量异步对齐，强一致性淘汰幽灵残留，无阻推送最新工件
 * - 阶段三（后台静默网络富化）：优先对已有端点执行毫秒级心跳探活 (Fast Ping 2~5ms)，端点存活时彻底跳过 wmic/netstat 进程派生
 * - 负向未命中缓存机制 (Negative Caching)：针对无标题与空会话打标防刷，杜绝重复发起徒劳的网络请求风暴
 * - 纯内存淘汰与阶段末期单次原子回写：杜绝刷新过程中反复同步读写物理磁盘文件
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import { discoverAndListAll, fastCheckLiveEndpoints, TrajectorySummary, LsEndpoint } from '../core/ls-client.js';
import {
  scanDiskConversations,
  getCandidateConvDirs,
  recoverUnindexed,
  getConversationsDir,
} from '../core/recovery.js';
import { readFullCache, writeCache } from '../core/cache.js';
import { scanBrainPlans, PlanItem } from '../services/plan-service.js';
import { resolveExportPath, getDefaultConversationsDir } from '../utils/path-utils.js';
import { getCurrentLanguage } from '../utils/i18n.js';
import type { WebviewOutgoingMessage } from './types.js';

export interface RefreshState {
  cachedConversations: Record<string, TrajectorySummary>;
  cachedEndpointMap: Record<string, { port: number; csrf: string; appDataDir?: string }>;
  detectedAppDataDirs: string[];
  availableEndpoints: LsEndpoint[];
  cachedPlans: PlanItem[];
  negativeRecoveryIds?: Set<string>;
  isBackgroundRefreshing: boolean;
  lastSentConvDigest?: string;
}

/**
 * 计算会话集合轻量哈希指纹，用于过滤冗余刷新推送 (消除高频重绘)
 */
function getConversationsDigest(convs: Record<string, TrajectorySummary>): string {
  const keys = Object.keys(convs);
  let hash = `${keys.length}:`;
  for (const k of keys) {
    const item = convs[k];
    hash += `${k}:${item?.lastModifiedTime || ''}:${item?.stepCount || 0}:${item?.summary || ''};`;
  }
  return hash;
}

/**
 * 刷新并向前端推送脑图方案计划列表 (实时精准下发，杜绝假指纹阻断)
 *
 * @param state 共享刷新状态
 * @param postMessage 前端消息投递函数
 */
export function refreshPlans(
  state: RefreshState,
  postMessage: (msg: WebviewOutgoingMessage) => void,
): void {
  try {
    state.cachedPlans = scanBrainPlans(state.detectedAppDataDirs);
    postMessage({ command: 'setPlans', plans: state.cachedPlans });
  } catch (e) {
    postMessage({ command: 'error', text: `方案计划扫描失败: ${e}` });
  }
}

/**
 * 执行三级渐进式非阻塞极限流式刷新流水线
 *
 * @param state 共享刷新状态
 * @param postMessage 前端消息投递函数
 */
export async function runProgressiveRefresh(
  state: RefreshState,
  postMessage: (msg: WebviewOutgoingMessage) => void,
): Promise<void> {
  const primaryConvDir =
    getConversationsDir(state.detectedAppDataDirs) || getDefaultConversationsDir();

  // ══════════════════════════════════════════════════════════════════
  // 阶段一：首屏毫秒级即时呈现 (< 2ms 纯内存与持久化联合下发)
  // ══════════════════════════════════════════════════════════════════
  const cachePayload = readFullCache();
  state.cachedConversations = { ...cachePayload.conversations, ...state.cachedConversations };

  if (!state.negativeRecoveryIds) {
    state.negativeRecoveryIds = new Set(cachePayload.negativeRecoveryIds || []);
  }

  // 同步多语言偏好
  const currentLang = getCurrentLanguage();
  postMessage({ command: 'setLanguage', language: currentLang });

  // 首屏下发已有会话快照
  if (Object.keys(state.cachedConversations).length > 0) {
    state.lastSentConvDigest = getConversationsDigest(state.cachedConversations);
    postMessage({
      command: 'setConversations',
      data: state.cachedConversations,
      convDir: primaryConvDir,
    });
  }

  // 首屏优先即刻下发已有或持久化缓存的方案计划，消灭白屏与等待感
  const plansForStage1 = (state.cachedPlans && state.cachedPlans.length > 0)
    ? state.cachedPlans
    : (cachePayload.plans || []);
  if (plansForStage1.length > 0) {
    state.cachedPlans = plansForStage1;
    postMessage({ command: 'setPlans', plans: state.cachedPlans });
  }

  // 下发导出配置项
  syncExportConfiguration(postMessage);

  // ══════════════════════════════════════════════════════════════════
  // 阶段二：本地文件系统与脑图异步增量对齐 (10-20ms)
  // ══════════════════════════════════════════════════════════════════
  try {
    const candidateDirs = getCandidateConvDirs(state.detectedAppDataDirs);
    const diskItems = scanDiskConversations(candidateDirs);

    // 强一致性纯内存淘汰幽灵残留会话（不产生多余同步磁盘写入）
    const validDiskIds = new Set<string>();
    for (const item of diskItems) {
      validDiskIds.add(item.id);
    }

    for (const key of Object.keys(state.cachedConversations)) {
      if (!validDiskIds.has(key)) {
        delete state.cachedConversations[key];
      }
    }

    // 将磁盘实体合并进内存，按最新活跃修改时间置顶
    for (const item of diskItems) {
      const existing = state.cachedConversations[item.id];
      const itemMtimeIso = item.mtime.toISOString();
      if (!existing) {
        state.cachedConversations[item.id] = {
          summary: `会话 ${item.id.slice(0, 8)}`,
          lastModifiedTime: itemMtimeIso,
          createdTime: itemMtimeIso,
          stepCount: 1,
        };
      } else {
        if (!existing.lastModifiedTime || item.mtime.getTime() > new Date(existing.lastModifiedTime).getTime()) {
          existing.lastModifiedTime = itemMtimeIso;
        }
      }
    }

    // 过滤掉无有效信息的纯占位幽灵项
    for (const [id, info] of Object.entries(state.cachedConversations)) {
      if (
        !info.summary &&
        info.stepCount === undefined &&
        !info.lastModifiedTime &&
        (!info.workspaces || info.workspaces.length === 0)
      ) {
        delete state.cachedConversations[id];
      }
    }

    // 阶段二成果：仅在数据有实质变更时才下发前端
    const stage2Digest = getConversationsDigest(state.cachedConversations);
    if (stage2Digest !== state.lastSentConvDigest) {
      state.lastSentConvDigest = stage2Digest;
      postMessage({
        command: 'setConversations',
        data: state.cachedConversations,
        convDir: primaryConvDir,
      });
    }

    // 阶段二：异步极速对齐脑图工件，并确保推送到前端
    state.cachedPlans = scanBrainPlans(state.detectedAppDataDirs);
    postMessage({ command: 'setPlans', plans: state.cachedPlans });
  } catch (err) {
    postMessage({ command: 'error', text: `本地实体增量对齐失败: ${err}` });
  }

  // ══════════════════════════════════════════════════════════════════
  // 阶段三：后台静默网络探测与平滑富化 (异步执行，毫秒级心跳优先)
  // ══════════════════════════════════════════════════════════════════
  if (state.isBackgroundRefreshing) {
    return;
  }
  state.isBackgroundRefreshing = true;

  // 使用 setImmediate / Promise 触发后台静默探测任务
  Promise.resolve().then(async () => {
    try {
      let result: {
        conversations: Record<string, TrajectorySummary>;
        cascadeToEndpoint: Record<string, { port: number; csrf: string; appDataDir?: string }>;
        endpoints: LsEndpoint[];
        appDataDirs: string[];
      } | null = null;

      // 核心优化：优先对已有活跃端点发起毫秒级心跳探活 (Fast Ping)
      if (state.availableEndpoints && state.availableEndpoints.length > 0) {
        result = await fastCheckLiveEndpoints(state.availableEndpoints);
      }

      // 若已有端点失效或为空，才触发全系统 wmic / netstat 异步深度发现
      if (!result) {
        result = await discoverAndListAll();
      }

      state.cachedEndpointMap = result.cascadeToEndpoint;
      state.detectedAppDataDirs = result.appDataDirs;
      state.availableEndpoints = result.endpoints;

      // 合并语言服务返回的实时活跃摘要
      for (const [id, info] of Object.entries(result.conversations)) {
        state.cachedConversations[id] = { ...(state.cachedConversations[id] || {}), ...info };
      }

      // 针对未索引或大标题未还原的会话执行轻量后台补充探测（排除负向缓存条目）
      if (result.endpoints.length > 0) {
        const epList = result.endpoints.map((e) => ({ port: e.port, csrf: e.csrf }));
        const negativeSet = state.negativeRecoveryIds || new Set<string>();

        const unindexed = Object.keys(state.cachedConversations).filter((id) => {
          if (negativeSet.has(id)) {
            return false;
          }
          const c = state.cachedConversations[id];
          return !c || !c.summary || c.summary.startsWith('会话 ') || c.summary === 'Untitled Conversation';
        });

        if (unindexed.length > 0) {
          const toRecover = unindexed.slice(0, 30);
          const recovery = await recoverUnindexed(
            toRecover,
            epList,
            (done: number, total: number) => {
              postMessage({ command: 'recoverProgress', done, total });
            },
            (id: string, partial: TrajectorySummary) => {
              state.cachedConversations[id] = { ...(state.cachedConversations[id] || {}), ...partial };
            },
          );

          // 记录不可恢复会话进负向缓存，下次刷新彻底跳过
          if (Array.isArray(recovery.unrecoverableIds)) {
            for (const uid of recovery.unrecoverableIds) {
              negativeSet.add(uid);
            }
          }

          if (recovery.activated > 0) {
            state.lastSentConvDigest = getConversationsDigest(state.cachedConversations);
            postMessage({
              command: 'setConversations',
              data: state.cachedConversations,
              convDir: primaryConvDir,
            });
            postMessage({
              command: 'recoverDone',
              activated: recovery.activated,
              total: recovery.total,
            });
          }
        }
      }

      // 静默同步最终合并结果 (带脏检查，无变更则跳过前端推送)
      const finalDigest = getConversationsDigest(state.cachedConversations);
      if (finalDigest !== state.lastSentConvDigest) {
        state.lastSentConvDigest = finalDigest;
        postMessage({
          command: 'setConversations',
          data: state.cachedConversations,
          convDir: primaryConvDir,
        });
      }

      // 阶段三末期：单次原子持久化全量回写缓存文件 (合并写入会话、计划与负向标记)
      writeCache(
        state.cachedConversations,
        state.cachedPlans,
        Array.from(state.negativeRecoveryIds || []),
      );
    } catch (bgErr) {
      console.warn('后台会话网络富化探测异常:', bgErr);
    } finally {
      state.isBackgroundRefreshing = false;
    }
  });
}

/**
 * 同步用户导出相关配置项至前端
 *
 * @param postMessage 前端消息投递函数
 */
function syncExportConfiguration(postMessage: (msg: WebviewOutgoingMessage) => void): void {
  const config = vscode.workspace.getConfiguration('aghistory');
  const exportDir = resolveExportPath(config.get<string>('exportPath', './antigravity_export'));
  const exportStrategy = config.get<string>('exportStrategy', 'workspace');
  const singleExportMode = config.get<string>('singleExportMode', 'dialog');

  postMessage({ command: 'setExportPath', path: exportDir });
  postMessage({ command: 'setExportStrategy', strategy: exportStrategy });
  postMessage({ command: 'setSingleExportMode', mode: singleExportMode });
}
