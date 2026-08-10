import { z } from "zod";

import type {
  ClassificationRequest,
  ClassificationResult
} from "../domain/classification";
import { RESPONSIBILITIES } from "../domain/responsibility";

export const classificationPayloadSchema = z
  .object({
    regions: z
      .array(
        z
          .object({
            regionId: z.string().min(1),
            responsibility: z.enum(RESPONSIBILITIES),
            confidence: z.number().min(0).max(1),
            explanation: z.string().trim().min(1).max(240)
          })
          .strict()
      )
      .max(400)
  })
  .strict();

export type ClassificationPayload = z.infer<typeof classificationPayloadSchema>;

export class ClassificationValidationError extends Error {
  override readonly name = "ClassificationValidationError";
}

export function validateClassificationPayload(
  value: unknown,
  request: ClassificationRequest,
  classifierVersion: string
): ClassificationResult {
  const parsed = classificationPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new ClassificationValidationError(
      `Classifier returned invalid structured output: ${z.prettifyError(parsed.error)}`
    );
  }

  const expectedIds = new Set(request.regions.map(({ id }) => id));
  const seenIds = new Set<string>();
  for (const classified of parsed.data.regions) {
    if (!expectedIds.has(classified.regionId)) {
      throw new ClassificationValidationError(
        `Classifier returned an unknown region id: ${classified.regionId}`
      );
    }
    if (seenIds.has(classified.regionId)) {
      throw new ClassificationValidationError(
        `Classifier returned a duplicate region id: ${classified.regionId}`
      );
    }
    seenIds.add(classified.regionId);
  }

  const missingIds = [...expectedIds].filter((id) => !seenIds.has(id));
  if (missingIds.length > 0) {
    throw new ClassificationValidationError(
      `Classifier omitted ${missingIds.length} region${missingIds.length === 1 ? "" : "s"}.`
    );
  }

  return {
    filePath: request.filePath,
    classifierVersion,
    regions: parsed.data.regions.map((classified) => ({
      regionId: classified.regionId,
      responsibility: classified.responsibility,
      confidence: classified.confidence,
      explanation: classified.explanation
    }))
  };
}
