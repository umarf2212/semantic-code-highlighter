import * as vscode from "vscode";

import { LocalHeuristicClassifier } from "./analysis/local-classifier";
import { TypeScriptRegionExtractor } from "./analysis/region-extractor";
import type {
  ClassificationResult,
  CodeClassifier
} from "./domain/classification";
import type { CodeRegion } from "./domain/code-region";
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

export function activate(context: vscode.ExtensionContext): void {
  const extractor = new TypeScriptRegionExtractor();
  const classifier: CodeClassifier = new LocalHeuristicClassifier();
  const decorations = new DecorationManager();
  const analyses = new Map<string, DocumentAnalysis>();
  let sessionVisible = true;

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
        decorations.apply(editor, analysis.regions, analysis.result);
      }
    }
  };

  const analyzeDocument = async (
    document: vscode.TextDocument,
    targetEditor?: vscode.TextEditor
  ): Promise<void> => {
    if (!SUPPORTED_LANGUAGE_IDS.has(document.languageId)) {
      await vscode.window.showWarningMessage(
        "Semantic Code Highlighter currently supports JavaScript and TypeScript files."
      );
      return;
    }

    const sourceCode = document.getText();
    const version = document.version;
    const regions = extractor.extract(document.uri.fsPath, sourceCode);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const result = await classifier.classify({
      filePath: workspaceFolder
        ? vscode.workspace.asRelativePath(document.uri, false)
        : document.uri.fsPath,
      sourceCode,
      regions,
      projectContext: {
        workspaceRoot: workspaceFolder?.uri.fsPath ?? "",
        language: document.languageId
      }
    });

    if (document.version !== version) {
      return;
    }
    analyses.set(document.uri.toString(), { version, regions, result });
    sessionVisible = true;
    if (targetEditor !== undefined) {
      decorations.apply(targetEditor, regions, result);
    }
    applyToVisibleEditors(document.uri);
  };

  context.subscriptions.push(
    decorations,
    vscode.commands.registerCommand("semanticCode.analyzeCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        await vscode.window.showWarningMessage("Open a source file before analyzing it.");
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Mapping code responsibilities",
          cancellable: false
        },
        async () => analyzeDocument(editor.document, editor)
      );
    }),
    vscode.commands.registerCommand("semanticCode.clearAnalysis", () => {
      analyses.clear();
      decorations.clearAll();
    }),
    vscode.commands.registerCommand("semanticCode.toggleVisualization", async () => {
      sessionVisible = !sessionVisible;
      applyToVisibleEditors();
      await vscode.window.setStatusBarMessage(
        `Semantic Code responsibility map ${sessionVisible ? "shown" : "hidden"}`,
        1800
      );
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
    })
  );
}

export function deactivate(): void {
  // VS Code disposes everything registered through the extension context.
}

