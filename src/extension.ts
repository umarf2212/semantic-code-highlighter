import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("semanticCode.hello", async () => {
      await vscode.window.showInformationMessage(
        "Semantic Code Highlighter scaffold is active. Feature branches add the responsibility map."
      );
    })
  );
}

export function deactivate(): void {
  // VS Code disposes everything registered through the extension context.
}

