import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getNvmDir(): string {
  return process.env.NVM_DIR || join(homedir(), '.nvm');
}

function getVersionsRoot(): string {
  return join(getNvmDir(), 'versions', 'node');
}

/** Normalize to "18.20.8" (no leading v). */
export function normalizeNodeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

/**
 * List installed Node versions via nvm directory layout.
 * Returns versions sorted descending (newest first), plus current runtime version.
 */
export async function listNvmVersions(): Promise<{
  versions: string[];
  current: string;
  nvmAvailable: boolean;
}> {
  const current = normalizeNodeVersion(process.version);
  const root = getVersionsRoot();

  try {
    await access(root);
  } catch {
    return { versions: [current], current, nvmAvailable: false };
  }

  const entries = await readdir(root);
  const versions = entries
    .filter((name) => /^v?\d+\.\d+\.\d+/.test(name))
    .map(normalizeNodeVersion)
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      }
      return 0;
    });

  // Ensure current is present even if somehow outside nvm
  if (current && !versions.includes(current)) {
    versions.unshift(current);
  }

  return { versions, current, nvmAvailable: versions.length > 0 };
}

/**
 * Resolve nvm node bin directory for a version, e.g. ~/.nvm/versions/node/v18.20.8/bin
 */
export async function resolveNvmBinDir(version: string): Promise<string> {
  const normalized = normalizeNodeVersion(version);
  if (!normalized) {
    throw new Error('Node 版本不能为空');
  }
  if (!/^\d+\.\d+\.\d+/.test(normalized)) {
    throw new Error(`无效的 Node 版本: ${version}`);
  }

  const binDir = join(getVersionsRoot(), `v${normalized}`, 'bin');
  try {
    await access(binDir);
  } catch {
    throw new Error(`未找到 nvm 中的 Node 版本 v${normalized}，请先执行: nvm install ${normalized}`);
  }

  const nodeBin = join(binDir, 'node');
  try {
    await access(nodeBin);
  } catch {
    throw new Error(`nvm Node 版本 v${normalized} 的 node 可执行文件不存在`);
  }

  return binDir;
}

/**
 * Build env overrides that put the selected nvm Node bin first on PATH.
 * Empty/undefined version → no override (use process default).
 */
export async function buildNodeVersionEnv(
  version: string | undefined | null,
): Promise<Record<string, string> | undefined> {
  if (!version || !version.trim()) return undefined;
  const binDir = await resolveNvmBinDir(version);
  const pathEnv = process.env.PATH || '';
  return {
    PATH: `${binDir}:${pathEnv}`,
    // Help tools that look at these
    NVM_BIN: binDir,
  };
}
