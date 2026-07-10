import { useState, useCallback } from 'react';
import { Input, Button, Select, Space, Modal, List, Tag, message } from 'antd';
import { FolderOutlined, SearchOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { directoryApi } from '../api';

interface ProjectInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface DirEntry {
  name: string;
  path: string;
}

interface DirectoryPickerProps {
  onProjectSelect: (projects: Array<{ name: string; path: string }>) => void;
}

export default function DirectoryPicker({ onProjectSelect }: DirectoryPickerProps) {
  const [parentPath, setParentPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseParentPath, setBrowseParentPath] = useState<string | null>(null);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const loadDirs = useCallback(async (p: string) => {
    setBrowseLoading(true);
    try {
      const res = await directoryApi.browse(p);
      setBrowsePath(res.data.data.currentPath);
      setBrowseParentPath(res.data.data.parentPath ?? null);
      setDirs(res.data.data.directories);
    } catch {
      message.error('无法加载目录');
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const handleBrowse = () => {
    const initial = parentPath || '/';
    setBrowseOpen(true);
    loadDirs(initial);
  };

  const handleScan = async () => {
    if (!parentPath.trim()) {
      message.warning('请输入目录路径');
      return;
    }
    setScanning(true);
    setProjects([]);
    setSelectedPaths([]);
    onProjectSelect([]);
    try {
      const res = await directoryApi.scan(parentPath);
      const list = res.data.data.projects;
      if (list.length === 0) {
        message.info('该目录下未找到项目');
      }
      setProjects(list);
    } catch {
      message.error('扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const handleSelect = (values: string[]) => {
    setSelectedPaths(values);
    const selected = values
      .map((v) => projects.find((p) => p.path === v))
      .filter((p): p is ProjectInfo => !!p)
      .map((p) => ({ name: p.name, path: p.path }));
    onProjectSelect(selected);
  };

  return (
    <div>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder="输入父目录路径，如 /Users/you/workspace"
          value={parentPath}
          onChange={(e) => setParentPath(e.target.value)}
          prefix={<FolderOutlined />}
          onPressEnter={handleScan}
        />
        <Button icon={<FolderOpenOutlined />} onClick={handleBrowse}>
          浏览
        </Button>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          loading={scanning}
          onClick={handleScan}
        >
          扫描
        </Button>
      </Space.Compact>

      {projects.length > 0 && (
        <Select
          mode="multiple"
          placeholder="选择项目（可多选）"
          style={{ width: '100%' }}
          value={selectedPaths}
          onChange={handleSelect}
          options={projects.map((p) => ({
            value: p.path,
            label: (
              <span>
                {p.name}
                {p.isGitRepo && (
                  <Tag color="green" style={{ marginLeft: 8 }}>
                    Git
                  </Tag>
                )}
              </span>
            ),
          }))}
        />
      )}

      <Modal
        title="浏览目录"
        open={browseOpen}
        onCancel={() => setBrowseOpen(false)}
        footer={null}
        width={600}
      >
        <div style={{ marginBottom: 12, color: '#888' }}>{browsePath}</div>
        {browseParentPath !== null && (
          <Button
            icon={<FolderOutlined />}
            style={{ marginBottom: 8 }}
            onClick={() => loadDirs(browseParentPath!)}
          >
            返回上级
          </Button>
        )}
        <List
          loading={browseLoading}
          dataSource={dirs}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => loadDirs(item.path)}
            >
              <FolderOutlined style={{ marginRight: 8 }} />
              {item.name}
            </List.Item>
          )}
          locale={{ emptyText: '无子目录' }}
        />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space>
            <Button onClick={() => setBrowseOpen(false)}>取消</Button>
            <Button
              type="primary"
              onClick={() => {
                setParentPath(browsePath);
                setBrowseOpen(false);
              }}
            >
              选择此目录
            </Button>
          </Space>
        </div>
      </Modal>
    </div>
  );
}
