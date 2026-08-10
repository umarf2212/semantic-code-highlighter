import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

import type { ProjectContext } from "../domain/project-context";

const PROJECT_INSTRUCTIONS_FILE = ".semantic-code.md";
const MAX_INSTRUCTIONS_LENGTH = 8_000;
const MAX_PACKAGE_JSON_LENGTH = 256_000;
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
        : await readBoundedText(instructionsPath, MAX_INSTRUCTIONS_LENGTH, false);
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
  let root: string;
  let directory: string;
  try {
    root = await realpath(path.resolve(workspaceRoot));
    directory = await realpath(path.dirname(path.resolve(filePath)));
  } catch {
    return undefined;
  }
  if (!isWithin(directory, root)) {
    return undefined;
  }

  while (true) {
    const candidate = path.join(directory, fileName);
    try {
      const stats = await lstat(candidate);
      if (stats.isFile() && !stats.isSymbolicLink()) {
        const resolvedCandidate = await realpath(candidate);
        if (isWithin(resolvedCandidate, root)) {
          return resolvedCandidate;
        }
      }
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
    const packageText = await readBoundedText(
      packagePath,
      MAX_PACKAGE_JSON_LENGTH,
      true
    );
    if (packageText === undefined) {
      return undefined;
    }
    const raw = JSON.parse(packageText) as PackageJsonShape;
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

async function readBoundedText(
  filePath: string,
  maximumBytes: number,
  rejectIfTruncated: boolean
): Promise<string | undefined> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maximumBytes + (rejectIfTruncated ? 1 : 0));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (rejectIfTruncated && bytesRead > maximumBytes) {
      return undefined;
    }
    return buffer.subarray(0, Math.min(bytesRead, maximumBytes)).toString("utf8");
  } finally {
    await handle.close();
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
