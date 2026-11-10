/**
 * 脑图方案工件扫描与独立导出服务模块
 *
 * 核心功能：
 * - 扫描本地脑图工件目录 (~/.gemini/antigravity/brain、antigravity-ide/brain 等)
 * - 提取实施计划 (implementation_plan.md)、任务清单 (task.md) 与变更报告 (walkthrough.md)
 * - 自动解析方案大标题与会话关联的工作区物理路径，执行 URL 中文解码
 * - 支持单件计划另存为与全套工件一键导出到指定项目工作区目录
 * - 支持本地方案计划工件目录的单项安全物理删除与批量删除
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PlanArtifactFile {
  fileName: string;
  filePath: string;
  size: number;
  label: string;
}

export interface PlanItem {
  id: string;
  title: string;
  dirPath: string;
  lastModifiedTime: string;
  workspacePath?: string;
  artifacts: PlanArtifactFile[];
}

/**
 * 获取所有可能的脑图工件根目录列表（兼容动态探测与系统历史路径）
 */
export function getBrainCandidateDirs(customDirs: string[] = []): string[] {
  const home = os.homedir();
  const dirSet = new Set<string>();

  for (const name of customDirs) {
    if (!name || typeof name !== 'string') { continue; }
    if (path.isAbsolute(name)) {
      dirSet.add(path.join(name, 'brain'));
    } else {
      dirSet.add(path.join(home, '.gemini', name, 'brain'));
    }
  }

  dirSet.add(path.join(home, '.gemini', 'antigravity', 'brain'));
  dirSet.add(path.join(home, '.gemini', 'antigravity-ide', 'brain'));
  dirSet.add(path.join(home, '.gemini', 'antigravity-backup', 'brain'));

  const validDirs: string[] = [];
  for (const p of dirSet) {
    if (fs.existsSync(p)) {
      validDirs.push(p);
    }
  }

  return validDirs;
}

/**
 * 从 Markdown 文件中提取第一行一级标题作为展示标题
 */
function extractMarkdownTitle(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) { return ''; }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('# ')) {
        const title = line.replace(/^#\s+/, '').trim();
        return title.replace(/[`*#]/g, '').trim();
      }
    }
  } catch {
    // 读取异常安全兜底
  }
  return '';
}

/**
 * 清洗并规范化项目工作区物理路径（统一解码 URL 编码）
 */
function cleanWorkspacePath(rawPath: string): string {
  if (!rawPath) return '';
  let p = rawPath.trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    // 解码异常保留原串
  }
  if (/^file:\/\/\//i.test(p)) {
    p = p.replace(/^file:\/\/\//i, '');
  } else if (/^file:\/\//i.test(p)) {
    p = p.replace(/^file:\/\//i, '');
  }
  p = p.replace(/^[\\\/]([a-zA-Z]:)/, '$1');
  return path.normalize(p);
}

/**
 * 从会话日志中解析关联的项目工作区绝对路径
 */
function extractWorkspaceFromTranscript(brainSubDir: string): string | undefined {
  try {
    const logPath = path.join(brainSubDir, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(logPath)) { return undefined; }

    const raw = fs.readFileSync(logPath, 'utf-8');
    const firstLines = raw.split('\n').slice(0, 5);

    for (const line of firstLines) {
      if (!line.trim()) { continue; }
      // 匹配 @[路径]
      const atMatch = line.match(/@\[([a-zA-Z]:[\\\/][^\]]+)\]/);
      if (atMatch && atMatch[1]) {
        return cleanWorkspacePath(atMatch[1]);
      }

      // 匹配 file:/// 路径
      const fileUriMatch = line.match(/file:\/\/\/([a-zA-Z]:[^\s"'\\`]+)/i);
      if (fileUriMatch && fileUriMatch[1]) {
        return cleanWorkspacePath(fileUriMatch[1]);
      }

      // 匹配 Command Working Directory 或 Workspace
      const wsMatch = line.match(/(?:Command Working Directory|Workspace):\s*([a-zA-Z]:[^\r\n"']+)/i);
      if (wsMatch && wsMatch[1]) {
        return cleanWorkspacePath(wsMatch[1].trim());
      }
    }
  } catch {
    // 日志解析失败时安全忽略
  }
  return undefined;
}

/**
 * 扫描全部脑图目录，获取所有包含工件的方案计划列表
 */
export function scanBrainPlans(customDirs: string[] = []): PlanItem[] {
  const rootDirs = getBrainCandidateDirs(customDirs);
  const planMap = new Map<string, PlanItem>();

  const standardArtifacts: Array<{ name: string; label: string }> = [
    { name: 'implementation_plan.md', label: '实施方案' },
    { name: 'task.md', label: '任务清单' },
    { name: 'walkthrough.md', label: '变更报告' },
  ];

  for (const root of rootDirs) {
    try {
      const subs = fs.readdirSync(root);
      for (const sub of subs) {
        if (sub.startsWith('.') || sub === 'tempmediaStorage') { continue; }
        const subDir = path.join(root, sub);

        try {
          const stat = fs.statSync(subDir);
          if (!stat.isDirectory()) { continue; }

          const artifacts: PlanArtifactFile[] = [];
          let latestMtime = stat.mtime;

          // 检查标准工件文件
          for (const std of standardArtifacts) {
            const filePath = path.join(subDir, std.name);
            if (fs.existsSync(filePath)) {
              try {
                const fstat = fs.statSync(filePath);
                if (fstat.mtime.getTime() > latestMtime.getTime()) {
                  latestMtime = fstat.mtime;
                }
                artifacts.push({
                  fileName: std.name,
                  filePath,
                  size: fstat.size,
                  label: std.label,
                });
              } catch {
                // 忽略单个文件状态读取异常
              }
            }
          }

          // 扫描其他额外的 .md 方案文件
          const allFiles = fs.readdirSync(subDir);
          for (const file of allFiles) {
            if (file.endsWith('.md') && !standardArtifacts.some((a) => a.name === file)) {
              const filePath = path.join(subDir, file);
              try {
                const fstat = fs.statSync(filePath);
                if (fstat.mtime.getTime() > latestMtime.getTime()) {
                  latestMtime = fstat.mtime;
                }
                artifacts.push({
                  fileName: file,
                  filePath,
                  size: fstat.size,
                  label: '参考文档',
                });
              } catch {
                // 忽略读取异常
              }
            }
          }

          // 仅纳管实际包含方案工件的目录
          if (artifacts.length > 0) {
            let title = '';
            const planMd = path.join(subDir, 'implementation_plan.md');
            if (fs.existsSync(planMd)) {
              title = extractMarkdownTitle(planMd);
            }
            if (!title) {
              const taskMd = path.join(subDir, 'task.md');
              if (fs.existsSync(taskMd)) {
                title = extractMarkdownTitle(taskMd);
              }
            }
            if (!title) {
              title = `方案计划 ${sub.slice(0, 8)}`;
            }

            const workspacePath = extractWorkspaceFromTranscript(subDir);

            const existing = planMap.get(sub);
            if (!existing || latestMtime.getTime() > new Date(existing.lastModifiedTime).getTime()) {
              planMap.set(sub, {
                id: sub,
                title,
                dirPath: subDir,
                lastModifiedTime: latestMtime.toISOString(),
                workspacePath,
                artifacts,
              });
            }
          }
        } catch {
          // 忽略单个目录异常
        }
      }
    } catch {
      // 忽略根目录读取异常
    }
  }

  // 按最后修改时间倒序排列
  const results = Array.from(planMap.values());
  results.sort((a, b) => new Date(b.lastModifiedTime).getTime() - new Date(a.lastModifiedTime).getTime());
  return results;
}

/**
 * 单文件复制导出
 */
export function exportSingleArtifact(sourceFilePath: string, targetFilePath: string): boolean {
  try {
    if (!fs.existsSync(sourceFilePath)) { return false; }
    const targetDir = path.dirname(targetFilePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(sourceFilePath, targetFilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 批量导出指定计划下的全部工件文件到目标目录
 */
export function exportAllArtifactsForPlan(
  planItem: PlanItem,
  targetDirectory: string,
): { successCount: number; targetDir: string } {
  let count = 0;
  try {
    const safeTitle = planItem.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const subFolderName = `计划方案_${safeTitle}_${planItem.id.slice(0, 8)}`;
    const fullTargetDir = path.join(targetDirectory, subFolderName);

    if (!fs.existsSync(fullTargetDir)) {
      fs.mkdirSync(fullTargetDir, { recursive: true });
    }

    for (const art of planItem.artifacts) {
      if (fs.existsSync(art.filePath)) {
        const dest = path.join(fullTargetDir, art.fileName);
        fs.copyFileSync(art.filePath, dest);
        count++;
      }
    }
    return { successCount: count, targetDir: fullTargetDir };
  } catch {
    return { successCount: count, targetDir: targetDirectory };
  }
}

/**
 * 物理删除指定方案计划的脑图工件目录
 *
 * 执行严格沙箱防护与父目录包含校验，杜绝越权与根目录误删风险
 *
 * @param planId 目标方案唯一标识 (目录名)
 * @param customDirs 自定义脑图探测目录
 * @returns 删除操作执行结果
 */
export function deletePlanDirectory(
  planId: string,
  customDirs: string[] = [],
): { success: boolean; error?: string } {
  if (!planId || typeof planId !== 'string' || path.basename(planId) !== planId) {
    return { success: false, error: '无效或不安全的方案标识' };
  }

  const rootDirs = getBrainCandidateDirs(customDirs);
  let found = false;

  for (const root of rootDirs) {
    const targetDir = path.join(root, planId);
    if (fs.existsSync(targetDir)) {
      try {
        const stat = fs.statSync(targetDir);
        if (!stat.isDirectory()) {
          continue;
        }

        // 强校验：确保目标目录的标准绝对父路径与合法根目录完全一致
        const resolvedTarget = path.resolve(targetDir);
        const resolvedParent = path.dirname(resolvedTarget);
        const isValidParent = rootDirs.some(
          (validRoot) => path.resolve(validRoot).toLowerCase() === resolvedParent.toLowerCase(),
        );

        if (!isValidParent) {
          return { success: false, error: '安全沙箱拦截：目标方案不在合法脑图目录内' };
        }

        fs.rmSync(resolvedTarget, { recursive: true, force: true });
        found = true;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return { success: false, error: errMsg };
      }
    }
  }

  if (!found) {
    return { success: false, error: '未在本地脑图存储中找到该方案计划目录' };
  }

  return { success: true };
}

/**
 * 批量物理删除指定方案计划集合
 *
 * @param planIds 待删除方案标识数组
 * @param customDirs 自定义脑图候选目录
 * @returns 批量删除统计结果
 */
export function batchDeletePlanDirectories(
  planIds: string[],
  customDirs: string[] = [],
): { successCount: number; failedCount: number; failedIds: string[] } {
  let successCount = 0;
  let failedCount = 0;
  const failedIds: string[] = [];

  for (const pid of planIds) {
    const res = deletePlanDirectory(pid, customDirs);
    if (res.success) {
      successCount++;
    } else {
      failedCount++;
      failedIds.push(pid);
    }
  }

  return { successCount, failedCount, failedIds };
}
