/**
 * 语言服务进程探测与端口扫描模块 (高性能全异步非阻塞架构)
 *
 * 核心功能：
 * - 异步非阻塞自动探测运行中的 Antigravity 语言服务与 agy hub 实例 (零主线程冻结)
 * - 从进程命令行参数提取 CSRF Token、hub-port 与 app_data_dir
 * - 单次并发批量扫描监听端口 (Batch Port Mapping)，杜绝多进程重复扫描全系统网络
 * - 自适应支持 HTTP 与 HTTPS 双协议通信
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-10
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface LsProcess {
  pid: number;
  csrf: string;
  cmd: string;
  appDataDir?: string;
  directPort?: number;
}

export interface LsEndpoint {
  port: number;
  csrf: string;
  pid: number;
  appDataDir?: string;
  protocol?: 'http' | 'https';
}

/**
 * 异步发现所有正在运行的 LanguageServer / agy 进程 (零阻塞)
 */
export async function discoverLanguageServers(): Promise<LsProcess[]> {
  const system = os.platform();
  try {
    if (system === 'win32') {
      return await discoverWindowsAsync();
    } else if (system === 'darwin') {
      return await discoverMacOSAsync();
    } else if (system === 'linux') {
      return await discoverLinuxAsync();
    }
  } catch (err) {
    console.warn('[AG] 进程探测异常已安全兜底:', err);
  }
  return [];
}

/**
 * Windows 平台：异步非阻塞探测 agy.exe 与 language_server 进程
 */
async function discoverWindowsAsync(): Promise<LsProcess[]> {
  const servers: LsProcess[] = [];
  try {
    const { stdout } = await execAsync('wmic process get processid,caption,commandline /format:csv', {
      timeout: 6000,
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.trim();
      if (!line) { continue; }

      const lower = line.toLowerCase();
      if (
        lower.includes('agy.exe') ||
        lower.includes('language_server') ||
        lower.includes('csrf_token')
      ) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const pidStr = parts[parts.length - 1].trim();
          const pid = parseInt(pidStr, 10);
          const cmdLine = parts.slice(2, parts.length - 1).join(',');

          if (!isNaN(pid) && cmdLine) {
            const csrf = extractCsrf(cmdLine);
            if (csrf) {
              const appDataDir = extractAppDataDir(cmdLine);
              const directPort = extractDirectPort(cmdLine);
              servers.push({ pid, csrf, cmd: cmdLine, appDataDir, directPort });
            }
          }
        }
      }
    }
  } catch {
    // 若 wmic 失败，尝试轻量级 powershell 备用查询
    try {
      const cmd =
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*agy*' -or $_.Name -like '*language_server*' -or $_.CommandLine -like '*csrf_token*' } | " +
        'Select-Object ProcessId, CommandLine | ConvertTo-Json';
      const { stdout } = await execAsync(`powershell -Command "${cmd}"`, {
        timeout: 6000,
        encoding: 'utf-8',
        windowsHide: true,
      });
      if (stdout.trim()) {
        let data = JSON.parse(stdout);
        if (!Array.isArray(data)) { data = [data]; }
        for (const proc of data) {
          const cmdLine: string = proc.CommandLine || '';
          const pid: number = proc.ProcessId;
          const csrf = extractCsrf(cmdLine);
          if (csrf) {
            const appDataDir = extractAppDataDir(cmdLine);
            const directPort = extractDirectPort(cmdLine);
            servers.push({ pid, csrf, cmd: cmdLine, appDataDir, directPort });
          }
        }
      }
    } catch {
      // 备用查询失败安全兜底
    }
  }
  return servers;
}

/**
 * macOS 平台：异步通过 pgrep + ps 查询进程
 */
async function discoverMacOSAsync(): Promise<LsProcess[]> {
  const servers: LsProcess[] = [];
  try {
    const { stdout: pidsOut } = await execAsync('pgrep -f "agy|language_server"', {
      encoding: 'utf-8',
      timeout: 4000,
    });
    const pids = pidsOut.trim().split('\n').filter(Boolean);

    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) { continue; }
      try {
        const { stdout: cmdLine } = await execAsync(`ps -p ${pid} -o args=`, {
          encoding: 'utf-8',
          timeout: 2000,
        });
        const csrf = extractCsrf(cmdLine.trim());
        if (csrf) {
          const appDataDir = extractAppDataDir(cmdLine.trim());
          const directPort = extractDirectPort(cmdLine.trim());
          servers.push({ pid, csrf, cmd: cmdLine.trim(), appDataDir, directPort });
        }
      } catch {
        // 忽略单进程异常
      }
    }
  } catch {
    // 未发现进程
  }
  return servers;
}

/**
 * Linux 平台：异步通过 pgrep + ps 查询进程
 */
async function discoverLinuxAsync(): Promise<LsProcess[]> {
  const servers: LsProcess[] = [];
  try {
    const { stdout: pidsOut } = await execAsync('pgrep -f "agy|language_server"', {
      encoding: 'utf-8',
      timeout: 4000,
    });
    const pids = pidsOut.trim().split('\n').filter(Boolean);

    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) { continue; }
      try {
        const { stdout: cmdLine } = await execAsync(`ps -p ${pid} -o args=`, {
          encoding: 'utf-8',
          timeout: 2000,
        });
        const csrf = extractCsrf(cmdLine.trim());
        if (csrf) {
          const appDataDir = extractAppDataDir(cmdLine.trim());
          const directPort = extractDirectPort(cmdLine.trim());
          servers.push({ pid, csrf, cmd: cmdLine.trim(), appDataDir, directPort });
        }
      } catch {
        // 忽略单进程异常
      }
    }
  } catch {
    // 未发现进程
  }
  return servers;
}

/**
 * 从命令行字符串中提取 csrf_token 参数（支持空格或等号分隔）
 */
function extractCsrf(cmdLine: string): string {
  const m = cmdLine.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);
  return m ? m[1] : '';
}

/**
 * 从命令行字符串中提取 --app_data_dir 参数
 */
export function extractAppDataDir(cmdLine: string): string | undefined {
  const m = cmdLine.match(/--app_data_dir[=\s]+(\S+)/i);
  return m ? m[1] : undefined;
}

/**
 * 从命令行字符串中直接提取 --hub-port 参数
 */
export function extractDirectPort(cmdLine: string): number | undefined {
  const m = cmdLine.match(/--hub-port[=\s]+(\d+)/i);
  return m ? parseInt(m[1], 10) : undefined;
}

/**
 * 批量高效端口扫描映射 (单次执行 netstat/lsof 并在内存中一次性哈希归组)
 *
 * @param servers 所有已发现的语言服务进程列表
 * @returns Map<PID, 监听端口列表>
 */
export async function findPortsForProcesses(servers: LsProcess[]): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (!servers || servers.length === 0) {
    return result;
  }

  // 先提取所有显式 directPort
  for (const srv of servers) {
    const list: number[] = [];
    if (srv.directPort && srv.directPort > 0) {
      list.push(srv.directPort);
    }
    result.set(srv.pid, list);
  }

  const pidSet = new Set(servers.map((s) => s.pid));

  if (os.platform() === 'win32') {
    try {
      const { stdout } = await execAsync('netstat -ano', {
        encoding: 'utf-8',
        timeout: 4000,
        windowsHide: true,
      });

      for (const line of stdout.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const m = line.match(/127\.0\.0\.1:(\d+)\s+.*?\s+(\d+)\s*$/);
        if (m) {
          const port = parseInt(m[1], 10);
          const pid = parseInt(m[2], 10);
          if (pidSet.has(pid)) {
            const list = result.get(pid) || [];
            if (!list.includes(port)) {
              list.push(port);
              result.set(pid, list);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AG] Windows 单次 netstat 端口扫描异常:', e);
    }
  } else {
    // Unix 平台批量扫描
    for (const srv of servers) {
      try {
        const { stdout } = await execAsync(`lsof -p ${srv.pid} -i -P -n`, {
          encoding: 'utf-8',
          timeout: 3000,
        });
        const list = result.get(srv.pid) || [];
        for (const line of stdout.split('\n')) {
          if (line.includes('LISTEN')) {
            const m = line.match(/:(\d+)\s+\(LISTEN\)/);
            if (m) {
              const port = parseInt(m[1], 10);
              if (!list.includes(port)) {
                list.push(port);
              }
            }
          }
        }
        result.set(srv.pid, list);
      } catch {
        // 单个 lsof 异常安全忽略
      }
    }
  }

  return result;
}

/**
 * 异步查询指定进程正在监听的本地端口列表 (单进程兼容接口)
 */
export async function findPorts(pid: number, directPort?: number): Promise<number[]> {
  const map = await findPortsForProcesses([{ pid, csrf: '', cmd: '', directPort }]);
  return map.get(pid) || [];
}
