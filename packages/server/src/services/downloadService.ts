import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, stat, access, readFile, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import treeKill from 'tree-kill';
import { getIo } from './io.js';

// ========== ESM __dirname ==========

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========== 类型定义 ==========

export interface DownloadTask {
  id: string;
  projectPath: string;
  projectName?: string;
  branch?: string;
  status: 'scanning' | 'downloading' | 'packaging' | 'completed' | 'failed';
  process?: ChildProcess;
  timeout?: ReturnType<typeof setTimeout>;
  zipPath?: string;
  error?: string;
  cancelled?: boolean;
  socketId?: string;
  createdAt: number;
  worktreePath?: string;
  worktreeCleaned?: boolean;
}

// ========== 下载任务 Map ==========

const downloadTasks = new Map<string, DownloadTask>();

// ========== 超时与清理配置 ==========

const DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000; // 20 分钟
const TASK_CLEANUP_DELAY = 24 * 60 * 60 * 1000; // 24 小时

// ========== 辅助函数 ==========

/**
 * 封装 spawn，立即返回 child 引用和 exitPromise
 */
function spawnCommand(
  command: string,
  args: string[],
  cwd: string,
  onOutput: (type: 'stdout' | 'stderr', data: string) => void,
  extraEnv?: Record<string, string>,
): { child: ChildProcess; exitPromise: Promise<{ code: number }> } {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', ...extraEnv },
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    onOutput('stdout', chunk.toString());
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    onOutput('stderr', chunk.toString());
  });

  const exitPromise = new Promise<{ code: number }>((resolve, reject) => {
    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1 });
    });
  });

  return { child, exitPromise };
}

/**
 * 校验 projectPath 合法性
 */
function validateProjectPath(projectPath: string): void {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('projectPath 不能为空');
  }
  if (!projectPath.startsWith('/')) {
    throw new Error('projectPath 必须是绝对路径');
  }
  if (projectPath.includes('..')) {
    throw new Error('projectPath 不允许包含 ".."');
  }
  const blocked = ['/etc', '/usr', '/bin', '/sbin', '/var', '/root', '/sys', '/proc'];
  for (const dir of blocked) {
    if (projectPath === dir || projectPath.startsWith(dir + '/')) {
      throw new Error(`projectPath 不允许指向系统目录: ${dir}`);
    }
  }
}

/**
 * 安排定时清理（24 小时后从 Map 中移除）
 */
function scheduleTaskCleanup(downloadId: string): void {
  setTimeout(() => downloadTasks.delete(downloadId), TASK_CLEANUP_DELAY);
}

// ========== 核心下载函数 ==========

/**
 * 启动二方包下载流程
 * 1. 校验项目路径
 * 2. 可选 git worktree 隔离
 * 3. 验证 lockfile 存在
 * 4. 解析 .npmrc 获取 registry
 * 5. spawn 子进程执行下载脚本
 * 6. archiver 打包为 zip
 */
export async function runDownload(
  projectPath: string,
  socketId: string,
  branch?: string,
  options?: { lockfileName?: string; scopes?: string; registry?: string },
  externalDownloadId?: string,
): Promise<void> {
  const io = getIo();

  // 校验路径
  validateProjectPath(projectPath);

  const downloadId = externalDownloadId || randomUUID();
  const projectName = projectPath.split('/').pop();

  const task: DownloadTask = {
    id: downloadId,
    projectPath,
    projectName,
    branch,
    status: 'scanning',
    socketId,
    createdAt: Date.now(),
  };
  downloadTasks.set(downloadId, task);

  // 通知客户端下载已开始
  io.to(socketId).emit('download:status', { downloadId, status: 'scanning', projectName });

  // 超时控制
  task.timeout = setTimeout(() => {
    if (
      task.status !== 'completed' &&
      task.status !== 'failed'
    ) {
      if (task.process?.pid) {
        treeKill(task.process.pid, 'SIGKILL');
      }
      task.status = 'failed';
      task.error = '下载超时（20分钟）';
      io.to(socketId).emit('download:error', { downloadId, error: task.error, projectName });
      // 清理 worktree
      if (task.worktreePath && !task.worktreeCleaned) {
        import('./gitService.js').then(({ removeWorktree }) => {
          removeWorktree(task.projectPath, task.worktreePath!).then(() => {
            task.worktreeCleaned = true;
          }).catch(() => {});
        });
      }
      scheduleTaskCleanup(downloadId);
    }
  }, DOWNLOAD_TIMEOUT_MS);

  // 日志推送回调
  const onOutput = (type: 'stdout' | 'stderr', data: string) => {
    io.to(socketId).emit('download:log', { downloadId, type, data, projectName });

    // 解析进度信息，更新 status
    if (type === 'stdout') {
      if (data.includes('Downloading') || data.includes('下载')) {
        if (task.status !== 'downloading') {
          task.status = 'downloading';
          io.to(socketId).emit('download:status', { downloadId, status: 'downloading', projectName });
        }
      }
      // 检测单包下载开始
      const lines = data.split('\n');
      for (const line of lines) {
        const pkgMatch = line.match(/Downloading\s+(@[\w-]+\/[\w-]+)@/);
        if (pkgMatch) {
          io.to(socketId).emit('download:pkg-start', { downloadId, package: pkgMatch[1] });
        }
      }
    }
  };

  let worktreePath: string | undefined;

  try {
    // Step 0: 确定工作目录（可选 worktree 隔离）
    let workDir = projectPath;
    if (branch) {
      const { fetchBranch, addWorktree, generateWorktreePath } = await import('./gitService.js');
      worktreePath = generateWorktreePath(downloadId);
      task.branch = branch;
      onOutput('stdout', `[download] 拉取最新代码: ${branch}\n`);
      await fetchBranch(projectPath, branch);
      onOutput('stdout', `[download] 创建 worktree...\n`);
      await addWorktree(projectPath, branch, worktreePath);
      task.worktreePath = worktreePath;
      workDir = worktreePath;
      onOutput('stdout', `[download] worktree 准备完成\n`);
    }

    // Step 1: 确定 lockfile 路径并验证
    const lockfilePath = join(workDir, options?.lockfileName || 'pnpm-lock.yaml');
    try {
      await access(lockfilePath);
    } catch {
      throw new Error(`lockfile 不存在: ${lockfilePath}`);
    }
    onOutput('stdout', `[download] 使用 lockfile: ${lockfilePath}\n`);

    // Step 2: 解析 .npmrc 获取 registry
    let registry: string | undefined = options?.registry;
    if (!registry) {
      try {
        const npmrcPath = join(workDir, '.npmrc');
        const npmrcContent = await readFile(npmrcPath, 'utf-8');
        const registryMatch = npmrcContent.match(/^registry\s*=\s*(.+)$/m);
        if (registryMatch) {
          registry = registryMatch[1].trim();
          onOutput('stdout', `[download] 检测到 .npmrc registry: ${registry}\n`);
        }
      } catch { /* 无 .npmrc 或读取失败，忽略 */ }
    }

    // Step 3: 创建输出目录
    const outputDir = join(workDir, 'offline-packages');
    await mkdir(outputDir, { recursive: true });

    // Step 4: spawn 子进程运行下载脚本
    task.status = 'downloading';
    io.to(socketId).emit('download:status', { downloadId, status: 'downloading', projectName });

    const scriptPath = resolve(__dirname, '../../../../offline-package-tool/download-scoped-packages.js');
    const args = [
      scriptPath,
      '--lockfile', lockfilePath,
      '--output-dir', outputDir,
      '--scopes', options?.scopes || '@za/,@x-group/',
    ];
    if (registry) args.push('--registry', registry);

    const extraEnv = registry ? { NPM_CONFIG_REGISTRY: registry } : undefined;
    const downloadSpawn = spawnCommand('node', args, workDir, onOutput, extraEnv);
    task.process = downloadSpawn.child;
    const downloadResult = await downloadSpawn.exitPromise;

    if (downloadResult.code !== 0) {
      // 检查是否为用户取消
      if (task.cancelled) {
        task.status = 'failed';
        task.error = '用户取消';
        io.to(socketId).emit('download:error', { downloadId, error: task.error, projectName });
      } else {
        task.status = 'failed';
        task.error = `下载脚本执行失败，退出码: ${downloadResult.code}`;
        io.to(socketId).emit('download:error', { downloadId, error: task.error, projectName });
      }
      if (task.timeout) clearTimeout(task.timeout);
      scheduleTaskCleanup(downloadId);
      return;
    }

    onOutput('stdout', `[download] 二方包下载完成\n`);

    // Step 5: archiver 打包为 zip
    task.status = 'packaging';
    io.to(socketId).emit('download:status', { downloadId, status: 'packaging', projectName });
    onOutput('stdout', `[download] 开始打包 offline-packages 目录...\n`);

    const artifactsDir = join(homedir(), '.auto-build', 'artifacts');
    await mkdir(artifactsDir, { recursive: true });
    const zipPath = join(artifactsDir, `offline-${downloadId}.zip`);
    task.zipPath = zipPath;

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.pipe(output);
    archive.directory(outputDir, 'offline-packages');

    await new Promise<void>((resolveP, rejectP) => {
      output.on('close', () => resolveP());
      output.on('error', (err: Error) => rejectP(err));
      archive.on('error', (err: Error) => rejectP(err));
      archive.finalize();
    });

    onOutput('stdout', `[download] 打包完成: ${zipPath}\n`);

    // 下载完成
    task.status = 'completed';
    if (task.timeout) clearTimeout(task.timeout);
    io.to(socketId).emit('download:status', { downloadId, status: 'completed', projectName });
    io.to(socketId).emit('download:complete', { downloadId, zipPath, projectName });
    scheduleTaskCleanup(downloadId);
  } catch (err) {
    task.status = 'failed';
    task.error = err instanceof Error ? err.message : String(err);
    if (task.timeout) clearTimeout(task.timeout);
    io.to(socketId).emit('download:error', { downloadId, error: task.error, projectName });
    scheduleTaskCleanup(downloadId);
  } finally {
    // 清理 worktree
    if (worktreePath && !task.worktreeCleaned) {
      try {
        const { removeWorktree } = await import('./gitService.js');
        await removeWorktree(projectPath, worktreePath);
        task.worktreeCleaned = true;
      } catch {
        // 清理失败不影响下载结果
      }
    }
  }
}

// ========== 查询函数 ==========

/**
 * 取消下载
 */
export function cancelDownload(downloadId: string): boolean {
  const task = downloadTasks.get(downloadId);
  if (!task) return false;

  if (task.status === 'completed' || task.status === 'failed') {
    return false;
  }

  // 标记为取消状态，让 runDownload 的子进程退出处理检测到取消
  task.cancelled = true;

  // 杀掉进程树
  if (task.process?.pid) {
    treeKill(task.process.pid, 'SIGTERM');
  }

  // 清除超时计时器
  if (task.timeout) clearTimeout(task.timeout);

  task.status = 'failed';
  task.error = '用户取消';

  // 发送 Socket.IO 事件通知客户端
  const io = getIo();
  if (task.socketId) {
    io.to(task.socketId).emit('download:error', { downloadId, error: '用户取消', projectName: task.projectName });
  }

  // 清理临时 zip 文件
  if (task.zipPath) {
    unlink(task.zipPath).catch(() => {});
  }

  // 清理 worktree
  if (task.worktreePath && !task.worktreeCleaned) {
    import('./gitService.js').then(({ removeWorktree }) => {
      removeWorktree(task.projectPath, task.worktreePath!).then(() => {
        task.worktreeCleaned = true;
      }).catch(() => {});
    });
  }

  scheduleTaskCleanup(downloadId);
  return true;
}

/**
 * 获取下载任务信息
 */
export function getDownloadTask(downloadId: string): DownloadTask | undefined {
  return downloadTasks.get(downloadId);
}

/**
 * 获取 zip 文件路径
 */
export function getDownloadZipPath(downloadId: string): string | undefined {
  const task = downloadTasks.get(downloadId);
  return task?.zipPath;
}
