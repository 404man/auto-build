import Router from '@koa/router';
import { listTemplates, getTemplate } from '../services/configService.js';
import { checkDockerDaemon } from '../services/dockerService.js';

export const dockerRouter = new Router();

// GET /api/docker/templates
dockerRouter.get('/api/docker/templates', async (ctx: any) => {
  try {
    const templates = listTemplates('dockerfile');
    ctx.body = { success: true, data: templates };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// GET /api/docker/template/:name
dockerRouter.get('/api/docker/template/:name', async (ctx: any) => {
  try {
    const template = getTemplate('dockerfile', ctx.params.name);
    if (!template) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Template not found' };
      return;
    }
    ctx.body = { success: true, data: template };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// GET /api/docker/nginx-configs
dockerRouter.get('/api/docker/nginx-configs', async (ctx: any) => {
  try {
    const configs = listTemplates('nginx');
    ctx.body = { success: true, data: configs };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// GET /api/docker/nginx-config/:name
dockerRouter.get('/api/docker/nginx-config/:name', async (ctx: any) => {
  try {
    const config = getTemplate('nginx', ctx.params.name);
    if (!config) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Config not found' };
      return;
    }
    ctx.body = { success: true, data: config };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// GET /api/docker/daemon-status
dockerRouter.get('/api/docker/daemon-status', async (ctx: any) => {
  try {
    const available = await checkDockerDaemon();
    ctx.body = { success: true, data: { available } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});
