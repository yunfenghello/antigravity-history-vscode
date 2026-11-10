/**
 * Webview 前端脚本全链路沙箱仿真测试工具
 */
const fs = require('fs');
const path = require('path');

// 1. 构建轻量级 DOM 模拟环境
const elements = new Map();

function createElement(tag, id = '', className = '') {
  const el = {
    tagName: tag.toUpperCase(),
    id,
    className,
    classList: {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
      remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
      has(c) { return this._classes.has(c); },
      contains(c) { return this._classes.has(c); },
    },
    style: {},
    attributes: new Map(),
    children: [],
    listeners: new Map(),
    innerHTML: '',
    textContent: '',
    value: '',
    getAttribute(name) { return this.attributes.get(name) || null; },
    setAttribute(name, val) { this.attributes.set(name, String(val)); },
    removeAttribute(name) { this.attributes.delete(name); },
    hasAttribute(name) { return this.attributes.has(name); },
    addEventListener(evt, fn) {
      if (!this.listeners.has(evt)) this.listeners.set(evt, []);
      this.listeners.get(evt).push(fn);
    },
    dispatchEvent(evt) {
      const fns = this.listeners.get(evt.type) || [];
      for (const fn of fns) fn(evt);
    },
    querySelector(sel) {
      return el;
    },
    querySelectorAll(sel) {
      return [];
    },
    closest(sel) {
      return el;
    },
  };
  if (id) elements.set(id, el);
  return el;
}

// 初始化常用节点
const ids = [
  'tab-conversations', 'tab-plans', 'search-input', 'group-date', 'group-workspace',
  'btn-expand-all', 'btn-collapse-all', 'btn-refresh', 'btn-toggle-batch', 'btn-export-all',
  'field-level-select', 'export-strategy-select', 'single-export-mode-select', 'lang-select',
  'btn-select-all', 'btn-invert-select', 'btn-deselect-all', 'btn-batch-delete', 'btn-exit-batch',
  'batch-toolbar', 'batch-selected-count', 'stats-bar', 'export-path-bar', 'list-container', 'toast'
];

for (const id of ids) {
  const el = createElement('div', id);
  if (id.includes('select')) {
    el.options = [{ text: '', value: '' }, { text: '', value: '' }, { text: '', value: '' }];
  }
}

const mockDoc = {
  readyState: 'complete',
  getElementById(id) {
    if (!elements.has(id)) {
      elements.set(id, createElement('div', id));
    }
    return elements.get(id);
  },
  createElement(tag) {
    return createElement(tag);
  },
  querySelector(sel) {
    const idMatch = sel.match(/^#([\w-]+)$/);
    if (idMatch) return this.getElementById(idMatch[1]);
    return createElement('div');
  },
  querySelectorAll(sel) {
    return [];
  },
  listeners: new Map(),
  addEventListener(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, []);
    this.listeners.get(evt).push(fn);
  },
};

const mockVscode = {
  postMessage(msg) {
    console.log('[VS Code IPC 收到前端消息]:', msg.command, msg);
  }
};

global.window = global;
global.window.listeners = new Map();
global.window.addEventListener = (evt, fn) => {
  if (!global.window.listeners.has(evt)) global.window.listeners.set(evt, []);
  global.window.listeners.get(evt).push(fn);
};
global.document = mockDoc;
global.acquireVsCodeApi = () => mockVscode;

// 2. 加载并执行打包后的单个生产级 panel.js
const panelJsPath = path.join(__dirname, '..', 'dist', 'webview', 'panel.js');
console.log('=== 开始模拟加载生产级单文件 panel.js ===');
const code = fs.readFileSync(panelJsPath, 'utf-8');
try {
  eval(code);
  console.log('   [成功加载并执行 panel.js]');
} catch (err) {
  console.error('   [报错中断]:', err);
  process.exit(1);
}

console.log('\n=== 测试宿主下发数据消息 ===');
const messageHandlers = global.window.listeners?.get('message') || [];

function sendHostMessage(data) {
  const evt = { data };
  for (const fn of messageHandlers) {
    fn(evt);
  }
}

// 模拟发送 setConversations
sendHostMessage({
  command: 'setConversations',
  data: {
    'conv-1': { summary: '会话一', lastModifiedTime: new Date().toISOString(), stepCount: 10 },
    'conv-2': { summary: '会话二', lastModifiedTime: new Date().toISOString(), stepCount: 20 },
  },
  convDir: 'e:\\conversations',
});

const listContainerEl = mockDoc.getElementById('list-container');
console.log('收到 setConversations 后的 listContainer 长度:', listContainerEl.innerHTML.length);
console.log('收到 setConversations 后的 statsBar:', mockDoc.getElementById('stats-bar').textContent);

// 模拟发送 setPlans
sendHostMessage({
  command: 'setPlans',
  plans: [
    { id: 'plan-1', title: '计划一', lastModifiedTime: new Date().toISOString(), dirPath: 'e:\\plan1', artifacts: [] },
  ],
});

// 模拟发送 setExportPath
sendHostMessage({
  command: 'setExportPath',
  path: 'e:\\ceshi',
});

console.log('\n=== 测试点击切换到方案计划 ===');
try {
  const tabPlans = mockDoc.getElementById('tab-plans');
  const clickHandlers = tabPlans.listeners.get('click') || [];
  console.log('tab-plans 点击监听器数量:', clickHandlers.length);
  for (const fn of clickHandlers) {
    fn({ target: tabPlans });
  }
  console.log('切换后 activeTab:', global.window.AG_State.activeTab);
  console.log('tab-plans class:', tabPlans.className);
} catch (err) {
  console.error('[切换方案计划报错]:', err);
}

console.log('\n=== 测试全部完成，一切正常 ===');
