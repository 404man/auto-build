---
name: xk-hm-auto-build
description: >-
  Drive auto-build (auto-dist) to compile xk-hm frontend apps into dist zips.
  Use when the user asks to 构建 / build hm-*-ui or x-gateway-front via auto-build,
  batch-build xk-hm projects, or retry a failed auto-build dist.
---

# xk-hm via auto-build

auto-build is the compiler. This skill is the recipe book.

**Do:** call `http://localhost:3001` with a connected Socket.IO client.  
**Do not:** `git worktree`, `nvm use`, `npm/pnpm install|build` in the source repo, or edit the app's `package.json`.

## Preconditions

1. `GET http://localhost:3001/api/health` → `{"status":"ok"}`. If down, from auto-build root run `pnpm --filter server dev` (or `pnpm dev`). Do not start a second server.
2. Logs are emitted only to `socketId`. Keep the socket connected until `batch:complete` / `build:complete` / `build:error`.
3. Default Node: **18.20.8**. Ignore requested 18.20.9+ unless that version exists on `GET /api/nvm/versions`.

Base path: `/Users/zakj/Documents/workplace/xk-hm/<project>`  
Zips: `~/.auto-build/artifacts/dist-<buildId>.zip`  
Download: `GET http://localhost:3001/api/build/download/<buildId>`

## Invoke

`installCommand` / `buildCommand` / `nodeVersion` are **global** on `/api/build/batch`. Projects that need extra packages must use `/api/build/start` (one at a time), not a mixed batch with a custom install.

From `packages/client` (has `socket.io-client`):

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001', { transports: ['websocket', 'polling'] });
socket.on('connect', async () => {
  await fetch('http://localhost:3001/api/build/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      socketId: socket.id,
      nodeVersion: '18.20.8',
      projects: [{ name, path, branch }],
    }),
  });
});
socket.on('build:log', (d) => process.stdout.write(d.data || ''));
socket.on('batch:complete', (d) => { console.log(JSON.stringify(d, null, 2)); process.exit(0); });
socket.on('build:complete', (d) => { console.log(JSON.stringify(d, null, 2)); process.exit(0); });
socket.on('build:error', (d) => { console.error(JSON.stringify(d)); process.exit(1); });
```

Single retry with extra deps: `POST /api/build/start` plus  
`installCommand: "npm install <pkgs> --legacy-peer-deps"` (or `pnpm add <pkgs>` when the first run used pnpm).

Timeout: 15–25 min per app. Wait for complete; do not poll `/api/build/status` as a substitute for the socket.

## Recipes

Last-known branches; user table wins if they give different ones.

| Project | Branch | PM hint | Extra install |
|---|---|---|---|
| hm-event-center-ui | jf_3.11.0_zking | pnpm | — |
| hm-gmp-strategy-ui | jf_3.5.0_zking | npm (no lockfile) | `styled-components` |
| hm-scrm-admin-ui | jf_2.31.0_zking | | — |
| hm-scrm-sidebar-ui | jf_2.31.0_zking | pnpm | — |
| hm-scrm-h5 | jf_2.31.0_zking | npm (no lockfile) | — |
| hm-scrm-workbench | jf_2.30.0_zking | npm | — |
| hm-cdp-ui | jf_3.14.0_zking | | — |
| x-gateway-front | jf_3.10.0_zking | | (invalid `pnpm-workspace.yaml` — auto-build already sanitizes) |
| hm-xflow-ui-metadata | jf_2.7.0_zking | | `dva-core` |
| hm-activity-playbox-ui | jf_2.14.x_zking | npm (no lockfile, webpack 4) | `is-any-array@2.0.1` `ml-array-rescale@1.2.0` (latest are ESM; webpack 4 cannot resolve them) |
| hm-activity-common-ui | jf_2.14.1_zking | | — |
| ai-platform-static | master | pnpm (Vite 6) | Node **20.19.5**; `npx --yes pnpm@9.15.9 install` / `run build` (corepack hash on `packageManager` is stale; Node 18 fails with `File is not defined`) |

Known extra packages: install on the **first** `/api/build/start` for that app, do not wait for a failed batch.

## Failure retry

If log has `Can't resolve '<pkg>'` / `Module not found`:

1. Collect unique missing package names.
2. `POST /api/build/start` with the same path/branch/nodeVersion and `installCommand` that adds those packages. Do not checkout or patch the source repo.
3. If it fails again on a **new** missing pkg, retry once more the same way. After two extra-dep retries, stop and report.
4. Other failures (registry, umi/webpack non-resolve errors): report log tail; do not invent workarounds.

OpenSSL / `--legacy-peer-deps` / bad `pnpm-workspace.yaml` are already handled by auto-build — do not add custom commands for those.

## Report

Per app: project, branch, status, buildId, zip path, size. Note any extra `installCommand` used.
