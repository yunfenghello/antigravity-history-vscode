// @ts-nocheck
/**
 * 前端应用程序主控制器与事件委托中枢 (生产级健壮加固)
 *
 * 核心功能：
 * - 初始化 VS Code 原生 API 通信桥接 (AG_VSCODE)
 * - 挂载全局异常拦截器 (window.onerror)，杜绝界面静默白板
 * - 全局事件委托 (Event Delegation) 监听列表点击，消除数千个冗余监听器
 * - 全面委托通用视图控制器 (AG_ViewController) 调度刷新、展开/折叠、分组切换与搜索
 * - 纯化处理宿主双向 IPC 消息通信 (setConversations, setPlans, optimisticDelete 等)
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  // 全局异常拦截与友好提示，杜绝界面出现静默白屏
  window.onerror = function (msg, url, line, col, error) {
    const listContainer = document.getElementById('list-container');
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon" style="color:var(--vscode-errorForeground)">!</div>
          <div class="empty-state-title">界面脚本运行异常</div>
          <div class="empty-state-desc" style="font-family:monospace;font-size:11px;text-align:left;background:rgba(255,0,0,0.08);padding:8px;border-radius:4px;overflow-x:auto;">
            ${msg}<br>位置: ${line}:${col}
          </div>
          <button class="btn btn-primary" id="btn-err-retry" style="margin-top:12px;">重新加载</button>
        </div>
      `;
      document.getElementById('btn-err-retry')?.addEventListener('click', () => {
        window.location.reload();
      });
    }
    return false;
  };

  const vscode = acquireVsCodeApi();
  window.AG_VSCODE = vscode;

  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { showToast, showLoading, showError } = window.AG_Utils;
  const state = window.AG_State;

  function getVC() {
    return window.AG_ViewController || {};
  }

  let isInitialized = false;

  /**
   * 应用初始化总入口 (防重入与容错加固)
   */
  function init() {
    if (isInitialized) {
      return;
    }
    isInitialized = true;

    // 首屏无条件即刻展示加载中旋转态，消除等待感
    showLoading();

    try {
      bindTopBarEvents();
    } catch (e) {
      console.error('[AG] 绑定顶栏事件失败:', e);
    }

    try {
      bindGlobalDelegatedEvents();
    } catch (e) {
      console.error('[AG] 绑定全局委托事件失败:', e);
    }

    try {
      bindIpcMessages();
    } catch (e) {
      console.error('[AG] 绑定IPC消息监听失败:', e);
    }

    try {
      window.AG_I18N?.updateStaticTexts?.();
    } catch (e) {
      console.error('[AG] 更新多语言静态文本失败:', e);
    }

    // 主动向宿主发送就绪握手信号，触发数据下发
    try {
      vscode.postMessage({ command: 'webviewReady' });
    } catch (e) {
      console.error('[AG] 发送就绪握手失败:', e);
      vscode.postMessage({ command: 'refresh' });
    }
  }

  /**
   * 绑定顶栏所有按钮、输入框与下拉选择交互
   */
  function bindTopBarEvents() {
    // 选项卡切换 (动态调用控制器，杜绝局部变量闭包未就绪)
    document.getElementById('tab-conversations')?.addEventListener('click', () => {
      getVC().switchTab ? getVC().switchTab('conversations') : null;
    });

    document.getElementById('tab-plans')?.addEventListener('click', () => {
      getVC().switchTab ? getVC().switchTab('plans') : null;
    });

    // 统一搜索输入防抖
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      getVC().handleSearchInput ? getVC().handleSearchInput(e.target.value) : null;
    });

    // 统一分组模式切换 (日期 / 工作区)
    document.getElementById('group-date')?.addEventListener('click', () => {
      getVC().setGroupBy ? getVC().setGroupBy('date') : null;
    });

    document.getElementById('group-workspace')?.addEventListener('click', () => {
      getVC().setGroupBy ? getVC().setGroupBy('workspace') : null;
    });

    // 统一全部展开与全部折叠
    document.getElementById('btn-expand-all')?.addEventListener('click', () => {
      getVC().expandAll ? getVC().expandAll() : null;
    });

    document.getElementById('btn-collapse-all')?.addEventListener('click', () => {
      getVC().collapseAll ? getVC().collapseAll() : null;
    });

    // 统一刷新中枢触发
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      getVC().handleRefresh ? getVC().handleRefresh() : vscode.postMessage({ command: 'refresh' });
    });

    // 批量模式切换
    document.getElementById('btn-toggle-batch')?.addEventListener('click', () => {
      window.AG_Batch?.toggleBatchMode?.();
    });

    // 对话导出与配置项
    document.getElementById('btn-export-all')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportAll' });
    });

    document.getElementById('field-level-select')?.addEventListener('change', (e) => {
      vscode.postMessage({ command: 'setFieldLevel', value: e.target.value });
    });

    document.getElementById('export-strategy-select')?.addEventListener('change', (e) => {
      vscode.postMessage({ command: 'setExportStrategy', value: e.target.value });
    });

    document.getElementById('single-export-mode-select')?.addEventListener('change', (e) => {
      vscode.postMessage({ command: 'setSingleExportMode', value: e.target.value });
    });

    document.getElementById('lang-select')?.addEventListener('change', (e) => {
      const lang = e.target.value;
      window.AG_I18N?.setLanguage?.(lang);
      vscode.postMessage({ command: 'setLanguage', value: lang });
      getVC().renderCurrentView ? getVC().renderCurrentView() : null;
    });

    // 批量工具条动作按钮绑定
    if (window.AG_Batch) {
      document.getElementById('btn-select-all')?.addEventListener('click', window.AG_Batch.handleSelectAll);
      document.getElementById('btn-invert-select')?.addEventListener('click', window.AG_Batch.handleInvertSelect);
      document.getElementById('btn-deselect-all')?.addEventListener('click', window.AG_Batch.handleDeselectAll);
      document.getElementById('btn-batch-delete')?.addEventListener('click', window.AG_Batch.handleBatchDelete);
      document.getElementById('btn-exit-batch')?.addEventListener('click', () => window.AG_Batch.toggleBatchMode(false));
    }
  }

  /**
   * 列表容器全局事件委托代理
   */
  function bindGlobalDelegatedEvents() {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }

    listContainer.addEventListener('click', (e) => {
      // 1. 处理分组展开与折叠委托（委托给公共视图控制器）
      const header = e.target.closest('.date-group-header');
      if (header) {
        const group = header.getAttribute('data-group');
        getVC().toggleGroup ? getVC().toggleGroup(group) : null;
        return;
      }

      // 2. 处理卡片动作按钮点击
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        handleCardAction(actionBtn);
        return;
      }

      // 3. 处理批量模式下的卡片勾选或整行点击切换
      if (state.isBatchMode) {
        handleBatchSelectionClick(e);
      }
    });
  }

  /**
   * 分发卡片具体功能动作
   *
   * @param {HTMLElement} btn 触发动作的按钮节点
   */
  function handleCardAction(btn) {
    const action = btn.getAttribute('data-action');
    const cascadeId = btn.getAttribute('data-id');
    const planId = btn.getAttribute('data-plan-id');

    switch (action) {
      case 'refresh':
        getVC().handleRefresh ? getVC().handleRefresh() : vscode.postMessage({ command: 'refresh' });
        break;
      case 'exportMd':
        vscode.postMessage({ command: 'export', cascadeId, format: 'md' });
        showToast(t('preparingExportMd'));
        break;
      case 'exportJson':
        vscode.postMessage({ command: 'export', cascadeId, format: 'json' });
        showToast(t('preparingExportJson'));
        break;
      case 'copyId':
        vscode.postMessage({ command: 'copyId', cascadeId: cascadeId || planId });
        showToast(t('idCopied'));
        break;
      case 'openFolder':
      case 'openPlanFolder': {
        const folderPath = btn.getAttribute('data-path');
        if (folderPath) {
          vscode.postMessage({ command: 'openInExplorer', path: folderPath });
        }
        break;
      }
      case 'exportPlanSingle': {
        const fileName = btn.getAttribute('data-file-name') || 'implementation_plan.md';
        vscode.postMessage({ command: 'exportPlanSingle', planId, fileName });
        break;
      }
      case 'exportPlanAll':
        vscode.postMessage({ command: 'exportPlanAll', planId });
        break;
      case 'deleteConv':
        if (cascadeId) {
          vscode.postMessage({ command: 'deleteConversation', cascadeId });
        }
        break;
      case 'deletePlan':
        if (planId) {
          vscode.postMessage({ command: 'deletePlan', planId });
        }
        break;
    }
  }

  /**
   * 处理批量选择模式下的行点击与复选框勾选事件
   *
   * @param {MouseEvent} e 点击事件对象
   */
  function handleBatchSelectionClick(e) {
    const card = e.target.closest('.conv-card');
    if (!card) {
      return;
    }

    const checkbox = e.target.closest('.conv-checkbox');
    const cid = card.getAttribute('data-cascade-id');
    const pid = card.getAttribute('data-plan-id');
    const isConv = state.activeTab === 'conversations' && cid;
    const isPlan = state.activeTab === 'plans' && pid;

    if (!isConv && !isPlan) {
      return;
    }

    const targetSet = isConv ? state.selectedConvIds : state.selectedPlanIds;
    const targetId = isConv ? cid : pid;

    if (checkbox) {
      if (checkbox.checked) {
        targetSet.add(targetId);
        card.classList.add('selected');
      } else {
        targetSet.delete(targetId);
        card.classList.remove('selected');
      }
    } else {
      const cb = card.querySelector('.conv-checkbox');
      if (targetSet.has(targetId)) {
        targetSet.delete(targetId);
        card.classList.remove('selected');
        if (cb) {
          cb.checked = false;
        }
      } else {
        targetSet.add(targetId);
        card.classList.add('selected');
        if (cb) {
          cb.checked = true;
        }
      }
    }

    window.AG_Batch?.updateBatchBar();
  }

  /**
   * 监听 VS Code 宿主下发的双向 IPC 消息 (全面异常防御)
   */
  function bindIpcMessages() {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;

      try {
        switch (msg.command) {
          case 'setConversations': {
            state.conversations = msg.data || {};
            if (msg.convDir) {
              state.convDataDir = msg.convDir;
            }
            if (state.selectedConvIds) {
              for (const cid of Array.from(state.selectedConvIds)) {
                if (!state.conversations[cid]) {
                  state.selectedConvIds.delete(cid);
                }
              }
            }
            try {
              window.AG_Batch?.updateBatchBar?.();
            } catch (err) {
              console.warn('[AG] updateBatchBar 轻微警告:', err);
            }
            if (state.activeTab === 'conversations') {
              getVC().renderCurrentView ? getVC().renderCurrentView() : null;
            }
            break;
          }
          case 'setPlans': {
            state.plans = Array.isArray(msg.plans) ? msg.plans : [];
            if (state.selectedPlanIds) {
              for (const pid of Array.from(state.selectedPlanIds)) {
                if (!state.plans.some((p) => p.id === pid)) {
                  state.selectedPlanIds.delete(pid);
                }
              }
            }
            try {
              window.AG_Batch?.updateBatchBar?.();
            } catch (err) {
              console.warn('[AG] updateBatchBar 轻微警告:', err);
            }
            if (state.activeTab === 'plans') {
              getVC().renderCurrentView ? getVC().renderCurrentView() : null;
            }
            break;
          }
          case 'setExportPath': {
            state.exportPath = msg.path || '';
            try {
              window.AG_Renderer?.renderExportPathBar?.();
            } catch (err) {
              console.warn('[AG] renderExportPathBar 轻微警告:', err);
            }
            break;
          }
          case 'setExportStrategy': {
            const el = document.getElementById('export-strategy-select');
            if (el && msg.strategy) {
              el.value = msg.strategy;
            }
            break;
          }
          case 'setSingleExportMode': {
            const el = document.getElementById('single-export-mode-select');
            if (el && msg.mode) {
              el.value = msg.mode;
            }
            break;
          }
          case 'setLanguage': {
            if (msg.language && (msg.language === 'zh-CN' || msg.language === 'en')) {
              window.AG_I18N?.setLanguage?.(msg.language);
              getVC().renderCurrentView ? getVC().renderCurrentView() : null;
            }
            break;
          }
          case 'recoverProgress': {
            showRecoverBanner(msg.done, msg.total);
            break;
          }
          case 'recoverDone': {
            hideRecoverBanner();
            if (msg.activated > 0) {
              showToast(t('recoverDone', msg.activated));
            }
            break;
          }
          case 'optimisticDeleteConvs': {
            if (Array.isArray(msg.cascadeIds)) {
              for (const cid of msg.cascadeIds) {
                delete state.conversations[cid];
                state.selectedConvIds?.delete(cid);
              }
              try {
                window.AG_Batch?.updateBatchBar?.();
              } catch (err) {
                console.warn('[AG] updateBatchBar 轻微警告:', err);
              }
              if (state.activeTab === 'conversations') {
                getVC().renderCurrentView ? getVC().renderCurrentView() : null;
              }
            }
            break;
          }
          case 'optimisticDeletePlans': {
            if (Array.isArray(msg.planIds)) {
              const deleteSet = new Set(msg.planIds);
              state.plans = (state.plans || []).filter((p) => !deleteSet.has(p.id));
              for (const pid of msg.planIds) {
                state.selectedPlanIds?.delete(pid);
              }
              try {
                window.AG_Batch?.updateBatchBar?.();
              } catch (err) {
                console.warn('[AG] updateBatchBar 轻微警告:', err);
              }
              if (state.activeTab === 'plans') {
                getVC().renderCurrentView ? getVC().renderCurrentView() : null;
              }
            }
            break;
          }
          case 'toast': {
            if (msg.text) {
              showToast(msg.text);
            }
            break;
          }
          case 'error': {
            showError(msg.text);
            break;
          }
        }
      } catch (ipcErr) {
        console.error('[AG] IPC 消息处理发生异常:', ipcErr, msg);
      }
    });
  }

  function showRecoverBanner(done, total) {
    let banner = document.getElementById('recover-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'recover-banner';
      banner.className = 'recover-banner';
      const topBar = document.querySelector('.top-bar');
      if (topBar && topBar.parentNode) {
        topBar.parentNode.insertBefore(banner, topBar.nextSibling);
      }
    }
    banner.style.display = 'flex';
    banner.textContent = t('syncingRecover', done, total);
  }

  function hideRecoverBanner() {
    const banner = document.getElementById('recover-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  // 脚本处于文档底部，DOM 节点已完全解析，直接即刻初始化
  init();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
})(window);
