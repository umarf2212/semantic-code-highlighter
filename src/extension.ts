import * as vscode from "vscode";

import { LocalHeuristicClassifier } from "./analysis/local-classifier";
import { TypeScriptRegionExtractor } from "./analysis/region-extractor";
import { DefaultSourceFilter } from "./analysis/source-filter";
import { ProjectContextBuilder } from "./analysis/project-context-builder";
import { shouldAnalyzeAutomatically } from "./analysis/automatic-analysis";
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
import { runWithConcurrency } from "./utils/run-with-concurrency";
import { DecorationManager } from "./visualization/decoration-manager";
import { buildResponsibilitySummary } from "./visualization/responsibility-summary";

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

interface ResponsibilitySummaryQuickPickItem extends vscode.QuickPickItem {
  responsibility: Responsibility;
  firstLine: number;
}

const OPENAI_API_KEY_SECRET = "semanticCode.openaiApiKey";
const OPENAI_DISCLOSURE_KEY = "semanticCode.openaiDisclosureAccepted.v1";

export function activate(context: vscode.ExtensionContext): void {
  const extractor = new TypeScriptRegionExtractor();
  const projectContextBuilder = new ProjectContextBuilder();
  const localClassifier: CodeClassifier = new LocalHeuristicClassifier();
  const decorations = new DecorationManager();
  const cache = new WorkspaceAnalysisCache(context.workspaceState);
  const analyses = new Map<string, DocumentAnalysis>();
  let sessionVisible = true;
  let focusedResponsibility: Responsibility | undefined;
  let automaticTimer: ReturnType<typeof setTimeout> | undefined;
  let automaticAbortController: AbortController | undefined;
  const output = vscode.window.createOutputChannel("Semantic Code Highlighter", {
    log: true
  });

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
    progress: vscode.Progress<{ message?: string }>,
    signal: AbortSignal,
    targetEditor?: vscode.TextEditor,
    notifySkips = true
  ): Promise<AnalysisOutcome | undefined> => {
    if (!SUPPORTED_LANGUAGE_IDS.has(document.languageId)) {
      if (notifySkips) {
        await vscode.window.showWarningMessage(
          "Semantic Code Highlighter currently supports JavaScript and TypeScript files."
        );
      }
      return;
    }

    signal.throwIfAborted();
    progress.report({ message: "Checking source safety…" });
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
      if (notifySkips) {
        await vscode.window.showWarningMessage(
          `Semantic Code did not analyze this file: ${sourceDecision.reason ?? "excluded by the source filter"}`
        );
      }
      return;
    }
    const version = document.version;
    progress.report({ message: "Finding semantic regions…" });
    const regions = extractor.extract(document.uri.fsPath, sourceCode);
    signal.throwIfAborted();
    if (regions.length === 0) {
      if (notifySkips) {
        await vscode.window.showInformationMessage(
          "Semantic Code found no meaningful regions in this file."
        );
      }
      return;
    }
    const maxRegions = configuration.get<number>("maxRegions", 220);
    if (regions.length > maxRegions) {
      if (notifySkips) {
        await vscode.window.showWarningMessage(
          `Semantic Code found ${regions.length} regions, above the configured limit of ${maxRegions}. Raise semanticCode.maxRegions or analyze a smaller file.`
        );
      }
      return;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    progress.report({ message: "Reading bounded project context…" });
    const projectContext = await projectContextBuilder.build(
      document.uri.fsPath,
      workspaceFolder?.uri.fsPath ?? "",
      document.languageId
    );
    signal.throwIfAborted();
    const request = {
      filePath: workspaceFolder
        ? vscode.workspace.asRelativePath(document.uri, false)
        : document.uri.fsPath,
      sourceCode,
      regions,
      projectContext,
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
      progress.report({ message: provider === "openai" ? "Classifying with OpenAI…" : "Classifying locally…" });
      const classifier = await classifierFor(document);
      result = await classifier.classify(request);
      signal.throwIfAborted();
      if (cacheEnabled) {
        await cache.set(cacheKey, result);
      }
    } else {
      progress.report({ message: "Using unchanged cached analysis…" });
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
    progress.report({ message: "Rendering responsibility map…" });

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

  const cancelAutomaticAnalysis = (): void => {
    if (automaticTimer !== undefined) {
      clearTimeout(automaticTimer);
      automaticTimer = undefined;
    }
    automaticAbortController?.abort();
    automaticAbortController = undefined;
  };

  const scheduleAutomaticAnalysis = (document: vscode.TextDocument): void => {
    cancelAutomaticAnalysis();
    const configuration = vscode.workspace.getConfiguration(
      "semanticCode",
      document.uri
    );
    const existing = analyses.get(document.uri.toString());
    const provider = configuration.get<"local" | "openai">("provider", "local");
    if (
      !shouldAnalyzeAutomatically({
        enabled: configuration.get<boolean>("analyzeOnOpen", false),
        scheme: document.uri.scheme,
        languageId: document.languageId,
        isDirty: document.isDirty,
        hasCurrentAnalysis: existing?.version === document.version,
        provider,
        openAIDisclosureAccepted: context.workspaceState.get<boolean>(
          OPENAI_DISCLOSURE_KEY,
          false
        )
      })
    ) {
      return;
    }

    automaticTimer = setTimeout(() => {
      automaticTimer = undefined;
      const controller = new AbortController();
      automaticAbortController = controller;
      void analyzeDocument(
        document,
        { report: () => undefined },
        controller.signal,
        undefined,
        false
      )
        .then((outcome) => {
          if (outcome !== undefined) {
            output.info(
              `Automatic analysis mapped ${outcome.classifiedRegionCount} regions in ${vscode.workspace.asRelativePath(document.uri, false)}${outcome.cacheHit ? " from cache" : ""}.`
            );
          }
        })
        .catch((error: unknown) => {
          if (!isAbortError(error)) {
            output.error(
              `Automatic analysis failed for ${vscode.workspace.asRelativePath(document.uri, false)}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        })
        .finally(() => {
          if (automaticAbortController === controller) {
            automaticAbortController = undefined;
          }
        });
    }, 450);
  };

  context.subscriptions.push(
    decorations,
    output,
    { dispose: cancelAutomaticAnalysis },
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
    vscode.commands.registerCommand("semanticCode.analyzeWorkspace", async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder === undefined) {
        await vscode.window.showWarningMessage(
          "Open a workspace before running Semantic Code workspace analysis."
        );
        return;
      }
      const configuration = vscode.workspace.getConfiguration(
        "semanticCode",
        workspaceFolder.uri
      );
      const maximumFiles = configuration.get<number>("maxWorkspaceFiles", 50);
      const discovered = await vscode.workspace.findFiles(
        "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
        "**/{node_modules,bower_components,vendor,dist,build,out,coverage,.git,.next,.nuxt,generated}/**",
        maximumFiles + 1
      );
      const capped = discovered.length > maximumFiles;
      const uris = discovered
        .sort((left, right) => left.fsPath.localeCompare(right.fsPath))
        .slice(0, maximumFiles);
      if (uris.length === 0) {
        await vscode.window.showInformationMessage(
          "Semantic Code found no supported workspace files."
        );
        return;
      }

      const provider = configuration.get<"local" | "openai">("provider", "local");
      const scopeText = capped
        ? `the first ${uris.length} files (more were found)`
        : `${uris.length} file${uris.length === 1 ? "" : "s"}`;
      const detail =
        provider === "openai"
          ? `Analyze ${scopeText} with OpenAI? Each cache miss sends one filtered source file and may incur API usage.`
          : `Analyze ${scopeText} locally? Cached unchanged files will be reused.`;
      const actionLabel = `Analyze ${uris.length} File${uris.length === 1 ? "" : "s"}`;
      const action = await vscode.window.showWarningMessage(
        detail,
        { modal: true },
        actionLabel
      );
      if (action !== actionLabel) {
        return;
      }
      if (provider === "openai") {
        await context.workspaceState.update(OPENAI_DISCLOSURE_KEY, true);
      }

      let completed = 0;
      let mapped = 0;
      let skipped = 0;
      let cacheHits = 0;
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Mapping workspace responsibilities",
            cancellable: true
          },
          async (progress, token) => {
            const abortController = new AbortController();
            const cancellation = token.onCancellationRequested(() => {
              abortController.abort();
            });
            const configuredConcurrency = configuration.get<number>(
              "workspaceConcurrency",
              2
            );
            const concurrency = provider === "openai" ? 1 : configuredConcurrency;
            try {
              await runWithConcurrency(uris, concurrency, async (uri) => {
                abortController.signal.throwIfAborted();
                const document = await vscode.workspace.openTextDocument(uri);
                const outcome = await analyzeDocument(
                  document,
                  {
                    report: ({ message }) => {
                      if (message !== undefined) {
                        progress.report({
                          message: `${completed + 1}/${uris.length} ${vscode.workspace.asRelativePath(uri, false)} — ${message}`
                        });
                      }
                    }
                  },
                  abortController.signal,
                  undefined,
                  false
                );
                completed += 1;
                progress.report({ increment: 100 / uris.length });
                if (outcome === undefined) {
                  skipped += 1;
                } else {
                  mapped += 1;
                  if (outcome.cacheHit) {
                    cacheHits += 1;
                  }
                }
              });
            } finally {
              cancellation.dispose();
            }
          }
        );
      } catch (error) {
        if (isAbortError(error)) {
          vscode.window.setStatusBarMessage(
            `Semantic Code workspace analysis cancelled after ${completed}/${uris.length} files`,
            3000
          );
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(
          `Semantic Code workspace analysis stopped: ${message}`
        );
        return;
      }
      await vscode.window.showInformationMessage(
        `Semantic Code mapped ${mapped} file${mapped === 1 ? "" : "s"}; ${cacheHits} cache hit${cacheHits === 1 ? "" : "s"}; ${skipped} skipped.`
      );
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
    vscode.commands.registerCommand(
      "semanticCode.showResponsibilitySummary",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          await vscode.window.showWarningMessage(
            "Open a source file before viewing its responsibility summary."
          );
          return;
        }
        const analysis = analyses.get(editor.document.uri.toString());
        if (analysis === undefined || analysis.version !== editor.document.version) {
          const action = await vscode.window.showInformationMessage(
            "Analyze this file before viewing its responsibility summary.",
            "Analyze Now"
          );
          if (action === "Analyze Now") {
            await vscode.commands.executeCommand("semanticCode.analyzeCurrentFile");
            await vscode.commands.executeCommand(
              "semanticCode.showResponsibilitySummary"
            );
          }
          return;
        }
        const minimumConfidence = vscode.workspace
          .getConfiguration("semanticCode", editor.document.uri)
          .get<number>("minimumConfidence", 0.5);
        const summary = buildResponsibilitySummary(
          analysis.regions,
          analysis.result,
          minimumConfidence
        );
        if (summary.length === 0) {
          await vscode.window.showInformationMessage(
            "No classifications meet the current confidence threshold."
          );
          return;
        }
        const items: ResponsibilitySummaryQuickPickItem[] = summary.map((item) => ({
          label: `${RESPONSIBILITY_METADATA[item.responsibility].label} — ${item.percentage}%`,
          description: `${item.lineCount} colored line${item.lineCount === 1 ? "" : "s"}`,
          detail: RESPONSIBILITY_METADATA[item.responsibility].description,
          responsibility: item.responsibility,
          firstLine: item.firstLine
        }));
        const selected = await vscode.window.showQuickPick(items, {
          title: "Responsibility distribution",
          placeHolder: "Choose a responsibility to focus and reveal its first region"
        });
        if (selected === undefined) {
          return;
        }
        focusedResponsibility = selected.responsibility;
        sessionVisible = true;
        applyToVisibleEditors(editor.document.uri);
        const position = new vscode.Position(selected.firstLine, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
      }
    ),
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
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor !== undefined) {
        scheduleAutomaticAnalysis(editor.document);
      } else {
        cancelAutomaticAnalysis();
      }
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
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        cancelAutomaticAnalysis();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        scheduleAutomaticAnalysis(document);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("semanticCode")) {
        decorations.reloadConfiguration();
        applyToVisibleEditors();
        const activeDocument = vscode.window.activeTextEditor?.document;
        if (activeDocument !== undefined) {
          scheduleAutomaticAnalysis(activeDocument);
        }
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      decorations.reloadConfiguration();
      applyToVisibleEditors();
    })
  );

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument !== undefined) {
    scheduleAutomaticAnalysis(activeDocument);
  }
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
