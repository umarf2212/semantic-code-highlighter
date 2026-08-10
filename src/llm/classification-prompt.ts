import type { ClassificationRequest } from "../domain/classification";
import { ONTOLOGY_VERSION, RESPONSIBILITY_METADATA } from "../domain/responsibility";

export const CLASSIFICATION_PROMPT_VERSION = "1";

export interface ClassificationMessages {
  system: string;
  user: string;
}

export function buildClassificationMessages(
  request: ClassificationRequest,
  retryReason?: string
): ClassificationMessages {
  const ontology = Object.entries(RESPONSIBILITY_METADATA)
    .map(([id, metadata]) => `- ${id}: ${metadata.description}`)
    .join("\n");
  const system = [
    "You classify source-code regions by semantic responsibility.",
    `Use only ontology version ${ONTOLOGY_VERSION}:`,
    ontology,
    "The AST supplied the regions and their hierarchy; never invent, omit, or duplicate region ids.",
    "Classify conservatively. Use mixed only for a broad region with multiple significant responsibilities, and unknown when evidence is insufficient.",
    "A parent may be mixed while specific children retain their own categories.",
    "Keep each explanation factual and under 160 characters. Return structured data only."
  ].join("\n\n");

  const payload = {
    promptVersion: CLASSIFICATION_PROMPT_VERSION,
    filePath: request.filePath,
    language: request.projectContext.language,
    ...(request.projectContext.packageInfo === undefined
      ? {}
      : { packageInfo: request.projectContext.packageInfo }),
    ...(request.projectContext.projectInstructions === undefined
      ? {}
      : { projectInstructions: request.projectContext.projectInstructions }),
    regions: request.regions.map((region) => ({
      regionId: region.id,
      type: region.type,
      ...(region.name === undefined ? {} : { name: region.name }),
      startLine: region.startLine,
      endLine: region.endLine,
      ...(region.parentId === undefined ? {} : { parentId: region.parentId })
    })),
    sourceCode: request.sourceCode
  };

  return {
    system,
    user: [
      retryReason === undefined
        ? "Classify every supplied region."
        : `The previous result was rejected: ${retryReason}. Classify every region again.`,
      JSON.stringify(payload)
    ].join("\n\n")
  };
}

