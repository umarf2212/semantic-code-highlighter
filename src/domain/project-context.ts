export interface ProjectContext {
  workspaceRoot: string;
  language: string;
  packageInfo?: unknown;
  relevantFiles?: string[];
  projectInstructions?: string;
}

