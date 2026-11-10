// @ts-nocheck
/**
 * 前端视图卡片与列表渲染引擎
 *
 * 核心功能：
 * - 渲染【对话历史】会话卡片（日期/工作区分组、复选框多选状态联动）
 * - 渲染【方案计划】工件卡片（各工件单独另存为、全部工件导出与源目录打开）
 * - 智能折叠分组与按需惰性渲染，降低 DOM 节点数与计算开销
 * - 状态圆点、空状态提示与检索高亮呈现
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

(function (window) {
  const t = (k, ...args) => (window.AG_I18N ? window.AG_I18N.t(k, ...args) : k);
  const { esc, stripFileUri, toWinPath, dateKey, formatTime } = window.AG_Utils;

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

    const entries = Object.entries(state.conversations);
    if (entries.length === 0) {
      listContainer.innerHTML = getEmptyStateHtml();
      if (statsBar) {
        statsBar.textContent = '';
      }
      return;
    }

    // 过滤检索
    let filtered = entries;
    const query = state.searchQuery.toLowerCase().trim();
    if (query) {
      filtered = entries.filter(([id, info]) => {
        const sum = (info.summary || '').toLowerCase();
        const ws = (info.workspaces || [])
          .map((w) => (w.workspaceFolderAbsoluteUri || '').toLowerCase())
          .join(' ');
        return sum.includes(query) || id.toLowerCase().includes(query) || ws.includes(query);
      });
    }

    // 状态统计信息
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
    for (const group of groups) {
      const isCollapsed = state.collapsedGroups.has(group.key);
      const count = group.items.length;

      html += `
        <div class="group-header ${isCollapsed ? 'collapsed' : ''}" data-group-key="${esc(group.key)}">
          <span class="group-arrow">&#x25BC;</span>
          <span class="group-title">${esc(group.label)}</span>
          <span class="group-count">(${count})</span>
        </div>
      `;

      if (!isCollapsed) {
        html += '<div class="group-items">';
        for (const [id, info] of group.items) {
          html += renderCard(id, info);
        }
        html += '</div>';
      }
    }

    listContainer.innerHTML = html;
  }

  function renderCard(cascadeId, info) {
    const state = window.AG_State;
    const rawTitle = info.summary || t('unnamedConv');
    const title = esc(rawTitle);
    const steps = info.stepCount !== undefined ? info.stepCount : '?';
    const status = info.status || 'unknown';
    const statusDot = getStatusDot(status);

    const timeStr = info.lastModifiedTime || info.lastUserInputTime || info.createdTime;
    const timeFormatted = timeStr ? formatTime(timeStr) : '';

    let workspaceName = '';
    let workspaceFullPath = '';
    if (info.workspaces && info.workspaces.length > 0) {
      const rawUri = info.workspaces[0].workspaceFolderAbsoluteUri || '';
      workspaceFullPath = stripFileUri(rawUri);
      workspaceName = workspaceFullPath.split(/[\\\/]/).filter(Boolean).pop() || '';
    }

    const isSelected = state.selectedConvIds.has(cascadeId);
    const cardSelectedClass = isSelected ? 'selected' : '';
    const checkboxCheckedAttr = isSelected ? 'checked' : '';

    return `
      <div class="card ${cardSelectedClass}" data-cascade-id="${esc(cascadeId)}" data-title="${esc(rawTitle)}">
        <div class="card-selection ${state.isBatchMode ? 'visible' : ''}">
          <input type="checkbox" class="card-checkbox" data-checkbox-id="${esc(cascadeId)}" ${checkboxCheckedAttr}>
        </div>
        <div class="card-main">
          <div class="card-header">
            ${statusDot}
            <span class="card-title" title="${title}">${title}</span>
            <span class="card-steps">${steps} ${t('stepsUnit')}</span>
            ${timeFormatted ? `<span class="card-time">${timeFormatted}</span>` : ''}
          </div>
          <div class="card-meta">
            <span class="card-id" title="${t('copyIdTooltip')}" data-action="copy-id">${esc(cascadeId.slice(0, 8))}...</span>
            ${
              workspaceName
                ? `<span class="card-workspace clickable" data-action="open-folder" data-path="${esc(workspaceFullPath)}" title="${t('openFolderTooltip', workspaceFullPath)}">
                    ${esc(workspaceName)}
                  </span>`
                : `<span class="card-workspace card-workspace-none">${t('noWorkspace')}</span>`
            }
            ${
              state.convDataDir
                ? `<span class="card-storage-link clickable" data-action="open-conv-dir" data-cid="${esc(cascadeId)}" title="${t('openConvDataTooltip', state.convDataDir)}">
                    &#x1F4C1; ${t('openPath')}
                  </span>`
                : ''
            }
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-icon-sm" data-action="export-md" title="${t('exportMdTooltip')}">MD</button>
          <button class="btn btn-icon-sm" data-action="export-json" title="${t('exportJsonTooltip')}">JSON</button>
          <button class="btn btn-icon-sm btn-danger" data-action="delete-conv" title="${t('deleteConvTooltip')}">${t('deleteBtn')}</button>
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
    const query = state.searchQuery.toLowerCase().trim();
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
    const rawTitle = plan.title || t('unnamedPlan');
    const title = esc(rawTitle);
    const artifactsCount = plan.artifacts ? plan.artifacts.length : 0;
    const timeFormatted = plan.lastModifiedTime ? formatTime(plan.lastModifiedTime) : '';

    let workspaceName = '';
    let workspaceFullPath = '';
    if (plan.workspacePath) {
      workspaceFullPath = plan.workspacePath;
      workspaceName = workspaceFullPath.split(/[\\\/]/).filter(Boolean).pop() || '';
    }

    let artifactPillsHtml = '';
    if (plan.artifacts && plan.artifacts.length > 0) {
      artifactPillsHtml = '<div class="plan-artifact-pills">';
      for (const a of plan.artifacts) {
        const sizeKb = Math.round(a.size / 1024);
        artifactPillsHtml += `
          <button class="artifact-pill" data-action="export-plan-single" data-plan-id="${esc(plan.id)}" data-file-name="${esc(a.fileName)}" title="${t('saveArtifactTooltip', a.label, sizeKb + 'KB')}">
            ${esc(a.label)} <span class="pill-size">${sizeKb}KB</span>
          </button>
        `;
      }
      artifactPillsHtml += '</div>';
    }

    const isSelected = state.selectedPlanIds.has(plan.id);
    const cardSelectedClass = isSelected ? 'selected' : '';
    const checkboxCheckedAttr = isSelected ? 'checked' : '';

    return `
      <div class="card plan-card ${cardSelectedClass}" data-plan-id="${esc(plan.id)}" data-title="${esc(rawTitle)}">
        <div class="card-selection ${state.isBatchMode ? 'visible' : ''}">
          <input type="checkbox" class="card-checkbox" data-checkbox-id="${esc(plan.id)}" ${checkboxCheckedAttr}>
        </div>
        <div class="card-main">
          <div class="card-header">
            <span class="status-dot dot-active"></span>
            <span class="card-title" title="${title}">${title}</span>
            <span class="card-steps">${artifactsCount} 份工件</span>
            ${timeFormatted ? `<span class="card-time">${timeFormatted}</span>` : ''}
          </div>
          <div class="card-meta">
            <span class="card-id" title="${t('copyIdTooltip')}" data-action="copy-id" data-cid="${esc(plan.id)}">${esc(plan.id.slice(0, 8))}...</span>
            ${
              workspaceName
                ? `<span class="card-workspace clickable" data-action="open-folder" data-path="${esc(workspaceFullPath)}" title="${t('openFolderTooltip', workspaceFullPath)}">
                    ${esc(workspaceName)}
                  </span>`
                : `<span class="card-workspace card-workspace-none">${t('noWorkspace')}</span>`
            }
            ${
              plan.dirPath
                ? `<span class="card-storage-link clickable" data-action="open-plan-folder" data-path="${esc(plan.dirPath)}" title="${t('openPlanSourceTooltip')}">
                    &#x1F4C2; ${t('openSourceFolderBtn')}
                  </span>`
                : ''
            }
          </div>
          ${artifactPillsHtml}
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" data-action="export-plan-single" data-plan-id="${esc(plan.id)}" title="${t('savePlanTooltip')}">
            ${t('savePlanBtn')}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="export-plan-all" data-plan-id="${esc(plan.id)}" title="${t('saveAllArtifactsTooltip')}">
            ${t('saveAllArtifactsBtn')}
          </button>
          <button class="btn btn-icon-sm btn-danger" data-action="delete-plan" data-plan-id="${esc(plan.id)}" title="${t('deletePlanTooltip')}">
            ${t('deleteBtn')}
          </button>
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
    const s = (status || '').toLowerCase();
    if (s.includes('active') || s.includes('running')) {
      return '<span class="status-dot dot-active"></span>';
    }
    if (s.includes('error') || s.includes('fail')) {
      return '<span class="status-dot dot-error"></span>';
    }
    return '<span class="status-dot dot-completed"></span>';
  }

  function groupByDate(entries) {
    const groups = { today: [], yesterday: [], earlier: [] };
    for (const entry of entries) {
      const info = entry[1];
      const timeStr = info.lastModifiedTime || info.lastUserInputTime || info.createdTime;
      const d = timeStr ? new Date(timeStr) : null;
      const k = dateKey(d);
      groups[k].push(entry);
    }
    const result = [];
    if (groups.today.length > 0) {
      result.push({ key: 'today', label: t('timeToday'), items: groups.today });
    }
    if (groups.yesterday.length > 0) {
      result.push({ key: 'yesterday', label: t('timeYesterday'), items: groups.yesterday });
    }
    if (groups.earlier.length > 0) {
      result.push({ key: 'earlier', label: t('timeEarlier'), items: groups.earlier });
    }
    return result;
  }

  function groupByWorkspace(entries) {
    const map = new Map();
    for (const entry of entries) {
      const info = entry[1];
      let wsName = t('noWorkspace');
      if (info.workspaces && info.workspaces.length > 0) {
        const rawUri = info.workspaces[0].workspaceFolderAbsoluteUri || '';
        const clean = stripFileUri(rawUri);
        const name = clean.split(/[\\\/]/).filter(Boolean).pop();
        if (name) {
          wsName = name;
        }
      }
      if (!map.has(wsName)) {
        map.set(wsName, []);
      }
      map.get(wsName).push(entry);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      key: `ws_${name}`,
      label: name,
      items,
    }));
  }

  function getEmptyStateHtml() {
    return `
      <div class="empty-state">
        <div class="empty-icon">&#x1F4AC;</div>
        <div class="empty-title">${t('emptyTitle')}</div>
        <div class="empty-desc">${t('emptyDesc')}</div>
      </div>
    `;
  }

  function getEmptyPlansStateHtml() {
    return `
      <div class="empty-state">
        <div class="empty-icon">&#x1F4DD;</div>
        <div class="empty-title">${t('emptyPlanTitle')}</div>
        <div class="empty-desc">${t('emptyPlanDesc')}</div>
      </div>
    `;
  }

  function getNoResultsHtml(query) {
    return `
      <div class="empty-state">
        <div class="empty-icon">&#x1F50D;</div>
        <div class="empty-title">${t('noResultsTitle', esc(query))}</div>
        <div class="empty-desc">${t('noResultsDesc')}</div>
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

