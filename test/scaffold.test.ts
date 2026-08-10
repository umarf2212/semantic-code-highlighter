import { describe, expect, it } from "vitest";

describe("extension scaffold", () => {
  it("has a working test runner", () => {
    expect("semantic-code-highlighter").toContain("semantic");
  });
});
