import axios from 'axios';
import { getGlobalMessage } from '../utils/message';
import type { DockerTemplate, DockerTemplateDetail, NginxConfig, NginxConfigDetail, DockerBuildOptions, SettingsData, StoredTemplate, TemplateListItem, RegistrySettings, OssSettings, DockerBuildSettings } from '../types/buildConfig';
import type { AxiosResponse } from 'axios';

/* ---------- SubApp (Micro Frontend) ---------- */
export interface SubApp {
  id: string;
  routePath: string;
  deployDir: string;
  projectName: string;
  enabled: boolean;
}

const http = axios.create({ baseURL: '/api' });

// 统一错误提示拦截器
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err?.response?.data?.error || err?.message || '请求失败';
    getGlobalMessage()?.error(msg);
    return Promise.reject(err);
  },
);

/* ---------- Directory API ---------- */
export const directoryApi = {
  scan(path: string) {
    return http.get<{ success: boolean; data: { projects: { name: string; path: string; isGitRepo: boolean }[] } }>(
      '/directory/scan',
      { params: { path } },
    );
  },
  browse(path: string) {
    return http.get<{ success: boolean; data: { currentPath: string; parentPath: string | null; directories: { name: string; path: string }[] } }>(
      '/directory/browse',
      { params: { path } },
    );
  },
  openDirectory(path: string) {
    return http.post<{ success: boolean; data: { message: string } }>(
      '/directory/open',
      { path },
    );
  },
};

/* ---------- Project API ---------- */
export const projectApi = {
  getBranches(path: string) {
    return http.get<{ success: boolean; data: { branches: string[]; current: string } }>(
      '/project/branches',
      { params: { path } },
    );
  },
  checkout(path: string, branch: string) {
    return http.post<{ success: boolean; data: { message: string; branch: string } }>(
      '/project/checkout',
      { path, branch },
    );
  },
  pull(path: string) {
    return http.post<{ success: boolean; data: { message: string } }>(
      '/project/pull',
      { path },
    );
  },
};

/* ---------- Build API ---------- */
export const buildApi = {
  start(projectPath: string, socketId: string, branch?: string, dockerOptions?: DockerBuildOptions, installCommand?: string, buildCommand?: string, nodeVersion?: string) {
    return http.post<{ success: boolean; data: { buildId: string; status: string; packageManager: string } }>(
      '/build/start',
      { projectPath, socketId, branch, dockerOptions, installCommand, buildCommand, nodeVersion },
    );
  },
  startBatch(projects: Array<{ name: string; path: string; branch?: string; dockerOptions?: DockerBuildOptions }>, socketId: string, installCommand?: string, buildCommand?: string, nodeVersion?: string) {
    return http.post<{ success: boolean; data: { batchId: string; buildIds: string[] } }>(
      '/build/batch',
      { projects, socketId, installCommand, buildCommand, nodeVersion },
    );
  },
  getBatchStatus(batchId: string) {
    return http.get<{
      success: boolean;
      data: {
        batchId: string;
        status: 'running' | 'completed';
        currentIndex: number;
        total: number;
        results: Array<{ projectName: string; buildId: string; status: 'pending' | 'completed' | 'failed' | 'skipped'; zipSize?: number }>;
        createdAt: number;
        cacheClearedAt?: number;
      };
    }>(`/build/batch/${batchId}`);
  },
  download(buildId: string) {
    window.open(`/api/build/download/${buildId}`, '_blank');
  },
  downloadImage(buildId: string, gzip?: boolean) {
    const q = gzip === undefined ? '' : `?gzip=${gzip ? '1' : '0'}`;
    window.open(`/api/build/download-image/${buildId}${q}`, '_blank');
  },
  cancel(buildId: string) {
    return http.post<{ success: boolean; data: { message: string } }>(
      `/build/cancel/${buildId}`,
      {},
    );
  },
  getStatus(buildId: string) {
    return http.get<{
      success: boolean;
      data: { id: string; status: string; packageManager: string; error?: string; createdAt: string; cacheClearedAt?: number };
    }>(`/build/status/${buildId}`);
  },
};

/* ---------- Docker API ---------- */
export const dockerApi = {
  getTemplates: async (): Promise<DockerTemplate[]> => {
    const res = await http.get<{ success: boolean; data: DockerTemplate[] }>('/docker/templates');
    return res.data.data;
  },

  getTemplateDetail: async (name: string): Promise<DockerTemplateDetail> => {
    const res = await http.get<{ success: boolean; data: DockerTemplateDetail }>(`/docker/template/${name}`);
    return res.data.data;
  },

  getNginxConfigs: async (): Promise<NginxConfig[]> => {
    const res = await http.get<{ success: boolean; data: NginxConfig[] }>('/docker/nginx-configs');
    return res.data.data;
  },

  getNginxConfigDetail: async (name: string): Promise<NginxConfigDetail> => {
    const res = await http.get<{ success: boolean; data: NginxConfigDetail }>(`/docker/nginx-config/${name}`);
    return res.data.data;
  },

  checkDaemon: async (): Promise<boolean> => {
    const res = await http.get<{ success: boolean; data: { available: boolean } }>('/docker/daemon-status');
    return res.data.data.available;
  },
};

/* ---------- Settings API ---------- */
export const settingsApi = {
  // 全局概览
  getSettings: (): Promise<AxiosResponse<{ success: boolean; data: SettingsData }>> =>
    http.get('/settings'),

  // Dockerfile 模板 CRUD
  listDockerfileTemplates: (): Promise<AxiosResponse<{ success: boolean; data: TemplateListItem[] }>> =>
    http.get('/settings/dockerfile-templates'),
  getDockerfileTemplate: (key: string): Promise<AxiosResponse<{ success: boolean; data: StoredTemplate }>> =>
    http.get(`/settings/dockerfile-templates/${key}`),
  createDockerfileTemplate: (data: { key: string; name: string; description: string; content: string }): Promise<AxiosResponse<{ success: boolean; data: StoredTemplate }>> =>
    http.post('/settings/dockerfile-templates', data),
  updateDockerfileTemplate: (key: string, data: { name?: string; description?: string; content?: string }): Promise<AxiosResponse<{ success: boolean; data: StoredTemplate }>> =>
    http.put(`/settings/dockerfile-templates/${key}`, data),
  deleteDockerfileTemplate: (key: string): Promise<AxiosResponse<{ success: boolean }>> =>
    http.delete(`/settings/dockerfile-templates/${key}`),

  // Nginx 配置 CRUD
  listNginxConfigs: (): Promise<AxiosResponse<{ success: boolean; data: TemplateListItem[] }>> =>
    http.get('/settings/nginx-configs'),
  getNginxConfig: (key: string): Promise<AxiosResponse<{ success: boolean; data: StoredTemplate }>> =>
    http.get(`/settings/nginx-configs/${key}`),
  createNginxConfig: (data: { key: string; name: string; description: string; content: string }): Promise<AxiosResponse<{ success: boolean; data: StoredTemplate }>> =>
    http.post('/settings/nginx-configs', data),
  updateNginxConfig: (key: string, data: { name?: string; description?: string; content?: string }): Promise<AxiosResponse<{ success: boolean; data: StoredTemplate }>> =>
    http.put(`/settings/nginx-configs/${key}`, data),
  deleteNginxConfig: (key: string): Promise<AxiosResponse<{ success: boolean }>> =>
    http.delete(`/settings/nginx-configs/${key}`),

  // Registry
  getRegistry: (): Promise<AxiosResponse<{ success: boolean; data: RegistrySettings }>> =>
    http.get('/settings/registry'),
  updateRegistry: (data: RegistrySettings): Promise<AxiosResponse<{ success: boolean; data: RegistrySettings }>> =>
    http.put('/settings/registry', data),

  getDockerBuild: (): Promise<AxiosResponse<{ success: boolean; data: DockerBuildSettings }>> =>
    http.get('/settings/docker-build'),
  updateDockerBuild: (data: DockerBuildSettings): Promise<AxiosResponse<{ success: boolean; data: DockerBuildSettings }>> =>
    http.put('/settings/docker-build', data),

  // OSS
  getOss: (): Promise<AxiosResponse<{ success: boolean; data: OssSettings }>> =>
    http.get('/settings/oss'),
  updateOss: (data: Partial<OssSettings>): Promise<AxiosResponse<{ success: boolean; data: OssSettings }>> =>
    http.patch('/settings/oss', data),
  testOss: (): Promise<AxiosResponse<{ success: boolean; data: { connected: boolean; message: string } }>> =>
    http.post('/settings/oss/test'),
  syncToOss: (): Promise<AxiosResponse<{ success: boolean; data: { message: string } }>> =>
    http.post('/settings/oss/sync-to'),
  syncFromOss: (): Promise<AxiosResponse<{ success: boolean; data: { message: string } }>> =>
    http.post('/settings/oss/sync-from'),

  // 缓存管理
  clearArtifacts: (): Promise<AxiosResponse<{ success: boolean; data: { message: string; count: number } }>> =>
    http.post('/settings/clear-artifacts'),
  getCacheClearedAt: (): Promise<AxiosResponse<{ success: boolean; data: { cacheClearedAt: number } }>> =>
    http.get('/settings/cache-cleared-at'),

  // 微前端子应用管理
  getSubApps: (): Promise<AxiosResponse<{ success: boolean; data: SubApp[] }>> =>
    http.get('/settings/sub-apps'),
  saveSubApps: (subApps: SubApp[]): Promise<AxiosResponse<{ success: boolean }>> =>
    http.put('/settings/sub-apps', { subApps }),
  generateNginx: (params: { mode: 'standard' | 'docker'; subApps: SubApp[]; options: Record<string, any> }): Promise<AxiosResponse<{ success: boolean; data: { config: string } }>> =>
    http.post('/settings/nginx/generate', params),
};

/* ---------- NVM / Node versions ---------- */
export const nvmApi = {
  listVersions() {
    return http.get<{
      success: boolean;
      data: { versions: string[]; current: string; nvmAvailable: boolean };
    }>('/nvm/versions');
  },
};

/* ---------- Download API ---------- */
export const downloadApi = {
  start: (data: {
    projectPath: string;
    socketId: string;
    branch?: string;
    lockfileName?: string;
    scopes?: string;
    registry?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: { downloadId: string } }>> =>
    http.post('/download/start', data),

  download: (downloadId: string) => {
    window.open(`/api/download/download/${downloadId}`, '_blank');
  },

  cancel: (downloadId: string): Promise<AxiosResponse<{ success: boolean }>> =>
    http.post(`/download/cancel/${downloadId}`),

  getStatus: (downloadId: string): Promise<AxiosResponse<{
    success: boolean;
    data: {
      status: string;
      projectName?: string;
      error?: string;
      zipPath?: string;
    };
  }>> => http.get(`/download/status/${downloadId}`),
};
