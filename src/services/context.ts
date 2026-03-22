import type { Memory, MemorySearchResult, UserProfile, MemoryStats, ImportResult } from "../types.js";

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
5. profile - View or manage your user profile (actions: show, analyze, delete, reset)
6. web - Start the web UI dashboard
7. stats - Show memory statistics (total count, by type, oldest/newest)
8. export - Export all memories as JSON (for backup or migration)
9. import - Import memories from a JSON export (provide content as JSON)
10. help - Show this help message

Use any of these modes to manage your persistent memories across sessions.`;
}

export function formatStats(stats: MemoryStats): string {
  const lines = [
    `Memory Stats:`,
    `  Total: ${stats.total}`,
    `  By Type:`,
    ...Object.entries(stats.byType).map(([type, count]) => `    ${type}: ${count}`),
    `  By Status:`,
    ...Object.entries(stats.byEmbeddingStatus).map(([status, count]) => `    ${status}: ${count}`),
  ];
  
  if (stats.oldest !== null && stats.oldest !== undefined) {
    const oldestVal = stats.oldest as any;
    const oldestTime = typeof oldestVal === 'number' ? oldestVal : (oldestVal.createdAt ?? oldestVal);
    if (oldestTime) {
      lines.push(`  Oldest: ${new Date(oldestTime).toISOString()}`);
    }
  }
  
  if (stats.newest !== null && stats.newest !== undefined) {
    const newestVal = stats.newest as any;
    const newestTime = typeof newestVal === 'number' ? newestVal : (newestVal.createdAt ?? newestVal);
    if (newestTime) {
      lines.push(`  Newest: ${new Date(newestTime).toISOString()}`);
    }
  }
  
  return lines.join("\n");
}

export function formatImportResult(result: ImportResult): string {
  return `Import complete: ${result.imported} imported, ${result.skipped} skipped.`;
}

export function formatProfileDisplay(profile: UserProfile): string {
  const sections: string[] = [];

  if (profile.preferences.length > 0) {
    const sorted = [...profile.preferences].sort((a, b) => b.confidence - a.confidence);
    const items = sorted
      .slice(0, 5)
      .map((p) => `  - ${p.key}: ${p.value} (confidence: ${Math.round(p.confidence * 100)}%)`)
      .join("\n");
    sections.push(`Preferences:\n${items}`);
  }

  if (profile.patterns.length > 0) {
    const sorted = [...profile.patterns].sort((a, b) => b.frequency - a.frequency);
    const items = sorted
      .slice(0, 5)
      .map((p) => `  - ${p.key}: ${p.description} (seen ${p.frequency} times)`)
      .join("\n");
    sections.push(`Patterns:\n${items}`);
  }

  if (profile.workflows.length > 0) {
    const sorted = [...profile.workflows].sort((a, b) => b.frequency - a.frequency);
    const items = sorted
      .slice(0, 3)
      .map((w) => `  - ${w.name}: ${w.steps.join(" -> ")} (used ${w.frequency} times)`)
      .join("\n");
    sections.push(`Workflows:\n${items}`);
  }

  if (sections.length === 0) {
    return "Profile exists but has no data yet.";
  }

  const header = `User Profile (v${profile.version}):`;
  return `${header}\n\n${sections.join("\n\n")}`;
}

export function formatProfileContext(profile: UserProfile): string {
  const lines: string[] = [];

  if (profile.preferences.length > 0) {
    lines.push("## Preferences");
    const top = [...profile.preferences]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    for (const p of top) {
      lines.push(`- ${p.key}: ${p.value} (confidence: ${Math.round(p.confidence * 100)}%)`);
    }
  }

  if (profile.patterns.length > 0) {
    lines.push("## Coding Patterns");
    const top = [...profile.patterns]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);
    for (const p of top) {
      lines.push(`- ${p.key}: ${p.description} (observed ${p.frequency} times)`);
    }
  }

  if (profile.workflows.length > 0) {
    lines.push("## Workflows");
    const top = [...profile.workflows]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);
    for (const w of top) {
      lines.push(`- ${w.name}: ${w.steps.join(" → ")} (used ${w.frequency} times)`);
    }
  }

  if (lines.length === 0) return "";

  return `<user_profile>\n${lines.join("\n")}\n</user_profile>`;
}
