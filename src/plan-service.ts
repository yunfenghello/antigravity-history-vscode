/**
 * 脑图方案工件扫描与独立导出服务模块
 *
 * 核心功能：
 * - 扫描本地脑图工件目录 (~/.gemini/antigravity/brain 与 antigravity-ide/brain)
 * - 提取实施计划 (implementation_plan.md)、任务清单 (task.md) 与变更报告 (walkthrough.md)
 * - 自动解析方案大标题与会话关联的工作区物理路径
 * - 支持单件计划另存为与全套工件一键导出到指定项目工作区目录
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-03
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
 * 获取所有可能的脑图工件根目录列表
 */
export function getBrainCandidateDirs(): string[] {
  const home = os.homedir();
  const dirs: string[] = [];

  const paths = [
    path.join(home, '.gemini', 'antigravity', 'brain'),
    path.join(home, '.gemini', 'antigravity-ide', 'brain'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      dirs.push(p);
    }
  }

  return dirs;
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
        // 清洗多余符号
        return title.replace(/[`*#]/g, '').trim();
      }
    }
  } catch {
    // 读取异常安全兜底
  }
  return '';
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
        return path.normalize(atMatch[1]);
      }

      // 匹配 file:/// 路径
      const fileUriMatch = line.match(/file:\/\/\/([a-zA-Z]:[^\s"'\\`]+)/i);
      if (fileUriMatch && fileUriMatch[1]) {
        let p = decodeURIComponent(fileUriMatch[1]);
        return path.normalize(p);
      }

      // 匹配 Command Working Directory 或 Workspace
      const wsMatch = line.match(/(?:Command Working Directory|Workspace):\s*([a-zA-Z]:[^\r\n"']+)/i);
      if (wsMatch && wsMatch[1]) {
        return path.normalize(wsMatch[1].trim());
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
export function scanBrainPlans(): PlanItem[] {
  const rootDirs = getBrainCandidateDirs();
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
    // 自动为该计划建立专属文件夹
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
