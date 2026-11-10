// @ts-nocheck
/**
 * 前端批量操作管理与状态机调度器
 *
 * 核心功能：
 * - 批量模式开启、退出与视觉切换
 * - 动态计数统计呈现 (已选择 N 项)
 * - 全选、反选、取消全选集合计算与高亮边框同步
 * - 批量物理删除 IPC 调度
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { showToast } = window.AG_Utils;

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

    const selectedSet = state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
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
    if (window.AG_Renderer) {
      window.AG_Renderer.renderList();
    }
  }

  function getVisibleItemIds() {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return [];
    }
    const checkboxes = listContainer.querySelectorAll('.card-checkbox');
    const ids = [];
    checkboxes.forEach((cb) => {
      const id = cb.getAttribute('data-checkbox-id');
      if (id) {
        ids.push(id);
      }
    });
    return ids;
  }

  function handleSelectAll() {
    const state = window.AG_State;
    const visibleIds = getVisibleItemIds();
    const targetSet = state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
    visibleIds.forEach((id) => targetSet.add(id));

    syncCardSelections();
    updateBatchBar();
  }

  function handleInvertSelect() {
    const state = window.AG_State;
    const visibleIds = getVisibleItemIds();
    const targetSet = state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
    visibleIds.forEach((id) => {
      if (targetSet.has(id)) {
        targetSet.delete(id);
      } else {
        targetSet.add(id);
      }
    });

    syncCardSelections();
    updateBatchBar();
  }

  function handleDeselectAll() {
    const state = window.AG_State;
    const targetSet = state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
    targetSet.clear();

    syncCardSelections();
    updateBatchBar();
  }

  function syncCardSelections() {
    const state = window.AG_State;
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
      return;
    }
    const targetSet = state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
    const cards = listContainer.querySelectorAll('.card');

    cards.forEach((card) => {
      const id = card.getAttribute('data-cascade-id') || card.getAttribute('data-plan-id');
      const isSelected = targetSet.has(id);
      const cb = card.querySelector('.card-checkbox');
      if (cb) {
        cb.checked = isSelected;
      }
      if (isSelected) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  function handleBatchDelete() {
    const state = window.AG_State;
    const isPlan = state.activeTab === 'plans';
    const targetSet = isPlan ? state.selectedPlanIds : state.selectedConvIds;
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
    updateBatchBar,
    toggleBatchMode,
    getVisibleItemIds,
    handleSelectAll,
    handleInvertSelect,
    handleDeselectAll,
    syncCardSelections,
    handleBatchDelete,
  };
})(window);

