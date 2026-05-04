import { describe, it, expect } from 'vitest';
import { safeJoin, sanitizeFilenameStem, createSafeFilename, publicImagePath } from './file.js';

describe('safeJoin', () => {
  it('should join valid paths', () => {
    const result = safeJoin('/app/images', 'gallery1', 'pc', '001.jpg');
    expect(result).toContain('gallery1');
    expect(result).toContain('pc');
    expect(result).toContain('001.jpg');
  });

  it('should reject path traversal', () => {
    expect(() => safeJoin('/app/images', '../../../etc/passwd')).toThrow('非法路径');
  });

  it('should reject absolute segments', () => {
    expect(() => safeJoin('/app/images', '/etc/passwd')).toThrow('非法路径');
  });
});

describe('sanitizeFilenameStem', () => {
  it('should clean special characters', () => {
    expect(sanitizeFilenameStem('My Photo (2024)!')).toBe('my-photo-2024');
  });

  it('should return "image" for empty input', () => {
    expect(sanitizeFilenameStem('')).toBe('image');
    expect(sanitizeFilenameStem(undefined)).toBe('image');
  });

  it('should truncate long names', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeFilenameStem(long).length).toBeLessThanOrEqual(64);
  });
});

describe('createSafeFilename', () => {
  it('should include extension', () => {
    const name = createSafeFilename('jpg');
    expect(name).toMatch(/\.jpg$/);
  });

  it('should include stem when provided', () => {
    const name = createSafeFilename('png', 'photo');
    expect(name).toMatch(/^photo-/);
    expect(name).toMatch(/\.png$/);
  });

  it('should generate unique names', () => {
    const name1 = createSafeFilename('jpg');
    const name2 = createSafeFilename('jpg');
    expect(name1).not.toBe(name2);
  });
});

describe('publicImagePath', () => {
  it('should encode special characters', () => {
    const path = publicImagePath('my gallery', 'pc', 'image 001.jpg');
    expect(path).toContain('my%20gallery');
    expect(path).toContain('image%20001.jpg');
  });
});