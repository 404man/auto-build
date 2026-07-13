import { useState, useEffect, useRef } from 'react';
import { Select, Tag, Spin, message } from 'antd';
import { projectApi } from '../api';

interface BranchSelectorProps {
  projectPath: string;
  onBranchSelect: (branch: string) => void;
  disabled?: boolean;
}

export default function BranchSelector({ projectPath, onBranchSelect, disabled = false }: BranchSelectorProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();

  const onBranchSelectRef = useRef(onBranchSelect);
  onBranchSelectRef.current = onBranchSelect;

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    setLoading(true);
    setBranches([]);
    setSelected(undefined);
    projectApi
      .getBranches(projectPath)
      .then((res) => {
        if (cancelled) return;
        const { branches: list, current: cur } = res.data.data;
        setBranches(list);
        setCurrent(cur);
        setSelected(cur);
        onBranchSelectRef.current(cur);
      })
      .catch(() => {
        if (cancelled) return;
        message.error('获取分支列表失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectPath]);

  const handleChange = (value: string) => {
    setSelected(value);
    onBranchSelect(value);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Spin tip="加载分支列表..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 8, color: '#666' }}>
        当前分支：<Tag color="blue">{current || '-'}</Tag>
      </div>
      <Select
        placeholder="选择分支"
        style={{ width: '100%' }}
        value={selected}
        onChange={handleChange}
        disabled={disabled}
        options={branches.map((b) => ({
          value: b,
          label: (
            <span>
              {b}
              {b === current && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  current
                </Tag>
              )}
            </span>
          ),
        }))}
      />
    </div>
  );
}
