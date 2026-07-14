import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

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
};

// ========== 内存缓存 ==========

let settings: Settings = structuredClone(DEFAULT_SETTINGS);

// ========== 内部辅助 ==========

function getTemplatesArray(type: TemplateType): StoredTemplate[] {
  return type === 'dockerfile' ? settings.dockerfileTemplates : settings.nginxConfigs;
}

async function flush(): Promise<void> {
  const data = JSON.stringify(settings, null, 2);
  await writeFile(SETTINGS_TMP_PATH, data, 'utf-8');
  await rename(SETTINGS_TMP_PATH, SETTINGS_PATH);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
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
    const raw = await readFile(SETTINGS_PATH, 'utf-8');
    settings = JSON.parse(raw) as Settings;
    return;
  }

  // 首次启动：创建目录 + 写入默认配置
  await mkdir(SETTINGS_DIR, { recursive: true });
  settings = structuredClone(DEFAULT_SETTINGS);
  await flush();
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
export function addTemplate(
  type: TemplateType,
  template: Omit<StoredTemplate, 'builtin'>,
): StoredTemplate {
  const arr = getTemplatesArray(type);
  if (arr.some((t) => t.key === template.key)) {
    throw new Error(`Template key "${template.key}" already exists`);
  }
  const newTemplate: StoredTemplate = { ...template, builtin: false };
  arr.push(newTemplate);
  flush();
  return newTemplate;
}

/**
 * 更新模板（不可修改 key 和 builtin）
 */
export function updateTemplate(
  type: TemplateType,
  key: string,
  patch: Partial<Omit<StoredTemplate, 'key' | 'builtin'>>,
): StoredTemplate | undefined {
  const arr = getTemplatesArray(type);
  const idx = arr.findIndex((t) => t.key === key);
  if (idx === -1) return undefined;

  const updated = { ...arr[idx], ...patch };
  arr[idx] = updated;
  flush();
  return updated;
}

/**
 * 删除模板，builtin 模板不可删除
 */
export function deleteTemplate(type: TemplateType, key: string): boolean {
  const arr = getTemplatesArray(type);
  const idx = arr.findIndex((t) => t.key === key);
  if (idx === -1) return false;
  if (arr[idx].builtin) return false;

  arr.splice(idx, 1);
  flush();
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
export function saveRegistryConfig(registry: Settings['registry']): void {
  settings.registry = { ...registry };
  flush();
}
