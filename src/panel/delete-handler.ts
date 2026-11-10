/**
 * 面板物理删除任务调度与安全防误触处理器
 *
 * 核心功能：
 * - 单项与批量会话物理删除：弹出原生模态确认窗口，防止误触
 * - 0 延迟即时乐观响应：通过 optimisticDeleteConvs/optimisticDeletePlans 瞬时更新前端
 * - 后台异步高并发清理磁盘实体、SQLite WAL 与关联目录
 * - 强一致性本地持久化缓存淘汰与内存数据树重塑
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import { TrajectorySummary } from '../core/ls-client.js';
import { deleteConversationFiles, batchDeleteConversationFiles } from '../core/recovery.js';
import { deletePlanDirectory, batchDeletePlanDirectories, PlanItem } from '../services/plan-service.js';
import { readCache, writeCache } from '../core/cache.js';
import { t } from '../utils/i18n.js';
import type { WebviewOutgoingMessage } from './types.js';

export interface DeleteContextState {
  cachedConversations: Record<string, TrajectorySummary>;
  cachedPlans: PlanItem[];
  detectedAppDataDirs: string[];
}

/**
 * 处理单条会话记录物理删除（触发原生模态二次确认）
 *
 * @param cascadeId 会话标识
 * @param state 共享上下文状态
 * @param postMessage 向前端投递消息的回调函数
 */
export async function handleDeleteConversation(
  cascadeId: string,
  state: DeleteContextState,
  postMessage: (msg: WebviewOutgoingMessage | { command: 'toast'; text: string }) => void,
): Promise<void> {
  if (!cascadeId) {
    return;
  }
  const conv = state.cachedConversations[cascadeId];
  const title = conv?.summary || cascadeId;

  // 唤起原生模态确认窗口
  const confirmChoice = await vscode.window.showWarningMessage(
    t('delete.confirmConv', undefined, title),
    { modal: true },
    t('common.confirmDelete'),
  );

  if (confirmChoice !== t('common.confirmDelete')) {
    return;
  }

  // 1. 立即通知前端执行即时乐观移除 (0 延迟自动刷新)
  postMessage({ command: 'optimisticDeleteConvs', cascadeIds: [cascadeId] });

  // 2. 后台异步并发彻底清除物理文件
  await deleteConversationFiles(cascadeId, state.detectedAppDataDirs);

  // 3. 维护内存状态 (重塑全新对象引用)
  const nextConvs: Record<string, TrajectorySummary> = {};
  for (const [k, v] of Object.entries(state.cachedConversations)) {
    if (k !== cascadeId) {
      nextConvs[k] = v;
    }
  }
  state.cachedConversations = nextConvs;

  // 4. 同步淘汰本地持久化缓存
  const cache = readCache();
  if (cache[cascadeId]) {
    delete cache[cascadeId];
    writeCache(cache);
  }

  const successText = t('delete.convSuccess', undefined, title);
  vscode.window.showInformationMessage(successText);
  postMessage({ command: 'toast', text: successText });
}

/**
 * 处理批量会话记录物理删除
 *
 * @param cascadeIds 待删除会话标识数组
 * @param state 共享上下文状态
 * @param postMessage 向前端投递消息的回调函数
 */
export async function handleBatchDeleteConversations(
  cascadeIds: string[],
  state: DeleteContextState,
  postMessage: (msg: WebviewOutgoingMessage | { command: 'toast'; text: string }) => void,
): Promise<void> {
  if (!Array.isArray(cascadeIds) || cascadeIds.length === 0) {
    vscode.window.showWarningMessage(t('delete.nothingSelected'));
    return;
  }

  // 唤起原生模态确认窗口
  const confirmChoice = await vscode.window.showWarningMessage(
    t('delete.confirmBatchConv', undefined, String(cascadeIds.length)),
    { modal: true },
    t('common.confirmBatchDelete'),
  );

  if (confirmChoice !== t('common.confirmBatchDelete')) {
    return;
  }

  // 1. 立即通知前端执行即时乐观移除 (0 延迟自动刷新卡片)
  postMessage({ command: 'optimisticDeleteConvs', cascadeIds });

  // 2. 后台异步高并发清理磁盘实体与关联文件
  const result = await batchDeleteConversationFiles(cascadeIds, state.detectedAppDataDirs);

  // 3. 批量更新内存与本地缓存 (重塑全新字典引用)
  const deleteSet = new Set(cascadeIds);
  const nextConvs: Record<string, TrajectorySummary> = {};
  for (const [k, v] of Object.entries(state.cachedConversations)) {
    if (!deleteSet.has(k)) {
      nextConvs[k] = v;
    }
  }
  state.cachedConversations = nextConvs;

  const cache = readCache();
  let cacheModified = false;
  for (const cid of cascadeIds) {
    if (cache[cid]) {
      delete cache[cid];
      cacheModified = true;
    }
  }
  if (cacheModified) {
    writeCache(cache);
  }

  const msg = t('delete.batchConvSuccess', undefined, result.successCount, result.failedCount);
  vscode.window.showInformationMessage(msg);
  postMessage({ command: 'toast', text: msg });
}

/**
 * 处理单项方案计划物理删除
 *
 * @param planId 方案标识
 * @param state 共享上下文状态
 * @param postMessage 向前端投递消息的回调函数
 */
export async function handleDeletePlan(
  planId: string,
  state: DeleteContextState,
  postMessage: (msg: WebviewOutgoingMessage | { command: 'toast'; text: string }) => void,
): Promise<void> {
  if (!planId) {
    return;
  }
  const plan = state.cachedPlans.find((p) => p.id === planId);
  const title = plan?.title || planId;

  // 唤起原生模态确认窗口
  const confirmChoice = await vscode.window.showWarningMessage(
    t('delete.confirmPlan', undefined, title),
    { modal: true },
    t('common.confirmDelete'),
  );

  if (confirmChoice !== t('common.confirmDelete')) {
    return;
  }

  // 1. 立即通知前端即时移除
  postMessage({ command: 'optimisticDeletePlans', planIds: [planId] });

  // 2. 物理清除目录
  deletePlanDirectory(planId, state.detectedAppDataDirs);
  state.cachedPlans = state.cachedPlans.filter((p) => p.id !== planId);

  const successText = t('delete.planSuccess', undefined, title);
  vscode.window.showInformationMessage(successText);
  postMessage({ command: 'toast', text: successText });
}

/**
 * 处理批量方案计划物理删除
 *
 * @param planIds 待删除方案标识数组
 * @param state 共享上下文状态
 * @param postMessage 向前端投递消息的回调函数
 */
export async function handleBatchDeletePlans(
  planIds: string[],
  state: DeleteContextState,
  postMessage: (msg: WebviewOutgoingMessage | { command: 'toast'; text: string }) => void,
): Promise<void> {
  if (!Array.isArray(planIds) || planIds.length === 0) {
    vscode.window.showWarningMessage(t('delete.nothingSelected'));
    return;
  }

  // 唤起原生模态确认窗口
  const confirmChoice = await vscode.window.showWarningMessage(
    t('delete.confirmBatchPlan', undefined, String(planIds.length)),
    { modal: true },
    t('common.confirmBatchDelete'),
  );

  if (confirmChoice !== t('common.confirmBatchDelete')) {
    return;
  }

  // 1. 立即通知前端即时移除
  postMessage({ command: 'optimisticDeletePlans', planIds });

  // 2. 物理清除
  const result = batchDeletePlanDirectories(planIds, state.detectedAppDataDirs);
  const deleteSet = new Set(planIds);
  state.cachedPlans = state.cachedPlans.filter((p) => !deleteSet.has(p.id));

  const msg = t('delete.batchPlanSuccess', undefined, result.successCount, result.failedCount);
  vscode.window.showInformationMessage(msg);
  postMessage({ command: 'toast', text: msg });
}

