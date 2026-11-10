/**
 * 面板类型定义与数据契约模块
 *
 * 核心功能：
 * - 定义 VS Code 面板管理器、刷新调度器、导出处理器与 Webview 通信的数据契约
 * - 集中聚合会话元数据、方案计划实体与配置枚举类型
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import type { TrajectorySummary, LsEndpoint } from '../core/ls-client.js';
import type { PlanItem } from '../services/plan-service.js';

export type FieldLevel = 'default' | 'thinking' | 'full';
export type ExportStrategy = 'workspace' | 'unified';
export type SingleExportMode = 'dialog' | 'direct';

/**
 * 刷新协调器返回的综合上下文数据
 */
export interface RefreshContext {
  conversations: Record<string, TrajectorySummary>;
  endpoints: LsEndpoint[];
  cascadeToEndpoint: Record<string, { port: number; csrf: string; appDataDir?: string }>;
  appDataDirs: string[];
  plans: PlanItem[];
  convDir: string;
}

/**
 * Webview 发往 VS Code 扩展宿主的消息契约
 */
export type WebviewIncomingMessage =
  | { command: 'refresh' }
  | { command: 'refreshPlans' }
  | { command: 'export'; cascadeId: string; format: 'md' | 'json' | 'all' }
  | { command: 'exportAll' }
  | { command: 'copyId'; cascadeId: string }
  | { command: 'openPlanFolder'; path: string }
  | { command: 'openInExplorer'; path: string }
  | { command: 'changeExportPath' }
  | { command: 'openExportFolder' }
  | { command: 'setFieldLevel'; value: FieldLevel }
  | { command: 'setExportStrategy'; value: ExportStrategy }
  | { command: 'setSingleExportMode'; value: SingleExportMode }
  | { command: 'setLanguage'; value: 'zh-CN' | 'en' }
  | { command: 'exportPlanSingle'; planId: string; fileName?: string }
  | { command: 'exportPlanAll'; planId: string }
  | { command: 'deletePlan'; planId: string }
  | { command: 'batchDeletePlans'; planIds: string[] }
  | { command: 'deleteConversation'; cascadeId: string }
  | { command: 'batchDeleteConversations'; cascadeIds: string[] };

/**
 * VS Code 扩展宿主发往 Webview 的消息契约
 */
export type WebviewOutgoingMessage =
  | { command: 'setConversations'; data: Record<string, TrajectorySummary>; convDir: string }
  | { command: 'patchConversations'; data: Record<string, Partial<TrajectorySummary>> }
  | { command: 'setPlans'; plans: PlanItem[] }
  | { command: 'setExportPath'; path: string }
  | { command: 'setExportStrategy'; strategy: string }
  | { command: 'setSingleExportMode'; mode: string }
  | { command: 'setLanguage'; language: string }
  | { command: 'recoverProgress'; done: number; total: number }
  | { command: 'recoverDone'; activated: number; total: number }
  | { command: 'optimisticDeleteConvs'; cascadeIds: string[] }
  | { command: 'optimisticDeletePlans'; planIds: string[] }
  | { command: 'error'; text: string };
