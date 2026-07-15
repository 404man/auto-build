import Router from '@koa/router';
import {
  listTemplates,
  getTemplate,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  getRegistryConfig,
  saveRegistryConfig,
  getOssConfig,
  saveOssConfig,
  testOss,
  syncToOss,
  syncFromOss,
  type TemplateType,
} from '../services/configService.js';

export const settingsRouter = new Router();

// ========== GET /api/settings — 全部配置概览 ==========
settingsRouter.get('/api/settings', async (ctx: any) => {
  try {
    const dockerfileTemplates = listTemplates('dockerfile');
    const nginxConfigs = listTemplates('nginx');
    const registry = getRegistryConfig();
    ctx.body = {
      success: true,
      data: {
        dockerfileTemplates,
        nginxConfigs,
        registry: { ...registry, secret: '***' },
      },
    };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// ========== Dockerfile 模板 CRUD ==========

settingsRouter.get('/api/settings/dockerfile-templates', async (ctx: any) => {
  try {
    const templates = listTemplates('dockerfile');
    ctx.body = { success: true, data: templates };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.get('/api/settings/dockerfile-templates/:key', async (ctx: any) => {
  try {
    const template = getTemplate('dockerfile', ctx.params.key);
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

settingsRouter.post('/api/settings/dockerfile-templates', async (ctx: any) => {
  try {
    const { key, name, description, content } = ctx.request.body ?? {};
    if (!key || typeof key !== 'string') {
      ctx.status = 400;
      ctx.body = { success: false, error: 'key is required and must be a string' };
      return;
    }
    if (!name || typeof name !== 'string') {
      ctx.status = 400;
      ctx.body = { success: false, error: 'name is required and must be a string' };
      return;
    }
    const template = await addTemplate('dockerfile', { key, name, description, content });
    ctx.status = 201;
    ctx.body = { success: true, data: template };
  } catch (err) {
    const msg = (err as Error).message;
    ctx.status = msg.includes('already exists') ? 409 : 500;
    ctx.body = { success: false, error: msg };
  }
});

settingsRouter.put('/api/settings/dockerfile-templates/:key', async (ctx: any) => {
  try {
    const { name, description, content } = ctx.request.body;
    const updated = await updateTemplate('dockerfile', ctx.params.key, { name, description, content });
    if (!updated) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Template not found' };
      return;
    }
    ctx.body = { success: true, data: updated };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.delete('/api/settings/dockerfile-templates/:key', async (ctx: any) => {
  try {
    const existing = getTemplate('dockerfile', ctx.params.key);
    if (!existing) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Template not found' };
      return;
    }
    if (existing.builtin) {
      ctx.status = 403;
      ctx.body = { success: false, error: 'Cannot delete builtin template' };
      return;
    }
    await deleteTemplate('dockerfile', ctx.params.key);
    ctx.body = { success: true, data: { deleted: true } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// ========== Nginx 配置 CRUD ==========

settingsRouter.get('/api/settings/nginx-configs', async (ctx: any) => {
  try {
    const configs = listTemplates('nginx');
    ctx.body = { success: true, data: configs };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.get('/api/settings/nginx-configs/:key', async (ctx: any) => {
  try {
    const config = getTemplate('nginx', ctx.params.key);
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

settingsRouter.post('/api/settings/nginx-configs', async (ctx: any) => {
  try {
    const { key, name, description, content } = ctx.request.body ?? {};
    if (!key || typeof key !== 'string') {
      ctx.status = 400;
      ctx.body = { success: false, error: 'key is required and must be a string' };
      return;
    }
    if (!name || typeof name !== 'string') {
      ctx.status = 400;
      ctx.body = { success: false, error: 'name is required and must be a string' };
      return;
    }
    const config = await addTemplate('nginx', { key, name, description, content });
    ctx.status = 201;
    ctx.body = { success: true, data: config };
  } catch (err) {
    const msg = (err as Error).message;
    ctx.status = msg.includes('already exists') ? 409 : 500;
    ctx.body = { success: false, error: msg };
  }
});

settingsRouter.put('/api/settings/nginx-configs/:key', async (ctx: any) => {
  try {
    const { name, description, content } = ctx.request.body;
    const updated = await updateTemplate('nginx', ctx.params.key, { name, description, content });
    if (!updated) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Config not found' };
      return;
    }
    ctx.body = { success: true, data: updated };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.delete('/api/settings/nginx-configs/:key', async (ctx: any) => {
  try {
    const existing = getTemplate('nginx', ctx.params.key);
    if (!existing) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Config not found' };
      return;
    }
    if (existing.builtin) {
      ctx.status = 403;
      ctx.body = { success: false, error: 'Cannot delete builtin config' };
      return;
    }
    await deleteTemplate('nginx', ctx.params.key);
    ctx.body = { success: true, data: { deleted: true } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// ========== Registry 配置 ==========

settingsRouter.get('/api/settings/registry', async (ctx: any) => {
  try {
    const registry = getRegistryConfig();
    ctx.body = { success: true, data: { ...registry, secret: '***' } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.put('/api/settings/registry', async (ctx: any) => {
  try {
    const { url, authMethod, username, secret } = ctx.request.body;
    const current = getRegistryConfig();
    // secret 为空时不覆盖已有值
    const newSecret = (secret && secret !== '***') ? secret : current.secret;
    await saveRegistryConfig({ url, authMethod, username, secret: newSecret });
    ctx.body = { success: true, data: { url, authMethod, username, secret: '***' } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

// ========== OSS 配置 ==========

settingsRouter.get('/api/settings/oss', async (ctx: any) => {
  try {
    const config = getOssConfig();
    ctx.body = { success: true, data: config };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.patch('/api/settings/oss', async (ctx: any) => {
  try {
    const body = ctx.request.body;
    // 字段白名单
    const allowed: string[] = ['accessKeyId', 'accessKeySecret', 'bucket', 'region', 'endpoint', 'prefix'];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    const current = getOssConfig();
    const merged = { ...current, ...patch };

    // secret 保护：如果 patch 中 secret 是 *** 或 undefined，保留原值
    if ((!patch.accessKeySecret || patch.accessKeySecret === '***')) {
      if (current && current.accessKeySecret && current.accessKeySecret !== '***') {
        merged.accessKeySecret = current.accessKeySecret;
      } else {
        // 首次配置时未提供 secret
        delete merged.accessKeySecret;
      }
    }

    // 必填字段校验
    if (!merged.accessKeyId || !merged.bucket || !merged.region) {
      ctx.status = 400;
      ctx.body = { success: false, error: 'accessKeyId, bucket, region are required' };
      return;
    }

    await saveOssConfig(merged as any);
    const updated = getOssConfig();
    ctx.body = { success: true, data: updated };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.post('/api/settings/oss/test', async (ctx: any) => {
  try {
    const result = await testOss();
    ctx.body = {
      success: true,
      data: {
        connected: result.connected,
        message: result.connected ? 'OSS 连接成功' : `OSS 连接失败: ${result.error}`,
      },
    };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.post('/api/settings/oss/sync-to', async (ctx: any) => {
  try {
    await syncToOss();
    ctx.body = { success: true, data: { message: 'Templates synced to OSS' } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});

settingsRouter.post('/api/settings/oss/sync-from', async (ctx: any) => {
  try {
    await syncFromOss();
    ctx.body = { success: true, data: { message: 'Templates synced from OSS' } };
  } catch (err) {
    ctx.status = 500;
    ctx.body = { success: false, error: (err as Error).message };
  }
});
