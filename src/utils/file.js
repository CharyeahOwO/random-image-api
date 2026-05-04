import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { allowedImageExtensions, appBasePath, deviceNames, galleryNamePattern } from '../config.js';

const mimeByExt = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif'
};

export function isValidGalleryName(name) {
  return typeof name === 'string' && galleryNamePattern.test(name);
}

export function isValidDevice(device) {
  return deviceNames.includes(device);
}

export function assertSafeGallery(name) {
  if (!isValidGalleryName(name)) {
    throw new Error('图库名只能包含小写字母、数字、短横线和下划线');
  }
}

export function assertSafeDevice(device) {
  if (!isValidDevice(device)) {
    throw new Error('设备类型只能是 pc 或 mobile');
  }
}

/**
 * 安全地拼接路径，防止路径穿越攻击
 * 
 * 将 root 与 segments 拼接后验证结果路径是否仍在 root 目录内。
 * 防御 ../../../etc/passwd 等路径穿越攻击。
 * 
 * @param {string} root - 根目录绝对路径
 * @param {...string} segments - 要拼接的路径片段
 * @returns {string} 安全的绝对路径
 * @throws {Error} 如果拼接后的路径逃出 root 目录
 * 
 * @example
 * safeJoin('/app/images', 'gallery1', 'pc', '001.jpg')
 * // => '/app/images/gallery1/pc/001.jpg'
 */
export function safeJoin(root, ...segments) {
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('非法路径');
  }
  return target;
}

export function getOriginalExtension(filename) {
  return path.extname(filename || '').replace('.', '').toLowerCase();
}

export function normalizeDetectedExtension(ext) {
  return ext === 'jpeg' ? 'jpg' : ext;
}

/**
 * 解码上传文件名中的中文字符
 * 
 * 处理浏览器上传时的编码问题：
 * - 部分浏览器将 UTF-8 文件名按 latin1 编码传输
 * - 此函数尝试反转该过程，恢复原始中文文件名
 * 
 * @param {string} name - 原始上传文件名（可能被错误编码）
 * @returns {string} 解码后的文件名，如果解码失败则返回原名
 * 
 * @example
 * decodeUploadName('%E4%B8%AD%E6%96%87') // => '中文'
 * decodeUploadName('english.jpg') // => 'english.jpg'
 */
export function decodeUploadName(name = '') {
  if (/[\u3400-\u9FFF]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) return name;
    if (/[\u3400-\u9FFF]/.test(decoded)) return decoded;
    return decoded === name ? name : decoded;
  } catch {
    return name;
  }
}

/**
 * 检测图片文件的真实类型
 * 
 * 通过读取文件二进制头（magic bytes）识别真实格式，
 * 防止用户通过修改扩展名伪装文件类型。
 * 
 * @param {Buffer} buffer - 文件内容的 Buffer
 * @param {string} originalName - 原始文件名（用于扩展名校验）
 * @returns {Promise<{ext: string, mime: string, originalExt: string, extensionCorrected: boolean}>}
 *   - ext: 检测到的真实扩展名
 *   - mime: 检测到的 MIME 类型
 *   - originalExt: 原始扩展名
 *   - extensionCorrected: 是否需要修正扩展名
 * @throws {Error} 如果扩展名不支持或无法识别文件类型
 */
export async function detectImageType(buffer, originalName) {
  const originalExt = getOriginalExtension(originalName);
  if (!allowedImageExtensions.has(originalExt)) {
    throw new Error('不支持的文件扩展名');
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    throw new Error('无法识别真实图片类型');
  }

  const detectedExt = normalizeDetectedExtension(detected.ext);
  const expectedMime = mimeByExt[detectedExt];
  if (!allowedImageExtensions.has(detectedExt) || detected.mime !== expectedMime) {
    throw new Error('不支持的真实图片类型');
  }

  const originalGroup = originalExt === 'jpeg' ? 'jpg' : originalExt;
  return {
    ext: detectedExt,
    mime: detected.mime,
    originalExt,
    extensionCorrected: originalGroup !== detectedExt
  };
}

/**
 * 清理文件名主干，生成安全的 URL-friendly 字符串
 * 
 * 处理流程：
 * 1. Unicode NFKD 标准化
 * 2. 移除变音符号（如 é → e）
 * 3. 转换为小写
 * 4. 将非字母数字字符替换为连字符
 * 5. 移除首尾连字符
 * 6. 截断到 64 字符
 * 
 * @param {string} value - 原始文件名主干
 * @returns {string} 清理后的安全字符串，如果结果为空则返回 'image'
 * 
 * @example
 * sanitizeFilenameStem('My Photo (2024)!') // => 'my-photo-2024'
 * sanitizeFilenameStem('') // => 'image'
 */
export function sanitizeFilenameStem(value = '') {
  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || 'image';
}

/**
 * 生成安全的唯一文件名
 * 
 * 格式：{sanitized-stem}-{timestamp}-{random-hex}.{ext}
 * 使用 crypto.randomBytes 确保不可预测性。
 * 
 * @param {string} ext - 文件扩展名（不含点号）
 * @param {string} [stem=''] - 可选的文件名主干（会被 sanitizeFilenameStem 处理）
 * @returns {string} 安全的唯一文件名
 * 
 * @example
 * createSafeFilename('jpg', 'My Photo') // => 'my-photo-1714123456789-a1b2c3d4e5f6.jpg'
 * createSafeFilename('png') // => '1714123456789-a1b2c3d4e5f6.png'
 */
export function createSafeFilename(ext, stem = '') {
  const prefix = stem ? `${sanitizeFilenameStem(stem)}-` : '';
  return `${prefix}${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

/**
 * 生成图片的公开访问路径
 * 
 * 路径格式：{appBasePath}/images/{gallery}/{device}/{filename}
 * 所有片段都经过 URI 编码以确保安全。
 * 
 * @param {string} gallery - 图库名称
 * @param {string} device - 设备类型 ('pc' | 'mobile')
 * @param {string} filename - 文件名
 * @returns {string} URL 路径（已编码）
 * 
 * @example
 * publicImagePath('anime', 'pc', '001.jpg') // => '/image/images/anime/pc/001.jpg'
 */
export function publicImagePath(gallery, device, filename) {
  return `${appBasePath}/images/${encodeURIComponent(gallery)}/${encodeURIComponent(device)}/${encodeURIComponent(filename)}`;
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
