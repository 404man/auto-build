import Router from '@koa/router';
import { spawn } from 'node:child_process';
import { scanDirectory, browseDirectory } from '../services/directoryService.js';

const directoryRouter = new Router({ prefix: '/api/directory' });

directoryRouter.get('/scan', async (ctx: any) => {
  const dirPath = ctx.query.path;

  if (!dirPath || typeof dirPath !== 'string' || dirPath.trim() === '') {
    ctx.status = 400;
    ctx.body = { success: false, error: '缺少 path 参数' };
    return;
  }

  try {
    const result = await scanDirectory(dirPath.trim());
    ctx.body = { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.status = 400;
    ctx.body = { success: false, error: message };
  }
});

directoryRouter.get('/browse', async (ctx: any) => {
  const dirPath = ctx.query.path;

  if (!dirPath || typeof dirPath !== 'string' || dirPath.trim() === '') {
    ctx.status = 400;
    ctx.body = { success: false, error: '缺少 path 参数' };
    return;
  }

  try {
    const result = await browseDirectory(dirPath.trim());
    ctx.body = { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.status = 400;
    ctx.body = { success: false, error: message };
  }
});

directoryRouter.post('/open', async (ctx: any) => {
  const body = ctx.request.body;
  const dirPath = body?.path;

  if (!dirPath || typeof dirPath !== 'string' || dirPath.trim() === '') {
    ctx.status = 400;
    ctx.body = { success: false, error: '缺少 path 参数' };
    return;
  }

  const trimmed = dirPath.trim();

  // 路径安全校验
  if (!trimmed.startsWith('/')) {
    ctx.status = 400;
    ctx.body = { success: false, error: '路径必须是绝对路径' };
    return;
  }
  if (trimmed.includes('..')) {
    ctx.status = 400;
    ctx.body = { success: false, error: '路径不允许包含 ".."' };
    return;
  }

  try {
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    spawn(openCmd, [trimmed]);
    ctx.body = { success: true, data: { message: `已打开: ${trimmed}` } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.status = 500;
    ctx.body = { success: false, error: message };
  }
});

export default directoryRouter;
