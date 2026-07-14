import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { stat, unlink, access, readFile, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import archiver from 'archiver';
import treeKill from 'tree-kill';
import { getIo } from './io.js';

// ========== 类型定义 ==========

export interface BuildTask {
  id: string;
  projectPath: string;
  status: 'installing' | 'building' | 'docker-building' | 'packaging' | 'completed' | 'failed' | 'cancelled';
  packageManager: 'npm' | 'pnpm' | 'yarn';
  process?: ChildProcess;
  zipPath?: string;
  error?: string;
  createdAt: number;
  worktreePath?: string;
  worktreeCleaned?: boolean;
  branch?: string;
  buildMode?: 'static' | 'docker';
  dockerImage?: string;
  dockerTag?: string;
}

export interface DockerBuildOptions {
  buildMode: 'docker';
  dockerfileTemplate?: string;
  customDockerfile?: string;
  nginxConfig?: string;
  customNginxConfig?: string;
  registry?: {
    url: string;
    imageName: string;
    tag?: string;
    username?: string;
    password?: string;
  };
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface BatchBuildTask {
  batchId: string;
  projects: Array<{ name: string; path: string; branch?: string }>;
  socketId: string;
  buildIds: string[];
  results: Array<{ projectName: string; buildId: string; status: 'pending' | 'completed' | 'failed' | 'skipped'; zipSize?: number }>;
  status: 'running' | 'completed';
  currentIndex: number;
  createdAt: number;
}

// ========== 构建任务 Map ==========

const buildTasks = new Map<string, BuildTask>();
const batchBuildTasks = new Map<string, BatchBuildTask>();

// ========== 超时与清理配置 ==========

const BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟
const TASK_CLEANUP_DELAY = 24 * 60 * 60 * 1000; // 24 小时

// ========== 辅助函数 ==========

/**
 * 封装 spawn，立即返回 child 引用和 exitPromise
 * 解决 task.process 在 await 后才赋值导致超时/取消失效的问题
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
  // 不允许空路径
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('projectPath 不能为空');
  }

  // 必须是绝对路径
  if (!projectPath.startsWith('/')) {
    throw new Error('projectPath 必须是绝对路径');
  }

  // 禁止路径穿越
  if (projectPath.includes('..')) {
    throw new Error('projectPath 不允许包含 ".."');
  }

  // 禁止危险目录
  const blocked = ['/etc', '/usr', '/bin', '/sbin', '/var', '/root', '/sys', '/proc'];
  for (const dir of blocked) {
    if (projectPath === dir || projectPath.startsWith(dir + '/')) {
      throw new Error(`projectPath 不允许指向系统目录: ${dir}`);
    }
  }
}

// ========== 包管理器检测 ==========

/**
 * 检测项目使用的包管理器
 * 根据 lock 文件判断：pnpm-lock.yaml → pnpm, yarn.lock → yarn, package-lock.json → npm
 * 都没有则默认 pnpm
 */
export async function detectPackageManager(projectPath: string): Promise<PackageManager> {
  const lockFiles: Array<{ file: string; pm: PackageManager }> = [
    { file: 'pnpm-lock.yaml', pm: 'pnpm' },
    { file: 'yarn.lock', pm: 'yarn' },
    { file: 'package-lock.json', pm: 'npm' },
  ];

  for (const { file, pm } of lockFiles) {
    try {
      await access(join(projectPath, file));
      return pm;
    } catch {
      // lock 文件不存在，继续检查下一个
    }
  }

  // 默认使用 pnpm
  return 'pnpm';
}

/**
 * 根据包管理器生成 install 命令
 */
function getInstallCommand(pm: PackageManager): { command: string; args: string[] } {
  return { command: pm, args: ['install'] };
}

/**
 * 根据包管理器生成 build 命令
 * pnpm: pnpm build
 * npm: npm run build
 * yarn: yarn build
 */
function getBuildCommand(pm: PackageManager): { command: string; args: string[] } {
  if (pm === 'npm') {
    return { command: 'npm', args: ['run', 'build'] };
  }
  return { command: pm, args: ['build'] };
}

/**
 * 安排构建任务的定时清理（24 小时后从 Map 中移除）
 */
function scheduleTaskCleanup(buildId: string): void {
  setTimeout(() => buildTasks.delete(buildId), TASK_CLEANUP_DELAY);
}

// ========== 核心构建函数 ==========

/**
 * 解析自定义命令字符串为 command + args
 * 例如: "npm install" => { command: 'npm', args: ['install'] }
 *       "npm run build" => { command: 'npm', args: ['run', 'build'] }
 */
function parseCustomCommand(cmd: string): { command: string; args: string[] } | null {
  const trimmed = cmd.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

/**
 * 启动构建流程
 * 1. 自动检测包管理器
 * 2. {pm} install
 * 3. {pm} build (npm 为 npm run build)
 * 4. 检测 dist 目录
 * 5. archiver 流式打包 dist 为 zip
 */
export async function runBuild(
  projectPath: string,
  socketId: string,
  branch?: string,
  projectName?: string,
  dockerOptions?: DockerBuildOptions | null,
  customInstallCommand?: string,
  customBuildCommand?: string,
  externalBuildId?: string,
): Promise<{ buildId: string; packageManager: PackageManager }> {
  const io = getIo();

  // 校验路径
  validateProjectPath(projectPath);

  // 并发控制：检查同一 projectPath + branch 是否已有运行中的任务
  for (const task of buildTasks.values()) {
    if (
      task.projectPath === projectPath &&
      task.branch === branch &&
      task.status !== 'completed' &&
      task.status !== 'failed' &&
      task.status !== 'cancelled'
    ) {
      throw new Error(`该路径+分支已有运行中的构建任务: ${task.id}`);
    }
  }

  const buildId = externalBuildId || randomUUID();
  const task: BuildTask = {
    id: buildId,
    projectPath,
    packageManager: 'pnpm', // 占位，try 块内会用 buildDir 重新检测
    status: 'installing',
    createdAt: Date.now(),
  };
  buildTasks.set(buildId, task);

  // 通知客户端构建已开始
  io.to(socketId).emit('build:status', { buildId, status: 'installing', packageManager: task.packageManager, projectName });

  // 设置超时控制
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const clearTimeout_ = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  timeoutId = setTimeout(() => {
    if (
      task.status !== 'completed' &&
      task.status !== 'failed' &&
      task.status !== 'cancelled'
    ) {
      if (task.process?.pid) {
        treeKill(task.process.pid, 'SIGKILL');
      }
      task.status = 'failed';
      task.error = '构建超时（10分钟）';
      clearTimeout_();
      io.to(socketId).emit('build:error', { buildId, error: task.error, projectName });
      // 清理 worktree
      if (task.worktreePath && !task.worktreeCleaned) {
        import('./gitService.js').then(({ removeWorktree }) => {
          removeWorktree(task.projectPath, task.worktreePath!).then(() => {
            task.worktreeCleaned = true;
          }).catch(() => {});
        });
      }
      scheduleTaskCleanup(buildId);
    }
  }, BUILD_TIMEOUT_MS);

  // 日志推送回调
  const onOutput = (type: 'stdout' | 'stderr', data: string) => {
    io.to(socketId).emit('build:log', { buildId, type, data, projectName });
  };

  let worktreePath: string | undefined;

  try {
    // Step 0: 如果指定了分支，创建独立的 git worktree
    let buildDir = projectPath;
    if (branch) {
      const { fetchBranch, addWorktree, generateWorktreePath } = await import('./gitService.js');
      worktreePath = generateWorktreePath(buildId);
      task.branch = branch;
      onOutput('stdout', `[auto-dist] 拉取最新代码: ${branch}\n`);
      await fetchBranch(projectPath, branch);
      onOutput('stdout', `[auto-dist] 创建 worktree...\n`);
      await addWorktree(projectPath, branch, worktreePath);
      task.worktreePath = worktreePath;
      buildDir = worktreePath;
      onOutput('stdout', `[auto-dist] worktree 准备完成\n`);

      // 复制项目级 .npmrc 到 worktree（确保私有 registry 等配置生效）
      const projectNpmrc = join(projectPath, '.npmrc');
      const worktreeNpmrc = join(buildDir, '.npmrc');
      try {
        await access(projectNpmrc);
        await copyFile(projectNpmrc, worktreeNpmrc);
        onOutput('stdout', `[auto-dist] 已复制项目 .npmrc 到构建目录\n`);
      } catch {
        // 项目无 .npmrc，无需处理
      }

      // pnpm-workspace.yaml 已由 git worktree 自带（buildDir === worktreePath），无需额外复制
    }

    // 在 buildDir 上检测包管理器（worktree 可能有不同的 lock 文件）
    const packageManager = await detectPackageManager(buildDir);
    task.packageManager = packageManager;

    // Step 1: {pm} install
    const parsedCustomInstall = customInstallCommand ? parseCustomCommand(customInstallCommand) : null;
    const installCmd = parsedCustomInstall || getInstallCommand(packageManager);
    task.status = 'installing';
    io.to(socketId).emit('build:status', { buildId, status: 'installing', packageManager, projectName });
    onOutput('stdout', `[auto-dist] 检测到包管理器: ${packageManager}\n`);
    if (parsedCustomInstall) {
      onOutput('stdout', `[auto-dist] 使用自定义安装命令: ${customInstallCommand}\n`);
    }
    onOutput('stdout', `[auto-dist] 开始执行 ${installCmd.command} ${installCmd.args.join(' ')}...\n`);

    // 解析 .npmrc 中的 registry 配置，通过环境变量显式传递给子进程
    // 解决 pnpm 在 worktree 中不读取项目 .npmrc 导致私有 registry 配置丢失的问题
    let npmRegistry: string | undefined;
    try {
      const npmrcPath = join(buildDir, '.npmrc');
      const npmrcContent = await readFile(npmrcPath, 'utf-8');
      const registryMatch = npmrcContent.match(/^registry\s*=\s*(.+)$/m);
      if (registryMatch) {
        npmRegistry = registryMatch[1].trim();
        onOutput('stdout', `[auto-dist] 检测到 .npmrc registry: ${npmRegistry}\n`);
      }
    } catch { /* 无 .npmrc 或读取失败，忽略 */ }

    const installEnv = npmRegistry ? { NPM_CONFIG_REGISTRY: npmRegistry } : undefined;
    const installSpawn = spawnCommand(installCmd.command, installCmd.args, buildDir, onOutput, installEnv);
    task.process = installSpawn.child;
    const installResult = await installSpawn.exitPromise;

    if (installResult.code !== 0) {
      task.status = 'failed';
      task.error = `${installCmd.command} install 失败，退出码: ${installResult.code}`;
      clearTimeout_();
      io.to(socketId).emit('build:error', { buildId, error: task.error, projectName });
      scheduleTaskCleanup(buildId);
      return { buildId, packageManager };
    }

    onOutput('stdout', `[auto-dist] ${installCmd.command} install 完成\n`);

    // Step 2: {pm} build
    const parsedCustomBuild = customBuildCommand ? parseCustomCommand(customBuildCommand) : null;
    const buildCmd = parsedCustomBuild || getBuildCommand(packageManager);
    task.status = 'building';
    io.to(socketId).emit('build:status', { buildId, status: 'building', packageManager, projectName });
    if (parsedCustomBuild) {
      onOutput('stdout', `[auto-dist] 使用自定义构建命令: ${customBuildCommand}\n`);
    }
    onOutput('stdout', `[auto-dist] 开始执行 ${buildCmd.command} ${buildCmd.args.join(' ')}...\n`);

    const buildSpawn = spawnCommand(buildCmd.command, buildCmd.args, buildDir, onOutput);
    task.process = buildSpawn.child;
    const buildResult = await buildSpawn.exitPromise;

    if (buildResult.code !== 0) {
      task.status = 'failed';
      task.error = `${buildCmd.command} build 失败，退出码: ${buildResult.code}`;
      clearTimeout_();
      io.to(socketId).emit('build:error', { buildId, error: task.error, projectName });
      scheduleTaskCleanup(buildId);
      return { buildId, packageManager };
    }

    onOutput('stdout', `[auto-dist] ${buildCmd.command} build 完成\n`);

    // Step 3: 检测 dist 目录
    task.status = 'packaging';
    io.to(socketId).emit('build:status', { buildId, status: 'packaging', packageManager, projectName });

    const distPath = join(buildDir, 'dist');
    try {
      const stats = await stat(distPath);
      if (!stats.isDirectory()) {
        throw new Error('dist 不是目录');
      }
    } catch (err) {
      task.status = 'failed';
      task.error = `dist 目录不存在或不可访问: ${err instanceof Error ? err.message : String(err)}`;
      clearTimeout_();
      io.to(socketId).emit('build:error', { buildId, error: task.error, projectName });
      scheduleTaskCleanup(buildId);
      return { buildId, packageManager };
    }

    // Step 4: archiver 流式打包 dist 为 zip
    onOutput('stdout', '[auto-dist] 开始打包 dist 目录...\n');

    const zipFileName = `dist-${buildId}.zip`;
    const zipPath = join(tmpdir(), zipFileName);
    task.zipPath = zipPath;

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.pipe(output);
    archive.directory(distPath, 'dist');

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', (err: Error) => reject(err));
      archive.finalize();
    });

    onOutput('stdout', `[auto-dist] 打包完成: ${zipPath}\n`);

    // Step 5: Docker 构建（如果指定了 docker 模式）
    if (dockerOptions?.buildMode === 'docker') {
      const { writeDockerfile, writeNginxConfig, dockerBuild } = await import('./dockerService.js');

      task.buildMode = 'docker';
      task.status = 'docker-building';

      // 检测项目目录是否自带 Dockerfile（仅在用户未指定 customDockerfile 时）
      const projectDockerfilePath = join(buildDir, 'Dockerfile');
      let useProjectDockerfile = false;
      if (!dockerOptions.customDockerfile) {
        let fileExists = false;
        try {
          await access(projectDockerfilePath);
          fileExists = true;
          // 读取并校验项目自带 Dockerfile
          const projectDockerfileContent = await readFile(projectDockerfilePath, 'utf-8');
          const { validateDockerfileContent } = await import('./dockerService.js');
          validateDockerfileContent(projectDockerfileContent);
          useProjectDockerfile = true;
          onOutput('stdout', `[auto-dist] 检测到项目目录已有 Dockerfile，优先使用\n`);
        } catch (e) {
          if (fileExists) {
            // 文件存在但校验失败，抛出错误而非静默回退
            throw new Error(`项目目录 Dockerfile 安全校验失败: ${(e as Error).message}`);
          }
          // access 失败 = 项目无 Dockerfile，使用模板
        }
      }

      if (!useProjectDockerfile) {
        // 现有逻辑：从模板写入 Dockerfile
        const templateName = dockerOptions.dockerfileTemplate || 'node';
        onOutput('stdout', `[auto-dist] 写入 Dockerfile (模板: ${templateName})...\n`);
        await writeDockerfile(buildDir, templateName, dockerOptions.customDockerfile);
      }

      // 检测项目目录是否自带 nginx.conf（仅在用户未指定 customNginxConfig 时）
      const projectNginxPath = join(buildDir, 'nginx.conf');
      let useProjectNginx = false;
      if (!dockerOptions.customNginxConfig) {
        try {
          await access(projectNginxPath);
          useProjectNginx = true;
          onOutput('stdout', `[auto-dist] 检测到项目目录已有 nginx.conf，优先使用\n`);
        } catch {
          // 项目无 nginx.conf
        }
      }

      // 写入 Nginx 配置（如果是 react-nginx 模板或用户指定了，且项目没有自带）
      if (!useProjectNginx && (dockerOptions.nginxConfig || dockerOptions.dockerfileTemplate === 'react-nginx')) {
        const nginxName = dockerOptions.nginxConfig || 'standard-spa';
        onOutput('stdout', `[auto-dist] 写入 Nginx 配置 (模板: ${nginxName})...\n`);
        await writeNginxConfig(buildDir, nginxName, dockerOptions.customNginxConfig);
      }

      // Docker Build
      const imageName = dockerOptions.registry?.imageName || 'auto-build-app';
      const imageTag = dockerOptions.registry?.tag || 'latest';
      task.dockerImage = imageName;
      task.dockerTag = imageTag;

      onOutput('stdout', `[auto-dist] 开始 Docker 构建: ${imageName}:${imageTag}\n`);
      const dockerResult = await dockerBuild(buildDir, imageName, imageTag, undefined, onOutput);

      if (dockerResult.code !== 0) {
        task.status = 'failed';
        task.error = `Docker 构建失败，退出码: ${dockerResult.code}`;
        clearTimeout_();
        io.to(socketId).emit('build:error', { buildId, error: task.error, projectName });
        scheduleTaskCleanup(buildId);
        return { buildId, packageManager };
      }
      onOutput('stdout', `[auto-dist] Docker 构建完成: ${imageName}:${imageTag}\n`);
    }

    // 构建完成
    task.status = 'completed';
    clearTimeout_();
    io.to(socketId).emit('build:status', { buildId, status: 'completed', packageManager, projectName });
    io.to(socketId).emit('build:complete', { buildId, zipPath, packageManager, projectName });
    scheduleTaskCleanup(buildId);

    return { buildId, packageManager };
  } catch (err) {
    // 如果任务已被取消，不覆盖状态
    if (task.status === 'cancelled') {
      clearTimeout_();
      scheduleTaskCleanup(buildId);
      return { buildId, packageManager: task.packageManager };
    }

    task.status = 'failed';
    task.error = err instanceof Error ? err.message : String(err);
    clearTimeout_();
    io.to(socketId).emit('build:error', { buildId, error: task.error, projectName });
    scheduleTaskCleanup(buildId);
    return { buildId, packageManager: task.packageManager };
  } finally {
    // 清理 worktree
    if (worktreePath && !task.worktreeCleaned) {
      try {
        const { removeWorktree } = await import('./gitService.js');
        await removeWorktree(projectPath, worktreePath);
        task.worktreeCleaned = true;
      } catch {
        // 清理失败不影响构建结果
      }
    }
  }
}

// ========== 批量构建 ==========

/**
 * 依次对多个项目执行构建流程
 * - 串行执行，某个项目失败不影响后续项目
 * - 如果某项目没有指定分支，跳过并在日志中提示
 */
export async function runBatchBuild(
  projects: Array<{ name: string; path: string; branch?: string; dockerOptions?: DockerBuildOptions }>,
  socketId: string,
  installCommand?: string,
  buildCommand?: string,
  externalBuildIds?: string[],
  externalBatchId?: string,
): Promise<{ batchId: string; buildIds: string[] }> {
  const io = getIo();
  const batchId = externalBatchId || randomUUID();
  const buildIds: string[] = [];
  const results: BatchBuildTask['results'] = projects.map((p) => ({
    projectName: p.name,
    buildId: '',
    status: 'pending' as const,
  }));

  const batch: BatchBuildTask = {
    batchId,
    projects,
    socketId,
    buildIds,
    results,
    status: 'running',
    currentIndex: 0,
    createdAt: Date.now(),
  };
  batchBuildTasks.set(batchId, batch);

  // 依次构建每个项目
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const projectBranch = project.branch;
    batch.currentIndex = i;

    // 推送进度
    io.to(socketId).emit('batch:progress', {
      batchId,
      currentIndex: i,
      total: projects.length,
      projectName: project.name,
      status: 'building',
      buildId: '',
    });

    try {
      // 如果指定了分支，先检查分支是否存在
      if (projectBranch) {
        try {
          const { execGit } = await import('./gitService.js');
          try {
            await execGit(project.path, ['rev-parse', '--verify', projectBranch]);
          } catch {
            // 本地不存在，fetch 后检查远程
            await execGit(project.path, ['fetch', 'origin', projectBranch]);
            await execGit(project.path, ['rev-parse', '--verify', `origin/${projectBranch}`]);
          }
        } catch {
          // 分支不存在，跳过该项目
          results[i].status = 'skipped';
          const skipBuildId = externalBuildIds?.[i] || randomUUID();
          results[i].buildId = skipBuildId;
          buildIds.push(skipBuildId);

          io.to(socketId).emit('build:log', {
            buildId: skipBuildId,
            projectName: project.name,
            type: 'stdout',
            data: `[auto-dist] 项目 ${project.name} 没有分支 ${projectBranch}，已跳过\n`,
          });
          io.to(socketId).emit('batch:progress', {
            batchId,
            currentIndex: i,
            total: projects.length,
            projectName: project.name,
            status: 'skipped',
            buildId: skipBuildId,
          });
          continue;
        }
      }

      const { buildId, packageManager } = await runBuild(project.path, socketId, projectBranch, project.name, (project as any).dockerOptions, installCommand, buildCommand, externalBuildIds?.[i]);
      results[i].buildId = buildId;
      buildIds.push(buildId);

      // 检查实际构建状态：runBuild 在失败时不抛异常，而是正常返回并设置 task.status = 'failed'
      const task = buildTasks.get(buildId);
      const actualStatus = task?.status || 'completed';

      if (actualStatus === 'failed') {
        results[i].status = 'failed';

        io.to(socketId).emit('build:log', {
          buildId,
          projectName: project.name,
          type: 'stderr',
          data: `[auto-dist] 项目 ${project.name} 构建失败: ${task?.error || '未知错误'}\n`,
        });
        io.to(socketId).emit('batch:progress', {
          batchId,
          currentIndex: i,
          total: projects.length,
          projectName: project.name,
          status: 'failed',
          buildId,
        });
      } else {
        results[i].status = 'completed';

        // 获取 zip 大小
        if (task?.zipPath) {
          try {
            const stats = await stat(task.zipPath);
            results[i].zipSize = stats.size;
          } catch {
            // ignore
          }
        }

        io.to(socketId).emit('batch:progress', {
          batchId,
          currentIndex: i,
          total: projects.length,
          projectName: project.name,
          status: 'completed',
          buildId,
          packageManager,
        });
      }
    } catch (err) {
      // 构建失败，记录错误但继续下一个
      const failBuildId = externalBuildIds?.[i] || randomUUID();
      results[i].buildId = failBuildId;
      results[i].status = 'failed';
      buildIds.push(failBuildId);

      io.to(socketId).emit('build:log', {
        buildId: failBuildId,
        projectName: project.name,
        type: 'stderr',
        data: `[auto-dist] 项目 ${project.name} 构建失败: ${err instanceof Error ? err.message : String(err)}\n`,
      });
      io.to(socketId).emit('batch:progress', {
        batchId,
        currentIndex: i,
        total: projects.length,
        projectName: project.name,
        status: 'failed',
        buildId: failBuildId,
      });
    }
  }

  // 全部完成
  batch.status = 'completed';
  io.to(socketId).emit('batch:complete', {
    batchId,
    results: results.map((r) => ({
      projectName: r.projectName,
      buildId: r.buildId,
      status: r.status,
      zipSize: r.zipSize,
    })),
  });

  // 24 小时后清理
  setTimeout(() => batchBuildTasks.delete(batchId), TASK_CLEANUP_DELAY);

  return { batchId, buildIds };
}

/**
 * 获取批量构建任务信息
 */
export function getBatchBuildTask(batchId: string): BatchBuildTask | undefined {
  return batchBuildTasks.get(batchId);
}

// ========== 查询函数 ==========

/**
 * 获取构建任务信息
 */
export function getBuildTask(buildId: string): BuildTask | undefined {
  return buildTasks.get(buildId);
}

/**
 * 取消构建
 */
export function cancelBuild(buildId: string): boolean {
  const task = buildTasks.get(buildId);
  if (!task) {
    return false;
  }

  // 只有运行中的任务才能取消
  if (
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'cancelled'
  ) {
    return false;
  }

  // 杀掉进程树
  if (task.process?.pid) {
    treeKill(task.process.pid, 'SIGTERM');
  }

  task.status = 'cancelled';

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

  scheduleTaskCleanup(buildId);

  return true;
}

/**
 * 获取 zip 文件路径
 */
export function getZipPath(buildId: string): string | undefined {
  const task = buildTasks.get(buildId);
  return task?.zipPath;
}

/**
 * 清理临时 zip 文件
 */
export async function cleanupBuild(buildId: string): Promise<void> {
  const task = buildTasks.get(buildId);
  if (!task) return;

  if (task.zipPath) {
    try {
      await unlink(task.zipPath);
    } catch {
      // 文件可能已被删除，忽略
    }
  }

  buildTasks.delete(buildId);
}
