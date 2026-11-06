import type { CodeRegion } from "../domain/code-region";

export interface LineOwnershipChoice {
  line: number;
  candidateRegionIds: string[];
}

/** Only indivisible single-line collisions are open to semantic arbitration. */
export function findLineOwnershipChoices(regions: CodeRegion[]): LineOwnershipChoice[] {
  const byLine = new Map<number, CodeRegion[]>();
  for (const region of regions) {
    for (let line = region.startLine; line <= region.endLine; line += 1) {
      const candidates = byLine.get(line) ?? [];
      candidates.push(region);
      byLine.set(line, candidates);
    }
  }
  return [...byLine.entries()].sort(([a], [b]) => a - b).flatMap(([line, regions]) => {
    // An uncertain multi-line child must still shield its ancestors.
    const multiLineDepth = Math.max(-1, ...regions
      .filter((region) => region.startLine !== region.endLine)
      .map((region) => region.depth));
    const candidates = regions.filter((region) =>
      region.startLine === region.endLine && region.depth > multiLineDepth
    );
    return candidates.length < 2 ? [] : [{
      line,
      candidateRegionIds: candidates.map((region) => region.id).sort()
    }];
  });
}
