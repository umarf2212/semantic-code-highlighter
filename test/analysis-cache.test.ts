import { describe, expect, it } from "vitest";

import {
  createAnalysisCacheKey,
  createContentHash,
  WorkspaceAnalysisCache,
  type CacheStore
} from "../src/cache/analysis-cache";
import type { ClassificationRequest, ClassificationResult } from "../src/domain/classification";

class MemoryStore implements CacheStore {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
    return Promise.resolve();
  }

  seed(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

const request: ClassificationRequest = {
  filePath: "src/order.ts",
  sourceCode: "const total = 1;",
  projectContext: { workspaceRoot: "/repo", language: "typescript" },
  regions: []
};
const result: ClassificationResult = {
  filePath: "src/order.ts",
  classifierVersion: "local:1",
  regions: []
};

describe("WorkspaceAnalysisCache", () => {
  it("uses content hashes rather than transient document versions", () => {
    expect(createContentHash("same source")).toBe(createContentHash("same source"));
    expect(createContentHash("same source")).not.toBe(createContentHash("changed source"));
  });

  it("hits unchanged content and clears persisted results", async () => {
    const cache = new WorkspaceAnalysisCache(new MemoryStore());
    const key = createAnalysisCacheKey(request, { id: "local", version: "1" });

    expect(await cache.get(key)).toBeUndefined();
    await cache.set(key, result);
    expect(await cache.get(key)).toEqual(result);
    await cache.clear();
    expect(await cache.get(key)).toBeUndefined();
  });

  it("removes legacy entries that could contain source-derived explanations", async () => {
    const store = new MemoryStore();
    store.seed("semanticCode.analysisCache.v1", {
      legacy: {
        result: {
          ...result,
          regions: [
            {
              regionId: "region:statement:0:10",
              responsibility: "business_logic",
              confidence: 0.9,
              explanation: "Echoes customerSecretIdentifier"
            }
          ]
        },
        updatedAt: Date.now()
      }
    });
    const cache = new WorkspaceAnalysisCache(store);

    await cache.get("legacy");

    expect(store.get("semanticCode.analysisCache.v1")).toBeUndefined();
  });

  it("invalidates when source, provider, or relevant context changes", () => {
    const base = createAnalysisCacheKey(request, { id: "local", version: "1" });
    const sourceChanged = createAnalysisCacheKey(
      { ...request, sourceCode: "const total = 2;" },
      { id: "local", version: "1" }
    );
    const providerChanged = createAnalysisCacheKey(request, {
      id: "openai:gpt-5.4-nano",
      version: "1"
    });
    const contextChanged = createAnalysisCacheKey(
      {
        ...request,
        projectContext: {
          ...request.projectContext,
          projectInstructions: "Controllers contain infrastructure only."
        }
      },
      { id: "local", version: "1" }
    );

    expect(new Set([base, sourceChanged, providerChanged, contextChanged]).size).toBe(4);
  });
});
