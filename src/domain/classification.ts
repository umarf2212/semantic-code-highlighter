import type { CodeRegion } from "./code-region";
import type { ProjectContext } from "./project-context";
import type { Responsibility } from "./responsibility";

export interface ClassificationRequest {
  filePath: string;
  sourceCode: string;
  regions: CodeRegion[];
  projectContext: ProjectContext;
  signal?: AbortSignal;
}

export interface ClassifiedRegion {
  regionId: string;
  responsibility: Responsibility;
  confidence: number;
  explanation?: string;
}

export interface ClassificationResult {
  filePath: string;
  regions: ClassifiedRegion[];
  classifierVersion: string;
}

export interface CodeClassifier {
  readonly id: string;
  readonly version: string;
  classify(request: ClassificationRequest): Promise<ClassificationResult>;
}

export interface ClassifierIdentity {
  readonly id: string;
  readonly version: string;
}
