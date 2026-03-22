# Changelog

All notable changes to the opencode-memory project.

---

## Phase 5 — AI-Powered Auto-Capture & Configurable AI Provider

### Features

- **AI-Powered Auto-Capture**: Three extraction modes for automatic memory extraction:
  - `heuristic` (default): Unchanged keyword scoring — zero behavior change for existing users
  - `ai`: Full AI extraction — sends session messages to AI for intelligent structured memory extraction
  - `hybrid`: Heuristic pre-filter + AI — scores messages first, then sends only high-importance content to AI (token-efficient)
- **Configurable AI Provider**: Support for independent OpenAI-compatible AI backends (OpenAI, DeepSeek, Ollama, etc.) via `aiApiUrl`, `aiApiKey`, `aiModel` config fields. Falls back to OpenCode's built-in AI when not configured.
- **Secret Resolver**: API keys can be stored securely using `file:///path/to/keyfile` or `env://VAR_NAME` formats for both `aiApiKey` and `embeddingApiKey`
- **Profile Extractor Refactor**: Profile extraction migrated to use the new `AiService` abstraction for consistency

### Technical Details

- New config fields: `autoCaptureMode`, `aiApiUrl`, `aiApiKey`, `aiModel`
- Default `autoCaptureMode: "heuristic"` ensures zero behavior change for existing users
- AI extraction returns structured memories with content and tags
- Graceful degradation: AI failures are logged and skipped (no crashes, no data loss)
- Test suite: 420 pass / 7 E2E skip / 0 fail (was 367 in Phase 4)

---

## Phase 4 — Production Hardening

### Features

- **Logger System**: 5-level logging (debug, info, warn, error, silent) with console fallback when client unavailable, improved type safety (`OpencodeClient | null` instead of `any`)
- **dimensionMap Expansion**: 4 → 12 pre-configured models covering all-MiniLM, BGE series, nomic series
- **npm Publishing**: Full package.json metadata, TypeScript declarations enabled, GitHub Actions release workflow (v* tag trigger), MIT LICENSE
- **E2E Tests**: Real model download and inference testing, gated by `RUN_E2E=true` environment variable
- **Documentation**: Complete README with 199 lines, all 21 configuration fields documented

### Technical Details

- Test suite: 367 pass / 7 E2E skip / 0 fail
- TypeScript compilation: clean
- Distribution: `dist/index.js` (0.54MB) + `dist/index.d.ts`

---

## Phase 3 — User Experience

### Features

- **User Profile Learning**: AI-powered extraction of coding style, tech stack, naming conventions, and work patterns with confidence scoring and evidence tracking
- **Web UI / Server**: Built-in HTTP server with browser interface for browse, search, delete, stats, and profile management
- **Profile Mode**: `memory(mode="profile")` with actions: show, analyze, delete, reset
- **Profile Chat Injection**: Automatic injection of user profile context in `chat.message` hook
- **Profile Extraction on Idle**: Uses `session.idle` events to analyze conversations and update profile data

### Technical Details

- Profile data types: Preferences, Patterns, Workflows
- Profile extraction triggers automatically after `profileExtractionMinPrompts` messages
- Web server starts on-demand at configurable port (default: 18080)

---

## Phase 2 — Smart Enhancement

### Features

- **Auto-Capture**: Heuristic importance scoring (1-10 scale) for automatic extraction of memorable content from conversations
- **Compaction Recovery**: Listens to `session.compacted` events and flags sessions for memory re-injection
- **3-Layer Search**: Multi-stage retrieval:
  1. FTS5 exact match
  2. Vector semantic search
  3. FTS5 fuzzy match
  - Results fused via RRF (Reciprocal Rank Fusion)
- **Deduplication**: Dual detection mechanism:
  - SHA256 hash-based exact detection
  - Vector similarity detection with configurable threshold
- **Privacy Filtering**: `<private>` tags and custom regex pattern support
- **Multi-language Detection**: Language classification (en, cjk, mixed) for search optimization
- **Event Hooks**: Handles `session.idle` and `session.compacted` events with context injection

### Technical Details

- Auto-capture delay: 10s default, importance threshold: 6/10
- Deduplication threshold: 0.7 cosine similarity
- RRF fusion combines multiple search strategies for better recall

---

## Local Embedding — Dual Backend

### Features

- **@huggingface/transformers Integration**: Local inference support using transformers.js
- **Supported Models**: nomic-embed-text-v1.5 (768-dim, INT8 quantized), nomic-embed-text-v1
- **Backend Selection**: `auto` (default) / `api` / `local` modes
- **Configuration Migration**: JSONC config file replaces environment variables
- **Metadata Tracking**: `embedding_meta` table with automatic migration on model change
- **Search Prefix Support**: nomic `search_document` / `search_query` prefix handling

### Technical Details

- Auto mode logic: uses API if key provided, otherwise local
- Model caching: `~/.opencode-memory/models/`
- Quantization: q8 (INT8) for balanced quality and speed

---

## Phase 1.5 — USearch Migration

### Changes

- Migrated from `sqlite-vec` to USearch BLOB storage
- Improved HNSW index performance with ExactScan fallback
- Better vector storage efficiency

---

## Phase 1 — Core Foundation

### Features

- **Storage Layer**: SQLite + USearch HNSW vector storage
- **Embedding Client**: OpenAI-compatible API client with lazy retry mechanism
- **Memory CRUD**: Full operations:
  - `add`: Store new memories
  - `search`: Semantic vector search
  - `list`: Browse all memories
  - `forget`: Delete by ID
- **Chat Integration**: `chat.message` hook for automatic context injection
- **Memory Tool**: AI-accessible tool for reading/writing memories
- **Project Isolation**: Per-project storage using SHA256 hash of project path

### Technical Details

- Default storage: `~/.opencode-memory/<hash>/memory.db`
- Embedding API: OpenAI-compatible (text-embedding-3-small, 1536-dim)
- Memory ID format: `mem_<timestamp>_<uuid>`

---

## Summary

| Phase | Key Deliverables |
|-------|-----------------|
| Phase 1 | Core memory system with SQLite + USearch, CRUD operations, chat integration |
| Phase 1.5 | USearch migration for better vector performance |
| Local Embedding | HuggingFace transformers, dual backend (auto/api/local) |
| Phase 2 | Auto-capture, 3-layer search, deduplication, privacy, i18n, hooks |
| Phase 3 | User profiles, Web UI, profile injection, idle extraction |
| Phase 4 | Production logging, npm publish, E2E tests, documentation |
| Phase 5 | AI-powered auto-capture, configurable AI provider, secret resolver |

**Final State**: Production-ready plugin with 420 tests, full TypeScript support, and comprehensive documentation.
