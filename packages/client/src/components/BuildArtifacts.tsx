interface BuildArtifactsProps {
  zipPath?: string;
  zipSize?: number;
  buildTime?: number;
  projectName?: string;
}

export function BuildArtifacts({ zipPath, zipSize, buildTime, projectName }: BuildArtifactsProps) {
  if (!zipPath) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = () => {
    if (zipPath) {
      window.open(`/api/build/download?path=${encodeURIComponent(zipPath)}`, '_blank');
    }
  };

  return (
    <div className="bg-surface-container p-md rounded-xl border border-secondary/30 flex flex-col gap-sm relative overflow-hidden">
      <div className="absolute inset-0 bg-secondary/5 z-0 pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-sm">
        <div className="flex items-center gap-xs mb-xs">
          <span className="material-symbols-outlined text-secondary text-xl">check_circle</span>
          <h3 className="text-h2 text-on-surface text-lg">
            Build Artifacts{projectName ? ` — ${projectName}` : ''}
          </h3>
        </div>
        <button
          onClick={handleDownload}
          className="bg-surface-variant text-on-surface hover:bg-surface-container-highest border border-outline-variant py-sm px-md rounded font-body-sm font-medium transition-colors flex items-center justify-center gap-xs w-full group"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-y-0.5 transition-transform">download</span>
          Download dist.zip
        </button>
        <p className="text-center font-label-mono text-label-mono text-on-surface-variant mt-xs">
          Size: {formatSize(zipSize || 0)}{buildTime ? ` • ${Math.round(buildTime / 1000)}s` : ''}
        </p>
      </div>
    </div>
  );
}
