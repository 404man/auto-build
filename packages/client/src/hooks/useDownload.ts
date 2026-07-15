import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { downloadApi } from '../api';

export type DownloadStatus = 'idle' | 'scanning' | 'downloading' | 'packaging' | 'completed' | 'failed';

export interface DownloadLog {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

export interface DownloadProgress {
  scanned: number;
  downloaded: number;
  total: number | null;
  totalSize: number | null;
  downloadedSize: number | null;
}

interface UseDownloadReturn {
  status: DownloadStatus;
  logs: DownloadLog[];
  pkgStartLogs: string[];
  downloadId: string | null;
  error: string | null;
  progress: DownloadProgress;
  startDownload: (projectPath: string, branch?: string, options?: {
    lockfileName?: string;
    scopes?: string;
    registry?: string;
  }) => Promise<void>;
  cancelDownload: () => Promise<void>;
  downloadResult: () => void;
  clearLogs: () => void;
  resetState: () => void;
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

export function useDownload(): UseDownloadReturn {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [logs, setLogs] = useState<DownloadLog[]>([]);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>(initialProgress);
  const [pkgStartLogs, setPkgStartLogs] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const downloadIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  // 组件卸载时清理 socket 连接
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const addLog = useCallback((type: 'stdout' | 'stderr', data: string) => {
    setLogs(prev => [...prev, { type, data, timestamp: Date.now() }]);
  }, []);

  const startDownload = useCallback(async (
    projectPath: string,
    branch?: string,
    options?: { lockfileName?: string; scopes?: string; registry?: string },
  ) => {
    cleanup();
    setStatus('scanning');
    setLogs([]);
    setPkgStartLogs([]);
    setError(null);
    setProgress(initialProgress);

    // 1. 建立 Socket.IO 连接
    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    const socketId = socket.id!;

    // 2. 调用 API 启动下载
    try {
      const res = await downloadApi.start({
        projectPath,
        socketId,
        branch,
        ...options,
      });
      const id = res.data.data.downloadId;
      setDownloadId(id);
      downloadIdRef.current = id;

      // 3. 加入房间
      socket.emit('join:download', id);

      // 4. 监听日志事件
      socket.on('download:log', (data: { downloadId: string; type: string; data: string }) => {
        if (data.downloadId !== downloadIdRef.current) return;
        addLog(data.type as 'stdout' | 'stderr', data.data);

        // 解析进度信息
        const foundMatch = data.data.match(/Found (\d+) scoped packages/);
        if (foundMatch) {
          setProgress(prev => ({ ...prev, total: parseInt(foundMatch[1]) }));
          setStatus('downloading');
        }
        if (data.data.includes('Downloading')) {
          setProgress(prev => ({ ...prev, downloaded: prev.downloaded + 1 }));
        }
      });

      // 5. 监听状态变更
      socket.on('download:status', (data: { downloadId: string; status: DownloadStatus }) => {
        if (data.downloadId !== downloadIdRef.current) return;
        setStatus(data.status);
      });

      // 6. 监听下载进度（含字节数）
      socket.on('download:progress', (data: {
        downloadId: string;
        total?: number;
        downloaded?: number;
        totalSize?: string;
        downloadedSize?: string;
      }) => {
        if (data.downloadId !== downloadIdRef.current) return;
        setProgress(prev => ({
          scanned: prev.scanned,
          downloaded: data.downloaded ?? prev.downloaded,
          total: data.total ?? prev.total,
          totalSize: data.totalSize ? parseSize(data.totalSize) : prev.totalSize,
          downloadedSize: data.downloadedSize ? parseSize(data.downloadedSize) : prev.downloadedSize,
        }));
      });

      // 7. 监听单包下载开始
      socket.on('download:pkg-start', (data: { downloadId: string; package: string }) => {
        if (data.downloadId !== downloadIdRef.current) return;
        setPkgStartLogs(prev => [...prev, data.package]);
      });

      // 8. 监听完成
      socket.on('download:complete', (data: { downloadId: string }) => {
        if (data.downloadId !== downloadIdRef.current) return;
        setStatus('completed');
        cleanup();
      });

      // 9. 监听错误
      socket.on('download:error', (data: { downloadId: string; error: string }) => {
        if (data.downloadId !== downloadIdRef.current) return;
        setStatus('failed');
        setError(data.error);
        cleanup();
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      setStatus('failed');
      setError(axiosErr?.response?.data?.error || axiosErr?.message || '启动下载失败');
      cleanup();
    }
  }, [cleanup, addLog]);

  const cancelDownload = useCallback(async () => {
    if (downloadIdRef.current) {
      try {
        await downloadApi.cancel(downloadIdRef.current);
      } catch { /* ignore */ }
    }
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  const downloadResult = useCallback(() => {
    if (downloadIdRef.current) {
      downloadApi.download(downloadIdRef.current);
    }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const resetState = useCallback(() => {
    cleanup();
    setStatus('idle');
    setLogs([]);
    setPkgStartLogs([]);
    setDownloadId(null);
    setError(null);
    setProgress(initialProgress);
    downloadIdRef.current = null;
  }, [cleanup]);

  return {
    status, logs, pkgStartLogs, downloadId, error, progress,
    startDownload, cancelDownload, downloadResult,
    clearLogs, resetState,
  };
}
