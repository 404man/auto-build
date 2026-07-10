import { useEffect, useRef } from 'react';
import { Button, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { LogEntry } from '../hooks/useBuild';

const { Text } = Typography;

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  currentProjectName?: string;
}

export default function LogViewer({ logs, onClear, currentProjectName }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ position: 'relative' }}>
      {currentProjectName && (
        <div style={{ marginBottom: 8, color: '#1677ff', fontWeight: 500 }}>
          当前构建：{currentProjectName}
        </div>
      )}
      <div style={{ position: 'absolute', top: currentProjectName ? 32 : 8, right: 8, zIndex: 1 }}>
        <Button
          size="small"
          icon={<DeleteOutlined />}
          onClick={onClear}
          disabled={logs.length === 0}
          ghost
        >
          清空日志
        </Button>
      </div>
      <div
        ref={containerRef}
        style={{
          background: '#1e1e1e',
          borderRadius: 8,
          padding: '16px 12px',
          height: 400,
          overflowY: 'auto',
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#666' }}>等待构建开始...</Text>
        ) : (
          logs.map((entry, idx) => (
            <div
              key={idx}
              style={{
                color: entry.type === 'stderr' ? '#ff6b6b' : '#d4d4d4',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {entry.projectName && (
                <span style={{ color: '#69c0ff' }}>[{entry.projectName}] </span>
              )}
              {entry.data}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
