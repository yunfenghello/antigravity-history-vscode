// @ts-nocheck
/**
 * 前端应用程序主控制器与事件委托中枢
 *
 * 核心功能：
 * - 初始化 VS Code API 桥接
 * - 全局事件委托 (Event Delegation) 监听列表点击，消除数千个冗余监听器
 * - 顶栏检索输入防抖与选项卡切换
 * - 处理宿主双向 IPC 消息通信 (setConversations, setPlans, optimisticDelete 等)
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const vscode = acquireVsCodeApi();
  window.AG_VSCODE = vscode;

  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { esc, showToast, showLoading, showError } = window.AG_Utils;
  const state = window.AG_State;

  function init() {
    bindTopBarEvents();
    bindGlobalDelegatedEvents();
    bindIpcMessages();
    window.AG_I18N.updateStaticTexts();
    showLoading();
    vscode.postMessage({ command: 'refresh' });
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
          state.searchQuery = e.target.value;
          window.AG_Renderer.renderList();
        }, 120);
      });
    }

    if (groupDateBtn) {
      groupDateBtn.addEventListener('click', () => {
        state.groupBy = 'date';
        groupDateBtn.classList.add('active');
        groupWorkspaceBtn?.classList.remove('active');
        window.AG_Renderer.renderList();
      });
    }

    if (groupWorkspaceBtn) {
      groupWorkspaceBtn.addEventListener('click', () => {
        state.groupBy = 'workspace';
        groupWorkspaceBtn.classList.add('active');
        groupDateBtn?.classList.remove('active');
        window.AG_Renderer.renderList();
      });
    }

    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        state.collapsedGroups.clear();
        window.AG_Renderer.renderList();
      });
    }

    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.group-header').forEach((el) => {
          const k = el.getAttribute('data-group-key');
          if (k) {
            state.collapsedGroups.add(k);
          }
        });
        window.AG_Renderer.renderList();
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
        window.AG_Renderer.renderList();
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
    const segControls = document.querySelectorAll('.segmented-control');

    if (newTab === 'conversations') {
      tabConversationsBtn?.classList.add('active');
      tabPlansBtn?.classList.remove('active');
      if (searchInput) {
        searchInput.placeholder = t('searchPlaceholderConv');
      }
      segControls.forEach((el) => (el.style.display = ''));
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
      segControls.forEach((el) => (el.style.display = 'none'));
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
    window.AG_Renderer.renderList();
  }

  function bindGlobalDelegatedEvents() {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }

    listContainer.addEventListener('click', (e) => {
      // 1. 分组折叠展开点击
      const groupHeader = e.target.closest('.group-header');
      if (groupHeader) {
        const groupKey = groupHeader.getAttribute('data-group-key');
        if (groupKey) {
          if (state.collapsedGroups.has(groupKey)) {
            state.collapsedGroups.delete(groupKey);
          } else {
            state.collapsedGroups.add(groupKey);
          }
          window.AG_Renderer.renderList();
        }
        return;
      }

      // 2. 复选框点击
      if (e.target.classList.contains('card-checkbox')) {
        const id = e.target.getAttribute('data-checkbox-id');
        const isPlan = state.activeTab === 'plans';
        const targetSet = isPlan ? state.selectedPlanIds : state.selectedConvIds;
        if (e.target.checked) {
          targetSet.add(id);
        } else {
          targetSet.delete(id);
        }
        const card = e.target.closest('.card');
        if (card) {
          card.classList.toggle('selected', e.target.checked);
        }
        window.AG_Batch.updateBatchBar();
        return;
      }

      // 3. 按钮动作派发
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) {
        return;
      }
      const action = actionEl.getAttribute('data-action');
      const card = actionEl.closest('.card');

      if (action === 'export-md') {
        const cid = card?.getAttribute('data-cascade-id');
        if (cid) {
          showToast(t('preparingExportMd'));
          vscode.postMessage({ command: 'export', cascadeId: cid, format: 'md' });
        }
      } else if (action === 'export-json') {
        const cid = card?.getAttribute('data-cascade-id');
        if (cid) {
          showToast(t('preparingExportJson'));
          vscode.postMessage({ command: 'export', cascadeId: cid, format: 'json' });
        }
      } else if (action === 'delete-conv') {
        const cid = card?.getAttribute('data-cascade-id');
        if (cid) {
          vscode.postMessage({ command: 'deleteConversation', cascadeId: cid });
        }
      } else if (action === 'delete-plan') {
        const pid = actionEl.getAttribute('data-plan-id');
        if (pid) {
          vscode.postMessage({ command: 'deletePlan', planId: pid });
        }
      } else if (action === 'export-plan-single') {
        const pid = actionEl.getAttribute('data-plan-id');
        const fileName = actionEl.getAttribute('data-file-name');
        if (pid) {
          vscode.postMessage({ command: 'exportPlanSingle', planId: pid, fileName });
        }
      } else if (action === 'export-plan-all') {
        const pid = actionEl.getAttribute('data-plan-id');
        if (pid) {
          vscode.postMessage({ command: 'exportPlanAll', planId: pid });
        }
      } else if (action === 'copy-id') {
        const cid = card?.getAttribute('data-cascade-id') || actionEl.getAttribute('data-cid');
        if (cid) {
          vscode.postMessage({ command: 'copyId', cascadeId: cid });
          showToast(t('idCopied'));
        }
      } else if (action === 'open-folder') {
        const p = actionEl.getAttribute('data-path');
        if (p) {
          vscode.postMessage({ command: 'openInExplorer', path: p });
        }
      } else if (action === 'open-plan-folder') {
        const p = actionEl.getAttribute('data-path');
        if (p) {
          vscode.postMessage({ command: 'openPlanFolder', path: p });
        }
      } else if (action === 'open-conv-dir') {
        const cid = actionEl.getAttribute('data-cid');
        if (state.convDataDir) {
          const fullPath = cid ? `${state.convDataDir}/${cid}` : state.convDataDir;
          vscode.postMessage({ command: 'openInExplorer', path: fullPath });
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
          if (state.activeTab === 'conversations') {
            window.AG_Renderer.renderList();
          }
          break;
        }
        case 'setPlans': {
          state.plans = msg.plans || [];
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
          if (msg.language) {
            window.AG_I18N.setLanguage(msg.language);
            window.AG_Renderer.renderList();
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
            const deleteSet = new Set(msg.cascadeIds);
            for (const cid of msg.cascadeIds) {
              delete state.conversations[cid];
              state.selectedConvIds.delete(cid);
            }
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
