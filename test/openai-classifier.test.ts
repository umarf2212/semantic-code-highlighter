import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import type { ClassificationRequest } from "../src/domain/classification";
import { OpenAIClassifier } from "../src/llm/openai-classifier";

describe("OpenAIClassifier", () => {
  it("builds the real structured-output format and validates a fake response", async () => {
    const parse = vi.fn(async () => ({
      output_parsed: {
        regions: [
          {
            regionId: "region-1",
            responsibility: "utility",
            confidence: 0.91,
            explanation: "Formats a generic value."
          }
        ]
      }
    }));
    const client = {
      responses: { parse }
    } as unknown as OpenAI;
    const request: ClassificationRequest = {
      filePath: "format.ts",
      sourceCode: "format(value);",
      projectContext: { workspaceRoot: "/workspace", language: "typescript" },
      regions: [
        {
          id: "region-1",
          type: "statement",
          startLine: 0,
          endLine: 0,
          startOffset: 0,
          endOffset: 14,
          source: "format(value);",
          depth: 0,
          childIds: []
        }
      ]
    };

    const result = await new OpenAIClassifier({
      apiKey: "unused-in-test",
      model: "gpt-test",
      client
    }).classify(request);

    expect(parse).toHaveBeenCalledOnce();
    expect(result.regions[0]?.responsibility).toBe("utility");
    expect(result.classifierVersion).toBe("openai:gpt-test:1");
  });
});

