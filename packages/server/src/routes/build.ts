import Router from '@koa/router';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  runBuild,
  runBatchBuild,
  cancelBuild,
  getBuildTask,
  getBatchBuildTask,
  getZipPath,
  getCacheClearedAt,
  getDockerImageMeta,
} from '../services/buildService.js';
import { dockerImageExists, spawnDockerSave } from '../services/dockerService.js';
import { getDockerBuildSettings } from '../services/configService.js';
import { createGzip } from 'node:zlib';

const buildRouter = new Router();

// ========== POST /api/build/start ==========
// body: { projectPath, socketId }
// response: { success, data: { buildId, packageManager } } | { success: false, error }
buildRouter.post('/start', async (ctx: any) => {
  try {
    const body = ctx.request.body;
    const { projectPath, socketId, branch, projectName, dockerOptions, installCommand, buildCommand, nodeVersion } = body ?? {};

    if (!projectPath || !socketId) {
      ctx.status = 400;
      ctx.body = { success: false, error: '缺少 projectPath 或 socketId' };
      return;
    }

    const buildId = randomUUID();

    // 立即响应（不等待构建完成）
    ctx.body = { success: true, data: { buildId } };

    // fire-and-forget：构建在后台异步执行
    runBuild(projectPath, socketId, branch, projectName, dockerOptions, installCommand, buildCommand, buildId, nodeVersion).catch((err) => {
      console.error(`[Build] buildId=${buildId} unhandled error:`, err);
    });
  } catch (err) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

// ========== GET /api/build/download/:buildId ==========
// 流式传输 zip 文件，下载后自动清理临时文件
buildRouter.get('/download/:buildId', async (ctx: any) => {
  const { buildId } = ctx.params;
  const task = getBuildTask(buildId);

  if (!task) {
    // 磁盘 fallback：服务器重启后 Map 丢失，直接检查 zip 是否存在
    // buildId 必须是合法 UUID，防止路径穿越
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buildId)) {
      ctx.status = 404;
      ctx.body = { success: false, error: '构建产物不存在或已过期' };
      return;
    }

    const zipPath = join(homedir(), '.auto-build', 'artifacts', `dist-${buildId}.zip`);
    try {
      const stats = await stat(zipPath);
      if (stats.isFile()) {
        ctx.status = 200;
        ctx.set('Content-Type', 'application/zip');
        ctx.set('Content-Disposition', `attachment; filename="dist-${buildId}.zip"`);
        ctx.set('Content-Length', String(stats.size));
        ctx.body = createReadStream(zipPath);
        return;
      }
    } catch { /* 文件不存在 */ }

    ctx.status = 404;
    ctx.body = { success: false, error: '构建产物不存在或已过期' };
    return;
  }

  if (task.status !== 'completed') {
    ctx.status = 400;
    ctx.body = { success: false, error: `构建任务状态为: ${task.status}，无法下载` };
    return;
  }

  const zipPath = getZipPath(buildId);
  if (!zipPath) {
    ctx.status = 404;
    ctx.body = { success: false, error: 'zip 文件路径不存在' };
    return;
  }

  try {
    const stats = await stat(zipPath);
    const fileName = task.projectName ? `${task.projectName}.zip` : `dist-${buildId}.zip`;

    ctx.status = 200;
    ctx.set('Content-Type', 'application/zip');
    ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
    ctx.set('Content-Length', String(stats.size));
    ctx.body = createReadStream(zipPath);
  } catch (err) {
    if (!ctx.res.headersSent) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
});

const BUILD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseGzipQuery(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return fallback;
}

function safeDownloadName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'image';
}

// ========== GET /api/build/download-image/:buildId ==========
// 流式 docker save，?gzip=1 输出 .tar.gz
buildRouter.get('/download-image/:buildId', async (ctx: any) => {
  const { buildId } = ctx.params;
  if (!BUILD_ID_RE.test(buildId)) {
    ctx.status = 404;
    ctx.body = { success: false, error: '构建产物不存在或已过期' };
    return;
  }

  const task = getBuildTask(buildId);
  if (task && task.status !== 'completed') {
    ctx.status = 400;
    ctx.body = { success: false, error: `构建任务状态为: ${task.status}，无法下载镜像` };
    return;
  }

  const meta = await getDockerImageMeta(buildId);
  if (!meta) {
    ctx.status = 404;
    ctx.body = { success: false, error: '未找到 Docker 镜像记录，请确认本次为镜像构建' };
    return;
  }

  const imageRef = `${meta.image}:${meta.tag}`;
  const exists = await dockerImageExists(imageRef);
  if (!exists) {
    ctx.status = 404;
    ctx.body = { success: false, error: `本地不存在镜像 ${imageRef}，请重新构建后再下载` };
    return;
  }

  const settings = getDockerBuildSettings();
  const gzip = parseGzipQuery(ctx.query.gzip, meta.gzipImage ?? settings.gzipImage !== false);
  const fileBase = safeDownloadName(`${meta.image}_${meta.tag}`);

  let child;
  try {
    child = spawnDockerSave(imageRef);
  } catch (err) {
    ctx.status = 400;
    ctx.body = { success: false, error: err instanceof Error ? err.message : String(err) };
    return;
  }

  if (!child.stdout) {
    child.kill('SIGTERM');
    ctx.status = 500;
    ctx.body = { success: false, error: 'docker save 无法启动' };
    return;
  }

  ctx.req.on('close', () => {
    if (!child.killed) child.kill('SIGTERM');
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    console.warn(`[docker save] ${chunk.toString()}`);
  });

  ctx.status = 200;
  if (gzip) {
    ctx.set('Content-Type', 'application/gzip');
    ctx.set('Content-Disposition', `attachment; filename="${fileBase}.tar.gz"`);
    const gzipStream = createGzip({ level: 6 });
    child.stdout.pipe(gzipStream);
    ctx.body = gzipStream;
  } else {
    ctx.set('Content-Type', 'application/x-tar');
    ctx.set('Content-Disposition', `attachment; filename="${fileBase}.tar"`);
    ctx.body = child.stdout;
  }
});

// ========== POST /api/build/cancel/:buildId ==========
// 取消构建
buildRouter.post('/cancel/:buildId', async (ctx: any) => {
  const { buildId } = ctx.params;
  const task = getBuildTask(buildId);

  if (!task) {
    ctx.status = 404;
    ctx.body = { success: false, error: '构建任务不存在' };
    return;
  }

  const cancelled = cancelBuild(buildId);
  if (cancelled) {
    ctx.body = { success: true, data: { buildId, status: 'cancelled' } };
  } else {
    ctx.body = {
      success: false,
      error: `无法取消状态为 ${task.status} 的构建任务`,
    };
  }
});

// ========== GET /api/build/status/:buildId ==========
// 返回构建任务状态
buildRouter.get('/status/:buildId', async (ctx: any) => {
  const { buildId } = ctx.params;
  const task = getBuildTask(buildId);

  if (!task) {
    ctx.status = 404;
    ctx.body = { success: false, error: '构建任务不存在' };
    return;
  }

  ctx.body = {
    success: true,
    data: {
      buildId: task.id,
      projectPath: task.projectPath,
      status: task.status,
      packageManager: task.packageManager,
      zipPath: task.zipPath,
      error: task.error,
      createdAt: task.createdAt,
      cacheClearedAt: getCacheClearedAt(),
    },
  };
});

// ========== POST /api/build/batch ==========
// body: { projects: Array<{name, path, branch?}>, socketId: string }
// response: { success, data: { batchId, buildIds } }
buildRouter.post('/batch', async (ctx: any) => {
  try {
    const body = ctx.request.body;
    const { projects, branch, socketId, installCommand, buildCommand, nodeVersion } = body ?? {};

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      ctx.status = 400;
      ctx.body = { success: false, error: '缺少 projects 或 projects 为空' };
      return;
    }

    if (!socketId) {
      ctx.status = 400;
      ctx.body = { success: false, error: '缺少 socketId' };
      return;
    }

    // 向后兼容：如果 body 中有全局 branch 且项目自身没有 branch，则用全局 branch 作为 fallback
    const normalizedProjects = projects.map((p: { name: string; path: string; branch?: string }) => ({
      ...p,
      branch: p.branch || branch || undefined,
    }));

    const batchId = randomUUID();
    // 为每个项目预生成 buildId
    const buildIds = normalizedProjects.map(() => randomUUID());

    // 立即响应（不等待构建完成）
    ctx.body = { success: true, data: { batchId, buildIds } };

    // fire-and-forget：批量构建在后台异步执行
    runBatchBuild(normalizedProjects, socketId, installCommand, buildCommand, buildIds, batchId, nodeVersion).catch((err) => {
      console.error(`[Build] batchId=${batchId} unhandled error:`, err);
    });
  } catch (err) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

// ========== GET /api/build/batch/:batchId ==========
// 返回批次构建的整体状态和每个项目的状态
buildRouter.get('/batch/:batchId', async (ctx: any) => {
  const { batchId } = ctx.params;
  const batch = getBatchBuildTask(batchId);

  if (!batch) {
    ctx.status = 404;
    ctx.body = { success: false, error: '批量构建任务不存在' };
    return;
  }

  ctx.body = {
    success: true,
    data: {
      batchId: batch.batchId,
      status: batch.status,
      currentIndex: batch.currentIndex,
      total: batch.projects.length,
      results: batch.results,
      createdAt: batch.createdAt,
      cacheClearedAt: getCacheClearedAt(),
    },
  };
});

export { buildRouter };

