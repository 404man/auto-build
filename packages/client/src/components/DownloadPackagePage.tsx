import { useState, useMemo, useCallback } from 'react';
import { Input } from 'antd';
import DirectoryPicker from './DirectoryPicker';
import BranchSelector from './BranchSelector';
import LogViewer from './LogViewer';
import { useDownload } from '../hooks/useDownload';
import type { DownloadStatus } from '../hooks/useDownload';
import type { LogEntry } from '../hooks/useBuild';

interface SelectedProject {
  name: string;
  path: string;
}

const statusConfig: Record<DownloadStatus, { dot: string; text: string; textColor: string; pulse: boolean }> = {
  idle:        { dot: 'bg-on-surface-variant', text: 'Ready',        textColor: 'text-on-surface-variant', pulse: false },
  scanning:    { dot: 'bg-secondary',          text: 'Scanning...',  textColor: 'text-secondary',          pulse: true  },
  downloading: { dot: 'bg-secondary',          text: 'Downloading...', textColor: 'text-secondary',        pulse: true  },
  packaging:   { dot: 'bg-secondary',          text: 'Packaging...', textColor: 'text-secondary',          pulse: true  },
  completed:   { dot: 'bg-secondary',          text: 'Completed',    textColor: 'text-secondary',          pulse: false },
  failed:      { dot: 'bg-error',              text: 'Failed',       textColor: 'text-error',              pulse: false },
};

export default function DownloadPackagePage() {
  const {
    status, logs, downloadId: _downloadId, error, progress, pkgStartLogs: _pkgStartLogs,
    startDownload, cancelDownload, downloadResult, clearLogs, resetState: _resetState,
  } = useDownload();

  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [lockfileName, setLockfileName] = useState('pnpm-lock.yaml');
  const [scopes, setScopes] = useState('@za/, @x-group/');
  const [registry, setRegistry] = useState('');
  const [resetToken, setResetToken] = useState(0);

  // Map DownloadLog[] to LogEntry[] for LogViewer compatibility
  const viewerLogs: LogEntry[] = useMemo(
    () => logs.map((l) => ({ type: l.type, data: l.data, timestamp: l.timestamp })),
    [logs],
  );

  const isIdle = status === 'idle';
  const isActive = status === 'scanning' || status === 'downloading' || status === 'packaging';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const handleStartDownload = useCallback(async () => {
    if (!selectedProject || !selectedBranch) return;
    await startDownload(selectedProject.path, selectedBranch, {
      lockfileName,
      scopes,
      registry: registry || undefined,
    });
  }, [selectedProject, selectedBranch, lockfileName, scopes, registry, startDownload]);

  const cfg = statusConfig[status];

  return (
    <div className="max-w-[1280px] w-full flex flex-col gap-lg pb-xl">
      {/* Page Header */}
      <div className="flex flex-col gap-xs mb-sm">
        <h2 className="text-[32px] text-on-surface font-bold">Download Package</h2>
        <p className="text-on-surface-variant text-[16px]">下载项目中的二方包 (scoped packages)</p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-md items-start">
        {/* Left Column: 8/12 */}
        <div className="xl:col-span-8 flex flex-col gap-md">
          {/* Section 1: Workspace Configuration */}
          <DirectoryPicker
            onProjectSelect={(projects) => {
              setSelectedProject(projects[0] || null);
              setSelectedBranch(null);
            }}
            disabled={!isIdle}
            resetToken={resetToken}
            singleSelect
          />

          {/* Section 2: Select Branches */}
          {selectedProject && (
            <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
              <div className="flex items-center gap-xs border-b border-outline-variant pb-sm mb-xs">
                <span className="material-symbols-outlined text-primary text-xl">call_split</span>
                <h3 className="text-h2 text-on-surface text-lg">Select Branches</h3>
              </div>
              <BranchSelector
                projectPath={selectedProject.path}
                onBranchSelect={(branch) => setSelectedBranch(branch)}
                disabled={!isIdle}
              />

              <button
                onClick={() => {
                  setSelectedProject(null);
                  setSelectedBranch(null);
                  setResetToken((t) => t + 1);
                }}
                disabled={!isIdle}
                className="mt-md text-on-surface-variant hover:text-on-surface flex items-center gap-xs text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg px-md py-xs active:scale-95 duration-150 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">swap_horiz</span>
                Change Project
              </button>
            </section>
          )}

          {/* Section 3: Download Parameters */}
          <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
            <div className="flex items-center gap-xs border-b border-outline-variant pb-sm mb-xs">
              <span className="material-symbols-outlined text-primary text-xl">tune</span>
              <h3 className="text-h2 text-on-surface text-lg">Download Parameters</h3>
            </div>

            <div className="flex flex-col gap-sm">
              {/* Lockfile */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Lockfile</label>
                <Input
                  value={lockfileName}
                  onChange={(e) => setLockfileName(e.target.value)}
                  placeholder="pnpm-lock.yaml"
                  className="bg-surface border-outline-variant text-on-surface font-label-mono"
                  disabled={!isIdle}
                />
              </div>

              {/* Scopes */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Scopes</label>
                <Input
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  placeholder="多个以逗号分隔"
                  className="bg-surface border-outline-variant text-on-surface font-label-mono"
                  disabled={!isIdle}
                />
              </div>

              {/* Registry */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Registry</label>
                <Input
                  value={registry}
                  onChange={(e) => setRegistry(e.target.value)}
                  placeholder="留空使用项目 .npmrc 配置"
                  className="bg-surface border-outline-variant text-on-surface font-label-mono"
                  disabled={!isIdle}
                  allowClear
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: 4/12 */}
        <div className="xl:col-span-4 flex flex-col gap-md">
          {!selectedProject || !selectedBranch ? (
            <div className="bg-surface-container rounded-xl border border-outline-variant p-lg flex flex-col items-center justify-center gap-sm py-xl text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl text-outline">inventory_2</span>
              <p className="text-[14px]">请先选择项目和分支</p>
            </div>
          ) : (
            <>
              {/* Download Panel */}
              <div className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-md">
                {/* Project Info */}
                <div className="flex flex-col gap-xs">
                  <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Project</h4>
                  <div className="flex flex-col">
                    <span className="font-body-sm text-on-surface font-medium">{selectedProject.name}</span>
                    <span className="text-xs text-on-surface-variant truncate">{selectedProject.path}</span>
                    <span className="text-xs text-primary font-label-mono">{selectedBranch}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                {isActive ? (
                  <button
                    onClick={cancelDownload}
                    className="bg-error-container text-on-error-container hover:bg-error transition-colors duration-150 py-sm px-md rounded-lg text-lg font-bold flex items-center justify-center gap-sm w-full shadow-sm active:scale-95"
                  >
                    <span className="material-symbols-outlined text-2xl">stop</span>
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleStartDownload}
                    disabled={!isIdle && !isCompleted && !isFailed}
                    className="bg-primary-container text-on-primary-container hover:bg-inverse-primary hover:text-white transition-colors duration-150 py-sm px-md rounded-lg text-lg font-bold flex items-center justify-center gap-sm w-full shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-2xl">download</span>
                    {isCompleted || isFailed ? '重新下载' : 'Start Download'}
                  </button>
                )}

                {/* Status */}
                <div className="flex flex-col gap-sm pt-sm border-t border-outline-variant">
                  <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Status</h4>
                  <div className="flex items-center gap-sm">
                    <div className={`w-3 h-3 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                    <span className={`font-body-sm text-on-surface font-medium ${cfg.textColor}`}>{cfg.text}</span>
                  </div>
                </div>

                {/* Progress */}
                {progress.total !== null && (
                  <div className="flex flex-col gap-xs pt-sm border-t border-outline-variant">
                    <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Progress</h4>
                    <span className="font-body-sm text-on-surface font-medium">
                      已下载 {progress.downloaded} / {progress.total} 个包
                    </span>
                    {progress.downloadedSize !== null && progress.totalSize !== null && (
                      <span className="text-xs text-on-surface-variant">
                        {(progress.downloadedSize / 1024 / 1024).toFixed(1)} MB / {(progress.totalSize / 1024 / 1024).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                )}

                {/* Download Result Button */}
                {isCompleted && (
                  <button
                    onClick={downloadResult}
                    className="bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary-container transition-colors duration-150 py-xs px-md rounded-lg font-body-sm font-medium flex items-center justify-center gap-xs w-full active:scale-95"
                  >
                    <span className="material-symbols-outlined text-lg">download</span>
                    Download Packages (.zip)
                  </button>
                )}

                {/* Error */}
                {isFailed && error && (
                  <div className="bg-error-container text-on-error-container rounded-lg p-sm text-sm flex items-start gap-xs">
                    <span className="material-symbols-outlined text-lg shrink-0">error</span>
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Log Viewer */}
              <LogViewer
                logs={viewerLogs}
                onClear={clearLogs}
                currentProjectName={selectedProject?.name}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
