import fs from 'node:fs/promises';
import path from 'node:path';

export interface ProjectInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export interface ScanResult {
  projects: ProjectInfo[];
}

/**
 * 扫描指定父目录下的子目录，返回项目列表
 */
export async function scanDirectory(parentPath: string): Promise<ScanResult> {
  // 路径解析与合法性校验
  const resolvedPath = path.resolve(parentPath);

  // 检查路径是否存在
  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new Error(`路径不存在: ${resolvedPath}`);
  }

  // 检查是否为目录
  if (!stat.isDirectory()) {
    throw new Error(`路径不是一个目录: ${resolvedPath}`);
  }

  // 读取目录内容
  let entries;
  try {
    entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`无法读取目录: ${message}`);
  }

  const projects: ProjectInfo[] = [];

  for (const entry of entries) {
    // 过滤非目录
    if (!entry.isDirectory()) continue;

    // 过滤隐藏目录（以 . 开头）
    if (entry.name.startsWith('.')) continue;

    const childPath = path.join(resolvedPath, entry.name);

    // 检查子目录下是否有 .git（目录或文件，worktree 中 .git 是文件）
    let isGitRepo = false;
    try {
      const gitStat = await fs.stat(path.join(childPath, '.git'));
      isGitRepo = gitStat.isDirectory() || gitStat.isFile();
    } catch {
      // .git 不存在，不是 git 仓库
    }

    projects.push({
      name: entry.name,
      path: childPath,
      isGitRepo,
    });
  }

  // 按名称排序
  projects.sort((a, b) => a.name.localeCompare(b.name));

  return { projects };
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  directories: BrowseEntry[];
}

/**
 * 浏览指定目录，返回子目录列表（用于目录选择器）
 */
export async function browseDirectory(dirPath: string): Promise<BrowseResult> {
  const resolvedPath = path.resolve(dirPath);

  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    throw new Error(`路径不存在: ${resolvedPath}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`路径不是一个目录: ${resolvedPath}`);
  }

  let entries;
  try {
    entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`无法读取目录: ${message}`);
  }

  const dirs: BrowseEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    dirs.push({
      name: entry.name,
      path: path.join(resolvedPath, entry.name),
    });
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));

  const parsed = path.parse(resolvedPath);
  const parentPath = resolvedPath === parsed.root ? null : path.dirname(resolvedPath);

  return {
    currentPath: resolvedPath,
    parentPath,
    directories: dirs,
  };
}
