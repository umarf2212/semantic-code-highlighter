export const REGION_MODEL_VERSION = "1";

export const CODE_REGION_TYPES = [
  "imports",
  "function",
  "method",
  "class",
  "interface",
  "type",
  "enum",
  "if",
  "else",
  "loop",
  "switch",
  "case",
  "try",
  "catch",
  "finally",
  "callback",
  "statement"
] as const;

export type CodeRegionType = (typeof CODE_REGION_TYPES)[number];

export interface CodeRegion {
  id: string;
  type: CodeRegionType;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  source: string;
  depth: number;
  childIds: string[];
  name?: string;
  parentId?: string;
}

