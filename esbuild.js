// @ts-check
const esbuild = require('esbuild');
const { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Copy and bundle webview assets (HTML/CSS/JS) to dist/ */
function copyWebviewAssets() {
  const src = join(__dirname, 'src', 'webview', 'assets');
  const dest = join(__dirname, 'dist', 'webview');
  mkdirSync(dest, { recursive: true });

  // 1. 复制 CSS 样式表
  const cssSrc = join(src, 'panel.css');
  const cssDest = join(dest, 'panel.css');
  if (existsSync(cssSrc)) {
    cpSync(cssSrc, cssDest);
  }

  // 2. 复制 js 目录（保留各源码微模块副本供调试）
  const jsSrcDir = join(src, 'js');
  const jsDestDir = join(dest, 'js');
  if (existsSync(jsSrcDir)) {
    mkdirSync(jsDestDir, { recursive: true });
    cpSync(jsSrcDir, jsDestDir, { recursive: true });
  }

  // 3. 聚合编译输出单个生产级 panel.js，保证确定性依赖顺序与零网络竞态
  const orderedModules = [
    'i18n.js',
    'utils.js',
    'state.js',
    'render-cards.js',
    'batch-manager.js',
    'view-controller.js',
    'main.js',
  ];

  let bundleContent = '/* Antigravity History Webview Client Bundle */\n';
  for (const modName of orderedModules) {
    const modPath = join(jsSrcDir, modName);
    if (existsSync(modPath)) {
      bundleContent += `\n/* ── Module: ${modName} ── */\n`;
      bundleContent += readFileSync(modPath, 'utf-8') + '\n';
    } else {
      console.warn(`[bundleWebview] 警告: 未找到微模块 ${modName}`);
    }
  }

  const bundleDest = join(dest, 'panel.js');
  writeFileSync(bundleDest, bundleContent, 'utf-8');
  console.log('[bundleWebview] 成功编译生成生产级单文件: dist/webview/panel.js');
}

/**
 * Post-build: obfuscate the bundled JS for production releases.
 * This makes reverse-engineering the LS discovery and API logic very difficult.
 */
function obfuscateBundle() {
  const JavaScriptObfuscator = require('javascript-obfuscator');
  const bundlePath = join(__dirname, 'dist', 'extension.js');
  const code = readFileSync(bundlePath, 'utf-8');

  console.log('[obfuscate] Starting deep obfuscation...');
  const result = JavaScriptObfuscator.obfuscate(code, {
    // --- Control flow (DISABLED - breaks async/await in Node.js) ---
    controlFlowFlattening: false,
    deadCodeInjection: false,

    // --- String protection (CORE - hides API paths, method names) ---
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 0.75,
    splitStrings: false,

    // --- Identifier mangling ---
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,  // keep module.exports intact

    // --- Anti-debug (DISABLED - crashes in VS Code) ---
    selfDefending: false,
    debugProtection: false,

    // --- Misc ---
    transformObjectKeys: false,  // can break dynamic key access
    unicodeEscapeSequence: false,
    compact: true,
    simplify: true,

    // --- Target ---
    target: 'node',
  });

  writeFileSync(bundlePath, result.getObfuscatedCode());
  console.log('[obfuscate] Done. Bundle protected.');
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    legalComments: production ? 'none' : 'inline',
    drop: production ? ['debugger'] : [],
  });

  copyWebviewAssets();

  if (watch) {
    await ctx.watch();
    console.log('[watch] Build started...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();

    // Production: apply deep obfuscation after esbuild
    if (production) {
      // TEMP: disabled for testing
      // obfuscateBundle();
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

