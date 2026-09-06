import { Router } from 'express';
import { imageUpload } from '../lib/storage.js';

const router = Router();

router.post('/', imageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded (or unsupported type)' });
  res.status(201).json({ url: `/uploads/images/${req.file.filename}` });
});

export default router;
