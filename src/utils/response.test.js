import { describe, expect, it, vi } from 'vitest';
import {
  absoluteUrl,
  imageApiMiddleware,
  imageCors,
  noStore,
  requestBaseUrl,
  staticImageHeaders
} from './response.js';

function mockResponse() {
  const headers = new Map();
  return {
    headers,
    setHeader: vi.fn((name, value) => headers.set(name.toLowerCase(), value)),
    sendStatus: vi.fn()
  };
}

function mockRequest(headers = {}, protocol = 'http') {
  return {
    protocol,
    get(name) {
      return headers[name.toLowerCase()];
    }
  };
}

describe('response image headers', () => {
  it('sets CORS headers for image responses', () => {
    const res = mockResponse();

    imageCors(res);

    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
    expect(res.headers.get('access-control-expose-headers')).toContain('Location');
  });

  it('sets no-cache headers for API responses', () => {
    const res = mockResponse();

    noStore(res);

    expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(res.headers.get('pragma')).toBe('no-cache');
    expect(res.headers.get('expires')).toBe('0');
  });

  it('keeps static images cacheable while allowing cross-origin use', () => {
    const res = mockResponse();

    staticImageHeaders(res);

    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('answers API preflight with shared image API headers', () => {
    const req = { method: 'OPTIONS' };
    const res = mockResponse();
    const next = vi.fn();

    imageApiMiddleware(req, res, next);

    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(res.sendStatus).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('response URL helpers', () => {
  it('builds base URL from forwarded headers', () => {
    const req = mockRequest({
      'x-forwarded-host': 'img.example.com',
      'x-forwarded-proto': 'https'
    });

    expect(requestBaseUrl(req)).toBe('https://img.example.com');
  });

  it('converts image paths to absolute URLs for redirects', () => {
    const req = mockRequest({ host: 'localhost:3000' });

    expect(absoluteUrl(req, '/image/images/anime/pc/001.jpg')).toBe('http://localhost:3000/image/images/anime/pc/001.jpg');
  });
});
