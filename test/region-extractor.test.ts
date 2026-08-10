import { describe, expect, it } from "vitest";

import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";

const source = `
import axios from "axios";

interface Order {
  id: string;
}

async function createOrder(userId: string, items: number[]) {
  const user = await userRepository.find(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  const total = items.reduce((sum, item) => sum + item, 0);
  const response = await axios.post("/orders", { userId, items, total });
  return normalizeOrder(response.data);
}
`;

describe("TypeScriptRegionExtractor", () => {
  const extractor = new TypeScriptRegionExtractor();
  const regions = extractor.extract("OrderService.ts", source);

  it("extracts structural and statement-level semantic candidates", () => {
    expect(regions.some(({ type }) => type === "imports")).toBe(true);
    expect(regions.some(({ type }) => type === "interface")).toBe(true);
    expect(regions.some(({ type, name }) => type === "function" && name === "createOrder")).toBe(
      true
    );
    expect(regions.some(({ type }) => type === "if")).toBe(true);
    expect(
      regions.some(
        ({ type, source: regionSource }) =>
          type === "statement" && regionSource.includes("axios.post")
      )
    ).toBe(true);
    expect(
      regions.some(
        ({ type, source: regionSource }) =>
          type === "statement" && regionSource.includes("normalizeOrder")
      )
    ).toBe(true);
  });

  it("preserves parent-child hierarchy", () => {
    const fn = regions.find(({ type, name }) => type === "function" && name === "createOrder");
    const io = regions.find(
      ({ type, source: regionSource }) =>
        type === "statement" && regionSource.includes("axios.post")
    );

    expect(fn).toBeDefined();
    expect(io?.parentId).toBe(fn?.id);
    expect(fn?.childIds).toContain(io?.id);
  });

  it("produces stable ids for unchanged source", () => {
    const again = extractor.extract("OrderService.ts", source);
    expect(again.map(({ id }) => id)).toEqual(regions.map(({ id }) => id));
  });
});
