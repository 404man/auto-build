import { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Select, App, Spin } from 'antd';
import { settingsApi } from '../api';
import type { TemplateListItem, StoredTemplate, RegistrySettings, OssSettings } from '../types/buildConfig';
import MicroAppManager from './MicroAppManager';

/* ────────────────────────── Constants ────────────────────────── */

const ICON_COLORS = ['text-secondary', 'text-primary', 'text-tertiary'] as const;
const AUTH_METHODS = [
  { label: 'Access Token', value: 'token' },
  { label: 'Password', value: 'password' },
  { label: 'AWS ECR IAM', value: 'aws_ecr' },
];

type TemplateType = 'dockerfile' | 'nginx';

/* ────────────────────────── TemplateEditorModal ────────────────────────── */

interface TemplateEditorModalProps {
  open: boolean;
  type: TemplateType;
  editingKey: string | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

function TemplateEditorModal({ open, type, editingKey, onClose, onSaved }: TemplateEditorModalProps) {
  const { message } = App.useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingKey) {
      setLoading(true);
      const fetchDetail = type === 'dockerfile'
        ? settingsApi.getDockerfileTemplate(editingKey)
        : settingsApi.getNginxConfig(editingKey);
      fetchDetail
        .then((res) => {
          const d: StoredTemplate = res.data.data;
          setName(d.name); setDescription(d.description); setContent(d.content); setKey(d.key);
        })
        .catch(() => message.error('加载模板详情失败'))
        .finally(() => setLoading(false));
    } else {
      setName(''); setDescription(''); setContent(''); setKey('');
    }
  }, [open, editingKey, type]);

  const handleSave = async () => {
    if (!name.trim()) return message.warning('请填写名称');
    if (!editingKey && !key.trim()) return message.warning('请填写 Key');
    if (!content.trim()) return message.warning('请填写内容');
    setSaving(true);
    try {
      const payload = { name, description, content };
      if (editingKey) {
        if (type === 'dockerfile') {
          await settingsApi.updateDockerfileTemplate(editingKey, payload);
        } else {
          await settingsApi.updateNginxConfig(editingKey, payload);
        }
        message.success('模板已更新');
      } else {
        const createPayload = { key: key.trim(), ...payload };
        if (type === 'dockerfile') {
          await settingsApi.createDockerfileTemplate(createPayload);
        } else {
          await settingsApi.createNginxConfig(createPayload);
        }
        message.success('模板已创建');
      }
      onSaved();
      onClose();
    } catch { /* interceptor handles error */ } finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      title={editingKey ? '编辑模板' : '新建模板'}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      width={640}
    >
      <Spin spinning={loading}>
        <div className="flex flex-col gap-md pt-md">
          {!editingKey && (
            <div>
              <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Key</label>
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="唯一标识，如 node-react" />
            </div>
          )}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">名称</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="模板名称" />
          </div>
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">描述</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简短描述" />
          </div>
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">内容</label>
            <Input.TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="font-code-block!"
              placeholder="模板内容..."
            />
          </div>
        </div>
      </Spin>
    </Modal>
  );
}

/* ────────────────────────── TemplateCard ────────────────────────── */

interface TemplateCardProps {
  type: TemplateType;
  title: string;
  subtitle: string;
  iconName: string;
}

function TemplateCard({ type, title, subtitle, iconName }: TemplateCardProps) {
  const { message } = App.useApp();
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    const fetchList = type === 'dockerfile'
      ? settingsApi.listDockerfileTemplates()
      : settingsApi.listNginxConfigs();
    fetchList
      .then((res) => setItems(res.data.data))
      .catch(() => message.error(`加载${title}失败`))
      .finally(() => setLoading(false));
  }, [type, title]);

  useEffect(() => { reload(); }, [reload]);

  const openCreate = () => { setEditingKey(null); setModalOpen(true); };
  const openEdit = (key: string) => { setEditingKey(key); setModalOpen(true); };

  const handleDownload = async (item: TemplateListItem) => {
    try {
      const res = type === 'dockerfile'
        ? await settingsApi.getDockerfileTemplate(item.key)
        : await settingsApi.getNginxConfig(item.key);
      const template: StoredTemplate = res.data.data;

      let filename: string;
      if (type === 'dockerfile') {
        filename = template.name || 'Dockerfile';
      } else {
        filename = (template.name || 'nginx') + '.conf';
      }

      const blob = new Blob([template.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('模板已下载');
    } catch {
      message.error('下载失败');
    }
  };

  const handleDelete = (item: TemplateListItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确认删除模板 "${item.name}" 吗？此操作不可撤销。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (type === 'dockerfile') {
          await settingsApi.deleteDockerfileTemplate(item.key);
        } else {
          await settingsApi.deleteNginxConfig(item.key);
        }
        message.success('已删除');
        reload();
      },
    });
  };

  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant overflow-hidden">
      {/* header */}
      <div className="bg-surface-container-low border-b border-outline-variant px-md py-sm flex items-center justify-between">
        <div>
          <h3 className="text-on-surface font-body-lg font-semibold">{title}</h3>
          <p className="text-on-surface-variant text-[11px] mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-surface-container-highest hover:bg-surface-variant border border-outline-variant text-on-surface text-[12px] px-sm py-xs rounded-md transition-colors flex items-center gap-xs"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Add New
        </button>
      </div>

      {/* list */}
      <div className="divide-y divide-outline-variant">
        {loading ? (
          <div className="py-lg text-center text-on-surface-variant text-[13px]">加载中…</div>
        ) : items.length === 0 ? (
          <div className="py-lg text-center text-on-surface-variant text-[13px]">暂无模板</div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.key}
              className="group flex items-center gap-sm px-md py-sm hover:bg-surface-container-high transition-colors"
            >
              <span className={`material-symbols-outlined text-[20px] ${ICON_COLORS[idx % ICON_COLORS.length]}`}>
                {iconName}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-on-surface font-medium text-[13px] truncate">{item.name}</div>
                <div className="text-on-surface-variant text-[11px] font-label-mono truncate">{item.description}</div>
              </div>
              <button
                onClick={() => openEdit(item.key)}
                className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-all p-xs rounded hover:bg-surface-container-highest"
                title="编辑"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
              <button
                onClick={() => handleDownload(item)}
                className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-all p-xs rounded hover:bg-surface-container-highest"
                title="下载"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
              </button>
              <button
                onClick={() => handleDelete(item)}
                className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all p-xs rounded hover:bg-surface-container-highest"
                title="删除"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          ))
        )}
      </div>

      <TemplateEditorModal
        open={modalOpen}
        type={type}
        editingKey={editingKey}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />
    </div>
  );
}

/* ────────────────────────── RegistryForm ────────────────────────── */

function RegistryForm() {
  const { message } = App.useApp();
  const [form, setForm] = useState<RegistrySettings>({ url: '', authMethod: 'token', username: '' });
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.getRegistry()
      .then((res) => {
        const d = res.data.data;
        if (!d) return; // Registry 未配置，保持空表单
        setForm({ url: d.url || '', authMethod: d.authMethod || 'token', username: d.username || '' });
      })
      .catch(() => message.error('加载 Registry 配置失败'))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof RegistrySettings>(key: K, val: RegistrySettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.url.trim()) return message.warning('请填写 Registry URL');
    setSaving(true);
    try {
      const payload: RegistrySettings = { ...form };
      if (secret.trim()) payload.secret = secret.trim();
      await settingsApi.updateRegistry(payload);
      message.success('Registry 配置已保存');
      setSecret('');
    } catch { /* interceptor */ } finally { setSaving(false); }
  };

  const handleCancel = () => {
    settingsApi.getRegistry()
      .then((res) => {
        const d = res.data.data;
        if (!d) return;
        setForm({ url: d.url || '', authMethod: d.authMethod || 'token', username: d.username || '' });
        setSecret('');
      })
      .catch(() => message.error('重置失败'));
  };

  if (loading) {
    return (
      <div className="bg-surface-container rounded-lg border border-outline-variant p-lg text-center">
        <Spin /> <span className="text-on-surface-variant text-[13px] ml-sm">加载中…</span>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant overflow-hidden relative">
      {/* top gradient bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

      <div className="px-md pt-lg pb-md">
        {/* header */}
        <div className="flex items-center gap-sm mb-lg">
          <span className="material-symbols-outlined text-primary text-[22px]">cloud_upload</span>
          <h3 className="text-on-surface font-body-lg font-semibold">Docker Registry Configuration</h3>
        </div>

        <div className="flex flex-col gap-md">
          {/* URL */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Default Registry URL</label>
            <Input
              value={form.url}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://registry.example.com"
              className="font-label-mono!"
            />
          </div>

          {/* Auth method */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Authentication Method</label>
            <Select
              value={form.authMethod}
              onChange={(val) => update('authMethod', val)}
              options={AUTH_METHODS}
              className="w-full"
            />
          </div>

          {/* Username */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">
              {form.authMethod === 'aws_ecr' ? 'Access Key' : 'Username'}
            </label>
            <Input
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              placeholder={form.authMethod === 'aws_ecr' ? 'AKIAIOSFODNN7EXAMPLE' : 'username'}
            />
          </div>

          {/* Secret / Token */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">
              {form.authMethod === 'token' ? 'Token' : 'Secret'}
            </label>
            <div className="relative">
              <Input.Password
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••"
                visibilityToggle={{ visible: showSecret, onVisibleChange: setShowSecret }}
                iconRender={(visible) => (
                  <span className="material-symbols-outlined text-[16px] cursor-pointer text-on-surface-variant">
                    {visible ? 'visibility_off' : 'visibility'}
                  </span>
                )}
              />
            </div>
            <p className="text-on-surface-variant text-[11px] mt-xs flex items-center gap-xs">
              <span className="material-symbols-outlined text-[12px]">lock</span>
              Stored securely in local keychain.
            </p>
          </div>
        </div>

        {/* action buttons */}
        <div className="flex justify-end gap-sm mt-lg pt-md border-t border-outline-variant">
          <button
            onClick={handleCancel}
            className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-container hover:bg-primary-container/80 text-on-primary-container px-md py-xs rounded-md transition-colors text-[13px] font-medium disabled:opacity-50"
          >
            {saving ? '保存中…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── OssForm ────────────────────────── */

function OssForm() {
  const { message } = App.useApp();
  const [form, setForm] = useState<OssSettings>({
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    region: '',
    endpoint: '',
    prefix: 'auto-build/templates/',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingTo, setSyncingTo] = useState(false);
  const [syncingFrom, setSyncingFrom] = useState(false);

  useEffect(() => {
    settingsApi.getOss()
      .then((res) => {
        const d = res.data.data;
        if (!d) return; // OSS 未配置，保持空表单
        setForm({
          accessKeyId: d.accessKeyId || '',
          accessKeySecret: d.accessKeySecret || '',
          bucket: d.bucket || '',
          region: d.region || '',
          endpoint: d.endpoint || '',
          prefix: d.prefix || 'auto-build/templates/',
        });
      })
      .catch(() => message.error('加载 OSS 配置失败'))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof OssSettings>(key: K, val: OssSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const reload = () => {
    settingsApi.getOss()
      .then((res) => {
        const d = res.data.data;
        if (!d) return;
        setForm({
          accessKeyId: d.accessKeyId || '',
          accessKeySecret: d.accessKeySecret || '',
          bucket: d.bucket || '',
          region: d.region || '',
          endpoint: d.endpoint || '',
          prefix: d.prefix || 'auto-build/templates/',
        });
      })
      .catch(() => message.error('重新加载 OSS 配置失败'));
  };

  const handleSave = async () => {
    if (!form.region.trim()) return message.warning('请填写 Region');
    if (!form.bucket.trim()) return message.warning('请填写 Bucket');
    if (!form.accessKeyId.trim()) return message.warning('请填写 AccessKey ID');
    setSaving(true);
    try {
      const data: Partial<OssSettings> = {
        region: form.region.trim(),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        endpoint: form.endpoint?.trim() || undefined,
        prefix: form.prefix?.trim() || undefined,
      };
      // 仅在用户输入新值时发送 secret
      if (form.accessKeySecret && form.accessKeySecret !== '***') {
        data.accessKeySecret = form.accessKeySecret;
      }
      await settingsApi.updateOss(data);
      message.success('OSS 配置已保存');
      reload();
    } catch { /* interceptor */ } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await settingsApi.testOss();
      const { connected, message: ossMsg } = res.data.data;
      if (connected) {
        message.success(ossMsg || '连接成功');
      } else {
        message.error(ossMsg || '连接失败');
      }
    } catch { /* interceptor */ } finally { setTesting(false); }
  };

  const handleSyncTo = async () => {
    setSyncingTo(true);
    try {
      const res = await settingsApi.syncToOss();
      message.success(res.data.data.message || '推送成功');
    } catch { /* interceptor */ } finally { setSyncingTo(false); }
  };

  const handleSyncFrom = async () => {
    setSyncingFrom(true);
    try {
      const res = await settingsApi.syncFromOss();
      message.success(res.data.data.message || '拉取成功');
    } catch { /* interceptor */ } finally { setSyncingFrom(false); }
  };

  if (loading) {
    return (
      <div className="bg-surface-container rounded-lg border border-outline-variant p-lg text-center">
        <Spin /> <span className="text-on-surface-variant text-[13px] ml-sm">加载中…</span>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant overflow-hidden relative">
      {/* top gradient bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

      <div className="px-md pt-lg pb-md">
        {/* header */}
        <div className="flex items-center gap-sm mb-lg">
          <span className="material-symbols-outlined text-primary text-[22px]">cloud_sync</span>
          <h3 className="text-on-surface font-body-lg font-semibold">OSS Configuration</h3>
        </div>

        <div className="flex flex-col gap-md">
          {/* Region */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">
              Region <span className="text-error">*</span>
            </label>
            <Input
              value={form.region}
              onChange={(e) => update('region', e.target.value)}
              placeholder="oss-cn-hangzhou"
              className="font-label-mono!"
            />
          </div>

          {/* Bucket */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">
              Bucket <span className="text-error">*</span>
            </label>
            <Input
              value={form.bucket}
              onChange={(e) => update('bucket', e.target.value)}
              placeholder="my-bucket"
              className="font-label-mono!"
            />
          </div>

          {/* AccessKey ID */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">
              AccessKey ID <span className="text-error">*</span>
            </label>
            <Input
              value={form.accessKeyId}
              onChange={(e) => update('accessKeyId', e.target.value)}
              placeholder="LTAI5t..."
              className="font-label-mono!"
            />
          </div>

          {/* AccessKey Secret */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">AccessKey Secret</label>
            <Input.Password
              value={form.accessKeySecret}
              onChange={(e) => update('accessKeySecret', e.target.value)}
              placeholder="***"
              iconRender={(visible) => (
                <span className="material-symbols-outlined text-[16px] cursor-pointer text-on-surface-variant">
                  {visible ? 'visibility_off' : 'visibility'}
                </span>
              )}
            />
            <p className="text-on-surface-variant text-[11px] mt-xs flex items-center gap-xs">
              <span className="material-symbols-outlined text-[12px]">lock</span>
              Leave blank to keep existing secret unchanged.
            </p>
          </div>

          {/* Endpoint */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Endpoint <span className="text-on-surface-variant text-[11px]">(optional)</span></label>
            <Input
              value={form.endpoint}
              onChange={(e) => update('endpoint', e.target.value)}
              placeholder="oss-cn-hangzhou.aliyuncs.com"
              className="font-label-mono!"
            />
          </div>

          {/* Prefix */}
          <div>
            <label className="font-label-mono text-label-mono text-on-surface-variant block mb-xs">Prefix <span className="text-on-surface-variant text-[11px]">(optional)</span></label>
            <Input
              value={form.prefix}
              onChange={(e) => update('prefix', e.target.value)}
              placeholder="auto-build/templates/"
              className="font-label-mono!"
            />
          </div>
        </div>

        {/* action buttons */}
        <div className="flex flex-wrap justify-between gap-sm mt-lg pt-md border-t border-outline-variant">
          <div className="flex gap-sm">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px] disabled:opacity-50"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              onClick={handleSyncTo}
              disabled={syncingTo}
              className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px] disabled:opacity-50"
            >
              {syncingTo ? '推送中…' : '推送到 OSS'}
            </button>
            <button
              onClick={handleSyncFrom}
              disabled={syncingFrom}
              className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px] disabled:opacity-50"
            >
              {syncingFrom ? '拉取中…' : '从 OSS 拉取'}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-container hover:bg-primary-container/80 text-on-primary-container px-md py-xs rounded-md transition-colors text-[13px] font-medium disabled:opacity-50"
          >
            {saving ? '保存中…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── CacheManagement ────────────────────────── */

function CacheManagement() {
  const { message } = App.useApp();
  const [clearing, setClearing] = useState(false);

  const handleClear = () => {
    Modal.confirm({
      title: '确认清空缓存',
      content: '此操作将清空 ~/.auto-build/artifacts/ 目录下的所有构建和下载缓存文件，不可恢复。',
      okText: '确认清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setClearing(true);
        try {
          const res = await settingsApi.clearArtifacts();
          message.success(res.data.data.message || '缓存已清空');
        } catch {
          /* interceptor handles error */
        } finally {
          setClearing(false);
        }
      },
    });
  };

  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant overflow-hidden relative">
      {/* top gradient bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />

      <div className="px-md pt-lg pb-md">
        {/* header */}
        <div className="flex items-center gap-sm mb-md">
          <span className="material-symbols-outlined text-primary text-[22px]">cleaning_services</span>
          <h3 className="text-on-surface font-body-lg font-semibold">Cache Management</h3>
        </div>

        <p className="text-on-surface-variant text-[13px] mb-lg">
          清空 <code className="font-label-mono bg-surface-container-high px-xs rounded">~/.auto-build/artifacts/</code> 目录下的所有构建和下载缓存文件
        </p>

        <div className="flex justify-end pt-md border-t border-outline-variant">
          <button
            onClick={handleClear}
            disabled={clearing}
            className="px-md py-xs rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest transition-colors text-[13px] disabled:opacity-50"
          >
            {clearing ? '清理中…' : '清空缓存'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── SettingsPage (main) ────────────────────────── */

export default function SettingsPage() {
  return (
    <div className="max-w-[1280px] w-full">
      <h2 className="font-body-lg text-h1 text-on-surface font-bold mb-lg">Settings</h2>

      <div className="flex flex-col gap-lg">
        {/* Micro-Frontend Nginx Generator — full width */}
        <MicroAppManager />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
          {/* Left column — Template management */}
          <div className="flex flex-col gap-lg">
            <TemplateCard
              type="dockerfile"
              title="Dockerfile Templates"
              subtitle="Manage base images and build steps"
              iconName="description"
            />
            <TemplateCard
              type="nginx"
              title="Nginx Templates"
              subtitle="Manage reverse proxy and static file configs"
              iconName="dns"
            />
          </div>

          {/* Right column — Registry + OSS + Cache */}
          <div className="flex flex-col gap-lg">
            <RegistryForm />
            <OssForm />
            <CacheManagement />
          </div>
        </div>
      </div>
    </div>
  );
}
