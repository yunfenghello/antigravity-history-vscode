const os = require('os');
const path = require('path');
const fs = require('fs');

// 加载编译后的 bundle
const panelJsPath = path.join(__dirname, '..', 'dist', 'webview', 'panel.js');
const code = fs.readFileSync(panelJsPath, 'utf-8');

// 构建 Mock 环境
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
    options: [{ text: '', value: '' }, { text: '', value: '' }, { text: '', value: '' }],
    getAttribute(name) { return this.attributes.get(name) || null; },
    setAttribute(name, val) { this.attributes.set(name, String(val)); },
    removeAttribute(name) { this.attributes.delete(name); },
    hasAttribute(name) { return this.attributes.has(name); },
    addEventListener(evt, fn) {
      if (!this.listeners.has(evt)) this.listeners.set(evt, []);
      this.listeners.get(evt).push(fn);
    },
    querySelector(sel) { return el; },
    querySelectorAll(sel) { return []; },
    closest(sel) { return el; },
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
for (const id of ids) createElement('div', id);

const mockDoc = {
  readyState: 'complete',
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElement('div', id));
    return elements.get(id);
  },
  createElement(tag) { return createElement(tag); },
  querySelector(sel) { return createElement('div'); },
  querySelectorAll(sel) { return []; },
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
global.acquireVsCodeApi = () => ({ postMessage() {} });

// 执行 panel.js
eval(code);

// 读取真实缓存中的会话
const home = os.homedir();
const cachePath = path.join(home, '.gemini', 'antigravity_history_cache.json');
let realConversations = {};
if (fs.existsSync(cachePath)) {
  realConversations = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
}
console.log('读取到真实会话数量:', Object.keys(realConversations).length);

// 模拟向前端投递真实会话
const messageHandlers = global.window.listeners.get('message') || [];
console.log('开始投递真实会话数据...');
for (const fn of messageHandlers) {
  fn({
    data: {
      command: 'setConversations',
      data: realConversations,
      convDir: path.join(home, '.gemini', 'antigravity', 'conversations'),
    }
  });
}

const listContainerEl = mockDoc.getElementById('list-container');
console.log('渲染后 listContainer HTML 长度:', listContainerEl.innerHTML.length);
console.log('渲染后 statsBar 文本:', mockDoc.getElementById('stats-bar').textContent);
console.log('渲染输出截取前 300 字符:');
console.log(listContainerEl.innerHTML.slice(0, 300));
