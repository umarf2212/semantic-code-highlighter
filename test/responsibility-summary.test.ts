import { describe, expect, it } from "vitest";

import type { ClassificationResult } from "../src/domain/classification";
import type { CodeRegion } from "../src/domain/code-region";
import { buildResponsibilitySummary } from "../src/visualization/responsibility-summary";

const regions: CodeRegion[] = [
  {
    id: "business",
    type: "function",
    startLine: 0,
    endLine: 5,
    startOffset: 0,
    endOffset: 60,
    source: "function total() {}",
    depth: 0,
    childIds: ["io"]
  },
  {
    id: "io",
    type: "statement",
    startLine: 4,
    endLine: 5,
    startOffset: 40,
    endOffset: 60,
    source: "await repository.save()",
    depth: 1,
    parentId: "business",
    childIds: []
  }
];

const result: ClassificationResult = {
  filePath: "order.ts",
  classifierVersion: "test:1",
  regions: [
    { regionId: "business", responsibility: "business_logic", confidence: 0.9 },
    { regionId: "io", responsibility: "external_io", confidence: 0.9 }
  ]
};

describe("buildResponsibilitySummary", () => {
  it("uses disjoint rendered line ownership for percentages", () => {
    expect(buildResponsibilitySummary(regions, result, 0.5)).toEqual([
      {
        responsibility: "business_logic",
        lineCount: 4,
        percentage: 67,
        firstLine: 0
      },
      {
        responsibility: "external_io",
        lineCount: 2,
        percentage: 33,
        firstLine: 4
      }
    ]);
  });

  it("returns no misleading statistics below the confidence threshold", () => {
    expect(buildResponsibilitySummary(regions, result, 0.95)).toEqual([]);
  });
});

