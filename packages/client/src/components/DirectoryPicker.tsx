import { useState, useCallback, useEffect, useRef } from 'react';
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
  disabled?: boolean;
  /** Bump this value (e.g. on "更换项目") to clear the current selection without re-scanning. */
  resetToken?: number;
  /** Bump this value to programmatically open the browse modal (e.g. from "New Project" button). */
  openBrowseTrigger?: number;
}

export default function DirectoryPicker({ onProjectSelect, disabled = false, resetToken, openBrowseTrigger }: DirectoryPickerProps) {
  const [parentPath, setParentPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  useEffect(() => {
    if (resetToken === undefined) return;
    setSelectedPaths([]);
  }, [resetToken]);

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

  // Open browse modal when openBrowseTrigger changes
  const prevTriggerRef = useRef(openBrowseTrigger);
  useEffect(() => {
    if (openBrowseTrigger !== undefined && prevTriggerRef.current !== openBrowseTrigger) {
      const initial = parentPath || '/';
      setBrowseOpen(true);
      loadDirs(initial);
    }
    prevTriggerRef.current = openBrowseTrigger;
  }, [openBrowseTrigger, parentPath, loadDirs]);

  const handleBrowse = () => {
    if (disabled) return;
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
    <div className="flex flex-col gap-md">
      {/* Workspace Configuration Card */}
      <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
        <div className="flex items-center gap-xs mb-xs">
          <span className="material-symbols-outlined text-primary text-xl">folder</span>
          <h3 className="text-h2 text-on-surface text-lg">Workspace Configuration</h3>
        </div>
        <div className="flex flex-col gap-xs">
          <label className="font-label-mono text-label-mono text-on-surface-variant">Parent Directory Path</label>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="输入父目录路径，如 /Users/you/workspace"
              value={parentPath}
              onChange={(e) => setParentPath(e.target.value)}
              prefix={<FolderOutlined />}
              onPressEnter={handleScan}
              disabled={disabled}
            />
            <Button icon={<FolderOpenOutlined />} onClick={handleBrowse} disabled={disabled}>
              浏览
            </Button>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={scanning}
              onClick={handleScan}
              disabled={disabled}
            >
              扫描
            </Button>
          </Space.Compact>
        </div>
      </section>

      {/* Project Selection Card */}
      {projects.length > 0 && (
        <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
          <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-xs">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary text-xl">account_tree</span>
              <h3 className="text-h2 text-on-surface text-lg">Project Selection</h3>
            </div>
            <span className="bg-surface-container-highest text-on-surface-variant font-label-mono text-label-mono px-xs py-1 rounded">
              {projects.length} Found
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-label-mono text-label-mono text-on-surface-variant">Target Projects</label>
              <Select
                mode="multiple"
                placeholder="选择项目（可多选）"
                style={{ width: '100%' }}
                value={selectedPaths}
                onChange={handleSelect}
                disabled={disabled}
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
            </div>
          </div>
        </section>
      )}

      <Modal
        title="浏览目录"
        open={browseOpen}
        onCancel={() => setBrowseOpen(false)}
        footer={null}
        width={600}
      >
        <div className="mb-3 text-on-surface-variant">{browsePath}</div>
        {browseParentPath !== null && (
          <Button
            icon={<FolderOutlined />}
            className="mb-2"
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
              className="cursor-pointer"
              onClick={() => loadDirs(item.path)}
            >
              <FolderOutlined className="mr-2" />
              {item.name}
            </List.Item>
          )}
          locale={{ emptyText: '无子目录' }}
        />
        <div className="mt-4 text-right">
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
