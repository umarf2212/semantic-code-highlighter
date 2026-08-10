import * as vscode from "vscode";

import { LocalHeuristicClassifier } from "./analysis/local-classifier";
import { TypeScriptRegionExtractor } from "./analysis/region-extractor";
import { DefaultSourceFilter } from "./analysis/source-filter";
import {
  createAnalysisCacheKey,
  WorkspaceAnalysisCache
} from "./cache/analysis-cache";
import type {
  ClassificationResult,
  CodeClassifier
} from "./domain/classification";
import type { CodeRegion } from "./domain/code-region";
import {
  RESPONSIBILITIES,
  RESPONSIBILITY_METADATA,
  type Responsibility
} from "./domain/responsibility";
import { OpenAIClassifier } from "./llm/openai-classifier";
import { CLASSIFICATION_PROMPT_VERSION } from "./llm/classification-prompt";
import { DecorationManager } from "./visualization/decoration-manager";

const SUPPORTED_LANGUAGE_IDS = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact"
]);

interface DocumentAnalysis {
  version: number;
  regions: CodeRegion[];
  result: ClassificationResult;
}

interface AnalysisOutcome {
  cacheHit: boolean;
  classifiedRegionCount: number;
  responsibilityCount: number;
}

interface ResponsibilityQuickPickItem extends vscode.QuickPickItem {
  responsibility?: Responsibility;
}

const OPENAI_API_KEY_SECRET = "semanticCode.openaiApiKey";
const OPENAI_DISCLOSURE_KEY = "semanticCode.openaiDisclosureAccepted.v1";

export function activate(context: vscode.ExtensionContext): void {
  const extractor = new TypeScriptRegionExtractor();
  const localClassifier: CodeClassifier = new LocalHeuristicClassifier();
  const decorations = new DecorationManager();
  const cache = new WorkspaceAnalysisCache(context.workspaceState);
  const analyses = new Map<string, DocumentAnalysis>();
  let sessionVisible = true;
  let focusedResponsibility: Responsibility | undefined;

  const classifierFor = async (document: vscode.TextDocument): Promise<CodeClassifier> => {
    const configuration = vscode.workspace.getConfiguration(
      "semanticCode",
      document.uri
    );
    const provider = configuration.get<"local" | "openai">("provider", "local");
    if (provider === "local") {
      return localClassifier;
    }

    let apiKey = await context.secrets.get(OPENAI_API_KEY_SECRET);
    if (apiKey === undefined) {
      const action = await vscode.window.showWarningMessage(
        "OpenAI classification needs an API key. It will be stored in VS Code SecretStorage, never in this repository.",
        "Set API Key"
      );
      if (action === "Set API Key") {
        await vscode.commands.executeCommand("semanticCode.setOpenAIKey");
        apiKey = await context.secrets.get(OPENAI_API_KEY_SECRET);
      }
    }
    if (apiKey === undefined) {
      throw new Error("No OpenAI API key is configured.");
    }
    const model = configuration.get<string>("model", "gpt-5.4-nano");
    return new OpenAIClassifier({ apiKey, model });
  };

  const applyToVisibleEditors = (uri?: vscode.Uri): void => {
    for (const editor of vscode.window.visibleTextEditors) {
      if (uri !== undefined && editor.document.uri.toString() !== uri.toString()) {
        continue;
      }
      const analysis = analyses.get(editor.document.uri.toString());
      const enabled = vscode.workspace
        .getConfiguration("semanticCode", editor.document.uri)
        .get<boolean>("enabled", true);
      if (
        analysis === undefined ||
        analysis.version !== editor.document.version ||
        !sessionVisible ||
        !enabled
      ) {
        decorations.clear(editor);
      } else {
        decorations.apply(
          editor,
          analysis.regions,
          analysis.result,
          focusedResponsibility
        );
      }
    }
  };

  const analyzeDocument = async (
    document: vscode.TextDocument,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    signal: AbortSignal,
    targetEditor?: vscode.TextEditor
  ): Promise<AnalysisOutcome | undefined> => {
    if (!SUPPORTED_LANGUAGE_IDS.has(document.languageId)) {
      await vscode.window.showWarningMessage(
        "Semantic Code Highlighter currently supports JavaScript and TypeScript files."
      );
      return;
    }

    signal.throwIfAborted();
    progress.report({ message: "Checking source safety…", increment: 10 });
    const configuration = vscode.workspace.getConfiguration(
      "semanticCode",
      document.uri
    );
    const sourceCode = document.getText();
    const maxFileSizeKb = configuration.get<number>("maxFileSizeKb", 256);
    const sourceDecision = new DefaultSourceFilter(maxFileSizeKb * 1024).evaluate(
      document.uri.fsPath,
      sourceCode
    );
    if (!sourceDecision.allowed) {
      await vscode.window.showWarningMessage(
        `Semantic Code did not analyze this file: ${sourceDecision.reason ?? "excluded by the source filter"}`
      );
      return;
    }
    const version = document.version;
    progress.report({ message: "Finding semantic regions…", increment: 20 });
    const regions = extractor.extract(document.uri.fsPath, sourceCode);
    signal.throwIfAborted();
    if (regions.length === 0) {
      await vscode.window.showInformationMessage(
        "Semantic Code found no meaningful regions in this file."
      );
      return;
    }
    const maxRegions = configuration.get<number>("maxRegions", 220);
    if (regions.length > maxRegions) {
      await vscode.window.showWarningMessage(
        `Semantic Code found ${regions.length} regions, above the configured limit of ${maxRegions}. Raise semanticCode.maxRegions or analyze a smaller file.`
      );
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const request = {
      filePath: workspaceFolder
        ? vscode.workspace.asRelativePath(document.uri, false)
        : document.uri.fsPath,
      sourceCode,
      regions,
      projectContext: {
        workspaceRoot: workspaceFolder?.uri.fsPath ?? "",
        language: document.languageId
      },
      signal
    };
    const provider = configuration.get<"local" | "openai">("provider", "local");
    const model = configuration.get<string>("model", "gpt-5.4-nano");
    const identity =
      provider === "openai"
        ? { id: OpenAIClassifier.idFor(model), version: CLASSIFICATION_PROMPT_VERSION }
        : localClassifier;
    const cacheKey = createAnalysisCacheKey(request, identity);
    const cacheEnabled = configuration.get<boolean>("cacheEnabled", true);
    let result = cacheEnabled ? await cache.get(cacheKey) : undefined;
    const cacheHit = result !== undefined;

    if (result === undefined) {
      if (provider === "openai") {
        const accepted = context.workspaceState.get<boolean>(OPENAI_DISCLOSURE_KEY, false);
        if (!accepted) {
          const action = await vscode.window.showWarningMessage(
            "OpenAI analysis sends this file's source code, relative path, and AST region metadata to OpenAI. The request uses store: false; obvious secrets and generated files are filtered.",
            { modal: true },
            "Analyze and Remember"
          );
          if (action !== "Analyze and Remember") {
            return;
          }
          await context.workspaceState.update(OPENAI_DISCLOSURE_KEY, true);
        }
      }
      progress.report({ message: provider === "openai" ? "Classifying with OpenAI…" : "Classifying locally…", increment: 35 });
      const classifier = await classifierFor(document);
      result = await classifier.classify(request);
      signal.throwIfAborted();
      if (cacheEnabled) {
        await cache.set(cacheKey, result);
      }
    } else {
      progress.report({ message: "Using unchanged cached analysis…", increment: 35 });
    }

    if (document.version !== version) {
      return;
    }
    signal.throwIfAborted();
    analyses.set(document.uri.toString(), { version, regions, result });
    sessionVisible = true;
    if (targetEditor !== undefined) {
      decorations.apply(targetEditor, regions, result, focusedResponsibility);
    }
    applyToVisibleEditors(document.uri);
    progress.report({ message: "Rendering responsibility map…", increment: 35 });

    const minimumConfidence = configuration.get<number>("minimumConfidence", 0.5);
    const visibleClassifications = result.regions.filter(
      ({ confidence, responsibility }) =>
        responsibility !== "unknown" && confidence >= minimumConfidence
    );
    return {
      cacheHit,
      classifiedRegionCount: visibleClassifications.length,
      responsibilityCount: new Set(
        visibleClassifications.map(({ responsibility }) => responsibility)
      ).size
    };
  };

  context.subscriptions.push(
    decorations,
    vscode.commands.registerCommand("semanticCode.analyzeCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        await vscode.window.showWarningMessage("Open a source file before analyzing it.");
        return;
      }
      try {
        const outcome = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Mapping code responsibilities",
            cancellable: true
          },
          async (progress, token) => {
            const abortController = new AbortController();
            const cancellation = token.onCancellationRequested(() => {
              abortController.abort();
            });
            try {
              return await analyzeDocument(
                editor.document,
                progress,
                abortController.signal,
                editor
              );
            } finally {
              cancellation.dispose();
            }
          }
        );
        if (outcome !== undefined) {
          vscode.window.setStatusBarMessage(
            `Semantic Code: ${outcome.classifiedRegionCount} regions across ${outcome.responsibilityCount} responsibilities${outcome.cacheHit ? " (cached)" : ""}`,
            4000
          );
        }
      } catch (error) {
        if (isAbortError(error)) {
          vscode.window.setStatusBarMessage("Semantic Code analysis cancelled", 1800);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Semantic Code analysis failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("semanticCode.clearAnalysis", () => {
      analyses.clear();
      decorations.clearAll();
      vscode.window.setStatusBarMessage("Semantic Code visible analysis cleared", 1800);
    }),
    vscode.commands.registerCommand("semanticCode.clearCache", async () => {
      await cache.clear();
      analyses.clear();
      decorations.clearAll();
      await vscode.window.showInformationMessage("Semantic Code cached analysis cleared.");
    }),
    vscode.commands.registerCommand("semanticCode.toggleVisualization", async () => {
      sessionVisible = !sessionVisible;
      applyToVisibleEditors();
      vscode.window.setStatusBarMessage(
        `Semantic Code responsibility map ${sessionVisible ? "shown" : "hidden"}`,
        1800
      );
    }),
    vscode.commands.registerCommand("semanticCode.focusResponsibility", async () => {
      const items: ResponsibilityQuickPickItem[] = [
        {
          label: "$(eye) Show all responsibilities",
          description: "Clear the active lens"
        },
        ...RESPONSIBILITIES.filter(
          (responsibility) => responsibility !== "unknown" && responsibility !== "mixed"
        ).map((responsibility) => ({
          label: RESPONSIBILITY_METADATA[responsibility].label,
          description: RESPONSIBILITY_METADATA[responsibility].description,
          responsibility
        }))
      ];
      const selected = await vscode.window.showQuickPick(items, {
        title: "Focus the responsibility map",
        placeHolder: "Show only one semantic responsibility"
      });
      if (selected === undefined) {
        return;
      }
      focusedResponsibility = selected.responsibility;
      sessionVisible = true;
      applyToVisibleEditors();
      vscode.window.setStatusBarMessage(
        focusedResponsibility === undefined
          ? "Semantic Code lens cleared"
          : `Semantic Code lens: ${RESPONSIBILITY_METADATA[focusedResponsibility].label}`,
        2400
      );
    }),
    vscode.commands.registerCommand("semanticCode.setOpenAIKey", async () => {
      const apiKey = await vscode.window.showInputBox({
        title: "Semantic Code: OpenAI API Key",
        prompt: "Stored securely by VS Code and used only when the OpenAI provider is selected.",
        placeHolder: "sk-...",
        password: true,
        ignoreFocusOut: true
      });
      if (apiKey !== undefined && apiKey.trim().length > 0) {
        await context.secrets.store(OPENAI_API_KEY_SECRET, apiKey.trim());
        await vscode.window.showInformationMessage("OpenAI API key stored in VS Code SecretStorage.");
      }
    }),
    vscode.commands.registerCommand("semanticCode.forgetOpenAIKey", async () => {
      await context.secrets.delete(OPENAI_API_KEY_SECRET);
      await vscode.window.showInformationMessage("OpenAI API key removed from VS Code SecretStorage.");
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      applyToVisibleEditors();
    }),
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      if (contentChanges.length === 0) {
        return;
      }
      analyses.delete(document.uri.toString());
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === document.uri.toString()) {
          decorations.clear(editor);
        }
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      analyses.delete(document.uri.toString());
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("semanticCode")) {
        decorations.reloadConfiguration();
        applyToVisibleEditors();
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      decorations.reloadConfiguration();
      applyToVisibleEditors();
    })
  );
}

export function deactivate(): void {
  // VS Code disposes everything registered through the extension context.
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && /abort|cancel/i.test(`${error.name} ${error.message}`))
  );
}
