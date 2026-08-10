import type { ClassificationResult } from "../domain/classification";
import type { CodeRegion } from "../domain/code-region";
import type { Responsibility } from "../domain/responsibility";

export interface ResponsibilitySpan {
  startLine: number;
  endLine: number;
  regionId: string;
  responsibility: Responsibility;
  confidence: number;
  explanation?: string;
}

interface LineCandidate extends ResponsibilitySpan {
  depth: number;
  lineSpan: number;
}

export function buildResponsibilitySpans(
  regions: CodeRegion[],
  result: ClassificationResult,
  minimumConfidence: number
): ResponsibilitySpan[] {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const candidatesByLine = new Map<number, LineCandidate[]>();

  for (const classified of result.regions) {
    const region = regionById.get(classified.regionId);
    if (
      region === undefined ||
      classified.responsibility === "unknown" ||
      classified.confidence < minimumConfidence
    ) {
      continue;
    }
    const candidate: LineCandidate = {
      startLine: region.startLine,
      endLine: region.endLine,
      regionId: region.id,
      responsibility: classified.responsibility,
      confidence: classified.confidence,
      depth: region.depth,
      lineSpan: region.endLine - region.startLine + 1,
      ...(classified.explanation === undefined
        ? {}
        : { explanation: classified.explanation })
    };
    for (let line = region.startLine; line <= region.endLine; line += 1) {
      const existing = candidatesByLine.get(line) ?? [];
      existing.push(candidate);
      candidatesByLine.set(line, existing);
    }
  }

  const winners = [...candidatesByLine.entries()]
    .sort(([left], [right]) => left - right)
    .map(([line, candidates]) => ({ line, winner: pickWinner(candidates) }));

  const spans: ResponsibilitySpan[] = [];
  for (const { line, winner } of winners) {
    if (winner === undefined) {
      continue;
    }
    const previous = spans.at(-1);
    if (
      previous !== undefined &&
      previous.endLine + 1 === line &&
      previous.regionId === winner.regionId &&
      previous.responsibility === winner.responsibility
    ) {
      previous.endLine = line;
      continue;
    }
    spans.push({
      startLine: line,
      endLine: line,
      regionId: winner.regionId,
      responsibility: winner.responsibility,
      confidence: winner.confidence,
      ...(winner.explanation === undefined ? {} : { explanation: winner.explanation })
    });
  }
  return spans;
}

function pickWinner(candidates: LineCandidate[]): LineCandidate | undefined {
  const specific = candidates.filter(({ responsibility }) => responsibility !== "mixed");
  const pool = specific.length > 0 ? specific : candidates;
  return [...pool].sort(
    (left, right) =>
      right.depth - left.depth ||
      left.lineSpan - right.lineSpan ||
      right.confidence - left.confidence ||
      left.regionId.localeCompare(right.regionId)
  )[0];
}

