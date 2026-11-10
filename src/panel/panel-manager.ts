/**
 * 面板管理器 — 创建并调度 Antigravity History Webview 视图中枢
 *
 * 核心功能：
 * - 响应 VS Code 状态栏与命令，创建或聚焦 Webview 面板
 * - 纯化路由调度：将导出、删除、刷新与路径调用委托给专门领域子模块
 * - 统一维护面板共享上下文状态树 (PanelContextState)
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import { TrajectorySummary, LsEndpoint } from '../core/ls-client.js';
import { PlanItem } from '../services/plan-service.js';
import { getWebviewHtml } from './html-provider.js';
import {
  handleExport,
  handleExportAll,
  handleExportPlanSingle,
  handleExportPlanAll,
  getConversationWorkspace as getConvWs,
} from './export-handler.js';
import {
  handleDeleteConversation,
  handleBatchDeleteConversations,
  handleDeletePlan,
  handleBatchDeletePlans,
} from './delete-handler.js';
import {
  runProgressiveRefresh,
  refreshPlans,
  RefreshState,
} from './refresh-orchestrator.js';
import { openPathInExplorer, resolveExportPath } from '../utils/path-utils.js';
import { t } from '../utils/i18n.js';
import type { WebviewIncomingMessage, WebviewOutgoingMessage } from './types.js';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * 面板运行期共享状态
 */
const state: RefreshState & {
  cachedPlans: PlanItem[];
  detectedAppDataDirs: string[];
  availableEndpoints: LsEndpoint[];
} = {
  cachedConversations: {},
  cachedEndpointMap: {},
  detectedAppDataDirs: [],
  availableEndpoints: [],
  cachedPlans: [],
  isBackgroundRefreshing: false,
};

/**
 * 向 Webview 发送类型安全的消息
 *
 * @param msg 消息负载
 */
export function postWebviewMessage(
  msg: WebviewOutgoingMessage | { command: 'toast'; text: string; [key: string]: unknown },
): void {
  currentPanel?.webview.postMessage(msg);
}

/**
 * 获取指定会话关联的工作区物理路径
 *
 * @param cascadeId 会话标识
 * @returns 规范化的绝对物理路径或 null
 */
export function getConversationWorkspace(cascadeId: string): string | null {
  return getConvWs(cascadeId, state.cachedConversations);
}

/**
 * 打开或聚焦历史记录 Webview 面板
 *
 * @param context VS Code 扩展上下文
 */
export function openPanel(context: vscode.ExtensionContext): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    runProgressiveRefresh(state, postWebviewMessage);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'aghistory.panel',
    t('panel.title'),
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
    },
  );

  currentPanel.webview.html = getWebviewHtml(currentPanel.webview, context.extensionUri);

  currentPanel.onDidDispose(
    () => {
      currentPanel = undefined;
    },
    null,
    context.subscriptions,
  );

  // 处理来自 Webview 的前端交互消息
  currentPanel.webview.onDidReceiveMessage(
    async (message: WebviewIncomingMessage) => {
      await routeWebviewMessage(message);
    },
    undefined,
    context.subscriptions,
  );

  // 面板开启即刻启动三级渐进式非阻塞刷新
  runProgressiveRefresh(state, postWebviewMessage);
}

/**
 * 外部调用的主动刷新方法
 */
export function refreshPanel(): void {
  if (currentPanel) {
    runProgressiveRefresh(state, postWebviewMessage);
  }
}

/**
 * Webview 消息路由分发器
 *
 * @param message 接收到的消息
 */
async function routeWebviewMessage(message: WebviewIncomingMessage): Promise<void> {
  switch (message.command) {
    case 'webviewReady':
    case 'refresh':
      await runProgressiveRefresh(state, postWebviewMessage);
      break;

    case 'refreshPlans':
      refreshPlans(state, postWebviewMessage);
      break;

    case 'export': {
      const config = vscode.workspace.getConfiguration('aghistory');
      const singleMode = config.get<string>('singleExportMode', 'dialog');
      const isInteractive = singleMode !== 'direct';
      await handleExport(
        message.cascadeId,
        message.format,
        state,
        postWebviewMessage,
        undefined,
        undefined,
        undefined,
        isInteractive,
      );
      break;
    }

    case 'exportAll':
      await handleExportAll(state, postWebviewMessage, () =>
        runProgressiveRefresh(state, postWebviewMessage),
      );
      break;

    case 'exportPlanSingle':
      await handleExportPlanSingle(message.planId, state, message.fileName);
      break;

    case 'exportPlanAll':
      await handleExportPlanAll(message.planId, state);
      break;

    case 'deleteConversation':
      await handleDeleteConversation(message.cascadeId, state, postWebviewMessage);
      break;

    case 'batchDeleteConversations':
      await handleBatchDeleteConversations(message.cascadeIds, state, postWebviewMessage);
      break;

    case 'deletePlan':
      await handleDeletePlan(message.planId, state, postWebviewMessage);
      break;

    case 'batchDeletePlans':
      await handleBatchDeletePlans(message.planIds, state, postWebviewMessage);
      break;

    case 'copyId':
      if (message.cascadeId) {
        await vscode.env.clipboard.writeText(message.cascadeId);
        vscode.window.showInformationMessage(t('common.copiedToClipboard'));
      }
      break;

    case 'openPlanFolder':
    case 'openInExplorer':
      if (message.path) {
        await openPathInExplorer(message.path);
      }
      break;

    case 'changeExportPath': {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: t('dialog.selectExportFolder'),
      });
      if (picked && picked[0]) {
        const newPath = picked[0].fsPath;
        await vscode.workspace.getConfiguration('aghistory').update('exportPath', newPath, true);
        postWebviewMessage({ command: 'setExportPath', path: newPath });
      }
      break;
    }

    case 'openExportFolder': {
      const config = vscode.workspace.getConfiguration('aghistory');
      const ep = resolveExportPath(config.get<string>('exportPath', './antigravity_export'));
      await openPathInExplorer(ep);
      break;
    }

    case 'setFieldLevel': {
      const val = message.value;
      if (['default', 'thinking', 'full'].includes(val)) {
        await vscode.workspace.getConfiguration('aghistory').update('fieldLevel', val, true);
      }
      break;
    }

    case 'setExportStrategy': {
      const val = message.value;
      if (['workspace', 'unified'].includes(val)) {
        await vscode.workspace.getConfiguration('aghistory').update('exportStrategy', val, true);
        postWebviewMessage({ command: 'setExportStrategy', strategy: val });
      }
      break;
    }

    case 'setSingleExportMode': {
      const val = message.value;
      if (val === 'dialog' || val === 'direct') {
        await vscode.workspace.getConfiguration('aghistory').update('singleExportMode', val, true);
        postWebviewMessage({ command: 'setSingleExportMode', mode: val });
      }
      break;
    }

    case 'setLanguage': {
      const lang = message.value;
      if (lang === 'zh-CN' || lang === 'en') {
        await vscode.workspace.getConfiguration('aghistory').update('language', lang, true);
        postWebviewMessage({ command: 'setLanguage', language: lang });
      }
      break;
    }
  }
}

