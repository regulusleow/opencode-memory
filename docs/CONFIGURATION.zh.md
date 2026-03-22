# 配置指南

opencode-memory 插件的完整配置参考。

---

## 前置条件

安装插件前，请确保已安装：

- **OpenCode** 并已配置
- **bun** 或 **npm** 包管理器

---

## 安装

### 方式一：从 npm 安装（推荐）

在 OpenCode 配置目录中安装插件：

```bash
cd ~/.config/opencode/
bun add opencode-memory
# 或者
npm install opencode-memory
```

### 方式二：从本地源码安装

先构建插件，然后使用本地路径：

```bash
cd /path/to/opencode-memory
bun run build
```

### 注册插件

将插件添加到你的 OpenCode 配置文件 `~/.config/opencode/opencode.jsonc`：

**npm 安装方式：**

```jsonc
{
  "plugin": [
    "opencode-memory"
  ]
}
```

**本地路径方式：**

```jsonc
{
  "plugin": [
    "/path/to/opencode-memory"
  ]
}
```

---

## 配置文件

在 `~/.config/opencode/opencode-memory.jsonc` 创建配置文件。

文件使用 JSONC 格式，支持注释。

### 完整配置参考

```jsonc
{
  // ============================================
  // API 嵌入设置
  // 当 embeddingBackend 为 "api" 时使用
  // ============================================
  
  // OpenAI 兼容的嵌入 API 端点
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  
  // 嵌入服务的 API 密钥（纯本地使用可留空）
  "embeddingApiKey": "",
  
  // API 后端的模型名称
  "embeddingModel": "text-embedding-3-small",
  
  // 嵌入维度（已知模型会自动检测）
  "embeddingDimensions": 1536,

  // ============================================
  // 存储设置
  // ============================================
  
  // 所有记忆数据的根目录
  "storagePath": "~/.opencode-memory",

  // ============================================
  // 搜索设置
  // ============================================
  
  // 每次搜索返回的最大记忆数
  "searchLimit": 5,
  
  // 注入对话上下文的最大记忆数
  "contextLimit": 3,

  // ============================================
  // 嵌入后端
  // "auto" | "api" | "local"
  // ============================================
  
  // 后端选择模式
  "embeddingBackend": "auto",

  // ============================================
  // 本地嵌入设置
  // 当 embeddingBackend 为 "local" 时使用
  // ============================================
  
  // 本地推理的 HuggingFace 模型 ID
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  
  // 量化类型："fp32", "fp16", "q8", "q4", "q4f16"
  "localDtype": "q8",
  
  // 下载模型的缓存目录
  "localCacheDir": "~/.opencode-memory/models",

  // ============================================
  // 隐私和去重
  // ============================================
  
  // 自动捕获时要排除的正则表达式模式
  "privacyPatterns": [],
  
  // 去重的相似度阈值（0.0 - 1.0）
  "dedupSimilarityThreshold": 0.7,

  // ============================================
  // 自动捕获设置
  // ============================================
  
  // 启用从对话自动提取记忆
  "autoCaptureEnabled": true,
  
  // 自动捕获触发前的延迟（毫秒）
  "autoCaptureDelay": 10000,
  
  // 自动捕获的最小重要性分数（1-10）
  "autoCaptureMinImportance": 6,

  // 自动捕获提取策略: "heuristic" | "ai" | "hybrid"
  "autoCaptureMode": "heuristic",

  // ============================================
  // AI 提供商设置（用于 ai/hybrid 模式）
  // ============================================

  // OpenAI 兼容的聊天 API 端点（留空使用 OpenCode 内置 AI）
  "aiApiUrl": "",

  // API 密钥（支持纯文本、file:///路径、env://变量名）
  "aiApiKey": "",

  // AI 操作的模型名称（例如 "gpt-4o-mini", "deepseek-chat"）
  "aiModel": "",

  // ============================================
  // 功能开关
  // ============================================
  
  // 启用多层搜索（FTS5 + 向量 + 模糊）
  "searchLayersEnabled": true,
  
  // 启用用户画像学习
  "profileEnabled": true,

  // ============================================
  // 画像提取设置
  // ============================================
  
  // 触发画像提取前的最小提示数
  "profileExtractionMinPrompts": 5,
  
  // 每次分析的最大消息数
  "profileMaxMessagesPerExtraction": 20,

  // ============================================
  // Web UI 设置
  // ============================================
  
  // Web 界面端口
  "webServerPort": 18080,

  // ============================================
  // 日志
  // "debug" | "info" | "warn" | "error" | "silent"
  // ============================================
  
  // 日志详细程度级别
  "logLevel": "info"
}
```

---

## AI 提供商配置

为 AI 驱动的自动捕获配置独立的 AI 后端。当 `aiApiUrl` 为空时，插件使用 OpenCode 的内置 AI。

### 配置字段

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `aiApiUrl` | `""` | OpenAI 兼容的聊天 API 端点（例如 `https://api.openai.com/v1/chat/completions`）。留空使用 OpenCode 内置 AI。 |
| `aiApiKey` | `""` | AI 后端的 API 密钥。支持密钥解析格式。 |
| `aiModel` | `""` | AI 操作的模型名称（例如 `"gpt-4o-mini"`, `"deepseek-chat"`, `"llama3"`）。设置 `aiApiUrl` 时必填。 |
| `autoCaptureMode` | `"heuristic"` | 自动捕获策略：`"heuristic"`、`"ai"` 或 `"hybrid"`。 |

### 密钥解析格式

`aiApiKey` 和 `embeddingApiKey` 都支持安全的密钥解析：

```jsonc
// 纯文本（不推荐用于共享配置）
"aiApiKey": "sk-actual-key-here"

// 从文件读取
"aiApiKey": "file:///home/user/.secrets/openai-key.txt"

// 从环境变量读取（推荐）
"aiApiKey": "env://OPENAI_API_KEY"
```

### 提供商示例

**场景：使用 OpenAI 进行 AI 提取：**

```jsonc
{
  "autoCaptureMode": "hybrid",
  "aiApiUrl": "https://api.openai.com/v1/chat/completions",
  "aiApiKey": "sk-your-key",
  "aiModel": "gpt-4o-mini"
}
```

**场景：使用 DeepSeek（性价比高）：**

```jsonc
{
  "autoCaptureMode": "hybrid",
  "aiApiUrl": "https://api.deepseek.com/v1/chat/completions",
  "aiApiKey": "env://DEEPSEEK_API_KEY",
  "aiModel": "deepseek-chat"
}
```

**场景：使用 Ollama（完全本地）：**

```jsonc
{
  "autoCaptureMode": "ai",
  "aiApiUrl": "http://localhost:11434/v1/chat/completions",
  "aiApiKey": "ollama",
  "aiModel": "llama3"
}
```

---

## 自动捕获模式

`autoCaptureMode` 设置控制如何从对话中自动提取记忆：

### heuristic（默认）

基于关键词的重要性评分，范围 1-10。零 AI 调用。与现有行为完全向后兼容。

```jsonc
{
  "autoCaptureMode": "heuristic",
  "autoCaptureMinImportance": 6
}
```

### ai

纯 AI 提取。将所有会话消息发送给 AI 进行智能结构化记忆提取。需要配置 `aiApiUrl` 或使用 OpenCode 内置 AI。

```jsonc
{
  "autoCaptureMode": "ai",
  "aiApiUrl": "https://api.openai.com/v1/chat/completions",
  "aiApiKey": "env://OPENAI_API_KEY",
  "aiModel": "gpt-4o-mini"
}
```

### hybrid

启发式预过滤加 AI 提取。首先对消息进行重要性评分，然后仅将高分消息（高于 `autoCaptureMinImportance`）发送给 AI 进行结构化提取。相比纯 AI 模式节省 Token。

```jsonc
{
  "autoCaptureMode": "hybrid",
  "autoCaptureMinImportance": 6,
  "aiApiUrl": "https://api.deepseek.com/v1/chat/completions",
  "aiApiKey": "env://DEEPSEEK_API_KEY",
  "aiModel": "deepseek-chat"
}
```

### 模式对比

| 模式 | AI 调用 | Token 消耗 | 提取质量 | 适用场景 |
|------|---------|------------|----------|----------|
| heuristic | 无 | 零 | 适合明显的关键词 | 成本敏感、离线环境 |
| ai | 所有消息 | 高 | 适合细微的内容 | 最高质量要求 |
| hybrid | 仅过滤后 | 中等 | 平衡 | 推荐默认 |

---

## 嵌入后端选择

`embeddingBackend` 设置控制如何生成嵌入向量：

### 自动模式（默认）

```jsonc
"embeddingBackend": "auto"
```

逻辑：
- 如果设置了 `embeddingApiKey` → 使用 API 后端
- 如果没有 API 密钥 → 使用本地模型（自动从 HuggingFace 下载）

### API 模式

```jsonc
{
  "embeddingBackend": "api",
  "embeddingApiKey": "sk-...",
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingModel": "text-embedding-3-small"
}
```

需要有效的 API 密钥。支持 OpenAI 和兼容的 API。

### 本地模式

```jsonc
{
  "embeddingBackend": "local",
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8"
}
```

完全离线。模型在首次使用时自动下载。

---

## 支持的本地模型

以下模型已预配置正确的维度：

| 模型 | 维度 | 说明 |
|------|------|------|
| `nomic-ai/nomic-embed-text-v1.5` | 768 | 默认，高质量 |
| `nomic-ai/nomic-embed-text-v1` | 768 | 旧版本 |
| `Xenova/all-MiniLM-L6-v2` | 384 | 轻量级，快速 |
| `sentence-transformers/all-MiniLM-L6-v2` | 384 | 社区版本 |
| `Xenova/all-MiniLM-L12-v2` | 384 | 更深层的模型 |
| `BAAI/bge-small-en-v1.5` | 384 | 英语质量优秀 |
| `Xenova/bge-small-en-v1.5` | 384 | 镜像版本 |
| `BAAI/bge-base-en-v1.5` | 768 | 质量与速度平衡 |
| `BAAI/bge-large-en-v1.5` | 1024 | 最高质量 |
| `text-embedding-3-small` | 1536 | 仅 OpenAI API |
| `text-embedding-3-large` | 3072 | 仅 OpenAI API |
| `text-embedding-ada-002` | 1536 | 仅 OpenAI API |

---

## 工具使用

在对话中使用不同的模式调用记忆工具：

### 添加记忆

```
使用 memory 工具：
- mode: "add"
- content: "你的记忆内容"
- tags: "标签1,标签2"
- type: "知识"
```

### 搜索记忆

```
使用 memory 工具：
- mode: "search"
- query: "你想找的内容"
```

### 列出所有记忆

```
使用 memory 工具：
- mode: "list"
```

### 删除记忆

```
使用 memory 工具：
- mode: "forget"
- memoryId: "mem_xxx"
```

### 画像管理

```
使用 memory 工具：
- mode: "profile"
- action: "show"      // 显示画像
- action: "analyze"   // 触发提取
- action: "delete"    // 删除条目（使用 "类型:键" 格式）
- action: "reset"     // 清空整个画像
```

### 启动 Web UI

```
使用 memory 工具：
- mode: "web"
```

在浏览器中打开 `http://localhost:18080`

### 显示帮助

```
使用 memory 工具：
- mode: "help"
```

---

## 常见场景

### 场景 A：完全离线（无 API 密钥）

用于完全隐私或离线环境：

```jsonc
{
  "embeddingBackend": "local",
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8",
  "autoCaptureEnabled": true,
  "profileEnabled": true
}
```

首次运行将从 HuggingFace 下载模型（约100MB）。

### 场景 B：使用 OpenAI API

无需本地计算，获得最佳质量：

```jsonc
{
  "embeddingBackend": "api",
  "embeddingApiKey": "sk-your-key-here",
  "embeddingApiUrl": "https://api.openai.com/v1/embeddings",
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536
}
```

### 场景 C：隐私敏感环境

最小化数据捕获：

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

你也可以在对话中使用 `<private>` 标签内联排除特定内容。

---

## 数据存储

### 记忆数据库

位置：`~/.opencode-memory/<hash>/memory.db`

每个项目有独立的数据库。`<hash>` 是项目路径 SHA256 哈希的前12个字符。

### 模型缓存

位置：`~/.opencode-memory/models/`

下载的 HuggingFace 模型缓存在此处。可以安全删除此目录以释放空间；模型会在需要时重新下载。

### 配置

位置：`~/.config/opencode/opencode-memory.jsonc`

---

## 故障排除

### 本地模型下载问题

如果模型下载失败：

1. 检查到 HuggingFace 的网络连接
2. 确认 `~/.opencode-memory/` 的磁盘空间
3. 尝试其他模型（较小的模型下载更快）

### API 密钥无效

1. 验证密钥正确且具有嵌入权限
2. 检查 `embeddingApiUrl` 是否匹配你的提供商
3. 使用 `"logLevel": "debug"` 查看日志

### Web UI 无法启动

1. 检查 `webServerPort` 端口是否被占用
2. 确认防火墙未阻止 localhost
3. 尝试更换端口号
