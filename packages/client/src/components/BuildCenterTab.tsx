import { useState, useCallback, useMemo } from 'react';
import BuildCenter from './BuildCenter';
import { type BuildConfigState } from './BuildConfiguration';
import { useBuild } from '../hooks/useBuild';
import type { DockerBuildOptions } from '../types/buildConfig';

interface SelectedProject {
  name: string;
  path: string;
}

interface BuildCenterTabProps {
  tabId: string;
  initialProjects?: SelectedProject[];
  onNameChange?: (name: string) => void;
}

export default function BuildCenterTab({ tabId: _tabId, initialProjects, onNameChange }: BuildCenterTabProps) {
  const [projects, setProjects] = useState<SelectedProject[]>(initialProjects && initialProjects.length > 0 ? initialProjects : []);
  const [projectBranches, setProjectBranches] = useState<Record<string, string>>({});

  const [pickerResetToken, setPickerResetToken] = useState(0);
  const [openBrowseTrigger, _setOpenBrowseTrigger] = useState(0);
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
    cacheClearedAt,
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
    // Update tab name with first project name
    if (selected.length > 0 && onNameChange) {
      onNameChange(selected[0].name);
    }
  }, [onNameChange]);

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
    const dockerOpts: DockerBuildOptions | null = buildConfig && buildConfig.buildMode === 'docker'
      ? {
          buildMode: 'docker',
          dockerfileTemplate: buildConfig.dockerfileTemplate,
          customDockerfile: buildConfig.customDockerfile || undefined,
          nginxConfig: buildConfig.nginxConfig,
          customNginxConfig: buildConfig.customNginxConfig || undefined,
          ...(buildConfig.pushEnabled
            ? { registry: { url: buildConfig.registryUrl, imageName: buildConfig.imageName } }
            : {}),
        }
      : null;

    startBatchBuild(
      projects.map((p) => ({
        name: p.name,
        path: p.path,
        branch: projectBranches[p.path],
      })),
      {
        installCommand: buildConfig?.installCommand || '',
        buildCommand: buildConfig?.buildCommand || '',
      },
      dockerOpts,
    );
  }, [projects, projectBranches, startBatchBuild, buildConfig]);

  return (
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
      cacheClearedAt={cacheClearedAt}
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
  );
}
