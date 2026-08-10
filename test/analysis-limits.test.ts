import { describe, expect, it } from "vitest";

import { effectiveRegionLimit } from "../src/analysis/analysis-limits";

describe("effectiveRegionLimit", () => {
  it("honors larger local limits but caps structured OpenAI output at 400", () => {
    expect(effectiveRegionLimit(1000, "local")).toBe(1000);
    expect(effectiveRegionLimit(1000, "openai")).toBe(400);
    expect(effectiveRegionLimit(220, "openai")).toBe(220);
  });
});

