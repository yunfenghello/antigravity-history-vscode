// @ts-nocheck
/**
 * 前端通用视图控制器与公共交互中枢模块 (Common View Controller)
 *
 * 核心功能：
 * - 统一双面板刷新中枢调度 (handleRefresh)，集成动画、加载遮罩与单通道 IPC 通信
 * - 统一分组展开与折叠调度 (expandAll, collapseAll, toggleGroup)
 * - 统一日期与工作区分组模式切换 (setGroupBy) 并联动按钮样式
 * - 统一检索输入防抖过滤处理器 (handleSearchInput)
 * - 统一选项卡面板切换 (switchTab) 与当前视图智能分发渲染 (renderCurrentView)
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  let searchDebounceTimer = null;

  /**
   * 依据当前激活标签分发渲染对应视图
   */
  function renderCurrentView() {
    const state = window.AG_State;
    if (!window.AG_Renderer) {
      return;
    }
    try {
      if (state.activeTab === 'plans') {
        window.AG_Renderer.renderPlansList();
      } else {
        window.AG_Renderer.renderList();
      }
    } catch (err) {
      console.error('[AG] renderCurrentView 渲染异常:', err);
      if (window.AG_Utils && typeof window.AG_Utils.showError === 'function') {
        window.AG_Utils.showError(err && err.message ? err.message : String(err));
      }
    }
  }

  /**
   * 统一公共刷新调度中枢
   */
  function handleRefresh() {
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
      }, 600);
    }

    const state = window.AG_State;
    const hasData =
      (state.activeTab === 'conversations' && state.conversations && Object.keys(state.conversations).length > 0) ||
      (state.activeTab === 'plans' && state.plans && state.plans.length > 0);

    // 仅在当前视图完全无任何卡片数据时才展示全屏加载动画，已有内容时杜绝暴力抹除
    if (!hasData && window.AG_Utils && typeof window.AG_Utils.showLoading === 'function') {
      window.AG_Utils.showLoading();
    }

    if (window.AG_VSCODE) {
      window.AG_VSCODE.postMessage({ command: 'refresh' });
    }
  }

  /**
   * 统一全部展开调度
   */
  function expandAll() {
    const state = window.AG_State;
    state.collapsedGroups.clear();
    renderCurrentView();
  }

  /**
   * 统一全部折叠调度
   */
  function collapseAll() {
    const state = window.AG_State;
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }

    const allHeaders = listContainer.querySelectorAll('.date-group-header');
    allHeaders.forEach((headerEl) => {
      const groupKey = headerEl.getAttribute('data-group');
      if (groupKey) {
        state.collapsedGroups.add(groupKey);
      }
    });

    renderCurrentView();
  }

  /**
   * 统一单项分组展开与折叠反转
   *
   * @param {string} groupKey 分组唯一标识字符串
   */
  function toggleGroup(groupKey) {
    if (!groupKey) {
      return;
    }
    const state = window.AG_State;
    if (state.collapsedGroups.has(groupKey)) {
      state.collapsedGroups.delete(groupKey);
    } else {
      state.collapsedGroups.add(groupKey);
    }
    renderCurrentView();
  }

  /**
   * 统一分组模式切换（按修改日期 / 按工作区目录）
   *
   * @param {'date' | 'workspace'} mode 分组模式
   */
  function setGroupBy(mode) {
    const state = window.AG_State;
    if (state.groupBy === mode) {
      return;
    }
    state.groupBy = mode;

    const groupDateBtn = document.getElementById('group-date');
    const groupWorkspaceBtn = document.getElementById('group-workspace');

    if (mode === 'date') {
      groupDateBtn?.classList.add('active');
      groupWorkspaceBtn?.classList.remove('active');
    } else {
      groupWorkspaceBtn?.classList.add('active');
      groupDateBtn?.classList.remove('active');
    }

    renderCurrentView();
  }

  /**
   * 统一搜索检索输入防抖处理
   *
   * @param {string} rawValue 输入框原始文本
   */
  function handleSearchInput(rawValue) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      const state = window.AG_State;
      state.searchQuery = (rawValue || '').trim().toLowerCase();
      renderCurrentView();
    }, 120);
  }

  /**
   * 统一选项卡面板切换调度 (加固防御性设计)
   *
   * @param {'conversations' | 'plans'} targetTab 目标选项卡
   */
  function switchTab(targetTab) {
    const state = window.AG_State;
    if (state.activeTab === targetTab) {
      return;
    }
    state.activeTab = targetTab;

    try {
      const tabConversationsBtn = document.getElementById('tab-conversations');
      const tabPlansBtn = document.getElementById('tab-plans');
      const searchInput = document.getElementById('search-input');
      const exportAllBtn = document.getElementById('btn-export-all');
      const fieldLevelSelect = document.getElementById('field-level-select');
      const exportStrategySelect = document.getElementById('export-strategy-select');
      const singleExportModeSelect = document.getElementById('single-export-mode-select');

      if (targetTab === 'conversations') {
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
    } catch (e) {
      console.warn('[AG] switchTab DOM 切换出现轻微异常:', e);
    }

    state.selectedConvIds.clear();
    state.selectedPlanIds.clear();
    if (window.AG_Batch && typeof window.AG_Batch.updateBatchBar === 'function') {
      window.AG_Batch.updateBatchBar();
    }

    // 主动检查并拉取数据，防止首次初始化丢失
    if (targetTab === 'plans' && (!state.plans || state.plans.length === 0)) {
      if (window.AG_VSCODE) {
        window.AG_VSCODE.postMessage({ command: 'refreshPlans' });
      }
    } else if (targetTab === 'conversations' && (!state.conversations || Object.keys(state.conversations).length === 0)) {
      if (window.AG_VSCODE) {
        window.AG_VSCODE.postMessage({ command: 'refresh' });
      }
    }

    renderCurrentView();
  }

  window.AG_ViewController = {
    renderCurrentView,
    handleRefresh,
    expandAll,
    collapseAll,
    toggleGroup,
    setGroupBy,
    handleSearchInput,
    switchTab,
  };
})(window);

