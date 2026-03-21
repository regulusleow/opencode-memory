# opencode-memory

Memory plugin for OpenCode with semantic search, auto-capture, user profiling, and web UI.

## Features

- **Semantic Search**: Find memories by meaning, not just keywords, using vector embeddings
- **Multiple Embedding Backends**: Choose between OpenAI API, local models, or auto-detection
- **Auto-Capture**: Automatically extract and store important information from conversations
- **Duplicate Detection**: Prevent redundant memories with configurable similarity threshold
- **Privacy Filtering**: Exclude sensitive patterns from automatic capture
- **Multi-Layer Search**: Enhanced search with multiple retrieval strategies
- **User Profiling**: Learn user preferences, patterns, and workflows across sessions
- **Web UI**: Browser-based interface for browsing, searching, and managing memories
- **Profile Mode**: View and manage learned user profile data
- **Configurable Logging**: Control log verbosity from debug to silent

## Installation

```bash
bun add opencode-memory
```

Then add to your OpenCode configuration (usually at `~/.config/opencode/config.json`):

```json
{
  "plugins": [
    "opencode-memory"
  ]
}
```

## Configuration

Create a configuration file at `~/.config/opencode/opencode-memory.jsonc`:

```jsonc
{
  // API embedding settings (used when embeddingBackend is "api")
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingApiKey": "",
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536,

  // Storage settings
  "storagePath": "~/.opencode-memory",

  // Search settings
  "searchLimit": 5,
  "contextLimit": 3,

  // Embedding backend: "auto", "api", or "local"
  "embeddingBackend": "auto",

  // Local embedding settings (used when embeddingBackend is "local")
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8",
  "localCacheDir": "~/.opencode-memory/models",

  // Privacy and deduplication
  "privacyPatterns": [],
  "dedupSimilarityThreshold": 0.7,

  // Auto-capture settings
  "autoCaptureEnabled": true,
  "autoCaptureDelay": 10000,
  "autoCaptureMinImportance": 6,

  // Feature toggles
  "searchLayersEnabled": true,
  "profileEnabled": true,

  // Profile extraction settings
  "profileExtractionMinPrompts": 5,
  "profileMaxMessagesPerExtraction": 20,

  // Web UI settings
  "webServerPort": 18080,

  // Logging: "debug", "info", "warn", "error", or "silent"
  "logLevel": "info"
}
```

## Embedding Backends

The plugin supports three embedding backends:

- **auto** (default): Automatically uses local models if available, falls back to API
- **api**: Use OpenAI or compatible embedding API (requires `embeddingApiKey`)
- **local**: Use HuggingFace Transformers models running locally (fully offline)

### Supported Local Models

The following models are pre-configured with correct dimensions:

| Model | Dimensions |
|-------|------------|
| `nomic-ai/nomic-embed-text-v1.5` | 768 |
| `nomic-ai/nomic-embed-text-v1` | 768 |
| `text-embedding-3-small` | 1536 |
| `text-embedding-3-large` | 3072 |
| `text-embedding-ada-002` | 1536 |
| `Xenova/all-MiniLM-L6-v2` | 384 |
| `sentence-transformers/all-MiniLM-L6-v2` | 384 |
| `Xenova/all-MiniLM-L12-v2` | 384 |
| `BAAI/bge-small-en-v1.5` | 384 |
| `Xenova/bge-small-en-v1.5` | 384 |
| `BAAI/bge-base-en-v1.5` | 768 |
| `BAAI/bge-large-en-v1.5` | 1024 |

Local models download automatically from HuggingFace on first use. The default local model is `nomic-ai/nomic-embed-text-v1.5` (768 dimensions) with `q8` quantization for balanced quality and speed.

## Tool Modes

The memory tool supports these modes via the `mode` argument:

- **add**: Store new knowledge with optional tags and type
- **search**: Find memories by semantic query
- **list**: Display all stored memories
- **forget**: Delete a specific memory by ID
- **profile**: View or manage user profile data
- **web**: Start the web UI
- **help**: Show usage information

## Web UI

The web interface provides a browser-based way to interact with your memory store:

- **URL**: `http://localhost:18080` (default port)
- **Start**: Use `mode: web` or configure `webServerPort` in config
- **Features**:
  - Browse all stored memories
  - Search memories with semantic queries
  - Delete unwanted memories
  - View memory statistics
  - Access user profile data

The web server starts on-demand when you invoke the web mode.

## User Profile

The plugin can learn about you across sessions to provide more personalized assistance:

### How It Works

- Profile extraction triggers automatically on `session.idle` events
- Analyzes recent conversation history to identify preferences, patterns, and workflows
- Stores learnings in a structured profile with confidence scores

### Profile Data Types

- **Preferences**: Key-value pairs with evidence (e.g., "favorite_language: TypeScript")
- **Patterns**: Recurring behaviors or habits
- **Workflows**: Named multi-step processes you frequently use

### Profile Mode Actions

Use `mode: profile` with these actions:

- **show**: Display current profile (default)
- **analyze**: Trigger manual profile extraction
- **delete**: Remove specific profile entries (format: `type:key`)
- **reset**: Clear entire profile

To disable profile learning, set `profileEnabled: false` in your config.

## Development

Clone and set up for development:

```bash
git clone https://github.com/regulusleow/opencode-memory.git
cd opencode-memory
bun install
```

Run tests:

```bash
bun test
```

Build distribution:

```bash
bun run build
```

Type check:

```bash
bun run typecheck
```

## License

MIT
