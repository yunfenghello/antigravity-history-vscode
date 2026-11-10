// @ts-nocheck
/**
 * 前端通用工具、公共分组算法与组件渲染工具模块
 *
 * 核心功能：
 * - 字符串 HTML 安全转义 (防 XSS) 与 Windows/URI 路径规范化
 * - 通用日期分组引擎 (groupItemsByDate) 与工作区分组引擎 (groupItemsByWorkspace)
 * - 状态圆点 (getStatusDot)、复选框 (buildCheckboxHtml) 与空状态卡片公共构造
 * - 消息气泡提示 (Toast) 与加载/错误状态渲染
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);

  function esc(str) {
    if (!str) {
      return '';
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function stripFileUri(uri) {
    if (!uri) {
      return '';
    }
    let p = uri.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
    try {
      p = decodeURIComponent(p);
    } catch {}
    p = p.replace(/^[\\\/]([a-zA-Z]:)/, '$1');
    return p;
  }

  function toWinPath(p) {
    if (!p) {
      return '';
    }
    return p.replace(/\//g, '\\');
  }

  function dateKey(d) {
    if (!d || isNaN(d.getTime())) {
      return 'earlier';
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatTime(ts) {
    if (!ts) {
      return '';
    }
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) {
        return ts;
      }
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  }

  /**
   * 通用泛型日期分组算法（支持会话列表与方案计划列表）
   *
   * @param {Array} items 待分组数据项集合
   * @param {Function} getTimeFn 提取数据项修改时间戳的回调函数
   * @returns {Map<string, Array>} 分组字典 Map<分组标签, 数据项集合>
   */
  function groupItemsByDate(items, getTimeFn) {
    const now = new Date();
    const todayStr = dateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateKey(yesterday);
    const groups = new Map();

    const sorted = [...items].sort((a, b) => {
      const ta = getTimeFn(a) || '';
      const tb = getTimeFn(b) || '';
      return tb.localeCompare(ta);
    });

    for (const item of sorted) {
      const ts = getTimeFn(item);
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
      groups.get(label).push(item);
    }
    return groups;
  }

  /**
   * 通用泛型工作区分组算法（支持会话列表与方案计划列表）
   *
   * @param {Array} items 待分组数据项集合
   * @param {Function} getWorkspaceFn 提取数据项所属工作区路径的回调函数
   * @param {Function} getTimeFn 提取修改时间用于组内排序的回调函数
   * @returns {Map<string, Array>} 分组字典 Map<工作区名称, 数据项集合>
   */
  function groupItemsByWorkspace(items, getWorkspaceFn, getTimeFn) {
    const groups = new Map();
    const sorted = [...items].sort((a, b) => {
      const ta = (getTimeFn && getTimeFn(a)) || '';
      const tb = (getTimeFn && getTimeFn(b)) || '';
      return tb.localeCompare(ta);
    });

    for (const item of sorted) {
      const rawWs = getWorkspaceFn(item);
      let wsDisplay = t('noWorkspace');
      if (rawWs) {
        const clean = stripFileUri(rawWs);
        const name = clean.split(/[\\\/]/).filter(Boolean).pop();
        if (name) {
          wsDisplay = name;
        }
      }
      if (!groups.has(wsDisplay)) {
        groups.set(wsDisplay, []);
      }
      groups.get(wsDisplay).push(item);
    }
    return groups;
  }

  /**
   * 构造批量操作复选框 HTML 片段
   *
   * @param {string} id 条目唯一标识
   * @param {boolean} isSelected 是否处于勾选状态
   * @param {boolean} isBatchMode 是否激活批量模式
   * @param {string} attrName 自定义数据属性名
   * @returns {string} HTML 字符串
   */
  function buildCheckboxHtml(id, isSelected, isBatchMode, attrName = 'data-checkbox-id') {
    if (!isBatchMode) {
      return '';
    }
    return `<div class="conv-checkbox-wrapper"><input type="checkbox" class="conv-checkbox" ${attrName}="${esc(id)}" ${isSelected ? 'checked' : ''}></div>`;
  }

  /**
   * 构造运行状态圆点 HTML 片段
   *
   * @param {string} status 状态字符串
   * @returns {string} HTML 字符串
   */
  function getStatusDot(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('active') || s.includes('running')) {
      return '<span class="status-dot active">&#x25CF;</span>';
    }
    if (s.includes('completed') || s.includes('success')) {
      return '<span class="status-dot completed">&#x25CF;</span>';
    }
    return '<span class="status-dot idle">&#x25CF;</span>';
  }

  /**
   * 构造统一空状态提示容器
   *
   * @param {string} icon 图标字符
   * @param {string} title 标题文本
   * @param {string} desc 详细描述文本
   * @returns {string} HTML 字符串
   */
  function buildEmptyStateHtml(icon, title, desc) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <div class="empty-state-title">${esc(title)}</div>
        <div class="empty-state-desc">${esc(desc)}</div>
      </div>
    `;
  }

  function showToast(text) {
    const toastEl = document.getElementById('toast');
    if (!toastEl) {
      return;
    }
    toastEl.textContent = text;
    toastEl.classList.add('visible');
    setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 2500);
  }

  function showLoading() {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="spinner"></div>
        <div class="empty-title">${t('loadingText')}</div>
      </div>
    `;
  }

  function showError(text) {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon error-icon">!</div>
        <div class="empty-title">${t('errorTitle')}</div>
        <div class="empty-desc">${esc(text)}</div>
        <button class="btn btn-primary" id="btn-retry">${t('retryBtn')}</button>
      </div>
    `;
    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        if (window.AG_VSCODE) {
          window.AG_VSCODE.postMessage({ command: 'refresh' });
        }
      });
    }
  }

  window.AG_Utils = {
    esc,
    stripFileUri,
    toWinPath,
    dateKey,
    formatTime,
    groupItemsByDate,
    groupItemsByWorkspace,
    buildCheckboxHtml,
    getStatusDot,
    buildEmptyStateHtml,
    showToast,
    showLoading,
    showError,
  };
})(window);
