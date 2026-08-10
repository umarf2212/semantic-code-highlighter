import * as vscode from "vscode";

import { LocalHeuristicClassifier } from "./analysis/local-classifier";
import { TypeScriptRegionExtractor } from "./analysis/region-extractor";
import { DefaultSourceFilter } from "./analysis/source-filter";
import { ProjectContextBuilder } from "./analysis/project-context-builder";
import { shouldAnalyzeAutomatically } from "./analysis/automatic-analysis";
import { nonIdentifyingFileLabel } from "./analysis/file-label";
import { effectiveRegionLimit } from "./analysis/analysis-limits";
import {
  createAnalysisCacheKey,
  createContentHash,
  WorkspaceAnalysisCache
} from "./cache/analysis-cache";
import type {
  ClassificationResult,
  CodeClassifier
} from "./domain/classification";
import type { CodeRegion } from "./domain/code-region";
import {
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
  contentHash: string;
  providerLabel: string;
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

interface FrozenClassifierPlan {
  provider: "local" | "openai";
  model: string;
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
  const focusedResponsibilities = new Map<string, Responsibility>();
  const runEpochs = new Map<string, number>();
  let globalEpoch = 0;
  let sessionVisible = true;
  let automaticTimer: ReturnType<typeof setTimeout> | undefined;
  let automaticAbortController: AbortController | undefined;
  const activeAnalysisControllers = new Set<AbortController>();
  const output = vscode.window.createOutputChannel("Semantic Code Highlighter", {
    log: true
  });
  const mapStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  mapStatus.command = "semanticCode.toggleVisualization";
  const lensStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );
  lensStatus.command = "semanticCode.focusResponsibility";

  const currentAnalysisFor = (
    document: vscode.TextDocument
  ): DocumentAnalysis | undefined => {
    const analysis = analyses.get(document.uri.toString());
    return analysis !== undefined &&
      analysis.contentHash === createContentHash(document.getText())
      ? analysis
      : undefined;
  };

  const focusedFor = (uri: vscode.Uri): Responsibility | undefined =>
    focusedResponsibilities.get(uri.toString());

  const updateStatusBars = (editor = vscode.window.activeTextEditor): void => {
    if (editor === undefined) {
      mapStatus.hide();
      lensStatus.hide();
      return;
    }
    const analysis = currentAnalysisFor(editor.document);
    if (analysis === undefined) {
      mapStatus.hide();
    } else {
      mapStatus.text = sessionVisible
        ? `$(symbol-color) Semantic: ${analysis.providerLabel}`
        : "$(eye-closed) Semantic: Hidden";
      mapStatus.tooltip = sessionVisible
        ? `Responsibility map from ${analysis.providerLabel}. Click to hide.`
        : "Responsibility map hidden. Click to show.";
      mapStatus.show();
    }
    const focused = focusedFor(editor.document.uri);
    if (focused === undefined) {
      lensStatus.hide();
    } else {
      lensStatus.text = `$(filter) ${RESPONSIBILITY_METADATA[focused].label}`;
      lensStatus.tooltip = "A responsibility lens is active. Click to change or clear it.";
      lensStatus.show();
    }
  };

  const classifierFor = async (
    provider: "local" | "openai",
    model: string
  ): Promise<CodeClassifier> => {
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
    return new OpenAIClassifier({ apiKey, model });
  };

  const applyToVisibleEditors = (uri?: vscode.Uri): void => {
    for (const editor of vscode.window.visibleTextEditors) {
      if (uri !== undefined && editor.document.uri.toString() !== uri.toString()) {
        continue;
      }
      const analysis = currentAnalysisFor(editor.document);
      const enabled = vscode.workspace
        .getConfiguration("semanticCode", editor.document.uri)
        .get<boolean>("enabled", true);
      if (
        analysis === undefined ||
        !sessionVisible ||
        !enabled
      ) {
        decorations.clear(editor);
      } else {
        decorations.apply(
          editor,
          analysis.regions,
          analysis.result,
          focusedFor(editor.document.uri)
        );
      }
    }
    updateStatusBars();
  };

  const analyzeDocument = async (
    document: vscode.TextDocument,
    progress: vscode.Progress<{ message?: string }>,
    signal: AbortSignal,
    targetEditor?: vscode.TextEditor,
    notifySkips = true,
    frozenClassifierPlan?: FrozenClassifierPlan
  ): Promise<AnalysisOutcome | undefined> => {
    const uriKey = document.uri.toString();
    const runEpoch = (runEpochs.get(uriKey) ?? 0) + 1;
    runEpochs.set(uriKey, runEpoch);
    const startedGlobalEpoch = globalEpoch;
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
    const provider =
      frozenClassifierPlan?.provider ??
      configuration.get<"local" | "openai">("provider", "local");
    const model =
      frozenClassifierPlan?.model ??
      configuration.get<string>("model", "gpt-5.4-nano");
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
    const configuredMaxRegions = configuration.get<number>("maxRegions", 220);
    const effectiveMaxRegions = effectiveRegionLimit(
      configuredMaxRegions,
      provider
    );
    if (regions.length > effectiveMaxRegions) {
      if (notifySkips) {
        await vscode.window.showWarningMessage(
          provider === "openai" && configuredMaxRegions > 400
            ? `Semantic Code found ${regions.length} regions. OpenAI analysis supports at most 400 regions per file; analyze a smaller file or use the local provider.`
            : `Semantic Code found ${regions.length} regions, above the configured limit of ${effectiveMaxRegions}. Raise semanticCode.maxRegions or analyze a smaller file.`
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
        : nonIdentifyingFileLabel(document.uri.path),
      sourceCode,
      regions,
      projectContext,
      signal
    };
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
      const classifier = await classifierFor(provider, model);
      result = await classifier.classify(request);
      signal.throwIfAborted();
      if (
        runEpochs.get(uriKey) !== runEpoch ||
        globalEpoch !== startedGlobalEpoch
      ) {
        return;
      }
      if (cacheEnabled) {
        await cache.set(cacheKey, result);
      }
    } else {
      progress.report({ message: "Using unchanged cached analysis…" });
    }

    if (
      document.version !== version ||
      createContentHash(document.getText()) !== createContentHash(sourceCode)
    ) {
      return;
    }
    signal.throwIfAborted();
    if (
      runEpochs.get(uriKey) !== runEpoch ||
      globalEpoch !== startedGlobalEpoch
    ) {
      return;
    }
    const providerLabel = provider === "openai" ? `OpenAI · ${model}` : "Local";
    if (!analyses.has(uriKey) && analyses.size >= 200) {
      const oldestKey = analyses.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        analyses.delete(oldestKey);
        focusedResponsibilities.delete(oldestKey);
      }
    }
    analyses.set(uriKey, {
      version,
      contentHash: createContentHash(sourceCode),
      providerLabel,
      regions,
      result
    });
    const existingFocus = focusedResponsibilities.get(uriKey);
    if (
      existingFocus !== undefined &&
      !result.regions.some(
        ({ responsibility, confidence }) =>
          responsibility === existingFocus &&
          confidence >= configuration.get<number>("minimumConfidence", 0.5)
      )
    ) {
      focusedResponsibilities.delete(uriKey);
    }
    if (targetEditor !== undefined) {
      decorations.apply(targetEditor, regions, result, focusedFor(document.uri));
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

  const abortAllAnalyses = (): void => {
    cancelAutomaticAnalysis();
    for (const controller of activeAnalysisControllers) {
      controller.abort();
    }
    activeAnalysisControllers.clear();
  };

  const scheduleAutomaticAnalysis = (document: vscode.TextDocument): void => {
    cancelAutomaticAnalysis();
    const configuration = vscode.workspace.getConfiguration(
      "semanticCode",
      document.uri
    );
    const existing = currentAnalysisFor(document);
    const provider = configuration.get<"local" | "openai">("provider", "local");
    if (
      !shouldAnalyzeAutomatically({
        enabled: configuration.get<boolean>("analyzeOnOpen", false),
        scheme: document.uri.scheme,
        languageId: document.languageId,
        isDirty: document.isDirty,
        hasCurrentAnalysis: existing !== undefined,
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
      activeAnalysisControllers.add(controller);
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
          activeAnalysisControllers.delete(controller);
        });
    }, 450);
  };

  context.subscriptions.push(
    decorations,
    output,
    mapStatus,
    lensStatus,
    { dispose: abortAllAnalyses },
    vscode.commands.registerCommand("semanticCode.analyzeCurrentFile", async () => {
      cancelAutomaticAnalysis();
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        await vscode.window.showWarningMessage("Open a source file before analyzing it.");
        return;
      }
      sessionVisible = true;
      updateStatusBars(editor);
      try {
        const outcome = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Mapping code responsibilities",
            cancellable: true
          },
          async (progress, token) => {
            const abortController = new AbortController();
            activeAnalysisControllers.add(abortController);
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
              activeAnalysisControllers.delete(abortController);
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
      cancelAutomaticAnalysis();
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders === undefined || workspaceFolders.length === 0) {
        await vscode.window.showWarningMessage(
          "Open a workspace before running Semantic Code workspace analysis."
        );
        return;
      }
      const workspaceFolder =
        workspaceFolders.length === 1
          ? workspaceFolders[0]
          : await vscode.window.showWorkspaceFolderPick({
              placeHolder: "Choose one workspace folder to analyze"
            });
      if (workspaceFolder === undefined) {
        return;
      }
      const configuration = vscode.workspace.getConfiguration(
        "semanticCode",
        workspaceFolder.uri
      );
      const maximumFiles = configuration.get<number>("maxWorkspaceFiles", 50);
      const discovered = await vscode.workspace.findFiles(
        new vscode.RelativePattern(
          workspaceFolder,
          "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"
        ),
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
      const model = configuration.get<string>("model", "gpt-5.4-nano");
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
      let failures = 0;
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Mapping workspace responsibilities",
            cancellable: true
          },
          async (progress, token) => {
            const abortController = new AbortController();
            activeAnalysisControllers.add(abortController);
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
                try {
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
                    false,
                    { provider, model }
                  );
                  if (outcome === undefined) {
                    skipped += 1;
                  } else {
                    mapped += 1;
                    if (outcome.cacheHit) {
                      cacheHits += 1;
                    }
                  }
                } catch (error) {
                  if (isAbortError(error)) {
                    throw error;
                  }
                  failures += 1;
                  output.warn(
                    `Workspace analysis skipped ${vscode.workspace.asRelativePath(uri, false)} after an error: ${error instanceof Error ? error.message : String(error)}`
                  );
                } finally {
                  completed += 1;
                  progress.report({ increment: 100 / uris.length });
                }
              });
            } finally {
              cancellation.dispose();
              activeAnalysisControllers.delete(abortController);
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
        `Semantic Code mapped ${mapped} file${mapped === 1 ? "" : "s"}; ${cacheHits} cache hit${cacheHits === 1 ? "" : "s"}; ${skipped} filtered; ${failures} failed.`
      );
    }),
    vscode.commands.registerCommand("semanticCode.clearAnalysis", () => {
      abortAllAnalyses();
      globalEpoch += 1;
      analyses.clear();
      focusedResponsibilities.clear();
      decorations.clearAll();
      updateStatusBars();
      vscode.window.setStatusBarMessage("Semantic Code visible analysis cleared", 1800);
    }),
    vscode.commands.registerCommand("semanticCode.clearCache", async () => {
      abortAllAnalyses();
      globalEpoch += 1;
      await cache.clear();
      analyses.clear();
      focusedResponsibilities.clear();
      decorations.clearAll();
      updateStatusBars();
      await vscode.window.showInformationMessage("Semantic Code cached analysis cleared.");
    }),
    vscode.commands.registerCommand("semanticCode.toggleVisualization", async () => {
      sessionVisible = !sessionVisible;
      applyToVisibleEditors();
      updateStatusBars();
      vscode.window.setStatusBarMessage(
        `Semantic Code responsibility map ${sessionVisible ? "shown" : "hidden"}`,
        1800
      );
    }),
    vscode.commands.registerCommand("semanticCode.focusResponsibility", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        await vscode.window.showWarningMessage(
          "Open an analyzed source file before focusing a responsibility."
        );
        return;
      }
      const analysis = currentAnalysisFor(editor.document);
      if (analysis === undefined) {
        const action = await vscode.window.showInformationMessage(
          "Analyze this file before focusing a responsibility.",
          "Analyze Now"
        );
        if (action === "Analyze Now") {
          await vscode.commands.executeCommand("semanticCode.analyzeCurrentFile");
          await vscode.commands.executeCommand("semanticCode.focusResponsibility");
        }
        return;
      }
      const minimumConfidence = vscode.workspace
        .getConfiguration("semanticCode", editor.document.uri)
        .get<number>("minimumConfidence", 0.5);
      const available = buildResponsibilitySummary(
        analysis.regions,
        analysis.result,
        minimumConfidence
      );
      const items: ResponsibilityQuickPickItem[] = [
        {
          label: "$(eye) Show all responsibilities",
          description: "Clear the active lens"
        },
        ...available.map((item) => ({
          label: RESPONSIBILITY_METADATA[item.responsibility].label,
          description: `${item.percentage}% · ${item.lineCount} colored line${item.lineCount === 1 ? "" : "s"}`,
          detail: RESPONSIBILITY_METADATA[item.responsibility].description,
          responsibility: item.responsibility
        }))
      ];
      const selected = await vscode.window.showQuickPick(items, {
        title: "Focus the responsibility map",
        placeHolder: "Show only one semantic responsibility"
      });
      if (selected === undefined) {
        return;
      }
      const uriKey = editor.document.uri.toString();
      if (selected.responsibility === undefined) {
        focusedResponsibilities.delete(uriKey);
      } else {
        focusedResponsibilities.set(uriKey, selected.responsibility);
      }
      sessionVisible = true;
      applyToVisibleEditors(editor.document.uri);
      updateStatusBars(editor);
      vscode.window.setStatusBarMessage(
        selected.responsibility === undefined
          ? "Semantic Code lens cleared"
          : `Semantic Code lens: ${RESPONSIBILITY_METADATA[selected.responsibility].label}`,
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
        const analysis = currentAnalysisFor(editor.document);
        if (analysis === undefined) {
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
        focusedResponsibilities.set(
          editor.document.uri.toString(),
          selected.responsibility
        );
        sessionVisible = true;
        applyToVisibleEditors(editor.document.uri);
        updateStatusBars(editor);
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
      updateStatusBars(editor);
      if (editor !== undefined) {
        scheduleAutomaticAnalysis(editor.document);
      } else {
        abortAllAnalyses();
      }
    }),
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      if (contentChanges.length === 0) {
        return;
      }
      const uriKey = document.uri.toString();
      runEpochs.set(uriKey, (runEpochs.get(uriKey) ?? 0) + 1);
      analyses.delete(uriKey);
      focusedResponsibilities.delete(uriKey);
      if (vscode.window.activeTextEditor?.document.uri.toString() === uriKey) {
        cancelAutomaticAnalysis();
      }
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === document.uri.toString()) {
          decorations.clear(editor);
        }
      }
      updateStatusBars();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      focusedResponsibilities.delete(document.uri.toString());
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        cancelAutomaticAnalysis();
      }
      updateStatusBars();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        scheduleAutomaticAnalysis(document);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      const classifierChanged =
        event.affectsConfiguration("semanticCode.provider") ||
        event.affectsConfiguration("semanticCode.model");
      if (classifierChanged) {
        cancelAutomaticAnalysis();
        globalEpoch += 1;
        analyses.clear();
        focusedResponsibilities.clear();
        decorations.clearAll();
      }
      if (
        event.affectsConfiguration("semanticCode.opacity") ||
        event.affectsConfiguration("semanticCode.colors")
      ) {
        decorations.reloadConfiguration();
      }
      if (event.affectsConfiguration("semanticCode")) {
        applyToVisibleEditors();
        updateStatusBars();
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
  updateStatusBars();
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
