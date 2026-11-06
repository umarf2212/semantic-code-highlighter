import { describe, expect, it } from "vitest";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import { findLineOwnershipChoices } from "../src/analysis/line-ownership";
import { validateClassificationPayload } from "../src/analysis/classification-validator";
import { buildResponsibilitySpans } from "../src/visualization/line-map";
import { resultForPersistentCache } from "../src/cache/cache-policy";
import type { ClassificationRequest } from "../src/domain/classification";

const sourceCode = "register(x => JSON.parse(x));";
const regions = new TypeScriptRegionExtractor().extract("utils.ts", sourceCode);
const statement = regions.find((region) => region.type === "statement")!;
const callback = regions.find((region) => region.type === "callback")!;
const request: ClassificationRequest = {
  filePath: "utils.ts", sourceCode, regions,
  projectContext: { workspaceRoot: "/fixture", language: "typescript" }
};
const payload = {
  regions: regions.map((region) => ({
    regionId: region.id,
    responsibility: region.id === statement.id ? "infrastructure" : "transformation",
    confidence: 0.9,
    explanation: "Purpose evidenced by the operation."
  })),
  lineOwners: [{ line: 0, regionId: statement.id }]
};

describe("model line ownership", () => {
  it("lets the model choose either evidenced purpose on an indivisible line", () => {
    for (const [regionId, responsibility] of [
      [statement.id, "infrastructure"], [callback.id, "transformation"]
    ]) {
      const result = validateClassificationPayload({
        ...payload, lineOwners: [{ line: 0, regionId }]
      }, request, "test:2");
      expect(buildResponsibilitySpans(regions, result, 0.5)).toEqual([
        expect.objectContaining({ startLine: 0, endLine: 0, regionId, responsibility })
      ]);
      expect(buildResponsibilitySpans(regions, resultForPersistentCache(result, "openai"), 0.5))
        .toEqual([expect.objectContaining({ regionId, responsibility })]);
    }
  });

  it.each([
    { owners: [] },
    { owners: [{ line: 0, regionId: "invented" }] },
    { owners: [{ line: 1, regionId: statement.id }] },
    { owners: [{ line: 0, regionId: statement.id }, { line: 0, regionId: callback.id }] }
  ])("rejects missing, invented, out-of-range, or duplicate ownership: %j", ({ owners }) => {
    expect(() => validateClassificationPayload({ ...payload, lineOwners: owners }, request, "test:2"))
      .toThrow();
  });

  it("does not backfill a selected unknown or below-threshold owner", () => {
    for (const responsibility of ["unknown", "infrastructure"]) {
      const result = validateClassificationPayload({
        ...payload,
        regions: payload.regions.map((region) => region.regionId === statement.id
          ? { ...region, responsibility, confidence: 0.2 } : region)
      }, request, "test:2");
      expect(buildResponsibilitySpans(regions, result, 0.5)).toEqual([]);
    }
  });

  it("keeps multi-line children outside the arbitration boundary", () => {
    const nested = new TypeScriptRegionExtractor().extract("file.ts", "register(x => {\n  mystery(x);\n});");
    expect(findLineOwnershipChoices(nested)).toEqual([]);
    const malicious = { regions: nested.map((region) => ({
      regionId: region.id, responsibility: "unknown" as const, confidence: 0.2
    })), filePath: "file.ts", classifierVersion: "test", lineOwners: [{ line: 1, regionId: nested[0]!.id }] };
    expect(buildResponsibilitySpans(nested, malicious, 0.5)).toEqual([]);
  });

  it("handles siblings on the same line without making region order a semantic rule", () => {
    const siblings = new TypeScriptRegionExtractor().extract("file.ts", "save(); format();");
    expect(findLineOwnershipChoices(siblings)).toEqual([
      { line: 0, candidateRegionIds: siblings.map((region) => region.id).sort() }
    ]);
  });
});
