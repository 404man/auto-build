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
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
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
        >
          清空日志
        </Button>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          background: '#fafafa',
          border: '1px solid #e8e8e8',
          borderRadius: 8,
          padding: '16px 12px',
          marginTop: 28,
          overflowY: 'auto',
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#bfbfbf' }}>等待构建开始...</Text>
        ) : (
          logs.map((entry, idx) => (
            <div
              key={idx}
              style={{
                color: entry.type === 'stderr' ? '#cf1322' : '#262626',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {entry.projectName && (
                <span style={{ color: '#1677ff' }}>[{entry.projectName}] </span>
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
