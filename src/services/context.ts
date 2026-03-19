import type { Memory, MemorySearchResult } from "../types.js";

/**
 * 格式化搜索结果用于对话上下文或搜索结果展示
 * @param memories 搜索到的记忆结果
 * @param mode "chat" 用于注入对话 | "search" 用于展示搜索结果
 * @returns 格式化的字符串
 */
export function formatMemoryContext(
  memories: MemorySearchResult[],
  mode: "chat" | "search"
): string {
  if (memories.length === 0) {
    return mode === "chat" ? "" : "No memories found.";
  }

  if (mode === "chat") {
    const items = memories
      .map((mem) => {
        const dateStr = new Date(mem.createdAt).toISOString().split("T")[0];
        return `${mem.content} (tags: ${mem.tags}, created: ${dateStr})`;
      })
      .map((item, index) => `${index + 1}. ${item}`)
      .join("\n");

    return `<relevant_memories>
Here are relevant memories from previous sessions:

${items}

Use these for context but don't mention them unless asked.
</relevant_memories>`;
  } else {
    const items = memories
      .map((mem, index) => {
        const dateStr = new Date(mem.createdAt).toISOString().split("T")[0];
        const scoreFmt = mem.score.toFixed(2);
        return `${index + 1}. [ID: ${mem.id}] [Score: ${scoreFmt}] [Tags: ${mem.tags}]\n   Content: ${mem.content}\n   Created: ${dateStr}`;
      })
      .join("\n\n");

    return `Found ${memories.length} memories matching your query:\n\n${items}`;
  }
}

/**
 * 格式化记忆列表用于展示
 * @param memories 记忆数组
 * @returns 格式化的记忆列表字符串
 */
export function formatMemoryList(memories: Memory[]): string {
  if (memories.length === 0) {
    return "No memories stored yet.";
  }

  const items = memories
    .map((mem) => {
      const preview = mem.content.substring(0, 50);
      const dateStr = new Date(mem.createdAt).toISOString().split("T")[0];
      return `[${mem.id}] ${preview}... (tags: ${mem.tags}, created: ${dateStr})`;
    })
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `Memories (${memories.length} total):\n\n${items}`;
}

/**
 * 返回帮助文本
 * @returns 帮助信息字符串
 */
export function formatHelp(): string {
  return `Memory Plugin Commands:

1. add - Add a new memory with optional tags and type
2. search - Search memories by keywords or semantic similarity
3. list - List all stored memories with basic info
4. forget - Delete a specific memory by ID
5. help - Show this help message

Use any of these modes to manage your persistent memories across sessions.`;
}
