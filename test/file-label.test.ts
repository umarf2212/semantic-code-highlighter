import { describe, expect, it } from "vitest";

import { nonIdentifyingFileLabel } from "../src/analysis/file-label";

describe("nonIdentifyingFileLabel", () => {
  it("removes identifying directories from loose-file labels", () => {
    const label = nonIdentifyingFileLabel(
      "/Users/alice/private-client/secret-project/order-service.ts"
    );
    expect(label).toBe("order-service.ts");
    expect(label).not.toContain("alice");
    expect(label).not.toContain("private-client");
  });
});

