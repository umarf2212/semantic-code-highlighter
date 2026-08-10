import { describe, expect, it } from "vitest";

import { LocalHeuristicClassifier } from "../src/analysis/local-classifier";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import { buildResponsibilitySpans } from "../src/visualization/line-map";

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

  it("recognizes evidenced editor-platform setup without coloring generic calls", async () => {
    const platformSource = `
import * as vscode from "vscode";
export function activate(context: vscode.ExtensionContext) {
  doWork();
  const decoration = vscode.window.createTextEditorDecorationType({ isWholeLine: true });
  vscode.workspace.onDidChangeTextDocument(() => decoration.dispose(), null, context.subscriptions);
  setTimeout(() => decoration.dispose(), 100);
}`;
    const regions = new TypeScriptRegionExtractor().extract(
      "decorator-sample/src/extension.ts",
      platformSource
    );
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "decorator-sample/src/extension.ts",
      sourceCode: platformSource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const responsibilityForStatement = (snippet: string) => {
      const region = regions.find(
        ({ type, source: regionSource }) =>
          type === "statement" && regionSource.includes(snippet)
      );
      return result.regions.find(({ regionId }) => regionId === region?.id)?.responsibility;
    };

    expect(responsibilityForStatement("doWork")).toBe("unknown");
    expect(responsibilityForStatement("createTextEditorDecorationType")).toBe(
      "infrastructure"
    );
    expect(responsibilityForStatement("onDidChangeTextDocument")).toBe("infrastructure");
    expect(responsibilityForStatement("setTimeout")).toBe("utility");
    const platformStatement = regions.find(
      ({ type, source }) =>
        type === "statement" && source.includes("onDidChangeTextDocument")
    );
    expect(
      buildResponsibilitySpans(regions, result, 0.5).some(
        ({ startLine, endLine, responsibility }) =>
          platformStatement !== undefined &&
          startLine <= platformStatement.startLine &&
          endLine >= platformStatement.endLine &&
          responsibility === "infrastructure"
      )
    ).toBe(true);
  });

  it("uses camel-case semantic evidence before weaker domain nouns", async () => {
    const cases = [
      {
        sourceCode: "export function validateOrder(order: Order) { return order.id.length > 0; }",
        expected: "validation"
      },
      {
        sourceCode: "export function isValidOrder(order: Order) { return order.id.length > 0; }",
        expected: "validation"
      },
      {
        sourceCode: "export function setupTelemetry() { console.log('ready'); }",
        expected: "infrastructure"
      },
      {
        sourceCode: "export function formatCurrency(value: number) { return String(value); }",
        expected: "utility"
      },
      {
        sourceCode: "export function run(value: Input) { return toDTO(value); }",
        expected: "transformation"
      }
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const regions = new TypeScriptRegionExtractor().extract(
        `src/case-${index}.ts`,
        testCase.sourceCode
      );
      const result = await new LocalHeuristicClassifier().classify({
        filePath: `src/case-${index}.ts`,
        sourceCode: testCase.sourceCode,
        regions,
        projectContext: { workspaceRoot: "/workspace", language: "typescript" }
      });
      expect(result.regions.some(({ responsibility }) => responsibility === testCase.expected)).toBe(
        true
      );
    }
  });

  it("uses an enclosing validation name for an otherwise ambiguous return", async () => {
    const validationSource =
      "export function isValidOrder(order: Order) { return order.id.length > 0; }";
    const regions = new TypeScriptRegionExtractor().extract(
      "src/order-check.ts",
      validationSource
    );
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "src/order-check.ts",
      sourceCode: validationSource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const returnRegion = regions.find(({ type }) => type === "statement");

    expect(
      result.regions.find(({ regionId }) => regionId === returnRegion?.id)?.responsibility
    ).toBe("validation");
  });

  it("keeps strong child business evidence inside infrastructure setup", async () => {
    const setupSource = `
function setupCheckout(items: Item[]) {
  const total = calculateTotal(items);
  return total;
}`;
    const regions = new TypeScriptRegionExtractor().extract(
      "src/bootstrap.ts",
      setupSource
    );
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "src/bootstrap.ts",
      sourceCode: setupSource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const calculation = regions.find(
      ({ type, source }) => type === "statement" && source.includes("calculateTotal")
    );

    expect(
      result.regions.find(({ regionId }) => regionId === calculation?.id)?.responsibility
    ).toBe("business_logic");
  });

  it("does not mistake in-memory collection methods for external I/O", async () => {
    const collectionSource = `
function inspect(items: Item[], state: Map<string, Item>) {
  const eligible = items.find(isEligible);
  state.delete("old");
  return eligible;
}`;
    const regions = new TypeScriptRegionExtractor().extract(
      "src/inspect.ts",
      collectionSource
    );
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "src/inspect.ts",
      sourceCode: collectionSource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const classifiedStatements = result.regions.filter(({ regionId }) =>
      regions.some(({ id, type }) => id === regionId && type === "statement")
    );

    expect(classifiedStatements.every(({ responsibility }) => responsibility !== "external_io")).toBe(
      true
    );
  });

  it("keeps repository receiver evidence for external I/O", async () => {
    const repositorySource = `
async function loadOrder(orderRepository: OrderRepository) {
  return orderRepository.find("order-1");
}`;
    const regions = new TypeScriptRegionExtractor().extract(
      "src/load.ts",
      repositorySource
    );
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "src/load.ts",
      sourceCode: repositorySource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const returnRegion = regions.find(
      ({ type, source }) => type === "statement" && source.includes("orderRepository.find")
    );

    expect(
      result.regions.find(({ regionId }) => regionId === returnRegion?.id)?.responsibility
    ).toBe("external_io");
  });

  it("distinguishes regex scanning from child-process execution", async () => {
    const executionSource = `
function run(regex: RegExp, text: string) {
  const match = regex.exec(text);
  cp.exec("git status");
  return match;
}`;
    const regions = new TypeScriptRegionExtractor().extract("src/run.ts", executionSource);
    const result = await new LocalHeuristicClassifier().classify({
      filePath: "src/run.ts",
      sourceCode: executionSource,
      regions,
      projectContext: { workspaceRoot: "/workspace", language: "typescript" }
    });
    const responsibilityForStatement = (snippet: string) => {
      const region = regions.find(
        ({ type, source: regionSource }) =>
          type === "statement" && regionSource.includes(snippet)
      );
      return result.regions.find(({ regionId }) => regionId === region?.id)?.responsibility;
    };

    expect(responsibilityForStatement("regex.exec")).toBe("transformation");
    expect(responsibilityForStatement("cp.exec")).toBe("external_io");
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
