# opencode-memory

[OpenCode](https://opencode.ai) 的记忆插件，自动捕获对话中的重要信息，使用语义搜索进行存储，并在未来的会话中注入相关上下文。

## 这是什么

- **自动捕获**：使用关键词启发式、AI 驱动提取或两者混合，自动从对话中提取并存储重要决策、经验和偏好
- **语义搜索**：使用向量 Embedding 按含义查找记忆，而不仅仅是关键词匹配
- **上下文注入**：在每个会话开始时自动展示相关的历史记忆
- **用户画像**：跨会话学习你的偏好、模式和工作流
- **去重**：通过可配置的相似度阈值防止重复记忆
- **隐私过滤**：从自动捕获中排除敏感模式
- **Web 界面**：基于浏览器的界面，用于浏览、搜索和管理记忆

## 安装

```bash
cd ~/.config/opencode
bun add opencode-memory
```

然后在 `~/.config/opencode/opencode.jsonc` 中注册插件：

```json
{
  "plugins": [
    "opencode-memory"
  ]
}
```

## 配置

创建 `~/.config/opencode/opencode-memory.jsonc`：

```jsonc
{
  // 自动捕获策略："heuristic"（默认）、"ai" 或 "hybrid"
  "autoCaptureMode": "heuristic",
  "autoCaptureEnabled": true,
  "autoCaptureDelay": 10000,
  "autoCaptureMinImportance": 6,

  // AI 提供商配置，用于 ai/hybrid 捕获模式（留空则使用 OpenCode 内置 AI）
  "aiApiUrl": "",
  "aiApiKey": "",
  "aiModel": "",

  // Embedding 后端："auto"（默认）、"api" 或 "local"
  "embeddingBackend": "auto",
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingApiKey": "",
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536,

  // 本地 Embedding（当 embeddingBackend 为 "local" 时使用）
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8",
  "localCacheDir": "~/.opencode-memory/models",

  // 存储和搜索
  "storagePath": "~/.opencode-memory",
  "searchLimit": 5,
  "contextLimit": 3,

  // 隐私和去重
  "privacyPatterns": [],
  "dedupSimilarityThreshold": 0.7,

  // 用户画像
  "profileEnabled": true,
  "profileExtractionMinPrompts": 5,
  "profileMaxMessagesPerExtraction": 20,

  // Web UI
  "webServerPort": 18080,

  // 日志级别："debug"、"info"、"warn"、"error" 或 "silent"
  "logLevel": "info"
}
```

## 自动捕获模式

`autoCaptureMode` 设置控制如何从对话中提取记忆：

| 模式 | 工作原理 | AI 调用 | 适用场景 |
|------|---------|---------|----------|
| `heuristic` | 基于关键词的重要性评分 | 无 | 注重成本、离线使用 |
| `ai` | 将所有消息发送给 AI 进行结构化提取 | 所有消息 | 追求最高质量 |
| `hybrid` | 启发式预过滤，仅对符合条件的消息进行 AI 处理 | 仅过滤后的消息 | 平衡方案（推荐） |

### 使用 AI 模式

默认情况下，`ai` 和 `hybrid` 模式使用 OpenCode 内置的 AI，无需额外配置。

如需使用更便宜或更快的独立模型：

**OpenAI：**
```jsonc
{
  "autoCaptureMode": "hybrid",
  "aiApiUrl": "https://api.openai.com/v1/chat/completions",
  "aiApiKey": "env://OPENAI_API_KEY",
  "aiModel": "gpt-4o-mini"
}
```

**DeepSeek（性价比高）：**
```jsonc
{
  "autoCaptureMode": "hybrid",
  "aiApiUrl": "https://api.deepseek.com/v1/chat/completions",
  "aiApiKey": "env://DEEPSEEK_API_KEY",
  "aiModel": "deepseek-chat"
}
```

**Ollama（完全本地）：**
```jsonc
{
  "autoCaptureMode": "ai",
  "aiApiUrl": "http://localhost:11434/v1/chat/completions",
  "aiApiKey": "ollama",
  "aiModel": "llama3"
}
```

支持任何 OpenAI 兼容的 API 端点（OpenAI、DeepSeek、Ollama、Anthropic 代理等）。

### API Key 格式

`aiApiKey` 和 `embeddingApiKey` 字段支持安全的密钥解析：

```jsonc
"aiApiKey": "sk-actual-key"           // 纯文本字符串
"aiApiKey": "env://OPENAI_API_KEY"    // 从环境变量读取
"aiApiKey": "file:///path/to/key.txt" // 从文件读取
```

## Embedding 后端

| 后端 | 说明 |
|------|------|
| `auto`（默认） | 未设置 API Key 时使用本地模型，否则使用 API |
| `api` | OpenAI 兼容的 Embedding API |
| `local` | HuggingFace Transformers 模型，完全离线运行 |

### 支持的本地模型

| 模型 | 维度 |
|------|------|
| `nomic-ai/nomic-embed-text-v1.5` | 768（默认） |
| `nomic-ai/nomic-embed-text-v1` | 768 |
| `Xenova/all-MiniLM-L6-v2` | 384 |
| `BAAI/bge-small-en-v1.5` | 384 |
| `BAAI/bge-base-en-v1.5` | 768 |
| `BAAI/bge-large-en-v1.5` | 1024 |
| `text-embedding-3-small` | 1536 |
| `text-embedding-3-large` | 3072 |

本地模型首次使用时会自动从 HuggingFace 下载。

## 工具模式

通过对话中的 `memory` 工具与你的记忆存储交互：

| 模式 | 说明 |
|------|------|
| `add` | 存储新知识，可选标签和类型 |
| `search` | 通过语义查询查找记忆 |
| `list` | 显示所有存储的记忆 |
| `forget` | 通过 ID 删除特定记忆 |
| `profile` | 查看或管理用户画像数据 |
| `web` | 启动 Web 界面 |
| `help` | 显示使用信息 |

## 用户画像

插件会在跨会话中了解你，以提供更个性化的帮助：

- 在会话空闲事件时自动触发
- 分析对话历史以识别偏好、模式和工作流
- 以置信度分数存储学习结果

画像操作（`mode: profile`）：`show`、`analyze`、`delete`、`reset`

如需禁用：设置 `profileEnabled: false`。

## Web 界面

用于管理记忆的基于浏览器的界面：

- **URL**：`http://localhost:18080`（默认端口，可配置）
- 浏览、搜索和删除记忆
- 查看记忆统计信息和用户画像数据
- 通过 `mode: web` 按需启动

## 开发

```bash
git clone https://github.com/regulusleow/opencode-memory.git
cd opencode-memory
bun install
bun test        # 运行测试
bun run build   # 构建 dist/
bun run typecheck
```

## 许可证

MIT
