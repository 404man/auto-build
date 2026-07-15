import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createOssClient, type OssConfig } from './ossService.js';

// ========== 类型定义 ==========

export interface StoredTemplate {
  key: string;
  name: string;
  description: string;
  content: string;
  builtin: boolean;
}

export type TemplateType = 'dockerfile' | 'nginx';

export interface Settings {
  dockerfileTemplates: StoredTemplate[];
  nginxConfigs: StoredTemplate[];
  registry: {
    url: string;
    authMethod: 'token' | 'password' | 'aws_ecr';
    username: string;
    secret: string;
  };
  oss?: OssConfig;
}

// ========== 路径常量 ==========

const SETTINGS_DIR = join(homedir(), '.auto-build');
const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json');
const SETTINGS_TMP_PATH = SETTINGS_PATH + '.tmp';

// ========== 内置模板 ==========

const BUILTIN_DOCKERFILE_TEMPLATES: StoredTemplate[] = [
  {
    key: 'node',
    name: 'Node.js (Standard)',
    description: 'Node.js 18 Alpine, npm install & build',
    content: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]`,
    builtin: true,
  },
  {
    key: 'react-nginx',
    name: 'React (Nginx)',
    description: 'Multi-stage: Node build + Nginx serve',
    content: `FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,
    builtin: true,
  },
  {
    key: 'python-flask',
    name: 'Python (Flask)',
    description: 'Python 3.11 slim, pip install & gunicorn',
    content: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]`,
    builtin: true,
  },
  {
    key: 'custom',
    name: 'Custom',
    description: 'Provide your own Dockerfile',
    content: '',
    builtin: true,
  },
];

const BUILTIN_NGINX_CONFIGS: StoredTemplate[] = [
  {
    key: 'standard-spa',
    name: 'Standard SPA',
    description: 'Single page app with try_files fallback',
    content: `server {
    listen 80;
    server_name localhost;
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}`,
    builtin: true,
  },
  {
    key: 'reverse-proxy',
    name: 'Reverse Proxy',
    description: 'Frontend + API proxy to backend',
    content: `server {
    listen 80;
    server_name localhost;
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`,
    builtin: true,
  },
  {
    key: 'custom',
    name: 'Custom',
    description: 'Provide your own Nginx configuration',
    content: '',
    builtin: true,
  },
];

const DEFAULT_SETTINGS: Settings = {
  dockerfileTemplates: BUILTIN_DOCKERFILE_TEMPLATES,
  nginxConfigs: BUILTIN_NGINX_CONFIGS,
  registry: {
    url: '',
    authMethod: 'token',
    username: '',
    secret: '',
  },
  oss: undefined,
};

// ========== 内存缓存 ==========

let settings: Settings = structuredClone(DEFAULT_SETTINGS);
let ossClient: ReturnType<typeof createOssClient> = null;

// ========== 内部辅助 ==========

function getTemplatesArray(type: TemplateType): StoredTemplate[] {
  return type === 'dockerfile' ? settings.dockerfileTemplates : settings.nginxConfigs;
}

let flushPromise: Promise<void> = Promise.resolve();

function enqueueFlush(): Promise<void> {
  flushPromise = flushPromise.then(async () => {
    const data = JSON.stringify(settings, null, 2);
    await writeFile(SETTINGS_TMP_PATH, data, 'utf-8');
    await rename(SETTINGS_TMP_PATH, SETTINGS_PATH);
  }).catch((err) => {
    console.error('[ConfigService] flush failed:', err);
    // 重置队列以允许后续重试
    flushPromise = Promise.resolve();
    throw err;
  });
  return flushPromise;
}

async function flushAndSyncToOss(): Promise<void> {
  await enqueueFlush();
  if (ossClient && settings.oss) {
    const prefix = settings.oss.prefix || 'auto-build/templates/';
    await syncAllTemplatesToOss(ossClient, prefix);
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function syncAllTemplatesToOss(client: NonNullable<ReturnType<typeof createOssClient>>, prefix: string): Promise<void> {
  const { putTemplateToOss } = await import('./ossService.js');
  for (const tpl of settings.dockerfileTemplates.filter(t => !t.builtin)) {
    await putTemplateToOss(client, prefix, 'dockerfile', tpl);
  }
  for (const tpl of settings.nginxConfigs.filter(t => !t.builtin)) {
    await putTemplateToOss(client, prefix, 'nginx', tpl);
  }
}

async function initOssClient(): Promise<void> {
  if (settings.oss?.accessKeyId && settings.oss?.accessKeySecret && settings.oss?.bucket && settings.oss?.region) {
    ossClient = createOssClient(settings.oss);
    if (ossClient) {
      console.log('[ConfigService] OSS client initialized');
      syncFromOss().catch(err => console.warn('[ConfigService] Initial OSS sync failed:', err));
    }
  }
}

// ========== 公开 API ==========

/**
 * 初始化配置服务：启动时调用，幂等。
 * 若 settings.json 不存在则创建目录并写入内置模板；
 * 若已存在则加载到内存缓存。
 */
export async function initConfigService(): Promise<void> {
  if (await fileExists(SETTINGS_PATH)) {
    try {
      const raw = await readFile(SETTINGS_PATH, 'utf-8');
      settings = JSON.parse(raw) as Settings;
    } catch (e) {
      console.error(`[ConfigService] settings.json 解析失败，使用默认配置:`, e);
      // 备份损坏的文件
      await rename(SETTINGS_PATH, SETTINGS_PATH + '.bak').catch(() => {});
      settings = structuredClone(DEFAULT_SETTINGS);
      await enqueueFlush();
    }
    await initOssClient();
    return;
  }

  // 首次启动：创建目录 + 写入默认配置
  await mkdir(SETTINGS_DIR, { recursive: true });
  settings = structuredClone(DEFAULT_SETTINGS);
  await enqueueFlush();
}

/**
 * 列出指定类型的所有模板（不含 content 字段）
 */
export function listTemplates(type: TemplateType): Omit<StoredTemplate, 'content'>[] {
  return getTemplatesArray(type).map(({ content: _, ...rest }) => rest);
}

/**
 * 获取单个模板（含 content）
 */
export function getTemplate(type: TemplateType, key: string): StoredTemplate | undefined {
  return getTemplatesArray(type).find((t) => t.key === key);
}

/**
 * 新增模板，key 不可重复，builtin 由系统控制
 */
export async function addTemplate(
  type: TemplateType,
  template: Omit<StoredTemplate, 'builtin'>,
): Promise<StoredTemplate> {
  const arr = getTemplatesArray(type);
  if (arr.some((t) => t.key === template.key)) {
    throw new Error(`Template key "${template.key}" already exists`);
  }
  const newTemplate: StoredTemplate = { ...template, builtin: false };
  arr.push(newTemplate);
  await flushAndSyncToOss();
  return newTemplate;
}

/**
 * 更新模板（不可修改 key 和 builtin）
 */
export async function updateTemplate(
  type: TemplateType,
  key: string,
  patch: Partial<Omit<StoredTemplate, 'key' | 'builtin'>>,
): Promise<StoredTemplate | undefined> {
  const arr = getTemplatesArray(type);
  const idx = arr.findIndex((t) => t.key === key);
  if (idx === -1) return undefined;

  const updated = { ...arr[idx], ...patch };
  arr[idx] = updated;
  await flushAndSyncToOss();
  return updated;
}

/**
 * 删除模板，builtin 模板不可删除
 */
export async function deleteTemplate(type: TemplateType, key: string): Promise<boolean> {
  const arr = getTemplatesArray(type);
  const idx = arr.findIndex((t) => t.key === key);
  if (idx === -1) return false;
  if (arr[idx].builtin) return false;

  arr.splice(idx, 1);
  await flushAndSyncToOss();
  return true;
}

/**
 * 获取 Registry 配置
 */
export function getRegistryConfig(): Settings['registry'] {
  return { ...settings.registry };
}

/**
 * 保存 Registry 配置
 */
export async function saveRegistryConfig(registry: Settings['registry']): Promise<void> {
  settings.registry = { ...registry };
  await enqueueFlush();
}

// ========== OSS 相关 API ==========

export function getOssConfig(): OssConfig | null {
  if (!settings.oss) return null;
  return {
    ...settings.oss,
    accessKeySecret: settings.oss.accessKeySecret ? '***' : '',
  };
}

export async function saveOssConfig(config: OssConfig): Promise<void> {
  // 如果 secret 是 *** 表示未修改，保留原值
  if (config.accessKeySecret === '***' && settings.oss?.accessKeySecret) {
    config.accessKeySecret = settings.oss.accessKeySecret;
  }
  settings.oss = config;
  await enqueueFlush();
  // 重建 OSS 客户端
  ossClient = createOssClient(config);
  if (ossClient) {
    console.log('[ConfigService] OSS client re-initialized with new config');
  }
}

export async function testOss(): Promise<boolean> {
  if (!ossClient) return false;
  const { testOssConnection: testConn } = await import('./ossService.js');
  return testConn(ossClient);
}

export async function syncToOss(): Promise<void> {
  if (!ossClient || !settings.oss) throw new Error('OSS not configured');
  const prefix = settings.oss.prefix || 'auto-build/templates/';
  await syncAllTemplatesToOss(ossClient, prefix);
}

/**
 * 合并本地用户模板与 OSS 模板：按 key 去重，OSS 优先，本地独有模板保留。
 */
function mergeTemplates(
  localUser: StoredTemplate[],
  ossTemplates: StoredTemplate[],
): StoredTemplate[] {
  const ossMap = new Map(ossTemplates.map(t => [t.key, t]));
  const merged: StoredTemplate[] = [...ossTemplates];
  for (const local of localUser) {
    if (!ossMap.has(local.key)) {
      merged.push(local);
    }
  }
  return merged;
}

export async function syncFromOss(): Promise<void> {
  if (!ossClient || !settings.oss) throw new Error('OSS not configured');
  const { listTemplatesFromOss } = await import('./ossService.js');
  const prefix = settings.oss.prefix || 'auto-build/templates/';

  const dockerTemplates = await listTemplatesFromOss(ossClient, prefix, 'dockerfile');
  const nginxTemplates = await listTemplatesFromOss(ossClient, prefix, 'nginx');

  // 保留 builtin 模板，合并本地用户模板与 OSS 模板（OSS 优先，本地独有保留）
  const localDockerUser = settings.dockerfileTemplates.filter(t => !t.builtin);
  const localNginxUser = settings.nginxConfigs.filter(t => !t.builtin);
  const localDockerBuiltin = settings.dockerfileTemplates.filter(t => t.builtin);
  const localNginxBuiltin = settings.nginxConfigs.filter(t => t.builtin);

  const mergedDocker = mergeTemplates(localDockerUser, dockerTemplates);
  const mergedNginx = mergeTemplates(localNginxUser, nginxTemplates);

  const dockerChanged = mergedDocker.length !== localDockerUser.length ||
    mergedDocker.some((t, i) => t.key !== localDockerUser[i]?.key || t.content !== localDockerUser[i]?.content);
  const nginxChanged = mergedNginx.length !== localNginxUser.length ||
    mergedNginx.some((t, i) => t.key !== localNginxUser[i]?.key || t.content !== localNginxUser[i]?.content);

  if (dockerChanged || nginxChanged) {
    settings.dockerfileTemplates = [...localDockerBuiltin, ...mergedDocker];
    settings.nginxConfigs = [...localNginxBuiltin, ...mergedNginx];
    await enqueueFlush();
    console.log(`[ConfigService] Synced from OSS: ${dockerTemplates.length} dockerfile, ${nginxTemplates.length} nginx templates (merged, ${mergedDocker.length + mergedNginx.length} total user)`);
  } else {
    console.log('[ConfigService] OSS sync: no changes detected');
  }
}
