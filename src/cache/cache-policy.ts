import type { ClassificationResult } from "../domain/classification";

export function resultForPersistentCache(
  result: ClassificationResult,
  provider: "local" | "openai"
): ClassificationResult {
  if (provider === "local") {
    return result;
  }
  return {
    ...result,
    regions: result.regions.map(({ regionId, responsibility, confidence }) => ({
      regionId,
      responsibility,
      confidence
    }))
  };
}
