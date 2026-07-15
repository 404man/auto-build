import { useState, useMemo, useCallback } from 'react';
import { Input } from 'antd';
import DirectoryPicker from './DirectoryPicker';
import BranchSelector from './BranchSelector';
import LogViewer from './LogViewer';
import { useBatchDownload } from '../hooks/useBatchDownload';
import type { DownloadStatus } from '../hooks/useDownload';
import type { LogEntry } from '../hooks/useBuild';
import { directoryApi } from '../api';

interface SelectedProject {
  name: string;
  path: string;
}

const statusConfig: Record<DownloadStatus, { dot: string; text: string; textColor: string; pulse: boolean }> = {
  idle:        { dot: 'bg-on-surface-variant', text: 'Ready',          textColor: 'text-on-surface-variant', pulse: false },
  scanning:    { dot: 'bg-secondary',          text: 'Scanning...',    textColor: 'text-secondary',          pulse: true  },
  downloading: { dot: 'bg-secondary',          text: 'Downloading...', textColor: 'text-secondary',          pulse: true  },
  packaging:   { dot: 'bg-secondary',          text: 'Packaging...',   textColor: 'text-secondary',          pulse: true  },
  completed:   { dot: 'bg-secondary',          text: 'Completed',      textColor: 'text-secondary',          pulse: false },
  failed:      { dot: 'bg-error',              text: 'Failed',         textColor: 'text-error',              pulse: false },
};

export default function DownloadPackagePage() {
  const {
    downloads, isAnyActive, allDone, completedCount,
    startAll, cancelOne, cancelAll, downloadResult, downloadAllResults,
    clearLogs, resetState,
  } = useBatchDownload();

  const [projects, setProjects] = useState<SelectedProject[]>([]);
  const [projectBranches, setProjectBranches] = useState<Record<string, string>>({});
  const [lockfileName, setLockfileName] = useState('pnpm-lock.yaml');
  const [scopes, setScopes] = useState('@za/, @x-group/');
  const [registry, setRegistry] = useState('');
  const [resetToken, setResetToken] = useState(0);
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null);

  const allBranchesSelected = projects.length > 0 && projects.every(p => !!projectBranches[p.path]);

  const handleProjectSelect = useCallback((selected: SelectedProject[]) => {
    setProjects(selected);
    setProjectBranches(prev => {
      const selectedPaths = new Set(selected.map(p => p.path));
      const next: Record<string, string> = {};
      for (const path of selectedPaths) {
        if (prev[path]) next[path] = prev[path];
      }
      return next;
    });
    setActiveProjectPath(null);
  }, []);

  const handleBranchSelect = useCallback((projectPath: string, branch: string) => {
    setProjectBranches(prev => ({ ...prev, [projectPath]: branch }));
  }, []);

  const handleChangeProject = useCallback(() => {
    setProjects([]);
    setProjectBranches({});
    setResetToken(t => t + 1);
    setActiveProjectPath(null);
    resetState();
  }, [resetState]);

  const handleStartDownload = useCallback(async () => {
    const batchProjects = projects.map(p => ({
      name: p.name,
      path: p.path,
      branch: projectBranches[p.path],
    }));
    await startAll(batchProjects, {
      lockfileName,
      scopes,
      registry: registry || undefined,
    });
    // Auto-select first project for log viewing
    if (batchProjects.length > 0) {
      setActiveProjectPath(batchProjects[0].path);
    }
  }, [projects, projectBranches, lockfileName, scopes, registry, startAll]);

  // Logs for active project
  const activeProject = projects.find(p => p.path === activeProjectPath) || null;
  const activeState = activeProjectPath ? downloads[activeProjectPath] : null;

  const viewerLogs: LogEntry[] = useMemo(
    () => (activeState?.logs || []).map(l => ({ type: l.type, data: l.data, timestamp: l.timestamp })),
    [activeState?.logs],
  );

  const hasDownloads = Object.keys(downloads).length > 0;

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
            onProjectSelect={handleProjectSelect}
            disabled={isAnyActive}
            resetToken={resetToken}
          />

          {/* Section 2: Select Branches */}
          {projects.length > 0 && (
            <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
              <div className="flex items-center gap-xs border-b border-outline-variant pb-sm mb-xs">
                <span className="material-symbols-outlined text-primary text-xl">call_split</span>
                <h3 className="text-h2 text-on-surface text-lg">Select Branches</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                {projects.map(project => (
                  <div key={project.path} className="flex flex-col gap-xs">
                    <span className="font-label-mono text-label-mono text-on-surface-variant">{project.name}</span>
                    <BranchSelector
                      projectPath={project.path}
                      onBranchSelect={(b) => handleBranchSelect(project.path, b)}
                      disabled={isAnyActive}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleChangeProject}
                disabled={isAnyActive}
                className="mt-md text-on-surface-variant hover:text-on-surface flex items-center gap-xs text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg px-md py-xs active:scale-95 duration-150 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">swap_horiz</span>
                Change Projects
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
                  disabled={isAnyActive}
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
                  disabled={isAnyActive}
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
                  disabled={isAnyActive}
                  allowClear
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: 4/12 */}
        <div className="xl:col-span-4 flex flex-col gap-md">
          {!allBranchesSelected ? (
            <div className="bg-surface-container rounded-xl border border-outline-variant p-lg flex flex-col items-center justify-center gap-sm py-xl text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl text-outline">inventory_2</span>
              <p className="text-[14px]">请先选择项目和分支</p>
            </div>
          ) : (
            <>
              {/* Action Area Card */}
              <div className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-md">
                {/* Start / Cancel Button */}
                {isAnyActive ? (
                  <button
                    onClick={cancelAll}
                    className="bg-error-container text-on-error-container hover:bg-error transition-colors duration-150 py-sm px-md rounded-lg text-lg font-bold flex items-center justify-center gap-sm w-full shadow-sm active:scale-95"
                  >
                    <span className="material-symbols-outlined text-2xl">stop</span>
                    Cancel All
                  </button>
                ) : (
                  <button
                    onClick={handleStartDownload}
                    className="bg-primary-container text-on-primary-container hover:bg-inverse-primary hover:text-white transition-colors duration-150 py-sm px-md rounded-lg text-lg font-bold flex items-center justify-center gap-sm w-full shadow-sm active:scale-95"
                  >
                    <span className="material-symbols-outlined text-2xl">download</span>
                    {allDone ? '重新下载' : 'Start Download'}
                  </button>
                )}

                {/* Overall Progress */}
                {hasDownloads && (
                  <div className="flex flex-col gap-xs pt-sm border-t border-outline-variant">
                    <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Progress</h4>
                    <span className="font-body-sm text-on-surface font-medium">
                      {completedCount} / {projects.length} completed
                    </span>
                  </div>
                )}

                {/* Download All Results */}
                {allDone && completedCount > 0 && (
                  <button
                    onClick={downloadAllResults}
                    className="bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary-container transition-colors duration-150 py-xs px-md rounded-lg font-body-sm font-medium flex items-center justify-center gap-xs w-full active:scale-95"
                  >
                    <span className="material-symbols-outlined text-lg">download</span>
                    Download All ({completedCount})
                  </button>
                )}
              </div>

              {/* Project List Card */}
              <div className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
                <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Projects</h4>
                {projects.map(project => {
                  const state = downloads[project.path];
                  const status: DownloadStatus = state?.status || 'idle';
                  const cfg = statusConfig[status];
                  const branch = projectBranches[project.path];
                  const isActive = activeProjectPath === project.path;

                  return (
                    <div
                      key={project.path}
                      onClick={() => setActiveProjectPath(project.path)}
                      className={`flex items-center justify-between py-xs px-sm rounded-lg cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-surface-container-highest ring-1 ring-primary/30'
                          : 'hover:bg-surface-container-high'
                      } border-b border-outline-variant/50 last:border-b-0`}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-xs">
                          <div className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                          <span className="font-body-sm text-on-surface font-medium">{project.name}</span>
                          <span className={`text-xs font-medium ${cfg.textColor}`}>{cfg.text}</span>
                        </div>
                        <div className="flex items-center gap-xs">
                          <span className="text-xs text-on-surface-variant truncate">{project.path}</span>
                          <span className="text-xs text-primary font-label-mono">{branch}</span>
                        </div>
                        {/* Progress for active downloads */}
                        {state && state.progress.total !== null && (status === 'downloading' || status === 'scanning') && (
                          <span className="text-xs text-on-surface-variant mt-0.5">
                            {state.progress.downloaded} / {state.progress.total} packages
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-xs shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); directoryApi.openDirectory(project.path); }}
                          className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-container-highest"
                          title="打开文件夹"
                        >
                          <span className="material-symbols-outlined text-sm">folder_open</span>
                        </button>
                        {status === 'completed' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadResult(project.path); }}
                            className="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-container-highest"
                            title="下载"
                          >
                            <span className="material-symbols-outlined text-sm">download</span>
                          </button>
                        )}
                        {(status === 'scanning' || status === 'downloading' || status === 'packaging') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelOne(project.path); }}
                            className="text-on-surface-variant hover:text-error transition-colors p-1 rounded-full hover:bg-surface-container-highest"
                            title="取消"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Log Viewer for active project */}
              {activeProject && activeState && (
                <LogViewer
                  logs={viewerLogs}
                  onClear={() => clearLogs(activeProject.path)}
                  currentProjectName={activeProject.name}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
