import { describe, expect, it } from "vitest";

import type { ClassificationResult } from "../src/domain/classification";
import type { CodeRegion } from "../src/domain/code-region";
import { buildResponsibilitySpans } from "../src/visualization/line-map";

const regions: CodeRegion[] = [
  {
    id: "parent",
    type: "function",
    name: "createOrder",
    startLine: 0,
    endLine: 8,
    startOffset: 0,
    endOffset: 90,
    source: "function createOrder() {}",
    depth: 0,
    childIds: ["validation", "io", "unknown"]
  },
  {
    id: "validation",
    type: "if",
    startLine: 2,
    endLine: 3,
    startOffset: 20,
    endOffset: 40,
    source: "if (!user) throw error",
    depth: 1,
    parentId: "parent",
    childIds: []
  },
  {
    id: "io",
    type: "statement",
    startLine: 5,
    endLine: 5,
    startOffset: 50,
    endOffset: 60,
    source: "await api.post()",
    depth: 1,
    parentId: "parent",
    childIds: []
  },
  {
    id: "unknown",
    type: "statement",
    startLine: 7,
    endLine: 7,
    startOffset: 70,
    endOffset: 80,
    source: "mystery()",
    depth: 1,
    parentId: "parent",
    childIds: []
  }
];

const result: ClassificationResult = {
  filePath: "order.ts",
  classifierVersion: "test:1",
  regions: [
    { regionId: "parent", responsibility: "mixed", confidence: 0.8 },
    { regionId: "validation", responsibility: "validation", confidence: 0.9 },
    { regionId: "io", responsibility: "external_io", confidence: 0.95 },
    { regionId: "unknown", responsibility: "unknown", confidence: 0.2 }
  ]
};

describe("buildResponsibilitySpans", () => {
  it("gives each line at most one responsibility and lets specific children win", () => {
    const spans = buildResponsibilitySpans(regions, result, 0.5);
    const owners = new Map<number, string>();
    for (const span of spans) {
      for (let line = span.startLine; line <= span.endLine; line += 1) {
        expect(owners.has(line)).toBe(false);
        owners.set(line, span.responsibility);
      }
    }

    expect(owners.get(2)).toBe("validation");
    expect(owners.get(3)).toBe("validation");
    expect(owners.get(5)).toBe("external_io");
    expect(owners.get(7)).toBeUndefined();
    expect(owners.get(0)).toBe("mixed");
  });

  it("does not render low-confidence classifications", () => {
    const lowResult: ClassificationResult = {
      ...result,
      regions: result.regions.map((classified) =>
        classified.regionId === "io" ? { ...classified, confidence: 0.3 } : classified
      )
    };
    const spans = buildResponsibilitySpans(regions, lowResult, 0.5);
    expect(spans.some(({ regionId }) => regionId === "io")).toBe(false);
    expect(
      spans.some(
        ({ startLine, endLine }) => startLine <= 5 && endLine >= 5
      )
    ).toBe(false);
  });

  it("keeps an evidenced one-line statement when its inline callback is unknown", () => {
    const inlineRegions: CodeRegion[] = [
      {
        id: "statement",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 0,
        endOffset: 55,
        source: "vscode.workspace.onDidChangeTextDocument(() => refresh())",
        depth: 0,
        childIds: ["callback"]
      },
      {
        id: "callback",
        type: "callback",
        name: "callback",
        startLine: 0,
        endLine: 0,
        startOffset: 41,
        endOffset: 54,
        source: "() => refresh()",
        depth: 1,
        parentId: "statement",
        childIds: []
      }
    ];
    const inlineResult: ClassificationResult = {
      filePath: "extension.ts",
      classifierVersion: "test:1",
      regions: [
        {
          regionId: "statement",
          responsibility: "infrastructure",
          confidence: 0.9
        },
        { regionId: "callback", responsibility: "unknown", confidence: 0.3 }
      ]
    };

    expect(buildResponsibilitySpans(inlineRegions, inlineResult, 0.5)).toEqual([
      expect.objectContaining({
        startLine: 0,
        endLine: 0,
        regionId: "statement",
        responsibility: "infrastructure"
      })
    ]);
  });

  it("keeps the outer statement when a one-line block callback has an unknown child", () => {
    const inlineRegions: CodeRegion[] = [
      {
        id: "statement",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 0,
        endOffset: 50,
        source: "const ids = items.map(item => { return item.id; })",
        depth: 0,
        childIds: ["callback"]
      },
      {
        id: "callback",
        type: "callback",
        startLine: 0,
        endLine: 0,
        startOffset: 22,
        endOffset: 49,
        source: "item => { return item.id; }",
        depth: 1,
        parentId: "statement",
        childIds: ["return"]
      },
      {
        id: "return",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 32,
        endOffset: 47,
        source: "return item.id;",
        depth: 2,
        parentId: "callback",
        childIds: []
      }
    ];
    const inlineResult: ClassificationResult = {
      filePath: "mapper.ts",
      classifierVersion: "test:1",
      regions: [
        {
          regionId: "statement",
          responsibility: "transformation",
          confidence: 0.9
        },
        { regionId: "callback", responsibility: "unknown", confidence: 0.3 },
        { regionId: "return", responsibility: "unknown", confidence: 0.3 }
      ]
    };

    expect(buildResponsibilitySpans(inlineRegions, inlineResult, 0.5)).toEqual([
      expect.objectContaining({
        startLine: 0,
        endLine: 0,
        regionId: "statement",
        responsibility: "transformation"
      })
    ]);
  });

  it("keeps a specifically classified low-confidence inline callback uncolored", () => {
    const inlineRegions: CodeRegion[] = [
      {
        id: "statement",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 0,
        endOffset: 42,
        source: "register(() => validatePendingInput())",
        depth: 0,
        childIds: ["callback"]
      },
      {
        id: "callback",
        type: "callback",
        startLine: 0,
        endLine: 0,
        startOffset: 9,
        endOffset: 41,
        source: "() => validatePendingInput()",
        depth: 1,
        parentId: "statement",
        childIds: []
      }
    ];
    const inlineResult: ClassificationResult = {
      filePath: "extension.ts",
      classifierVersion: "test:1",
      regions: [
        {
          regionId: "statement",
          responsibility: "infrastructure",
          confidence: 0.9
        },
        {
          regionId: "callback",
          responsibility: "validation",
          confidence: 0.45
        }
      ]
    };

    expect(buildResponsibilitySpans(inlineRegions, inlineResult, 0.5)).toEqual([]);
  });

  it("lets a low-confidence callback shield an unknown child on the same line", () => {
    const inlineRegions: CodeRegion[] = [
      {
        id: "statement",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 0,
        endOffset: 51,
        source: "register(value => { return validatePending(value); })",
        depth: 0,
        childIds: ["callback"]
      },
      {
        id: "callback",
        type: "callback",
        startLine: 0,
        endLine: 0,
        startOffset: 9,
        endOffset: 50,
        source: "value => { return validatePending(value); }",
        depth: 1,
        parentId: "statement",
        childIds: ["return"]
      },
      {
        id: "return",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 20,
        endOffset: 48,
        source: "return validatePending(value);",
        depth: 2,
        parentId: "callback",
        childIds: []
      }
    ];
    const inlineResult: ClassificationResult = {
      filePath: "extension.ts",
      classifierVersion: "test:1",
      regions: [
        {
          regionId: "statement",
          responsibility: "infrastructure",
          confidence: 0.9
        },
        {
          regionId: "callback",
          responsibility: "validation",
          confidence: 0.45
        },
        { regionId: "return", responsibility: "unknown", confidence: 0.3 }
      ]
    };

    expect(buildResponsibilitySpans(inlineRegions, inlineResult, 0.5)).toEqual([]);
  });

  it("requires every callback in a one-line nested chain to be unknown", () => {
    const inlineRegions: CodeRegion[] = [
      {
        id: "statement",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 0,
        endOffset: 62,
        source: "register(values => values.map(value => { return value.id; }))",
        depth: 0,
        childIds: ["outer-callback"]
      },
      {
        id: "outer-callback",
        type: "callback",
        startLine: 0,
        endLine: 0,
        startOffset: 9,
        endOffset: 61,
        source: "values => values.map(value => { return value.id; })",
        depth: 1,
        parentId: "statement",
        childIds: ["inner-callback"]
      },
      {
        id: "inner-callback",
        type: "callback",
        startLine: 0,
        endLine: 0,
        startOffset: 30,
        endOffset: 59,
        source: "value => { return value.id; }",
        depth: 2,
        parentId: "outer-callback",
        childIds: ["return"]
      },
      {
        id: "return",
        type: "statement",
        startLine: 0,
        endLine: 0,
        startOffset: 41,
        endOffset: 57,
        source: "return value.id;",
        depth: 3,
        parentId: "inner-callback",
        childIds: []
      }
    ];
    const inlineResult: ClassificationResult = {
      filePath: "extension.ts",
      classifierVersion: "test:1",
      regions: [
        {
          regionId: "statement",
          responsibility: "infrastructure",
          confidence: 0.9
        },
        {
          regionId: "outer-callback",
          responsibility: "validation",
          confidence: 0.45
        },
        {
          regionId: "inner-callback",
          responsibility: "unknown",
          confidence: 0.3
        },
        { regionId: "return", responsibility: "unknown", confidence: 0.3 }
      ]
    };

    expect(buildResponsibilitySpans(inlineRegions, inlineResult, 0.5)).toEqual([]);
  });
});
