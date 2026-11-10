// @ts-nocheck
/**
 * 前端单一状态树管理模块 (Single Source of Truth)
 *
 * 核心功能：
 * - 集中维护会话历史、方案计划、导出路径及过滤参数
 * - 维护批量选择状态机 (selectedConvIds, selectedPlanIds, isBatchMode)
 * - 分组折叠与选项卡活跃状态持久同步
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const state = {
    activeTab: 'conversations', // 'conversations' | 'plans'
    conversations: {},
    plans: [],
    convDataDir: '',
    exportPath: '',
    groupBy: 'date', // 'date' | 'workspace'
    searchQuery: '',
    collapsedGroups: new Set(),
    isBatchMode: false,
    selectedConvIds: new Set(),
    selectedPlanIds: new Set(),
  };

  function getSelectedIds() {
    return state.activeTab === 'plans' ? state.selectedPlanIds : state.selectedConvIds;
  }

  function clearSelections() {
    state.selectedConvIds.clear();
    state.selectedPlanIds.clear();
  }

  window.AG_State = state;
  window.AG_StateHelpers = {
    getSelectedIds,
    clearSelections,
  };
})(window);
