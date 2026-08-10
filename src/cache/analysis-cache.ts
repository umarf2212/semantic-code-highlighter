import { createHash } from "node:crypto";

import type {
  ClassificationRequest,
  ClassificationResult,
  ClassifierIdentity
} from "../domain/classification";
import { REGION_MODEL_VERSION } from "../domain/code-region";
import { ONTOLOGY_VERSION } from "../domain/responsibility";
import { CLASSIFICATION_PROMPT_VERSION } from "../llm/classification-prompt";

export interface AnalysisCache {
  get(key: string): Promise<ClassificationResult | undefined>;
  set(key: string, result: ClassificationResult): Promise<void>;
  clear(): Promise<void>;
}

export interface CacheStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

interface StoredCacheEntry {
  result: ClassificationResult;
  updatedAt: number;
}

type StoredCache = Record<string, StoredCacheEntry>;

const STORAGE_KEY = "semanticCode.analysisCache.v1";

export class WorkspaceAnalysisCache implements AnalysisCache {
  constructor(
    private readonly store: CacheStore,
    private readonly maximumEntries = 200
  ) {}

  async get(key: string): Promise<ClassificationResult | undefined> {
    return this.store.get<StoredCache>(STORAGE_KEY)?.[key]?.result;
  }

  async set(key: string, result: ClassificationResult): Promise<void> {
    const existing = this.store.get<StoredCache>(STORAGE_KEY) ?? {};
    const next: StoredCache = {
      ...existing,
      [key]: { result, updatedAt: Date.now() }
    };
    const overflow = Object.entries(next)
      .sort(([, left], [, right]) => left.updatedAt - right.updatedAt)
      .slice(0, Math.max(0, Object.keys(next).length - this.maximumEntries));
    for (const [oldKey] of overflow) {
      delete next[oldKey];
    }
    await this.store.update(STORAGE_KEY, next);
  }

  async clear(): Promise<void> {
    await this.store.update(STORAGE_KEY, undefined);
  }
}

export function createAnalysisCacheKey(
  request: ClassificationRequest,
  classifier: ClassifierIdentity
): string {
  return createHash("sha256")
    .update(
      stableStringify({
        filePath: request.filePath,
        sourceCode: request.sourceCode,
        language: request.projectContext.language,
        packageInfo: request.projectContext.packageInfo ?? null,
        projectInstructions: request.projectContext.projectInstructions ?? null,
        classifier,
        ontologyVersion: ONTOLOGY_VERSION,
        regionModelVersion: REGION_MODEL_VERSION,
        promptVersion: CLASSIFICATION_PROMPT_VERSION
      })
    )
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

