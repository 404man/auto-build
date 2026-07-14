import { useEffect, useRef } from 'react';
import type { LogEntry } from '../hooks/useBuild';

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
    <div className="bg-surface-container-lowest p-0 rounded-xl border border-outline-variant flex flex-col overflow-hidden h-[400px]">
      {/* Title Bar */}
      <div className="bg-surface-container-high px-md py-xs border-b border-outline-variant flex items-center justify-between">
        <span className="font-label-mono text-label-mono text-on-surface-variant flex items-center gap-xs">
          <span className="material-symbols-outlined text-sm">terminal</span>
          Build Logs
          {currentProjectName && (
            <span className="text-primary ml-xs">— {currentProjectName}</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-0.5 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="清空日志"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
          <div className="flex gap-1.5 ml-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-error" />
            <div className="w-2.5 h-2.5 rounded-full bg-tertiary-container" />
            <div className="w-2.5 h-2.5 rounded-full bg-secondary" />
          </div>
        </div>
      </div>

      {/* Log Content */}
      <div
        ref={containerRef}
        className="p-md font-code-block text-code-block text-on-surface-variant overflow-y-auto flex-1 whitespace-pre flex flex-col gap-1"
      >
        {logs.length === 0 ? (
          <span className="text-on-surface-variant opacity-40">等待构建开始...</span>
        ) : (
          logs.map((entry, idx) => (
            <span
              key={idx}
              className={entry.type === 'stderr' ? 'text-error' : ''}
            >
              {entry.projectName && (
                <span className="text-primary">{`[${entry.projectName}] `}</span>
              )}
              {entry.data}
            </span>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
