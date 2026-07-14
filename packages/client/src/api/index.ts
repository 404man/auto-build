import axios from 'axios';
import { message } from 'antd';
import type { DockerTemplate, DockerTemplateDetail, NginxConfig, NginxConfigDetail, DockerBuildOptions, SettingsData, StoredTemplate, TemplateListItem, RegistrySettings } from '../types/buildConfig';
import type { AxiosResponse } from 'axios';

const http = axios.create({ baseURL: '/api' });

// 统一错误提示拦截器
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err?.response?.data?.error || err?.message || '请求失败';
    message.error(msg);
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
  start(projectPath: string, socketId: string, branch?: string, dockerOptions?: DockerBuildOptions, installCommand?: string, buildCommand?: string) {
    return http.post<{ success: boolean; data: { buildId: string; status: string; packageManager: string } }>(
      '/build/start',
      { projectPath, socketId, branch, dockerOptions, installCommand, buildCommand },
    );
  },
  startBatch(projects: Array<{ name: string; path: string; branch?: string; dockerOptions?: DockerBuildOptions }>, socketId: string, installCommand?: string, buildCommand?: string) {
    return http.post<{ success: boolean; data: { batchId: string; buildIds: string[] } }>(
      '/build/batch',
      { projects, socketId, installCommand, buildCommand },
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
      };
    }>(`/build/batch/${batchId}`);
  },
  download(buildId: string) {
    window.open(`/api/build/download/${buildId}`, '_blank');
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
      data: { id: string; status: string; packageManager: string; error?: string; createdAt: string };
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
};
