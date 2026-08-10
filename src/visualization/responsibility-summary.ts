import type { ClassificationResult } from "../domain/classification";
import type { CodeRegion } from "../domain/code-region";
import type { Responsibility } from "../domain/responsibility";
import { buildResponsibilitySpans } from "./line-map";

export interface ResponsibilitySummaryItem {
  responsibility: Responsibility;
  lineCount: number;
  percentage: number;
  firstLine: number;
}

export function buildResponsibilitySummary(
  regions: CodeRegion[],
  result: ClassificationResult,
  minimumConfidence: number
): ResponsibilitySummaryItem[] {
  const spans = buildResponsibilitySpans(regions, result, minimumConfidence);
  const aggregate = new Map<
    Responsibility,
    { lineCount: number; firstLine: number }
  >();
  for (const span of spans) {
    const lineCount = span.endLine - span.startLine + 1;
    const existing = aggregate.get(span.responsibility);
    aggregate.set(span.responsibility, {
      lineCount: (existing?.lineCount ?? 0) + lineCount,
      firstLine: Math.min(existing?.firstLine ?? span.startLine, span.startLine)
    });
  }
  const totalLines = [...aggregate.values()].reduce(
    (sum, item) => sum + item.lineCount,
    0
  );
  if (totalLines === 0) {
    return [];
  }
  return [...aggregate.entries()]
    .map(([responsibility, item]) => ({
      responsibility,
      lineCount: item.lineCount,
      percentage: Math.round((item.lineCount / totalLines) * 100),
      firstLine: item.firstLine
    }))
    .sort(
      (left, right) =>
        right.lineCount - left.lineCount ||
        left.responsibility.localeCompare(right.responsibility)
    );
}

