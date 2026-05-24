# Embeddly Codebase

Last updated: 2026-05-16

## 1. Overview

Embeddly is a local-first RAG knowledge search system. Users upload private documents, group them into projects, embed parsed chunks, search semantically, and chat with retrieved context scoped to all documents or one selected project. Generation can use local Ollama models or an OpenAI-compatible external API. Settings are persisted server-side in SQLite, with API keys encrypted at rest. Optional LNURL-Auth login lets Lightning wallet users keep settings and credentials isolated in a separate credential database.

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
| Vector database | SQLite by default, optional Supabase pgvector through Data API and RPC |
| Optional reranker | Transformers.js local cross-encoder |
| LLM provider | Ollama chat API or OpenAI-compatible `/v1/chat/completions` |
| Icons | `lucide-react` |
| Auth | LNURL-Auth with Lightning wallets |
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
| `server/cred.sqlite` | Per-user credential database, ignored by git. |
| `server/uploads/` | Uploaded file storage, ignored by git. |
| `server/.embeddly/key` | Settings encryption key, ignored by git. |
| `dist/` | Vite build output, ignored by git. |

## 4. Frontend Architecture

- `src/main.jsx` mounts `<App />` into `#root`.
- `src/App.jsx` uses hash routing: `#/` for the main app and `#settings` for settings.
- Mode switching is local React state: chat, upload, and search. Chat and search are guarded in the UI until embedding, generation, and vector DB settings are available; upload remains accessible.
- `src/lib/api.js` wraps backend calls and SSE parsing.
- `src/lib/storage.js` loads settings from `/api/settings`, caches them in memory, migrates old Embeddly localStorage settings, and exposes synchronous read helpers.
- `src/lib/auth.js` stores the LNURL-Auth session token in localStorage, injects `Authorization` headers, and emits auth-change events.
- `src/lib/chatDB.js` persists chat conversations and active chat UI state in IndexedDB, with an in-memory fallback when browser storage is unavailable.
- There is no external frontend state library.

Component hierarchy:

```text
App
  SettingsPage (hash: #settings)
    EmbeddingSettingsPanel
    GenerationSettingsPanel
    RetrievalSettingsPanel
    ProjectsSettingsPanel
    VectorDbSettingsPanel
  Main view (hash: #/)
    ModeTabs
    ModelStatusBar
    LoginButton
    ChatPanel (mode: chat)
      ChatSidebar
        ChatSessionItem
      MessageList
      SourceChip
      SourceList
      SourcesPanel
        ScopeToggle
      ChatInput
    UploadBox (mode: upload)
      FileDropZone
      ScopeToggle
      ProjectSelector
      ProjectChip
      TransferPane (available files)
      TransferControls
      TransferPane (knowledge base)
      EmbedActionBar
    SearchResults (mode: search after query)
      ScopeToggle
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

Long-running embedding work is queued by `/api/embed` and processed by an in-process background worker while updating `embedding_jobs`. `/api/embed/events` streams queue and progress updates over SSE so the frontend can show embedding progress outside Upload mode. Chat uses SSE to stream context, tokens, and completion metadata back to the browser. Client-side chat history is the source of truth; the server keeps only a short in-memory hot cache and can rehydrate that cache from recent history sent in `/api/chat` requests.

## 6. Database Schema

| Table | Purpose |
|-------|---------|
| `projects` | Named document groups used to scope chat and search retrieval. |
| `documents` | Uploaded files, stored filenames, MIME type, size, status, error, chunk count, timestamps. |
| `chunks` | Parsed document chunks with document id, chunk index, content, token count, timestamp. |
| `embeddings` | Local SQLite vector BLOBs linked to chunks, used when SQLite VectorDB is active. |
| `embedding_jobs` | Per-document embedding status, model, total chunks, processed chunks, error, timestamps. |
| `settings` | Key-value settings rows with JSON value, encryption flag, and update timestamp. |

Credential database tables in `server/cred.sqlite`:

| Table | Purpose |
|-------|---------|
| `users` | LNURL-Auth wallet linking public keys. |
| `sessions` | Revocable JWT session IDs with expiration timestamps. |
| `user_settings` | Per-user settings rows with the same value/encryption shape as global settings. |

Chat conversations are not stored in SQLite. The browser stores up to 30 conversations in IndexedDB under the `embeddly-chat` database, and each saved conversation keeps up to 30 messages.

Important relationships:

- `chunks.document_id` references `documents.id` with cascade delete.
- `embeddings.chunk_id` references `chunks.id` with cascade delete.
- `embedding_jobs.document_id` references `documents.id` with cascade delete.
- `documents.project_id` references `projects.id` with `ON DELETE SET NULL`.

Global settings remain the anonymous fallback. When `req.userId` is present, settings reads check `user_settings` first and fall back to global rows by setting key. Settings writes and deletes are scoped to `user_settings` for authenticated users.

Settings keys:

| Key | Public Shape | Sensitive |
|-----|--------------|-----------|
| `llm.setup` | `llm` | Yes, when `apiKey` is present. |
| `embedding.setup` | `embedding` | No |
| `chunking.config` | `chunking` | No |
| `vector_db.setup` | `vectorDb` | Yes, when Supabase `serviceRoleKey` is present. |
| `reranker.setup` | `reranker` | No |

## 7. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Server health check. |
| `/api/auth/lnurl` | POST | Start LNURL-Auth and return `{ k1, lnurl }`. |
| `/api/auth/lnurl/callback` | GET | Wallet callback that verifies the LNURL signature. |
| `/api/auth/status` | GET | Validate a bearer token or poll a completed LNURL challenge. |
| `/api/auth/logout` | POST | Revoke the current session. |
| `/api/upload` | POST | Upload files and create document rows. |
| `/api/projects` | GET/POST | List projects with document counts or create a project. |
| `/api/projects/:id` | PATCH/DELETE | Rename, describe, or delete a project. Deletion unassigns documents. |
| `/api/projects/:id/documents` | GET | List documents assigned to one project. |
| `/api/documents` | GET | List documents; accepts optional `projectId`. |
| `/api/documents/:id` | GET | Fetch one document with chunks. |
| `/api/documents/:id` | PATCH | Assign or clear a document project with `{ projectId }`. |
| `/api/documents/:id` | DELETE | Delete a document, uploaded file, chunks, embeddings, and jobs. |
| `/api/embed` | POST | Queue selected documents for background parsing, chunking, embedding, and indexing. |
| `/api/embed/status` | GET | Return active queue state and recent completed embedding jobs. |
| `/api/embed/events` | GET | Stream embedding queue and progress updates over SSE. |
| `/api/jobs` | GET | List embedding jobs. |
| `/api/jobs/:id` | GET | Fetch one embedding job. |
| `/api/search` | GET | Run semantic search for `q`, optionally with `model`. |
| `/api/chat` | POST | Stream RAG chat response over SSE; accepts optional recent `history` to recover the server hot cache. |
| `/api/settings` | GET | Return all persisted settings with API keys masked. |
| `/api/settings/:key` | GET | Return one public setting key. |
| `/api/settings` | POST | Upsert settings, encrypting API-key settings. |
| `/api/settings/:key` | DELETE | Delete one public setting key. |
| `/api/vector-db/test-connection` | POST | Validate SQLite availability or Supabase table access before saving VectorDB settings. |

## 8. Data Flow

Upload and embedding:

```text
User selects files
  -> POST /api/upload
  -> files are written to server/uploads
  -> documents rows are created with pending status and optional project_id
  -> user moves files into Knowledge Base pane
  -> user can assign or batch-assign projects without re-embedding
  -> POST /api/embed
  -> embedding jobs are queued and the response returns immediately
  -> parser extracts text
  -> chunker splits content
  -> embedder calls Ollama
  -> chunks are stored in SQLite
  -> vectors are written to the active VectorDB provider
  -> embedding_jobs and documents statuses update
```

Search:

```text
User submits query
  -> frontend reads cached embedding model
  -> optional selected projectId is sent to GET /api/search?q=...
  -> retrieval embeds query
  -> retrieval SQL filters candidates by documents.project_id when selected
  -> active VectorDB provider returns candidate chunks
  -> optional local reranker reorders candidates when enabled
  -> ranked chunks return to SearchResults
```

SQLite VectorDB stores vectors in the local `embeddings` table and ranks with in-process cosine
similarity. Supabase VectorDB stores vectors in the configured remote table and retrieves candidates
through the `match_embeddly_chunks` RPC function. Chunk content remains in SQLite for document views,
job tracking, and adjacent context.

Chat:

```text
User sends message
  -> frontend loads or creates an active IndexedDB conversation
  -> frontend sends message, conversationId, selected projectId, and recent history to POST /api/chat
  -> POST /api/chat
  -> server resolves saved or request-provided LLM settings
  -> server uses its hot cache or rehydrates it from request history
  -> retrieval finds project-scoped context chunks, optionally reranked by local cross-encoder
  -> follow-up queries may be rewritten with recent conversation
  -> messages are built with source instructions
  -> LLM response streams as SSE tokens
  -> frontend updates MessageList and SourcesPanel
  -> final conversation is saved back to IndexedDB
```

Settings:

```text
App starts
  -> GET /api/settings, including bearer token when logged in
  -> old localStorage settings migrate if server values are missing
  -> settings cache updates in memory
  -> SettingsPage saves through POST /api/settings
  -> anonymous saves write to embedly.db settings
  -> authenticated saves write to cred.sqlite user_settings
  -> API keys are encrypted in SQLite and masked in responses
```

Projects:

```text
User creates a project in Settings
  -> POST /api/projects writes to embedly.db projects
  -> Upload rows can be assigned with PATCH /api/documents/:id
  -> Chat and search send projectId when a dataset is selected
  -> retrieval.js filters joined document rows before similarity ranking and reranking
```

LNURL-Auth:

```text
User clicks Connect Wallet
  -> POST /api/auth/lnurl creates a 5-minute k1 challenge
  -> frontend shows LNURL QR and optional WebLN action
  -> wallet calls /api/auth/lnurl/callback with k1, sig, and key
  -> server verifies secp256k1 signature and stores/updates the user
  -> server issues a 24-hour JWT session and marks k1 complete
  -> frontend polls /api/auth/status?k1=...
  -> token is stored in localStorage and sent as Authorization: Bearer
```

## 9. Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `App` | `src/App.jsx` | Root routing, mode switching, settings initialization. |
| `ModeTabs` | `src/components/ModeTabs.jsx` | Switches between chat, upload, and search modes. |
| `ModelStatusBar` | `src/components/ModelStatusBar.jsx` | Shows configured embedding, generation, and vector DB state. |
| `EmbeddingIndicator` | `src/components/EmbeddingIndicator.jsx` | Topbar status surface for active background embedding jobs and recent completion/failure. |
| `LoginButton` | `src/components/LoginButton.jsx` | Shows wallet login state and disconnect menu. |
| `LoginModal` | `src/components/LoginModal.jsx` | Displays LNURL QR code, copy action, browser-wallet auth action, and polling status. |
| `ChatPanel` | `src/components/ChatPanel.jsx` | Owns active chat state, IndexedDB persistence, sidebar actions, and streaming lifecycle. |
| `ChatSidebar` | `src/components/ChatSidebar.jsx` | Collapsible conversation list with new-chat, rename, delete, and storage status controls. |
| `ChatSessionItem` | `src/components/ChatSessionItem.jsx` | Individual conversation row with active, collapsed, rename, and delete affordances. |
| `MessageList` | `src/components/MessageList.jsx` | Renders user and assistant messages. |
| `SourcesPanel` | `src/components/SourcesPanel.jsx` | Shows retrieved chunks and rewrite status. |
| `SourceChip` | `src/components/SourceChip.jsx` | Inline citation badge for assistant source references. |
| `SourcePopover` | `src/components/SourcePopover.jsx` | Hover, focus, and tap source context preview. |
| `SourceList` | `src/components/SourceList.jsx` | Collapsible source summary below assistant messages. |
| `SourceItem` | `src/components/SourceItem.jsx` | Individual source row with cited state and document action. |
| `ChatInput` | `src/components/ChatInput.jsx` | Collects and submits chat prompts. |
| `DatasetScopeControl` | `src/components/DatasetScopeControl.jsx` | Full-width scope selector kept for large project-selection surfaces. |
| `ScopeToggle` | `src/components/ScopeToggle.jsx` | Standout compact chat/search/upload scope dropdown with project identity, optional unassigned scope, scope label, side-aligned menu, settings link, and micro/compact/inline variants. |
| `ProjectChip` | `src/components/ProjectChip.jsx` | Reusable project identity token with deterministic initials color, counts, all-documents, and unassigned states. |
| `ProjectSelector` | `src/components/ProjectSelector.jsx` | Compact native dropdown for upload assignment controls. |
| `UploadBox` | `src/components/UploadBox.jsx` | Owns upload, project-scoped file filtering, transfer, selection, and detailed job progress state. |
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
| Embed queue | `server/services/embedQueue.js` | Queue documents, process background embedding jobs, persist progress, and broadcast SSE updates. |
| Retrieval | `server/services/retrieval.js` | Embed queries, retrieve candidates by vector similarity, and optionally return reranked chunks. |
| Reranker | `server/services/reranker.js` | Lazy-load a local Transformers.js cross-encoder and score query/chunk pairs. |
| LLM | `server/services/llm.js` | Build prompts, rewrite follow-up queries, stream chat responses. |
| Settings | `server/services/settings.js` | Persist settings, encrypt API keys, mask public responses. |
| Vector stores | `server/services/vectorStores/` | Resolve SQLite or Supabase vector indexing and retrieval providers. |
| Auth | `server/services/auth.js` | Generate LNURL challenges, verify wallet signatures, issue and validate JWT sessions. |

Server utilities:

| Utility | File | Purpose |
|---------|------|---------|
| Filename normalization | `server/lib/filename.js` | Normalize uploaded filenames and prevent unsafe names. |
| Filename tests | `server/lib/filename.test.js` | Node test coverage for filename normalization. |
| Credential database | `server/db/credentials.js` | Initialize and query `cred.sqlite` users, sessions, and user settings. |

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
| `TRANSFORMERS_CACHE` | `server/.models` | Optional cache directory for local reranker model downloads. |
| `PREWARM_RERANKER` | unset | Set to `true` to load the reranker model when the server starts. |

No `.env` file is required for basic local development. User-facing model, retrieval, generation, and vector database settings are configurable through the Settings page and stored in SQLite.

Supabase VectorDB requires applying `references/supabase-vector-schema.sql` in the Supabase SQL
editor before saving the provider switch. The SQL uses `VECTOR(768)` by default; recreate the table
and RPC function with the correct dimension when using a model with a different embedding size.
