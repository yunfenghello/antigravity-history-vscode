/**
 * 面板导出任务调度与处理器
 *
 * 核心功能：
 * - 单条会话导出：支持交互式另存为弹窗（定位项目工作区）与非交互批量写入
 * - 批量会话导出：支持按所属工作区目录归类与统一目录平铺（双策略）
 * - 导出汇总报告自动生成与 JSON 统一集合收集
 * - 脑图方案计划工件单件另存为与全量批量导出
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getTrajectorySteps, getLiveWorkingEndpoints, TrajectorySummary, LsEndpoint } from '../core/ls-client.js';
import { parseSteps, FieldLevel } from '../core/parser.js';
import {
  formatMarkdown,
  buildConversationRecord,
  formatJson,
  writeConversation,
  safeFilename,
  getTimestamp,
} from '../core/formatter.js';
import type { ConversationRecord } from '../core/formatter.js';
import {
  exportSingleArtifact,
  exportAllArtifactsForPlan,
  PlanItem,
} from '../services/plan-service.js';
import { normalizeLocalPath, openPathInExplorer, resolveExportPath } from '../utils/path-utils.js';
import { t, getCurrentLanguage } from '../utils/i18n.js';
import type { WebviewOutgoingMessage } from './types.js';

export interface ExportContextState {
  cachedConversations: Record<string, TrajectorySummary>;
  cachedEndpointMap: Record<string, { port: number; csrf: string; appDataDir?: string }>;
  availableEndpoints: LsEndpoint[];
  cachedPlans: PlanItem[];
  detectedAppDataDirs: string[];
}

/**
 * 获取指定会话关联的项目工作区绝对路径
 *
 * @param cascadeId 会话标识
 * @param cachedConversations 缓存会话字典
 * @returns 规范化的绝对路径或 null
 */
export function getConversationWorkspace(
  cascadeId: string,
  cachedConversations: Record<string, TrajectorySummary>,
): string | null {
  const conv = cachedConversations[cascadeId];
  if (!conv || !conv.workspaces || conv.workspaces.length === 0) {
    return null;
  }
  for (const ws of conv.workspaces) {
    if (ws.workspaceFolderAbsoluteUri) {
      const p = normalizeLocalPath(ws.workspaceFolderAbsoluteUri);
      if (p) {
        return p;
      }
    }
  }
  return null;
}

/**
 * 导出单个会话
 *
 * @param cascadeId 会话唯一标识 ID
 * @param format 导出格式 (md | json | all)
 * @param state 共享上下文状态
 * @param postMessage 向前端投递消息的回调函数
 * @param overrideDir 明确指定的输出目录（若传入则直接写入该目录，不弹出另存为窗口）
 * @param overrideTs 指定时间戳
 * @param jsonCollector 批量 JSON 汇总收集器
 * @param interactive 是否启用交互式另存为弹窗（从 Webview 单条导出时为 true）
 */
export async function handleExport(
  cascadeId: string,
  format: string,
  state: ExportContextState,
  postMessage: (msg: WebviewOutgoingMessage) => void,
  overrideDir?: string,
  overrideTs?: string,
  jsonCollector?: ConversationRecord[],
  interactive = false,
): Promise<void> {
  // 1. 尝试获取有效端点：首选映射 -> 内存缓存终端 -> 实时现场动态探测
  let ep = state.cachedEndpointMap[cascadeId];
  if (!ep && state.availableEndpoints.length > 0) {
    ep = state.availableEndpoints[0];
  }
  if (!ep) {
    const liveEps = await getLiveWorkingEndpoints();
    if (liveEps.length > 0) {
      ep = liveEps[0];
      state.availableEndpoints = liveEps;
    }
  }

  if (!ep) {
    const errorMsg = t('discovery.noEndpoint');
    vscode.window.showErrorMessage(errorMsg);
    postMessage({ command: 'error', text: errorMsg });
    return;
  }

  const config = vscode.workspace.getConfiguration('aghistory');
  const fieldLevel = config.get<string>('fieldLevel', 'thinking') as FieldLevel;
  const exportStrategy = config.get<string>('exportStrategy', 'workspace');
  const exportPathConfig = config.get<string>('exportPath', './antigravity_export');

  try {
    const steps = await getTrajectorySteps(ep.port, ep.csrf, cascadeId, state.availableEndpoints);
    if (!steps || steps.length === 0) {
      throw new Error(`未能获取会话 ${cascadeId.slice(0, 8)} 的步骤数据（接口可能暂未响应）`);
    }
    const messages = parseSteps(steps, fieldLevel);

    const cached = state.cachedConversations[cascadeId];
    const rawTitle = cached?.summary || `conversation_${cascadeId.slice(0, 8)}`;
    const title = safeFilename(rawTitle);
    const metadata: TrajectorySummary = cached || { stepCount: steps.length };

    // ── 单条交互式导出（弹出文件另存为对话框，让用户选择保存文件夹与文件名） ──
    if (interactive && !overrideDir && !jsonCollector) {
      let defaultDir = '';
      const convWs = getConversationWorkspace(cascadeId, state.cachedConversations);
      if (convWs && fs.existsSync(convWs)) {
        defaultDir = convWs;
      } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        defaultDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      } else {
        defaultDir = resolveExportPath(exportPathConfig);
      }

      let content = '';
      let defaultFileName = '';
      let filters: Record<string, string[]> = {};

      if (format === 'json') {
        const record = buildConversationRecord(cascadeId, rawTitle, metadata, messages);
        content = formatJson([record]);
        defaultFileName = `${title}.json`;
        filters = { [t('filter.json')]: ['json'] };
      } else {
        content = formatMarkdown(rawTitle, cascadeId, metadata, messages);
        defaultFileName = `${title}.md`;
        filters = { [t('filter.markdown')]: ['md'] };
      }

      const defaultUri = vscode.Uri.file(path.join(defaultDir, defaultFileName));
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters,
        saveLabel: t('dialog.save'),
        title: t('dialog.saveTitle', undefined, format.toUpperCase()),
      });

      if (!saveUri) {
        return;
      }

      const targetPath = saveUri.fsPath;
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content, 'utf-8');

      const savedFilename = path.basename(targetPath);
      const savedDir = path.dirname(targetPath);

      vscode.window
        .showInformationMessage(
          t('export.singleSuccess', undefined, savedFilename, savedDir),
          t('export.openFile'),
          t('export.openContainingFolder'),
        )
        .then((choice) => {
          if (choice === t('export.openFile')) {
            vscode.workspace.openTextDocument(saveUri).then((doc) => {
              vscode.window.showTextDocument(doc);
            });
          } else if (choice === t('export.openContainingFolder')) {
            openPathInExplorer(savedDir);
          }
        });
      return;
    }

    // ── 非交互模式（批量导出或明确传入 overrideDir） ──
    let outputDir = overrideDir;
    if (!outputDir) {
      if (exportStrategy === 'workspace') {
        const convWs = getConversationWorkspace(cascadeId, state.cachedConversations);
        if (convWs && fs.existsSync(convWs)) {
          if (path.isAbsolute(exportPathConfig)) {
            outputDir = path.resolve(convWs, './antigravity_export');
          } else {
            outputDir = path.resolve(convWs, exportPathConfig);
          }
        } else {
          outputDir = resolveExportPath(exportPathConfig);
        }
      } else {
        outputDir = resolveExportPath(exportPathConfig);
      }
    }

    let exportedFilePath = '';

    if (format === 'md' || format === 'all') {
      const md = formatMarkdown(rawTitle, cascadeId, metadata, messages);
      exportedFilePath = writeConversation(md, title, outputDir, '.md', overrideTs);
    }
    if (format === 'json' || format === 'all') {
      const record = buildConversationRecord(cascadeId, rawTitle, metadata, messages);
      if (jsonCollector) {
        jsonCollector.push(record);
      } else {
        const jsonStr = formatJson([record]);
        exportedFilePath = writeConversation(jsonStr, title, outputDir, '.json', overrideTs);
      }
    }

    if (!jsonCollector && exportedFilePath) {
      const filename = path.basename(exportedFilePath);
      vscode.window
        .showInformationMessage(
          t('export.singleSuccess', undefined, filename, outputDir),
          t('export.openFile'),
          t('export.openContainingFolder'),
        )
        .then((choice) => {
          if (choice === t('export.openFile')) {
            vscode.workspace.openTextDocument(exportedFilePath).then((doc) => {
              vscode.window.showTextDocument(doc);
            });
          } else if (choice === t('export.openContainingFolder')) {
            openPathInExplorer(outputDir);
          }
        });
    }
  } catch (e) {
    const errText = `导出失败: ${e instanceof Error ? e.message : String(e)}`;
    vscode.window.showErrorMessage(errText);
    postMessage({ command: 'error', text: errText });
    if (jsonCollector) {
      throw e;
    }
  }
}

/**
 * 批量导出全部会话
 *
 * @param state 共享上下文状态
 * @param postMessage 向前端投递消息的回调函数
 * @param refreshTrigger 若终端为空时的刷新回调
 */
export async function handleExportAll(
  state: ExportContextState,
  postMessage: (msg: WebviewOutgoingMessage) => void,
  refreshTrigger: () => Promise<void>,
): Promise<void> {
  const cascadeIds = Object.keys(state.cachedConversations);
  if (cascadeIds.length === 0) {
    vscode.window.showWarningMessage(t('export.noConversations'));
    return;
  }

  if (state.availableEndpoints.length === 0) {
    vscode.window.showInformationMessage(t('discovery.waiting'));
    await refreshTrigger();
    if (state.availableEndpoints.length === 0) {
      vscode.window.showErrorMessage(t('discovery.noEndpoint'));
      return;
    }
  }

  const config = vscode.workspace.getConfiguration('aghistory');
  const exportFormat = config.get<string>('exportFormat', 'all');
  const fieldLevel = config.get<string>('fieldLevel', 'thinking') as FieldLevel;
  const exportStrategy = config.get<string>('exportStrategy', 'workspace');
  const exportPath = config.get<string>('exportPath', './antigravity_export');
  const ts = getTimestamp();
  const baseOutputDir = path.join(resolveExportPath(exportPath), `export_${ts}_${fieldLevel}`);
  const currentLang = getCurrentLanguage();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('export.batchTitle'),
      cancellable: true,
    },
    async (progress, token) => {
      let done = 0;
      let failed = 0;
      const total = cascadeIds.length;
      const jsonCollector: ConversationRecord[] = [];
      const failedIds: string[] = [];

      for (const cid of cascadeIds) {
        if (token.isCancellationRequested) {
          break;
        }

        progress.report({
          message: `${done + 1} / ${total}`,
          increment: (1 / total) * 100,
        });

        let itemOutputDir = baseOutputDir;
        if (exportStrategy === 'workspace') {
          const convWs = getConversationWorkspace(cid, state.cachedConversations);
          if (convWs) {
            const folderName = safeFilename(path.basename(convWs));
            itemOutputDir = path.join(baseOutputDir, folderName);
          } else {
            itemOutputDir = path.join(baseOutputDir, t('report.uncategorized', currentLang));
          }
        }

        try {
          await handleExport(cid, exportFormat, state, postMessage, itemOutputDir, undefined, jsonCollector);
        } catch {
          failedIds.push(cid);
          failed++;
        }
        done++;
      }

      // 写入汇总 JSON 文件
      if ((exportFormat === 'json' || exportFormat === 'all') && jsonCollector.length > 0) {
        const combinedJson = formatJson(jsonCollector);
        const jsonPath = path.join(baseOutputDir, `conversations_export_${ts}.json`);
        fs.mkdirSync(baseOutputDir, { recursive: true });
        fs.writeFileSync(jsonPath, combinedJson, 'utf-8');
      }

      // 生成导出报告文本
      const reportLines: string[] = [
        '============================================================',
        t('report.title', currentLang),
        '============================================================',
        '',
        `  ${t('report.time', currentLang)}:      ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        `  ${t('report.format', currentLang)}:      ${exportFormat}`,
        `  ${t('report.fieldLevel', currentLang)}:  ${fieldLevel}`,
        `  ${t('report.strategy', currentLang)}:  ${exportStrategy === 'workspace' ? t('report.strategyWorkspace', currentLang) : t('report.strategyUnified', currentLang)}`,
        `  ${t('report.outputDir', currentLang)}:  ${baseOutputDir}`,
        `  ${t('report.total', currentLang)}:      ${total}`,
        `  ${t('report.success', currentLang)}:      ${done - failed}`,
        `  ${t('report.failed', currentLang)}:      ${failed}`,
        '',
        '------------------------------------------------------------',
        `  ${t('report.listHeader', currentLang)} (${done - failed})`,
        '------------------------------------------------------------',
      ];
      let idx = 1;
      for (const cid of cascadeIds) {
        const conv = state.cachedConversations[cid];
        const title = conv?.summary || `[${t('report.unknown', currentLang)}] ${cid.slice(0, 8)}...`;
        const steps = conv?.stepCount ?? '?';
        const ws = getConversationWorkspace(cid, state.cachedConversations) || t('report.noWorkspace', currentLang);
        const status = failedIds.includes(cid) ? t('report.failedTag', currentLang) : '';
        reportLines.push(`  ${String(idx).padStart(3)}. ${title}${status}`);
        reportLines.push(
          `       ${t('report.steps', currentLang)}: ${steps}  |  ${t('report.project', currentLang)}: ${ws}  |  ID: ${cid.slice(0, 8)}...`,
        );
        idx++;
      }
      reportLines.push('', '============================================================');
      const reportPath = path.join(baseOutputDir, `export_report_${ts}.txt`);
      fs.mkdirSync(baseOutputDir, { recursive: true });
      fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');

      const choice = await vscode.window.showInformationMessage(
        t('export.success', currentLang, done - failed, failed, baseOutputDir),
        t('export.openFolder', currentLang),
      );
      if (choice === t('export.openFolder', currentLang)) {
        await openPathInExplorer(baseOutputDir);
      }
    },
  );
}

/**
 * 单个方案计划工件另存为（弹出 SaveDialog，定位项目工作区）
 *
 * @param planId 方案计划唯一标识
 * @param state 共享上下文状态
 * @param fileName 指定工件文件名
 */
export async function handleExportPlanSingle(
  planId: string,
  state: ExportContextState,
  fileName?: string,
): Promise<void> {
  const plan = state.cachedPlans.find((p) => p.id === planId);
  if (!plan) {
    vscode.window.showErrorMessage(t('plan.notFound'));
    return;
  }

  let defaultDir = '';
  if (plan.workspacePath && fs.existsSync(plan.workspacePath)) {
    defaultDir = plan.workspacePath;
  } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    defaultDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
  } else {
    const config = vscode.workspace.getConfiguration('aghistory');
    defaultDir = resolveExportPath(config.get<string>('exportPath', './antigravity_export'));
  }

  const targetFileName = fileName || 'implementation_plan.md';
  const artifact = plan.artifacts.find((a) => a.fileName === targetFileName) || plan.artifacts[0];
  if (!artifact || !fs.existsSync(artifact.filePath)) {
    vscode.window.showErrorMessage(t('plan.artifactNotFound', undefined, targetFileName));
    return;
  }

  const cleanTitle = safeFilename(plan.title);
  let defaultSaveName = `${cleanTitle}_实施方案.md`;
  if (targetFileName === 'task.md') {
    defaultSaveName = `${cleanTitle}_任务清单.md`;
  } else if (targetFileName === 'walkthrough.md') {
    defaultSaveName = `${cleanTitle}_变更报告.md`;
  } else if (targetFileName === 'implementation_plan.md') {
    defaultSaveName = `${cleanTitle}_实施方案.md`;
  } else {
    defaultSaveName = `${cleanTitle}_${targetFileName}`;
  }

  const defaultUri = vscode.Uri.file(path.join(defaultDir, defaultSaveName));
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { [t('filter.markdown')]: ['md'] },
    saveLabel: t('dialog.save'),
    title: t('dialog.savePlanTitle', undefined, artifact.label),
  });

  if (!saveUri) {
    return;
  }

  const destPath = saveUri.fsPath;
  const ok = exportSingleArtifact(artifact.filePath, destPath);
  if (ok) {
    const choice = await vscode.window.showInformationMessage(
      t('plan.exportSingleSuccess', undefined, artifact.label, destPath),
      t('export.openFile'),
      t('export.openContainingFolder'),
    );
    if (choice === t('export.openFile')) {
      const doc = await vscode.workspace.openTextDocument(saveUri);
      await vscode.window.showTextDocument(doc);
    } else if (choice === t('export.openContainingFolder')) {
      await openPathInExplorer(path.dirname(destPath));
    }
  } else {
    vscode.window.showErrorMessage(`导出方案文件失败: ${destPath}`);
  }
}

/**
 * 批量导出指定方案下的全部工件文件（弹出文件夹选择器）
 *
 * @param planId 方案计划唯一标识
 * @param state 共享上下文状态
 */
export async function handleExportPlanAll(planId: string, state: ExportContextState): Promise<void> {
  const plan = state.cachedPlans.find((p) => p.id === planId);
  if (!plan) {
    vscode.window.showErrorMessage(t('plan.notFound'));
    return;
  }

  let defaultDir = '';
  if (plan.workspacePath && fs.existsSync(plan.workspacePath)) {
    defaultDir = plan.workspacePath;
  } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    defaultDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
  } else {
    const config = vscode.workspace.getConfiguration('aghistory');
    defaultDir = resolveExportPath(config.get<string>('exportPath', './antigravity_export'));
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(defaultDir),
    openLabel: t('dialog.selectExportFolder'),
  });

  if (!picked || !picked[0]) {
    return;
  }

  const targetDir = picked[0].fsPath;
  const result = exportAllArtifactsForPlan(plan, targetDir);
  if (result.successCount > 0) {
    const choice = await vscode.window.showInformationMessage(
      t('plan.exportAllSuccess', undefined, result.successCount, result.targetDir),
      t('export.openFolder'),
    );
    if (choice === t('export.openFolder')) {
      await openPathInExplorer(result.targetDir);
    }
  } else {
    vscode.window.showErrorMessage(`导出工件失败，目标路径: ${targetDir}`);
  }
}
