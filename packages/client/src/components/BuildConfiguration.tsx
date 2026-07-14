import { useState, useCallback, useEffect } from 'react';
import { Radio, Select, Switch, Input } from 'antd';
import { settingsApi } from '../api';
import type { TemplateListItem } from '../types/buildConfig';

export interface BuildConfigState {
  buildMode: 'static' | 'docker';
  dockerfileTemplate: string;
  customDockerfile: string;
  nginxConfig: string;
  customNginxConfig: string;
  pushEnabled: boolean;
  registryUrl: string;
  imageName: string;
}

interface BuildConfigurationProps {
  config?: BuildConfigState | null;
  onConfigChange?: (config: BuildConfigState) => void;
}


export function BuildConfiguration({ config: _externalConfig, onConfigChange }: BuildConfigurationProps) {
  const [config, setConfig] = useState<BuildConfigState>({
    buildMode: 'static',
    dockerfileTemplate: 'node',
    customDockerfile: '',
    nginxConfig: 'standard-spa',
    customNginxConfig: '',
    pushEnabled: false,
    registryUrl: '',
    imageName: '',
  });

  const [dockerTemplates, setDockerTemplates] = useState<TemplateListItem[]>([]);
  const [nginxTemplates, setNginxTemplates] = useState<TemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [dockerRes, nginxRes] = await Promise.all([
          settingsApi.listDockerfileTemplates(),
          settingsApi.listNginxConfigs(),
        ]);
        setDockerTemplates(dockerRes.data.data);
        setNginxTemplates(nginxRes.data.data);
      } catch {
        // 降级：使用内置默认选项
        setDockerTemplates([
          { key: 'node', name: 'Node.js (Standard)', description: 'Node.js 18 Alpine', builtin: true },
          { key: 'react-nginx', name: 'React (Nginx)', description: 'Multi-stage build', builtin: true },
          { key: 'python-flask', name: 'Python (Flask)', description: 'Python 3.11 slim', builtin: true },
          { key: 'custom', name: 'Custom', description: 'Custom Dockerfile', builtin: true },
        ]);
        setNginxTemplates([
          { key: 'standard-spa', name: 'Standard SPA', description: 'try_files fallback', builtin: true },
          { key: 'reverse-proxy', name: 'Reverse Proxy', description: 'Frontend + API proxy', builtin: true },
          { key: 'custom', name: 'Custom', description: 'Custom Nginx config', builtin: true },
        ]);
      } finally {
        setTemplatesLoading(false);
      }
    };
    load();
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<BuildConfigState>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        onConfigChange?.(next);
        return next;
      });
    },
    [onConfigChange],
  );



  return (
    <section className="bg-surface-container p-md rounded-xl border border-outline-variant flex flex-col gap-sm">
      {/* Header */}
      <div className="flex items-center gap-xs border-b border-outline-variant pb-sm mb-xs">
        <span className="material-symbols-outlined text-primary text-xl">settings_applications</span>
        <h3 className="text-h2 text-on-surface text-lg">Build Configuration</h3>
      </div>

      {/* Build Mode Radio */}
      <div className="flex items-center gap-md mb-sm">
        <Radio.Group
          value={config.buildMode}
          onChange={(e) => updateConfig({ buildMode: e.target.value })}
        >
          <Radio value="static">Static Resource Build</Radio>
          <Radio value="docker">Docker Image Build</Radio>
        </Radio.Group>
      </div>

      {/* Commands Display */}
      <div className="flex flex-col gap-sm">
        <div className="flex flex-col gap-xs">
          <label className="font-label-mono text-label-mono text-on-surface-variant">Install Command</label>
          <div className="bg-surface-container-lowest border border-outline-variant rounded p-sm font-code-block text-code-block flex items-center gap-xs">
            <span className="text-secondary">npm</span>{' '}
            <span className="text-on-surface">install</span>
          </div>
        </div>
        <div className="flex flex-col gap-xs">
          <label className="font-label-mono text-label-mono text-on-surface-variant">Build Command</label>
          <div className="bg-surface-container-lowest border border-outline-variant rounded p-sm font-code-block text-code-block flex items-center gap-xs">
            <span className="text-secondary">npm</span>{' '}
            <span className="text-on-surface">run</span>{' '}
            <span className="text-primary">build</span>
          </div>
        </div>
      </div>

      {/* Docker-specific sections */}
      {config.buildMode === 'docker' && (
        <>
          <div className="border-t border-outline-variant my-sm" />

          {/* Dockerfile Template */}
          <div className="flex flex-col gap-xs">
            <label className="font-label-mono text-label-mono text-on-surface-variant">Dockerfile Template</label>
            <Select
              value={config.dockerfileTemplate}
              onChange={(v) => updateConfig({ dockerfileTemplate: v })}
              style={{ width: '100%' }}
              loading={templatesLoading}
            >
              {dockerTemplates.map(t => (
                <Select.Option key={t.key} value={t.key}>
                  {t.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          {/* Dockerfile Preview */}
          {config.dockerfileTemplate === 'custom' && (
            <Input.TextArea
              value={config.customDockerfile}
              onChange={(e) => updateConfig({ customDockerfile: e.target.value })}
              placeholder="Write your custom Dockerfile here..."
              autoSize={{ minRows: 6, maxRows: 12 }}
              className="font-code-block text-code-block"
            />
          )}

          {/* Nginx Configuration (show for react-nginx template) */}
          {config.dockerfileTemplate === 'react-nginx' && (
            <>
              <div className="border-t border-outline-variant my-sm" />
              <div className="flex items-center gap-xs mb-xs">
                <span className="material-symbols-outlined text-primary text-xl">settings_ethernet</span>
                <h4 className="text-h2 text-on-surface text-lg">Nginx Configuration</h4>
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-label-mono text-label-mono text-on-surface-variant">Nginx Template</label>
                <Select
                  value={config.nginxConfig}
                  onChange={(v) => updateConfig({ nginxConfig: v })}
                  style={{ width: '100%' }}
                  loading={templatesLoading}
                >
                  {nginxTemplates.map(t => (
                    <Select.Option key={t.key} value={t.key}>
                      {t.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
              {config.nginxConfig === 'custom' && (
                <Input.TextArea
                  value={config.customNginxConfig}
                  onChange={(e) => updateConfig({ customNginxConfig: e.target.value })}
                  placeholder="Write your custom nginx config here..."
                  autoSize={{ minRows: 6, maxRows: 12 }}
                  className="font-code-block text-code-block"
                />
              )}
            </>
          )}

          {/* Push Configuration */}
          <div className="border-t border-outline-variant my-sm" />
          <div className="flex items-center justify-between mb-xs">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary text-xl">cloud_upload</span>
              <h4 className="text-h2 text-on-surface text-lg">Push Configuration</h4>
            </div>
            <Switch
              checked={config.pushEnabled}
              onChange={(checked) => updateConfig({ pushEnabled: checked })}
            />
          </div>
          {config.pushEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div className="flex flex-col gap-xs">
                <label className="font-label-mono text-label-mono text-on-surface-variant">Registry URL</label>
                <Input
                  placeholder="docker.io"
                  value={config.registryUrl}
                  onChange={(e) => updateConfig({ registryUrl: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-label-mono text-label-mono text-on-surface-variant">Image Name &amp; Tag</label>
                <Input
                  placeholder="my-app:latest"
                  value={config.imageName}
                  onChange={(e) => updateConfig({ imageName: e.target.value })}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
