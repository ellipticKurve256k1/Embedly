import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { insertDocument, nowIso, toPublicDocument, UPLOAD_DIR } from '../db.js';

const router = express.Router();

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.csv']);
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
]);

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname);
    callback(null, `${uuidv4()}${extension}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (ACCEPTED_MIME_TYPES.has(file.mimetype) || ACCEPTED_EXTENSIONS.has(extension)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Unsupported file type: ${file.originalname}`));
  },
});

router.post('/', upload.array('files'), (request, response) => {
  const files = request.files ?? [];
  const createdAt = nowIso();
  const documents = files.map((file) => {
    const id = uuidv4();
    const document = {
      id,
      filename: file.originalname,
      storedFilename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      status: 'pending',
      error: null,
      chunkCount: 0,
      createdAt,
      updatedAt: createdAt,
    };

    insertDocument(document);

    return toPublicDocument({
      id,
      filename: document.filename,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
      status: document.status,
      error: document.error,
      chunk_count: document.chunkCount,
      created_at: document.createdAt,
      updated_at: document.updatedAt,
    });
  });

  response.json({ documents });
});

export default router;
