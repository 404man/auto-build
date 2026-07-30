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
      <div className="flex items-center justify-center py-md">
        <Spin tip="加载分支列表..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center gap-xs text-on-surface-variant">
        <span className="font-label-mono text-label-mono">当前分支：</span>
        <Tag color="blue">{current || '-'}</Tag>
      </div>
      <div className="flex items-center gap-xs">
        <span className="material-symbols-outlined text-primary text-xl">call_split</span>
        <Select
          showSearch
          optionFilterProp="value"
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
    </div>
  );
}
