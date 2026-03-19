# opencode-memory

为 [OpenCode](https://opencode.ai) 提供跨会话持久化记忆能力的插件。

## 是什么

OpenCode 默认不保留历史会话的记忆——每次对话都从零开始。`opencode-memory` 通过插件机制为 AI 注入持久记忆，让它记住你的项目背景、技术决策、踩过的坑，以及任何你认为值得保留的知识。

记忆存储在本地 SQLite 数据库中，使用 [sqlite-vec](https://github.com/asg017/sqlite-vec) 提供向量相似度搜索，通过 OpenAI 兼容的 Embedding API 将文本转换为向量。每个项目有独立的存储空间（按项目路径哈希隔离），互不干扰。

## 核心能力

- **跨会话记忆** — 记忆写入后永久保留，下次打开 OpenCode 仍然可用
- **语义搜索** — 基于向量相似度检索相关记忆，而非关键词匹配
- **自动注入上下文** — 每次会话开始时，通过 `chat.message` hook 自动将相关记忆注入 AI 上下文
- **项目隔离** — 不同项目的记忆完全隔离，不会互相污染
- **懒加载 Embedding** — Embedding 失败不阻塞写入，后台自动重试

## 架构

```
src/
├── plugin.ts           # 插件入口，组装各模块
├── config.ts           # 配置读取（支持环境变量覆盖）
├── types.ts            # 类型定义
└── services/
    ├── database.ts     # SQLite + sqlite-vec 初始化
    ├── embedding.ts    # OpenAI 兼容 Embedding API 客户端
    ├── memory-store.ts # 记忆 CRUD + 向量搜索
    ├── context.ts      # 上下文格式化
    ├── tool.ts         # memory 工具定义
    └── hooks.ts        # chat.message hook
```

记忆数据库存储在 `~/.opencode-memory/<project-hash>/memory.db`。

## 安装

### 前置要求

- [Bun](https://bun.sh) >= 1.0
- 支持 `text-embedding-3-small` 的 OpenAI 兼容 Embedding API

### 构建

```bash
bun install
bun run build
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENCODE_MEMORY_EMBEDDING_API_URL` | `https://api.openai.com/v1/embeddings` | Embedding API 地址 |
| `OPENCODE_MEMORY_EMBEDDING_API_KEY` | （空） | API Key |
| `OPENCODE_MEMORY_EMBEDDING_MODEL` | `text-embedding-3-small` | 模型名称 |
| `OPENCODE_MEMORY_EMBEDDING_DIMENSIONS` | `1536` | 向量维度 |
| `OPENCODE_MEMORY_STORAGE_PATH` | `~/.opencode-memory` | 数据库根目录 |
| `OPENCODE_MEMORY_SEARCH_LIMIT` | `5` | 搜索返回最大条数 |
| `OPENCODE_MEMORY_CONTEXT_LIMIT` | `3` | 自动注入上下文最大条数 |

### 在 OpenCode 中启用

在 OpenCode 配置中添加本插件路径，指向构建产物 `dist/index.js`。

## 使用

插件注册了一个 `memory` 工具，AI 可以直接调用：

```
memory(mode="add", content="项目使用 bun 而非 node，不要生成 package-lock.json", tags="toolchain")
memory(mode="search", query="数据库连接方式")
memory(mode="list")
memory(mode="forget", memoryId="mem_xxx")
memory(mode="help")
```

## 测试

```bash
bun test        # 运行全部测试（81 个）
bun run typecheck
```

## 当前状态

Phase 1 已完成：

- [x] SQLite + sqlite-vec 向量数据库
- [x] OpenAI 兼容 Embedding 客户端（懒加载，失败重试）
- [x] 记忆 CRUD：add / search / list / forget
- [x] `chat.message` hook：会话开始时自动注入相关记忆
- [x] `memory` 工具：AI 可主动读写记忆
- [x] 按项目路径隔离存储
- [x] 81/81 测试通过，类型检查干净，构建成功

## 致谢

受以下项目的启发：

- [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) — 为 Claude Code 提供持久化记忆的参考实现
- [tickernelz/opencode-mem](https://github.com/tickernelz/opencode-mem) — OpenCode 记忆插件的早期探索
