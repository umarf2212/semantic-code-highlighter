import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";

import {
  classificationPayloadSchema,
  ClassificationValidationError,
  validateClassificationPayload
} from "../src/analysis/classification-validator";
import type { ClassificationRequest } from "../src/domain/classification";

const request: ClassificationRequest = {
  filePath: "order.ts",
  sourceCode: "doWork();",
  projectContext: { workspaceRoot: "/private/workspace", language: "typescript" },
  regions: [
    {
      id: "region-1",
      type: "statement",
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 9,
      source: "doWork()",
      depth: 0,
      childIds: []
    }
  ]
};

describe("validateClassificationPayload", () => {
  it("can be converted to the OpenAI structured-output format", () => {
    expect(() =>
      zodTextFormat(classificationPayloadSchema, "semantic_code_classification")
    ).not.toThrow();
  });

  it("accepts one valid result for every known region", () => {
    const result = validateClassificationPayload(
      {
        regions: [
          {
            regionId: "region-1",
            responsibility: "business_logic",
            confidence: 0.84,
            explanation: "Runs the domain workflow."
          }
        ]
      },
      request,
      "test:1"
    );
    expect(result.classifierVersion).toBe("test:1");
  });

  it.each([
    {
      name: "arbitrary categories",
      value: {
        regions: [{ regionId: "region-1", responsibility: "controller", confidence: 0.8 }]
      }
    },
    {
      name: "out-of-range confidence",
      value: {
        regions: [
          { regionId: "region-1", responsibility: "business_logic", confidence: 1.5 }
        ]
      }
    },
    { name: "missing regions", value: { regions: [] } },
    {
      name: "unknown ids",
      value: {
        regions: [{ regionId: "other", responsibility: "utility", confidence: 0.8 }]
      }
    }
  ])("rejects $name", ({ value }) => {
    expect(() => validateClassificationPayload(value, request, "test:1")).toThrow(
      ClassificationValidationError
    );
  });
});
