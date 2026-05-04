import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageStore, publicImageJson } from './imageStore.js';

// Mock the config module
vi.mock('./config.js', () => ({
  config: {
    imageRoot: '/tmp/test-images',
    publicBaseUrl: 'http://localhost:3000',
    cacheTtlSeconds: 60
  },
  deviceNames: ['pc', 'mobile'],
  allowedImageExtensions: new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
}));

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  default: {
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024, mtimeMs: Date.now() }),
    readFile: vi.fn().mockResolvedValue(Buffer.from([])),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('ENOENT'))
  }
}));

describe('ImageStore', () => {
  let store;

  beforeEach(() => {
    store = new ImageStore();
  });

  it('should initialize with empty cache', () => {
    expect(store.cache.imageCount).toBe(0);
    expect(store.cache.galleryCount).toBe(0);
    expect(store.cache.images).toEqual([]);
  });

  it('should return null image when no images available', async () => {
    const result = await store.randomImage();
    expect(result.image).toBeNull();
    expect(result.total).toBe(0);
  });

  it('should have destroy method', () => {
    expect(typeof store.destroy).toBe('function');
  });

  it('should clean up timer on destroy', () => {
    store.timer = setInterval(() => {}, 1000);
    store.destroy();
    expect(store.timer).toBeNull();
  });
});

describe('publicImageJson', () => {
  it('should return null for null image', () => {
    expect(publicImageJson(null, 0)).toBeNull();
  });

  it('should format image correctly', () => {
    const image = {
      path: '/image/images/anime/pc/001.jpg',
      gallery: 'anime',
      device: 'pc',
      filename: '001.jpg',
      size: 123456,
      width: 1920,
      height: 1080,
      type: 'jpg'
    };
    const result = publicImageJson(image, 10, 'https://img.example.com');
    expect(result.url).toBe('https://img.example.com/image/images/anime/pc/001.jpg');
    expect(result.gallery).toBe('anime');
    expect(result.total).toBe(10);
  });
});
