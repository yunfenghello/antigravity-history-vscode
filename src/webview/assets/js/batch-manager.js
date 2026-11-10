// @ts-nocheck
/**
 * 前端批量操作管理与状态机调度器 (高度复用与统一抽象)
 *
 * 核心功能：
 * - 批量模式开启、退出与视觉切换
 * - 动态计数统计呈现 (已选择 N 项)
 * - 统一已选集合调度 (getActiveSelectedSet)，消除双面板条件判断冗余
 * - 全选、反选、取消全选集合计算与卡片高亮联动
 * - 批量物理删除 IPC 调度
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { showToast } = window.AG_Utils;

  /**
   * 获取当前激活选项卡对应的选中 ID 集合 (Single Selection Target)
   *
   * @returns {Set<string>} 选中的 ID 集合
   */
  function getActiveSelectedSet() {
    const state = window.AG_State;
    return state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
  }

  function renderView() {
    const state = window.AG_State;
    if (window.AG_Renderer) {
      if (state.activeTab === 'conversations') {
        window.AG_Renderer.renderList();
      } else {
        window.AG_Renderer.renderPlansList();
      }
    }
  }

  function updateBatchBar() {
    const state = window.AG_State;
    const batchToolbar = document.getElementById('batch-toolbar');
    const toggleBatchBtn = document.getElementById('btn-toggle-batch');
    const batchSelectedCount = document.getElementById('batch-selected-count');
    const batchDeleteBtn = document.getElementById('btn-batch-delete');

    if (!batchToolbar || !toggleBatchBtn) {
      return;
    }

    if (state.isBatchMode) {
      batchToolbar.style.display = 'flex';
      toggleBatchBtn.classList.add('active');
      toggleBatchBtn.textContent = t('exitBatchModeBtn');
    } else {
      batchToolbar.style.display = 'none';
      toggleBatchBtn.classList.remove('active');
      toggleBatchBtn.textContent = t('batchModeBtn');
    }

    const selectedSet = getActiveSelectedSet();
    const count = selectedSet.size;

    if (batchSelectedCount) {
      batchSelectedCount.textContent = t('selectedCount', count);
    }

    if (batchDeleteBtn) {
      if (count > 0) {
        batchDeleteBtn.disabled = false;
        batchDeleteBtn.textContent = t('batchDeleteWithCount', count);
      } else {
        batchDeleteBtn.disabled = true;
        batchDeleteBtn.textContent = t('batchDeleteBtn');
      }
    }
  }

  function toggleBatchMode(forceVal) {
    const state = window.AG_State;
    if (typeof forceVal === 'boolean') {
      state.isBatchMode = forceVal;
    } else {
      state.isBatchMode = !state.isBatchMode;
    }

    if (!state.isBatchMode) {
      state.selectedConvIds.clear();
      state.selectedPlanIds.clear();
    }

    updateBatchBar();
    renderView();
  }

  function getVisibleItemIds() {
    const state = window.AG_State;
    const query = (state.searchQuery || '').toLowerCase().trim();

    if (state.activeTab === 'conversations') {
      const entries = Object.entries(state.conversations || {});
      const filtered = entries.filter(([cid, info]) => {
        if (!query) {
          return true;
        }
        const title = (info.summary || '').toLowerCase();
        const id = cid.toLowerCase();
        const ws = (info.workspaces || [])
          .map((w) => (w.workspaceFolderAbsoluteUri || '').toLowerCase())
          .join(' ');
        return title.includes(query) || id.includes(query) || ws.includes(query);
      });
      return filtered.map(([cid]) => cid);
    } else {
      const filtered = (state.plans || []).filter((plan) => {
        if (!query) {
          return true;
        }
        const title = (plan.title || '').toLowerCase();
        const ws = (plan.workspacePath || '').toLowerCase();
        const id = (plan.id || '').toLowerCase();
        return title.includes(query) || ws.includes(query) || id.includes(query);
      });
      return filtered.map((p) => p.id);
    }
  }

  function handleSelectAll() {
    const ids = getVisibleItemIds();
    const targetSet = getActiveSelectedSet();
    ids.forEach((id) => targetSet.add(id));

    renderView();
    updateBatchBar();
  }

  function handleInvertSelect() {
    const ids = getVisibleItemIds();
    const targetSet = getActiveSelectedSet();
    ids.forEach((id) => {
      if (targetSet.has(id)) {
        targetSet.delete(id);
      } else {
        targetSet.add(id);
      }
    });

    renderView();
    updateBatchBar();
  }

  function handleDeselectAll() {
    const targetSet = getActiveSelectedSet();
    targetSet.clear();

    renderView();
    updateBatchBar();
  }

  function handleBatchDelete() {
    const state = window.AG_State;
    const isPlan = state.activeTab === 'plans';
    const targetSet = getActiveSelectedSet();
    const ids = Array.from(targetSet);

    if (ids.length === 0) {
      showToast(t('noItemSelected'));
      return;
    }

    if (isPlan) {
      window.AG_VSCODE.postMessage({
        command: 'batchDeletePlans',
        planIds: ids,
      });
    } else {
      window.AG_VSCODE.postMessage({
        command: 'batchDeleteConversations',
        cascadeIds: ids,
      });
    }
  }

  window.AG_Batch = {
    getActiveSelectedSet,
    updateBatchBar,
    toggleBatchMode,
    getVisibleItemIds,
    handleSelectAll,
    handleInvertSelect,
    handleDeselectAll,
    handleBatchDelete,
  };
})(window);
