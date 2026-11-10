/**
 * 完整模拟真实数据在 panel.js 中的运行流程
 */
const fs = require('fs');
const path = require('path');

// 读取真实的 cache.json
const os = require('os');
const cachePath = path.join(os.homedir(), '.gemini', 'antigravity-history', 'cache.json');
let cacheData = {};
if (fs.existsSync(cachePath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    cacheData = raw.conversations || {};
  } catch (e) {
    console.error('读取缓存失败:', e);
  }
}

console.log('读取到真实缓存项数:', Object.keys(cacheData).length);

// 读取打包后的 panel.js
const panelJsPath = path.join(__dirname, '..', 'dist', 'webview', 'panel.js');
const panelJsCode = fs.readFileSync(panelJsPath, 'utf8');

// 构建 DOM 环境
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
      if (sel === '.export-path-value') return createElement('span');
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
  documentElement: { lang: 'zh-CN' },
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

global.window = global;
global.window.listeners = new Map();
global.window.addEventListener = (evt, fn) => {
  if (!global.window.listeners.has(evt)) global.window.listeners.set(evt, []);
  global.window.listeners.get(evt).push(fn);
};
global.document = mockDoc;
global.acquireVsCodeApi = () => ({
  postMessage(msg) {
    console.log('[VS Code IPC 收到消息]:', msg.command);
  },
});

console.log('=== 执行 panel.js ===');
eval(panelJsCode);
console.log('执行 panel.js 完成，当前 listContainer 内容包含 loadingText?', mockDoc.getElementById('list-container').innerHTML.includes('正在扫描'));

const messageHandlers = global.window.listeners.get('message') || [];
function postMsg(data) {
  const evt = { data };
  for (const fn of messageHandlers) {
    fn(evt);
  }
}

console.log('\n=== 模拟发送真实数据 ===');
try {
  postMsg({ command: 'setLanguage', language: 'zh-CN' });
  postMsg({ command: 'setConversations', data: cacheData, convDir: 'C:\\test' });
  postMsg({ command: 'setExportPath', path: 'e:\\ceshi' });
} catch (e) {
  console.error('发送数据时发生异常:', e);
}

const listContainer = mockDoc.getElementById('list-container');
console.log('setConversations 之后 listContainer.innerHTML 长度:', listContainer.innerHTML.length);
console.log('listContainer 是否仍是 loading:', listContainer.innerHTML.includes('正在扫描'));
console.log('statsBar 内容:', mockDoc.getElementById('stats-bar').textContent);
console.log('export-path-bar 内容:', mockDoc.getElementById('export-path-bar').innerHTML);
