import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const GIT_TIMEOUT = 30_000; // 30 seconds

/**
 * Execute a git command in the given directory.
 * Resolves with stdout, rejects on stderr or non-zero exit code.
 */
export function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve_promise, reject) => {
    // Validate cwd exists
    const resolvedCwd = resolve(cwd);
    if (!existsSync(resolvedCwd)) {
      reject(new Error(`Directory does not exist: ${resolvedCwd}`));
      return;
    }

    const child = spawn('git', args, { cwd: resolvedCwd });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Git command timed out: git ${args.join(' ')}`));
    }, GIT_TIMEOUT);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Git exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolve_promise(stdout);
    });
  });
}

// Branch name whitelist regex
const BRANCH_NAME_RE = /^[\w/.\-]+$/;

/**
 * Validate a branch name against the whitelist regex.
 */
function validateBranchName(branch: string): void {
  if (!BRANCH_NAME_RE.test(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
}

/**
 * Validate a project path to prevent injection.
 */
function validatePath(projectPath: string): void {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Invalid project path');
  }
  // Reject null bytes and obvious injection patterns
  if (projectPath.includes('\0') || projectPath.includes(';') || projectPath.includes('&&') || projectPath.includes('||')) {
    throw new Error('Invalid project path');
  }
}

/**
 * Get all branches (local + remote, deduplicated, without remotes/origin/ prefix).
 */
export async function getBranches(projectPath: string): Promise<{ branches: string[]; current: string }> {
  validatePath(projectPath);

  const output = await execGit(projectPath, ['branch', '-a']);
  const branchSet = new Set<string>();

  for (const rawLine of output.split('\n')) {
    // Remove leading whitespace and the current-branch marker '*'
    let line = rawLine.replace(/^\s*[*]?\s*/, '').trim();
    if (!line) continue;

    // Skip HEAD pointer lines like "remotes/origin/HEAD -> origin/main"
    if (line.includes('->')) continue;

    // Strip remotes/origin/ prefix
    line = line.replace(/^remotes\/origin\//, '');

    if (line && BRANCH_NAME_RE.test(line)) {
      branchSet.add(line);
    }
  }

  const currentBranch = await execGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

  return { branches: [...branchSet], current: currentBranch.trim() };
}

/**
 * Checkout a branch by name.
 */
export async function checkoutBranch(projectPath: string, branch: string): Promise<void> {
  validatePath(projectPath);
  validateBranchName(branch);

  await execGit(projectPath, ['checkout', branch]);
}

/**
 * Pull the current branch. Returns the command output.
 */
export async function pullBranch(projectPath: string): Promise<string> {
  validatePath(projectPath);

  const output = await execGit(projectPath, ['pull']);
  return output.trim();
}

/**
 * Fetch a specific branch from origin.
 */
export async function fetchBranch(projectPath: string, branch: string): Promise<void> {
  validatePath(projectPath);
  validateBranchName(branch);

  await execGit(projectPath, ['fetch', 'origin', branch]);
}

/**
 * Add a detached worktree for the given branch.
 * Checks whether the branch exists locally first, falls back to origin/<branch>.
 */
export async function addWorktree(projectPath: string, branch: string, worktreePath: string): Promise<void> {
  validatePath(projectPath);
  validateBranchName(branch);

  // 先检测本地分支是否存在
  let ref = branch;
  try {
    await execGit(projectPath, ['rev-parse', '--verify', branch]);
  } catch {
    // 本地不存在，尝试远程
    ref = `origin/${branch}`;
  }

  await execGit(projectPath, ['worktree', 'add', '--detach', worktreePath, ref]);
}

/**
 * Remove a worktree by path.
 */
export async function removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
  validatePath(projectPath);

  await execGit(projectPath, ['worktree', 'remove', '--force', worktreePath]);
}

/**
 * Prune stale worktree references.
 */
export async function pruneWorktrees(projectPath: string): Promise<void> {
  validatePath(projectPath);

  await execGit(projectPath, ['worktree', 'prune']);
}

/**
 * Generate a temporary worktree path for a given build ID.
 */
export function generateWorktreePath(buildId: string): string {
  return join('/tmp', 'auto-build-worktrees', buildId);
}
