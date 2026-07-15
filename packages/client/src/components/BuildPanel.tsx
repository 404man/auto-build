import type { ProjectBuildState, BatchProjectStatus } from '../hooks/useBuild';
import { directoryApi } from '../api';

export interface PreviewProject {
  name: string;
  path: string;
  branch: string;
}

interface BuildPanelProps {
  previewProjects: PreviewProject[];
  isBatch: boolean;
  batchProjects: ProjectBuildState[];
  currentProjectIndex: number;
  totalProjects: number;
  batchComplete: boolean;
  error: string;
  cacheClearedAt?: number;
  onStart: () => void;
  onCancel: () => void;
  onDownloadProject: (buildId: string) => void;
  onDownloadAll: () => void;
}

type OverallStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

const statusConfig: Record<OverallStatus, { dot: string; text: string; textColor: string; pulse: boolean }> = {
  idle:      { dot: 'bg-on-surface-variant', text: 'Ready',       textColor: 'text-on-surface-variant', pulse: false },
  running:   { dot: 'bg-secondary',          text: 'Running...',  textColor: 'text-secondary',          pulse: true  },
  completed: { dot: 'bg-secondary',          text: 'Completed',   textColor: 'text-secondary',          pulse: false },
  failed:    { dot: 'bg-error',              text: 'Failed',      textColor: 'text-error',              pulse: false },
  cancelled: { dot: 'bg-on-surface-variant', text: 'Cancelled',   textColor: 'text-on-surface-variant', pulse: false },
};

const batchStatusLabel: Record<BatchProjectStatus, { label: string; color: string }> = {
  pending:   { label: 'Pending',   color: 'text-on-surface-variant' },
  building:  { label: 'Building',  color: 'text-secondary' },
  completed: { label: 'Completed', color: 'text-secondary' },
  failed:    { label: 'Failed',    color: 'text-error' },
  skipped:   { label: 'Skipped',   color: 'text-on-surface-variant' },
};

export default function BuildPanel({
  previewProjects,
  isBatch,
  batchProjects,
  currentProjectIndex,
  totalProjects,
  batchComplete,
  error,
  cacheClearedAt,
  onStart,
  onCancel,
  onDownloadProject,
  onDownloadAll,
}: BuildPanelProps) {
  const isPreviewMode = batchProjects.length === 0;
  const isRunning = batchProjects.some((p) => p.status === 'building');
  const completedCount = batchProjects.filter((p) => p.status === 'completed').length;
  const hasFailed = batchProjects.some((p) => p.status === 'failed');

  // Derive overall status
  let overallStatus: OverallStatus = 'idle';
  if (isRunning) overallStatus = 'running';
  else if (batchComplete && hasFailed) overallStatus = 'failed';
  else if (batchComplete) overallStatus = 'completed';

  const cfg = statusConfig[overallStatus];

  return (
    <div className="flex flex-col gap-md">
      {/* Action Area Card */}
      <div className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-md">
        {/* Start Build / Cancel Button */}
        {isRunning ? (
          <button
            onClick={onCancel}
            className="bg-error-container text-on-error-container hover:bg-error transition-colors duration-150 py-sm px-md rounded-lg text-lg font-bold flex items-center justify-center gap-sm w-full shadow-sm active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">stop</span>
            取消构建
          </button>
        ) : (
          <button
            onClick={onStart}
            className="bg-primary-container text-on-primary-container hover:bg-inverse-primary hover:text-white transition-colors duration-150 py-sm px-md rounded-lg text-lg font-bold flex items-center justify-center gap-sm w-full shadow-sm active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">play_arrow</span>
            {batchComplete ? '重新构建' : '开始构建'}
          </button>
        )}

        {/* Status Area */}
        <div className="flex flex-col gap-sm pt-sm border-t border-outline-variant">
          <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Status</h4>
          <div className="flex items-center gap-sm">
            <div className={`w-3 h-3 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
            <span className={`font-body-sm text-on-surface font-medium ${cfg.textColor}`}>{cfg.text}</span>
          </div>
        </div>

        {/* Progress */}
        {batchProjects.length > 0 && (
          <div className="flex flex-col gap-xs pt-sm border-t border-outline-variant">
            <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Progress</h4>
            <span className="font-body-sm text-on-surface font-medium">
              {currentProjectIndex + 1} / {totalProjects}
            </span>
          </div>
        )}

        {/* Download All */}
        {batchComplete && completedCount > 0 && (
          <button
            onClick={onDownloadAll}
            className="bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary-container transition-colors duration-150 py-xs px-md rounded-lg font-body-sm font-medium flex items-center justify-center gap-xs w-full active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            全部下载 ({completedCount})
          </button>
        )}

        {/* Error */}
        {batchComplete && error && (
          <div className="bg-error-container text-on-error-container rounded-lg p-sm text-sm flex items-start gap-xs">
            <span className="material-symbols-outlined text-lg shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Cache cleared warning */}
        {batchComplete && completedCount > 0 && cacheClearedAt && cacheClearedAt > 0 && (
          <div className="bg-tertiary-container text-on-tertiary-container rounded-lg p-sm text-sm flex items-start gap-xs">
            <span className="material-symbols-outlined text-lg shrink-0">warning</span>
            <span>缓存已清空，构建产物可能已被删除</span>
          </div>
        )}
      </div>

      {/* Project List Card */}
      {isBatch && (isPreviewMode || batchProjects.length > 0) && (
        <div className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
          <h4 className="font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider">Projects</h4>
          {(isPreviewMode ? previewProjects : batchProjects).map((item) => {
            const bp = !isPreviewMode ? (item as ProjectBuildState) : null;
            const bCfg = bp ? batchStatusLabel[bp.status] : null;
            return (
              <div
                key={item.path}
                className="flex items-center justify-between py-xs border-b border-outline-variant/50 last:border-b-0"
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-xs">
                    <span className="font-body-sm text-on-surface font-medium">{item.name}</span>
                    {bCfg && (
                      <span className={`text-xs font-medium ${bCfg.color}`}>{bCfg.label}</span>
                    )}
                    {!bp && (
                      <span className="text-xs font-label-mono text-on-surface-variant">
                        {(item as PreviewProject).branch}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-on-surface-variant truncate">{item.path}</span>
                </div>
                <div className="flex items-center gap-xs shrink-0">
                  <button
                    onClick={() => directoryApi.openDirectory(item.path)}
                    className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-container-highest"
                    title="打开文件夹"
                  >
                    <span className="material-symbols-outlined text-sm">folder_open</span>
                  </button>
                  {bp?.status === 'completed' && bp.buildId && (
                    <button
                      onClick={() => onDownloadProject(bp.buildId)}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-container-highest"
                      title="下载"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
