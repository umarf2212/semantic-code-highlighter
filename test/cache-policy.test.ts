import { describe, expect, it } from "vitest";

import { resultForPersistentCache } from "../src/cache/cache-policy";
import type { ClassificationResult } from "../src/domain/classification";

const result: ClassificationResult = {
  filePath: "src/order.ts",
  classifierVersion: "openai:test:1",
  regions: [
    {
      regionId: "region:statement:0:10",
      responsibility: "business_logic",
      confidence: 0.91,
      explanation: "Calculates total from customerOrder.secretLiteral."
    }
  ]
};

describe("resultForPersistentCache", () => {
  it("drops source-derived OpenAI explanations before persistence", () => {
    const cached = resultForPersistentCache(result, "openai");

    expect(cached.regions[0]?.explanation).toBeUndefined();
    expect(cached.regions[0]?.responsibility).toBe("business_logic");
    expect(result.regions[0]?.explanation).toContain("secretLiteral");
  });

  it("keeps deterministic local explanations", () => {
    expect(resultForPersistentCache(result, "local")).toBe(result);
  });
});
