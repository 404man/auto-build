# Frontend Workstation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the auto-dist client UI into a light Ant Design–themed workstation with a fixed left config sidebar and a right build/log main pane.

**Architecture:** Keep React + Ant Design and `useBuild`/API unchanged. Introduce a small theme module + workstation CSS shell, then restructure `App.tsx` into header + sidebar + main. Thread a `disabled`/`configLocked` flag into pickers while a batch build is in progress. Adapt `BuildPanel`/`LogViewer` for preview list, empty state, and flex-fill light log pane.

**Tech Stack:** React 19, Ant Design 5 (`ConfigProvider` tokens), Vite, existing Socket/`useBuild` hook

**Spec:** `docs/superpowers/specs/2026-07-13-frontend-workstation-redesign-design.md`

---

## File map

| File | Responsibility |
|---|---|
| Create: `packages/client/src/theme.ts` | Ant Design theme token object + shared layout constants |
| Create: `packages/client/src/styles/workstation.css` | Full-height shell, sidebar/main grid, responsive stack |
| Modify: `packages/client/src/main.tsx` | Import workstation CSS |
| Modify: `packages/client/src/App.tsx` | Header + left/right layout, status summary, empty state, lock wiring |
| Modify: `packages/client/src/components/DirectoryPicker.tsx` | Accept `disabled`; compact for sidebar |
| Modify: `packages/client/src/components/BranchSelector.tsx` | Accept `disabled` |
| Modify: `packages/client/src/components/BuildPanel.tsx` | Preview projects before start; drop unused branch line |
| Modify: `packages/client/src/components/LogViewer.tsx` | Light terminal colors; flex height (`height: 100%`) |

**Out of scope:** `useBuild.ts`, `api/`, server packages, new business features.

**Verification approach:** No client test runner exists. Each task ends with manual/dev-server checks against the spec acceptance criteria. Do not add a test framework for this UI-only redesign.

---

### Task 1: Theme tokens + workstation CSS shell

**Files:**
- Create: `packages/client/src/theme.ts`
- Create: `packages/client/src/styles/workstation.css`
- Modify: `packages/client/src/main.tsx`

- [ ] **Step 1: Add theme module**

Create `packages/client/src/theme.ts`:

```ts
import type { ThemeConfig } from 'antd';

export const SIDEBAR_WIDTH = 320;
export const BREAKPOINT_STACK = 1100;

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    colorBgLayout: '#f7f8fa',
    colorBorder: '#e8e8e8',
    fontSize: 14,
    controlHeight: 36,
  },
  components: {
    Card: {
      boxShadow: 'none',
      boxShadowTertiary: 'none',
    },
    Layout: {
      headerBg: '#ffffff',
      bodyBg: '#f7f8fa',
      siderBg: '#ffffff',
    },
  },
};
```

- [ ] **Step 2: Add workstation CSS**

Create `packages/client/src/styles/workstation.css`:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}

.ws-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
}

.ws-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}

.ws-header-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ws-header-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #262626;
  line-height: 1.3;
}

.ws-header-title span {
  font-size: 12px;
  color: #8c8c8c;
}

.ws-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px 1fr;
}

.ws-sidebar {
  min-height: 0;
  overflow: auto;
  background: #fff;
  border-right: 1px solid #e8e8e8;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ws-sidebar-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #595959;
}

.ws-main {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
}

.ws-main-top {
  flex: 0 0 auto;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 16px;
}

.ws-main-log {
  flex: 1;
  min-height: 0;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.ws-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  color: #8c8c8c;
}

.ws-empty .anticon {
  font-size: 36px;
  color: #bfbfbf;
}

@media (max-width: 1099px) {
  .ws-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .ws-sidebar {
    border-right: none;
    border-bottom: 1px solid #e8e8e8;
    max-height: 40vh;
  }
}
```

- [ ] **Step 3: Import CSS in `main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/workstation.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/theme.ts packages/client/src/styles/workstation.css packages/client/src/main.tsx
git commit -m "feat(client): add workstation theme and layout CSS"
```

---

### Task 2: DirectoryPicker + BranchSelector support `disabled`

**Files:**
- Modify: `packages/client/src/components/DirectoryPicker.tsx`
- Modify: `packages/client/src/components/BranchSelector.tsx`

- [ ] **Step 1: Add `disabled` to DirectoryPicker**

Update props and wire `disabled` onto Input / Buttons / Select / Modal confirm:

```tsx
interface DirectoryPickerProps {
  onProjectSelect: (projects: Array<{ name: string; path: string }>) => void;
  disabled?: boolean;
}

export default function DirectoryPicker({ onProjectSelect, disabled = false }: DirectoryPickerProps) {
  // ...existing state...

  return (
    <div>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder="输入父目录路径，如 /Users/you/workspace"
          value={parentPath}
          onChange={(e) => setParentPath(e.target.value)}
          prefix={<FolderOutlined />}
          onPressEnter={handleScan}
          disabled={disabled}
        />
        <Button icon={<FolderOpenOutlined />} onClick={handleBrowse} disabled={disabled}>
          浏览
        </Button>
        <Button type="primary" icon={<SearchOutlined />} loading={scanning} onClick={handleScan} disabled={disabled}>
          扫描
        </Button>
      </Space.Compact>

      {projects.length > 0 && (
        <Select
          mode="multiple"
          placeholder="选择项目（可多选）"
          style={{ width: '100%' }}
          value={selectedPaths}
          onChange={handleSelect}
          disabled={disabled}
          options={projects.map((p) => ({
            value: p.path,
            label: (
              <span>
                {p.name}
                {p.isGitRepo && (
                  <Tag color="green" style={{ marginLeft: 8 }}>
                    Git
                  </Tag>
                )}
              </span>
            ),
          }))}
        />
      )}

      {/* Modal unchanged except: do not open browse when disabled — guard handleBrowse */}
    </div>
  );
}
```

Also guard browse open:

```tsx
const handleBrowse = () => {
  if (disabled) return;
  const initial = parentPath || '/';
  setBrowseOpen(true);
  loadDirs(initial);
};
```

- [ ] **Step 2: Add `disabled` to BranchSelector**

```tsx
interface BranchSelectorProps {
  projectPath: string;
  onBranchSelect: (branch: string) => void;
  disabled?: boolean;
}

export default function BranchSelector({ projectPath, onBranchSelect, disabled = false }: BranchSelectorProps) {
  // ...existing logic...

  return (
    <div>
      <div style={{ marginBottom: 8, color: '#666' }}>
        当前分支：<Tag color="blue">{current || '-'}</Tag>
      </div>
      <Select
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
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/DirectoryPicker.tsx packages/client/src/components/BranchSelector.tsx
git commit -m "feat(client): allow locking config controls while building"
```

---

### Task 3: BuildPanel preview list + LogViewer light flex pane

**Files:**
- Modify: `packages/client/src/components/BuildPanel.tsx`
- Modify: `packages/client/src/components/LogViewer.tsx`

- [ ] **Step 1: Update BuildPanel props for preview projects**

Replace the unused `branch` display with optional preview projects used before batch starts:

```tsx
interface PreviewProject {
  name: string;
  path: string;
  branch: string;
}

interface BuildPanelProps {
  previewProjects: PreviewProject[];
  isBatch: boolean;
  batchProjects: ProjectBuildState[];
  currentProjectIndex: number;
  totalProjects: number;
  batchComplete: boolean;
  error: string;
  onStart: () => void;
  onCancel: () => void;
  onDownloadProject: (buildId: string) => void;
  onDownloadAll: () => void;
}
```

Render logic:

```tsx
const isRunning = batchProjects.some((p) => p.status === 'building');
const completedCount = batchProjects.filter((p) => p.status === 'completed').length;
const hasCompletedProjects = completedCount > 0;
const listSource =
  batchProjects.length > 0
    ? batchProjects
    : previewProjects.map((p) => ({
        name: p.name,
        path: p.path,
        status: 'pending' as const,
        buildId: '',
        branch: p.branch,
      }));

// In render:
// - Progress text only when batchProjects.length > 0
// - For preview rows, show Tag with branch instead of batch status when batchProjects empty
// - Keep existing actions (open folder / download) for real batch items only
```

Keep `batchStatusConfig` and action buttons as today. Remove the old `分支：{branch}` line.

When `batchProjects.length === 0`, each list item title shows `name` + `Tag` with `branch`; description shows `path`; no download actions.

- [ ] **Step 2: Restyle LogViewer for light flex fill**

```tsx
export default function LogViewer({ logs, onClear, currentProjectName }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {currentProjectName && (
        <div style={{ marginBottom: 8, color: '#1677ff', fontWeight: 500 }}>
          当前构建：{currentProjectName}
        </div>
      )}
      <div style={{ position: 'absolute', top: currentProjectName ? 0 : 0, right: 0, zIndex: 1 }}>
        <Button size="small" icon={<DeleteOutlined />} onClick={onClear} disabled={logs.length === 0}>
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
          overflowY: 'auto',
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          marginTop: currentProjectName ? 28 : 28,
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/BuildPanel.tsx packages/client/src/components/LogViewer.tsx
git commit -m "feat(client): adapt build panel preview and light log viewer"
```

---

### Task 4: Rebuild `App.tsx` as workstation shell

**Files:**
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Replace App layout**

Rewrite `App.tsx` to use the workstation shell (keep existing project/branch state and `useBuild` wiring):

```tsx
import { useState, useCallback, useMemo } from 'react';
import { ConfigProvider, Typography, Button, Tag, Empty, Space } from 'antd';
import { SwapOutlined, RocketOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import DirectoryPicker from './components/DirectoryPicker';
import BranchSelector from './components/BranchSelector';
import BuildPanel from './components/BuildPanel';
import LogViewer from './components/LogViewer';
import { useBuild } from './hooks/useBuild';
import { appTheme } from './theme';

const { Text } = Typography;

interface SelectedProject {
  name: string;
  path: string;
}

function App() {
  const [projects, setProjects] = useState<SelectedProject[]>([]);
  const [projectBranches, setProjectBranches] = useState<Record<string, string>>({});
  const build = useBuild();

  const handleProjectSelect = useCallback((selected: SelectedProject[]) => {
    setProjects(selected);
    setProjectBranches({});
  }, []);

  const handleBranchSelect = useCallback((projectPath: string, branch: string) => {
    setProjectBranches((prev) => ({ ...prev, [projectPath]: branch }));
  }, []);

  const handleChangeProject = useCallback(() => {
    setProjects([]);
    setProjectBranches({});
    build.clearLogs();
  }, [build]);

  const allBranchesSelected = projects.length > 0 && projects.every((p) => !!projectBranches[p.path]);

  const configLocked = build.batchProjects.length > 0 && !build.batchComplete;

  const currentProjectName = useMemo(() => {
    if (build.isBatch && build.batchProjects.length > 0) {
      return build.batchProjects[build.currentProjectIndex]?.name || '';
    }
    return '';
  }, [build.isBatch, build.batchProjects, build.currentProjectIndex]);

  const headerStatus = useMemo(() => {
    if (configLocked) {
      return `构建中 · ${build.currentProjectIndex + 1}/${build.totalProjects || projects.length}`;
    }
    if (build.batchComplete && build.batchProjects.length > 0) {
      const ok = build.batchProjects.filter((p) => p.status === 'completed').length;
      const fail = build.batchProjects.filter((p) => p.status === 'failed').length;
      return `已完成 · 成功 ${ok} · 失败 ${fail}`;
    }
    return '未开始';
  }, [configLocked, build.batchComplete, build.batchProjects, build.currentProjectIndex, build.totalProjects, projects.length]);

  const previewProjects = useMemo(
    () =>
      projects.map((p) => ({
        name: p.name,
        path: p.path,
        branch: projectBranches[p.path],
      })),
    [projects, projectBranches],
  );

  const handleStartBuild = useCallback(() => {
    build.startBatchBuild(
      projects.map((p) => ({
        name: p.name,
        path: p.path,
        branch: projectBranches[p.path],
      })),
    );
  }, [projects, projectBranches, build]);

  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <div className="ws-root">
        <header className="ws-header">
          <div className="ws-header-title">
            <h1>auto-dist</h1>
            <span>前端产物本地构建平台</span>
          </div>
          <Tag color={configLocked ? 'processing' : build.batchComplete ? 'success' : 'default'}>
            {headerStatus}
          </Tag>
        </header>

        <div className="ws-body">
          <aside className="ws-sidebar">
            <div>
              <p className="ws-sidebar-section-title">1. 选择项目目录</p>
              <DirectoryPicker onProjectSelect={handleProjectSelect} disabled={configLocked} />
            </div>

            {projects.length > 0 && (
              <div>
                <p className="ws-sidebar-section-title">2. 为每个项目选择分支</p>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {projects.map((project) => (
                    <div key={project.path}>
                      <Tag color="blue" style={{ marginBottom: 8 }}>
                        {project.name}
                      </Tag>
                      <BranchSelector
                        projectPath={project.path}
                        onBranchSelect={(b) => handleBranchSelect(project.path, b)}
                        disabled={configLocked}
                      />
                    </div>
                  ))}
                </Space>
              </div>
            )}

            {projects.length > 0 && (
              <Button icon={<SwapOutlined />} onClick={handleChangeProject} disabled={configLocked} block>
                更换项目
              </Button>
            )}
          </aside>

          <main className="ws-main">
            {!allBranchesSelected ? (
              <div className="ws-empty">
                <RocketOutlined />
                <Text>请在左侧完成项目与分支选择</Text>
              </div>
            ) : (
              <>
                <div className="ws-main-top">
                  <BuildPanel
                    previewProjects={previewProjects}
                    isBatch={true}
                    batchProjects={build.batchProjects}
                    currentProjectIndex={build.currentProjectIndex}
                    totalProjects={build.totalProjects}
                    batchComplete={build.batchComplete}
                    error={build.error}
                    onStart={handleStartBuild}
                    onCancel={build.cancelBuild}
                    onDownloadProject={build.downloadProject}
                    onDownloadAll={build.downloadAll}
                  />
                </div>
                <div className="ws-main-log">
                  <LogViewer
                    logs={build.logs}
                    onClear={build.clearLogs}
                    currentProjectName={currentProjectName}
                  />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default App;
```

Notes for the implementer:
- Remove unused `Empty` import if unused (use RocketOutlined empty state instead).
- `handleChangeProject` depends on `build.clearLogs`; if eslint warns about unstable `build` object, call `build.clearLogs` via destructure: `const { clearLogs, ... } = build` and depend on `clearLogs`.
- Do **not** keep Ant Design `Steps` / single centered `Card`.

- [ ] **Step 2: Run client and smoke-check layout**

```bash
pnpm --filter @auto-dist/client dev
```

Expected:
- Full-height page with header + left sidebar + right pane
- Empty state until projects+branches selected
- At ≤1099px width, sidebar stacks above main

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "feat(client): rebuild App as light workstation layout"
```

---

### Task 5: End-to-end acceptance pass

**Files:** none required unless bugs found

- [ ] **Step 1: Manual acceptance against spec**

With `pnpm dev` (root) or client+server running:

1. Scan a parent directory → multi-select projects → pick branches → right pane becomes buildable with preview list.
2. Start batch build → left controls disabled (`configLocked`).
3. Logs fill the bottom pane, auto-scroll, light colors; stderr red; project name prefix blue.
4. On complete, header shows `已完成 · 成功 n · 失败 m`; download / reopen folder still work.
5. After complete, left unlocks;「更换项目」clears selection, clears logs, returns to empty state.
6. Narrow the window below 1100px → stacked layout.

Checklist (from spec):

- [ ] 扫目录 → 多选 → 选分支 → 构建 → 日志 → 下载
- [ ] 构建中无法改左侧配置
- [ ] 未选满分支时右侧空状态
- [ ] 浅色工作台，无旧 Steps 卡片流
- [ ] 日志区 flex 占满剩余高度并自动滚动

- [ ] **Step 2: Fix any gaps found, then final commit if needed**

```bash
git add packages/client
git commit -m "fix(client): polish workstation acceptance gaps"
```

(Skip empty commit if nothing to fix.)

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Left config / right build+log | Task 4 |
| Light workstation theme tokens/colors | Task 1, Task 3 |
| Remove forced Steps | Task 4 |
| Lock config while building | Task 2 + Task 4 `configLocked` |
| Empty state before branches ready | Task 4 |
| Header status summary | Task 4 |
| Preview projects before start | Task 3 |
| Light log pane flex fill | Task 3 + CSS `ws-main-log` |
| Responsive stack ≤1099px | Task 1 CSS |
| Keep useBuild/API | All tasks (no hook/API edits) |

No placeholders remaining. Types: `PreviewProject`, `configLocked`, `appTheme`, CSS class names are consistent across tasks.
