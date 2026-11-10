// @ts-nocheck
/**
 * 前端模块统一聚合引导入口 (向后兼容层)
 *
 * 说明：前端逻辑已全量解耦重构至 js/ 子目录下：
 * - js/i18n.js: 双语国际化词典与动态翻译
 * - js/utils.js: 纯工具函数、路径清洗与状态气泡
 * - js/state.js: 前端单一状态树 (Single Source of Truth)
 * - js/render-cards.js: 高性能卡片视图与工件列表渲染器
 * - js/batch-manager.js: 批量选择状态机与批量删除调度
 * - js/main.js: 前端应用程序主控制器与事件委托中枢
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

// 若在单脚本兼容环境中运行，提示模块化已就绪
console.debug('Antigravity History 模块化前端架构已加载。');
