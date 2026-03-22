# opencode-memory

A memory plugin for [OpenCode](https://opencode.ai) that automatically captures important information from your conversations, stores it with semantic search, and injects relevant context back into future sessions.

## What It Does

- **Auto-Capture**: Automatically extracts and stores important decisions, lessons, and preferences from conversations — using keyword heuristics, AI-powered extraction, or a hybrid of both
- **Semantic Search**: Finds memories by meaning using vector embeddings, not just keyword matching
- **Context Injection**: Automatically surfaces relevant past memories at the start of each session
- **User Profiling**: Learns your preferences, patterns, and workflows across sessions
- **Duplicate Detection**: Prevents redundant memories with configurable similarity threshold
- **Privacy Filtering**: Excludes sensitive patterns from automatic capture
- **Web UI**: Browser-based interface for browsing, searching, and managing memories

## Installation

```bash
cd ~/.config/opencode
bun add opencode-memory
```

Then register the plugin in `~/.config/opencode/opencode.jsonc`:

```json
{
  "plugins": [
    "opencode-memory"
  ]
}
```

## Configuration

Create `~/.config/opencode/opencode-memory.jsonc`:

```jsonc
{
  // Auto-capture strategy: "heuristic" (default), "ai", or "hybrid"
  "autoCaptureMode": "heuristic",
  "autoCaptureEnabled": true,
  "autoCaptureDelay": 10000,
  "autoCaptureMinImportance": 6,

  // AI provider for ai/hybrid capture modes (leave empty to use OpenCode's built-in AI)
  "aiApiUrl": "",
  "aiApiKey": "",
  "aiModel": "",

  // Embedding backend: "auto" (default), "api", or "local"
  "embeddingBackend": "auto",
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingApiKey": "",
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536,

  // Local embedding (used when embeddingBackend is "local")
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8",
  "localCacheDir": "~/.opencode-memory/models",

  // Storage and search
  "storagePath": "~/.opencode-memory",
  "searchLimit": 5,
  "contextLimit": 3,

  // Privacy and deduplication
  "privacyPatterns": [],
  "dedupSimilarityThreshold": 0.7,

  // User profiling
  "profileEnabled": true,
  "profileExtractionMinPrompts": 5,
  "profileMaxMessagesPerExtraction": 20,

  // Web UI
  "webServerPort": 18080,

  // Logging: "debug", "info", "warn", "error", or "silent"
  "logLevel": "info"
}
```

## Auto-Capture Modes

The `autoCaptureMode` setting controls how memories are extracted from conversations:

| Mode | How It Works | AI Calls | Best For |
|------|-------------|----------|----------|
| `heuristic` | Keyword-based importance scoring | None | Cost-conscious, offline |
| `ai` | Sends all messages to AI for structured extraction | All messages | Maximum quality |
| `hybrid` | Heuristic pre-filter, then AI on qualifying messages only | Filtered only | Balanced (recommended) |

### Using AI Modes

By default, `ai` and `hybrid` modes use OpenCode's built-in AI — no extra configuration needed.

To use a cheaper or faster independent model instead:

**OpenAI:**
```jsonc
{
  "autoCaptureMode": "hybrid",
  "aiApiUrl": "https://api.openai.com/v1/chat/completions",
  "aiApiKey": "env://OPENAI_API_KEY",
  "aiModel": "gpt-4o-mini"
}
```

**DeepSeek (cost-effective):**
```jsonc
{
  "autoCaptureMode": "hybrid",
  "aiApiUrl": "https://api.deepseek.com/v1/chat/completions",
  "aiApiKey": "env://DEEPSEEK_API_KEY",
  "aiModel": "deepseek-chat"
}
```

**Ollama (fully local):**
```jsonc
{
  "autoCaptureMode": "ai",
  "aiApiUrl": "http://localhost:11434/v1/chat/completions",
  "aiApiKey": "ollama",
  "aiModel": "llama3"
}
```

Any OpenAI-compatible API endpoint is supported (OpenAI, DeepSeek, Ollama, Anthropic proxies, etc.).

### API Key Formats

The `aiApiKey` and `embeddingApiKey` fields support secure secret resolution:

```jsonc
"aiApiKey": "sk-actual-key"           // plain string
"aiApiKey": "env://OPENAI_API_KEY"    // from environment variable
"aiApiKey": "file:///path/to/key.txt" // from file
```

## Embedding Backends

| Backend | Description |
|---------|-------------|
| `auto` (default) | Uses local model if no API key set, otherwise API |
| `api` | OpenAI-compatible embedding API |
| `local` | HuggingFace Transformers model, runs fully offline |

### Supported Local Models

| Model | Dimensions |
|-------|------------|
| `nomic-ai/nomic-embed-text-v1.5` | 768 (default) |
| `nomic-ai/nomic-embed-text-v1` | 768 |
| `Xenova/all-MiniLM-L6-v2` | 384 |
| `BAAI/bge-small-en-v1.5` | 384 |
| `BAAI/bge-base-en-v1.5` | 768 |
| `BAAI/bge-large-en-v1.5` | 1024 |
| `text-embedding-3-small` | 1536 |
| `text-embedding-3-large` | 3072 |

Local models download automatically from HuggingFace on first use.

## Tool Modes

Interact with your memory store via the `memory` tool in conversation:

| Mode | Description |
|------|-------------|
| `add` | Store new knowledge with optional tags and type |
| `search` | Find memories by semantic query |
| `list` | Display all stored memories |
| `forget` | Delete a specific memory by ID |
| `profile` | View or manage user profile data |
| `web` | Start the web UI |
| `help` | Show usage information |

## User Profile

The plugin learns about you across sessions to provide more personalized assistance:

- Triggers automatically on session idle events
- Analyzes conversation history to identify preferences, patterns, and workflows
- Stores learnings with confidence scores

Profile actions (`mode: profile`): `show`, `analyze`, `delete`, `reset`

To disable: set `profileEnabled: false`.

## Web UI

A browser-based interface for managing memories:

- **URL**: `http://localhost:18080` (default port, configurable)
- Browse, search, and delete memories
- View memory statistics and user profile data
- Starts on-demand via `mode: web`

## Development

```bash
git clone https://github.com/regulusleow/opencode-memory.git
cd opencode-memory
bun install
bun test        # run tests
bun run build   # build dist/
bun run typecheck
```

## License

MIT
