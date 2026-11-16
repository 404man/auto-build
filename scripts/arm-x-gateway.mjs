import { io } from '../packages/client/node_modules/socket.io-client/build/esm-debug/index.js';

const BASE = 'http://localhost:3001';
const socket = io(BASE, { transports: ['websocket', 'polling'] });
function ts() {
  return new Date().toISOString().slice(11, 19);
}

const customDockerfile = `FROM public.ecr.aws/docker/library/node:22-alpine
WORKDIR /root/app
ENV PREBUILDS_ONLY=1
ENV FFI_NAPI=1
COPY .npmrc package.json ./
COPY server ./server
COPY dist ./dist
RUN npm install --omit=dev --force
EXPOSE 8080
ENTRYPOINT ["npm"]
CMD ["start"]
`;

socket.on('connect', async () => {
  console.log(`[${ts()}] connected ${socket.id}`);
  const res = await fetch(`${BASE}/api/build/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      socketId: socket.id,
      projectName: 'x-gateway-front',
      projectPath: '/Users/zakj/Documents/workplace/xk-hm/x-gateway-front',
      branch: 'dev_2.23.0',
      nodeVersion: '18.20.8',
      dockerOptions: {
        buildMode: 'docker',
        dockerfileTemplate: 'custom',
        platform: 'linux/arm64',
        gzipImage: true,
        customDockerfile,
        registry: { url: '', imageName: 'x-gateway-front', tag: 'dev_2.23.0-arm64' },
      },
    }),
  });
  const json = await res.json();
  console.log(`[${ts()}] start ${JSON.stringify(json)}`);
});

socket.on('build:log', (d) => {
  const line = (d.data || '').trimEnd();
  if (!line) return;
  if (
    line.includes('[auto-dist]') ||
    line.includes('Error') ||
    line.includes('FAILED') ||
    line.includes('Module not found') ||
    line.includes('naming to') ||
    line.includes('built in') ||
    line.includes('DONE') ||
    /Can't resolve/.test(line)
  ) {
    console.log(`[${ts()}] ${line}`);
  }
});
socket.on('build:status', (d) => console.log(`[${ts()}] status=${d.status}`));
socket.on('build:complete', (d) => {
  console.log(`[${ts()}] COMPLETE ${JSON.stringify(d)}`);
  process.exit(0);
});
socket.on('build:error', (d) => {
  console.log(`[${ts()}] FAILED ${JSON.stringify(d)}`);
  process.exit(1);
});
socket.on('connect_error', (err) => {
  console.error('socket error', err.message);
  process.exit(1);
});
