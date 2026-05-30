import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  getProjectById,
  getUploadPath,
  insertDocument,
  nowIso,
  toPublicDocument,
  UPLOAD_DIR,
} from '../db.js';
import { normalizeFilename } from '../lib/filename.js';

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

async function removeUploadedFiles(files) {
  await Promise.all((files ?? []).map(async (file) => {
    try {
      await unlink(getUploadPath(file.filename));
    } catch {
      // Best-effort cleanup for files rejected after multer writes them.
    }
  }));
}

function normalizeProjectId(value) {
  const projectId = String(value ?? '').trim();
  return projectId || null;
}

function getRequestUserId(request) {
  return String(request.userId ?? '').trim();
}

router.post('/', upload.array('files'), async (request, response) => {
  const files = request.files ?? [];
  const projectId = normalizeProjectId(request.body?.projectId);
  const userId = getRequestUserId(request);

  if (projectId && !getProjectById(userId, projectId)) {
    await removeUploadedFiles(files);
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  const createdAt = nowIso();
  const documents = files.map((file) => {
    const id = uuidv4();
      const document = {
        id,
        userId,
        filename: normalizeFilename(file.originalname),
      storedFilename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      status: 'pending',
      error: null,
      chunkCount: 0,
      projectId,
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
      project_id: document.projectId,
      created_at: document.createdAt,
      updated_at: document.updatedAt,
    });
  });

  response.json({ documents });
});

export default router;
