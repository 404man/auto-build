import Router from '@koa/router';
import { listNvmVersions } from '../services/nvmService.js';

export const nvmRouter = new Router();

/**
 * GET /api/nvm/versions
 * Returns installed Node versions from nvm and the current runtime version.
 */
nvmRouter.get('/api/nvm/versions', async (ctx: any) => {
  try {
    const data = await listNvmVersions();
    ctx.body = { success: true, data };
  } catch (err) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});
