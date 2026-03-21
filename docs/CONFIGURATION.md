# Configuration Guide

Complete configuration reference for the opencode-memory plugin.

---

## Prerequisites

Before installing the plugin, ensure you have:

- **OpenCode** installed and configured
- **bun** or **npm** package manager

---

## Installation

### Option 1: From npm (Recommended)

Install the plugin in your OpenCode configuration directory:

```bash
cd ~/.config/opencode/
bun add opencode-memory
# or
npm install opencode-memory
```

### Option 2: From Local Source

Build the plugin first, then use the local path:

```bash
cd /path/to/opencode-memory
bun run build
```

### Register the Plugin

Add the plugin to your OpenCode configuration file at `~/.config/opencode/opencode.jsonc`:

**For npm installation:**

```jsonc
{
  "plugin": [
    "opencode-memory"
  ]
}
```

**For local path:**

```jsonc
{
  "plugin": [
    "/path/to/opencode-memory"
  ]
}
```

---

## Configuration File

Create a configuration file at `~/.config/opencode/opencode-memory.jsonc`.

The file uses JSONC format, which supports comments.

### Complete Configuration Reference

```jsonc
{
  // ============================================
  // API Embedding Settings
  // Used when embeddingBackend is "api"
  // ============================================
  
  // OpenAI-compatible embedding API endpoint
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  
  // API key for embedding service (leave empty for local-only)
  "embeddingApiKey": "",
  
  // Model name for API backend
  "embeddingModel": "text-embedding-3-small",
  
  // Embedding dimensions (auto-detected for known models)
  "embeddingDimensions": 1536,

  // ============================================
  // Storage Settings
  // ============================================
  
  // Base directory for all memory data
  "storagePath": "~/.opencode-memory",

  // ============================================
  // Search Settings
  // ============================================
  
  // Maximum memories returned per search
  "searchLimit": 5,
  
  // Maximum memories injected into chat context
  "contextLimit": 3,

  // ============================================
  // Embedding Backend
  // "auto" | "api" | "local"
  // ============================================
  
  // Backend selection mode
  "embeddingBackend": "auto",

  // ============================================
  // Local Embedding Settings
  // Used when embeddingBackend is "local"
  // ============================================
  
  // HuggingFace model ID for local inference
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  
  // Quantization type: "fp32", "fp16", "q8", "q4", "q4f16"
  "localDtype": "q8",
  
  // Directory to cache downloaded models
  "localCacheDir": "~/.opencode-memory/models",

  // ============================================
  // Privacy and Deduplication
  // ============================================
  
  // Regex patterns to exclude from auto-capture
  "privacyPatterns": [],
  
  // Similarity threshold for deduplication (0.0 - 1.0)
  "dedupSimilarityThreshold": 0.7,

  // ============================================
  // Auto-Capture Settings
  // ============================================
  
  // Enable automatic memory extraction from conversations
  "autoCaptureEnabled": true,
  
  // Delay before auto-capture triggers (milliseconds)
  "autoCaptureDelay": 10000,
  
  // Minimum importance score (1-10) for auto-capture
  "autoCaptureMinImportance": 6,

  // ============================================
  // Feature Toggles
  // ============================================
  
  // Enable multi-layer search (FTS5 + vector + fuzzy)
  "searchLayersEnabled": true,
  
  // Enable user profile learning
  "profileEnabled": true,

  // ============================================
  // Profile Extraction Settings
  // ============================================
  
  // Minimum prompts before profile extraction triggers
  "profileExtractionMinPrompts": 5,
  
  // Maximum messages to analyze per extraction
  "profileMaxMessagesPerExtraction": 20,

  // ============================================
  // Web UI Settings
  // ============================================
  
  // Port for the web interface
  "webServerPort": 18080,

  // ============================================
  // Logging
  // "debug" | "info" | "warn" | "error" | "silent"
  // ============================================
  
  // Log verbosity level
  "logLevel": "info"
}
```

---

## Embedding Backend Selection

The `embeddingBackend` setting controls how embeddings are generated:

### Auto Mode (Default)

```jsonc
"embeddingBackend": "auto"
```

Logic:
- If `embeddingApiKey` is set → uses API backend
- If no API key → uses local model (auto-downloads from HuggingFace)

### API Mode

```jsonc
{
  "embeddingBackend": "api",
  "embeddingApiKey": "sk-...",
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingModel": "text-embedding-3-small"
}
```

Requires a valid API key. Supports OpenAI and compatible APIs.

### Local Mode

```jsonc
{
  "embeddingBackend": "local",
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8"
}
```

Fully offline. Models download automatically on first use.

---

## Supported Local Models

The following models are pre-configured with correct dimensions:

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `nomic-ai/nomic-embed-text-v1.5` | 768 | Default, high quality |
| `nomic-ai/nomic-embed-text-v1` | 768 | Previous version |
| `Xenova/all-MiniLM-L6-v2` | 384 | Lightweight, fast |
| `sentence-transformers/all-MiniLM-L6-v2` | 384 | Community version |
| `Xenova/all-MiniLM-L12-v2` | 384 | Deeper model |
| `BAAI/bge-small-en-v1.5` | 384 | Good English quality |
| `Xenova/bge-small-en-v1.5` | 384 | Mirror version |
| `BAAI/bge-base-en-v1.5` | 768 | Balanced quality/speed |
| `BAAI/bge-large-en-v1.5` | 1024 | Highest quality |
| `text-embedding-3-small` | 1536 | OpenAI API only |
| `text-embedding-3-large` | 3072 | OpenAI API only |
| `text-embedding-ada-002` | 1536 | OpenAI API only |

---

## Tool Usage

Call the memory tool in conversation with different modes:

### Add Memory

```
Use memory tool with:
- mode: "add"
- content: "Your memory content here"
- tags: "tag1,tag2"
- type: "knowledge"
```

### Search Memories

```
Use memory tool with:
- mode: "search"
- query: "What you want to find"
```

### List All Memories

```
Use memory tool with:
- mode: "list"
```

### Forget a Memory

```
Use memory tool with:
- mode: "forget"
- memoryId: "mem_xxx"
```

### Profile Management

```
Use memory tool with:
- mode: "profile"
- action: "show"      // Display profile
- action: "analyze"   // Trigger extraction
- action: "delete"    // Remove entry (use "type:key" format)
- action: "reset"     // Clear entire profile
```

### Start Web UI

```
Use memory tool with:
- mode: "web"
```

Opens browser at `http://localhost:18080`

### Show Help

```
Use memory tool with:
- mode: "help"
```

---

## Common Scenarios

### Scenario A: Fully Offline (No API Key)

For complete privacy or offline environments:

```jsonc
{
  "embeddingBackend": "local",
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8",
  "autoCaptureEnabled": true,
  "profileEnabled": true
}
```

The first run will download the model (~100MB) from HuggingFace.

### Scenario B: Use OpenAI API

For best quality without local compute:

```jsonc
{
  "embeddingBackend": "api",
  "embeddingApiKey": "sk-your-key-here",
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536
}
```

### Scenario C: Privacy-Sensitive Environment

To minimize data capture:

```jsonc
{
  "autoCaptureEnabled": false,
  "privacyPatterns": [
    "password",
    "secret",
    "token",
    "key",
    "apikey"
  ],
  "profileEnabled": false
}
```

You can also use `<private>` tags inline in conversations to exclude specific content.

---

## Data Storage

### Memory Database

Location: `~/.opencode-memory/<hash>/memory.db`

Each project gets its own isolated database. The `<hash>` is the first 12 characters of the SHA256 hash of the project path.

### Model Cache

Location: `~/.opencode-memory/models/`

Downloaded HuggingFace models are cached here. You can safely delete this directory to free space; models will re-download as needed.

### Configuration

Location: `~/.config/opencode/opencode-memory.jsonc`

---

## Troubleshooting

### Local Model Download Issues

If model download fails:

1. Check network connectivity to HuggingFace
2. Verify disk space in `~/.opencode-memory/`
3. Try a different model (smaller ones download faster)

### API Key Not Working

1. Verify the key is correct and has embedding permissions
2. Check `embeddingApiUrl` matches your provider
3. Review logs with `"logLevel": "debug"`

### Web UI Not Starting

1. Check if port `webServerPort` is available
2. Verify no firewall is blocking localhost
3. Try a different port number
