import Koa from 'koa';
import cors from '@koa/cors';
import Router from '@koa/router';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { setIo } from './services/io.js';
import directoryRouter from './routes/directory.js';
import { projectRouter } from './routes/project.js';
import { buildRouter } from './routes/build.js';
import { dockerRouter } from './routes/docker.js';
import { settingsRouter } from './routes/settings.js';
import { initConfigService } from './services/configService.js';

const app = new Koa();
const server = createServer(app.callback());

// Socket.IO 初始化
const io = new SocketIOServer(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// 通过 setIo 共享实例，避免循环依赖
setIo(io);

// CORS 中间件
app.use(cors({
  origin: 'http://localhost:5173',
}));

// Body parser (Koa 内置不携带，使用简单的 JSON 解析中间件)
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

app.use(async (ctx: any, next: any) => {
  if (ctx.request.type === 'application/json') {
    const body = await new Promise<string>((resolve, reject) => {
      let data = '';
      let exceeded = false;
      ctx.req.on('data', (chunk: any) => {
        data += chunk;
        if (data.length > MAX_BODY_SIZE) {
          exceeded = true;
          ctx.req.destroy();
        }
      });
      ctx.req.on('end', () => resolve(data));
      ctx.req.on('error', reject);
    }).catch(() => null);

    if (body === null || (body as string).length > MAX_BODY_SIZE) {
      ctx.status = 413;
      ctx.body = { success: false, error: 'Request body too large' };
      return;
    }

    try {
      ctx.request.body = JSON.parse(body as string);
    } catch {
      ctx.request.body = undefined;
    }
  }
  await next();
});

// 路由
const router = new Router();

router.get('/api/health', (ctx: any) => {
  ctx.body = { status: 'ok', timestamp: new Date().toISOString() };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(directoryRouter.routes());
app.use(directoryRouter.allowedMethods());

// Project routes (git operations)
app.use(projectRouter.routes());
app.use(projectRouter.allowedMethods());

// Build routes
app.use(buildRouter.prefix('/api/build').routes());
app.use(buildRouter.allowedMethods());

// Docker routes
app.use(dockerRouter.routes());
app.use(dockerRouter.allowedMethods());

// Settings routes
app.use(settingsRouter.routes());
app.use(settingsRouter.allowedMethods());

// Socket.IO 连接事件
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // 客户端加入构建房间，用于接收构建日志
  socket.on('join:build', (buildId: string) => {
    socket.join(`build:${buildId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined build:${buildId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// 启动服务器
const PORT = 3001;
(async () => {
  try {
    await initConfigService();
  } catch (err) {
    console.error('[Server] Failed to initialize config service:', err);
    console.error('[Server] Continuing with in-memory defaults');
  }
  server.listen(PORT, () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  });
})();
