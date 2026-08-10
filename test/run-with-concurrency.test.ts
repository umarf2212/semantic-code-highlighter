import { describe, expect, it } from "vitest";

import { runWithConcurrency } from "../src/utils/run-with-concurrency";

describe("runWithConcurrency", () => {
  it("preserves result order while respecting the concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const results = await runWithConcurrency([30, 5, 15, 1], 2, async (delay) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return delay * 2;
    });

    expect(results).toEqual([60, 10, 30, 2]);
    expect(peak).toBe(2);
  });

  it("handles an empty input without invoking the worker", async () => {
    let calls = 0;
    const results = await runWithConcurrency([], 3, async () => {
      calls += 1;
      return true;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });
});

