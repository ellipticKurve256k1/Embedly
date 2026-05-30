import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  deleteProject,
  getDocumentsByProject,
  getProjectById,
  insertProject,
  listProjects,
  updateProject,
} from '../db.js';

const router = express.Router();

function normalizeProjectName(value) {
  return String(value ?? '').trim();
}

function normalizeProjectDescription(value) {
  const description = String(value ?? '').trim();
  return description || null;
}

function isUniqueConstraintError(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE'
    || String(error?.message ?? '').includes('UNIQUE constraint failed');
}

function getRequestUserId(request) {
  return String(request.userId ?? '').trim();
}

router.get('/', (request, response) => {
  response.json({ projects: listProjects(getRequestUserId(request)) });
});

router.post('/', (request, response) => {
  const name = normalizeProjectName(request.body?.name);

  if (!name) {
    response.status(400).json({ error: 'Project name is required.' });
    return;
  }

  try {
    const project = insertProject({
      id: uuidv4(),
      userId: getRequestUserId(request),
      name,
      description: normalizeProjectDescription(request.body?.description),
      createdAt: new Date().toISOString(),
    });

    response.status(201).json({ project });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: 'A project with this name already exists.' });
      return;
    }

    throw error;
  }
});

router.patch('/:id', (request, response) => {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(request.body ?? {}, 'name')) {
    const name = normalizeProjectName(request.body.name);

    if (!name) {
      response.status(400).json({ error: 'Project name is required.' });
      return;
    }

    updates.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(request.body ?? {}, 'description')) {
    updates.description = normalizeProjectDescription(request.body.description);
  }

  if (Object.keys(updates).length === 0) {
    response.status(400).json({ error: 'Project name or description is required.' });
    return;
  }

  try {
    const project = updateProject(getRequestUserId(request), request.params.id, updates);

    if (!project) {
      response.status(404).json({ error: 'Project not found.' });
      return;
    }

    response.json({ project });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      response.status(409).json({ error: 'A project with this name already exists.' });
      return;
    }

    throw error;
  }
});

router.delete('/:id', (request, response) => {
  const deleted = deleteProject(getRequestUserId(request), request.params.id);

  if (!deleted) {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  response.json({ success: true });
});

router.get('/:id/documents', (request, response) => {
  const project = getProjectById(getRequestUserId(request), request.params.id);

  if (!project) {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  response.json({ documents: getDocumentsByProject(getRequestUserId(request), project.id) });
});

export default router;
