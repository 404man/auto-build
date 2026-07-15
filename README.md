# 🔧 Auto Build

> 本地构建 + 离线包下载的 DevOps 工具平台

Auto Build 是一个基于本地运行的构建平台，通过可视化界面选择项目和分支，在隔离的 git worktree 中自动完成代码拉取、依赖安装、构建打包，最终提供产物下载。支持静态资源构建和 Docker 镜像构建，同时集成了离线二方包下载能力。

## ✨ 功能特性

- **Build Center** — 多 Tab 构建工作台，每个 Tab 独立配置项目和分支，支持并行构建
- **静态资源构建** — 自动检测包管理器（npm/pnpm/yarn），支持自定义 Install/Build Command
- **Docker 镜像构建** — 内置 Dockerfile 和 Nginx 配置模板，支持推送到 Docker Registry
- **Download Package** — 离线二方包下载，从 `pnpm-lock.yaml` 中提取指定 scope 依赖并批量下载为 `.tgz`
- **Settings 管理** — Dockerfile/Nginx 模板 CRUD 管理、Docker Registry 配置、OSS 存储配置
- **构建隔离** — 基于 git worktree `--detach` 模式，构建完成自动清理，不污染工作区
- **实时日志** — 通过 Socket.IO 推送终端风格的构建日志，支持多项目并行日志隔离
- **历史缓存** — 父目录路径、Tab 配置等持久化到 localStorage，提升重复操作效率

## 🛠 技术栈

### 前端

- React 19 + Vite 6 + Tailwind CSS v4 + Ant Design 5 + Socket.IO Client

### 后端

- Koa 2 + TypeScript + Socket.IO + tsx (dev)

### 构建与存储

- git worktree (`--detach` 模式) 构建隔离
- 阿里云 OSS (ali-oss) 对象存储
- pnpm 9 workspace monorepo 包管理
- Node.js CJS 脚本离线包工具 (`npm pack` 下载)

## 📁 项目结构

```text
auto-build/
├── packages/
│   ├── client/                    # 前端应用
│   │   ├── src/
│   │   │   ├── components/        # UI 组件
│   │   │   │   ├── BuildCenter.tsx          # 构建中心（多 Tab 容器）
│   │   │   │   ├── BuildCenterTab.tsx       # 单个构建 Tab
│   │   │   │   ├── BuildConfiguration.tsx   # 构建配置面板
│   │   │   │   ├── BuildPanel.tsx           # 构建执行与状态
│   │   │   │   ├── DirectoryPicker.tsx      # 目录选择器
│   │   │   │   ├── BranchSelector.tsx       # 分支选择器
│   │   │   │   ├── LogViewer.tsx            # 终端风格日志
│   │   │   │   ├── BuildArtifacts.tsx       # 产物下载
│   │   │   │   ├── DownloadPackagePage.tsx  # 离线包下载页
│   │   │   │   └── SettingsPage.tsx         # 设置页
│   │   │   ├── hooks/             # 自定义 Hooks
│   │   │   ├── api/               # API 请求封装
│   │   │   ├── types/             # TypeScript 类型定义
│   │   │   ├── styles/            # 全局样式
│   │   │   ├── utils/             # 工具函数
│   │   │   └── theme.ts           # Ant Design 主题配置
│   │   └── package.json
│   └── server/                    # 后端服务
│       ├── src/
│       │   ├── routes/            # 路由层
│       │   │   ├── build.ts       # 构建相关 API
│       │   │   ├── directory.ts   # 目录扫描 API
│       │   │   ├── docker.ts      # Docker 构建 API
│       │   │   ├── download.ts    # 离线包下载 API
│       │   │   ├── project.ts     # 项目/Git API
│       │   │   └── settings.ts    # 设置管理 API
│       │   ├── services/          # 业务逻辑层
│       │   │   ├── buildService.ts     # 构建核心服务
│       │   │   ├── configService.ts    # 配置持久化服务
│       │   │   ├── directoryService.ts # 目录扫描服务
│       │   │   ├── dockerService.ts    # Docker 构建服务
│       │   │   ├── downloadService.ts  # 离线包下载服务
│       │   │   ├── gitService.ts       # Git 操作服务
│       │   │   └── ossService.ts       # OSS 存储服务
│       │   └── types/             # TypeScript 类型定义
│       └── package.json
├── offline-package-tool/          # 离线包下载独立工具
│   ├── download-scoped-packages.cjs
│   └── download-scoped-packages.test.cjs
├── package.json                   # monorepo 根配置
├── pnpm-workspace.yaml            # pnpm 工作区定义
└── pnpm-lock.yaml
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 24.0.0
- **pnpm** >= 9.4.0
- **Git** (用于 worktree 操作)
- **Docker** (可选，仅 Docker 镜像构建时需要)

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

前后端并行启动：

```bash
pnpm dev
```

这会同时启动：
- **前端** — `http://localhost:5173` (Vite dev server)
- **后端** — `http://localhost:3001` (Koa + Socket.IO)

### 单独启动

```bash
# 仅启动前端
pnpm --filter client dev

# 仅启动后端
pnpm --filter server dev
```

### 构建生产版本

```bash
# 构建前端
pnpm --filter client build

# 构建后端
pnpm --filter server build
pnpm --filter server start
```

## 📖 功能说明

### Build Center

构建中心是核心工作页面，采用多 Tab 布局：

1. **选择父目录** — 输入本地项目所在的父目录路径，系统自动扫描子项目（历史路径支持快速选择）
2. **选择项目** — 从扫描结果中选择一个或多个项目
3. **选择分支** — 自动读取项目的 git 分支列表
4. **配置构建** — 选择构建模式（静态资源/Docker），可自定义 Install/Build Command
5. **执行构建** — 点击 Start Build，在 git worktree 隔离环境中自动完成构建
6. **查看日志** — 终端风格实时日志，展示构建全过程
7. **下载产物** — 构建完成后提供 dist 目录 zip 包下载

每个 Tab 拥有独立的 WebSocket 连接、日志流和构建状态，支持多项目并行构建。Tab 列表持久化到 localStorage。

### Download Package

离线二方包下载功能，基于 `pnpm-lock.yaml` 提取指定 scope 的依赖并打包为 `.tgz` 文件：

- 支持批量下载多个项目的离线包
- 默认提取 `@za/*` 和 `@x-group/*` scope 下的依赖及其递归子依赖
- 下载的 `.tgz` 文件可用于离线环境的包安装和中转上传

### Settings

设置页面提供以下管理能力：

- **Dockerfile Templates** — 内置 Node.js、React+Nginx、Python Flask、Custom 模板，支持新增/编辑/删除（内置模板不可删）
- **Nginx Templates** — 内置 Standard SPA、Reverse Proxy、Custom 模板，支持 CRUD
- **Docker Registry** — 全局 Registry URL、认证方式、用户名、密钥配置
- **OSS 配置** — 阿里云 OSS 存储配置（AccessKey、Bucket、Region）
- **缓存清理** — 清理本地缓存数据

模板数据持久化到 `~/.auto-build/settings.json`。

## 🧑‍💻 开发指南

### 代码结构

- **前端路由**：采用单页面 + 侧边栏导航，`App.tsx` 管理页面切换和 Tab 状态
- **API 层**：`client/src/api/index.ts` 封装所有 HTTP 请求，`hooks/` 下封装业务逻辑
- **后端路由**：按功能模块拆分（`routes/`），每个路由对应一个 `services/` 服务
- **实时通信**：Socket.IO 按房间隔离，构建日志使用 `build:{buildId}` 房间，下载进度使用 `download:{downloadId}` 房间

### 添加新功能

1. **新增页面**：在 `client/src/components/` 中创建组件，在 `App.tsx` 的侧边栏导航中注册
2. **新增 API**：在 `server/src/routes/` 中定义路由，在 `server/src/services/` 中实现业务逻辑
3. **新增实时事件**：在 `server/src/app.ts` 的 Socket.IO 事件处理中添加新的房间/事件

### 设计规范

项目使用亮色主题，设计语言为 Developer-Centric Minimalism：

- **主色**: Electric Blue (#0054d6)，用于主要操作和焦点状态
- **成功色**: Emerald Green (#006c49)，用于构建成功状态
- **字体**: UI 使用 Inter，代码/日志使用 JetBrains Mono
- **布局**: 固定侧边栏 240px + 流式主内容区（最大 1280px）

详细设计规范参见 `packages/client/DESIGN.md`。

## ⚙️ 配置说明

### 应用配置

用户级配置持久化到 `~/.auto-build/settings.json`，包含：

- Dockerfile / Nginx 模板定义
- Docker Registry 配置
- OSS 存储配置

### 本地存储

浏览器 localStorage 缓存以下数据：

- **Parent Directory Path 历史** — 最近使用的父目录路径（最多 10 个）
- **Build Center Tab 列表** — 当前打开的 Tab 及其项目配置

### 离线包工具独立使用

`offline-package-tool/` 可作为独立工具在其他项目中使用：

```bash
# 预览将要下载的包
node offline-package-tool/download-scoped-packages.cjs --dry-run

# 执行下载
node offline-package-tool/download-scoped-packages.cjs --registry=http://your-registry/

# 自定义 scope
node offline-package-tool/download-scoped-packages.cjs --scopes=@your-scope
```
