import { useState, useCallback, useEffect } from 'react';
import { Radio, Select, Switch, Input, Modal, App } from 'antd';
import { settingsApi, nvmApi } from '../api';
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
  imageTag: string;
  platform: string;
  gzipImage: boolean;
  installCommand: string;   // 自定义安装命令，空字符串表示使用自动检测
  buildCommand: string;     // 自定义构建命令，空字符串表示使用自动检测
  nodeVersion: string;      // nvm Node 版本，空字符串表示使用当前默认
}

interface BuildConfigurationProps {
  config?: BuildConfigState | null;
  onConfigChange?: (config: BuildConfigState) => void;
}


export function BuildConfiguration({ config: _externalConfig, onConfigChange }: BuildConfigurationProps) {
  const { message } = App.useApp();
  const [config, setConfig] = useState<BuildConfigState>({
    buildMode: 'static',
    dockerfileTemplate: 'node',
    customDockerfile: '',
    nginxConfig: 'standard-spa',
    customNginxConfig: '',
    pushEnabled: false,
    registryUrl: '',
    imageName: '',
    imageTag: '',
    platform: '',
    gzipImage: true,
    installCommand: '',
    buildCommand: '',
    nodeVersion: '',
  });

  const [dockerTemplates, setDockerTemplates] = useState<TemplateListItem[]>([]);
  const [nginxTemplates, setNginxTemplates] = useState<TemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [nodeVersions, setNodeVersions] = useState<string[]>([]);
  const [currentNodeVersion, setCurrentNodeVersion] = useState('');
  const [nodeVersionsLoading, setNodeVersionsLoading] = useState(true);

  // Edit modal state
  const [editDockerModal, setEditDockerModal] = useState(false);
  const [editNginxModal, setEditNginxModal] = useState(false);
  const [editingTemplateContent, setEditingTemplateContent] = useState('');

  const reloadTemplates = useCallback(async () => {
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
        { key: 'node', name: 'Node.js (Standard)', description: 'Node.js 18 Alpine' },
        { key: 'react-nginx', name: 'React (Nginx)', description: 'Multi-stage build' },
        { key: 'python-flask', name: 'Python (Flask)', description: 'Python 3.11 slim' },
        { key: 'custom', name: 'Custom', description: 'Custom Dockerfile' },
      ]);
      setNginxTemplates([
        { key: 'standard-spa', name: 'Standard SPA', description: 'try_files fallback' },
        { key: 'reverse-proxy', name: 'Reverse Proxy', description: 'Frontend + API proxy' },
        { key: 'custom', name: 'Custom', description: 'Custom Nginx config' },
      ]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadTemplates();
  }, [reloadTemplates]);

  useEffect(() => {
    let cancelled = false;
    setNodeVersionsLoading(true);
    nvmApi
      .listVersions()
      .then((res) => {
        if (cancelled) return;
        const { versions, current } = res.data.data;
        setNodeVersions(versions);
        setCurrentNodeVersion(current);
        // 默认选中当前运行时版本
        setConfig((prev) => {
          if (prev.nodeVersion) return prev;
          const next = { ...prev, nodeVersion: current || '' };
          onConfigChange?.(next);
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setNodeVersions([]);
      })
      .finally(() => {
        if (!cancelled) setNodeVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onConfigChange]);

  useEffect(() => {
    let cancelled = false;
    settingsApi.getDockerBuild()
      .then((res) => {
        if (cancelled) return;
        const d = res.data.data;
        setConfig((prev) => {
          const next = {
            ...prev,
            platform: prev.platform || d?.platform || '',
            gzipImage: d?.gzipImage !== false,
          };
          onConfigChange?.(next);
          return next;
        });
      })
      .catch(() => { /* 使用本地默认 */ });
    return () => {
      cancelled = true;
    };
  }, [onConfigChange]);

  const handleEditDocker = useCallback(async () => {
    try {
      const res = await settingsApi.getDockerfileTemplate(config.dockerfileTemplate);
      setEditingTemplateContent(res.data.data.content || '');
      setEditDockerModal(true);
    } catch {
      message.error('Failed to load template');
    }
  }, [config.dockerfileTemplate]);

  const handleEditNginx = useCallback(async () => {
    try {
      const res = await settingsApi.getNginxConfig(config.nginxConfig);
      setEditingTemplateContent(res.data.data.content || '');
      setEditNginxModal(true);
    } catch {
      message.error('Failed to load nginx config');
    }
  }, [config.nginxConfig]);

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

  const handleSaveDockerTemplate = useCallback(() => {
    updateConfig({ customDockerfile: editingTemplateContent });
    message.success('Dockerfile 已应用于本次构建');
    setEditDockerModal(false);
  }, [editingTemplateContent, updateConfig]);

  const handleSaveNginxConfig = useCallback(() => {
    updateConfig({ customNginxConfig: editingTemplateContent });
    message.success('Nginx 配置已应用于本次构建');
    setEditNginxModal(false);
  }, [editingTemplateContent, updateConfig]);



  return (
    <>
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

      {/* Node version (Static Resource Build only) */}
      {config.buildMode === 'static' && (
        <div className="flex flex-col gap-xs mb-sm">
          <label className="text-label-mono font-label-mono text-on-surface-variant">
            Node Version
            <span className="text-on-surface-variant opacity-50 ml-1">(via nvm)</span>
          </label>
          <Select
            value={config.nodeVersion || undefined}
            onChange={(v) => updateConfig({ nodeVersion: v })}
            loading={nodeVersionsLoading}
            placeholder="Select Node version"
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={nodeVersions.map((v) => ({
              value: v,
              label: v === currentNodeVersion ? `${v} (current)` : v,
            }))}
            notFoundContent={nodeVersionsLoading ? 'Loading…' : '未检测到 nvm 版本'}
          />
        </div>
      )}

      {/* Commands Display */}
      <div className="flex flex-col gap-sm">
        {/* Install Command */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-mono font-label-mono text-on-surface-variant">
            Install Command
            <span className="text-on-surface-variant opacity-50 ml-1">(auto-detect if empty)</span>
          </label>
          <Input
            value={config.installCommand}
            onChange={(e) => updateConfig({ installCommand: e.target.value })}
            placeholder="e.g. npm install --legacy-peer-deps"
            className="bg-surface border-outline-variant text-on-surface font-label-mono"
            allowClear
          />
        </div>

        {/* Build Command */}
        <div className="flex flex-col gap-xs">
          <label className="text-label-mono font-label-mono text-on-surface-variant">
            Build Command
            <span className="text-on-surface-variant opacity-50 ml-1">(auto-detect if empty)</span>
          </label>
          <Input
            value={config.buildCommand}
            onChange={(e) => updateConfig({ buildCommand: e.target.value })}
            placeholder="e.g. NODE_OPTIONS=--max-old-space-size=4096 npm run build"
            className="bg-surface border-outline-variant text-on-surface font-label-mono"
            allowClear
          />
        </div>
      </div>

      {/* Docker-specific sections */}
      {config.buildMode === 'docker' && (
        <>
          <div className="border-t border-outline-variant my-sm" />

          {/* Dockerfile Template */}
          <div className="flex flex-col gap-xs">
            <label className="font-label-mono text-label-mono text-on-surface-variant">Dockerfile Template</label>
            <div className="flex items-center gap-sm">
              <Select
                value={config.dockerfileTemplate}
                onChange={(v) => updateConfig({ dockerfileTemplate: v })}
                style={{ flex: 1 }}
                loading={templatesLoading}
              >
                {dockerTemplates.map(t => (
                  <Select.Option key={t.key} value={t.key}>
                    {t.name}
                  </Select.Option>
                ))}
              </Select>
              {config.dockerfileTemplate && config.dockerfileTemplate !== 'custom' && (
                <button
                  type="button"
                  onClick={handleEditDocker}
                  className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded hover:bg-surface-container-highest flex items-center justify-center"
                  title="Edit template"
                >
                  <span className="material-symbols-outlined text-xl">edit</span>
                </button>
              )}
            </div>
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
                <div className="flex items-center gap-sm">
                  <Select
                    value={config.nginxConfig}
                    onChange={(v) => updateConfig({ nginxConfig: v })}
                    style={{ flex: 1 }}
                    loading={templatesLoading}
                  >
                    {nginxTemplates.map(t => (
                      <Select.Option key={t.key} value={t.key}>
                        {t.name}
                      </Select.Option>
                    ))}
                  </Select>
                  {config.nginxConfig && config.nginxConfig !== 'custom' && (
                    <button
                      type="button"
                      onClick={handleEditNginx}
                      className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded hover:bg-surface-container-highest flex items-center justify-center"
                      title="Edit nginx config"
                    >
                      <span className="material-symbols-outlined text-xl">edit</span>
                    </button>
                  )}
                </div>
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

          <div className="border-t border-outline-variant my-sm" />

          {/* Image identity + platform */}
          <div className="flex items-center gap-xs mb-xs">
            <span className="material-symbols-outlined text-primary text-xl">deploy</span>
            <h4 className="text-h2 text-on-surface text-lg">Image &amp; Platform</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-label-mono text-label-mono text-on-surface-variant">Image Name</label>
              <Input
                placeholder="hm-portal-ui"
                value={config.imageName}
                onChange={(e) => updateConfig({ imageName: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label className="font-label-mono text-label-mono text-on-surface-variant">Image Tag</label>
              <Input
                placeholder="latest"
                value={config.imageTag}
                onChange={(e) => updateConfig({ imageTag: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-xs">
            <label className="font-label-mono text-label-mono text-on-surface-variant">Build Platform</label>
            <Select
              value={config.platform}
              onChange={(v) => updateConfig({ platform: v })}
              style={{ width: '100%' }}
              options={[
                { label: 'Host default（不指定 --platform）', value: '' },
                { label: 'linux/amd64', value: 'linux/amd64' },
                { label: 'linux/arm64', value: 'linux/arm64' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block">Gzip 压缩镜像下载</label>
              <p className="text-on-surface-variant text-[11px] mt-xs">下载时 <code className="font-label-mono">docker save | gzip</code>，生成 .tar.gz</p>
            </div>
            <Switch
              checked={config.gzipImage}
              onChange={(checked) => updateConfig({ gzipImage: checked })}
            />
          </div>

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
            <div className="flex flex-col gap-xs">
              <label className="font-label-mono text-label-mono text-on-surface-variant">Registry URL</label>
              <Input
                placeholder="docker.io"
                value={config.registryUrl}
                onChange={(e) => updateConfig({ registryUrl: e.target.value })}
              />
            </div>
          )}
        </>
      )}
    </section>

      {/* Dockerfile Template Edit Modal */}
      <Modal
        title="编辑 Dockerfile（仅用于本次构建）"
        open={editDockerModal}
        onCancel={() => setEditDockerModal(false)}
        onOk={handleSaveDockerTemplate}
        width={720}
      >
        <Input.TextArea
          value={editingTemplateContent}
          onChange={(e) => setEditingTemplateContent(e.target.value)}
          rows={16}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', lineHeight: '20px' }}
          className="bg-surface border-outline-variant text-on-surface"
        />
      </Modal>

      {/* Nginx Config Edit Modal */}
      <Modal
        title="编辑 Nginx 配置（仅用于本次构建）"
        open={editNginxModal}
        onCancel={() => setEditNginxModal(false)}
        onOk={handleSaveNginxConfig}
        width={720}
      >
        <Input.TextArea
          value={editingTemplateContent}
          onChange={(e) => setEditingTemplateContent(e.target.value)}
          rows={16}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', lineHeight: '20px' }}
          className="bg-surface border-outline-variant text-on-surface"
        />
      </Modal>
    </>
  );
}
