import * as vscode from "vscode";

import { LocalHeuristicClassifier } from "./analysis/local-classifier";
import { TypeScriptRegionExtractor } from "./analysis/region-extractor";
import type {
  ClassificationResult,
  CodeClassifier
} from "./domain/classification";
import type { CodeRegion } from "./domain/code-region";
import { OpenAIClassifier } from "./llm/openai-classifier";
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

const OPENAI_API_KEY_SECRET = "semanticCode.openaiApiKey";

export function activate(context: vscode.ExtensionContext): void {
  const extractor = new TypeScriptRegionExtractor();
  const localClassifier: CodeClassifier = new LocalHeuristicClassifier();
  const decorations = new DecorationManager();
  const analyses = new Map<string, DocumentAnalysis>();
  let sessionVisible = true;

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
    const classifier = await classifierFor(document);
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
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Mapping code responsibilities",
            cancellable: false
          },
          async () => analyzeDocument(editor.document, editor)
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Semantic Code analysis failed: ${message}`);
      }
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
    })
  );
}

export function deactivate(): void {
  // VS Code disposes everything registered through the extension context.
}
