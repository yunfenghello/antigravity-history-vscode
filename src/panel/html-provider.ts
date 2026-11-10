/**
 * Webview HTML 页面骨架与资源注入提供器
 *
 * 核心功能：
 * - 组装符合 VS Code 安全沙箱与 CSP (Content-Security-Policy) 规范的 HTML 骨架
 * - 安全注入 CSS 样式表、自定义 Nonce 鉴权与分层模块化前端 JavaScript 脚本
 * - 初始化顶栏、批量管理条、选项卡及空容器节点
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getCurrentLanguage } from '../utils/i18n.js';

/**
 * 构造 Webview 面板入口 HTML 内容
 *
 * @param webview VS Code Webview 实例
 * @param extensionUri 扩展所在目录 URI
 * @returns 完整的 HTML 文本字符串
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'panel.css'),
  );
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'panel.js'),
  );

  const nonce = crypto.randomBytes(16).toString('hex');
  const currentLang = getCurrentLanguage();

  return `<!DOCTYPE html>
<html lang="${currentLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <link rel="stylesheet" href="${cssUri}">
  <title>Antigravity History</title>
</head>
<body>
  <div class="view-nav">
    <div class="view-nav-tabs">
      <button class="view-nav-btn active" id="tab-conversations">对话历史</button>
      <button class="view-nav-btn" id="tab-plans">方案计划</button>
    </div>
  </div>
  <div class="top-bar">
    <input type="text" class="search-input" id="search-input" placeholder="搜索会话...">
    <div class="segmented-control">
      <button class="seg-btn active" id="group-date">日期</button>
      <button class="seg-btn" id="group-workspace">工作区</button>
    </div>
    <div class="segmented-control">
      <button class="seg-btn" id="btn-expand-all" title="全部展开">展开</button>
      <button class="seg-btn" id="btn-collapse-all" title="全部折叠">折叠</button>
    </div>
    <button class="btn btn-icon" id="btn-refresh" title="刷新">刷新</button>
    <button class="btn btn-secondary" id="btn-toggle-batch" title="开启或退出批量管理模式">批量管理</button>
    <select class="field-level-select" id="export-strategy-select" title="导出归属模式">
      <option value="workspace" selected>按所属项目归类</option>
      <option value="unified">统一导出目录</option>
    </select>
    <select class="field-level-select" id="single-export-mode-select" title="单条导出模式">
      <option value="dialog" selected>另存为弹窗</option>
      <option value="direct">直接保存</option>
    </select>
    <select class="field-level-select" id="field-level-select" title="导出详情级别">
      <option value="default">基础对话</option>
      <option value="thinking" selected>+ 思考过程</option>
      <option value="full">完整数据 (含Diff与终端)</option>
    </select>
    <select class="field-level-select lang-select" id="lang-select" title="语言 / Language">
      <option value="zh-CN"${currentLang === 'zh-CN' ? ' selected' : ''}>中文 (简体)</option>
      <option value="en"${currentLang === 'en' ? ' selected' : ''}>English</option>
    </select>
    <button class="btn btn-primary" id="btn-export-all">全部导出</button>
  </div>
  <div class="batch-toolbar" id="batch-toolbar" style="display:none;">
    <div class="batch-status">
      <span class="batch-count" id="batch-selected-count">已选择 0 项</span>
    </div>
    <div class="batch-actions">
      <button class="btn btn-secondary btn-sm" id="btn-select-all">全选</button>
      <button class="btn btn-secondary btn-sm" id="btn-invert-select">反选</button>
      <button class="btn btn-secondary btn-sm" id="btn-deselect-all">取消全选</button>
      <button class="btn btn-danger btn-sm" id="btn-batch-delete">批量删除</button>
      <button class="btn btn-secondary btn-sm" id="btn-exit-batch">退出批量</button>
    </div>
  </div>
  <div class="stats-bar" id="stats-bar"></div>
  <div class="export-path-bar" id="export-path-bar"></div>
  <div id="list-container"></div>
  <div class="toast" id="toast"></div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
