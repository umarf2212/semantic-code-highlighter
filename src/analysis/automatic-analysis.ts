export interface AutomaticAnalysisCandidate {
  enabled: boolean;
  scheme: string;
  languageId: string;
  isDirty: boolean;
  hasCurrentAnalysis: boolean;
  provider: "local" | "openai";
  openAIDisclosureAccepted: boolean;
}

const SUPPORTED_LANGUAGE_IDS = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact"
]);

export function shouldAnalyzeAutomatically(
  candidate: AutomaticAnalysisCandidate
): boolean {
  return (
    candidate.enabled &&
    candidate.scheme === "file" &&
    SUPPORTED_LANGUAGE_IDS.has(candidate.languageId) &&
    !candidate.isDirty &&
    !candidate.hasCurrentAnalysis &&
    (candidate.provider !== "openai" || candidate.openAIDisclosureAccepted)
  );
}

