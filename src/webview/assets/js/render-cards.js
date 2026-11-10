// @ts-nocheck
/**
 * 前端视图卡片与列表渲染引擎 (高度复用与模块化架构)
 *
 * 核心功能：
 * - 统一调用公共分组算法 (groupItemsByDate, groupItemsByWorkspace)
 * - 统一分组折叠容器渲染器 (renderGroupedContainer)，彻底消除双面板重复拼装
 * - 渲染【对话历史】会话卡片与【方案计划】工件卡片
 * - 批量模式动态复选框与样式高亮联动
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const {
    esc,
    stripFileUri,
    toWinPath,
    formatTime,
    groupItemsByDate,
    groupItemsByWorkspace,
    buildCheckboxHtml,
    getStatusDot,
    buildEmptyStateHtml,
  } = window.AG_Utils;

  /**
   * 通用分组容器渲染器（对话历史与方案计划共享，包含单卡片异常隔离边界）
   *
   * @param {Map<string, Array>} groups 分组数据
   * @param {Function} renderItemCardFn 单项卡片渲染函数
   * @returns {string} 完整的 HTML 字符串
   */
  function renderGroupedContainer(groups, renderItemCardFn) {
    const state = window.AG_State || {};
    const collapsedGroups = state.collapsedGroups || new Set();
    let html = '';

    if (!groups || typeof groups.entries !== 'function') {
      return html;
    }

    for (const [groupLabel, items] of groups) {
      const isCollapsed = collapsedGroups.has(groupLabel);
      const arrow = isCollapsed ? '&#x25B6;' : '&#x25BC;';
      const safeItems = Array.isArray(items) ? items : [];

      html += `<div class="date-group" data-group="${esc(groupLabel)}">`;
      html += `
        <div class="date-group-header" data-group="${esc(groupLabel)}">
          <span class="group-arrow">${arrow}</span>
          <span class="date-group-label">${esc(groupLabel)}</span>
          <span class="date-group-count">(${safeItems.length})</span>
        </div>
      `;

      html += `<div class="group-items ${isCollapsed ? 'collapsed' : ''}">`;
      if (!isCollapsed) {
        for (const item of safeItems) {
          try {
            html += renderItemCardFn(item);
          } catch (cardErr) {
            console.error('[AG] 单项卡片渲染异常已安全隔离:', cardErr, item);
          }
        }
      }
      html += `</div></div>`;
    }

    return html;
  }

  /**
   * 渲染【对话历史】列表 (全链路安全兜底保障)
   */
  function renderList() {
    const listContainer = document.getElementById('list-container');
    const statsBar = document.getElementById('stats-bar');
    if (!listContainer) {
      return;
    }

    const state = window.AG_State || {};
    if (state.activeTab === 'plans') {
      renderPlansList();
      return;
    }

    try {
      renderExportPathBar();

      const rawConversations = state.conversations || {};
      const entries = Object.entries(rawConversations);
      if (entries.length === 0) {
        listContainer.innerHTML = buildEmptyStateHtml('&#x1F4AC;', t('emptyTitle'), t('emptyDesc'));
        if (statsBar) {
          statsBar.textContent = '';
        }
        return;
      }

      // 搜索过滤
      let filtered = entries;
      const query = (state.searchQuery || '').toLowerCase().trim();
      if (query) {
        filtered = entries.filter(([id, info]) => {
          if (!info) return false;
          const sum = (info.summary || '').toLowerCase();
          const ws = (info.workspaces || [])
            .map((w) => (w?.workspaceFolderAbsoluteUri || '').toLowerCase())
            .join(' ');
          return sum.includes(query) || (id && id.toLowerCase().includes(query)) || ws.includes(query);
        });
      }

      // 统计状态更新
      if (statsBar) {
        statsBar.textContent =
          filtered.length !== entries.length
            ? t('totalConversations', filtered.length, entries.length)
            : t('totalCountOnly', entries.length);
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = buildEmptyStateHtml('&#x1F50D;', t('noResultsTitle', esc(query)), t('noResultsDesc'));
        return;
      }

      // 调用公共分组器
      const groups =
        state.groupBy === 'workspace'
          ? groupItemsByWorkspace(
              filtered,
              (e) => e?.[1]?.workspaces?.[0]?.workspaceFolderAbsoluteUri || '',
              (e) => e?.[1]?.lastModifiedTime || e?.[1]?.createdTime || '',
            )
          : groupItemsByDate(filtered, (e) => e?.[1]?.lastModifiedTime || e?.[1]?.createdTime || '');

      listContainer.innerHTML = renderGroupedContainer(groups, (entry) => renderCard(entry[0], entry[1]));

      if (window.AG_Batch && typeof window.AG_Batch.updateBatchBar === 'function') {
        window.AG_Batch.updateBatchBar();
      }
    } catch (err) {
      console.error('[AG] renderList 列表渲染异常:', err);
      listContainer.innerHTML = buildEmptyStateHtml('&#x26A0;', t('errorTitle'), err && err.message ? err.message : String(err));
    }
  }

  /**
   * 构造单张会话卡片 HTML (防空指针与异常防护)
   */
  function renderCard(cascadeId, info) {
    if (!info) {
      info = {};
    }
    const state = window.AG_State || {};
    const title = info.summary || t('unnamedConv');
    const stepCount = info.stepCount !== undefined ? info.stepCount : '?';
    const time = formatTime(info.lastModifiedTime || info.createdTime);
    const statusDot = getStatusDot(info.status || '');
    const isSelected = state.selectedConvIds ? state.selectedConvIds.has(cascadeId) : false;

    const wsUri = info.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
    const wsDisplay = wsUri ? toWinPath(stripFileUri(wsUri)) : '';
    const wsHtml = wsDisplay
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(wsUri)}" title="${esc(t('openFolderTooltip', wsDisplay))}"><span class="tag-label">[工作区]</span> ${esc(wsDisplay)}</div>`
      : '';

    const convDataTooltip = t('openConvDataTooltip', state.convDataDir ? toWinPath(state.convDataDir) : '');
    const convFileHtml = state.convDataDir
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(state.convDataDir)}" title="${esc(convDataTooltip)}"><span class="tag-label">[存储]</span> ${esc(cascadeId)}</div>`
      : '';

    const checkboxHtml = buildCheckboxHtml(cascadeId, isSelected, state.isBatchMode, 'data-checkbox-id');

    return `
      <div class="conv-card ${state.isBatchMode ? 'batch-selectable' : ''} ${isSelected ? 'selected' : ''}" data-cascade-id="${esc(cascadeId)}">
        ${checkboxHtml}
        <div class="conv-icon">${statusDot}</div>
        <div class="conv-info">
          <div class="conv-title" title="${esc(title)}">${esc(title)}</div>
          <div class="conv-meta">${time} · ${stepCount} ${t('stepsUnit')}</div>
          ${wsHtml}
          ${convFileHtml}
        </div>
        <div class="conv-actions">
          <button class="btn-export" data-action="exportMd" data-id="${esc(cascadeId)}" title="${esc(t('exportMdTooltip'))}">MD</button>
          <button class="btn-export" data-action="exportJson" data-id="${esc(cascadeId)}" title="${esc(t('exportJsonTooltip'))}">JSON</button>
          <button class="btn-export" data-action="copyId" data-id="${esc(cascadeId)}" title="${esc(t('copyIdTooltip'))}">ID</button>
          <button class="btn-export btn-danger-action" data-action="deleteConv" data-id="${esc(cascadeId)}" title="${esc(t('deleteConvTooltip'))}">${esc(t('deleteBtn'))}</button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染【方案计划】列表 (无缝复用分组渲染器与公共分组算法，全链路异常安全)
   */
  function renderPlansList() {
    const listContainer = document.getElementById('list-container');
    const statsBar = document.getElementById('stats-bar');
    if (!listContainer) {
      return;
    }

    const state = window.AG_State || {};

    try {
      // 方案计划面板下清理会话导出路径提示栏，消除视觉干扰
      const exportBar = document.getElementById('export-path-bar');
      if (exportBar) {
        exportBar.innerHTML = '';
      }

      const plans = Array.isArray(state.plans) ? state.plans : [];
      if (plans.length === 0) {
        listContainer.innerHTML = buildEmptyStateHtml('&#x1F4DD;', t('emptyPlanTitle'), t('emptyPlanDesc'));
        if (statsBar) {
          statsBar.textContent = '';
        }
        return;
      }

      let filtered = plans;
      const query = (state.searchQuery || '').toLowerCase().trim();
      if (query) {
        filtered = plans.filter((p) => {
          if (!p) return false;
          const title = (p.title || '').toLowerCase();
          const ws = (p.workspacePath || '').toLowerCase();
          const id = (p.id || '').toLowerCase();
          return title.includes(query) || ws.includes(query) || id.includes(query);
        });
      }

      if (statsBar) {
        statsBar.textContent =
          filtered.length !== plans.length
            ? t('totalPlans', filtered.length, plans.length)
            : t('totalPlansCountOnly', plans.length);
      }

      if (filtered.length === 0) {
        listContainer.innerHTML = buildEmptyStateHtml('&#x1F50D;', t('noResultsTitle', esc(query)), t('noResultsDesc'));
        return;
      }

      // 调用公共分组器（与会话列表完全复用同一套通用逻辑）
      const groups =
        state.groupBy === 'workspace'
          ? groupItemsByWorkspace(filtered, (p) => p?.workspacePath || '', (p) => p?.lastModifiedTime || '')
          : groupItemsByDate(filtered, (p) => p?.lastModifiedTime || '');

      listContainer.innerHTML = renderGroupedContainer(groups, (plan) => renderPlanCard(plan));

      if (window.AG_Batch && typeof window.AG_Batch.updateBatchBar === 'function') {
        window.AG_Batch.updateBatchBar();
      }
    } catch (err) {
      console.error('[AG] renderPlansList 方案计划渲染异常:', err);
      listContainer.innerHTML = buildEmptyStateHtml('&#x26A0;', t('errorTitle'), err && err.message ? err.message : String(err));
    }
  }

  /**
   * 构造单张方案计划卡片 HTML (防空指针与异常防护)
   */
  function renderPlanCard(plan) {
    if (!plan) {
      plan = {};
    }
    const state = window.AG_State || {};
    const title = plan.title || t('unnamedPlan');
    const time = formatTime(plan.lastModifiedTime);
    const wsDisplay = plan.workspacePath ? toWinPath(plan.workspacePath) : t('noWorkspace');
    const wsTooltip = t('openFolderTooltip', wsDisplay);
    const isSelected = state.selectedPlanIds ? state.selectedPlanIds.has(plan.id) : false;

    const wsHtml = plan.workspacePath
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(plan.workspacePath)}" title="${esc(wsTooltip)}"><span class="tag-label">[工作区]</span> ${esc(wsDisplay)}</div>`
      : `<div class="conv-workspace" style="color:var(--vscode-descriptionForeground)"><span class="tag-label">[工作区]</span> ${esc(wsDisplay)}</div>`;

    let badgesHtml = '<div class="artifact-badge-group">';
    for (const art of plan.artifacts || []) {
      if (!art) continue;
      const isMain = art.fileName === 'implementation_plan.md';
      const tooltip = t('saveArtifactTooltip', art.label || art.fileName, art.fileName);
      badgesHtml += `<button class="artifact-badge ${isMain ? 'primary' : ''}" data-action="exportPlanSingle" data-plan-id="${esc(plan.id)}" data-file-name="${esc(art.fileName)}" title="${esc(tooltip)}"><span class="badge-icon">&#x2193;</span> ${esc(art.label || art.fileName)} (${esc(art.fileName)})</button>`;
    }
    badgesHtml += '</div>';

    const checkboxHtml = buildCheckboxHtml(plan.id, isSelected, state.isBatchMode, 'data-checkbox-plan-id');

    return `
      <div class="conv-card plan-card ${state.isBatchMode ? 'batch-selectable' : ''} ${isSelected ? 'selected' : ''}" data-plan-id="${esc(plan.id)}">
        ${checkboxHtml}
        <div class="conv-icon"><span class="status-dot active">&#x25CF;</span></div>
        <div class="conv-info">
          <div class="conv-title" style="font-weight:600;font-size:14px;" title="${esc(title)}">${esc(title)}</div>
          <div class="conv-meta">${time} · ID: ${esc(plan.id ? plan.id.slice(0, 8) : '–')}...</div>
          ${wsHtml}
          ${badgesHtml}
        </div>
        <div class="conv-actions">
          <button class="btn btn-primary btn-sm" data-action="exportPlanSingle" data-plan-id="${esc(plan.id)}" data-file-name="implementation_plan.md" title="${esc(t('savePlanTooltip'))}">${esc(t('savePlanBtn'))}</button>
          <button class="btn btn-secondary btn-sm" data-action="exportPlanAll" data-plan-id="${esc(plan.id)}" title="${esc(t('saveAllArtifactsTooltip'))}">${esc(t('saveAllArtifactsBtn'))}</button>
          <button class="btn-export" data-action="openPlanFolder" data-path="${esc(plan.dirPath || '')}" title="${esc(t('openPlanSourceTooltip'))}">${esc(t('openSourceFolderBtn'))}</button>
          <button class="btn-export btn-danger-action" data-action="deletePlan" data-plan-id="${esc(plan.id)}" title="${esc(t('deletePlanTooltip'))}">${esc(t('deletePlanBtn'))}</button>
        </div>
      </div>
    `;
  }

  function renderExportPathBar() {
    const bar = document.getElementById('export-path-bar');
    if (!bar) {
      return;
    }
    const state = window.AG_State;
    if (!state.exportPath) {
      bar.innerHTML = '';
      return;
    }
    const displayPath = toWinPath(state.exportPath);
    bar.innerHTML = `
      <span class="export-path-label">${t('exportTo')}</span>
      <span class="export-path-value" title="${t('clickToChange')}">${esc(displayPath)}</span>
      <button class="btn btn-secondary btn-sm" id="btn-change-export-path">${t('changePath')}</button>
      <button class="btn btn-secondary btn-sm" id="btn-open-export-path">${t('openPath')}</button>
    `;

    const valEl = bar.querySelector('.export-path-value');
    if (valEl) {
      valEl.addEventListener('click', () => {
        window.AG_VSCODE.postMessage({ command: 'changeExportPath' });
      });
    }
    const changeBtn = document.getElementById('btn-change-export-path');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        window.AG_VSCODE.postMessage({ command: 'changeExportPath' });
      });
    }
    const openBtn = document.getElementById('btn-open-export-path');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        window.AG_VSCODE.postMessage({ command: 'openExportFolder' });
      });
    }
  }

  window.AG_Renderer = {
    renderList,
    renderPlansList,
    renderExportPathBar,
    renderCard,
    renderPlanCard,
  };
})(window);
