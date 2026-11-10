// @ts-nocheck
/**
 * 前端应用程序主控制器与事件委托中枢
 *
 * 核心功能：
 * - 初始化 VS Code API 桥接
 * - 全局事件委托 (Event Delegation) 监听列表点击，消除数千个冗余监听器
 * - 顶栏检索输入防抖、日期/工作区分组切换与选项卡视图切换
 * - 方案计划与对话历史双栏统一支持日期/工作区智能分组与折叠
 * - 处理宿主双向 IPC 消息通信 (setConversations, setPlans, optimisticDelete 等)
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const vscode = acquireVsCodeApi();
  window.AG_VSCODE = vscode;

  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { showToast, showLoading, showError } = window.AG_Utils;
  const state = window.AG_State;

  function init() {
    bindTopBarEvents();
    bindGlobalDelegatedEvents();
    bindIpcMessages();
    window.AG_I18N.updateStaticTexts();
    showLoading();
    vscode.postMessage({ command: 'refresh' });
  }

  function renderCurrentView() {
    if (state.activeTab === 'conversations') {
      window.AG_Renderer.renderList();
    } else {
      window.AG_Renderer.renderPlansList();
    }
  }

  function bindTopBarEvents() {
    const tabConversationsBtn = document.getElementById('tab-conversations');
    const tabPlansBtn = document.getElementById('tab-plans');
    const searchInput = document.getElementById('search-input');
    const groupDateBtn = document.getElementById('group-date');
    const groupWorkspaceBtn = document.getElementById('group-workspace');
    const expandAllBtn = document.getElementById('btn-expand-all');
    const collapseAllBtn = document.getElementById('btn-collapse-all');
    const refreshBtn = document.getElementById('btn-refresh');
    const toggleBatchBtn = document.getElementById('btn-toggle-batch');
    const exportAllBtn = document.getElementById('btn-export-all');
    const fieldLevelSelect = document.getElementById('field-level-select');
    const exportStrategySelect = document.getElementById('export-strategy-select');
    const singleExportModeSelect = document.getElementById('single-export-mode-select');
    const langSelect = document.getElementById('lang-select');
    const selectAllBtn = document.getElementById('btn-select-all');
    const invertSelectBtn = document.getElementById('btn-invert-select');
    const deselectAllBtn = document.getElementById('btn-deselect-all');
    const batchDeleteBtn = document.getElementById('btn-batch-delete');
    const exitBatchBtn = document.getElementById('btn-exit-batch');

    if (tabConversationsBtn) {
      tabConversationsBtn.addEventListener('click', () => switchTab('conversations'));
    }
    if (tabPlansBtn) {
      tabPlansBtn.addEventListener('click', () => switchTab('plans'));
    }

    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.searchQuery = e.target.value.trim().toLowerCase();
          renderCurrentView();
        }, 120);
      });
    }

    if (groupDateBtn) {
      groupDateBtn.addEventListener('click', () => {
        state.groupBy = 'date';
        groupDateBtn.classList.add('active');
        if (groupWorkspaceBtn) {
          groupWorkspaceBtn.classList.remove('active');
        }
        renderCurrentView();
      });
    }

    if (groupWorkspaceBtn) {
      groupWorkspaceBtn.addEventListener('click', () => {
        state.groupBy = 'workspace';
        groupWorkspaceBtn.classList.add('active');
        if (groupDateBtn) {
          groupDateBtn.classList.remove('active');
        }
        renderCurrentView();
      });
    }

    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        state.collapsedGroups.clear();
        renderCurrentView();
      });
    }

    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        const listContainer = document.getElementById('list-container');
        if (listContainer) {
          const allHeaders = listContainer.querySelectorAll('.date-group-header');
          allHeaders.forEach((h) => {
            const group = h.getAttribute('data-group');
            if (group) {
              state.collapsedGroups.add(group);
            }
          });
          renderCurrentView();
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('spinning');
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
        vscode.postMessage({ command: 'refresh' });
      });
    }

    if (toggleBatchBtn) {
      toggleBatchBtn.addEventListener('click', () => {
        window.AG_Batch.toggleBatchMode();
      });
    }

    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'exportAll' });
      });
    }

    if (fieldLevelSelect) {
      fieldLevelSelect.addEventListener('change', (e) => {
        vscode.postMessage({ command: 'setFieldLevel', value: e.target.value });
      });
    }

    if (exportStrategySelect) {
      exportStrategySelect.addEventListener('change', (e) => {
        vscode.postMessage({ command: 'setExportStrategy', value: e.target.value });
      });
    }

    if (singleExportModeSelect) {
      singleExportModeSelect.addEventListener('change', (e) => {
        vscode.postMessage({ command: 'setSingleExportMode', value: e.target.value });
      });
    }

    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        window.AG_I18N.setLanguage(lang);
        vscode.postMessage({ command: 'setLanguage', value: lang });
        renderCurrentView();
      });
    }

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', window.AG_Batch.handleSelectAll);
    }
    if (invertSelectBtn) {
      invertSelectBtn.addEventListener('click', window.AG_Batch.handleInvertSelect);
    }
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', window.AG_Batch.handleDeselectAll);
    }
    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', window.AG_Batch.handleBatchDelete);
    }
    if (exitBatchBtn) {
      exitBatchBtn.addEventListener('click', () => window.AG_Batch.toggleBatchMode(false));
    }
  }

  function switchTab(newTab) {
    if (state.activeTab === newTab) {
      return;
    }
    state.activeTab = newTab;

    const tabConversationsBtn = document.getElementById('tab-conversations');
    const tabPlansBtn = document.getElementById('tab-plans');
    const searchInput = document.getElementById('search-input');
    const exportAllBtn = document.getElementById('btn-export-all');
    const fieldLevelSelect = document.getElementById('field-level-select');
    const exportStrategySelect = document.getElementById('export-strategy-select');
    const singleExportModeSelect = document.getElementById('single-export-mode-select');

    if (newTab === 'conversations') {
      tabConversationsBtn?.classList.add('active');
      tabPlansBtn?.classList.remove('active');
      if (searchInput) {
        searchInput.placeholder = t('searchPlaceholderConv');
      }
      if (exportAllBtn) {
        exportAllBtn.style.display = '';
      }
      if (fieldLevelSelect) {
        fieldLevelSelect.style.display = '';
      }
      if (exportStrategySelect) {
        exportStrategySelect.style.display = '';
      }
      if (singleExportModeSelect) {
        singleExportModeSelect.style.display = '';
      }
    } else {
      tabPlansBtn?.classList.add('active');
      tabConversationsBtn?.classList.remove('active');
      if (searchInput) {
        searchInput.placeholder = t('searchPlaceholderPlan');
      }
      if (exportAllBtn) {
        exportAllBtn.style.display = 'none';
      }
      if (fieldLevelSelect) {
        fieldLevelSelect.style.display = 'none';
      }
      if (exportStrategySelect) {
        exportStrategySelect.style.display = 'none';
      }
      if (singleExportModeSelect) {
        singleExportModeSelect.style.display = 'none';
      }
    }

    state.selectedConvIds.clear();
    state.selectedPlanIds.clear();
    window.AG_Batch.updateBatchBar();
    renderCurrentView();
  }

  function bindGlobalDelegatedEvents() {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }

    listContainer.addEventListener('click', (e) => {
      // 1. 处理分组展开/折叠
      const header = e.target.closest('.date-group-header');
      if (header) {
        const group = header.getAttribute('data-group');
        if (group) {
          if (state.collapsedGroups.has(group)) {
            state.collapsedGroups.delete(group);
          } else {
            state.collapsedGroups.add(group);
          }
          renderCurrentView();
        }
        return;
      }

      // 2. 处理动作按钮点击
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.getAttribute('data-action');
        const cascadeId = actionBtn.getAttribute('data-id');
        const planId = actionBtn.getAttribute('data-plan-id');

        if (action === 'refresh') {
          showLoading();
          vscode.postMessage({ command: 'refresh' });
          vscode.postMessage({ command: 'refreshPlans' });
        } else if (action === 'exportMd') {
          vscode.postMessage({ command: 'export', cascadeId, format: 'md' });
          showToast(t('preparingExportMd'));
        } else if (action === 'exportJson') {
          vscode.postMessage({ command: 'export', cascadeId, format: 'json' });
          showToast(t('preparingExportJson'));
        } else if (action === 'copyId') {
          vscode.postMessage({ command: 'copyId', cascadeId: cascadeId || planId });
          showToast(t('idCopied'));
        } else if (action === 'openFolder') {
          const folderPath = actionBtn.getAttribute('data-path');
          if (folderPath) {
            vscode.postMessage({ command: 'openInExplorer', path: folderPath });
          }
        } else if (action === 'exportPlanSingle') {
          const fileName = actionBtn.getAttribute('data-file-name') || 'implementation_plan.md';
          vscode.postMessage({ command: 'exportPlanSingle', planId, fileName });
        } else if (action === 'exportPlanAll') {
          vscode.postMessage({ command: 'exportPlanAll', planId });
        } else if (action === 'openPlanFolder') {
          const folderPath = actionBtn.getAttribute('data-path');
          if (folderPath) {
            vscode.postMessage({ command: 'openInExplorer', path: folderPath });
          }
        } else if (action === 'deleteConv') {
          if (cascadeId) {
            vscode.postMessage({ command: 'deleteConversation', cascadeId });
          }
        } else if (action === 'deletePlan') {
          if (planId) {
            vscode.postMessage({ command: 'deletePlan', planId });
          }
        }
        return;
      }

      // 3. 处理批量模式下的卡片勾选或整行点击切换
      if (state.isBatchMode) {
        const card = e.target.closest('.conv-card');
        if (card) {
          const checkbox = e.target.closest('.conv-checkbox');
          const cid = card.getAttribute('data-cascade-id');
          const pid = card.getAttribute('data-plan-id');

          if (state.activeTab === 'conversations' && cid) {
            if (checkbox) {
              if (checkbox.checked) {
                state.selectedConvIds.add(cid);
                card.classList.add('selected');
              } else {
                state.selectedConvIds.delete(cid);
                card.classList.remove('selected');
              }
            } else {
              const cb = card.querySelector('.conv-checkbox');
              if (state.selectedConvIds.has(cid)) {
                state.selectedConvIds.delete(cid);
                card.classList.remove('selected');
                if (cb) {
                  cb.checked = false;
                }
              } else {
                state.selectedConvIds.add(cid);
                card.classList.add('selected');
                if (cb) {
                  cb.checked = true;
                }
              }
            }
            window.AG_Batch.updateBatchBar();
            return;
          } else if (state.activeTab === 'plans' && pid) {
            if (checkbox) {
              if (checkbox.checked) {
                state.selectedPlanIds.add(pid);
                card.classList.add('selected');
              } else {
                state.selectedPlanIds.delete(pid);
                card.classList.remove('selected');
              }
            } else {
              const cb = card.querySelector('.conv-checkbox');
              if (state.selectedPlanIds.has(pid)) {
                state.selectedPlanIds.delete(pid);
                card.classList.remove('selected');
                if (cb) {
                  cb.checked = false;
                }
              } else {
                state.selectedPlanIds.add(pid);
                card.classList.add('selected');
                if (cb) {
                  cb.checked = true;
                }
              }
            }
            window.AG_Batch.updateBatchBar();
            return;
          }
        }
      }
    });
  }

  function bindIpcMessages() {
    window.addEventListener('message', (event) => {
      const msg = event.data;
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
          window.AG_Batch.updateBatchBar();
          if (state.activeTab === 'conversations') {
            window.AG_Renderer.renderList();
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
          window.AG_Batch.updateBatchBar();
          if (state.activeTab === 'plans') {
            window.AG_Renderer.renderPlansList();
          }
          break;
        }
        case 'setExportPath': {
          state.exportPath = msg.path || '';
          window.AG_Renderer.renderExportPathBar();
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
            renderCurrentView();
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
            window.AG_Batch.updateBatchBar();
            if (state.activeTab === 'conversations') {
              window.AG_Renderer.renderList();
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
            window.AG_Batch.updateBatchBar();
            if (state.activeTab === 'plans') {
              window.AG_Renderer.renderPlansList();
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
