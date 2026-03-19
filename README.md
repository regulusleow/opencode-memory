# opencode-memory

A persistent memory plugin for [OpenCode](https://opencode.ai) that gives AI coding agents memory across sessions.

## What it does

OpenCode starts fresh every session — no memory of previous conversations. `opencode-memory` fixes this by injecting a persistent memory layer into the plugin system, letting the AI remember your project context, technical decisions, lessons learned, and anything else worth keeping.

Memory is stored in a local SQLite database using [sqlite-vec](https://github.com/asg017/sqlite-vec) for vector similarity search. Each project gets its own isolated database (keyed by a hash of the project path), so memories never bleed across projects.

## Features

- **Cross-session memory** — memories persist permanently and are available in every future session
- **Semantic search** — retrieves relevant memories by vector similarity, not keyword matching
- **Automatic context injection** — on every session start, relevant memories are injected into the AI's context via the `chat.message` hook
- **Per-project isolation** — each project maintains its own memory database
- **Lazy embedding** — embedding failures never block writes; failed embeddings are retried in the background

## Architecture

```
src/
├── plugin.ts           # plugin entry point, wires up all modules
├── config.ts           # config with environment variable overrides
├── types.ts            # shared type definitions
└── services/
    ├── database.ts     # SQLite + sqlite-vec initialization
    ├── embedding.ts    # OpenAI-compatible embedding API client
    ├── memory-store.ts # memory CRUD + vector search
    ├── context.ts      # context formatting for injection and display
    ├── tool.ts         # memory tool definition
    └── hooks.ts        # chat.message hook
```

Memory databases are stored at `~/.opencode-memory/<project-hash>/memory.db`.

## Installation

### Requirements

- [Bun](https://bun.sh) >= 1.0
- An OpenAI-compatible embedding API (defaults to `text-embedding-3-small`)

### Build

```bash
bun install
bun run build
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_MEMORY_EMBEDDING_API_URL` | `https://api.openai.com/v1/embeddings` | Embedding API endpoint |
| `OPENCODE_MEMORY_EMBEDDING_API_KEY` | _(empty)_ | API key |
| `OPENCODE_MEMORY_EMBEDDING_MODEL` | `text-embedding-3-small` | Model name |
| `OPENCODE_MEMORY_EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions |
| `OPENCODE_MEMORY_STORAGE_PATH` | `~/.opencode-memory` | Root directory for databases |
| `OPENCODE_MEMORY_SEARCH_LIMIT` | `5` | Max results returned by search |
| `OPENCODE_MEMORY_CONTEXT_LIMIT` | `3` | Max memories injected into context |

### Enable in OpenCode

Add this plugin to your OpenCode configuration, pointing to the built output at `dist/index.js`.

## Usage

The plugin registers a `memory` tool that the AI can call directly:

```
memory(mode="add", content="This project uses bun, not node — never generate package-lock.json", tags="toolchain")
memory(mode="search", query="database connection approach")
memory(mode="list")
memory(mode="forget", memoryId="mem_xxx")
memory(mode="help")
```

## Tests

```bash
bun test        # run all tests (81 total)
bun run typecheck
```

## Status

Phase 1 complete:

- [x] SQLite + sqlite-vec vector database
- [x] OpenAI-compatible embedding client with lazy retry
- [x] Memory CRUD: add / search / list / forget
- [x] `chat.message` hook for automatic context injection
- [x] `memory` tool for explicit AI-driven read/write
- [x] Per-project storage isolation
- [x] 81/81 tests passing, zero type errors, build succeeds

## Inspiration

Inspired by:

- [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) — persistent memory for Claude Code
- [tickernelz/opencode-mem](https://github.com/tickernelz/opencode-mem) — early exploration of memory for OpenCode
