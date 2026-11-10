// @ts-nocheck
/**
 * 前端应用程序主控制器与事件委托中枢 (高度纯化与解耦)
 *
 * 核心功能：
 * - 初始化 VS Code 原生 API 通信桥接 (AG_VSCODE)
 * - 全局事件委托 (Event Delegation) 监听列表点击，消除数千个冗余监听器
 * - 全面委托通用视图控制器 (AG_ViewController) 调度刷新、展开/折叠、分组切换与搜索
 * - 纯化处理宿主双向 IPC 消息通信 (setConversations, setPlans, optimisticDelete 等)
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const vscode = acquireVsCodeApi();
  window.AG_VSCODE = vscode;

  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { showToast, showError } = window.AG_Utils;
  const state = window.AG_State;

  /**
   * 应用初始化总入口
   */
  function init() {
    bindTopBarEvents();
    bindGlobalDelegatedEvents();
    bindIpcMessages();
    window.AG_I18N.updateStaticTexts();
    window.AG_ViewController.handleRefresh();
  }

  /**
   * 绑定顶栏所有按钮、输入框与下拉选择交互
   */
  function bindTopBarEvents() {
    const vc = window.AG_ViewController;

    // 选项卡切换
    document.getElementById('tab-conversations')?.addEventListener('click', () => vc.switchTab('conversations'));
    document.getElementById('tab-plans')?.addEventListener('click', () => vc.switchTab('plans'));

    // 统一搜索输入防抖
    document.getElementById('search-input')?.addEventListener('input', (e) => vc.handleSearchInput(e.target.value));

    // 统一分组模式切换 (日期 / 工作区)
    document.getElementById('group-date')?.addEventListener('click', () => vc.setGroupBy('date'));
    document.getElementById('group-workspace')?.addEventListener('click', () => vc.setGroupBy('workspace'));

    // 统一全部展开与全部折叠
    document.getElementById('btn-expand-all')?.addEventListener('click', () => vc.expandAll());
    document.getElementById('btn-collapse-all')?.addEventListener('click', () => vc.collapseAll());

    // 统一刷新中枢触发
    document.getElementById('btn-refresh')?.addEventListener('click', () => vc.handleRefresh());

    // 批量模式切换
    document.getElementById('btn-toggle-batch')?.addEventListener('click', () => window.AG_Batch?.toggleBatchMode());

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
      window.AG_I18N.setLanguage(lang);
      vscode.postMessage({ command: 'setLanguage', value: lang });
      vc.renderCurrentView();
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
        window.AG_ViewController.toggleGroup(group);
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
        window.AG_ViewController.handleRefresh();
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
   * 监听 VS Code 宿主下发的双向 IPC 消息
   */
  function bindIpcMessages() {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      const vc = window.AG_ViewController;

      switch (msg.command) {
        case 'setConversations': {
          state.conversations = msg.data || {};
          if (msg.convDir) {
            state.convDataDir = msg.convDir;
          }
          for (const cid of Array.from(state.selectedConvIds)) {
            if (!state.conversations[cid]) {
              state.selectedConvIds.delete(cid);
            }
          }
          window.AG_Batch?.updateBatchBar();
          if (state.activeTab === 'conversations') {
            vc.renderCurrentView();
          }
          break;
        }
        case 'setPlans': {
          state.plans = msg.plans || [];
          for (const pid of Array.from(state.selectedPlanIds)) {
            if (!state.plans.some((p) => p.id === pid)) {
              state.selectedPlanIds.delete(pid);
            }
          }
          window.AG_Batch?.updateBatchBar();
          if (state.activeTab === 'plans') {
            vc.renderCurrentView();
          }
          break;
        }
        case 'setExportPath': {
          state.exportPath = msg.path || '';
          window.AG_Renderer?.renderExportPathBar();
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
            window.AG_I18N.setLanguage(msg.language);
            vc.renderCurrentView();
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
              state.selectedConvIds.delete(cid);
            }
            window.AG_Batch?.updateBatchBar();
            if (state.activeTab === 'conversations') {
              vc.renderCurrentView();
            }
          }
          break;
        }
        case 'optimisticDeletePlans': {
          if (Array.isArray(msg.planIds)) {
            const deleteSet = new Set(msg.planIds);
            state.plans = (state.plans || []).filter((p) => !deleteSet.has(p.id));
            for (const pid of msg.planIds) {
              state.selectedPlanIds.delete(pid);
            }
            window.AG_Batch?.updateBatchBar();
            if (state.activeTab === 'plans') {
              vc.renderCurrentView();
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

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
  }
})(window);
