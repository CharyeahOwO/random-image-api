import express from 'express';
import { config, deviceNames } from '../config.js';
import { publicImageJson } from '../imageStore.js';
import { jsonError, noStore, renderView, escapeHtml } from '../utils/response.js';
import { isValidDevice, isValidGalleryName } from '../utils/file.js';

function parseDevice(value, fallback = 'all') {
  if (!value) return fallback;
  if (value === 'all' || deviceNames.includes(value)) return value;
  return null;
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(parsed, 100);
}

function requestBaseUrl(req) {
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  return host ? `${protocol}://${host}` : config.publicBaseUrl;
}

function galleryRows(galleries) {
  if (galleries.length === 0) {
    return '<tr><td colspan="5">暂无图库，请在后台创建图库或手动放入图片目录。</td></tr>';
  }
  return galleries
    .map(
      (gallery) => {
        const displayName = gallery.label || gallery.name;
        const nameCell = gallery.label
          ? `${escapeHtml(displayName)}<br><span class="muted">${escapeHtml(gallery.name)}</span>`
          : escapeHtml(displayName);
        const g = escapeHtml(gallery.name);
        return `<tr>
          <td>${nameCell}</td>
          <td>${gallery.total}</td>
          <td>${gallery.pc}</td>
          <td>${gallery.mobile}</td>
          <td><button type="button" class="api-btn" data-gallery="${g}">查看 API</button></td>
        </tr>`;
      }
    )
    .join('');
}

export function createPublicRouter(store) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const stats = await store.getStats();
      const { image } = await store.randomImage({});
      const preview = image
        ? `<img src="${escapeHtml(image.path)}" alt="随机预览图">`
        : '<div class="empty-preview">暂无图片</div>';
      const html = await renderView('index.html', {
        imageCount: stats.imageCount,
        galleryCount: stats.galleryCount,
        galleryRows: galleryRows(stats.galleries),
        randomPreview: preview,
        adminPath: escapeHtml(config.adminPath)
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      next(error);
    }
  });

  router.get('/health', async (req, res, next) => {
    try {
      const stats = await store.getStats();
      res.json({
        status: 'ok',
        imageCount: stats.imageCount,
        galleryCount: stats.galleryCount,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  async function randomHandler(req, res, galleryFromPath) {
    noStore(res);
    const gallery = galleryFromPath || req.query.gallery;
    const device = parseDevice(req.query.device, 'all');
    const type = req.query.type || 'redirect';

    if (gallery && !isValidGalleryName(gallery)) {
      return jsonError(res, 400, '非法图库名');
    }
    if (!device) {
      return jsonError(res, 400, 'device 只能是 pc、mobile 或 all');
    }
    if (!['image', 'json', 'redirect'].includes(type)) {
      return jsonError(res, 400, 'type 只能是 image、json 或 redirect');
    }

    const { image, total } = await store.randomImage({ gallery, device });
    if (!image) {
      return jsonError(res, 404, '没有可用图片', { total: 0 });
    }

    if (type === 'json') {
      return res.json(publicImageJson(image, total, requestBaseUrl(req)));
    }
    if (type === 'redirect') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.redirect(302, image.path);
    }
    return res.sendFile(image.absolutePath, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }

  router.get('/api/random', (req, res, next) => {
    randomHandler(req, res).catch(next);
  });

  router.get('/api/galleries', async (req, res, next) => {
    try {
      const stats = await store.getStats();
      res.json({ galleries: stats.galleries });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/list', async (req, res, next) => {
    try {
      const gallery = req.query.gallery;
      const device = parseDevice(req.query.device, 'all');
      if (gallery && !isValidGalleryName(gallery)) {
        return jsonError(res, 400, '非法图库名');
      }
      if (!device) {
        return jsonError(res, 400, 'device 只能是 pc、mobile 或 all');
      }
      const limit = parseLimit(req.query.limit);
      const images = await store.listImages({ gallery, device, limit });
      res.json({
        total: images.length,
        limit,
        images: images.map((image) => publicImageJson(image, undefined, requestBaseUrl(req))).map(({ total, ...rest }) => rest)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/stats', async (req, res, next) => {
    try {
      const stats = await store.getStats();
      res.json({
        imageCount: stats.imageCount,
        galleryCount: stats.galleryCount,
        galleries: stats.galleries,
        generatedAt: stats.generatedAt
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/:gallery', (req, res, next) => {
    randomHandler(req, res, req.params.gallery).catch(next);
  });

  return router;
}
