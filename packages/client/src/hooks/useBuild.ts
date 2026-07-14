import { useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { buildApi } from '../api';
import type { DockerBuildOptions } from '../types/buildConfig';

export type BuildStatus = 'idle' | 'installing' | 'building' | 'docker-building' | 'docker-pushing' | 'packaging' | 'completed' | 'failed' | 'cancelled';
export type BatchProjectStatus = 'pending' | 'building' | 'completed' | 'failed' | 'skipped';

export interface LogEntry {
  type: 'stdout' | 'stderr';
  data: string;
  projectName?: string;
}

export interface ProjectBuildState {
  name: string;
  path: string;
  status: BatchProjectStatus;
  buildId: string;
}

interface UseBuildReturn {
  // Single build (backward compatible)
  status: BuildStatus;
  logs: LogEntry[];
  buildId: string | null;
  packageManager: string;
  error: string;
  startBuild: (projectPath: string, branch?: string) => Promise<void>;
  cancelBuild: () => void;
  downloadBuild: () => void;
  clearLogs: () => void;
  // Batch build
  isBatch: boolean;
  batchProjects: ProjectBuildState[];
  currentProjectIndex: number;
  totalProjects: number;
  batchId: string | null;
  batchComplete: boolean;
  startBatchBuild: (projects: Array<{ name: string; path: string; branch?: string }>) => Promise<void>;
  downloadProject: (buildId: string) => void;
  downloadAll: () => void;
  resetBuildState: () => void;
  // Docker options (set by UI, passed to backend)
  dockerOptions: DockerBuildOptions | null;
  setDockerOptions: React.Dispatch<React.SetStateAction<DockerBuildOptions | null>>;
}

export function useBuild(): UseBuildReturn {
  // Single build state
  const [status, setStatus] = useState<BuildStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [packageManager, setPackageManager] = useState('');
  const [error, setError] = useState('');

  // Batch build state
  const [isBatch, setIsBatch] = useState(false);
  const [batchProjects, setBatchProjects] = useState<ProjectBuildState[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchComplete, setBatchComplete] = useState(false);

  // Docker options (set by UI, passed to backend as-is)
  const [dockerOptions, setDockerOptions] = useState<DockerBuildOptions | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const totalProjects = batchProjects.length;

  // Single build
  const startBuild = useCallback(async (projectPath: string, branch?: string) => {
    cleanup();
    setIsBatch(false);
    setStatus('installing');
    setLogs([]);
    setBuildId(null);
    setError('');
    setPackageManager('');

    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    try {
      const res = await buildApi.start(projectPath, socket.id!, branch, dockerOptions ?? undefined);
      const id = res.data.data.buildId;
      const pm = res.data.data.packageManager;
      setBuildId(id);
      setPackageManager(pm);

      socket.emit('join:build', id);

      socket.on('build:log', (data: { buildId: string; type: 'stdout' | 'stderr'; data: string; projectName?: string }) => {
        if (data.buildId === id) {
          setLogs((prev) => [...prev, { type: data.type, data: data.data, projectName: data.projectName }]);
        }
      });

      socket.on('build:status', (data: { buildId: string; status: string }) => {
        if (data.buildId === id) {
          setStatus(data.status as BuildStatus);
        }
      });

      socket.on('build:complete', (data: { buildId: string }) => {
        if (data.buildId === id) {
          setStatus('completed');
          cleanup();
        }
      });

      socket.on('build:error', (data: { buildId: string; error: string }) => {
        if (data.buildId === id) {
          setStatus('failed');
          setError(data.error);
          cleanup();
        }
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr?.response?.data?.error || (err instanceof Error ? err.message : '构建启动失败');
      setStatus('failed');
      setError(msg);
      cleanup();
    }
  }, [cleanup, dockerOptions]);

  // Batch build
  const startBatchBuild = useCallback(async (projects: Array<{ name: string; path: string; branch?: string }>) => {
    cleanup();
    setIsBatch(true);
    setStatus('idle');
    setLogs([]);
    setBuildId(null);
    setError('');
    setPackageManager('');
    setBatchComplete(false);
    setCurrentProjectIndex(0);
    setBatchId(null);

    // Initialize project states
    setBatchProjects(
      projects.map((p) => ({ name: p.name, path: p.path, status: 'pending', buildId: '' })),
    );

    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    try {
      const batchProjectsWithDocker = projects.map((p) => ({ ...p, dockerOptions: dockerOptions ?? undefined }));
      const res = await buildApi.startBatch(batchProjectsWithDocker, socket.id!);
      const bId = res.data.data.batchId;
      setBatchId(bId);

      // Listen for batch progress events
      socket.on('batch:progress', (data: {
        batchId: string;
        currentIndex: number;
        total: number;
        projectName: string;
        status: string;
        buildId: string;
      }) => {
        if (data.batchId !== bId) return;
        setCurrentProjectIndex(data.currentIndex);
        setBatchProjects((prev) =>
          prev.map((p) =>
            p.name === data.projectName
              ? { ...p, status: data.status as BatchProjectStatus, buildId: data.buildId || p.buildId }
              : p,
          ),
        );
      });

      // Listen for build logs (all projects)
      socket.on('build:log', (data: { buildId: string; type: 'stdout' | 'stderr'; data: string; projectName?: string }) => {
        setLogs((prev) => [...prev, { type: data.type, data: data.data, projectName: data.projectName }]);
      });

      // Listen for build status changes
      socket.on('build:status', (data: { buildId: string; status: string; projectName?: string }) => {
        if (data.projectName) {
          setBatchProjects((prev) =>
            prev.map((p) =>
              p.name === data.projectName && (data.status === 'installing' || data.status === 'building' || data.status === 'packaging')
                ? { ...p, status: 'building' }
                : p,
            ),
          );
        }
      });

      // Listen for batch complete
      socket.on('batch:complete', (data: { batchId: string; results: Array<{ projectName: string; buildId: string; status: string }> }) => {
        if (data.batchId !== bId) return;
        setBatchComplete(true);
        setBatchProjects((prev) =>
          prev.map((p) => {
            const result = data.results.find((r) => r.projectName === p.name);
            if (result) {
              return { ...p, status: result.status as BatchProjectStatus, buildId: result.buildId || p.buildId };
            }
            return p;
          }),
        );
        cleanup();
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr?.response?.data?.error || (err instanceof Error ? err.message : '批量构建启动失败');
      setError(msg);
      setBatchComplete(true);
      cleanup();
    }
  }, [cleanup, dockerOptions]);

  const cancelBuild = useCallback(() => {
    if (buildId) {
      buildApi.cancel(buildId).catch(() => undefined);
    } else {
      // Best-effort: cancel the currently building project in a batch, if any.
      const buildingProject = batchProjects.find((p) => p.status === 'building');
      if (buildingProject?.buildId) {
        buildApi.cancel(buildingProject.buildId).catch(() => undefined);
      }
    }
    setStatus('cancelled');
    setBatchProjects((prev) =>
      prev.map((p) => (p.status === 'pending' || p.status === 'building' ? { ...p, status: 'skipped' } : p)),
    );
    setBatchComplete(true);
    cleanup();
  }, [buildId, batchProjects, cleanup]);

  const resetBuildState = useCallback(() => {
    cleanup();
    setStatus('idle');
    setLogs([]);
    setBuildId(null);
    setError('');
    setPackageManager('');
    setIsBatch(false);
    setBatchProjects([]);
    setCurrentProjectIndex(0);
    setBatchId(null);
    setBatchComplete(false);
  }, [cleanup]);

  const downloadBuild = useCallback(() => {
    if (buildId) {
      buildApi.download(buildId);
    }
  }, [buildId]);

  const downloadProject = useCallback((pBuildId: string) => {
    if (pBuildId) {
      buildApi.download(pBuildId);
    }
  }, []);

  const downloadAll = useCallback(() => {
    for (const p of batchProjects) {
      if (p.status === 'completed' && p.buildId) {
        buildApi.download(p.buildId);
      }
    }
  }, [batchProjects]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    status,
    logs,
    buildId,
    packageManager,
    error,
    startBuild,
    cancelBuild,
    downloadBuild,
    clearLogs,
    isBatch,
    batchProjects,
    currentProjectIndex,
    totalProjects,
    batchId,
    batchComplete,
    startBatchBuild,
    downloadProject,
    downloadAll,
    resetBuildState,
    dockerOptions,
    setDockerOptions,
  };
}
