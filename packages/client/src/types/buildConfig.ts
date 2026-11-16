export type BuildMode = 'static' | 'docker';

export interface DockerBuildOptions {
  buildMode: 'docker';
  dockerfileTemplate?: string;
  customDockerfile?: string;
  nginxConfig?: string;
  customNginxConfig?: string;
  /** docker build --platform，例如 linux/arm64；空字符串表示宿主机默认 */
  platform?: string;
  /** 下载镜像时是否 gzip 压缩 */
  gzipImage?: boolean;
  registry?: {
    url: string;
    imageName: string;
    tag?: string;
    username?: string;
    password?: string;
  };
}

export interface BuildConfig {
  buildMode: BuildMode;
  dockerfileTemplate: string;
  customDockerfile: string;
  nginxConfig: string;
  customNginxConfig: string;
  pushEnabled: boolean;
  registryUrl: string;
  imageName: string;
  imageTag?: string;
  platform?: string;
  gzipImage?: boolean;
}

export interface DockerTemplate {
  name: string;
  description: string;
}

export interface DockerTemplateDetail extends DockerTemplate {
  content: string;
}

export interface NginxConfig {
  name: string;
  description: string;
}

export interface NginxConfigDetail extends NginxConfig {
  content: string;
}

/** 持久化存储的模板 */
export interface StoredTemplate {
  key: string;
  name: string;
  description: string;
  content: string;
}

/** 模板列表项（不含 content） */
export type TemplateListItem = Omit<StoredTemplate, 'content'>;

/** Registry 全局配置 */
export interface RegistrySettings {
  url: string;
  authMethod: 'token' | 'password' | 'aws_ecr';
  username: string;
  secret?: string;  // 读取时脱敏为 ***
}

/** OSS 配置 */
export interface OssSettings {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint?: string;
  prefix?: string;
}

/** Docker 构建默认配置（Settings / OSS 同步） */
export interface DockerBuildSettings {
  platform: string;
  gzipImage: boolean;
}

/** Settings 全局配置概览 */
export interface SettingsData {
  dockerfileTemplates: TemplateListItem[];
  nginxConfigs: TemplateListItem[];
  registry: RegistrySettings;
  dockerBuild?: DockerBuildSettings;
  oss?: OssSettings;
}
