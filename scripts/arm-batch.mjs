import { io } from '../packages/client/node_modules/socket.io-client/build/esm-debug/index.js';

const BASE = 'http://localhost:3001';
const ROOT = '/Users/zakj/Documents/workplace/xk-hm';

const nodeDockerfile = (extraCopy) => `FROM public.ecr.aws/docker/library/node:22-alpine
WORKDIR /root/app
ENV PREBUILDS_ONLY=1
ENV FFI_NAPI=1
COPY .npmrc package.json ./
${extraCopy}
COPY dist ./dist
RUN npm install --omit=dev --force
EXPOSE 8080
ENTRYPOINT ["npm"]
CMD ["start"]
`;

const nginxDockerfile = `FROM public.ecr.aws/docker/library/nginx:1.27-alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
`;

const spaNginx = `server {
    listen 8080;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /health {
        add_header Content-Type text/plain;
        return 200 "ok";
    }
}
`;

const jobs = [
  {
    name: 'hm-scrm-admin-ui',
    path: `${ROOT}/hm-scrm-admin-ui`,
    branch: 'dev_2.27.1',
    nodeVersion: '18.20.8',
    dockerOptions: {
      buildMode: 'docker',
      dockerfileTemplate: 'custom',
      platform: 'linux/arm64',
      gzipImage: true,
      customDockerfile: nodeDockerfile('COPY server ./server'),
      registry: { url: '', imageName: 'hm-scrm-admin-ui', tag: 'dev_2.27.1-arm64' },
    },
  },
  {
    name: 'hm-scrm-sidebar-ui',
    path: `${ROOT}/hm-scrm-sidebar-ui`,
    branch: 'dev_2.27.0',
    nodeVersion: '18.20.8',
    dockerOptions: {
      buildMode: 'docker',
      dockerfileTemplate: 'custom',
      platform: 'linux/arm64',
      gzipImage: true,
      customDockerfile: nodeDockerfile('COPY app.js ./app.js\nCOPY config ./config'),
      registry: { url: '', imageName: 'hm-scrm-sidebar-ui', tag: 'dev_2.27.0-arm64' },
    },
  },
  {
    name: 'ai-platform-static',
    path: `${ROOT}/ai-platform-static`,
    branch: 'dev_3.4.0',
    nodeVersion: '20.19.5',
    installCommand: 'npx --yes pnpm@9.15.9 install',
    buildCommand: 'npx --yes pnpm@9.15.9 run build',
    dockerOptions: {
      buildMode: 'docker',
      dockerfileTemplate: 'custom',
      platform: 'linux/arm64',
      gzipImage: true,
      customDockerfile: nginxDockerfile,
      nginxConfig: 'standard-spa',
      customNginxConfig: spaNginx,
      registry: { url: '', imageName: 'ai-platform-static', tag: 'dev_3.4.0-arm64' },
    },
  },
  {
    name: 'ai-workspace-static',
    path: `${ROOT}/ai-workspace-static`,
    branch: 'dev_3.4.0',
    nodeVersion: '20.19.5',
    installCommand: 'npx --yes pnpm@9.15.9 install',
    buildCommand: 'npx --yes pnpm@9.15.9 run build',
    dockerOptions: {
      buildMode: 'docker',
      dockerfileTemplate: 'custom',
      platform: 'linux/arm64',
      gzipImage: true,
      customDockerfile: nginxDockerfile,
      nginxConfig: 'standard-spa',
      customNginxConfig: spaNginx,
      registry: { url: '', imageName: 'ai-workspace-static', tag: 'dev_3.4.0-arm64' },
    },
  },
  {
    name: 'hm-document',
    path: `${ROOT}/hm-document`,
    branch: 'master',
    nodeVersion: '18.20.8',
    installCommand: 'true',
    buildCommand: 'mkdir -p dist && echo skip > dist/.keep',
    dockerOptions: {
      buildMode: 'docker',
      dockerfileTemplate: 'custom',
      platform: 'linux/arm64',
      gzipImage: true,
      customDockerfile: `FROM base-registry.zhonganinfo.com/x-group/documentserver:9.0.3
WORKDIR /app
COPY scripts.py .
RUN python3 scripts.py
EXPOSE 80
`,
      registry: { url: '', imageName: 'hm-document', tag: 'master-arm64' },
    },
  },
];

function ts() {
  return new Date().toISOString().slice(11, 19);
}

const results = [];

function runJob(socket, job) {
  return new Promise(async (resolve) => {
    let buildId = null;
    let settled = false;
    const finish = (entry) => {
      if (settled) return;
      settled = true;
      socket.off('build:log', onLog);
      socket.off('build:complete', onComplete);
      socket.off('build:error', onError);
      socket.off('build:status', onStatus);
      results.push(entry);
      resolve(entry);
    };

    const onLog = (d) => {
      if (buildId && d.buildId !== buildId) return;
      const line = (d.data || '').replace(/\n$/, '');
      if (!line.trim()) return;
      if (
        line.includes('[auto-dist]') ||
        line.includes('error') ||
        line.includes('Error') ||
        line.includes('DONE') ||
        line.includes('built in') ||
        line.includes('naming to') ||
        /step \d+/i.test(line)
      ) {
        console.log(`[${ts()}] [${job.name}] ${line}`);
      }
    };
    const onStatus = (d) => {
      if (buildId && d.buildId !== buildId) return;
      console.log(`[${ts()}] [${job.name}] status=${d.status}`);
    };
    const onComplete = (d) => {
      if (buildId && d.buildId !== buildId) return;
      console.log(`[${ts()}] [${job.name}] COMPLETE buildId=${d.buildId}`);
      finish({ name: job.name, branch: job.branch, status: 'completed', buildId: d.buildId, zipPath: d.zipPath });
    };
    const onError = (d) => {
      if (buildId && d.buildId !== buildId) return;
      console.log(`[${ts()}] [${job.name}] FAILED ${d.error}`);
      finish({ name: job.name, branch: job.branch, status: 'failed', buildId: d.buildId || buildId, error: d.error });
    };

    socket.on('build:log', onLog);
    socket.on('build:complete', onComplete);
    socket.on('build:error', onError);
    socket.on('build:status', onStatus);

    console.log(`[${ts()}] START ${job.name} ${job.branch}`);
    try {
      const res = await fetch(`${BASE}/api/build/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socketId: socket.id,
          projectName: job.name,
          projectPath: job.path,
          branch: job.branch,
          nodeVersion: job.nodeVersion,
          installCommand: job.installCommand,
          buildCommand: job.buildCommand,
          dockerOptions: job.dockerOptions,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        finish({ name: job.name, branch: job.branch, status: 'failed', error: json.error || 'start failed' });
        return;
      }
      buildId = json.data.buildId;
      console.log(`[${ts()}] [${job.name}] buildId=${buildId}`);
    } catch (err) {
      finish({ name: job.name, branch: job.branch, status: 'failed', error: String(err) });
    }
  });
}

const socket = io(BASE, { transports: ['websocket', 'polling'] });
socket.on('connect', async () => {
  console.log(`[${ts()}] connected socketId=${socket.id}`);
  for (const job of jobs) {
    const entry = await runJob(socket, job);
    console.log(`[${ts()}] RESULT ${JSON.stringify(entry)}`);
  }
  console.log('ALL_DONE ' + JSON.stringify(results, null, 2));
  socket.close();
  const failed = results.some((r) => r.status !== 'completed');
  process.exit(failed ? 1 : 0);
});
socket.on('connect_error', (err) => {
  console.error('socket error', err.message);
  process.exit(1);
});
