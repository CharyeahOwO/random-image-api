import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { config, deviceNames } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import { ensureCsrfToken } from '../middleware/csrf.js';
import { runUpload } from '../middleware/upload.js';
import {
  assertSafeDevice,
  assertSafeGallery,
  createSafeFilename,
  decodeUploadName,
  detectImageType,
  ensureDir,
  formatBytes,
  publicImagePath,
  safeJoin,
  sanitizeFilenameStem
} from '../utils/file.js';
import { escapeHtml, renderView } from '../utils/response.js';

function getGalleryDisplayName(gallery) {
  return gallery.label || gallery.name;
}

const loginLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: '登录尝试过于频繁，请稍后再试'
});

function statusBanner(req) {
  const message = req.session.flash;
  delete req.session.flash;
  if (!message) return '';
  return `<div class="notice ${escapeHtml(message.type || 'info')}">${escapeHtml(message.text)}</div>`;
}

function galleryOptions(galleries, selected = '') {
  if (galleries.length === 0) return '<option value="">请先创建图库</option>';
  return galleries
    .map((gallery) => {
      const active = gallery.name === selected ? 'selected' : '';
      const displayName = getGalleryDisplayName(gallery);
      return `<option value="${escapeHtml(gallery.name)}" ${active}>${escapeHtml(displayName)}</option>`;
    })
    .join('');
}

function targetGalleryOptions(galleries) {
  return galleries
    .map((gallery) => {
      const displayName = getGalleryDisplayName(gallery);
      return `<option value="${escapeHtml(gallery.name)}">${escapeHtml(displayName)}</option>`;
    })
    .join('');
}

function galleryCards(galleries, images, csrfToken, adminPath) {
  if (galleries.length === 0) {
    return '<div class="empty-state">还没有图库。</div>';
  }
  return galleries
    .map((gallery) => {
      const displayName = getGalleryDisplayName(gallery);
      const galleryPaths = images
        .filter((image) => image.gallery === gallery.name)
        .map((image) => image.path)
        .join('\n');
      const copyButton = gallery.total
        ? `<button type="button" class="copy-button gallery-copy-button" data-copy-paths="${escapeHtml(galleryPaths)}">复制全部真实 URL</button>`
        : '';
      const deleteButton =
        gallery.total === 0
          ? `<form method="post" action="${adminPath}/galleries/delete" class="inline-form confirm-form" data-confirm="确定删除空图库 ${escapeHtml(displayName)} 吗？">
              <input type="hidden" name="_csrf" value="${csrfToken}">
              <input type="hidden" name="gallery" value="${escapeHtml(gallery.name)}">
              <button class="danger" type="submit">删除空图库</button>
            </form>`
          : '<span class="muted">非空图库不可删除</span>';
      const labelHtml = gallery.label ? `<p class="muted">${escapeHtml(gallery.name)}</p>` : '';
      return `<article class="stat-card">
        <h3>${escapeHtml(displayName)}</h3>
        ${labelHtml}
        <p><strong>${gallery.total}</strong> 张图片</p>
        <p>PC：${gallery.pc} / Mobile：${gallery.mobile}</p>
        ${copyButton}
        ${deleteButton}
      </article>`;
    })
    .join('');
}

function recentImages(images) {
  if (images.length === 0) return '<div class="empty-state">暂无最近上传图片。</div>';
  return images
    .slice(0, 8)
    .map(
      (image) => `<article class="thumb-card compact">
        <img src="${escapeHtml(image.path)}" alt="${escapeHtml(image.filename)}" loading="lazy">
        <div>
          <strong>${escapeHtml(image.filename)}</strong>
          <span>${escapeHtml(image.gallery)} / ${escapeHtml(image.device)} / ${resolutionText(image)}</span>
        </div>
      </article>`
    )
    .join('');
}

function resolutionText(image) {
  return image.width && image.height ? `${image.width} x ${image.height}` : '未知分辨率';
}

function imageCards(images, csrfToken, adminPath) {
  if (images.length === 0) return '<div class="empty-state">当前筛选下没有图片。</div>';
  return images
    .map((image) => {
      const imagePath = publicImagePath(image.gallery, image.device, image.filename);
      const payload = escapeHtml(JSON.stringify({ gallery: image.gallery, device: image.device, filename: image.filename }));
      return `<article class="image-card image-card-${escapeHtml(image.device)}"
        data-filename="${escapeHtml(image.filename.toLowerCase())}"
        data-size="${image.size}"
        data-mtime="${image.mtimeMs}"
        data-width="${image.width || 0}"
        data-height="${image.height || 0}">
        <label class="image-select">
          <input type="checkbox" class="image-checkbox" name="selectedImage" value="${payload}" aria-label="选择 ${escapeHtml(image.filename)}">
        </label>
        <img src="${escapeHtml(image.path)}" alt="${escapeHtml(image.filename)}" loading="lazy">
        <div class="image-meta">
          <strong title="${escapeHtml(image.filename)}">${escapeHtml(image.filename)}</strong>
          <span>${escapeHtml(image.gallery)} / ${escapeHtml(image.device)}</span>
          <span>${resolutionText(image)}</span>
          <span>${formatBytes(image.size)}</span>
        </div>
        <div class="card-actions">
          <button type="button" class="copy-button" data-copy-path="${escapeHtml(imagePath)}">复制 URL</button>
          <form method="post" action="${adminPath}/images/delete" class="confirm-form" data-confirm="确定删除 ${escapeHtml(image.filename)} 吗？">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="gallery" value="${escapeHtml(image.gallery)}">
            <input type="hidden" name="device" value="${escapeHtml(image.device)}">
            <input type="hidden" name="filename" value="${escapeHtml(image.filename)}">
            <button class="danger" type="submit">删除</button>
          </form>
        </div>
      </article>`;
    })
    .join('');
}

function filterLinks(galleries, currentGallery, currentDevice, adminPath) {
  const total = galleries.reduce((sum, gallery) => sum + gallery.total, 0);
  const galleryLinks = [{ name: '全部图库', label: '', value: '', total }, ...galleries.map((gallery) => ({ name: gallery.name, label: gallery.label || '', value: gallery.name, total: gallery.total }))]
    .map((gallery) => {
      const value = gallery.value;
      const active = (currentGallery || '') === value ? 'active' : '';
      const url = `${adminPath}?gallery=${encodeURIComponent(value)}&device=${encodeURIComponent(currentDevice || 'all')}`;
      const displayName = gallery.label || gallery.name;
      return `<a class="${active}" href="${url}">${escapeHtml(displayName)}(${gallery.total})</a>`;
    })
    .join('');
  const source = currentGallery ? galleries.filter((gallery) => gallery.name === currentGallery) : galleries;
  const pcTotal = source.reduce((sum, gallery) => sum + gallery.pc, 0);
  const mobileTotal = source.reduce((sum, gallery) => sum + gallery.mobile, 0);
  const deviceItems = [
    { name: '全部类型', value: 'all', total: pcTotal + mobileTotal },
    { name: 'pc', value: 'pc', total: pcTotal },
    { name: 'mobile', value: 'mobile', total: mobileTotal }
  ];
  const deviceLinks = deviceItems
    .map((item) => {
      const active = (currentDevice || 'all') === item.value ? 'active' : '';
      const url = `${adminPath}?gallery=${encodeURIComponent(currentGallery || '')}&device=${item.value}`;
      return `<a class="${active}" href="${url}">${escapeHtml(item.name)}(${item.total})</a>`;
    })
    .join('');
  return `<div class="filter-row">${galleryLinks}</div><div class="filter-row">${deviceLinks}</div>`;
}

function batchToolbar(galleries, csrfToken, adminPath) {
  if (galleries.length === 0) return '';
  return `<form id="batchForm" method="post" action="${adminPath}/images/batch" class="batch-toolbar">
    <input type="hidden" name="_csrf" value="${csrfToken}">
    <div class="batch-primary">
      <label class="select-all-control">
        <input type="checkbox" id="selectAllImages">
        全选当前页
      </label>
      <span id="selectedCount">已选 0 张</span>
    </div>
    <div class="batch-controls">
      <select name="targetGallery" aria-label="目标图库" data-remember="batchTargetGallery">
        ${targetGalleryOptions(galleries)}
      </select>
      <select name="targetDevice" aria-label="目标类型" data-remember="batchTargetDevice">
        <option value="pc">pc</option>
        <option value="mobile">mobile</option>
      </select>
      <button type="submit" name="action" value="gallery">移动图库</button>
      <button type="submit" name="action" value="device">切换类型</button>
      <button type="submit" name="action" value="delete" class="danger">批量删除</button>
    </div>
  </form>`;
}

function parseSelectedImages(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => {
    const parsed = JSON.parse(item);
    return {
      gallery: String(parsed.gallery || ''),
      device: String(parsed.device || ''),
      filename: path.basename(String(parsed.filename || ''))
    };
  });
}

function uploadNameStem(mode, customName, originalName) {
  if (mode === 'custom') return sanitizeFilenameStem(customName);
  if (mode === 'original') return sanitizeFilenameStem(path.basename(originalName, path.extname(originalName)));
  return '';
}

function imageSectionRedirect(req) {
  const fallback = `${config.adminPath}#images`;
  const referer = req.get('referer');
  if (!referer) return fallback;
  try {
    const url = new URL(referer, config.publicBaseUrl);
    if (url.pathname !== config.adminPath) return fallback;
    return `${url.pathname}${url.search}#images`;
  } catch {
    return fallback;
  }
}

function wantsJson(req) {
  return req.get('x-requested-with') === 'XMLHttpRequest' || req.accepts(['html', 'json']) === 'json';
}

function sendUploadResult(req, res, status = 200) {
  if (wantsJson(req)) {
    return res.status(status).json({ redirect: config.adminPath });
  }
  return res.redirect(config.adminPath);
}

export function createAdminRouter(store) {
  const router = express.Router();

  router.get('/login', async (req, res, next) => {
    try {
      const html = await renderView('admin-login.html', {
        adminPath: escapeHtml(config.adminPath),
        csrfToken: ensureCsrfToken(req),
        message: statusBanner(req)
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (username === config.adminUsername && password === config.adminPassword) {
      req.session.regenerate((error) => {
        if (error) return res.status(500).send('登录失败');
        req.session.isAdmin = true;
        req.session.csrfToken = undefined;
        res.redirect(config.adminPath);
      });
      return;
    }
    req.session.flash = { type: 'error', text: '用户名或密码错误' };
    res.redirect(`${config.adminPath}/login`);
  });

  router.post('/logout', requireAdmin, (req, res) => {
    req.session.destroy(() => {
      res.redirect(`${config.adminPath}/login`);
    });
  });

  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      const stats = await store.getStats();
      const csrfToken = ensureCsrfToken(req);
      const currentGallery = req.query.gallery || '';
      const currentDevice = deviceNames.includes(req.query.device) ? req.query.device : 'all';
      const filtered = await store.listImages({
        gallery: currentGallery || undefined,
        device: currentDevice,
        limit: 200
      });
      const html = await renderView('admin-dashboard.html', {
        adminPath: escapeHtml(config.adminPath),
        csrfToken,
        message: statusBanner(req),
        imageCount: stats.imageCount,
        galleryCount: stats.galleryCount,
        galleryOptions: galleryOptions(stats.galleries, currentGallery),
        targetGalleryOptions: targetGalleryOptions(stats.galleries),
        galleryCards: galleryCards(stats.galleries, stats.images, csrfToken, config.adminPath),
        recentImages: recentImages(stats.images),
        imageCards: imageCards(filtered, csrfToken, config.adminPath),
        batchToolbar: batchToolbar(stats.galleries, csrfToken, config.adminPath),
        filterLinks: filterLinks(stats.galleries, currentGallery, currentDevice, config.adminPath),
        maxFileSizeMb: config.maxFileSizeMb,
        maxUploadFiles: config.maxUploadFiles
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      next(error);
    }
  });

  router.post('/galleries', requireAdmin, async (req, res) => {
    try {
      const gallery = String(req.body.gallery || '').trim();
      const label = String(req.body.label || '').trim();
      await store.ensureGallery(gallery, label);
      req.session.flash = { type: 'success', text: `图库 ${label || gallery} 已创建` };
    } catch (error) {
      req.session.flash = { type: 'error', text: error.message };
    }
    res.redirect(config.adminPath);
  });

  router.post('/galleries/delete', requireAdmin, async (req, res) => {
    try {
      await store.deleteEmptyGallery(String(req.body.gallery || ''));
      req.session.flash = { type: 'success', text: '图库已删除' };
    } catch (error) {
      req.session.flash = { type: 'error', text: error.message };
    }
    res.redirect(config.adminPath);
  });

  router.post('/upload', requireAdmin, runUpload, async (req, res) => {
    const results = { success: [], failed: [] };
    try {
      const gallery = String(req.body.gallery || '').trim();
      const device = String(req.body.device || '').trim();
      const nameMode = String(req.body.nameMode || 'auto');
      const customName = String(req.body.customName || '').trim();
      assertSafeGallery(gallery);
      assertSafeDevice(device);
      await store.ensureGallery(gallery);
      const targetDir = safeJoin(config.imageRoot, gallery, device);
      await ensureDir(targetDir);

      for (const file of req.files || []) {
        const originalName = decodeUploadName(file.originalname);
        let tempFilePath = file.path;
        try {
          const buffer = await fs.readFile(tempFilePath);
          const detected = await detectImageType(buffer, originalName);
          const filename = createSafeFilename(detected.ext, uploadNameStem(nameMode, customName, originalName));
          const target = safeJoin(targetDir, filename);
          await fs.writeFile(target, buffer, { flag: 'wx', mode: 0o644 });
          const note = detected.extensionCorrected ? `（已按真实格式保存为 .${detected.ext}）` : '';
          results.success.push(`${filename}${note}`);
        } catch (error) {
          results.failed.push(`${originalName}: ${error.message}`);
        } finally {
          await fs.unlink(tempFilePath).catch(() => {});
        }
      }

      await store.refresh();
      const messages = [];
      if (results.success.length) messages.push(`成功上传 ${results.success.length} 张：${results.success.join('、')}`);
      if (results.failed.length) messages.push(`失败 ${results.failed.length} 张：${results.failed.join('；')}`);
      req.session.flash = {
        type: results.failed.length ? 'error' : 'success',
        text: messages.join('。') || '没有收到上传文件'
      };
      return sendUploadResult(req, res);
    } catch (error) {
      req.session.flash = { type: 'error', text: error.message };
      return sendUploadResult(req, res, 400);
    }
  });

  router.post('/images/delete', requireAdmin, async (req, res) => {
    try {
      await store.deleteImage({
        gallery: String(req.body.gallery || ''),
        device: String(req.body.device || ''),
        filename: path.basename(String(req.body.filename || ''))
      });
      req.session.flash = { type: 'success', text: '图片已删除' };
    } catch (error) {
      req.session.flash = { type: 'error', text: error.message };
    }
    res.redirect(imageSectionRedirect(req));
  });

  router.post('/images/batch', requireAdmin, async (req, res) => {
    try {
      const action = String(req.body.action || '');
      const images = parseSelectedImages(req.body.images);
      if (images.length === 0) throw new Error('请先选择图片');

      if (action === 'delete') {
        const result = await store.batchDelete(images);
        req.session.flash = {
          type: result.failed.length ? 'error' : 'success',
          text: `已删除 ${result.success} 张${result.failed.length ? `，失败 ${result.failed.length} 张：${result.failed.join('；')}` : ''}`
        };
      } else if (action === 'gallery') {
        const targetGallery = String(req.body.targetGallery || '');
        assertSafeGallery(targetGallery);
        const result = await store.batchChangeGallery(images, targetGallery);
        req.session.flash = {
          type: result.failed.length ? 'error' : 'success',
          text: `已移动 ${result.success} 张${result.failed.length ? `，失败 ${result.failed.length} 张：${result.failed.join('；')}` : ''}`
        };
      } else if (action === 'device') {
        const targetDevice = String(req.body.targetDevice || '');
        assertSafeDevice(targetDevice);
        const result = await store.batchChangeDevice(images, targetDevice);
        req.session.flash = {
          type: result.failed.length ? 'error' : 'success',
          text: `已切换 ${result.success} 张${result.failed.length ? `，失败 ${result.failed.length} 张：${result.failed.join('；')}` : ''}`
        };
      } else {
        throw new Error('未知批量操作');
      }
    } catch (error) {
      req.session.flash = { type: 'error', text: error.message };
    }
    res.redirect(imageSectionRedirect(req));
  });

  return router;
}
