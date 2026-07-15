#!/usr/bin/env node
/**
 * 批量下载当前项目 pnpm-lock.yaml 中的 @za/* 和 @x-group/* 包。
 *
 * 放置方式：
 * - 将整个 offline-package-tool 文件夹放到项目根目录下
 * - 脚本会默认读取项目根目录下的 pnpm-lock.yaml
 *
 * 功能说明：
 * 1. 从根 importer 提取当前项目实际锁定版本
 * 2. 用 npm pack 下载 tgz 包
 * 3. 按以下目录结构保存：
 *    offline-packages/@scope/pkg/pkg-version.tgz
 *
 * 例如：
 * - offline-packages/@x-group/icons/icons-1.0.34.tgz
 * - offline-packages/@za/designable/designable-1.0.23.tgz
 *
 * 用法：
 * 1. 只查看将要下载的包，不实际下载
 *    node offline-package-tool/download-scoped-packages.js --dry-run
 *
 * 2. 按默认输出目录下载
 *    node offline-package-tool/download-scoped-packages.js --registry=http://npm.zhonganinfo.com/
 *
 * 3. 指定输出目录
 *    node offline-package-tool/download-scoped-packages.js --output-dir ./offline-packages
 *
 * 4. 指定 scope，多个用逗号分隔
 *    node offline-package-tool/download-scoped-packages.js --scopes=@za,@x-group
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_SCOPES = ['@za/', '@x-group/'];
const PROJECT_ROOT = path.resolve(__dirname, '..');

function stripPeerSuffix(version) {
  const cleaned = String(version || '').trim().replace(/^['"]|['"]$/g, '');
  const peerSuffixIndex = cleaned.indexOf('(');
  return peerSuffixIndex === -1 ? cleaned : cleaned.slice(0, peerSuffixIndex);
}

function extractLockedScopedPackages(lockfileContent, scopes = DEFAULT_SCOPES) {
  const lines = String(lockfileContent || '').split(/\r?\n/);
  const packages = new Map();

  let inRootImporter = false;
  let inDependencySection = false;
  let currentPackageName = null;

  for (const line of lines) {
    if (/^  \.:\s*$/.test(line)) {
      inRootImporter = true;
      inDependencySection = false;
      currentPackageName = null;
      continue;
    }

    if (inRootImporter && /^[^ ]/.test(line) && line.trim() !== '.') {
      break;
    }

    if (!inRootImporter) {
      continue;
    }

    const dependencySectionMatch = line.match(
      /^    (dependencies|devDependencies|optionalDependencies|peerDependencies):\s*$/
    );
    if (dependencySectionMatch) {
      inDependencySection = true;
      currentPackageName = null;
      continue;
    }

    if (/^    [^ ].*:\s*$/.test(line) && !dependencySectionMatch) {
      inDependencySection = false;
      currentPackageName = null;
      continue;
    }

    if (!inDependencySection) {
      continue;
    }

    const packageMatch = line.match(/^      ['"]?(@[^'":]+\/[^'":]+|[^'":]+)['"]?:\s*$/);
    if (packageMatch) {
      const packageName = packageMatch[1];
      currentPackageName = scopes.some((scope) => packageName.startsWith(scope)) ? packageName : null;
      continue;
    }

    const versionMatch = line.match(/^        version:\s+(.+?)\s*$/);
    if (versionMatch && currentPackageName) {
      packages.set(currentPackageName, stripPeerSuffix(versionMatch[1]));
      currentPackageName = null;
    }
  }

  return [...packages.entries()]
    .map(([name, version]) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function makePackageId(name, version) {
  return `${name}@${stripPeerSuffix(version)}`;
}

function parsePackageKey(rawKey) {
  const key = String(rawKey || '').trim().replace(/^['"]|['"]$/g, '');
  const match = key.match(/^(@[^/]+\/[^@]+|[^@]+)@(.+)$/);

  if (!match) {
    return null;
  }

  return {
    name: match[1],
    version: stripPeerSuffix(match[2]),
  };
}

function parsePackageDependencyGraph(lockfileContent) {
  const lines = String(lockfileContent || '').split(/\r?\n/);
  const graph = new Map();

  let inPackagesSection = false;
  let currentPackageId = null;
  let inDependencySection = false;

  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      inPackagesSection = true;
      currentPackageId = null;
      inDependencySection = false;
      continue;
    }

    if (!inPackagesSection) {
      continue;
    }

    const packageEntryMatch = line.match(/^  ['"](.+?)['"]:\s*$/);
    if (packageEntryMatch) {
      const pkg = parsePackageKey(packageEntryMatch[1]);
      currentPackageId = pkg ? makePackageId(pkg.name, pkg.version) : null;
      inDependencySection = false;

      if (currentPackageId && !graph.has(currentPackageId)) {
        graph.set(currentPackageId, []);
      }
      continue;
    }

    if (/^  [^ ].*:\s*$/.test(line)) {
      currentPackageId = null;
      inDependencySection = false;
      continue;
    }

    if (!currentPackageId) {
      continue;
    }

    const dependencySectionMatch = line.match(/^    (dependencies|optionalDependencies):\s*$/);
    if (dependencySectionMatch) {
      inDependencySection = true;
      continue;
    }

    if (/^    [^ ].*:\s*$/.test(line) && !dependencySectionMatch) {
      inDependencySection = false;
      continue;
    }

    if (!inDependencySection) {
      continue;
    }

    const dependencyMatch = line.match(/^      ['"]?(@[^'":]+\/[^'":]+|[^'":]+)['"]?:\s+(.+?)\s*$/);
    if (!dependencyMatch) {
      continue;
    }

    const dependencyName = dependencyMatch[1];
    const dependencyVersion = stripPeerSuffix(dependencyMatch[2]);
    graph.get(currentPackageId).push({
      name: dependencyName,
      version: dependencyVersion,
    });
  }

  return graph;
}

function collectScopedPackagesFromLockfile(lockfileContent, scopes = DEFAULT_SCOPES) {
  const directPackages = extractLockedScopedPackages(lockfileContent, scopes);
  const graph = parsePackageDependencyGraph(lockfileContent);
  const collectedPackages = new Map();
  const queue = [...directPackages];

  while (queue.length > 0) {
    const currentPackage = queue.shift();
    const currentPackageId = makePackageId(currentPackage.name, currentPackage.version);

    if (collectedPackages.has(currentPackageId)) {
      continue;
    }

    collectedPackages.set(currentPackageId, {
      name: currentPackage.name,
      version: stripPeerSuffix(currentPackage.version),
    });

    const dependencies = graph.get(currentPackageId) || [];
    for (const dependency of dependencies) {
      if (!scopes.some((scope) => dependency.name.startsWith(scope))) {
        continue;
      }

      queue.push(dependency);
    }
  }

  return [...collectedPackages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function parseArgs(argv) {
  const args = {
    lockfile: path.resolve(PROJECT_ROOT, 'pnpm-lock.yaml'),
    outputDir: path.resolve(PROJECT_ROOT, 'offline-packages'),
    registry: process.env.npm_config_registry || '',
    dryRun: false,
    scopes: [...DEFAULT_SCOPES],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--lockfile') {
      args.lockfile = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--output-dir') {
      args.outputDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--registry') {
      args.registry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--scopes') {
      args.scopes = argv[index + 1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.endsWith('/') ? item : `${item}/`));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function getPackageOutputDir(packageName, outputDir) {
  return path.join(outputDir, ...packageName.split('/'));
}

function getPackageTarballName(pkg) {
  const packageLeafName = pkg.name.split('/').pop();
  return `${packageLeafName}-${pkg.version}.tgz`;
}

function getPackageTarballPath(pkg, outputDir) {
  return path.join(getPackageOutputDir(pkg.name, outputDir), getPackageTarballName(pkg));
}

function packPackage(pkg, options) {
  const spec = `${pkg.name}@${pkg.version}`;
  const packageOutputDir = getPackageOutputDir(pkg.name, options.outputDir);
  const targetTarballPath = getPackageTarballPath(pkg, options.outputDir);
  const commandArgs = ['pack', spec, '--pack-destination', packageOutputDir];

  if (options.registry) {
    commandArgs.push(`--registry=${options.registry}`);
  }

  fs.mkdirSync(packageOutputDir, { recursive: true });
  console.log(`[pack] ${spec} -> ${targetTarballPath}`);

  const result = spawnSync('npm', commandArgs, {
    cwd: path.dirname(options.lockfile),
    encoding: 'utf8',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(`npm pack failed for ${spec}`);
  }

  const packedFileName = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (!packedFileName) {
    throw new Error(`Could not determine tarball name for ${spec}`);
  }

  const packedFilePath = path.join(packageOutputDir, packedFileName);
  if (packedFilePath !== targetTarballPath) {
    fs.renameSync(packedFilePath, targetTarballPath);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const lockfileContent = fs.readFileSync(options.lockfile, 'utf8');
  const packages = collectScopedPackagesFromLockfile(lockfileContent, options.scopes);

  if (packages.length === 0) {
    throw new Error(`No packages found for scopes: ${options.scopes.join(', ')}`);
  }

  console.log(`[info] Found ${packages.length} packages`);
  for (const pkg of packages) {
    console.log(`- ${pkg.name}@${pkg.version} -> ${getPackageTarballPath(pkg, options.outputDir)}`);
  }

  if (options.dryRun) {
    console.log('[info] Dry run complete, no packages were downloaded');
    return;
  }

  fs.mkdirSync(options.outputDir, { recursive: true });
  for (const pkg of packages) {
    packPackage(pkg, options);
  }

  console.log(`[done] Packages saved to ${options.outputDir}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[error] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  collectScopedPackagesFromLockfile,
  extractLockedScopedPackages,
  parsePackageDependencyGraph,
  parsePackageKey,
  stripPeerSuffix,
};
