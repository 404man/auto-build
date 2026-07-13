import { useState, useCallback, useMemo } from 'react';
import { ConfigProvider, Typography, Button, Tag, Space } from 'antd';
import { SwapOutlined, RocketOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import DirectoryPicker from './components/DirectoryPicker';
import BranchSelector from './components/BranchSelector';
import BuildPanel from './components/BuildPanel';
import LogViewer from './components/LogViewer';
import { useBuild } from './hooks/useBuild';
import { appTheme } from './theme';

const { Text } = Typography;

interface SelectedProject {
  name: string;
  path: string;
}

function App() {
  const [projects, setProjects] = useState<SelectedProject[]>([]);
  const [projectBranches, setProjectBranches] = useState<Record<string, string>>({});
  const build = useBuild();
  const { clearLogs, cancelBuild, downloadProject, downloadAll, startBatchBuild, logs, batchProjects, currentProjectIndex, totalProjects, batchComplete, error, isBatch } = build;

  const handleProjectSelect = useCallback((selected: SelectedProject[]) => {
    setProjects(selected);
    setProjectBranches({});
  }, []);

  const handleBranchSelect = useCallback((projectPath: string, branch: string) => {
    setProjectBranches((prev) => ({ ...prev, [projectPath]: branch }));
  }, []);

  const handleChangeProject = useCallback(() => {
    setProjects([]);
    setProjectBranches({});
    clearLogs();
  }, [clearLogs]);

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

  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <div className="ws-root">
        <header className="ws-header">
          <div className="ws-header-title">
            <h1>auto-dist</h1>
            <span>前端产物本地构建平台</span>
          </div>
          <Tag color={configLocked ? 'processing' : batchComplete ? 'success' : 'default'}>
            {headerStatus}
          </Tag>
        </header>

        <div className="ws-body">
          <aside className="ws-sidebar">
            <div>
              <p className="ws-sidebar-section-title">1. 选择项目目录</p>
              <DirectoryPicker onProjectSelect={handleProjectSelect} disabled={configLocked} />
            </div>

            {projects.length > 0 && (
              <div>
                <p className="ws-sidebar-section-title">2. 为每个项目选择分支</p>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {projects.map((project) => (
                    <div key={project.path}>
                      <Tag color="blue" style={{ marginBottom: 8 }}>
                        {project.name}
                      </Tag>
                      <BranchSelector
                        projectPath={project.path}
                        onBranchSelect={(b) => handleBranchSelect(project.path, b)}
                        disabled={configLocked}
                      />
                    </div>
                  ))}
                </Space>
              </div>
            )}

            {projects.length > 0 && (
              <Button icon={<SwapOutlined />} onClick={handleChangeProject} disabled={configLocked} block>
                更换项目
              </Button>
            )}
          </aside>

          <main className="ws-main">
            {!allBranchesSelected ? (
              <div className="ws-empty">
                <RocketOutlined />
                <Text>请在左侧完成项目与分支选择</Text>
              </div>
            ) : (
              <>
                <div className="ws-main-top">
                  <BuildPanel
                    previewProjects={previewProjects}
                    isBatch={true}
                    batchProjects={batchProjects}
                    currentProjectIndex={currentProjectIndex}
                    totalProjects={totalProjects}
                    batchComplete={batchComplete}
                    error={error}
                    onStart={handleStartBuild}
                    onCancel={cancelBuild}
                    onDownloadProject={downloadProject}
                    onDownloadAll={downloadAll}
                  />
                </div>
                <div className="ws-main-log">
                  <LogViewer
                    logs={logs}
                    onClear={clearLogs}
                    currentProjectName={currentProjectName}
                  />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default App;
