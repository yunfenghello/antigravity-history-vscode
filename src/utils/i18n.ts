/**
 * 国际化多语言管理模块 (i18n)
 *
 * 核心功能：
 * - 集中管理 Antigravity History 插件端（后端）与导出报告的中英文双语词典
 * - 提供类型安全的翻译函数及参数占位符格式化支持
 * - 支持根据用户配置与运行环境动态解析当前显示语言
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as vscode from 'vscode';

export type Language = 'zh-CN' | 'en';

export const DEFAULT_LANGUAGE: Language = 'zh-CN';

/**
 * 插件核心中英文消息词典
 */
export const messages: Record<Language, Record<string, string>> = {
  'zh-CN': {
    'statusBar.tooltip': '打开 Antigravity 历史记录',
    'panel.title': 'Antigravity History',
    'common.invalidPath': '无效的目录路径',
    'common.pathNotExistTryParent': '目标路径不存在: {0}，将尝试打开其父目录',
    'common.pathNotExist': '指定的路径不存在: {0}',
    'common.cannotOpenExplorer': '无法在资源管理器中打开目录: {0}',
    'common.copiedToClipboard': '会话 ID 已复制到剪贴板',
    'dialog.selectExportFolder': '选择导出目录',
    'dialog.save': '保存',
    'dialog.saveTitle': '保存对话导出 ({0})',
    'dialog.savePlanTitle': '另存方案文档 ({0})',
    'filter.json': 'JSON 数据 (*.json)',
    'filter.markdown': 'Markdown 文档 (*.md)',
    'discovery.waiting': '正在等待 LanguageServer 发现完成...',
    'discovery.noEndpoint': '未发现可用的 LanguageServer 终端，请确认 Antigravity 正在运行',
    'export.noConversations': '当前没有可导出的会话，请先刷新重试',
    'export.batchTitle': '正在导出全部会话',
    'export.singleSuccess': '已成功导出 [{0}] 至 {1}',
    'export.success': '已成功导出 {0} 个会话 ({1} 个失败) 至 {2}',
    'export.openFile': '打开文件',
    'export.openContainingFolder': '打开所在文件夹',
    'export.openFolder': '打开文件夹',
    'export.individualHint': '请在面板中使用导出按钮导出单个会话。',
    'export.modeTitle': '单条导出模式',
    'export.modeDialog': '另存为弹窗',
    'export.modeDirect': '直接保存',
    'plan.notFound': '未找到指定的方案计划记录',
    'plan.artifactNotFound': '方案工件文件不存在: {0}',
    'plan.exportSingleSuccess': '已成功另存方案 [{0}] 至: {1}',
    'plan.exportAllSuccess': '已成功导出 {0} 个方案工件至: {1}',
    'report.title': '  导出报告 (EXPORT REPORT)',
    'report.time': '时间',
    'report.format': '格式',
    'report.fieldLevel': '详情级别',
    'report.strategy': '归属模式',
    'report.strategyWorkspace': '按所属工作区归类',
    'report.strategyUnified': '统一主目录平铺',
    'report.outputDir': '输出目录',
    'report.total': '总数',
    'report.success': '成功',
    'report.failed': '失败',
    'report.listHeader': '  已导出列表',
    'report.steps': '步数',
    'report.project': '项目',
    'report.uncategorized': '未分类项目',
    'report.noWorkspace': '无工作区',
    'report.unknown': '未知',
    'report.failedTag': ' [失败]',
    'common.confirm': '确定',
    'common.cancel': '取消',
    'common.confirmDelete': '确认删除',
    'common.confirmBatchDelete': '确认批量删除',
    'delete.confirmConv': '确定要永久删除会话 "{0}" 吗？此操作将物理删除本地相关文件且不可恢复。',
    'delete.confirmBatchConv': '确定要批量永久删除选中的 {0} 个会话记录吗？此操作将物理删除本地相关文件且不可恢复。',
    'delete.confirmPlan': '确定要永久删除方案计划 "{0}" 吗？此操作将物理删除包含的全部工件文档且不可恢复。',
    'delete.confirmBatchPlan': '确定要批量永久删除选中的 {0} 个方案计划吗？此操作将物理删除包含的全部工件文档且不可恢复。',
    'delete.convSuccess': '已成功删除会话 [{0}]',
    'delete.batchConvSuccess': '已成功删除 {0} 个会话 ({1} 个失败)',
    'delete.planSuccess': '已成功删除方案计划 [{0}]',
    'delete.batchPlanSuccess': '已成功删除 {0} 个方案计划 ({1} 个失败)',
    'delete.nothingSelected': '未选中任何待删除项目',
  },
  'en': {
    'statusBar.tooltip': 'Open Antigravity History',
    'panel.title': 'Antigravity History',
    'common.invalidPath': 'Invalid directory path',
    'common.pathNotExistTryParent': 'Path does not exist: {0}. Attempting to open parent directory.',
    'common.pathNotExist': 'Specified path does not exist: {0}',
    'common.cannotOpenExplorer': 'Cannot open directory in file explorer: {0}',
    'common.copiedToClipboard': 'Conversation ID copied to clipboard',
    'dialog.selectExportFolder': 'Select Export Directory',
    'dialog.save': 'Save',
    'dialog.saveTitle': 'Save Conversation Export ({0})',
    'dialog.savePlanTitle': 'Save Plan Document ({0})',
    'filter.json': 'JSON Data (*.json)',
    'filter.markdown': 'Markdown Document (*.md)',
    'discovery.waiting': 'Waiting for LanguageServer discovery to complete...',
    'discovery.noEndpoint': 'No active LanguageServer endpoint found. Please ensure Antigravity is running.',
    'export.noConversations': 'No conversations available to export. Please refresh and try again.',
    'export.batchTitle': 'Exporting all conversations',
    'export.singleSuccess': 'Successfully exported [{0}] to {1}',
    'export.success': 'Successfully exported {0} conversations ({1} failed) to {2}',
    'export.openFile': 'Open File',
    'export.openContainingFolder': 'Open Containing Folder',
    'export.openFolder': 'Open Folder',
    'export.individualHint': 'Please use the export buttons in the panel to export individual conversations.',
    'export.modeTitle': 'Single Export Mode',
    'export.modeDialog': 'Save Dialog',
    'export.modeDirect': 'Direct Export',
    'plan.notFound': 'Specified plan item not found',
    'plan.artifactNotFound': 'Plan artifact file does not exist: {0}',
    'plan.exportSingleSuccess': 'Successfully saved plan [{0}] to: {1}',
    'plan.exportAllSuccess': 'Successfully exported {0} plan artifacts to: {1}',
    'report.title': '  EXPORT REPORT',
    'report.time': 'Time',
    'report.format': 'Format',
    'report.fieldLevel': 'Detail Level',
    'report.strategy': 'Strategy',
    'report.strategyWorkspace': 'Grouped by Project Workspace',
    'report.strategyUnified': 'Unified Main Directory',
    'report.outputDir': 'Output Directory',
    'report.total': 'Total',
    'report.success': 'Success',
    'report.failed': 'Failed',
    'report.listHeader': '  Exported List',
    'report.steps': 'Steps',
    'report.project': 'Project',
    'report.uncategorized': 'Uncategorized',
    'report.noWorkspace': 'No Workspace',
    'report.unknown': 'Unknown',
    'report.failedTag': ' [FAILED]',
    'common.confirm': 'OK',
    'common.cancel': 'Cancel',
    'common.confirmDelete': 'Confirm Delete',
    'common.confirmBatchDelete': 'Confirm Batch Delete',
    'delete.confirmConv': 'Are you sure you want to permanently delete conversation "{0}"? This will physically remove local files and cannot be undone.',
    'delete.confirmBatchConv': 'Are you sure you want to permanently delete {0} selected conversations? This will physically remove local files and cannot be undone.',
    'delete.confirmPlan': 'Are you sure you want to permanently delete plan "{0}"? This will physically remove all contained artifact files and cannot be undone.',
    'delete.confirmBatchPlan': 'Are you sure you want to permanently delete {0} selected plans? This will physically remove all contained artifact files and cannot be undone.',
    'delete.convSuccess': 'Successfully deleted conversation [{0}]',
    'delete.batchConvSuccess': 'Successfully deleted {0} conversations ({1} failed)',
    'delete.planSuccess': 'Successfully deleted plan [{0}]',
    'delete.batchPlanSuccess': 'Successfully deleted {0} plans ({1} failed)',
    'delete.nothingSelected': 'No items selected for deletion',
  },
};

/**
 * 翻译指定键名的国际化文本
 *
 * @param key 词典键名
 * @param langOverride 可选的语言强制覆盖
 * @param args 占位符填充参数数组
 * @returns 格式化后的目标语言文本
 */
export function t(key: string, langOverride?: Language, ...args: Array<string | number>): string {
  const lang = langOverride || getCurrentLanguage();
  const dict = messages[lang] || messages[DEFAULT_LANGUAGE];
  let text = dict[key] || messages[DEFAULT_LANGUAGE][key] || key;

  if (args.length > 0) {
    args.forEach((val, idx) => {
      text = text.replace(new RegExp(`\\{${idx}\\}`, 'g'), String(val));
    });
  }

  return text;
}

/**
 * 获取当前用户配置或环境偏好的语言代码
 *
 * @returns 'zh-CN' 或 'en'
 */
export function getCurrentLanguage(): Language {
  try {
    const config = vscode.workspace.getConfiguration('aghistory');
    const configured = config.get<string>('language');
    if (configured === 'zh-CN' || configured === 'en') {
      return configured as Language;
    }
  } catch {
    // 读取配置失败时降级
  }

  // 降级为 VS Code 界面当前语言检测
  const vscodeLocale = vscode.env.language.toLowerCase();
  if (vscodeLocale.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en';
}
