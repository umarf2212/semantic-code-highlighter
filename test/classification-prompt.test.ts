import { describe, expect, it } from "vitest";

import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import { findLineOwnershipChoices } from "../src/analysis/line-ownership";
import type { ClassificationRequest } from "../src/domain/classification";
import { buildClassificationMessages } from "../src/llm/classification-prompt";

describe("buildClassificationMessages", () => {
  it("sends source once, keeps hierarchy, and omits the absolute workspace root", () => {
    const request: ClassificationRequest = {
      filePath: "src/order.ts",
      sourceCode: "const total = calculateTotal(items);",
      projectContext: {
        workspaceRoot: "/Users/private/company-secret",
        language: "typescript"
      },
      regions: [
        {
          id: "region-1",
          type: "statement",
          startLine: 0,
          endLine: 0,
          startOffset: 0,
          endOffset: 36,
          source: "const total = calculateTotal(items);",
          depth: 0,
          childIds: []
        }
      ]
    };
    const messages = buildClassificationMessages(request);

    expect(messages.user).not.toContain(request.projectContext.workspaceRoot);
    expect(messages.user.match(/const total = calculateTotal/g)).toHaveLength(1);
    expect(messages.user).toContain("region-1");
    expect(messages.system).toContain("business_logic");
  });

  it("sends exact sub-line boundaries and bounded ownership choices without source snippets", () => {
    const sourceCode = 'hooks.on("message", raw => JSON.parse(raw));';
    const regions = new TypeScriptRegionExtractor().extract("utils.ts", sourceCode);
    const messages = buildClassificationMessages({
      filePath: "utils.ts", sourceCode, regions,
      projectContext: { workspaceRoot: "/private/root", language: "typescript" }
    });
    const payload = JSON.parse(messages.user.split("\n\n")[1]!);
    expect(payload.schemaVersion).toBe("2");
    expect(payload.lineOwnershipChoices).toEqual(findLineOwnershipChoices(regions));
    for (const [index, region] of regions.entries()) {
      expect(payload.regions[index]).toMatchObject({
        startOffset: region.startOffset, endOffset: region.endOffset
      });
      expect(payload.regions[index]).not.toHaveProperty("source");
      expect(sourceCode.slice(payload.regions[index].startOffset, payload.regions[index].endOffset))
        .toBe(region.source);
    }
    expect(payload.sourceCode).toBe(sourceCode);
  });
});

