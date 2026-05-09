# Embeddly — Database & Backend Plan

## Overview

Add a Node.js/Express backend with SQLite (`better-sqlite3`) to handle file upload, text chunking, embedding via Ollama, and semantic search.

---

## New Dependencies

Install via `npm install` (you will run this):

```
express better-sqlite3 multer cors uuid pdf-parse
```

---

## Directory Structure

```
embedly/
├── server/
│   ├── index.js               # Express entry point, port 3001
│   ├── db.js                  # SQLite initialization + schema
│   ├── uploads/               # Uploaded files (gitignored)
│   ├── routes/
│   │   ├── upload.js          # POST /api/upload
│   │   ├── documents.js       # GET /api/documents, DELETE /api/documents/:id
│   │   ├── embed.js           # POST /api/embed, GET /api/jobs
│   │   └── search.js          # GET /api/search?q=...
│   └── services/
│       ├── parser.js          # PDF (pdf-parse) / TXT / MD / CSV → raw text
│       ├── chunker.js         # Paragraph split → array of chunks
│       └── embedder.js        # Chunk → POST /api/embed → save vector to DB
├── src/
│   ├── components/
│   │   └── UploadBox.jsx      # Updated: real embedFile/embedAllFiles calls
│   └── lib/
│       └── api.js             # New: fetch helpers for backend
└── package.json
```

---

## Database Schema

Four tables stored in `server/embedly.db`.

### 1. documents

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| filename | TEXT | Original file name |
| mime_type | TEXT | e.g., application/pdf |
| size_bytes | INTEGER | File size in bytes |
| status | TEXT | pending, parsing, chunking, embedding, completed, failed |
| error | TEXT | Error message if failed |
| chunk_count | INTEGER | Number of chunks created |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### 2. chunks

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| document_id | TEXT | Foreign key to documents.id |
| idx | INTEGER | Chunk index within the document |
| content | TEXT | Raw text content |
| token_count | INTEGER | Approximate token count |
| created_at | TEXT | ISO timestamp |

### 3. embeddings

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| chunk_id | TEXT | Foreign key to chunks.id |
| vector | BLOB | Float32Array of embedding values |
| model | TEXT | Embedding model used, e.g., nomic-embed-text |
| dimensions | INTEGER | Embedding dimensions, e.g., 768 |
| created_at | TEXT | ISO timestamp |

### 4. embedding_jobs

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| document_id | TEXT | Foreign key to documents.id |
| status | TEXT | pending, running, completed, failed |
| model | TEXT | Embedding model used |
| total_chunks | INTEGER | Total chunks to embed |
| processed_chunks | INTEGER | Chunks completed so far |
| error | TEXT | Error message if failed |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

---

## API Endpoints

| Method | Route | Purpose | Request Body | Response |
|---|---|---|---|---|
| POST | /api/upload | Upload files | multipart/form-data | `{ documents: [{ id, filename, status }] }` |
| GET | /api/documents | List all documents | — | `{ documents: [...] }` |
| GET | /api/documents/:id | Get single document | — | `{ document: {...}, chunks: [...] }` |
| DELETE | /api/documents/:id | Delete document + chunks + embeddings | — | `{ success: true }` |
| POST | /api/embed | Start embedding job | `{ documentIds: [...] }` | `{ jobs: [...] }` |
| GET | /api/jobs | List all embedding jobs | — | `{ jobs: [...] }` |
| GET | /api/jobs/:id | Get job status | — | `{ job: {...} }` |
| GET | /api/search?q=... | Semantic search | — | `{ results: [{ chunk, document, score }] }` |

---

## Pipeline: Upload → Chunk → Embed → Search

### 1. Upload Flow

```
User drops files
       ↓
POST /api/upload (multipart/form-data)
       ↓
files saved to server/uploads/
       ↓
documents table row created (status: "pending")
       ↓
Returns list of created documents to frontend
```

### 2. Embedding Flow

```
User clicks "Embed" on a document
       ↓
POST /api/embed with { documentIds: [id] }
       ↓
Update embedding_jobs row (status: "running")
       ↓
Parser (services/parser.js)
  - PDF  → pdf-parse → raw text
  - TXT  → read raw text
  - MD   → read raw text
  - CSV  → csv-parse → rows as text
       ↓
Chunker (services/chunker.js)
  - Split content by paragraph (double newline)
  - Filter out empty chunks
  - Each chunk → chunk table
       ↓
Embedder (services/embedder.js)
  - For each chunk:
    - POST to Ollama /api/embed (model from setup)
    - Save vector BLOB to embeddings table
    - Increment processed_chunks
       ↓
Update document status: "completed" (or "failed" on error)
Update job status: "completed"
       ↓
Frontend polls GET /api/jobs to show progress
```

### 3. Search Flow

```
User types query in search box
       ↓
GET /api/search?q=query
       ↓
Embed query via Ollama POST /api/embed
       ↓
Load all embeddings from DB (or filter by recent docs)
       ↓
Compute cosine similarity in JavaScript:
  - dot(queryVector, chunkVector)
  - normalize both
  - score = dot / (||query|| * ||chunk||)
       ↓
Sort by score descending, take top 10
       ↓
Return results:
{
  results: [
    {
      chunkId: "...",
      content: "...",
      documentId: "...",
      documentName: "report.pdf",
      score: 0.87
    },
    ...
  ]
}
```

---

## Chunking Strategy

**Paragraph-based split** (chosen by user).

- Split on double newlines (`\n\n`) and markdown headings (`#`, `##`, `###`)
- Filter out empty chunks
- No token counting at this stage — chunk size varies by paragraph length
- Preserve paragraph boundaries for semantic coherence

---

## Chunking Configuration (Frontend Settings)

Users can also configure chunking parameters in the Settings page under the **Retrieval** tab.

### Storage Key

Add to `src/lib/storage.js`:

```javascript
export const CHUNKING_CONFIG_STORAGE_KEY = 'embeddly.chunkingConfig';

export function readSavedChunkingConfig() {
  return readSavedSetup(CHUNKING_CONFIG_STORAGE_KEY) ?? {
    strategy: 'paragraph',     // 'paragraph' | 'fixed'
    maxChunkSize: 1000,       // characters
    minChunkSize: 50,         // characters (discard smaller)
    overlap: 100,             // characters (overlap between chunks)
  };
}
```

### Settings UI

- **Tab**: Uncomment "Retrieval" tab in `settingTabs` (line 31 of SettingsPage.jsx)
- **Panel**: `<RetrievalSettingsPanel>` — a settings section with:

| Control | Type | Default | Description |
|---|---|---|---|
| Split strategy | Dropdown | paragraph | Choose: Paragraph (semantic boundaries) or Fixed (character count) |
| Max chunk size | Number input | 1000 | Characters per chunk (shown when strategy = fixed) |
| Min chunk size | Number input | 50 | Discard chunks below this length |
| Overlap | Range slider | 100 | Characters to overlap between adjacent chunks |

- **Save**: Uses existing `SaveSettingsButton` component
- **Design**: Matches glassmorphism style of other panels

### API Change

The `POST /api/embed` request now includes the chunking config:

```javascript
// Frontend sends:
POST /api/embed
{
  documentIds: [...],
  chunking: {
    strategy: 'paragraph',
    maxChunkSize: 1000,
    minChunkSize: 50,
    overlap: 100
  }
}
```

The server reads this from the request body and passes it to the chunker service.

### Server-side Chunker Update

The chunker service accepts a config object:

```javascript
// services/chunker.js
function chunkText(text, config = {}) {
  const {
    strategy = 'paragraph',
    maxChunkSize = 1000,
    minChunkSize = 50,
    overlap = 100,
  } = config;

  if (strategy === 'fixed') {
    return chunkByFixedSize(text, maxChunkSize, minChunkSize, overlap);
  }
  return chunkByParagraph(text, minChunkSize);
}
```

---

## Running the Project

Two terminal windows required:

```bash
# Terminal 1 — Backend
node server/index.js
# → Express server running on http://localhost:3001

# Terminal 2 — Frontend
npm run dev
# → Vite dev server running on http://localhost:5173
```

---

## Frontend Integration

### New File: `src/lib/api.js`

```javascript
const API_BASE = 'http://localhost:3001/api';

export async function uploadFiles(files) {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function getDocuments() {
  const res = await fetch(`${API_BASE}/documents`);
  return res.json();
}

export async function deleteDocument(id) {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function startEmbedding(documentIds) {
  const res = await fetch(`${API_BASE}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds }),
  });
  return res.json();
}

export async function getJobs() {
  const res = await fetch(`${API_BASE}/jobs`);
  return res.json();
}

export async function searchQuery(query) {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
  return res.json();
}
```

### Update: `src/components/UploadBox.jsx`

Replace the `embedFile` and `embedAllFiles` stubs with real API calls:

```javascript
import {
  uploadFiles,
  startEmbedding,
  getDocuments,
  deleteDocument,
} from '../lib/api';

// In handleFileSelect: use uploadFiles()
// In embedFile: use startEmbedding(docId)
// In embedAllFiles: use startEmbedding(allDocIds)
```

### Update: `src/App.jsx` (Future)

Wire the search input to `api.searchQuery()` to display results.

---

## Design Decisions

1. **Vectors as BLOBs** — SQLite has no native vector type. Store Float32Array as BLOB.

2. **Cosine similarity in JS** — Load embeddings from DB, compute similarity in-memory. Works for <10K chunks. If scale grows, add `sqlite-vec` extension or migrate to pgvector.

3. **Jobs are synchronous** — Process one document at a time, sequential chunks. Frontend polls job status.

4. **Files stored in `server/uploads/`** — Inside the project, self-contained. Add `server/uploads/` to `.gitignore`.

5. **No authentication** — Local-first, localhost-only. Skip auth for now.

6. **Plain JavaScript** — No TypeScript on backend to match frontend and avoid extra build steps.

---

## Files to Create

| File | Purpose |
|---|---|
| `server/index.js` | Express app, middleware, router setup |
| `server/db.js` | better-sqlite3 init, schema creation, migrations |
| `server/uploads/` | Directory for uploaded files (gitignore) |
| `server/routes/upload.js` | POST /api/upload |
| `server/routes/documents.js` | GET/DELETE /api/documents |
| `server/routes/embed.js` | POST /api/embed, GET /api/jobs |
| `server/routes/search.js` | GET /api/search |
| `server/services/parser.js` | PDF/TXT/MD/CSV → raw text |
| `server/services/chunker.js` | Text → paragraph chunks |
| `server/services/embedder.js` | Chunk → Ollama embed → save |
| `src/lib/api.js` | Frontend API wrappers |
| `.gitignore` | Add `server/uploads/`, `server/*.db` |

---

## Next Steps After Implementation

1. Wire `UploadBox` to call `api.uploadFiles()` and `api.startEmbedding()`
2. Show loading state on embed buttons while job runs
3. Poll `api.getJobs()` in a `useEffect` to display progress
4. Wire `App.jsx` search input to `api.searchQuery()`
5. Display search results in a UI component (future)

---

## Notes

- Ollama runs on `http://localhost:11434` (separate from Express on 3001)
- Frontend stays on Vite port 5173, calls Express on 3001
- SQLite DB file: `server/embeddly.db`
- All timestamps in ISO format (`new Date().toISOString()`)
