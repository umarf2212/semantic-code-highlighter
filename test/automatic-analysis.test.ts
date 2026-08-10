import { describe, expect, it } from "vitest";

import { shouldAnalyzeAutomatically } from "../src/analysis/automatic-analysis";

const base = {
  enabled: true,
  scheme: "file",
  languageId: "typescript",
  isDirty: false,
  hasCurrentAnalysis: false,
  provider: "local" as const,
  openAIDisclosureAccepted: false
};

describe("shouldAnalyzeAutomatically", () => {
  it("allows an opted-in saved local source file", () => {
    expect(shouldAnalyzeAutomatically(base)).toBe(true);
  });

  it.each([
    { enabled: false },
    { scheme: "untitled" },
    { languageId: "python" },
    { isDirty: true },
    { hasCurrentAnalysis: true }
  ])("does not analyze when $0", (override) => {
    expect(shouldAnalyzeAutomatically({ ...base, ...override })).toBe(false);
  });

  it("requires prior disclosure acceptance for automatic OpenAI analysis", () => {
    expect(
      shouldAnalyzeAutomatically({
        ...base,
        provider: "openai",
        openAIDisclosureAccepted: false
      })
    ).toBe(false);
    expect(
      shouldAnalyzeAutomatically({
        ...base,
        provider: "openai",
        openAIDisclosureAccepted: true
      })
    ).toBe(true);
  });
});

