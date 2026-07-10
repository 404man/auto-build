import { Button, Space, Tag, Alert, Typography, List } from 'antd';
import { PlayCircleOutlined, StopOutlined, DownloadOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, SyncOutlined, ForwardOutlined, FolderOpenOutlined } from '@ant-design/icons';
import type { ProjectBuildState, BatchProjectStatus } from '../hooks/useBuild';
import { directoryApi } from '../api';

const { Text } = Typography;

interface BuildPanelProps {
  branch: string;
  isBatch: boolean;
  batchProjects: ProjectBuildState[];
  currentProjectIndex: number;
  totalProjects: number;
  batchComplete: boolean;
  error: string;
  onStart: () => void;
  onCancel: () => void;
  onDownloadProject: (buildId: string) => void;
  onDownloadAll: () => void;
}

const batchStatusConfig: Record<BatchProjectStatus, { color: string; label: string; icon: React.ReactNode }> = {
  pending: { color: 'default', label: '等待中', icon: <ClockCircleOutlined /> },
  building: { color: 'processing', label: '构建中', icon: <SyncOutlined spin /> },
  completed: { color: 'success', label: '完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
  skipped: { color: 'warning', label: '跳过', icon: <ForwardOutlined /> },
};

export default function BuildPanel({
  branch,
  isBatch,
  batchProjects,
  currentProjectIndex,
  totalProjects,
  batchComplete,
  error,
  onStart,
  onCancel,
  onDownloadProject,
  onDownloadAll,
}: BuildPanelProps) {
  const isRunning = batchProjects.some((p) => p.status === 'building');
  const completedCount = batchProjects.filter((p) => p.status === 'completed').length;
  const hasCompletedProjects = completedCount > 0;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">分支：</Text>
        <Text strong>{branch}</Text>
        {isBatch && totalProjects > 0 && (
          <>
            <Text type="secondary" style={{ marginLeft: 16 }}>
              构建进度：
            </Text>
            <Text strong>
              {currentProjectIndex + 1}/{totalProjects}
            </Text>
          </>
        )}
      </div>

      {/* Project list */}
      {isBatch && batchProjects.length > 0 && (
        <List
          size="small"
          dataSource={batchProjects}
          renderItem={(item) => {
            const cfg = batchStatusConfig[item.status];
            return (
              <List.Item
                actions={[
                  <Button
                    key="open-folder"
                    type="link"
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={() => directoryApi.openDirectory(item.path)}
                  >
                    打开文件夹
                  </Button>,
                  item.status === 'completed' && item.buildId ? (
                    <Button
                      key="download"
                      type="link"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => onDownloadProject(item.buildId)}
                    >
                      下载
                    </Button>
                  ) : null,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <span>{item.name}</span>
                      <Tag color={cfg.color} icon={cfg.icon}>
                        {cfg.label}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.path}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
          style={{ marginBottom: 16 }}
        />
      )}

      <Space>
        {!isRunning && !batchComplete && (
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStart}>
            开始构建
          </Button>
        )}
        {isRunning && (
          <Button danger icon={<StopOutlined />} onClick={onCancel}>
            取消构建
          </Button>
        )}
        {batchComplete && hasCompletedProjects && (
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            onClick={onDownloadAll}
          >
            全部下载 ({completedCount})
          </Button>
        )}
        {batchComplete && (
          <Button icon={<ReloadOutlined />} onClick={onStart}>
            重新构建
          </Button>
        )}
      </Space>

      {batchComplete && error && (
        <Alert type="error" message="构建出错" description={error} showIcon style={{ marginTop: 16 }} />
      )}
    </div>
  );
}
