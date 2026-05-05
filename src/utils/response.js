import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const viewRoot = path.resolve(process.cwd(), 'views');

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function renderView(filename, data = {}) {
  const filePath = path.resolve(viewRoot, filename);
  let html = await fs.readFile(filePath, 'utf8');
  for (const [key, value] of Object.entries(data)) {
    html = html.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return html;
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function imageCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Location, Content-Length, Content-Type, Cache-Control');
}

export function imageApiHeaders(res) {
  imageCors(res);
  noStore(res);
}

export function imageApiMiddleware(req, res, next) {
  imageApiHeaders(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

export function staticImageHeaders(res) {
  imageCors(res);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}

export function requestBaseUrl(req) {
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  return host ? `${protocol}://${host}` : config.publicBaseUrl;
}

export function absoluteUrl(req, urlPath) {
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  const pathWithSlash = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  return `${requestBaseUrl(req)}${pathWithSlash}`;
}

export function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}
