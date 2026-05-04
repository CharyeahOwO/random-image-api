import fs from 'node:fs/promises';
import path from 'node:path';
import { imageSize } from 'image-size';
import { config, deviceNames, allowedImageExtensions } from './config.js';
import {
  assertSafeDevice,
  assertSafeGallery,
  ensureDir,
  isValidGalleryName,
  publicImagePath,
  safeJoin
} from './utils/file.js';

async function getImageDimensions(absolutePath) {
  try {
    const buffer = await fs.readFile(absolutePath);
    const dimensions = imageSize(buffer);
    if (!dimensions?.width || !dimensions?.height) return { width: null, height: null };
    return { width: dimensions.width, height: dimensions.height };
  } catch {
    return { width: null, height: null };
  }
}

function uniqueFilename(filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  return `${stem}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`;
}

const emptyStats = () => ({
  imageCount: 0,
  galleryCount: 0,
  galleries: [],
  images: [],
  generatedAt: new Date().toISOString()
});

export class ImageStore {
  constructor() {
    this.cache = emptyStats();
    this.lastRefreshMs = 0;
    this.refreshing = null;
  }

  async init() {
    await ensureDir(config.imageRoot);
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((error) => console.error('refresh image cache failed:', error));
    }, config.cacheTtlSeconds * 1000);
    this.timer.unref?.();
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getStats() {
    if (Date.now() - this.lastRefreshMs > config.cacheTtlSeconds * 1000) {
      await this.refresh();
    }
    return this.cache;
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.scan()
      .then((stats) => {
        this.cache = stats;
        this.lastRefreshMs = Date.now();
        return stats;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  async scan() {
    await ensureDir(config.imageRoot);
    const entries = await fs.readdir(config.imageRoot, { withFileTypes: true }).catch((error) => {
      if (error.code !== 'ENOENT') console.error('readdir failed:', error);
      return [];
    });
    const galleries = [];
    const images = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidGalleryName(entry.name)) continue;
      const gallery = entry.name;
      const galleryDir = safeJoin(config.imageRoot, gallery);
      const galleryStats = { name: gallery, total: 0, pc: 0, mobile: 0 };

      for (const device of deviceNames) {
        const deviceDir = safeJoin(galleryDir, device);
        await ensureDir(deviceDir);
        const files = await fs.readdir(deviceDir, { withFileTypes: true }).catch((error) => {
          if (error.code !== 'ENOENT') console.error('readdir device failed:', error);
          return [];
        });
        for (const file of files) {
          if (!file.isFile()) continue;
          const ext = path.extname(file.name).replace('.', '').toLowerCase();
          if (!allowedImageExtensions.has(ext)) continue;

          const absolutePath = safeJoin(deviceDir, file.name);
          const stat = await fs.stat(absolutePath).catch((error) => {
            if (error.code !== 'ENOENT') console.error('stat failed:', error);
            return null;
          });
          if (!stat) continue;
          const dimensions = await getImageDimensions(absolutePath);

          const image = {
            url: `${config.publicBaseUrl}${publicImagePath(gallery, device, file.name)}`,
            path: publicImagePath(gallery, device, file.name),
            gallery,
            device,
            filename: file.name,
            size: stat.size,
            width: dimensions.width,
            height: dimensions.height,
            type: ext === 'jpeg' ? 'jpg' : ext,
            mtimeMs: stat.mtimeMs,
            absolutePath
          };
          images.push(image);
          galleryStats.total += 1;
          galleryStats[device] += 1;
        }
      }

      galleries.push(galleryStats);
    }

    galleries.sort((a, b) => a.name.localeCompare(b.name));
    images.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return {
      imageCount: images.length,
      galleryCount: galleries.length,
      galleries,
      images,
      generatedAt: new Date().toISOString()
    };
  }

  async ensureGallery(gallery) {
    assertSafeGallery(gallery);
    const galleryDir = safeJoin(config.imageRoot, gallery);
    await Promise.all(deviceNames.map((device) => ensureDir(safeJoin(galleryDir, device))));
    await this.refresh();
    return gallery;
  }

  async deleteEmptyGallery(gallery) {
    assertSafeGallery(gallery);
    const galleryDir = safeJoin(config.imageRoot, gallery);
    const stats = await this.getStats();
    const current = stats.galleries.find((item) => item.name === gallery);
    if (!current) throw new Error('图库不存在');
    if (current.total > 0) throw new Error('只能删除空图库');

    for (const device of deviceNames) {
      await fs.rm(safeJoin(galleryDir, device), { recursive: true, force: true });
    }
    const remaining = await fs.readdir(galleryDir).catch(() => []);
    if (remaining.length > 0) throw new Error('图库目录不为空，无法删除');
    await fs.rmdir(galleryDir);
    await this.refresh();
  }

  async deleteImage({ gallery, device, filename }) {
    assertSafeGallery(gallery);
    assertSafeDevice(device);
    if (!filename || filename !== path.basename(filename)) {
      throw new Error('非法文件名');
    }
    const target = safeJoin(config.imageRoot, gallery, device, filename);
    await fs.unlink(target);
    await this.refresh();
  }

  async moveImage({ gallery, device, filename, targetGallery, targetDevice }) {
    assertSafeGallery(gallery);
    assertSafeDevice(device);
    assertSafeGallery(targetGallery);
    assertSafeDevice(targetDevice);
    if (!filename || filename !== path.basename(filename)) {
      throw new Error('非法文件名');
    }

    const source = safeJoin(config.imageRoot, gallery, device, filename);
    const targetDir = safeJoin(config.imageRoot, targetGallery, targetDevice);
    await ensureDir(targetDir);

    let targetFilename = filename;
    let target = safeJoin(targetDir, targetFilename);
    try {
      await fs.access(target);
      targetFilename = uniqueFilename(filename);
      target = safeJoin(targetDir, targetFilename);
    } catch {
      // Target does not exist.
    }

    await fs.rename(source, target);
    return targetFilename;
  }

  async batchDelete(images) {
    let success = 0;
    const failed = [];
    for (const image of images) {
      try {
        await this.deleteImage(image);
        success += 1;
      } catch (error) {
        failed.push(`${image.filename || 'unknown'}: ${error.message}`);
      }
    }
    await this.refresh();
    return { success, failed };
  }

  async batchMove(images, { targetGallery, targetDevice }) {
    let success = 0;
    const failed = [];
    for (const image of images) {
      try {
        await this.moveImage({ ...image, targetGallery, targetDevice });
        success += 1;
      } catch (error) {
        failed.push(`${image.filename || 'unknown'}: ${error.message}`);
      }
    }
    await this.refresh();
    return { success, failed };
  }

  async batchChangeDevice(images, targetDevice) {
    let success = 0;
    const failed = [];
    for (const image of images) {
      try {
        await this.moveImage({ ...image, targetGallery: image.gallery, targetDevice });
        success += 1;
      } catch (error) {
        failed.push(`${image.filename || 'unknown'}: ${error.message}`);
      }
    }
    await this.refresh();
    return { success, failed };
  }

  async batchChangeGallery(images, targetGallery) {
    let success = 0;
    const failed = [];
    for (const image of images) {
      try {
        await this.moveImage({ ...image, targetGallery, targetDevice: image.device });
        success += 1;
      } catch (error) {
        failed.push(`${image.filename || 'unknown'}: ${error.message}`);
      }
    }
    await this.refresh();
    return { success, failed };
  }

  async listImages({ gallery, device, limit } = {}) {
    const stats = await this.getStats();
    let images = stats.images;
    if (gallery) images = images.filter((image) => image.gallery === gallery);
    if (device && device !== 'all') images = images.filter((image) => image.device === device);
    return images.slice(0, limit);
  }

  async randomImage({ gallery, device = 'all' } = {}) {
    const stats = await this.getStats();
    let images = stats.images;
    if (gallery) images = images.filter((image) => image.gallery === gallery);
    if (device && device !== 'all') images = images.filter((image) => image.device === device);
    if (images.length === 0) return { image: null, total: 0 };
    const image = images[Math.floor(Math.random() * images.length)];
    return { image, total: images.length };
  }
}

export function publicImageJson(image, total) {
  if (!image) return null;
  return {
    url: image.url,
    gallery: image.gallery,
    device: image.device,
    filename: image.filename,
    size: image.size,
    width: image.width,
    height: image.height,
    type: image.type,
    total
  };
}
