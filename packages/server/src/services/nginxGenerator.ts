import type { SubApp } from './configService.js';

// ========== 标准版选项 ==========

export interface StandardNginxOptions {
  baseDir?: string;
  listenPort?: number;
  apiProxyTarget?: string;
  sidebarDomain?: string;
}

const STANDARD_DEFAULTS: Required<Pick<StandardNginxOptions, 'baseDir' | 'listenPort' | 'apiProxyTarget'>> & { sidebarDomain: string } = {
  baseDir: '/alidata1/admin/projects',
  listenPort: 80,
  apiProxyTarget: 'http://172.20.122.11:7087',
  sidebarDomain: '',
};

/**
 * 生成标准版 Nginx 配置（对应 hm-portal-ui.conf）
 */
export function generateStandardNginx(
  subApps: SubApp[],
  options: StandardNginxOptions = {},
): string {
  const {
    baseDir,
    listenPort,
    apiProxyTarget,
    sidebarDomain,
  } = { ...STANDARD_DEFAULTS, ...options };

  const enabledApps = subApps.filter((a) => a.enabled);
  const lines: string[] = [];

  // --- map 块 ---
  lines.push(`# HTML缓存控制映射`);
  lines.push(`map $request_filename $html_cache_control {`);
  lines.push(`    ~*\\.(html|htm)$ "private, no-cache, no-store, must-revalidate, proxy-revalidate";`);
  lines.push(`    default "";`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`map $request_filename $html_pragma {`);
  lines.push(`    ~*\\.(html|htm)$ "no-cache";`);
  lines.push(`    default "";`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`map $request_filename $html_expires {`);
  lines.push(`    ~*\\.(html|htm)$ "0";`);
  lines.push(`    default "";`);
  lines.push(`}`);
  lines.push(``);
  lines.push(``);

  // --- server 块 ---
  lines.push(`server {`);
  lines.push(`    listen ${listenPort};`);
  lines.push(`    # 设置相对url重定向`);
  lines.push(`    absolute_redirect off;`);
  lines.push(`    client_max_body_size 20m;`);
  lines.push(`    gzip on;`);
  lines.push(`    server_name_in_redirect on;`);
  lines.push(`    port_in_redirect off;`);
  lines.push(`    gzip_types text/plain text/css application/javascript image/*;`);
  lines.push(``);
  lines.push(`     # 为HTML文件设置缓存头`);
  lines.push(`    add_header Cache-Control $html_cache_control always;`);
  lines.push(`    add_header Pragma $html_pragma always;`);
  lines.push(`    add_header Expires $html_expires always;`);
  lines.push(``);

  // --- 主应用 location / ---
  lines.push(`    location / {`);
  lines.push(`        index index.html;`);
  lines.push(`        try_files $uri $uri/ /index.html;`);
  lines.push(``);
  lines.push(`        # 替换 html 中的 </head> 标签，添加脚本`);
  const safeSidebarDomain = JSON.stringify(sidebarDomain).slice(1, -1);
  lines.push(`        ; sub_filter '<head>' '<head><script>window._SIDEBAR_DOMAIN_="${safeSidebarDomain}"</script>';`);
  lines.push(`        ; sub_filter_once on;`);
  lines.push(`        ; sub_filter_types text/html;`);
  lines.push(``);
  lines.push(`        root ${baseDir}/portal;`);
  lines.push(`    }`);

  // --- 子应用 location 块 ---
  for (const app of enabledApps) {
    lines.push(`    location ^~ /${app.routePath} {`);
    lines.push(`        # ${app.projectName} 项目`);
    lines.push(`        alias ${baseDir}/${app.deployDir};`);
    lines.push(`        index index.html;`);
    lines.push(`        try_files $uri $uri/ /${app.deployDir}/index.html;`);
    lines.push(`    }`);
  }

  lines.push(``);

  // --- health check ---
  lines.push(`    location /health {`);
  lines.push(`        add_header Content-Type text/plain;`);
  lines.push(`        return 200 "ok";`);
  lines.push(`    }`);
  lines.push(``);

  // --- API proxy ---
  lines.push(`    location /api/ {`);
  lines.push(`        proxy_set_header Host $proxy_host;`);
  lines.push(`        proxy_set_header originalDomain $host;`);
  lines.push(`        proxy_set_header X-Real-IP $remote_addr;`);
  lines.push(`        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`);
  lines.push(`        rewrite "^/api/(.*)$" /$1 break;`);
  lines.push(`        proxy_pass ${apiProxyTarget};`);
  lines.push(`    }`);
  lines.push(``);

  // --- error_page ---
  lines.push(`    error_page 500 502 503 504 /50x.html;`);
  lines.push(`    location = /50x.html {`);
  lines.push(`        root ${baseDir}/portal;`);
  lines.push(`    }`);

  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}

// ========== Docker 版选项 ==========

export interface DockerProxyApp {
  routePath: string;
  envVar: string;
}

export interface DockerNginxOptions {
  listenPort?: number;
  apiServerUrl?: string;
  proxyApps?: DockerProxyApp[];
}

const DOCKER_DEFAULTS = {
  listenPort: 8080,
  apiServerUrl: '${API_SERVER_URL}',
};

/**
 * 生成 Docker 版 Nginx 配置（对应 hm-portal-ui_docker.conf）
 */
export function generateDockerNginx(
  _subApps: SubApp[],
  options: DockerNginxOptions = {},
): string {
  const {
    listenPort,
    apiServerUrl,
    proxyApps,
  } = { ...DOCKER_DEFAULTS, ...options };

  const lines: string[] = [];

  // --- map 块 ---
  lines.push(`# HTML缓存控制映射`);
  lines.push(`map $request_filename $html_cache_control {`);
  lines.push(`    ~*\\.(html|htm)$ "private, no-cache, no-store, must-revalidate, proxy-revalidate";`);
  lines.push(`    default "";`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`map $request_filename $html_pragma {`);
  lines.push(`    ~*\\.(html|htm)$ "no-cache";`);
  lines.push(`    default "";`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`map $request_filename $html_expires {`);
  lines.push(`    ~*\\.(html|htm)$ "0";`);
  lines.push(`    default "";`);
  lines.push(`}`);
  lines.push(``);

  // --- server 块 ---
  lines.push(`server {`);
  lines.push(`  server_tokens  off; #隐藏nginx版本号`);
  lines.push(`  include /etc/nginx/conf.d/*.variable;`);
  lines.push(``);
  lines.push(`  listen       ${listenPort};`);
  lines.push(`  client_max_body_size   400m;`);
  lines.push(`  client_header_timeout    10m;`);
  lines.push(`  client_body_timeout      10m;`);
  lines.push(`  proxy_connect_timeout     10m;`);
  lines.push(`  proxy_read_timeout      10m;`);
  lines.push(`  proxy_send_timeout      10m;`);
  lines.push(``);
  lines.push(`  server_name_in_redirect on;`);
  lines.push(`  port_in_redirect off;`);
  lines.push(``);

  // --- HTML 缓存头 ---
  lines.push(`  # 为HTML文件设置缓存头`);
  lines.push(`  add_header Cache-Control $html_cache_control always;`);
  lines.push(`  add_header Pragma $html_pragma always;`);
  lines.push(`  add_header Expires $html_expires always;`);
  lines.push(``);

  // --- gzip ---
  lines.push(`  gzip on;`);
  lines.push(`  gzip_min_length 1k;`);
  lines.push(`  gzip_buffers 4 32k;`);
  lines.push(`  gzip_comp_level 4;`);
  lines.push(`  gzip_types text/plain application/javascript application/x-javascript text/javascript text/xml text/css;`);
  lines.push(`  gzip_vary on;`);
  lines.push(`  gzip_disable "MSIE [1-6]\\.";`);
  lines.push(``);

  // --- 安全头 ---
  lines.push(`  add_header X-Frame-Options ALLOWALL;`);
  lines.push(`  root /usr/share/nginx/html;`);

  // --- 主应用 ---
  lines.push(`  location / {`);
  lines.push(`    index index.html;`);
  lines.push(`    try_files $uri $uri/ /index.html;`);
  lines.push(`  }`);
  lines.push(``);

  // --- health ---
  lines.push(`  location /health {`);
  lines.push(`    add_header Content-Type text/plain;`);
  lines.push(`    return 200 "up";`);
  lines.push(`  }`);
  lines.push(``);

  // --- getEnv ---
  lines.push(`  location /getEnv {`);
  lines.push(`    add_header Content-Type application/json;`);
  lines.push(`    return 200 '{"status":"success", "value":"$DEPLOY_ENV"}';`);
  lines.push(`  }`);
  lines.push(``);

  // --- 子应用 proxy_pass ---
  if (proxyApps && proxyApps.length > 0) {
    for (const app of proxyApps) {
      lines.push(`  location ^~ /${app.routePath} {`);
      lines.push(`    proxy_pass \${${app.envVar}};`);
      lines.push(`  }`);
      lines.push(``);
    }
  }

  // --- API proxy ---
  lines.push(`  location /api/ {`);
  lines.push(`      proxy_set_header Host $proxy_host;`);
  lines.push(`      proxy_set_header originalDomain $host;`);
  lines.push(`      proxy_set_header X-Real-IP $remote_addr;`);
  lines.push(`      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`);
  lines.push(`      rewrite "^/api/(.*)$" /$1 break;`);
  lines.push(`      proxy_pass ${apiServerUrl};`);
  lines.push(`  }`);
  lines.push(``);

  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}
