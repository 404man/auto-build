# Offline Package Tool

这个目录可以直接放到项目根目录下使用。

目录结构：

```text
your-project/
  pnpm-lock.yaml
  offline-package-tool/
    download-scoped-packages.js
    README.md
```

## 功能

从当前项目的 `pnpm-lock.yaml` 中提取根 importer 里实际锁定的 `@za/*` 和 `@x-group/*` 依赖，并继续递归收集它们在这两个 scope 下的子依赖，然后调用 `npm pack` 下载成 `.tgz` 文件。

默认输出目录结构：

```text
offline-packages/@scope/pkg/pkg-version.tgz
```

例如：

```text
offline-packages/@x-group/icons/icons-1.0.34.tgz
offline-packages/@x-group/ui/ui-2.0.93.tgz
offline-packages/@za/designable/designable-1.0.23.tgz
```

## 使用方法

先看将要下载哪些包：

```bash
node offline-package-tool/download-scoped-packages.js --dry-run
```

实际下载：

```bash
node offline-package-tool/download-scoped-packages.js --registry=http://npm.zhonganinfo.com/
```

指定输出目录：

```bash
node offline-package-tool/download-scoped-packages.js --output-dir ./offline-packages
```

指定 lockfile：

```bash
node offline-package-tool/download-scoped-packages.js --lockfile ./pnpm-lock.yaml
```

指定 scope，多个用逗号分隔：

```bash
node offline-package-tool/download-scoped-packages.js --scopes=@za,@x-group
```

## 默认参数

- `lockfile`: 项目根目录下的 `pnpm-lock.yaml`
- `outputDir`: 项目根目录下的 `offline-packages`
- `scopes`: `@za/`, `@x-group/`

## 注意事项

- 该脚本默认假设 `offline-package-tool/` 位于项目根目录。
- 如果你的项目不是 `pnpm-lock.yaml`，需要手动用 `--lockfile` 指定。
- 该脚本下载的是当前项目根 importer 中已经锁定到的精确版本，以及它们在 `@za/*`、`@x-group/*` 范围内的递归子依赖，不是 `package.json` 里的版本范围。
- 这类 `.tgz` 文件适合做离线中转和后续上传，不等于可以直接拷贝进 Nexus 底层目录后自动生效。
