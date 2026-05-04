import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

const tempDir = path.join(process.cwd(), '.tmp-uploads');
fs.mkdirSync(tempDir, { recursive: true });

export const uploadImages = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
    files: config.maxUploadFiles
  }
}).array('images', config.maxUploadFiles);

export function runUpload(req, res, next) {
  uploadImages(req, res, (error) => {
    if (!error) return next();
    if (req.files) {
      for (const file of req.files) {
        fs.unlink(file.path, () => {});
      }
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send(`单文件大小不能超过 ${config.maxFileSizeMb}MB`);
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).send(`每次最多上传 ${config.maxUploadFiles} 张图片`);
    }
    return res.status(400).send(error.message || '上传失败');
  });
}
