# Embeddly Codebase

Last updated: 2026-05-11

## 1. Overview

Embeddly is a local-first RAG knowledge search system. Users upload private documents, move files into a knowledge base, embed parsed chunks, search semantically, and chat with retrieved context. Generation can use local Ollama models or an OpenAI-compatible external API. Settings are persisted server-side in SQLite, with API keys encrypted at rest.

## 2. Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend framework | React |
| Build tool | Vite |
| Backend framework | Express 5 |
| Database | SQLite through `better-sqlite3` |
| File upload | `multer` |
| Document parsing | Local parser service with PDF, CSV, text, and Markdown support |
| Embedding provider | Ollama embeddings API |
| LLM provider | Ollama chat API or OpenAI-compatible `/v1/chat/completions` |
| Icons | `lucide-react` |
| Tests | Node built-in test runner |

## 3. Directory Structure

```text
embedly/
  src/                         # Frontend React application
    components/                # React components and co-located CSS
    lib/                       # API client and settings cache helpers
    App.jsx                    # Root component, hash routing, mode switching
    main.jsx                   # React entry point
    index.css                  # Global base styles
    App.css                    # App shell and search-stage styles
  server/                      # Backend Express application
    routes/                    # API route handlers
    services/                  # Business logic for RAG, LLM, settings
    lib/                       # Server utilities and tests
    db.js                      # SQLite schema and database helpers
    index.js                   # Server entry point
  references/                  # Reference images and proposals
  DESIGN.md                    # Visual design system
  CODEBASE.md                  # Architecture and codebase guide
  Agents.md                    # Agent instructions
  Embedding-Plan.md            # Embedding implementation notes
  package.json                 # Scripts and dependencies
  vite.config.js               # Vite configuration
```

Generated or local runtime data:

| Path | Purpose |
|------|---------|
| `server/embedly.db` | SQLite database, ignored by git. |
| `server/uploads/` | Uploaded file storage, ignored by git. |
| `server/.embeddly/key` | Settings encryption key, ignored by git. |
| `dist/` | Vite build output, ignored by git. |

## 4. Frontend Architecture

- `src/main.jsx` mounts `<App />` into `#root`.
- `src/App.jsx` uses hash routing: `#/` for the main app and `#settings` for settings.
- Mode switching is local React state: chat, upload, and search.
- `src/lib/api.js` wraps backend calls and SSE parsing.
- `src/lib/storage.js` loads settings from `/api/settings`, caches them in memory, migrates old Embeddly localStorage settings, and exposes synchronous read helpers.
- There is no external frontend state library.

Component hierarchy:

```text
App
  SettingsPage (hash: #settings)
    EmbeddingSettingsPanel
    GenerationSettingsPanel
    RetrievalSettingsPanel
    VectorDbSettingsPanel
  Main view (hash: #/)
    ModeTabs
    ModelStatusBar
    ChatPanel (mode: chat)
      MessageList
      SourcesPanel
      ChatInput
    UploadBox (mode: upload)
      FileDropZone
      TransferPane (available files)
      TransferControls
      TransferPane (knowledge base)
      EmbedActionBar
    SearchResults (mode: search after query)
      OntologyMap
      ResultPanel
```

## 5. Backend Architecture

- `server/index.js` configures CORS, JSON parsing, health check, route mounting, and final error handling.
- Route files validate request shape, adapt request/response formats, and call services.
- Services contain parsing, chunking, embedding, retrieval, LLM, and settings logic.
- `server/db.js` creates schema on startup and exports shared helpers.

Request flow:

```text
HTTP request -> route handler -> service layer -> SQLite or provider API -> response
```

Long-running embedding work currently runs inside the `/api/embed` request path while updating `embedding_jobs`. Chat uses SSE to stream context, tokens, and completion metadata back to the browser.

## 6. Database Schema

| Table | Purpose |
|-------|---------|
| `documents` | Uploaded files, stored filenames, MIME type, size, status, error, chunk count, timestamps. |
| `chunks` | Parsed document chunks with document id, chunk index, content, token count, timestamp. |
| `embeddings` | Vector BLOBs linked to chunks, with model, dimensions, timestamp. |
| `embedding_jobs` | Per-document embedding status, model, total chunks, processed chunks, error, timestamps. |
| `settings` | Key-value settings rows with JSON value, encryption flag, and update timestamp. |

Important relationships:

- `chunks.document_id` references `documents.id` with cascade delete.
- `embeddings.chunk_id` references `chunks.id` with cascade delete.
- `embedding_jobs.document_id` references `documents.id` with cascade delete.

Settings keys:

| Key | Public Shape | Sensitive |
|-----|--------------|-----------|
| `llm.setup` | `llm` | Yes, when `apiKey` is present. |
| `embedding.setup` | `embedding` | No |
| `chunking.config` | `chunking` | No |
| `vector_db.setup` | `vectorDb` | No |

## 7. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Server health check. |
| `/api/upload` | POST | Upload files and create document rows. |
| `/api/documents` | GET | List documents. |
| `/api/documents/:id` | GET | Fetch one document with chunks. |
| `/api/documents/:id` | DELETE | Delete a document, uploaded file, chunks, embeddings, and jobs. |
| `/api/embed` | POST | Parse, chunk, embed, and index selected documents. |
| `/api/jobs` | GET | List embedding jobs. |
| `/api/jobs/:id` | GET | Fetch one embedding job. |
| `/api/search` | GET | Run semantic search for `q`, optionally with `model`. |
| `/api/chat` | POST | Stream RAG chat response over SSE. |
| `/api/settings` | GET | Return all persisted settings with API keys masked. |
| `/api/settings/:key` | GET | Return one public setting key. |
| `/api/settings` | POST | Upsert settings, encrypting API-key settings. |
| `/api/settings/:key` | DELETE | Delete one public setting key. |

## 8. Data Flow

Upload and embedding:

```text
User selects files
  -> POST /api/upload
  -> files are written to server/uploads
  -> documents rows are created with pending status
  -> user moves files into Knowledge Base pane
  -> POST /api/embed
  -> parser extracts text
  -> chunker splits content
  -> embedder calls Ollama
  -> chunks and embeddings are stored in SQLite
  -> embedding_jobs and documents statuses update
```

Search:

```text
User submits query
  -> frontend reads cached embedding model
  -> GET /api/search?q=...
  -> retrieval embeds query
  -> vectors are compared in memory
  -> ranked chunks return to SearchResults
```

Chat:

```text
User sends message
  -> POST /api/chat
  -> server resolves saved or request-provided LLM settings
  -> retrieval finds context chunks
  -> follow-up queries may be rewritten with recent conversation
  -> messages are built with source instructions
  -> LLM response streams as SSE tokens
  -> frontend updates MessageList and SourcesPanel
```

Settings:

```text
App starts
  -> GET /api/settings
  -> old localStorage settings migrate if server values are missing
  -> settings cache updates in memory
  -> SettingsPage saves through POST /api/settings
  -> API keys are encrypted in SQLite and masked in responses
```

## 9. Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `App` | `src/App.jsx` | Root routing, mode switching, settings initialization. |
| `ModeTabs` | `src/components/ModeTabs.jsx` | Switches between chat, upload, and search modes. |
| `ModelStatusBar` | `src/components/ModelStatusBar.jsx` | Shows configured embedding, generation, and vector DB state. |
| `ChatPanel` | `src/components/ChatPanel.jsx` | Owns chat conversation state and streaming lifecycle. |
| `MessageList` | `src/components/MessageList.jsx` | Renders user and assistant messages. |
| `SourcesPanel` | `src/components/SourcesPanel.jsx` | Shows retrieved chunks and rewrite status. |
| `ChatInput` | `src/components/ChatInput.jsx` | Collects and submits chat prompts. |
| `UploadBox` | `src/components/UploadBox.jsx` | Owns upload, transfer, selection, and job polling state. |
| `FileDropZone` | `src/components/FileDropZone.jsx` | Drag-and-drop upload control. |
| `TransferPane` | `src/components/TransferPane.jsx` | Available or knowledge-base file list. |
| `FileTransferRow` | `src/components/FileTransferRow.jsx` | File row with status and selection. |
| `EmbedActionBar` | `src/components/EmbedActionBar.jsx` | Starts embedding for selected knowledge-base files. |
| `SettingsPage` | `src/components/SettingsPage.jsx` | Settings tabs, provider selection, forms, saves. |
| `SearchResults` | `src/components/SearchResults.jsx` | Search result list, map, and selected result state. |
| `OntologyMap` | `src/components/OntologyMap.jsx` | Node-link visualization for search results. |
| `ResultPanel` | `src/components/ResultPanel.jsx` | Selected result detail preview. |

## 10. Services Layer

| Service | File | Purpose |
|---------|------|---------|
| Parser | `server/services/parser.js` | Extract text from PDF, CSV, text, and Markdown uploads. |
| Chunker | `server/services/chunker.js` | Split text into recursive, paragraph, or fixed chunks. |
| Embedder | `server/services/embedder.js` | Generate embedding vectors through Ollama. |
| Retrieval | `server/services/retrieval.js` | Embed queries and rank stored vectors by similarity. |
| LLM | `server/services/llm.js` | Build prompts, rewrite follow-up queries, stream chat responses. |
| Settings | `server/services/settings.js` | Persist settings, encrypt API keys, mask public responses. |

Server utilities:

| Utility | File | Purpose |
|---------|------|---------|
| Filename normalization | `server/lib/filename.js` | Normalize uploaded filenames and prevent unsafe names. |
| Filename tests | `server/lib/filename.test.js` | Node test coverage for filename normalization. |

## 11. Development Conventions

- Components use PascalCase filenames and export a React component.
- Component CSS is co-located with component JSX.
- Shared frontend utilities live in `src/lib`.
- Backend routes stay thin; shared behavior belongs in `server/services`.
- Database helpers and schema stay in `server/db.js`.
- Prefer explicit names for document, chunk, job, provider, and model values.
- Do not log API keys, credentials, or full private document content.
- User-facing errors should be concise and actionable.
- Use `rg` for code search and keep changes scoped to the task.
- Do not run `npm install`; update `package.json` only if a dependency is required.

## 12. Testing Approach

Automated tests use Node's built-in test runner with co-located `*.test.js` files:

```text
npm test
npm run test:server
npm run test:services
npm run test:coverage
npm run test:filename
```

Build verification:

```text
npm run build
```

Test files live next to the source they cover, such as `server/services/chunker.test.js`, `server/routes/routes.test.js`, and `src/lib/api.test.js`. Route tests use an in-process Express dispatcher so they do not need to bind a local port. React component tests are not yet implemented, so full UI workflows still require manual verification through the dev server.

## 13. Configuration & Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Express server port. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL for server-side LLM calls. |
| `OLLAMA_KEEP_ALIVE` | `30m` | Ollama model keep-alive setting. |
| `OLLAMA_NUM_CTX` | `4096` | Context window option sent to Ollama chat. |
| `OLLAMA_NUM_PREDICT` | `384` | Max generated token option sent to Ollama chat. |
| `OLLAMA_TEMPERATURE` | `0.2` | Generation temperature. |
| `OLLAMA_REWRITE_TIMEOUT_MS` | `3000` | Query rewrite timeout. |
| `EXTERNAL_API_CHAT_TIMEOUT_MS` | `60000` | External API chat timeout. |
| `EMBEDDLY_ENCRYPTION_KEY` | file-backed key | Optional server-side key material for settings encryption. |

No `.env` file is required for basic local development. User-facing model, retrieval, generation, and vector database settings are configurable through the Settings page and stored in SQLite.
