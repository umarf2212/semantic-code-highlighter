import * as vscode from "vscode";

import type { ClassificationResult, ClassifiedRegion } from "../domain/classification";
import type { CodeRegion } from "../domain/code-region";
import {
  confidenceLabel,
  RESPONSIBILITIES,
  RESPONSIBILITY_METADATA,
  type Responsibility
} from "../domain/responsibility";
import { colorWithOpacity } from "./color";
import { buildResponsibilitySpans } from "./line-map";
import { filterSpansForLens } from "./responsibility-lens";

const DECORATED_RESPONSIBILITIES = RESPONSIBILITIES.filter(
  (responsibility) => responsibility !== "unknown"
);

export class DecorationManager implements vscode.Disposable {
  private readonly decorationTypes = new Map<
    Responsibility,
    vscode.TextEditorDecorationType
  >();

  constructor() {
    this.createDecorationTypes();
  }

  apply(
    editor: vscode.TextEditor,
    regions: CodeRegion[],
    result: ClassificationResult,
    focusedResponsibility?: Responsibility
  ): void {
    const configuration = vscode.workspace.getConfiguration(
      "semanticCode",
      editor.document.uri
    );
    const minimumConfidence = configuration.get<number>("minimumConfidence", 0.5);
    const spans = filterSpansForLens(
      buildResponsibilitySpans(regions, result, minimumConfidence),
      focusedResponsibility
    );
    const regionById = new Map(regions.map((region) => [region.id, region]));
    const classificationById = new Map(
      result.regions.map((classified) => [classified.regionId, classified])
    );

    for (const responsibility of DECORATED_RESPONSIBILITIES) {
      const decorationType = this.decorationTypes.get(responsibility);
      if (decorationType === undefined) {
        continue;
      }
      const options: vscode.DecorationOptions[] = spans
        .filter((span) => span.responsibility === responsibility)
        .map((span) => {
          const endLine = Math.min(span.endLine, editor.document.lineCount - 1);
          const range = new vscode.Range(
            span.startLine,
            0,
            endLine,
            editor.document.lineAt(endLine).text.length
          );
          return {
            range,
            hoverMessage: hoverForRegion(
              regionById.get(span.regionId),
              classificationById.get(span.regionId),
              regionById
            )
          };
        });
      editor.setDecorations(decorationType, options);
    }
  }

  clear(editor: vscode.TextEditor): void {
    for (const decorationType of this.decorationTypes.values()) {
      editor.setDecorations(decorationType, []);
    }
  }

  clearAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.clear(editor);
    }
  }

  reloadConfiguration(): void {
    this.disposeDecorationTypes();
    this.createDecorationTypes();
  }

  dispose(): void {
    this.disposeDecorationTypes();
  }

  private createDecorationTypes(): void {
    const configuration = vscode.workspace.getConfiguration("semanticCode");
    const opacity = configuration.get<number>("opacity", 0.12);
    const colors = configuration.get<Record<string, string>>("colors", {});
    for (const responsibility of DECORATED_RESPONSIBILITIES) {
      const color = colors[responsibility] ?? RESPONSIBILITY_METADATA[responsibility].color;
      this.decorationTypes.set(
        responsibility,
        vscode.window.createTextEditorDecorationType({
          backgroundColor: colorWithOpacity(color, opacity),
          overviewRulerColor: colorWithOpacity(color, Math.min(0.65, opacity * 3)),
          overviewRulerLane: vscode.OverviewRulerLane.Right,
          isWholeLine: true,
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        })
      );
    }
  }

  private disposeDecorationTypes(): void {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
  }
}

function hoverForRegion(
  region: CodeRegion | undefined,
  classification: ClassifiedRegion | undefined,
  regionById: Map<string, CodeRegion>
): vscode.MarkdownString {
  if (region === undefined || classification === undefined) {
    return new vscode.MarkdownString("Semantic responsibility");
  }
  const metadata = RESPONSIBILITY_METADATA[classification.responsibility];
  const breadcrumb = regionBreadcrumb(region, regionById);
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.appendMarkdown(`**${metadata.label}**  \n`);
  markdown.appendMarkdown(`Confidence: ${confidenceLabel(classification.confidence)}  \n\n`);
  if (classification.explanation !== undefined) {
    markdown.appendText(classification.explanation.slice(0, 240));
    markdown.appendMarkdown("  \n\n");
  }
  markdown.appendMarkdown(`Region: \`${escapeInlineCode(breadcrumb)}\``);
  return markdown;
}

function regionBreadcrumb(region: CodeRegion, regionById: Map<string, CodeRegion>): string {
  const labels: string[] = [];
  let current: CodeRegion | undefined = region;
  while (current !== undefined) {
    labels.push(current.name ?? current.type);
    current = current.parentId === undefined ? undefined : regionById.get(current.parentId);
  }
  return labels.reverse().join(" / ");
}

function escapeInlineCode(value: string): string {
  return value.replaceAll("`", "\\`");
}
