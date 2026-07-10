import { useState, useCallback, useMemo } from 'react';
import { ConfigProvider, Steps, Card, Typography, Descriptions, Divider, Button, Tag, List } from 'antd';
import { FolderOpenOutlined, BranchesOutlined, RocketOutlined, SwapOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import DirectoryPicker from './components/DirectoryPicker';
import BranchSelector from './components/BranchSelector';
import BuildPanel from './components/BuildPanel';
import LogViewer from './components/LogViewer';
import { useBuild } from './hooks/useBuild';

const { Title, Text } = Typography;

interface SelectedProject {
  name: string;
  path: string;
}

function App() {
  const [projects, setProjects] = useState<SelectedProject[]>([]);
  const [projectBranches, setProjectBranches] = useState<Record<string, string>>({});
  const build = useBuild();

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
  }, []);

  // 所有项目都已选择分支
  const allBranchesSelected = projects.length > 0 && projects.every((p) => !!projectBranches[p.path]);

  const currentStep = projects.length === 0 ? 0 : !allBranchesSelected ? 1 : 2;

  const currentProjectName = useMemo(() => {
    if (build.isBatch && build.batchProjects.length > 0) {
      const active = build.batchProjects[build.currentProjectIndex];
      return active?.name || '';
    }
    return '';
  }, [build.isBatch, build.batchProjects, build.currentProjectIndex]);

  const handleStartBuild = useCallback(() => {
    const projectsWithBranch = projects.map((p) => ({
      name: p.name,
      path: p.path,
      branch: projectBranches[p.path],
    }));
    build.startBatchBuild(projectsWithBranch);
  }, [projects, projectBranches, build]);

  return (
    <ConfigProvider locale={zhCN}>
      <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '32px 16px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Title level={2} style={{ marginBottom: 4 }}>
              auto-dist 构建平台
            </Title>
            <Text type="secondary">前端产物本地构建平台</Text>
          </div>

          <Card>
            <Steps
              current={currentStep}
              items={[
                { title: '选择项目', icon: <FolderOpenOutlined /> },
                { title: '选择分支', icon: <BranchesOutlined /> },
                { title: '构建', icon: <RocketOutlined /> },
              ]}
              style={{ marginBottom: 32 }}
            />

            <Divider />

            {/* Step 1: Directory Picker */}
            <div style={{ opacity: currentStep >= 0 ? 1 : 0.4, pointerEvents: currentStep >= 0 ? 'auto' : 'none' }}>
              <Title level={5} style={{ marginBottom: 12 }}>
                1. 选择项目目录（可多选）
              </Title>
              <DirectoryPicker onProjectSelect={handleProjectSelect} />
            </div>

            {projects.length > 0 && (
              <>
                <Divider />
                <div style={{ opacity: currentStep >= 1 ? 1 : 0.4, pointerEvents: currentStep >= 1 ? 'auto' : 'none' }}>
                  <Title level={5} style={{ marginBottom: 12 }}>
                    2. 为每个项目选择分支
                  </Title>
                  <List
                    dataSource={projects}
                    renderItem={(project) => (
                      <List.Item
                        key={project.path}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <div style={{ flex: '0 0 auto', marginRight: 16 }}>
                          <Tag color="blue">{project.name}</Tag>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <BranchSelector
                            projectPath={project.path}
                            onBranchSelect={(b) => handleBranchSelect(project.path, b)}
                          />
                        </div>
                      </List.Item>
                    )}
                  />
                </div>
              </>
            )}

            {projects.length > 0 && allBranchesSelected && (
              <>
                <Divider />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Title level={5} style={{ margin: 0 }}>
                      3. 构建
                    </Title>
                    <Button icon={<SwapOutlined />} onClick={handleChangeProject}>
                      更换项目
                    </Button>
                  </div>
                  <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                    <Descriptions.Item label="项目分支">
                      {projects.map((p) => (
                        <Tag key={p.path} color="blue" style={{ marginBottom: 4 }}>
                          {p.name}: {projectBranches[p.path]}
                        </Tag>
                      ))}
                    </Descriptions.Item>
                    <Descriptions.Item label="项目数量">{projects.length} 个</Descriptions.Item>
                  </Descriptions>
                  <BuildPanel
                    branch=""
                    isBatch={true}
                    batchProjects={build.batchProjects}
                    currentProjectIndex={build.currentProjectIndex}
                    totalProjects={build.totalProjects}
                    batchComplete={build.batchComplete}
                    error={build.error}
                    onStart={handleStartBuild}
                    onCancel={build.cancelBuild}
                    onDownloadProject={build.downloadProject}
                    onDownloadAll={build.downloadAll}
                  />
                  <div style={{ marginTop: 16 }}>
                    <LogViewer logs={build.logs} onClear={build.clearLogs} currentProjectName={currentProjectName} />
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default App;
