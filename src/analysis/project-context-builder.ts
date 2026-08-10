import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ProjectContext } from "../domain/project-context";

const PROJECT_INSTRUCTIONS_FILE = ".semantic-code.md";
const MAX_INSTRUCTIONS_LENGTH = 8_000;
const MAX_DEPENDENCIES_PER_GROUP = 120;

interface PackageJsonShape {
  name?: unknown;
  type?: unknown;
  private?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  peerDependencies?: unknown;
}

export class ProjectContextBuilder {
  async build(
    filePath: string,
    workspaceRoot: string,
    language: string
  ): Promise<ProjectContext> {
    if (workspaceRoot.length === 0) {
      return { workspaceRoot, language };
    }

    const packagePath = await findNearestFile(filePath, workspaceRoot, "package.json");
    const instructionsPath = await findNearestFile(
      filePath,
      workspaceRoot,
      PROJECT_INSTRUCTIONS_FILE
    );
    const packageInfo =
      packagePath === undefined ? undefined : await readBoundedPackageInfo(packagePath);
    const instructionText =
      instructionsPath === undefined
        ? undefined
        : (await readFile(instructionsPath, "utf8")).slice(0, MAX_INSTRUCTIONS_LENGTH);
    const projectInstructions =
      instructionText === undefined || containsCredentialMaterial(instructionText)
        ? undefined
        : instructionText;

    return {
      workspaceRoot,
      language,
      ...(packageInfo === undefined ? {} : { packageInfo }),
      ...(projectInstructions === undefined || projectInstructions.trim().length === 0
        ? {}
        : { projectInstructions })
    };
  }
}

async function findNearestFile(
  filePath: string,
  workspaceRoot: string,
  fileName: string
): Promise<string | undefined> {
  const root = path.resolve(workspaceRoot);
  let directory = path.dirname(path.resolve(filePath));
  if (!isWithin(directory, root)) {
    return undefined;
  }

  while (true) {
    const candidate = path.join(directory, fileName);
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Keep walking toward the workspace root.
    }
    if (directory === root) {
      return undefined;
    }
    const parent = path.dirname(directory);
    if (parent === directory || !isWithin(parent, root)) {
      return undefined;
    }
    directory = parent;
  }
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readBoundedPackageInfo(packagePath: string): Promise<unknown> {
  try {
    const raw = JSON.parse(await readFile(packagePath, "utf8")) as PackageJsonShape;
    return {
      ...(typeof raw.name === "string" ? { name: raw.name } : {}),
      ...(typeof raw.type === "string" ? { type: raw.type } : {}),
      ...(typeof raw.private === "boolean" ? { private: raw.private } : {}),
      dependencies: dependencyNames(raw.dependencies),
      devDependencies: dependencyNames(raw.devDependencies),
      peerDependencies: dependencyNames(raw.peerDependencies)
    };
  } catch {
    return undefined;
  }
}

function dependencyNames(value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .slice(0, MAX_DEPENDENCIES_PER_GROUP);
}

function containsCredentialMaterial(value: string): boolean {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(value) ||
    /\bsk-[A-Za-z0-9_-]{20,}\b/.test(value)
  );
}
