import { z } from "zod";

import { findLineOwnershipChoices } from "./line-ownership";

import type {
  ClassificationRequest,
  ClassificationResult
} from "../domain/classification";
import { RESPONSIBILITIES } from "../domain/responsibility";

export const CLASSIFICATION_SCHEMA_VERSION = "2";

export const classificationPayloadSchema = z
  .object({
    lineOwners: z.array(z.object({
      line: z.number().int().min(0),
      regionId: z.string().min(1)
    }).strict()).max(400),
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

// Offline coding agents can cover larger files without the API response cap.
export const agentClassificationPayloadSchema = classificationPayloadSchema.extend({
  regions: z.array(classificationPayloadSchema.shape.regions.element).max(10_000),
  lineOwners: z.array(classificationPayloadSchema.shape.lineOwners.element).max(10_000)
});

export type ClassificationPayload = z.infer<typeof classificationPayloadSchema>;

export class ClassificationValidationError extends Error {
  override readonly name = "ClassificationValidationError";
}

export function validateClassificationPayload(
  value: unknown,
  request: ClassificationRequest,
  classifierVersion: string,
  schema = classificationPayloadSchema
): ClassificationResult {
  const parsed = schema.safeParse(value);
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

  const choices = new Map(findLineOwnershipChoices(request.regions)
    .map((choice) => [choice.line, choice.candidateRegionIds]));
  const ownedLines = new Set<number>();
  for (const owner of parsed.data.lineOwners) {
    if (ownedLines.has(owner.line) || !choices.get(owner.line)?.includes(owner.regionId)) {
      throw new ClassificationValidationError(
        `Invalid or duplicate line owner at line ${owner.line}; choose one supplied candidate per ambiguous line.`
      );
    }
    ownedLines.add(owner.line);
  }
  if (ownedLines.size !== choices.size) {
    throw new ClassificationValidationError("Classifier omitted ambiguous line ownership decisions.");
  }

  return {
    lineOwners: parsed.data.lineOwners,
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
