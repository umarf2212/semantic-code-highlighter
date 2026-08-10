import { describe, expect, it } from "vitest";

import type { ClassificationResult } from "../src/domain/classification";
import type { CodeRegion } from "../src/domain/code-region";
import { buildResponsibilitySpans } from "../src/visualization/line-map";

const regions: CodeRegion[] = [
  {
    id: "parent",
    type: "function",
    name: "createOrder",
    startLine: 0,
    endLine: 8,
    startOffset: 0,
    endOffset: 90,
    source: "function createOrder() {}",
    depth: 0,
    childIds: ["validation", "io", "unknown"]
  },
  {
    id: "validation",
    type: "if",
    startLine: 2,
    endLine: 3,
    startOffset: 20,
    endOffset: 40,
    source: "if (!user) throw error",
    depth: 1,
    parentId: "parent",
    childIds: []
  },
  {
    id: "io",
    type: "statement",
    startLine: 5,
    endLine: 5,
    startOffset: 50,
    endOffset: 60,
    source: "await api.post()",
    depth: 1,
    parentId: "parent",
    childIds: []
  },
  {
    id: "unknown",
    type: "statement",
    startLine: 7,
    endLine: 7,
    startOffset: 70,
    endOffset: 80,
    source: "mystery()",
    depth: 1,
    parentId: "parent",
    childIds: []
  }
];

const result: ClassificationResult = {
  filePath: "order.ts",
  classifierVersion: "test:1",
  regions: [
    { regionId: "parent", responsibility: "mixed", confidence: 0.8 },
    { regionId: "validation", responsibility: "validation", confidence: 0.9 },
    { regionId: "io", responsibility: "external_io", confidence: 0.95 },
    { regionId: "unknown", responsibility: "unknown", confidence: 0.2 }
  ]
};

describe("buildResponsibilitySpans", () => {
  it("gives each line at most one responsibility and lets specific children win", () => {
    const spans = buildResponsibilitySpans(regions, result, 0.5);
    const owners = new Map<number, string>();
    for (const span of spans) {
      for (let line = span.startLine; line <= span.endLine; line += 1) {
        expect(owners.has(line)).toBe(false);
        owners.set(line, span.responsibility);
      }
    }

    expect(owners.get(2)).toBe("validation");
    expect(owners.get(3)).toBe("validation");
    expect(owners.get(5)).toBe("external_io");
    expect(owners.get(7)).toBeUndefined();
    expect(owners.get(0)).toBe("mixed");
  });

  it("does not render low-confidence classifications", () => {
    const lowResult: ClassificationResult = {
      ...result,
      regions: result.regions.map((classified) =>
        classified.regionId === "io" ? { ...classified, confidence: 0.3 } : classified
      )
    };
    const spans = buildResponsibilitySpans(regions, lowResult, 0.5);
    expect(spans.some(({ regionId }) => regionId === "io")).toBe(false);
    expect(
      spans.some(
        ({ startLine, endLine }) => startLine <= 5 && endLine >= 5
      )
    ).toBe(false);
  });
});
