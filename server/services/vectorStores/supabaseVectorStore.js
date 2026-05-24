import { toPublicVectorChunk } from './publicChunk.js';

const DEFAULT_TABLE = 'embeddly_chunks';
const DEFAULT_DIMENSIONS = 768;
const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeTableName(value) {
  const table = String(value ?? DEFAULT_TABLE).trim() || DEFAULT_TABLE;

  if (!TABLE_NAME_PATTERN.test(table)) {
    throw new Error('Supabase table name must contain only letters, numbers, and underscores.');
  }

  return table;
}

function normalizeDimensions(value) {
  const dimensions = Number(value ?? DEFAULT_DIMENSIONS);

  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 4096) {
    throw new Error('Supabase vector dimensions must be an integer between 1 and 4096.');
  }

  return dimensions;
}

function normalizeMatchThreshold(value) {
  const threshold = Number(value ?? 0);

  if (!Number.isFinite(threshold)) {
    return 0;
  }

  return Math.max(0, Math.min(1, threshold));
}

function normalizeProjectUrl(value) {
  const projectUrl = String(value ?? '').trim().replace(/\/+$/, '');

  if (!projectUrl) {
    throw new Error('Supabase project URL is required.');
  }

  try {
    const url = new URL(projectUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error();
    }
  } catch {
    throw new Error('Supabase project URL must be a valid http(s) URL.');
  }

  return projectUrl;
}

async function createDefaultClient(projectUrl, serviceRoleKey) {
  let module;

  try {
    module = await import('@supabase/supabase-js');
  } catch {
    throw new Error('Supabase support requires @supabase/supabase-js. Run npm install before using Supabase VectorDB.');
  }

  return module.createClient(projectUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function requireServiceRoleKey(value) {
  const serviceRoleKey = String(value ?? '').trim();

  if (!serviceRoleKey) {
    throw new Error('Supabase service role key is required.');
  }

  return serviceRoleKey;
}

function normalizeRpcRow(row) {
  return {
    chunk_id: row.chunk_id,
    chunk_index: row.chunk_index,
    content: row.content,
    token_count: row.token_count,
    document_id: row.document_id,
    document_name: row.document_name,
    document_type: row.document_type,
    document_size: row.document_size,
    project_id: row.project_id ?? null,
    project_name: row.project_name ?? null,
    uploaded_at: row.uploaded_at,
    total_chunks: row.total_chunks,
    embedding_model: row.embedding_model,
  };
}

export function createSupabaseVectorStore(setup = {}, { clientFactory = createDefaultClient } = {}) {
  const projectUrl = normalizeProjectUrl(setup.projectUrl);
  const serviceRoleKey = requireServiceRoleKey(setup.serviceRoleKey);
  const table = normalizeTableName(setup.table);
  const dimensions = normalizeDimensions(setup.dimensions);
  const matchThreshold = normalizeMatchThreshold(setup.matchThreshold);
  let clientPromise = null;

  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = Promise.resolve(clientFactory(projectUrl, serviceRoleKey));
    }

    return clientPromise;
  };

  return {
    provider: 'supabase',
    table,
    dimensions,
    matchThreshold,

    async testConnection() {
      const client = await getClient();
      const { error } = await client.from(table).select('id').limit(1);

      if (error) {
        throw new Error(`Unable to query Supabase table "${table}": ${error.message}`);
      }

      return true;
    },

    async clearDocumentIndex(documentId) {
      const client = await getClient();
      const { error } = await client.from(table).delete().eq('document_id', documentId);

      if (error) {
        throw new Error(`Unable to clear Supabase vectors for document: ${error.message}`);
      }
    },

    async indexChunk({ document, chunk, vector, model }) {
      const vectorValues = Array.from(vector ?? []);

      if (vectorValues.length !== dimensions) {
        throw new Error(
          `Supabase vector dimension mismatch: expected ${dimensions}, received ${vectorValues.length}.`,
        );
      }

      if (!document?.id || !chunk?.id) {
        throw new Error('Document and chunk ids are required for Supabase indexing.');
      }

      const client = await getClient();
      const { error } = await client.from(table).insert({
        id: `${document.id}:${chunk.id}:${model}`,
        document_id: document.id,
        chunk_id: chunk.id,
        chunk_index: chunk.idx,
        content: chunk.content,
        token_count: chunk.tokenCount,
        document_name: document.filename,
        document_type: document.mime_type,
        document_size: document.size_bytes,
        project_id: document.project_id ?? null,
        project_name: document.project_name ?? null,
        uploaded_at: document.created_at,
        total_chunks: document.chunk_count,
        embedding_model: model,
        embedding: vectorValues,
      });

      if (error) {
        throw new Error(`Unable to insert Supabase vector row: ${error.message}`);
      }
    },

    async retrieveChunks({ queryVector, model, projectId = null, limit }) {
      const vectorValues = Array.from(queryVector ?? []);

      if (vectorValues.length !== dimensions) {
        throw new Error(
          `Supabase query vector dimension mismatch: expected ${dimensions}, received ${vectorValues.length}.`,
        );
      }

      const client = await getClient();
      const { data, error } = await client.rpc('match_embeddly_chunks', {
        query_embedding: vectorValues,
        match_embedding_model: model,
        match_project_id: projectId,
        match_threshold: matchThreshold,
        match_count: limit,
      });

      if (error) {
        throw new Error(`Unable to retrieve Supabase vector matches: ${error.message}`);
      }

      return (Array.isArray(data) ? data : []).map((row) => (
        toPublicVectorChunk(normalizeRpcRow(row), Number(row.score ?? 0))
      ));
    },
  };
}
