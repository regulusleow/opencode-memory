# 更新日志

opencode-memory 项目的所有重要变更记录。

---

## Phase 5 — AI 驱动的自动捕获与可配置 AI 提供商

### 功能特性

- **AI 驱动的自动捕获**：三种自动记忆提取模式：
  - `heuristic`（默认）：不变的关键词评分 —— 现有用户零行为变更
  - `ai`：完整 AI 提取 —— 将会话消息发送给 AI 进行智能结构化记忆提取
  - `hybrid`：启发式预过滤 + AI —— 先对消息评分，仅将高重要性内容发送给 AI（节省 Token）
- **可配置 AI 提供商**：支持独立的 OpenAI 兼容 AI 后端（OpenAI、DeepSeek、Ollama 等），通过 `aiApiUrl`、`aiApiKey`、`aiModel` 配置字段。未配置时回退到 OpenCode 内置 AI。
- **密钥解析器**：API 密钥可使用 `file:///path/to/keyfile` 或 `env://VAR_NAME` 格式安全存储，适用于 `aiApiKey` 和 `embeddingApiKey`
- **画像提取重构**：画像提取迁移到新的 `AiService` 抽象层以保持一致性

### 技术详情

- 新增配置字段：`autoCaptureMode`、`aiApiUrl`、`aiApiKey`、`aiModel`
- 默认 `autoCaptureMode: "heuristic"` 确保现有用户零行为变更
- AI 提取返回带内容 and 标签的结构化记忆
- 优雅降级：AI 故障会被记录并跳过（无崩溃、无数据丢失）
- 测试套件：420 通过 / 7 E2E 跳过 / 0 失败（Phase 4 为 367）

---

## Phase 4 — 生产环境加固

### 功能特性

- **日志系统**: 5级日志（debug、info、warn、error、silent），客户端不可用时自动降级到控制台，类型安全优化（`OpencodeClient | null` 替代 `any`）
- **dimensionMap 扩展**: 4个 → 12个预配置模型，涵盖 all-MiniLM、BGE 系列、nomic 系列
- **npm 发布**: 完整的 package.json 元数据，启用 TypeScript 声明文件，GitHub Actions 发布工作流（v* 标签触发），MIT 许可证
- **E2E 测试**: 真实模型下载和推理测试，通过 `RUN_E2E=true` 环境变量控制
- **文档完善**: 完整的 README，199 行，21 个配置字段全部文档化

### 技术详情

- 测试套件：367 通过 / 7 E2E 跳过 / 0 失败
- TypeScript 编译：无错误
- 分发包：`dist/index.js` (0.54MB) + `dist/index.d.ts`

---

## Phase 3 — 用户体验优化

### 功能特性

- **用户画像学习**: AI 驱动的编码风格、技术栈、命名规范和工作模式提取，支持置信度评分和证据追踪
- **Web UI / 服务器**: 内置 HTTP 服务器和浏览器界面，支持浏览、搜索、删除、统计和画像管理
- **画像模式**: `memory(mode="profile")`，支持 show、analyze、delete、reset 操作
- **画像对话注入**: 在 `chat.message` 钩子中自动注入用户画像上下文
- **空闲时画像提取**: 利用 `session.idle` 事件分析对话并更新画像数据

### 技术详情

- 画像数据类型：偏好设置、行为模式、工作流程
- 画像提取在达到 `profileExtractionMinPrompts` 条消息后自动触发
- Web 服务器按需启动，端口可配置（默认：18080）

---

## Phase 2 — 智能增强

### 功能特性

- **自动捕获**: 启发式重要性评分（1-10 分），自动从对话中提取重要内容
- **压缩恢复**: 监听 `session.compacted` 事件，标记会话进行记忆重新注入
- **三层搜索**: 多阶段检索：
  1. FTS5 精确匹配
  2. 向量语义搜索
  3. FTS5 模糊匹配
  - 结果通过 RRF（倒数排名融合）合并
- **去重机制**: 双重检测：
  - SHA256 哈希精确检测
  - 向量相似度检测（可配置阈值）
- **隐私过滤**: `<private>` 标签和自定义正则表达式支持
- **多语言检测**: 语言分类（en、cjk、mixed），用于搜索优化
- **事件钩子**: 处理 `session.idle` 和 `session.compacted` 事件，支持上下文注入

### 技术详情

- 自动捕获延迟：默认 10 秒，重要性阈值：6/10
- 去重阈值：0.7 余弦相似度
- RRF 融合结合多种搜索策略以提高召回率

---

## 本地嵌入 — 双后端支持

### 功能特性

- **@huggingface/transformers 集成**: 使用 transformers.js 的本地推理支持
- **支持的模型**: nomic-embed-text-v1.5（768维，INT8量化）、nomic-embed-text-v1
- **后端选择**: `auto`（默认）/ `api` / `local` 三种模式
- **配置迁移**: JSONC 配置文件替代环境变量
- **元数据追踪**: `embedding_meta` 表，模型变更时自动迁移
- **搜索前缀支持**: nomic `search_document` / `search_query` 前缀处理

### 技术详情

- 自动模式逻辑：提供 API 密钥则使用 API，否则使用本地模型
- 模型缓存：`~/.opencode-memory/models/`
- 量化：q8（INT8），平衡质量和速度

---

## Phase 1.5 — USearch 迁移

### 变更内容

- 从 `sqlite-vec` 迁移到 USearch BLOB 存储
- HNSW 索引性能提升，支持 ExactScan 回退
- 向量存储效率优化

---

## Phase 1 — 核心基础

### 功能特性

- **存储层**: SQLite + USearch HNSW 向量存储
- **嵌入客户端**: OpenAI 兼容的 API 客户端，支持懒重试机制
- **记忆 CRUD**: 完整操作：
  - `add`: 存储新记忆
  - `search`: 语义向量搜索
  - `list`: 浏览所有记忆
  - `forget`: 按 ID 删除
- **对话集成**: `chat.message` 钩子，自动注入上下文
- **记忆工具**: AI 可访问的读写记忆工具
- **项目隔离**: 使用项目路径的 SHA256 哈希实现每个项目的独立存储

### 技术详情

- 默认存储路径：`~/.opencode-memory/<hash>/memory.db`
- 嵌入 API：OpenAI 兼容（text-embedding-3-small，1536维）
- 记忆 ID 格式：`mem_<timestamp>_<uuid>`

---

## 总结

| 阶段 | 核心交付物 |
|------|-----------|
| Phase 1 | 核心记忆系统（SQLite + USearch）、CRUD 操作、对话集成 |
| Phase 1.5 | USearch 迁移，向量性能优化 |
| 本地嵌入 | HuggingFace transformers、双后端（auto/api/local）|
| Phase 2 | 自动捕获、三层搜索、去重、隐私、国际化、钩子 |
| Phase 3 | 用户画像、Web UI、画像注入、空闲提取 |
| Phase 4 | 生产级日志、npm 发布、E2E 测试、文档 |
| Phase 5 | AI 驱动自动捕获、可配置 AI 提供商、密钥解析器 |

**最终状态**: 生产就绪的插件，420 个测试，完整的 TypeScript 支持，全面的文档。
