export function toPublicVectorChunk(row, score) {
  return {
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    documentId: row.document_id,
    documentName: row.document_name,
    documentType: row.document_type,
    documentSize: row.document_size,
    projectId: row.project_id ?? null,
    projectName: row.project_name ?? null,
    uploadedAt: row.uploaded_at,
    totalChunks: row.total_chunks,
    tokenCount: row.token_count,
    embeddingModel: row.embedding_model,
    previousChunk: null,
    nextChunk: null,
    score,
  };
}
