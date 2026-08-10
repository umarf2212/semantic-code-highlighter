import ts from "typescript";

import type { CodeRegion, CodeRegionType } from "../domain/code-region";

export interface RegionExtractor {
  extract(filePath: string, sourceCode: string): CodeRegion[];
}

interface RegionDescriptor {
  type: CodeRegionType;
  name?: string;
}

export class TypeScriptRegionExtractor implements RegionExtractor {
  extract(filePath: string, sourceCode: string): CodeRegion[] {
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForFile(filePath)
    );
    const regions: CodeRegion[] = [];
    const byId = new Map<string, CodeRegion>();

    const addRegion = (
      type: CodeRegionType,
      startOffset: number,
      endOffset: number,
      depth: number,
      parentId?: string,
      name?: string
    ): CodeRegion => {
      const safeStart = Math.max(0, startOffset);
      const safeEnd = Math.max(safeStart + 1, endOffset);
      const startLine = sourceFile.getLineAndCharacterOfPosition(safeStart).line;
      const endLine = sourceFile.getLineAndCharacterOfPosition(
        Math.max(safeStart, safeEnd - 1)
      ).line;
      const baseId = `region:${type}:${safeStart}:${safeEnd}`;
      let id = baseId;
      let suffix = 2;
      while (byId.has(id)) {
        id = `${baseId}:${suffix}`;
        suffix += 1;
      }

      const region: CodeRegion = {
        id,
        type,
        startLine,
        endLine,
        startOffset: safeStart,
        endOffset: safeEnd,
        source: sourceCode.slice(safeStart, safeEnd),
        depth,
        childIds: [],
        ...(name === undefined ? {} : { name }),
        ...(parentId === undefined ? {} : { parentId })
      };
      regions.push(region);
      byId.set(id, region);
      if (parentId !== undefined) {
        byId.get(parentId)?.childIds.push(id);
      }
      return region;
    };

    const imports = sourceFile.statements.filter(ts.isImportDeclaration);
    if (imports.length > 0) {
      const firstImport = imports[0];
      const lastImport = imports.at(-1);
      if (firstImport !== undefined && lastImport !== undefined) {
        addRegion(
          "imports",
          firstImport.getStart(sourceFile),
          lastImport.getEnd(),
          0,
          undefined,
          "imports"
        );
      }
    }

    const walk = (node: ts.Node, parentId?: string, depth = 0): void => {
      if (ts.isImportDeclaration(node)) {
        return;
      }

      if (ts.isIfStatement(node)) {
        const ifRegion = addRegion(
          "if",
          node.getStart(sourceFile),
          node.thenStatement.getEnd(),
          depth,
          parentId,
          "if"
        );
        walk(node.thenStatement, ifRegion.id, depth + 1);
        if (node.elseStatement !== undefined) {
          const elseRegion = addRegion(
            "else",
            node.elseStatement.getStart(sourceFile),
            node.elseStatement.getEnd(),
            depth + 1,
            ifRegion.id,
            "else"
          );
          walk(node.elseStatement, elseRegion.id, depth + 2);
        }
        return;
      }

      if (ts.isTryStatement(node)) {
        const tryRegion = addRegion(
          "try",
          node.getStart(sourceFile),
          node.tryBlock.getEnd(),
          depth,
          parentId,
          "try"
        );
        walk(node.tryBlock, tryRegion.id, depth + 1);
        if (node.catchClause !== undefined) {
          const catchRegion = addRegion(
            "catch",
            node.catchClause.getStart(sourceFile),
            node.catchClause.getEnd(),
            depth,
            parentId,
            "catch"
          );
          walk(node.catchClause.block, catchRegion.id, depth + 1);
        }
        if (node.finallyBlock !== undefined) {
          const finallyRegion = addRegion(
            "finally",
            node.finallyBlock.getStart(sourceFile),
            node.finallyBlock.getEnd(),
            depth,
            parentId,
            "finally"
          );
          walk(node.finallyBlock, finallyRegion.id, depth + 1);
        }
        return;
      }

      const descriptor = describeNode(node, sourceFile);
      let childParentId = parentId;
      let childDepth = depth;
      if (descriptor !== undefined) {
        const region = addRegion(
          descriptor.type,
          node.getStart(sourceFile),
          node.getEnd(),
          depth,
          parentId,
          descriptor.name
        );
        childParentId = region.id;
        childDepth = depth + 1;
      }

      ts.forEachChild(node, (child) => {
        walk(child, childParentId, childDepth);
      });
    };

    sourceFile.statements.forEach((statement) => {
      walk(statement);
    });

    return regions.sort(
      (left, right) =>
        left.startOffset - right.startOffset || right.endOffset - left.endOffset
    );
  }
}

function describeNode(
  node: ts.Node,
  sourceFile: ts.SourceFile
): RegionDescriptor | undefined {
  if (ts.isFunctionDeclaration(node)) {
    return { type: "function", name: node.name?.text ?? "anonymous function" };
  }
  if (
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return {
      type: "method",
      name: ts.isConstructorDeclaration(node)
        ? "constructor"
        : propertyNameText(node.name, sourceFile)
    };
  }
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return { type: "class", name: node.name?.text ?? "anonymous class" };
  }
  if (ts.isInterfaceDeclaration(node)) {
    return { type: "interface", name: node.name.text };
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return { type: "type", name: node.name.text };
  }
  if (ts.isEnumDeclaration(node)) {
    return { type: "enum", name: node.name.text };
  }
  if (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    return { type: "loop", name: ts.SyntaxKind[node.kind] };
  }
  if (ts.isSwitchStatement(node)) {
    return { type: "switch", name: "switch" };
  }
  if (ts.isCaseClause(node) || ts.isDefaultClause(node)) {
    return {
      type: "case",
      name: ts.isDefaultClause(node)
        ? "default"
        : `case ${node.expression.getText(sourceFile)}`
    };
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const assignedName = assignedFunctionName(node);
    return {
      type: isCallArgument(node) ? "callback" : "function",
      name: assignedName ?? (isCallArgument(node) ? "callback" : "anonymous function")
    };
  }
  if (isMeaningfulStatement(node)) {
    return { type: "statement", name: statementName(node, sourceFile) };
  }
  return undefined;
}

function isMeaningfulStatement(node: ts.Node): node is ts.Statement {
  if (ts.isVariableStatement(node)) {
    return !node.declarationList.declarations.some((declaration) => {
      const initializer = declaration.initializer;
      return (
        initializer !== undefined &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      );
    });
  }
  return (
    ts.isExpressionStatement(node) ||
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isBreakStatement(node) ||
    ts.isContinueStatement(node)
  );
}

function statementName(node: ts.Statement, sourceFile: ts.SourceFile): string {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map((declaration) => declaration.name.getText(sourceFile))
      .join(", ");
  }
  if (ts.isReturnStatement(node)) {
    return "return";
  }
  if (ts.isThrowStatement(node)) {
    return "throw";
  }
  if (ts.isExpressionStatement(node)) {
    const text = node.expression.getText(sourceFile).replace(/\s+/g, " ");
    return text.length > 48 ? `${text.slice(0, 45)}...` : text;
  }
  return ts.SyntaxKind[node.kind];
}

function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  return name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
}

function assignedFunctionName(
  node: ts.ArrowFunction | ts.FunctionExpression
): string | undefined {
  if (ts.isVariableDeclaration(node.parent)) {
    return node.parent.name.getText();
  }
  if (ts.isPropertyAssignment(node.parent)) {
    return node.parent.name.getText();
  }
  return ts.isFunctionExpression(node) ? node.name?.text : undefined;
}

function isCallArgument(node: ts.Node): boolean {
  return ts.isCallExpression(node.parent) && node.parent.arguments.includes(node as ts.Expression);
}

function scriptKindForFile(filePath: string): ts.ScriptKind {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (normalized.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

