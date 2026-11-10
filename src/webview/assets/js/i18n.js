// @ts-nocheck
/**
 * 前端国际化与多语言管理模块
 *
 * 核心功能：
 * - 维护前端完整的中英文双语词典
 * - 提供动态参数格式化翻译函数 t(key, ...args)
 * - 响应语言切换并更新所有静态按钮与选项文案
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const i18n = {
    'zh-CN': {
      tabConversations: '对话历史',
      tabPlans: '方案计划',
      searchPlaceholderConv: '搜索会话...',
      searchPlaceholderPlan: '搜索方案计划标题或工作区...',
      groupDate: '日期',
      groupWorkspace: '工作区',
      expandAll: '展开',
      collapseAll: '折叠',
      expandAllTitle: '全部展开',
      collapseAllTitle: '全部折叠',
      refresh: '刷新',
      refreshTitle: '刷新列表数据',
      strategyWorkspace: '按所属项目归类',
      strategyUnified: '统一导出目录',
      strategyTitle: '导出归属模式',
      fieldDefault: '基础对话',
      fieldThinking: '+ 思考过程',
      fieldFull: '完整数据 (含Diff与终端)',
      fieldLevelTitle: '导出详情级别',
      singleExportModeTitle: '单条导出模式',
      singleExportDialog: '另存为弹窗',
      singleExportDirect: '直接保存',
      langTitle: '界面语言 / Language',
      exportAll: '全部导出',
      exportTo: '导出至:',
      changePath: '修改',
      openPath: '打开',
      clickToChange: '点击修改导出目录',
      totalConversations: '共 {0} / {1} 个会话',
      totalCountOnly: '{0} 个会话',
      totalPlans: '共 {0} / {1} 个方案计划',
      totalPlansCountOnly: '{0} 个方案计划',
      unnamedConv: '未命名会话',
      unnamedPlan: '未命名方案计划',
      stepsUnit: '步',
      timeToday: '今天',
      timeYesterday: '昨天',
      timeEarlier: '更早',
      noWorkspace: '未关联工作区',
      openFolderTooltip: '在文件资源管理器中打开项目目录: {0}',
      openConvDataTooltip: '在文件资源管理器中打开会话存储目录: {0}',
      exportMdTooltip: '导出 Markdown',
      exportJsonTooltip: '导出 JSON',
      copyIdTooltip: '复制 ID',
      savePlanTooltip: '弹出另存为窗口，将实施方案保存至项目目录',
      saveArtifactTooltip: '点击单独另存 {0} ({1}) 至本地项目目录',
      saveAllArtifactsTooltip: '选择目标文件夹，一键导出该计划的全部工件文档',
      openPlanSourceTooltip: '在系统文件资源管理器中查看脑图源文件夹',
      savePlanBtn: '另存方案',
      saveAllArtifactsBtn: '全部工件',
      openSourceFolderBtn: '源目录',
      preparingExportMd: '准备导出 Markdown...',
      preparingExportJson: '准备导出 JSON...',
      idCopied: 'ID 已复制到剪贴板',
      syncingRecover: '正在同步恢复会话数据... {0}/{1}',
      recoverDone: '成功恢复 {0} 个会话',
      emptyTitle: '未找到会话记录',
      emptyDesc: '请确认 Antigravity 正在运行且已激活工作区。',
      emptyPlanTitle: '未发现方案计划文档',
      emptyPlanDesc: '当与 AI 协作生成 implementation_plan.md 或 task.md 时将自动收录呈现。',
      noResultsTitle: '未找到匹配 "{0}" 的记录',
      noResultsDesc: '请尝试其他搜索关键词。',
      loadingText: '正在扫描并同步最新数据...',
      errorTitle: '发生错误',
      retryBtn: '重试',
      deleteBtn: '删除',
      deletePlanBtn: '删除方案',
      deleteConvTooltip: '永久删除此会话记录与本地文件',
      deletePlanTooltip: '永久删除此方案计划及其全部工件',
      batchModeBtn: '批量管理',
      exitBatchModeBtn: '退出批量',
      selectAllBtn: '全选',
      deselectAllBtn: '取消全选',
      invertSelectBtn: '反选',
      batchDeleteBtn: '批量删除',
      batchDeleteWithCount: '批量删除 ({0})',
      selectedCount: '已选择 {0} 项',
      noItemSelected: '请先勾选待删除的项目',
    },
    'en': {
      tabConversations: 'Conversations',
      tabPlans: 'Plans & Artifacts',
      searchPlaceholderConv: 'Search conversations...',
      searchPlaceholderPlan: 'Search plan titles or workspaces...',
      groupDate: 'Date',
      groupWorkspace: 'Workspace',
      expandAll: 'Expand',
      collapseAll: 'Collapse',
      expandAllTitle: 'Expand all groups',
      collapseAllTitle: 'Collapse all groups',
      refresh: 'Refresh',
      refreshTitle: 'Refresh list',
      strategyWorkspace: 'Categorized by Project',
      strategyUnified: 'Unified Directory',
      strategyTitle: 'Export Strategy',
      fieldDefault: 'Basic Messages',
      fieldThinking: '+ Thinking Process',
      fieldFull: 'Full Data (Diffs & Outputs)',
      fieldLevelTitle: 'Export Detail Level',
      singleExportModeTitle: 'Single Export Mode',
      singleExportDialog: 'Save Dialog',
      singleExportDirect: 'Direct Export',
      langTitle: 'Language / 语言',
      exportAll: 'Export All',
      exportTo: 'Export to:',
      changePath: 'Change',
      openPath: 'Open',
      clickToChange: 'Click to change export path',
      totalConversations: 'Total {0} / {1} conversations',
      totalCountOnly: '{0} conversations',
      totalPlans: 'Total {0} / {1} plans',
      totalPlansCountOnly: '{0} plans',
      unnamedConv: 'Untitled Conversation',
      unnamedPlan: 'Untitled Plan',
      stepsUnit: 'steps',
      timeToday: 'Today',
      timeYesterday: 'Yesterday',
      timeEarlier: 'Earlier',
      noWorkspace: 'No Workspace',
      openFolderTooltip: 'Open workspace in file explorer: {0}',
      openConvDataTooltip: 'Open conversation storage in file explorer: {0}',
      exportMdTooltip: 'Export Markdown',
      exportJsonTooltip: 'Export JSON',
      copyIdTooltip: 'Copy ID',
      savePlanTooltip: 'Save implementation plan to project workspace via Save Dialog',
      saveAllArtifactsTooltip: 'Export all artifacts for this plan to selected directory',
      openPlanSourceTooltip: 'Open brain storage folder in file explorer',
      savePlanBtn: 'Save Plan',
      saveAllArtifactsBtn: 'All Artifacts',
      openSourceFolderBtn: 'Source Dir',
      preparingExportMd: 'Preparing to export Markdown...',
      preparingExportJson: 'Preparing to export JSON...',
      idCopied: 'ID copied to clipboard',
      syncingRecover: 'Syncing and recovering conversation data... {0}/{1}',
      recoverDone: 'Successfully recovered {0} conversations',
      emptyTitle: 'No Conversations Found',
      emptyDesc: 'Please verify Antigravity is running with an active workspace.',
      emptyPlanTitle: 'No Plan Artifacts Found',
      emptyPlanDesc: 'Plans (implementation_plan.md, task.md) will be listed here automatically once generated.',
      noResultsTitle: 'No records matching "{0}"',
      noResultsDesc: 'Please try different keywords.',
      loadingText: 'Scanning and syncing latest data...',
      errorTitle: 'Error Encountered',
      retryBtn: 'Retry',
      deleteBtn: 'Delete',
      deletePlanBtn: 'Delete Plan',
      deleteConvTooltip: 'Permanently delete this conversation and local files',
      deletePlanTooltip: 'Permanently delete this plan and all its artifacts',
      batchModeBtn: 'Batch',
      exitBatchModeBtn: 'Exit Batch',
      selectAllBtn: 'Select All',
      deselectAllBtn: 'Deselect',
      invertSelectBtn: 'Invert',
      batchDeleteBtn: 'Delete Selected',
      batchDeleteWithCount: 'Delete Selected ({0})',
      selectedCount: '{0} items selected',
      noItemSelected: 'Please select items to delete first',
    },
  };

  let currentLang = 'zh-CN';

  function t(key, ...args) {
    const dict = i18n[currentLang] || i18n['zh-CN'];
    let text = dict[key] || i18n['zh-CN'][key] || key;
    if (args.length > 0) {
      args.forEach((val, idx) => {
        text = text.replace(new RegExp(`\\{${idx}\\}`, 'g'), String(val));
      });
    }
    return text;
  }

  function setLanguage(lang) {
    if (lang === 'zh-CN' || lang === 'en') {
      currentLang = lang;
      document.documentElement.lang = lang;
      const langSelect = document.getElementById('lang-select');
      if (langSelect) {
        langSelect.value = lang;
      }
      updateStaticTexts();
    }
  }

  function getLanguage() {
    return currentLang;
  }

  function updateStaticTexts() {
    const safeSetText = (id, text) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = text;
      }
    };
    const safeSetTitle = (id, title) => {
      const el = document.getElementById(id);
      if (el) {
        el.title = title;
      }
    };

    safeSetText('tab-conversations', t('tabConversations'));
    safeSetText('tab-plans', t('tabPlans'));
    safeSetText('group-date', t('groupDate'));
    safeSetText('group-workspace', t('groupWorkspace'));
    safeSetText('btn-expand-all', t('expandAll'));
    safeSetTitle('btn-expand-all', t('expandAllTitle'));
    safeSetText('btn-collapse-all', t('collapseAll'));
    safeSetTitle('btn-collapse-all', t('collapseAllTitle'));
    safeSetText('btn-refresh', t('refresh'));
    safeSetTitle('btn-refresh', t('refreshTitle'));
    safeSetText('btn-export-all', t('exportAll'));

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      const activeTab = window.AG_State ? window.AG_State.activeTab : 'conversations';
      searchInput.placeholder = activeTab === 'plans' ? t('searchPlaceholderPlan') : t('searchPlaceholderConv');
    }

    const stratSelect = document.getElementById('export-strategy-select');
    if (stratSelect && stratSelect.options && stratSelect.options.length >= 2) {
      stratSelect.title = t('strategyTitle');
      stratSelect.options[0].text = t('strategyWorkspace');
      stratSelect.options[1].text = t('strategyUnified');
    }

    const singleSelect = document.getElementById('single-export-mode-select');
    if (singleSelect && singleSelect.options && singleSelect.options.length >= 2) {
      singleSelect.title = t('singleExportModeTitle');
      singleSelect.options[0].text = t('singleExportDialog');
      singleSelect.options[1].text = t('singleExportDirect');
    }

    const fieldSelect = document.getElementById('field-level-select');
    if (fieldSelect && fieldSelect.options && fieldSelect.options.length >= 3) {
      fieldSelect.title = t('fieldLevelTitle');
      fieldSelect.options[0].text = t('fieldDefault');
      fieldSelect.options[1].text = t('fieldThinking');
      fieldSelect.options[2].text = t('fieldFull');
    }

    safeSetTitle('lang-select', t('langTitle'));
    safeSetText('btn-select-all', t('selectAllBtn'));
    safeSetText('btn-invert-select', t('invertSelectBtn'));
    safeSetText('btn-deselect-all', t('deselectAllBtn'));
    safeSetText('btn-exit-batch', t('exitBatchModeBtn'));

    if (window.AG_Batch) {
      window.AG_Batch.updateBatchBar();
    }
  }

  window.AG_I18N = {
    t,
    setLanguage,
    getLanguage,
    updateStaticTexts,
  };
})(window);

