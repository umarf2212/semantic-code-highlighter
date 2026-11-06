import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import type { ClassificationRequest } from "../src/domain/classification";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import { findLineOwnershipChoices } from "../src/analysis/line-ownership";
import { OpenAIClassifier } from "../src/llm/openai-classifier";

describe("OpenAIClassifier", () => {
  it("builds the real structured-output format and validates a fake response", async () => {
    const parse = vi.fn(async () => ({
      output_parsed: {
        lineOwners: [],
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
    expect(result.classifierVersion).toBe("openai:gpt-test:2");
  });

  it("repairs an invalid ownership decision once and never returns a partial map", async () => {
    const sourceCode = 'hooks.on("message", raw => JSON.parse(raw));';
    const regions = new TypeScriptRegionExtractor().extract("utils.ts", sourceCode);
    const request: ClassificationRequest = {
      filePath: "utils.ts", sourceCode, regions,
      projectContext: { workspaceRoot: "/fixture", language: "typescript" }
    };
    const lineOwners = findLineOwnershipChoices(regions).map((choice) => ({
      line: choice.line, regionId: choice.candidateRegionIds[0]!
    }));
    const classifications = regions.map((region) => ({
      regionId: region.id, responsibility: "infrastructure", confidence: 0.9,
      explanation: "Registers a handler."
    }));
    const invalid = { output_parsed: { regions: classifications, lineOwners: [] } };
    const parse = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce({
      output_parsed: { regions: classifications, lineOwners }
    });
    const classifier = new OpenAIClassifier({
      apiKey: "unused", model: "gpt-test", client: { responses: { parse } } as unknown as OpenAI
    });
    expect((await classifier.classify(request)).lineOwners).toEqual(lineOwners);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1]![0].input[1].content).toContain("omitted ambiguous line ownership");
    expect(parse.mock.calls[0]![0].store).toBe(false);
    expect(parse.mock.calls[1]![0].store).toBe(false);

    parse.mockReset().mockResolvedValue(invalid);
    await expect(classifier.classify(request)).rejects.toThrow("omitted ambiguous line ownership");
    expect(parse).toHaveBeenCalledTimes(2);
  });
});

