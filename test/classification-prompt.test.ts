import { describe, expect, it } from "vitest";

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
});

