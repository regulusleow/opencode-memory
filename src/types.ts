export interface Memory {
  id: string;
  content: string;
  tags: string;
  type: string;
  metadata: Record<string, unknown>;
  embeddingStatus: "pending" | "done" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchResult extends Memory {
  score: number;
  distance: number;
}

export type MemoryMode = "add" | "search" | "list" | "forget" | "help";

export interface PluginConfig {
  embeddingApiUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  storagePath: string;
  searchLimit: number;
  contextLimit: number;
  embeddingBackend: "auto" | "api" | "local";
  localModel: string;
  localDtype: string;
  localCacheDir: string;
  privacyPatterns: string[];
  dedupSimilarityThreshold: number;
  autoCaptureEnabled: boolean;
  autoCaptureDelay: number;
  autoCaptureMinImportance: number;
}
