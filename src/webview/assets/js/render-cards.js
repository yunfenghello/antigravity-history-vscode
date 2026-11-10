// @ts-nocheck
/**
 * 前端视图卡片与列表渲染引擎
 *
 * 核心功能：
 * - 渲染【对话历史】会话卡片（严格对齐 panel.css 样式类名）
 * - 渲染【方案计划】工件卡片（支持单件下载、全部导出、源目录定位与删除）
 * - 日期与工作区分组智能折叠与按需渲染
 * - 批量模式复选框动态注入与选中边框高亮联动
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { esc, stripFileUri, toWinPath, formatTime } = window.AG_Utils;

  function renderList() {
    const listContainer = document.getElementById('list-container');
    const statsBar = document.getElementById('stats-bar');
    if (!listContainer) {
      return;
    }

    const state = window.AG_State;
    if (state.activeTab === 'plans') {
      renderPlansList();
      return;
    }

    renderExportPathBar();

    const entries = Object.entries(state.conversations || {});
    if (entries.length === 0) {
      listContainer.innerHTML = getEmptyStateHtml();
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
        const sum = (info.summary || '').toLowerCase();
        const ws = (info.workspaces || [])
          .map((w) => (w.workspaceFolderAbsoluteUri || '').toLowerCase())
          .join(' ');
        return sum.includes(query) || id.toLowerCase().includes(query) || ws.includes(query);
      });
    }

    // 统计条文案
    if (statsBar) {
      if (filtered.length !== entries.length) {
        statsBar.textContent = t('totalConversations', filtered.length, entries.length);
      } else {
        statsBar.textContent = t('totalCountOnly', entries.length);
      }
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = getNoResultsHtml(query);
      return;
    }

    renderGroups(filtered);
    if (window.AG_Batch) {
      window.AG_Batch.updateBatchBar();
    }
  }

  function renderGroups(entries) {
    const listContainer = document.getElementById('list-container');
    const state = window.AG_State;
    const groups = state.groupBy === 'workspace' ? groupByWorkspace(entries) : groupByDate(entries);
    let html = '';

    for (const [groupLabel, items] of groups) {
      const isCollapsed = state.collapsedGroups.has(groupLabel);
      const arrow = isCollapsed ? '&#x25B6;' : '&#x25BC;';

      html += `<div class="date-group" data-group="${esc(groupLabel)}">`;
      html += `
        <div class="date-group-header" data-group="${esc(groupLabel)}">
          <span class="group-arrow">${arrow}</span>
          <span class="date-group-label">${esc(groupLabel)}</span>
          <span class="date-group-count">(${items.length})</span>
        </div>
      `;

      html += `<div class="group-items ${isCollapsed ? 'collapsed' : ''}">`;
      if (!isCollapsed) {
        for (const [cid, info] of items) {
          html += renderCard(cid, info);
        }
      }
      html += `</div></div>`;
    }

    listContainer.innerHTML = html;
  }

  function renderCard(cascadeId, info) {
    const state = window.AG_State;
    const title = info.summary || t('unnamedConv');
    const stepCount = info.stepCount !== undefined ? info.stepCount : '?';
    const time = formatTime(info.lastModifiedTime || info.createdTime);
    const status = info.status || '';
    const statusDot = getStatusDot(status);
    const isSelected = state.selectedConvIds.has(cascadeId);

    const workspaces = (info.workspaces || [])
      .map((w) => w.workspaceFolderAbsoluteUri)
      .filter(Boolean);
    const wsPath = workspaces.length > 0 ? workspaces[0] : '';
    const wsDisplay = toWinPath(stripFileUri(wsPath));
    const wsTooltip = t('openFolderTooltip', wsDisplay);
    const wsHtml = wsPath
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(wsPath)}" title="${esc(wsTooltip)}"><span class="tag-label">[工作区]</span> ${esc(wsDisplay)}</div>`
      : '';

    const convDataTooltip = t('openConvDataTooltip', state.convDataDir ? toWinPath(state.convDataDir) : '');
    const convFileHtml = state.convDataDir
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(state.convDataDir)}" title="${esc(convDataTooltip)}"><span class="tag-label">[存储]</span> ${esc(cascadeId)}</div>`
      : '';

    const checkboxHtml = state.isBatchMode
      ? `<div class="conv-checkbox-wrapper"><input type="checkbox" class="conv-checkbox" data-checkbox-id="${esc(cascadeId)}" ${isSelected ? 'checked' : ''}></div>`
      : '';

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

  function renderPlansList() {
    const listContainer = document.getElementById('list-container');
    const statsBar = document.getElementById('stats-bar');
    const state = window.AG_State;

    renderExportPathBar();

    const plans = state.plans || [];
    if (plans.length === 0) {
      listContainer.innerHTML = getEmptyPlansStateHtml();
      if (statsBar) {
        statsBar.textContent = '';
      }
      return;
    }

    let filtered = plans;
    const query = (state.searchQuery || '').toLowerCase().trim();
    if (query) {
      filtered = plans.filter((p) => {
        const title = (p.title || '').toLowerCase();
        const ws = (p.workspacePath || '').toLowerCase();
        const id = (p.id || '').toLowerCase();
        return title.includes(query) || ws.includes(query) || id.includes(query);
      });
    }

    if (statsBar) {
      if (filtered.length !== plans.length) {
        statsBar.textContent = t('totalPlans', filtered.length, plans.length);
      } else {
        statsBar.textContent = t('totalPlansCountOnly', plans.length);
      }
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = getNoResultsHtml(query);
      return;
    }

    let html = '<div class="plans-list">';
    for (const plan of filtered) {
      html += renderPlanCard(plan);
    }
    html += '</div>';

    listContainer.innerHTML = html;
    if (window.AG_Batch) {
      window.AG_Batch.updateBatchBar();
    }
  }

  function renderPlanCard(plan) {
    const state = window.AG_State;
    const title = plan.title || t('unnamedPlan');
    const time = formatTime(plan.lastModifiedTime);
    const wsDisplay = plan.workspacePath ? toWinPath(plan.workspacePath) : t('noWorkspace');
    const wsTooltip = t('openFolderTooltip', wsDisplay);
    const isSelected = state.selectedPlanIds.has(plan.id);

    const wsHtml = plan.workspacePath
      ? `<div class="conv-workspace" data-action="openFolder" data-path="${esc(plan.workspacePath)}" title="${esc(wsTooltip)}"><span class="tag-label">[工作区]</span> ${esc(wsDisplay)}</div>`
      : `<div class="conv-workspace" style="color:var(--vscode-descriptionForeground)"><span class="tag-label">[工作区]</span> ${esc(wsDisplay)}</div>`;

    // 渲染工件徽章
    let badgesHtml = '<div class="artifact-badge-group">';
    for (const art of plan.artifacts || []) {
      const isMain = art.fileName === 'implementation_plan.md';
      const tooltip = t('saveArtifactTooltip', art.label, art.fileName);
      badgesHtml += `<button class="artifact-badge ${isMain ? 'primary' : ''}" data-action="exportPlanSingle" data-plan-id="${esc(plan.id)}" data-file-name="${esc(art.fileName)}" title="${esc(tooltip)}"><span class="badge-icon">&#x2193;</span> ${esc(art.label)} (${esc(art.fileName)})</button>`;
    }
    badgesHtml += '</div>';

    const checkboxHtml = state.isBatchMode
      ? `<div class="conv-checkbox-wrapper"><input type="checkbox" class="conv-checkbox" data-checkbox-plan-id="${esc(plan.id)}" ${isSelected ? 'checked' : ''}></div>`
      : '';

    return `
      <div class="conv-card plan-card ${state.isBatchMode ? 'batch-selectable' : ''} ${isSelected ? 'selected' : ''}" data-plan-id="${esc(plan.id)}">
        ${checkboxHtml}
        <div class="conv-icon"><span class="status-dot active">&#x25CF;</span></div>
        <div class="conv-info">
          <div class="conv-title" style="font-weight:600;font-size:14px;" title="${esc(title)}">${esc(title)}</div>
          <div class="conv-meta">${time} · ID: ${esc(plan.id.slice(0, 8))}...</div>
          ${wsHtml}
          ${badgesHtml}
        </div>
        <div class="conv-actions">
          <button class="btn btn-primary btn-sm" data-action="exportPlanSingle" data-plan-id="${esc(plan.id)}" data-file-name="implementation_plan.md" title="${esc(t('savePlanTooltip'))}">${esc(t('savePlanBtn'))}</button>
          <button class="btn btn-secondary btn-sm" data-action="exportPlanAll" data-plan-id="${esc(plan.id)}" title="${esc(t('saveAllArtifactsTooltip'))}">${esc(t('saveAllArtifactsBtn'))}</button>
          <button class="btn-export" data-action="openPlanFolder" data-path="${esc(plan.dirPath)}" title="${esc(t('openPlanSourceTooltip'))}">${esc(t('openSourceFolderBtn'))}</button>
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

  function getStatusDot(status) {
    if (status === 'STATUS_ACTIVE' || status === 'active' || status === 'CASCADE_RUN_STATUS_RUNNING') {
      return '<span class="status-dot active">&#x25CF;</span>';
    }
    if (status === 'STATUS_COMPLETED' || status === 'completed') {
      return '<span class="status-dot completed">&#x25CF;</span>';
    }
    return '<span class="status-dot idle">&#x25CF;</span>';
  }

  function dateKey(d) {
    if (!d || isNaN(d.getTime())) {
      return 'earlier';
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function groupByDate(entries) {
    const now = new Date();
    const todayStr = dateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateKey(yesterday);
    const groups = new Map();

    entries.sort((a, b) => {
      const ta = a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const ts = entry[1].lastModifiedTime || entry[1].createdTime;
      let label = t('timeEarlier');
      if (ts) {
        try {
          const d = new Date(ts);
          const dk = dateKey(d);
          if (dk === todayStr) {
            label = t('timeToday');
          } else if (dk === yesterdayStr) {
            label = t('timeYesterday');
          } else {
            label = dk;
          }
        } catch {
          label = t('timeEarlier');
        }
      }
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label).push(entry);
    }
    return groups;
  }

  function groupByWorkspace(entries) {
    const groups = new Map();
    entries.sort((a, b) => {
      const ta = a[1].lastModifiedTime || a[1].createdTime || '';
      const tb = b[1].lastModifiedTime || b[1].createdTime || '';
      return tb.localeCompare(ta);
    });

    for (const entry of entries) {
      const info = entry[1];
      const workspaces = (info.workspaces || [])
        .map((w) => w.workspaceFolderAbsoluteUri)
        .filter(Boolean);
      const wsPath = workspaces.length > 0 ? workspaces[0] : '';
      const wsDisplay = wsPath ? toWinPath(stripFileUri(wsPath)) : t('noWorkspace');

      if (!groups.has(wsDisplay)) {
        groups.set(wsDisplay, []);
      }
      groups.get(wsDisplay).push(entry);
    }
    return groups;
  }

  function getEmptyStateHtml() {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">&#x1F4AC;</div>
        <div class="empty-state-title">${t('emptyTitle')}</div>
        <div class="empty-state-desc">${t('emptyDesc')}</div>
      </div>
    `;
  }

  function getEmptyPlansStateHtml() {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">&#x1F4DD;</div>
        <div class="empty-state-title">${t('emptyPlanTitle')}</div>
        <div class="empty-state-desc">${t('emptyPlanDesc')}</div>
      </div>
    `;
  }

  function getNoResultsHtml(query) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">&#x1F50D;</div>
        <div class="empty-state-title">${t('noResultsTitle', esc(query))}</div>
        <div class="empty-state-desc">${t('noResultsDesc')}</div>
      </div>
    `;
  }

  window.AG_Renderer = {
    renderList,
    renderPlansList,
    renderExportPathBar,
    renderCard,
    renderPlanCard,
  };
})(window);
