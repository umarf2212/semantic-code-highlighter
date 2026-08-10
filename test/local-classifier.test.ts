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

  it("leaves generic statements unknown instead of painting them as business logic", async () => {
    const genericSource = `function run() {\n  doWork();\n}`;
    const regions = new TypeScriptRegionExtractor().extract("src/run.ts", genericSource);
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "src/run.ts",
      sourceCode: genericSource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const statement = regions.find(({ type }) => type === "statement");
    expect(
      result.regions.find(({ regionId }) => regionId === statement?.id)?.responsibility
    ).toBe("unknown");
  });

  it.each([
    {
      filePath: "src/utils/format.ts",
      sourceCode: "export function formatCurrency(value: number) { return String(value); }",
      expected: "utility"
    },
    {
      filePath: "src/config/server.ts",
      sourceCode: "export function configureServer() { return createServer(); }",
      expected: "infrastructure"
    },
    {
      filePath: "src/constants/currency.ts",
      sourceCode: "export const DEFAULT_CURRENCY = 'USD' as const;",
      expected: "data"
    },
    {
      filePath: "src/domain/pricing.ts",
      sourceCode: "export function calculateTotal(price: number, quantity: number) { return price * quantity; }",
      expected: "business_logic"
    }
  ])("classifies representative $expected evidence", async ({ filePath, sourceCode, expected }) => {
    const regions = new TypeScriptRegionExtractor().extract(filePath, sourceCode);
    const result = await new LocalHeuristicClassifier().classify({
      filePath,
      sourceCode,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    expect(result.regions.some(({ responsibility }) => responsibility === expected)).toBe(true);
  });
});
