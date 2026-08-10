import { describe, expect, it } from "vitest";

import { LocalHeuristicClassifier } from "../src/analysis/local-classifier";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";

const source = `
async function createOrder(userId: string, items: Item[]) {
  if (!userId) {
    throw new ValidationError("userId is required");
  }
  const total = calculateTotal(items);
  const response = await axios.post("/orders", { userId, items, total });
  return normalizeOrder(response.data);
}
`;

describe("LocalHeuristicClassifier", () => {
  it("provides a zero-credential semantic map with nested responsibilities", async () => {
    const regions = new TypeScriptRegionExtractor().extract("OrderService.ts", source);
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "OrderService.ts",
      sourceCode: source,
      regions,
      projectContext: {
        workspaceRoot: "/workspace",
        language: "typescript"
      }
    });
    const responsibilityForStatement = (snippet: string) => {
      const region = regions.find(
        ({ type, source: regionSource }) =>
          type === "statement" && regionSource.includes(snippet)
      );
      return result.regions.find(({ regionId }) => regionId === region?.id)?.responsibility;
    };

    expect(responsibilityForStatement("throw new")).toBe("validation");
    expect(responsibilityForStatement("axios.post")).toBe("external_io");
    expect(responsibilityForStatement("return normalize")).toBe("transformation");
    expect(new Set(result.regions.map(({ responsibility }) => responsibility)).size).toBeGreaterThan(
      2
    );
  });
});
