import Router from '@koa/router';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  runDownload,
  cancelDownload,
  getDownloadTask,
  getDownloadZipPath,
} from '../services/downloadService.js';

export const downloadRouter = new Router();

// ========== POST /api/download/start ==========
// body: { projectPath, socketId, branch?, lockfileName?, scopes?, registry? }
// response: { success, data: { downloadId } } | { success: false, error }
downloadRouter.post('/start', async (ctx: any) => {
  try {
    const body = ctx.request.body;
    const { projectPath, socketId, branch, lockfileName, scopes, registry } = body ?? {};

    if (!projectPath || !socketId) {
      ctx.status = 400;
      ctx.body = { success: false, error: '缺少 projectPath 或 socketId' };
      return;
    }

    const downloadId = randomUUID();

    // 立即响应（不等待下载完成）
    ctx.body = { success: true, data: { downloadId } };

    // fire-and-forget：下载在后台异步执行
    runDownload(projectPath, socketId, branch, { lockfileName, scopes, registry }, downloadId).catch((err) => {
      console.error(`[Download] downloadId=${downloadId} unhandled error:`, err);
    });
  } catch (err) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

// ========== GET /api/download/download/:downloadId ==========
// 流式传输 zip 文件
downloadRouter.get('/download/:downloadId', async (ctx: any) => {
  const { downloadId } = ctx.params;
  const task = getDownloadTask(downloadId);

  if (!task) {
    // 磁盘 fallback：服务器重启后 Map 丢失，直接检查 zip 是否存在
    // downloadId 必须是合法 UUID，防止路径穿越
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(downloadId)) {
      ctx.status = 404;
      ctx.body = { success: false, error: '下载产物不存在或已过期' };
      return;
    }

    const zipPath = join(homedir(), '.auto-build', 'artifacts', `offline-${downloadId}.zip`);
    try {
      const stats = await stat(zipPath);
      if (stats.isFile()) {
        ctx.status = 200;
        ctx.set('Content-Type', 'application/zip');
        ctx.set('Content-Disposition', `attachment; filename="offline-${downloadId}.zip"`);
        ctx.set('Content-Length', String(stats.size));
        ctx.body = createReadStream(zipPath);
        return;
      }
    } catch { /* 文件不存在 */ }

    ctx.status = 404;
    ctx.body = { success: false, error: '下载产物不存在或已过期' };
    return;
  }

  if (task.status !== 'completed') {
    ctx.status = 400;
    ctx.body = { success: false, error: `下载任务状态为: ${task.status}，无法下载` };
    return;
  }

  const zipPath = getDownloadZipPath(downloadId);
  if (!zipPath) {
    ctx.status = 404;
    ctx.body = { success: false, error: 'zip 文件路径不存在' };
    return;
  }

  try {
    const stats = await stat(zipPath);
    const fileName = task.projectName ? `offline-${task.projectName}.zip` : `offline-${downloadId}.zip`;

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

// ========== POST /api/download/cancel/:downloadId ==========
// 取消下载
downloadRouter.post('/cancel/:downloadId', async (ctx: any) => {
  const { downloadId } = ctx.params;
  const task = getDownloadTask(downloadId);

  if (!task) {
    ctx.status = 404;
    ctx.body = { success: false, error: '下载任务不存在' };
    return;
  }

  const cancelled = cancelDownload(downloadId);
  if (cancelled) {
    ctx.body = { success: true, data: { downloadId, status: 'cancelled' } };
  } else {
    ctx.body = {
      success: false,
      error: `无法取消状态为 ${task.status} 的下载任务`,
    };
  }
});

// ========== GET /api/download/status/:downloadId ==========
// 返回下载任务状态
downloadRouter.get('/status/:downloadId', async (ctx: any) => {
  const { downloadId } = ctx.params;
  const task = getDownloadTask(downloadId);

  if (!task) {
    ctx.status = 404;
    ctx.body = { success: false, error: '下载任务不存在' };
    return;
  }

  ctx.body = {
    success: true,
    data: {
      downloadId: task.id,
      projectPath: task.projectPath,
      projectName: task.projectName,
      status: task.status,
      zipPath: task.zipPath,
      error: task.error,
      createdAt: task.createdAt,
    },
  };
});
