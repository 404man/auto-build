import { useState, useCallback, useMemo } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import BuildCenter from './components/BuildCenter';
import SettingsPage from './components/SettingsPage';
import { type BuildConfigState } from './components/BuildConfiguration';
import { useBuild } from './hooks/useBuild';
import { appTheme } from './theme';

interface SelectedProject {
  name: string;
  path: string;
}

function App() {
  const [activePage, setActivePage] = useState<'build' | 'settings'>('build');
  const [projects, setProjects] = useState<SelectedProject[]>([]);
  const [projectBranches, setProjectBranches] = useState<Record<string, string>>({});
  const [pickerResetToken, setPickerResetToken] = useState(0);
  const [openBrowseTrigger, setOpenBrowseTrigger] = useState(0);
  const [buildConfig, setBuildConfig] = useState<BuildConfigState | null>(null);
  const {
    clearLogs,
    cancelBuild,
    downloadProject,
    downloadAll,
    startBatchBuild,
    resetBuildState,
    logs,
    batchProjects,
    currentProjectIndex,
    totalProjects,
    batchComplete,
    error,
    isBatch,
  } = useBuild();

  const handleProjectSelect = useCallback((selected: SelectedProject[]) => {
    setProjects(selected);
    setProjectBranches((prev) => {
      const selectedPaths = new Set(selected.map((p) => p.path));
      const next: Record<string, string> = {};
      for (const path of selectedPaths) {
        if (prev[path]) {
          next[path] = prev[path];
        }
      }
      return next;
    });
  }, []);

  const handleBranchSelect = useCallback((projectPath: string, branch: string) => {
    setProjectBranches((prev) => ({ ...prev, [projectPath]: branch }));
  }, []);

  const handleChangeProject = useCallback(() => {
    setProjects([]);
    setProjectBranches((prev) => {
      const next: Record<string, string> = {};
      for (const key of Object.keys(prev)) {
        next[key] = '';
      }
      return next;
    });
    setPickerResetToken((t) => t + 1);
    resetBuildState();
  }, [resetBuildState]);

  const allBranchesSelected = projects.length > 0 && projects.every((p) => !!projectBranches[p.path]);

  const configLocked = batchProjects.length > 0 && !batchComplete;

  const currentProjectName = useMemo(() => {
    if (isBatch && batchProjects.length > 0) {
      return batchProjects[currentProjectIndex]?.name || '';
    }
    return '';
  }, [isBatch, batchProjects, currentProjectIndex]);

  const headerStatus = useMemo(() => {
    if (configLocked) {
      return `构建中 · ${currentProjectIndex + 1}/${totalProjects || projects.length}`;
    }
    if (batchComplete && batchProjects.length > 0) {
      const ok = batchProjects.filter((p) => p.status === 'completed').length;
      const fail = batchProjects.filter((p) => p.status === 'failed').length;
      return `已完成 · 成功 ${ok} · 失败 ${fail}`;
    }
    return '未开始';
  }, [configLocked, batchComplete, batchProjects, currentProjectIndex, totalProjects, projects.length]);

  const previewProjects = useMemo(
    () =>
      projects.map((p) => ({
        name: p.name,
        path: p.path,
        branch: projectBranches[p.path],
      })),
    [projects, projectBranches],
  );

  const handleStartBuild = useCallback(() => {
    startBatchBuild(
      projects.map((p) => ({
        name: p.name,
        path: p.path,
        branch: projectBranches[p.path],
      })),
    );
  }, [projects, projectBranches, startBatchBuild]);

  const handleNewProject = useCallback(() => {
    handleChangeProject();
    setOpenBrowseTrigger((t) => t + 1);
  }, [handleChangeProject]);

  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <div className="bg-background text-on-surface antialiased overflow-hidden flex h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>

        {/* ── SideNavBar (240px fixed) ── */}
        <nav className="bg-surface-container-low fixed left-0 top-0 h-screen w-[240px] border-r border-outline-variant flex flex-col p-md gap-sm z-50">
          {/* Brand */}
          <div className="flex items-center gap-sm mb-lg px-sm pt-sm">
            <span className="material-symbols-outlined text-primary text-3xl">build_circle</span>
            <div>
              <h1 className="text-[24px] font-bold text-primary tracking-tight leading-tight">BuildEngine</h1>
              <p className="text-[12px] text-on-surface-variant" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Local v1.0.4</p>
            </div>
          </div>

          {/* New Project Button */}
          <button
            onClick={handleNewProject}
            disabled={configLocked}
            className="bg-primary-container text-on-primary-container hover:bg-inverse-primary hover:text-white transition-colors duration-150 py-sm px-md rounded text-[14px] font-semibold flex items-center justify-center gap-xs w-full mb-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            New Project
          </button>

          {/* Nav Items */}
          <div className="flex flex-col gap-xs flex-1">
            <a
              className={`rounded-lg flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest active:scale-95 duration-150 cursor-pointer ${
                activePage === 'build'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={(e) => { e.preventDefault(); setActivePage('build'); }}
            >
              <span className="material-symbols-outlined">rocket_launch</span>
              Build Center
            </a>
            <a className="text-on-surface-variant hover:text-on-surface flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg active:scale-95 duration-150 cursor-not-allowed opacity-60">
              <span className="material-symbols-outlined">folder_open</span>
              Projects
            </a>
            <a
              className={`rounded-lg flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest active:scale-95 duration-150 cursor-pointer ${
                activePage === 'settings'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={(e) => { e.preventDefault(); setActivePage('settings'); }}
            >
              <span className="material-symbols-outlined">settings</span>
              Settings
            </a>
          </div>

          {/* Bottom Nav */}
          <div className="mt-auto flex flex-col gap-xs pt-md border-t border-outline-variant">
            <a className="text-on-surface-variant hover:text-on-surface flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg active:scale-95 duration-150" href="#">
              <span className="material-symbols-outlined">description</span>
              Docs
            </a>
            <a className="text-on-surface-variant hover:text-on-surface flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg active:scale-95 duration-150" href="#">
              <span className="material-symbols-outlined">help</span>
              Support
            </a>
          </div>
        </nav>

        {/* ── TopAppBar (fixed) ── */}
        <header className="bg-background fixed top-0 right-0 w-[calc(100%-240px)] h-16 border-b border-outline-variant flex items-center justify-between px-lg ml-[240px] z-40">
          <div className="flex items-center gap-lg h-full">
            <nav className="flex items-center h-full gap-md">
              <a className="text-primary border-b-2 border-primary pb-xs h-full flex items-center text-[16px] font-medium cursor-pointer" href="#">Dashboard</a>
              <a className="text-on-surface-variant h-full flex items-center text-[16px] font-medium cursor-pointer hover:text-primary" href="#">Logs</a>
              <a className="text-on-surface-variant h-full flex items-center text-[16px] font-medium cursor-pointer hover:text-primary" href="#">Artifacts</a>
            </nav>
          </div>
          <div className="flex items-center gap-md">
            <div className="relative flex items-center">
              <input
                className="bg-surface-container-low border border-outline-variant rounded-full py-xs pl-md pr-10 text-on-surface focus:outline-none focus:border-primary w-64 text-[14px] placeholder:text-on-surface-variant"
                placeholder="Search..."
                type="text"
              />
              <span className="material-symbols-outlined absolute right-3 text-on-surface-variant pointer-events-none">search</span>
            </div>
            <button className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded-full hover:bg-surface-container-highest">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded-full hover:bg-surface-container-highest">
              <span className="material-symbols-outlined">terminal</span>
            </button>
            <span className="text-on-surface-variant text-[12px] whitespace-nowrap">{headerStatus}</span>
          </div>
        </header>

        {/* ── Main Content ── */}
        <main className="ml-[240px] mt-16 flex-1 p-lg overflow-y-auto w-[calc(100%-240px)] flex justify-center">
          {activePage === 'build' && (
            <BuildCenter
              projects={projects}
              pickerResetToken={pickerResetToken}
              openBrowseTrigger={openBrowseTrigger}
              buildConfig={buildConfig}
              onConfigChange={setBuildConfig}
              logs={logs}
              batchProjects={batchProjects}
              currentProjectIndex={currentProjectIndex}
              totalProjects={totalProjects}
              batchComplete={batchComplete}
              error={error}
              clearLogs={clearLogs}
              cancelBuild={cancelBuild}
              downloadProject={downloadProject}
              downloadAll={downloadAll}
              handleProjectSelect={handleProjectSelect}
              handleBranchSelect={handleBranchSelect}
              handleChangeProject={handleChangeProject}
              handleStartBuild={handleStartBuild}
              configLocked={configLocked}
              allBranchesSelected={allBranchesSelected}
              previewProjects={previewProjects}
              currentProjectName={currentProjectName}
            />
          )}
          {activePage === 'settings' && (
            <SettingsPage />
          )}
        </main>
      </div>
    </ConfigProvider>
  );
}

export default App;
