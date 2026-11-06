import { findLineOwnershipChoices } from "../analysis/line-ownership";

import type { ClassificationResult } from "../domain/classification";
import type { CodeRegion, CodeRegionType } from "../domain/code-region";
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
  renderable: boolean;
  regionType: CodeRegionType;
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
    if (region === undefined) {
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
      regionType: region.type,
      renderable:
        classified.responsibility !== "unknown" &&
        classified.confidence >= minimumConfidence,
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

  const allowedOwners = new Map(findLineOwnershipChoices(regions)
    .map((choice) => [choice.line, choice.candidateRegionIds]));
  const modelOwners = new Map(result.lineOwners?.map((owner) => [owner.line, owner.regionId]));
  const winners = [...candidatesByLine.entries()]
    .sort(([left], [right]) => left - right)
    .map(([line, candidates]) => ({
      line,
      winner: candidates.find((candidate) =>
        candidate.regionId === modelOwners.get(line) &&
        allowedOwners.get(line)?.includes(candidate.regionId)
      ) ?? pickWinner(candidates, regionById)
    }));

  const spans: ResponsibilitySpan[] = [];
  for (const { line, winner } of winners) {
    if (winner === undefined || !winner.renderable) {
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

function pickWinner(
  candidates: LineCandidate[],
  regionById: Map<string, CodeRegion>
): LineCandidate | undefined {
  const maximumDepth = Math.max(...candidates.map(({ depth }) => depth));
  const deepest = candidates.filter(({ depth }) => depth === maximumDepth);
  const winner = [...deepest].sort(
    (left, right) =>
      responsibilityPriority(right.responsibility) -
        responsibilityPriority(left.responsibility) ||
      left.lineSpan - right.lineSpan ||
      right.confidence - left.confidence ||
      left.regionId.localeCompare(right.regionId)
  )[0];

  if (
    winner !== undefined &&
    !winner.renderable &&
    winner.responsibility === "unknown" &&
    winner.lineSpan === 1 &&
    isWithinOneLineUnknownCallback(winner.regionId, candidates, regionById)
  ) {
    return candidates
      .filter(
        (candidate) =>
          candidate.renderable &&
          candidate.regionType === "statement" &&
          candidate.lineSpan === 1 &&
          isAncestor(candidate.regionId, winner.regionId, regionById)
      )
      .sort(
        (left, right) =>
          right.depth - left.depth ||
          right.confidence - left.confidence ||
          left.regionId.localeCompare(right.regionId)
      )[0] ?? winner;
  }

  return winner;
}

function isWithinOneLineUnknownCallback(
  regionId: string,
  candidates: LineCandidate[],
  regionById: Map<string, CodeRegion>
): boolean {
  let region = regionById.get(regionId);
  let sawCallback = false;
  while (region !== undefined) {
    if (region.type === "callback") {
      sawCallback = true;
      const callbackCandidate = candidates.find(
        (candidate) => candidate.regionId === region?.id
      );
      if (
        region.startLine !== region.endLine ||
        callbackCandidate?.responsibility !== "unknown"
      ) {
        return false;
      }
    }
    region = region.parentId === undefined ? undefined : regionById.get(region.parentId);
  }
  return sawCallback;
}

function isAncestor(
  ancestorId: string,
  descendantId: string,
  regionById: Map<string, CodeRegion>
): boolean {
  let parentId = regionById.get(descendantId)?.parentId;
  while (parentId !== undefined) {
    if (parentId === ancestorId) {
      return true;
    }
    parentId = regionById.get(parentId)?.parentId;
  }
  return false;
}

function responsibilityPriority(responsibility: Responsibility): number {
  if (responsibility === "unknown") {
    return 0;
  }
  if (responsibility === "mixed") {
    return 1;
  }
  return 2;
}
