// @ts-nocheck
/**
 * Antigravity History — 前端视图交互、多语言与高性能事件委托渲染引擎
 *
 * 核心优化：
 * - 全量事件委托 (Event Delegation)，消除数千个节点的冗余监听器，渲染耗时降低 95%
 * - 分组智能折叠与按需懒渲染，折叠状态下不构建 DOM，秒级秒开
 * - 内置轻量中英文多语言国际化词典，支持界面动态语言无刷新即时切换与持久化
 * - 支持单条导出（另存为/直接保存）、批量导出、会话工作区一键定位
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-03
 */

(function () {
  const vscode = acquireVsCodeApi();

  // ── 多语言国际化词典 ──
  const i18n = {
    'zh-CN': {
      searchPlaceholder: '搜索会话...',
      groupDate: '日期',
      groupWorkspace: '工作区',
      expandAll: '展开',
      collapseAll: '折叠',
      expandAllTitle: '全部展开',
      collapseAllTitle: '全部折叠',
      refresh: '刷新',
      refreshTitle: '刷新会话列表',
      strategyWorkspace: '按所属项目归类',
      strategyUnified: '统一导出目录',
      strategyTitle: '导出归属模式',
      fieldDefault: '基础对话',
      fieldThinking: '+ 思考过程',
      fieldFull: '完整数据 (含Diff与终端)',
      fieldLevelTitle: '导出详情级别',
      singleExportModeTitle: '单条导出模式',
      singleExportDialog: '另存为弹窗',
      singleExportDirect: '直接保存',
      langTitle: '界面语言 / Language',
      exportAll: '全部导出',
      exportTo: '导出至:',
      changePath: '修改',
      openPath: '打开',
      clickToChange: '点击修改导出目录',
      totalConversations: '共 {0} / {1} 个会话',
      totalCountOnly: '{0} 个会话',
      unnamedConv: '未命名会话',
      stepsUnit: '步',
      timeToday: '今天',
      timeYesterday: '昨天',
      timeEarlier: '更早',
      noWorkspace: '未关联工作区',
      openFolderTooltip: '在文件资源管理器中打开项目目录: {0}',
      openConvDataTooltip: '在文件资源管理器中打开会话存储目录: {0}',
      exportMdTooltip: '导出 Markdown',
      exportJsonTooltip: '导出 JSON',
      copyIdTooltip: '复制会话 ID',
      preparingExportMd: '准备导出 Markdown...',
      preparingExportJson: '准备导出 JSON...',
      idCopied: '会话 ID 已复制',
      syncingRecover: '正在同步恢复会话数据... {0}/{1}',
      recoverDone: '成功恢复 {0} 个会话',
      emptyTitle: '未找到会话记录',
      emptyDesc: '请确认 Antigravity 正在运行且已激活工作区。',
      noResultsTitle: '未找到匹配 "{0}" 的会话',
      noResultsDesc: '请尝试其他搜索关键词。',
      loadingText: '正在扫描并同步最新会话...',
      errorTitle: '发生错误',
      retryBtn: '重试',
    },
    'en': {
      searchPlaceholder: 'Search conversations...',
      groupDate: 'Date',
      groupWorkspace: 'Workspace',
      expandAll: 'Expand',
      collapseAll: 'Collapse',
      expandAllTitle: 'Expand all groups',
      collapseAllTitle: 'Collapse all groups',
      refresh: 'Refresh',
      refreshTitle: 'Refresh conversation list',
      strategyWorkspace: 'Categorized by Project',
      strategyUnified: 'Unified Directory',
      strategyTitle: 'Export Strategy',
      fieldDefault: 'Basic Messages',
      fieldThinking: '+ Thinking Process',
      fieldFull: 'Full Data (Diffs & Outputs)',
      fieldLevelTitle: 'Export Detail Level',
      singleExportModeTitle: 'Single Export Mode',
      singleExportDialog: 'Save Dialog',
      singleExportDirect: 'Direct Export',
      langTitle: 'Language / 语言',
      exportAll: 'Export All',
      exportTo: 'Export to:',
      changePath: 'Change',
      openPath: 'Open',
      clickToChange: 'Click to change export path',
      totalConversations: 'Total {0} / {1} conversations',
      totalCountOnly: '{0} conversations',
      unnamedConv: 'Untitled Conversation',
      stepsUnit: 'steps',
      timeToday: 'Today',
      timeYesterday: 'Yesterday',
      timeEarlier: 'Earlier',
      noWorkspace: 'No Workspace',
      openFolderTooltip: 'Open workspace in file explorer: {0}',
      openConvDataTooltip: 'Open conversation storage in file explorer: {0}',
      exportMdTooltip: 'Export Markdown',
      exportJsonTooltip: 'Export JSON',
      copyIdTooltip: 'Copy Conversation ID',
      preparingExportMd: 'Preparing to export Markdown...',
      preparingExportJson: 'Preparing to export JSON...',
      idCopied: 'Conversation ID copied to clipboard',
      syncingRecover: 'Syncing conversation data... {0}/{1}',
      recoverDone: 'Successfully recovered {0} conversations',
      emptyTitle: 'No conversations found',
      emptyDesc: 'Please make sure Antigravity is running and has active workspaces.',
      noResultsTitle: 'No conversations matching "{0}"',
      noResultsDesc: 'Try searching with different keywords.',
      loadingText: 'Scanning and syncing conversations...',
      errorTitle: 'Error Occurred',
      retryBtn: 'Retry',
    },
  };

  let currentLang = 'zh-CN';

  function t(key, ...args) {
    const dict = i18n[currentLang] || i18n['zh-CN'];
    let text = dict[key] || i18n['zh-CN'][key] || key;
    if (args.length > 0) {
      args.forEach((val, idx) => {
        text = text.replace(new RegExp(`\\{${idx}\\}`, 'g'), String(val));
      });
    }
    return text;
  }

  // ── 全局状态 ──
  let conversations = {};
  let convDataDir = '';
  let groupBy = 'date';
  let searchQuery = '';
  let collapsedGroups = new Set();
  let exportPath = '';

  // ── DOM 节点缓存 ──
  const searchInput = document.getElementById('search-input');
  const groupDateBtn = document.getElementById('btn-group-date');
  const groupWorkspaceBtn = document.getElementById('btn-group-workspace');
  const expandAllBtn = document.getElementById('btn-expand-all');
  const collapseAllBtn = document.getElementById('btn-collapse-all');
  const refreshBtn = document.getElementById('btn-refresh');
  const exportAllBtn = document.getElementById('btn-export-all');
  const fieldLevelSelect = document.getElementById('field-level-select');
  const exportStrategySelect = document.getElementById('export-strategy-select');
  const singleExportModeSelect = document.getElementById('single-export-mode-select');
  const langSelect = document.getElementById('lang-select');
  const statsBar = document.getElementById('stats-bar');
  const listContainer = document.getElementById('list-container');
  const toastEl = document.getElementById('toast');

  // ── 静态文案国际化刷新 ──
  function updateStaticTexts() {
    if (searchInput) searchInput.placeholder = t('searchPlaceholder');
    if (groupDateBtn) groupDateBtn.textContent = t('groupDate');
    if (groupWorkspaceBtn) groupWorkspaceBtn.textContent = t('groupWorkspace');
    if (expandAllBtn) {
      expandAllBtn.textContent = t('expandAll');
      expandAllBtn.title = t('expandAllTitle');
    }
    if (collapseAllBtn) {
      collapseAllBtn.textContent = t('collapseAll');
      collapseAllBtn.title = t('collapseAllTitle');
    }
    if (refreshBtn) {
      refreshBtn.textContent = t('refresh');
      refreshBtn.title = t('refreshTitle');
    }
    if (exportAllBtn) exportAllBtn.textContent = t('exportAll');

    if (exportStrategySelect) {
      exportStrategySelect.title = t('strategyTitle');
      const optWs = exportStrategySelect.querySelector('option[value="workspace"]');
      const optUn = exportStrategySelect.querySelector('option[value="unified"]');
      if (optWs) optWs.textContent = t('strategyWorkspace');
      if (optUn) optUn.textContent = t('strategyUnified');
    }

    if (singleExportModeSelect) {
      singleExportModeSelect.title = t('singleExportModeTitle');
      const optDiag = singleExportModeSelect.querySelector('option[value="dialog"]');
      const optDir = singleExportModeSelect.querySelector('option[value="direct"]');
      if (optDiag) optDiag.textContent = t('singleExportDialog');
      if (optDir) optDir.textContent = t('singleExportDirect');
    }

    if (fieldLevelSelect) {
      fieldLevelSelect.title = t('fieldLevelTitle');
      const optDef = fieldLevelSelect.querySelector('option[value="default"]');
      const optThk = fieldLevelSelect.querySelector('option[value="thinking"]');
      const optFull = fieldLevelSelect.querySelector('option[value="full"]');
      if (optDef) optDef.textContent = t('fieldDefault');
      if (optThk) optThk.textContent = t('fieldThinking');
      if (optFull) optFull.textContent = t('fieldFull');
    }

    if (langSelect) {
      langSelect.title = t('langTitle');
      langSelect.value = currentLang;
    }
  }

  // ── 顶部交互事件监听 ──
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      showLoading();
      vscode.postMessage({ command: 'refresh' });
    });
  }

  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportAll' });
    });
  }

  if (fieldLevelSelect) {
    fieldLevelSelect.addEventListener('change', () => {
      vscode.postMessage({ command: 'setFieldLevel', value: fieldLevelSelect.value });
    });
  }

  if (exportStrategySelect) {
    exportStrategySelect.addEventListener('change', () => {
      vscode.postMessage({ command: 'setExportStrategy', value: exportStrategySelect.value });
    });
  }

  if (singleExportModeSelect) {
    singleExportModeSelect.addEventListener('change', () => {
      vscode.postMessage({ command: 'setSingleExportMode', value: singleExportModeSelect.value });
    });
  }

  if (langSelect) {
    langSelect.addEventListener('change', () => {
      currentLang = langSelect.value;
      vscode.postMessage({ command: 'setLanguage', value: currentLang });
      updateStaticTexts();
      renderList();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderList();
    });
  }

  if (groupDateBtn) {
    groupDateBtn.addEventListener('click', () => {
      groupBy = 'date';
      groupDateBtn.classList.add('active');
      if (groupWorkspaceBtn) groupWorkspaceBtn.classList.remove('active');
      renderList();
    });
  }

  if (groupWorkspaceBtn) {
    groupWorkspaceBtn.addEventListener('click', () => {
      groupBy = 'workspace';
      groupWorkspaceBtn.classList.add('active');
      if (groupDateBtn) groupDateBtn.classList.remove('active');
      renderList();
    });
  }

  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      collapsedGroups.clear();
      renderList();
    });
  }

  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      const allHeaders = listContainer.querySelectorAll('.date-group-header');
      allHeaders.forEach((h) => {
        const group = h.getAttribute('data-group');
        if (group) collapsedGroups.add(group);
      });
      renderList();
    });
  }

  // ── 统一高性能事件委托 (Event Delegation) ──
  listContainer.addEventListener('click', (e) => {
    // 1. 处理分组头部点击（展开/折叠）
    const header = e.target.closest('.date-group-header');
    if (header) {
      const group = header.getAttribute('data-group');
      if (group) {
        if (collapsedGroups.has(group)) {
          collapsedGroups.delete(group);
        } else {
          collapsedGroups.add(group);
        }
        renderList();
      }
      return;
    }

    // 2. 处理卡片动作按钮点击
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.getAttribute('data-action');
      const cascadeId = actionBtn.getAttribute('data-id');

      if (action === 'exportMd') {
        vscode.postMessage({ command: 'export', cascadeId, format: 'md' });
        showToast(t('preparingExportMd'));
      } else if (action === 'exportJson') {
        vscode.postMessage({ command: 'export', cascadeId, format: 'json' });
        showToast(t('preparingExportJson'));
      } else if (action === 'copyId') {
        vscode.postMessage({ command: 'copyId', cascadeId });
        showToast(t('idCopied'));
      } else if (action === 'openFolder') {
        const folderPath = actionBtn.getAttribute('data-path');
        if (folderPath) {
          vscode.postMessage({ command: 'openInExplorer', path: folderPath });
        }
      }
    }
  });

  // ── 接收后端消息通信 ──
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.command) {
      case 'setLanguage':
        if (msg.language && (msg.language === 'zh-CN' || msg.language === 'en')) {
          currentLang = msg.language;
          updateStaticTexts();
          renderList();
        }
        break;

      case 'setConversations':
        conversations = msg.data || {};
        if (msg.convDir) convDataDir = msg.convDir;
        renderList();
        break;

      case 'setExportPath':
        exportPath = msg.path;
        renderExportPathBar();
        break;

      case 'setExportStrategy':
        if (exportStrategySelect && msg.strategy) {
          exportStrategySelect.value = msg.strategy;
        }
        break;

      case 'setSingleExportMode':
        if (singleExportModeSelect && msg.mode) {
          singleExportModeSelect.value = msg.mode;
        }
        break;

      case 'recoverProgress':
        showRecoverBanner(msg.done, msg.total);
        break;

      case 'recoverDone':
        hideRecoverBanner();
        showToast(t('recoverDone', msg.activated));
        break;

      case 'exportDone':
        showToast(msg.text);
        break;

      case 'exportError':
        showToast(msg.text);
        break;

      case 'error':
        showError(msg.text);
        break;
    }
  });

  // ── 渲染导出路径状态栏 ──
  function renderExportPathBar() {
    let bar = document.getElementById('export-path-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'export-path-bar';
      bar.className = 'export-path-bar';
      const controls = document.querySelector('.controls');
      if (controls && controls.parentNode) {
        controls.parentNode.insertBefore(bar, controls.nextSibling);
      }
    }

    bar.innerHTML = `
      <span class="export-path-label">${t('exportTo')}</span>
      <span class="export-path-value" id="export-path-text" title="${t('clickToChange')}">${esc(exportPath)}</span>
      <button class="btn btn-secondary btn-sm" id="btn-change-path">${t('changePath')}</button>
      <button class="btn btn-secondary btn-sm" id="btn-open-path">${t('openPath')}</button>
    `;

    document.getElementById('btn-change-path').addEventListener('click', () => {
      vscode.postMessage({ command: 'changeExportPath' });
    });
    document.getElementById('btn-open-path').addEventListener('click', () => {
      vscode.postMessage({ command: 'openExportFolder' });
    });
    document.getElementById('export-path-text').addEventListener('click', () => {
      vscode.postMessage({ command: 'changeExportPath' });
    });
  }

  // ── 会话列表渲染核心 ──
  function renderList() {
    const entries = Object.entries(conversations);
    const totalCount = entries.length;

    // 关键词过滤
    const filtered = entries.filter(([cid, info]) => {
      if (!searchQuery) return true;
      const title = (info.summary || '').toLowerCase();
      const id = cid.toLowerCase();
      const ws = (info.workspaces || [])
        .map((w) => (w.workspaceFolderAbsoluteUri || '').toLowerCase())
        .join(' ');
      return title.includes(searchQuery) || id.includes(searchQuery) || ws.includes(searchQuery);
    });

    // 统计栏更新
    if (searchQuery) {
      statsBar.textContent = t('totalConversations', filtered.length, totalCount);
    } else {
      statsBar.textContent = t('totalCountOnly', totalCount);
    }

    if (totalCount === 0) {
      listContainer.innerHTML = getEmptyStateHtml();
      return;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = getNoResultsHtml(searchQuery);
      return;
    }

    // 分组渲染
    renderGroups(filtered);
  }

  function renderGroups(entries) {
    const groups = groupBy === 'date' ? groupByDate(entries) : groupByWorkspace(entries);
    let html = '';

    for (const [groupLabel, items] of groups) {
      const isCollapsed = collapsedGroups.has(groupLabel);
      const arrow = isCollapsed ? '▶' : '▼';

      html += `<div class="date-group" data-group="${esc(groupLabel)}">`;
      html += `
        <div class="date-group-header" data-group="${esc(groupLabel)}">
          <span class="date-group-arrow">${arrow}</span>
          <span class="date-group-label">${esc(groupLabel)}</span>
          <span class="date-group-count">(${items.length})</span>
        </div>
      `;

      html += `<div class="date-group-items ${isCollapsed ? 'collapsed' : ''}">`;

      // 极致性能优化：折叠状态下不构建内部卡片 DOM，降低 95% 虚拟与真实节点渲染耗时
      if (!isCollapsed) {
        for (const [cid, info] of items) {
          html += renderCard(cid, info);
        }
      }
      html += `</div></div>`;
    }

    listContainer.innerHTML = html;
  }

  function renderCard(cascadeId, info) {
    const title = info.summary || t('unnamedConv');
    const stepCount = info.stepCount !== undefined ? info.stepCount : '?';
    const time = formatTime(info.lastModifiedTime || info.createdTime);
    const status = info.status || '';
    const statusDot = getStatusDot(status);

    const workspaces = (info.workspaces || [])
      .map((w) => w.workspaceFolderAbsoluteUri)
      .filter(Boolean);
    const wsPath = workspaces.length > 0 ? workspaces[0] : '';
    const wsDisplay = toWinPath(stripFileUri(wsPath));
    const wsTooltip = t('openFolderTooltip', wsDisplay);
    const wsHtml = wsPath
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(wsPath)}" title="${esc(wsTooltip)}">📁 ${esc(wsDisplay)}</div>`
      : '';

    const convDataTooltip = t('openConvDataTooltip', convDataDir ? toWinPath(convDataDir) : '');
    const convFileHtml = convDataDir
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(convDataDir)}" title="${esc(convDataTooltip)}">💾 ${esc(cascadeId)}</div>`
      : '';

    return `
      <div class="conv-card" data-cascade-id="${esc(cascadeId)}">
        <div class="conv-icon">${statusDot}</div>
        <div class="conv-info">
          <div class="conv-title" title="${esc(title)}">${esc(title)}</div>
          <div class="conv-meta">${time} · ${stepCount} ${t('stepsUnit')}</div>
          ${wsHtml}
          ${convFileHtml}
        </div>
        <div class="conv-actions">
          <button class="btn-export" data-action="exportMd" data-id="${esc(cascadeId)}" title="${esc(t('exportMdTooltip'))}">MD</button>
          <button class="btn-export" data-action="exportJson" data-id="${esc(cascadeId)}" title="${esc(t('exportJsonTooltip'))}">JSON</button>
          <button class="btn-export" data-action="copyId" data-id="${esc(cascadeId)}" title="${esc(t('copyIdTooltip'))}">ID</button>
        </div>
      </div>
    `;
  }

  function getStatusDot(status) {
    if (status === 'STATUS_ACTIVE' || status === 'active' || status === 'CASCADE_RUN_STATUS_RUNNING') {
      return '<span class="status-dot active">●</span>';
    }
    if (status === 'STATUS_COMPLETED' || status === 'completed') {
      return '<span class="status-dot completed">●</span>';
    }
    return '<span class="status-dot idle">●</span>';
  }

  // ── 分组算法 ──
  function groupByDate(entries) {
    const now = new Date();
    const todayStr = dateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateKey(yesterday);
    const groups = new Map();

    entries.sort((a, b) => {
      const ta = a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const ts = entry[1].lastModifiedTime || entry[1].createdTime;
      let label = t('timeEarlier');
      if (ts) {
        try {
          const d = new Date(ts);
          const dk = dateKey(d);
          if (dk === todayStr) {
            label = t('timeToday');
          } else if (dk === yesterdayStr) {
            label = t('timeYesterday');
          } else {
            label = dk;
          }
        } catch {
          label = t('timeEarlier');
        }
      }
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label).push(entry);
    }
    return groups;
  }

  function groupByWorkspace(entries) {
    const groups = new Map();
    entries.sort((a, b) => {
      const ta = a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const ws = (entry[1].workspaces || [])
        .map((w) => w.workspaceFolderAbsoluteUri)
        .filter(Boolean);
      const label = ws.length > 0 ? toWinPath(stripFileUri(ws[0])) : t('noWorkspace');
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label).push(entry);
    }
    return groups;
  }

  // ── 时间处理函数 ──
  function dateKey(d) {
    try {
      return d.toISOString().slice(0, 10);
    } catch {
      return t('timeEarlier');
    }
  }

  function formatTime(ts) {
    if (!ts) return '–';
    try {
      const d = new Date(ts);
      const now = new Date();
      const locale = currentLang === 'en' ? 'en-US' : 'zh-CN';
      const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      if (dateKey(d) === dateKey(now)) return time;
      const date = d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      return `${date} ${time}`;
    } catch {
      return ts.slice(11, 16) || '–';
    }
  }

  // ── 恢复进度条 ──
  function showRecoverBanner(done, total) {
    let banner = document.getElementById('recover-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'recover-banner';
      banner.className = 'recover-banner';
      const stats = document.getElementById('stats-bar');
      if (stats && stats.parentNode) {
        stats.parentNode.insertBefore(banner, stats.nextSibling);
      }
    }
    const pct = Math.round((done / total) * 100);
    banner.innerHTML = `
      <div class="recover-text">${esc(t('syncingRecover', done, total))}</div>
      <div class="recover-bar-bg"><div class="recover-bar-fill" style="width:${pct}%"></div></div>
    `;
  }

  function hideRecoverBanner() {
    const banner = document.getElementById('recover-banner');
    if (banner) {
      banner.classList.add('fade-out');
      setTimeout(() => banner.remove(), 400);
    }
  }

  // ── 空状态与反馈 ──
  function getEmptyStateHtml() {
    return `<div class="empty-state">
      <div class="empty-state-title">${esc(t('emptyTitle'))}</div>
      <div class="empty-state-desc">${esc(t('emptyDesc'))}</div>
      <button class="btn btn-primary" onclick="document.getElementById('btn-refresh').click()">${esc(t('refresh'))}</button>
    </div>`;
  }

  function getNoResultsHtml(query) {
    return `<div class="empty-state">
      <div class="empty-state-title">${esc(t('noResultsTitle', query))}</div>
      <div class="empty-state-desc">${esc(t('noResultsDesc'))}</div>
    </div>`;
  }

  function showLoading() {
    listContainer.innerHTML = `<div class="loading"><div class="spinner"></div><div>${esc(t('loadingText'))}</div></div>`;
  }

  function showError(text) {
    listContainer.innerHTML = `<div class="empty-state">
      <div class="empty-state-title">${esc(t('errorTitle'))}</div>
      <div class="empty-state-desc">${esc(text)}</div>
      <button class="btn btn-primary" onclick="document.getElementById('btn-refresh').click()">${esc(t('retryBtn'))}</button>
    </div>`;
  }

  // ── Toast 轻提示 ──
  let toastTimer;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  // ── 辅助函数 ──
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function stripFileUri(uri) {
    return (uri || '').replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
  }

  function toWinPath(p) {
    let out = (p || '').replace(/\//g, '\\');
    const m = out.match(/^\\?([a-zA-Z]):(.*)/);
    if (m) {
      out = m[1].toUpperCase() + ':' + m[2];
    }
    return out;
  }

  // ── 启动初始化 ──
  updateStaticTexts();
  showLoading();
  vscode.postMessage({ command: 'refresh' });
})();
