import OSS from 'ali-oss';
import type { StoredTemplate, TemplateType } from './configService.js';

// ========== 类型定义 ==========

export interface OssConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint?: string;
  prefix?: string;
}

// ========== 辅助 ==========

function buildOssPrefix(prefix: string, type: TemplateType): string {
  return `${prefix}${type}/`;
}

function validateKey(key: string): void {
  if (key.includes('/') || key.includes('..') || key.includes('\\')) {
    throw new Error(`Invalid template key: ${key}`);
  }
}

// ========== 公开 API ==========

/**
 * 创建 OSS 客户端，配置不完整时返回 null
 */
export function createOssClient(config: OssConfig): OSS | null {
  if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.region) {
    return null;
  }
  return new OSS({
    region: config.region,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    endpoint: config.endpoint,
  });
}

/**
 * 列出 OSS 中指定类型的所有模板
 */
export async function listTemplatesFromOss(
  client: OSS,
  prefix: string,
  type: TemplateType,
): Promise<StoredTemplate[]> {
  try {
    const ossPrefix = buildOssPrefix(prefix, type);
    const query: OSS.ListObjectsQuery = { prefix: ossPrefix, 'max-keys': 100 };
    const result = await client.list(query, {});
    const objects = result.objects ?? [];
    const jsonObjects = objects.filter((obj) => obj.name.endsWith('.json'));

    const templates: StoredTemplate[] = [];
    for (const obj of jsonObjects) {
      try {
        const res = await client.get(obj.name);
        const content = res.content.toString('utf-8');
        templates.push(JSON.parse(content) as StoredTemplate);
      } catch (e) {
        console.warn(`[OssService] 读取对象失败: ${obj.name}`, e);
      }
    }
    return templates;
  } catch (e) {
    console.warn(`[OssService] listTemplatesFromOss 失败:`, e);
    return [];
  }
}

/**
 * 从 OSS 读取单个模板，不存在返回 null
 */
export async function getTemplateFromOss(
  client: OSS,
  prefix: string,
  type: TemplateType,
  key: string,
): Promise<StoredTemplate | null> {
  validateKey(key);
  try {
    const ossKey = `${buildOssPrefix(prefix, type)}${key}.json`;
    const res = await client.get(ossKey);
    const content = res.content.toString('utf-8');
    return JSON.parse(content) as StoredTemplate;
  } catch (e: any) {
    if (e?.status === 404 || e?.code === 'NoSuchKey') return null;
    console.warn(`[OssService] getTemplateFromOss 失败:`, e);
    return null;
  }
}

/**
 * 写入模板到 OSS
 */
export async function putTemplateToOss(
  client: OSS,
  prefix: string,
  type: TemplateType,
  template: StoredTemplate,
): Promise<void> {
  validateKey(template.key);
  try {
    const ossKey = `${buildOssPrefix(prefix, type)}${template.key}.json`;
    await client.put(ossKey, Buffer.from(JSON.stringify(template, null, 2)));
  } catch (e) {
    console.warn(`[OssService] putTemplateToOss 失败:`, e);
  }
}

/**
 * 从 OSS 删除模板，返回是否成功
 */
export async function deleteTemplateFromOss(
  client: OSS,
  prefix: string,
  type: TemplateType,
  key: string,
): Promise<boolean> {
  validateKey(key);
  try {
    const ossKey = `${buildOssPrefix(prefix, type)}${key}.json`;
    await client.delete(ossKey);
    return true;
  } catch (e) {
    console.warn(`[OssService] deleteTemplateFromOss 失败:`, e);
    return false;
  }
}

/**
 * 测试 OSS 连接是否正常
 */
export async function testOssConnection(client: OSS): Promise<boolean> {
  try {
    const q: OSS.ListObjectsQuery = { 'max-keys': 1 };
    await client.list(q, {});
    return true;
  } catch (e) {
    console.warn(`[OssService] testOssConnection 失败:`, e);
    return false;
  }
}
