import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';

const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');

export function uploadsPath(...segments) {
  return path.join(UPLOADS_ROOT, ...segments);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

ensureDir(uploadsPath('images'));
ensureDir(uploadsPath('proposals'));

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_DOC_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

function extFor(mimetype, originalname) {
  const fromName = path.extname(originalname || '');
  if (fromName) return fromName;
  const guess = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  return guess[mimetype] || '';
}

export const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsPath('images'),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + extFor(file.mimetype, file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_IMAGE_TYPES.has(file.mimetype)),
});

export const docUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsPath('proposals'),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (extFor(file.mimetype, file.originalname) || '.docx')),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_DOC_TYPES.has(file.mimetype) || (file.originalname || '').toLowerCase().endsWith('.docx')),
});

export { UPLOADS_ROOT };
