import { useState, useEffect, useCallback } from 'react';
import { Table, Input, InputNumber, Switch, Radio, Modal, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { settingsApi, type SubApp } from '../api';

/* ────────────────────────── helpers ────────────────────────── */

let idCounter = 0;
const genId = () => `new_${Date.now()}_${++idCounter}`;

/* ────────────────────────── MicroAppManager ────────────────────────── */

export default function MicroAppManager() {
  const { message } = App.useApp();

  /* ---- sub-app state ---- */
  const [subApps, setSubApps] = useState<SubApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ---- generator state ---- */
  const [mode, setMode] = useState<'standard' | 'docker'>('standard');
  const [standardOptions, setStandardOptions] = useState({
    baseDir: '/alidata1/admin/projects',
    listenPort: 80,
    apiProxyTarget: 'http://172.20.122.11:7087',
    sidebarDomain: '',
  });
  const [dockerOptions, setDockerOptions] = useState({
    listenPort: 8080,
    apiServerUrl: '${API_SERVER_URL}',
  });
  const [generating, setGenerating] = useState(false);

  /* ---- preview state ---- */
  const [generatedConfig, setGeneratedConfig] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  /* ---- load sub-apps ---- */
  const reload = useCallback(() => {
    setLoading(true);
    settingsApi
      .getSubApps()
      .then((res) => setSubApps(res.data.data ?? []))
      .catch(() => message.error('加载子应用列表失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ---- inline edit helpers ---- */
  const updateField = <K extends keyof SubApp>(id: string, field: K, value: SubApp[K]) => {
    setSubApps((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const addRow = () => {
    setSubApps((prev) => [
      ...prev,
      { id: genId(), routePath: '', deployDir: '', projectName: '', enabled: true },
    ]);
  };

  const removeRow = (id: string) => {
    setSubApps((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleAll = (checked: boolean) => {
    setSubApps((prev) => prev.map((s) => ({ ...s, enabled: checked })));
  };

  const allEnabled = subApps.length > 0 && subApps.every((s) => s.enabled);

  /* ---- save ---- */
  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.saveSubApps(subApps);
      message.success('子应用列表已保存');
      reload();
    } catch {
      /* interceptor */
    } finally {
      setSaving(false);
    }
  };

  /* ---- generate ---- */
  const handleGenerate = async () => {
    const enabledApps = subApps.filter((s) => s.enabled);
    if (enabledApps.length === 0) return message.warning('请至少启用一个子应用');
    setGenerating(true);
    try {
      const baseOptions = mode === 'standard' ? standardOptions : dockerOptions;
      const options = mode === 'docker'
        ? {
            ...baseOptions,
            proxyApps: enabledApps.map(app => ({
              routePath: app.routePath,
              envVar: `${app.routePath.toUpperCase().replace(/-/g, '_')}_SERVER_URL`,
            })),
          }
        : baseOptions;
      const res = await settingsApi.generateNginx({ mode, subApps: enabledApps, options });
      setGeneratedConfig(res.data.data.config);
      setPreviewVisible(true);
    } catch {
      /* interceptor */
    } finally {
      setGenerating(false);
    }
  };

  /* ---- preview actions ---- */
  const handleCopy = async () => {
    if (!generatedConfig) return;
    try {
      await navigator.clipboard.writeText(generatedConfig);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  const handleDownload = () => {
    if (!generatedConfig) return;
    const blob = new Blob([generatedConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nginx.conf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('配置文件已下载');
  };

  const handleSaveAsTemplate = async () => {
    if (!generatedConfig) return;
    const key = `micro-app-${Date.now()}`;
    try {
      await settingsApi.createNginxConfig({
        key,
        name: `微前端 Nginx (${mode === 'standard' ? '标准' : 'Docker'})`,
        description: `Auto-generated for ${subApps.filter((s) => s.enabled).length} sub-apps`,
        content: generatedConfig,
      });
      message.success('已保存为模板');
    } catch {
      /* interceptor */
    }
  };

  /* ---- table columns ---- */
  const columns: ColumnsType<SubApp> = [
    {
      title: '路由路径',
      dataIndex: 'routePath',
      render: (_, record) => (
        <Input
          size="small"
          value={record.routePath}
          onChange={(e) => updateField(record.id, 'routePath', e.target.value)}
          placeholder="/app-name"
        />
      ),
    },
    {
      title: '部署目录',
      dataIndex: 'deployDir',
      render: (_, record) => (
        <Input
          size="small"
          value={record.deployDir}
          onChange={(e) => updateField(record.id, 'deployDir', e.target.value)}
          placeholder="app-name"
        />
      ),
    },
    {
      title: '项目名',
      dataIndex: 'projectName',
      render: (_, record) => (
        <Input
          size="small"
          value={record.projectName}
          onChange={(e) => updateField(record.id, 'projectName', e.target.value)}
          placeholder="my-project"
        />
      ),
    },
    {
      title: (
        <span className="flex items-center gap-xs">
          启用
          <Switch
            size="small"
            checked={allEnabled}
            onChange={toggleAll}
            className="ml-xs"
          />
        </span>
      ),
      dataIndex: 'enabled',
      width: 80,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.enabled}
          onChange={(checked) => updateField(record.id, 'enabled', checked)}
        />
      ),
    },
    {
      title: '操作',
      width: 60,
      render: (_, record) => (
        <button
          onClick={() => removeRow(record.id)}
          className="text-on-surface-variant hover:text-error transition-colors p-xs rounded hover:bg-surface-container-highest"
          title="删除"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      ),
    },
  ];

  /* ────────────────────────── Render ────────────────────────── */

  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant overflow-hidden relative">
      {/* top gradient bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

      <div className="px-md pt-lg pb-md">
        {/* header */}
        <div className="flex items-center gap-sm mb-lg">
          <span className="material-symbols-outlined text-primary text-[22px]">dashboard_customize</span>
          <h3 className="text-on-surface font-body-lg font-semibold">Micro-Frontend Nginx Generator</h3>
        </div>

        {/* ── Sub-app table ── */}
        <Table<SubApp>
          rowKey="id"
          columns={columns}
          dataSource={subApps}
          loading={loading}
          pagination={false}
          size="small"
          className="mb-md"
        />

        <div className="flex items-center justify-between mb-lg">
          <button
            onClick={addRow}
            className="bg-surface-container-highest hover:bg-surface-variant border border-outline-variant text-on-surface text-[12px] px-sm py-xs rounded-md transition-colors flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            添加子应用
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-container hover:bg-primary-container/80 text-on-primary-container px-md py-xs rounded-md transition-colors text-[13px] font-medium disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>

        {/* divider */}
        <div className="border-t border-outline-variant my-md" />

        {/* ── Config Generator ── */}
        <div className="flex items-center gap-sm mb-md">
          <span className="material-symbols-outlined text-secondary text-[20px]">settings_suggest</span>
          <h4 className="text-on-surface font-body-md font-semibold">配置生成器</h4>
        </div>

        {/* mode selector */}
        <div className="mb-md">
          <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">部署模式</label>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio.Button value="standard">标准服务器</Radio.Button>
            <Radio.Button value="docker">Docker</Radio.Button>
          </Radio.Group>
        </div>

        {/* options form */}
        {mode === 'standard' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-md">
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">baseDir</label>
              <Input
                size="small"
                value={standardOptions.baseDir}
                onChange={(e) => setStandardOptions((p) => ({ ...p, baseDir: e.target.value }))}
                className="font-label-mono!"
              />
            </div>
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">listenPort</label>
              <InputNumber
                size="small"
                value={standardOptions.listenPort}
                onChange={(v) => setStandardOptions((p) => ({ ...p, listenPort: v ?? 80 }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">apiProxyTarget</label>
              <Input
                size="small"
                value={standardOptions.apiProxyTarget}
                onChange={(e) => setStandardOptions((p) => ({ ...p, apiProxyTarget: e.target.value }))}
                className="font-label-mono!"
              />
            </div>
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">sidebarDomain</label>
              <Input
                size="small"
                value={standardOptions.sidebarDomain}
                onChange={(e) => setStandardOptions((p) => ({ ...p, sidebarDomain: e.target.value }))}
                placeholder="可选"
                className="font-label-mono!"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-md">
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">listenPort</label>
              <InputNumber
                size="small"
                value={dockerOptions.listenPort}
                onChange={(v) => setDockerOptions((p) => ({ ...p, listenPort: v ?? 8080 }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">apiServerUrl</label>
              <Input
                size="small"
                value={dockerOptions.apiServerUrl}
                onChange={(e) => setDockerOptions((p) => ({ ...p, apiServerUrl: e.target.value }))}
                className="font-label-mono!"
              />
            </div>
          </div>
        )}

        {/* generate button */}
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-secondary-container hover:bg-secondary-container/80 text-on-secondary-container px-md py-xs rounded-md transition-colors text-[13px] font-medium disabled:opacity-50 flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[16px]">code</span>
            {generating ? '生成中…' : '生成配置'}
          </button>
        </div>
      </div>

      {/* ── Preview Modal ── */}
      <Modal
        open={previewVisible}
        title="Nginx 配置预览"
        onCancel={() => setPreviewVisible(false)}
        footer={
          <div className="flex justify-end gap-sm">
            <button
              onClick={handleCopy}
              className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px]"
            >
              复制到剪贴板
            </button>
            <button
              onClick={handleDownload}
              className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px]"
            >
              下载
            </button>
            <button
              onClick={handleSaveAsTemplate}
              className="bg-primary-container hover:bg-primary-container/80 text-on-primary-container px-md py-xs rounded-md transition-colors text-[13px] font-medium"
            >
              保存为模板
            </button>
          </div>
        }
        width={720}
        destroyOnClose
      >
        <Input.TextArea
          readOnly
          value={generatedConfig ?? ''}
          rows={20}
          className="font-code-block! mt-md"
        />
      </Modal>
    </div>
  );
}
