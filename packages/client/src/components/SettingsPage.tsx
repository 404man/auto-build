import { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Select, message, Spin } from 'antd';
import { settingsApi } from '../api';
import type { TemplateListItem, StoredTemplate, RegistrySettings } from '../types/buildConfig';

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
              {!item.builtin && (
                <button
                  onClick={() => handleDelete(item)}
                  className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all p-xs rounded hover:bg-surface-container-highest"
                  title="删除"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              )}
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
  const [form, setForm] = useState<RegistrySettings>({ url: '', authMethod: 'token', username: '' });
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.getRegistry()
      .then((res) => {
        const d = res.data.data;
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

/* ────────────────────────── SettingsPage (main) ────────────────────────── */

export default function SettingsPage() {
  return (
    <div className="max-w-[1280px] w-full">
      <h2 className="font-body-lg text-h1 text-on-surface font-bold mb-lg">Settings</h2>

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

        {/* Right column — Registry */}
        <div>
          <RegistryForm />
        </div>
      </div>
    </div>
  );
}
