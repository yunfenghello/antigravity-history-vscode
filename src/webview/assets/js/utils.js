// @ts-nocheck
/**
 * 前端通用工具与格式化工具函数模块
 *
 * 核心功能：
 * - 字符串 HTML 安全转义 (防 XSS)
 * - 本地 URI 与 Windows 路径清洗
 * - 日期分组键计算与相对时间呈现 (今天/昨天/更早)
 * - 消息气泡提示 (Toast) 与加载/错误状态渲染
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (target.getTime() >= today.getTime()) {
      return 'today';
    }
    if (target.getTime() >= yesterday.getTime()) {
      return 'yesterday';
    }
    return 'earlier';
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
    const t = window.AG_I18N ? window.AG_I18N.t : (k) => k;
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
    const t = window.AG_I18N ? window.AG_I18N.t : (k) => k;
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
    showToast,
    showLoading,
    showError,
  };
})(window);

