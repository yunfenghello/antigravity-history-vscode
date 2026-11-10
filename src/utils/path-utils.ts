/**
 * 路径处理与操作系统交互通用工具模块
 *
 * 核心功能：
 * - 规范化本地操作系统文件路径，去除 URI 前缀及编码冗余
 * - 精准在 Windows / macOS / Linux 桌面资源管理器中高亮定位文件或目录
 * - 解析导出目标目录绝对路径
 * - 解析本地会话数据默认物理路径
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { t } from './i18n.js';

/**
 * 标准化本地文件系统路径
 *
 * 清洗 file:// 与 file:/// 前缀、URI 编码、多余斜杠，并规范化操作系统路径格式
 *
 * @param rawPath 原始路径或 URI 字符串
 * @returns 规范化的物理路径
 */
export function normalizeLocalPath(rawPath: string): string {
  if (!rawPath) {
    return '';
  }
  let p = rawPath.trim();
  // 去除 file:/// 或 file:// 前缀
  if (/^file:\/\/\//i.test(p)) {
    p = p.replace(/^file:\/\/\//i, '');
  } else if (/^file:\/\//i.test(p)) {
    p = p.replace(/^file:\/\//i, '');
  }
  // URL 解码
  try {
    p = decodeURIComponent(p);
  } catch {
    // 若解码异常则保留原串
  }
  // 处理 Windows 盘符前多余的斜杠，例如 /E:/xxx -> E:/xxx 或 \E:\xxx -> E:\xxx
  p = p.replace(/^[\\\/]([a-zA-Z]:)/, '$1');
  // 规范化路径分隔符
  p = path.normalize(p);
  return p;
}

/**
 * 在操作系统资源管理器中打开指定路径或文件夹
 *
 * 优先调用 VS Code 原生命令 revealFileInOS，并在异常或特殊场景下使用 Node.js 子进程后备调用
 *
 * @param targetPath 目标物理路径或 URI
 * @returns 是否成功打开
 */
export async function openPathInExplorer(targetPath: string): Promise<boolean> {
  const cleanPath = normalizeLocalPath(targetPath);
  if (!cleanPath) {
    vscode.window.showWarningMessage(t('common.invalidPath'));
    return false;
  }

  // 校验目标路径是否存在
  if (!fs.existsSync(cleanPath)) {
    const parentDir = path.dirname(cleanPath);
    if (fs.existsSync(parentDir)) {
      vscode.window.showWarningMessage(t('common.pathNotExistTryParent', undefined, cleanPath));
      return openPathInExplorer(parentDir);
    }
    vscode.window.showErrorMessage(t('common.pathNotExist', undefined, cleanPath));
    return false;
  }

  try {
    const uri = vscode.Uri.file(cleanPath);
    await vscode.commands.executeCommand('revealFileInOS', uri);
    return true;
  } catch {
    // 后备机制：根据操作系统类型直接调起系统文件管理器
    try {
      const platform = process.platform;
      if (platform === 'win32') {
        child_process.exec(`explorer.exe "${cleanPath}"`);
      } else if (platform === 'darwin') {
        child_process.exec(`open "${cleanPath}"`);
      } else {
        child_process.exec(`xdg-open "${cleanPath}"`);
      }
      return true;
    } catch (fallbackErr) {
      vscode.window.showErrorMessage(
        t('common.cannotOpenExplorer', undefined, fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr))
      );
      return false;
    }
  }
}

/**
 * 将相对路径解析为绝对导出路径
 *
 * 若未打开工作区，则默认回退到当前用户主目录
 *
 * @param configPath 用户在配置项中填写的路径字符串
 * @returns 规范后的绝对路径
 */
export function resolveExportPath(configPath: string): string {
  if (path.isAbsolute(configPath)) {
    return path.normalize(configPath);
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.resolve(folders[0].uri.fsPath, configPath);
  }
  return path.resolve(os.homedir(), configPath);
}

/**
 * 获取本地 Antigravity conversations 默认存放目录
 *
 * @returns 物理目录绝对路径
 */
export function getDefaultConversationsDir(): string {
  return path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
}

