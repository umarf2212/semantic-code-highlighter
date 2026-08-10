import { describe, expect, it } from "vitest";

import { colorWithOpacity } from "../src/visualization/color";

describe("colorWithOpacity", () => {
  it("turns a configured category color into a subtle RGBA band", () => {
    expect(colorWithOpacity("#2E7D32", 0.12)).toBe("rgba(46, 125, 50, 0.12)");
  });

  it("falls back safely for invalid input and clamps opacity", () => {
    expect(colorWithOpacity("not-a-color", 4)).toBe("rgba(97, 97, 97, 1)");
  });
});

