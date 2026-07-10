import Router from '@koa/router';
import { getBranches, checkoutBranch, pullBranch } from '../services/gitService.js';

export const projectRouter = new Router();

/**
 * GET /api/project/branches?path=xxx
 * Returns the list of branches for the given project path.
 */
projectRouter.get('/api/project/branches', async (ctx: any) => {
  try {
    const projectPath = ctx.query.path as string;
    if (!projectPath) {
      ctx.status = 400;
      ctx.body = { success: false, error: 'Missing required query parameter: path' };
      return;
    }
    const branches = await getBranches(projectPath);
    ctx.body = { success: true, data: branches };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

/**
 * POST /api/project/checkout
 * Body: { path: string, branch: string }
 */
projectRouter.post('/api/project/checkout', async (ctx: any) => {
  try {
    const { path, branch } = ctx.request.body ?? {};
    if (!path || !branch) {
      ctx.status = 400;
      ctx.body = { success: false, error: 'Missing required fields: path, branch' };
      return;
    }
    await checkoutBranch(path, branch);
    ctx.body = { success: true, data: { message: `Checked out branch: ${branch}` } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

/**
 * POST /api/project/pull
 * Body: { path: string }
 */
projectRouter.post('/api/project/pull', async (ctx: any) => {
  try {
    const { path } = ctx.request.body ?? {};
    if (!path) {
      ctx.status = 400;
      ctx.body = { success: false, error: 'Missing required field: path' };
      return;
    }
    const output = await pullBranch(path);
    ctx.body = { success: true, data: { message: output } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});
