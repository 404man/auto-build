import DirectoryPicker from './DirectoryPicker';
import BranchSelector from './BranchSelector';
import { BuildConfiguration, type BuildConfigState } from './BuildConfiguration';
import BuildPanel from './BuildPanel';
import LogViewer from './LogViewer';
import { BuildArtifacts } from './BuildArtifacts';
import type { LogEntry, ProjectBuildState } from '../hooks/useBuild';

interface SelectedProject {
  name: string;
  path: string;
}

export interface BuildCenterProps {
  projects: SelectedProject[];
  pickerResetToken: number;
  openBrowseTrigger: number;
  buildConfig: BuildConfigState | null;
  onConfigChange: (config: BuildConfigState) => void;
  // useBuild values
  logs: LogEntry[];
  batchProjects: ProjectBuildState[];
  currentProjectIndex: number;
  totalProjects: number;
  batchComplete: boolean;
  error: string;
  cacheClearedAt: number;
  clearLogs: () => void;
  cancelBuild: () => void;
  downloadProject: (buildId: string) => void;
  downloadAll: () => void;
  downloadImage: (buildId: string) => void;
  downloadAllImages: () => void;
  // handlers
  handleProjectSelect: (selected: SelectedProject[]) => void;
  handleBranchSelect: (projectPath: string, branch: string) => void;
  handleChangeProject: () => void;
  handleStartBuild: () => void;
  // derived state
  configLocked: boolean;
  allBranchesSelected: boolean;
  previewProjects: Array<{ name: string; path: string; branch: string }>;
  currentProjectName: string;
}

export default function BuildCenter(props: BuildCenterProps) {
  const {
    projects,
    pickerResetToken,
    openBrowseTrigger,
    buildConfig,
    onConfigChange,
    logs,
    batchProjects,
    currentProjectIndex,
    totalProjects,
    batchComplete,
    error,
    cacheClearedAt,
    clearLogs,
    cancelBuild,
    downloadProject,
    downloadAll,
    downloadImage,
    downloadAllImages,
    handleProjectSelect,
    handleBranchSelect,
    handleChangeProject,
    handleStartBuild,
    configLocked,
    allBranchesSelected,
    previewProjects,
    currentProjectName,
  } = props;

  return (
    <div className="max-w-[1280px] w-full flex flex-col gap-lg pb-xl">

      {/* Page Header */}
      <div className="flex flex-col gap-xs mb-sm">
        <h2 className="text-[32px] text-on-surface font-bold">Build Center</h2>
        <p className="text-on-surface-variant text-[16px]">Configure and execute local builds for your workspace projects.</p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-md items-start">

        {/* Left Column: 8/12 */}
        <div className="xl:col-span-8 flex flex-col gap-md">
          {/* Project Directory Selection */}
          <DirectoryPicker
            onProjectSelect={handleProjectSelect}
            disabled={configLocked}
            resetToken={pickerResetToken}
            openBrowseTrigger={openBrowseTrigger}
          />

          {/* Branch Selection */}
          {projects.length > 0 && (
            <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
              <div className="flex items-center gap-xs border-b border-outline-variant pb-sm mb-xs">
                <span className="material-symbols-outlined text-primary text-xl">call_split</span>
                <h3 className="text-h2 text-on-surface text-lg">Select Branches</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                {projects.map((project) => (
                  <div key={project.path} className="flex flex-col gap-xs">
                    <span className="font-label-mono text-label-mono text-on-surface-variant">{project.name}</span>
                    <BranchSelector
                      projectPath={project.path}
                      onBranchSelect={(b) => handleBranchSelect(project.path, b)}
                      disabled={configLocked}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleChangeProject}
                disabled={configLocked}
                className="mt-md text-on-surface-variant hover:text-on-surface flex items-center gap-xs text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg px-md py-xs active:scale-95 duration-150 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">swap_horiz</span>
                Change Projects
              </button>
            </section>
          )}

          {/* Build Configuration */}
          <BuildConfiguration config={buildConfig} onConfigChange={onConfigChange} />
        </div>

        {/* Right Column: 4/12 */}
        <div className="xl:col-span-4 flex flex-col gap-md">
          {!allBranchesSelected ? (
            <div className="bg-surface-container rounded-xl border border-outline-variant p-lg flex flex-col items-center justify-center gap-sm py-xl text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl text-outline">rocket_launch</span>
              <p className="text-[14px]">Please complete project and branch selection</p>
            </div>
          ) : (
            <>
              <BuildPanel
                previewProjects={previewProjects}
                isBatch={true}
                batchProjects={batchProjects}
                currentProjectIndex={currentProjectIndex}
                totalProjects={totalProjects}
                batchComplete={batchComplete}
                error={error}
                cacheClearedAt={cacheClearedAt}
                onStart={handleStartBuild}
                onCancel={cancelBuild}
                onDownloadProject={downloadProject}
                onDownloadAll={downloadAll}
                onDownloadImage={downloadImage}
                onDownloadAllImages={downloadAllImages}
              />
              <LogViewer
                logs={logs}
                onClear={clearLogs}
                currentProjectName={currentProjectName}
              />
              <BuildArtifacts />
            </>
          )}
        </div>

      </div>
    </div>
  );
}
