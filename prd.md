# auto-dist — 本地构建平台

## 项目概述
一个基于本地的构建平台，用户在系统界面中选择项目和分支后，在隔离的 git worktree 中自动完成代码拉取、依赖安装、构建，最终提供产物下载。支持静态资源构建和 Docker 镜像构建，不做构建记录留存。

## 技术栈
- **前端**：React 19 + Vite 6 + Tailwind CSS v4 + Ant Design 5（暗色主题）
- **后端**：Koa 2 + Socket.IO + Node.js
- **构建隔离**：git worktree（`--detach` 模式，构建完自动清理）
- **包管理**：pnpm workspace monorepo（`packages/client` + `packages/server`）

## 构建模式

### 模式一：静态资源构建
- 构建流程：选项目 → 选分支 → git worktree 隔离 → 自动检测包管理器 → 执行 Install/Build Command → 产出 dist
- Install Command / Build Command 可自定义，留空则自动检测（npm/pnpm/yarn）
- 构建完成后提供 dist 目录 zip 下载，不做留存

### 模式二：Docker 镜像构建
- 在静态资源构建基础上，额外进行 Docker build 生成镜像
- **Dockerfile 来源优先级**：项目目录自带 Dockerfile > 用户自定义内容 > Settings 中的模板
- 内置 Dockerfile 模板：Node.js、React+Nginx、Python Flask、Custom
- 内置 Nginx 配置模板：Standard SPA、Reverse Proxy、Custom
- 模板可在 Settings 页面中管理（CRUD），用户自定义模板持久化到 `~/.auto-build/settings.json`
- 构建完成后提供镜像文件下载，勾选推送后可推送到 Docker Registry

## 项目选择机制
- 前提：所有项目放在同一个父目录下
- 用户在界面中指定父目录路径，系统扫描子目录供用户选择
- **Parent Directory Path 历史缓存**：输入过的路径保存到 localStorage（最多 10 个，去重），下次可快速选择
- 选择项目后，读取该项目的 git 分支列表供用户选择
- 分支选择为临时状态，不做缓存

## 页面架构

### 侧边栏导航
- **Build Center**：构建主页面，多 Tab 布局
- **Settings**：Dockerfile/Nginx 模板管理 + Docker Registry 全局配置

### Build Center（多 Tab）
- 每个 Tab 是一个独立的项目构建配置，拥有独立的 WebSocket 连接、日志和构建状态
- 点击侧边栏 **New Project** 按钮新增 Tab
- Tab 可关闭（至少保留一个），选择项目后 Tab 名称自动更新为项目名
- Tab 列表持久化到 localStorage

### Build Center Tab 内页面元素
1. **父目录配置**（DirectoryPicker）：输入/浏览本地路径 + 历史路径快速选择 + 扫描子项目
2. **项目选择**（必选）：从扫描结果中选择项目，可多选
3. **分支选择**（必选）：选择项目的 git 分支
4. **构建配置**（BuildConfiguration）：
   - 构建模式：静态资源 / Docker
   - Install Command / Build Command（可自定义，留空自动检测）
   - Dockerfile Template 选择 + 弹窗编辑
   - Nginx Configuration 选择 + 弹窗编辑
   - Push to Registry 开关
5. **构建执行**（BuildPanel）：Start Build 按钮 + 状态指示
6. **构建日志**（LogViewer）：终端风格实时日志
7. **产物下载**（BuildArtifacts）：zip 包下载

### Settings 页面
- **Dockerfile Templates**：模板列表（名称 + 描述），支持新增 / 编辑 / 删除（内置模板不可删）
- **Nginx Templates**：配置列表，支持新增 / 编辑 / 删除
- **Docker Registry**：全局 Registry URL、认证方式、用户名、密钥配置

## 非功能性要求
- 不存储构建记录
- 构建产物即产即下载，不做持久化留存
- 构建日志通过 Socket.IO 实时推送
- 构建在 git worktree 中隔离执行，不污染用户工作区
- 同一项目不同分支可并行构建
- 项目目录自带 Dockerfile/nginx.conf 时自动检测并优先使用（Dockerfile 需通过安全校验）

## 核心流程
```
选择/恢复历史路径 → 扫描项目 → 选择项目 → 选择分支 → 配置构建选项 → 触发构建
→ git worktree 隔离 → install → build → [Docker build] → zip 打包 → 实时日志 → 产物下载
→ worktree 自动清理
```

## 已完成功能
- [x] 父目录配置与项目扫描（含历史路径缓存）
- [x] 项目/分支选择（多选支持）
- [x] 静态资源构建（自动检测包管理器 + 自定义 Install/Build Command）
- [x] git worktree 隔离构建
- [x] 构建日志实时展示（终端风格）
- [x] dist 产物 zip 下载
- [x] Docker 镜像构建（Dockerfile 模板 + 项目目录自动检测）
- [x] Nginx 配置模板管理
- [x] Docker Registry 推送
- [x] Build Center 多 Tab 布局（New Project 新增 Tab）
- [x] Dockerfile/Nginx Template 弹窗编辑
- [x] Settings 页面（模板 CRUD + Registry 配置）
- [x] 模板持久化存储（`~/.auto-build/settings.json`）
- [ ] 二方包下载集成