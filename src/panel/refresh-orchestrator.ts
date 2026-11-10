/**
 * 数据刷新协调器 — 三级渐进式非阻塞流式刷新引擎
 *
 * 核心功能：
 * - 阶段一（毫秒级极速首屏）：内存与本地缓存 5ms 内即时下发渲染，彻底消灭界面白屏与等待感
 * - 阶段二（快速本地对齐）：磁盘物理实体异步扫描与幽灵淘汰，秒级同步最新文件修改时间
 * - 阶段三（后台静默富化）：语言服务进程探测与未索引标题网络补偿转为异步后台队列，不阻塞前端交互
 * - 防抖与并发保护机制：防止短时间内高频点击刷新引发端口扫描风暴
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import { discoverAndListAll, TrajectorySummary, LsEndpoint } from '../core/ls-client.js';
import {
  scanDiskConversations,
  getCandidateConvDirs,
  recoverUnindexed,
  getConversationsDir,
} from '../core/recovery.js';
import { readCache, writeCache, pruneCache } from '../core/cache.js';
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
  isBackgroundRefreshing: boolean;
}

/**
 * 刷新并向前端推送脑图方案计划列表
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
 * 执行三级渐进式非阻塞刷新流水线
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
  // 阶段一：首屏秒级即时呈现 (< 5ms 极速响应)
  // ══════════════════════════════════════════════════════════════════
  const localCache = readCache();
  state.cachedConversations = { ...localCache, ...state.cachedConversations };

  // 同步语言偏好与已有会话快照
  const currentLang = getCurrentLanguage();
  postMessage({ command: 'setLanguage', language: currentLang });

  if (Object.keys(state.cachedConversations).length > 0) {
    postMessage({
      command: 'setConversations',
      data: state.cachedConversations,
      convDir: primaryConvDir,
    });
  }

  // 同步刷新本地方案计划并下发导出配置
  refreshPlans(state, postMessage);
  syncExportConfiguration(postMessage);

  // ══════════════════════════════════════════════════════════════════
  // 阶段二：本地文件系统异步对齐 (10-30ms)
  // ══════════════════════════════════════════════════════════════════
  try {
    const candidateDirs = getCandidateConvDirs(state.detectedAppDataDirs);
    const diskItems = scanDiskConversations(candidateDirs);

    // 强一致性淘汰幽灵残留会话
    const validDiskIds = new Set<string>();
    for (const item of diskItems) {
      validDiskIds.add(item.id);
    }

    for (const key of Object.keys(state.cachedConversations)) {
      if (!validDiskIds.has(key)) {
        delete state.cachedConversations[key];
      }
    }
    pruneCache(validDiskIds);

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

    // 阶段二成果即时下发前端
    postMessage({
      command: 'setConversations',
      data: state.cachedConversations,
      convDir: primaryConvDir,
    });
  } catch (err) {
    postMessage({ command: 'error', text: `本地会话对齐失败: ${err}` });
  }

  // ══════════════════════════════════════════════════════════════════
  // 阶段三：后台静默网络探测与平滑富化 (异步执行，不阻塞主流程)
  // ══════════════════════════════════════════════════════════════════
  if (state.isBackgroundRefreshing) {
    return;
  }
  state.isBackgroundRefreshing = true;

  // 使用 setImmediate / Promise 触发后台静默探测任务
  Promise.resolve().then(async () => {
    try {
      // 1. 扫描正在运行的语言服务进程与端口
      const result = await discoverAndListAll();
      state.cachedEndpointMap = result.cascadeToEndpoint;
      state.detectedAppDataDirs = result.appDataDirs;
      state.availableEndpoints = result.endpoints;

      // 2. 合并语言服务返回的实时活跃摘要
      for (const [id, info] of Object.entries(result.conversations)) {
        state.cachedConversations[id] = { ...(state.cachedConversations[id] || {}), ...info };
      }

      // 3. 针对未索引或大标题未还原的会话执行轻量后台补充探测
      if (result.endpoints.length > 0) {
        const epList = result.endpoints.map((e) => ({ port: e.port, csrf: e.csrf }));
        const unindexed = Object.keys(state.cachedConversations).filter((id) => {
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

          if (recovery.activated > 0) {
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

      // 静默同步最终合并结果
      postMessage({
        command: 'setConversations',
        data: state.cachedConversations,
        convDir: primaryConvDir,
      });

      // 持久化回写缓存
      writeCache(state.cachedConversations);
    } catch (bgErr) {
      // 后台静默探测异常仅记录，不打断用户已有交互
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

