export type MemoryType = "general" | "decision" | "preference" | "lesson" | "code-pattern" | "bug-fix" | "auto" | "session-summary";

export interface Memory {
  id: string;
  content: string;
  tags: string;
  type: MemoryType;
  metadata: Record<string, unknown>;
  embeddingStatus: "pending" | "done" | "failed";
  createdAt: number;
  updatedAt: number;
  searchHitCount?: number;
  lastAccessedAt?: number;
}

export interface MemorySearchResult extends Memory {
  score: number;
  distance: number;
}

export type MemoryMode = "add" | "search" | "list" | "forget" | "help" | "profile" | "web" | "export" | "import" | "stats" | "timeline";

export interface PluginConfig {
  embeddingApiUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  storagePath: string;
  searchLimit: number;
  contextLimit: number;
  tokenBudget?: number;
  embeddingBackend: "auto" | "api" | "local";
  localModel: string;
  localDtype: string;
  localCacheDir: string;
  privacyPatterns: string[];
  dedupSimilarityThreshold: number;
  autoCaptureEnabled: boolean;
  autoCaptureDelay: number;
  autoCaptureMinImportance: number;
  searchLayersEnabled: boolean;
  profileEnabled: boolean;
  profileExtractionMinPrompts: number;
  profileMaxMessagesPerExtraction: number;
  webServerPort: number;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  aiApiUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  autoCaptureMode?: "heuristic" | "ai" | "hybrid";
}

export interface ProfilePreference {
  key: string;
  value: string;
  confidence: number;
  evidence: string[];
  updatedAt: number;
}

export interface ProfilePattern {
  key: string;
  description: string;
  frequency: number;
  lastSeen: number;
}

export interface ProfileWorkflow {
  name: string;
  steps: string[];
  frequency: number;
  lastSeen: number;
}

export interface UserProfile {
  id: string;
  preferences: ProfilePreference[];
  patterns: ProfilePattern[];
  workflows: ProfileWorkflow[];
  version: number;
  lastAnalyzedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileChangelog {
  id: string;
  profileId: string;
  changeType: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: number;
}

export interface AiExtractionResult {
  memories: Array<{
    content: string;
    tags: string;
  }>;
}

export interface AiService {
  complete(prompt: string, jsonSchema?: Record<string, unknown>): Promise<string>;
  isConfigured(): boolean;
}

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byEmbeddingStatus: Record<string, number>;
  oldest: number | null;
  newest: number | null;
}

export interface ExportedMemory {
  id: string;
  content: string;
  tags: string;
  type: MemoryType;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  searchHitCount: number;
  lastAccessedAt: number | null;
}

export interface ExportData {
  schemaVersion: number;
  embeddingModel: string;
  exportedAt: string;
  totalCount: number;
  memories: ExportedMemory[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

export interface MemoryEvent {
  type: "memory:added" | "memory:deleted" | "memory:imported" | "stats:updated";
  data: unknown;
  timestamp: number;
}

export interface EventBus {
  emit(event: MemoryEvent): void;
  on(handler: (event: MemoryEvent) => void): () => void;
  off(handler: (event: MemoryEvent) => void): void;
  connectionCount(): number;
}

