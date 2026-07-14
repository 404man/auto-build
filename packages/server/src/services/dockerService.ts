import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listTemplates, getTemplate } from './configService.js';

// ========== 常量 ==========

const MAX_DOCKERFILE_SIZE = 64 * 1024; // 64KB
const DOCKER_BUILD_TIMEOUT_MS = 20 * 60 * 1000; // 20 分钟

/** 危险 Dockerfile 指令正则 */
const DANGEROUS_PATTERNS = [
  /--privileged/i,
  /--network\s*=\s*host/i,
  /--cap-add\s*=\s*SYS_ADMIN/i,
  /--pid\s*=\s*host/i,
  /--ipc\s*=\s*host/i,
  /--uts\s*=\s*host/i,
];

/** Registry URL 格式校验：允许 host 或 host:port 或 host/path */
const REGISTRY_URL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?(:[0-9]{1,5})?(\/[a-zA-Z0-9._/-]*)?$/;

// ========== 辅助函数 ==========

/**
 * 封装 spawn，返回 child 引用和 exitPromise
 */
function spawnCommand(
  command: string,
  args: string[],
  cwd: string,
  onOutput: (type: 'stdout' | 'stderr', data: string) => void,
): { child: ChildProcess; exitPromise: Promise<{ code: number }> } {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
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
 * 封装 spawn（带 stdin 支持），用于 docker login --password-stdin
 */
function spawnWithStdin(
  command: string,
  args: string[],
  stdinData: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

/**
 * 校验 Dockerfile 内容安全性
 */
function validateDockerfileContent(content: string): void {
  if (Buffer.byteLength(content, 'utf-8') > MAX_DOCKERFILE_SIZE) {
    throw new Error(`Dockerfile 内容超过最大限制 (${MAX_DOCKERFILE_SIZE / 1024}KB)`);
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(`Dockerfile 包含危险指令: ${pattern.source}`);
    }
  }
}

/**
 * 校验 Registry URL 格式
 */
function validateRegistryUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('Registry URL 不能为空');
  }
  if (!REGISTRY_URL_RE.test(url)) {
    throw new Error(`Registry URL 格式无效: ${url}`);
  }
}

// ========== 模板管理函数 ==========

/**
 * 返回 Dockerfile 模板列表（不含 content）
 */
export function listDockerfileTemplates() {
  return listTemplates('dockerfile');
}

/**
 * 返回指定 Dockerfile 模板（含 content）
 */
export function getDockerfileTemplate(key: string) {
  return getTemplate('dockerfile', key);
}

/**
 * 返回 Nginx 配置列表（不含 content）
 */
export function listNginxConfigs() {
  return listTemplates('nginx');
}

/**
 * 返回指定 Nginx 配置（含 content）
 */
export function getNginxConfig(key: string) {
  return getTemplate('nginx', key);
}

// ========== 文件写入函数 ==========

/**
 * 写入 Dockerfile 到构建目录
 */
export async function writeDockerfile(buildDir: string, templateName: string, customContent?: string): Promise<void> {
  let content: string;

  if (templateName === 'custom' && customContent) {
    content = customContent;
  } else {
    const tpl = getTemplate('dockerfile', templateName);
    if (!tpl || !tpl.content) {
      throw new Error(`未知的 Dockerfile 模板: ${templateName}`);
    }
    content = tpl.content;
  }

  validateDockerfileContent(content);

  await writeFile(join(buildDir, 'Dockerfile'), content, 'utf-8');
}

/**
 * 写入 Nginx 配置到构建目录
 */
export async function writeNginxConfig(buildDir: string, configName: string, customContent?: string): Promise<void> {
  let content: string;

  if (configName === 'custom' && customContent) {
    content = customContent;
  } else {
    const cfg = getTemplate('nginx', configName);
    if (!cfg || !cfg.content) {
      throw new Error(`未知的 Nginx 配置模板: ${configName}`);
    }
    content = cfg.content;
  }

  if (Buffer.byteLength(content, 'utf-8') > MAX_DOCKERFILE_SIZE) {
    throw new Error(`Nginx 配置内容超过最大限制 (${MAX_DOCKERFILE_SIZE / 1024}KB)`);
  }

  await writeFile(join(buildDir, 'nginx.conf'), content, 'utf-8');
}

// ========== Docker CLI 操作 ==========

/**
 * 检查 Docker daemon 是否可用
 */
export async function checkDockerDaemon(): Promise<boolean> {
  try {
    const result = await spawnWithStdin('docker', ['info'], '');
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * 执行 docker build
 */
export async function dockerBuild(
  buildDir: string,
  imageName: string,
  tag: string,
  dockerfilePath?: string,
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void,
): Promise<{ code: number }> {
  const args = ['build', '-t', `${imageName}:${tag}`];

  if (dockerfilePath) {
    args.push('-f', dockerfilePath);
  }

  args.push(buildDir);

  const noop = () => {};
  const outputCb = onOutput ?? noop;

  const { child, exitPromise } = spawnCommand('docker', args, buildDir, outputCb);

  // 超时控制
  const timeoutId = setTimeout(() => {
    child.kill('SIGTERM');
  }, DOCKER_BUILD_TIMEOUT_MS);

  try {
    const result = await exitPromise;
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 执行 docker login（使用 --password-stdin 安全模式）
 */
export async function dockerLogin(registryUrl: string, username: string, password: string): Promise<void> {
  validateRegistryUrl(registryUrl);

  if (!username) {
    throw new Error('用户名不能为空');
  }
  if (!password) {
    throw new Error('密码不能为空');
  }

  const result = await spawnWithStdin(
    'docker',
    ['login', registryUrl, '-u', username, '--password-stdin'],
    password,
  );

  if (result.code !== 0) {
    throw new Error(`Docker login 失败: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

/**
 * 执行 docker push
 */
export async function dockerPush(
  imageName: string,
  tag: string,
  onOutput?: (type: 'stdout' | 'stderr', data: string) => void,
): Promise<{ code: number }> {
  const noop = () => {};
  const outputCb = onOutput ?? noop;

  const { exitPromise } = spawnCommand(
    'docker',
    ['push', `${imageName}:${tag}`],
    process.cwd(),
    outputCb,
  );

  return exitPromise;
}

/**
 * 执行 docker logout
 */
export async function dockerLogout(registryUrl: string): Promise<void> {
  validateRegistryUrl(registryUrl);

  const result = await spawnWithStdin('docker', ['logout', registryUrl], '');

  if (result.code !== 0) {
    throw new Error(`Docker logout 失败: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}
