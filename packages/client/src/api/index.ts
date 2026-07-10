import axios from 'axios';
import { message } from 'antd';

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
  start(projectPath: string, socketId: string, branch?: string) {
    return http.post<{ success: boolean; data: { buildId: string; status: string; packageManager: string } }>(
      '/build/start',
      { projectPath, socketId, branch },
    );
  },
  startBatch(projects: Array<{ name: string; path: string; branch?: string }>, socketId: string) {
    return http.post<{ success: boolean; data: { batchId: string; buildIds: string[] } }>(
      '/build/batch',
      { projects, socketId },
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
