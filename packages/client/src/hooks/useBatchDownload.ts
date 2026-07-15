import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { downloadApi } from '../api';
import type { DownloadStatus, DownloadLog, DownloadProgress } from './useDownload';

export interface ProjectDownloadState {
  status: DownloadStatus;
  downloadId: string | null;
  logs: DownloadLog[];
  error: string | null;
  progress: DownloadProgress;
}

const initialProgress: DownloadProgress = {
  scanned: 0,
  downloaded: 0,
  total: null,
  totalSize: null,
  downloadedSize: null,
};

function parseSize(sizeStr: string): number | null {
  if (!sizeStr) return null;
  const match = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB|B)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  return Math.round(value * (multipliers[unit] || 1));
}

function createInitialState(): ProjectDownloadState {
  return {
    status: 'idle',
    downloadId: null,
    logs: [],
    error: null,
    progress: { ...initialProgress },
  };
}

interface BatchDownloadProject {
  name: string;
  path: string;
  branch: string;
}

interface UseBatchDownloadReturn {
  downloads: Record<string, ProjectDownloadState>;
  /** Whether any project is actively downloading */
  isAnyActive: boolean;
  /** Whether all projects are completed */
  allCompleted: boolean;
  /** Whether all projects are done (completed or failed) */
  allDone: boolean;
  /** Number of completed projects */
  completedCount: number;
  /** Start downloads for all given projects */
  startAll: (projects: BatchDownloadProject[], options?: {
    lockfileName?: string;
    scopes?: string;
    registry?: string;
  }) => Promise<void>;
  /** Cancel a specific project download */
  cancelOne: (projectPath: string) => Promise<void>;
  /** Cancel all active downloads */
  cancelAll: () => Promise<void>;
  /** Trigger download of result zip for a specific project */
  downloadResult: (projectPath: string) => void;
  /** Download all completed results */
  downloadAllResults: () => void;
  /** Clear logs for a specific project */
  clearLogs: (projectPath: string) => void;
  /** Reset all state */
  resetState: () => void;
}

export function useBatchDownload(): UseBatchDownloadReturn {
  const [downloads, setDownloads] = useState<Record<string, ProjectDownloadState>>({});

  const socketRef = useRef<Socket | null>(null);
  /** Maps downloadId -> projectPath for event routing */
  const downloadIdToPathRef = useRef<Map<string, string>>(new Map());
  /** Maps projectPath -> downloadId for cancellation */
  const pathToDownloadIdRef = useRef<Map<string, string>>(new Map());

  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    downloadIdToPathRef.current.clear();
    pathToDownloadIdRef.current.clear();
  }, []);

  useEffect(() => {
    return () => { cleanupSocket(); };
  }, [cleanupSocket]);

  const updateProject = useCallback((projectPath: string, updater: (prev: ProjectDownloadState) => ProjectDownloadState) => {
    setDownloads(prev => ({
      ...prev,
      [projectPath]: updater(prev[projectPath] || createInitialState()),
    }));
  }, []);

  const addLog = useCallback((projectPath: string, type: 'stdout' | 'stderr', data: string) => {
    updateProject(projectPath, prev => ({
      ...prev,
      logs: [...prev.logs, { type, data, timestamp: Date.now() }],
    }));
  }, [updateProject]);

  const startAll = useCallback(async (
    projects: BatchDownloadProject[],
    options?: { lockfileName?: string; scopes?: string; registry?: string },
  ) => {
    cleanupSocket();

    // Reset all project states
    const initial: Record<string, ProjectDownloadState> = {};
    for (const p of projects) {
      initial[p.path] = { ...createInitialState(), status: 'scanning' };
    }
    setDownloads(initial);

    // 1. Create single socket connection
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    const socketId = socket.id!;

    // 2. Register global event handlers that route by downloadId
    socket.on('download:log', (data: { downloadId: string; type: string; data: string }) => {
      const projectPath = downloadIdToPathRef.current.get(data.downloadId);
      if (!projectPath) return;
      addLog(projectPath, data.type as 'stdout' | 'stderr', data.data);

      // Parse progress from log
      const foundMatch = data.data.match(/Found (\d+) scoped packages/);
      if (foundMatch) {
        updateProject(projectPath, prev => ({
          ...prev,
          progress: { ...prev.progress, total: parseInt(foundMatch[1]) },
          status: 'downloading',
        }));
      }
      if (data.data.includes('Downloading')) {
        updateProject(projectPath, prev => ({
          ...prev,
          progress: { ...prev.progress, downloaded: prev.progress.downloaded + 1 },
        }));
      }
    });

    socket.on('download:status', (data: { downloadId: string; status: DownloadStatus }) => {
      const projectPath = downloadIdToPathRef.current.get(data.downloadId);
      if (!projectPath) return;
      updateProject(projectPath, prev => ({ ...prev, status: data.status }));
    });

    socket.on('download:progress', (data: {
      downloadId: string;
      total?: number;
      downloaded?: number;
      totalSize?: string;
      downloadedSize?: string;
    }) => {
      const projectPath = downloadIdToPathRef.current.get(data.downloadId);
      if (!projectPath) return;
      updateProject(projectPath, prev => ({
        ...prev,
        progress: {
          scanned: prev.progress.scanned,
          downloaded: data.downloaded ?? prev.progress.downloaded,
          total: data.total ?? prev.progress.total,
          totalSize: data.totalSize ? parseSize(data.totalSize) : prev.progress.totalSize,
          downloadedSize: data.downloadedSize ? parseSize(data.downloadedSize) : prev.progress.downloadedSize,
        },
      }));
    });

    socket.on('download:complete', (data: { downloadId: string }) => {
      const projectPath = downloadIdToPathRef.current.get(data.downloadId);
      if (!projectPath) return;
      updateProject(projectPath, prev => ({ ...prev, status: 'completed' }));
    });

    socket.on('download:error', (data: { downloadId: string; error: string }) => {
      const projectPath = downloadIdToPathRef.current.get(data.downloadId);
      if (!projectPath) return;
      updateProject(projectPath, prev => ({ ...prev, status: 'failed', error: data.error }));
    });

    // 3. Start download for each project
    for (const project of projects) {
      try {
        const res = await downloadApi.start({
          projectPath: project.path,
          socketId,
          branch: project.branch,
          ...options,
        });
        const id = res.data.data.downloadId;
        downloadIdToPathRef.current.set(id, project.path);
        pathToDownloadIdRef.current.set(project.path, id);

        updateProject(project.path, prev => ({ ...prev, downloadId: id }));

        // Join room
        socket.emit('join:download', id);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
        updateProject(project.path, prev => ({
          ...prev,
          status: 'failed',
          error: axiosErr?.response?.data?.error || axiosErr?.message || '启动下载失败',
        }));
      }
    }
  }, [cleanupSocket, addLog, updateProject]);

  const cancelOne = useCallback(async (projectPath: string) => {
    const dlId = pathToDownloadIdRef.current.get(projectPath);
    if (dlId) {
      try {
        await downloadApi.cancel(dlId);
      } catch { /* ignore */ }
      downloadIdToPathRef.current.delete(dlId);
      pathToDownloadIdRef.current.delete(projectPath);
    }
    updateProject(projectPath, prev => ({ ...prev, status: 'idle' }));
  }, [updateProject]);

  const cancelAll = useCallback(async () => {
    for (const [projectPath, dlId] of pathToDownloadIdRef.current) {
      try {
        await downloadApi.cancel(dlId);
      } catch { /* ignore */ }
      updateProject(projectPath, () => createInitialState());
    }
    cleanupSocket();
  }, [cleanupSocket, updateProject]);

  const downloadResult = useCallback((projectPath: string) => {
    const dlId = pathToDownloadIdRef.current.get(projectPath);
    if (dlId) {
      downloadApi.download(dlId);
    }
  }, []);

  const downloadAllResults = useCallback(() => {
    for (const [projectPath, dlId] of pathToDownloadIdRef.current) {
      const state = downloads[projectPath]; // capture in closure is fine for iteration
      void state;
      downloadApi.download(dlId);
    }
  }, [downloads]);

  const clearLogs = useCallback((projectPath: string) => {
    updateProject(projectPath, prev => ({ ...prev, logs: [] }));
  }, [updateProject]);

  const resetState = useCallback(() => {
    cleanupSocket();
    setDownloads({});
  }, [cleanupSocket]);

  // Derived state
  const allStates = Object.values(downloads);
  const isAnyActive = allStates.some(s =>
    s.status === 'scanning' || s.status === 'downloading' || s.status === 'packaging');
  const completedCount = allStates.filter(s => s.status === 'completed').length;
  const allDone = allStates.length > 0 && allStates.every(s =>
    s.status === 'completed' || s.status === 'failed');
  const allCompleted = allStates.length > 0 && allStates.every(s => s.status === 'completed');

  return {
    downloads,
    isAnyActive,
    allCompleted,
    allDone,
    completedCount,
    startAll,
    cancelOne,
    cancelAll,
    downloadResult,
    downloadAllResults,
    clearLogs,
    resetState,
  };
}
