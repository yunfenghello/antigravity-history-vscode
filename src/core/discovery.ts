/**
 * 语言服务进程探测与端口扫描模块
 *
 * 核心功能：
 * - 自动探测运行中的 Antigravity 语言服务与 agy hub 实例
 * - 从进程命令行参数提取 CSRF Token、hub-port 与 app_data_dir
 * - 扫描进程监听的本地端口并支持自适应 HTTP/HTTPS 协议
 *
 * 作者/更新时间: Antigravity Coding Assistant / 2026-11-03
 */

import { execSync } from 'child_process';
import * as os from 'os';

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
 * 发现所有正在运行的 LanguageServer / agy 进程
 */
export function discoverLanguageServers(): LsProcess[] {
  const system = os.platform();
  if (system === 'win32') {
    return discoverWindows();
  } else if (system === 'darwin') {
    return discoverMacOS();
  } else if (system === 'linux') {
    return discoverLinux();
  }
  return [];
}

/**
 * Windows 平台：探测 agy.exe 与 language_server 进程
 */
function discoverWindows(): LsProcess[] {
  const servers: LsProcess[] = [];
  try {
    // 使用 wmic 快速获取所有进程信息，避免 powershell 子进程启动慢
    const stdout = execSync('wmic process get processid,caption,commandline /format:csv', {
      timeout: 8000,
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.trim();
      if (!line) { continue; }

      const lower = line.toLowerCase();
      // 匹配 agy.exe 或 language_server 或命令行包含 csrf_token 的进程
      if (
        lower.includes('agy.exe') ||
        lower.includes('language_server') ||
        lower.includes('csrf_token')
      ) {
        // CSV 格式: Node,Caption,CommandLine,ProcessId
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
      const stdout = execSync(`powershell -Command "${cmd}"`, {
        timeout: 8000,
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
      // 备用查询失败时安全兜底
    }
  }
  return servers;
}

/**
 * macOS 平台：通过 pgrep + ps 查询进程
 */
function discoverMacOS(): LsProcess[] {
  const servers: LsProcess[] = [];
  try {
    const pids = execSync('pgrep -f "agy|language_server"', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim().split('\n').filter(Boolean);

    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) { continue; }
      try {
        const cmdLine = execSync(`ps -p ${pid} -o args=`, {
          encoding: 'utf-8',
          timeout: 3000,
        }).trim();
        const csrf = extractCsrf(cmdLine);
        if (csrf) {
          const appDataDir = extractAppDataDir(cmdLine);
          const directPort = extractDirectPort(cmdLine);
          servers.push({ pid, csrf, cmd: cmdLine, appDataDir, directPort });
        }
      } catch {
        // 忽略单进程获取异常
      }
    }
  } catch {
    // 未发现进程
  }
  return servers;
}

/**
 * Linux 平台：通过 pgrep + ps 查询进程
 */
function discoverLinux(): LsProcess[] {
  const servers: LsProcess[] = [];
  try {
    const pids = execSync('pgrep -f "agy|language_server"', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim().split('\n').filter(Boolean);

    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) { continue; }
      try {
        const cmdLine = execSync(`ps -p ${pid} -o args=`, {
          encoding: 'utf-8',
          timeout: 3000,
        }).trim();
        const csrf = extractCsrf(cmdLine);
        if (csrf) {
          const appDataDir = extractAppDataDir(cmdLine);
          const directPort = extractDirectPort(cmdLine);
          servers.push({ pid, csrf, cmd: cmdLine, appDataDir, directPort });
        }
      } catch {
        // 忽略单进程获取异常
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
 * 查询指定进程正在监听的本地端口列表
 */
export function findPorts(pid: number, directPort?: number): number[] {
  const ports: number[] = [];
  if (directPort && directPort > 0) {
    ports.push(directPort);
  }

  if (os.platform() === 'win32') {
    const sysPorts = findPortsWindows(pid);
    for (const p of sysPorts) {
      if (!ports.includes(p)) { ports.push(p); }
    }
  } else {
    const sysPorts = findPortsUnix(pid);
    for (const p of sysPorts) {
      if (!ports.includes(p)) { ports.push(p); }
    }
  }
  return ports;
}

function findPortsWindows(pid: number): number[] {
  const ports: number[] = [];
  try {
    const stdout = execSync('netstat -ano', {
      encoding: 'utf-8',
      timeout: 6000,
      windowsHide: true,
    });
    const pidStr = String(pid);
    for (const line of stdout.split('\n')) {
      if (line.includes('LISTENING') && line.includes(pidStr)) {
        const m = line.match(/127\.0\.0\.1:(\d+)/);
        if (m) { ports.push(parseInt(m[1], 10)); }
      }
    }
  } catch {
    // netstat 执行失败安全处理
  }
  return ports;
}

function findPortsUnix(pid: number): number[] {
  const ports: number[] = [];
  try {
    const stdout = execSync(`lsof -p ${pid} -i -P -n`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const line of stdout.split('\n')) {
      if (line.includes('LISTEN')) {
        const m = line.match(/:(\d+)\s+\(LISTEN\)/);
        if (m) { ports.push(parseInt(m[1], 10)); }
      }
    }
  } catch {
    // lsof 执行失败安全处理
  }
  return ports;
}
