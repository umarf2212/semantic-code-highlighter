import { describe, expect, it } from "vitest";

import type { ResponsibilitySpan } from "../src/visualization/line-map";
import { filterSpansForLens } from "../src/visualization/responsibility-lens";

const spans: ResponsibilitySpan[] = [
  {
    startLine: 1,
    endLine: 2,
    regionId: "business",
    responsibility: "business_logic",
    confidence: 0.9
  },
  {
    startLine: 4,
    endLine: 4,
    regionId: "io",
    responsibility: "external_io",
    confidence: 0.9
  }
];

describe("responsibility lens", () => {
  it("shows only the selected responsibility", () => {
    expect(filterSpansForLens(spans, "external_io")).toEqual([spans[1]]);
  });

  it("keeps the complete map when the lens is cleared", () => {
    expect(filterSpansForLens(spans)).toBe(spans);
  });
});

